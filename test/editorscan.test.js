// Bekende editors opsporen op de schijven
const Module = require('module'), path = require('path'), fs = require('fs'), os = require('os')
const REAL = path.join(__dirname, '..')
const { EDITORS } = require(path.join(REAL, 'editor-catalog'))

let ok = true
const t = (l, c) => { console.log((c ? 'PASS  ' : 'FAIL  ') + l); if (!c) ok = false }

// ── de catalogus zelf ────────────────────────────────────────────────────────
t('er staat een flinke lijst editors in', EDITORS.length >= 30)
t('elke editor heeft een id en een naam', EDITORS.every(e => e.id && e.label))
t('geen dubbele ids', new Set(EDITORS.map(e => e.id)).size === EDITORS.length)
t('elke editor is op minstens één manier te vinden',
  EDITORS.every(e => e.paden || e.versieMap || e.cli || e.startMenu))
t('de bekende namen zitten erin',
  ['sublime', 'notepadpp', 'visualstudio', 'idea', 'zed', 'windsurf', 'neovim']
    .every(id => EDITORS.some(e => e.id === id)))

// ── nagebootste installaties ─────────────────────────────────────────────────
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'scan-'))
const maak = (p) => { fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, 'nep') ; return p }

// C-schijf
const cPf = path.join(TMP, 'C', 'Program Files')
maak(path.join(cPf, 'Notepad++', 'notepad++.exe'))
maak(path.join(cPf, 'JetBrains', 'IntelliJ IDEA 2023.2', 'bin', 'idea64.exe'))
maak(path.join(cPf, 'JetBrains', 'IntelliJ IDEA 2024.3', 'bin', 'idea64.exe'))
// D-schijf: hier staat Sublime, om te zien dat we verder kijken dan C
const dPf = path.join(TMP, 'D', 'Program Files')
maak(path.join(dPf, 'Sublime Text', 'sublime_text.exe'))
// gebruikersmap, waar veel editors zichzelf tegenwoordig neerzetten
const lokaal = path.join(TMP, 'LocalAppData')
maak(path.join(lokaal, 'Programs', 'Cursor', 'Cursor.exe'))
// in PATH
const padMap = path.join(TMP, 'bin')
maak(path.join(padMap, 'zed.exe'))

const handlers = {}
const startMenuItems = [{ naam: 'Godot Engine', pad: path.join(TMP, 'elders', 'Godot.exe') }]
maak(startMenuItems[0].pad)

const fake = {
  app: { getPath: () => TMP, whenReady: () => ({ then: () => {} }), on: () => {}, relaunch: () => {}, quit: () => {}, exit: () => {}, isPackaged: false, getAppPath: () => REAL },
  BrowserWindow: function () { this.on = () => {}; this.close = () => {}; this.loadFile = () => {}; this.webContents = { send: () => {} }; this.isDestroyed = () => false },
  ipcMain: { on: () => {}, handle: (n, f) => { handlers[n] = f } },
  dialog: { showOpenDialog: async () => ({ canceled: true }) },
  shell: { openPath: () => {}, readShortcutLink: (p) => ({ target: startMenuItems.find(x => p.includes(x.naam))?.pad || '' }) },
}
const orig = Module._load
Module._load = function (r) { if (r === 'electron') return fake; return orig.apply(this, arguments) }

// de schijven en de gebruikersmap nabootsen
const echtePath = process.env.PATH
const echteLocal = process.env.LOCALAPPDATA
process.env.PATH = padMap
process.env.LOCALAPPDATA = lokaal
// Windows-paden omleiden naar onze nagebootste mappen. Deze test draait op
// Linux, waar path.join schuine strepen zet en de catalogus backslashes; beide
// moeten hier hetzelfde uitpakken.
const naarNep = (p) => {
  const s = String(p)
  const m = s.replace(/\//g, '\\').match(/^([A-Z]):\\?(.*)$/)
  if (m) return path.join(TMP, m[1], ...m[2].split('\\').filter(Boolean))
  // paden uit de catalogus bevatten backslashes; hier zijn dat mapscheidingen
  if (s.includes('\\')) return s.split('\\').join('/')
  return null
}
const echteExists = fs.existsSync
fs.existsSync = (p) => { const n = naarNep(p); return echteExists(n === null ? p : n) }
const echteReaddir = fs.readdirSync
fs.readdirSync = (p, o) => { const n = naarNep(p); return echteReaddir(n === null ? p : n, o) }

require(path.join(REAL, 'main.js'))
Module._load = orig
const call = (n, a) => handlers[n](null, a)

const gevonden = call('app:scanEditors')
fs.existsSync = echteExists
fs.readdirSync = echteReaddir
process.env.PATH = echtePath
if (echteLocal) process.env.LOCALAPPDATA = echteLocal

const vind = (id) => gevonden.find(g => g.id === id)

t('Notepad++ wordt gevonden op de C-schijf', !!vind('notepadpp'))
t('Sublime wordt gevonden op de D-schijf', !!vind('sublime'))
t('en dus niet alleen op C', vind('sublime') && vind('sublime').path.startsWith('D:'))
t('Cursor wordt gevonden in de gebruikersmap', !!vind('cursor'))
t('Zed wordt gevonden via PATH', !!vind('zed') && vind('zed').bron === 'PATH')
t('IntelliJ wordt gevonden ondanks het versienummer in het pad', !!vind('idea'))
t('en daarvan de nieuwste versie', vind('idea') && vind('idea').path.includes('2024.3'))
t('elk resultaat vertelt waar het vandaan komt', gevonden.every(g => g.bron))
t('elk resultaat wijst naar een bestand dat bestaat',
  gevonden.every(g => { const n = naarNep(g.path); return echteExists(n === null ? g.path : n) }))
t('niet-geïnstalleerde editors komen niet in de lijst', !vind('emacs') && !vind('phpstorm'))

console.log('\n  gevonden: ' + gevonden.map(g => `${g.label} (${g.bron})`).join(', '))
console.log(ok ? '\nALLE TESTS GESLAAGD' : '\nER ZIJN TESTS GEFAALD')
process.exit(ok ? 0 : 1)
