# Dish to Basket

Dish to Basket is a mobile meal-planning assistant. Enter dishes and servings to get a combined ingredient list, mark items already in your pantry, and compare the basket prices you enter for Blinkit, JioMart, and BigBasket.

## AI provider configuration

Ingredient analysis runs on the server through NVIDIA NIM's OpenAI-compatible chat completions API.

- Store `NVIDIA_NIM_API_KEY` as a Replit Secret. Never add it to source control or the mobile app.
- `NVIDIA_NIM_BASE_URL` defaults to `https://integrate.api.nvidia.com/v1`.
- `NVIDIA_NIM_MODEL` defaults to `meta/llama-3.1-8b-instruct`. Set it to any model ID supported by the configured NIM endpoint to switch models.

## Retailer prices

Blinkit, JioMart, and BigBasket do not currently provide a connected catalog in this app. Search buttons open each retailer's product search page; product names and prices are entered by the user. Totals are estimates based on those entries, not live quotes, retailer carts, or checkout prices.

## Run

From the workspace root:

```sh
pnpm --filter @workspace/api-server run dev
pnpm --filter @workspace/dish-to-basket run dev
```

The API contract is maintained in `lib/api-spec/openapi.yaml`; regenerate the client with:

```sh
pnpm --filter @workspace/api-spec run codegen
```

Shopping plans and entered prices are stored locally on the device.
