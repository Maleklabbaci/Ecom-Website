#!/usr/bin/env node
"use strict"
/**
 * Test de bout en bout du Studio : découpage en sections + édition par calques.
 *
 *   node scripts/tester-studio.js                (les 16 modèles)
 *   node scripts/tester-studio.js site5 site11   (seulement ceux-là)
 *
 * Pour chaque modèle, le test ouvre le Studio dans un vrai navigateur et vérifie :
 *   1. la page est découpée (au moins 5 sections)
 *   2. aucune section vide (chaque section a au moins un calque)
 *   3. les calques sont de vrais calques (textes, photos, liens)
 *   4. éditer un texte dans le panneau change la page
 *   5. après « Enregistrer » et un rechargement, la modification est toujours là
 *   6. aucune erreur JavaScript dans la console
 *
 * Il démarre son propre serveur sur un port libre, avec une base temporaire.
 * Prérequis : `npm i -D puppeteer-core` et un Chrome/Chromium installé
 * (voir CHROME_PATH plus bas si besoin).
 */
const path = require("node:path")
const os = require("node:os")
const fs = require("node:fs")
const { startServer } = require("../tests/boot")
const SITES = require("../src/site-templates")

/* ---------- navigateur ---------- */
function chargerPuppeteer() {
  try {
    return require("puppeteer-core")
  } catch (_) {
    console.error("Il manque puppeteer-core : lance  npm i -D puppeteer-core")
    process.exit(2)
  }
}
function trouverChrome() {
  const cands = [
    process.env.CHROME_PATH,
    process.env.PUPPETEER_EXECUTABLE_PATH,
    "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
    "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
    process.env.LOCALAPPDATA && path.join(process.env.LOCALAPPDATA, "Google\\Chrome\\Application\\chrome.exe"),
    "/usr/bin/google-chrome",
    "/usr/bin/chromium",
    "/usr/bin/chromium-browser",
    "/tmp/chromium",
  ].filter(Boolean)
  const found = cands.find((p) => { try { return fs.existsSync(p) } catch (_) { return false } })
  if (!found) {
    console.error("Aucun Chrome trouvé. Donne son chemin :  CHROME_PATH=... npm run test:studio")
    process.exit(2)
  }
  return found
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

/* ---------- session HTTP ---------- */
async function session(base, role) {
  const r = await fetch(base + "/demo-login/" + role + "?next=/dashboard", { redirect: "manual" })
  const cookie = (r.headers.get("set-cookie") || "").split(";")[0]
  return cookie
}
const postJson = (base, cookie, url, body) =>
  fetch(base + url, {
    method: "POST",
    headers: { "Content-Type": "application/json", cookie, Origin: base },
    body: JSON.stringify(body || {}),
  }).then((r) => r.json())

/* ---------- le test d'un modèle ---------- */
async function testerModele(browser, base, tpl) {
  const role = tpl.kind === "vitrine" ? "vitrine" : "marchand"
  const cookie = await session(base, role)
  const pose = await postJson(base, cookie, "/dashboard/design/save", { design: { siteTemplate: tpl.id } })
  if (!pose.ok) return { id: tpl.id, ok: false, detail: "modèle refusé par /dashboard/design/save" }

  const page = await browser.newPage()
  await page.setViewport({ width: 1440, height: 900 })
  const erreurs = []
  page.on("pageerror", (e) => erreurs.push(e.message.split("\n")[0].slice(0, 80)))
  /* le navigateur se plaint parfois d'attributs SVG du THÈME (feBlend
     « plus-lighter » selon la version de Chrome) : ce n'est pas notre code,
     et ça n'empêche rien de fonctionner — on ne compte que nos erreurs. */
  const duTheme = (t) => /<fe[A-Z]|Unrecognized enumerated value|attribute mode/i.test(t)
  page.on("console", (m) => {
    const t = m.text()
    if (m.type() === "error" && !duTheme(t)) erreurs.push(t.slice(0, 80))
  })

  try {
    await page.goto(`${base}/dashboard/studio?as=${role}`, { waitUntil: "networkidle2", timeout: 60000 })
    await page.waitForFunction(() => document.querySelectorAll(".card").length > 0, { timeout: 20000 })
    await sleep(400)

    /* 1 à 3 : le découpage et la nature des calques, mesurés dans la page */
    const mesure = await page.evaluate(() => {
      const F = document.querySelector("iframe").contentWindow.StudioFrame
      const secs = F.sections()
      const details = secs.map((s) => {
        const L = F.layers(s)
        return { t: L.texts.length, p: L.imgs.length, l: L.links.length, h: Math.round(s.getBoundingClientRect().height) }
      })
      return {
        sections: secs.length,
        vides: details.filter((d) => d.t + d.p + d.l === 0).length,
        textes: details.reduce((a, d) => a + d.t, 0),
        photos: details.reduce((a, d) => a + d.p, 0),
        liens: details.reduce((a, d) => a + d.l, 0),
        hauteurMax: Math.max(...details.map((d) => d.h)),
        ecran: innerHeight,
      }
    })

    /* 4 : éditer un texte dans le panneau */
    await page.evaluate(() => {
      const b = [...document.querySelectorAll("button")].find((x) => x.title === "Tout replier")
      if (b) b.click()
    })
    await sleep(200)
    await page.evaluate(() => {
      const cars = [...document.querySelectorAll(".card .car")]
      const i = cars.findIndex((c) => {
        const card = c.closest(".card")
        return card && card.querySelector(".cnt i")
      })
      ;(cars[i >= 0 ? i : 0]).click()
    })
    await sleep(300)

    const marque = "TEST-" + Math.random().toString(36).slice(2, 7).toUpperCase()
    const edition = await page.evaluate((m) => {
      const champs = [...document.querySelectorAll(".lay-in")].filter((i) => i.offsetParent)
      if (!champs.length) return null
      const inp = champs[0]
      const avant = inp.value
      inp.focus(); inp.value = m
      inp.dispatchEvent(new Event("input", { bubbles: true }))
      inp.dispatchEvent(new Event("change", { bubbles: true }))
      return avant
    }, marque)
    await sleep(500)
    const dansLaPage = edition !== null && (await page.evaluate(() => {
      const f = document.querySelector("iframe")
      return f.contentDocument.body.innerText
    })).includes(marque)

    /* 5 : enregistrer puis recharger */
    let persiste = false
    if (dansLaPage) {
      await page.evaluate(() => [...document.querySelectorAll("button")].find((b) => b.textContent.trim() === "Enregistrer").click())
      await sleep(1800)
      await page.reload({ waitUntil: "networkidle2" })
      await sleep(2200)
      persiste = await page.evaluate((m) => {
        const f = document.querySelector("iframe")
        return !!f && !!f.contentDocument && f.contentDocument.body.innerText.includes(m)
      }, marque)
    }

    const souci = []
    if (mesure.sections < 5) souci.push("moins de 5 sections")
    if (mesure.vides > 0) souci.push(mesure.vides + " section(s) sans calque")
    if (mesure.textes === 0) souci.push("aucun texte éditable")
    if (edition === null) souci.push("aucun champ à éditer")
    if (!dansLaPage) souci.push("la page n'a pas suivi l'édition")
    if (!persiste) souci.push("modification perdue après rechargement")
    if (erreurs.length) souci.push("erreur JS : " + erreurs[0])

    return { id: tpl.id, nom: tpl.name, kind: tpl.kind, ...mesure, textes: mesure.textes, debut: edition, ok: souci.length === 0, souci }
  } finally {
    await page.close()
  }
}

/* ---------- programme ---------- */
;(async () => {
  const demandes = process.argv.slice(2).filter((a) => !a.startsWith("-"))
  const liste = SITES.LIST.filter((t) => !demandes.length || demandes.includes(t.id))
  if (!liste.length) {
    console.error("Aucun modèle à tester. Exemple : node scripts/tester-studio.js site5")
    process.exit(2)
  }

  const puppeteer = chargerPuppeteer()
  const executablePath = trouverChrome()
  const DB = path.join(os.tmpdir(), `novadz-test-studio-${Date.now()}.db`)
  const srv = await startServer({ db: DB, script: "server.js", env: { NOVADZ_DEMO: "1" } })
  const browser = await puppeteer.launch({
    executablePath,
    headless: "new",
    args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-gpu", "--disable-dev-shm-usage"],
  })

  const resultats = []
  for (const tpl of liste) {
    process.stdout.write(`  ${tpl.id.padEnd(10)} ${String(tpl.name).padEnd(12)} … `)
    try {
      const r = await testerModele(browser, srv.base, tpl)
      resultats.push(r)
      console.log(r.ok ? "OK" : "ÉCHEC — " + (r.souci || [r.detail]).join(", "))
    } catch (e) {
      resultats.push({ id: tpl.id, ok: false, souci: [e.message.slice(0, 90)] })
      console.log("ÉCHEC — " + e.message.slice(0, 90))
    }
  }

  await browser.close()
  srv.child.kill()
  for (const s of ["", "-wal", "-shm"]) { try { fs.unlinkSync(DB + s) } catch (_) {} }

  const ok = resultats.filter((r) => r.ok)
  console.log("")
  console.log("modèle      sections  textes  photos  liens   plus haute  1er texte édité")
  for (const r of resultats) {
    console.log(
      String(r.id).padEnd(11),
      String(r.sections ?? "—").padStart(8),
      String(r.textes ?? "—").padStart(6),
      String(r.photos ?? "—").padStart(7),
      String(r.liens ?? "—").padStart(6),
      r.hauteurMax ? String((r.hauteurMax / (r.ecran || 900)).toFixed(1) + " écrans").padStart(11) : "—".padStart(11),
      " " + String(r.debut ?? "—").slice(0, 34)
    )
  }
  console.log("")
  console.log(`${ok.length}/${resultats.length} modèles conformes.`)
  process.exit(ok.length === resultats.length ? 0 : 1)
})().catch((e) => {
  console.error("Test interrompu :", e.message)
  process.exit(2)
})
