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

/* Options du cookie de session.
 *
 * Dans une iframe (aperçu Arena, portail, démonstration intégrée), le site est
 * un contexte tiers : Chrome n'envoie pas un cookie `SameSite=Lax`, la
 * connexion ne « tient » pas et on retombe sans fin sur l'écran de connexion.
 * NOVADZ_COOKIE_SAMESITE=none passe le cookie en « none » + secure, ce que le
 * HTTPS accepte dans une iframe. Sans cette variable, rien ne change. */
const CROSS_SITE = String(process.env.NOVADZ_COOKIE_SAMESITE || "").toLowerCase() === "none"
const sessionCookie = () => ({
  httpOnly: true,
  sameSite: CROSS_SITE ? "none" : "lax",
  secure: CROSS_SITE,
  maxAge: 30 * 864e5,
})

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
  res.cookie("sid", newSid, sessionCookie())
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
    res.cookie("sid", newSid, sessionCookie())
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
    /* Derrière https (direct ou via le proxy), le cookie ne voyage jamais en
       clair. Mais en mode démo, un proxy qui annonce « x-forwarded-proto: https »
       tout en servant la page en http fait rejeter le cookie par le navigateur :
       la session est alors perdue à chaque requête (retour en boucle sur /login).
       Le mode démo est local : on n'impose donc pas Secure, la variable
       NOVADZ_FORCE_SECURE_COOKIE=1 permet de le rétablir (mise en démonstration
       derrière un vrai https). */
    const isHttps = (req.socket && req.socket.encrypted)
      || String(req.headers["x-forwarded-proto"] || "").split(",")[0].trim() === "https"
    const forceSecure = process.env.NOVADZ_FORCE_SECURE_COOKIE === "1"
      || (isHttps && process.env.NOVADZ_DEMO !== "1")
    if (opts.secure || forceSecure) c += "; Secure"
    /* Un seul en-tête par cookie : deux « sid » dans la même réponse (session
       créée puis régénérée à la connexion) et certains clients gardent le
       mauvais, ce qui casse la session. On remplace donc l'ancien. */
    const prev = [].concat(res.getHeader("Set-Cookie") || [])
      .filter((x) => String(x).split("=")[0].trim() !== name)
    res.setHeader("Set-Cookie", prev.concat(c))
  }
  next()
}

module.exports = { hash, verify, getSession, saveSession, regenerateSession, purgeSessions, cookiesParser, SESSIONS }
