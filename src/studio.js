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
}

/** Publie toutes les pages qui ont un brouillon. Renvoie le nombre de pages publiées. */
const publishAll = (storeId, tpl) =>
  Number(db.prepare("UPDATE studio_site_pages SET live = draft, updated_at = datetime('now') WHERE store_id = ? AND template = ? AND draft != ''").run(storeId, tpl).changes)

const reset = (storeId, key = "home") => db.prepare("DELETE FROM studio_site_pages WHERE store_id = ? AND pkey = ?").run(storeId, key)

/** mode : edit · draft (brouillon sinon en ligne) · live. "" = HTML d'origine du template (accueil seulement). */
const html = (storeId, tpl, key = "home", mode = "live") => {
  const r = row(storeId, tpl, key)
  if (!r) return ""
  return mode === "live" ? r.live || "" : r.draft || r.live || ""
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

/** Coque du studio : tout le reste est dans /_studio/studio.js */
const page = (store, tpl, st) => `<!doctype html>
<html lang="fr"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Studio — ${esc(store.name)}</title>
<link rel="stylesheet" href="/_studio/studio.css">
</head><body>
<div id="st" data-slug="${esc(store.slug)}" data-name="${esc(store.name)}" data-tpl="${esc(tpl.id)}" data-tpl-name="${esc(tpl.name)}" data-edited="${st.edited ? 1 : 0}" data-published="${st.published ? 1 : 0}" data-unpublished="${st.unpublished ? 1 : 0}"></div>
<script src="/_studio/assistant.js"></script>
<script src="/_studio/studio.js"></script>
</body></html>`

module.exports = { sanitize, saveDraft, publishAll, reset, html, list, createPage, deletePage, status, page, isKey, FRAME_CSP, MAX }
