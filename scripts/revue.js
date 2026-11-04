#!/usr/bin/env node
"use strict"
/**
 * Revue visuelle du défilement : captures empilées de haut en bas.
 *
 *   BASE=http://127.0.0.1:4600 node scripts/revue.js [dossier]
 *
 * Sur ordinateur, la page défile normalement. Sur téléphone, l'espace marchand
 * défile dans son propre cadre (.dash-main) : on descend donc CE cadre, pas la
 * fenêtre, sinon on ne verrait que le premier écran.
 * Sortie : une image par page et par taille, du haut jusqu'en bas.
 */
const fs = require("node:fs")
const { execFileSync } = require("node:child_process")
const path = require("node:path")
const puppeteer = require("puppeteer-core")
const chromium = require("@sparticuz/chromium").default

const BASE = process.env.BASE || "http://127.0.0.1:4600"
const OUT = process.argv[2] || "captures/revue"
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

const PAGES = [
  ["/dashboard", "marchand"], ["/dashboard/studio", "marchand"], ["/dashboard/orders", "marchand"],
  ["/dashboard/products", "marchand"], ["/dashboard/stock", "marchand"], ["/dashboard/design", "marchand"],
  ["/dashboard/settings", "marchand"], ["/dashboard/boutiques", "marchand"], ["/dashboard/assistant", "marchand"],
  ["/amina-mode", "visiteur"], ["/amina-mode/p/1", "visiteur"], ["/amina-mode/cart", "visiteur"],
  ["/", "visiteur"], ["/themes", "visiteur"], ["/signup", "visiteur"], ["/login", "visiteur"],
]

async function session(who) {
  const r = await fetch(`${BASE}/demo-login/${who}?next=/dashboard`, { redirect: "manual" })
  const raw = r.headers.getSetCookie ? r.headers.getSetCookie() : [r.headers.get("set-cookie") || ""]
  return raw.filter(Boolean).map((c) => c.split(";")[0]).join("; ")
}

async function capture(browser, cookie, url, larg, haut) {
  const page = await browser.newPage()
  await page.setViewport({ width: larg, height: haut })
  if (cookie) {
    const hote = new URL(BASE).hostname
    for (const m of cookie.split("; ")) {
      const i = m.indexOf("=")
      if (i > 0) await page.setCookie({ name: m.slice(0, i), value: m.slice(i + 1), domain: hote, path: "/" })
    }
  }
  await page.goto(BASE + url, { waitUntil: "networkidle2", timeout: 45000 })
  await sleep(900)

  /* quel cadre défile ? */
  const cadre = await page.evaluate(() => {
    const main = document.querySelector(".dash-main")
    if (main && main.scrollHeight > main.clientHeight + 20) return "main"
    if (document.documentElement.scrollHeight > window.innerHeight + 20) return "window"
    return "aucun"
  })
  const total = await page.evaluate((c) => (c === "main"
    ? document.querySelector(".dash-main").scrollHeight
    : document.documentElement.scrollHeight), cadre)

  const morceaux = []
  const pas = Math.round(haut * 0.9)
  for (let y = 0; y < Math.max(total, haut); y += pas) {
    await page.evaluate(({ c, y }) => {
      if (c === "main") document.querySelector(".dash-main").scrollTop = y
      else window.scrollTo(0, y)
    }, { c: cadre, y })
    await sleep(320)
    morceaux.push(await page.screenshot({ encoding: "base64" }))
    if (morceaux.length >= 6) break
  }
  await page.close()
  return { cadre, total, morceaux }
}

async function main() {
  fs.mkdirSync(OUT, { recursive: true })
  const browser = await puppeteer.launch({
    args: chromium.args, executablePath: await chromium.executablePath(), headless: true,
    defaultViewport: { width: 1440, height: 900 },
  })
  const cookies = { marchand: await session("marchand"), visiteur: "" }
  const filtre = process.env.FILTRE || ""
  for (const [larg, haut, tag] of [[1440, 900, "ordi"], [390, 844, "tel"]]) {
    for (const [url, role] of PAGES) {
      if (filtre && !new RegExp(filtre).test(url)) continue
      const { cadre, total, morceaux } = await capture(browser, cookies[role], url, larg, haut)
      const nom = path.join(OUT, `${tag}-${url.replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "") || "accueil"}.png`)
      /* on empile les morceaux avec ImageMagick si présent, sinon on garde le premier */
      const tmp = morceaux.map((b64, i) => {
        const f = nom.replace(/\.png$/, `-${i}.part.png`)
        fs.writeFileSync(f, Buffer.from(b64, "base64"))
        return f
      })
      /* on empile : une seule image, du haut de la page jusqu'en bas */
      const final = nom.replace(/\.png$/, "-complet.png")
      try {
        execFileSync("convert", [...tmp, "-append", final])
        for (const f of tmp) fs.unlinkSync(f)
      } catch (e) { console.log("   (empilement impossible : " + e.message.slice(0, 60) + ")") }
      console.log(`${tag} ${url.padEnd(24)} cadre=${cadre} hauteur=${total} morceaux=${tmp.length}`)
    }
  }
  await browser.close()
}
main().catch((e) => { console.error(e); process.exit(2) })
