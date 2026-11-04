#!/usr/bin/env node
"use strict"
/**
 * Captures de l'après-connexion, en français, sans arabe.
 *
 *   BASE=http://127.0.0.1:4600 node scripts/captures-onboarding.js
 *
 * 1. inscription « boutique » → le premier écran de la boutique ;
 * 2. inscription « vitrine »  → le premier écran de la vitrine ;
 * 3. Réglages : l'adresse gratuite avant le domaine ;
 * 4. Relances : la carte « Prochainement » ;
 * 5. le menu : une icône par page.
 * Sortie : captures/revue/*.png
 */
const fs = require("node:fs")
const path = require("node:path")
const puppeteer = require("puppeteer-core")
const chromium = require("@sparticuz/chromium").default

const BASE = process.env.BASE || "http://127.0.0.1:4600"
const OUT = path.join(__dirname, "..", "captures", "revue")
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
fs.mkdirSync(OUT, { recursive: true })

const browser = async () => puppeteer.launch({
  args: [...chromium.args, "--no-sandbox", "--disable-dev-shm-usage"],
  executablePath: await chromium.executablePath(),
  headless: "new",
  defaultViewport: { width: 1280, height: 900, deviceScaleFactor: 1 },
})

/** Inscription, puis on s'arrête sur le premier écran. */
async function inscription(page, { kind, nom, boutique, mail }) {
  await page.goto(BASE + "/signup", { waitUntil: "domcontentloaded" })
  await page.click(`input[name="show"][value="${kind}"]`)
  await sleep(250)
  const form = `form.pane-${kind === "commerce" ? "commerce" : "vitrine"}`
  await page.$eval(`${form} input[name="store"]`, (el, v) => { el.value = v }, boutique)
  await page.$eval(`${form} input[name="name"]`, (el, v) => { el.value = v }, nom)
  await page.$eval(`${form} input[name="email"]`, (el, v) => { el.value = v }, mail)
  await page.$eval(`${form} input[name="password"]`, (el) => { el.value = "secret123" }, null)
  await page.$eval(`${form} input[name="password2"]`, (el) => { el.value = "secret123" }, null)
  await Promise.all([
    page.waitForNavigation({ waitUntil: "domcontentloaded" }),
    page.$eval(form + " button[type=submit]", (b) => b.click()),
  ])
  await sleep(500)
}

async function shoot(page, url, file, { full = true } = {}) {
  await page.goto(BASE + url, { waitUntil: "domcontentloaded" })
  await sleep(600)
  await page.screenshot({ path: path.join(OUT, file), fullPage: full })
  console.log("✓", file)
}

;(async () => {
  const stamp = Date.now().toString().slice(-6)

  /** Un navigateur neuf par parcours : les cookies ne se mélangent pas. */
  async function parcours(fn, { viewport } = {}) {
    const b = await browser()
    if (viewport) await b.defaultBrowserContext().overridePermissions(BASE, [])
    const page = await b.newPage()
    if (viewport) await page.setViewport(viewport)
    try { await fn(page) } finally { await b.close() }
  }

  /* ---- 1. boutique ---- */
  await parcours(async (page) => {
    await inscription(page, { kind: "commerce", nom: "Karim", boutique: "Sac Blida", mail: `c-${stamp}@t.dz` })
    await page.screenshot({ path: path.join(OUT, "1-apres-signup-boutique.png"), fullPage: true })
    console.log("✓ 1-apres-signup-boutique.png")
  })

  /* ---- 2. vitrine ---- */
  await parcours(async (page) => {
    await inscription(page, { kind: "vitrine", nom: "Lina", boutique: "Atelier Lina", mail: `v-${stamp}@t.dz` })
    await page.screenshot({ path: path.join(OUT, "2-apres-signup-vitrine.png"), fullPage: true })
    console.log("✓ 2-apres-signup-vitrine.png")
  })

  /* ---- 3 à 5. le marchand de démonstration ---- */
  await parcours(async (page) => {
    await page.goto(BASE + "/login", { waitUntil: "domcontentloaded" })
    await page.type('input[name="email"]', "demo@novadz.dz")
    await page.type('input[name="password"]', "demo1234")
    await Promise.all([
      page.waitForNavigation({ waitUntil: "domcontentloaded" }),
      page.click("button.btn-primary"),
    ])

    await shoot(page, "/dashboard/settings", "3-reglages-adresse.png")
    await shoot(page, "/dashboard/relances", "4-relances-prochainement.png")

    /* le menu seul : une icône par page */
    await page.goto(BASE + "/dashboard/orders", { waitUntil: "domcontentloaded" })
    await sleep(600)
    const side = await page.$("#dashSide")
    if (side) {
      await side.screenshot({ path: path.join(OUT, "5-menu-icones.png") })
      console.log("✓ 5-menu-icones.png")
    }
  })

  /* téléphone : le premier écran */
  await parcours(async (page) => {
    await inscription(page, { kind: "vitrine", nom: "Sara", boutique: "Photo Sara", mail: `m-${stamp}@t.dz` })
    await page.screenshot({ path: path.join(OUT, "6-premier-ecran-telephone.png"), fullPage: true })
    console.log("✓ 6-premier-ecran-telephone.png")
  }, { viewport: { width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true } })
})().catch((e) => { console.error("ÉCHEC :", e.message); process.exit(1) })
