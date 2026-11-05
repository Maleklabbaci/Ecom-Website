"use strict"
/**
 * Inventaire — gestion de stock réelle.
 *
 * Principe : on ne modifie jamais `products.stock` / `variants.stock` directement.
 * Toute variation passe par `adjust()` qui écrit une ligne dans `stock_movements`.
 * Résultat : on sait toujours POURQUOI le stock a bougé (vente, annulation,
 * remboursement, réassort, correction d'inventaire, retour client).
 */
const db = require("./db")
const VARIANTES = require("./variantes")

/* ------------------------------ schéma ------------------------------ */
db.exec(`
CREATE TABLE IF NOT EXISTS stock_movements (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  store_id   INTEGER NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  variant_id INTEGER,
  delta      INTEGER NOT NULL,
  level      INTEGER NOT NULL DEFAULT 0,
  reason     TEXT NOT NULL DEFAULT 'ajustement',
  order_id   INTEGER,
  note       TEXT DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_mov_store   ON stock_movements(store_id, id DESC);
CREATE INDEX IF NOT EXISTS idx_mov_product ON stock_movements(product_id);
`)

const cols = (t) => db.prepare(`PRAGMA table_info(${t})`).all().map((c) => c.name)
const addCol = (t, n, d) => { if (!cols(t).includes(n)) db.exec(`ALTER TABLE ${t} ADD COLUMN ${n} ${d}`) }

addCol("stores", "low_stock_threshold", "INTEGER NOT NULL DEFAULT 5")
addCol("stores", "track_stock", "INTEGER NOT NULL DEFAULT 1")
addCol("products", "sku", "TEXT DEFAULT ''")
addCol("products", "continue_selling", "INTEGER NOT NULL DEFAULT 0")
addCol("order_items", "variant_id", "INTEGER")

const REASONS = {
  vente: "Vente",
  annulation: "Annulation de commande",
  remboursement: "Remboursement",
  retour: "Retour client",
  reassort: "Réassort fournisseur",
  inventaire: "Correction d'inventaire",
  creation: "Création du produit",
}

/* ------------------------------ lecture ------------------------------ */
const levelOf = (productId, variantId) => {
  if (variantId) {
    const v = db.prepare("SELECT stock FROM variants WHERE id = ? AND product_id = ?").get(variantId, productId)
    return v ? v.stock : 0
  }
  const p = db.prepare("SELECT stock FROM products WHERE id = ?").get(productId)
  return p ? p.stock : 0
}

/** Stock disponible réel d'un produit : somme des variantes si le produit en a. */
const available = (productId, variantId) => {
  if (variantId) return levelOf(productId, variantId)
  const n = db.prepare("SELECT COUNT(*) n FROM variants WHERE product_id = ?").get(productId).n
  if (!n) return levelOf(productId, 0)
  return db.prepare("SELECT COALESCE(SUM(stock), 0) s FROM variants WHERE product_id = ?").get(productId).s
}

const threshold = (store) => Math.max(0, (store && store.low_stock_threshold) || 5)

/** Lignes du tableau de stock : un produit, puis une ligne par variante. */
const levels = (storeId) => {
  const products = db
    .prepare(`SELECT p.*, (SELECT COALESCE(SUM(oi.qty),0) FROM order_items oi
              JOIN orders o ON o.id = oi.order_id
              WHERE oi.product_id = p.id AND o.status IN ('nouvelle','confirmee','expediee')) sold
              FROM products p WHERE p.store_id = ? ORDER BY p.title COLLATE NOCASE`)
    .all(storeId)
  return products.map((p) => {
    const vars = db.prepare("SELECT * FROM variants WHERE product_id = ? ORDER BY position, id").all(p.id)
    /* Variantes liées : le stock vit dans la grille, une ligne par combinaison
       (« iphone 11 · noir », « iphone 12 · rose »…). */
    let grille = null
    try { grille = VARIANTES.lire(p.option_groups) } catch (_) { grille = null }
    if (grille && grille.groups.length) {
      const cases = grille.combos.filter((c) => c.on !== false)
      const rows = cases.map((c, i) => ({
        variantId: 0,
        combo: VARIANTES.cle(c.picks),
        label: VARIANTES.etiquette(grille, c.picks),
        stock: c.stock,
        unlimited: !!(c.unlimited || grille.unlimited),
        first: i === 0,
      }))
      return {
        ...p,
        variants: vars,
        grid: true,
        rows: rows.length ? rows : [{ variantId: 0, label: "", stock: 0 }],
        total: rows.reduce((s, r) => s + r.stock, 0),
      }
    }
    return {
      ...p,
      variants: vars,
      rows: vars.length
        ? vars.map((v) => ({ variantId: v.id, label: v.label, stock: v.stock }))
        : [{ variantId: 0, label: "", stock: p.stock }],
      total: vars.length ? vars.reduce((s, v) => s + v.stock, 0) : p.stock,
    }
  })
}

const lowStock = (storeId, min = 5) => {
  const out = []
  for (const p of levels(storeId)) {
    if (p.total <= min) out.push({ ...p, level: p.total, kind: p.total <= 0 ? "rupture" : "faible" })
    for (const v of p.variants) {
      if (v.stock <= min) out.push({ ...p, level: v.stock, variantLabel: v.label, kind: v.stock <= 0 ? "rupture" : "faible" })
    }
  }
  return out
}

const movements = (storeId, limit = 100) =>
  db
    .prepare(`SELECT m.*, p.title FROM stock_movements m LEFT JOIN products p ON p.id = m.product_id
              WHERE m.store_id = ? ORDER BY m.id DESC LIMIT ?`)
    .all(storeId, limit)

