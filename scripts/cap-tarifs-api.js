#!/usr/bin/env node
"use strict"
/**
 * Captures de la carte « Tarifs du transporteur ».
 *
 *   BASE=http://127.0.0.1:4970 node scripts/cap-tarifs-api.js
 *
 * Le transporteur n'est pas joignable depuis la machine de capture : la
 * réponse de l'API est simulée (interception de la requête), pour photographier
 * exactement ce que verra le marchand.
 */
const fs = require("node:fs")
const path = require("node:path")
const puppeteer = require("puppeteer-core")
const chromium = require("@sparticuz/chromium").default

const BASE = process.env.BASE || "http://127.0.0.1:4970"
const OUT = path.join(__dirname, "..", "captures", "tarifs-api")
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
fs.mkdirSync(OUT, { recursive: true })

const WILAYAS = require("../src/shop").WILAYAS
const rows = WILAYAS.map((w, i) => ({
  wilaya: w,
  home: i === 7 ? null : 40000 + (i % 6) * 5000,
  desk: i === 7 ? null : 30000 + (i % 6) * 4000,
  actuel: { home: 50000, desk: 40000 },
  api: i !== 7,
}))
const reponse = {
  ok: true,
  carrier: "Yalidine",
  rows,
  found: rows.filter((r) => r.api).length,
  total: rows.length,
  error: "",
}

;(async () => {
  const browser = await puppeteer.launch({
    args: [...chromium.args, "--no-sandbox", "--disable-dev-shm-usage"],
    executablePath: await chromium.executablePath(),
    headless: "new",
    defaultViewport: { width: 1180, height: 1000 },
  })
  const page = await browser.newPage()
  await page.setRequestInterception(true)
  page.on("request", (rq) => {
    if (rq.url().includes("/dashboard/shipping/tarifs-api")) {
      return rq.respond({ status: 200, contentType: "application/json", body: JSON.stringify(reponse) })
    }
    rq.continue()
  })

  await page.goto(BASE + "/login", { waitUntil: "domcontentloaded" })
  await page.type('input[name="email"]', "demo@novadz.dz")
  await page.type('input[name="password"]', "demo1234")
  await Promise.all([page.waitForNavigation({ waitUntil: "domcontentloaded" }), page.click("button.btn-primary")])

  await page.goto(BASE + "/dashboard/shipping", { waitUntil: "domcontentloaded" })
  await sleep(700)
  const carte = await page.$("[data-api-rates]")
  await carte.screenshot({ path: path.join(OUT, "1-carte-avant.png") })

  await page.click("[data-api-fetch]")
  await sleep(900)
  const carte2 = await page.$("[data-api-rates]")
  await carte2.screenshot({ path: path.join(OUT, "2-tarifs-recuperes.png") })
  await page.screenshot({ path: path.join(OUT, "3-page-livraison.png") })

  /* la cloche : le bouton « Son » */
  await page.goto(BASE + "/dashboard", { waitUntil: "domcontentloaded" })
  await sleep(600)
  await page.evaluate(() => {
    const b = document.querySelector(".ndz-bell-btn")
    if (b) b.click()
  })
  await sleep(400)
  const panneau = await page.$(".ndz-bell-panel")
  if (panneau) await panneau.screenshot({ path: path.join(OUT, "4-cloche-son.png") })

  await browser.close()
  console.log("captures prêtes :", OUT)
})().catch((e) => { console.error("ERR", e.message); process.exit(1) })
