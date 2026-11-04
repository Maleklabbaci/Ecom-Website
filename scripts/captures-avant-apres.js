#!/usr/bin/env node
"use strict"
/**
 * Captures « avant / après » : on ouvre la même page sur deux serveurs
 * (l'ancien code et le code corrigé) et on prend exactement le même cadrage.
 *
 *   node scripts/captures-avant-apres.js 4700 4600
 */
const fs = require("node:fs")
const path = require("node:path")
const puppeteer = require("puppeteer-core")
const chromium = require("@sparticuz/chromium").default

const PORT_AVANT = process.argv[2] || "4700"
const PORT_APRES = process.argv[3] || "4600"
const OUT = "captures/avant-apres"
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

/* chaque scène : la page, et quoi amener dans le cadre */
const SCENES = [
  {
    nom: "1-reglages",
    url: "/dashboard/settings",
    apres: async (p) => {
      await p.evaluate(() => {
        const m = document.querySelector(".dash-main")
        if (m) m.scrollTop = m.scrollHeight
        else window.scrollTo(0, document.documentElement.scrollHeight)
      })
    },
  },
  {
    /* sur Stock, une carte etait coupee net a 72 px : son contenu n'existait plus.
       On descend en bas, la ou la carte « Prevenir quand le stock atteint » vit. */
    nom: "2-stock",
    url: "/dashboard/stock",
    apres: async (p) => {
      await p.evaluate(() => {
        const m = document.querySelector(".dash-main")
        if (m) m.scrollTop = m.scrollHeight
      })
    },
  },
  {
    nom: "3-case",
    url: "/dashboard/boutiques",
    apres: async (p) => {
      await p.evaluate(() => {
        const c = document.querySelector(".check")
        if (c) c.scrollIntoView({ block: "center" })
      })
    },
  },

  {
    nom: "4-barre",
    url: "/amina-mode",
    apres: async (p) => {
      await p.evaluate(() => window.scrollTo(0, 1200))
    },
  },
]

async function connexion(base) {
  const r = await fetch(`${base}/demo-login/marchand?next=/dashboard`, { redirect: "manual" })
  const raw = r.headers.getSetCookie ? r.headers.getSetCookie() : [r.headers.get("set-cookie") || ""]
  return raw.filter(Boolean).map((c) => c.split(";")[0]).join("; ")
}

async function capturer(browser, base, scene, fichier) {
  const page = await browser.newPage()
  await page.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true, deviceScaleFactor: 2 })
  const cookie = await connexion(base)
  for (const m of cookie.split("; ")) {
    const i = m.indexOf("=")
    if (i > 0) await page.setCookie({ name: m.slice(0, i), value: m.slice(i + 1), domain: new URL(base).hostname, path: "/" })
  }
  await page.goto(base + scene.url, { waitUntil: "networkidle2", timeout: 45000 })
  await sleep(900)
  await scene.apres(page)
  await sleep(700)
  await page.screenshot({ path: fichier })
  await page.close()
}

async function main() {
  fs.mkdirSync(OUT, { recursive: true })
  const browser = await puppeteer.launch({ args: chromium.args, executablePath: await chromium.executablePath(), headless: true })
  for (const scene of SCENES) {
    const a = path.join(OUT, `${scene.nom}-avant.png`)
    const b = path.join(OUT, `${scene.nom}-apres.png`)
    await capturer(browser, `http://127.0.0.1:${PORT_AVANT}`, scene, a)
    await capturer(browser, `http://127.0.0.1:${PORT_APRES}`, scene, b)
    console.log(`✓ ${scene.nom}`)
  }
  await browser.close()
}
main().catch((e) => { console.error(e); process.exit(2) })
