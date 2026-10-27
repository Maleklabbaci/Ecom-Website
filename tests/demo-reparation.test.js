/* Régression vécue : un premier `npm start` crée la base avec un admin au
   mot de passe aléatoire. En relançant ensuite `npm run demo` sur cette
   base, les comptes de démonstration n'étaient jamais créés (le seed
   s'arrêtait dès qu'un utilisateur existait) et le login répondait
   « Cet e-mail n'existe pas ». Le seed démo est maintenant idempotent :
   il crée les comptes manquants et réaligne leurs mots de passe. */
const { test } = require("node:test")
const assert = require("node:assert")
const fs = require("node:fs")
const os = require("node:os")
const path = require("node:path")
const { startServer, openDb } = require("./boot")

const DB = path.join(os.tmpdir(), `novadz-demo-reparation-${Date.now()}.db`)

const form = (obj) => ({
  method: "POST",
  headers: { "Content-Type": "application/x-www-form-urlencoded" },
  body: new URLSearchParams(obj).toString(),
  redirect: "manual",
})

const cleanFiles = () => {
  for (const suffix of ["", "-wal", "-shm"]) {
    try { fs.unlinkSync(DB + suffix) } catch (_) {}
  }
}

const stop = (child) =>
  new Promise((resolve) => {
    if (!child || child.exitCode !== null) return resolve()
    const timer = setTimeout(resolve, 5000)
    child.once("exit", () => { clearTimeout(timer); resolve() })
    child.kill()
  })

const login = async (base, email, password) => {
  const res = await fetch(base + "/login", form({ email, password }))
  const location = res.headers.get("location")
  await res.text()
  return { status: res.status, location }
}

test("npm run demo répare une base déjà créée par npm start", async () => {
  cleanFiles()
  let normal
  let demo
  let demo2
  try {
    /* 1) Mode normal sur base vierge : aucun identifiant de démo connu. */
    normal = await startServer({ db: DB, script: "server.js", env: { NOVADZ_DEMO: "0" } })
    for (const [email, password] of [["demo@novadz.dz", "demo1234"], ["admin@novadz.dz", "admin1234"]]) {
      const r = await login(normal.base, email, password)
      assert.notEqual(r.status, 302, `mode normal : ${email} ne doit pas se connecter`)
    }
    await stop(normal.child)
    normal = null

    /* 2) Mode démo sur la MÊME base : les trois comptes deviennent accessibles. */
    demo = await startServer({ db: DB, script: "scripts/demo.js" })
    const cases = [
      ["demo@novadz.dz", "demo1234", "/dashboard"],
      ["vitrine@novadz.dz", "demo1234", "/dashboard"],
      ["admin@novadz.dz", "admin1234", "/admin"],
    ]
    for (const [email, password, location] of cases) {
      const r = await login(demo.base, email, password)
      assert.equal(r.status, 302, `mode démo après réparation : ${email}`)
      assert.equal(r.location, location, email)
    }
    await stop(demo.child)
    demo = null

    /* 3) Relance démo : toujours accessible, sans doublon créé. */
    demo2 = await startServer({ db: DB, script: "scripts/demo.js" })
    const again = await login(demo2.base, "demo@novadz.dz", "demo1234")
    assert.equal(again.status, 302, "relance démo : le marchand se connecte toujours")
    await stop(demo2.child)
    demo2 = null

    const db = openDb(DB, { readonly: true })
    const n = (sql, email) => db.prepare(sql).get(email).n
    for (const email of ["demo@novadz.dz", "vitrine@novadz.dz", "admin@novadz.dz"]) {
      assert.equal(n("SELECT COUNT(*) AS n FROM users WHERE email = ?", email), 1, `un seul compte ${email}`)
    }
    assert.equal(
      n("SELECT COUNT(*) AS n FROM stores WHERE owner_id = (SELECT id FROM users WHERE email = ?)", "demo@novadz.dz"),
      2, "le marchand démo a ses 2 boutiques, sans doublon")
    assert.equal(
      n("SELECT COUNT(*) AS n FROM stores WHERE owner_id = (SELECT id FROM users WHERE email = ?)", "vitrine@novadz.dz"),
      1, "la vitrine démo a son site, sans doublon")
    db.close()
  } finally {
    await stop(normal && normal.child)
    await stop(demo && demo.child)
    await stop(demo2 && demo2.child)
    cleanFiles()
  }
})
