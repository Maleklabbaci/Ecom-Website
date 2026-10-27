"use strict"
/**
 * Les 58 wilayas avec leur code officiel.
 * Les API des transporteurs demandent presque toujours le CODE, alors que la
 * boutique stocke le NOM : cette table fait la conversion.
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

/** Normalise un nom : minuscules, sans accents, sans tirets ni apostrophes. */
const fold = (s) =>
  String(s || "")
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "")

/** Code officiel d'une wilaya à partir de son nom (tolère « 16 », « Alger », « ALGER »). */
const codeOf = (name) => {
  const raw = String(name || "").trim()
  if (/^\d{1,2}$/.test(raw)) {
    const n = Number(raw)
    if (n >= 1 && n <= 58) return n
  }
  const f = fold(raw)
  if (!f) return ""
  const exact = WILAYAS_58.find(([, n]) => fold(n) === f)
  if (exact) return exact[0]
  const partial = WILAYAS_58.find(([, n]) => fold(n).startsWith(f) || f.startsWith(fold(n)))
  return partial ? partial[0] : ""
}

/** Nom officiel d'une wilaya à partir de son code. */
const nameOf = (code) => {
  const row = WILAYAS_58.find(([c]) => c === Number(code))
  return row ? row[1] : ""
}

module.exports = { WILAYAS_58, codeOf, nameOf, fold }
