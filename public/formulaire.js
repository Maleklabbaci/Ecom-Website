(function () {
  var form = document.getElementById("fldForm")
  var preview = document.getElementById("fmPreview")
  var order = document.getElementById("fmOrder")
  var chips = document.getElementById("fmChips")
  var bootEl = document.getElementById("fmBoot")
  if (!form || !preview || !order || !bootEl) return
  var boot = {}
  try { boot = JSON.parse(bootEl.textContent || "{}") } catch (e) { boot = {} }
  boot.presets = boot.presets || []
  boot.parked = boot.parked || []
  var seq = 200

  function model() {
    var r = form.querySelector("[name=form_model]:checked")
    return r ? r.value : "classique"
  }
  function ink(hex) {
    var n = parseInt(String(hex || "").slice(1), 16)
    if (!isFinite(n)) return "#fff"
    var y = (((n >> 16) & 255) * 299 + ((n >> 8) & 255) * 587 + (n & 255) * 114) / 1000
    return y > 165 ? "#111111" : "#ffffff"
  }
  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]
    })
  }
  function liveRows() {
    return Array.prototype.filter.call(order.children, function (li) { return !li.classList.contains("gone") })
  }
  function fieldOf(li) {
    var label = (li.querySelector(".fld-label") || {}).value || ""
    var type = li.getAttribute("data-type") || "text"
    var ph = (li.querySelector("[data-ph]") || {}).value || ""
    var opts = String((li.querySelector("[data-opt]") || {}).value || "").split(",").map(function (s) { return s.trim() }).filter(Boolean)
    var wide = ((li.querySelector("[name^=width_]") || {}).value === "full") ? " ck-wide" : ""
    var control = ""
    if (type === "textarea") control = '<textarea rows="2" placeholder="' + esc(ph) + '" readonly></textarea>'
    else if (type === "select" || type === "wilaya" || type === "commune") {
      if (model() === "ouvert" && type === "select" && opts.length) {
        control = '<span class="ck-pills">' + opts.map(function (o, i) {
          return '<label class="ck-pill"><input type="radio" disabled' + (i ? "" : " checked") + "><span>" + esc(o) + "</span></label>"
        }).join("") + "</span>"
      } else {
        var list = opts.length ? opts : (type === "wilaya" ? ["Alger", "Blida", "Oran"] : ["—"])
        control = "<select disabled>" + list.map(function (o) { return "<option>" + esc(o) + "</option>" }).join("") + "</select>"
      }
    } else control = '<input placeholder="' + esc(ph) + '" readonly>'
    return '<label class="ck-f' + wide + '"><span>' + esc(label) + "</span>" + control + "</label>"
  }
  function blockOf(li) {
    var id = li.getAttribute("data-piece")
    var label = (li.querySelector(".fld-label") || {}).value || ""
    if (id === "variants") {
      if (model() === "ouvert") {
        return '<div class="ck-var"><span>' + esc(label) + '</span><span class="ck-pills"><label class="ck-pill"><input type="radio" checked disabled><span>1</span></label><label class="ck-pill"><input type="radio" disabled><span>2</span></label></span></div>'
      }
      return '<label class="ck-f ck-wide"><span>' + esc(label) + '</span><select disabled><option>1</option><option>2</option></select></label>'
    }
    if (id === "qty") return '<div class="ndz-qty"><span>' + esc(label) + '</span><input value="1" readonly></div>'
    if (id === "delivery") {
      return '<div class="ck-dlv" data-fm-dlv><span class="ck-dlv-label">' + esc(label) + '</span><div class="ck-dlv-opts"><label class="ck-dlv-opt"><input type="radio" name="fm_demo" data-fm-mode="home" checked><span><b>À domicile</b></span></label><label class="ck-dlv-opt"><input type="radio" name="fm_demo" data-fm-mode="desk"><span><b>Au bureau</b></span></label></div></div><div class="ck-desk" data-fm-desk hidden><label class="ck-f ck-wide"><span>Bureau</span><select disabled><option>—</option></select></label></div>'
    }
    if (id === "position") return '<div class="ck-geo"><button type="button" class="ck-geo-btn">' + esc(label) + "</button></div>"
    if (id === "paynote") return '<p class="ndz-buyform-note" data-note>' + esc(label) + "</p>"
    return ""
  }
  function draw() {
    var parts = []
    var buf = []
    function flush() {
      if (!buf.length) return
      parts.push('<div class="ck-grid">' + buf.join("") + "</div>")
      buf = []
    }
    liveRows().forEach(function (li) {
      if (li.getAttribute("data-kind") === "field") buf.push(fieldOf(li))
      else { flush(); parts.push(blockOf(li)) }
    })
    flush()
    parts.push('<button class="btn btn-primary btn-block" type="button">Commander</button>')
    preview.className = "fm-preview ck-look ck-" + model()
    preview.innerHTML = parts.join("")
    var c = form.querySelector("[name=form_color]")
    if (c) {
      preview.style.setProperty("--ck", c.value)
      preview.style.setProperty("--ck-ink", ink(c.value))
    }
    var lang = form.querySelector("[name=form_lang]:checked")
    preview.setAttribute("dir", lang && lang.value === "ar" ? "rtl" : "ltr")
    form.querySelectorAll(".fm-card").forEach(function (card) {
      var input = card.querySelector("input")
      card.classList.toggle("on", !!(input && input.checked))
    })
    form.querySelectorAll(".fm-swatch").forEach(function (b) {
      var col = form.querySelector("[name=form_color]")
      b.classList.toggle("on", !!(col && col.value.toLowerCase() === String(b.getAttribute("data-color") || "").toLowerCase()))
    })
    var v = form.querySelector("[name=form_variants]")
    var d = form.querySelector("[name=form_delivery]")
    if (v) v.checked = !!order.querySelector("[data-piece=variants]:not(.gone)")
    if (d) d.checked = !!order.querySelector("[data-piece=delivery]:not(.gone)")
  }
  function has(id) {
    return !!order.querySelector("[data-piece='" + id + "']:not(.gone)")
  }
  function paintChips() {
    var list = boot.presets.concat(boot.parked).filter(function (p) { return p && p.id && !has(p.id) })
    var seen = {}
    chips.innerHTML = list.filter(function (p) {
      if (seen[p.id]) return false
      seen[p.id] = 1
      return true
    }).map(function (p) {
      return '<button type="button" class="btn btn-ghost btn-sm" data-chip="' + esc(p.id) + '">+ ' + esc(p.name) + "</button>"
    }).join("")
  }
  function rowById(id) {
    return Array.prototype.filter.call(order.children, function (li) {
      return li.getAttribute("data-piece") === id
    })[0] || null
  }
  function addRow(spec) {
    if (!spec || !spec.id) return
    var existing = rowById(spec.id)
    if (existing) {
      existing.classList.remove("gone")
      var del = existing.querySelector("[data-del]")
      if (del) del.checked = false
      var en = existing.querySelector("[name^=enabled_]")
      if (en) en.checked = true
      draw()
      paintChips()
      return
    }
    var i = seq++
    var li = document.createElement("li")
    li.className = "fld-row"
    li.setAttribute("data-piece", spec.id)
    li.setAttribute("data-kind", spec.kind || "field")
    li.setAttribute("data-type", spec.type || "text")
    li.innerHTML =
      '<span class="fm-grip" aria-label="Glisser"></span>' +
      '<input name="label_' + i + '" value="' + esc(spec.name || "") + '" maxlength="40" class="fld-label" aria-label="Nom">' +
      '<button type="button" class="fm-x" data-remove>Enlever</button>' +
      '<input type="hidden" name="key_' + i + '" value="' + esc(spec.id) + '">' +
      '<input type="hidden" name="kind_' + i + '" value="' + esc(spec.kind || "field") + '">' +
      '<input type="hidden" name="pos_' + i + '" value="' + i + '" data-pos>' +
      '<input type="hidden" name="type_' + i + '" value="' + esc(spec.type || "text") + '">' +
      '<input type="hidden" name="ph_' + i + '" value="' + esc(spec.ph || "") + '" data-ph>' +
      '<input type="hidden" name="width_' + i + '" value="' + esc(spec.wide || "half") + '">' +
      '<input type="hidden" name="opt_' + i + '" value="' + esc(spec.opts || "") + '" data-opt>' +
      '<input type="hidden" name="label_ar_' + i + '" value="">' +
      '<input type="checkbox" name="enabled_' + i + '" value="1" checked hidden>' +
      '<input type="checkbox" name="req_' + i + '" value="1" hidden>' +
      '<input type="checkbox" name="del_' + i + '" value="1" hidden data-del>'
    var note = order.querySelector("[data-piece=paynote]:not(.gone)")
    if (note) order.insertBefore(li, note)
    else order.appendChild(li)
    draw()
    paintChips()
  }
  function slug(s) {
    return String(s || "").toLowerCase().normalize("NFD").replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 18) || "detail"
  }
  form.addEventListener("click", function (e) {
    var sw = e.target.closest("[data-color]")
    if (sw) {
      var c = form.querySelector("[name=form_color]")
      if (c) c.value = sw.getAttribute("data-color")
      draw()
      return
    }
    var rm = e.target.closest("[data-remove]")
    if (!rm) return
    var li = rm.closest("li")
    if (!li) return
    if (li.getAttribute("data-kind") === "block") {
      li.classList.add("gone")
      var del = li.querySelector("[data-del]")
      if (del) del.checked = true
    } else li.remove()
    draw()
    paintChips()
  })
  form.addEventListener("change", function (e) {
    if (e.target && e.target.id === "fmAddType") {
      var opts = document.getElementById("fmAddOpts")
      if (opts) opts.hidden = e.target.value !== "select"
    }
    draw()
  })
  form.addEventListener("input", function (e) {
    if (e.target && (e.target.id === "fmAddName" || e.target.id === "fmAddOpts")) return
    draw()
  })
  var addBtn = document.getElementById("fmAdd")
  if (addBtn) addBtn.addEventListener("click", function () {
    var name = (document.getElementById("fmAddName").value || "").trim()
    if (!name) return
    var type = document.getElementById("fmAddType").value || "text"
    var opts = (document.getElementById("fmAddOpts").value || "").trim()
    var id = "f_" + slug(name)
    if (has(id)) id = id + "_" + String(seq)
    addRow({ id: id, name: name, kind: "field", type: type, opts: opts, wide: type === "select" || type === "textarea" ? "full" : "half", ph: "" })
    document.getElementById("fmAddName").value = ""
    document.getElementById("fmAddOpts").value = ""
  })
  if (chips) chips.addEventListener("click", function (e) {
    var b = e.target.closest("[data-chip]")
    if (!b) return
    var id = b.getAttribute("data-chip")
    var spec = boot.presets.concat(boot.parked).filter(function (p) { return p.id === id })[0]
    if (!spec) return
    addRow(spec)
  })
  preview.addEventListener("change", function (e) {
    var mode = e.target && e.target.getAttribute && e.target.getAttribute("data-fm-mode")
    if (!mode) return
    var desk = preview.querySelector("[data-fm-desk]")
    if (desk) desk.hidden = mode !== "desk"
  })
  form.addEventListener("submit", function () {
    Array.prototype.forEach.call(order.querySelectorAll("li"), function (tr, i) {
      var p = tr.querySelector("[data-pos]")
      if (p) p.value = String(i)
    })
  })
  var drag = null
  var dragPointer = null
  function endDrag() {
    if (!drag) return
    drag.classList.remove("is-drag")
    drag = null
    dragPointer = null
    draw()
  }
  order.addEventListener("pointerdown", function (e) {
    var grip = e.target.closest(".fm-grip")
    if (!grip || !order.contains(grip)) return
    var li = grip.closest("li")
    if (!li || li.classList.contains("gone")) return
    drag = li
    dragPointer = e.pointerId
    try { grip.setPointerCapture(e.pointerId) } catch (err) {}
    li.classList.add("is-drag")
    e.preventDefault()
  })
  order.addEventListener("pointermove", function (e) {
    if (!drag || e.pointerId !== dragPointer) return
    var under = document.elementFromPoint(e.clientX, e.clientY)
    var li = under && under.closest ? under.closest("#fmOrder > li") : null
    if (!li || li === drag || li.classList.contains("gone")) return
    var box = li.getBoundingClientRect()
    if (e.clientY > box.top + box.height / 2) order.insertBefore(drag, li.nextElementSibling)
    else order.insertBefore(drag, li)
    draw()
  })
  order.addEventListener("pointerup", endDrag)
  order.addEventListener("pointercancel", endDrag)
  paintChips()
  draw()
})()
