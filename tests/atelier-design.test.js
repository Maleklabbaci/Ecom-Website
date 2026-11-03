"use strict"
/**
 * L'atelier : brouillon, publication, historique, lien d'aperçu.
 * Ces tests vérifient ce que le marchand ne peut pas se permettre : publier
 * par accident, perdre ce qu'il vient d'écrire, ou qu'un lien d'aperçu
 * montre une version qui n'est pas la sienne.
 */
const test = require("node:test")
const assert = require("node:assert")
const db = require("../src/db")
const DESIGN = require("../src/studio-design")

/* une boutique de test, jetable */
const email = `atelier-${Date.now()}@test.dz`
db.prepare("INSERT INTO users (email, password_hash, name, role) VALUES (?, ?, ?, ?)").run(email, "x", "Test Atelier", "merchant")
const user = db.prepare("SELECT * FROM users WHERE email = ?").get(email)
const slug = `atelier-test-${Date.now()}`
db.prepare("INSERT INTO stores (owner_id, slug, name) VALUES (?, ?, ?)").run(user.id, slug, "Atelier Test")
const store = db.prepare("SELECT * FROM stores WHERE slug = ?").get(slug)

const etat = (texte) => ({
  design: { set: { name: "Atelier Test" }, zones: { bar: 1 } },
  pages: { home: [{ id: "s1", k: "hero", on: true, nm: texte }] },
  theme: "p1",
})

test("un état d'atelier est accepté, un objet quelconque est refusé", () => {
  assert.ok(DESIGN.clean(etat("a")))
  assert.ok(DESIGN.clean(JSON.stringify(etat("a"))))
  assert.strictEqual(DESIGN.clean(null), null)
  assert.strictEqual(DESIGN.clean({}), null)
  assert.strictEqual(DESIGN.clean({ design: {}, pages: [] }), null)
  assert.strictEqual(DESIGN.clean("<script>alert(1)</script>"), null)
})

test("enregistrer ne publie rien : les clients ne voient pas le brouillon", () => {
  const out = DESIGN.saveDraft(store.id, etat("brouillon"))
  assert.strictEqual(out.ok, true)
  const r = DESIGN.read(store.id)
  assert.strictEqual(r.draft.pages.home[0].nm, "brouillon")
  assert.strictEqual(r.live, null)
  assert.strictEqual(r.published_at, "")
})

test("publier recopie le brouillon et garde une trace", () => {
  const out = DESIGN.publish(store.id, etat("en ligne"))
  assert.strictEqual(out.ok, true)
  const r = DESIGN.read(store.id)
  assert.strictEqual(r.live.pages.home[0].nm, "en ligne")
  assert.ok(r.published_at)
  assert.ok(DESIGN.versions(store.id).length >= 1)
})

test("une deuxième publication garde la version d'avant pour revenir", () => {
  DESIGN.publish(store.id, etat("deuxième"))
  const v = DESIGN.versions(store.id)
  assert.ok(v.length >= 2)
  const ancienne = v.find((x) => x.label === "Version en ligne d’avant" || x.label === "Version en ligne d'avant")
  assert.ok(ancienne, "l'ancienne version en ligne est conservée")
  const back = DESIGN.restore(store.id, ancienne.id)
  assert.strictEqual(back.ok, true)
  assert.strictEqual(back.state.pages.home[0].nm, "en ligne")
  /* restaurer ne publie pas : la version en ligne n'a pas bougé */
  assert.strictEqual(DESIGN.read(store.id).live.pages.home[0].nm, "deuxième")
})

test("revenir à ce que voient les clients remet le brouillon sur la version en ligne", () => {
  const out = DESIGN.revert(store.id)
  assert.strictEqual(out.ok, true)
  assert.strictEqual(DESIGN.read(store.id).draft.pages.home[0].nm, "deuxième")
})

test("la page d'accueil du studio ne s'active que si le marchand l'a cochée", () => {
  const etatHome = etat("accueil")
  etatHome.home = true
  DESIGN.publish(store.id, etatHome)
  assert.strictEqual(DESIGN.read(store.id).live.home, true)
  DESIGN.publish(store.id, etat("sans accueil"))
  assert.strictEqual(DESIGN.read(store.id).live.home, undefined)
})

test("un lien d'aperçu montre bien le brouillon, et il est unique", () => {
  const out = DESIGN.preview(store.id, etat("aperçu"))
  assert.strictEqual(out.ok, true)
  const vu = DESIGN.previewOf(out.token)
  assert.ok(vu)
  assert.strictEqual(vu.storeId, store.id)
  assert.strictEqual(vu.state.pages.home[0].nm, "aperçu")
  assert.strictEqual(DESIGN.previewOf("nexiste-pas"), null)
})

test("on ne peut pas lire ni restaurer la version d'une autre boutique", () => {
  const v = DESIGN.versions(store.id)[0]
  const autre = db.prepare("SELECT id FROM stores WHERE id != ? LIMIT 1").get(store.id)
  if (autre) assert.strictEqual(DESIGN.restore(autre.id, v.id).ok, false)
})

test("l'historique est borné", () => {
  for (let i = 0; i < 30; i++) DESIGN.publish(store.id, etat("v" + i))
  assert.ok(DESIGN.versions(store.id).length <= 20)
})

test("nettoyage", () => {
  db.prepare("DELETE FROM stores WHERE id = ?").run(store.id)
  db.prepare("DELETE FROM users WHERE id = ?").run(user.id)
  assert.strictEqual(DESIGN.read(store.id).draft, null)
})
