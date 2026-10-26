"use strict"
/**
 * Champs du formulaire de commande — modifiables par le marchand.
 *
 * Il choisit l'ordre (ce qui est en premier, ce qui est en dernier),
 * il peut enlever un texte, la position, un champ, ou n'importe quelle ligne.
 * Une ligne enlevée ne revient pas toute seule.
 * Il peut aussi écrire le formulaire en arabe.
 *
 * Les champs connus (nom, téléphone, wilaya, commune, adresse) restent lus
 * comme avant quand ils sont encore là.
 */
const { esc } = require("./ui")
const GEO = require("./geo")
const I18N = require("./i18n")

/** Champs proposés par défaut (identiques à l'ancien formulaire). */
const DEFAULT_FIELDS = [
  { key: "customer_name", label: "Nom complet", type: "text", required: true, width: "half", enabled: true, system: true, placeholder: "Amine Benali" },
  { key: "phone", label: "Téléphone", type: "tel", required: true, width: "half", enabled: true, system: true, placeholder: "0555 12 34 56" },
  { key: "wilaya", label: "Wilaya", type: "wilaya", required: true, width: "half", enabled: true, system: true },
  { key: "commune", label: "Commune", type: "commune", required: false, width: "half", enabled: true, system: true },
  { key: "address", label: "Adresse complète", type: "text", required: true, width: "full", enabled: true, system: true, placeholder: "Cité 200 logements, Bt B, appt 12" },
  { key: "note", label: "Note (facultatif)", type: "textarea", required: false, width: "full", enabled: true, system: true, placeholder: "Repère, horaire de livraison" },
  { key: "email", label: "E-mail", type: "email", required: false, width: "half", enabled: true, system: true, placeholder: "vous@exemple.dz" },
]

const NOTE_FR = "Paiement à la livraison. On vous appelle pour confirmer."
const BLOCKS = [
  { id: "variants", label: "Variante", hint: "Variantes" },
  { id: "qty", label: "Quantité", hint: "Quantité" },
  { id: "delivery", label: "Livraison", hint: "Maison ou bureau" },
  { id: "position", label: "Ma position", hint: "Position" },
  { id: "paynote", label: NOTE_FR, hint: "Texte sous le bouton" },
]
const BLOCK_IDS = new Set(BLOCKS.map((b) => b.id))
const DEFAULT_ORDER = [
  "variants", "qty", "delivery",
  "customer_name", "phone", "wilaya", "commune", "address", "note", "email",
  "position", "paynote",
]

const TYPES = ["text", "tel", "email", "textarea", "select"]
const MODELS = ["classique", "carte", "compact", "large", "ouvert", "etapes", "ticket", "nuit", "bloc", "dedans"]
const FORM_COLORS = [
  ["noir", "#111111"],
  ["vert", "#166534"],
  ["bleu", "#1D4ED8"],
  ["bordeaux", "#9F1239"],
  ["sable", "#92400E"],
  ["violet", "#6D28D9"],
]
const PRESETS = [
  { id: "taille", label: "Taille", type: "select", options: ["S", "M", "L", "XL"] },
  { id: "couleur", label: "Couleur", type: "select", options: ["Noir", "Blanc", "Beige", "Bleu"] },
  { id: "repere", label: "Point de repère", type: "text", options: [] },
  { id: "heure", label: "Heure de livraison", type: "select", options: ["Matin", "Après-midi", "Soir"] },
  { id: "tel2", label: "2e téléphone", type: "tel", options: [] },
]
const hexOk = (v) => /^#[0-9a-f]{6}$/i.test(String(v || ""))
const inkFor = (hex) => {
  const n = parseInt(String(hex).slice(1), 16)
  const y = (((n >> 16) & 255) * 299 + ((n >> 8) & 255) * 587 + (n & 255) * 114) / 1000
  return y > 165 ? "#111111" : "#ffffff"
}
const asList = (v) => (Array.isArray(v) ? v.map((x) => String(x)).slice(0, 40) : [])
const asMap = (v) => (v && typeof v === "object" && !Array.isArray(v) ? v : {})

