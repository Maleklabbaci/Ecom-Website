"use strict"
/**
 * Deux IA, une seule plateforme.
 *
 * L'assistant lit la boutique et répond au marchand. S'il doit prévenir,
 * il pose une notification dans la cloche. Pas de mail, pas de WhatsApp.
 * Il ne parle pas au client.
 *
 * L'IA du site ne pose que des sections, des thèmes et des réglages qui
 * existent déjà. Elle enregistre un brouillon. Elle ne publie pas.
 */
const db = require("./db")
const NOTICES = require("./notices")
const SECTIONS = require("./sections")
const INV = require("./inventory")
const HIST = require("./historique")
const ORD = require("./orders")
const { isTheme, THEMES } = require("./themes")

const fold = (s) => String(s || "")
  .toLowerCase()
  .normalize("NFD")
  .replace(/[\u0300-\u036f]/g, "")

const dzd = (cents) => (Number(cents || 0) / 100).toLocaleString("fr-FR", {
  minimumFractionDigits: 2, maximumFractionDigits: 2,
}) + " DZD"

const clip = (s, n) => String(s || "").replace(/\s+/g, " ").trim().slice(0, n)

const productsOf = (storeId) => db.prepare(
  "SELECT id, title, price_cents, stock, active FROM products WHERE store_id = ? AND active = 1 ORDER BY id DESC LIMIT 24"
).all(storeId)

const ordersOf = (storeId) => db.prepare(
  "SELECT id, ref, status, total_cents, customer_name, phone, created_at FROM orders WHERE store_id = ? AND COALESCE(fake, 0) = 0 ORDER BY id DESC LIMIT 40"
).all(storeId)

const countStatus = (rows) => {
  const out = {}
  for (const o of rows) {
    const id = ORD.norm(o.status)
    out[id] = (out[id] || 0) + 1
  }
  return out
}

const waiting = (rows) => rows.filter((o) => ["nouvelle", "reportee", "injoignable", "a_verifier"].includes(ORD.norm(o.status)))

const questions = (storeId) => db.prepare(
  "SELECT id, title, body, created_at, read_at FROM notices WHERE store_id = ? AND kind = 'question' ORDER BY id DESC LIMIT 8"
).all(storeId)

const brief = (store) => {
  const products = productsOf(store.id)
  const orders = ordersOf(store.id)
  const by = countStatus(orders)
  const low = INV.lowStock(store.id, INV.threshold(store)).filter((p) => !p.variantLabel || p.kind === "rupture")
  const seen = new Set()
  const stock = []
  for (const p of low) {
    const key = p.id + ":" + (p.variantLabel || "")
    if (seen.has(key)) continue
    seen.add(key)
    stock.push({ title: p.title, level: p.level, kind: p.kind, variant: p.variantLabel || "" })
    if (stock.length >= 8) break
  }
  let reviews = 0
  try {
    reviews = db.prepare("SELECT COUNT(*) n FROM reviews WHERE store_id = ? AND approved = 0").get(store.id).n
  } catch (_) { reviews = 0 }
  let carts = 0
  try {
    carts = db.prepare("SELECT COUNT(*) n FROM carts WHERE store_id = ? AND status = 'abandoned'").get(store.id).n
  } catch (_) { carts = 0 }
  return {
    name: store.name,
    products,
    orders,
    by,
    waiting: waiting(orders),
    stock,
    reviews,
    carts,
    questions: questions(store.id),
  }
}

const linesOf = (b) => {
  const wait = b.waiting.length
  const parts = [
    b.name + " : " + b.products.length + " produit" + (b.products.length > 1 ? "s" : "") + " en ligne.",
    wait ? wait + " commande" + (wait > 1 ? "s" : "") + " à traiter." : "Aucune commande en attente dans les dernières.",
  ]
  if (b.stock.length) {
    parts.push(b.stock.filter((s) => s.kind === "rupture").length
      ? "Rupture : " + b.stock.filter((s) => s.kind === "rupture").map((s) => s.title).slice(0, 4).join(", ") + "."
      : "Stock faible : " + b.stock.map((s) => s.title).slice(0, 4).join(", ") + ".")
  } else parts.push("Pas de rupture signalée.")
  if (b.reviews) parts.push(b.reviews + " avis en attente de lecture.")
  if (b.carts) parts.push(b.carts + " panier" + (b.carts > 1 ? "s" : "") + " abandonné" + (b.carts > 1 ? "s" : "") + ".")
  if (b.questions.length) parts.push(b.questions.length + " question" + (b.questions.length > 1 ? "s" : "") + " de client dans la cloche.")
  return parts
}

