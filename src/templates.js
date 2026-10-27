"use strict"
/**
 * Templates de boutique : une copie nommée du design en cours.
 * Appliquer un template ne publie pas : ça charge un brouillon.
 */
const db = require("./db")

db.exec(`
CREATE TABLE IF NOT EXISTS design_templates (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  store_id   INTEGER NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  name       TEXT NOT NULL,
  theme      TEXT NOT NULL DEFAULT '',
  payload    TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
`)

const list = (storeId) =>
  db.prepare("SELECT id, name, theme, created_at FROM design_templates WHERE store_id = ? ORDER BY id DESC").all(storeId)

const get = (id, storeId) =>
  db.prepare("SELECT * FROM design_templates WHERE id = ? AND store_id = ?").get(id, storeId)

const save = (storeId, name, draft) => {
  const clean = String(name || "").trim().replace(/\s+/g, " ").slice(0, 40)
  if (!clean) return { ok: false, error: "Donne un nom au template." }
  const n = db.prepare("SELECT COUNT(*) AS n FROM design_templates WHERE store_id = ?").get(storeId).n
  if (n >= 24) return { ok: false, error: "24 templates maximum. Retire-en un pour en garder un nouveau." }
  const payload = {
    theme: draft.theme || "",
    design: draft.design || {},
    sections: draft.sections || {},
    nav: draft.nav || [],
  }
  const info = db.prepare("INSERT INTO design_templates (store_id, name, theme, payload) VALUES (?, ?, ?, ?)")
    .run(storeId, clean, String(payload.theme || "").slice(0, 40), JSON.stringify(payload))
  return { ok: true, id: Number(info.lastInsertRowid), name: clean }
}

const remove = (id, storeId) =>
  db.prepare("DELETE FROM design_templates WHERE id = ? AND store_id = ?").run(id, storeId)

module.exports = { list, get, save, remove }
