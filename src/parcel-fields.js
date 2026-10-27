"use strict"
/**
 * Fiche colis — les champs que chaque transporteur EXIGE pour accepter une commande.
 *
 * Un envoi refusé vient presque toujours d'un champ obligatoire vide, d'un
 * téléphone mal formé ou d'une description trop longue. Ce module :
 *   1. nettoie ce qui peut l'être (téléphone, poids, description),
 *   2. dit précisément ce qui manque, en français,
 *   3. empêche l'envoi tant que ce n'est pas complet.
 *
 * Source : documentation publique de chaque transporteur (voir CHAMPS-ENVOI-COLIS.md).
 */

/* Limites de description produit, par famille (au-delà, le transporteur refuse). */
const DESC_LIMIT = {
  yalidine: 150, // product_list : 150 caractères
  ecotrack: 255, // produit : 255 caractères
  procolis: 250, // Produit : 250 caractères
  "zr-new": 100, // products : 100 caractères
  noest: 255,
  maystro: 250,
  custom: 300,
}

/* Champs exigés par famille. `var` = variable de Novadz qui l'alimente. */
const REQUIRED = {
  yalidine: [
    { k: "fromWilaya", label: "Wilaya de départ", how: "Réglages du transporteur → Wilaya de départ" },
    { k: "firstName", label: "Prénom du client", how: "Nom du client (commande)" },
    { k: "lastName", label: "Nom du client", how: "Nom du client (commande)" },
    { k: "phone", label: "Téléphone", how: "Téléphone du client (commande)" },
    { k: "addressLine", label: "Adresse", how: "Adresse de livraison (commande)" },
    { k: "wilaya", label: "Wilaya de livraison", how: "Wilaya (commande)" },
    { k: "commune", label: "Commune", how: "Commune (commande)" },
    { k: "products", label: "Liste des produits", how: "Articles de la commande" },
    { k: "price", label: "Montant à encaisser", how: "Montant (fiche commande)" },
  ],
  ecotrack: [
    { k: "fullName", label: "Nom du client", how: "Nom (commande)" },
    { k: "phone", label: "Téléphone", how: "Téléphone (commande)" },
    { k: "addressLine", label: "Adresse", how: "Adresse (commande)" },
    { k: "wilayaCode", label: "Code wilaya", how: "Wilaya (commande)" },
    { k: "commune", label: "Commune", how: "Commune (commande)" },
    { k: "price", label: "Montant", how: "Montant (fiche commande)" },
    { k: "products", label: "Produit", how: "Articles (commande)" },
  ],
  procolis: [
    { k: "fullName", label: "Client", how: "Nom (commande)" },
    { k: "phone", label: "Mobile", how: "Téléphone (commande)" },
    { k: "addressLine", label: "Adresse", how: "Adresse (commande)" },
    { k: "wilayaCode", label: "ID wilaya", how: "Wilaya (commande)" },
    { k: "commune", label: "Commune", how: "Commune (commande)" },
    { k: "price", label: "Total", how: "Montant (fiche commande)" },
    { k: "products", label: "Produit", how: "Articles (commande)" },
  ],
  "zr-new": [
    { k: "fullName", label: "Nom du client", how: "Nom (commande)" },
    { k: "phone", label: "Téléphone", how: "Téléphone (commande)" },
    { k: "addressLine", label: "Adresse", how: "Adresse (commande)" },
    { k: "wilayaCode", label: "Wilaya", how: "Wilaya (commande)" },
    { k: "commune", label: "Commune", how: "Commune (commande)" },
    { k: "price", label: "Montant", how: "Montant (fiche commande)" },
    { k: "products", label: "Produits", how: "Articles (commande)" },
  ],
  noest: [
    { k: "fullName", label: "Client", how: "Nom (commande)" },
    { k: "phone", label: "Téléphone", how: "Téléphone (commande)" },
    { k: "addressLine", label: "Adresse", how: "Adresse (commande)" },
    { k: "wilayaCode", label: "Wilaya", how: "Wilaya (commande)" },
    { k: "commune", label: "Commune", how: "Commune (commande)" },
    { k: "price", label: "Montant", how: "Montant (fiche commande)" },
    { k: "products", label: "Produit", how: "Articles (commande)" },
  ],
  maystro: [
    { k: "fullName", label: "Nom du client", how: "Nom (commande)" },
    { k: "phone", label: "Téléphone", how: "Téléphone (commande)" },
    { k: "addressLine", label: "Adresse", how: "Adresse (commande)" },
    { k: "wilayaCode", label: "Wilaya", how: "Wilaya (commande)" },
    /* Maystro ne connaît pas le NOM de la commune : il lui faut son identifiant numérique. */
    { k: "communeId", label: "Identifiant numérique de la commune", how: "Commune (menu de la fiche commande)" },
    { k: "price", label: "Montant", how: "Montant (fiche commande)" },
    { k: "products", label: "Produits", how: "Articles (commande)" },
  ],
  custom: [],
}

/* Un bureau est exigé par ces familles : sans identifiant, le colis au bureau est refusé. */
const DESK_ID_REQUIRED = ["yalidine", "noest", "zr-new"]

