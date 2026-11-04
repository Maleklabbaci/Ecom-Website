"use strict"
/**
 * Répartition des commandes entre les personnes qui appellent les clients.
 *
 * Une commande qui arrive n'appartient à personne : elle traîne, deux personnes
 * appellent le même client, ou personne ne le fait. Ici chaque commande reçoit
 * un nom, en alternance, et les commandes en cours sont comptées pour équilibrer.
 */
const db = require("./db")

const OPEN = ["nouvelle", "a_verifier", "confirmee", "reportee", "injoignable"]

/** Les personnes de l'équipe qui ont le droit « Commandes ». */
const agents = (storeId) => {
  /* « active » = la personne a ouvert son lien ; « invite » = le lien est
     encore en attente. Une commande peut déjà lui être confiée. */
  const rows = db.prepare(`SELECT id, user_id, name, email, perms, status FROM store_members
    WHERE store_id = ? AND status IN ('active', 'actif', 'invite') ORDER BY id`).all(storeId)
  return rows.filter((m) => {
    try {
      const list = JSON.parse(m.perms || "[]")
      return Array.isArray(list) && (list.includes("all") || list.includes("orders"))
    } catch (_) { return false }
  })
}

const nameOf = (a) => (a.name || String(a.email || "").split("@")[0] || "Équipe").slice(0, 40)

/** Charge actuelle : commandes encore ouvertes, par personne. */
const load = (storeId) => {
  const rows = db.prepare(`SELECT assigned_to, COUNT(*) AS n FROM orders
    WHERE store_id = ? AND fake = 0 AND assigned_to > 0
      AND status IN (${OPEN.map(() => "?").join(",")})
    GROUP BY assigned_to`).all(storeId, ...OPEN)
  const out = new Map()
  for (const r of rows) out.set(r.assigned_to, r.n)
  return out
}

/**
 * Choisit la personne qui a le moins de commandes ouvertes ; à égalité, la
 * première de la liste. Tourne donc toute seule, sans réglage à faire.
 */
const pick = (storeId) => {
  const list = agents(storeId)
  if (!list.length) return 0
  const counts = load(storeId)
  let best = list[0], bestN = Infinity
  for (const a of list) {
    const n = counts.get(a.id) || 0
    if (n < bestN) { best = a; bestN = n }
  }
  return best.id
}

/** Attribue une commande si le vendeur n'a pas déjà choisi quelqu'un. */
const auto = (storeId, orderId) => {
  const id = pick(storeId)
  if (!id) return 0
  db.prepare("UPDATE orders SET assigned_to = ? WHERE id = ? AND store_id = ? AND assigned_to = 0")
    .run(id, orderId, storeId)
  return id
}

/** Répartit toutes les commandes ouvertes qui n'ont personne. */
const spread = (storeId) => {
  const rows = db.prepare(`SELECT id FROM orders WHERE store_id = ? AND fake = 0 AND assigned_to = 0
    AND status IN (${OPEN.map(() => "?").join(",")}) ORDER BY id`).all(storeId, ...OPEN)
  let n = 0
  for (const r of rows) if (auto(storeId, r.id)) n++
  return n
}

/** Nom affichable d'une commande : la personne assignée, sinon vide. */
const label = (storeId, assignedTo) => {
  if (!assignedTo) return ""
  const a = db.prepare("SELECT id, name, email FROM store_members WHERE id = ? AND store_id = ?").get(assignedTo, storeId)
  return a ? nameOf(a) : ""
}

/** Affecte toutes les commandes au même nom (réaffectation manuelle). */
const setAgent = (storeId, orderId, agentId) => {
  const ok = agentId ? db.prepare("SELECT id FROM store_members WHERE id = ? AND store_id = ?").get(agentId, storeId) : null
  db.prepare("UPDATE orders SET assigned_to = ? WHERE id = ? AND store_id = ?")
    .run(ok ? ok.id : 0, orderId, storeId)
}

module.exports = { agents, pick, auto, spread, label, setAgent, nameOf, OPEN }
