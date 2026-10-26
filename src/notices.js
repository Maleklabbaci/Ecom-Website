"use strict"
/**
 * Cloche du tableau de bord. Rien n'est envoyé par mail ni par WhatsApp.
 * Une nouvelle commande ajoute une ligne. Le marchand la voit ici.
 */
const db = require("./db")

db.exec(`
CREATE TABLE IF NOT EXISTS notices (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  store_id   INTEGER NOT NULL,
  kind       TEXT NOT NULL DEFAULT 'order',
  title      TEXT NOT NULL,
  body       TEXT DEFAULT '',
  href       TEXT DEFAULT '',
  order_id   INTEGER,
  read_at    TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_notices_store ON notices(store_id, id DESC);
`)

const plain = (s, n) => String(s || "").replace(/[<>&]/g, " ").replace(/\s+/g, " ").trim().slice(0, n)

/* pages ouvertes : on leur pousse la ligne à la seconde, sans attendre un rafraîchissement */
const waiters = new Map()
const seenMax = new Map()
let watch = null

const rowOf = (id) => db.prepare(
  "SELECT id, title, body, href, read_at FROM notices WHERE id = ?"
).get(id)

const push = (storeId, row) => {
  if (!row) return
  const set = waiters.get(String(storeId))
  if (!set || !set.size) return
  const line = "event: notice\ndata: " + JSON.stringify({
    id: row.id, title: row.title, body: row.body || "", href: row.href || "", read_at: row.read_at || null,
  }) + "\n\n"
  for (const res of Array.from(set)) {
    try { res.write(line) } catch (e) { set.delete(res) }
  }
}

const arm = (storeId) => {
  const key = String(storeId)
  if (!seenMax.has(key)) {
    const row = db.prepare("SELECT MAX(id) n FROM notices WHERE store_id = ?").get(storeId)
    seenMax.set(key, row && row.n ? row.n : 0)
  }
  if (watch) return
  watch = setInterval(() => {
    if (!waiters.size) { clearInterval(watch); watch = null; return }
    for (const key of Array.from(waiters.keys())) {
      const last = seenMax.get(key) || 0
      let fresh = []
      try {
        fresh = db.prepare(
          "SELECT id, title, body, href, read_at FROM notices WHERE store_id = ? AND id > ? ORDER BY id"
        ).all(Number(key), last)
      } catch (e) { continue }
      fresh.forEach((row) => {
        seenMax.set(key, row.id)
        push(key, row)
      })
    }
  }, 250)
  if (watch.unref) watch.unref()
}

const subscribe = (storeId, res) => {
  const key = String(storeId)
  if (!waiters.has(key)) waiters.set(key, new Set())
  waiters.get(key).add(res)
  arm(storeId)
  return () => {
    const set = waiters.get(key)
    if (!set) return
    set.delete(res)
    if (!set.size) waiters.delete(key)
  }
}

const add = (storeId, { kind = "order", title, body = "", href = "", orderId = null } = {}) => {
  const info = db.prepare(`
    INSERT INTO notices (store_id, kind, title, body, href, order_id)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(storeId, kind, plain(title || "Nouvelle commande", 80),
    plain(body, 160), String(href || "").replace(/[^a-z0-9/_-]/gi, "").slice(0, 120), orderId || null)
  const row = rowOf(info.lastInsertRowid)
  if (row) {
    seenMax.set(String(storeId), row.id)
    push(storeId, row)
  }
  return info.lastInsertRowid
}

const list = (storeId, limit = 12) =>
  db.prepare(`
    SELECT id, kind, title, body, href, order_id, read_at, created_at
    FROM notices WHERE store_id = ? ORDER BY id DESC LIMIT ?
  `).all(storeId, limit)

const unread = (storeId) =>
  db.prepare("SELECT COUNT(*) n FROM notices WHERE store_id = ? AND read_at IS NULL").get(storeId).n

const mark = (storeId, id) => {
  if (id) {
    db.prepare("UPDATE notices SET read_at = datetime('now') WHERE store_id = ? AND id = ? AND read_at IS NULL")
      .run(storeId, id)
  } else {
    db.prepare("UPDATE notices SET read_at = datetime('now') WHERE store_id = ? AND read_at IS NULL")
      .run(storeId)
  }
  return unread(storeId)
}

module.exports = { add, list, unread, mark, subscribe, push }
