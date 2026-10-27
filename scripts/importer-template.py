#!/usr/bin/env python3
"""Importe un site (page HTML, dossier ou .zip) comme template NovaDZ, modifiable dans le studio.

  python3 scripts/importer-template.py <source> --name "Mon site" [--niche ".."] [--line ".."] [--kind boutique|vitrine] [--id siteN] [--no-shot]

Ce que ça règle :
  - plusieurs pages  : chaque .html devient une page du template ; les liens entre pages sont reliés
  - images externes  : tout (img, css, polices, scripts, fonds) est téléchargé ou copié dans public/templates/<id>/
  - JavaScript       : les scripts sont sortis en fichiers (/templates/<id>/js/), les onclick="..." sont convertis ;
                       ils tournent sur la vitrine, jamais dans l'éditeur, et jamais ceux d'un marchand
  - sites énormes    : base64 sortis en fichiers, gros <style> sortis en .css
Après l'import : redémarre le serveur si la galerie doit afficher le nouveau template."""
import argparse, base64, hashlib, html as H, json, mimetypes, os, re, shutil, sys, tempfile, urllib.parse, urllib.request, zipfile

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..")
UA = "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36"
EXT = {"image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "image/gif": "gif", "image/svg+xml": "svg", "image/avif": "avif",
       "image/x-icon": "ico", "image/vnd.microsoft.icon": "ico", "font/woff2": "woff2", "font/woff": "woff", "font/ttf": "ttf", "font/otf": "otf",
       "application/font-woff2": "woff2", "application/font-woff": "woff", "video/mp4": "mp4", "video/webm": "webm", "audio/mpeg": "mp3"}
EVENTS = "click|dblclick|change|input|submit|mouseover|mouseout|mouseenter|mouseleave|keyup|keydown|keypress|focus|blur|touchstart|touchend"

