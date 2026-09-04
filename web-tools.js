// Alles wat over websitebestanden gaat en zonder Electron te testen is.
//
// Zelfde patroon als git-tools.js: main.js en de tests halen het met require(),
// index.html met een <script>-tag, waarna het als WebTools klaarstaat.
;(function (root, factory) {
  const api = factory()
  if (typeof module === 'object' && module.exports) module.exports = api
  else root.WebTools = api
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {

  // ── Waar begint een site? ───────────────────────────────────────────────────
  // Op volgorde van waarschijnlijkheid. index.html is de conventie; de rest komt
  // van oudere sites en van mensen die het net anders doen.
  const START_NAMEN = [
    'index.html', 'index.htm',
    'home.html', 'home.htm',
    'default.html', 'default.htm',
    'main.html',
  ]

  // Eén laag diep, en alleen in mappen waar een site echt in zit. Dieper zoeken
  // betekent node_modules aflopen voor een vraag die binnen een tel beantwoord
  // moet zijn.
  const START_MAPPEN = ['public', 'dist', 'build', 'src', 'www', 'site', 'docs', 'web', 'html']

  // De plekken om te kijken, in de volgorde waarin ze gecontroleerd horen te
  // worden: eerst de map zelf, daarna de bekende submappen. Puur, zodat de
  // volgorde te testen is zonder schijf.
  function startKandidaten() {
    const uit = START_NAMEN.map(naam => ({ map: '', naam, relatief: naam }))
    for (const map of START_MAPPEN) {
      for (const naam of START_NAMEN) {
        uit.push({ map, naam, relatief: map + '/' + naam })
      }
    }
    return uit
  }

  // Van de gevonden bestanden naar de beste eerste keuze. De map zelf wint van
  // een submap, en binnen dezelfde plek wint de naam die hoger in de lijst
  // staat — dat is precies de volgorde die startKandidaten oplevert.
  function besteStart(gevonden) {
    const lijst = Array.isArray(gevonden) ? gevonden.filter(Boolean) : []
    return lijst.length ? lijst[0] : null
  }

  // ── Welke bestanden kunnen we laten zien? ───────────────────────────────────
  // Bewust kort. Een tekstvak met een video erin is een vastgelopen app, en
  // "alles wat leesbaar lijkt" is precies hoe je daar komt.
  const TEKST_EXT = [
    'html', 'htm', 'css', 'js', 'mjs', 'cjs', 'jsx', 'ts', 'tsx',
    'json', 'md', 'txt', 'svg', 'xml', 'yml', 'yaml', 'ini', 'env', 'log', 'csv',
  ]

  function extensieVan(naam) {
    const kaal = String(naam || '').split(/[\\/]/).pop()
    const punt = kaal.lastIndexOf('.')
    return punt > 0 ? kaal.slice(punt + 1).toLowerCase() : ''
  }

  function isTekstBestand(naam) {
    return TEKST_EXT.includes(extensieVan(naam))
  }

  // Alleen dit zijn websitebestanden. Gebruikt om te bepalen of een map een
  // site is en of het bewerken later zin heeft.
  const WEB_EXT = ['html', 'htm', 'css', 'js', 'mjs']
  function isWebBestand(naam) {
    return WEB_EXT.includes(extensieVan(naam))
  }

  // Grens voor wat we in beeld halen. Twee megabyte is ruim voor een html of
  // een css; daarboven wil je een editor, geen kijkvenster.
  const MAX_TEKST_BYTES = 2 * 1024 * 1024

  // ── De server ───────────────────────────────────────────────────────────────
  // Waarom er een server is en geen file:// — zie TODO-web.md. Kort: met
  // file:// weigert de browser fetch, laden ES-modules niet, en wijst een
  // absoluut pad als /style.css naar de wortel van je schijf.
  const MIME = {
    html: 'text/html; charset=utf-8',
    htm:  'text/html; charset=utf-8',
    css:  'text/css; charset=utf-8',
    js:   'text/javascript; charset=utf-8',
    mjs:  'text/javascript; charset=utf-8',
    json: 'application/json; charset=utf-8',
    svg:  'image/svg+xml',
    png:  'image/png',
    jpg:  'image/jpeg',
    jpeg: 'image/jpeg',
    gif:  'image/gif',
    webp: 'image/webp',
    avif: 'image/avif',
    ico:  'image/x-icon',
    woff: 'font/woff',
    woff2: 'font/woff2',
    ttf:  'font/ttf',
    otf:  'font/otf',
    mp4:  'video/mp4',
    webm: 'video/webm',
    mp3:  'audio/mpeg',
    wav:  'audio/wav',
    pdf:  'application/pdf',
    txt:  'text/plain; charset=utf-8',
    md:   'text/plain; charset=utf-8',
    xml:  'application/xml; charset=utf-8',
    map:  'application/json; charset=utf-8',
  }

  function mimeVoor(naam) {
    return MIME[extensieVan(naam)] || 'application/octet-stream'
  }

  // Van een url naar een pad binnen de site. Geeft null zodra er iets in zit
  // wat naar buiten wijst: dit is het enige dat tussen een lokale server en de
  // rest van je schijf staat.
  function padUitUrl(url) {
    let kaal = String(url || '').split('?')[0].split('#')[0]
    try { kaal = decodeURIComponent(kaal) } catch { return null }
    // Backslashes zijn op Windows ook scheidingstekens; anders glipt ..\ erdoor.
    kaal = kaal.replace(/\\/g, '/')
    if (kaal.includes('\0')) return null
    const delen = []
    for (const deel of kaal.split('/')) {
      if (!deel || deel === '.') continue
      if (deel === '..') return null            // niet "eentje omhoog": weigeren
      if (/^[a-zA-Z]:$/.test(deel)) return null // C: midden in een url
      delen.push(deel)
    }
    return delen.join('/')
  }

  // Van een url naar het bestand dat erbij hoort. Het scheidingsteken komt mee
  // zodat dit op Windows en in de tests hetzelfde werkt. Geeft null bij een url
  // die naar buiten wijst.
  function doelPad(wortel, url, sep) {
    const rel = padUitUrl(url)
    if (rel === null) return null
    const teken = sep || '/'
    const w = String(wortel || '').replace(/[\\/]+$/, '')
    if (!w) return null
    const staart = rel ? rel.split('/').join(teken) : 'index.html'
    return w + teken + staart
  }

  // Ligt dit pad binnen de site? Dit is het enige dat tussen een lokale server
  // en de rest van je schijf staat, dus het staat hier apart en getest.
  function binnenWortel(wortel, pad, sep) {
    const teken = sep || '/'
    const w = String(wortel || '').replace(/[\\/]+$/, '')
    const p = String(pad || '')
    if (!w || !p) return false
    return p === w || p.startsWith(w + teken)
  }

  return {
    START_NAMEN, START_MAPPEN, startKandidaten, besteStart,
    TEKST_EXT, WEB_EXT, extensieVan, isTekstBestand, isWebBestand,
    MAX_TEKST_BYTES, MIME, mimeVoor, padUitUrl, doelPad, binnenWortel,
  }
})
