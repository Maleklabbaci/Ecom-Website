"use strict"
/**
 * Journal admin.
 * Les erreurs, alertes et lenteurs sont écrites en base, indexées, et regroupées
 * si la même ligne revient dans les 2 minutes. Le passage normal des pages reste
 * en mémoire : on ne ralentit pas une commande pour écrire un journal.
 */
const db = require("./db")

/** Un même message répété des centaines de milliers de fois (EPIPE) devient une ligne. */
const compactFlood = () => {
  let n = 0
  try { n = Number(db.prepare("SELECT COUNT(*) n FROM logs").get().n) || 0 } catch (_) { return 0 }
  if (n < 8000) return 0
  db.exec("BEGIN IMMEDIATE")
  try {
    db.exec(`CREATE TABLE logs_keep (
      id INTEGER PRIMARY KEY,
      level TEXT,
      message TEXT,
      meta TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      hits INTEGER NOT NULL DEFAULT 1,
      ms INTEGER,
      method TEXT,
      path TEXT,
      status INTEGER,
      store_id INTEGER,
      last_at TEXT
    )`)
    db.exec(`INSERT INTO logs_keep (level, message, meta, created_at, hits, ms, method, path, status, store_id, last_at)
      SELECT level, message, MAX(meta), MIN(created_at), SUM(COALESCE(hits, 1)),
        MAX(ms), MAX(method), MAX(path), MAX(status), MAX(store_id), MAX(COALESCE(last_at, created_at))
      FROM logs GROUP BY level, message`)
    db.exec("DROP TABLE logs")
    db.exec("ALTER TABLE logs_keep RENAME TO logs")
    db.exec("COMMIT")
  } catch (err) {
    try { db.exec("ROLLBACK") } catch (e) { /* déjà annulé */ }
    try { db.exec("DROP TABLE IF EXISTS logs_keep") } catch (e) { /* table absente */ }
    console.log("journal compact skipped:", err && err.message)
    return 0
  }
  try { db.exec("VACUUM") } catch (_) { /* le fichier reste plus gros, les lectures restent justes */ }
  return n
}

const addCol = (name, def) => {
  const cols = db.prepare("PRAGMA table_info(logs)").all().map((c) => c.name)
  if (!cols.includes(name)) db.exec(`ALTER TABLE logs ADD COLUMN ${name} ${def}`)
}
addCol("hits", "INTEGER NOT NULL DEFAULT 1")
addCol("ms", "INTEGER")
addCol("method", "TEXT")
addCol("path", "TEXT")
addCol("status", "INTEGER")
addCol("store_id", "INTEGER")
addCol("last_at", "TEXT")
compactFlood()
try {
  db.exec("UPDATE logs SET last_at = created_at WHERE last_at IS NULL OR last_at = ''")
  db.exec("CREATE INDEX IF NOT EXISTS idx_logs_level_id ON logs(level, id)")
  db.exec("CREATE INDEX IF NOT EXISTS idx_logs_last ON logs(last_at, id)")
  db.exec("CREATE INDEX IF NOT EXISTS idx_logs_collapse ON logs(level, message, id)")
} catch (_) { /* index déjà là, ou base en lecture : le journal ne doit pas empêcher le démarrage */ }

const KEEP_DAYS = 14
const KEEP_ROWS = 12000
const SLOW_MS = 800
const RING_MAX = 80
const PAGE = 30
const RING = []

const SKIP = ["/styles.css", "/editor.js", "/upimg.js", "/uploads", "/demo", "/fonts",
  "/themes-pro.css", "/landing.css", "/inter-font.css", "/estedad.css", "/theme-fonts.css",
  "/favicon.ico"]

const SECRET = /pass|token|secret|authorization|cookie|smtp/i

const redact = (meta) => {
  if (!meta || typeof meta !== "object" || Array.isArray(meta)) return meta
  const out = {}
  for (const [k, v] of Object.entries(meta)) {
    if (SECRET.test(k)) out[k] = "•••"
    else if (typeof v === "string") out[k] = v.slice(0, 800)
    else out[k] = v
  }
  return out
}

const insert = db.prepare(`INSERT INTO logs
  (level, message, meta, hits, ms, method, path, status, store_id, last_at)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))`)
const sameRecent = db.prepare(`SELECT id FROM logs
  WHERE level = ? AND message = ? AND created_at >= datetime('now', '-2 minutes')
  ORDER BY id DESC LIMIT 1`)
