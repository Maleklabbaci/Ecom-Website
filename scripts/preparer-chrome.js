#!/usr/bin/env node
/* Préparer un navigateur pour les tests visuels.
 *
 *   node scripts/preparer-chrome.js
 *
 * Les tests visuels (tests/preuve-visuel.test.js) ont besoin d'un vrai
 * navigateur. Sur un poste de développement il y en a souvent un ; sur un
 * serveur d'intégration ou dans un conteneur, jamais. Ce script déplie donc
 * celui qui est fourni avec les dépendances du projet et écrit son chemin
 * dans un petit fichier que le test vient lire.
 *
 * Il ne fait jamais échouer la suite : si rien n'est disponible, les tests
 * visuels sont sautés proprement plutôt que de bloquer tout le monde.
 */
"use strict"
const fs = require("node:fs")
const os = require("node:os")
const path = require("node:path")

const DEST = path.join(os.tmpdir(), "ndz-chromium")
const FICHIER = path.join(DEST, "chemin.json")

;(async () => {
  try {
    const chromium = require("@sparticuz/chromium")
    fs.mkdirSync(DEST, { recursive: true })

    const bin = path.join(__dirname, "..", "node_modules", "@sparticuz/chromium", "bin")
    for (const f of ["chromium.br", "fonts.tar.br", "swiftshader.tar.br", "al2023.tar.br"]) {
      const src = path.join(bin, f)
      if (fs.existsSync(src)) await chromium.inflate(src)
    }

    /* les bibliothèques système dont le binaire a besoin sont dépliées
       dans un dossier à part : il faut les lui indiquer au lancement. */
    const lib = path.join(os.tmpdir(), "al2023", "lib")
    const fonts = path.join(os.tmpdir(), "fonts")
    if (chromium.setupLambdaEnvironment) chromium.setupLambdaEnvironment(lib)

    const executable = chromium.executablePath || path.join(os.tmpdir(), "chromium")
    if (!fs.existsSync(executable)) throw new Error("binaire introuvable : " + executable)

    fs.writeFileSync(FICHIER, JSON.stringify({ executable, lib, fonts }, null, 1))
    console.log("Navigateur prêt pour les tests visuels : " + executable)
  } catch (e) {
    /* Pas de navigateur : les tests visuels seront sautés, rien de grave. */
    try { fs.rmSync(FICHIER, { force: true }) } catch (_) {}
    console.log("Pas de navigateur pour les tests visuels (" + String(e.message).slice(0, 90) + ") — ils seront sautés.")
  }
  process.exit(0)
})()
