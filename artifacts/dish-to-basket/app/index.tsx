import AsyncStorage from "@react-native-async-storage/async-storage";
import { Feather } from "@expo/vector-icons";
import { useAnalyzeIngredientPlan } from "@workspace/api-client-react";
import React, { useEffect, useMemo, useState } from "react";
import {
  Alert,
  Linking,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { StatusBar } from "expo-status-bar";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { KeyboardAwareScrollViewCompat } from "@/components/KeyboardAwareScrollViewCompat";
import { useColors } from "@/hooks/useColors";

type StoreId = "blinkit" | "jiomart" | "bigbasket";
type PriceEntry = { productName: string; price: string };
type IngredientPlanItem = {
  name: string;
  quantity: number;
  unit: string;
  category: string;
  notes: string;
  usedIn: string[];
};
type Ingredient = IngredientPlanItem & {
  id: string;
  haveAtHome: boolean;
  prices: Record<StoreId, PriceEntry>;
};
type Store = {
  id: StoreId;
  label: string;
  searchUrl: (query: string) => string;
};

const STORAGE_KEY = "dish-to-basket.plan.v1";
const STORES: Store[] = [
  {
    id: "blinkit",
    label: "Blinkit",
    searchUrl: (query) => `https://blinkit.com/s/?q=${encodeURIComponent(query)}`,
  },
  {
    id: "jiomart",
    label: "JioMart",
    searchUrl: (query) =>
      `https://www.jiomart.com/search/all?query=${encodeURIComponent(query)}`,
  },
  {
    id: "bigbasket",
    label: "BigBasket",
    searchUrl: (query) => `https://www.bigbasket.com/ps/?q=${encodeURIComponent(query)}`,
  },
];

function makePriceEntries(name: string): Record<StoreId, PriceEntry> {
  return {
    blinkit: { productName: name, price: "" },
    jiomart: { productName: name, price: "" },
    bigbasket: { productName: name, price: "" },
  };
}

function formatRupees(amount: number): string {
  return `₹${amount.toLocaleString("en-IN", {
    maximumFractionDigits: 2,
    minimumFractionDigits: amount % 1 === 0 ? 0 : 2,
  })}`;
}

function createStyles(colors: ReturnType<typeof useColors>) {
  return StyleSheet.create({
    scroll: { flex: 1 },
    content: { paddingHorizontal: 20, gap: 18 },
    brandRow: {
      alignItems: "center",
      flexDirection: "row",
      gap: 10,
      justifyContent: "space-between",
    },
    brandLeft: { alignItems: "center", flexDirection: "row", gap: 9 },
    brandIcon: {
      alignItems: "center",
      backgroundColor: colors.primary,
      borderRadius: 13,
      height: 38,
      justifyContent: "center",
      width: 38,
    },
    brandName: { color: colors.foreground, fontFamily: "Inter_700Bold", fontSize: 16 },
    savedPill: {
      alignItems: "center",
      backgroundColor: colors.card,
      borderColor: colors.border,
      borderRadius: 30,
      borderWidth: 1,
      flexDirection: "row",
      gap: 6,
      paddingHorizontal: 10,
      paddingVertical: 7,
    },
    savedDot: { backgroundColor: colors.primary, borderRadius: 4, height: 7, width: 7 },
    savedText: { color: colors.mutedForeground, fontFamily: "Inter_500Medium", fontSize: 10 },
    hero: { gap: 6, paddingBottom: 2, paddingTop: 4 },
    eyebrow: {
      color: colors.primary,
      fontFamily: "Inter_700Bold",
      fontSize: 10,
      letterSpacing: 1.4,
    },
    headline: {
      color: colors.foreground,
      fontFamily: "Inter_700Bold",
      fontSize: 31,
      letterSpacing: -1.1,
      lineHeight: 37,
    },
    body: { color: colors.mutedForeground, fontFamily: "Inter_400Regular", fontSize: 14, lineHeight: 21 },
    card: {
      backgroundColor: colors.card,
      borderColor: colors.border,
      borderRadius: 20,
      borderWidth: 1,
      padding: 16,
    },
    sectionHeader: {
      alignItems: "center",
      flexDirection: "row",
      gap: 10,
      marginBottom: 14,
    },
    step: {
      alignItems: "center",
      backgroundColor: colors.accent,
      borderRadius: 10,
      height: 32,
      justifyContent: "center",
      width: 32,
    },
    stepText: { color: colors.primary, fontFamily: "Inter_700Bold", fontSize: 11 },
    sectionTitle: { color: colors.foreground, fontFamily: "Inter_700Bold", fontSize: 16 },
    sectionSubTitle: { color: colors.mutedForeground, fontFamily: "Inter_400Regular", fontSize: 12, marginTop: 2 },
    fieldLabel: { color: colors.mutedForeground, fontFamily: "Inter_600SemiBold", fontSize: 11, marginBottom: 7 },
    dishInput: {
      backgroundColor: colors.background,
      borderColor: colors.border,
      borderRadius: 13,
      borderWidth: 1,
      color: colors.foreground,
      flex: 1,
      fontFamily: "Inter_400Regular",
      fontSize: 14,
      minHeight: 48,
      paddingHorizontal: 13,
    },
    inputRow: { alignItems: "center", flexDirection: "row", gap: 8 },
    addButton: {
      alignItems: "center",
      backgroundColor: colors.primary,
      borderRadius: 13,
      height: 48,
      justifyContent: "center",
      width: 48,
    },
    pressed: { opacity: 0.78, transform: [{ scale: 0.98 }] },
    disabled: { opacity: 0.48 },
    chips: { flexDirection: "row", flexWrap: "wrap", gap: 7, marginTop: 10 },
    dishChip: {
      alignItems: "center",
      backgroundColor: colors.accent,
      borderRadius: 20,
      flexDirection: "row",
      gap: 6,
      paddingLeft: 11,
      paddingRight: 7,
      paddingVertical: 7,
    },
    dishChipText: { color: colors.foreground, fontFamily: "Inter_500Medium", fontSize: 12 },
    chipRemove: { alignItems: "center", borderRadius: 12, height: 22, justifyContent: "center", width: 22 },
    controlRow: {
      alignItems: "center",
      borderTopColor: colors.border,
      borderTopWidth: 1,
      flexDirection: "row",
      justifyContent: "space-between",
      marginTop: 15,
      paddingTop: 13,
    },
    servingsLabel: { color: colors.foreground, fontFamily: "Inter_600SemiBold", fontSize: 13 },
    servingsHint: { color: colors.mutedForeground, fontFamily: "Inter_400Regular", fontSize: 11, marginTop: 3 },
    stepper: { alignItems: "center", flexDirection: "row", gap: 13 },
    stepperButton: {
      alignItems: "center",
      backgroundColor: colors.background,
      borderColor: colors.border,
      borderRadius: 11,
      borderWidth: 1,
      height: 34,
      justifyContent: "center",
      width: 34,
    },
    servingCount: { color: colors.foreground, fontFamily: "Inter_700Bold", fontSize: 16, minWidth: 18, textAlign: "center" },
    primaryButton: {
      alignItems: "center",
      backgroundColor: colors.primary,
      borderRadius: 14,
      flexDirection: "row",
      gap: 9,
      justifyContent: "center",
      minHeight: 50,
      marginTop: 15,
      paddingHorizontal: 14,
    },
    primaryButtonText: { color: colors.primaryForeground, fontFamily: "Inter_700Bold", fontSize: 14 },
    helperText: { color: colors.mutedForeground, fontFamily: "Inter_400Regular", fontSize: 11, lineHeight: 17, marginTop: 9 },
    errorText: { color: colors.destructive, fontFamily: "Inter_500Medium", fontSize: 12, lineHeight: 18, marginTop: 10 },
    modelBadge: {
      alignSelf: "flex-start",
      backgroundColor: colors.accent,
      borderRadius: 20,
      marginTop: 10,
      paddingHorizontal: 10,
      paddingVertical: 6,
    },
    modelBadgeText: { color: colors.primary, fontFamily: "Inter_600SemiBold", fontSize: 10 },
    listHeader: { alignItems: "flex-start", flexDirection: "row", justifyContent: "space-between", marginBottom: 11 },
    countBadge: {
      backgroundColor: colors.accent,
      borderRadius: 20,
      paddingHorizontal: 9,
      paddingVertical: 6,
    },
    countText: { color: colors.primary, fontFamily: "Inter_700Bold", fontSize: 10 },
    itemRow: {
      borderTopColor: colors.border,
      borderTopWidth: 1,
      flexDirection: "row",
      gap: 10,
      paddingVertical: 12,
    },
    pantryToggle: {
      alignItems: "center",
      borderColor: colors.border,
      borderRadius: 12,
      borderWidth: 1.5,
      height: 24,
      justifyContent: "center",
      marginTop: 1,
      width: 24,
    },
    itemContent: { flex: 1, gap: 4 },
    itemName: { color: colors.foreground, fontFamily: "Inter_600SemiBold", fontSize: 14 },
    itemDetail: { color: colors.mutedForeground, fontFamily: "Inter_400Regular", fontSize: 11, lineHeight: 16 },
    haveText: { color: colors.primary, fontFamily: "Inter_600SemiBold", fontSize: 10, marginTop: 2 },
    iconButton: { alignItems: "center", borderRadius: 12, height: 30, justifyContent: "center", width: 30 },
    addIngredientRow: { alignItems: "center", flexDirection: "row", gap: 8, marginTop: 10 },
    compareTop: { alignItems: "center", flexDirection: "row", justifyContent: "space-between", marginBottom: 14 },
    liveNote: { color: colors.mutedForeground, fontFamily: "Inter_500Medium", fontSize: 10 },
    bestBanner: {
      backgroundColor: colors.accent,
      borderRadius: 14,
      flexDirection: "row",
      gap: 10,
      marginBottom: 13,
      padding: 12,
    },
    bestIcon: { alignItems: "center", justifyContent: "center", width: 24 },
    bestTextWrap: { flex: 1, gap: 2 },
    bestTitle: { color: colors.foreground, fontFamily: "Inter_700Bold", fontSize: 12 },
    bestSubtitle: { color: colors.mutedForeground, fontFamily: "Inter_400Regular", fontSize: 11, lineHeight: 16 },
    storeSelector: { flexDirection: "row", gap: 7, marginBottom: 14 },
    storeTab: {
      alignItems: "center",
      backgroundColor: colors.background,
      borderColor: colors.border,
      borderRadius: 13,
      borderWidth: 1,
      flex: 1,
      gap: 4,
      paddingHorizontal: 4,
      paddingVertical: 10,
    },
    storeTabActive: { backgroundColor: colors.primary, borderColor: colors.primary },
    storeTabName: { color: colors.foreground, fontFamily: "Inter_600SemiBold", fontSize: 10, textAlign: "center" },
    storeTabTotal: { color: colors.mutedForeground, fontFamily: "Inter_700Bold", fontSize: 11 },
    storeTabCoverage: { color: colors.mutedForeground, fontFamily: "Inter_400Regular", fontSize: 9 },
    activeStoreText: { color: colors.primaryForeground },
    storeLine: {
      borderTopColor: colors.border,
      borderTopWidth: 1,
      paddingTop: 12,
      marginTop: 2,
    },
    storeLineTop: { alignItems: "flex-start", flexDirection: "row", justifyContent: "space-between", marginBottom: 8 },
    storeItemName: { color: colors.foreground, flex: 1, fontFamily: "Inter_600SemiBold", fontSize: 13 },
    storeItemQuantity: { color: colors.mutedForeground, fontFamily: "Inter_500Medium", fontSize: 11, marginLeft: 8 },
    fieldsRow: { flexDirection: "row", gap: 8 },
    productField: { flex: 1 },
    priceField: { width: 102 },
    compactInput: {
      backgroundColor: colors.background,
      borderColor: colors.border,
      borderRadius: 10,
      borderWidth: 1,
      color: colors.foreground,
      fontFamily: "Inter_400Regular",
      fontSize: 12,
      height: 40,
      paddingHorizontal: 10,
    },
    compactLabel: { color: colors.mutedForeground, fontFamily: "Inter_500Medium", fontSize: 9, marginBottom: 4 },
    searchButton: {
      alignItems: "center",
      alignSelf: "flex-start",
      backgroundColor: colors.background,
      borderColor: colors.border,
      borderRadius: 10,
      borderWidth: 1,
      flexDirection: "row",
      gap: 7,
      marginTop: 8,
      paddingHorizontal: 11,
      paddingVertical: 8,
    },
    searchButtonText: { color: colors.primary, fontFamily: "Inter_600SemiBold", fontSize: 11 },
    footnote: { color: colors.mutedForeground, fontFamily: "Inter_400Regular", fontSize: 10, lineHeight: 16, marginTop: 12 },
    emptyState: {
      alignItems: "center",
      backgroundColor: colors.card,
      borderColor: colors.border,
      borderRadius: 17,
      borderWidth: 1,
      gap: 7,
      padding: 19,
    },
    emptyTitle: { color: colors.foreground, fontFamily: "Inter_700Bold", fontSize: 14, textAlign: "center" },
    emptyText: { color: colors.mutedForeground, fontFamily: "Inter_400Regular", fontSize: 12, lineHeight: 18, textAlign: "center" },
    footerText: { color: colors.mutedForeground, fontFamily: "Inter_400Regular", fontSize: 10, lineHeight: 16, textAlign: "center" },
  });
}

export default function HomeScreen() {
  const colors = useColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const insets = useSafeAreaInsets();
  const analysis = useAnalyzeIngredientPlan();
  const [draftDish, setDraftDish] = useState("");
  const [dishes, setDishes] = useState<string[]>([]);
  const [servings, setServings] = useState(2);
  const [ingredients, setIngredients] = useState<Ingredient[]>([]);
  const [manualIngredient, setManualIngredient] = useState("");
  const [selectedStore, setSelectedStore] = useState<StoreId>("blinkit");
  const [analysisError, setAnalysisError] = useState<string | null>(null);
  const [analysisModel, setAnalysisModel] = useState<string | null>(null);
  const [storageError, setStorageError] = useState(false);
  const [hydrated, setHydrated] = useState(false);
  const [dishEntryError, setDishEntryError] = useState<string | null>(null);
  const [analysisSignature, setAnalysisSignature] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    AsyncStorage.getItem(STORAGE_KEY)
      .then((stored) => {
        if (!active || !stored) return;
        const saved: unknown = JSON.parse(stored);
        if (typeof saved !== "object" || saved === null) return;
        const record = saved as Record<string, unknown>;
        if (Array.isArray(record.dishes)) {
          setDishes(record.dishes.filter((dish): dish is string => typeof dish === "string"));
        }
        if (
          typeof record.servings === "number" &&
          Number.isInteger(record.servings) &&
          record.servings >= 1 &&
          record.servings <= 24
        ) {
          setServings(record.servings);
        }
        if (Array.isArray(record.ingredients)) {
          setIngredients(record.ingredients as Ingredient[]);
        }
        if (typeof record.analysisModel === "string") {
          setAnalysisModel(record.analysisModel);
        }
        if (typeof record.analysisSignature === "string") {
          setAnalysisSignature(record.analysisSignature);
        }
      })
      .catch(() => {
        if (active) setStorageError(true);
      })
      .finally(() => {
        if (active) setHydrated(true);
      });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    AsyncStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ dishes, servings, ingredients, analysisModel, analysisSignature }),
    ).catch(() => setStorageError(true));
  }, [analysisModel, analysisSignature, dishes, hydrated, ingredients, servings]);

  const currentSignature = JSON.stringify({ dishes, servings });
  const planIsCurrent = ingredients.length > 0 && analysisSignature === currentSignature;

  const activeIngredients = useMemo(
    () => ingredients.filter((ingredient) => !ingredient.haveAtHome),
    [ingredients],
  );

  const storeStats = useMemo(
    () =>
      STORES.map((store) => {
        const pricedItems = activeIngredients
          .map((ingredient) => {
            const value = Number(ingredient.prices[store.id]?.price);
            return Number.isFinite(value) && value > 0 ? value : null;
          })
          .filter((value): value is number => value !== null);
        const total = pricedItems.reduce((sum, value) => sum + value, 0);
        return {
          ...store,
          total,
          pricedCount: pricedItems.length,
          complete: activeIngredients.length > 0 && pricedItems.length === activeIngredients.length,
        };
      }),
    [activeIngredients],
  );
  const bestStore = useMemo(
    () =>
      storeStats
        .filter((store) => store.complete && planIsCurrent)
        .sort((first, second) => first.total - second.total)[0] ?? null,
    [planIsCurrent, storeStats],
  );
  const currentStore = STORES.find((store) => store.id === selectedStore) ?? STORES[0];

  function addDishFromInput() {
    const incoming = draftDish
      .split(/[,\n;]+/)
      .map((dish) => dish.trim())
      .filter(Boolean);
    if (incoming.length === 0) return;
    const nextDishes = Array.from(new Set([...dishes, ...incoming]));
    if (nextDishes.length > 8) {
      setDishEntryError("The list supports up to 8 dishes. Only the first 8 were added.");
    } else {
      setDishEntryError(null);
    }
    setDishes(nextDishes.slice(0, 8));
    setDraftDish("");
    setAnalysisError(null);
  }

  async function analyzeDishes() {
    if (dishes.length === 0) {
      setAnalysisError("Add at least one dish before making an ingredient plan.");
      return;
    }
    setAnalysisError(null);
    try {
      const result = await analysis.mutateAsync({ data: { dishes, servings } });
      const now = Date.now();
      setIngredients(
        result.ingredients.map((ingredient, index) => ({
          ...ingredient,
          id: `${now}-${index}`,
          haveAtHome: false,
          prices: makePriceEntries(ingredient.name),
        })),
      );
      setAnalysisModel(`${result.provider} · ${result.model}`);
      setAnalysisSignature(currentSignature);
    } catch {
      setAnalysisError(
        "Ingredient analysis failed. Check the NVIDIA NIM model configuration and try again.",
      );
    }
  }

  function updatePrice(
    ingredientId: string,
    field: keyof PriceEntry,
    value: string,
  ) {
    setIngredients((current) =>
      current.map((ingredient) =>
        ingredient.id === ingredientId
          ? {
              ...ingredient,
              prices: {
                ...ingredient.prices,
                [selectedStore]: {
                  ...ingredient.prices[selectedStore],
                  [field]: value,
                },
              },
            }
          : ingredient,
      ),
    );
  }

  function addManualIngredient() {
    const name = manualIngredient.trim();
    if (!name) return;
    setIngredients((current) => [
      ...current,
      {
        id: `${Date.now()}-manual`,
        name,
        quantity: 1,
        unit: "item",
        category: "Other",
        notes: "Added by you",
        usedIn: [],
        haveAtHome: false,
        prices: makePriceEntries(name),
      },
    ]);
    setManualIngredient("");
  }

  async function openStoreSearch(ingredientName: string) {
    try {
      await Linking.openURL(currentStore.searchUrl(ingredientName));
    } catch {
      Alert.alert("Could not open retailer", "Try opening the retailer website from your browser.");
    }
  }

  return (
    <KeyboardAwareScrollViewCompat
      style={[styles.scroll, { backgroundColor: colors.background }]}
      contentContainerStyle={[
        styles.content,
        {
          paddingTop: Platform.OS === "web" ? 67 : insets.top + 15,
          paddingBottom: (Platform.OS === "web" ? 34 : insets.bottom) + 28,
        },
      ]}
      keyboardShouldPersistTaps="handled"
      bottomOffset={40}
      showsVerticalScrollIndicator={false}
    >
      <StatusBar style="dark" />
      <View style={styles.brandRow}>
        <View style={styles.brandLeft}>
          <View style={styles.brandIcon}>
            <Feather name="shopping-bag" size={19} color={colors.primaryForeground} />
          </View>
          <Text style={styles.brandName}>Dish to Basket</Text>
        </View>
        <View style={styles.savedPill}>
          <View style={styles.savedDot} />
          <Text style={styles.savedText}>{hydrated ? "Saved on this device" : "Loading your list"}</Text>
        </View>
      </View>

      <View style={styles.hero}>
        <Text style={styles.eyebrow}>PLAN THE MEAL. PRICE THE BASKET.</Text>
        <Text style={styles.headline}>
          Menu in.{"\n"}
          <Text style={{ color: colors.primary }}>Cart out.</Text>
        </Text>
        <Text style={styles.body}>
          Add the dishes you want to cook. Get one ingredient list, then compare the prices you find at each store.
        </Text>
      </View>

      <View style={styles.card}>
        <View style={styles.sectionHeader}>
          <View style={styles.step}><Text style={styles.stepText}>01</Text></View>
          <View>
            <Text style={styles.sectionTitle}>What are you cooking?</Text>
            <Text style={styles.sectionSubTitle}>Add up to 8 dishes for one shared shopping list.</Text>
          </View>
        </View>

        <Text style={styles.fieldLabel}>DISH NAMES</Text>
        <View style={styles.inputRow}>
          <TextInput
            value={draftDish}
            onChangeText={setDraftDish}
            onSubmitEditing={addDishFromInput}
            placeholder="Paneer butter masala, jeera rice..."
            placeholderTextColor={colors.mutedForeground}
            style={styles.dishInput}
            returnKeyType="done"
            maxLength={240}
            accessibilityLabel="Add dish names"
            testID="dish-input"
          />
          <Pressable
            onPress={addDishFromInput}
            accessibilityRole="button"
            accessibilityLabel="Add dish"
            testID="add-dish-button"
            style={({ pressed }) => [styles.addButton, pressed && styles.pressed]}
          >
            <Feather name="plus" size={21} color={colors.primaryForeground} />
          </Pressable>
        </View>

        {dishes.length > 0 ? (
          <View style={styles.chips}>
            {dishes.map((dish) => (
              <View style={styles.dishChip} key={dish}>
                <Text style={styles.dishChipText}>{dish}</Text>
                <Pressable
                  onPress={() => setDishes((current) => current.filter((item) => item !== dish))}
                  accessibilityRole="button"
                  accessibilityLabel={`Remove ${dish}`}
                  style={styles.chipRemove}
                >
                  <Feather name="x" size={13} color={colors.mutedForeground} />
                </Pressable>
              </View>
            ))}
          </View>
        ) : (
          <Text style={styles.helperText}>Try: dal makhani, aloo gobi, and chapati.</Text>
        )}
        {dishEntryError ? <Text style={styles.errorText}>{dishEntryError}</Text> : null}

        <View style={styles.controlRow}>
          <View>
            <Text style={styles.servingsLabel}>How many people?</Text>
            <Text style={styles.servingsHint}>Quantities scale with servings.</Text>
          </View>
          <View style={styles.stepper}>
            <Pressable
              onPress={() => setServings((value) => Math.max(1, value - 1))}
              accessibilityRole="button"
              accessibilityLabel="Reduce servings"
              style={({ pressed }) => [styles.stepperButton, pressed && styles.pressed]}
            >
              <Feather name="minus" size={15} color={colors.foreground} />
            </Pressable>
            <Text style={styles.servingCount}>{servings}</Text>
            <Pressable
              onPress={() => setServings((value) => Math.min(24, value + 1))}
              accessibilityRole="button"
              accessibilityLabel="Increase servings"
              style={({ pressed }) => [styles.stepperButton, pressed && styles.pressed]}
            >
              <Feather name="plus" size={15} color={colors.foreground} />
            </Pressable>
          </View>
        </View>

        <Pressable
          onPress={analyzeDishes}
          disabled={analysis.isPending || dishes.length === 0}
          accessibilityRole="button"
          testID="analyze-dishes-button"
          style={({ pressed }) => [
            styles.primaryButton,
            pressed && styles.pressed,
            (analysis.isPending || dishes.length === 0) && styles.disabled,
          ]}
        >
          <Feather name={analysis.isPending ? "loader" : "zap"} size={17} color={colors.primaryForeground} />
          <Text style={styles.primaryButtonText}>
            {analysis.isPending ? "Building your ingredient list..." : "Build ingredient list"}
          </Text>
        </Pressable>
        {analysisError ? <Text style={styles.errorText}>{analysisError}</Text> : null}
        {analysisModel ? (
          <View style={styles.modelBadge}>
            <Text style={styles.modelBadgeText}>{analysisModel}</Text>
          </View>
        ) : null}
      </View>

      {ingredients.length === 0 ? (
        <View style={styles.emptyState}>
          <Feather name="clipboard" size={23} color={colors.primary} />
          <Text style={styles.emptyTitle}>Your shopping plan starts here</Text>
          <Text style={styles.emptyText}>
            Build an ingredient list to mark pantry items, search each store, and compare complete basket totals.
          </Text>
        </View>
      ) : (
        <>
          <View style={styles.card}>
            <View style={styles.listHeader}>
              <View style={styles.sectionHeader}>
                <View style={styles.step}><Text style={styles.stepText}>02</Text></View>
                <View>
                  <Text style={styles.sectionTitle}>Your ingredients</Text>
                  <Text style={styles.sectionSubTitle}>Mark what you already have at home.</Text>
                </View>
              </View>
              <View style={styles.countBadge}>
                <Text style={styles.countText}>{ingredients.length} ITEMS</Text>
              </View>
            </View>

            {ingredients.map((ingredient) => (
              <View style={styles.itemRow} key={ingredient.id}>
                <Pressable
                  onPress={() =>
                    setIngredients((current) =>
                      current.map((item) =>
                        item.id === ingredient.id ? { ...item, haveAtHome: !item.haveAtHome } : item,
                      ),
                    )
                  }
                  accessibilityRole="checkbox"
                  accessibilityState={{ checked: ingredient.haveAtHome }}
                  accessibilityLabel={`${ingredient.haveAtHome ? "Remove from" : "Mark as"} pantry: ${ingredient.name}`}
                  style={[
                    styles.pantryToggle,
                    ingredient.haveAtHome && {
                      backgroundColor: colors.primary,
                      borderColor: colors.primary,
                    },
                  ]}
                >
                  {ingredient.haveAtHome ? (
                    <Feather name="check" size={15} color={colors.primaryForeground} />
                  ) : null}
                </Pressable>
                <View style={styles.itemContent}>
                  <Text
                    style={[
                      styles.itemName,
                      ingredient.haveAtHome && { color: colors.mutedForeground, textDecorationLine: "line-through" },
                    ]}
                  >
                    {ingredient.name}
                  </Text>
                  <Text style={styles.itemDetail}>
                    {ingredient.quantity} {ingredient.unit} · {ingredient.category}
                  </Text>
                  {ingredient.notes ? <Text style={styles.itemDetail}>{ingredient.notes}</Text> : null}
                  {ingredient.haveAtHome ? <Text style={styles.haveText}>IN YOUR PANTRY</Text> : null}
                </View>
                <Pressable
                  onPress={() => setIngredients((current) => current.filter((item) => item.id !== ingredient.id))}
                  accessibilityRole="button"
                  accessibilityLabel={`Remove ${ingredient.name}`}
                  style={({ pressed }) => [styles.iconButton, pressed && styles.pressed]}
                >
                  <Feather name="trash-2" size={15} color={colors.mutedForeground} />
                </Pressable>
              </View>
            ))}

            <View style={styles.addIngredientRow}>
              <TextInput
                value={manualIngredient}
                onChangeText={setManualIngredient}
                onSubmitEditing={addManualIngredient}
                placeholder="Add a missing ingredient"
                placeholderTextColor={colors.mutedForeground}
                style={styles.dishInput}
                returnKeyType="done"
                maxLength={80}
                accessibilityLabel="Add a missing ingredient"
              />
              <Pressable
                onPress={addManualIngredient}
                accessibilityRole="button"
                accessibilityLabel="Add missing ingredient"
                style={({ pressed }) => [styles.stepperButton, pressed && styles.pressed]}
              >
                <Feather name="plus" size={18} color={colors.primary} />
              </Pressable>
            </View>
          </View>

          <View style={styles.card}>
            <View style={styles.compareTop}>
              <View style={styles.sectionHeader}>
                <View style={styles.step}><Text style={styles.stepText}>03</Text></View>
                <View>
                  <Text style={styles.sectionTitle}>Compare baskets</Text>
                  <Text style={styles.sectionSubTitle}>Enter the prices you find at each store.</Text>
                </View>
              </View>
              <Text style={styles.liveNote}>YOUR PRICES</Text>
            </View>

            <View style={styles.bestBanner}>
              <View style={styles.bestIcon}>
                <Feather name={bestStore ? "award" : "bar-chart-2"} size={18} color={colors.primary} />
              </View>
              <View style={styles.bestTextWrap}>
                <Text style={styles.bestTitle}>
                  {!planIsCurrent
                    ? "Rebuild your ingredient list"
                    : bestStore
                    ? `Lowest complete basket: ${bestStore.label}`
                    : activeIngredients.length === 0
                      ? "Everything is already in your pantry"
                      : "Add prices to compare full baskets"}
                </Text>
                <Text style={styles.bestSubtitle}>
                  {!planIsCurrent
                    ? "Your dish names or serving count changed since the last analysis."
                    : bestStore
                    ? `${formatRupees(bestStore.total)} across ${activeIngredients.length} ingredients.`
                    : activeIngredients.length === 0
                      ? "No store purchase is needed for this list."
                      : "A store is ranked only after every needed ingredient has a price."}
                </Text>
              </View>
            </View>

            <View style={styles.storeSelector}>
              {storeStats.map((store) => {
                const selected = selectedStore === store.id;
                return (
                  <Pressable
                    key={store.id}
                    onPress={() => setSelectedStore(store.id)}
                    accessibilityRole="tab"
                    accessibilityState={{ selected }}
                    testID={`store-${store.id}`}
                    style={({ pressed }) => [
                      styles.storeTab,
                      selected && styles.storeTabActive,
                      pressed && styles.pressed,
                    ]}
                  >
                    <Text style={[styles.storeTabName, selected && styles.activeStoreText]}>
                      {store.label}
                    </Text>
                    <Text style={[styles.storeTabTotal, selected && styles.activeStoreText]}>
                      {formatRupees(store.total)}
                    </Text>
                    <Text style={[styles.storeTabCoverage, selected && styles.activeStoreText]}>
                      {store.pricedCount}/{activeIngredients.length} priced
                    </Text>
                  </Pressable>
                );
              })}
            </View>

            {activeIngredients.length === 0 ? (
              <Text style={styles.helperText}>Mark an ingredient as needed to add it to a store basket.</Text>
            ) : (
              activeIngredients.map((ingredient) => {
                const entry = ingredient.prices[selectedStore];
                return (
                  <View style={styles.storeLine} key={`${selectedStore}-${ingredient.id}`}>
                    <View style={styles.storeLineTop}>
                      <Text style={styles.storeItemName}>{ingredient.name}</Text>
                      <Text style={styles.storeItemQuantity}>
                        {ingredient.quantity} {ingredient.unit}
                      </Text>
                    </View>
                    <View style={styles.fieldsRow}>
                      <View style={styles.productField}>
                        <Text style={styles.compactLabel}>PRODUCT / PACK</Text>
                        <TextInput
                          value={entry?.productName ?? ingredient.name}
                          onChangeText={(value) => updatePrice(ingredient.id, "productName", value)}
                          placeholder={ingredient.name}
                          placeholderTextColor={colors.mutedForeground}
                          style={styles.compactInput}
                          maxLength={80}
                          accessibilityLabel={`${currentStore.label} product for ${ingredient.name}`}
                        />
                      </View>
                      <View style={styles.priceField}>
                        <Text style={styles.compactLabel}>PRICE (₹)</Text>
                        <TextInput
                          value={entry?.price ?? ""}
                          onChangeText={(value) =>
                            updatePrice(ingredient.id, "price", value.replace(/[^0-9.]/g, ""))
                          }
                          placeholder="0"
                          placeholderTextColor={colors.mutedForeground}
                          style={styles.compactInput}
                          keyboardType="decimal-pad"
                          maxLength={10}
                          accessibilityLabel={`${currentStore.label} price for ${ingredient.name}`}
                        />
                      </View>
                    </View>
                    <Pressable
                      onPress={() => openStoreSearch(ingredient.name)}
                      accessibilityRole="link"
                      testID={`search-${selectedStore}-${ingredient.id}`}
                      style={({ pressed }) => [styles.searchButton, pressed && styles.pressed]}
                    >
                      <Feather name="external-link" size={13} color={colors.primary} />
                      <Text style={styles.searchButtonText}>Search {currentStore.label}</Text>
                    </Pressable>
                  </View>
                );
              })
            )}
            <Text style={styles.footnote}>
              Prices are entered by you, not live retailer quotes. Search links open each store’s website; checkout and stock are handled there.
            </Text>
          </View>
        </>
      )}

      {storageError ? (
        <Text style={styles.errorText}>This list could not be saved on this device. Check available storage and try again.</Text>
      ) : null}
      <Text style={styles.footerText}>Your dishes, ingredient list, and entered prices stay on this device.</Text>
    </KeyboardAwareScrollViewCompat>
  );
}
