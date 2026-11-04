#!/usr/bin/env node
"use strict"
/**
 * Captures d'écran réelles du Studio, des modèles et de la boutique.
 *   node scripts/captures.js [dossier]
 * Sortie : captures/*.png (1440x900, plein écran pour les pages courtes).
 */
const path = require("node:path")
const fs = require("node:fs")
const puppeteer = require("puppeteer-core")
const chromium = require("@sparticuz/chromium").default

const BASE = process.env.BASE || "http://127.0.0.1:4600"
const OUT = path.resolve(process.argv[2] || "captures")
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

async function main() {
  fs.mkdirSync(OUT, { recursive: true })
  const browser = await puppeteer.launch({
    args: [...chromium.args, "--font-render-hinting=none"],
    executablePath: await chromium.executablePath(),
    headless: true,
    defaultViewport: { width: 1440, height: 900, deviceScaleFactor: 1 },
  })
  const page = await browser.newPage()
  const erreurs = []
  page.on("console", (m) => m.type() === "error" && erreurs.push(m.text()))
  page.on("pageerror", (e) => erreurs.push(String(e)))

  const shot = async (nom, { full = false, scroll = 0 } = {}) => {
    await sleep(1200)
    if (scroll) {
      await page.evaluate((y) => window.scrollTo(0, y), scroll)
      await sleep(700)
    }
    const f = path.join(OUT, nom + ".png")
    await page.screenshot({ path: f, fullPage: full })
    console.log("  " + nom + ".png")
  }
  const go = async (url) => {
    await page.goto(BASE + url, { waitUntil: "networkidle2", timeout: 90000 })
    await sleep(1500)
  }
  const clic = async (texte) => {
    const ok = await page.evaluate((t) => {
      const el = [...document.querySelectorAll("button,[role=tab],a")].find(
        (e) => e.textContent.trim() === t && e.offsetParent !== null
      )
      if (!el) return false
      el.click()
      return true
    }, texte)
    await sleep(1800)
    return ok
  }

  // 1) connexion marchand, puis Studio
  await go("/demo-login/marchand?next=/dashboard/studio")
  console.log("URL studio :", page.url())
  await shot("01-studio-simple")

  // 2) mode Avancé (une confirmation s'ouvre)
  console.log("  clic Avancé :", await clic("Avancé"))
  console.log("  clic confirmer :", await clic("Oui, je règle tout"))
  await sleep(2000)
  await shot("02-studio-avance")
  await shot("03-studio-avance-bas", { scroll: 600 })

  // 5) modèles / thème
  await go("/dashboard/design/themes")
  await shot("05-theme-modeles")
  await shot("06-theme-modeles-bas", { scroll: 800 })
  await go("/dashboard/design")
  await shot("10-design-modeles")
  await shot("11-design-modeles-bas", { scroll: 700 })

  // 6) tableau de bord
  await go("/dashboard")
  await shot("07-tableau-de-bord", { full: true })

  // 7) boutique publiée
  await go("/amina-mode")
  await shot("08-boutique-amina-mode", { full: false })
  await shot("09-boutique-amina-mode-bas", { scroll: 1200 })

  await browser.close()
  if (erreurs.length) console.log("\nErreurs console :\n" + erreurs.slice(0, 10).join("\n"))
  console.log("\nOK -> " + OUT)
}
main().catch((e) => {
  console.error(e)
  process.exit(1)
})
