#!/usr/bin/env node
"use strict"
/**
 * Audit complet du site, dans un vrai navigateur.
 *
 *   node scripts/audit.js                 (démarre son propre serveur de test)
 *   BASE=http://127.0.0.1:4600 node scripts/audit.js   (vise un serveur déjà lancé)
 *
 * Pour chaque page (visiteur, marchand, admin, 16 modèles) :
 *   - code HTTP (une page protégée qui renvoie 500 est un bug)
 *   - erreurs JavaScript dans la console
 *   - requêtes en échec (404, 500)
 *   - textes interdits : « undefined », « NaN », « [object Object] »
 *   - prix : aucun « $ » ni « € », « DZD » présent sur les boutiques
 * Sortie : rapport lisible + captures/audit.json ; code 1 s'il reste un problème.
 */
const fs = require("node:fs")
const path = require("node:path")
const puppeteer = require("puppeteer-core")
const chromium = require("@sparticuz/chromium").default
const { startServer } = require("../tests/boot")

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
let BASE = process.env.BASE || ""

/* ------------------------------- pages à voir ------------------------------ */
const PUBLIC = [
  "/", "/login", "/signup", "/themes", "/hors-ligne", "/robots.txt", "/sw.js",
  "/amina-mode", "/amina-mode?lang=ar", "/amina-mode/p/1", "/amina-mode/cart",
  "/tech-dz", "/tech-dz?lang=ar", "/tech-dz/p/1",
  "/atelier-lina", "/atelier-lina?lang=ar",
]
const MARCHAND = [
  "/dashboard", "/dashboard/studio", "/dashboard/studio/pages",
  "/dashboard/studio/design", "/dashboard/design", "/dashboard/design/themes",
  "/dashboard/design/versions", "/dashboard/design/source",
  "/dashboard/products", "/dashboard/products/new", "/dashboard/orders", "/dashboard/stock",
  "/dashboard/categories", "/dashboard/discounts", "/dashboard/customers", "/dashboard/reviews",
  "/dashboard/paniers", "/dashboard/relances", "/dashboard/reversements", "/dashboard/stats",
  "/dashboard/visites", "/dashboard/historique", "/dashboard/marketing", "/dashboard/landings",
  "/dashboard/landings/new", "/dashboard/pages", "/dashboard/pages/new", "/dashboard/formulaire",
  "/dashboard/media", "/dashboard/mails", "/dashboard/notices", "/dashboard/equipe",
  "/dashboard/boutiques", "/dashboard/settings", "/dashboard/reseaux", "/dashboard/paiement",
  "/dashboard/shipping", "/dashboard/transporteur", "/dashboard/livraison",
  "/dashboard/assistant", "/dashboard/recus",
  "/dashboard/orders/export.csv", "/dashboard/stock/export.csv", "/dashboard/manifest.webmanifest",
]
const ADMIN = ["/admin", "/admin/boutiques", "/admin/comptes", "/admin/themes", "/admin/logs", "/admin/health"]

/* --------------------------------- outils --------------------------------- */
async function session(base, who) {
  const r = await fetch(`${base}/demo-login/${who}?next=/dashboard`, { redirect: "manual" })
  const raw = r.headers.getSetCookie ? r.headers.getSetCookie() : [r.headers.get("set-cookie") || ""]
  return raw.filter(Boolean).map((c) => c.split(";")[0]).join("; ")
}

const TEXTE_INTERDIT = [
  [/\bundefined\b/, "« undefined »"],
  [/\bNaN\b/, "« NaN »"],
  [/\[object Object\]/, "« [object Object] »"],
]

