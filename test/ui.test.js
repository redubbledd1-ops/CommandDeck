const fs = require('fs'), path = require('path')
const { JSDOM } = require('jsdom')
const APP = path.join(__dirname, '..')

let ok = true
const check = (l, c) => { console.log((c ? 'PASS  ' : 'FAIL  ') + l); if (!c) ok = false }

// ── nagebootste backend ──────────────────────────────────────────────────────
let store = {
  entries: [
    { id: 'e1', cmd: 'flutter build apk --release', label: 'Release APK', note: '', tags: ['build'],
      favorite: true, source: 'run', firstRun: 1, lastRun: Date.now() - 3600e3, runCount: 7,
      lastCwd: 'C:\\a', cwds: [{ path: 'C:\\a', lastRun: Date.now() - 3600e3, runCount: 7 }] },
    { id: 'e2', cmd: 'git status', label: '', note: 'voor commit', tags: [],
      favorite: false, source: 'run', firstRun: 1, lastRun: Date.now() - 60e3, runCount: 3,
      lastCwd: 'C:\\b', cwds: [{ path: 'C:\\a', lastRun: 1, runCount: 1 }, { path: 'C:\\b', lastRun: Date.now()-60e3, runCount: 2 }] },
    { id: 'e3', cmd: 'npm run build', label: 'Frontend', note: '', tags: ['web'],
      favorite: false, source: 'manual', firstRun: 1, lastRun: null, runCount: 0, cwds: [] },
  ],
  recent: [ { cmd: 'git status', cwd: 'C:\\b', entryId: 'e2', ts: 3 },
            { cmd: 'flutter build apk --release', cwd: 'C:\\a', entryId: 'e1', ts: 2 },
            { cmd: 'git status', cwd: 'C:\\a', entryId: 'e2', ts: 1 } ],
}
let settings = {
  autoFix: { enabled: true },
  history: { enabled: true, persist: true, maxRecent: 300, maxEntries: 2000 },
  cmd: { cwd: 'C:\\a', recentCwds: ['C:\\a', 'C:\\b'] },
  ps: { cwd: 'C:\\a', recentCwds: ['C:\\a'] },
  editors: { cursor: { enabled: true, path: 'cursor' }, claudeCode: { enabled: false, path: '' },
             vscode: { enabled: false, path: '' }, androidStudio: { enabled: false, path: '' },
             claudeDesktop: { enabled: false, path: '' }, custom: { enabled: false, path: '', label: '' } },
}
const projects = [{ id: 'p1', name: 'dd_crypto', icon: '💰', device: 'abc',
  locations: [{ label: 'main', path: 'C:\\a' }], activeLocation: 0, release: false, cmdVisibility: {} }]

const executed = []
let pickedFolder = 'C:\\gekozen'
let uitgepakt = []
let metGeopend = []
let getoond = []
let gezipt = []
let bewerkingen = []
let voortgangCb = null
let winKlembord = { paden: [], knippen: false }
let updates = []
let soortVragen = []
let cmdVensters = []
let psVensters = []
let gelezenMappen = []
let zoekOpdrachten = []
let zoekAfgebroken = 0
let zoekAntwoord = null
let zoekTrefferCb = null
let ptyStarts = []
let ptyWrites = []
let ptyStops = []
let ptyResizes = []
let ptyAntwoord = { ok: true, pid: 1234 }
let ptyErBij = { ok: true, reden: '' }
// De testen starten de renderer een paar keer opnieuw op (zie herstart()). Elke
// keer meldt die zich opnieuw aan voor pty-berichten. In de echte app is er maar
// één, hier houden we ze allemaal vast en sturen we naar allemaal — alleen de
// renderer die de sessie kent doet er iets mee.
let ptyDataCbs = []
let ptyExitCbs = []
const ptyData = (d) => ptyDataCbs.forEach(cb => cb(d))
const ptyExit = (d) => ptyExitCbs.forEach(cb => cb(d))
let editorStarts = []
let projectSoorten = { 'C:\\a': { ok: true, flutter: true, dart: true, node: false } }
let updateAntwoord = { ok: true }
let archieven = {
  'C:\\a\\pakket.zip': ['leesmij.txt', 'map/', 'map/binnenin.txt', 'map/diep/dieper.txt'],
  'C:\\a\\oud.rar': 'geen-tool',
}
let gemeten = []
let gestopt = 0
let metenAf = ''            // '', 'fout', 'afgebroken' of 'deels'
let metenWacht = false
let metenLosser = null
let groottes = {}
let mappen = {
  'C:\\': [
    { name: 'a', path: 'C:\\a', dir: true, size: 0, mtime: 1 },
    { name: 'leesmij.txt', path: 'C:\\leesmij.txt', dir: false, size: 40, mtime: 1 },
  ],
  'C:\\a': [
    { name: 'lib', path: 'C:\\a\\lib', dir: true, size: 0, mtime: 1 },
    { name: 'sub', path: 'C:\\a\\sub', dir: true, size: 0, mtime: 1 },
    { name: 'main.dart', path: 'C:\\a\\main.dart', dir: false, size: 2048, mtime: 1 },
    { name: 'pubspec.yaml', path: 'C:\\a\\pubspec.yaml', dir: false, size: 512, mtime: 1 },
    { name: 'pakket.zip', path: 'C:\\a\\pakket.zip', dir: false, size: 9999, mtime: 1, archief: true },
    { name: 'oud.rar', path: 'C:\\a\\oud.rar', dir: false, size: 8888, mtime: 1, archief: true },
  ],
  'C:\\a\\lib': [
    { name: 'diep', path: 'C:\\a\\lib\\diep', dir: true, size: 0, mtime: 1 },
    { name: 'app.dart', path: 'C:\\a\\lib\\app.dart', dir: false, size: 100, mtime: 1 },
  ],
  'C:\\a\\sub': [],
  'C:\\gekozen': [{ name: 'iets.txt', path: 'C:\\gekozen\\iets.txt', dir: false, size: 10, mtime: 1 }],
  'C:\\a\\lib\\diep': [],
  // Voor de sorteertesten: alles verschilt van elkaar, zodat elke sleutel een
  // andere volgorde oplevert.
  'C:\\sorteer': [
    { name: 'zebra.txt',  path: 'C:\\sorteer\\zebra.txt',  dir: false, size: 100,  mtime: 5000 },
    { name: 'appel.zip',  path: 'C:\\sorteer\\appel.zip',  dir: false, size: 9000, mtime: 1000, archief: true },
    { name: 'midden.dat', path: 'C:\\sorteer\\midden.dat', dir: false, size: 500,  mtime: 3000 },
    { name: 'zmap',       path: 'C:\\sorteer\\zmap',       dir: true,  size: 0,    mtime: 2000 },
    { name: 'amap',       path: 'C:\\sorteer\\amap',       dir: true,  size: 0,    mtime: 4000 },
  ],
}
let bestaandeMappen = ['C:\\a', 'C:\\gekozen', 'C:\\zonderspatie', 'C:\\Mijn Projecten\\app', 'C:\\tools\\scripts', 'C:\\a\\sub', 'C:\\sorteer']
let failNext = false
let batFiles = {}
let batMtimes = {}
let pickedBat = null
let pickedRunFiles = []
let testRuns = []
let saveAsPath = undefined
let pickedIcon = null
let gekozenExe = null
let gevondenEditorsMock = []
let programmas = [
  { naam: 'Notepad++', pad: 'C:\\Program Files\\Notepad++\\notepad++.exe' },
  { naam: 'Sublime Text', pad: 'C:\\Program Files\\Sublime\\sublime_text.exe' },
  { naam: 'Visual Studio Code', pad: 'C:\\Users\\redub\\AppData\\Local\\Programs\\Microsoft VS Code\\Code.exe' },
]
let madeExes = []
let exeFail = false

// ── nagebootste git ──────────────────────────────────────────────────────────
// De git-sectie bij de projectinstellingen is DOM-code die alleen hier draait.
// `gitStaatNu` is wat git:info teruggeeft; `gitCheckNu` wat de netwerkcontrole
// zegt. De tests zetten die om en kijken wat de sectie ervan maakt.
let gitStaatNu = null
let gitChecks = []
let gitVergeten = []
let gitignoreGeschreven = []
let ghRepoVragen = []
let ghRepoAntwoord = { ok: true, repos: [] }

const api = {
  gitInfo: async () => gitStaatNu ? JSON.parse(JSON.stringify(gitStaatNu)) : null,
  gitRemoteCheck: async (p) => { gitChecks.push(p); return { ok: null, reden: '' } },
  gitRemoteVergeet: async (p) => { gitVergeten.push(p); return true },
  gitIgnoreVoorstel: async () => ({ ok: true, bestaat: false, soorten: ['gradle'],
                                    inhoud: '# gradle\n.gradle/\nbuild/\nlocal.properties\n' }),
  gitIgnoreSchrijf: async (o) => { gitignoreGeschreven.push(o); return { ok: true, pad: 'C:\\a\\.gitignore' } },
  gitPaden: async () => true,
  gitProjecten: async () => true,
  gitAfsluitHartslag: () => {},
  gitGhRepos: async (o) => { ghRepoVragen.push(o); return ghRepoAntwoord },
  loadProjects: async () => JSON.parse(JSON.stringify(projects)),
  saveProjects: async (p) => { projects.length = 0; projects.push(...JSON.parse(JSON.stringify(p))); return true },
  loadLocale: async (code) => {
    try {
      return JSON.parse(fs.readFileSync(path.join(APP, 'locales', (code || 'nl') + '.json'), 'utf8'))
    } catch {
      return JSON.parse(fs.readFileSync(path.join(APP, 'locales', 'nl.json'), 'utf8'))
    }
  },
  listLanguages: async () => [{ code: 'nl', label: 'Nederlands' }, { code: 'en', label: 'English' }],
  detectLanguage: async () => 'nl',
  loadSettings: async () => settings,
  saveSettings: async (s) => {
    const kopie = JSON.parse(JSON.stringify(s))
    for (const k of Object.keys(settings)) delete settings[k]
    Object.assign(settings, kopie)
    return true
  },
  loadHistory:  async () => JSON.parse(JSON.stringify(store)),
  recordHistory: async (o) => { executed.push(o); return JSON.parse(JSON.stringify(store)) },
  addHistory: async ({ cmd, label, note, tags, favorite, shell }) => {
    store.entries.unshift({ id: 'new' + store.entries.length, cmd, label, note, tags, favorite,
      shell: shell || 'cmd', source: 'manual', firstRun: Date.now(), lastRun: null, runCount: 0, cwds: [] })
    return JSON.parse(JSON.stringify(store))
  },
  updateHistory: async ({ id, patch }) => {
    const e = store.entries.find(x => x.id === id); Object.assign(e, patch)
    return JSON.parse(JSON.stringify(store))
  },
  deleteHistory: async ({ id }) => {
    store.entries = store.entries.filter(e => e.id !== id)
    store.recent  = store.recent.filter(r => r.entryId !== id)
    return JSON.parse(JSON.stringify(store))
  },
  seedDefaults: async () => {
    const nieuw = [{ id: 'b1', cmd: '@echo off', label: 'Commando\'s niet meeprinten', note: '', tags: ['bat'],
                     favorite: false, snippet: true, source: 'builtin', firstRun: 1, lastRun: null, runCount: 0, cwds: [] }]
    store.entries.push(...nieuw.filter(n => !store.entries.some(e => e.cmd === n.cmd)))
    return { ok: true, added: 1, history: JSON.parse(JSON.stringify(store)) }
  },
  clearHistory: async ({ what }) => {
    if (what === 'recent') store.recent = []; else { store.recent = []; store.entries = [] }
    return JSON.parse(JSON.stringify(store))
  },
  pickFolder: async () => pickedFolder,
  listDir: async (p) => {
    gelezenMappen.push(p)
    // net als op schijf: een afsluitende backslash maakt niet uit
    const genormaliseerd = p.length > 3 ? p.replace(/\\+$/, '') : p
    const inhoud = mappen[genormaliseerd] || mappen[p]
    p = genormaliseerd
    if (!inhoud) return { ok: false, reason: 'bestaat niet' }
    const boven = p.replace(/\\[^\\]+$/, '')
    return { ok: true, path: p, parent: (boven && boven !== p && boven.length > 2) ? boven : null, items: inhoud }
  },
  listArchive: async (p) => {
    const [arch, binnen = ''] = p.split('::')
    if (!archieven[arch]) return { ok: false, reason: 'bestaat niet' }
    if (archieven[arch] === 'geen-tool') return { ok: false, reason: 'Voor dit type archief is 7-Zip of WinRAR nodig.', geenTool: true }
    const voor = binnen ? binnen.replace(/\/+$/, '') + '/' : ''
    const gezien = new Map()
    for (const naam of archieven[arch]) {
      if (voor && !naam.startsWith(voor)) continue
      const rest = naam.slice(voor.length).replace(/\/+$/, '')
      if (!rest) continue
      const stuk = rest.split('/')[0]
      const isMap = rest.includes('/') || naam.endsWith('/')
      if (!gezien.has(stuk)) gezien.set(stuk, { name: stuk, path: arch + '::' + voor + stuk, dir: isMap, size: isMap ? 0 : 42, mtime: 1, inArchief: true })
    }
    const items = [...gezien.values()].sort((x, y) => (y.dir - x.dir) || x.name.localeCompare(y.name))
    return { ok: true, path: p, parent: binnen ? arch + '::' + binnen.split('/').slice(0, -1).join('/') : arch.replace(/\\[^\\]+$/, ''), items, archief: true }
  },
  openInArchive: async (p) => { uitgepakt.push(p); return { ok: true, path: 'C:\\temp\\' + p.split('/').pop() } },
  archiveTool: async () => ({ ok: false }),
  listDrives: async () => [{ path: 'C:\\', free: 50e9, total: 500e9 }, { path: 'D:\\', free: 1e12, total: 2e12 }],
  stopZoeken: async () => { zoekAfgebroken++; return true },
  onZoekTreffers: (cb) => { zoekTrefferCb = cb; return () => {} },
  zoek: async ({ root, vraag, token, max = 500 }) => {
    zoekOpdrachten.push({ root, vraag, token })
    if (zoekAntwoord) return zoekAntwoord
    const naald = String(vraag).toLowerCase()
    const treffers = []
    const wachtrij = [root]
    while (wachtrij.length && treffers.length < max) {
      const map = wachtrij.shift()
      for (const i of (mappen[map] || [])) {
        if (i.dir) wachtrij.push(i.path)
        if (!i.name.toLowerCase().includes(naald)) continue
        const ouder = i.path.replace(/\\[^\\]+$/, '')
        treffers.push({ ...i, map: ouder === root ? '.' : ouder.slice(root.length + 1) })
      }
    }
    // net als de echte: onderweg alvast doorsturen
    if (zoekTrefferCb && treffers.length) zoekTrefferCb({ token, items: treffers.slice(0, 1) })
    return { ok: true, root, vraag: naald, token, items: treffers, deels: false, afgekapt: '' }
  },
  projectSoort: async (pad) => {
    soortVragen.push(pad)
    return projectSoorten[pad] || { ok: true, flutter: false, dart: false, node: false }
  },
  resolveDir: async ({ base, target }) => {
    if (!target) return { ok: false, reason: 'leeg' }
    // simpele nabootsing: alleen mappen uit deze lijst bestaan
    const vol = /^[a-z]:\\/i.test(target) ? target : (base.replace(/\\+$/, '') + '\\' + target)
    return bestaandeMappen.includes(vol)
      ? { ok: true, path: vol }
      : { ok: false, reason: 'bestaat niet', path: vol }
  },
  listBats: async (cwd) => Object.keys(batFiles)
    .filter(f => /\.(bat|cmd)$/i.test(f) && !/[\\/]~proef-/i.test(f))
    .filter(f => f.startsWith(cwd + '\\') && !f.slice(cwd.length + 1).includes('\\'))
    .map(f => ({ name: f.split('\\').pop(), path: f, mtime: 1 })),
  readBat: async (p) => batFiles[p] !== undefined ? { ok: true, content: batFiles[p], mtime: batMtimes[p] || 1 } : { ok: false, reason: 'notfound' },
  batStat: async (p) => batFiles[p] !== undefined ? { ok: true, mtime: batMtimes[p] || 1 } : { ok: false, reason: 'notfound' },
  saveBat: async ({ filePath, content }) => { batFiles[filePath] = content; batMtimes[filePath] = (batMtimes[filePath] || 0) + 1; return { ok: true, path: filePath, mtime: batMtimes[filePath] } },
  getFilePath: (f) => f.__pad || '',
  pickRunFiles: async () => pickedRunFiles,
  saveAs: async ({ defaultPath }) => saveAsPath === undefined ? defaultPath : saveAsPath,
  pickIcon: async () => pickedIcon,
  makeExe: async (o) => { madeExes.push(o); return exeFail ? { ok: false, reason: 'nooutput' } : { ok: true, path: o.exePath, iconCount: o.iconPath ? 4 : 0, cacheVervers: !!o.iconPath } },
  testBat: async ({ dir, name, content }) => { testRuns.push({ dir, name, content }); return { ok: true, path: (dir || 'C:\\tmp') + '\\~proef-x.bat' } },
  batExists: async (p) => batFiles[p] !== undefined,
  deleteBat: async (p) => { if (batFiles[p] === undefined) return { ok: false, reason: 'notfound' }; delete batFiles[p]; return { ok: true } },
  pickBat: async () => pickedBat,
  pickExe: async () => gekozenExe,
  listPrograms: async () => programmas,
  scanEditors: async () => gevondenEditorsMock,
  openFolder: () => {}, openCmd: (o) => { cmdVensters.push(o) },
  openPs: (o) => { psVensters.push(o) },
  ptyBeschikbaar: async () => ptyErBij,
  ptyStart:  async (o) => { ptyStarts.push(o); return ptyAntwoord },
  ptyWrite:  async (o) => { ptyWrites.push(o); return true },
  ptyResize: async (o) => { ptyResizes.push(o); return true },
  ptyStop:   async (o) => { ptyStops.push(o); return true },
  onPtyData: (cb) => { ptyDataCbs.push(cb); return () => {} },
  onPtyExit: (cb) => { ptyExitCbs.push(cb); return () => {} },
  openWith: async (p) => { metGeopend.push(p); return { ok: true } },
  revealItem: async (p) => { getoond.push(p); return { ok: true } },
  nieuwItem: async ({ map, naam, isMap }) => {
    const pad = map.replace(/\\+$/, '') + '\\' + naam
    mappen[map] = [...(mappen[map] || []), { name: naam, path: pad, dir: !!isMap, size: 0, mtime: 1 }]
    if (isMap) mappen[pad] = []
    return { ok: true, path: pad, hernoemd: false }
  },
  maakZip: async ({ paden, doel }) => { gezipt.push({ paden, doel }); return { ok: true, path: doel, aantal: paden.length, grootte: 1234 } },
  bestandInfo: async (p) => ({ ok: true, path: p, naam: p.split('\\').pop(), map: false, size: 2048, gemaakt: 1, gewijzigd: 2, alleenLezen: false }),
  conflicten: async ({ bronnen, doelMap }) => ({
    ok: true,
    namen: bronnen.map(b => b.split('\\').pop())
      .filter(n => (mappen[doelMap] || []).some(i => i.name === n)),
  }),
  kopieerItems: async (o) => { bewerkingen.push({ soort: o.verplaatsen ? 'verplaats' : 'kopieer', ...o }); return { ok: true, gedaan: o.bronnen.length, overgeslagen: 0, fouten: [] } },
  verwijderItems: async (o) => { bewerkingen.push({ soort: 'verwijder', ...o }); return { ok: true, gedaan: o.paden.length, fouten: [] } },
  hernoemItem: async ({ pad, naam }) => {
    const nieuw = pad.replace(/[^\\]+$/, naam)
    bewerkingen.push({ soort: 'hernoem', pad, naam })
    const map = pad.replace(/\\[^\\]+$/, '')
    mappen[map] = (mappen[map] || []).map(i => i.path === pad ? { ...i, name: naam, path: nieuw } : i)
    return { ok: true, path: nieuw }
  },
  annuleerKopie: async () => true,
  mapGrootte: async ({ path: pad, ronde, budget }) => {
    gemeten.push({ pad, ronde, budget })
    if (metenAf === 'fout') return { ok: false, reason: 'geen toegang' }
    if (metenAf === 'afgebroken') return { ok: false, reason: 'afgebroken' }
    // pas antwoorden als de test dat wil, zodat "bezig" zichtbaar blijft
    if (metenWacht) await new Promise(r => { metenLosser = r })
    return { ok: true, path: pad, bytes: groottes[pad] ?? 4096, bestanden: 3, mappen: 1, deels: metenAf === 'deels' }
  },
  stopGroottes: async () => { gestopt++; return { ok: true } },
  zetKlembord:  async (o) => { winKlembord = { paden: o.paden || [], knippen: !!o.knippen }; return { ok: true } },
  leesKlembord: async ()  => ({ ok: true, ...winKlembord }),
  onVoortgang: (cb) => { voortgangCb = cb; return () => {} },
  runCmd: async (o) => {
    executed.push({ ran: o.cmd, cwd: o.cwd, projectId: o.projectId, shell: o.shell })
    const code = failNext ? 1 : 0
    failNext = false
    return { success: code === 0, code, cancelled: false }
  },
  runCmdWithAutofix: async (o) => { executed.push({ ran: o.cmd, cwd: o.cwd, projectId: o.projectId }); return { success: true } },
  openEditor: (o) => { editorStarts.push(o) }, openClaudeDesktop: () => {}, killCmd: () => {},
  relaunch: () => {},
  updateAndRestart: async (o) => { updates.push(o || null); return updateAntwoord },
  runtimeInfo: async () => ({ packaged: false, version: '1.0.0' }),
  onOutput: () => () => {},
  aiProviders: async () => [{
    id: 'openai', label: 'OpenAI', merk: 'OpenAI',
    sleutelBron: 'opgeslagen', heeftSleutel: true, sleutelNodig: true,
    lokaal: false, standaardModel: 'gpt-4o',
  }],
}

// Een heel klein xterm-je: genoeg om te zien of de app er het juiste mee doet.
let laatsteTerm = null
class NepTerminal {
  constructor(opts) {
    this.opts = opts; this.cols = 100; this.rows = 30
    this.options = { fontSize: opts && opts.fontSize }
    this.geschreven = []; this._cbs = []; this.gefocust = false; this.weg = false
    laatsteTerm = this
  }
  loadAddon(a) { this.addon = a; if (a && a.activate) a.activate(this) }
  open(el) { this.element = el; el.innerHTML = '<div class="xterm"></div>' }
  onData(cb) { this._cbs.push(cb) }
  write(d) { this.geschreven.push(String(d)) }
  focus() { this.gefocust = true }
  dispose() { this.weg = true }
  typ(d) { this._cbs.forEach(cb => cb(d)) }
  alles() { return this.geschreven.join('') }
}
class NepFit { activate() {} fit() {} }

// jsdom kent geen scrollIntoView; we onthouden waar de app naartoe wilde
let inBeeldGehaald = []

const html = fs.readFileSync(path.join(APP, 'index.html'), 'utf8')
const dom = new JSDOM(html, { runScripts: 'outside-only', url: 'http://localhost/' })
const { window } = dom
global.window = window; global.document = window.document
window.api = api
window.confirm = () => true
window.requestAnimationFrame = (cb) => cb()
Object.defineProperty(window.navigator, 'clipboard', { value: { writeText: () => {} }, configurable: true })

window.Element.prototype.scrollIntoView = function (o) { inBeeldGehaald.push(this) }
window.eval(fs.readFileSync(path.join(APP, 'i18n.js'), 'utf8') + '\nglobalThis.I18N = I18N;')
window.eval(fs.readFileSync(path.join(APP, 'git-tools.js'), 'utf8'))
window.eval(fs.readFileSync(path.join(APP, 'accounts.js'), 'utf8'))
// Een handvat om iets in de projecten van de renderer te zetten. Elke
// window.eval krijgt in jsdom zijn eigen scope, dus zonder dit komen we niet
// bij zijn `projects` — en dan is niet te testen of opslaan iets laat staan.
window.eval(fs.readFileSync(path.join(APP, 'renderer.js'), 'utf8')
  + '\nglobalThis.__test = { zetProjectProfiel: (i, id) => { projects[i].gitProfiel = id },'
  + '\n  zetGitStaat: (pad, staat) => { gitStaten[pad] = staat },'
  + '\n  cmdIdsInBeeld, verplaatsCmdVolgorde, cmdGridHtml, knoppenInMap,'
  + '\n  autoMappen, hefMappenOp, legInMap, verplaatsKnopId,'
  + '\n  rijVolgorde, ordenProject, zetKnopInMap, folderVanKnop,'
  + '\n  verwijderMap, folderOp };')
startVraagAutomaat()
const W = window
const inBevrorenPaneel = (el) => {
  const host = el && el.closest && el.closest('.paneel-bevroren')
  return !!(host && host !== el)
}
const $ = (s) => [...window.document.querySelectorAll(s)].find(el => !inBevrorenPaneel(el)) || null
const $$ = (s) => [...window.document.querySelectorAll(s)].filter(el => !inBevrorenPaneel(el))
const browserKeuzeLeeg = () => { const f = window.document.getElementById('br-filter'); if (f) { f.value = ''; f.dispatchEvent(new window.Event('input')) } }
const batCwd2 = () => window.document.getElementById('bat-cwd-select').value
const tick = () => new Promise(r => setTimeout(r, 0))

// De app gebruikt geen window.confirm meer maar een eigen venster. Deze automaat
// beantwoordt het zodra het verschijnt, net zoals window.confirm = () => true
// dat vroeger deed. Met kiesKnop() stuur je welke knop het wordt.
// leeg = de laatste knop (de bevestigende). Een array werkt als wachtrij:
// het eerste venster krijgt het eerste antwoord, enzovoort.
let vraagKnop = ''
let laatsteVraag = null
const kiesKnop = (t) => { vraagKnop = t }
function leesVraag(m) {
  const titel  = window.document.getElementById('vraag-titel').textContent
  const tekst  = window.document.getElementById('vraag-tekst').textContent
  const regels = [...m.querySelectorAll('.vraag-regel')].map(r => r.textContent).join(' ')
  return { titel, tekst, regels, alles: `${titel} ${tekst} ${regels}` }
}
function startVraagAutomaat() {
  const m = window.document.getElementById('modal-vraag')
  const beantwoord = () => {
    if (m.hidden) return
    laatsteVraag = leesVraag(m)
    const knoppen = [...m.querySelectorAll('#vraag-knoppen button')]
    if (!knoppen.length) return
    const wil = Array.isArray(vraagKnop) ? (vraagKnop.shift() || '') : vraagKnop
    const knop = wil
      ? knoppen.find(b => b.textContent.toLowerCase().includes(wil.toLowerCase()))
      : knoppen[knoppen.length - 1]
    if (!knop) throw new Error(`geen knop "${wil}" in: ` + knoppen.map(b => b.textContent).join(', '))
    knop.click()
  }
  new window.MutationObserver(beantwoord).observe(m, { attributes: true, attributeFilter: ['hidden'] })
}


