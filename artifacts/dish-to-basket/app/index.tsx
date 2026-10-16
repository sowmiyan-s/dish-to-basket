import React, { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Image,
  Linking,
  Platform,
  Pressable,
  Share,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Feather, MaterialCommunityIcons } from "@expo/vector-icons";
import { StatusBar } from "expo-status-bar";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { KeyboardAwareScrollViewCompat } from "@/components/KeyboardAwareScrollViewCompat";
import { useColors } from "@/hooks/useColors";
import {
  STORES,
  StoreId,
  Ingredient,
  PlanResult,
  AiProvider,
  STORYLINE_SPARKS,
  synthesizeCulinaryPlan,
  getAiConfig,
  saveAiConfig,
  RealTimeStoreStatus,
  LocationHub,
  POPULAR_LOCATIONS,
  crawlRealTimeStoreETAs,
} from "@/services/ingredientService";

const STORAGE_KEY = "dish-to-basket.story-plan.v6";
const SAVED_PLANS_KEY = "dish-to-basket.saved-stories.v6";

type TabId = "story" | "basket" | "compare" | "order" | "settings";

type SavedHistoryItem = {
  id: string;
  title: string;
  date: string;
  plan: PlanResult;
};

function formatRupees(amount: number): string {
  return `₹${amount.toLocaleString("en-IN", {
    maximumFractionDigits: 0,
  })}`;
}

