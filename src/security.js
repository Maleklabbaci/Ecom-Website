"use strict"
/**
 * Sécurité des commandes — anti-fausses commandes.
 *
 * Trois contrôles, dans cet ordre :
 *   1. CAPTCHA (Google reCAPTCHA v2 case à cocher, v2 invisible, v3 invisible avec score)
 *   2. Téléphone algérien valide + normalisé
 *   3. Score de risque : géolocalisation, doublon téléphone, adresse trop courte,
 *      rafale depuis la même IP, commande sans JavaScript
 *
 * Résultat : la commande est soit `nouvelle`, soit `a_verifier` avec ses motifs.
 * Rien n'est bloqué par défaut : le marchand voit et décide (sauf échec CAPTCHA).
 */
const crypto = require("crypto")
const db = require("./db")

/* ------------------------------ schéma ------------------------------ */
const cols = (t) => db.prepare(`PRAGMA table_info(${t})`).all().map((c) => c.name)
const addCol = (t, n, d) => { if (!cols(t).includes(n)) db.exec(`ALTER TABLE ${t} ADD COLUMN ${n} ${d}`) }

addCol("stores", "captcha_enabled", "INTEGER NOT NULL DEFAULT 1")
addCol("stores", "captcha_version", "TEXT DEFAULT 'v3'")
addCol("stores", "captcha_site", "TEXT DEFAULT ''")
addCol("stores", "captcha_secret", "TEXT DEFAULT ''")
addCol("stores", "captcha_min_score", "REAL DEFAULT 0.5")
addCol("stores", "phone_strict", "INTEGER NOT NULL DEFAULT 0")

addCol("orders", "landing_id", "INTEGER")
addCol("orders", "geo_lat", "REAL")
addCol("orders", "geo_lng", "REAL")
addCol("orders", "geo_accuracy", "INTEGER")
addCol("orders", "ip", "TEXT DEFAULT ''")
addCol("orders", "ua", "TEXT DEFAULT ''")
addCol("orders", "risk_score", "INTEGER NOT NULL DEFAULT 0")
addCol("orders", "risk_flags", "TEXT DEFAULT ''")
addCol("orders", "captcha_ok", "INTEGER NOT NULL DEFAULT 1")

db.exec(`
CREATE TABLE IF NOT EXISTS blocked_phones (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  store_id   INTEGER NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  phone      TEXT NOT NULL,
  reason     TEXT DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(store_id, phone)
);
`)

/* ------------------------------ téléphone ------------------------------ */
/** Normalise un numéro algérien vers 0XXXXXXXXX (9 chiffres après le 0). */
const normalizePhone = (raw) => {
  let d = String(raw || "").replace(/[^0-9+]/g, "")
  if (d.startsWith("+213")) d = "0" + d.slice(4)
  else if (d.startsWith("00213")) d = "0" + d.slice(5)
  else if (d.startsWith("213") && d.length >= 11) d = "0" + d.slice(3)
  d = d.replace(/^0*/, "0")
  return d
}

/** Mobile algérien : 05, 06, 07 + 8 chiffres. Fixe : 02x, 03x, 04x. */
const phoneOk = (raw) => {
  const p = normalizePhone(raw)
  return /^0(5|6|7)[0-9]{8}$/.test(p) || /^0(2|3|4)[0-9]{7,8}$/.test(p) ? p : null
}

/* ------------------------------ CAPTCHA ------------------------------ */
const captchaOn = (store) => Boolean(store.captcha_enabled) && Boolean(store.captcha_site) && Boolean(store.captcha_secret)

/**
 * Vérifie le jeton auprès de Google.
 * En cas d'erreur réseau, on ne bloque pas la commande : on la marque à vérifier.
 */
