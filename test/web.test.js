// Websitebestanden openen: de pure logica uit web-tools.js, plus de teksten en
// de bedrading die erbij hoort. De UI-kant staat in ui.test.js.
const fs = require('fs'), path = require('path')
const W = require('../web-tools')

const APP = path.join(__dirname, '..')
const nl = JSON.parse(fs.readFileSync(path.join(APP, 'locales/nl.json'), 'utf8'))
const en = JSON.parse(fs.readFileSync(path.join(APP, 'locales/en.json'), 'utf8'))

let ok = true
const t = (l, c) => { console.log((c ? 'PASS  ' : 'FAIL  ') + l); if (!c) ok = false }

// ── Waar begint een site ─────────────────────────────────────────────────────
// De volgorde is de hele functie: de map zelf wint van een submap, en
// index.html wint van de rest. Zonder die volgorde is "de site openen" een gok.
const kandidaten = W.startKandidaten()
t('index.html staat vooraan', kandidaten[0].relatief === 'index.html')
t('de map zelf komt vóór elke submap',
  kandidaten.slice(0, W.START_NAMEN.length).every(k => k.map === ''))
t('daarna public/, want dat is de gewoonte',
  kandidaten[W.START_NAMEN.length].relatief === 'public/index.html')
t('elke naam wordt in elke submap gezocht',
  kandidaten.length === W.START_NAMEN.length * (1 + W.START_MAPPEN.length))
