#!/usr/bin/env node
"use strict"
/**
 * Preuve, en direct sur le serveur qui tourne (pas sur une copie) :
 *   1. boutique → formulaire de boutique seulement, tout obligatoire ;
 *   2. vitrine  → formulaire vitrine seulement, rien de la boutique ;
 *   3. une icône par page dans le menu ;
 *   4. aucune clé d'API demandée (Relances, E-mails, Pixels, Transporteur) ;
 *   5. adresse gratuite (maboutique.nova.site) affichée avant le DNS.
 *
 *   BASE=http://127.0.0.1:4600 node scripts/verifier-quatre-points.js
 */
const BASE = process.env.BASE || "http://127.0.0.1:4600"
let ok = 0, ko = 0
const dire = (bon, texte) => { bon ? ok++ : ko++; console.log(`${bon ? "✓" : "✗"} ${texte}`) }
const jar = new Map()
const cookie = () => [...jar.entries()].map(([k, v]) => `${k}=${v}`).join("; ")
async function req(p, opts = {}) {
  const res = await fetch(BASE + p, { ...opts, headers: { ...(opts.headers || {}), cookie: cookie() }, redirect: "manual" })
  for (const c of (res.headers.getSetCookie ? res.headers.getSetCookie() : [])) {
    const [pair] = c.split(";"); const i = pair.indexOf("=")
    jar.set(pair.slice(0, i), pair.slice(i + 1))
  }
  return { status: res.status, text: await res.text(), location: res.headers.get("location") || "" }
}
const form = (o) => ({ method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams(o).toString() })
const compte = async (kind, nom) => {
  jar.clear()
  const mail = `${kind}-${Date.now()}-${Math.random().toString(16).slice(2, 7)}@exemple.dz`
  await req("/signup", form({ kind, store: nom, name: "Test", email: mail, password: "secret123", password2: "secret123" }))
  return req("/demarrer")
}