;(async () => {
  window.document.dispatchEvent(new window.Event('DOMContentLoaded'))
  await tick(); await tick()

  // ── sidebar ────────────────────────────────────────────────────────────────
  check('cmd-knop staat boven de projecten-sectie',
    html.indexOf('btn-nav-cmd') < html.indexOf('id="proj-list"'))
  check('de groep heet opdrachten',
    $('[data-i18n="sidebar.sectionCmd"]').textContent === 'opdrachten')
  check('bat-knop heet bat',
    $('[data-i18n="sidebar.navBat"]').textContent === 'bat')
  check('powershell-knop staat in de zijbalk', !!$('#btn-nav-ps'))
  check('powershell-knop heeft een potlood', !!$('#nav-ps-edit'))
  check('woordenboek-teller toont aantal', $('#nav-dict-count').textContent === '3')

  // ── breedte van de zijbalk ─────────────────────────────────────────────────
  const zijGreep = $('#zijbalk-greep')
  check('scheidingslijn is een knop', !!zijGreep && zijGreep.tagName === 'BUTTON')
  check('standaardbreedte staat op de layout',
    $('.layout').style.getPropertyValue('--sidebar-w') === '210px')
  zijGreep.dispatchEvent(new window.MouseEvent('mousedown', { button: 0, clientX: 210, bubbles: true }))
  document.dispatchEvent(new window.MouseEvent('mousemove', { clientX: 280, bubbles: true }))
  document.dispatchEvent(new window.MouseEvent('mouseup', { bubbles: true }))
  await tick()
  check('slepen maakt de zijbalk breder', settings.zijbalkBreedte === 280)
  check('en dat staat op de layout', $('.layout').style.getPropertyValue('--sidebar-w') === '280px')
  zijGreep.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true }))
  await tick()
  check('pijltje-links maakt 10px smaller', settings.zijbalkBreedte === 270)
  zijGreep.dispatchEvent(new window.MouseEvent('dblclick', { bubbles: true }))
  await tick()
  check('dubbelklik herstelt de standaardbreedte', settings.zijbalkBreedte === 210)
  zijGreep.dispatchEvent(new window.MouseEvent('mousedown', { button: 0, clientX: 210, bubbles: true }))
  document.dispatchEvent(new window.MouseEvent('mousemove', { clientX: 0, bubbles: true }))
  document.dispatchEvent(new window.MouseEvent('mouseup', { bubbles: true }))
  await tick()
  check('niet smaller dan het minimum', settings.zijbalkBreedte === 140)
  zijGreep.dispatchEvent(new window.MouseEvent('dblclick', { bubbles: true }))
  await tick()

  // ── CMD-sectie ─────────────────────────────────────────────────────────────
  $('#btn-nav-cmd').click(); await tick()
  check('cmd-paneel zichtbaar', $('#cmd-panel').style.display === 'flex')
  check('projectpaneel verstopt (geen dubbele terminal-ID)', $('#main').style.display === 'none')
  check('precies één terminal in de DOM', $$('#terminal').length === 1)
  check('precies één commandoveld', $$('#term-input').length === 1)
  check('onthouden werkmap staat voorgeselecteerd', $('#cmd-cwd-select').value === 'C:\\a')
  check('recente mappen in de dropdown', $$('#cmd-cwd-select option').length === 2)
  check('favoriet verschijnt als snelkoppeling',
    $$('[data-quick]').some(b => b.textContent.includes('Release APK')))
  check('handmatig toegevoegd commando verschijnt als snelkoppeling',
    $$('[data-quick]').some(b => b.textContent.includes('Frontend')))
  check('gewoon gebruikt commando komt NIET bij de snelkoppelingen',
    !$$('[data-quick]').some(b => b.textContent.includes('git status')))
  check('commandoveld heeft direct focus', window.document.activeElement.id === 'term-input')

  // map kiezen via verkenner
  $('#cmd-pick-folder').click(); await tick(); await tick()
  check('gekozen map wordt opgeslagen in settings', settings.cmd.cwd === 'C:\\gekozen')
  check('gekozen map bovenaan de recente lijst', settings.cmd.recentCwds[0] === 'C:\\gekozen')
  check('geen duplicaten in recente mappen',
    new Set(settings.cmd.recentCwds).size === settings.cmd.recentCwds.length)

  // commando uitvoeren in de cmd-sectie
  $('#term-input').value = 'echo hallo'
  $('#term-run-btn').click(); await tick(); await tick()
  check('commando draait in de gekozen map',
    executed.some(e => e.ran === 'echo hallo' && e.cwd === 'C:\\gekozen'))
  check('uitvoering belandt in de geschiedenis',
    executed.some(e => e.cmd === 'echo hallo' && e.projectId === '__cmd__'))
  check('invoerveld is geleegd na uitvoeren', $('#term-input').value === '')

  // ── mislukte commando's worden niet bewaard ────────────────────────────────
  const recordedCmds = () => executed.filter(e => e.cmd).map(e => e.cmd)
  failNext = true
  $('#term-input').value = 'commando-dat-faalt'
  $('#term-run-btn').click(); await tick(); await tick()
  check('mislukt commando is wél uitgevoerd',
    executed.some(e => e.ran === 'commando-dat-faalt'))
  check('mislukt commando komt NIET in de geschiedenis',
    !recordedCmds().includes('commando-dat-faalt'))

  $('#term-input').value = 'commando-dat-lukt'
  $('#term-run-btn').click(); await tick(); await tick()
  check('geslaagd commando komt wél in de geschiedenis',
    recordedCmds().includes('commando-dat-lukt'))

  // ── cd: map-knop naast het invoerveld ──────────────────────────────────────
  const pick = $('#term-pick-folder')
  check('map-knop staat standaard verborgen', pick.hidden === true)
  const type = (v) => { $('#term-input').value = v; $('#term-input').dispatchEvent(new window.Event('input')) }
  type('flutter run')
  check('map-knop blijft verborgen bij gewoon commando', pick.hidden === true)
  type('cd')
  check('map-knop verschijnt zodra je cd typt', pick.hidden === false)
  type('cd C:\\ergens')
  check('map-knop blijft zichtbaar met pad erachter', pick.hidden === false)

  pickedFolder = 'C:\\Mijn Projecten\\app'
  pick.click(); await tick(); await tick()
  check('gekozen pad met spaties komt tussen aanhalingstekens',
    $('#term-input').value === 'cd "C:\\Mijn Projecten\\app"')
  check('cursor keert terug naar het commandoveld',
    window.document.activeElement.id === 'term-input')

  pickedFolder = 'C:\\zonderspatie'
  type('cd'); pick.click(); await tick(); await tick()
  check('pad zonder spaties krijgt geen aanhalingstekens',
    $('#term-input').value === 'cd C:\\zonderspatie')

  // cd uitvoeren verzet de werkmap in plaats van een zinloos shell-proces
  const nCd = executed.length
  $('#term-run-btn').click(); await tick(); await tick(); await tick()
  check('cd verzet de werkmap', settings.cmd.cwd === 'C:\\zonderspatie')
  check('cd start geen shell-proces',
    !executed.slice(nCd).some(e => e.ran && e.ran.startsWith('cd')))
  check('cd wordt niet als commando bewaard',
    !executed.slice(nCd).some(e => e.cmd && e.cmd.startsWith('cd')))
  check('nieuwe werkmap staat in de dropdown', $('#cmd-cwd-select').value === 'C:\\zonderspatie')

  // ── secties in de zijbalk: inklappen en van plek wisselen ──────────────────
  const secties = () => $$('.sidebar-sectie').map(el => el.dataset.zijsectie)
  const kop = (naam) => $(`.sidebar-sectie[data-zijsectie="${naam}"] .sidebar-header`)
  const inhoud = (naam) => $(`.sidebar-sectie[data-zijsectie="${naam}"] .sectie-inhoud`)
  const drukLang = async (el) => {
    el.dispatchEvent(new window.MouseEvent('mousedown', { bubbles: true, button: 0 }))
    await new Promise(r => setTimeout(r, 450))
  }

  check('de zijbalk heeft drie secties', secties().join(',') === 'cmd,dezepc,projecten')
  check('en die staan open',
    inhoud('cmd').hidden === false && inhoud('projecten').hidden === false)

  kop('cmd').click(); await tick()
  check('op de kop klikken klapt de sectie in', inhoud('cmd').hidden === true)
  check('het pijltje wijst dan opzij',
    $('.sidebar-sectie[data-zijsectie="cmd"] .sectie-pijl').classList.contains('ti-chevron-right'))
  check('en dat wordt onthouden', settings.zijbalkOpen.cmd === false)
  check('de andere sectie blijft gewoon open', inhoud('projecten').hidden === false)

  kop('cmd').click(); await tick()
  check('nog een klik klapt hem weer uit',
    inhoud('cmd').hidden === false && settings.zijbalkOpen.cmd === true)

  // de sorteerknop in de kop mag niet meteen inklappen
  $('#sort-nav').click(); await tick()
  check('de sorteerknop in de kop klapt niets in', inhoud('cmd').hidden === false)
  $('#sort-nav').click(); await tick()

  // slepen begint pas na lang drukken
  const cmdSectie = $('.sidebar-sectie[data-zijsectie="cmd"]')
  cmdSectie.dispatchEvent(new window.MouseEvent('mousedown', { bubbles: true, button: 0 }))
  check('een korte druk maakt nog niets sleepbaar', cmdSectie.draggable !== true)
  kop('cmd').dispatchEvent(new window.MouseEvent('mouseup', { bubbles: true }))

  await drukLang(kop('cmd'))
  check('na lang drukken is de sectie sleepbaar', cmdSectie.draggable === true)
  check('en dat is te zien', cmdSectie.classList.contains('sleepklaar'))

  // jsdom levert geen dataTransfer mee, dus die hangen we er zelf aan
  const metDt = (el, type) => {
    const ev = new window.Event(type, { bubbles: true, cancelable: true })
    ev.dataTransfer = { effectAllowed: '', _d: {}, setData(k, v) { this._d[k] = v }, getData(k) { return this._d[k] } }
    el.dispatchEvent(ev)
    return ev
  }
  metDt(cmdSectie, 'dragstart')
  metDt($('.sidebar-sectie[data-zijsectie="projecten"]'), 'drop')
  await tick()
  check('slepen zet cmd onderaan', secties().join(',') === 'dezepc,projecten,cmd')
  check('en dat wordt onthouden',
    settings.zijbalkVolgorde.join(',') === 'dezepc,projecten,cmd')
  check('de sectie is daarna niet meer sleepbaar', cmdSectie.draggable === false)
  check('klikken klapt daarna weer gewoon in en uit', (() => {
    const voor = inhoud('cmd').hidden
    kop('cmd').click()
    const na = inhoud('cmd').hidden
    kop('cmd').click()
    return voor !== na
  })())

  // terugzetten voor de rest van de controles
  metDt($('.sidebar-sectie[data-zijsectie="cmd"]'), 'dragstart')
  metDt($('.sidebar-sectie[data-zijsectie="dezepc"]'), 'drop')
  await tick()
  check('en terugslepen kan ook', secties().join(',') === 'cmd,dezepc,projecten')

  // ── zoeken in submappen ────────────────────────────────────────────────────
  $$('.proj-item')[0].click(); await tick(); await tick()
  $('[data-tab="browser"]').click(); await tick(); await tick()
  const filter = () => $('#br-filter')
  const typInFilter = async (tekst, wachten = 12) => {
    filter().value = tekst
    filter().dispatchEvent(new window.Event('input'))
    for (let i = 0; i < wachten; i++) await tick()
  }
  const namenInLijst2 = () => $$('.br-item').map(el => el.querySelector('.br-naam').textContent)

  check('de zoekknop staat naast het filter', !!$('#br-diep'))
  check('en staat standaard aan, want dat is wat je verwacht',
    $('#br-diep').classList.contains('aan'))
  check('het invoerveld zegt dat ook',
    filter().placeholder.includes('eronder'))

  // uitzetten: dan alleen de map waar je staat
  $('#br-diep').click(); await tick()
  check('uitzetten kan met de knop', !$('#br-diep').classList.contains('aan'))
  zoekOpdrachten = []
  await typInFilter('app')
  check('zonder de knop wordt er niet gezocht', zoekOpdrachten.length === 0)
  check('en filtert hij alleen deze map', namenInLijst2().join(',') === '')

  // weer aan: ook alles eronder
  $('#br-diep').click(); await tick()
  check('de knop laat zien dat hij aanstaat', $('#br-diep').classList.contains('aan'))
  check('en het wordt onthouden', settings.verkenner.diep === true)

  zoekOpdrachten = []
  await typInFilter('app', 3)
  check('er wordt niet meteen gezocht, eerst even wachten', zoekOpdrachten.length === 0)
  check('maar er staat al wel dat hij gaat zoeken',
    $('.br-leeg').textContent.includes('Zoeken in deze map'))
  check('en niet dat er niks gevonden is',
    !$('.br-leeg').textContent.includes('Niks gevonden'))
  await new Promise(r => setTimeout(r, 420))
  for (let i = 0; i < 10; i++) await tick()
  check('daarna gaat de zoekopdracht eruit', zoekOpdrachten.length === 1)
  check('vanaf de map waar je staat',
    zoekOpdrachten[0].root === 'C:\\a' && zoekOpdrachten[0].vraag === 'app')
  check('en app.dart staat in de lijst, al zit het een map dieper',
    namenInLijst2().includes('app.dart'))
  check('met erbij waar het gevonden is',
    $$('.br-item').find(el => el.textContent.includes('app.dart')).textContent.includes('lib'))
  check('de statusregel telt de treffers',
    $('#br-status').textContent.includes('gevonden onder deze map'))
  check('treffers die onderweg binnenkomen worden meteen getoond', (() => {
    // net als de echte zoekopdracht: een tussenstand insturen
    zoekTrefferCb({ token: zoekOpdrachten[0].token, items: [
      { name: 'tussenstand.txt', path: 'C:\\a\\lib\\tussenstand.txt', dir: false, size: 1, mtime: 1, map: 'lib' },
    ] })
    return true
  })())

  // één letter is te weinig om de schijf voor af te lopen
  zoekOpdrachten = []
  await typInFilter('a', 3)
  await new Promise(r => setTimeout(r, 420))
  for (let i = 0; i < 10; i++) await tick()
  check('bij één letter wordt er niet gezocht', zoekOpdrachten.length === 0)
  check('maar deze map wordt nog wel gewoon gefilterd',
    namenInLijst2().includes('main.dart') && !namenInLijst2().includes('app.dart'))
  await typInFilter('q', 3)
  await new Promise(r => setTimeout(r, 420))
  for (let i = 0; i < 10; i++) await tick()
  check('en levert dat niets op, dan staat erbij waarom',
    $('.br-leeg').textContent.includes('twee letters'))

  // pas als het zoeken klaar is mag er "niks gevonden" staan
  zoekAntwoord = { ok: true, root: 'C:\\a', vraag: 'zzz', items: [], deels: false, afgekapt: '' }
  filter().value = 'zzz'
  filter().dispatchEvent(new window.Event('input'))
  filter().dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }))
  for (let i = 0; i < 12; i++) await tick()
  check('als er echt niets is, staat dat er pas na afloop',
    $('.br-leeg').textContent.includes('Niks gevonden met "zzz"'))

  // afgekapt door de tijdslimiet is iets anders dan niets gevonden
  zoekAntwoord = { ok: true, root: 'C:\\a', vraag: 'zzz', items: [
    { name: 'iets.txt', path: 'C:\\a\\lib\\iets.txt', dir: false, size: 1, mtime: 1, map: 'lib' },
  ], deels: true, afgekapt: 'tijd' }
  filter().value = 'zzzz'
  filter().dispatchEvent(new window.Event('input'))
  filter().dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }))
  for (let i = 0; i < 12; i++) await tick()
  check('bij een tijdslimiet zegt hij dat er meer kan zijn',
    $('#br-status').textContent.includes('nog niet alles bekeken'))
  zoekAntwoord = null

  // Enter zoekt meteen
  zoekOpdrachten = []
  filter().value = 'diep'
  filter().dispatchEvent(new window.Event('input'))
  filter().dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }))
  for (let i = 0; i < 10; i++) await tick()
  check('Enter zoekt zonder te wachten', zoekOpdrachten.length === 1)
  check('en vindt de map twee niveaus lager', namenInLijst2().includes('diep'))

  // wegnavigeren stopt het zoeken
  zoekAfgebroken = 0
  $('#br-up').click()
  for (let i = 0; i < 10; i++) await tick()
  check('naar een andere map gaan laat de resultaten los',
    !namenInLijst2().includes('app.dart'))

  // ── betere naamfilter ──────────────────────────────────────────────────────
  $('#br-home').click(); for (let i = 0; i < 8; i++) await tick()   // terug naar C:\a
  $('#br-diep').click(); await tick()          // even alleen deze map
  await typInFilter('DART')
  check('hoofdletters maken niet uit', namenInLijst2().includes('main.dart'))
  await typInFilter('*.yaml')
  check('sterretjes werken: *.yaml',
    namenInLijst2().join(',') === 'pubspec.yaml')
  await typInFilter('main.???t')
  check('vraagtekens ook: main.???t', namenInLijst2().join(',') === 'main.dart')
  await typInFilter('ma dart')
  check('twee woorden moeten allebei voorkomen',
    namenInLijst2().join(',') === 'main.dart')
  await typInFilter('ma zzz')
  check('en als er eentje niet klopt, valt hij af', namenInLijst2().length === 0)
  await typInFilter('')
  $('#br-diep').click(); await tick()

  // terug naar de gewone stand voor de rest van de controles
  $('#br-diep').click(); await tick()
  check('uitzetten geeft het gewone filter terug',
    !$('#br-diep').classList.contains('aan') && settings.verkenner.diep === false)
  await typInFilter('')
  $('#br-home').click(); for (let i = 0; i < 8; i++) await tick()
  $('[data-tab="output"]').click(); await tick()

  // ── de boom onder "deze pc" ────────────────────────────────────────────────
  const boomRijen = () => $$('#boom .boom-rij').map(el => el.querySelector('.boom-naam').textContent)
  const boomRij = (naam) => $$('#boom .boom-rij').find(el => el.querySelector('.boom-naam').textContent === naam)
  const klapUit = async (naam) => {
    boomRij(naam).querySelector('.boom-pijl').click()
    for (let i = 0; i < 6; i++) await tick()
  }

  check('de boom begint bij de schijven', boomRijen()[0] === 'C:')
  check('en toont geen aparte Deze-pc-regel', !boomRijen().includes('Deze pc'))

  // Een project aanklikken stuurt de boom mee naar de map van dat project,
  // ook als je op de output blijft staan. Anders moet je zelf gaan zoeken.
  $$('.proj-item')[0].click()
  for (let i = 0; i < 8; i++) await tick()
  check('een project aanklikken klapt de boom open tot die map',
    boomRijen().join(',') === 'C:,a,leesmij.txt,D:')
  check('en markeert hem', boomRij('a').classList.contains('aan'))
  check('de regel wordt in beeld gehaald',
    inBeeldGehaald.some(el => el.classList && el.classList.contains('aan')))
  check('mappen krijgen een pijltje, want daar kan iets in',
    !!boomRij('C:').querySelector('.boom-pijl i'))
  check('en het pijltje van een open tak wijst omlaag',
    !!boomRij('C:').querySelector('.ti-chevron-down'))
  check('dat wordt onthouden', settings.boomOpen.includes('C:\\'))
  check('mappen staan boven bestanden',
    boomRijen().indexOf('a') < boomRijen().indexOf('leesmij.txt'))

  // takken worden pas ingelezen als je ze openklapt
  const gelezenVoor = gelezenMappen.length
  await klapUit('a')
  check('openklappen leest de map pas dan in', gelezenMappen.length > gelezenVoor)

  const nogeens = gelezenMappen.length
  await klapUit('a')
  check('dichtklappen haalt de inhoud weg',
    boomRijen().join(',') === 'C:,a,leesmij.txt,D:')
  await klapUit('a')
  check('en weer openklappen leest niet opnieuw van schijf',
    gelezenMappen.length === nogeens)

  check('de inhoud staat eronder',
    boomRijen().join(',') === 'C:,a,lib,sub,main.dart,pubspec.yaml,pakket.zip,oud.rar,leesmij.txt,D:')
  await klapUit('lib')
  check('en nog dieper ook',
    boomRijen().join(',').includes('lib,diep,app.dart,sub'))
  check('elk niveau springt verder in', (() => {
    const marge = (naam) => parseInt(boomRij(naam).querySelector('.boom-pijl').style.marginLeft)
    return marge('diep') > marge('lib') && marge('lib') > marge('a')
  })())

  // wat je in de boom aanklikt hoort ook aangewezen te blijven
  boomRij('main.dart').click()
  for (let i = 0; i < 8; i++) await tick()
  check('een bestand in de boom blijft aangewezen',
    boomRij('main.dart').classList.contains('gekozen'))
  check('en niet alleen de map of de schijf',
    !boomRij('C:').classList.contains('gekozen') && !boomRij('a').classList.contains('gekozen'))

  boomRij('lib').click()
  for (let i = 0; i < 8; i++) await tick()
  check('een map aanklikken wijst die map aan',
    boomRij('lib').classList.contains('gekozen'))
  check('en het bestand van hiervoor niet meer',
    !boomRij('main.dart').classList.contains('gekozen'))

  // klikken op een map opent hem in de verkenner
  $('[data-tab="output"]').click(); await tick()
  boomRij('sub').click()
  for (let i = 0; i < 8; i++) await tick()
  check('op een map klikken opent de verkenner', $('#browser').hidden === false)
  check('en gaat naar die map', $('#br-path').value === 'C:\\a\\sub')

  // klikken op een bestand opent de map eromheen en wijst het bestand aan
  boomRij('main.dart').click()
  for (let i = 0; i < 8; i++) await tick()
  check('op een bestand klikken opent de map eromheen', $('#br-path').value === 'C:\\a')
  check('en wijst dat bestand aan',
    $$('.br-item.gekozen').length === 1 &&
    $$('.br-item.gekozen')[0].textContent.includes('main.dart'))

  // de boom loopt mee met waar je in de verkenner staat
  $('#br-path').value = 'C:\\a\\sub'
  $('#br-path').focus()
  $('#br-path').dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }))
  for (let i = 0; i < 10; i++) await tick()
  $('#br-path').blur()
  check('de map waar je staat is gemarkeerd in de boom',
    boomRij('sub').classList.contains('aan'))
  check('en de tak ernaartoe staat open', settings.boomOpen.includes('C:\\a'))

  // opnieuw inlezen met de knop in de kop
  const voorVerversen = gelezenMappen.length
  $('#boom-ververs').click()
  for (let i = 0; i < 10; i++) await tick()
  check('de verversknop leest de open takken opnieuw in',
    gelezenMappen.length > voorVerversen)
  check('en klapt de sectie niet in',
    $('.sidebar-sectie[data-zijsectie="dezepc"] .sectie-inhoud').hidden === false)

  // max. hoogte + volledige hoogte van "deze pc"
  const hoogteKnop = $('#boom-hoogte')
  const volKnop = $('#boom-vol')
  const greep = $('#boom-greep')
  const greepBoven = $('#boom-greep-boven')
  const dezepc = $('.sidebar-sectie[data-zijsectie="dezepc"]')
  const zijbalk = $('.sidebar')
  check('er staat een hoogte-icoon naast ververs', !!hoogteKnop)
  check('en een icoon voor volledige hoogte', !!volKnop)
  check('de grepen zijn standaard verborgen', greep.hidden === true && greepBoven.hidden === true)

  // Max. hoogte: vasthouden + swipen, grepen boven én onder
  hoogteKnop.dispatchEvent(new window.MouseEvent('mousedown', { button: 0, clientY: 200, bubbles: true }))
  document.dispatchEvent(new window.MouseEvent('mousemove', { clientY: 140, bubbles: true }))
  document.dispatchEvent(new window.MouseEvent('mouseup', { bubbles: true }))
  check('swipe vanaf hoogte-knop zet een max. hoogte', Number.isFinite(settings.dezepcMaxHoogte))
  check('hoogte-modus toont greep boven en onder', !greep.hidden && !greepBoven.hidden)
  check('en zet alleen max-height (geen vaste height)', !dezepc.style.height && !!dezepc.style.maxHeight)
  greepBoven.dispatchEvent(new window.MouseEvent('dblclick', { bubbles: true }))
  check('dubbelklik op bovengreep wist de limiet', settings.dezepcMaxHoogte == null)

  // Nogmaals klikken zet hoogte-modus uit (één klik zonder swipe)
  hoogteKnop.dispatchEvent(new window.MouseEvent('mousedown', { button: 0, clientY: 200, bubbles: true }))
  document.dispatchEvent(new window.MouseEvent('mouseup', { bubbles: true }))
  check('nogmaals klikken zet de hoogte-modus uit', !hoogteKnop.classList.contains('aan'))
  check('en verbergt de grepen', greep.hidden === true && greepBoven.hidden === true)

  // Volledige hoogte: cmd + projecten tijdelijk weg
  volKnop.click()
  check('vol-knop zet volledige-hoogte modus aan', volKnop.classList.contains('aan'))
  check('zijbalk krijgt dezepc-vol klasse', zijbalk.classList.contains('dezepc-vol'))
  check('cmd-sectie is dan verborgen', window.getComputedStyle($('.sidebar-sectie[data-zijsectie="cmd"]')).display === 'none'
    || zijbalk.classList.contains('dezepc-vol'))
  volKnop.click()
  check('nogmaals klikken herstelt de normale zijbalk', !volKnop.classList.contains('aan') && !zijbalk.classList.contains('dezepc-vol'))

  // de boom hoort niet achter te lopen op wat je in de verkenner doet
  if (!boomRijen().includes('main.dart')) await klapUit('a')
  check('map "a" staat open in de boom', boomRijen().includes('main.dart'))
  mappen['C:\\a'] = [...mappen['C:\\a'], { name: 'verstopt.txt', path: 'C:\\a\\verstopt.txt', dir: false, size: 1, mtime: 1 }]
  W.vergeetGroottes('C:\\a')
  for (let i = 0; i < 8; i++) await tick()
  check('een nieuw bestand verschijnt vanzelf in de boom',
    boomRijen().includes('verstopt.txt'))
  mappen['C:\\a'] = mappen['C:\\a'].filter(i => i.name !== 'verstopt.txt')
  W.vergeetGroottes('C:\\a')
  for (let i = 0; i < 8; i++) await tick()
  check('en verdwijnt weer als het weg is', !boomRijen().includes('verstopt.txt'))

  // een map met een pijltje die leeg blijkt te zijn, verliest dat pijltje
  check('een map die nog niet gelezen is heeft wel een pijltje',
    !!boomRij('sub').querySelector('.boom-pijl i'))
  await klapUit('sub')                    // C:\a\sub is leeg in de nabootsing
  check('maar een lege map houdt er geen over',
    !boomRij('sub').querySelector('.boom-pijl i'))

  // rechtsklikken in de boom geeft hetzelfde menu als in de verkenner
  boomRij('main.dart').dispatchEvent(new window.MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: 30, clientY: 30 }))
  for (let i = 0; i < 10; i++) await tick()
  const boomMenu = $$('#ctx-menu .ctx-item').map(b => b.textContent.trim())
  check('een bestand in de boom krijgt hetzelfde menu als in de verkenner',
    ['Openen', 'Openen met…', 'Pad kopiëren', 'Naam kopiëren', 'Kopiëren', 'Knippen', 'Hernoemen', 'Verwijderen', 'Inpakken naar zip', 'Eigenschappen']
      .every(t => boomMenu.includes(t)))
  check('en het item is daarvoor echt aangewezen in de verkenner',
    $$('.br-item.gekozen').length === 1 &&
    $$('.br-item.gekozen')[0].textContent.includes('main.dart'))
  check('in de map waar het in zit', $('#br-path').value === 'C:\\a')
  $('#ctx-menu').hidden = true

  boomRij('lib').dispatchEvent(new window.MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: 30, clientY: 30 }))
  for (let i = 0; i < 10; i++) await tick()
  const mapMenu = $$('#ctx-menu .ctx-item').map(b => b.textContent.trim())
  check('een map krijgt hetzelfde menu, met "opnieuw inlezen" erbij',
    mapMenu.includes('Deze tak opnieuw inlezen') && mapMenu.includes('Hernoemen') &&
    mapMenu.some(t => t.startsWith('Grootte')) && mapMenu.includes('Nieuwe map'))
  $('#ctx-menu').hidden = true

  // het rondklikken hierboven liet de verkenner open staan; terug naar output
  // zodat de volgende controles van een schone lei beginnen
  $('[data-tab="output"]').click(); await tick(); await tick()

  // ── verkenner naast de output ──────────────────────────────────────────────
  $$('.proj-item')[0].click(); await tick()
  check('er zijn twee tabs boven het uitvoervenster', $$('.term-tab').length === 2)
  check('het lampje van een draaiende sessie staat uit', $('#pty-punt').hidden === true)
  check('output staat standaard aan', $('[data-tab="output"]').classList.contains('active'))
  check('de verkenner is verborgen', $('#browser').hidden === true)

  $('[data-tab="browser"]').click(); await tick(); await tick()
  check('de verkenner komt in beeld', $('#browser').hidden === false)
  check('en de uitvoer gaat weg', $('#terminal').hidden === true)

  $('[data-split="right"]').click(); await tick(); await tick()
  check('rechts splitsen toont output en verkenner tegelijk',
    $('#browser').hidden === false && $('#terminal').hidden === false)
  check('het werkvlak staat naast elkaar',
    $('.terminal-wrap').classList.contains('gesplitst') && $('.terminal-wrap').classList.contains('naast'))
  check('de verkenner blijft links, output komt rechts',
    $('[data-pane="browser"]').style.order === '1' && $('[data-pane="output"]').style.order === '2')
  check('de sluitknop is een min op dezelfde rand',
    $('[data-split="right"] i').classList.contains('ti-minus') && $('[data-split="right"]').hidden === false)
  check('de verkenner houdt de focus',
    $('[data-pane="browser"]').classList.contains('actief') && $('[data-tab="browser"]').classList.contains('active'))
  check('de splitsing wordt per project bewaard',
    settings.termSplits['p1'] && settings.termSplits['p1'].dir === 'right' && settings.termSplits['p1'].first === 'browser')

  $('[data-pane="output"]').dispatchEvent(new window.MouseEvent('mousedown', { bubbles: true }))
  await tick()
  check('klik op output verplaatst de focus, zonder de verkenner weg te halen',
    $('[data-pane="output"]').classList.contains('actief') && $('#browser').hidden === false)

  $('[data-split="right"]').click(); await tick()
  check('min rechts sluit het rechter vlak, de linker blijft',
    !$('.terminal-wrap').classList.contains('gesplitst') && $('#browser').hidden === false)

  const origRect = window.HTMLElement.prototype.getBoundingClientRect
  window.HTMLElement.prototype.getBoundingClientRect = function () {
    if (this.classList.contains('term-stage') || this.id === 'werk') {
      return { x: 0, y: 0, top: 0, left: 0, bottom: 300, right: 400, width: 400, height: 300, toJSON() {} }
    }
    return origRect.call(this)
  }
  const plusKlik = el => el.dispatchEvent(new window.MouseEvent('click', {
    bubbles: true, cancelable: true, clientX: 380, clientY: 150,
  }))
  const wachtFrames = () => new Promise(r => window.requestAnimationFrame(() => window.requestAnimationFrame(r)))
  document.dispatchEvent(new window.MouseEvent('pointermove', { bubbles: true, clientX: 380, clientY: 150 }))
  plusKlik($('[data-split="right"]'))
  await wachtFrames(); await tick()
  check('+ of − is meteen zichtbaar na openen, zonder extra muisbeweging',
    $('[data-split="right"]').classList.contains('zichtbaar') &&
    $('[data-split="right"] i').classList.contains('ti-minus'))
  plusKlik($('[data-split="right"]'))
  await wachtFrames(); await tick()
  check('+ of − is meteen zichtbaar na sluiten, zonder extra muisbeweging',
    $('[data-split="right"]').classList.contains('zichtbaar') &&
    !$('[data-split="right"] i').classList.contains('ti-minus'))
  window.HTMLElement.prototype.getBoundingClientRect = origRect

  $('[data-tab="output"]').click(); await tick()
  $('[data-split="right"]').click(); await tick(); await tick()
  check('vanuit output komt de verkenner rechts',
    $('[data-pane="output"]').style.order === '1' && $('[data-pane="browser"]').style.order === '2')
  $('[data-pane="browser"]').dispatchEvent(new window.MouseEvent('mousedown', { bubbles: true }))
  await tick()
  $('[data-split="right"]').click(); await tick()
  check('min rechts sluit rechts, ook als de verkenner geselecteerd is',
    !$('.terminal-wrap').classList.contains('gesplitst') &&
    $('#browser').hidden === true && $('#terminal').hidden === false)

  $('[data-split="right"]').click(); await tick(); await tick()
  $('[data-pane="output"]').dispatchEvent(new window.MouseEvent('mousedown', { bubbles: true }))
  await tick()
  $('[data-split="left"]').click(); await tick()
  check('min links sluit links, ook als output geselecteerd is',
    !$('.terminal-wrap').classList.contains('gesplitst') &&
    $('#browser').hidden === false && $('#terminal').hidden === true)

  $('[data-tab="output"]').click(); await tick()
  $('[data-split="bottom"]').click(); await tick(); await tick()
  check('onder splitsen zet output boven en verkenner onder',
    $('.terminal-wrap').classList.contains('gesplitst') &&
    $('.terminal-wrap').classList.contains('onder') &&
    $('[data-pane="output"]').style.order === '1' &&
    $('[data-pane="browser"]').style.order === '2')
  $('[data-pane="browser"]').dispatchEvent(new window.MouseEvent('mousedown', { bubbles: true }))
  await tick()
  $('[data-split="bottom"]').click(); await tick()
  check('min onder sluit onder, ook als de verkenner geselecteerd is',
    !$('.terminal-wrap').classList.contains('gesplitst') &&
    $('#browser').hidden === true && $('#terminal').hidden === false)

  $('[data-split="bottom"]').click(); await tick(); await tick()
  $('[data-pane="output"]').dispatchEvent(new window.MouseEvent('mousedown', { bubbles: true }))
  await tick()
  $('[data-split="top"]').click(); await tick()
  check('min boven sluit boven, ook als output geselecteerd is',
    !$('.terminal-wrap').classList.contains('gesplitst') &&
    $('#browser').hidden === false && $('#terminal').hidden === true)

  $('[data-tab="output"]').click(); await tick()
  $('[data-split="right"]').click(); await tick(); await tick()
  $('#btn-nav-cmd').click(); await tick(); await tick()
  check('opdrachten openen als tweede scherm, niet als hele pagina',
    $('#werk').classList.contains('gesplitst') &&
    $('#cmd-panel').style.display === 'flex' &&
    $('#main').innerHTML.trim() !== '')
  check('het project blijft naast de opdrachten staan',
    !!$('#main .terminal-wrap') && !!$('#cmd-panel .terminal-wrap'))
  $('#btn-nav-dict').click(); await tick(); await tick()
  check('woordenboek opent ook als tweede scherm',
    $('#werk').classList.contains('gesplitst') &&
    $('#dict-panel').style.display === 'flex' &&
    $('#main').innerHTML.trim() !== '')
  $('[data-split="right"]').click(); await tick()

  // ── tweede project in het andere vlak ──────────────────────────────────────
  $('#btn-add-proj').click(); await tick()
  const vulNieuw = (el, v) => { el.value = v; el.dispatchEvent(new window.Event('input')) }
  vulNieuw($('#f-name'), 'tweede app')
  vulNieuw($$('#loc-list .field')[0], 'main')
  vulNieuw($$('#loc-list .field')[1], 'C:\\gekozen')
  $('#modal-proj-save').click(); await tick(); await tick()

  $$('.proj-item')[0].click(); await tick()
  $('[data-tab="output"]').click(); await tick()
  $('[data-split="right"]').click(); await tick(); await tick()
  $$('.proj-item')[1].click(); await tick(); await tick()
  check('een tweede project komt in het andere vlak',
    $('.terminal-wrap').classList.contains('twee-projecten'))
  check('het oorspronkelijke project houdt zijn verkenner',
    $('#browser') && $('#browser').hidden === false)
  $('[data-tab="browser"]').click(); await tick(); await tick()
  check('het actieve project kan ook een verkenner openen',
    $('#browser-andere') && $('#browser-andere').hidden === false)
  check('twee verkenners kunnen naast elkaar staan',
    $('#browser').hidden === false && $('#browser-andere').hidden === false)
  $('[data-tab="output"]').click(); await tick()
  check('de kop volgt het gekozen project',
    ($('.proj-header-name')?.textContent || '').includes('tweede'))
  check('het andere project blijft in de zijbalk gemarkeerd',
    $$('.proj-item.in-split').length === 1)

  $$('.proj-item')[0].click(); await tick(); await tick()
  check('klik op het andere project focust dat vlak',
    ($('.proj-header-name')?.textContent || '').includes('dd_crypto') &&
    $('.terminal-wrap').classList.contains('twee-projecten'))

  $('[data-split="right"]').click(); await tick()
  const tweedeIdx = [...$$('.proj-label')].findIndex(e => e.textContent === 'tweede app')
  $$('.proj-edit')[tweedeIdx].click(); await tick()
  $('#modal-proj .btn-delete').click(); await tick()
  $('#del-confirm').click(); await tick(); await tick()
  $$('.proj-item')[0].click(); await tick()

  $('[data-tab="browser"]').click(); await tick(); await tick()
  check('de verkenner komt weer alleen in beeld', $('#browser').hidden === false && $('#terminal').hidden === true)

  check('hij begint in de projectmap', $('#br-path').value === 'C:\\a')
  check('met de inhoud van die map', $$('.br-item').length === 6)
  check('mappen staan bovenaan', $$('.br-item')[0].classList.contains('map'))
  check('bestandsgrootte wordt getoond',
    $$('.br-item').some(el => el.textContent.includes('KB')))

  // door een map heen lopen
  const libRij = $$('.br-item').find(el => el.textContent.includes('lib'))
  libRij.click(); await tick()
  check('één klik selecteert alleen', libRij.classList.contains('gekozen') && $('#br-path').value === 'C:\\a')
  check('en niets anders', $$('.br-item.gekozen').length === 1)
  libRij.dispatchEvent(new window.MouseEvent('dblclick', { bubbles: true })); await tick(); await tick()
  check('dubbelklikken opent de map', $('#br-path').value === 'C:\\a\\lib')
  check('en toont de inhoud', $$('.br-item').length === 2)

  $('#btn-add-proj').click(); await tick()
  const vulPad = (el, v) => { el.value = v; el.dispatchEvent(new window.Event('input')) }
  vulPad($('#f-name'), 'andere app')
  vulPad($$('#loc-list .field')[0], 'main')
  vulPad($$('#loc-list .field')[1], 'C:\\gekozen')
  $('#modal-proj-save').click(); await tick(); await tick()
  $$('.proj-item')[1].click(); await tick(); await tick()
  $('[data-tab="browser"]').click(); await tick(); await tick()
  check('het andere project opent in zijn eigen map', $('#br-path').value === 'C:\\gekozen')
  $$('.proj-item')[0].click(); await tick(); await tick()
  $('[data-tab="browser"]').click(); await tick(); await tick()
  check('terug in het eerste project blijft de verkenner in de submap', $('#br-path').value === 'C:\\a\\lib')
  const andereIdx = [...$$('.proj-label')].findIndex(e => e.textContent === 'andere app')
  $$('.proj-edit')[andereIdx].click(); await tick()
  $('#modal-proj .btn-delete').click(); await tick()
  $('#del-confirm').click(); await tick(); await tick()
  $$('.proj-item')[0].click(); await tick()
  $('[data-tab="browser"]').click(); await tick(); await tick()
  check('na het weghalen van het andere project blijft de map', $('#br-path').value === 'C:\\a\\lib')
  $('#br-up').click(); await tick(); await tick()
  check('omhoog gaat terug', $('#br-path').value === 'C:\\a')

  // filteren
  $('#br-filter').value = 'dart'
  $('#br-filter').dispatchEvent(new window.Event('input')); await tick()
  check('filteren werkt', $$('.br-item').length === 1 && $$('.br-item')[0].textContent.includes('main.dart'))
  $('#br-filter').value = ''
  $('#br-filter').dispatchEvent(new window.Event('input')); await tick()

  // een pad intypen
  $('#br-path').value = 'C:\\a\\sub'
  $('#br-path').focus()
  $('#br-path').dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }))
  await tick(); await tick()
  check('een pad intypen werkt', $('#br-path').value === 'C:\\a\\sub')
  check('een lege map meldt dat netjes', $('#br-list').textContent.includes('leeg'))

  $('#br-path').value = 'C:\\bestaat-niet'
  $('#br-path').focus()
  $('#br-path').dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }))
  await tick(); await tick()
  check('een onbestaande map geeft een melding', $('#br-list').textContent.includes('niet openen'))

  // bestand openen
  $('#br-home').click(); await tick(); await tick()
  check('home gaat terug naar de werkmap', $('#br-path').value === 'C:\\a')

  // ── weergaven: lijstmaten en tegels ────────────────────────────────────────
  const gaNaar = async (pad) => {
    $('#br-path').value = pad
    $('#br-path').focus()
    $('#br-path').dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }))
    for (let i = 0; i < 6; i++) await tick()
    $('#br-path').blur()
  }
  const namenInLijst = () => $$('.br-item').map(el => el.querySelector('.br-naam').textContent)
  const lijstKlasse  = () => $('#br-list').className
  const scrolMet = (omhoog, doel = '#br-list') => {
    $(doel).dispatchEvent(new window.WheelEvent('wheel', {
      deltaY: omhoog ? -120 : 120, ctrlKey: true, bubbles: true, cancelable: true,
    }))
  }

  check('weergave en sorteren staan bovenin, in de balk met de tabs',
    $('#br-weergave').closest('.terminal-bar-btns') !== null &&
    $('#br-sorteer').closest('.terminal-bar-btns') !== null)
  check('en zijn zichtbaar zodra je in de verkenner staat',
    $('#br-weergave').hidden === false && $('#br-sorteer').hidden === false)

  check('standaard staat de verkenner op de kleine lijst',
    lijstKlasse().includes('weergave-lijst-s'))
  check('en toont dan grootte en datum', !!$('.br-item .br-meta'))

  $('#br-weergave').click(); await tick()
  const weergaveKnoppen = $$('#ctx-menu .ctx-item').map(b => b.textContent.trim())
  check('het weergavemenu heeft vier lijstmaten',
    weergaveKnoppen.filter(t => t.startsWith('Lijst')).length === 4)
  check('en drie tegelmaten',
    weergaveKnoppen.filter(t => t.startsWith('Tegels')).length === 3)
  check('de huidige maat staat aangevinkt',
    $$('#ctx-menu .ctx-item').find(b => b.textContent.includes('Lijst · klein')).querySelector('.ti-check') !== null)

  $$('#ctx-menu .ctx-item').find(b => b.textContent.includes('Tegels · middel')).click()
  await tick(); await tick()
  check('tegels aanzetten werkt', lijstKlasse().includes('weergave-tegel-m'))
  check('in tegels vervalt de extra informatie', $('.br-item .br-meta') === null)
  check('maar de namen staan er nog', namenInLijst().length > 0)
  check('en het wordt onthouden', settings.verkenner.weergave === 'tegel-m')

  // ctrl+scroll loopt door dezelfde volgorde
  scrolMet(true); await tick(); await tick()
  check('ctrl+scroll omhoog maakt groter', lijstKlasse().includes('weergave-tegel-l'))
  scrolMet(true); await tick(); await tick()
  check('en stopt bij de grootste', lijstKlasse().includes('weergave-tegel-l'))
  for (let i = 0; i < 6; i++) { scrolMet(false); await tick(); await tick() }
  check('naar beneden kom je terug bij de kleine lijst',
    lijstKlasse().includes('weergave-lijst-s'))
  scrolMet(false); await tick(); await tick()
  check('en verder omlaag kan niet', lijstKlasse().includes('weergave-lijst-s'))
  check('zonder ctrl gebeurt er niets', (() => {
    $('#br-list').dispatchEvent(new window.WheelEvent('wheel', { deltaY: -120, bubbles: true, cancelable: true }))
    return lijstKlasse().includes('weergave-lijst-s')
  })())

  // ── sorteren ───────────────────────────────────────────────────────────────
  await gaNaar('C:\\sorteer')
  check('de sorteermap staat open', $('#br-path').value === 'C:\\sorteer')

  const sorteerOp = async (wat, richting) => {
    $('#br-sorteer').click(); await tick()
    $$('#ctx-menu .ctx-item').find(b => b.textContent.trim() === wat).click()
    await tick(); await tick()
    if (richting) {
      $('#br-sorteer').click(); await tick()
      $$('#ctx-menu .ctx-item').find(b => b.textContent.trim() === richting).click()
      await tick(); await tick()
    }
  }

  await sorteerOp('Naam', 'Oplopend')
  check('op naam oplopend: mappen eerst, dan bestanden op naam',
    namenInLijst().join(',') === 'amap,zmap,appel.zip,midden.dat,zebra.txt')
  await sorteerOp('Naam', 'Aflopend')
  check('aflopend draait het om, maar mappen blijven bovenaan',
    namenInLijst().join(',') === 'zmap,amap,zebra.txt,midden.dat,appel.zip')

  await sorteerOp('Grootte', 'Oplopend')
  check('op grootte oplopend',
    namenInLijst().slice(2).join(',') === 'zebra.txt,midden.dat,appel.zip')
  await sorteerOp('Grootte', 'Aflopend')
  check('op grootte aflopend',
    namenInLijst().slice(2).join(',') === 'appel.zip,midden.dat,zebra.txt')

  await sorteerOp('Type', 'Oplopend')
  check('op type oplopend (dat, txt, zip)',
    namenInLijst().slice(2).join(',') === 'midden.dat,zebra.txt,appel.zip')
  await sorteerOp('Type', 'Aflopend')
  check('op type aflopend',
    namenInLijst().slice(2).join(',') === 'appel.zip,zebra.txt,midden.dat')

  await sorteerOp('Datum', 'Oplopend')
  check('op datum oplopend',
    namenInLijst().join(',') === 'zmap,amap,appel.zip,midden.dat,zebra.txt')
  await sorteerOp('Datum', 'Aflopend')
  check('op datum aflopend',
    namenInLijst().join(',') === 'amap,zmap,zebra.txt,midden.dat,appel.zip')
  check('de sorteerkeuze wordt onthouden',
    settings.verkenner.sorteer === 'datum' && settings.verkenner.richting === 'af')

  check('het vinkje staat bij de gekozen sortering', (() => {
    $('#br-sorteer').click()
    const knop = $$('#ctx-menu .ctx-item').find(b => b.textContent.trim() === 'Datum')
    const pijl = $$('#ctx-menu .ctx-item').find(b => b.textContent.trim() === 'Aflopend')
    const goed = !!knop.querySelector('.ti-check') && !!pijl.querySelector('.ti-check')
    $('#ctx-menu').hidden = true
    return goed
  })())

  // sorteren via het rechtsklikmenu op een lege plek
  $('#br-list').dispatchEvent(new window.MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: 40, clientY: 40 }))
  await tick()
  const legeMenuTeksten = $$('#ctx-menu .ctx-item').map(b => b.textContent.trim())
  check('het rechtsklikmenu heeft een ingang voor weergave en sorteren',
    legeMenuTeksten.includes('Weergave…') && legeMenuTeksten.includes('Sorteren…'))
  $$('#ctx-menu .ctx-item').find(b => b.textContent.trim() === 'Sorteren…').click(); await tick()
  check('en die opent het sorteermenu',
    $$('#ctx-menu .ctx-item').some(b => b.textContent.trim() === 'Naam'))
  $$('#ctx-menu .ctx-item').find(b => b.textContent.trim() === 'Naam').click(); await tick(); await tick()

  await sorteerOp('Naam', 'Oplopend')
  await gaNaar('C:\\a')

  let geopendPad = null
  const echteOpenFolder = api.openFolder
  api.openFolder = (p) => { geopendPad = p }
  const pubRij = $$('.br-item').find(el => el.textContent.includes('pubspec'))
  pubRij.click(); await tick()
  check('één klik op een bestand opent het niet', geopendPad === null)
  pubRij.dispatchEvent(new window.MouseEvent('dblclick', { bubbles: true })); await tick()
  check('dubbelklikken opent het bestand', geopendPad === 'C:\\a\\pubspec.yaml')
  api.openFolder = echteOpenFolder

  // schijvenoverzicht boven de schijfwortel
  mappen['C:\\'] = [{ name: 'a', path: 'C:\\a', dir: true, size: 0, mtime: 1 }]
  $('#br-path').value = 'C:\\'
  $('#br-path').focus()
  $('#br-path').dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }))
  await tick(); await tick()
  check('op een schijfwortel is omhoog nog mogelijk', $('#br-up').disabled === false)
  $('#br-up').click(); await tick(); await tick()
  check('omhoog vanaf de schijfwortel geeft het schijvenoverzicht', $('#br-path').value === 'Deze pc')
  check('met alle schijven erin', $$('.br-item').length === 2)
  check('en de vrije ruimte erbij', $('#br-list').textContent.includes('vrij van'))
  check('daarboven kan niet verder', $('#br-up').disabled === true)
  $$('.br-item')[0].dispatchEvent(new window.MouseEvent('dblclick', { bubbles: true })); await tick(); await tick()
  check('een schijf openen werkt met dubbelklik', $('#br-path').value === 'C:\\')

  $('#br-home').click(); await tick(); await tick()

  check('werk hier is ook in een project beschikbaar', $('#br-usehere').disabled === false)

  // uitvoer haalt je terug naar het output-tabblad
  $('[data-tab="browser"]').click(); await tick()
  $('#term-input').value = 'echo terug naar output'
  $('#term-run-btn').click(); await tick(); await tick()
  check('nieuwe uitvoer schakelt terug naar output',
    $('#terminal').hidden === false && $('[data-tab="output"]').classList.contains('active'))

  // in de cmd-sectie kun je de werkmap wél verzetten
  $('#btn-nav-cmd').click(); await tick()
  $('[data-tab="browser"]').click(); await tick(); await tick()
  check('werk hier kan wel in de cmd-sectie', $('#br-usehere').disabled === false)
  $('#br-path').value = 'C:\\a'
  $('#br-path').focus()
  $('#br-path').dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }))
  await tick(); await tick()
  $('#br-usehere').click(); await tick(); await tick(); await tick()
  check('werk hier verzet de werkmap', settings.cmd.cwd === 'C:\\a')

  // ── Enter opent de selectie ────────────────────────────────────────────────
  $$('.proj-item')[0].click(); await tick()
  $('[data-tab="browser"]').click(); await tick(); await tick()
  $('#br-home').click(); await tick(); await tick()

  console.log('    [debug] tab:', $('#browser').hidden ? 'output' : 'browser',
              '| pad:', $('#br-path').value, '| regels:', $$('.br-item').map(e => e.textContent.trim().split('\n')[0]).join(' / '))
  const libEl = $$('.br-item').find(el => el.textContent.includes('lib'))
  libEl.click(); await tick()
  window.document.body.focus()
  window.document.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }))
  await tick(); await tick()
  check('Enter opent de geselecteerde map', $('#br-path').value === 'C:\\a\\lib')

  let viaEnter = null
  const openFolderOrig = api.openFolder
  api.openFolder = (p) => { viaEnter = p }
  $$('.br-item').find(el => el.textContent.includes('app.dart')).click(); await tick()
  window.document.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }))
  await tick()
  check('Enter opent ook een bestand', viaEnter === 'C:\\a\\lib\\app.dart')
  api.openFolder = openFolderOrig

  // ── meerdere bestanden selecteren ──────────────────────────────────────────
  $('#br-path').value = 'C:\\a'
  $('#br-path').focus()
  $('#br-path').dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }))
  await tick(); await tick()

  const rij = (n) => $$('.br-item')[n]
  const klik = (n, opties = {}) => rij(n).dispatchEvent(new window.MouseEvent('click', { bubbles: true, ...opties }))

  check('er is een statusregel onder de lijst', !!$('#br-status'))
  check('die vertelt wat er in de map staat', $('#br-status').textContent.includes('mappen'))

  klik(0)
  check('gewoon klikken selecteert er één', $$('.br-item.gekozen').length === 1)
  check('de statusregel telt mee', $('#br-status').textContent.includes('gekozen'))

  klik(2, { ctrlKey: true })
  check('Ctrl+klik voegt toe', $$('.br-item.gekozen').length === 2)
  check('en het zijn de juiste twee',
    rij(0).classList.contains('gekozen') && rij(2).classList.contains('gekozen'))
  klik(2, { ctrlKey: true })
  check('nog een Ctrl+klik haalt hem er weer af', $$('.br-item.gekozen').length === 1)

  klik(1)
  klik(4, { shiftKey: true })
  check('Shift+klik selecteert de hele reeks', $$('.br-item.gekozen').length === 4)
  check('van de eerste tot en met de laatste',
    [1, 2, 3, 4].every(n => rij(n).classList.contains('gekozen')) && !rij(0).classList.contains('gekozen'))

  klik(0, { shiftKey: true })
  check('Shift werkt ook de andere kant op', $$('.br-item.gekozen').length === 2)

  klik(0)
  check('een gewone klik begint weer opnieuw', $$('.br-item.gekozen').length === 1)

  // toetsenbord
  const toets = (k, o = {}) => window.document.dispatchEvent(new window.KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true, ...o }))
  toets('ArrowDown'); toets('ArrowDown')
  check('pijltjes verplaatsen de selectie', $$('.br-item.gekozen').length === 1 && rij(2).classList.contains('gekozen'))
  toets('ArrowDown', { shiftKey: true })
  check('Shift+pijl breidt de reeks uit', $$('.br-item.gekozen').length === 2)
  toets('a', { ctrlKey: true })
  check('Ctrl+A selecteert alles', $$('.br-item.gekozen').length === $$('.br-item').length)
  check('de statusregel toont de totale grootte', /·/.test($('#br-status').textContent))
  toets('Escape')
  check('Escape heft de selectie op', $$('.br-item.gekozen').length === 0)
  check('en de statusregel gaat terug naar het overzicht',
    !$('#br-status').textContent.includes('gekozen'))

  // selectiekader
  const lijst = $('#br-list')
  lijst.getBoundingClientRect = () => ({ left: 0, top: 0, right: 400, bottom: 300, width: 400, height: 300 })
  $$('.br-item').forEach((el, i) => {
    el.getBoundingClientRect = () => ({ left: 0, top: i * 30, right: 400, bottom: i * 30 + 28, width: 400, height: 28 })
  })
  check('het kader is standaard verborgen', $('#br-kader').hidden === true)
  lijst.dispatchEvent(new window.MouseEvent('mousedown', { bubbles: true, button: 0, clientX: 5, clientY: 5 }))
  check('slepen vanaf een lege plek toont het kader', $('#br-kader').hidden === false)
  window.document.dispatchEvent(new window.MouseEvent('mousemove', { bubbles: true, clientX: 300, clientY: 95 }))
  check('de regels onder het kader worden geselecteerd', $$('.br-item.gekozen').length === 4)
  window.document.dispatchEvent(new window.MouseEvent('mouseup', { bubbles: true }))
  check('loslaten verbergt het kader', $('#br-kader').hidden === true)
  check('en de selectie blijft staan', $$('.br-item.gekozen').length === 4)

  // met Ctrl erbij blijft de vorige selectie staan
  lijst.dispatchEvent(new window.MouseEvent('mousedown', { bubbles: true, button: 0, clientX: 5, clientY: 160, ctrlKey: true }))
  window.document.dispatchEvent(new window.MouseEvent('mousemove', { bubbles: true, clientX: 300, clientY: 185 }))
  window.document.dispatchEvent(new window.MouseEvent('mouseup', { bubbles: true }))
  check('Ctrl bij het kader voegt toe aan de selectie', $$('.br-item.gekozen').length === 5)

  // klikken op een regel start geen kader
  klik(0)
  check('klikken op een regel trekt geen kader', $('#br-kader').hidden === true)

  // ── rechtsklikmenu ─────────────────────────────────────────────────────────
  const rechtsklik = (el) => {
    const ev = new window.MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: 100, clientY: 100 })
    ;(el || $('#br-list')).dispatchEvent(ev)
  }
  const menuItems = () => $$('#ctx-menu .ctx-item').map(b => b.textContent.trim())
  const menuKlik = (tekst) => $$('#ctx-menu .ctx-item').find(b => b.textContent.includes(tekst))?.click()

  check('het menu is standaard verborgen', $('#ctx-menu').hidden === true)

  klik(0)
  rechtsklik(rij(0)); await tick()
  check('rechtsklikken op een regel opent het menu', $('#ctx-menu').hidden === false)
  check('met openen erin', menuItems().some(t => t === 'Openen'))
  check('en pad kopiëren', menuItems().some(t => t.includes('Pad kopiëren')))
  check('en tonen in de verkenner', menuItems().some(t => t.includes('Tonen in de verkenner')))
  check('en nieuw bestand en map', menuItems().some(t => t === 'Nieuw bestand') && menuItems().some(t => t === 'Nieuwe map'))
  check('en inpakken naar zip', menuItems().some(t => t.includes('Inpakken naar zip')))
  check('en eigenschappen', menuItems().some(t => t === 'Eigenschappen'))

  // een map heeft geen 'openen met'
  check('een map krijgt geen openen-met', !menuItems().some(t => t.includes('Openen met')))
  sluitContextMenuViaKlik()
  function sluitContextMenuViaKlik() {
    window.document.dispatchEvent(new window.MouseEvent('mousedown', { bubbles: true }))
  }

  const bestandRij = $$('.br-item').find(el => el.textContent.includes('main.dart'))
  bestandRij.click(); await tick()
  rechtsklik(bestandRij); await tick()
  check('een bestand krijgt wel openen-met', menuItems().some(t => t.includes('Openen met')))
  metGeopend = []
  menuKlik('Openen met'); await tick()
  check('openen met roept Windows aan', metGeopend.length === 1 && metGeopend[0].includes('main.dart'))
  check('en het menu sluit erna', $('#ctx-menu').hidden === true)

  // tonen in de verkenner
  getoond = []
  rechtsklik(bestandRij); await tick()
  menuKlik('Tonen in de verkenner'); await tick()
  check('tonen in de verkenner werkt', getoond.length === 1)

  // rechtsklikken buiten de selectie wijst dat ene aan
  klik(0)
  rechtsklik($$('.br-item')[3]); await tick()
  check('rechtsklikken buiten de selectie kiest die regel',
    $$('.br-item')[3].classList.contains('gekozen') && $$('.br-item.gekozen').length === 1)
  sluitContextMenuViaKlik()

  // meerdere tegelijk
  klik(0); klik(2, { ctrlKey: true })
  rechtsklik(rij(0)); await tick()
  check('bij meerdere toont het menu het aantal', menuItems().some(t => t.includes('(2)')))
  gezipt = []
  menuKlik('Inpakken naar zip'); await tick(); await tick()
  check('inpakken vraagt om een bestandsnaam', $('#modal-naam').hidden === false)
  check('met een voorstel', $('#naam-invoer').value.endsWith('.zip'))
  $('#naam-invoer').value = 'mijn-pakket'
  $('#modal-naam-ok').click(); await tick(); await tick(); await tick()
  check('er wordt een zip gemaakt', gezipt.length === 1)
  check('met beide gekozen bestanden', gezipt[0].paden.length === 2)
  check('en .zip achter de naam', gezipt[0].doel.endsWith('mijn-pakket.zip'))

  // nieuwe map
  rechtsklik(); await tick()
  check('op een lege plek is er ook een menu', $('#ctx-menu').hidden === false)
  check('zonder openen', !menuItems().some(t => t === 'Openen'))
  menuKlik('Nieuwe map'); await tick(); await tick()
  check('er wordt om een naam gevraagd', $('#modal-naam').hidden === false)
  $('#naam-invoer').value = 'verse map'
  $('#modal-naam-ok').click(); await tick(); await tick(); await tick()
  check('de map is aangemaakt', $$('.br-item').some(el => el.textContent.includes('verse map')))
  check('en meteen aangewezen',
    $$('.br-item.gekozen').length === 1 && $('.br-item.gekozen').textContent.includes('verse map'))

  // een ongeldige naam wordt geweigerd
  rechtsklik(); await tick()
  menuKlik('Nieuw bestand'); await tick(); await tick()
  $('#naam-invoer').value = 'fout:naam?'
  $('#modal-naam-ok').click(); await tick()
  check('rare tekens in een naam worden geweigerd',
    $('#modal-naam').hidden === false && $('#naam-fout').hidden === false)
  $('#modal-naam-cancel').click(); await tick()

  // eigenschappen
  bestandRij.click(); await tick()
  rechtsklik($$('.br-item').find(el => el.textContent.includes('main.dart'))); await tick()
  menuKlik('Eigenschappen'); await tick(); await tick()
  check('eigenschappen opent een venster', $('#modal-info').hidden === false)
  check('met de grootte erin', $('#info-lijst').textContent.includes('KB'))
  check('en het volledige pad', $('#info-lijst').textContent.includes('C:\\a'))
  $('#modal-info-ok').click(); await tick()

  // in een archief valt het meeste af
  $('#br-path').value = 'C:\\a\\pakket.zip'
  $('#br-path').focus()
  $('#br-path').dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }))
  await tick(); await tick()
  $$('.br-item')[1].click(); await tick()
  rechtsklik($$('.br-item')[1]); await tick()
  check('in een archief kun je wel openen', menuItems().some(t => t === 'Openen'))
  check('maar niets aanmaken', !menuItems().some(t => t === 'Nieuw bestand'))
  check('en niets inpakken', !menuItems().some(t => t.includes('Inpakken')))
  sluitContextMenuViaKlik()

  $('#br-path').value = 'C:\\a'
  $('#br-path').focus()
  $('#br-path').dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }))
  await tick(); await tick()

  // ── kopiëren, knippen, plakken ─────────────────────────────────────────────
  bewerkingen = []
  klik(0); klik(2, { ctrlKey: true })
  rechtsklik(rij(0)); await tick()
  check('kopiëren staat in het menu', menuItems().some(t => t === 'Kopiëren'))
  check('knippen ook', menuItems().some(t => t === 'Knippen'))
  check('plakken staat uit zolang het klembord leeg is',
    $$('#ctx-menu .ctx-item').find(b => b.textContent.includes('Plakken'))?.disabled === true)

  menuKlik('Kopiëren'); await tick()
  rechtsklik(); await tick()
  check('na kopiëren kan er geplakt worden',
    $$('#ctx-menu .ctx-item').find(b => b.textContent.includes('Plakken'))?.disabled === false)
  check('met het aantal erbij', menuItems().some(t => t.includes('Plakken (2)')))

  menuKlik('Plakken'); await tick(); await tick(); await tick()
  check('plakken kopieert naar de huidige map',
    bewerkingen.some(b => b.soort === 'kopieer' && b.bronnen.length === 2 && b.doelMap === 'C:\\a'))

  // knippen toont de items lichter en verplaatst bij het plakken
  bewerkingen = []
  klik(0)
  rechtsklik(rij(0)); await tick()
  menuKlik('Knippen'); await tick()
  check('geknipte items worden lichter getoond', $$('.br-item.geknipt').length === 1)
  rechtsklik(); await tick()
  menuKlik('Plakken'); await tick(); await tick(); await tick()
  check('plakken na knippen verplaatst', bewerkingen.some(b => b.soort === 'verplaats'))
  check('en het klembord is daarna leeg', $$('.br-item.geknipt').length === 0)

  // sneltoetsen
  bewerkingen = []
  klik(0)
  toets('c', { ctrlKey: true }); await tick()
  toets('v', { ctrlKey: true }); await tick(); await tick(); await tick()
  check('Ctrl+C en Ctrl+V werken', bewerkingen.some(b => b.soort === 'kopieer'))
  bewerkingen = []
  klik(0)
  toets('x', { ctrlKey: true }); await tick()
  check('Ctrl+X knipt', $$('.br-item.geknipt').length === 1)
  toets('Escape')

  // bestaande namen: eerst vragen
  bewerkingen = []
  klik(0)
  toets('c', { ctrlKey: true }); await tick()
  laatsteVraag = null
  kiesKnop('vervangen')
  toets('v', { ctrlKey: true }); await tick(); await tick(); await tick()
  check('bij een bestaande naam wordt eerst gevraagd',
    !!laatsteVraag && laatsteVraag.alles.includes('bestaat hier al'))
  check('en de keuze gaat mee', bewerkingen.some(b => b.bijConflict === 'vervangen'))

  // beide houden
  bewerkingen = []
  klik(0)
  toets('c', { ctrlKey: true }); await tick()
  kiesKnop('beide houden')
  toets('v', { ctrlKey: true }); await tick(); await tick(); await tick()
  check('beide houden zet het ernaast', bewerkingen.some(b => b.bijConflict === 'hernoemen'))

  // annuleren doet niets
  bewerkingen = []
  klik(0)
  toets('c', { ctrlKey: true }); await tick()
  kiesKnop('annuleren')
  toets('v', { ctrlKey: true }); await tick(); await tick(); await tick()
  check('annuleren doet niets', bewerkingen.length === 0)
  kiesKnop('')

  // ── klembord van Windows ───────────────────────────────────────────────────
  winKlembord = { paden: [], knippen: false }
  klik(0)
  toets('c', { ctrlKey: true }); await tick(); await tick()
  check('kopiëren zet de bestanden ook op het klembord van Windows',
    winKlembord.paden.length === 1)
  toets('x', { ctrlKey: true }); await tick(); await tick()
  check('knippen geeft dat door als knippen', winKlembord.knippen === true)
  toets('Escape')

  // wat elders gekopieerd is, kun je hier plakken
  winKlembord = { paden: ['C:\\elders\\van-buiten.txt'], knippen: false }
  bewerkingen = []
  toets('v', { ctrlKey: true }); await tick(); await tick(); await tick()
  check('je kunt plakken wat je buiten de app hebt gekopieerd',
    bewerkingen.some(b => b.soort === 'kopieer' && b.bronnen.includes('C:\\elders\\van-buiten.txt')))

  // Ctrl+Shift+V toont eerst wat er staat
  toets('v', { ctrlKey: true, shiftKey: true }); await tick(); await tick()
  check('Ctrl+Shift+V toont het klembord', $('#modal-klembord').hidden === false)
  check('met het bestand erin', $('#klembord-lijst').textContent.includes('van-buiten.txt'))
  bewerkingen = []
  $('#klembord-plak').click(); await tick(); await tick(); await tick()
  check('en je kunt er meteen vanuit plakken', bewerkingen.some(b => b.soort === 'kopieer'))
  check('het venster is daarna dicht', $('#modal-klembord').hidden === true)

  // ── meerdere kopieën onthouden ─────────────────────────────────────────────
  // Windows onthoudt er maar één; deze lijst houdt alles van deze sessie vast.
  klik(0); toets('c', { ctrlKey: true }); await tick(); await tick()
  const eerstGekopieerd = winKlembord.paden[0]
  klik(2); toets('c', { ctrlKey: true }); await tick(); await tick()
  const laatstGekopieerd = winKlembord.paden[0]

  toets('v', { ctrlKey: true, shiftKey: true }); await tick(); await tick()
  const regels = () => $$('#klembord-lijst .klem-item')
  check('elke kopie krijgt een eigen regel', regels().length >= 3)
  check('de nieuwste staat bovenaan', regels()[0].textContent.includes(laatstGekopieerd.split('\\').pop()))
  check('de vorige staat er nog steeds bij',
    $('#klembord-lijst').textContent.includes(eerstGekopieerd.split('\\').pop()))
  check('de bovenste is aangewezen', regels()[0].classList.contains('gekozen'))

  // een oudere kopie kiezen en die plakken
  regels()[1].dispatchEvent(new window.MouseEvent('click', { bubbles: true })); await tick()
  check('een andere regel aanwijzen kan', regels()[1].classList.contains('gekozen'))
  bewerkingen = []
  $('#klembord-plak').click(); for (let i = 0; i < 8; i++) await tick()
  check('dan wordt díe kopie geplakt',
    bewerkingen.some(b => b.soort === 'kopieer' && b.bronnen.includes(eerstGekopieerd)))
  check('en staat hij daarna ook weer op het klembord van Windows',
    winKlembord.paden.includes(eerstGekopieerd))

  // dezelfde set nog eens kopiëren schuift alleen omhoog
  toets('v', { ctrlKey: true, shiftKey: true }); await tick(); await tick()
  const voorDubbel = regels().length
  $('#klembord-sluit').click(); await tick()
  klik(2); toets('c', { ctrlKey: true }); await tick(); await tick()
  toets('v', { ctrlKey: true, shiftKey: true }); await tick(); await tick()
  check('dezelfde kopie komt er niet dubbel in', regels().length === voorDubbel)

  // een losse regel weghalen
  const voorWeg = regels().length
  regels()[1].querySelector('[data-weg]').dispatchEvent(new window.MouseEvent('click', { bubbles: true }))
  await tick()
  check('een regel kan uit de lijst', regels().length === voorWeg - 1)

  $('#klembord-leeg').click(); await tick(); await tick()
  check('legen maakt het klembord leeg', winKlembord.paden.length === 0)
  check('en de lijst is dan ook leeg', regels().length === 0)
  toets('v', { ctrlKey: true, shiftKey: true }); await tick(); await tick()
  check('een leeg klembord meldt dat netjes',
    $('#klembord-lijst').textContent.includes('Kopieer eerst') && $('#klembord-plak').disabled === true)
  $('#klembord-sluit').click(); await tick()

  // ── mapgroottes ────────────────────────────────────────────────────────────
  // Bij binnenkomst in een map worden de mappen daarin op de achtergrond
  // doorgemeten; bestanden weten hun grootte al.
  const naarMap = async (pad) => {
    $('#br-path').value = pad
    $('#br-path').focus()
    $('#br-path').dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }))
    $('#br-path').blur()
    for (let i = 0; i < 12; i++) await tick()
  }
  const vergeetAlleGroottes = () => W.vergeetGroottes()
  const meta = (naam) => $$('.br-item').find(el => el.textContent.includes(naam))?.querySelector('.br-meta')?.textContent.trim()

  vergeetAlleGroottes()
  gemeten = []; gestopt = 0; metenAf = ''
  groottes = { 'C:\\a\\lib': 5 * 1024 * 1024, 'C:\\a\\sub': 1024 }
  await naarMap('C:\\a')
  check('alleen mappen worden gemeten, geen bestanden',
    gemeten.length > 0 && !gemeten.some(g => /\.(dart|yaml|zip|rar)$/.test(g.pad)))
  check('elke map in beeld komt aan de beurt',
    gemeten.some(g => g.pad === 'C:\\a\\lib') && gemeten.some(g => g.pad === 'C:\\a\\sub'))
  check('de grootte komt in de lijst te staan', meta('lib') === '5.0 MB')
  check('en klopt ook voor de kleine map', meta('sub') === '1 KB')
  check('bestanden houden hun eigen grootte', meta('main.dart') === '2 KB')
  check('wegnavigeren stopt wat er nog loopt', gestopt >= 1)

  // wat al gemeten is, wordt niet opnieuw gedaan
  gemeten = []
  await naarMap('C:\\a\\lib')
  await naarMap('C:\\a')
  check('een tweede bezoek meet niet opnieuw',
    !gemeten.some(g => g.pad === 'C:\\a\\sub'))
  check('de grootte staat er meteen', meta('sub') === '1 KB')

  // een map die niet uit te lezen is
  vergeetAlleGroottes()
  metenAf = 'fout'
  await naarMap('C:\\a')
  check('een map die niet te meten is krijgt een streepje', meta('lib') === '—')
  metenAf = ''

  // niet helemaal klaar binnen de tijd: dan is het "minstens zoveel"
  vergeetAlleGroottes()
  metenAf = 'deels'
  await naarMap('C:\\a')
  check('een onvolledige meting wordt als "meer dan" getoond', meta('lib') === '> 5.0 MB')
  metenAf = ''

  // na een bewerking klopt de oude uitkomst niet meer
  vergeetAlleGroottes()
  await naarMap('C:\\a')
  gemeten = []
  klik(0)
  kiesKnop('')
  toets('Delete'); await tick(); await tick(); for (let i = 0; i < 8; i++) await tick()
  check('na verwijderen wordt opnieuw gemeten', gemeten.length > 0)

  // rechtsklik: deze map wél uitrekenen
  vergeetAlleGroottes()
  await naarMap('C:\\a')
  gemeten = []
  const libMap = $$('.br-item').find(el => el.textContent.includes('lib'))
  libMap.click(); await tick()
  rechtsklik(libMap); await tick()
  check('grootte berekenen staat in het menu', menuItems().some(t => t.includes('Grootte')))
  menuKlik('Grootte'); for (let i = 0; i < 8; i++) await tick()
  check('dat meet met een ruimere tijdslimiet', gemeten.some(g => g.budget >= 60000))

  // uitzetten in de instellingen
  $('#btn-settings').click(); await tick()
  check('er is een schakelaar voor mapgroottes', !!$('#set-mapgroottes'))
  check('en die staat standaard aan', $('#set-mapgroottes').checked === true)
  $('#set-mapgroottes').checked = false
  $('#set-mapgroottes').dispatchEvent(new window.Event('change')); await tick()
  check('uitzetten wordt onthouden', settings.mapGroottes === false)
  $('#btn-settings').click(); await tick()

  vergeetAlleGroottes()
  gemeten = []
  await naarMap('C:\\a')
  check('met de schakelaar uit wordt er niets gemeten', gemeten.length === 0)
  check('en blijft de kolom leeg', meta('lib') === '')

  $('#btn-settings').click(); await tick()
  $('#set-mapgroottes').checked = true
  $('#set-mapgroottes').dispatchEvent(new window.Event('change')); await tick()
  $('#btn-settings').click(); await tick()
  await naarMap('C:\\a')

  // ── verwijderen ────────────────────────────────────────────────────────────
  bewerkingen = []
  klik(0)
  rechtsklik(rij(0)); await tick()
  check('verwijderen staat in het menu', menuItems().some(t => t === 'Verwijderen'))
  menuKlik('Verwijderen'); await tick(); await tick(); await tick()
  check('verwijderen gaat standaard naar de prullenbak',
    bewerkingen.some(b => b.soort === 'verwijder' && !b.definitief))

  bewerkingen = []
  klik(0)
  toets('Delete'); await tick(); await tick(); await tick()
  check('de Delete-toets doet hetzelfde', bewerkingen.some(b => b.soort === 'verwijder' && !b.definitief))

  bewerkingen = []
  klik(0)
  laatsteVraag = null
  toets('Delete', { shiftKey: true }); await tick(); await tick(); await tick()
  check('Shift+Delete waarschuwt eerst',
    !!laatsteVraag && laatsteVraag.alles.includes('niet naar de prullenbak'))
  check('en verwijdert dan definitief', bewerkingen.some(b => b.definitief === true))

  // ── hernoemen ──────────────────────────────────────────────────────────────
  bewerkingen = []
  const hernoemRij = $$('.br-item').find(el => el.textContent.includes('main.dart'))
  hernoemRij.click(); await tick()
  rechtsklik(hernoemRij); await tick()
  check('hernoemen staat in het menu', menuItems().some(t => t === 'Hernoemen'))
  menuKlik('Hernoemen'); await tick(); await tick()
  check('er wordt om een nieuwe naam gevraagd', $('#modal-naam').hidden === false)
  check('met de huidige naam ingevuld', $('#naam-invoer').value === 'main.dart')
  $('#naam-invoer').value = 'app.dart'
  $('#modal-naam-ok').click(); await tick(); await tick(); await tick()
  check('hernoemen wordt uitgevoerd',
    bewerkingen.some(b => b.soort === 'hernoem' && b.naam === 'app.dart'))

  // F2 doet hetzelfde
  await tick(); await tick()
  $$('.br-item')[0].click(); await tick()
  toets('F2'); await tick(); await tick()
  check('F2 opent ook het hernoemvenster', $('#modal-naam').hidden === false)
  $('#modal-naam-cancel').click(); await tick()

  // bij meerdere tegelijk geen hernoemen
  klik(0); klik(1, { ctrlKey: true })
  rechtsklik(rij(0)); await tick()
  check('bij meerdere items verdwijnt hernoemen', !menuItems().some(t => t === 'Hernoemen'))
  sluitContextMenuViaKlik()

  // ── voortgang ──────────────────────────────────────────────────────────────
  check('de voortgangsbalk is standaard verborgen', $('#br-voortgang').hidden === true)
  voortgangCb({ bezig: true, bestand: 'groot.bin', gedaan: 5e6, totaal: 2e7 })
  check('bij een lopende kopie verschijnt de balk', $('#br-voortgang').hidden === false)
  check('met het percentage', $('#br-voortgang-tekst').textContent.includes('25%'))
  check('en de naam van het bestand', $('#br-voortgang-tekst').textContent.includes('groot.bin'))
  voortgangCb({ bezig: false })
  check('en hij verdwijnt als het klaar is', $('#br-voortgang').hidden === true)

  // ── archieven inkijken ─────────────────────────────────────────────────────
  $('#br-path').value = 'C:\\a'
  $('#br-path').focus()
  $('#br-path').dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }))
  await tick(); await tick()
  const zipRij = $$('.br-item').find(el => el.textContent.includes('pakket.zip'))
  check('een zipbestand staat in de lijst', !!zipRij)
  check('en is herkenbaar als archief', zipRij.classList.contains('archief'))

  zipRij.dispatchEvent(new window.MouseEvent('dblclick', { bubbles: true })); await tick(); await tick()
  check('een archief openen gedraagt zich als een map', $('#br-path').value === 'C:\\a\\pakket.zip')
  check('en toont wat erin zit', $$('.br-item').length === 2)
  check('met de map bovenaan', $$('.br-item')[0].textContent.includes('map'))

  $$('.br-item')[0].dispatchEvent(new window.MouseEvent('dblclick', { bubbles: true })); await tick(); await tick()
  check('je kunt een map ín het archief in', $('#br-path').value === 'C:\\a\\pakket.zip::map')
  check('met de inhoud daarvan', $$('.br-item').length === 2)

  uitgepakt = []
  $$('.br-item').find(el => el.textContent.includes('binnenin')).dispatchEvent(new window.MouseEvent('dblclick', { bubbles: true }))
  await tick(); await tick(); await tick()
  check('een bestand uit een archief wordt uitgepakt en geopend',
    uitgepakt.length === 1 && uitgepakt[0] === 'C:\\a\\pakket.zip::map/binnenin.txt')

  check('werk hier kan niet binnen een archief', (() => {
    const voor = projects[0].locations.length
    $('#br-usehere').click()
    return projects[0].locations.length === voor
  })())

  $('#br-up').click(); await tick(); await tick()
  check('omhoog gaat terug naar de wortel van het archief', $('#br-path').value === 'C:\\a\\pakket.zip::')

  // een rar zonder hulpprogramma legt uit waarom het niet kan
  $('#br-path').value = 'C:\\a\\oud.rar'
  $('#br-path').focus()
  $('#br-path').dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }))
  await tick(); await tick()
  check('een rar zonder 7-Zip of WinRAR legt uit wat eraan schort',
    $('#br-list').textContent.includes('7-Zip of WinRAR'))

  $('#br-path').value = 'C:\\a'
  $('#br-path').focus()
  $('#br-path').dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }))
  await tick(); await tick()

  // ── pijltjes door de lijst ─────────────────────────────────────────────────
  $('#br-path').value = 'C:\\a'
  $('#br-path').focus()
  $('#br-path').dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }))
  await tick(); await tick()
  browserKeuzeLeeg()
  const pijl = (k) => window.document.dispatchEvent(new window.KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true }))

  pijl('ArrowDown'); await tick()
  check('pijl omlaag selecteert de eerste regel', $$('.br-item')[0].classList.contains('gekozen'))
  pijl('ArrowDown'); await tick()
  check('nog een keer omlaag gaat naar de tweede', $$('.br-item')[1].classList.contains('gekozen'))
  pijl('ArrowUp'); await tick()
  check('omhoog gaat terug', $$('.br-item')[0].classList.contains('gekozen'))
  pijl('End'); await tick()
  check('End springt naar de laatste', $$('.br-item').slice(-1)[0].classList.contains('gekozen'))
  pijl('Home'); await tick()
  check('Home springt naar de eerste', $$('.br-item')[0].classList.contains('gekozen'))

  pijl('Enter'); await tick(); await tick()
  check('Enter opent de aangewezen map', $('#br-path').value === 'C:\\a\\lib')
  pijl('Backspace'); await tick(); await tick()
  check('Backspace gaat een map omhoog', $('#br-path').value === 'C:\\a')

  // ── suggesties in de adresbalk ─────────────────────────────────────────────
  // De lijst komt uit een async aanroep; rustig een paar rondjes wachten.
  const typInPad = async (waarde) => {
    pad.value = waarde
    pad.dispatchEvent(new window.Event('input'))
    for (let i = 0; i < 6; i++) await tick()
  }
  const pad = $('#br-path')
  pad.focus()
  await typInPad('C:\\a\\')
  check('typen toont suggesties', $('#br-suggest').hidden === false && $$('.br-sug').length === $$('.br-item').length)

  await typInPad('C:\\a\\li')
  check('letters filteren de suggesties', $$('.br-sug').length === 1 && $('.br-sug').textContent.includes('lib'))

  await typInPad('C:\\a\\')
  const padPijl = (k) => pad.dispatchEvent(new window.KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true }))
  padPijl('ArrowDown'); await tick()
  check('pijl omlaag kiest de eerste suggestie', $$('.br-sug')[0].classList.contains('actief'))
  check('en vult het pad alvast in', pad.value === 'C:\\a\\lib')
  padPijl('ArrowDown'); await tick()
  check('nog een keer gaat naar de volgende', $$('.br-sug')[1].classList.contains('actief'))
  padPijl('ArrowUp'); await tick()
  check('omhoog werkt ook', $$('.br-sug')[0].classList.contains('actief'))

  padPijl('Enter'); await tick(); await tick()
  check('Enter springt naar de gekozen map', $('#br-path').value === 'C:\\a\\lib')
  check('en de suggesties verdwijnen', $('#br-suggest').hidden === true)

  pad.focus()
  pad.value = 'C:\\a\\'
  pad.dispatchEvent(new window.Event('input')); await tick(); await tick()
  padPijl('Escape'); await tick()
  check('Escape sluit de suggesties', $('#br-suggest').hidden === true)

  // ── werk hier in een project ───────────────────────────────────────────────
  const projVoor = projects[0].locations.length
  check('werk hier is nu ook in een project bruikbaar', $('#br-usehere').disabled === false)
  $('#br-usehere').click(); await tick(); await tick(); await tick()
  check('de map komt bij de locaties van het project',
    projects[0].locations.length === projVoor + 1)
  check('met de mapnaam als label',
    projects[0].locations[projVoor].label === 'lib' && projects[0].locations[projVoor].path === 'C:\\a\\lib')
  check('en wordt meteen de actieve locatie', projects[0].activeLocation === projVoor)
  check('de keuzelijst in de kop toont hem ook',
    $('#loc-select').value === String(projVoor))

  // nog een keer dezelfde map: niet dubbel toevoegen
  $('[data-tab="browser"]').click(); await tick(); await tick()
  $('#br-path').value = 'C:\\a\\lib'
  $('#br-path').focus()
  $('#br-path').dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }))
  await tick(); await tick()
  $('#br-usehere').click(); await tick(); await tick(); await tick()
  check('dezelfde map komt er niet twee keer bij', projects[0].locations.length === projVoor + 1)

  // terug naar de oorspronkelijke locatie, zodat de rest van de test klopt
  $('[data-tab="output"]').click(); await tick()
  $('#loc-select').value = '0'
  $('#loc-select').dispatchEvent(new window.Event('change')); await tick(); await tick()
  check('van locatie wisselen werkt en wordt bewaard',
    projects[0].activeLocation === 0 && $('#term-input').placeholder === 'C:\\a')

  // ── weergave per project onthouden ─────────────────────────────────────────
  $('[data-tab="browser"]').click(); await tick(); await tick()
  check('de verkenner-keuze wordt bewaard', settings.termTabs['p1'] === 'browser')
  $('#btn-nav-cmd').click(); await tick(); await tick()
  $('[data-tab="output"]').click(); await tick()
  check('de cmd-sectie houdt zijn eigen keuze los van het project',
    settings.termTabs['__cmd__'] === 'output' && settings.termTabs['p1'] === 'browser')

  // terug naar het project, zodat de app daar ook weer opstart
  $$('.proj-item')[0].click(); await tick()
  let w3 = await herstart()
  check('na herstart staat het project weer op verkenner',
    w3.document.getElementById('browser') && w3.document.getElementById('browser').hidden === false)
  global.window = window; global.document = window.document

  $$('.proj-item')[0].click(); await tick()
  $('[data-tab="output"]').click(); await tick()
  check('terug op output wordt ook bewaard', settings.termTabs['p1'] === 'output')

  // ── commando's die een echte console nodig hebben ──────────────────────────
  // De uitvoer hier is eenrichtingsverkeer; iets als Claude Code wil met je
  // praten en hoort dus in een eigen venster.
  $$('.proj-item')[0].click(); await tick(); await tick()
  const typTerminal = async (tekst) => {
    const ti = $('#term-input')
    ti.value = tekst
    ti.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }))
    for (let i = 0; i < 6; i++) await tick()
  }
  const uitvoer = () => $('#terminal').textContent
  // executed vangt twee dingen op: echt uitgevoerde commando's (met .ran) en
  // geschiedenisregels (met .cmd). Voor deze controles tellen alleen de eerste.
  const gedraaid = () => executed.filter(e => e.ran)

  cmdVensters = []; executed.length = 0
  await typTerminal('claude')
  check('claude gaat naar een eigen venster', cmdVensters.length === 1)
  check('in de map van het project', cmdVensters[0].cwd === 'C:\\a')
  check('met het commando erbij', cmdVensters[0].cmd === 'claude')
  check('en draait dus niet in de uitvoer',
    !gedraaid().some(e => String(e.ran).startsWith('claude')))
  check('er staat uitleg bij', uitvoer().includes('eigen venster'))

  cmdVensters = []; executed.length = 0
  await typTerminal('claude -p "iets vragen"')
  check('met --print kan het wel gewoon hier',
    cmdVensters.length === 0 && gedraaid().length === 1)

  cmdVensters = []; executed.length = 0
  await typTerminal('claude --print "iets vragen"')
  check('de lange vorm --print net zo',
    cmdVensters.length === 0 && gedraaid().length === 1)

  cmdVensters = []; executed.length = 0
  await typTerminal('claude --resume')
  check('claude met een vlag wil nog steeds een eigen venster',
    cmdVensters.length === 1 && gedraaid().length === 0)

  // In --dangerously-skip-permissions zit letterlijk "-p"; dat mag niet worden
  // aangezien voor --print, anders belandt een interactieve sessie hier alsnog.
  cmdVensters = []; executed.length = 0
  await typTerminal('claude --dangerously-skip-permissions')
  check('een vlag met -p erin telt niet als --print',
    cmdVensters.length === 1 && gedraaid().length === 0)

  cmdVensters = []; executed.length = 0
  await typTerminal('node')
  check('een kale REPL ook naar een eigen venster',
    cmdVensters.length === 1 && gedraaid().length === 0)
  cmdVensters = []; executed.length = 0
  await typTerminal('node build.js')
  check('maar een script gewoon hier', cmdVensters.length === 0 && gedraaid().length === 1)

  cmdVensters = []; executed.length = 0
  await typTerminal('flutter pub get')
  check('gewone commando\'s blijven in de uitvoer',
    cmdVensters.length === 0 && gedraaid().length === 1)

  // De Claude Code-knop hoort hetzelfde te doen via een uitvoerprogramma in de lijst.
  const zetClaudeCode = async (aan) => {
    settings.customEditors = aan
      ? [{ id: 'ce_claude', label: 'Claude Code', path: 'claude', enabled: true, kleur: 0 }]
      : []
    $$('.proj-item')[0].click(); await tick(); await tick()
  }

  await zetClaudeCode(true)
  cmdVensters = []; editorStarts = []
  const claudeKnop = $$('.cmd-btn[data-editor]').find(b => b.dataset.editor === 'custom:ce_claude')
  check('de Claude Code-knop staat er als het programma is toegevoegd', !!claudeKnop)
  if (claudeKnop) { claudeKnop.click(); await tick() }
  check('de Claude Code-knop opent een console, geen los venster',
    cmdVensters.length === 1 && editorStarts.length === 0)
  check('in de projectmap', cmdVensters[0] && cmdVensters[0].cwd === 'C:\\a')
  await zetClaudeCode(false)

  // ── tekstgrootte van de output ─────────────────────────────────────────────
  $$('.proj-item')[0].click(); await tick(); await tick()
  const outputMaat = () => $('#terminal').style.fontSize
  const scrolOutput = (omhoog) => $('#terminal').dispatchEvent(new window.WheelEvent('wheel', {
    deltaY: omhoog ? -120 : 120, ctrlKey: true, bubbles: true, cancelable: true,
  }))

  check('de output begint op de gewone grootte', outputMaat() === '12px')
  scrolOutput(true); await tick()
  check('ctrl+scroll omhoog maakt de tekst groter', outputMaat() === '13.5px')
  check('en dat wordt onthouden', settings.outputMaat === 2)
  scrolOutput(true); scrolOutput(true); scrolOutput(true); await tick()
  check('groter dan de grootste kan niet', outputMaat() === '17px')
  for (let i = 0; i < 6; i++) scrolOutput(false)
  await tick()
  check('en kleiner dan de kleinste ook niet', outputMaat() === '11px')
  check('zonder ctrl verandert er niets', (() => {
    $('#terminal').dispatchEvent(new window.WheelEvent('wheel', { deltaY: -120, bubbles: true, cancelable: true }))
    return outputMaat() === '11px'
  })())
  scrolOutput(true); await tick()
  check('terug naar de gewone grootte', outputMaat() === '12px' && settings.outputMaat === 1)

  // ── een echte terminal in het venster zelf ─────────────────────────────────
  // Hierboven was er geen xterm geladen, dus viel alles terug op een eigen
  // venster. Nu wel: dan hoort hetzelfde commando gewoon hier te draaien.
  window.Terminal = NepTerminal
  window.FitAddon = { FitAddon: NepFit }
  ptyErBij = { ok: true, reden: '' }
  ptyAntwoord = { ok: true, pid: 42 }

  $$('.proj-item')[0].click(); await tick(); await tick()
  cmdVensters = []; executed.length = 0; ptyStarts = []; laatsteTerm = null
  await typTerminal('claude')

  check('claude start een echte terminal in de app', ptyStarts.length === 1)
  check('met het commando', ptyStarts[0] && ptyStarts[0].cmd === 'claude')
  check('in de projectmap', ptyStarts[0] && ptyStarts[0].cwd === 'C:\\a')
  check('en dus geen eigen venster meer', cmdVensters.length === 0)
  check('de sessie neemt de output over', !$('#pty-host').hidden && $('#terminal').hidden)
  check('en dat is nog steeds het output-tabblad',
    $('[data-tab="output"]').classList.contains('active'))
  check('er brandt een lampje bij output', $('#pty-punt').hidden === false)
  check('het invoerveld gaat weg, je typt nu in de terminal zelf',
    $('.term-input-wrap').hidden === true)
  check('en de terminal heeft de aandacht', laatsteTerm && laatsteTerm.gefocust)
  check('in de uitvoer staat wat er gebeurd is', uitvoer().includes('claude draait hier'))

  check('de sessie start op de ingestelde tekstgrootte',
    laatsteTerm.opts && laatsteTerm.opts.fontSize === 12)
  ptyResizes = []
  scrolOutput(true); await tick()
  check('en groeit mee met ctrl+scroll', laatsteTerm.options.fontSize === 13.5)
  check('daarna wordt de sessie opnieuw uitgemeten', ptyResizes.length > 0)
  $('#pty-host').dispatchEvent(new window.WheelEvent('wheel', { deltaY: 120, ctrlKey: true, bubbles: true, cancelable: true }))
  await tick()
  check('ctrl+scroll werkt ook boven de terminal zelf', laatsteTerm.options.fontSize === 12)

  // wat de pty stuurt komt in de terminal terecht
  ptyData({ id: 'p1', data: 'Welkom bij Claude Code\r\n' })
  check('uitvoer van de sessie komt in de terminal',
    laatsteTerm.alles().includes('Welkom bij Claude Code'))
  ptyData({ id: 'p2-bestaat-niet', data: 'niet tonen' })
  check('uitvoer van een andere sessie niet',
    !laatsteTerm.alles().includes('niet tonen'))

  // en wat jij typt gaat terug naar het proces
  ptyWrites = []
  laatsteTerm.typ('hallo\r')
  check('wat je typt gaat naar het proces',
    ptyWrites.length === 1 && ptyWrites[0].data === 'hallo\r' && ptyWrites[0].id === 'p1')

  // afsluiten ruimt de sessie op en geeft focus terug aan het commandoveld
  ptyExit({ id: 'p1', code: 0 })
  await tick()
  check('bij afsluiten komt de gewone uitvoer terug',
    !$('#terminal').hidden && $('#pty-host').hidden && $('.term-input-wrap').hidden === false)
  check('met een melding in de uitvoer', uitvoer().includes('afgesloten (code 0)'))
  check('het lampje gaat uit', $('#pty-punt').hidden === true)
  check('en je kunt meteen typen zonder te klikken',
    window.document.activeElement && window.document.activeElement.id === 'term-input')

  // opnieuw starten en handmatig sluiten mag ook
  cmdVensters = []; ptyStarts = []; ptyStops = []
  await typTerminal('claude')
  check('opnieuw starten kan gewoon', ptyStarts.length === 1)
  ptyStops = []
  $('#btn-pty-sluit').click(); await tick()
  check('sessie sluiten ruimt hem op', ptyStops.length === 1 && laatsteTerm.weg === true)
  check('het lampje blijft uit', $('#pty-punt').hidden === true)
  check('en de gewone uitvoer staat er weer, met het invoerveld',
    !$('#terminal').hidden && $('#pty-host').hidden && $('.term-input-wrap').hidden === false)
  check('wat er eerder in de output stond is niet weg',
    uitvoer().includes('claude draait hier'))
  check('focus ligt weer in het commandoveld',
    window.document.activeElement && window.document.activeElement.id === 'term-input')

  // de stopknop stopt de sessie in plaats van flutter
  cmdVensters = []; ptyStarts = []; ptyStops = []
  await typTerminal('claude')
  check('opnieuw starten kan gewoon', ptyStarts.length === 1)
  $('#btn-kill').click(); await tick()
  check('de stopknop stopt de sessie', ptyStops.length === 1)

  // een sessie blijft van zijn eigen project
  cmdVensters = []; ptyStarts = []; ptyStops = []
  await typTerminal('claude')
  $('#btn-nav-cmd').click(); await tick(); await tick()
  check('in de cmd-sectie zie je die sessie niet',
    $('#pty-host').hidden === true && !$('#terminal').hidden)
  $$('.proj-item')[0].click(); await tick(); await tick()
  check('terug bij het project draait hij nog in de output',
    !$('#pty-host').hidden && $('#pty-punt').hidden === false)
  $('#btn-pty-sluit').click(); await tick()

  // even naar de verkenner en terug laat de sessie staan
  cmdVensters = []; ptyStarts = []
  await typTerminal('claude')
  $('[data-tab="browser"]').click(); await tick(); await tick()
  check('in de verkenner is de terminal weg', $('#pty-host').hidden === true)
  $('[data-tab="output"]').click(); await tick(); await tick()
  check('en bij terugkomst draait hij nog', !$('#pty-host').hidden)
  $('#btn-pty-sluit').click(); await tick()

  // lukt het starten niet, dan alsnog een eigen venster
  ptyAntwoord = { ok: false, reason: 'node-pty deed het niet' }
  cmdVensters = []; ptyStarts = []
  await typTerminal('claude')
  check('als de terminal niet start, gaat het alsnog naar een eigen venster',
    ptyStarts.length === 1 && cmdVensters.length === 1)
  check('en de gewone uitvoer blijft dan gewoon staan',
    !$('#terminal').hidden && $('#pty-host').hidden)
  ptyAntwoord = { ok: true, pid: 42 }

  // terug naar de opstelling zonder xterm voor de rest van de controles
  delete window.Terminal
  delete window.FitAddon
  $$('.proj-item')[0].click(); await tick(); await tick()

  // ── een rij, met de Flutter-knoppen in een map ─────────────────────────────────────────
  $$('.proj-item')[0].click(); await tick(); await tick()
  // Tools was nooit een tweede soort knop, alleen een tweede rij. Er is nu nog
  // een sectie, en wat daar stond zit in de map 'flutter'.
  check('er is nog maar een knoppensectie',
    !!$('[data-sectieblok="run"]') && !$('[data-sectieblok="tools"]'))
  check('de flutter-knoppen zitten in een map',
    !!$('[data-map-groep] [data-cmd="run-android"]') &&
    !!$('[data-map-groep] [data-cmd="run-windows"]') &&
    !!$('[data-map-groep] [data-cmd="run-chrome"]'))
  check('en staan niet los in de rij',
    !$('.cmd-grid > .cmd-btn[data-cmd="run-android"]'))
  check('--release staat op de kop van die map',
    !!$('[data-map-groep] #toggle-release'))
  check('en de rij staat standaard aan', $('#toggle-sectie-run').checked === true)
  check('de knoppen zijn zichtbaar', $$('.cmd-section.sectie-uit').length === 0)

  // Een map dichtklappen doet wat de tools-schakelaar deed: de knoppen uit het
  // zicht, zonder ze weg te gooien.
  $('.cmd-map-kop').click(); await tick()
  check('een map dichtklappen haalt zijn knoppen uit beeld',
    !$('[data-cmd="run-android"]') && !!$('.cmd-map-kop.dicht'))
  check('en --release gaat mee, want dat hoort bij die knoppen', !$('#toggle-release'))
  check('het wordt bewaard bij het project',
    (projects[0].cmdFolders || []).some(f => f.auto === 'flutter' && f.open === false))
  $('.cmd-map-kop').click(); await tick()
  check('weer openklappen zet ze terug', !!$('[data-map-groep] [data-cmd="run-android"]'))

  $('#toggle-sectie-run').checked = false
  $('#toggle-sectie-run').dispatchEvent(new window.Event('change')); await tick()
  check('de hele rij kan ook inklappen',
    $('[data-sectieblok="run"]').classList.contains('sectie-uit') && projects[0].secties.run === false)
  $('#toggle-sectie-run').checked = true
  $('#toggle-sectie-run').dispatchEvent(new window.Event('change')); await tick()
  check('en weer uitklappen', !$('[data-sectieblok="run"]').classList.contains('sectie-uit'))

  // ook in de projectinstellingen
  $$('.proj-edit')[0].click(); await tick()
  check('de instellingen hebben een hoofdschakelaar', $$('[data-sectie]').length === 1)

  // ── knoppen die standaard uit staan ────────────────────────────────────────
  // Het verschil dat telt: ze bestaan wél in de lijst (anders weet niemand dat
  // ze er zijn), maar het vinkje staat uit zonder dat er ooit iets is
  // uitgezet. Zonder de tekst erachter lijkt dat op iets wat je zelf ooit hebt
  // weggeklikt, dus die tekst hoort erbij.
  const cmdVink = (id) => $(`#cmdvis-section [data-cmdvis-id="${id}"]`)
  check('fetch en stash staan in de lijst', !!cmdVink('git-fetch') && !!cmdVink('git-stash'))
  check('maar hun vinkje staat uit', !cmdVink('git-fetch').checked && !cmdVink('git-stash').checked)
  check('met "standaard uit" erachter, zodat je weet waaróm',
    $$('.cmdvis-row').filter(r => r.querySelector('.cmdvis-standaard-uit'))
      .every(r => ['git-fetch', 'git-stash', 'git-branch', 'git-terug'].includes(r.querySelector('[data-cmdvis-id]').dataset.cmdvisId))
    && $$('.cmdvis-standaard-uit').length === 4)
  check('de dagelijkse knoppen staan gewoon aan',
    ['git-status', 'git-commit', 'git-push', 'git-pull', 'git-log'].every(id => cmdVink(id) && cmdVink(id).checked))
  check('en terughalen ook — dat is de weg terug',
    cmdVink('git-stash-lijst') && cmdVink('git-stash-lijst').checked)

  // Aanzetten moet blijven staan. Dat is het verschil tussen "standaard uit"
  // en "kan niet": er wordt dan wél een voorkeur vastgelegd.
  cmdVink('git-fetch').checked = true
  cmdVink('git-fetch').dispatchEvent(new window.Event('change'))
  $('#modal-proj-save').click(); await tick(); await tick()
  check('zelf aanzetten wordt bewaard', projects[0].cmdVisibility['git-fetch'] === true)
  $$('.proj-edit')[0].click(); await tick()
  check('en staat er de volgende keer nog steeds aan', cmdVink('git-fetch').checked)
  cmdVink('git-fetch').checked = false
  cmdVink('git-fetch').dispatchEvent(new window.Event('change'))
  $('#modal-proj-save').click(); await tick(); await tick()

  $$('.proj-edit')[0].click(); await tick()
  const sectieVink = (naam) => $(`[data-sectie="${naam}"]`)
  sectieVink('run').checked = false
  sectieVink('run').dispatchEvent(new window.Event('change')); await tick()
  check('uitgezette groep wordt grijs', !!$('.cmdvis-group.uit'))
  $('#modal-proj-save').click(); await tick(); await tick()
  check('opslaan zet de sectie uit', projects[0].secties.run === false)
  check('en dat zie je meteen als ingeklapt', $('[data-sectieblok="run"]').classList.contains('sectie-uit'))

  $$('.proj-edit')[0].click(); await tick()
  sectieVink('run').checked = true
  sectieVink('run').dispatchEvent(new window.Event('change')); await tick()
  $('#modal-proj-save').click(); await tick(); await tick()
  check('en weer aan', projects[0].secties.run === true && !$('[data-sectieblok="run"]').classList.contains('sectie-uit'))

  // Geen knoppen meer in een map → de map verdwijnt uit de rij. Een mapkop
  // zonder inhoud is alleen een naam waar niets achter zit.
  $$('.proj-edit')[0].click(); await tick()
  const toolIds = ['run-android', 'run-windows', 'run-chrome', 'devices', 'pub-get', 'clean', 'doctor', 'build-apk', 'build-web', 'build-windows']
  const zetTools = (aan) => toolIds.forEach(id => {
    const chk = $(`#cmdvis-section [data-cmdvis-id="${id}"]`)
    if (chk) { chk.checked = aan; chk.dispatchEvent(new window.Event('change')) }
  })
  zetTools(false)
  $('#modal-proj-save').click(); await tick(); await tick()
  check('zonder knoppen verdwijnt de flutter-map uit de rij', !$('.cmd-map-kop'))
  check('de rij zelf blijft, die heeft nog knoppen', !!$('[data-sectieblok="run"]'))

  // weer aanzetten via instellingen
  $$('.proj-edit')[0].click(); await tick()
  zetTools(true)
  $('#modal-proj-save').click(); await tick(); await tick()
  check('knoppen terug → map ook terug', !!$('.cmd-map-kop'))

  // ── is dit wel een Flutter-project? ────────────────────────────────────────
  // Tools slaan alleen ergens op bij Flutter. Dat wordt één keer nagekeken, bij
  // een nieuw project en de eerste keer dat je het opent.
  const maakProject = async (naam, pad) => {
    $('#btn-add-proj').click(); await tick()
    const vul = (el, v) => { el.value = v; el.dispatchEvent(new window.Event('input')) }
    vul($('#f-name'), naam)
    vul($$('#loc-list .field')[0], 'main')
    vul($$('#loc-list .field')[1], pad)
    $('#modal-proj-save').click()
    for (let i = 0; i < 8; i++) await tick()
    return projects.find(p => p.name === naam)
  }
  const wisProject = async (naam) => {
    const n = projects.findIndex(p => p.name === naam)
    $$('.proj-edit')[n].click(); await tick()
    $('#modal-proj .btn-delete').click(); await tick()
    $('#del-confirm').click(); await tick(); await tick()
  }

  soortVragen = []
  projectSoorten['C:\\gekozen'] = { ok: true, flutter: false, dart: false, node: true }
  const fl = await maakProject('flutter-app', 'C:\\a')
  check('een nieuw project wordt meteen bekeken', soortVragen.includes('C:\\a'))
  check('bij Flutter staat de flutter-map open',
    fl.secties.tools === true && (fl.cmdFolders || []).some(f => f.auto === 'flutter' && f.open === true))

  soortVragen = []
  const web = await maakProject('web-app', 'C:\\gekozen')
  check('een niet-Flutter project wordt ook bekeken', soortVragen.includes('C:\\gekozen'))
  check('en bij een ander soort project gaat die map dicht',
    web.secties.tools === false && (web.cmdFolders || []).some(f => f.auto === 'flutter' && f.open === false))

  const webRij = projects.findIndex(p => p.name === 'web-app')
  soortVragen = []
  $$('.proj-item')[webRij].click(); for (let i = 0; i < 6; i++) await tick()
  check('de flutter-map is dan dicht, niet weg',
    !!$('.cmd-map-kop.dicht') && !$('[data-cmd="run-android"]'))
  check('en de rij staat er gewoon',
    !!$('[data-sectieblok="run"]') && !$('[data-sectieblok="run"]').classList.contains('sectie-uit'))
  check('een tweede keer openen vraagt niets meer', soortVragen.length === 0)

  // je eigen keuze wint van de automaat
  $('.cmd-map-kop').click(); await tick()
  soortVragen = []
  $$('.proj-item')[0].click(); await tick()
  $$('.proj-item')[webRij].click(); for (let i = 0; i < 6; i++) await tick()
  check('een eigen keuze blijft staan',
    !!$('[data-map-groep] [data-cmd="run-android"]') && soortVragen.length === 0)

  await wisProject('web-app')
  await wisProject('flutter-app')
  check('de hulpprojecten zijn weer weg', projects.length === 1)
  $$('.proj-item')[0].click(); for (let i = 0; i < 4; i++) await tick()

  // ── updaten terwijl er niets veranderd is ──────────────────────────────────
  // een slotbestand van een vastgelopen poging mag je kunnen overrulen
  updates = []; updateAntwoord = { ok: false, reason: 'bezig', sinds: Date.now() - 5 * 60e3 }
  laatsteVraag = null
  kiesKnop(['updaten', 'toch doorgaan'])
  $('#btn-update').click(); for (let i = 0; i < 6; i++) await tick()
  check('bij een lopende update kun je doorzetten',
    updates.length === 2 && updates[1] && updates[1].force === true)
  check('met de melding hoe lang geleden die begon',
    !!laatsteVraag && laatsteVraag.alles.includes('5 minuten geleden'))

  updates = []
  kiesKnop(['updaten', 'annuleren'])
  $('#btn-update').click(); for (let i = 0; i < 6; i++) await tick()
  check('of gewoon annuleren', updates.length === 1)
  kiesKnop('')

  updates = []; updateAntwoord = { ok: false, reason: 'actueel' }
  laatsteVraag = null
  kiesKnop(['updaten', 'annuleren'])
  $('#btn-update').click(); for (let i = 0; i < 6; i++) await tick()
  check('bij dezelfde broncode wordt er niet doorgebouwd', updates.length === 1)
  check('en dat wordt netjes gevraagd',
    !!laatsteVraag && laatsteVraag.alles.toLowerCase().includes('niet veranderd'))

  updates = []
  kiesKnop(['updaten', 'toch opnieuw bouwen'])
  $('#btn-update').click(); for (let i = 0; i < 6; i++) await tick()
  check('je kunt het wel forceren',
    updates.length === 2 && updates[1] && updates[1].force === true)
  updateAntwoord = { ok: true }
  kiesKnop('')

  // ── volgorde van de zijbalk aanpassen ──────────────────────────────────────
  const projNamen = () => $$('.proj-item .proj-label').map(e => e.textContent)
  const navNamen  = () => $$('.nav-list .nav-item').map(e => e.id)

  // een tweede project via de app zelf, anders valt er niets te schuiven
  $('#btn-add-proj').click(); await tick()
  const vul = (el, v) => { el.value = v; el.dispatchEvent(new window.Event('input')) }
  vul($('#f-name'), 'tweede app')
  vul($$('#loc-list .field')[0], 'main')
  vul($$('#loc-list .field')[1], 'C:\\gekozen')
  $('#modal-proj-save').click(); await tick(); await tick()

  check('naast projecten staat een sorteerknop', !!$('#sort-proj'))
  check('en naast cmd ook', !!$('#sort-nav'))
  check('en naast deze pc ook, helemaal rechts', !!$('#sort-dezepc'))
  check('deze-pc-sorteerknop staat rechts van ververs',
    $('#sort-dezepc').previousElementSibling?.id === 'boom-ververs')
  check('normaal zijn er geen pijltjes', $$('.sort-pijl').length === 0)

  // verplaatsmodus via het icoon op deze pc
  check('verplaatsknop staat rechts van ververs',
    $('#sort-dezepc').previousElementSibling?.id === 'boom-ververs')
  check('en heeft een verplaats-icoon', !!$('#sort-dezepc .ti-arrows-move'))

  // Boom opnieuw vullen (eerdere tests knippen C:\ soms terug).
  mappen['C:\\'] = [
    { name: 'a', path: 'C:\\a', dir: true, size: 0, mtime: 1 },
    { name: 'leesmij.txt', path: 'C:\\leesmij.txt', dir: false, size: 40, mtime: 1 },
  ]
  mappen['C:\\a'] = [
    { name: 'lib', path: 'C:\\a\\lib', dir: true, size: 0, mtime: 1 },
    { name: 'sub', path: 'C:\\a\\sub', dir: true, size: 0, mtime: 1 },
    { name: 'main.dart', path: 'C:\\a\\main.dart', dir: false, size: 2048, mtime: 1 },
    { name: 'pubspec.yaml', path: 'C:\\a\\pubspec.yaml', dir: false, size: 512, mtime: 1 },
    { name: 'pakket.zip', path: 'C:\\a\\pakket.zip', dir: false, size: 9999, mtime: 1, archief: true },
    { name: 'oud.rar', path: 'C:\\a\\oud.rar', dir: false, size: 8888, mtime: 1, archief: true },
  ]
  settings.boomOpen = ['C:\\', 'C:\\a']
  $('#boom-ververs').click()
  await new Promise(r => setTimeout(r, 150))
  $$('.proj-item')[0].click()
  await new Promise(r => setTimeout(r, 50))

  $('#sort-dezepc').click(); await tick()
  check('klik op verplaats zet de modus aan',
    $('#sort-dezepc').classList.contains('aan') && $('#boom').classList.contains('boom-verplaatsen'))
  check('geen uitlegtekst bij verplaatsen', !$('.sort-hint-sectie'))

  const heeftBoomItems =
    $$('#boom .boom-naam').some(el => el.textContent === 'main.dart') &&
    $$('#boom .boom-naam').some(el => el.textContent === 'leesmij.txt')
  check('boom toont bestanden om te selecteren', heeftBoomItems)

  if (heeftBoomItems) {
    boomRij('lib')?.querySelector('.boom-pijl')?.click()
    await tick(); await tick()
    check('pijltje klapt open/dicht zonder te selecteren',
      !boomRij('lib')?.classList.contains('gekozen'))

    boomRij('main.dart')?.click(); await tick()
    boomRij('leesmij.txt')?.click(); await tick()
    check('meerdere bestanden selecteren kan',
      !!boomRij('main.dart')?.classList.contains('gekozen') &&
      !!boomRij('leesmij.txt')?.classList.contains('gekozen'))

    boomRij('lib')?.click(); await tick()
    check('en ook een map erbij', !!boomRij('lib')?.classList.contains('gekozen'))

    bewerkingen = []
    const bronRij = boomRij('leesmij.txt')
    const doelRij = boomRij('sub')
    const dt = {
      data: {},
      setData(t, v) { this.data[t] = String(v) },
      getData(t) { return this.data[t] || '' },
      effectAllowed: 'all',
      dropEffect: 'none',
    }
    Object.defineProperty(dt, 'types', { get() { return Object.keys(this.data) } })
    if (bronRij && typeof bronRij.ondragstart === 'function') {
      bronRij.ondragstart({ dataTransfer: dt, preventDefault() {}, stopPropagation() {} })
    }
    dt.setData('application/x-commanddeck-paden', JSON.stringify(['C:\\leesmij.txt']))
    if (doelRij?.ondrop) await doelRij.ondrop({ dataTransfer: dt, preventDefault() {}, stopPropagation() {} })
    for (let i = 0; i < 6; i++) await tick()
    check('slepen naar een map verplaatst',
      bewerkingen.some(b => b.soort === 'verplaats' && b.doelMap === 'C:\\a\\sub'))
  }

  $('#sort-dezepc').click(); await tick()
  check('nog een klik zet de verplaatsmodus uit',
    !$('#sort-dezepc').classList.contains('aan') && !$('#boom').classList.contains('boom-verplaatsen'))

  const voorProj = projNamen()
  check('er staan meerdere projecten', voorProj.length >= 2)

  $('#sort-proj').click(); await tick()
  check('de sorteerstand geeft pijltjes', $$('#proj-list .sort-pijl').length === voorProj.length * 2)
  check('met uitleg erbij', !!$('.sort-hint'))
  check('de knop laat zien dat hij aan staat', $('#sort-proj').classList.contains('aan'))
  check('het eerste project kan niet omhoog',
    $$('#proj-list .proj-item')[0].querySelector('[data-op="op"]').classList.contains('uit'))
  check('het laatste kan niet omlaag',
    $$('#proj-list .proj-item').at(-1).querySelector('[data-op="neer"]').classList.contains('uit'))

  // in de sorteerstand opent klikken geen project
  const viewVoor = $('#main').style.display
  $$('#proj-list .proj-item')[1].click(); await tick()
  check('klikken opent dan niets', $('#main').style.display === viewVoor)

  $$('#proj-list .proj-item')[1].querySelector('[data-op="op"]').click(); await tick(); await tick()
  check('een project omhoog schuiven werkt',
    projNamen()[0] === voorProj[1] && projNamen()[1] === voorProj[0])
  check('en dat wordt bewaard', projects[0].name === voorProj[1])

  $$('#proj-list .proj-item')[0].querySelector('[data-op="neer"]').click(); await tick(); await tick()
  check('omlaag schuiven brengt het weer terug', projNamen()[0] === voorProj[0])

  $('#sort-proj').click(); await tick()
  check('nog een klik zet de sorteerstand uit', $$('.sort-pijl').length === 0)
  check('en de uitleg verdwijnt', !$('.sort-hint'))
  $$('.proj-item')[0].click(); await tick()
  check('daarna opent klikken weer gewoon', $('#main').style.display === 'flex')

  // hetzelfde voor de cmd-knoppen
  check('de knoppen staan standaard in de vaste volgorde',
    navNamen().join() === 'btn-nav-cmd,btn-nav-ps,btn-nav-bat,btn-nav-dict')

  $('#sort-nav').click(); await tick()
  check('ook hier komen pijltjes', $$('.nav-list .sort-pijl').length === 8)
  $$('.nav-list .nav-item')[2].querySelector('[data-op="links"]').click(); await tick()
  check('bat schuift omhoog',
    navNamen().join() === 'btn-nav-cmd,btn-nav-bat,btn-nav-ps,btn-nav-dict')
  check('de volgorde wordt onthouden',
    settings.navVolgorde.join() === 'cmd,bat,ps,dict')

  $('#sort-nav').click(); await tick()
  const naHerstart = await herstart()
  check('en staat er na herstart nog steeds zo bij',
    [...naHerstart.document.querySelectorAll('.nav-list .nav-item')].map(e => e.id).join()
      === 'btn-nav-cmd,btn-nav-bat,btn-nav-ps,btn-nav-dict')
  global.window = window; global.document = window.document

  // terugzetten voor de rest van de tests
  $('#sort-nav').click(); await tick()
  $$('.nav-list .nav-item')[1].querySelector('[data-op="rechts"]').click(); await tick()
  $('#sort-nav').click(); await tick()
  check('en terugschuiven kan ook',
    navNamen().join() === 'btn-nav-cmd,btn-nav-ps,btn-nav-bat,btn-nav-dict')

  // het tweede project weer opruimen, zodat de rest van de tests zijn oude
  // uitgangspositie houdt
  $$('.proj-edit')[1].click(); await tick()
  $('#modal-proj .btn-delete').click(); await tick()
  $('#del-confirm').click(); await tick(); await tick()
  check('het hulpproject is weer weg', projNamen().length === 1)
  $$('.proj-item')[0].click(); await tick()

  // ── vorige en volgende ─────────────────────────────────────────────────────
  check('de knoppen staan linksboven', !!$('#btn-nav-back') && !!$('#btn-nav-forward'))

  $$('.proj-item')[0].click(); await tick()
  $('#btn-nav-dict').click(); await tick()
  $('#btn-nav-bat').click(); await tick(); await tick()
  check('vooruit kan niet als je vooraan staat', $('#btn-nav-forward').disabled === true)
  check('terug kan wel', $('#btn-nav-back').disabled === false)

  $('#btn-nav-back').click(); await tick(); await tick()
  check('terug brengt je naar het woordenboek', $('#dict-panel').style.display === 'flex')
  check('en nu kan vooruit wel', $('#btn-nav-forward').disabled === false)
  $('#btn-nav-back').click(); await tick(); await tick()
  check('nog een keer terug: het project', $('#main').style.display === 'flex')
  $('#btn-nav-forward').click(); await tick(); await tick()
  check('vooruit brengt je weer naar het woordenboek', $('#dict-panel').style.display === 'flex')

  // mappen in de verkenner tellen ook mee
  $$('.proj-item')[0].click(); await tick()
  $('[data-tab="browser"]').click(); await tick(); await tick()
  // de werkmap van dit project staat inmiddels op lib; eerst een niveau omhoog
  $('#br-path').value = 'C:\\a'
  $('#br-path').focus()
  $('#br-path').dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }))
  await tick(); await tick()
  $$('.br-item').find(el => el.textContent.includes('lib'))
    .dispatchEvent(new window.MouseEvent('dblclick', { bubbles: true })); await tick(); await tick()
  check('je staat in de submap', $('#br-path').value === 'C:\\a\\lib')
  $('#btn-nav-back').click(); await tick(); await tick()
  check('terug gaat naar de map erboven', $('#br-path').value === 'C:\\a')
  $('#btn-nav-forward').click(); await tick(); await tick()
  check('vooruit gaat weer de submap in', $('#br-path').value === 'C:\\a\\lib')

  // de zijknoppen van de muis
  $('[data-tab="browser"]').click(); await tick()
  window.dispatchEvent(new window.MouseEvent('mouseup', { button: 3 }))
  await tick(); await tick()
  check('de vorige-knop van de muis werkt', $('#br-path').value === 'C:\\a')
  window.dispatchEvent(new window.MouseEvent('mouseup', { button: 4 }))
  await tick(); await tick()
  check('de volgende-knop van de muis ook', $('#br-path').value === 'C:\\a\\lib')

  // Alt + pijltjes
  window.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'ArrowLeft', altKey: true }))
  await tick(); await tick()
  check('Alt+links doet hetzelfde', $('#br-path').value === 'C:\\a')

  // een nieuwe stap gooit de vooruit-geschiedenis weg
  $('#btn-nav-cmd').click(); await tick(); await tick()
  check('ergens anders heen wist het vooruit-spoor', $('#btn-nav-forward').disabled === true)

  // ── cd naar een map die niet bestaat ───────────────────────────────────────
  const cwdVoor = settings.cmd.cwd
  const nVoor = executed.length
  $('#term-input').value = 'cd bestaat-echt-niet'
  $('#term-run-btn').click(); await tick(); await tick(); await tick()
  check('cd naar een onbestaande map geeft een foutmelding',
    window.document.querySelector('#terminal .t-err') !== null &&
    window.document.querySelector('#terminal .t-err').textContent.includes('kan het opgegeven pad niet vinden'))
  check('de werkmap blijft ongewijzigd', settings.cmd.cwd === cwdVoor)
  check('en er wordt niets uitgevoerd', executed.length === nVoor)

  $('#term-input').value = 'cd C:\\a'
  $('#term-run-btn').click(); await tick(); await tick(); await tick()
  check('cd naar een map die wel bestaat werkt gewoon', settings.cmd.cwd === 'C:\\a')

  $('#term-input').value = 'cd sub'
  $('#term-run-btn').click(); await tick(); await tick(); await tick()
  check('een relatief pad wordt opgelost vanaf de huidige map', settings.cmd.cwd === 'C:\\a\\sub')

  // ── clear en exit worden door de app zelf afgehandeld ──────────────────────
  $('#term-input').value = 'echo iets'
  $('#term-run-btn').click(); await tick(); await tick()
  check('er staat uitvoer in de terminal', window.document.querySelector('#terminal').children.length > 1)

  const nClear = executed.length
  $('#term-input').value = 'clear'
  $('#term-run-btn').click(); await tick(); await tick()
  check('clear maakt de uitvoer leeg',
    window.document.querySelector('#terminal').innerHTML === '<span class="t-cursor"></span>')
  check('clear start geen shell-proces', executed.length === nClear)

  $('#term-input').value = 'echo nog iets'
  $('#term-run-btn').click(); await tick(); await tick()
  $('#term-input').value = 'cls'
  $('#term-run-btn').click(); await tick(); await tick()
  check('cls doet hetzelfde',
    window.document.querySelector('#terminal').innerHTML === '<span class="t-cursor"></span>')

  let afgesloten = false
  const echteClose = api.close
  api.close = () => { afgesloten = true }
  $('#term-input').value = 'exit'
  $('#term-run-btn').click(); await tick(); await tick()
  check('exit meldt dat de app sluit',
    window.document.querySelector('#terminal').textContent.includes('wordt afgesloten'))
  await new Promise(r => setTimeout(r, 350))
  check('exit sluit CommandDeck', afgesloten === true)
  api.close = echteClose

  // ── typen zonder klikken ───────────────────────────────────────────────────
  $('#term-input').blur()
  window.document.body.focus()
  window.document.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'g', bubbles: true, cancelable: true }))
  check('typen buiten het veld landt tóch in het commandoveld', $('#term-input').value === 'g')
  check('focus springt mee naar het commandoveld', window.document.activeElement.id === 'term-input')

  // ── pijltjes door de geschiedenis ──────────────────────────────────────────
  // veld realistisch leegmaken: dat sluit de autocomplete-lijst
  $('#term-input').value = ''
  $('#term-input').dispatchEvent(new window.Event('input'))
  check('autocomplete sluit bij leeg veld', $('#term-autocomplete').hidden === true)
  const up = () => $('#term-input').dispatchEvent(new window.KeyboardEvent('keydown', { key: 'ArrowUp', bubbles: true, cancelable: true }))
  up(); const h1 = $('#term-input').value
  up(); const h2 = $('#term-input').value
  check('pijltje omhoog haalt laatste commando op', h1 === 'git status')
  check('nog een keer omhoog = commando ervoor', h2 === 'flutter build apk --release')
  $('#term-input').dispatchEvent(new window.KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true, cancelable: true }))
  check('pijltje omlaag gaat terug', $('#term-input').value === 'git status')

  // ── woordenboek ────────────────────────────────────────────────────────────
  $('#btn-nav-dict').click(); await tick()
  check('woordenboek-paneel zichtbaar', $('#dict-panel').style.display === 'flex')
  check('cmd-paneel verstopt bij wisselen', $('#cmd-panel').style.display === 'none')
  check('geen terminal meer in de DOM', $$('#terminal').length === 0)
  check('alle 3 commando\'s in de lijst', $$('.dict-row').length === 3)
  check('zoekveld heeft direct focus', window.document.activeElement.id === 'dict-search')

  // zoeken
  const s = $('#dict-search'); s.value = 'apk'; s.dispatchEvent(new window.Event('input')); await tick()
  check('zoeken op commandotekst filtert', $$('.dict-row').length === 1)
  s.value = 'commit'; s.dispatchEvent(new window.Event('input')); await tick()
  check('zoeken vindt ook notities', $$('.dict-row').length === 1 && $('.dict-cmd').textContent === 'git status')
  s.value = 'web'; s.dispatchEvent(new window.Event('input')); await tick()
  check('zoeken vindt ook labels', $$('.dict-row').length === 1)
  s.value = ''; s.dispatchEvent(new window.Event('input')); await tick()

  // filteren per map
  const f = $('#dict-filter')
  check('mapfilter bevat beide mappen', $$('#dict-filter option').length === 4)
  f.value = 'cwd:C:\\b'; f.dispatchEvent(new window.Event('change')); await tick()
  check('filteren op map werkt', $$('.dict-row').length === 1)
  f.value = 'fav'; f.dispatchEvent(new window.Event('change')); await tick()
  check('filteren op favorieten werkt', $$('.dict-row').length === 1)
  f.value = 'all'; f.dispatchEvent(new window.Event('change')); await tick()

  // ── filteren op thema ──────────────────────────────────────────────────────
  // Naast de map kun je op de labels van de commando's filteren, meerdere tegelijk.
  check('er is een themaknop naast het mapfilter', !!$('#dict-thema'))
  check('het menu is dicht tot je erop klikt', $('#dict-thema-menu').hidden === true)
  $('#dict-thema').dispatchEvent(new window.MouseEvent('click', { bubbles: true })); await tick()
  check('klikken klapt het menu uit', $('#dict-thema-menu').hidden === false)
  check('de resetknop staat bovenaan',
    $('#dict-thema-menu').querySelector('button')?.id === 'thema-reset')

  const thema = (naam) => $(`#dict-thema-menu [data-thema="${naam}"]`)
  check('elk voorkomend label wordt een keuze', !!thema('tag:build') && !!thema('tag:web'))
  check('met hoeveel er onder vallen', $('#dict-thema-menu').textContent.includes('build'))
  check('en eigenschappen zoals favoriet staan er ook bij', !!thema('soort:fav'))
  check('soort cmd staat in het themamenu', !!thema('soort:cmd'))

  thema('tag:build').checked = true
  thema('tag:build').dispatchEvent(new window.Event('change')); await tick()
  check('filteren op één thema werkt', $$('.dict-row').length === 1)
  check('de knop laat zien waarop je filtert', $('#dict-thema-tekst').textContent === 'build')

  thema('tag:web').checked = true
  thema('tag:web').dispatchEvent(new window.Event('change')); await tick()
  check('twee thema\'s tegelijk toont allebei', $$('.dict-row').length === 2)
  check('de knop telt ze op', $('#dict-thema-tekst').textContent.includes('+'))

  // een eigenschap erbij: dan moet het aan allebei voldoen
  thema('soort:fav').checked = true
  thema('soort:fav').dispatchEvent(new window.Event('change')); await tick()
  check('een eigenschap erbij snijdt de lijst verder bij', $$('.dict-row').length === 1)

  $('#thema-reset').click(); await tick()
  check('reset zet alle thema\'s uit', $('#dict-thema-tekst').textContent === "alle thema's")
  check('en toont weer alles', $$('.dict-row').length === 3)

  // reset haalt ook het mapfilter en de zoekterm weg
  $('#dict-search').value = 'git'
  $('#dict-search').dispatchEvent(new window.Event('input')); await tick()
  $('#dict-filter').value = 'cwd:C:\\b'
  $('#dict-filter').dispatchEvent(new window.Event('change')); await tick()
  $('#dict-thema').dispatchEvent(new window.MouseEvent('click', { bubbles: true })); await tick()
  $('#thema-reset').click(); await tick()
  check('reset wist ook de zoekterm', $('#dict-search').value === '')
  check('en zet het mapfilter terug', $('#dict-filter').value === 'all')
  check('zodat alles weer in beeld is', $$('.dict-row').length === 3)

  window.document.dispatchEvent(new window.MouseEvent('mousedown', { bubbles: true }))
  await tick()
  check('naast het menu klikken sluit het', $('#dict-thema-menu').hidden === true)

  // sorteren
  const so = $('#dict-sort')
  so.value = 'used'; so.dispatchEvent(new window.Event('change')); await tick()
  check('sorteren op meest gebruikt', $$('.dict-cmd')[0].textContent === 'flutter build apk --release')
  so.value = 'alpha'; so.dispatchEvent(new window.Event('change')); await tick()
  check('alfabetisch sorteren', $$('.dict-cmd')[0].textContent === 'flutter build apk --release')
  so.value = 'recent'; so.dispatchEvent(new window.Event('change')); await tick()

  // favorieten staan altijd bovenaan, ongeacht de gekozen sortering
  const firstIsFav = () => $$('.dict-row')[0].querySelector('.dict-fav').classList.contains('on')
  check('favoriet bovenaan bij sorteren op laatst gebruikt', firstIsFav())
  check('sortering geldt binnen de niet-favorieten',
    $$('.dict-cmd')[1].textContent === 'git status')
  so.value = 'alpha'; so.dispatchEvent(new window.Event('change')); await tick()
  check('favoriet bovenaan bij alfabetisch sorteren', firstIsFav())
  so.value = 'used'; so.dispatchEvent(new window.Event('change')); await tick()
  check('favoriet bovenaan bij meest gebruikt', firstIsFav())
  so.value = 'recent'; so.dispatchEvent(new window.Event('change')); await tick()

  // favoriet togglen
  const before = store.entries.find(e => e.id === 'e2').favorite
  $$('[data-fav="e2"]')[0].click(); await tick(); await tick()
  check('favoriet aan/uit zetten wordt opgeslagen',
    store.entries.find(e => e.id === 'e2').favorite === !before)

  // uitvoeren vanuit het woordenboek, in een specifieke map
  const nBefore = executed.length
  $$('.dict-cwd[data-run="e1"]')[0].click(); await tick(); await tick()
  check('run vanuit woordenboek springt naar cmd-sectie', $('#cmd-panel').style.display === 'flex')
  check('run vanuit woordenboek gebruikt de aangeklikte map',
    executed.slice(nBefore).some(e => e.ran === 'flutter build apk --release' && e.cwd === 'C:\\a'))
  check('die map wordt de nieuwe werkmap', settings.cmd.cwd === 'C:\\a')

  // handmatig toevoegen
  $('#btn-nav-dict').click(); await tick()
  $('#dict-add').click(); await tick()
  check('modal opent met leeg commandoveld', $('#modal-dict').hidden === false && $('#d-cmd').value === '')
  check('cursor staat direct in het commandoveld', window.document.activeElement.id === 'd-cmd')
  check('nieuwe regel staat standaard op cmd', $('#d-shell input[value="cmd"]').checked === true)
  $('#d-cmd').value = 'docker compose up'; $('#d-label').value = 'Stack starten'
  $('#d-tags').value = 'docker, dev'; $('#d-fav').checked = true
  $('#modal-dict-save').click(); await tick(); await tick()
  const added = store.entries.find(e => e.cmd === 'docker compose up')
  check('handmatig commando toegevoegd', !!added)
  check('labels correct gesplitst', added && added.tags.join('|') === 'docker|dev')
  check('favoriet-vinkje overgenomen', added && added.favorite === true)
  check('nieuwe regel is een cmd-commando', added && added.shell === 'cmd')
  check('modal weer dicht', $('#modal-dict').hidden === true)

  // powershell-commando: merken en in de powershell-sectie draaien
  $('#dict-add').click(); await tick()
  $('#d-cmd').value = 'Get-HotFix'; $('#d-label').value = 'Geïnstalleerde hotfixes'
  $$('#d-shell input').forEach(r => { r.checked = r.value === 'powershell' })
  $('#d-fav').checked = true
  $('#modal-dict-save').click(); await tick(); await tick()
  const addedPs = store.entries.find(e => e.cmd === 'Get-HotFix')
  check('powershell-keuze is opgeslagen', addedPs && addedPs.shell === 'powershell')
  check('woordenboek toont dat het powershell is',
    [...$$('.dict-row')].some(r => r.textContent.includes('Get-HotFix') && r.textContent.includes('powershell')))
  const nPsDict = executed.length
  const psDictRow = [...$$('.dict-row')].find(r => r.textContent.includes('Get-HotFix'))
  psDictRow.querySelector('[data-run]').click(); await tick(); await tick()
  check('run van een powershell-regel opent powershell', $('#ps-panel').style.display === 'flex')
  check('en draait via powershell',
    executed.slice(nPsDict).some(e => e.ran === 'Get-HotFix' && e.shell === 'powershell'))
  $('#btn-nav-cmd').click(); await tick()
  check('powershell-favoriet zit niet bij de cmd-snelkoppelingen',
    !$$('#cmd-panel [data-quick]').some(b => b.textContent.includes('Geïnstalleerde hotfixes')))
  $('#btn-nav-ps').click(); await tick()
  check('wel bij de powershell-snelkoppelingen',
    $$('#ps-snel-grid [data-ps-cmd]').some(b => b.dataset.psCmd === 'Get-HotFix'))
  $('#btn-nav-dict').click(); await tick()
  $('#dict-thema').dispatchEvent(new window.MouseEvent('click', { bubbles: true })); await tick()
  check('soort powershell staat in het themamenu', !!$(`#dict-thema-menu [data-thema="soort:ps"]`))
  $('#thema-reset').click(); await tick()

  // bewerken
  $$('[data-edit="e3"]')[0].click(); await tick()
  check('bewerken vult bestaande waarden in', $('#d-cmd').value === 'npm run build' && $('#d-label').value === 'Frontend')
  $('#d-note').value = 'nieuwe notitie'
  $('#modal-dict-save').click(); await tick(); await tick()
  check('bewerking opgeslagen', store.entries.find(e => e.id === 'e3').note === 'nieuwe notitie')

  // verwijderen
  $$('[data-del="e3"]')[0].click(); await tick(); await tick()
  check('verwijderen werkt', !store.entries.some(e => e.id === 'e3'))

  // ── instellingen ───────────────────────────────────────────────────────────
  $('#btn-settings').click(); await tick()
  check('instellingen zichtbaar', $('#settings-panel').style.display === 'flex')
  check('woordenboek-paneel verstopt', $('#dict-panel').style.display === 'none')
  check('onthouden-schakelaar aanwezig', !!$('#hist-enabled') && $('#hist-enabled').checked === true)
  check('bewaren-na-afsluiten staat standaard aan', $('#hist-persist').checked === true)
  check('aantallen ingevuld', $('#hist-max-recent').value === '300' && $('#hist-max-entries').value === '2000')

  $('#hist-persist').checked = false
  $('#hist-max-recent').value = '50'
  $('#settings-save').click(); await tick(); await tick()
  check('alleen-deze-sessie opgeslagen', settings.history.persist === false)
  check('aangepast aantal opgeslagen', settings.history.maxRecent === 50)
  check('editors niet stukgemaakt door opslaan', !!(settings.editors && settings.editors.cursor))

  $('#hist-clear-recent').click(); await tick(); await tick()
  check('geschiedenis wissen laat woordenboek staan', store.recent.length === 0 && store.entries.length > 0)

  // ── git-profielen ──────────────────────────────────────────────────────────
  // Wie ben je in de commit. Zonder profielen laat de app je identiteit met
  // rust; dat is de toestand waar de meeste mensen in blijven zitten en die
  // hoort dus geen lege lijst met vraagtekens te zijn.
  check('zonder profielen staat er uitleg en geen lege lijst',
    !!$('#git-profiel-lijst .hint-row') && $$('.git-profiel-rij').length === 0)
  check('de eerlijke uitleg over "elke keer vragen" staat erbij',
    $('#settings-panel').textContent.includes('geen beveiliging'))

  $('#btn-add-git-profiel').click(); await tick()
  check('profiel toevoegen geeft een rij', $$('.git-profiel-rij').length === 1)
  check('de eerste is meteen de standaard', $('[data-gp-std]').checked === true)
  check('een leeg profiel is zichtbaar onaf',
    !!$('.git-profiel-rij.onaf') && !!$('.git-profiel-onaf'))
  check('en is bewaard in de instellingen', (settings.git.profielen || []).length === 1)

  const gpId = settings.git.profielen[0].id
  const vulGp = (attr, waarde) => {
    const el = $(`[data-gp-${attr}="${gpId}"]`)
    el.value = waarde
    el.dispatchEvent(new window.Event('change'))
  }
  vulGp('naam', 'Jan Jansen'); await tick()
  check('alleen een naam is nog steeds onaf', !!$('.git-profiel-rij.onaf'))
  vulGp('email', 'geen-adres'); await tick()
  check('een adres zonder apenstaartje telt niet', !!$('.git-profiel-rij.onaf'))
  vulGp('email', 'jan@werk.nl'); await tick()
  check('met naam én adres is het profiel af', !$('.git-profiel-rij.onaf'))
  check('en het staat zo in de instellingen',
    settings.git.profielen[0].naam === 'Jan Jansen' && settings.git.profielen[0].email === 'jan@werk.nl')

  vulGp('gh', 'jan-werk'); await tick()
  vulGp('inlog', 'vragen'); await tick()
  check('github-naam en inloggedrag worden bewaard',
    settings.git.profielen[0].ghGebruiker === 'jan-werk' && settings.git.profielen[0].inloggen === 'vragen')

  // Het projectvenster gaat over het project, niet over wie je bent: de
  // profielkeuze hoort hier niet meer te staan. Wat er wél aan hangt blijft
  // staan als je het project bewerkt — anders raak je het kwijt met opslaan.
  W.__test.zetProjectProfiel(0, gpId)
  $('#btn-settings').click(); await tick()
  $$('.proj-edit')[0].click(); await tick()
  check('er staat geen profielkeuze meer in het projectvenster',
    !$('#f-profiel-rij') && !$('#f-profiel'))
  $('#modal-proj-save').click(); await tick(); await tick()
  check('en opslaan laat het profiel van het project met rust',
    projects[0].gitProfiel === gpId)

  // Weghalen: het profiel verdwijnt en het project valt terug op de standaard.
  $('#btn-settings').click(); await tick()
  $(`[data-gp-del="${gpId}"]`).click(); await tick(); await tick(); await tick()
  check('profiel verwijderd', (settings.git.profielen || []).length === 0)
  check('en het project wijst nergens meer naartoe', !projects[0].gitProfiel)
  // Het paneel blijft hier open staan: de controle hieronder sluit hem.

  // terug naar waar je vandaan kwam
  $('#btn-settings').click(); await tick()
  check('instellingen sluiten keert terug naar vorige weergave', $('#dict-panel').style.display === 'flex')

  // ── project blijft werken ──────────────────────────────────────────────────
  $$('.proj-item')[0].click(); await tick()
  check('project openen werkt nog', $('#main').style.display === 'flex')
  check('terminal terug in projectweergave', $$('#terminal').length === 1)
  const n2 = executed.length
  $$('.cmd-btn[data-cmd="pub-get"]')[0].click(); await tick(); await tick()
  check('knop-commando draait in de projectmap',
    executed.slice(n2).some(e => e.ran === 'flutter pub get' && e.cwd === 'C:\\a'))
  check('knop-commando komt ook in de geschiedenis',
    executed.slice(n2).some(e => e.cmd === 'flutter pub get' && e.source === 'button'))

  // ── eigen commando's als knop ────────────────────────────────────
  $('#btn-nav-dict').click(); await tick()
  const addBtn = $$('[data-addbtn]')[0]
  check('woordenboek heeft een knop om toe te voegen', !!addBtn)
  addBtn.click(); await tick()
  check('modal opent met het juiste commando', $('#modal-addbtn').hidden === false && $('#addbtn-cmd').textContent.length > 0)
  check('projectkeuze gevuld', $$('#addbtn-proj option').length === 1)
  check('knoptekst voorgevuld', $('#addbtn-label').value.length > 0)

  const chosenCmd = $('#addbtn-cmd').textContent
  $('#addbtn-label').value = 'Mijn knop'
  $('#modal-addbtn-save').click(); await tick(); await tick()
  check('modal sluit na toevoegen', $('#modal-addbtn').hidden === true)

  $$('.proj-item')[0].click(); await tick()
  const customBtns = $$('.cmd-btn[data-custom]')
  check('eigen knop verschijnt in de projectweergave', customBtns.length === 1)
  check('eigen knop heeft de gekozen tekst', customBtns[0].textContent.includes('Mijn knop'))
  check('en staat in de enige knoppenrij die er is',
    $$('.cmd-section').length === 1 && !!$('.cmd-section .cmd-btn[data-custom]'))

  const nCustom = executed.length
  customBtns[0].click(); await tick(); await tick()
  check('eigen knop voert het juiste commando uit',
    executed.slice(nCustom).some(e => e.ran === chosenCmd))

  // dubbel toevoegen wordt geweigerd
  $('#btn-nav-dict').click(); await tick()
  $$('[data-addbtn]')[0].click(); await tick()
  $('#modal-addbtn-save').click(); await tick(); await tick()
  $$('.proj-item')[0].click(); await tick()
  check('zelfde commando komt er niet twee keer bij', $$('.cmd-btn[data-custom]').length === 1)

  // verwijderen via projectinstellingen
  $$('.proj-edit')[0].click(); await tick()
  check('eigen knop staat in de projectinstellingen', $$('[data-del-custom]').length === 1)
  $$('[data-del-custom]')[0].click(); await tick()
  check('rij verdwijnt uit de instellingen', $$('[data-del-custom]').length === 0)
  $('#modal-proj-save').click(); await tick(); await tick()
  check('eigen knop is weg uit de projectweergave', $$('.cmd-btn[data-custom]').length === 0)

  // ── standaardcommando's en fragmenten ──────────────────────────────────────
  // een ingrijpend commando dat via de aanvulling binnenkomt
  store.entries.push({ id: 'gevaar1', cmd: 'format D: /fs:ntfs /q', label: 'Schijf formatteren',
    note: 'Wist alles op die letter.', tags: ['systeem'], favorite: false, snippet: false,
    danger: true, template: true, source: 'builtin', firstRun: 1, lastRun: null, runCount: 0, cwds: [] })

  $('#btn-settings').click(); await tick()
  check('knop om standaardcommando\'s aan te vullen', !!$('#hist-seed'))
  const voorSeed = store.entries.length
  $('#hist-seed').click(); await tick(); await tick(); await tick()
  check('aanvullen voegt commando\'s toe', store.entries.length === voorSeed + 1)
  check('de teller in de zijbalk loopt mee',
    $('#nav-dict-count').textContent === String(store.entries.length))
  $('#btn-settings').click(); await tick()

  $('#btn-nav-dict').click(); await tick()
  $('#dict-search').value = 'echo off'
  $('#dict-search').dispatchEvent(new window.Event('input')); await tick()
  check('het aangevulde fragment staat in het woordenboek', $$('.dict-row').length === 1)
  check('het is herkenbaar als fragment', !!$('.dict-snippet'))
  $('#dict-search').value = 'echo off'
  $('#dict-search').dispatchEvent(new window.Event('input')); await tick()
  check('een fragment heeft geen uitvoerknop', $$('.dict-row [data-run]').length === 0)
  check('en geen mapkoppelingen', $$('.dict-row .dict-cwds').length === 0)
  check('kopiëren kan wel', $$('.dict-row [data-copy]').length === 1)
  check('als knop toevoegen kan bij een fragment ook niet', $$('.dict-row [data-addbtn]').length === 0)
  check('de uitleg is doorzoekbaar', (() => {
    $('#dict-search').value = 'meeprinten'
    $('#dict-search').dispatchEvent(new window.Event('input'))
    return $$('.dict-row').length === 1
  })())

  $('#dict-search').value = 'git status'
  $('#dict-search').dispatchEvent(new window.Event('input')); await tick()
  check('een gewoon commando heeft wél een uitvoerknop', $$('.dict-row [data-run]').length >= 1)

  $('#dict-search').value = 'formatteren'
  $('#dict-search').dispatchEvent(new window.Event('input')); await tick()
  check('een ingrijpend commando krijgt een waarschuwingslabel', !!$('.dict-danger'))
  check('een sjabloon is als zodanig gemarkeerd', !!$('.dict-template'))
  check('een sjabloon heeft geen uitvoerknop', $$('.dict-row [data-run]').length === 0)
  check('en ook geen knop om het als projectknop vast te zetten',
    $$('.dict-row [data-addbtn]').length === 0)
  check('kopiëren en bewerken kan nog wel',
    $$('.dict-row [data-copy]').length === 1 && $$('.dict-row [data-edit]').length === 1)
  // een ingrijpend commando dat je wél zo kunt draaien, vraagt eerst
  store.entries.push({ id: 'gevaar2', cmd: 'shutdown /r /t 0', label: 'Nu opnieuw opstarten',
    note: 'Herstart meteen.', tags: ['systeem'], favorite: false, snippet: false,
    danger: true, template: false, source: 'builtin', firstRun: 1, lastRun: null, runCount: 0, cwds: [] })
  $('#btn-settings').click(); await tick()
  $('#hist-seed').click(); await tick(); await tick(); await tick()
  $('#btn-settings').click(); await tick()
  $('#btn-nav-dict').click(); await tick()
  $('#dict-search').value = 'opnieuw opstarten'
  $('#dict-search').dispatchEvent(new window.Event('input')); await tick()
  check('een ingrijpend maar draaibaar commando heeft wél een uitvoerknop',
    $$('.dict-row [data-run]').length === 1)
  laatsteVraag = null; kiesKnop('annuleren')
  $$('.dict-row [data-run]')[0].click(); await tick(); await tick()
  kiesKnop('')
  check('en vraagt eerst om bevestiging voordat het draait',
    !!laatsteVraag && laatsteVraag.alles.includes('grijpt diep in'))
  $('#dict-search').value = ''
  $('#dict-search').dispatchEvent(new window.Event('input')); await tick()

  // ── powershell-sectie ───────────────────────────────────────────────────────
  $('#btn-nav-ps').click(); await tick()
  check('powershell-paneel zichtbaar', $('#ps-panel').style.display === 'flex')
  check('cmd-paneel verstopt bij wisselen', $('#cmd-panel').style.display === 'none')
  check('onthouden werkmap staat voorgeselecteerd', $('#ps-cwd-select').value === 'C:\\a')
  check('powershell heeft een snelkoppelingen-rij', !!$('#ps-snel-grid'))
  check('Get-ChildItem staat in de powershell-rij',
    $$('#ps-snel-grid [data-ps-cmd]').some(b => b.dataset.psCmd === 'Get-ChildItem'))
  check('de knop toont de powershell-naam',
    $$('#ps-snel-grid [data-ps-cmd]').some(b => b.textContent.includes('Bestanden in deze map')))
  check('cmd-favoriet zit niet in de powershell-rij',
    !$('#ps-snel-grid').textContent.includes('Release APK'))
  executed.length = 0
  $$('#ps-snel-grid [data-ps-cmd]').find(b => b.dataset.psCmd === 'Get-ChildItem').click()
  await tick(); await tick()
  check('powershell-snelkoppeling draait via powershell',
    executed.some(e => e.ran === 'Get-ChildItem' && e.cwd === 'C:\\a' && e.shell === 'powershell'))
  executed.length = 0
  $('#term-input').value = 'Get-Date'
  $('#term-run-btn').click(); await tick(); await tick()
  check('powershell-commando draait via powershell',
    executed.some(e => e.ran === 'Get-Date' && e.cwd === 'C:\\a' && e.shell === 'powershell'))
  check('uitvoering hoort bij de powershell-sectie',
    executed.some(e => e.cmd === 'Get-Date' && e.projectId === '__ps__'))

  executed.length = 0
  $('#term-input').value = 'Get-ChildItem C:\\ -Recurse |\nWhere-Object { $_.Length -gt 1MB } |\nSelect-Object FullName, Length'
  $('#term-run-btn').click(); await tick(); await tick()
  check('meerregelige powershell blijft één opdracht',
    executed.filter(e => e.ran).length === 1)
  check('de pipe-vervolgregels zitten in die opdracht',
    executed.some(e => e.ran && e.ran.includes('Where-Object') && e.ran.includes('Select-Object')))

  executed.length = 0
  $('#term-input').value = 'Get-ChildItem |'
  $('#term-run-btn').click(); await tick()
  check('onvolledige pipeline wordt niet verstuurd', !executed.some(e => e.ran))
  check('de tekst blijft staan', $('#term-input').value.includes('Get-ChildItem |'))
  check('prompt wordt >> zolang het script openstaat',
    $('.term-input-prompt').textContent === '>>')

  const nPsCd = executed.length
  $('#term-input').value = 'Set-Location C:\\gekozen'
  $('#term-run-btn').click(); await tick(); await tick(); await tick()
  check('Set-Location verzet de powershell-werkmap', settings.ps.cwd === 'C:\\gekozen')
  check('Set-Location start geen powershell-proces',
    !executed.slice(nPsCd).some(e => e.ran && /set-location/i.test(e.ran)))
  check('nieuwe powershell-werkmap staat in de dropdown', $('#ps-cwd-select').value === 'C:\\gekozen')

  check('AI-knoppen staan in de powershell-rij',
    $$('#ps-snel-grid [data-ai-dienst]').length > 0)
  check('cmd-favoriet zit nog steeds niet in de powershell-rij',
    !$('#ps-snel-grid').textContent.includes('Release APK'))
  const psAi = $$('#ps-snel-grid [data-ai-dienst]').find(b => b.dataset.aiDienst === 'openai')
  check('OpenAI staat in de powershell-rij', !!psAi)
  if (psAi) { psAi.click(); await tick(); await tick(); await tick() }
  check('AI-knop op powershell gaat in gesprek',
    !!psAi && psAi.classList.contains('ai-actief'))
  const psShell = $('#ps-snel-grid [data-ai-uit]')
  check('shell-knop verschijnt tijdens het gesprek', !!psShell && !psShell.hidden)
  if (psShell) { psShell.click(); await tick(); await tick() }
  check('shell-knop zet powershell terug',
    !!psAi && !psAi.classList.contains('ai-actief'))

  $('#nav-ps-edit').click(); await tick()
  check('potlood opent powershell-instellingen', $('#modal-psset').hidden === false)
  check('standaard is powershell.exe', $('#ps-exe-powershell').checked === true)
  check('zonder profiel staat aan', $('#ps-noprofile').checked === true)
  check('policy is zoals het systeem', $('#ps-exec-policy').value === '')
  check('snelkoppelingen staan in de instellingen',
    $$('#psset-body [data-ps-snel-aan]').length > 0)
  $$('#ps-exe input').forEach(r => { r.checked = r.value === 'pwsh' })
  $('#ps-exe-pwsh').dispatchEvent(new window.Event('change')); await tick()
  check('pwsh is opgeslagen', settings.ps.exe === 'pwsh')
  $('#ps-noprofile').checked = false
  $('#ps-noprofile').dispatchEvent(new window.Event('change')); await tick()
  check('profiel uitzetten is opgeslagen', settings.ps.noProfile === false)
  $('#ps-exec-policy').value = 'Bypass'
  $('#ps-exec-policy').dispatchEvent(new window.Event('change')); await tick()
  check('bypass is opgeslagen', settings.ps.executionPolicy === 'Bypass')
  $('#modal-psset-klaar').click(); await tick()
  check('instellingen gaan dicht', $('#modal-psset').hidden === true)
  settings.ps.exe = 'powershell'
  settings.ps.noProfile = true
  settings.ps.executionPolicy = ''

  // ── bat-sectie ─────────────────────────────────────────────────────────────
  batFiles = {}; batMtimes = {}

  check('bat-knop staat in de zijbalk', !!$('#btn-nav-bat'))
  check('powershell staat onder cmd',
    html.indexOf('btn-nav-cmd') < html.indexOf('btn-nav-ps'))
  check('bat staat onder powershell',
    html.indexOf('btn-nav-ps') < html.indexOf('btn-nav-bat'))
  check('woordenboek staat onder bat',
    html.indexOf('btn-nav-bat') < html.indexOf('btn-nav-dict'))

  $$('.proj-item')[0].click(); await tick()
  const projMap = 'C:\\a'

  $('#btn-nav-bat').click(); await tick(); await tick()
  check('bat-paneel verschijnt', $('#bat-panel').style.display === 'flex')
  check('projectpaneel verstopt', $('#main').style.display === 'none')
  check('eerste keer valt hij terug op de projectmap', $('#bat-cwd-select').value === projMap)
  check('editor staat er meteen', !!$('#bat-content') && $('#bat-content').value.includes('@echo off'))
  check('cursor staat in het tekstvak', window.document.activeElement.id === 'bat-content')
  check('lege map meldt dat netjes', $('#bat-file-list').textContent.includes('geen bat-bestanden') ||
    $('#bat-files-head').textContent.includes('geen bat-bestanden'))

  // opslaan vanuit de sectie
  $('#bat-content').value = 'echo eerste script'
  $('#bat-content').dispatchEvent(new window.Event('input'))
  $('#bat-name').value = 'eerste'
  $('#bat-name').dispatchEvent(new window.Event('input'))
  $('#bat-save').click(); await tick(); await tick(); await tick()
  const eerste = projMap + '\\eerste.bat'
  check('opslaan werkt vanuit de sectie', batFiles[eerste] === 'echo eerste script')
  check('bestand verschijnt in de lijst', $$('.bat-file').length === 1)
  check('en is aangemerkt als het geopende bestand', $$('.bat-file.active').length === 1)
  check('de titel toont nu de bestandsnaam', $('#bat-edit-title').textContent.includes('eerste.bat'))
  check('paneel blijft open na opslaan', $('#bat-panel').style.display === 'flex')

  // tweede bestand + wisselen
  $('#bat-new').click(); await tick()
  check('nieuw bestand geeft een vers sjabloon',
    $('#bat-content').value.includes('@echo off') && $('#bat-edit-title').textContent.includes('nieuw'))
  $('#bat-content').value = 'echo tweede'
  $('#bat-content').dispatchEvent(new window.Event('input'))
  $('#bat-name').value = 'tweede.bat'
  $('#bat-name').dispatchEvent(new window.Event('input'))
  $('#bat-save').click(); await tick(); await tick(); await tick()
  check('tweede bestand opgeslagen', $$('.bat-file').length === 2)

  // klikken op een rij opent dat bestand
  const rijEerste = $$('.bat-file').find(r => r.textContent.includes('eerste.bat'))
  rijEerste.click(); await tick(); await tick()
  check('rij aanklikken opent het bestand', $('#bat-content').value === 'echo eerste script')
  check('de juiste rij is gemarkeerd',
    $$('.bat-file.active')[0].textContent.includes('eerste.bat'))

  // bewerking blijft bewaard bij wisselen van weergave
  $('#bat-content').value = 'echo tussentijds gewijzigd'
  $('#bat-content').dispatchEvent(new window.Event('input'))
  $('#btn-nav-cmd').click(); await tick()
  $('#btn-nav-bat').click(); await tick(); await tick()
  check('bewerking overleeft het wisselen van sectie',
    $('#bat-content').value === 'echo tussentijds gewijzigd')
  check('en is nog steeds niet opgeslagen', batFiles[eerste] === 'echo eerste script')

  // externe wijziging
  batFiles[eerste] = 'echo EXTERN AANGEPAST'
  batMtimes[eerste] = (batMtimes[eerste] || 1) + 5
  window.dispatchEvent(new window.Event('focus')); await tick(); await tick(); await tick()
  check('externe wijziging waarschuwt bij eigen aanpassingen',
    $('#bat-warn').hidden === false && $('#bat-content').value === 'echo tussentijds gewijzigd')

  $('#bat-reload').click(); await tick(); await tick()
  check('herladen haalt de externe versie op', $('#bat-content').value === 'echo EXTERN AANGEPAST')

  // proefdraaien zonder opslaan
  testRuns = []
  $('#bat-content').value = 'echo proef'
  $('#bat-content').dispatchEvent(new window.Event('input'))
  $('#bat-test').click(); await tick(); await tick()
  check('proefdraaien gebruikt de huidige tekst',
    testRuns.length === 1 && testRuns[0].content === 'echo proef')
  check('proefdraaien gebruikt de map van de sectie', testRuns[0].dir === projMap)
  check('er is niets opgeslagen', batFiles[eerste] === 'echo EXTERN AANGEPAST')

  // een bestand draaien vanuit de lijst
  testRuns = []
  $$('[data-run-file]')[0].click(); await tick(); await tick()
  check('draaien vanuit de lijst roept het bestand aan met call',
    testRuns.length === 1 && testRuns[0].content.startsWith('call "'))

  // verwijderen vanuit de lijst
  const aantalVoor = $$('.bat-file').length
  $$('[data-del-file]').find(b => b.dataset.delFile.includes('tweede')).click(); await tick(); await tick(); await tick()
  check('verwijderen haalt het bestand van schijf', batFiles[projMap + '\\tweede.bat'] === undefined)
  check('en uit de lijst', $$('.bat-file').length === aantalVoor - 1)

  // eigen map onthouden, los van het project
  pickedFolder = 'C:\\tools\\scripts'
  $('#bat-pick-dir').click(); await tick(); await tick(); await tick()
  check('gekozen map wordt onthouden', settings.batCwd === 'C:\\tools\\scripts')
  check('paneel toont de nieuwe map', $('#bat-cwd-select').value === 'C:\\tools\\scripts')
  check('projectmappen staan als snelkoppeling in de kiezer',
    $$('#bat-cwd-select option').some(o => o.value === projMap))

  // ander project openen mag de bat-map niet verslepen
  $$('.proj-item')[0].click(); await tick()
  $('#btn-nav-bat').click(); await tick(); await tick()
  check('bat-map blijft staan als je een project opent', $('#bat-cwd-select').value === 'C:\\tools\\scripts')

  // knop in de terminalbalk als snelkoppeling
  $('#btn-nav-cmd').click(); await tick()
  $('#term-input').value = 'flutter build apk --release'
  $('#btn-bat').click(); await tick(); await tick()
  check('bat-knop in de terminal opent de sectie', $('#bat-panel').style.display === 'flex')
  check('en neemt het getypte commando mee',
    $('#bat-content').value.includes('flutter build apk --release'))
  check('met een voorgestelde bestandsnaam', $('#bat-name').value === 'flutter-build-apk-release.bat')

  // opties
  check('opties staan in het paneel', !!$('#bo-pause') && !!$('#bo-admin'))
  $('#bo-admin').checked = true
  $('#bo-admin').dispatchEvent(new window.Event('change')); await tick(); await tick()
  check('optie past het sjabloon aan', $('#bat-content').value.includes('RunAs'))
  check('keuze wordt onthouden', settings.bat.admin === true)
  $('#bo-admin').checked = false
  $('#bo-admin').dispatchEvent(new window.Event('change')); await tick(); await tick()

  // zonder venster draaien
  check('optie zonder venster staat in het paneel', !!$('#bo-hidden'))
  check('pauze-opties zijn normaal bruikbaar', $('#bo-pause').disabled === false)
  $('#bo-hidden').checked = true
  $('#bo-hidden').dispatchEvent(new window.Event('change')); await tick(); await tick()
  check('zonder venster zet geen zelf-herstart in het script',
    !$('#bat-content').value.includes('_verborgen'))
  check('er komt geen hintblok meer bij', !$('#bat-hidden-hint'))
  check('pauze-opties worden uitgezet', $('#bo-pause').checked === false && $('#bo-pause').disabled === true)
  check('en er wordt niet gepauzeerd', !$('#bat-content').value.split(':mislukt')[0].includes('\r\npause'))
  $('#bo-hidden').checked = false
  $('#bo-hidden').dispatchEvent(new window.Event('change')); await tick(); await tick()
  check('uitzetten maakt de pauze-opties weer bruikbaar', $('#bo-pause').disabled === false)

  // inhoud behouden bij het omzetten van een optie
  $('#bat-content').value = '@echo off\r\n:: eigen commentaar\r\ntaskkill /f /im iets.exe\r\nexit'
  $('#bat-content').dispatchEvent(new window.Event('input'))
  $('#bo-timer').checked = true
  $('#bo-timer').dispatchEvent(new window.Event('change')); await tick(); await tick()
  check('eigen commando blijft na een optiewijziging', $('#bat-content').value.includes('taskkill /f /im iets.exe'))
  check('eigen commentaar blijft ook', $('#bat-content').value.includes(':: eigen commentaar'))
  check('en de optie is toegepast', $('#bat-content').value.includes('_START'))
  $('#bo-timer').checked = false
  $('#bo-timer').dispatchEvent(new window.Event('change')); await tick(); await tick()
  check('en weer terug zonder verlies',
    $('#bat-content').value.includes('taskkill /f /im iets.exe') && !$('#bat-content').value.includes('_START'))

  $('#bat-regen').click(); await tick(); await tick()
  check('sjabloon opnieuw opbouwen vraagt niets meer en behoudt de inhoud',
    $('#bat-content').value.includes('taskkill /f /im iets.exe'))
  $('#bo-hidden').checked = false
  $('#bo-hidden').dispatchEvent(new window.Event('change')); await tick(); await tick()
  $('#bo-pause').checked = true
  $('#bo-pause').dispatchEvent(new window.Event('change')); await tick(); await tick()

  // bestanden laten uitvoeren
  $('#bat-content').value = 'flutter build apk --release'
  $('#bat-content').dispatchEvent(new window.Event('input'))
  check('lijst met uit te voeren bestanden is standaard verborgen', $('#bat-runfiles').hidden === true)
  pickedRunFiles = ['C:\\tools\\opruimen.bat', 'C:\\tools\\rapport.exe']
  $('#bo-add-run').click(); await tick(); await tick(); await tick()
  check('gekozen bestanden verschijnen in een lijst', $$('.bat-runfile').length === 2)
  check('bat-bestand wordt met call aangeroepen',
    $('#bat-content').value.includes('call "C:\\tools\\opruimen.bat"'))
  check('exe wordt direct aangeroepen', $('#bat-content').value.includes('"C:\\tools\\rapport.exe"'))
  check('het getypte commando staat er nog steeds',
    $('#bat-content').value.includes('flutter build apk --release'))
  $$('[data-del-run]')[0].click(); await tick(); await tick()
  check('verwijderen haalt het uit de lijst en het sjabloon',
    $$('.bat-runfile').length === 1 && !$('#bat-content').value.includes('opruimen.bat'))

  // slepen opent de sectie
  $('#btn-nav-cmd').click(); await tick()
  const sleep = (paden) => {
    const ev = new window.Event('drop', { bubbles: true, cancelable: true })
    ev.dataTransfer = { files: paden.map(p => ({ __pad: p })), items: [], types: ['Files'] }
    window.document.dispatchEvent(ev)
  }
  const sleepOver = () => {
    const ev = new window.Event('dragenter', { bubbles: true, cancelable: true })
    ev.dataTransfer = { items: [{ kind: 'file' }], types: ['Files'] }
    window.document.dispatchEvent(ev)
  }
  check('overlay is standaard verborgen', $('#drop-overlay').hidden === true)
  sleepOver(); await tick()
  check('overlay verschijnt tijdens slepen', $('#drop-overlay').hidden === false)

  window.confirm = () => true
  sleep([eerste]); await tick(); await tick(); await tick(); await tick()
  check('overlay verdwijnt na loslaten', $('#drop-overlay').hidden === true)
  check('gesleept bestand opent de bat-sectie', $('#bat-panel').style.display === 'flex')
  check('met de inhoud van dat bestand', $('#bat-content').value === 'echo EXTERN AANGEPAST')
  check('en springt naar de map van dat bestand', settings.batCwd === projMap)

  $('#btn-nav-cmd').click(); await tick()
  sleep(['C:\\a\\plaatje.png']); await tick(); await tick()
  check('ander bestandstype opent de sectie niet', $('#cmd-panel').style.display === 'flex')

  // ── exporteren naar snelkoppeling en exe ───────────────────────────────────
  $('#btn-nav-bat').click(); await tick(); await tick()
  check('exe-knop staat rechtsonder naast proefdraaien', !!$('#bat-exe') &&
    $('#bat-exe').closest('.bat-edit-foot') === $('#bat-test').closest('.bat-edit-foot'))
  check('snelkoppeling-knop is weg', !$('#bat-lnk'))

  // opslaan is niet nodig: de inhoud van de editor gaat rechtstreeks mee
  madeExes = []
  $('#bat-content').value = 'echo nog niet opgeslagen'
  $('#bat-content').dispatchEvent(new window.Event('input'))
  $('#bat-name').value = 'nooit-opgeslagen'
  $('#bat-name').dispatchEvent(new window.Event('input'))
  laatsteVraag = null
  saveAsPath = undefined
  $('#bat-exe').click(); await tick(); await tick(); await tick()
  check('eerste keer wordt uitgelegd wat een exe hier wel en niet is',
    !!laatsteVraag && laatsteVraag.alles.includes('wrapper'))
  check('uitleg wordt onthouden', settings.batExeWarned === true)
  check('exe maken werkt zonder opslaan', madeExes.length === 1)
  check('de inhoud van de editor gaat mee, niet een bestand',
    madeExes[0].content === 'echo nog niet opgeslagen' && !madeExes[0].batPath)
  check('de naam uit het veld bepaalt de exe-naam',
    madeExes[0].exePath.endsWith('nooit-opgeslagen.exe'))
  check('er is niets opgeslagen op schijf', batFiles[batCwd2() + '\\nooit-opgeslagen.bat'] === undefined)

  // leeg wordt wel geweigerd
  madeExes = []
  $('#bat-content').value = '   '
  $('#bat-content').dispatchEvent(new window.Event('input'))
  $('#bat-exe').click(); await tick(); await tick()
  check('een leeg script wordt niet ingepakt',
    madeExes.length === 0 && $('#bat-warn').hidden === false)

  $('#bat-content').value = 'echo iets'
  $('#bat-content').dispatchEvent(new window.Event('input'))
  $('#bat-name').value = 'export-test.bat'
  $('#bat-name').dispatchEvent(new window.Event('input'))
  $('#bat-save').click(); await tick(); await tick(); await tick()
  const exportBat = batCwd2() + '\\export-test.bat'
  saveAsPath = undefined

  madeExes = []
  laatsteVraag = null
  $('#bat-exe').click(); await tick(); await tick(); await tick()
  check('daarna komt die uitleg niet meer terug',
    !laatsteVraag || !laatsteVraag.alles.includes('wrapper'))
  check('exe wordt gemaakt', madeExes.length === 1)
  check('met de inhoud uit de editor', typeof madeExes[0].content === 'string')
  check('met .exe als doel', madeExes[0].exePath.endsWith('export-test.exe'))
  check('icoon-optie staat bij de opties', !!$('#bo-icon'))
  check('en staat standaard aan', $('#bo-icon').checked === true)

  pickedIcon = 'C:\\iconen\\mijn.ico'
  window.confirm = () => true
  $('#bat-exe').click(); await tick(); await tick(); await tick()
  check('tweede keer nog steeds geen uitleg', madeExes.length === 2)
  check('met de optie aan komt de kiezer meteen, zonder tussenvraag',
    madeExes[1].iconPath === 'C:\\iconen\\mijn.ico')
  check('en er wordt gemeld dat het icoon erin zit',
    $('#bat-warn').textContent.includes('4 formaten') && $('#bat-warn').textContent.includes('ververst'))

  // optie uit: overslaan zonder iets te vragen
  $('#bo-icon').checked = false
  $('#bo-icon').dispatchEvent(new window.Event('change')); await tick(); await tick()
  check('uitzetten wordt onthouden', settings.bat.icon === false)
  $('#bat-exe').click(); await tick(); await tick(); await tick()
  check('met de optie uit wordt het icoon overgeslagen', madeExes[2].iconPath === null)
  check('en komt er geen icoonmelding', !$('#bat-warn').textContent.includes('formaten'))
  $('#bo-icon').checked = true
  $('#bo-icon').dispatchEvent(new window.Event('change')); await tick(); await tick()

  // afgebroken opslaan-dialoog doet niets
  const voorAnnuleren = madeExes.length
  saveAsPath = null
  $('#bat-exe').click(); await tick(); await tick()
  check('annuleren in de opslaan-dialoog maakt niets', madeExes.length === voorAnnuleren)
  saveAsPath = undefined

  // mislukte build geeft een begrijpelijke melding
  exeFail = true
  $('#bat-exe').click(); await tick(); await tick(); await tick()
  check('mislukte exe geeft uitleg over de virusscanner',
    $('#bat-warn').hidden === false && $('#bat-warn').textContent.includes('virusscanner'))
  exeFail = false
  window.confirm = () => true

  // startbestand bij opslaan met 'zonder venster'
  $('#bo-hidden').checked = true
  $('#bo-hidden').dispatchEvent(new window.Event('change')); await tick(); await tick()
  $('#bat-content').value = 'echo hallo'
  $('#bat-content').dispatchEvent(new window.Event('input'))
  $('#bat-name').value = 'stil.bat'
  $('#bat-name').dispatchEvent(new window.Event('input'))
  $('#bat-save').click(); await tick(); await tick(); await tick()
  const stilVbs = Object.keys(batFiles).find(f => f.endsWith('.vbs'))
  check('bij zonder venster komt er een startbestand bij', !!stilVbs)
  check('het startbestand heet naar het script', stilVbs.endsWith('stil-verborgen.vbs'))
  check('het startbestand draait zonder venster', batFiles[stilVbs].includes(', 0, False'))
  check('het startbestand geeft geen argument mee', !batFiles[stilVbs].includes('_verborgen"'))
  check('het startbestand wordt stilletjes gemaakt, zonder melding', $('#bat-warn').hidden === true)
  check('er komt geen extra melding bij (de hint zegt het al)', $('#bat-warn').hidden === true)
  check('het startbestand vervuilt de bestandenlijst niet',
    !$$('.bat-file').some(r => r.textContent.includes('.vbs')))

  // laatste weergave onthouden
  $('#btn-nav-bat').click(); await tick(); await tick()
  check('bat-sectie wordt onthouden als laatste weergave', settings.lastView.view === 'bat')

  // ── werkmap in het invoerveld ──────────────────────────────────────────────
  $$('.proj-item')[0].click(); await tick()
  check('geen "commando typen" meer als tekst',
    !$('#term-input').placeholder.includes('commando typen'))
  check('projectmap staat in het invoerveld', $('#term-input').placeholder === 'C:\\a')
  check('volledige pad staat in de tooltip', $('#term-input').title === 'C:\\a')

  $('#btn-nav-cmd').click(); await tick()
  check('cmd-sectie toont zijn eigen werkmap', $('#term-input').placeholder === settings.cmd.cwd)

  // heel lang pad wordt in het midden ingekort
  const langPad = 'C:\\Users\\redub\\Desktop\\Projects\\werk\\klanten\\2026\\commanddeck'
  pickedFolder = langPad
  $('#cmd-pick-folder').click(); await tick(); await tick()
  const ph = $('#term-input').placeholder
  check('lang pad wordt ingekort', ph !== langPad && ph.includes('.....'))
  check('begin van het pad blijft staan', ph.startsWith('C:\\Users\\'))
  check('eind van het pad blijft staan', ph.endsWith('commanddeck'))
  check('tooltip houdt het volledige pad', $('#term-input').title === langPad)

  // ── gevonden editors aanbieden ─────────────────────────────────────────────
  gevondenEditorsMock = [
    { id: 'sublime',   label: 'Sublime Text', path: 'D:\\Program Files\\Sublime Text\\sublime_text.exe', bron: 'installatiemap' },
    { id: 'notepadpp', label: 'Notepad++',    path: 'C:\\Program Files\\Notepad++\\notepad++.exe',       bron: 'installatiemap' },
    { id: 'zed',       label: 'Zed',          path: 'C:\\bin\\zed.exe',                                   bron: 'PATH' },
  ]
  $('#btn-settings').click(); await tick()
  check('er is een knop om editors te zoeken', !!$('#btn-scan-editors'))
  $('#btn-scan-editors').click(); await tick(); await tick(); await tick()
  check('het venster met gevonden editors verschijnt', $('#modal-found').hidden === false)
  check('alle drie staan erin', $$('[data-found]').length === 3)
  check('met het pad erbij', $('#found-list').textContent.includes('sublime_text.exe'))
  check('en waar ze gevonden zijn', $('#found-list').textContent.includes('PATH'))
  check('alles staat standaard aangevinkt', $$('[data-found]').every(c => c.checked))

  // eentje uitvinken en de rest toevoegen
  $$('[data-found]')[2].checked = false
  const voorEditors = (settings.customEditors || []).length
  $('#modal-found-add').click(); await tick(); await tick()
  check('het venster sluit', $('#modal-found').hidden === true)
  check('de aangevinkte editors zijn toegevoegd',
    settings.customEditors.length === voorEditors + 2)
  check('met naam en pad',
    settings.customEditors.some(e => e.label === 'Sublime Text' && e.path.endsWith('sublime_text.exe')))
  check('de uitgevinkte niet', !settings.customEditors.some(e => e.label === 'Zed'))
  check('en die wordt niet nog eens aangeboden', settings.editorsGeweigerd.includes('zed'))

  // wat er al in staat wordt overgeslagen
  $('#btn-scan-editors').click(); await tick(); await tick(); await tick()
  check('al toegevoegde editors komen niet terug', $$('[data-found]').length === 1)
  $('#modal-found-skip').click(); await tick(); await tick()
  check('niet meer vragen onthoudt dat ook', settings.editorsGeweigerd.includes('zed'))

  gevondenEditorsMock = []
  $('#btn-scan-editors').click(); await tick(); await tick(); await tick()
  check('niets gevonden opent geen venster', $('#modal-found').hidden === true)

  // opruimen via de app zelf, zodat de renderer het ook meekrijgt
  $$('[data-ce-del]').forEach(b => b.click()); await tick()
  $('#settings-save').click(); await tick(); await tick()
  check('de toegevoegde editors zijn weer weg', settings.customEditors.length === 0)
  $('#btn-settings').click(); await tick()

  // ── eigen editors ──────────────────────────────────────────────────────────
  $('#btn-settings').click(); await tick()
  check('er is een sectie voor eigen editors', !!$('#custom-editor-list'))
  check('en een knop om er een toe te voegen', !!$('#btn-add-custom-editor'))
  check('de oude vaste rij "Eigen editor" is weg',
    !$$('.editor-row-name').some(el => el.textContent.includes('Eigen editor')))

  $('#btn-add-custom-editor').click(); await tick()
  check('toevoegen geeft een lege regel', $$('[data-ce-path]').length === 1)
  $('#btn-add-custom-editor').click(); await tick()
  check('er kunnen er meerdere bij', $$('[data-ce-path]').length === 2)

  const ids = $$('[data-ce-path]').map(el => el.dataset.cePath)
  const zetIn = (i, naam, pad) => {
    const l = $(`[data-ce-label="${ids[i]}"]`); l.value = naam; l.dispatchEvent(new window.Event('input'))
    const p = $(`[data-ce-path="${ids[i]}"]`);  p.value = pad;  p.dispatchEvent(new window.Event('input'))
  }
  zetIn(0, 'Notepad++', 'C:\\Program Files\\Notepad++\\notepad++.exe')
  zetIn(1, 'Sublime', 'C:\\Program Files\\Sublime\\subl.exe')

  // een snelkoppeling kiezen
  gekozenExe = 'C:\\Program Files\\Sublime\\subl.exe'   // main lost de .lnk al op
  $(`[data-ce-browse="${ids[1]}"]`).click(); await tick(); await tick()
  check('bladeren vult het pad in', $(`[data-ce-path="${ids[1]}"]`).value === gekozenExe)

  // kiezen uit de geïnstalleerde programma's
  check('elke rij heeft een knop voor geïnstalleerde programma\'s',
    $$('[data-ce-pick]').length === 2)
  $(`[data-ce-pick="${ids[1]}"]`).click(); await tick(); await tick(); await tick()
  check('de programmakiezer gaat open', $('#modal-prog').hidden === false)
  check('en toont je programma\'s', $$('.prog-item').length === 3)
  check('met de cursor in het zoekveld', window.document.activeElement.id === 'prog-search')

  $('#prog-search').value = 'code'
  $('#prog-search').dispatchEvent(new window.Event('input')); await tick()
  check('zoeken filtert de lijst', $$('.prog-item').length === 1)
  check('zoeken kijkt ook naar het pad', (() => {
    $('#prog-search').value = 'Notepad'
    $('#prog-search').dispatchEvent(new window.Event('input'))
    return $$('.prog-item').length === 1
  })())

  $$('.prog-item')[0].click(); await tick(); await tick()
  check('kiezen sluit het venster', $('#modal-prog').hidden === true)
  check('en vult het pad in',
    $(`[data-ce-path="${ids[1]}"]`).value === 'C:\\Program Files\\Notepad++\\notepad++.exe')

  // naam wordt alleen ingevuld als hij nog leeg was
  $(`[data-ce-label="${ids[1]}"]`).value = ''
  $(`[data-ce-label="${ids[1]}"]`).dispatchEvent(new window.Event('input'))
  $(`[data-ce-pick="${ids[1]}"]`).click(); await tick(); await tick(); await tick()
  $$('.prog-item')[0].click(); await tick(); await tick()
  check('een lege naam wordt aangevuld met de programmanaam',
    $(`[data-ce-label="${ids[1]}"]`).value === 'Notepad++')

  // terugzetten voor de volgende controles
  zetIn(1, 'Sublime', 'C:\\Program Files\\Sublime\\subl.exe')

  $('#settings-save').click(); await tick(); await tick()
  check('beide editors zijn opgeslagen', settings.customEditors.length === 2)
  check('met hun naam', settings.customEditors.map(e => e.label).sort().join(',') === 'Notepad++,Sublime')

  // lege regels worden niet bewaard
  $('#btn-add-custom-editor').click(); await tick()
  $('#settings-save').click(); await tick(); await tick()
  check('een regel zonder pad wordt niet bewaard', settings.customEditors.length === 2)

  $('#btn-settings').click(); await tick()

  // knoppen in de projectweergave
  $$('.proj-item')[0].click(); await tick()
  const eigen = $$('.cmd-btn[data-editor^="custom:"]')
  check('elke eigen editor krijgt een eigen knop', eigen.length === 2)
  check('met de juiste namen',
    eigen.map(b => b.textContent.trim()).sort().join(',') === 'Notepad++,Sublime')

  let geopend = null
  const echteOpen = api.openEditor
  api.openEditor = (o) => { geopend = o }
  eigen.find(b => b.textContent.includes('Sublime')).click(); await tick()
  check('klikken opent het juiste programma',
    geopend && geopend.editorPath === 'C:\\Program Files\\Sublime\\subl.exe')
  check('in de map van het project', geopend.cwd === 'C:\\a')
  api.openEditor = echteOpen

  // per project uit te zetten
  $$('.proj-edit')[0].click(); await tick()
  const vinkjes = $$('[data-cmdvis-id^="editor:custom:"]')
  check('eigen editors staan bij de zichtbare commando\'s', vinkjes.length === 2)
  vinkjes[0].checked = false
  vinkjes[0].dispatchEvent(new window.Event('change'))
  $('#modal-proj-save').click(); await tick(); await tick()
  check('uitgezette editor verdwijnt uit de projectweergave',
    $$('.cmd-btn[data-editor^="custom:"]').length === 1)

  // ── meldingen blijven niet hangen bij het wisselen van scherm ──────────────
  $('#btn-nav-bat').click(); await tick(); await tick()
  $('#bat-content').value = '   '
  $('#bat-content').dispatchEvent(new window.Event('input'))
  $('#bat-test').click(); await tick(); await tick()
  check('er staat een waarschuwing', $('#bat-warn').hidden === false)

  $('#btn-nav-cmd').click(); await tick()
  $('#btn-nav-bat').click(); await tick(); await tick()
  check('na een rondje langs cmd is de waarschuwing weg', $('#bat-warn').hidden === true)

  // de statusmelding van een afgelopen commando ook
  $('#btn-nav-cmd').click(); await tick()
  window.document.getElementById('cmd-status').className = 'show ended'
  $('#btn-nav-dict').click(); await tick()
  check('de statusmelding verdwijnt bij het wisselen',
    !window.document.getElementById('cmd-status').classList.contains('show'))

  // ── laatste weergave onthouden en herstellen ───────────────────────────────
  // Simuleert opnieuw opstarten: verse DOM + renderer, met de bewaarde settings.
  async function herstart() {
    const d = new JSDOM(html, { runScripts: 'outside-only', url: 'http://localhost/' })
    const w = d.window
    global.window = w; global.document = w.document
    w.api = api; w.confirm = () => true; w.requestAnimationFrame = (cb) => cb()
    Object.defineProperty(w.navigator, 'clipboard', { value: { writeText: () => {} }, configurable: true })
    w.eval(fs.readFileSync(path.join(APP, 'i18n.js'), 'utf8') + '\nglobalThis.I18N = I18N;')
    w.eval(fs.readFileSync(path.join(APP, 'git-tools.js'), 'utf8'))
    w.eval(fs.readFileSync(path.join(APP, 'accounts.js'), 'utf8'))
    w.eval(fs.readFileSync(path.join(APP, 'renderer.js'), 'utf8'))
    w.document.dispatchEvent(new w.Event('DOMContentLoaded'))
    await new Promise(r => setTimeout(r, 0)); await new Promise(r => setTimeout(r, 0))
    return w
  }

  // verse installatie zonder gekozen werkmap: duidelijke hint in plaats van een pad
  const bewaardeCwd = settings.cmd.cwd
  settings.cmd = { cwd: '', recentCwds: [] }
  settings.lastView = { view: 'cmd', projectId: '' }
  let w0 = await herstart()
  check('zonder werkmap komt er een hint te staan',
    w0.document.getElementById('term-input').placeholder === 'kies eerst een werkmap')
  global.window = window; global.document = window.document
  settings.cmd = { cwd: bewaardeCwd, recentCwds: [bewaardeCwd] }

  // ── het inlogveld ─────────────────────────────────────────────────────────
  // Bij het opstarten staat de cursor niet altijd waar je denkt: een venster dat
  // net opengaat of een knop die focus pakt. Een pincode die je blind intypt
  // verdween dan in het niets. Waar je ook staat: typen hoort hierin te komen,
  // en Enter hoort in te loggen.
  {
    const w = await herstart()
    const antwoord = w.eval("vraagTekst({ titel: 'pin', verborgen: true, okLabel: 'inloggen' })")
    await tick()
    const veld = w.document.getElementById('vraag-invoer')
    check('de pincode gaat in een wachtwoordveld', !!veld && veld.type === 'password')
    check('en de cursor staat er meteen in', w.document.activeElement === veld)

    const toets = (key, code) => w.document.dispatchEvent(
      new w.KeyboardEvent('keydown', { key, code: code || key, bubbles: true, cancelable: true }))

    // Zoals een knop of de achtergrond de focus wegpakt.
    const focusWeg = () => w.document.querySelector('#vraag-knoppen button').focus()
    focusWeg()
    check('de focus is echt weg', w.document.activeElement !== veld)
    toets('1')
    check('typen komt tóch in het veld', veld.value === '1')
    check('en de cursor staat er weer in', w.document.activeElement === veld)
    focusWeg(); toets('2')
    check('ook de volgende toets', veld.value === '12')
    focusWeg(); toets('Backspace')
    check('backspace haalt er een af', veld.value === '1')

    // Num Lock uit stuurt pijltjes vanaf het numerieke blok; de fysieke toets
    // klopt wel, en in een pincodeveld is dat een cijfer.
    focusWeg()
    toets('ArrowUp', 'Numpad8')
    check('het numerieke blok werkt met Num Lock uit', veld.value === '18')

    focusWeg()
    toets('Enter')
    check('enter probeert in te loggen', (await antwoord) === '18')
    check('en het venster gaat dicht', w.document.getElementById('modal-vraag').hidden)
    global.window = window; global.document = window.document
  }

  $('#btn-nav-cmd').click(); await tick()
  check('cmd-weergave wordt onthouden', settings.lastView.view === 'cmd')
  let w2 = await herstart()
  check('na herstart opent de cmd-sectie weer',
    w2.document.getElementById('cmd-panel').style.display === 'flex')
  global.window = window; global.document = window.document

  $('#btn-nav-ps').click(); await tick()
  check('powershell-weergave wordt onthouden', settings.lastView.view === 'ps')
  w2 = await herstart()
  check('na herstart opent de powershell-sectie weer',
    w2.document.getElementById('ps-panel').style.display === 'flex')
  global.window = window; global.document = window.document

  $('#btn-nav-dict').click(); await tick()
  check('woordenboek wordt onthouden', settings.lastView.view === 'dict')
  w2 = await herstart()
  check('na herstart opent het woordenboek weer',
    w2.document.getElementById('dict-panel').style.display === 'flex')
  global.window = window; global.document = window.document

  $$('.proj-item')[0].click(); await tick()
  check('project wordt onthouden',
    settings.lastView.view === 'project' && settings.lastView.projectId === 'p1')
  w2 = await herstart()
  check('na herstart opent hetzelfde project weer',
    w2.document.getElementById('main').style.display === 'flex' &&
    w2.document.querySelector('.proj-item.active') !== null)
  check('en de terminal staat er meteen', !!w2.document.getElementById('term-input'))
  global.window = window; global.document = window.document

  // instellingen worden niet hersteld
  $('#btn-settings').click(); await tick()
  check('instellingen worden niet als laatste weergave onthouden',
    settings.lastView.view === 'project')
  $('#btn-settings').click(); await tick()

  // verwijderd project valt netjes terug
  settings.lastView = { view: 'project', projectId: 'bestaat-niet' }
  w2 = await herstart()
  check('verdwenen project valt terug op het startscherm',
    w2.document.querySelector('#main .empty-state') !== null)
  global.window = window; global.document = window.document

  // ── de git-sectie bij de projectinstellingen ───────────────────────────────
  // Waar dit vandaan komt: een project stond met een remote in .git/config naar
  // een repo die niet bestond. De app zei "gekoppeld", haalde de koppelknop weg
  // en toonde push/pull/fetch die alleen konden falen. Deze sectie is de plek
  // waar je dat ziet én losmaakt.
  {
    const maakStaat = window.GitTools.maakStaat
    const gezond = { beschikbaar: true, isRepo: true, branch: 'main', commits: true,
                     upstream: 'origin/main', naam: 'a', email: 'b@c', remoteOk: true,
                     remoteLijst: [{ naam: 'origin', url: 'https://github.com/a/b.git' }] }

    gitStaatNu = maakStaat(gezond)
    $$('.proj-edit')[0].click(); await tick(); await tick()
    check('de git-sectie staat in de projectinstellingen', !$('#f-git-sectie').hidden)
    check('en meldt dat de koppeling werkt', !!$('.git-set-status.s-ok'))
    check('bij een gezonde repo staat er niets in de weg', !!$('.git-set-ok'))
    check('het adres staat erbij',
      $('.git-set-remote-url').textContent === 'https://github.com/a/b.git')
    check('controleren kan altijd', !!$('#git-set-check'))
    $('#modal-proj-save').click(); await tick(); await tick()

    // Precies de situatie van het echte project: twee adressen, geen van beide
    // bereikbaar, en een branch die het verdwenen adres volgt.
    gitStaatNu = maakStaat({ ...gezond, upstream: 'github/master', branch: 'master',
      remoteOk: false, remoteReden: 'weg',
      remoteLijst: [{ naam: 'github', url: 'https://github.com/x/weg.git' },
                    { naam: 'origin', url: 'https://github.com/x/ook-weg.git' }] })
    $$('.proj-edit')[0].click(); await tick(); await tick()
    check('een kapotte koppeling wordt als kapot getoond', !!$('.git-set-status.s-stuk'))
    check('de kop kleurt mee', !!$('.git-set-kop.e-fout'))
    check('beide adressen staan er los onder', $$('.git-set-remote').length === 2)
    check('en je kunt ze allebei weghalen', $$('[data-remote-weg]').length === 2)
    check('het adres dat de branch volgt is aangewezen',
      $('.git-set-remote.actief .git-set-remote-naam').textContent === 'github')
    const probs = $$('.git-set-probleem').map(e => e.textContent)
    check('het kapotte adres wordt gemeld', probs.some(x => x.includes('antwoordt niet')))
    check('en dat er twee adressen staan', probs.some(x => x.includes('2 adressen')))
    check('elk probleem heeft een knop', $$('[data-git-actie]').length >= 2)
    check('herstellen is bereikbaar', !!$('#git-set-herstel'))

    // Weghalen vraagt eerst. Dat moet: het is de enige knop hier die iets
    // ongedaan maakt wat je zelf hebt ingesteld. En de vraag moet zéggen welk
    // adres eraf gaat — bij twee remotes is dat het hele punt.
    executed.length = 0
    laatsteVraag = null
    kiesKnop('annuleren')
    $$('[data-remote-weg]')[0].click(); await tick(); await tick()
    check('weghalen vraagt eerst om bevestiging', !!laatsteVraag)
    check('en noemt het adres dat eraf gaat', laatsteVraag.alles.includes('github'))
    check('annuleren doet niets', executed.length === 0)

    kiesKnop('')
    gitVergeten.length = 0
    $$('[data-remote-weg]')[0].click(); await tick(); await tick()
    check('bevestigen draait het juiste commando',
      executed.some(e => e.ran === 'git remote remove github'))
    check('daarna wordt de koppeling opnieuw gecontroleerd', gitVergeten.includes('C:\\a'))
    $('#modal-proj-save').click(); await tick(); await tick()

    // Een map zonder repo hoort geen adressen of problemen te tonen, alleen de
    // weg vooruit.
    gitStaatNu = maakStaat({ beschikbaar: true, isRepo: false })
    $$('.proj-edit')[0].click(); await tick(); await tick()
    check('een map zonder repo toont geen adressen', $$('.git-set-remote').length === 0)
    check('en wijst naar koppelen', !!$('[data-git-actie="koppelen"]'))
    check('zonder herstelknop, want er is niets te herstellen', !$('#git-set-herstel'))
    $('#modal-proj-save').click(); await tick(); await tick()

    // ── .gitignore ───────────────────────────────────────────────────────────
    // Waar dit vandaan komt: `git init` in een Android-map, dan committen.
    // `git add -A` pakte app/build/ mee en viel om op een pad dat Windows niet
    // aankan -- repo zonder één commit, en een foutmelding die de oorzaak niet
    // noemt. De sectie moet dit zién voordat je op vastleggen drukt.
    gitStaatNu = maakStaat({ beschikbaar: true, isRepo: true, branch: 'main', commits: false,
      naam: 'a', email: 'b@c', windows: true, gitignore: false, langePaden: false,
      nieuw: 2, vuil: 2, nieuweBestanden: ['app/build/', '.gradle/'] })
    $$('.proj-edit')[0].click(); await tick(); await tick()
    const gp = $$('.git-set-probleem').map(e => e.textContent)
    check('ontbrekende .gitignore wordt gemeld', gp.some(x => x.includes('.gitignore')))
    check('en lange paden ook', gp.some(x => x.includes('260')))
    check('met bouwrommel erbij is het een fout, geen waarschuwing',
      !!$('.git-set-probleem.e-fout [data-git-actie="gitignore"]'))

    gitignoreGeschreven.length = 0
    kiesKnop('')
    $('[data-git-actie="gitignore"]').click(); await tick(); await tick()
    check('de app laat eerst zien wat er genegeerd gaat worden',
      !!laatsteVraag && laatsteVraag.regels.includes('build/'))
    check('en schrijft het bestand pas na akkoord', gitignoreGeschreven.length === 1)
    check('zonder een bestaande te overschrijven', gitignoreGeschreven[0].erbij === false)
    check('in de map van het project', gitignoreGeschreven[0].dir === 'C:\\a')
    $('#modal-proj-save').click(); await tick(); await tick()

    // Staat hij er wel, dan hoort de app erover te zwijgen.
    gitStaatNu = maakStaat({ ...gezond, gitignore: true, langePaden: true, windows: true })
    $$('.proj-edit')[0].click(); await tick(); await tick()
    check('met een .gitignore blijft het stil', !$('[data-git-actie="gitignore"]'))
    check('en met lange paden aan ook', !$('[data-git-actie="langepaden"]'))
    $('#modal-proj-save').click(); await tick(); await tick()

    // Bij een nieuw project is er nog geen map om iets over te zeggen.
    $('#btn-add-proj').click(); await tick()
    check('een nieuw project toont geen git-onderhoud', $('#f-git-sectie').hidden)
    check('maar wel een veld om van git te downloaden', !$('#f-git-clone').hidden)
    check('met een adresveld', $('#f-git-url'))

    $('#modal-proj-cancel').click(); await tick()

    // Kiezen uit je eigen repositories. De lijst staat meteen open en is al
    // opgehaald: hem eerst moeten opendoen is een klik om niets.
    ghRepoVragen.length = 0
    ghRepoAntwoord = { ok: true, repos: [
      { naam: 'DD-Music', volledig: 'redubbledd1/DD-Music', url: 'https://github.com/redubbledd1/DD-Music.git',
        beschrijving: 'muziekspeler', prive: false, bijgewerkt: '2026-09-01T10:00:00Z' },
      { naam: 'TimeGuess', volledig: 'redubbledd1/TimeGuess', url: 'https://github.com/redubbledd1/TimeGuess.git',
        beschrijving: '', prive: true, bijgewerkt: '2026-08-01T10:00:00Z' },
    ] }
    $('#btn-add-proj').click(); await tick(); await tick()
    check('de lijst staat meteen open', !$('#f-git-repos').hidden)
    check('en is uit zichzelf opgehaald', ghRepoVragen.length === 1)
    check('met beide repositories erin', $$('#f-git-repo-lijst .git-repo-rij').length === 2)

    // Inklappen kan, voor als je alleen een adres komt plakken.
    $('#btn-git-repos').click(); await tick()
    check('de kop klapt de lijst dicht', $('#f-git-repos').hidden)
    $('#btn-git-repos').click(); await tick(); await tick()
    check('en weer open', !$('#f-git-repos').hidden)
    check('zonder er nog een keer voor het netwerk op te gaan', ghRepoVragen.length === 1)

    $('#f-git-repo-zoek').value = 'music'
    $('#f-git-repo-zoek').dispatchEvent(new window.Event('input')); await tick()
    check('zoeken filtert de lijst', $$('#f-git-repo-lijst .git-repo-rij').length === 1)

    $$('#f-git-repo-lijst .git-repo-rij')[0].click(); await tick()
    check('kiezen vult het adres', $('#f-git-url').value === 'https://github.com/redubbledd1/DD-Music.git')
    check('en de projectnaam', $('#f-name').value === 'DD-Music')
    check('de lijst blijft staan, met de keuze aangewezen',
      !$('#f-git-repos').hidden && !!$('#f-git-repo-lijst .git-repo-rij.gekozen'))

    // Wat al aan een project hangt hoort er niet meer bij te staan. Het project
    // uit deze tests wijst naar DD-Music, dus die valt weg.
    $('#modal-proj-cancel').click(); await tick()
    gitStaatNu = maakStaat({ ...gezond, remoteLijst: [{ naam: 'origin', url: 'git@github.com:redubbledd1/DD-Music.git' }] })
    $$('.proj-edit')[0].click(); await tick(); await tick()
    $('#modal-proj-save').click(); await tick(); await tick()
    ghRepoVragen.length = 0
    $('#btn-add-proj').click(); await tick(); await tick()
    check('een repo die al aan een project hangt staat niet in de lijst',
      $$('#f-git-repo-lijst .git-repo-rij').length === 1
      && !$('#f-git-repo-lijst .git-repo-rij').textContent.includes('DD-Music'))
    check('en er staat bij hoeveel er zijn weggelaten',
      !!$$('#f-git-repo-lijst .git-repo-melding').length)
    $('#modal-proj-cancel').click(); await tick()

    // Zonder gh valt er niets te kiezen. Dan hoort er een uitweg te staan, geen
    // lege lijst waar je niets aan hebt.
    ghRepoAntwoord = { ok: false, reden: 'geen-gh', repos: [] }
    $('#btn-add-proj').click(); await tick(); await tick()
    check('zonder gh staat er uitleg', !!$('#f-git-repo-lijst .git-repo-melding'))
    check('met een knop om GitHub alsnog te koppelen', !!$('#git-repo-inloggen'))
    ghRepoAntwoord = { ok: true, repos: [] }
    $('#modal-proj-cancel').click(); await tick()
    gitStaatNu = null
  }

  // ── Knopvolgorde: slepen pakt de knop die je vasthebt ──────────────────
  // De rij bij uitvoeren laat niet alles zien: uitgevinkte knoppen vallen weg,
  // en van git alleen wat bij deze repo-toestand hoort. Wie sleept, wijst een
  // plek aan in die rij. Rekent het verplaatsen met een andere lijst, dan
  // schuift een andere knop op dan je vastpakt en staat er daarna rommel in
  // cmdVolgorde -- waarna ook knoppen die je niet had aangeraakt fout slepen.
  {
    const PAD = 'C:/volgorde'
    const proj = {
      id: 'volgorde', name: 'volgorde', icon: 'x', locations: [{ label: 'main', path: PAD }],
      activeLocation: 0, cmdVisibility: {}, customCmds: [], cmdVolgorde: {},
    }
    // Verse repo zonder remote en zonder commits: van git blijft maar een
    // handvol knoppen over. Precies de situatie waarin de twee lijsten uit
    // elkaar lopen.
    W.__test.zetGitStaat(PAD, {
      gemeten: true, beschikbaar: true, isRepo: true, gekoppeld: false,
      commits: 0, vuil: 0, stashes: 0,
    })
    const rij = () => W.__test.cmdIdsInBeeld(proj, 'run', 'rij')
    const alles = () => W.__test.cmdIdsInBeeld(proj, 'run', 'alles')

    const voor = rij()
    check('de rij laat minder knoppen zien dan er bestaan', voor.length > 1 && voor.length < alles().length)

    const laatste = voor[voor.length - 1]
    const verborgenVoor = alles().filter(id => !voor.includes(id))
    W.__test.verplaatsCmdVolgorde(proj, 'run', voor.length - 1, 0)
    check('slepen verplaatst de knop die je vasthebt', rij()[0] === laatste)
    check('en laat de rest van de rij op volgorde staan',
      rij().slice(1).join() === voor.slice(0, -1).join())
    check('knoppen die niet in beeld staan blijven op hun plek',
      alles().filter(id => !rij().includes(id)).join() === verborgenVoor.join())

    // Het bewerkvenster toont juist alles, ook de uitgevinkte. Daar telt dus
    // een andere lijst, en verplaatsen moet die volgen.
    const alVoor = alles()
    W.__test.verplaatsCmdVolgorde(proj, 'run', alVoor.length - 1, 0, 'alles')
    check('in het bewerkvenster telt de volledige lijst', alles()[0] === alVoor[alVoor.length - 1])
  }

  // ── Mappen van knoppen ───────────────────────────────────────
  // Een map is een plek in dezelfde volgorde als de knoppen. Wat erin ligt
  // verdwijnt uit de rij en komt onder de mapkop terug; de map opheffen laat
  // elke knop staan waar hij stond.
  {
    const PAD = 'C:/mappen'
    const proj = {
      id: 'mappen', name: 'mappen', icon: 'x', locations: [{ label: 'main', path: PAD }],
      activeLocation: 0, cmdVisibility: {}, customCmds: [], cmdVolgorde: {},
      cmdFolders: [], cmdFolderVan: {},
    }
    // Gekoppelde repo met werk en een stash: dan staan bijna alle git-knoppen
    // in de rij, en is er dus genoeg om in te delen.
    W.__test.zetGitStaat(PAD, {
      gemeten: true, beschikbaar: true, isRepo: true, gekoppeld: true,
      commits: 3, vuil: 2, stashes: 1,
    })
    const rij = () => W.__test.cmdIdsInBeeld(proj, 'run', 'rij')
    const html = () => W.__test.cmdGridHtml(proj, 'run')
    const losseGit = () => rij().filter(id => id.indexOf('git-') === 0)

    check('zonder mappen staan de git-knoppen los in de rij', losseGit().length > 2)

    W.__test.autoMappen(proj, 'run')
    const git = (proj.cmdFolders || []).find(f => f.sectie === 'run' && f.auto === 'git')
    check('automatisch mappen maakt een git-map', !!git)
    check('alles wat erin ligt is ook echt git',
      Object.entries(proj.cmdFolderVan).filter(([, v]) => v === git.id)
        .every(([id]) => id.indexOf('git-') === 0))
    check('de rij toont de map in plaats van de losse git-knoppen',
      rij().includes('map:' + git.id) && losseGit().length === 0)
    check('en de map weet wat erin zit', W.__test.knoppenInMap(proj, 'run', git.id).length > 2)

    // Ook knoppen die nu niet in beeld staan gaan mee, anders duikt er later
    // alsnog een losse git-knop naast de map op.
    check('ook de knoppen die nu niet in beeld staan zijn ingedeeld',
      Object.keys(proj.cmdFolderVan).length > W.__test.knoppenInMap(proj, 'run', git.id).length)

    check('een open map laat zijn knoppen zien',
      html().includes('data-map-groep') && html().includes('data-cmd="git-status"'))
    git.open = false
    check('een dichte map niet', !html().includes('data-cmd="git-status"'))
    git.open = true

    // Handmatig erin leggen en er weer uit halen: zonder die weg terug is een
    // map een eenrichtingsstraat.
    const eigen = { id: 'mtest', sectie: 'run', label: 'test', open: true }
    proj.cmdFolders = [...proj.cmdFolders, eigen]
    const los = rij().find(id => id.indexOf('map:') !== 0)
    W.__test.legInMap(proj, 'run', los, eigen.id)
    check('een knop in een map verdwijnt uit de rij',
      !rij().includes(los) && W.__test.knoppenInMap(proj, 'run', eigen.id).includes(los))
    W.__test.verplaatsKnopId(proj, 'run', los, null, null, false)
    check('en eruit halen zet hem terug in de rij', rij().includes(los))

    const voorOpheffen = W.__test.knoppenInMap(proj, 'run', git.id)
    W.__test.hefMappenOp(proj, 'run', [git.id])
    check('map opheffen haalt de map weg',
      !(proj.cmdFolders || []).some(f => f.id === git.id) && !rij().includes('map:' + git.id))
    check('maar laat elke knop staan', voorOpheffen.every(id => rij().includes(id)))
  }

  // ── Knoppen vinden zelf hun map ─────────────────────────────────
  // Een knop die er later bij komt -- een AI-programma dat je net hebt
  // geinstalleerd, een git-knop die pas verschijnt zodra er een remote is --
  // heeft nog nooit een map toegewezen gekregen. Zonder afleiding staat die
  // los naast de map die er precies voor bedoeld is.
  {
    const PAD = 'C:/vanzelf'
    const proj = {
      id: 'vanzelf', name: 'vanzelf', icon: 'x', locations: [{ label: 'main', path: PAD }],
      activeLocation: 0, cmdVisibility: {}, customCmds: [], cmdVolgorde: {},
      cmdFolders: [], cmdFolderVan: {},
    }
    W.__test.zetGitStaat(PAD, {
      gemeten: true, beschikbaar: true, isRepo: true, gekoppeld: true,
      commits: 3, vuil: 2, stashes: 1,
    })

    check('een vers project ordent zichzelf', W.__test.ordenProject(proj) === true)
    const soorten = (proj.cmdFolders || []).map(f => f.auto).sort()
    check('en krijgt in elk geval een git- en een flutter-map',
      soorten.includes('git') && soorten.includes('flutter'))
    check('twee keer ordenen doet niets meer', W.__test.ordenProject(proj) === false)

    const git = proj.cmdFolders.find(f => f.auto === 'git')
    // Een knop waar nog nooit iets over is vastgelegd is precies wat een nieuwe
    // knop is: die hoort in de map van zijn soort te vallen.
    delete proj.cmdFolderVan['git-status']
    check('een knop zonder toewijzing valt in de map van zijn soort',
      (W.__test.folderVanKnop(proj, 'run', 'git-status') || {}).id === git.id
      && W.__test.knoppenInMap(proj, 'run', git.id).includes('git-status'))

    // Maar wie hem er zelf uit haalt, wil hem er ook uit houden.
    W.__test.zetKnopInMap(proj, 'git-status', null)
    check('en eruit halen houdt hem eruit, ook al past hij in de soort',
      W.__test.folderVanKnop(proj, 'run', 'git-status') === null
      && W.__test.cmdIdsInBeeld(proj, 'run', 'rij').includes('git-status'))

    // Zonder de map valt er niets af te leiden: dan staat alles gewoon los.
    W.__test.hefMappenOp(proj, 'run', [git.id])
    check('is de map opgeheven, dan blijft de soort er ook van af',
      W.__test.folderVanKnop(proj, 'run', 'git-commit') === null)

    // Weggooien via de prullenbak: een volle map gaat niet mee, want dan
    // verdwijnen de knoppen erin stilletjes ook.
    const flutter = proj.cmdFolders.find(f => f.auto === 'flutter')
    W.__test.verwijderMap(proj, 'run', flutter.id)
    check('een volle map wordt niet weggegooid', !!W.__test.folderOp(proj, flutter.id))
    W.__test.knoppenInMap(proj, 'run', flutter.id).forEach(id => W.__test.zetKnopInMap(proj, id, null))
    W.__test.verwijderMap(proj, 'run', flutter.id)
    check('leeg mag hij wel weg', !W.__test.folderOp(proj, flutter.id))
  }

  // ── Volgorde in beeld ────────────────────────────────────────
  // Een open map is een blok over de hele breedte; die horen onderaan. Dichte
  // mappen zijn chips en horen naast de knoppen te passen, niet erboven of
  // eronder op een eigen regel.
  {
    const PAD = 'C:/volgorde2'
    const proj = {
      id: 'volgorde2', name: 'volgorde2', icon: 'x', locations: [{ label: 'main', path: PAD }],
      activeLocation: 0, cmdVisibility: {}, customCmds: [], cmdVolgorde: {},
      cmdFolders: [], cmdFolderVan: {},
    }
    W.__test.zetGitStaat(PAD, {
      gemeten: true, beschikbaar: true, isRepo: true, gekoppeld: true,
      commits: 3, vuil: 2, stashes: 1,
    })
    W.__test.ordenProject(proj)
    const mappen = proj.cmdFolders
    check('er zijn meerdere mappen om mee te vergelijken', mappen.length > 1)

    mappen.forEach(f => { f.open = false })
    const alleDicht = W.__test.rijVolgorde(proj, 'run')
    const eersteKnop = alleDicht.findIndex(id => id.indexOf('map:') !== 0)
    const laatsteMap = alleDicht.map(id => id.indexOf('map:') === 0).lastIndexOf(true)
    check('dichte mappen staan vooraan, bij de knoppen op dezelfde regels',
      eersteKnop === -1 || laatsteMap < eersteKnop)

    mappen[0].open = true
    const gemengd = W.__test.rijVolgorde(proj, 'run')
    check('een open map zakt naar onderen',
      gemengd[gemengd.length - 1] === 'map:' + mappen[0].id)
    check('en de dichte mappen blijven vooraan staan',
      gemengd[0].indexOf('map:') === 0 && gemengd[0] !== 'map:' + mappen[0].id)
  }

  console.log(ok ? '\n✓ ALLE UI-TESTS GESLAAGD' : '\n✗ ER ZIJN TESTS GEFAALD')
  process.exit(ok ? 0 : 1)
})().catch(e => { console.error('CRASH:', e); process.exit(1) })
