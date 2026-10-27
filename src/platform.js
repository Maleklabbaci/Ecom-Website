"use strict"
/**
 * Console NovaDZ : les chiffres et les actions de l'admin plateforme.
 * Aucun encaissement. Le plan est un statut, pas un paiement.
 */
const fs = require("fs")
const path = require("path")
const db = require("./db")
require("./relance")

const PLANS = [
  { id: "gratuit", label: "Gratuit", price: "0 DA / mois", hint: "1 boutique, jusqu'à 10 produits" },
  { id: "pro", label: "Pro", price: "1 900 DA / mois", hint: "produits illimités, nom de domaine" },
  { id: "business", label: "Business", price: "4 900 DA / mois", hint: "plusieurs boutiques, équipe" },
]

const planOf = (id) => PLANS.find((p) => p.id === id) || {
  id: id || "gratuit",
  label: id ? String(id) : "Gratuit",
  price: "—",
  hint: "",
}

const idOf = (raw) => {
  const s = String(raw ?? "").trim()
  if (!/^[1-9]\d{0,9}$/.test(s)) return 0
  return Number(s)
}

const likeOf = (raw) => `%${String(raw || "").trim().slice(0, 80).replace(/[%_]/g, "")}%`

const count = (sql, ...args) => db.prepare(sql).get(...args).n

const badges = () => ({
  suspended: count("SELECT COUNT(*) n FROM stores WHERE status != 'active'"),
  errors: count("SELECT COUNT(*) n FROM logs WHERE level = 'error' AND COALESCE(last_at, created_at) >= datetime('now', '-1 day')"),
})

const overview = () => {
  const recentStores = db.prepare(`
    SELECT s.id, s.name, s.slug, s.status, s.plan, s.created_at, u.name AS owner_name, u.email AS owner_email
    FROM stores s JOIN users u ON u.id = s.owner_id
    ORDER BY s.id DESC LIMIT 6`).all()
  const recentOrders = db.prepare(`
    SELECT o.id, o.ref, o.customer_name, o.total_cents, o.status, o.fake, o.created_at,
      s.id AS store_id, s.name AS store_name
    FROM orders o JOIN stores s ON s.id = o.store_id
    ORDER BY o.id DESC LIMIT 8`).all()
  const recentErrors = db.prepare(`
    SELECT id, level, message, created_at, COALESCE(hits, 1) hits,
      COALESCE(last_at, created_at) last_at FROM logs
    WHERE level IN ('error', 'warn')
    ORDER BY COALESCE(last_at, created_at) DESC, id DESC LIMIT 5`).all()
  return {
    stores: count("SELECT COUNT(*) n FROM stores"),
    suspended: count("SELECT COUNT(*) n FROM stores WHERE status != 'active'"),
    merchants: count("SELECT COUNT(*) n FROM users WHERE role = 'merchant'"),
    accounts: count("SELECT COUNT(*) n FROM users"),
    products: count("SELECT COUNT(*) n FROM products"),
    orders: count("SELECT COUNT(*) n FROM orders WHERE COALESCE(fake, 0) = 0"),
    revenue: count("SELECT COALESCE(SUM(total_cents), 0) n FROM orders WHERE status NOT IN ('annulee', 'perdue') AND COALESCE(fake, 0) = 0"),
    empty: count("SELECT COUNT(*) n FROM stores s WHERE NOT EXISTS (SELECT 1 FROM products p WHERE p.store_id = s.id)"),
    domains: count("SELECT COUNT(*) n FROM stores WHERE domain IS NOT NULL AND domain != ''"),
    errors: count("SELECT COUNT(*) n FROM logs WHERE level = 'error' AND COALESCE(last_at, created_at) >= datetime('now', '-1 day')"),
    recentStores,
    recentOrders,
    recentErrors,
  }
}