const bump = db.prepare(`UPDATE logs
  SET hits = COALESCE(hits, 1) + ?, last_at = datetime('now'),
      ms = COALESCE(?, ms), status = COALESCE(?, status)
  WHERE id = ?`)
const gate = new Map()

const write = (level, message, meta, extra = {}) => {
  try {
    const lvl = String(level || "info").slice(0, 12)
    const msg = String(message || "").replace(/\s+/g, " ").trim().slice(0, 300)
    if (!msg) return 0
    const key = lvl + "\0" + msg
    const now = Date.now()
    const held = gate.get(key)
    if (held && now - held.at < 2000) {
      held.extra += 1
      if (held.id && held.extra <= 20) {
        bump.run(1, extra.ms == null ? null : extra.ms, extra.status == null ? null : extra.status, held.id)
        held.extra = 0
      }
      return held.id || 0
    }
    const skipped = held ? held.extra : 0
    gate.set(key, { at: now, extra: 0, id: 0 })
    if (gate.size > 400) {
      for (const [k, v] of gate) if (now - v.at > 120000) gate.delete(k)
    }
    const prev = sameRecent.get(lvl, msg)
    if (prev) {
      bump.run(1 + skipped, extra.ms == null ? null : extra.ms, extra.status == null ? null : extra.status, prev.id)
      gate.set(key, { at: now, extra: 0, id: prev.id })
      return prev.id
    }
    let metaText = null
    if (meta != null) {
      metaText = (typeof meta === "string" ? meta : JSON.stringify(redact(meta))).slice(0, 1600)
    }
    const path = extra.path ? String(extra.path).split("?")[0].slice(0, 180) : null
    const out = insert.run(
      lvl, msg, metaText, 1 + skipped,
      extra.ms == null ? null : Number(extra.ms) || 0,
      extra.method ? String(extra.method).slice(0, 8) : null,
      path,
      extra.status == null ? null : Number(extra.status) || 0,
      extra.storeId || null,
    )
    const id = Number(out.lastInsertRowid) || 0
    gate.set(key, { at: now, extra: 0, id })
    return id
  } catch (_) {
    return 0
  }
}

const pushRing = (row) => {
  RING.push(row)
  if (RING.length > RING_MAX) RING.shift()
}

const skipPath = (p) => SKIP.some((s) => p === s || p.startsWith(s + "/"))

/** À placer avant les routes, après les fichiers statiques. */
const observe = (req, res, next) => {
  const pathOnly = String(req.path || "/").split("?")[0]
  if (skipPath(pathOnly)) return next()
  const t0 = Date.now()
  res.on("finish", () => {
    const ms = Date.now() - t0
    const status = res.statusCode || 0
    pushRing({ method: req.method, path: pathOnly.slice(0, 180), status, ms, at: Date.now() })
    if (req._journaled) return
    const extra = {
      ms, method: req.method, path: pathOnly, status,
      storeId: req.store && req.store.id,
    }
    if (status >= 500) write("error", "Une page n'a pas pu s'afficher", { ms }, extra)
    else if ((status === 401 || status === 403 || status === 429) && pathOnly !== "/login") {
      write("warn", "Accès refusé", { ms }, extra)
    } else if (ms >= SLOW_MS && status < 400) {
      write("slow", "Une page a été lente", { ms }, extra)
    }
  })
  next()
}

const count = (sql, ...args) => {
  const row = db.prepare(sql).get(...args)
  return Number(row && row.n) || 0
}

const summary = () => {
  const day = "COALESCE(last_at, created_at) >= datetime('now', '-1 day')"
  return {
    errors: count(`SELECT COALESCE(SUM(COALESCE(hits, 1)), 0) n FROM logs WHERE level = 'error' AND ${day}`),
    warns: count(`SELECT COALESCE(SUM(COALESCE(hits, 1)), 0) n FROM logs WHERE level = 'warn' AND ${day}`),
    slow: count(`SELECT COALESCE(SUM(COALESCE(hits, 1)), 0) n FROM logs WHERE level = 'slow' AND ${day}`),
    kept: count("SELECT COUNT(*) n FROM logs"),
    repeats: db.prepare(`
      SELECT level, message, SUM(COALESCE(hits, 1)) n, MAX(id) id, MAX(COALESCE(last_at, created_at)) at
      FROM logs WHERE ${day} AND level IN ('error', 'warn', 'slow')
      GROUP BY level, message
      HAVING n > 1
      ORDER BY n DESC
      LIMIT 6`).all(),
    older: db.prepare(`
      SELECT message, SUM(COALESCE(hits, 1)) n, MAX(id) id
      FROM logs
      WHERE level = 'error' AND COALESCE(last_at, created_at) < datetime('now', '-1 day')
      GROUP BY message
      ORDER BY n DESC
      LIMIT 1`).get() || null,
  }
}

