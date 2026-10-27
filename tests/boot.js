"use strict"
/** Démarre NovaDZ et les faux bureaux sur un port libre. Aucun port fixe. */
const { spawn } = require("node:child_process")
const path = require("node:path")

function listen0(server, host = "127.0.0.1") {
  return new Promise((resolve, reject) => {
    const onErr = (err) => reject(err)
    server.once("error", onErr)
    server.listen(0, host, () => {
      server.off("error", onErr)
      resolve(server.address().port)
    })
  })
}

function startServer({ db, env = {}, cwd, timeout = 30000 } = {}) {
  const child = spawn(process.execPath, ["server.js"], {
    cwd: cwd || path.join(__dirname, ".."),
    /* les tests travaillent sur les boutiques de démonstration (NOVADZ_DEMO=1) */
    env: { ...process.env, PORT: "0", NOVADZ_DB: db, NOVADZ_DEMO: "1", ...env },
    stdio: ["ignore", "pipe", "pipe"],
  })
  let buf = ""
  const ready = new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error("Le serveur n'a pas annoncé son port.\n" + buf.slice(-1200)))
    }, timeout)
    const take = (chunk) => {
      buf += chunk.toString()
      const m = buf.match(/NOVADZ_LISTEN (\d+)/)
      if (!m) return
      clearTimeout(timer)
      resolve(Number(m[1]))
    }
    child.stdout.on("data", take)
    child.stderr.on("data", take)
    child.once("exit", (code) => {
      clearTimeout(timer)
      reject(new Error("Le serveur s'est arrêté (" + code + ").\n" + buf.slice(-1200)))
    })
  })
  return ready.then(async (port) => {
    const base = `http://127.0.0.1:${port}`
    for (let i = 0; i < 50; i++) {
      try {
        const r = await fetch(base + "/")
        await r.text().catch(() => {})
        if (r.status) return { child, port, base }
      } catch (_) {}
      await new Promise((r) => setTimeout(r, 100))
    }
    throw new Error("Le serveur écoute mais ne répond pas sur " + base)
  })
}

/**
 * Ouvre la base de test avec LA MÊME couche que l'application (src/sqlite).
 * Ne jamais require("better-sqlite3") directement dans les tests : c'est une
 * dépendance optionnelle, absente quand le binaire natif n'existe pas pour la
 * version de Node (le serveur bascule alors sur node:sqlite, les tests aussi).
 */
const openDb = (file, opts) => require("../src/sqlite").open(file, opts)

module.exports = { listen0, startServer, openDb }
