"use strict"
/**
 * Pixels serveur — Conversions API.
 *
 * Le pixel navigateur perd une partie des achats (bloqueurs, iOS, navigateur intégré
 * Facebook/Instagram/TikTok). Ici on envoie les événements DEPUIS LE SERVEUR, avec le
 * même `event_id` que le navigateur : Meta, TikTok et Snapchat dédoublonnent, on ne
 * compte donc pas deux fois.
 *
 * Événements : ViewContent, AddToCart, InitiateCheckout, Purchase.
 * Tout échec est journalisé dans `pixel_events` — jamais bloquant pour la commande.
 */
const crypto = require("crypto")
const db = require("./db")

db.exec(`
CREATE TABLE IF NOT EXISTS pixel_events (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  store_id   INTEGER NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  provider   TEXT NOT NULL,
  event_name TEXT NOT NULL,
  event_id   TEXT DEFAULT '',
  order_id   INTEGER,
  status     TEXT NOT NULL DEFAULT 'envoi',
  code       INTEGER,
  message    TEXT DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_px_store ON pixel_events(store_id, id DESC);
`)

const cols = (t) => db.prepare(`PRAGMA table_info(${t})`).all().map((c) => c.name)
const addCol = (t, n, d) => { if (!cols(t).includes(n)) db.exec(`ALTER TABLE ${t} ADD COLUMN ${n} ${d}`) }

addCol("stores", "pixels_server", "INTEGER NOT NULL DEFAULT 1")
addCol("stores", "meta_token", "TEXT DEFAULT ''")
addCol("stores", "tiktok_token", "TEXT DEFAULT ''")
addCol("stores", "snap_pixel", "TEXT DEFAULT ''")
addCol("stores", "snap_token", "TEXT DEFAULT ''")
addCol("stores", "pixel_test_code", "TEXT DEFAULT ''")

const sha256 = (v) => crypto.createHash("sha256").update(String(v)).digest("hex")

/** Téléphone au format E.164 sans + (213...), puis haché — exigé par les 3 régies. */
const hashedPhone = (raw) => {
  let d = String(raw || "").replace(/[^0-9]/g, "")
  if (d.startsWith("0")) d = "213" + d.slice(1)
  else if (d.startsWith("213")) { /* déjà bon */ }
  else if (d) d = "213" + d
  return d ? sha256(d) : ""
}

const providers = (store) => {
  if (!store.pixels_server) return []
  const list = []
  if (store.pixel_meta && store.meta_token) list.push("meta")
  if (store.pixel_tiktok && store.tiktok_token) list.push("tiktok")
  if (store.snap_pixel && store.snap_token) list.push("snap")
  return list
}

const META_EVENT = {
  ViewContent: "ViewContent",
  AddToCart: "AddToCart",
  InitiateCheckout: "InitiateCheckout",
  Purchase: "Purchase",
}
const TIKTOK_EVENT = {
  ViewContent: "ViewContent",
  AddToCart: "AddToCart",
  InitiateCheckout: "InitiateCheckout",
  Purchase: "CompletePayment",
}
const SNAP_EVENT = {
  ViewContent: "VIEW_CONTENT",
  AddToCart: "ADD_CART",
  InitiateCheckout: "START_CHECKOUT",
  Purchase: "PURCHASE",
}

const log = (storeId, provider, eventName, eventId, orderId, status, code, message) =>
  db.prepare(`INSERT INTO pixel_events (store_id, provider, event_name, event_id, order_id, status, code, message)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?)`)
    .run(storeId, provider, eventName, eventId || "", orderId || null, status, code || null, String(message || "").slice(0, 300))

const post = async (url, body, headers = {}) => {
  const r = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(6000),
  })
  const text = await r.text()
  return { ok: r.ok, code: r.status, text: text.slice(0, 300) }
}

const sendMeta = async (store, eventName, ev, ctx) => {
  const pixel = String(store.pixel_meta).replace(/[^0-9]/g, "")
  const payload = {
    data: [{
      event_name: META_EVENT[eventName] || eventName,
      event_time: Math.floor(Date.now() / 1000),
      event_id: ev.eventId,
      action_source: "website",
      event_source_url: ctx.url || "",
      user_data: {
        ph: [hashedPhone(ctx.phone)].filter(Boolean),
        client_ip_address: ctx.ip || "",
        client_user_agent: ctx.ua || "",
        country: [sha256("dz")],
      },
      custom_data: {
        currency: "DZD",
        value: (ev.valueCents || 0) / 100,
        content_ids: ev.productIds ? ev.productIds.map(String) : [],
        content_type: "product",
      },
    }],
    access_token: store.meta_token,
  }
  if (store.pixel_test_code) payload.test_event_code = store.pixel_test_code
  return post(`https://graph.facebook.com/v19.0/${pixel}/events`, payload)
}

