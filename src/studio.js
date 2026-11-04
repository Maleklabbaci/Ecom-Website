"use strict"
/**
 * Studio : édition visuelle d'un template « site complet ».
 * Le marchand modifie une copie du HTML du template (texte, images, styles, blocs).
 * Brouillon et version en ligne sont séparés : rien n'est public avant « Publier ».
 * Le HTML enregistré est assaini ici, et la page publique est en plus servie avec
 * une CSP qui interdit tout script (voir site-templates.CSP).
 */
const fs = require("fs")
const path = require("path")
const db = require("./db")
const SITES = require("./site-templates")

db.exec(`
/* En-tête et pied de page communs à toutes les pages d'un site.
   Pourquoi une table à part ? Un débutant change son menu une fois : il ne
   doit pas avoir à le refaire sur chaque page. La page « d'origine » n'est pas
   modifiée en base : c'est à la lecture qu'on applique le même en-tête partout,
   donc retirer le partage rend à chaque page son propre en-tête. */
CREATE TABLE IF NOT EXISTS studio_shared (
  store_id   INTEGER NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  template   TEXT NOT NULL,
  kind       TEXT NOT NULL,
  html       TEXT NOT NULL DEFAULT '',
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (store_id, template, kind)
);

CREATE TABLE IF NOT EXISTS studio_site_pages (
  store_id   INTEGER NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  pkey       TEXT NOT NULL,
  name       TEXT NOT NULL DEFAULT '',
  template   TEXT NOT NULL,
  draft      TEXT NOT NULL DEFAULT '',
  live       TEXT NOT NULL DEFAULT '',
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (store_id, pkey)
);
`)

const MAX = 6 * 1024 * 1024
const PUB = path.join(__dirname, "..", "public")
/* seuls les fichiers JS déjà présents dans public/templates/<id>/js/ (posés par l'importateur, jamais par un marchand) */
const TPL_JS = /^\/templates\/[a-z][a-z0-9-]{0,29}\/js\/[\w.-]+\.m?js$/
const tplJsOk = (src) => TPL_JS.test(src) && fs.existsSync(path.join(PUB, src))

const FRAME_CSP = [
  "default-src 'self'", "script-src 'self'", "style-src 'self' 'unsafe-inline'",
  "img-src * data: blob:", "font-src * data:", "media-src * data: blob:",
  "object-src 'none'", "base-uri 'none'", "form-action 'none'", "frame-src https://www.youtube-nocookie.com",
].join("; ")

