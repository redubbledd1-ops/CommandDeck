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

// ── De bedrading ─────────────────────────────────────────────────────────────
const main = fs.readFileSync(path.join(APP, 'main.js'), 'utf8')
const pre = fs.readFileSync(path.join(APP, 'preload.js'), 'utf8')
const ren = fs.readFileSync(path.join(APP, 'renderer.js'), 'utf8')
const html = fs.readFileSync(path.join(APP, 'index.html'), 'utf8')
const css = fs.readFileSync(path.join(APP, 'style.css'), 'utf8')

t('main kan een site zoeken, lezen en serveren',
  /ipcMain\.handle\('web:zoekSite'/.test(main)
  && /ipcMain\.handle\('fs:leesTekst'/.test(main)
  && /ipcMain\.handle\('web:start'/.test(main))
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
  /zoekSite:/.test(pre) && /leesTekst:/.test(pre) && /siteStart:/.test(pre))

t('index.html laadt web-tools.js vóór renderer.js',
  html.includes('src="web-tools.js"')
  && html.indexOf('src="web-tools.js"') < html.indexOf('src="renderer.js"'))
t('en heeft een leesvenster', /id="modal-lezer"/.test(html) && /id="lezer-inhoud"/.test(html))
t('met opmaak', css.includes('.lezer-inhoud {') && css.includes('.modal.modal-groot {'))

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
  /modal-lezer'\)\.hidden\)\s*\{ e\.preventDefault\(\); sluitLezer\(\)/.test(ren))

for (const sleutel of ['sleep.titel', 'sleep.tekst', 'sleep.tekstBestaand', 'sleep.alProject',
                       'sleep.htmlGevonden', 'sleep.inVerkenner', 'sleep.alsProject', 'sleep.alsSite',
                       'sleep.welkeStart', 'sleep.welkeStartTekst', 'sleep.siteDraait',
                       'sleep.siteMisluktTitel', 'sleep.siteMisluktTekst', 'sleep.nietsMeeTeDoen',
                       'lezer.kopieer', 'lezer.inMap', 'lezer.metWindows', 'lezer.gekopieerd',
                       'lezer.info', 'lezer.nietGelukt', 'lezer.teGroot', 'lezer.binair',
                       'lezer.onleesbaar']) {
  t('tekst ' + sleutel + ' bestaat in nl en en', !!nl[sleutel] && !!en[sleutel])
}
t('de sleep-overlay noemt niet meer alleen bat',
  !/\.bat/i.test(nl['dropOverlay.subtitle']))

console.log(ok ? '\nALLE WEB-TESTS OK' : '\nER ZIJN WEB-TESTS GEZAKT')
process.exit(ok ? 0 : 1)
