# Déployer NovaDZ — GitHub puis Cloudflare

Deux parties : mettre le code sur GitHub, puis le rendre accessible en ligne derrière Cloudflare.

---

## Avant tout : ce que Cloudflare peut héberger, et ce qu'il ne peut pas

Il faut le dire clairement, sinon tu vas perdre une journée.

NovaDZ est une **application Node.js 22/24** : Express + la base **SQLite** (`better-sqlite3`, avec repli automatique sur `node:sqlite`).

| Service Cloudflare | Peut héberger NovaDZ ? | Pourquoi |
|---|---|---|
| **Pages** | Non | héberge des fichiers statiques, pas un serveur Node |
| **Workers** | Non | environnement V8 isolé : pas de `better-sqlite3` (module natif C++), pas d'écriture de fichiers, pas de session en mémoire, pas d'Express |
| **Tunnel + ton serveur** | **Oui** | Cloudflare met le HTTPS, le domaine et la protection devant ; l'application tourne sur ta machine ou un VPS |
| **DNS + proxy** | Oui | même chose, en pointant un enregistrement vers ton IP |

Autrement dit : **Cloudflare est excellent devant l'application, pas à sa place.**
Trois options réelles, de la plus simple à la plus propre.

---

## Étape 1 — Pousser sur GitHub

### a) Le zip

`novadz-final-github.zip` contient un dépôt prêt à pousser : code, tests, `README.md`,
`.gitignore`, `LICENSE`, `.github/workflows/ci.yml` (les tests tournent à chaque push),
`deploy/` (service systemd + modèle de tunnel), `.env.example`.

### b) La commande

Extrait le zip, ouvre PowerShell **dans le dossier extrait**, puis :

```powershell
powershell -ExecutionPolicy Bypass -File .\pousser-github.ps1
```

Le script :
1. clone `https://github.com/Maleklabbaci/Ecom-Website.git` ;
2. vide l'ancien contenu (sauf `.git`) ;
3. copie le code NovaDZ ;
4. vérifie que `server.js` et `src/` sont bien là ;
5. commit + `push --force`.

Si tu préfères le faire à la main :

```powershell
$url = "https://github.com/Maleklabbaci/Ecom-Website.git"
git clone $url C:\dev\Ecom-Website
Set-Location C:\dev\Ecom-Website
Get-ChildItem -Force -Exclude ".git" | Remove-Item -Recurse -Force
Copy-Item -Path "C:\chemin\vers\novadz\*" -Destination . -Recurse -Force
git add -A
git commit -m "NovaDZ plateforme complete"
git push --force origin main
```

> Le dépôt GitHub est **public** si tu l'as créé ainsi. Aucun secret n'est dedans :
> `.env` et `data/` sont exclus par `.gitignore`. Les jetons transporteurs sont chiffrés en base,
> jamais dans le code.

---

## Option A — Tester en ligne en 5 minutes (ton PC + Tunnel)

Parfait pour montrer la plateforme à quelqu'un, sans serveur.

### 1. Lancer l'application

```powershell
cd C:\chemin\vers\novadz
npm install
npm start
```

Laisse cette fenêtre ouverte. La plateforme écoute sur `http://localhost:4000`.

### 2. Installer cloudflared

```powershell
winget install --id Cloudflare.cloudflared
```

Ferme et rouvre PowerShell, puis :

```powershell
cloudflared --version
```

### 3. Connecter ton compte Cloudflare

```powershell
cloudflared tunnel login
```

Une page s'ouvre : choisis ton domaine, autorise.

### 4. Créer le tunnel

```powershell
cloudflared tunnel create novadz
```

Note l'**UUID** affiché, par exemple `4b1f…-…`.

### 5. Le fichier de configuration

Crée `C:\Users\<ton-nom>\.cloudflared\config.yml` :

```yaml
tunnel: L-UUID-AFFICHE
credentials-file: C:\Users\<ton-nom>\.cloudflared\L-UUID-AFFICHE.json

ingress:
  - hostname: novadz.tondomaine.dz
    service: http://localhost:4000
  - service: http_status:404
```

### 6. Relier le nom de domaine

```powershell
cloudflared tunnel route dns novadz novadz.tondomaine.dz
```

### 7. Démarrer

```powershell
cloudflared tunnel run novadz
```

`https://novadz.tondomaine.dz` sert maintenant ta plateforme, avec un certificat valide.

### 8. En service permanent (si tu gardes cette machine)

```powershell
npm install -g pm2
pm2 start server.js --name novadz
pm2 save
pm2-startup install
```

Pour arrêter les redémarrages à chaque déconnexion Windows, il faut que la session reste ouverte
ou passer à un VPS (option suivante).

**Limite à connaître :** ton PC éteint = site coupé. Bien pour une démo, pas pour des clients.

---

## Option B — Production sur VPS + Tunnel (recommandé)

Un VPS à 5-10 € par mois suffit (2 vCPU, 2 Go de RAM, Ubuntu 22.04 ou 24.04).

### 1. Serveur : Node et l'application

```bash
sudo apt update && sudo apt install -y curl git
curl -fsSL https://deb.nodesource.com/setup_24.x | sudo -E bash -   # Node 22 ou 24 (pas 20)
sudo apt install -y nodejs
sudo useradd -r -m -d /srv/novadz novadz
sudo -u novadz git clone https://github.com/Maleklabbaci/Ecom-Website.git /srv/novadz
cd /srv/novadz && sudo -u novadz npm ci --omit=dev
```

### 2. Service systemd