const stores = ({ q = "", status = "", plan = "" } = {}) => {
  const where = ["1 = 1"]
  const args = []
  const text = String(q || "").trim()
  if (text) {
    where.push("(s.name LIKE ? OR s.slug LIKE ? OR u.email LIKE ? OR u.name LIKE ? OR IFNULL(s.domain, '') LIKE ?)")
    const like = likeOf(text)
    args.push(like, like, like, like, like)
  }
  if (status === "active" || status === "suspendue") {
    where.push("s.status = ?")
    args.push(status)
  }
  if (PLANS.some((p) => p.id === plan)) {
    where.push("IFNULL(s.plan, 'gratuit') = ?")
    args.push(plan)
  }
  const rows = db.prepare(`
    SELECT s.id, s.name, s.slug, s.status, IFNULL(s.plan, 'gratuit') AS plan, s.domain, s.created_at,
      u.id AS owner_id, u.name AS owner_name, u.email AS owner_email,
      (SELECT COUNT(*) FROM products p WHERE p.store_id = s.id) AS product_count,
      (SELECT COUNT(*) FROM orders o WHERE o.store_id = s.id AND COALESCE(o.fake, 0) = 0) AS order_count,
      (SELECT COUNT(*) FROM orders o WHERE o.store_id = s.id AND o.status = 'nouvelle' AND COALESCE(o.fake, 0) = 0) AS waiting,
      (SELECT COALESCE(SUM(o.total_cents), 0) FROM orders o
        WHERE o.store_id = s.id AND o.status NOT IN ('annulee', 'perdue') AND COALESCE(o.fake, 0) = 0) AS revenue
    FROM stores s JOIN users u ON u.id = s.owner_id
    WHERE ${where.join(" AND ")}
    ORDER BY s.id DESC
    LIMIT 200`).all(...args)
  return { rows, q: text.slice(0, 80), status, plan }
}

const store = (raw) => {
  const id = idOf(raw)
  if (!id) return null
  const row = db.prepare(`
    SELECT s.id, s.name, s.slug, s.status, IFNULL(s.plan, 'gratuit') AS plan, s.domain, s.created_at,
      s.phone, s.wilaya, s.tagline, s.mail_from, s.smtp_host, s.whatsapp, s.msg_provider, s.msg_url,
      s.legal_name, s.legal_rc, s.legal_nif, s.owner_id,
      u.name AS owner_name, u.email AS owner_email, u.login_name AS owner_login, IFNULL(u.blocked, 0) AS owner_blocked
    FROM stores s JOIN users u ON u.id = s.owner_id
    WHERE s.id = ?`).get(id)
  if (!row) return null
  const stats = {
    products: count("SELECT COUNT(*) n FROM products WHERE store_id = ?", id),
    orders: count("SELECT COUNT(*) n FROM orders WHERE store_id = ? AND COALESCE(fake, 0) = 0", id),
    waiting: count("SELECT COUNT(*) n FROM orders WHERE store_id = ? AND status = 'nouvelle' AND COALESCE(fake, 0) = 0", id),
    revenue: count("SELECT COALESCE(SUM(total_cents), 0) n FROM orders WHERE store_id = ? AND status NOT IN ('annulee', 'perdue') AND COALESCE(fake, 0) = 0", id),
    team: count("SELECT COUNT(*) n FROM store_members WHERE store_id = ?", id),
  }
  const orders = db.prepare(`
    SELECT id, ref, customer_name, total_cents, status, fake, created_at
    FROM orders WHERE store_id = ? ORDER BY id DESC LIMIT 8`).all(id)
  const team = db.prepare(`
    SELECT m.name, m.email, m.status, m.perms, u.login_name
    FROM store_members m LEFT JOIN users u ON u.id = m.user_id
    WHERE m.store_id = ? ORDER BY m.id`).all(id)
  return { ...row, stats, orders, team }
}

