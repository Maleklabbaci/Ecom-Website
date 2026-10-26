#!/usr/bin/env python3
"""Allège les templates : sort les images/polices base64 vers public/templates/<id>/a/.
Usage : python3 scripts/extraire-templates.py <dossier_source> [public/templates]
Lit site*.html, écrit <id>.html + <id>/a/<hash>.<ext> (dédoublonné)."""
import re, sys, os, glob, hashlib
src = sys.argv[1]
out = sys.argv[2] if len(sys.argv) > 2 else os.path.join(os.path.dirname(__file__), "..", "public", "templates")
EXT = {"image/jpeg":"jpg","image/jpg":"jpg","image/png":"png","image/webp":"webp","image/gif":"gif","image/svg+xml":"svg",
       "image/avif":"avif","image/x-icon":"ico","image/vnd.microsoft.icon":"ico","font/woff2":"woff2","font/woff":"woff",
       "font/ttf":"ttf","font/otf":"otf","application/font-woff2":"woff2","application/font-woff":"woff",
       "application/x-font-ttf":"ttf","application/vnd.ms-fontobject":"eot"}
import base64
RX = re.compile(r'data:([a-zA-Z0-9.+/-]+);base64,([A-Za-z0-9+/=]+)')
for f in sorted(glob.glob(os.path.join(src, "site*.html")), key=lambda x:int(re.findall(r'\d+', os.path.basename(x))[0])):
    tid = os.path.basename(f)[:-5]
    s = open(f, encoding="utf-8", errors="ignore").read()
    adir = os.path.join(out, tid, "a"); os.makedirs(adir, exist_ok=True)
    n = {"k":0, "kept":0}
    def sub(m):
        mime, b64 = m.group(1).lower(), m.group(2)
        if len(b64) < 3000: n["kept"] += 1; return m.group(0)       # petit : on laisse inline
        ext = EXT.get(mime)
        if not ext: n["kept"] += 1; return m.group(0)
        try: raw = base64.b64decode(b64 + "=" * (-len(b64) % 4))
        except Exception: n["kept"] += 1; return m.group(0)
        name = hashlib.sha1(raw).hexdigest()[:12] + "." + ext
        p = os.path.join(adir, name)
        if not os.path.exists(p): open(p, "wb").write(raw)
        n["k"] += 1
        return f"/templates/{tid}/a/{name}"
    s2 = RX.sub(sub, s)
    open(os.path.join(out, tid + ".html"), "w", encoding="utf-8").write(s2)
    print(f"{tid}: {len(s)//1024} Ko -> {len(s2)//1024} Ko | {n['k']} fichiers sortis, {n['kept']} petits gardés")
