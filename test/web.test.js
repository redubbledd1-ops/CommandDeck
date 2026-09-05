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

t('html zonder flutter is een website-gok',
  W.isWebsiteGok({ flutter: false, html: true }) === true)
t('flutter wint van html',
  W.isWebsiteGok({ flutter: true, html: true }) === false)
t('zonder html geen website',
  W.isWebsiteGok({ flutter: false, html: false }) === false)

t('html-bestand wordt herkend', W.isHtmlBestand('x/Page.HTML') && !W.isHtmlBestand('x.css'))
t('open kiest de html die je bewerkt',
  W.kiesSiteOpen({
    huidigPad: 'C:\\site\\about.html', wortel: 'C:\\site', sep: '\\',
    gevonden: [{ pad: 'C:\\site\\index.html', relatief: 'index.html' }],
  }).relatief === 'about.html')
t('zonder open html valt open terug op index',
  W.kiesSiteOpen({
    huidigPad: 'C:\\site\\stijl.css', wortel: 'C:\\site', sep: '\\',
    gevonden: [{ pad: 'C:\\site\\index.html', relatief: 'index.html' }],
  }).relatief === 'index.html')
t('buiten de map telt de huidige html niet',
  W.kiesSiteOpen({
    huidigPad: 'C:\\anders\\x.html', wortel: 'C:\\site', sep: '\\',
    gevonden: [{ pad: 'C:\\site\\home.html', relatief: 'home.html' }],
  }).relatief === 'home.html')

// ── Lichte aanvulling ────────────────────────────────────────────────────────
const A = require('../lezer-aanvul')
t('taal volgt de extensie',
  A.taalVanPad('a/b.html') === 'html'
  && A.taalVanPad('x.CSS') === 'css'
  && A.taalVanPad('app.mjs') === 'js')
t('html: m na < geeft main',
  A.voorstellen('html', 'm').includes('main')
  && A.voorstellen('html', 'h').includes('h1'))
t('html-context pikt de tag-prefix',
  A.contextBijCursor('<div><m', 8, 'html').prefix === 'm')
t('html-invoeg zet sluit-tag erbij',
  A.invoegTekst('html', 'main', { soort: 'tag', sluit: false }).tekst === 'main></main>')
t('sluit-tag alleen de naam',
  A.invoegTekst('html', 'main', { soort: 'tag', sluit: true }).tekst === 'main')
t('css: t geeft text-opties',
  A.voorstellen('css', 't').includes('text-align')
  && A.voorstellen('css', 't').includes('text-decoration'))
t('css-invoeg zet dubbele punt',
  A.invoegTekst('css', 'color', { soort: 'prop' }).tekst === 'color: ')
t('js: q geeft querySelector',
  A.voorstellen('js', 'q').includes('querySelector'))
t('lijst is begrensd en scrollbaar bedoeld',
  A.voorstellen('html', 'a').length <= A.MAX_VOORSTELLEN)
t('bij cursor in html komt een lijst',
  !!A.voorstellenBijCursor('<h', 2, 'index.html')
  && A.voorstellenBijCursor('<h', 2, 'index.html').lijst.includes('h1'))

t('website-open-standaard is de editor',
  W.projectOpenKeuze({}, 'website') === 'editor')
t('flutter-open-standaard is uitvoer',
  W.projectOpenKeuze({}, 'flutter') === 'output')
t('ongeldige open-keuze valt terug',
  W.projectOpenKeuze({ website: 'xyz' }, 'website') === 'editor')
t('site-keuze blijft site',
  W.projectOpenKeuze({ website: 'site' }, 'website') === 'site')
t('flutter wint van website bij soort',
  W.projectOpenSoort({ flutter: true, website: true }) === 'flutter')
t('open-keuze editor → termTab editor',
  W.termTabVoorOpenKeuze('editor') === 'editor'
  && W.termTabVoorOpenKeuze('verkenner') === 'browser'
  && W.termTabVoorOpenKeuze('site') === 'output')

// ── Website-helpknoppen ──────────────────────────────────────────────────────
const WK = require('../web-knoppen')
t('elke web-knop heeft een snippet',
  WK.WEB_CMD_DEFS.every(d => d.snippet && d.taal && d.groep))
