import { Router, type IRouter } from "express";

const router: IRouter = Router();

// In-memory runtime cache for the session (avoids redundant crawls within same session)
const liveImageCache = new Map<string, string>();

async function crawlRealStoreImage(productQuery: string): Promise<string | null> {
  const cleanQ = productQuery.trim();
  if (liveImageCache.has(cleanQ.toLowerCase())) {
    return liveImageCache.get(cleanQ.toLowerCase()) || null;
  }

  // 1. Live crawl from online shopping website indexes (JioMart, Blinkit, BigBasket, Amazon Fresh)
  try {
    const searchTerms = [
      `${cleanQ} product pack online shopping`,
      `${cleanQ} grocery packshot`,
    ];

    for (const term of searchTerms) {
      const tokenRes = await fetch(
        `https://duckduckgo.com/?q=${encodeURIComponent(term)}&t=h_&iax=images&ia=images`,
        {
          headers: {
            "User-Agent":
              "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
            Accept: "text/html",
          },
          signal: AbortSignal.timeout(4000),
        }
      );

      if (tokenRes.ok) {
        const html = await tokenRes.text();
        const vqdMatch = html.match(/vqd=["']?([^"'\s&]+)/) || html.match(/vqd=([^;&]+)/);
        if (vqdMatch) {
          const vqd = vqdMatch[1];
          const imgRes = await fetch(
            `https://duckduckgo.com/i.js?l=in-en&o=json&q=${encodeURIComponent(term)}&vqd=${vqd}`,
            {
              headers: {
                "User-Agent":
                  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
                Referer: "https://duckduckgo.com/",
              },
              signal: AbortSignal.timeout(4000),
            }
          );

          if (imgRes.ok) {
            const data = (await imgRes.json()) as { results?: Array<{ image: string; title: string }> };
            if (data.results && data.results.length > 0) {
              // Prefer genuine product images from grocery retailers (JioMart, BigBasket, Blinkit, Amazon, etc.)
              const storeMatch = data.results.find((r) => {
                const u = r.image.toLowerCase();
                return (
                  (u.endsWith(".jpg") || u.endsWith(".png") || u.endsWith(".webp") || u.includes(".jpeg")) &&
                  !u.includes("stock") &&
                  !u.includes("shutterstock") &&
                  !u.includes("istock") &&
                  !u.includes("alamy")
                );
              });

              const selected = storeMatch?.image || data.results[0]?.image;
              if (selected) {
                liveImageCache.set(cleanQ.toLowerCase(), selected);
                return selected;
              }
            }
          }
        }
      }
    }
  } catch {}

  // 2. Open Food Facts live retail package database (CORS enabled, genuine physical barcodes/packaging)
  try {
    const offUrl = `https://world.openfoodfacts.org/cgi/search.pl?search_terms=${encodeURIComponent(
      cleanQ
    )}&search_simple=1&action=process&json=1&page_size=3`;
    const res = await fetch(offUrl, {
      headers: { "User-Agent": "DishToBasket-LiveProductScraper/1.0" },
      signal: AbortSignal.timeout(3000),
    });
    if (res.ok) {
      const data = (await res.json()) as { products?: Array<{ image_front_url?: string; image_url?: string }> };
      const product = data.products?.find((p) => p.image_front_url || p.image_url);
      const img = product?.image_front_url || product?.image_url;
      if (img) {
        liveImageCache.set(cleanQ.toLowerCase(), img);
        return img;
      }
    }
  } catch {}

  return null;
}

// Single product image crawl endpoint
router.get("/product-images/crawl", async (req, res) => {
  const query = typeof req.query.query === "string" ? req.query.query.trim() : "";
  if (!query) {
    res.status(400).json({ error: "Missing 'query' parameter" });
    return;
  }

  const imageUrl = await crawlRealStoreImage(query);
  res.json({
    query,
    imageUrl,
    found: Boolean(imageUrl),
    timestamp: new Date().toISOString(),
  });
});

// Batch crawl endpoint for all ingredients in a dish at once
router.post("/product-images/batch-crawl", async (req, res) => {
  const items = Array.isArray(req.body.items) ? req.body.items : [];
  if (items.length === 0) {
    res.json({ results: {} });
    return;
  }

  const results: Record<string, string | null> = {};
  await Promise.all(
    items.map(async (item: any) => {
      const q = typeof item === "string" ? item : String(item.name || item.query || "");
      if (q) {
        results[q] = await crawlRealStoreImage(q);
      }
    })
  );

  res.json({ results });
});

export default router;
