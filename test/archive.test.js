// Zip zelf lezen, en de rest via 7-Zip of WinRAR
const path = require('path'), fs = require('fs'), os = require('os'), zlib = require('zlib')
const a = require(path.join(__dirname, '..', 'archive'))

let ok = true
const t = (l, c) => { console.log((c ? 'PASS  ' : 'FAIL  ') + l); if (!c) ok = false }

// ── een zipbestand maken zonder hulpprogramma's ──────────────────────────────
// Zo hangt de test niet af van wat er toevallig op deze computer staat.
function maakZip(bestand, items) {
  const lokaal = [], centraal = []
  let offset = 0
  for (const it of items) {
    const naam = Buffer.from(it.name, 'utf8')
    const rauw = Buffer.from(it.data || '')
    const gepakt = it.store ? rauw : zlib.deflateRawSync(rauw)
    const crc = (() => { // eenvoudige crc32
      let c = ~0
      for (const b of rauw) { c ^= b; for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xEDB88320 & -(c & 1)) }
      return ~c >>> 0
    })()

    const lh = Buffer.alloc(30)
    lh.writeUInt32LE(0x04034b50, 0); lh.writeUInt16LE(20, 4)
    lh.writeUInt16LE(it.store ? 0 : 8, 8)
    lh.writeUInt32LE(crc, 14); lh.writeUInt32LE(gepakt.length, 18); lh.writeUInt32LE(rauw.length, 22)
    lh.writeUInt16LE(naam.length, 26)
    lokaal.push(lh, naam, gepakt)

    const ch = Buffer.alloc(46)
    ch.writeUInt32LE(0x02014b50, 0); ch.writeUInt16LE(20, 4); ch.writeUInt16LE(20, 6)
    ch.writeUInt16LE(it.store ? 0 : 8, 10)
    ch.writeUInt32LE(crc, 16); ch.writeUInt32LE(gepakt.length, 20); ch.writeUInt32LE(rauw.length, 24)
    ch.writeUInt16LE(naam.length, 28); ch.writeUInt32LE(offset, 42)
    centraal.push(ch, naam)

    offset += 30 + naam.length + gepakt.length
  }
  const cd = Buffer.concat(centraal)
  const eocd = Buffer.alloc(22)
  eocd.writeUInt32LE(0x06054b50, 0)
  eocd.writeUInt16LE(items.length, 8); eocd.writeUInt16LE(items.length, 10)
  eocd.writeUInt32LE(cd.length, 12); eocd.writeUInt32LE(offset, 16)
  fs.writeFileSync(bestand, Buffer.concat([...lokaal, cd, eocd]))
}

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'arch-'))
const zip = path.join(TMP, 'proef.zip')
maakZip(zip, [
  { name: 'leesmij.txt', data: 'Hallo vanuit de zip!' },
  { name: 'map/', data: '' },
  { name: 'map/binnenin.txt', data: 'In een submap.' },
  { name: 'map/diep/dieper.txt', data: 'Twee niveaus.' },
  { name: 'plat.txt', data: 'Niet gecomprimeerd.', store: true },
  { name: 'café/müsli.txt', data: 'accenten' },
])

// ── herkennen ────────────────────────────────────────────────────────────────
t('zip wordt herkend', a.isArchief('x.zip') && a.isZipArchief('x.zip'))
t('apk en docx zijn ook zip', a.isZipArchief('app.apk') && a.isZipArchief('brief.docx'))
t('rar is een archief maar geen zip', a.isArchief('x.rar') && !a.isZipArchief('x.rar'))
t('een gewoon bestand is geen archief', !a.isArchief('aantekening.txt'))
t('hoofdletters maken niet uit', a.isArchief('BACKUP.ZIP'))

// ── inhoudsopgave ────────────────────────────────────────────────────────────
const items = a.leesZip(zip)
t('alle regels worden gelezen', items.length === 6)
t('mappen worden als map herkend', items.find(i => i.name === 'map/').dir === true)
t('bestanden niet', items.find(i => i.name === 'leesmij.txt').dir === false)
t('de uitgepakte grootte klopt', items.find(i => i.name === 'leesmij.txt').size === 20)
t('paden gebruiken schuine strepen', items.every(i => !i.name.includes('\\')))
t('namen met accenten blijven heel', items.some(i => i.name === 'café/müsli.txt'))
t('de compressiemethode komt mee',
  items.find(i => i.name === 'plat.txt').methode === 0 && items.find(i => i.name === 'leesmij.txt').methode === 8)

// ── uitpakken ────────────────────────────────────────────────────────────────
t('een gecomprimeerd bestand uitpakken', a.pakZipUit(zip, 'leesmij.txt').toString() === 'Hallo vanuit de zip!')
t('een bestand uit een submap', a.pakZipUit(zip, 'map/binnenin.txt').toString() === 'In een submap.')
t('een niet-gecomprimeerd bestand', a.pakZipUit(zip, 'plat.txt').toString() === 'Niet gecomprimeerd.')
t('accenten in de naam werken ook', a.pakZipUit(zip, 'café/müsli.txt').toString() === 'accenten')

let gooide = ''
try { a.pakZipUit(zip, 'bestaat-niet.txt') } catch (e) { gooide = e.message }
t('een onbekend bestand meldt dat netjes', /zit niet in het archief/.test(gooide))
gooide = ''
try { a.pakZipUit(zip, 'map/') } catch (e) { gooide = e.message }
t('een map uitpakken kan niet', /map, geen bestand/.test(gooide))

