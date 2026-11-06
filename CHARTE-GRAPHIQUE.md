# NovaDZ — charte graphique

Écrite le 6 novembre. **Le dashboard prend exactement les couleurs de la
landing page.** Mêmes valeurs, mêmes noms, rien de réinventé.

---

## 1. La palette

Ce sont les valeurs de `landing.css`, reprises telles quelles.

| Rôle | Valeur | Note |
|---|---|---|
| Fond des pages | `#000000` | noir, comme la landing |
| Carte / panneau | `#0c0c0c` | noir à peine éclairci |
| Bloc dans un bloc | `#141414` | pour les sous-blocs et les champs |
| Champ | `#121212` | |
| Texte | `#ffffff` | |
| Texte secondaire | `rgba(255,255,255,.72)` | |
| Gris moyen | `rgba(255,255,255,.62)` | `--muted` |
| Gris discret | `rgba(255,255,255,.55)` | `--faint`, le plus clair autorisé |
| Bordure | `rgba(255,255,255,.1)` | `--line` |
| Bordure de champ | `rgba(255,255,255,.14)` | |
| Filet discret | `rgba(255,255,255,.06)` | |

**Et le vert fluo :**

| Rôle | Valeur |
|---|---|
| Le vert fluo (le seul accent) | `#d6ff45` |
| Le même, appuyé (survol) | `#c2eb2e` |
| Le texte posé dessus | `#000000` |
| Le vert en nappe | `rgba(214,255,69,.1)` |

Les états gardent leurs couleurs, relues pour le fond noir : succès
`#4ADE80`, attention `#FBBF24`, information `#7DD3FC`, danger `#F87171`.

**Rien d'autre.** Ni bleu, ni violet, ni dégradé, ni emoji.

---

## 2. Comment on se sert du vert fluo

Le vert fluo **remplit**, il ne s'écrit presque jamais :

- **Oui** : le bouton qui enregistre (fond vert fluo, **texte noir**), une
  pastille, un liseré, le halo d'un champ actif, le filet de 3 px d'une carte.
- **Non** : du texte vert fluo minuscule sur du blanc — on ne le lirait pas.
  Sur fond noir en revanche, il se lit très bien : c'est sa place.

---

## 3. La règle des boutons

- **Un seul bouton en vert fluo par formulaire** : celui qui enregistre, crée
  ou valide.
- Tous les autres sont **gris** : fond `#141414`, bordure
  `rgba(255,255,255,.14)`, texte `rgba(255,255,255,.82)`.
- Les actions destructives sont un **lien rouge** `#F87171`, jamais un bouton
  plein.
- Les petites actions d'une ligne (modifier, voir) sont des **icônes grises**.

---

## 4. Le texte

Police : **Geist** (celle de la landing), avec Inter en secours.
Corps de texte 14 px, interligne 1,5.

| Usage | Taille | Graisse |
|---|---|---|
| Titre de page (`h1`) | 26 px | 600, interlettrage serré |
| Titre de bloc (`h2`) | 16 px | 600 |
| Étiquette de section | 12,5 px | 700, **majuscules**, espacées |
| Chiffre important (KPI) | 30 px | 600 |
| Étiquette de champ | 13 px | 600 |
| Champ | 15 px | 400 |
| Bouton | 13,5 px | 500 |
| Aide sous un champ | 12,5 px | 400, gris |

**Aucun texte en dessous de 12 px**, et aucun sous 4,5:1 de contraste. Ça se
vérifie : un audit automatique passe sur les vingt écrans du dashboard et
compte les textes illisibles. Aujourd'hui il en compte **zéro**.

---

## 5. L'air et les angles

- **40 px** entre deux blocs (le rythme).
- **24 px** de marge à l'intérieur d'une carte.
- **18 px** entre deux champs.
- Angles : 14 px cartes, 10 px champs, 9 px boutons, 999 px pastilles.
- **Pas d'ombre portée** : sur fond noir, une ombre ne se voit pas. On
  sépare avec un filet ou une nuance de noir, jamais avec une ombre.
- Largeur de lecture du dashboard : 1 060 px.

---

## 6. Le tiroir

Une page pose **trois questions**. Le reste descend dans un tiroir
« ▸ Plus de réglages ».

**Rien n'est jamais supprimé** : ce qui est plié est toujours dans la page, et
le tiroir s'ouvre tout seul quand les réglages qu'il contient sont déjà
remplis.

---

## 7. Ce qui est interdit

- Une couleur qui n'est pas dans la palette.
- Deux boutons vert fluo côte à côte.
- Du vert fluo en petit texte sur du blanc.
- Un emoji dans l'interface (dans le contenu du marchand, c'est son choix).
- Un dégradé, une ombre portée, une bordure de 3 px.
- Du texte en dessous de 12 px, ou sous 4,5:1 de contraste.

---

## 8. Ce qui ne bouge pas

**La vitrine garde ses couleurs.** Elle est claire, avec son noir `#111111`
et ses six présentations (Calme, Claire — celle par défaut —, Centré,
Affiche, Séparé, Large). Les boutiques déjà en ligne ne bougent pas d'un
pouce.

Une seule exception, volontaire : **l'aperçu du formulaire**, dans le
dashboard, reste clair — parce qu'il montre ce que voit le client.