const verifyCaptcha = async (store, token, ip) => {
  if (!captchaOn(store)) return { ok: true, skipped: true, score: null }
  if (!token) return { ok: false, score: null, reason: "captcha_absent" }
  try {
    const body = new URLSearchParams({ secret: store.captcha_secret, response: token })
    if (ip) body.set("remoteip", ip)
    const r = await fetch("https://www.google.com/recaptcha/api/siteverify", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body,
      signal: AbortSignal.timeout(5000),
    })
    const j = await r.json()
    const score = typeof j.score === "number" ? j.score : null
    if (!j.success) return { ok: false, score, reason: "captcha_invalide" }
    if (score !== null && score < Number(store.captcha_min_score || 0.5)) {
      return { ok: false, score, reason: "captcha_score_faible" }
    }
    return { ok: true, score }
  } catch (_) {
    /* réseau coupé / Google injoignable : on ne perd pas la vente */
    return { ok: true, score: null, reason: "captcha_indisponible" }
  }
}

/* ------------------------------ risque ------------------------------ */
const isBlocked = (storeId, phone) =>
  Boolean(db.prepare("SELECT 1 FROM blocked_phones WHERE store_id = ? AND phone = ?").get(storeId, phone))

const recentFromPhone = (storeId, phone, minutes = 15) =>
  db.prepare(`SELECT COUNT(*) n FROM orders
              WHERE store_id = ? AND phone = ? AND created_at >= datetime('now', ?)`)
    .get(storeId, phone, `-${minutes} minutes`).n

const recentFromIp = (storeId, ip, minutes = 10) =>
  ip ? db.prepare(`SELECT COUNT(*) n FROM orders
                   WHERE store_id = ? AND ip = ? AND created_at >= datetime('now', ?)`)
    .get(storeId, ip, `-${minutes} minutes`).n : 0

/**
 * Calcule un score 0-100 et la liste des motifs.
 * 0-29 : RAS · 30-59 : à vérifier · 60+ : suspect (appel obligatoire).
 */
const risk = (store, input) => {
  const flags = []
  let score = 0
  const phone = input.phone || ""
  const address = String(input.address || "").trim()

  if (!phoneOk(phone)) { flags.push("telephone_invalide"); score += 45 }
  if (isBlocked(store.id, phone)) { flags.push("telephone_bloque"); score += 60 }
  if (recentFromPhone(store.id, phone) > 0) { flags.push("doublon_telephone"); score += 35 }
  if (recentFromIp(store.id, input.ip) >= 3) { flags.push("rafale_meme_ip"); score += 30 }
  if (address.length < 12) { flags.push("adresse_courte"); score += 15 }
  if (!input.geo || !input.geo.lat) { flags.push("position_absente"); score += 10 }
  if (input.captchaScore !== null && input.captchaScore !== undefined && input.captchaScore < 0.3) {
    flags.push("captcha_score_tres_faible"); score += 25
  }
  if (input.captchaReason === "captcha_indisponible") { flags.push("captcha_indisponible"); score += 5 }

  return { score: Math.min(100, score), flags }
}

const statusFor = (riskScore) => (riskScore >= 30 ? "a_verifier" : "nouvelle")

/* ------------------------------ injection dans les pages ------------------------------ */
const siteKey = (store) => String(store.captcha_site || "").replace(/[^A-Za-z0-9_-]/g, "")

/** Champs cachés + widget CAPTCHA, insérés dans le formulaire de commande. */
const formFields = (store) => {
  const fields = `
<input type="hidden" name="geo_lat" id="ndzGeoLat" value="">
<input type="hidden" name="geo_lng" id="ndzGeoLng" value="">
<input type="hidden" name="geo_acc" id="ndzGeoAcc" value="">
<input type="hidden" name="form_ms" id="ndzFormMs" value="">
<input type="hidden" name="captcha_token" id="ndzCaptchaToken" value="">`
  if (!captchaOn(store)) return fields
  const key = siteKey(store)
  if (store.captcha_version === "v2") {
    return fields + `<div class="ndz-captcha g-recaptcha" data-sitekey="${key}"></div>`
  }
  if (store.captcha_version === "v2i") {
    return fields + `<button type="submit" class="g-recaptcha btn-recaptcha" data-sitekey="${key}"
      data-callback="ndzCaptchaOk">Confirmer ma commande</button>`
  }
  return fields + `<div class="ndz-captcha-note">Protégé par reCAPTCHA</div>`
}

