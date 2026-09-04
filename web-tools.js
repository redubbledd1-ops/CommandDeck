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

  function isHtmlBestand(naam) {
    const e = extensieVan(naam)
    return e === 'html' || e === 'htm'
  }

  // Welk html-bestand openen in de browser? Huidige editor-html wint van
  // index/home — dat is precies wat je wilt als je aan page-2.html zit.
  function kiesSiteOpen(opties) {
    const o = opties || {}
    const sep = o.sep || '/'
    const huidig = o.huidigPad || ''
    const wortel = o.wortel || ''
    if (huidig && isHtmlBestand(huidig) && binnenWortel(wortel, huidig, sep)) {
      const w = String(wortel).replace(/[\\/]+$/, '')
      const teken = sep
      let relatief = huidig
      if (huidig.length >= w.length && (huidig === w || huidig.startsWith(w + teken))) {
        relatief = huidig.slice(w.length).replace(/^[\\/]+/, '') || huidig.split(/[\\/]/).pop()
      }
      return { pad: huidig, relatief: String(relatief).replace(/\\/g, '/') }
    }
    return besteStart(o.gevonden || [])
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

  // ── Opslaan zonder het bestand te verminken ────────────────────────────────
  // bat:save dwingt \r\n af omdat cmd.exe daarover struikelt. Voor html/css/js
  // hoort het bestand te blijven zoals het was: zelfde regeleindes, zelfde BOM.
  // Eerst alles naar \n, anders krijg je bij gemengde eindes een wirwar.
  function tekstVoorSchrijf(inhoud, opties) {
    const o = opties || {}
    let t = String(inhoud == null ? '' : inhoud)
    t = t.replace(/\r\n/g, '\n').replace(/\r/g, '\n')
    if (o.crlf) t = t.replace(/\n/g, '\r\n')
    if (o.bom) t = '\uFEFF' + t
    return t
  }

  // Ronde-trip: wat toString('utf8') ervan maakt moet weer dezelfde bytes zijn.
  // Anders zou opslaan stilletjes � zetten waar een Windows-1252-letter stond.
  function isGeldigUtf8(bytes) {
    if (!bytes || typeof bytes.length !== 'number') return false
    try {
      const alsTekst = Buffer.from(bytes).toString('utf8')
      return Buffer.compare(Buffer.from(alsTekst, 'utf8'), Buffer.from(bytes)) === 0
    } catch { return false }
  }

  // Zoeken in één bestand. Case-insensitive standaard: je zoekt een woord, niet
  // een exacte spelling. Geeft startposities terug zodat de UI erdoorheen kan.
  function zoekInTekst(tekst, naald, opties) {
    const bron = String(tekst == null ? '' : tekst)
    const q = String(naald == null ? '' : naald)
    if (!q) return []
    const gevoelig = !!(opties && opties.hoofdlettergevoelig)
    const bronL = gevoelig ? bron : bron.toLowerCase()
    const qL = gevoelig ? q : q.toLowerCase()
    const hits = []
    let van = 0
    while (van <= bronL.length) {
      const i = bronL.indexOf(qL, van)
      if (i < 0) break
      hits.push(i)
      van = i + Math.max(1, qL.length)
    }
    return hits
  }

  // ── Live-reload (ronde 3.1) ────────────────────────────────────────────────
  // Pad dat de server als EventSource aanbiedt. Mag nooit als bestandspad
  // gelezen worden — anders zou iemand een bestand zo kunnen noemen.
  const RELOAD_PAD = '/__cd_reload'

  function isReloadUrl(url) {
    const kaal = String(url || '').split('?')[0].split('#')[0]
    return kaal === RELOAD_PAD
  }

  // Script dat de pagina zichzelf laat verversen. Bewust klein en zonder
  // afhankelijkheden: dit gaat in élke html die we serveren.
  const RELOAD_SCRIPT =
    '<script>(function(){try{var e=new EventSource("' + RELOAD_PAD + '");' +
    'e.onmessage=function(){location.reload()}}catch(x){}})();</script>'

  // Vlak voor </body>, of anders aan het eind. Niet midden in de head: dan
  // blokkeert het laden. Alleen injecteren als er nog geen eigen EventSource
  // op ons pad staat — dubbel herladen is erger dan geen herladen.
  function injecteerReload(html) {
    const bron = String(html == null ? '' : html)
    if (bron.includes(RELOAD_PAD)) return bron
    const lager = bron.toLowerCase()
    const i = lager.lastIndexOf('</body>')
    if (i >= 0) return bron.slice(0, i) + RELOAD_SCRIPT + bron.slice(i)
    return bron + RELOAD_SCRIPT
  }

  // ── Welk soort project is dit? ─────────────────────────────────────────────
  // Flutter wint: een pubspec met Flutter erin is géén website-project, ook
  // niet als er toevallig een index.html in docs/ staat. Zonder Flutter en mét
  // een startpagina is de gok "website" — de gebruiker mag dat overrulen.
  function isWebsiteGok(opties) {
    const o = opties || {}
    if (o.flutter) return false
    return !!o.html
  }

  // ── Wat openen bij een project? ────────────────────────────────────────────
  // Globale voorkeur: eerste keer dat je een project opent. Daarna wint de
  // onthouden tab. website / flutter / overig hebben elk hun eigen keuzes.
  const PROJECT_OPEN_STANDAARD = {
    website: 'editor',
    flutter: 'output',
    overig:  'output',
  }
  const PROJECT_OPEN_KEUZES = {
    website: ['editor', 'verkenner', 'site', 'windows', 'niets'],
    flutter: ['output', 'verkenner', 'windows', 'niets'],
    overig:  ['output', 'verkenner', 'windows', 'niets'],
  }

  function projectOpenSoort(opties) {
    const o = opties || {}
    if (o.flutter) return 'flutter'
    if (o.website) return 'website'
    return 'overig'
  }

  function projectOpenKeuze(instelling, soort) {
    const sleutel = PROJECT_OPEN_KEUZES[soort] ? soort : 'overig'
    const mag = PROJECT_OPEN_KEUZES[sleutel]
    const standaard = PROJECT_OPEN_STANDAARD[sleutel]
    const gekozen = instelling && instelling[sleutel]
    return mag.includes(gekozen) ? gekozen : standaard
  }

  function termTabVoorOpenKeuze(keuze) {
    if (keuze === 'editor') return 'editor'
    if (keuze === 'verkenner') return 'browser'
    return 'output'
  }

  return {
    START_NAMEN, START_MAPPEN, startKandidaten, besteStart,
    TEKST_EXT, WEB_EXT, extensieVan, isTekstBestand, isWebBestand, isHtmlBestand,
    MAX_TEKST_BYTES, MIME, mimeVoor, padUitUrl, doelPad, binnenWortel,
    tekstVoorSchrijf, isGeldigUtf8, zoekInTekst, isWebsiteGok, kiesSiteOpen,
    PROJECT_OPEN_STANDAARD, PROJECT_OPEN_KEUZES, projectOpenSoort,
    projectOpenKeuze, termTabVoorOpenKeuze,
    RELOAD_PAD, isReloadUrl, RELOAD_SCRIPT, injecteerReload,
  }
})
