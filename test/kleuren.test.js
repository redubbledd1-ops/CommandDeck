// Kleuren in de editor: de pure kant uit code-kleuren.js.
//
// De belangrijkste test staat onderaan en is saai: alle stukjes weer aan elkaar
// moet exact het bronbestand opleveren. Een scanner die ergens een teken laat
// vallen of verdubbelt, laat de gekleurde laag onder het tekstvak wegschuiven —
// en dat zie je pas als je het bestand al aan het bewerken bent.
const fs = require('fs'), path = require('path')
const K = require('../code-kleuren')

const APP = path.join(__dirname, '..')
const nl = JSON.parse(fs.readFileSync(path.join(APP, 'locales/nl.json'), 'utf8'))
const en = JSON.parse(fs.readFileSync(path.join(APP, 'locales/en.json'), 'utf8'))

let ok = true
const t = (l, c) => { console.log((c ? 'PASS  ' : 'FAIL  ') + l); if (!c) ok = false }

// Hulpje: welke soort kreeg dit stukje tekst?
function soortVan(bron, taal, stuk) {
  const tok = K.tokens(bron, taal).find(x => x.t === stuk)
  return tok ? tok.s : null
}

// ── Welke taal hoort bij welk bestand ────────────────────────────────────────
t('html en htm', K.taalVanPad('a.html') === 'html' && K.taalVanPad('C:\\x\\b.HTM') === 'html')
t('css', K.taalVanPad('/var/www/stijl.css') === 'css')
t('js, mjs en cjs', ['a.js', 'a.mjs', 'a.cjs'].every(p => K.taalVanPad(p) === 'js'))
t('de rest krijgt geen taal', K.taalVanPad('leesmij.md') === '' && K.taalVanPad('LICENSE') === '')

// ── HTML ─────────────────────────────────────────────────────────────────────
const H = '<!DOCTYPE html>\n<!-- kop -->\n<a class="knop" href=/over>tekst</a>\n<br/>'
t('doctype is een sleutelwoord', soortVan(H, 'html', '<!DOCTYPE html>') === 'keyword')
t('commentaar wordt herkend', soortVan(H, 'html', '<!-- kop -->') === 'comment')
t('de tagnaam is een tag', soortVan(H, 'html', 'a') === 'tag')
t('attribuutnamen apart', soortVan(H, 'html', 'class') === 'attr')
t('waarde met aanhalingstekens', soortVan(H, 'html', '"knop"') === 'string')
t('waarde zonder aanhalingstekens hoort bij de waarde', soortVan(H, 'html', '/over') === 'string')
t('losse tekst blijft gewone tekst', soortVan(H, 'html', 'tekst') === '')
t('zichzelf sluitende tag', soortVan(H, 'html', '/>') === 'leesteken')

// <style> en <script> in een pagina zijn geen html meer. Zonder dit is het
// grootste deel van een eenbestandspagina één grijze vlakte.
const HS = '<style>.a{color:red}</style><script>const x = 1</script>'
t('css binnen <style>', soortVan(HS, 'html', 'color') === 'prop')
t('js binnen <script>', soortVan(HS, 'html', 'const') === 'keyword')
t('en de sluittag is weer html', soortVan(HS, 'html', 'style') === 'tag')

// ── CSS ──────────────────────────────────────────────────────────────────────
const C = '/* kop */\n@media (min-width: 40rem) {\n  .kaart:hover { color: #54c8e8; padding: 8px; --eigen: 2 }\n}'
t('css-commentaar', soortVan(C, 'css', '/* kop */') === 'comment')
t('at-regel is een sleutelwoord', soortVan(C, 'css', '@media') === 'keyword')
t('een selector binnen @media blijft selector', soortVan(C, 'css', '.kaart:hover') === 'selector')
t('eigenschap', soortVan(C, 'css', 'color') === 'prop')
t('hexkleur telt als getal', soortVan(C, 'css', '#54c8e8') === 'nummer')
t('getal met eenheid in één stuk', soortVan(C, 'css', '8px') === 'nummer')
t('eigen variabele als eigenschap', soortVan(C, 'css', '--eigen') === 'prop')
t('css-functie', soortVan('a{color:rgb(1,2,3)}', 'css', 'rgb') === 'functie')
t('!important is een sleutelwoord', soortVan('a{color:red !important}', 'css', '!important') === 'keyword')
t('en een waarde is een waarde', soortVan('a{color:red}', 'css', 'red') === 'waarde')
// Na het blok staan er weer selectors, geen eigenschappen.
t('na } weer selectorstand', soortVan('a{color:red}\nb{}', 'css', 'b') === 'selector')

// ── JavaScript ───────────────────────────────────────────────────────────────
const J = '// hoi\nconst re = /ab+c/gi\nlet x = a / b\nfoo(`tekst ${x}`, 0xFF, true)'
t('regelcommentaar', soortVan(J, 'js', '// hoi') === 'comment')
t('sleutelwoord', soortVan(J, 'js', 'const') === 'keyword')
t('een regex na = is geen deling', soortVan(J, 'js', '/ab+c/gi') === 'string')
t('en een deling na een naam blijft een deling', K.tokens('let x = a / b', 'js').every(x => x.t !== '/ab+c/gi'))
t('template-string', soortVan(J, 'js', '`tekst ${x}`') === 'string')
t('hexgetal', soortVan(J, 'js', '0xFF') === 'nummer')
t('true is een waarde', soortVan(J, 'js', 'true') === 'waarde')
t('aanroep is een functie', soortVan(J, 'js', 'foo') === 'functie')
t('blokcommentaar', soortVan('/* a\nb */ x', 'js', '/* a\nb */') === 'comment')
t('exponent hoort bij het getal', soortVan('const a = 1e-9', 'js', '1e-9') === 'nummer')
t('een niet-afgesloten string stopt op de regel',
  K.tokens("const a = 'oeps\nconst b = 2", 'js').some(x => x.s === 'keyword' && x.t === 'const'))

