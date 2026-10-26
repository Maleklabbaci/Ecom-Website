"use strict"
/**
 * Client HTTP générique pour n'importe quel bureau de livraison.
 *
 * Le marchand décrit ses appels depuis l'écran « Transporteur ». Rien n'est codé
 * en dur pour un transporteur précis : le moteur exécute la configuration.
 *
 * Trois familles réelles d'API algériennes, toutes exprimables ici :
 *  - Yalidine & clones : POST JSON d'un TABLEAU sur /v1/parcels/, en-têtes X-API-ID/X-API-TOKEN
 *  - EcoTrack & ~82 bureaux (DHD, Conexlog, MSM Go…) : POST en QUERY STRING + 2ᵉ appel /valid/order
 *  - Procolis / ZR legacy / NOEST : POST JSON d'un objet, parfois suivi d'une validation
 *
 * D'où deux notions :
 *  - `body_mode` : "json" | "query" | "form"
 *  - `steps`     : suite d'appels numérotés, chacun pouvant capturer une valeur
 *                  (numéro de suivi, identifiant client, UUID de commune…)
 */

const DEFAULTS = { timeout: 12000, maxSteps: 6 }

/* ------------------------------ lecture de chemins ------------------------------ */
/**
 * Lit `a.b.0.c` ou `a.b[0].c` dans un objet. `{cle}` est résolu depuis `ctx`
 * (permet de lire une réponse indexée par référence de commande).
 */
const getPath = (obj, path, ctx = {}) => {
  if (!path) return undefined
  const filled = String(path).replace(/\{([A-Za-z0-9_]+)\}/g, (m, k) => (ctx[k] == null ? m : String(ctx[k])))
  const parts = filled.replace(/\[(\d+)\]/g, ".$1").split(".").filter((p) => p !== "")
  let cur = obj
  for (const p of parts) {
    if (cur == null) return undefined
    cur = cur[p]
  }
  return cur
}

/* ------------------------------ rendu des variables ------------------------------ */
const renderString = (tpl, vars) =>
  String(tpl).replace(/\{\{\s*([A-Za-z0-9_]+)\s*\}\}/g, (m, k) => (vars[k] == null ? "" : String(vars[k])))

/**
 * Remplit un CHEMIN d'URL. Deux écritures cohabitent dans l'interface :
 *   {tracking}   (raccourci, utilisé dans les chemins)
 *   {{tracking}} (forme complète)
 * Les deux doivent marcher — c'était un bug : seul {{...}} était remplacé.
 */
const fillPath = (tpl, vars) =>
  renderString(String(tpl || "").replace(/\{([A-Za-z0-9_]+)\}/g, "{{$1}}"), vars)

const renderDeep = (node, vars) => {
  if (typeof node === "string") {
    const solo = node.match(/^\{\{\s*([A-Za-z0-9_]+)\s*\}\}$/)
    if (solo) return vars[solo[1]] == null ? "" : vars[solo[1]]
    return renderString(node, vars)
  }
  if (Array.isArray(node)) return node.map((n) => renderDeep(n, vars))
  if (node && typeof node === "object") {
    const out = {}
    for (const [k, v] of Object.entries(node)) out[renderString(k, vars)] = renderDeep(v, vars)
    return out
  }
  return node
}

/* ------------------------------ en-têtes ------------------------------ */
/**
 * En-têtes à envoyer. On accepte soit une table finale `{ "X-API-TOKEN": "..." }`
 * (fournie par carriers/index.js), soit `{1:"id",2:"token"}` avec les modèles
 * header1_name/header1_value de la configuration.
 */
const resolveHeaders = (cfg, hdrs = {}) => {
  const isFinal = hdrs && typeof hdrs === "object" && Object.keys(hdrs).length > 0 && !("1" in hdrs)
  if (isFinal) {
    const hasCt = Object.keys(hdrs).some((k) => k.toLowerCase() === "content-type")
    return hasCt ? { ...hdrs } : { "Content-Type": "application/json", ...hdrs }
  }
  const out = {}
  for (const i of [1, 2, 3]) {
    const name = cfg[`header${i}_name`]
    const value = cfg[`header${i}_value`]
    if (name && value) out[renderString(name, hdrs)] = renderString(value, hdrs)
  }
  if (!Object.keys(out).length) out["Content-Type"] = "application/json"
  return out
}

const url = (cfg, p) => {
  const base = String(cfg.base_url || "").replace(/\/+$/, "")
  const sub = String(p || "").startsWith("/") ? p : "/" + (p || "")
  return base + sub
}

