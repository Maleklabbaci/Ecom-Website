"use strict"
/**
 * Base de données de la plateforme (SQLite — un simple fichier, aucun serveur à installer).
 * Tables : users, stores, products, orders, order_items
 */
const path = require("path")
const fs = require("fs")
const SQLITE = require("./sqlite")

const DATA_DIR = path.join(__dirname, "..", "data")
fs.mkdirSync(DATA_DIR, { recursive: true })

const db = SQLITE.open(process.env.NOVADZ_DB || path.join(DATA_DIR, "novadz.db"))

db.exec(`
CREATE TABLE IF NOT EXISTS users (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  email         TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  name          TEXT NOT NULL,
  role          TEXT NOT NULL DEFAULT 'merchant',
  created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS stores (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  owner_id     INTEGER NOT NULL REFERENCES users(id),
  slug         TEXT UNIQUE NOT NULL,
  name         TEXT NOT NULL,
  tagline      TEXT DEFAULT '',
  about        TEXT DEFAULT '',
  currency     TEXT DEFAULT 'DZD',
  phone        TEXT DEFAULT '',
  wilaya       TEXT DEFAULT '',
  plan         TEXT DEFAULT 'gratuit',
  theme        TEXT DEFAULT 'minimal',
  sections     TEXT,
  nav          TEXT,
  legal_name   TEXT,
  legal_address TEXT,
  legal_rc     TEXT,
  legal_nif    TEXT,
  return_days  INTEGER DEFAULT 7,
  pixel_meta   TEXT,
  pixel_tiktok TEXT,
  design       TEXT,
  logo         TEXT,
  status       TEXT DEFAULT 'active',
  created_at   TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS products (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  store_id    INTEGER NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  title       TEXT NOT NULL,
  description TEXT DEFAULT '',
  price_cents INTEGER NOT NULL DEFAULT 0,
  category_id INTEGER,
  image       TEXT,
  focal       TEXT DEFAULT 'center',
  stock       INTEGER NOT NULL DEFAULT 0,
  active      INTEGER NOT NULL DEFAULT 1,
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS orders (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  store_id       INTEGER NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  ref            TEXT NOT NULL,
  customer_name  TEXT NOT NULL,
  phone          TEXT NOT NULL,
  address        TEXT NOT NULL,
  wilaya         TEXT DEFAULT '',
  note           TEXT DEFAULT '',
  subtotal_cents INTEGER NOT NULL DEFAULT 0,
  shipping_cents INTEGER NOT NULL DEFAULT 0,
  total_cents    INTEGER NOT NULL DEFAULT 0,
  status         TEXT NOT NULL DEFAULT 'nouvelle',
  created_at     TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS pages (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  store_id   INTEGER NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  slug       TEXT NOT NULL,
  title      TEXT NOT NULL,
  body       TEXT DEFAULT '',
  published  INTEGER DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(store_id, slug)
);

CREATE TABLE IF NOT EXISTS discounts (
  id                  INTEGER PRIMARY KEY AUTOINCREMENT,
  store_id            INTEGER NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  code                TEXT NOT NULL,
  kind                TEXT NOT NULL DEFAULT 'percent',
  value               INTEGER NOT NULL DEFAULT 0,
  min_subtotal_cents  INTEGER NOT NULL DEFAULT 0,
  active              INTEGER NOT NULL DEFAULT 1,
  uses                INTEGER NOT NULL DEFAULT 0,
  max_uses            INTEGER NOT NULL DEFAULT 0,
  created_at          TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(store_id, code)
);

CREATE TABLE IF NOT EXISTS categories (
  id       INTEGER PRIMARY KEY AUTOINCREMENT,
  store_id INTEGER NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  name     TEXT NOT NULL,
  slug     TEXT NOT NULL,
  position INTEGER DEFAULT 0,
  UNIQUE(store_id, slug)
);

CREATE TABLE IF NOT EXISTS product_images (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  url        TEXT NOT NULL,
  position   INTEGER DEFAULT 0
);

CREATE TABLE IF NOT EXISTS variants (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  product_id  INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  label       TEXT NOT NULL,
  price_cents INTEGER,
  stock       INTEGER NOT NULL DEFAULT 0,
  position    INTEGER DEFAULT 0
);

CREATE TABLE IF NOT EXISTS customers (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  store_id      INTEGER NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  email         TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  name          TEXT NOT NULL,
  phone         TEXT DEFAULT '',
  created_at    TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(store_id, email)
);

CREATE TABLE IF NOT EXISTS reviews (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  store_id   INTEGER NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  name       TEXT NOT NULL,
  rating     INTEGER NOT NULL DEFAULT 5,
  body       TEXT DEFAULT '',
  approved   INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS shipping_rates (
  id       INTEGER PRIMARY KEY AUTOINCREMENT,
  store_id INTEGER NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  wilaya   TEXT NOT NULL,
  cents    INTEGER NOT NULL DEFAULT 50000,
  UNIQUE(store_id, wilaya)
);

CREATE TABLE IF NOT EXISTS versions (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  store_id   INTEGER NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  kind       TEXT NOT NULL DEFAULT 'publish',
  payload    TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS logs (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  level      TEXT NOT NULL DEFAULT 'info',
  message    TEXT NOT NULL,
  meta       TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS visits (
  id       INTEGER PRIMARY KEY AUTOINCREMENT,
  store_id INTEGER NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  day      TEXT NOT NULL,
  path     TEXT DEFAULT '',
  hits     INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS order_items (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  order_id    INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  product_id  INTEGER,
  title       TEXT NOT NULL,
  price_cents INTEGER NOT NULL,
  qty         INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_products_store ON products(store_id);
CREATE INDEX IF NOT EXISTS idx_orders_store   ON orders(store_id);
`)

