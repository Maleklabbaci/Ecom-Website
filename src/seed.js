"use strict"
/** Petit jeu de données de démonstration (2 boutiques + produits). */
const db = require("./db")
const { hash } = require("./auth")

const seed = () => {
  const count = db.prepare("SELECT COUNT(*) AS n FROM users").get().n
  if (count > 0) return

  const mkUser = db.prepare(
    "INSERT INTO users (email, password_hash, name, role) VALUES (?, ?, ?, ?)"
  )
  const admin = mkUser.run("admin@novadz.dz", hash("admin1234"), "Équipe NovaDZ", "admin")
  const marchand = mkUser.run("demo@novadz.dz", hash("demo1234"), "Amine Boutique", "merchant")

  const mkStore = db.prepare(`INSERT INTO stores
    (owner_id, slug, name, tagline, about, currency, phone, wilaya)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)`)

  const s1 = mkStore.run(
    marchand.lastInsertRowid, "amina-mode", "Amina Mode",
    "Élégance moderne, livrée chez vous.", "Vêtements et accessoires pour femme, sélectionnés avec soin à Alger.",
    "DZD", "0555 12 34 56", "Alger"
  )
  const s2 = mkStore.run(
    marchand.lastInsertRowid, "tech-dz", "Tech DZ",
    "Les meilleurs gadgets, au meilleur prix.", "Accessoires tech et gadgets testés avant expédition, garantie 6 mois.",
    "DZD", "0661 98 76 54", "Oran"
  )

  const mkProduct = db.prepare(
    "INSERT INTO products (store_id, title, description, price_cents, stock, compare_cents) VALUES (?, ?, ?, ?, ?, ?)"
  )

  const products = [
    [s1.lastInsertRowid, "Robe d'été fleurie", "Robe légère en coton, coupe fluide. Tailles S à XL.", 450000, 12, 550000],
    [s1.lastInsertRowid, "Sac à main camel", "Sac en cuir végétal, bandoulière réglable.", 620000, 8, 0],
    [s1.lastInsertRowid, "Foulard en soie", "Foulard 90×90 cm, motifs géométriques.", 220000, 20, 0],
    [s1.lastInsertRowid, "Sandales tressées", "Cuir souple, semelle confortable, pointures 36-41.", 380000, 6, 0],
    [s2.lastInsertRowid, "Écouteurs sans fil", "Bluetooth 5.3, 24h d'autonomie, boîtier de charge.", 490000, 25, 0],
    [s2.lastInsertRowid, "Chargeur rapide 65W", "USB-C GaN, charge téléphone et ordinateur.", 320000, 40, 0],
    [s2.lastInsertRowid, "Montre connectée", "Écran AMOLED, suivi sportif, étanche IP68.", 890000, 2, 1090000],
    [s2.lastInsertRowid, "Support téléphone voiture", "Fixation magnétique, rotation 360°.", 150000, 50, 0],
  ]
  products.forEach((p) => mkProduct.run(...p))

  /* Une photo distincte par produit — jamais la même image pour tout le catalogue. */
  const demoPhotos = {
    "Robe d'été fleurie": "/demo/demo-robe.jpg",
    "Sac à main camel": "/demo/demo-sac.jpg",
    "Foulard en soie": "/demo/demo-foulard.jpg",
    "Sandales tressées": "/demo/demo-sandales.jpg",
  }
  const setPhoto = db.prepare("UPDATE products SET image = ? WHERE store_id = ? AND title = ?")
  Object.entries(demoPhotos).forEach(([title, img]) => setPhoto.run(img, s1.lastInsertRowid, title))

  const mkCat = db.prepare("INSERT INTO categories (store_id, name, slug, position) VALUES (?, ?, ?, ?)")
  const linkCat = db.prepare("UPDATE products SET category_id = ? WHERE store_id = ? AND title = ?")
  const rayons = [
    [s1.lastInsertRowid, "Robes", "robes", 1, "Robe d'été fleurie"],
    [s1.lastInsertRowid, "Sacs", "sacs", 2, "Sac à main camel"],
    [s1.lastInsertRowid, "Foulards", "foulards", 3, "Foulard en soie"],
    [s1.lastInsertRowid, "Chaussures", "chaussures", 4, "Sandales tressées"],
    [s2.lastInsertRowid, "Audio", "audio", 1, "Écouteurs sans fil"],
    [s2.lastInsertRowid, "Charge", "charge", 2, "Chargeur rapide 65W"],
    [s2.lastInsertRowid, "Montres", "montres", 3, "Montre connectée"],
    [s2.lastInsertRowid, "Accessoires", "accessoires", 4, "Support téléphone voiture"],
  ]
  rayons.forEach(([sid, name, slug, pos, title]) => {
    const row = mkCat.run(sid, name, slug, pos)
    linkCat.run(row.lastInsertRowid, sid, title)
  })

  /* Pack « souvent achetés ensemble » : un exemple visible dès la démo */
  db.prepare("UPDATE products SET bundle_ids = ? WHERE id = 1").run("2,3")
  db.prepare("UPDATE products SET bundle_ids = ? WHERE id = 5").run("6,7")

  const vitrineUser = mkUser.run("vitrine@novadz.dz", hash("demo1234"), "Lina Amari", "merchant")
  const vitrine = db.prepare(`INSERT INTO stores
    (owner_id, slug, name, tagline, about, currency, phone, whatsapp, wilaya, theme, site_kind)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
    vitrineUser.lastInsertRowid, "atelier-lina", "Atelier Lina",
    "Architecture et intérieurs.", "Cabinet d'architecture à Blida.",
    "DZD", "0555 44 20 18", "0555 44 20 18", "Blida", "galerie", "vitrine"
  )
  const mkPage = db.prepare("INSERT INTO pages (store_id, slug, title, body, published) VALUES (?, ?, ?, ?, ?)")
  mkPage.run(vitrine.lastInsertRowid, "a-propos", "À propos", "Le cabinet est à Blida.\n\nOn dessine des maisons, des locaux et des rénovations.", 1)
  mkPage.run(vitrine.lastInsertRowid, "services", "Services", "Étude. Suivi de chantier. Conseil.", 1)
  mkPage.run(vitrine.lastInsertRowid, "portfolio", "Portfolio", "Maisons à Blida, un local à Alger, une rénovation à Médéa.", 1)
  db.prepare("UPDATE stores SET nav = ?, sections = ? WHERE id = ?").run(
    JSON.stringify([
      { id: "n1", label: "À propos", url: "page/a-propos" },
      { id: "n2", label: "Services", url: "page/services" },
      { id: "n3", label: "Portfolio", url: "page/portfolio" },
    ]),
    JSON.stringify([{ id: "s1", type: "media_text", blocks: [], settings: { kicker: "Blida", heading: "Atelier Lina", body: "Architecture et intérieurs.", ctaLabel: "Écrire", ctaUrl: "#ecrire", image: "" } }]),
    vitrine.lastInsertRowid
  )

  console.log("✓ Données de démonstration créées")
  console.log("  Marchand : demo@novadz.dz / demo1234  (boutiques: amina-mode, tech-dz)")
  console.log("  Vitrine  : vitrine@novadz.dz / demo1234  (atelier-lina)")
  console.log("  Admin    : admin@novadz.dz / admin1234")
}

module.exports = seed
