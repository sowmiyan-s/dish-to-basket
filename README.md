# Dish to Basket

Dish to Basket is an autonomous, agentic culinary planner and real-time quick-commerce delivery router. It turns cooking storylines, gathering visions, and dish cravings into a consolidated, commercial grocery basket and dynamically calculates real-time delivery arrival times across India's top 6 quick-commerce platforms.

---

## Key Capabilities

### 1. Conversational Storyline & Culinary Synthesis
- **Lovable / ChatGPT Style Hero**: Enter high-level occasions (e.g., *"Cooking dinner for 4 friends coming over on a rainy Friday night — want a rich paneer gravy, dal makhani, and jeera rice"*).
- **Culinary Architecture**: The AI generates a tailored Culinary Philosophy, Chef's Notes, dish breakdown, and scales quantities accurately for your guest count.
- **Commercial SKU Mapping**: Translates raw culinary measurements into standard Indian grocery packs (e.g. *Amul Malai Paneer 200g Pack*, *MDH Kasuri Methi 50g*, *Kohinoor Aged Basmati 1kg*).

### 2. Real-Time Delivery Crawler (MCP Spider)
- **Zero Fake Times**: Calculates dynamic, real-time arrival clocks based on live system time (`new Date()`) and local dark-store operating hours.
- **Location Hub Matrix**: Real-time delivery tracking across popular Indian hubs:
  - **Bengaluru** (Indiranagar / Koramangala)
  - **Mumbai** (Bandra West)
  - **Delhi NCR** (Connaught Place)
  - **Hyderabad** (Hitec City)
  - **Pune** (Viman Nagar)
  - **Chennai** (T. Nagar)
- **Operating Status Telemetry**: Live status badges (`OPEN NOW`, `NIGHT EXPRESS`, `CLOSING SOON`, `NEXT MORNING SLOT`, `PRE-ORDER`), dark-store cluster distance, and surge indicators.
- **Inspect MCP Telemetry Logs**: Interactive console displaying real-time spider tool calls and latency metrics.

### 3. 6 Quick-Commerce & Fast Delivery Platforms
- **Blinkit**: 10–15 min quick commerce with live arrival clocks and direct deep search links.
- **Zepto**: 10 min instant delivery with 24/7 dark-store night express.
- **Swiggy Instamart**: 15 min express delivery.
- **BigBasket**: BB Now (20-min) & morning slot schedules.
- **JioMart**: Supermarket everyday value & scheduled morning slots.
- **Amazon Fresh**: Prime 2-hour window delivery slots.

### 4. Direct 1-Click Order Dispatch
- **Product-Level Search Pills**: Tap any platform chip directly on an ingredient card to launch the real live product search in your city.
- **Whole Cart Dispatch**: Open the entire shopping list on your preferred store with 1 tap.
- **Multi-Item Checklist**: Copy formatted order links ready to paste into store search or WhatsApp.

---

## Intelligence Engines & AI Configuration

1. **NVIDIA NIM (Active Agent)**:
   - Configured for `stepfun-ai/step-5-preview` and `deepseek-ai/deepseek-v4.1-flash`.
   - Full support for deep chain-of-thought (`reasoning_content`) models.
   - Inspect the AI's internal reasoning via the **Agent Reasoning Log**.
2. **Free Global AI (Zero Credit Limits)**:
   - Built-in cloud AI (OpenAI format via Pollinations) with no API keys or credits required.
3. **Offline Recipe Rules Engine**:
   - Zero-network fallback with 35+ regional Indian recipes and scaling algorithms.

---

## Setup & Running Locally

1. Install dependencies:
   ```sh
   pnpm install
   ```

2. Configure environment:
   ```sh
   cp .env.example .env
   ```
   `NVIDIA_NIM_API_KEY` configures the API server. For the mobile app, enter your NVIDIA NIM key in Settings; the app stores it with the platform secure-storage module on supported devices. Never put a key in an `EXPO_PUBLIC_` variable.

3. Start the application:
   ```sh
   pnpm --filter @workspace/dish-to-basket run dev
   ```
   Open **[http://localhost:8081](http://localhost:8081)** in your browser or scan the QR code in Expo Go.

---

## Android APK GitHub Release

The **Build Android APK** workflow runs when you push a `v*` tag or start it from GitHub Actions with a release tag such as `v1.0.0`. It builds an APK and attaches it to a GitHub Release.

The APK is debug-signed for direct installation and testing; it is not a Play Store release. No AI key is needed during the build. Configure NVIDIA NIM from the app's Settings tab after installing. Optionally set the repository variable `EXPO_PUBLIC_DOMAIN` to enable the API-backed product-image crawler in the APK.

---

## License
MIT
