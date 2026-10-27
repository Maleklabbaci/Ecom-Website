"use strict"
/**
 * Transporteurs — configuration par boutique et envoi des colis.
 *
 * Principe : aucun transporteur n'est codé en dur. Le marchand choisit un
 * préréglage (Yalidine, DHD, ZR, NOEST, Maystro…) ou « Autre », puis ajuste
 * tout : URL, en-têtes, corps, modes d'envoi, chemins de réponse.
 * Le moteur (`generic.js`) exécute ce que le marchand a décrit.
 */
const db = require("./db")
const SECRETS = require("./secrets")
const GENERIC = require("./carriers-generic")
const OLD = require("./carriers-presets")
const DZ = require("./dzship")
const presets = DZ.presets()
const byKey = (key) => DZ.byKey(key) || OLD.byKey(key)
const COMMON_STATUS_MAP = OLD.COMMON_STATUS_MAP
const WILAYAS = require("./wilayas")
const FIELDS = require("./parcel-fields")

/* ------------------------------ schéma ------------------------------ */
db.exec(`
CREATE TABLE IF NOT EXISTS carriers (
  id                 INTEGER PRIMARY KEY AUTOINCREMENT,
  store_id           INTEGER NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  preset             TEXT NOT NULL DEFAULT 'custom',
  label              TEXT NOT NULL,
  enabled            INTEGER NOT NULL DEFAULT 1,
  base_url           TEXT NOT NULL DEFAULT '',
  origin_wilaya      TEXT DEFAULT '',
  header1_name       TEXT DEFAULT '',
  header1_value_enc  TEXT DEFAULT '',
  header2_name       TEXT DEFAULT '',
  header2_value_enc  TEXT DEFAULT '',
  header3_name       TEXT DEFAULT '',
  header3_value_enc  TEXT DEFAULT '',
  create_method      TEXT NOT NULL DEFAULT 'POST',
  create_path        TEXT NOT NULL DEFAULT '/parcels',
  create_body        TEXT DEFAULT '{}',
  create_body_mode   TEXT DEFAULT 'json',
  create_steps       TEXT DEFAULT '',
  resp_tracking_path TEXT DEFAULT 'tracking',
  resp_label_path    TEXT DEFAULT 'label',
  resp_error_path    TEXT DEFAULT 'message',
  resp_message_path  TEXT DEFAULT '',
  centers_path       TEXT DEFAULT '',
  centers_method     TEXT DEFAULT 'GET',
  centers_list_path  TEXT DEFAULT '',
  center_id_field    TEXT DEFAULT 'id',
  center_name_field  TEXT DEFAULT 'name',
  label_path         TEXT DEFAULT '',
  label_method       TEXT DEFAULT 'GET',
  label_body         TEXT DEFAULT '',
  status_path        TEXT DEFAULT '',
  status_method      TEXT DEFAULT 'GET',
  status_body        TEXT DEFAULT '',
  status_state_field TEXT DEFAULT 'status',
  status_map         TEXT DEFAULT '{}',
  last_test_at       TEXT,
  last_test_status   INTEGER,
  last_test_message  TEXT,
  created_at         TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS shipments (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  store_id   INTEGER NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  order_id   INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  carrier_id INTEGER NOT NULL REFERENCES carriers(id) ON DELETE CASCADE,
  tracking   TEXT DEFAULT '',
  label_url  TEXT DEFAULT '',
  state      TEXT DEFAULT '',
  mapped     TEXT DEFAULT '',
  payload    TEXT DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  synced_at  TEXT
);
CREATE INDEX IF NOT EXISTS idx_ship_store ON shipments(store_id, id DESC);
CREATE INDEX IF NOT EXISTS idx_ship_order ON shipments(order_id);
`)

db.exec(`
CREATE TABLE IF NOT EXISTS carrier_centers (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  carrier_id  INTEGER NOT NULL REFERENCES carriers(id) ON DELETE CASCADE,
  external_id TEXT NOT NULL,
  name        TEXT NOT NULL,
  wilaya      TEXT DEFAULT '',
  fetched_at  TEXT NOT NULL DEFAULT (datetime('now'))
);
`)

