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
    ".sf-hov{outline:1px dashed #6d5efc;background:rgba(109,94,252,.06)}.sf-sel{outline:2px solid #6d5efc}" +
    ".sf-drop{background:#6d5efc;height:3px;border-radius:2px}.sf-drop.in{height:auto;background:rgba(109,94,252,.18);outline:2px dashed #6d5efc}" +
    ".sf-tb{position:fixed;z-index:2147483001;display:none;gap:2px;background:#1c1b22;color:#fff;border-radius:8px;padding:3px;box-shadow:0 6px 20px rgba(0,0,0,.3);align-items:center;max-width:96vw}" +
    ".sf-tb b{font-weight:600;padding:0 8px;font-size:11px;opacity:.85;max-width:150px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}" +
    ".sf-tb button{all:unset;cursor:pointer;color:#fff;min-width:26px;height:26px;text-align:center;line-height:26px;border-radius:6px;font-size:13px}.sf-tb button:hover{background:#6d5efc}" +
    ".sf-tb button.on{background:#6d5efc}.sf-tb i{width:1px;height:16px;background:#ffffff40;margin:0 2px}" +
    ".sf-gv,.sf-gh{position:fixed;pointer-events:none;z-index:2147483000;display:none;background:#ff2d78}.sf-gv{width:1px;top:0;bottom:0}.sf-gh{height:1px;left:0;right:0}" +
    ".sf-h{position:fixed;display:none;width:10px;height:10px;background:#fff;border:2px solid #6d5efc;border-radius:3px;z-index:2147483001;pointer-events:auto;box-sizing:border-box}" +
    ".sf-h[data-k=e]{cursor:ew-resize}.sf-h[data-k=s]{cursor:ns-resize}.sf-h[data-k=se]{cursor:nwse-resize}" +
    "[data-ndz-video] iframe{pointer-events:none}[data-ndz-video='']{min-height:220px;background:#14131a;display:flex;align-items:center;justify-content:center}[data-ndz-video='']::before{content:'▶ Vidéo YouTube : colle le lien dans le panneau de droite';color:#fff;font:600 14px system-ui,sans-serif;padding:20px;text-align:center}" +
    "[contenteditable=true]{outline:2px solid #6d5efc!important;cursor:text!important}"
  H.appendChild(uiCss)
  var gv = ui.querySelector(".sf-gv"), gh = ui.querySelector(".sf-gh"), handles = [].slice.call(ui.querySelectorAll(".sf-h"))
  var hov = ui.querySelector(".sf-hov"), selBox = ui.querySelector(".sf-sel"), tb = ui.querySelector(".sf-tb"), dropEl = ui.querySelector(".sf-drop")

  function isUI(t) { return !!(t && t.closest && t.closest("[data-studio-ui]")) }
  function norm(t) {
    if (!t || t.nodeType !== 1) t = t && t.parentElement
    if (!t || t === D.documentElement) return B
    var p = t.closest('[data-ndz="produits"]'); if (p) return p
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
  function commit(lbl) { prune(); writeCss(); push(); place(); buildTb(); if (S.on.change) S.on.change(lbl || "") }
  function restore(s) {
    if (S.editing) endEdit(true)
    B.innerHTML = s.b; cssEl.textContent = s.c; D.title = s.t
    s.bs ? B.setAttribute("data-s", s.bs) : B.removeAttribute("data-s")
    s.bt ? B.setAttribute("style", s.bt) : B.removeAttribute("style")
    parseRules()
    S.sel = s.p ? atPath(s.p) : null
    buildTb(); place()
    if (S.on.select) S.on.select(S.sel)
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
    select(norm(e.target))
  }, true)
  D.addEventListener("auxclick", function (e) { if (!isUI(e.target)) e.preventDefault() }, true)
  D.addEventListener("submit", function (e) { e.preventDefault() }, true)
  D.addEventListener("dragstart", function (e) { if (!isUI(e.target)) e.preventDefault() }, true)
  D.addEventListener("dblclick", function (e) {
    if (isUI(e.target)) return
    var el = norm(e.target); select(el); startEdit(el)
  }, true)
  D.addEventListener("mouseover", function (e) {
    if (isUI(e.target) || S.dragging) return
    var el = norm(e.target)
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
  API.del = function () {
    var el = S.sel; if (!el || el === B) return
    var next = el.nextElementSibling || el.previousElementSibling || el.parentElement
    el.remove(); S.sel = next === D.documentElement ? B : next
    commit("Suppression"); select(S.sel)
  }
  API.dup = function () {
    var el = S.sel; if (!el || el === B) return
    var c = el.cloneNode(true); reid(c)
    el.parentNode.insertBefore(c, el.nextSibling)
    commit("Duplication"); select(c)
  }
  API.move = function (dir) {
    var el = S.sel; if (!el || el === B) return
    var p = el.parentNode
    if (dir === "up" && el.previousElementSibling) p.insertBefore(el, el.previousElementSibling)
    else if (dir === "down" && el.nextElementSibling) p.insertBefore(el, el.nextElementSibling.nextSibling)
    else return
    commit("Déplacement"); place()
  }
  API.moveTo = function (el, target, pos) {
    if (!el || !target || el === target || el.contains(target)) return
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
  API.win = window

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
  ]
  API.blocks = BLOCKS.map(function (b) { return { id: b.id, group: b.g, label: b.l } })
  API.insert = function (id, inside) {
    var b = BLOCKS.filter(function (x) { return x.id === id })[0]; if (!b) return
    if (b.unique && B.querySelector('[data-ndz="produits"]')) { var ex = B.querySelector('[data-ndz="produits"]'); select(ex); ex.scrollIntoView({ block: "center" }); return }
    var t = D.createElement("div"); t.innerHTML = b.h; var n = t.firstElementChild
    var s = S.sel
    if (!s || s === B) B.appendChild(n)
    else if (inside && !VOIDS.test(s.tagName)) s.appendChild(n)
    else s.parentNode.insertBefore(n, s.nextSibling)
    commit("Ajout"); select(n); n.scrollIntoView({ block: "center", behavior: "smooth" })
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
  API.replaceFont = function (a, b) {
    each(function (t) { return t.replace(FNT, function (m, v) { return fam(v) === a ? "font-family:'" + b + "',system-ui,sans-serif" : m }) })
    parseRules(); commit("Police du site")
  }

  /* ---------- page : titre, description, document ---------- */
  API.getMeta = function () { var m = D.querySelector('meta[name="description"]'); return { title: D.title, desc: m ? m.getAttribute("content") || "" : "" } }
  API.setMeta = function (o) {
    D.title = o.title || D.title
    var m = D.querySelector('meta[name="description"]')
    if (!m) { m = D.createElement("meta"); m.setAttribute("name", "description"); H.appendChild(m) }
    m.setAttribute("content", o.desc || ""); commit("Page")
  }
  API.getHtml = function () {
    if (S.editing) endEdit()
    prune(); writeCss()
    var c = D.documentElement.cloneNode(true)
    c.querySelectorAll("[data-studio-ui],script[src*='/_studio/']").forEach(function (n) { n.remove() })
    c.querySelectorAll("[contenteditable],[spellcheck]").forEach(function (n) { n.removeAttribute("contenteditable"); n.removeAttribute("spellcheck") })
    c.querySelectorAll('[data-ndz="produits"],[data-ndz-video]').forEach(function (n) { n.innerHTML = "" })
    c.removeAttribute("data-ndz-slug")
    return "<!doctype html>\n" + c.outerHTML
  }

  push()
  setTimeout(function () { if (S.on.ready) S.on.ready() }, 0)
  window.StudioFrame = API
})()
