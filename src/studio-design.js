"use strict"
/**
 * Atelier : l'état complet d'une page du studio (sections, styles, textes,
 * couleurs, photos) enregistré côté serveur.
 *
 * Pourquoi un nouveau rangement ? Le studio « HTML » (src/studio.js) garde des
 * pages entières ; l'atelier, lui, travaille sur un état (un objet : quelles
 * sections, quel style, quels mots). On range donc cet objet tel quel.
 *
 * Deux tiroirs, comme chez Shopify :
 *   draft       = ce que le marchand fabrique (personne ne le voit)
 *   live        = ce que voient les clients (change seulement sur « Publier »)
 * Chaque publication laisse une trace dans `studio_design_versions`, ce qui
 * permet de revenir à une version d'avant en un clic.
 */
const crypto = require("crypto")
const db = require("./db")

db.exec(`
CREATE TABLE IF NOT EXISTS studio_designs (
  store_id     INTEGER PRIMARY KEY REFERENCES stores(id) ON DELETE CASCADE,
  draft        TEXT NOT NULL DEFAULT '',
  live         TEXT NOT NULL DEFAULT '',
  saved_at     TEXT NOT NULL DEFAULT '',
  published_at TEXT NOT NULL DEFAULT ''
);

CREATE TABLE IF NOT EXISTS studio_design_versions (
  id       INTEGER PRIMARY KEY AUTOINCREMENT,
  store_id INTEGER NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  label    TEXT NOT NULL DEFAULT '',
  json     TEXT NOT NULL,
  at       TEXT NOT NULL DEFAULT ''
);

CREATE TABLE IF NOT EXISTS studio_previews (
  token    TEXT PRIMARY KEY,
  store_id INTEGER NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  json     TEXT NOT NULL,
  at       TEXT NOT NULL DEFAULT ''
);
`)

/* Un état de page reste petit : au-delà, c'est une photo collée en entier dans
   le mauvais champ. On refuse plutôt que de remplir la base. */
const MAX = 8 * 1024 * 1024
const MAX_VERSIONS = 20
const MAX_PREVIEW = 8 * 1024 * 1024

const now = () => new Date().toISOString()

/** Vérifie qu'un état est bien un état d'atelier, et le renvoie en texte.
 *  Accepte un objet ou un texte JSON (le navigateur peut envoyer l'un ou
 *  l'autre selon l'endroit d'où vient l'enregistrement). */
const clean = (state) => {
  let obj = state
  if (typeof obj === "string") {
    if (!obj || obj.length > MAX) return null
    try { obj = JSON.parse(obj) } catch (_) { return null }
  }
  if (!obj || typeof obj !== "object" || Array.isArray(obj)) return null
  if (!obj.design || typeof obj.design !== "object" || Array.isArray(obj.design)) return null
  if (!obj.pages || typeof obj.pages !== "object" || Array.isArray(obj.pages)) return null
  if (!Object.keys(obj.pages).length) return null
  let json
  try { json = JSON.stringify(obj) } catch (_) { return null }
  if (!json || json.length > MAX) return null
  return json
}

const row = (storeId) => db.prepare("SELECT * FROM studio_designs WHERE store_id = ?").get(storeId) || null

const read = (storeId) => {
  const r = row(storeId)
  if (!r) return { draft: null, live: null, saved_at: "", published_at: "" }
  const parse = (s) => { try { return s ? JSON.parse(s) : null } catch (_) { return null } }
  return { draft: parse(r.draft), live: parse(r.live), saved_at: r.saved_at || "", published_at: r.published_at || "" }
}

/** Enregistre le brouillon. Ne touche jamais à ce que voient les clients. */
const saveDraft = (storeId, state) => {
  const json = clean(state)
  if (!json) return { ok: false, error: "Cet enregistrement n'est pas lisible." }
  const at = now()
  const r = row(storeId)
  if (!r) db.prepare("INSERT INTO studio_designs (store_id, draft, saved_at) VALUES (?, ?, ?)").run(storeId, json, at)
  else db.prepare("UPDATE studio_designs SET draft = ?, saved_at = ? WHERE store_id = ?").run(json, at, storeId)
  return { ok: true, saved_at: at }
}

const version = (storeId, json, label) =>
  db.prepare("INSERT INTO studio_design_versions (store_id, label, json, at) VALUES (?, ?, ?, ?)").run(storeId, String(label || "").slice(0, 80), json, now())

