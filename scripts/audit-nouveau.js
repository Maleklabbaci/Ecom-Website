#!/usr/bin/env node
"use strict"
/**
 * Audit « compte tout neuf » : on s'inscrit vraiment, on répond au premier
 * écran, puis on ouvre toutes les pages de l'espace marchand — sans un seul
 * produit, sans une seule commande. C'est là que sortent les pages vides,
 * les « undefined » et les divisions par zéro.
 *
 *   BASE=http://127.0.0.1:4600 node scripts/audit-nouveau.js
 *
 * Sortie : captures/nouveau/ + captures/nouveau/audit-nouveau.json
 */
const fs = require("node:fs")
const path = require("node:path")
const puppeteer = require("puppeteer-core")
const chromium = require("@sparticuz/chromium").default

const BASE = process.env.BASE || "http://127.0.0.1:4600"
const OUT = "captures/nouveau"
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

/* les pages ne sont pas écrites à la main : on prend les liens réels du menu,
   plus quelques pages qu'on atteint par un bouton, jamais par le menu. */
const EXTRA = ["/demarrer", "/dashboard/products/new", "/dashboard/pages/new",
  "/dashboard/landings/new", "/dashboard/design/source", "/dashboard/customers",
  "/dashboard/reviews", "/dashboard/historique", "/dashboard/visites"]
/* adresses qui renvoient des données (JSON, image, CSV), pas une page */
const DONNEES = /\/(media|app-icon[^/]*|manifest\.webmanifest|notices\/flux|design\/source)(\.|$)/

async function pages(cookie) {
  const r = await fetch(BASE + "/dashboard", { headers: { cookie } })
  const html = await r.text()
  const liens = new Set(EXTRA)
  for (const m of html.matchAll(/href="(\/dashboard[^"?#]*)\"/g)) {
    if (!DONNEES.test(m[1]) && !/\.(png|jpg|svg|csv|webmanifest)$/.test(m[1])) liens.add(m[1])
  }
  return [...liens].sort()
}

async function cookiesDepuis(reponse) {
  const raw = reponse.headers.getSetCookie ? reponse.headers.getSetCookie() : [reponse.headers.get("set-cookie") || ""]
  return raw.filter(Boolean).map((c) => c.split(";")[0].join ? c.split(";")[0] : c).join("; ")
}

async function inscription() {
  const email = `neuf-${Date.now()}@novadz.dz`
  const corps = new URLSearchParams({
    kind: "commerce", site: "", store: "Boutique Neuve Test", name: "Marchand Neuf",
    email, password: "test1234", password2: "test1234",
  })
  const r = await fetch(BASE + "/signup", { method: "POST", body: corps, redirect: "manual" })
  const cookie = await cookiesDepuis(r)
  if (r.status !== 302) throw new Error("inscription refusée : " + r.status)
  return { email, cookie }
}

function mesures() {
  const txt = (document.body.innerText || "").replace(/\s+/g, " ")
  const html = document.documentElement
  const main = document.querySelector(".dash-main")
  return {
    titre: (document.querySelector("h1") || {}).innerText || "",
    hauteur: Math.round((main ? main.scrollHeight : html.scrollHeight)),
    debordLargeur: html.scrollWidth - html.clientWidth,
    suspect: ["undefined", "NaN", "Infinity", "[object Object]", "null null"]
      .filter((m) => new RegExp(m.replace(/[[\]]/g, "\\$&")).test(txt)),
    imagesCassees: [...document.images]
      .filter((i) => i.complete && i.naturalWidth === 0 && i.src && !i.src.startsWith("data:"))
      .map((i) => i.getAttribute("src").slice(0, 60)),
    texteLongueur: txt.length,
  }
}

async function main() {
  fs.mkdirSync(OUT, { recursive: true })
  const { email, cookie } = await inscription()
  console.log("compte créé :", email)

  /* on répond au premier écran comme un vrai débutant */
  const demarrer = await fetch(BASE + "/demarrer", {
    method: "POST", redirect: "manual", headers: { cookie },
    body: new URLSearchParams({ kind: "commerce", metier: "mode", phone: "0551234567", wilaya: "Blida" }),
  })
  console.log("premier écran rempli :", demarrer.status, demarrer.headers.get("location") || "")

  const browser = await puppeteer.launch({ args: chromium.args, executablePath: await chromium.executablePath(), headless: true })
  const hote = new URL(BASE).hostname
  const rapport = []

  const liste = await pages(cookie)
  console.log(liste.length + " pages à ouvrir")
  for (const [larg, haut, tag] of [[1440, 900, "ordi"], [390, 844, "tel"]]) {
    for (const url of liste) {
      const page = await browser.newPage()
      await page.setViewport({ width: larg, height: haut, isMobile: tag === "tel", hasTouch: tag === "tel" })
      for (const m of cookie.split("; ")) {
        const i = m.indexOf("=")
        if (i > 0) await page.setCookie({ name: m.slice(0, i), value: m.slice(i + 1), domain: hote, path: "/" })
      }
      const erreurs = []
      const rates = []
      page.on("pageerror", (e) => erreurs.push(String(e).slice(0, 140)))
      page.on("requestfailed", (r) => rates.push(r.url().slice(-60)))
      let statut = 0
      try {
        const rep = await page.goto(BASE + url, { waitUntil: "networkidle2", timeout: 45000 })
        statut = rep ? rep.status() : 0
      } catch (e) { erreurs.push("navigation : " + e.message.slice(0, 60)) }
      await sleep(600)
      const m = await page.evaluate(mesures)
      const nom = `${tag}-${url.replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "") || "accueil"}`
      await page.screenshot({ path: path.join(OUT, nom + ".png") })
      await page.close()

      const pb = []
      if (statut !== 200) pb.push("HTTP " + statut)
      if (erreurs.length) pb.push("erreur JS : " + erreurs[0])
      if (rates.length) pb.push("requête en échec : " + rates[0])
      if (m.debordLargeur > 2) pb.push(`débordement horizontal +${m.debordLargeur}px`)
      if (m.suspect.length) pb.push("texte suspect : " + m.suspect.join(", "))
      if (m.imagesCassees.length) pb.push("image cassée : " + m.imagesCassees[0])
      if (m.texteLongueur < 80) pb.push("page presque vide (" + m.texteLongueur + " car.)")
      rapport.push({ tag, url, statut, titre: m.titre, hauteur: m.hauteur, pb })
      console.log(`${pb.length ? "⚠" : "✓"} ${tag} ${url.padEnd(30)} ${pb.join(" | ") || "propre"}`)
    }
  }

  fs.writeFileSync(path.join(OUT, "audit-nouveau.json"), JSON.stringify(rapport, null, 1))
  const total = rapport.filter((r) => r.pb.length).length
  console.log(`\n${rapport.length} écrans, ${total} avec un défaut.`)
  await browser.close()
  process.exit(total ? 1 : 0)
}
main().catch((e) => { console.error(e); process.exit(2) })
