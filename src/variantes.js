/* =========================================================================
   LES VARIANTES LIÉES
   =========================================================================

   Avant, les options d'un produit étaient des listes indépendantes :
   « votre iphone » (11, 12) d'un côté, « couleur » (noir, rose) de l'autre,
   et aucun lien entre les deux. On ne pouvait donc pas dire « iphone 11 en
   noir : 2 pièces, iphone 12 en rose : 1 pièce ».

   Maintenant, les options se CROISENT : chaque croisement est une case de la
   grille, avec son propre stock et son propre prix. C'est ce que le marchand
   appelle « linker et stock ».

   Le rangement (dans products.option_groups) accepte les deux écritures :
     - l'ancienne, une simple liste   [{name, options:[…]}]
     - la nouvelle, un objet          {groups:[…], combos:[…], unlimited, style}
   Une boutique enregistrée hier continue donc de fonctionner sans rien faire.
   ========================================================================= */

const MAX_GROUPES = 4
const MAX_OPTIONS = 20
const MAX_CASES = 240
const STYLES = ["boutons", "liste", "deroulant", "pastilles", "grille", "cadres", "rayures", "ronds"]

const texte = (v, n) => String(v == null ? "" : v).trim().slice(0, n)
const entier = (v) => { const n = parseInt(v, 10); return Number.isFinite(n) && n > 0 ? n : 0 }

/** La clé d'un choix : « g1:o1|g2:o3 ». C'est elle qui voyage dans le panier. */
function cle(picks) {
  if (!picks || typeof picks !== "object") return ""
  return Object.keys(picks || {}).sort().map((k) => `${k}:${picks[k]}`).join("|")
}

/** Toutes les combinaisons possibles, dans un ordre stable. */
function matrice(groups) {
  let out = [{}]
  for (const g of groups) {
    const next = []
    for (const p of out) {
      for (const o of g.options) {
        if (next.length >= MAX_CASES) break
        next.push(Object.assign({}, p, { [g.id]: o.id }))
      }
    }
    out = next
    if (!out.length) break
  }
  return out.slice(0, MAX_CASES)
}

/** Le prix d'une case : vide veut dire « le prix du produit ». */
function prix(net) {
  const s = String(net == null ? "" : net).trim().replace(/\s/g, "")
  if (!s) return ""
  const n = Number(String(s).replace(",", "."))
  return Number.isFinite(n) && n >= 0 ? String(Math.round(n * 100) / 100) : ""
}

function normalise(x) {
  x = x && typeof x === "object" ? x : {}
  const vus = new Set()
  const ident = (base) => { let id = base, i = 2; while (vus.has(id)) id = base + i++; vus.add(id); return id }

  /* l'écrémage se fait APRÈS le nettoyage : un titre vide ou sans option ne
     doit pas voler la place d'un titre valide. */
  const groups = (Array.isArray(x.groups) ? x.groups : []).map((g, gi) => {
    const gid = ident(texte(g && g.id, 24) || "g" + (gi + 1))
    const opts = (Array.isArray(g && g.options) ? g.options : [])
      .map((o, oi) => typeof o === "string"
        ? { id: gid + "o" + (oi + 1), label: texte(o, 40) }
        /* l'identifiant est GARDÉ : c'est lui qui relie une case de la grille
           aux options choisies. Le perdre viderait tous les stocks. */
        : { id: texte(o && o.id, 24), label: texte(o && o.label, 40) })
      .filter((o) => o.label)
      .slice(0, MAX_OPTIONS)
      .map((o, oi) => ({ id: ident(texte(o.id, 24) || gid + "o" + (oi + 1)), label: o.label }))
    /* deux options du même nom dans le même groupe, c'est une erreur de saisie */
    const vues = new Set()
    return { id: gid, name: texte(g && g.name, 40), options: opts.filter((o) => !vues.has(o.label) && vues.add(o.label)) }
  }).filter((g) => g.name && g.options.length).slice(0, MAX_GROUPES)

  const existants = new Map()
  ;(Array.isArray(x.combos) ? x.combos : []).forEach((c) => { if (c && c.picks) existants.set(cle(c.picks), c) })

  const combos = matrice(groups).map((picks) => {
    const ex = existants.get(cle(picks)) || {}
    return {
      picks,
      stock: Math.max(0, entier(ex.stock)),
      price: prix(ex.price),
      unlimited: !!ex.unlimited,
      on: ex.on === false ? false : true,
    }
  })

  return {
    groups,
    combos,
    /* « Recevoir les commandes même en rupture » : à cocher une fois pour tout
       le produit, ou case par case dans la grille. */
    unlimited: !!x.unlimited,
    style: STYLES.includes(x.style) ? x.style : "boutons",
  }
}

/** Lit ce qui est en base, ancien format compris. Accepte la chaîne JSON
    (celle de la base) ou déjà l'objet. */
