#!/usr/bin/env node
"use strict"
/**
 * Audit « au doigt » : sur téléphone, on vérifie ce qui gêne vraiment l'usage.
 *
 *   BASE=http://127.0.0.1:4600 node scripts/audit-tap.js
 *
 * 1. zones cliquables trop petites (< 32 px) : impossible à viser au doigt ;
 * 2. contenu caché sous une barre fixe (bas de page inatteignable) ;
 * 3. texte coupé net (débordement) dans un bouton ou un titre ;
 * 4. images cassées.
 * Sortie : rapport lisible + captures/doigt/audit-tap.json
 */
const fs = require("node:fs")
const path = require("node:path")
const puppeteer = require("puppeteer-core")
const chromium = require("@sparticuz/chromium").default

const BASE = process.env.BASE || "http://127.0.0.1:4600"
const OUT = "captures/doigt"
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

const PAGES = [
  ["/dashboard", "marchand"], ["/dashboard/orders", "marchand"], ["/dashboard/products", "marchand"],
  ["/dashboard/stock", "marchand"], ["/dashboard/studio", "marchand"], ["/dashboard/design", "marchand"],
  ["/dashboard/settings", "marchand"], ["/dashboard/boutiques", "marchand"], ["/dashboard/boutiques/new", "marchand"],
  ["/dashboard/assistant", "marchand"], ["/dashboard/stats", "marchand"], ["/dashboard/categories", "marchand"],
  ["/dashboard/promos", "marchand"], ["/dashboard/abandons", "marchand"], ["/dashboard/relances", "marchand"],
  ["/dashboard/payouts", "marchand"], ["/dashboard/delivery", "marchand"], ["/dashboard/notices", "marchand"],
  ["/dashboard/design/themes", "marchand"], ["/dashboard/design/versions", "marchand"],
  ["/amina-mode", "visiteur"], ["/amina-mode/p/1", "visiteur"], ["/amina-mode/cart", "visiteur"],
  ["/amina-mode/checkout", "visiteur"], ["/", "visiteur"], ["/themes", "visiteur"],
  ["/login", "visiteur"], ["/signup", "visiteur"],
]

async function session(who) {
  const r = await fetch(`${BASE}/demo-login/${who}?next=/dashboard`, { redirect: "manual" })
  const raw = r.headers.getSetCookie ? r.headers.getSetCookie() : [r.headers.get("set-cookie") || ""]
  return raw.filter(Boolean).map((c) => c.split(";")[0]).join("; ")
}

/* le code exécuté dans la page */
function mesures() {
  const petit = []
  const coupe = []
  const casses = []
  const cadreDefile = (() => {
    const m = document.querySelector(".dash-main")
    if (m && m.scrollHeight > m.clientHeight + 20) return "main"
    if (document.documentElement.scrollHeight > window.innerHeight + 20) return "window"
    return "aucun"
  })()
  const zoneVue = document.querySelector(".dash-main") && cadreDefile === "main"
    ? document.querySelector(".dash-main").getBoundingClientRect()
    : { top: 0, bottom: window.innerHeight, left: 0, right: window.innerWidth }

  const visible = (el) => {
    const cs = getComputedStyle(el)
    if (cs.display === "none" || cs.visibility === "hidden" || Number(cs.opacity) < 0.05) return false
    const r = el.getBoundingClientRect()
    return r.width > 0 && r.height > 0 && r.bottom > -50 && r.top < window.innerHeight + 5000
  }
  /* 1. zones cliquables trop petites */
  for (const el of document.querySelectorAll("a, button, [role=button], input[type=checkbox], select")) {
    if (!visible(el)) continue
    if (el.closest(".dash-side, .app-tab, .dash-bottom")) continue
    const r = el.getBoundingClientRect()
    if (r.width < 32 || r.height < 32) {
      /* on ignore les liens dans un paragraphe et les cases natives */
      const dansTexte = el.closest("p, .note, .hint, td, .foot")
      if (!dansTexte) petit.push({
        t: (el.textContent || el.getAttribute("aria-label") || el.tagName).trim().replace(/\s+/g, " ").slice(0, 34),
        l: Math.round(r.width), h: Math.round(r.height), y: Math.round(r.y),
      })
    }
  }
  /* 3. texte coupé : le contenu dépasse la boîte */
  for (const el of document.querySelectorAll(".btn, .btn-sm, h1, h2, h3, .kpi b, .tag, .pill, .budget")) {
    if (!visible(el)) continue
    if (el.scrollWidth > el.clientWidth + 3 && getComputedStyle(el).overflow !== "visible" && el.clientWidth > 0) {
      coupe.push({ t: el.textContent.trim().replace(/\s+/g, " ").slice(0, 34), deborde: el.scrollWidth - el.clientWidth })
    }
  }
  /* 4. images cassées */
  for (const img of document.querySelectorAll("img")) {
    if (!visible(img)) continue
    if (img.complete && img.naturalWidth === 0 && img.src && !img.src.startsWith("data:")) casses.push(img.getAttribute("src").slice(0, 70))
  }
  return { petit, coupe, casses, cadreDefile, zoneVue: { top: Math.round(zoneVue.top), bottom: Math.round(zoneVue.bottom) } }
}

