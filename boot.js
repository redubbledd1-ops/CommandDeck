// Minieme start: titelbalk meteen, nog vóór renderer.js parseert.
// Sleep en min/max/sluiten mogen niet wachten op 800 kB JS.
(function bootTitelbalk() {
  try {
    if (window.api && window.api.nativeTitelbalk) {
      document.documentElement.classList.add('native-titelbalk')
    }
    const icons = document.getElementById('tabler-icons-css')
    if (icons) {
      const aan = () => { icons.media = 'all' }
      if (icons.sheet) aan()
      else icons.addEventListener('load', aan)
      requestAnimationFrame(aan)
    }
    const api = window.api
    if (!api) return
    const bind = (id, fn) => {
      const el = document.getElementById(id)
      if (el) el.onclick = fn
    }
    bind('btn-min', () => api.minimize())
    bind('btn-max', () => api.maximize())
    bind('btn-close', () => api.close())
  } catch {}
})()
