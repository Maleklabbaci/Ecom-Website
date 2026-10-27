"use strict"
/**
 * Le journal, dit pour la personne qui tient NovaDZ.
 * Pas de codes, pas d'adresses techniques dans ce qu'elle lit.
 */

const MONTHS = ["janv", "févr", "mars", "avr", "mai", "juin", "juil", "août", "sept", "oct", "nov", "déc"]

const niceSlug = (slug) => String(slug || "")
  .split("-")
  .filter(Boolean)
  .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
  .join(" ")

const shopIn = (message) => {
  const m = String(message || "").match(/\(([a-z0-9-]+)\)/i)
  return m ? niceSlug(m[1]) : ""
}

const pathOf = (row) => {
  if (row && row.path) return String(row.path).split("?")[0]
  const m = String(row && row.message || "").match(/\s(\/[^\s:]*)/)
  return m ? m[1].split("?")[0] : ""
}

const pageName = (path, method) => {
  const p = String(path || "/").split("?")[0]
  if (p === "/") return "la page d'accueil NovaDZ"
  if (p === "/login") return method === "POST" ? "la connexion" : "la page de connexion"
  if (p === "/signup") return "la page pour créer une boutique"
  if (p === "/logout") return "la déconnexion"
  if (p === "/admin" || p === "/admin/") return "l'accueil de l'admin"
  if (p.startsWith("/admin/logs")) return "le journal"
  if (p.startsWith("/admin/boutiques")) return "les boutiques"
  if (p.startsWith("/admin/comptes")) return "les comptes"
  if (p.startsWith("/admin/health")) return "la santé du site"
  if (p.startsWith("/dashboard/orders")) return "les commandes d'un marchand"
  if (p.startsWith("/dashboard/design")) return "le design d'une boutique"
  if (p.startsWith("/dashboard")) return "le tableau de bord d'un marchand"
  if (p.startsWith("/rejoindre")) return "une invitation d'équipe"
  const slug = p.split("/").filter(Boolean)[0]
  if (slug && !["api", "styles.css", "uploads", "demo"].includes(slug)) return "la boutique " + niceSlug(slug)
  return "une page"
}

const whenHuman = (s) => {
  const raw = String(s || "").replace("T", " ")
  const m = raw.match(/(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})/)
  if (!m) return raw.slice(0, 16)
  return `${Number(m[3])} ${MONTHS[Number(m[2]) - 1]} à ${m[4]}:${m[5]}`
}

const times = (n) => {
  const v = Number(n) || 1
  if (v <= 1) return "une fois"
  return v.toLocaleString("fr-FR").replace(/\u202f/g, " ") + " fois"
}

const worryOf = (kind) => ({
  ignore: { label: "Pas grave", pill: "ok", tone: "ok" },
  info: { label: "Normal", pill: "", tone: "ok" },
  look: { label: "À regarder", pill: "low", tone: "calm" },
  bad: { label: "Ça bloque", pill: "annulee", tone: "bad" },
}[kind] || { label: "À savoir", pill: "", tone: "ok" })

