"use strict"
/**
 * NovaDZ — plateforme SaaS multi-boutiques
 * Chaque marchand crée sa boutique, gère ses produits, reçoit ses commandes.
 * Rendu serveur, SQLite, aucune dépendance lourde.
 */
const path = require("path")
const fs = require("fs")
const express = require("express")

const db = require("./src/db")
/* une référence ne doit jamais désigner deux commandes de la même boutique */
try { db.exec("CREATE UNIQUE INDEX IF NOT EXISTS idx_orders_store_ref ON orders(store_id, ref)") } catch (e) { /* doublons historiques : on ne bloque pas le démarrage */ }
const { hash, verify, getSession, saveSession, regenerateSession, cookiesParser } = require("./src/auth")
const hashPassword = hash
const verifyPassword = verify
const seed = require("./src/seed")
const { ensureDemoImages } = require("./src/assets")
const V = require("./src/views")
const { landing } = require("./src/landing")
const { isTheme, DEFAULT_THEME, THEMES } = require("./src/themes")
const SECTIONS = require("./src/sections")
const TEMPLATES = require("./src/templates")
const SITES = require("./src/site-templates")
const UPLOADS = require("./src/uploads")
const SHOP = require("./src/shop")
const INV = require("./src/inventory")
const SEC = require("./src/security")
const PX = require("./src/pixels")
const LAND = require("./src/landings")
const REFS = require("./src/refs")
const CARRIERS = require("./src/carriers")
const REL = require("./src/relance")
const STATS = require("./src/stats")
const PAY = require("./src/payments")
const SOCIAL = require("./src/social")
const CF = require("./src/checkoutform")
const I18N = require("./src/i18n")
const GEO = require("./src/geo")
const ORD = require("./src/orders")
const DOMAIN = require("./src/domain")
const { messageOf } = require("./src/plain")
const TEAM = require("./src/team")
const MAIL = require("./src/mail")
const JOURNAL = require("./src/journal")
const LIV = require("./src/livraison")
const HIST = require("./src/historique")
const NOTICES = require("./src/notices")
const AI = require("./src/ai")
const PLAT = require("./src/platform")
const ADM = require("./src/admin-views")
const PT = require("./src/public-themes")

ensureDemoImages()
seed()

const app = express()
const PORT = process.env.PORT || 3000
const RESERVED = new Set(["dashboard", "admin", "login", "signup", "logout", "rejoindre", "themes", "styles.css", "api", "favicon.ico"])

/* Derrière Cloudflare (ou tout reverse-proxy) : faire confiance à
   X-Forwarded-* pour req.ip / req.protocol. Activé par NOVADZ_TRUST_PROXY=1
   ou automatiquement si l'adresse publique est en https. */
if (process.env.NOVADZ_TRUST_PROXY === "1" || /^https:/i.test(process.env.PUBLIC_URL || "")) {
  app.set("trust proxy", 1)
}
app.disable("x-powered-by")

/* En-têtes de sécurité. CSP volontairement compatible avec l'existant
   (scripts/styles en ligne, pixels et CAPTCHA externes) : elle bloque
   l'encadrement par un autre site, les objets et les bases détournées. */
/* Qui peut encadrer le site dans une iframe. Par défaut : uniquement le
   site lui-même (anti-clickjacking, et l'aperçu du tableau de bord en a
   besoin). Un hébergeur qui affiche le site dans son propre panneau
   d'aperçu peut élargir via NOVADZ_FRAME_ANCESTORS, par exemple :
   NOVADZ_FRAME_ANCESTORS="'self' https://*.exemple.com" */
const FRAME_ANCESTORS = String(process.env.NOVADZ_FRAME_ANCESTORS || "'self'").trim() || "'self'"
app.use((req, res, next) => {
  res.setHeader("X-Content-Type-Options", "nosniff")
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin")
  if (FRAME_ANCESTORS === "'self'") res.setHeader("X-Frame-Options", "SAMEORIGIN")
  res.setHeader("Content-Security-Policy",
    "default-src 'self'; img-src 'self' data: blob: https:; media-src 'self' https: data:;" +
    " font-src 'self' data: https:; style-src 'self' 'unsafe-inline' https:;" +
    " script-src 'self' 'unsafe-inline' https:; connect-src 'self' https:;" +
    " frame-src 'self' https:; frame-ancestors " + FRAME_ANCESTORS + "; base-uri 'self'; form-action 'self'; object-src 'none'")
  next()
})

/* Anti-CSRF par vérification d'origine : les navigateurs envoient toujours
   Origin sur un POST. Un POST dont l'origine ne correspond pas à l'hôte
   (ni à PUBLIC_URL) est refusé. Sans Origin (clients non-navigateurs,
   webhooks serveur à serveur), on laisse passer : la protection vise le
   navigateur d'un marchand connecté. Le cookie de session SameSite=Lax
   reste la première barrière. */
app.use((req, res, next) => {
  if (req.method === "GET" || req.method === "HEAD" || req.method === "OPTIONS") return next()
  const origin = req.headers.origin
  if (!origin) return next()
  let originHost = ""
  try { originHost = new URL(origin).host } catch (_) { return res.status(403).send("Origine invalide.") }
  const allowed = new Set([req.headers.host])
  try { if (process.env.PUBLIC_URL) allowed.add(new URL(process.env.PUBLIC_URL).host) } catch (_) {}
  if (!allowed.has(originHost)) {
    logRowSafe("warn", "POST refusé : origine étrangère", { path: req.path, origin })
    return res.status(403).send("Requête refusée (origine). Rechargez la page puis réessayez.")
  }
  next()
})
const logRowSafe = (...a) => { try { JOURNAL.write(...a) } catch (_) {} }

app.use(express.urlencoded({ extended: true, limit: "2mb" }))

app.use(cookiesParser)
/* langue de la page (FR/AR) disponible partout sans la passer de main en main */
app.use((req, res, next) => {
  /* le choix de langue survit à la navigation (cookie 1 an) */
  const asked = req.query && req.query.lang
  if (asked && I18N.isLang(String(asked))) {
    res.cookie("ndz_lang", String(asked), { maxAge: 365 * 864e5, sameSite: "lax" })
    req.cookies.ndz_lang = String(asked)
  }
  I18N.run({ req }, next)
})
/* d'où vient le visiteur : première arrivée mémorisée (utm, clic publicitaire, appareil) */
app.use(ORD.track)

/* Un nom de domaine de boutique sert la vitrine, sans le slug dans l'adresse. */
const DOMAIN_SKIP = ["/styles.css", "/editor.js", "/upimg.js", "/uploads", "/demo", "/fonts",
  "/themes-pro.css", "/ndz-merchant.css", "/ndz-store.js", "/landing.css", "/inter-font.css", "/estedad.css", "/theme-fonts.css",
  "/dashboard", "/admin", "/login", "/signup", "/logout", "/welcome", "/rejoindre", "/themes"]
app.use((req, res, next) => {
  const host = String(req.headers.host || "").split(":")[0]
  const store = DOMAIN.find(host)
  if (!store) return next()
  const pathOnly = String(req.url || "/").split("?")[0]
  if (DOMAIN_SKIP.some((p) => pathOnly === p || pathOnly.startsWith(p + "/"))) return next()
  const slug = store.slug
  if (pathOnly === `/${slug}` || pathOnly.startsWith(`/${slug}/`)) {
    req.domainStore = store
  } else {
    const q = req.url.startsWith("/") ? req.url : "/" + req.url
    req.url = (q === "/" ? `/${slug}` : `/${slug}${q}`)
    req.domainStore = store
  }
  const orig = res.send.bind(res)
  res.send = (body) => {
    if (typeof body === "string" && body.includes(`/${slug}`)) {
      body = body
        .replaceAll(`href="/${slug}/`, "href=\"/")
        .replaceAll(`href="/${slug}"`, "href=\"/\"")
        .replaceAll(`action="/${slug}/`, "action=\"/")
        .replaceAll(`action="/${slug}"`, "action=\"/\"")
        .replaceAll(`"/${slug}/`, "\"/")
        .replaceAll(`'/${slug}/`, "'/")
    }
    return orig(body)
  }
  next()
})

/* gzip : styles.css fait ~430 Ko à froid, ~60 Ko compressé */
app.use(require("compression")())

/* une photo de téléphone peut peser lourd : 8 Mo, et un message clair au-delà */
app.use(express.json({ limit: "8mb" }))
/* un envoi trop lourd reçoit un message clair (413), pas un « Erreur serveur » */
app.use((err, req, res, next) => {
  if (err && (err.type === "entity.too.large" || err.status === 413)) {
    const msg = "Photo trop lourde : 2,5 Mo maximum après compression. Réduis la photo puis réessaie."
    if (req.headers["content-type"] && req.headers["content-type"].includes("application/json")) {
      return res.status(413).json({ ok: false, error: msg })
    }
    return res.status(413).send(msg)
  }
  return next(err)
})
/* cache : les CSS/JS changent à chaque déploiement (1 h + ETag), les images,
   polices et sons sont stables (30 j). Économie de bande passante réelle. */
const CACHE_CODE = { maxAge: "1h" }
const CACHE_MEDIA = { maxAge: "30d" }
app.use("/styles.css", express.static(path.join(__dirname, "public", "styles.css"), CACHE_CODE))
app.use("/editor.js", express.static(path.join(__dirname, "public", "editor.js"), CACHE_CODE))
app.use("/formulaire.js", express.static(path.join(__dirname, "public", "formulaire.js"), CACHE_CODE))
app.use("/upimg.js", express.static(path.join(__dirname, "public", "upimg.js"), CACHE_CODE))
app.use("/uploads", express.static(path.join(__dirname, "public", "uploads"), CACHE_MEDIA))
app.use("/demo", express.static(path.join(__dirname, "public", "demo"), CACHE_MEDIA)) /* photos de démo livrées avec le code */
app.use("/themes-pro.css", express.static(path.join(__dirname, "public", "themes-pro.css"), CACHE_CODE)) /* six thèmes prêts à l'emploi */
app.use("/ndz-merchant.css", express.static(path.join(__dirname, "public", "ndz-merchant.css"), CACHE_CODE))
app.use("/ndz-store.js", express.static(path.join(__dirname, "public", "ndz-store.js"), CACHE_CODE))
app.use("/horizon-panel.css", express.static(path.join(__dirname, "public", "horizon-panel.css"), CACHE_CODE))
app.use("/horizon-panel.js", express.static(path.join(__dirname, "public", "horizon-panel.js"), CACHE_CODE))
app.use("/theme-fonts.css", express.static(path.join(__dirname, "public", "theme-fonts.css"), CACHE_CODE)) /* polices des six thèmes */
app.use("/landing.css", express.static(path.join(__dirname, "public", "landing.css"), CACHE_CODE))
app.use("/shots", express.static(path.join(__dirname, "public", "shots"), CACHE_MEDIA))
app.use("/templates", express.static(path.join(__dirname, "public", "templates"), CACHE_MEDIA))
app.use("/inter-font.css", express.static(path.join(__dirname, "public", "inter-font.css"), CACHE_MEDIA))
app.use("/estedad.css", express.static(path.join(__dirname, "public", "estedad.css"), CACHE_MEDIA))
app.use("/fonts", express.static(path.join(__dirname, "public", "fonts"), CACHE_MEDIA))
app.use("/sons", express.static(path.join(__dirname, "public", "sons"), CACHE_MEDIA))
app.use("/favicon.ico", express.static(path.join(__dirname, "public", "favicon.ico"), CACHE_MEDIA))
/* temps de chaque page : mémoire pour le passage, base seulement si erreur ou lenteur */
app.use(JOURNAL.observe)

/* ------------------------------- helpers ------------------------------- */
const slugify = (s) =>
  s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase()
    .replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40) || "boutique"

const uniqueSlug = (base) => {
  let slug = base, i = 1
  while (RESERVED.has(slug) || db.prepare("SELECT 1 FROM stores WHERE slug = ?").get(slug)) {
    slug = `${base}-${++i}`
  }
  return slug
}

const auth = (req) => {
  const session = getSession(req, req.res)
  const user = session.userId
    ? db.prepare("SELECT * FROM users WHERE id = ?").get(session.userId)
    : null
  return { session, user }
}

const requireAuth = (req, res, next) => {
  const { user } = auth(req)
  if (!user) return res.redirect("/login")
  req.user = user
  next()
}

const requireAdmin = (req, res, next) => {
  const { user } = auth(req)
  if (!user) return res.redirect("/login")
  if (user.role !== "admin") return res.status(403).send("Réservé à l'administrateur.")
  req.user = user
  next()
}

const commercePath = (p) => [
  "/dashboard/orders", "/dashboard/products", "/dashboard/stock", "/dashboard/paniers",
  "/dashboard/relances", "/dashboard/discounts", "/dashboard/categories", "/dashboard/shipping",
  "/dashboard/paiement", "/dashboard/transporteur", "/dashboard/livraison", "/dashboard/reviews",
  "/dashboard/customers", "/dashboard/marketing", "/dashboard/landings", "/dashboard/stats",
].some((b) => p === b || p.startsWith(b + "/"))

const requireStore = (req, res, next) => {
  const { session } = auth(req)
  req.session = session
  if (req.user.role === "admin" && session.supportStoreId) {
    const opened = db.prepare("SELECT * FROM stores WHERE id = ?").get(session.supportStoreId)
    if (opened) {
      req.store = opened
      req.isOwner = true
      req.perms = TEAM.ALL
      req.user.isOwner = true
      req.user.perms = TEAM.ALL
      req.user.support = { id: opened.id, name: opened.name, slug: opened.slug }
      req.user.stores = []
      const asked = req.query && (req.query.error || req.query.err)
      if (asked) req.user.flash = String(Array.isArray(asked) ? asked[0] : asked).slice(0, 400)
      return next()
    }
    session.supportStoreId = null
    saveSession(session.sid, session)
  }
  const owned = db.prepare("SELECT * FROM stores WHERE owner_id = ? ORDER BY id LIMIT 1").get(req.user.id)
  const memberRows = TEAM.storesFor(req.user.id)
  const choices = []
  if (owned) choices.push({ id: owned.id, name: owned.name, owner: true })
  for (const row of memberRows) {
    if (!owned || row.id !== owned.id) choices.push({ id: row.id, name: row.name, owner: false, perms: row.member_perms })
  }
  if (!choices.length) return res.redirect(req.user.role === "admin" ? "/admin" : "/signup")
  let pick = choices[0]
  if (session.storeId) {
    const hit = choices.find((c) => c.id === session.storeId)
    if (hit) pick = hit
  }
  const store = db.prepare("SELECT * FROM stores WHERE id = ?").get(pick.id)
  if (!store) return res.redirect("/signup")
  req.store = store
  req.session = session
  req.isOwner = !!(pick.owner || req.user.role === "admin")
  req.perms = req.isOwner ? TEAM.ALL : TEAM.parse(pick.perms)
  req.user.isOwner = req.isOwner
  req.user.perms = req.perms
  req.user.stores = choices
  const asked = req.query && (req.query.error || req.query.err)
  if (asked) req.user.flash = String(Array.isArray(asked) ? asked[0] : asked).slice(0, 400)
  const key = TEAM.need(req.path, req.method)
  const uploadOk = req.path.startsWith("/dashboard/upload")
    && (req.perms.has("design") || req.perms.has("products"))
  if (!req.isOwner && !uploadOk && !TEAM.allows(req.perms, key)) {
    return res.status(403).send(V.noAccess(req.user, store))
  }
  if (store.site_kind === "vitrine" && commercePath(req.path)) return res.redirect("/dashboard")
  next()
}

/** Journal admin. N'écrit pas sur le chemin normal d'une page. */
const logRow = (level, message, meta) => JOURNAL.write(level, message, meta)

const getStore = (slug) => {
  const store = db.prepare("SELECT * FROM stores WHERE slug = ? AND status = 'active'").get(slug)
  return store ? PT.dressStore(store) : store
}

/** Applique le brouillon (design/sections/nav) quand le propriétaire prévisualise. */
const withDraft = (store, req) => {
  if (!store || !req.query.preview) return store
  const { session } = auth(req)
  const user = session.userId ? db.prepare("SELECT id, role FROM users WHERE id = ?").get(session.userId) : null
  if (!user || (user.id !== store.owner_id && user.role !== "admin")) return store
  const draft = SECTIONS.readDraft(store)
  if (!draft) return store
  const origin = isTheme(draft.theme) ? draft.theme : (store._originTheme || store.theme)
  return PT.dressStore({
    ...store,
    _originTheme: origin,
    theme: origin,
    design: draft.design ? JSON.stringify(draft.design) : store.design,
    sections: draft.sections ? JSON.stringify(draft.sections) : store.sections,
    nav: draft.nav ? JSON.stringify(draft.nav) : store.nav,
    logo: (draft.design && draft.design.logo) || store.logo,
  })
}

/**
 * Prix saisi par un humain → centimes. Tolère « 1 200,50 », « 1200.5 », « 1200 ».
 * Renvoie null si vide, illisible, négatif ou absurde (jamais de NaN en base,
 * jamais un produit à −900 DZD).
 */
const parseDzdCents = (v) => {
  const raw = String(v == null ? "" : v).trim().replace(/[\s\u202f\u00a0]/g, "").replace(",", ".")
  if (!raw || !/^\d+(\.\d{1,2})?$/.test(raw)) return null
  const n = Math.round(parseFloat(raw) * 100)
  return Number.isFinite(n) && n <= 10000000000 ? n : null // plafond : 100 000 000 DZD
}

/** Cellule CSV sûre : guillemets doublés + anti-formule Excel/Sheets
 *  (une cellule qui commence par =, +, -, @ est préfixée d'une apostrophe). */
