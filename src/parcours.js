"use strict"
/**
 * LE PARCOURS GUIDÉ — une seule étape à la fois.
 *
 * Pourquoi ce fichier ? Un marchand qui arrive ne sait pas par où commencer :
 * il voyait une liste de quatre lignes qui disparaissait sans jamais lui dire
 * quoi faire maintenant. Ici, on tient SA main : une étape, un écran, un
 * élément allumé, le reste assombri.
 *
 * Trois règles, tenues par ce module :
 *   1. une seule lumière à la fois  -> un seul `focus` renvoyé, jamais deux ;
 *   2. on peut toujours sortir      -> « Passer » et « ne plus me guider » ;
 *   3. on reprend où on s'est arrêté -> l'étape est calculée à partir des
 *      VRAIES données (produit ajouté ? site publié ? commande reçue ?).
 *
 * Aucun état n'est inventé : ce qui est coché vient de la base. La seule chose
 * qu'on enregistre, c'est ce que le marchand décide (passer / arrêter).
 */
const db = require("./db")

db.exec(`
CREATE TABLE IF NOT EXISTS store_parcours (
  store_id   INTEGER PRIMARY KEY REFERENCES stores(id) ON DELETE CASCADE,
  done       TEXT NOT NULL DEFAULT '',
  skipped    TEXT NOT NULL DEFAULT '',
  off        INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL DEFAULT ''
);
`)

/* ------------------------------------------------------------------ étapes */
/* `cible` = le sélecteur de l'élément qu'on laisse NET. Un seul par étape.
   `page`  = l'écran où l'étape se fait (le flou ne s'affiche que là). */
const STEPS = [
  {
    id: "fiche", n: 1, titre: "Remplir vos informations",
    sous: "Votre nom, votre téléphone et votre wilaya. C'est ce que le client voit quand il hésite.",
    page: "/dashboard/settings", cible: 'form[action="/dashboard/settings"]',
    href: "/dashboard/settings", bouton: "Voir mes informations",
  },
  {
    id: "produit", n: 2, titre: "Ajouter votre premier produit",
    sous: "Un nom, un prix, une photo. Une minute, et votre site n'est plus vide.",
    page: "/dashboard/products/new", cible: 'form input[name="title"]',
    href: "/dashboard/products/new", bouton: "Ajouter un produit",
  },
  {
    id: "categorie", n: 3, titre: "Ranger vos produits",
    sous: "Une catégorie, c'est une étagère : « Robes », « Sacs », « Téléphones ». Facultatif.",
    page: "/dashboard/categories", cible: 'form[action="/dashboard/categories"]',
    href: "/dashboard/categories", bouton: "Créer une catégorie", optionnel: true,
  },
  {
    id: "commande", n: 4, titre: "Vérifier le formulaire de commande",
    sous: "C'est ce que le client remplit pour commander. Les champs essentiels sont déjà cochés : jetez un œil, puis validez.",
    page: "/dashboard/formulaire", cible: "main .panel, main form",
    href: "/dashboard/formulaire", bouton: "Vérifier le formulaire", valider: true,
  },
  {
    id: "style", n: 5, titre: "Choisir un style",
    sous: "Six styles, pas dix-neuf. Un clic, et toute l'ambiance du site change.",
    page: "/dashboard/studio", cible: '[data-tour="styles"]',
    href: "/dashboard/studio", bouton: "Choisir mon style",
  },
  {
    id: "modifier", n: 6, titre: "Mettre votre touche",
    sous: "Changez le titre d'accueil, ajoutez une photo. C'est votre site, pas un modèle.",
    page: "/dashboard/studio", cible: '[data-tour="apercu"]',
    href: "/dashboard/studio", bouton: "Modifier mon site",
  },
  {
    id: "publier", n: 7, titre: "Publier votre site",
    sous: "Un clic. À partir de là, vos clients voient votre site à votre adresse.",
    page: "/dashboard/studio", cible: "#pub",
    href: "/dashboard/studio", bouton: "Publier", clignote: true,
  },
  {
    id: "donnees", n: 8, titre: "Suivre ce qui se passe",
    sous: "Commandes, visites, meilleur produit : c'est ici que vous voyez si ça marche.",
    page: "/dashboard/stats", cible: "main .chart, main .panel",
    href: "/dashboard/stats", bouton: "Voir mes chiffres",
  },
]

