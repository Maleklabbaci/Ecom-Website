"use strict"
/**
 * Démarrage :
 *  - NOVADZ_DEMO=1 → jeu de démonstration complet (boutiques + produits),
 *    avec les comptes connus demo@ / vitrine@ / admin@novadz.dz. Le seed
 *    est idempotent : à chaque démarrage démo, les comptes manquants sont
 *    créés et les mots de passe décalés réalignés, même si la base contient
 *    déjà d'autres utilisateurs. À réserver au développement local : ces
 *    mots de passe sont publics (dépôt Git).
 *  - sinon, premier démarrage (base vide) → seul un compte administrateur
 *    est créé, avec un mot de passe aléatoire affiché UNE SEULE FOIS dans
 *    la console. Aucune boutique de démonstration, aucun mot de passe
 *    devinable sur une instance publique.
 */
const crypto = require("crypto")
const db = require("./db")
const { hash, verify } = require("./auth")

const seed = () => {
  const userCount = db.prepare("SELECT COUNT(*) AS n FROM users").get().n

  if (process.env.NOVADZ_DEMO !== "1") {
    if (userCount > 0) return
    const password = crypto.randomBytes(12).toString("base64").replace(/[^a-zA-Z0-9]/g, "").slice(0, 14)
    db.prepare("INSERT INTO users (email, password_hash, name, role) VALUES (?, ?, ?, ?)")
      .run("admin@novadz.dz", hash(password), "Équipe NovaDZ", "admin")
    console.log("")
    console.log("  ============================================================")
    console.log("  PREMIER DÉMARRAGE — compte administrateur créé :")
    console.log("    E-mail       : admin@novadz.dz")
    console.log("    Mot de passe : " + password)
    console.log("  Note-le maintenant : il ne sera plus jamais affiché.")
    console.log("  (Pour la démo locale complète : lancer « npm run demo ».)")
    console.log("  ============================================================")
    console.log("")
    return
  }

  /* Mode démo explicite : les trois comptes connus doivent TOUJOURS
     exister et fonctionner, même si la base contient déjà d'autres
     utilisateurs (premier lancement en mode normal, compte créé via le
     formulaire d'inscription, base recyclée…). Avant, le seed s'arrêtait
     dès qu'un utilisateur existait et les identifiants de démonstration
     répondaient « Cet e-mail n'existe pas » sans aucun recours simple. */
  const byEmail = db.prepare("SELECT id, password_hash, role FROM users WHERE email = ?")
  const insertUser = db.prepare("INSERT INTO users (email, password_hash, name, role) VALUES (?, ?, ?, ?)")
  const fixUser = db.prepare("UPDATE users SET password_hash = ?, role = ? WHERE id = ?")
  let retouche = false
  const ensureUser = (email, password, name, role) => {
    const row = byEmail.get(email)
    if (!row) {
      retouche = true
      return { id: insertUser.run(email, hash(password), name, role).lastInsertRowid, created: true }
    }
    if (row.role !== role || !verify(password, row.password_hash)) {
      fixUser.run(hash(password), role, row.id)
      retouche = true
    }
    return { id: row.id, created: false }
  }
  const nbBoutiques = (ownerId) =>
    db.prepare("SELECT COUNT(*) AS n FROM stores WHERE owner_id = ?").get(ownerId).n
  const slugLibre = (base) => {
    const taken = db.prepare("SELECT id FROM stores WHERE slug = ?")
    let slug = base
    let n = 2
    while (taken.get(slug)) { slug = base + "-" + n; n += 1 }
    return slug
  }

  ensureUser("admin@novadz.dz", "admin1234", "Équipe NovaDZ", "admin")
  const marchand = ensureUser("demo@novadz.dz", "demo1234", "Amine Boutique", "merchant")
  let boutiquesCreees = false
  if (marchand.created || nbBoutiques(marchand.id) === 0) {
    const mkStore = db.prepare(`INSERT INTO stores
      (owner_id, slug, name, tagline, about, currency, phone, wilaya)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)`)

    const s1 = mkStore.run(
      marchand.id, slugLibre("amina-mode"), "Amina Mode",
      "Élégance moderne, livrée chez vous.", "Vêtements et accessoires pour femme, sélectionnés avec soin à Alger.",
      "DZD", "0555 12 34 56", "Alger"
    )
    const s2 = mkStore.run(
      marchand.id, slugLibre("tech-dz"), "Tech DZ",
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
    const productIds = products.map((p) => mkProduct.run(...p).lastInsertRowid)

    /* Une photo distincte par produit — jamais la même image pour tout le catalogue. */
    const demoPhotos = {
      "Robe d'été fleurie": "/demo/demo-robe.jpg",
      "Sac à main camel": "/demo/demo-sac.jpg",
      "Foulard en soie": "/demo/demo-foulard.jpg",
      "Sandales tressées": "/demo/demo-sandales.jpg",
      /* la boutique « tech » a aussi ses photos : une carte produit sans
         photo ressemblait à une image cassée */
      "Écouteurs sans fil": "/demo/demo-ecouteurs.jpg",
      "Chargeur rapide 65W": "/demo/demo-chargeur.jpg",
      "Montre connectée": "/demo/demo-montre.jpg",
      "Support téléphone voiture": "/demo/demo-support.jpg",
    }
    const setPhoto = db.prepare("UPDATE products SET image = ? WHERE store_id = ? AND title = ?")
    Object.entries(demoPhotos).forEach(([title, img]) => setPhoto.run(img, s1.lastInsertRowid, title))
    Object.entries(demoPhotos).forEach(([title, img]) => setPhoto.run(img, s2.lastInsertRowid, title))

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
    db.prepare("UPDATE products SET bundle_ids = ? WHERE id = ?").run(productIds[1] + "," + productIds[2], productIds[0])
    db.prepare("UPDATE products SET bundle_ids = ? WHERE id = ?").run(productIds[5] + "," + productIds[6], productIds[4])
    boutiquesCreees = true
  }

  /* ---------- la démo doit être utilisable tout de suite ----------
     Deux manques constatés en testant les comptes :
      1. les boutiques de démonstration n'avaient aucun thème → « Studio »
         renvoyait vers le sélecteur de thème au lieu d'ouvrir l'éditeur ;
      2. aucune commande → tableau de bord vide, statistiques à zéro, et
         l'intérêt d'une boutique (suivre ses commandes) invisible.
     On les comble une seule fois par base : un marchand qui supprime les
     commandes de démonstration ne les voit pas revenir au redémarrage. */
  /* Rempli seulement par « npm run demo » (scripts/demo.js) : les tests
     démarrent aussi en mode démo mais attendent une base sans commande,
     leurs assertions (pastilles « à traiter », chiffre d'affaires à zéro)
     portent là-dessus. La démo, elle, a besoin d'être vivante. */
  const DEMO_SEED = process.env.NOVADZ_DEMO_DATA === "1" ? 3 : 0
  const demoTheme = { "amina-mode": "site6", "tech-dz": "site9" }
  const designOf = (store) => {
    try { return JSON.parse(store.design || "{}") } catch (_) { return {} }
  }
  const setDesign = db.prepare("UPDATE stores SET design = ? WHERE id = ?")

  const demoOrders = [
    /* [slug, nom, téléphone, wilaya, adresse, produits, statut, jours, source, appareil] */
    ["amina-mode", "Yasmine Belhadj", "0551 22 84 07", "Alger", "12 rue Didouche Mourad, Alger Centre", ["Robe d'été fleurie"], "livree", 6, "instagram", "mobile"],
    ["amina-mode", "Nesrine Ait", "0662 41 09 55", "Blida", "Cité 200 logements, bt C4, Blida", ["Sac à main camel", "Foulard en soie"], "confirmee", 2, "facebook", "mobile"],
    ["amina-mode", "Souad Kaci", "0770 63 12 38", "Oran", "Hay Es Salam, rue 14, Oran", ["Sandales tressées"], "nouvelle", 0, "instagram", "mobile"],
    ["amina-mode", "Meriem Boudiaf", "0555 90 77 21", "Constantine", "Ali Mendjeli, UV 8, Constantine", ["Robe d'été fleurie"], "annulee", 4, "google", "desktop"],
    ["tech-dz", "Karim Zerrouki", "0661 15 44 90", "Alger", "Bab Ezzouar, lot 22, Alger", ["Écouteurs sans fil"], "expediee", 3, "tiktok", "mobile"],
    ["tech-dz", "Hamza Lounis", "0779 30 61 12", "Sétif", "Cité Yahiaoui, bt 7, Sétif", ["Montre connectée"], "nouvelle", 1, "direct", "desktop"],
  ]

  const boutiques = DEMO_SEED
    ? db.prepare("SELECT id, slug, design FROM stores WHERE slug IN ('amina-mode', 'tech-dz')").all()
    : []
  let demoRepare = false
  for (const st of boutiques) {
    const d = designOf(st)
    /* 1. un thème par défaut, pour que le Studio s'ouvre directement */
    if (!d.siteTemplate && demoTheme[st.slug]) {
      setDesign.run(JSON.stringify({ ...d, siteTemplate: demoTheme[st.slug] }), st.id)
      demoRepare = true
    }
    /* 2. des informations légales complètes : une boutique de démonstration
       doit pouvoir montrer une facture et une page « Informations légales »
       remplies, sinon l'écran Réglages paraît vide alors que tout est prévu. */
    if (!d.demoLegal) {
      const LEGAL = {
        "amina-mode": { legal_name: "SARL Amina Mode", legal_address: "12 rue Didouche Mourad, Alger Centre",
          legal_rc: "16/00-1234567B18", legal_nif: "000116001234567" },
        "tech-dz": { legal_name: "SARL Tech DZ", legal_address: "Bab Ezzouar, lot 22, Alger",
          legal_rc: "16/00-7654321A09", legal_nif: "000116007654321" },
      }[st.slug]
      if (LEGAL) {
        db.prepare(`UPDATE stores SET legal_name = COALESCE(legal_name, ?), legal_address = COALESCE(legal_address, ?),
                    legal_rc = COALESCE(legal_rc, ?), legal_nif = COALESCE(legal_nif, ?) WHERE id = ?`)
          .run(LEGAL.legal_name, LEGAL.legal_address, LEGAL.legal_rc, LEGAL.legal_nif, st.id)
        d.demoLegal = 1
        setDesign.run(JSON.stringify(d), st.id)
        demoRepare = true
      }
    }
    /* 3. des commandes de démonstration, une seule fois */
    if (d.demoSeed !== DEMO_SEED) {
      const produits = db.prepare("SELECT id, title, price_cents FROM products WHERE store_id = ?").all(st.id)
      const parTitre = new Map(produits.map((p) => [p.title, p]))
      /* on repart de zéro : les commandes d'exemple sont reconnaissables à leur note */
      const EST_DEMO = "(store_id = ? AND (source = 'demo' OR note LIKE '%démonstration%'))"
      db.prepare("DELETE FROM order_items WHERE order_id IN (SELECT id FROM orders WHERE " + EST_DEMO + ")").run(st.id)
      db.prepare("DELETE FROM order_events WHERE order_id IN (SELECT id FROM orders WHERE " + EST_DEMO + ")").run(st.id)
      db.prepare("DELETE FROM orders WHERE " + EST_DEMO).run(st.id)
      const mkOrder = db.prepare(`INSERT INTO orders
        (store_id, ref, customer_name, phone, address, wilaya, note,
         subtotal_cents, shipping_cents, discount_cents, promo_code, total_cents,
         status, payment, delivery_type, created_at, source, device, ua)
        VALUES (?, ?, ?, ?, ?, ?, 'Commande de démonstration', ?, ?, 0, '', ?, ?, 'cod', 'home', datetime('now', ?), ?, ?,
                CASE ? WHEN 'mobile' THEN 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148'
                       ELSE 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124.0 Safari/537.36' END)`)
      const mkItem = db.prepare("INSERT INTO order_items (order_id, product_id, title, price_cents, qty) VALUES (?, ?, ?, ?, ?)")
      const mkEvent = db.prepare("INSERT INTO order_events (store_id, order_id, kind, label, detail, created_at) VALUES (?, ?, 'statut', ?, '', datetime('now', ?))")
      for (const [slug, nom, tel, wilaya, adresse, titres, statut, jours, source, appareil] of demoOrders) {
        if (slug !== st.slug) continue
        const pris = titres.map((t) => parTitre.get(t)).filter(Boolean)
        if (!pris.length) continue
        const sousTotal = pris.reduce((a, p) => a + p.price_cents, 0)
        const port = wilaya === "Alger" ? 40000 : 60000
        const quand = `-${jours} days`
        const info = mkOrder.run(st.id, require("./refs").uniqueRef(db, st.id), nom, tel, adresse, wilaya,
          sousTotal, port, sousTotal + port, statut, quand, source, appareil, appareil)
        pris.forEach((p) => mkItem.run(info.lastInsertRowid, p.id, p.title, p.price_cents, 1))
        mkEvent.run(st.id, info.lastInsertRowid, "Commande reçue (démonstration)", quand)
      }
      setDesign.run(JSON.stringify({ ...d, siteTemplate: d.siteTemplate || demoTheme[st.slug], demoSeed: DEMO_SEED }), st.id)
      demoRepare = true
    }
  }
  /* La vitrine de démonstration n'avait son modèle qu'en brouillon : le Studio
     montrait le modèle, mais le site public affichait encore l'ancien rendu.
     On publie ce modèle une fois, pour que les deux racontent la même chose.
     Si le marchand publie autre chose ensuite, on ne touche plus à rien. */
  const vitrine = DEMO_SEED
    ? db.prepare("SELECT id, slug, design, draft FROM stores WHERE slug = 'atelier-lina'").get()
    : null
  if (vitrine) {
    const live = (() => { try { return JSON.parse(vitrine.design || "{}") || {} } catch (_) { return {} } })()
    let brouillon = {}
    try { brouillon = (JSON.parse(vitrine.draft || "{}") || {}).design || {} } catch (_) {}
    const tpl = live.siteTemplate || brouillon.siteTemplate
    if (tpl && live.siteTemplate !== tpl) {
      const base = require("./sections").readDesign({ ...vitrine, design: vitrine.design || "{}" })
      db.prepare("UPDATE stores SET design = ?, published_at = datetime('now') WHERE id = ?")
        .run(JSON.stringify({ ...base, siteTemplate: tpl }), vitrine.id)
      console.log("✓ Vitrine de démonstration publiée sur le modèle " + tpl)
      demoRepare = true
    }
    /* les mêmes informations d'identité que dans une boutique : la vitrine a
       aussi sa raison sociale, son adresse et ses numéros (page légale) */
    if (!live.demoLegal) {
      db.prepare(`UPDATE stores SET legal_name = COALESCE(legal_name, ?), legal_address = COALESCE(legal_address, ?),
                  legal_rc = COALESCE(legal_rc, ?), legal_nif = COALESCE(legal_nif, ?) WHERE id = ?`)
        .run("Atelier Lina", "Cité 200 logements, bt C4, Blida", "09/00-1122334C55", "000109001122334", vitrine.id)
      const d2 = (() => { try { return JSON.parse(db.prepare("SELECT design FROM stores WHERE id = ?").get(vitrine.id).design || "{}") } catch (_) { return {} } })()
      db.prepare("UPDATE stores SET design = ? WHERE id = ?").run(JSON.stringify({ ...d2, demoLegal: 1 }), vitrine.id)
      demoRepare = true
    }
  }

  if (demoRepare) {
    const n = db.prepare("SELECT COUNT(*) AS n FROM orders WHERE source = 'demo' OR note LIKE '%démonstration%'").get().n
    console.log("✓ Démo complétée : thème par défaut + " + n + " commande(s) d'exemple (source « demo »)")
  }

  const vitrineUser = ensureUser("vitrine@novadz.dz", "demo1234", "Lina Amari", "merchant")
  if (vitrineUser.created || nbBoutiques(vitrineUser.id) === 0) {
    const vitrine = db.prepare(`INSERT INTO stores
      (owner_id, slug, name, tagline, about, currency, phone, whatsapp, wilaya, theme, site_kind)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
      vitrineUser.id, slugLibre("atelier-lina"), "Atelier Lina",
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
      JSON.stringify([
        { id: "s1", type: "media_text", blocks: [], settings: { image: "/demo/lina-maison.jpg", kicker: "Blida", heading: "Atelier Lina", body: "Nous dessinons des maisons, des locaux et des rénovations, de l'esquisse au suivi du chantier.", ctaLabel: "Voir nos réalisations", ctaUrl: "page/portfolio", reverse: false } },
        { id: "s2", type: "gallery", settings: { heading: "Nos réalisations" }, blocks: [
          { id: "b1", settings: { image: "/demo/lina-maison.jpg", caption: "Maison à Blida" } },
          { id: "b2", settings: { image: "/demo/lina-bureau.jpg", caption: "Local à Alger" } },
          { id: "b3", settings: { image: "/demo/lina-renovation.jpg", caption: "Rénovation à Médéa" } },
        ] },
        { id: "s3", type: "cta", blocks: [], settings: { heading: "Un projet ?", text: "Parlez-nous de votre terrain ou de vos plans.", ctaLabel: "Écrire", ctaUrl: "#ecrire", tone: "papier", align: "centre" } },
      ]),
      vitrine.lastInsertRowid
    )
    boutiquesCreees = true
  }

  if (retouche || boutiquesCreees) {
    console.log("✓ Comptes de démonstration prêts (créés ou réparés si besoin) :")
    console.log("  Marchand : demo@novadz.dz / demo1234  (boutiques: amina-mode, tech-dz)")
    console.log("  Vitrine  : vitrine@novadz.dz / demo1234  (atelier-lina)")
    console.log("  Admin    : admin@novadz.dz / admin1234")
  }
}

module.exports = seed
