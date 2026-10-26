/* Rendu navigateur : 19 thèmes, contraste calculé, scroll, images.
   Captures desktop et mobile pour les points 6 à 12. Port libre. */
const { test, before, after } = require("node:test")
const assert = require("node:assert")
const fs = require("fs")
const os = require("os")
const path = require("path")
const puppeteer = require("puppeteer-core")
const { startServer } = require("./boot")
const SECTIONS = require("../src/sections")
const { THEMES } = require("../src/themes")

const DB = path.join(os.tmpdir(), `novadz-visuel-${Date.now()}.db`)
const OUT = path.join("/home/user", "preuve-shots")
let server, BASE, browser, page
const jar = new Map()
const missing = []

const cookieHeader = () => [...jar].map(([k, v]) => `${k}=${v}`).join("; ")
async function req(pathname, opts = {}) {
  const res = await fetch(BASE + pathname, {
    ...opts,
    headers: { ...(opts.headers || {}), cookie: cookieHeader() },
    redirect: "manual",
  })
  for (const c of (res.headers.getSetCookie ? res.headers.getSetCookie() : [])) {
    const [pair] = c.split(";")
    const i = pair.indexOf("=")
    jar.set(pair.slice(0, i), pair.slice(i + 1))
  }
  return { status: res.status, text: await res.text() }
}
const form = (obj) => ({
  method: "POST",
  headers: { "Content-Type": "application/x-www-form-urlencoded" },
  body: new URLSearchParams(obj).toString(),
})
const json = (obj) => ({
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(obj),
})

async function publish(id, home, design) {
  const trial = await req("/dashboard/design/theme", form({ theme: id }))
  assert.equal(trial.status, 302, id)
  const body = {}
  if (home) body.sections = { home }
  if (design) body.design = design
  if (Object.keys(body).length) {
    const saved = await req("/dashboard/design/save", json(body))
    assert.equal(saved.status, 200, saved.text.slice(0, 160))
  }
  const pub = await req("/dashboard/design/publish", { method: "POST" })
  assert.equal(pub.status, 200, id)
}

async function syncCookies() {
  const cookies = [...jar].map(([name, value]) => ({ name, value, url: BASE }))
  if (cookies.length) await page.setCookie(...cookies)
}

async function open(urlPath, w, h, file) {
  missing.length = 0
  await syncCookies()
  await page.setViewport({ width: w, height: h, deviceScaleFactor: 1 })
  const res = await page.goto(BASE + urlPath, { waitUntil: "domcontentloaded", timeout: 15000 })
  await page.evaluate(() => {
    const box = document.getElementById("ndzCookies")
    if (box) box.hidden = true
    window.scrollTo(0, document.body.scrollHeight)
  })
  await page.evaluate(() => Promise.race([
    Promise.all([...document.images].map((img) => img.complete ? null : new Promise((done) => { img.onload = img.onerror = done }))),
    new Promise((done) => setTimeout(done, 600)),
  ]))
  await page.evaluate(() => window.scrollTo(0, 0))
  const data = await page.evaluate(() => {
    const parse = (c) => {
      const m = String(c || "").match(/rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\)/)
      return m ? { r: +m[1], g: +m[2], b: +m[3], a: m[4] == null ? 1 : +m[4] } : null
    }
    const lin = (n) => { const c = n / 255; return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4) }
    const lum = (c) => 0.2126 * lin(c.r) + 0.7152 * lin(c.g) + 0.0722 * lin(c.b)
    const blend = (fg, bg) => ({
      r: fg.r * fg.a + bg.r * (1 - fg.a),
      g: fg.g * fg.a + bg.g * (1 - fg.a),
      b: fg.b * fg.a + bg.b * (1 - fg.a),
      a: 1,
    })
    const ratio = (a, b) => {
      const l1 = lum(a), l2 = lum(b)
      return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05)
    }
    const covering = (el) => {
      const hero = el.closest(".sec-hero")
      let n = el
      while (n && n !== hero) {
        const bg = parse(getComputedStyle(n).backgroundColor)
        if (bg && bg.a >= 0.98) return bg
        n = n.parentElement
      }
      return null
    }
    const of = (el) => {
      if (!el || !(el.innerText || "").trim()) return null
      const cs = getComputedStyle(el)
      const fg = parse(cs.color)
      if (!fg) return null
      const plate = parse(cs.backgroundColor)
      const solid = covering(el)
      const onPhoto = !!(el.closest(".sec-hero.has-img") && !solid)
      const worst = lum(fg) > 0.5 ? { r: 255, g: 255, b: 255, a: 1 } : { r: 0, g: 0, b: 0, a: 1 }
      let bg
      if (onPhoto) bg = plate && plate.a > 0 ? blend(plate, worst) : worst
      else if (solid) bg = solid
      else {
        let n = el, acc = null
        while (n) {
          const b = parse(getComputedStyle(n).backgroundColor)
          if (b && b.a >= 0.98) { acc = b; break }
          n = n.parentElement
        }
        bg = acc || { r: 255, g: 255, b: 255, a: 1 }
      }
      return { t: el.innerText.trim().slice(0, 32), ratio: Math.round(ratio(fg, bg) * 100) / 100, onPhoto }
    }
    const nodes = [
      ...document.querySelectorAll(".sec-hero h1, .sec-hero .sec-sub, .sec-hero .sec-kicker, h1, h2, .p-name"),
    ].slice(0, 8)
    const low = nodes.map(of).filter((x) => x && x.ratio < 4)
    const h1 = document.querySelector("h1")
    return {
      scroll: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      broken: [...document.images].filter((img) => img.complete && img.naturalWidth === 0 && img.getAttribute("src")).map((img) => img.getAttribute("src")),
      h1: h1 ? h1.innerText.trim() : "",
      h1h: h1 ? Math.round(h1.getBoundingClientRect().height) : 0,
      low,
    }
  })
  if (file) await page.screenshot({ path: path.join(OUT, file), type: "jpeg", quality: 42 })
  return { status: res ? res.status() : 0, ...data, net404: missing.filter((u) => u.startsWith(BASE)) }
}

