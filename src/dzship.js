"use strict"
/**
 * Livraison via dzship (https://github.com/DZBuild-com/dzship).
 * Un seul format pour toutes les sociétés. Les jetons du marchand partent
 * le temps de l'appel et ne sont pas gardés par dzship.
 */
const fs = require("node:fs")
const path = require("node:path")
const dzship = require("./dzship-client.cjs")
const SECRETS = require("./secrets")
const WILAYAS = require("./wilayas")
const GEO = require("./geo")
const FIELDS = require("./parcel-fields")

const SNAPSHOT = path.join(__dirname, "dzship-couriers.json")

const KEY_ALIAS = {
  easyspeed: "easyandspeed",
  "zrexpress-v2": "zrexpressnew",
  "zr-new": "zrexpressnew",
}

/* Anciens noms d'en-tête NovaDZ → champ dzship. */
const CRED_ALIAS = {
  apiId: ["apiid", "x-api-id", "api_id"],
  apiToken: ["apitoken", "x-api-token", "api_token"],
  token: ["token", "authorization", "bearer"],
  apiKey: ["apikey", "x-api-key", "api_key"],
  key: ["key"],
  tenantId: ["tenantid", "tenant_id", "tenant"],
  guid: ["guid", "user_guid", "userguid"],
  publicKey: ["publickey", "public_key"],
  apiSecret: ["apisecret", "api_secret", "secret"],
}

const CRED_LABEL = {
  apiId: "Identifiant API",
  apiToken: "Jeton API",
  token: "Jeton",
  apiKey: "Clé API",
  key: "Clé",
  tenantId: "Identifiant du compte",
  guid: "Identifiant utilisateur",
  publicKey: "Clé publique",
  apiSecret: "Secret",
}

const PLATFORM_LABEL = {
  yalidine: "Yalidine",
  procolis: "ZR Express",
  zrexpressapp: "ZR Express (nouvelle plateforme)",
  maystro: "Maystro",
  noest: "NOEST",
  zimou: "Zimou",
  colivraison: "Colivraison",
  ecomdelivery: "Ecom Delivery",
  elogistia: "Elogistia",
  neardelivery: "Near Delivery",
  mdm: "MDM",
  ecotrack: "EcoTrack",
  sandbox: "Test",
}

const PLATFORM_ORDER = [
  "yalidine", "procolis", "zrexpressapp", "maystro", "noest", "zimou",
  "colivraison", "ecomdelivery", "elogistia", "neardelivery", "mdm", "ecotrack", "sandbox",
]

/* Ces plateformes routent un colis au bureau par l'identifiant du bureau. */
const DESK_ID_PLATFORMS = new Set([
  "yalidine", "noest", "zrexpressapp", "zimou", "ecomdelivery", "mdm", "neardelivery",
])

const STATUS_FR = {
  created: "Enregistré",
  pending_pickup: "En attente de ramassage",
  picked_up: "Ramassé",
  in_transit: "En transit",
  at_hub: "Au centre de tri",
  out_for_delivery: "En cours de livraison",
  delivery_attempted: "Tentative de livraison",
  delivered: "Livré",
  on_hold: "En attente",
  return_in_transit: "Retour en cours",
  returned: "Retourné",
  cancelled: "Annulé",
  lost: "Perdu",
  unknown: "Statut inconnu",
}

const STATUS_MAP = {
  delivered: "livree",
  returned: "annulee",
  cancelled: "annulee",
  picked_up: "expediee",
  in_transit: "expediee",
  at_hub: "expediee",
  out_for_delivery: "expediee",
  pending_pickup: "expediee",
  created: "expediee",
}

let catalog = []
try { catalog = JSON.parse(fs.readFileSync(SNAPSHOT, "utf8")) } catch (_) { catalog = [] }

const byCatalogKey = (key) => catalog.find((c) => c.key === key) || null

