/* Compression côté navigateur : redimensionne et convertit en WebP avant l'envoi.
   Évite d'envoyer des photos de téléphone de 4 Mo et accélère la boutique. */
window.NDZUpload = function (file, cb) {
  var MAX = 1600
  var done = function (dataUrl) {
    fetch('/dashboard/upload', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ dataUrl: dataUrl }),
    })
      .then(function (r) { return r.json() })
      .then(function (d) { cb(d.ok ? d.url : null, d.error || null) })
      .catch(function () { cb(null, 'Réseau indisponible'); })
  }
  if (!file || !/^image\//.test(file.type) || typeof document === 'undefined') {
    var fr = new FileReader()
    fr.onload = function () { done(fr.result) }
    fr.readAsDataURL(file)
    return
  }
  var url = URL.createObjectURL(file)
  var img = new Image()
  img.onload = function () {
    var w = img.naturalWidth, h = img.naturalHeight
    var scale = Math.min(1, MAX / Math.max(w, h))
    var cv = document.createElement('canvas')
    cv.width = Math.round(w * scale)
    cv.height = Math.round(h * scale)
    var ctx = cv.getContext('2d')
    ctx.drawImage(img, 0, 0, cv.width, cv.height)
    URL.revokeObjectURL(url)
    var out
    try { out = cv.toDataURL('image/webp', 0.86) } catch (e) { out = null }
    if (!out || out.indexOf('data:image/webp') !== 0) out = cv.toDataURL('image/jpeg', 0.88)
    done(out)
  }
  img.onerror = function () {
    URL.revokeObjectURL(url)
    var fr = new FileReader()
    fr.onload = function () { done(fr.result) }
    fr.readAsDataURL(file)
  }
  img.src = url
}