before(async () => {
  fs.mkdirSync(OUT, { recursive: true })
  try { fs.unlinkSync(DB) } catch (_) {}
  const started = await startServer({ db: DB })
  server = started.child
  BASE = started.base
  const login = await req("/login", form({ email: "demo@novadz.dz", password: "demo1234" }))
  assert.ok([302, 303].includes(login.status))
  browser = await puppeteer.launch({
    executablePath: "/usr/bin/chromium",
    args: ["--no-sandbox", "--disable-dev-shm-usage", "--disable-gpu"],
    headless: true,
  })
  page = await browser.newPage()
  page.setDefaultTimeout(15000)
  page.on("response", (r) => { if (r.status() === 404) missing.push(r.url()) })
})

after(async () => {
  if (browser) await browser.close()
  if (server) server.kill()
  try { fs.unlinkSync(DB) } catch (_) {}
})

test("19 thèmes, desktop et mobile, avec et sans photo : contraste, scroll, images", async () => {
  const bad = []
  for (const t of THEMES) {
    for (const photo of [true, false]) {
      const home = JSON.parse(JSON.stringify(SECTIONS.defaultSections(t.id)))
      if (!photo) {
        for (const s of home) {
          if (s.settings && "image" in s.settings) s.settings.image = ""
          for (const b of s.blocks || []) if (b.settings && b.settings.image) b.settings.image = ""
        }
      }
      await publish(t.id, home)
      for (const [vp, w, h] of [["desk", 1280, 900], ["mob", 390, 844]]) {
        const row = await open("/amina-mode", w, h, `06-${t.id}-${photo ? "avec" : "sans"}-${vp}.jpg`)
        const four = row.net404
        if (row.scroll > 2 || row.broken.length || row.low.length || four.length) {
          bad.push(`${t.id} ${photo ? "avec" : "sans"} ${vp} scroll=${row.scroll} broken=${row.broken.join(",")} low=${row.low.map((x) => x.t + ":" + x.ratio).join(",")} 404=${four.length}`)
        }
      }
    }
  }
  console.log("VISUEL " + (bad.length ? bad.join(" | ") : "19 thèmes, 0 scroll, 0 image cassée, contraste >= 4"))
  assert.deepEqual(bad, [])
})

