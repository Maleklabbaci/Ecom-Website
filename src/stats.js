"use strict"
/**
 * Statistiques de livraison, par transporteur et par wilaya.
 *
 * À quoi ça sert concrètement : savoir quel bureau livre vraiment. Un bureau qui
 * annonce 90 % et qui te livre 62 % te coûte deux fois — le colis aller, puis le
 * retour, plus le stock immobilisé. Ces chiffres-là se discutent avec le bureau.
 *
 * Source : la table `shipments` (un envoi) jointe à `orders` (le montant).
 * Le statut retenu est celui du transporteur, traduit par `mapped`.
 */
const db = require("./db")

/** Colis envoyés chez chaque transporteur, avec résultats et argent. */
const byCarrier = (storeId) =>
  db.prepare(`
    SELECT c.id                AS carrier_id,
           c.label             AS carrier,
           c.preset            AS preset,
           COUNT(s.id)         AS sent,
           SUM(CASE WHEN s.mapped = 'livree'  THEN 1 ELSE 0 END) AS delivered,
           SUM(CASE WHEN s.mapped = 'annulee' THEN 1 ELSE 0 END) AS returned,
           SUM(CASE WHEN COALESCE(s.mapped,'') = '' THEN 1 ELSE 0 END) AS transit,
           SUM(CASE WHEN s.mapped = 'livree'  THEN o.total_cents ELSE 0 END) AS collected,
           SUM(CASE WHEN s.mapped = 'annulee' THEN o.total_cents ELSE 0 END) AS lost,
           MIN(s.created_at)   AS first_at,
           MAX(s.created_at)   AS last_at
      FROM shipments s
      JOIN orders  o ON o.id = s.order_id
      JOIN carriers c ON c.id = s.carrier_id
     WHERE s.store_id = ?
     GROUP BY c.id, c.label, c.preset
     ORDER BY sent DESC`).all(storeId).map((r) => ({
    ...r,
    rate: r.sent ? Math.round(((r.delivered || 0) / r.sent) * 100) : 0,
    returnedRate: r.sent ? Math.round(((r.returned || 0) / r.sent) * 100) : 0,
    avg: r.sent ? Math.round(((r.collected || 0) / Math.max(1, r.delivered || 0))) : 0,
  }))

/** Résultats par wilaya de destination, tous transporteurs confondus. */
const byWilaya = (storeId, limit = 58) =>
  db.prepare(`
    SELECT COALESCE(NULLIF(o.wilaya,''),'—') AS wilaya,
           COUNT(s.id) AS sent,
           SUM(CASE WHEN s.mapped = 'livree'  THEN 1 ELSE 0 END) AS delivered,
           SUM(CASE WHEN s.mapped = 'annulee' THEN 1 ELSE 0 END) AS returned
      FROM shipments s
      JOIN orders o ON o.id = s.order_id
     WHERE s.store_id = ?
     GROUP BY o.wilaya
     ORDER BY sent DESC LIMIT ?`).all(storeId, limit)
    .map((r) => ({
      ...r,
      rate: r.sent ? Math.round(((r.delivered || 0) / r.sent) * 100) : 0,
      returnedRate: r.sent ? Math.round(((r.returned || 0) / r.sent) * 100) : 0,
    }))

/** Délai moyen entre l'envoi et le premier statut « livré » (en heures). */
const avgDeliveryHours = (storeId) => {
  const row = db.prepare(`
    SELECT AVG(julianday(s.synced_at) - julianday(s.created_at)) * 24 AS h
      FROM shipments s
     WHERE s.store_id = ? AND s.mapped = 'livree' AND s.synced_at IS NOT NULL`).get(storeId)
  return row && row.h ? Math.round(row.h) : null
}

/** Vue d'ensemble pour le tableau de bord. */
const overview = (storeId) => {
  const totals = db.prepare(`
    SELECT COUNT(*) AS sent,
           SUM(CASE WHEN mapped = 'livree'  THEN 1 ELSE 0 END) AS delivered,
           SUM(CASE WHEN mapped = 'annulee' THEN 1 ELSE 0 END) AS returned
      FROM shipments WHERE store_id = ?`).get(storeId) || {}
  const sent = totals.sent || 0
  return {
    sent,
    delivered: totals.delivered || 0,
    returned: totals.returned || 0,
    rate: sent ? Math.round(((totals.delivered || 0) / sent) * 100) : 0,
    hours: avgDeliveryHours(storeId),
  }
}

/** Comparaison simple entre transporteurs : le meilleur et le pire taux. */
const verdict = (rows) => {
  const judged = rows.filter((r) => r.sent >= 3)
  if (judged.length < 2) return null
  const sorted = [...judged].sort((a, b) => a.rate - b.rate)
  const worst = sorted[0]
  const best = sorted[sorted.length - 1]
  if (best.rate - worst.rate < 15) return null
  return {
    best: best.carrier,
    bestRate: best.rate,
    worst: worst.carrier,
    worstRate: worst.rate,
    gap: best.rate - worst.rate,
  }
}

/* ---------------------------------------------------------------------------
   Vue d'ensemble commerciale : argent, commandes, conversion, produits, wilayas.
   Tout est calculé sur `orders` (+ `order_items` et `visits`) pour la boutique.
   Les commandes annulées sont exclues du chiffre d'affaires — elles ne paient pas.
   --------------------------------------------------------------------------- */
