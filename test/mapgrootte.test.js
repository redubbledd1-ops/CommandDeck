// Mapgroottes: optellen wat er onder een map staat, zonder de app te laten hangen
const Module = require('module'), path = require('path'), fs = require('fs'), os = require('os')
const REAL = path.join(__dirname, '..')

let ok = true
const t = (l, c) => { console.log((c ? 'PASS  ' : 'FAIL  ') + l); if (!c) ok = false }

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'grootte-'))
const boom = path.join(TMP, 'boom')
fs.mkdirSync(path.join(boom, 'sub', 'dieper'), { recursive: true })
fs.mkdirSync(path.join(boom, 'leeg'), { recursive: true })
fs.writeFileSync(path.join(boom, 'a.txt'), 'x'.repeat(1000))
fs.writeFileSync(path.join(boom, 'sub', 'b.txt'), 'x'.repeat(2000))
fs.writeFileSync(path.join(boom, 'sub', 'dieper', 'c.txt'), 'x'.repeat(3000))
fs.writeFileSync(path.join(TMP, 'los.txt'), 'x'.repeat(50))

const handlers = {}
const fake = {
  app: { getPath: () => TMP, whenReady: () => ({ then: () => {} }), on: () => {}, relaunch: () => {}, quit: () => {}, exit: () => {}, isPackaged: false, getAppPath: () => REAL },
  BrowserWindow: function () { this.on = () => {}; this.close = () => {}; this.loadFile = () => {}; this.webContents = { send: () => {} }; this.isDestroyed = () => false },
  ipcMain: { on: () => {}, handle: (n, f) => { handlers[n] = f } },
  dialog: { showOpenDialog: async () => ({ canceled: true }) },
  shell: { openPath: () => {} },
}
const orig = Module._load
Module._load = function (r) { if (r === 'electron') return fake; return orig.apply(this, arguments) }
require(path.join(REAL, 'main.js'))
Module._load = orig
const call = (n, a) => handlers[n](null, a)

;(async () => {
  let r = await call('fs:mapGrootte', { path: boom, ronde: 1 })
  t('een map wordt gemeten', r.ok === true)
  t('alles eronder telt mee', r.bytes === 6000)
  t('de bestanden worden geteld', r.bestanden === 3)
  t('de mappen ook', r.mappen === 3)
  t('en het is compleet', r.deels === false)

  r = await call('fs:mapGrootte', { path: path.join(boom, 'leeg'), ronde: 1 })
  t('een lege map is nul', r.ok === true && r.bytes === 0 && r.bestanden === 0)

  r = await call('fs:mapGrootte', { path: path.join(TMP, 'los.txt'), ronde: 1 })
  t('een bestand geeft gewoon zijn eigen grootte', r.ok === true && r.bytes === 50)

  r = await call('fs:mapGrootte', { path: path.join(TMP, 'bestaat-niet'), ronde: 1 })
  t('een pad dat niet bestaat geeft een fout', r.ok === false && r.reason === 'bestaat niet')

  r = await call('fs:mapGrootte', {})
  t('zonder pad ook', r.ok === false)

  // ── afbreken ───────────────────────────────────────────────────────────────
  // Een oudere ronde mag niet doorwerken als er alweer een nieuwere gestart is.
  await call('fs:stopGroottes')
  const laat = call('fs:mapGrootte', { path: boom, ronde: 2 })
  const s = await call('fs:stopGroottes')
  t('stoppen verhoogt de ronde', s.ok === true && typeof s.ronde === 'number')
  r = await laat
  t('een ronde die achterhaald is levert niets op', r.ok === false && r.reason === 'afgebroken')

  r = await call('fs:mapGrootte', { path: boom, ronde: 99 })
  t('een nieuwe ronde meet weer gewoon', r.ok === true && r.bytes === 6000)

  // ── tijdslimiet ────────────────────────────────────────────────────────────
  r = await call('fs:mapGrootte', { path: boom, ronde: 99, budget: 0 })
  t('als de tijd op is stopt hij', r.ok === true && r.deels === true)
  t('en levert wat hij tot dan toe had', r.bytes >= 0 && r.bytes < 6000)

  console.log(ok ? '\nALLE MAPGROOTTE-TESTS GESLAAGD' : '\n✗ ER ZIJN TESTS GEFAALD')
  fs.rmSync(TMP, { recursive: true, force: true })
  process.exit(ok ? 0 : 1)
})()
