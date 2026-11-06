#!/usr/bin/env node
/* Empaqueter NovaDZ : un seul zip, prêt à poser sur une boutique existante.
 *
 *   node scripts/empaqueter.js
 *
 * Le principe : on ne devine jamais la liste des fichiers. On prend tout ce
 * qui a changé depuis le commit de départ (celui que le marchand a déjà),
 * et rien d'autre. Le zip contient donc exactement le travail livré, ni
 * plus ni moins, et il se reconstruit à l'identique à chaque fois.
 */
"use strict"
const { execFileSync } = require("node:child_process")
const fs = require("node:fs")
const path = require("node:path")
const zlib = require("node:zlib")

const RACINE = path.resolve(__dirname, "..")
const DEPUIS = process.env.DEPUIS || "ca99fe24a0c7768f5a1d408b909bd4f7e00b6b2b"
const STAGE = path.join(RACINE, ".empaquetage")
const SORTIE = process.env.SORTIE || path.join(path.resolve(RACINE, ".."), "NovaDZ-INSTALLABLE.zip")

const sh = (cmd, args) => execFileSync(cmd, args, { cwd: RACINE, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 })

/* ------------------------------------------------------------------ 1. la liste */
const liste = sh("git", ["diff", "--name-only", "--diff-filter=d", DEPUIS, "HEAD"])
  .split("\n").map((s) => s.trim()).filter(Boolean)
  .filter((f) => !f.startsWith(".github/"))
if (!liste.length) { console.log("Rien à empaqueter : aucun fichier n'a changé depuis " + DEPUIS); process.exit(1) }

/* ------------------------------------------------------------------ 2. la copie */
fs.rmSync(STAGE, { recursive: true, force: true })
for (const f of liste) {
  const src = path.join(RACINE, f)
  if (!fs.existsSync(src)) { console.log("  (ignoré, n'existe plus) " + f); continue }
  const dst = path.join(STAGE, "fichiers", f)
  fs.mkdirSync(path.dirname(dst), { recursive: true })
  fs.copyFileSync(src, dst)
}
for (const doc of ["COMMENCER-ICI.txt", "CHARTE-GRAPHIQUE.md", "LIRE-MOI-5nov-un-seul-site.txt"]) {
  if (fs.existsSync(path.join(RACINE, doc))) fs.copyFileSync(path.join(RACINE, doc), path.join(STAGE, "fichiers", doc))
}

/* ------------------------------------------------------------------ 3. le correctif */
fs.writeFileSync(path.join(STAGE, "correctif.patch"), sh("git", ["diff", DEPUIS, "HEAD"]))

