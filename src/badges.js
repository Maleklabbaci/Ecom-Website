"use strict"
/**
 * Pastilles de la barre latérale (« taskbar » du tableau de bord).
 *
 * Un seul endroit qui compte ce qui attend le marchand :
 *   - commandes à traiter (nouvelles + à vérifier, hors commandes de test) ;
 *   - commandes non confirmées (donc non expédiables) ;
 *   - paniers abandonnés ;
 *   - relances à envoyer ;
 *   - produits en stock faible ou en rupture ;
 *   - avis en attente de validation ;
 *   - messages de relance en file d'attente.
 *
 * Les compteurs sont lus à chaque affichage du tableau de bord : ce sont de
 * petites requêtes indexées, et un chiffre faux serait pire que pas de chiffre.
 */
const db = require("./db")
const ORD = require("./orders")
const REL = require("./relance")
const INV = require("./inventory")

const one = (sql, ...args) => {
  try { return db.prepare(sql).get(...args).n || 0 } catch (_) { return 0 }
}

/** Tous les compteurs d'une boutique. */
const counts = (store) => {
  if (!store) return {}
  const id = store.id

  /* commandes réelles (les commandes de test ne comptent jamais) */
  const orders = db.prepare("SELECT status FROM orders WHERE store_id = ? AND COALESCE(fake,0) = 0").all(id)
  let toTreat = 0
  let toConfirm = 0
  let shipped = 0
  for (const o of orders) {
    const st = ORD.norm(o.status)
    if (st === "nouvelle" || st === "a_verifier") toTreat++
    if (st !== "confirmee" && st !== "expediee" && st !== "livree" && st !== "annulee" && st !== "remboursee") toConfirm++
    if (st === "expediee") shipped++
  }

  /* paniers abandonnés : même calcul que la page Paniers */
  let carts = 0
  try { carts = REL.stats(id).abandoned || 0 } catch (_) { carts = 0 }

  /* stock faible / rupture */
  let lowStock = 0
  try { lowStock = INV.lowStock(id, INV.threshold(store)).length } catch (_) { lowStock = 0 }

  return {
    orders: orders.length,
    toTreat,
    toConfirm,
    shipped,
    carts,
    lowStock,
    reviews: one("SELECT COUNT(*) n FROM reviews WHERE store_id = ? AND approved = 0", id),
    relances: one("SELECT COUNT(*) n FROM messages WHERE store_id = ? AND status = 'pending'", id),
    carriers: one("SELECT COUNT(*) n FROM carriers WHERE store_id = ? AND enabled = 1", id),
    products: one("SELECT COUNT(*) n FROM products WHERE store_id = ?", id),
    pages: one("SELECT COUNT(*) n FROM pages WHERE store_id = ?", id),
    leads: one("SELECT COUNT(*) n FROM leads WHERE store_id = ? AND read_at IS NULL", id),
  }
}

/** Pastille HTML, ou rien du tout quand le compte est zéro. */
const pill = (n, tone = "") => {
  const v = Number(n) || 0
  if (v <= 0) return ""
  const txt = v > 99 ? "99+" : String(v)
  return `<b class="nav-badge${tone ? " " + tone : ""}" aria-label="${v}">${txt}</b>`
}

module.exports = { counts, pill }