/* ------------------------- migrations douces ------------------------- */
const cols = (t) => db.prepare(`PRAGMA table_info(${t})`).all().map((c) => c.name)
const addCol = (t, n, d) => { if (!cols(t).includes(n)) db.exec(`ALTER TABLE ${t} ADD COLUMN ${n} ${d}`) }

addCol("carrier_centers", "commune", "TEXT DEFAULT ''")
addCol("carrier_centers", "address", "TEXT DEFAULT ''")
addCol("carrier_centers", "phone", "TEXT DEFAULT ''")
addCol("carriers", "origin_wilaya", "TEXT DEFAULT ''")
addCol("carriers", "create_body_mode", "TEXT DEFAULT 'json'")
addCol("carriers", "create_steps", "TEXT DEFAULT ''")
addCol("carriers", "resp_message_path", "TEXT DEFAULT ''")
addCol("carriers", "centers_method", "TEXT DEFAULT 'GET'")
addCol("carriers", "centers_list_path", "TEXT DEFAULT ''")
addCol("carriers", "label_path", "TEXT DEFAULT ''")
addCol("carriers", "label_method", "TEXT DEFAULT 'GET'")
addCol("carriers", "label_body", "TEXT DEFAULT ''")
addCol("carriers", "status_method", "TEXT DEFAULT 'GET'")
addCol("carriers", "status_body", "TEXT DEFAULT ''")
addCol("orders", "carrier_id", "INTEGER")
addCol("orders", "tracking", "TEXT DEFAULT ''")
addCol("orders", "label_url", "TEXT DEFAULT ''")
addCol("orders", "label_file", "TEXT DEFAULT ''")
addCol("shipments", "label_file", "TEXT DEFAULT ''")
addCol("shipments", "carrier_label", "TEXT DEFAULT ''")
addCol("shipments", "events", "TEXT DEFAULT ''")

/* ------------------------------ lecture ------------------------------ */
const list = (storeId) =>
  db.prepare("SELECT * FROM carriers WHERE store_id = ? ORDER BY enabled DESC, id").all(storeId)

const active = (storeId) =>
  db.prepare("SELECT * FROM carriers WHERE store_id = ? AND enabled = 1 ORDER BY id LIMIT 1").get(storeId)

const get = (id, storeId) =>
  db.prepare("SELECT * FROM carriers WHERE id = ? AND store_id = ?").get(id, storeId)

/** En-têtes prêts à envoyer. Source unique de vérité, jamais exposée au navigateur. */
const headersFor = (carrier) => {
  if (!carrier) return {}
  const out = {}
  for (const i of [1, 2, 3]) {
    const name = String(carrier[`header${i}_name`] || "").trim()
    const val = SECRETS.decrypt(carrier[`header${i}_value_enc`])
    if (name && val) out[name] = val
  }
  if (!Object.keys(out).length) out["Accept"] = "application/json"
  return out
}

/**
 * Valeurs secrètes réutilisables dans les corps de requête.
 * Certaines API (NOEST) exigent le jeton DANS le corps, pas seulement en en-tête.
 */
const secretVars = (carrier) => {
  const h1 = SECRETS.decrypt(carrier.header1_value_enc) || ""
  const h2 = SECRETS.decrypt(carrier.header2_value_enc) || ""
  return {
    apiToken: h1.replace(/^Bearer\s+/i, ""),
    userGuid: h2,
    apiId: h1,
    apiKey: h1,
  }
}

/** Configuration prête à l'emploi : table de statuts fusionnée avec le vocabulaire commun. */
const runtime = (carrier) => {
  if (!carrier) return null
  let statusMap = {}
  try { statusMap = JSON.parse(carrier.status_map || "{}") } catch (_) { statusMap = {} }
  return { ...carrier, statusMap: { ...COMMON_STATUS_MAP, ...statusMap } }
}

