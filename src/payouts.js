"use strict"
/**
 * Reversements des transporteurs.
 *
 * Le transporteur encaisse le colis à la livraison, garde les frais de
 * livraison, puis reverse le reste — souvent une fois par semaine.
 * Entre l'encaissement et le virement, il y a un trou : personne ne sait
 * combien la société doit vraiment.
 *
 * Ici, chaque commande livrée dit ce qui doit rentrer :
 *   à recevoir = total payé par le client − frais de livraison (gardés par le transporteur)
 * Quand le transporteur verse, le montant est réparti sur les plus
 * anciennes commandes non réglées (premier arrivé, premier payé). Un
 * versement incomplet laisse la commande à moitié réglée : le reste
 * s'affiche comme dette jusqu'au versement suivant.
 *
 * Aucune donnée n'est inventée : si le vendeur n'a pas coché de
 * transporteur sur une commande, elle n'entre pas dans le calcul.
 */
const db = require("./db")
/* le module des transporteurs crée sa table ; on le charge pour être sûr
   qu'elle existe, même si cet écran est le premier ouvert. */
require("./carriers")

const cols = (t) => db.prepare(`PRAGMA table_info(${t})`).all().map((c) => c.name)
const addCol = (t, n, d) => { if (!cols(t).includes(n)) db.exec(`ALTER TABLE ${t} ADD COLUMN ${n} ${d}`) }

db.exec(`
CREATE TABLE IF NOT EXISTS carrier_payouts (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  store_id      INTEGER NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  carrier_id    INTEGER NOT NULL REFERENCES carriers(id) ON DELETE CASCADE,
  day           TEXT NOT NULL,
  cents         INTEGER NOT NULL DEFAULT 0,
  covered_cents INTEGER NOT NULL DEFAULT 0,
  note          TEXT DEFAULT '',
  created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_payout_store ON carrier_payouts(store_id, day DESC);
CREATE TABLE IF NOT EXISTS carrier_payout_lines (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  payout_id  INTEGER NOT NULL REFERENCES carrier_payouts(id) ON DELETE CASCADE,
  order_id   INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  cents      INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_payout_lines ON carrier_payout_lines(payout_id);
CREATE INDEX IF NOT EXISTS idx_payout_order ON carrier_payout_lines(order_id);
`)

/* une commande est « réglée » quand le transporteur a versé sa part entière */
addCol("orders", "settled_at", "TEXT")

const today = () => new Date().toISOString().slice(0, 10)
const dayOk = (v) => (/^\d{4}-\d{2}-\d{2}$/.test(String(v || "")) ? String(v) : today())

/** Part que le transporteur doit reverser pour une commande livrée. */
const receivable = (o) =>
  Math.max(0, (Number(o.total_cents) || 0) - (Number(o.shipping_cents) || 0))

/** Ce qui a déjà été versé sur une commande. */
const paidOn = (orderId) => {
  const r = db.prepare("SELECT COALESCE(SUM(cents), 0) AS c FROM carrier_payout_lines WHERE order_id = ?").get(orderId)
  return r ? r.c : 0
}

/**
 * Les commandes livrées d'un transporteur, du plus ancien au plus récent,
 * avec ce qui a déjà été versé (`paid`) et ce qui manque (`left`).
 */
const openOrders = (storeId, carrierId) => {
  const rows = db.prepare(`
    SELECT id, ref, customer_name, phone, wilaya, total_cents, shipping_cents, created_at, carrier_id, settled_at
    FROM orders
    WHERE store_id = ? AND carrier_id = ? AND status = 'livree' AND COALESCE(fake, 0) = 0
    ORDER BY id`).all(storeId, carrierId)
  return rows.map((o) => {
    const due = receivable(o)
    const paid = paidOn(o.id)
    return { ...o, due, paid, left: Math.max(0, due - paid) }
  })
}

/** Ce que chaque transporteur doit encore, et ce qu'il a déjà versé. */
const dueByCarrier = (storeId) => {
  const carriers = db.prepare(`
    SELECT id, label, preset FROM carriers WHERE store_id = ? ORDER BY label`).all(storeId)
  const out = []
  for (const c of carriers) {
    const rows = openOrders(storeId, c.id)
    const due = rows.reduce((a, o) => a + o.left, 0)
    const paid = db.prepare(`SELECT COALESCE(SUM(cents), 0) AS c, COUNT(*) AS n
      FROM carrier_payouts WHERE store_id = ? AND carrier_id = ?`).get(storeId, c.id)
    const last = db.prepare(`SELECT day FROM carrier_payouts WHERE store_id = ? AND carrier_id = ?
      ORDER BY day DESC, id DESC LIMIT 1`).get(storeId, c.id)
    out.push({
      id: c.id, label: c.label, preset: c.preset,
      orders: rows.filter((o) => o.left > 0).length, count: rows.length,
      due, received: paid.c, payouts: paid.n,
      lastDay: last ? last.day : "",
      rows,
    })
  }
  return out
}