const trimVersions = (storeId) => {
  const keep = db.prepare("SELECT id FROM studio_design_versions WHERE store_id = ? ORDER BY id DESC LIMIT ?").all(storeId, MAX_VERSIONS).map((r) => r.id)
  if (!keep.length) return
  db.prepare(`DELETE FROM studio_design_versions WHERE store_id = ? AND id NOT IN (${keep.map(() => "?").join(",")})`).run(storeId, ...keep)
}

/** Publie : le brouillon devient la version en ligne, et l'ancienne version est
 *  conservée pour pouvoir y revenir. */
const publish = (storeId, state, label) => {
  const json = clean(state)
  if (!json) return { ok: false, error: "Cet enregistrement n'est pas lisible." }
  const at = now()
  const r = row(storeId)
  const avant = r && r.live ? r.live : ""
  if (!r) db.prepare("INSERT INTO studio_designs (store_id, draft, live, saved_at, published_at) VALUES (?, ?, ?, ?, ?)").run(storeId, json, json, at, at)
  else db.prepare("UPDATE studio_designs SET draft = ?, live = ?, saved_at = ?, published_at = ? WHERE store_id = ?").run(json, json, at, at, storeId)
  /* on garde d'abord l'ancienne version en ligne : après un clic malheureux,
     le marchand peut revenir exactement à ce que voyaient ses clients */
  if (avant) version(storeId, avant, "Version en ligne d'avant")
  version(storeId, json, label || "Publication")
  trimVersions(storeId)
  return { ok: true, published_at: at }
}

const versions = (storeId) =>
  db.prepare("SELECT id, label, at FROM studio_design_versions WHERE store_id = ? ORDER BY id DESC").all(storeId)

/** Fait remonter une ancienne version dans le brouillon (pas publiée : le
 *  marchand regarde d'abord, puis publie s'il est content). */
const restore = (storeId, id) => {
  const v = db.prepare("SELECT * FROM studio_design_versions WHERE id = ? AND store_id = ?").get(Number(id) || 0, storeId)
  if (!v) return { ok: false, error: "Cette version n'existe plus." }
  const json = clean(v.json)
  if (!json) return { ok: false, error: "Cette version n'est pas lisible." }
  const at = now()
  const r = row(storeId)
  if (!r) db.prepare("INSERT INTO studio_designs (store_id, draft, saved_at) VALUES (?, ?, ?)").run(storeId, json, at)
  else db.prepare("UPDATE studio_designs SET draft = ?, saved_at = ? WHERE store_id = ?").run(json, at, storeId)
  return { ok: true, state: JSON.parse(json), saved_at: at }
}

/** « Revenir à ce que voient mes clients » : le brouillon reprend la version
 *  en ligne. Sortie de secours, sans rien republier. */
const revert = (storeId) => {
  const r = row(storeId)
  if (!r || !r.live) return { ok: false, error: "Rien n'a encore été publié." }
  db.prepare("UPDATE studio_designs SET draft = live, saved_at = ? WHERE store_id = ?").run(now(), storeId)
  let state = null
  try { state = JSON.parse(r.live) } catch (_) {}
  return { ok: true, state }
}

/* --------------------------- lien d'aperçu --------------------------- */
/** Un lien à envoyer à quelqu'un (un proche, un client) pour qu'il voie le
 *  brouillon sans publier. Il expire : 7 jours. */
const preview = (storeId, state) => {
  const json = clean(state)
  if (!json || json.length > MAX_PREVIEW) return { ok: false, error: "Aperçu trop lourd." }
  const token = crypto.randomBytes(12).toString("hex")
  db.prepare("INSERT INTO studio_previews (token, store_id, json, at) VALUES (?, ?, ?, ?)").run(token, storeId, json, now())
  db.prepare("DELETE FROM studio_previews WHERE at < ?").run(new Date(Date.now() - 7 * 24 * 3600 * 1000).toISOString())
  return { ok: true, token }
}

const previewOf = (token) => {
  const r = db.prepare("SELECT * FROM studio_previews WHERE token = ?").get(String(token || ""))
  if (!r) return null
  if (r.at && r.at < new Date(Date.now() - 7 * 24 * 3600 * 1000).toISOString()) return null
  let state = null
  try { state = JSON.parse(r.json) } catch (_) {}
  return state ? { storeId: r.store_id, state } : null
}

module.exports = { clean, read, saveDraft, publish, versions, restore, revert, preview, previewOf, MAX }