// ── Kleuren en thema's ───────────────────────────────────────────────────────
t('elk thema heeft elke soort',
  K.THEMA_IDS.every(id => K.SOORTEN.every(s => K.isKleur(K.THEMAS[id][s]))))
t('het standaardthema bestaat', !!K.THEMAS[K.STANDAARD_THEMA])
t('zonder instelling toch een volle set',
  K.SOORTEN.every(s => K.isKleur(K.kleuren(null)[s])))
t('onzin valt terug op het thema',
  K.kleuren({ kleuren: { tag: 'paars' } }).tag === K.THEMAS[K.STANDAARD_THEMA].tag)
t('een eigen kleur wint',
  K.kleuren({ kleuren: { tag: '#ff0000' } }).tag === '#ff0000')
t('een onbekend thema valt terug op het standaardthema',
  K.kleuren({ thema: 'bestaatniet' }).tag === K.THEMAS[K.STANDAARD_THEMA].tag)
t('zonder afwijking volgt het het thema', K.volgtThema({ thema: 'dracula' }) === true)
t('met afwijking niet meer', K.volgtThema({ thema: 'dracula', kleuren: { tag: '#123456' } }) === false)

// ── Uitvoer ──────────────────────────────────────────────────────────────────
t('html in de bron wordt ontsmet', !K.verf('<a>', 'html').includes('<a>'))
t('& blijft leesbaar', K.verf('x && y', 'js').includes('&amp;&amp;'))
t('zonder taal geen spans', K.verf('zomaar tekst', '') === 'zomaar tekst')
t('leeg blijft leeg', K.verf('', 'js') === '')
t('te grote bestanden krijgen geen kleur',
  K.magVerven('x'.repeat(K.MAX_TEKENS + 1), 'js') === false && K.magVerven('x', 'js') === true)
t('zonder taal wordt er niet geverfd', K.magVerven('x', '') === false)

// ── De invariant ─────────────────────────────────────────────────────────────
// Alle stukjes achter elkaar moet letterlijk de bron zijn. Anders schuift de
// gekleurde laag onder het tekstvak weg en staat je cursor niet meer waar je
// hem ziet.
for (const bestand of ['index.html', 'style.css', 'renderer.js', 'web-tools.js', 'main.js', 'code-kleuren.js']) {
  const bron = fs.readFileSync(path.join(APP, bestand), 'utf8')
  const taal = K.taalVanPad(bestand)
  const terug = K.tokens(bron, taal).map(x => x.t).join('')
  t('niets kwijt in ' + bestand + ' (' + taal + ')', terug === bron)
}

// Ook op rommel: half getypte code is de normale toestand in een editor.
const ROMMEL = [
  '<div class="a', '</', '<<>>', '/* niet af', "'los", '`open', 'a{b:', '}}{{',
  '@media', '#', '--', '0x', '1e', '<script>var a = 1', '<style>.a{', 'x /',
]
for (const stuk of ROMMEL) {
  for (const taal of ['html', 'css', 'js']) {
    const terug = K.tokens(stuk, taal).map(x => x.t).join('')
    if (terug !== stuk) t('rommel heel gebleven: ' + JSON.stringify(stuk) + ' (' + taal + ')', false)
  }
}
t('half getypte code raakt niets kwijt', true)

// ── Teksten ──────────────────────────────────────────────────────────────────
const SLEUTELS = [
  'settings.section.codeKleurenTitle', 'settings.codeKleuren.aanLabel',
  'settings.codeKleuren.aanDesc', 'settings.codeKleuren.themaLabel',
  'settings.codeKleuren.themaDesc', 'settings.codeKleuren.thema.eigen',
  'settings.codeKleuren.herstel', 'settings.codeKleuren.grensDesc',
  ...K.SOORTEN.map(s => 'settings.codeKleuren.soort.' + s),
  ...K.THEMA_IDS.map(id => 'settings.codeKleuren.thema.' + id),
]
t('alle teksten staan in nl.json', SLEUTELS.every(k => typeof nl[k] === 'string' && nl[k]))
t('alle teksten staan in en.json', SLEUTELS.every(k => typeof en[k] === 'string' && en[k]))
t('de grens noemt zijn eigen getal', nl['settings.codeKleuren.grensDesc'].includes('{max}'))

// ── Bedrading ────────────────────────────────────────────────────────────────
const html = fs.readFileSync(path.join(APP, 'index.html'), 'utf8')
const renderer = fs.readFileSync(path.join(APP, 'renderer.js'), 'utf8')
const css = fs.readFileSync(path.join(APP, 'style.css'), 'utf8')
t('code-kleuren.js staat in index.html', html.includes('<script src="code-kleuren.js">'))
t('en vóór renderer.js',
  html.indexOf('src="code-kleuren.js"') < html.indexOf('src="renderer.js"'))
t('de laag staat in het editorpaneel', renderer.includes('id="lezer-verf"'))
t('en wordt bijgewerkt bij het typen', renderer.includes('planVerfLezer()'))
t('elke soort heeft een css-regel',
  K.SOORTEN.every(s => css.includes('.ck-' + s + ' ')))
t('de laag heeft dezelfde padding als het tekstvak', css.includes('.lezer-verf'))

console.log(ok ? '\nALLES GOED' : '\nER GING IETS MIS')
process.exit(ok ? 0 : 1)