/* --- migrations légères : ajoute les colonnes manquantes --- */
const cols = (table) => db.prepare(`PRAGMA table_info(${table})`).all().map((c) => c.name)
if (!cols("stores").includes("theme")) {
  db.exec("ALTER TABLE stores ADD COLUMN theme TEXT DEFAULT 'minimal'")
}
if (!cols("stores").includes("sections")) {
  db.exec("ALTER TABLE stores ADD COLUMN sections TEXT")
}
if (!cols("stores").includes("design")) {
  db.exec("ALTER TABLE stores ADD COLUMN design TEXT")
}
if (!cols("stores").includes("logo")) {
  db.exec("ALTER TABLE stores ADD COLUMN logo TEXT")
}
if (!cols("stores").includes("nav")) {
  db.exec("ALTER TABLE stores ADD COLUMN nav TEXT")
}
if (!cols("orders").includes("discount_cents")) {
  db.exec("ALTER TABLE orders ADD COLUMN discount_cents INTEGER NOT NULL DEFAULT 0")
}
if (!cols("orders").includes("promo_code")) {
  db.exec("ALTER TABLE orders ADD COLUMN promo_code TEXT DEFAULT ''")
}
const addCol = (table, name, def) => {
  if (!cols(table).includes(name)) db.exec(`ALTER TABLE ${table} ADD COLUMN ${name} ${def}`)
}
addCol("stores", "legal_name", "TEXT")
addCol("stores", "legal_address", "TEXT")
addCol("stores", "legal_rc", "TEXT")
addCol("stores", "legal_nif", "TEXT")
addCol("stores", "return_days", "INTEGER DEFAULT 7")
addCol("stores", "pixel_meta", "TEXT")
addCol("stores", "pixel_tiktok", "TEXT")
addCol("products", "category_id", "INTEGER")
addCol("products", "focal", "TEXT DEFAULT 'center'")
addCol("orders", "customer_id", "INTEGER")
addCol("orders", "refunded_cents", "INTEGER NOT NULL DEFAULT 0")
/* bureau de retrait choisi par le client (rempli au checkout) : l'API de chaque
   transporteur a besoin de son identifiant propre, pas seulement de son nom. */
addCol("orders", "desk_id", "TEXT DEFAULT ''")
addCol("orders", "desk_name", "TEXT DEFAULT ''")
addCol("orders", "desk_commune", "TEXT DEFAULT ''")
addCol("discounts", "product_id", "INTEGER")
addCol("stores", "whatsapp", "TEXT")
addCol("stores", "draft", "TEXT")
addCol("stores", "published_at", "TEXT")
/* prix barre (prix conseille / avant promo) - 0 = pas de promo affichee */
addCol("products", "compare_cents", "INTEGER NOT NULL DEFAULT 0")
/* pack "souvent achetes ensemble" : ids de produits separes par des virgules */
addCol("products", "bundle_ids", "TEXT DEFAULT ''")
/* titres de variante + leurs options (JSON : [{ name: "Taille", options: ["S","M"] }]) */
addCol("products", "option_groups", "TEXT DEFAULT ''")
/* formulaire de commande personnalise par le marchand (JSON) */
addCol("stores", "form_fields", "TEXT")
addCol("stores", "form_look", "TEXT")
addCol("stores", "site_kind", "TEXT DEFAULT ''")
/* reponses aux champs ajoutes par le marchand (JSON, cle = libelle) */
addCol("orders", "form", "TEXT")