const resolveKey = (preset) => {
  const raw = String(preset || "").trim()
  if (!raw || raw === "custom") return ""
  const aliased = KEY_ALIAS[raw] || raw
  if (byCatalogKey(aliased)) return aliased
  const hit = catalog.find((c) => (c.aliases || []).includes(raw) || (c.aliases || []).includes(aliased))
  return hit ? hit.key : ""
}

const handles = (carrier) => Boolean(carrier && resolveKey(carrier.preset))

const courierOf = (carrier) => byCatalogKey(resolveKey(carrier && carrier.preset))

const credLabel = (key) => CRED_LABEL[key] || key

const platformLabel = (p) => PLATFORM_LABEL[p] || p || "Autre"

/** Liste pour le menu du tableau de bord. */
const presets = () => {
  const groups = new Map()
  for (const c of catalog) {
    if (!groups.has(c.platform)) groups.set(c.platform, [])
    groups.get(c.platform).push(c)
  }
  const out = []
  const seen = new Set()
  const pushGroup = (platform) => {
    const rows = groups.get(platform) || []
    rows.sort((a, b) => {
      if (a.requiresBaseUrl) return -1
      if (b.requiresBaseUrl) return 1
      return String(a.name).localeCompare(String(b.name), "fr")
    })
    for (const c of rows) {
      if (seen.has(c.key)) continue
      seen.add(c.key)
      out.push(toPreset(c))
    }
  }
  for (const p of PLATFORM_ORDER) pushGroup(p)
  for (const p of groups.keys()) if (!PLATFORM_ORDER.includes(p)) pushGroup(p)
  return out
}

const NAME_FR = {
  zrexpressnew: "ZR Express (nouvelle plateforme)",
  ecotrack: "EcoTrack (n'importe quel bureau)",
  sandbox: "Test (aucun vrai colis)",
}

const toPreset = (c) => ({
  key: c.key,
  label: NAME_FR[c.key] || c.name,
  platform: c.platform,
  group: platformLabel(c.platform),
  hint: hintOf(c),
  verified: true,
  family: familyOfPlatform(c.platform),
  credentials: c.requiredCredentials || [],
  requiresBaseUrl: Boolean(c.requiresBaseUrl),
  listStopDesks: Boolean(c.capabilities && c.capabilities.listStopDesks),
  config: {
    base_url: c.endpoint || "",
    header1_name: (c.requiredCredentials || [])[0] || "",
    header2_name: (c.requiredCredentials || [])[1] || "",
    header3_name: (c.requiredCredentials || [])[2] || "",
    origin_wilaya: "",
    create_body_mode: "json",
    create_method: "POST",
    create_path: "/v1/orders",
    create_body: "{}",
    create_steps: "",
    resp_tracking_path: "trackingNumber",
    resp_label_path: "label",
    resp_error_path: "message",
    resp_message_path: "message",
    centers_path: "/v1/desks",
    centers_method: "POST",
    centers_list_path: "",
    center_id_field: "id",
    center_name_field: "name",
    status_path: "/v1/track",
    status_method: "POST",
    status_body: "",
    status_state_field: "status",
    status_map: "{}",
  },
})

const hintOf = (c) => {
  const creds = (c.requiredCredentials || []).map(credLabel)
  const bits = []
  if (creds.length) bits.push("Jetons : " + creds.join(" + ") + ".")
  else bits.push("Aucun jeton : société de test, elle ne crée pas de vrai colis.")
  if (c.requiresBaseUrl) bits.push("Colle l'adresse de ton bureau (….ecotrack.dz).")
  else if (c.endpoint) bits.push("L'adresse du bureau est déjà connue.")
  if (c.capabilities && c.capabilities.listStopDesks) bits.push("Les bureaux de retrait se récupèrent ici.")
  else bits.push("Ce bureau ne publie pas de liste de points de retrait.")
  return bits.join(" ")
}

const familyOfPlatform = (platform) => {
  if (platform === "yalidine") return "yalidine"
  if (platform === "ecotrack") return "ecotrack"
  if (platform === "procolis") return "procolis"
  if (platform === "zrexpressapp") return "zr-new"
  if (platform === "noest") return "noest"
  if (platform === "maystro") return "maystro"
  return "ecotrack"
}

