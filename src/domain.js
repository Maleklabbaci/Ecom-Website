"use strict"
/** Nom de domaine de la boutique : nettoyage, recherche par l'adresse du visiteur. */
const db = require("./db")

const platformHosts = () => {
  const set = new Set(["localhost", "127.0.0.1", "0.0.0.0"])
  const raw = process.env.PUBLIC_URL || ""
  try { if (raw) set.add(new URL(raw).hostname.toLowerCase()) } catch (_) {}
  return set
}

/** boutique.dz, https://www.boutique.dz/chemin → boutique.dz */
const clean = (raw) => {
  let v = String(raw || "").trim().toLowerCase()
  if (!v) return ""
  v = v.replace(/^https?:\/\//, "").replace(/\/.*$/, "").replace(/:\d+$/, "").replace(/\.$/, "")
  v = v.replace(/^www\./, "")
  if (!/^[a-z0-9]([a-z0-9-]{0,60}[a-z0-9])?(\.[a-z0-9]([a-z0-9-]{0,60}[a-z0-9])?)+$/.test(v)) return ""
  if (v.length > 120) return ""
  if (platformHosts().has(v)) return ""
  return v
}

const find = (host) => {
  const h = String(host || "").split(":")[0].trim().toLowerCase().replace(/\.$/, "")
  if (!h || platformHosts().has(h)) return null
  const bare = h.replace(/^www\./, "")
  return db.prepare(
    "SELECT * FROM stores WHERE status = 'active' AND domain IN (?, ?, ?)"
  ).get(h, bare, "www." + bare) || null
}

const instructions = (store, host) => {
  const target = String(host || "novadz.dz").split(":")[0]
  const domain = store.domain || "boutique.dz"
  return [
    ["Type", "Nom", "Valeur"],
    ["CNAME", "www", target],
    ["CNAME", domain, target],
  ]
}

module.exports = { clean, find, instructions, platformHosts }
