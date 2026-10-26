"use strict"
/**
 * Fonctions boutique : catégories, variantes, galerie, livraison par wilaya,
 * recherche, avis, remises ciblées, remboursements.
 */
const fs = require("fs")
const path = require("path")
const db = require("./db")

const WILAYAS = [
  "Adrar", "Chlef", "Laghouat", "Oum El Bouaghi", "Batna", "Béjaïa", "Biskra", "Béchar", "Blida", "Bouira",
  "Tamanrasset", "Tébessa", "Tlemcen", "Tiaret", "Tizi Ouzou", "Alger", "Djelfa", "Jijel", "Sétif", "Saïda",
  "Skikda", "Sidi Bel Abbès", "Annaba", "Guelma", "Constantine", "Médéa", "Mostaganem", "M'Sila", "Mascara", "Ouargla",
  "Oran", "El Bayadh", "Illizi", "Bordj Bou Arreridj", "Boumerdès", "El Tarf", "Tindouf", "Tissemsilt", "El Oued", "Khenchela",
  "Souk Ahras", "Tipaza", "Mila", "Aïn Defla", "Naâma", "Aïn Témouchent", "Ghardaïa", "Relizane", "Timimoun",
  "Bordj Badji Mokhtar", "Ouled Djellal", "Béni Abbès", "In Salah", "In Guezzam", "Touggourt", "Djanet", "El M'Ghair", "El Meniaa",
]

const slugify = (t) =>
  String(t || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60)

/* ------------------------------ catégories ------------------------------ */
const categories = (storeId) =>
  db
    .prepare(`SELECT c.*, (SELECT COUNT(*) FROM products p WHERE p.category_id = c.id AND p.active = 1) n
              FROM categories c WHERE c.store_id = ? ORDER BY c.position, c.id`)
    .all(storeId)

const categoryBySlug = (storeId, slug) =>
  db.prepare("SELECT * FROM categories WHERE store_id = ? AND slug = ?").get(storeId, slug)

/* ------------------------------ images / variantes ------------------------------ */
const images = (productId) =>
  db.prepare("SELECT * FROM product_images WHERE product_id = ? ORDER BY position, id").all(productId)
    .filter((row) => {
      const url = String(row.url || "")
      if (!url.startsWith("/") || url.includes("..")) return !!url
      return fs.existsSync(path.join(__dirname, "..", "public", url.slice(1)))
    })

const variants = (productId) =>
  db.prepare("SELECT * FROM variants WHERE product_id = ? ORDER BY position, id").all(productId)

const variantById = (id) => db.prepare("SELECT * FROM variants WHERE id = ?").get(id)

/* ------------------------------ avis ------------------------------ */
const reviews = (productId, approvedOnly = true) =>
  db
    .prepare(`SELECT * FROM reviews WHERE product_id = ? ${approvedOnly ? "AND approved = 1" : ""} ORDER BY id DESC`)
    .all(productId)

const rating = (productId) => {
  const r = db.prepare("SELECT AVG(rating) avg, COUNT(*) n FROM reviews WHERE product_id = ? AND approved = 1").get(productId)
  return { avg: r.avg || 0, count: r.n || 0 }
}

/* ------------------------------ livraison ------------------------------ */
/**
 * Deux façons de livrer, comme sur le terrain en Algérie :
 *   - « home » : à domicile, le livreur vient à l'adresse ;
 *   - « desk » : au bureau / stop desk, le client retire dans l'agence de sa wilaya.
 * Chaque wilaya a donc deux tarifs. `desk_cents = 0` → même prix que le domicile.
 */
const colsOf = (t) => db.prepare(`PRAGMA table_info(${t})`).all().map((c) => c.name)
const addCol = (t, n, d) => { if (!colsOf(t).includes(n)) db.exec(`ALTER TABLE ${t} ADD COLUMN ${n} ${d}`) }

addCol("shipping_rates", "desk_cents", "INTEGER NOT NULL DEFAULT 0")
addCol("stores", "ship_home", "INTEGER NOT NULL DEFAULT 1")
addCol("stores", "ship_desk", "INTEGER NOT NULL DEFAULT 1")
addCol("orders", "delivery_type", "TEXT DEFAULT 'home'")
addCol("orders", "commune", "TEXT DEFAULT ''")
addCol("shipping_rates", "eta_min", "INTEGER NOT NULL DEFAULT 2")
addCol("shipping_rates", "eta_max", "INTEGER NOT NULL DEFAULT 4")
addCol("stores", "lang_mode", "TEXT DEFAULT 'both'")
addCol("stores", "eta_min", "INTEGER NOT NULL DEFAULT 2")
addCol("stores", "eta_max", "INTEGER NOT NULL DEFAULT 4")
addCol("orders", "desk_name", "TEXT DEFAULT ''")

const DESK_DISCOUNT = 10000 /* au bureau : 100 DZD moins cher par défaut */

const shippingTable = (storeId) => {
  const rows = db.prepare("SELECT * FROM shipping_rates WHERE store_id = ?").all(storeId)
  const map = {}
  rows.forEach((r) => {
    map[r.wilaya] = {
      home: r.cents,
      desk: r.desk_cents > 0 ? r.desk_cents : r.cents,
      etaMin: r.eta_min,
      etaMax: r.eta_max,
    }
  })
  return map
}

/** Tarif pour une wilaya et un type de livraison. */
const shippingFor = (storeId, wilaya, type = "home", fallback = 50000) => {
  const row = db.prepare("SELECT cents, desk_cents FROM shipping_rates WHERE store_id = ? AND wilaya = ?").get(storeId, wilaya)
  if (!row) return type === "desk" ? Math.max(0, fallback - DESK_DISCOUNT) : fallback
  if (type === "desk") return row.desk_cents > 0 ? row.desk_cents : row.cents
  return row.cents
}

