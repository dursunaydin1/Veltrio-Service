/* Veltrio Servis — service worker (Adım 7.1, NFR-008)
 *
 * Amaç: internet olmadan da uygulamanın açılması. Veri IndexedDB'dedir; bu dosya yalnızca
 * uygulama kabuğunu (sayfalar, JS/CSS, simgeler) önbelleğe alır.
 *
 *  - /_next/static/*, /icons/*: önce önbellek (içerik adresli, değişmez)
 *  - sayfa gezintileri: önce ağ, çevrimdışıysa son görülen sayfa; hiç görülmemişse /offline
 *  - /api/*, giriş ve kimlik doğrulama yolları: ASLA önbelleğe alınmaz
 *  - Oturum açıkken istemci PRECACHE mesajı yollar; yalnızca yönlendirilmeden gelen,
 *    HTML ve başarılı yanıtlar saklanır (giriş sayfası yanlışlıkla ana sayfa yerine geçmez).
 */
const VERSION = "v6"; // patron ve çalışanlar (K-119); eski önbellek silinsin
const STATIC_CACHE = `veltrio-static-${VERSION}`;
const PAGE_CACHE = `veltrio-pages-${VERSION}`;
const OFFLINE_URL = "/offline";

const NEVER_CACHE = [/^\/api\//, /^\/auth\//, /^\/login/, /^\/register/, /^\/forgot-password/, /^\/reset-password/];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(PAGE_CACHE).then((cache) => cache.add(new Request(OFFLINE_URL, { cache: "reload" })).catch(() => undefined))
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keep = new Set([STATIC_CACHE, PAGE_CACHE]);
      for (const key of await caches.keys()) if (key.startsWith("veltrio-") && !keep.has(key)) await caches.delete(key);
      await self.clients.claim();
    })()
  );
});

const isCacheablePage = (response, url) =>
  response.ok &&
  !response.redirected &&
  (response.headers.get("content-type") || "").includes("text/html") &&
  !NEVER_CACHE.some((re) => re.test(url.pathname));

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (NEVER_CACHE.some((re) => re.test(url.pathname))) return;

  // Değişmez statik dosyalar: önce önbellek
  if (url.pathname.startsWith("/_next/static/") || url.pathname.startsWith("/icons/") || url.pathname === "/manifest.json") {
    event.respondWith(
      caches.open(STATIC_CACHE).then(async (cache) => {
        const hit = await cache.match(request);
        if (hit) return hit;
        const response = await fetch(request);
        if (response.ok) cache.put(request, response.clone());
        return response;
      })
    );
    return;
  }

  // Sayfa gezintisi: önce ağ, olmazsa önbellek, o da yoksa çevrimdışı sayfası
  if (request.mode === "navigate") {
    event.respondWith(
      (async () => {
        const cache = await caches.open(PAGE_CACHE);
        try {
          const response = await fetch(request);
          if (isCacheablePage(response, url)) cache.put(url.pathname, response.clone());
          return response;
        } catch {
          return (await cache.match(url.pathname)) || (await cache.match(OFFLINE_URL)) || Response.error();
        }
      })()
    );
  }
});

self.addEventListener("message", (event) => {
  const data = event.data;
  if (!data || data.type !== "PRECACHE" || !Array.isArray(data.urls)) return;
  event.waitUntil(
    (async () => {
      const cache = await caches.open(PAGE_CACHE);
      for (const path of data.urls) {
        if (typeof path !== "string" || !path.startsWith("/") || NEVER_CACHE.some((re) => re.test(path))) continue;
        try {
          const response = await fetch(path, { credentials: "same-origin", cache: "no-store" });
          if (isCacheablePage(response, new URL(path, self.location.origin))) await cache.put(path, response);
        } catch {
          // Çevrimdışıysa sonraki açılışta tekrar denenir.
        }
      }
    })()
  );
});