const setPlan = (raw, plan) => {
  const id = idOf(raw)
  const next = PLANS.find((p) => p.id === plan)
  if (!next) return { error: "Ce plan n'existe pas. Choisis Gratuit, Pro ou Business." }
  const row = id && db.prepare("SELECT id, name, IFNULL(plan, 'gratuit') AS plan FROM stores WHERE id = ?").get(id)
  if (!row) return { error: "Cette boutique n'existe pas." }
  if (row.plan === next.id) {
    return { ok: `« ${row.name} » est déjà en ${next.label}. Rien à changer.` }
  }
  db.prepare("UPDATE stores SET plan = ? WHERE id = ?").run(next.id, row.id)
  return {
    ok: `Plan de « ${row.name} » : ${next.label}. Aucun paiement n'a été pris.`,
    log: { message: "plan modifié", meta: { storeId: row.id, plan: next.id } },
  }
}

const toggleStatus = (raw) => {
  const id = idOf(raw)
  const row = id && db.prepare("SELECT id, name, status FROM stores WHERE id = ?").get(id)
  if (!row) return { error: "Cette boutique n'existe pas." }
  const next = row.status === "active" ? "suspendue" : "active"
  db.prepare("UPDATE stores SET status = ? WHERE id = ?").run(next, row.id)
  return {
    ok: next === "suspendue"
      ? `« ${row.name} » est suspendue. La vitrine est fermée. Son tableau de bord reste ouvert pour toi.`
      : `« ${row.name} » est de nouveau en ligne.`,
    log: { message: next === "suspendue" ? "boutique suspendue" : "boutique réactivée", meta: { storeId: row.id } },
  }
}

const accounts = ({ q = "", role = "" } = {}) => {
  const where = ["1 = 1"]
  const args = []
  const text = String(q || "").trim()
  if (text) {
    where.push("(u.name LIKE ? OR u.email LIKE ? OR IFNULL(u.login_name, '') LIKE ?)")
    const like = likeOf(text)
    args.push(like, like, like)
  }
  if (role === "admin" || role === "merchant") {
    where.push("u.role = ?")
    args.push(role)
  }
  const rows = db.prepare(`
    SELECT u.id, u.name, u.email, u.login_name, u.role, IFNULL(u.blocked, 0) AS blocked, u.created_at,
      (SELECT COUNT(*) FROM stores s WHERE s.owner_id = u.id) AS shops
    FROM users u
    WHERE ${where.join(" AND ")}
    ORDER BY u.id DESC
    LIMIT 200`).all(...args)
  return { rows, q: text.slice(0, 80), role }
}

const account = (raw) => {
  const id = idOf(raw)
  if (!id) return null
  const row = db.prepare(`
    SELECT id, name, email, login_name, role, IFNULL(blocked, 0) AS blocked, created_at
    FROM users WHERE id = ?`).get(id)
  if (!row) return null
  const owned = db.prepare(`
    SELECT id, name, slug, status, IFNULL(plan, 'gratuit') AS plan
    FROM stores WHERE owner_id = ? ORDER BY id DESC`).all(id)
  const joined = db.prepare(`
    SELECT s.id, s.name, s.slug, m.status
    FROM store_members m JOIN stores s ON s.id = m.store_id
    WHERE m.user_id = ? ORDER BY m.id DESC`).all(id)
  return { ...row, owned, joined }
}

const setBlocked = (raw, blocked, actorId) => {
  const id = idOf(raw)
  const row = id && db.prepare("SELECT id, name, role, IFNULL(blocked, 0) AS blocked FROM users WHERE id = ?").get(id)
  if (!row) return { error: "Ce compte n'existe pas." }
  if (row.id === actorId) return { error: "Tu ne peux pas bloquer ton propre compte. Demande à un autre admin." }
  const on = blocked ? 1 : 0
  if (on && row.role === "admin") {
    const left = count("SELECT COUNT(*) n FROM users WHERE role = 'admin' AND COALESCE(blocked, 0) = 0 AND id != ?", row.id)
    if (left < 1) return { error: "C'est le dernier admin actif. Débloque-en un autre avant, sinon plus personne n'entre ici." }
  }
  if (Number(row.blocked) === on) {
    return { ok: on ? `« ${row.name} » est déjà bloqué.` : `« ${row.name} » peut déjà se connecter.` }
  }
  db.prepare("UPDATE users SET blocked = ? WHERE id = ?").run(on, row.id)
  return {
    ok: on
      ? `« ${row.name} » ne peut plus se connecter. Sa boutique reste en ligne tant que tu ne la suspends pas.`
      : `« ${row.name} » peut de nouveau se connecter.`,
    log: { message: on ? "compte bloqué" : "compte débloqué", meta: { userId: row.id } },
  }
}

