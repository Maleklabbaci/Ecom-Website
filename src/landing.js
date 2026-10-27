"use strict"
/**
 * Accueil NovaDZ. Même système visuel qu'une vitrine de thèmes :
 * Urbanist + Geist, fond noir, cartes en volume, défilement.
 * Texte original. Pas leurs photos, pas leurs templates.
 */

const SITES = require("./site-templates")

/* La landing ne montre que six thèmes : trois vitrines, trois e-commerce.
   Le catalogue complet reste sur /themes. Sélection par identifiant, pour
   garder noms et niches synchronisés avec src/site-templates.js.
   Vitrine : Prozi (agence), C. Reyes (conseil), Newcomer (produit digital).
   E-commerce : Adeline (mode), Essentia (soin), Furnexa (mobilier). */
const PICKS = [
  { label: "Vitrine", hint: "Pour présenter.", ids: ["site5", "site3", "site16"] },
  { label: "E-commerce", hint: "Pour vendre.", ids: ["site1", "site11", "site10"] },
]
const toShow = (id) => {
  const t = SITES.LIST.find((x) => x.id === id)
  if (!t) return null
  return { id: t.id, name: t.name, line: t.niche, href: `/templates/${t.id}.html`, shot: `/shots/${t.id}.jpg`, use: `/signup?site=${t.id}`, useLabel: "Utiliser" }
}
const SHOW = PICKS.map((g) => ({ ...g, items: g.ids.map(toShow).filter(Boolean) }))

const esc = (s) =>
  String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]))

const bolt = (n = 14) => `<svg width="${n}" height="${n}" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M13 2 4 14h7l-1 8 10-14h-7l1-6z"/></svg>`
const cart = () => `<svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M8.1 6.1h.55l.35 1.35h10.7a1.05 1.05 0 0 1 1.02 1.3l-1.25 4.7a1.7 1.7 0 0 1-1.64 1.25H9.55a1.7 1.7 0 0 1-1.64-1.25L6.85 6.1H4.35a1.05 1.05 0 1 1 0-2.1h2.85c.46 0 .86.3.99.74l.2 1.36z"/><circle cx="10.15" cy="18.55" r="1.55"/><circle cx="16.35" cy="18.55" r="1.55"/></svg>`

const card = (t) => `<article class="tcard">
  <a class="tshot" href="${esc(t.href || "/voir/" + t.id)}">
    <img src="${esc(t.shot || "/shots/" + t.id + ".jpg")}" alt="">
    <span class="pill">Inclus</span>
  </a>
  <span class="tinfo">
    <span class="tmeta">
      <b>${esc(t.name)}<sup>®</sup></b>
      <small>${esc(t.line)}</small>
    </span>
    <a class="tuse" href="${esc(t.use || "/signup")}">${esc(t.useLabel || "Utiliser")}</a>
  </span>
</article>`