const byKey = (key) => {
  const resolved = resolveKey(key) || key
  const c = byCatalogKey(resolved)
  return c ? toPreset(c) : null
}

const slots = (carrier) => [1, 2, 3].map((i) => ({
  name: String(carrier[`header${i}_name`] || "").trim(),
  value: String(SECRETS.decrypt(carrier[`header${i}_value_enc`]) || "").replace(/^Bearer\s+/i, "").trim(),
})).filter((s) => s.value)

const credentialsOf = (carrier, info) => {
  const wanted = (info && info.requiredCredentials) || []
  const have = slots(carrier)
  const used = new Set()
  const out = {}
  const take = (pred) => {
    const i = have.findIndex((s, idx) => !used.has(idx) && pred(s))
    if (i === -1) return ""
    used.add(i)
    return have[i].value
  }
  for (const key of wanted) {
    const aliases = new Set([key.toLowerCase(), ...(CRED_ALIAS[key] || [])])
    let v = take((s) => aliases.has(s.name.toLowerCase()))
    if (!v) v = take(() => false)
    out[key] = v
  }
  /* secrets restants, dans l'ordre des champs, si les noms ne collaient pas */
  for (const key of wanted) {
    if (out[key]) continue
    const v = take(() => true)
    if (v) out[key] = v
  }
  return out
}

const baseUrlOf = (carrier, info) => {
  if (!info || !info.requiresBaseUrl) return ""
  return String(carrier.base_url || "").trim().replace(/\/+$/, "")
}

const clientFor = (carrier) => {
  const info = courierOf(carrier)
  if (!info) return null
  const credentials = credentialsOf(carrier, info)
  const from = WILAYAS.codeOf(carrier.origin_wilaya)
  const baseUrl = baseUrlOf(carrier, info)
  const options = {}
  if (from) options.fromWilaya = from
  if (baseUrl) options.baseUrl = baseUrl
  return dzship({
    courier: info.key,
    credentials: info.requiredCredentials.length ? credentials : undefined,
    options: Object.keys(options).length ? options : undefined,
    timeoutMs: 25000,
  })
}

const frenchError = (e) => {
  const code = e && e.code
  if (code === "invalid_phone") return "Le téléphone n'est pas un mobile algérien (05, 06 ou 07)."
  if (code === "rate_limited") return `Trop d'appels d'un coup. Réessaie dans ${e.retryAfter || 60} secondes.`
  if (code === "overloaded") return "dzship est occupé. Réessaie dans un moment."
  if (code === "network_error") return "dzship ne répond pas. Réessaie dans un moment."
  if (code === "EGRESS_BLOCKED") return "Cette adresse n'est pas une adresse de bureau autorisée."
  if (code === "CONFIGURATION_ERROR") return e.message || "Jeton manquant, ou société inconnue."
  if (code === "NOT_SUPPORTED") return "Cette société ne propose pas ça."
  if (code === "COURIER_ERROR" || code === "HTTP_ERROR") return "Le bureau a refusé : " + String(e.message || "erreur").slice(0, 240)
  return String((e && e.message) || "Échec de l'envoi.").slice(0, 300)
}

const needsDeskId = (info) => Boolean(info && DESK_ID_PLATFORMS.has(info.platform))

