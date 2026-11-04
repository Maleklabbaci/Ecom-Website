#!/usr/bin/env node
"use strict"
/**
 * Audit « défilement » de tout l'espace marchand et admin, dans un vrai navigateur.
 *
 *   BASE=http://127.0.0.1:4600 node scripts/audit-scroll.js [dossier-captures]
 *
 * Pour chaque page, après connexion :
 *   - code HTTP, erreurs JavaScript, requêtes en échec
 *   - débordement horizontal (une page qui glisse de gauche à droite = bug)
 *   - éléments plus larges que l'écran (on note lequel)
 *   - images cassées
 *   - le défilement descend-il jusqu'en bas ? (page coupée = bug)
 *   - textes « undefined », « NaN », « [object Object] »
 *   - capture pleine page
 * Sortie : rapport lisible, captures/, audit-scroll.json ; code 1 s'il reste un problème.
 */
const fs = require("node:fs")
const path = require("node:path")
const puppeteer = require("puppeteer-core")
const chromium = require("@sparticuz/chromium").default

const BASE = process.env.BASE || "http://127.0.0.1:4600"
const OUT = process.argv[2] || "captures/scroll"
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

const MARCHAND = [
  "/dashboard", "/dashboard/studio", "/dashboard/studio/pages", "/dashboard/design",
  "/dashboard/design/themes", "/dashboard/design/versions", "/dashboard/design/source",
  "/dashboard/products", "/dashboard/products/new", "/dashboard/orders", "/dashboard/stock",
  "/dashboard/categories", "/dashboard/discounts", "/dashboard/customers", "/dashboard/reviews",
  "/dashboard/paniers", "/dashboard/relances", "/dashboard/reversements", "/dashboard/stats",
  "/dashboard/visites", "/dashboard/historique", "/dashboard/marketing", "/dashboard/landings",
  "/dashboard/landings/new", "/dashboard/pages", "/dashboard/pages/new", "/dashboard/formulaire",
  "/dashboard/media", "/dashboard/mails", "/dashboard/notices", "/dashboard/equipe",
  "/dashboard/boutiques", "/dashboard/settings", "/dashboard/reseaux", "/dashboard/paiement",
  "/dashboard/shipping", "/dashboard/transporteur", "/dashboard/livraison", "/dashboard/assistant",
  "/dashboard/recus",
]
const ADMIN = ["/admin", "/admin/boutiques", "/admin/comptes", "/admin/themes", "/admin/logs", "/admin/health"]
const BOUTIQUE = ["/amina-mode", "/amina-mode/p/1", "/amina-mode/cart", "/amina-mode/checkout", "/tech-dz", "/atelier-lina"]
const PUBLIC = ["/", "/themes", "/login", "/signup"]

async function session(who) {
  const r = await fetch(`${BASE}/demo-login/${who}?next=/dashboard`, { redirect: "manual" })
  const raw = r.headers.getSetCookie ? r.headers.getSetCookie() : [r.headers.get("set-cookie") || ""]
  return raw.filter(Boolean).map((c) => c.split(";")[0]).join("; ")
}

