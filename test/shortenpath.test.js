// Inkorten van lange paden in het commandoveld
const fs = require('fs'), path = require('path')
const src = fs.readFileSync(path.join(__dirname, '..', 'renderer.js'), 'utf8')
eval(src.match(/function shortenPath[\s\S]*?\n}/)[0])

let ok = true
const t = (l, c) => { console.log((c ? 'PASS  ' : 'FAIL  ') + l); if (!c) ok = false }

const kort = 'C:\\Users\\redub\\app'
t('kort pad blijft ongewijzigd', shortenPath(kort, 40) === kort)

const lang = 'C:\\Users\\redub\\Desktop\\Projects\\werk\\klanten\\2026\\commanddeck'
const r = shortenPath(lang, 40)
t('lang pad wordt ingekort', r.length <= 40 && r !== lang)
t('begin van het pad blijft staan', r.startsWith('C:\\Users\\'))
t('puntjes staan in het midden', r.includes('.....'))
t('eind van het pad blijft staan', r.endsWith('commanddeck'))
t('er wordt op mapgrenzen geknipt', !/[^\\]\.\.\.\.\./.test(r) && !/\.\.\.\.\.[^\\]/.test(r))

const breed = shortenPath(lang, 70)
t('meer ruimte bewaart meer van het eind', breed.length > r.length && breed.length <= 70)

t('smal scherm past ook', shortenPath(lang, 20).length <= 20)
t('pad zonder mapgrenzen knipt in het midden',
  shortenPath('een-heel-lange-bestandsnaam-zonder-mappen', 20).includes('.....'))
t('leeg pad blijft leeg', shortenPath('', 30) === '')
t('unix-pad werkt ook', shortenPath('/home/redub/projects/werk/klanten/app', 25).includes('/...../'))
t('pad precies op de grens blijft heel', shortenPath('C:\\abc', 6) === 'C:\\abc')

console.log(ok ? '\nALLE TESTS GESLAAGD' : '\nER ZIJN TESTS GEFAALD')
process.exit(ok ? 0 : 1)
