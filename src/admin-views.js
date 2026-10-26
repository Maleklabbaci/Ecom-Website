"use strict"
/**
 * Pages de l'admin NovaDZ. Même coquille que le tableau de bord marchand.
 */
const { esc, money, page, LOGO } = require("./ui")
const { icon } = require("./icons")
const ORD = require("./orders")
const { PLANS, planOf, bytes, uptimeLabel } = require("./platform")
const WORDS = require("./log-words")

const when = (s) => String(s || "").replace("T", " ").slice(0, 16)
const num = (n) => String(Number(n) || 0).replace(/\B(?=(\d{3})+(?!\d))/g, " ")

const flashOf = (q = {}) => {
  if (q.error) return { ok: false, text: String(q.error).slice(0, 400) }
  if (q.ok) return { ok: true, text: String(q.ok).slice(0, 400) }
  if (q.cleaned != null && q.cleaned !== "") {
    const n = parseInt(q.cleaned, 10) || 0
    return {
      ok: true,
      text: n ? `${n} image(s) inutilisée(s) supprimée(s).` : "Aucune image orpheline. Rien à supprimer.",
    }
  }
  return null
}

const qs = (base, obj) => {
  const u = new URLSearchParams()
  for (const [k, v] of Object.entries(obj)) if (v) u.set(k, String(v))
  const s = u.toString()
  return s ? `${base}?${s}` : base
}

const shopPill = (status) => status === "active"
  ? `<span class="pill ok">en ligne</span>`
  : `<span class="pill annulee">suspendue</span>`

const planPill = (id) => `<span class="pill">${esc(planOf(id).label)}</span>`

const orderPill = (row) => {
  const id = ORD.norm(row.status)
  const extra = row.fake ? ` <span class="pill">test</span>` : ""
  return `<span class="pill ${esc(id)}">${esc(ORD.label(row.status))}</span>${extra}`
}

const PERM = {
  orders: "Commandes", products: "Produits", design: "Design",
  shop: "Boutique", settings: "Réglages", team: "Équipe",
}

const permText = (raw) => {
  let list = []
  try { list = JSON.parse(raw || "[]") } catch (_) { list = [] }
  if (!Array.isArray(list) || !list.length) return "aucun droit"
  return list.map((k) => PERM[k] || k).join(", ")
}

const memberMail = (email) => String(email || "").endsWith("@invite.local") ? "Lien d'invitation" : email

const layout = (user, active, title, content, flash, badges = {}) => {
  const on = (id) => (active === id ? " on" : "")
  const pill = (n, tone) => (n ? `<i class="${tone || ""}">${n}</i>` : "")
  const nav = (id, href, ico, label, n, tone) =>
    `<a class="${on(id).trim()}" href="${href}">${icon(ico, 16)} <span>${label}</span>${n ? `<b class="nav-count">${n}</b>` : ""}</a>`
  return page(`Admin NovaDZ — ${title}`, `
<div class="dash">
  <header class="dash-mobile">
    <button type="button" class="dm-burger" id="dashBurger" aria-label="Ouvrir le menu" aria-expanded="false" aria-controls="dashSide">${icon("menu", 19)}</button>
    <a class="dm-mark" href="/admin" aria-label="Admin NovaDZ">N</a>
    <form class="dm-search" action="/admin/boutiques" method="get">
      ${icon("search", 15)}
      <input type="search" name="q" placeholder="Boutique ou e-mail" aria-label="Rechercher une boutique">
    </form>
    <a class="dm-shop" href="/" target="_blank" rel="noopener" aria-label="Voir le site">${icon("external", 16)}</a>
  </header>
  <div class="dash-scrim" id="dashScrim" hidden></div>
  <aside class="dash-side" id="dashSide">
    <button type="button" class="dash-close" id="dashClose" aria-label="Fermer le menu">✕</button>
    <a class="brand" href="/admin">${LOGO}<span>NovaDZ</span></a>
    <div class="dash-store">
      <div class="dash-tile">${icon("shield", 16)}</div>
      <div><b>Admin NovaDZ</b><span>${esc(user.name || "Plateforme")}</span></div>
    </div>
    <nav class="dash-nav">
      <p class="dash-group">Plateforme</p>
      ${nav("home", "/admin", "grid", "Accueil")}
      ${nav("stores", "/admin/boutiques", "store", "Boutiques", badges.suspended)}
      ${nav("themes", "/admin/themes", "palette", "Thèmes")}
      ${nav("accounts", "/admin/comptes", "user", "Comptes")}
      <p class="dash-group">Service</p>
      ${nav("health", "/admin/health", "check", "Santé")}
      ${nav("logs", "/admin/logs", "receipt", "Journal", badges.errors)}
    </nav>
    <div class="dash-foot">
      <a href="/" target="_blank" rel="noopener">${icon("external", 15)} Voir le site</a>
      <a href="/logout">${icon("logout", 15)} Déconnexion</a>
    </div>
  </aside>
  <main class="dash-main">
    ${flash ? `<div class="alert${flash.ok ? " ok" : ""}">${esc(flash.text)}</div>` : ""}
    ${content}
  </main>
  <nav class="app-tab" aria-label="Navigation">
    <a class="${on("home")}" href="/admin">${icon("grid", 20)}<span>Accueil</span></a>
    <a class="${on("stores")}" href="/admin/boutiques">${icon("store", 20)}<span>Boutiques</span>${pill(badges.suspended, "bad")}</a>
    <a class="${on("accounts")}" href="/admin/comptes">${icon("user", 20)}<span>Comptes</span></a>
    <a class="${on("health")}" href="/admin/health">${icon("check", 20)}<span>Santé</span></a>
    <button type="button" id="appMore" class="${["home", "stores", "accounts", "health"].includes(active) ? "" : "on"}">${icon("menu", 20)}<span>Plus</span>${pill(badges.errors, "bad")}</button>
  </nav>
</div>
<script>
(function () {
  var dash = document.querySelector(".dash")
  var side = document.getElementById("dashSide")
  var scrim = document.getElementById("dashScrim")
  var burger = document.getElementById("dashBurger")
  var closeBtn = document.getElementById("dashClose")
  if (!dash || !side) return
  function open(on) {
    dash.classList.toggle("nav-open", on)
    if (burger) burger.setAttribute("aria-expanded", on ? "true" : "false")
    if (scrim) scrim.hidden = !on
    document.body.style.overflow = on ? "hidden" : ""
  }
  if (burger) burger.addEventListener("click", function () { open(!dash.classList.contains("nav-open")) })
  var more = document.getElementById("appMore")
  if (more) more.addEventListener("click", function () { open(true) })
  if (closeBtn) closeBtn.addEventListener("click", function () { open(false) })
  if (scrim) scrim.addEventListener("click", function () { open(false) })
  document.addEventListener("keydown", function (e) { if (e.key === "Escape") open(false) })
  side.addEventListener("click", function (e) { if (e.target.closest("a")) open(false) })
  document.querySelectorAll(".dash table.admin-table").forEach(function (t) {
    var labels = Array.prototype.map.call(t.querySelectorAll("thead th"), function (th) { return th.textContent.trim() })
    t.querySelectorAll("tbody tr").forEach(function (tr) {
      Array.prototype.forEach.call(tr.children, function (td, i) {
        if (td.tagName !== "TD") return
        if (labels[i] && !td.getAttribute("data-label")) td.setAttribute("data-label", labels[i])
      })
    })
  })
})()
</script>`)
}