const signal = (storeId, item) => {
  const title = clip(item.title, 80)
  const dup = db.prepare(
    "SELECT id FROM notices WHERE store_id = ? AND title = ? AND read_at IS NULL AND created_at >= datetime('now', '-1 day')"
  ).get(storeId, title)
  if (dup) return { id: dup.id, duplicate: true, title }
  const id = NOTICES.add(storeId, {
    kind: item.kind || "ia",
    title,
    body: clip(item.body, 160),
    href: item.href || "/dashboard/assistant",
  })
  return { id, duplicate: false, title }
}

const scan = (store) => {
  const b = brief(store)
  const sent = []
  for (const s of b.stock.filter((x) => x.kind === "rupture").slice(0, 4)) {
    sent.push(signal(store.id, {
      kind: "stock",
      title: "Rupture : " + s.title,
      body: "Plus aucune pièce en stock.",
      href: "/dashboard/stock",
    }))
  }
  if (!sent.length) {
    for (const s of b.stock.slice(0, 3)) {
      sent.push(signal(store.id, {
        kind: "stock",
        title: "Stock faible : " + s.title,
        body: s.level + " pièce" + (s.level > 1 ? "s" : "") + " restante" + (s.level > 1 ? "s" : "") + ".",
        href: "/dashboard/stock",
      }))
    }
  }
  if (b.waiting.length) {
    sent.push(signal(store.id, {
      kind: "order",
      title: b.waiting.length + " commande" + (b.waiting.length > 1 ? "s" : "") + " à traiter",
      body: b.waiting.slice(0, 3).map((o) => o.ref).join(", "),
      href: "/dashboard/orders",
    }))
  }
  if (b.reviews) {
    sent.push(signal(store.id, {
      kind: "review",
      title: b.reviews + " avis à lire",
      body: "Ils attendent dans Avis.",
      href: "/dashboard/reviews",
    }))
  }
  return sent
}

const phoneOf = (text) => {
  const m = String(text || "").match(/(?:\+213|00213|0)[5-7]\d{8}/)
  return m ? m[0] : ""
}

const answer = (store, text) => {
  const q = fold(text)
  const raw = clip(text, 500)
  if (!raw) return { answer: "Pose une question sur la boutique.", signals: [] }
  const b = brief(store)
  const signals = []

  if (/signale|signalement|alerte|previens|previen/.test(q)) {
    const sent = scan(store)
    const fresh = sent.filter((s) => !s.duplicate)
    return {
      answer: fresh.length
        ? "J'ai posé " + fresh.length + " signalement" + (fresh.length > 1 ? "s" : "") + " dans la cloche : " + fresh.map((s) => s.title).join(" · ") + ". Rien n'est parti par mail ni par WhatsApp."
        : "Rien de nouveau à signaler. Les alertes déjà dans la cloche n'ont pas été doublées.",
      signals: sent,
    }
  }

  if (/historique|numero|téléphone|telephone|0[5-7]\d{8}/.test(q) && phoneOf(raw)) {
    const phone = phoneOf(raw)
    const h = HIST.summary(phone)
    const liv = h.livre || h.livree || 0
    const ann = h.annule || h.annulee || 0
    const ret = h.retour || 0
    return {
      answer: "Pour " + phone + ", l'historique ne montre que trois comptes, toutes boutiques confondues : " + liv + " livré" + (liv > 1 ? "s" : "") + ", " + ann + " annulé" + (ann > 1 ? "s" : "") + ", " + ret + " retour" + (ret > 1 ? "s" : "") + ". Pas de nom, pas d'adresse.",
      signals: [],
    }
  }

  if (/rupture|stock|epuise|épuise|reste/.test(q)) {
    if (!b.stock.length) return { answer: "Aucun produit en rupture ou en stock faible.", signals: [] }
    return {
      answer: b.stock.map((s) => (s.kind === "rupture" ? "Rupture" : "Faible") + " — " + s.title + (s.variant ? " (" + s.variant + ")" : "") + " : " + s.level).join("\n"),
      signals: [],
    }
  }

  if (/commande|attente|aujourd|combien|ya quoi|y a quoi|quoi de neuf|resume|résumé|brief|boutique/.test(q) && !/produit/.test(q)) {
    const head = linesOf(b).join(" ")
    const shown = (b.waiting.length ? b.waiting : b.orders).slice(0, 5)
    const last = shown.map((o) => o.ref + " · " + ORD.label(o.status) + " · " + dzd(o.total_cents)).join("\n")
    return {
      answer: head + (last ? "\n\nDernières commandes :\n" + last : ""),
      signals: [],
    }
  }

  if (/produit|prix|catalogue|article/.test(q)) {
    if (!b.products.length) return { answer: "Aucun produit actif.", signals: [] }
    return {
      answer: b.products.slice(0, 12).map((p) => p.title + " — " + dzd(p.price_cents) + (Number(p.stock) === 0 ? " — épuisé" : "")).join("\n"),
      signals: [],
    }
  }

  if (/avis/.test(q)) {
    return {
      answer: b.reviews
        ? b.reviews + " avis attendent d'être lus, dans Avis."
        : "Aucun avis en attente.",
      signals: [],
    }
  }

  if (/question client|message client|on m'a demande|on m'a demandé/.test(q)) {
    if (!b.questions.length) return { answer: "Aucune question de client pour le moment.", signals: [] }
    return {
      answer: b.questions.map((n) => n.title + " — " + (n.body || "")).join("\n"),
      signals: [],
    }
  }

  if (/que peux|aide|comment tu|que sais/.test(q)) {
    return {
      answer: "Je réponds avec ce qui est déjà dans la boutique : commandes, stock, produits, avis, historique d'un numéro, questions reçues. Si tu me dis de signaler, je pose une ligne dans la cloche. Je n'envoie pas de mail, pas de WhatsApp, et je ne publie pas le site.",
      signals: [],
    }
  }

  signals.push(signal(store.id, {
    kind: "question",
    title: "Question sans réponse",
    body: raw,
    href: "/dashboard/assistant",
  }))
  return {
    answer: "Je ne sais pas répondre à ça avec ce qui est dans la boutique. Je l'ai mis dans la cloche pour ne pas l'inventer. Je peux regarder les commandes, le stock, les produits, les avis, ou l'historique d'un numéro.",
    signals,
  }
}

