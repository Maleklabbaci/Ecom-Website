#!/usr/bin/env node
/**
 * Régénère les captures des thèmes « prêts à l'emploi »
 * (public/demo/theme-<id>.jpg), affichées sur la page Thèmes du marchand.
 *
 * Démarre NovaDZ sur une base temporaire (données de démo), applique chaque
 * thème à la boutique, photographie la page d'accueil réelle, puis s'arrête.
 * Aucune donnée du poste n'est touchée.
 *
 * Navigateur : CHROME_PATH=/chemin/vers/chrome, sinon les emplacements
 * habituels de Chromium / Chrome / Edge sont essayés.
 *
 *   node scripts/shoot-themes.js
 */
"use strict"
const fs = require("fs")
const os = require("os")
const path = require("path")

const ROOT = path.join(__dirname, "..")
const THEMES = ["atelier", "electro", "bureau", "audio", "soin", "mode"]

function findBrowser() {
  const candidates = [
    process.env.CHROME_PATH,
    "/usr/bin/chromium", "/usr/bin/chromium-browser",
    "/usr/bin/google-chrome", "/usr/bin/google-chrome-stable",
    "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
    "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
    "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  ].filter(Boolean)
  return candidates.find((p) => { try { return fs.existsSync(p) } catch (_) { return false } }) || ""
}

async function main() {
  const exe = findBrowser()
  if (!exe) {
    console.error("Aucun navigateur trouvé. Installe Chrome/Chromium ou définis CHROME_PATH.")
    process.exit(1)
  }
  const puppeteer = require("puppeteer-core")
  const { startServer, openDb } = require(path.join(ROOT, "tests", "boot"))
  const DB = path.join(os.tmpdir(), `novadz-shoot-${Date.now()}.db`)
  const outDir = path.join(ROOT, "public", "demo")
  fs.mkdirSync(outDir, { recursive: true })

  const started = await startServer({ db: DB })
  const browser = await puppeteer.launch({
    executablePath: exe,
    args: ["--no-sandbox", "--disable-dev-shm-usage", "--disable-gpu"],
    headless: true,
  })
  try {
    const page = await browser.newPage()
    await page.setViewport({ width: 1100, height: 750, deviceScaleFactor: 1 })
    for (const id of THEMES) {
      const db = openDb(DB)
      db.prepare("UPDATE stores SET theme = ?, sections = NULL, design = NULL, draft = NULL WHERE id = 1").run(id)
      db.close()
      await page.goto(started.base + "/amina-mode", { waitUntil: "networkidle0", timeout: 30000 })
      /* captures propres : ni bandeau cookies, ni bouton flottant, ni pastille de langue */
      await page.addStyleTag({ content: ".cookies,.wa-float,.lang-pill{display:none!important}" })
      await new Promise((r) => setTimeout(r, 700))
      const file = path.join(outDir, `theme-${id}.jpg`)
      await page.screenshot({ path: file, type: "jpeg", quality: 78 })
      console.log("capture :", file, fs.statSync(file).size, "octets")
    }
  } finally {
    await browser.close()
    started.child.kill()
    try { fs.unlinkSync(DB) } catch (_) {}
  }
  console.log("Terminé : les captures sont dans public/demo/")
}

main().catch((e) => { console.error(e && e.message || e); process.exit(1) })