function t3d() {
  const items = [
    { lang: "fr", name: "Amira K.", user: "@amira", place: "Algérie", flag: "🇩🇿", letter: "A", color: "#f3d7c4", quote: "Publié le jour même. Pas d'agence, pas de devis." },
    { lang: "en", name: "Nora H.", user: "@nora", place: "London", flag: "🇬🇧", letter: "N", color: "#d7e4ff", quote: "Online the same afternoon. No meetings." },
    { lang: "ar", name: "ليلى ب.", user: "@laila", place: "الجزائر", flag: "🇩🇿", letter: "ل", color: "#efe6c8", quote: "نشرت الموقع في نفس اليوم، من غير وكالة." },
    { lang: "fr", name: "Yanis B.", user: "@yanis", place: "Oran", flag: "🇩🇿", letter: "Y", color: "#d9f2c8", quote: "Le panier et les wilayas étaient déjà là." },
    { lang: "en", name: "Adam S.", user: "@adam", place: "New York", flag: "🇺🇸", letter: "A", color: "#f7d6e4", quote: "Fixed price. I publish when it's ready." },
    { lang: "ar", name: "يوسف م.", user: "@youcef", place: "وهران", flag: "🇩🇿", letter: "ي", color: "#d8efe8", quote: "السلة والولايات والدفع عند الاستلام، كل شيء جاهز." },
    { lang: "fr", name: "Sara M.", user: "@sara", place: "Lyon", flag: "🇫🇷", letter: "S", color: "#e7d8ff", quote: "Je change les couleurs moi-même. Personne à rappeler." },
    { lang: "en", name: "Lina P.", user: "@lina", place: "Dubai", flag: "🇦🇪", letter: "L", color: "#ffe3c4", quote: "The two types made the choice obvious." },
    { lang: "ar", name: "نورة س.", user: "@noura", place: "قسنطينة", flag: "🇩🇿", letter: "ن", color: "#f3d0d0", quote: "نبدّل المنتجات وحدي. ما نعيط لحتى واحد." },
    { lang: "fr", name: "Karim D.", user: "@karim", place: "Alger", flag: "🇩🇿", letter: "K", color: "#d4e8f7", quote: "Sans photo, la fiche reste propre. Ça m'a décidé." },
    { lang: "en", name: "Owen R.", user: "@owen", place: "Toronto", flag: "🇨🇦", letter: "O", color: "#e8e8e8", quote: "I added the products myself. That was the point." },
    { lang: "ar", name: "أمين ر.", user: "@amine", place: "عنابة", flag: "🇩🇿", letter: "أ", color: "#efe0c2", quote: "حتى بلا صورة، الصفحة تبقى نظيفة." },
  ]
  const card = (t) => `<article class="t3d-card ${t.lang}">
    <div class="who"><i class="av" style="background:${t.color}">${t.letter}</i><div><b>${t.name}</b><small dir="ltr">${t.user}</small></div><span>${t.flag} <bdi>${t.place}</bdi></span></div>
    <p>${t.quote}</p>
  </article>`
  const cols = [
    { dir: "down", dur: "42s", ids: [0, 3, 6, 9, 1, 8] },
    { dir: "up", dur: "48s", ids: [1, 4, 7, 10, 2, 5] },
    { dir: "down", dur: "38s", ids: [2, 5, 8, 11, 0, 7] },
    { dir: "up", dur: "52s", ids: [6, 1, 10, 4, 9, 3] },
    { dir: "down", dur: "44s", ids: [11, 7, 3, 8, 4, 0] },
  ]
  const col = (c) => {
    const once = c.ids.map((i) => card(items[i])).join("")
    const run = once + once + once
    return `<div class="t3d-col ${c.dir}" style="--dur:${c.dur}">${run}${run}</div>`
  }
  const phoneOrder = [0, 2, 1, 3, 5, 4, 6, 8, 7, 9, 11, 10]
  const phone = phoneOrder.map((i) => card(items[i])).join("")
  return `<section class="avis" id="avis" aria-label="Témoignages">
  <header class="avis-head">
    <h2>Témoignages.</h2>
    <p>Ils ont publié le jour même. <b>Sans agence</b>, sans devis.</p>
  </header>
  <div class="t3d">
  <div class="t3d-persp"><div class="t3d-plane">${cols.map(col).join("")}</div></div>
  <div class="t3d-fade top" aria-hidden="true"></div>
  <div class="t3d-fade bot" aria-hidden="true"></div>
  </div>
  <div class="avis-phone">${phone}</div>
</section>`
}

