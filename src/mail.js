"use strict"
/**
 * E-mails de la boutique. Chaque message est gardé dans le journal.
 * Il part vraiment seulement si un serveur SMTP est renseigné (boutique ou .env).
 */
const net = require("net")
const tls = require("tls")
const db = require("./db")
const { encrypt, decrypt } = require("./secrets")

const flagsOf = (store) => {
  let f = { merchant: true, customer: true, status: true }
  try { f = { ...f, ...(JSON.parse(store.mail_on || "{}") || {}) } } catch (_) {}
  return f
}

const configOf = (store) => {
  const host = String((store && store.smtp_host) || process.env.SMTP_HOST || "").trim()
  const port = Number((store && store.smtp_port) || process.env.SMTP_PORT || 587) || 587
  const user = String((store && store.smtp_user) || process.env.SMTP_USER || "").trim()
  const pass = (store && store.smtp_pass) ? decrypt(store.smtp_pass) : String(process.env.SMTP_PASS || "")
  const from = String((store && store.mail_from) || process.env.SMTP_FROM || user || "").trim()
  const name = String((store && store.mail_name) || (store && store.name) || "NovaDZ").trim()
  return { host, port, user, pass, from, name, ready: !!(host && from) }
}

const saveSmtp = (storeId, body) => {
  const host = String(body.smtp_host || "").trim().slice(0, 120)
  const port = Math.max(1, Math.min(65535, parseInt(body.smtp_port, 10) || 587))
  const user = String(body.smtp_user || "").trim().slice(0, 120)
  const from = String(body.mail_from || "").trim().toLowerCase().slice(0, 120)
  const name = String(body.mail_name || "").trim().slice(0, 60)
  const on = JSON.stringify({
    merchant: body.mail_merchant === "1" || body.mail_merchant === "on",
    customer: body.mail_customer === "1" || body.mail_customer === "on",
    status: body.mail_status === "1" || body.mail_status === "on",
  })
  const passRaw = String(body.smtp_pass || "")
  if (passRaw) {
    db.prepare(`UPDATE stores SET smtp_host = ?, smtp_port = ?, smtp_user = ?, smtp_pass = ?,
      mail_from = ?, mail_name = ?, mail_on = ? WHERE id = ?`)
      .run(host, port, user, encrypt(passRaw), from, name, on, storeId)
  } else {
    db.prepare(`UPDATE stores SET smtp_host = ?, smtp_port = ?, smtp_user = ?,
      mail_from = ?, mail_name = ?, mail_on = ? WHERE id = ?`)
      .run(host, port, user, from, name, on, storeId)
  }
}

const readReply = (socket) => new Promise((resolve, reject) => {
  let buf = ""
  const timer = setTimeout(() => {
    cleanup()
    reject(new Error("Le serveur mail ne répond pas."))
  }, 15000)
  function onData(chunk) {
    buf += chunk.toString("utf8")
    if (!buf.endsWith("\n")) return
    const lines = buf.split(/\r?\n/).filter(Boolean)
    const last = lines[lines.length - 1] || ""
    if (last.length >= 4 && last[3] === "-") return
    cleanup()
    const code = Number(last.slice(0, 3))
    if (!code) return reject(new Error("Réponse mail illisible."))
    if (code >= 400) return reject(new Error(last.slice(0, 180)))
    resolve(lines.join("\n"))
  }
  function onError(err) { cleanup(); reject(err) }
  function cleanup() {
    clearTimeout(timer)
    socket.off("data", onData)
    socket.off("error", onError)
  }
  socket.on("data", onData)
  socket.on("error", onError)
})

const say = async (socket, line) => {
  socket.write(line + "\r\n")
  return readReply(socket)
}

const sendSmtp = async ({ host, port, user, pass, from, fromName, to, subject, text }) => {
  const portN = Number(port) || 587
  const secure = portN === 465
  const opened = await new Promise((resolve, reject) => {
    const s = secure
      ? tls.connect({ host, port: portN, servername: host })
      : net.connect({ host, port: portN })
    const fail = (err) => reject(err)
    s.once("error", fail)
    s.once(secure ? "secureConnect" : "connect", () => {
      s.off("error", fail)
      resolve(s)
    })
  })
  let socket = opened
  try {
    await readReply(socket)
    let hello = await say(socket, "EHLO novadz")
    if (!secure && /STARTTLS/i.test(hello)) {
      await say(socket, "STARTTLS")
      socket = await new Promise((resolve, reject) => {
        const t = tls.connect({ socket, servername: host })
        t.once("error", reject)
        t.once("secureConnect", () => resolve(t))
      })
      hello = await say(socket, "EHLO novadz")
    }
    if (user) {
      await say(socket, "AUTH LOGIN")
      await say(socket, Buffer.from(String(user)).toString("base64"))
      await say(socket, Buffer.from(String(pass || "")).toString("base64"))
    }
    await say(socket, `MAIL FROM:<${from}>`)
    await say(socket, `RCPT TO:<${to}>`)
    await say(socket, "DATA")
    const safe = String(text || "").replace(/^\./gm, "..")
    const fromHeader = fromName
      ? `"${String(fromName).replace(/[\r\n"]/g, "").slice(0, 60)}" <${from}>`
      : from
    const mime = [
      `From: ${fromHeader}`,
      `To: ${to}`,
      `Subject: =?UTF-8?B?${Buffer.from(String(subject || "")).toString("base64")}?=`,
      "MIME-Version: 1.0",
      "Content-Type: text/plain; charset=UTF-8",
      "",
      safe,
      ".",
    ].join("\r\n")
    socket.write(mime + "\r\n")
    await readReply(socket)
    try { socket.write("QUIT\r\n") } catch (_) {}
    socket.end()
  } catch (err) {
    try { socket.destroy() } catch (_) {}
    throw err
  }
}

