/* Les 69 wilayas (loi 26-06 du 4 avril 2026).

   Deux choses à ne pas casser :
     1. le CLIENT voit les 69 wilayas (Bou Saâda, Barika, Aflou…) et leurs communes ;
     2. le TRANSPORTEUR reçoit le code de la wilaya MÈRE, parce qu'aucune société
        de livraison n'accepte encore un code au-dessus de 58.

   Aucun appel réseau ici : le transporteur est simulé.
*/
const { test, before, after } = require("node:test")
const assert = require("node:assert")
const fs = require("node:fs")
const os = require("node:os")
const path = require("node:path")

const DB = path.join(os.tmpdir(), `novadz-69-${Date.now()}.db`)
process.env.NOVADZ_DB = DB

const db = require("../src/db")
require("../src/carriers")
const WIL = require("../src/wilayas")
const GEO = require("../src/geo")
const SHOP = require("../src/shop")
const CARRIERS = require("../src/carriers")
const TARIFS = require("../src/tarifs-api")

const aide = () => {
  const owner = db.prepare("INSERT INTO users (email, password_hash, name) VALUES (?, ?, ?)")
    .run(`w${Date.now()}@x.dz`, "x", "Test").lastInsertRowid
  const store = db.prepare("INSERT INTO stores (owner_id, slug, name) VALUES (?, ?, ?)")
    .run(owner, "w69-" + Date.now() + Math.random().toString(36).slice(2), "Boutique 69").lastInsertRowid
  db.prepare(`INSERT INTO carriers (store_id, preset, label, enabled, origin_wilaya)
    VALUES (?, ?, ?, 1, 'Blida')`).run(store, "yalidine", "Yalidine")
  return db.prepare("SELECT * FROM stores WHERE id = ?").get(store)
}

before(() => { try { fs.unlinkSync(DB) } catch (_) {} })
after(() => {
  TARIFS.setQuote(null)
  try { fs.unlinkSync(DB) } catch (_) {}
})

/* ---------------------------------------------------------------- */
/* 1. La liste officielle                                            */
/* ---------------------------------------------------------------- */

test("69 wilayas, les onze nouvelles numérotées 59 à 69", () => {
  assert.equal(WIL.WILAYAS_69.length, 69)
  assert.equal(WIL.WILAYAS_58.length, 58, "les 58 anciennes ne bougent pas : les codes sont figés")
  const neuves = WIL.WILAYAS_69.slice(58)
  assert.deepEqual(neuves.map(([c]) => c), [59, 60, 61, 62, 63, 64, 65, 66, 67, 68, 69])
  assert.deepEqual(neuves.map(([, n]) => n), [
    "Aflou", "Barika", "El Kantara", "Bir El Ater", "El Aricha", "Ksar Chellala",
    "Aïn Ouessara", "Messaad", "Ksar El Boukhari", "Bou Saâda", "El Abiodh Sidi Cheikh",
  ])
})

test("les codes des anciennes wilayas ne changent pas", () => {
  assert.equal(WIL.codeOf("Alger"), 16)
  assert.equal(WIL.codeOf("Blida"), 9)
  assert.equal(WIL.codeOf("Oran"), 31)
  assert.equal(WIL.codeOf("58"), 58)
  assert.equal(WIL.nameOf(16), "Alger")
})

test("le nom d'une nouvelle wilaya donne son code, même écrit à la main", () => {
  assert.equal(WIL.codeOf("Bou Saâda"), 68)
  assert.equal(WIL.codeOf("bou saada"), 68)
  assert.equal(WIL.codeOf("BOU-SAADA"), 68)
  assert.equal(WIL.codeOf("68"), 68)
  assert.equal(WIL.codeOf("Barika"), 60)
})

test("le transporteur reçoit la wilaya mère, le client garde la vraie", () => {
  const attendu = { 59: 3, 60: 5, 61: 7, 62: 12, 63: 13, 64: 14, 65: 17, 66: 17, 67: 26, 68: 28, 69: 32 }
  for (const [code, mere] of Object.entries(attendu)) {
    assert.equal(WIL.shipCode(Number(code)), mere, `wilaya ${code} → ${mere}`)
  }
  /* une wilaya ancienne reste elle-même */
  assert.equal(WIL.shipCode(16), 16)
  assert.equal(WIL.shipCode(58), 58)
  assert.equal(WIL.parentName(68), "M'Sila")
  assert.equal(WIL.parentName(16), "", "Alger n'a pas de mère")
  assert.equal(WIL.isNew(68), true)
  assert.equal(WIL.isNew(28), false)
})