function lire(raw) {
  let x = null
  if (raw && typeof raw === "object") x = raw
  else { try { x = JSON.parse(raw || "") } catch (_) { x = null } }
  if (Array.isArray(x)) {
    /* ancienne écriture : une liste de groupes, sans stock lié */
    return normalise({ groups: x.map((g, gi) => ({ id: "g" + (gi + 1), name: g && g.name, options: g && g.options })) })
  }
  return normalise(x)
}

const ecrire = (data) => (data && data.groups && data.groups.length ? JSON.stringify(normalise(data)) : "")

/**
 * Vrai si le marchand a vraiment REMPLI la grille : au moins une case servie,
 * ou la case « recevoir les commandes même en rupture » cochée.
 *
 * C'est la soupape de sécurité des boutiques déjà en ligne : un produit qui
 * avait de simples listes d'options (Taille : S/M/L) et son stock produit
 * garde son ancien fonctionnement tant que la grille est vide. Sinon elle
 * se retrouverait invendable du jour au lendemain.
 */
function servie(data) {
  if (!data) return false
  if (data.unlimited) return true
  return (data.combos || []).some((c) => (Number(c.stock) || 0) > 0 || c.unlimited)
}

/** Retrouve une case à partir de sa clé toute faite (« g1:o1|g2:o3 ») —
    c'est cette clé qui voyage dans le panier et dans l'inventaire. */
function parCle(data, k) {
  const s = String(k || "")
  if (!s) return null
  return ((data && data.combos) || []).find((c) => cle(c.picks) === s) || null
}

/** Retrouve la case de la grille qui correspond à un choix. */
function combinaison(data, picks) {
  const k = cle(picks)
  if (!k) return null
  return (data && data.combos || []).find((c) => cle(c.picks) === k) || null
}

/** « votre iphone : 11 · couleur : noir » — ce que le marchand lit sur la commande. */
function etiquette(data, picks) {
  if (!data || !Array.isArray(data.groups)) return ""
  const parts = []
  for (const g of data.groups) {
    const o = g.options.find((x) => x.id === (picks || {})[g.id])
    if (o) parts.push(`${g.name} : ${o.label}`)
  }
  return parts.join(" · ")
}

/** La liste des choix, dans l'ordre des groupes. */
function choix(data, picks) {
  if (!data || !Array.isArray(data.groups)) return []
  const out = []
  for (const g of data.groups) {
    const o = g.options.find((x) => x.id === (picks || {})[g.id])
    if (o) out.push({ groupe: g.name, option: o.label })
  }
  return out
}

/**
 * De quoi dispose-t-on vraiment ?
 * Le produit peut être « stock illimité » (on prend les commandes même à zéro),
 * la case de la grille aussi. Sinon, il faut assez de pièces.
 */
function disponible(data, picks, quantite, stockProduit) {
  const qte = Math.max(1, entier(quantite) || 1)
  if (!data || !Array.isArray(data.groups) || !data.groups.length) {
    return { ok: true, stock: stockProduit, unlimited: false }
  }
  const c = combinaison(data, picks)
  if (!c) return { ok: false, stock: 0, unlimited: false, inconnu: true }
  if (!c.on) return { ok: false, stock: c.stock, unlimited: !!c.unlimited, ferme: true }
  if (data.unlimited || c.unlimited) return { ok: true, stock: c.stock, unlimited: true }
  return { ok: c.stock >= qte, stock: c.stock, unlimited: false }
}

/**
 * Retrouve une case à partir de son libellé (« votre iphone : 11 · couleur : noir »).
 * C'est ce libellé qui voyage dans le panier et sur la commande : il faut donc
 * pouvoir remonter de lui jusqu'à la bonne case de la grille.
 */
function parEtiquette(data, label) {
  const cherche = String(label || "").trim()
  if (!cherche || !data || !Array.isArray(data.combos)) return null
  return data.combos.find((c) => etiquette(data, c.picks) === cherche) || null
}

/** Enlève les pièces du stock après une commande. */
function retirer(data, picks, quantite) {
  const qte = Math.max(1, entier(quantite) || 1)
  const c = combinaison(data, picks)
  if (!c || data.unlimited || c.unlimited) return data
  c.stock = Math.max(0, c.stock - qte)
  return data
}

/** Le prix à payer pour ce choix (en centimes), sinon celui du produit. */
function prixDe(data, picks, prixProduitCents) {
  const c = combinaison(data, picks)
  if (c && c.price) return Math.round(Number(c.price) * 100)
  return prixProduitCents
}

module.exports = { lire, ecrire, normalise, matrice, cle, combinaison, parEtiquette, parCle, servie, etiquette, choix, disponible, retirer, prixDe, STYLES, MAX_GROUPES, MAX_OPTIONS, MAX_CASES }
