// Helpknoppen voor website-projecten: snelle stukjes html/css/js in de editor.
// Geen Flutter, geen IDE — alleen wat je vaak typt, per taal in een map.
;(function (root, factory) {
  const api = factory()
  if (typeof module === 'object' && module.exports) module.exports = api
  else root.WebKnoppen = api
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {

  // $0 = waar de cursor na invoegen komt te staan.
  const WEB_CMD_DEFS = [
    // ── HTML · structuur ────────────────────────────────────────────────────
    { id: 'web-html-div',     taal: 'html', groep: 'struct', label: 'div',     icon: 'ti-box',            snippet: '<div>\n\t$0\n</div>' },
    { id: 'web-html-section', taal: 'html', groep: 'struct', label: 'section', icon: 'ti-layout-rows',    snippet: '<section>\n\t$0\n</section>' },
    { id: 'web-html-main',    taal: 'html', groep: 'struct', label: 'main',    icon: 'ti-layout-board',   snippet: '<main>\n\t$0\n</main>' },
    { id: 'web-html-header',  taal: 'html', groep: 'struct', label: 'header',  icon: 'ti-layout-navbar',  snippet: '<header>\n\t$0\n</header>' },
    { id: 'web-html-footer',  taal: 'html', groep: 'struct', label: 'footer',  icon: 'ti-box-align-bottom', snippet: '<footer>\n\t$0\n</footer>' },
    { id: 'web-html-nav',     taal: 'html', groep: 'struct', label: 'nav',     icon: 'ti-menu-2',         snippet: '<nav>\n\t$0\n</nav>' },
    { id: 'web-html-article', taal: 'html', groep: 'struct', label: 'article', icon: 'ti-news',           snippet: '<article>\n\t$0\n</article>' },

    // ── HTML · tekst ────────────────────────────────────────────────────────
    { id: 'web-html-h1',     taal: 'html', groep: 'tekst', label: 'h1',     icon: 'ti-h-1',      snippet: '<h1>$0</h1>' },
    { id: 'web-html-h2',     taal: 'html', groep: 'tekst', label: 'h2',     icon: 'ti-h-2',      snippet: '<h2>$0</h2>' },
    { id: 'web-html-h3',     taal: 'html', groep: 'tekst', label: 'h3',     icon: 'ti-h-3',      snippet: '<h3>$0</h3>' },
    { id: 'web-html-p',      taal: 'html', groep: 'tekst', label: 'p',      icon: 'ti-align-left', snippet: '<p>$0</p>' },
    { id: 'web-html-a',      taal: 'html', groep: 'tekst', label: 'a',      icon: 'ti-link',     snippet: '<a href="$0"></a>' },
    { id: 'web-html-ul',     taal: 'html', groep: 'tekst', label: 'ul / li', icon: 'ti-list',    snippet: '<ul>\n\t<li>$0</li>\n</ul>' },
    { id: 'web-html-strong', taal: 'html', groep: 'tekst', label: 'strong', icon: 'ti-bold',     snippet: '<strong>$0</strong>' },
    { id: 'web-html-span',   taal: 'html', groep: 'tekst', label: 'span',   icon: 'ti-text-size', snippet: '<span>$0</span>' },

    // ── HTML · media / form ─────────────────────────────────────────────────
    { id: 'web-html-img',    taal: 'html', groep: 'media', label: 'img',    icon: 'ti-photo',      snippet: '<img src="$0" alt="">' },
    { id: 'web-html-button', taal: 'html', groep: 'media', label: 'button', icon: 'ti-click',      snippet: '<button type="button">$0</button>' },
    { id: 'web-html-form',   taal: 'html', groep: 'media', label: 'form',   icon: 'ti-forms',      snippet: '<form action="" method="post">\n\t$0\n</form>' },
    { id: 'web-html-input',  taal: 'html', groep: 'media', label: 'input',  icon: 'ti-forms',      snippet: '<input type="text" name="$0" value="">' },
    { id: 'web-html-label',  taal: 'html', groep: 'media', label: 'label',  icon: 'ti-tag',        snippet: '<label for="">$0</label>' },

    // ── CSS · layout ────────────────────────────────────────────────────────
    { id: 'web-css-flex',    taal: 'css', groep: 'layout', label: 'flex',   icon: 'ti-layout-distribute-horizontal', snippet: 'display: flex;\njustify-content: $0;\nalign-items: center;\ngap: 1rem;' },
    { id: 'web-css-grid',    taal: 'css', groep: 'layout', label: 'grid',   icon: 'ti-layout-grid', snippet: 'display: grid;\ngrid-template-columns: repeat(2, 1fr);\ngap: $0;' },
    { id: 'web-css-gap',     taal: 'css', groep: 'layout', label: 'gap',    icon: 'ti-spacing-horizontal', snippet: 'gap: $0;' },
    { id: 'web-css-margin',  taal: 'css', groep: 'layout', label: 'margin', icon: 'ti-box-margin', snippet: 'margin: $0;' },
    { id: 'web-css-padding', taal: 'css', groep: 'layout', label: 'padding', icon: 'ti-box-padding', snippet: 'padding: $0;' },
    { id: 'web-css-width',   taal: 'css', groep: 'layout', label: 'width',  icon: 'ti-ruler-2', snippet: 'width: $0;' },

    // ── CSS · tekst ─────────────────────────────────────────────────────────
    { id: 'web-css-color',      taal: 'css', groep: 'tekst', label: 'color',       icon: 'ti-palette', snippet: 'color: $0;' },
    { id: 'web-css-fontsize',   taal: 'css', groep: 'tekst', label: 'font-size',   icon: 'ti-text-size', snippet: 'font-size: $0;' },
    { id: 'web-css-fontweight', taal: 'css', groep: 'tekst', label: 'font-weight', icon: 'ti-bold', snippet: 'font-weight: $0;' },
    { id: 'web-css-textalign',  taal: 'css', groep: 'tekst', label: 'text-align',  icon: 'ti-align-center', snippet: 'text-align: $0;' },
    { id: 'web-css-lineheight', taal: 'css', groep: 'tekst', label: 'line-height', icon: 'ti-line-height', snippet: 'line-height: $0;' },
    { id: 'web-css-textdeco',   taal: 'css', groep: 'tekst', label: 'text-decoration', icon: 'ti-underline', snippet: 'text-decoration: $0;' },

    // ── CSS · look ──────────────────────────────────────────────────────────
    { id: 'web-css-bg',       taal: 'css', groep: 'look', label: 'background',   icon: 'ti-paint', snippet: 'background: $0;' },
    { id: 'web-css-border',   taal: 'css', groep: 'look', label: 'border',       icon: 'ti-border-all', snippet: 'border: 1px solid $0;' },
    { id: 'web-css-radius',   taal: 'css', groep: 'look', label: 'border-radius', icon: 'ti-radius-top-left', snippet: 'border-radius: $0;' },
    { id: 'web-css-shadow',   taal: 'css', groep: 'look', label: 'box-shadow',   icon: 'ti-shadow', snippet: 'box-shadow: 0 4px 12px $0;' },
    { id: 'web-css-opacity',  taal: 'css', groep: 'look', label: 'opacity',      icon: 'ti-droplet-half-2', snippet: 'opacity: $0;' },
    { id: 'web-css-overflow', taal: 'css', groep: 'look', label: 'overflow',     icon: 'ti-box-align-bottom-left', snippet: 'overflow: $0;' },

    // ── JS · DOM ────────────────────────────────────────────────────────────
    { id: 'web-js-qs',      taal: 'js', groep: 'dom', label: 'querySelector',     icon: 'ti-focus-2', snippet: 'document.querySelector(\'$0\')' },
    { id: 'web-js-qsa',     taal: 'js', groep: 'dom', label: 'querySelectorAll',  icon: 'ti-focus-centered', snippet: 'document.querySelectorAll(\'$0\')' },
    { id: 'web-js-id',      taal: 'js', groep: 'dom', label: 'getElementById',    icon: 'ti-id', snippet: 'document.getElementById(\'$0\')' },
    { id: 'web-js-create',  taal: 'js', groep: 'dom', label: 'createElement',     icon: 'ti-plus', snippet: 'document.createElement(\'$0\')' },
    { id: 'web-js-text',    taal: 'js', groep: 'dom', label: 'textContent',       icon: 'ti-text-recognition', snippet: '.textContent = \'$0\'' },
    { id: 'web-js-class',   taal: 'js', groep: 'dom', label: 'classList',         icon: 'ti-list-check', snippet: '.classList.add(\'$0\')' },

    // ── JS · events ─────────────────────────────────────────────────────────
    { id: 'web-js-listen',  taal: 'js', groep: 'events', label: 'addEventListener', icon: 'ti-ear', snippet: '.addEventListener(\'click\', (e) => {\n\t$0\n})' },
    { id: 'web-js-click',   taal: 'js', groep: 'events', label: 'click',            icon: 'ti-click', snippet: '.addEventListener(\'click\', () => {\n\t$0\n})' },
    { id: 'web-js-prevent', taal: 'js', groep: 'events', label: 'preventDefault',   icon: 'ti-hand-stop', snippet: 'e.preventDefault()' },
    { id: 'web-js-ready',   taal: 'js', groep: 'events', label: 'DOMContentLoaded', icon: 'ti-player-play', snippet: 'document.addEventListener(\'DOMContentLoaded\', () => {\n\t$0\n})' },

    // ── JS · data ───────────────────────────────────────────────────────────
    { id: 'web-js-fetch',   taal: 'js', groep: 'data', label: 'fetch',        icon: 'ti-cloud-download', snippet: 'fetch(\'$0\')\n\t.then((r) => r.json())\n\t.then((data) => {\n\t\t\n\t})\n\t.catch((err) => console.error(err))' },
    { id: 'web-js-local',   taal: 'js', groep: 'data', label: 'localStorage', icon: 'ti-database', snippet: 'localStorage.setItem(\'$0\', JSON.stringify(waarde))' },
    { id: 'web-js-get',     taal: 'js', groep: 'data', label: 'getItem',      icon: 'ti-database-import', snippet: 'JSON.parse(localStorage.getItem(\'$0\') || \'null\')' },
    { id: 'web-js-json',    taal: 'js', groep: 'data', label: 'JSON',         icon: 'ti-braces', snippet: 'JSON.stringify($0, null, 2)' },
    { id: 'web-js-log',     taal: 'js', groep: 'data', label: 'console.log',  icon: 'ti-terminal-2', snippet: 'console.log($0)' },
  ]

  const WEB_IDS = new Set(WEB_CMD_DEFS.map(d => d.id))

  // auto-id → i18n-sleutel. Minstens twee knoppen per groep (anders maakt
  // maakAutoMappen de map niet).
  const WEB_AUTO_MAPPEN = [
    { auto: 'web-html-struct', sleutel: 'folder.webHtmlStruct', taal: 'html', groep: 'struct' },
    { auto: 'web-html-tekst',  sleutel: 'folder.webHtmlTekst',  taal: 'html', groep: 'tekst' },
    { auto: 'web-html-media',  sleutel: 'folder.webHtmlMedia',  taal: 'html', groep: 'media' },
    { auto: 'web-css-layout',  sleutel: 'folder.webCssLayout',  taal: 'css',  groep: 'layout' },
    { auto: 'web-css-tekst',   sleutel: 'folder.webCssTekst',   taal: 'css',  groep: 'tekst' },
    { auto: 'web-css-look',    sleutel: 'folder.webCssLook',    taal: 'css',  groep: 'look' },
    { auto: 'web-js-dom',      sleutel: 'folder.webJsDom',      taal: 'js',   groep: 'dom' },
    { auto: 'web-js-events',   sleutel: 'folder.webJsEvents',   taal: 'js',   groep: 'events' },
    { auto: 'web-js-data',     sleutel: 'folder.webJsData',     taal: 'js',   groep: 'data' },
  ]

  function defVan(id) {
    return WEB_CMD_DEFS.find(d => d.id === id) || null
  }

  function isWebId(id) {
    return WEB_IDS.has(id)
  }

  function isWebAuto(auto) {
    return typeof auto === 'string' && auto.startsWith('web-')
  }

  function autoVoorDef(def) {
    if (!def) return ''
    const m = WEB_AUTO_MAPPEN.find(x => x.taal === def.taal && x.groep === def.groep)
    return m ? m.auto : ''
  }

  // Snippet → { tekst, cursor }. $0 markeert de cursorplek.
  function snippetInvoeg(snippet) {
    const s = String(snippet || '')
    const i = s.indexOf('$0')
    if (i < 0) return { tekst: s, cursor: s.length }
    return { tekst: s.slice(0, i) + s.slice(i + 2), cursor: i }
  }

  return {
    WEB_CMD_DEFS, WEB_IDS, WEB_AUTO_MAPPEN,
    defVan, isWebId, isWebAuto, autoVoorDef, snippetInvoeg,
  }
})
