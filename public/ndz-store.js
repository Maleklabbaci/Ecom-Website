/* Tiroir du panier, échéances à la livraison, bibliothèque déjà gérée côté éditeur.
   Aucune caisse inventée : le bouton direct ouvre le formulaire de la boutique. */
(function () {
  var root = document.documentElement
  function slug() {
    var p = location.pathname.split("/").filter(Boolean)
    return p[0] || ""
  }
  function money(cents, cur) {
    var n = (Number(cents) || 0) / 100
    return n.toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " " + (cur || "DZD")
  }
  function drawerOn() {
    return root.getAttribute("data-drawer") === "tiroir" || root.getAttribute("data-drawer-open") === "1"
  }
  function ensure() {
    var el = document.getElementById("ndzDrawer")
    if (el) return el
    el = document.createElement("div")
    el.id = "ndzDrawer"
    el.innerHTML = '<div class="ndz-drawer-bg" data-close></div><aside class="tpx-drawer ndz-drawer" role="dialog" aria-label="Panier"><header><b>Panier</b><button type="button" data-close aria-label="Fermer">×</button></header><div class="ndz-drawer-body"></div><footer></footer></aside>'
    document.body.appendChild(el)
    el.addEventListener("click", function (e) {
      if (e.target.closest("[data-close]")) close()
    })
    return el
  }
  function close() {
    var el = document.getElementById("ndzDrawer")
    if (el) el.classList.remove("on")
    document.body.classList.remove("ndz-drawer-lock")
  }
  function paint(data) {
    var el = ensure()
    var body = el.querySelector(".ndz-drawer-body")
    var foot = el.querySelector("footer")
    var cur = data.currency || "DZD"
    if (!data.items || !data.items.length) {
      body.innerHTML = '<p class="ndz-drawer-empty">Ton panier est vide.</p>'
      foot.innerHTML = '<a class="ndz-empty-link" href="' + (data.empty || ("/" + slug())) + '">Voir la boutique</a>'
    } else {
      body.innerHTML = data.items.map(function (it) {
        var img = it.image ? '<img src="' + it.image.replace(/"/g, "") + '" alt="">' : '<span></span>'
        return '<div class="ndz-drawer-row">' + img + '<div><b>' + String(it.title || "").replace(/[&<>]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c] }) + '</b><span class="ndz-money" data-cents="' + it.price_cents + '">' + money(it.price_cents, cur) + '</span><form method="post" action="/' + slug() + '/cart/' + encodeURIComponent(it.key) + '"><button name="delta" value="-1" type="submit">−</button><i>' + it.qty + '</i><button name="delta" value="1" type="submit">+</button></form></div></div>'
      }).join("")
      foot.innerHTML = '<div class="ndz-drawer-total"><span>Total</span><b class="ndz-money" data-cents="' + data.total + '">' + money(data.total, cur) + '</b></div><a class="ndz-drawer-go" href="' + data.checkout + '">Commander</a><a class="ndz-drawer-page" href="' + data.cart + '">Voir la page panier</a>'
    }
    el.classList.add("on")
    document.body.classList.add("ndz-drawer-lock")
    parts()
  }
  function openFrom(url) {
    fetch(url, { credentials: "same-origin", headers: { Accept: "application/json" } })
      .then(function (r) { return r.json() })
      .then(paint)
      .catch(function () { location.href = "/" + slug() + "/cart" })
  }
  function post(form) {
    var body = new URLSearchParams(new FormData(form))
    body.set("drawer", "1")
    fetch(form.action, {
      method: "POST",
      credentials: "same-origin",
      headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
      body: body.toString(),
    }).then(function (r) { return r.json() }).then(paint).catch(function () { form.submit() })
  }
  document.addEventListener("submit", function (e) {
    var form = e.target
    if (!form || !form.action || !drawerOn()) return
    var path = form.getAttribute("action") || ""
    if (!/\/cart(\/|$)/.test(path) || /\/cart\/bundle/.test(path)) return
    if (root.getAttribute("data-drawer") !== "tiroir" && root.getAttribute("data-drawer-open") !== "1") return
    if (/\/cart\//.test(path) && !document.getElementById("ndzDrawer")) return
    e.preventDefault()
    post(form)
  }, true)
  document.addEventListener("click", function (e) {
    if (root.getAttribute("data-drawer") !== "tiroir") return
    var a = e.target.closest('a[href$="/cart"]')
    if (!a || a.closest("#ndzDrawer") || a.classList.contains("ndz-drawer-page")) return
    e.preventDefault()
    openFrom("/" + slug() + "/cart.json")
  })
  function parts() {
    document.querySelectorAll(".ndz-parts").forEach(function (n) { n.remove() })
    var n = Number(root.getAttribute("data-parts") || 0)
    if (n < 2) return
    document.querySelectorAll(".p-price .ndz-money, .tpx-pprice .ndz-money, .sec-price .ndz-money, .tpx-total .ndz-money, .ndz-drawer-total .ndz-money").forEach(function (el) {
      if (el.nextElementSibling && el.nextElementSibling.classList.contains("ndz-parts")) return
      var cents = Number(el.getAttribute("data-cents") || 0)
      if (!cents) return
      var note = document.createElement("span")
      note.className = "ndz-parts"
      note.textContent = n + " × " + money(Math.round(cents / n), (el.textContent.match(/[A-Z]{3}$/) || ["DZD"])[0]) + " à la livraison"
      el.insertAdjacentElement("afterend", note)
    })
  }
  document.addEventListener("ndz-design", parts)
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", parts)
  else parts()
  if (window.MutationObserver) {
    new MutationObserver(parts).observe(root, { attributes: true, attributeFilter: ["data-parts", "data-drawer", "data-drawer-open"] })
  }
  var css = document.createElement("style")
  css.textContent = '#ndzDrawer{position:fixed;inset:0;z-index:80;display:none}#ndzDrawer.on{display:block}.ndz-drawer-bg{position:absolute;inset:0;background:rgba(17,17,17,.42)}.ndz-drawer{position:absolute;top:0;right:0;height:100%;width:min(380px,92vw);background:#fff;color:#111;border-left:1px solid #E4E4E7;display:flex;flex-direction:column;font:14px/1.4 Inter,system-ui,sans-serif}.ndz-drawer header,.ndz-drawer footer{padding:14px 16px;border-bottom:1px solid #E4E4E7}.ndz-drawer footer{border-bottom:0;border-top:1px solid #E4E4E7;display:flex;flex-direction:column;gap:8px}.ndz-drawer header{display:flex;align-items:center;justify-content:space-between}.ndz-drawer header button{border:0;background:transparent;font-size:22px;cursor:pointer;color:#111}.ndz-drawer-body{flex:1;overflow:auto;padding:8px 16px}.ndz-drawer-row{display:grid;grid-template-columns:64px 1fr;gap:10px;padding:10px 0;border-bottom:1px solid #E4E4E7}.ndz-drawer-row img,.ndz-drawer-row span:empty{width:64px;height:64px;object-fit:cover;background:#FAFAFA;border-radius:8px}.ndz-drawer-row b{display:block;font-size:13px}.ndz-drawer-row form{display:flex;gap:8px;align-items:center;margin-top:6px}.ndz-drawer-row button{width:26px;height:26px;border:1px solid #E4E4E7;border-radius:7px;background:#fff;cursor:pointer}.ndz-drawer-go{height:40px;border-radius:9px;background:#111;color:#fff;display:flex;align-items:center;justify-content:center;text-decoration:none;font-weight:600}.ndz-drawer-page,.ndz-drawer footer .ndz-empty-link{font-size:12px;color:#71717A;text-align:center}.ndz-drawer-total{display:flex;justify-content:space-between;font-weight:600}.ndz-parts{display:block;margin-top:3px;font-size:11px;color:#71717A;font-weight:500}.ndz-drawer-lock{overflow:hidden}'
  document.head.appendChild(css)
})()