/* ---------------------------------------------------------------- */
/* 2. Les communes                                                   */
/* ---------------------------------------------------------------- */

test("1 558 communes, dont 108 passées dans les nouvelles wilayas", () => {
  assert.equal(GEO.WILAYAS.length, 69)
  const total = GEO.WILAYAS.reduce((n, w) => n + GEO.communesOf(w).length, 0)
  assert.equal(total, 1558)
  const tailles = GEO.WILAYAS.slice(58).map((w) => GEO.communesOf(w).length)
  assert.deepEqual(tailles, [12, 8, 5, 4, 4, 6, 10, 8, 21, 23, 7])
})

test("une commune a suivi sa wilaya (Barika n'est plus dans Batna)", () => {
  const barika = GEO.findCommune("Barika", "barika")
  assert.ok(barika, "Barika est dans la nouvelle wilaya")
  assert.equal(barika.fr, "Barika")
  assert.equal(GEO.findCommune("Batna", "barika"), null, "et elle a quitté Batna")
  const aflou = GEO.findCommune("Aflou", "Aflou")
  assert.ok(aflou)
  assert.equal(GEO.findCommune("Laghouat", "aflou"), null)
  /* la wilaya mère garde ses autres communes */
  assert.ok(GEO.communesOf("Batna").length > 40)
  assert.ok(GEO.communesOf("M'Sila").length > 20)
})

test("chaque nouvelle wilaya a son nom arabe", () => {
  for (const w of GEO.WILAYAS.slice(58)) {
    assert.ok(GEO.wilayaAr(w), `arabe manquant pour ${w}`)
    for (const c of GEO.communesOf(w)) assert.ok(c.ar, `arabe manquant : ${w} / ${c.fr}`)
  }
})

test("les communes d'une nouvelle wilaya sont celles du Journal officiel", () => {
  assert.deepEqual(GEO.communesOf("El Abiodh Sidi Cheikh").map((c) => c.fr).sort(), [
    "Arbaouat", "Aïn El Orak", "Boussemghoun", "Chellala", "El Abiodh Sidi Cheikh", "El Bnoud", "El Meharra",
  ].sort())
})

/* ---------------------------------------------------------------- */
/* 3. Les frais de livraison                                         */
/* ---------------------------------------------------------------- */

test("une boutique récente a un tarif pour les 69 wilayas", () => {
  const store = aide()
  SHOP.ensureShipping(store.id)
  const rows = db.prepare("SELECT wilaya FROM shipping_rates WHERE store_id = ?").all(store.id)
  assert.equal(rows.length, 69)
})

test("une boutique d'avant 2026 reçoit les 11 nouvelles au tarif de leur mère", () => {
  const store = aide()
  SHOP.ensureShipping(store.id)
  /* on simule une boutique créée avant : elle n'a que les 58 anciennes */
  db.prepare("DELETE FROM shipping_rates WHERE store_id = ? AND wilaya IN ('Aflou','Barika','El Kantara','Bir El Ater','El Aricha','Ksar Chellala','Aïn Ouessara','Messaad','Ksar El Boukhari','Bou Saâda','El Abiodh Sidi Cheikh')").run(store.id)
  db.prepare("UPDATE shipping_rates SET cents = 70000, desk_cents = 60000 WHERE store_id = ? AND wilaya = 'M''Sila'").run(store.id)
  db.prepare("UPDATE shipping_rates SET cents = 90000, desk_cents = 80000 WHERE store_id = ? AND wilaya = 'Batna'").run(store.id)
  assert.equal(db.prepare("SELECT COUNT(*) n FROM shipping_rates WHERE store_id = ?").get(store.id).n, 58)

  SHOP.ensureShipping(store.id)

  assert.equal(db.prepare("SELECT COUNT(*) n FROM shipping_rates WHERE store_id = ?").get(store.id).n, 69)
  assert.equal(SHOP.shippingFor(store.id, "Bou Saâda"), 70000, "Bou Saâda coûte comme M'Sila")
  assert.equal(SHOP.shippingFor(store.id, "Bou Saâda", "desk"), 60000)
  assert.equal(SHOP.shippingFor(store.id, "Barika"), 90000, "Barika coûte comme Batna")
  assert.equal(SHOP.etaFor(store.id, "Bou Saâda", store).min, 2, "le délai reste celui de la boutique")
})

