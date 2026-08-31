// Kopiëren, verplaatsen, verwijderen en hernoemen
const Module = require('module'), path = require('path'), fs = require('fs'), os = require('os')
const REAL = path.join(__dirname, '..')

let ok = true
const t = (l, c) => { console.log((c ? 'PASS  ' : 'FAIL  ') + l); if (!c) ok = false }

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'bew-'))
const maak = (p, inhoud = 'x') => { fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, inhoud); return p }

// whenReady roept de callback echt aan, zodat het venster bestaat en de
// voortgangsberichten ergens heen kunnen.
const handlers = {}
const prullenbak = []
const verzonden = []
const fake = {
  app: { getPath: () => TMP, whenReady: () => ({ then: (cb) => cb() }), on: () => {}, relaunch: () => {}, quit: () => {}, exit: () => {}, isPackaged: false, getAppPath: () => REAL },
  BrowserWindow: function () { this.loadFile = () => {}; this.webContents = { send: (k, d) => verzonden.push({ k, d }) }; this.isDestroyed = () => false },
  ipcMain: { on: () => {}, handle: (n, f) => { handlers[n] = f } },
  dialog: { showOpenDialog: async () => ({ canceled: true }) },
  shell: { openPath: () => {}, trashItem: async (p) => { prullenbak.push(p); fs.rmSync(p, { recursive: true, force: true }) } },
}
const orig = Module._load
Module._load = function (r) { if (r === 'electron') return fake; return orig.apply(this, arguments) }
require(path.join(REAL, 'main.js'))
Module._load = orig
const call = (n, a) => handlers[n](null, a)

