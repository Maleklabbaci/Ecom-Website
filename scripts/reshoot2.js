"use strict"
const http = require("http")
const { spawn } = require("child_process")
const { chromium } = require("playwright")

const BASE = "http://127.0.0.1:3800"
const OUT = "/home/user/captures"
const child = spawn("node", ["server.js"], {
  cwd: "/home/user/novadz-repo-final",
  env: { ...process.env, PORT: "3800" },
  stdio: ["ignore", "pipe", "pipe"],
})
const wait = (ms) => new Promise((r) => setTimeout(r, ms))
async function ready() {
  for (let i = 0; i < 40; i++) {
    try {
      await new Promise((resolve, reject) => {
        const r = http.get(BASE + "/", (res) => { res.resume(); resolve() })
        r.on("error", reject)
      })
      return
    } catch (_) {}
    await wait(250)
  }
  throw new Error("server down")
}

const pages = [
  ["accueil-boutique", "/amina-mode"],
  ["fiche-produit", "/amina-mode/p/1"],
  ["panier", "/amina-mode/cart"],
  ["commande", "/amina-mode/checkout?preview=1"],
  ["legal", "/amina-mode/legal"],
  ["compte", "/amina-mode/account"],
  ["favoris", "/amina-mode/favoris"],
  ["themes", "/dashboard/design/themes"],
]

;(async () => {
  await ready()
  const browser = await chromium.launch({ headless: true })
  for (const [tag, w, h] of [["ordi", 1440, 900], ["tel", 390, 844]]) {
    const ctx = await browser.newContext({ viewport: { width: w, height: h } })
    await ctx.addInitScript(() => localStorage.setItem("ndz-ck-amina-mode", "yes"))
    const page = await ctx.newPage()
    await page.goto(BASE + "/login", { waitUntil: "domcontentloaded" })
    await page.fill("input[name=email]", "demo@novadz.dz")
    await page.fill("input[name=password]", "demo1234")
    await page.click("button.btn")
    await page.waitForTimeout(500)
    if (tag === "ordi") {
      await page.setViewportSize({ width: 1440, height: 900 })
      await page.goto(BASE + "/amina-mode", { waitUntil: "domcontentloaded" })
      await page.waitForTimeout(400)
      await page.screenshot({ path: "/home/user/novadz-repo-final/public/demo/theme-zen.jpg", fullPage: false })
    }
    for (const [name, url] of pages) {
      const res = await page.goto(BASE + url, { waitUntil: "domcontentloaded", timeout: 20000 })
      await page.waitForTimeout(400)
      await page.screenshot({ path: `${OUT}/${tag}-${name}.png`, fullPage: true })
      console.log("ok", tag, name, res && res.status())
    }
    await ctx.close()
  }
  await browser.close()
  child.kill("SIGTERM")
})().catch((err) => {
  console.error(err)
  child.kill("SIGTERM")
  process.exit(1)
})
