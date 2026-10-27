"use strict"
/**
 * Thèmes créés par l'admin plateforme.
 * Brouillon : visible seulement dans l'admin.
 * Public : page /themes + choix des marchands.
 * La mise en page reste un thème déjà en place. On partage le nom, le texte et les couleurs.
 */
const db = require("./db")
const { isTheme } = require("./themes")

db.exec(`
CREATE TABLE IF NOT EXISTS public_themes (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  name       TEXT NOT NULL,
  blurb      TEXT NOT NULL DEFAULT '',
  base       TEXT NOT NULL,
  bg         TEXT NOT NULL DEFAULT '#FFFFFF',
  accent     TEXT NOT NULL DEFAULT '#111111',
  ink        TEXT NOT NULL DEFAULT '#111111',
  status     TEXT NOT NULL DEFAULT 'brouillon',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
`)

const colsOf = (table) => db.prepare(`PRAGMA table_info(${table})`).all().map((c) => c.name)
const addCol = (table, name, def) => {
  if (!colsOf(table).includes(name)) db.exec(`ALTER TABLE ${table} ADD COLUMN ${name} ${def}`)
}
addCol("stores", "theme_src", "INTEGER")
addCol("stores", "theme_touched", "INTEGER NOT NULL DEFAULT 0")

const hex = (v, fb) => {
  const s = String(v || "").trim()
  if (/^#[0-9a-fA-F]{6}$/.test(s)) return s.toUpperCase()
  return fb
}

const clean = (body = {}) => ({
  name: String(body.name || "").trim().replace(/\s+/g, " ").slice(0, 40),
  blurb: String(body.blurb || "").trim().replace(/\s+/g, " ").slice(0, 180),
  base: isTheme(body.base) ? body.base : "atelier",
  bg: hex(body.bg, "#FFFFFF"),
  accent: hex(body.accent, "#111111"),
  ink: hex(body.ink, "#111111"),
})

const list = () =>
  db.prepare("SELECT * FROM public_themes ORDER BY id DESC").all()

const publicList = () =>
  db.prepare("SELECT * FROM public_themes WHERE status = 'public' ORDER BY id DESC").all()

const get = (id) =>
  db.prepare("SELECT * FROM public_themes WHERE id = ?").get(id)

const create = (body) => {
  const c = clean(body)
  if (!c.name) return { ok: false, error: "Donne un nom au thème." }
  const n = db.prepare("SELECT COUNT(*) AS n FROM public_themes").get().n
  if (n >= 40) return { ok: false, error: "40 thèmes maximum. Retire-en un pour en créer un nouveau." }
  const info = db.prepare(
    "INSERT INTO public_themes (name, blurb, base, bg, accent, ink, status) VALUES (?, ?, ?, ?, ?, ?, 'brouillon')"
  ).run(c.name, c.blurb, c.base, c.bg, c.accent, c.ink)
  return { ok: true, id: Number(info.lastInsertRowid), okText: "Thème créé. Il reste en brouillon tant que tu ne le partages pas." }
}

const update = (id, body) => {
  const row = get(id)
  if (!row) return { ok: false, error: "Ce thème n'existe plus." }
  const c = clean(body)
  if (!c.name) return { ok: false, error: "Donne un nom au thème." }
  db.prepare("UPDATE public_themes SET name = ?, blurb = ?, base = ?, bg = ?, accent = ?, ink = ? WHERE id = ?")
    .run(c.name, c.blurb, c.base, c.bg, c.accent, c.ink, row.id)
  return { ok: true, okText: "Thème enregistré." }
}

const setStatus = (id, status) => {
  const row = get(id)
  if (!row) return { ok: false, error: "Ce thème n'existe plus." }
  const next = status === "public" ? "public" : "brouillon"
  db.prepare("UPDATE public_themes SET status = ? WHERE id = ?").run(next, row.id)
  return {
    ok: true,
    okText: next === "public"
      ? "Thème partagé. Il est sur la page publique, et les marchands peuvent le choisir."
      : "Thème retiré du public. Les boutiques déjà publiées ne changent pas.",
  }
}

const remove = (id) => {
  const row = get(id)
  if (!row) return { ok: false, error: "Ce thème n'existe plus." }
  db.prepare("DELETE FROM public_themes WHERE id = ?").run(row.id)
  db.prepare("UPDATE stores SET theme_src = NULL, theme_touched = 0 WHERE theme_src = ?").run(row.id)
  return { ok: true, okText: "Thème retiré. Les boutiques qui l'avaient déjà publié gardent leur design." }
}

const sameHex = (a, b) => hex(a, "") === hex(b, "")

/** Le marchand a changé les couleurs ou la mise en page : ce n'est plus ce thème. */
const diverged = (themeId, design, row) => {
  if (!row || !isTheme(themeId) || themeId !== row.base) return true
  const d = design || {}
  return !sameHex(d.bg, row.bg) || !sameHex(d.accent, row.accent) || !sameHex(d.ink, row.ink)
}

const parseJson = (raw, fb) => {
  if (!raw) return fb
  try {
    const v = JSON.parse(raw)
    return v && typeof v === "object" ? v : fb
  } catch (_) { return fb }
}

const paint = (place, next) => {
  const design = { ...(place.design || {}) }
  design.bg = next.bg
  design.accent = next.accent
  design.ink = next.ink
  place.design = design
  if (place.theme !== next.base) {
    place.theme = next.base
    const SECTIONS = require("./sections")
    const sections = place.sections && !Array.isArray(place.sections) ? { ...place.sections } : { home: [] }
    sections.home = SECTIONS.defaultSections(next.base)
    place.sections = sections
  }
  return place
}

/**
 * Met à jour les boutiques qui ont encore ce thème, tel quel.
 * Une boutique qui a changé les couleurs ou la mise en page n'est plus ce thème : on n'y touche pas.
 */
const syncFollowers = (prev, next) => {
  if (!prev || !next) return { updated: 0, kept: 0 }
  const rows = db.prepare("SELECT id, theme, design, sections, draft, theme_src, theme_touched FROM stores").all()
  let updated = 0
  let kept = 0
  for (const store of rows) {
    const draft = parseJson(store.draft, null)
    let draftWrite = null
    let live = null
    let followed = false
    let forked = false

    if (draft && Number(draft.publicThemeId) === Number(prev.id)) {
      draft.publicThemeName = next.name
      if (!draft.publicThemeTouched && !diverged(draft.theme, draft.design, prev)) {
        paint(draft, next)
        draft.publicThemeTouched = false
        followed = true
      } else {
        draft.publicThemeTouched = true
        forked = true
      }
      draftWrite = draft
    }

    if (Number(store.theme_src) === Number(prev.id)) {
      if (!Number(store.theme_touched)) {
        const design = parseJson(store.design, {})
        const sections = parseJson(store.sections, {})
        if (!diverged(store.theme, design, prev)) {
          const place = paint({ theme: store.theme, design, sections }, next)
          live = place
          followed = true
        } else {
          live = { touched: true }
          forked = true
        }
      } else forked = true
    }

    if (draftWrite) {
      db.prepare("UPDATE stores SET draft = ? WHERE id = ?").run(JSON.stringify(draftWrite), store.id)
    }
    if (live && live.touched) {
      db.prepare("UPDATE stores SET theme_touched = 1 WHERE id = ?").run(store.id)
    } else if (live) {
      db.prepare("UPDATE stores SET theme = ?, design = ?, sections = ?, theme_touched = 0 WHERE id = ?")
        .run(live.theme, JSON.stringify(live.design), JSON.stringify(live.sections), store.id)
    }
    if (followed) updated++
    else if (forked) kept++
  }
  return { updated, kept }
}

const usage = (id) => {
  const rows = db.prepare("SELECT draft, theme_src, theme_touched FROM stores").all()
  let follow = 0
  let fork = 0
  for (const s of rows) {
    const draft = parseJson(s.draft, null)
    const liveFollow = Number(s.theme_src) === Number(id) && !Number(s.theme_touched)
    const liveFork = Number(s.theme_src) === Number(id) && !!Number(s.theme_touched)
    const draftFollow = draft && Number(draft.publicThemeId) === Number(id) && !draft.publicThemeTouched
    const draftFork = draft && Number(draft.publicThemeId) === Number(id) && !!draft.publicThemeTouched
    if (liveFollow || draftFollow) follow++
    else if (liveFork || draftFork) fork++
  }
  return { follow, fork }
}

const noteTouch = (draft) => {
  if (!draft || !draft.publicThemeId || draft.publicThemeTouched) return draft
  const row = get(draft.publicThemeId)
  if (!row || diverged(draft.theme, draft.design, row)) draft.publicThemeTouched = true
  return draft
}

/* Thèmes déjà en ligne (ceux du code). L'admin peut en changer le nom, le texte et les couleurs. */
const COLOR_DEFAULTS = { bg: "#FFFFFF", accent: "#111111", ink: "#111111" }
const BASE_COLORS = {
  electro: { bg: "#FFFFFF", accent: "#14532D", ink: "#111111" },
  noir: { bg: "#0D0D0F", accent: "#111111", ink: "#F2F2F2" },
  contrast: { bg: "#0E0E0E", accent: "#111111", ink: "#E4E4E7" },
}

db.exec(`
CREATE TABLE IF NOT EXISTS theme_edits (
  theme_id TEXT PRIMARY KEY,
  name     TEXT NOT NULL DEFAULT '',
  blurb    TEXT NOT NULL DEFAULT '',
  bg       TEXT NOT NULL DEFAULT '#FFFFFF',
  accent   TEXT NOT NULL DEFAULT '#111111',
  ink      TEXT NOT NULL DEFAULT '#111111',
  layout   TEXT NOT NULL DEFAULT ''
);
`)
addCol("theme_edits", "layout", "TEXT NOT NULL DEFAULT ''")

const editOf = (id) => id
  ? db.prepare("SELECT * FROM theme_edits WHERE theme_id = ?").get(id)
  : null

const editMap = () => {
  const out = {}
  for (const row of db.prepare("SELECT * FROM theme_edits").all()) out[row.theme_id] = row
  return out
}

const baseColors = (id) => BASE_COLORS[id] || COLOR_DEFAULTS

/** Couleurs réelles de chaque thème, pour le formulaire. Pas le blanc/noir générique. */
const PALETTE = {
  atelier: { bg: "#FFFFFF", accent: "#141414", ink: "#141414" },
  electro: { bg: "#F6F1E8", accent: "#14532D", ink: "#1A1A1A" },
  bureau: { bg: "#F4F1EA", accent: "#1B1B1B", ink: "#1B1B1B" },
  audio: { bg: "#FFFFFF", accent: "#101010", ink: "#101010" },
  soin: { bg: "#F3EDE6", accent: "#3A231F", ink: "#3A231F" },
  mode: { bg: "#F2F0EB", accent: "#8A7A63", ink: "#171717" },
  minimal: { bg: "#FFFFFF", accent: "#111111", ink: "#111111" },
  editorial: { bg: "#FFFFFF", accent: "#111111", ink: "#111111" },
  contrast: { bg: "#111111", accent: "#FFFFFF", ink: "#FFFFFF" },
  mono: { bg: "#FFFFFF", accent: "#0A0A0A", ink: "#0A0A0A" },
  galerie: { bg: "#FAF9F7", accent: "#1A1A1A", ink: "#1A1A1A" },
  bento: { bg: "#F6F6F4", accent: "#141414", ink: "#141414" },
  zen: { bg: "#FCFCFB", accent: "#1C1C1C", ink: "#1C1C1C" },
  cod: { bg: "#FFFFFF", accent: "#111111", ink: "#111111" },
  tech: { bg: "#FFFFFF", accent: "#0B63CE", ink: "#111111" },
  marche: { bg: "#FFFFFF", accent: "#E5491B", ink: "#111111" },
  catalogue: { bg: "#FFFFFF", accent: "#52525B", ink: "#111111" },
  mosaique: { bg: "#F6F6F4", accent: "#141414", ink: "#141414" },
  noir: { bg: "#0D0D0F", accent: "#F5F5F5", ink: "#F5F5F5" },
}

const paletteOf = (theme) => PALETTE[theme && theme.id] || baseColors(theme && theme.id)

const colorSet = (raw) => ({
  bg: hex(raw && raw.bg, COLOR_DEFAULTS.bg),
  accent: hex(raw && raw.accent, COLOR_DEFAULTS.accent),
  ink: hex(raw && raw.ink, COLOR_DEFAULTS.ink),
})

const sameSet = (a, b) => a && b && sameHex(a.bg, b.bg) && sameHex(a.accent, b.accent) && sameHex(a.ink, b.ink)

/** Pas de couleur choisie, ou encore les couleurs de ce thème : la boutique suit. */
const followsBuiltin = (raw, themeId, prev) => {
  if (!raw || (raw.bg == null && raw.accent == null && raw.ink == null)) return true
  const cur = colorSet(raw)
  if (sameSet(cur, COLOR_DEFAULTS)) return true
  if (prev && sameSet(cur, prev)) return true
  if (!prev && sameSet(cur, baseColors(themeId))) return true
  return false
}

const present = (list) => {
  const edits = editMap()
  return (list || []).map((t) => {
    const e = edits[t.id]
    if (!e) return t
    return {
      ...t,
      name: e.name || t.name,
      desc: e.blurb || t.desc,
      dots: [e.bg, e.accent, e.ink],
    }
  })
}

const paintColors = (design, next) => ({ ...(design || {}), bg: next.bg, accent: next.accent, ink: next.ink })

const syncBuiltin = (id, prev, next) => {
  const rows = db.prepare("SELECT id, theme, design, draft, theme_src FROM stores").all()
  let updated = 0
  let kept = 0
  for (const store of rows) {
    let followed = false
    let forked = false
    if (store.theme === id && !store.theme_src) {
      const design = parseJson(store.design, {})
      const raw = store.design ? design : null
      if (followsBuiltin(raw, id, prev)) {
        db.prepare("UPDATE stores SET design = ? WHERE id = ?").run(JSON.stringify(paintColors(design, next)), store.id)
        followed = true
      } else forked = true
    }
    const draft = parseJson(store.draft, null)
    if (draft && draft.theme === id && !draft.publicThemeId && !draft.publicThemeTouched) {
      if (followsBuiltin(draft.design, id, prev)) {
        draft.design = paintColors(draft.design, next)
        db.prepare("UPDATE stores SET draft = ? WHERE id = ?").run(JSON.stringify(draft), store.id)
        followed = true
      } else if (draft.design && !followsBuiltin(draft.design, id, prev)) forked = true
    }
    if (followed) updated++
    else if (forked) kept++
  }
  return { updated, kept }
}

const builtinUsage = (id) => {
  const row = editOf(id)
  const prev = row ? { bg: row.bg, accent: row.accent, ink: row.ink } : null
  const rows = db.prepare("SELECT theme, design, theme_src FROM stores").all()
  let follow = 0
  let fork = 0
  for (const s of rows) {
    if (s.theme !== id || s.theme_src) continue
    const raw = s.design ? parseJson(s.design, {}) : null
    if (followsBuiltin(raw, id, prev)) follow++
    else fork++
  }
  return { follow, fork }
}

const platformList = (themes) => {
  const edits = editMap()
  const counts = {}
  for (const s of db.prepare("SELECT theme, theme_src FROM stores").all()) {
    if (!s.theme || s.theme_src) continue
    counts[s.theme] = (counts[s.theme] || 0) + 1
  }
  const ready = ["atelier", "electro", "bureau", "audio", "soin", "mode"]
  const ordered = [
    ...themes.filter((t) => ready.includes(t.id)),
    ...themes.filter((t) => !ready.includes(t.id)),
  ]
  return ordered.map((t) => {
    const e = edits[t.id]
    const changed = e && !sameSet(e, paletteOf(t))
    return {
      id: t.id,
      name: (e && e.name) || t.name,
      blurb: (e && e.blurb) || t.desc,
      dots: changed ? [e.bg, e.accent, e.ink] : (t.dots || ["#FFFFFF", "#111111", "#111111"]),
      shops: counts[t.id] || 0,
    }
  })
}

const builtinForm = (id, theme) => {
  const e = editOf(id)
  const colors = e || paletteOf(theme)
  const layout = e && e.layout && isTheme(e.layout) ? e.layout : id
  return {
    id,
    name: (e && e.name) || theme.name,
    blurb: (e && e.blurb) || theme.desc,
    bg: colors.bg,
    accent: colors.accent,
    ink: colors.ink,
    layout,
  }
}

const shopPhrase = (n, one, many) => (Number(n) === 1 ? `1 boutique ${one}` : `${Number(n) || 0} boutiques ${many}`)

const saveBuiltin = (id, body, theme) => {
  if (!theme || !isTheme(id)) return { ok: false, error: "Ce thème n'existe pas." }
  const prevRow = editOf(id)
  const c = clean({ ...body, name: body.name || theme.name, base: body.base || id })
  if (!c.name) return { ok: false, error: "Donne un nom au thème." }
  const layout = isTheme(body.base) ? body.base : id
  const startColors = prevRow ? { bg: prevRow.bg, accent: prevRow.accent, ink: prevRow.ink } : paletteOf(theme)
  const colorsChanged = !sameSet(c, startColors)
  const prevLayout = prevRow && prevRow.layout && isTheme(prevRow.layout) ? prevRow.layout : id
  const layoutChanged = layout !== prevLayout
  db.prepare(`INSERT INTO theme_edits (theme_id, name, blurb, bg, accent, ink, layout) VALUES (?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(theme_id) DO UPDATE SET
      name = excluded.name, blurb = excluded.blurb, bg = excluded.bg,
      accent = excluded.accent, ink = excluded.ink, layout = excluded.layout`)
    .run(id, c.name, c.blurb || theme.desc, c.bg, c.accent, c.ink, layout)
  const prev = prevRow ? { bg: prevRow.bg, accent: prevRow.accent, ink: prevRow.ink } : null
  if (colorsChanged) syncBuiltin(id, prev, { bg: c.bg, accent: c.accent, ink: c.ink })
  const u = builtinUsage(id)
  const moved = colorsChanged || layoutChanged
  const okText = !moved
    ? "Thème enregistré."
    : u.fork
      ? `Thème enregistré. ${shopPhrase(u.follow, "a encore ce thème, elle reçoit le changement.", "ont encore ce thème, elles reçoivent le changement.")} ${shopPhrase(u.fork, "a changé les couleurs : elle ne bouge pas.", "ont changé les couleurs : elles ne bougent pas.")}`
      : u.follow
        ? `Thème enregistré. ${shopPhrase(u.follow, "a encore ce thème, elle reçoit le changement.", "ont encore ce thème, elles reçoivent le changement.")}`
        : "Thème enregistré. Aucune boutique ne l'a publié tel quel."
  return { ok: true, okText }
}

/** Applique la mise en page et les couleurs choisies par l'admin, sans toucher une boutique qui a changé les siennes. */
const dressStore = (store) => {
  if (!store || store.theme_src) return store
  const origin = store._originTheme || store.theme
  if (!origin) return store
  const edit = editOf(origin)
  if (!edit) return store
  let raw = null
  if (store.design) {
    try { raw = JSON.parse(store.design) } catch { raw = null }
  }
  const prev = { bg: edit.bg, accent: edit.accent, ink: edit.ink }
  if (!followsBuiltin(raw, origin, prev)) return { ...store, _originTheme: origin }
  const theme = require("./themes").THEMES.find((t) => t.id === origin)
  const layout = edit.layout && isTheme(edit.layout) ? edit.layout : origin
  const colorsChanged = theme && !sameSet(prev, paletteOf(theme))
  if (layout === origin && !colorsChanged) return { ...store, _originTheme: origin }
  const design = { ...(raw || {}) }
  if (colorsChanged) {
    design.bg = edit.bg
    design.accent = edit.accent
    design.ink = edit.ink
  }
  return { ...store, _originTheme: origin, theme: layout, design: JSON.stringify(design) }
}

module.exports = {
  list, publicList, get, create, update, setStatus, remove, syncFollowers, usage, noteTouch, diverged,
  editOf, present, followsBuiltin, platformList, builtinForm, builtinUsage, saveBuiltin, dressStore,
}