/** Sérialise un objet selon le mode attendu par le bureau. */
const encodeBody = (obj, mode) => {
  if (mode === "query" || mode === "form") {
    const qs = new URLSearchParams()
    for (const [k, v] of Object.entries(obj || {})) {
      if (v == null) continue
      if (Array.isArray(v)) v.forEach((x) => qs.append(k, typeof x === "object" ? JSON.stringify(x) : String(x)))
      else if (typeof v === "object") qs.append(k, JSON.stringify(v))
      else qs.append(k, String(v))
    }
    return qs.toString()
  }
  return JSON.stringify(obj)
}

const contentType = (mode) =>
  mode === "form" ? "application/x-www-form-urlencoded" : "application/json"

/* ------------------------------ appel unitaire ------------------------------ */
/**
 * Un appel HTTP. `mode` = "json" | "query" | "form".
 * En mode query, les paramètres partent dans l'URL et le corps est vide.
 */
const call = async (cfg, pathTemplate, { method = "GET", body, mode = "json", vars = {}, secrets = {} } = {}) => {
  const hdrs = resolveHeaders(cfg, secrets)
  const hasCt = Object.keys(hdrs).some((k) => k.toLowerCase() === "content-type")
  const payload = body === undefined ? undefined : JSON.stringify(body)
  let target = url(cfg, fillPath(pathTemplate, vars))
  let init = { method, headers: hdrs, signal: AbortSignal.timeout(DEFAULTS.timeout) }

  if (body !== undefined && method !== "GET") {
    if (mode === "query") {
      const qs = encodeBody(body, "query")
      target += (target.includes("?") ? "&" : "?") + qs
      /* certaines API veulent les paramètres en query ET refusent un corps vide */
      init = { method, headers: hdrs, signal: AbortSignal.timeout(DEFAULTS.timeout) }
    } else {
      init.body = encodeBody(body, mode)
      init.headers = hasCt ? hdrs : { ...hdrs, "Content-Type": contentType(mode) }
      if (!hasCt) init.headers["Content-Type"] = contentType(mode)
    }
  }

  let res
  let text = ""
  try {
    res = await fetch(target, init)
    text = await res.text()
  } catch (e) {
    return { ok: false, status: 0, error: `Connexion impossible : ${e.message}`, url: target }
  }
  let json = null
  try { json = text ? JSON.parse(text) : null } catch (_) { json = null }
  return { ok: res.ok, status: res.status, json, text: text.slice(0, 1200), url: target, payload }
}

/* ------------------------------ pipeline de création ------------------------------ */
/**
 * Construit la liste des appels à exécuter.
 *
 * Si `create_steps` est renseigné (JSON), il décrit précisément la séquence.
 * Sinon on retombe sur l'appel unique historique (create_method/create_path/create_body).
 */
const stepsOf = (cfg) => {
  if (cfg.create_steps) {
    try {
      const arr = JSON.parse(cfg.create_steps)
      if (Array.isArray(arr) && arr.length) return arr.slice(0, DEFAULTS.maxSteps)
    } catch (_) { /* configuration invalide : on utilisera l'appel unique */ }
  }
  return [{
    method: cfg.create_method || "POST",
    path: cfg.create_path || "/parcels",
    body_mode: cfg.create_body_mode || "json",
    body: cfg.create_body || "{}",
  }]
}

/** Le corps d'une étape peut être un objet (déjà parsé) ou une chaîne JSON. */
const bodyOf = (step) => {
  if (step.body === undefined || step.body === null) return undefined
  if (typeof step.body === "object") return step.body
  try { return JSON.parse(step.body) } catch (_) { return null }
}

/**
 * Crée le colis. Renvoie { ok, tracking, label, error, status, raw, steps }.
 * Aucune exception : une panne du transporteur ne doit jamais casser la commande.
 */
