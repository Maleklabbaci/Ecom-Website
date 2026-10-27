"use strict"
/**
 * Suivi des commandes (lot 40).
 *
 * Trois choses, et rien d'autre :
 *   1. les statuts — un identifiant stable par état, plus les anciens libellés accentués ;
 *   2. les relances — « injoignable » compte les appels sans réponse (3 = on arrête) ;
 *   3. l'attribution — d'où vient la commande (Facebook, TikTok, Google…),
 *      avec la campagne, l'identifiant de clic et la page d'arrivée.
 *
 * Aucune dépendance : que du SQL préparé et des fonctions pures.
 */
const db = require("./db")

const MAX_ATTEMPTS = 3

/** Les états d'une commande, dans l'ordre où ils arrivent dans la vraie vie. */
const STATUSES = [
  { id: "nouvelle", label: "En attente", tone: "wait", icon: "hourglass", desc: "Reçue, pas encore appelée" },
  { id: "confirmee", label: "Confirmée", tone: "ok", icon: "check", desc: "Client joint, commande validée" },
  { id: "reportee", label: "Reportée", tone: "info", icon: "clock", desc: "Le client rappelle plus tard" },
  { id: "injoignable", label: "Injoignable", tone: "warn", icon: "phoneOff", desc: "3 appels sans réponse" },
  { id: "annulee", label: "Annulée", tone: "danger", icon: "x", desc: "Le stock repart en vente" },
  { id: "expediee", label: "Expédiée", tone: "info", icon: "truck", desc: "Confiée au transporteur" },
  { id: "livree", label: "Livrée", tone: "ok", icon: "box", desc: "Colis remis au client" },
  { id: "retour", label: "Retour", tone: "warn", icon: "refresh", desc: "Le colis est revenu" },
  { id: "perdue", label: "Colis perdu", tone: "danger", icon: "search", desc: "Perdu pendant le transport — à renvoyer ou rembourser" },
  { id: "remboursee", label: "Remboursée", tone: "muted", icon: "refresh", desc: "Argent rendu au client" },
  { id: "a_verifier", label: "À vérifier", tone: "warn", icon: "shield", desc: "Le contrôle automatique a un doute" },
]

/** Anciens libellés (accentués ou hérités) → identifiant stable. */
const LEGACY = {
  "confirmée": "confirmee", "annulée": "annulee", "expédiée": "expediee", "livrée": "livree",
  "remboursée": "remboursee", "reportée": "reportee", "à vérifier": "a_verifier",
  "en attente": "nouvelle", "annule": "annulee", "confirme": "confirmee",
  "expedie": "expediee", "livre": "livree", "retour": "retour", "retournée": "retour", "returned": "retour",
  "perdu": "perdue", "colis perdu": "perdue", "lost": "perdue", "égaré": "perdue", "egare": "perdue",
}

/** Statut normalisé : accepte n'importe quel libellé reçu d'un formulaire. */
const norm = (status) => {
  const raw = String(status || "").trim().toLowerCase()
  if (!raw) return "nouvelle"
  const id = LEGACY[raw] || raw
  return STATUSES.some((s) => s.id === id) ? id : "nouvelle"
}

const meta = (status) => STATUSES.find((s) => s.id === norm(status)) || STATUSES[0]
const label = (status) => meta(status).label
const tone = (status) => meta(status).tone

/** Message WhatsApp déjà écrit, selon le statut. Rien n'est envoyé tout seul. */
const waText = (order) => {
  const name = String(order.customer_name || "").trim() || "Bonjour"
  const ref = order.ref || ""
  const total = `${Math.round(Number(order.total_cents || 0) / 100)} DZD`
  const who = String(order.carrier_name || "").trim()
  const track = order.tracking
    ? ` Numéro de suivi${who ? " " + who : ""} : ${order.tracking}.`
    : ""
  const hello = `Bonjour ${name},`
  switch (norm(order.status)) {
    case "confirmee":
      return `${hello} votre commande ${ref} est confirmée. Préparez ${total} en espèces à la livraison.`
    case "expediee":
      return `${hello} votre commande ${ref} est expédiée.${track}`
    case "livree":
      return `${hello} votre commande ${ref} est livrée. Merci.`
    case "reportee":
      return `${hello} votre commande ${ref} est reportée. Dites-nous quand vous êtes disponible.`
    case "injoignable":
      return `${hello} nous n'avons pas réussi à vous joindre pour la commande ${ref}.`
    case "annulee":
      return `${hello} votre commande ${ref} est annulée.`
    case "retour":
      return `${hello} le colis de la commande ${ref} est revenu.`
    case "perdue":
      return `${hello} mauvaise nouvelle : le colis de la commande ${ref} semble perdu pendant le transport. On vous le renvoie ou on vous rembourse — dites-nous ce que vous préférez.`
    case "remboursee":
      return `${hello} votre commande ${ref} est remboursée.`
    default:
      return `${hello} nous vous contactons pour confirmer la commande ${ref} (${total}).`
  }
}

