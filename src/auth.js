"use strict"
/** Authentification : hachage scrypt + sessions en mémoire (cookie sid). */
const crypto = require("crypto")

const SESSIONS = new Map() // sid -> { userId, cart: Map }

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
  if (sid && SESSIONS.has(sid)) return { sid, ...SESSIONS.get(sid) }

  const newSid = crypto.randomBytes(24).toString("hex")
  const session = { userId: null, cart: new Map(), promo: new Map() } // cart: `${slug}` -> Map(productId -> qty)
  SESSIONS.set(newSid, session)
  res.cookie("sid", newSid, { httpOnly: true, sameSite: "lax", maxAge: 30 * 864e5 })
  return { sid: newSid, ...session }
}

const saveSession = (sid, data) => SESSIONS.set(sid, data)

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
    const prev = res.getHeader("Set-Cookie")
    res.setHeader("Set-Cookie", prev ? [].concat(prev, c) : c)
  }
  next()
}

module.exports = { hash, verify, getSession, saveSession, cookiesParser, SESSIONS }