t('html/css/js hebben elk meerdere groepen',
  new Set(WK.WEB_CMD_DEFS.filter(d => d.taal === 'html').map(d => d.groep)).size >= 3
  && new Set(WK.WEB_CMD_DEFS.filter(d => d.taal === 'css').map(d => d.groep)).size >= 3
  && new Set(WK.WEB_CMD_DEFS.filter(d => d.taal === 'js').map(d => d.groep)).size >= 3)
t('snippet $0 wordt cursor',
  WK.snippetInvoeg('<div>$0</div>').tekst === '<div></div>'
  && WK.snippetInvoeg('<div>$0</div>').cursor === 5)
t('negen uitklap-mappen voor web',
  WK.WEB_AUTO_MAPPEN.length === 9)

t('reload-pad is herkenbaar', W.isReloadUrl('/__cd_reload') && W.isReloadUrl('/__cd_reload?x=1'))
t('gewoon pad is geen reload', !W.isReloadUrl('/index.html'))
t('reload-script komt vóór </body>',
  W.injecteerReload('<html><body>x</body></html>').includes('</body>')
  && W.injecteerReload('<html><body>x</body></html>').indexOf('EventSource')
    < W.injecteerReload('<html><body>x</body></html>').indexOf('</body>'))
t('dubbel injecteren doet niets',
  (() => { const een = W.injecteerReload('<body></body>'); return W.injecteerReload(een) === een })())
t('zonder body komt het script achteraan',
  W.injecteerReload('<p>x</p>').endsWith(W.RELOAD_SCRIPT))

// ── Minified bron leesbaar maken ─────────────────────────────────────────────
const miniHtml = '<header><nav><a href="index.html">Home</a><a href="projecten.html">Projecten</a></nav></header><main><section class="hero"><h1>Het <em>voelt</em><br>als <span>thuiskomen.</span></h1><p class="intro">Onda ontwerpt plekken.</p></section></main>'
t('één lange html-regel heeft opmaak nodig', W.heeftOpmaakNodig(miniHtml))
t('nette html met regels niet',
  !W.heeftOpmaakNodig('<html>\n  <body>\n    <p>x</p>\n  </body>\n</html>\n'))
const mooiHtml = W.formatTekst(miniHtml, 'index.html')
t('minified html krijgt meerdere regels', mooiHtml.split('\n').length >= 8)
t('nav en main staan onder elkaar',
  mooiHtml.includes('<nav>') && mooiHtml.indexOf('<nav>') < mooiHtml.indexOf('</nav>')
  && mooiHtml.indexOf('</nav>') < mooiHtml.indexOf('<main>'))
t('inline tags blijven bruikbaar (em/span)',
  mooiHtml.includes('<em>voelt</em>') && mooiHtml.includes('<span>thuiskomen.</span>'))
t('indentatie met twee spaties',
  /^ {2}<nav>/m.test(mooiHtml) || /^ {2}<a /m.test(mooiHtml))

const miniCss = 'body{margin:0;color:#111}.hero{display:flex;gap:1rem}'
const mooiCss = W.formatTekst(miniCss, 'style.css')
t('minified css krijgt regels',
  mooiCss.split('\n').length >= 4
  && (mooiCss.includes('margin: 0') || mooiCss.includes('margin:0')))
t('css heeft accolades op eigen plek', mooiCss.includes('{') && mooiCss.includes('}'))

const miniJs = 'function hi(n){const x=n+1;return x}'
const mooiJs = W.formatTekst(miniJs, 'script.js')
t('minified js krijgt regels', mooiJs.split('\n').length >= 3)
t('json wordt netjes',
  W.formatTekst('{"a":1,"b":[2,3]}', 'data.json').includes('\n  "a"'))
t('onbekende extensie blijft zoals hij is',
  W.formatTekst(miniHtml, 'notes.txt') === miniHtml)