/* ---- suivi des commandes (lot 40) : relances, test, attribution pub ---- */
/* nombre d'appels restés sans réponse (3 = injoignable) */
addCol("orders", "attempts", "INTEGER NOT NULL DEFAULT 0")
addCol("orders", "last_attempt_at", "TEXT")
/* commande de test : jamais comptée dans le chiffre d'affaires ni les statistiques */
addCol("orders", "fake", "INTEGER NOT NULL DEFAULT 0")
/* d'où vient la commande : facebook, instagram, tiktok, google, snapchat, whatsapp, referral, direct */
addCol("orders", "source", "TEXT DEFAULT ''")
addCol("orders", "utm_source", "TEXT DEFAULT ''")
addCol("orders", "utm_medium", "TEXT DEFAULT ''")
addCol("orders", "utm_campaign", "TEXT DEFAULT ''")
addCol("orders", "utm_content", "TEXT DEFAULT ''")
addCol("orders", "utm_term", "TEXT DEFAULT ''")
/* identifiant de clic publicitaire : fbclid, ttclid, gclid, sc_click_id... */
addCol("orders", "click_id", "TEXT DEFAULT ''")
addCol("orders", "click_kind", "TEXT DEFAULT ''")
addCol("orders", "landing", "TEXT DEFAULT ''")
addCol("orders", "referrer", "TEXT DEFAULT ''")
addCol("orders", "device", "TEXT DEFAULT ''")

/* historique : chaque action posée sur une commande (statut, appel, whatsapp, test) */
db.exec(`
CREATE TABLE IF NOT EXISTS order_events (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  store_id   INTEGER NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  order_id   INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  kind       TEXT NOT NULL DEFAULT 'note',
  label      TEXT NOT NULL DEFAULT '',
  detail     TEXT DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_events_order ON order_events(order_id, id DESC);
`)

/* provenance inconnue : rangée en organique (une seule fois) */
try {
  db.exec("UPDATE orders SET source = 'organic' WHERE source IS NULL OR source IN ('', 'direct', 'referral')")
} catch (e) { /* table pas encore prête */ }

/* statuts historiques accentués -> identifiants stables (sans accent) */
for (const [from, to] of [["confirmée", "confirmee"], ["annulée", "annulee"], ["expédiée", "expediee"],
  ["livrée", "livree"], ["remboursée", "remboursee"], ["reportée", "reportee"],
  ["injoignable", "injoignable"], ["à vérifier", "a_verifier"]]) {
  if (from !== to) db.prepare("UPDATE orders SET status = ? WHERE status = ?").run(to, from)
}


if (!cols("products").includes("image")) {
  db.exec("ALTER TABLE products ADD COLUMN image TEXT")
}

addCol("stores", "domain", "TEXT")
addCol("stores", "mail_from", "TEXT")
addCol("stores", "mail_name", "TEXT")
addCol("stores", "mail_on", "TEXT")
addCol("stores", "smtp_host", "TEXT")
addCol("stores", "smtp_port", "INTEGER")
addCol("stores", "smtp_user", "TEXT")
addCol("stores", "smtp_pass", "TEXT")
addCol("orders", "customer_email", "TEXT")
addCol("users", "login_name", "TEXT")
addCol("users", "blocked", "INTEGER NOT NULL DEFAULT 0")

db.exec(`
CREATE TABLE IF NOT EXISTS store_members (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  store_id   INTEGER NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  user_id    INTEGER,
  email      TEXT NOT NULL,
  name       TEXT DEFAULT '',
  perms      TEXT NOT NULL DEFAULT '[]',
  token      TEXT,
  status     TEXT NOT NULL DEFAULT 'invite',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_members_store_email ON store_members(store_id, email);
CREATE TABLE IF NOT EXISTS mail_outbox (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  store_id   INTEGER NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  kind       TEXT NOT NULL DEFAULT 'note',
  to_email   TEXT NOT NULL,
  subject    TEXT NOT NULL,
  body       TEXT NOT NULL,
  status     TEXT NOT NULL DEFAULT 'attente',
  error      TEXT DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_mail_store ON mail_outbox(store_id, id DESC);
CREATE TABLE IF NOT EXISTS leads (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  store_id   INTEGER NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  name       TEXT NOT NULL,
  phone      TEXT DEFAULT '',
  email      TEXT DEFAULT '',
  message    TEXT NOT NULL DEFAULT '',
  page       TEXT DEFAULT '',
  read_at    TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_leads_store ON leads(store_id, id DESC);
`)
addCol("store_members", "login_name", "TEXT")
try {
  db.exec("CREATE UNIQUE INDEX IF NOT EXISTS idx_stores_domain ON stores(domain) WHERE domain IS NOT NULL AND domain != ''")
} catch (_) { /* domaines déjà en double : on ne bloque pas le démarrage */ }
try {
  db.exec("CREATE UNIQUE INDEX IF NOT EXISTS idx_users_login_name ON users(login_name) WHERE login_name IS NOT NULL AND login_name != ''")
} catch (_) { /* identifiants déjà en double : on ne bloque pas le démarrage */ }

module.exports = db