/** Retire tout ce qui peut exécuter du code. Boucle jusqu'à stabilité (balises imbriquées). */
const sanitize = (input) => {
  let s = String(input == null ? "" : input)
  if (!s || s.length > MAX) return null
  const keep = []
  s = s.replace(/<script\b[^>]*type="text\/ndz-off"[^>]*data-ndz-src="([^"]+)"[^>]*>\s*<\/script>/gi, (m, src) => {
    if (!tplJsOk(src)) return ""
    keep.push(`<script ${/data-ndz-mod="1"/.test(m) ? 'type="module" ' : ""}defer src="${src}"></script>`)
    return `\u0000NDZJS${keep.length - 1}\u0000`
  })
  const BAD = "iframe|object|embed|applet|frame|frameset|base|noscript|template"
  for (let i = 0, prev = ""; s !== prev && i < 8; i++) {
    prev = s
    s = s
      .replace(/<script\b[\s\S]*?<\/script\s*>/gi, "")
      .replace(/<\/?script\b[^>]*>/gi, "")
      .replace(new RegExp(`<(${BAD})\\b[\\s\\S]*?<\\/\\1\\s*>`, "gi"), "")
      .replace(new RegExp(`<\\/?(${BAD})\\b[^>]*>`, "gi"), "")
      .replace(/<meta\b[^>]*http-equiv[^>]*>/gi, "")
      .replace(/<link\b[^>]*>/gi, (m) => {
        const h = /href\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/i.exec(m) || []
        const href = String(h[1] ?? h[2] ?? h[3] ?? "").trim()
        const ok = /^(\/(?!\/)|data:image\/)/i.test(href) && /rel\s*=\s*["']?(stylesheet|icon|shortcut)/i.test(m)
        return ok ? m : ""
      })
      .replace(/(<[a-z][^>]*?)\s+on[a-z0-9_-]+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi, "$1")
      .replace(/(<[a-z][^>]*?)\s+(?:srcdoc|formaction|action)\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi, "$1")
      .replace(/\b(href|src|xlink:href|poster|background|data)\s*=\s*(["'])\s*(?:[^"']*?(?:&#|&colon;|&tab;|&newline;))[^"']*\2/gi, '$1="#"')
      .replace(/\b(href|src|xlink:href|poster|background|data)\s*=\s*(["']?)\s*(?:javascript|vbscript|livescript|data\s*:\s*(?:text|application))[^"'>\s]*\2/gi, '$1="#"')
      .replace(/@import[^;{}]*;?/gi, "")
      .replace(/expression\s*\(/gi, "x(")
      .replace(/-moz-binding\s*:/gi, "x:")
      .replace(/behavior\s*:/gi, "x:")
      .replace(/url\(\s*["']?\s*(?:javascript|vbscript):/gi, "url(about:")
  }
  if (!/<html\b/i.test(s) || !/<body\b/i.test(s)) return null
  return s.replace(/\u0000NDZJS(\d+)\u0000/g, (m, i) => keep[+i] || "")
}

const KEY = /^[a-z0-9-]{1,40}$/
const MAX_PAGES = 40
const isKey = (k) => typeof k === "string" && KEY.test(k)
const row = (storeId, tpl, key) => {
  const r = db.prepare("SELECT * FROM studio_site_pages WHERE store_id = ? AND pkey = ?").get(storeId, key)
  return r && r.template === tpl ? r : null
}

const saveDraft = (storeId, tpl, key, html, name) => {
  const r = db.prepare("SELECT * FROM studio_site_pages WHERE store_id = ? AND pkey = ?").get(storeId, key)
  if (!r) db.prepare("INSERT INTO studio_site_pages (store_id, pkey, name, template, draft) VALUES (?, ?, ?, ?, ?)").run(storeId, key, name || (key === "home" ? "Accueil" : key), tpl, html)
  else if (r.template !== tpl) db.prepare("UPDATE studio_site_pages SET template = ?, draft = ?, live = '', updated_at = datetime('now') WHERE store_id = ? AND pkey = ?").run(tpl, html, storeId, key)
  else db.prepare("UPDATE studio_site_pages SET draft = ?, updated_at = datetime('now') WHERE store_id = ? AND pkey = ?").run(html, storeId, key)
  remember(storeId, tpl, html)
}

/** Publie toutes les pages qui ont un brouillon. Renvoie le nombre de pages publiées. */
const publishAll = (storeId, tpl) =>
  Number(db.prepare("UPDATE studio_site_pages SET live = draft, updated_at = datetime('now') WHERE store_id = ? AND template = ? AND draft != ''").run(storeId, tpl).changes)

const reset = (storeId, key = "home") => db.prepare("DELETE FROM studio_site_pages WHERE store_id = ? AND pkey = ?").run(storeId, key)

/** « Revenir à ce que voient mes clients » : le brouillon reprend la version
 *  en ligne, page par page. C'est la sortie de secours quand un débutant s'est
 *  perdu : il retrouve sous ses yeux exactement ce que voient ses clients,
 *  sans rien republier. Les pages jamais publiées ne bougent pas. */
const revertLive = (storeId, tpl) =>
  Number(db.prepare("UPDATE studio_site_pages SET draft = live, updated_at = datetime('now') WHERE store_id = ? AND template = ? AND live != '' AND draft != live").run(storeId, tpl).changes)

/* ------------------------- en-tête / pied communs ------------------------- */
const HEADER_RE = /<header\b[^>]*>[\s\S]*?<\/header>/i
const FOOTER_RE = /<footer\b[^>]*>[\s\S]*?<\/footer>/i
const NAV_RE = /<nav\b[^>]*>[\s\S]*?<\/nav>/i
const BLOCK_RE = { header: [HEADER_RE, NAV_RE], footer: [FOOTER_RE] }

/** Extrait l'en-tête (ou le pied) d'une page. "" quand la page n'en a pas. */
const pick = (html, kind) => {
  for (const re of BLOCK_RE[kind] || []) {
    const m = String(html || "").match(re)
    if (m) return m[0]
  }
  return ""
}

const sharedOf = (storeId, tpl) => {
  const rows = db.prepare("SELECT kind, html FROM studio_shared WHERE store_id = ? AND template = ?").all(storeId, tpl)
  const out = { header: "", footer: "" }
  for (const r of rows) if (r.kind in out) out[r.kind] = r.html || ""
  return out
}

/** Mémorise l'en-tête et le pied de la page qu'on vient d'enregistrer.
    Seulement s'ils existent : on n'efface jamais un partage par accident. */
const remember = (storeId, tpl, html) => {
  for (const kind of ["header", "footer"]) {
    const block = pick(html, kind)
    if (!block) continue
    db.prepare(`INSERT INTO studio_shared (store_id, template, kind, html, updated_at)
      VALUES (?, ?, ?, ?, datetime('now'))
      ON CONFLICT(store_id, template, kind) DO UPDATE SET html = excluded.html, updated_at = excluded.updated_at`)
      .run(storeId, tpl, kind, block)
  }
}

/** Remplace l'en-tête et le pied d'une page par la version commune. */
const applyShared = (storeId, tpl, html) => {
  const shared = sharedOf(storeId, tpl)
  let out = html
  for (const kind of ["header", "footer"]) {
    const block = shared[kind]
    if (!block) continue
    for (const re of BLOCK_RE[kind]) {
      if (re.test(out)) { out = out.replace(re, () => block); break }
    }
  }
  return out
}

const forgetShared = (storeId, tpl) =>
  db.prepare("DELETE FROM studio_shared WHERE store_id = ? AND template = ?").run(storeId, tpl)

/** mode : edit · draft (brouillon sinon en ligne) · live. "" = HTML d'origine du template (accueil seulement). */
const html = (storeId, tpl, key = "home", mode = "live") => {
  const r = row(storeId, tpl, key)
  if (!r) return ""
  const raw = mode === "live" ? r.live || "" : r.draft || r.live || ""
  return raw ? applyShared(storeId, tpl, raw) : raw
}

const list = (storeId, tpl) => {
  const rows = db.prepare("SELECT pkey, name, draft, live FROM studio_site_pages WHERE store_id = ? AND template = ? ORDER BY updated_at").all(storeId, tpl)
  const out = [{ key: "home", name: "Accueil", live: false }]
  for (const tp of SITES.pages(tpl)) out.push({ key: tp.key, name: tp.name, live: false })
  for (const r of rows) {
    const known = out.find((o) => o.key === r.pkey)
    if (known) { known.live = !!r.live; if (r.name) known.name = r.name; continue }
    if (r.pkey === "home") { out[0].live = !!r.live; continue }
    out.push({ key: r.pkey, name: r.name || r.pkey, live: !!r.live })
  }
  return out
}

const fold = (s) => String(s || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 30)

const createPage = (storeId, tpl, name, baseHtml) => {
  const have = list(storeId, tpl)
  if (have.length >= MAX_PAGES) return { ok: false, error: `${MAX_PAGES} pages maximum.` }
  const clean = String(name || "").trim().slice(0, 40)
  if (!clean) return { ok: false, error: "Donne un nom à la page." }
  let key = fold(clean) || "page", n = 1
  while (key === "home" || have.some((p) => p.key === key)) key = `${fold(clean) || "page"}-${++n}`
  saveDraft(storeId, tpl, key, baseHtml, clean)
  return { ok: true, key }
}

const deletePage = (storeId, key) => (key === "home" || !isKey(key) ? 0 : Number(reset(storeId, key).changes))

const status = (storeId, tpl) => {
  const rows = db.prepare("SELECT draft, live FROM studio_site_pages WHERE store_id = ? AND template = ?").all(storeId, tpl)
  return { edited: rows.length > 0, published: rows.some((r) => r.live), unpublished: rows.some((r) => r.draft && r.draft !== r.live) }
}

const esc = (s) =>
  String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]))

/** Coque du studio : tout le reste est dans /_studio/studio.js.
 *  En arabe, la page passe en écriture de droite à gauche et la table de
 *  traduction est envoyée avec : le Studio se dessine dans le navigateur. */
const page = (store, tpl, st) => {
  /* La langue de l'atelier suit celle du tableau de bord (cookie `ndz_ui`,
     bouton FR / ع), et retombe sur la langue de la vitrine : un marchand qui
     travaille en arabe ne doit pas retrouver un Studio en français. */
  const lang = require("./ui-ar").langNow() || require("./i18n").langNow(store)
  const ar = lang === "ar"
  const ARF = require("./fonts-ar")
  return `<!doctype html>
<html lang="${ar ? "ar" : "fr"}" dir="${ar ? "rtl" : "ltr"}"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${ar ? "الاستوديو" : "Studio"} — ${esc(store.name)}</title>
<link rel="stylesheet" href="/inter-font.css">
<link rel="stylesheet" href="/arabic-fonts.css">
<link rel="stylesheet" href="/_studio/studio.css?v=3">
${ar ? `<style>body.ar,body.ar h1,body.ar h2,body.ar h3,body.ar h4,body.ar button,body.ar input,body.ar textarea{font-family:${ARF.uiStack()}}</style>` : ""}
</head><body${ar ? ' class="ar"' : ""}>
<div id="st" data-slug="${esc(store.slug)}" data-name="${esc(store.name)}" data-tpl="${esc(tpl.id)}" data-tpl-name="${esc(tpl.name)}" data-edited="${st.edited ? 1 : 0}" data-published="${st.published ? 1 : 0}" data-unpublished="${st.unpublished ? 1 : 0}" data-lang="${lang}" data-ar-font="${esc(ARF.of(store).id)}" data-prix="${esc((() => { try { const d = JSON.parse(store.design || "{}"); return /^#[0-9a-f]{6}$/i.test(d.prix || "") ? d.prix : "" } catch (_) { return "" } })())}"></div>
${ar ? `<script id="st-ar" type="application/json">${JSON.stringify(require("./studio-ar").table()).replace(/</g, "\\u003c")}</script>` : ""}
${require("./i18n").current().req ? require("./ui-ar").switchHtml(require("./i18n").current().req) : ""}
<script src="/_studio/assistant.js"></script>
<script src="/_studio/studio.js"></script>
</body></html>`
}

module.exports = { sanitize, saveDraft, publishAll, reset, revertLive, html, list, createPage, deletePage, status, page, isKey, FRAME_CSP, MAX,
  sharedOf, forgetShared }
