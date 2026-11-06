# NovaDZ — charte graphique

Écrite le 6 novembre. **Le dashboard est CLAIR.** Du blanc, du noir, du gris
— et le vert fluo de la landing page, qui est le seul accent.

---

## 1. La palette

| Rôle | Valeur |
|---|---|
| Fond des pages | `#F6F5F3` (papier) |
| Carte / panneau | `#FFFFFF` |
| Bloc dans un bloc | `#FAFAF9` |
| Champ | `#FFFFFF` |
| Encre (titres) | `#111111` |
| Texte | `#313131` |
| Gris moyen | `#5F6570` |
| Gris discret | `#6A7080` (le plus clair autorisé) |
| Bordure de carte | `#EAE7E2` |
| Bordure de champ | `#DDD9D3` |
| Filet discret | `#F4F2EF` |

**Et le vert fluo, venu de la landing :**

| Rôle | Valeur |
|---|---|
| Le vert fluo (le seul accent) | `#d6ff45` |
| Le même, appuyé (survol) | `#c2eb2e` |
| Le texte posé dessus | `#111111` (du noir) |
| Le vert en nappe | `#FAFFE0` |
| Le vert, lisible en texte sur fond clair | `#5B7A00` |

Les états gardent leurs couleurs : succès `#15803D`, attention `#B45309`,
information `#1D4ED8`, danger `#B91C1C`.

**Rien d'autre.** Ni bleu, ni violet, ni dégradé, ni emoji.

---

## 2. Comment on se sert du vert fluo

Le vert fluo **remplit**, il ne s'écrit presque jamais :

- **Oui** : le bouton qui enregistre (fond vert fluo, **texte noir**), une
  pastille, le halo d'un champ actif, le filet de 3 px sous le titre de page,
  la barre d'une carte de chiffre.
- **Non** : du texte vert fluo sur du blanc — on ne le lirait pas. Pour
  écrire en vert sur fond clair, on prend la version foncée `#5B7A00`.

---

## 3. La règle des boutons

- **Un seul bouton en vert fluo par formulaire** : celui qui enregistre, crée
  ou valide.
- Tous les autres sont **gris** : fond blanc, bordure `#DDD9D3`, texte
  `#3F3F46`.
- Les actions destructives sont un **lien rouge** `#B91C1C`, jamais un bouton
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
vérifie : un audit automatique passe sur les vingt-quatre écrans du dashboard
et compte les textes illisibles. Aujourd'hui il en compte **zéro**.

---

## 5. L'air et les angles

- **40 px** entre deux blocs (le rythme).
- **24 px** de marge à l'intérieur d'une carte.
- **18 px** entre deux champs.
- Angles : 14 px cartes, 10 px champs, 9 px boutons, 999 px pastilles.
- Une seule ombre, très douce (`0 1px 2px rgba(17,17,17,.03)`). Une ombre
  qu'on remarque est une ombre ratée.
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
- Du vert fluo en texte sur du blanc.
- Un emoji dans l'interface (dans le contenu du marchand, c'est son choix).
- Un dégradé, une ombre portée marquée, une bordure de 3 px.
- Du texte en dessous de 12 px, ou sous 4,5:1 de contraste.

---

## 8. Ce qui ne bouge pas

**La vitrine garde ses couleurs.** Elle est claire elle aussi, avec son noir
`#111111` et ses six présentations (Calme, Claire — celle par défaut —,
Centré, Affiche, Séparé, Large). Les boutiques déjà en ligne ne bougent pas
d'un pouce.