/** Scripts à injecter en fin de page (géolocalisation + CAPTCHA). */
const formScripts = (store) => {
  const key = captchaOn(store) ? siteKey(store) : ""
  const v = store.captcha_version || "v3"
  const loadV2 = captchaOn(store) && (v === "v2" || v === "v2i")
  const loadV3 = captchaOn(store) && v === "v3"
  return `
<script>
(function(){
  var f = document.querySelector('form[action$="/checkout"]') || document.querySelector('form[action*="/l/"]');
  if (!f) return;
  var lat = document.getElementById('ndzGeoLat'), lng = document.getElementById('ndzGeoLng'),
      acc = document.getElementById('ndzGeoAcc'), ms = document.getElementById('ndzFormMs');
  if (ms) ms.value = String(Date.now());
  if (navigator.geolocation) {
    navigator.geolocation.getCurrentPosition(function(pos){
      if (lat) lat.value = pos.coords.latitude.toFixed(6);
      if (lng) lng.value = pos.coords.longitude.toFixed(6);
      if (acc) acc.value = Math.round(pos.coords.accuracy || 0);
    }, function(){}, { enableHighAccuracy: false, timeout: 6000, maximumAge: 600000 });
  }
})();
</script>${loadV2 ? `
<script src="https://www.google.com/recaptcha/api.js" async defer></script>
<script>function ndzCaptchaOk(t){var i=document.getElementById('ndzCaptchaToken');if(i)i.value=t;}</script>` : ""}${loadV3 ? `
<script src="https://www.google.com/recaptcha/api.js?render=${key}"></script>
<script>
document.addEventListener('submit', function(e){
  var f = e.target; if (!f || !f.getAttribute('action')) return;
  if (!/checkout|\\/l\\//.test(f.getAttribute('action'))) return;
  var box = document.getElementById('ndzCaptchaToken'); if (!box || box.value) return;
  if (!window.grecaptcha) return;
  e.preventDefault();
  grecaptcha.ready(function(){
    grecaptcha.execute('${key}', { action: 'checkout' }).then(function(t){
      box.value = t; f.submit();
    });
  });
}, true);
</script>` : ""}`
}

const injectCheckout = (html, store) => {
  let out = html
  const i = out.indexOf("</form>")
  if (i !== -1) out = out.slice(0, i) + formFields(store) + out.slice(i)
  if (out.includes("</body>")) out = out.replace("</body>", formScripts(store) + "</body>")
  return out
}

const ipOf = (req) => {
  const xf = String(req.headers["x-forwarded-for"] || "").split(",")[0].trim()
  return xf || req.socket.remoteAddress || ""
}

const blockPhone = (storeId, phone, reason = "") =>
  db.prepare("INSERT OR IGNORE INTO blocked_phones (store_id, phone, reason) VALUES (?, ?, ?)")
    .run(storeId, normalizePhone(phone), reason)

const unblockPhone = (storeId, phone) =>
  db.prepare("DELETE FROM blocked_phones WHERE store_id = ? AND phone = ?").run(storeId, normalizePhone(phone))

const blockedList = (storeId) =>
  db.prepare("SELECT * FROM blocked_phones WHERE store_id = ? ORDER BY id DESC").all(storeId)

module.exports = {
  normalizePhone, phoneOk, captchaOn, verifyCaptcha, risk, statusFor,
  injectCheckout, formFields, formScripts, ipOf,
  isBlocked, blockPhone, unblockPhone, blockedList,
}
