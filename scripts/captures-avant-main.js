#!/usr/bin/env node
"use strict"
/**
 * « Ce qui change » : les mêmes écrans sur l'ancienne version (main, port 4700)
 * et sur la version corrigée (branche, port 4600).
 *
 *   AVANT=http://127.0.0.1:4700 APRES=http://127.0.0.1:4600 node scripts/captures-avant-main.js
 *
 * Sortie : captures/avant-main/*.png
 */
const fs = require("node:fs")
const path = require("node:path")
const puppeteer = require("puppeteer-core")
const chromium = require("@sparticuz/chromium").default

const AVANT = process.env.AVANT || "http://127.0.0.1:4700"
const APRES = process.env.APRES || "http://127.0.0.1:4600"
const OUT = path.join(__dirname, "..", "captures", "avant-main")
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
fs.mkdirSync(OUT, { recursive: true })

const browser = async () => puppeteer.launch({
  args: [...chromium.args, "--no-sandbox", "--disable-dev-shm-usage"],
  executablePath: await chromium.executablePath(),
  headless: "new",
  defaultViewport: { width: 1280, height: 900, deviceScaleFactor: 1 },
})

/** Connexion au compte de démonstration. */
async function connecter(page, base) {
  await page.goto(base + "/login", { waitUntil: "domcontentloaded" })
  await page.type('input[name="email"]', "demo@novadz.dz")
  await page.type('input[name="password"]', "demo1234")
  await Promise.all([
    page.waitForNavigation({ waitUntil: "domcontentloaded" }),
    page.click("button.btn-primary"),
  ])
  await sleep(400)
}

async function shot(page, base, url, fichier, { full = true, sel = "" } = {}) {
  await page.goto(base + url, { waitUntil: "domcontentloaded" })
  await sleep(700)
  const cible = sel ? await page.$(sel) : page
  await (cible || page).screenshot({ path: path.join(OUT, fichier), fullPage: sel ? false : full })
  console.log("✓", fichier)
}

;(async () => {
  for (const [prefixe, base] of [["avant", AVANT], ["apres", APRES]]) {
    const b = await browser()
    const page = await b.newPage()
    await connecter(page, base)

    /* 1. le menu : les icônes */
    await shot(page, base, "/dashboard/orders", `${prefixe}-menu.png`, { sel: "#dashSide" })

    /* 2. Réglages : adresse et DNS */
    await page.goto(base + "/dashboard/settings", { waitUntil: "domcontentloaded" })
    await sleep(600)
    const html = await page.content()
    const adr = /nova\.site/.test(html) ? "nova.site" : (html.match(/novadz\.dz\/[a-z-]+/) || [html.match(/\/amina-mode/) ? "/amina-mode" : "?"])[0]
    console.log(`  adresse affichée (${prefixe}) : ${adr}`)
    /* on cadre sur la partie adresse / domaine */
    await page.evaluate(() => {
      const h = [...document.querySelectorAll("h3")].find((x) => /Boutique|Adresse|domaine/i.test(x.textContent))
      if (h) h.scrollIntoView({ block: "start" })
    })
    await sleep(300)
    await page.screenshot({ path: path.join(OUT, `${prefixe}-reglages.png`) })

    /* 3. Relances : clés d'API ou « Prochainement » */
    await shot(page, base, "/dashboard/relances", `${prefixe}-relances.png`)

    /* 4. le premier écran (nouveau compte boutique) — on repart sans session */
    const mail = `d-${Date.now()}-${prefixe}@exemple.dz`
    const net = await page.createCDPSession()
    await net.send("Network.clearBrowserCookies")
    await page.goto(base + "/signup", { waitUntil: "domcontentloaded" })
    await sleep(400)
    /* les deux formulaires sont dans la page : on choisit « e-commerce »
       puis on remplit celui qui apparaît (classe pane-commerce) */
    await page.evaluate(() => {
      const radio = document.querySelector('input[name="show"][value="commerce"]')
      if (radio) radio.click()
    })
    await sleep(400)
    const rempli = await page.evaluate((mail) => {
      const form = document.querySelector("form.pane-commerce")
      if (!form) return false
      const poser = (sel, v) => { const el = form.querySelector(sel); if (el) { el.value = v; el.dispatchEvent(new Event("input", { bubbles: true })) } }
      poser('input[name="store"]', "Sac Blida")
      poser('input[name="name"]', "Karim")
      poser('input[name="email"]', mail)
      poser('input[name="password"]', "secret123")
      poser('input[name="password2"]', "secret123")
      return true
    }, mail)
    if (!rempli) throw new Error("formulaire d'inscription introuvable")
    await Promise.all([
      page.waitForNavigation({ waitUntil: "domcontentloaded" }),
      page.evaluate(() => document.querySelector("form.pane-commerce button[type=submit]").click()),
    ])
    await sleep(800)
    await page.screenshot({ path: path.join(OUT, `${prefixe}-premier-ecran.png`), fullPage: true })
    console.log("✓", `${prefixe}-premier-ecran.png`)

    await b.close()
  }
})().catch((e) => { console.error("ÉCHEC :", e.message); process.exit(1) })