const landing = (stores) => {
  const list = Array.isArray(stores) ? stores : []
  const n = list.length
  const names = list.map((s) => s.name).filter(Boolean).slice(0, 2).map(esc).join(" · ")
  return `<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>NovaDZ — Une boutique qui a l'air faite</title>
<meta name="description" content="Choisis une mise en page, ajoute tes produits, publie. Dinars, wilayas, paiement à la livraison.">
<link rel="stylesheet" href="/landing.css?v=44">
</head>
<body class="lp">
<div class="grain" aria-hidden="true"></div>

<header class="nav">
  <a class="brand" href="/"><span class="bolt">${bolt(13)}</span><b>templifica</b> <em>/ Création de site</em></a>
  <nav>
    <a href="/">Accueil</a>
    <a href="#vitrine">Vitrine</a>
    <a href="#commerce">E-commerce</a>
    <a class="btn btn-pill" href="/signup">${bolt(12)} Créer un site</a>
  </nav>
  <button class="nav-burger" type="button" aria-label="Menu" aria-expanded="false"><span></span><span></span><span></span></button>
</header>

<div class="hero-bg" aria-hidden="true"></div>
<div class="veil"></div>
<div class="stage">
<section class="hero">
  <div class="hero-in">
    <p class="kicker">Pas besoin d'<span class="spin"><b>un freelance.</b><b>un designer.</b><b>une équipe.</b><b>un développeur.</b><b>un freelance.</b></span></p>
    <h1>
      <span class="ln">Crée ton site.</span>
      <span class="ln"><span class="mark hi"><i class="dot bolt">${bolt(15)}</i><em>Vitrine.</em></span></span>
      <span class="ln"><span class="ou">ou même</span><span class="mark hi"><i class="dot shop">${cart()}</i><em>E-commerce.</em></span></span>
    </h1>
    <div class="hero-row">
      <p class="lead">Une vitrine pour présenter. Ou même une boutique qui vend. Tu choisis au départ.</p>
      <div class="proof">
        <span class="faces" aria-hidden="true"><i></i><i></i><i></i></span>
        <span class="rate"><b>4,9 / 5</b> <span class="stars">★★★★★</span><br>Aimé par <strong>5 833</strong> créateurs</span>
      </div>
    </div>
    <div class="actions">
      <a class="btn btn-w" href="#types"><svg width="15" height="15" viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d="M3.2 12.8 12.8 3.2M12.8 3.2H6.4M12.8 3.2v6.4" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/></svg> Les deux types</a>
      <a class="btn btn-d" href="/signup">Créer un site</a>
    </div>
  </div>
</section>

<section class="types" id="types">
  <div class="after-head">
    <p>Les deux types</p>
    <h2>Tu choisis au départ.</h2>
  </div>
  <div class="type-grid">
  <a class="type" id="vitrine" href="/signup">
    <span>Type 01</span>
    <b><i class="dot bolt">${bolt(16)}</i>Vitrine</b>
    <p>Présentation, services, portfolio, prise de contact. Pas de panier.</p>
  </a>
  <a class="type" id="commerce" href="/signup">
    <span>Type 02</span>
    <b><i class="dot shop">${cart()}</i>E-commerce</b>
    <p>Catalogue, panier, dinars, wilayas, paiement à la livraison.</p>
  </a>
  </div>
</section>

<section class="themes" id="themes">
  <header class="themes-head">
    <h2>Les thèmes.</h2>
    <p>Six pour commencer : <b>trois vitrines</b> pour présenter, <b>trois e-commerce</b> pour vendre. Le reste du catalogue t'attend après l'inscription.</p>
  </header>
  ${SHOW.map((g) => `<h3 class="themes-sub">${esc(g.label)} <span>${esc(g.hint)}</span></h3>
  <div class="tf-grid">
    ${g.items.map(card).join("")}
  </div>`).join("")}
</section>
</div>

${t3d()}

<section class="marquee" aria-hidden="true">
  <p>Déjà pensé pour</p>
  <div class="track">
    ${marq()}
  </div>
</section>

<section class="sec" id="comment">
  <h2 class="reveal">De l'idée au lien,<br>dans l'après-midi.</h2>
  <p class="sub reveal">Pas de code, pas de réunions. Tu choisis, tu remplis, tu publies.</p>
  <div class="steps reveal">
    <article>
      <span class="tag">Étape 01</span>
      <h3>Choisir</h3>
      <p>Six mises en page pour commencer. Mode, tech, soin, ou ce que tu vends.</p>
      <div class="step-vis"><img src="/shots/etape-choisir.jpg" alt="Choisir un thème dans NovaDZ"><div class="toast"><i>N</i><span>Le thème est prêt<br>dans ton espace</span></div></div>
    </article>
    <article>
      <span class="tag">Étape 02</span>
      <h3>Remplir</h3>
      <p>Produits, prix, wilayas. Sans photo, le nom et le prix tiennent la place.</p>
      <div class="step-vis"><img src="/shots/etape-remplir.jpg" alt="Ajouter ses produits et ses prix en dinars"></div>
    </article>
    <article>
      <span class="tag">Étape 03</span>
      <h3>Publier</h3>
      <p>Le lien change quand tu publies. Avant ça, c'est encore le brouillon.</p>
      <div class="step-vis"><img src="/shots/etape-publier.jpg?v=2" alt="Publier sa boutique depuis l'éditeur"></div>
    </article>
  </div>
</section>

<section class="sec" style="padding-top:20px">
  <h2 class="reveal lime-title">Crée un site<br>premium.</h2>
  <p class="sub reveal">Le rendu d'une agence, la simplicité d'un outil fait pour toi.</p>
  <div class="bento reveal">
    <article class="bcard" id="slidebox">
      <span class="num">01</span>
      <div class="arrows"><button type="button" id="prev" aria-label="Précédent">‹</button><button type="button" id="next" aria-label="Suivant">›</button></div>
      <div class="slide on">
        <h3>Le niveau agence,<br>sans le prix agence.</h3>
        <p>Une agence facture chaque aller-retour. Ici, un prix fixe, connu d'avance.</p>
        <div class="bars">
          <div class="row"><span>Agence</span><span class="meter" style="--w:88%">jusqu'à 1 000 000 DA</span></div>
          <div class="row"><span>NovaDZ</span><span class="meter hot" style="--w:28%">1 900 DA / mois</span></div>
        </div>
      </div>
      <div class="slide" hidden>
        <h3>En ligne en quelques jours,<br>pas en semaines.</h3>
        <p>Pas de réunions qui s'éternisent : tu publies quand c'est prêt.</p>
        <div class="bars">
          <div class="row"><span>Agence</span><span class="meter" style="--w:80%">4 à 6 semaines</span></div>
          <div class="row"><span>NovaDZ</span><span class="meter hot" style="--w:34%">1 à 2 jours</span></div>
        </div>
      </div>
    </article>
    <article class="bcard">
      <span class="num">02</span>
      <h3>3 gestes,<br>et c'est en ligne.</h3>
      <ul class="checks"><li><i class="dot"></i> Choisir ton thème</li><li><i class="dot"></i> Ajouter tes produits</li><li><i class="dot"></i> Publier en un clic</li></ul>
    </article>
    <article class="bcard">
      <span class="num">03</span>
      <h3>Tout est déjà branché.</h3>
      <p>Catalogue, panier, livraison dans les 58 wilayas et paiement à la livraison. Zéro outil à ajouter, zéro code à écrire.</p>
    </article>
  </div>
  <div class="brow reveal">
    <div class="shotcard"><img src="/shots/carte-dashboard.jpg" alt="Le tableau de bord NovaDZ : chiffre d'affaires et commandes"></div>
    <div class="bcard">
      <h3>Réponse le jour même.</h3>
      <p>Une question sur ta boutique ? Écris-nous : on te répond dans la journée, en français ou en arabe.</p>
    </div>
    <div class="lime">
      <h3>Occupe-toi de vendre,<br>pas du site.</h3>
      <ul>
        <li>Pas de code à toucher</li>
        <li>Couleurs et textes en un clic</li>
        <li>Tes produits, ajoutés par toi-même</li>
      </ul>
    </div>
  </div>
</section>

<section class="sec" style="padding-top:10px">
  <div class="feats reveal">
    <p class="feats-k">Inclus d'office</p>
    <h3>Ce que la mise en page couvre</h3>
    <ul class="feats-grid">
      <li><i class="fcheck"></i><span>Tu modifies sans toucher au code</span></li>
      <li><i class="fcheck"></i><span>Lisible sur téléphone</span></li>
      <li><i class="fcheck"></i><span>Dinars, wilayas, livraison</span></li>
      <li><i class="fcheck"></i><span>Le thème change, les produits restent</span></li>
      <li><i class="fcheck"></i><span>Sans photo, la fiche reste propre</span></li>
      <li><i class="fcheck"></i><span>Le lien public ne bouge qu'à la publication</span></li>
    </ul>
  </div>
</section>

<section class="sec" id="tarifs" style="padding-top:10px">
  <h2 class="reveal">Tes options,<br>côte à côte.</h2>
  <div class="table reveal">
    <div class="tr hd"><span></span><span>NovaDZ</span><span>Agence</span></div>
    <div class="tr"><span>Mise en ligne</span><span>1 à 2 jours</span><span>4 à 16 semaines</span></div>
    <div class="tr"><span>Prix</span><span>Fixe, ou gratuit pour commencer</span><span>Sur devis</span></div>
    <div class="tr"><span>Après la mise en ligne</span><span>Tu modifies toi-même</span><span>Tu les rappelles</span></div>
    <div class="tr"><span>Sur tes ventes</span><span>Aucun pourcentage</span><span>Souvent une commission</span></div>
  </div>
  <div class="prices reveal">
    <article class="pcard">
      <div class="top"><span class="num">01</span><div class="price"><small>dès</small>0 DA</div></div>
      <h3>Pour ouvrir</h3>
      <p>Une boutique, pour voir si ça te va.</p>
      <ul>
        <li>✓ Les mises en page</li>
        <li>✓ Tes produits</li>
        <li>✓ Le lien de brouillon</li>
      </ul>
      <a class="btn btn-d" href="/signup">Commencer</a>
    </article>
    <article class="pcard">
      <div class="top"><span class="num">02</span><div class="price">1 900 <small>DA / mois</small></div></div>
      <h3>Pro <span class="best">Le plus choisi</span></h3>
      <p>Pour une boutique qui tourne.</p>
      <ul>
        <li>✓ Produits sans limite</li>
        <li>✓ Nom de domaine</li>
        <li>✓ Statistiques</li>
        <li>✓ On répond en priorité</li>
      </ul>
      <a class="btn btn-w" href="/signup">Essayer 14 jours</a>
    </article>
  </div>
</section>

<section class="sec">
  <div class="about">
    <div class="frame"><img src="/shots/about-theme.jpg" alt="Adeline, un thème boutique NovaDZ"></div>
    <div>
      <p class="k">Fait pour les vitrines et les boutiques d'ici</p>
      <h2>NovaDZ,<br>pas une agence.</h2>
      <p>Une vitrine pour présenter ton travail, une boutique pour vendre : services, catalogue, panier, wilayas et paiement à la livraison sont déjà là. Tu choisis comment ça se montre. Le reste, c'est ton contenu.</p>
      <p>Une question, elle arrive ici. <a href="mailto:contact@novadz.dz">contact@novadz.dz</a></p>
    </div>
  </div>
</section>

<section class="sec" id="faq">
  <h2 class="reveal">Avant de commencer.</h2>
  <div class="faq reveal">
    <details open>
      <summary>Je peux changer de thème après ?</summary>
      <p>Oui. La mise en page change, tes produits restent. Tu peux en essayer plusieurs avant de publier.</p>
    </details>
    <details>
      <summary>Et si je n'ai pas de photos ?</summary>
      <p>La boutique reste présentable. Le nom et le prix tiennent la place, jusqu'à ce que la photo arrive.</p>
    </details>
    <details>
      <summary>Comment les clients paient ?</summary>
      <p>À la livraison, par défaut. Tu confirmes, tu es payé à la remise du colis.</p>
    </details>
    <details>
      <summary>Vous prenez un pourcentage ?</summary>
      <p>Non. Un abonnement fixe, ou rien tant que tu es sur le gratuit. La vente te reste.</p>
    </details>
  </div>
</section>

<footer class="foot">
  <div class="foot-grid">
    <form class="form" action="/signup" method="get">
      <p class="form-k">La lettre NovaDZ</p>
      <h3>Les nouveautés, sans le bruit.</h3>
      <p class="form-row"><i class="fcheck"></i> Les nouvelles mises en page</p>
      <p class="form-row"><i class="fcheck"></i> On ne vend pas tes ventes</p>
      <input name="email" type="email" placeholder="toi@exemple.dz" aria-label="Email">
      <button class="btn" type="submit">Je m'inscris</button>
      <p class="form-note">Un e-mail de temps en temps. Zéro spam.</p>
    </form>
    <div>
      <p class="foot-big">Ouvre, publie,<br><span>sors du lot.</span></p>
      <div class="cols">
        <div><b>Écrire</b><a href="mailto:contact@novadz.dz">contact@novadz.dz</a></div>
        <div><b>Pages</b><a href="#themes">Thèmes</a><a href="/themes">Catalogue</a><a href="/login">Connexion</a></div>
        <div><b>Offre</b><a href="#tarifs">Tarifs</a><a href="/signup">Créer un site</a></div>
      </div>
    </div>
  </div>
  <div class="foot-bar">
    <span>© 2026 NovaDZ — Vitrines et boutiques, faites en Algérie.</span>
    <span class="foot-tags">Dinars · 58 wilayas · Paiement à la livraison</span>
  </div>
</footer>

<script>
(function () {
  /* Apparition en douceur : transition CSS déclenchée une seule fois,
     dès que l'élément entre dans l'écran (plus d'animation figée). */
  const revealEls = document.querySelectorAll(".reveal")
  if ("IntersectionObserver" in window) {
    const io = new IntersectionObserver((entries) => {
      entries.forEach((e) => { if (e.isIntersecting) { e.target.classList.add("in"); io.unobserve(e.target) } })
    }, { threshold: 0.12, rootMargin: "0px 0px -6% 0px" })
    revealEls.forEach((el) => io.observe(el))
  } else {
    revealEls.forEach((el) => el.classList.add("in"))
  }

  /* Téléphone : les cartes entrent en cascade au fil du défilement.
     Même mécanisme .reveal, ajouté ici pour ne rien changer au bureau :
     chaque enfant d'un groupe reçoit un petit délai (70ms x rang),
     puis les classes sont retirées pour rendre la main aux styles
     propres de la carte (pression tactile, survol). */
  if (window.matchMedia("(max-width:640px)").matches
    && !window.matchMedia("(prefers-reduced-motion: reduce)").matches
    && "IntersectionObserver" in window) {
    const io2 = new IntersectionObserver((entries) => {
      entries.forEach((e) => { if (e.isIntersecting) { e.target.classList.add("in"); io2.unobserve(e.target) } })
    }, { threshold: 0.12, rootMargin: "0px 0px -6% 0px" })
    document.querySelectorAll(".avis-phone,.tf-grid,.type-grid,.steps,.bento,.brow,.feats-grid,.prices,.faq").forEach((groupe) => {
      [...groupe.children].forEach((el, i) => {
        const delai = Math.min(i * 70, 350) + "ms"
        const img = el.classList.contains("tcard") ? el.querySelector("img") : null
        el.classList.add("reveal")
        el.style.transitionDelay = delai
        if (img) img.style.transitionDelay = delai
        el.addEventListener("transitionend", () => {
          el.classList.remove("reveal", "in")
          el.style.transitionDelay = ""
          if (img) img.style.transitionDelay = ""
        }, { once: true })
        io2.observe(el)
      })
    })
  }

  const slides = [...document.querySelectorAll("#slidebox .slide")]
  let i = 0
  const show = (n) => {
    i = (n + slides.length) % slides.length
    slides.forEach((s, k) => { s.hidden = k !== i })
  }
  document.getElementById("next").onclick = () => show(i + 1)
  document.getElementById("prev").onclick = () => show(i - 1)

  const burger = document.querySelector(".nav-burger")
  if (burger) burger.addEventListener("click", () => {
    const open = document.body.classList.toggle("nav-open")
    burger.setAttribute("aria-expanded", open ? "true" : "false")
  })

  /* Témoignages : les colonnes ne tournent que quand la section est visible */
  const t3d = document.querySelector(".t3d")
  if (t3d && "IntersectionObserver" in window) {
    t3d.classList.add("off")
    new IntersectionObserver((entries) => {
      entries.forEach((e) => t3d.classList.toggle("off", !e.isIntersecting))
    }, { threshold: 0.05 }).observe(t3d)
  }

  /* Parallaxe du fond : lissée par requestAnimationFrame (plus de saccades
     à chaque mouvement de souris), et seulement près du haut de page. */
  const bg = document.querySelector(".hero-bg")
  const fine = window.matchMedia("(min-width: 641px)").matches
    && !window.matchMedia("(prefers-reduced-motion: reduce)").matches
  if (bg && fine) {
    let tx = 0, ty = 0, cx = 0, cy = 0, raf = 0
    const tick = () => {
      cx += (tx - cx) * 0.07
      cy += (ty - cy) * 0.07
      bg.style.transform = "scale(1.08) rotate(-1deg) translate(" + cx.toFixed(2) + "px," + cy.toFixed(2) + "px)"
      raf = (Math.abs(tx - cx) > 0.05 || Math.abs(ty - cy) > 0.05) ? requestAnimationFrame(tick) : 0
    }
    window.addEventListener("mousemove", (e) => {
      if (window.scrollY > window.innerHeight * 1.2) return
      tx = (e.clientX / innerWidth - 0.5) * 14
      ty = (e.clientY / innerHeight - 0.5) * 10
      if (!raf) raf = requestAnimationFrame(tick)
    }, { passive: true })
  }
})()
</script>
</body>
</html>`
}

function boltWrap() {
  return `<span class="mark-bolt">${bolt(22)}</span>`
}
function marq() {
  const bits = ["Dinars", "Wilayas", "Livraison", "Français", "WhatsApp", "Catalogue", "Paiement à la remise"]
  const row = bits.map((b) => `<span>${b}</span>`).join("")
  return row + row
}

module.exports = { landing }