const check = (vars, carrier) => {
  const info = courierOf(carrier)
  const missing = []
  const warnings = []
  const phone = FIELDS.cleanPhone(vars.phone)
  if (!String(vars.fullName || "").trim() || String(vars.fullName).trim().length < 2) {
    missing.push({ label: "Nom du client", how: "Nom (commande)" })
  }
  if (!/^0(5|6|7)\d{8}$/.test(phone)) {
    missing.push({ label: "Mobile algérien (05, 06 ou 07)", how: "Téléphone (commande)" })
  }
  if (!vars.wilayaCode) missing.push({ label: "Wilaya", how: "Wilaya (commande)" })
  if (!String(vars.commune || "").trim()) missing.push({ label: "Commune", how: "Commune (commande)" })
  if (!String(vars.products || "").trim()) missing.push({ label: "Produits", how: "Articles (commande)" })
  if (info && info.platform === "yalidine" && !WILAYAS.codeOf(vars.fromWilaya)) {
    missing.push({ label: "Wilaya de départ", how: "Transporteur → Wilaya de départ" })
  }
  if (!vars.stopDesk && !String(vars.addressLine || "").trim()) {
    missing.push({ label: "Adresse", how: "Adresse (commande)" })
  }
  if (vars.stopDesk && needsDeskId(info) && !String(vars.deskId || "").trim()) {
    missing.push({ label: "Bureau de retrait", how: "Récupère les bureaux, puis choisis-en un" })
  }
  const creds = info ? credentialsOf(carrier, info) : {}
  for (const key of (info && info.requiredCredentials) || []) {
    if (!creds[key]) missing.push({ label: credLabel(key), how: "Transporteur → jetons" })
  }
  if (info && info.requiresBaseUrl && !baseUrlOf(carrier, info)) {
    missing.push({ label: "Adresse du bureau EcoTrack", how: "Transporteur → adresse ….ecotrack.dz" })
  }
  return { ok: missing.length === 0, missing, warnings, family: "dzship", limit: 255 }
}

const sheet = (vars) => ([
  { label: "Client", value: String(vars.fullName || ""), var: "{{fullName}}" },
  { label: "Téléphone", value: FIELDS.cleanPhone(vars.phone), var: "{{phone}}" },
  { label: "Wilaya", value: String(vars.wilaya || ""), var: "{{wilaya}}" },
  { label: "Commune", value: String(vars.commune || ""), var: "{{commune}}" },
  { label: "Adresse", value: String(vars.addressLine || ""), var: "{{address}}" },
  { label: "Montant", value: String(vars.price ?? ""), var: "{{price}}" },
  { label: "Produits", value: String(vars.products || ""), var: "{{products}}" },
  {
    label: vars.stopDesk ? "Bureau de retrait" : "Livraison",
    value: vars.stopDesk
      ? [vars.deskName, vars.deskId && "id " + vars.deskId, vars.deskCommune].filter(Boolean).join(" · ") || "Au bureau"
      : "À domicile",
    var: "{{stopDesk}}",
  },
])

const communeCache = new Map()

const matchCommune = async (code, raw) => {
  const name = String(raw || "").trim()
  if (!code || !name) return name
  let list = communeCache.get(code)
  if (!list) {
    try {
      list = await dzship.communes(code)
      if (Array.isArray(list)) communeCache.set(code, list)
    } catch (_) { list = null }
  }
  if (!list) return name
  const want = WILAYAS.fold(name)
  const hit = list.find((c) => WILAYAS.fold(c.nameFr) === want)
    || list.find((c) => {
      const f = WILAYAS.fold(c.nameFr)
      return f.startsWith(want) || want.startsWith(f)
    })
  return hit ? hit.nameFr : name
}

const wilayaName = (code) => {
  const hit = GEO.WILAYAS.find((w) => WILAYAS.codeOf(w) === Number(code))
  return hit || WILAYAS.nameOf(code) || ""
}