const TOTAL = STEPS.length
const byId = (id) => STEPS.find((s) => s.id === id) || null

/* --------------------------------------------------------------- la base */
const row = (storeId) => db.prepare("SELECT * FROM store_parcours WHERE store_id = ?").get(storeId) || null

const parseIds = (txt) => {
  try {
    const v = JSON.parse(txt || "[]")
    return Array.isArray(v) ? v.filter((x) => typeof x === "string") : []
  } catch (_) { return [] }
}

const write = (storeId, patch) => {
  const cur = row(storeId) || { done: "", skipped: "", off: 0 }
  const next = {
    done: patch.done !== undefined ? JSON.stringify(patch.done) : cur.done,
    skipped: patch.skipped !== undefined ? JSON.stringify(patch.skipped) : cur.skipped,
    off: patch.off !== undefined ? (patch.off ? 1 : 0) : cur.off,
  }
  if (!row(storeId)) {
    db.prepare("INSERT INTO store_parcours (store_id, done, skipped, off, updated_at) VALUES (?, ?, ?, ?, datetime('now'))")
      .run(storeId, next.done, next.skipped, next.off)
  } else {
    db.prepare("UPDATE store_parcours SET done = ?, skipped = ?, off = ?, updated_at = datetime('now') WHERE store_id = ?")
      .run(next.done, next.skipped, next.off, storeId)
  }
  return next
}

/* ------------------------------------------------- ce que la base nous dit */
const count = (sql, storeId) => {
  try { const r = db.prepare(sql).get(storeId); return r ? Number(r.n || 0) : 0 } catch (_) { return 0 }
}

/* L'état réel de la boutique, étape par étape. Aucune devinette : si le
   produit existe, l'étape est faite, même si le marchand n'a rien coché. */
const reel = (store) => {
  const id = store && store.id
  const DESIGN = require("./studio-design")
  let d = { draft: null, live: null }
  try { d = DESIGN.read(id) } catch (_) {}
  const produits = count("SELECT COUNT(*) AS n FROM products WHERE store_id = ?", id)
  const categories = count("SELECT COUNT(*) AS n FROM categories WHERE store_id = ?", id)
  const commandes = count("SELECT COUNT(*) AS n FROM orders WHERE store_id = ?", id)
  let visites = 0
  try { visites = count("SELECT COALESCE(SUM(n), 0) AS n FROM visits WHERE store_id = ?", id) } catch (_) {}
  return {
    fiche: Boolean(String((store && store.phone) || "").trim() && String((store && store.wilaya) || "").trim()),
    produit: produits > 0,
    categorie: categories > 0,
    commande: false,           /* pas de trace fiable : c'est lui qui valide */
    style: Boolean(d.draft || d.live),
    modifier: Boolean(d.draft),
    publier: Boolean(d.live),
    donnees: commandes > 0 || visites > 0,
    produits, categories, commandes, visites,
  }
}

const etat = (store) => {
  const r = row(store.id) || { done: "", skipped: "", off: 0 }
  const doneManuel = parseIds(r.done)
  const skipped = parseIds(r.skipped)
  const faits = reel(store)
  const steps = STEPS.map((s) => {
    const auto = Boolean(faits[s.id])
    return {
      ...s,
      fait: auto || doneManuel.includes(s.id),
      passe: skipped.includes(s.id),
      auto,
    }
  })
  const restants = steps.filter((s) => !s.fait && !s.passe)
  const courant = restants[0] || null
  return {
    off: Boolean(Number(r.off)),
    steps,
    courant,
    faites: steps.filter((s) => s.fait).length,
    total: TOTAL,
    fini: !courant,
    faits,
  }
}

/* ------------------------------------------------------------- les actions */
const marquer = (store, id, quoi) => {
  if (!byId(id)) return { ok: false, error: "Étape inconnue." }
  const r = row(store.id) || { done: "", skipped: "", off: 0 }
  const done = parseIds(r.done)
  const skipped = parseIds(r.skipped)
  if (quoi === "passer") {
    if (!skipped.includes(id)) skipped.push(id)
    /* passer une étape facultative la laisse « passée », mais on ne l'efface
       pas des étapes faites : elle peut être faite plus tard. */
    return { ok: true, ...write(store.id, { skipped }) }
  }
  if (!done.includes(id)) done.push(id)
  return { ok: true, ...write(store.id, { done }) }
}

