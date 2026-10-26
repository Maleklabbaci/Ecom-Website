"use strict"
/** Jeu d'icônes SVG (trait 1.6, style Medusa). Aucun emoji nulle part. */

const svg = (paths, size = 18, sw = 1.6, viewBox = "0 0 24 24") =>
  `<svg width="${size}" height="${size}" viewBox="${viewBox}" fill="none" stroke="currentColor"
    stroke-width="${sw}" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths}</svg>`

const ICONS = {
  code: `<path d="m9 8-4 4 4 4"/><path d="m15 8 4 4-4 4"/>`,
  chart: `<path d="M4 20h16"/><path d="M7 20V11"/><path d="M12 20V5"/><path d="M17 20v-6"/>`,
  grid: `<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/>
         <rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/>`,
  box: `<path d="M21 8.5 12 3.5 3 8.5v7L12 20.5l9-5v-7Z"/><path d="M3 8.5 12 13.5l9-5"/><path d="M12 13.5v7"/>`,
  layers: `<path d="M12 3.5 3 8l9 4.5L21 8l-9-4.5Z"/><path d="M3 12.5 12 17l9-4.5"/><path d="M3 16.5 12 21l9-4.5"/>`,
  receipt: `<path d="M6 3.5h12v17l-2.5-1.6L13 20.5l-2.5-1.6L8 20.5 6 19V3.5Z"/><path d="M9.5 8h5"/><path d="M9.5 12h5"/>`,
  settings: `<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.6 1.6 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.6 1.6 0 0 0-1.8-.3 1.6 1.6 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.6 1.6 0 0 0-1.05-1.5 1.6 1.6 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.6 1.6 0 0 0 .3-1.8 1.6 1.6 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1A1.6 1.6 0 0 0 4.6 9a1.6 1.6 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.6 1.6 0 0 0 1.8.3H9a1.6 1.6 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.6 1.6 0 0 0 1 1.5 1.6 1.6 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.6 1.6 0 0 0-.3 1.8V9a1.6 1.6 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.6 1.6 0 0 0-1.5 1Z"/>`,
  store: `<path d="M3.5 9.5h17"/><path d="M4.5 9.5V20h15V9.5"/><path d="M3 9.5 5 4h14l2 5.5"/>
          <path d="M9.5 20v-5.5h5V20"/>`,
  shield: `<path d="M12 3 5 6v6c0 4.2 2.9 7.4 7 9 4.1-1.6 7-4.8 7-9V6l-7-3Z"/><path d="m9.2 12 2 2 3.6-3.8"/>`,
  facebook: `<path d="M14.5 8.5h2.5V5.6h-2.6c-2.3 0-3.9 1.5-3.9 3.9v1.9H8v3h2.5V21h3.1v-6.6h2.4l.4-3h-2.8V9.8c0-.8.3-1.3.9-1.3Z"/>`,
  instagram: `<rect x="3.5" y="3.5" width="17" height="17" rx="5"/><circle cx="12" cy="12" r="4"/><circle cx="17" cy="7" r="1"/>`,
  tiktok: `<path d="M14 4v9.2a3.3 3.3 0 1 1-2.6-3.2"/><path d="M14 4c.4 2.2 1.9 3.6 4 3.8"/>`,
  youtube: `<rect x="2.5" y="6" width="19" height="12" rx="4"/><path d="M10.5 9.5v5l4.5-2.5-4.5-2.5Z"/>`,
  snapchat: `<path d="M12 4c2.3 0 3.8 1.6 3.8 3.9 0 1 .1 1.7.3 2.2.4.2.9-.1 1.3 0 .6.2.5.9-.1 1.2-.5.2-1.2.4-1.2.9 0 .6.9 2 2.5 2.4.4.1.4.6 0 .8-.4.2-1.1.3-1.4.6-.2.2-.1.6-.4.8-.4.2-1-.1-1.6.1-.5.2-.8.9-1.4 1.1-.5.2-1-.2-1.4-.2s-.9.4-1.4.2c-.6-.2-.9-.9-1.4-1.1-.6-.2-1.2.1-1.6-.1-.3-.2-.2-.6-.4-.8-.3-.3-1-.4-1.4-.6-.4-.2-.4-.7 0-.8 1.6-.4 2.5-1.8 2.5-2.4 0-.5-.7-.7-1.2-.9-.6-.3-.7-1-.1-1.2.4-.1.9.2 1.3 0 .2-.5.3-1.2.3-2.2C8.2 5.6 9.7 4 12 4Z"/>`,
  telegram: `<path d="M21 4.5 3.5 11.2l4.6 1.5M21 4.5l-2.6 14.2-5.2-3.7M21 4.5 8.1 12.7l-.2 4.8 3.3-3.5"/>`,
  x: `<path d="M4 4l16 16M20 4 4 20"/>`,
  linkedin: `<rect x="3.5" y="3.5" width="17" height="17" rx="3"/><path d="M8 10.5V16M8 7.6v.1M12 16v-3.2c0-1.2.7-2 1.9-2s1.9.8 1.9 2V16"/>`,
  pinterest: `<circle cx="12" cy="12" r="8.5"/><path d="M10 20l2.6-7.2"/><path d="M9.4 11.6c-.4-2 .8-3.9 3-3.9 1.9 0 3.2 1.2 3.2 3 0 2.2-1.3 3.8-3 3.8-.9 0-1.6-.5-1.9-1.2"/>`,
  chat: `<path d="M21 11.5a8.5 8.5 0 0 1-8.5 8.5H8l-4 3v-5.2A8.5 8.5 0 1 1 21 11.5Z"/>`,
  robot: `<path d="M12 6.4V3.8"/><circle cx="12" cy="2.9" r="1" fill="currentColor" stroke="none"/><rect x="4.8" y="6.6" width="14.4" height="12" rx="3.2"/><path d="M2.4 12.2h2.4M19.2 12.2h2.4"/><circle cx="9.2" cy="11.8" r="1.15"/><circle cx="14.8" cy="11.8" r="1.15"/><path d="M9 15.6h6"/>`,
  play: `<circle cx="12" cy="12" r="9"/><path d="M10 8.5 16 12l-6 3.5v-7Z"/>`,
  timer: `<circle cx="12" cy="13" r="8"/><path d="M12 9v4l2.5 2"/><path d="M9 2h6"/>`,
  quote: `<path d="M8 7c-2.2 0-4 1.8-4 4v6h6v-6H6.5"/>`,
  cart: `<circle cx="9" cy="20" r="1.4"/><circle cx="18" cy="20" r="1.4"/>
         <path d="M2.5 3.5h2.2l2.4 11.2h11.1l2-8H6.2"/>`,
  check: `<path d="m4.5 12.5 5 5 10-11"/>`,
  truck: `<path d="M2.5 6.5h11v10h-11z"/><path d="M13.5 10h4l3 3v3.5h-7z"/>
          <circle cx="6.5" cy="18.5" r="1.6"/><circle cx="17" cy="18.5" r="1.6"/>`,
  cash: `<rect x="2.5" y="6" width="19" height="12" rx="2"/><circle cx="12" cy="12" r="2.6"/><path d="M6 9.5v5M18 9.5v5"/>`,
  refresh: `<path d="M20 11.5a8 8 0 1 0-1.6 5.2"/><path d="M20 4.5v6h-6"/>`,
  external: `<path d="M14 4.5h5.5V10"/><path d="M19.5 4.5 11 13"/><path d="M18 14v5.5H4.5V6H10"/>`,
  logout: `<path d="M9.5 20H4.5V4h5"/><path d="M15 8l4 4-4 4"/><path d="M19 12H9.5"/>`,
  plus: `<path d="M12 5v14M5 12h14"/>`,
  trash: `<path d="M4 7h16"/><path d="M9 7V4.5h6V7"/><path d="M6 7l1 13h10l1-13"/>`,
  edit: `<path d="M16.5 3.8a2.1 2.1 0 0 1 3 3L8 18.3l-4 1 1-4L16.5 3.8Z"/><path d="M14.5 5.8l3 3"/>`,
  upload: `<path d="M12 16.5V4.5"/><path d="M7.5 9 12 4.5 16.5 9"/><path d="M4.5 15v3.5a2 2 0 0 0 2 2h11a2 2 0 0 0 2-2V15"/>`,
  image: `<rect x="3" y="4.5" width="18" height="15" rx="2.5"/><circle cx="8.5" cy="10" r="1.6"/><path d="m4.5 17.5 4.8-4.2 3.7 3.2 2.9-2.4 3.6 3.4"/>`,
  arrowLeft: `<path d="M14 6l-6 6 6 6"/>`,
  arrowRight: `<path d="M10 6l6 6-6 6"/>`,
  menu: `<path d="M4 7h16M4 12h16M4 17h16"/>`,
  search: '<circle cx="10.8" cy="10.8" r="4.5"/><path d="M14.3 14.3 17.8 17.8"/>',
  user: `<circle cx="12" cy="8.5" r="3.5"/><path d="M5 20c0-3.6 3.1-6 7-6s7 2.4 7 6"/>`,
  /* --- éditeur de design --- */
  undo: `<path d="M9 7 4.5 11.5 9 16"/><path d="M4.5 11.5h9a6 6 0 0 1 0 12h-2.5"/>`,
  redo: `<path d="M15 7l4.5 4.5L15 16"/><path d="M19.5 11.5h-9a6 6 0 0 0 0 12H13"/>`,
  monitor: `<rect x="2.5" y="4" width="19" height="12.5" rx="2"/><path d="M8.5 20.5h7M12 16.5v4"/>`,
  tablet: `<rect x="5.5" y="2.5" width="13" height="19" rx="2.5"/><path d="M11 18.5h2"/>`,
  smartphone: `<rect x="7" y="2.5" width="10" height="19" rx="2.5"/><path d="M10.75 18.75h2.5"/>`,
  history: `<path d="M3.5 12a8.5 8.5 0 1 0 2.6-6.1"/><path d="M3.5 4.5V9H8"/><path d="M12 8v4.3l2.8 1.7"/>`,
  menuDots: `<circle cx="5" cy="12" r="1.4"/><circle cx="12" cy="12" r="1.4"/><circle cx="19" cy="12" r="1.4"/>`,
  nav: `<path d="M4 6.5h16M4 12h10M4 17.5h13"/>`,
  reset: `<path d="M4 10a8 8 0 1 1 2 8"/><path d="M4 4.5V10h5.5"/>`,
  eye: `<path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12Z"/><circle cx="12" cy="12" r="2.8"/>`,
  eyeOff: `<path d="M4 4.5 20 20"/><path d="M9.6 6.1A9.7 9.7 0 0 1 12 5.5c6 0 9.5 6.5 9.5 6.5a17 17 0 0 1-3.2 3.9"/><path d="M6.3 7.9A17 17 0 0 0 2.5 12S6 18.5 12 18.5a9.6 9.6 0 0 0 3.3-.6"/><path d="M10 10a2.8 2.8 0 0 0 4 4"/>`,
  copy: `<rect x="8.5" y="8.5" width="11" height="11" rx="2"/><path d="M15.5 5.5H6a1.5 1.5 0 0 0-1.5 1.5v9"/>`,
  grip: `<circle cx="9" cy="7" r="1.3"/><circle cx="15" cy="7" r="1.3"/><circle cx="9" cy="12" r="1.3"/><circle cx="15" cy="12" r="1.3"/><circle cx="9" cy="17" r="1.3"/><circle cx="15" cy="17" r="1.3"/>`,
  card: `<rect x="2.5" y="5" width="19" height="14" rx="2.5"/><path d="M2.5 9.5h19"/><path d="M6 15h4"/>`,
  bank: `<path d="M3.5 9.5 12 4l8.5 5.5"/><path d="M5.5 10v8M10 10v8M14 10v8M18.5 10v8"/><path d="M3 20.5h18"/>`,
  phone: `<path d="M7 3.5h10v17H7z"/><path d="M10.5 17.5h3"/>`,
  type: `<path d="M4 6.5V4.5h16v2"/><path d="M12 4.5v15"/><path d="M8.5 19.5h7"/>`,
  palette: `<path d="M12 3.5a8.5 8.5 0 1 0 0 17c1.4 0 2-1 2-2s-.7-2-.7-2.8c0-.9.7-1.7 2-1.7h1.9a3.3 3.3 0 0 0 3.3-3.3C20.5 6.6 16.7 3.5 12 3.5Z"/><circle cx="8" cy="10" r="1.1"/><circle cx="12" cy="7.5" r="1.1"/><circle cx="16" cy="9.5" r="1.1"/>`,
  layout: `<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M3 9h18M9 9v11"/>`,
  whatsapp: `<path d="M20.5 11.7a8.4 8.4 0 0 1-12.4 7.4L3.5 20.5l1.4-4.5a8.4 8.4 0 1 1 15.6-4.3Z"/><path d="M9.2 8.6c.3-.5 1-.5 1.2-.1l.7 1.2c.2.3.1.6-.1.8l-.4.4c.5 1 1.3 1.8 2.3 2.3l.4-.4c.2-.2.5-.3.8-.1l1.2.7c.4.2.4.9-.1 1.2-.7.4-1.7.5-2.6.1-1.6-.6-3-2-3.6-3.6-.4-.9-.3-1.9.2-2.5Z"/>`,
  clock: `<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 1.8"/>`,
  hourglass: `<path d="M7 3.5h10"/><path d="M7 20.5h10"/><path d="M7.5 3.5c0 4 4.5 4.6 4.5 8.5s-4.5 4.5-4.5 8.5"/><path d="M16.5 3.5c0 4-4.5 4.6-4.5 8.5s4.5 4.5 4.5 8.5"/>`,
  phoneOff: `<path d="M4 4l16 16"/><path d="M8.4 4.6 9 6.6c.1.4 0 .8-.3 1.1l-.8.8c-.2.2-.3.5-.2.8.5 1.5 1.4 2.9 2.6 3.9"/><path d="M13.4 16.2c.8.5 1.7.9 2.7 1.1.3 0 .6-.1.8-.4l.9-1.3c.3-.4.2-.9-.2-1.2l-1.8-1.1c-.3-.2-.7-.2-1 0l-.8.6"/><path d="M5.6 8.2c-.6 1.4-.6 2.9-.1 4.3 1 2.9 3.4 5.3 6.3 6.3 1.4.5 2.9.5 4.3-.1"/>`,
  flask: `<path d="M9.5 3.5h5"/><path d="M10.5 3.5v5L6 17c-.7 1.3.1 2.8 1.6 2.8h8.8c1.5 0 2.3-1.5 1.6-2.8l-4.5-8.5v-5"/><path d="M7.6 14.5h8.8"/>`,
  target: `<circle cx="12" cy="12" r="8.5"/><circle cx="12" cy="12" r="4.3"/><circle cx="12" cy="12" r="1"/>`,
  link: `<path d="M10.5 13.5a3.6 3.6 0 0 0 5.1 0l2.1-2.1a3.6 3.6 0 1 0-5.1-5.1l-1 1"/><path d="M13.5 10.5a3.6 3.6 0 0 0-5.1 0l-2.1 2.1a3.6 3.6 0 1 0 5.1 5.1l1-1"/>`,
  globe: `<circle cx="12" cy="12" r="8.5"/><path d="M3.5 12h17"/><path d="M12 3.5c2.3 2.4 3.5 5.3 3.5 8.5S14.3 18.1 12 20.5c-2.3-2.4-3.5-5.3-3.5-8.5S9.7 5.9 12 3.5Z"/>`,
  bell: `<path d="M6.2 9.2a5.8 5.8 0 0 1 11.6 0c0 4.2 1.2 5.6 1.2 5.6H5s1.2-1.4 1.2-5.6Z"/><path d="M10 18.2a2 2 0 0 0 4 0"/>`,
}

