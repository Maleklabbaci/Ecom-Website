#!/usr/bin/env node
"use strict"
/**
 * Audit « défilement, en bas de page » — ce que le client voit quand il descend.
 *
 *   BASE=http://127.0.0.1:4600 node scripts/audit-bas.js [dossier]
 *
 * Pour chaque page : on descend tout en bas, puis on regarde
 *   - si le dernier contenu est caché derrière une barre fixe (bas ou haut)
 *   - si une barre fixe prend trop de place
 *   - capture de l'écran d'arrivée
 */
const fs = require("node:fs")
const path = require("node:path")
const puppeteer = require("puppeteer-core")
const chromium = require("@sparticuz/chromium").default

const BASE = process.env.BASE || "http://127.0.0.1:4600"
const OUT = process.argv[2] || "captures/bas"
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

const PAGES = [
  "/", "/dashboard", "/dashboard/studio", "/dashboard/design", "/dashboard/design/themes",
  "/dashboard/products", "/dashboard/orders", "/dashboard/stock", "/dashboard/settings",
  "/dashboard/boutiques", "/dashboard/assistant",
  "/amina-mode", "/amina-mode/p/1", "/amina-mode/cart", "/tech-dz", "/atelier-lina",
]

async function session(who) {
  const r = await fetch(`${BASE}/demo-login/${who}?next=/dashboard`, { redirect: "manual" })
  const raw = r.headers.getSetCookie ? r.headers.getSetCookie() : [r.headers.get("set-cookie") || ""]
  return raw.filter(Boolean).map((c) => c.split(";")[0]).join("; ")
}

async function bas(browser, cookie, url, larg, haut) {
  const page = await browser.newPage()
  await page.setViewport({ width: larg, height: haut })
  if (cookie) {
    const hote = new URL(BASE).hostname
    for (const m of cookie.split("; ")) {
      const i = m.indexOf("=")
      if (i > 0) await page.setCookie({ name: m.slice(0, i), value: m.slice(i + 1), domain: hote, path: "/" })
    }
  }
  const r = await page.goto(BASE + url, { waitUntil: "networkidle2", timeout: 45000 })
  await sleep(700)
  /* defilement doux : on descend par etapes, puis on force l'arrivee en bas
     (scroll-behavior:smooth empeche un saut unique) */
  await page.evaluate(async () => {
    /* on mesure le bas atteignable, pas la duree de l'animation : certains
       modeles activent scroll-behavior:smooth, ce qui ferait echouer le test */
    document.documentElement.style.scrollBehavior = "auto"
    const main = document.querySelector(".dash-main")
    const cadre = main && main.scrollHeight > main.clientHeight + 20 ? main : null
    const pas = Math.round(window.innerHeight * 0.8)
    const haut = cadre ? cadre.scrollHeight : document.documentElement.scrollHeight
    const vers = (y) => { if (cadre) cadre.scrollTop = y; else window.scrollTo(0, y) }
    for (let y = 0; y < haut; y += pas) {
      vers(y)
      await new Promise((r) => setTimeout(r, 90))
    }
    vers(haut)
    await new Promise((r) => setTimeout(r, 500))
  })
  await sleep(600)
  const infos = await page.evaluate(() => {
    const vh = window.innerHeight
    const fixes = [...document.querySelectorAll("body *")].filter((el) => {
      const cs = getComputedStyle(el)
      if (cs.position !== "fixed" && cs.position !== "sticky") return false
      const r = el.getBoundingClientRect()
      return r.height > 20 && r.width > 100 && cs.visibility !== "hidden" && cs.opacity !== "0" && cs.display !== "none"
    }).map((el) => {
      const r = el.getBoundingClientRect()
      const cs = getComputedStyle(el)
      return {
        cls: String(el.className || el.id || el.tagName).slice(0, 48),
        haut: Math.round(r.top), bas: Math.round(r.bottom), h: Math.round(r.height),
        enBas: r.bottom > vh - 6, enHaut: r.top < 6,
        doigt: cs.pointerEvents !== "none",   /* une couche decorative laisse passer le doigt */
      }
    })
    /* le dernier texte de la page : est-il visible au-dessus de la barre du bas ? */
    const barreBas = fixes.filter((f) => f.enBas).sort((a, b) => b.h - a.h)[0] || null
    const fins = [...document.querySelectorAll("footer, .dash-foot, main > *:last-child, section:last-of-type")]
      .map((el) => el.getBoundingClientRect()).filter((r) => r.height > 0)
    const dernierBas = fins.length ? Math.max(...fins.map((r) => r.bottom)) : 0
    const cadre = document.querySelector(".dash-main")
    const scrolleur = cadre && cadre.scrollHeight > cadre.clientHeight + 20 ? cadre : null
    const basAtteint = scrolleur
      ? scrolleur.scrollTop + scrolleur.clientHeight >= scrolleur.scrollHeight - 4
      : window.scrollY + vh >= document.documentElement.scrollHeight - 4
    return { vh, fixes, barreBas, dernierBas: Math.round(dernierBas), fin: basAtteint }
  })
  if (OUT) {
    fs.mkdirSync(OUT, { recursive: true })
    await page.screenshot({ path: path.join(OUT, `${larg}-${url.replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "") || "accueil"}.png`) })
  }
  await page.close()
  return { url, larg, status: r ? r.status() : 0, ...infos }
}

async function main() {
  const browser = await puppeteer.launch({
    args: chromium.args, executablePath: await chromium.executablePath(), headless: true,
    defaultViewport: { width: 1440, height: 900 },
  })
  const cookies = { marchand: await session("marchand"), visiteur: "" }
  const rapport = []
  for (const [larg, haut] of [[1440, 900], [390, 844]]) {
    for (const url of PAGES) {
      const role = /^\/(dashboard|)$/.test(url) || url.startsWith("/dashboard") ? "marchand" : "visiteur"
      const r = await bas(browser, cookies[role], url, larg, haut)
      rapport.push(r)
      const pb = []
      if (r.status >= 400) pb.push("HTTP " + r.status)
      if (!r.fin) pb.push("impossible d'atteindre le bas")
      /* une barre du bas genante : elle prend le doigt, elle a la taille d'une barre
         (pas d'un panneau plein ecran) et elle passe devant le dernier contenu */
      /* genante seulement si le dernier contenu passe dessous */
      const gene = r.fixes.filter((f) => f.enBas && f.doigt && f.h > 40 && f.h < r.vh * 0.4 && r.dernierBas > f.haut + 2)
      if (gene.length) pb.push("barre du bas devant le contenu : " + gene.map((f) => `${f.cls} (${f.h}px)`).join(", "))
      r.genants = gene
      if (pb.length) console.log(`✗ ${larg} ${url.padEnd(28)} ${pb.join(" | ")}`)
    }
  }
  await browser.close()

  console.log("\n--- barres fixes vues (pour information) ---")
  for (const r of rapport) {
    const b = r.fixes.filter((f) => f.enBas || f.enHaut).map((f) => `${f.cls} (${f.h}px ${f.enHaut ? "haut" : "bas"})`)
    if (b.length) console.log(`${r.larg} ${r.url.padEnd(26)} ${b.join(", ")}`)
  }
  fs.writeFileSync(path.join(OUT, "audit-bas.json"), JSON.stringify(rapport, null, 1))
  const pb = rapport.filter((r) => r.status >= 400 || !r.fin || (r.genants && r.genants.length))
  console.log(`\n${rapport.length} écrans vérifiés — ${pb.length} problème(s)`)
  process.exit(pb.length ? 1 : 0)
}
main().catch((e) => { console.error(e); process.exit(2) })
