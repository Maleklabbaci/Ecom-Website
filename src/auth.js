"use strict"
/** Authentification : hachage scrypt + sessions en mémoire (cookie sid).
 *  Les sessions portent une date de dernière activité : celles qui dorment
 *  depuis plus de 30 jours sont purgées toutes les heures, pour que la
 *  mémoire du processus ne grossisse pas sans fin. */
const crypto = require("crypto")

const SESSIONS = new Map() // sid -> { userId, cart: Map, seenAt }
const SESSION_IDLE_MS = 30 * 864e5

const purgeSessions = () => {
  const limit = Date.now() - SESSION_IDLE_MS
  for (const [sid, s] of SESSIONS) {
    if (!s || !s.seenAt || s.seenAt < limit) SESSIONS.delete(sid)
  }
}
const purgeTimer = setInterval(purgeSessions, 3600e3)
if (purgeTimer.unref) purgeTimer.unref()

const hash = (password, salt = crypto.randomBytes(16).toString("hex")) => {
  const key = crypto.scryptSync(password, salt, 32).toString("hex")
  return `scrypt$${salt}$${key}`
}

const verify = (password, stored) => {
  try {
    const [, salt, key] = String(stored).split("$")
    const test = crypto.scryptSync(password, salt, 32).toString("hex")
    return crypto.timingSafeEqual(Buffer.from(key, "hex"), Buffer.from(test, "hex"))
  } catch {
    return false
  }
}

/** Crée / récupère la session liée au cookie. */
const getSession = (req, res) => {
  const sid = req.cookies?.sid
  if (sid && SESSIONS.has(sid)) {
    const found = SESSIONS.get(sid)
    found.seenAt = Date.now()
    return { ...found, sid }
  }

  const newSid = crypto.randomBytes(24).toString("hex")
  const session = { userId: null, cart: new Map(), promo: new Map(), seenAt: Date.now() } // cart: `${slug}` -> Map(productId -> qty)
  SESSIONS.set(newSid, session)
  res.cookie("sid", newSid, { httpOnly: true, sameSite: "lax", maxAge: 30 * 864e5 })
  return { ...session, sid: newSid }
}

const saveSession = (sid, data) => {
  const { sid: _ignore, ...rest } = data || {}
  SESSIONS.set(sid, { ...rest, seenAt: Date.now() })
}

/**
 * Nouveau sid, même contenu (panier compris) : à appeler à chaque connexion
 * pour qu'un sid fixé avant l'authentification ne serve plus après.
 */
const regenerateSession = (req, res) => {
  const current = getSession(req, res)
  const data = SESSIONS.get(current.sid) || { userId: null, cart: new Map(), promo: new Map() }
  const newSid = crypto.randomBytes(24).toString("hex")
  SESSIONS.delete(current.sid)
  const { sid: _old, ...clean } = data
  SESSIONS.set(newSid, { ...clean, seenAt: Date.now() })
  if (res && typeof res.cookie === "function") {
    res.cookie("sid", newSid, { httpOnly: true, sameSite: "lax", maxAge: 30 * 864e5 })
  }
  return { ...SESSIONS.get(newSid), sid: newSid }
}

/** Mini parseur de cookies (évite une dépendance). */
const cookiesParser = (req, res, next) => {
  req.cookies = {}
  const raw = req.headers.cookie || ""
  raw.split(";").forEach((part) => {
    const i = part.indexOf("=")
    if (i > -1) req.cookies[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim())
  })
  res.cookie = (name, value, opts = {}) => {
    let c = `${name}=${encodeURIComponent(value)}; Path=/`
    if (opts.maxAge) c += `; Max-Age=${Math.floor(opts.maxAge / 1000)}`
    if (opts.httpOnly) c += "; HttpOnly"
    if (opts.sameSite) c += `; SameSite=${opts.sameSite}`
    /* derrière https (direct ou via le proxy), le cookie ne voyage jamais en clair */
    const isHttps = (req.socket && req.socket.encrypted)
      || String(req.headers["x-forwarded-proto"] || "").split(",")[0].trim() === "https"
    if (opts.secure || isHttps) c += "; Secure"
    const prev = res.getHeader("Set-Cookie")
    res.setHeader("Set-Cookie", prev ? [].concat(prev, c) : c)
  }
  next()
}

module.exports = { hash, verify, getSession, saveSession, regenerateSession, purgeSessions, cookiesParser, SESSIONS }
