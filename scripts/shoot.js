"use strict"
const http = require("http")
const fs = require("fs")
const path = require("path")
const { spawn } = require("child_process")
const { chromium } = require("playwright")

const OUT = "/home/user/captures"
const BASE = "http://127.0.0.1:3800"
fs.mkdirSync(OUT, { recursive: true })

const child = spawn("node", ["server.js"], {
  cwd: "/home/user/novadz-repo-final",
  env: { ...process.env, PORT: "3800" },
  stdio: ["ignore", "pipe", "pipe"],
})
let log = ""
child.stdout.on("data", (d) => { log += d })
child.stderr.on("data", (d) => { log += d })

const wait = (ms) => new Promise((r) => setTimeout(r, ms))

async function ready() {
  for (let i = 0; i < 40; i++) {
    try {
      await new Promise((resolve, reject) => {
        const r = http.get(BASE + "/", (res) => { res.resume(); resolve(res.statusCode) })
        r.on("error", reject)
      })
      return
    } catch (_) {}
    await wait(250)
  }
  throw new Error("server down\n" + log.slice(-500))
}

const PAGES = [
  ["login", "/login"],
  ["accueil-boutique", "/amina-mode"],
  ["fiche-produit", "/amina-mode/p/1"],
  ["panier", "/amina-mode/cart"],
  ["commande", "/amina-mode/checkout?preview=1"],
  ["legal", "/amina-mode/legal"],
  ["compte", "/amina-mode/account"],
  ["favoris", "/amina-mode/favoris"],
  ["dash", "/dashboard"],
  ["stats", "/dashboard/stats"],
  ["commandes", "/dashboard/orders"],
  ["paniers", "/dashboard/paniers"],
  ["relances", "/dashboard/relances"],
  ["produits", "/dashboard/products"],
  ["produit-nouveau", "/dashboard/products/new"],
  ["stock", "/dashboard/stock"],
  ["categories", "/dashboard/categories"],
  ["promos", "/dashboard/discounts"],
  ["themes", "/dashboard/design/themes"],
  ["design", "/dashboard/design"],
  ["formulaire", "/dashboard/formulaire"],
  ["transporteur", "/dashboard/transporteur"],
  ["livraison-frais", "/dashboard/shipping"],
  ["paiement", "/dashboard/paiement"],
  ["reseaux", "/dashboard/reseaux"],
  ["reglages", "/dashboard/settings"],
  ["pages-vente", "/dashboard/landings"],
  ["pages", "/dashboard/pages"],
  ["stats-livraison", "/dashboard/livraison"],
  ["avis", "/dashboard/reviews"],
  ["clients", "/dashboard/customers"],
  ["marketing", "/dashboard/marketing"],
]

const VIEWS = [
  ["ordi", 1440, 900],
  ["tel", 390, 844],
]

;(async () => {
  await ready()
  const browser = await chromium.launch({ headless: true })
  const manifest = []
  for (const [vname, w, h] of VIEWS) {
    const context = await browser.newContext({
      viewport: { width: w, height: h },
      deviceScaleFactor: 1,
    })
    const page = await context.newPage()
    if (vname === "ordi") {
      await page.goto(BASE + "/login", { waitUntil: "domcontentloaded" })
      await page.fill('input[name=email]', "demo@novadz.dz")
      await page.fill('input[name=password]', "demo1234")
      await page.click('button[type=submit], button.btn')
      await page.waitForTimeout(600)
    } else {
      await page.goto(BASE + "/login", { waitUntil: "domcontentloaded" })
      await page.fill('input[name=email]', "demo@novadz.dz")
      await page.fill('input[name=password]', "demo1234")
      await page.click('button[type=submit], button.btn')
      await page.waitForTimeout(600)
    }
    for (const [name, url] of PAGES) {
      const file = path.join(OUT, `${vname}-${name}.png`)
      try {
        const res = await page.goto(BASE + url, { waitUntil: "domcontentloaded", timeout: 20000 })
        await page.waitForTimeout(name === "design" ? 900 : 350)
        await page.screenshot({ path: file, fullPage: true })
        manifest.push({ view: vname, name, url, status: res ? res.status() : 0, file, h: (await page.evaluate(() => document.body.scrollHeight)) })
        console.log("ok", vname, name, res && res.status())
      } catch (e) {
        manifest.push({ view: vname, name, url, error: String(e.message || e).slice(0, 180) })
        console.log("ERR", vname, name, e.message)
      }
    }
    await context.close()
  }
  fs.writeFileSync(path.join(OUT, "manifest.json"), JSON.stringify(manifest, null, 2))
  await browser.close()
  child.kill("SIGTERM")
  setTimeout(() => process.exit(0), 300)
})().catch((e) => {
  console.error(e)
  child.kill("SIGTERM")
  process.exit(1)
})
