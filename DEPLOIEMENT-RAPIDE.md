# Mettre en ligne — 3 étapes

Le zip contient un dossier `novadz` : c'est un dépôt prêt à pousser.
Rien à installer pour lire ce fichier ; tout est dedans.

---

## 1. Sur GitHub (5 minutes)

Deux façons. La première est la plus simple.

**a) Le script (recommandé)**
Ouvre PowerShell dans le dossier `novadz` et lance :

```powershell
powershell -ExecutionPolicy Bypass -File .\pousser-github.ps1
```

Il clone le dépôt, copie le code, et pousse. Tu n'as rien d'autre à faire.

**b) À la main, dans le navigateur**
Sur GitHub → ton dépôt `Ecom-Website` → **Add file → Upload files** → glisse le
**contenu** du dossier `novadz` (pas le dossier lui-même) → Commit.

Un fichier `.github/workflows/ci.yml` est fourni : à chaque envoi, GitHub
installe et lance les 311 tests tout seul. Tu vois vert ou rouge, sans rien faire.

---

## 2. Sur Cloudflare

**À savoir d'abord, pour ne pas perdre une journée :** Cloudflare ne peut pas
*héberger* NovaDZ. Pages sert des fichiers statiques, Workers ne sait pas faire
tourner un serveur Node avec une base SQLite. Cloudflare se met **devant** ton
application, il ne la remplace pas.

Donc : **le tunnel** (gratuit, HTTPS, ton domaine à toi).

### a) Faire tourner l'application quelque part

Sur ton PC, pour essayer tout de suite :

```powershell
npm install
npm start
```

Sur un vrai serveur (VPS à 5-10 €/mois), la procédure complète est dans
`DEPLOIEMENT-CLOUDFLARE.md`, option B. En résumé :

```bash
git clone https://github.com/Maleklabbaci/Ecom-Website.git /srv/novadz
cd /srv/novadz && npm ci --omit=dev
sudo cp deploy/novadz.service /etc/systemd/system/ && sudo systemctl enable --now novadz
```

### b) Brancher Cloudflare devant

```powershell
winget install --id Cloudflare.cloudflared
cloudflared tunnel login
cloudflared tunnel create novadz
cloudflared tunnel route dns novadz novadz.tondomaine.dz
cloudflared tunnel run novadz
```

Puis, dans le tableau de bord Cloudflare → **Zero Trust → Networks → Tunnels** :
une route publique `novadz.tondomaine.dz` → `http://localhost:4000`.

`https://novadz.tondomaine.dz` sert maintenant ta plateforme, avec le certificat,
le cache et la protection Cloudflare devant.

---

## 3. Vérifier

```bash
npm test          # 311 tests, 0 échec (2 ignorés sans navigateur)
curl -I https://novadz.tondomaine.dz   # 200
```

---

## Ce qui n'est pas dans ce zip (et pourquoi)

| Absent | Pourquoi |
|---|---|
| `node_modules/` | GitHub n'en veut pas, Cloudflare le réinstalle seul. `npm install` suffit. |
| `data/` | ta base : elle se recrée avec les boutiques de démo au premier lancement. Un dépôt public ne doit pas contenir de base. |
| `.env` | les secrets restent chez toi. Le modèle est `.env.example`. |
| `.git/` | l'historique : le script fait un clone propre. |

Comptes de démonstration créés au démarrage :
`demo@novadz.dz` / `demo1234` — `vitrine@novadz.dz` / `demo1234` — `admin@novadz.dz` / `admin1234`.