const createParcel = async (carrier, store, order, vars) => {
  const info = courierOf(carrier)
  if (!info) return { ok: false, error: "Cette société n'est pas dans dzship." }
  const ctrl = check(vars, carrier)
  if (!ctrl.ok) {
    return { ok: false, error: "Champs manquants : " + ctrl.missing.map((m) => m.label).join(", "), missing: ctrl.missing }
  }
  const client = clientFor(carrier)
  const code = Number(vars.wilayaCode)
  let communeName = String(vars.commune || "").trim()
  try { communeName = await matchCommune(code, communeName) } catch (_) {}
  const orderBody = {
    reference: order.ref || undefined,
    recipient: {
      fullName: String(vars.fullName || "").trim(),
      phone: FIELDS.cleanPhone(vars.phone),
      wilayaCode: code,
      communeName,
      addressLine: String(vars.addressLine || "").trim() || undefined,
    },
    deliveryType: vars.stopDesk ? "stopdesk" : "home",
    productList: String(vars.products || "").slice(0, 255),
    codAmount: Math.max(0, Math.round(Number(vars.price) || 0)),
  }
  if (vars.stopDesk && vars.deskId) orderBody.stopDeskId = String(vars.deskId)
  if (vars.weight) orderBody.weightKg = Number(vars.weight) || undefined
  if (vars.freeShipping) orderBody.freeShipping = true
  if (vars.note) orderBody.notes = String(vars.note).slice(0, 255)
  try {
    const res = await client.createOrder(orderBody)
    const tracking = String(res.trackingNumber || "").trim()
    if (!tracking) return { ok: false, error: "Le bureau n'a pas renvoyé de numéro de suivi." }
    const label = String(res.label || res.labelUrl || res.label_url || "")
    return { ok: true, tracking, label: /^https?:/i.test(label) ? label : "", raw: JSON.stringify(res).slice(0, 800), status: res.status || "" }
  } catch (e) {
    return { ok: false, error: frenchError(e), status: e.status || 0 }
  }
}

const track = async (carrier, trackingNumber) => {
  const client = clientFor(carrier)
  if (!client) return { ok: false, error: "transporteur dzship introuvable" }
  try {
    const res = await client.track(trackingNumber)
    const status = String(res.status || "unknown")
    const events = (Array.isArray(res.events) ? res.events : []).slice(0, 20).map((e) => ({
      status: String(e.status || ""),
      label: STATUS_FR[e.status] || String(e.rawStatus || e.status || "Statut"),
      at: e.timestamp || "",
    }))
    return {
      ok: true,
      status,
      label: STATUS_FR[status] || status,
      mapped: STATUS_MAP[status] || "",
      events,
    }
  } catch (e) {
    return { ok: false, error: frenchError(e) }
  }
}

const test = async (carrier) => {
  const info = courierOf(carrier)
  if (!info) return { ok: false, status: 0, error: "Choisis une société de la liste dzship." }
  const missing = check({ fullName: "x", phone: "0550000000", wilayaCode: 16, commune: "x", products: "x", fromWilaya: carrier.origin_wilaya, addressLine: "x" }, carrier)
    .missing.filter((m) => /jeton|adresse du bureau|clé|identifiant|secret/i.test(m.label + m.how))
  if ((info.requiredCredentials || []).some((k) => !credentialsOf(carrier, info)[k])) {
    return { ok: false, status: 0, error: "Il manque un jeton : " + info.requiredCredentials.filter((k) => !credentialsOf(carrier, info)[k]).map(credLabel).join(", ") }
  }
  if (info.requiresBaseUrl && !baseUrlOf(carrier, info)) {
    return { ok: false, status: 0, error: "Colle l'adresse de ton bureau EcoTrack (https://….ecotrack.dz)." }
  }
  void missing
  const client = clientFor(carrier)
  const from = WILAYAS.codeOf(carrier.origin_wilaya) || 16
  try {
    if (info.capabilities && info.capabilities.rates) {
      const r = await client.rates({ fromWilaya: from, toWilaya: from === 16 ? 31 : 16, deliveryType: "home" })
      const fee = r && r.deliveryFee != null ? ` · livraison ${r.deliveryFee} DZD` : ""
      return { ok: true, status: 200, error: "Connexion dzship OK" + fee }
    }
    if (info.capabilities && info.capabilities.listStopDesks) {
      const desks = await client.desks(from)
      return { ok: true, status: 200, count: Array.isArray(desks) ? desks.length : 0, error: "" }
    }
    await client.track("ndz-connexion")
    return { ok: true, status: 200, error: "Connexion dzship OK" }
  } catch (e) {
    if (e && e.code === "NOT_FOUND") return { ok: true, status: 200, error: "Connexion dzship OK" }
    return { ok: false, status: e.status || 0, error: frenchError(e) }
  }
}

