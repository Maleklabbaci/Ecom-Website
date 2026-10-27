/* `npm run demo` : les comptes de démonstration doivent exister sans que
   l'utilisateur ait à connaître NOVADZ_DEMO ni à supprimer une base créée
   par un premier `npm start`. Le lanceur force donc le mode démo. */
const { test, before, after } = require("node:test")
const assert = require("node:assert")
const fs = require("node:fs")
const os = require("node:os")
const path = require("node:path")
const { startServer } = require("./boot")

const DB = path.join(os.tmpdir(), `novadz-demo-launcher-${Date.now()}.db`)
let BASE = ""
let server

const form = (obj) => ({
  method: "POST",
  headers: { "Content-Type": "application/x-www-form-urlencoded" },
  body: new URLSearchParams(obj).toString(),
  redirect: "manual",
})

before(async () => {
  for (const suffix of ["", "-wal", "-shm"]) {
    try { fs.unlinkSync(DB + suffix) } catch (_) {}
  }
  const started = await startServer({
    db: DB,
    script: "scripts/demo.js",
    // Volontairement faux : le lanceur doit forcer le mode démo malgré tout.
    env: { NOVADZ_DEMO: "0" },
  })
  server = started.child
  BASE = started.base
})

after(() => {
  if (server) server.kill()
  for (const suffix of ["", "-wal", "-shm"]) {
    try { fs.unlinkSync(DB + suffix) } catch (_) {}
  }
})

test("npm run demo : commande présente et comptes marchand, vitrine et admin accessibles", async () => {
  assert.equal(require("../package.json").scripts.demo, "node scripts/demo.js")

  const cases = [
    ["demo@novadz.dz", "demo1234", "/dashboard"],
    ["vitrine@novadz.dz", "demo1234", "/dashboard"],
    ["admin@novadz.dz", "admin1234", "/admin"],
  ]
  for (const [email, password, location] of cases) {
    const res = await fetch(BASE + "/login", form({ email, password }))
    assert.equal(res.status, 302, email)
    assert.equal(res.headers.get("location"), location, email)
    await res.text()
  }
})
