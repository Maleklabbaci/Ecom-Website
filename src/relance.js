"use strict"
/**
 * Paniers abandonnés et relances.
 *
 * Le panier vit dans la session HTTP (en mémoire) : il disparaît dès que le
 * visiteur ferme son navigateur, et on ne sait rien de lui. On en garde donc
 * une copie en base à chaque étape :
 *   - à l'ouverture du panier et du formulaire de commande
 *   - à chaque modification de quantité
 *   - quand le client tape son nom / téléphone / adresse (petit script)
 *
 * Un panier est « abandonné » quand il contient des articles, n'a pas donné
 * lieu à une commande, et n'a pas bougé depuis 45 minutes.
 *
 * Envoi des relances : AUCUNE API n'est nécessaire pour démarrer. Le module
 * fabrique un lien WhatsApp cliquable (wa.me) avec le message prérempli. Quand
 * le marchand aura une API (WhatsApp Cloud, SMS local, autre), il colle son URL
 * dans l'écran Relances et le même message part tout seul.
 */
const crypto = require("node:crypto")
const db = require("./db")
const SECRETS = require("./secrets")

db.exec(`
CREATE TABLE IF NOT EXISTS carts (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  store_id       INTEGER NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  token          TEXT NOT NULL UNIQUE,
  session_hash   TEXT DEFAULT '',
  items_json     TEXT NOT NULL DEFAULT '[]',
  subtotal_cents INTEGER NOT NULL DEFAULT 0,
  count          INTEGER NOT NULL DEFAULT 0,
  name           TEXT DEFAULT '',
  phone          TEXT DEFAULT '',
  wilaya         TEXT DEFAULT '',
  address        TEXT DEFAULT '',
  status         TEXT NOT NULL DEFAULT 'open',
  order_id       INTEGER,
  reminded_at    TEXT,
  remind_count   INTEGER NOT NULL DEFAULT 0,
  first_seen     TEXT NOT NULL DEFAULT (datetime('now')),
  last_seen      TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_carts_store ON carts(store_id, status, last_seen DESC);
CREATE UNIQUE INDEX IF NOT EXISTS idx_carts_session ON carts(store_id, session_hash);

CREATE TABLE IF NOT EXISTS messages (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  store_id    INTEGER NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  cart_id     INTEGER,
  order_id    INTEGER,
  channel     TEXT NOT NULL DEFAULT 'whatsapp',
  kind        TEXT NOT NULL DEFAULT 'panier',
  to_phone    TEXT NOT NULL DEFAULT '',
  body        TEXT NOT NULL DEFAULT '',
  status      TEXT NOT NULL DEFAULT 'pending',
  provider    TEXT NOT NULL DEFAULT 'manual',
  error       TEXT DEFAULT '',
  created_at  TEXT NOT NULL DEFAULT (datetime('now')),
  sent_at     TEXT
);
CREATE INDEX IF NOT EXISTS idx_msg_store ON messages(store_id, status, id DESC);
`)

/* configuration de relance : quelques colonnes sur la boutique */
const cols = (t) => db.prepare(`PRAGMA table_info(${t})`).all().map((c) => c.name)
const addCol = (t, n, d) => { if (!cols(t).includes(n)) db.exec(`ALTER TABLE ${t} ADD COLUMN ${n} ${d}`) }
addCol("stores", "msg_provider", "TEXT DEFAULT 'manual'")
addCol("stores", "msg_url", "TEXT DEFAULT ''")
addCol("stores", "msg_header_name", "TEXT DEFAULT 'Authorization'")
addCol("stores", "msg_header_value_enc", "TEXT DEFAULT ''")
addCol("stores", "msg_body", "TEXT DEFAULT ''")
addCol("stores", "msg_delay_minutes", "INTEGER DEFAULT 45")
addCol("stores", "msg_template_cart", "TEXT DEFAULT ''")
addCol("stores", "msg_template_order", "TEXT DEFAULT ''")

/* ------------------------------ utilitaires ------------------------------ */
const hash = (s) => crypto.createHash("sha256").update(String(s)).digest("hex").slice(0, 32)

/** Téléphone algérien au format international, pour wa.me */
const waPhone = (raw) => {
  const d = String(raw || "").replace(/\D/g, "")
  if (!d) return ""
  if (d.startsWith("213")) return d
  if (d.startsWith("0")) return "213" + d.slice(1)
  if (d.length === 9) return "213" + d
  return d
}