const createParcel = async (cfg, vars, secrets) => {
  const ctx = { ...vars }
  const steps = stepsOf(cfg)
  let last = null
  let tracking = ""
  let label = ""
  const trace = []

  for (let i = 0; i < steps.length; i++) {
    const step = steps[i]
    const rawBody = bodyOf(step)
    if (rawBody === null) {
      return { ok: false, error: `Étape ${i + 1} : le corps n'est pas un JSON valide.`, steps: trace }
    }
    const body = rawBody === undefined ? undefined : renderDeep(rawBody, ctx)
    const mode = step.body_mode || cfg.create_body_mode || "json"

    const r = await call(cfg, step.path, {
      method: (step.method || "POST").toUpperCase(),
      body,
      mode,
      vars: ctx,
      secrets,
    })
    last = r
    trace.push({ step: i + 1, path: step.path, status: r.status, ok: r.ok })

    if (!r.ok) {
      const msg = r.json ? getPath(r.json, step.error_path || cfg.resp_error_path, ctx) : null
      const fallback = r.json ? getPath(r.json, cfg.resp_message_path || "", ctx) : null
      return {
        ok: false,
        status: r.status,
        error: msg || fallback || r.text || `HTTP ${r.status}`,
        raw: r.text,
        steps: trace,
      }
    }

    /* valeur d'échec renvoyée avec un code 200 (Procolis : MessageRetour) */
    if (step.error_path && r.json) {
      const v = getPath(r.json, step.error_path, ctx)
      const okValues = Array.isArray(step.ok_values) ? step.ok_values.map(String) : []
      if (v != null && String(v) !== "" && !okValues.includes(String(v))) {
        return { ok: false, status: r.status, error: String(v), raw: r.text, steps: trace }
      }
    }

    /* on mémorise ce que les étapes suivantes vont devoir réutiliser */
    if (step.capture && typeof step.capture === "object") {
      for (const [name, path] of Object.entries(step.capture)) {
        const v = getPath(r.json, path, ctx)
        if (v != null && v !== "") ctx[name] = v
      }
    }

    if (step.require_tracking) {
      const t = getPath(r.json, step.require_tracking, ctx)
      if (t == null || t === "") {
        const msg = r.json ? getPath(r.json, cfg.resp_message_path || "", ctx) : null
        return { ok: false, status: r.status, error: msg || r.text || "numéro de suivi absent", raw: r.text, steps: trace }
      }
    }
  }

  const finalJson = last ? last.json : null
  tracking = ctx.tracking != null ? String(ctx.tracking) : ""
  if (!tracking && finalJson) {
    const t = getPath(finalJson, cfg.resp_tracking_path, ctx)
    if (t != null) tracking = String(t)
  }
  if (finalJson) {
    const l = getPath(finalJson, cfg.resp_label_path, ctx)
    if (l != null) label = String(l)
  }

  if (!tracking) {
    const msg = finalJson ? getPath(finalJson, cfg.resp_message_path || cfg.resp_error_path, ctx) : null
    return { ok: false, status: last ? last.status : 0, error: msg || (last && last.text) || "numéro de suivi absurde", raw: last && last.text, steps: trace }
  }
  return { ok: true, tracking, label, status: last.status, raw: last ? last.text : "", steps: trace }
}

/* ------------------------------ suivi ------------------------------ */
/**
 * Lit le statut d'un colis et le traduit avec la table de correspondance du marchand.
 * `status_method` + `status_body` couvrent les API qui veulent un POST (NOEST, Procolis).
 */
const parcelStatus = async (cfg, tracking, secrets) => {
  const method = (cfg.status_method || "GET").toUpperCase()
  let body
  if (cfg.status_body) {
    try {
      body = JSON.parse(renderString(cfg.status_body, { tracking }))
    } catch (_) {
      return { ok: false, status: 0, error: "Le corps de suivi n'est pas un JSON valide." }
    }
    body = renderDeep(body, { tracking })
  }
  const r = await call(cfg, cfg.status_path || `/parcels/?tracking={tracking}`, {
    method,
    body,
    mode: cfg.status_body_mode || "json",
    vars: { tracking },
    secrets,
  })
  if (!r.ok || !r.json) return { ok: false, status: r.status, error: r.text || "statut illisible" }

  let raw = getPath(r.json, cfg.status_state_field, { tracking })
  if (raw == null) raw = getPath(r.json, cfg.status_state_field)
  if (raw == null && Array.isArray(r.json.data) && r.json.data[0]) {
    raw = getPath(r.json.data[0], cfg.status_state_field, { tracking })
  }
  const text = raw == null ? "" : String(raw)
  let map = {}
  try { map = JSON.parse(cfg.status_map || "{}") } catch (_) { map = {} }
  const norm = text.trim().toLowerCase()
  const mapped = map[norm] || map[text] || ""
  return { ok: true, raw: text, mapped, status: r.status }
}

/* ------------------------------ communes ------------------------------ */
/** Retrouve le tableau des communes dans la réponse, via le chemin configuré. */
const listAt = (json, listPath) => {
  if (listPath) {
    const v = getPath(json, listPath)
    if (Array.isArray(v)) return v
  }
  if (Array.isArray(json)) return json
  for (const k of ["data", "centers", "communes", "resultats", "results", "items", "desks"]) {
    if (json && Array.isArray(json[k])) return json[k]
  }
  /* réponse indexée par identifiant : { "16": {...}, "09": {...} } */
  if (json && typeof json === "object") {
    const vals = Object.values(json)
    if (vals.length && vals.every((v) => v && typeof v === "object" && !Array.isArray(v))) return vals
  }
  return []
}