t('en nooit dieper dan één laag',
  kandidaten.every(k => (k.relatief.match(/\//g) || []).length <= 1))
t('node_modules staat er niet bij', !W.START_MAPPEN.includes('node_modules'))

t('zonder gevonden bestand geen startpunt', W.besteStart([]) === null)
t('en anders het eerste', W.besteStart([{ relatief: 'a' }, { relatief: 'b' }]).relatief === 'a')

// ── Wat mogen we laten zien ──────────────────────────────────────────────────
t('extensie uit een pad', W.extensieVan('C:\\a\\b\\stijl.CSS') === 'css')
t('zonder punt geen extensie', W.extensieVan('LICENSE') === '')
t('een punt vooraan telt niet als extensie', W.extensieVan('.gitignore') === '')

for (const naam of ['a.html', 'a.css', 'a.js', 'a.json', 'a.md', 'a.svg']) {
  t('tekst: ' + naam, W.isTekstBestand(naam) === true)
}
for (const naam of ['a.png', 'a.exe', 'a.zip', 'a.mp4', 'a.pdf']) {
  t('geen tekst: ' + naam, W.isTekstBestand(naam) === false)
}

// Alleen webbestanden gaan in de verkenner naar het leesvenster. Elk
// tekstbestand afvangen zou veranderen wat dubbelklikken al jaren doet.
t('html, css en js zijn webbestanden',
  W.isWebBestand('a.html') && W.isWebBestand('a.css') && W.isWebBestand('a.js'))
t('json en yaml niet — die horen naar je eigen programma',
  !W.isWebBestand('a.json') && !W.isWebBestand('a.yaml'))
t('maar ze zijn wél tekst, dus slepen mag',
  W.isTekstBestand('a.json') && W.isTekstBestand('a.yaml'))

t('de grens ligt op 2 MB', W.MAX_TEKST_BYTES === 2 * 1024 * 1024)

// ── De server ────────────────────────────────────────────────────────────────
t('css krijgt het juiste type', /text\/css/.test(W.mimeVoor('a.css')))
t('js ook', /javascript/.test(W.mimeVoor('a.mjs')))
t('en iets onbekends wordt niet geraden',
  W.mimeVoor('a.xyz') === 'application/octet-stream')

// Dit is het enige dat tussen een lokale server en de rest van je schijf staat.
t('een gewoon pad mag', W.padUitUrl('/css/stijl.css') === 'css/stijl.css')
t('de wortel geeft leeg', W.padUitUrl('/') === '')
t('vraagteken en hekje vallen eraf', W.padUitUrl('/a.css?v=2#top') === 'a.css')
t('procent-codering wordt gelezen', W.padUitUrl('/mijn%20map/a.css') === 'mijn map/a.css')
for (const stout of ['/../geheim', '/a/../../x', '/%2e%2e/x', '/..%2fx', '/a\\..\\..\\x', '/C:/Windows']) {
  t('geweigerd: ' + stout, W.padUitUrl(stout) === null)
}
t('een losse punt is geen stap omhoog', W.padUitUrl('/./a.css') === 'a.css')

t('doelpad met het scheidingsteken van Windows',
  W.doelPad('C:\\site', '/css/a.css', '\\') === 'C:\\site\\css\\a.css')
t('de wortel wordt index.html',
  W.doelPad('C:\\site', '/', '\\') === 'C:\\site\\index.html')
t('en een stoute url geeft niets', W.doelPad('C:\\site', '/../x', '\\') === null)

t('binnen de map is binnen', W.binnenWortel('C:\\site', 'C:\\site\\a.css', '\\'))
t('de map zelf ook', W.binnenWortel('C:\\site', 'C:\\site', '\\'))
t('een map die er alleen op lijkt niet',
  !W.binnenWortel('C:\\site', 'C:\\site2\\a.css', '\\'))
t('en ernaast al helemaal niet',
  !W.binnenWortel('C:\\site', 'C:\\anders\\a.css', '\\'))

// ── Opslaan zonder te verminken ──────────────────────────────────────────────
// bat:save dwingt CRLF af; hier hoort het bestand te blijven zoals het was.
t('LF blijft LF', W.tekstVoorSchrijf('a\nb', { crlf: false }) === 'a\nb')
t('CRLF blijft CRLF', W.tekstVoorSchrijf('a\nb', { crlf: true }) === 'a\r\nb')
t('gemengde eindes worden één soort',
  W.tekstVoorSchrijf('a\r\nb\rc\nd', { crlf: true }) === 'a\r\nb\r\nc\r\nd')
t('BOM komt terug vooraan',
  W.tekstVoorSchrijf('x', { bom: true }).charCodeAt(0) === 0xfeff)
t('zonder vlag geen BOM',
  W.tekstVoorSchrijf('x', { bom: false }).charCodeAt(0) !== 0xfeff)
t('geldige utf-8 wordt herkend', W.isGeldigUtf8(Buffer.from('café', 'utf8')))
t('ongeldige bytes niet', !W.isGeldigUtf8(Buffer.from([0xc3, 0x28])))

t('zoeken vindt ongeacht hoofdletters',
  W.zoekInTekst('Abc abc', 'ABC').length === 2)
t('lege naald geeft niets', W.zoekInTekst('abc', '').length === 0)
t('hoofdlettergevoelig kan aan',
  W.zoekInTekst('Abc abc', 'ABC', { hoofdlettergevoelig: true }).length === 0)

// ── De bedrading ─────────────────────────────────────────────────────────────
const main = fs.readFileSync(path.join(APP, 'main.js'), 'utf8')
const pre = fs.readFileSync(path.join(APP, 'preload.js'), 'utf8')
const ren = fs.readFileSync(path.join(APP, 'renderer.js'), 'utf8')
const html = fs.readFileSync(path.join(APP, 'index.html'), 'utf8')
const css = fs.readFileSync(path.join(APP, 'style.css'), 'utf8')

t('main kan een site zoeken, lezen, schrijven en serveren',
  /ipcMain\.handle\('web:zoekSite'/.test(main)
  && /ipcMain\.handle\('fs:leesTekst'/.test(main)
  && /ipcMain\.handle\('fs:schrijfTekst'/.test(main)
  && /ipcMain\.handle\('web:start'/.test(main))
t('opslaan gebruikt tekstVoorSchrijf, niet de CRLF-dwang van bat',
  /fs:schrijfTekst'[\s\S]{0,500}tekstVoorSchrijf/.test(main)
  && !/ipcMain\.handle\('fs:schrijfTekst'[\s\S]{0,400}replace\(\/\\r\?\\n/.test(main))
t('lezen weigert niet-utf8', /'geen-utf8'/.test(main))
t('de server luistert alleen op deze pc',
  /server\.listen\(0, '127\.0\.0\.1'/.test(main))
t('en gaat dicht als de app weg is',
  /app\.on\('will-quit'[\s\S]{0,240}sites\.clear\(\)/.test(main))
t('dezelfde map twee keer openen geeft geen tweede server',
  /if \(s\.dir === dir\) return \{ ok: true/.test(main))
t('elke aanvraag wordt op insluiting getoetst',
  /WebTools\.binnenWortel\(wortel, echt, path\.sep\)/.test(main))
t('groot en binair worden geweigerd bij het lezen',
  /'te-groot'/.test(main) && /'binair'/.test(main))
t('preload geeft de nieuwe wegen door',
  /zoekSite:/.test(pre) && /leesTekst:/.test(pre)
  && /schrijfTekst:/.test(pre) && /siteStart:/.test(pre))

t('index.html laadt web-tools.js vóór renderer.js',
  html.includes('src="web-tools.js"')
  && html.indexOf('src="web-tools.js"') < html.indexOf('src="renderer.js"'))
t('en heeft een bewerkbaar leesvenster',
  /id="modal-lezer"/.test(html)
  && /id="lezer-inhoud"/.test(html)
  && /<textarea[^>]*id="lezer-inhoud"/.test(html)
  && /id="lezer-opslaan"/.test(html)
  && /id="lezer-regels"/.test(html)
  && /id="lezer-zoek"/.test(html))
t('met opmaak voor regels en zoeken',
  css.includes('.lezer-inhoud {')
  && css.includes('.lezer-regels')
  && css.includes('.lezer-zoek')
  && css.includes('.modal.modal-groot {'))

t('slepen gaat langs één plek die kijkt wat het is',
  /async function verwerkGesleept\(/.test(ren))
t('een map geeft een keuze in plaats van een gok',
  /async function vraagOverMap\(/.test(ren))
const renKaal = ren.replace(/^\s*\/\/.*$/gm, '')
t('en de site start via het servertje, niet via file://',
  /window\.api\.siteStart\(/.test(ren) && !/file:\/\//.test(renKaal))
t('een map die al een project is wordt herkend',
  /const bestaand = projects\.find/.test(ren))
t('het projectvenster krijgt het pad al ingevuld',
  /function openNieuwProjectMet\(/.test(ren))
t('escape sluit het leesvenster',
  /modal-lezer'\)\.hidden\)[\s\S]{0,280}sluitLezer\(/.test(ren))
t('niet-opgeslagen werk hangt aan de bestaande haak',
  /controleerOnveiligWerk[\s\S]{0,200}controleerLezerWerk/.test(ren)
  && /async function selectProject\(/.test(ren)
  && /controleerLezerWerk\('wisselen'\)/.test(ren))
t('tab springt in, niet naar de volgende knop',
  /e\.key === 'Tab'/.test(ren) && /\\t'/.test(ren))
t('ctrl\+s slaat op',
  /e\.key === 's'/.test(ren) && /slaLezerOp\(/.test(ren))

for (const sleutel of ['sleep.titel', 'sleep.tekst', 'sleep.tekstBestaand', 'sleep.alProject',
                       'sleep.htmlGevonden', 'sleep.inVerkenner', 'sleep.alsProject', 'sleep.alsSite',
                       'sleep.welkeStart', 'sleep.welkeStartTekst', 'sleep.siteDraait',
                       'sleep.siteMisluktTitel', 'sleep.siteMisluktTekst', 'sleep.nietsMeeTeDoen',
                       'lezer.kopieer', 'lezer.inMap', 'lezer.metWindows', 'lezer.gekopieerd',
                       'lezer.info', 'lezer.nietGelukt', 'lezer.teGroot', 'lezer.binair',
                       'lezer.onleesbaar', 'lezer.geenUtf8', 'lezer.nietOpgeslagen',
                       'lezer.bestand', 'lezer.opgeslagen', 'lezer.opslaanMislukt',
                       'lezer.opslaanMisluktTekst', 'lezer.eldersTitel', 'lezer.eldersTekst',
                       'lezer.opnieuwInlezen', 'lezer.overschrijven', 'lezer.wisselTitel',
                       'lezer.wisselTekst', 'lezer.afsluitTitel', 'lezer.afsluitTekst',
                       'lezer.nietOpslaan', 'lezer.zoeken', 'lezer.zoekPlaceholder',
                       'lezer.zoekVorige', 'lezer.zoekVolgende',
                       'lezer.zoekTreffers', 'lezer.zoekNiets']) {
  t('tekst ' + sleutel + ' bestaat in nl en en', !!nl[sleutel] && !!en[sleutel])
}
t('de sleep-overlay noemt niet meer alleen bat',
  !/\.bat/i.test(nl['dropOverlay.subtitle']))

// ── Opslaan op schijf (ipc) ──────────────────────────────────────────────────
// Zonder Electron, met dezelfde handlers als bat.test.js. Bewijst dat CRLF en
// BOM blijven, en dat bat:save níét per ongeluk wordt gebruikt.
const Module = require('module'), os = require('os')
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'web-schrijf-'))
const handlers = {}
const fake = {
  app: { getPath: () => TMP, whenReady: () => ({ then: () => {} }), on: () => {},
         relaunch: () => {}, quit: () => {}, exit: () => {}, isPackaged: false,
         getAppPath: () => APP },
  BrowserWindow: function () {
    this.on = () => {}; this.close = () => {}; this.loadFile = () => {}
    this.webContents = { send: () => {} }; this.isDestroyed = () => false
  },
  ipcMain: { on: () => {}, handle: (n, f) => { handlers[n] = f } },
  dialog: { showOpenDialog: async () => ({ canceled: true }) },
  shell: { openPath: () => {} },
}
const origLoad = Module._load
Module._load = function (r) {
  if (r === 'electron') return fake
  return origLoad.apply(this, arguments)
}
require(path.join(APP, 'main.js'))
Module._load = origLoad
const call = (n, a) => handlers[n](null, a)

;(async () => {
  const lf = path.join(TMP, 'lf.css')
  fs.writeFileSync(lf, 'a\nb\n', 'utf8')
  let r = await call('fs:leesTekst', lf)
  t('lezen ziet LF', r.ok && r.crlf === false && r.inhoud === 'a\nb\n')
  r = await call('fs:schrijfTekst', { pad: lf, inhoud: 'x\ny', bom: false, crlf: false })
  t('opslaan met LF blijft LF', r.ok && fs.readFileSync(lf, 'utf8') === 'x\ny')

  const crlf = path.join(TMP, 'crlf.html')
  fs.writeFileSync(crlf, 'a\r\nb\r\n', 'utf8')
  r = await call('fs:leesTekst', crlf)
  t('lezen ziet CRLF', r.ok && r.crlf === true)
  r = await call('fs:schrijfTekst', { pad: crlf, inhoud: 'p\nq', bom: false, crlf: true })
  t('opslaan met CRLF blijft CRLF',
    r.ok && fs.readFileSync(crlf, 'utf8') === 'p\r\nq')

  const bom = path.join(TMP, 'bom.js')
  fs.writeFileSync(bom, '\uFEFFconst x = 1\n', 'utf8')
  r = await call('fs:leesTekst', bom)
  t('lezen ziet de BOM en haalt hem uit het venster',
    r.ok && r.bom === true && !r.inhoud.startsWith('\uFEFF'))
  r = await call('fs:schrijfTekst', { pad: bom, inhoud: r.inhoud, bom: true, crlf: false })
  t('opslaan zet de BOM terug',
    r.ok && fs.readFileSync(bom, 'utf8').charCodeAt(0) === 0xfeff)

  const bin = path.join(TMP, 'bin.css')
  fs.writeFileSync(bin, Buffer.from([0x61, 0x00, 0x62]))
  r = await call('fs:leesTekst', bin)
  t('binair wordt geweigerd', r.ok === false && r.reden === 'binair')

  const slecht = path.join(TMP, 'win1252.css')
  fs.writeFileSync(slecht, Buffer.from([0x63, 0x6f, 0x6c, 0x6f, 0x75, 0x72, 0x3a, 0x20, 0xe9]))
  r = await call('fs:leesTekst', slecht)
  t('geen utf-8 wordt geweigerd', r.ok === false && r.reden === 'geen-utf8')

  console.log(ok ? '\nALLE WEB-TESTS OK' : '\nER ZIJN WEB-TESTS GEZAKT')
  process.exit(ok ? 0 : 1)
})().catch(e => { console.error(e); process.exit(1) })
