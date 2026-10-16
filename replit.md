# Dish to Basket

Dish to Basket turns dish names into a combined ingredient plan, then helps compare user-entered basket prices across Indian grocery platforms.

## Run & Operate

- `pnpm --filter @workspace/api-server run dev` — run the API server (port 5000)
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from the OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- Required env: `DATABASE_URL` — Postgres connection string

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- API: Express 5
- DB: PostgreSQL + Drizzle ORM
- Validation: Zod (`zod/v4`), `drizzle-zod`
- API codegen: Orval (from OpenAPI spec)
- Build: esbuild (CJS bundle)

## Where things live

- `artifacts/dish-to-basket` — Expo mobile app and local saved shopping plans
- `artifacts/api-server` — ingredient analysis endpoint
- `lib/api-spec/openapi.yaml` — API source of truth

## Architecture decisions

- NVIDIA NIM is called from the server through its OpenAI-compatible API; the API key is never sent to the mobile client.
- The model is configurable with `NVIDIA_NIM_MODEL`; use a model ID supported by the configured NIM endpoint.
- Store prices are entered by the user and are not live quotes; retailer links open product searches, not authenticated carts.

## Product

Users enter dishes and servings to get an AI-generated, merged ingredient list. They can search each ingredient on Blinkit, JioMart, or BigBasket, enter the product and price they see, and compare basket totals. Plans and prices are saved on the device.

## User preferences

- Keep the AI provider/model switchable through configuration.
- Keep a GitHub copy of the source before project credits run out.

## Gotchas

_Populate as you build — sharp edges, "always run X before Y" rules._

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