const lookOf = (store) => {
  let raw = {}
  try { raw = JSON.parse((store && store.form_look) || "{}") || {} } catch (_) { raw = {} }
  const color = hexOk(raw.color) ? String(raw.color) : "#111111"
  return {
    model: MODELS.includes(raw.model) ? raw.model : "classique",
    color,
    ink: inkFor(color),
    variants: raw.variants !== false,
    delivery: raw.delivery === true,
    lang: raw.lang === "ar" || raw.lang === "fr" ? raw.lang : "",
    order: Array.isArray(raw.order) ? asList(raw.order) : null,
    off: asList(raw.off),
    idle: asList(raw.idle),
    labels: asMap(raw.labels),
    labels_ar: asMap(raw.labels_ar),
  }
}
const cleanLook = (body = {}) => {
  const color = hexOk(body.form_color) ? String(body.form_color) : "#111111"
  return {
    model: MODELS.includes(body.form_model) ? body.form_model : "classique",
    color,
    variants: body.form_variants === "1" || body.form_variants === "on",
    delivery: body.form_delivery === "1" || body.form_delivery === "on",
    lang: body.form_lang === "ar" || body.form_lang === "fr" ? body.form_lang : "",
  }
}
const lookStyle = (look) => `--ck:${look.color};--ck-ink:${look.ink}`
const SYSTEM_KEYS = DEFAULT_FIELDS.map((f) => f.key)

const cleanKey = (k) =>
  String(k || "").toLowerCase().replace(/[^a-z0-9_]/g, "_").replace(/^_+|_+$/g, "").slice(0, 30)

/** Langue du formulaire : choix du marchand, sinon celle de la page. */
const formLang = (store) => {
  const look = lookOf(store)
  if (look.lang === "ar" || look.lang === "fr") return look.lang
  return I18N.langNow(store)
}

const blockLabel = (id, look) => {
  const custom = look.labels && look.labels[id]
  if (custom) return String(custom).slice(0, 90)
  const b = BLOCKS.find((x) => x.id === id)
  return b ? b.label : id
}

/** Texte montré au client pour une ligne (variantes, quantité, note…). */
const pieceText = (store, id, lang) => {
  const look = lookOf(store)
  const L = lang || formLang(store)
  if (L === "ar" && look.labels_ar && look.labels_ar[id]) return String(look.labels_ar[id]).slice(0, 90)
  return I18N.t(L, blockLabel(id, look))
}

/**
 * Liste effective. Une liste enregistrée est la vérité :
 * un champ système enlevé ne revient pas.
 * Aucune liste enregistrée → les champs d'origine.
 */
const getFields = (store) => {
  let raw = null
  let saved = false
  if (store && store.form_fields != null && store.form_fields !== "") {
    try {
      raw = JSON.parse(store.form_fields)
      saved = Array.isArray(raw)
    } catch (_) { raw = null }
  }
  if (!saved) return DEFAULT_FIELDS.map((f) => ({ ...f }))
  const out = []
  const seen = new Set()
  raw.slice(0, 24).forEach((f) => {
    const key = cleanKey(f && f.key)
    if (!key || seen.has(key) || BLOCK_IDS.has(key)) return
    seen.add(key)
    const system = DEFAULT_FIELDS.find((d) => d.key === key)
    out.push({
      key,
      label: String((f && f.label) || (system && system.label) || "Champ").slice(0, 40),
      label_ar: String((f && f.label_ar) || "").slice(0, 40),
      type: system ? system.type : (TYPES.includes(f && f.type) ? f.type : "text"),
      required: !!(f && f.required),
      width: f && f.width === "full" ? "full" : "half",
      enabled: !(f && f.enabled === false),
      system: !!system,
      placeholder: String((f && f.placeholder) || (system && system.placeholder) || "").slice(0, 60),
      options: Array.isArray(f && f.options) ? f.options.slice(0, 20).map((o) => String(o).slice(0, 40)) : [],
    })
  })
  return out
}