const DEFAULT_CART_TEMPLATE =
  "Bonjour {{nom}}, votre panier chez {{boutique}} vous attend : {{articles}} ({{total}} DZD). " +
  "Reprenez votre commande ici : {{lien}}"

const DEFAULT_ORDER_TEMPLATE = "Bonjour {{nom}}, votre commande {{ref}} chez {{boutique}} est {{statut}}. Suivi : {{lien}}"

/** Remplace {{cle}} ; laisse intacte une variable inconnue. */
const fill = (tpl, vars) =>
  String(tpl).replace(/\{\{\s*([A-Za-z0-9_]+)\s*\}\}/g, (m, k) => (vars[k] == null ? m : String(vars[k])))

/* ------------------------------ écriture ------------------------------ */
/**
 * Enregistre (ou met à jour) le panier d'une session.
 * `items` = [{ id, title, qty, price_cents }], déjà résolus par l'appelant.
 */
const touch = (store, sessionId, { items, totals, contact }) => {
  const list = Array.isArray(items) ? items : []
  if (!list.length) {
    /* panier vidé : on marque l'enregistrement, sans le supprimer (historique) */
    const row = db.prepare("SELECT * FROM carts WHERE store_id = ? AND session_hash = ?").get(store.id, hash(sessionId))
    if (row && row.status === "open") {
      db.prepare("UPDATE carts SET items_json = '[]', count = 0, subtotal_cents = 0, last_seen = datetime('now') WHERE id = ?")
        .run(row.id)
    }
    return null
  }
  const h = hash(sessionId)
  const existing = db.prepare("SELECT * FROM carts WHERE store_id = ? AND session_hash = ?").get(store.id, h)
  const payload = {
    items: list.map((i) => ({ id: i.product_id || i.id, key: i.key || String(i.id), variant: i.variant ? i.variant.id : 0, title: i.title, qty: i.qty, price_cents: i.price_cents })),
    subtotal: totals ? totals.subtotal : 0,
    count: list.reduce((a, b) => a + b.qty, 0),
  }

  if (existing) {
    db.prepare(`UPDATE carts SET items_json = ?, subtotal_cents = ?, count = ?, last_seen = datetime('now'),
                name = CASE WHEN ? != '' THEN ? ELSE name END,
                phone = CASE WHEN ? != '' THEN ? ELSE phone END,
                wilaya = CASE WHEN ? != '' THEN ? ELSE wilaya END,
                address = CASE WHEN ? != '' THEN ? ELSE address END
                WHERE id = ?`)
      .run(JSON.stringify(payload.items), payload.subtotal, payload.count,
        contact?.name || "", contact?.name || "",
        contact?.phone || "", contact?.phone || "",
        contact?.wilaya || "", contact?.wilaya || "",
        contact?.address || "", contact?.address || "",
        existing.id)
    return existing.id
  }

  const token = crypto.randomBytes(12).toString("hex")
  const info = db.prepare(`INSERT INTO carts (store_id, token, session_hash, items_json, subtotal_cents, count, name, phone, wilaya, address)
                           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .run(store.id, token, h, JSON.stringify(payload.items), payload.subtotal, payload.count,
      contact?.name || "", contact?.phone || "", contact?.wilaya || "", contact?.address || "")
  return info.lastInsertRowid
}

/** Le panier a donné lieu à une commande. */
const converted = (storeId, sessionId, orderId) => {
  db.prepare(`UPDATE carts SET status = 'converted', order_id = ?, last_seen = datetime('now')
              WHERE store_id = ? AND session_hash = ?`)
    .run(orderId, storeId, hash(sessionId))
}

/** Récupération par lien : renvoie les articles d'un panier abandonné. */
const byToken = (storeId, token) => {
  const row = db.prepare("SELECT * FROM carts WHERE store_id = ? AND token = ?").get(storeId, token)
  if (!row) return null
  try { row.items = JSON.parse(row.items_json) } catch (_) { row.items = [] }
  return row
}

/* ------------------------------ lecture ------------------------------ */
const delayOf = (store) => Math.max(5, Number(store.msg_delay_minutes) || 45)

/** Paniers à relancer : articles présents, pas convertis, inactifs depuis N minutes. */
const abandoned = (storeId, delayMinutes = 45, limit = 100) =>
  db.prepare(`SELECT * FROM carts
              WHERE store_id = ? AND status IN ('open','reminded') AND count > 0
                AND last_seen <= datetime('now', ?)
                AND (reminded_at IS NULL OR reminded_at <= datetime('now', '-24 hours'))
              ORDER BY subtotal_cents DESC, last_seen DESC LIMIT ?`)
    .all(storeId, `-${delayMinutes} minutes`, limit)

const listCarts = (storeId, status = "abandoned", limit = 100) => {
  if (status === "abandoned") return abandoned(storeId, 45, limit)
  return db.prepare(`SELECT * FROM carts WHERE store_id = ? AND status = ?
                     ORDER BY last_seen DESC LIMIT ?`).all(storeId, status, limit)
}

const stats = (storeId) => {
  const row = db.prepare(`SELECT
      SUM(CASE WHEN status IN ('open','reminded') AND count > 0 AND last_seen <= datetime('now','-45 minutes') THEN 1 ELSE 0 END) AS abandoned,
      SUM(CASE WHEN status IN ('open','reminded') AND count > 0 AND last_seen <= datetime('now','-45 minutes') THEN subtotal_cents ELSE 0 END) AS value,
      SUM(CASE WHEN status = 'converted' THEN 1 ELSE 0 END) AS converted,
      SUM(CASE WHEN status IN ('open','reminded') AND count > 0 THEN 1 ELSE 0 END) AS live
    FROM carts WHERE store_id = ?`).get(storeId) || {}
  const recovered = db.prepare(`SELECT COUNT(*) n, COALESCE(SUM(o.total_cents),0) v
    FROM carts c JOIN orders o ON o.id = c.order_id
    WHERE c.store_id = ? AND c.remind_count > 0 AND c.status = 'converted'`).get(storeId) || { n: 0, v: 0 }
  const total = (row.converted || 0) + (row.abandoned || 0)
  return {
    abandoned: row.abandoned || 0,
    value: row.value || 0,
    converted: row.converted || 0,
    live: row.live || 0,
    recoveredCount: recovered.n || 0,
    recoveredValue: recovered.v || 0,
    rate: total ? Math.round(((row.converted || 0) / total) * 100) : 0,
  }
}

/* ------------------------------ messages ------------------------------ */
const messageOf = (cart, store, template, baseUrl) => {
  const site = String(baseUrl || "").replace(/\/+$/, "")
  const articles = (() => {
    try {
      return JSON.parse(cart.items_json || "[]").map((i) => `${i.title} x${i.qty}`).join(", ")
    } catch (_) { return "" }
  })()
  return fill(template || store.msg_template_cart || DEFAULT_CART_TEMPLATE, {
    nom: cart.name ? cart.name.split(" ")[0] : "cher client",
    boutique: store.name,
    articles: articles.slice(0, 160),
    total: (cart.subtotal_cents / 100).toFixed(0),
    lien: `${site}/${store.slug}/panier/${cart.token}`,
  })
}

/**
 * Prépare la relance d'un panier : crée le message et renvoie le lien wa.me.
 * Rien n'est envoyé automatiquement ici : le marchand clique (ou branche une API).
 */
const remindCart = (store, cart, { baseUrl = "", template = "" } = {}) => {
  const body = messageOf(cart, store, template, baseUrl)
  const phone = cart.phone || ""
  const info = db.prepare(`INSERT INTO messages (store_id, cart_id, channel, kind, to_phone, body, status, provider, error)
                           VALUES (?, ?, 'whatsapp', 'panier', ?, ?, ?, ?, ?)`)
    .run(store.id, cart.id, phone, body, phone ? "pending" : "failed", store.msg_provider || "manual",
      phone ? "" : "Pas de téléphone sur ce panier. Impossible d'envoyer.")
  db.prepare("UPDATE carts SET reminded_at = datetime('now'), remind_count = remind_count + 1, status = 'reminded' WHERE id = ?")
    .run(cart.id)
  return { id: info.lastInsertRowid, body, wa: phone ? waLink(phone, body) : "", phoneMissing: !phone }
}

const waLink = (phone, text) => {
  const p = waPhone(phone)
  return p ? `https://wa.me/${p}?text=${encodeURIComponent(text)}` : ""
}

const smsLink = (phone, text) => {
  const p = String(phone || "").replace(/\D/g, "")
  return p ? `sms:${p}?body=${encodeURIComponent(text)}` : ""
}

const listMessages = (storeId, status = "", limit = 100) =>
  status
    ? db.prepare("SELECT * FROM messages WHERE store_id = ? AND status = ? ORDER BY id DESC LIMIT ?").all(storeId, status, limit)
    : db.prepare("SELECT * FROM messages WHERE store_id = ? ORDER BY id DESC LIMIT ?").all(storeId, limit)

const markSent = (id, storeId) =>
  db.prepare("UPDATE messages SET status = 'sent', sent_at = datetime('now') WHERE id = ? AND store_id = ?").run(id, storeId)

const cancelMessage = (id, storeId) =>
  db.prepare("UPDATE messages SET status = 'cancelled' WHERE id = ? AND store_id = ?").run(id, storeId)

/** Message de suivi de commande (confirmation, expédition, livraison). */
const orderMessage = (store, order, kind) => {
  const labels = {
    confirmee: "confirmée et en préparation",
    expediee: "expédiée",
    livree: "livrée",
  }
  const body = fill(store.msg_template_order || DEFAULT_ORDER_TEMPLATE, {
    nom: (order.customer_name || "").split(" ")[0] || "cher client",
    boutique: store.name,
    ref: order.ref,
    statut: labels[kind] || kind,
    lien: order.tracking ? `https://www.google.com/search?q=${encodeURIComponent(order.tracking)}` : "",
  })
  const info = db.prepare(`INSERT INTO messages (store_id, order_id, channel, kind, to_phone, body, status, provider)
                           VALUES (?, ?, 'whatsapp', ?, ?, ?, 'pending', ?)`)
    .run(store.id, order.id, kind, order.phone || "", body, store.msg_provider || "manual")
  return { id: info.lastInsertRowid, body, wa: order.phone ? waLink(order.phone, body) : "" }
}

/**
 * Envoi automatique — seulement si le marchand a configuré une API.
 * Configuration : provider 'custom', URL, en-tête éventuel, corps JSON contenant
 * {{phone}} et {{texte}}.
 */
const deliver = async (store, message) => {
  if ((store.msg_provider || "manual") === "manual") return { ok: false, manual: true }
  if (!store.msg_url) return { ok: false, error: "URL d'API absente" }

  let body = store.msg_body || '{"to":"{{phone}}","message":"{{texte}}"}'
  body = fill(body, {
    phone: waPhone(message.to_phone) ? "+" + waPhone(message.to_phone) : message.to_phone,
    texte: message.body,
    texte_brut: message.body,
  })
  let parsed = null
  try { parsed = JSON.parse(body) } catch (_) { return { ok: false, error: "Le corps JSON de l'API n'est pas valide." } }

  const headers = { "Content-Type": "application/json" }
  if (store.msg_header_name && store.msg_header_value_enc) {
    const val = SECRETS.decrypt(store.msg_header_value_enc)
    if (val) headers[store.msg_header_name] = val
  }

  try {
    const res = await fetch(store.msg_url, {
      method: "POST",
      headers,
      body: JSON.stringify(parsed),
      signal: AbortSignal.timeout(12000),
    })
    const text = (await res.text()).slice(0, 300)
    if (!res.ok) {
      db.prepare("UPDATE messages SET status = 'failed', error = ? WHERE id = ?").run(`HTTP ${res.status} ${text}`, message.id)
      return { ok: false, error: `HTTP ${res.status}` }
    }
    db.prepare("UPDATE messages SET status = 'sent', sent_at = datetime('now'), provider = 'custom' WHERE id = ?").run(message.id)
    return { ok: true }
  } catch (e) {
    db.prepare("UPDATE messages SET status = 'failed', error = ? WHERE id = ?").run(String(e.message).slice(0, 200), message.id)
    return { ok: false, error: e.message }
  }
}

/** Envoie tous les messages en attente d'une boutique (si une API est configurée). */
const flush = async (store) => {
  if ((store.msg_provider || "manual") === "manual") return { sent: 0, manual: true }
  const rows = db.prepare("SELECT * FROM messages WHERE store_id = ? AND status = 'pending' ORDER BY id LIMIT 20").all(store.id)
  let sent = 0
  for (const m of rows) {
    const r = await deliver(store, m)
    if (r.ok) sent++
  }
  return { sent, total: rows.length }
}

module.exports = {
  touch, converted, byToken, abandoned, listCarts, stats,
  remindCart, orderMessage, listMessages, markSent, cancelMessage, flush, deliver,
  waLink, smsLink, waPhone, fill, delayOf,
  DEFAULT_CART_TEMPLATE, DEFAULT_ORDER_TEMPLATE,
}