const kapot = path.join(TMP, 'kapot.zip')
fs.writeFileSync(kapot, 'dit is helemaal geen zip')
gooide = ''
try { a.leesZip(kapot) } catch (e) { gooide = e.message }
t('een kapot bestand geeft een duidelijke fout', /geen geldig zipbestand/.test(gooide))

// een groot bestand, om te zien dat het uitpakken echt werkt
const groot = path.join(TMP, 'groot.zip')
maakZip(groot, [{ name: 'veel.bin', data: 'x'.repeat(300000) }])
const uitGroot = a.pakZipUit(groot, 'veel.bin')
t('een groot bestand komt er compleet uit', uitGroot.length === 300000)

// ── zip schrijven ────────────────────────────────────────────────────────────
const bronMap = path.join(TMP, 'bron')
fs.mkdirSync(path.join(bronMap, 'sub'), { recursive: true })
fs.mkdirSync(path.join(bronMap, 'leeg'), { recursive: true })
fs.writeFileSync(path.join(bronMap, 'eerste.txt'), 'Hallo wereld')
fs.writeFileSync(path.join(bronMap, 'sub', 'tweede.txt'), 'In een submap')
fs.writeFileSync(path.join(bronMap, 'groot.bin'), 'x'.repeat(200000))

const gemaakt = path.join(TMP, 'gemaakt.zip')
const uitkomst = a.schrijfZip(gemaakt, [bronMap])
t('inpakken levert een bestand op', fs.existsSync(gemaakt) && uitkomst.grootte > 0)
t('met alle items erin', uitkomst.aantal === 4)

const terug = a.leesZip(gemaakt)
t('en het is met onze eigen lezer terug te lezen', terug.length === 4)
t('paden binnen het archief beginnen met de mapnaam', terug.every(i => i.name.startsWith('bron/')))
t('submappen komen mee', terug.some(i => i.name === 'bron/sub/tweede.txt'))
t('lege mappen ook', terug.some(i => i.name === 'bron/leeg/' && i.dir))
t('de inhoud klopt', a.pakZipUit(gemaakt, 'bron/eerste.txt').toString() === 'Hallo wereld')
t('ook uit een submap', a.pakZipUit(gemaakt, 'bron/sub/tweede.txt').toString() === 'In een submap')
t('en een groot bestand', a.pakZipUit(gemaakt, 'bron/groot.bin').length === 200000)
t('een goed samendrukbaar bestand wordt gecomprimeerd',
  terug.find(i => i.name === 'bron/groot.bin').methode === 8)
t('een piepklein bestand wordt opgeslagen in plaats van groter gemaakt',
  terug.find(i => i.name === 'bron/eerste.txt').methode === 0)
t('de comprimering levert echt winst op',
  terug.find(i => i.name === 'bron/groot.bin').packed < 200000 / 10)

// losse bestanden in plaats van een map
const los = path.join(TMP, 'los.zip')
a.schrijfZip(los, [path.join(bronMap, 'eerste.txt'), path.join(bronMap, 'sub', 'tweede.txt')])
const losItems = a.leesZip(los)
t('losse bestanden komen zonder mapnaam in de zip',
  losItems.length === 2 && losItems.every(i => !i.name.includes('/')))

let zipFout = ''
try { a.schrijfZip(path.join(TMP, 'leeg.zip'), [path.join(TMP, 'bestaat-niet')]) } catch (e) { zipFout = e.message }
t('niets om in te pakken geeft een duidelijke fout', /niets om in te pakken/.test(zipFout))

t('de controlesom klopt met een bekende waarde',
  a.crc32(Buffer.from('123456789')) === 0xCBF43926)

// ── uitlezen van 7-Zip ───────────────────────────────────────────────────────
const sltVoorbeeld = [
  '', 'Path = C:\\test.rar', 'Type = Rar5', '',
  '----------', '',
  'Path = docs\\lees.txt', 'Size = 1234', 'Modified = 2026-01-15 10:30:00', 'Attributes = A', '',
  'Path = docs', 'Size = 0', 'Modified = 2026-01-15 10:29:00', 'Attributes = D', '',
].join('\r\n')
const geparsed = a.parse7zSlt(sltVoorbeeld)
t('7-Zip-uitvoer wordt gelezen', geparsed.length === 3)
t('grootte wordt overgenomen', geparsed.find(i => i.name === 'docs/lees.txt').size === 1234)
t('mappen worden herkend aan het kenmerk D', geparsed.find(i => i.name === 'docs').dir === true)
t('backslashes worden schuine strepen', geparsed.every(i => !i.name.includes('\\')))
t('de wijzigingsdatum komt mee', geparsed.find(i => i.name === 'docs/lees.txt').mtime > 0)

// ── hulpprogramma zoeken ─────────────────────────────────────────────────────
const tool = a.zoekHulpprogramma(false)
t('zoeken naar 7-Zip of WinRAR loopt niet vast', tool === null || typeof tool.pad === 'string')

console.log(ok ? '\nALLE TESTS GESLAAGD' : '\nER ZIJN TESTS GEFAALD')
process.exit(ok ? 0 : 1)
