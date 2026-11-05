#!/usr/bin/env node
"use strict"

/**
 * Vérification officielle du Studio Nova.
 *
 * L'ancien testeur inspectait une iframe de l'ancien éditeur Design. Le
 * Studio Nova actuel rend directement son atelier et son aperçu dans la
 * page : cette commande délègue donc aux tests de comportement maintenus.
 */
const { spawnSync } = require("node:child_process")

const files = [
  "tests/atelier-design.test.js",
  "tests/studio-visible.test.js",
  "tests/theme-vs-modele.test.js",
  "tests/themes-prets.test.js",
]

const result = spawnSync(process.execPath, ["--test", ...files], {
  cwd: process.cwd(),
  stdio: "inherit",
  env: process.env,
})

if (result.error) {
  console.error("Impossible de lancer les tests Studio Nova :", result.error.message)
  process.exit(1)
}

process.exit(result.status ?? 1)