;(async () => {
  // ── kopiëren ───────────────────────────────────────────────────────────────
  const bron = path.join(TMP, 'bron')
  const doel = path.join(TMP, 'doel')
  fs.mkdirSync(doel, { recursive: true })
  maak(path.join(bron, 'een.txt'), 'inhoud een')
  maak(path.join(bron, 'sub', 'twee.txt'), 'inhoud twee')
  maak(path.join(bron, 'groot.bin'), 'y'.repeat(3 * 1024 * 1024))

  let r = await call('fs:kopieer', { bronnen: [path.join(bron, 'een.txt')], doelMap: doel })
  t('een bestand kopiëren lukt', r.ok === true && r.gedaan === 1)
  t('het staat op de nieuwe plek', fs.readFileSync(path.join(doel, 'een.txt'), 'utf8') === 'inhoud een')
  t('en het origineel staat er nog', fs.existsSync(path.join(bron, 'een.txt')))

  r = await call('fs:kopieer', { bronnen: [bron], doelMap: doel })
  t('een hele map kopiëren lukt', r.ok === true)
  t('met de submap erin', fs.existsSync(path.join(doel, 'bron', 'sub', 'twee.txt')))
  t('en de inhoud klopt', fs.readFileSync(path.join(doel, 'bron', 'sub', 'twee.txt'), 'utf8') === 'inhoud twee')
  t('ook een groot bestand komt compleet over',
    fs.statSync(path.join(doel, 'bron', 'groot.bin')).size === 3 * 1024 * 1024)
  t('er is voortgang gemeld', verzonden.some(v => v.k === 'fs:voortgang' && v.d.bezig))
  t('en aan het eind afgemeld', verzonden.some(v => v.k === 'fs:voortgang' && v.d.bezig === false))

  // ── naamconflicten ─────────────────────────────────────────────────────────
  let c = await call('fs:conflicten', { bronnen: [path.join(bron, 'een.txt')], doelMap: doel })
  t('een bestaande naam wordt gemeld', c.ok === true && c.namen.includes('een.txt'))

  r = await call('fs:kopieer', { bronnen: [path.join(bron, 'een.txt')], doelMap: doel, bijConflict: 'hernoemen' })
  t('hernoemen zet er een tweede naast', fs.existsSync(path.join(doel, 'een (2).txt')))
  t('en laat de eerste met rust', fs.readFileSync(path.join(doel, 'een.txt'), 'utf8') === 'inhoud een')

  maak(path.join(bron, 'een.txt'), 'nieuwe inhoud')
  r = await call('fs:kopieer', { bronnen: [path.join(bron, 'een.txt')], doelMap: doel, bijConflict: 'vervangen' })
  t('vervangen overschrijft', fs.readFileSync(path.join(doel, 'een.txt'), 'utf8') === 'nieuwe inhoud')

  r = await call('fs:kopieer', { bronnen: [path.join(bron, 'een.txt')], doelMap: doel, bijConflict: 'overslaan' })
  t('overslaan doet niets', r.overgeslagen === 1 && r.gedaan === 0)

  // ── verplaatsen ────────────────────────────────────────────────────────────
  const verplaatsMap = path.join(TMP, 'verplaatst')
  fs.mkdirSync(verplaatsMap, { recursive: true })
  maak(path.join(bron, 'weg.txt'), 'ga weg')
  r = await call('fs:kopieer', { bronnen: [path.join(bron, 'weg.txt')], doelMap: verplaatsMap, verplaatsen: true })
  t('verplaatsen zet het bestand op de nieuwe plek', fs.existsSync(path.join(verplaatsMap, 'weg.txt')))
  t('en haalt het van de oude weg', !fs.existsSync(path.join(bron, 'weg.txt')))

  // ── beschermingen ──────────────────────────────────────────────────────────
  r = await call('fs:kopieer', { bronnen: [bron], doelMap: path.join(bron, 'sub') })
  t('een map in zichzelf plakken wordt geweigerd', r.ok === false && /in zichzelf/.test(r.reason))

  r = await call('fs:kopieer', { bronnen: [], doelMap: doel })
  t('niets gekozen geeft een fout', r.ok === false)
  r = await call('fs:kopieer', { bronnen: [path.join(bron, 'een.txt')], doelMap: path.join(TMP, 'nergens') })
  t('een doelmap die niet bestaat geeft een fout', r.ok === false)

  r = await call('fs:kopieer', { bronnen: [path.join(TMP, 'spook.txt')], doelMap: doel })
  t('een verdwenen bestand wordt gemeld maar breekt niets',
    r.ok === true && r.fouten.length === 1)

  // ── verwijderen ────────────────────────────────────────────────────────────
  const weg1 = maak(path.join(TMP, 'prullen', 'a.txt'))
  const weg2 = maak(path.join(TMP, 'prullen', 'b.txt'))
  r = await call('fs:verwijder', { paden: [weg1, weg2] })
  t('verwijderen gaat standaard naar de prullenbak',
    r.gedaan === 2 && prullenbak.length === 2 && !fs.existsSync(weg1))

  const weg3 = maak(path.join(TMP, 'prullen', 'c.txt'))
  const voorPrullen = prullenbak.length
  r = await call('fs:verwijder', { paden: [weg3], definitief: true })
  t('definitief verwijderen gaat langs de prullenbak heen',
    r.gedaan === 1 && !fs.existsSync(weg3) && prullenbak.length === voorPrullen)

  const wegMap = path.join(TMP, 'wegmap')
  maak(path.join(wegMap, 'diep', 'x.txt'))
  r = await call('fs:verwijder', { paden: [wegMap], definitief: true })
  t('een map met inhoud verwijderen lukt', !fs.existsSync(wegMap))

  // ── hernoemen ──────────────────────────────────────────────────────────────
  const oud = maak(path.join(TMP, 'hernoem', 'oud.txt'), 'blijft')
  r = await call('fs:hernoem', { pad: oud, naam: 'nieuw.txt' })
  t('hernoemen lukt', r.ok === true && fs.existsSync(path.join(TMP, 'hernoem', 'nieuw.txt')))
  t('de inhoud blijft', fs.readFileSync(r.path, 'utf8') === 'blijft')
  t('en de oude naam is weg', !fs.existsSync(oud))

  maak(path.join(TMP, 'hernoem', 'bezet.txt'))
  r = await call('fs:hernoem', { pad: path.join(TMP, 'hernoem', 'nieuw.txt'), naam: 'bezet.txt' })
  t('een bestaande naam wordt geweigerd', r.ok === false && /bestaat al/.test(r.reason))

  r = await call('fs:hernoem', { pad: path.join(TMP, 'hernoem', 'nieuw.txt'), naam: 'fout:naam?' })
  t('rare tekens worden geweigerd', r.ok === false)

  r = await call('fs:hernoem', { pad: path.join(TMP, 'bestaat-niet.txt'), naam: 'x.txt' })
  t('een verdwenen bestand hernoemen geeft een fout', r.ok === false)

  console.log(ok ? '\nALLE TESTS GESLAAGD' : '\nER ZIJN TESTS GEFAALD')
  process.exit(ok ? 0 : 1)
})()