const deliver = async (store, { kind, to, subject, text }) => {
  const dest = String(to || "").trim().toLowerCase()
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(dest)) return { ok: false, error: "Pas d'adresse e-mail." }
  const cfg = configOf(store)
  const info = db.prepare(`INSERT INTO mail_outbox (store_id, kind, to_email, subject, body, status)
    VALUES (?, ?, ?, ?, ?, 'attente')`).run(store.id, kind, dest, subject.slice(0, 180), text.slice(0, 8000))
  if (!cfg.ready) {
    db.prepare("UPDATE mail_outbox SET status = 'attente', error = ? WHERE id = ?")
      .run("Aucun serveur d'envoi. Le message est gardé ici.", info.lastInsertRowid)
    return { ok: false, kept: true, error: "Aucun serveur d'envoi." }
  }
  const from = cfg.from.includes("@") ? cfg.from : dest
  try {
    await sendSmtp({
      host: cfg.host, port: cfg.port, user: cfg.user, pass: cfg.pass,
      from, fromName: cfg.name, to: dest, subject, text,
    })
    db.prepare("UPDATE mail_outbox SET status = 'envoye', error = '' WHERE id = ?").run(info.lastInsertRowid)
    return { ok: true }
  } catch (err) {
    const msg = String(err && err.message || err).slice(0, 180)
    db.prepare("UPDATE mail_outbox SET status = 'echec', error = ? WHERE id = ?").run(msg, info.lastInsertRowid)
    return { ok: false, error: msg }
  }
}

const money = (cents, cur) => `${(Number(cents || 0) / 100).toLocaleString("fr-FR")} ${cur || "DZD"}`

const linesOf = (orderId) =>
  db.prepare("SELECT title, qty, price_cents FROM order_items WHERE order_id = ?").all(orderId)
    .map((i) => `- ${i.title} × ${i.qty}`)
    .join("\n")

const ownerEmail = (store) => {
  const row = db.prepare("SELECT email FROM users WHERE id = ?").get(store.owner_id)
  return (store.mail_from && store.mail_from.includes("@") ? store.mail_from : "") || (row && row.email) || ""
}

const orderPlaced = (store, order) => {
  if (!store || !order || order.fake) return
  const flags = flagsOf(store)
  const cur = store.currency || "DZD"
  const lines = linesOf(order.id) || "- (articles)"
  const block = [
    `Commande ${order.ref}`,
    `${order.customer_name || "Client"} · ${order.phone || ""}`,
    order.wilaya ? `Wilaya : ${order.wilaya}` : "",
    order.address ? `Adresse : ${order.address}` : "",
    "",
    lines,
    "",
    `Total : ${money(order.total_cents, cur)}`,
  ].filter((x) => x !== undefined).join("\n")
  if (flags.merchant) {
    deliver(store, {
      kind: "commande",
      to: ownerEmail(store),
      subject: `Nouvelle commande ${order.ref} — ${store.name}`,
      text: `Nouvelle commande sur ${store.name}.\n\n${block}\n\nOuvrez le tableau de bord pour appeler le client.`,
    }).catch(() => {})
  }
  if (flags.customer && order.customer_email) {
    deliver(store, {
      kind: "client",
      to: order.customer_email,
      subject: `Commande ${order.ref} reçue — ${store.name}`,
      text: `Bonjour ${order.customer_name || ""},\n\n${store.name} a bien reçu votre commande ${order.ref}.\nNous vous appelons pour la confirmer avant l'envoi.\n\n${block}\n\n${store.name}`,
    }).catch(() => {})
  }
}

const onStatus = (order, status) => {
  if (!order || order.fake) return
  const store = db.prepare("SELECT * FROM stores WHERE id = ?").get(order.store_id)
  if (!store || !flagsOf(store).status || !order.customer_email) return
  const labels = {
    confirmee: "confirmée", expediee: "expédiée", livree: "livrée",
    annulee: "annulée", reportee: "reportée", injoignable: "en attente d'appel",
    remboursee: "remboursée",
  }
  const word = labels[status] || status
  deliver(store, {
    kind: "statut",
    to: order.customer_email,
    subject: `Commande ${order.ref} ${word} — ${store.name}`,
    text: `Bonjour ${order.customer_name || ""},\n\nVotre commande ${order.ref} est ${word}.\n${order.tracking ? "Suivi : " + order.tracking + "\n" : ""}Total : ${money(order.total_cents, store.currency)}\n\n${store.name}`,
  }).catch(() => {})
}

const test = (store) => deliver(store, {
  kind: "essai",
  to: ownerEmail(store),
  subject: `Essai — ${store.name}`,
  text: `Ceci est un e-mail d'essai envoyé par NovaDZ pour ${store.name}. Si vous le lisez, l'envoi fonctionne.`,
})

const recent = (storeId) =>
  db.prepare("SELECT id, kind, to_email, subject, status, error, created_at FROM mail_outbox WHERE store_id = ? ORDER BY id DESC LIMIT 30").all(storeId)

const pickEmail = (body, values) => {
  const bag = { ...(values || {}), ...(body || {}) }
  for (const [k, v] of Object.entries(bag)) {
    if (/mail/i.test(k) && String(v || "").includes("@")) return String(v).trim().toLowerCase().slice(0, 120)
  }
  return ""
}

module.exports = { flagsOf, configOf, saveSmtp, deliver, orderPlaced, onStatus, test, recent, pickEmail, ownerEmail }