class Importer:
    def __init__(self, pub, tid, root):
        self.pub, self.tid, self.root = pub, tid, root
        self.dir = os.path.join(pub, "templates", tid)
        self.cache, self.fail, self.stats = {}, [], {"assets": 0, "scripts": 0, "handlers": 0, "styles": 0}
        self.h = 0  # compteur data-ndz-h

    # ---------- récupération d'un fichier (réseau ou disque) ----------
    def fetch(self, ref, base):
        ref = H.unescape(ref.strip())
        if not ref or re.match(r"^(data:|mailto:|tel:|javascript:|blob:|#|about:)", ref, re.I): return None
        key = self.resolve(ref, base)
        if key in self.cache: return self.cache[key]
        out = None
        try:
            if re.match(r"^https?://", key):
                req = urllib.request.Request(key, headers={"User-Agent": UA})
                with urllib.request.urlopen(req, timeout=25) as r:
                    out = (r.read(), r.headers.get_content_type() or "", key)
            elif os.path.isfile(key):
                out = (open(key, "rb").read(), mimetypes.guess_type(key)[0] or "", key)
        except Exception as e:
            self.fail.append(f"{key} ({str(e)[:60]})")
        self.cache[key] = out
        return out

    def resolve(self, ref, base):
        if ref.startswith("//"): ref = "https:" + ref
        if re.match(r"^https?://", ref): return ref
        if re.match(r"^https?://", base or ""): return urllib.parse.urljoin(base, ref)
        path = urllib.parse.unquote(ref.split("#")[0].split("?")[0])
        full = os.path.join(self.root, path.lstrip("/")) if path.startswith("/") else os.path.join(base, path)
        return os.path.normpath(full)

    @staticmethod
    def bdir(key):
        return key if re.match(r"^https?://", key) else os.path.dirname(key)

    def store(self, data, ctype, url, sub, force_ext=None):
        ext = force_ext or EXT.get(ctype) or os.path.splitext(urllib.parse.urlparse(url).path)[1].lstrip(".").lower()[:5] or "bin"
        if not re.match(r"^[a-z0-9]+$", ext): ext = "bin"
        name = hashlib.sha1(data).hexdigest()[:12] + "." + ext
        d = os.path.join(self.dir, sub); os.makedirs(d, exist_ok=True)
        p = os.path.join(d, name)
        if not os.path.exists(p): open(p, "wb").write(data); self.stats["assets"] += 1
        return f"/templates/{self.tid}/{sub}/{name}"

    def asset(self, ref, base):
        r = self.fetch(ref, base)
        return self.store(*r, "a") if r else None

    # ---------- CSS : url(...) et @import vers des fichiers locaux ----------
    def css(self, text, base):
        def u(m):
            q, ref = m.group(1) or "", m.group(2)
            if ref.startswith("data:"): return self.data_uri(m.group(0), ref)
            new = self.asset(ref, base)
            return f"url({q}{new}{q})" if new else m.group(0)
        text = re.sub(r"url\(\s*(['\"]?)([^'\")]+)\1\s*\)", lambda m: u(m) if m.group(2).strip() else m.group(0), text)
        def imp(m):
            ref = m.group(2) or m.group(3)
            r = self.fetch(ref, base)
            if not r: return m.group(0)
            return f'@import url("{self.css_file(r[0].decode("utf-8", "ignore"), self.bdir(r[2]))}");'
        return re.sub(r"@import\s+(?:url\(\s*(['\"]?)([^'\")]+)\1\s*\)|['\"]([^'\"]+)['\"])[^;]*;", imp, text)

    def css_file(self, text, base):
        text = self.css(text, base)
        h = hashlib.sha1(text.encode()).hexdigest()[:12]
        d = os.path.join(self.dir, "c"); os.makedirs(d, exist_ok=True)
        open(os.path.join(d, h + ".css"), "w", encoding="utf-8").write(text); self.stats["styles"] += 1
        return f"/templates/{self.tid}/c/{h}.css"

    def data_uri(self, whole, ref):
        m = re.match(r"data:([\w/+.-]+);base64,(.+)$", ref, re.S)
        if not m or len(m.group(2)) < 3000: return whole
        try: raw = base64.b64decode(m.group(2) + "=" * (-len(m.group(2)) % 4))
        except Exception: return whole
        new = self.store(raw, m.group(1).lower(), "x." + EXT.get(m.group(1).lower(), "bin"), "a")
        return whole.replace(ref, new)

    def js_file(self, code, module=False):
        h = hashlib.sha1(code.encode()).hexdigest()[:12]
        d = os.path.join(self.dir, "js"); os.makedirs(d, exist_ok=True)
        ext = "mjs" if module else "js"
        open(os.path.join(d, f"{h}.{ext}"), "w", encoding="utf-8").write(code); self.stats["scripts"] += 1
        return f"/templates/{self.tid}/js/{h}.{ext}"

    # ---------- une page ----------
    def page(self, src, base, route):
        s = src
        s = re.sub(r"<base\b[^>]*>", "", s, flags=re.I)
        s = re.sub(r"\s(?:integrity|crossorigin|nonce)\s*=\s*(\"[^\"]*\"|'[^']*'|[^\s>]+)", "", s, flags=re.I)
        # scripts
        def script(m):
            attrs, body = m.group(1), m.group(2)
            typ = (re.search(r"\btype\s*=\s*[\"']?([^\"'\s>]+)", attrs, re.I) or [None, ""])[1].lower()
            if typ and typ not in ("text/javascript", "application/javascript", "module"): return ""  # ld+json, templates…
            mod = typ == "module"
            sm = re.search(r"\bsrc\s*=\s*(?:\"([^\"]*)\"|'([^']*)')", attrs, re.I)
            if sm:
                r = self.fetch(sm.group(1) or sm.group(2), base)
                if not r: return ""
                code = r[0].decode("utf-8", "ignore")
            else:
                code = body
            if not code.strip(): return ""
            return f'<script {"type=\"module\" " if mod else ""}defer src="{self.js_file(code, mod)}"></script>'
        s = re.sub(r"<script\b([^>]*)>([\s\S]*?)</script\s*>", script, s, flags=re.I)
        # gros blocs <style> : en fichiers ; les petits restent (l'éditeur peut alors changer couleurs/polices partout)
        def style(m):
            css = self.css(m.group(2), base)
            # @import dans un <style> serait retiré à l'enregistrement : on le transforme en <link>
            imports = re.findall(r'@import\s+url\("([^"]+)"\);', css)
            css = re.sub(r'@import\s+url\("[^"]+"\);', "", css)
            links = "".join(f'<link rel="stylesheet" href="{u}">' for u in imports)
            if len(css) > 20000 and len(src) > 1_200_000:
                return links + f'<link rel="stylesheet" href="{self.css_file(css, base)}">'
            return links + f"<style{m.group(1)}>{css}</style>"
        s = re.sub(r"<style\b([^>]*)>([\s\S]*?)</style\s*>", style, s, flags=re.I)
        # feuilles liées
        def link(m):
            tag = m.group(0)
            href = re.search(r"\bhref\s*=\s*(?:\"([^\"]*)\"|'([^']*)')", tag, re.I)
            if not href: return tag
            ref = href.group(1) or href.group(2)
            rel = (re.search(r"\brel\s*=\s*[\"']?([^\"'>]+)", tag, re.I) or [None, ""])[1].lower()
            if "stylesheet" in rel:
                r = self.fetch(ref, base)
                if not r: return tag
                return re.sub(r"\bhref\s*=\s*(\"[^\"]*\"|'[^']*')", f'href="{self.css_file(r[0].decode("utf-8", "ignore"), self.bdir(r[2]))}"', tag, count=1, flags=re.I)
            if re.search(r"icon|preload|apple-touch|manifest", rel):
                new = self.asset(ref, base)
                return re.sub(r"\bhref\s*=\s*(\"[^\"]*\"|'[^']*')", f'href="{new}"', tag, count=1, flags=re.I) if new else tag
            return tag
        s = re.sub(r"<link\b[^>]*>", link, s, flags=re.I)
        # images, sources, vidéos, fonds
        def attr_asset(m):
            name, q, val = m.group(1), m.group(2), m.group(3)
            if name.lower() in ("srcset", "data-srcset"):
                parts = []
                for part in val.split(","):
                    bits = part.strip().split()
                    if not bits: continue
                    new = self.asset(bits[0], base) if not bits[0].startswith("data:") else None
                    parts.append(" ".join([new or bits[0]] + bits[1:]))
                return f'{name}={q}{", ".join(parts)}{q}'
            if val.startswith("data:"): return self.data_uri(m.group(0), val)
            new = self.asset(val, base)
            return f"{name}={q}{new}{q}" if new else m.group(0)
        s = re.sub(r"\b(src|srcset|data-src|data-srcset|poster|data-bg|background)\s*=\s*([\"'])([^\"']*)\2", lambda m: attr_asset(m) if not re.match(r"<", m.group(3)) else m.group(0), s, flags=re.I)
        s = re.sub(r"(\bstyle\s*=\s*)([\"'])([\s\S]*?)\2", lambda m: f"{m.group(1)}{m.group(2)}{self.css(m.group(3), base)}{m.group(2)}", s, flags=re.I)
        return s

    # ---------- onclick="..." -> fichier JS (les attributs on* sont retirés par le nettoyage à l'enregistrement) ----------
    def handlers(self, s):
        code = []
        def tag(m):
            t = m.group(0)
            found = []
            def grab(a):
                ev, val = a.group(1).lower(), H.unescape(a.group(3))
                found.append((ev, val)); return ""
            t2 = re.sub(r"\s+on(" + EVENTS + r")\s*=\s*(\"|')([\s\S]*?)\2", grab, t, flags=re.I)
            jm = re.search(r"\bhref\s*=\s*([\"'])\s*javascript:([\s\S]*?)\1", t2, re.I)
            if jm and t2.lower().startswith("<a"):
                found.append(("click", "event.preventDefault();" + H.unescape(jm.group(2)))); t2 = t2.replace(jm.group(0), 'href="#"')
            if not found: return t
            self.h += 1
            for ev, val in found:
                code.append(f'(function(){{var el=document.querySelector(\'[data-ndz-h="{self.h}"]\');if(!el)return;el.addEventListener("{ev}",function(event){{{val}\n}});}})();')
                self.stats["handlers"] += 1
            return re.sub(r"^<([a-zA-Z][\w:-]*)", rf'<\1 data-ndz-h="{self.h}"', t2, count=1)
        s = re.sub(r"<[a-zA-Z][^<>]*?\s(?:on(?:" + EVENTS + r")\s*=|href\s*=\s*[\"']\s*javascript:)[^<>]*>", tag, s, flags=re.I)
        if code:
            s = re.sub(r"</body\s*>", f'<script defer src="{self.js_file(chr(10).join(code))}"></script></body>', s, count=1, flags=re.I) if re.search(r"</body", s, re.I) else s + f'<script defer src="{self.js_file(chr(10).join(code))}"></script>'
        return s

