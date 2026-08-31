// Bestanden op het klembord van Windows zetten en er weer af lezen.
// PowerShell wordt hier nagebootst: we controleren welk script eruit rolt en
// hoe de uitvoer wordt gelezen, niet of Windows zelf meewerkt.
const Module = require('module'), path = require('path'), fs = require('fs'), os = require('os')
const EventEmitter = require('events')
const REAL = path.join(__dirname, '..')

let ok = true
const t = (l, c) => { console.log((c ? 'PASS  ' : 'FAIL  ') + l); if (!c) ok = false }

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'klem-'))
const A = path.join(TMP, 'een.txt'), B = path.join(TMP, "twee's ding.txt")
fs.writeFileSync(A, 'x'); fs.writeFileSync(B, 'y')

const handlers = {}
const fakeElectron = {
  app: { getPath: () => TMP, whenReady: () => ({ then: () => {} }), on: () => {}, relaunch: () => {}, quit: () => {}, exit: () => {}, isPackaged: false, getAppPath: () => REAL },
  BrowserWindow: function () { this.loadFile = () => {}; this.webContents = { send: () => {} }; this.isDestroyed = () => false },
  ipcMain: { on: () => {}, handle: (n, f) => { handlers[n] = f } },
  dialog: { showOpenDialog: async () => ({ canceled: true }) },
  shell: { openPath: () => {} },
}

// Nagebootste powershell: onthoudt de aanroep en levert wat de test klaarzet
let gestart = []
let volgende = { code: 0, uit: '' }
function nepSpawn(bestand, args) {
  gestart.push({ bestand, args, script: args[args.length - 1] })
  const p = new EventEmitter()
  p.stdout = new EventEmitter(); p.stderr = new EventEmitter()
  setTimeout(() => {
    if (volgende.uit) p.stdout.emit('data', Buffer.from(volgende.uit, 'utf8'))
    p.emit('close', volgende.code)
  }, 0)
  return p
}

const orig = Module._load
Module._load = function (r) {
  if (r === 'electron') return fakeElectron
  if (r === 'child_process') return { ...orig.apply(this, arguments), spawn: nepSpawn }
  return orig.apply(this, arguments)
}
require(path.join(REAL, 'main.js'))
Module._load = orig
const call = (n, a) => handlers[n](null, a)

;(async () => {
  // ── erop zetten ────────────────────────────────────────────────────────────
  gestart = []; volgende = { code: 0, uit: '' }
  let r = await call('clip:zetBestanden', { paden: [A, B], knippen: false })
  t('kopiëren lukt', r.ok === true && r.aantal === 2)
  const s = gestart[0]
  t('powershell wordt aangeroepen', s.bestand === 'powershell.exe')
  t('in STA-modus, anders weigert het klembord', s.args.includes('-STA'))
  t('zonder profiel, dat scheelt tijd', s.args.includes('-NoProfile'))
  t('beide bestanden staan in het script', s.script.includes(A) && s.script.includes('twee'))
  t('een apostrof in de naam wordt verdubbeld', s.script.includes("twee''s ding"))
  t('het gaat als bestandslijst, niet als tekst', s.script.includes('SetFileDropList'))
  t('kopiëren krijgt vlag 5', /\(5,0,0,0\)/.test(s.script))
  t('en blijft staan als de app sluit', s.script.includes('SetDataObject($data, $true)'))

  gestart = []
  await call('clip:zetBestanden', { paden: [A], knippen: true })
  t('knippen krijgt vlag 2', /\(2,0,0,0\)/.test(gestart[0].script))

  gestart = []
  r = await call('clip:zetBestanden', { paden: [path.join(TMP, 'weg.txt')] })
  t('een bestand dat niet bestaat gaat er niet op', r.ok === false && gestart.length === 0)
  r = await call('clip:zetBestanden', { paden: [] })
  t('een lege lijst ook niet', r.ok === false)

  gestart = []; volgende = { code: 1, uit: '' }
  r = await call('clip:zetBestanden', { paden: [A] })
  t('als powershell struikelt komt dat terug', r.ok === false)

  // ── eraf lezen ─────────────────────────────────────────────────────────────
  volgende = { code: 0, uit: `EFFECT=5\r\n${A}\r\n${B}\r\n` }
  r = await call('clip:leesBestanden')
  t('lezen geeft de paden terug', r.ok === true && r.paden.length === 2)
  t('in de goede volgorde', r.paden[0] === A && r.paden[1] === B)
  t('vlag 5 betekent gekopieerd', r.knippen === false)

  volgende = { code: 0, uit: `EFFECT=2\r\n${A}\r\n` }
  r = await call('clip:leesBestanden')
  t('vlag 2 betekent geknipt', r.knippen === true)

  volgende = { code: 0, uit: '' }
  r = await call('clip:leesBestanden')
  t('een leeg klembord geeft een lege lijst', r.ok === true && r.paden.length === 0)

  console.log(ok ? '\nALLE KLEMBORD-TESTS GESLAAGD' : '\n✗ ER ZIJN TESTS GEFAALD')
  fs.rmSync(TMP, { recursive: true, force: true })
  process.exit(ok ? 0 : 1)
})()
