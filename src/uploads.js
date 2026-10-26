"use strict"
/** Enregistrement d'images envoyées en data-URL (aucune dépendance externe). */

const fs = require("fs")
const path = require("path")
const crypto = require("crypto")

const DIR = path.join(__dirname, "..", "public", "uploads")
fs.mkdirSync(DIR, { recursive: true })

const EXT = { "image/png": "png", "image/jpeg": "jpg", "image/jpg": "jpg", "image/webp": "webp", "image/gif": "gif" }
const MAX = 2.5 * 1024 * 1024

/** Vérifie la signature binaire (et pas seulement le type annoncé par le client). */
function looksLikeImage(buf) {
  if (!buf || buf.length < 12) return false
  const hex = buf.subarray(0, 12).toString("hex")
  if (hex.startsWith("89504e47")) return true                 // PNG
  if (hex.startsWith("ffd8ff")) return true                   // JPEG
  if (hex.slice(0, 8) === "52494646" && buf.subarray(8, 12).toString() === "WEBP") return true
  if (buf.subarray(0, 6).toString() === "GIF87a" || buf.subarray(0, 6).toString() === "GIF89a") return true
  return false
}

/** dataUrl: "data:image/png;base64,...." → { ok, url } ou { ok:false, error } */
function saveDataUrl(dataUrl) {
  if (typeof dataUrl !== "string") return { ok: false, error: "Image manquante." }
  const m = /^data:([\w/+.-]+);base64,(.+)$/.exec(dataUrl)
  if (!m) return { ok: false, error: "Format d'image invalide." }
  const type = m[1].toLowerCase()
  if (!EXT[type]) return { ok: false, error: "Formats acceptés : PNG, JPG, WEBP, GIF." }
  const buf = Buffer.from(m[2], "base64")
  if (buf.length > MAX) return { ok: false, error: "Image trop lourde (2,5 Mo max après compression)." }
  if (!looksLikeImage(buf)) return { ok: false, error: "Ce fichier n'est pas une image valide." }
  const name = crypto.createHash("sha1").update(buf).digest("hex").slice(0, 16) + "." + EXT[type]
  fs.writeFileSync(path.join(DIR, name), buf)
  return { ok: true, url: "/uploads/" + name }
}

/** Supprime un fichier d'upload local (ignore les images externes). */
function removeUrl(url) {
  if (!url || !url.startsWith("/uploads/")) return
  const f = path.join(DIR, path.basename(url))
  try {
    if (fs.existsSync(f)) fs.unlinkSync(f)
  } catch (_) {}
}

/**
 * Supprime les fichiers de public/uploads qui ne sont référencés nulle part
 * (produits, galeries, sections, design, pages). Retourne le nombre supprimé.
 */
function cleanup(db) {
  const used = new Set()
  const add = (u) => {
    if (typeof u !== "string") return
    if (u.startsWith("/uploads/")) used.add(path.basename(u))
  }
  try {
    db.prepare("SELECT image FROM products WHERE image IS NOT NULL").all().forEach((r) => add(r.image))
    db.prepare("SELECT url FROM product_images").all().forEach((r) => add(r.url))
    const stores = db.prepare("SELECT design, sections, logo FROM stores").all()
    const walk = (o) => {
      if (!o) return
      if (typeof o === "string") return add(o)
      if (Array.isArray(o)) return o.forEach(walk)
      if (typeof o === "object") return Object.values(o).forEach(walk)
    }
    stores.forEach((s) => {
      add(s.logo)
      try { walk(JSON.parse(s.design || "{}")) } catch (_) {}
      try { walk(JSON.parse(s.sections || "[]")) } catch (_) {}
    })
  } catch (_) {}

  let removed = 0
  for (const f of fs.readdirSync(DIR)) {
    if (used.has(f)) continue
    try {
      fs.unlinkSync(path.join(DIR, f))
      removed++
    } catch (_) {}
  }
  return removed
}

module.exports = { saveDataUrl, removeUrl, cleanup, DIR, looksLikeImage }
