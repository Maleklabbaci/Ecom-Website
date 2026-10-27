"use strict"
/**
 * Démarrage de démonstration local (`npm run demo`).
 *
 * Pourquoi un lanceur séparé ?
 * `npm start` ne crée volontairement pas les comptes de démonstration :
 * leurs mots de passe sont publics. Mais quelqu'un qui a déjà lancé
 * `npm start` une première fois se retrouvait avec une base sans les
 * comptes démo, et ajouter NOVADZ_DEMO=1 ensuite ne les y créait pas.
 *
 * Ce lanceur force le mode démo et, par défaut, utilise une base séparée
 * (`data/novadz-demo.db`). Les comptes et boutiques de démonstration sont
 * donc créés sans toucher à une éventuelle base `data/novadz.db`.
 */
const path = require("path")

process.env.NOVADZ_DEMO = "1"
if (!process.env.NOVADZ_DB) {
  process.env.NOVADZ_DB = path.join(__dirname, "..", "data", "novadz-demo.db")
}

require("../server.js")
