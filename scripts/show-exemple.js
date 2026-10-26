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

;(async () => {
  await ready()
  const browser = await chromium.launch({ headless: true })
  const shots = [
    ["ordi-exemple-accueil", 1440, 900, "/amina-mode", false],
    ["tel-exemple-accueil", 390, 844, "/amina-mode", false],
    ["ordi-exemple-produit", 1440, 900, "/amina-mode/p/1", false],
    ["tel-exemple-produit", 390, 844, "/amina-mode/p/1", false],
  ]
  for (const [name, w, h, url] of shots) {
    const ctx = await browser.newContext({ viewport: { width: w, height: h } })
    await ctx.addInitScript(() => localStorage.setItem("ndz-ck-amina-mode", "yes"))
    const page = await ctx.newPage()
    const res = await page.goto(BASE + url, { waitUntil: "networkidle", timeout: 20000 })
    await page.waitForTimeout(400)
    await page.screenshot({ path: `${OUT}/${name}.png`, fullPage: false })
    console.log("ok", name, res && res.status())
    await ctx.close()
  }
  await browser.close()
  child.kill("SIGTERM")
})().catch((err) => {
  console.error(err)
  child.kill("SIGTERM")
  process.exit(1)
})
