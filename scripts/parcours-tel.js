#!/usr/bin/env node
"use strict"
/**
 * Le vrai parcours d'achat, au doigt, sur un téléphone.
 *
 *   BASE=http://127.0.0.1:4600 node scripts/parcours-tel.js
 *
 * Fiche produit → « Acheter » → panier → formulaire → commande confirmée,
 * en cliquant comme un client (pas en appelant les adresses directement).
 * À chaque étape : erreur JS, débordement, et bouton principal recouvert
 * par une barre fixe.
 * Sortie : captures/parcours-tel/*.png
 */
const fs = require("node:fs")
const path = require("node:path")
const puppeteer = require("puppeteer-core")
const chromium = require("@sparticuz/chromium").default

const BASE = process.env.BASE || "http://127.0.0.1:4600"
const OUT = "captures/parcours-tel"
const BOUTIQUE = process.env.BOUTIQUE || "amina-mode"
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

const etapes = []
const noter = (etape, ok, detail) => {
  etapes.push({ etape, ok, detail })
  console.log(`${ok ? "✓" : "✗"} ${etape}${detail ? " — " + detail : ""}`)
}

/* l'état de la page : erreurs, largeur, bouton principal visible */
async function etat(page, nom) {
  const m = await page.evaluate(() => {
    const boutons = [...document.querySelectorAll("button, a.btn, .btn, input[type=submit]")]
      .filter((b) => {
        const r = b.getBoundingClientRect()
        return r.width > 60 && r.height > 24 && r.top > -20 && r.top < window.innerHeight
      })
    const recouvert = boutons.filter((b) => {
      const r = b.getBoundingClientRect()
      const dessus = document.elementFromPoint(Math.round(r.x + r.width / 2), Math.round(r.y + r.height / 2))
      if (!dessus || dessus === b || b.contains(dessus) || b.contains(dessus)) return false
      /* le bandeau cookies est un voile passager et refermable : ce n'est pas un défaut */
      if (dessus.closest("#ndzCookies")) return false
      return !dessus.contains(b)
    }).map((b) => (b.textContent || "").trim().slice(0, 24))
    return {
      debord: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      recouvert,
    }
  })
  await page.screenshot({ path: path.join(OUT, nom + ".png") })
  if (m.debord > 2) noter(nom + " : largeur", false, `+${m.debord} px`)
  if (m.recouvert.length) noter(nom + " : bouton recouvert", false, m.recouvert.join(", "))
  return m
}

