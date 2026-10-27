"use strict"
/**
 * Réseaux sociaux du marchand.
 *
 * Le marchand saisit ses liens une fois (données « hors boutique »), puis
 * choisit dans le Design où ils s'affichent : en-tête, pied de page, les deux,
 * ou nulle part. Rien n'est codé en dur : aucune icône n'apparaît si le lien
 * n'est pas renseigné.
 */
const db = require("./db")
const { esc } = require("./ui")
const { icon } = require("./icons")

/* ------------------------------- schéma ------------------------------- */
db.exec(`CREATE TABLE IF NOT EXISTS social_links (
  id       INTEGER PRIMARY KEY AUTOINCREMENT,
  store_id INTEGER NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  network  TEXT NOT NULL,
  url      TEXT NOT NULL DEFAULT '',
  label    TEXT NOT NULL DEFAULT '',
  position INTEGER NOT NULL DEFAULT 0,
  UNIQUE(store_id, network)
)`)

/** Réseaux proposés. L'ordre est celui du formulaire. */
const NETWORKS = [
  { id: "facebook", name: "Facebook", icon: "facebook", ph: "https://facebook.com/maboutique" },
  { id: "instagram", name: "Instagram", icon: "instagram", ph: "https://instagram.com/maboutique" },
  { id: "tiktok", name: "TikTok", icon: "tiktok", ph: "https://tiktok.com/@maboutique" },
  { id: "whatsapp", name: "WhatsApp", icon: "chat", ph: "https://wa.me/213555000000" },
  { id: "youtube", name: "YouTube", icon: "youtube", ph: "https://youtube.com/@maboutique" },
  { id: "snapchat", name: "Snapchat", icon: "snapchat", ph: "https://snapchat.com/add/maboutique" },
  { id: "telegram", name: "Telegram", icon: "telegram", ph: "https://t.me/maboutique" },
  { id: "x", name: "X (Twitter)", icon: "x", ph: "https://x.com/maboutique" },
  { id: "linkedin", name: "LinkedIn", icon: "linkedin", ph: "https://linkedin.com/company/..." },
  { id: "pinterest", name: "Pinterest", icon: "pinterest", ph: "https://pinterest.com/maboutique" },
  { id: "site", name: "Autre site", icon: "external", ph: "https://mon-site.dz" },
]

const BY_ID = Object.fromEntries(NETWORKS.map((n) => [n.id, n]))

/**
 * Nettoie une adresse saisie par le marchand.
 * Tout ce qui n'est pas http(s) est refusé : javascript:, data:, etc.
 * Une adresse sans schéma (instagram.com/x) devient https://instagram.com/x.
 */
const cleanUrl = (raw) => {
  let u = String(raw || "").trim().replace(/\s+/g, "")
  if (!u) return ""
  if (/^\/\//.test(u)) u = "https:" + u
  if (!/^[a-z][a-z0-9+.-]*:/i.test(u)) u = "https://" + u
  if (!/^https?:\/\//i.test(u)) return ""
  if (u.length > 300) u = u.slice(0, 300)
  try {
    const parsed = new URL(u)
    if (!parsed.hostname || !parsed.hostname.includes(".")) return ""
    return parsed.toString().replace(/\/$/, "")
  } catch {
    return ""
  }
}

/** Libellé propre (compte @, numéro…). */
const cleanLabel = (raw) => String(raw || "").trim().slice(0, 40)

/** Liens enregistrés, dans l'ordre du formulaire. */
const list = (storeId) => {
  const rows = db.prepare("SELECT network, url, label, position FROM social_links WHERE store_id = ? ORDER BY position, id").all(storeId)
  return rows
    .filter((r) => BY_ID[r.network] && r.url)
    .map((r) => ({ ...r, name: BY_ID[r.network].name, icon: BY_ID[r.network].icon }))
}

/** Enregistre la liste complète (mise à jour + suppression des vides). */
const save = (storeId, input) => {
  const arr = Array.isArray(input) ? input : []
  const seen = new Set()
  let pos = 0
  for (const row of arr) {
    const network = String((row && row.network) || "")
    if (!BY_ID[network] || seen.has(network)) continue
    seen.add(network)
    const url = cleanUrl(row.url)
    if (!url) {
      db.prepare("DELETE FROM social_links WHERE store_id = ? AND network = ?").run(storeId, network)
      continue
    }
    db.prepare(`INSERT INTO social_links (store_id, network, url, label, position) VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(store_id, network) DO UPDATE SET url = excluded.url, label = excluded.label, position = excluded.position`)
      .run(storeId, network, url, cleanLabel(row.label), pos++)
  }
  const kept = [...seen].filter((n) => db.prepare("SELECT 1 FROM social_links WHERE store_id = ? AND network = ?").get(storeId, n))
  if (!kept.length) db.prepare("DELETE FROM social_links WHERE store_id = ?").run(storeId)
  else db.prepare(`DELETE FROM social_links WHERE store_id = ? AND network NOT IN (${kept.map(() => "?").join(",")})`).run(storeId, ...kept)
  return list(storeId)
}

const WHERE = ["aucun", "entete", "pied", "deux"]
const STYLES = ["icones", "noms"]
const SIZES = ["petit", "normal", "grand"]

/**
 * Barre de réseaux sociaux.
 * @param store  boutique (pour son id)
 * @param design réglages du design (socialWhere / socialStyle / socialSize)
 * @param place  "entete" | "pied"
 */
const bar = (store, design, place) => {
  const d = design || {}
  const where = WHERE.includes(d.socialWhere) ? d.socialWhere : "pied"
  if (where === "aucun") return ""
  if (where !== "deux" && where !== place) return ""
  const links = list(store.id)
  if (!links.length) return ""
  const style = STYLES.includes(d.socialStyle) ? d.socialStyle : "icones"
  const size = SIZES.includes(d.socialSize) ? d.socialSize : "normal"
  const px = size === "grand" ? 20 : size === "petit" ? 14 : 17
  return `<div class="ndz-social ndz-social-${place} ndz-social-${style} ndz-social-${size}">${links
    .map((l) => `<a class="ndz-soc" href="${esc(l.url)}" target="_blank" rel="noopener nofollow" title="${esc(l.label || l.name)}" aria-label="${esc(l.name)}">${icon(l.icon, px)}${style === "noms" ? `<span>${esc(l.label || l.name)}</span>` : ""}</a>`)
    .join("")}</div>`
}

module.exports = { NETWORKS, BY_ID, list, save, bar, cleanUrl, cleanLabel, WHERE, STYLES, SIZES }