test("un tarif retrouvé même si les accents diffèrent", () => {
  const store = aide()
  SHOP.ensureShipping(store.id)
  db.prepare("UPDATE shipping_rates SET cents = 123400 WHERE store_id = ? AND wilaya = 'Béjaïa'").run(store.id)
  assert.equal(SHOP.shippingFor(store.id, "Bejaia"), 123400)
})

/* ---------------------------------------------------------------- */
/* 4. L'API du transporteur                                          */
/* ---------------------------------------------------------------- */

test("on demande les tarifs 69 fois, mais 58 appels chez le transporteur", async () => {
  const store = aide()
  const vus = []
  TARIFS.setQuote(async (carrier, wilaya) => {
    vus.push(wilaya)
    const code = WIL.shipCode(WIL.codeOf(wilaya))
    return { home: 40000 + code * 1000, desk: 30000 + code * 1000 }
  })
  const out = await TARIFS.preview(store, { budgetMs: 5000 })
  assert.equal(out.ok, true)
  assert.equal(out.total, 69)
  assert.equal(vus.length, 58, "une wilaya mère = un appel")

  const bou = out.rows.find((r) => r.wilaya === "Bou Saâda")
  const msila = out.rows.find((r) => r.wilaya === "M'Sila")
  assert.equal(bou.mere, "M'Sila", "l'écran peut dire d'où vient le tarif")
  assert.equal(bou.home, msila.home, "même tarif que la mère")
  assert.equal(bou.api, true)
  const alger = out.rows.find((r) => r.wilaya === "Alger")
  assert.equal(alger.mere, "")
})

test("appliquer les tarifs remplit aussi les nouvelles wilayas", async () => {
  const store = aide()
  TARIFS.setQuote(async (carrier, wilaya) => {
    const code = WIL.shipCode(WIL.codeOf(wilaya))
    return { home: 50000 + code * 1000, desk: 40000 + code * 1000 }
  })
  await TARIFS.preview(store, { budgetMs: 5000, force: true })
  const r = TARIFS.apply(store, "remplacer")
  assert.equal(r.ok, true)
  assert.equal(SHOP.shippingFor(store.id, "Bou Saâda"), 50000 + 28 * 1000)
  assert.equal(SHOP.shippingFor(store.id, "Aflou"), 50000 + 3 * 1000)
})

/* ---------------------------------------------------------------- */
/* 5. Ce qui part chez le transporteur                               */
/* ---------------------------------------------------------------- */

test("un colis pour Bou Saâda part avec le code 28 et le nom M'Sila", () => {
  const store = aide()
  const carrier = db.prepare("SELECT * FROM carriers WHERE store_id = ?").get(store.id)
  const order = {
    ref: "CMD-69", customer_name: "Sara B", phone: "0551234567", address: "Cité 20 août",
    wilaya: "Bou Saâda", commune: "Bou Saada", total_cents: 450000, note: "",
  }
  const vars = CARRIERS.buildVars(carrier, store, order, [{ name: "Robe", qty: 1, price: 450000 }], { communeName: "Bou Saada" })
  assert.equal(vars.wilayaCode, 28, "le transporteur ne connaît pas le 68")
  assert.equal(vars.wilaya, "M'Sila")
  assert.equal(vars.commune, "Bou Saada", "la commune reste celle du client")
  assert.equal(vars.addressLine, "Cité 20 août", "l'adresse n'est pas touchée")
})

test("un colis pour Alger part normalement", () => {
  const store = aide()
  const carrier = db.prepare("SELECT * FROM carriers WHERE store_id = ?").get(store.id)
  const order = {
    ref: "CMD-16", customer_name: "Ali K", phone: "0551234567", address: "Bab Ezzouar",
    wilaya: "Alger", commune: "Bab Ezzouar", total_cents: 300000, note: "",
  }
  const vars = CARRIERS.buildVars(carrier, store, order, [{ name: "Sac", qty: 1, price: 300000 }], {})
  assert.equal(vars.wilayaCode, 16)
  assert.equal(vars.wilaya, "Alger")
})
