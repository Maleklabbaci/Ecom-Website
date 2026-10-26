"use strict"
/**
 * Historique d'un numéro, toutes boutiques confondues.
 *
 * On ne rend que trois comptes : livré, annulé, retour.
 * Pas le nom, pas l'adresse, pas le produit, pas la boutique.
 */
const db = require("./db")
const { normalizePhone } = require("./security")

const cols = (t) => db.prepare(`PRAGMA table_info(${t})`).all().map((c) => c.name)
if (!cols("orders").includes("phone_key")) {
  db.exec("ALTER TABLE orders ADD COLUMN phone_key TEXT DEFAULT ''")
}
db.exec("CREATE INDEX IF NOT EXISTS idx_orders_phone_key ON orders(phone_key)")

const keyOf = (phone) => {
  const p = normalizePhone(phone)
  return p && p.length >= 9 ? p : ""
}

const stamp = (orderId) => {
  const row = db.prepare("SELECT id, phone FROM orders WHERE id = ?").get(orderId)
  if (!row) return ""
  const key = keyOf(row.phone)
  db.prepare("UPDATE orders SET phone_key = ? WHERE id = ?").run(key, row.id)
  return key
}

const pending = db.prepare("SELECT id, phone FROM orders WHERE phone_key IS NULL OR phone_key = ''").all()
if (pending.length) {
  const upd = db.prepare("UPDATE orders SET phone_key = ? WHERE id = ?")
  const tx = db.transaction((rows) => {
    for (const r of rows) upd.run(keyOf(r.phone), r.id)
  })
  tx(pending)
}

/**
 * Comptes pour un numéro. Les commandes de test ne comptent pas.
 * @returns {{ ok: boolean, phone: string, livre: number, annule: number, retour: number }}
 */
const summary = (phone) => {
  const key = keyOf(phone)
  if (!key) return { ok: false, phone: "", livre: 0, annule: 0, retour: 0 }
  const rows = db.prepare(`
    SELECT status, COUNT(*) n FROM orders
    WHERE phone_key = ? AND COALESCE(fake, 0) = 0
      AND status IN ('livree', 'annulee', 'retour')
    GROUP BY status
  `).all(key)
  const n = (id) => {
    const hit = rows.find((r) => r.status === id)
    return hit ? hit.n : 0
  }
  return { ok: true, phone: key, livre: n("livree"), annule: n("annulee"), retour: n("retour") }
}

module.exports = { keyOf, stamp, summary }
