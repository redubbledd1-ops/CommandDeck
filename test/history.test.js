const Module = require('module')
const path = require('path')
const fs = require('fs')
const os = require('os')

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'fl-'))
const handlers = {}

const fakeElectron = {
  app: { getPath: () => TMP, whenReady: () => ({ then: () => {} }), on: () => {}, relaunch: () => {}, quit: () => {}, isPackaged: false, getAppPath: () => __dirname },
  BrowserWindow: function () { this.on = () => {}; this.close = () => {}; this.loadFile = () => {}; this.webContents = { send: () => {} } },
  ipcMain: { on: () => {}, handle: (n, f) => { handlers[n] = f } },
  dialog: { showOpenDialog: async () => ({ canceled: true }) },
  shell: { openPath: () => {} },
}

const orig = Module._load
Module._load = function (req, parent, isMain) {
  if (req === 'electron') return fakeElectron
  return orig.apply(this, arguments)
}

// Deze tests gaan over de opslag zelf, niet over de meegeleverde commando's.
//
// Vroeger stond hier een bestand met seeded:true om de startvoorraad tegen te
// houden. Dat werkt bewust niet meer: loadHistory() vult sindsdien bij élke
// start de ontbrekende standaardcommando's aan, zodat bestaande gebruikers
// nieuwe meegeleverde regels bij een update krijgen (zie seed.test.js). Een
// leeg woordenboek bestaat dus niet meer.
//
// Daarom meten we hieronder ten opzichte van de startvoorraad, en gebruiken we
// commando's die níét in cmd-library.js staan — anders vindt het woordenboek
// een bestaande meegeleverde regel en wordt er niets nieuws aangemaakt.
require(path.join(__dirname,'..','main.js'))

const call = (n, a) => handlers[n](null, a)
const HIST = path.join(TMP, 'history.json')

// Eigen commando's, met opzet buiten de meegeleverde lijst gekozen.
const FLUTTER = 'flutter run -d windows-testtoestel'
const GIT     = 'git status --short --branch'
const NPM     = 'npm run build:frontend'

;(async () => {
  let ok = true
  const check = (label, cond) => { console.log((cond ? 'PASS  ' : 'FAIL  ') + label); if (!cond) ok = false }

  const start = await call('history:load')
  // De startvoorraad: alleen meegeleverde regels, nog geen eigen geschiedenis.
  const BASIS = start.entries.length
  check('start: alleen de meegeleverde commando\'s, nog niets van jezelf',
    BASIS > 0 && start.entries.every(e => e.source === 'builtin') && start.recent.length === 0)

  await call('history:record', { cmd: 'flutter run  -d windows-testtoestel', cwd: 'C:\\proj\\a\\', projectId: 'p1', source: 'button' })
  await call('history:record', { cmd: GIT, cwd: 'C:\\proj\\a', projectId: 'p1' })
  await call('history:record', { cmd: FLUTTER, cwd: 'C:\\proj\\b', projectId: 'p2' })
  let h = await call('history:record', { cmd: GIT, cwd: 'C:\\proj\\a', projectId: 'p1' })

  check('woordenboek dedupliceert (2 unieke)', h.entries.length === BASIS + 2)
  const run = h.entries.find(e => e.cmd === FLUTTER)
  check('whitespace genormaliseerd', !!run)
  check('runCount telt op', run.runCount === 2)
  check('twee mappen per commando', run.cwds.length === 2)
  check('trailing slash genormaliseerd', run.cwds[0].path === 'C:\\proj\\a')
  check('projectId bewaard bij map', run.cwds[1].projectId === 'p2')
  check('lastRun gezet', typeof run.lastRun === 'number' && run.lastRun > 0)

  check('recent bevat 4 uitvoeringen', h.recent.length === 4)
  await call('history:record', { cmd: GIT, cwd: 'C:\\proj\\a', projectId: 'p1' })
  h = await call('history:load')
  check('herhaling op rij niet dubbel in recent', h.recent.length === 4 && h.entries.find(e => e.cmd === GIT).runCount === 3)
  check('nieuwste bovenaan', h.recent[0].cmd === GIT)

  check('bestand weggeschreven', fs.existsSync(HIST))
  const disk = JSON.parse(fs.readFileSync(HIST, 'utf8'))
  check('schijf komt overeen met geheugen', disk.entries.length === BASIS + 2 && disk.recent.length === 4)

  h = await call('history:add', { cmd: NPM, label: 'Build frontend', note: 'in web-map', tags: ['web'] })
  check('handmatige regel toegevoegd', h.entries.some(e => e.cmd === NPM && e.source === 'manual'))
  check('handmatige regel niet in recent', !h.recent.some(r => r.cmd === NPM))
  check('handmatige regel is cmd tenzij anders gevraagd',
    h.entries.find(e => e.cmd === NPM).shell === 'cmd')

  // Handmatig toevoegen wat al meegeleverd is, maakt geen tweede regel: het
  // woordenboek dedupliceert op het commando zelf. De bestaande regel wordt
  // bijgewerkt en blijft van herkomst 'builtin'.
  const voorDubbel = h.entries.length
  h = await call('history:add', { cmd: 'git status', label: 'mijn eigen label' })
  const bestaand = h.entries.filter(e => e.cmd === 'git status')
  check('een meegeleverd commando komt er niet dubbel bij',
    h.entries.length === voorDubbel && bestaand.length === 1)
  check('maar het label van die regel wordt wel bijgewerkt',
    bestaand[0].label === 'mijn eigen label' && bestaand[0].source === 'builtin')

  h = await call('history:add', { cmd: 'Get-HotFix', label: 'hotfixes', shell: 'powershell' })
  const psId = h.entries.find(e => e.cmd === 'Get-HotFix').id
  check('powershell-shell wordt bewaard', h.entries.find(e => e.id === psId).shell === 'powershell')
  h = await call('history:update', { id: psId, patch: { shell: 'both' } })
  check('shell is te wijzigen naar beide', h.entries.find(e => e.id === psId).shell === 'both')
  h = await call('history:delete', { id: psId })
  check('powershell-regel weer weg', !h.entries.some(e => e.id === psId))

  const gid = h.entries.find(e => e.cmd === GIT).id
  h = await call('history:update', { id: gid, patch: { favorite: true, note: 'check voor commit' } })
  check('favoriet gezet', h.entries.find(e => e.id === gid).favorite === true)
  check('notitie opgeslagen', h.entries.find(e => e.id === gid).note === 'check voor commit')

  h = await call('history:delete', { id: gid })
  check('regel verwijderd', !h.entries.some(e => e.id === gid))
  check('recent opgeschoond', !h.recent.some(r => r.entryId === gid))

  h = await call('history:clear', { what: 'recent' })
  check('alleen recent gewist', h.recent.length === 0 && h.entries.length === BASIS + 2)

  console.log(ok ? '\nALLE TESTS GESLAAGD' : '\nER ZIJN TESTS GEFAALD')
  process.exit(ok ? 0 : 1)
})()