const csvCell = (v) => {
  let s = String(v == null ? "" : v)
  if (/^[=+\-@\t\r]/.test(s)) s = "'" + s
  return '"' + s.replace(/"/g, '""') + '"'
}

/** Quantité / stock : entier positif. Vide → 0 ; texte illisible → null (erreur). */
const parseQty = (v) => {
  const raw = String(v == null ? "" : v).trim()
  if (!raw) return 0
  if (!/^\d+$/.test(raw)) return null
  return Math.min(parseInt(raw, 10), 1000000)
}

/** Galerie + variantes envoyées en JSON par le formulaire produit. */
const bundleIds = (v) => {
  const arr = Array.isArray(v) ? v : String(v || "").split(",")
  return [...new Set(arr.map((x) => parseInt(x, 10)).filter((n) => n > 0))].slice(0, 3).join(",")
}
/** Titres de variante (JSON) : [{ name: "Taille", options: ["S","M","L"] }] — nettoyé et borné. */
const cleanOptionGroups = (raw) => {
  let list = []
  try { list = JSON.parse(raw || "[]") } catch (_) { list = [] }
  if (!Array.isArray(list)) return ""
  const out = []
  for (const g of list) {
    if (out.length >= 3) break
    const name = String((g && g.name) || "").trim().slice(0, 30)
    if (!name) continue
    const opts = (Array.isArray(g.options) ? g.options : [])
      .map((o) => String(o || "").trim().slice(0, 30)).filter(Boolean)
    const uniq = [...new Set(opts)].slice(0, 15)
    if (uniq.length) out.push({ name, options: uniq })
  }
  return out.length ? JSON.stringify(out) : ""
}

const saveExtras = (productId, body) => {
  if (body.option_groups !== undefined) {
    db.prepare("UPDATE products SET option_groups = ? WHERE id = ?").run(cleanOptionGroups(body.option_groups), productId)
  }
  let gallery = []
  let variants = []
  try { gallery = JSON.parse(body.gallery || "[]") } catch (_) { gallery = [] }
  try { variants = JSON.parse(body.variants || "[]") } catch (_) { variants = [] }

  if (Array.isArray(gallery)) {
    db.prepare("DELETE FROM product_images WHERE product_id = ?").run(productId)
    const ins = db.prepare("INSERT INTO product_images (product_id, url, position) VALUES (?, ?, ?)")
    gallery.filter((u) => typeof u === "string" && u.startsWith("/uploads/"))
      .slice(0, 8).forEach((u, i) => ins.run(productId, u, i))
  }

  if (Array.isArray(variants)) {
    db.prepare("DELETE FROM variants WHERE product_id = ?").run(productId)
    const ins = db.prepare("INSERT INTO variants (product_id, label, price_cents, stock, position) VALUES (?, ?, ?, ?, ?)")
    variants.filter((v) => v && String(v.label || "").trim())
      .slice(0, 20).forEach((v, i) =>
        ins.run(productId, String(v.label).trim().slice(0, 40),
          parseDzdCents(v.price) || null,
          Math.max(0, parseInt(v.stock, 10) || 0), i))
  }
}

const baseUrlFor = (req) =>
  process.env.PUBLIC_URL || `${req.protocol}://${req.get("host")}`

/* copie du panier en base : c'est ce qui rend les relances possibles */
const trackCart = (req, store, session, items, totals, contact) => {
  try { REL.touch(store, session.sid, { items, totals, contact }) } catch (_) { }
}

const cartFor = (session, slug) => {
  if (!session.cart.has(slug)) session.cart.set(slug, new Map())
  return session.cart.get(slug)
}

const cartDetails = (store, cart, promoCode, wilaya, delivery = "home") => {
  const items = []
  for (const [key, qty] of cart.entries()) {
    const parts = String(key).split(":")
    const pid = parseInt(parts[0], 10) || 0
    const vid = parseInt(parts[1], 10) || 0
    /* 3ᵉ morceau de la clé : les options choisies (« Taille : M · Couleur : Rouge ») */
    let opts = ""
    try { opts = decodeURIComponent(parts[2] || "") } catch (_) { opts = "" }
    const p = db.prepare("SELECT * FROM products WHERE id = ? AND store_id = ?").get(pid, store.id)
    if (!p || qty <= 0) continue
    const v = vid ? db.prepare("SELECT * FROM variants WHERE id = ? AND product_id = ?").get(vid, pid) : null
    const unit = v && v.price_cents ? v.price_cents : p.price_cents
    items.push({
      ...p, qty, key: String(key), product_id: p.id, variant: v, options: opts,
      title: [p.title, v ? v.label : "", opts].filter(Boolean).join(" — "),
      price_cents: unit, unit_cents: unit,
    })
  }
  const subtotal = items.reduce((all, i) => all + i.price_cents * i.qty, 0)
  const rate = wilaya ? SHOP.shippingFor(store.id, wilaya, delivery) : SHOP.shippingFor(store.id, "Alger", delivery)
  const shipping = subtotal > 0 ? rate : 0
  const pr = SHOP.applyPromo(store, promoCode, items, subtotal)
  const total = Math.max(0, subtotal - pr.discount) + shipping
  return {
    items,
    totals: { subtotal, shipping, discount: pr.discount, total, promo: pr.promo, promoError: pr.error || null },
  }
}

const promoOf = (session, slug) => (session.promo && session.promo.get(slug)) || ""

/* ------------------------------- landing ------------------------------- */
app.get("/", (req, res) => {
  const stores = db.prepare("SELECT * FROM stores WHERE status = 'active' ORDER BY id DESC LIMIT 6").all()
  res.send(landing(stores))
})

/* ------------------------------- auth ------------------------------- */
app.get("/signup", (req, res) => {
  const { user } = auth(req)
  if (user) return res.redirect("/dashboard")
  const site = SITES.isSite(req.query.site) ? req.query.site : ""
  const kind = site
    ? SITES.storeKindForSite(site)
    : (req.query.kind === "commerce" ? "commerce" : req.query.kind === "vitrine" ? "vitrine" : "")
  res.send(V.authPage("signup", null, kind, site))
})

app.post("/signup", (req, res) => {
  const kind = req.body.kind === "commerce" ? "commerce" : "vitrine"
  /* Un template de l'autre famille est ignoré : le type choisi par
     l'utilisateur gagne, mais aucun mélange n'entre en base. */
  const site = SITES.isSiteForStore(req.body.site, kind) ? req.body.site : ""
  const again = (msg) => res.status(400).send(V.authPage("signup", msg, kind, site))
  const name = String(req.body.name || "").trim()
  const storeName = String(req.body.store || "").trim()
  const email = String(req.body.email || "").trim().toLowerCase()
  const password = String(req.body.password || "")
  const password2 = String(req.body.password2 || "")

  if (!name) return again("Le nom est obligatoire.")
  if (!storeName) return again(kind === "commerce" ? "Le nom de la boutique est obligatoire." : "Le nom de la marque est obligatoire.")
  if (!email || !email.includes("@")) return again("E-mail invalide. Exemple : vous@exemple.dz.")
  if (password.length < 6) return again("Mot de passe trop court. 6 caractères minimum.")
  if (password2 !== password) return again("Les deux mots de passe ne correspondent pas.")
  if (db.prepare("SELECT 1 FROM users WHERE email = ?").get(email)) {
    return again("Cet e-mail est déjà utilisé. Connecte-toi, ou choisis-en un autre.")
  }

  const info = db.prepare("INSERT INTO users (email, password_hash, name) VALUES (?, ?, ?)")
    .run(email, hash(password), name)

  const slug = uniqueSlug(slugify(storeName))
  const firstTheme = THEMES[0] && THEMES[0].id
  const chosen = isTheme(firstTheme) ? firstTheme : DEFAULT_THEME
  db.prepare(`INSERT INTO stores (owner_id, slug, name, tagline, theme, site_kind) VALUES (?, ?, ?, ?, ?, ?)`)
    .run(info.lastInsertRowid, slug, storeName, "", chosen, kind)

  const session = regenerateSession(req, res)
  session.userId = info.lastInsertRowid
  saveSession(session.sid, session)

  if (site) {
    const st = db.prepare("SELECT * FROM stores WHERE slug = ?").get(slug)
    const draft = readOwnDraft(st)
    draft.design = SECTIONS.sanitizeDesign({ ...draft.design, siteTemplate: site }, st)
    db.prepare("UPDATE stores SET draft = ? WHERE id = ?").run(JSON.stringify(draft), st.id)
    return res.redirect("/dashboard/design?template=1")
  }
  res.redirect("/dashboard/design/themes")
})

/* Après connexion : l'écran d'accueil seulement si la boutique n'a pas encore
   ses coordonnées (téléphone + wilaya) ; sinon, droit au tableau de bord. */
const afterLogin = (user) => {
  const store = db.prepare("SELECT phone, wilaya FROM stores WHERE owner_id = ? ORDER BY id LIMIT 1").get(user.id)
  if (!store) return user.role === "admin" ? "/admin" : "/dashboard"
  const digits = String(store.phone || "").replace(/\D/g, "")
  return digits.length >= 9 && store.wilaya ? "/dashboard" : "/welcome"
}

app.get("/login", (req, res) => {
  const { user } = auth(req)
  if (user) return res.redirect(afterLogin(user))
  res.send(V.authPage("login"))
})

/* Bourrage d'identifiants : 10 échecs (IP + identifiant) → 15 minutes de pause.
   Un succès remet le compteur à zéro. En mémoire, purgé quand il grandit. */
const loginFails = new Map()
const loginKey = (req, who) => `${req.ip || "?"}|${who}`
const loginWaitSec = (req, who) => {
  const row = loginFails.get(loginKey(req, who))
  if (!row || !row.until) return 0
  if (Date.now() > row.until) { loginFails.delete(loginKey(req, who)); return 0 }
  return Math.ceil((row.until - Date.now()) / 1000)
}
const loginFailed = (req, who) => {
  if (loginFails.size > 5000) {
    for (const [k, r] of loginFails) if (!r.until || Date.now() > r.until) loginFails.delete(k)
  }
  const key = loginKey(req, who)
  const row = loginFails.get(key) || { n: 0, until: 0 }
  row.n++
  if (row.n >= 10) { row.until = Date.now() + 15 * 60e3; row.n = 0 }
  loginFails.set(key, row)
}
const loginSucceeded = (req, who) => loginFails.delete(loginKey(req, who))

/** Limite souple par IP (commandes, avis) : protège du spam sans gêner un client normal. */
const rateHits = new Map()
const rateLimit = (prefix, max, windowMs) => (req, res, next) => {
  const key = `${prefix}|${req.ip || "?"}`
  const now = Date.now()
  const row = rateHits.get(key)
  if (!row || now > row.until) {
    rateHits.set(key, { n: 1, until: now + windowMs })
    if (rateHits.size > 10000) rateHits.clear()
    return next()
  }
  row.n++
  if (row.n > max) {
    return res.status(429).send("Trop de demandes en peu de temps. Patiente quelques minutes, puis réessaie.")
  }
  return next()
}

app.post("/login", (req, res) => {
  const email = String(req.body.email || "").trim().toLowerCase()
  const password = String(req.body.password || "")
  const wait = loginWaitSec(req, email)
  if (wait > 0) {
    return res.status(429).send(V.authPage("login",
      `Trop d'essais de connexion. Réessaie dans ${Math.max(1, Math.ceil(wait / 60))} minute(s).`))
  }
  const user = db.prepare("SELECT * FROM users WHERE email = ? OR login_name = ?").get(email, email)

  if (!user) {
    loginFailed(req, email)
    logRow("warn", "connexion refusée", { email })
    return res.status(401).send(V.authPage("login", email.includes("@")
      ? "Cet e-mail n'existe pas. Vérifie l'orthographe, ou crée un compte."
      : `L'identifiant « ${email} » n'existe pas. Vérifie-le, ou ouvre le lien d'invitation.`))
  }
  if (!verify(password, user.password_hash)) {
    loginFailed(req, email)
    logRow("warn", "mot de passe refusé", { email })
    return res.status(401).send(V.authPage("login", "Mot de passe incorrect. Réessaie."))
  }
  if (Number(user.blocked) === 1) {
    logRow("warn", "connexion refusée, compte bloqué", { email })
    return res.status(403).send(V.authPage("login", "Ce compte est bloqué. La boutique, si elle existe, reste en ligne. Écris à l'équipe NovaDZ."))
  }
  loginSucceeded(req, email)
  const session = regenerateSession(req, res)
  session.userId = user.id
  session.supportStoreId = null
  saveSession(session.sid, session)
  res.redirect(afterLogin(user))
})

app.get("/welcome", (req, res) => {
  const { user } = auth(req)
  if (!user) return res.redirect("/login")
  const store = db.prepare("SELECT * FROM stores WHERE owner_id = ? ORDER BY id LIMIT 1").get(user.id)
  res.send(V.welcomePage(user, store, null))
})

app.post("/welcome", (req, res) => {
  const { user, session } = auth(req)
  if (!user) return res.redirect("/login")
  const GEO = require("./src/geo")
  const stores = db.prepare("SELECT * FROM stores WHERE owner_id = ? ORDER BY id").all(user.id)
  const store = stores[0]
  if (!store) return res.redirect(user.role === "admin" ? "/admin" : "/dashboard")
  const phone = String(req.body.phone || "").replace(/[^0-9+ ]/g, "").slice(0, 20)
  const whatsapp = String(req.body.whatsapp || "").replace(/[^0-9+ ]/g, "").slice(0, 20)
  const wilaya = String(req.body.wilaya || "").trim()
  const address = String(req.body.address || "").trim().slice(0, 200)
  const draft = { ...store, phone, whatsapp, wilaya, legal_address: address }
  if (phone.replace(/\D/g, "").length < 9) {
    return res.status(400).send(V.welcomePage(user, draft, "Le numéro de téléphone est obligatoire."))
  }
  if (!GEO.WILAYAS.includes(wilaya)) {
    return res.status(400).send(V.welcomePage(user, draft, "Choisis une wilaya."))
  }
  const ids = stores.map((s) => s.id)
  db.prepare(`UPDATE stores SET phone = ?, whatsapp = ?, wilaya = ?, legal_address = ? WHERE id IN (${ids.map(() => "?").join(",")})`)
    .run(phone, whatsapp || phone, wilaya, address, ...ids)
  session.storeId = store.id
  saveSession(session.sid, session)
  res.redirect("/dashboard")
})

/* Déconnexion en POST : un simple lien (ou une image piégée sur un autre site)
   ne doit pas pouvoir déconnecter le marchand. Le GET affiche une confirmation. */
app.get("/logout", (req, res) => {
  const { user } = auth(req)
  if (!user) return res.redirect("/")
  res.send(V.logoutPage(user))
})

app.post("/logout", (req, res) => {
  const { session } = auth(req)
  session.userId = null
  session.supportStoreId = null
  saveSession(session.sid, session)
  res.redirect("/")
})

app.get("/rejoindre/:token", (req, res) => {
  const row = TEAM.byToken(req.params.token)
  if (!row) return res.status(404).send(V.authPage("login", "Ce lien d'invitation n'existe plus."))
  if (row.status === "active" && row.user_id) {
    return res.send(V.authPage("login", "Ce lien a déjà été utilisé. Connecte-toi avec ton identifiant."))
  }
  const { session } = auth(req)
  const me = session.userId ? db.prepare("SELECT * FROM users WHERE id = ?").get(session.userId) : null
  if (me && me.id === row.owner_id) {
    return res.status(400).send(V.joinPage(row, "Ouvre ce lien sur le téléphone de la personne, pas dans ta session."))
  }
  res.send(V.joinPage(row, null))
})

app.post("/rejoindre/:token", (req, res) => {
  const row = TEAM.byToken(req.params.token)
  if (!row) return res.status(404).send(V.authPage("login", "Ce lien d'invitation n'existe plus."))
  const { session } = auth(req)
  const me = session.userId ? db.prepare("SELECT * FROM users WHERE id = ?").get(session.userId) : null
  if (me && me.id === row.owner_id) {
    return res.status(400).send(V.joinPage(row, "Ouvre ce lien sur le téléphone de la personne, pas dans ta session."))
  }
  const out = TEAM.accept(req.params.token, { name: req.body.name, password: req.body.password, login: req.body.login })
  if (out.error) return res.status(400).send(V.joinPage(out.row || row, out.error, out.fields))
  const fresh = regenerateSession(req, res)
  fresh.userId = out.userId
  fresh.storeId = out.storeId
  saveSession(fresh.sid, fresh)
  res.send(V.joinReady(row.store_name, out.loginName))
})

/* ------------------------------- dashboard ------------------------------- */
app.get("/dashboard/recus", requireAuth, requireStore, (req, res) => {
  if (req.store.site_kind !== "vitrine") return res.redirect("/dashboard")
  const rows = db.prepare("SELECT * FROM leads WHERE store_id = ? ORDER BY id DESC LIMIT 100").all(req.store.id)
  db.prepare("UPDATE leads SET read_at = datetime('now') WHERE store_id = ? AND read_at IS NULL").run(req.store.id)
  res.send(V.dashLeads(req.user, req.store, rows))
})

app.get("/dashboard/visites", requireAuth, requireStore, (req, res) => {
  if (req.store.site_kind !== "vitrine") return res.redirect("/dashboard/stats")
  const days = db.prepare(`SELECT day, SUM(hits) AS n FROM visits
    WHERE store_id = ? AND day >= date('now', '-13 days') GROUP BY day`).all(req.store.id)
  const byDay = new Map(days.map((r) => [r.day, r.n]))
  const daily = []
  for (let i = 13; i >= 0; i--) {
    const day = new Date(Date.now() - i * 86400000).toISOString().slice(0, 10)
    daily.push({ day, n: byDay.get(day) || 0 })
  }
  const visits = db.prepare(`SELECT COALESCE(SUM(hits), 0) AS n FROM visits
    WHERE store_id = ? AND day >= date('now', '-29 days')`).get(req.store.id).n
  const pages = db.prepare("SELECT COUNT(*) AS n FROM pages WHERE store_id = ?").get(req.store.id).n
  res.send(V.dashVisits(req.user, req.store, { visits, pages, daily }))
})

app.get("/dashboard", requireAuth, requireStore, (req, res) => {
  const { store } = req
  if (store.site_kind === "vitrine") {
    const pages = db.prepare("SELECT * FROM pages WHERE store_id = ? ORDER BY id DESC").all(store.id)
    const visits = db.prepare(`SELECT COALESCE(SUM(hits), 0) AS n FROM visits
      WHERE store_id = ? AND day >= date('now', '-29 days')`).get(store.id).n
    const recentLeads = db.prepare("SELECT * FROM leads WHERE store_id = ? ORDER BY id DESC LIMIT 6").all(store.id)
    const leadCount = db.prepare("SELECT COUNT(*) AS n FROM leads WHERE store_id = ?").get(store.id).n
    const unread = db.prepare("SELECT COUNT(*) AS n FROM leads WHERE store_id = ? AND read_at IS NULL").get(store.id).n
    return res.send(V.dashHome(req.user, store, {
      visits,
      pageCount: pages.length,
      published: pages.filter((p) => p.published).length,
      recentLeads, leadCount, unread,
    }, pages.slice(0, 5)))
  }
  const orders = db.prepare("SELECT * FROM orders WHERE store_id = ? ORDER BY id DESC").all(store.id)
  const products = db.prepare("SELECT * FROM products WHERE store_id = ?").all(store.id)
  const seeOrders = req.isOwner || req.perms.has("orders")
  const seeProducts = req.isOwner || req.perms.has("products")
  const real = seeOrders ? orders.filter((o) => !o.fake) : []
  const revenue = real.filter((o) => ORD.counts(o)).reduce((s, o) => s + o.total_cents, 0)

  const stats = {
    revenue: seeOrders ? revenue : 0,
    orderCount: seeOrders ? real.length : 0,
    newOrders: seeOrders ? real.filter((o) => ORD.norm(o.status) === "nouvelle").length : 0,
    toCheck: seeOrders ? real.filter((o) => ORD.norm(o.status) === "a_verifier").length : 0,
    shipped: seeOrders ? real.filter((o) => ORD.norm(o.status) === "expediee").length : 0,
    lost: seeOrders ? real.filter((o) => ORD.norm(o.status) === "perdue").length : 0,
    productCount: seeProducts ? products.length : 0,
    lowStock: seeProducts ? INV.lowStock(store.id, INV.threshold(store)).length : 0,
    avgBasket: seeOrders && real.length ? Math.round(revenue / real.length) : 0,
  }
  res.send(V.dashHome(req.user, store, stats, seeOrders ? real.slice(0, 5) : []))
})

/* --- produits --- */
app.get("/dashboard/products", requireAuth, requireStore, (req, res) => {
  const products = db.prepare(`SELECT p.*, c.name AS category FROM products p
                               LEFT JOIN categories c ON c.id = p.category_id
                               WHERE p.store_id = ? ORDER BY p.id DESC`).all(req.store.id)
  res.send(V.dashProducts(req.user, req.store, products))
})

app.get("/dashboard/products/new", requireAuth, requireStore, (req, res) =>
  res.send(V.productForm(req.user, req.store, null, {
    categories: SHOP.categories(req.store.id), gallery: [], variants: [], optionGroups: [],
    products: db.prepare("SELECT id, title FROM products WHERE store_id = ? ORDER BY title").all(req.store.id),
  })))

app.post("/dashboard/products", requireAuth, requireStore, (req, res) => {
  const { title, description } = req.body
  const fail = (msg) => res.redirect("/dashboard/products/new?error=" + encodeURIComponent(msg))
  if (!String(title || "").trim()) return fail("Le nom du produit est obligatoire.")
  const price = parseDzdCents(req.body.price)
  if (price === null) return fail("Le prix est invalide. Écris un nombre, par exemple 2 500 ou 2500,50.")
  const stock = parseQty(req.body.stock)
  if (stock === null) return fail("Le stock est invalide. Écris un nombre entier, par exemple 12.")
  const compare = String(req.body.compare || "").trim() ? parseDzdCents(req.body.compare) : 0
  if (compare === null) return fail("Le prix barré est invalide. Écris un nombre, ou laisse le champ vide.")
  const info = db.prepare(`INSERT INTO products (store_id, title, description, price_cents, image, category_id, focal, stock, active, compare_cents, bundle_ids)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .run(req.store.id, String(title).trim().slice(0, 140), String(description || "").slice(0, 5000), price, req.body.image || null,
      parseInt(req.body.category_id, 10) || null, req.body.focal || "center", stock, req.body.active ? 1 : 0,
      compare, bundleIds(req.body.bundle_ids))
  saveExtras(info.lastInsertRowid, req.body)
  if (stock) INV.record(req.store.id, info.lastInsertRowid, null, stock, stock, "creation", null, "Stock initial")
  res.redirect("/dashboard/products")
})

app.get("/dashboard/products/:id", requireAuth, requireStore, (req, res) => {
  const product = db.prepare("SELECT * FROM products WHERE id = ? AND store_id = ?").get(req.params.id, req.store.id)
  if (!product) return res.redirect("/dashboard/products")
  res.send(V.productForm(req.user, req.store, product, {
    categories: SHOP.categories(req.store.id),
    gallery: SHOP.images(product.id),
    variants: SHOP.variants(product.id),
    optionGroups: (() => { try { return JSON.parse(product.option_groups || "[]") } catch (_) { return [] } })(),
    products: db.prepare("SELECT id, title FROM products WHERE store_id = ? AND id != ? ORDER BY title")
      .all(req.store.id, product.id),
  }))
})

app.post("/dashboard/products/:id", requireAuth, requireStore, (req, res) => {
  const fail = (msg) => res.redirect(`/dashboard/products/${req.params.id}?error=` + encodeURIComponent(msg))
  if (!String(req.body.title || "").trim()) return fail("Le nom du produit est obligatoire.")
  const price = parseDzdCents(req.body.price)
  if (price === null) return fail("Le prix est invalide. Écris un nombre, par exemple 2 500 ou 2500,50.")
  const newStock = parseQty(req.body.stock)
  if (newStock === null) return fail("Le stock est invalide. Écris un nombre entier, par exemple 12.")
  const compare = String(req.body.compare || "").trim() ? parseDzdCents(req.body.compare) : 0
  if (compare === null) return fail("Le prix barré est invalide. Écris un nombre, ou laisse le champ vide.")
  const prev = db.prepare("SELECT image, stock FROM products WHERE id = ? AND store_id = ?").get(req.params.id, req.store.id)
  db.prepare(`UPDATE products SET title = ?, description = ?, price_cents = ?, image = ?, category_id = ?,
              focal = ?, stock = ?, active = ?, compare_cents = ?, bundle_ids = ? WHERE id = ? AND store_id = ?`)
    .run(String(req.body.title).trim().slice(0, 140), String(req.body.description || "").slice(0, 5000), price,
      req.body.image || null, parseInt(req.body.category_id, 10) || null, req.body.focal || "center",
      newStock, req.body.active ? 1 : 0,
      compare,
      bundleIds(req.body.bundle_ids), req.params.id, req.store.id)
  saveExtras(req.params.id, req.body)
  if (prev && prev.stock !== newStock) INV.record(req.store.id, Number(req.params.id), null, newStock - prev.stock, newStock, "inventaire", null, "Modifié depuis la fiche produit")
  if (prev && prev.image && prev.image !== req.body.image) UPLOADS.removeUrl(prev.image, db)
  res.redirect("/dashboard/products")
})

app.post("/dashboard/products/:id/delete", requireAuth, requireStore, (req, res) => {
  const prev = db.prepare("SELECT image FROM products WHERE id = ? AND store_id = ?").get(req.params.id, req.store.id)
  const gallery = db.prepare("SELECT url FROM product_images WHERE product_id = ?").all(req.params.id)
  db.prepare("DELETE FROM products WHERE id = ? AND store_id = ?").run(req.params.id, req.store.id)
  db.prepare("DELETE FROM product_images WHERE product_id = ?").run(req.params.id)
  /* les fichiers partagés avec un autre produit sont conservés (removeUrl vérifie) */
  if (prev && prev.image) UPLOADS.removeUrl(prev.image, db)
  for (const g of gallery) UPLOADS.removeUrl(g.url, db)
  res.redirect("/dashboard/products")
})

/* copie : photos, prix, variantes. Le stock est un nouveau stock, pas partagé. */
app.post("/dashboard/products/:id/duplicate", requireAuth, requireStore, (req, res) => {
  const p = db.prepare("SELECT * FROM products WHERE id = ? AND store_id = ?").get(req.params.id, req.store.id)
  if (!p) return res.redirect("/dashboard/products")
  const title = ("Copie de " + String(p.title || "produit")).slice(0, 140)
  const info = db.prepare(`INSERT INTO products
    (store_id, title, description, price_cents, image, category_id, focal, stock, active, compare_cents, bundle_ids, option_groups)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .run(req.store.id, title, p.description || "", p.price_cents || 0, p.image || null,
      p.category_id || null, p.focal || "center", p.stock || 0, p.active ? 1 : 0,
      p.compare_cents || 0, p.bundle_ids || "", p.option_groups || "")
  const id = info.lastInsertRowid
  const imgs = db.prepare("SELECT url, position FROM product_images WHERE product_id = ? ORDER BY position").all(p.id)
  const insImg = db.prepare("INSERT INTO product_images (product_id, url, position) VALUES (?, ?, ?)")
  for (const im of imgs) insImg.run(id, im.url, im.position || 0)
  const vars = db.prepare("SELECT label, price_cents, stock, position FROM variants WHERE product_id = ? ORDER BY position").all(p.id)
  const insV = db.prepare("INSERT INTO variants (product_id, label, price_cents, stock, position) VALUES (?, ?, ?, ?, ?)")
  for (const v of vars) {
    const row = insV.run(id, v.label, v.price_cents, v.stock || 0, v.position || 0)
    if (v.stock) INV.record(req.store.id, id, row.lastInsertRowid, v.stock, v.stock, "creation", null, "Copie")
  }
  if (p.stock) INV.record(req.store.id, id, null, p.stock, p.stock, "creation", null, "Copie du produit")
  res.redirect(`/dashboard/products/${id}`)
})

/* --- commandes --- */
app.get("/dashboard/formulaire", requireAuth, requireStore, (req, res) => {
  res.send(V.dashForm(req.user, req.store, CF.getFields(req.store), req.query.ok))
})

app.get("/dashboard/notices", requireAuth, requireStore, (req, res) => {
  res.json({ unread: NOTICES.unread(req.store.id), items: NOTICES.list(req.store.id) })
})

/* la page ouverte reçoit la commande à la seconde où elle est enregistrée */
app.get("/dashboard/notices/flux", requireAuth, requireStore, (req, res) => {
  res.setHeader("Content-Type", "text/event-stream; charset=utf-8")
  res.setHeader("Cache-Control", "no-cache, no-transform")
  res.setHeader("Connection", "keep-alive")
  res.setHeader("X-Accel-Buffering", "no")
  res.flushHeaders()
  res.write("retry: 2000\n\n")
  if (req.socket) req.socket.setTimeout(0)
  const stop = NOTICES.subscribe(req.store.id, res)
  const beat = setInterval(() => {
    try { res.write(": ping\n\n") } catch (e) {}
  }, 15000)
  if (beat.unref) beat.unref()
  req.on("close", () => { clearInterval(beat); stop() })
})

app.post("/dashboard/notices/lu", requireAuth, requireStore, (req, res) => {
  const id = parseInt(req.body.id, 10) || 0
  NOTICES.mark(req.store.id, id || null)
  if (String(req.headers.accept || "").includes("application/json")) {
    return res.json({ unread: NOTICES.unread(req.store.id) })
  }
  res.redirect("back")
})

app.get("/dashboard/historique", requireAuth, requireStore, (req, res) => {
  const phone = String(req.query.phone || "")
  res.send(V.dashHistory(req.user, req.store, phone, phone ? HIST.summary(phone) : null))
})

app.get("/api/historique", (req, res) => {
  const { user } = auth(req)
  if (!user) return res.status(401).json({ ok: false, error: "Connecte-toi pour voir l'historique." })
  res.json(HIST.summary(req.query.phone || ""))
})

app.post("/dashboard/formulaire", requireAuth, requireStore, (req, res) => {
  CF.saveFromBody(db, req.store, req.body)
  res.redirect("/dashboard/formulaire?ok=1")
})

app.get("/dashboard/stats", requireAuth, requireStore, (req, res) => {
  res.send(V.dashStats(req.user, req.store, STATS.business(req.store.id)))
})

/* quelques colis ouverts, pas toute la file : l'API du transporteur a un quota */
const refreshOpen = async (storeId) => {
  const rows = db.prepare(`SELECT s.* FROM shipments s WHERE s.store_id = ?
    AND COALESCE(s.mapped, '') NOT IN ('livree', 'annulee') AND s.tracking != ''
    AND (s.synced_at IS NULL OR s.synced_at < datetime('now', '-20 minutes'))
    ORDER BY s.id DESC LIMIT 6`).all(storeId)
  if (!rows.length) return
  await Promise.race([
    (async () => {
      for (const s of rows) {
        try { await CARRIERS.syncOne(s) } catch (_) {}
      }
    })(),
    new Promise((resolve) => setTimeout(resolve, 2500)),
  ])
}

app.get("/dashboard/orders", requireAuth, requireStore, async (req, res, next) => {
  try {
    await refreshOpen(req.store.id)
  } catch (_) {}
  try {
  const orders = CARRIERS.annotate(req.store.id, db.prepare("SELECT * FROM orders WHERE store_id = ? ORDER BY id DESC").all(req.store.id))
  const itemRows = db.prepare(`SELECT oi.order_id, oi.title, oi.qty FROM order_items oi
    JOIN orders o ON o.id = oi.order_id WHERE o.store_id = ?`).all(req.store.id)
  const itemsByOrder = {}
  for (const it of itemRows) {
    if (!itemsByOrder[it.order_id]) itemsByOrder[it.order_id] = []
    itemsByOrder[it.order_id].push(it)
  }
  for (const o of orders) o.items = itemsByOrder[o.id] || []
  const rawStatut = String(req.query.statut || "").slice(0, 20)
  const filter = {
    statut: rawStatut === "test" ? "" : rawStatut,
    src: String(req.query.src || "").slice(0, 30),
    q: String(req.query.q || "").trim().slice(0, 60),
    test: req.query.test === "1" || rawStatut === "test" ? "1" : "",
  }
  const needle = filter.q.toLowerCase()
  const shown = orders.filter((o) => {
    if (filter.test ? !o.fake : o.fake) return false
    if (filter.statut) {
      const want = ORD.norm(filter.statut)
      const got = ORD.norm(o.status)
      /* « En attente » rassemble les commandes neuves et celles signalées par le contrôle */
      const ok = want === got || (want === "nouvelle" && got === "a_verifier")
      if (!ok) return false
    }
    if (filter.src && ORD.normSource(o.source) !== filter.src) return false
    if (needle) {
      const hay = `${o.ref} ${o.customer_name} ${o.phone} ${o.wilaya} ${o.commune || ""} ${o.utm_campaign || ""} ${o.tracking || ""} ${o.carrier_name || ""}`.toLowerCase()
      if (!hay.includes(needle)) return false
    }
    return true
  })
  res.send(V.dashOrders(req.user, req.store, orders, {
    filter, shown, sources: STATS.bySource(req.store.id), devices: STATS.byDevice(req.store.id),
    bulkDone: parseInt(req.query.lots, 10) || 0,
  }))
  } catch (e) { next(e) }
})

/* --- une commande de test, hors chiffre d'affaires (aucun stock touché) --- */
app.post("/dashboard/orders/fake", requireAuth, requireStore, (req, res) => {
  const store = req.store
  const p = db.prepare("SELECT * FROM products WHERE store_id = ? ORDER BY id LIMIT 1").get(store.id)
  const price = p ? p.price_cents : 250000
  const ref = REFS.uniqueRef(db, store.id)
  const info = db.prepare(`INSERT INTO orders
    (store_id, ref, customer_name, phone, address, wilaya, note, subtotal_cents, shipping_cents,
     total_cents, status, fake, source, utm_source, utm_medium, utm_campaign, utm_content,
     landing, referrer, device, delivery_type)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'nouvelle', 1, 'facebook', 'facebook', 'paid', 'test-campagne',
            'test-creatif', '/${store.slug}', 'https://www.facebook.com/', 'mobile', 'home')`)
    .run(store.id, ref, "Client de test", "0555 00 00 00", "Adresse de test", store.wilaya || "Alger",
      "Commande de test : elle n'entre dans aucun chiffre.", price, 0, price)
  db.prepare("INSERT INTO order_items (order_id, product_id, title, price_cents, qty) VALUES (?, ?, ?, ?, 1)")
    .run(info.lastInsertRowid, p ? p.id : null, p ? p.title : "Article de démonstration", price)
  ORD.log(store.id, info.lastInsertRowid, "fake", "Commande de test créée",
    "Pour essayer les boutons sans fausser les chiffres")
  res.redirect(`/dashboard/orders/${info.lastInsertRowid}`)
})

/* --- modifier une commande : infos client, articles, quantités, tarifs --- */
app.post("/dashboard/orders/:id/edit", requireAuth, requireStore, (req, res) => {
  const order = db.prepare("SELECT * FROM orders WHERE id = ? AND store_id = ?").get(req.params.id, req.store.id)
  if (!order) return res.redirect("/dashboard/orders")

  /* articles : [{ title, price, qty, product_id }], envoyés par la fiche en JSON */
  let rows = []
  try { rows = JSON.parse(req.body.items || "[]") } catch (_) { rows = [] }
  const items = (Array.isArray(rows) ? rows : []).map((r) => ({
    product_id: parseInt(r.product_id, 10) || null,
    variant_id: parseInt(r.variant_id, 10) || null,
    title: String(r.title || "").trim().slice(0, 160),
    price_cents: parseDzdCents(r.price) || 0,
    qty: Math.max(1, parseInt(r.qty, 10) || 1),
  })).filter((r) => r.title)
  if (!items.length) return res.redirect(`/dashboard/orders/${order.id}?edit=vide`)

  const subtotal = items.reduce((a, b) => a + b.price_cents * b.qty, 0)
  const shipping = parseDzdCents(req.body.shipping) || 0
  const discount = parseDzdCents(req.body.discount) || 0
  const total = Math.max(0, subtotal - discount) + shipping
  const delivery = req.body.delivery_type === "desk" ? "desk" : "home"

  const tx = db.transaction(() => {
    db.prepare(`UPDATE orders SET customer_name = ?, phone = ?, wilaya = ?, commune = ?, address = ?,
                note = ?, delivery_type = ?, subtotal_cents = ?, shipping_cents = ?, discount_cents = ?,
                total_cents = ? WHERE id = ? AND store_id = ?`)
      .run(String(req.body.customer_name || order.customer_name).trim().slice(0, 80),
        String(req.body.phone || order.phone).trim().slice(0, 20),
        String(req.body.wilaya || "").trim().slice(0, 40),
        String(req.body.commune || "").trim().slice(0, 60),
        String(req.body.address || "").trim().slice(0, 200),
        String(req.body.note || "").slice(0, 400),
        delivery, subtotal, shipping, discount, total, order.id, req.store.id)
    db.prepare("DELETE FROM order_items WHERE order_id = ?").run(order.id)
    const ins = db.prepare(`INSERT INTO order_items (order_id, product_id, title, price_cents, qty, variant_id)
                            VALUES (?, ?, ?, ?, ?, ?)`)
    items.forEach((it) => ins.run(order.id, it.product_id, it.title, it.price_cents, it.qty, it.variant_id))
    ORD.log(req.store.id, order.id, "edit", "Commande modifiée",
      `${items.length} article(s) · total ${Math.round(total / 100)} DZD`)
  })
  tx()
  try { HIST.stamp(order.id) } catch (_) {}
  res.redirect(`/dashboard/orders/${order.id}?edit=ok`)
})

/* --- sélection multiple dans la liste des commandes --- */
app.post("/dashboard/orders/bulk", requireAuth, requireStore, (req, res) => {
  const ids = String(req.body.ids || "").split(",").map((n) => parseInt(n, 10)).filter((n) => n > 0).slice(0, 200)
  const action = String(req.body.action || "")
  const allowed = { confirmee: "confirmee", annulee: "annulee", reportee: "reportee", injoignable: "injoignable" }
  if (!ids.length || !allowed[action]) return res.redirect("/dashboard/orders")
  let done = 0
  for (const id of ids) {
    const order = db.prepare("SELECT * FROM orders WHERE id = ? AND store_id = ?").get(id, req.store.id)
    if (!order) continue
    ORD.setStatus(order, allowed[action], req.user.email)
    done++
  }
  res.redirect(`/dashboard/orders?lots=${done}`)
})

app.post("/dashboard/orders/:id/status", requireAuth, requireStore, (req, res) => {
  const order = db.prepare("SELECT * FROM orders WHERE id = ? AND store_id = ?").get(req.params.id, req.store.id)
  if (!order) return res.redirect("/dashboard/orders")
  /* annuler une commande remet les articles en stock (une seule fois) */
  ORD.setStatus(order, req.body.status, req.user.email)
  res.redirect(req.body.back === "detail" ? `/dashboard/orders/${order.id}` : "/dashboard/orders")
})

/** Retour arrière limité au tableau de bord (jamais une adresse externe). */
const backTo = (req, fallback = "/dashboard/orders") => {
  const ref = String(req.get("referer") || "")
  try {
    const u = new URL(ref)
    if (u.host === req.get("host") && u.pathname.startsWith("/dashboard")) return u.pathname + u.search
  } catch (e) { /* en-tête absent : on retombe sur la liste */ }
  return fallback
}

/* --- appels sans réponse : au 3e, la commande devient injoignable --- */
app.post("/dashboard/orders/:id/attempt", requireAuth, requireStore, (req, res) => {
  const order = db.prepare("SELECT * FROM orders WHERE id = ? AND store_id = ?").get(req.params.id, req.store.id)
  if (!order) return res.redirect("/dashboard/orders")
  ORD.attempt(order, req.user.email)
  res.redirect(req.body.back === "detail" ? `/dashboard/orders/${order.id}` : backTo(req))
})

/* --- commande de test : sortie des chiffres, jamais supprimée --- */
app.post("/dashboard/orders/:id/fake", requireAuth, requireStore, (req, res) => {
  const order = db.prepare("SELECT * FROM orders WHERE id = ? AND store_id = ?").get(req.params.id, req.store.id)
  if (!order) return res.redirect("/dashboard/orders")
  ORD.setFake(order, !order.fake)
  res.redirect(req.body.back === "detail" ? `/dashboard/orders/${order.id}` : backTo(req))
})

/* --- WhatsApp : on journalise la relance puis on ouvre la conversation --- */
app.get("/dashboard/orders/:id/whatsapp", requireAuth, requireStore, (req, res) => {
  const order = db.prepare("SELECT * FROM orders WHERE id = ? AND store_id = ?").get(req.params.id, req.store.id)
  if (!order) return res.redirect("/dashboard/orders")
  const sent = CARRIERS.shipmentOfOrder(order.id)
  if (sent) order.carrier_name = sent.carrier_name || sent.carrier_label || ""
  const text = req.query.msg
    ? String(req.query.msg).slice(0, 400)
    : ORD.waText(order)
  ORD.log(req.store.id, order.id, "whatsapp", "Message WhatsApp préparé", `vers ${order.phone}`)
  res.redirect("https://wa.me/" + String(order.phone).replace(/[^0-9]/g, "").replace(/^0/, "213") + "?text=" + encodeURIComponent(text))
})

/* --- réglages --- */

/* ---------------------------- ÉDITEUR DE BOUTIQUE ---------------------------- */
app.get("/dashboard/design", requireAuth, requireStore, (req, res) => {
  const draftNow = SECTIONS.readDraft(req.store)
  const shownId = draftNow && isTheme(draftNow.theme) ? draftNow.theme : (req.store.theme || DEFAULT_THEME)
  const theme = PT.present(THEMES).find((t) => t.id === shownId)
  const products = db.prepare("SELECT id, title FROM products WHERE store_id = ? AND active = 1 ORDER BY id").all(req.store.id)
  const pages = db.prepare("SELECT id, title, slug FROM pages WHERE store_id = ? ORDER BY id").all(req.store.id)
  const draft = SECTIONS.readDraft(req.store)
  const state = draft
    ? { ...req.store, ...{
        design: draft.design ? JSON.stringify(draft.design) : req.store.design,
        sections: draft.sections ? JSON.stringify(draft.sections) : req.store.sections,
        nav: draft.nav ? JSON.stringify(draft.nav) : req.store.nav,
        logo: (draft.design && draft.design.logo) || req.store.logo,
      } }
    : req.store
  res.send(V.dashDesign(req.user, state, theme ? theme.name : "Boutique", products, pages, {
    dirty: !!draft, publishedAt: req.store.published_at, template: req.query.template === "1",
  }))
})

/* envoi d'image (data-URL depuis l'éditeur ou la fiche produit) */
app.post("/dashboard/upload", requireAuth, requireStore, (req, res) => {
  const out = UPLOADS.saveDataUrl(req.body && req.body.dataUrl)
  if (!out.ok) return res.status(400).json(out)
  res.json(out)
})

/* ------------- brouillon : tout passe par ici, la mise en ligne est explicite ------------- */
const readOwnDraft = (store) => {
  const d = SECTIONS.readDraft(store) || {}
  return {
    design: d.design || SECTIONS.readDesign(store),
    sections: d.sections || SECTIONS.readSections(store),
    nav: d.nav || SECTIONS.readNav(store),
    theme: d.theme || store.theme,
    publicThemeId: d.publicThemeId || null,
    publicThemeName: d.publicThemeName || "",
    publicThemeTouched: !!d.publicThemeTouched,
  }
}

app.get("/dashboard/assistant", requireAuth, requireStore, (req, res) => {
  res.send(V.dashAssistant(req.user, req.store))
})

app.post("/dashboard/assistant/ask", requireAuth, requireStore, (req, res) => {
  const q = String((req.body && req.body.q) || "")
  const out = AI.answer(req.store, q)
  logRow("info", "assistant", { store: req.store.slug, q: q.slice(0, 80) })
  res.json({ ok: true, answer: out.answer, signals: out.signals || [] })
})

app.post("/dashboard/assistant/site", requireAuth, requireStore, (req, res) => {
  const prompt = String((req.body && req.body.prompt) || "")
  const built = AI.compose(req.store, prompt)
  if (!built.ok) return res.status(400).json(built)
  AI.saveDraft(req.store, built)
  logRow("info", "ia site, brouillon", { store: req.store.slug, theme: built.theme, sections: built.used })
  res.json({ ok: true, summary: built.summary, theme: built.themeName, sections: built.used, published: false })
})

const fontCache = new Map()
app.post("/dashboard/fonts", requireAuth, requireStore, async (req, res) => {
  const q = String((req.body && req.body.q) || "").trim().slice(0, 40).toLowerCase()
  const local = Object.values(SECTIONS.FONTS).map((f) => f.google).filter(Boolean)
  const families = local.filter((name) => !q || name.toLowerCase().includes(q))
  const key = String(process.env.GOOGLE_FONTS_KEY || "").trim()
  if (!/^AIza[0-9A-Za-z_-]{20,80}$/.test(key)) {
    return res.json({ ok: true, source: "liste", families: families.slice(0, 12) })
  }
  try {
    let items = fontCache.get("platform")
    if (!items) {
      const r = await fetch("https://www.googleapis.com/webfonts/v1/webfonts?sort=popularity&key=" + encodeURIComponent(key), {
        headers: { Accept: "application/json" },
      })
      const data = await r.json().catch(() => ({}))
      if (!r.ok) return res.json({ ok: true, source: "liste", families: families.slice(0, 12) })
      items = (data.items || []).map((f) => f.family).filter((name) => SECTIONS.safeFamily(name))
      fontCache.set("platform", items)
    }
    const remote = items.filter((name) => !q || name.toLowerCase().includes(q)).slice(0, 12)
    res.json({ ok: true, source: "google", families: remote.length ? remote : families.slice(0, 12) })
  } catch (_) {
    res.json({ ok: true, source: "liste", families: families.slice(0, 12) })
  }
})

app.post("/dashboard/design/save", requireAuth, requireStore, (req, res) => {
  const body = req.body || {}
  const draft = readOwnDraft(req.store)

  if (body.design) draft.design = SECTIONS.sanitizeDesign({ siteTemplate: (draft.design || {}).siteTemplate, ...body.design }, req.store)
  if (body.nav !== undefined) {
    const nav = SECTIONS.sanitizeNav(body.nav)
    if (!nav) return res.status(400).json({ ok: false, error: "navigation invalide" })
    draft.nav = nav
  }
  if (body.sections !== undefined) {
    const clean = SECTIONS.sanitize(body.sections)
    if (!clean) return res.status(400).json({ ok: false, error: "sections invalides" })
    draft.sections = clean
  }
  PT.noteTouch(draft)

  db.prepare("UPDATE stores SET draft = ? WHERE id = ?").run(JSON.stringify(draft), req.store.id)
  res.json({ ok: true, dirty: true })
})

app.post("/dashboard/design/publish", requireAuth, requireStore, (req, res) => {
  const draft = readOwnDraft(req.store)
  const linked = draft.publicThemeId && !draft.publicThemeTouched
  db.prepare(`UPDATE stores SET design = ?, sections = ?, nav = ?, logo = ?, theme = ?, published_at = datetime('now'),
              theme_src = ?, theme_touched = ?
              WHERE id = ?`)
    .run(JSON.stringify(draft.design), JSON.stringify(draft.sections), JSON.stringify(draft.nav),
      draft.design.logo || null, isTheme(draft.theme) ? draft.theme : req.store.theme,
      linked ? draft.publicThemeId : null, linked ? 0 : 0, req.store.id)
  db.prepare("INSERT INTO versions (store_id, kind, payload) VALUES (?, 'design', ?)")
    .run(req.store.id, JSON.stringify(draft))
  logRow("info", `design publié (${req.store.slug})`, { sections: draft.sections.length })
  res.json({ ok: true, published: true })
})

app.get("/dashboard/design/themes", requireAuth, requireStore, (req, res) =>
  res.send(V.dashThemes(req.user, req.store, TEMPLATES.list(req.store.id))))

/** HTML réel de la page en cours, pour l'éditeur de code. Pas le document entier. */
app.get("/dashboard/design/source", requireAuth, requireStore, (req, res) => {
  const SOURCE = require("./src/pagesource")
  const key = String(req.query.page || "home").slice(0, 80)
  const draft = SECTIONS.readDraft(req.store) || {}
  const store = {
    ...req.store,
    design: draft.design ? JSON.stringify(draft.design) : req.store.design,
    sections: draft.sections ? JSON.stringify(draft.sections) : req.store.sections,
    nav: draft.nav ? JSON.stringify(draft.nav) : req.store.nav,
    theme: isTheme(draft.theme) ? draft.theme : req.store.theme,
    logo: (draft.design && draft.design.logo) || req.store.logo,
  }
  const products = SHOP.searchProducts(store.id, {})
  let html = ""
  try {
    if (key === "home") {
      html = SOURCE.sourceFor(store, "home", {
        products,
        meta: { categories: SHOP.categories(store.id).filter((c) => c.n > 0), count: products.length },
      })
    } else if (key === "product") {
      const p = products[0]
      if (!p) html = SOURCE.sourceFor(store, "product", { html: `<section class="wrap"><h1>Aucun produit</h1><p>Ajoute un produit pour voir le code de la fiche.</p></section>`, title: "Fiche produit" })
      else {
        html = SOURCE.sourceFor(store, "product", {
          products,
          product: p,
          related: products.filter((x) => x.id !== p.id).slice(0, 3),
          extra: {
            gallery: SHOP.images(p.id),
            variants: SHOP.variants(p.id),
            reviews: SHOP.reviews(p.id),
            rating: SHOP.rating(p.id),
          },
        })
      }
    } else if (key === "cart" || key === "checkout") {
      const first = products[0]
      const sample = first ? new Map([[String(first.id), 1]]) : new Map()
      SHOP.ensureShipping(store.id)
      const types = SHOP.deliveryTypes(store)
      const delivery = types.length ? types[0].id : "home"
      const { items, totals } = cartDetails(store, sample, "", null, delivery)
      if (key === "cart") html = SOURCE.sourceFor(store, "cart", { products, items, totals })
      else html = SOURCE.sourceFor(store, "checkout", {
        products, items, totals,
        extra: {
          wilayas: SHOP.WILAYAS,
          shipping: SHOP.shippingTable(store.id),
          payments: PAY.list(store),
          delivery: types,
          preview: true,
        },
      })
    } else if (key === "legal") {
      const full = V.legalPage(store, 0, { preview: true })
      html = SOURCE.sourceFor(store, "legal", { products, html: SOURCE.extractArticle(full, "doc"), title: "Informations légales" })
    } else if (key === "account") {
      const full = V.customerAccount(store, null, [], null, true)
      html = SOURCE.sourceFor(store, "account", { products, html: SOURCE.extractArticle(full, "acc"), title: "Compte client" })
    } else if (key.startsWith("page:")) {
      const slug = key.slice(5, 80)
      const page = db.prepare("SELECT * FROM pages WHERE store_id = ? AND slug = ?").get(store.id, slug)
      const full = page ? V.contentPage(store, page, 0) : ""
      html = SOURCE.sourceFor(store, key, {
        products,
        html: SOURCE.extractArticle(full, "doc"),
        title: page ? page.title : "Page",
      })
    } else {
      html = SOURCE.sourceFor(store, "home", { products })
    }
  } catch (err) {
    return res.status(500).json({ ok: false, error: "code indisponible" })
  }
  res.json({ ok: true, page: key, html })
})

app.post("/dashboard/design/template", requireAuth, requireStore, (req, res) => {
  const body = req.body || {}
  const draft = readOwnDraft(req.store)
  if (body.design) draft.design = SECTIONS.sanitizeDesign(body.design, req.store)
  if (body.nav !== undefined) {
    const nav = SECTIONS.sanitizeNav(body.nav)
    if (!nav) return res.status(400).json({ ok: false, error: "navigation invalide" })
    draft.nav = nav
  }
  if (body.sections !== undefined) {
    const clean = SECTIONS.sanitize(body.sections)
    if (!clean) return res.status(400).json({ ok: false, error: "sections invalides" })
    draft.sections = clean
  }
  db.prepare("UPDATE stores SET draft = ? WHERE id = ?").run(JSON.stringify(draft), req.store.id)
  const out = TEMPLATES.save(req.store.id, body.name, draft)
  if (!out.ok) return res.status(400).json(out)
  res.json(out)
})

/* Template « site complet » : on le charge dans le brouillon, la mise en ligne reste explicite. */
app.post("/dashboard/design/site-template", requireAuth, requireStore, (req, res) => {
  const id = String((req.body && req.body.id) || "")
  if (id && !SITES.isSiteForStore(id, req.store)) return res.redirect("/dashboard/design/themes")
  const draft = readOwnDraft(req.store)
  draft.design = SECTIONS.sanitizeDesign({ ...draft.design, siteTemplate: id }, req.store)
  db.prepare("UPDATE stores SET draft = ? WHERE id = ?").run(JSON.stringify(draft), req.store.id)
  res.redirect(id ? "/dashboard/design?template=1" : "/dashboard/design/themes")
})

app.post("/dashboard/design/template/:id/apply", requireAuth, requireStore, (req, res) => {
  const row = TEMPLATES.get(req.params.id, req.store.id)
  if (!row) return res.redirect("/dashboard/design/themes")
  let payload = {}
  try { payload = JSON.parse(row.payload) } catch (_) { payload = {} }
  const draft = {
    /* le logo du marchand n'appartient pas au modèle : il survit à l'application */
    design: SECTIONS.sanitizeDesign({ ...(payload.design || {}), logo: req.store.logo || "" }, req.store),
    sections: SECTIONS.sanitize(payload.sections) || payload.sections || {},
    nav: SECTIONS.sanitizeNav(payload.nav) || payload.nav || [],
    theme: isTheme(payload.theme) ? payload.theme : req.store.theme,
  }
  db.prepare("UPDATE stores SET draft = ? WHERE id = ?").run(JSON.stringify(draft), req.store.id)
  res.redirect("/dashboard/design?template=1")
})

app.post("/dashboard/design/template/:id/delete", requireAuth, requireStore, (req, res) => {
  TEMPLATES.remove(req.params.id, req.store.id)
  res.redirect("/dashboard/design/themes")
})

/**
 * Choisir un thème ne touche PAS à la boutique en ligne : le thème devient un
 * « thème d'essai » dans le brouillon. Le marchand voit le résultat dans
 * l'éditeur, ajuste ce qu'il veut, puis publie (ou annule).
 */
app.post("/dashboard/design/theme", requireAuth, requireStore, (req, res) => {
  const theme = isTheme(req.body.theme) ? req.body.theme : DEFAULT_THEME
  const draft = readOwnDraft(req.store)
  draft.theme = theme
  draft.publicThemeId = null
  draft.publicThemeName = ""
  draft.publicThemeTouched = false
  /* les blocs de l'ancien thème n'ont pas la même structure : on repart des
     blocs du nouveau thème, SANS toucher à la boutique en ligne (brouillon).
     Les couleurs, polices, textes et réglages du marchand sont conservés. */
  draft.sections = { home: SECTIONS.defaultSections(theme) }
  db.prepare("UPDATE stores SET draft = ? WHERE id = ?").run(JSON.stringify(draft), req.store.id)
  logRow("info", `thème essayé (${req.store.slug})`, { theme })
  res.redirect("/dashboard/design?trial=1")
})

/** Annuler l'essai : la boutique en ligne redevient exactement ce qu'elle était. */
app.post("/dashboard/design/theme/public", requireAuth, requireStore, (req, res) => {
  const row = PT.get(req.body.id)
  if (!row || row.status !== "public" || !isTheme(row.base)) {
    return res.redirect("/dashboard/design/themes")
  }
  const draft = readOwnDraft(req.store)
  draft.theme = row.base
  draft.sections = { home: SECTIONS.defaultSections(row.base) }
  draft.design = SECTIONS.sanitizeDesign({
    ...(draft.design || {}),
    bg: row.bg,
    accent: row.accent,
    ink: row.ink,
  }, req.store)
  draft.publicThemeId = row.id
  draft.publicThemeName = row.name
  draft.publicThemeTouched = false
  db.prepare("UPDATE stores SET draft = ? WHERE id = ?").run(JSON.stringify(draft), req.store.id)
  logRow("info", `thème public essayé (${req.store.slug})`, { theme: row.id, base: row.base })
  res.redirect("/dashboard/design?trial=1")
})

app.post("/dashboard/design/theme/cancel", requireAuth, requireStore, (req, res) => {
  db.prepare("UPDATE stores SET draft = NULL WHERE id = ?").run(req.store.id)
  logRow("info", `essai de thème annulé (${req.store.slug})`)
  res.redirect("/dashboard/design")
})

app.get("/dashboard/design/versions", requireAuth, requireStore, (req, res) => {
  const rows = db.prepare("SELECT id, kind, created_at FROM versions WHERE store_id = ? ORDER BY id DESC LIMIT 20")
    .all(req.store.id)
  res.json({ ok: true, versions: rows })
})

app.post("/dashboard/design/restore/:id", requireAuth, requireStore, (req, res) => {
  const v = db.prepare("SELECT * FROM versions WHERE id = ? AND store_id = ?").get(req.params.id, req.store.id)
  if (!v) return res.status(404).json({ ok: false })
  db.prepare("UPDATE stores SET draft = ? WHERE id = ?").run(v.payload, req.store.id)
  res.json({ ok: true, restored: true })
})

app.post("/dashboard/design/reset", requireAuth, requireStore, (req, res) => {
  db.prepare("UPDATE stores SET sections = NULL, design = NULL, logo = NULL, nav = NULL, draft = NULL WHERE id = ?")
    .run(req.store.id)
  res.json({ ok: true })
})


/* ---------------------------- PAGES LIBRES ---------------------------- */
const slugifyPage = (t) =>
  String(t || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60)

app.get("/dashboard/pages", requireAuth, requireStore, (req, res) => {
  const pages = db.prepare("SELECT * FROM pages WHERE store_id = ? ORDER BY id DESC").all(req.store.id)
  res.send(V.dashPages(req.user, req.store, pages))
})

app.get("/dashboard/pages/new", requireAuth, requireStore, (req, res) =>
  res.send(V.pageForm(req.user, req.store, null, null)))

app.post("/dashboard/pages", requireAuth, requireStore, (req, res) => {
  const title = String(req.body.title || "").trim()
  const slug = slugifyPage(req.body.slug || title)
  if (!title || !slug) return res.status(400).send(V.pageForm(req.user, req.store, null, "Titre et adresse sont obligatoires."))
  const clash = db.prepare("SELECT 1 FROM pages WHERE store_id = ? AND slug = ?").get(req.store.id, slug)
  if (clash) return res.status(400).send(V.pageForm(req.user, req.store, null, "Cette adresse est déjà utilisée par une autre page."))
  db.prepare("INSERT INTO pages (store_id, slug, title, body, published) VALUES (?, ?, ?, ?, ?)")
    .run(req.store.id, slug, title, req.body.body || "", req.body.published ? 1 : 0)
  res.redirect("/dashboard/pages")
})

app.get("/dashboard/pages/:id", requireAuth, requireStore, (req, res) => {
  const page = db.prepare("SELECT * FROM pages WHERE id = ? AND store_id = ?").get(req.params.id, req.store.id)
  if (!page) return res.redirect("/dashboard/pages")
  res.send(V.pageForm(req.user, req.store, page, null))
})

app.post("/dashboard/pages/:id", requireAuth, requireStore, (req, res) => {
  const page = db.prepare("SELECT * FROM pages WHERE id = ? AND store_id = ?").get(req.params.id, req.store.id)
  if (!page) return res.redirect("/dashboard/pages")
  const title = String(req.body.title || "").trim()
  const slug = slugifyPage(req.body.slug || title)
  if (!title || !slug) return res.status(400).send(V.pageForm(req.user, req.store, page, "Titre et adresse sont obligatoires."))
  const clash = db.prepare("SELECT 1 FROM pages WHERE store_id = ? AND slug = ? AND id != ?").get(req.store.id, slug, page.id)
  if (clash) return res.status(400).send(V.pageForm(req.user, req.store, page, "Cette adresse est déjà utilisée."))
  db.prepare("UPDATE pages SET title = ?, slug = ?, body = ?, published = ? WHERE id = ?")
    .run(title, slug, req.body.body || "", req.body.published ? 1 : 0, page.id)
  res.redirect("/dashboard/pages")
})

app.post("/dashboard/pages/:id/delete", requireAuth, requireStore, (req, res) => {
  db.prepare("DELETE FROM pages WHERE id = ? AND store_id = ?").run(req.params.id, req.store.id)
  res.redirect("/dashboard/pages")
})

/* ---------------------------- CODES PROMO ---------------------------- */
app.get("/dashboard/discounts", requireAuth, requireStore, (req, res) => {
  const list = db.prepare("SELECT * FROM discounts WHERE store_id = ? ORDER BY id DESC").all(req.store.id)
  const products = db.prepare("SELECT id, title FROM products WHERE store_id = ? ORDER BY title").all(req.store.id)
  res.send(V.dashDiscounts(req.user, req.store, list, products))
})

app.post("/dashboard/discounts", requireAuth, requireStore, (req, res) => {
  const code = String(req.body.code || "").trim().toUpperCase().replace(/[^A-Z0-9_-]/g, "").slice(0, 24)
  const kind = req.body.kind === "amount" ? "amount" : "percent"
  const value = Math.max(1, Math.min(kind === "percent" ? 100 : 1000000, parseInt(req.body.value, 10) || 0))
  const min = parseDzdCents(req.body.min) || 0
  const max = Math.max(0, parseInt(req.body.max, 10) || 0)
  if (!code) return res.redirect("/dashboard/discounts?error=" + encodeURIComponent("Le code promo est obligatoire. Lettres et chiffres seulement."))
  {
    const productId = parseInt(req.body.product_id, 10) || null
    db.prepare(`INSERT INTO discounts (store_id, code, kind, value, min_subtotal_cents, max_uses, product_id)
                VALUES (?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT(store_id, code) DO UPDATE SET kind=excluded.kind, value=excluded.value,
                  min_subtotal_cents=excluded.min_subtotal_cents, max_uses=excluded.max_uses,
                  product_id=excluded.product_id, active=1`)
      .run(req.store.id, code, kind, value, min, max, productId)
  }
  res.redirect("/dashboard/discounts")
})

app.post("/dashboard/discounts/:id/toggle", requireAuth, requireStore, (req, res) => {
  db.prepare("UPDATE discounts SET active = CASE active WHEN 1 THEN 0 ELSE 1 END WHERE id = ? AND store_id = ?")
    .run(req.params.id, req.store.id)
  res.redirect("/dashboard/discounts")
})

app.post("/dashboard/discounts/:id/delete", requireAuth, requireStore, (req, res) => {
  db.prepare("DELETE FROM discounts WHERE id = ? AND store_id = ?").run(req.params.id, req.store.id)
  res.redirect("/dashboard/discounts")
})

/* ---------------------------- COMMANDES : détail + CSV ---------------------------- */
app.get("/dashboard/orders/export.csv", requireAuth, requireStore, (req, res) => {
  const rows = db.prepare("SELECT * FROM orders WHERE store_id = ? ORDER BY id DESC").all(req.store.id)
  const head = ["reference", "date", "client", "telephone", "wilaya", "commune", "adresse", "position",
    "sous_total", "remise", "code_promo", "livraison", "total", "statut",
    "plateforme", "campagne", "contenu_annonce", "identifiant_clic", "page_arrivee", "appareil",
    "appels_sans_reponse", "commande_test"]
  const esc = csvCell
  const lines = [head.join(",")].concat(
    rows.map((o) => [o.ref, o.created_at, o.customer_name, o.phone, o.wilaya, o.commune,
      o.address, o.geo_lat != null ? `${o.geo_lat},${o.geo_lng}` : "",
      (o.subtotal_cents / 100).toFixed(2), (o.discount_cents / 100).toFixed(2), o.promo_code,
      (o.shipping_cents / 100).toFixed(2), (o.total_cents / 100).toFixed(2), o.status,
      ORD.sourceLabel(o.source), o.utm_campaign, o.utm_content, o.click_id, o.landing,
      ORD.DEVICE_LABEL[o.device] || "", o.attempts || 0, o.fake ? "oui" : "non"].map(esc).join(","))
  )
  res.setHeader("Content-Type", "text/csv; charset=utf-8")
  res.setHeader("Content-Disposition", `attachment; filename="commandes-${req.store.slug}.csv"`)
  res.send("\uFEFF" + lines.join("\n"))
})

app.get("/dashboard/orders/:id", requireAuth, requireStore, async (req, res, next) => {
  let order = db.prepare("SELECT * FROM orders WHERE id = ? AND store_id = ?").get(req.params.id, req.store.id)
  if (!order) return res.redirect("/dashboard/orders")
  const open = CARRIERS.shipmentOfOrder(order.id)
  if (open && open.tracking && !["livree", "annulee"].includes(open.mapped || "")) {
    try {
      await Promise.race([
        CARRIERS.syncOne(open),
        new Promise((resolve) => setTimeout(resolve, 2500)),
      ])
      order = db.prepare("SELECT * FROM orders WHERE id = ? AND store_id = ?").get(order.id, req.store.id) || order
    } catch (e) { /* le suivi peut attendre, la fiche s'ouvre quand même */ }
  }
  try {
  /* chaque ligne porte la photo principale du produit (vignette dans la fiche) */
  const items = db.prepare(`SELECT oi.*, (SELECT p.image FROM products p WHERE p.id = oi.product_id) AS image
                            FROM order_items oi WHERE oi.order_id = ?`).all(order.id)
  /* tous les transporteurs actifs de la boutique : 3 connectés = 3 choix, 1 seul = 1 choix */
  const carriers = CARRIERS.list(req.store.id).filter((c) => c.enabled)
  const picked = carriers.find((c) => String(c.id) === String(req.query.carrier || "")) || carriers[0] || null
  const carrier = picked
  const shipment = CARRIERS.shipmentOfOrder(order.id)
  if (shipment) {
    order.carrier_name = shipment.carrier_name || shipment.carrier_label || ""
    order.ship_state = shipment.state || ""
  }
  const centers = carrier ? CARRIERS.centersOf(carrier.id) : []
  /* fiche colis : ce qui part chez le transporteur, et ce qui manque encore */
  const sheet = carrier && !shipment ? CARRIERS.parcelSheet(req.store, order, carrier) : null
  const sendError = req.query.envoi === "incomplet"
    ? "Envoi bloqué : des champs obligatoires manquent (liste ci-dessous)."
    : req.query.envoi === "nonconfirmee"
      ? "Commande non confirmée : confirme-la d'abord, l'envoi est bloqué."
      : req.query.envoi === "erreur" ? "Le transporteur a refusé le colis. Vérifie les champs ci-dessous." : ""
  res.send(V.dashOrderDetail(req.user, req.store, order, items, {
    carrier: V.carrierBlock(order, carrier, centers, shipment, sheet, sendError, carriers),
    editing: req.query.edit || "",
    products: db.prepare("SELECT id, title, price_cents FROM products WHERE store_id = ? ORDER BY title").all(req.store.id),
    events: ORD.events(order.id),
    pixels: db.prepare("SELECT provider, event_name, status, code FROM pixel_events WHERE order_id = ? ORDER BY id DESC")
      .all(order.id),
  }))
  } catch (e) { next(e) }
})

app.get("/dashboard/settings", requireAuth, requireStore, (req, res) =>
  res.send(V.dashSettings(req.user, req.store, req.query.saved, null, { host: req.get("host") })))

app.post("/dashboard/settings", requireAuth, requireStore, (req, res) => {
  const { name, tagline, about, phone, wilaya, currency } = req.body
  /* le thème ne se change plus depuis les réglages : il passe par la galerie
     de thèmes puis par l'éditeur de design (brouillon), jamais en direct */
  const theme = req.store.theme
  let slug = slugify(req.body.slug || req.store.slug)

  if (RESERVED.has(slug)) {
    return res.status(400).send(V.dashSettings(req.user, req.store, null, "Cette adresse est réservée, choisissez-en une autre.", { host: req.get("host") }))
  }
  const clash = db.prepare("SELECT 1 FROM stores WHERE slug = ? AND id != ?").get(slug, req.store.id)
  if (clash) {
    return res.status(400).send(V.dashSettings(req.user, req.store, null, "Cette adresse est déjà prise par une autre boutique.", { host: req.get("host") }))
  }
  const domain = DOMAIN.clean(req.body.domain)
  if (String(req.body.domain || "").trim() && !domain) {
    return res.status(400).send(V.dashSettings(req.user, req.store, null,
      "Nom de domaine invalide. Exemple : boutique.dz", { host: req.get("host") }))
  }
  if (domain) {
    const taken = db.prepare("SELECT id FROM stores WHERE domain = ? AND id != ?").get(domain, req.store.id)
    if (taken) {
      return res.status(400).send(V.dashSettings(req.user, req.store, null,
        "Ce domaine est déjà utilisé par une autre boutique.", { host: req.get("host") }))
    }
  }

  const langMode = ["fr", "ar", "both"].includes(req.body.lang_mode) ? req.body.lang_mode : "both"
  db.prepare(`UPDATE stores SET name = ?, tagline = ?, about = ?, phone = ?,
              wilaya = ?, currency = ?, slug = ?, theme = ?, lang_mode = ?, legal_name = ?, legal_address = ?,
              legal_rc = ?, legal_nif = ?, return_days = ?, pixel_meta = ?, pixel_tiktok = ?,
              whatsapp = ? WHERE id = ?`)
    .run(String(name).trim(), tagline || "", about || "", phone || "", wilaya || "",
      currency || "DZD", slug, theme, langMode,
      String(req.body.legal_name || "").slice(0, 120), String(req.body.legal_address || "").slice(0, 200),
      String(req.body.legal_rc || "").slice(0, 40), String(req.body.legal_nif || "").slice(0, 40),
      Math.max(0, Math.min(60, parseInt(req.body.return_days, 10) || 7)),
      String(req.body.pixel_meta || "").replace(/[^0-9]/g, "").slice(0, 24),
      String(req.body.pixel_tiktok || "").replace(/[^A-Z0-9]/gi, "").slice(0, 32),
      String(req.body.whatsapp || "").replace(/[^0-9+ ]/g, "").slice(0, 20),
      req.store.id)



  db.prepare("UPDATE stores SET domain = ? WHERE id = ?").run(domain || null, req.store.id)

  res.redirect("/dashboard/settings?saved=1")
})

/* ---------------------------- ÉQUIPE ---------------------------- */
app.get("/dashboard/equipe", requireAuth, requireStore, (req, res) => {
  const owner = db.prepare("SELECT name, email FROM users WHERE id = ?").get(req.store.owner_id)
  const base = String(process.env.PUBLIC_URL || `${req.protocol}://${req.get("host")}`).replace(/\/$/, "")
  res.send(V.dashTeam(req.user, req.store, TEAM.list(req.store.id), owner, req.query.saved, req.query.error, req.query.link, base, req.query.login))
})

app.post("/dashboard/equipe", requireAuth, requireStore, (req, res) => {
  const out = TEAM.inviteLink(req.store, TEAM.fromBody(req.body), req.body.name)
  if (out.error) return res.redirect("/dashboard/equipe?error=" + encodeURIComponent(out.error))
  const base = String(process.env.PUBLIC_URL || `${req.protocol}://${req.get("host")}`).replace(/\/$/, "")
  const link = `${base}/rejoindre/${out.token}`
  res.redirect("/dashboard/equipe?saved=1&link=" + encodeURIComponent(link))
})

app.post("/dashboard/equipe/:id", requireAuth, requireStore, (req, res) => {
  const id = parseInt(req.params.id, 10)
  if (req.body.remove === "1") TEAM.remove(req.store.id, id)
  else TEAM.updatePerms(req.store.id, id, TEAM.fromBody(req.body))
  res.redirect("/dashboard/equipe?saved=1")
})

app.post("/dashboard/utiliser-boutique", requireAuth, requireStore, (req, res) => {
  const id = parseInt(req.body.store_id, 10)
  const ok = (req.user.stores || []).some((s) => s.id === id)
  if (ok && req.session) {
    req.session.storeId = id
    saveSession(req.session.sid, req.session)
  }
  res.redirect("/dashboard")
})

/* ---------------------------- E-MAILS ---------------------------- */
app.get("/dashboard/mails", requireAuth, requireStore, (req, res) => {
  const fresh = db.prepare("SELECT * FROM stores WHERE id = ?").get(req.store.id)
  res.send(V.dashMails(req.user, fresh, MAIL.recent(fresh.id), MAIL.flagsOf(fresh), req.query.saved, req.query.error))
})

app.post("/dashboard/mails", requireAuth, requireStore, (req, res) => {
  MAIL.saveSmtp(req.store.id, req.body)
  res.redirect("/dashboard/mails?saved=1")
})

app.post("/dashboard/mails/test", requireAuth, requireStore, async (req, res) => {
  const fresh = db.prepare("SELECT * FROM stores WHERE id = ?").get(req.store.id)
  const out = await MAIL.test(fresh)
  if (out.ok) return res.redirect("/dashboard/mails?saved=1")
  res.redirect("/dashboard/mails?error=" + encodeURIComponent(out.error || "Envoi impossible."))
})

/* ---------------------------- RÉSEAUX SOCIAUX ---------------------------- */
app.get("/dashboard/reseaux", requireAuth, requireStore, (req, res) =>
  res.send(V.dashSocial(req.user, req.store, req.query.saved, req.query.error)))

app.post("/dashboard/reseaux", requireAuth, requireStore, (req, res) => {
  const b = req.body || {}
  const rows = SOCIAL.NETWORKS.map((n) => ({ network: n.id, url: b["url_" + n.id], label: b["label_" + n.id] }))
  SOCIAL.save(req.store.id, rows)
  res.redirect("/dashboard/reseaux?saved=1")
})

/* ---------------------------- MOYENS DE PAIEMENT ---------------------------- */
app.get("/dashboard/paiement", requireAuth, requireStore, (req, res) =>
  res.send(V.dashPayments(req.user, req.store, req.query.saved, req.query.error)))

app.post("/dashboard/paiement", requireAuth, requireStore, (req, res) => {
  const b = req.body || {}
  /* le marchand saisit des dinars, la base stocke des centimes */
  const fee = Math.max(0, Math.min(500000, Math.round((parseFloat(String(b.pay_cod_fee).replace(",", ".")) || 0) * 100)))
  db.prepare(`UPDATE stores SET
      pay_cod = ?, pay_cod_fee = ?, pay_cod_label = ?,
      pay_cib = ?, pay_cib_note = ?,
      pay_bank = ?, pay_bank_note = ?,
      pay_online = ?, pay_online_url = ?, pay_online_note = ?,
      pay_note = ?
    WHERE id = ?`).run(
    b.pay_cod ? 1 : 0, fee, String(b.pay_cod_label || "").slice(0, 80),
    b.pay_cib ? 1 : 0, String(b.pay_cib_note || "").slice(0, 400),
    b.pay_bank ? 1 : 0, String(b.pay_bank_note || "").slice(0, 400),
    b.pay_online ? 1 : 0, String(b.pay_online_url || "").slice(0, 300), String(b.pay_online_note || "").slice(0, 300),
    String(b.pay_note || "").slice(0, 400),
    req.store.id)
  const store = db.prepare("SELECT * FROM stores WHERE id = ?").get(req.store.id)
  if (!PAY.list(store).length) {
    return res.redirect("/dashboard/paiement?error=" + encodeURIComponent(
      "Activez au moins un moyen de paiement, sinon vos clients ne peuvent pas commander."))
  }
  res.redirect("/dashboard/paiement?saved=1")
})

/* ------------------------------- admin plateforme ------------------------------- */
const adminGo = (res, path, out) => {
  if (out && out.log) logRow(out.log.level || "info", out.log.message, out.log.meta)
  if (!out || (!out.error && !out.ok)) return res.redirect(path)
  const key = out.error ? "error" : "ok"
  const join = path.includes("?") ? "&" : "?"
  res.redirect(`${path}${join}${key}=${encodeURIComponent(out.error || out.ok)}`)
}

app.get("/admin", requireAuth, requireAdmin, (req, res) => {
  res.send(ADM.home(req.user, PLAT.overview(), ADM.flashOf(req.query), PLAT.badges()))
})

const themeSay = (out) => (out && out.error ? { error: out.error } : { ok: (out && out.okText) || "Enregistré." })

app.get("/admin/themes", requireAuth, requireAdmin, (req, res) => {
  res.send(ADM.themesPage(req.user, PT.list(), THEMES, ADM.flashOf(req.query), PLAT.badges(), PT.platformList(THEMES)))
})

app.get("/admin/themes/apercu/:id", requireAuth, requireAdmin, (req, res) => {
  const id = String(req.params.id || "")
  if (!isTheme(id)) return res.status(404).send("Thème inconnu")
  const base = db.prepare("SELECT * FROM stores WHERE status = 'active' ORDER BY id LIMIT 1").get()
  if (!base) return res.status(404).send("Aucune boutique pour l'aperçu.")
  const store = PT.dressStore({ ...base, theme: id, theme_src: null, _originTheme: id })
  const products = SHOP.searchProducts(store.id, {})
  let html = V.storefront(store, products, 0, true, {
    count: products.length,
    categories: SHOP.categories(store.id).filter((c) => c.n > 0),
  })
  html = html.replace("</head>", `<style>.cookies,.wa-float,.lang-pill{display:none!important}</style></head>`)
  res.send(html)
})

app.get("/admin/themes/plateforme/:id", requireAuth, requireAdmin, (req, res) => {
  const theme = THEMES.find((t) => t.id === req.params.id)
  if (!theme) return res.redirect("/admin/themes?error=" + encodeURIComponent("Ce thème n'existe pas."))
  const row = PT.builtinForm(theme.id, theme)
  res.send(ADM.builtinEditPage(req.user, row, THEMES, ADM.flashOf(req.query), PLAT.badges(), PT.builtinUsage(theme.id)))
})

app.post("/admin/themes/plateforme/:id", requireAuth, requireAdmin, (req, res) => {
  const theme = THEMES.find((t) => t.id === req.params.id)
  if (!theme) return res.redirect("/admin/themes?error=" + encodeURIComponent("Ce thème n'existe pas."))
  adminGo(res, `/admin/themes/plateforme/${theme.id}`, themeSay(PT.saveBuiltin(theme.id, req.body, theme)))
})

app.post("/admin/themes", requireAuth, requireAdmin, (req, res) => {
  const out = PT.create(req.body)
  adminGo(res, out.id ? `/admin/themes/${out.id}` : "/admin/themes", themeSay(out))
})

app.get("/admin/themes/:id", requireAuth, requireAdmin, (req, res) => {
  const row = PT.get(req.params.id)
  if (!row) return res.redirect("/admin/themes?error=" + encodeURIComponent("Ce thème n'existe plus."))
  res.send(ADM.themeEditPage(req.user, row, THEMES, ADM.flashOf(req.query), PLAT.badges(), PT.usage(row.id)))
})

app.post("/admin/themes/:id", requireAuth, requireAdmin, (req, res) => {
  const prev = PT.get(req.params.id)
  const out = PT.update(req.params.id, req.body)
  if (!out.error && prev) {
    const next = PT.get(req.params.id)
    const n = PT.syncFollowers(prev, next)
    if (next && next.status === "public") {
      out.okText = n.kept
        ? `Thème enregistré. ${n.updated === 1 ? "1 boutique a encore ce thème." : n.updated + " boutiques ont encore ce thème."} ${n.kept === 1 ? "1 l'a modifié : elle ne change pas." : n.kept + " l'ont modifié : elles ne changent pas."}`
        : n.updated
          ? `Thème enregistré. ${n.updated === 1 ? "1 boutique a encore ce thème, elle reçoit le changement." : n.updated + " boutiques ont encore ce thème, elles reçoivent le changement."}`
          : "Thème enregistré. Aucune boutique ne l'avait encore pris."
    }
  }
  adminGo(res, `/admin/themes/${req.params.id}`, themeSay(out))
})

app.post("/admin/themes/:id/public", requireAuth, requireAdmin, (req, res) => {
  adminGo(res, "/admin/themes", themeSay(PT.setStatus(req.params.id, "public")))
})

app.post("/admin/themes/:id/hide", requireAuth, requireAdmin, (req, res) => {
  adminGo(res, "/admin/themes", themeSay(PT.setStatus(req.params.id, "brouillon")))
})

app.post("/admin/themes/:id/delete", requireAuth, requireAdmin, (req, res) => {
  adminGo(res, "/admin/themes", themeSay(PT.remove(req.params.id)))
})

app.get("/admin/boutiques", requireAuth, requireAdmin, (req, res) => {
  const data = PLAT.stores({ q: req.query.q, status: req.query.status, plan: req.query.plan })
  res.send(ADM.storesPage(req.user, data, ADM.flashOf(req.query), PLAT.badges()))
})

app.get("/admin/boutiques/:id", requireAuth, requireAdmin, (req, res) => {
  const row = PLAT.store(req.params.id)
  if (!row) return adminGo(res, "/admin/boutiques", { error: "Cette boutique n'existe pas." })
  res.send(ADM.storePage(req.user, row, ADM.flashOf(req.query), PLAT.badges()))
})

app.post("/admin/boutiques/:id/plan", requireAuth, requireAdmin, (req, res) => {
  const out = PLAT.setPlan(req.params.id, String(req.body.plan || ""))
  adminGo(res, `/admin/boutiques/${req.params.id}`, out)
})

app.post("/admin/boutiques/:id/statut", requireAuth, requireAdmin, (req, res) => {
  const out = PLAT.toggleStatus(req.params.id)
  adminGo(res, out.error ? "/admin/boutiques" : `/admin/boutiques/${req.params.id}`, out)
})

app.post("/admin/boutiques/:id/ouvrir", requireAuth, requireAdmin, (req, res) => {
  const row = PLAT.store(req.params.id)
  if (!row) return adminGo(res, "/admin/boutiques", { error: "Cette boutique n'existe pas." })
  const { session } = auth(req)
  session.supportStoreId = row.id
  saveSession(session.sid, session)
  logRow("info", "admin ouvre une boutique", { storeId: row.id, adminId: req.user.id })
  res.redirect("/dashboard")
})

app.post("/admin/quitter", requireAuth, requireAdmin, (req, res) => {
  const { session } = auth(req)
  const id = session.supportStoreId
  session.supportStoreId = null
  saveSession(session.sid, session)
  res.redirect(id ? `/admin/boutiques/${id}` : "/admin")
})

app.post("/admin/stores/:id/toggle", requireAuth, requireAdmin, (req, res) => {
  const out = PLAT.toggleStatus(req.params.id)
  adminGo(res, out.error ? "/admin/boutiques" : `/admin/boutiques/${req.params.id}`, out)
})

app.get("/admin/comptes", requireAuth, requireAdmin, (req, res) => {
  const data = PLAT.accounts({ q: req.query.q, role: req.query.role })
  res.send(ADM.accountsPage(req.user, data, ADM.flashOf(req.query), PLAT.badges()))
})

app.get("/admin/comptes/:id", requireAuth, requireAdmin, (req, res) => {
  const row = PLAT.account(req.params.id)
  if (!row) return adminGo(res, "/admin/comptes", { error: "Ce compte n'existe pas." })
  res.send(ADM.accountPage(req.user, row, ADM.flashOf(req.query), PLAT.badges()))
})

app.post("/admin/comptes/:id/blocage", requireAuth, requireAdmin, (req, res) => {
  const out = PLAT.setBlocked(req.params.id, req.body.blocked === "1", req.user.id)
  adminGo(res, out.error && !PLAT.account(req.params.id) ? "/admin/comptes" : `/admin/comptes/${req.params.id}`, out)
})


/* ---------------------------- CATÉGORIES ---------------------------- */
app.get("/dashboard/categories", requireAuth, requireStore, (req, res) => {
  const cats = SHOP.categories(req.store.id)
  res.send(V.dashCategories(req.user, req.store, cats))
})

app.post("/dashboard/categories", requireAuth, requireStore, (req, res) => {
  const name = String(req.body.name || "").trim().slice(0, 40)
  if (!name) return res.redirect("/dashboard/categories?error=" + encodeURIComponent("Le nom de la catégorie est obligatoire."))
  const slug = SHOP.slugify(name)
  const max = db.prepare("SELECT COALESCE(MAX(position), 0) p FROM categories WHERE store_id = ?").get(req.store.id).p
  try {
    db.prepare("INSERT INTO categories (store_id, name, slug, position) VALUES (?, ?, ?, ?)")
      .run(req.store.id, name, slug, max + 1)
  } catch (e) {
    return res.redirect("/dashboard/categories?error=" + encodeURIComponent(messageOf(e).includes("existe déjà")
      ? "Cette catégorie existe déjà. Change le nom."
      : messageOf(e)))
  }
  res.redirect("/dashboard/categories")
})

app.post("/dashboard/categories/:id/delete", requireAuth, requireStore, (req, res) => {
  db.prepare("UPDATE products SET category_id = NULL WHERE category_id = ? AND store_id = ?")
    .run(req.params.id, req.store.id)
  db.prepare("DELETE FROM categories WHERE id = ? AND store_id = ?").run(req.params.id, req.store.id)
  res.redirect("/dashboard/categories")
})

/* ---------------------------- LIVRAISON ---------------------------- */
app.get("/dashboard/shipping", requireAuth, requireStore, (req, res) => {
  SHOP.ensureShipping(req.store.id)
  const map = SHOP.shippingTable(req.store.id)
  const rates = SHOP.WILAYAS.map((w) => ({
    wilaya: w,
    home: map[w] ? map[w].home : 50000,
    desk: map[w] ? map[w].desk : 40000,
    etaMin: map[w] && map[w].etaMin != null ? map[w].etaMin : req.store.eta_min || 2,
    etaMax: map[w] && map[w].etaMax != null ? map[w].etaMax : req.store.eta_max || 4,
  }))
  res.send(V.dashShipping(req.user, req.store, rates, req.query.ok === "1", req.query.err || ""))
})

const moneyToCents = (raw) => {
  const n = parseFloat(String(raw == null ? "" : raw).replace(/[\s\u00A0]/g, "").replace(",", "."))
  return Number.isFinite(n) ? Math.max(0, Math.round(n * 100)) : null
}

app.post("/dashboard/shipping", requireAuth, requireStore, (req, res) => {
  const b = req.body || {}

  /* ---------- 1. validation AVANT toute écriture ---------- */
  const bad = []
  const money = (raw, field) => {
    const v = moneyToCents(raw)
    if (v == null && String(raw || "").trim() !== "") bad.push(field)
    return v
  }
  const days = (raw, fallback) => {
    const n = parseInt(String(raw == null ? "" : raw).trim(), 10)
    if (!Number.isFinite(n)) return fallback
    return Math.max(0, Math.min(60, n))
  }
  const allHome = money(b.all, "tarif domicile")
  const allDesk = money(b.all_desk, "tarif bureau")
  const allMin = days(b.eta_min, req.store.eta_min || 2)
  const allMax = Math.max(allMin, days(b.eta_max, req.store.eta_max || 4))
  const negative = ["all", "all_desk"]
    .concat(SHOP.WILAYAS.map((w) => "w_" + w), SHOP.WILAYAS.map((w) => "d_" + w))
    .some((k) => String(b[k] || "").trim().startsWith("-"))
  if (bad.length || negative) {
    return res.redirect("/dashboard/shipping?ok=0&err=" + encodeURIComponent(
      negative ? "Un tarif ne peut pas être négatif. Rien n'a été enregistré." : "Tarifs invalides : " + bad.join(", ")))
  }

  /* ---------- 2. modes proposés + délai par défaut ---------- */
  db.prepare("UPDATE stores SET ship_home = ?, ship_desk = ?, eta_min = ?, eta_max = ? WHERE id = ?")
    .run(b.ship_home ? 1 : 0, b.ship_desk ? 1 : 0, allMin, allMax, req.store.id)

  /* ---------- 3. tarifs ---------- */
  const up = db.prepare(`INSERT INTO shipping_rates (store_id, wilaya, cents, desk_cents, eta_min, eta_max) VALUES (?, ?, ?, ?, ?, ?)
                         ON CONFLICT(store_id, wilaya) DO UPDATE SET cents = excluded.cents, desk_cents = excluded.desk_cents,
                           eta_min = excluded.eta_min, eta_max = excluded.eta_max`)

  const applyAll = Boolean(b.applyAll)
  for (const w of SHOP.WILAYAS) {
    const rawHome = applyAll ? null : moneyToCents(b["w_" + w])
    const rawDesk = applyAll ? null : moneyToCents(b["d_" + w])
    const home = rawHome != null ? rawHome : allHome
    const desk = rawDesk != null ? rawDesk : allDesk
    const hasEta = b["e_min_" + w] != null || b["e_max_" + w] != null
    if (home == null && desk == null && !hasEta) continue
    const row = db.prepare("SELECT cents, desk_cents, eta_min, eta_max FROM shipping_rates WHERE store_id = ? AND wilaya = ?").get(req.store.id, w)
    const h = home != null ? home : (row ? row.cents : 50000)
    const d = desk != null ? desk : (row ? row.desk_cents : Math.max(0, h - 10000))
    const mn = days(b["e_min_" + w], row && row.eta_min != null ? row.eta_min : allMin)
    const mx = Math.max(mn, days(b["e_max_" + w], row && row.eta_max != null ? row.eta_max : allMax))
    up.run(req.store.id, w, h, d, mn, mx)
  }
  res.redirect("/dashboard/shipping?ok=1")
})

/* ---------------------------- STOCK / INVENTAIRE ---------------------------- */
const stockData = (store) => ({
  rows: INV.levels(store.id),
  alerts: INV.lowStock(store.id, INV.threshold(store)),
  movements: INV.movements(store.id, 60),
  val: INV.valuation(store.id),
  threshold: INV.threshold(store),
  reasonLabel: INV.REASONS,
})

app.get("/dashboard/stock", requireAuth, requireStore, (req, res) => {
  res.send(V.dashStock(req.user, req.store, { ...stockData(req.store), saved: req.query.ok === "1" }))
})

app.post("/dashboard/stock/adjust", requireAuth, requireStore, (req, res) => {
  const productId = parseInt(req.body.product_id, 10)
  const variantId = parseInt(req.body.variant_id, 10) || 0
  const raw = parseInt(req.body.value, 10)
  const p = db.prepare("SELECT id FROM products WHERE id = ? AND store_id = ?").get(productId, req.store.id)
  if (!p || Number.isNaN(raw)) return res.redirect("/dashboard/stock?error=" + encodeURIComponent("Produit ou quantité invalide. Choisis un produit et un nombre."))
  if (variantId) {
    const v = db.prepare("SELECT id FROM variants WHERE id = ? AND product_id = ?").get(variantId, productId)
    if (!v) return res.redirect("/dashboard/stock?error=" + encodeURIComponent("Cette variante n'existe plus. Recharge la page."))
  }
  const reason = ["reassort", "inventaire", "retour"].includes(req.body.reason) ? req.body.reason : "inventaire"
  /* Boutons du tableau : −, +, Définir (quantité toujours positive) */
  const act = String(req.body.act || "")
  const qty = Math.abs(raw)
  if (act === "set") INV.setLevel(req.store.id, productId, variantId, qty, reason)
  else if (act === "minus") INV.adjust(req.store.id, productId, variantId, -qty, reason)
  else if (act === "plus") INV.adjust(req.store.id, productId, variantId, qty, reason)
  else if (req.body.mode === "set") INV.setLevel(req.store.id, productId, variantId, Math.max(0, raw), reason)
  else INV.adjust(req.store.id, productId, variantId, raw, reason)
  res.redirect("/dashboard/stock?ok=1")
})

app.post("/dashboard/stock/settings", requireAuth, requireStore, (req, res) => {
  const th = Math.max(0, Math.min(999, parseInt(req.body.low_stock_threshold, 10) || 0))
  db.prepare("UPDATE stores SET low_stock_threshold = ? WHERE id = ?").run(th, req.store.id)
  res.redirect("/dashboard/stock?ok=1")
})

app.get("/dashboard/stock/export.csv", requireAuth, requireStore, (req, res) => {
  const rows = INV.levels(req.store.id)
  const lines = [["produit", "sku", "variante", "stock", "prix_unitaire_dzd", "valeur_dzd"]]
  for (const p of rows) {
    for (const r of p.rows) {
      const price = r.variantId
        ? (db.prepare("SELECT price_cents FROM variants WHERE id = ?").get(r.variantId).price_cents || p.price_cents)
        : p.price_cents
      lines.push([p.title, p.sku || "", r.label || "", r.stock, (price / 100).toFixed(2), ((price * r.stock) / 100).toFixed(2)])
    }
  }
  const csv = lines.map((l) => l.map(csvCell).join(",")).join("\r\n")
  res.setHeader("Content-Type", "text/csv; charset=utf-8")
  res.setHeader("Content-Disposition", `attachment; filename="stock-${req.store.slug}.csv"`)
  res.send("\uFEFF" + csv)
})

/* ---------------------------- AVIS ---------------------------- */
app.get("/dashboard/reviews", requireAuth, requireStore, (req, res) => {
  const rows = db.prepare(`SELECT r.*, p.title FROM reviews r LEFT JOIN products p ON p.id = r.product_id
                           WHERE r.store_id = ? ORDER BY r.approved ASC, r.id DESC`).all(req.store.id)
  res.send(V.dashReviews(req.user, req.store, rows))
})
app.post("/dashboard/reviews/:id/approve", requireAuth, requireStore, (req, res) => {
  db.prepare("UPDATE reviews SET approved = 1 - approved WHERE id = ? AND store_id = ?").run(req.params.id, req.store.id)
  res.redirect("/dashboard/reviews")
})
app.post("/dashboard/reviews/:id/delete", requireAuth, requireStore, (req, res) => {
  db.prepare("DELETE FROM reviews WHERE id = ? AND store_id = ?").run(req.params.id, req.store.id)
  res.redirect("/dashboard/reviews")
})

/* ---------------------------- CLIENTS ---------------------------- */
app.get("/dashboard/customers", requireAuth, requireStore, (req, res) => {
  const rows = db.prepare(`SELECT c.*,
      (SELECT COUNT(*) FROM orders o WHERE o.customer_id = c.id) AS n,
      (SELECT COALESCE(SUM(o.total_cents), 0) FROM orders o WHERE o.customer_id = c.id AND o.status != 'annulee') AS spent
    FROM customers c WHERE c.store_id = ? ORDER BY c.id DESC`).all(req.store.id)
  res.send(V.dashCustomers(req.user, req.store, rows))
})

/* ---------------------------- REMBOURSEMENT + FACTURE ---------------------------- */
app.post("/dashboard/orders/:id/refund", requireAuth, requireStore, (req, res) => {
  const order = db.prepare("SELECT * FROM orders WHERE id = ? AND store_id = ?").get(req.params.id, req.store.id)
  if (order) {
    SHOP.refundOrder(order)
    INV.releaseOrder(order, "remboursement")
    logRow("info", `remboursement ${order.ref}`, { montant: order.total_cents })
  }
  res.redirect(`/dashboard/orders/${req.params.id}`)
})

app.get("/dashboard/orders/:id/invoice", requireAuth, requireStore, (req, res) => {
  const order = db.prepare("SELECT * FROM orders WHERE id = ? AND store_id = ?").get(req.params.id, req.store.id)
  if (!order) return res.redirect("/dashboard/orders")
  const items = db.prepare("SELECT * FROM order_items WHERE order_id = ?").all(order.id)
  res.send(V.invoice(req.store, order, items, { mode: "merchant", doc: req.query.type === "bl" ? "bl" : "facture" }))
})

app.get("/:slug/order/:ref/invoice", rateLimit("track", 60, 10 * 60e3), (req, res, next) => {
  const store = getStore(req.params.slug)
  if (!store) return next()
  const order = db.prepare("SELECT * FROM orders WHERE store_id = ? AND ref = ?").get(store.id, req.params.ref)
  if (!order) return next()
  const items = db.prepare("SELECT * FROM order_items WHERE order_id = ?").all(order.id)
  res.send(V.invoice(store, order, items, { mode: "customer", doc: req.query.type === "bl" ? "bl" : "facture" }))
})

/* ---------------------------- PAGES DE VENTE (LANDING) ---------------------------- */
app.get("/dashboard/landings", requireAuth, requireStore, (req, res) => {
  res.send(V.dashLandings(req.user, req.store, LAND.list(req.store.id), req.store.slug))
})

const landingProducts = (storeId) =>
  db.prepare("SELECT id, title, price_cents, image FROM products WHERE store_id = ? ORDER BY title COLLATE NOCASE").all(storeId)

app.get("/dashboard/landings/new", requireAuth, requireStore, (req, res) => {
  const products = landingProducts(req.store.id)
  if (!products.length) return res.redirect("/dashboard/products/new")
  res.send(V.landingForm(req.user, req.store, null, products, null))
})

app.post("/dashboard/landings", requireAuth, requireStore, (req, res) => {
  const id = LAND.save(req.store.id, req.body, null)
  if (!id) return res.send(V.landingForm(req.user, req.store, null, landingProducts(req.store.id), "Produit introuvable."))
  res.redirect("/dashboard/landings")
})

app.get("/dashboard/landings/:id", requireAuth, requireStore, (req, res) => {
  const l = LAND.get(req.params.id, req.store.id)
  if (!l) return res.redirect("/dashboard/landings")
  res.send(V.landingForm(req.user, req.store, l, landingProducts(req.store.id), null))
})

app.post("/dashboard/landings/:id", requireAuth, requireStore, (req, res) => {
  const l = LAND.get(req.params.id, req.store.id)
  if (!l) return res.redirect("/dashboard/landings")
  LAND.save(req.store.id, req.body, l.id)
  res.redirect("/dashboard/landings")
})

app.post("/dashboard/landings/:id/delete", requireAuth, requireStore, (req, res) => {
  LAND.remove(req.params.id, req.store.id)
  res.redirect("/dashboard/landings")
})

/* ---------------------------- ANTI-FRAUDE & PIXELS ---------------------------- */
app.get("/dashboard/marketing", requireAuth, requireStore, (req, res) => {
  const suspects = db.prepare(`SELECT * FROM orders WHERE store_id = ? AND risk_score >= 30
                               ORDER BY risk_score DESC, id DESC LIMIT 20`).all(req.store.id)
  res.send(V.dashMarketing(req.user, req.store, {
    suspects,
    blocked: SEC.blockedList(req.store.id),
    events: PX.recent(req.store.id, 40),
    stats: PX.stats(req.store.id),
    providers: PX.providers(req.store),
  }))
})

app.post("/dashboard/marketing/security", requireAuth, requireStore, (req, res) => {
  db.prepare(`UPDATE stores SET captcha_enabled = ?, captcha_version = ?, captcha_site = ?,
              captcha_secret = ?, captcha_min_score = ?, phone_strict = ? WHERE id = ?`)
    .run(req.body.captcha_enabled ? 1 : 0,
      ["v2", "v2i", "v3"].includes(req.body.captcha_version) ? req.body.captcha_version : "v3",
      String(req.body.captcha_site || "").trim().slice(0, 100),
      String(req.body.captcha_secret || "").trim().slice(0, 100),
      Math.max(0, Math.min(1, parseFloat(req.body.captcha_min_score) || 0.5)),
      req.body.phone_strict ? 1 : 0, req.store.id)
  res.redirect("/dashboard/marketing")
})

app.post("/dashboard/marketing/pixels", requireAuth, requireStore, (req, res) => {
  db.prepare(`UPDATE stores SET pixels_server = ?, pixel_test_code = ?, pixel_meta = ?, meta_token = ?,
              pixel_tiktok = ?, tiktok_token = ?, snap_pixel = ?, snap_token = ? WHERE id = ?`)
    .run(req.body.pixels_server ? 1 : 0,
      String(req.body.pixel_test_code || "").trim().slice(0, 40),
      String(req.body.pixel_meta || "").replace(/[^0-9]/g, "").slice(0, 24),
      String(req.body.meta_token || "").trim().slice(0, 400),
      String(req.body.pixel_tiktok || "").replace(/[^A-Z0-9]/gi, "").slice(0, 32),
      String(req.body.tiktok_token || "").trim().slice(0, 400),
      String(req.body.snap_pixel || "").trim().slice(0, 60),
      String(req.body.snap_token || "").trim().slice(0, 400),
      req.store.id)
  res.redirect("/dashboard/marketing")
})

app.post("/dashboard/marketing/block", requireAuth, requireStore, (req, res) => {
  if (req.body.phone) SEC.blockPhone(req.store.id, req.body.phone, "ajout manuel")
  res.redirect("/dashboard/marketing")
})

app.post("/dashboard/marketing/unblock", requireAuth, requireStore, (req, res) => {
  SEC.unblockPhone(req.store.id, req.body.phone)
  res.redirect("/dashboard/marketing")
})

/* ---------------------------- LANDING PUBLIQUE ---------------------------- */
app.get("/:slug/l/:lslug", (req, res, next) => {
  if (RESERVED.has(req.params.slug)) return next()
  const store = getStore(req.params.slug)
  if (!store) return next()
  const landing = LAND.bySlug(store.id, req.params.lslug)
  if (!landing) return next()
  const product = db.prepare("SELECT * FROM products WHERE id = ? AND store_id = ?").get(landing.product_id, store.id)
  if (!product) return next()
  if (!req.query.preview) LAND.countVisit(landing.id)
  PX.trackAsync(store, "ViewContent", {
    eventId: PX.eventId("vc", `${store.id}-l${landing.id}-${Date.now()}`),
    valueCents: LAND.offersOf(landing, product)[0].price,
    productIds: [product.id],
  }, { ip: SEC.ipOf(req), ua: req.headers["user-agent"] || "", url: req.originalUrl })
  res.send(LAND.page(store, landing, product, { reviews: SHOP.reviews(product.id) }))
})

app.post("/:slug/l/:lslug", async (req, res, next) => {
  const store = getStore(req.params.slug)
  if (!store) return next()
  const landing = LAND.bySlug(store.id, req.params.lslug)
  if (!landing) return next()
  const product = db.prepare("SELECT * FROM products WHERE id = ? AND store_id = ?").get(landing.product_id, store.id)
  if (!product) return next()

  const ip = SEC.ipOf(req)
  const ua = String(req.headers["user-agent"] || "")
  const render = (error) => res.send(LAND.page(store, landing, product, { reviews: SHOP.reviews(product.id), error }))

  const cap = await SEC.verifyCaptcha(store, req.body.captcha_token, ip)
  if (!cap.ok) return res.status(400).send(LAND.page(store, landing, product, {
    reviews: SHOP.reviews(product.id), error: "Vérification anti-robot échouée. Réessayez.",
  }))
  if (!req.body.customer_name || !req.body.phone || !req.body.address) return render("Merci de remplir tous les champs.")
  if (store.phone_strict && !SEC.phoneOk(req.body.phone)) return render("Numéro invalide. Format : 0555 12 34 56.")
  if (SEC.isBlocked(store.id, SEC.normalizePhone(req.body.phone))) return render("Commande impossible. Contactez la boutique.")

  const geo = req.body.geo_lat ? { lat: Number(req.body.geo_lat), lng: Number(req.body.geo_lng), acc: Number(req.body.geo_acc) || 0 } : null
  const risk = SEC.risk(store, { phone: req.body.phone, address: req.body.address, ip, geo, captchaScore: cap.score, captchaReason: cap.reason })

  const out = LAND.createOrder(store, landing, product, {
    ...req.body, ip, ua, geo, risk_score: risk.score, risk_flags: risk.flags.join(","),
    captcha_ok: cap.ok, status: SEC.statusFor(risk.score),
  })
  if (out.error) return render(out.error)

  const landingMail = MAIL.pickEmail(req.body)
  if (landingMail) {
    db.prepare("UPDATE orders SET customer_email = ? WHERE id = ?").run(landingMail, out.order.id)
    out.order.customer_email = landingMail
  }
  try { MAIL.orderPlaced(store, out.order) } catch (_) {}
  logRow("info", `commande landing ${out.order.ref}`, { store: store.slug, page: landing.slug, risque: risk.score })
  PX.trackAsync(store, "Purchase", {
    eventId: PX.eventId("purchase", out.order.id), valueCents: out.order.total_cents,
    productIds: [product.id], orderId: out.order.id,
  }, { ip, ua, phone: req.body.phone, url: `/${store.slug}/l/${landing.slug}` })
  res.redirect(`/${store.slug}/order/${out.order.ref}`)
})

/* ---------------------------- INFORMATIONS LÉGALES ---------------------------- */
app.get("/:slug/legal", (req, res, next) => {
  const store = withDraft(getStore(req.params.slug), req)
  if (!store) return next()
  const { session } = auth(req)
  const cart = cartFor(session, store.slug)
  const count = [...cart.values()].reduce((a, b) => a + b, 0)
  res.send(V.legalPage(store, count, { preview: !!req.query.preview }))
})

/* ------------------------------- VITRINE (dernier, catch-all slug) ------------------------------- */
const storefrontHandler = (req, res, next) => {
  if (RESERVED.has(req.params.slug)) return next()
  const base = getStore(req.params.slug)
  if (!base) return next()
  const store = withDraft(base, req)

  const q = String(req.query.q || "").slice(0, 60)
  const cat = String(req.query.cat || "").slice(0, 60)
  const sort = String(req.query.sort || "")
  const products = SHOP.searchProducts(store.id, { q, cat, sort })
  const { session } = auth(req)
  const cart = cartFor(session, store.slug)
  const count = [...cart.values()].reduce((a, b) => a + b, 0)

  if (!req.query.preview) {
    db.prepare(`INSERT INTO visits (store_id, day, path, hits) VALUES (?, date('now'), ?, 1)`).run(store.id, "/")
  }
  const siteId = SECTIONS.readDesign(store).siteTemplate
  if (siteId && !q && !cat) {
    const page = SITES.render(store, products, siteId, {
      cartCount: count,
      contactSent: req.query.envoye === "1",
      contactError: req.query.envoye === "0",
    })
    if (page) return res.send(page)
  }
  let html = V.storefront(store, products, count, req.query.preview === "1", {
    q, cat, sort, count: products.length, categories: SHOP.categories(store.id).filter((c) => c.n > 0),
    origin: req.protocol + "://" + req.get("host"),
    sent: req.query.envoye === "1",
  })

  res.send(html)
}

app.get("/voir/:id", (req, res) => {
  const id = String(req.params.id || "")
  if (!isTheme(id)) return res.status(404).send("Thème inconnu")
  const base = db.prepare("SELECT * FROM stores WHERE status = 'active' ORDER BY id LIMIT 1").get()
  if (!base) return res.status(404).send("Aucune boutique pour l'aperçu.")
  const store = PT.dressStore({ ...base, theme: id, theme_src: null, _originTheme: id })
  const products = SHOP.searchProducts(store.id, {})
  let html = V.storefront(store, products, 0, false, {
    count: products.length,
    categories: SHOP.categories(store.id).filter((c) => c.n > 0),
  })
  html = html.replace("</head>", `<style>.cookies,.wa-float,.lang-pill{display:none!important}</style></head>`)
  res.send(html)
})

app.get("/themes", (req, res) => {
  const { user } = auth(req)
  res.send(V.publicThemesPage(PT.publicList(), user))
})

app.get("/:slug/search", storefrontHandler)
app.get("/:slug", storefrontHandler)

app.get("/:slug/p/:id", (req, res) => {
  const store = withDraft(getStore(req.params.slug), req)
  if (!store) return res.status(404).send("Boutique introuvable")
  const p = db.prepare("SELECT * FROM products WHERE id = ? AND store_id = ? AND active = 1").get(req.params.id, store.id)
  if (!p) return res.redirect(`/${store.slug}`)

  const { session } = auth(req)
  const cart = cartFor(session, store.slug)
  const count = [...cart.values()].reduce((a, b) => a + b, 0)
  const related = db.prepare(`SELECT * FROM products WHERE store_id = ? AND active = 1 AND id != ?
                              ORDER BY (stock > 0) DESC, id LIMIT 3`).all(store.id, p.id)
  if (!req.query.preview) {
    db.prepare(`INSERT INTO visits (store_id, day, path, hits) VALUES (?, date('now'), ?, 1)`).run(store.id, "/p")
    PX.trackAsync(store, "ViewContent", {
      eventId: PX.eventId("vc", `${store.id}-${p.id}-${Date.now()}`),
      valueCents: p.price_cents,
      productIds: [p.id],
    }, { ip: SEC.ipOf(req), ua: req.headers["user-agent"] || "", url: req.originalUrl })
  }
  res.send(V.productPage(store, p, count, related, {
    gallery: SHOP.images(p.id),
    variants: SHOP.variants(p.id),
    reviews: SHOP.reviews(p.id),
    rating: SHOP.rating(p.id),
    reviewSent: req.query.avis === "ok",
    origin: req.protocol + "://" + req.get("host"),
    preview: !!req.query.preview,
  }))
})

app.get("/:slug/favoris", (req, res, next) => {
  if (RESERVED.has(req.params.slug)) return next()
  const store = getStore(req.params.slug)
  if (!store) return next()
  const { session } = auth(req)
  const cart = cartFor(session, store.slug)
  const count = [...cart.values()].reduce((a, b) => a + b, 0)
  res.send(V.favPage(store, count))
})

app.get("/:slug/page/:pslug", (req, res, next) => {
  if (RESERVED.has(req.params.slug)) return next()
  const store = getStore(req.params.slug)
  if (!store) return next()
  const page = db.prepare("SELECT * FROM pages WHERE store_id = ? AND slug = ? AND published = 1")
    .get(store.id, req.params.pslug)
  if (!page) return next()
  const { session } = auth(req)
  const cart = cartFor(session, store.slug)
  const count = [...cart.values()].reduce((a, b) => a + b, 0)
  res.send(V.contentPage(store, page, count, { sent: req.query.envoye === "1" }))
})

app.post("/:slug/contact", (req, res) => {
  const store = getStore(req.params.slug)
  if (!store || store.site_kind !== "vitrine") return res.redirect("/")
  const back = String(req.body.back || "").replace(/[^a-z0-9-]/gi, "").slice(0, 60)
  const dest = `/${store.slug}${back ? "/page/" + back : ""}`
  if (String(req.body.website || "").trim()) return res.redirect(dest)
  const name = String(req.body.name || "").trim().slice(0, 80)
  const phone = String(req.body.phone || "").trim().slice(0, 24)
  const email = String(req.body.email || "").trim().slice(0, 120)
  const message = String(req.body.message || "").trim().slice(0, 2000)
  if (name.length < 2 || message.length < 4 || (!phone && !email)) return res.redirect(dest + "?envoye=0#ecrire")
  db.prepare("INSERT INTO leads (store_id, name, phone, email, message, page) VALUES (?, ?, ?, ?, ?, ?)")
    .run(store.id, name, phone, email, message, back || "accueil")
  try {
    NOTICES.add(store.id, {
      kind: "lead",
      title: "Nouveau message",
      body: name + " — " + message,
      href: "/dashboard/recus",
    })
  } catch (_) {}
  res.redirect(dest + "?envoye=1#ecrire")
})

/* Achat direct : aucun panier, on remplit une commande d'un article et on
   envoie le client droit au formulaire. Utilisé par le bouton « Acheter
   maintenant » et par le mode « sans panier » du marchand. */
app.post("/:slug/direct", (req, res) => {
  const store = getStore(req.params.slug)
  if (!store) return res.redirect("/")
  const { session } = auth(req)
  const cart = cartFor(session, store.slug)
  const id = parseInt(req.body.product_id, 10)
  const vid = parseInt(req.body.variant_id, 10) || 0
  const p = db.prepare("SELECT * FROM products WHERE id = ? AND store_id = ? AND active = 1").get(id, store.id)
  if (!p) return res.redirect(`/${store.slug}`)
  const qty = Math.max(1, Math.min(10, parseInt(req.body.qty, 10) || 1))
  let stock = p.stock
  if (vid) {
    const v = db.prepare("SELECT * FROM variants WHERE id = ? AND product_id = ?").get(vid, id)
    if (!v) return res.redirect(`/${store.slug}/p/${id}`)
    stock = v.stock
  }
  if (stock <= 0) return res.redirect(`/${store.slug}/p/${id}`)
  cart.clear()
  cart.set(vid ? `${id}:${vid}` : String(id), Math.min(qty, stock))
  saveSession(session.sid, session)
  const pay = PAY.list(store).some((m) => m.id === req.body.payment) ? `?pay=${encodeURIComponent(req.body.payment)}` : ""
  res.redirect(`/${store.slug}/checkout${pay}`)
})

app.post("/:slug/cart/bundle", (req, res) => {
  const store = getStore(req.params.slug)
  if (!store) return res.redirect("/")
  const { session } = auth(req)
  const cart = cartFor(session, store.slug)
  const ids = (Array.isArray(req.body.ids) ? req.body.ids : [req.body.ids])
    .map((n) => parseInt(n, 10)).filter((n) => n > 0).slice(0, 4)
  for (const id of ids) {
    const p = db.prepare("SELECT * FROM products WHERE id = ? AND store_id = ? AND active = 1").get(id, store.id)
    if (!p || p.stock <= 0) continue
    const key = String(id)
    const current = cart.get(key) || 0
    if (current < p.stock) cart.set(key, current + 1)
  }
  saveSession(session.sid, session)
  res.redirect(`/${store.slug}/cart`)
})

app.post("/:slug/cart", (req, res) => {
  const store = getStore(req.params.slug)
  if (!store) return res.redirect("/")
  const { session } = auth(req)
  const cart = cartFor(session, store.slug)
  const id = parseInt(req.body.product_id, 10)
  const vid = parseInt(req.body.variant_id, 10) || 0
  /* titres de variante choisis par le client (« Taille : M · Couleur : Rouge ») */
  const opts = String(req.body.opts || "").replace(/\s+/g, " ").trim().slice(0, 120)
  const p = db.prepare("SELECT * FROM products WHERE id = ? AND store_id = ? AND active = 1").get(id, store.id)
  if (!p) return res.redirect(`/${store.slug}`)

  let stock = p.stock
  if (vid) {
    const v = db.prepare("SELECT * FROM variants WHERE id = ? AND product_id = ?").get(vid, id)
    if (!v) return res.redirect(`/${store.slug}/p/${id}`)
    stock = v.stock
  }
  if (stock <= 0) return res.redirect(`/${store.slug}/p/${id}`)

  const base = vid ? `${id}:${vid}` : String(id)
  /* la clé garde toujours 3 morceaux : produit:variante:options */
  const key = opts ? `${id}:${vid || 0}:${encodeURIComponent(opts)}` : base
  const current = cart.get(key) || 0
  if (current >= stock) return res.redirect(`/${store.slug}/cart`)
  cart.set(key, current + 1)
  saveSession(session.sid, session)
  {
    const d = cartDetails(store, cart, promoOf(session, store.slug))
    trackCart(req, store, session, d.items, d.totals, null)
  }
  const vPrice = vid ? db.prepare("SELECT price_cents FROM variants WHERE id = ?").get(vid) : null
  PX.trackAsync(store, "AddToCart", {
    eventId: PX.eventId("atc", `${store.id}-${session.sid}-${id}-${Date.now()}`),
    valueCents: (vPrice && vPrice.price_cents) || p.price_cents,
    productIds: [id],
  }, { ip: SEC.ipOf(req), ua: req.headers["user-agent"] || "", url: req.originalUrl })
  if (wantsDrawer(req)) {
    const drawn = cartDetails(store, cart, promoOf(session, store.slug))
    return res.json(cartPayload(store, drawn.items, drawn.totals))
  }
  res.redirect(`/${store.slug}/cart`)
})

function cartPayload(store, items, totals) {
  const D = SECTIONS.readDesign(store)
  const u = String(D.cartEmptyUrl || "").trim()
  const empty = !u ? `/${store.slug}` : (/^https?:\/\//.test(u) || u.startsWith("/") ? u : `/${store.slug}/${u.replace(/^\//, "")}`)
  return {
    ok: true,
    count: items.reduce((a, b) => a + b.qty, 0),
    currency: store.currency || "DZD",
    total: totals.total,
    checkout: `/${store.slug}/checkout`,
    cart: `/${store.slug}/cart`,
    empty,
    items: items.map((it) => ({
      key: it.key,
      title: it.title,
      qty: it.qty,
      price_cents: it.price_cents,
      image: it.image || "",
    })),
  }
}
const wantsDrawer = (req) => String((req.body && req.body.drawer) || "") === "1"

app.get("/:slug/cart.json", (req, res) => {
  const store = withDraft(getStore(req.params.slug), req)
  if (!store) return res.status(404).json({ ok: false })
  const { session } = auth(req)
  const cart = cartFor(session, store.slug)
  const { items, totals } = cartDetails(store, cart, promoOf(session, store.slug))
  res.json(cartPayload(store, items, totals))
})

app.get("/dashboard/media", requireAuth, requireStore, (req, res) => {
  const images = []
  const add = (u) => {
    if (typeof u !== "string" || !u || images.includes(u)) return
    if (u.startsWith("/uploads/") || u.startsWith("/demo/") || u.startsWith("https://")) images.push(u)
  }
  db.prepare("SELECT image FROM products WHERE store_id = ? AND image IS NOT NULL").all(req.store.id).forEach((r) => add(r.image))
  db.prepare("SELECT url FROM product_images WHERE product_id IN (SELECT id FROM products WHERE store_id = ?)").all(req.store.id).forEach((r) => add(r.url))
  const d = SECTIONS.readDesign(req.store)
  ;["logo", "logoInverse", "favicon", "exampleImage"].forEach((k) => add(d[k]))
  res.json({ ok: true, images: images.slice(0, 80) })
})

app.get("/:slug/cart", (req, res) => {
  const store = withDraft(getStore(req.params.slug), req)
  if (!store) return res.redirect("/")
  const { session } = auth(req)
  const cart = cartFor(session, store.slug)
  const { items, totals } = cartDetails(store, cart, promoOf(session, store.slug))
  trackCart(req, store, session, items, totals, null)
  const promoMsg = req.query.promo === "err" && totals.promoError ? "err:" + totals.promoError : req.query.promo
  res.send(V.cartPage(store, items, totals, items.reduce((a, b) => a + b.qty, 0), promoMsg, !!req.query.preview))
})

app.post("/:slug/promo", (req, res) => {
  const store = getStore(req.params.slug)
  if (!store) return res.redirect("/")
  const { session } = auth(req)
  const code = String(req.body.code || "").trim().toUpperCase()
  const cart = cartFor(session, store.slug)
  const { totals } = cartDetails(store, cart, code)
  if (!session.promo) session.promo = new Map()
  if (code && totals.promo) session.promo.set(store.slug, code)
  else if (!code) session.promo.delete(store.slug)
  saveSession(session.sid, session)
  res.redirect(`/${store.slug}/cart?promo=${code && totals.promo ? "ok" : "err"}`)
})

app.post("/:slug/cart/:id", (req, res) => {
  const store = getStore(req.params.slug)
  if (!store) return res.redirect("/")
  const { session } = auth(req)
  const cart = cartFor(session, store.slug)
  const key = String(req.params.id)
  const delta = parseInt(req.body.delta || "0", 10)
  const pid = parseInt(key.split(":")[0], 10)
  const p = db.prepare("SELECT stock FROM products WHERE id = ? AND store_id = ?").get(pid, store.id)
  const vid = parseInt(key.split(":")[1], 10) || 0
  const v = vid ? db.prepare("SELECT stock FROM variants WHERE id = ? AND product_id = ?").get(vid, pid) : null
  const max = v ? v.stock : p ? p.stock : 0
  const next = Math.min((cart.get(key) || 0) + delta, max)
  if (next <= 0) cart.delete(key)
  else cart.set(key, next)
  saveSession(session.sid, session)
  {
    const d = cartDetails(store, cart, promoOf(session, store.slug))
    trackCart(req, store, session, d.items, d.totals, null)
    if (wantsDrawer(req)) return res.json(cartPayload(store, d.items, d.totals))
  }
  if (wantsDrawer(req)) {
    const drawn = cartDetails(store, cart, promoOf(session, store.slug))
    return res.json(cartPayload(store, drawn.items, drawn.totals))
  }
  res.redirect(`/${store.slug}/cart`)
})

/* Communes d'une wilaya — suggestions du champ « commune » au checkout.
   Public, sans état, réponse courte et cachable. */
app.get("/:slug/communes", (req, res, next) => {
  if (RESERVED.has(req.params.slug)) return next()
  const store = getStore(req.params.slug)
  if (!store) return next()
  const w = String(req.query.w || "")
  if (!GEO.isWilaya(w)) return res.json({ wilayas: GEO.WILAYAS, communes: GEO.communesOf(GEO.WILAYAS[0]) })
  res.setHeader("Cache-Control", "public, max-age=86400")
  res.json({ wilaya: w, communes: GEO.communesOf(w) })
})

/* Position acceptée par le client → wilaya et commune. Rien n'est enregistré ici. */
app.get("/:slug/livraison", async (req, res, next) => {
  if (RESERVED.has(req.params.slug)) return next()
  try {
    const store = getStore(req.params.slug)
    if (!store) return res.status(404).json({ ok: false })
    const wilaya = String(req.query.wilaya || store.wilaya || "Alger")
    const q = await LIV.quote(store, wilaya)
    res.json({ ok: true, wilaya, home: q.home, desk: q.desk, source: q.source, desks: q.desks || [] })
  } catch (e) { next(e) }
})

app.get("/:slug/position", async (req, res, next) => {
  if (RESERVED.has(req.params.slug)) return next()
  const store = getStore(req.params.slug)
  if (!store) return next()
  const place = await GEO.placeFrom(req.query.lat, req.query.lng)
  res.setHeader("Cache-Control", "no-store")
  res.json(place || { ok: false })
})

app.get("/:slug/checkout", (req, res) => {
  const store = withDraft(getStore(req.params.slug), req)
  if (!store) return res.redirect("/")
  const { session } = auth(req)
  const cart = cartFor(session, store.slug)
  SHOP.ensureShipping(store.id)
  const types = SHOP.deliveryTypes(store)
  const delivery = types.length ? types[0].id : "home"
  const preview = !!req.query.preview
  let { items, totals } = cartDetails(store, cart, promoOf(session, store.slug), null, delivery)
  /* Aperçu depuis l'éditeur : on montre la page même avec un panier vide (1 produit d'exemple) */
  if (!items.length && preview) {
    const first = db.prepare("SELECT id FROM products WHERE store_id = ? AND active = 1 ORDER BY id LIMIT 1").get(store.id)
    if (first) ({ items, totals } = cartDetails(store, new Map([[String(first.id), 1]]), null, null, delivery))
  }
  if (!items.length) return res.redirect(`/${store.slug}/cart`)
  trackCart(req, store, session, items, totals, null)
  PX.trackAsync(store, "InitiateCheckout", {
    eventId: PX.eventId("ic", `${store.id}-${session.sid}-${Date.now()}`),
    valueCents: totals.total,
    productIds: items.map((i) => i.id),
  }, { ip: SEC.ipOf(req), ua: req.headers["user-agent"] || "", url: req.originalUrl })
  res.send(V.checkoutPage(store, items, totals, items.reduce((a, b) => a + b.qty, 0), null, {
    wilayas: SHOP.WILAYAS,
    shipping: SHOP.shippingTable(store.id),
    payments: PAY.list(store),
    delivery: types,
    preselect: String(req.query.pay || ""),
    preview,
  }))
})

app.post("/:slug/checkout", rateLimit("checkout", 30, 10 * 60e3), async (req, res) => {
  const store = getStore(req.params.slug)
  if (!store) return res.redirect("/")
  const { session } = auth(req)
  const cart = cartFor(session, store.slug)
  SHOP.ensureShipping(store.id)

  /* Formulaire posé directement sur la fiche produit : le produit commandé
     remplace le panier, sans passer par le bouton « Ajouter au panier ». */
  const buyId = parseInt(req.body.buy_id, 10)
  if (buyId) {
    const bp = db.prepare("SELECT * FROM products WHERE id = ? AND store_id = ? AND active = 1").get(buyId, store.id)
    if (bp && bp.stock > 0) {
      const qty = Math.max(1, Math.min(parseInt(req.body.buy_qty, 10) || 1, bp.stock))
      const bvid = parseInt(req.body.buy_variant, 10) || 0
      const opts = String(req.body.opts || "").replace(/\s+/g, " ").trim().slice(0, 120)
      const key = opts ? `${buyId}:${bvid || 0}:${encodeURIComponent(opts)}` : (bvid ? `${buyId}:${bvid}` : String(buyId))
      cart.clear()
      cart.set(key, qty)
      saveSession(session.sid, session)
    }
  }

  let { customer_name, phone, note } = req.body
  note = String(note || "").slice(0, 500)
  /* bureau de retrait choisi (bureaux importés depuis l'API du transporteur).
     Le champ vaut « identifiant|nom|commune » : l'API du transporteur a besoin
     de son propre identifiant de bureau, pas seulement du nom affiché. */
  const deskRaw = String(req.body.desk || "").trim()
  const [deskId, deskName, deskCommune] = deskRaw
    ? deskRaw.split("|").map((x) => String(x || "").trim().slice(0, 120))
    : ["", "", ""]
  if (deskName || deskId) note = [String(note || "").trim(), "Bureau : " + (deskName || deskId)].filter(Boolean).join(" — ")
  let address = String(req.body.address || "").trim()
  const wilaya = String(req.body.wilaya || "")
  /* la commune est facultative, mais si elle est saisie on la normalise
     sur la liste officielle de la wilaya (sinon on garde la saisie libre) */
  const communeRaw = String(req.body.commune || "").trim().slice(0, 60)
  const communeHit = GEO.findCommune(wilaya, communeRaw)
  const commune = communeHit ? communeHit.fr : communeRaw
  const hasGeo = Boolean(req.body.geo_lat && req.body.geo_lng && Number.isFinite(Number(req.body.geo_lat)))
  const types = SHOP.deliveryTypes(store)
  const delivery = types.some((t) => t.id === req.body.delivery) ? req.body.delivery : (types[0] ? types[0].id : "home")
  const { items, totals } = cartDetails(store, cart, promoOf(session, store.slug), wilaya || "Alger", delivery)
  /* formulaire : le prix affiché vient du transporteur s'il répond, sinon des frais de la boutique */
  if (buyId && CF.lookOf(store).delivery && wilaya) {
    try {
      const q = await LIV.quote(store, wilaya)
      const ship = delivery === "desk" ? q.desk : q.home
      if (Number.isFinite(ship)) {
        totals.shipping = ship
        totals.total = Math.max(0, totals.subtotal - (totals.discount || 0)) + ship
      }
    } catch (_) { /* on garde le tarif déjà calculé */ }
  }

  if (!items.length) return res.redirect(`/${store.slug}/cart`)

  /* on accepte une position GPS à la place d'une adresse écrite (cités sans nom de rue) */
  if (hasGeo && !address) address = "Position GPS envoyée par le client"
  const formData = CF.collect(store, hasGeo && !req.body.address
    ? { ...req.body, address: address }
    : req.body)
  /* le marchand peut masquer des champs : on garde des colonnes exploitables */
  if (!formData.values.customer_name) formData.values.customer_name = "Client"
  if (!formData.values.phone) formData.values.phone = "—"
  if (!formData.values.address) formData.values.address = formData.values.commune || formData.values.wilaya || "—"
  if (formData.missing.length) {
    return res.status(400).send(V.checkoutPage(store, items, totals, items.reduce((a, b) => a + b.qty, 0),
      "Merci de renseigner : " + formData.missing.join(", ") + ".",
      { wilayas: SHOP.WILAYAS, shipping: SHOP.shippingTable(store.id), payments: PAY.list(store), delivery: types }))
  }

  /* ---------- anti-fausses commandes ---------- */
  const ip = SEC.ipOf(req)
  const ua = String(req.headers["user-agent"] || "")
  const cap = await SEC.verifyCaptcha(store, req.body.captcha_token, ip)
  if (!cap.ok) {
    return res.status(400).send(V.checkoutPage(store, items, totals, items.reduce((a, b) => a + b.qty, 0),
      "Vérification anti-robot échouée. Merci de réessayer ou de nous appeler.",
      { wilayas: SHOP.WILAYAS, shipping: SHOP.shippingTable(store.id), payments: PAY.list(store), delivery: types }))
  }
  if (store.phone_strict && !SEC.phoneOk(phone)) {
    return res.status(400).send(V.checkoutPage(store, items, totals, items.reduce((a, b) => a + b.qty, 0),
      "Numéro de téléphone invalide. Format attendu : 0555 12 34 56.",
      { wilayas: SHOP.WILAYAS, shipping: SHOP.shippingTable(store.id), payments: PAY.list(store), delivery: types }))
  }
  if (SEC.isBlocked(store.id, SEC.normalizePhone(phone))) {
    return res.status(403).send(V.checkoutPage(store, items, totals, items.reduce((a, b) => a + b.qty, 0),
      "Cette commande ne peut pas être enregistrée. Contactez la boutique.",
      { wilayas: SHOP.WILAYAS, shipping: SHOP.shippingTable(store.id), payments: PAY.list(store), delivery: types }))
  }
  const geo = req.body.geo_lat
    ? { lat: Number(req.body.geo_lat), lng: Number(req.body.geo_lng), acc: Number(req.body.geo_acc) || 0 }
    : null

  /* ---------- paiement choisi par le client (réglages du marchand) ---------- */
  if (!PAY.list(store).length) {
    return res.status(400).send(V.checkoutPage(store, items, totals, items.reduce((a, b) => a + b.qty, 0),
      "Cette boutique n'a pas encore activé de moyen de paiement. Merci de nous contacter.",
      { wilayas: SHOP.WILAYAS, shipping: SHOP.shippingTable(store.id), payments: [], delivery: types }))
  }
  const payMethod = PAY.pick(store, req.body.payment)
  const payFee = PAY.feeFor(store, payMethod)
  totals.total += payFee

  const risk = SEC.risk(store, { phone, address, ip, geo, captchaScore: cap.score, captchaReason: cap.reason })

  const ref = REFS.uniqueRef(db, store.id)
  const stockRows = items.map((it) => ({ productId: it.id, variantId: it.variant ? it.variant.id : null, qty: it.qty }))
  /* d'où vient le client : conservé sur la commande pour les stats de campagne */
  const attr = ORD.attribution(req)
  const tx = db.transaction(() => {
    const custId = session.customer ? session.customer.get(store.slug) || null : null
    const info = db.prepare(`INSERT INTO orders
      (store_id, ref, customer_name, phone, address, wilaya, note, subtotal_cents, shipping_cents,
       discount_cents, promo_code, customer_id, total_cents, status,
       ip, ua, risk_score, risk_flags, captcha_ok, geo_lat, geo_lng, geo_accuracy,
       payment, pay_fee_cents, delivery_type, commune,
       source, utm_source, utm_medium, utm_campaign, utm_content, utm_term,
       click_id, click_kind, landing, referrer, device)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?,
              ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .run(store.id, ref, formData.values.customer_name, formData.values.phone,
        formData.values.address, wilaya || "", note || "",
        totals.subtotal, totals.shipping, totals.discount || 0, totals.promo ? totals.promo.code : "",
        custId, totals.total, SEC.statusFor(risk.score),
        ip, ua.slice(0, 200), risk.score, risk.flags.join(","), cap.ok ? 1 : 0,
        geo ? geo.lat : null, geo ? geo.lng : null, geo ? Math.round(geo.acc) : null,
        payMethod, payFee, delivery, commune,
        attr.source, attr.utm_source, attr.utm_medium, attr.utm_campaign, attr.utm_content, attr.utm_term,
        attr.click_id, attr.click_kind, attr.landing, attr.referrer, attr.device)
    if (Object.keys(formData.extra).length) {
      db.prepare("UPDATE orders SET form = ? WHERE id = ?").run(JSON.stringify(formData.extra), info.lastInsertRowid)
    }
    /* bureau de retrait gardé tel quel : il repartira vers l'API du transporteur */
    if (deskId || deskName) {
      db.prepare("UPDATE orders SET desk_id = ?, desk_name = ?, desk_commune = ? WHERE id = ?")
        .run(deskId || "", deskName || "", deskCommune || "", info.lastInsertRowid)
    }
    if (totals.promo) db.prepare("UPDATE discounts SET uses = uses + 1 WHERE id = ?").run(totals.promo.id)

    const addItem = db.prepare("INSERT INTO order_items (order_id, product_id, title, price_cents, qty, variant_id) VALUES (?, ?, ?, ?, ?, ?)")
    for (const it of items) {
      /* it.title contient déjà « Produit — Variante » depuis cartDetails */
      addItem.run(info.lastInsertRowid, it.id, it.title, it.price_cents, it.qty,
        it.variant ? it.variant.id : null)
    }
    /* stock : vérifié ET décrémenté dans la même transaction → aucune survente */
    INV.reserve(store.id, stockRows, info.lastInsertRowid)
    ORD.log(store.id, info.lastInsertRowid, "status", "Commande reçue",
      `via ${ORD.sourceLabel(attr.source)}`)
    return info.lastInsertRowid
  })

  let orderId
  try {
    orderId = tx()
  } catch (e) {
    if (e.code === "STOCK") {
      return res.status(409).send(V.checkoutPage(store, items, totals, items.reduce((a, b) => a + b.qty, 0),
        e.message + ". Retirez l'article ou réduisez la quantité pour continuer.",
        { wilayas: SHOP.WILAYAS, shipping: SHOP.shippingTable(store.id), payments: PAY.list(store), delivery: types }))
    }
    throw e
  }
  cart.clear()
  if (session.promo) session.promo.delete(store.slug)
  saveSession(session.sid, session)
  try { REL.converted(store.id, session.sid, orderId) } catch (_) { }
  try { HIST.stamp(orderId) } catch (_) {}

  const order = db.prepare("SELECT * FROM orders WHERE id = ?").get(orderId)
  const customerEmail = MAIL.pickEmail(req.body, formData.values)
  if (customerEmail) {
    db.prepare("UPDATE orders SET customer_email = ? WHERE id = ?").run(customerEmail, order.id)
    order.customer_email = customerEmail
  }
  try { MAIL.orderPlaced(req.store || store, order) } catch (_) {}
  try {
    if (!order.fake) {
      const who = String(order.customer_name || "Client").slice(0, 40)
      const sum = (Number(order.total_cents || 0) / 100).toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " DZD"
      NOTICES.add(store.id, {
        title: "Nouvelle commande " + order.ref,
        body: who + " · " + sum,
        href: "/dashboard/orders/" + order.id,
        orderId: order.id,
      })
    }
  } catch (_) {}
  logRow("info", `commande créée ${order.ref}`, {
    store: store.slug, total: order.total_cents, risque: risk.score, motifs: risk.flags.join(","),
  })
  /* pixel serveur : Purchase, même event_id que le navigateur (dédoublonnage) */
  PX.trackAsync(store, "Purchase", {
    eventId: PX.eventId("purchase", order.id),
    valueCents: order.total_cents,
    productIds: items.map((i) => i.id),
    orderId: order.id,
  }, { ip, ua, phone, url: `/${store.slug}/order/${order.ref}` })
  res.send(V.orderDone(store, order, {
    trackUrl: `/${store.slug}/order/${order.ref}`,
    pixel: PX.purchaseSnippet(store, order, items),
  }))
})


/* ---------------------------- AVIS CLIENT ---------------------------- */
app.post("/:slug/p/:id/review", rateLimit("review", 10, 3600e3), (req, res) => {
  const store = getStore(req.params.slug)
  if (!store) return res.redirect("/")
  const p = db.prepare("SELECT id FROM products WHERE id = ? AND store_id = ?").get(req.params.id, store.id)
  if (!p) return res.redirect(`/${store.slug}`)
  const name = String(req.body.name || "").trim().slice(0, 40)
  const body = String(req.body.body || "").trim().slice(0, 500)
  const note = Math.max(1, Math.min(5, parseInt(req.body.rating, 10) || 5))
  if (name) {
    db.prepare("INSERT INTO reviews (store_id, product_id, name, rating, body, approved) VALUES (?, ?, ?, ?, ?, 0)")
      .run(store.id, p.id, name, note, body)
  }
  res.redirect(`/${store.slug}/p/${p.id}?avis=ok#avis`)
})

/* ---------------------------- COMPTE CLIENT ---------------------------- */
const customerOf = (session, slug) => {
  if (!session.customer) session.customer = new Map()
  const id = session.customer.get(slug)
  if (!id) return null
  return db.prepare("SELECT * FROM customers WHERE id = ?").get(id) || null
}

app.get("/:slug/account", (req, res, next) => {
  if (RESERVED.has(req.params.slug)) return next()
  const store = getStore(req.params.slug)
  if (!store) return next()
  const { session } = auth(req)
  const customer = customerOf(session, store.slug)
  const orders = customer
    ? db.prepare("SELECT * FROM orders WHERE store_id = ? AND (customer_id = ? OR phone = ?) ORDER BY id DESC")
        .all(store.id, customer.id, customer.phone || "\u0000")
    : []
  res.send(V.customerAccount(store, customer, orders, req.query.error, !!req.query.preview))
})

app.post("/:slug/account/login", (req, res) => {
  const store = getStore(req.params.slug)
  if (!store) return res.redirect("/")
  const email = String(req.body.email || "").trim().toLowerCase()
  const password = String(req.body.password || "")
  const who = `${store.slug}|${email}`
  if (loginWaitSec(req, who) > 0) return res.status(429).send("Trop d'essais de connexion. Patiente quelques minutes, puis réessaie.")
  const row = db.prepare("SELECT * FROM customers WHERE store_id = ? AND email = ?").get(store.id, email)
  if (!row || !verifyPassword(password, row.password_hash)) {
    loginFailed(req, who)
    return res.redirect(`/${store.slug}/account?error=1`)
  }
  loginSucceeded(req, who)
  const session = regenerateSession(req, res)
  if (!session.customer) session.customer = new Map()
  session.customer.set(store.slug, row.id)
  saveSession(session.sid, session)
  res.redirect(`/${store.slug}/account`)
})

app.post("/:slug/account/register", (req, res) => {
  const store = getStore(req.params.slug)
  if (!store) return res.redirect("/")
  const email = String(req.body.email || "").trim().toLowerCase()
  const password = String(req.body.password || "")
  const name = String(req.body.name || "").trim().slice(0, 60)
  const phone = String(req.body.phone || "").trim().slice(0, 20)
  if (!email || password.length < 6 || !name) return res.redirect(`/${store.slug}/account?error=2`)
  const exists = db.prepare("SELECT 1 FROM customers WHERE store_id = ? AND email = ?").get(store.id, email)
  if (exists) return res.redirect(`/${store.slug}/account?error=3`)
  const info = db.prepare("INSERT INTO customers (store_id, email, password_hash, name, phone) VALUES (?, ?, ?, ?, ?)")
    .run(store.id, email, hashPassword(password), name, phone)
  const session = regenerateSession(req, res)
  if (!session.customer) session.customer = new Map()
  session.customer.set(store.slug, info.lastInsertRowid)
  saveSession(session.sid, session)
  res.redirect(`/${store.slug}/account`)
})

app.post("/:slug/account/logout", (req, res) => {
  const store = getStore(req.params.slug)
  const { session } = auth(req)
  if (session.customer) session.customer.delete(store ? store.slug : "")
  saveSession(session.sid, session)
  res.redirect(`/${store ? store.slug : ""}/account`)
})

/* ---------------------------- SUIVI DE COMMANDE ---------------------------- */
app.get("/:slug/order/:ref", rateLimit("track", 60, 10 * 60e3), async (req, res, next) => {
  if (RESERVED.has(req.params.slug)) return next()
  const store = getStore(req.params.slug)
  if (!store) return next()
  let order = db.prepare("SELECT * FROM orders WHERE store_id = ? AND ref = ?").get(store.id, req.params.ref)
  if (!order) return next()
  let parcel = CARRIERS.shipmentOfOrder(order.id)
  if (parcel && parcel.tracking && !["livree", "annulee"].includes(parcel.mapped || "")) {
    try {
      await Promise.race([
        CARRIERS.syncOne(parcel),
        new Promise((resolve) => setTimeout(resolve, 2500)),
      ])
      parcel = CARRIERS.shipmentOfOrder(order.id) || parcel
      order = db.prepare("SELECT * FROM orders WHERE id = ?").get(order.id) || order
    } catch (_) { /* la page s'ouvre avec le dernier statut connu */ }
  }
  const items = db.prepare("SELECT * FROM order_items WHERE order_id = ?").all(order.id)
  res.send(V.orderTrack(store, order, items, parcel))
})

/* ---------------------------- SEO : sitemap & robots ---------------------------- */
app.get("/robots.txt", (req, res) => {
  res.type("text/plain").send(
    "User-agent: *\nAllow: /\nDisallow: /dashboard\nDisallow: /login\nDisallow: /signup\n")
})
app.get("/:slug/sitemap.xml", (req, res, next) => {
  const store = getStore(req.params.slug)
  if (!store) return next()
  const base = `${req.protocol}://${req.get("host")}/${store.slug}`
  const products = db.prepare("SELECT id FROM products WHERE store_id = ? AND active = 1").all(store.id)
  const pages = db.prepare("SELECT slug FROM pages WHERE store_id = ? AND published = 1").all(store.id)
  const cats = SHOP.categories(store.id).filter((c) => c.n > 0)
  const urls = [
    `<url><loc>${base}</loc><changefreq>daily</changefreq></url>`,
    ...cats.map((c) => `<url><loc>${base}?cat=${c.slug}</loc></url>`),
    ...products.map((p) => `<url><loc>${base}/p/${p.id}</loc></url>`),
    ...pages.map((p) => `<url><loc>${base}/page/${p.slug}</loc></url>`),
  ]
  res.type("application/xml").send(`<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${urls.join("")}</urlset>`)
})

app.get("/:slug/robots.txt", (req, res, next) => {
  const store = getStore(req.params.slug)
  if (!store) return next()
  const base = `${req.protocol}://${req.get("host")}`
  res.type("text/plain").send(`User-agent: *\nAllow: /\nSitemap: ${base}/${store.slug}/sitemap.xml\n`)
})

/* ---------------------------- ADMIN : santé ---------------------------- */
app.get("/admin/logs", requireAuth, requireAdmin, (req, res) => {
  const data = JOURNAL.list({
    level: String(req.query.level || ""),
    q: req.query.q,
    span: String(req.query.span || "24h"),
    before: req.query.before,
  })
  data.live = req.query.live === "1"
  data.summary = JOURNAL.summary()
  data.recent = JOURNAL.recent(8)
  res.send(ADM.logsPage(req.user, data, ADM.flashOf(req.query), PLAT.badges()))
})

app.get("/admin/logs/:id", requireAuth, requireAdmin, (req, res) => {
  const row = JOURNAL.one(req.params.id)
  if (!row) return adminGo(res, "/admin/logs", { error: "Cette ligne n'existe plus." })
  res.send(ADM.logPage(req.user, row, JOURNAL.readMeta(row.meta), ADM.flashOf(req.query), PLAT.badges()))
})

app.post("/admin/logs/prune", requireAuth, requireAdmin, (req, res) => {
  const n = JOURNAL.prune()
  adminGo(res, "/admin/logs", {
    ok: n ? `${n} vieux message(s) enlevé(s). On garde 14 jours.` : "Rien à enlever. On garde déjà seulement 14 jours.",
  })
})

app.post("/admin/logs/clear", requireAuth, requireAdmin, (req, res) => {
  const n = JOURNAL.clearAll()
  adminGo(res, "/admin/logs", { ok: n ? "Journal effacé. Les prochains événements seront de nouveau notés." : "Le journal était déjà vide." })
})

app.get("/admin/health", requireAuth, requireAdmin, (req, res) => {
  res.send(ADM.healthPage(req.user, PLAT.health(), ADM.flashOf(req.query), PLAT.badges()))
})

app.post("/admin/cleanup-uploads", requireAuth, requireAdmin, (req, res) => {
  const removed = UPLOADS.cleanup(db)
  res.redirect(`/admin/health?cleaned=${removed}`)
})

/* ---------------------------- DASHBOARD : CATÉGORIES ---------------------------- */
/* ---------------------------- TRANSPORTEUR (n'importe quel bureau via API) ---------------------------- */
app.get("/dashboard/transporteur", requireAuth, requireStore, (req, res) => {
  /* plusieurs transporteurs possibles : on édite celui demandé, sinon le premier actif */
  const all = CARRIERS.list(req.store.id)
  /* carrier=0 → nouveau transporteur : formulaire vierge */
  const newOne = req.query.carrier === "0"
  const carrier = newOne ? null
    : (req.query.carrier && all.find((c) => String(c.id) === String(req.query.carrier)))
      || CARRIERS.active(req.store.id) || all[0] || null
  res.send(V.dashCarrier(req.user, req.store, {
    carriers: all,
    carrier,
    centers: carrier ? CARRIERS.centersOf(carrier.id) : [],
    shipments: CARRIERS.shipmentsOf(req.store.id),
    saved: req.query.saved === "1",
    error: req.query.error === "parcels"
      ? "Cette société a déjà des colis. On ne la retire pas : chaque suivi reste attaché à la société qui a pris le colis."
      : req.query.error === "carrier" ? "Connecte d'abord un transporteur : les bureaux lui sont rattachés." : "",
    testResult: null,
  }))
})

app.post("/dashboard/transporteur", requireAuth, requireStore, (req, res) => {
  /* id fourni = on modifie ce transporteur ; « new=1 » = on en ajoute un autre */
  const id = parseInt(req.body.id, 10) || 0
  const owned = id ? db.prepare("SELECT id FROM carriers WHERE id = ? AND store_id = ?").get(id, req.store.id) : null
  const last = db.prepare("SELECT id FROM carriers WHERE store_id = ? ORDER BY id DESC LIMIT 1").get(req.store.id)
  const target = owned ? owned.id : (req.body.new === "1" || !last ? null : last.id)
  const saved = CARRIERS.save(req.store.id, req.body, target)
  res.redirect(`/dashboard/transporteur?saved=1&carrier=${saved}`)
})

app.post("/dashboard/transporteur/test", requireAuth, requireStore, async (req, res, next) => {
  try {
    const carrier = (req.body.id && CARRIERS.get(req.body.id, req.store.id)) || CARRIERS.active(req.store.id)
    if (!carrier) return res.redirect("/dashboard/transporteur")
    const result = await CARRIERS.testConnection(carrier)
    const fresh = CARRIERS.get(carrier.id, req.store.id)
    res.send(V.dashCarrier(req.user, req.store, {
      carrier: fresh,
      centers: CARRIERS.centersOf(carrier.id),
      shipments: CARRIERS.shipmentsOf(req.store.id),
      saved: false,
      testResult: result,
    }))
  } catch (e) { next(e) }
})

app.post("/dashboard/transporteur/centres/manual", requireAuth, requireStore, (req, res) => {
  const carrier = CARRIERS.active(req.store.id) ||
    db.prepare("SELECT * FROM carriers WHERE store_id = ? ORDER BY id DESC LIMIT 1").get(req.store.id)
  if (!carrier) return res.redirect("/dashboard/transporteur?error=carrier")
  const lines = String(req.body.list || "").split("\n").map((l) => l.trim()).filter(Boolean).slice(0, 500)
  let added = 0
  for (const line of lines) {
    const cells = line.split(/[;\t]/).map((c) => c.trim())
    if (!cells[0]) continue
    CARRIERS.addCenter(carrier.id, {
      /* 6ᵉ colonne facultative : l'identifiant du bureau chez le transporteur
         (Yalidine « center_id », NOEST « 16A »…). Sans lui, on utilise le nom. */
      externalId: cells[5] || "",
      name: cells[0], wilaya: cells[1] || "", commune: cells[2] || "",
      address: cells[3] || "", phone: cells[4] || "",
    })
    added++
  }
  res.redirect(`/dashboard/transporteur?centers=${added}`)
})

app.post("/dashboard/transporteur/centres", requireAuth, requireStore, async (req, res, next) => {
  try {
    const carrier = (req.body.id && CARRIERS.get(req.body.id, req.store.id)) || CARRIERS.active(req.store.id)
    if (carrier) await CARRIERS.refreshCenters(carrier)
    res.redirect(`/dashboard/transporteur${carrier ? "?carrier=" + carrier.id : ""}`)
  } catch (e) { next(e) }
})

app.post("/dashboard/transporteur/sync", requireAuth, requireStore, async (req, res, next) => {
  try {
    await CARRIERS.syncStore(req.store.id)
    res.redirect("/dashboard/transporteur")
  } catch (e) { next(e) }
})

app.post("/dashboard/transporteur/delete", requireAuth, requireStore, (req, res) => {
  const id = parseInt(req.body.id, 10) || 0
  if (!id) return res.redirect("/dashboard/transporteur")
  const n = db.prepare("SELECT COUNT(*) AS n FROM shipments WHERE carrier_id = ?").get(id).n
  if (n) return res.redirect("/dashboard/transporteur?error=parcels&carrier=" + id)
  db.prepare("DELETE FROM carriers WHERE id = ? AND store_id = ?").run(id, req.store.id)
  res.redirect("/dashboard/transporteur")
})

/* envoi du colis depuis la fiche commande */
app.post("/dashboard/orders/:id/expedier", requireAuth, requireStore, async (req, res, next) => {
  try {
    const order = db.prepare("SELECT * FROM orders WHERE id = ? AND store_id = ?").get(req.params.id, req.store.id)
    if (!order) return res.redirect("/dashboard/orders")
    /* on n'expédie que ce qui a été confirmé avec le client */
    if (ORD.norm(order.status) !== "confirmee") {
      return res.redirect(`/dashboard/orders/${order.id}?envoi=nonconfirmee`)
    }
    /* le transporteur choisi dans le menu, sinon le premier actif */
    const enabled = CARRIERS.list(req.store.id).filter((c) => c.enabled)
    const carrier = enabled.find((c) => String(c.id) === String(req.body.carrier_id || "")) || enabled[0] || null
    if (!carrier) return res.redirect(`/dashboard/orders/${order.id}`)
    /* un colis = un envoi : on ne renvoie pas deux fois la même commande */
    if (CARRIERS.shipmentOfOrder(order.id)) return res.redirect(`/dashboard/orders/${order.id}`)
    const [communeId, communeName] = String(req.body.commune_id || "|").split("|")
    const priceCents = req.body.price !== undefined && req.body.price !== ""
      ? Math.round(Number(req.body.price) * 100) : order.total_cents
    /* bureau de retrait : celui du formulaire, sinon celui enregistré sur la commande */
    const deskRaw = String(req.body.desk_id || "").trim()
    let desk = null
    if (deskRaw) {
      const [id, name, commune] = deskRaw.split("|")
      desk = { id: String(id || "").trim(), name: String(name || "").trim(), commune: String(commune || "").trim() }
    } else if (order.desk_name || order.desk_id) {
      desk = { id: order.desk_id || "", name: order.desk_name || "", commune: order.desk_commune || "" }
    }
    const sent = await CARRIERS.sendParcel(req.store, order, carrier, {
      communeId,
      communeName: communeName || req.body.commune || "",
      stopDesk: req.body.stopDesk === "1" || Boolean(desk),
      desk,
      freeShipping: Boolean(req.body.free_shipping),
      priceCents: Number.isFinite(priceCents) ? priceCents : order.total_cents,
    })
    res.redirect(`/dashboard/orders/${order.id}?envoi=${sent.ok ? "ok" : sent.missing ? "incomplet" : "erreur"}`)
  } catch (e) { next(e) }
})


/* ---------------------------- PANIERS ABANDONNÉS ---------------------------- */

/* le client tape son numéro sur la page de commande : on le garde pour la relance */
app.post("/:slug/question", (req, res) => {
  if (RESERVED.has(req.params.slug)) return res.status(404).end()
  const store = getStore(req.params.slug)
  if (!store) return res.status(404).send("Boutique introuvable.")
  if (store.site_kind === "vitrine") {
    const name = String((req.body || {}).name || "").trim().slice(0, 80) || "Sans nom"
    const phone = String((req.body || {}).phone || "").trim().slice(0, 24)
    const message = String((req.body || {}).text || (req.body || {}).message || "").trim().slice(0, 2000)
    if (message.length >= 4) {
      db.prepare("INSERT INTO leads (store_id, name, phone, email, message, page) VALUES (?, ?, ?, ?, ?, ?)")
        .run(store.id, name, phone, "", message, "question")
      try { NOTICES.add(store.id, { kind: "lead", title: "Nouveau message", body: name + " — " + message, href: "/dashboard/recus" }) } catch (_) {}
    }
    return res.redirect("/" + store.slug + "?envoye=1#ecrire")
  }
  const out = AI.customerQuestion(store, req.body || {})
  const back = "/" + store.slug
  const safe = (v) => String(v || "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;" }[c]))
  if (!out.ok) {
    return res.status(400).send("<!doctype html><meta charset=\"utf-8\"><title>Question</title><p>" + safe(out.error || "Question refusée.") + "</p><p><a href=\"" + safe(back) + "\">Retour</a></p>")
  }
  logRow("info", "question client", { store: store.slug })
  res.send("<!doctype html><meta charset=\"utf-8\"><title>Question envoyée</title><body style=\"font:16px/1.5 system-ui,sans-serif;max-width:520px;margin:48px auto;padding:0 16px\"><h1>C'est envoyé.</h1><p>Le marchand a le message dans ses notifications. Personne ne vous répond automatiquement, ni par mail, ni par WhatsApp.</p><p><a href=\"" + safe(back) + "\">Retour à la boutique</a></p></body>")
})

app.post("/:slug/panier/contact", (req, res) => {
  const store = getStore(req.params.slug)
  if (!store) return res.json({ ok: false })
  const { session } = auth(req)
  const cart = cartFor(session, store.slug)
  const { items, totals } = cartDetails(store, cart, promoOf(session, store.slug))
  if (!items.length) return res.json({ ok: false })
  trackCart(req, store, session, items, totals, {
    name: String(req.body.name || "").slice(0, 80),
    phone: String(req.body.phone || "").slice(0, 20),
    wilaya: String(req.body.wilaya || "").slice(0, 40),
    address: String(req.body.address || "").slice(0, 200),
  })
  res.json({ ok: true })
})

/* lien de récupération envoyé au client */
app.get("/:slug/panier/:token", (req, res, next) => {
  if (RESERVED.has(req.params.slug)) return next()
  const store = getStore(req.params.slug)
  if (!store) return next()
  const row = REL.byToken(store.id, req.params.token)
  if (!row || !row.items.length) return res.redirect(`/${store.slug}`)
  const { session } = auth(req)
  const cart = cartFor(session, store.slug)
  for (const it of row.items) {
    const key = it.key || (it.variant ? `${it.id}:${it.variant}` : String(it.id))
    const exists = db.prepare("SELECT id FROM products WHERE id = ? AND store_id = ? AND active = 1").get(it.id, store.id)
    if (exists) cart.set(key, it.qty)
  }
  saveSession(session.sid, session)
  res.redirect(`/${store.slug}/cart`)
})

/* le clic « Relancer » : enregistre le message puis ouvre WhatsApp */
app.get("/:slug/panier/:token/relancer", requireAuth, requireStore, (req, res) => {
  const store = req.store
  const row = REL.byToken(store.id, req.params.token)
  if (!row) return res.redirect("/dashboard/paniers")
  const r = REL.remindCart(store, row, { baseUrl: baseUrlFor(req) })
  if (r.wa) return res.redirect(r.wa)
  res.redirect("/dashboard/paniers")
})

app.get("/dashboard/paniers", requireAuth, requireStore, (req, res) => {
  res.send(V.dashCarts(req.user, req.store, {
    carts: REL.listCarts(req.store.id, "abandoned"),
    stats: REL.stats(req.store.id),
    delay: REL.delayOf(req.store),
  }))
})

app.post("/dashboard/paniers/detecter", requireAuth, requireStore, (req, res) => {
  try {
    const rows = REL.abandoned(req.store.id, REL.delayOf(req.store))
    for (const c of rows) {
      try { REL.remindCart(req.store, c, { baseUrl: baseUrlFor(req) }) } catch (_) { }
    }
  } catch (_) { }
  res.redirect("/dashboard/paniers")
})

/* ---------------------------- RELANCES / MESSAGES ---------------------------- */
app.get("/dashboard/relances", requireAuth, requireStore, (req, res) => {
  res.send(V.dashRelances(req.user, req.store, {
    messages: REL.listMessages(req.store.id, "", 1000),
    defaultCart: REL.DEFAULT_CART_TEMPLATE,
    defaultOrder: REL.DEFAULT_ORDER_TEMPLATE,
    saved: req.query.saved === "1",
    note: req.query.note ? { ok: req.query.note === "ok", text: req.query.note === "ok" ? "Messages envoyés." : "Aucune API configurée : utilise les liens WhatsApp." } : null,
  }))
})

app.post("/dashboard/relances", requireAuth, requireStore, (req, res) => {
  const b = req.body
  const provider = b.msg_provider === "custom" ? "custom" : "manual"
  if (provider === "custom" && !String(b.msg_url || "").trim()) {
    return res.redirect("/dashboard/relances?error=" + encodeURIComponent("Pour l'envoi automatique, l'adresse de l'API est obligatoire."))
  }
  const enc = b.msg_header_value ? require("./src/secrets").encrypt(String(b.msg_header_value).trim()) : null
  db.prepare(`UPDATE stores SET msg_provider = ?, msg_url = ?, msg_header_name = ?, msg_body = ?,
              msg_delay_minutes = ?, msg_template_cart = ?, msg_template_order = ?,
              msg_header_value_enc = COALESCE(?, msg_header_value_enc) WHERE id = ?`)
    .run(provider, String(b.msg_url || "").trim(), String(b.msg_header_name || "Authorization").trim(),
      String(b.msg_body || ""), Math.max(5, parseInt(b.msg_delay_minutes, 10) || 45),
      String(b.msg_template_cart || ""), String(b.msg_template_order || ""),
      enc, req.store.id)
  res.redirect("/dashboard/relances?saved=1")
})

app.post("/dashboard/relances/envoyer", requireAuth, requireStore, async (req, res, next) => {
  try {
    const store = db.prepare("SELECT * FROM stores WHERE id = ?").get(req.store.id)
    const r = await REL.flush(store)
    if (r.manual) {
      return res.redirect("/dashboard/relances?error=" + encodeURIComponent("Aucune API enregistrée. Les messages ne partent pas tout seuls."))
    }
    if (!r.sent) {
      return res.redirect("/dashboard/relances?error=" + encodeURIComponent(r.total
        ? "Aucun message n'est parti. Regarde la colonne État : elle dit pourquoi."
        : "Aucun message en attente."))
    }
    res.redirect("/dashboard/relances?note=ok")
  } catch (e) { next(e) }
})

app.post("/dashboard/relances/:id/envoye", requireAuth, requireStore, (req, res) => {
  REL.markSent(req.params.id, req.store.id)
  res.redirect("/dashboard/relances")
})

/* ---------------------------- STATISTIQUES LIVRAISON ---------------------------- */
app.get("/dashboard/livraison", requireAuth, requireStore, (req, res) => {
  const carriers = STATS.byCarrier(req.store.id)
  res.send(V.dashDeliveryStats(req.user, req.store, {
    overview: STATS.overview(req.store.id),
    carriers,
    wilayas: STATS.byWilaya(req.store.id),
    verdict: STATS.verdict(carriers),
  }))
})

app.post("/dashboard/livraison/sync", requireAuth, requireStore, async (req, res, next) => {
  try {
    await CARRIERS.syncStore(req.store.id)
    res.redirect("/dashboard/livraison")
  } catch (e) { next(e) }
})

/* ---------------------------- BORDEREAU PDF ---------------------------- */
app.get("/dashboard/orders/:id/bordereau", requireAuth, requireStore, (req, res) => {
  const order = db.prepare("SELECT * FROM orders WHERE id = ? AND store_id = ?").get(req.params.id, req.store.id)
  if (!order) return res.redirect("/dashboard/orders")
  const file = CARRIERS.labelFile(order.label_file)
  if (file) {
    res.type("application/pdf")
    res.setHeader("Content-Disposition", `inline; filename="bordereau-${order.ref}.pdf"`)
    return res.sendFile(file)
  }
  if (order.label_url) return res.redirect(order.label_url)
  res.redirect(`/dashboard/orders/${order.id}`)
})

/* ---------------------------- 404 ---------------------------- */
app.use((req, res) => res.status(404).send(landing(db.prepare("SELECT * FROM stores WHERE status='active'").all())))

/* (le 413 « envoi trop lourd » est traité juste après les parseurs, en haut) */

app.use((err, req, res, next) => {
  const msg = messageOf(err)
  req._journaled = true
  const pathOnly = String(req.path || "/").split("?")[0]
  JOURNAL.write("error", "Une page a planté", {
    stack: String(err && err.stack || "").slice(0, 800),
    detail: String(err && err.message || "").slice(0, 300),
  }, { method: req.method, path: pathOnly, status: 500, storeId: req.store && req.store.id })
  if (res.headersSent) return next(err)
  const wantsJson = req.xhr || String(req.headers.accept || "").includes("application/json") || String(req.headers["content-type"] || "").includes("application/json")
  if (wantsJson) return res.status(500).json({ ok: false, error: msg })
  res.status(500).send(V.errorPage(msg))
})

/* paniers abandonnés : toutes les 10 minutes. Prépare, puis envoie si une API est enregistrée. */
setInterval(() => {
  ;(async () => {
    try {
      const stores = db.prepare("SELECT * FROM stores WHERE status = 'active'").all()
      const base = process.env.PUBLIC_URL || `http://localhost:${PORT}`
      let prepared = 0
      let sent = 0
      for (const st of stores) {
        for (const c of REL.abandoned(st.id, REL.delayOf(st))) {
          try { REL.remindCart(st, c, { baseUrl: base }); prepared++ } catch (_) { }
        }
        if ((st.msg_provider || "manual") === "custom" && st.msg_url) {
          try {
            const r = await REL.flush(st)
            sent += r.sent || 0
          } catch (e) { logRow("error", `relance auto : ${e.message}`) }
        }
      }
      if (prepared || sent) logRow("info", `relances : ${prepared} préparée(s), ${sent} envoyée(s)`)
    } catch (e) { logRow("error", `relances : ${e.message}`) }
  })()
}, 10 * 60 * 1000).unref()

/* synchronisation des statuts transporteurs : toutes les 10 minutes */
setInterval(() => {
  CARRIERS.syncAll()
    .then((n) => { if (n) logRow("info", `sync transporteurs : ${n} colis vérifiés`) })
    .catch((e) => logRow("error", `sync transporteurs : ${e.message}`))
}, 10 * 60 * 1000).unref()

/* =====================================================================
   DÉMARRAGE — messages clairs et jamais de sortie silencieuse
   =====================================================================
   Problème constaté : la fenêtre PowerShell rendait la main tout de suite
   et le navigateur affichait « localhost n'autorise pas la connexion ».
   Un serveur qui démarre doit rester au premier plan ; si quelque chose
   l'empêche de démarrer (port occupé, erreur), on doit le voir écrit en
   français, pas un retour de prompt mystérieux. */
const SQLITE = require("./src/sqlite")

const startAt = (port) => {
  const server = app.listen(port, "0.0.0.0")

  server.on("listening", () => {
    const bound = server.address().port
    console.log(`NOVADZ_LISTEN ${bound}`)
    const url = `http://localhost:${bound}`
    console.log("")
    console.log("  NovaDZ — plateforme multi-boutiques")
    console.log("  ------------------------------------------------")
    console.log(`  Adresse      : ${url}`)
    console.log(`  SQLite       : ${SQLITE.which()}`)
    console.log(`  Base         : ${process.env.NOVADZ_DB || "data/novadz.db"}`)
    if (process.env.NOVADZ_DEMO === "1") {
      console.log("  Marchand     : demo@novadz.dz / demo1234")
      console.log("  Admin        : admin@novadz.dz / admin1234")
    } else {
      console.log("  Admin        : admin@novadz.dz (mot de passe affiche au premier demarrage)")
    }
    console.log("  ------------------------------------------------")
    console.log("  Garde cette fenetre OUVERTE. Ctrl+C pour arreter.")
    console.log("")

    /* auto-test : le serveur se contacte lui-même pour prouver qu'il répond */
    setTimeout(() => {
      const lib = url.startsWith("https") ? require("https") : require("http")
      const req = lib.get(url + "/", (res) => {
        res.resume()
        console.log(`  OK : ${url} repond (HTTP ${res.statusCode}). Ouvre ce lien dans ton navigateur.`)
        console.log("")
      })
      req.on("error", (e) => {
        console.log(`  ATTENTION : le serveur ecoute mais ne repond pas (${e.code || e.message}).`)
        console.log("  Verifie le pare-feu Windows (autoriser Node.js) puis relance.")
        console.log("")
      })
      req.setTimeout(5000, () => req.destroy(new Error("timeout")))
    }, 400)
  })

  server.on("error", (e) => {
    if (e.code === "EADDRINUSE") {
      if (port < 3010) {
        console.log("")
        console.log(`  Le port ${port} est deja utilise (une autre fenetre fait peut-etre tourner NovaDZ).`)
        console.log(`  Je bascule sur le port ${port + 1}...`)
        return startAt(port + 1)
      }
      console.log("")
      if (port >= 3010 && process.env.PORT) {
        console.log(`  ERREUR : le port ${port} (demande par $env:PORT) est deja utilise.`)
        console.log("  Ferme l'autre programme qui l'occupe, ou choisis un autre port : $env:PORT=3001")
      } else {
        console.log("  ERREUR : les ports 3000 a 3010 sont tous occupes.")
        console.log("  Ferme les autres fenetres PowerShell qui font tourner NovaDZ, puis relance.")
      }
      process.exit(1)
    }
    console.log("")
    console.log(`  ERREUR au demarrage du serveur : ${e.code || ""} ${e.message}`)
    if (e.code === "EACCES") console.log("  Le port est protege : essaie $env:PORT=3001; npm start")
    process.exit(1)
  })

  return server
}

/* Une erreur imprévue dans une requete ne doit pas tuer le serveur en silence. */
process.on("uncaughtException", (e) => {
  const code = e && e.code
  if (code === "EPIPE" || code === "ECONNRESET") {
    try { JOURNAL.write("warn", "Quelqu'un a fermé la page trop tôt") } catch (_) {}
    return
  }
  try { console.log(`\n  [erreur non gérée] ${e && e.stack ? e.stack.split("\n")[0] : e}`) } catch (_) {}
  try { JOURNAL.write("error", "Une erreur inattendue", { detail: String(e && e.message || "").slice(0, 300) }) } catch (_) {}
})
process.on("unhandledRejection", (e) => {
  console.log(`\n  [promesse rejetée] ${e && e.message ? e.message : e}`)
  try { JOURNAL.write("error", "Une tâche n'a pas fini", { detail: String(e && e.message ? e.message : e).slice(0, 300) }) } catch (_) {}
})

/* Filet de sécurité : même si le serveur était fermé par erreur, le process
   reste vivant (donc la fenêtre ne rend pas la main et on voit l'erreur). */
const keepAlive = setInterval(() => {}, 1 << 30)

process.on("SIGINT", () => {
  console.log("\n  Arret de NovaDZ. A bientot.")
  clearInterval(keepAlive)
  process.exit(0)
})
process.on("exit", (code) => {
  if (code !== 0) console.log(`  Le serveur s'est arrete (code ${code}).`)
})

startAt(Number(PORT))