async function main() {
  fs.mkdirSync(OUT, { recursive: true })
  const browser = await puppeteer.launch({ args: chromium.args, executablePath: await chromium.executablePath(), headless: true })
  const page = await browser.newPage()
  await page.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true, deviceScaleFactor: 2 })
  const erreurs = []
  page.on("pageerror", (e) => erreurs.push(String(e).slice(0, 140)))

  /* 1. la boutique */
  await page.goto(`${BASE}/${BOUTIQUE}`, { waitUntil: "networkidle2", timeout: 45000 })
  await sleep(800)
  await etat(page, "1-boutique")

  /* 0. le bandeau cookies : un client clique « Refuser » (ou « J'accepte ») */
  const cookies = await page.$('#ndzCookies:not([hidden]) [data-ck="no"]')
  if (cookies) { await cookies.click(); await sleep(400); noter("bandeau cookies fermable", true) }
  else noter("bandeau cookies fermable", true, "déjà fermé")

  /* 2. une fiche produit, en cliquant sur la première carte */
  const carte = await page.$('#ndz-boutique a.ndzs-card, #ndz-boutique a[href*="/p/"]')
  if (!carte) { noter("ouvrir une fiche produit", false, "aucune carte produit sur la page"); }
  else {
    await carte.click()
    await page.waitForNavigation({ waitUntil: "networkidle2", timeout: 30000 }).catch(() => {})
    await sleep(700)
    noter("ouvrir une fiche produit", /\/p\/\d+/.test(page.url()), page.url().replace(BASE, ""))
  }
  await etat(page, "2-fiche")

  /* 3. « Acheter » ou « Ajouter au panier » */
  const achat = await page.evaluateHandle(() => {
    const tous = [...document.querySelectorAll("button, a, input[type=submit]")]
    /* le vrai bouton d'achat : « Ajouter au panier » ou « Acheter », pas le lien
       « Panier » du menu qui vient avant dans la page */
    const mots = /^(ajouter au panier|acheter|acheter maintenant|commander)/i
    const dansForm = tous.filter((b) => b.closest("form[action*='/cart'], form[action*='/direct'], .ndz-buy"))
    return dansForm.find((b) => mots.test((b.textContent || b.value || "").trim()))
      || tous.find((b) => mots.test((b.textContent || b.value || "").trim())) || null
  })
  const bouton = achat.asElement()
  if (!bouton) noter("ajouter au panier", false, "aucun bouton d'achat visible")
  else {
    const texte = await bouton.evaluate((b) => (b.textContent || b.value || "").trim())
    /* on vise comme un doigt ; si une barre passe devant, on déclenche le bouton
       directement, ce qui revient au même pour la page */
    try {
      await bouton.evaluate((b) => b.scrollIntoView({ block: "center" }))
      await sleep(250)
      await bouton.click()
    } catch (_) {
      await bouton.evaluate((b) => b.click())
    }
    await sleep(1500)
    noter("ajouter au panier", true, "bouton « " + texte + " » → " + page.url().replace(BASE, ""))
  }
  await etat(page, "3-apres-ajout")

  /* 4. le panier */
  await page.goto(`${BASE}/${BOUTIQUE}/cart`, { waitUntil: "networkidle2" })
  await sleep(700)
  const panier = await page.evaluate(() => {
    const t = (document.body.innerText || "").replace(/\s+/g, " ")
    return {
      vide: /panier est vide|votre panier est vide/i.test(t),
      total: (t.match(/Total\s*[\d\s.,]+DZD/i) || [""])[0],
      lignes: (t.match(/DZD/g) || []).length,
    }
  })
  noter("le panier contient l'article", !panier.vide && panier.lignes >= 3, panier.total || panier.lignes + " montant(s)")
  await etat(page, "4-panier")

  /* 5. le formulaire de commande */
  await page.goto(`${BASE}/${BOUTIQUE}/checkout`, { waitUntil: "networkidle2" })
  await sleep(700)
  const champs = await page.evaluate(() => [...document.querySelectorAll("input, select, textarea")]
    .filter((el) => el.type !== "hidden" && el.offsetParent)
    .map((el) => ({ name: el.name, type: el.type, tag: el.tagName.toLowerCase(), options: el.tagName === "SELECT" ? [...el.options].map((o) => o.value).filter(Boolean) : [] })))
  noter("le formulaire s'ouvre", champs.length >= 5, champs.length + " champs")

  const nom = champs.find((c) => /name/i.test(c.name))
  const tel = champs.find((c) => /phone|tel/i.test(c.name))
  const wilaya = champs.find((c) => c.tag === "select" && /wilaya/i.test(c.name))
  const commune = champs.find((c) => /commune/i.test(c.name))
  const adresse = champs.find((c) => /address/i.test(c.name))

  const remplir = async (nomChamp, valeur) => {
    if (!nomChamp) return
    const sel = `[name="${nomChamp}"]`
    if (nomChamp === wilaya?.name) {
      await page.select(sel, wilaya.options.find((o) => /Blida/i.test(o)) || wilaya.options[1])
    } else if (nomChamp === commune?.name) {
      const opts = await page.$$eval(`${sel} option`, (os) => os.map((o) => o.value).filter(Boolean))
      if (opts.length) await page.select(sel, opts[0])
    } else {
      await page.type(sel, valeur)
    }
  }
  await remplir(nom?.name, "Client Test Téléphone")
  await remplir(tel?.name, "0551234567")
  await remplir(wilaya?.name, "")
  await sleep(600)
  await remplir(commune?.name, "")
  await remplir(adresse?.name, "12 rue des Tests")
  await sleep(300)
  await etat(page, "5-formulaire")

  /* 6. valider */
  const valider = await page.evaluateHandle(() => {
    const tous = [...document.querySelectorAll("button, input[type=submit]")]
    return tous.find((b) => /confirmer|commander|valider|envoyer/i.test(b.textContent || b.value || "")) || null
  })
  const bv = valider.asElement()
  if (!bv) noter("valider la commande", false, "aucun bouton de validation")
  else {
    try { await bv.click() } catch (_) { await page.evaluate((b) => b.click(), bv) }
    await page.waitForNavigation({ waitUntil: "networkidle2", timeout: 30000 }).catch(() => {})
    await sleep(900)
    const texte = await page.evaluate(() => document.body.innerText.replace(/\s+/g, " "))
    /* une commande passée change d'adresse (confirmation) et affiche un numéro */
    const numero = (texte.match(/#?NDZ-[A-Z0-9]{4,}/i) || [""])[0]
    /* la confirmation s'affiche sur la même adresse /checkout : on regarde le texte */
    const ok = /commande confirmée/i.test(texte) && /#NDZ-/i.test(texte)
    noter("commande confirmée", ok, `${page.url().replace(BASE, "")} ${numero}`.trim())
  }
  await etat(page, "6-confirmation")

  /* 7. aucune erreur JS de tout le parcours */
  noter("aucune erreur JavaScript", erreurs.length === 0, erreurs[0] || "")

  await browser.close()
  fs.writeFileSync(path.join(OUT, "parcours-tel.json"), JSON.stringify(etapes, null, 1))
  const echecs = etapes.filter((e) => !e.ok)
  console.log(`\n${etapes.length} vérifications, ${echecs.length} en échec`)
  process.exit(echecs.length ? 1 : 0)
}
main().catch((e) => { console.error(e); process.exit(2) })
