"use strict"
/**
 * Application installable (PWA).
 *
 * Deux applications dans une :
 *   - la boutique du vendeur (le client l'installe sur son téléphone et la
 *     retrouve comme une vraie application, avec son icône) ;
 *   - le tableau de bord du marchand (pour suivre les commandes depuis le
 *     téléphone sans rouvrir le navigateur).
 *
 * Ici on fabrique les fichiers que le navigateur réclame : le manifeste
 * (nom, icône, couleur) et les balises de la page. Les icônes sont dessinées
 * par `appicon.js`, le hors-ligne par `public/sw.js`.
 */
const fs = require("fs")
const path = require("path")
const APPICON = require("./appicon")
const THEMES = require("./themes")

/* empreinte des fichiers concernés : après une retouche, le navigateur
   redemande le manifeste et le script au lieu de garder les anciens. */
const VERSION = (() => {
  try {
    const files = ["pwa.js", "sw.js"]
    return String(Math.round(Math.max(...files.map((f) => fs.statSync(path.join(__dirname, "..", "public", f)).mtimeMs))))
  } catch (_) { return "1" }
})()

const esc = (s) =>
  String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]))

/** Couleur de la tuile : l'accent choisi par le vendeur, sinon la couleur de
    son thème, sinon noir. Chaque boutique a donc sa tuile sur le téléphone. */
const storeColor = (design = {}, store = {}) => {
  const accent = String(design.accent || "")
  /* #111111 est l'accent par défaut : il ne dit rien du vendeur */
  if (/^#[0-9a-f]{6}$/i.test(accent) && accent.toLowerCase() !== "#111111") return accent
  const themeId = design.theme || store.theme
  try {
    /* les thèmes sont rangés par numéro ; [fond, surface, encre] */
    const theme = Object.values(THEMES.THEMES).find((t) => t && (t.id === themeId || t.name === themeId))
    const ink = theme && Array.isArray(theme.dots) ? theme.dots[2] : ""
    if (/^#[0-9a-f]{6}$/i.test(ink)) return ink
  } catch (_) { /* thème inconnu : on garde le noir */ }
  return "#111111"
}

const shortName = (name) => {
  const clean = String(name || "Boutique").trim()
  return clean.length <= 12 ? clean : clean.slice(0, 12).trim()
}

/** Le manifeste de la boutique du vendeur. */
const storeManifest = (store, design = {}) => {
  const color = storeColor(design, store)
  const slug = store.slug
  const icons = [
    { src: `/${slug}/app-icon-192.png`, sizes: "192x192", type: "image/png", purpose: "any" },
    { src: `/${slug}/app-icon-512.png`, sizes: "512x512", type: "image/png", purpose: "any" },
    { src: `/${slug}/app-icon-maskable.png`, sizes: "512x512", type: "image/png", purpose: "maskable" },
  ]
  return {
    id: `/${slug}/`,
    name: store.name || slug,
    short_name: shortName(store.name),
    description: String(design.tagline || `${store.name || slug} — commande simple, paiement à la livraison.`).slice(0, 160),
    lang: "fr",
    dir: "auto",
    start_url: `/${slug}/?source=app`,
    scope: `/${slug}/`,
    display: "standalone",
    background_color: "#FFFFFF",
    theme_color: color,
    categories: ["shopping"],
    prefer_related_applications: false,
    icons,
    shortcuts: [
      { name: "La boutique", url: `/${slug}/?source=raccourci` },
      { name: "Mon panier", url: `/${slug}/cart?source=raccourci` },
    ],
  }
}

/** Le manifeste du tableau de bord marchand (le même pour toutes les boutiques). */
const dashboardManifest = () => ({
  id: "/dashboard",
  name: "NovaDZ — mes boutiques",
  short_name: "NovaDZ",
  description: "Commandes, stock, reversements : tout le commerce dans une poche.",
  lang: "fr",
  start_url: "/dashboard?source=app",
  scope: "/dashboard",
  display: "standalone",
  background_color: "#FAFAFA",
  theme_color: "#111111",
  categories: ["business", "productivity"],
  prefer_related_applications: false,
  icons: [
    { src: "/dashboard/app-icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
    { src: "/dashboard/app-icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
    { src: "/dashboard/app-icon-maskable.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
  ],
})

/** Les balises à poser dans le <head> de la boutique. */
const storeHead = (store, design = {}) => {
  const slug = store.slug
  const color = storeColor(design, store)
  const v = `?v=${VERSION}`
  return [
    `<link rel="manifest" href="/${slug}/manifest.webmanifest${v}">`,
    `<meta name="theme-color" content="${esc(color)}">`,
    `<link rel="apple-touch-icon" href="/${slug}/app-icon-192.png">`,
    `<meta name="apple-mobile-web-app-capable" content="yes">`,
    `<meta name="apple-mobile-web-app-status-bar-style" content="default">`,
    `<meta name="apple-mobile-web-app-title" content="${esc(shortName(store.name))}">`,
    `<script src="/pwa.js${v}" defer></script>`,
  ].join("\n")
}

/** Les balises du tableau de bord. */
const dashboardHead = () => {
  const v = `?v=${VERSION}`
  return [
    `<link rel="manifest" href="/dashboard/manifest.webmanifest${v}">`,
    `<meta name="theme-color" content="#111111">`,
    `<link rel="apple-touch-icon" href="/dashboard/app-icon-192.png">`,
    `<meta name="apple-mobile-web-app-capable" content="yes">`,
    `<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">`,
    `<meta name="apple-mobile-web-app-title" content="NovaDZ">`,
    `<script src="/pwa.js${v}" defer></script>`,
  ].join("\n")
}

/** Le bouton « installer » (caché tant que le navigateur ne le propose pas). */
const installButton = () => `<button type="button" class="pwa-install" data-pwa-install hidden
  aria-label="Installer l'application sur ce téléphone">
  <span class="pwa-install-ico" aria-hidden="true">+</span>
  <span class="pwa-install-txt">Installer<br><b>sur le téléphone</b></span>
</button>`

module.exports = { storeManifest, dashboardManifest, storeHead, dashboardHead, installButton, storeColor }
