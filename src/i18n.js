// Vertaal-plumbing. Dekt nu index.html's statische chrome (titlebar, zijbalk,
// modal-skeletten). Tekst die renderer.js zelf in innerHTML zet (settings-panel,
// project-kaarten, enz.) wordt vertaald zodra die stukken code aan de beurt zijn.
const I18N = (() => {
  let dict = {}
  // Engels als vangnet. Nieuwe teksten landen eerst in nl.json en en.json; in
  // de overige talen zou je zonder dit de sleutelnaam op je scherm zien staan.
  let fallback = {}
  let lang = 'nl'
  const RTL_CODES = new Set(['ar', 'he'])

  function t(key, vars) {
    let str = dict[key]
    if (str == null) str = fallback[key]
    if (str == null) return key
    if (vars) for (const k in vars) str = str.replace(new RegExp(`\\{${k}\\}`, 'g'), vars[k])
    return str
  }

  function applyStaticTranslations() {
    document.querySelectorAll('[data-i18n]').forEach(el => { el.textContent = t(el.dataset.i18n) })
    document.querySelectorAll('[data-i18n-html]').forEach(el => { el.innerHTML = t(el.dataset.i18nHtml) })
    document.querySelectorAll('[data-i18n-title]').forEach(el => { el.title = t(el.dataset.i18nTitle) })
    document.querySelectorAll('[data-i18n-placeholder]').forEach(el => { el.placeholder = t(el.dataset.i18nPlaceholder) })
    document.querySelectorAll('[data-i18n-aria]').forEach(el => { el.setAttribute('aria-label', t(el.dataset.i18nAria)) })
    const title = t('app.title')
    if (title && title !== 'app.title') {
      document.title = title
      const nameEl = document.querySelector('.app-name')
      if (nameEl) nameEl.textContent = title
    }
  }

  async function setLanguage(code) {
    dict = (await window.api.loadLocale(code)) || {}
    if (code === 'en') fallback = dict
    else if (!Object.keys(fallback).length) {
      try { fallback = (await window.api.loadLocale('en')) || {} } catch { fallback = {} }
    }
    lang = code
    document.documentElement.lang = code
    document.documentElement.dir = RTL_CODES.has(code.split('-')[0]) ? 'rtl' : 'ltr'
    applyStaticTranslations()
  }

  function getLanguage() { return lang }

  async function init(initialLang) {
    await setLanguage(initialLang || 'nl')
  }

  return { init, setLanguage, getLanguage, t, applyStaticTranslations }
})()