/** Bureaux d'une wilaya, ou de toutes les wilayas (plafond : le quota dzship est de 60 listes / minute). */
const importDesks = async (carrier) => {
  const info = courierOf(carrier)
  if (!info) return []
  if (!info.capabilities || !info.capabilities.listStopDesks) return []
  const client = clientFor(carrier)
  const rows = []
  for (let code = 1; code <= 58; code++) {
    let desks = []
    try {
      desks = await client.desks(code)
    } catch (e) {
      if (e && (e.code === "rate_limited" || e.code === "overloaded")) break
      if (e && e.code === "NOT_SUPPORTED") return []
      continue
    }
    if (!Array.isArray(desks)) continue
    const wilaya = wilayaName(code)
    for (const d of desks) {
      if (!d || !d.name) continue
      rows.push({
        id: String(d.id || d.name).slice(0, 60),
        name: String(d.name).slice(0, 120),
        wilaya,
        commune: String(d.communeName || "").slice(0, 60),
        address: String(d.address || "").slice(0, 160),
        phone: "",
      })
    }
  }
  return rows
}

const refreshCatalog = () => {
  dzship.couriers().then((list) => {
    if (!Array.isArray(list) || list.length < 20) return
    catalog = list
    try { fs.writeFileSync(SNAPSHOT, JSON.stringify(list)) } catch (_) {}
  }).catch(() => {})
}

const deskNote = (carrier) => {
  const info = courierOf(carrier)
  if (!info) return ""
  if (info.capabilities && info.capabilities.listStopDesks) {
    return "Les bureaux de retrait viennent de dzship. Récupère-les : le client choisit le sien à la commande."
  }
  return "Cette société ne publie pas de liste de bureaux. Le client choisit une commune, le bureau est affecté à l'arrivée."
}

refreshCatalog()


/** Tarif maison / bureau et bureaux d'une wilaya. Lecture seule : aucun colis n'est créé. */
const feeCents = (fee) => {
  const n = Number(fee)
  if (!Number.isFinite(n) || n < 0) return null
  return Math.round(n * 100)
}
const quote = async (carrier, wilaya, timeoutMs = 2500) => {
  const info = courierOf(carrier)
  const client = info ? clientFor(carrier) : null
  const code = WILAYAS.codeOf(wilaya)
  if (!client || !code) return null
  const from = WILAYAS.codeOf(carrier.origin_wilaya) || code
  const race = (job) => Promise.race([
    job,
    new Promise((_, rej) => setTimeout(() => rej(new Error("timeout")), timeoutMs)),
  ])
  const out = { home: null, desk: null, desks: [] }
  if (info.capabilities && info.capabilities.rates) {
    try {
      const home = await race(client.rates({ fromWilaya: from, toWilaya: code, deliveryType: "home" }))
      out.home = feeCents(home && home.deliveryFee)
    } catch (_) {}
    try {
      const desk = await race(client.rates({ fromWilaya: from, toWilaya: code, deliveryType: "stopdesk" }))
      out.desk = feeCents(desk && desk.deliveryFee)
    } catch (_) {}
  }
  if (info.capabilities && info.capabilities.listStopDesks) {
    try {
      const desks = await race(client.desks(code))
      if (Array.isArray(desks)) {
        out.desks = desks.filter((d) => d && d.name).slice(0, 40).map((d) => ({
          id: String(d.id || d.name).slice(0, 60),
          name: String(d.name).slice(0, 120),
          commune: String(d.communeName || "").slice(0, 60),
        }))
      }
    } catch (_) {}
  }
  if (out.home == null && out.desk == null && !out.desks.length) return null
  return out
}

module.exports = {
  handles, courierOf, presets, byKey, resolveKey, credLabel, platformLabel,
  credentialsOf, check, sheet, createParcel, track, test, importDesks, deskNote, refreshCatalog, quote,
  STATUS_FR,
}
