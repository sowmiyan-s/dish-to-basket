import OpenAI from "openai";
import { Router, type IRouter } from "express";
import { nvidiaNimConfig } from "../lib/ai-config";

const router: IRouter = Router();

const allowedCategories = new Set([
  "Produce",
  "Dairy",
  "Pantry",
  "Spices",
  "Proteins",
  "Other",
]);

type Ingredient = {
  name: string;
  quantity: number;
  unit: string;
  category: string;
  notes: string;
  usedIn: string[];
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseIngredientResponse(text: string): Ingredient[] {
  const trimmed = text.trim();
  let parsed: unknown;

  try {
    parsed = JSON.parse(trimmed);
  } catch {
    const firstBrace = trimmed.indexOf("{");
    const lastBrace = trimmed.lastIndexOf("}");
    if (firstBrace < 0 || lastBrace <= firstBrace) {
      throw new Error("Model response did not contain JSON.");
    }
    parsed = JSON.parse(trimmed.slice(firstBrace, lastBrace + 1));
  }

  if (!isRecord(parsed) || !Array.isArray(parsed.ingredients)) {
    throw new Error("Model response did not contain an ingredient list.");
  }

  const ingredients = parsed.ingredients.map((item): Ingredient => {
    if (
      !isRecord(item) ||
      typeof item.name !== "string" ||
      typeof item.quantity !== "number" ||
      !Number.isFinite(item.quantity) ||
      item.quantity <= 0 ||
      typeof item.unit !== "string"
    ) {
      throw new Error("Model returned an invalid ingredient.");
    }

    const usedIn = Array.isArray(item.usedIn)
      ? item.usedIn.filter((dish): dish is string => typeof dish === "string")
      : [];
    const category =
      typeof item.category === "string" && allowedCategories.has(item.category)
        ? item.category
        : "Other";

    return {
      name: item.name.trim(),
      quantity: item.quantity,
      unit: item.unit.trim(),
      category,
      notes: typeof item.notes === "string" ? item.notes.trim() : "",
      usedIn,
    };
  });

  if (ingredients.length === 0) {
    throw new Error("Model returned an empty ingredient list.");
  }

  return ingredients;
}

router.post("/ingredient-plans/analyze", async (req, res) => {
  const body: unknown = req.body;
  if (!isRecord(body)) {
    res.status(400).json({ error: "Add one or more dishes to continue." });
    return;
  }

  const rawDishes = body.dishes;
  const servings = body.servings;
  if (
    !Array.isArray(rawDishes) ||
    rawDishes.length < 1 ||
    rawDishes.length > 8 ||
    rawDishes.some(
      (dish) => typeof dish !== "string" || dish.trim().length === 0 || dish.length > 80,
    ) ||
    typeof servings !== "number" ||
    !Number.isInteger(servings) ||
    servings < 1 ||
    servings > 24
  ) {
    res.status(400).json({
      error: "Enter 1–8 dish names and choose between 1 and 24 servings.",
    });
    return;
  }

  if (!nvidiaNimConfig.apiKey) {
    req.log.error("NVIDIA_NIM_API_KEY is not configured.");
    res.status(503).json({
      error: "Ingredient analysis is unavailable because the AI provider is not configured.",
    });
    return;
  }

  const dishes = rawDishes.map((dish) => (dish as string).trim());
  try {
    const client = new OpenAI({
      apiKey: nvidiaNimConfig.apiKey,
      baseURL: nvidiaNimConfig.baseUrl,
      timeout: 45_000,
      maxRetries: 1,
    });
    const completion = await client.chat.completions.create({
      model: nvidiaNimConfig.model,
      max_tokens: 1500,
      messages: [
        {
          role: "system",
          content:
            "You are a practical recipe ingredient planning agent for Indian home cooking. For the supplied dishes, produce one combined shopping list scaled to the requested servings. Merge duplicate ingredients across dishes, use sensible metric or common kitchen units, and list pantry staples and spices too. If a dish has multiple common versions, use a familiar home-style version and put a short assumption in notes. Return only valid JSON in this shape: {\"ingredients\":[{\"name\":\"onion\",\"quantity\":2,\"unit\":\"medium\",\"category\":\"Produce\",\"notes\":\"\",\"usedIn\":[\"dish name\"]}]}. Categories must be Produce, Dairy, Pantry, Spices, Proteins, or Other. Quantities must be positive numbers.",
        },
        {
          role: "user",
          content: JSON.stringify({ dishes, servings }),
        },
      ],
    });

    const content = completion.choices[0]?.message?.content;
    if (!content) {
      throw new Error("NVIDIA NIM returned an empty response.");
    }
    const ingredients = parseIngredientResponse(content);
    res.json({
      ingredients,
      provider: "NVIDIA NIM",
      model: nvidiaNimConfig.model,
    });
  } catch (err) {
    req.log.error({ err, model: nvidiaNimConfig.model }, "Ingredient analysis failed.");
    res.status(502).json({
      error:
        "NVIDIA NIM could not create an ingredient list. Check the configured model and try again.",
    });
  }
});

export default router;
