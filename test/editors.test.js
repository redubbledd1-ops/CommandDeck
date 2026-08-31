// Eigen editors: meerdere tegelijk, en snelkoppelingen die naar een programma wijzen
const Module = require('module'), path = require('path'), fs = require('fs'), os = require('os')
const REAL = path.join(__dirname, '..')

let ok = true
const t = (l, c) => { console.log((c ? 'PASS  ' : 'FAIL  ') + l); if (!c) ok = false }

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'ed-'))
const echtProgramma = path.join(TMP, 'notepad++.exe')
fs.writeFileSync(echtProgramma, 'nep')
const snelkoppeling = path.join(TMP, 'Notepad++.lnk')
fs.writeFileSync(snelkoppeling, 'nep')

// de oude instelling van iemand die de app al gebruikte
fs.writeFileSync(path.join(TMP, 'settings.json'), JSON.stringify({
  editors: { custom: { enabled: true, path: 'C:\\oud\\mijn-editor.exe', label: 'Mijn editor' } },
}))

const handlers = {}
const gestart = []
let gekozenPad = snelkoppeling
let linkDoel = echtProgramma

const fake = {
  app: { getPath: () => TMP, whenReady: () => ({ then: () => {} }), on: () => {}, relaunch: () => {}, quit: () => {}, exit: () => {}, isPackaged: false, getAppPath: () => REAL },
  BrowserWindow: function () { this.loadFile = () => {}; this.webContents = { send: () => {} }; this.isDestroyed = () => false },
  ipcMain: { on: () => {}, handle: (n, f) => { handlers[n] = f } },
  dialog: { showOpenDialog: async (w, o) => ({ canceled: false, filePaths: [gekozenPad], _opts: o }) },
  shell: { openPath: () => {}, readShortcutLink: () => ({ target: linkDoel }) },
}
const orig = Module._load
Module._load = function (r) {
  if (r === 'electron') return fake
  if (r === 'child_process') {
    const cp = orig.apply(this, arguments)
    return { ...cp, spawn: (c, a, o) => { gestart.push({ c, a, o }); return { unref() {} } } }
  }
  return orig.apply(this, arguments)
}
require(path.join(REAL, 'main.js'))
Module._load = orig
const call = (n, a) => handlers[n](null, a)

;(async () => {
  // ── migratie ──────────────────────────────────────────────────────────────
  const s = await call('settings:load')
  t('de oude eigen editor is meeverhuisd naar de lijst', s.customEditors.length === 1)
  t('met naam en pad', s.customEditors[0].label === 'Mijn editor' && s.customEditors[0].path === 'C:\\oud\\mijn-editor.exe')
  t('en blijft ingeschakeld', s.customEditors[0].enabled === true)

  s.customEditors.push({ id: 'ce2', label: 'Sublime', path: 'C:\\subl.exe', enabled: true })
  await call('settings:save', s)
  const s2 = await call('settings:load')
  t('meerdere editors blijven bewaard', s2.customEditors.length === 2)
  t('de migratie gebeurt niet nog een keer',
    s2.customEditors.filter(e => e.label === 'Mijn editor').length === 1)

  // ── snelkoppeling kiezen ──────────────────────────────────────────────────
  let gekozen = await call('dialog:pickExe')
  t('een gekozen snelkoppeling wordt omgezet naar het programma', gekozen === echtProgramma)

  gekozenPad = echtProgramma
  gekozen = await call('dialog:pickExe')
  t('een gewoon programma blijft ongewijzigd', gekozen === echtProgramma)

  // snelkoppeling die nergens naar wijst
  gekozenPad = snelkoppeling
  linkDoel = path.join(TMP, 'weg.exe')
  gekozen = await call('dialog:pickExe')
  t('een kapotte snelkoppeling levert het pad zelf op', gekozen === snelkoppeling)
  linkDoel = echtProgramma

  // ── openen ────────────────────────────────────────────────────────────────
  const werkmap = path.join(TMP, 'project')
  fs.mkdirSync(werkmap, { recursive: true })
  gestart.length = 0
  await call('cmd:openEditor', { editorPath: snelkoppeling, cwd: werkmap })
  t('openen via een snelkoppeling start het echte programma',
    gestart.length === 1 && gestart[0].c === `"${echtProgramma}"`)
  t('met de projectmap als argument', gestart[0].a[0] === `"${werkmap}"`)

  gestart.length = 0
  await call('cmd:openEditor', { editorPath: echtProgramma, cwd: werkmap })
  t('een gewoon pad werkt onveranderd', gestart[0].c === `"${echtProgramma}"`)

  await call('cmd:openEditor', { editorPath: echtProgramma, cwd: path.join(TMP, 'bestaat-niet') })
  t('zonder geldige map gebeurt er niets', gestart.length === 1)

  console.log(ok ? '\nALLE TESTS GESLAAGD' : '\nER ZIJN TESTS GEFAALD')
  process.exit(ok ? 0 : 1)
})()
