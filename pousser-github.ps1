# Envoie NovaDZ sur GitHub (Maleklabbaci/Ecom-Website)
# usage : powershell -ExecutionPolicy Bypass -File .\pousser-github.ps1
$ErrorActionPreference = "Stop"

$source = $PSScriptRoot
$clone  = "C:\dev\Ecom-Website"
$url    = "https://github.com/Maleklabbaci/Ecom-Website.git"

Write-Host ""
Write-Host "=== NovaDZ : envoi sur GitHub ===" -ForegroundColor Cyan
Write-Host ""

# ---------- 0. verifications ----------
if (-not (Test-Path (Join-Path $source "server.js"))) {
    Write-Host "ERREUR : server.js introuvable a cote de ce script." -ForegroundColor Red
    Write-Host "Extrait le zip en entier, puis lance le script depuis le dossier extrait." -ForegroundColor Yellow
    exit 1
}
if (-not (Test-Path (Join-Path $source "src"))) {
    Write-Host "ERREUR : dossier src/ introuvable." -ForegroundColor Red
    exit 1
}

$gitOk = $true
try { git --version | Out-Null } catch { $gitOk = $false }
if (-not $gitOk) {
    Write-Host "Git n'est pas installe." -ForegroundColor Red
    Write-Host "Installe-le puis relance ce script :" -ForegroundColor Yellow
    Write-Host "  winget install Git.Git" -ForegroundColor White
    Write-Host "(ferme et rouvre PowerShell apres l'installation)" -ForegroundColor Yellow
    exit 1
}
Write-Host "Source : $source" -ForegroundColor Cyan

# ---------- 1. clone ----------
if (Test-Path $clone) {
    Write-Host "Le dossier $clone existe deja : suppression..." -ForegroundColor Yellow
    Remove-Item -Recurse -Force $clone
}
Write-Host "Clonage du depot..." -ForegroundColor Yellow
git clone $url $clone
if ($LASTEXITCODE -ne 0) { Write-Host "Clonage impossible. Verifie ta connexion et tes droits sur le depot." -ForegroundColor Red; exit 1 }
Set-Location $clone

# ---------- 2. identite git (sinon le commit echoue) ----------
$mail = git config user.email
if ([string]::IsNullOrWhiteSpace($mail)) {
    Write-Host "Aucune identite git : configuration locale..." -ForegroundColor Yellow
    git config user.email "Maleklabbaci@users.noreply.github.com"
    git config user.name "Maleklabbaci"
}

# ---------- 3. nom de la branche par defaut du depot ----------
$branch = "main"
$sym = git ls-remote --symref origin HEAD 2>$null | Select-Object -First 1
if ($sym -match "refs/heads/(\S+)") { $branch = $Matches[1] }
Write-Host "Branche cible : $branch" -ForegroundColor Cyan

# ---------- 4. on vide l'ancien contenu (sauf .git) ----------
Write-Host "Suppression de l'ancien contenu..." -ForegroundColor Yellow
git rm -r --cached . 2>$null | Out-Null
Get-ChildItem -Force -Exclude ".git" | Remove-Item -Recurse -Force

# ---------- 5. copie NovaDZ ----------
Write-Host "Copie de NovaDZ..." -ForegroundColor Yellow
Get-ChildItem -Force $source |
    Where-Object { $_.Name -ne "node_modules" -and $_.Name -ne ".git" -and $_.Name -ne "data" } |
    ForEach-Object { Copy-Item $_.FullName -Destination $clone -Recurse -Force }

# ---------- 6. controle avant envoi ----------
$files = Get-ChildItem -Recurse -File | Where-Object { $_.FullName -notmatch "\\\.git\\" }
Write-Host ("Fichiers a envoyer : " + $files.Count) -ForegroundColor Cyan

$must = @(
    "server.js", "package.json", "package-lock.json",
    "src\sqlite.js", "src\db.js", "src\payments.js",
    "src\carriers.js", "src\carriers-generic.js", "src\carriers-presets.js",
    "src\relance.js", "src\stats.js", "src\wilayas.js",
    "tests\smoke.test.js", "tests\relance.test.js",
    "README.md", "LOCAL-WINDOWS.md", "DEPLOIEMENT-CLOUDFLARE.md",
    ".github\workflows\ci.yml"
)
foreach ($m in $must) {
    if (-not (Test-Path (Join-Path $clone $m))) {
        Write-Host "ERREUR : $m manquant, envoi annule." -ForegroundColor Red
        exit 1
    }
}
if (Test-Path (Join-Path $clone "data")) {
    Write-Host "ERREUR : le dossier data/ (base de donnees) ne doit pas partir sur GitHub." -ForegroundColor Red
    exit 1
}

# ---------- 7. commit ----------
Write-Host "Enregistrement..." -ForegroundColor Yellow
git add -A
git commit -m "NovaDZ : plateforme multi-boutiques complete" -m "- anti-fausses commandes (CAPTCHA, position, score de risque)
- pixels serveur Meta / TikTok / Snapchat
- pages de vente par produit
- transporteurs generiques : 24 prereglages (Yalidine, DHD, ZR, NOEST, Maystro)
- bordereau PDF, paniers abandonnes, relances, statistiques de livraison
- 45 tests automatiques
- guides de deploiement local Windows et Cloudflare"

# ---------- 8. push ----------
Write-Host ""
Write-Host "Envoi vers GitHub..." -ForegroundColor Yellow
git push --force origin $branch

if ($LASTEXITCODE -ne 0) {
    Write-Host ""
    Write-Host "L'envoi a echoue." -ForegroundColor Red
    Write-Host ""
    Write-Host "Cause la plus probable : authentification GitHub." -ForegroundColor Yellow
    Write-Host "Une fenetre doit s'ouvrir pour te connecter. Si elle ne s'ouvre pas :" -ForegroundColor Yellow
    Write-Host "  1. va sur https://github.com/settings/tokens" -ForegroundColor White
    Write-Host "  2. Generate new token (classic) -> coche la case 'repo' -> Generate" -ForegroundColor White
    Write-Host "  3. copie le token (ghp_...)" -ForegroundColor White
    Write-Host "  4. relance ce script : identifiant = Maleklabbaci, mot de passe = le token" -ForegroundColor White
    exit 1
}

Write-Host ""
Write-Host "Termine." -ForegroundColor Green
Write-Host "Depot : https://github.com/Maleklabbaci/Ecom-Website" -ForegroundColor Green
Write-Host "Etape suivante : lire LOCAL-WINDOWS.md" -ForegroundColor Green
Write-Host ""