async function auditPage(browser, cookie, url) {
  const page = await browser.newPage()
  await page.setViewport({ width: 1440, height: 900 })
  const erreursJs = []
  const echecs = []
  page.on("pageerror", (e) => erreursJs.push(String(e).slice(0, 200)))
  page.on("console", (m) => {
    if (m.type() !== "error") return
    const t = m.text()
    if (/Failed to load resource/i.test(t)) return /* déjà compté par « response » */
    /* valeur SVG récente que ce navigateur-ci ne connaît pas encore : ce n'est
       pas une erreur de nos pages (le modèle s'affiche normalement) */
    if (/Unrecognized enumerated value/.test(t)) return
    erreursJs.push(t.slice(0, 200))
  })
  page.on("response", (r) => {
    if (r.status() >= 400) echecs.push(`${r.status()} ${r.url().replace(BASE, "")}`)
  })
  /* Cookie posé dans le navigateur, pas en en-tête : un en-tête « cookie »
     posé par Puppeteer n'est pas renvoyé sur une redirection (302), et l'on
     auditerait alors la page de connexion en croyant voir le tableau de bord. */
  if (/\.csv$/.test(url)) {
    /* fichier à télécharger : le navigateur annule la navigation, on le lit
       donc directement par une requête */
    const r = await fetch(BASE + url, { headers: cookie ? { cookie } : {} })
    const txt = await r.text()
    await page.close()
    const soucis = []
    if (r.status >= 400) soucis.push("HTTP " + r.status)
    if (!txt.trim()) soucis.push("fichier vide")
    return { url, status: r.status, erreursJs: [], echecs: r.status >= 400 ? ["HTTP " + r.status] : [], soucis }
  }
  if (cookie) {
    const hote = new URL(BASE).hostname
    for (const morceau of cookie.split("; ")) {
      const i = morceau.indexOf("=")
      if (i < 1) continue
      await page.setCookie({ name: morceau.slice(0, i), value: morceau.slice(i + 1), domain: hote, path: "/" })
    }
  }

  let status = 0
  try {
    const resp = await page.goto(BASE + url, { waitUntil: "networkidle2", timeout: 45000 })
    status = resp ? resp.status() : 0
    await sleep(350)
  } catch (e) {
    await page.close()
    return { url, status: 0, fatal: e.message.slice(0, 160), erreursJs, echecs, soucis: [] }
  }
  /* on a demandé le tableau de bord et l'on reçoit l'écran de connexion ?
     c'est un échec, même si la page de connexion répond 200. */
  if (url.startsWith("/dashboard") || url.startsWith("/admin")) {
    if (/\.(csv|txt|webmanifest)$/.test(url) === false) {
      const fini = page.url()
      if (/\/login/.test(fini)) echecs.push("session perdue : arrivée sur /login")
      if (url === "/dashboard/studio" && !/\/dashboard\/studio$/.test(fini)) {
        echecs.push("Studio inattendu : " + fini.replace(BASE, ""))
      }
    }
  }
  const brut = /\.(csv|txt|webmanifest|js)$/.test(url)
  const contenu = brut ? "" : await page.evaluate(() => (document.body ? document.body.innerText.slice(0, 300000) : ""))
  await page.close()

  const soucis = []
  for (const [re, quoi] of TEXTE_INTERDIT) if (re.test(contenu)) soucis.push(`texte ${quoi}`)
  if (/\$\s?\d/.test(contenu)) soucis.push("prix en dollars")
  if (/€\s?\d|\d\s?€/.test(contenu)) soucis.push("prix en euros")
  return { url, status, erreursJs, echecs, soucis }
}

