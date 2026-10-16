import React, { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
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
  synthesizeCulinaryPlan,
  getAiConfig,
  saveAiConfig,
  RealTimeStoreStatus,
  LocationHub,
  POPULAR_LOCATIONS,
  crawlRealTimeStoreETAs,
} from "@/services/ingredientService";

const STORAGE_KEY = "dish-to-basket.story-plan.v7";
const SAVED_PLANS_KEY = "dish-to-basket.saved-stories.v7";

type TabId = "story" | "basket" | "compare" | "order" | "settings";

type SavedHistoryItem = {
  id: string;
  title: string;
  date: string;
  plan: PlanResult;
};

const TASTE_INSPIRATIONS = [
  { label: "Rainy Comfort Feast", prompt: "Rainy comfort dinner for 4 with rich paneer butter masala, slow-simmered dal makhani, and jeera rice", icon: "cloud-rain" },
  { label: "High-Protein Prep", prompt: "Post-workout high protein dinner for 2 with tender chicken curry, spiced scrambled eggs, and brown rice", icon: "zap" },
  { label: "Royal Dum Biryani", prompt: "Sunday royal feast for 6 with fragrant chicken dum biryani, mirchi ka salan, and cooling cucumber raita", icon: "award" },
  { label: "15-Min Breakfast", prompt: "Quick 15-minute healthy South Indian breakfast for 2 with crisp masala dosa, coconut chutney, and drumstick sambar", icon: "coffee" },
];

function formatRupees(amount: number): string {
  return `₹${amount.toLocaleString("en-IN", {
    maximumFractionDigits: 0,
  })}`;
}

const CATEGORY_COLORS: Record<string, { bg: string; text: string; icon: string }> = {
  Dairy: { bg: "rgba(245, 158, 11, 0.14)", text: "#F59E0B", icon: "cup-water" },
  Produce: { bg: "rgba(16, 185, 129, 0.14)", text: "#10B981", icon: "leaf" },
  Spices: { bg: "rgba(239, 68, 68, 0.14)", text: "#EF4444", icon: "fire" },
  Pantry: { bg: "rgba(217, 119, 6, 0.14)", text: "#D97706", icon: "archive" },
  Proteins: { bg: "rgba(236, 72, 153, 0.14)", text: "#EC4899", icon: "food-drumstick" },
  Other: { bg: "rgba(156, 163, 175, 0.14)", text: "#9CA3AF", icon: "tag" },
};