/** Enregistre la configuration (renvoie la version nettoyée). */
const saveFields = (db, storeId, raw) => {
  const list = getFields({ form_fields: JSON.stringify(Array.isArray(raw) ? raw : []) })
  db.prepare("UPDATE stores SET form_fields = ? WHERE id = ?").run(JSON.stringify(list), storeId)
  return list
}

const activeFields = (store) => {
  let note = null
  try { note = require("./sections").readDesign(store).cartNote } catch (_) { note = null }
  return getFields(store).filter((f) => {
    if (f.key === "note" && note === false) return false
    if (f.key === "note" && note === true) return true
    return f.enabled
  })
}

/**
 * Lignes du formulaire, dans l'ordre du marchand.
 * opts.all garde aussi les lignes masquées (pas les lignes enlevées).
 */
const pieces = (store, opts = {}) => {
  const look = lookOf(store)
  const off = new Set(look.off || [])
  const idle = new Set(look.idle || [])
  const items = []
  for (const b of BLOCKS) {
    const gone = off.has(b.id)
    let on = !gone && !idle.has(b.id)
    if (b.id === "variants" && look.variants === false) on = false
    if (b.id === "delivery" && look.delivery !== true) on = false
    items.push({
      id: b.id,
      kind: "block",
      label: blockLabel(b.id, look),
      label_ar: (look.labels_ar && look.labels_ar[b.id]) || "",
      hint: b.hint,
      on,
      gone,
      field: null,
    })
  }
  for (const f of getFields(store)) {
    items.push({
      id: f.key,
      kind: "field",
      label: f.label,
      label_ar: f.label_ar || "",
      hint: "",
      on: f.enabled !== false,
      gone: false,
      field: f,
    })
  }
  const order = look.order && look.order.length ? look.order : DEFAULT_ORDER
  const rank = new Map(order.map((id, i) => [id, i]))
  items.sort((a, b) => (rank.has(a.id) ? rank.get(a.id) : 800) - (rank.has(b.id) ? rank.get(b.id) : 800))
  if (opts.all) return items.filter((p) => !p.gone)
  return items.filter((p) => p.on && !p.gone)
}

const persistLook = (db, storeId, look) => {
  const row = {
    model: look.model,
    color: look.color,
    variants: look.variants !== false,
    delivery: look.delivery === true,
    lang: look.lang === "ar" || look.lang === "fr" ? look.lang : "",
    order: asList(look.order),
    off: asList(look.off),
    idle: asList(look.idle),
    labels: asMap(look.labels),
    labels_ar: asMap(look.labels_ar),
  }
  db.prepare("UPDATE stores SET form_look = ? WHERE id = ?").run(JSON.stringify(row), storeId)
}

/** Remet une ligne enlevée (champ d'origine ou bloc). */
const restorePiece = (db, store, id) => {
  const key = String(id || "")
  const look = lookOf(store)
  const order = look.order && look.order.length ? look.order.slice() : DEFAULT_ORDER.slice()
  if (!order.includes(key)) order.push(key)
  persistLook(db, store.id, {
    ...look,
    order,
    off: (look.off || []).filter((x) => x !== key),
    idle: (look.idle || []).filter((x) => x !== key),
    variants: key === "variants" ? true : look.variants,
    delivery: key === "delivery" ? true : look.delivery,
  })
  const system = DEFAULT_FIELDS.find((d) => d.key === key)
  if (!system) return
  const list = getFields(store)
  if (!list.some((f) => f.key === key)) {
    list.push({ ...system })
    saveFields(db, store.id, list)
  }
}