const centers = async (cfg, secrets) => {
  if (!cfg.centers_path) return []
  const r = await call(cfg, cfg.centers_path, {
    method: (cfg.centers_method || "GET").toUpperCase(),
    mode: "json",
    secrets,
  })
  if (!r.ok || !r.json) return []
  const arr = listAt(r.json, cfg.centers_list_path)
  const idField = cfg.center_id_field || "id"
  const nameField = cfg.center_name_field || "name"
  /* Les bureaux arrivent avec des noms de champs différents selon le transporteur :
     on tente les clés les plus courantes pour la wilaya, la commune, l'adresse et le téléphone. */
  const pick = (obj, keys) => {
    for (const k of keys) {
      const v = getPath(obj, k)
      if (v != null && String(v).trim() !== "") return String(v).trim()
    }
    return ""
  }
  return arr
    .map((c) => ({
      id: String(getPath(c, idField) ?? ""),
      name: String(getPath(c, nameField) ?? ""),
      wilaya: pick(c, ["wilaya", "wilaya_name", "zone", "state", "province", "wilayaName"]),
      commune: pick(c, ["commune", "city", "commune_name", "municipality", "address.city"]),
      address: pick(c, ["address", "adresse", "street", "location", "full_address"]),
      phone: pick(c, ["phone", "telephone", "phone_number", "contact", "mobile"]),
    }))
    .filter((c) => c.id && c.name)
    .slice(0, 3000)
}

/* ------------------------------ bordereau (PDF) ------------------------------ */
/**
 * Récupère l'étiquette. Deux comportements existent chez les bureaux :
 *  - une URL dans la réponse JSON (Yalidine, ZR, Maystro) : rien à télécharger
 *  - un PDF binaire renvoyé directement (EcoTrack, DHD, NOEST) : on le récupère ici
 */
const label = async (cfg, tracking, secrets, urlFromCreate = "", extraVars = {}) => {
  if (urlFromCreate) return { ok: true, url: urlFromCreate }
  if (!cfg.label_path) return { ok: false, error: "aucun chemin de bordereau configuré" }

  const method = (cfg.label_method || "GET").toUpperCase()
  let body
  if (cfg.label_body) {
    try { body = JSON.parse(renderString(cfg.label_body, { ...extraVars, tracking })) } catch (_) {
      return { ok: false, error: "Le corps du bordereau n'est pas un JSON valide." }
    }
    body = renderDeep(body, { ...extraVars, tracking })
  }

  const ctx = { ...extraVars, tracking }
  const target = url(cfg, fillPath(cfg.label_path, ctx))
  const hdrs = resolveHeaders(cfg, secrets)
  const init = { method, headers: hdrs, signal: AbortSignal.timeout(DEFAULTS.timeout) }
  if (body && method !== "GET") {
    const hasCt = Object.keys(hdrs).some((k) => k.toLowerCase() === "content-type")
    init.body = encodeBody(body, cfg.label_body_mode || "json")
    if (!hasCt) init.headers = { ...hdrs, "Content-Type": "application/json" }
  }

  let res
  try {
    res = await fetch(target, init)
  } catch (e) {
    return { ok: false, status: 0, error: `Connexion impossible : ${e.message}` }
  }
  const buf = Buffer.from(await res.arrayBuffer())
  if (buf.length > 4 && buf.subarray(0, 4).toString() === "%PDF") {
    return { ok: true, pdf: buf, status: res.status }
  }
  /* certains bureaux renvoient { url } ou { fileUrl } */
  let json = null
  try { json = JSON.parse(buf.toString("utf8")) } catch (_) { json = null }
  const u = json ? getPath(json, cfg.label_url_field || "url") : null
  if (u) return { ok: true, url: String(u), status: res.status }
  return { ok: false, status: res.status, error: buf.toString("utf8").slice(0, 300) || `HTTP ${res.status}` }
}

/* ------------------------------ test ------------------------------ */
/** Test de connexion : lit la liste des communes si elle est configurée, sinon la racine. */
const test = async (cfg, secrets) => {
  const path = cfg.centers_path || "/"
  const r = await call(cfg, path, { method: (cfg.centers_method || "GET").toUpperCase(), secrets })
  const count = r.json ? listAt(r.json, cfg.centers_list_path).length : null
  return {
    ok: r.status > 0 && r.ok,
    status: r.status || 0,
    url: r.url,
    count,
    error: r.ok ? null : (r.text || "réponse inattendue"),
  }
}

module.exports = {
  getPath, renderString, fillPath, renderDeep, resolveHeaders, encodeBody, url, call,
  stepsOf, test, centers, listAt, createParcel, parcelStatus, label,
}