t('al nette bron blijft onaangeroerd',
  (() => { const n = 'body {\n  margin: 0;\n}\n'; return W.formatTekst(n, 'a.css') === n })())

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
  /app\.on\('will-quit'[\s\S]{0,240}sluitSite\(/.test(main))
t('dezelfde map twee keer openen geeft geen tweede server',
  /if \(s\.dir !== wortel\) continue/.test(main)
  && /hergebruikt: true/.test(main)
  && /siteUrlVoor\(/.test(main))
t('elke aanvraag wordt op insluiting getoetst',
  /WebTools\.binnenWortel\(wortel, echt, path\.sep\)/.test(main))
t('live-reload hangt aan EventSource en watch',
  /isReloadUrl\(req\.url\)/.test(main)
  && /fs\.watch\(wortel/.test(main)
  && /injecteerReload/.test(main)
  && /seinSitesVoorPad\(pad\)/.test(main))
t('groot en binair worden geweigerd bij het lezen',
  /'te-groot'/.test(main) && /'binair'/.test(main))
t('preload geeft de nieuwe wegen door',
  /zoekSite:/.test(pre) && /leesTekst:/.test(pre)
  && /schrijfTekst:/.test(pre) && /siteStart:/.test(pre))
t('editor maakt minified bron leesbaar bij openen',
  /formatTekst\(r\.inhoud,\s*pad\)/.test(ren)
  && /formatTekst\(r\.inhoud,\s*tab\.pad\)/.test(ren))

t('index.html laadt web-tools.js vóór renderer.js',
  html.includes('src="web-tools.js"')
  && html.indexOf('src="web-tools.js"') < html.indexOf('src="renderer.js"'))
t('CSP laat de site-preview-iframe toe op 127.0.0.1',
  /frame-src[^"]*127\.0\.0\.1/.test(html))
t('site-preview gebruikt webview i.p.v. iframe (Electron)',
  /<webview[^>]*id="site-preview-frame"/.test(ren)
  && /webviewTag:\s*true/.test(main))
t('en lezer-aanvul.js vóór renderer.js',
  html.includes('src="lezer-aanvul.js"')
  && html.indexOf('src="lezer-aanvul.js"') < html.indexOf('src="renderer.js"'))
t('en web-knoppen.js vóór renderer.js',
  html.includes('src="web-knoppen.js"')
  && html.indexOf('src="web-knoppen.js"') < html.indexOf('src="renderer.js"'))
t('en heeft een bewerkbaar leesvenster',
  /data-pane="editor"/.test(ren)
  && /data-tab="editor"/.test(ren)
  && /id="lezer-inhoud"/.test(ren)
  && /id="lezer-opslaan"/.test(ren)
  && /id="lezer-regels"/.test(ren)
  && /id="lezer-zoek"/.test(ren)
  && /id="lezer-tabs"/.test(ren))
t('met opmaak voor regels, zoeken en bestandstabjes',
  css.includes('.lezer-inhoud {')
  && css.includes('.lezer-regels')
  && css.includes('.lezer-zoek')
  && css.includes('.lezer-term')
  && css.includes('.lezer-tab'))
t('editor is een derde termTab',
  /'output' \| 'browser' \| 'editor'/.test(ren)
  && /function setTermTab\(tab\)/.test(ren)
  && /tab !== 'editor'/.test(ren)
  && /function standaardTermTab\(/.test(ren)
  && /function openWebsiteStart\(/.test(ren))
t('bestand-tab alleen zichtbaar met open bestand',
  /function verversBestandTabZichtbaarheid/.test(ren)
  && /b\.hidden = !aan/.test(ren)
  && /data-tab="editor" hidden/.test(ren)
  && /tab === 'editor' && !lezerStaat\.tabs\.length/.test(ren))
t('meerdere bestanden openen als tabjes',
  /lezerStaat\.tabs/.test(ren)
  && /function kiesLezerTab\(/.test(ren)
  && /function sluitLezerTab\(/.test(ren)
  && /function tekenLezerTabs\(/.test(ren))
t('website-projecten krijgen een open-knop i.p.v. terminal-knoppen',
  /id="btn-site-open"/.test(ren)
  && /alleen-site/.test(ren)
  && /alleen-terminal/.test(ren)
  && /function openSiteVanProject\(/.test(ren)
  && /function werkTermBarVoorProject\(/.test(ren))
t('project-openen is globaal in te stellen',
  /projectOpenen:/.test(main)
  && /function openProjectStart\(/.test(ren)
  && /set-open-\$\{soort\}/.test(ren)
  && /settings\.section\.projectOpenTitle/.test(JSON.stringify(nl)))
t('website-projecten hebben helpknoppen per taal, zonder flutter',
  /WEB_CMD_DEFS/.test(ren)
  && /function projectToonbaar\(/.test(ren)
  && /function voegWebSnippetToe\(/.test(ren)
  && /zorgVoorWebKnoppen/.test(ren)
  && /f\.auto === FLUTTER_MAP/.test(ren)
  && /aiDienstenOpProject\(bron\)/.test(ren)
  && !/website && d\.programma/.test(ren))
t('website toont AI-programma\'s (Claude Code e.d.) in programma\'s-map',
  /aiDienstenOpProject\(bron\)/.test(ren) && /if \(website\) return true/.test(ren))
t('mapklik sloopt het werkvlak niet bij hetzelfde project',
  /houdWerkvlak = !!wrapBestaat && zelfdeProject/.test(ren))
t('output is site-preview bij website-projecten',
  /id="site-preview"/.test(ren)
  && /function verversSitePreview\(/.test(ren)
  && /function sitePreviewAan\(/.test(ren)
  && /sitePreviewToonUitvoer/.test(ren)
  && css.includes('.site-preview-frame'))
t('lichte aanvulling in de editor',
  /id="lezer-aanvul"/.test(ren)
  && /function verversLezerAanvul\(/.test(ren)
  && /pasLezerAanvulToe/.test(ren)
  && css.includes('.lezer-aanvul')
  && css.includes('max-height: 220px'))
t('editor mag in split blijven (geen dichtgooien)',
  /function normaliseerProjectTab\(/.test(ren)
  && !/zetTermSplit\(null\)/.test(
    ren.slice(ren.indexOf('function setTermTab'), ren.indexOf('async function navigeerNaar'))))
t('springNaarOutput haalt ook de editor weg',
  /termTab !== 'output'\) setTermTab\('output'\)/.test(ren)
  || /setTermTab\('output'\)/.test(
    ren.slice(ren.indexOf('function springNaarOutput'), ren.indexOf('function leesTermSplit'))))

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
  /termTab === 'editor' && view === 'project'[\s\S]{0,500}sluitLezer\(/.test(ren))
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
                       'lezer.bestand', 'lezer.leeg', 'lezer.leegPlaceholder', 'lezer.geenProject',
                       'lezer.opgeslagen', 'lezer.opslaanMislukt',
                       'lezer.opslaanMisluktTekst', 'lezer.eldersTitel', 'lezer.eldersTekst',
                       'lezer.opnieuwInlezen', 'lezer.overschrijven', 'lezer.wisselTitel',
                       'lezer.wisselTekst', 'lezer.afsluitTitel', 'lezer.afsluitTekst',
                       'lezer.nietOpslaan', 'lezer.zoeken', 'lezer.zoekPlaceholder',
                       'lezer.zoekVorige', 'lezer.zoekVolgende',
                       'lezer.zoekTreffers', 'lezer.zoekNiets', 'lezer.tabSluiten',
                       'term.tabEditor', 'term.tabSite', 'term.sitePreviewReload',
                       'term.sitePreviewShowOutput', 'term.sitePreviewOutputMode',
                       'term.siteOpenButton', 'term.siteOpenTitle',
                       'term.siteGeenHtml', 'modal.project.websiteLabel',
                       'settings.section.projectOpenTitle', 'settings.projectOpen.desc',
                       'settings.projectOpen.website', 'settings.projectOpen.flutter',
                       'settings.projectOpen.overig', 'settings.projectOpen.opt.editor',
                       'settings.projectOpen.opt.verkenner', 'settings.projectOpen.opt.site',
                       'settings.projectOpen.opt.windows', 'settings.projectOpen.opt.output',
                       'settings.projectOpen.opt.niets',
                       'folder.webHtmlStruct', 'folder.webHtmlTekst', 'folder.webHtmlMedia',
                       'folder.webCssLayout', 'folder.webCssTekst', 'folder.webCssLook',
                       'folder.webJsDom', 'folder.webJsEvents', 'folder.webJsData',
                       'web.knopTitel', 'web.knopGeenBestand', 'web.knopVerkeerdeTaal']) {
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
