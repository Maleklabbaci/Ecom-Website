"use strict"
/**
 * Moyens de paiement — réglages du marchand.
 *
 * Le marché algérien fonctionne surtout en paiement à la livraison, mais un
 * marchand peut aussi proposer le versement CIB / Edahabia (BaridiMob), un
 * virement CCP / RIB, ou un prestataire de paiement en ligne (API) qu'il a
 * lui-même choisi. Rien n'est imposé : chaque moyen s'active, se décrit en
 * texte libre, et peut ajouter des frais.
 *
 * Aucun prestataire n'est codé en dur : le marchand colle ses propres
 * instructions ou sa propre URL. On ne prétend jamais encaisser à sa place.
 */
const db = require("./db")

/* ------------------------------ schéma ------------------------------ */
const cols = (t) => db.prepare(`PRAGMA table_info(${t})`).all().map((c) => c.name)
const addCol = (t, n, d) => { if (!cols(t).includes(n)) db.exec(`ALTER TABLE ${t} ADD COLUMN ${n} ${d}`) }

addCol("stores", "pay_cod", "INTEGER NOT NULL DEFAULT 1")
addCol("stores", "pay_cod_fee", "INTEGER NOT NULL DEFAULT 0")   /* en centimes */
addCol("stores", "pay_cod_label", "TEXT DEFAULT ''")
addCol("stores", "pay_cib", "INTEGER NOT NULL DEFAULT 0")
addCol("stores", "pay_cib_note", "TEXT DEFAULT ''")
addCol("stores", "pay_bank", "INTEGER NOT NULL DEFAULT 0")
addCol("stores", "pay_bank_note", "TEXT DEFAULT ''")
addCol("stores", "pay_online", "INTEGER NOT NULL DEFAULT 0")
addCol("stores", "pay_online_url", "TEXT DEFAULT ''")
addCol("stores", "pay_online_note", "TEXT DEFAULT ''")
addCol("stores", "pay_note", "TEXT DEFAULT ''")

addCol("orders", "payment", "TEXT DEFAULT 'cod'")
addCol("orders", "pay_fee_cents", "INTEGER NOT NULL DEFAULT 0")

/* ------------------------------ définitions ------------------------------ */
/**
 * Chaque moyen : identifiant stable (stocké dans orders.payment), libellé,
 * et la colonne qui dit s'il est activé.
 */
const METHODS = [
  {
    id: "cod",
    name: "Paiement à la livraison",
    hint: "Le client paie le livreur. C'est le mode par défaut en Algérie.",
    flag: "pay_cod",
    fee: "pay_cod_fee",
    note: "pay_cod_label",
    noteLabel: "Texte affiché (facultatif)",
    notePlaceholder: "Payez en espèces à la réception",
  },
  {
    id: "cib",
    name: "Carte CIB / Edahabia",
    hint: "Le client paie en ligne par carte, puis revient avec la référence.",
    flag: "pay_cib",
    note: "pay_cib_note",
    noteLabel: "Instructions affichées au client",
    notePlaceholder: "Vous serez redirigé vers la page de paiement de la banque…",
  },
  {
    id: "bank",
    name: "Virement / versement CCP",
    hint: "Le client verse sur votre compte et envoie le reçu.",
    flag: "pay_bank",
    note: "pay_bank_note",
    noteLabel: "Numéro de compte / RIB / CCP",
    notePlaceholder: "CCP 0012345678 clé 12 — au nom de …",
  },
  {
    id: "online",
    name: "Paiement en ligne (votre prestataire)",
    hint: "Vous collez l'adresse de paiement de votre prestataire (Chargily, SATIM, autre).",
    flag: "pay_online",
    url: "pay_online_url",
    note: "pay_online_note",
    noteLabel: "Consigne affichée",
    notePlaceholder: "Vous serez redirigé vers le paiement sécurisé.",
  },
]

const LABELS = {
  cod: "À la livraison",
  cib: "Carte CIB / Edahabia",
  bank: "Virement / CCP",
  online: "Paiement en ligne",
}

const list = (store) =>
  METHODS.filter((m) => store && Number(store[m.flag]) === 1).map((m) => ({
    id: m.id,
    name: store[m.note] || m.name,
    baseName: m.name,
    hint: m.hint,
    note: String(store[m.note] || ""),
    url: m.url ? String(store[m.url] || "") : "",
    fee: Number(store[m.fee] || 0),
  }))

const ids = (store) => list(store).map((m) => m.id)

/** Méthode retenue pour une commande : celle envoyée, sinon la première active. */
const pick = (store, raw) => {
  const wanted = String(raw || "").trim()
  const available = ids(store)
  if (wanted && available.includes(wanted)) return wanted
  return available[0] || "cod"
}

const feeFor = (store, method) => {
  const m = METHODS.find((x) => x.id === method)
  return m && m.fee ? Math.max(0, Number(store[m.fee] || 0)) : 0
}

const label = (method) => LABELS[method] || "À la livraison"

/** Résumé lisible pour les écrans de commande : « Carte CIB (+50 DZD) ». */
const describe = (store, order) => {
  const method = (order && order.payment) || "cod"
  const fee = Number((order && order.pay_fee_cents) || 0)
  const m = list(store).find((x) => x.id === method)
  const name = m ? m.name : label(method)
  return fee > 0 ? `${name} (+${(fee / 100).toFixed(0)} DZD)` : name
}

module.exports = { METHODS, LABELS, list, ids, pick, feeFor, label, describe }