/** Enregistre le formulaire depuis la page marchand. */
const saveFromBody = (db, store, body = {}) => {
  if (body.restore) {
    restorePiece(db, store, body.restore)
    return
  }
  const current = getFields(store)
  const posted = []
  const blocks = []
  let sawKey = false
  for (let i = 0; i < 40; i++) {
    const key = body[`key_${i}`]
    if (!key) continue
    sawKey = true
    const kind = body[`kind_${i}`] === "block" ? "block" : "field"
    const pos = Number(body[`pos_${i}`]) || i
    if (kind === "block") {
      if (!BLOCK_IDS.has(key)) continue
      blocks.push({
        id: key,
        pos,
        deleted: !!body[`del_${i}`],
        enabled: !!body[`enabled_${i}`],
        label: String(body[`label_${i}`] || "").slice(0, 90),
        label_ar: String(body[`label_ar_${i}`] || "").slice(0, 90),
      })
      continue
    }
    if (body[`del_${i}`]) continue
    const base = current.find((f) => f.key === key) || {}
    const options = String(body[`opt_${i}`] || "")
      .split(/[,·]/).map((s) => s.trim()).filter(Boolean).slice(0, 12)
    posted.push({
      key,
      label: String(body[`label_${i}`] || base.label || key).slice(0, 40),
      label_ar: String(body[`label_ar_${i}`] || "").slice(0, 40),
      type: (DEFAULT_FIELDS.find((d) => d.key === key) || {}).type
        || (["text", "tel", "email", "textarea", "select", "wilaya", "commune"].includes(body[`type_${i}`]) ? body[`type_${i}`] : "")
        || base.type || "text",
      required: !!body[`req_${i}`],
      enabled: !!body[`enabled_${i}`],
      width: body[`width_${i}`] === "full" ? "full" : "half",
      placeholder: String(body[`ph_${i}`] != null ? body[`ph_${i}`] : base.placeholder || "").slice(0, 60),
      options: options.length ? options : (base.options || []),
      pos,
    })
  }
  const list = (sawKey ? posted : current.map((f, i) => ({ ...f, pos: i }))).sort((a, b) => a.pos - b.pos)
  const preset = PRESETS.find((p) => p.id === body.preset)
  const addLabel = preset ? preset.label : String(body.add_label || "").trim()
  if (addLabel) {
    const key = preset
      ? "f_" + preset.id
      : "f_" + addLabel.toLowerCase().normalize("NFD").replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 20)
    if (key && !list.some((f) => f.key === key) && !BLOCK_IDS.has(key)) {
      const addType = preset ? preset.type : (["tel", "email", "textarea", "select"].includes(body.add_type) ? body.add_type : "text")
      const addOpts = preset ? preset.options : String(body.add_options || "").split(/[,·]/).map((s) => s.trim()).filter(Boolean).slice(0, 12)
      list.push({
        key, label: addLabel.slice(0, 40), type: addType,
        required: false, enabled: true, width: addType === "select" || addType === "textarea" ? "full" : "half",
        placeholder: "", options: addOpts, label_ar: "",
      })
    }
  }
  saveFields(db, store.id, list)
  if (!body.form_model) return
  const look = cleanLook(body)
  const order = []
  const off = []
  const idle = []
  const labels = {}
  const labelsAr = {}
  const rows = [
    ...blocks,
    ...list.map((f) => ({
      id: f.key, pos: f.pos || 0, deleted: false, enabled: f.enabled !== false,
      label: f.label, label_ar: f.label_ar || "", kind: "field",
    })),
  ].sort((a, b) => a.pos - b.pos)
  for (const row of rows) {
    const isBlock = BLOCK_IDS.has(row.id) && row.kind !== "field"
    if (isBlock && row.deleted) {
      off.push(row.id)
      continue
    }
    if (isBlock && !row.enabled) idle.push(row.id)
    order.push(row.id)
    if (isBlock) {
      if (row.label) labels[row.id] = row.label
      if (row.label_ar) labelsAr[row.id] = row.label_ar
    }
  }
  const rowOf = (id) => blocks.find((b) => b.id === id)
  const varRow = rowOf("variants")
  const dlvRow = rowOf("delivery")
  if (varRow) look.variants = !varRow.deleted && !!varRow.enabled
  if (dlvRow) look.delivery = !dlvRow.deleted && !!dlvRow.enabled
  if (off.includes("variants") || idle.includes("variants")) look.variants = false
  if (off.includes("delivery") || idle.includes("delivery")) look.delivery = false
  look.order = order
  look.off = off
  look.idle = idle
  look.labels = labels
  look.labels_ar = labelsAr
  persistLook(db, store.id, look)
}