const head = (title, sub, actions = "") => `
<header class="dash-head">
  <div><h1>${title}</h1>${sub ? `<p class="muted">${sub}</p>` : ""}</div>
  ${actions ? `<div class="admin-actions">${actions}</div>` : ""}
</header>`

const empty = (ico, title, text) =>
  `<div class="empty-state">${icon(ico, 22)}<h3>${title}</h3><p>${text}</p></div>`

const home = (user, data, flash, badges) => layout(user, "home", "Accueil", `
${head("Admin NovaDZ", "Toutes les boutiques. Suspendre ferme la vitrine. Le plan n'encaisse rien.")}
<div class="kpis">
  <div class="kpi"><span>Boutiques</span><b>${data.stores}</b><i>${data.suspended ? `${data.suspended} suspendue(s)` : "toutes en ligne"}</i></div>
  <div class="kpi"><span>Comptes</span><b>${data.accounts}</b><i>${data.merchants} marchand(s)</i></div>
  <div class="kpi"><span>Commandes</span><b>${data.orders}</b><i>hors commandes de test</i></div>
  <div class="kpi"><span>Chiffre d'affaires</span><b>${money(data.revenue)}</b><i>hors annulées et tests</i></div>
</div>
${data.suspended || data.errors || data.empty ? `<section class="panel panel-warn">
  <div class="panel-head"><h2>À regarder</h2></div>
  <div class="fact-list">
    ${data.suspended ? `<div><span>Boutiques suspendues</span><b><a href="/admin/boutiques?status=suspendue">${data.suspended}</a></b></div>` : ""}
    ${data.errors ? `<div><span>Erreurs des dernières 24 h</span><b><a href="/admin/logs?level=error">${data.errors}</a></b></div>` : ""}
    ${data.empty ? `<div><span>Boutiques sans produit</span><b>${data.empty}</b></div>` : ""}
    ${data.domains ? `<div><span>Domaines enregistrés</span><b>${data.domains}</b></div>` : ""}
  </div>
</section>` : ""}
<div class="admin-split">
  <section class="panel">
    <div class="panel-head"><h2>Dernières boutiques</h2><a href="/admin/boutiques">Tout voir</a></div>
    ${data.recentStores.length ? `<table class="table admin-table">
      <thead><tr><th>Boutique</th><th>Plan</th><th>Statut</th></tr></thead>
      <tbody>${data.recentStores.map((s) => `<tr>
        <td><a href="/admin/boutiques/${s.id}"><b>${esc(s.name)}</b></a><div class="muted">${esc(s.owner_name)}</div></td>
        <td>${planPill(s.plan)}</td>
        <td>${shopPill(s.status)}</td>
      </tr>`).join("")}</tbody>
    </table>` : empty("store", "Aucune boutique", "Le premier marchand n'a pas encore créé la sienne.")}
  </section>
  <section class="panel">
    <div class="panel-head"><h2>Dernières commandes</h2></div>
    ${data.recentOrders.length ? `<table class="table admin-table">
      <thead><tr><th>Commande</th><th>Boutique</th><th>Total</th></tr></thead>
      <tbody>${data.recentOrders.map((o) => `<tr>
        <td><b>${esc(o.ref || "#" + o.id)}</b><div class="muted">${esc(o.customer_name)}</div></td>
        <td><a href="/admin/boutiques/${o.store_id}">${esc(o.store_name)}</a></td>
        <td>${money(o.total_cents)} ${orderPill(o)}</td>
      </tr>`).join("")}</tbody>
    </table>` : empty("receipt", "Aucune commande", "Elles apparaîtront ici, toutes boutiques confondues.")}
  </section>
</div>
${data.recentErrors.length ? `<section class="panel">
  <div class="panel-head"><h2>Ce qui s'est passé</h2><a href="/admin/logs">Journal</a></div>
  <div class="log-list">${data.recentErrors.map((r) => {
    const said = WORDS.explain(r)
    return `<a class="log-item" href="/admin/logs/${r.id}">
      <span class="pill ${said.pill}">${esc(said.label)}</span>
      <span class="log-item-body"><b>${esc(said.title)}</b><span>${esc(said.text)}</span></span>
      <i>${esc(WORDS.whenHuman(r.last_at || r.created_at))}</i>
    </a>`
  }).join("")}</div>
</section>` : ""}`, flash, badges)

