"use strict"
/**
 * Code réel d'une page, tel que le thème la construit — sans le document
 * (html/head/header/footer). Le shell le ré-enveloppe. Les racines Nova
 * (formulaire, panier, achat) restent dans le HTML rendu : applyPageCode
 * ne les rajoute pas une seconde fois si elles sont déjà là.
 */

const { layoutFor } = require("./layouts")
const SECTIONS = require("./sections")

const VOID = new Set("area,base,br,col,embed,hr,img,input,link,meta,param,source,track,wbr".split(","))

const prettyHtml = (html) => {
  let s = String(html || "").replace(/\r/g, "").replace(/>\s*</g, ">\n<").trim()
  if (!s) return ""
  const lines = s.split("\n")
  let depth = 0
  const out = []
  for (const raw of lines) {
    const line = raw.trim()
    if (!line) continue
    if (/^<\//.test(line)) depth = Math.max(0, depth - 1)
    out.push("  ".repeat(depth) + line)
    const open = line.match(/^<([a-zA-Z0-9-]+)/)
    if (!open || /^<\//.test(line)) continue
    const name = open[1].toLowerCase()
    const closedHere = line.includes("</" + open[1] + ">") || line.includes("</" + name + ">")
    const self = /\/\s*>$/.test(line) || VOID.has(name) || closedHere
    if (!self) depth += 1
  }
  return out.join("\n") + "\n"
}

const LABELS = {
  home: "Accueil",
  product: "Fiche produit",
  cart: "Panier",
  checkout: "Commande",
  legal: "Informations légales",
  account: "Compte client",
}

const banner = (key, title) => {
  const label = title || LABELS[key] || "Page"
  return `<!-- ${label} — code réel de cette page.\n`
    + `     Glisser un bloc ou en ajouter un met à jour ce code. Enregistrer à la main le fige. Revenir au thème le rattache aux blocs.\n`
    + `     Racines Nova, boutons au-dessus : logo, menu, produits, formulaire, panier, achat, contenu. -->\n`
}

const withSections = (store, key, html, products) => {
  if (key === "home") return html
  const list = SECTIONS.readSections(store, key)
  if (!list.length) return html
  return html + SECTIONS.renderSections(store, list, {
    products: products || [],
    design: SECTIONS.readDesign(store),
  })
}

/**
 * @param {object} store boutique (brouillon déjà appliqué)
 * @param {string} key home | product | cart | checkout | legal | account | page:slug
 * @param {object} ctx products, product, related, extra, items, totals, promoMsg, html, title
 */
const sourceFor = (store, key, ctx = {}) => {
  const L = layoutFor(store.theme || "minimal")
  const products = ctx.products || []
  let html = ""
  if (key === "home") {
    const meta = { categories: [], count: products.length, ...(ctx.meta || {}) }
    if (!Array.isArray(meta.categories)) meta.categories = []
    html = L.home(store, products, meta)
  } else if (key === "product" && ctx.product) {
    html = L.product(store, ctx.product, ctx.related || [], ctx.extra || {})
    html = withSections(store, "product", html, [ctx.product, ...(ctx.related || [])])
  } else if (key === "cart") {
    html = L.cart(store, ctx.items || [], ctx.totals || {}, ctx.promoMsg || null)
    html = withSections(store, "cart", html, products)
  } else if (key === "checkout") {
    html = L.checkout(store, ctx.items || [], ctx.totals || {}, null, ctx.extra || {})
    html = withSections(store, "checkout", html, products)
  } else if (ctx.html) {
    html = ctx.html
    html = withSections(store, key, html, products)
  }
  if (!String(html || "").trim()) {
    html = `<section class="wrap"><h1>${LABELS[key] || "Page"}</h1><p>Cette page n'a pas encore de contenu.</p></section>`
  }
  return banner(key, ctx.title) + prettyHtml(html)
}

const extractArticle = (html, cls) => {
  const m = String(html || "").match(new RegExp(`<article class="${cls}"[\\s\\S]*?</article>`, "i"))
  return m ? m[0] : ""
}

module.exports = { prettyHtml, sourceFor, extractArticle }