const explain = (row) => {
  const msg = String(row && row.message || "")
  const path = pathOf(row)
  const shop = shopIn(msg) || (path.startsWith("/") && !path.startsWith("/admin") && !path.startsWith("/dashboard") && !path.startsWith("/login")
    ? niceSlug(path.split("/").filter(Boolean)[0] || "")
    : "")
  const where = pageName(path, row && row.method)
  const preview = /preview|editor|aperçu/i.test(msg)
  let kind = "info"
  let title = "Quelque chose a été noté"
  let text = "Rien n'indique que le site est cassé, ni qu'une commande a été perdue."

  if (/EPIPE|sortie fermée|fermé la page trop tôt/i.test(msg)) {
    kind = "ignore"
    title = "Quelqu'un a fermé la page trop tôt"
    text = "NovaDZ écrivait encore, et la page était déjà fermée. Ça s'est répété tout seul. Aucune commande n'a été perdue. Tu n'as rien à faire."
  } else if (/meta is not defined/i.test(msg)) {
    kind = "look"
    title = shop ? `L'aperçu de ${shop} a planté` : "Un aperçu a planté"
    text = "C'est l'aperçu dans l'éditeur, pas la page que le client voit pour commander. Un morceau de la page manquait. Le client, lui, n'a pas forcément vu ça."
  } else if (/connexion refusée, compte bloqué/i.test(msg)) {
    kind = "info"
    title = "Un compte bloqué a essayé d'entrer"
    text = "La personne n'a pas pu se connecter. C'est normal : le compte est bloqué. Rien n'a été ouvert."
  } else if (/mot de passe refusé/i.test(msg)) {
    kind = "look"
    title = "Mauvais mot de passe"
    text = "Quelqu'un a tapé un mauvais mot de passe. Si c'est toi, réessaie. Si ça revient souvent, change le mot de passe."
  } else if (/connexion refusée/i.test(msg)) {
    kind = "info"
    title = "Connexion refusée"
    text = "L'e-mail ou l'identifiant n'existe pas. Personne n'est entré."
  } else if (/admin ouvre une boutique/i.test(msg)) {
    kind = "info"
    title = "Tu as ouvert une boutique"
    text = "C'est toi, depuis l'admin, pour voir la boutique comme le marchand. Rien n'a été modifié."
  } else if (/plan modifié/i.test(msg)) {
    kind = "info"
    title = "Le forfait d'une boutique a changé"
    text = "Le nom du forfait a été modifié. NovaDZ ne prend toujours pas la carte."
  } else if (/design publié/i.test(msg)) {
    kind = "info"
    title = shop ? `${shop} a publié son site` : "Un site a été publié"
    text = "Le marchand a mis le design en ligne. C'est cette version que les clients voient."
  } else if (/thème essayé|theme essay/i.test(msg)) {
    kind = "info"
    title = shop ? `${shop} a essayé un thème` : "Un thème a été essayé"
    text = "C'est un essai. Le site en ligne ne change pas tant que le marchand n'a pas publié."
  } else if (/essai de thème annulé/i.test(msg)) {
    kind = "info"
    title = "Essai de thème annulé"
    text = shop ? `${shop} est revenu au design d'avant.` : "Le marchand est revenu au design d'avant."
  } else if (/thème choisi/i.test(msg)) {
    kind = "info"
    title = shop ? `${shop} a choisi un thème` : "Un thème a été choisi"
    text = "Le thème est gardé. Il faut encore publier pour que les clients le voient."
  } else if (/remboursement/i.test(msg)) {
    kind = "info"
    title = "Un remboursement a été noté"
    text = "Le statut de la commande a changé. L'argent n'est pas renvoyé tout seul par NovaDZ."
  } else if (/commande créée|commande landing/i.test(msg)) {
    kind = "info"
    title = "Une commande est arrivée"
    text = shop ? `Un client a commandé chez ${shop}.` : "Un client a commandé. Tu la vois dans la boutique."
  } else if (/relance/i.test(msg)) {
    kind = /error|échou|echec|fail/i.test(msg) || (row && row.level === "error") ? "look" : "info"
    title = "Relance des paniers laissés"
    text = kind === "look"
      ? "NovaDZ n'a pas pu envoyer le message. Vérifie l'adresse de l'API dans Relances."
      : "NovaDZ a préparé ou envoyé les messages pour les paniers laissés."
  } else if (/sync transporteurs|colis/i.test(msg)) {
    kind = row && row.level === "error" ? "look" : "info"
    title = "Suivi des colis"
    text = kind === "look"
      ? "NovaDZ n'a pas pu vérifier les colis. Le transporteur n'a rien reçu de plus."
      : "NovaDZ a vérifié où en sont les colis."
  } else if (/fermé la page|EPIPE/i.test(msg)) {
    kind = "ignore"
    title = "Quelqu'un a fermé la page trop tôt"
    text = "Aucune commande n'a été perdue. Tu n'as rien à faire."
  } else if (row && row.level === "error" || /exception|n'a pas pu s'afficher|planté|uncaught|promesse rejetée|erreur 5/i.test(msg)) {
    kind = "bad"
    title = shop ? `${shop} n'a pas pu s'afficher` : "Une page a planté"
    text = preview
      ? `C'était un aperçu, sur ${where}. Le client qui commande n'a pas forcément vu ça.`
      : `Quelqu'un a ouvert ${where}, et la page n'a pas fini. Ce n'est pas forcément une commande perdue.`
  } else if (row && row.level === "slow" || /été lente|lent /i.test(msg)) {
    kind = "look"
    title = "Une page a été lente"
    text = `${where.charAt(0).toUpperCase() + where.slice(1)} a fini par s'ouvrir, mais la personne a attendu.`
  } else if (row && row.level === "warn" || /refusé|Accès refusé/i.test(msg)) {
    kind = "look"
    title = "Accès refusé"
    text = `Quelqu'un a essayé d'ouvrir ${where} sans en avoir le droit. Rien n'a été modifié.`
  } else if (row && row.level === "info") {
    title = "Activité notée"
    text = "C'est un événement normal. Rien n'est cassé."
  }

  const how = worryOf(kind)
  return { title, text, kind, label: how.label, pill: how.pill, tone: how.tone, where, shop }
}