/* ----------------------------- nettoyage ----------------------------- */

/** Téléphone algérien : 0XXXXXXXXX. Accepte +213, 00213, espaces, tirets, points. */
const cleanPhone = (raw) => {
  let d = String(raw || "").replace(/[^\d+]/g, "")
  if (d.startsWith("+213")) d = "0" + d.slice(4)
  else if (d.startsWith("00213")) d = "0" + d.slice(5)
  else if (d.startsWith("213") && d.length >= 12) d = "0" + d.slice(3)
  d = d.replace(/\D/g, "")
  return d
}

const phoneOk = (p) => /^0(5|6|7)\d{8}$/.test(p) || /^0(2|3|4)\d{7}$/.test(p)

/** Description produit courte et propre, à la limite du transporteur. */
const cleanProducts = (items, limit) => {
  const parts = items.map((i) => `${i.title}${i.qty > 1 ? " x" + i.qty : ""}`)
  let s = parts.join(", ")
  if (s.length <= limit) return s
  /* on garde le plus d'articles possible plutôt que de couper au milieu d'un mot */
  const out = []
  for (const p of parts) {
    const next = out.concat(p).join(", ")
    if (next.length > limit) break
    out.push(p)
  }
  s = out.join(", ")
  if (!s) s = parts[0] ? parts[0] : ""
  return s.slice(0, limit)
}

const cleanNote = (raw, limit = 200) => String(raw || "").replace(/\s+/g, " ").trim().slice(0, limit)

/* ----------------------------- contrôle ----------------------------- */

/**
 * Contrôle la fiche colis.
 * @param vars  variables construites par buildVars
 * @param family famille du transporteur (yalidine, ecotrack, procolis, zr-new, noest, maystro, custom)
 * @returns { ok, missing:[{label,how}], warnings:[string], limit }
 */
const check = (vars, family) => {
  const fam = REQUIRED[family] ? family : "custom"
  const missing = []
  const warnings = []

  for (const f of REQUIRED[fam]) {
    const v = vars[f.k]
    if (v === undefined || v === null || String(v).trim() === "" || v === 0) missing.push({ label: f.label, how: f.how })
  }

  if (vars.phone && !phoneOk(cleanPhone(vars.phone))) {
    missing.push({ label: "Téléphone valide (ex. 0551234567)", how: "Téléphone du client (commande)" })
  }
  if (vars.price !== undefined && Number(vars.price) <= 0) {
    missing.push({ label: "Montant à encaisser supérieur à 0", how: "Montant (fiche commande)" })
  }
  /* colis au bureau : le bureau doit être identifié là où le transporteur l'exige */
  if (vars.stopDesk) {
    if (DESK_ID_REQUIRED.includes(fam) && !String(vars.deskId || "").trim()) {
      missing.push({ label: "Bureau de retrait (son identifiant)", how: "Fiche commande → Bureau de retrait" })
    }
    if (!String(vars.deskCommune || vars.commune || "").trim()) {
      missing.push({ label: "Commune du bureau", how: "Bureau importé avec sa commune" })
    }
  }
  if (fam === "yalidine" && vars.firstName && vars.lastName && vars.firstName === vars.lastName) {
    warnings.push("Le nom du client ne contient qu'un mot : Yalidine affichera le même prénom et nom.")
  }
  if (vars.note && String(vars.note).length > 200) warnings.push("La note a été raccourcie à 200 caractères.")
  if (fam === "maystro" && vars.communeId && !/^\d+$/.test(String(vars.communeId))) {
    missing.push({ label: "Commune au format numérique Maystro", how: "Commune (menu de la fiche commande)" })
  }

  const limit = DESC_LIMIT[fam] || 300
  if (vars.products && String(vars.products).length > limit) {
    warnings.push(`Description produit raccourcie à ${limit} caractères (limite ${fam}).`)
  }

  return { ok: missing.length === 0, missing, warnings, family: fam, limit }
}

/** Lignes à afficher dans la fiche colis (valeur réellement envoyée). */
const sheet = (vars, family) => {
  const fam = REQUIRED[family] ? family : "custom"
  const rows = REQUIRED[fam].map((f) => ({
    label: f.label,
    value: String(vars[f.k] == null ? "" : vars[f.k]),
    var: "{{" + f.k + "}}",
  }))
  if (DESK_ID_REQUIRED.includes(fam) || fam === "ecotrack" || fam === "procolis" || fam === "maystro") {
    rows.push({
      label: vars.stopDesk ? "Bureau de retrait" : "Type de livraison",
      value: vars.stopDesk
        ? [vars.deskName, vars.deskId && "id " + vars.deskId, vars.deskCommune].filter(Boolean).join(" · ")
        : "À domicile",
      var: "{{stopDesk}}",
    })
  }
  rows.push({ label: "Description envoyée", value: String(vars.products || ""), var: "{{products}} (" + (DESC_LIMIT[fam] || 300) + " car. max)" })
  return rows
}

module.exports = { check, sheet, cleanPhone, phoneOk, cleanProducts, cleanNote, DESC_LIMIT, REQUIRED, DESK_ID_REQUIRED }
