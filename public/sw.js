/* NovaDZ — service worker.
 *
 * Règle simple : une page fraîche quand il y a du réseau, et quelque chose
 * d'utile quand il n'y en a plus. On ne met jamais en cache une page du
 * tableau de bord : les chiffres doivent être vrais, pas ceux d'hier.
 */
const VERSION = "novadz-v1"
const STATIC_CACHE = VERSION + "-static"
const PAGE_CACHE = VERSION + "-pages"
const OFFLINE = "/hors-ligne"

const SHELL = [
  "/styles.css",
  "/ndz-merchant.css",
  "/inter-font.css",
  "/horizon-panel.css",
  "/horizon-panel.js",
  "/ndz-store.js",
  "/pwa.js",
  "/favicon.ico",
  OFFLINE,
]

self.addEventListener("install", (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(STATIC_CACHE)
    /* un fichier manquant ne doit pas empêcher l'installation */
    await Promise.all(SHELL.map((url) => cache.add(new Request(url, { cache: "reload" })).catch(() => null)))
    await self.skipWaiting()
  })())
})

self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    const keep = new Set([STATIC_CACHE, PAGE_CACHE])
    const names = await caches.keys()
    await Promise.all(names.map((n) => (keep.has(n) ? null : caches.delete(n))))
    await self.clients.claim()
  })())
})

const isStatic = (path) =>
  /\.(css|js|mjs|woff2?|ttf|otf|png|jpe?g|webp|avif|svg|ico|gif|mp4|webm)$/i.test(path)

const neverCache = (url) =>
  url.pathname.startsWith("/api/") ||
  url.pathname.startsWith("/demo-login") ||
  url.pathname === "/sw.js" ||
  url.searchParams.has("preview")

self.addEventListener("fetch", (event) => {
  const req = event.request
  if (req.method !== "GET") return
  const url = new URL(req.url)
  if (url.origin !== self.location.origin) return
  if (neverCache(url)) return

  /* page ouverte : le réseau d'abord, le cache ensuite, la page hors-ligne au pire */
  if (req.mode === "navigate") {
    event.respondWith((async () => {
      try {
        const fresh = await fetch(req)
        /* une réponse personnalisée (tableau de bord, commande) ne se garde pas */
        if (fresh && fresh.ok && !url.pathname.startsWith("/dashboard")) {
          const cache = await caches.open(PAGE_CACHE)
          cache.put(req, fresh.clone())
        }
        return fresh
      } catch (_) {
        const cached = await caches.match(req)
        if (cached) return cached
        const offline = await caches.match(OFFLINE)
        if (offline) return offline
        return new Response("Pas de connexion.", { status: 503, headers: { "Content-Type": "text/plain; charset=utf-8" } })
      }
    })())
    return
  }

  /* images, polices, styles : le cache répond tout de suite, le réseau rafraîchit */
  if (isStatic(url.pathname)) {
    event.respondWith((async () => {
      const cache = await caches.open(STATIC_CACHE)
      const hit = await cache.match(req)
      const network = fetch(req).then((res) => {
        if (res && res.ok) cache.put(req, res.clone())
        return res
      }).catch(() => null)
      return hit || (await network) || new Response("", { status: 504 })
    })())
  }
})