const bytes = (n) => {
  const v = Number(n) || 0
  if (v < 1024) return `${v} o`
  if (v < 1024 * 1024) return `${Math.round(v / 1024)} Ko`
  return `${(v / 1024 / 1024).toFixed(1)} Mo`
}

const pragmaNum = (name) => {
  try {
    const row = db.prepare(`PRAGMA ${name}`).get()
    if (!row) return 0
    return Number(row[name] ?? Object.values(row)[0]) || 0
  } catch (_) {
    return 0
  }
}

const health = () => {
  let uploads = 0
  let uploadBytes = 0
  try {
    const dir = path.join(__dirname, "..", "public", "uploads")
    for (const name of fs.readdirSync(dir)) {
      try {
        const st = fs.statSync(path.join(dir, name))
        if (st.isFile()) {
          uploads += 1
          uploadBytes += st.size
        }
      } catch (_) { /* fichier parti entre-temps */ }
    }
  } catch (_) { /* dossier absent */ }
  let dbBytes = pragmaNum("page_size") * pragmaNum("page_count")
  if (!dbBytes) {
    try {
      dbBytes = fs.statSync(process.env.NOVADZ_DB || path.join(__dirname, "..", "data", "novadz.db")).size
    } catch (_) { dbBytes = 0 }
  }
  const mem = process.memoryUsage()
  return {
    stores: count("SELECT COUNT(*) n FROM stores"),
    users: count("SELECT COUNT(*) n FROM users"),
    products: count("SELECT COUNT(*) n FROM products"),
    orders: count("SELECT COUNT(*) n FROM orders"),
    customers: count("SELECT COUNT(*) n FROM customers"),
    reviews: count("SELECT COUNT(*) n FROM reviews"),
    errors: count("SELECT COUNT(*) n FROM logs WHERE level = 'error' AND COALESCE(last_at, created_at) >= datetime('now', '-1 day')"),
    visits: db.prepare("SELECT day, SUM(hits) n FROM visits GROUP BY day ORDER BY day DESC LIMIT 14").all(),
    uploads,
    uploadBytes,
    dbBytes,
    rss: mem.rss,
    uptime: process.uptime(),
  }
}

const logs = ({ level = "", q = "" } = {}) => {
  const where = ["1 = 1"]
  const args = []
  if (["error", "warn", "slow", "info"].includes(level)) {
    where.push("level = ?")
    args.push(level)
  }
  const text = String(q || "").trim()
  if (text) {
    where.push("(message LIKE ? OR IFNULL(meta, '') LIKE ?)")
    const like = likeOf(text)
    args.push(like, like)
  }
  return {
    rows: db.prepare(`SELECT * FROM logs WHERE ${where.join(" AND ")} ORDER BY id DESC LIMIT 200`).all(...args),
    level,
    q: text.slice(0, 80),
  }
}

const uptimeLabel = (sec) => {
  const s = Math.max(0, Math.floor(Number(sec) || 0))
  const d = Math.floor(s / 86400)
  const h = Math.floor((s % 86400) / 3600)
  const m = Math.floor((s % 3600) / 60)
  if (d) return `${d} j ${h} h`
  if (h) return `${h} h ${m} min`
  return `${m} min`
}

module.exports = {
  PLANS, planOf, badges, overview, stores, store, setPlan, toggleStatus,
  accounts, account, setBlocked, health, logs, bytes, uptimeLabel,
}