def collect(src):
    tmp = None
    if os.path.isfile(src) and src.lower().endswith(".zip"):
        tmp = tempfile.mkdtemp(); zipfile.ZipFile(src).extractall(tmp); src = tmp
    if os.path.isfile(src): return os.path.dirname(os.path.abspath(src)), [os.path.abspath(src)], tmp
    files = []
    for d, ds, fs in os.walk(src):
        ds[:] = [x for x in ds if not x.startswith(".") and x not in ("node_modules", "__MACOSX")]
        files += [os.path.join(d, f) for f in fs if f.lower().endswith((".html", ".htm")) and not f.startswith(".")]
    return os.path.abspath(src), sorted(files), tmp

def main():
    ap = argparse.ArgumentParser(); ap.add_argument("source"); ap.add_argument("--name", required=True)
    ap.add_argument("--niche", default=""); ap.add_argument("--line", default=""); ap.add_argument("--kind", default="boutique")
    ap.add_argument("--id", default=""); ap.add_argument("--public", default=os.path.join(ROOT, "public")); ap.add_argument("--no-shot", action="store_true")
    a = ap.parse_args()
    root, files, tmp = collect(a.source)
    if not files: sys.exit("Aucun fichier .html trouvé.")
    pub = os.path.abspath(a.public); tdir = os.path.join(pub, "templates"); os.makedirs(tdir, exist_ok=True)
    cat_p = os.path.join(tdir, "catalog.json")
    catalog = json.load(open(cat_p, encoding="utf-8")) if os.path.exists(cat_p) else []
    taken = {t["id"] for t in catalog} | {d[:-5] for d in os.listdir(tdir) if d.endswith(".html")}
    tid = a.id or next(f"site{i}" for i in range(17, 999) if f"site{i}" not in taken)
    if not re.match(r"^[a-z][a-z0-9-]{0,29}$", tid): sys.exit("Identifiant invalide.")
    # accueil + clés de pages
    rel = {f: os.path.relpath(f, root).replace(os.sep, "/") for f in files}
    home = next((f for f in files if rel[f].lower() in ("index.html", "index.htm")), min(files, key=lambda f: (rel[f].count("/"), len(rel[f]))))
    def key_of(f):
        if f == home: return "home"
        k = re.sub(r"\.html?$", "", rel[f], flags=re.I); k = re.sub(r"/index$", "", k)
        return re.sub(r"[^a-z0-9]+", "-", k.lower()).strip("-")[:40] or "page"
    keys, used = {}, {"home"}
    for f in files:
        k = key_of(f); n = 2; base = k
        while k in used and f != home: k = f"{base}-{n}"; n += 1
        used.add(k); keys[f] = k
    route = {}  # chemin normalisé -> clé
    for f in files:
        r = rel[f]; route[r.lower()] = keys[f]; route[re.sub(r"\.html?$", "", r, flags=re.I).lower()] = keys[f]
        route[re.sub(r"(^|/)index\.html?$", "", r, flags=re.I).lower().strip("/")] = keys[f]
    imp = Importer(pub, tid, root)
    out_pages = []
    for f in files:
        src = open(f, encoding="utf-8", errors="ignore").read()
        base = os.path.dirname(f)
        s = imp.page(src, base, route)
        s = imp.handlers(s)
        def href(m):
            ref = H.unescape(m.group(2)); pure = ref.split("#")[0].split("?")[0]; frag = ref[len(pure):]
            if not pure or re.match(r"^(https?:|//|mailto:|tel:|javascript:|data:)", ref, re.I): return m.group(0)
            full = os.path.normpath(os.path.join(root, pure.lstrip("/")) if pure.startswith("/") else os.path.join(base, pure))
            k = route.get(os.path.relpath(full, root).replace(os.sep, "/").lower().strip("/").strip("."), route.get(os.path.relpath(full, root).replace(os.sep, "/").lower()))
            if k is None: return m.group(0)
            return f'{m.group(1)}"{"/__ndz__" if k == "home" else "/__ndz__/s/" + k}{frag}"'
        s = re.sub(r"(<a\b[^>]*?\shref\s*=\s*)[\"']([^\"']*)[\"']", href, s, flags=re.I)
        title = re.search(r"<title>([\s\S]*?)</title>", s, re.I)
        out_pages.append((keys[f], H.unescape(title.group(1)).strip()[:40] if title else keys[f], s))
    os.makedirs(os.path.join(tdir, tid, "pages"), exist_ok=True)
    manifest = {"pages": []}
    for k, title, s in out_pages:
        if k == "home": open(os.path.join(tdir, tid + ".html"), "w", encoding="utf-8").write(s)
        else:
            open(os.path.join(tdir, tid, "pages", k + ".html"), "w", encoding="utf-8").write(s)
            manifest["pages"].append({"key": k, "name": title or k})
    json.dump(manifest, open(os.path.join(tdir, tid, "manifest.json"), "w", encoding="utf-8"), ensure_ascii=False, indent=1)
    catalog = [t for t in catalog if t["id"] != tid] + [{"id": tid, "name": a.name, "niche": a.niche, "line": a.line, "kind": "vitrine" if a.kind == "vitrine" else "boutique"}]
    json.dump(catalog, open(cat_p, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
    shot = "non"
    if not a.no_shot:
        try:
            import threading, http.server, functools
            from playwright.sync_api import sync_playwright
            hnd = functools.partial(http.server.SimpleHTTPRequestHandler, directory=pub)
            srv = http.server.ThreadingHTTPServer(("127.0.0.1", 0), hnd); threading.Thread(target=srv.serve_forever, daemon=True).start()
            os.makedirs(os.path.join(pub, "shots"), exist_ok=True)
            with sync_playwright() as p:
                b = p.chromium.launch(); pg = b.new_page(viewport={"width": 1440, "height": 900})
                pg.goto(f"http://127.0.0.1:{srv.server_address[1]}/templates/{tid}.html", wait_until="load", timeout=45000); pg.wait_for_timeout(1200)
                pg.screenshot(path=os.path.join(pub, "shots", tid + ".jpg"), type="jpeg", quality=70); b.close()
            srv.shutdown(); shot = "oui"
        except Exception as e:
            shot = f"non ({str(e)[:50]}) : ajoute public/shots/{tid}.jpg à la main"
    if tmp: shutil.rmtree(tmp, ignore_errors=True)
    print(f"✓ {tid} importé · {len(out_pages)} page(s) · {imp.stats['assets']} fichiers · {imp.stats['styles']} css · {imp.stats['scripts']} scripts · {imp.stats['handlers']} onclick convertis · capture : {shot}")
    if imp.fail: print(f"⚠ {len(set(imp.fail))} fichier(s) introuvable(s), laissés tels quels :"); [print("   -", x) for x in sorted(set(imp.fail))[:15]]
    print("Redémarre le serveur pour voir le template dans la galerie. Il est déjà utilisable via le studio.")
main()
