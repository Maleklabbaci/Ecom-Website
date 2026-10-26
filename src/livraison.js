"use strict"
/**
 * Prix maison / bureau pour le formulaire.
 *
 * On demande d'abord au transporteur branché (dzship : tarif + bureaux).
 * S'il n'est pas branché, ou s'il ne répond pas, on prend les frais
 * déjà enregistrés par le marchand. La commande n'est jamais bloquée.
 */
const SHOP = require("./shop")
const CARRIERS = require("./carriers")
const DZ = require("./dzship")

const cache = new Map()

const localDesks = (store, wilaya) => {
  let list = []
  try { list = CARRIERS.centersForWilaya(store.id, wilaya) } catch (_) { list = [] }
  return (list || []).slice(0, 40).map((c) => ({
    id: String(c.external_id || c.name || "").slice(0, 60),
    name: String(c.name || "").slice(0, 120),
    commune: String(c.commune || "").slice(0, 60),
  })).filter((d) => d.name)
}

const fromTable = (store, wilaya) => ({
  home: SHOP.shippingFor(store.id, wilaya, "home"),
  desk: SHOP.shippingFor(store.id, wilaya, "desk"),
  source: "boutique",
  desks: localDesks(store, wilaya),
})

/** { home, desk, source, desks } en centimes. source = "api" ou "boutique". */
const quote = async (store, wilaya) => {
  const name = String(wilaya || store.wilaya || "Alger")
  const key = store.id + "|" + name
  const hit = cache.get(key)
  if (hit && Date.now() - hit.at < hit.ttl) return hit.value

  const table = fromTable(store, name)
  let api = null
  let why = "boutique"
  const carrier = CARRIERS.active(store.id)
  if (carrier && DZ.handles(carrier)) {
    const info = DZ.courierOf(carrier)
    const creds = info ? DZ.credentialsOf(carrier, info) : {}
    const missing = ((info && info.requiredCredentials) || []).filter((k) => !creds[k])
    if (missing.length) why = "jeton"
    else {
      try { api = await DZ.quote(carrier, name, 2500) } catch (_) { api = null }
      why = api && (api.home != null || api.desk != null) ? "api" : "muet"
    }
  }
  const value = {
    home: api && api.home != null ? api.home : table.home,
    desk: api && api.desk != null ? api.desk : table.desk,
    source: why === "api" ? "api" : "boutique",
    why,
    desks: api && api.desks && api.desks.length ? api.desks : table.desks,
  }
  cache.set(key, { at: Date.now(), ttl: value.source === "api" ? 10 * 60 * 1000 : 60 * 1000, value })
  return value
}

module.exports = { quote }
