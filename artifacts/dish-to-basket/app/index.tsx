import React, { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Image,
  ImageBackground,
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
import { Feather, MaterialCommunityIcons, Ionicons } from "@expo/vector-icons";
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
  getIngredientImage,
  DEFAULT_AI_BASE_URL,
} from "@/services/ingredientService";

const STORAGE_KEY = "dish-to-basket.active-plan.v8";
const FAVORITES_STORAGE_KEY = "dish-to-basket.favorites.v1";

type TabId = "cook" | "buy" | "favorites" | "settings";

export type FavoriteDish = {
  id: string;
  title: string;
  culinaryIdeology: string;
  dishes: string[];
  servings: number;
  chefNotes: string;
  ingredients: Ingredient[];
  savedAt: string;
  photoUrl: string;
};

// Popular everyday dishes for quick 1-tap inspiration
const POPULAR_DISHES = [
  { label: "Paneer Butter Masala", prompt: "Rich and creamy Paneer Butter Masala with buttery tomato gravy and warm rotis for 4", icon: "fire" },
  { label: "Chicken Biryani", prompt: "Royal fragrant Chicken Dum Biryani with aromatic basmati rice, curd raita, and boiled eggs for 4", icon: "award" },
  { label: "Dal Makhani & Jeera Rice", prompt: "Slow-simmered smoky Dal Makhani with fresh cream, butter, and fluffy Jeera Rice for 4", icon: "heart" },
  { label: "Masala Dosa & Sambar", prompt: "Crispy South Indian Masala Dosa with spiced potato filling, coconut chutney, and vegetable sambar for 2", icon: "coffee" },
  { label: "Veg Pulao", prompt: "Fragrant homestyle Vegetable Pulao loaded with carrots, green peas, and whole spices for 4", icon: "leaf" },
  { label: "Pasta Alfredo", prompt: "Creamy garlic Alfredo Pasta with mushrooms, tender butter herbs, and parmesan for 2", icon: "smile" },
];

function formatRupees(amount: number): string {
  return `₹${amount.toLocaleString("en-IN", {
    maximumFractionDigits: 0,
  })}`;
}

const CATEGORY_COLORS: Record<string, { bg: string; text: string; icon: string }> = {
  Dairy: { bg: "#FFF4E5", text: "#E65100", icon: "cup-water" },
  Produce: { bg: "#E8F5E9", text: "#2E7D32", icon: "leaf" },
  Spices: { bg: "#FFEBEE", text: "#C62828", icon: "fire" },
  Pantry: { bg: "#FFF8E1", text: "#F57F17", icon: "archive" },
  Proteins: { bg: "#FCE4EC", text: "#AD1457", icon: "food-drumstick" },
  Other: { bg: "#F5F5F5", text: "#616161", icon: "tag" },
};

