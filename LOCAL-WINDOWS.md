# Lancer NovaDZ sur ton PC (Windows)

Suis les étapes dans l'ordre. À chaque étape, je te dis ce que tu dois voir.
Si un message d'erreur apparaît, va à la section « Ça coince » en bas.

**Durée totale : 10 minutes.** Rien à payer, rien à configurer chez un hébergeur.

---

## Étape 1 — Vérifier que Node.js est installé

Ouvre **PowerShell** : touche Windows, tape `powershell`, Entrée.

```powershell
node -v
```

**Ce que tu dois voir :** un numéro qui commence par **v22** ou **v24** (par exemple `v24.20.0`).

- `v22.x` → parfait.
- `v24.x` → parfait aussi (le projet est corrigé pour Node 24, voir « Ça coince »).
- `v20.x` ou plus ancien → mets à jour :

```powershell
winget install OpenJS.NodeJS.LTS
```

Puis **ferme PowerShell, rouvre-le** et retape `node -v`.

**Si tu vois une erreur rouge** (« node n'est pas reconnu »), c'est que Node n'est pas installé :
lance la commande `winget` ci-dessus.

---

## Étape 2 — Extraire le zip

Clic droit sur `novadz-final-github.zip` → **Extraire tout** → choisis un chemin simple, par exemple :

```
C:\novadz
```

Évite le Bureau, les Téléchargements, OneDrive et les chemins avec des accents. Après extraction,
tu dois voir `server.js` directement dans `C:\novadz` (pas dans `C:\novadz\novadz-final-github\`).

Vérifie dans PowerShell :

```powershell
cd C:\novadz
dir
```

**Ce que tu dois voir :** `server.js`, `src`, `public`, `tests`, `package.json`, etc.

---

## Étape 3 — Installer les dépendances

Toujours dans `C:\novadz` :

```powershell
npm install
```

**Ce que tu dois voir :** une barre de progression, puis `NovaDZ pret. Lance: npm start`.

Ça télécharge deux bibliothèques (Express et le moteur SQLite). Ça prend 1 à 3 minutes.
Un avertissement jaune `npm warn` est normal, **une erreur rouge ne l'est pas**.

---

## Étape 4 — Démarrer la plateforme

```powershell
npm start
```

**Ce que tu dois voir :**

```
NovaDZ — plateforme multi-boutiques
   http://localhost:3000
   Marchand : demo@novadz.dz / demo1234
   Admin    : admin@novadz.dz / admin1234
```

**Laisse cette fenêtre ouverte.** Tant qu'elle est ouverte, la plateforme tourne.
Si tu la fermes ou fais Ctrl+C, le site s'arrête (normal, rien n'est perdu).

Au premier démarrage, le fichier `C:\novadz\data\novadz.db` est créé avec des données de
démonstration : 2 boutiques, des produits, des commandes.

---

## Étape 5 — Ouvrir dans le navigateur

Ouvre Chrome ou Edge et va sur :

```
http://localhost:3000
```

**Ce que tu dois voir :** la page d'accueil NovaDZ avec les boutiques de démonstration.

Ne tape pas `https://` — c'est `http://` en local, sinon le navigateur affiche une erreur.

---

## Étape 6 — Se connecter et tout visiter

1. Va sur `http://localhost:3000/login`
2. Connecte-toi avec **`demo@novadz.dz`** / **`demo1234`**

Tu arrives sur le tableau de bord marchand. Les écrans à regarder dans cet ordre :

| Écran | Ce qu'il faut vérifier |
|---|---|
| **Produits** | la liste s'affiche, tu peux ouvrir une fiche |
| **Commandes** | tu vois les commandes de démonstration, clique sur une : facture, bon de livraison |
| **Design** | l'éditeur s'ouvre, les sections se réordonnent |
| **Landings** | les pages de vente par produit |
| **Anti-fraude & pixels** | les réglages CAPTCHA et le score de risque |
| **Transporteur** | choisis Yalidine dans la liste, tous les champs se remplissent |
| **Paniers abandonnés** | la page s'ouvre (vide au début, c'est normal) |
| **Statistiques livraison** | les compteurs s'affichent |

Teste aussi le côté client : retourne sur `http://localhost:3000`, entre dans une boutique,
ajoute un produit au panier, passe une commande. Elle apparaîtra aussitôt dans **Commandes**.

---

## Étape 7 — Tester depuis ton téléphone (optionnel, 1 minute)

Ton PC et ton téléphone doivent être sur le **même Wi-Fi**.

Sur le PC, trouve ton adresse locale :

```powershell
ipconfig
```

Cherche la ligne **Adresse IPv4** de ta carte Wi-Fi, par exemple `192.168.1.24`.

Sur le téléphone, ouvre `http://192.168.1.24:3000`.

**Si ça ne s'ouvre pas :** Windows Defender a bloqué le port. Autorise Node.js quand la fenêtre
« Pare-feu Windows » apparaît, ou clique « Autoriser l'accès ».

---

## Étape 8 — Arrêter et redémarrer

- **Arrêter** : dans la fenêtre PowerShell, `Ctrl + C`.
- **Redémarrer** : `cd C:\novadz` puis `npm start`.

Tu n'as pas à refaire `npm install` : les dépendances restent dans `node_modules`.

---

## Où sont tes données

| Quoi | Où |
|---|---|
| Base de données (boutiques, produits, commandes) | `C:\novadz\data\novadz.db` |
| Photos envoyées | `C:\novadz\public\uploads\` |
| Bordereaux PDF téléchargés | `C:\novadz\data\labels\` |

**Sauvegarde** : copie le fichier `novadz.db` quelque part. C'est tout.
**Repartir de zéro** : arrête (`Ctrl+C`), supprime le dossier `data`, relance `npm start`.
Tu retrouves les données de démonstration neuves.

---

## Ça coince

| Message | Cause | Solution |
|---|---|---|
| `node : n'est pas reconnu` | Node.js absent ou PowerShell pas rouvert | installe avec `winget install OpenJS.NodeJS.LTS`, **ferme et rouvre** PowerShell |
| `EADDRINUSE : port 3000 déjà utilisé` | un autre programme occupe le port | `$env:PORT=3001; npm start` puis ouvre `http://localhost:3001` |
| `Cannot find module 'express'` | `npm install` pas fait, ou lancé ailleurs | vérifie que tu es dans `C:\novadz` (`dir` doit montrer `server.js`), refais `npm install` |
| Erreur rouge `node-gyp` / `find VS` / `Could not find any Visual Studio installation` | ancienne version du paquet SQLite, ou `node_modules` à moitié installé | voir la section **Node 24 / erreur node-gyp** juste en dessous |
| `EPERM: operation not permitted, rmdir …node_modules\…` | un programme tient un fichier ouvert (VS Code, antivirus, OneDrive) | ferme VS Code, supprime `node_modules`, réinstalle |
| Page blanche ou « site inaccessible » | la fenêtre `npm start` a été fermée | relance `npm start`, vérifie le port affiché |
| Le pare-feu demande une autorisation | normal | clique **Autoriser l'accès** |
| `npm start` s'arrête tout seul avec une erreur | bug ou fichier manquant | recopie le message d'erreur complet et envoie-le moi |
| La fenêtre **rend la main tout de suite** et le navigateur dit `localhost n'autorise pas la connexion` / `ERR_CONNECTION_REFUSED` | le serveur n'a pas démarré (port occupé, antivirus, ou fenêtre fermée) | lance `powershell -ExecutionPolicy Bypass -File .\demarrer.ps1` : il démarre, **vérifie que le serveur répond vraiment**, puis ouvre le navigateur |
| Tu veux savoir si le serveur tourne | — | dans un autre PowerShell : `Get-Process node` (une ligne = il tourne). Pour l'arrêter : `Get-Process node \| Stop-Process` |
| Le port 3000 est déjà pris | une autre fenêtre fait déjà tourner NovaDZ | ferme l'autre fenêtre, ou lance `$env:PORT=3001; npm start` puis ouvre `http://localhost:3001` |

---

## Le plus simple : `demarrer.ps1`

Dans le dossier de NovaDZ :

```powershell
powershell -ExecutionPolicy Bypass -File .\demarrer.ps1
```

Ce script vérifie Node, installe les dépendances si besoin, démarre le serveur **dans sa propre
fenêtre**, attend qu'il réponde vraiment (`http://localhost:3000` testé pour de vrai), puis ouvre
ton navigateur. Si ça ne marche pas, il te dit précisément pourquoi.

Depuis la version du 20/10, `npm start` affiche aussi :

```
  Adresse      : http://localhost:3000
  SQLite       : native
  Garde cette fenetre OUVERTE. Ctrl+C pour arreter.
  OK : http://localhost:3000 repond (HTTP 200).
```

La dernière ligne est un **auto-test** : le serveur se contacte lui-même. Si tu ne la vois pas,
c'est que le serveur ne répond pas et le message du dessous explique pourquoi.

---

## Node 24 / erreur `node-gyp`

### Pourquoi ça arrivait

`better-sqlite3` est un module **compilé** (du C++). L'ancienne version du projet (11.x)
n'avait pas de binaire prêt pour Node 24 : npm essayait de le compiler sur ton PC, ne trouvait
pas Visual Studio, et s'arrêtait sur :

```
gyp ERR! find VS  ../../../node_modules/better-sqlite3/build/config.gypi
gyp ERR! find VS Could not find any Visual Studio installation to use
```

**Ce n'est pas ton PC le problème**, et tu n'as rien à installer en plus (surtout pas Visual
Studio : 6 Go pour rien). Le zip corrigé contient deux protections :

1. `better-sqlite3` **12.11.1**, qui fournit un binaire prêt pour Node 22 **et** Node 24 ;
2. il est en dépendance **facultative** : si jamais il ne s'installe pas, NovaDZ bascule
   tout seul sur le SQLite intégré à Node (`node:sqlite`). L'app démarre quand même.

### Repartir proprement (à faire une fois)

Dans PowerShell, place-toi dans **le nouveau dossier extrait** puis :

```powershell
cd C:\novadz
Remove-Item -Recurse -Force node_modules -ErrorAction SilentlyContinue
Remove-Item -Force package-lock.json -ErrorAction SilentlyContinue
npm install
```

**Ce que tu dois voir à la fin :**

```
NovaDZ pret. SQLite: native - Lance: npm start
added 104 packages in 3s
```

- `SQLite: native` → le binaire précompilé a été téléchargé, tout est normal.
- `SQLite: node` → le module natif a été sauté, Node utilise son SQLite interne : **c'est bon
  aussi**, l'app fonctionne exactement pareil.

Ensuite :

```powershell
npm start
```

Puis ouvre `http://localhost:3000`.

### Si `npm install` échoue encore

Vérifie ta version (`node -v`), puis force Node 22 qui a le plus de recul :

```powershell
winget install OpenJS.NodeJS.LTS
```

Ferme PowerShell, rouvre-le, `node -v` doit afficher `v22.x`, puis refais :

```powershell
cd C:\novadz
Remove-Item -Recurse -Force node_modules -ErrorAction SilentlyContinue
npm install
```

### Ne pas travailler dans Téléchargements / OneDrive

Un dossier dans `C:\Users\…\Downloads` synchronisé OneDrive provoque des `EPERM` et des
fichiers verrouillés pendant `npm install`. Travaille dans `C:\novadz`.

---

## Pour vérifier que tout est sain (facultatif)

```powershell
npm test
```

**Ce que tu dois voir à la fin :**

```
ℹ tests 45
ℹ pass 45
ℹ fail 0
```

(les anciennes versions de Node affichent `# tests 45` — même chose)

Ça démarre un faux serveur, passe de vraies commandes, et vérifie 45 points : panier, commande,
facture, stock, CAPTCHA, transporteurs, bordereau PDF, relances. Si tout passe, ton installation
est bonne.

---

## Ensuite

Quand tu as fini de tester en local, deux suites possibles :

1. **Avoir une adresse publique** (`https://novadz.tondomaine.dz`) sans rien payer — tunnel
   Cloudflare depuis ce même PC. Voir `DEPLOIEMENT-CLOUDFLARE.md`, option A.
2. **Mettre le code sur GitHub** — `pousser-github.ps1` dans le même dossier.

Dis-moi où tu bloques, avec le message exact, et on reprend là.
