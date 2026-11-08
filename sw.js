/**
 * Al Oriyes Exchange Jeddah - Rock-Solid Offline Service Worker (v12)
 * Ensures 100% instantaneous offline launch even when Wi-Fi / Internet is turned off.
 */
const CACHE_NAME = "al-oriyes-cache-v12";
const CORE_FILES = [
  "./",
  "./index.html",
  "./manifest.json",
  "./icon-192.png",
  "./icon-512.png"
];

// Install: Cache critical shell assets safely one by one
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(async (cache) => {
      // Cache files individually so a single missing asset doesn't break offline caching
      for (const file of CORE_FILES) {
        try {
          const res = await fetch(file, { cache: "no-cache" });
          if (res && (res.status === 200 || res.type === "opaque")) {
            await cache.put(file, res);
          }
        } catch (e) {
          // If offline during install or relative path issue, try standard cache.add
          try { await cache.add(file); } catch (e2) {}
        }
      }
    }).then(() => self.skipWaiting())
  );
});

// Activate: Purge old caches and claim clients immediately
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))
      );
    }).then(() => self.clients.claim())
  );
});

// Fetch: Instant Stale-While-Revalidate / Cache-First for 100% Offline Launch
self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;

  const url = new URL(req.url);

  // 1. Navigation / Document loading (e.g. user opens app or refreshes with Wi-Fi OFF)
  if (req.mode === "navigate" || req.destination === "document") {
    event.respondWith(
      (async () => {
        const cache = await caches.open(CACHE_NAME);
        
        // Check cache first for instant opening
        const cachedDoc = (await cache.match(req)) || 
                          (await cache.match("./index.html")) || 
                          (await cache.match("./")) ||
                          (await cache.match(self.location.origin + "/index.html")) ||
                          (await cache.match(self.location.origin + "/"));

        if (cachedDoc) {
          // In background, update cache if online
          fetch(req).then((netRes) => {
            if (netRes && netRes.status === 200) {
              cache.put(req, netRes.clone());
              cache.put("./index.html", netRes.clone());
            }
          }).catch(() => {/* Offline - ignore network error */});
          return cachedDoc;
        }

        // If not in cache yet, try network
        try {
          const netRes = await fetch(req);
          if (netRes && netRes.status === 200) {
            cache.put(req, netRes.clone());
            cache.put("./index.html", netRes.clone());
          }
          return netRes;
        } catch (err) {
          // Network failed (Wi-Fi off) - search any cached HTML in cache
          const keys = await cache.keys();
          for (const k of keys) {
            if (k.url.endsWith(".html") || k.url.endsWith("/")) {
              const match = await cache.match(k);
              if (match) return match;
            }
          }
          return new Response("অফলাইন মোড: দয়া করে ইন্টারনেট সংযোগ দিয়ে একবার পেজটি লোড করুন।", {
            headers: { "Content-Type": "text/html; charset=utf-8" }
          });
        }
      })()
    );
    return;
  }

  // 2. Same-origin assets (icons, manifest, etc.)
  if (url.origin === self.location.origin) {
    event.respondWith(
      caches.match(req).then((cached) => {
        if (cached) return cached;
        return fetch(req).then((netRes) => {
          if (netRes && netRes.status === 200) {
            const clone = netRes.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(req, clone));
          }
          return netRes;
        }).catch(() => cached);
      })
    );
    return;
  }

  // 3. External assets (Google fonts, external CDN)
  event.respondWith(
    caches.match(req).then((cached) => {
      if (cached) return cached;
      return fetch(req).then((netRes) => {
        if (netRes && (netRes.status === 200 || netRes.type === "opaque")) {
          const clone = netRes.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(req, clone));
        }
        return netRes;
      }).catch(() => cached);
    })
  );
});
