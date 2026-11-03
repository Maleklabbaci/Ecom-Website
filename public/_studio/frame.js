/* Studio NovaDZ — côté page. Tourne dans l'iframe du studio, jamais sur la vitrine publique. */
(function () {
  "use strict"
  var D = document, B = D.body, H = D.head
  var INLINE = /^(SPAN|B|I|EM|STRONG|A|BR|SMALL|SUB|SUP|U|MARK|S|CODE)$/
  var VOIDS = /^(IMG|BR|HR|INPUT|SOURCE|META|LINK|SVG|VIDEO|AUDIO|CANVAS)$/
  var DEVS = { d: "d", t: "t", m: "m" }
  var S = { sel: null, dev: "d", editing: null, editHtml: "", hist: [], fut: [], rules: {}, n: 0, on: {}, hover: null }
  var API = { ready: true, on: S.on }

  /* ---------- feuille de style du studio : règles par élément et par appareil ---------- */
  var cssEl = D.getElementById("ndz-studio-css")
  if (!cssEl) { cssEl = D.createElement("style"); cssEl.id = "ndz-studio-css"; H.appendChild(cssEl) }
  D.querySelectorAll("[data-s]").forEach(function (e) {
    var m = /^s(\d+)$/.exec(e.getAttribute("data-s")); if (m) S.n = Math.max(S.n, +m[1])
  })
  function parseRules() {
    S.rules = {}
    var parts = cssEl.textContent.split(/\/\*T\*\/|\/\*M\*\//)
    ;["d", "t", "m"].forEach(function (k, i) {
      var re = /html \[data-s="([^"]+)"\]\{([^}]*)\}/g, m
      while ((m = re.exec(parts[i] || ""))) {
        var o = (S.rules[m[1]] = S.rules[m[1]] || { d: {}, t: {}, m: {} })
        m[2].split(";").forEach(function (decl) {
          var j = decl.indexOf(":"); if (j < 1) return
          o[k][decl.slice(0, j).trim()] = decl.slice(j + 1).replace(/!important/, "").trim()
        })
      }
    })
  }
  var TEXTP = /^(color|font-family|font-size|font-weight|font-style|line-height|letter-spacing|text-transform|text-decoration|text-align)$/
  function writeCss() {
    function mk(k) {
      return Object.keys(S.rules).map(function (id) {
        var o = S.rules[id][k] || {}, ks = Object.keys(o)
        if (!ks.length) return ""
        var dec = function (a) { return a.map(function (p) { return p + ":" + o[p] + " !important" }).join(";") }
        var tx = ks.filter(function (p) { return TEXTP.test(p) })
        /* le texte des templates vit dans des balises imbriquées : on propage aux enfants qui n'ont pas leur propre réglage */
        return 'html [data-s="' + id + '"]{' + dec(ks) + "}" + (tx.length ? 'html [data-s="' + id + '"] :not([data-s]){' + dec(tx) + "}" : "")
      }).join("")
    }
    cssEl.textContent = "/*D*/" + mk("d") + "/*T*/@media(max-width:1199px){" + mk("t") + "}/*M*/@media(max-width:809px){" + mk("m") + "}"
  }
  function prune() {
    var present = {}
    D.querySelectorAll("[data-s]").forEach(function (e) { present[e.getAttribute("data-s")] = 1 })
    Object.keys(S.rules).forEach(function (id) { if (!present[id]) delete S.rules[id] })
  }
  parseRules()
  function ensureId(el) {
    var id = el.getAttribute("data-s")
    if (!id) { id = "s" + (++S.n); el.setAttribute("data-s", id) }
    return id
  }

  /* ---------- interface superposée (hors du <body>, jamais enregistrée) ---------- */
  var ui = D.createElement("div"); ui.setAttribute("data-studio-ui", "")
  ui.innerHTML = '<div class="sf-hov"></div><div class="sf-sel"></div><div class="sf-tb"></div><div class="sf-drop"></div><div class="sf-gv"></div><div class="sf-gh"></div><i class="sf-h" data-k="e"></i><i class="sf-h" data-k="s"></i><i class="sf-h" data-k="se"></i>'
  D.documentElement.appendChild(ui)
  var uiCss = D.createElement("style"); uiCss.setAttribute("data-studio-ui", "")
  uiCss.textContent =
    "[data-studio-ui]{font:12px/1.2 system-ui,sans-serif}.sf-hov,.sf-sel,.sf-drop{position:fixed;pointer-events:none;z-index:2147483000;display:none;box-sizing:border-box}" +
    ".sf-hov{outline:1px dashed #111111;background:rgba(17,17,17,.05)}.sf-sel{outline:2px solid #111111}" +
    ".sf-drop{background:#111111;height:3px;border-radius:2px}.sf-drop.in{height:auto;background:rgba(17,17,17,.12);outline:2px dashed #111111}" +
    ".sf-tb{position:fixed;z-index:2147483001;display:none!important;gap:2px;background:#111111;color:#fff;border-radius:8px;padding:3px;box-shadow:0 6px 20px rgba(0,0,0,.3);align-items:center;max-width:96vw}" +
    ".sf-tb b{font-weight:600;padding:0 8px;font-size:11px;opacity:.85;max-width:150px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}" +
    ".sf-tb button{all:unset;cursor:pointer;color:#fff;min-width:26px;height:26px;text-align:center;line-height:26px;border-radius:6px;font-size:13px}.sf-tb button:hover{background:#111111}" +
    ".sf-tb button.on{background:#111111}.sf-tb i{width:1px;height:16px;background:#ffffff40;margin:0 2px}" +
    ".sf-gv,.sf-gh{position:fixed;pointer-events:none;z-index:2147483000;display:none;background:#ff2d78}.sf-gv{width:1px;top:0;bottom:0}.sf-gh{height:1px;left:0;right:0}" +
    ".sf-h{position:fixed;display:none;width:10px;height:10px;background:#fff;border:2px solid #111111;border-radius:3px;z-index:2147483001;pointer-events:auto;box-sizing:border-box}" +
    ".sf-h[data-k=e]{cursor:ew-resize}.sf-h[data-k=s]{cursor:ns-resize}.sf-h[data-k=se]{cursor:nwse-resize}" +
    "[data-ndz-video] iframe{pointer-events:none}[data-ndz-video='']{min-height:220px;background:#14131a;display:flex;align-items:center;justify-content:center}[data-ndz-video='']::before{content:'▶ Vidéo YouTube : colle le lien dans le panneau de droite';color:#fff;font:600 14px system-ui,sans-serif;padding:20px;text-align:center}" +
    "[contenteditable=true]{outline:2px solid #111111!important;cursor:text!important}"
  H.appendChild(uiCss)
  var gv = ui.querySelector(".sf-gv"), gh = ui.querySelector(".sf-gh"), handles = [].slice.call(ui.querySelectorAll(".sf-h"))
  var hov = ui.querySelector(".sf-hov"), selBox = ui.querySelector(".sf-sel"), tb = ui.querySelector(".sf-tb"), dropEl = ui.querySelector(".sf-drop")

  /* ---------- toutes les photos se chargent dans l'éditeur ----------
     Une photo « loading=lazy » posée bas dans la page n'était chargée qu'en
     défilant : dans l'atelier elle apparaissait grise, comme cassée. On la
     charge tout de suite, et on remet « lazy » à l'enregistrement : la page
     publique reste rapide. */
  function eagerPhotos() {
    D.querySelectorAll('img[loading="lazy"]').forEach(function (i) {
      i.setAttribute("data-ndz-lz", "1"); i.setAttribute("loading", "eager")
    })
    D.querySelectorAll("video").forEach(function (v) { try { v.load() } catch (_) {} })
  }
  function lazyAgain(root) {
    if (!root || !root.querySelectorAll) return
    root.querySelectorAll("img[data-ndz-lz]").forEach(function (i) {
      i.setAttribute("loading", "lazy"); i.removeAttribute("data-ndz-lz")
    })
  }
  eagerPhotos()

  function isUI(t) { return !!(t && t.closest && t.closest("[data-studio-ui]")) }
  function norm(t) {
    if (!t || t.nodeType !== 1) t = t && t.parentElement
    if (!t || t === D.documentElement) return B
    var p = t.closest('[data-ndz="produits"]')
    if (p) return t.closest("[data-ndz-produit]") || p
    var sv = t.closest("svg"); if (sv && sv !== t) return sv
    return t
  }
  function label(el) {
    var t = el.tagName.toLowerCase()
    var c = (el.getAttribute("class") || "").split(/\s+/)[0]
    return t + (el.id ? "#" + el.id : c ? "." + c.slice(0, 18) : "")
  }
  function box(el, node) {
    var r = el.getBoundingClientRect()
    node.style.display = "block"; node.style.left = r.left + "px"; node.style.top = r.top + "px"
    node.style.width = r.width + "px"; node.style.height = r.height + "px"
  }
  var raf = 0
  function place() {
    if (raf) return
    raf = requestAnimationFrame(function () {
      raf = 0
      var el = S.sel
      if (!el || !el.isConnected) { selBox.style.display = "none"; tb.style.display = "none"; handles.forEach(function (x) { x.style.display = "none" }); return }
      box(el, selBox)
      var r = el.getBoundingClientRect()
      var showH = el !== B && !S.editing && !el.hasAttribute("data-ndz")
      handles.forEach(function (x) {
        var k = x.getAttribute("data-k"); x.style.display = showH ? "block" : "none"
        x.style.left = (k === "s" ? r.left + r.width / 2 : r.right) - 5 + "px"; x.style.top = (k === "e" ? r.top + r.height / 2 : r.bottom) - 5 + "px"
      })
      tb.style.display = "flex"
      var w = tb.offsetWidth, top = r.top - 36
      if (top < 4) top = Math.min(r.bottom + 6, innerHeight - 40)
      tb.style.top = Math.max(4, top) + "px"
      tb.style.left = Math.max(4, Math.min(r.left, innerWidth - w - 4)) + "px"
    })
  }
  function buildTb() {
    var el = S.sel
    if (!el) { tb.innerHTML = ""; return }
    var btn = function (a, t, title, cls) { return '<button data-a="' + a + '" title="' + title + '"' + (cls ? ' class="' + cls + '"' : "") + ">" + t + "</button>" }
    if (S.editing) {
      tb.innerHTML = btn("b", "<b style='padding:0'>G</b>", "Gras") + btn("i", "<i>I</i>", "Italique") + btn("u", "<u>S</u>", "Souligné") +
        btn("lnk", "🔗", "Lien") + "<i></i>" + btn("endedit", "OK", "Terminer (Échap)")
      return
    }
    var body = el === B
    tb.innerHTML = "<b>" + label(el) + "</b>" + (body ? "" :
      btn("move", "✥", "Déplacer librement (ou glisse l'élément)") + btn("drag", "⋮⋮", "Changer l'ordre dans la page") + btn("parent", "↖", "Sélectionner le parent") + btn("up", "↑", "Monter") + btn("down", "↓", "Descendre") +
      btn("dup", "⧉", "Dupliquer (Ctrl+D)") + btn("del", "✕", "Supprimer (Suppr)"))
  }

  /* ---------- sélection ---------- */
  function pathOf(el) {
    var p = []
    while (el && el !== B) { var par = el.parentElement; if (!par) return null; p.unshift(Array.prototype.indexOf.call(par.children, el)); el = par }
    return p
  }
  function atPath(p) { var el = B; for (var i = 0; i < p.length && el; i++) el = el.children[p[i]]; return el }
  function select(el, silent) {
    if (S.editing && S.editing !== el) endEdit()
    S.sel = el; buildTb(); place()
    if (!silent && S.on.select) S.on.select(el)
  }
  function selectParent() { var s = S.sel; if (s && s !== B && s.parentElement) select(s.parentElement === D.documentElement ? B : s.parentElement) }
  function selectChild() { var s = S.sel; if (s && s.firstElementChild && !isUI(s.firstElementChild)) select(s.firstElementChild) }

  /* ---------- historique ---------- */
  function snap() { return { b: B.innerHTML, c: cssEl.textContent, bs: B.getAttribute("data-s") || "", bt: B.getAttribute("style") || "", t: D.title, p: S.sel ? pathOf(S.sel) : null } }
  function push() {
    var s = snap(), l = S.hist[S.hist.length - 1]
    if (l && l.b === s.b && l.c === s.c && l.t === s.t) return false
    S.hist.push(s); S.fut = []
    while (S.hist.length > 40) S.hist.shift()
    return true
  }
  function commit(lbl) { prune(); writeCss(); push(); place(); buildTb(); if (API.invalidate) API.invalidate(); if (S.on.change) S.on.change(lbl || "") }
  function restore(s) {
    if (S.editing) endEdit(true)
    B.innerHTML = s.b; cssEl.textContent = s.c; D.title = s.t
    s.bs ? B.setAttribute("data-s", s.bs) : B.removeAttribute("data-s")
    s.bt ? B.setAttribute("style", s.bt) : B.removeAttribute("style")
    parseRules()
    S.sel = s.p ? atPath(s.p) : null
    buildTb(); place()
    if (S.on.select) S.on.select(S.sel)
    if (API.invalidate) API.invalidate()
    if (S.on.change) S.on.change("history")
  }
  API.undo = function () { if (S.hist.length < 2) return; S.fut.push(S.hist.pop()); restore(S.hist[S.hist.length - 1]) }
  API.redo = function () { if (!S.fut.length) return; var s = S.fut.pop(); S.hist.push(s); restore(s) }
  API.canUndo = function () { return S.hist.length > 1 }
  API.canRedo = function () { return S.fut.length > 0 }
  API.commit = commit

  /* ---------- édition de texte ---------- */
  function editable(el) {
    if (!el || el === B || VOIDS.test(el.tagName) || el.closest('[data-ndz="produits"]')) return false
    for (var i = 0; i < el.children.length; i++) if (!INLINE.test(el.children[i].tagName)) return false
    return true
  }
  function startEdit(el) {
    if (!editable(el)) return
    if (S.editing) endEdit()
    S.editing = el; S.editHtml = el.innerHTML
    el.setAttribute("contenteditable", "true"); el.setAttribute("spellcheck", "false"); el.focus()
    buildTb(); place()
  }
  function endEdit(skip) {
    var el = S.editing; if (!el) return
    S.editing = null
    el.removeAttribute("contenteditable"); el.removeAttribute("spellcheck")
    if (!skip && el.innerHTML !== S.editHtml) commit("Texte")
    buildTb(); place()
  }
  API.startEdit = function () { startEdit(S.sel) }

  /* ---------- événements ---------- */
  D.addEventListener("click", function (e) {
    if (isUI(e.target)) return
    if (S.editing && S.editing.contains(e.target)) return
    e.preventDefault(); e.stopPropagation()
    if (S.suppress) { S.suppress = false; return }
    if (S.editing) endEdit()
    select(keepOf(e.target) || norm(e.target))
  }, true)
  D.addEventListener("auxclick", function (e) { if (!isUI(e.target)) e.preventDefault() }, true)
  D.addEventListener("submit", function (e) { e.preventDefault() }, true)
  D.addEventListener("dragstart", function (e) { if (!isUI(e.target)) e.preventDefault() }, true)
  D.addEventListener("dblclick", function (e) {
    if (isUI(e.target)) return
    var z = keepOf(e.target)
    if (z) { select(z); flashKeep(z); return } /* pas d'écriture dans une zone vivante */
    var el = norm(e.target); select(el); startEdit(el)
  }, true)
  D.addEventListener("mouseover", function (e) {
    if (isUI(e.target) || S.dragging) return
    var el = keepOf(e.target) || norm(e.target)
    if (el === S.sel || el === B) { hov.style.display = "none"; return }
    box(el, hov)
  }, true)
  D.addEventListener("mouseleave", function () { hov.style.display = "none" })
  D.addEventListener("scroll", place, true)
  addEventListener("resize", place)
  addEventListener("input", function () { place() })
  new MutationObserver(function () { if (S.sel) place() }).observe(B, { childList: true, subtree: true, attributes: true })

  D.addEventListener("keydown", function (e) {
    var mod = e.ctrlKey || e.metaKey, k = e.key.toLowerCase()
    if (S.editing) {
      if (k === "escape") { e.preventDefault(); endEdit() }
      else if (k === "enter" && !e.shiftKey && S.editing.tagName !== "DIV") { e.preventDefault(); D.execCommand("insertLineBreak") }
      else if (mod && k === "s") { e.preventDefault(); endEdit(); S.on.save && S.on.save() }
      return
    }
    if (mod && k === "z") { e.preventDefault(); e.shiftKey ? API.redo() : API.undo() }
    else if (mod && k === "y") { e.preventDefault(); API.redo() }
    else if (mod && k === "s") { e.preventDefault(); S.on.save && S.on.save() }
    else if (mod && k === "d") { e.preventDefault(); API.dup() }
    else if (k === "delete" || k === "backspace") { if (S.sel && S.sel !== B) { e.preventDefault(); API.del() } }
    else if (k === "escape") { S.sel && S.sel !== B ? selectParent() : select(null) }
    else if (k === "enter" && S.sel) { e.preventDefault(); startEdit(S.sel) }
    else if (e.altKey && k === "arrowup") { e.preventDefault(); API.move("up") }
    else if (e.altKey && k === "arrowdown") { e.preventDefault(); API.move("down") }
  }, true)

  tb.addEventListener("mousedown", function (e) {
    var b = e.target.closest("button"); if (!b) return
    e.preventDefault(); e.stopPropagation()
    var a = b.getAttribute("data-a")
    if (a === "drag") return startDrag(e)
    if (a === "move") return startMove(e)
    if (a === "b") D.execCommand("bold"); else if (a === "i") D.execCommand("italic"); else if (a === "u") D.execCommand("underline")
    else if (a === "lnk") { var u = prompt("Adresse du lien (laisser vide pour retirer) :", "https://"); if (u === null) return; u ? D.execCommand("createLink", false, u) : D.execCommand("unlink") }
    else if (a === "endedit") endEdit()
    else if (a === "parent") selectParent()
    else if (a === "up") API.move("up")
    else if (a === "down") API.move("down")
    else if (a === "dup") API.dup()
    else if (a === "del") API.del()
  })

  /* ---------- glisser-déposer depuis la barre d'outils ---------- */
  function startDrag(e0) {
    var el = S.sel; if (!el) return
    S.dragging = true; hov.style.display = "none"
    var target = null, pos = ""
    function mv(e) {
      var t = D.elementFromPoint(e.clientX, e.clientY)
      dropEl.style.display = "none"; target = null
      if (!t || isUI(t)) return
      t = norm(t)
      if (t === el || el.contains(t) || t === B) return
      var r = t.getBoundingClientRect(), y = (e.clientY - r.top) / (r.height || 1)
      var empty = !VOIDS.test(t.tagName) && !t.children.length && !(t.textContent || "").trim()
      pos = empty || (y > .3 && y < .7 && !VOIDS.test(t.tagName) && t.children.length === 0) ? "inside" : y < .5 ? "before" : "after"
      target = t
      dropEl.className = "sf-drop" + (pos === "inside" ? " in" : ""); dropEl.style.display = "block"
      dropEl.style.left = r.left + "px"; dropEl.style.width = r.width + "px"
      if (pos === "inside") { dropEl.style.top = r.top + "px"; dropEl.style.height = r.height + "px" }
      else { dropEl.style.top = (pos === "before" ? r.top - 1 : r.bottom - 1) + "px"; dropEl.style.height = "3px" }
    }
    function up() {
      removeEventListener("mousemove", mv, true); removeEventListener("mouseup", up, true)
      dropEl.style.display = "none"; S.dragging = false
      if (target) API.moveTo(el, target, pos)
    }
    addEventListener("mousemove", mv, true); addEventListener("mouseup", up, true)
  }

  /* ---------- guides d'alignement, déplacement libre, redimensionnement ---------- */
  function lines(el) {
    var xs = [], ys = [], par = el.parentElement || B, pr = par.getBoundingClientRect()
    xs.push(pr.left, pr.right, (pr.left + pr.right) / 2, innerWidth / 2); ys.push(pr.top, pr.bottom, (pr.top + pr.bottom) / 2)
    ;[].slice.call(par.children).forEach(function (c) {
      if (c === el || isUI(c)) return
      var r = c.getBoundingClientRect(); if (!r.width || !r.height) return
      xs.push(r.left, r.right, (r.left + r.right) / 2); ys.push(r.top, r.bottom, (r.top + r.bottom) / 2)
    })
    return { xs: xs, ys: ys }
  }
  function snap1(vals, cands) {
    var best = null
    vals.forEach(function (v) { cands.forEach(function (c) { var d = c - v; if (Math.abs(d) < 7 && (best === null || Math.abs(d) < Math.abs(best.d))) best = { d: d, at: c } }) })
    return best
  }
  function guides(x, y) {
    gv.style.display = x == null ? "none" : "block"; if (x != null) gv.style.left = x + "px"
    gh.style.display = y == null ? "none" : "block"; if (y != null) gh.style.top = y + "px"
  }
  function parseTr(v) { var m = /(-?[\d.]+)px\s+(-?[\d.]+)px/.exec(v || ""); return m ? [+m[1], +m[2]] : [0, 0] }
  function startMove(e0, thr) {
    var el = S.sel; if (!el || el === B) return
    S.dragging = true; hov.style.display = "none"
    var r0 = el.getBoundingClientRect(), tr = parseTr(API.own("translate")), L = lines(el), moved = false
    function mv(e) {
      var dx = e.clientX - e0.clientX, dy = e.clientY - e0.clientY
      if (!moved && Math.abs(dx) + Math.abs(dy) < 4) return
      moved = true
      var sx = snap1([r0.left + dx, r0.right + dx, r0.left + r0.width / 2 + dx], L.xs), sy = snap1([r0.top + dy, r0.bottom + dy, r0.top + r0.height / 2 + dy], L.ys)
      if (e.altKey) { sx = sy = null }
      if (sx) dx += sx.d; if (sy) dy += sy.d
      guides(sx ? sx.at : null, sy ? sy.at : null)
      API.setStyle("translate", Math.round(tr[0] + dx) + "px " + Math.round(tr[1] + dy) + "px", true)
    }
    function up() {
      removeEventListener("mousemove", mv, true); removeEventListener("mouseup", up, true)
      guides(null, null); S.dragging = false
      if (moved) { S.suppress = true; commit("Déplacement libre") }
    }
    addEventListener("mousemove", mv, true); addEventListener("mouseup", up, true)
  }
  var pend = null
  D.addEventListener("mousedown", function (e) {
    pend = null
    if (e.button !== 0 || S.editing || !S.sel || S.sel === B || isUI(e.target) || !S.sel.contains(e.target) || S.sel.hasAttribute("data-ndz")) return
    pend = { clientX: e.clientX, clientY: e.clientY }
  }, true)
  addEventListener("mousemove", function (e) {
    if (!pend || S.dragging) return
    if (Math.abs(e.clientX - pend.clientX) + Math.abs(e.clientY - pend.clientY) > 6 && e.buttons === 1) { var p = pend; pend = null; startMove(p) }
  }, true)
  addEventListener("mouseup", function () { pend = null }, true)
  handles.forEach(function (hd) {
    hd.addEventListener("mousedown", function (e) {
      e.preventDefault(); e.stopPropagation()
      var el = S.sel; if (!el) return
      var k = hd.getAttribute("data-k"), r0 = el.getBoundingClientRect(), L = lines(el), img = /^(IMG|VIDEO)$/.test(el.tagName), moved = false
      S.dragging = true
      function mv(e2) {
        moved = true
        var w = r0.width + (k !== "s" ? e2.clientX - e.clientX : 0), hh = r0.height + (k !== "e" ? e2.clientY - e.clientY : 0), gx = null, gy = null
        if (k !== "s") { var sx = snap1([r0.left + w], L.xs); if (sx && !e2.altKey) { w += sx.d; gx = sx.at } }
        if (k !== "e") { var sy = snap1([r0.top + hh], L.ys); if (sy && !e2.altKey) { hh += sy.d; gy = sy.at } }
        guides(gx, gy)
        if (k !== "s") API.setStyle("width", Math.max(8, Math.round(w)) + "px", true)
        if (k !== "e") API.setStyle(img && k === "se" ? "height" : "height", img && k === "se" ? "auto" : Math.max(8, Math.round(hh)) + "px", true)
        place()
      }
      function up() {
        removeEventListener("mousemove", mv, true); removeEventListener("mouseup", up, true)
        guides(null, null); S.dragging = false; if (moved) commit("Taille")
      }
      addEventListener("mousemove", mv, true); addEventListener("mouseup", up, true)
    })
  })

  /* ---------- actions sur la structure ---------- */
  function newId() { return "s" + (++S.n) }
  function reid(root, from) {
    var map = [root].concat([].slice.call(root.querySelectorAll("[data-s]")))
    map.forEach(function (n) {
      var old = n.getAttribute && n.getAttribute("data-s")
      if (old && S.rules[old]) { var id = newId(); S.rules[id] = JSON.parse(JSON.stringify(S.rules[old])); n.setAttribute("data-s", id) }
      if (n !== root || true) n.removeAttribute && n.removeAttribute("id")
    })
  }
  /* Les zones protégées (bouton d'achat, panier, formulaire, récapitulatif)
     ne se suppriment pas, ne se dupliquent pas : la page cesserait de marcher. */
  function inKeep(el) { return !!(el && el.closest && el.closest("[data-ndz-keep]")) }
  /* zone vivante : on sélectionne l'encadré entier (et non le texte cliqué
     à l'intérieur), sinon le Studio proposerait de réécrire le prix ou le
     bouton, qui viennent des produits. */
  function keepOf(el) { return el && el.closest ? el.closest("[data-ndz-keep]") : null }
  function touched(el) {
    if (!inKeep(el)) return false
    flashKeep(el.closest("[data-ndz-keep]"))
    return true
  }
  function flashKeep(n) {
    if (!n) return
    n.style.outline = "3px solid #E0A32E"
    setTimeout(function () { n.style.outline = "" }, 700)
  }
  API.del = function () {
    var el = S.sel; if (!el || el === B) return
    if (touched(el)) return
    var next = el.nextElementSibling || el.previousElementSibling || el.parentElement
    el.remove(); S.sel = next === D.documentElement ? B : next
    commit("Suppression"); select(S.sel)
  }
  API.dup = function () {
    var el = S.sel; if (!el || el === B) return
    if (touched(el)) return
    var c = el.cloneNode(true); reid(c)
    el.parentNode.insertBefore(c, el.nextSibling)
    commit("Duplication"); select(c)
  }
  API.move = function (dir) {
    var el = S.sel; if (!el || el === B) return
    if (touched(el)) return
    var p = el.parentNode
    if (dir === "up" && el.previousElementSibling) p.insertBefore(el, el.previousElementSibling)
    else if (dir === "down" && el.nextElementSibling) p.insertBefore(el, el.nextElementSibling.nextSibling)
    else return
    commit("Déplacement"); place()
  }
  API.moveTo = function (el, target, pos) {
    if (!el || !target || el === target || el.contains(target)) return
    if (touched(el)) return
    if (inKeep(target)) { flashKeep(keepOf(target)); return }
    if (pos === "before") target.parentNode.insertBefore(el, target)
    else if (pos === "after") target.parentNode.insertBefore(el, target.nextSibling)
    else if (!VOIDS.test(target.tagName)) target.appendChild(el)
    else return
    commit("Déplacement"); select(el)
  }
  API.setTag = function (tag) {
    var el = S.sel; if (!el || el === B || !/^[a-z][a-z0-9]*$/.test(tag)) return
    var n = D.createElement(tag)
    for (var i = 0; i < el.attributes.length; i++) { var a = el.attributes[i]; if (!/^on/i.test(a.name)) n.setAttribute(a.name, a.value) }
    while (el.firstChild) n.appendChild(el.firstChild)
    el.parentNode.replaceChild(n, el); commit("Type"); select(n)
  }
  API.wrapLink = function (href) {
    var el = S.sel; if (!el || el === B) return
    var a = D.createElement("a"); a.setAttribute("href", href || "#"); a.style.cssText = "color:inherit;text-decoration:none;display:contents"
    el.parentNode.insertBefore(a, el); a.appendChild(el); commit("Lien"); select(a)
  }
  API.unwrap = function () {
    var el = S.sel; if (!el || el === B || !el.parentNode) return
    var p = el.parentNode, first = el.firstElementChild
    while (el.firstChild) p.insertBefore(el.firstChild, el)
    el.remove(); commit("Dégrouper"); select(first || p)
  }
  API.group = function () {
    var el = S.sel; if (!el || el === B) return
    var g = D.createElement("div"); el.parentNode.insertBefore(g, el); g.appendChild(el); commit("Groupe"); select(g)
  }

  /* ---------- contenu et attributs ---------- */
  var ATTRS = /^(href|target|rel|src|alt|title|id|class|dir|lang|aria-label|placeholder|name|type|value|loading|width|height|data-fx|data-fx-d|data-fx-hover|data-ndz-buy|data-ndz-pid|data-ndz-video)$/
  var ATTR_OK = { "data-fx": /^(up|left|right|zoom|fade)?$/, "data-fx-hover": /^(lift|zoom|glow)?$/, "data-fx-d": /^\d{0,4}$/, "data-ndz-buy": /^(direct|cart)?$/, "data-ndz-pid": /^\d{0,9}$/, "data-ndz-video": /^([\w-]{11})?$/ }
  API.setText = function (t) { var el = S.sel; if (!el || !editable(el)) return; el.textContent = t; commit("Texte") }
  API.setAttr = function (n, v) {
    var el = S.sel; if (!el || !ATTRS.test(n)) return
    if (ATTR_OK[n] && !ATTR_OK[n].test(String(v == null ? "" : v))) return
    if (n === "data-ndz-video") { v ? el.setAttribute(n, v) : el.setAttribute(n, ""); el.innerHTML = ""; commit("Vidéo"); return }
    if (el.tagName === "IMG" && n === "src") {
      el.removeAttribute("srcset"); el.removeAttribute("sizes")
      if (el.parentElement && el.parentElement.tagName === "PICTURE") el.parentElement.querySelectorAll("source").forEach(function (s) { s.remove() })
    }
    v === "" || v == null ? el.removeAttribute(n) : el.setAttribute(n, v)
    commit("Attribut")
  }
  API.getText = function () { var el = S.sel; return el && editable(el) ? el.textContent : null }
  API.editable = function (el) { return editable(el || S.sel) }

  /* ---------- produits (bloc « Nos produits ») ----------
     Le nom et le prix viennent de la base : l'éditeur les modifie par le
     panneau de droite, puis met à jour ce qui s'affiche ici. */
  API.produit = function (el) {
    var a = el && el.closest ? el.closest("[data-ndz-produit]") : null
    if (!a) return null
    return { id: Number(a.getAttribute("data-ndz-produit")), titre: a.getAttribute("data-titre") || "", prix: Number(a.getAttribute("data-prix") || 0) }
  }
  API.majProduit = function (id, titre, prix, prixTxt) {
    D.querySelectorAll('[data-ndz-produit="' + Number(id) + '"]').forEach(function (a) {
      a.setAttribute("data-titre", titre); a.setAttribute("data-prix", String(prix))
      var t = a.querySelector(".ndzs-t"), p = a.querySelector(".ndzs-p")
      if (t) t.textContent = titre
      if (p && prixTxt) p.textContent = prixTxt
    })
    place()
  }

  /* ---------- styles (par appareil) ---------- */
  API.setDevice = function (d) { S.dev = DEVS[d] || "d"; if (S.on.select) S.on.select(S.sel) }
  API.setStyle = function (prop, val, live) {
    var el = S.sel; if (!el || !/^[a-z-]+$/.test(prop)) return
    val = String(val == null ? "" : val).replace(/[;{}<>]/g, "").trim()
    var id = ensureId(el), r = S.rules[id] || (S.rules[id] = { d: {}, t: {}, m: {} })
    if (val === "") delete r[S.dev][prop]; else r[S.dev][prop] = val
    if (!Object.keys(r.d).length && !Object.keys(r.t).length && !Object.keys(r.m).length) delete S.rules[id]
    writeCss(); place()
    if (!live) commit("Style")
  }
  API.setStyles = function (map) {
    Object.keys(map).forEach(function (k) { API.setStyle(k, map[k], true) })
    commit("Style prêt")
  }
  API.autoMobile = function () {
    if (S.dev !== "m") return -1
    var n = 0, vw = innerWidth
    ;[].slice.call(B.querySelectorAll("*")).slice(0, 4000).forEach(function (el) {
      if (isUI(el) || /^(SCRIPT|STYLE|LINK|META|PATH|g)$/i.test(el.tagName)) return
      var cs = getComputedStyle(el); if (cs.display === "none") return
      var r = el.getBoundingClientRect(); if (!r.width) return
      var set = function (p, v) { var id = ensureId(el), o = S.rules[id] || (S.rules[id] = { d: {}, t: {}, m: {} }); if (!o.m[p]) { o.m[p] = v; n++ } }
      if (r.right > vw + 2 || r.width > vw + 2) {
        if (cs.display === "flex" && cs.flexDirection === "row" && el.children.length > 1) { set("flex-direction", "column"); set("align-items", "stretch") }
        else if (cs.display === "grid") set("grid-template-columns", "1fr")
        else if (/^(IMG|VIDEO|CANVAS)$/.test(el.tagName) || parseFloat(cs.width) > vw) { set("max-width", "100%"); if (el.tagName === "IMG") set("height", "auto") }
      }
      var fs = parseFloat(cs.fontSize)
      if (fs > 44 && !el.children.length && (el.textContent || "").trim()) set("font-size", Math.max(28, Math.round(fs * 0.62)) + "px")
    })
    commit("Adaptation mobile"); return n
  }
  API.own = function (prop) { var el = S.sel, id = el && el.getAttribute("data-s"); return id && S.rules[id] && S.rules[id][S.dev][prop] || "" }
  API.ownAny = function (prop) { var el = S.sel, id = el && el.getAttribute("data-s"), r = id && S.rules[id]; return r ? (r.d[prop] || r.t[prop] || r.m[prop] || "") : "" }
  API.clearStyles = function () {
    var el = S.sel, id = el && el.getAttribute("data-s"); if (!id || !S.rules[id]) return
    S.rules[id][S.dev] = {}; if (!Object.keys(S.rules[id].d).length && !Object.keys(S.rules[id].t).length && !Object.keys(S.rules[id].m).length) delete S.rules[id]
    commit("Styles réinitialisés")
  }
  API.selected = function () { return S.sel }
  API.select = function (el) { select(el) }
  /* survol d'une carte du panneau : on encadre la section dans la page */
  API.preview = function (el) {
    if (!el) return
    var r = el.getBoundingClientRect()
    hov.style.display = "block"
    hov.style.left = r.left + "px"; hov.style.top = r.top + "px"
    hov.style.width = r.width + "px"; hov.style.height = r.height + "px"
  }
  API.previewOff = function () { hov.style.display = "none" }
  API.win = window
  /* recharger la page dans l'atelier (après un réglage qui vient du serveur,
     par exemple la couleur des prix) */
  API.reload = function () { location.reload() }

  /* ---------- blocs à ajouter ---------- */
  function ph(w, h, t) {
    var svg = '<svg xmlns="http://www.w3.org/2000/svg" width="' + w + '" height="' + h + '"><rect width="100%" height="100%" fill="#e9e8ee"/><text x="50%" y="50%" fill="#8d8a99" font-family="sans-serif" font-size="' + Math.round(h / 12) + '" text-anchor="middle" dominant-baseline="middle">' + t + "</text></svg>"
    return "data:image/svg+xml;base64," + btoa(svg)
  }
  var BTN = "display:inline-block;padding:14px 28px;border-radius:999px;background:#111;color:#fff;text-decoration:none;font-weight:600;font-size:16px"
  var SEC = "padding:80px 24px;max-width:1100px;margin:0 auto;box-sizing:border-box"
  var BLOCKS = [
    { id: "h2", g: "Texte", l: "Titre", h: '<h2 style="font-size:40px;line-height:1.15;margin:0 0 16px;font-weight:700">Un titre qui accroche</h2>' },
    { id: "p", g: "Texte", l: "Paragraphe", h: '<p style="font-size:18px;line-height:1.6;margin:0 0 16px;max-width:640px">Écris ici ton texte. Double-clique pour le modifier, change la taille, la couleur et la police dans le panneau de droite.</p>' },
    { id: "btn", g: "Texte", l: "Bouton", h: '<a href="#" style="' + BTN + '">Mon bouton</a>' },
    { id: "wa", g: "Texte", l: "Bouton WhatsApp", h: '<a href="https://wa.me/213000000000" target="_blank" rel="noopener" style="' + BTN + ";background:#25d366;color:#08331a" + '">Écrire sur WhatsApp</a>' },
    { id: "img", g: "Médias", l: "Image", h: '<img src="' + ph(1200, 700, "Image") + '" alt="" style="width:100%;height:auto;display:block;border-radius:16px">' },
    { id: "gal", g: "Médias", l: "Galerie 3 images", h: '<div style="display:flex;gap:16px;flex-wrap:wrap;padding:24px"><img src="' + ph(600, 600, "1") + '" alt="" style="flex:1 1 220px;min-width:0;width:100%;border-radius:12px"><img src="' + ph(600, 600, "2") + '" alt="" style="flex:1 1 220px;min-width:0;width:100%;border-radius:12px"><img src="' + ph(600, 600, "3") + '" alt="" style="flex:1 1 220px;min-width:0;width:100%;border-radius:12px"></div>' },
    { id: "sec", g: "Mise en page", l: "Section", h: '<section style="' + SEC + '"><h2 style="font-size:36px;margin:0 0 12px">Titre de section</h2><p style="font-size:18px;line-height:1.6;margin:0">Contenu de la section.</p></section>' },
    { id: "hero", g: "Mise en page", l: "Bandeau (hero)", h: '<section style="background:#14131a;color:#fff;padding:120px 24px;text-align:center"><h1 style="font-size:56px;line-height:1.1;margin:0 0 16px">Ton message principal</h1><p style="font-size:20px;opacity:.8;margin:0 auto 28px;max-width:560px">Une phrase pour expliquer ce que tu proposes.</p><a href="#" style="' + BTN + ";background:#fff;color:#111" + '">Commencer</a></section>' },
    { id: "c2", g: "Mise en page", l: "2 colonnes", h: '<div style="display:flex;gap:32px;flex-wrap:wrap;padding:64px 24px;max-width:1100px;margin:0 auto;box-sizing:border-box;align-items:center"><div style="flex:1 1 320px;min-width:0"><h2 style="font-size:36px;margin:0 0 12px">Titre</h2><p style="font-size:18px;line-height:1.6;margin:0">Texte à côté de l\'image.</p></div><div style="flex:1 1 320px;min-width:0"><img src="' + ph(900, 600, "Image") + '" alt="" style="width:100%;border-radius:16px;display:block"></div></div>' },
    { id: "c3", g: "Mise en page", l: "3 cartes", h: '<div style="display:flex;gap:20px;flex-wrap:wrap;padding:64px 24px;max-width:1100px;margin:0 auto;box-sizing:border-box">' + [1, 2, 3].map(function (n) { return '<div style="flex:1 1 260px;min-width:0;padding:28px;border:1px solid #e5e4ea;border-radius:16px"><h3 style="margin:0 0 8px;font-size:22px">Avantage ' + n + '</h3><p style="margin:0;line-height:1.6;opacity:.75">Une courte description.</p></div>' }).join("") + "</div>" },
    { id: "tem", g: "Mise en page", l: "Témoignage", h: '<figure style="margin:0 auto;padding:64px 24px;max-width:720px;text-align:center"><blockquote style="font-size:26px;line-height:1.4;margin:0 0 16px">« Un avis client qui rassure. »</blockquote><figcaption style="opacity:.7">Prénom N. — Ville</figcaption></figure>' },
    { id: "faq", g: "Mise en page", l: "Questions (FAQ)", h: '<div style="max-width:760px;margin:0 auto;padding:64px 24px">' + [1, 2, 3].map(function (n) { return '<details style="border-bottom:1px solid #e5e4ea;padding:16px 0"><summary style="font-size:18px;font-weight:600;cursor:pointer">Question ' + n + ' ?</summary><p style="margin:10px 0 0;line-height:1.6;opacity:.8">La réponse.</p></details>' }).join("") + "</div>" },
    { id: "ctc", g: "Mise en page", l: "Contact", h: '<section style="' + SEC + ';text-align:center"><h2 style="font-size:36px;margin:0 0 12px">Contact</h2><p style="font-size:18px;margin:0 0 6px">📞 0555 00 00 00</p><p style="font-size:18px;margin:0">✉️ contact@exemple.dz</p></section>' },
    { id: "hr", g: "Détails", l: "Séparateur", h: '<hr style="border:0;border-top:1px solid #d9d8df;margin:32px auto;max-width:1100px">' },
    { id: "sp", g: "Détails", l: "Espace vide", h: '<div style="height:60px"></div>' },
    { id: "buy", g: "Boutique", l: "Bouton acheter", h: '<a href="#" data-ndz-buy="direct" data-ndz-pid="" style="' + BTN + ";background:#e11d48" + '">Acheter maintenant</a>' },
    { id: "cartb", g: "Boutique", l: "Bouton panier", h: '<a href="#" data-ndz-buy="cart" data-ndz-pid="" style="' + BTN + '">Ajouter au panier</a>' },
    { id: "form", g: "Boutique", l: "Formulaire contact", h: '<form data-ndz-form style="max-width:560px;margin:0 auto;padding:56px 24px;display:grid;gap:12px;box-sizing:border-box"><h2 style="font-size:32px;margin:0 0 8px">Écris-nous</h2><input name="name" placeholder="Ton nom" required style="padding:14px;border:1px solid #d9d7e2;border-radius:10px;font:inherit"><input name="phone" placeholder="Téléphone" style="padding:14px;border:1px solid #d9d7e2;border-radius:10px;font:inherit"><textarea name="message" rows="4" placeholder="Ton message" required style="padding:14px;border:1px solid #d9d7e2;border-radius:10px;font:inherit"></textarea><input name="website" tabindex="-1" autocomplete="off" aria-hidden="true" style="position:absolute;left:-9999px"><button type="submit" style="' + BTN + ';border:0;cursor:pointer">Envoyer</button></form>' },
    { id: "vid", g: "Médias", l: "Vidéo YouTube", h: '<div data-ndz-video="" style="position:relative;aspect-ratio:16/9;width:100%;max-width:900px;margin:32px auto;border-radius:16px;overflow:hidden"></div>' },
    { id: "prod", g: "Boutique", l: "Grille de produits", h: '<div data-ndz="produits"></div>', unique: true },

    /* ---- prêts à l'emploi : trois blocs finis, à poser tels quels ----
       Un débutant n'a pas à dessiner : il choisit, puis il remplace les mots.
       Tout est en styles en ligne et se replie tout seul sur téléphone. */
    { id: "bnr", g: "Prêts à l'emploi", l: "Bandeau d'annonce", h: '<div style="background:#111;color:#fff;padding:18px 22px;display:flex;flex-wrap:wrap;gap:14px;align-items:center;justify-content:center;text-align:center"><p style="margin:0;font-size:17px;line-height:1.4"><b>Livraison dans les 58 wilayas</b> — paiement à la livraison</p><a href="#produits" style="display:inline-block;padding:10px 20px;border-radius:999px;background:#fff;color:#111;text-decoration:none;font-weight:600;font-size:14px;white-space:nowrap">Commander</a></div>' },
    { id: "avis", g: "Prêts à l'emploi", l: "Avis clients", h: '<section style="padding:72px 22px;max-width:1080px;margin:0 auto;box-sizing:border-box"><h2 style="font-size:clamp(26px,4vw,36px);line-height:1.2;margin:0 0 8px;text-align:center">Ils ont commandé</h2><p style="margin:0 auto 34px;max-width:520px;text-align:center;opacity:.7;font-size:16px;line-height:1.5">Trois clients, trois villes.</p><div style="display:flex;flex-wrap:wrap;gap:18px">' + [["Amina", "Blida", "Livraison en deux jours, la robe est exactement comme sur la photo."], ["Yacine", "Oran", "J'ai payé à la réception. Emballage soigné, rien à dire."], ["Nesrine", "Constantine", "Réponse rapide sur WhatsApp, échange fait sans discuter."]].map(function (a) { return '<figure style="flex:1 1 260px;min-width:0;margin:0;padding:24px;border:1px solid #e7e6ec;border-radius:16px;background:#fff"><div style="color:#f5a623;font-size:17px;letter-spacing:2px;margin-bottom:10px" aria-label="5 étoiles sur 5">★★★★★</div><blockquote style="margin:0 0 16px;font-size:16px;line-height:1.55">« ' + a[2] + ' »</blockquote><figcaption style="display:flex;align-items:center;gap:10px"><span style="width:34px;height:34px;border-radius:50%;background:#111;color:#fff;display:grid;place-items:center;font-size:14px;font-weight:600;flex:none">' + a[0].charAt(0) + '</span><span style="font-size:14px;line-height:1.3"><b>' + a[0] + '</b><br><span style="opacity:.65">' + a[1] + '</span></span></figcaption></figure>' }).join("") + "</div></section>" },
    { id: "galp", g: "Prêts à l'emploi", l: "Galerie de 3 photos", h: '<section style="padding:72px 22px;max-width:1080px;margin:0 auto;box-sizing:border-box"><h2 style="font-size:clamp(26px,4vw,36px);line-height:1.2;margin:0 0 8px;text-align:center">En images</h2><p style="margin:0 auto 30px;max-width:520px;text-align:center;opacity:.7;font-size:16px;line-height:1.5">Cliquez sur une photo pour la remplacer.</p><div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:14px">' + [1, 2, 3].map(function (n) { return '<img src="' + ph(800, 800, "Photo " + n) + '" alt="" style="width:100%;height:auto;aspect-ratio:1/1;object-fit:cover;border-radius:14px;display:block">' }).join("") + "</div></section>" },
  ]
  API.blocks = BLOCKS.map(function (b) { return { id: b.id, group: b.g, label: b.l } })
  /* Poser une photo que le marchand vient de choisir : on crée un bloc image
     avec SA photo (et non un cadre vide qu'il faudrait remplacer ensuite). */
  API.insertImage = function (url) {
    if (!url) return null
    var n = API.insert("img")
    if (n && n.tagName === "IMG") { n.setAttribute("src", url); n.setAttribute("alt", "") }
    return n
  }

  API.insert = function (id, inside) {
    var b = BLOCKS.filter(function (x) { return x.id === id })[0]; if (!b) return
    /* le bloc est unique et déjà là : on le montre au lieu d'en poser un second */
    if (b.unique && B.querySelector('[data-ndz="produits"]')) {
      var ex = B.querySelector('[data-ndz="produits"]')
      select(ex); ex.scrollIntoView({ block: "center" })
      if (S.on.insert) S.on.insert(ex)
      return ex
    }
    var t = D.createElement("div"); t.innerHTML = b.h; var n = t.firstElementChild
    var s = S.sel
    if (!s || s === B) B.appendChild(n)
    else if (inside && !VOIDS.test(s.tagName)) s.appendChild(n)
    else s.parentNode.insertBefore(n, s.nextSibling)
    /* on ne pose pas un bloc « dans le vide » : la page se met à jour, le bloc
       est sélectionné, et le panneau de gauche montre tout de suite la partie
       qui vient d'arriver (sinon le marchand croit que rien ne s'est passé). */
    commit("Ajout"); select(n); n.scrollIntoView({ block: "center", behavior: "smooth" })
    if (S.on.insert) S.on.insert(n)
    return n
  }

  /* ---------- l'assistant écrit la page ----------
     Trois réponses du marchand deviennent les textes du haut de page : le
     grand titre, la phrase juste en dessous, le bouton, puis la première
     partie qui suit. On ne touche à rien d'autre, et tout passe par commit :
     Ctrl+Z rend la page exactement comme avant. */
  API.fill = function (plan) {
    if (!plan || !plan.hero) return 0
    var n = 0
    /* Un texte remplaçable : une seule suite de mots, sans image ni bouton
       dedans — sinon on effacerait la mise en page du modèle. */
    var leafText = function (el) {
      if (!el || el.nodeType !== 1 || el.children.length) return false
      if (isUI(el) || (el.closest && el.closest("[data-ndz]"))) return false
      var cs = getComputedStyle(el)
      if (cs.display === "none" || cs.visibility === "hidden" || +cs.opacity < 0.05) return false
      if (cs.position === "fixed") return false
      var r = el.getBoundingClientRect()
      return !!r.width && !!r.height && (el.textContent || "").trim().length > 1
    }
    var put = function (el, txt) {
      if (!el || !txt || (el.textContent || "").trim() === String(txt).trim()) return false
      el.textContent = txt; n++; return true
    }
    /* Le grand titre : le plus gros texte visible de la page, quel que soit le
       modèle (tous n'utilisent pas <h1>). C'est ce que le client voit en premier. */
    var all = [].slice.call(B.querySelectorAll("h1,h2,h3,p,div,span,a,strong,b")).filter(leafText)
    var score = all.map(function (el) {
      var cs = getComputedStyle(el)
      return { el: el, fs: parseFloat(cs.fontSize) || 0, y: el.getBoundingClientRect().top + scrollY, txt: (el.textContent || "").trim() }
    }).filter(function (o) { return o.txt.length > 2 })
    var titles = score.filter(function (o) { return o.fs >= 22 }).sort(function (a, b) { return a.y - b.y || b.fs - a.fs })
    var top = titles[0]
    if (top) put(top.el, plan.hero.title)
    /* La phrase juste en dessous du grand titre. */
    if (top) {
      var under = score.filter(function (o) {
        return o.el !== top.el && o.y > top.y - 2 && o.y < top.y + 420 && o.fs >= 13 && o.fs < 22 && o.txt.length > 12
      }).sort(function (a, b) { return a.y - b.y })[0]
      if (under) put(under.el, plan.hero.text)
      /* Le premier bouton de ce haut de page. */
      var cta = [].slice.call(B.querySelectorAll("a,button")).filter(function (a) {
        if (isUI(a) || !(a.textContent || "").trim()) return false
        if (a.closest && a.closest("[data-ndz]")) return false
        var r = a.getBoundingClientRect()
        return r.width > 20 && r.height > 14 && r.top + scrollY < top.y + 520
      })[0]
      if (cta) put(cta, plan.hero.cta)
    }
    /* La première grande partie qui suit : « Pourquoi commander ici ». */
    if (plan.about && top) {
      var next = titles.filter(function (o) { return o.y > top.y + 120 })[0]
      if (next) {
        put(next.el, plan.about.title)
        var p2 = score.filter(function (o) {
          return o.el !== next.el && o.y > next.y - 2 && o.y < next.y + 320 && o.fs >= 12 && o.fs < 22 && o.txt.length > 20
        }).sort(function (a, b) { return a.y - b.y })[0]
        if (p2) put(p2.el, plan.about.text)
      }
    }
    /* Page sans texte (modèle fait d'images) : on pose un vrai haut de page
       plutôt que de ne rien faire. Le marchand a alors des mots à lui, qu'il
       peut corriger mot par mot. */
    if (!n) {
      var sec = D.createElement("section")
      sec.setAttribute("style", "padding:64px 22px 56px;max-width:960px;margin:0 auto;box-sizing:border-box;text-align:center")
      var h1 = D.createElement("h1")
      h1.setAttribute("style", "font-size:clamp(30px,4.6vw,52px);line-height:1.12;margin:0 0 14px;font-weight:700")
      h1.textContent = plan.hero.title
      var sub = D.createElement("p")
      sub.setAttribute("style", "font-size:clamp(16px,2vw,20px);line-height:1.55;margin:0 auto 26px;max-width:620px;opacity:.8")
      sub.textContent = plan.hero.text
      var btn = D.createElement("a")
      btn.setAttribute("href", "#produits")
      btn.setAttribute("style", "display:inline-block;padding:14px 28px;border-radius:999px;background:#111;color:#fff;text-decoration:none;font-weight:600;font-size:16px")
      btn.textContent = plan.hero.cta
      sec.appendChild(h1); sec.appendChild(sub); sec.appendChild(btn)
      /* on le pose en haut du contenu : juste après l'en-tête du modèle, ou au
         début de <main> quand il y en a un. Jamais à la fin de la page. */
      var head = B.querySelector("header")
      var main = B.querySelector("main")
      if (head && head.parentNode === B) B.insertBefore(sec, head.nextElementSibling)
      else if (main) main.insertBefore(sec, main.firstElementChild)
      else if (head && head.parentNode) head.parentNode.insertBefore(sec, head.nextElementSibling)
      else B.insertBefore(sec, B.firstElementChild)
      n = 3
      commit("Haut de page écrit par l'assistant")
      select(sec)
      sec.scrollIntoView({ block: "center" })
      return n
    }
    commit("Textes écrits par l'assistant")
    return n
  }

  /* ---------- couleurs et polices du site entier ---------- */
  var COL = /#(?:[0-9a-fA-F]{8}|[0-9a-fA-F]{6}|[0-9a-fA-F]{3})\b|rgba?\(\s*\d+[\s,]+\d+[\s,]+\d+(?:\s*[,/]\s*[\d.]+%?)?\s*\)/g
  var FNT = /font-family\s*:\s*([^;}]+)/g
  function ck(c) { return c.toLowerCase().replace(/\s+/g, "") }
  function styleNodes() { return [].slice.call(D.querySelectorAll("style")).filter(function (s) { return !s.hasAttribute("data-studio-ui") }) }
  function each(fn) {
    styleNodes().forEach(function (s) { var t = s.textContent, n = fn(t); if (n !== t) s.textContent = n })
    D.querySelectorAll("[style]").forEach(function (e) { if (isUI(e)) return; var t = e.getAttribute("style"), n = fn(t); if (n !== t) e.setAttribute("style", n) })
  }
  API.scanColors = function () {
    var c = {}
    each(function (t) { (t.match(COL) || []).forEach(function (m) { var k = ck(m); c[k] = (c[k] || 0) + 1 }); return t })
    return Object.keys(c).filter(function (k) { return k !== "transparent" }).sort(function (a, b) { return c[b] - c[a] }).slice(0, 16).map(function (k) { return { c: k, n: c[k] } })
  }
  API.replaceColor = function (a, b) {
    a = ck(a); each(function (t) { return t.replace(COL, function (m) { return ck(m) === a ? b : m }) })
    parseRules(); commit("Couleur du site")
  }
  function fam(v) { return v.replace(/!important/g, "").split(",")[0].replace(/["']/g, "").trim() }
  API.scanFonts = function () {
    var c = {}
    each(function (t) { var m; FNT.lastIndex = 0; while ((m = FNT.exec(t))) { var f = fam(m[1]); if (f && !/^(inherit|initial|var\(|unset)/.test(f)) c[f] = (c[f] || 0) + 1 } return t })
    return Object.keys(c).sort(function (a, b) { return c[b] - c[a] }).slice(0, 12).map(function (k) { return { f: k, n: c[k] } })
  }
  /* Une seule police pour tout le site : on remplace d'un coup toutes les
     polices du modèle, sauf les polices d'icônes (sinon les petits symboles
     deviennent des lettres). L'historique enregistre l'état d'avant, donc le
     bouton « Annuler » ramène les polices d'origine. */
  var ICON_FONT = /icon|swiper|awesome|glyph|material/i
  API.setSiteFont = function (name) {
    if (!name) return
    each(function (t) {
      return t.replace(FNT, function (m, v) {
        var f = fam(v)
        if (!f || ICON_FONT.test(f)) return m
        return "font-family:'" + name + "',system-ui,sans-serif"
      })
    })
    parseRules(); commit("Police du site")
  }
  API.replaceFont = function (a, b) {
    each(function (t) { return t.replace(FNT, function (m, v) { return fam(v) === a ? "font-family:'" + b + "',system-ui,sans-serif" : m }) })
    parseRules(); commit("Police du site")
  }

  /* ---------- découpe en sections, et calques de chaque section ----------
     Sert à l'onglet « Sections » : quel que soit le thème (les 16 modèles
     fournis ou un modèle importé), la page est découpée ici, une seule fois,
     et le panneau ne fait qu'afficher. Deux familles de thèmes existent :
       - ceux qui balisent leurs blocs (<section>, <header>, <footer>) ;
       - ceux qui empilent des <div> : on descend les conteneurs jusqu'au
         niveau où la page se découpe vraiment. */
  var INLINE_EL = /^(SPAN|B|I|EM|STRONG|A|BR|SMALL|SUB|SUP|U|MARK|S|CODE|WBR|TIME|FONT)$/
  var SKIP_EL = /^(SCRIPT|STYLE|LINK|META|NOSCRIPT|TEMPLATE|IFRAME|SVG|CANVAS|VIDEO|AUDIO|SOURCE|INPUT|SELECT|TEXTAREA|HR)$/
  var TEXTY_EL = /^(H1|H2|H3|H4|H5|H6|P|LI|BLOCKQUOTE|FIGCAPTION|ADDRESS|CITE|LABEL|SPAN|SMALL|STRONG|EM|B|I|TD|TH|DT|DD|SUMMARY|DIV|TIME|HGROUP)$/
  var dynEl = function (el) { return !!(el.closest && el.closest("[data-ndz]")) }
  /* un bloc « visible » : ni overlay fixe, ni panneau hors écran, ni aria-hidden */
  function vis(el, parent) {
    if (!el || el.nodeType !== 1) return false
    if (el.hasAttribute("hidden") || el.getAttribute("aria-hidden") === "true") return false
    var cs = getComputedStyle(el)
    if (cs.display === "none" || cs.visibility === "hidden" || +cs.opacity < 0.05) return false
    if (cs.position === "fixed") return false
    var r = el.getBoundingClientRect()
    if (r.height < 60 || r.width < 80) return false
    if (r.left < -80 || r.right < 80) return false
    /* un tiroir latéral hors flux (position absolute collée à droite) n'est pas une section */
    if (cs.position === "absolute" && parent) {
      var pr = parent.getBoundingClientRect()
      if (r.height > pr.height * 1.5) return false
    }
    return true
  }
  function innerOf(el) {
    return [].slice.call(el.children).filter(function (c) {
      return !SKIP_EL.test(c.tagName) && !c.hasAttribute("data-studio-ui") && !dynEl(c)
    })
  }
  /* texte lisible d'un bloc : on ignore les doublons aria-hidden (Wix, Shopify…) */
  function plain(el) {
    if (!el) return ""
    var hid = el.querySelectorAll ? el.querySelectorAll('[aria-hidden="true"]') : []
    if (!hid.length) return (el.textContent || "").replace(/\s+/g, " ").trim()
    var c = el.cloneNode(true)
    c.querySelectorAll('[aria-hidden="true"]').forEach(function (n) { n.remove() })
    return (c.textContent || "").replace(/\s+/g, " ").trim()
  }
  /* enveloppes : on descend tant qu'il n'y a qu'un seul enfant qui occupe le bloc */
  function unwrap(el) {
    for (var i = 0; i < 12; i++) {
      var ks = innerOf(el).filter(function (c) { return vis(c, el) })
      if (ks.length !== 1) return el
      var r = el.getBoundingClientRect(), kr = ks[0].getBoundingClientRect()
      if (kr.height < (r.height || 1) * 0.9 || kr.width < (r.width || 1) * 0.6) return el
      el = ks[0]
    }
    return el
  }
  API.text = plain
  /* cache : la découpe et les calques sont recalculés seulement quand la page
     change (commit), pas à chaque re-rendu du panneau */
  var secCache = null, layerCache = new WeakMap()
  function invalidate() { secCache = null; layerCache = new WeakMap() }
  API.invalidate = invalidate
  API.sections = function () {
    if (secCache) return secCache
    /* 1. les blocs balisés (<section>, <header>, <footer>) les plus externes */
    var tagged = [].slice.call(B.querySelectorAll("section, header, footer")).filter(function (el) {
      return !dynEl(el) && !isUI(el) && vis(el, el.parentElement)
    })
    tagged = tagged.filter(function (el) {
      return !tagged.some(function (o) { return o !== el && o.contains(el) })
    })
    /* 2. descente dans les conteneurs (thèmes sans balises de section) */
    var walk = function () {
      var el = B
      for (var i = 0; i < 12; i++) {
        var ks = innerOf(el).filter(function (c) { return vis(c, el) })
        if (ks.length >= 2) return ks.map(unwrap)
        if (!ks.length) return innerOf(B).filter(function (c) { return vis(c, B) })
        el = ks[0]
      }
      return [el]
    }
    var list = tagged
    /* une <img> n'est pas une section : si la descente aboutit à des images ou
       des vidéos nues, c'est qu'on est allé trop bas — on remonte d'un cran. */
    var voids = function (ls) {
      return ls.length && ls.filter(function (el) { return /^(IMG|VIDEO|PICTURE)$/.test(el.tagName) }).length >= ls.length / 2
    }
    /* moins de 3 blocs balisés : c'est souvent une enveloppe (en-tête + contenu + pied).
       On garde alors la descente si elle découpe plus finement. */
    if (list.length < 3) {
      var d = walk()
      if (d.length > list.length || voids(list)) list = d
    }
    if (voids(list)) {
      /* on prend les enfants du parent commun, qui sont de vrais blocs */
      var par = list[0] && list[0].parentElement
      if (par && par !== B) {
        var up = innerOf(par).filter(function (c) { return vis(c, par) })
        if (up.length >= 2 && !voids(up)) list = up
      }
    }
    /* 3. blocs de repli remplis de CSS (fréquents dans les thèmes importés) */
    list = list.filter(function (el) {
      var t = (el.textContent || "").trim()
      return !(/\{[^{}]*:[^{}]*\}/.test(t.slice(0, 200)) && t.length < 400)
    })
    if (!list.length) list = innerOf(B)
    /* 3 bis. couverture : si les blocs trouvés ne représentent qu'une petite
       partie de la hauteur de la page (thèmes où le contenu vit dans un
       conteneur positionné, exports d'éditeurs en ligne), on cherche le
       niveau du DOM qui contient le plus de contenu et on prend ses enfants. */
    var cover = function (ls) {
      var h = document.documentElement.scrollHeight || 1
      return ls.reduce(function (a, el) { return a + el.getBoundingClientRect().height }, 0) / h
    }
    if (cover(list) < 0.55) {
      var best = null, bestTxt = -1
      ;[].slice.call(B.querySelectorAll("div,main,section,article")).slice(0, 4000).forEach(function (el) {
        if (dynEl(el) || isUI(el)) return
        var ks = innerOf(el).filter(function (c) { return vis(c, el) })
        if (ks.length < 3 || ks.length > 30) return
        var txt = ks.reduce(function (a, c) { return a + (c.textContent || "").trim().length }, 0)
        if (txt > bestTxt && cover(ks) > cover(list)) { bestTxt = txt; best = ks }
      })
      if (best) list = best.map(unwrap)
    }
    /* 4. un bloc plus haut que 2,5 écrans (page entière dans un seul div) est
       redécoupé en ses enfants visibles : le marchand retrouve des sections
       utilisables même sur un thème très long. */
    var vh = innerHeight || 800
    for (var pass = 0; pass < 3; pass++) {
      var finer = []
      list.forEach(function (el) {
        var r = el.getBoundingClientRect()
        var ks = r.height > vh * 2.5 ? innerOf(el).filter(function (c) { return vis(c, el) }) : []
        if (ks.length >= 2) ks.forEach(function (k) { finer.push(unwrap(k)) })
        else finer.push(el)
      })
      if (finer.length === list.length) break
      list = finer
    }
    /* 5. nettoyage : une section vide de calques est redécoupée en ses enfants,
       une bande minuscule est rattachée à sa voisine, et un bloc encore trop
       grand est découpé si ses enfants couvrent l'essentiel de sa hauteur. */
    var count = function (el) {
      var L = API.layers(el)
      return L.texts.length + L.imgs.length + L.links.length
    }
    /* une liste mêlant images nues et vrais blocs : on garde les blocs, les
       images restant accessibles comme calques de leur voisin */
    var solids = list.filter(function (el) { return !/^(IMG|VIDEO|PICTURE)$/.test(el.tagName) })
    if (solids.length >= 2 && solids.length < list.length) list = solids
    /* plusieurs blocs empilés au même endroit (position: sticky, étapes d'une
       animation) : on ne garde que celui qui porte le contenu visible */
    var seen = {}
    list = list.filter(function (el) {
      var r = el.getBoundingClientRect()
      if (getComputedStyle(el).position === "sticky") return true
      var k = [Math.round(r.top), Math.round(r.left), Math.round(r.width), Math.round(r.height)].join(":")
      if (seen[k] && count(el) <= seen[k]) return false
      if (!seen[k] || count(el) > seen[k]) seen[k] = count(el)
      return true
    })
    var clean = []
    for (var i = 0; i < list.length; i++) {
      var el = list[i]
      if (count(el) === 0) {
        var ks = innerOf(el).filter(function (c) { return vis(c, el) })
        var withLayers = ks.filter(function (c) { return count(c) > 0 })
        if (withLayers.length >= 2) { withLayers.forEach(function (k) { clean.push(k) }); continue }
        if (withLayers.length === 1) { clean.push(withLayers[0]); continue }
        /* rien à éditer là-dedans : on ne montre pas une carte morte, sauf
           pour l'en-tête et le pied de page (on y garde les réglages de style) */
        if (el.tagName !== "HEADER" && el.tagName !== "FOOTER") continue
      }
      clean.push(el)
    }
    /* bandes trop courtes : on les rattache à la section suivante (ou précédente) */
    var merged = []
    clean.forEach(function (el) {
      var r = el.getBoundingClientRect()
      var short = r.height < 90 && el.tagName !== "HEADER" && el.tagName !== "FOOTER"
      if (short && merged.length) return            /* avalée par la précédente */
      if (short && !merged.length) { merged.push(el); return }
      merged.push(el)
    })
    /* blocs encore plus hauts que 2,5 écrans : on découpe si les enfants
       couvrent au moins 60 % de la hauteur du bloc */
    var vh2 = innerHeight || 800, final = []
    merged.forEach(function (el) {
      var r = el.getBoundingClientRect()
      if (r.height > vh2 * 2.5) {
        var ks = innerOf(el).filter(function (c) { return vis(c, el) })
        var cover = ks.reduce(function (a, c) { return a + c.getBoundingClientRect().height }, 0) / (r.height || 1)
        if (ks.length >= 2 && cover >= 0.6) { ks.forEach(function (k) { final.push(k) }); return }
        /* un seul enfant : on descend dedans tant qu'il porte le contenu */
        if (ks.length === 1) {
          var deep = unwrap(ks[0])
          if (deep !== el) { final.push(deep); return }
        }
      }
      final.push(el)
    })
    secCache = final.sort(function (a, b) { return a.compareDocumentPosition(b) & 4 ? -1 : 1 })
    return secCache
  }
  /* un texte caché pour les lecteurs d'écran n'est pas un calque utile */
  function srOnly(el) {
    var r = el.getBoundingClientRect()
    if (r.width < 3 || r.height < 3) return true
    var cs = getComputedStyle(el)
    return cs.clipPath === "inset(50%)" || (cs.position === "absolute" && cs.overflow === "hidden" && r.width <= 2)
  }
  /* les calques d'une section : textes, photos, boutons et liens */
  API.layers = function (sec) {
    var hit = layerCache.get(sec)
    if (hit) return hit
    var all = [].slice.call(sec.querySelectorAll("*")).filter(function (el) {
      return !dynEl(el) && !isUI(el)
    })
    var texts = [], keep = []
    all.forEach(function (el) {
      if (texts.length >= 90 || !TEXTY_EL.test(el.tagName)) return
      if (el.getAttribute("aria-hidden") === "true") return
      /* un lien « pur libellé » est déjà dans « Boutons et liens » : pas de doublon.
         Mais dans une carte produit, le lien enveloppe une image et des textes :
         ces textes doivent rester éditables (sinon le titre du produit n'a pas
         de calque, comme sur le modèle VOID). */
      var lien = el.closest("a,button")
      if (lien && [].slice.call(lien.children).every(function (c) { return INLINE_EL.test(c.tagName) })) return
      if (el.querySelector("a,button")) return
      for (var i = 0; i < el.children.length; i++) if (!INLINE_EL.test(el.children[i].tagName)) return
      if (!plain(el) || srOnly(el)) return
      texts.push(el); keep.push(el)
    })
    texts = texts.filter(function (el) {
      for (var p = el.parentElement; p && p !== sec; p = p.parentElement) if (keep.indexOf(p) >= 0) return false
      return true
    })
    var links = all.filter(function (el) {
      return (el.tagName === "A" || el.tagName === "BUTTON") && plain(el) && plain(el).length < 60 && !srOnly(el)
    }).slice(0, 24)
    var imgs = all.filter(function (el) {
      return el.tagName === "IMG" && (el.getAttribute("src") || el.currentSrc)
    }).slice(0, 24)
    /* Les photos posées en fond (très fréquent dans les modèles importés) ne
       sont pas des <img> : sans cette liste, le marchand ne pouvait ni les
       voir ni les remplacer — « des images ne s'affichent pas ». */
    var bgs = []
    if (sec && sec !== B) {
      var NOBG = /^(SPAN|B|I|EM|STRONG|SMALL|SUB|SUP|U|MARK|CODE|WBR|TIME|FONT|LABEL|BR|SCRIPT|STYLE|LINK|META|NOSCRIPT|TEMPLATE|SVG|PATH|IMG|SOURCE|VIDEO|AUDIO|INPUT|TEXTAREA|SELECT|OPTION|HR)$/
      /* Dans les modèles importés, la photo de fond est souvent posée sur
         l'enveloppe qui entoure la section, pas sur la section elle-même :
         on la regarde aussi, mais seulement si cette enveloppe ne contient
         qu'elle (sinon la même photo apparaîtrait dans dix sections). */
      var around = [sec].concat([].slice.call(sec.querySelectorAll("*")))
      var par = sec.parentElement
      if (par && par !== B && par !== D.documentElement && innerOf(par).length === 1 && vis(sec, par)) around.unshift(par)
      around.forEach(function (el) {
        if (bgs.length >= 12 || NOBG.test(el.tagName) || isUI(el) || dynEl(el)) return
        if (el.getAttribute("aria-hidden") === "true") return
        var bi = getComputedStyle(el).backgroundImage
        if (!bi || bi === "none" || !/url\(/.test(bi)) return
        var r = el.getBoundingClientRect()
        if (r.width < 40 || r.height < 40) return
        bgs.push(el)
      })
    }
    var out = { texts: texts.slice(0, 60), imgs: imgs, bgs: bgs, links: links }
    layerCache.set(sec, out)
    return out
  }
  /* photo de fond : adresse lue dans le style calculé, remplacement en style
     en ligne (donc enregistré avec la page, et visible sur le site public) */
  function bgUrl(el) {
    var m = /url\(\s*["']?([^"')]+)["']?\s*\)/.exec(getComputedStyle(el).backgroundImage || "")
    return m ? m[1] : ""
  }
  API.bgUrl = function (el) { return el ? bgUrl(el) : "" }
  API.clearBg = function (el) {
    if (!el) return
    select(el)
    var id = ensureId(el), r = S.rules[id] || (S.rules[id] = { d: {}, t: {}, m: {} })
    /* « none » et non « supprimé » : la photo vient souvent de la feuille du
       modèle, qu'on ne réécrit pas. Le réglage du Studio passe au-dessus. */
    r[S.dev]["background-image"] = "none"
    if (!r[S.dev]["background-size"]) r[S.dev]["background-size"] = "auto"
    writeCss(); commit("Photo de fond retirée")
  }
  API.setBg = function (el, url) {
    if (!el || !url) return
    select(el)
    var id = ensureId(el), r = S.rules[id] || (S.rules[id] = { d: {}, t: {}, m: {} })
    r[S.dev]["background-image"] = "url(\"" + String(url).replace(/[()"']/g, "") + "\")"
    if (!r[S.dev]["background-size"]) r[S.dev]["background-size"] = "cover"
    if (!r[S.dev]["background-position"]) r[S.dev]["background-position"] = "center"
    writeCss(); commit("Photo de fond")
  }
  /* supprimer l'élément choisi, depuis le panneau de gauche */
  API.delEl = function (el) {
    if (!el) return false
    if (el === B || S.editing) return false
    if (touched(el)) return false
    select(el)
    API.del()
    return true
  }

  /* ---------- page : titre, description, document ---------- */
  API.getMeta = function () { var m = D.querySelector('meta[name="description"]'); return { title: D.title, desc: m ? m.getAttribute("content") || "" : "" } }
  API.setMeta = function (o) {
    D.title = o.title || D.title
    var m = D.querySelector('meta[name="description"]')
    if (!m) { m = D.createElement("meta"); m.setAttribute("name", "description"); H.appendChild(m) }
    m.setAttribute("content", o.desc || ""); commit("Page")
  }
  /* Version pour les pages « de la boutique » (fiche produit, panier, commande,
     confirmation) : les zones protégées redeviennent des variables {{achat}},
     {{panier}}, {{formulaire}}, {{commande}}. La page garde donc son bouton
     d'achat et son formulaire, même après avoir été retouchée. */
  API.htmlWithKeep = function () {
    if (S.editing) endEdit()
    prune(); writeCss()
    var c = D.documentElement.cloneNode(true)
    c.querySelectorAll("[data-studio-ui],script[src*='/_studio/']").forEach(function (n) { n.remove() })
    c.querySelectorAll("[contenteditable],[spellcheck]").forEach(function (n) { n.removeAttribute("contenteditable"); n.removeAttribute("spellcheck") })
    c.querySelectorAll('[data-ndz="produits"],[data-ndz-video]').forEach(function (n) { n.innerHTML = "" })
    c.querySelectorAll("[data-ndz-keep]").forEach(function (n) {
      var varName = n.getAttribute("data-ndz-keep") || ""
      if (!varName) { n.remove(); return }
      var t = D.createTextNode("{{" + varName + "}}")
      if (n.parentNode) n.parentNode.replaceChild(t, n)
    })
    lazyAgain(c)
    c.removeAttribute("data-ndz-slug")
    return "<!doctype html>\n" + c.outerHTML
  }
  API.getHtml = function () {
    if (S.editing) endEdit()
    prune(); writeCss()
    var c = D.documentElement.cloneNode(true)
    c.querySelectorAll("[data-studio-ui],script[src*='/_studio/']").forEach(function (n) { n.remove() })
    c.querySelectorAll("[contenteditable],[spellcheck]").forEach(function (n) { n.removeAttribute("contenteditable"); n.removeAttribute("spellcheck") })
    c.querySelectorAll('[data-ndz="produits"],[data-ndz-video]').forEach(function (n) { n.innerHTML = "" })
    lazyAgain(c)
    c.removeAttribute("data-ndz-slug")
    return "<!doctype html>\n" + c.outerHTML
  }

  push()
  setTimeout(function () { if (S.on.ready) S.on.ready() }, 0)
  window.StudioFrame = API
})()
