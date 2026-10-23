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
  DEFAULT_INITIAL_LOCATION,
  reverseGeocodeCoords,
  searchLocationsByQuery,
  crawlRealTimeStoreETAs,
  getIngredientImage,
  DEFAULT_AI_BASE_URL,
  GROCERY_PACK_SVG,
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
  const [selectedHub, setSelectedHub] = useState<LocationHub>(DEFAULT_INITIAL_LOCATION);
  const [tempHub, setTempHub] = useState<LocationHub>(DEFAULT_INITIAL_LOCATION);
  const [isDetectingLocation, setIsDetectingLocation] = useState(false);
  const [isReverseGeocoding, setIsReverseGeocoding] = useState(false);
  const [showLocationPicker, setShowLocationPicker] = useState(false);
  const [locationSearchInput, setLocationSearchInput] = useState("");
  const [locationSearchResults, setLocationSearchResults] = useState<LocationHub[]>([]);
  const [isSearchingLocation, setIsSearchingLocation] = useState(false);

  // Store Pricing & Delivery Times
  const [liveETAs, setLiveETAs] = useState<Record<StoreId, RealTimeStoreStatus>>(() =>
    crawlRealTimeStoreETAs(DEFAULT_INITIAL_LOCATION).statuses,
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
  const [hasSavedApiKey, setHasSavedApiKey] = useState(false);
  const [legacyKeyDiscarded, setLegacyKeyDiscarded] = useState(false);
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
        setApiKeyInput("");
        setHasSavedApiKey(Boolean(aiCfg.apiKey));
        setLegacyKeyDiscarded(aiCfg.legacyKeyDiscarded);
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

  // Load saved location on startup, or auto-detect via GPS
  useEffect(() => {
    let active = true;
    AsyncStorage.getItem("dish-to-basket.saved-hub.v2")
      .then((raw) => {
        if (!active) return;
        if (raw) {
          try {
            const parsed: LocationHub = JSON.parse(raw);
            setSelectedHub(parsed);
            setTempHub(parsed);
            updateStoreETAs(parsed);
            return;
          } catch {}
        }
        // Auto-detect GPS silently on first launch
        detectLiveGpsLocation(false);
      })
      .catch(() => {});

    return () => {
      active = false;
    };
  }, []);

  // PostMessage listener for Leaflet Map pin drops
  useEffect(() => {
    if (Platform.OS !== "web" || typeof window === "undefined") return;

    const handleMessage = async (event: MessageEvent) => {
      if (event.data && event.data.type === "DISH_MAP_PIN") {
        const { lat, lng } = event.data;
        setIsReverseGeocoding(true);
        try {
          const hub = await reverseGeocodeCoords(lat, lng);
          setTempHub(hub);
        } catch {
          setTempHub((prev) => ({
            ...prev,
            lat,
            lng,
            name: `Pinned (${lat.toFixed(4)}, ${lng.toFixed(4)})`,
          }));
        } finally {
          setIsReverseGeocoding(false);
        }
      }
    };

    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, []);

  // Dynamic Leaflet HTML for Interactive Map Picker
  const mapHtml = useMemo(() => {
    const lat = tempHub.lat ?? selectedHub.lat ?? 12.9716;
    const lng = tempHub.lng ?? selectedHub.lng ?? 77.5946;
    return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no" />
  <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
  <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
  <style>
    * { box-sizing: border-box; }
    body, html, #map { margin: 0; padding: 0; width: 100%; height: 100%; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; }
    .pulse-pin-badge {
      display: flex; align-items: center; justify-content: center;
      width: 38px; height: 38px; border-radius: 50%;
      background: #E65100; color: #FFF; font-size: 18px;
      box-shadow: 0 4px 14px rgba(230, 81, 0, 0.45);
      border: 3px solid #FFFFFF;
      transform: translate(-50%, -50%);
    }
    .map-hint-pill {
      position: absolute; top: 10px; left: 50%; transform: translateX(-50%);
      background: rgba(30, 41, 59, 0.9); backdrop-filter: blur(8px);
      padding: 6px 14px; border-radius: 20px; font-size: 11px; font-weight: 600;
      color: #FFFFFF; box-shadow: 0 4px 12px rgba(0,0,0,0.18); z-index: 1000;
      pointer-events: none;
    }
  </style>
</head>
<body>
  <div class="map-hint-pill">📍 Click map or drag pin to choose delivery spot</div>
  <div id="map"></div>
  <script>
    var map = L.map('map', { zoomControl: true }).setView([${lat}, ${lng}], 15);
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; OpenStreetMap'
    }).addTo(map);

    var pinIcon = L.divIcon({
      className: 'custom-pin-outer',
      html: '<div class="pulse-pin-badge">📍</div>',
      iconSize: [38, 38],
      iconAnchor: [19, 19]
    });

    var marker = L.marker([${lat}, ${lng}], { draggable: true, icon: pinIcon }).addTo(map);

    function dispatchPin(lat, lng) {
      try {
        window.parent.postMessage({ type: 'DISH_MAP_PIN', lat: lat, lng: lng }, '*');
      } catch (e) {}
    }

    marker.on('dragend', function (e) {
      var pos = e.target.getLatLng();
      dispatchPin(pos.lat, pos.lng);
    });

    map.on('click', function (e) {
      marker.setLatLng(e.latlng);
      dispatchPin(e.latlng.lat, e.latlng.lng);
    });

    window.addEventListener('message', function (ev) {
      if (ev.data && ev.data.type === 'PAN_TO_COORDS') {
        map.flyTo([ev.data.lat, ev.data.lng], 16, { animate: true, duration: 1.0 });
        marker.setLatLng([ev.data.lat, ev.data.lng]);
      }
    });
  </script>
</body>
</html>`;
  }, [tempHub.lat, tempHub.lng, selectedHub.lat, selectedHub.lng]);

  function updateStoreETAs(hub: LocationHub) {
    const result = crawlRealTimeStoreETAs(hub);
    setLiveETAs(result.statuses);
  }

  // Location search input handler
  async function handleSearchLocationInput(text: string) {
    setLocationSearchInput(text);
    if (text.trim().length < 3) {
      setLocationSearchResults([]);
      return;
    }
    setIsSearchingLocation(true);
    try {
      const results = await searchLocationsByQuery(text);
      setLocationSearchResults(results);
    } catch {
      setLocationSearchResults([]);
    } finally {
      setIsSearchingLocation(false);
    }
  }

  function handleSelectSearchResult(hub: LocationHub) {
    setTempHub(hub);
    setLocationSearchInput("");
    setLocationSearchResults([]);
    if (Platform.OS === "web" && typeof document !== "undefined") {
      const iframes = document.querySelectorAll("iframe");
      iframes.forEach((ifr) => {
        ifr.contentWindow?.postMessage(
          { type: "PAN_TO_COORDS", lat: hub.lat, lng: hub.lng },
          "*",
        );
      });
    }
  }

  // Live High Accuracy GPS detection
  async function detectLiveGpsLocation(userInitiated = true) {
    setIsDetectingLocation(true);
    if (typeof navigator !== "undefined" && navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        async (position) => {
          try {
            const { latitude, longitude } = position.coords;
            const hub = await reverseGeocodeCoords(latitude, longitude);
            setSelectedHub(hub);
            setTempHub(hub);
            updateStoreETAs(hub);
            AsyncStorage.setItem("dish-to-basket.saved-hub.v2", JSON.stringify(hub)).catch(() => {});
            flash(`GPS: ${hub.name}, ${hub.city} (${hub.pincode})`);

            if (Platform.OS === "web" && typeof document !== "undefined") {
              const iframes = document.querySelectorAll("iframe");
              iframes.forEach((ifr) => {
                ifr.contentWindow?.postMessage(
                  { type: "PAN_TO_COORDS", lat: hub.lat, lng: hub.lng },
                  "*",
                );
              });
            }

            if (userInitiated) {
              setShowLocationPicker(false);
            }
          } catch {
            flash("GPS resolved coordinates, but reverse lookup failed.");
          } finally {
            setIsDetectingLocation(false);
          }
        },
        () => {
          setIsDetectingLocation(false);
          if (userInitiated) {
            flash("GPS permission denied or timeout. Please search or pick on map.");
          }
        },
        { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 },
      );
    } else {
      setIsDetectingLocation(false);
      if (userInitiated) {
        flash("GPS not available on this browser. Please pick on map.");
      }
    }
  }

  function confirmMapLocation() {
    setSelectedHub(tempHub);
    updateStoreETAs(tempHub);
    AsyncStorage.setItem("dish-to-basket.saved-hub.v2", JSON.stringify(tempHub)).catch(() => {});
    setShowLocationPicker(false);
    flash(`Delivery location updated: ${tempHub.name}, ${tempHub.city} (${tempHub.pincode})`);
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
          GROCERY_PACK_SVG,
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
    try {
      await saveAiConfig({
        provider: aiProvider,
        apiKey: apiKeyInput.trim() || undefined,
        baseUrl: baseUrlInput.trim(),
        model: modelInput.trim(),
      });
      const savedConfig = await getAiConfig();
      setHasSavedApiKey(Boolean(savedConfig.apiKey));
      setLegacyKeyDiscarded(false);
      setApiKeyInput("");
      flash(
        apiKeyInput.trim()
          ? "Settings saved. Your API key is stored securely on this device."
          : savedConfig.apiKey
            ? "Settings saved. Your saved API key was kept."
            : "Settings saved successfully.",
      );
    } catch (error) {
      flash(error instanceof Error ? error.message : "Could not save settings securely.");
    }
  }

  async function handleRemoveApiKey() {
    try {
      await saveAiConfig({
        provider: aiProvider,
        clearApiKey: true,
        baseUrl: baseUrlInput.trim(),
        model: modelInput.trim(),
      });
      setHasSavedApiKey(false);
      setLegacyKeyDiscarded(false);
      setApiKeyInput("");
      flash("Saved NVIDIA API key removed from this device.");
    } catch (error) {
      flash(error instanceof Error ? error.message : "Could not remove the saved API key.");
    }
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

        {/* Full GPS + Interactive Map Location Modal */}
        {showLocationPicker && (
          <View style={styles.locationModalCard}>
            {/* Modal Header */}
            <View style={styles.locationModalHeader}>
              <View style={{ flex: 1 }}>
                <Text style={styles.locationModalTitle}>Delivery Location</Text>
                <Text style={styles.locationModalSub}>
                  Accurate GPS or pinpoint anywhere on interactive map
                </Text>
              </View>
              <Pressable
                onPress={() => setShowLocationPicker(false)}
                style={styles.modalCloseBtn}
              >
                <Feather name="x" size={18} color={colors.ink} />
              </Pressable>
            </View>

            {/* High-Accuracy GPS Action Button */}
            <Pressable
              onPress={() => detectLiveGpsLocation(true)}
              disabled={isDetectingLocation}
              style={styles.gpsActionBtn}
            >
              {isDetectingLocation ? (
                <ActivityIndicator size="small" color="#FFFFFF" />
              ) : (
                <Feather name="crosshair" size={18} color="#FFFFFF" />
              )}
              <View style={{ flex: 1 }}>
                <Text style={styles.gpsActionBtnTitle}>
                  {isDetectingLocation ? "Detecting High-Accuracy GPS..." : "Use Current GPS Location"}
                </Text>
                <Text style={styles.gpsActionBtnSub}>
                  Instant coordinates via device sensor & live reverse geocoding
                </Text>
              </View>
              <Feather name="chevron-right" size={16} color="#FFFFFF" />
            </Pressable>

            {/* Address Search Bar */}
            <View style={styles.locationSearchBox}>
              <Feather name="search" size={16} color={colors.primary} />
              <TextInput
                value={locationSearchInput}
                onChangeText={handleSearchLocationInput}
                placeholder="Search any locality, street, landmark, or pincode..."
                placeholderTextColor={colors.muted}
                style={styles.locationSearchInput}
              />
              {isSearchingLocation && (
                <ActivityIndicator size="small" color={colors.primary} />
              )}
              {locationSearchInput.length > 0 && !isSearchingLocation && (
                <Pressable onPress={() => { setLocationSearchInput(""); setLocationSearchResults([]); }}>
                  <Feather name="x-circle" size={16} color={colors.muted} />
                </Pressable>
              )}
            </View>

            {/* Live Search Suggestions */}
            {locationSearchResults.length > 0 && (
              <View style={styles.searchResultsList}>
                {locationSearchResults.map((res) => (
                  <Pressable
                    key={res.id}
                    onPress={() => handleSelectSearchResult(res)}
                    style={styles.searchResultItem}
                  >
                    <Ionicons name="location-outline" size={18} color={colors.primary} style={{ marginTop: 2 }} />
                    <View style={{ flex: 1 }}>
                      <Text style={styles.searchResultTitle}>{res.name}</Text>
                      <Text style={styles.searchResultAddress} numberOfLines={2}>
                        {res.formattedAddress || `${res.city} (${res.pincode})`}
                      </Text>
                    </View>
                  </Pressable>
                ))}
              </View>
            )}

            {/* Interactive Leaflet OpenStreetMap */}
            <View style={styles.mapContainer}>
              {Platform.OS === "web" ? (
                React.createElement("iframe", {
                  title: "Interactive Delivery Map",
                  srcDoc: mapHtml,
                  style: {
                    width: "100%",
                    height: 260,
                    border: "none",
                    borderRadius: 14,
                  },
                })
              ) : (
                <View style={styles.mobileMapFallback}>
                  <Ionicons name="map-outline" size={32} color={colors.primary} />
                  <Text style={styles.mobileMapText}>Map interactive on web browser</Text>
                </View>
              )}
            </View>

            {/* Pinned Location Live Summary Card */}
            <View style={styles.pinnedAddressCard}>
              <View style={styles.pinnedHeaderRow}>
                <View style={styles.pinnedIconBubble}>
                  <Ionicons name="location" size={18} color="#FFFFFF" />
                </View>
                <View style={{ flex: 1 }}>
                  <View style={styles.pinnedTitleRow}>
                    <Text style={styles.pinnedLocalityName}>
                      {tempHub.name || "Pinned Location"}
                    </Text>
                    {isReverseGeocoding && (
                      <ActivityIndicator size="small" color={colors.primary} style={{ marginLeft: 8 }} />
                    )}
                  </View>
                  <Text style={styles.pinnedFullAddress} numberOfLines={2}>
                    {tempHub.formattedAddress || `${tempHub.city}, India (${tempHub.pincode})`}
                  </Text>
                </View>
              </View>

              {tempHub.lat && tempHub.lng && (
                <View style={styles.coordsRow}>
                  <Text style={styles.coordsText}>
                    Coords: {tempHub.lat.toFixed(4)}° N, {tempHub.lng.toFixed(4)}° E
                  </Text>
                  <Text style={styles.darkStoreClusterText}>
                    {tempHub.darkStoreCluster}
                  </Text>
                </View>
              )}
            </View>

            {/* Confirm Location Button */}
            <Pressable
              onPress={confirmMapLocation}
              style={styles.confirmLocationBtn}
            >
              <Ionicons name="checkmark-circle" size={18} color="#FFFFFF" />
              <Text style={styles.confirmLocationBtnText}>Confirm Delivery Location</Text>
            </Pressable>
          </View>
        )}

        {/* TAB 1: COOK & INGREDIENTS (Main Screen) */}
        {activeTab === "cook" && (
          <View style={styles.tabSection}>
            {/* Grand Culinary Hero Banner */}
            <View style={styles.heroBanner}>
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
            </View>

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
                  <Text style={styles.settingsSectionSub}>
                    {hasSavedApiKey
                      ? "A key is saved in this device's secure storage. Leave this blank to keep it, or enter a new key to replace it."
                      : "Enter your NVIDIA NIM key. It is saved using platform secure storage where supported and sent to your configured model provider for AI requests."}
                  </Text>
                  {legacyKeyDiscarded && (
                    <Text style={[styles.settingsSectionSub, { color: colors.primary }]}>
                      A key from an older app version was removed from unencrypted storage. Enter it again to use NVIDIA NIM.
                    </Text>
                  )}
                  <TextInput
                    value={apiKeyInput}
                    onChangeText={setApiKeyInput}
                    secureTextEntry
                    autoCapitalize="none"
                    autoCorrect={false}
                    placeholder={hasSavedApiKey ? "Enter a new key to replace" : "nvapi-..."}
                    placeholderTextColor={colors.muted}
                    style={styles.settingsInput}
                  />

                  {hasSavedApiKey && (
                    <Pressable onPress={handleRemoveApiKey} style={styles.changeLocationBtn}>
                      <Feather name="trash-2" size={14} color={colors.ink} />
                      <Text style={styles.changeLocationBtnText}>Remove saved key</Text>
                    </Pressable>
                  )}

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

    // GPS & Interactive Map Location Modal
    locationModalCard: {
      backgroundColor: colors.card,
      borderRadius: 20,
      padding: 18,
      marginBottom: 18,
      borderWidth: 1,
      borderColor: colors.border,
      shadowColor: "#000",
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.08,
      shadowRadius: 16,
      elevation: 4,
    },
    locationModalHeader: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "flex-start",
      marginBottom: 14,
    },
    locationModalTitle: {
      fontSize: 16,
      fontWeight: "800",
      color: colors.ink,
      letterSpacing: -0.3,
    },
    locationModalSub: {
      fontSize: 12,
      color: colors.muted,
      marginTop: 2,
    },
    modalCloseBtn: {
      padding: 6,
      borderRadius: 20,
      backgroundColor: colors.surfaceTile,
    },
    gpsActionBtn: {
      flexDirection: "row",
      alignItems: "center",
      gap: 12,
      backgroundColor: colors.primary,
      paddingVertical: 12,
      paddingHorizontal: 14,
      borderRadius: 14,
      marginBottom: 14,
      shadowColor: colors.primary,
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.25,
      shadowRadius: 6,
      elevation: 3,
    },
    gpsActionBtnTitle: {
      fontSize: 13,
      fontWeight: "700",
      color: "#FFFFFF",
    },
    gpsActionBtnSub: {
      fontSize: 10.5,
      color: "rgba(255, 255, 255, 0.85)",
      marginTop: 1,
    },
    locationSearchBox: {
      flexDirection: "row",
      alignItems: "center",
      gap: 10,
      backgroundColor: colors.surfaceTile,
      borderRadius: 12,
      paddingHorizontal: 12,
      paddingVertical: 8,
      borderWidth: 1,
      borderColor: colors.border,
      marginBottom: 12,
    },
    locationSearchInput: {
      flex: 1,
      fontSize: 13,
      fontWeight: "500",
      color: colors.ink,
      padding: 0,
    },
    searchResultsList: {
      backgroundColor: colors.card,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: colors.border,
      marginBottom: 12,
      overflow: "hidden",
      maxHeight: 180,
    },
    searchResultItem: {
      flexDirection: "row",
      alignItems: "flex-start",
      gap: 10,
      padding: 10,
      borderBottomWidth: 1,
      borderBottomColor: colors.surfaceTile,
    },
    searchResultTitle: {
      fontSize: 13,
      fontWeight: "700",
      color: colors.ink,
    },
    searchResultAddress: {
      fontSize: 11,
      color: colors.muted,
      marginTop: 2,
    },
    mapContainer: {
      height: 260,
      borderRadius: 14,
      overflow: "hidden",
      borderWidth: 1,
      borderColor: colors.border,
      marginBottom: 14,
      backgroundColor: "#F1F5F9",
    },
    mobileMapFallback: {
      flex: 1,
      justifyContent: "center",
      alignItems: "center",
      gap: 8,
    },
    mobileMapText: {
      fontSize: 12,
      color: colors.muted,
      fontWeight: "500",
    },
    pinnedAddressCard: {
      backgroundColor: colors.surfaceTile,
      borderRadius: 14,
      padding: 12,
      borderWidth: 1,
      borderColor: colors.border,
      marginBottom: 14,
    },
    pinnedHeaderRow: {
      flexDirection: "row",
      alignItems: "flex-start",
      gap: 10,
    },
    pinnedIconBubble: {
      width: 32,
      height: 32,
      borderRadius: 16,
      backgroundColor: colors.primary,
      alignItems: "center",
      justifyContent: "center",
    },
    pinnedTitleRow: {
      flexDirection: "row",
      alignItems: "center",
    },
    pinnedLocalityName: {
      fontSize: 14,
      fontWeight: "700",
      color: colors.ink,
    },
    pinnedFullAddress: {
      fontSize: 11,
      color: colors.muted,
      marginTop: 2,
      lineHeight: 16,
    },
    coordsRow: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
      marginTop: 8,
      paddingTop: 8,
      borderTopWidth: 1,
      borderTopColor: "rgba(0,0,0,0.05)",
    },
    coordsText: {
      fontSize: 10,
      fontWeight: "600",
      color: colors.primary,
    },
    darkStoreClusterText: {
      fontSize: 10,
      color: colors.muted,
    },
    confirmLocationBtn: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 8,
      backgroundColor: colors.primary,
      paddingVertical: 12,
      borderRadius: 14,
      shadowColor: colors.primary,
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.2,
      shadowRadius: 6,
      elevation: 3,
    },
    confirmLocationBtnText: {
      fontSize: 14,
      fontWeight: "700",
      color: "#FFFFFF",
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
