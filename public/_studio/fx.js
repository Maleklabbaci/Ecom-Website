/* Script de la vitrine : animations, boutons d'achat, message d'envoi. Le seul script qui tourne sur les pages studio. */
(function () {
  "use strict"
  var d = document, h = d.documentElement
  if (!matchMedia("(prefers-reduced-motion: reduce)").matches) {
    var els = [].slice.call(d.querySelectorAll("[data-fx]"))
    if (els.length) {
      h.classList.add("ndz-fx")
      if (!("IntersectionObserver" in window)) els.forEach(function (e) { e.classList.add("in") })
      else {
        var io = new IntersectionObserver(function (es) {
          es.forEach(function (en) {
            if (!en.isIntersecting) return
            var e = en.target, dl = parseInt(e.getAttribute("data-fx-d"), 10) || 0
            setTimeout(function () { e.classList.add("in") }, Math.min(dl, 3000)); io.unobserve(e)
          })
        }, { threshold: 0.12 })
        els.forEach(function (e) { io.observe(e) })
      }
    }
  }
  var slug = h.getAttribute("data-ndz-slug") || ""
  var pre = slug && location.pathname.indexOf("/" + slug) === 0 ? "/" + slug : ""
  d.addEventListener("click", function (ev) {
    var a = ev.target.closest && ev.target.closest("[data-ndz-buy]")
    if (!a) return
    var id = a.getAttribute("data-ndz-pid")
    if (!/^\d+$/.test(id || "")) return
    ev.preventDefault()
    var f = d.createElement("form"), i = d.createElement("input")
    f.method = "post"; f.action = pre + (a.getAttribute("data-ndz-buy") === "cart" ? "/cart" : "/direct")
    i.type = "hidden"; i.name = "product_id"; i.value = id; f.appendChild(i); d.body.appendChild(f); f.submit()
  })
  var m = /[?&]sent=([01])/.exec(location.search)
  if (m) {
    var t = d.createElement("div"); t.id = "ndz-toast"
    t.textContent = m[1] === "1" ? "Merci ! Ton message est bien envoyé." : "Message non envoyé : vérifie les champs."
    d.body.appendChild(t); setTimeout(function () { t.remove() }, 5000)
  }
})()