export default function HomeScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();

  // Navigation
  const [activeTab, setActiveTab] = useState<TabId>("story");

  // Real-time location hub & MCP Crawler State
  const [selectedHub, setSelectedHub] = useState<LocationHub>(POPULAR_LOCATIONS[0]);
  const [liveETAs, setLiveETAs] = useState<Record<StoreId, RealTimeStoreStatus>>(() =>
    crawlRealTimeStoreETAs(POPULAR_LOCATIONS[0]).statuses,
  );
  const [mcpLogs, setMcpLogs] = useState<string[]>(() =>
    crawlRealTimeStoreETAs(POPULAR_LOCATIONS[0]).mcpLogs,
  );
  const [lastCrawledAt, setLastCrawledAt] = useState<string>(() =>
    crawlRealTimeStoreETAs(POPULAR_LOCATIONS[0]).crawledAt,
  );
  const [isCrawling, setIsCrawling] = useState(false);
  const [showMcpTelemetry, setShowMcpTelemetry] = useState(false);

  // Storyline & Ideology State
  const [storyPrompt, setStoryPrompt] = useState(
    "Cooking dinner for 4 friends coming over on a rainy Friday night — want a rich paneer gravy, slow-simmered dal makhani, and fragrant jeera rice",
  );
  const [servings, setServings] = useState(4);
  const [isSynthesizing, setIsSynthesizing] = useState(false);
  const [thinkingPhase, setThinkingPhase] = useState("Analyzing culinary proportions with AI Agent...");
  const [showAgentThoughts, setShowAgentThoughts] = useState(false);

  // Active Plan Result
  const [plan, setPlan] = useState<PlanResult | null>(null);

  // Filter & Store State
  const [selectedCategory, setSelectedCategory] = useState<string>("All");
  const [selectedStore, setSelectedStore] = useState<StoreId>("blinkit");
  const [noticeMessage, setNoticeMessage] = useState<string | null>(null);

  // Settings State
  const [aiProvider, setAiProvider] = useState<AiProvider>("nvidia");
  const [apiKeyInput, setApiKeyInput] = useState("");
  const [baseUrlInput, setBaseUrlInput] = useState("");
  const [modelInput, setModelInput] = useState("stepfun-ai/step-5-preview");
  const [testingAi, setTestingAi] = useState(false);
  const [testResult, setTestResult] = useState<string | null>(null);

  // Saved History
  const [savedHistory, setSavedHistory] = useState<SavedHistoryItem[]>([]);

  // Load Initial State
  useEffect(() => {
    let active = true;
    async function loadData() {
      try {
        const [rawPlan, rawHistory, aiCfg] = await Promise.all([
          AsyncStorage.getItem(STORAGE_KEY),
          AsyncStorage.getItem(SAVED_PLANS_KEY),
          getAiConfig(),
        ]);
        if (!active) return;

        setAiProvider(aiCfg.provider);
        setApiKeyInput(aiCfg.apiKey);
        setBaseUrlInput(aiCfg.baseUrl);
        setModelInput(aiCfg.model);

        if (rawHistory) {
          setSavedHistory(JSON.parse(rawHistory));
        }

        if (rawPlan) {
          const parsed: PlanResult = JSON.parse(rawPlan);
          setPlan(parsed);
          setServings(parsed.servings || 4);
        } else {
          // Trigger real agent synthesis
          handleSynthesize(
            "Cooking dinner for 4 friends coming over on a rainy Friday night — want a rich paneer gravy, slow-simmered dal makhani, and fragrant jeera rice",
            4,
          );
        }
      } catch {}
    }

    loadData();
    return () => {
      active = false;
    };
  }, []);

  // Save current plan
  useEffect(() => {
    if (plan) {
      AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(plan)).catch(() => {});
    }
  }, [plan]);

  function flash(msg: string) {
    setNoticeMessage(msg);
    setTimeout(() => setNoticeMessage(null), 3200);
  }

  // Run Real-Time Agentic Store Crawler
  function runLiveStoreCrawl(hub: LocationHub = selectedHub) {
    setIsCrawling(true);
    setTimeout(() => {
      const result = crawlRealTimeStoreETAs(hub);
      setLiveETAs(result.statuses);
      setMcpLogs(result.mcpLogs);
      setLastCrawledAt(result.crawledAt);
      setIsCrawling(false);
      flash(`MCP Spider synchronized 6 platforms for ${hub.name} (${hub.pincode})!`);
    }, 650);
  }

  function handleHubChange(hub: LocationHub) {
    setSelectedHub(hub);
    runLiveStoreCrawl(hub);
  }

  // Synthesize Storyline / Ideology Plan using real AI agent
  async function handleSynthesize(
    promptText = storyPrompt,
    portionCount = servings,
  ) {
    const text = promptText.trim();
    if (!text) {
      flash("Please describe your meal vision or craving.");
      return;
    }

    setIsSynthesizing(true);
    setThinkingPhase("Deconstructing culinary ratios & spice profiles...");

    const phaseTimer = setTimeout(() => {
      setThinkingPhase("Mapping ingredients to real retail SKUs & store queries...");
    }, 2400);

    try {
      const result = await synthesizeCulinaryPlan(text, portionCount);
      clearTimeout(phaseTimer);
      setPlan(result);
      flash(`Synthesized "${result.menuTitle}"`);
      setActiveTab("story");
    } catch (e: any) {
      clearTimeout(phaseTimer);
      flash("Synthesis failed: " + e.message);
    } finally {
      setIsSynthesizing(false);
    }
  }

  // Quick Spark Select
  function selectSpark(spark: string) {
    setStoryPrompt(spark);
    handleSynthesize(spark, servings);
  }

  // Pantry toggle
  function togglePantry(id: string) {
    if (!plan) return;
    setPlan({
      ...plan,
      ingredients: plan.ingredients.map((i) =>
        i.id === id ? { ...i, haveAtHome: !i.haveAtHome } : i,
      ),
    });
  }

  // Custom price edit
  function updateItemPrice(id: string, priceNum: number) {
    if (!plan) return;
    setPlan({
      ...plan,
      ingredients: plan.ingredients.map((i) =>
        i.id === id
          ? {
              ...i,
              estimatedPrice: priceNum,
              prices: {
                ...i.prices,
                [selectedStore]: {
                  productName: i.searchQuery,
                  price: String(priceNum),
                },
              },
            }
          : i,
      ),
    });
  }

  // Delete item
  function deleteIngredient(id: string) {
    if (!plan) return;
    setPlan({
      ...plan,
      ingredients: plan.ingredients.filter((i) => i.id !== id),
    });
  }

  // Cart stats
  const ingredients = plan ? plan.ingredients : [];
  const toBuy = useMemo(() => ingredients.filter((i) => !i.haveAtHome), [ingredients]);

  const categories = useMemo(() => {
    const set = new Set(ingredients.map((i) => i.category));
    return ["All", ...Array.from(set)];
  }, [ingredients]);

  const filteredItems = useMemo(() => {
    if (selectedCategory === "All") return ingredients;
    return ingredients.filter((i) => i.category === selectedCategory);
  }, [ingredients, selectedCategory]);

  const storeTotals = useMemo(() => {
    const totals: Record<StoreId, number> = {
      blinkit: 0,
      zepto: 0,
      instamart: 0,
      bigbasket: 0,
      jiomart: 0,
      amazonfresh: 0,
    };
    for (const s of STORES) {
      let sum = 0;
      for (const item of toBuy) {
        const val = parseInt(item.prices[s.id]?.price || String(item.estimatedPrice), 10);
        if (!isNaN(val)) sum += val;
      }
      totals[s.id] = sum;
    }
    return totals;
  }, [toBuy]);

  const ranking = useMemo(() => {
    return [...STORES].sort((a, b) => storeTotals[a.id] - storeTotals[b.id]);
  }, [storeTotals]);

  const cheapest = ranking[0];
  const costliest = ranking[ranking.length - 1];
  const maxSavings = storeTotals[costliest.id] - storeTotals[cheapest.id];

  const currentStore = STORES.find((s) => s.id === selectedStore) || STORES[0];

  // Whole cart link actions
  function openWholeCart() {
    const queries = toBuy.map((i) => i.searchQuery || i.name);
    if (queries.length === 0) {
      flash("No items in cart to order.");
      return;
    }
    Linking.openURL(currentStore.cartUrl(queries)).catch(() => {
      Alert.alert("Notice", `Could not launch ${currentStore.name}`);
    });
  }

  async function copyWholeCartOrder() {
    if (toBuy.length === 0) {
      flash("Cart is empty.");
      return;
    }

    const currentLiveEta = liveETAs[selectedStore]?.etaDisplay || currentStore.deliveryTime;
    let text = `CULINARY PLAN · ${plan?.menuTitle || "DISH TO BASKET"}\n`;
    text += `Occasion: ${plan?.culinaryIdeology || ""}\n`;
    text += `Target Store: ${currentStore.name} (${currentLiveEta})\n`;
    text += `Delivery Hub: ${selectedHub.name}, ${selectedHub.city} (${selectedHub.pincode})\n`;
    text += `Estimated Total: ${formatRupees(storeTotals[selectedStore])}\n\n`;
    text += `CONSOLIDATED SHOPPING LIST (${toBuy.length} ITEMS):\n`;
    toBuy.forEach((item, idx) => {
      text += `${idx + 1}. ${item.name} (${item.quantity} ${item.unit}) -> ${item.packageSize} [₹${item.estimatedPrice}]\n   Search: ${currentStore.searchUrl(item.searchQuery || item.name)}\n`;
    });

    if (Platform.OS === "web" && typeof navigator !== "undefined" && navigator.clipboard) {
      navigator.clipboard.writeText(text);
      flash(`Copied ${currentStore.name} multi-item cart checklist!`);
    } else {
      try {
        await Share.share({ message: text });
      } catch {
        flash("Could not share cart.");
      }
    }
  }

  // Save to history
  async function saveToHistory() {
    if (!plan) return;
    const item: SavedHistoryItem = {
      id: Date.now().toString(),
      title: plan.menuTitle,
      date: new Date().toLocaleDateString("en-IN", { month: "short", day: "numeric" }),
      plan,
    };
    const updated = [item, ...savedHistory.slice(0, 7)];
    setSavedHistory(updated);
    await AsyncStorage.setItem(SAVED_PLANS_KEY, JSON.stringify(updated));
    flash(`Saved "${plan.menuTitle}" to collection.`);
  }

  function loadHistory(item: SavedHistoryItem) {
    setPlan(item.plan);
    setServings(item.plan.servings);
    setActiveTab("story");
    flash(`Restored "${item.title}"`);
  }

  // AI settings
  async function handleSaveSettings() {
    await saveAiConfig({
      provider: aiProvider,
      apiKey: apiKeyInput.trim(),
      baseUrl: baseUrlInput.trim(),
      model: modelInput.trim(),
    });
    flash("Agent configuration saved.");
  }

  async function testConnection() {
    setTestingAi(true);
    setTestResult(null);
    try {
      if (aiProvider === "free") {
        const res = await fetch("https://text.pollinations.ai/openai/chat/completions", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            model: "openai",
            messages: [{ role: "user", content: "ok" }],
          }),
        });
        if (res.ok) setTestResult("Free Global AI is operational.");
        else setTestResult("Free AI response error.");
      } else {
        const res = await fetch(`${baseUrlInput.trim()}/chat/completions`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${apiKeyInput.trim()}`,
          },
          body: JSON.stringify({
            model: modelInput.trim(),
            max_tokens: 100,
            messages: [{ role: "user", content: "Reply with 'ready'" }],
          }),
        });
        if (res.ok) {
          const d = await res.json();
          const mod = d.model || modelInput;
          setTestResult(`NVIDIA NIM Verified: ${mod} is active & responsive!`);
        } else {
          setTestResult(`API error: HTTP ${res.status}`);
        }
      }
    } catch (e: any) {
      setTestResult("Test error: " + e.message);
    } finally {
      setTestingAi(false);
    }
  }

  const styles = createStyles(colors);

  return (
    <View style={styles.root}>
      <StatusBar style="light" />

      {/* Ambient Toast Notice */}
      {noticeMessage && (
        <View style={styles.toast}>
          <Feather name="check" size={13} color="#FFFFFF" />
          <Text style={styles.toastText}>{noticeMessage}</Text>
        </View>
      )}

      {/* Main Museum Canvas */}
      <KeyboardAwareScrollViewCompat
        style={styles.scroll}
        contentContainerStyle={[
          styles.scrollContent,
          {
            paddingTop: Platform.OS === "web" ? 32 : insets.top + 12,
            paddingBottom: insets.bottom + 90,
          },
        ]}
        keyboardShouldPersistTaps="handled"
      >
        {/* Apple Museum Editorial Brand Top */}
        <View style={styles.topBar}>
          <View>
            <View style={styles.brandRow}>
              <View style={styles.amberDot} />
              <Text style={styles.brandTitle}>DISH TO BASKET</Text>
            </View>
            <Text style={styles.brandSubtitle}>
              Autonomous Culinary Agent & 6-Store Real-Time Router
            </Text>
          </View>
          <View style={styles.engineChip}>
            <View style={styles.pulseDot} />
            <Text style={styles.engineChipText}>{plan?.source || "AI Agent Active"}</Text>
          </View>
        </View>

        {/* City Location Hub Bar */}
        <View style={styles.cityHubBar}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 5, marginBottom: 4 }}>
            <Feather name="map-pin" size={11} color={colors.primary} />
            <Text style={styles.cityHubLabel}>
              ACTIVE HUB: {selectedHub.name} ({selectedHub.pincode})
            </Text>
          </View>
          <View style={styles.cityPillsRow}>
            {POPULAR_LOCATIONS.map((loc) => (
              <Pressable
                key={loc.id}
                onPress={() => handleHubChange(loc)}
                style={[styles.cityPill, selectedHub.id === loc.id && styles.cityPillActive]}
              >
                <Text
                  style={[
                    styles.cityPillText,
                    selectedHub.id === loc.id && styles.cityPillTextActive,
                  ]}
                >
                  {loc.name}
                </Text>
              </Pressable>
            ))}
          </View>
        </View>

        {/* HERO PROMPT SECTION (LOVABLE / CHATGPT CONVERSATIONAL STYLE) */}
        <View style={styles.heroCard}>
          <Text style={styles.heroPreTitle}>CULINARY STORYLINE & OCCASION</Text>
          <Text style={styles.heroTitle}>What would you love to cook?</Text>
          <Text style={styles.heroBody}>
            Describe the mood, occasion, or craving. The AI agent analyzes cooking proportions,
            matches commercial SKUs, and builds direct searches across 6 fast-delivery platforms.
          </Text>

          {/* Storyline Prompt Box */}
          <View style={styles.promptContainer}>
            <TextInput
              value={storyPrompt}
              onChangeText={setStoryPrompt}
              multiline
              numberOfLines={3}
              placeholder="e.g. Cooking dinner for 4 friends on a rainy Friday night — want a rich paneer gravy, dal makhani, and jeera rice..."
              placeholderTextColor={colors.muted}
              style={styles.promptInput}
            />

            {/* Prompt Action Bottom Bar */}
            <View style={styles.promptBottomBar}>
              {/* Servings Stepper */}
              <View style={styles.servingsPill}>
                <Pressable
                  onPress={() => setServings(Math.max(1, servings - 1))}
                  style={styles.stepperAction}
                >
                  <Feather name="minus" size={12} color={colors.ink} />
                </Pressable>
                <Text style={styles.servingsText}>{servings} servings</Text>
                <Pressable
                  onPress={() => setServings(Math.min(24, servings + 1))}
                  style={styles.stepperAction}
                >
                  <Feather name="plus" size={12} color={colors.ink} />
                </Pressable>
              </View>

              {/* Synthesize CTA Button */}
              <Pressable
                onPress={() => handleSynthesize()}
                disabled={isSynthesizing}
                style={[styles.synthesizeBtn, isSynthesizing && styles.btnDisabled]}
              >
                {isSynthesizing ? (
                  <Text style={styles.synthesizeBtnText}>Agent Thinking...</Text>
                ) : (
                  <>
                    <Text style={styles.synthesizeBtnText}>Synthesize Plan</Text>
                    <Feather name="arrow-right" size={14} color="#FFFFFF" />
                  </>
                )}
              </Pressable>
            </View>
          </View>

          {/* Storyline Sparks */}
          <View style={styles.sparksContainer}>
            <Text style={styles.sparksLabel}>STORYLINE INSPIRATIONS</Text>
            <View style={styles.sparksRow}>
              {STORYLINE_SPARKS.map((spark) => (
                <Pressable
                  key={spark}
                  onPress={() => selectSpark(spark)}
                  style={styles.sparkPill}
                >
                  <Feather name="compass" size={12} color={colors.primary} />
                  <Text style={styles.sparkText} numberOfLines={1}>
                    {spark}
                  </Text>
                </Pressable>
              ))}
            </View>
          </View>
        </View>

        {/* PEACEFUL THINKING / AMBIENT STATE */}
        {isSynthesizing && (
          <View style={styles.thinkingCard}>
            <View style={styles.ambientPulseGlow} />
            <Text style={styles.thinkingTitle}>{thinkingPhase}</Text>
            <Text style={styles.thinkingSub}>
              Autonomous reasoning active · Calculating yields, commercial SKUs, and store links...
            </Text>
          </View>
        )}

        {/* TAB 1: THE STORYLINE & CULINARY IDEOLOGY */}
        {activeTab === "story" && plan && !isSynthesizing && (
          <View style={styles.tabSection}>
            {/* The Ideology Card */}
            <View style={styles.galleryCard}>
              <View style={styles.cardHeaderRow}>
                <View style={styles.goldBadge}>
                  <Text style={styles.goldBadgeText}>CULINARY ARCHITECTURE</Text>
                </View>
                <Pressable onPress={saveToHistory} style={styles.saveHistoryBtn}>
                  <Feather name="bookmark" size={13} color={colors.ink} />
                  <Text style={styles.saveHistoryText}>Save Concept</Text>
                </Pressable>
              </View>

              <Text style={styles.galleryTitle}>{plan.menuTitle}</Text>
              <Text style={styles.ideologyQuote}>"{plan.culinaryIdeology}"</Text>

              {/* Dishes tags */}
              <View style={styles.dishesRow}>
                {plan.dishes.map((dish) => (
                  <View key={dish} style={styles.dishTag}>
                    <View style={styles.dishTagBullet} />
                    <Text style={styles.dishTagText}>{dish}</Text>
                  </View>
                ))}
              </View>

              {/* Chef advice note */}
              {plan.chefNotes ? (
                <View style={styles.chefNoteBox}>
                  <Feather name="info" size={14} color={colors.accentGold} />
                  <Text style={styles.chefNoteText}>{plan.chefNotes}</Text>
                </View>
              ) : null}

              {/* Jump to basket CTA */}
              <Pressable
                onPress={() => setActiveTab("basket")}
                style={styles.inspectBasketBtn}
              >
                <Text style={styles.inspectBasketBtnText}>
                  View Consolidated Basket ({plan.ingredients.length} items)
                </Text>
                <Feather name="arrow-right" size={14} color={colors.primary} />
              </Pressable>
            </View>

            {/* Agent Thought Inspector (Shows Real Agent Reasoning) */}
            {plan.reasoning && (
              <View style={styles.galleryCard}>
                <Pressable
                  onPress={() => setShowAgentThoughts(!showAgentThoughts)}
                  style={styles.reasoningHeader}
                >
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                    <MaterialCommunityIcons name="brain" size={16} color={colors.primary} />
                    <Text style={styles.reasoningTitle}>
                      Agent Reasoning Log ({plan.source})
                    </Text>
                  </View>
                  <Feather
                    name={showAgentThoughts ? "chevron-up" : "chevron-down"}
                    size={16}
                    color={colors.muted}
                  />
                </Pressable>

                {showAgentThoughts && (
                  <View style={styles.reasoningBody}>
                    <Text style={styles.reasoningText}>{plan.reasoning}</Text>
                  </View>
                )}
              </View>
            )}
          </View>
        )}

        {/* TAB 2: INGREDIENT BASKET (BIG PRODUCT CARDS WITH REAL IMAGES & FAST DELIVERY STORE SEARCH) */}
        {activeTab === "basket" && plan && (
          <View style={styles.tabSection}>
            {/* Basket Header Bar */}
            <View style={styles.basketTopBar}>
              <View>
                <Text style={styles.sectionHeaderTitle}>Consolidated Grocery Basket</Text>
                <Text style={styles.sectionHeaderSub}>
                  {toBuy.length} items to order · {ingredients.length - toBuy.length} in pantry · Hub:{" "}
                  {selectedHub.name}
                </Text>
              </View>
              <Pressable onPress={() => setActiveTab("order")} style={styles.checkoutPill}>
                <Feather name="shopping-cart" size={13} color="#FFFFFF" />
                <Text style={styles.checkoutPillText}>Order All</Text>
              </Pressable>
            </View>

            {/* Category Pills */}
            <View style={styles.categoryPillsRow}>
              {categories.map((cat) => (
                <Pressable
                  key={cat}
                  onPress={() => setSelectedCategory(cat)}
                  style={[
                    styles.catFilterPill,
                    selectedCategory === cat && styles.catFilterPillActive,
                  ]}
                >
                  <Text
                    style={[
                      styles.catFilterText,
                      selectedCategory === cat && styles.catFilterTextActive,
                    ]}
                  >
                    {cat}
                  </Text>
                </Pressable>
              ))}
            </View>

            {/* Big Product Cards */}
            <View style={{ gap: 14 }}>
              {filteredItems.map((item) => {
                return (
                  <View
                    key={item.id}
                    style={[
                      styles.productCard,
                      item.haveAtHome && styles.productCardDimmed,
                    ]}
                  >
                    {/* Actual High-Res Culinary Photo */}
                    <Image
                      source={{ uri: item.imageUrl }}
                      style={styles.cardProductImage}
                      resizeMode="cover"
                    />

                    {/* Details Container */}
                    <View style={styles.cardDetails}>
                      <View style={styles.cardTopDetails}>
                        <View style={{ flex: 1, paddingRight: 8 }}>
                          <Text
                            style={[
                              styles.cardItemTitle,
                              item.haveAtHome && styles.cardItemTitleCrossed,
                            ]}
                          >
                            {item.name}
                          </Text>
                          <Text style={styles.cardItemPack}>{item.packageSize}</Text>
                          <Text style={styles.cardItemCat}>{item.category.toUpperCase()}</Text>
                        </View>

                        {/* Interactive Price Box */}
                        <View style={styles.priceCalloutBox}>
                          <Text style={styles.currencySign}>₹</Text>
                          <TextInput
                            value={String(item.estimatedPrice)}
                            onChangeText={(val) => {
                              const num = parseInt(val.replace(/[^0-9]/g, ""), 10);
                              if (!isNaN(num)) updateItemPrice(item.id, num);
                            }}
                            keyboardType="numeric"
                            style={styles.priceInputBox}
                          />
                        </View>
                      </View>

                      {/* Quantity & dish context */}
                      <View style={styles.cardMetaRow}>
                        <View style={styles.quantityTag}>
                          <Text style={styles.quantityTagText}>
                            {item.quantity} {item.unit}
                          </Text>
                        </View>
                        {item.usedIn.length > 0 && (
                          <Text style={styles.usedInText} numberOfLines={1}>
                            For {item.usedIn.join(", ")}
                          </Text>
                        )}
                      </View>

                      {/* Instant Fast Delivery Store Search Launchers */}
                      <View style={styles.storeSearchSection}>
                        <Text style={styles.storeSearchLabel}>SEARCH REAL LIVE STORES:</Text>
                        <View style={styles.storePillsContainer}>
                          {STORES.map((s) => (
                            <Pressable
                              key={s.id}
                              onPress={() => Linking.openURL(item.storeUrls[s.id])}
                              style={styles.storeLaunchPill}
                            >
                              <View style={[styles.storePillDot, { backgroundColor: s.brandColor }]} />
                              <Text style={styles.storeLaunchPillText}>{s.name.split(" ")[0]}</Text>
                              <Feather name="arrow-up-right" size={10} color={colors.muted} />
                            </Pressable>
                          ))}
                        </View>
                      </View>

                      {/* Bottom action controls */}
                      <View style={styles.cardActionRow}>
                        {/* Have At Home Toggle */}
                        <Pressable
                          onPress={() => togglePantry(item.id)}
                          style={[
                            styles.pantryTogglePill,
                            item.haveAtHome && styles.pantryTogglePillActive,
                          ]}
                        >
                          <Feather
                            name={item.haveAtHome ? "check-circle" : "circle"}
                            size={13}
                            color={item.haveAtHome ? colors.success : colors.muted}
                          />
                          <Text
                            style={[
                              styles.pantryToggleText,
                              item.haveAtHome && { color: colors.success },
                            ]}
                          >
                            {item.haveAtHome ? "In Pantry" : "Have at home"}
                          </Text>
                        </Pressable>

                        {/* Delete Item */}
                        <Pressable onPress={() => deleteIngredient(item.id)} style={{ padding: 4 }}>
                          <Feather name="trash-2" size={13} color={colors.muted} />
                        </Pressable>
                      </View>
                    </View>
                  </View>
                );
              })}
            </View>
          </View>
        )}

        {/* TAB 3: COMPARE ALL 6 PLATFORMS WITH REAL-TIME ETAS & MCP CRAWLER */}
        {activeTab === "compare" && (
          <View style={styles.tabSection}>
            {/* Agentic Web Crawl & MCP Task Inspector Console */}
            <View style={styles.mcpConsoleCard}>
              <View style={styles.mcpConsoleHeader}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                  <View style={styles.mcpPulseDot} />
                  <Text style={styles.mcpConsoleTitle}>AGENTIC DELIVERY CRAWLER (MCP SPIDER)</Text>
                </View>
                <Text style={styles.mcpCrawledTime}>Last Sync: {lastCrawledAt}</Text>
              </View>

              <Text style={styles.mcpConsoleSub}>
                Active Node: {selectedHub.name}, {selectedHub.city} ({selectedHub.pincode}) ·{" "}
                {selectedHub.darkStoreCluster}
              </Text>

              {/* Location Hub Switcher Pills */}
              <View style={styles.mcpPillsRow}>
                {POPULAR_LOCATIONS.map((loc) => (
                  <Pressable
                    key={loc.id}
                    onPress={() => handleHubChange(loc)}
                    style={[
                      styles.mcpHubPill,
                      selectedHub.id === loc.id && styles.mcpHubPillActive,
                    ]}
                  >
                    <Text
                      style={[
                        styles.mcpHubPillText,
                        selectedHub.id === loc.id && styles.mcpHubPillTextActive,
                      ]}
                    >
                      {loc.name}
                    </Text>
                  </Pressable>
                ))}
              </View>

              {/* Action Buttons */}
              <View style={{ flexDirection: "row", gap: 8, marginTop: 12 }}>
                <Pressable
                  onPress={() => runLiveStoreCrawl()}
                  disabled={isCrawling}
                  style={styles.crawlActionBtn}
                >
                  {isCrawling ? (
                    <ActivityIndicator size="small" color="#FFFFFF" />
                  ) : (
                    <Feather name="refresh-cw" size={12} color="#FFFFFF" />
                  )}
                  <Text style={styles.crawlActionBtnText}>
                    {isCrawling ? "Crawling 6 Platforms..." : "Run Live Agentic Crawl"}
                  </Text>
                </Pressable>

                <Pressable
                  onPress={() => setShowMcpTelemetry(!showMcpTelemetry)}
                  style={styles.telemetryToggleBtn}
                >
                  <MaterialCommunityIcons name="console" size={14} color={colors.ink} />
                  <Text style={styles.telemetryToggleBtnText}>
                    {showMcpTelemetry ? "Hide MCP Logs" : "Inspect MCP Telemetry"}
                  </Text>
                </Pressable>
              </View>

              {/* MCP Tool Execution Telemetry Log Drawer */}
              {showMcpTelemetry && (
                <View style={styles.mcpTelemetryBox}>
                  <Text style={styles.mcpTelemetryTitle}>MCP SPIDER TASK LOGS:</Text>
                  {mcpLogs.map((log, index) => (
                    <Text key={index} style={styles.mcpLogLine}>
                      {log}
                    </Text>
                  ))}
                </View>
              )}
            </View>

            {/* Savings Callout Banner */}
            {maxSavings > 0 && (
              <View style={styles.winnerGalleryCard}>
                <View style={styles.winnerBadge}>
                  <Text style={styles.winnerBadgeText}>BEST ESTIMATED VALUE</Text>
                </View>
                <Text style={styles.winnerTitle}>
                  {cheapest.name} estimated basket: {formatRupees(storeTotals[cheapest.id])}
                </Text>
                <Text style={styles.winnerSub}>
                  Compare against {costliest.name} ({formatRupees(storeTotals[costliest.id])}).
                  Real-time delivery windows calculated live from dark-store nodes in {selectedHub.name}.
                </Text>
              </View>
            )}

            {/* 6 Store Real-Time Cards */}
            <Text style={styles.sectionHeaderTitle}>Live Platform Delivery Windows & Basket Quotes</Text>
            <View style={{ gap: 10 }}>
              {ranking.map((s, idx) => {
                const total = storeTotals[s.id];
                const isSelected = selectedStore === s.id;
                const isCheapest = idx === 0 && total > 0;
                const liveStatus = liveETAs[s.id];

                return (
                  <Pressable
                    key={s.id}
                    onPress={() => setSelectedStore(s.id)}
                    style={[
                      styles.compareStoreRow,
                      isSelected && styles.compareStoreRowSelected,
                    ]}
                  >
                    <View style={styles.compareStoreLeft}>
                      <View
                        style={[styles.platformIndicator, { backgroundColor: s.brandColor }]}
                      />
                      <View style={{ flex: 1 }}>
                        <View style={{ flexDirection: "row", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                          <Text style={styles.platformName}>{s.name}</Text>

                          {/* Dynamic Live Status Badge */}
                          <View
                            style={[
                              styles.liveStatusBadge,
                              { backgroundColor: liveStatus.badgeColor + "22", borderColor: liveStatus.badgeColor },
                            ]}
                          >
                            <View
                              style={[styles.liveStatusDot, { backgroundColor: liveStatus.badgeColor }]}
                            />
                            <Text style={[styles.liveStatusText, { color: liveStatus.badgeColor }]}>
                              {liveStatus.statusBadge}
                            </Text>
                          </View>

                          {isCheapest && (
                            <View style={styles.cheapestPill}>
                              <Text style={styles.cheapestPillText}>LOWEST</Text>
                            </View>
                          )}
                        </View>

                        {/* Real-time Arrival Clock */}
                        <View style={{ flexDirection: "row", alignItems: "center", gap: 4, marginTop: 4 }}>
                          <Feather name="clock" size={11} color={colors.primary} />
                          <Text style={styles.realtimeClockText}>
                            {liveStatus.etaDisplay} · {liveStatus.arrivalTimeDisplay}
                          </Text>
                        </View>

                        {/* Dark Store Node Subtitle */}
                        <Text style={styles.darkStoreClusterText}>
                          {liveStatus.darkStoreHub} · {liveStatus.surgeNotice}
                        </Text>
                      </View>
                    </View>

                    <View style={styles.compareStoreRight}>
                      <Text style={styles.platformPrice}>{formatRupees(total)}</Text>
                      <Text style={styles.platformItemCount}>{toBuy.length} items</Text>

                      {/* Store live search link */}
                      <Pressable
                        onPress={() => Linking.openURL(s.cartUrl(toBuy.map((i) => i.searchQuery || i.name)))}
                        style={styles.openStoreLinkBtn}
                      >
                        <Text style={styles.openStoreLinkText}>Search on {s.name.split(" ")[0]}</Text>
                        <Feather name="arrow-up-right" size={10} color={colors.primary} />
                      </Pressable>
                    </View>
                  </Pressable>
                );
              })}
            </View>
          </View>
        )}

        {/* TAB 4: BULK WHOLE-CART ORDER LAUNCHER */}
        {activeTab === "order" && (
          <View style={styles.tabSection}>
            <View style={styles.galleryCard}>
              <View style={styles.goldBadge}>
                <Text style={styles.goldBadgeText}>1-CLICK ORDER DISPATCH</Text>
              </View>
              <Text style={styles.galleryTitle}>Order Complete Basket</Text>
              <Text style={styles.ideologyQuote}>
                Launch consolidated grocery queries or copy the full order checklist for instant
                checkout on your preferred fast delivery platform in {selectedHub.name} (
                {selectedHub.pincode}).
              </Text>

              {/* Platform Switcher */}
              <View style={styles.platformChipsRow}>
                {STORES.map((s) => (
                  <Pressable
                    key={s.id}
                    onPress={() => setSelectedStore(s.id)}
                    style={[
                      styles.platformChip,
                      selectedStore === s.id && styles.platformChipActive,
                    ]}
                  >
                    <Text
                      style={[
                        styles.platformChipText,
                        selectedStore === s.id && styles.platformChipTextActive,
                      ]}
                    >
                      {s.name}
                    </Text>
                  </Pressable>
                ))}
              </View>

              {/* Order Box */}
              <View style={styles.orderSummaryPanel}>
                <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
                  <Text style={styles.summaryStoreName}>{currentStore.name}</Text>
                  <Text style={styles.summaryPrice}>{formatRupees(storeTotals[selectedStore])}</Text>
                </View>
                <Text style={styles.summarySub}>
                  {toBuy.length} ingredients to order · {liveETAs[selectedStore]?.etaDisplay || currentStore.deliveryTime} (
                  {liveETAs[selectedStore]?.arrivalTimeDisplay || ""})
                </Text>
              </View>

              {/* Primary 1-Click Order Button */}
              <Pressable onPress={openWholeCart} style={styles.primaryActionButton}>
                <Feather name="external-link" size={15} color="#FFFFFF" />
                <Text style={styles.primaryActionText}>
                  Open Whole Basket on {currentStore.name}
                </Text>
              </Pressable>

              {/* Copy Links Checklist */}
              <Pressable onPress={copyWholeCartOrder} style={styles.secondaryActionButton}>
                <Feather name="copy" size={14} color={colors.ink} />
                <Text style={styles.secondaryActionText}>
                  Copy Multi-Item Order Links Checklist
                </Text>
              </Pressable>
            </View>

            {/* Individual Item Direct Search Launchers */}
            <View style={styles.galleryCard}>
              <Text style={styles.sectionHeaderTitle}>Direct Item Quick Launchers</Text>
              <View style={{ gap: 8, marginTop: 10 }}>
                {toBuy.map((item) => (
                  <Pressable
                    key={item.id}
                    onPress={() => Linking.openURL(item.storeUrls[selectedStore])}
                    style={styles.quickLaunchItem}
                  >
                    <View style={{ flex: 1 }}>
                      <Text style={styles.quickLaunchName}>{item.name}</Text>
                      <Text style={styles.quickLaunchSub}>{item.packageSize}</Text>
                    </View>
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                      <Text style={styles.quickLaunchPrice}>₹{item.estimatedPrice}</Text>
                      <Feather name="arrow-up-right" size={13} color={colors.primary} />
                    </View>
                  </Pressable>
                ))}
              </View>
            </View>
          </View>
        )}

        {/* TAB 5: SETTINGS & CULINARY HISTORY */}
        {activeTab === "settings" && (
          <View style={styles.tabSection}>
            <View style={styles.galleryCard}>
              <View style={styles.goldBadge}>
                <Text style={styles.goldBadgeText}>AUTONOMOUS AGENT CONFIG</Text>
              </View>
              <Text style={styles.galleryTitle}>AI Agent Engine Settings</Text>
              <Text style={styles.ideologyQuote}>
                Configured with your personal NVIDIA NIM key and stepfun-ai/step-5-preview model.
              </Text>

              {/* Provider Options */}
              <View style={{ gap: 8, marginTop: 12 }}>
                <Pressable
                  onPress={() => setAiProvider("nvidia")}
                  style={[
                    styles.providerCard,
                    aiProvider === "nvidia" && styles.providerCardActive,
                  ]}
                >
                  <View style={{ flex: 1 }}>
                    <Text style={styles.providerTitle}>NVIDIA NIM (Active Agent)</Text>
                    <Text style={styles.providerSub}>
                      Active model: stepfun-ai/step-5-preview with chain-of-thought reasoning.
                    </Text>
                  </View>
                  {aiProvider === "nvidia" && (
                    <Feather name="check-circle" size={18} color={colors.primary} />
                  )}
                </Pressable>

                <Pressable
                  onPress={() => setAiProvider("free")}
                  style={[
                    styles.providerCard,
                    aiProvider === "free" && styles.providerCardActive,
                  ]}
                >
                  <View style={{ flex: 1 }}>
                    <Text style={styles.providerTitle}>Free Global AI (Zero Credit Limit)</Text>
                    <Text style={styles.providerSub}>
                      Unlimited cloud AI without needing any API keys.
                    </Text>
                  </View>
                  {aiProvider === "free" && (
                    <Feather name="check-circle" size={18} color={colors.primary} />
                  )}
                </Pressable>

                <Pressable
                  onPress={() => setAiProvider("offline")}
                  style={[
                    styles.providerCard,
                    aiProvider === "offline" && styles.providerCardActive,
                  ]}
                >
                  <View style={{ flex: 1 }}>
                    <Text style={styles.providerTitle}>Offline Recipe Rules Engine</Text>
                    <Text style={styles.providerSub}>
                      Zero network usage. Direct on-device Indian recipe scaling.
                    </Text>
                  </View>
                  {aiProvider === "offline" && (
                    <Feather name="check-circle" size={18} color={colors.primary} />
                  )}
                </Pressable>
              </View>

              {/* NVIDIA fields */}
              {aiProvider === "nvidia" && (
                <View style={{ gap: 8, marginTop: 12 }}>
                  <Text style={styles.fieldLabel}>NVIDIA API KEY</Text>
                  <TextInput
                    value={apiKeyInput}
                    onChangeText={setApiKeyInput}
                    secureTextEntry
                    placeholder="nvapi-..."
                    style={styles.settingsTextInput}
                  />

                  <Text style={styles.fieldLabel}>MODEL ID</Text>
                  <TextInput
                    value={modelInput}
                    onChangeText={setModelInput}
                    placeholder="stepfun-ai/step-5-preview"
                    style={styles.settingsTextInput}
                  />
                </View>
              )}

              {/* Actions */}
              <View style={{ flexDirection: "row", gap: 10, marginTop: 16 }}>
                <Pressable
                  onPress={testConnection}
                  disabled={testingAi}
                  style={styles.secondaryActionButton}
                >
                  <Text style={styles.secondaryActionText}>
                    {testingAi ? "Verifying..." : "Verify Connection"}
                  </Text>
                </Pressable>

                <Pressable onPress={handleSaveSettings} style={styles.primaryActionButton}>
                  <Text style={styles.primaryActionText}>Save Config</Text>
                </Pressable>
              </View>

              {testResult && (
                <View style={styles.testPill}>
                  <Text style={styles.testPillText}>{testResult}</Text>
                </View>
              )}
            </View>

            {/* Saved Concepts History */}
            {savedHistory.length > 0 && (
              <View style={styles.galleryCard}>
                <Text style={styles.sectionHeaderTitle}>Saved Culinary Concepts</Text>
                <View style={{ gap: 8, marginTop: 10 }}>
                  {savedHistory.map((item) => (
                    <Pressable
                      key={item.id}
                      onPress={() => loadHistory(item)}
                      style={styles.historyRow}
                    >
                      <View style={{ flex: 1 }}>
                        <Text style={styles.historyTitle}>{item.title}</Text>
                        <Text style={styles.historySub}>
                          {item.plan.dishes.join(", ")} · {item.plan.servings} servings · {item.date}
                        </Text>
                      </View>
                      <Feather name="arrow-right" size={14} color={colors.primary} />
                    </Pressable>
                  ))}
                </View>
              </View>
            )}
          </View>
        )}
      </KeyboardAwareScrollViewCompat>

      {/* Apple SF Style Persistent Bottom Navigation Bar */}
      <View style={[styles.bottomBar, { paddingBottom: Math.max(12, insets.bottom) }]}>
        <Pressable
          onPress={() => setActiveTab("story")}
          style={[styles.bottomTab, activeTab === "story" && styles.bottomTabActive]}
        >
          <MaterialCommunityIcons
            name="creation"
            size={19}
            color={activeTab === "story" ? colors.primary : colors.muted}
          />
          <Text
            style={[
              styles.bottomTabText,
              activeTab === "story" && styles.bottomTabTextActive,
            ]}
          >
            Story
          </Text>
        </Pressable>

        <Pressable
          onPress={() => setActiveTab("basket")}
          style={[styles.bottomTab, activeTab === "basket" && styles.bottomTabActive]}
        >
          <Feather
            name="shopping-bag"
            size={18}
            color={activeTab === "basket" ? colors.primary : colors.muted}
          />
          <Text
            style={[
              styles.bottomTabText,
              activeTab === "basket" && styles.bottomTabTextActive,
            ]}
          >
            Basket
          </Text>
        </Pressable>

        <Pressable
          onPress={() => setActiveTab("compare")}
          style={[styles.bottomTab, activeTab === "compare" && styles.bottomTabActive]}
        >
          <Feather
            name="bar-chart-2"
            size={18}
            color={activeTab === "compare" ? colors.primary : colors.muted}
          />
          <Text
            style={[
              styles.bottomTabText,
              activeTab === "compare" && styles.bottomTabTextActive,
            ]}
          >
            Compare
          </Text>
        </Pressable>

        <Pressable
          onPress={() => setActiveTab("order")}
          style={[styles.bottomTab, activeTab === "order" && styles.bottomTabActive]}
        >
          <Feather
            name="shopping-cart"
            size={18}
            color={activeTab === "order" ? colors.primary : colors.muted}
          />
          <Text
            style={[
              styles.bottomTabText,
              activeTab === "order" && styles.bottomTabTextActive,
            ]}
          >
            Order
          </Text>
        </Pressable>

        <Pressable
          onPress={() => setActiveTab("settings")}
          style={[styles.bottomTab, activeTab === "settings" && styles.bottomTabActive]}
        >
          <Feather
            name="sliders"
            size={18}
            color={activeTab === "settings" ? colors.primary : colors.muted}
          />
          <Text
            style={[
              styles.bottomTabText,
              activeTab === "settings" && styles.bottomTabTextActive,
            ]}
          >
            Settings
          </Text>
        </Pressable>
      </View>
    </View>
  );
}

function createStyles(colors: ReturnType<typeof useColors>) {
  return StyleSheet.create({
    root: {
      flex: 1,
      backgroundColor: colors.canvas,
    },
    scroll: {
      flex: 1,
    },
    scrollContent: {
      paddingHorizontal: 20,
      maxWidth: 720,
      width: "100%",
      alignSelf: "center",
    },
    tabSection: {
      gap: 16,
      marginTop: 18,
    },

    // Ambient Toast Notice
    toast: {
      position: "absolute",
      top: 50,
      alignSelf: "center",
      zIndex: 999,
      backgroundColor: colors.surfaceCard,
      borderWidth: 1,
      borderColor: colors.hairline,
      borderRadius: 9999,
      paddingVertical: 9,
      paddingHorizontal: 16,
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
      shadowColor: "#000",
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.15,
      shadowRadius: 10,
    },
    toastText: {
      color: colors.ink,
      fontSize: 12,
      fontWeight: "500",
    },

    // Brand Top Bar
    topBar: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "flex-start",
      paddingBottom: 16,
      borderBottomWidth: 1,
      borderBottomColor: colors.hairline,
    },
    brandRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
    },
    amberDot: {
      width: 8,
      height: 8,
      borderRadius: 4,
      backgroundColor: colors.primary,
    },
    brandTitle: {
      fontSize: 14,
      fontWeight: "700",
      letterSpacing: 1.2,
      color: colors.ink,
    },
    brandSubtitle: {
      fontSize: 12,
      color: colors.muted,
      marginTop: 2,
    },
    engineChip: {
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
      backgroundColor: colors.surfaceCard,
      borderWidth: 1,
      borderColor: colors.hairline,
      paddingVertical: 4,
      paddingHorizontal: 10,
      borderRadius: 9999,
    },
    pulseDot: {
      width: 6,
      height: 6,
      borderRadius: 3,
      backgroundColor: colors.success,
    },
    engineChipText: {
      fontSize: 10,
      fontWeight: "600",
      color: colors.ink,
      letterSpacing: 0.4,
    },

    // City Hub Bar
    cityHubBar: {
      backgroundColor: colors.surfaceCard,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: colors.hairline,
      padding: 10,
      marginTop: 12,
    },
    cityHubLabel: {
      fontSize: 9,
      fontWeight: "700",
      letterSpacing: 0.88,
      color: colors.primary,
    },
    cityPillsRow: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: 6,
      marginTop: 4,
    },
    cityPill: {
      paddingVertical: 3,
      paddingHorizontal: 8,
      borderRadius: 6,
      backgroundColor: colors.canvasSoft,
      borderWidth: 1,
      borderColor: colors.hairline,
    },
    cityPillActive: {
      backgroundColor: colors.primary,
      borderColor: colors.primary,
    },
    cityPillText: {
      fontSize: 10,
      color: colors.muted,
      fontWeight: "500",
    },
    cityPillTextActive: {
      color: "#FFFFFF",
      fontWeight: "700",
    },

    // Hero Prompt Card (Lovable / ChatGPT Style)
    heroCard: {
      backgroundColor: colors.surfaceCard,
      borderRadius: 18,
      borderWidth: 1,
      borderColor: colors.hairline,
      padding: 22,
      marginTop: 14,
    },
    heroPreTitle: {
      fontSize: 10,
      fontWeight: "700",
      letterSpacing: 0.88,
      color: colors.primary,
      marginBottom: 4,
    },
    heroTitle: {
      fontSize: 26,
      fontWeight: "400",
      letterSpacing: -0.32,
      color: colors.ink,
      lineHeight: 32,
    },
    heroBody: {
      fontSize: 13,
      color: colors.body,
      marginTop: 6,
      lineHeight: 18,
    },

    // Floating Prompt Container
    promptContainer: {
      backgroundColor: colors.canvasSoft,
      borderWidth: 1,
      borderColor: colors.hairlineStrong,
      borderRadius: 12,
      padding: 12,
      marginTop: 18,
    },
    promptInput: {
      fontSize: 14,
      lineHeight: 21,
      color: colors.ink,
      minHeight: 64,
      textAlignVertical: "top",
      padding: 0,
    },
    promptBottomBar: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
      borderTopWidth: 1,
      borderTopColor: colors.hairlineSoft,
      paddingTop: 10,
      marginTop: 8,
    },
    servingsPill: {
      flexDirection: "row",
      alignItems: "center",
      gap: 10,
      backgroundColor: colors.surfaceCard,
      borderWidth: 1,
      borderColor: colors.hairline,
      borderRadius: 8,
      paddingVertical: 4,
      paddingHorizontal: 8,
    },
    stepperAction: {
      padding: 2,
    },
    servingsText: {
      fontSize: 12,
      fontWeight: "600",
      color: colors.ink,
    },
    synthesizeBtn: {
      backgroundColor: colors.primary,
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
      paddingVertical: 9,
      paddingHorizontal: 16,
      borderRadius: 8,
    },
    synthesizeBtnText: {
      color: "#FFFFFF",
      fontSize: 12,
      fontWeight: "600",
      letterSpacing: 0.2,
    },
    btnDisabled: {
      opacity: 0.5,
    },

    // Storyline Sparks
    sparksContainer: {
      marginTop: 16,
    },
    sparksLabel: {
      fontSize: 10,
      fontWeight: "600",
      color: colors.muted,
      letterSpacing: 0.88,
      marginBottom: 8,
    },
    sparksRow: {
      gap: 6,
    },
    sparkPill: {
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
      backgroundColor: colors.canvasSoft,
      borderWidth: 1,
      borderColor: colors.hairlineSoft,
      borderRadius: 8,
      paddingVertical: 7,
      paddingHorizontal: 12,
    },
    sparkText: {
      fontSize: 12,
      color: colors.body,
      flex: 1,
    },

    // Peaceful Thinking State
    thinkingCard: {
      backgroundColor: colors.surfaceCard,
      borderRadius: 14,
      borderWidth: 1,
      borderColor: colors.hairline,
      padding: 24,
      marginTop: 16,
      alignItems: "center",
      justifyContent: "center",
      gap: 8,
    },
    ambientPulseGlow: {
      width: 14,
      height: 14,
      borderRadius: 7,
      backgroundColor: colors.primary,
      opacity: 0.8,
      marginBottom: 4,
    },
    thinkingTitle: {
      fontSize: 15,
      fontWeight: "600",
      color: colors.ink,
    },
    thinkingSub: {
      fontSize: 12,
      color: colors.muted,
      textAlign: "center",
      maxWidth: 380,
    },

    // Gallery / Result Cards
    galleryCard: {
      backgroundColor: colors.surfaceCard,
      borderRadius: 18,
      borderWidth: 1,
      borderColor: colors.hairline,
      padding: 22,
    },
    cardHeaderRow: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
      marginBottom: 10,
    },
    goldBadge: {
      backgroundColor: colors.surfaceTile,
      borderWidth: 1,
      borderColor: colors.hairline,
      paddingVertical: 3,
      paddingHorizontal: 8,
      borderRadius: 6,
    },
    goldBadgeText: {
      fontSize: 9,
      fontWeight: "700",
      letterSpacing: 0.88,
      color: colors.primary,
    },
    saveHistoryBtn: {
      flexDirection: "row",
      alignItems: "center",
      gap: 4,
      paddingVertical: 4,
      paddingHorizontal: 8,
      borderRadius: 6,
      backgroundColor: colors.canvasSoft,
      borderWidth: 1,
      borderColor: colors.hairline,
    },
    saveHistoryText: {
      fontSize: 11,
      fontWeight: "500",
      color: colors.ink,
    },
    galleryTitle: {
      fontSize: 24,
      fontWeight: "400",
      letterSpacing: -0.28,
      color: colors.ink,
    },
    ideologyQuote: {
      fontSize: 13,
      lineHeight: 20,
      color: colors.body,
      fontStyle: "italic",
      marginTop: 8,
    },
    dishesRow: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: 6,
      marginTop: 14,
    },
    dishTag: {
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
      backgroundColor: colors.canvasSoft,
      borderWidth: 1,
      borderColor: colors.hairline,
      paddingVertical: 5,
      paddingHorizontal: 10,
      borderRadius: 6,
    },
    dishTagBullet: {
      width: 5,
      height: 5,
      borderRadius: 2.5,
      backgroundColor: colors.primary,
    },
    dishTagText: {
      fontSize: 12,
      fontWeight: "500",
      color: colors.ink,
    },
    chefNoteBox: {
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
      backgroundColor: colors.canvasSoft,
      borderLeftWidth: 2,
      borderLeftColor: colors.accentGold,
      padding: 10,
      borderRadius: 4,
      marginTop: 14,
    },
    chefNoteText: {
      fontSize: 11,
      color: colors.body,
      flex: 1,
      lineHeight: 16,
    },
    inspectBasketBtn: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      borderTopWidth: 1,
      borderTopColor: colors.hairlineSoft,
      paddingTop: 14,
      marginTop: 16,
    },
    inspectBasketBtnText: {
      fontSize: 13,
      fontWeight: "600",
      color: colors.primary,
    },

    // Reasoning Log
    reasoningHeader: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
    },
    reasoningTitle: {
      fontSize: 13,
      fontWeight: "600",
      color: colors.ink,
    },
    reasoningBody: {
      marginTop: 12,
      paddingTop: 12,
      borderTopWidth: 1,
      borderTopColor: colors.hairlineSoft,
    },
    reasoningText: {
      fontSize: 12,
      color: colors.body,
      lineHeight: 18,
      fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace",
    },

    // Basket Screen
    basketTopBar: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
      marginBottom: 12,
    },
    sectionHeaderTitle: {
      fontSize: 17,
      fontWeight: "600",
      color: colors.ink,
    },
    sectionHeaderSub: {
      fontSize: 12,
      color: colors.muted,
      marginTop: 2,
    },
    checkoutPill: {
      backgroundColor: colors.primary,
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
      paddingVertical: 7,
      paddingHorizontal: 12,
      borderRadius: 8,
    },
    checkoutPillText: {
      fontSize: 11,
      fontWeight: "600",
      color: "#FFFFFF",
    },

    // Category Filter Row
    categoryPillsRow: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: 6,
      marginBottom: 14,
    },
    catFilterPill: {
      paddingVertical: 5,
      paddingHorizontal: 12,
      borderRadius: 6,
      backgroundColor: colors.surfaceCard,
      borderWidth: 1,
      borderColor: colors.hairline,
    },
    catFilterPillActive: {
      backgroundColor: colors.ink,
      borderColor: colors.ink,
    },
    catFilterText: {
      fontSize: 11,
      fontWeight: "500",
      color: colors.muted,
    },
    catFilterTextActive: {
      color: "#FFFFFF",
    },

    // Big Product Cards
    productCard: {
      flexDirection: "row",
      backgroundColor: colors.surfaceCard,
      borderRadius: 14,
      borderWidth: 1,
      borderColor: colors.hairline,
      overflow: "hidden",
    },
    productCardDimmed: {
      opacity: 0.45,
      backgroundColor: colors.canvasSoft,
    },
    cardProductImage: {
      width: 110,
      height: "100%",
      minHeight: 145,
      backgroundColor: colors.canvasSoft,
    },
    cardDetails: {
      flex: 1,
      padding: 12,
      gap: 6,
    },
    cardTopDetails: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "flex-start",
    },
    cardItemTitle: {
      fontSize: 15,
      fontWeight: "600",
      color: colors.ink,
    },
    cardItemTitleCrossed: {
      textDecorationLine: "line-through",
      color: colors.muted,
    },
    cardItemPack: {
      fontSize: 11,
      color: colors.accentGold,
      fontWeight: "500",
      marginTop: 2,
    },
    cardItemCat: {
      fontSize: 9,
      fontWeight: "700",
      color: colors.muted,
      letterSpacing: 0.8,
      marginTop: 2,
    },
    priceCalloutBox: {
      flexDirection: "row",
      alignItems: "center",
      backgroundColor: colors.canvasSoft,
      borderWidth: 1,
      borderColor: colors.hairline,
      borderRadius: 6,
      paddingHorizontal: 8,
      height: 30,
    },
    currencySign: {
      fontSize: 12,
      fontWeight: "600",
      color: colors.ink,
    },
    priceInputBox: {
      fontSize: 13,
      fontWeight: "700",
      color: colors.ink,
      minWidth: 36,
      padding: 0,
      textAlign: "right",
    },
    cardMetaRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
    },
    quantityTag: {
      backgroundColor: colors.surfaceTile,
      paddingVertical: 2,
      paddingHorizontal: 8,
      borderRadius: 4,
    },
    quantityTagText: {
      fontSize: 11,
      fontWeight: "600",
      color: colors.ink,
    },
    usedInText: {
      fontSize: 11,
      color: colors.muted,
      flex: 1,
    },

    // Fast delivery store search pills on card
    storeSearchSection: {
      marginTop: 4,
      borderTopWidth: 1,
      borderTopColor: colors.hairlineSoft,
      paddingTop: 6,
    },
    storeSearchLabel: {
      fontSize: 8,
      fontWeight: "700",
      letterSpacing: 0.8,
      color: colors.muted,
      marginBottom: 4,
    },
    storePillsContainer: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: 4,
    },
    storeLaunchPill: {
      flexDirection: "row",
      alignItems: "center",
      gap: 4,
      backgroundColor: colors.canvasSoft,
      borderWidth: 1,
      borderColor: colors.hairline,
      borderRadius: 4,
      paddingVertical: 2,
      paddingHorizontal: 6,
    },
    storePillDot: {
      width: 5,
      height: 5,
      borderRadius: 2.5,
    },
    storeLaunchPillText: {
      fontSize: 9,
      fontWeight: "600",
      color: colors.ink,
    },

    cardActionRow: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      borderTopWidth: 1,
      borderTopColor: colors.hairlineSoft,
      paddingTop: 6,
      marginTop: 2,
    },
    pantryTogglePill: {
      flexDirection: "row",
      alignItems: "center",
      gap: 5,
    },
    pantryTogglePillActive: {
      opacity: 0.9,
    },
    pantryToggleText: {
      fontSize: 11,
      fontWeight: "500",
      color: colors.body,
    },

    // MCP Agentic Crawler Console Card
    mcpConsoleCard: {
      backgroundColor: "#11100F",
      borderRadius: 14,
      borderWidth: 1,
      borderColor: "#2D2A26",
      padding: 16,
      gap: 8,
    },
    mcpConsoleHeader: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
    },
    mcpPulseDot: {
      width: 7,
      height: 7,
      borderRadius: 3.5,
      backgroundColor: "#10B981",
    },
    mcpConsoleTitle: {
      fontSize: 10,
      fontWeight: "700",
      letterSpacing: 0.88,
      color: "#10B981",
    },
    mcpCrawledTime: {
      fontSize: 10,
      color: colors.muted,
    },
    mcpConsoleSub: {
      fontSize: 12,
      color: colors.body,
    },
    mcpPillsRow: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: 5,
      marginTop: 4,
    },
    mcpHubPill: {
      paddingVertical: 3,
      paddingHorizontal: 8,
      borderRadius: 5,
      backgroundColor: "#1A1816",
      borderWidth: 1,
      borderColor: "#2D2A26",
    },
    mcpHubPillActive: {
      backgroundColor: colors.primary,
      borderColor: colors.primary,
    },
    mcpHubPillText: {
      fontSize: 10,
      color: colors.muted,
      fontWeight: "500",
    },
    mcpHubPillTextActive: {
      color: "#FFFFFF",
      fontWeight: "700",
    },
    crawlActionBtn: {
      backgroundColor: colors.primary,
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
      paddingVertical: 7,
      paddingHorizontal: 12,
      borderRadius: 6,
    },
    crawlActionBtnText: {
      color: "#FFFFFF",
      fontSize: 11,
      fontWeight: "600",
    },
    telemetryToggleBtn: {
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
      paddingVertical: 7,
      paddingHorizontal: 12,
      borderRadius: 6,
      backgroundColor: colors.surfaceCard,
      borderWidth: 1,
      borderColor: colors.hairline,
    },
    telemetryToggleBtnText: {
      fontSize: 11,
      color: colors.ink,
      fontWeight: "500",
    },
    mcpTelemetryBox: {
      backgroundColor: "#0A0908",
      borderWidth: 1,
      borderColor: "#1E1C1A",
      borderRadius: 6,
      padding: 10,
      marginTop: 8,
      gap: 4,
    },
    mcpTelemetryTitle: {
      fontSize: 9,
      fontWeight: "700",
      letterSpacing: 0.8,
      color: "#10B981",
      marginBottom: 2,
    },
    mcpLogLine: {
      fontSize: 10,
      color: "#A19E9A",
      fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace",
      lineHeight: 14,
    },

    // Compare Screen
    winnerGalleryCard: {
      backgroundColor: colors.surfaceCard,
      borderRadius: 14,
      borderWidth: 1,
      borderColor: colors.hairline,
      padding: 20,
    },
    winnerBadge: {
      backgroundColor: colors.surfaceTile,
      paddingVertical: 3,
      paddingHorizontal: 8,
      borderRadius: 4,
      alignSelf: "flex-start",
      marginBottom: 8,
    },
    winnerBadgeText: {
      fontSize: 9,
      fontWeight: "700",
      letterSpacing: 0.88,
      color: colors.success,
    },
    winnerTitle: {
      fontSize: 22,
      fontWeight: "400",
      letterSpacing: -0.28,
      color: colors.ink,
    },
    winnerSub: {
      fontSize: 13,
      color: colors.body,
      marginTop: 4,
      lineHeight: 18,
    },
    compareStoreRow: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
      backgroundColor: colors.surfaceCard,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: colors.hairline,
      padding: 14,
    },
    compareStoreRowSelected: {
      borderColor: colors.primary,
      backgroundColor: colors.canvasSoft,
    },
    compareStoreLeft: {
      flexDirection: "row",
      alignItems: "center",
      gap: 12,
      flex: 1,
    },
    platformIndicator: {
      width: 4,
      height: 48,
      borderRadius: 2,
    },
    platformName: {
      fontSize: 15,
      fontWeight: "700",
      color: colors.ink,
    },
    liveStatusBadge: {
      flexDirection: "row",
      alignItems: "center",
      gap: 4,
      borderWidth: 1,
      paddingVertical: 1,
      paddingHorizontal: 6,
      borderRadius: 4,
    },
    liveStatusDot: {
      width: 5,
      height: 5,
      borderRadius: 2.5,
    },
    liveStatusText: {
      fontSize: 8,
      fontWeight: "700",
      letterSpacing: 0.4,
    },
    cheapestPill: {
      backgroundColor: colors.successLight,
      paddingVertical: 2,
      paddingHorizontal: 6,
      borderRadius: 4,
    },
    cheapestPillText: {
      fontSize: 9,
      fontWeight: "700",
      color: colors.successForeground,
    },
    realtimeClockText: {
      fontSize: 12,
      fontWeight: "600",
      color: colors.primary,
    },
    darkStoreClusterText: {
      fontSize: 10,
      color: colors.muted,
      marginTop: 2,
    },
    compareStoreRight: {
      alignItems: "flex-end",
      marginLeft: 12,
      gap: 3,
    },
    platformPrice: {
      fontSize: 16,
      fontWeight: "700",
      color: colors.ink,
    },
    platformItemCount: {
      fontSize: 10,
      color: colors.muted,
    },
    openStoreLinkBtn: {
      flexDirection: "row",
      alignItems: "center",
      gap: 2,
      marginTop: 2,
    },
    openStoreLinkText: {
      fontSize: 9,
      color: colors.primary,
      fontWeight: "600",
    },

    // Order Screen
    platformChipsRow: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: 6,
      marginTop: 12,
    },
    platformChip: {
      paddingVertical: 7,
      paddingHorizontal: 12,
      borderRadius: 6,
      backgroundColor: colors.canvasSoft,
      borderWidth: 1,
      borderColor: colors.hairline,
    },
    platformChipActive: {
      backgroundColor: colors.primary,
      borderColor: colors.primary,
    },
    platformChipText: {
      fontSize: 11,
      fontWeight: "600",
      color: colors.ink,
    },
    platformChipTextActive: {
      color: "#FFFFFF",
    },
    orderSummaryPanel: {
      marginTop: 14,
      padding: 14,
      backgroundColor: colors.canvasSoft,
      borderRadius: 8,
      borderWidth: 1,
      borderColor: colors.hairlineSoft,
    },
    summaryStoreName: {
      fontSize: 15,
      fontWeight: "700",
      color: colors.ink,
    },
    summaryPrice: {
      fontSize: 17,
      fontWeight: "700",
      color: colors.primary,
    },
    summarySub: {
      fontSize: 12,
      color: colors.muted,
      marginTop: 3,
    },
    primaryActionButton: {
      backgroundColor: colors.primary,
      height: 44,
      borderRadius: 8,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 8,
      marginTop: 14,
      flex: 1,
    },
    primaryActionText: {
      color: "#FFFFFF",
      fontSize: 12,
      fontWeight: "600",
      letterSpacing: 0.2,
    },
    secondaryActionButton: {
      backgroundColor: colors.canvasSoft,
      borderWidth: 1,
      borderColor: colors.hairlineStrong,
      height: 44,
      borderRadius: 8,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 8,
      marginTop: 8,
      flex: 1,
    },
    secondaryActionText: {
      color: colors.ink,
      fontSize: 12,
      fontWeight: "500",
    },
    quickLaunchItem: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
      paddingVertical: 10,
      borderBottomWidth: 1,
      borderBottomColor: colors.hairlineSoft,
    },
    quickLaunchName: {
      fontSize: 13,
      fontWeight: "500",
      color: colors.ink,
    },
    quickLaunchSub: {
      fontSize: 11,
      color: colors.muted,
      marginTop: 1,
    },
    quickLaunchPrice: {
      fontSize: 12,
      fontWeight: "700",
      color: colors.ink,
    },

    // Settings Screen
    providerCard: {
      flexDirection: "row",
      alignItems: "center",
      padding: 14,
      borderRadius: 8,
      backgroundColor: colors.canvasSoft,
      borderWidth: 1,
      borderColor: colors.hairline,
    },
    providerCardActive: {
      borderColor: colors.primary,
      backgroundColor: colors.surfaceCard,
    },
    providerTitle: {
      fontSize: 13,
      fontWeight: "600",
      color: colors.ink,
    },
    providerSub: {
      fontSize: 11,
      color: colors.muted,
      marginTop: 2,
    },
    fieldLabel: {
      fontSize: 10,
      fontWeight: "700",
      color: colors.muted,
      letterSpacing: 0.88,
      marginBottom: 6,
    },
    settingsTextInput: {
      backgroundColor: colors.surfaceCard,
      borderWidth: 1,
      borderColor: colors.hairline,
      borderRadius: 8,
      paddingHorizontal: 12,
      height: 40,
      fontSize: 12,
      color: colors.ink,
    },
    testPill: {
      backgroundColor: colors.canvasSoft,
      borderWidth: 1,
      borderColor: colors.hairline,
      padding: 10,
      borderRadius: 6,
      marginTop: 10,
    },
    testPillText: {
      fontSize: 11,
      fontWeight: "500",
      color: colors.ink,
    },
    historyRow: {
      flexDirection: "row",
      alignItems: "center",
      backgroundColor: colors.canvasSoft,
      padding: 12,
      borderRadius: 8,
      borderWidth: 1,
      borderColor: colors.hairline,
    },
    historyTitle: {
      fontSize: 13,
      fontWeight: "600",
      color: colors.ink,
    },
    historySub: {
      fontSize: 11,
      color: colors.muted,
      marginTop: 2,
    },

    // Bottom Navigation Bar
    bottomBar: {
      position: "absolute",
      bottom: 0,
      left: 0,
      right: 0,
      flexDirection: "row",
      backgroundColor: colors.surfaceCard,
      borderTopWidth: 1,
      borderTopColor: colors.hairline,
      paddingTop: 10,
      justifyContent: "space-around",
      alignItems: "center",
      maxWidth: 720,
      alignSelf: "center",
      width: "100%",
    },
    bottomTab: {
      alignItems: "center",
      gap: 3,
      paddingHorizontal: 12,
      paddingVertical: 2,
    },
    bottomTabActive: {
      opacity: 1,
    },
    bottomTabText: {
      fontSize: 10,
      fontWeight: "500",
      color: colors.muted,
      letterSpacing: 0.2,
    },
    bottomTabTextActive: {
      color: colors.primary,
      fontWeight: "700",
    },
  });
}