const likeOf = (raw) => `%${String(raw || "").trim().slice(0, 60).replace(/[%_]/g, "")}%`

const list = ({ level = "", q = "", span = "24h", before = "" } = {}) => {
  const where = ["1 = 1"]
  const args = []
  const lvl = ["error", "warn", "slow", "info"].includes(level) ? level : ""
  if (lvl) {
    where.push("level = ?")
    args.push(lvl)
  }
  const window = span === "1h" || span === "7d" || span === "all" ? span : "24h"
  if (window === "1h") where.push("COALESCE(last_at, created_at) >= datetime('now', '-1 hour')")
  else if (window === "24h") where.push("COALESCE(last_at, created_at) >= datetime('now', '-1 day')")
  else if (window === "7d") where.push("COALESCE(last_at, created_at) >= datetime('now', '-7 days')")
  const text = String(q || "").trim().slice(0, 60)
  if (text) {
    where.push("(message LIKE ? OR IFNULL(path, '') LIKE ?)")
    const like = likeOf(text)
    args.push(like, like)
  }
  const cursorId = parseInt(before, 10)
  if (cursorId > 0) {
    const cursor = db.prepare("SELECT id, COALESCE(last_at, created_at) at FROM logs WHERE id = ?").get(cursorId)
    if (cursor) {
      where.push("(COALESCE(last_at, created_at) < ? OR (COALESCE(last_at, created_at) = ? AND id < ?))")
      args.push(cursor.at, cursor.at, cursor.id)
    }
  }
  const rows = db.prepare(`
    SELECT id, level, message, created_at, COALESCE(last_at, created_at) last_at,
      COALESCE(hits, 1) hits, ms, method, path, status
    FROM logs
    WHERE ${where.join(" AND ")}
    ORDER BY COALESCE(last_at, created_at) DESC, id DESC
    LIMIT ${PAGE + 1}`).all(...args)
  const more = rows.length > PAGE
  if (more) rows.pop()
  return {
    rows,
    more,
    next: more && rows.length ? rows[rows.length - 1].id : 0,
    level: lvl,
    q: text,
    span: window,
    before: cursorId > 0 ? cursorId : 0,
  }
}

const one = (raw) => {
  const id = parseInt(raw, 10)
  if (!Number.isInteger(id) || id <= 0 || String(id) !== String(raw).trim()) return null
  return db.prepare(`
    SELECT l.*, COALESCE(l.hits, 1) hits, COALESCE(l.last_at, l.created_at) last_at,
      s.name AS store_name, s.slug AS store_slug
    FROM logs l LEFT JOIN stores s ON s.id = l.store_id
    WHERE l.id = ?`).get(id) || null
}

const readMeta = (raw) => {
  if (!raw) return { fields: [], stack: "", raw: "" }
  try {
    const obj = JSON.parse(raw)
    if (!obj || typeof obj !== "object" || Array.isArray(obj)) {
      return { fields: [], stack: "", raw: String(raw).slice(0, 1600) }
    }
    const stack = obj.stack ? String(obj.stack).slice(0, 1600) : ""
    const fields = Object.entries(obj)
      .filter(([k]) => k !== "stack")
      .map(([k, v]) => [k, typeof v === "string" ? v : JSON.stringify(v)])
    return { fields, stack, raw: "" }
  } catch (_) {
    return { fields: [], stack: "", raw: String(raw).slice(0, 1600) }
  }
}

const prune = () => {
  try {
    const old = db.prepare("DELETE FROM logs WHERE created_at < datetime('now', '-14 days')").run()
    const extra = db.prepare(`DELETE FROM logs WHERE id < (
      SELECT id FROM logs ORDER BY id DESC LIMIT 1 OFFSET ${KEEP_ROWS}
    )`).run()
    return (old.changes || 0) + (extra.changes || 0)
  } catch (_) {
    return 0
  }
}

const clearAll = () => {
  try { return db.prepare("DELETE FROM logs").run().changes || 0 } catch (_) { return 0 }
}

const recent = (n = 8) => RING.slice(-n).reverse()

setTimeout(() => { prune() }, 4000).unref?.()
setInterval(() => { prune() }, 30 * 60 * 1000).unref?.()

module.exports = {
  write, observe, summary, list, one, readMeta, prune, clearAll, recent,
  SLOW_MS, KEEP_DAYS, KEEP_ROWS, PAGE,
}