/** Total dû, tous transporteurs confondus. */
const dueTotal = (storeId) => dueByCarrier(storeId).reduce((a, c) => a + c.due, 0)

/** Historique des versements reçus, du plus récent au plus ancien. */
const list = (storeId, limit = 60) => db.prepare(`
  SELECT p.*, c.label AS carrier_label
  FROM carrier_payouts p JOIN carriers c ON c.id = p.carrier_id
  WHERE p.store_id = ? ORDER BY p.day DESC, p.id DESC LIMIT ?`).all(storeId, limit)

/**
 * Enregistre un versement : le montant est réparti sur les plus anciennes
 * commandes livrées non réglées. Un versement partiel laisse le reste dû.
 */
const record = (storeId, { carrier_id, day, cents, note } = {}) => {
  const carrierId = parseInt(carrier_id, 10) || 0
  const carrier = carrierId
    ? db.prepare("SELECT id FROM carriers WHERE id = ? AND store_id = ?").get(carrierId, storeId)
    : null
  if (!carrier) return { ok: false, error: "Choisis un transporteur." }
  const amount = Math.max(0, Math.round(Number(cents) || 0))
  if (!amount) return { ok: false, error: "Le montant reçu doit être supérieur à zéro." }
  const jour = dayOk(day)
  const rows = openOrders(storeId, carrierId).filter((o) => o.left > 0)
  /* un versement ne peut pas dépasser la dette : sinon la caisse mentirait */
  const due = rows.reduce((a, o) => a + o.left, 0)
  if (amount > due) {
    return { ok: false, tooMuch: true, due, error: "Ce montant dépasse ce que ce transporteur doit encore. Vérifie le montant, ou marque d'abord la commande livrée." }
  }

  const tx = db.transaction(() => {
    let left = amount
    let covered = 0
    const parts = []
    for (const o of rows) {
      if (left <= 0) break
      const part = Math.min(o.left, left)
      left -= part
      covered += part
      parts.push({ id: o.id, cents: part })
    }
    const info = db.prepare(`INSERT INTO carrier_payouts (store_id, carrier_id, day, cents, covered_cents, note)
      VALUES (?, ?, ?, ?, ?, ?)`).run(storeId, carrierId, jour, amount, covered, String(note || "").slice(0, 120))
    const payoutId = info.lastInsertRowid
    const line = db.prepare("INSERT INTO carrier_payout_lines (payout_id, order_id, cents) VALUES (?, ?, ?)")
    const settle = db.prepare("UPDATE orders SET settled_at = ? WHERE id = ? AND store_id = ?")
    for (const p of parts) {
      line.run(payoutId, p.id, p.cents)
      const o = rows.find((x) => x.id === p.id)
      if (o && p.cents >= o.left) settle.run(jour, p.id, storeId)
    }
    return { id: payoutId, covered, orders: parts.length, rest: amount - covered }
  })

  const out = tx()
  return { ok: true, ...out }
}

/** Annule un versement (erreur de saisie) : les commandes redeviennent dues. */
const remove = (storeId, id) => {
  const row = db.prepare("SELECT * FROM carrier_payouts WHERE id = ? AND store_id = ?").get(id, storeId)
  if (!row) return { ok: false, error: "Versement introuvable." }
  const tx = db.transaction(() => {
    const touched = db.prepare("SELECT DISTINCT order_id AS id FROM carrier_payout_lines WHERE payout_id = ?").all(id)
    db.prepare("DELETE FROM carrier_payout_lines WHERE payout_id = ?").run(id)
    db.prepare("DELETE FROM carrier_payouts WHERE id = ? AND store_id = ?").run(id, storeId)
    /* une commande qui n'est plus couverte en entier redevient due */
    const unsettle = db.prepare("UPDATE orders SET settled_at = NULL WHERE id = ? AND store_id = ?")
    for (const t of touched) {
      const o = db.prepare("SELECT * FROM orders WHERE id = ? AND store_id = ?").get(t.id, storeId)
      if (o && paidOn(o.id) < receivable(o)) unsettle.run(o.id, storeId)
    }
  })
  tx()
  return { ok: true }
}

/** Chiffres pour la barre latérale : y a-t-il de l'argent à réclamer ? */
const count = (storeId) => {
  try {
    return db.prepare(`SELECT COUNT(*) AS n FROM orders
      WHERE store_id = ? AND status = 'livree' AND COALESCE(fake, 0) = 0 AND carrier_id > 0
        AND (settled_at IS NULL OR settled_at = '')`).get(storeId).n
  } catch (_) { return 0 }
}

module.exports = { dueByCarrier, dueTotal, list, record, remove, count, receivable, openOrders, paidOn }
