"use strict"
/**
 * Icônes d'application (PWA) dessinées à la volée.
 *
 * Aucune bibliothèque d'images dans le projet : on écrit un PNG à la main
 * (zlib est fourni par Node). L'icône reste la même pour tout le monde —
 * un carré arrondi de la couleur de la boutique, avec un sac blanc au
 * milieu — mais chaque boutique a sa couleur, donc sa tuile sur le
 * téléphone du client.
 *
 * Pourquoi pas le logo du vendeur ? Parce qu'il faudrait le redimensionner,
 * et qu'un logo large (800×300) donne une icône illisible. Le sac, lui,
 * reste net à 192 px comme à 512 px, et laisse le logo à sa place : dans
 * l'en-tête du site.
 */
const zlib = require("zlib")

/* ------------------------------- PNG brut ------------------------------- */
const CRC = (() => {
  const table = new Int32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    table[n] = c
  }
  return (buf) => {
    let c = -1
    for (let i = 0; i < buf.length; i++) c = table[(c ^ buf[i]) & 0xff] ^ (c >>> 8)
    return (c ^ -1) >>> 0
  }
})()

const chunk = (type, data) => {
  const len = Buffer.alloc(4)
  len.writeUInt32BE(data.length, 0)
  const body = Buffer.concat([Buffer.from(type, "ascii"), data])
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(CRC(body), 0)
  return Buffer.concat([len, body, crc])
}

/** canvas RGBA → PNG (8 bits, couleur + transparence). */
const encode = (width, height, rgba) => {
  const head = Buffer.alloc(13)
  head.writeUInt32BE(width, 0)
  head.writeUInt32BE(height, 4)
  head[8] = 8   // 8 bits par canal
  head[9] = 6   // RGBA
  const raw = Buffer.alloc((width * 4 + 1) * height)
  for (let y = 0; y < height; y++) {
    raw[y * (width * 4 + 1)] = 0
    rgba.copy(raw, y * (width * 4 + 1) + 1, y * width * 4, (y + 1) * width * 4)
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", head),
    chunk("IDAT", zlib.deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ])
}

/* ------------------------------ couleurs ------------------------------ */
const hex = (v, fallback) => {
  const m = /^#?([0-9a-f]{6})$/i.exec(String(v || "").trim())
  if (!m) return hex(fallback)
  const n = parseInt(m[1], 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}

/** fond lisible : le texte/le sac passent en blanc ou en noir selon la teinte. */
const inkOn = ([r, g, b]) => {
  const lin = (c) => {
    const s = c / 255
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4)
  }
  const L = 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b)
  return L > 0.55 ? [17, 17, 17] : [255, 255, 255]
}

/* ------------------------------- dessin ------------------------------- */
const mix = (a, b, t) => a + (b - a) * t

/** couverture douce sur les bords (anti-crénelage simple, 3×3 échantillons). */
const cover = (test, x, y) => {
  let n = 0
  for (let i = 0; i < 3; i++) {
    for (let j = 0; j < 3; j++) {
      if (test(x + (i + 0.5) / 3, y + (j + 0.5) / 3)) n++
    }
  }
  return n / 9
}

const roundRect = (x, y, w, h, r) => (px, py) => {
  if (px < x || px > x + w || py < y || py > y + h) return false
  const dx = Math.min(Math.max(px, x + r), x + w - r)
  const dy = Math.min(Math.max(py, y + r), y + h - r)
  return (px - dx) ** 2 + (py - dy) ** 2 <= r * r
}

/** le sac : un corps qui s'évase vers le bas, une anse fine juste au-dessus. */
const bag = (cx, cy, s) => {
  const wTop = s * 0.60
  const wBot = s * 0.70
  const h = s * 0.48
  const top = cy - h / 2 + s * 0.13
  const bottom = top + h
  const r = s * 0.08
  const handleR = s * 0.155
  const handleOx = cx
  const handleOy = top - s * 0.035
  const thick = s * 0.038
  return (px, py) => {
    if (py >= top && py <= bottom) {
      const t = (py - top) / h
      const hw = (wTop + (wBot - wTop) * t) / 2
      const dx = Math.abs(px - cx)
      if (dx <= hw) {
        const inRound = py <= bottom - r || Math.hypot(Math.max(0, dx - (hw - r)), py - (bottom - r)) <= r
        if (inRound) return true
      }
    }
    /* anse : demi-anneau au-dessus du sac, avec un petit vide */
    if (py < handleOy && py > handleOy - handleR - thick) {
      const d = Math.hypot(px - handleOx, py - handleOy)
      if (Math.abs(d - handleR) <= thick) return true
    }
    return false
  }
}

/**
 * Icône carrée.
 * @param {number} size  192, 512…
 * @param {string} color couleur de fond (#111111 par défaut)
 * @param {boolean} maskable  marge de sécurité (Android rogne les bords)
 */
const icon = (size = 512, color = "#111111", maskable = false) => {
  const bg = hex(color, "#111111")
  const fg = inkOn(bg)
  const px = Buffer.alloc(size * size * 4)
  /* maskable : fond plein bord à bord, le système arrondit lui-même le contour
     et rogne les bords — le sac reste dans la zone sûre (80 % du centre). */
  const card = maskable ? () => true : roundRect(0, 0, size, size, size * 0.23)
  const mark = bag(size / 2, size / 2, size * (maskable ? 0.5 : 0.62))
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const a = cover(card, x, y)
      if (a <= 0) continue
      const b = cover(mark, x, y)
      const i = (y * size + x) * 4
      px[i] = Math.round(mix(bg[0], fg[0], b))
      px[i + 1] = Math.round(mix(bg[1], fg[1], b))
      px[i + 2] = Math.round(mix(bg[2], fg[2], b))
      px[i + 3] = Math.round(a * 255)
    }
  }
  return encode(size, size, px)
}

/** Couleur de fond d'une boutique : sa couleur d'accent, sinon son thème. */
const storeColor = (design) => {
  const accent = design && typeof design.accent === "string" ? design.accent : ""
  if (/^#[0-9a-f]{6}$/i.test(accent)) return accent
  return "#111111"
}

module.exports = { icon, storeColor, encode }