;(async () => {
  console.log(`\nServeur vérifié : ${BASE}\n`)

  /* 1 — boutique */
  const b = await compte("commerce", "Sac Blida")
  dire(b.status === 200 && /data-kind="commerce"/.test(b.text), "boutique : le premier écran est celui de la boutique")
  dire(/Ce que vous vendez/.test(b.text), "boutique : on demande ce qui est vendu")
  dire(/Wilaya \(livraison\)/.test(b.text), "boutique : wilaya de livraison")
  dire(!/Ville \(wilaya\)/.test(b.text) && !/data-k="commerce"\][^<]*vitrine/.test(b.text), "boutique : aucun champ de vitrine dans la page")
  const champsB = ["store_name", "phone", "wilaya"]
  dire(champsB.every((n) => new RegExp(`name="${n}"[^>]*\\srequired`).test(b.text)), "boutique : nom, téléphone, wilaya obligatoires")
  dire(/name="metier" value="[a-z]+" required/.test(b.text), "boutique : le métier est obligatoire")
  const vide = await req("/demarrer", form({ store_name: "", metier: "mode", phone: "0555 12 34 56", wilaya: "Blida" }))
  dire(vide.status === 400 && /Le nom de votre boutique est obligatoire/.test(vide.text), "boutique : un envoi vide est refusé (400)")
  const melange = await req("/demarrer", form({ store_name: "Sac Blida", metier: "services", phone: "0555 12 34 56", wilaya: "Blida" }))
  dire(melange.status === 400 && /pas proposé pour une boutique/.test(melange.text), "boutique : un métier de vitrine est refusé (400)")

  /* 2 — vitrine */
  const v = await compte("vitrine", "Atelier Lina")
  dire(/data-kind="vitrine"/.test(v.text), "vitrine : le premier écran est celui du site vitrine")
  dire(/Votre activité/.test(v.text) && /Ville \(wilaya\)/.test(v.text), "vitrine : activité + ville")
  dire(/Créer mon site/.test(v.text), "vitrine : le bouton parle de site")
  dire(!/Wilaya \(livraison\)/.test(v.text) && !/Ce que vous vendez/.test(v.text), "vitrine : aucune question de boutique")
  dire(/participant|Aucun produit, aucun panier/.test(v.text) || /Aucun produit, aucun panier/.test(v.text), "vitrine : on annonce « aucun produit, aucun panier »")

  /* 3 — une icône par page (compte de démonstration) */
  jar.clear()
  await req("/login", form({ email: "demo@novadz.dz", password: "demo1234" }))
  const dash = await req("/dashboard/orders")
  const a = dash.text.indexOf('<nav class="dash-nav">'), z = dash.text.indexOf("</nav>", a)
  const bloc = dash.text.slice(a, z)
  const entrees = [...bloc.matchAll(/<a[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/g)]
    .map((m) => ({ href: m[1], svg: (m[2].match(/<svg[\s\S]*?<\/svg>/) || [""])[0].replace(/\s+/g, " ") }))
    .filter((e) => e.svg)
  const vus = new Map(); let doublon = ""
  for (const e of entrees) {
    if (vus.has(e.svg) && vus.get(e.svg) !== e.href) doublon = `${vus.get(e.svg)} / ${e.href}`
    vus.set(e.svg, e.href)
  }
  dire(entrees.length >= 12 && !doublon, `menu : ${entrees.length} entrées, ${vus.size} icônes différentes${doublon ? " — doublon : " + doublon : ""}`)

  /* 4 — pas de clés d'API */
  const rel = await req("/dashboard/relances")
  dire(!/name="msg_url"|name="msg_header_value"|name="msg_body"|name="msg_provider"/.test(rel.text) && /Prochainement/.test(rel.text),
    "relances : plus d'API à remplir, carte « Prochainement »")
  const mails = await req("/dashboard/mails")
  dire(!/name="smtp_host"|name="smtp_pass"/.test(mails.text) && /Prochainement/.test(mails.text),
    "e-mails : plus de serveur à configurer, carte « Prochainement »")
  const mk = await req("/dashboard/marketing")
  dire(!/name="meta_token"|name="tiktok_token"|name="snap_token"/.test(mk.text) && /name="pixel_meta"/.test(mk.text),
    "pixels : seulement les identifiants, aucun jeton")
  const car = await req("/dashboard/transporteur")
  dire(!/Réglages avancés/.test(car.text) && !/name="create_body"/.test(car.text),
    "transporteur : plus de chemins ni de corps de requête à écrire")

  /* 5 — adresse gratuite avant le DNS */
  const reg = await req("/dashboard/settings")
  const iAdr = reg.text.indexOf("amina-mode.nova.site")
  const iOpt = reg.text.indexOf("Tu as déjà un domaine")
  const iDns = reg.text.indexOf("Comment le relier")
  dire(iAdr > -1 && /Ton adresse gratuite/.test(reg.text), "réglages : l'adresse gratuite est affichée")
  dire(iAdr > -1 && iOpt > iAdr && iDns > iOpt, "réglages : adresse gratuite → domaine (facultatif) → DNS, dans cet ordre")
  const http = require("node:http")
  const { port } = new URL(BASE)
  const libre = await new Promise((resolve, reject) => {
    const q = http.request({ host: "127.0.0.1", port, path: "/", headers: { Host: "amina-mode.nova.site" } }, (res) => {
      let body = ""; res.on("data", (c) => (body += c)); res.on("end", () => resolve({ status: res.statusCode, body }))
    })
    q.on("error", reject); q.end()
  })
  dire(libre.status === 200 && /Amina Mode/.test(libre.body), "amina-mode.nova.site ouvre bien la boutique")

  console.log(`\nRésultat : ${ok} vérifications OK, ${ko} échec(s).\n`)
  process.exit(ko ? 1 : 0)
})()