/** Liste déroulante des wilayas, avec tarifs et délais en data-* */
const wilayaSelect = (extra = {}, selected = "", lang = "fr") => {
  const rates = (extra && extra.shipping) || {}
  const list = (extra && extra.wilayas) || GEO.WILAYAS
  const cells = list.map((w) => {
    const r = rates[w]
    const home = r && r.home != null ? r.home : 50000
    const desk = r && r.desk != null ? r.desk : Math.max(0, home - 10000)
    const emin = r && r.etaMin != null ? r.etaMin : extra.etaMin != null ? extra.etaMin : 2
    const emax = r && r.etaMax != null ? r.etaMax : extra.etaMax != null ? extra.etaMax : 4
    return `<option value="${esc(w)}" data-home="${home}" data-desk="${desk}" data-cents="${home}"
      data-eta-min="${emin}" data-eta-max="${emax}" data-ar="${esc(GEO.wilayaAr(w))}"
      ${selected === w ? "selected" : ""}>${esc(lang === "ar" && GEO.wilayaAr(w) ? GEO.wilayaAr(w) : w)}</option>`
  })
  return `<select name="wilaya" data-shipsel>${cells.join("")}</select>`
}

/** Suggestions de communes : celles de la wilaya déjà sélectionnée. */
const communeField = (extra = {}, selected = "Alger", lang = "fr") => {
  const csv = GEO.communesOf(selected)
    .map((c) => `<option value="${esc(c.fr)}"${lang === "ar" && c.ar ? ` label="${esc(c.ar)}"` : ""}>`)
    .join("")
  return `<label class="ck-f"><span>${esc(I18N.t(lang, "Commune"))}</span>
    <input name="commune" list="ck-communes" autocomplete="address-level2" placeholder="${esc(I18N.t(lang, "Tapez votre commune"))}"
      data-commune>
    <datalist id="ck-communes" data-commune-list>${csv}</datalist>
  </label>`
}

const iconPin = () =>
  `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"
    stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
    <path d="M12 21s7-5.6 7-11a7 7 0 1 0-14 0c0 5.4 7 11 7 11z"/><circle cx="12" cy="10" r="2.6"/></svg>`

const shownLabel = (f, lang) => {
  if (lang === "ar" && f.label_ar) return f.label_ar
  return I18N.t(lang, f.label)
}