/** Vrai si la commande compte dans l'argent (ni test, ni annulée, ni retour, ni colis perdu). */
const counts = (order) => !order.fake && !["annulee", "retour", "perdue"].includes(norm(order.status))

/* ------------------------------------------------------------------------- */
/* Attribution : d'où vient le visiteur, donc la commande.                    */
/* ------------------------------------------------------------------------- */

const CLICK_KEYS = [
  ["fbclid", "Facebook"], ["ttclid", "TikTok"], ["gclid", "Google"], ["wbraid", "Google"],
  ["gbraid", "Google"], ["sc_click_id", "Snapchat"], ["scclid", "Snapchat"], ["twclid", "X"],
]

const SOURCE_LABEL = {
  facebook: "Facebook", instagram: "Instagram", meta: "Meta", tiktok: "TikTok",
  google: "Google", snapchat: "Snapchat", x: "X", twitter: "X", youtube: "YouTube",
  whatsapp: "WhatsApp", telegram: "Telegram", pinterest: "Pinterest",
  email: "E-mail", referral: "Un autre site", organic: "Sans publicité", direct: "Sans publicité", qr: "QR code",
}

const SOURCE_ICON = {
  facebook: "facebook", instagram: "instagram", meta: "facebook", tiktok: "tiktok",
  google: "search", snapchat: "snapchat", x: "x", twitter: "x", youtube: "youtube",
  whatsapp: "whatsapp", telegram: "telegram", pinterest: "pinterest",
  email: "chat", referral: "external", organic: "search", direct: "globe", qr: "grid",
}

/** Deduit la plateforme : utm_source d'abord, puis le clic publicitaire, puis le referent. */
const guessSource = (utmSource, clickKind, referrer) => {
  const u = String(utmSource || "").toLowerCase()
  if (u) {
    if (/instagram|^ig$/.test(u)) return "instagram"
    if (/facebook|^fb$|^meta$/.test(u)) return "facebook"
    if (/tiktok|^tt$/.test(u)) return "tiktok"
    if (/google|adwords|gads/.test(u)) return "google"
    if (/snap/.test(u)) return "snapchat"
    if (/youtube/.test(u)) return "youtube"
    if (/whatsapp|wa/.test(u)) return "whatsapp"
    if (/telegram|tg/.test(u)) return "telegram"
    if (/newsletter|email|mail/.test(u)) return "email"
    return u.replace(/[^a-z0-9_-]/g, "").slice(0, 20)
  }
  const c = String(clickKind || "").toLowerCase()
  if (c === "fbclid") return "facebook"
  if (c === "ttclid") return "tiktok"
  if (c === "gclid" || c === "wbraid" || c === "gbraid") return "google"
  if (c === "sc_click_id" || c === "scclid") return "snapchat"
  const r = String(referrer || "").toLowerCase()
  /* aucune trace de provenance (ni pub, ni lien, ni moteur) : on classe en organique */
  if (!r) return "organic"
  if (/instagram\./.test(r)) return "instagram"
  if (/facebook\.|fb\./.test(r)) return "facebook"
  if (/tiktok\./.test(r)) return "tiktok"
  if (/google\./.test(r)) return "google"
  if (/youtube\./.test(r)) return "youtube"
  if (/snapchat\./.test(r)) return "snapchat"
  if (/wa\.me|whatsapp\./.test(r)) return "whatsapp"
  /* un lien venu d'ailleurs (blog, annuaire, navigation interne) : pas une plateforme connue → organique.
     L'adresse d'origine reste visible dans le détail de la commande. */
  return "organic"
}

/** Une seule vérité : pas de plateforme identifiée = organique.
    Les anciennes valeurs « direct » et « referral » sont rangées ici aussi. */
