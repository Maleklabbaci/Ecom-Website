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
 * Quand le transporteur verse, on enregistre le montant reçu : il est
 * réparti sur les plus anciennes commandes non réglées. Ce qui reste non
 * couvert apparaît en « il manque ».
 *
 * Aucune donnée n'est inventée : si le vendeur n'a pas coché de
 * transporteur sur une commande, elle n'entre pas dans le calcul.
 */
const db = require("./db")
/* le module des transporteurs crée sa table ; on le charge pour être sûr
   qu'elle existe, même quand cet écran est le premier ouvert. */
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
`)

/* une commande livrée est « réglée » quand le transporteur a versé sa part */
addCol("orders", "settled_at", "TEXT")

const today = () => new Date().toISOString().slice(0, 10)
const dayOk = (v) => (/^\d{4}-\d{2}-\d{2}$/.test(String(v || "")) ? String(v) : today())

/** Part que le transporteur doit reverser pour une commande livrée. */
const receivable = (o) =>
  Math.max(0, (Number(o.total_cents) || 0) - (Number(o.shipping_cents) || 0))

/** Les commandes livrées, avec un transporteur, pas encore réglées. */
const openOrders = (storeId, carrierId) => db.prepare(`
  SELECT id, ref, customer_name, phone, wilaya, total_cents, shipping_cents, created_at, carrier_id
  FROM orders
  WHERE store_id = ? AND carrier_id = ? AND status = 'livree' AND fake = 0
    AND (settled_at IS NULL OR settled_at = '')
  ORDER BY id`).all(storeId, carrierId)

/** Ce que chaque transporteur doit encore, et ce qu'il a déjà versé. */
const dueByCarrier = (storeId) => {
  const carriers = db.prepare(`
    SELECT id, label, preset FROM carriers WHERE store_id = ? ORDER BY label`).all(storeId)
  const out = []
  for (const c of carriers) {
    const rows = openOrders(storeId, c.id)
    const due = rows.reduce((a, o) => a + receivable(o), 0)
    const paid = db.prepare(`SELECT COALESCE(SUM(cents), 0) AS c, COUNT(*) AS n
      FROM carrier_payouts WHERE store_id = ? AND carrier_id = ?`).get(storeId, c.id)
    const last = db.prepare(`SELECT day FROM carrier_payouts WHERE store_id = ? AND carrier_id = ?
      ORDER BY day DESC, id DESC LIMIT 1`).get(storeId, c.id)
    out.push({
      id: c.id, label: c.label, preset: c.preset,
      orders: rows.length, due, received: paid.c, payouts: paid.n,
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

  const tx = db.transaction(() => {
    const rows = openOrders(storeId, carrierId)
    let left = amount
    let covered = 0
    const paidOrders = []
    for (const o of rows) {
      if (left <= 0) break
      const part = receivable(o)
      /* une commande n'est réglée qu'en entier : un versement qui ne couvre
         pas la commande attend le versement suivant */
      if (part > left) break
      left -= part
      covered += part
      paidOrders.push(o.id)
    }
    const info = db.prepare(`INSERT INTO carrier_payouts (store_id, carrier_id, day, cents, covered_cents, note)
      VALUES (?, ?, ?, ?, ?, ?)`).run(storeId, carrierId, jour, amount, covered, String(note || "").slice(0, 120))
    const mark = db.prepare("UPDATE orders SET settled_at = ? WHERE id = ? AND store_id = ?")
    for (const id of paidOrders) mark.run(jour, id, storeId)
    return { id: info.lastInsertRowid, covered, orders: paidOrders.length, rest: amount - covered }
  })

  const out = tx()
  return { ok: true, ...out }
}

/** Annule un versement (erreur de saisie) : les commandes redeviennent dues. */
const remove = (storeId, id) => {
  const row = db.prepare("SELECT * FROM carrier_payouts WHERE id = ? AND store_id = ?").get(id, storeId)
  if (!row) return { ok: false, error: "Versement introuvable." }
  const tx = db.transaction(() => {
    db.prepare("UPDATE orders SET settled_at = NULL WHERE store_id = ? AND carrier_id = ? AND settled_at = ?")
      .run(storeId, row.carrier_id, row.day)
    db.prepare("DELETE FROM carrier_payouts WHERE id = ? AND store_id = ?").run(id, storeId)
  })
  tx()
  return { ok: true }
}

/** Chiffres pour la barre latérale : y a-t-il de l'argent à réclamer ? */
const count = (storeId) => {
  try {
    return db.prepare(`SELECT COUNT(*) AS n FROM orders
      WHERE store_id = ? AND status = 'livree' AND fake = 0 AND carrier_id > 0
        AND (settled_at IS NULL OR settled_at = '')`).get(storeId).n
  } catch (_) { return 0 }
}

module.exports = { dueByCarrier, dueTotal, list, record, remove, count, receivable, openOrders }
