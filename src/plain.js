"use strict"
/** Transforme une erreur technique en phrase que le marchand peut lire et corriger. */
const messageOf = (err) => {
  const raw = String((err && (err.message || err)) || "Erreur inconnue.").replace(/\s+/g, " ").trim()
  if (/login_name/i.test(raw)) return "Cet identifiant est déjà pris. Change-le, par exemple ajoute un chiffre à la fin."
  if (/users\.email/i.test(raw)) return "Cet e-mail est déjà utilisé. Connecte-toi, ou choisis-en un autre."
  if (/stores\.slug/i.test(raw)) return "Cette adresse de boutique est déjà prise. Choisis-en une autre."
  if (/stores\.domain/i.test(raw)) return "Ce domaine est déjà utilisé par une autre boutique."
  if (/categories/i.test(raw) && /UNIQUE/i.test(raw)) return "Cette catégorie existe déjà. Change le nom."
  if (/discounts/i.test(raw) && /UNIQUE/i.test(raw)) return "Ce code promo existe déjà. Change-le."
  if (/UNIQUE constraint failed/i.test(raw)) return "Cette valeur existe déjà. Change-la et réessaie."
  if (/NOT NULL constraint failed/i.test(raw)) return "Un champ obligatoire est vide. Remplis-le et réessaie."
  if (/SQLITE_BUSY|database is locked/i.test(raw)) return "La base est occupée. Réessaie dans un instant."
  if (/entity.too.large|request entity too large/i.test(raw)) return "Fichier trop lourd. Maximum 2,5 Mo."
  return raw.slice(0, 320) || "Erreur inconnue."
}

module.exports = { messageOf }