const livePlain = (row) => {
  const path = String(row.path || "/")
  const method = row.method || "GET"
  const status = Number(row.status) || 0
  const ms = Number(row.ms) || 0
  const where = pageName(path, method)
  let sentence = `${where.charAt(0).toUpperCase() + where.slice(1)} s'est ouverte.`
  let label = "Ça a marché"
  let pill = "ok"
  if (method === "POST" && path === "/login" && status < 400) {
    sentence = "Quelqu'un s'est connecté."
    label = "Ça a marché"
  } else if (status >= 500) {
    sentence = `${where.charAt(0).toUpperCase() + where.slice(1)} n'a pas pu s'afficher.`
    label = "Ça a planté"
    pill = "annulee"
  } else if (status === 404) {
    sentence = "Quelqu'un a demandé une page qui n'existe pas."
    label = "Introuvable"
    pill = "low"
  } else if (status === 401 || status === 403) {
    sentence = `Quelqu'un a essayé d'ouvrir ${where} sans le droit.`
    label = "Refusé"
    pill = "low"
  } else if (status >= 400) {
    sentence = `${where.charAt(0).toUpperCase() + where.slice(1)} n'a pas abouti.`
    label = "Pas abouti"
    pill = "low"
  } else if (ms >= 800) {
    sentence = `${where.charAt(0).toUpperCase() + where.slice(1)} s'est ouverte, mais c'était long.`
    label = "Un peu long"
    pill = "low"
  }
  return { sentence, label, pill }
}

const statusOf = (sum) => {
  const errors = Number(sum && sum.errors) || 0
  const warns = Number(sum && sum.warns) || 0
  const slow = Number(sum && sum.slow) || 0
  const older = sum && sum.older
  if (errors > 0) {
    return {
      tone: "bad",
      title: "Une page a planté aujourd'hui",
      text: "Regarde la ligne « Ça bloque » plus bas. Ce n'est pas forcément une commande perdue, mais un client a peut-être vu une page cassée.",
    }
  }
  if (slow > 0) {
    return {
      tone: "calm",
      title: "Le site marche. Une page a été lente.",
      text: "Rien n'a planté. Quelqu'un a juste attendu un peu plus que d'habitude.",
    }
  }
  if (warns > 0) {
    return {
      tone: "calm",
      title: "Le site marche",
      text: "Quelqu'un a essayé d'entrer sans le droit, ou avec un mauvais mot de passe. Rien n'a été modifié.",
    }
  }
  if (older && Number(older.n) > 1) {
    return {
      tone: "ok",
      title: "Rien de cassé aujourd'hui",
      text: "Une vieille erreur s'est répétée toute seule. Ce n'est pas une commande perdue. Tu peux l'ignorer.",
      href: "/admin/logs/" + older.id,
      link: "Voir en clair",
    }
  }
  return {
    tone: "ok",
    title: "Rien de cassé aujourd'hui",
    text: "Aucune page n'a planté dans les dernières 24 heures.",
  }
}

module.exports = { explain, livePlain, statusOf, whenHuman, times, pageName, pathOf }
