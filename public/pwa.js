/* NovaDZ — installation de l'application.
 *
 * Le navigateur décide ; nous, on range l'icône au bon endroit. Un bouton
 * marqué `data-pwa-install` reste caché tant que le téléphone ne propose pas
 * l'installation : personne ne voit un bouton qui ne marcherait pas.
 */
(function () {
  if (typeof window === "undefined") return

  var standalone = false
  try {
    standalone = window.matchMedia("(display-mode: standalone)").matches || window.navigator.standalone === true
  } catch (_) { standalone = false }
  if (standalone) document.documentElement.classList.add("pwa-standalone")

  /* le service worker ne sert à rien dans un aperçu encadré */
  var framed = false
  try { framed = window.top !== window.self } catch (_) { framed = true }
  if ("serviceWorker" in navigator && !framed && location.protocol !== "file:") {
    window.addEventListener("load", function () {
      navigator.serviceWorker.register("/sw.js", { scope: "/" }).catch(function () { /* pas bloquant */ })
    })
  }

  var deferred = null
  function buttons() { return document.querySelectorAll("[data-pwa-install]") }
  function reveal(on) {
    var list = buttons()
    for (var i = 0; i < list.length; i++) {
      if (on) list[i].removeAttribute("hidden")
      else list[i].setAttribute("hidden", "")
    }
  }

  window.addEventListener("beforeinstallprompt", function (e) {
    e.preventDefault()
    deferred = e
    if (!standalone) reveal(true)
  })

  window.addEventListener("appinstalled", function () {
    deferred = null
    reveal(false)
    document.documentElement.classList.add("pwa-installed")
  })

  document.addEventListener("click", function (e) {
    var btn = e.target && e.target.closest ? e.target.closest("[data-pwa-install]") : null
    if (!btn) return
    e.preventDefault()
    if (!deferred) { reveal(false); return }
    deferred.prompt()
    var done = deferred.userChoice
    deferred = null
    reveal(false)
    if (done && done.then) done.then(function () { }).catch(function () { })
  })

  /* si la page a été ouverte depuis l'icône, on le note (utile pour les stats) */
  if (standalone) {
    try {
      var u = new URL(location.href)
      u.searchParams.set("source", "app")
      window.__ndzStandalone = true
    } catch (_) { }
  }
})()