const customerQuestion = (store, body) => {
  const text = clip(body && body.text, 400)
  const name = clip(body && body.name, 60) || "Un client"
  const phone = clip(body && body.phone, 20)
  if (text.length < 4) return { ok: false, error: "La question est trop courte." }
  signal(store.id, {
    kind: "question",
    title: "Question de " + name,
    body: (phone ? phone + " · " : "") + text,
    href: "/dashboard/assistant",
  })
  return { ok: true }
}

const THEME_WORDS = [
  ["soin", ["soin", "cosmet", "peau", "parfum", "beaute"]],
  ["mode", ["robe", "mode", "vetement", "pret a porter", "foulard", "fashion"]],
  ["electro", ["electro", "telephone", "high-tech", "high tech", "tech"]],
  ["audio", ["audio", "sono", "casque", "enceinte"]],
  ["bureau", ["bureau", "papeter", "carnet", "stylo"]],
  ["atelier", ["maison", "meuble", "mobilier", "deco", "decoration"]],
  ["zen", ["zen", "calme", "epure", "peu de piece"]],
  ["editorial", ["magazine", "editorial"]],
  ["mono", ["un seul produit", "une seule piece", "solo"]],
  ["galerie", ["galerie", "bijou", "photo plein"]],
  ["noir", ["fond noir", "theme noir"]],
  ["marche", ["marche", "bazar", "bonnes affaires"]],
  ["catalogue", ["grand catalogue", "catalogue"]],
  ["minimal", ["simple", "classique", "boutique simple"]],
]

const pickTheme = (q, current) => {
  for (const [id, words] of THEME_WORDS) {
    if (words.some((w) => q.includes(w)) && isTheme(id)) return id
  }
  return isTheme(current) ? current : "minimal"
}

const lookOf = (q, sectionWords, table, fallback) => {
  const hits = sectionWords.map((w) => q.indexOf(w)).filter((i) => i >= 0)
  if (!hits.length) return fallback
  const slice = hits.map((i) => q.slice(Math.max(0, i - 12), i + 48)).join(" ")
  for (const [word, value] of table) if (slice.includes(word)) return value
  return fallback
}

const block = (settings) => ({ settings })

const want = (q, words) => words.some((w) => q.includes(w))

