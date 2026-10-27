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
        const r = http.get(BASE + "/", (res) => { res.resume(); resolve(res.statusCode) })
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
  ["design", "/dashboard/design"],
  ["themes", "/dashboard/design/themes"],
  ["transporteur", "/dashboard/transporteur"],
  ["formulaire", "/dashboard/formulaire"],
]

;(async () => {
  await ready()
  const browser = await chromium.launch({ headless: true })
  const ctx = await browser.newContext()
  const page = await ctx.newPage()
  await page.goto(BASE + "/login", { waitUntil: "networkidle" })
  await page.fill('input[name="email"]', "demo@novadz.dz")
  await page.fill('input[name="password"]', "demo1234")
  await page.click("button.btn")
  await page.waitForLoadState("networkidle")

  await page.setViewportSize({ width: 1440, height: 900 })
  await page.goto(BASE + "/amina-mode", { waitUntil: "networkidle" })
  await page.screenshot({ path: "/home/user/novadz-repo-final/public/demo/theme-zen.jpg", fullPage: false })

  for (const [name, url] of pages) {
    for (const [tag, w, h] of [["ordi", 1440, 900], ["tel", 390, 844]]) {
      await page.setViewportSize({ width: w, height: h })
      const res = await page.goto(BASE + url, { waitUntil: "networkidle" })
      await page.screenshot({ path: `${OUT}/${tag}-${name}.png`, fullPage: true })
      console.log("ok", tag, name, res && res.status())
    }
  }
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto(BASE + "/amina-mode/p/1", { waitUntil: "networkidle" })
  await page.screenshot({ path: `${OUT}/tel-ecran-produit.png`, fullPage: false })
  await page.goto(BASE + "/amina-mode", { waitUntil: "networkidle" })
  await page.screenshot({ path: `${OUT}/tel-ecran-accueil.png`, fullPage: false })
  await browser.close()
  child.kill("SIGTERM")
})().catch((err) => {
  console.error(err)
  child.kill("SIGTERM")
  process.exit(1)
})