test("éditeur, tailles, pied, blocs, en-tête, panier : captures avant et après", async () => {
  await publish("minimal")
  await open("/amina-mode", 1280, 900, "07-avant-desk.jpg")
  await open("/amina-mode", 390, 844, "07-avant-mob.jpg")
  const home = SECTIONS.defaultSections("minimal")
  home[0].settings.heading = "TEXTE-PUBLIE-NDZ"
  await req("/dashboard/design/save", json({ sections: { home } }))
  const preview = await open("/amina-mode?preview=1", 1280, 900, null)
  assert.match(preview.h1, /TEXTE-PUBLIE-NDZ/)
  const still = await open("/amina-mode", 390, 844, "07-public-avant-mob.jpg")
  assert.doesNotMatch(still.h1, /TEXTE-PUBLIE-NDZ/)
  await req("/dashboard/design/publish", { method: "POST" })
  const after = await open("/amina-mode", 1280, 900, "07-apres-desk.jpg")
  await open("/amina-mode", 390, 844, "07-apres-mob.jpg")
  assert.match(after.h1, /TEXTE-PUBLIE-NDZ/)

  for (const size of [0, 1, 100]) {
    await req("/dashboard/design/save", json({
      sections: { home },
      design: { textSizes: [{ page: "home", sel: "h1", size, label: "titre" }] },
    }))
    await req("/dashboard/design/publish", { method: "POST" })
    for (const [vp, w, h] of [["desk", 1280, 900], ["mob", 390, 844]]) {
      const row = await open("/amina-mode", w, h, `08-taille-${size}-${vp}.jpg`)
      const px = await page.evaluate(() => parseFloat(getComputedStyle(document.querySelector("h1")).fontSize))
      const want = size === 0 ? 1 : size
      assert.equal(px, want, `taille ${size} ${vp} rendu ${px}px`)
      assert.ok(row.h1h > 0, `taille ${size} ${vp} hauteur ${row.h1h}`)
      assert.ok(row.scroll <= 2, `taille ${size} ${vp} scroll ${row.scroll}`)
      assert.match(row.h1, /TEXTE-PUBLIE-NDZ/)
    }
  }

  await publish("minimal")
  await open("/amina-mode", 1280, 900, "09-pied-avant-desk.jpg")
  for (const style of ["colonnes", "centre", "sombre", "magazine", "ligne", "cartes", "contact"]) {
    await req("/dashboard/design/save", json({
      design: { footerStyle: style, footerBrand: "", footerNote: "", footerCols: [{ title: "", links: [{ label: "Livraison", url: "legal" }] }] },
    }))
    await req("/dashboard/design/publish", { method: "POST" })
    const desk = await open("/amina-mode", 1280, 900, `09-pied-${style}-desk.jpg`)
    const mob = await open("/amina-mode", 390, 844, `09-pied-${style}-mob.jpg`)
    assert.ok(desk.scroll <= 2 && mob.scroll <= 2, style + " scroll")
  }

  const blocks = SECTIONS.defaultSections("minimal")
  const added = SECTIONS.makeSection("text", { heading: "BLOC-VISIBLE", body: "Bloc ajouté, encore public." })
  blocks.unshift(added)
  await publish("minimal", blocks)
  await open("/amina-mode", 1280, 900, "10-bloc-avant-desk.jpg")
  await open("/amina-mode", 390, 844, "10-bloc-avant-mob.jpg")
  added.hidden = true
  await publish("minimal", blocks)
  const hidden = await open("/amina-mode", 1280, 900, "10-bloc-apres-desk.jpg")
  await open("/amina-mode", 390, 844, "10-bloc-apres-mob.jpg")
  assert.doesNotMatch(hidden.h1, /BLOC-VISIBLE/)

  await publish("minimal")
  await open("/amina-mode", 1280, 900, "11-entete-avant-desk.jpg")
  await open("/amina-mode", 390, 844, "11-entete-avant-mob.jpg")
  await req("/dashboard/design/save", json({
    design: {
      logo: "/demo/exemple.jpg", showLogo: true, searchPlace: "aucune",
      headBg: "#112233", headInk: "#F4F1EA", headHeight: "large",
    },
    nav: [{ label: "Boutique", url: "" }, { label: "Lien-preuve", url: "legal" }],
  }))
  await req("/dashboard/design/publish", { method: "POST" })
  const head = await open("/amina-mode", 1280, 900, "11-entete-apres-desk.jpg")
  await open("/amina-mode", 390, 844, "11-entete-apres-mob.jpg")
  const searchShown = await page.evaluate(() => {
    const el = document.querySelector(".filters-search, .ndz-search, .tpx-search")
    if (!el) return false
    const cs = getComputedStyle(el)
    return cs.display !== "none" && cs.visibility !== "hidden"
  })
  assert.equal(searchShown, false, "recherche encore visible après suppression")
  assert.ok(head.scroll <= 2)

  const list = await req("/dashboard/products")
  const id = (list.text.match(/\/dashboard\/products\/(\d+)/) || [])[1]
  await req("/amina-mode/cart", form({ product_id: id }))
  await open("/amina-mode/cart", 390, 844, "12-panier-mob.jpg")
  await open("/amina-mode/cart", 1280, 900, "12-panier-desk.jpg")
  const checkout = await open("/amina-mode/checkout", 390, 844, "12-checkout-avant-mob.jpg")
  assert.equal(checkout.status, 200)
  await open("/amina-mode/checkout", 1280, 900, "12-checkout-desk.jpg")
  const order = await req("/amina-mode/checkout", form({
    customer_name: "Karim Benali", phone: "0555123456", wilaya: "Blida",
    commune: "Blida", address: "Cité 200 logements", payment: "cod", delivery: "home",
  }))
  assert.equal(order.status, 200)
  assert.match(order.text, /Commande confirmée/)
  assert.match(order.text, /Blida/)
  console.log("CAPTURES 7-12 écrites, commande Blida confirmée, tailles visibles")
})