const arreter = (store) => ({ ok: true, ...write(store.id, { off: true }) })
const reprendre = (store) => ({ ok: true, ...write(store.id, { off: false }) })

/* Le revoilà : on peut relancer le guide depuis Réglages. */
const relancer = (store) => write(store.id, { off: false, skipped: [], done: [] })

/* ----------------------------------------------------------------- l'écran */
const esc = (s) => String(s == null ? "" : s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]))

/* La barre d'une étape, à poser sur la page concernée. `data` part dans le
   navigateur : c'est lui qui pose le voile et le trou net, sans toucher au
   reste de la page. */
const bloc = (store, page) => {
  const e = etat(store)
  if (e.off || !e.courant) return { html: "", data: null }
  const ici = page === e.courant.page
  const data = {
    etape: e.courant.n, total: e.total, id: e.courant.id,
    titre: e.courant.titre, sous: e.courant.sous,
    cible: ici ? e.courant.cible : "",
    href: e.courant.href,
    suivant: (e.steps.filter((s) => !s.fait && !s.passe)[1] || {}).href || "",
    optionnel: Boolean(e.courant.optionnel),
    clignote: Boolean(e.courant.clignote),
    ici,
    url: "/dashboard/parcours/" + e.courant.id,
  }
  const html = `
<section class="tour" id="ndzTour" hidden aria-live="polite">
  <div class="tour-voile" id="tourVoile"></div>
  <div class="tour-card" role="dialog" aria-labelledby="tourTitre">
    <div class="tour-head"><span class="tour-num" id="tourNum"></span><b id="tourTitre"></b></div>
    <p class="tour-sous" id="tourSous"></p>
    <div class="tour-acts">
      <a class="btn btn-sm" id="tourFaire" href="#"></a>
      <button class="btn btn-ghost btn-sm" type="button" id="tourPasser">${e.courant.optionnel ? "Passer (facultatif)" : "Passer pour l'instant"}</button>
      <button class="link-danger tour-off" type="button" id="tourOff">Ne plus me guider</button>
    </div>
  </div>
</section>
<div class="tour-pill" id="tourPill" hidden>
  <span id="tourPillTxt"></span>
  <a class="btn btn-sm" id="tourPillGo" href="#">Continuer</a>
</div>
<style>
.tour{position:fixed;inset:0;z-index:9000;pointer-events:none}
.tour-voile{position:absolute;inset:0;background:rgba(15,15,15,.58);pointer-events:none;
  animation:tourIn .18s ease-out}
.tour-cible{position:relative!important;z-index:9001!important;background:#fff;border-radius:12px;
  box-shadow:0 0 0 3px #fff,0 0 0 7px rgba(17,17,17,.85),0 30px 60px -20px rgba(0,0,0,.6)}
.tour-clignote{animation:tourCligne 1.4s ease-in-out infinite}
.tour-card{position:absolute;left:50%;bottom:22px;transform:translateX(-50%);z-index:9002;
  width:min(560px,92vw);background:#fff;border-radius:14px;padding:16px 18px;
  box-shadow:0 30px 70px -24px rgba(0,0,0,.55);pointer-events:auto}
.tour-head{display:flex;align-items:center;gap:10px}
.tour-num{display:inline-flex;align-items:center;height:22px;padding:0 9px;border-radius:999px;
  background:#111;color:#fff;font-size:11.5px;font-weight:600;letter-spacing:.02em}
.tour-head b{font-size:15px;letter-spacing:-.01em}
.tour-sous{margin:8px 0 14px;font-size:13px;line-height:1.5;color:#5b5b63}
.tour-acts{display:flex;align-items:center;gap:10px;flex-wrap:wrap}
.tour-off{margin-left:auto;background:none;border:0;font:inherit;font-size:12px;color:#8a8a93;cursor:pointer;text-decoration:underline}
.tour-pill{position:fixed;left:50%;bottom:16px;transform:translateX(-50%);z-index:8000;
  display:flex;align-items:center;gap:10px;background:#111;color:#fff;border-radius:999px;
  padding:8px 10px 8px 16px;font-size:12.5px;box-shadow:0 20px 40px -18px rgba(0,0,0,.6)}
.tour-pill a{background:#fff;color:#111}
@keyframes tourIn{from{opacity:0}to{opacity:1}}
@keyframes tourCligne{0%,100%{box-shadow:0 0 0 3px #fff,0 0 0 7px rgba(17,17,17,.85)}
  50%{box-shadow:0 0 0 3px #fff,0 0 0 12px rgba(17,17,17,.35)}}
@media (prefers-reduced-motion:reduce){.tour-clignote{animation:none}}
@media (max-width:640px){
  .tour-card{left:12px;right:12px;transform:none;width:auto;bottom:12px;padding:14px}
  .tour-off{margin-left:0}
}
</style>
<script data-tour>
(function () {
  var D = ${JSON.stringify(data).replace(/</g, "\\u003c")}
  var el = document.getElementById("ndzTour")
  if (!el) return
  var T = document.getElementById("tourTitre"), S = document.getElementById("tourSous")
  var N = document.getElementById("tourNum")
  var F = document.getElementById("tourFaire"), P = document.getElementById("tourPasser"), O = document.getElementById("tourOff")
  var pill = document.getElementById("tourPill"), pillTxt = document.getElementById("tourPillTxt"), pillGo = document.getElementById("tourPillGo")
  T.textContent = D.titre; S.textContent = D.sous
  N.textContent = "Étape " + D.etape + " sur " + D.total
  F.textContent = ${JSON.stringify((STEPS.find((s) => s.id === data.id) || {}).bouton || "Continuer")}
  F.href = D.href
  /* on ne montre le voile QUE sur la page de l'étape : ailleurs, une simple
     pastille discrète propose de continuer. */
  if (!D.ici) {
    pill.hidden = false
    pillTxt.textContent = "Étape " + D.etape + " sur " + D.total + " · " + D.titre
    pillGo.href = D.href
    return
  }
  el.hidden = false
  var cible = null
  var sl = D.cible.split(",")
  for (var i = 0; i < sl.length && !cible; i++) {
    try { cible = document.querySelector(sl[i].trim()) } catch (_) {}
  }
  if (cible) {
    cible.classList.add("tour-cible")
    if (D.clignote) cible.classList.add("tour-clignote")
    /* le champ à remplir est déjà prêt : on met le curseur dedans */
    try {
      var champ = cible.matches("input,textarea,select") ? cible : cible.querySelector("input,textarea,select")
      if (champ && D.etape <= 4) champ.focus({ preventScroll: true })
    } catch (_) {}
  }
  function nettoyer() {
    if (cible) cible.classList.remove("tour-cible", "tour-clignote")
  }
  function quitter(url, corps) {
    nettoyer()
    if (url) { window.location = url; return }
    fetch(D.url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(corps || {}), credentials: "same-origin" })
      .then(function () { window.location.reload() })
      .catch(function () { window.location.reload() })
  }
  P.addEventListener("click", function () { quitter("", { action: "passer" }) })
  O.addEventListener("click", function () { quitter("", { action: "arreter" }) })
  F.addEventListener("click", function (e) {
    /* une étape « à valider » (le formulaire de commande) se valide sur place */
    if (D.etape === 4) { e.preventDefault(); quitter("", { action: "fait" }); return }
    /* dans le Studio, on agit sur place : le bouton ouvre la bonne chose */
    if (D.ici && D.etape === 5) {
      e.preventDefault()
      var th = document.querySelector('[data-tour="styles"]') || document.getElementById("themeBtn")
      if (th) { try { th.click() } catch (_) {} }
      quitter("", { action: "fait" })
      return
    }
    if (D.ici && D.etape === 6) {
      e.preventDefault()
      nettoyer()
      el.hidden = true
      var champ = document.querySelector('[data-tour="apercu"]')
      if (champ && champ.scrollIntoView) champ.scrollIntoView({ behavior: "smooth", block: "center" })
      quitter("", { action: "fait" })
      return
    }
    if (D.ici && D.etape === 7) {
      e.preventDefault()
      var pub = document.getElementById("pub")
      if (pub) { nettoyer(); el.hidden = true; pub.click() }
      return
    }
  })
})()
</script>`
  return { html, data }
}

module.exports = { STEPS, TOTAL, etat, reel, bloc, marquer, arreter, reprendre, relancer, byId }
