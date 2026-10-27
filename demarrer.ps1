# ============================================================================
#  NovaDZ - demarrage guide (Windows PowerShell)
#
#  Double-clic droit > "Executer avec PowerShell", ou dans le dossier :
#      powershell -ExecutionPolicy Bypass -File .\demarrer.ps1
#
#  Le script :
#   1. verifie Node.js
#   2. installe les dependances si besoin (npm install)
#   3. demarre le serveur dans une fenetre dediee
#   4. attend qu'il reponde VRAIMENT (test HTTP reel)
#   5. ouvre http://localhost:3000 dans le navigateur
# ============================================================================

$ErrorActionPreference = "Stop"
Set-Location -Path $PSScriptRoot

function Info($t) { Write-Host $t -ForegroundColor Cyan }
function Ok($t)   { Write-Host $t -ForegroundColor Green }
function Bad($t)  { Write-Host $t -ForegroundColor Red }

Info "`n=== NovaDZ - demarrage ===`n"

# ---------- 1. Node ----------
try {
    $v = (& node -v).Trim()
} catch {
    Bad "Node.js n'est pas installe."
    Write-Host "Installe-le avec :  winget install OpenJS.NodeJS.LTS"
    Write-Host "Puis ferme et rouvre PowerShell, et relance ce script."
    Read-Host "Appuie sur Entree pour fermer"
    exit 1
}
$major = [int]($v.TrimStart("v").Split(".")[0])
if ($major -lt 22) {
    Bad "Node $v est trop ancien (il faut 22 ou 24)."
    Write-Host "Mets a jour avec :  winget install OpenJS.NodeJS.LTS"
    Read-Host "Appuie sur Entree pour fermer"
    exit 1
}
Ok "Node $v  OK"

# ---------- 2. Dependances ----------
if (-not (Test-Path ".\node_modules\express")) {
    Info "Installation des dependances (une seule fois, ~30 secondes)..."
    & npm install --no-audit --no-fund
    if ($LASTEXITCODE -ne 0) {
        Bad "L'installation a echoue. Copie le message ci-dessus."
        Read-Host "Appuie sur Entree pour fermer"
        exit 1
    }
}
Ok "Dependances OK"

# ---------- 3. Deja en marche ? ----------
function Test-NovaDZ($port) {
    try {
        $r = Invoke-WebRequest -Uri "http://localhost:$port/" -UseBasicParsing -TimeoutSec 2
        return ($r.StatusCode -eq 200)
    } catch { return $false }
}

if (Test-NovaDZ 3000) {
    Ok "NovaDZ tourne deja sur http://localhost:3000"
    Start-Process "http://localhost:3000"
    Write-Host "`nNavigateur ouvert. Si la page ne s'affiche pas, ouvre le lien a la main."
    Read-Host "Appuie sur Entree pour fermer"
    exit 0
}

# ---------- 4. Demarrage dans une fenetre dediee ----------
Info "Demarrage du serveur dans une nouvelle fenetre..."
# En local uniquement : scripts\demo.js force les comptes de demonstration
# et utilise une base separee (data\novadz-demo.db), meme si `npm start`
# a deja ete lance avant. Sur une machine exposee publiquement, ne jamais
# utiliser ce mode : ses mots de passe sont connus.
$proc = Start-Process -FilePath "node" -ArgumentList "scripts\demo.js" -WorkingDirectory $PSScriptRoot -PassThru

$ready = $false
for ($i = 0; $i -lt 30; $i++) {
    Start-Sleep -Seconds 1
    if ($proc.HasExited) { break }
    if (Test-NovaDZ 3000) { $ready = $true; break }
}

if ($ready) {
    Ok "`nServeur pret : http://localhost:3000"
    Write-Host "  Marchand : demo@novadz.dz / demo1234"
    Write-Host "  Vitrine  : vitrine@novadz.dz / demo1234"
    Write-Host "  Admin    : admin@novadz.dz / admin1234"
    Start-Process "http://localhost:3000"
    Write-Host "`nIMPORTANT : la fenetre 'node scripts\demo.js' doit rester ouverte."
    Write-Host "Pour arreter : ferme cette fenetre, ou tape :  Get-Process node | Stop-Process"
} else {
    Bad "`nLe serveur n'a pas repondu."
    if ($proc.HasExited) {
        Bad "Le processus s'est arrete (code $($proc.ExitCode))."
        Write-Host "Relance a la main pour voir l'erreur complete :  npm run demo"
    } else {
        Write-Host "Le processus tourne mais le port 3000 ne repond pas."
        Write-Host "1) Le pare-feu Windows a peut-etre bloque Node.js : autorise-le."
        Write-Host "2) Un autre logiciel occupe le port : essaie  `$env:PORT=3001; npm run demo"
    }
}

Read-Host "`nAppuie sur Entree pour fermer"
