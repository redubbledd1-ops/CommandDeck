// Commando's die de app zelf afhandelt: cd, clear en exit
const Module = require('module'), path = require('path'), fs = require('fs'), os = require('os')
const REAL = path.join(__dirname, '..')

let ok = true
const t = (l, c) => { console.log((c ? 'PASS  ' : 'FAIL  ') + l); if (!c) ok = false }

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'shell-'))
fs.mkdirSync(path.join(TMP, 'werk', 'sub'), { recursive: true })
fs.writeFileSync(path.join(TMP, 'werk', 'bestand.txt'), 'x')

const handlers = {}
const fake = {
  app: { getPath: () => TMP, whenReady: () => ({ then: () => {} }), on: () => {}, relaunch: () => {}, quit: () => {}, exit: () => {}, isPackaged: false, getAppPath: () => REAL },
  BrowserWindow: function () { this.loadFile = () => {}; this.webContents = { send: () => {} }; this.isDestroyed = () => false },
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
  const werk = path.join(TMP, 'werk')

  let r = await call('fs:resolveDir', { base: TMP, target: 'werk' })
  t('een bestaande map wordt gevonden', r.ok === true && r.path === werk)

  r = await call('fs:resolveDir', { base: werk, target: 'sub' })
  t('relatief pad wordt opgelost vanaf de huidige map', r.ok === true && r.path === path.join(werk, 'sub'))

  r = await call('fs:resolveDir', { base: path.join(werk, 'sub'), target: '..' })
  t('twee punten gaan een map omhoog', r.ok === true && r.path === werk)

  r = await call('fs:resolveDir', { base: TMP, target: werk })
  t('een volledig pad werkt ook', r.ok === true && r.path === werk)

  r = await call('fs:resolveDir', { base: TMP, target: 'bestaat-niet' })
  t('een map die niet bestaat geeft een fout', r.ok === false && r.reason === 'bestaat niet')
  t('en meldt welk pad geprobeerd is', r.path === path.join(TMP, 'bestaat-niet'))

  r = await call('fs:resolveDir', { base: werk, target: 'bestand.txt' })
  t('een bestand is geen map', r.ok === false && r.reason === 'geen map')

  r = await call('fs:resolveDir', { base: TMP, target: '' })
  t('een leeg doel geeft ook een fout', r.ok === false)

  r = await call('fs:resolveDir', { base: TMP, target: '~' })
  t('tilde is de gebruikersmap', r.ok === true && r.path === os.homedir())

  // ── standaardwerkmap bij een verse installatie ─────────────────────────────
  const settingsPad = path.join(TMP, 'settings.json')
  const home = os.homedir()
  fs.writeFileSync(settingsPad, JSON.stringify({ language: 'nl' }))
  let st = await call('settings:load')
  t('cmd start in de gebruikersmap', st.cmd && st.cmd.cwd === home)
  t('powershell start in dezelfde map', st.ps && st.ps.cwd === home)
  t('die map staat meteen bij recente cmd-mappen', st.cmd.recentCwds[0] === home)
  t('en bij recente powershell-mappen', st.ps.recentCwds[0] === home)
  t('powershell gebruikt standaard powershell.exe', st.ps.exe === 'powershell')
  t('en start zonder profiel', st.ps.noProfile === true)
  t('execution policy volgt het systeem', st.ps.executionPolicy === '')

  fs.writeFileSync(settingsPad, JSON.stringify({
    language: 'nl',
    cmd: { cwd: werk, recentCwds: [werk] },
    ps: { cwd: werk, recentCwds: [werk] },
  }))
  st = await call('settings:load')
  t('een gekozen cmd-werkmap blijft staan', st.cmd.cwd === werk)
  t('een gekozen powershell-werkmap blijft staan', st.ps.cwd === werk)

  // ── wat voor project is dit? ───────────────────────────────────────────────
  // De tools-knoppen (pub get, build apk, doctor) horen alleen bij Flutter.
  const soortMap = (naam, bestanden) => {
    const map = path.join(TMP, 'soort', naam)
    fs.mkdirSync(map, { recursive: true })
    for (const [b, inhoud] of Object.entries(bestanden)) fs.writeFileSync(path.join(map, b), inhoud)
    return map
  }
  const flutterMap = soortMap('flutterapp', { 'pubspec.yaml':
    'name: mijn_app\nenvironment:\n  sdk: ">=3.0.0 <4.0.0"\ndependencies:\n  flutter:\n    sdk: flutter\nflutter:\n  uses-material-design: true\n' })
  const dartMap = soortMap('dartpkg', { 'pubspec.yaml':
    'name: mijn_cli\ndependencies:\n  args: ^2.4.0\n' })
  const nodeMap = soortMap('nodeapp', { 'package.json': '{"name":"web"}' })
  const halfMap = soortMap('halfflutter', { '.metadata': 'version:\n  revision: abc\nproject_type: app\n' })

  let so = await call('fs:projectSoort', flutterMap)
  t('een Flutter-project wordt herkend', so.ok === true && so.flutter === true)
  t('en is ook een Dart-project', so.dart === true)

  so = await call('fs:projectSoort', dartMap)
  t('een Dart-pakket zonder Flutter telt niet als Flutter', so.flutter === false)
  t('maar wel als Dart', so.dart === true)

  so = await call('fs:projectSoort', nodeMap)
  t('een node-project is geen Flutter', so.flutter === false && so.node === true)

  so = await call('fs:projectSoort', halfMap)
  t('een .metadata van Flutter telt ook', so.flutter === true)

  so = await call('fs:projectSoort', path.join(TMP, 'bestaat-echt-niet'))
  t('een map die niet bestaat geeft een fout', so.ok === false)

  // ── bladeren door mappen ───────────────────────────────────────────────────
  fs.writeFileSync(path.join(werk, 'zzz-laatste.txt'), 'abc')
  fs.writeFileSync(path.join(werk, 'aaa-eerste.md'), 'x'.repeat(2048))
  fs.mkdirSync(path.join(werk, 'map-b'), { recursive: true })

  let l = await call('fs:listDir', werk)
  t('een map uitlezen lukt', l.ok === true && l.path === werk)
  t('alle items komen mee', l.items.length === 5)
  t('mappen staan bovenaan', l.items[0].dir === true && l.items[1].dir === true)
  t('mappen onderling op naam', l.items[0].name === 'map-b' && l.items[1].name === 'sub')
  t('daarna de bestanden op naam',
    l.items[2].name === 'aaa-eerste.md' && l.items[4].name === 'zzz-laatste.txt')
  t('bestandsgrootte komt mee', l.items.find(i => i.name === 'aaa-eerste.md').size === 2048)
  t('wijzigingstijd komt mee', l.items.every(i => typeof i.mtime === 'number'))
  t('elk item heeft een volledig pad', l.items.every(i => i.path.startsWith(werk)))
  t('de map erboven wordt meegegeven', l.parent === TMP)

  l = await call('fs:listDir', path.parse(TMP).root)
  t('bij de hoofdmap van een schijf is er geen map erboven', l.parent === null)

  l = await call('fs:listDir', path.join(TMP, 'bestaat-niet'))
  t('een onbestaande map geeft een fout', l.ok === false && l.reason === 'bestaat niet')

  l = await call('fs:listDir', path.join(werk, 'bestand.txt'))
  t('een bestand is geen map', l.ok === false && l.reason === 'geen map')

  l = await call('fs:listDir', '')
  t('zonder pad ook een fout', l.ok === false)

  const schijven = await call('fs:listDrives')
  // Schijfletters bestaan alleen op Windows; hier telt dat de vorm klopt.
  t('schijven opvragen levert een lijst op', Array.isArray(schijven))
  t('elke schijf heeft een pad en ruimtegegevens',
    schijven.every(d => /^[A-Z]:\\$/.test(d.path) && typeof d.free === 'number' && typeof d.total === 'number'))

  console.log(ok ? '\nALLE TESTS GESLAAGD' : '\nER ZIJN TESTS GEFAALD')
  process.exit(ok ? 0 : 1)
})()