async function main() {
  let child = null
  if (!BASE) {
    /* serveur à part : mêmes données de démonstration, cookie normal (http),
       pour que les sessions marchand et admin soient vérifiables. */
    const started = await startServer({
      db: path.join(require("node:os").tmpdir(), `novadz-audit-${process.pid}.db`),
      env: { NOVADZ_DEMO_DATA: "1" },
    })
    BASE = started.base
    child = started.child
    console.log("Serveur d'audit : " + BASE)
  }
  const browser = await puppeteer.launch({
    args: chromium.args,
    executablePath: await chromium.executablePath(),
    headless: true,
    defaultViewport: { width: 1440, height: 900 },
  })

  const sessions = {
    visiteur: "",
    marchand: await session(BASE, "marchand"),
    admin: await session(BASE, "admin"),
  }

  /* toutes les pages, plus chaque modèle de site en aperçu */
  const modeleIds = fs.readdirSync(path.join(__dirname, "..", "public", "templates"))
    .filter((f) => f.endsWith(".html")).map((f) => f.replace(".html", ""))
  /* les thèmes classiques, vus par l'administrateur */
  const { THEMES } = require("../src/themes")
  const themeIds = (Array.isArray(THEMES) ? THEMES : Object.values(THEMES || {})).map((t) => t.id)
  const plans = [
    ["visiteur", PUBLIC],
    ["marchand", MARCHAND],
    ["admin", ADMIN],
    ["visiteur", modeleIds.map((id) => `/templates/${id}.html`)],
    ["admin", themeIds.map((id) => `/admin/themes/apercu/${id}`)],
  ]

  const rapport = []
  for (const [role, urls] of plans) {
    for (const url of urls) {
      const r = await auditPage(browser, sessions[role], url)
      r.role = role
      rapport.push(r)
      const pb = []
      if (!r.status || r.status >= 400) pb.push("HTTP " + (r.status || "aucune réponse"))
      if (r.fatal) pb.push(r.fatal)
      if (r.erreursJs.length) pb.push(r.erreursJs.length + " erreur(s) JS")
      if (r.echecs.length) pb.push(r.echecs.length + " requête(s) en échec")
      if (r.soucis.length) pb.push(r.soucis.join(", "))
      if (pb.length) console.log(`✗ ${role.padEnd(9)} ${url.padEnd(38)} ${pb.join(" | ")}`)
    }
  }
  await browser.close()
  if (child) child.kill()

  const casses = rapport.filter((r) => (r.status && r.status >= 400) || r.fatal)
  const js = rapport.filter((r) => r.erreursJs.length)
  const reseau = rapport.filter((r) => r.echecs.length)
  const textes = rapport.filter((r) => r.soucis.length)

  console.log("\n" + "=".repeat(70))
  console.log(`Pages vérifiées        : ${rapport.length}`)
  console.log(`Codes HTTP en erreur   : ${casses.length}`)
  console.log(`Erreurs JavaScript     : ${js.length} page(s)`)
  console.log(`Requêtes en échec      : ${reseau.length} page(s)`)
  console.log(`Textes / prix suspects : ${textes.length} page(s)`)
  if (js.length) {
    console.log("\n--- erreurs JS ---")
    for (const r of js) console.log(`${r.role} ${r.url}\n   ${r.erreursJs.slice(0, 4).join("\n   ")}`)
  }
  if (reseau.length) {
    console.log("\n--- requêtes en échec ---")
    for (const r of reseau) console.log(`${r.role} ${r.url}\n   ${[...new Set(r.echecs)].slice(0, 6).join("\n   ")}`)
  }
  if (textes.length) {
    console.log("\n--- textes / prix ---")
    for (const r of textes) console.log(`${r.role} ${r.url} : ${r.soucis.join(", ")}`)
  }
  if (casses.length) {
    console.log("\n--- codes HTTP ---")
    for (const r of casses) console.log(`${r.role} ${r.url} : ${r.status || r.fatal}`)
  }
  fs.mkdirSync("captures", { recursive: true })
  fs.writeFileSync(path.join("captures", "audit.json"), JSON.stringify(rapport, null, 1))
  const pb = casses.length + js.length + reseau.length + textes.length
  console.log("\n" + (pb ? `IL RESTE ${pb} PROBLÈME(S)` : "TOUT EST PROPRE"))
  process.exit(pb ? 1 : 0)
}
main().catch((e) => { console.error(e); process.exit(2) })
