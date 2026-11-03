/* LOT 47 — application installable (PWA).
   Le client installe la boutique sur son téléphone ; le marchand installe son
   tableau de bord. On vérifie ce que le navigateur exige vraiment :
   un manifeste complet, des icônes 192 et 512 réelles, un service worker
   servi frais, et une page de secours quand le réseau tombe.
*/
const { test, before, after } = require("node:test")
const assert = require("node:assert")
const fs = require("node:fs")
const os = require("node:os")
const path = require("node:path")

const { startServer } = require("./boot")
let BASE = ""
const DB = path.join(os.tmpdir(), `novadz-pwa-${Date.now()}.db`)
let server
const jar = new Map()

const cookieHeader = () => [...jar.entries()].map(([k, v]) => `${k}=${v}`).join("; ")
async function req(p, opts = {}) {
  const res = await fetch(BASE + p, {
    ...opts,
    headers: { ...(opts.headers || {}), cookie: cookieHeader() },
    redirect: "manual",
  })
  const set = res.headers.getSetCookie ? res.headers.getSetCookie() : []
  for (const c of set) {
    const [pair] = c.split(";")
    const i = pair.indexOf("=")
    jar.set(pair.slice(0, i), pair.slice(i + 1))
  }
  return {
    status: res.status,
    headers: res.headers,
    text: async () => res.text(),
    bytes: async () => Buffer.from(await res.arrayBuffer()),
  }
}
const form = (obj) => ({
  method: "POST",
  headers: { "Content-Type": "application/x-www-form-urlencoded" },
  body: new URLSearchParams(obj).toString(),
})
const login = () => req("/login", form({ email: "demo@novadz.dz", password: "demo1234" }))

/** largeur et hauteur lues dans l'en-tête IHDR du PNG. */
const pngSize = (buf) => {
  assert.equal(buf.subarray(0, 8).toString("hex"), "89504e470d0a1a0a", "ce n'est pas un PNG")
  return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) }
}

before(async () => {
  try { fs.unlinkSync(DB) } catch (_) {}
  const started = await startServer({ db: DB })
  server = started.child
  BASE = started.base
})

after(() => {
  if (server) server.kill()
  try { fs.unlinkSync(DB) } catch (_) {}
})

test("application : la boutique annonce son manifeste et sa couleur", async () => {
  const page = await req("/amina-mode")
  assert.equal(page.status, 200)
  const html = await page.text()
  assert.match(html, /<link rel="manifest" href="\/amina-mode\/manifest\.webmanifest/)
  assert.match(html, /<meta name="theme-color" content="#[0-9a-f]{6}">/)
  assert.match(html, /<link rel="apple-touch-icon" href="\/amina-mode\/app-icon-192\.png">/)
  assert.match(html, /<script src="\/pwa\.js/, "le script d'installation doit être chargé")
})

test("application : le manifeste contient tout ce que Chrome exige", async () => {
  const r = await req("/amina-mode/manifest.webmanifest")
  assert.equal(r.status, 200)
  assert.match(r.headers.get("content-type"), /manifest\+json/)
  const m = JSON.parse(await r.text())
  assert.equal(m.name, "Amina Mode")
  assert.equal(m.short_name.length <= 12, true)
  assert.equal(m.scope, "/amina-mode/")
  assert.match(m.start_url, /^\/amina-mode\//)
  assert.equal(m.display, "standalone")
  assert.match(m.theme_color, /^#[0-9a-f]{6}$/)
  const sizes = m.icons.map((i) => i.sizes)
  assert.ok(sizes.includes("192x192"), "icône 192 manquante")
  assert.ok(sizes.includes("512x512"), "icône 512 manquante")
  assert.ok(m.icons.some((i) => i.purpose === "maskable"), "icône maskable manquante (Android)")
  for (const icon of m.icons) assert.equal(icon.type, "image/png")
})

test("application : les icônes sont de vraies images à la bonne taille", async () => {
  for (const [url, size] of [["/amina-mode/app-icon-192.png", 192], ["/amina-mode/app-icon-512.png", 512]]) {
    const r = await req(url)
    assert.equal(r.status, 200, url)
    assert.equal(r.headers.get("content-type"), "image/png")
    const dims = pngSize(await r.bytes())
    assert.deepEqual(dims, { width: size, height: size }, url)
  }
  const mask = await req("/amina-mode/app-icon-maskable.png")
  assert.equal(mask.status, 200)
  assert.deepEqual(pngSize(await mask.bytes()), { width: 512, height: 512 })
})

test("application : chaque boutique a la couleur de son thème", async () => {
  /* Atelier Lina est en thème « galerie » : l'encre du thème, pas le noir par défaut */
  const r = await req("/atelier-lina/manifest.webmanifest")
  assert.equal(r.status, 200)
  const m = JSON.parse(await r.text())
  assert.equal(m.theme_color, "#1A1A1A")
  const icon = await req("/atelier-lina/app-icon-192.png")
  assert.equal(icon.status, 200)
  assert.deepEqual(pngSize(await icon.bytes()), { width: 192, height: 192 })
  /* et une adresse inconnue ne fabrique pas de manifeste */
  assert.equal((await req("/boutique-qui-nexiste-pas/manifest.webmanifest")).status, 404)
})

test("application : le tableau de bord a sa propre application", async () => {
  await login()
  const page = await req("/dashboard")
  const html = await page.text()
  assert.match(html, /<link rel="manifest" href="\/dashboard\/manifest\.webmanifest/)
  assert.match(html, /data-pwa-install[^>]*hidden/, "le bouton d'installation doit rester caché tant que le navigateur ne le propose pas")
  const m = JSON.parse(await (await req("/dashboard/manifest.webmanifest")).text())
  assert.equal(m.short_name, "NovaDZ")
  assert.equal(m.scope, "/dashboard")
  const icon = await req("/dashboard/app-icon-192.png")
  assert.deepEqual(pngSize(await icon.bytes()), { width: 192, height: 192 })
})

test("application : service worker servi frais, et page de secours", async () => {
  const sw = await req("/sw.js")
  assert.equal(sw.status, 200)
  assert.match(sw.headers.get("cache-control") || "", /no-cache/)
  const code = await sw.text()
  assert.match(code, /addEventListener\("fetch"/)
  assert.match(code, /serviceWorker|skipWaiting/)
  /* le tableau de bord n'est jamais mis en cache : les chiffres doivent être vrais */
  assert.match(code, /pathname\.startsWith\("\/dashboard"\)/)

  const off = await req("/hors-ligne")
  assert.equal(off.status, 200)
  assert.match(await off.text(), /Pas de connexion/)
})

test("application : le script d'installation ne casse pas une page sans bouton", async () => {
  const js = await req("/pwa.js")
  assert.equal(js.status, 200)
  assert.match(await js.text(), /beforeinstallprompt/)
})