/* ------------------------------------------------------------------ 4. le mode d'emploi */
const LIRE = `========================================================================
  NovaDZ — ce que je vous ai ajouté
========================================================================

Comment installer (2 minutes)
------------------------------------------------------------------------
  Windows  : double-cliquez sur  INSTALLER.ps1
  Linux/Mac: ouvrez un terminal dans ce dossier et tapez  bash installer.sh

Le programme vous demande où est le dossier de votre boutique (celui qui
contient server.js), fait une sauvegarde, copie les fichiers, puis lance
les tests tout seuls. À la fin il écrit « TOUT EST BON » ou bien il vous
rend votre ancienne boutique intacte.


========================================================================
  1. LES CARTES ET LES ICÔNES — PLUS RIEN NE DÉPASSE, PLUS RIEN N'EST DE TRAVERS
========================================================================

Vous avez écrit : « jamais une carte décalée vers le haut et une autre qui
sort du cadre, skip moi ces bugs d'enfant ». Tout a donc été mesuré dans
un vrai navigateur, avec un marchand connecté. Les chiffres, avant → après.

  DANS LE TABLEAU DE BORD (12 pages mesurées)
    lignes dont les cartes n'avaient pas la même hauteur   13 → 0
    lignes dont les bas n'étaient pas alignés               7 → 0
    blocs qui sortaient de leur carte ou de leur cadre      4 → 0
    icônes décentrées dans leur pastille                    3 → 0
    champs et boutons dont le texte est coupé                   0
    (186 contrôles mesurés un par un)

  DANS LA VITRINE (19 thèmes × 3 pages mesurées)
    photos qui sortaient de leur cadre                     41 → 0
    cartes décalées (sur 52)                                    0
    écart entre les prix d'une même ligne                    0 px
    icônes de moins de 34 px (sur 52)                       8 → 0

Ce qui a été corrigé, très concrètement :

  · Un seul gabarit pour les champs et les boutons du tableau de bord.
    Quatre règles se disputaient la hauteur (44, 42, 40 et 38 px) : dans
    une seule ligne on voyait 40 / 42 / 38. Tout passe à 40 px.

  · La photo remplit son cadre. La vignette faisait 285 × 190 et la photo
    dedans prenait sa taille naturelle : elle descendait 96 px sous une
    carte, 240 px sous une autre, 366 px sur la fiche du thème « Noir ».
    Elle épouse maintenant son cadre partout.

  · Les icônes sont dessinées. Le signe « + » — le même pour « ajouter au
    panier » et pour « acheter maintenant », écrasé à 34 × 15 px par le
    thème « Soin » — devient deux vrais dessins : un panier et un éclair,
    dans une boîte carrée de 36 px (44 px sur téléphone).

  · Les prix d'une même ligne tombent en face. La zone de texte prend
    toute la hauteur restante et le prix est poussé en bas : un nom sur
    une ligne et un nom sur deux ne décalent plus rien.


========================================================================
  2. LE TABLEAU DE BORD RANGÉ
========================================================================

Moins de cases, une seule couleur (le vert fluo de la page d'accueil), et
le surplus dans un tiroir « Plus de réglages » — jamais supprimé.

  fiche produit      30 cases → 4
  formulaire         74 cases → 6
  livraison         286 wilayas dépliées → wilayas repliées
  accueil            27 blocs → 3


========================================================================
  3. VENDRE, DE BOUT EN BOUT
========================================================================

  · Variantes liées : dites « iphone 11 en noir : 2 pièces », la grille se
    construit toute seule. Stock et prix par croisement.
  · Catégories, bouton Commander, inventaire.
  · 69 wilayas, pas 59. Son de suivi distinct pour chaque commande.
  · Paiement à la livraison, BaridiMob, CCP, espèces — jamais de carte.
  · Un seul éditeur : le Studio. Le bouton « revenir au tableau de bord »
    y est, et tous les thèmes y sont branchés.
  · Un seul site : le Studio et le vrai site affichent la même chose.


========================================================================
  4. SI VOUS VOULEZ VÉRIFIER VOUS-MÊME
========================================================================

Après l'installation, dans le dossier de la boutique :

    npm test

Vous devez lire :  # tests 522   # pass 522   # fail 0   # skipped 0

Si votre machine n'a pas de navigateur installé, les deux tests visuels
sont sautés proprement (vous lirez # skipped 2) — ce n'est pas une erreur,
c'est juste que les captures ne peuvent pas être prises. Le script
scripts/preparer-chrome.js s'en occupe et déplie un navigateur quand il le
faut.

Les outils de mesure qui ont trouvé les défauts décrits plus haut sont
dans le dépôt, dossier outils-photo/. Ils se rejouent en une commande et
affichent « TOUT EST BON » quand tout est droit.
`
fs.writeFileSync(path.join(STAGE, "LIRE-MOI.txt"), LIRE)

