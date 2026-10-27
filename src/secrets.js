"use strict"
/**
 * Chiffrement des secrets (jetons API des transporteurs).
 *
 * Clé : variable d'environnement NOVADZ_SECRET si elle existe, sinon une clé générée
 * une fois et stockée dans data/.secret (exclu de git). AES-256-GCM : le jeton est
 * chiffré et authentifié, il n'est jamais stocké en clair ni affiché en entier.
 */
const crypto = require("crypto")
const fs = require("fs")
const path = require("path")

const DIR = path.join(__dirname, "..", "data")
const FILE = path.join(DIR, ".secret")

const key = () => {
  if (process.env.NOVADZ_SECRET) {
    return crypto.createHash("sha256").update(String(process.env.NOVADZ_SECRET)).digest()
  }
  fs.mkdirSync(DIR, { recursive: true })
  if (!fs.existsSync(FILE)) fs.writeFileSync(FILE, crypto.randomBytes(32).toString("hex"), { mode: 0o600 })
  return crypto.createHash("sha256").update(fs.readFileSync(FILE, "utf8").trim()).digest()
}

const encrypt = (plain) => {
  if (plain == null || plain === "") return ""
  const iv = crypto.randomBytes(12)
  const c = crypto.createCipheriv("aes-256-gcm", key(), iv)
  const data = Buffer.concat([c.update(String(plain), "utf8"), c.final()])
  return ["v1", iv.toString("base64"), c.getAuthTag().toString("base64"), data.toString("base64")].join(":")
}

const decrypt = (blob) => {
  if (!blob) return ""
  const parts = String(blob).split(":")
  if (parts.length !== 4 || parts[0] !== "v1") return ""
  try {
    const d = crypto.createDecipheriv("aes-256-gcm", key(), Buffer.from(parts[1], "base64"))
    d.setAuthTag(Buffer.from(parts[2], "base64"))
    return Buffer.concat([d.update(Buffer.from(parts[3], "base64")), d.final()]).toString("utf8")
  } catch (_) {
    return ""
  }
}

/** Masque un secret pour l'affichage : « EAAG…f3k2 ». */
const mask = (plain) => {
  const s = String(plain || "")
  if (!s) return ""
  if (s.length <= 8) return "•".repeat(s.length)
  return s.slice(0, 4) + "…" + s.slice(-4)
}

module.exports = { encrypt, decrypt, mask }