export default function HomeScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const styles = useMemo(() => createStyles(colors), [colors]);

  // Main Tabs
  const [activeTab, setActiveTab] = useState<TabId>("cook");

  // Location State
  const [selectedHub, setSelectedHub] = useState<LocationHub>(POPULAR_LOCATIONS[0]);
  const [isDetectingLocation, setIsDetectingLocation] = useState(false);
  const [showLocationPicker, setShowLocationPicker] = useState(false);

  // Store Pricing & Delivery Times
  const [liveETAs, setLiveETAs] = useState<Record<StoreId, RealTimeStoreStatus>>(() =>
    crawlRealTimeStoreETAs(POPULAR_LOCATIONS[0]).statuses,
  );

  // Search & Recipe Input
  const [dishInput, setDishInput] = useState("Paneer Butter Masala & Jeera Rice");
  const [servings, setServings] = useState(4);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysisStep, setAnalysisStep] = useState("Finding fresh ingredients & best store prices...");

  // Active Plan Result
  const [plan, setPlan] = useState<PlanResult | null>(null);

  // Category & Store Filter
  const [selectedCategory, setSelectedCategory] = useState<string>("All");
  const [selectedStore, setSelectedStore] = useState<StoreId>("blinkit");
  const [noticeMessage, setNoticeMessage] = useState<string | null>(null);

  // Favorites
  const [favorites, setFavorites] = useState<FavoriteDish[]>([]);

  // Settings State
  const [aiProvider, setAiProvider] = useState<AiProvider>("nvidia");
  const [apiKeyInput, setApiKeyInput] = useState("");
  const [baseUrlInput, setBaseUrlInput] = useState(DEFAULT_AI_BASE_URL);
  const [modelInput, setModelInput] = useState("meta/llama-3.2-11b-vision-instruct");
  const [testingAi, setTestingAi] = useState(false);
  const [testResult, setTestResult] = useState<string | null>(null);

  // Load Saved Data
  useEffect(() => {
    let active = true;
    async function loadData() {
      try {
        const [rawPlan, rawFavs, aiCfg] = await Promise.all([
          AsyncStorage.getItem(STORAGE_KEY),
          AsyncStorage.getItem(FAVORITES_STORAGE_KEY),
          getAiConfig(),
        ]);
        if (!active) return;

        setAiProvider(aiCfg.provider);
        setApiKeyInput(aiCfg.apiKey);
        setBaseUrlInput(aiCfg.baseUrl);
        setModelInput(aiCfg.model);

        if (rawFavs) {
          try {
            setFavorites(JSON.parse(rawFavs));
          } catch {}
        }

        if (rawPlan) {
          try {
            const parsed: PlanResult = JSON.parse(rawPlan);
            setPlan(parsed);
            setServings(parsed.servings || 4);
          } catch {}
        } else {
          // Initialize with standard delicious dish
          handleAnalyzeDish("Paneer Butter Masala & Jeera Rice", 4);
        }
      } catch {}
    }

    loadData();
    return () => {
      active = false;
    };
  }, []);

  // Save active plan whenever it changes
  useEffect(() => {
    if (plan) {
      AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(plan)).catch(() => {});
    }
  }, [plan]);

  function flash(msg: string) {
    setNoticeMessage(msg);
    setTimeout(() => setNoticeMessage(null), 3000);
  }

  // Live Location Detection
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
              darkStoreCluster: `${city} Central Cluster`,
            };
            setSelectedHub(detectedHub);
            updateStoreETAs(detectedHub);
            flash(`Delivering to ${name}, ${city} (${pincode})`);
          } catch {
            flash("Location resolved to Bengaluru.");
          } finally {
            setIsDetectingLocation(false);
            setShowLocationPicker(false);
          }
        },
        () => {
          setIsDetectingLocation(false);
          flash("GPS permission denied. Please pick an area below.");
        },
        { timeout: 8000 },
      );
    } else {
      setIsDetectingLocation(false);
      flash("GPS not supported on this browser.");
    }
  }

  function updateStoreETAs(hub: LocationHub) {
    const result = crawlRealTimeStoreETAs(hub);
    setLiveETAs(result.statuses);
  }

  function handleSelectHub(hub: LocationHub) {
    setSelectedHub(hub);
    setShowLocationPicker(false);
    updateStoreETAs(hub);
    flash(`Delivery updated to ${hub.name}, ${hub.city}`);
  }

  // Analyze Dish & Fetch Ingredients
  async function handleAnalyzeDish(text = dishInput, guestCount = servings) {
    const query = text.trim();
    if (!query) {
      flash("Please enter what you want to cook!");
      return;
    }

    setIsAnalyzing(true);
    setAnalysisStep("Calculating ingredients & matching live store packs...");

    try {
      const result = await synthesizeCulinaryPlan(query, guestCount);
      setPlan(result);
      setActiveTab("cook");
      flash(`Ingredients ready for "${result.menuTitle}"`);
    } catch (e: any) {
      flash("Could not fetch ingredients: " + e.message);
    } finally {
      setIsAnalyzing(false);
    }
  }

  // Toggle item selection (Need to buy vs Have at home)
  function toggleItemSelection(id: string) {
    if (!plan) return;
    setPlan({
      ...plan,
      ingredients: plan.ingredients.map((item) =>
        item.id === id ? { ...item, haveAtHome: !item.haveAtHome } : item,
      ),
    });
  }

  // Mark all items as needed to buy
  function selectAllItems() {
    if (!plan) return;
    setPlan({
      ...plan,
      ingredients: plan.ingredients.map((item) => ({ ...item, haveAtHome: false })),
    });
    flash("All ingredients selected for order.");
  }

  // Mark common pantry spices/oil as "Have at home"
  function excludePantryStaples() {
    if (!plan) return;
    setPlan({
      ...plan,
      ingredients: plan.ingredients.map((item) => {
        const cat = item.category;
        const norm = item.name.toLowerCase();
        if (cat === "Spices" || norm.includes("oil") || norm.includes("salt") || norm.includes("turmeric")) {
          return { ...item, haveAtHome: true };
        }
        return item;
      }),
    });
    flash("Excluded salt, oil & spices (assumed at home)!");
  }

  // Delete ingredient
  function deleteItem(id: string) {
    if (!plan) return;
    setPlan({
      ...plan,
      ingredients: plan.ingredients.filter((item) => item.id !== id),
    });
  }

  // Favorites Check & Toggle
  const isFavorited = useMemo(() => {
    if (!plan) return false;
    return favorites.some((f) => f.title.toLowerCase() === plan.menuTitle.toLowerCase());
  }, [plan, favorites]);

  async function toggleFavorite() {
    if (!plan) return;
    let updated: FavoriteDish[];
    if (isFavorited) {
      updated = favorites.filter((f) => f.title.toLowerCase() !== plan.menuTitle.toLowerCase());
      flash(`Removed "${plan.menuTitle}" from Favorites.`);
    } else {
      const newFav: FavoriteDish = {
        id: Date.now().toString(),
        title: plan.menuTitle,
        culinaryIdeology: plan.culinaryIdeology,
        dishes: plan.dishes,
        servings: plan.servings,
        chefNotes: plan.chefNotes,
        ingredients: plan.ingredients,
        savedAt: new Date().toLocaleDateString("en-IN", { month: "short", day: "numeric" }),
        photoUrl:
          plan.ingredients[0]?.imageUrl ||
          getIngredientImage(plan.menuTitle) ||
          "https://images.unsplash.com/photo-1546069901-ba9599a7e63c?w=500&auto=format&fit=crop&q=80",
      };
      updated = [newFav, ...favorites];
      flash(`Added "${plan.menuTitle}" to Favorites ❤️`);
    }
    setFavorites(updated);
    await AsyncStorage.setItem(FAVORITES_STORAGE_KEY, JSON.stringify(updated));
  }

  function loadFavoriteDish(fav: FavoriteDish) {
    setPlan({
      menuTitle: fav.title,
      culinaryIdeology: fav.culinaryIdeology,
      dishes: fav.dishes,
      servings: fav.servings,
      chefNotes: fav.chefNotes,
      ingredients: fav.ingredients,
      source: "favorite",
    });
    setDishInput(fav.title);
    setServings(fav.servings);
    setActiveTab("cook");
    flash(`Loaded favorite "${fav.title}"!`);
  }

  async function removeFavorite(id: string) {
    const updated = favorites.filter((f) => f.id !== id);
    setFavorites(updated);
    await AsyncStorage.setItem(FAVORITES_STORAGE_KEY, JSON.stringify(updated));
    flash("Removed from Favorites.");
  }

  // Active items calculation
  const ingredients = plan ? plan.ingredients : [];
  const toBuy = useMemo(() => ingredients.filter((item) => !item.haveAtHome), [ingredients]);
  const haveAtHomeCount = ingredients.length - toBuy.length;

  const categories = useMemo(() => {
    const set = new Set(ingredients.map((i) => i.category));
    return ["All", ...Array.from(set)];
  }, [ingredients]);

  const filteredItems = useMemo(() => {
    if (selectedCategory === "All") return ingredients;
    return ingredients.filter((i) => i.category === selectedCategory);
  }, [ingredients, selectedCategory]);

  // Store Pricing Totals
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

  const cheapestStore = ranking[0];
  const currentStore = STORES.find((s) => s.id === selectedStore) || STORES[0];

  // 1-Click Multi-Search Order
  function orderOnStore(store = currentStore) {
    const queries = toBuy.map((i) => i.searchQuery || i.name);
    if (queries.length === 0) {
      flash("No items selected to buy.");
      return;
    }
    const url = store.cartUrl(queries);
    Linking.openURL(url).catch(() => {
      Alert.alert("Notice", `Could not open ${store.name}`);
    });
  }

  // Copy Shopping Checklist with Direct Buy Links
  async function copyShoppingChecklist() {
    if (toBuy.length === 0) {
      flash("No items selected to buy.");
      return;
    }

    const eta = liveETAs[selectedStore]?.etaDisplay || currentStore.deliveryTime;
    let text = `🛒 GROCERY BASKET: ${plan?.menuTitle || "DISH TO BASKET"}\n`;
    text += `Servings: ${plan?.servings || servings} People\n`;
    text += `Target Store: ${currentStore.name} (${eta})\n`;
    text += `Estimated Total: ${formatRupees(storeTotals[selectedStore])}\n`;
    text += `Delivery to: ${selectedHub.name}, ${selectedHub.city}\n\n`;
    text += `ITEMS TO BUY (${toBuy.length}):\n`;
    toBuy.forEach((item, idx) => {
      text += `${idx + 1}. ${item.name} (${item.quantity} ${item.unit}) -> ${item.packageSize} [₹${item.estimatedPrice}]\n   Buy Link: ${currentStore.searchUrl(item.searchQuery || item.name)}\n`;
    });

    if (Platform.OS === "web" && typeof navigator !== "undefined" && navigator.clipboard) {
      navigator.clipboard.writeText(text);
      flash(`Copied shopping checklist for ${currentStore.name}!`);
    } else {
      try {
        await Share.share({ message: text });
      } catch {
        flash("Could not share checklist.");
      }
    }
  }

  // Settings Save
  async function handleSaveSettings() {
    await saveAiConfig({
      provider: aiProvider,
      apiKey: apiKeyInput.trim(),
      baseUrl: baseUrlInput.trim(),
      model: modelInput.trim(),
    });
    flash("Settings saved successfully.");
  }

  return (
    <View style={styles.root}>
      <StatusBar style="dark" />

      {/* Floating Notice Toast */}
      {noticeMessage && (
        <View style={styles.toastContainer}>
          <Text style={styles.toastText}>{noticeMessage}</Text>
        </View>
      )}

      <KeyboardAwareScrollViewCompat
        style={styles.scroll}
        contentContainerStyle={[
          styles.scrollContent,
          { paddingTop: insets.top + 8, paddingBottom: insets.bottom + 90 },
        ]}
        showsVerticalScrollIndicator={false}
      >
        {/* Top Header: Brand & Live Delivery Location Pill */}
        <View style={styles.headerRow}>
          <View>
            <View style={styles.brandTitleRow}>
              <View style={styles.brandIconBadge}>
                <Ionicons name="restaurant" size={15} color="#FFFFFF" />
              </View>
              <Text style={styles.brandTitle}>Dish to Basket</Text>
            </View>
            <Text style={styles.brandTagline}>Cook what you crave • Fresh groceries in 10 mins</Text>
          </View>

          {/* Location Chip */}
          <Pressable
            onPress={() => setShowLocationPicker(!showLocationPicker)}
            style={styles.locationChip}
          >
            {isDetectingLocation ? (
              <ActivityIndicator size="small" color={colors.primary} />
            ) : (
              <Ionicons name="location" size={14} color={colors.primary} />
            )}
            <Text style={styles.locationChipText} numberOfLines={1}>
              {selectedHub.name}
            </Text>
            <Feather
              name={showLocationPicker ? "chevron-up" : "chevron-down"}
              size={13}
              color={colors.muted}
            />
          </Pressable>
        </View>

        {/* Location Dropdown Modal / Picker */}
        {showLocationPicker && (
          <View style={styles.locationCard}>
            <View style={styles.locationCardHeader}>
              <Text style={styles.locationCardTitle}>Select Delivery Location</Text>
              <Pressable
                onPress={detectLiveLocation}
                disabled={isDetectingLocation}
                style={styles.gpsDetectBtn}
              >
                <Feather name="crosshair" size={13} color="#FFFFFF" />
                <Text style={styles.gpsDetectBtnText}>
                  {isDetectingLocation ? "Detecting..." : "Use Current GPS"}
                </Text>
              </Pressable>
            </View>

            <View style={styles.locationGrid}>
              {POPULAR_LOCATIONS.map((loc) => (
                <Pressable
                  key={loc.id}
                  onPress={() => handleSelectHub(loc)}
                  style={[
                    styles.locationGridItem,
                    selectedHub.id === loc.id && styles.locationGridItemActive,
                  ]}
                >
                  <Text
                    style={[
                      styles.locationGridItemName,
                      selectedHub.id === loc.id && styles.locationGridItemNameActive,
                    ]}
                  >
                    {loc.name}
                  </Text>
                  <Text style={styles.locationGridItemCity}>
                    {loc.city} ({loc.pincode})
                  </Text>
                </Pressable>
              ))}
            </View>
          </View>
        )}

        {/* TAB 1: COOK & INGREDIENTS (Main Screen) */}
        {activeTab === "cook" && (
          <View style={styles.tabSection}>
            {/* Grand Culinary Hero Banner with Food Photo */}
            <ImageBackground
              source={{
                uri: "https://images.unsplash.com/photo-1556910103-1c02745aae4d?w=1200&auto=format&fit=crop&q=80",
              }}
              style={styles.heroBanner}
              imageStyle={styles.heroBannerImage}
            >
              <View style={styles.heroOverlay}>
                <Text style={styles.heroGreeting}>What do you want to cook today?</Text>
                <Text style={styles.heroSub}>
                  Type any recipe or meal. We'll find all the fresh ingredients with photos and show you the best store prices.
                </Text>

                {/* Input Search Box */}
                <View style={styles.inputCard}>
                  <View style={styles.inputRow}>
                    <Feather name="search" size={18} color={colors.primary} style={{ marginTop: 2 }} />
                    <TextInput
                      value={dishInput}
                      onChangeText={setDishInput}
                      placeholder="e.g. Paneer Butter Masala, Chicken Biryani, Dal Makhani..."
                      placeholderTextColor={colors.muted}
                      style={styles.searchInput}
                      returnKeyType="search"
                      onSubmitEditing={() => handleAnalyzeDish()}
                    />
                  </View>

                  {/* Servings Stepper & Action Button */}
                  <View style={styles.inputControlsRow}>
                    <View style={styles.servingsStepper}>
                      <Pressable
                        onPress={() => setServings(Math.max(1, servings - 1))}
                        style={styles.stepperButton}
                      >
                        <Feather name="minus" size={13} color={colors.ink} />
                      </Pressable>
                      <Text style={styles.servingsText}>{servings} People</Text>
                      <Pressable
                        onPress={() => setServings(Math.min(20, servings + 1))}
                        style={styles.stepperButton}
                      >
                        <Feather name="plus" size={13} color={colors.ink} />
                      </Pressable>
                    </View>

                    <Pressable
                      onPress={() => handleAnalyzeDish()}
                      disabled={isAnalyzing}
                      style={[styles.findIngredientsBtn, isAnalyzing && styles.btnDisabled]}
                    >
                      {isAnalyzing ? (
                        <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                          <ActivityIndicator size="small" color="#FFFFFF" />
                          <Text style={styles.findIngredientsBtnText}>Finding...</Text>
                        </View>
                      ) : (
                        <>
                          <Text style={styles.findIngredientsBtnText}>Find Ingredients</Text>
                          <Feather name="arrow-right" size={14} color="#FFFFFF" />
                        </>
                      )}
                    </Pressable>
                  </View>
                </View>

                {/* Quick Popular Dish Pills */}
                <View style={styles.popularDishesRow}>
                  {POPULAR_DISHES.map((dish) => (
                    <Pressable
                      key={dish.label}
                      onPress={() => {
                        setDishInput(dish.label);
                        handleAnalyzeDish(dish.prompt, servings);
                      }}
                      style={styles.popularDishPill}
                    >
                      <Text style={styles.popularDishPillText}>{dish.label}</Text>
                    </Pressable>
                  ))}
                </View>
              </View>
            </ImageBackground>

            {/* Pleasant Loading Indicator */}
            {isAnalyzing && (
              <View style={styles.loadingCard}>
                <ActivityIndicator size="large" color={colors.primary} />
                <Text style={styles.loadingTitle}>{analysisStep}</Text>
                <Text style={styles.loadingSub}>
                  Matching genuine product packages from Blinkit, Zepto, Swiggy Instamart, BigBasket...
                </Text>
              </View>
            )}

            {/* Dish Summary & Action Card */}
            {/* Dish Header & Shopping Actions */}
            {plan && !isAnalyzing && (
              <View style={styles.recipeHeaderCard}>
                <View style={styles.recipeHeaderTop}>
                  <View style={{ flex: 1, paddingRight: 8 }}>
                    <Text style={styles.recipeTitle}>{plan.menuTitle}</Text>
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginTop: 6, flexWrap: "wrap" }}>
                      <View style={styles.servingsPill}>
                        <Ionicons name="people-outline" size={13} color={colors.primary} />
                        <Text style={styles.servingsPillText}>{plan.servings} Servings</Text>
                      </View>
                      <Text style={styles.checklistSummaryText}>
                        <Text style={{ fontWeight: "700", color: colors.ink }}>{toBuy.length} items to buy</Text>
                        {haveAtHomeCount > 0 && ` • ${haveAtHomeCount} at home`}
                      </Text>
                    </View>
                  </View>

                  {/* Add to Favorites Button */}
                  <Pressable
                    onPress={toggleFavorite}
                    style={[styles.favoriteBtn, isFavorited && styles.favoriteBtnActive]}
                  >
                    <Ionicons
                      name={isFavorited ? "heart" : "heart-outline"}
                      size={18}
                      color={isFavorited ? "#E53935" : colors.muted}
                    />
                    <Text style={[styles.favoriteBtnText, isFavorited && styles.favoriteBtnTextActive]}>
                      {isFavorited ? "Saved" : "Favorite"}
                    </Text>
                  </Pressable>
                </View>

                {/* Quick Helper Actions */}
                <View style={styles.checklistHelperRow}>
                  <View style={{ flexDirection: "row", gap: 8 }}>
                    <Pressable onPress={selectAllItems} style={styles.helperChip}>
                      <Ionicons name="checkmark-done" size={14} color={colors.ink} />
                      <Text style={styles.helperChipText}>Select All</Text>
                    </Pressable>
                    <Pressable onPress={excludePantryStaples} style={styles.helperChip}>
                      <Ionicons name="home-outline" size={14} color={colors.ink} />
                      <Text style={styles.helperChipText}>I have spices & oil</Text>
                    </Pressable>
                  </View>
                </View>
              </View>
            )}

            {/* Category Filter Chips */}
            {plan && !isAnalyzing && (
              <View style={styles.categoryRow}>
                {categories.map((cat) => (
                  <Pressable
                    key={cat}
                    onPress={() => setSelectedCategory(cat)}
                    style={[
                      styles.categoryChip,
                      selectedCategory === cat && styles.categoryChipActive,
                    ]}
                  >
                    <Text
                      style={[
                        styles.categoryChipText,
                        selectedCategory === cat && styles.categoryChipTextActive,
                      ]}
                    >
                      {cat}
                    </Text>
                  </Pressable>
                ))}
              </View>
            )}

            {/* List of Ingredients with Real Photos & Checkbox Selection */}
            {plan && !isAnalyzing && (
              <View style={styles.ingredientsList}>
                {filteredItems.map((item) => {
                  const catMeta = CATEGORY_COLORS[item.category] || CATEGORY_COLORS.Other;
                  const isChecked = !item.haveAtHome; // checked means "need to buy"
                  const photo = item.imageUrl || getIngredientImage(item.name);

                  return (
                    <View
                      key={item.id}
                      style={[
                        styles.ingredientCard,
                        item.haveAtHome && styles.ingredientCardAtHome,
                      ]}
                    >
                      {/* Product Food Photo */}
                      <Image
                        source={{ uri: photo }}
                        style={styles.ingredientImage}
                        resizeMode="cover"
                      />

                      {/* Ingredient Details */}
                      <View style={styles.ingredientInfo}>
                        <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                          <View style={[styles.catBadge, { backgroundColor: catMeta.bg }]}>
                            <Text style={[styles.catBadgeText, { color: catMeta.text }]}>
                              {item.category}
                            </Text>
                          </View>
                          <Text style={styles.recipePortionText}>
                            Needs {item.quantity} {item.unit}
                          </Text>
                        </View>

                        <Text
                          style={[
                            styles.ingredientName,
                            item.haveAtHome && styles.ingredientNameStriked,
                          ]}
                          numberOfLines={1}
                        >
                          {item.name}
                        </Text>

                        <Text style={styles.packageSizeText}>{item.packageSize}</Text>

                        {/* Price & Fast Store Links */}
                        <View style={styles.priceAndStoreRow}>
                          <Text style={styles.priceTag}>{formatRupees(item.estimatedPrice)}</Text>

                          <View style={styles.miniStoreLinks}>
                            <Text style={styles.storeLinksLabel}>Stores:</Text>
                            {STORES.slice(0, 4).map((s) => (
                              <Pressable
                                key={s.id}
                                onPress={() => Linking.openURL(item.storeUrls[s.id])}
                                style={styles.miniStoreBtn}
                              >
                                <View style={[styles.miniStoreDot, { backgroundColor: s.brandColor }]} />
                                <Text style={styles.miniStoreBtnText}>{s.name.split(" ")[0]}</Text>
                              </Pressable>
                            ))}
                          </View>
                        </View>
                      </View>

                      {/* Checkbox / Have at Home Toggle */}
                      <Pressable
                        onPress={() => toggleItemSelection(item.id)}
                        style={[
                          styles.checkboxBtn,
                          isChecked ? styles.checkboxBtnChecked : styles.checkboxBtnUnchecked,
                        ]}
                      >
                        <Ionicons
                          name={isChecked ? "checkmark-circle" : "ellipse-outline"}
                          size={24}
                          color={isChecked ? colors.success : colors.muted}
                        />
                        <Text style={[styles.checkboxLabel, isChecked && { color: colors.success }]}>
                          {isChecked ? "Buy" : "At Home"}
                        </Text>
                      </Pressable>
                    </View>
                  );
                })}
              </View>
            )}

            {/* Floating Bottom Bar: Direct Transition to Buying */}
            {plan && toBuy.length > 0 && !isAnalyzing && (
              <View style={styles.bottomCtaCard}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.bottomCtaTotal}>
                    {toBuy.length} items to buy • {formatRupees(storeTotals[selectedStore])}
                  </Text>
                  <Text style={styles.bottomCtaStoreNotice}>
                    Cheapest on {cheapestStore.name} ({formatRupees(storeTotals[cheapestStore.id])})
                  </Text>
                </View>

                <Pressable
                  onPress={() => setActiveTab("buy")}
                  style={styles.bottomCtaButton}
                >
                  <Text style={styles.bottomCtaButtonText}>Compare Stores & Buy</Text>
                  <Feather name="arrow-right" size={15} color="#FFFFFF" />
                </Pressable>
              </View>
            )}
          </View>
        )}

        {/* TAB 2: BUYING & STORE PRICE COMPARISON */}
        {activeTab === "buy" && (
          <View style={styles.tabSection}>
            <View style={styles.sectionHeaderCard}>
              <Text style={styles.sectionHeading}>Compare Store Prices</Text>
              <Text style={styles.sectionSubheading}>
                We calculated the exact total for your {toBuy.length} selected items across 6 fast delivery stores near {selectedHub.name}.
              </Text>
            </View>

            {/* Cheapest Store Highlight Banner */}
            {toBuy.length > 0 && (
              <View style={styles.savingsBanner}>
                <View style={styles.savingsBadge}>
                  <Text style={styles.savingsBadgeText}>BEST PRICE</Text>
                </View>
                <Text style={styles.savingsTitle}>
                  {cheapestStore.name} is your cheapest option at {formatRupees(storeTotals[cheapestStore.id])}
                </Text>
                <Text style={styles.savingsSubtitle}>
                  Order all ingredients in one tap and receive delivery in {liveETAs[cheapestStore.id]?.etaDisplay || cheapestStore.deliveryTime}.
                </Text>
              </View>
            )}

            {/* 6 Store Cards */}
            <View style={{ gap: 12 }}>
              {ranking.map((s, index) => {
                const total = storeTotals[s.id];
                const isSelected = selectedStore === s.id;
                const isCheapest = index === 0;
                const etaInfo = liveETAs[s.id];

                return (
                  <Pressable
                    key={s.id}
                    onPress={() => setSelectedStore(s.id)}
                    style={[
                      styles.storeCard,
                      isSelected && styles.storeCardSelected,
                    ]}
                  >
                    <View style={styles.storeCardLeft}>
                      <View style={[styles.storeColorBar, { backgroundColor: s.brandColor }]} />
                      <View style={{ flex: 1 }}>
                        <View style={{ flexDirection: "row", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                          <Text style={styles.storeNameText}>{s.name}</Text>
                          {isCheapest && (
                            <View style={styles.bestQuoteTag}>
                              <Text style={styles.bestQuoteTagText}>LOWEST PRICE</Text>
                            </View>
                          )}
                        </View>

                        <View style={{ flexDirection: "row", alignItems: "center", gap: 5, marginTop: 4 }}>
                          <Feather name="clock" size={12} color={colors.primary} />
                          <Text style={styles.storeEtaText}>
                            {etaInfo?.etaDisplay || s.deliveryTime}
                          </Text>
                        </View>
                      </View>
                    </View>

                    <View style={styles.storeCardRight}>
                      <Text style={styles.storePriceText}>{formatRupees(total)}</Text>
                      <Text style={styles.storeItemCountText}>{toBuy.length} items</Text>
                    </View>
                  </Pressable>
                );
              })}
            </View>

            {/* 1-Tap Checkout Panel */}
            <View style={styles.checkoutPanel}>
              <View style={styles.checkoutHeaderRow}>
                <View>
                  <Text style={styles.checkoutStoreName}>Order on {currentStore.name}</Text>
                  <Text style={styles.checkoutDeliveryEta}>
                    Delivery: {liveETAs[selectedStore]?.etaDisplay || currentStore.deliveryTime} to {selectedHub.name}
                  </Text>
                </View>
                <Text style={styles.checkoutTotalPrice}>
                  {formatRupees(storeTotals[selectedStore])}
                </Text>
              </View>

              {/* Big 1-Click Order Entire Basket */}
              <Pressable
                onPress={() => orderOnStore(currentStore)}
                style={styles.primaryCheckoutBtn}
              >
                <Ionicons name="cart" size={18} color="#FFFFFF" />
                <Text style={styles.primaryCheckoutBtnText}>
                  Order Entire Basket on {currentStore.name}
                </Text>
                <Feather name="external-link" size={15} color="#FFFFFF" />
              </Pressable>

              {/* Copy Links Checklist */}
              <Pressable onPress={copyShoppingChecklist} style={styles.secondaryCheckoutBtn}>
                <Feather name="copy" size={14} color={colors.ink} />
                <Text style={styles.secondaryCheckoutBtnText}>
                  Copy Shopping Checklist with Links
                </Text>
              </Pressable>

              {/* Individual Item Direct Links */}
              <Text style={styles.individualLinksTitle}>
                Or buy items individually on {currentStore.name}:
              </Text>
              <View style={{ gap: 8 }}>
                {toBuy.map((item) => (
                  <View key={item.id} style={styles.individualItemRow}>
                    <View style={{ flex: 1, paddingRight: 8 }}>
                      <Text style={styles.individualItemName}>{item.name}</Text>
                      <Text style={styles.individualItemPack}>
                        {item.packageSize} • {formatRupees(item.estimatedPrice)}
                      </Text>
                    </View>
                    <Pressable
                      onPress={() => Linking.openURL(currentStore.searchUrl(item.searchQuery || item.name))}
                      style={styles.individualBuyBtn}
                    >
                      <Text style={styles.individualBuyBtnText}>Buy</Text>
                      <Feather name="arrow-up-right" size={11} color={colors.primary} />
                    </Pressable>
                  </View>
                ))}
              </View>
            </View>
          </View>
        )}

        {/* TAB 3: FAVORITES (Saved Recipes & Quick Re-order) */}
        {activeTab === "favorites" && (
          <View style={styles.tabSection}>
            <View style={styles.sectionHeaderCard}>
              <Text style={styles.sectionHeading}>My Favorite Dishes</Text>
              <Text style={styles.sectionSubheading}>
                Save any dish by tapping the heart icon ❤️ on the recipe screen. Tap any dish below to instantly reload all ingredients and store prices!
              </Text>
            </View>

            {favorites.length === 0 ? (
              <View style={styles.emptyFavoritesCard}>
                <Ionicons name="heart-outline" size={48} color={colors.muted} />
                <Text style={styles.emptyFavoritesTitle}>No favorites saved yet</Text>
                <Text style={styles.emptyFavoritesSub}>
                  When you find a dish you love, tap "Favorite" to save it here for easy re-ordering anytime!
                </Text>
                <Pressable
                  onPress={() => setActiveTab("cook")}
                  style={styles.exploreDishesBtn}
                >
                  <Text style={styles.exploreDishesBtnText}>Explore Recipes</Text>
                </Pressable>
              </View>
            ) : (
              <View style={{ gap: 12 }}>
                {favorites.map((fav) => (
                  <View key={fav.id} style={styles.favoriteItemCard}>
                    <Image
                      source={{ uri: fav.photoUrl }}
                      style={styles.favoriteItemImage}
                      resizeMode="cover"
                    />
                    <View style={styles.favoriteItemDetails}>
                      <Text style={styles.favoriteItemTitle}>{fav.title}</Text>
                      <Text style={styles.favoriteItemSub} numberOfLines={1}>
                        {fav.dishes && fav.dishes.length > 0 ? fav.dishes.join(", ") : `${fav.ingredients.length} ingredients`}
                      </Text>
                      <Text style={styles.favoriteItemMeta}>
                        {fav.ingredients.length} ingredients • {fav.servings} servings • Saved {fav.savedAt}
                      </Text>

                      <View style={styles.favoriteItemActions}>
                        <Pressable
                          onPress={() => loadFavoriteDish(fav)}
                          style={styles.cookAgainBtn}
                        >
                          <Ionicons name="restaurant" size={13} color="#FFFFFF" />
                          <Text style={styles.cookAgainBtnText}>Cook This Again</Text>
                        </Pressable>

                        <Pressable
                          onPress={() => removeFavorite(fav.id)}
                          style={styles.removeFavBtn}
                        >
                          <Feather name="trash-2" size={14} color={colors.muted} />
                        </Pressable>
                      </View>
                    </View>
                  </View>
                ))}
              </View>
            )}
          </View>
        )}

        {/* TAB 4: SETTINGS */}
        {activeTab === "settings" && (
          <View style={styles.tabSection}>
            <View style={styles.sectionHeaderCard}>
              <Text style={styles.sectionHeading}>App Settings</Text>
              <Text style={styles.sectionSubheading}>
                Configure delivery preferences and AI provider.
              </Text>
            </View>

            {/* Delivery Location Setting */}
            <View style={styles.settingsSectionCard}>
              <Text style={styles.settingsSectionTitle}>Delivery Location</Text>
              <Text style={styles.settingsSectionSub}>
                Currently delivering to: <Text style={{ fontWeight: "700" }}>{selectedHub.name}, {selectedHub.city} ({selectedHub.pincode})</Text>
              </Text>
              <Pressable
                onPress={() => setShowLocationPicker(true)}
                style={styles.changeLocationBtn}
              >
                <Feather name="map-pin" size={14} color={colors.ink} />
                <Text style={styles.changeLocationBtnText}>Change Area / Detect GPS</Text>
              </Pressable>
            </View>

            {/* AI Provider Config */}
            <View style={styles.settingsSectionCard}>
              <Text style={styles.settingsSectionTitle}>AI Recipe Engine</Text>
              <Text style={styles.settingsSectionSub}>
                Select the AI model that plans dishes and verifies commercial packs.
              </Text>

              {/* Provider Selector */}
              <View style={styles.providerRow}>
                {(["nvidia", "free", "offline"] as AiProvider[]).map((p) => (
                  <Pressable
                    key={p}
                    onPress={() => setAiProvider(p)}
                    style={[
                      styles.providerChip,
                      aiProvider === p && styles.providerChipActive,
                    ]}
                  >
                    <Text
                      style={[
                        styles.providerChipText,
                        aiProvider === p && styles.providerChipTextActive,
                      ]}
                    >
                      {p === "nvidia" ? "NVIDIA NIM" : p === "free" ? "Free Global" : "Built-in"}
                    </Text>
                  </Pressable>
                ))}
              </View>

              {aiProvider === "nvidia" && (
                <View style={{ gap: 10, marginTop: 12 }}>
                  <Text style={styles.inputLabel}>NVIDIA API KEY</Text>
                  <TextInput
                    value={apiKeyInput}
                    onChangeText={setApiKeyInput}
                    secureTextEntry
                    placeholder="nvapi-..."
                    placeholderTextColor={colors.muted}
                    style={styles.settingsInput}
                  />

                  <Text style={styles.inputLabel}>MODEL ID</Text>
                  <TextInput
                    value={modelInput}
                    onChangeText={setModelInput}
                    placeholder="stepfun-ai/step-5-preview"
                    placeholderTextColor={colors.muted}
                    style={styles.settingsInput}
                  />
                </View>
              )}

              <Pressable onPress={handleSaveSettings} style={styles.saveSettingsBtn}>
                <Text style={styles.saveSettingsBtnText}>Save Settings</Text>
              </Pressable>
            </View>
          </View>
        )}
      </KeyboardAwareScrollViewCompat>

      {/* Modern Light Foodie Bottom Dock */}
      <View style={[styles.bottomDock, { paddingBottom: Math.max(12, insets.bottom) }]}>
        <Pressable
          onPress={() => setActiveTab("cook")}
          style={[styles.dockTab, activeTab === "cook" && styles.dockTabActive]}
        >
          <Ionicons
            name={activeTab === "cook" ? "restaurant" : "restaurant-outline"}
            size={19}
            color={activeTab === "cook" ? colors.primary : colors.muted}
          />
          <Text style={[styles.dockTabText, activeTab === "cook" && styles.dockTabTextActive]}>
            Cook
          </Text>
        </Pressable>

        <Pressable
          onPress={() => setActiveTab("buy")}
          style={[styles.dockTab, activeTab === "buy" && styles.dockTabActive]}
        >
          <Ionicons
            name={activeTab === "buy" ? "cart" : "cart-outline"}
            size={20}
            color={activeTab === "buy" ? colors.primary : colors.muted}
          />
          <Text style={[styles.dockTabText, activeTab === "buy" && styles.dockTabTextActive]}>
            Compare & Buy
          </Text>
        </Pressable>

        <Pressable
          onPress={() => setActiveTab("favorites")}
          style={[styles.dockTab, activeTab === "favorites" && styles.dockTabActive]}
        >
          <Ionicons
            name={activeTab === "favorites" ? "heart" : "heart-outline"}
            size={20}
            color={activeTab === "favorites" ? colors.primary : colors.muted}
          />
          <Text style={[styles.dockTabText, activeTab === "favorites" && styles.dockTabTextActive]}>
            Favorites ({favorites.length})
          </Text>
        </Pressable>

        <Pressable
          onPress={() => setActiveTab("settings")}
          style={[styles.dockTab, activeTab === "settings" && styles.dockTabActive]}
        >
          <Ionicons
            name={activeTab === "settings" ? "settings" : "settings-outline"}
            size={19}
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
      paddingHorizontal: 16,
      maxWidth: 720,
      width: "100%",
      alignSelf: "center",
    },

    // Floating Notice Toast
    toastContainer: {
      position: "absolute",
      top: 50,
      left: 20,
      right: 20,
      zIndex: 999,
      backgroundColor: "#202124",
      paddingVertical: 12,
      paddingHorizontal: 16,
      borderRadius: 12,
      shadowColor: "#000",
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.15,
      shadowRadius: 10,
      elevation: 5,
      alignSelf: "center",
      maxWidth: 480,
    },
    toastText: {
      color: "#FFFFFF",
      fontSize: 13,
      fontWeight: "600",
      textAlign: "center",
    },

    // Header Row
    headerRow: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
      paddingBottom: 14,
    },
    brandTitleRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
    },
    brandIconBadge: {
      width: 28,
      height: 28,
      borderRadius: 14,
      backgroundColor: colors.primary,
      alignItems: "center",
      justifyContent: "center",
    },
    brandTitle: {
      fontSize: 18,
      fontWeight: "800",
      color: colors.ink,
      letterSpacing: -0.3,
    },
    brandTagline: {
      fontSize: 12,
      color: colors.muted,
      marginTop: 2,
    },
    locationChip: {
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
      backgroundColor: colors.card,
      paddingVertical: 7,
      paddingHorizontal: 12,
      borderRadius: 20,
      borderWidth: 1,
      borderColor: colors.border,
      maxWidth: 160,
    },
    locationChipText: {
      fontSize: 12,
      fontWeight: "600",
      color: colors.ink,
      flexShrink: 1,
    },

    // Location Dropdown Card
    locationCard: {
      backgroundColor: colors.card,
      borderRadius: 16,
      padding: 16,
      marginBottom: 16,
      borderWidth: 1,
      borderColor: colors.border,
      shadowColor: "#000",
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.06,
      shadowRadius: 8,
      elevation: 2,
    },
    locationCardHeader: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
      marginBottom: 12,
    },
    locationCardTitle: {
      fontSize: 13,
      fontWeight: "700",
      color: colors.ink,
      textTransform: "uppercase",
      letterSpacing: 0.5,
    },
    gpsDetectBtn: {
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
      backgroundColor: colors.primary,
      paddingVertical: 6,
      paddingHorizontal: 10,
      borderRadius: 12,
    },
    gpsDetectBtnText: {
      fontSize: 11,
      fontWeight: "600",
      color: "#FFFFFF",
    },
    locationGrid: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: 8,
    },
    locationGridItem: {
      paddingVertical: 8,
      paddingHorizontal: 12,
      borderRadius: 10,
      backgroundColor: colors.surfaceTile,
      borderWidth: 1,
      borderColor: "transparent",
    },
    locationGridItemActive: {
      backgroundColor: colors.secondary,
      borderColor: colors.primary,
    },
    locationGridItemName: {
      fontSize: 12,
      fontWeight: "700",
      color: colors.ink,
    },
    locationGridItemNameActive: {
      color: colors.primary,
    },
    locationGridItemCity: {
      fontSize: 10,
      color: colors.muted,
      marginTop: 2,
    },

    // Tab Sections
    tabSection: {
      gap: 16,
    },

    // Grand Hero Banner
    heroBanner: {
      borderRadius: 20,
      overflow: "hidden",
      marginBottom: 4,
    },
    heroBannerImage: {
      borderRadius: 20,
    },
    heroOverlay: {
      backgroundColor: "rgba(255, 255, 255, 0.92)",
      padding: 18,
      borderRadius: 20,
    },
    heroGreeting: {
      fontSize: 22,
      fontWeight: "800",
      color: colors.ink,
      letterSpacing: -0.5,
    },
    heroSub: {
      fontSize: 13,
      color: colors.body,
      marginTop: 4,
      marginBottom: 14,
      lineHeight: 18,
    },

    // Input Card inside Hero
    inputCard: {
      backgroundColor: "#FFFFFF",
      borderRadius: 16,
      padding: 12,
      borderWidth: 1,
      borderColor: colors.border,
      shadowColor: "#000",
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.05,
      shadowRadius: 6,
      elevation: 2,
      marginBottom: 12,
    },
    inputRow: {
      flexDirection: "row",
      alignItems: "flex-start",
      gap: 10,
    },
    searchInput: {
      flex: 1,
      fontSize: 15,
      fontWeight: "500",
      color: colors.ink,
      minHeight: 44,
      paddingTop: 0,
    },
    inputControlsRow: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
      marginTop: 10,
      paddingTop: 10,
      borderTopWidth: 1,
      borderTopColor: colors.hairlineSoft,
    },
    servingsStepper: {
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
      backgroundColor: colors.surfaceTile,
      paddingVertical: 5,
      paddingHorizontal: 8,
      borderRadius: 10,
    },
    stepperButton: {
      padding: 4,
    },
    servingsText: {
      fontSize: 12,
      fontWeight: "700",
      color: colors.ink,
    },
    findIngredientsBtn: {
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
      backgroundColor: colors.primary,
      paddingVertical: 9,
      paddingHorizontal: 16,
      borderRadius: 12,
    },
    findIngredientsBtnText: {
      color: "#FFFFFF",
      fontSize: 13,
      fontWeight: "700",
    },
    btnDisabled: {
      opacity: 0.7,
    },

    // Popular Dish Pills
    popularDishesRow: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: 8,
    },
    popularDishPill: {
      backgroundColor: "#FFFFFF",
      paddingVertical: 6,
      paddingHorizontal: 12,
      borderRadius: 20,
      borderWidth: 1,
      borderColor: colors.border,
    },
    popularDishPillText: {
      fontSize: 12,
      fontWeight: "600",
      color: colors.ink,
    },

    // Loading State Card
    loadingCard: {
      backgroundColor: colors.card,
      borderRadius: 16,
      padding: 24,
      alignItems: "center",
      gap: 10,
      borderWidth: 1,
      borderColor: colors.border,
    },
    loadingTitle: {
      fontSize: 15,
      fontWeight: "700",
      color: colors.ink,
      textAlign: "center",
    },
    loadingSub: {
      fontSize: 12,
      color: colors.muted,
      textAlign: "center",
      maxWidth: 360,
    },

    // Recipe Header Card
    recipeHeaderCard: {
      backgroundColor: colors.card,
      borderRadius: 18,
      padding: 16,
      borderWidth: 1,
      borderColor: colors.border,
      shadowColor: "#000",
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.05,
      shadowRadius: 8,
      elevation: 2,
    },
    recipeHeaderTop: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "flex-start",
    },
    recipeTitle: {
      fontSize: 19,
      fontWeight: "800",
      color: colors.ink,
      letterSpacing: -0.3,
    },
    servingsPill: {
      flexDirection: "row",
      alignItems: "center",
      gap: 4,
      backgroundColor: colors.surfaceTile,
      paddingVertical: 3,
      paddingHorizontal: 8,
      borderRadius: 12,
    },
    servingsPillText: {
      fontSize: 12,
      fontWeight: "700",
      color: colors.primary,
    },
    favoriteBtn: {
      flexDirection: "row",
      alignItems: "center",
      gap: 4,
      backgroundColor: colors.surfaceTile,
      paddingVertical: 6,
      paddingHorizontal: 12,
      borderRadius: 16,
    },
    favoriteBtnActive: {
      backgroundColor: "#FEECEB",
    },
    favoriteBtnText: {
      fontSize: 12,
      fontWeight: "600",
      color: colors.muted,
    },
    favoriteBtnTextActive: {
      color: "#E53935",
      fontWeight: "700",
    },
    checklistHelperRow: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
      marginTop: 14,
      paddingTop: 12,
      borderTopWidth: 1,
      borderTopColor: colors.hairlineSoft,
      flexWrap: "wrap",
      gap: 8,
    },
    checklistSummaryText: {
      fontSize: 12,
      color: colors.muted,
    },
    helperChip: {
      backgroundColor: colors.surfaceTile,
      paddingVertical: 4,
      paddingHorizontal: 10,
      borderRadius: 8,
    },
    helperChipText: {
      fontSize: 11,
      fontWeight: "600",
      color: colors.ink,
    },

    // Category Filter Chips
    categoryRow: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: 8,
    },
    categoryChip: {
      paddingVertical: 6,
      paddingHorizontal: 14,
      borderRadius: 20,
      backgroundColor: colors.card,
      borderWidth: 1,
      borderColor: colors.border,
    },
    categoryChipActive: {
      backgroundColor: colors.primary,
      borderColor: colors.primary,
    },
    categoryChipText: {
      fontSize: 12,
      fontWeight: "600",
      color: colors.ink,
    },
    categoryChipTextActive: {
      color: "#FFFFFF",
    },

    // Ingredient Product Cards with Real Photos
    ingredientsList: {
      gap: 10,
    },
    ingredientCard: {
      flexDirection: "row",
      alignItems: "center",
      backgroundColor: colors.card,
      borderRadius: 16,
      padding: 12,
      borderWidth: 1,
      borderColor: colors.border,
      gap: 12,
      shadowColor: "#000",
      shadowOffset: { width: 0, height: 1 },
      shadowOpacity: 0.04,
      shadowRadius: 5,
      elevation: 1,
    },
    ingredientCardAtHome: {
      opacity: 0.55,
      backgroundColor: colors.surfaceTile,
    },
    ingredientImage: {
      width: 72,
      height: 72,
      borderRadius: 12,
      backgroundColor: colors.surfaceTile,
    },
    ingredientInfo: {
      flex: 1,
      gap: 3,
    },
    catBadge: {
      paddingHorizontal: 6,
      paddingVertical: 2,
      borderRadius: 6,
    },
    catBadgeText: {
      fontSize: 9,
      fontWeight: "700",
      textTransform: "uppercase",
    },
    recipePortionText: {
      fontSize: 10,
      color: colors.muted,
    },
    ingredientName: {
      fontSize: 15,
      fontWeight: "700",
      color: colors.ink,
    },
    ingredientNameStriked: {
      textDecorationLine: "line-through",
      color: colors.muted,
    },
    packageSizeText: {
      fontSize: 12,
      color: colors.body,
    },
    priceAndStoreRow: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
      marginTop: 2,
    },
    priceTag: {
      fontSize: 14,
      fontWeight: "800",
      color: colors.success,
    },
    miniStoreLinks: {
      flexDirection: "row",
      alignItems: "center",
      gap: 4,
    },
    storeLinksLabel: {
      fontSize: 9,
      color: colors.muted,
      marginRight: 2,
    },
    miniStoreBtn: {
      flexDirection: "row",
      alignItems: "center",
      gap: 3,
      backgroundColor: colors.surfaceTile,
      paddingVertical: 2,
      paddingHorizontal: 5,
      borderRadius: 6,
    },
    miniStoreDot: {
      width: 6,
      height: 6,
      borderRadius: 3,
    },
    miniStoreBtnText: {
      fontSize: 9,
      fontWeight: "600",
      color: colors.ink,
    },
    checkboxBtn: {
      alignItems: "center",
      justifyContent: "center",
      paddingHorizontal: 6,
    },
    checkboxBtnChecked: {},
    checkboxBtnUnchecked: {},
    checkboxLabel: {
      fontSize: 10,
      fontWeight: "700",
      color: colors.muted,
      marginTop: 2,
    },

    // Floating Bottom CTA Card
    bottomCtaCard: {
      backgroundColor: colors.card,
      borderRadius: 16,
      padding: 14,
      borderWidth: 1,
      borderColor: colors.border,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      shadowColor: "#000",
      shadowOffset: { width: 0, height: 3 },
      shadowOpacity: 0.08,
      shadowRadius: 10,
      elevation: 4,
      marginTop: 6,
    },
    bottomCtaTotal: {
      fontSize: 14,
      fontWeight: "800",
      color: colors.ink,
    },
    bottomCtaStoreNotice: {
      fontSize: 11,
      color: colors.success,
      fontWeight: "600",
      marginTop: 2,
    },
    bottomCtaButton: {
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
      backgroundColor: colors.primary,
      paddingVertical: 10,
      paddingHorizontal: 16,
      borderRadius: 12,
    },
    bottomCtaButtonText: {
      fontSize: 13,
      fontWeight: "700",
      color: "#FFFFFF",
    },

    // Tab 2: Buy & Compare Section
    sectionHeaderCard: {
      backgroundColor: colors.card,
      borderRadius: 16,
      padding: 16,
      borderWidth: 1,
      borderColor: colors.border,
    },
    sectionHeading: {
      fontSize: 19,
      fontWeight: "800",
      color: colors.ink,
    },
    sectionSubheading: {
      fontSize: 12,
      color: colors.body,
      marginTop: 4,
      lineHeight: 18,
    },
    savingsBanner: {
      backgroundColor: "#E8F5E9",
      borderRadius: 16,
      padding: 14,
      borderWidth: 1,
      borderColor: "#A5D6A7",
    },
    savingsBadge: {
      alignSelf: "flex-start",
      backgroundColor: colors.success,
      paddingVertical: 3,
      paddingHorizontal: 8,
      borderRadius: 6,
      marginBottom: 6,
    },
    savingsBadgeText: {
      color: "#FFFFFF",
      fontSize: 10,
      fontWeight: "800",
    },
    savingsTitle: {
      fontSize: 15,
      fontWeight: "800",
      color: "#1B5E20",
    },
    savingsSubtitle: {
      fontSize: 12,
      color: "#2E7D32",
      marginTop: 3,
    },

    // Store Cards
    storeCard: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      backgroundColor: colors.card,
      borderRadius: 16,
      padding: 14,
      borderWidth: 1,
      borderColor: colors.border,
      shadowColor: "#000",
      shadowOffset: { width: 0, height: 1 },
      shadowOpacity: 0.04,
      shadowRadius: 4,
      elevation: 1,
    },
    storeCardSelected: {
      borderColor: colors.primary,
      borderWidth: 2,
      backgroundColor: "#FFFBFB",
    },
    storeCardLeft: {
      flexDirection: "row",
      alignItems: "center",
      gap: 12,
      flex: 1,
    },
    storeColorBar: {
      width: 6,
      height: 40,
      borderRadius: 3,
    },
    storeNameText: {
      fontSize: 15,
      fontWeight: "800",
      color: colors.ink,
    },
    bestQuoteTag: {
      backgroundColor: "#E8F5E9",
      paddingVertical: 2,
      paddingHorizontal: 6,
      borderRadius: 6,
    },
    bestQuoteTagText: {
      fontSize: 9,
      fontWeight: "800",
      color: colors.success,
    },
    storeEtaText: {
      fontSize: 12,
      color: colors.muted,
      fontWeight: "600",
    },
    storeCardRight: {
      alignItems: "flex-end",
    },
    storePriceText: {
      fontSize: 17,
      fontWeight: "800",
      color: colors.ink,
    },
    storeItemCountText: {
      fontSize: 11,
      color: colors.muted,
      marginTop: 2,
    },

    // 1-Tap Checkout Panel
    checkoutPanel: {
      backgroundColor: colors.card,
      borderRadius: 18,
      padding: 18,
      borderWidth: 1,
      borderColor: colors.border,
      gap: 12,
    },
    checkoutHeaderRow: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
    },
    checkoutStoreName: {
      fontSize: 16,
      fontWeight: "800",
      color: colors.ink,
    },
    checkoutDeliveryEta: {
      fontSize: 11,
      color: colors.muted,
      marginTop: 2,
    },
    checkoutTotalPrice: {
      fontSize: 20,
      fontWeight: "900",
      color: colors.success,
    },
    primaryCheckoutBtn: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 8,
      backgroundColor: colors.primary,
      paddingVertical: 13,
      borderRadius: 14,
    },
    primaryCheckoutBtnText: {
      fontSize: 14,
      fontWeight: "800",
      color: "#FFFFFF",
    },
    secondaryCheckoutBtn: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 6,
      backgroundColor: colors.surfaceTile,
      paddingVertical: 11,
      borderRadius: 12,
    },
    secondaryCheckoutBtnText: {
      fontSize: 12,
      fontWeight: "700",
      color: colors.ink,
    },
    individualLinksTitle: {
      fontSize: 12,
      fontWeight: "700",
      color: colors.ink,
      marginTop: 4,
    },
    individualItemRow: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
      backgroundColor: colors.surfaceTile,
      padding: 10,
      borderRadius: 10,
    },
    individualItemName: {
      fontSize: 13,
      fontWeight: "700",
      color: colors.ink,
    },
    individualItemPack: {
      fontSize: 11,
      color: colors.muted,
      marginTop: 1,
    },
    individualBuyBtn: {
      flexDirection: "row",
      alignItems: "center",
      gap: 3,
      backgroundColor: "#FFFFFF",
      paddingVertical: 5,
      paddingHorizontal: 10,
      borderRadius: 8,
      borderWidth: 1,
      borderColor: colors.border,
    },
    individualBuyBtnText: {
      fontSize: 11,
      fontWeight: "700",
      color: colors.primary,
    },

    // Tab 3: Favorites Section
    emptyFavoritesCard: {
      backgroundColor: colors.card,
      borderRadius: 18,
      padding: 32,
      alignItems: "center",
      gap: 12,
      borderWidth: 1,
      borderColor: colors.border,
    },
    emptyFavoritesTitle: {
      fontSize: 16,
      fontWeight: "700",
      color: colors.ink,
    },
    emptyFavoritesSub: {
      fontSize: 13,
      color: colors.muted,
      textAlign: "center",
      lineHeight: 18,
      maxWidth: 320,
    },
    exploreDishesBtn: {
      backgroundColor: colors.primary,
      paddingVertical: 10,
      paddingHorizontal: 20,
      borderRadius: 12,
      marginTop: 6,
    },
    exploreDishesBtnText: {
      color: "#FFFFFF",
      fontSize: 13,
      fontWeight: "700",
    },
    favoriteItemCard: {
      flexDirection: "row",
      backgroundColor: colors.card,
      borderRadius: 16,
      overflow: "hidden",
      borderWidth: 1,
      borderColor: colors.border,
      shadowColor: "#000",
      shadowOffset: { width: 0, height: 1 },
      shadowOpacity: 0.04,
      shadowRadius: 5,
      elevation: 1,
    },
    favoriteItemImage: {
      width: 100,
      height: "100%",
      minHeight: 110,
    },
    favoriteItemDetails: {
      flex: 1,
      padding: 12,
      gap: 4,
    },
    favoriteItemTitle: {
      fontSize: 15,
      fontWeight: "800",
      color: colors.ink,
    },
    favoriteItemSub: {
      fontSize: 12,
      color: colors.body,
      lineHeight: 16,
    },
    favoriteItemMeta: {
      fontSize: 10,
      color: colors.muted,
      marginTop: 2,
    },
    favoriteItemActions: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      marginTop: 8,
    },
    cookAgainBtn: {
      flexDirection: "row",
      alignItems: "center",
      gap: 5,
      backgroundColor: colors.primary,
      paddingVertical: 6,
      paddingHorizontal: 12,
      borderRadius: 8,
    },
    cookAgainBtnText: {
      fontSize: 11,
      fontWeight: "700",
      color: "#FFFFFF",
    },
    removeFavBtn: {
      padding: 6,
    },

    // Tab 4: Settings Section
    settingsSectionCard: {
      backgroundColor: colors.card,
      borderRadius: 16,
      padding: 16,
      borderWidth: 1,
      borderColor: colors.border,
      gap: 8,
    },
    settingsSectionTitle: {
      fontSize: 15,
      fontWeight: "800",
      color: colors.ink,
    },
    settingsSectionSub: {
      fontSize: 12,
      color: colors.muted,
      lineHeight: 16,
    },
    changeLocationBtn: {
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
      backgroundColor: colors.surfaceTile,
      paddingVertical: 10,
      paddingHorizontal: 14,
      borderRadius: 10,
      alignSelf: "flex-start",
      marginTop: 4,
    },
    changeLocationBtnText: {
      fontSize: 12,
      fontWeight: "700",
      color: colors.ink,
    },
    providerRow: {
      flexDirection: "row",
      gap: 8,
      marginTop: 6,
    },
    providerChip: {
      flex: 1,
      paddingVertical: 8,
      borderRadius: 10,
      alignItems: "center",
      backgroundColor: colors.surfaceTile,
      borderWidth: 1,
      borderColor: "transparent",
    },
    providerChipActive: {
      backgroundColor: colors.secondary,
      borderColor: colors.primary,
    },
    providerChipText: {
      fontSize: 12,
      fontWeight: "600",
      color: colors.muted,
    },
    providerChipTextActive: {
      color: colors.primary,
      fontWeight: "700",
    },
    inputLabel: {
      fontSize: 11,
      fontWeight: "700",
      color: colors.muted,
      textTransform: "uppercase",
    },
    settingsInput: {
      backgroundColor: colors.surfaceTile,
      borderRadius: 10,
      paddingVertical: 9,
      paddingHorizontal: 12,
      fontSize: 13,
      color: colors.ink,
    },
    saveSettingsBtn: {
      backgroundColor: colors.primary,
      paddingVertical: 11,
      borderRadius: 12,
      alignItems: "center",
      marginTop: 10,
    },
    saveSettingsBtnText: {
      color: "#FFFFFF",
      fontSize: 13,
      fontWeight: "700",
    },

    // Persistent Bottom Navigation Dock
    bottomDock: {
      position: "absolute",
      bottom: 0,
      left: 0,
      right: 0,
      backgroundColor: "#FFFFFF",
      borderTopWidth: 1,
      borderTopColor: colors.border,
      flexDirection: "row",
      justifyContent: "space-around",
      alignItems: "center",
      paddingTop: 10,
      shadowColor: "#000",
      shadowOffset: { width: 0, height: -3 },
      shadowOpacity: 0.05,
      shadowRadius: 8,
      elevation: 6,
    },
    dockTab: {
      alignItems: "center",
      justifyContent: "center",
      gap: 3,
      paddingHorizontal: 10,
    },
    dockTabActive: {},
    dockTabText: {
      fontSize: 10,
      fontWeight: "600",
      color: colors.muted,
    },
    dockTabTextActive: {
      color: colors.primary,
      fontWeight: "700",
    },
  });
}
