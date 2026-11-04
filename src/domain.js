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

/**
 * Le domaine des adresses gratuites.
 *
 * Chaque boutique a une adresse offerte : `<slug>.<domaine libre>`, par exemple
 * `amina-mode.nova.site`. Aucun achat, aucun réglage DNS. On le prend dans
 * PUBLIC_URL quand le serveur a un vrai nom ; sinon « nova.site ».
 */
const FREE_FALLBACK = "nova.site"
const freeDomain = () => {
  const env = String(process.env.NOVADZ_FREE_DOMAIN || "").trim().toLowerCase().replace(/^\.+/, "")
  if (env) return env
  try {
    const h = new URL(process.env.PUBLIC_URL || "").hostname.toLowerCase().replace(/^www\./, "")
    if (h && h !== "localhost" && h !== "0.0.0.0" && !h.startsWith("127.")) return h
  } catch (_) {}
  return FREE_FALLBACK
}

/** amina-mode + nova.site → amina-mode.nova.site */
const freeHost = (store) => {
  const slug = String((store && store.slug) || "").trim().toLowerCase()
  return slug ? `${slug}.${freeDomain()}` : ""
}

const find = (host) => {
  const h = String(host || "").split(":")[0].trim().toLowerCase().replace(/\.$/, "")
  if (!h || platformHosts().has(h)) return null
  const bare = h.replace(/^www\./, "")
  const parDomaine = db.prepare(
    "SELECT * FROM stores WHERE status = 'active' AND domain IN (?, ?, ?)"
  ).get(h, bare, "www." + bare) || null
  if (parDomaine) return parDomaine
  /* adresse gratuite : <slug>.<domaine libre> */
  const libre = freeDomain()
  if (h.endsWith("." + libre)) {
    const slug = h.slice(0, -(libre.length + 1))
    if (slug && !slug.includes(".")) {
      return db.prepare("SELECT * FROM stores WHERE status = 'active' AND slug = ?").get(slug) || null
    }
  }
  return null
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

module.exports = { clean, find, instructions, platformHosts, freeDomain, freeHost }