const compose = (store, text) => {
  const raw = clip(text, 800)
  const q = fold(raw)
  if (raw.length < 8) return { ok: false, error: "Dis un peu plus ce que tu veux. Au moins une phrase." }
  const products = productsOf(store.id)
  const ids = products.map((p) => p.id).join(",")
  const theme = pickTheme(q, store.theme)
  const themeName = (THEMES.find((t) => t.id === theme) || {}).name || theme
  const append = /ajout|ajoute|en plus|rajoute/.test(q)
  const sections = []
  const used = []

  const push = (type, settings, blocks) => {
    if (sections.length >= 12) return
    if (!SECTIONS.TYPES[type] || type === "html") return
    const sec = SECTIONS.makeSection(type, settings || {}, blocks)
    sections.push(sec)
    used.push(SECTIONS.TYPES[type].name)
  }

  if (want(q, ["annonce", "promo", "bandeau"])) {
    push("banner", { text: "Livraison dans les 58 wilayas — paiement à la livraison." })
  }
  if (!want(q, ["sans banniere", "sans hero"]) && (want(q, ["banniere", "hero", "accueil", "titre"]) || !append)) {
    const quoted = raw.match(/[«"]([^»"]{3,80})[»"]/)
    push("hero", {
      heading: quoted ? quoted[1] : store.name,
      sub: store.tagline || "Choisi et livré en Algérie.",
      ctaLabel: "Voir la boutique",
      align: /droite/.test(q) ? "droite" : /gauche/.test(q) ? "gauche" : "",
      height: /grande|plein/.test(q) ? "grande" : "normale",
    })
  }
  if (want(q, ["point fort", "avantage", "rassurant", "confiance"]) || !append) {
    push("benefits", {
      heading: "Pourquoi commander ici",
      look: lookOf(q, ["point fort", "avantage"], [["carte", "cartes"], ["numero", "numeros"], ["sombre", "bandeau"], ["pastille", "pastilles"], ["colonne", "colonnes"]], "cartes"),
    }, [
      block({ icon: "camion", title: "Livraison 58 wilayas", text: "Chez vous ou au bureau" }),
      block({ icon: "paiement", title: "Paiement à la livraison", text: "Vous payez en recevant" }),
      block({ icon: "retour", title: "Échange 7 jours", text: "Si la pièce ne convient pas" }),
    ])
  }
  if (want(q, ["carrous", "defil", "slider"]) || (!want(q, ["grille", "catalogue"]) && products.length)) {
    push("carousel", { heading: "Les pièces", ids, count: Math.min(products.length || 8, 12), showPrice: true, showAdd: false })
  }
  if (want(q, ["grille", "catalogue", "tous les produit"])) {
    push("grid", { heading: "La boutique", columns: /dense|catalogue/.test(q) ? 4 : 3, count: 12 })
  }
  if (want(q, ["vedette", "un produit en avant"])) {
    push("featured", { heading: "Pièce en vedette", productId: products[0] ? products[0].id : 0 })
  }
  if (want(q, ["categor", "rayon"])) push("cats", { heading: "Rayons", style: "tiles" })
  if (want(q, ["avis", "temoignage"])) {
    push("reviews", {
      heading: "Ils ont commandé",
      look: lookOf(q, ["avis", "temoignage"], [["citation", "citation"], ["liste", "liste"], ["defil", "bandeau"], ["polar", "polaroid"], ["note", "note"], ["carte", "cartes"]], "cartes"),
      big: true,
    }, [
      block({ name: "Amina", city: "Blida", rating: 5, text: "Livraison rapide, la pièce est comme sur la photo." }),
      block({ name: "Yacine", city: "Oran", rating: 5, text: "Bien emballé, paiement à la livraison." }),
      block({ name: "Sara", city: "Alger", rating: 4, text: "Je recommande." }),
    ])
  }
  if (want(q, ["faq", "question frequente", "f&q", "foire"])) {
    push("faq", {
      heading: "Avant de commander",
      look: lookOf(q, ["faq", "question frequente", "foire"], [["sombre", "sombre"], ["carte", "cartes"], ["colonne", "colonnes"], ["liste", "liste"], ["filet", "bordee"]], "accordeon"),
    }, [
      block({ q: "Je paie comment ?", a: "À la livraison, en espèces." }),
      block({ q: "Quels sont les délais ?", a: "Selon la wilaya, en général 2 à 5 jours." }),
      block({ q: "Puis-je échanger ?", a: "Oui, sous 7 jours, article non porté." }),
    ])
  }
  if (want(q, ["livraison", "wilaya", "exped"])) push("shipping", { prefix: "Paiement à la livraison" })
  if (want(q, ["citation", "manifeste", "phrase"])) {
    push("quote", { text: store.tagline || "Nous ne vendons que ce que nous choisirions nous-mêmes.", author: store.name })
  }
  if (want(q, ["chiffre", "stat"])) push("stats", { heading: "En bref" })
  if (want(q, ["etape", "histoire"])) push("steps", { heading: "Comment ça se passe" })
  if (want(q, ["video", "youtube"])) push("video", { heading: "À voir" })
  if (want(q, ["galerie", "photos"])) push("gallery", { heading: "Galerie" })
  if (want(q, ["image + texte", "image et texte", "a propos", "notre approche"])) {
    push("media_text", { heading: "Notre approche", body: store.tagline || "" })
  }
  if (want(q, ["bloc colonne", "en 2 colonnes", "en 3 colonnes", "colonnes de texte"])) push("columns", { heading: "" })
  if (want(q, ["reseau", "instagram", "facebook", "tiktok"])) push("social", {})
  if (want(q, ["offre", "compte a rebours", "compteur"])) {
    push("offer", { heading: "Offre du jour", productId: products[0] ? products[0].id : 0 })
  }
  if (want(q, ["whatsapp"])) push("whatsapp", { text: "Une question ?" })
  if (want(q, ["espace", "separat"])) push("spacer", {})
  if (want(q, ["texte", "paragraphe"]) && !want(q, ["image + texte", "image et texte"])) {
    push("text", { heading: store.name, body: store.tagline || "" })
  }

  if (!sections.length) {
    push("hero", { heading: store.name, sub: store.tagline || "", ctaLabel: "Voir la boutique" })
    push("carousel", { heading: "Les pièces", ids, showPrice: true })
    push("shipping", {})
  }

  const design = {}
  if (/a gauche|à gauche|aligne.*gauche/.test(q)) { design.textAlign = "gauche"; design.heroAlign = "gauche" }
  if (/au centre|centr/.test(q)) { design.textAlign = "centre"; design.heroAlign = "centre" }
  if (/a droite|à droite/.test(q)) { design.textAlign = "droite"; design.heroAlign = "droite" }
  if (/etroite|étroite/.test(q)) design.containerWidth = 960
  if (/pleine largeur|largeur pleine|tres large|très large/.test(q)) design.containerWidth = 1600
  if (/titre enorme|titre énorme|tres grand titre|très grand titre/.test(q)) design.scale = 1.6
  else if (/grand titre|titre grand/.test(q)) design.scale = 1.35
  const foot = [
    ["pied sombre", "sombre"], ["pied centre", "centre"], ["pied centré", "centre"],
    ["pied magazine", "magazine"], ["pied carte", "cartes"], ["pied contact", "contact"],
    ["pied colonne", "colonnes"], ["pied en colonnes", "colonnes"],
  ]
  for (const [word, value] of foot) if (q.includes(fold(word))) design.footerStyle = value
  if (design.footerStyle && design.footerStyle !== "theme") {
    design.footerCols = [
      { title: "Boutique", links: [{ label: "Accueil", url: "" }, { label: "Nouveautés", url: "" }] },
      { title: "Aide", links: [{ label: "Livraison", url: "" }, { label: "Retours", url: "" }] },
    ]
  }

  const clean = SECTIONS.sanitize(sections)
  return {
    ok: true,
    theme,
    themeName,
    append,
    sections: clean,
    design,
    used,
    summary: "Brouillon seulement, rien n'est publié. Thème " + themeName + ". Sections : " + used.join(", ") + "."
      + (products.length && used.some((n) => /carrousel/i.test(n)) ? " Le carrousel coche les produits déjà en ligne." : "")
      + " Tu peux encore tout modifier, vider un champ, ou décocher un produit.",
  }
}

const saveDraft = (store, built) => {
  let current = {}
  try { current = store.draft ? JSON.parse(store.draft) : {} } catch (_) { current = {} }
  if (!current || typeof current !== "object") current = {}
  const prevSections = current.sections
  let sections
  if (prevSections && !Array.isArray(prevSections) && typeof prevSections === "object") {
    sections = { ...prevSections, home: built.append && Array.isArray(prevSections.home) ? prevSections.home.concat(built.sections).slice(0, 24) : built.sections }
  } else if (built.append && Array.isArray(prevSections)) {
    sections = prevSections.concat(built.sections).slice(0, 24)
  } else {
    sections = { home: built.sections }
  }
  const design = SECTIONS.sanitizeDesign({ ...(current.design || SECTIONS.readDesign(store)), ...(built.design || {}) })
  const draft = {
    design,
    sections,
    nav: current.nav || SECTIONS.readNav(store),
    theme: isTheme(built.theme) ? built.theme : (current.theme || store.theme),
  }
  db.prepare("UPDATE stores SET draft = ? WHERE id = ?").run(JSON.stringify(draft), store.id)
  return draft
}

module.exports = { brief, answer, scan, signal, customerQuestion, compose, saveDraft }