```bash
sudo cp deploy/novadz.service /etc/systemd/system/
sudo nano /etc/systemd/system/novadz.service   # mets PUBLIC_URL et le bon chemin
sudo systemctl daemon-reload
sudo systemctl enable --now novadz
sudo systemctl status novadz
```

L'application écoute sur `http://127.0.0.1:4000`. Elle n'est pas exposée directement : c'est le
tunnel qui l'expose. C'est plus sûr, aucun port ouvert sur internet.

### 3. Tunnel Cloudflare

```bash
curl -fsSL https://pkg.cloudflare.com/cloudflare-main.gpg | sudo tee /usr/share/keyrings/cloudflare-main.gpg >/dev/null
echo "deb [signed-by=/usr/share/keyrings/cloudflare-main.gpg] https://pkg.cloudflare.com/cloudflared any main" | sudo tee /etc/apt/sources.list.d/cloudflared.list
sudo apt update && sudo apt install -y cloudflared
```

Puis, dans ton compte Cloudflare (dashboard → **Zero Trust → Networks → Tunnels → Create a tunnel**),
tu suis l'assistant : il te donne une commande `cloudflared service install eyJ...` à coller.
À la fin du tunnel, ajoute une **route publique** : `novadz.tondomaine.dz` → `http://localhost:4000`.

Pas de fichier YAML à écrire, l'assistant s'en occupe. C'est la voie la plus simple.

### 4. Vérifications

```bash
sudo systemctl status novadz      # actif ?
curl -I https://novadz.tondomaine.dz   # 200 ?
```

---

## Option C — VPS + DNS classique (sans tunnel)

Si tu préfères un enregistrement DNS normal :

1. Dans Cloudflare → **DNS** → ajoute `A` : `novadz` → IP de ton VPS, **Proxy activé** (nuage orange).
2. Sur le serveur, Nginx en frontal avec le certificat Cloudflare :

```bash
sudo apt install -y nginx
sudo tee /etc/nginx/sites-available/novadz >/dev/null <<'EOF'
server {
  listen 80;
  server_name novadz.tondomaine.dz;
  client_max_body_size 20m;
  location / {
    proxy_pass http://127.0.0.1:4000;
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
  }
}
EOF
sudo ln -s /etc/nginx/sites-available/novadz /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx
```

3. SSL/TLS → mode **Full (strict)**. Nginx parle en HTTP au 4000, Cloudflare fournit le HTTPS.

`client_max_body_size 20m` compte : sans lui, les photos produits au-delà de 1 Mo sont refusées.

---

## Protection de l'administration (à faire dans les trois cas)

Le `/dashboard` est protégé par mot de passe applicatif, mais on peut ajouter une seconde porte
gratuite avec Cloudflare :

**Zero Trust → Access → Applications** → *Add an application* → Self-hosted.

| Champ | Valeur |
|---|---|
| Nom | `NovaDZ admin` |
| Domaine | `novadz.tondomaine.dz/dashboard` |
| Politique | `Emails` → ton adresse e-mail |

Résultat : même avec le bon mot de passe NovaDZ, il faut aussi confirmer par e-mail. Deux
protections pour zéro euro.

Autres réglages utiles dans Cloudflare :

- **SSL/TLS → Edge Certificates → Always Use HTTPS** : activé.
- **Speed → Brotli** : activé.
- **Caching** : ne mets **pas** en cache `/dashboard/*` ni `/*/checkout` — paniers et sessions.
  Les seuls fichiers cacheables sont `/styles.css`, `/editor.js`, `/landing.css`, `/uploads/*`.

---

## Sauvegarde de la base (5 minutes, à ne pas sauter)

Tout tient dans `data/novadz.db` : boutiques, produits, commandes, clients. Une seule copie
manquante et tu perds le chiffre d'affaires du mois.

```bash
sudo crontab -e
```

```cron
0 3 * * * cd /srv/novadz && sqlite3 data/novadz.db ".backup '/srv/backup/novadz-$(date +\%F).db'" && find /srv/backup -mtime +14 -delete
```

Une sauvegarde par nuit à 3 h, conservée 14 jours.

---

## Mettre à jour le site

```bash
cd /srv/novadz
sudo -u novadz git pull
sudo -u novadz npm ci --omit=dev
sudo systemctl restart novadz
```

---

## Et si tu veux vraiment tourner sur Cloudflare Workers ?

C'est possible, mais c'est une **réécriture**, pas un déploiement. Ce qu'il faudrait :

| Aujourd'hui | Sur Workers |
|---|---|
| Express | Hono ou itty-router |
| `better-sqlite3` (natif) | **D1** (SQLite managé), requêtes à réécrire |
| sessions en mémoire | KV ou Durable Objects |
| `fs` (photos produits, PDF bordereaux) | **R2** |
| 45 tests contre un vrai serveur | tests contre `wrangler dev` |

Estimation honnête : plusieurs jours de travail, et les 45 tests seraient à réécrire.
Tant que la plateforme doit encaisser des commandes, **un VPS à 5 € fait le travail sans risque**.
Le tunnel Cloudflare te donne déjà le HTTPS, le domaine, le cache et la protection DDoS.

---

## Récapitulatif

| Question | Réponse |
|---|---|
| Où tourne l'application ? | ton PC (démo) ou un VPS (production) |
| À quoi sert Cloudflare alors ? | HTTPS, nom de domaine, cache, WAF, DDoS, porte d'entrée |
| Combien ça coûte ? | 0 € côté Cloudflare, 5-10 €/mois le VPS |
| Combien de temps ? | 20 minutes pour l'option A, 1 heure pour la B |
| Ce que je dois vérifier après | `/` s'ouvre, connexion marchand marche, une commande passe |
