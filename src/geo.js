"use strict"
/**
 * Communes d'Algérie (58 wilayas, 1 530 communes) — noms FR + AR.
 * Source : jeu de données public des wilayas/communes, embarqué dans le dépôt
 * (src/communes.json) pour fonctionner hors ligne, sans API.
 */
const DATA = require("./communes.json")

const WILAYAS = Object.keys(DATA)

const communesOf = (wilaya) => (DATA[wilaya] ? DATA[wilaya].communes : [])
const wilayaAr = (wilaya) => (DATA[wilaya] ? DATA[wilaya].ar : "")
const isWilaya = (wilaya) => Boolean(DATA[wilaya])

const norm = (s) =>
  String(s || "")
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .toLowerCase().replace(/[^a-z0-9\u0600-\u06FF]+/g, " ").trim()

/** Retrouve une commune saisie librement (« boufarik », « BOUFARIK »…). */
const findCommune = (wilaya, input) => {
  const key = norm(input)
  if (!key) return null
  const list = communesOf(wilaya)
  return list.find((c) => norm(c.fr) === key) || list.find((c) => norm(c.fr).startsWith(key)) || null
}

/**
 * Adresse GPS : on n'appelle aucun service externe (pas de clé, pas de fuite).
 * On stocke la position et un lien de carte pour le livreur.
 */
const mapsLink = (lat, lng) =>
  lat == null || lng == null ? "" : `https://www.google.com/maps/search/?api=1&query=${Number(lat)},${Number(lng)}`

/**
 * Point GPS → wilaya + commune déjà connues de la boutique.
 * D'abord la carte (OpenStreetMap, plus juste en ville), sinon le point
 * de commune le plus proche, embarqué pour marcher sans réseau.
 */
const POINTS = require("./geo-points.json")
const PARENT = {
  aflou: "Laghouat", barika: "Batna", elkantara: "Biskra", birelater: "Tébessa",
  elaricha: "Tlemcen", ksarchellala: "Tiaret", ainoussera: "Djelfa", ainouessara: "Djelfa",
  messaad: "Djelfa", ksarelboukhari: "Médéa", bousaada: "M'Sila", elabiodhsidicheikh: "El Bayadh",
}
const fold = (s) => norm(s).replace(/ /g, "")
const stripAdmin = (s) => String(s || "").replace(/^(wilaya|province|daira|daïra)\s+(de\s+|d['’]\s*)?/i, "").trim()
const matchWilaya = (name) => {
  const f = fold(stripAdmin(name))
  if (!f) return ""
  return WILAYAS.find((w) => fold(w) === f) || PARENT[f] || WILAYAS.find((w) => fold(w).startsWith(f) || f.startsWith(fold(w))) || ""
}

const nearestLocal = (lat, lng) => {
  let best = null
  let bestD = Infinity
  for (const p of POINTS) {
    const dlat = (p[0] - lat) * 111
    const dlng = (p[1] - lng) * 111 * Math.cos((lat * Math.PI) / 180)
    const d = dlat * dlat + dlng * dlng
    if (d < bestD) { bestD = d; best = p }
  }
  if (!best || Math.sqrt(bestD) > 80) return null
  return { ok: true, wilaya: WILAYAS[best[2]] || "", commune: best[3] || "" }
}

const fromAddress = (address) => {
  const a = address || {}
  if (a.country_code && a.country_code !== "dz") return null
  let wilaya = matchWilaya(a.state) || matchWilaya(a.state_district) || matchWilaya(a.county)
  const raw = a.city || a.town || a.village || a.municipality || a.city_district || ""
  if (!wilaya && raw) {
    for (const w of WILAYAS) {
      const hit = findCommune(w, raw)
      if (hit) return { ok: true, wilaya: w, commune: hit.fr }
    }
    return null
  }
  if (!wilaya) return null
  const hit = findCommune(wilaya, raw)
  return { ok: true, wilaya, commune: hit ? hit.fr : String(raw || "").trim() }
}

const cache = new Map()
const placeFrom = async (lat, lng) => {
  lat = Number(lat)
  lng = Number(lng)
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null
  if (lat < 18.5 || lat > 37.5 || lng < -9 || lng > 12.5) return null
  const key = `${lat.toFixed(3)},${lng.toFixed(3)}`
  if (cache.has(key)) return cache.get(key)
  let place = null
  try {
    const res = await fetch(
      `https://nominatim.openstreetmap.org/reverse?format=jsonv2&accept-language=fr&lat=${lat}&lon=${lng}`,
      {
        signal: AbortSignal.timeout(2500),
        headers: {
          "User-Agent": "NovaDZ/1.0 (remplissage wilaya)",
          Accept: "application/json",
        },
      }
    )
    if (res.ok) place = fromAddress((await res.json()).address)
  } catch (_) { place = null }
  if (!place || !place.wilaya) place = nearestLocal(lat, lng)
  if (!place || !place.wilaya) return null
  cache.set(key, place)
  if (cache.size > 300) cache.delete(cache.keys().next().value)
  return place
}

module.exports = { WILAYAS, communesOf, wilayaAr, isWilaya, findCommune, mapsLink, norm, placeFrom, nearestLocal }