/** Valorisation du stock au prix de vente. */
const valuation = (storeId) => {
  const rows = levels(storeId)
  let cents = 0
  let units = 0
  for (const p of rows) {
    for (const r of p.rows) {
      const price = r.variantId
        ? db.prepare("SELECT price_cents FROM variants WHERE id = ?").get(r.variantId).price_cents || p.price_cents
        : p.price_cents
      cents += price * r.stock
      units += r.stock
    }
  }
  return { cents, units }
}

/* ------------------------------ écriture ------------------------------ */
const writeLevel = (productId, variantId, level) => {
  if (variantId) db.prepare("UPDATE variants SET stock = ? WHERE id = ?").run(level, variantId)
  else db.prepare("UPDATE products SET stock = ? WHERE id = ?").run(level, productId)
}

const record = (storeId, productId, variantId, delta, level, reason, orderId, note) =>
  db
    .prepare(`INSERT INTO stock_movements (store_id, product_id, variant_id, delta, level, reason, order_id, note)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?)`)
    .run(storeId, productId, variantId || null, delta, level, reason, orderId || null, note || "")

/** Applique un delta et journalise. Ne descend jamais sous 0. */
const applyDelta = (storeId, productId, variantId, delta, reason = "ajustement", opts = {}) => {
  if (!delta) return levelOf(productId, variantId)
  const before = levelOf(productId, variantId)
  const next = Math.max(0, before + delta)
  writeLevel(productId, variantId, next)
  record(storeId, productId, variantId, next - before, next, reason, opts.orderId, opts.note)
  return next
}

const adjust = (storeId, productId, variantId, delta, reason = "ajustement", opts = {}) => {
  /* Variante liée : on décale la case de la grille. */
  if (opts && opts.combo) {
    const p = db.prepare("SELECT option_groups FROM products WHERE id = ? AND store_id = ?").get(productId, storeId)
    if (!p) throw new Error("Produit introuvable")
    const d = VARIANTES.lire(p.option_groups)
    const c = VARIANTES.parCle(d, opts.combo)
    if (!c) throw new Error("Cette combinaison n'existe plus. Recharge la page.")
    return setCombo(storeId, productId, opts.combo, c.stock + (parseInt(delta, 10) || 0), reason)
  }
  return db.transaction(() => applyDelta(storeId, productId, variantId, delta, reason, opts))()
}

const setLevel = (storeId, productId, variantId, target, reason = "inventaire", opts = {}) => {
  /* Variante liée : on écrit directement dans la case de la grille. */
  if (opts && opts.combo) return setCombo(storeId, productId, opts.combo, target, reason)
  return db.transaction(() => {
    const before = levelOf(productId, variantId)
    return applyDelta(storeId, productId, variantId, target - before, reason, opts)
  })()
}

/** Écrit le stock d'UNE combinaison de la grille, et garde une trace du mouvement. */
const setCombo = (storeId, productId, combo, target, reason = "inventaire") => {
  const p = db.prepare("SELECT option_groups FROM products WHERE id = ? AND store_id = ?").get(productId, storeId)
  if (!p) throw new Error("Produit introuvable")
  const d = VARIANTES.lire(p.option_groups)
  const c = VARIANTES.parCle(d, combo)
  if (!c) throw new Error("Cette combinaison n'existe plus. Recharge la page.")
  const avant = c.stock
  const apres = Math.max(0, parseInt(target, 10) || 0)
  c.stock = apres
  db.prepare("UPDATE products SET option_groups = ? WHERE id = ?").run(JSON.stringify(d), productId)
  record(storeId, productId, null, apres - avant, apres, reason, null,
    VARIANTES.etiquette(d, c.picks))
  return apres
}

/**
 * Décrémente ATOMIQUEMENT le stock d'une commande.
 * Lève une erreur si un article n'a plus assez de stock → la transaction
 * appelante est annulée, le client voit « stock insuffisant », pas de survente.
 */
const reserve = (storeId, rows, orderId) => {
  for (const it of rows) {
    const p = db.prepare("SELECT stock, continue_selling, title FROM products WHERE id = ? AND store_id = ?")
      .get(it.productId, storeId)
    if (!p) throw new Error("Produit introuvable")
    if (p.continue_selling) continue
    const before = levelOf(it.productId, it.variantId)
    if (before < it.qty) {
      const e = new Error(`Stock insuffisant : ${p.title} (${before} disponible${before > 1 ? "s" : ""})`)
      e.code = "STOCK"
      throw e
    }
    applyDelta(storeId, it.productId, it.variantId, -it.qty, "vente", { orderId })
  }
}

/** Remet en stock tous les articles d'une commande (annulation / remboursement). */
const releaseOrder = (order, reason = "annulation") =>
  db.transaction(() => {
    if (!order) return 0
    const already = db
      .prepare("SELECT COUNT(*) n FROM stock_movements WHERE order_id = ? AND reason IN ('annulation','remboursement','retour')")
      .get(order.id).n
    if (already) return 0
    const items = db.prepare("SELECT * FROM order_items WHERE order_id = ?").all(order.id)
    let n = 0
    for (const it of items) {
      if (!it.product_id) continue
      const exists = db.prepare("SELECT id FROM products WHERE id = ?").get(it.product_id)
      if (!exists) continue
      applyDelta(order.store_id, it.product_id, it.variant_id || null, it.qty, reason, { orderId: order.id })
      n += it.qty
    }
    return n
  })()

module.exports = {
  REASONS, available, levelOf, threshold, levels, lowStock, movements, valuation,
  adjust, setLevel, setCombo, reserve, releaseOrder, record,
}