/** Délai annoncé au client : {min, max} en jours pour cette wilaya. */
const etaFor = (storeId, wilaya, store) => {
  const row = db.prepare("SELECT eta_min, eta_max FROM shipping_rates WHERE store_id = ? AND wilaya = ?").get(storeId, wilaya)
  const min = row && row.eta_min != null ? row.eta_min : (store && store.eta_min) || 2
  const max = row && row.eta_max != null ? row.eta_max : (store && store.eta_max) || 4
  return { min, max }
}

/** Types proposés par la boutique. */
const deliveryTypes = (store) => {
  const out = []
  if (!store || Number(store.ship_home) !== 0) out.push({ id: "home", name: "À domicile", hint: "Le livreur vient à l'adresse indiquée." })
  if (!store || Number(store.ship_desk) !== 0) out.push({ id: "desk", name: "Au bureau", hint: "Vous retirez le colis dans l'agence de votre wilaya." })
  return out
}

const ensureShipping = (storeId, fallback = 50000) => {
  const existing = db.prepare("SELECT COUNT(*) n FROM shipping_rates WHERE store_id = ?").get(storeId).n
  if (!existing) {
    const ins = db.prepare("INSERT OR IGNORE INTO shipping_rates (store_id, wilaya, cents, desk_cents) VALUES (?, ?, ?, ?)")
    WILAYAS.forEach((w) => ins.run(storeId, w, fallback, Math.max(0, fallback - DESK_DISCOUNT)))
    return
  }
  /* boutiques créées avant cette évolution : le tarif bureau n'existe pas encore */
  const missing = db.prepare("SELECT wilaya, cents FROM shipping_rates WHERE store_id = ? AND desk_cents = 0").all(storeId)
  const upd = db.prepare("UPDATE shipping_rates SET desk_cents = ? WHERE store_id = ? AND wilaya = ?")
  missing.forEach((r) => upd.run(Math.max(0, r.cents - DESK_DISCOUNT), storeId, r.wilaya))
}

/* ------------------------------ remises ------------------------------ */
/**
 * items: [{product_id, unit_cents, qty}]
 * Une remise peut viser un seul produit (discounts.product_id).
 */
const applyPromo = (store, code, items, subtotal) => {
  if (!code) return { discount: 0, promo: null }
  const d = db
    .prepare("SELECT * FROM discounts WHERE store_id = ? AND code = ? AND active = 1")
    .get(store.id, String(code).toUpperCase())
  if (!d) return { discount: 0, promo: null, error: "inconnu" }
  if (d.max_uses && d.uses >= d.max_uses) return { discount: 0, promo: null, error: "epuise" }

  let base = subtotal
  if (d.product_id) {
    base = items.filter((i) => Number(i.product_id) === Number(d.product_id)).reduce((s, i) => s + i.unit_cents * i.qty, 0)
    if (!base) return { discount: 0, promo: null, error: "produits" }
  }
  if (subtotal < d.min_subtotal_cents) return { discount: 0, promo: null, error: "minimum" }

  const discount = d.kind === "percent" ? Math.round((base * d.value) / 100) : Math.min(base, d.value * 100)
  return { discount, promo: { id: d.id, code: d.code, kind: d.kind, value: d.value, product_id: d.product_id } }
}

/* ------------------------------ recherche / filtres ------------------------------ */
const searchProducts = (storeId, { q, cat, sort, includeHidden = false } = {}) => {
  let sql = "SELECT p.* FROM products p WHERE p.store_id = ?"
  const args = [storeId]
  if (!includeHidden) sql += " AND p.active = 1"
  if (q) {
    sql += " AND (LOWER(p.title) LIKE ? OR LOWER(p.description) LIKE ?)"
    const like = "%" + String(q).toLowerCase() + "%"
    args.push(like, like)
  }
  if (cat) {
    sql += " AND p.category_id = (SELECT id FROM categories WHERE store_id = ? AND slug = ?)"
    args.push(storeId, cat)
  }
  if (sort === "prix-asc") sql += " ORDER BY p.price_cents ASC"
  else if (sort === "prix-desc") sql += " ORDER BY p.price_cents DESC"
  else if (sort === "nom") sql += " ORDER BY p.title COLLATE NOCASE ASC"
  else sql += " ORDER BY p.id DESC"
  const rows = db.prepare(sql).all(...args)

  /* Deuxième chance sans les accents : « telephone » doit trouver « Téléphone ».
     On ne le fait que si la recherche SQL n'a rien donné, pour rester rapide. */
  if (q && !rows.length) {
    const plain = (v) => String(v || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase()
    const needle = plain(q)
    if (needle) {
      return db.prepare("SELECT * FROM products WHERE store_id = ? AND active = 1 ORDER BY id DESC").all(storeId)
        .filter((p) => plain(p.title).includes(needle) || plain(p.description).includes(needle))
    }
  }
  return rows
}

/* ------------------------------ remboursement ------------------------------ */
const refundOrder = (order) => {
  if (!order) return false
  /* le remboursement d'argent est ici ; la remise en stock est faite par src/inventory.js
     (INV.releaseOrder) qui gère aussi les variantes et journalise le mouvement. */
  db.prepare("UPDATE orders SET status = 'remboursee', refunded_cents = total_cents WHERE id = ?").run(order.id)
  return true
}

module.exports = {
  WILAYAS, DESK_DISCOUNT, deliveryTypes, slugify, categories, categoryBySlug, images, variants, variantById,
  reviews, rating, shippingTable, shippingFor, ensureShipping, etaFor,
  applyPromo, searchProducts, refundOrder,
}
