"use strict"
/**
 * Référence de commande.
 *
 * L'ancienne version utilisait les 6 derniers chiffres des millisecondes :
 * « NDZ-483920 » revenait toutes les ~16 minutes → deux commandes de la même
 * boutique pouvaient partager la même référence, et la page publique
 * /<boutique>/order/<ref> affichait alors la mauvaise commande.
 *
 * Ici : 6 caractères base32 tirés au hasard (~1 milliard de combinaisons) et
 * on vérifie en base qu'elle n'existe pas déjà pour cette boutique.
 */
const crypto = require("crypto")

const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789" /* sans I, O, 0, 1 */

const randomRef = () => {
  const bytes = crypto.randomBytes(6)
  let out = ""
  for (let i = 0; i < 6; i++) out += ALPHABET[bytes[i] % ALPHABET.length]
  return "NDZ-" + out
}

/** Génère une référence unique pour cette boutique (20 tentatives, puis repli horodaté). */
const uniqueRef = (db, storeId) => {
  for (let i = 0; i < 20; i++) {
    const ref = randomRef()
    const clash = db.prepare("SELECT 1 FROM orders WHERE store_id = ? AND ref = ?").get(storeId, ref)
    if (!clash) return ref
  }
  return "NDZ-" + Date.now().toString(32).toUpperCase()
}

module.exports = { randomRef, uniqueRef }