/* ------------------------------ écriture ------------------------------ */
const save = (storeId, body, id) => {
  const preset = byKey(body.preset || "custom")
  const cfg = preset.config
  const pick = (k, fallback) => (body[k] !== undefined && body[k] !== "" ? String(body[k]) : (fallback || ""))
  const str = (k, fallback) => (body[k] !== undefined ? String(body[k]) : (fallback || ""))

  const data = {
    preset: body.preset || "custom",
    label: String(body.label || preset.label).slice(0, 60),
    enabled: body.enabled ? 1 : 0,
    base_url: String(body.base_url || cfg.base_url || "").trim().replace(/\/+$/, ""),
    origin_wilaya: String(body.origin_wilaya !== undefined ? body.origin_wilaya : (cfg.origin_wilaya || "")).trim(),
    header1_name: pick("header1_name", cfg.header1_name),
    header2_name: pick("header2_name", cfg.header2_name),
    header3_name: str("header3_name", cfg.header3_name || ""),
    create_method: ["POST", "PUT", "PATCH"].includes(String(body.create_method || "").toUpperCase())
      ? String(body.create_method).toUpperCase() : "POST",
    create_path: pick("create_path", cfg.create_path),
    create_body: String(body.create_body || cfg.create_body || "{}"),
    create_body_mode: ["json", "query", "form"].includes(String(body.create_body_mode || ""))
      ? String(body.create_body_mode) : (cfg.create_body_mode || "json"),
    create_steps: body.create_steps !== undefined ? String(body.create_steps) : (cfg.create_steps || ""),
    resp_tracking_path: str("resp_tracking_path", cfg.resp_tracking_path),
    resp_label_path: str("resp_label_path", cfg.resp_label_path),
    resp_error_path: str("resp_error_path", cfg.resp_error_path),
    resp_message_path: str("resp_message_path", cfg.resp_message_path),
    centers_path: str("centers_path", cfg.centers_path),
    centers_method: String(body.centers_method || cfg.centers_method || "GET").toUpperCase(),
    centers_list_path: str("centers_list_path", cfg.centers_list_path),
    center_id_field: pick("center_id_field", cfg.center_id_field || "id"),
    center_name_field: pick("center_name_field", cfg.center_name_field || "name"),
    label_path: str("label_path", cfg.label_path),
    label_method: String(body.label_method || cfg.label_method || "GET").toUpperCase(),
    label_body: str("label_body", cfg.label_body),
    status_path: str("status_path", cfg.status_path),
    status_method: String(body.status_method || cfg.status_method || "GET").toUpperCase(),
    status_body: str("status_body", cfg.status_body),
    status_state_field: pick("status_state_field", cfg.status_state_field || "status"),
    status_map: String(body.status_map || cfg.status_map || "{}"),
  }

  /* les secrets ne sont réécrits que si le marchand en saisit un nouveau */
  const enc = (i) => {
    const v = body[`header${i}_value`]
    return v === undefined || v === null || v === "" ? null : SECRETS.encrypt(String(v).trim())
  }
  const e1 = enc(1)
  const e2 = enc(2)
  const e3 = enc(3)

  if (id) {
    db.prepare(`UPDATE carriers SET preset = ?, label = ?, enabled = ?, base_url = ?, origin_wilaya = ?,
      header1_name = ?, header2_name = ?, header3_name = ?,
      header1_value_enc = COALESCE(?, header1_value_enc),
      header2_value_enc = COALESCE(?, header2_value_enc),
      header3_value_enc = COALESCE(?, header3_value_enc),
      create_method = ?, create_path = ?, create_body = ?, create_body_mode = ?, create_steps = ?,
      resp_tracking_path = ?, resp_label_path = ?, resp_error_path = ?, resp_message_path = ?,
      centers_path = ?, centers_method = ?, centers_list_path = ?, center_id_field = ?, center_name_field = ?,
      label_path = ?, label_method = ?, label_body = ?,
      status_path = ?, status_method = ?, status_body = ?, status_state_field = ?, status_map = ?
      WHERE id = ? AND store_id = ?`)
      .run(data.preset, data.label, data.enabled, data.base_url, data.origin_wilaya,
        data.header1_name, data.header2_name, data.header3_name, e1, e2, e3,
        data.create_method, data.create_path, data.create_body, data.create_body_mode, data.create_steps,
        data.resp_tracking_path, data.resp_label_path, data.resp_error_path, data.resp_message_path,
        data.centers_path, data.centers_method, data.centers_list_path, data.center_id_field, data.center_name_field,
        data.label_path, data.label_method, data.label_body,
        data.status_path, data.status_method, data.status_body, data.status_state_field, data.status_map,
        id, storeId)
    return id
  }

  const info = db.prepare(`INSERT INTO carriers (store_id, preset, label, enabled, base_url, origin_wilaya,
      header1_name, header1_value_enc, header2_name, header2_value_enc, header3_name, header3_value_enc,
      create_method, create_path, create_body, create_body_mode, create_steps,
      resp_tracking_path, resp_label_path, resp_error_path, resp_message_path,
      centers_path, centers_method, centers_list_path, center_id_field, center_name_field,
      label_path, label_method, label_body,
      status_path, status_method, status_body, status_state_field, status_map)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .run(storeId, data.preset, data.label, data.enabled, data.base_url, data.origin_wilaya,
      data.header1_name, e1 || "", data.header2_name, e2 || "", data.header3_name, e3 || "",
      data.create_method, data.create_path, data.create_body, data.create_body_mode, data.create_steps,
      data.resp_tracking_path, data.resp_label_path, data.resp_error_path, data.resp_message_path,
      data.centers_path, data.centers_method, data.centers_list_path, data.center_id_field, data.center_name_field,
      data.label_path, data.label_method, data.label_body,
      data.status_path, data.status_method, data.status_body, data.status_state_field, data.status_map)
  return info.lastInsertRowid
}

const remove = (id, storeId) =>
  db.prepare("DELETE FROM carriers WHERE id = ? AND store_id = ?").run(id, storeId)

/* ------------------------------ test / communes ------------------------------ */
const testConnection = async (carrier) => {
  if (DZ.handles(carrier)) {
    const r = await DZ.test(carrier)
    db.prepare("UPDATE carriers SET last_test_at = datetime('now'), last_test_status = ?, last_test_message = ? WHERE id = ?")
      .run(r.status || 0, String(r.error || "OK").slice(0, 300), carrier.id)
    return r
  }
  const r = await GENERIC.test(carrier, headersFor(carrier))
  db.prepare("UPDATE carriers SET last_test_at = datetime('now'), last_test_status = ?, last_test_message = ? WHERE id = ?")
    .run(r.status || 0, (r.error || `OK${r.count != null ? " — " + r.count + " commune(s)" : ""}`).slice(0, 300), carrier.id)
  return r
}

const refreshCenters = async (carrier) => {
  const rows = DZ.handles(carrier)
    ? await DZ.importDesks(carrier)
    : await GENERIC.centers(carrier, headersFor(carrier))
  if (!rows.length) return 0
  const tx = db.transaction(() => {
    db.prepare("DELETE FROM carrier_centers WHERE carrier_id = ?").run(carrier.id)
    const ins = db.prepare(`INSERT INTO carrier_centers
      (carrier_id, external_id, name, wilaya, commune, address, phone)
      VALUES (?, ?, ?, ?, ?, ?, ?)`)
    rows.forEach((c) => ins.run(carrier.id, c.id, c.name,
      c.wilaya || "", c.commune || "", c.address || "", c.phone || ""))
  })
  tx()
  return rows.length
}

const centersOf = (carrierId) =>
  db.prepare("SELECT * FROM carrier_centers WHERE carrier_id = ? ORDER BY name COLLATE NOCASE").all(carrierId)

/** Bureaux d'une wilaya (pour le choix « livraison au bureau » au moment de commander). */
const centersForWilaya = (storeId, wilaya) => {
  if (!wilaya) return db.prepare(`SELECT cc.* FROM carrier_centers cc
    JOIN carriers c ON c.id = cc.carrier_id
    WHERE c.store_id = ?
    ORDER BY cc.wilaya COLLATE NOCASE, cc.commune COLLATE NOCASE, cc.name COLLATE NOCASE`).all(storeId)
  return db.prepare(`SELECT cc.* FROM carrier_centers cc
    JOIN carriers c ON c.id = cc.carrier_id
    WHERE c.store_id = ? AND (cc.wilaya = ? COLLATE NOCASE OR cc.wilaya = '')
    ORDER BY cc.commune COLLATE NOCASE, cc.name COLLATE NOCASE`).all(storeId, wilaya)
}

/** Import manuel (liste collée par le marchand) : « nom ; wilaya ; commune ; adresse ». */
const addCenter = (carrierId, row) =>
  db.prepare(`INSERT INTO carrier_centers (carrier_id, external_id, name, wilaya, commune, address, phone)
    VALUES (?, ?, ?, ?, ?, ?, ?)`)
    .run(carrierId, String(row.externalId || row.name).slice(0, 60), String(row.name).slice(0, 120),
      String(row.wilaya || "").slice(0, 40), String(row.commune || "").slice(0, 60),
      String(row.address || "").slice(0, 160), String(row.phone || "").slice(0, 30))

/* ------------------------------ envoi ------------------------------ */
const splitName = (full) => {
  const parts = String(full || "").trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return { firstName: "Client", lastName: "Client" }
  if (parts.length === 1) return { firstName: parts[0], lastName: parts[0] }
  return { firstName: parts[0], lastName: parts.slice(1).join(" ") }
}

const shipmentOfOrder = (orderId) =>
  db.prepare(`SELECT s.*,
      COALESCE(NULLIF(c.label, ''), NULLIF(s.carrier_label, ''), '') AS carrier_name
    FROM shipments s
    LEFT JOIN carriers c ON c.id = s.carrier_id
    WHERE s.order_id = ?
    ORDER BY s.id DESC LIMIT 1`).get(orderId)

/** Colle sur chaque commande le nom et le statut de la société qui a vraiment pris le colis. */
const annotate = (storeId, orders) => {
  if (!orders || !orders.length) return orders || []
  const rows = db.prepare(`SELECT s.order_id, s.tracking, s.state,
      COALESCE(NULLIF(c.label, ''), NULLIF(s.carrier_label, ''), '') AS carrier_name
    FROM shipments s
    LEFT JOIN carriers c ON c.id = s.carrier_id
    WHERE s.store_id = ?
    ORDER BY s.id DESC`).all(storeId)
  const by = {}
  for (const s of rows) if (!by[s.order_id]) by[s.order_id] = s
  for (const o of orders) {
    const s = by[o.id]
    if (!s) continue
    o.carrier_name = s.carrier_name || ""
    o.ship_state = s.state || ""
    if (!o.tracking && s.tracking) o.tracking = s.tracking
  }
  return orders
}

/**
 * Variables exposées à la configuration du marchand.
 *
 * Bureau de retrait : chaque transporteur le désigne différemment
 *   - Yalidine / Guepex : is_stopdesk = 1 + stopdesk_id (l'identifiant du bureau)
 *   - EcoTrack          : stop_desk = 1 + la COMMUNE du bureau (aucun identifiant)
 *   - NOEST             : stop_desk = 1 + station_code (ex. « 16A »)
 *   - Maystro           : delivery_type = 2 (1 = domicile, 3 = point relais)
 *   - Procolis (ZR old) : TypeLivraison = 1 (0 = domicile)
 * D'où {{stopDesk}} (1/0), {{deskId}}, {{deskName}}, {{deskCommune}} et {{deliveryTypeNum}}.
 */
/** Famille documentaire du transporteur (yalidine, ecotrack, procolis, zr-new, noest, maystro, custom). */
const familyOf = (carrier) => {
  const p = carrier ? byKey(carrier.preset) : null
  return (p && p.family) || "custom"
}

const buildVars = (carrier, store, order, items, opts) => {
  const { firstName, lastName } = splitName(order.customer_name)
  const family = familyOf(carrier)
  const descLimit = FIELDS.DESC_LIMIT[family] || 300
  const price = opts.priceCents != null ? Number(opts.priceCents) : order.total_cents
  const qty = items.reduce((a, b) => a + (b.qty || 1), 0)
  const desk = opts.desk || null
  const stopDesk = Boolean(opts.stopDesk || desk)
  /* L'adresse d'un colis au bureau : celle du client ; à défaut celle du bureau. */
  const addressLine = (order.address || "").trim() || (stopDesk && desk ? String(desk.address || "") : "")
  return {
    ...secretVars(carrier),
    family,
    ref: order.ref,
    firstName,
    lastName,
    fullName: order.customer_name,
    phone: FIELDS.cleanPhone(order.phone),
    address: addressLine,
    addressLine,
    wilaya: order.wilaya || "",
    wilayaCode: WILAYAS.codeOf(order.wilaya) || "",
    /* pour un colis au bureau, la commune envoyée est celle du bureau :
       c'est la règle Yalidine et EcoTrack (le bureau et la commune doivent coller). */
    commune: (stopDesk && desk && desk.commune ? desk.commune : (opts.communeName || "").trim()) || order.wilaya || "",
    communeId: (opts.communeId || "").trim(),
    /* la description est coupée à la limite EXACTE du transporteur (150 Yalidine, 100 ZR v2…) */
    products: FIELDS.cleanProducts(items, descLimit),
    qty,
    price: Math.round(price / 100),
    priceCents: price,
    weight: Number(opts.weight) || 1,
    /* NOEST n'accepte que des kilos entiers : on arrondit vers le bas, minimum 1 */
    weightInt: Math.max(1, Math.floor(Number(opts.weight) || 1)),
    stopDesk: stopDesk ? 1 : 0,
    deliveryType: stopDesk ? "stopdesk" : "home",
    /* nouvelle plateforme ZR : « pickup-point » ou « home » */
    deliveryTypeZr: stopDesk ? "pickup-point" : "home",
    /* Maystro : 1 = domicile, 2 = bureau, 3 = point relais */
    deliveryTypeNum: stopDesk ? 2 : 1,
    deskId: desk ? String(desk.id || "") : "",
    deskName: desk ? String(desk.name || "") : "",
    deskCommune: desk ? String(desk.commune || "") : "",
    deskAddress: desk ? String(desk.address || "") : "",
    freeShipping: opts.freeShipping ? 1 : 0,
    note: FIELDS.cleanNote(order.note, 200),
    orderId: order.id,
    fromWilaya: carrier.origin_wilaya || WILAYAS.nameOf(WILAYAS.codeOf(store.wilaya || "")) || store.wilaya || "",
    shopName: store.name || "",
  }
}

/**
 * Envoie un colis au transporteur actif.
 * Le stock n'est pas touché ici : il revient seulement si le transporteur
 * annonce un « retourné » plus tard (voir syncOne).
 */
const sendParcel = async (store, order, carrier, opts = {}) => {
  if (!carrier) return { ok: false, error: "Aucun transporteur configuré." }
  const items = db.prepare("SELECT * FROM order_items WHERE order_id = ?").all(order.id)
  /* le bureau choisi au checkout est conservé sur la commande */
  if (!opts.desk && (order.desk_id || order.desk_name)) {
    opts = { ...opts, desk: { id: order.desk_id || "", name: order.desk_name || "", commune: order.desk_commune || "" } }
  }
  const vars = buildVars(carrier, store, order, items, opts)

  /* dzship : un seul format, le numéro de suivi est celui du bureau */
  if (DZ.handles(carrier)) {
    const res = await DZ.createParcel(carrier, store, order, vars)
    if (!res.ok) return res
    const info = db.prepare(`INSERT INTO shipments (store_id, order_id, carrier_id, carrier_label, tracking, label_url, label_file, state, payload)
                             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .run(store.id, order.id, carrier.id, String(carrier.label || "").slice(0, 80), res.tracking, res.label || "", "", "envoye", String(res.raw || "").slice(0, 800))
    db.prepare(`UPDATE orders SET carrier_id = ?, tracking = ?, label_url = ?, label_file = ?,
                status = CASE WHEN status IN ('nouvelle','a_verifier','confirmee') THEN 'expediee' ELSE status END
                WHERE id = ?`)
      .run(carrier.id, res.tracking, res.label || "", "", order.id)
    return { ok: true, shipmentId: info.lastInsertRowid, tracking: res.tracking, label: res.label || "" }
  }

  /* on n'envoie pas une fiche incomplète : le transporteur la refuserait */
  const ctrl = FIELDS.check(vars, vars.family)
  if (!ctrl.ok) {
    return {
      ok: false,
      error: "Champs manquants : " + ctrl.missing.map((m) => m.label).join(", "),
      missing: ctrl.missing,
    }
  }

  const res = await GENERIC.createParcel(carrier, vars, headersFor(carrier))
  if (!res.ok) {
    return { ok: false, error: res.error || "Refus du transporteur", status: res.status }
  }

  /* bordereau : URL directe, ou PDF à télécharger et stocker */
  let lab = { url: res.label || "", file: "" }
  try {
    const fetched = await fetchLabel(store, order, carrier, res.tracking, res.label)
    if (fetched) lab = fetched
  } catch (_) { /* un bordereau manquant ne doit pas annuler l'envoi */ }

  const info = db.prepare(`INSERT INTO shipments (store_id, order_id, carrier_id, carrier_label, tracking, label_url, label_file, state, payload)
                           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .run(store.id, order.id, carrier.id, String(carrier.label || "").slice(0, 80), res.tracking || "", lab.url, lab.file, "envoye", String(res.raw || "").slice(0, 800))

  db.prepare(`UPDATE orders SET carrier_id = ?, tracking = ?, label_url = ?, label_file = ?,
              status = CASE WHEN status IN ('nouvelle','a_verifier','confirmee') THEN 'expediee' ELSE status END
              WHERE id = ?`)
    .run(carrier.id, res.tracking || "", lab.url, lab.file, order.id)

  return { ok: true, shipmentId: info.lastInsertRowid, tracking: res.tracking, label: lab.url, labelFile: lab.file, steps: res.steps }
}

/**
 * Fiche colis prête à afficher : ce qui sera envoyé, ce qui manque.
 * Utilisée par la fiche commande AVANT l'envoi.
 */
const parcelSheet = (store, order, carrier, opts = {}) => {
  const items = db.prepare("SELECT * FROM order_items WHERE order_id = ?").all(order.id)
  if (!opts.desk && (order.desk_id || order.desk_name)) {
    opts = { ...opts, desk: { id: order.desk_id || "", name: order.desk_name || "", commune: order.desk_commune || "" } }
  }
  const vars = buildVars(carrier, store, order, items, opts)
  if (DZ.handles(carrier)) {
    const ctrl = DZ.check(vars, carrier)
    return { family: (DZ.courierOf(carrier) || {}).name || vars.family, vars, check: ctrl, rows: DZ.sheet(vars), stopDesk: Boolean(vars.stopDesk) }
  }
  const ctrl = FIELDS.check(vars, vars.family)
  return { family: vars.family, vars, check: ctrl, rows: FIELDS.sheet(vars, vars.family), stopDesk: Boolean(vars.stopDesk) }
}

/* ------------------------------ bordereau ------------------------------ */
const fs = require("node:fs")
const pathMod = require("node:path")
const LABEL_DIR = pathMod.join(__dirname, "..", "data", "labels")

/** Télécharge l'étiquette si le bureau la renvoie en PDF, puis l'écrit sur disque. */
const fetchLabel = async (store, order, carrier, tracking, labelUrlFromCreate) => {
  if (!tracking) return null
  const r = await GENERIC.label(carrier, tracking, headersFor(carrier), labelUrlFromCreate || "", secretVars(carrier))
  if (!r.ok) return null
  if (r.url) return { url: r.url, file: "" }
  if (!r.pdf) return null
  const dir = pathMod.join(LABEL_DIR, String(store.id))
  fs.mkdirSync(dir, { recursive: true })
  const name = `${order.id}-${String(tracking).replace(/[^A-Za-z0-9_-]/g, "")}.pdf`
  fs.writeFileSync(pathMod.join(dir, name), r.pdf)
  return { url: "", file: pathMod.join(String(store.id), name) }
}

/** Chemin disque d'un bordereau enregistré, ou null. */
const labelFile = (file) => {
  if (!file) return null
  const full = pathMod.join(LABEL_DIR, file)
  return fs.existsSync(full) ? full : null
}

/* ------------------------------ synchronisation ------------------------------ */
/** Interroge le transporteur pour un colis et applique le statut à la commande. */
const syncOne = async (shipment) => {
  const carrier = db.prepare("SELECT * FROM carriers WHERE id = ?").get(shipment.carrier_id)
  if (!carrier) return { ok: false, error: "transporteur supprimé" }
  const r = DZ.handles(carrier)
    ? await DZ.track(carrier, shipment.tracking)
    : await GENERIC.parcelStatus(carrier, shipment.tracking, headersFor(carrier))
  if (!r.ok) return { ok: false, error: r.error }
  if (DZ.handles(carrier) && r.label) r.raw = r.label

  /* le statut et l'historique viennent de la société de CET envoi, pas d'une autre */
  const events = Array.isArray(r.events) && r.events.length ? JSON.stringify(r.events).slice(0, 4000) : null
  db.prepare("UPDATE shipments SET state = ?, mapped = ?, events = COALESCE(?, events), synced_at = datetime('now') WHERE id = ?")
    .run(r.raw || "", r.mapped || "", events, shipment.id)

  const order = db.prepare("SELECT * FROM orders WHERE id = ?").get(shipment.order_id)
  if (!order || !r.mapped) return { ok: true, raw: r.raw, mapped: "" }

  if (r.mapped === "livree" && order.status !== "livree") {
    db.prepare("UPDATE orders SET status = 'livree' WHERE id = ?").run(order.id)
  }
  if (r.mapped === "expediee" && ["nouvelle", "a_verifier", "confirmee"].includes(order.status)) {
    db.prepare("UPDATE orders SET status = 'expediee' WHERE id = ?").run(order.id)
  }
  if (r.mapped === "annulee" && order.status !== "annulee") {
    db.prepare("UPDATE orders SET status = 'annulee' WHERE id = ?").run(order.id)
    /* retour au vendeur : le stock revient, une seule fois (inventory.js le garantit) */
    require("./inventory").releaseOrder(order, "retour")
  }
  return { ok: true, raw: r.raw, mapped: r.mapped }
}

/** Synchronise les colis ouverts d'une boutique (séquentiel : respecte les quotas API). */
const syncStore = async (storeId) => {
  const rows = db.prepare(`SELECT s.* FROM shipments s WHERE s.store_id = ?
                           AND COALESCE(s.mapped, '') NOT IN ('livree','annulee')
                           AND s.tracking != '' ORDER BY s.id DESC LIMIT 50`).all(storeId)
  const out = []
  for (const s of rows) out.push(await syncOne(s))
  return { checked: rows.length, results: out }
}

const syncAll = async () => {
  const stores = db.prepare("SELECT DISTINCT store_id FROM shipments").all()
  let checked = 0
  for (const s of stores) checked += (await syncStore(s.store_id)).checked
  return checked
}

const shipmentsOf = (storeId) =>
  db.prepare(`SELECT s.*, o.ref AS order_ref,
              COALESCE(NULLIF(c.label, ''), NULLIF(s.carrier_label, ''), '') AS carrier_name
              FROM shipments s
              JOIN orders o ON o.id = s.order_id
              LEFT JOIN carriers c ON c.id = s.carrier_id
              WHERE s.store_id = ? ORDER BY s.id DESC LIMIT 50`).all(storeId)

module.exports = {
  presets, byKey, list, active, get, save, remove, runtime, headersFor, secretVars, buildVars, familyOf, parcelSheet,
  FIELDS,
  testConnection, refreshCenters, centersOf, centersForWilaya, addCenter, sendParcel, syncOne, syncStore, syncAll,
  shipmentsOf, shipmentOfOrder, annotate, fetchLabel, labelFile,
}