const normSource = (src) => {
  const k = String(src || "").trim().toLowerCase()
  if (!k || k === "direct" || k === "referral" || k === "inconnu") return "organic"
  return k
}

const sourceLabel = (src) => SOURCE_LABEL[normSource(src)] || "Autre"
const sourceIcon = (src) => SOURCE_ICON[normSource(src)] || "globe"

/** Appareil, lu dans l'en-tête User-Agent (aucune librairie). */
const deviceOf = (ua) => {
  const s = String(ua || "")
  if (/iPad|Tablet|PlayBook|Silk/i.test(s)) return "tablet"
  if (/Mobi|Android|iPhone|iPod/i.test(s)) return "mobile"
  return "desktop"
}
const DEVICE_LABEL = { mobile: "Mobile", tablet: "Tablette", desktop: "Ordinateur" }
const DEVICE_ICON = { mobile: "smartphone", tablet: "tablet", desktop: "monitor" }

const COOKIE = "ndz_attr"

/** Lecture des paramètres d'arrivée (utm, clic publicitaire). */
const readParams = (query = {}) => {
  const utm = {}
  for (const k of ["utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term"]) {
    utm[k] = String(query[k] || "").slice(0, 120)
  }
  let clickId = ""
  let clickKind = ""
  for (const [key, platform] of CLICK_KEYS) {
    if (query[key]) { clickId = String(query[key]).slice(0, 200); clickKind = key; utm.platform = platform; break }
  }
  /* un clic publicitaire vaut un utm_source : Meta et TikTok n'en mettent pas toujours */
  if (!utm.utm_source && clickKind) utm.utm_source = String(utm.platform || "").toLowerCase()
  delete utm.platform
  return { ...utm, click_id: clickId, click_kind: clickKind }
}

/** Middleware : garde la première arrivée (cookie 60 jours), sans jamais écraser. */
const track = (req, res, next) => {
  try {
    if (req.method !== "GET") return next()
    const already = req.cookies && req.cookies[COOKIE]
    const p = readParams(req.query)
    const hasMark = p.utm_source || p.utm_medium || p.utm_campaign || p.click_id
    const referrer = String(req.get("referer") || "").slice(0, 300)
    if (already || (!hasMark && !referrer)) return next()
    const data = {
      ...p,
      landing: String(req.originalUrl || req.url || "").split("?")[0].slice(0, 200),
      referrer,
      device: deviceOf(req.get("user-agent")),
      at: new Date().toISOString(),
    }
    res.cookie(COOKIE, JSON.stringify(data).slice(0, 900), {
      maxAge: 60 * 24 * 3600 * 1000, httpOnly: true, sameSite: "lax", path: "/",
    })
  } catch (e) { /* le suivi ne doit jamais casser une visite */ }
  next()
}

/** Ce qui sera écrit sur la commande au moment du paiement. */
const attribution = (req) => {
  let data = {}
  try { data = JSON.parse((req.cookies && req.cookies[COOKIE]) || "{}") } catch (e) { data = {} }
  const p = readParams(req.query || {})
  const merged = {
    source: "",
    utm_source: p.utm_source || data.utm_source || "",
    utm_medium: p.utm_medium || data.utm_medium || "",
    utm_campaign: p.utm_campaign || data.utm_campaign || "",
    utm_content: p.utm_content || data.utm_content || "",
    utm_term: p.utm_term || data.utm_term || "",
    click_id: p.click_id || data.click_id || "",
    click_kind: p.click_kind || data.click_kind || "",
    landing: data.landing || "",
    referrer: data.referrer || String(req.get("referer") || "").slice(0, 300),
    device: data.device || deviceOf(req.get("user-agent")),
  }
  merged.source = guessSource(merged.utm_source, merged.click_kind, merged.referrer)
  /* toute provenance inconnue est rangée dans « Organique » */
  if (!merged.source) merged.source = "organic"
  return merged
}

/* ------------------------------------------------------------------------- */
/* Historique et actions                                                     */
/* ------------------------------------------------------------------------- */

const log = (storeId, orderId, kind, labelText, detail = "") => {
  try {
    db.prepare("INSERT INTO order_events (store_id, order_id, kind, label, detail) VALUES (?, ?, ?, ?, ?)")
      .run(storeId, orderId, kind, String(labelText).slice(0, 80), String(detail).slice(0, 300))
  } catch (e) { /* l'historique ne bloque jamais l'action */ }
}

