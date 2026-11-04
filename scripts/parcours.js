#!/usr/bin/env node
"use strict"
/**
 * Vérification de bout en bout : on utilise le site comme un vrai client.
 *
 *   BASE=http://127.0.0.1:4600 node scripts/parcours.js
 *
 * Ce qui est vérifié, sur des copies (rien n'est cassé dans la base) :
 *   1. un client choisit un produit, remplit le formulaire, la commande arrive
 *   2. le marchand enregistre une modification dans le Studio et la publie
 *   3. la boutique publiée affiche la modification
 *   4. une inscription crée bien une boutique neuve
 *   5. les pages tiennent sur un téléphone (pas de débordement horizontal)
 */
const { startServer } = require("../tests/boot")
const os = require("node:os")
const path = require("node:path")
const puppeteer = require("puppeteer-core")
const chromium = require("@sparticuz/chromium").default

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
let ok = 0, ko = 0
const good = (m) => { ok++; console.log("  ✓ " + m) }
const bad = (m) => { ko++; console.log("  ✗ " + m) }

async function main() {
  const srv = await startServer({ db: path.join(os.tmpdir(), `novadz-parcours-${process.pid}.db`), env: { NOVADZ_DEMO_DATA: "1" } })
  const base = srv.base
  const jar = {} /* bavard : un cookie par rôle */
  const ask = async (role, url, opts = {}) => {
    const headers = { ...(opts.headers || {}) }
    if (jar[role]) headers.cookie = jar[role]
    const r = await fetch(base + url, { redirect: "manual", ...opts, headers })
    const raw = r.headers.getSetCookie ? r.headers.getSetCookie() : [r.headers.get("set-cookie") || ""]
    const set = raw.filter(Boolean).map((c) => c.split(";")[0]).join("; ")
    if (set) jar[role] = set
    return r
  }
  const page = async (role, url) => (await ask(role, url)).text()

  console.log("\n1. Le client commande")
  const shop = await page("client", "/amina-mode")
  const idProduit = (shop.match(/\/amina-mode\/p\/(\d+)/) || [])[1]
  if (idProduit) good("fiche produit trouvée (id " + idProduit + ")")
  else bad("aucune fiche produit sur /amina-mode")

  const fiche = await page("client", "/amina-mode/p/" + idProduit)
  if (fiche.includes("add to cart") || fiche.includes("Ajouter") || /name="product_id"/.test(fiche))
    good("bouton d'achat présent sur la fiche")
  else bad("aucun bouton d'achat sur la fiche")

  const rAdd = await ask("client", "/amina-mode/cart", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ product_id: idProduit, qty: "1" }).toString(),
  })
  if (rAdd.status === 302) good("produit ajouté au panier")
  else bad("produit refusé au panier (HTTP " + rAdd.status + ")")

  const pageCheckout = await page("client", "/amina-mode/checkout")
  if (/action="\/amina-mode\/checkout"/.test(pageCheckout)) good("page de commande accessible")
  else bad("page de commande absente")
  const paiement = (pageCheckout.match(/name="payment" value="([^"]+)"/) || [])[1] || "cod"
  const livraison = (pageCheckout.match(/name="delivery" value="([^"]+)" checked/) || [])[1] || "home"

  const rCmd = await ask("client", "/amina-mode/checkout", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      customer_name: "Client Test", phone: "0555123456", wilaya: "Alger",
      commune: "Bab Ezzouar", address: "Cité 200 logements", note: "",
      delivery: livraison, payment: paiement,
    }).toString(),
  })
  const corpsCmd = await rCmd.text()
  const acceptee = rCmd.status === 302 || /Commande confirmée/i.test(corpsCmd)
  if (acceptee) good("commande acceptée" + (rCmd.status === 302 ? " (→ " + (rCmd.headers.get("location") || "") + ")" : " (page de confirmation)"))
  else bad("commande refusée (HTTP " + rCmd.status + ")")

  await ask("client", "/demo-login/marchand?next=/dashboard")
  const commandes = await page("client", "/dashboard/orders")
  if (commandes.includes("Client Test")) good("la commande apparaît dans le tableau de bord")
  else bad("la commande n'apparaît pas dans le tableau de bord")

  console.log("\n2. Le marchand écrit dans le Studio, puis publie")
  const SITES = require("../src/site-templates")
  const tpl = "site6"
  const source = SITES.pageSource(tpl, "home")
  const phrase = "Texte vérifié " + Date.now().toString().slice(-4)
  /* on change un vrai texte de la page, comme le fait le Studio */
  const marque = (source.match(/>[A-Z][A-Za-z ]{6,40}</) || [])[0]
  if (!marque) bad("aucun texte modifiable trouvé dans le modèle")
  const modifie = source.replace(marque, ">" + phrase + "<")
  const save = await ask("client", "/dashboard/studio/save", {
    method: "POST",
    headers: { "Content-Type": "application/json", Origin: base },
    body: JSON.stringify({ html: modifie, page: "home" }),
  })
  const saveJson = await save.json().catch(() => ({}))
  if (saveJson.ok) good("la page modifiée est enregistrée en brouillon")
  else bad("enregistrement refusé : " + JSON.stringify(saveJson).slice(0, 120))

  const avantPub = await page("client", "/amina-mode")
  if (!avantPub.includes(phrase)) good("le brouillon n'est pas encore visible par les clients")
  else bad("le brouillon est déjà visible avant publication")

  const pub = await ask("client", "/dashboard/studio/publish", { method: "POST", headers: { "Content-Type": "application/json", Origin: base }, body: "{}" })
  if (pub.status < 400) good("publication acceptée (HTTP " + pub.status + ")")
  else bad("publication refusée (HTTP " + pub.status + ")")

  const apresPub = await page("client", "/amina-mode")
  if (apresPub.includes(phrase)) good("la boutique publiée affiche le nouveau texte")
  else bad("le nouveau texte n'apparaît pas sur la boutique")

  /* la boutique reste saine après publication */
  const sain = await ask("client", "/amina-mode")
  const sainHtml = await sain.text()
  if (sain.status === 200 && !/\$\s?\d/.test(sainHtml)) good("la boutique reste en ligne, prix en dinars")
  else bad("la boutique est cassée après publication (HTTP " + sain.status + ")")

  console.log("\n3. Une inscription crée une boutique")
  const slug = "essai-" + Date.now().toString().slice(-6)
  const courriel = `essai${Date.now()}@exemple.dz`
  const ins = await ask("neuf", "/signup", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      kind: "commerce", store: "Essai Boutique", name: "Essai NovaDZ",
      email: courriel, password: "motdepasse123", password2: "motdepasse123",
    }).toString(),
  })
  if (ins.status === 302) good("inscription acceptée (→ " + (ins.headers.get("location") || "") + ")")
  else bad("inscription refusée (HTTP " + ins.status + ")")
  const suite = await ask("neuf", "/dashboard")
  const corps = await suite.text()
  if (suite.status === 200 && /Studio/i.test(corps)) good("le nouveau compte arrive sur son tableau de bord")
  else bad("le nouveau compte n'arrive pas sur son tableau de bord (HTTP " + suite.status + ")")
  const studio = await ask("neuf", "/dashboard/studio", { redirect: "follow" })
  const studioHtml = await studio.text()
  if (studio.status === 200 && /Studio|Avancé|Publier/.test(studioHtml)) good("le nouveau compte a le Studio, tout de suite")
  else bad("le nouveau compte n'a pas le Studio (HTTP " + studio.status + ")")

  console.log("\n4. Les pages tiennent sur un téléphone")
  const browser = await puppeteer.launch({ args: chromium.args, executablePath: await chromium.executablePath(), headless: true })
  const p = await browser.newPage()
  await p.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true })
  for (const url of ["/", "/amina-mode", "/amina-mode/p/" + idProduit]) {
    await p.goto(base + url, { waitUntil: "networkidle2", timeout: 60000 })
    await sleep(500)
    const large = await p.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
    if (large <= 2) good(url + " : pas de débordement (largeur " + (390 + large) + " px)")
    else bad(url + " : débordement horizontal de " + large + " px")
  }
  await browser.close()
  srv.child.kill()

  console.log(`\n${ok} vérification(s) OK, ${ko} en échec`)
  process.exit(ko ? 1 : 0)
}
main().catch((e) => { console.error(e); process.exit(2) })
