"use strict"
/**
 * Couche SQLite : un seul point d'entrée pour toute la plateforme.
 *
 * Pourquoi ce fichier existe : `better-sqlite3` est un module natif. Sa version 11
 * n'a AUCUN binaire compilé pour Node 24 — sur un Node 24 il tente de compiler avec
 * Visual Studio et l'installation échoue (erreur « Could not find any Visual Studio
 * installation »). C'est exactement ce qui bloque un poste Windows récent.
 *
 * Deux protections :
 *  1. la dépendance est en `optionalDependencies` : si sa compilation échoue, npm
 *     continue au lieu de tout arrêter ;
 *  2. si le module natif est absent, on bascule sur `node:sqlite`, le SQLite
 *     intégré à Node (disponible depuis Node 22.5, stable en 24).
 *
 * L'API exposée imite celle de better-sqlite3 (prepare/get/all/run/exec/pragma/
 * transaction) : aucun autre fichier du projet n'a besoin de savoir laquelle est utilisée.
 *
 * Forcer une implémentation :  NOVADZ_SQLITE=native  ou  NOVADZ_SQLITE=node
 */
const path = require("path")

let ACTUAL = null               // pilote réellement ouvert : "native" ou "node"

const which = () => {
  if (ACTUAL) return ACTUAL
  const forced = String(process.env.NOVADZ_SQLITE || "").toLowerCase()
  if (forced === "native" || forced === "node") return forced
  try {
    require.resolve("better-sqlite3")
    return "native"
  } catch (_) {
    return "node"
  }
}

/* ------------------------------ implémentation native ------------------------------ */
const openNative = (file) => {
  const Database = require("better-sqlite3")
  const db = new Database(file)
  db.pragma("journal_mode = WAL")
  return db
}

/* ------------------------------ implémentation node:sqlite ------------------------------ */
const openNode = (file) => {
  const { DatabaseSync } = require("node:sqlite")
  const raw = new DatabaseSync(file)
  raw.exec("PRAGMA journal_mode = WAL")

  let depth = 0

  const wrap = (sql) => {
    const st = raw.prepare(sql)
    return {
      raw: st,
      all: (...args) => st.all(...args),
      get: (...args) => st.get(...args),
      run: (...args) => {
        const r = st.run(...args)
        return {
          changes: Number(r.changes || 0),
          /* node:sqlite renvoie un BigInt : on repasse en Number pour le reste du code */
          lastInsertRowid: Number(r.lastInsertRowid || 0),
        }
      },
      iterate: (...args) => st.all(...args),
      pluck: () => wrap(sql),
      safeIntegers: () => wrap(sql),
    }
  }

  const api = {
    prepare: (sql) => wrap(sql),
    exec: (sql) => raw.exec(sql),
    pragma: (p) => raw.exec(/^\s*pragma/i.test(String(p)) ? p : `PRAGMA ${p}`),
    transaction: (fn) => (...args) => {
      const savepoint = `sp${depth}`
      raw.exec(depth === 0 ? "BEGIN" : `SAVEPOINT ${savepoint}`)
      depth++
      try {
        const out = fn(...args)
        depth--
        raw.exec(depth === 0 ? "COMMIT" : `RELEASE ${savepoint}`)
        return out
      } catch (e) {
        depth--
        try { raw.exec(depth === 0 ? "ROLLBACK" : `ROLLBACK TO ${savepoint}`) } catch (_) { }
        throw e
      }
    },
    close: () => raw.close(),
    _raw: raw,
    _impl: "node:sqlite",
  }
  return api
}

/**
 * Ouvre la base. Renvoie un objet identique à une base better-sqlite3.
 */
const open = (file, opts = {}) => {
  const dbPath = path.resolve(file)
  const impl = which()
  if (impl === "node") return (ACTUAL = "node"), openNode(dbPath, opts)
  try {
    const db = openNative(dbPath, opts)
    ACTUAL = "native"
    return db
  } catch (e) {
    /* module présent mais binaire incompatible (ABI différente) : on bascule */
    try {
      const db = openNode(dbPath, opts)
      ACTUAL = "node"
      console.warn(`[sqlite] module natif inutilisable (${e.message}) — bascule sur node:sqlite`)
      return db
    } catch (_) {
      throw e
    }
  }
}

module.exports = { open, which }
