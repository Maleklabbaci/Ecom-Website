"use strict"
/* Les images de démonstration vivent dans /assets (versionné) et sont
   recopiées dans /public/uploads au démarrage si elles ont disparu. */
const fs = require("fs")
const path = require("path")

const SRC = path.join(__dirname, "..", "assets")
const DEST = path.join(__dirname, "..", "public", "uploads")

function ensureDemoImages() {
  try {
    if (!fs.existsSync(SRC)) return 0
    fs.mkdirSync(DEST, { recursive: true })
    let copied = 0
    for (const f of fs.readdirSync(SRC)) {
      const to = path.join(DEST, f)
      if (!fs.existsSync(to)) {
        fs.copyFileSync(path.join(SRC, f), to)
        copied++
      }
    }
    return copied
  } catch (_) {
    return 0
  }
}

module.exports = { ensureDemoImages }