const business = (storeId) => {
  const one = (where = "", ...args) =>
    db.prepare(`SELECT COUNT(*) AS n, COALESCE(SUM(total_cents), 0) AS cents
                FROM orders WHERE store_id = ? AND status NOT IN ('annulee', 'perdue') AND fake = 0 ${where}`).get(storeId, ...args)

  const today = one("AND date(created_at) = date('now')")
  const week = one("AND date(created_at) >= date('now', '-6 days')")
  const month = one("AND date(created_at) >= date('now', '-29 days')")
  const all = one()

  const confirmed = db.prepare(`SELECT COUNT(*) AS n FROM orders
    WHERE store_id = ? AND fake = 0 AND status IN ('confirmee', 'expediee', 'livree')`).get(storeId).n
  const total = db.prepare("SELECT COUNT(*) AS n FROM orders WHERE store_id = ? AND fake = 0").get(storeId).n
  const cancelled = db.prepare("SELECT COUNT(*) AS n FROM orders WHERE store_id = ? AND fake = 0 AND status = 'annulee'").get(storeId).n
  const lost = db.prepare("SELECT COUNT(*) AS n FROM orders WHERE store_id = ? AND fake = 0 AND status = 'perdue'").get(storeId).n
  const shipped = db.prepare("SELECT COUNT(*) AS n FROM orders WHERE store_id = ? AND fake = 0 AND status = 'livree'").get(storeId).n

  const visits = db.prepare(`SELECT COALESCE(SUM(hits), 0) AS n FROM visits
    WHERE store_id = ? AND day >= date('now', '-29 days')`).get(storeId).n

  /* 14 derniers jours : une barre par jour */
  const daily = []
  const rowsDay = db.prepare(`SELECT date(created_at) AS d, COUNT(*) AS n, COALESCE(SUM(total_cents), 0) AS cents
    FROM orders WHERE store_id = ? AND status NOT IN ('annulee', 'perdue') AND fake = 0 AND date(created_at) >= date('now', '-13 days')
    GROUP BY date(created_at)`).all(storeId)
  const byDay = new Map(rowsDay.map((r) => [r.d, r]))
  for (let i = 13; i >= 0; i--) {
    const d = new Date(Date.now() - i * 86400000).toISOString().slice(0, 10)
    const r = byDay.get(d) || { n: 0, cents: 0 }
    daily.push({ day: d, n: r.n, cents: r.cents })
  }

  const topProducts = db.prepare(`SELECT i.title, SUM(i.qty) AS qty, SUM(i.qty * i.price_cents) AS cents
    FROM order_items i JOIN orders o ON o.id = i.order_id
    WHERE o.store_id = ? AND o.status NOT IN ('annulee', 'perdue') AND o.fake = 0
    GROUP BY i.title ORDER BY qty DESC LIMIT 6`).all(storeId)

  const topWilayas = db.prepare(`SELECT wilaya, COUNT(*) AS n, COALESCE(SUM(total_cents), 0) AS cents
    FROM orders WHERE store_id = ? AND status NOT IN ('annulee', 'perdue') AND fake = 0 AND wilaya != ''
    GROUP BY wilaya ORDER BY n DESC LIMIT 6`).all(storeId)

  return {
    today, week, month, all,
    counts: { total, confirmed, cancelled, shipped, lost },
    visits,
    daily,
    topProducts,
    topWilayas,
    average: all.n ? Math.round(all.cents / all.n) : 0,
  }
}


/** D'où viennent les commandes : par plateforme (pub ) — commandes, confirmées, livrées, CA.
    Les commandes de test sont exclues : elles ne doivent jamais peser dans une décision. */
const bySource = (storeId) => {
  const rows = db.prepare(`
    SELECT CASE WHEN source IS NULL OR source IN ('','direct','referral') THEN 'organic'
                ELSE source END AS source,
           COUNT(*) AS orders,
           SUM(CASE WHEN status IN ('confirmee','expediee','livree') THEN 1 ELSE 0 END) AS confirmed,
           SUM(CASE WHEN status = 'livree' THEN 1 ELSE 0 END) AS delivered,
           SUM(CASE WHEN status = 'annulee' THEN 1 ELSE 0 END) AS cancelled,
           SUM(CASE WHEN status = 'injoignable' THEN 1 ELSE 0 END) AS unreachable,
           COALESCE(SUM(CASE WHEN status NOT IN ('annulee', 'perdue') THEN total_cents ELSE 0 END), 0) AS cents
      FROM orders WHERE store_id = ? AND fake = 0
     GROUP BY CASE WHEN source IS NULL OR source IN ('','direct','referral') THEN 'organic' ELSE source END
     ORDER BY orders DESC`).all(storeId)
  return rows.map((r) => ({
    ...r,
    rate: r.orders ? Math.round((r.confirmed / r.orders) * 100) : 0,
    deliveredRate: r.orders ? Math.round((r.delivered / r.orders) * 100) : 0,
  }))
}

/** Appareils : mobile / tablette / ordinateur, pour savoir où corriger le tunnel. */
const byDevice = (storeId) => {
  const rows = db.prepare(`SELECT COALESCE(NULLIF(device,''),'desktop') AS device, COUNT(*) AS orders
      FROM orders WHERE store_id = ? AND fake = 0 GROUP BY COALESCE(NULLIF(device,''),'desktop')
      ORDER BY orders DESC`).all(storeId)
  const total = rows.reduce((n, r) => n + r.orders, 0) || 1
  return rows.map((r) => ({ ...r, share: Math.round((r.orders / total) * 100) }))
}

module.exports = { byCarrier, byWilaya, bySource, byDevice, avgDeliveryHours, business, overview, verdict }
