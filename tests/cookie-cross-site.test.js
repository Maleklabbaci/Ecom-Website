/* APERÇU DANS UNE IFRAME — le cookie de session doit survivre.
   Un site montré dans une iframe (aperçu, portail) est un contexte tiers :
   un cookie `SameSite=Lax` n'y est pas renvoyé, donc la connexion ne tient pas
   et on revient sans fin sur l'écran de connexion.
   NOVADZ_COOKIE_SAMESITE=none règle ça ; sans la variable, le comportement
   d'origine (Lax, non secure) est conservé.
*/
const { test, before, after } = require("node:test")
const assert = require("node:assert")
const os = require("node:os")
const path = require("node:path")

const { startServer } = require("./boot")
const form = (obj) => ({
  method: "POST",
  headers: { "Content-Type": "application/x-www-form-urlencoded" },
  body: new URLSearchParams(obj).toString(),
})

const servers = []
after(() => servers.forEach((s) => s.child && s.child.kill("SIGKILL")))

const boot = async (env) => {
  const db = path.join(os.tmpdir(), `novadz-cookie-${process.pid}-${servers.length}.db`)
  const s = await startServer({ db, env })
  servers.push(s)
  return s
}

test("par défaut, le cookie de session reste Lax et non secure", async () => {
  const s = await boot({})
  const res = await fetch(s.base + "/login", { ...form({ email: "demo@novadz.dz", password: "demo1234" }), redirect: "manual" })
  const cookies = res.headers.getSetCookie ? res.headers.getSetCookie() : []
  const sid = cookies.find((c) => c.startsWith("sid=")) || ""
  assert.ok(sid, "un cookie sid doit être posé")
  assert.match(sid, /SameSite=Lax/i)
  assert.doesNotMatch(sid, /Secure/i)
})

test("dans une iframe (SameSite=none), le cookie est envoyé et la connexion tient", async () => {
  const s = await boot({ NOVADZ_COOKIE_SAMESITE: "none" })
  const res = await fetch(s.base + "/login", { ...form({ email: "demo@novadz.dz", password: "demo1234" }), redirect: "manual" })
  const cookies = res.headers.getSetCookie ? res.headers.getSetCookie() : []
  const sid = cookies.find((c) => c.startsWith("sid=")) || ""
  assert.ok(sid, "un cookie sid doit être posé")
  assert.match(sid, /SameSite=None/i)
  assert.match(sid, /Secure/i)

  /* la session tient : le tableau de bord répond 200 avec ce cookie */
  const cookie = sid.split(";")[0]
  const dash = await fetch(s.base + "/dashboard", { headers: { cookie }, redirect: "manual" })
  assert.equal(dash.status, 200)
  const studio = await fetch(s.base + "/dashboard/studio", { headers: { cookie }, redirect: "manual" })
  assert.ok([200, 302].includes(studio.status))
})