const events = (orderId) =>
  db.prepare("SELECT * FROM order_events WHERE order_id = ? ORDER BY id DESC").all(orderId)

/** Change le statut, journalise, et remet le stock en vente si on annule. */
const setStatus = (order, next, who = "") => {
  const to = norm(next)
  if (to === norm(order.status)) return to
  db.prepare("UPDATE orders SET status = ? WHERE id = ?").run(to, order.id)
  log(order.store_id, order.id, "status", label(to), who ? `par ${who}` : "")
  try {
    const fresh = db.prepare("SELECT * FROM orders WHERE id = ?").get(order.id)
    require("./mail").onStatus(fresh, to)
  } catch (_) { /* un e-mail ne doit jamais bloquer le statut */ }
  if ((to === "annulee" || to === "retour") && !["annulee", "retour"].includes(norm(order.status))) {
    try { require("./inventory").releaseOrder(order, to === "retour" ? "retour" : "annulation") } catch (e) { /* stock déjà rendu */ }
  }
  return to
}

/**
 * Un appel resté sans réponse. Au 3e, la commande passe « injoignable ».
 * Retourne { attempts, status, final }.
 */
const attempt = (order, who = "") => {
  const n = Math.min(MAX_ATTEMPTS, Number(order.attempts || 0) + 1)
  const final = n >= MAX_ATTEMPTS
  const status = final ? "injoignable" : norm(order.status)
  db.prepare("UPDATE orders SET attempts = ?, last_attempt_at = datetime('now'), status = ? WHERE id = ?")
    .run(n, status, order.id)
  log(order.store_id, order.id, "attempt", `Appel ${n}/${MAX_ATTEMPTS} sans réponse`,
    final ? "3e tentative : commande marquée injoignable" : who ? `par ${who}` : "")
  return { attempts: n, status, final }
}

/** Commande de test : sortie des chiffres, sans la supprimer. */
const setFake = (order, fake) => {
  const v = fake ? 1 : 0
  db.prepare("UPDATE orders SET fake = ? WHERE id = ?").run(v, order.id)
  log(order.store_id, order.id, "fake", v ? "Marquée comme commande de test" : "N'est plus une commande de test")
  return v
}

/** Compteurs de la barre de filtres. */
const tally = (orders) => {
  const out = { total: 0, fake: 0, ca: 0, real: 0 }
  for (const s of STATUSES) out[s.id] = 0
  for (const o of orders) {
    out.total++
    if (o.fake) { out.fake++; continue }
    out.real++
    out[norm(o.status)] = (out[norm(o.status)] || 0) + 1
    if (counts(o)) out.ca += Number(o.total_cents || 0)
  }
  return out
}

/** Lignes « d'où vient cette commande », prêtes à afficher. */
const trackingRows = (order) => {
  const rows = []
  const src = normSource(order.source || guessSource(order.utm_source, order.click_kind, order.referrer))
  rows.push({ icon: sourceIcon(src), label: "Plateforme", value: sourceLabel(src), strong: true })
  if (order.utm_campaign) rows.push({ icon: "target", label: "Campagne", value: order.utm_campaign })
  if (order.utm_content) rows.push({ icon: "layers", label: "Créatif / annonce", value: order.utm_content })
  if (order.utm_medium) rows.push({ icon: "nav", label: "Support", value: order.utm_medium })
  if (order.utm_term) rows.push({ icon: "type", label: "Mot-clé", value: order.utm_term })
  if (order.click_id) rows.push({ icon: "link", label: `Identifiant de clic (${order.click_kind || "clic"})`, value: order.click_id })
  if (order.landing) rows.push({ icon: "globe", label: "Page d'arrivée", value: order.landing })
  if (order.referrer) rows.push({ icon: "external", label: "Page d'origine", value: order.referrer })
  rows.push({ icon: DEVICE_ICON[order.device] || "monitor", label: "Appareil", value: DEVICE_LABEL[order.device] || "Inconnu" })
  return rows
}

module.exports = {
  MAX_ATTEMPTS, STATUSES, COOKIE,
  norm, meta, label, tone, waText, counts, tally, normSource,
  guessSource, sourceLabel, sourceIcon, deviceOf, readParams,
  track, attribution, log, events, setStatus, attempt, setFake, trackingRows,
  SOURCE_LABEL, DEVICE_LABEL,
}