/** Un champ, selon son type. */
const renderField = (f, store, extra = {}, lang = "fr", def = "Alger", look = null) => {
  const req = f.required ? " required" : ""
  const wide = f.width === "full" ? " ck-wide" : ""
  const optional = !f.required && !/facultatif/i.test(String(f.label || ""))
  const label = `<span>${esc(shownLabel(f, lang))}${optional ? ` <i class="ck-opt">${esc(I18N.t(lang, "facultatif"))}</i>` : ""}</span>`
  let control = ""
  if (f.type === "wilaya") control = wilayaSelect(extra, def, lang)
  else if (f.type === "commune") control = communeField(extra, def, lang).replace(/^<label[^>]*>|<\/label>$/g, "").replace(/<span>[^<]*<\/span>/, "")
  else if (f.type === "textarea") control = `<textarea name="${esc(f.key)}" rows="2" placeholder="${esc(I18N.t(lang, f.placeholder))}"${req}></textarea>`
  else if (f.type === "select" && look && look.model === "ouvert" && (f.options || []).length) {
    control = `<span class="ck-pills">${(f.options || []).map((o, i) => `<label class="ck-pill"><input type="radio" name="${esc(f.key)}" value="${esc(o)}" ${i === 0 ? "checked" : ""}${i === 0 && f.required ? " required" : ""}><span>${esc(o)}</span></label>`).join("")}</span>`
  } else if (f.type === "select") {
    const opts = (f.options || []).map((o) => `<option value="${esc(o)}">${esc(o)}</option>`).join("")
    control = `<select name="${esc(f.key)}"${req}>${opts || '<option value="">—</option>'}</select>`
  } else {
    const t = f.type === "tel" ? "tel" : f.type === "email" ? "email" : "text"
    const mode = f.type === "tel" ? ' inputmode="tel"' : ""
    const ac = f.key === "customer_name" ? ' autocomplete="name"' : f.key === "phone" ? ' autocomplete="tel"' : f.key === "email" ? ' autocomplete="email"' : ""
    control = `<input name="${esc(f.key)}" type="${t}"${mode}${ac} placeholder="${esc(I18N.t(lang, f.placeholder))}"${req}>`
  }
  return `<label class="ck-f${wide}${f.type === "textarea" ? " ck-area" : ""}">${label}${control}</label>`
}

/** Bouton position, séparé pour pouvoir le déplacer ou l'enlever. */
const geoBlock = (store, lang, label) => `\
<div class="ck-geo">
  <button type="button" class="ck-geo-btn" data-geo>${iconPin()} ${esc(label || I18N.t(lang, "Ma position"))}</button>
  <span class="ck-geo-note" data-geo-note>${esc(I18N.t(lang, "Si vous acceptez la position, la wilaya et la commune se remplissent."))}</span>
  <a class="ck-geo-map" data-geo-map target="_blank" rel="noopener" hidden>${esc(I18N.t(lang, "Voir sur la carte"))}</a>
  <input type="hidden" name="geo_lat"><input type="hidden" name="geo_lng"><input type="hidden" name="geo_acc">
</div>`

/** Le bloc complet : champs du marchand + délai + position GPS. */
const fields = (store, extra = {}) => {
  const def = store && GEO.isWilaya(store.wilaya) ? store.wilaya : "Alger"
  const lang = formLang(store)
  const list = activeFields(store)
  const look = lookOf(store)
  const off = new Set(look.off || [])
  const idle = new Set(look.idle || [])
  const hasGeo = !extra.skipGeo && !off.has("position") && !idle.has("position")
    && list.some((f) => f.key === "address" || f.key === "commune" || f.type === "wilaya")
  return `
<div class="ck-look ck-${look.model}" style="${lookStyle(look)}">
<div class="ck-grid">
  ${list.map((f) => renderField(f, store, extra, lang, def, look)).join("\n  ")}
</div>
<p class="ck-eta" data-eta></p>
${hasGeo ? geoBlock(store, lang, pieceText(store, "position", lang)) : ""}
</div>`
}

/**
 * Lit la réponse du formulaire selon la configuration.
 * Renvoie { values, missing } : `values` contient les champs connus + les
 * réponses aux champs ajoutés par le marchand.
 */
const collect = (store, body = {}) => {
  const list = activeFields(store)
  const values = {}
  const extra = {}
  const missing = []
  for (const f of list) {
    const raw = body[f.key]
    const v = f.type === "textarea" ? String(raw || "").slice(0, 500) : String(raw || "").trim().slice(0, 120)
    values[f.key] = v
    if (!f.system) extra[f.label] = v
    if (f.required && !v) missing.push(f.label)
  }
  return { values, extra, missing }
}

module.exports = {
  fields, renderField, collect, getFields, saveFields, activeFields, wilayaSelect, communeField,
  DEFAULT_FIELDS, SYSTEM_KEYS, lookOf, cleanLook, lookStyle, MODELS, FORM_COLORS, PRESETS,
  BLOCKS, pieces, formLang, pieceText, geoBlock, saveFromBody, restorePiece, NOTE_FR,
}
