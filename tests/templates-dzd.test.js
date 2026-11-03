/* LES PRIX DES MODÈLES SONT EN DINARS.
   NovaDZ est une plateforme algérienne : un modèle de site neuf ne doit pas
   afficher « 95,00 € ». Deux modèles importés (Adeline, VOID) portaient des
   prix d'exemple en euros — corrigés en dinars. Ce test empêche le retour.
*/
const { test } = require("node:test")
const assert = require("node:assert")
const fs = require("node:fs")
const path = require("node:path")

const DIR = path.join(__dirname, "..", "public", "templates")
const files = fs.existsSync(DIR) ? fs.readdirSync(DIR).filter((f) => f.endsWith(".html")) : []

test("aucun modèle de site n'affiche des prix en euros", () => {
  assert.ok(files.length > 0, "les modèles de site doivent être présents")
  const coupables = files.filter((f) => fs.readFileSync(path.join(DIR, f), "utf8").includes("€"))
  assert.deepEqual(coupables, [], "modèles avec des prix en euros : " + coupables.join(", "))
})

test("les prix d'exemple des modèles sont en dinars", () => {
  const avecDzd = files.filter((f) => /DZD/.test(fs.readFileSync(path.join(DIR, f), "utf8")))
  assert.ok(avecDzd.length > 0, "au moins un modèle doit afficher ses prix en DZD")
})