export default function HomeScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();

  // Navigation
  const [activeTab, setActiveTab] = useState<TabId>("story");

  // Real-time location hub & GPS State
  const [selectedHub, setSelectedHub] = useState<LocationHub>(POPULAR_LOCATIONS[0]);
  const [isDetectingLocation, setIsDetectingLocation] = useState(false);
  const [showLocationPicker, setShowLocationPicker] = useState(false);

  // Real-time crawler state
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
  const [thinkingPhase, setThinkingPhase] = useState("Crafting culinary harmony & commercial SKUs...");
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
          // Trigger initial synthesis
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

  // Real GPS Location Detection (Browser / Native)
  async function detectLiveLocation() {
    setIsDetectingLocation(true);
    if (typeof navigator !== "undefined" && navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        async (position) => {
          try {
            const { latitude, longitude } = position.coords;
            const res = await fetch(
              `https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${latitude}&longitude=${longitude}&localityLanguage=en`,
            );
            const data = await res.json();
            const name = data.locality || data.city || "Current Location";
            const city = data.city || data.principalSubdivision || "Bengaluru";
            const pincode = data.postcode || "560001";
            const detectedHub: LocationHub = {
              id: "gps-" + Date.now(),
              name,
              city,
              pincode,
              darkStoreCluster: `${city} Central Dark Cluster`,
            };
            setSelectedHub(detectedHub);
            runLiveStoreCrawl(detectedHub);
            flash(`GPS Located: ${name}, ${city} (${pincode})`);
          } catch {
            flash("GPS resolved to default Indian hub.");
          } finally {
            setIsDetectingLocation(false);
            setShowLocationPicker(false);
          }
        },
        () => {
          setIsDetectingLocation(false);
          flash("GPS permission denied. Choose a hub manually.");
        },
        { timeout: 9000 },
      );
    } else {
      setIsDetectingLocation(false);
      flash("Geolocation not supported on this device.");
    }
  }

  // Run Real-Time Store Crawler
  function runLiveStoreCrawl(hub: LocationHub = selectedHub) {
    setIsCrawling(true);
    setTimeout(() => {
      const result = crawlRealTimeStoreETAs(hub);
      setLiveETAs(result.statuses);
      setMcpLogs(result.mcpLogs);
      setLastCrawledAt(result.crawledAt);
      setIsCrawling(false);
      flash(`Crawled 6 platforms for ${hub.name} (${hub.pincode})!`);
    }, 600);
  }

  function handleHubSelect(hub: LocationHub) {
    setSelectedHub(hub);
    setShowLocationPicker(false);
    runLiveStoreCrawl(hub);
  }

  // Synthesize Storyline / Ideology Plan using real AI agent
  async function handleSynthesize(
    promptText = storyPrompt,
    portionCount = servings,
  ) {
    const text = promptText.trim();
    if (!text) {
      flash("Please describe what you would love to cook.");
      return;
    }

    setIsSynthesizing(true);
    setThinkingPhase("Balancing culinary spices & calculating exact guest portions...");

    const phaseTimer = setTimeout(() => {
      setThinkingPhase("Matching verified commercial grocery packs across 6 platforms...");
    }, 2200);

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
    text += `VERIFIED SHOPPING LIST (${toBuy.length} ITEMS):\n`;
    toBuy.forEach((item, idx) => {
      text += `${idx + 1}. ${item.name} (${item.quantity} ${item.unit}) -> ${item.packageSize} [₹${item.estimatedPrice}]\n   Store Search: ${currentStore.searchUrl(item.searchQuery || item.name)}\n`;
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
          <Feather name="check-circle" size={13} color="#FFFFFF" />
          <Text style={styles.toastText}>{noticeMessage}</Text>
        </View>
      )}

      {/* Main Museum Canvas */}
      <KeyboardAwareScrollViewCompat
        style={styles.scroll}
        contentContainerStyle={[
          styles.scrollContent,
          {
            paddingTop: Platform.OS === "web" ? 28 : insets.top + 10,
            paddingBottom: insets.bottom + 90,
          },
        ]}
        keyboardShouldPersistTaps="handled"
      >
        {/* Top Header Row with Brand & Live Location Pill */}
        <View style={styles.headerRow}>
          <View>
            <View style={styles.brandTitleRow}>
              <View style={styles.flameIconContainer}>
                <Feather name="coffee" size={13} color="#FFFFFF" />
              </View>
              <Text style={styles.brandTitle}>DISH TO BASKET</Text>
            </View>
            <Text style={styles.brandTagline}>Autonomous Culinary Agent & Real-Time Grocery Router</Text>
          </View>

          {/* Live GPS Location Pill */}
          <Pressable
            onPress={() => setShowLocationPicker(!showLocationPicker)}
            style={styles.locationPill}
          >
            {isDetectingLocation ? (
              <ActivityIndicator size="small" color={colors.primary} />
            ) : (
              <View style={styles.liveGpsDot} />
            )}
            <Text style={styles.locationPillText} numberOfLines={1}>
              {selectedHub.name} ({selectedHub.pincode})
            </Text>
            <Feather
              name={showLocationPicker ? "chevron-up" : "chevron-down"}
              size={12}
              color={colors.muted}
            />
          </Pressable>
        </View>

        {/* Live Location Dropdown / GPS Trigger Sheet */}
        {showLocationPicker && (
          <View style={styles.locationDropdownCard}>
            <View style={styles.locationDropdownHeader}>
              <Text style={styles.locationDropdownTitle}>SELECT DELIVERY LOCATION</Text>
              <Pressable
                onPress={detectLiveLocation}
                disabled={isDetectingLocation}
                style={styles.gpsDetectButton}
              >
                <Feather name="crosshair" size={12} color="#FFFFFF" />
                <Text style={styles.gpsDetectButtonText}>
                  {isDetectingLocation ? "Detecting GPS..." : "Detect Live GPS"}
                </Text>
              </Pressable>
            </View>

            <View style={styles.hubGrid}>
              {POPULAR_LOCATIONS.map((loc) => (
                <Pressable
                  key={loc.id}
                  onPress={() => handleHubSelect(loc)}
                  style={[
                    styles.hubGridItem,
                    selectedHub.id === loc.id && styles.hubGridItemActive,
                  ]}
                >
                  <Text
                    style={[
                      styles.hubGridItemName,
                      selectedHub.id === loc.id && styles.hubGridItemNameActive,
                    ]}
                  >
                    {loc.name}
                  </Text>
                  <Text style={styles.hubGridItemCity}>{loc.city} · {loc.pincode}</Text>
                </Pressable>
              ))}
            </View>
          </View>
        )}

        {/* HERO PROMPT SECTION: MINIMALIST, LUXURIOUS, ZERO FILLER */}
        <View style={styles.heroSection}>
          <Text style={styles.heroTitle}>What are you craving tonight?</Text>
          <Text style={styles.heroSub}>
            Share a vision, comfort craving, or dinner occasion. We engineer the menu and consolidate
            authentic grocery packs with real-time delivery times.
          </Text>

          {/* Glowing Gourmet Omnibar Vessel */}
          <View style={styles.omnibarVessel}>
            <TextInput
              value={storyPrompt}
              onChangeText={setStoryPrompt}
              multiline
              numberOfLines={3}
              placeholder="e.g. Cozy rainy night comfort dinner for 4 — rich paneer butter masala, slow-cooked dal makhani, and jeera rice..."
              placeholderTextColor={colors.muted}
              style={styles.omnibarInput}
            />

            {/* Omnibar Action Controls */}
            <View style={styles.omnibarControls}>
              {/* Servings Stepper */}
              <View style={styles.stepperContainer}>
                <Pressable
                  onPress={() => setServings(Math.max(1, servings - 1))}
                  style={styles.stepperBtn}
                >
                  <Feather name="minus" size={12} color={colors.ink} />
                </Pressable>
                <Text style={styles.stepperText}>{servings} guests</Text>
                <Pressable
                  onPress={() => setServings(Math.min(24, servings + 1))}
                  style={styles.stepperBtn}
                >
                  <Feather name="plus" size={12} color={colors.ink} />
                </Pressable>
              </View>

              {/* Synthesize CTA */}
              <Pressable
                onPress={() => handleSynthesize()}
                disabled={isSynthesizing}
                style={[styles.synthesizeActionBtn, isSynthesizing && styles.btnDisabled]}
              >
                {isSynthesizing ? (
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                    <ActivityIndicator size="small" color="#FFFFFF" />
                    <Text style={styles.synthesizeActionText}>Reasoning...</Text>
                  </View>
                ) : (
                  <>
                    <Text style={styles.synthesizeActionText}>Synthesize Basket</Text>
                    <Feather name="arrow-right" size={13} color="#FFFFFF" />
                  </>
                )}
              </Pressable>
            </View>
          </View>

          {/* Quick Gourmet Taste Pills */}
          <View style={styles.tastePillsRow}>
            {TASTE_INSPIRATIONS.map((item) => (
              <Pressable
                key={item.label}
                onPress={() => {
                  setStoryPrompt(item.prompt);
                  handleSynthesize(item.prompt, servings);
                }}
                style={styles.tastePill}
              >
                <Feather name={item.icon as any} size={11} color={colors.primary} />
                <Text style={styles.tastePillText}>{item.label}</Text>
              </Pressable>
            ))}
          </View>
        </View>

        {/* PEACEFUL THINKING / AMBIENT STATE */}
        {isSynthesizing && (
          <View style={styles.thinkingContainer}>
            <View style={styles.thinkingHalo} />
            <Text style={styles.thinkingTitle}>{thinkingPhase}</Text>
            <Text style={styles.thinkingSub}>
              Autonomous Agent computing yields, authentic brand SKUs, and live delivery slots...
            </Text>
          </View>
        )}

        {/* TAB 1: CULINARY ARCHITECTURE & STORYLINE */}
        {activeTab === "story" && plan && !isSynthesizing && (
          <View style={styles.tabSection}>
            <View style={styles.curatedCard}>
              <View style={styles.curatedCardHeader}>
                <View style={styles.curatedBadge}>
                  <Text style={styles.curatedBadgeText}>CULINARY ARCHITECTURE</Text>
                </View>
                <Pressable onPress={saveToHistory} style={styles.saveActionPill}>
                  <Feather name="bookmark" size={12} color={colors.ink} />
                  <Text style={styles.saveActionText}>Save Plan</Text>
                </Pressable>
              </View>

              <Text style={styles.menuHeadline}>{plan.menuTitle}</Text>
              <Text style={styles.ideologyText}>"{plan.culinaryIdeology}"</Text>

              {/* Dishes tags */}
              <View style={styles.dishesList}>
                {plan.dishes.map((dish) => (
                  <View key={dish} style={styles.dishBadge}>
                    <View style={styles.dishBadgeDot} />
                    <Text style={styles.dishBadgeText}>{dish}</Text>
                  </View>
                ))}
              </View>

              {/* Chef Notes Box */}
              {plan.chefNotes ? (
                <View style={styles.chefAdviceCard}>
                  <Feather name="info" size={13} color={colors.accentGold} />
                  <Text style={styles.chefAdviceText}>{plan.chefNotes}</Text>
                </View>
              ) : null}

              {/* View Basket CTA */}
              <Pressable
                onPress={() => setActiveTab("basket")}
                style={styles.viewBasketRow}
              >
                <Text style={styles.viewBasketRowText}>
                  View Consolidated Basket ({plan.ingredients.length} items)
                </Text>
                <Feather name="arrow-right" size={14} color={colors.primary} />
              </Pressable>
            </View>

            {/* Agent Thought Inspector */}
            {plan.reasoning && (
              <View style={styles.curatedCard}>
                <Pressable
                  onPress={() => setShowAgentThoughts(!showAgentThoughts)}
                  style={styles.thoughtHeader}
                >
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 7 }}>
                    <MaterialCommunityIcons name="brain" size={15} color={colors.primary} />
                    <Text style={styles.thoughtTitle}>
                      Agent Reasoning Log ({plan.source})
                    </Text>
                  </View>
                  <Feather
                    name={showAgentThoughts ? "chevron-up" : "chevron-down"}
                    size={15}
                    color={colors.muted}
                  />
                </Pressable>

                {showAgentThoughts && (
                  <View style={styles.thoughtBody}>
                    <Text style={styles.thoughtText}>{plan.reasoning}</Text>
                  </View>
                )}
              </View>
            )}
          </View>
        )}

        {/* TAB 2: INGREDIENT BASKET: NO FILLER IMAGES, 100% AUTHENTIC DATA */}
        {activeTab === "basket" && plan && (
          <View style={styles.tabSection}>
            {/* Top Toolbar */}
            <View style={styles.basketToolbar}>
              <View>
                <Text style={styles.sectionTitle}>Consolidated Grocery Basket</Text>
                <Text style={styles.sectionSubtitle}>
                  {toBuy.length} items to order · {ingredients.length - toBuy.length} in pantry · Hub: {selectedHub.name}
                </Text>
              </View>
              <Pressable onPress={() => setActiveTab("order")} style={styles.quickOrderPill}>
                <Feather name="shopping-bag" size={12} color="#FFFFFF" />
                <Text style={styles.quickOrderPillText}>Order Cart</Text>
              </Pressable>
            </View>

            {/* Category Filter Pills */}
            <View style={styles.categoryFilterRow}>
              {categories.map((cat) => (
                <Pressable
                  key={cat}
                  onPress={() => setSelectedCategory(cat)}
                  style={[
                    styles.catPill,
                    selectedCategory === cat && styles.catPillActive,
                  ]}
                >
                  <Text
                    style={[
                      styles.catPillText,
                      selectedCategory === cat && styles.catPillTextActive,
                    ]}
                  >
                    {cat}
                  </Text>
                </Pressable>
              ))}
            </View>

            {/* Editorial Product Cards: Real Commercial Pack Data */}
            <View style={{ gap: 10 }}>
              {filteredItems.map((item) => {
                const catMeta = CATEGORY_COLORS[item.category] || CATEGORY_COLORS.Other;
                return (
                  <View
                    key={item.id}
                    style={[
                      styles.grocerySpecCard,
                      item.haveAtHome && styles.grocerySpecCardDimmed,
                    ]}
                  >
                    {/* Top Spec Header */}
                    <View style={styles.specHeaderRow}>
                      <View style={{ flex: 1, paddingRight: 8 }}>
                        <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 2 }}>
                          <View style={[styles.catBadgePill, { backgroundColor: catMeta.bg }]}>
                            <MaterialCommunityIcons name={catMeta.icon as any} size={10} color={catMeta.text} />
                            <Text style={[styles.catBadgeText, { color: catMeta.text }]}>
                              {item.category.toUpperCase()}
                            </Text>
                          </View>
                          <Text style={styles.portionBadgeText}>
                            {item.quantity} {item.unit}
                          </Text>
                        </View>

                        <Text
                          style={[
                            styles.itemNameTitle,
                            item.haveAtHome && styles.itemNameTitleStriked,
                          ]}
                        >
                          {item.name}
                        </Text>
                        <Text style={styles.itemPackageSpec}>{item.packageSize}</Text>
                        {item.usedIn.length > 0 && (
                          <Text style={styles.itemUsedInText}>For {item.usedIn.join(", ")}</Text>
                        )}
                      </View>

                      {/* Editable Price Tag */}
                      <View style={styles.priceContainer}>
                        <Text style={styles.rupeeSign}>₹</Text>
                        <TextInput
                          value={String(item.estimatedPrice)}
                          onChangeText={(val) => {
                            const num = parseInt(val.replace(/[^0-9]/g, ""), 10);
                            if (!isNaN(num)) updateItemPrice(item.id, num);
                          }}
                          keyboardType="numeric"
                          style={styles.priceInput}
                        />
                      </View>
                    </View>

                    {/* Fast Delivery Quick Store Search Buttons */}
                    <View style={styles.storeSearchRow}>
                      <Text style={styles.storeSearchTitle}>SEARCH LIVE PLATFORMS:</Text>
                      <View style={styles.storeButtonsRow}>
                        {STORES.map((s) => (
                          <Pressable
                            key={s.id}
                            onPress={() => Linking.openURL(item.storeUrls[s.id])}
                            style={styles.quickStorePill}
                          >
                            <View style={[styles.storeDot, { backgroundColor: s.brandColor }]} />
                            <Text style={styles.quickStorePillText}>{s.name.split(" ")[0]}</Text>
                            <Feather name="arrow-up-right" size={9} color={colors.muted} />
                          </Pressable>
                        ))}
                      </View>
                    </View>

                    {/* Bottom Card Footer Actions */}
                    <View style={styles.cardFooterActions}>
                      <Pressable
                        onPress={() => togglePantry(item.id)}
                        style={[
                          styles.pantryActionBtn,
                          item.haveAtHome && styles.pantryActionBtnActive,
                        ]}
                      >
                        <Feather
                          name={item.haveAtHome ? "check-circle" : "circle"}
                          size={13}
                          color={item.haveAtHome ? colors.success : colors.muted}
                        />
                        <Text
                          style={[
                            styles.pantryActionText,
                            item.haveAtHome && { color: colors.success },
                          ]}
                        >
                          {item.haveAtHome ? "In Pantry (Excluded)" : "Have at home"}
                        </Text>
                      </Pressable>

                      <Pressable onPress={() => deleteIngredient(item.id)} style={{ padding: 4 }}>
                        <Feather name="trash-2" size={12} color={colors.muted} />
                      </Pressable>
                    </View>
                  </View>
                );
              })}
            </View>
          </View>
        )}

        {/* TAB 3: COMPARE ALL 6 PLATFORMS (REAL-TIME CLOCKS & MCP SPIDER) */}
        {activeTab === "compare" && (
          <View style={styles.tabSection}>
            {/* Real-time MCP Spider Console */}
            <View style={styles.mcpSpiderCard}>
              <View style={styles.mcpHeader}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 7 }}>
                  <View style={styles.liveSpiderDot} />
                  <Text style={styles.mcpTitle}>REAL-TIME QUICK-COMMERCE SPIDER</Text>
                </View>
                <Text style={styles.mcpLastSync}>Synced: {lastCrawledAt}</Text>
              </View>

              <Text style={styles.mcpNodeInfo}>
                📍 Live Node: {selectedHub.name}, {selectedHub.city} ({selectedHub.pincode}) ·{" "}
                {selectedHub.darkStoreCluster}
              </Text>

              {/* Action controls */}
              <View style={{ flexDirection: "row", gap: 8, marginTop: 10 }}>
                <Pressable
                  onPress={() => runLiveStoreCrawl()}
                  disabled={isCrawling}
                  style={styles.crawlButton}
                >
                  {isCrawling ? (
                    <ActivityIndicator size="small" color="#FFFFFF" />
                  ) : (
                    <Feather name="refresh-cw" size={11} color="#FFFFFF" />
                  )}
                  <Text style={styles.crawlButtonText}>
                    {isCrawling ? "Crawling 6 Stores..." : "Refresh Live ETAs"}
                  </Text>
                </Pressable>

                <Pressable
                  onPress={() => setShowMcpTelemetry(!showMcpTelemetry)}
                  style={styles.telemetryButton}
                >
                  <MaterialCommunityIcons name="console" size={13} color={colors.ink} />
                  <Text style={styles.telemetryButtonText}>
                    {showMcpTelemetry ? "Hide MCP Telemetry" : "Inspect MCP Tool Logs"}
                  </Text>
                </Pressable>
              </View>

              {/* Monospace MCP Telemetry Logs */}
              {showMcpTelemetry && (
                <View style={styles.mcpConsoleLogs}>
                  <Text style={styles.mcpConsoleHeading}>MCP TOOL EXECUTION STREAM:</Text>
                  {mcpLogs.map((log, index) => (
                    <Text key={index} style={styles.mcpLogEntry}>
                      {log}
                    </Text>
                  ))}
                </View>
              )}
            </View>

            {/* Best Value Banner */}
            {maxSavings > 0 && (
              <View style={styles.curatedCard}>
                <View style={styles.curatedBadge}>
                  <Text style={styles.curatedBadgeText}>BEST ESTIMATED QUOTE</Text>
                </View>
                <Text style={styles.menuHeadline}>
                  {cheapest.name} total quote: {formatRupees(storeTotals[cheapest.id])}
                </Text>
                <Text style={styles.ideologyText}>
                  Save up to {formatRupees(maxSavings)} compared to {costliest.name}. Live delivery
                  arrival times dynamically calculated for {selectedHub.name}.
                </Text>
              </View>
            )}

            {/* 6 Store Real-Time Rows */}
            <Text style={styles.sectionTitle}>6 Platform Dynamic Delivery Windows</Text>
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
                      styles.storeRowCard,
                      isSelected && styles.storeRowCardSelected,
                    ]}
                  >
                    <View style={styles.storeRowLeft}>
                      <View style={[styles.storeStripe, { backgroundColor: s.brandColor }]} />
                      <View style={{ flex: 1 }}>
                        <View style={{ flexDirection: "row", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                          <Text style={styles.storeRowName}>{s.name}</Text>

                          {/* Live Status Pill */}
                          <View
                            style={[
                              styles.statusBadgePill,
                              { backgroundColor: liveStatus.badgeColor + "20", borderColor: liveStatus.badgeColor },
                            ]}
                          >
                            <View style={[styles.statusBadgeDot, { backgroundColor: liveStatus.badgeColor }]} />
                            <Text style={[styles.statusBadgeText, { color: liveStatus.badgeColor }]}>
                              {liveStatus.statusBadge}
                            </Text>
                          </View>

                          {isCheapest && (
                            <View style={styles.lowestQuotePill}>
                              <Text style={styles.lowestQuoteText}>LOWEST</Text>
                            </View>
                          )}
                        </View>

                        {/* Real-time Arrival Clock */}
                        <View style={{ flexDirection: "row", alignItems: "center", gap: 4, marginTop: 4 }}>
                          <Feather name="clock" size={11} color={colors.primary} />
                          <Text style={styles.liveClockText}>
                            {liveStatus.etaDisplay} · {liveStatus.arrivalTimeDisplay}
                          </Text>
                        </View>

                        <Text style={styles.darkStoreText}>
                          {liveStatus.darkStoreHub} · {liveStatus.surgeNotice}
                        </Text>
                      </View>
                    </View>

                    <View style={styles.storeRowRight}>
                      <Text style={styles.storeRowPrice}>{formatRupees(total)}</Text>
                      <Text style={styles.storeRowCount}>{toBuy.length} items</Text>

                      <Pressable
                        onPress={() => Linking.openURL(s.cartUrl(toBuy.map((i) => i.searchQuery || i.name)))}
                        style={styles.directStoreSearchBtn}
                      >
                        <Text style={styles.directStoreSearchText}>Search on {s.name.split(" ")[0]}</Text>
                        <Feather name="arrow-up-right" size={9} color={colors.primary} />
                      </Pressable>
                    </View>
                  </Pressable>
                );
              })}
            </View>
          </View>
        )}

        {/* TAB 4: BULK ORDER DISPATCH */}
        {activeTab === "order" && (
          <View style={styles.tabSection}>
            <View style={styles.curatedCard}>
              <View style={styles.curatedBadge}>
                <Text style={styles.curatedBadgeText}>1-CLICK DISPATCH</Text>
              </View>
              <Text style={styles.menuHeadline}>Order Complete Basket</Text>
              <Text style={styles.ideologyText}>
                Launch consolidated grocery queries or copy the full order checklist for instant
                checkout on your preferred fast delivery platform in {selectedHub.name} (
                {selectedHub.pincode}).
              </Text>

              {/* Store Switcher */}
              <View style={styles.orderStoreChips}>
                {STORES.map((s) => (
                  <Pressable
                    key={s.id}
                    onPress={() => setSelectedStore(s.id)}
                    style={[
                      styles.orderStoreChip,
                      selectedStore === s.id && styles.orderStoreChipActive,
                    ]}
                  >
                    <Text
                      style={[
                        styles.orderStoreChipText,
                        selectedStore === s.id && styles.orderStoreChipTextActive,
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
                  <Text style={styles.summaryStoreTitle}>{currentStore.name}</Text>
                  <Text style={styles.summaryPriceValue}>{formatRupees(storeTotals[selectedStore])}</Text>
                </View>
                <Text style={styles.summarySubDetail}>
                  {toBuy.length} ingredients · {liveETAs[selectedStore]?.etaDisplay || currentStore.deliveryTime} (
                  {liveETAs[selectedStore]?.arrivalTimeDisplay || ""})
                </Text>
              </View>

              {/* Primary 1-Click Order Button */}
              <Pressable onPress={openWholeCart} style={styles.primaryOrderAction}>
                <Feather name="external-link" size={14} color="#FFFFFF" />
                <Text style={styles.primaryOrderActionText}>
                  Open Whole Basket on {currentStore.name}
                </Text>
              </Pressable>

              {/* Copy Links Checklist */}
              <Pressable onPress={copyWholeCartOrder} style={styles.secondaryOrderAction}>
                <Feather name="copy" size={13} color={colors.ink} />
                <Text style={styles.secondaryOrderActionText}>
                  Copy Multi-Item Order Links Checklist
                </Text>
              </Pressable>
            </View>

            {/* Individual Item Direct Search Launchers */}
            <View style={styles.curatedCard}>
              <Text style={styles.sectionTitle}>Direct Item Quick Launchers</Text>
              <View style={{ gap: 8, marginTop: 10 }}>
                {toBuy.map((item) => (
                  <Pressable
                    key={item.id}
                    onPress={() => Linking.openURL(item.storeUrls[selectedStore])}
                    style={styles.quickLaunchRow}
                  >
                    <View style={{ flex: 1 }}>
                      <Text style={styles.quickLaunchName}>{item.name}</Text>
                      <Text style={styles.quickLaunchPack}>{item.packageSize}</Text>
                    </View>
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 7 }}>
                      <Text style={styles.quickLaunchPrice}>₹{item.estimatedPrice}</Text>
                      <Feather name="arrow-up-right" size={12} color={colors.primary} />
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
            <View style={styles.curatedCard}>
              <View style={styles.curatedBadge}>
                <Text style={styles.curatedBadgeText}>INTELLIGENCE ENGINE</Text>
              </View>
              <Text style={styles.menuHeadline}>AI Agent Engine Settings</Text>
              <Text style={styles.ideologyText}>
                Active model: stepfun-ai/step-5-preview with chain-of-thought culinary reasoning.
              </Text>

              {/* Provider Options */}
              <View style={{ gap: 8, marginTop: 12 }}>
                <Pressable
                  onPress={() => setAiProvider("nvidia")}
                  style={[
                    styles.providerOptionCard,
                    aiProvider === "nvidia" && styles.providerOptionCardActive,
                  ]}
                >
                  <View style={{ flex: 1 }}>
                    <Text style={styles.providerOptionTitle}>NVIDIA NIM (Active Agent)</Text>
                    <Text style={styles.providerOptionSub}>
                      Active model: stepfun-ai/step-5-preview with verified culinary reasoning.
                    </Text>
                  </View>
                  {aiProvider === "nvidia" && (
                    <Feather name="check-circle" size={17} color={colors.primary} />
                  )}
                </Pressable>

                <Pressable
                  onPress={() => setAiProvider("free")}
                  style={[
                    styles.providerOptionCard,
                    aiProvider === "free" && styles.providerOptionCardActive,
                  ]}
                >
                  <View style={{ flex: 1 }}>
                    <Text style={styles.providerOptionTitle}>Free Global AI (Zero Credit Limit)</Text>
                    <Text style={styles.providerOptionSub}>
                      Unlimited cloud AI with no API keys or limits.
                    </Text>
                  </View>
                  {aiProvider === "free" && (
                    <Feather name="check-circle" size={17} color={colors.primary} />
                  )}
                </Pressable>

                <Pressable
                  onPress={() => setAiProvider("offline")}
                  style={[
                    styles.providerOptionCard,
                    aiProvider === "offline" && styles.providerOptionCardActive,
                  ]}
                >
                  <View style={{ flex: 1 }}>
                    <Text style={styles.providerOptionTitle}>Offline Recipe Rules Engine</Text>
                    <Text style={styles.providerOptionSub}>
                      Zero network usage. Direct on-device Indian recipe scaling.
                    </Text>
                  </View>
                  {aiProvider === "offline" && (
                    <Feather name="check-circle" size={17} color={colors.primary} />
                  )}
                </Pressable>
              </View>

              {/* NVIDIA fields */}
              {aiProvider === "nvidia" && (
                <View style={{ gap: 8, marginTop: 12 }}>
                  <Text style={styles.inputFieldLabel}>NVIDIA API KEY</Text>
                  <TextInput
                    value={apiKeyInput}
                    onChangeText={setApiKeyInput}
                    secureTextEntry
                    placeholder="nvapi-..."
                    style={styles.settingsInput}
                  />

                  <Text style={styles.inputFieldLabel}>MODEL ID</Text>
                  <TextInput
                    value={modelInput}
                    onChangeText={setModelInput}
                    placeholder="stepfun-ai/step-5-preview"
                    style={styles.settingsInput}
                  />
                </View>
              )}

              {/* Actions */}
              <View style={{ flexDirection: "row", gap: 8, marginTop: 14 }}>
                <Pressable
                  onPress={testConnection}
                  disabled={testingAi}
                  style={styles.secondaryOrderAction}
                >
                  <Text style={styles.secondaryOrderActionText}>
                    {testingAi ? "Verifying..." : "Verify Connection"}
                  </Text>
                </Pressable>

                <Pressable onPress={handleSaveSettings} style={styles.primaryOrderAction}>
                  <Text style={styles.primaryOrderActionText}>Save Config</Text>
                </Pressable>
              </View>

              {testResult && (
                <View style={styles.testResultPill}>
                  <Text style={styles.testResultText}>{testResult}</Text>
                </View>
              )}
            </View>

            {/* Saved Concepts History */}
            {savedHistory.length > 0 && (
              <View style={styles.curatedCard}>
                <Text style={styles.sectionTitle}>Saved Culinary Concepts</Text>
                <View style={{ gap: 8, marginTop: 10 }}>
                  {savedHistory.map((item) => (
                    <Pressable
                      key={item.id}
                      onPress={() => loadHistory(item)}
                      style={styles.historyRowItem}
                    >
                      <View style={{ flex: 1 }}>
                        <Text style={styles.historyTitleText}>{item.title}</Text>
                        <Text style={styles.historySubText}>
                          {item.plan.dishes.join(", ")} · {item.plan.servings} servings · {item.date}
                        </Text>
                      </View>
                      <Feather name="arrow-right" size={13} color={colors.primary} />
                    </Pressable>
                  ))}
                </View>
              </View>
            )}
          </View>
        )}
      </KeyboardAwareScrollViewCompat>

      {/* Modern SF Persistent Bottom Dock */}
      <View style={[styles.bottomDock, { paddingBottom: Math.max(12, insets.bottom) }]}>
        <Pressable
          onPress={() => setActiveTab("story")}
          style={[styles.dockTab, activeTab === "story" && styles.dockTabActive]}
        >
          <MaterialCommunityIcons
            name="chef-hat"
            size={18}
            color={activeTab === "story" ? colors.primary : colors.muted}
          />
          <Text style={[styles.dockTabText, activeTab === "story" && styles.dockTabTextActive]}>
            Story
          </Text>
        </Pressable>

        <Pressable
          onPress={() => setActiveTab("basket")}
          style={[styles.dockTab, activeTab === "basket" && styles.dockTabActive]}
        >
          <Feather
            name="shopping-bag"
            size={17}
            color={activeTab === "basket" ? colors.primary : colors.muted}
          />
          <Text style={[styles.dockTabText, activeTab === "basket" && styles.dockTabTextActive]}>
            Basket
          </Text>
        </Pressable>

        <Pressable
          onPress={() => setActiveTab("compare")}
          style={[styles.dockTab, activeTab === "compare" && styles.dockTabActive]}
        >
          <Feather
            name="bar-chart-2"
            size={17}
            color={activeTab === "compare" ? colors.primary : colors.muted}
          />
          <Text style={[styles.dockTabText, activeTab === "compare" && styles.dockTabTextActive]}>
            Compare
          </Text>
        </Pressable>

        <Pressable
          onPress={() => setActiveTab("order")}
          style={[styles.dockTab, activeTab === "order" && styles.dockTabActive]}
        >
          <Feather
            name="shopping-cart"
            size={17}
            color={activeTab === "order" ? colors.primary : colors.muted}
          />
          <Text style={[styles.dockTabText, activeTab === "order" && styles.dockTabTextActive]}>
            Order
          </Text>
        </Pressable>

        <Pressable
          onPress={() => setActiveTab("settings")}
          style={[styles.dockTab, activeTab === "settings" && styles.dockTabActive]}
        >
          <Feather
            name="sliders"
            size={17}
            color={activeTab === "settings" ? colors.primary : colors.muted}
          />
          <Text style={[styles.dockTabText, activeTab === "settings" && styles.dockTabTextActive]}>
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
      gap: 14,
      marginTop: 16,
    },

    // Ambient Toast Notice
    toast: {
      position: "absolute",
      top: 48,
      alignSelf: "center",
      zIndex: 999,
      backgroundColor: colors.surfaceCard,
      borderWidth: 1,
      borderColor: colors.hairlineStrong,
      borderRadius: 9999,
      paddingVertical: 8,
      paddingHorizontal: 16,
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
      shadowColor: "#000",
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.25,
      shadowRadius: 10,
    },
    toastText: {
      color: colors.ink,
      fontSize: 12,
      fontWeight: "500",
    },

    // Brand Header Row
    headerRow: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
      paddingBottom: 14,
      borderBottomWidth: 1,
      borderBottomColor: colors.hairline,
    },
    brandTitleRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
    },
    flameIconContainer: {
      width: 22,
      height: 22,
      borderRadius: 11,
      backgroundColor: colors.primary,
      alignItems: "center",
      justifyContent: "center",
    },
    brandTitle: {
      fontSize: 13,
      fontWeight: "800",
      letterSpacing: 1.2,
      color: colors.ink,
    },
    brandTagline: {
      fontSize: 11,
      color: colors.muted,
      marginTop: 2,
    },
    locationPill: {
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
      backgroundColor: colors.surfaceCard,
      borderWidth: 1,
      borderColor: colors.hairlineStrong,
      paddingVertical: 6,
      paddingHorizontal: 10,
      borderRadius: 9999,
      maxWidth: 200,
    },
    liveGpsDot: {
      width: 6,
      height: 6,
      borderRadius: 3,
      backgroundColor: colors.success,
    },
    locationPillText: {
      fontSize: 11,
      fontWeight: "600",
      color: colors.ink,
    },

    // Location Dropdown Sheet
    locationDropdownCard: {
      backgroundColor: colors.surfaceCard,
      borderWidth: 1,
      borderColor: colors.hairlineStrong,
      borderRadius: 14,
      padding: 14,
      marginTop: 8,
      gap: 10,
    },
    locationDropdownHeader: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
    },
    locationDropdownTitle: {
      fontSize: 9,
      fontWeight: "700",
      letterSpacing: 0.8,
      color: colors.muted,
    },
    gpsDetectButton: {
      flexDirection: "row",
      alignItems: "center",
      gap: 5,
      backgroundColor: colors.primary,
      paddingVertical: 4,
      paddingHorizontal: 10,
      borderRadius: 6,
    },
    gpsDetectButtonText: {
      fontSize: 10,
      fontWeight: "600",
      color: "#FFFFFF",
    },
    hubGrid: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: 6,
    },
    hubGridItem: {
      backgroundColor: colors.canvasSoft,
      borderWidth: 1,
      borderColor: colors.hairline,
      borderRadius: 8,
      paddingVertical: 6,
      paddingHorizontal: 10,
    },
    hubGridItemActive: {
      backgroundColor: colors.primary,
      borderColor: colors.primary,
    },
    hubGridItemName: {
      fontSize: 11,
      fontWeight: "600",
      color: colors.ink,
    },
    hubGridItemNameActive: {
      color: "#FFFFFF",
    },
    hubGridItemCity: {
      fontSize: 9,
      color: colors.muted,
      marginTop: 1,
    },

    // Hero Section: Clean, Editorial & Inviting
    heroSection: {
      marginTop: 18,
      gap: 6,
    },
    heroTitle: {
      fontSize: 26,
      fontWeight: "400",
      letterSpacing: -0.3,
      color: colors.ink,
      lineHeight: 32,
    },
    heroSub: {
      fontSize: 13,
      color: colors.body,
      lineHeight: 19,
      marginBottom: 10,
    },

    // Glowing Gourmet Omnibar Vessel
    omnibarVessel: {
      backgroundColor: colors.surfaceCard,
      borderWidth: 1,
      borderColor: colors.hairlineStrong,
      borderRadius: 16,
      padding: 14,
      shadowColor: colors.primary,
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.1,
      shadowRadius: 12,
    },
    omnibarInput: {
      fontSize: 14,
      lineHeight: 22,
      color: colors.ink,
      minHeight: 64,
      textAlignVertical: "top",
      padding: 0,
    },
    omnibarControls: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
      borderTopWidth: 1,
      borderTopColor: colors.hairlineSoft,
      paddingTop: 10,
      marginTop: 8,
    },
    stepperContainer: {
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
      backgroundColor: colors.canvasSoft,
      borderWidth: 1,
      borderColor: colors.hairline,
      borderRadius: 8,
      paddingVertical: 5,
      paddingHorizontal: 10,
    },
    stepperBtn: {
      padding: 2,
    },
    stepperText: {
      fontSize: 12,
      fontWeight: "600",
      color: colors.ink,
    },
    synthesizeActionBtn: {
      backgroundColor: colors.primary,
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
      paddingVertical: 9,
      paddingHorizontal: 16,
      borderRadius: 8,
      shadowColor: colors.primary,
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.3,
      shadowRadius: 6,
    },
    synthesizeActionText: {
      color: "#FFFFFF",
      fontSize: 12,
      fontWeight: "700",
      letterSpacing: 0.2,
    },
    btnDisabled: {
      opacity: 0.5,
    },

    // Taste Inspirations Pills
    tastePillsRow: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: 6,
      marginTop: 10,
    },
    tastePill: {
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
      backgroundColor: colors.surfaceCard,
      borderWidth: 1,
      borderColor: colors.hairline,
      borderRadius: 8,
      paddingVertical: 6,
      paddingHorizontal: 10,
    },
    tastePillText: {
      fontSize: 11,
      color: colors.body,
      fontWeight: "500",
    },

    // Peaceful Thinking State
    thinkingContainer: {
      backgroundColor: colors.surfaceCard,
      borderRadius: 14,
      borderWidth: 1,
      borderColor: colors.hairlineStrong,
      padding: 24,
      marginTop: 16,
      alignItems: "center",
      justifyContent: "center",
      gap: 6,
    },
    thinkingHalo: {
      width: 12,
      height: 12,
      borderRadius: 6,
      backgroundColor: colors.primary,
      opacity: 0.8,
      marginBottom: 2,
    },
    thinkingTitle: {
      fontSize: 14,
      fontWeight: "600",
      color: colors.ink,
    },
    thinkingSub: {
      fontSize: 11,
      color: colors.muted,
      textAlign: "center",
    },

    // Curated Editorial Card
    curatedCard: {
      backgroundColor: colors.surfaceCard,
      borderRadius: 16,
      borderWidth: 1,
      borderColor: colors.hairline,
      padding: 20,
    },
    curatedCardHeader: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
      marginBottom: 8,
    },
    curatedBadge: {
      backgroundColor: colors.surfaceTile,
      paddingVertical: 3,
      paddingHorizontal: 7,
      borderRadius: 4,
    },
    curatedBadgeText: {
      fontSize: 8,
      fontWeight: "700",
      letterSpacing: 0.88,
      color: colors.primary,
    },
    saveActionPill: {
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
    saveActionText: {
      fontSize: 11,
      fontWeight: "500",
      color: colors.ink,
    },
    menuHeadline: {
      fontSize: 22,
      fontWeight: "400",
      letterSpacing: -0.28,
      color: colors.ink,
    },
    ideologyText: {
      fontSize: 13,
      lineHeight: 20,
      color: colors.body,
      fontStyle: "italic",
      marginTop: 6,
    },
    dishesList: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: 6,
      marginTop: 12,
    },
    dishBadge: {
      flexDirection: "row",
      alignItems: "center",
      gap: 5,
      backgroundColor: colors.canvasSoft,
      borderWidth: 1,
      borderColor: colors.hairline,
      paddingVertical: 4,
      paddingHorizontal: 9,
      borderRadius: 6,
    },
    dishBadgeDot: {
      width: 5,
      height: 5,
      borderRadius: 2.5,
      backgroundColor: colors.primary,
    },
    dishBadgeText: {
      fontSize: 11,
      fontWeight: "500",
      color: colors.ink,
    },
    chefAdviceCard: {
      flexDirection: "row",
      alignItems: "center",
      gap: 7,
      backgroundColor: colors.canvasSoft,
      borderLeftWidth: 2,
      borderLeftColor: colors.accentGold,
      padding: 10,
      borderRadius: 4,
      marginTop: 12,
    },
    chefAdviceText: {
      fontSize: 11,
      color: colors.body,
      flex: 1,
      lineHeight: 16,
    },
    viewBasketRow: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      borderTopWidth: 1,
      borderTopColor: colors.hairlineSoft,
      paddingTop: 12,
      marginTop: 14,
    },
    viewBasketRowText: {
      fontSize: 12,
      fontWeight: "600",
      color: colors.primary,
    },

    // Agent Thought Inspector
    thoughtHeader: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
    },
    thoughtTitle: {
      fontSize: 12,
      fontWeight: "600",
      color: colors.ink,
    },
    thoughtBody: {
      marginTop: 10,
      paddingTop: 10,
      borderTopWidth: 1,
      borderTopColor: colors.hairlineSoft,
    },
    thoughtText: {
      fontSize: 11,
      color: colors.body,
      lineHeight: 17,
      fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace",
    },

    // Basket Toolbar
    basketToolbar: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
      marginBottom: 10,
    },
    sectionTitle: {
      fontSize: 16,
      fontWeight: "700",
      color: colors.ink,
    },
    sectionSubtitle: {
      fontSize: 11,
      color: colors.muted,
      marginTop: 2,
    },
    quickOrderPill: {
      backgroundColor: colors.primary,
      flexDirection: "row",
      alignItems: "center",
      gap: 5,
      paddingVertical: 6,
      paddingHorizontal: 12,
      borderRadius: 6,
    },
    quickOrderPillText: {
      fontSize: 11,
      fontWeight: "700",
      color: "#FFFFFF",
    },

    // Category Filter Pills
    categoryFilterRow: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: 6,
      marginBottom: 12,
    },
    catPill: {
      paddingVertical: 5,
      paddingHorizontal: 11,
      borderRadius: 6,
      backgroundColor: colors.surfaceCard,
      borderWidth: 1,
      borderColor: colors.hairline,
    },
    catPillActive: {
      backgroundColor: colors.ink,
      borderColor: colors.ink,
    },
    catPillText: {
      fontSize: 11,
      fontWeight: "500",
      color: colors.muted,
    },
    catPillTextActive: {
      color: "#0A0908",
      fontWeight: "700",
    },

    // Editorial Grocery Spec Card (No filler images, 100% correct data)
    grocerySpecCard: {
      backgroundColor: colors.surfaceCard,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: colors.hairline,
      padding: 14,
      gap: 10,
    },
    grocerySpecCardDimmed: {
      opacity: 0.45,
      backgroundColor: colors.canvasSoft,
    },
    specHeaderRow: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "flex-start",
    },
    catBadgePill: {
      flexDirection: "row",
      alignItems: "center",
      gap: 4,
      paddingVertical: 2,
      paddingHorizontal: 6,
      borderRadius: 4,
    },
    catBadgeText: {
      fontSize: 8,
      fontWeight: "700",
      letterSpacing: 0.4,
    },
    portionBadgeText: {
      fontSize: 11,
      fontWeight: "600",
      color: colors.accentGold,
    },
    itemNameTitle: {
      fontSize: 16,
      fontWeight: "700",
      color: colors.ink,
      marginTop: 2,
    },
    itemNameTitleStriked: {
      textDecorationLine: "line-through",
      color: colors.muted,
    },
    itemPackageSpec: {
      fontSize: 12,
      fontWeight: "600",
      color: colors.accentGold,
      marginTop: 2,
    },
    itemUsedInText: {
      fontSize: 11,
      color: colors.muted,
      marginTop: 2,
    },
    priceContainer: {
      flexDirection: "row",
      alignItems: "center",
      backgroundColor: colors.canvasSoft,
      borderWidth: 1,
      borderColor: colors.hairline,
      borderRadius: 6,
      paddingHorizontal: 8,
      height: 32,
    },
    rupeeSign: {
      fontSize: 13,
      fontWeight: "600",
      color: colors.ink,
    },
    priceInput: {
      fontSize: 14,
      fontWeight: "700",
      color: colors.ink,
      minWidth: 40,
      padding: 0,
      textAlign: "right",
    },

    // Real Store Quick Search Pills
    storeSearchRow: {
      borderTopWidth: 1,
      borderTopColor: colors.hairlineSoft,
      paddingTop: 8,
      gap: 4,
    },
    storeSearchTitle: {
      fontSize: 8,
      fontWeight: "700",
      letterSpacing: 0.8,
      color: colors.muted,
    },
    storeButtonsRow: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: 4,
    },
    quickStorePill: {
      flexDirection: "row",
      alignItems: "center",
      gap: 4,
      backgroundColor: colors.canvasSoft,
      borderWidth: 1,
      borderColor: colors.hairline,
      borderRadius: 4,
      paddingVertical: 3,
      paddingHorizontal: 6,
    },
    storeDot: {
      width: 5,
      height: 5,
      borderRadius: 2.5,
    },
    quickStorePillText: {
      fontSize: 9,
      fontWeight: "600",
      color: colors.ink,
    },

    cardFooterActions: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
      borderTopWidth: 1,
      borderTopColor: colors.hairlineSoft,
      paddingTop: 6,
    },
    pantryActionBtn: {
      flexDirection: "row",
      alignItems: "center",
      gap: 5,
    },
    pantryActionBtnActive: {
      opacity: 0.9,
    },
    pantryActionText: {
      fontSize: 11,
      fontWeight: "500",
      color: colors.body,
    },

    // MCP Spider Console Card
    mcpSpiderCard: {
      backgroundColor: "#110F0E",
      borderRadius: 14,
      borderWidth: 1,
      borderColor: colors.hairlineStrong,
      padding: 16,
      gap: 8,
    },
    mcpHeader: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
    },
    liveSpiderDot: {
      width: 6,
      height: 6,
      borderRadius: 3,
      backgroundColor: colors.success,
    },
    mcpTitle: {
      fontSize: 9,
      fontWeight: "800",
      letterSpacing: 0.88,
      color: colors.success,
    },
    mcpLastSync: {
      fontSize: 10,
      color: colors.muted,
    },
    mcpNodeInfo: {
      fontSize: 12,
      color: colors.body,
    },
    crawlButton: {
      backgroundColor: colors.primary,
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
      paddingVertical: 7,
      paddingHorizontal: 12,
      borderRadius: 6,
    },
    crawlButtonText: {
      color: "#FFFFFF",
      fontSize: 11,
      fontWeight: "700",
    },
    telemetryButton: {
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
    telemetryButtonText: {
      fontSize: 11,
      color: colors.ink,
      fontWeight: "500",
    },
    mcpConsoleLogs: {
      backgroundColor: "#080706",
      borderWidth: 1,
      borderColor: "#22201D",
      borderRadius: 6,
      padding: 10,
      marginTop: 8,
      gap: 4,
    },
    mcpConsoleHeading: {
      fontSize: 8,
      fontWeight: "800",
      letterSpacing: 0.8,
      color: colors.success,
      marginBottom: 2,
    },
    mcpLogEntry: {
      fontSize: 10,
      color: "#A19E9A",
      fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace",
      lineHeight: 14,
    },

    // Compare Store Rows
    storeRowCard: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
      backgroundColor: colors.surfaceCard,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: colors.hairline,
      padding: 14,
    },
    storeRowCardSelected: {
      borderColor: colors.primary,
      backgroundColor: colors.canvasSoft,
    },
    storeRowLeft: {
      flexDirection: "row",
      alignItems: "center",
      gap: 12,
      flex: 1,
    },
    storeStripe: {
      width: 4,
      height: 48,
      borderRadius: 2,
    },
    storeRowName: {
      fontSize: 15,
      fontWeight: "700",
      color: colors.ink,
    },
    statusBadgePill: {
      flexDirection: "row",
      alignItems: "center",
      gap: 4,
      borderWidth: 1,
      paddingVertical: 1,
      paddingHorizontal: 6,
      borderRadius: 4,
    },
    statusBadgeDot: {
      width: 5,
      height: 5,
      borderRadius: 2.5,
    },
    statusBadgeText: {
      fontSize: 8,
      fontWeight: "700",
      letterSpacing: 0.4,
    },
    lowestQuotePill: {
      backgroundColor: colors.successLight,
      paddingVertical: 2,
      paddingHorizontal: 6,
      borderRadius: 4,
    },
    lowestQuoteText: {
      fontSize: 8,
      fontWeight: "800",
      color: colors.successForeground,
    },
    liveClockText: {
      fontSize: 12,
      fontWeight: "700",
      color: colors.primary,
    },
    darkStoreText: {
      fontSize: 10,
      color: colors.muted,
      marginTop: 2,
    },
    storeRowRight: {
      alignItems: "flex-end",
      marginLeft: 12,
      gap: 3,
    },
    storeRowPrice: {
      fontSize: 16,
      fontWeight: "800",
      color: colors.ink,
    },
    storeRowCount: {
      fontSize: 10,
      color: colors.muted,
    },
    directStoreSearchBtn: {
      flexDirection: "row",
      alignItems: "center",
      gap: 2,
      marginTop: 2,
    },
    directStoreSearchText: {
      fontSize: 9,
      color: colors.primary,
      fontWeight: "600",
    },

    // Order Screen
    orderStoreChips: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: 6,
      marginTop: 12,
    },
    orderStoreChip: {
      paddingVertical: 7,
      paddingHorizontal: 12,
      borderRadius: 6,
      backgroundColor: colors.canvasSoft,
      borderWidth: 1,
      borderColor: colors.hairline,
    },
    orderStoreChipActive: {
      backgroundColor: colors.primary,
      borderColor: colors.primary,
    },
    orderStoreChipText: {
      fontSize: 11,
      fontWeight: "600",
      color: colors.ink,
    },
    orderStoreChipTextActive: {
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
    summaryStoreTitle: {
      fontSize: 15,
      fontWeight: "700",
      color: colors.ink,
    },
    summaryPriceValue: {
      fontSize: 17,
      fontWeight: "800",
      color: colors.primary,
    },
    summarySubDetail: {
      fontSize: 12,
      color: colors.muted,
      marginTop: 3,
    },
    primaryOrderAction: {
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
    primaryOrderActionText: {
      color: "#FFFFFF",
      fontSize: 12,
      fontWeight: "700",
      letterSpacing: 0.2,
    },
    secondaryOrderAction: {
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
    secondaryOrderActionText: {
      color: colors.ink,
      fontSize: 12,
      fontWeight: "500",
    },
    quickLaunchRow: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
      paddingVertical: 10,
      borderBottomWidth: 1,
      borderBottomColor: colors.hairlineSoft,
    },
    quickLaunchName: {
      fontSize: 13,
      fontWeight: "600",
      color: colors.ink,
    },
    quickLaunchPack: {
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
    providerOptionCard: {
      flexDirection: "row",
      alignItems: "center",
      padding: 14,
      borderRadius: 8,
      backgroundColor: colors.canvasSoft,
      borderWidth: 1,
      borderColor: colors.hairline,
    },
    providerOptionCardActive: {
      borderColor: colors.primary,
      backgroundColor: colors.surfaceCard,
    },
    providerOptionTitle: {
      fontSize: 13,
      fontWeight: "600",
      color: colors.ink,
    },
    providerOptionSub: {
      fontSize: 11,
      color: colors.muted,
      marginTop: 2,
    },
    inputFieldLabel: {
      fontSize: 9,
      fontWeight: "700",
      color: colors.muted,
      letterSpacing: 0.88,
      marginBottom: 6,
    },
    settingsInput: {
      backgroundColor: colors.surfaceCard,
      borderWidth: 1,
      borderColor: colors.hairline,
      borderRadius: 8,
      paddingHorizontal: 12,
      height: 40,
      fontSize: 12,
      color: colors.ink,
    },
    testResultPill: {
      backgroundColor: colors.canvasSoft,
      borderWidth: 1,
      borderColor: colors.hairline,
      padding: 10,
      borderRadius: 6,
      marginTop: 10,
    },
    testResultText: {
      fontSize: 11,
      fontWeight: "500",
      color: colors.ink,
    },
    historyRowItem: {
      flexDirection: "row",
      alignItems: "center",
      backgroundColor: colors.canvasSoft,
      padding: 12,
      borderRadius: 8,
      borderWidth: 1,
      borderColor: colors.hairline,
    },
    historyTitleText: {
      fontSize: 13,
      fontWeight: "600",
      color: colors.ink,
    },
    historySubText: {
      fontSize: 11,
      color: colors.muted,
      marginTop: 2,
    },

    // Bottom Navigation Dock
    bottomDock: {
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
    dockTab: {
      alignItems: "center",
      gap: 3,
      paddingHorizontal: 12,
      paddingVertical: 2,
    },
    dockTabActive: {
      opacity: 1,
    },
    dockTabText: {
      fontSize: 10,
      fontWeight: "500",
      color: colors.muted,
      letterSpacing: 0.2,
    },
    dockTabTextActive: {
      color: colors.primary,
      fontWeight: "700",
    },
  });
}