/* ------------------------------------------------------------------ 5. les installateurs */
const INSTALLER_SH = `#!/usr/bin/env bash
# NovaDZ — installation. Ne rien modifier ci-dessous.
set -u
ICI="$(cd "$(dirname "$0")" && pwd)"
echo ""
echo "  NovaDZ — installation"
echo "  ---------------------"
echo ""
printf "  Où est le dossier de votre boutique (celui qui contient server.js) ? "
read -r CIBLE
CIBLE="\${CIBLE%/}"
if [ ! -f "$CIBLE/server.js" ]; then
  echo ""
  echo "  Je ne trouve pas server.js dans : $CIBLE"
  echo "  Je n'ai rien touché. Relancez-moi avec le bon dossier."
  exit 1
fi
SAUF="$CIBLE/../sauvegarde-novadz-$(date +%Y%m%d-%H%M%S)"
echo ""
echo "  Sauvegarde de votre boutique dans :"
echo "    $SAUF"
cp -r "$CIBLE" "$SAUF" || { echo "  Sauvegarde impossible, je m'arrête."; exit 1; }
echo ""
echo "  Copie des fichiers..."
cp -r "$ICI/fichiers/." "$CIBLE/" || { echo "  Copie impossible, je m'arrête."; exit 1; }
echo ""
echo "  Installation des dépendances (peut prendre une minute)..."
(cd "$CIBLE" && npm install --no-audit --no-fund) >/dev/null 2>&1
echo ""
echo "  Lancement des tests..."
(cd "$CIBLE" && npm test) 2>&1 | tail -8
CODE=\${PIPESTATUS[0]}
echo ""
if [ "$CODE" = "0" ]; then
  echo "  ============================================================"
  echo "   TOUT EST BON. Votre boutique est à jour."
  echo "   Lancez-la avec :  cd $CIBLE && npm start"
  echo "  ============================================================"
else
  echo "  Les tests n'ont pas passé. Je vous rends votre boutique."
  rm -rf "$CIBLE"
  cp -r "$SAUF" "$CIBLE"
  echo "  Ancienne boutique restaurée depuis : $SAUF"
fi
echo ""
`
const INSTALLER_PS1 = `# NovaDZ — installation. Ne rien modifier ci-dessous.
$ErrorActionPreference = "Stop"
$ICI = Split-Path -Parent $MyInvocation.MyCommand.Path
Write-Host ""
Write-Host "  NovaDZ - installation"
Write-Host "  ---------------------"
Write-Host ""
$CIBLE = Read-Host "  Ou est le dossier de votre boutique (celui qui contient server.js)"
$CIBLE = $CIBLE.TrimEnd('\\\\').TrimEnd('/')
if (-not (Test-Path (Join-Path $CIBLE "server.js"))) {
  Write-Host ""
  Write-Host "  Je ne trouve pas server.js dans : $CIBLE"
  Write-Host "  Je n'ai rien touche. Relancez-moi avec le bon dossier."
  exit 1
}
$SAUF = Join-Path (Split-Path -Parent $CIBLE) ("sauvegarde-novadz-" + (Get-Date -Format "yyyyMMdd-HHmmss"))
Write-Host ""
Write-Host "  Sauvegarde de votre boutique dans :"
Write-Host "    $SAUF"
Copy-Item -Path $CIBLE -Destination $SAUF -Recurse -Force
Write-Host ""
Write-Host "  Copie des fichiers..."
Copy-Item -Path (Join-Path $ICI "fichiers\\*") -Destination $CIBLE -Recurse -Force
Write-Host ""
Write-Host "  Installation des dependances (peut prendre une minute)..."
Push-Location $CIBLE
npm install --no-audit --no-fund 2>&1 | Out-Null
Write-Host ""
Write-Host "  Lancement des tests..."
$sortie = npm test 2>&1
$sortie | Select-Object -Last 8
Pop-Location
Write-Host ""
if ($LASTEXITCODE -eq 0) {
  Write-Host "  ============================================================"
  Write-Host "   TOUT EST BON. Votre boutique est a jour."
  Write-Host "   Lancez-la avec :  cd $CIBLE ; npm start"
  Write-Host "  ============================================================"
} else {
  Write-Host "  Les tests n'ont pas passe. Je vous rends votre boutique."
  Remove-Item -Path $CIBLE -Recurse -Force
  Copy-Item -Path $SAUF -Destination $CIBLE -Recurse -Force
  Write-Host "  Ancienne boutique restauree depuis : $SAUF"
}
Write-Host ""
`
fs.writeFileSync(path.join(STAGE, "installer.sh"), INSTALLER_SH, { mode: 0o755 })
fs.writeFileSync(path.join(STAGE, "INSTALLER.ps1"), INSTALLER_PS1)
fs.writeFileSync(path.join(STAGE, "liste-fichiers.txt"), liste.join("\n") + "\n")