async function checkPage(browser, cookie, url, larg, haut) {
  const page = await browser.newPage()
  await page.setViewport({ width: larg, height: haut })
  const erreurs = []
  const echecs = []
  page.on("pageerror", (e) => erreurs.push(String(e).slice(0, 180)))
  page.on("console", (m) => {
    if (m.type() !== "error") return
    const t = m.text()
    if (/Failed to load resource/i.test(t)) return
    if (/Unrecognized enumerated value/.test(t)) return
    erreurs.push(t.slice(0, 180))
  })
  page.on("response", (r) => { if (r.status() >= 400) echecs.push(`${r.status()} ${r.url().replace(BASE, "")}`) })
  if (cookie) {
    const hote = new URL(BASE).hostname
    for (const m of cookie.split("; ")) {
      const i = m.indexOf("=")
      if (i > 0) await page.setCookie({ name: m.slice(0, i), value: m.slice(i + 1), domain: hote, path: "/" })
    }
  }

  let status = 0
  try {
    const r = await page.goto(BASE + url, { waitUntil: "networkidle2", timeout: 45000 })
    status = r ? r.status() : 0
    await sleep(500)
  } catch (e) {
    await page.close()
    return { url, status: 0, fatal: e.message.slice(0, 150), erreurs, echecs, soucis: [] }
  }

  let mesure = await page.evaluate(() => {
    const d = document.documentElement
    const largeurEcran = d.clientWidth
    /* les éléments qui dépassent la largeur de l'écran */
    const debordes = []
    for (const el of document.querySelectorAll("body *")) {
      const r = el.getBoundingClientRect()
      if (r.width === 0 || r.height === 0) continue
      if (r.right > largeurEcran + 2 || r.left < -2) {
        const cs = getComputedStyle(el)
        if (cs.position === "fixed" || cs.visibility === "hidden" || cs.opacity === "0") continue
        if (el.closest("[aria-hidden='true'], .sr-only, .screen-reader-text, .ndz-search-in")) continue
        debordes.push({
          tag: el.tagName.toLowerCase(),
          cls: String(el.className || "").slice(0, 44),
          droite: Math.round(r.right), gauche: Math.round(r.left),
        })
      }
      if (debordes.length > 6) break
    }
    /* les images cassées */
    const imagesCassees = [...document.images]
      .filter((i) => i.complete && i.naturalWidth === 0 && i.getAttribute("src"))
      .map((i) => i.getAttribute("src").slice(0, 80)).slice(0, 5)
    return {
      largeurEcran,
      scrollWidth: d.scrollWidth,
      hauteurPage: Math.max(document.body.scrollHeight, d.scrollHeight),
      hauteurEcran: d.clientHeight,
      debordes,
      imagesCassees,
      texte: (document.body.innerText || "").slice(0, 120000),
    }
  })

  if (!mesure) mesure = { largeurEcran: larg, scrollWidth: larg, hauteurPage: 0, debordes: [], imagesCassees: [], texte: "" }
  /* le défilement : on descend jusqu'en bas, et on vérifie qu'on y arrive */
  let defile = await page.evaluate(async () => {
    const avant = window.scrollY
    window.scrollTo(0, document.documentElement.scrollHeight)
    await new Promise((r) => setTimeout(r, 250))
    const apres = window.scrollY
    const max = document.documentElement.scrollHeight - document.documentElement.clientHeight
    window.scrollTo(0, 0)
    await new Promise((r) => setTimeout(r, 150))
    return { avant, apres, max: Math.max(0, max) }
  })

  if (!defile) defile = { avant: 0, apres: 0, max: 0 }
  if (OUT) {
    await page.evaluate(() => window.scrollTo(0, 0))
    await page.screenshot({ path: path.join(OUT, url.replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "") + ".png"), fullPage: true })
  }
  await page.close()

  /* un tableau vide revient parfois « undefined » après passage dans le
     navigateur : on ne suppose rien sur la forme de ce qui revient. */
  const debordes = Array.isArray(mesure.debardes) ? mesure.debardes : []
  const imagesCassees = Array.isArray(mesure.imagesCassees) ? mesure.imagesCassees : []
  const texte = typeof mesure.texte === "string" ? mesure.texte : ""
  const soucis = []
  const tropLarge = (mesure.scrollWidth || 0) - (mesure.largeurEcran || 0)
  if (tropLarge > 2) soucis.push(`débordement horizontal de ${tropLarge} px`)
  if (debordes.length) soucis.push("élément hors écran : " + debordes.map((d) => `${d.tag}.${d.cls}`).slice(0, 3).join(", "))
  if (imagesCassees.length) soucis.push("image cassée : " + imagesCassees.join(", "))
  if (defile.max > 10 && defile.apres < 5) soucis.push("le défilement ne descend pas")
  if (/\bundefined\b/.test(texte)) soucis.push("« undefined »")
  if (/\bNaN\b/.test(texte)) soucis.push("« NaN »")
  if (/\[object Object\]/.test(texte)) soucis.push("« [object Object] »")
  /* une adresse qui renvoie du JSON ou un fichier n'est pas une page :
     on ne lui demande pas d'avoir du texte. */
  const estDonnee = /\.(json|csv|txt|webmanifest|js|xml)$/.test(url)
    || /^\s*[[{]/.test(texte.trim())
  if (!estDonnee && texte.trim().length < 40) soucis.push("page presque vide")
  return { url, status, erreurs, echecs, soucis, hauteur: mesure.hauteurPage, scroll: defile, debordes }
}

async function main() {
  if (OUT) fs.mkdirSync(OUT, { recursive: true })
  const browser = await puppeteer.launch({
    args: chromium.args, executablePath: await chromium.executablePath(), headless: true,
    defaultViewport: { width: 1440, height: 900 },
  })
  const sessions = { marchand: await session("marchand"), admin: await session("admin"), visiteur: "" }
  const plans = [
    ["marchand", MARCHAND, 1440, 900],
    ["marchand", MARCHAND, 390, 844], /* téléphone */
    ["admin", ADMIN, 1440, 900],
    ["visiteur", BOUTIQUE, 1440, 900],
    ["visiteur", BOUTIQUE, 390, 844],
    ["visiteur", PUBLIC, 1440, 900],
  ]
  const rapport = []
  for (const [role, urls, larg, haut] of plans) {
    for (const url of urls) {
      const r = await checkPage(browser, sessions[role], url, larg, haut)
      r.role = role; r.taille = `${larg}x${haut}`
      rapport.push(r)
      const pb = []
      if (!r.status || r.status >= 400) pb.push("HTTP " + (r.status || "aucune réponse"))
      if (r.fatal) pb.push(r.fatal)
      if (r.erreurs.length) pb.push(r.erreurs.length + " erreur(s) JS")
      if (r.echecs.length) pb.push(r.echecs.length + " requête(s) en échec")
      if (r.soucis.length) pb.push(r.soucis.join(" | "))
      if (pb.length) console.log(`✗ ${role.padEnd(9)} ${String(larg).padEnd(4)} ${url.padEnd(32)} ${pb.join("  ")}`)
    }
  }
  await browser.close()

  const parType = (f) => rapport.filter(f)
  const http = parType((r) => !r.status || r.status >= 400 || r.fatal)
  const js = parType((r) => r.erreurs.length)
  const reseau = parType((r) => r.echecs.length)
  const scroll = parType((r) => r.soucis.some((s) => /débordement|hors écran|défilement/.test(s)))
  const contenu = parType((r) => r.soucis.some((s) => /undefined|NaN|object Object|vide|image cassée/.test(s)))

  console.log("\n" + "=".repeat(74))
  console.log(`Pages vérifiées           : ${rapport.length}`)
  console.log(`HTTP en erreur            : ${http.length}`)
  console.log(`Erreurs JavaScript        : ${js.length}`)
  console.log(`Requêtes en échec         : ${reseau.length}`)
  console.log(`Défilement / largeur      : ${scroll.length}`)
  console.log(`Contenu suspect           : ${contenu.length}`)
  for (const [titre, liste] of [["JS", js], ["réseau", reseau], ["défilement", scroll], ["contenu", contenu]]) {
    if (!liste.length) continue
    console.log(`\n--- ${titre} ---`)
    for (const r of liste) console.log(`${r.role} ${r.taille} ${r.url}\n   ${(r.soucis.length ? r.soucis : r.erreurs.length ? r.erreurs : r.echecs).slice(0, 4).join("\n   ")}`)
  }
  fs.writeFileSync(path.join(OUT || ".", "audit-scroll.json"), JSON.stringify(rapport, null, 1))
  const total = http.length + js.length + reseau.length + scroll.length + contenu.length
  console.log("\n" + (total ? `IL RESTE ${total} PROBLÈME(S)` : "TOUT EST PROPRE"))
  process.exit(total ? 1 : 0)
}
main().catch((e) => { console.error(e); process.exit(2) })
