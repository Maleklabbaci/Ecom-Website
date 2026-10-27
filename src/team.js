"use strict"
/**
 * Équipe de la boutique. Le propriétaire a tous les droits.
 * Un membre n'entre que là où une case est cochée.
 */
const crypto = require("crypto")
const db = require("./db")
const { hash } = require("./auth")

const KEYS = ["orders", "products", "design", "shop", "settings", "team"]
const LABELS = {
  orders: "Commandes",
  products: "Produits",
  design: "Design",
  shop: "Boutique",
  settings: "Réglages",
  team: "Équipe",
}
const ALL = new Set(KEYS)

const parse = (raw) => {
  let list = []
  try { list = JSON.parse(raw || "[]") } catch (_) { list = [] }
  if (!Array.isArray(list)) list = []
  return new Set(list.filter((k) => KEYS.includes(k)))
}

const fromBody = (body) => {
  const on = KEYS.filter((k) => body && (body["perm_" + k] === "1" || body["perm_" + k] === "on"))
  return JSON.stringify(on)
}

/** Quel droit protège cette adresse du tableau de bord. null = tout le monde déjà connecté à la boutique. */
const need = (path, method) => {
  const p = String(path || "")
  if (p === "/dashboard" || p === "/dashboard/") return method === "GET" ? null : "settings"
  if (p.startsWith("/dashboard/orders") || p.startsWith("/dashboard/customers")
    || p.startsWith("/dashboard/paniers") || p.startsWith("/dashboard/relances")) return "orders"
  if (p.startsWith("/dashboard/products") || p.startsWith("/dashboard/stock")
    || p.startsWith("/dashboard/categories") || p.startsWith("/dashboard/discounts")) return "products"
  if (p.startsWith("/dashboard/design") || p.startsWith("/dashboard/studio") || p.startsWith("/dashboard/pages")
    || p.startsWith("/dashboard/landings") || p.startsWith("/dashboard/formulaire")
    || p.startsWith("/dashboard/upload")) return "design"
  if (p.startsWith("/dashboard/transporteur") || p.startsWith("/dashboard/shipping")
    || p.startsWith("/dashboard/paiement") || p.startsWith("/dashboard/reseaux")
    || p.startsWith("/dashboard/marketing") || p.startsWith("/dashboard/reviews")
    || p.startsWith("/dashboard/livraison")) return "shop"
  if (p.startsWith("/dashboard/settings") || p.startsWith("/dashboard/mails")
    || p.startsWith("/dashboard/domaine")) return "settings"
  if (p.startsWith("/dashboard/utiliser-boutique")) return null
  if (p.startsWith("/dashboard/equipe")) return "team"
  if (p.startsWith("/dashboard/stats")) return "orders"
  return "settings"
}

const allows = (perms, key) => !key || (perms && (perms.has("all") || perms.has(key)))

const storesFor = (userId) =>
  db.prepare(`SELECT s.*, m.perms AS member_perms, m.id AS member_id
    FROM store_members m JOIN stores s ON s.id = m.store_id
    WHERE m.user_id = ? AND m.status = 'active'`).all(userId)

const list = (storeId) =>
  db.prepare(`SELECT m.*, u.login_name AS user_login
    FROM store_members m LEFT JOIN users u ON u.id = m.user_id
    WHERE m.store_id = ? ORDER BY m.id`).all(storeId)

/** Identifiant choisi par la personne : madame-sara, sara2001. Jamais tiré au hasard. */
const cleanLogin = (raw) => {
  const v = String(raw || "").trim().toLowerCase().replace(/\s+/g, "")
  if (v.length < 3 || v.length > 30) return ""
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(v)) return ""
  return v
}

const inviteLink = (store, permsJson, name) => {
  const token = crypto.randomBytes(18).toString("hex")
  const label = String(name || "").trim().slice(0, 60) || "Lien"
  const placeholder = `lien-${token.slice(0, 12)}@invite.local`
  db.prepare(`INSERT INTO store_members (store_id, email, name, perms, token, status)
    VALUES (?, ?, ?, ?, ?, 'invite')`)
    .run(store.id, placeholder, label, permsJson, token)
  return { ok: true, token, name: label }
}

const byToken = (token) =>
  db.prepare("SELECT m.*, s.name AS store_name, s.slug, s.owner_id FROM store_members m JOIN stores s ON s.id = m.store_id WHERE m.token = ?").get(token)

const accept = (token, { name, password, login }) => {
  const row = byToken(token)
  const fields = { name: String(name || "").slice(0, 60), login: String(login || "").trim() }
  if (!row) return { error: "Ce lien n'existe plus. Demande un nouveau lien." }
  if (row.status === "active" && row.user_id) {
    return { error: "Ce lien a déjà été utilisé. Va sur Connexion et entre ton identifiant." }
  }
  const nom = String(name || "").trim()
  const rawLogin = String(login || row.login_name || "")
  const loginName = cleanLogin(rawLogin)
  if (!nom) return { error: "Le nom est obligatoire.", fields, row }
  if (String(password || "").length < 6) {
    return { error: "Le mot de passe est trop court. Il faut 6 caractères minimum.", fields, row }
  }
  if (!loginName) {
    const shown = String(rawLogin || "").trim()
    if (!shown) return { error: "L'identifiant est obligatoire. Exemple : madame-sara ou sara2001.", fields, row }
    if (/\s/.test(shown)) return { error: "Pas d'espace dans l'identifiant. Écris madame-sara, pas madame sara.", fields, row }
    if (shown.length < 3) return { error: "Identifiant trop court. 3 caractères minimum.", fields, row }
    if (shown.length > 30) return { error: "Identifiant trop long. 30 caractères maximum.", fields, row }
    return { error: "Identifiant invalide. Lettres, chiffres et tiret seulement. Exemple : madame-sara ou sara2001.", fields, row }
  }
  if (db.prepare("SELECT 1 FROM users WHERE login_name = ?").get(loginName)) {
    return { error: `L'identifiant « ${loginName} » est déjà pris. Change-le, par exemple ${loginName}2.`, fields, row }
  }
  let info
  try {
    info = db.prepare("INSERT INTO users (email, password_hash, name, role, login_name) VALUES (?, ?, ?, 'merchant', ?)")
      .run(row.email, hash(password), nom.slice(0, 60), loginName)
  } catch (e) {
    const msg = String(e && e.message || "")
    if (/login_name|UNIQUE/i.test(msg)) {
      return { error: `L'identifiant « ${loginName} » est déjà pris. Change-le, par exemple ${loginName}2.`, fields, row }
    }
    return { error: "Impossible de créer le compte. Réessaie.", fields, row }
  }
  db.prepare("UPDATE store_members SET user_id = ?, status = 'active', name = ?, login_name = ? WHERE id = ?")
    .run(info.lastInsertRowid, nom.slice(0, 60), loginName, row.id)
  return { ok: true, userId: info.lastInsertRowid, storeId: row.store_id, loginName }
}

const updatePerms = (storeId, memberId, permsJson) => {
  db.prepare("UPDATE store_members SET perms = ? WHERE id = ? AND store_id = ?").run(permsJson, memberId, storeId)
}

const remove = (storeId, memberId) => {
  db.prepare("DELETE FROM store_members WHERE id = ? AND store_id = ?").run(memberId, storeId)
}

module.exports = {
  KEYS, LABELS, ALL, parse, fromBody, need, allows, storesFor, list, inviteLink, cleanLogin, byToken, accept, updatePerms, remove,
}