const storesPage = (user, data, flash, badges) => {
  const f = { q: data.q, status: data.status, plan: data.plan }
  const chip = (href, on, label) => `<a class="chip${on ? " on" : ""}" href="${href}">${label}</a>`
  return layout(user, "stores", "Boutiques", `
${head("Boutiques", `${data.rows.length} affichée(s). La recherche regarde le nom, le lien, l'e-mail et le domaine.`)}
<form class="admin-search" method="get" action="/admin/boutiques">
  ${f.status ? `<input type="hidden" name="status" value="${esc(f.status)}">` : ""}
  ${f.plan ? `<input type="hidden" name="plan" value="${esc(f.plan)}">` : ""}
  <input type="search" name="q" value="${esc(f.q)}" placeholder="Nom, lien, e-mail, domaine" aria-label="Rechercher une boutique">
  <button class="btn btn-primary" type="submit">Chercher</button>
</form>
<div class="tabs-row">
  ${chip(qs("/admin/boutiques", { q: f.q, plan: f.plan }), !f.status, "Toutes")}
  ${chip(qs("/admin/boutiques", { q: f.q, status: "active", plan: f.plan }), f.status === "active", "En ligne")}
  ${chip(qs("/admin/boutiques", { q: f.q, status: "suspendue", plan: f.plan }), f.status === "suspendue", "Suspendues")}
  ${chip(qs("/admin/boutiques", { q: f.q, status: f.status }), !f.plan, "Tous les plans")}
  ${PLANS.map((p) => chip(qs("/admin/boutiques", { q: f.q, status: f.status, plan: p.id }), f.plan === p.id, p.label)).join("")}
</div>
<section class="panel">
  ${data.rows.length ? `<table class="table admin-table">
    <thead><tr><th>Boutique</th><th>Propriétaire</th><th>Plan</th><th>Commandes</th><th>CA</th><th>Statut</th></tr></thead>
    <tbody>${data.rows.map((s) => `<tr>
      <td><a href="/admin/boutiques/${s.id}"><b>${esc(s.name)}</b></a><div class="muted">/${esc(s.slug)}</div></td>
      <td><a href="/admin/comptes/${s.owner_id}">${esc(s.owner_name)}</a><div class="muted">${esc(s.owner_email)}</div></td>
      <td>${planPill(s.plan)}</td>
      <td>${s.order_count}${s.waiting ? `<div class="muted">${s.waiting} en attente</div>` : ""}</td>
      <td>${money(s.revenue)}</td>
      <td>${shopPill(s.status)}</td>
    </tr>`).join("")}</tbody>
  </table>` : empty("store", "Aucune boutique", f.q || f.status || f.plan
    ? "Rien pour cette recherche. Enlève un filtre."
    : "Aucune boutique pour le moment.")}
</section>`, flash, badges)
}

const storePage = (user, row, flash, badges) => {
  const open = row.status === "active"
  const mail = row.smtp_host && row.mail_from ? `prêt · ${row.mail_from}` : "pas configuré"
  const relance = row.msg_provider === "custom" && row.msg_url ? "envoi automatique" : "clic WhatsApp"
  const legal = [row.legal_name, row.legal_rc && `RC ${row.legal_rc}`, row.legal_nif && `NIF ${row.legal_nif}`].filter(Boolean)
  return layout(user, "stores", row.name, `
${head(esc(row.name), `/${esc(row.slug)} · créée le ${esc(when(row.created_at))}`, `
  <form method="post" action="/admin/boutiques/${row.id}/ouvrir"><button class="btn btn-primary" type="submit">Ouvrir son tableau de bord</button></form>
  <a class="btn btn-ghost" href="/${esc(row.slug)}" target="_blank" rel="noopener">Voir la vitrine</a>
  <form method="post" action="/admin/boutiques/${row.id}/statut" onsubmit="return confirm('${open ? "Suspendre cette boutique ? La vitrine se ferme." : "Remettre cette boutique en ligne ?"}')">
    <button class="btn btn-ghost" type="submit">${open ? "Suspendre" : "Réactiver"}</button>
  </form>`)}
<div class="kpis">
  <div class="kpi"><span>Produits</span><b>${row.stats.products}</b></div>
  <div class="kpi"><span>Commandes</span><b>${row.stats.orders}</b><i>${row.stats.waiting} en attente</i></div>
  <div class="kpi"><span>Chiffre d'affaires</span><b>${money(row.stats.revenue)}</b><i>hors annulées et tests</i></div>
  <div class="kpi"><span>Équipe</span><b>${row.stats.team}</b><i>hors propriétaire</i></div>
</div>
<div class="admin-split">
  <section class="panel">
    <div class="panel-head"><h2>Plan</h2>${planPill(row.plan)}</div>
    <form class="inline-form" method="post" action="/admin/boutiques/${row.id}/plan">
      <label>Statut du plan
        <select name="plan" aria-label="Plan">
          ${PLANS.map((p) => `<option value="${p.id}"${row.plan === p.id ? " selected" : ""}>${esc(p.label)} — ${esc(p.price)}</option>`).join("")}
        </select>
      </label>
      <button class="btn btn-primary" type="submit">Enregistrer</button>
    </form>
    <p class="muted">Statut seulement. NovaDZ ne prend pas la carte, et ce plan ne bloque pas encore les ventes. ${esc(planOf(row.plan).hint)}</p>
  </section>
  <section class="panel">
    <div class="panel-head"><h2>État</h2>${shopPill(row.status)}</div>
    <div class="fact-list">
      <div><span>Vitrine</span><b>${open ? "ouverte" : "fermée"}</b></div>
      <div><span>Domaine</span><b>${row.domain ? esc(row.domain) : "pas encore"}</b></div>
      <div><span>E-mails</span><b>${esc(mail)}</b></div>
      <div><span>Relances</span><b>${esc(relance)}</b></div>
      <div><span>Téléphone</span><b>${row.phone ? esc(row.phone) : "—"}</b></div>
      <div><span>Wilaya</span><b>${row.wilaya ? esc(row.wilaya) : "—"}</b></div>
      <div><span>WhatsApp</span><b>${row.whatsapp ? esc(row.whatsapp) : "pas renseigné"}</b></div>
      ${legal.length ? `<div><span>Légal</span><b>${esc(legal.join(" · "))}</b></div>` : ""}
    </div>
    <p class="muted">Le domaine s'affiche ici. Le DNS ne se branche pas depuis cet écran.</p>
  </section>
</div>
<section class="panel">
  <div class="panel-head"><h2>Propriétaire</h2><a href="/admin/comptes/${row.owner_id}">Voir le compte</a></div>
  <div class="fact-list">
    <div><span>Nom</span><b>${esc(row.owner_name)}</b></div>
    <div><span>E-mail</span><b>${esc(row.owner_email)}</b></div>
    <div><span>Identifiant</span><b>${row.owner_login ? esc(row.owner_login) : "—"}</b></div>
    <div><span>Connexion</span><b>${row.owner_blocked ? "bloquée" : "ouverte"}</b></div>
  </div>
</section>
<section class="panel">
  <div class="panel-head"><h2>Équipe</h2></div>
  ${row.team.length ? `<table class="table admin-table">
    <thead><tr><th>Personne</th><th>Accès</th><th>Droits</th></tr></thead>
    <tbody>${row.team.map((m) => `<tr>
      <td><b>${esc(m.name || "Sans nom")}</b><div class="muted">${esc(memberMail(m.email))}${m.login_name ? " · " + esc(m.login_name) : ""}</div></td>
      <td>${m.status === "active" ? `<span class="pill ok">dans l'équipe</span>` : `<span class="pill">lien pas ouvert</span>`}</td>
      <td>${esc(permText(m.perms))}</td>
    </tr>`).join("")}</tbody>
  </table>` : empty("user", "Personne d'autre", "Le propriétaire est seul. Les liens d'équipe apparaîtront ici.")}
</section>
<section class="panel">
  <div class="panel-head"><h2>Dernières commandes</h2></div>
  ${row.orders.length ? `<table class="table admin-table">
    <thead><tr><th>Réf.</th><th>Client</th><th>Total</th><th>Statut</th><th>Date</th></tr></thead>
    <tbody>${row.orders.map((o) => `<tr>
      <td><b>${esc(o.ref || "#" + o.id)}</b></td>
      <td>${esc(o.customer_name)}</td>
      <td>${money(o.total_cents)}</td>
      <td>${orderPill(o)}</td>
      <td class="muted">${esc(when(o.created_at))}</td>
    </tr>`).join("")}</tbody>
  </table>` : empty("receipt", "Aucune commande", "Cette boutique n'a pas encore vendu.")}
</section>`, flash, badges)
}

const accountsPage = (user, data, flash, badges) => {
  const f = { q: data.q, role: data.role }
  const chip = (href, on, label) => `<a class="chip${on ? " on" : ""}" href="${href}">${label}</a>`
  return layout(user, "accounts", "Comptes", `
${head("Comptes", "Marchands et admins. Bloquer empêche la connexion, pas la vitrine.")}
<form class="admin-search" method="get" action="/admin/comptes">
  ${f.role ? `<input type="hidden" name="role" value="${esc(f.role)}">` : ""}
  <input type="search" name="q" value="${esc(f.q)}" placeholder="Nom, e-mail, identifiant" aria-label="Rechercher un compte">
  <button class="btn btn-primary" type="submit">Chercher</button>
</form>
<div class="tabs-row">
  ${chip(qs("/admin/comptes", { q: f.q }), !f.role, "Tous")}
  ${chip(qs("/admin/comptes", { q: f.q, role: "merchant" }), f.role === "merchant", "Marchands")}
  ${chip(qs("/admin/comptes", { q: f.q, role: "admin" }), f.role === "admin", "Admins")}
</div>
<section class="panel">
  ${data.rows.length ? `<table class="table admin-table">
    <thead><tr><th>Nom</th><th>E-mail</th><th>Rôle</th><th>Boutiques</th><th>Connexion</th></tr></thead>
    <tbody>${data.rows.map((u) => `<tr>
      <td><a href="/admin/comptes/${u.id}"><b>${esc(u.name)}</b></a>${u.login_name ? `<div class="muted">${esc(u.login_name)}</div>` : ""}</td>
      <td>${esc(u.email)}</td>
      <td>${u.role === "admin" ? "Admin" : "Marchand"}</td>
      <td>${u.shops}</td>
      <td>${u.blocked ? `<span class="pill annulee">bloqué</span>` : `<span class="pill ok">ouvert</span>`}</td>
    </tr>`).join("")}</tbody>
  </table>` : empty("user", "Aucun compte", "Rien pour cette recherche.")}
</section>`, flash, badges)
}

const accountPage = (user, row, flash, badges) => {
  const self = row.id === user.id
  const blocked = Number(row.blocked) === 1
  return layout(user, "accounts", row.name, `
${head(esc(row.name), `${row.role === "admin" ? "Admin" : "Marchand"} · depuis le ${esc(when(row.created_at))}`, self ? "" : `
  <form method="post" action="/admin/comptes/${row.id}/blocage" onsubmit="return confirm('${blocked ? "Débloquer ce compte ?" : "Bloquer ce compte ? Il ne pourra plus se connecter."}')">
    <input type="hidden" name="blocked" value="${blocked ? "0" : "1"}">
    <button class="btn btn-ghost" type="submit">${blocked ? "Débloquer" : "Bloquer la connexion"}</button>
  </form>`)}
<div class="fact-list panel">
  <div><span>E-mail</span><b>${esc(row.email)}</b></div>
  <div><span>Identifiant</span><b>${row.login_name ? esc(row.login_name) : "—"}</b></div>
  <div><span>Connexion</span><b>${blocked ? "bloquée" : "ouverte"}</b></div>
  ${self ? `<div><span>Toi</span><b>c'est ton compte, il ne se bloque pas ici</b></div>` : ""}
</div>
<section class="panel">
  <div class="panel-head"><h2>Boutiques à lui</h2></div>
  ${row.owned.length ? `<table class="table admin-table">
    <thead><tr><th>Boutique</th><th>Plan</th><th>Statut</th></tr></thead>
    <tbody>${row.owned.map((s) => `<tr>
      <td><a href="/admin/boutiques/${s.id}"><b>${esc(s.name)}</b></a><div class="muted">/${esc(s.slug)}</div></td>
      <td>${planPill(s.plan)}</td>
      <td>${shopPill(s.status)}</td>
    </tr>`).join("")}</tbody>
  </table>` : empty("store", "Aucune boutique", "Ce compte n'est propriétaire d'aucune boutique.")}
</section>
${row.joined.length ? `<section class="panel">
  <div class="panel-head"><h2>Équipes rejointes</h2></div>
  <table class="table admin-table">
    <thead><tr><th>Boutique</th><th>Accès</th></tr></thead>
    <tbody>${row.joined.map((s) => `<tr>
      <td><a href="/admin/boutiques/${s.id}"><b>${esc(s.name)}</b></a></td>
      <td>${s.status === "active" ? "dans l'équipe" : "lien pas ouvert"}</td>
    </tr>`).join("")}</tbody>
  </table>
</section>` : ""}`, flash, badges)
}

const healthPage = (user, info, flash, badges) => {
  const max = Math.max(1, ...info.visits.map((v) => Number(v.n) || 0))
  return layout(user, "health", "Santé", `
${head("Santé", `Le processus tourne depuis ${uptimeLabel(info.uptime)}.`)}
<div class="kpis">
  <div class="kpi"><span>Boutiques</span><b>${info.stores}</b><i>${info.users} comptes</i></div>
  <div class="kpi"><span>Produits</span><b>${info.products}</b><i>${info.reviews} avis</i></div>
  <div class="kpi"><span>Commandes</span><b>${info.orders}</b><i>${info.customers} clients</i></div>
  <div class="kpi"><span>Erreurs 24 h</span><b>${info.errors}</b><i><a href="/admin/logs?level=error">voir en clair</a></i></div>
</div>
<section class="panel">
  <div class="panel-head"><h2>Machine</h2></div>
  <div class="fact-list">
    <div><span>Mémoire</span><b>${bytes(info.rss)}</b></div>
    <div><span>Base</span><b>${bytes(info.dbBytes)}</b></div>
    <div><span>Images</span><b>${info.uploads} fichier(s) · ${bytes(info.uploadBytes)}</b></div>
  </div>
</section>
<section class="panel">
  <div class="panel-head"><h2>Visites, 14 jours</h2></div>
  ${info.visits.length ? `<div class="bars">${info.visits.slice().reverse().map((v) => {
    const h = Math.max(4, Math.round((Number(v.n) / max) * 100))
    return `<div class="bar" title="${esc(v.day)} : ${v.n}"><i style="height:${h}%"></i><span>${esc(String(v.day).slice(5))}</span></div>`
  }).join("")}</div>` : `<p class="muted">Aucune visite enregistrée.</p>`}
</section>
<section class="panel">
  <div class="panel-head"><h2>Images orphelines</h2></div>
  <p class="muted">Supprime les fichiers qui ne sont plus utilisés par un produit, une section ou le design. Les photos encore affichées restent.</p>
  <form method="post" action="/admin/cleanup-uploads" onsubmit="return confirm('Supprimer les images qui ne servent plus ?')">
    <button class="btn btn-primary" type="submit">Nettoyer</button>
  </form>
</section>`, flash, badges)
}

const ago = (t) => {
  const s = Math.max(0, Math.round((Date.now() - t) / 1000))
  if (s < 8) return "à l'instant"
  if (s < 60) return `il y a ${s} secondes`
  if (s < 3600) return `il y a ${Math.round(s / 60)} min`
  return `il y a ${Math.round(s / 3600)} h`
}
const logQs = (data, extra = {}) => qs("/admin/logs", {
  q: data.q || undefined,
  level: data.level || undefined,
  span: data.span && data.span !== "24h" ? data.span : undefined,
  ...extra,
})

const logsPage = (user, data, flash, badges) => {
  const chip = (href, on, label) => `<a class="chip${on ? " on" : ""}" href="${href}">${label}</a>`
  const keep = { q: data.q, level: data.level, span: data.span }
  const state = WORDS.statusOf(data.summary || {})
  const live = (data.recent || [])
    .filter((r) => !String(r.path || "").startsWith("/admin/logs"))
    .slice(0, 6)
    .map((r) => {
      const said = WORDS.livePlain(r)
      return `<li>
        <span><b>${esc(said.sentence)}</b></span>
        <span class="muted">${esc(ago(r.at))} · <span class="pill ${said.pill}">${esc(said.label)}</span></span>
      </li>`
    }).join("")
  const groups = []
  for (const r of data.rows) {
    const said = WORDS.explain(r)
    const last = groups[groups.length - 1]
    const n = Number(r.hits) || 1
    if (last && last.title === said.title) {
      last.n += n
      continue
    }
    groups.push({ ...said, id: r.id, when: r.last_at || r.created_at, n })
  }
  const rows = groups.map((g) => `<a class="log-item" href="/admin/logs/${g.id}">
      <span class="pill ${g.pill}">${esc(g.label)}</span>
      <span class="log-item-body"><b>${esc(g.title)}</b><span>${esc(g.text)}</span></span>
      <i>${esc(WORDS.whenHuman(g.when))}<br>${esc(WORDS.times(g.n))}</i>
    </a>`).join("")
  return layout(user, "logs", "Journal", `
${head("Journal", "En clair. Ce qui s'est passé, et si tu dois t'en occuper.")}
<section class="panel log-status ${state.tone}">
  <h2>${esc(state.title)}</h2>
  <p>${esc(state.text)}${state.href ? ` <a href="${state.href}">${esc(state.link || "Voir")}</a>` : ""}</p>
</section>
<section class="panel">
  <div class="panel-head"><h2>En ce moment</h2><a href="${logQs(keep)}">Actualiser</a></div>
  ${live ? `<ul class="log-feed">${live}</ul>` : `<p class="muted">Personne n'a ouvert de page depuis le démarrage. Dès qu'un client ou un marchand arrive, tu le verras ici.</p>`}
</section>
<form class="admin-search" method="get" action="/admin/logs">
  ${data.level ? `<input type="hidden" name="level" value="${esc(data.level)}">` : ""}
  ${data.span && data.span !== "24h" ? `<input type="hidden" name="span" value="${esc(data.span)}">` : ""}
  <input type="search" name="q" value="${esc(data.q)}" placeholder="Une boutique, une commande…" aria-label="Chercher dans le journal">
  <button class="btn btn-primary" type="submit">Chercher</button>
</form>
<div class="tabs-row">
  ${chip(logQs(keep, { level: undefined }), !data.level, "Tout")}
  ${chip(logQs(keep, { level: "error" }), data.level === "error", "Problèmes")}
  ${chip(logQs(keep, { level: "warn" }), data.level === "warn", "À surveiller")}
  ${chip(logQs(keep, { level: "slow" }), data.level === "slow", "Pages lentes")}
  ${chip(logQs(keep, { level: "info" }), data.level === "info", "Activité normale")}
</div>
<div class="tabs-row">
  ${chip(logQs(keep, { span: undefined }), data.span === "24h", "Aujourd'hui")}
  ${chip(logQs(keep, { span: "7d" }), data.span === "7d", "Cette semaine")}
  ${chip(logQs(keep, { span: "all" }), data.span === "all", "Depuis le début")}
</div>
<section class="panel">
  <div class="panel-head"><h2>Ce qui est arrivé</h2><span class="muted">Clique une ligne pour comprendre.</span></div>
  ${rows || empty("receipt", "Rien sur cette période", "C'est plutôt bon signe. Les jours d'avant sont sous « Depuis le début ».")}
  <div class="log-actions">
    ${data.before ? `<a class="btn btn-ghost" href="${logQs(keep)}">Les plus récentes</a>` : ""}
    ${data.more ? `<a class="btn btn-ghost" href="${logQs(keep, { before: data.next })}">Plus anciennes</a>` : ""}
  </div>
</section>
<details class="log-clean">
  <summary>Effacer des messages</summary>
  <p class="muted">Les messages de plus de 14 jours partent tout seuls. Tu peux aussi les enlever maintenant, ou tout effacer.</p>
  <form method="post" action="/admin/logs/prune"><button class="btn btn-ghost" type="submit">Enlever les vieux</button></form>
  <form method="post" action="/admin/logs/clear" onsubmit="return confirm('Tout effacer ? Tu ne pourras plus relire ce qui s\\'est passé.')"><button class="btn btn-ghost" type="submit">Tout effacer</button></form>
</details>`, flash, badges)
}

const logPage = (user, row, meta, flash, badges) => {
  const said = WORDS.explain(row)
  const where = WORDS.pageName(WORDS.pathOf(row), row.method)
  const tech = [row.message, meta && meta.raw, meta && meta.stack, ...(meta && meta.fields || []).map(([k, v]) => k + " : " + v)]
    .filter(Boolean)
    .join("\n\n")
  return layout(user, "logs", "Journal", `
${head("Journal", "", `<a class="btn btn-ghost" href="/admin/logs">Retour</a>`)}
<section class="panel log-status ${said.tone}">
  <p class="log-ask">Est-ce grave ?</p>
  <h2>${esc(said.label)}</h2>
  <p>${esc(said.text)}</p>
</section>
<section class="panel">
  <h2 class="log-message">${esc(said.title)}</h2>
  <div class="fact-list">
    <div><span>Quand</span><b>${esc(WORDS.whenHuman(row.last_at || row.created_at))}</b></div>
    <div><span>Combien de fois</span><b>${esc(WORDS.times(row.hits))}</b></div>
    ${row.path || row.method ? `<div><span>Où</span><b>${esc(where)}</b></div>` : ""}
    ${row.store_id ? `<div><span>Boutique</span><b><a href="/admin/boutiques/${row.store_id}">${esc(row.store_name || row.store_slug || "Voir la boutique")}</a></b></div>` : ""}
  </div>

  ${tech ? `<details class="log-tech"><summary>Le texte technique, si tu dois le montrer à quelqu'un</summary><pre class="log-stack">${esc(tech)}</pre></details>` : ""}
</section>`, flash, badges)
}


const themeDots = (row) => {
  const dots = Array.isArray(row.dots) && row.dots.length ? row.dots : [row.bg, row.accent, row.ink]
  return dots.filter(Boolean).map((d) => `<span class="pt-dot" style="background:${esc(d)}"></span>`).join("")
}
const shopPhrase = (n, one, many) => (Number(n) === 1 ? `1 boutique ${one}` : `${Number(n) || 0} boutiques ${many}`)

const themeFields = (themes, row) => {
  const sel = row ? row.base : "atelier"
  const opts = themes.map((t) => `<option value="${esc(t.id)}"${t.id === sel ? " selected" : ""}>${esc(t.name)}</option>`).join("")
  return `
    <label>Nom<input name="name" required maxlength="40" value="${esc(row ? row.name : "")}" placeholder="Nom du thème" autocomplete="off"></label>
    <label>Description<textarea name="blurb" rows="3" maxlength="180" placeholder="Ce que le marchand doit savoir avant de le choisir.">${esc(row ? row.blurb : "")}</textarea></label>
    <label>Mise en page
      <select name="base">${opts}</select>
    </label>
    <div class="pt-colors">
      <label>Fond<input type="color" name="bg" value="${esc(row ? row.bg : "#FFFFFF")}"></label>
      <label>Accent<input type="color" name="accent" value="${esc(row ? row.accent : "#111111")}"></label>
      <label>Texte<input type="color" name="ink" value="${esc(row ? row.ink : "#111111")}"></label>
    </div>`
}

const themeStyle = () => `<style>
.pt-colors{display:flex;gap:16px;flex-wrap:wrap;margin:14px 0 16px}
.pt-colors label{font-size:12.5px}
.pt-colors input{display:block;width:64px;height:36px;padding:2px;border:1px solid var(--line);background:#fff;margin-top:6px}
.pt-dot{display:inline-block;width:14px;height:14px;border-radius:50%;border:1px solid rgba(0,0,0,.15);vertical-align:middle;margin-right:4px}
.pt-acts{display:flex;gap:6px;align-items:center;flex-wrap:nowrap}
.pt-acts form{margin:0}
.pt-acts .btn,.pt-acts a.btn{white-space:nowrap}
.pt-shot{display:block;width:148px;height:96px;overflow:hidden;border:1px solid #E4E4E7;border-radius:8px;background:#fff}
.pt-shot iframe{width:1280px;height:820px;border:0;transform:scale(.115);transform-origin:top left;pointer-events:none}
.pt-live{margin:0 0 16px;border:1px solid var(--line);border-radius:12px;overflow:hidden;background:#fff}
.pt-live-bar{display:flex;justify-content:space-between;align-items:center;gap:12px;padding:10px 14px;border-bottom:1px solid var(--line);font-size:13px}
.pt-live iframe{display:block;width:100%;height:720px;border:0;background:#fff}
</style>`

const themesPage = (user, rows, themes, flash, badges, platform = []) => {
  const baseName = (id) => {
    const t = themes.find((x) => x.id === id)
    return t ? t.name : id
  }
  const body = rows.length ? `<table class="table admin-table">
    <thead><tr><th>Thème</th><th>Mise en page</th><th>Couleurs</th><th>Statut</th><th></th></tr></thead>
    <tbody>${rows.map((row) => `<tr>
      <td><a href="/admin/themes/${row.id}"><b>${esc(row.name)}</b></a>${row.blurb ? `<div class="muted">${esc(row.blurb)}</div>` : ""}</td>
      <td>${esc(baseName(row.base))}</td>
      <td>${themeDots(row)}</td>
      <td>${row.status === "public" ? `<span class="pill ok">public</span>` : `<span class="pill">brouillon</span>`}</td>
      <td><div class="pt-acts">
        <a class="btn btn-ghost btn-sm" href="/admin/themes/${row.id}">Modifier</a>
        ${row.status === "public"
          ? `<form method="post" action="/admin/themes/${row.id}/hide"><button class="btn btn-ghost btn-sm" type="submit">Retirer</button></form>`
          : `<form method="post" action="/admin/themes/${row.id}/public"><button class="btn btn-primary btn-sm" type="submit">Partager</button></form>`}
        <form method="post" action="/admin/themes/${row.id}/delete" onsubmit="return confirm('Retirer ce thème ? Les boutiques déjà publiées ne changent pas.')"><button class="link-danger" type="submit">Supprimer</button></form>
      </div></td>
    </tr>`).join("")}</tbody>
  </table>` : empty("palette", "Aucun thème", "Crée le premier. Il reste en brouillon tant que tu ne le partages pas.")
  return layout(user, "themes", "Thèmes", `
${themeStyle()}
${head("Thèmes", "Tu modifies les thèmes déjà en ligne, et tu peux en créer d'autres. Tant qu'un marchand n'a pas changé les couleurs, c'est le même thème.", `<a class="btn btn-ghost" href="/themes" target="_blank" rel="noopener">${icon("external", 15)} Page publique</a>`)}
<section class="panel">
  <div class="panel-head"><h2>Nouveau thème</h2></div>
  <form class="form" method="post" action="/admin/themes">
    ${themeFields(themes)}
    <button class="btn btn-primary" type="submit">Créer le brouillon</button>
  </form>
  <p class="muted">La mise en page est celle d'un thème déjà en place. Tu choisis le nom, le texte et les couleurs. Partager ne change aucune boutique : le marchand ouvre un essai, puis publie. Modifier un thème public met à jour les boutiques qui ne l'ont pas encore touché.</p>
</section>
<section class="panel">
  <div class="panel-head"><h2>Déjà en ligne</h2></div>
  <p class="muted">Tous les thèmes déjà publiés. Modifier change le nom, le texte, les couleurs et la mise en page. Les boutiques qui n'ont pas changé les couleurs reçoivent le changement.</p>
  ${platform.length ? `<table class="table admin-table">
    <thead><tr><th>Aperçu</th><th>Thème</th><th>Couleurs</th><th>Boutiques</th><th></th></tr></thead>
    <tbody>${platform.map((row) => `<tr>
      <td><a class="pt-shot" href="/admin/themes/apercu/${esc(row.id)}" target="_blank" rel="noopener" title="Aperçu de ${esc(row.name)}"><iframe src="/admin/themes/apercu/${esc(row.id)}" loading="lazy" tabindex="-1" title="Aperçu ${esc(row.name)}"></iframe></a></td>
      <td><a href="/admin/themes/plateforme/${esc(row.id)}"><b>${esc(row.name)}</b></a><div class="muted">${esc(row.blurb)}</div></td>
      <td>${themeDots(row)}</td>
      <td>${row.shops ? row.shops : "—"}</td>
      <td><div class="pt-acts"><a class="btn btn-ghost btn-sm" href="/admin/themes/plateforme/${esc(row.id)}">Modifier</a></div></td>
    </tr>`).join("")}</tbody>
  </table>` : ""}
</section>
<section class="panel">
  <div class="panel-head"><h2>Créés ici</h2></div>
  ${body}
</section>`, flash, badges)
}

const themeEditPage = (user, row, themes, flash, badges, usage = { follow: 0, fork: 0 }) => {
  const rule = row.status === "public"
    ? `Public. Tu peux le modifier. ${usage.follow ? shopPhrase(usage.follow, "a encore ce thème : elle reçoit le changement.", "ont encore ce thème : elles reçoivent le changement.") : "Aucune boutique ne l'a encore pris tel quel."} ${usage.fork ? shopPhrase(usage.fork, "l'a modifié : ce n'est plus le même thème, elle ne bouge pas.", "l'ont modifié : ce n'est plus le même thème, elles ne bougent pas.") : ""}`
    : "Brouillon. Personne d'autre ne le voit. Tu peux le modifier avant de le partager."
  return layout(user, "themes", row.name, `
${themeStyle()}
${head(esc(row.name), rule, `<a class="btn btn-ghost" href="/admin/themes">Retour</a>`)}
<section class="panel">
  <div class="panel-head"><h2>Modifier</h2>${row.status === "public" ? `<span class="pill ok">public</span>` : `<span class="pill">brouillon</span>`}</div>
  <form class="form" method="post" action="/admin/themes/${row.id}">
    ${themeFields(themes, row)}
    <button class="btn btn-primary" type="submit">Enregistrer</button>
  </form>
  <p class="muted">Tant que le marchand n'a pas changé les couleurs ni la mise en page, c'est le même thème. S'il les a changés, sa boutique reste comme il l'a laissée.</p>
  <div class="pt-acts" style="margin-top:16px">
    ${row.status === "public"
      ? `<form method="post" action="/admin/themes/${row.id}/hide"><button class="btn btn-ghost" type="submit">Retirer du public</button></form>`
      : `<form method="post" action="/admin/themes/${row.id}/public"><button class="btn btn-primary" type="submit">Partager en public</button></form>`}
    <form method="post" action="/admin/themes/${row.id}/delete" onsubmit="return confirm('Retirer ce thème ? Les boutiques déjà publiées ne changent pas.')"><button class="link-danger" type="submit">Supprimer</button></form>
  </div>
</section>`, flash, badges)
}

const builtinEditPage = (user, row, themes, flash, badges, usage = { follow: 0, fork: 0 }) => {
  const opts = themes.map((t) => `<option value="${esc(t.id)}"${t.id === row.layout ? " selected" : ""}>${esc(t.name)}</option>`).join("")
  return layout(user, "themes", row.name, `
${themeStyle()}
${head(esc(row.name), `Déjà en ligne. ${usage.follow ? shopPhrase(usage.follow, "a encore ce thème.", "ont encore ce thème.") : "Aucune boutique ne l'a publié tel quel."} ${usage.fork ? shopPhrase(usage.fork, "a changé les couleurs : elle ne bouge pas.", "ont changé les couleurs : elles ne bougent pas.") : ""}`, `<a class="btn btn-ghost" href="/admin/themes">Retour</a>`)}
<section class="panel">
  <div class="panel-head"><h2>Aperçu</h2><a href="/admin/themes/apercu/${esc(row.layout)}" target="_blank" rel="noopener">Ouvrir</a></div>
  <div class="pt-live">
    <div class="pt-live-bar"><span>La vitrine, avec les articles d'une boutique. Pas une maquette.</span></div>
    <iframe id="ptPreview" src="/admin/themes/apercu/${esc(row.layout)}" title="Aperçu du thème ${esc(row.name)}"></iframe>
  </div>
</section>
<section class="panel">
  <div class="panel-head"><h2>Modifier</h2><span class="pill ok">en ligne</span></div>
  <form class="form" method="post" action="/admin/themes/plateforme/${esc(row.id)}">
    <label>Nom<input name="name" required maxlength="40" value="${esc(row.name)}" autocomplete="off"></label>
    <label>Description<textarea name="blurb" rows="3" maxlength="180">${esc(row.blurb)}</textarea></label>
    <label>Mise en page
      <select name="base">${opts}</select>
    </label>
    <div class="pt-colors">
      <label>Fond<input type="color" name="bg" value="${esc(row.bg)}"></label>
      <label>Accent<input type="color" name="accent" value="${esc(row.accent)}"></label>
      <label>Texte<input type="color" name="ink" value="${esc(row.ink)}"></label>
    </div>
    <button class="btn btn-primary" type="submit">Enregistrer</button>
  </form>
  <p class="muted">Changer la mise en page change la boutique des marchands qui n'ont pas touché les couleurs. S'ils les ont changées, leur boutique reste comme ils l'ont laissée.</p>
</section>
<script>
(function () {
  var sel = document.querySelector("select[name=base]")
  var frame = document.getElementById("ptPreview")
  if (!sel || !frame) return
  sel.addEventListener("change", function () {
    frame.src = "/admin/themes/apercu/" + sel.value
  })
})()
</script>`, flash, badges)
}

module.exports = {
  flashOf, home, storesPage, storePage, accountsPage, accountPage, healthPage, logsPage, logPage,
  themesPage, themeEditPage, builtinEditPage,
}