const sendTikTok = async (store, eventName, ev, ctx) => {
  const payload = {
    event_source: "web",
    event_source_id: String(store.pixel_tiktok).replace(/[^A-Za-z0-9]/g, ""),
    partner_name: "NovaDZ",
    data: [{
      event: TIKTOK_EVENT[eventName] || eventName,
      event_time: Math.floor(Date.now() / 1000),
      event_id: ev.eventId,
      user: { phone: hashedPhone(ctx.phone), ip: ctx.ip || "", user_agent: ctx.ua || "" },
      properties: {
        currency: "DZD",
        value: (ev.valueCents || 0) / 100,
        contents: ev.productIds ? ev.productIds.map((id) => ({ content_id: String(id), quantity: 1, price: (ev.valueCents || 0) / 100 })) : [],
      },
      page: { url: ctx.url || "" },
    }],
  }
  if (store.pixel_test_code) payload.data[0].test_event_code = store.pixel_test_code
  return post("https://business-api.tiktok.com/open_api/v1.3/event/track/", payload, {
    "Access-Token": store.tiktok_token,
  })
}

const sendSnap = async (store, eventName, ev, ctx) => {
  const payload = {
    pixel_id: String(store.snap_pixel).replace(/[^A-Za-z0-9-]/g, ""),
    event_type: SNAP_EVENT[eventName] || eventName,
    event_conversion_type: "WEB",
    timestamp: Date.now(),
    event_tag: ev.eventId,
    hashed_phone_number: hashedPhone(ctx.phone),
    client_dedup_id: ev.eventId,
    price: (ev.valueCents || 0) / 100,
    currency: "DZD",
    page_url: ctx.url || "",
  }
  return post("https://tr.snapchat.com/v2/conversion", payload, {
    Authorization: `Bearer ${store.snap_token}`,
  })
}

const SENDERS = { meta: sendMeta, tiktok: sendTikTok, snap: sendSnap }

/**
 * Envoie un événement à toutes les régies configurées.
 * Ne lève jamais : renvoie la liste des résultats.
 */
const track = async (store, eventName, ev = {}, ctx = {}) => {
  const list = providers(store)
  if (!list.length) return []
  const results = await Promise.all(list.map(async (p) => {
    try {
      const r = await SENDERS[p](store, eventName, ev, ctx)
      log(store.id, p, eventName, ev.eventId, ev.orderId, r.ok ? "ok" : "erreur", r.code, r.ok ? "" : r.text)
      return { provider: p, ok: r.ok, code: r.code }
    } catch (e) {
      log(store.id, p, eventName, ev.eventId, ev.orderId, "erreur", 0, e.message)
      return { provider: p, ok: false, code: 0, error: e.message }
    }
  }))
  return results
}

/** Ne bloque pas la réponse HTTP : l'événement part en arrière-plan. */
const trackAsync = (store, eventName, ev, ctx) => {
  track(store, eventName, ev, ctx).catch(() => {})
}

/** Identifiant d'événement stable, commun au navigateur et au serveur (dédoublonnage). */
const eventId = (kind, seed) => `${kind}-${seed}`

/** Script navigateur pour l'événement d'achat, avec le même event_id que le serveur. */
const purchaseSnippet = (store, order, items) => {
  if (!store.pixel_meta && !store.pixel_tiktok) return ""
  const id = eventId("purchase", order.id)
  const value = (order.total_cents || 0) / 100
  const ids = JSON.stringify(items.map((i) => String(i.product_id || "")))
  return `<script>
(function(){
  var id = ${JSON.stringify(id)};
  if (window.fbq) fbq('track', 'Purchase', {value: ${value}, currency: 'DZD', content_ids: ${ids}, content_type: 'product'}, {eventID: id});
  if (window.ttq) ttq.track('CompletePayment', {value: ${value}, currency: 'DZD', content_id: ${ids}[0]}, {event_id: id});
})();
</script>`
}

const recent = (storeId, limit = 40) =>
  db.prepare("SELECT * FROM pixel_events WHERE store_id = ? ORDER BY id DESC LIMIT ?").all(storeId, limit)

const stats = (storeId) => {
  const rows = db.prepare(`SELECT event_name, status, COUNT(*) n FROM pixel_events
                           WHERE store_id = ? AND created_at >= datetime('now', '-7 days')
                           GROUP BY event_name, status`).all(storeId)
  const out = { ok: 0, erreur: 0, byEvent: {} }
  for (const r of rows) {
    out[r.status === "ok" ? "ok" : "erreur"] += r.n
    out.byEvent[r.event_name] = (out.byEvent[r.event_name] || 0) + r.n
  }
  return out
}

module.exports = { track, trackAsync, eventId, purchaseSnippet, providers, recent, stats, hashedPhone }