/* Décalage du cadre pour que le trait soit au centre du bouton, sans changer la taille. */
const SHIFT = {
  facebook: [0.4, 1.2],
  tiktok: [0.7, -1.8],
  snapchat: [0.3, -1],
  chat: [0, 1.6],
  arrowLeft: [-1.1, 0],
  arrowRight: [0.9, 0],
  truck: [-0.5, 1],
}
const icon = (name, size = 18) => {
  const s = SHIFT[name]
  return svg(ICONS[name] || "", size, 1.6, s ? `${s[0]} ${s[1]} 24 24` : "0 0 24 24")
}

/** Vignette « visuel produit » : initiale sur fond gris (remplace les emojis). */
const initial = (text) => {
  const s = String(text || "?").trim()
  const letter = s ? s[0].toUpperCase() : "?"
  return `<span class="tile">${letter}</span>`
}

/** Marque NovaDZ : carré noir + étoile blanche (aucun emoji). */
const mark = (size = 24) => `<svg width="${size}" height="${size}" viewBox="0 0 32 32" aria-hidden="true" style="flex:0 0 auto">
  <rect x="1" y="1" width="30" height="30" rx="8" fill="#111111"/>
  <path d="M16 7.5 17.9 13.1 23.8 13.2 19.1 16.7 20.8 22.3 16 19.1 11.2 22.3 12.9 16.7 8.2 13.2 14.1 13.1Z" fill="#FFFFFF"/>
</svg>`

module.exports = { icon, initial, mark, ICONS }
