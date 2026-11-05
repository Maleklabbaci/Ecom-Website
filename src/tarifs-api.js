"use strict"
/**
 * Frais de livraison pris directement chez le transporteur (API).
 *
 * Pourquoi : aujourd'hui la page « Frais de livraison » se remplit à la main,
 * wilaya par wilaya. Le marchand connaît mal les tarifs réels de Yalidine ou
 * de ZR Express, et ses prix se démodent. Ici on demande les tarifs au
 * transporteur branché, on les montre, et le marchand décide de les appliquer.
 *
 * Trois règles :
 *   1. On ne modifie jamais un tarif sans que le marchand l'ait demandé :
 *      `preview()` lit, `apply()` écrit.
 *   2. Une wilaya où l'API ne répond pas garde le tarif du marchand.
 *   3. Une réponse est gardée 30 minutes en mémoire : on n'appelle pas le
 *      transporteur à chaque ouverture de page.
 */
const db = require("./db")
const SHOP = require("./shop")
const DZ = require("./dzship")
const WIL = require("./wilayas")

/* Le demandeur de tarifs : dzship en vrai, une fonction dans les tests. */
let quoteFn = null
const setQuote = (fn) => { quoteFn = fn }
const quoter = () => quoteFn || ((carrier, wilaya) => DZ.quote(carrier, wilaya))

const TTL = 30 * 60 * 1000
const cache = new Map() /* storeId -> { at, value } */

/** Le transporteur à interroger : le premier actif, sinon le premier enregistré. */
const carrierOf = (storeId) => db.prepare(
  "SELECT * FROM carriers WHERE store_id = ? ORDER BY enabled DESC, id LIMIT 1").get(storeId)

/** Petite file d'attente : 4 appels en parallèle, jamais plus. */
const pool = async (items, size, deadline, worker) => {
  const out = new Array(items.length)
  let i = 0
  const run = async () => {
    while (i < items.length) {
      const k = i++
      if (Date.now() > deadline) return
      out[k] = await worker(items[k])
    }
  }
  await Promise.all(Array.from({ length: Math.min(size, items.length) }, run))
  return out
}

/**
 * Les tarifs réels, sans rien écrire.
 * { ok, carrier, rows: [{ wilaya, home, desk, actuel:{home,desk}, api:true|false }], found }
 */
const preview = async (store, opts = {}) => {
  const carrier = opts.carrier || carrierOf(store.id)
  if (!carrier) {
    return {
      ok: false, rows: [], found: 0,
      error: "Aucun transporteur enregistré. Branchez-le d'abord dans « Transporteur ».",
    }
  }
  const hit = cache.get(store.id)
  if (!opts.force && hit && Date.now() - hit.at < TTL) return hit.value

  const table = SHOP.shippingTable(store.id)
  const quote = quoter()
  const deadline = Date.now() + Math.min(Number(opts.budgetMs) || 20000, 30000)

  /* Une wilaya nouvelle (59 à 69) n'a pas de tarif à elle chez le
     transporteur : elle prend celui de sa wilaya mère. On ne pose donc la
     question qu'une fois par wilaya mère (58 appels, pas 69). */
  const memo = new Map()
  const quoteOf = (w) => {
    const code = WIL.codeOf(w)
    const key = String(WIL.shipCode(code) || code || w)
    if (!memo.has(key)) {
      memo.set(key, Promise.resolve()
        .then(() => quote(carrier, w))
        .catch(() => null)
        .then((r) => r || null))
    }
    return memo.get(key)
  }
  const brut = await pool(SHOP.WILAYAS, 4, deadline, quoteOf)

  const rows = SHOP.WILAYAS.map((w, i) => {
    const q = brut[i] || {}
    const cur = table[w] || { home: 0, desk: 0 }
    const mere = WIL.parentName(WIL.codeOf(w))
    return {
      wilaya: w,
      mere,
      home: q.home != null ? Number(q.home) : null,
      desk: q.desk != null ? Number(q.desk) : null,
      actuel: { home: Number(cur.home || 0), desk: Number(cur.desk || 0) },
      api: q.home != null || q.desk != null,
    }
  })

  const found = rows.filter((r) => r.api).length
  const value = {
    ok: true,
    carrier: String(carrier.label || carrier.family || "Transporteur").slice(0, 60),
    rows,
    found,
    total: rows.length,
    error: found ? "" : "Le transporteur n'a renvoyé aucun tarif. Vérifiez ses accès API dans « Transporteur », ou gardez vos tarifs actuels.",
  }
  cache.set(store.id, { at: Date.now(), value })
  return value
}

/* Le tarif posé d'office à la création de la boutique. S'il est encore là,
   c'est que le marchand ne l'a jamais touché : on peut le remplacer. */
const DEF_HOME = 50000
const DEF_DESK = Math.max(0, 50000 - SHOP.DESK_DISCOUNT)
const jamaisTouche = (cur) => cur.home === DEF_HOME && cur.desk === DEF_DESK

/**
 * Applique les tarifs déjà récupérés.
 * mode = "remplacer" (les prix de l'API partout) ou "completer" (seulement les
 * wilayas où le marchand n'a jamais mis son propre prix). Les délais de
 * livraison (eta) ne sont jamais touchés.
 */
const apply = (store, mode = "completer") => {
  const hit = cache.get(store.id)
  if (!hit || Date.now() - hit.at > TTL) {
    return { ok: false, updated: 0, error: "Récupérez d'abord les tarifs, puis appliquez-les." }
  }
  const remplacer = mode === "remplacer"
  SHOP.ensureShipping(store.id)
  const upd = db.prepare("UPDATE shipping_rates SET cents = ?, desk_cents = ? WHERE store_id = ? AND wilaya = ?")
  let updated = 0
  for (const r of hit.value.rows) {
    if (r.home == null && r.desk == null) continue
    const cur = r.actuel || { home: 0, desk: 0 }
    const libre = jamaisTouche(cur)
    const home = r.home != null && (remplacer || libre) ? r.home : cur.home
    const desk = r.desk != null && (remplacer || libre) ? r.desk : cur.desk
    if (home === cur.home && desk === cur.desk) continue
    upd.run(home, desk, store.id, r.wilaya)
    updated++
  }
  cache.delete(store.id) /* une fois appliqués, on repart de la base */
  return { ok: true, updated, mode: remplacer ? "remplacer" : "completer" }
}

/** Les tarifs déjà récupérés pour cette boutique (sans rappeler l'API). */
const lastOf = (storeId) => {
  const hit = cache.get(storeId)
  return hit && Date.now() - hit.at < TTL ? hit.value : null
}

module.exports = { preview, apply, lastOf, setQuote, carrierOf, TTL }