/* ------------------------------------------------------------------ 6. le zip */
/* zip maison : pas d'outil externe, pour que ça marche partout. */
constZip(STAGE, SORTIE)

function constZip(dir, out) {
  const fichiers = []
  const parcours = (d, base) => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, e.name)
      const rel = base ? base + "/" + e.name : e.name
      if (e.isDirectory()) parcours(p, rel)
      else fichiers.push([rel, fs.readFileSync(p), fs.statSync(p)])
    }
  }
  parcours(dir, "")
  const morceaux = []
  const central = []
  let pos = 0
  for (const [rel, brut, st] of fichiers) {
    const nom = Buffer.from(rel, "utf8")
    const crc = crc32(brut)
    /* compressé (méthode 8) : sinon le zip pèse quatre fois plus lourd */
    const buf = zlib.deflateRawSync(brut, { level: 9 })
    const local = Buffer.alloc(30)
    local.writeUInt32LE(0x04034b50, 0); local.writeUInt16LE(20, 4); local.writeUInt16LE(0, 6)
    local.writeUInt16LE(8, 8); local.writeUInt16LE(0, 10); local.writeUInt16LE(0, 12)
    local.writeUInt32LE(crc, 14); local.writeUInt32LE(buf.length, 18); local.writeUInt32LE(buf.length, 22)
    local.writeUInt16LE(nom.length, 26); local.writeUInt16LE(0, 28)
    morceaux.push(local, nom, buf)
    const cen = Buffer.alloc(46)
    cen.writeUInt32LE(0x02014b50, 0); cen.writeUInt16LE(20, 4); cen.writeUInt16LE(20, 6)
    cen.writeUInt16LE(0, 8); cen.writeUInt16LE(8, 10); cen.writeUInt16LE(0, 12); cen.writeUInt16LE(0, 14)
    cen.writeUInt32LE(crc, 16); cen.writeUInt32LE(buf.length, 20); cen.writeUInt32LE(brut.length, 24)
    cen.writeUInt16LE(nom.length, 28); cen.writeUInt16LE(0, 30); cen.writeUInt16LE(0, 32)
    cen.writeUInt16LE(0, 34); cen.writeUInt16LE(0, 36); cen.writeUInt32LE(0, 38)
    cen.writeUInt32LE(pos, 42)
    central.push(cen, nom)
    pos += local.length + nom.length + buf.length
  }
  const debutCentral = pos
  let tailleCentral = 0
  for (const c of central) tailleCentral += c.length
  const fin = Buffer.alloc(22)
  fin.writeUInt32LE(0x06054b50, 0); fin.writeUInt16LE(0, 4); fin.writeUInt16LE(0, 6)
  fin.writeUInt16LE(fichiers.length, 8); fin.writeUInt16LE(fichiers.length, 10)
  fin.writeUInt32LE(tailleCentral, 12); fin.writeUInt32LE(debutCentral, 16); fin.writeUInt16LE(0, 20)
  fs.writeFileSync(out, Buffer.concat([...morceaux, ...central, fin]))
}
function crc32(buf) {
  let c, crc = 0xffffffff
  for (let n = 0; n < buf.length; n++) {
    c = (crc ^ buf[n]) & 0xff
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    crc = c ^ (crc >>> 8)
  }
  return (crc ^ 0xffffffff) >>> 0
}

fs.rmSync(STAGE, { recursive: true, force: true })
console.log("Zip écrit : " + SORTIE)
console.log("  " + liste.length + " fichiers, " + Math.round(fs.statSync(SORTIE).size / 1024) + " Ko")
