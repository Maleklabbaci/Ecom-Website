/* Studio NovaDZ — interface (barre, ajout, calques, inspecteur). Pilote /_studio/frame.js dans l'iframe. */
(function () {
  "use strict"
  var root = document.getElementById("st"), cfg = root.dataset
  var FONTS = ["Inter", "Geist", "Urbanist", "Archivo", "Jost", "Space Grotesk", "Playfair Display", "Bodoni Moda", "Cormorant Garamond", "Estedad", "Georgia", "Arial", "Courier New"]
  var WIDTH = { d: 1280, t: 820, m: 390 }
  var PX = /^(font-size|letter-spacing|padding-.*|margin-.*|border-radius|border-width|width|height|min-height|max-width|gap|top|left|right|bottom)$/
  var F = null, dev = "d", lTab = "add", rTab = "content", dirty = false, saving = false, timer = 0
  var open = new WeakSet(), cur = "home", pages = [{ key: "home", name: "Accueil" }], products = [], simple = true

  function h(tag, attrs) {
    var e = document.createElement(tag)
    for (var k in attrs || {}) {
      var v = attrs[k]
      if (k === "class") e.className = v
      else if (k.slice(0, 2) === "on") e[k] = v
      else if (v === true) e.setAttribute(k, "")
      else if (v !== false && v != null) e.setAttribute(k, v)
    }
    for (var i = 2; i < arguments.length; i++) {
      var c = arguments[i]; if (c == null || c === false) continue
      if (Array.isArray(c)) c.forEach(function (x) { x && e.appendChild(x.nodeType ? x : document.createTextNode(x)) })
      else e.appendChild(c.nodeType ? c : document.createTextNode(c))
    }
    return e
  }
  function toast(msg, kind) {
    var t = h("div", { class: "toast " + (kind || "") }, msg); document.body.appendChild(t)
    setTimeout(function () { t.classList.add("out"); setTimeout(function () { t.remove() }, 300) }, 3200)
  }
  function post(url, body) {
    return fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body || {}) }).then(function (r) { return r.json() })
  }

  /* ---------- squelette ---------- */
  root.innerHTML = ""
  var status = h("span", { class: "status" }, cfg.published === "1" ? "En ligne" : "Pas encore publié")
  var bUndo = h("button", { class: "ib", title: "Annuler (Ctrl+Z)", onclick: function () { F && F.undo() } }, "↶")
  var bRedo = h("button", { class: "ib", title: "Rétablir (Ctrl+Y)", onclick: function () { F && F.redo() } }, "↷")
  var devBtns = [["d", "Ordinateur"], ["t", "Tablette"], ["m", "Mobile"]].map(function (x) {
    return h("button", { class: "seg" + (x[0] === dev ? " on" : ""), "data-d": x[0], onclick: function () { setDev(x[0]) } }, x[1])
  })
  var pageSel = h("select", { class: "pagesel", title: "Page", onchange: function () { switchPage(this.value) } })
  var bNewPage = h("button", { class: "btn sm", title: "Nouvelle page (copie de la page actuelle)", onclick: function () { newPage() } }, "+ Page")
  var bDelPage = h("button", { class: "btn sm", title: "Supprimer cette page", onclick: function () { delPage() } }, "Supprimer")
  var bSave = h("button", { class: "btn", onclick: function () { save() } }, "Enregistrer")
  var bPub = h("button", { class: "btn pri", onclick: publish }, "Publier")
  var top = h("header", { class: "top" },
    h("a", { class: "back", href: "/dashboard/design/themes" }, "← Retour"),
    h("b", { class: "ttl" }, "Studio · " + cfg.tplName), pageSel, bNewPage, bDelPage,
    h("div", { class: "grp" }, devBtns), h("div", { class: "grp" }, bUndo, bRedo),
    h("span", { class: "sp" }), status,
    h("a", { class: "btn", href: "#", onclick: function (e) { e.preventDefault(); preview() } }, "Aperçu"), bSave, bPub)
  var left = h("aside", { class: "left" }), right = h("aside", { class: "right" })
  var stage = h("div", { class: "stage" }), wrap = h("div", { class: "fwrap" })
  var frameEl = h("iframe", { class: "frame", title: "Page", src: "/dashboard/studio/frame?page=home" })
  wrap.appendChild(frameEl); stage.appendChild(wrap)
  root.appendChild(top); root.appendChild(left); root.appendChild(stage); root.appendChild(right)

  function fit() {
    var w = WIDTH[dev], aw = stage.clientWidth - 32, s = Math.min(1, aw / w), ah = stage.clientHeight - 24
    frameEl.style.width = w + "px"; frameEl.style.height = Math.round(ah / s) + "px"
    frameEl.style.transform = "scale(" + s + ")"
    wrap.style.width = Math.round(w * s) + "px"; wrap.style.height = ah + "px"
  }
  addEventListener("resize", fit)
  function setDev(d) {
    dev = d; devBtns.forEach(function (b) { b.classList.toggle("on", b.getAttribute("data-d") === d) })
    fit(); F && F.setDevice(d); renderRight()
  }

  /* ---------- enregistrer / publier / aperçu ---------- */
  function setStatus(t, cls) { status.textContent = t; status.className = "status " + (cls || "") }
  function save() {
    if (!F || saving) return Promise.resolve(false)
    saving = true; clearTimeout(timer); setStatus("Enregistrement…")
    return post("/dashboard/studio/save", { html: F.getHtml(), page: cur }).then(function (j) {
      saving = false
      if (!j.ok) { setStatus("Non enregistré", "err"); toast(j.error || "Enregistrement impossible", "err"); return false }
      dirty = false; setStatus("Brouillon enregistré", "ok"); return true
    }).catch(function () { saving = false; setStatus("Non enregistré", "err"); toast("Connexion perdue", "err"); return false })
  }
  function publish() {
    save().then(function (ok) {
      if (!ok) return
      post("/dashboard/studio/publish").then(function (j) {
        if (!j.ok) return toast(j.error || "Publication impossible", "err")
        setStatus("En ligne", "ok"); toast("Publié : toutes tes pages sont en ligne.", "ok")
      })
    })
  }
  function preview() { save().then(function () { window.open("/" + cfg.slug + (cur === "home" ? "" : "/s/" + cur) + "?preview=1", "_blank") }) }
  function frameUrl() { return "/dashboard/studio/frame?page=" + encodeURIComponent(cur) }
  function renderPages() {
    pageSel.innerHTML = ""; pages.forEach(function (p) { pageSel.appendChild(h("option", { value: p.key }, p.name)) })
    pageSel.value = cur; bDelPage.style.display = cur === "home" ? "none" : ""
  }
  function loadMeta() {
    return fetch("/dashboard/studio/meta").then(function (r) { return r.json() }).then(function (j) { pages = j.pages && j.pages.length ? j.pages : pages; products = j.products || []; renderPages() })
  }
  function openPage(k) { cur = k; F = null; frameEl.src = frameUrl(); renderPages() }
  function switchPage(k) { if (k === cur) return; save().then(function () { openPage(k) }) }
  function newPage() {
    var n = prompt("Nom de la nouvelle page (ex. À propos) :"); if (!n) return
    save().then(function () { return post("/dashboard/studio/page", { name: n, from: cur }) }).then(function (j) {
      if (!j.ok) return toast(j.error || "Impossible de créer la page", "err")
      loadMeta().then(function () { openPage(j.key); toast("Page créée (copie de la précédente). Relie-la avec un lien : /" + cfg.slug + "/s/" + j.key, "ok") })
    })
  }
  function delPage() {
    if (cur === "home" || !confirm("Supprimer cette page ?")) return
    post("/dashboard/studio/page/delete", { key: cur }).then(function () { dirty = false; cur = "home"; loadMeta().then(function () { openPage("home") }) })
  }
  function autoMobile() { return F ? F.autoMobile() : -1 }
  function changed() {
    dirty = true; setStatus("Modifié…"); clearTimeout(timer); timer = setTimeout(save, 2500)
    bUndo.disabled = !F.canUndo(); bRedo.disabled = !F.canRedo()
  }
  addEventListener("beforeunload", function (e) { if (dirty) { e.preventDefault(); e.returnValue = "" } })
  document.addEventListener("keydown", function (e) {
    if (/INPUT|TEXTAREA|SELECT/.test((e.target || {}).tagName || "")) return
    var m = e.ctrlKey || e.metaKey, k = e.key.toLowerCase()
    if (m && k === "z") { e.preventDefault(); e.shiftKey ? F.redo() : F.undo() }
    else if (m && k === "y") { e.preventDefault(); F.redo() }
    else if (m && k === "s") { e.preventDefault(); save() }
  })

  /* ---------- images ---------- */
  function pickImage(cb) {
    var inp = h("input", { type: "file", accept: "image/png,image/jpeg,image/webp,image/gif" })
    inp.onchange = function () {
      var f = inp.files[0]; if (!f) return
      var img = new Image(), url = URL.createObjectURL(f)
      img.onload = function () {
        var s = Math.min(1, 1800 / Math.max(img.width, img.height)), c = document.createElement("canvas")
        c.width = Math.round(img.width * s); c.height = Math.round(img.height * s)
        c.getContext("2d").drawImage(img, 0, 0, c.width, c.height)
        var png = f.type === "image/png", data = c.toDataURL(png ? "image/png" : "image/jpeg", 0.86)
        if (png && data.length > 3.2e6) data = c.toDataURL("image/jpeg", 0.86)
        URL.revokeObjectURL(url); toast("Envoi de l'image…")
        post("/dashboard/upload", { dataUrl: data }).then(function (j) { j.ok ? cb(j.url) : toast(j.error || "Image refusée", "err") })
      }
      img.src = url
    }
    inp.click()
  }

  /* ---------- panneau gauche ---------- */
  function renderLeft() {
    left.innerHTML = ""
    var tabs = [["add", "Ajouter"], ["layers", "Calques"], ["assist", "Assistant"], ["site", "Site"]]
    left.appendChild(h("nav", { class: "tabs" }, tabs.map(function (t) {
      return h("button", { class: lTab === t[0] ? "on" : "", onclick: function () { lTab = t[0]; renderLeft() } }, t[1])
    })))
    var body = h("div", { class: "pbody" }); left.appendChild(body)
    if (!F) return
    if (lTab === "add") {
      var inside = h("input", { type: "checkbox", id: "inside" })
      body.appendChild(h("label", { class: "chk" }, inside, "Ajouter à l'intérieur de l'élément sélectionné"))
      var groups = {}
      F.blocks.forEach(function (b) { (groups[b.group] = groups[b.group] || []).push(b) })
      Object.keys(groups).forEach(function (g) {
        body.appendChild(h("h4", {}, g))
        body.appendChild(h("div", { class: "blocks" }, groups[g].map(function (b) {
          return h("button", { class: "blk", onclick: function () { F.insert(b.id, inside.checked) } }, b.label)
        })))
      })
      body.appendChild(h("p", { class: "hint" }, "Sans sélection, le bloc va en bas de la page. Sinon il se place juste après l'élément choisi."))
    } else if (lTab === "assist") {
      var ta = h("textarea", { rows: 3, placeholder: "ex. fond noir et texte blanc, plus grand, arrondi" }), log = h("div", { class: "alog" })
      var go = function () {
        if (!ta.value.trim()) return
        window.StudioAssistant.run(ta.value, F, { autoMobile: autoMobile }).forEach(function (m) { log.insertBefore(h("div", { class: m[0] === "✓" ? "okm" : "nom" }, m), log.firstChild) })
        ta.value = ""; renderRight()
      }
      ta.onkeydown = function (e) { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); go() } }
      body.appendChild(h("p", { class: "hint" }, "Sélectionne un élément dans la page, puis écris ce que tu veux. Plusieurs ordres d'un coup : sépare-les par « et » ou une virgule."))
      body.appendChild(ta); body.appendChild(h("button", { class: "btn pri wide", onclick: go }, "Appliquer"))
      body.appendChild(h("div", { class: "chips" }, window.StudioAssistant.examples.map(function (x) { return h("button", { onclick: function () { ta.value = x; ta.focus() } }, x) })))
      body.appendChild(log)
    } else if (lTab === "layers") {
      var ul = h("ul", { class: "tree" }); body.appendChild(ul)
      var sel = F.selected(); for (var p = sel; p && p !== F.win.document.body; p = p.parentElement) open.add(p.parentElement || p)
      open.add(F.win.document.body); node(ul, F.win.document.body, 0)
    } else {
      siteTab(body)
    }
  }
  function nodeLabel(el) {
    var t = el.tagName.toLowerCase(), txt = ""
    if (!el.children.length) txt = (el.textContent || "").trim().slice(0, 22)
    else if (el.firstElementChild && !el.firstElementChild.children.length && el.children.length === 1) txt = (el.textContent || "").trim().slice(0, 22)
    var c = (el.getAttribute("class") || "").split(/\s+/)[0]
    return t + (el.id ? "#" + el.id : c ? "." + c.slice(0, 14) : "") + (txt ? " · " + txt : "")
  }
  function node(ul, el, depth) {
    if (depth > 40) return
    var kids = [].slice.call(el.children).filter(function (c) { return !/^(SCRIPT|STYLE|LINK|META|NOSCRIPT)$/.test(c.tagName) && !c.hasAttribute("data-studio-ui") && el.tagName !== "SVG" })
    var isOpen = open.has(el), li = h("li", {})
    var row = h("div", { class: "lrow" + (F.selected() === el ? " on" : ""), draggable: el !== F.win.document.body, style: "padding-left:" + (depth * 12 + 4) + "px" },
      h("span", { class: "car", onclick: function (e) { e.stopPropagation(); isOpen ? open.delete(el) : open.add(el); renderLeft() } }, kids.length ? (isOpen ? "▾" : "▸") : "·"),
      h("span", { class: "lab" }, nodeLabel(el)))
    row.onclick = function () { F.select(el); el.scrollIntoView && el.scrollIntoView({ block: "center", behavior: "smooth" }) }
    row.ondragstart = function (e) { e.dataTransfer.setData("text/plain", "x"); window.__drag = el }
    row.ondragover = function (e) { e.preventDefault(); var r = row.getBoundingClientRect(), y = (e.clientY - r.top) / r.height; row.dataset.z = y < .3 ? "b" : y > .7 ? "a" : "i" }
    row.ondragleave = function () { delete row.dataset.z }
    row.ondrop = function (e) {
      e.preventDefault(); var z = row.dataset.z; delete row.dataset.z
      if (window.__drag) F.moveTo(window.__drag, el, z === "b" ? "before" : z === "a" ? "after" : "inside"); window.__drag = null
    }
    li.appendChild(row); ul.appendChild(li)
    if (isOpen && kids.length) {
      var sub = h("ul", {}); li.appendChild(sub)
      kids.slice(0, 250).forEach(function (c) { node(sub, c, depth + 1) })
    }
  }
  function hex(c) {
    var m = /rgba?\((\d+)[ ,]+(\d+)[ ,]+(\d+)/.exec(c || ""); if (!m) return /^#[0-9a-f]{6}$/i.test(c) ? c : ""
    return "#" + [1, 2, 3].map(function (i) { return ("0" + (+m[i]).toString(16)).slice(-2) }).join("")
  }
  function siteTab(body) {
    var meta = F.getMeta()
    body.appendChild(h("h4", {}, "Page"))
    body.appendChild(fld("Titre de l'onglet", h("input", { value: meta.title, onchange: function () { F.setMeta({ title: this.value, desc: F.getMeta().desc }) } })))
    body.appendChild(fld("Description (Google)", h("textarea", { rows: 3, onchange: function () { F.setMeta({ title: F.getMeta().title, desc: this.value }) } }, meta.desc)))
    body.appendChild(h("h4", {}, "Couleurs du site"))
    body.appendChild(h("p", { class: "hint" }, "Change une couleur, elle change partout où elle est utilisée."))
    var cw = h("div", { class: "sw" }); body.appendChild(cw)
    F.scanColors().forEach(function (c) {
      var hx = hex(c.c); if (!hx) return
      var inp = h("input", { type: "color", value: hx, title: c.c + " · " + c.n + " usages" })
      inp.onchange = function () { F.replaceColor(c.c, inp.value); renderLeft() }
      cw.appendChild(inp)
    })
    body.appendChild(h("h4", {}, "Polices du site"))
    F.scanFonts().forEach(function (f) {
      var sel = h("select", {}, h("option", { value: "" }, "Remplacer par…"), FONTS.map(function (n) { return h("option", { value: n }, n) }))
      sel.onchange = function () { if (sel.value) { F.replaceFont(f.f, sel.value); renderLeft() } }
      body.appendChild(h("div", { class: "frow" }, h("span", {}, f.f + " (" + f.n + ")"), sel))
    })
    body.appendChild(h("h4", {}, "Mobile"))
    body.appendChild(h("button", { class: "btn wide", onclick: function () {
      setDev("m"); setTimeout(function () { var n = F.autoMobile(); toast(n > 0 ? "Adapté au mobile : " + n + " réglages. Ctrl+Z pour annuler." : "Rien à corriger sur mobile.", n > 0 ? "ok" : "") }, 700)
    } }, "Adapter automatiquement au mobile"))
    if (cur === "home") body.appendChild(h("h4", {}, "Modèle"))
    if (cur === "home") body.appendChild(h("button", { class: "btn wide", onclick: function () {
      if (!confirm("Revenir au modèle d'origine ? Tes modifications (brouillon et version en ligne) seront perdues.")) return
      post("/dashboard/studio/reset").then(function () { dirty = false; location.reload() })
    } }, "Restaurer le modèle d'origine"))
  }

  /* ---------- inspecteur ---------- */
  function fld(label, ctl) { return h("label", { class: "fld" }, h("span", {}, label), ctl) }
  function cs() { return F.win.getComputedStyle(F.selected()) }
  function normVal(p, v) { v = v.trim(); return PX.test(p) && /^-?\d+(\.\d+)?$/.test(v) ? v + "px" : v }
  function mark(box, p) { box.classList.toggle("set", !!F.own(p)) }
  function tx(label, p, ph) {
    var inp = h("input", { value: F.own(p), placeholder: ph || cs().getPropertyValue(p) })
    var rs = h("button", { class: "x", title: "Retirer", onclick: function (e) { e.preventDefault(); F.setStyle(p, ""); inp.value = ""; mark(box, p) } }, "×")
    var box = h("label", { class: "fld" + (F.own(p) ? " set" : "") }, h("span", {}, label), h("div", { class: "in" }, inp, rs))
    inp.onchange = function () { F.setStyle(p, normVal(p, inp.value)); inp.value = F.own(p); mark(box, p) }
    return box
  }
  function col(label, p) {
    var cur = hex(cs().getPropertyValue(p)), own = F.own(p)
    var pick = h("input", { type: "color", value: hex(own) || cur || "#ffffff" })
    var inp = h("input", { value: own, placeholder: cs().getPropertyValue(p) })
    var rs = h("button", { class: "x", onclick: function (e) { e.preventDefault(); F.setStyle(p, ""); inp.value = ""; mark(box, p) } }, "×")
    var box = h("label", { class: "fld" + (own ? " set" : "") }, h("span", {}, label), h("div", { class: "in" }, pick, inp, rs))
    pick.oninput = function () { F.setStyle(p, pick.value, true); inp.value = pick.value; mark(box, p) }
    pick.onchange = function () { F.commit("Couleur") }
    inp.onchange = function () { F.setStyle(p, inp.value); mark(box, p) }
    return box
  }
  function sel(label, p, opts) {
    var s = h("select", {}, h("option", { value: "" }, "—"), opts.map(function (o) { var a = Array.isArray(o) ? o : [o, o]; return h("option", { value: a[0] }, a[1]) }))
    s.value = F.own(p)
    var box = h("label", { class: "fld" + (F.own(p) ? " set" : "") }, h("span", {}, label), s)
    s.onchange = function () { F.setStyle(p, s.value); mark(box, p) }
    return box
  }
  function seg(label, p, opts) {
    var box = h("div", { class: "fld" + (F.own(p) ? " set" : "") }, h("span", {}, label)), g = h("div", { class: "segs" })
    opts.forEach(function (o) {
      var b = h("button", { class: F.own(p) === o[0] ? "on" : "", title: o[2] || o[0], onclick: function (e) {
        e.preventDefault(); var v = F.own(p) === o[0] ? "" : o[0]; F.setStyle(p, v)
        ;[].forEach.call(g.children, function (x) { x.classList.remove("on") }); if (v) b.classList.add("on"); mark(box, p)
      } }, o[1])
      g.appendChild(b)
    })
    box.appendChild(g); return box
  }
  function quad(title, base) {
    return h("div", { class: "quad" }, h("span", {}, title), h("div", {}, ["top", "right", "bottom", "left"].map(function (s, i) {
      var p = base + "-" + s, inp = h("input", { value: F.own(p), placeholder: ["H", "D", "B", "G"][i], title: s })
      inp.onchange = function () { F.setStyle(p, normVal(p, inp.value)); inp.value = F.own(p) }
      return inp
    })))
  }
  function sect(title, kids, openIt) { var d = h("details", { class: "sect" }, h("summary", {}, title), h("div", { class: "sb" }, kids)); if (openIt) d.open = true; return d }

  function renderRight() {
    right.innerHTML = ""
    var el = F && F.selected()
    if (!el) { right.appendChild(h("div", { class: "empty" }, h("b", {}, "Sélectionne un élément"), h("p", {}, "Clique sur n'importe quoi dans la page. Double-clic pour écrire directement. Les calques et « Ajouter » sont à gauche."))); return }
    var chain = [], p = el
    for (var i = 0; p && i < 4; i++, p = p.parentElement) chain.unshift(p)
    right.appendChild(h("div", { class: "crumbs" }, chain.map(function (c) {
      return h("button", { class: c === el ? "on" : "", onclick: function () { F.select(c) } }, c.tagName.toLowerCase())
    })))
    var tabs = [["content", "Contenu"], ["style", "Style"], ["adv", "Avancé"]]
    right.appendChild(h("nav", { class: "tabs" }, tabs.map(function (t) {
      return h("button", { class: rTab === t[0] ? "on" : "", onclick: function () { rTab = t[0]; renderRight() } }, t[1])
    })))
    if (dev !== "d") right.appendChild(h("div", { class: "devnote" }, "Les styles s'appliquent à " + (dev === "t" ? "la tablette et plus petit" : "le mobile") + " seulement."))
    var body = h("div", { class: "pbody" }); right.appendChild(body)
    ;({ content: contentTab, style: styleTab, adv: advTab })[rTab](body, el)
  }

  function actions(el) {
    var b = function (t, fn, cls) { return h("button", { class: "btn sm " + (cls || ""), onclick: fn }, t) }
    return h("div", { class: "acts" }, b("Dupliquer", function () { F.dup() }), b("Monter", function () { F.move("up") }), b("Descendre", function () { F.move("down") }), b("Supprimer", function () { F.del() }, "danger"))
  }
  function contentTab(body, el) {
    var t = el.tagName
    body.appendChild(actions(el))
    if (t !== "BODY") body.appendChild(fld("Type", (function () {
      var s = h("select", {}, ["h1", "h2", "h3", "h4", "p", "div", "span", "section", "a", "button"].map(function (x) { return h("option", { value: x }, x) }))
      var cur = t.toLowerCase(); if (!s.querySelector('[value="' + cur + '"]')) s.appendChild(h("option", { value: cur }, cur)); s.value = cur
      s.onchange = function () { F.setTag(s.value) }; return s
    })()))
    var txt = F.getText()
    if (txt !== null) body.appendChild(fld("Texte", h("textarea", { rows: 4, onchange: function () { F.setText(this.value) } }, txt)))
    else if (F.editable(el) === false && t !== "IMG" && t !== "BODY") body.appendChild(h("p", { class: "hint" }, "Cet élément contient d'autres blocs : sélectionne le texte voulu dans la page (ou les calques)."))
    if (t === "A" || el.closest("a")) {
      var a = t === "A" ? el : el.closest("a")
      if (a !== el) body.appendChild(h("p", { class: "hint" }, "Cet élément est dans un lien : sélectionne le lien (↖) pour changer l'adresse."))
      else {
        var qs = h("select", {}, h("option", { value: "" }, "Liens rapides…"),
          [["#ndz-boutique", "Produits (cette page)"], ["/" + cfg.slug, "Accueil"], ["/" + cfg.slug + "/cart", "Panier"], ["/" + cfg.slug + "/checkout", "Commander"]]
            .concat(pages.filter(function (p) { return p.key !== "home" }).map(function (p) { return ["/" + cfg.slug + "/s/" + p.key, "Page : " + p.name] }))
            .concat(products.slice(0, 40).map(function (p) { return ["/" + cfg.slug + "/p/" + p.id, "Produit : " + p.title] })).map(function (x) { return h("option", { value: x[0] }, x[1]) }))
        var href = h("input", { value: el.getAttribute("href") || "", placeholder: "https://…, tel:+213…, #section" })
        href.onchange = function () { F.setAttr("href", href.value) }
        qs.onchange = function () { if (qs.value) { href.value = qs.value; F.setAttr("href", qs.value) } }
        body.appendChild(fld("Adresse du lien", href)); body.appendChild(qs)
        var mode = h("select", {}, [["", "Ouvrir le lien"], ["direct", "Acheter maintenant"], ["cart", "Ajouter au panier"]].map(function (o) { return h("option", { value: o[0] }, o[1]) }))
        var pid = h("select", {}, h("option", { value: "" }, "Produit…"), products.map(function (p) { return h("option", { value: String(p.id) }, p.title) }))
        mode.value = el.getAttribute("data-ndz-buy") || ""; pid.value = el.getAttribute("data-ndz-pid") || ""
        var apply = function () {
          F.setAttr("data-ndz-buy", mode.value); F.setAttr("data-ndz-pid", mode.value ? pid.value : "")
          if (mode.value && pid.value) { F.setAttr("href", "/" + cfg.slug + "/p/" + pid.value); href.value = el.getAttribute("href") }
        }
        mode.onchange = apply; pid.onchange = apply
        body.appendChild(h("h4", {}, "Action du bouton")); body.appendChild(mode); body.appendChild(h("div", { style: "height:6px" })); body.appendChild(pid)
        if (!products.length) body.appendChild(h("p", { class: "hint" }, "Ajoute d'abord des produits pour les relier à un bouton."))
        body.appendChild(h("label", { class: "chk" }, h("input", { type: "checkbox", checked: el.getAttribute("target") === "_blank", onchange: function () { F.setAttr("target", this.checked ? "_blank" : ""); F.setAttr("rel", this.checked ? "noopener" : "") } }), "Ouvrir dans un nouvel onglet"))
      }
    } else if (t !== "BODY") body.appendChild(h("button", { class: "btn sm wide", onclick: function () { F.wrapLink("#") } }, "Transformer en lien"))
    if (el.hasAttribute("data-ndz-video")) {
      var yt = h("input", { value: el.getAttribute("data-ndz-video") ? "https://youtu.be/" + el.getAttribute("data-ndz-video") : "", placeholder: "https://www.youtube.com/watch?v=…" })
      yt.onchange = function () {
        var m = /(?:v=|youtu\.be\/|embed\/|shorts\/)([\w-]{11})/.exec(yt.value) || /^([\w-]{11})$/.exec(yt.value.trim())
        if (!m) return toast("Lien YouTube non reconnu.", "err")
        F.setAttr("data-ndz-video", m[1]); toast("Vidéo ajoutée. Elle s'affiche dans l'aperçu.", "ok")
      }
      body.appendChild(h("h4", {}, "Vidéo")); body.appendChild(fld("Lien YouTube", yt))
    }
    if (t === "IMG") {
      body.appendChild(h("img", { class: "prev", src: el.currentSrc || el.src }))
      body.appendChild(h("button", { class: "btn pri wide", onclick: function () { pickImage(function (u) { F.setAttr("src", u); renderRight() }) } }, "Remplacer l'image"))
      var alt = h("input", { value: el.getAttribute("alt") || "" }); alt.onchange = function () { F.setAttr("alt", alt.value) }
      body.appendChild(fld("Texte alternatif", alt))
    } else if (t !== "BODY" || true) {
      var bg = F.own("background-image")
      body.appendChild(h("h4", {}, "Image de fond"))
      body.appendChild(h("div", { class: "acts" },
        h("button", { class: "btn sm", onclick: function () { pickImage(function (u) { F.setStyle("background-image", "url(" + u + ")"); F.setStyle("background-size", F.own("background-size") || "cover"); F.setStyle("background-position", "center"); renderRight() }) } }, bg ? "Changer" : "Choisir une image"),
        bg ? h("button", { class: "btn sm", onclick: function () { F.setStyle("background-image", ""); renderRight() } }, "Retirer") : null))
    }
  }

  var SHADOWS = [["none", "Aucune"], ["0 2px 8px rgba(0,0,0,.12)", "Douce"], ["0 8px 24px rgba(0,0,0,.18)", "Moyenne"], ["0 18px 48px rgba(0,0,0,.28)", "Forte"]]
  var BTN_P = [["Plein noir", { "background-color": "#111111", color: "#ffffff", "border-radius": "999px", padding: "14px 28px", "border-width": "0" }], ["Plein rouge", { "background-color": "#e11d48", color: "#ffffff", "border-radius": "999px", padding: "14px 28px", "border-width": "0" }], ["Contour", { "background-color": "transparent", color: "#111111", "border-style": "solid", "border-width": "2px", "border-color": "#111111", "border-radius": "999px", padding: "12px 26px" }], ["Doux", { "background-color": "#f1f0f6", color: "#111111", "border-radius": "12px", padding: "14px 24px", "border-width": "0" }], ["Carré", { "border-radius": "0" }]]
  var TXT_P = [["Titre XL", { "font-size": "64px", "font-weight": "800", "line-height": "1.05" }], ["Titre", { "font-size": "40px", "font-weight": "700", "line-height": "1.15" }], ["Sous-titre", { "font-size": "22px", "font-weight": "500", "line-height": "1.4" }], ["Texte", { "font-size": "17px", "font-weight": "400", "line-height": "1.6" }], ["Petit", { "font-size": "13px", "font-weight": "400", "line-height": "1.4" }]]
  var CARD_P = [["Carte ombre", { "background-color": "#ffffff", "border-radius": "16px", "box-shadow": "0 8px 24px rgba(0,0,0,.14)", padding: "24px" }], ["Carte bordure", { "background-color": "#ffffff", "border-style": "solid", "border-width": "1px", "border-color": "#e5e4ea", "border-radius": "16px", padding: "24px" }], ["Fond doux", { "background-color": "#f5f4f8", "border-radius": "16px", padding: "24px" }], ["Sombre", { "background-color": "#14131a", color: "#ffffff", "border-radius": "16px", padding: "24px" }]]
  function attrSel(label, name, opts, el) {
    var s = h("select", {}, opts.map(function (o) { return h("option", { value: o[0] }, o[1]) })); s.value = el.getAttribute(name) || ""
    s.onchange = function () { F.setAttr(name, s.value) }; return fld(label, s)
  }
  function animSect(el) {
    var d = h("input", { type: "number", min: 0, max: 3000, step: 100, value: el.getAttribute("data-fx-d") || "", placeholder: "0" }); d.onchange = function () { F.setAttr("data-fx-d", d.value) }
    return sect("Animation", [
      attrSel("À l'apparition", "data-fx", [["", "Aucune"], ["up", "Monte"], ["fade", "Fondu"], ["left", "Depuis la gauche"], ["right", "Depuis la droite"], ["zoom", "Zoom"]], el),
      fld("Délai (ms)", d),
      attrSel("Au survol", "data-fx-hover", [["", "Aucun"], ["lift", "Soulève"], ["zoom", "Zoom"], ["glow", "Lueur"]], el),
      h("p", { class: "hint" }, "Les animations se voient dans « Aperçu » (pas dans le studio)."),
    ], false)
  }
  function simpleStyle(body, el) {
    var t = el.tagName, isBtn = t === "A" || t === "BUTTON", isTxt = /^(H[1-6]|P|SPAN|LI|BLOCKQUOTE|LABEL|A|BUTTON)$/.test(t)
    var pre = isBtn ? BTN_P : isTxt ? TXT_P : CARD_P
    body.appendChild(h("h4", {}, isBtn ? "Style de bouton" : isTxt ? "Style de texte" : "Style de bloc"))
    body.appendChild(h("div", { class: "chips" }, pre.map(function (x) { return h("button", { onclick: function () { F.setStyles(x[1]); renderRight() } }, x[0]) })))
    var items = []
    if (isTxt) items.push(tx("Taille du texte", "font-size"), col("Couleur du texte", "color"), sel("Graisse", "font-weight", [["400", "Normal"], ["600", "Semi-gras"], ["700", "Gras"], ["800", "Très gras"]]), seg("Alignement", "text-align", [["left", "⇤", "Gauche"], ["center", "≡", "Centre"], ["right", "⇥", "Droite"]]))
    items.push(col("Couleur de fond", "background-color"), tx("Arrondi", "border-radius"), tx("Marge interne", "padding"))
    body.appendChild(h("div", { style: "margin-top:12px" }, items))
    body.appendChild(animSect(el))
    body.appendChild(h("div", { class: "acts" },
      h("button", { class: "btn sm", onclick: function () { F.setStyle("display", F.own("display") === "none" ? "" : "none"); renderRight() } }, F.own("display") === "none" ? "Réafficher ici" : "Masquer sur cet appareil"),
      h("button", { class: "btn sm", onclick: function () { simple = false; renderRight() } }, "Tous les réglages ▸")))
  }
  function styleTab(body, el) {
    if (simple) return simpleStyle(body, el)
    body.appendChild(h("button", { class: "btn sm", style: "margin-bottom:8px", onclick: function () { simple = true; renderRight() } }, "◂ Mode simple"))
    body.appendChild(animSect(el))
    body.appendChild(sect("Texte", [
      (function () {
        var s = h("select", {}, h("option", { value: "" }, "—"), FONTS.map(function (n) { return h("option", { value: n }, n) }))
        var own = (F.own("font-family") || "").split(",")[0].replace(/['"]/g, ""); s.value = FONTS.indexOf(own) >= 0 ? own : ""
        s.onchange = function () { F.setStyle("font-family", s.value ? "'" + s.value + "',system-ui,sans-serif" : "") }
        return fld("Police", s)
      })(),
      tx("Taille", "font-size"), sel("Graisse", "font-weight", [["300", "Fin"], ["400", "Normal"], ["500", "Moyen"], ["600", "Semi-gras"], ["700", "Gras"], ["800", "Très gras"], ["900", "Noir"]]),
      col("Couleur", "color"),
      seg("Alignement", "text-align", [["left", "⇤", "Gauche"], ["center", "≡", "Centre"], ["right", "⇥", "Droite"], ["justify", "☰", "Justifié"]]),
      tx("Interligne", "line-height"), tx("Espacement lettres", "letter-spacing"),
      seg("Casse", "text-transform", [["none", "Aa"], ["uppercase", "AA"], ["capitalize", "Ab"]]),
      seg("Style", "font-style", [["italic", "I", "Italique"], ["normal", "N"]]),
      seg("Soulignement", "text-decoration", [["underline", "S", "Souligné"], ["none", "∅"]]),
    ], true))
    body.appendChild(sect("Fond", [
      col("Couleur de fond", "background-color"),
      seg("Image de fond", "background-size", [["cover", "Remplir"], ["contain", "Contenir"], ["auto", "Auto"]]),
      tx("Opacité (0 à 1)", "opacity"),
    ], true))
    body.appendChild(sect("Espacement", [quad("Marge interne", "padding"), quad("Marge externe", "margin")], false))
    body.appendChild(sect("Taille", [tx("Largeur", "width"), tx("Hauteur", "height"), tx("Hauteur min.", "min-height"), tx("Largeur max.", "max-width"), sel("Ajustement image", "object-fit", ["cover", "contain", "fill", "none"])], false))
    body.appendChild(sect("Bordure et ombre", [
      tx("Arrondi", "border-radius"), tx("Épaisseur", "border-width"), sel("Style", "border-style", ["none", "solid", "dashed", "dotted"]), col("Couleur", "border-color"), sel("Ombre", "box-shadow", SHADOWS),
    ], false))
    body.appendChild(sect("Disposition", [
      sel("Affichage", "display", [["block", "Bloc"], ["flex", "Flex"], ["grid", "Grille"], ["inline-block", "En ligne"], ["none", "Masqué"]]),
      seg("Sens", "flex-direction", [["row", "→", "Ligne"], ["column", "↓", "Colonne"]]), seg("Retour à la ligne", "flex-wrap", [["wrap", "Oui"], ["nowrap", "Non"]]),
      sel("Alignement horizontal", "justify-content", [["flex-start", "Début"], ["center", "Centre"], ["flex-end", "Fin"], ["space-between", "Espacé"], ["space-around", "Réparti"]]),
      sel("Alignement vertical", "align-items", [["flex-start", "Haut"], ["center", "Centre"], ["flex-end", "Bas"], ["stretch", "Étiré"]]),
      tx("Écart", "gap"), tx("Colonnes (grille)", "grid-template-columns", "repeat(3, 1fr)"),
    ], false))
    body.appendChild(sect("Position", [
      sel("Position", "position", ["static", "relative", "absolute", "fixed", "sticky"]), tx("Haut", "top"), tx("Gauche", "left"), tx("Profondeur (z-index)", "z-index"),
      sel("Débordement", "overflow", ["visible", "hidden", "auto"]), tx("Transformation", "transform", "rotate(3deg)"),
    ], false))
    body.appendChild(h("div", { class: "acts" },
      h("button", { class: "btn sm", onclick: function () { F.setStyle("display", F.own("display") === "none" ? "" : "none"); renderRight() } }, F.own("display") === "none" ? "Réafficher ici" : "Masquer sur cet appareil"),
      h("button", { class: "btn sm", onclick: function () { F.clearStyles(); renderRight() } }, "Réinitialiser les styles")))
  }
  function advTab(body, el) {
    ;[["id", "Identifiant (ancre #)"], ["class", "Classes"], ["aria-label", "Étiquette accessibilité"]].forEach(function (a) {
      var inp = h("input", { value: el.getAttribute(a[0]) || "" }); inp.onchange = function () { F.setAttr(a[0], inp.value.trim()) }; body.appendChild(fld(a[1], inp))
    })
    var dir = h("select", {}, [["", "Auto"], ["ltr", "Gauche → droite"], ["rtl", "Droite → gauche (arabe)"]].map(function (o) { return h("option", { value: o[0] }, o[1]) }))
    dir.value = el.getAttribute("dir") || ""; dir.onchange = function () { F.setAttr("dir", dir.value) }; body.appendChild(fld("Direction du texte", dir))
    body.appendChild(h("h4", {}, "Propriété CSS libre"))
    var pn = h("input", { placeholder: "ex. letter-spacing" }), pv = h("input", { placeholder: "ex. 2px" })
    body.appendChild(h("div", { class: "pair" }, pn, pv, h("button", { class: "btn sm pri", onclick: function () { if (/^[a-z-]+$/.test(pn.value.trim())) { F.setStyle(pn.value.trim(), pv.value); pn.value = ""; pv.value = "" } } }, "OK")))
    body.appendChild(h("h4", {}, "Structure"))
    body.appendChild(h("div", { class: "acts" },
      h("button", { class: "btn sm", onclick: function () { F.group() } }, "Grouper"),
      h("button", { class: "btn sm", onclick: function () { F.unwrap() } }, "Dégrouper")))
  }

  /* ---------- démarrage ---------- */
  function init() {
    try { F = frameEl.contentWindow.StudioFrame } catch (_) { F = null }
    if (!F) return toast("Le studio n'a pas pu charger la page.", "err")
    F.on.select = function () { renderRight(); if (lTab === "layers") renderLeft() }
    F.on.change = function (l) { if (l !== "history" || true) changed(); if (lTab === "layers") renderLeft() }
    F.on.save = save
    F.setDevice(dev); fit(); renderLeft(); renderRight(); loadMeta().then(function () { renderRight() })
    bUndo.disabled = true; bRedo.disabled = true
    setStatus(cfg.unpublished === "1" ? "Brouillon non publié" : cfg.published === "1" ? "En ligne" : "Pas encore publié")
  }
  frameEl.addEventListener("load", init)
  fit(); renderLeft(); renderRight(); renderPages()
})()