/* 2. contenu caché sous une barre fixe, une fois tout en bas */
function basCache() {
  const cadre = (() => {
    const m = document.querySelector(".dash-main")
    return m && m.scrollHeight > m.clientHeight + 20 ? m : null
  })()
  const barres = [...document.querySelectorAll(".app-tab, .sticky-buy, .buybar, .barre-achat, footer, .foot, .dash-bottom")]
    .filter((el) => {
      const cs = getComputedStyle(el)
      const r = el.getBoundingClientRect()
      return (cs.position === "fixed" || cs.position === "sticky") && r.height > 30 && r.width > 200 && r.bottom > 0 && r.top < window.innerHeight
    })
  if (!barres.length) return null
  /* on regarde le dernier contenu réel du cadre */
  const cible = cadre || document.body
  let dernier = null
  const tous = cible.querySelectorAll("button, a, input, .btn, p, footer")
  for (const el of tous) {
    if (el.closest(".dash-side, .app-tab, .dash-bottom")) continue   /* menus hors écran */
    const r = el.getBoundingClientRect()
    /* on ne garde que ce qui est réellement dans la colonne visible */
    if (r.left < 0 || r.right > window.innerWidth + 1) continue
    if (r.height > 6 && r.width > 6 && (!dernier || r.bottom > dernier.bas)) dernier = { el, bas: r.bottom, t: (el.textContent || el.tagName).trim().slice(0, 26) }
  }
  if (!dernier) return null
  const barre = barres[0].getBoundingClientRect()
  const cache = dernier.bas > barre.top + 1
  return { barre: Math.round(barre.top), dernierBas: Math.round(dernier.bas), texte: dernier.t, cache }
}

async function main() {
  fs.mkdirSync(OUT, { recursive: true })
  const browser = await puppeteer.launch({
    args: chromium.args, executablePath: await chromium.executablePath(), headless: true,
  })
  const cookies = { marchand: await session("marchand"), visiteur: "" }
  const rapport = []
  const taille = "390x844"

  for (const [url, role] of PAGES) {
    const page = await browser.newPage()
    await page.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true, deviceScaleFactor: 2 })
    if (cookies[role]) {
      for (const m of cookies[role].split("; ")) {
        const i = m.indexOf("=")
        if (i > 0) await page.setCookie({ name: m.slice(0, i), value: m.slice(i + 1), domain: new URL(BASE).hostname, path: "/" })
      }
    }
    const erreurs = []
    page.on("pageerror", (e) => erreurs.push(String(e).slice(0, 120)))
    await page.goto(BASE + url, { waitUntil: "networkidle2", timeout: 45000 })
    await sleep(700)
    const m = await page.evaluate(mesures)
    /* tout en bas */
    await page.evaluate(() => {
      const c = document.querySelector(".dash-main")
      if (c && c.scrollHeight > c.clientHeight + 20) c.scrollTop = c.scrollHeight
      else window.scrollTo(0, document.documentElement.scrollHeight)
    })
    await sleep(700)
    const bas = await page.evaluate(basCache)
    await page.screenshot({ path: path.join(OUT, `${url.replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "") || "accueil"}.png`) })
    await page.close()

    const bloquant = []
    const confort = []
    if (m.coupe.length) bloquant.push("texte coupé : " + m.coupe.slice(0, 3).map((z) => `${z.t} +${z.deborde}px`).join(", "))
    if (m.casses.length) bloquant.push("image cassée : " + m.casses.slice(0, 3).join(", "))
    if (bas && bas.cache) bloquant.push(`contenu caché sous la barre fixe (${bas.texte} à ${bas.dernierBas} > ${bas.barre})`)
    if (erreurs.length) bloquant.push("erreur JS : " + erreurs[0])
    if (m.petit.length) confort.push(`${m.petit.length} zone(s) < 32 px : ` + m.petit.slice(0, 3).map((z) => `${z.t} (${z.l}×${z.h})`).join(", "))
    rapport.push({ url, taille, cadre: m.cadreDefile, bloquant, confort })
    console.log(`${bloquant.length ? "⚠" : confort.length ? "·" : "✓"} ${url.padEnd(30)} ${[...bloquant, ...confort].join(" | ") || "propre"}`)
  }

  fs.writeFileSync(path.join(OUT, "audit-tap.json"), JSON.stringify(rapport, null, 1))
  const total = rapport.filter((r) => r.bloquant.length).length
  const conf = rapport.filter((r) => r.confort.length).length
  console.log(`\n${rapport.length} pages testées : ${total} avec un défaut bloquant, ${conf} avec une petite zone à agrandir.`)
  await browser.close()
  process.exit(total ? 1 : 0)
}
main().catch((e) => { console.error(e); process.exit(2) })
