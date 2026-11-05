"use strict"
/**
 * Les wilayas d'Algérie avec leur code officiel.
 *
 * Depuis la loi 26-06 du 4 avril 2026 (décret 26-206), le pays compte
 * 69 wilayas : les codes 59 à 69 sont nouveaux et ont été pris sur une
 * wilaya « mère » (Aflou vient de Laghouat, Barika de Batna, etc.).
 *
 * Règle importante : les transporteurs (Yalidine, ZR, NOEST, Ecotrack…)
 * n'acceptent encore QUE les codes 1 à 58. Un colis étiqueté « 60 Barika »
 * est refusé. On affiche donc les 69 wilayas au client, et on envoie au
 * transporteur le code de la wilaya mère — le vrai nom reste sur l'étiquette
 * et sur la commande.
 */
const WILAYAS_58 = [
  [1, "Adrar"], [2, "Chlef"], [3, "Laghouat"], [4, "Oum El Bouaghi"], [5, "Batna"],
  [6, "Béjaïa"], [7, "Biskra"], [8, "Béchar"], [9, "Blida"], [10, "Bouira"],
  [11, "Tamanrasset"], [12, "Tébessa"], [13, "Tlemcen"], [14, "Tiaret"], [15, "Tizi Ouzou"],
  [16, "Alger"], [17, "Djelfa"], [18, "Jijel"], [19, "Sétif"], [20, "Saïda"],
  [21, "Skikda"], [22, "Sidi Bel Abbès"], [23, "Annaba"], [24, "Guelma"], [25, "Constantine"],
  [26, "Médéa"], [27, "Mostaganem"], [28, "M'Sila"], [29, "Mascara"], [30, "Ouargla"],
  [31, "Oran"], [32, "El Bayadh"], [33, "Illizi"], [34, "Bordj Bou Arréridj"], [35, "Boumerdès"],
  [36, "El Tarf"], [37, "Tindouf"], [38, "Tissemsilt"], [39, "El Oued"], [40, "Khenchela"],
  [41, "Souk Ahras"], [42, "Tipaza"], [43, "Mila"], [44, "Aïn Defla"], [45, "Naâma"],
  [46, "Aïn Témouchent"], [47, "Ghardaïa"], [48, "Relizane"], [49, "Timimoun"],
  [50, "Bordj Badji Mokhtar"], [51, "Ouled Djellal"], [52, "Béni Abbès"], [53, "In Salah"],
  [54, "In Guezzam"], [55, "Touggourt"], [56, "Djanet"], [57, "El M'Ghair"], [58, "El Meniaa"],
]

/* Les 11 wilayas créées en 2026 : [code, nom, code de la wilaya mère]. */
const NOUVELLES = [
  [59, "Aflou", 3],
  [60, "Barika", 5],
  [61, "El Kantara", 7],
  [62, "Bir El Ater", 12],
  [63, "El Aricha", 13],
  [64, "Ksar Chellala", 14],
  [65, "Aïn Ouessara", 17],
  [66, "Messaad", 17],
  [67, "Ksar El Boukhari", 26],
  [68, "Bou Saâda", 28],
  [69, "El Abiodh Sidi Cheikh", 32],
]

const WILAYAS_69 = WILAYAS_58.concat(NOUVELLES.map(([code, name]) => [code, name]))

const MERE = {}
NOUVELLES.forEach(([code, , mere]) => { MERE[code] = mere })

/** Normalise un nom : minuscules, sans accents, sans tirets ni apostrophes. */
const fold = (s) =>
  String(s || "")
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "")

/** Code officiel d'une wilaya à partir de son nom (tolère « 60 », « Barika », « BARIKA »). */
const codeOf = (name) => {
  const raw = String(name || "").trim()
  if (/^\d{1,2}$/.test(raw)) {
    const n = Number(raw)
    if (n >= 1 && n <= 69) return n
  }
  const f = fold(raw)
  if (!f) return ""
  const exact = WILAYAS_69.find(([, n]) => fold(n) === f)
  if (exact) return exact[0]
  const partial = WILAYAS_69.find(([, n]) => fold(n).startsWith(f) || f.startsWith(fold(n)))
  return partial ? partial[0] : ""
}

/** Nom officiel d'une wilaya à partir de son code. */
const nameOf = (code) => {
  const row = WILAYAS_69.find(([c]) => c === Number(code))
  return row ? row[1] : ""
}

/** Vraie wilaya (aucune mère) : celles qui existaient avant 2026. */
const isNew = (code) => {
  const n = Number(code)
  return n >= 59 && n <= 69
}

/** Code de la wilaya mère, ou le code lui-même s'il n'y a pas de mère. */
const parentCode = (code) => {
  const n = Number(code)
  if (!n) return ""
  return MERE[n] || n
}

/**
 * Code à envoyer au transporteur : la wilaya mère pour les nouvelles.
 * Les sociétés de livraison ne connaissent pas encore les codes 59 à 69.
 */
const shipCode = (code) => parentCode(code)

/** Nom de la wilaya mère (« M'Sila » pour Bou Saâda), ou "" s'il n'y en a pas. */
const parentName = (code) => {
  const n = Number(code)
  if (!MERE[n]) return ""
  return nameOf(MERE[n])
}

module.exports = {
  WILAYAS_58, WILAYAS_69, NOUVELLES, codeOf, nameOf, fold,
  isNew, parentCode, shipCode, parentName,
}
