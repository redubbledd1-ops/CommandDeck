// ── State ─────────────────────────────────────────────────────────────────────
let projects    = []
let settings    = {}
let history     = { entries: [], recent: [] }   // commando-woordenboek + recente uitvoeringen
let activeId    = null
let view        = 'project'   // 'project' | 'cmd' | 'ps' | 'dict' | 'settings'
let lastShellView = 'cmd'     // laatste cmd/powershell-paneel, voor 'beide'-commando's
let activeTermId = null       // van wie de terminal-uitvoer nu getoond wordt
let getekendProjectId = ''    // welk project nu in #main staat; voorkomt opnieuw opbouwen
let projectWeergaveAchterhaald = false
let sidebarGetekend = false
let lastViewBewaarTimer = null
let editingId   = null
let deleteId    = null
let pendingLocs = []
let cloneNaamOvergenomen = false
let settingsSubPage      = null   // null | 'talen' — sub-pagina binnen Instellingen
let LANGUAGES            = []     // opgehaald bij opstart, zie i18n.js/main.js locales/languages.js
let detectedLanguageCode = null   // Windows-taal, voor bovenaan pinnen in de Talen-lijst
let talenZoekterm        = ''
let pendingCmdVisibility = {}
let pendingSecties = {}      // hele secties aan/uit voor het project dat je bewerkt
let pendingCustomCmds = []   // eigen knoppen van het project dat je bewerkt
let pendingCmdVolgorde = { run: [], tools: [] }
let cmdSorteerModus = ''     // '' | 'run' — volgorde aanpassen in projectweergave
let cmdvisSorteerModus = ''  // '' | 'run' — volgorde in projectinstellingen
let selEmoji    = '📱'
const termOutput = {}
// Wat je hebt getypt maar nog niet hebt verstuurd, per weergave (elk project,
// de losse cmd-sectie). Zo blijft een half commando staan als je even naar een
// ander project of naar de verkenner springt.
const termInvoer = {}

// Gesprekken met een AI-dienst, per weergave. Zie het blok "AI-gesprek in het
// uitvoervenster" verderop; hier staat alleen waar het in bewaard wordt.
const aiSessies = {}
let aiProviders = []     // overzicht uit het hoofdproces, zonder sleutels
const aiModelCache = {}  // dienst -> modellen zoals de dienst ze zelf noemt
let aiTeller = 0

// De losse CMD-sectie gedraagt zich als een project zonder project: dezelfde
// terminal, maar met een eigen werkmap die los van de projecten staat.
const CMD_CTX_ID = '__cmd__'
function cmdContext() {
  return {
    id: CMD_CTX_ID,
    name: 'cmd',
    locations: [{ label: 'werkmap', path: settings.cmd?.cwd || '' }],
    activeLocation: 0,
    release: false,
  }
}

// De twee snelrijen die niet aan een project hangen. De naam is de sectie
// binnen hun eigen bron (settings.cmd en settings.ps), net zoals 'run' dat is
// binnen een project.
const SNEL_SECTIE = { cmd: 'snel', ps: 'ps-snel' }

const PS_CTX_ID = '__ps__'
function psContext() {
  return {
    id: PS_CTX_ID,
    name: 'powershell',
    locations: [{ label: 'werkmap', path: settings.ps?.cwd || '' }],
    activeLocation: 0,
    release: false,
  }
}

function shellVoor(project) {
  return project && project.id === PS_CTX_ID ? 'powershell' : 'cmd'
}

// Woordenboek-UI state
let dictSearch  = ''
let dictFilter  = 'all'      // 'all' | 'fav' | 'cwd:<pad>'
let dictSort    = 'recent'   // 'recent' | 'used' | 'alpha'
let dictEditId  = null
// Filteren op thema: meerdere tegelijk mag. 'tag:<naam>' zijn de labels uit de
// commando's zelf, 'soort:<x>' zijn eigenschappen (favoriet, ingrijpend, …).
let dictThemas  = new Set()

const DICT_SOORTEN = [
  { id: 'soort:fav',      labelKey: 'dict.kind.favorite',  icoon: 'ti-star',           past: e => !!e.favorite },
  { id: 'soort:gevaar',   labelKey: 'dict.kind.dangerous', icoon: 'ti-alert-triangle', past: e => !!e.danger },
  { id: 'soort:fragment', labelKey: 'dict.kind.fragment',  icoon: 'ti-code',           past: e => !!e.snippet },
  { id: 'soort:sjabloon', labelKey: 'dict.kind.template',  icoon: 'ti-template',       past: e => !!e.template },
  { id: 'soort:eigen',    labelKey: 'dict.kind.custom',    icoon: 'ti-user',           past: e => e.source !== 'builtin' },
  { id: 'soort:cmd',      labelKey: 'dict.kind.cmd',        icoon: 'ti-terminal-2',     past: e => entryShell(e) === 'cmd' },
  { id: 'soort:ps',       labelKey: 'dict.kind.powershell', icoon: 'ti-brand-powershell', past: e => entryShell(e) === 'powershell' },
  { id: 'soort:beide',    labelKey: 'dict.kind.both',       icoon: 'ti-arrows-left-right', past: e => entryShell(e) === 'both' },
]

const EMOJIS = ['📱','💰','🎵','🏠','🚀','💎','🎮','🔥','⚡','🌊','🧠','📊','🎨','🛠️','📦','🤖']

// Uitvoeren is voor programma's, AI en eigen snelkoppelingen.
// Flutter-run hoort bij tools, naast devices / pub / build.
// Git hoort bij uitvoeren en niet bij tools: de tools-sectie wordt bij een
// niet-Flutter-project standaard verborgen (zie bepaalToolsVoorProject), en
// juist daar wil je git-knoppen hebben. De definities staan in git-tools.js,
// zodat main.js en de tests dezelfde lijst gebruiken.
const RUN_CMD_DEFS = GitTools.GIT_CMD_DEFS.map(d => ({ ...d }))

const TOOLS_CMD_DEFS = [
  { id: 'run-android',   label: 'run android',     icon: 'ti-device-mobile-android', cls: 'android' },
  { id: 'run-windows',   label: 'run windows',     icon: 'ti-brand-windows',         cls: 'windows' },
  { id: 'run-chrome',    label: 'run web',         icon: 'ti-world',                 cls: 'web' },
  { id: 'devices',       label: 'flutter devices', icon: 'ti-list-details',          cls: 'info' },
  { id: 'pub-get',       label: 'pub get',         icon: 'ti-package',               cls: 'pub' },
  { id: 'clean',         label: 'flutter clean',   icon: 'ti-sparkles',              cls: 'clean' },
  { id: 'doctor',        label: 'flutter doctor',  icon: 'ti-stethoscope',           cls: 'doctor' },
  { id: 'build-apk',     label: 'build apk',       icon: 'ti-file-zip',              cls: 'apk' },
  { id: 'build-web',     label: 'build web',       icon: 'ti-cloud-upload',          cls: 'buildweb' },
  { id: 'build-windows', label: 'build windows',   icon: 'ti-box',                   cls: 'buildwin' },
]

// Knoppen die bestaan maar niet meteen in de weg staan. Een knop hier weglaten
// is geen kleine keuze: wat er niet staat, bestaat voor de meeste mensen niet.
// Daarom staan ze wél gewoon in de projectinstellingen, met "standaard uit"
// erachter, zodat je ziet dat ze er zijn en waarom ze er niet staan.
//
// Het verschil met een knop die je zelf hebt weggehaald: die staat als false in
// cmdVisibility en telt mee bij "verborgen knoppen terugzetten". Standaard uit
// is de afwezigheid van een voorkeur, niet een voorkeur voor afwezigheid.
const CMD_STANDAARD_UIT = new Set(
  [...RUN_CMD_DEFS, ...TOOLS_CMD_DEFS].filter(d => d.standaardUit).map(d => d.id)
)

// Wat geldt er als je nog nooit iets over deze knop hebt gezegd?
function cmdStandaardAan(id) {
  return !CMD_STANDAARD_UIT.has(id)
}

// ── Git-profielen ─────────────────────────────────────────────────────────────
// Wie ben je in de commit, en welk GitHub-account hoort daarbij. Zie de uitleg
// bij "Identiteit en accounts" in git-tools.js voor waarom dat twee dingen zijn.
// Het account ís de identiteit. Het staat vooraan in de lijst en is altijd de
// standaard — je kunt dus niet in de situatie komen dat je een account hebt
// maar vergeten bent er een profiel bij te kiezen.
//
// De rest van de lijst blijft bestaan voor het geval één project onder een
// andere naam moet (een klantproject, een repo van een vereniging). Dat is een
// uitzondering per project en geen tweede jij.
function gitProfielen() {
  const extra = ((settings.git || {}).profielen) || []
  const eigen = Accounts.accountProfiel(huidigAccount())
  const rest = (Array.isArray(extra) ? extra : []).filter(p => p && p.id !== (eigen && eigen.id))
  return eigen ? [eigen, ...rest] : rest
}

// Altijd het account: er is geen losse keuze meer die uit de pas kan lopen.
function gitStandaardProfielId() {
  return actiefAccount || String((settings.git || {}).standaardProfiel || '')
}

// Welk profiel hoort bij dit project? Zonder profielen is dat er geen, en dan
// doet de app ook geen enkele uitspraak over je identiteit — er valt dan niets
// te verwisselen.
function profielVanProject(p) {
  return GitTools.profielVoorProject(gitProfielen(), gitStandaardProfielId(), p && p.gitProfiel)
}

// Aantal kleuren voor onbekende knoppen; bekende programma's hebben een merkkleur.
const PROG_KLEUR_AANTAL = 12

// Merkkleur per catalogus-id (editor-catalog.js) en per AI-dienst.
const MERK_KLEUR = {
  vscode: 'editor-vscode', 'vscode-insiders': 'editor-vscode', vscodium: 'editor-vscode',
  cursor: 'editor-cursor', androidstudio: 'editor-android-studio',
  claudeCode: 'editor-claude', claudeDesktop: 'editor-claude-desktop',
  visualstudio: 'merk-visualstudio',
  codex: 'merk-codex', geminiCli: 'merk-gemini',
  windsurf: 'merk-windsurf', idea: 'merk-idea', webstorm: 'merk-webstorm',
  pycharm: 'merk-pycharm', phpstorm: 'merk-phpstorm', rider: 'merk-rider',
  sublime: 'merk-sublime', notepadpp: 'merk-notepadpp', zed: 'merk-zed',
  neovim: 'merk-neovim', godot: 'merk-godot', unity: 'merk-unity',
  arduino: 'merk-arduino', trae: 'merk-trae', aider: 'merk-aider',
  opencode: 'merk-opencode',
}
const AI_MERK_KLEUR = {
  claude: 'editor-claude', openai: 'merk-openai', gemini: 'merk-gemini',
  ollama: 'merk-ollama', openrouter: 'merk-openrouter', deepseek: 'merk-deepseek',
  mistral: 'merk-mistral', groq: 'merk-groq', grok: 'merk-grok',
  cerebras: 'merk-cerebras', lmstudio: 'merk-lmstudio', eigen: 'merk-eigen',
}
const KLEUR_IDX = {
  android: 2, windows: 5, web: 3, info: 3, pub: 5, clean: 10, doctor: 8,
  apk: 9, buildweb: 0, buildwin: 11,
  gitlink: 4, gitread: 6, gitpull: 2, gitfetch: 7, gitlog: 1,
  gitcommit: 9, gitpush: 3, gitstash: 8, gitstashlijst: 10, gitbranch: 5, gitdiff: 7, gitterug: 11,
  'editor-vscode': 5, 'editor-cursor': 0, 'editor-claude': 4,
  'editor-android-studio': 2, 'editor-claude-desktop': 6,
  'merk-visualstudio': 1, 'merk-codex': 8, 'merk-openai': 8, 'merk-gemini': 5,
  'merk-ollama': 4, 'merk-openrouter': 7, 'merk-deepseek': 11, 'merk-mistral': 4,
  'merk-groq': 3, 'merk-grok': 0, 'merk-cerebras': 1, 'merk-lmstudio': 11,
  'merk-eigen': 7, 'merk-windsurf': 8, 'merk-idea': 4, 'merk-webstorm': 0,
  'merk-pycharm': 2, 'merk-phpstorm': 1, 'merk-rider': 9, 'merk-sublime': 4,
  'merk-notepadpp': 2, 'merk-zed': 10, 'merk-neovim': 2, 'merk-godot': 5,
  'merk-unity': 7, 'merk-arduino': 8, 'merk-trae': 6, 'merk-aider': 0,
  'merk-opencode': 9,
}

// Icoon per bekend programma (catalogus-id uit editor-catalog.js)
const PROG_ICON = {
  vscode: 'ti-brand-vscode', 'vscode-insiders': 'ti-brand-vscode', vscodium: 'ti-brand-vscode',
  cursor: 'ti-mouse', windsurf: 'ti-wind', trae: 'ti-sparkles', zed: 'ti-code',
  sublime: 'ti-file-code', notepadpp: 'ti-note', pulsar: 'ti-atom', lapce: 'ti-code',
  idea: 'ti-brand-apple', webstorm: 'ti-brand-apple', pycharm: 'ti-brand-python',
  phpstorm: 'ti-brand-php', rider: 'ti-brand-apple', clion: 'ti-brand-apple',
  goland: 'ti-brand-golang', rubymine: 'ti-brand-apple', datagrip: 'ti-database',
  androidstudio: 'ti-brand-android', visualstudio: 'ti-brand-visual-studio',
  eclipse: 'ti-eclipse', netbeans: 'ti-brand-apple', codeblocks: 'ti-code',
  devcpp: 'ti-code', arduino: 'ti-cpu', godot: 'ti-device-gamepad', unity: 'ti-3d-cube-sphere',
  gvim: 'ti-letter-v', neovim: 'ti-letter-n', emacs: 'ti-letter-e', geany: 'ti-code',
  ultraedit: 'ti-file-text', editplus: 'ti-file-text', pspad: 'ti-file-text',
  kate: 'ti-file-code', atom: 'ti-atom',
  claudeCode: 'ti-terminal-2', claudeDesktop: 'ti-message-2',
  codex: 'ti-message-chatbot', geminiCli: 'ti-diamond', opencode: 'ti-code', aider: 'ti-git-merge',
}

function progKleurCls(e, idx) {
  const merk = MERK_KLEUR[e.catalogId]
  if (merk) return merk
  const k = e.kleur ?? idx
  return 'prog-c' + (k % PROG_KLEUR_AANTAL)
}

function padNorm(p) {
  return String(p || '').toLowerCase().replace(/\\/g, '/').replace(/\/+$/, '')
}

function padStam(p) {
  const s = padNorm(p).split('/').pop() || ''
  return s.replace(/\.(exe|cmd|bat|com|ps1)$/i, '')
}

function hashKleur(s) {
  let h = 0
  for (const c of String(s)) h = (Math.imul(h, 31) + c.charCodeAt(0)) | 0
  return Math.abs(h) % PROG_KLEUR_AANTAL
}

// Vaste knoppen mogen een vertaalsleutel hebben; die wint van het kale label.
function defLabel(def) {
  if (!def) return ''
  if (!def.labelKey) return def.label
  const t = I18N.t(def.labelKey)
  return (t && t !== def.labelKey) ? t : def.label
}

function knopKleurSpec(id, p) {
  const flutter = [...RUN_CMD_DEFS, ...TOOLS_CMD_DEFS].find(d => d.id === id)
  if (flutter) return { id, vast: flutter.cls, idx: KLEUR_IDX[flutter.cls] }

  if (id.startsWith('editor:custom:')) {
    const e = eigenEditors().find(x => 'editor:custom:' + x.id === id)
    if (!e) return { id }
    const merk = MERK_KLEUR[e.catalogId]
    if (merk) return { id, vast: merk, idx: KLEUR_IDX[merk] }
    return { id, voorkeur: e.kleur }
  }
  if (id.startsWith('ai:')) {
    const did = id.slice(3)
    if (did.startsWith('prog:')) {
      const d = aiKlaarDiensten().find(x => x.id === did)
      const cat = d && d.programma && d.programma.catalogId
      if (cat && MERK_KLEUR[cat]) return { id, vast: MERK_KLEUR[cat], idx: KLEUR_IDX[MERK_KLEUR[cat]] }
    }
    const merk = AI_MERK_KLEUR[did] || AI_MERK_KLEUR[did.replace(/^prog:/, '')]
    if (merk) return { id, vast: merk, idx: KLEUR_IDX[merk] }
    return { id }
  }
  return { id }
}

function kleurKlassenVoorIds(specs) {
  const n = specs.length
  const cls = new Array(n).fill('')
  const idx = new Array(n).fill(null)
  for (let i = 0; i < n; i++) {
    if (!specs[i].vast) continue
    cls[i] = specs[i].vast
    idx[i] = specs[i].idx != null ? specs[i].idx : (KLEUR_IDX[specs[i].vast] ?? null)
  }
  for (let i = 0; i < n; i++) {
    if (cls[i]) continue
    const verboden = new Set()
    const pak = j => {
      if (j < 0 || j >= n || idx[j] == null) return
      verboden.add(idx[j])
      verboden.add((idx[j] + 1) % PROG_KLEUR_AANTAL)
      verboden.add((idx[j] + PROG_KLEUR_AANTAL - 1) % PROG_KLEUR_AANTAL)
    }
    pak(i - 1)
    for (let j = i + 1; j < n; j++) {
      if (idx[j] != null || specs[j].vast) { pak(j); break }
    }
    let start = specs[i].voorkeur != null ? specs[i].voorkeur : hashKleur(specs[i].id)
    start = ((start % PROG_KLEUR_AANTAL) + PROG_KLEUR_AANTAL) % PROG_KLEUR_AANTAL
    let gekozen = start
    for (let k = 0; k < PROG_KLEUR_AANTAL; k++) {
      const t = (start + k) % PROG_KLEUR_AANTAL
      if (!verboden.has(t)) { gekozen = t; break }
    }
    idx[i] = gekozen
    cls[i] = 'prog-c' + gekozen
  }
  return cls
}

function zetBtnKleur(html, kleurCls) {
  if (!html || !kleurCls) return html
  return html.replace('class="cmd-btn', 'class="cmd-btn ' + kleurCls)
}

function progIcoon(e) {
  return PROG_ICON[e.catalogId] || 'ti-app-window'
}

function volgendeProgKleur() {
  const lijst = settings.customEditors || []
  const gebruikt = new Set(lijst.map(e => e.kleur).filter(k => k != null))
  for (let i = 0; i < PROG_KLEUR_AANTAL; i++) {
    if (!gebruikt.has(i)) return i
  }
  return lijst.length % PROG_KLEUR_AANTAL
}

function maakCustomEditor(g) {
  return {
    id: 'ce_' + g.id + '_' + Math.random().toString(36).slice(2, 5),
    label: g.label,
    path: g.path,
    enabled: true,
    catalogId: g.id,
    kleur: volgendeProgKleur(),
  }
}

function normaliseerEditorKleuren() {
  let veranderd = false
  ;(settings.customEditors || []).forEach((e, i) => {
    if (e.kleur == null) { e.kleur = i % PROG_KLEUR_AANTAL; veranderd = true }
  })
  return veranderd
}

// Vroegere versies hadden vaste editors (Cursor, VS Code, …). Die komen nu in
// dezelfde lijst als automatisch gevonden programma's.
const OUDE_EDITOR_DEFS = [
  { key: 'cursor',        label: 'Cursor',           catalogId: 'cursor' },
  { key: 'claudeCode',    label: 'Claude Code',      catalogId: 'claudeCode' },
  { key: 'vscode',        label: 'VS Code',          catalogId: 'vscode' },
  { key: 'androidStudio', label: 'Android Studio',   catalogId: 'androidstudio' },
  { key: 'claudeDesktop', label: 'Claude (desktop)', catalogId: 'claudeDesktop' },
]

function migreerStandaardEditors() {
  const eds = settings.editors || {}
  const lijst = settings.customEditors || []
  const paden = new Set(lijst.map(e => String(e.path || '').toLowerCase()))
  let veranderd = false
  for (const def of OUDE_EDITOR_DEFS) {
    const ed = eds[def.key]
    if (!ed?.enabled || !ed.path) continue
    if (paden.has(ed.path.toLowerCase())) continue
    if (lijst.some(e => e.catalogId === def.catalogId || padStam(e.path) === padStam(ed.path))) continue
    lijst.push({
      id: 'ce_migr_' + def.key,
      label: def.label,
      path: ed.path,
      enabled: true,
      catalogId: def.catalogId,
      kleur: lijst.length % PROG_KLEUR_AANTAL,
    })
    paden.add(ed.path.toLowerCase())
    eds[def.key] = { ...ed, enabled: false }
    veranderd = true
  }
  if (veranderd) {
    settings.customEditors = lijst
    settings.editors = eds
  }
  return veranderd
}

// Uitvoerprogramma's die de gebruiker zelf heeft toegevoegd (of automatisch gevonden)
function eigenEditors() {
  return (settings.customEditors || []).filter(e => e.enabled !== false && e.path)
}

function editorsZelfde(a, b) {
  if (a.catalogId && b.catalogId && a.catalogId === b.catalogId) return true
  if (a.path && b.path && padNorm(a.path) === padNorm(b.path)) return true
  const sa = padStam(a.path), sb = padStam(b.path)
  return !!(sa && sa === sb)
}

function verkiesEditor(a, b) {
  const score = e => (/[\\/]/.test(e.path || '') ? 4 : 0) + (e.catalogId ? 2 : 0) + (/\.(exe|cmd)$/i.test(e.path || '') ? 1 : 0)
  const win = { ...(score(b) > score(a) ? b : a) }
  const other = win.id === a.id ? b : a
  if (!win.catalogId && other.catalogId) win.catalogId = other.catalogId
  return win
}

function ontdubbelCustomEditors() {
  const lijst = settings.customEditors || []
  const houden = []
  for (const e of lijst) {
    const i = houden.findIndex(h => editorsZelfde(h, e))
    if (i < 0) houden.push(e)
    else houden[i] = verkiesEditor(houden[i], e)
  }
  if (houden.length === lijst.length && houden.every((e, i) => e.id === lijst[i].id && e.path === lijst[i].path)) return false
  settings.customEditors = houden
  return true
}

// Hele sectie aan of uit. Handiger dan alle vinkjes los omzetten als je
// bijvoorbeeld bij een niet-Flutter project de tools niet wilt zien.
function sectieAan(p, sectie) {
  return !(p.secties && p.secties[sectie] === false)
}

function zetSectie(p, sectie, aan) {
  p.secties = { ...(p.secties || {}), [sectie]: !!aan }
  saveProjects()
}

// 'tools' was een eigen sectie onder uitvoeren, met een eigen kop, een eigen
// schuifje en een eigen volgorde. Het waren nooit knoppen van een andere soort:
// het zijn de Flutter-knoppen. Ze verhuizen daarom eenmalig naar een map in
// dezelfde rij. Daarna is er nog maar één plek waar knoppen staan, en is die
// groep te verplaatsen, te hernoemen en op te heffen zoals elke andere map.
const FLUTTER_MAP = 'flutter'

function flutterMap(p) {
  return (p.cmdFolders || []).find(f => f && f.auto === FLUTTER_MAP) || null
}

function migreerToolsNaarMap(p) {
  if (!p || p.knoppenSamengevoegd) return false
  p.knoppenSamengevoegd = true

  const oudeVolgorde = ((p.cmdVolgorde || {}).tools) || []
  const hoortErin = [
    ...TOOLS_CMD_DEFS.map(d => d.id),
    ...(p.customCmds || []).filter(c => c.section === 'tools').map(c => 'custom:' + c.id),
  ]
  // De volgorde die de gebruiker in de tools-rij had staan blijft binnen de map
  // gelden; wat daar niet in stond komt erachter.
  const inMap = [
    ...oudeVolgorde.filter(id => hoortErin.includes(id)),
    ...hoortErin.filter(id => !oudeVolgorde.includes(id)),
  ]

  const f = {
    id: nieuwMapId(), sectie: 'run', label: I18N.t('folder.flutter'),
    // Stond de tools-sectie uit (geen Flutter-project), dan hoort de map dicht
    // te staan. De knoppen zijn er nog wel: dicht is niet weg.
    open: sectieAan(p, 'tools'), auto: FLUTTER_MAP,
  }
  p.cmdFolders = [...(p.cmdFolders || []), f]
  p.cmdFolderVan = {
    ...(p.cmdFolderVan || {}),
    ...Object.fromEntries(inMap.map(id => [id, f.id])),
  }
  p.cmdVolgorde = {
    ...(p.cmdVolgorde || {}),
    run: [...(((p.cmdVolgorde || {}).run) || []), MAP_PREFIX + f.id, ...inMap],
    tools: [],
  }
  return true
}

function migreerAlleProjecten() {
  let veranderd = false
  for (const p of projects) {
    if (migreerToolsNaarMap(p)) veranderd = true
    if (ordenProject(p)) veranderd = true
  }
  if (veranderd) saveProjects()
  return veranderd
}

// Flutter-knoppen slaan alleen ergens op bij een Flutter-project. Dat kijken we
// één keer na, en alleen als de gebruiker er zelf nog niets over gezegd heeft.
// Geen Flutter? Dan gaat de map dicht -- zichtbaar dat hij bestaat, maar niet
// in de weg.
async function bepaalToolsVoorProject(p) {
  if (!p || (p.secties && typeof p.secties.tools === 'boolean')) return false
  const loc = p.locations?.[p.activeLocation] || p.locations?.[0]
  if (!loc?.path) return false

  const r = await window.api.projectSoort(loc.path)
  if (!r || !r.ok) return false          // map even niet bereikbaar: later nog eens

  p.secties = { ...(p.secties || {}), tools: !!r.flutter }
  const f = flutterMap(p)
  if (f) f.open = !!r.flutter
  saveProjects()
  return !r.flutter                      // true = we hebben iets ingeklapt
}

// Bij het opstarten en na een update: projecten die nog nooit gekeken zijn,
// alsnog nakijken. Zo hoef je het bij een verse installatie niet zelf te doen.
async function keurProjectenNa() {
  let veranderd = false
  for (const p of projects) {
    if (await bepaalToolsVoorProject(p)) veranderd = true
  }
  if (veranderd) vraagProjectHertekenen()
}

// ── Git-toestand per locatie ─────────────────────────────────────────────────
// De git-knoppen hangen af van de map waar je in staat: nog geen repo, wel een
// repo maar niet gekoppeld, of gekoppeld. Dat opvragen kost een paar korte
// git-aanroepen, dus we onthouden het antwoord per pad en tekenen opnieuw
// zodra het binnen is.
let gitStaten = {}        // pad -> staat uit git-tools
const gitBezig = new Set()

function actieveLocPad(p) {
  const loc = p && p.locations ? (p.locations[p.activeLocation] || p.locations[0]) : null
  return (loc && loc.path) || ''
}

// Beide staan in git-tools.js, zodat ze zonder venster te testen zijn.
const projectLocaties = (p) => GitTools.projectLocaties(p)
const locNaam = (p, loc) => GitTools.locatieNaam(p, loc)

function gitStaatVan(p) {
  const pad = actieveLocPad(p)
  return pad ? (gitStaten[pad] || null) : null
}

// Zonder `forceer` gebeurt er niets als we het antwoord al hebben. Dat is wat
// het opnieuw tekenen laat stoppen: de eerste ronde haalt op en tekent, de
// tweede vindt de cache en doet niets meer.
async function ververesGitPad(pad, forceer = false) {
  if (!pad || !window.api || !window.api.gitInfo) return null
  if (!forceer && gitStaten[pad]) return gitStaten[pad]
  if (gitBezig.has(pad)) return gitStaten[pad] || null

  gitBezig.add(pad)
  try {
    const staat = await window.api.gitInfo(pad)
    if (!staat) return null
    const oud = gitStaten[pad]
    gitStaten[pad] = staat
    if (!GitTools.zelfdeGitWeergave(oud, staat)) {
      meldGitProjectenAanMain()
      vraagProjectHertekenen()
    }
    return staat
  } catch {
    return null
  } finally {
    gitBezig.delete(pad)
  }
}

async function ververesGitStaat(p, forceer = false) {
  return ververesGitPad(actieveLocPad(p), forceer)
}

// Ook de projecten die niet open staan. Zonder dit weet de afsluitcontrole van
// ronde 5 alleen iets over het project dat je toevallig als laatste bekeek.
// Eén voor één, niet allemaal tegelijk: bij tien projecten zou dat tien
// git-processen naast elkaar zijn.
async function ververesAlleGitStaten(forceer = false) {
  meldGitPadenAanMain()
  for (const p of projects) {
    for (const loc of projectLocaties(p)) await ververesGitPad(loc.pad, forceer)
  }
  meldGitProjectenAanMain()
  // Niet awaiten: het opstarten mag niet wachten op een netwerkaanroep per
  // project. Wat eruit komt, komt vanzelf binnen en tekent dan opnieuw.
  controleerAlleKoppelingen()
}

// ── Klopt de koppeling nog? ─────────────────────────────────────────────────
// git:info kijkt alleen in .git/config. Daar kan een adres staan van een repo
// die nooit is aangemaakt, hernoemd is, of van een account waar je niet meer
// bij kunt. Dan lijkt het project gekoppeld, valt de koppelknop weg, en staan
// er push- en pull-knoppen die alleen maar een foutmelding geven.
//
// Alleen de andere kant weet of het adres bestaat, dus dit kost netwerk. Het
// hoort daarom niet in de poll-lus: één keer per project nadat alles geladen
// is, en verder alleen als er iets misgaat of iets verandert. Main onthoudt de
// uitslag een half uur, dus een tweede ronde kost meestal niets.
const gitRemoteGedaan = new Set()
let gitControleBezig = false

async function controleerKoppeling(pad, opnieuw = false) {
  if (!pad || !window.api || !window.api.gitRemoteCheck) return null
  if (opnieuw) {
    gitRemoteGedaan.delete(pad)
    try { await window.api.gitRemoteVergeet(pad) } catch {}
  }
  gitRemoteGedaan.add(pad)
  try {
    const uit = await window.api.gitRemoteCheck(pad)
    // De uitslag zit nu in de cache van main; git:info pikt hem daar op.
    await ververesGitPad(pad, true)
    return uit
  } catch {
    return null
  }
}

// Eén voor één, en alleen waar er iets te controleren valt. Tien projecten
// tegelijk zijn tien netwerkaanroepen, en dat is precies het moment waarop de
// app traag aanvoelt bij het opstarten.
async function controleerAlleKoppelingen() {
  if (gitControleBezig) return
  gitControleBezig = true
  try {
    for (const p of projects) {
      for (const loc of projectLocaties(p)) {
        const staat = gitStaten[loc.pad]
        if (!staat || !staat.isRepo || !staat.heeftRemote) continue
        if (gitRemoteGedaan.has(loc.pad)) continue
        await controleerKoppeling(loc.pad)
      }
    }
  } finally {
    gitControleBezig = false
  }
}

// Bij een Windows-shutdown heeft het main-proces ~5 seconden en kan het niets
// meer aan ons vragen. Daarom houden we de lijst daar continu bij.
function gitProjectenLijst() {
  const uit = []
  for (const p of projects) {
    for (const loc of projectLocaties(p)) {
      const staat = gitStaten[loc.pad]
      if (!staat || !staat.isRepo) continue
      // locIndex moet mee: commit en push draaien op de actieve locatie van het
      // project, dus die moet eerst naar déze locatie voordat er iets draait.
      uit.push({ id: p.id, naam: locNaam(p, loc), pad: loc.pad, locIndex: loc.index, staat })
    }
  }
  return uit
}

function meldGitProjectenAanMain() {
  try { window.api.gitProjecten({ accountId: actiefAccount, lijst: gitProjectenLijst() }) } catch {}
}

// Welke mappen horen bij dit account? Main weigert daarna elke git-actie op een
// pad dat er niet in staat. Dit moet vóór de eerste git-aanroep gebeuren, want
// anders draait er nog iets op de map van degene die net is uitgelogd.
function meldGitPadenAanMain() {
  const paden = []
  for (const p of projects) {
    for (const loc of projectLocaties(p)) paden.push(loc.pad)
  }
  try { window.api.gitPaden({ accountId: actiefAccount, paden }) } catch {}
}

// Achtergrondverversing. Het venster verbergen zet hem stil: anders draaien er
// tien git-processen per minuut voor een scherm waar niemand naar kijkt.
const GIT_POLL_SEC_STANDAARD = 30
// 0 = niet pollen. De indicator wordt dan alleen nog bijgewerkt na een
// git-actie en bij het wisselen van locatie.
function gitPollSec() {
  const v = (settings.git || {}).pollSec
  return Number.isFinite(v) ? Math.max(0, v) : GIT_POLL_SEC_STANDAARD
}
const GIT_VOLLEDIG_ELKE = 10       // elke tiende ronde ook de andere projecten
let gitPollTeller = 0
let gitPollTimer = null

function startGitPolling() {
  if (gitPollTimer) { clearInterval(gitPollTimer); gitPollTimer = null }
  const sec = gitPollSec()
  if (!sec) return
  gitPollTimer = setInterval(async () => {
    if (document.hidden) return
    gitPollTeller++
    if (gitPollTeller % GIT_VOLLEDIG_ELKE === 0) { await ververesAlleGitStaten(true); return }
    const p = projects.find(x => x.id === activeId)
    if (p) await ververesGitStaat(p, true)
  }, sec * 1000)
}

// De indicator in de projectkop: welke branch, hoeveel vooruit/achter, hoeveel
// gewijzigd. Hij licht op zodra er werk is dat alleen op deze pc bestaat.
// Staat er in een ándere locatie van dit project werk dat nergens anders is?
// De kop toont de actieve locatie, dus zonder dit merk je zoiets pas bij het
// afsluiten.
function andereLocatiesOnveilig(p) {
  const actief = actieveLocPad(p)
  let n = 0
  for (const loc of projectLocaties(p)) {
    if (loc.pad === actief) continue
    const i = GitTools.indicator(gitStaten[loc.pad])
    if (i && i.onveilig) n++
  }
  return n
}

function gitIndicatorHtml(p) {
  const i = GitTools.indicator(gitStaatVan(p))
  if (!i) return ''

  const delen = []
  if (i.ahead)  delen.push(`<span class="git-ind-ahead" title="${esc(I18N.t('git.ind.aheadTitle'))}">↑${i.ahead}</span>`)
  if (i.behind) delen.push(`<span class="git-ind-behind" title="${esc(I18N.t('git.ind.behindTitle'))}">↓${i.behind}</span>`)
  if (i.vuil)   delen.push(`<span class="git-ind-dirty" title="${esc(I18N.t('git.ind.dirtyTitle'))}">${i.vuil}${esc(I18N.t('git.ind.dirtyShort'))}</span>`)
  if (i.koppelingStuk) delen.push(`<span class="git-ind-stuk" title="${esc(I18N.t('git.ind.brokenTitle'))}">${esc(I18N.t('git.ind.broken'))}</span>`)
  else if (!i.gekoppeld) delen.push(`<span class="git-ind-los" title="${esc(I18N.t('git.ind.noRemoteTitle'))}">${esc(I18N.t('git.ind.noRemote'))}</span>`)
  else if (!i.volgt) delen.push(`<span class="git-ind-los" title="${esc(I18N.t('git.ind.noUpstreamTitle'))}">${esc(I18N.t('git.ind.noUpstream'))}</span>`)

  const anders = andereLocatiesOnveilig(p)
  if (anders) delen.push(`<span class="git-ind-anders" title="${esc(I18N.t('git.ind.otherLocTitle'))}">+${anders}</span>`)

  return `<span class="git-ind ${i.onveilig || anders ? 'onveilig' : ''}">
      <i class="ti ti-git-branch"></i>
      <span class="git-ind-branch">${esc(i.branch)}</span>
      ${delen.join('')}
    </span>${identiteitChipHtml(p)}`
}

// Onder wiens naam komt je volgende commit te staan. Dit is het halve punt van
// profielen: het moet er stáán, vóór je commit, zonder dat je ernaar hoeft te
// zoeken.
//
// Wanneer wél en wanneer niet: is er iets mis, dan altijd. Klopt alles, dan
// alleen als er meer dan één profiel is — met één identiteit valt er niets te
// verwisselen en is het alleen maar drukte in de kop.
function identiteitChipHtml(p) {
  const status = GitTools.identiteitStatus(gitProfielen(), gitStaatVan(p), profielVanProject(p))
  if (!status) return ''

  if (status.soort === 'ontbreekt') {
    return `<span class="git-ident mis" title="${esc(I18N.t('git.ident.chipMisTitle'))}">
        <i class="ti ti-user-exclamation"></i>${esc(I18N.t('git.ident.chipMis'))}</span>`
  }
  if (status.soort === 'onbekend' || status.soort === 'ander-profiel') {
    return `<span class="git-ident fout" title="${esc(I18N.t('git.ident.chipFoutTitle', { naam: status.huidig.naam, email: status.huidig.email }))}">
        <i class="ti ti-user-exclamation"></i>${esc(status.huidig.naam)}</span>`
  }
  if (gitProfielen().length < 2) return ''
  return `<span class="git-ident" title="${esc(I18N.t('git.ident.chipTitle', { naam: status.huidig.naam, email: status.huidig.email }))}">
      <i class="ti ti-user"></i>${esc(GitTools.profielLabel(status.gevonden))}</span>`
}

// Eigen knoppen die de gebruiker vanuit het woordenboek heeft toegevoegd. Die
// hoorden vroeger bij een sectie; nu is er nog maar een rij, dus horen ze
// gewoon bij het project. Oude knoppen dragen nog een `section` mee -- die
// wordt genegeerd, niet gefilterd, anders vallen ze uit beeld.
function customCmdsOf(p) {
  return p.customCmds || []
}

// Alle knop-id's van een project, zichtbaar of niet. Er is nog maar een rij:
// tools was geen tweede soort knop maar een tweede rij, en staat nu als map
// 'Flutter' tussen de rest. Zie migreerToolsNaarMap().
function alleCmdKnopIds(bron, sectie) {
  const ids = []
  for (const def of RUN_CMD_DEFS) ids.push(def.id)
  for (const e of eigenEditors()) ids.push('editor:custom:' + e.id)
  // Een dienst die klaarstaat is net zo goed een knop als de rest: dus ook
  // per project uit te zetten en te verslepen. Programmaknoppen die al als
  // editor in deze rij staan, niet nog eens.
  for (const d of aiDienstenOpProject()) ids.push('ai:' + d.id)
  for (const def of TOOLS_CMD_DEFS) ids.push(def.id)
  for (const c of customCmdsOf(bron)) ids.push('custom:' + c.id)
  // Een map staat in dezelfde lijst als de knoppen. Zo houdt hij een plek in de
  // rij zonder dat er een tweede volgorde bijgehouden hoeft te worden.
  for (const f of foldersVan(bron, sectie)) ids.push(MAP_PREFIX + f.id)
  return ids
}

// Zichtbaarheid, volgorde en mappen staan in knoppenrij.js: de rij bij een
// project, de cmd-snelrij en de powershell-snelrij zijn dezelfde rij met andere
// knoppen erin. Hieronder staat alleen wat een projectrij eigen is -- welke
// knoppen er zijn, en wat de git-toestand ervan mag laten zien -- plus de
// doorgeefluiken onder de namen die de rest van dit bestand al gebruikte.
const MAP_PREFIX = Knoppenrij.MAP_PREFIX
const isMapId = Knoppenrij.isMapId
const mapIdVan = Knoppenrij.mapIdVan
const nieuwMapId = Knoppenrij.nieuwMapId

// De rij-beschrijving waar knoppenrij.js mee rekent. Elke aanroep maakt hem
// vers: er komen knoppen bij en af terwijl je in beeld staat, en de
// verplaatsmodus gaat aan en uit. Alles eraan is lui -- `alle()` wordt pas
// uitgevoerd als er iets aan gevraagd wordt.
function projectRij(bron, sectie) {
  return {
    bron,
    sectie,
    alle: () => alleCmdKnopIds(bron, sectie),
    standaardAan: cmdStandaardAan,
    zichtbaarheid: bron.cmdVisibility || pendingCmdVisibility,
    toonbaar: (ids) => gitToonbaar(bron, ids),
    sorteert: sorteertSectie(sectie),
    autoSoorten: autoSoorten(),
    knopHtml: () => cmdKnopHtmlMap(bron),
    extraKop: (f) => mapExtraHtml(bron, f),
    kleurBron: bron,
    herteken: () => renderMain(),
    bewaar: () => { saveProjects(); renderMain() },
  }
}

// Welke rij hoort bij deze sectie? De snelrijen van cmd en powershell hangen
// niet aan een project, dus daar is `bron` niet ingevuld -- de sectienaam zegt
// al genoeg. Alles wat over een rij gaat loopt hierlangs, zodat tekenen,
// slepen en mappen niet hoeven te weten waar ze staan.
function rijVoor(bron, sectie) {
  if (sectie === SNEL_SECTIE.cmd || sectie === SNEL_SECTIE.ps) return snelRij(sectie)
  return projectRij(bron, sectie)
}

// Een niet-gekoppeld project ziet alleen de koppelknop; een gekoppeld project
// ziet de rest en de koppelknop niet meer. Zolang we de toestand nog niet weten
// tonen we geen enkele git-knop: liever even niets dan een knop die een seconde
// later weer verspringt.
function gitToonbaar(bron, ids) {
  if (!ids.some(id => GitTools.isGitId(id))) return ids
  const toon = GitTools.zichtbareGitIds(gitStaatVan(bron))
  return ids.filter(id => !GitTools.isGitId(id) || toon.includes(id))
}

function cmdZichtbaar(bron, id, zichtbaarMap = null) {
  return Knoppenrij.zichtbaar(projectRij(bron, 'run'), id, zichtbaarMap)
}

function foldersVan(bron, sectie) {
  return Knoppenrij.mappenVan(bron, sectie)
}

function folderOp(bron, mapId) {
  return Knoppenrij.mapOp(bron, mapId)
}

function folderVanKnop(bron, sectie, id) {
  return Knoppenrij.mapVanKnop(projectRij(bron, sectie), id)
}

function mapIsOpen(bron, id) {
  return Knoppenrij.mapOpen(bron, id)
}

function cmdVolgordeLijst(bron, sectie) {
  return Knoppenrij.volgorde(projectRij(bron, sectie))
}

function zichtbareKnopIds(bron, sectie, zichtbaar = null) {
  return Knoppenrij.zichtbareIds(projectRij(bron, sectie), zichtbaar)
}

function knoppenInMap(bron, sectie, mapId, zichtbaar = null) {
  return Knoppenrij.knoppenInMap(projectRij(bron, sectie), mapId, zichtbaar)
}

function cmdIdsInBeeld(bron, sectie, weergave = 'rij', zichtbaar = null) {
  return Knoppenrij.idsInBeeld(projectRij(bron, sectie), weergave, zichtbaar)
}

function zichtbareCmdVolgorde(bron, sectie, zichtbaar = null) {
  return cmdIdsInBeeld(bron, sectie, 'rij', zichtbaar)
}

function verplaatsCmdVolgorde(bron, sectie, van, naar, weergave = 'rij', zichtbaar = null) {
  return Knoppenrij.verplaatsVolgorde(projectRij(bron, sectie), van, naar, weergave, zichtbaar)
}

function rijVolgorde(bron, sectie, zichtbaar = null) {
  return Knoppenrij.rijVolgorde(projectRij(bron, sectie), zichtbaar)
}

function zetKnopInMap(bron, knopId, mapId) {
  Knoppenrij.zetInMap(bron, knopId, mapId)
}

function verplaatsKnopId(bron, sectie, knopId, doelId, mapId = null, achter = false) {
  return Knoppenrij.verplaatsKnop(projectRij(bron, sectie), knopId, doelId, mapId, achter)
}

function cmdKnopHtmlMap(p) {
  const map = {}
  for (const def of RUN_CMD_DEFS) {
    map[def.id] = `<button class="cmd-btn" data-cmd="${def.id}" data-volgorde-id="${def.id}"><i class="ti ${def.icon}"></i> ${esc(defLabel(def))}</button>`
  }
  eigenEditors().forEach(e => {
    const id = 'editor:custom:' + e.id
    map[id] = `<button class="cmd-btn" data-editor="custom:${esc(e.id)}" data-volgorde-id="${esc(id)}"><i class="ti ${progIcoon(e)}"></i> ${esc(e.label || 'editor')}</button>`
  })
  const actiefAi = (aiSessies[p.id] && aiSessies[p.id].aan) ? aiSessies[p.id].providerId : ''
  aiDienstenOpProject().forEach(d => { map['ai:' + d.id] = aiKnopHtml(d, actiefAi) })
  for (const def of TOOLS_CMD_DEFS) {
    map[def.id] = `<button class="cmd-btn" data-cmd="${def.id}" data-volgorde-id="${def.id}"><i class="ti ${def.icon}"></i> ${esc(defLabel(def))}</button>`
  }
  customCmdsOf(p).forEach(c => {
    const id = 'custom:' + c.id
    map[id] = `<button class="cmd-btn custom" data-custom="${esc(c.id)}" data-volgorde-id="${esc(id)}" title="${esc(c.cmd)}"><i class="ti ${esc(c.icon || 'ti-player-play')}"></i> ${esc(c.label || c.cmd)}</button>`
  })
  return map
}

// --release hoort bij de Flutter-knoppen en nergens anders, dus staat het
// schuifje op de kop van die map. Alleen als de map open is: bij een dichte map
// zie je de knoppen niet waar het over gaat, en dan is het schuifje een vraag
// zonder aanleiding.
function mapExtraHtml(p, f) {
  if (f.auto !== FLUTTER_MAP) return ''
  return `<label class="toggle-switch" title="${esc(I18N.t('project.releaseToggleTitle'))}">
      <input type="checkbox" id="toggle-release" ${p.release === true ? 'checked' : ''} />
      <span class="toggle-slider"></span>
      <span class="toggle-text">--release</span>
    </label>`
}

function cmdGridHtml(p, sectie) {
  const rij = rijVoor(p, sectie)
  const knopHtml = rij.knopHtml()
  const ids = Knoppenrij.rijVolgorde(rij)
  const sorteren = sorteertSectie(sectie)
  const inhoud = {}
  for (const id of ids) if (isMapId(id)) inhoud[id] = Knoppenrij.knoppenInMap(rij, mapIdVan(id))

  // Kleuren worden op de buren gekozen, dus ze moeten lopen over de knoppen
  // zoals je ze ziet staan. Een mapkop telt niet mee: die heeft geen kleur en
  // zou er anders eentje opeten.
  const opVolgorde = ids.flatMap(id => (isMapId(id) ? inhoud[id] : [id]))
  const kleuren = kleurKlassenVoorIds(opVolgorde.map(id => knopKleurSpec(id, rij.kleurBron)))
  const kleurVan = Object.fromEntries(opVolgorde.map((id, i) => [id, kleuren[i]]))

  // In de sorteermodus krijgt elk ding zijn eigen pijltjes. Het id staat op de
  // omhulling, want slepen rekent met id's en niet met plekken.
  const knop = (id, i, aantal) => {
    const btn = zetBtnKleur(knopHtml[id], kleurVan[id])
    if (!btn) return ''
    if (!sorteren) return btn
    return `<span class="cmd-sort-item" data-volgorde-id="${esc(id)}">${pijlenHtml(i === 0, i === aantal - 1, true)}${btn}</span>`
  }

  const delen = ids.map((id, i) => {
    if (!isMapId(id)) return knop(id, i, ids.length)
    // Een dichte map is alleen zijn naam. Die hoort niet in het raster maar in
    // de kopregel, naast de schakelaar -- zie dichteMappenHtml().
    if (!Knoppenrij.mapOpen(rij.bron, id)) return ''
    const f = folderOp(rij.bron, mapIdVan(id))
    if (!f) return ''
    const kinderen = inhoud[id] || []
    const kopDeel = mapKopHtml(f, kinderen.length, sorteren ? { i, aantal: ids.length } : null)
    const leeg = sorteren ? `<span class="cmd-map-leeg">${esc(I18N.t('folder.emptyHint'))}</span>` : ''
    const binnen = kinderen.map((kid, ki) => knop(kid, ki, kinderen.length)).join('') || leeg
    return `<div class="cmd-map-groep" data-map-groep="${esc(f.id)}">
      <div class="cmd-map-regelrij">${kopDeel}${rij.extraKop ? rij.extraKop(f) : ''}</div>
      <div class="cmd-map-inhoud">${binnen}</div>
    </div>`
  })

  // De rij is een flexrij die zelf afbreekt waar het niet meer past. Zonder
  // hulp schuift de eerste losse knop dus naast de laatste map, en dan staat
  // "los" ineens op dezelfde regel als "in een map". Dit lege blok van een
  // hele regel breed dwingt de knoppen eronder.
  const laatsteOpen = ids.reduce((n, id, i) => (isMapId(id) && Knoppenrij.mapOpen(rij.bron, id) ? i : n), -1)
  if (laatsteOpen >= 0 && ids.some(id => !isMapId(id))) {
    delen.splice(laatsteOpen + 1, 0, '<span class="cmd-rij-breek" aria-hidden="true"></span>')
  }
  return delen.join('')
}

// De naam van een map, als knop. `plek` is alleen in de sorteermodus gevuld:
// dan komen de pijltjes erbij en hangt het id eraan waar het slepen mee rekent.
function mapKopHtml(f, aantal, plek = null) {
  const open = f.open !== false
  const kop = `<button class="cmd-map-kop ${open ? '' : 'dicht'}" data-map="${esc(f.id)}" title="${esc(I18N.t('folder.toggleTitle'))}">
    <i class="ti ${open ? 'ti-folder-open' : 'ti-folder'}"></i>
    <span class="cmd-map-naam">${esc(f.label)}</span>
    <span class="cmd-map-aantal">${aantal}</span>
  </button>`
  if (!plek) return kop
  return `<span class="cmd-sort-item cmd-map-regel" data-volgorde-id="${esc(MAP_PREFIX + f.id)}">`
    + `${pijlenHtml(plek.i === 0, plek.i === plek.aantal - 1, true)}${kop}</span>`
}

// Dichte mappen staan in de kopregel, naast de schakelaar. Ze zijn klein en
// zeggen alleen "hier zit nog meer"; onder de knoppen namen ze een hele regel
// in beslag voor drie woorden. Past het niet meer naast elkaar, dan lopen ze
// vanzelf door naar de volgende regel.
function dichteMappenHtml(p, sectie) {
  const rij = rijVoor(p, sectie)
  const ids = Knoppenrij.rijVolgorde(rij)
  const sorteren = sorteertSectie(sectie)
  const dicht = ids.filter(id => isMapId(id) && !Knoppenrij.mapOpen(rij.bron, id))
  if (!dicht.length) return ''
  return `<span class="cmd-kop-mappen">` + dicht.map(id => {
    const f = folderOp(rij.bron, mapIdVan(id))
    if (!f) return ''
    const aantal = Knoppenrij.knoppenInMap(rij, mapIdVan(id)).length
    return mapKopHtml(f, aantal, sorteren ? { i: ids.indexOf(id), aantal: ids.length } : null)
  }).join('') + `</span>`
}

function modalProjectCtx() {
  return {
    device: (document.getElementById('f-device')?.value || '').trim(),
    customCmds: pendingCustomCmds,
    cmdVolgorde: pendingCmdVolgorde,
  }
}

function cmdvisRijen(sectie) {
  const ctx = modalProjectCtx()
  const vaste = [...RUN_CMD_DEFS, ...TOOLS_CMD_DEFS]
    .map(def => ({ id: def.id, label: defLabel(def), icon: def.icon }))
  const editors = eigenEditors().map((e, i) => ({
    id: 'editor:custom:' + e.id, label: e.label || 'editor', icon: progIcoon(e), kleurCls: progKleurCls(e, i),
  }))
  const ai = aiDienstenOpProject().map(d => ({
    id: 'ai:' + d.id, label: d.label, icon: AI_KNOP_ICON[d.id] || aiKnopIcoon(d),
  }))
  const customs = pendingCustomCmds.map(c => ({
    id: 'custom:' + c.id, custom: c, label: c.label || c.cmd, icon: c.icon || 'ti-player-play',
  }))
  const map = Object.fromEntries([...vaste, ...editors, ...ai, ...customs].map(r => [r.id, r]))
  return cmdVolgordeLijst(ctx, sectie).map(id => map[id]).filter(Boolean)
}

const AUTOFIX_CMD_KEYS = new Set([
  'run-android', 'run-windows', 'run-chrome',
  'build-apk', 'build-web', 'build-windows',
])

function isAutofixEligible(cmdKey, cmd) {
  if (cmdKey && AUTOFIX_CMD_KEYS.has(cmdKey)) return true
  return /\bflutter\s+(run|build|install)\b/i.test(cmd || '')
}

// ── Init ──────────────────────────────────────────────────────────────────────
window.addEventListener('DOMContentLoaded', async () => {
  try {
    [projects, settings, history] = await Promise.all([
      window.api.loadProjects(),
      window.api.loadSettings(),
      window.api.loadHistory(),
    ])
  } catch(e) {
    projects = []; settings = {}
  }
  if (!history || !Array.isArray(history.recent)) history = { entries: [], recent: [] }

  // Accounts ophalen vóór de rest: welk account actief is bepaalt welke
  // projecten en git-instellingen je ziet.
  await laadAccounts()

  if (migreerStandaardEditors() || ontdubbelCustomEditors() || normaliseerEditorKleuren()
      || migreerSnelRijen()) window.api.saveSettings(settings)

  await I18N.init(settings.language)
  // Pas na I18N: de Flutter-map krijgt een naam uit de taalbestanden.
  migreerAlleProjecten()

  // Wat je de vorige keer aan had staan blijft aan. Het logboek zelf leeft in
  // het hoofdproces, dus dat moet het weten voordat er iets te loggen valt.
  if (settings.logboek) logKeuze = { ...logKeuze, ...settings.logboek }
  try { window.api.logZet(logKeuze) } catch {}
  try {
    [LANGUAGES, detectedLanguageCode] = await Promise.all([
      window.api.listLanguages(),
      window.api.detectLanguage(),
    ])
  } catch { LANGUAGES = []; detectedLanguageCode = null }

  await setupTitlebar()
  setupModalEvents()
  setupGlobalTypeCapture()
  setupAiKlikbaar()
  const statusSluit = document.getElementById('cmd-status-sluit')
  if (statusSluit) statusSluit.onclick = () => setStatus('hide')
  setupNavigatie()
  setupBrowserToetsen()
  setupSelectieKader()
  setupContextMenu()
  setupVoortgang()
  document.addEventListener('pointermove', noteerMuis, { passive: true })
  document.addEventListener('pointerdown', noteerMuis, { passive: true })
  wireWerkSplit()
  volgKrappeVlakken()
  wisGemengdeProjectSplits()
  restoreLastView()
  herstelWerkSplitNaStart()
  bedraadZijbalkBreedte()

  // Bij een ander vensterformaat past er een ander stuk pad in
  window.addEventListener('resize', () => {
    pasZijbalkBreedteToe()
    updateTermPlaceholder()
    plaatsStatus()
    planSplitPlusVervers()
  })

  // Even wachten zodat het venster er al staat voordat we gaan zoeken
  setTimeout(() => zoekEditors({ stil: true, automatisch: true }), 900)

  // Bestaande projecten die nog nooit nagekeken zijn (verse installatie, of na
  // een update waarin deze controle erbij kwam) alsnog beoordelen.
  setTimeout(() => keurProjectenNa(), 1200)

  // Git-toestand: eerst het open project, zodat het venster reageert. De rest
  // en de netwerkcontrole komen daarna, anders staan zes git-processen per
  // project in de weg van de eerste klik.
  setTimeout(async () => {
    meldGitPadenAanMain()
    activeerGitVoorAccount()
    const open = projects.find(x => x.id === activeId)
    if (open) await ververesGitStaat(open, true)
    startGitPolling()
    // Wacht vanzelf tot het inloggen klaar is; zie wachtOpVrijVenster.
    controleerAchterstand()
  }, 800)

  setTimeout(() => { ververesAlleGitStaten(true) }, 3500)

  // Het main-proces houdt het sluiten tegen en vraagt ons na te kijken.
  try { window.api.opAfsluitControle((info) => controleerVoorAfsluiten(info)) } catch {}

  // Zijn er meerdere accounts, dan eerst vragen wie er achter de pc zit. Bij
  // één account is er niets te kiezen en vragen we dus ook niets.
  setTimeout(() => kiesAccountBijStart(), 300)
  setTimeout(() => toonStashMeldingBijStart(), 2000)

  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return
    if (cmdSorteerModus) {
      cmdSorteerModus = ''
      if (view === 'project') renderMain()
    }
    if (cmdSnelSorteerModus) {
      cmdSnelSorteerModus = false
      if (view === 'cmd') renderCmdPanel()
    }
    if (psSnelSorteerModus) {
      psSnelSorteerModus = false
      if (view === 'ps') renderPsPanel()
    }
    if (knopWisModus) {
      knopWisModus = ''
      hertekenWeergave()
    }
    if (cmdvisSorteerModus && !document.getElementById('modal-proj')?.hidden) {
      cmdvisSorteerModus = ''
      renderCmdVisibilitySection()
    }
    if (sorteerModus) {
      sorteerModus = ''
      renderSidebar()
    }
    if (boomVerplaatsModus) {
      zetBoomVerplaatsModus(false)
    }
  })

  setupBatDrop()

  // Terug in de app: kijken of een geopend bat-bestand elders is bijgewerkt
  window.addEventListener('focus', () => { checkBatFreshness() })

  window.api.onZoekTreffers(zoekTrefferBinnen)

  // Stukjes antwoord komen los binnen; ze horen bij de weergave die ze vroeg.
  if (window.api.onAiStuk) {
    window.api.onAiStuk(d => { if (d && d.id) aiStroomStuk(d.id, d.tekst || '') })
  }
  aiLaadProviders().then(aiHertekenAlsNodig)
  window.api.onPtyData(ptyDataBinnen)
  window.api.onPtyExit(ptyGestopt)
  window.addEventListener('resize', () => {
    if (termTab === 'output' || termSplitAan()) pasPtyMaatAan(ptySessies.get(activeTermId))
  })

  window.api.onOutput(({ projectId, type, text }) => {
    if (GitTools.gitSlotFout(text)) slotKlacht = true
    if (projectId === activeTermId) {
      if (STDIN_KLACHTEN.test(String(text || ''))) stdinKlacht = true
      appendLine(type, text)
      return
    }
    if (splitTweeProjecten() && werkSlots.some(s => s.projectId === projectId)) {
      appendLineNaar(projectId, 'terminal-andere', type, text)
    }
  })
})

// ── Titlebar ──────────────────────────────────────────────────────────────────
async function setupTitlebar() {
  document.getElementById('btn-min').onclick   = () => window.api.minimize()
  document.getElementById('btn-max').onclick   = () => window.api.maximize()
  document.getElementById('btn-close').onclick = () => window.api.close()

  // Broncode-rebuild hoort alleen in development. Geïnstalleerde exe's krijgen
  // later online updates; die knop daar tonen zou alleen verwarring zaaien.
  const updateBtn = document.getElementById('btn-update')
  try {
    const info = await window.api.runtimeInfo?.()
    if (info && info.packaged === false) updateBtn.hidden = false
  } catch {}

  updateBtn.onclick = async () => {
    if (!await vraagJaNee(I18N.t('update.confirmTitle'),
      I18N.t('update.confirmText'),
      I18N.t('update.confirmButton'))) return
    let r = await window.api.updateAndRestart()

    // Niets veranderd sinds de vorige build: dan hoeft er niets gesloopt en
    // gebouwd te worden. Wie toch wil, kan doorzetten.
    // Er loopt er al een. Meestal is dat een venster dat je nog open hebt staan;
    // soms is het een restje van een afgebroken poging.
    if (r?.reason === 'bezig') {
      const min = Math.max(1, Math.round((Date.now() - (r.sinds || Date.now())) / 60e3))
      if (!await vraagJaNee(I18N.t('update.busyTitle'),
        I18N.t(min === 1 ? 'update.busyTextOne' : 'update.busyTextMany', { min }),
        I18N.t('update.busyForceButton'), 'gevaar')) return
      r = await window.api.updateAndRestart({ force: true })
    }

    if (r?.reason === 'actueel') {
      if (!await vraagJaNee(I18N.t('update.currentTitle'),
        I18N.t('update.currentText'),
        I18N.t('update.currentForceButton'))) return
      r = await window.api.updateAndRestart({ force: true })
    }

    if (r && r.ok === false) {
      if (r.reason === 'invalid') await vraagKeuze({
        titel: I18N.t('update.invalidDirTitle'),
        tekst: I18N.t('update.invalidDirText'),
        regels: [r.dir],
        knoppen: [{ label: I18N.t('common.ok'), waarde: true, soort: 'primair' }],
      })
      return
    }
    showToast(I18N.t('update.startedToast'))
  }
}

// ── Navigatiegeschiedenis ─────────────────────────────────────────────────────
// Eén geschiedenis voor alles waar je "heen gaat": een ander scherm, een ander
// project, of een andere map in de verkenner. Vorige en volgende lopen daar
// doorheen zoals je van een browser gewend bent.
let navStack    = []
let navIndex    = -1
let navBezig    = false   // voorkomt dat het toepassen zichzelf weer opslaat

function huidigeLocatie() {
  return {
    view,
    projectId: activeId,
    tab: termTab,
    dir: termTab === 'browser' ? browserPath : null,
  }
}

function zelfdeLocatie(a, b) {
  return a && b && a.view === b.view && a.projectId === b.projectId
    && a.tab === b.tab && a.dir === b.dir
}

function navPush() {
  if (navBezig) return
  const loc = huidigeLocatie()
  if (zelfdeLocatie(navStack[navIndex], loc)) return

  // Vanuit het midden van de geschiedenis ergens heen: het stuk erna vervalt,
  // net als in een browser.
  navStack = navStack.slice(0, navIndex + 1)
  navStack.push(loc)
  if (navStack.length > 100) navStack.shift()
  navIndex = navStack.length - 1
  updateNavKnoppen()
}

async function pasLocatieToe(loc) {
  navBezig = true
  try {
    // Alleen opnieuw opbouwen als je echt naar een ander scherm of project
    // gaat: setView zet de verkenner terug naar de werkmap, en dat is precies
    // wat je bij het teruglopen door mappen níét wilt.
    const anderScherm  = loc.view !== view
    const anderProject = loc.view === 'project' && loc.projectId && loc.projectId !== activeId
    if (loc.projectId) activeId = loc.projectId
    if (anderScherm || anderProject) setView(loc.view)

    if (loc.tab === 'browser') {
      setTermTab('browser')
      if (loc.dir && loc.dir !== browserPath) await navigeerNaar(loc.dir)
    } else if (document.getElementById('browser')) {
      setTermTab('output')
    }
  } finally {
    navBezig = false
    updateNavKnoppen()
  }
}

async function navTerug() {
  if (navIndex <= 0) return
  navIndex--
  await pasLocatieToe(navStack[navIndex])
}

async function navVooruit() {
  if (navIndex >= navStack.length - 1) return
  navIndex++
  await pasLocatieToe(navStack[navIndex])
}

function updateNavKnoppen() {
  const terug = document.getElementById('btn-nav-back')
  const vooruit = document.getElementById('btn-nav-forward')
  if (terug)   terug.disabled   = navIndex <= 0
  if (vooruit) vooruit.disabled = navIndex >= navStack.length - 1
}

// Toetsenbordbediening van de lijst. Dit hangt aan het document: een lijst-div
// krijgt zelf geen toetsaanslagen.
function browserRegels() { return (brEl('br-list') || document).querySelectorAll('.br-item') }

// Klassen bijwerken zonder de hele lijst opnieuw op te bouwen
function toonSelectie() {
  browserRegels().forEach((el, i) => {
    el.classList.toggle('gekozen', browserSelectie.has(browserZichtbaar[i]?.path))
    el.classList.toggle('focus', i === browserFocus)
    // Geknipte items lichter tonen, zodat je ziet wat er straks weggaat
    el.classList.toggle('geknipt',
      bestandsKlembord.knippen && bestandsKlembord.paden.includes(browserZichtbaar[i]?.path))
  })
  toonSelectieStatus()
}

function toonSelectieStatus() {
  const balk = brEl('br-status')
  if (!balk) return
  const gekozen = browserZichtbaar.filter(i => browserSelectie.has(i.path))

  if (!gekozen.length) {
    const mappen = browserZichtbaar.filter(i => i.dir).length
    const bestanden = browserZichtbaar.length - mappen
    const telling = browserZichtbaar.length
      ? I18N.t('browser.status.folderFileCount', {
          folders: I18N.t(mappen === 1 ? 'browser.status.folderOne' : 'browser.status.folderMany', { n: mappen }),
          files: I18N.t(bestanden === 1 ? 'browser.status.fileOne' : 'browser.status.fileMany', { n: bestanden }),
        })
      : ''
    if (diepZoekenAan() && zoekStand !== 'uit') {
      if (zoekStand === 'wacht' || zoekStand === 'bezig') {
        balk.textContent = browserZichtbaar.length
          ? I18N.t('browser.status.searchingCount', { n: browserZichtbaar.length })
          : I18N.t('browser.status.searchingEmpty')
        return
      }
      const staart = zoekAfgekapt === 'genoeg'
        ? I18N.t('browser.status.searchMoreSuffix')
        : zoekAfgekapt === 'tijd'
          ? I18N.t('browser.status.searchTimeoutSuffix')
          : ''
      balk.textContent = telling ? I18N.t('browser.status.foundUnderFolder', { count: telling, suffix: staart }) : ''
      return
    }
    balk.textContent = telling
    return
  }

  const mappen = gekozen.filter(i => i.dir).length
  const bestanden = gekozen.length - mappen
  const bytes = gekozen.reduce((t, i) => t + (i.dir ? 0 : i.size || 0), 0)
  const stukjes = []
  if (bestanden) stukjes.push(I18N.t(bestanden === 1 ? 'browser.status.fileOne' : 'browser.status.fileMany', { n: bestanden }))
  if (mappen)    stukjes.push(I18N.t(mappen === 1 ? 'browser.status.folderOne' : 'browser.status.folderMany', { n: mappen }))
  balk.textContent = stukjes.join(I18N.t('browser.status.joiner')) + I18N.t('browser.status.selectedSuffix') + (bytes ? ' · ' + toonBytes(bytes) : '')
}

function selecteerAlleen(i) {
  browserSelectie = new Set(browserZichtbaar[i] ? [browserZichtbaar[i].path] : [])
  browserFocus = i
  browserAnker = i
  toonSelectie()
}

// Ctrl+klik: deze regel erbij of eraf, de rest blijft staan
function wisselSelectie(i) {
  const pad = browserZichtbaar[i]?.path
  if (!pad) return
  if (browserSelectie.has(pad)) browserSelectie.delete(pad)
  else browserSelectie.add(pad)
  browserFocus = i
  browserAnker = i
  toonSelectie()
}

// Shift+klik: alles tussen het anker en hier
function selecteerReeks(i, erbij = false) {
  if (browserAnker < 0) browserAnker = i
  const van = Math.min(browserAnker, i)
  const tot = Math.max(browserAnker, i)
  if (!erbij) browserSelectie = new Set()
  for (let n = van; n <= tot; n++) {
    const pad = browserZichtbaar[n]?.path
    if (pad) browserSelectie.add(pad)
  }
  browserFocus = i
  toonSelectie()
}

function wisSelectie() {
  browserSelectie = new Set()
  browserFocus = -1
  browserAnker = -1
  toonSelectie()
}

function selecteerAlles() {
  browserSelectie = new Set(browserZichtbaar.map(i => i.path))
  browserAnker = 0
  browserFocus = browserZichtbaar.length - 1
  toonSelectie()
}

// Pijltjes verplaatsen de aandacht; met Shift groeit de reeks mee
// Hoeveel tegels er naast elkaar staan. In een lijst is dat er altijd één; in
// tegels tellen we hoeveel er dezelfde bovenkant delen.
function kolommenInLijst() {
  if (!isTegelWeergave()) return 1
  const regels = browserRegels()
  if (regels.length < 2) return 1
  const top = regels[0].offsetTop
  let n = 0
  for (const el of regels) {
    if (el.offsetTop !== top) break
    n++
  }
  // Zonder opmaak (of bij één rij) weten we het niet; dan maar één stap.
  return n > 0 && n < regels.length ? n : 1
}

function verplaatsBrowserFocus(stap, metShift = false) {
  if (!browserZichtbaar.length) return
  const volgende = browserFocus < 0
    ? (stap > 0 ? 0 : browserZichtbaar.length - 1)
    : Math.min(browserZichtbaar.length - 1, Math.max(0, browserFocus + stap))

  if (metShift) selecteerReeks(volgende)
  else selecteerAlleen(volgende)
  browserRegels()[volgende]?.scrollIntoView?.({ block: 'nearest' })
}

// ── Vragen stellen in de stijl van de app ─────────────────────────────────────
// Het venster van Windows zelf gebruikt lichte systeemkleuren en kent maar twee
// knoppen. Dit venster past bij de rest en kan er zoveel als nodig.
let vraagKlaar = null

function vraagKeuze({ titel, tekst, regels = [], knoppen }) {
  return new Promise(resolve => {
    vraagKlaar = resolve
    document.getElementById('vraag-titel').textContent = titel
    const uitleg = document.getElementById('vraag-tekst')
    uitleg.textContent = tekst || ''
    uitleg.hidden = !tekst

    const lijst = document.getElementById('vraag-lijst')
    lijst.hidden = !regels.length
    lijst.innerHTML = regels.slice(0, 40).map(r => `<div class="vraag-regel">${esc(r)}</div>`).join('')
      + (regels.length > 40 ? `<div class="vraag-regel">… en nog ${regels.length - 40}</div>` : '')

    const vak = document.getElementById('vraag-knoppen')
    // Twee keuzes passen naast elkaar; meer niet — dan breken de labels
    // middenin. Zie .modal-footer.kolom in style.css.
    vak.className = 'modal-footer' + (knoppen.length > 2 ? ' kolom' : '')
    vak.innerHTML = knoppen.map((k, i) =>
      `<button class="${k.soort === 'gevaar' ? 'btn-danger' : k.soort === 'primair' ? 'btn-primary' : 'btn-ghost'}" data-v="${i}">${esc(k.label)}</button>`).join('')
    vak.querySelectorAll('[data-v]').forEach(el =>
      el.onclick = () => sluitVraag(knoppen[parseInt(el.dataset.v)].waarde))

    document.getElementById('modal-vraag').hidden = false
    requestAnimationFrame(() => vak.querySelector('.btn-primary, .btn-danger, button')?.focus())
  })
}

function sluitVraag(waarde) {
  document.getElementById('modal-vraag').hidden = true
  const klaar = vraagKlaar
  vraagKlaar = null
  klaar?.(waarde)
}

// Kort: ja of nee, met de juiste kleur voor de bevestiging
function vraagJaNee(titel, tekst, jaLabel = I18N.t('common.yes'), soort = 'primair', regels = []) {
  return vraagKeuze({
    titel, tekst, regels,
    knoppen: [
      { label: I18N.t('common.cancel'), waarde: false },
      { label: jaLabel, waarde: true, soort },
    ],
  })
}

// Eén regel tekst vragen. Geeft de ingevoerde tekst terug, of null bij
// annuleren. Enter bevestigt, Escape annuleert.
function vraagTekst({ titel, tekst = '', waarde = '', placeholder = '', okLabel = '', soort = 'primair', verborgen = false }) {
  return new Promise(resolve => {
    vraagKlaar = resolve
    const mijnKlaar = resolve
    document.getElementById('vraag-titel').textContent = titel
    const uitleg = document.getElementById('vraag-tekst')
    uitleg.textContent = tekst
    uitleg.hidden = !tekst

    const lijst = document.getElementById('vraag-lijst')
    lijst.hidden = false
    lijst.innerHTML = `<input type="${verborgen ? 'password' : 'text'}" class="vraag-invoer" id="vraag-invoer"
      ${verborgen ? 'autocomplete="off" spellcheck="false"' : ''} placeholder="${esc(placeholder)}" />`
    const invoer = lijst.querySelector('#vraag-invoer')
    invoer.value = waarde

    const vak = document.getElementById('vraag-knoppen')
    vak.className = 'modal-footer'        // dezelfde bak; kolomstand weer eraf
    vak.innerHTML = `<button class="btn-ghost" data-v="0">${esc(I18N.t('common.cancel'))}</button>`
      + `<button class="${soort === 'gevaar' ? 'btn-danger' : 'btn-primary'}" data-v="1">${esc(okLabel || I18N.t('common.ok'))}</button>`

    const af = (bevestigd) => {
      document.removeEventListener('keydown', vangToets, true)
      sluitVraag(bevestigd ? invoer.value.trim() : null)
    }
    vak.querySelector('[data-v="0"]').onclick = () => af(false)
    vak.querySelector('[data-v="1"]').onclick = () => af(true)

    // Waar de cursor ook staat: typen hoort in dit veld te belanden en Enter
    // hoort te bevestigen. Zonder dit verdween een pincode in het niets zodra
    // de focus op een knop of op de achtergrond stond, en dat is precies waar
    // je hem intypt zonder te kijken.
    const vangToets = (e) => {
      // Is dit venster inmiddels van iemand anders (of al gesloten), dan hoort
      // deze luisteraar er niet meer te zijn.
      if (vraagKlaar !== mijnKlaar) { document.removeEventListener('keydown', vangToets, true); return }
      if (document.getElementById('modal-vraag').hidden || !invoer.isConnected) return
      if (e.ctrlKey || e.metaKey || e.altKey) return
      if (e.key === 'Tab') return
      if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); af(false); return }
      if (e.key === 'Enter')  { e.preventDefault(); e.stopPropagation(); af(true); return }
      if (document.activeElement === invoer) return

      const bij = (tekst) => {
        e.preventDefault(); e.stopPropagation()
        invoer.focus()
        invoer.value += tekst
      }
      if (e.key.length === 1) { bij(e.key); return }
      if (e.key === 'Backspace') {
        e.preventDefault(); e.stopPropagation()
        invoer.focus()
        invoer.value = invoer.value.slice(0, -1)
        return
      }
      // Num Lock uit: het numerieke blok stuurt pijltjes. De fysieke toets
      // klopt wel, en in een pincodeveld is dat gewoon een cijfer.
      if (verborgen) {
        const cijfer = Accounts.cijferUitToets(e.code, e.key)
        if (cijfer) bij(cijfer)
      }
    }
    document.addEventListener('keydown', vangToets, true)

    invoer.onkeydown = (e) => {
      if (verborgen && !e.ctrlKey && !e.altKey && !e.metaKey) {
        // Num Lock uit: de cijfertoetsen rechts sturen dan een pijltje in
        // plaats van een cijfer. De fysieke toets klopt wel, dus die gebruiken
        // we — anders kun je je pincode niet intypen op het numerieke blok.
        const cijfer = Accounts.cijferUitToets(e.code, e.key)
        if (cijfer) {
          e.preventDefault()
          invoer.value += cijfer
        } else if (e.code === 'NumpadDecimal' || e.code === 'Delete') {
          // Met Num Lock uit is dat de Del-toets; die hoort niets te doen in
          // een pincodeveld en zou anders de cursor laten springen.
          e.preventDefault()
        }
      }
    }

    document.getElementById('modal-vraag').hidden = false
    // Meteen én in het volgende beeldje. Staat het venster op de achtergrond,
    // dan komt requestAnimationFrame pas als het weer zichtbaar is; dan is die
    // eerste focus wat je redt.
    invoer.focus(); invoer.select()
    requestAnimationFrame(() => { invoer.focus(); invoer.select() })
  })
}

// Kort iets melden met alleen een ok-knop.
function meldKort(titel, tekst, regels = []) {
  return vraagKeuze({ titel, tekst, regels, knoppen: [{ label: I18N.t('common.ok'), waarde: true, soort: 'primair' }] })
}

// ── Rechtsklikmenu ────────────────────────────────────────────────────────────
// De opties hangen af van wat je hebt aangewezen: één bestand, meerdere, of een
// lege plek. Binnen een archief valt het meeste af, want daar kun je niets
// wijzigen.
let laatsteMenuPlek = { x: 0, y: 0 }

function toonContextMenu(x, y, items) {
  const menu = document.getElementById('ctx-menu')
  if (!menu) return
  laatsteMenuPlek = { x, y }

  menu.innerHTML = items.map((it, i) => it.scheiding
    ? '<div class="ctx-lijn"></div>'
    : `<button class="ctx-item ${it.uit ? 'uit' : ''}" data-c="${i}" ${it.uit ? 'disabled' : ''}>
         <i class="ti ${it.icoon || 'ti-point'}"></i> ${esc(it.label)}
       </button>`).join('')

  menu.hidden = false
  // Eerst tonen om de afmetingen te weten, dan pas binnen het venster schuiven
  const doos = menu.getBoundingClientRect()
  const maxX = (window.innerWidth || 1000) - (doos.width || 200) - 8
  const maxY = (window.innerHeight || 700) - (doos.height || 200) - 8
  menu.style.left = Math.max(4, Math.min(x, maxX)) + 'px'
  menu.style.top  = Math.max(4, Math.min(y, maxY)) + 'px'

  menu.querySelectorAll('[data-c]').forEach(el => {
    el.onclick = () => {
      const it = items[parseInt(el.dataset.c)]
      sluitContextMenu()
      it.doe?.()
    }
  })
}

function sluitContextMenu() {
  const menu = document.getElementById('ctx-menu')
  if (menu) { menu.hidden = true; menu.innerHTML = '' }
  // De knop die dit menu opende licht op zolang het openstaat. Gaat het dicht,
  // dan hoort die gloed ook weg te zijn: anders lijkt er nog iets open.
  document.querySelectorAll('.knop-map.aan, .loc-knop.aan').forEach(b => b.classList.remove('aan'))
}

function gekozenItems() {
  return browserZichtbaar.filter(i => browserSelectie.has(i.path))
}

function bouwContextMenu(item) {
  const gekozen  = gekozenItems()
  const meerdere = gekozen.length > 1
  const inArch   = inArchief(browserPath) || !!item?.inArchief
  const items    = []

  if (item) {
    items.push({
      label: meerdere ? I18N.t('ctx.openCount', { count: gekozen.length }) : I18N.t('ctx.open'), icoon: 'ti-external-link',
      doe: () => (meerdere ? gekozen : [item]).forEach(i => openBrowserItem(i)),
    })
    if (!meerdere && !item.dir && !inArch) {
      items.push({ label: I18N.t('ctx.openWith'), icoon: 'ti-apps', doe: () => window.api.openWith(item.path) })
    }
    items.push({ scheiding: true })
    items.push({
      label: meerdere ? I18N.t('ctx.copyPathsCount', { count: gekozen.length }) : I18N.t('ctx.copyPath'), icoon: 'ti-clipboard',
      doe: () => {
        navigator.clipboard.writeText((meerdere ? gekozen : [item]).map(i => i.path).join('\r\n'))
        showToast(meerdere ? I18N.t('toast.pathsCopiedMany', { count: gekozen.length }) : I18N.t('toast.pathCopiedOne'))
      },
    })
    items.push({
      label: I18N.t('ctx.copyName'), icoon: 'ti-abc',
      doe: () => {
        navigator.clipboard.writeText((meerdere ? gekozen : [item]).map(i => i.name).join('\r\n'))
        showToast(I18N.t('toast.nameCopied'))
      },
    })
    if (item.dir && !item.schijf && !inArch) {
      items.push({
        label: grootteCache.has(item.path) ? I18N.t('ctx.recalcSize') : I18N.t('ctx.calcSize'),
        icoon: 'ti-ruler-measure',
        doe: () => meetDezeMap(item),
      })
    }
    if (!inArch) {
      items.push({ label: I18N.t('ctx.revealInExplorer'), icoon: 'ti-folder-open', doe: () => window.api.revealItem(item.path) })
      items.push({ scheiding: true })
      items.push({ label: I18N.t('ctx.copy'), icoon: 'ti-copy', doe: () => kopieerNaarKlembord(meerdere ? gekozen : [item], false) })
      items.push({ label: I18N.t('ctx.cut'),  icoon: 'ti-cut',  doe: () => kopieerNaarKlembord(meerdere ? gekozen : [item], true) })
    }
    items.push({ scheiding: true })
  }

  if (!inArch && browserPath && browserPath !== DEZE_PC) {
    items.push({
      label: bestandsKlembord.paden.length
        ? I18N.t('ctx.pasteCount', { count: bestandsKlembord.paden.length }) : I18N.t('ctx.paste'),
      icoon: 'ti-clipboard-plus',
      uit: !bestandsKlembord.paden.length,
      doe: () => plakHier(),
    })
    items.push({ label: I18N.t('ctx.viewClipboard'), icoon: 'ti-clipboard-list', doe: () => toonKlembord() })
    if (item) {
      items.push({
        label: meerdere ? I18N.t('ctx.deleteCount', { count: gekozen.length }) : I18N.t('ctx.delete'),
        icoon: 'ti-trash',
        doe: () => verwijderItems(meerdere ? gekozen : [item], false),
      })
      if (!meerdere) items.push({ label: I18N.t('ctx.rename'), icoon: 'ti-pencil', doe: () => hernoemItem(item) })
    }
    items.push({ scheiding: true })
    items.push({ label: I18N.t('ctx.newFile'), icoon: 'ti-file-plus', doe: () => maakNieuw(false) })
    items.push({ label: I18N.t('ctx.newFolder'),    icoon: 'ti-folder-plus', doe: () => maakNieuw(true) })
    if (item) {
      items.push({
        label: meerdere ? I18N.t('ctx.zipCount', { count: gekozen.length }) : I18N.t('ctx.zip'),
        icoon: 'ti-file-zip',
        doe: () => pakIn(meerdere ? gekozen : [item]),
      })
    }
    items.push({ scheiding: true })
  }

  items.push({ scheiding: true })
  items.push({
    label: I18N.t('ctx.viewMenu'), icoon: 'ti-layout-grid',
    doe: () => weergaveMenu(laatsteMenuPlek.x, laatsteMenuPlek.y),
  })
  items.push({
    label: I18N.t('ctx.sortMenu'), icoon: 'ti-arrows-sort',
    doe: () => sorteerMenu(laatsteMenuPlek.x, laatsteMenuPlek.y),
  })
  items.push({ scheiding: true })
  items.push({ label: I18N.t('ctx.refresh'), icoon: 'ti-refresh', doe: () => navigeerNaar(browserPath) })
  if (item && !inArch) {
    items.push({ label: I18N.t('ctx.properties'), icoon: 'ti-info-circle', doe: () => toonEigenschappen(item.path) })
  }
  return items
}

// ── Klembord voor bestanden ───────────────────────────────────────────────────
// Eigen klembord, los van het tekstklembord van Windows: we moeten immers ook
// onthouden of het om knippen of kopiëren ging.
let bestandsKlembord = { paden: [], knippen: false }

// Alles wat je deze sessie gekopieerd of geknipt hebt, nieuwste eerst. Windows
// onthoudt maar één ding tegelijk; hier kun je terug naar een eerdere kopie.
let klembordLog = []
const KLEMBORD_LOG_MAX = 25
let klembordKeuze = 0          // welke regel in het venster aangewezen staat

function zelfdeSet(a, b) {
  return a.length === b.length && a.every((p, i) => p === b[i])
}

function onthoudKopie(paden, knippen, vanBuiten = false) {
  if (!paden.length) return
  // Precies dezelfde set niet twee keer: die schuift alleen naar boven
  klembordLog = klembordLog.filter(k => !zelfdeSet(k.paden, paden))
  klembordLog.unshift({ paden: [...paden], knippen, vanBuiten, tijd: Date.now() })
  if (klembordLog.length > KLEMBORD_LOG_MAX) klembordLog.length = KLEMBORD_LOG_MAX
  klembordKeuze = 0
}

async function kopieerNaarKlembord(items, knippen) {
  bestandsKlembord = { paden: items.map(i => i.path), knippen }
  onthoudKopie(bestandsKlembord.paden, knippen)
  toonSelectie()

  // Ook op het klembord van Windows zetten, zodat je in de verkenner of een
  // ander programma gewoon kunt plakken.
  const r = await window.api.zetKlembord({ paden: bestandsKlembord.paden, knippen })
  const basis = knippen
    ? (items.length === 1 ? I18N.t('toast.cutOne') : I18N.t('toast.cutMany', { count: items.length }))
    : (items.length === 1 ? I18N.t('toast.copiedOne') : I18N.t('toast.copiedMany', { count: items.length }))
  showToast(basis + (r?.ok ? '' : I18N.t('toast.localOnlySuffix')))
}

// Wat er te plakken valt: eerst kijken of Windows iets nieuwers heeft, zodat je
// ook kunt plakken wat je in de verkenner hebt gekopieerd.
async function haalKlembord() {
  const w = await window.api.leesKlembord()
  if (w?.ok && w.paden.length && !zelfdeSet(w.paden, bestandsKlembord.paden)) {
    // Buiten de app gekopieerd: dat hoort ook in de lijst thuis
    onthoudKopie(w.paden, w.knippen, true)
    bestandsKlembord = { paden: w.paden, knippen: w.knippen }
    return { paden: w.paden, knippen: w.knippen, vanBuiten: true }
  }
  return { ...bestandsKlembord, vanBuiten: false }
}

async function plakHier(bron) {
  const { paden, knippen } = bron || await haalKlembord()
  if (!paden.length) { showToast(I18N.t('toast.clipboardEmpty')); return }
  if (inArchief(browserPath) || browserPath === DEZE_PC) { showToast(I18N.t('toast.cannotPasteHere')); return }

  // Bestaat er al iets met dezelfde naam? Dan eerst vragen wat je wilt.
  let bijConflict = 'hernoemen'
  const c = await window.api.conflicten({ bronnen: paden, doelMap: browserPath })
  if (c?.ok && c.namen.length) {
    const keuze = await vraagKeuze({
      titel: c.namen.length === 1 ? I18N.t('dialog.conflictTitleOne') : I18N.t('dialog.conflictTitleMany', { count: c.namen.length }),
      regels: c.namen,
      knoppen: [
        { label: I18N.t('common.cancel'),          waarde: null },
        { label: I18N.t('dialog.conflictKeepBoth'), waarde: 'hernoemen', soort: 'primair' },
        { label: I18N.t('dialog.conflictReplace'),  waarde: 'vervangen', soort: 'gevaar' },
      ],
    })
    if (!keuze) return       // annuleren: er gebeurt niets
    bijConflict = keuze
  }

  const r = await window.api.kopieerItems({ bronnen: paden, doelMap: browserPath, verplaatsen: knippen, bijConflict })
  if (!r || !r.ok) { browserFout = I18N.t('error.pasteFailedPrefix') + (r?.reason || I18N.t('common.unknownError')); renderBrowser(); return }

  if (knippen) bestandsKlembord = { paden: [], knippen: false }
  paden.forEach(vergeetGroottes)
  vergeetGroottes(browserPath)
  await navigeerNaar(browserPath)

  if (r.afgebroken) showToast(I18N.t('toast.aborted'))
  else if (r.fouten?.length) { browserFout = r.fouten.join(' · '); renderBrowser() }
  else showToast(
    (r.gedaan === 1
      ? (knippen ? I18N.t('toast.movedOne') : I18N.t('toast.copiedOne'))
      : (knippen ? I18N.t('toast.movedMany', { count: r.gedaan }) : I18N.t('toast.copiedMany', { count: r.gedaan })))
    + (r.overgeslagen ? I18N.t('toast.skippedSuffix', { count: r.overgeslagen }) : ''))
}

// Ctrl+Shift+V: de kopieerlijst van deze sessie. Windows onthoudt maar één
// ding tegelijk, dus wat je eerder kopieerde is daar weg — hier niet.
async function toonKlembord() {
  await haalKlembord()          // is er buiten de app iets nieuws gekopieerd?
  klembordKeuze = 0
  tekenKlembord()
  document.getElementById('modal-klembord').hidden = false
}

function tekenKlembord() {
  const lijst = document.getElementById('klembord-lijst')
  if (!lijst) return

  document.getElementById('klembord-titel').textContent = klembordLog.length
    ? (klembordLog.length === 1 ? I18N.t('clipboard.titleOne') : I18N.t('clipboard.titleMany', { count: klembordLog.length }))
    : I18N.t('clipboard.empty')

  if (!klembordLog.length) {
    lijst.innerHTML = `<div class="prog-leeg">${I18N.t('clipboard.emptyHint')}</div>`
  } else {
    lijst.innerHTML = klembordLog.map((k, n) => {
      const namen = k.paden.map(p => p.split(/[\\/]/).pop())
      const eerste = k.paden[0] || ''
      return `
        <div class="klem-item ${n === klembordKeuze ? 'gekozen' : ''}" data-k="${n}">
          <i class="ti ${k.knippen ? 'ti-cut' : k.paden.length > 1 ? 'ti-copy' : /\.[a-z0-9]+$/i.test(eerste) ? 'ti-file' : 'ti-folder'}"></i>
          <div class="found-main">
            <div class="found-naam">${esc(namen.slice(0, 3).join(', '))}${namen.length > 3 ? ` +${namen.length - 3}` : ''}</div>
            <div class="found-pad mono">${esc(shortenPath(eerste.replace(/[\\/][^\\/]+$/, '') || eerste, 52))}</div>
          </div>
          <span class="klem-tijd">${k.knippen ? I18N.t('clipboard.cutPrefix') : ''}${k.vanBuiten ? I18N.t('clipboard.externalPrefix') : ''}${esc(relTime(k.tijd))}</span>
          <button class="klem-weg" data-weg="${n}" title="${I18N.t('clipboard.removeFromListTitle')}"><i class="ti ti-x"></i></button>
        </div>`
    }).join('')
  }

  lijst.querySelectorAll('[data-k]').forEach(el => {
    el.onclick = (e) => {
      if (e.target.closest('[data-weg]')) return
      klembordKeuze = parseInt(el.dataset.k)
      tekenKlembord()
    }
    el.ondblclick = () => { klembordKeuze = parseInt(el.dataset.k); plakGekozenKopie() }
  })
  lijst.querySelectorAll('[data-weg]').forEach(el => {
    el.onclick = (e) => {
      e.stopPropagation()
      klembordLog.splice(parseInt(el.dataset.weg), 1)
      if (klembordKeuze >= klembordLog.length) klembordKeuze = Math.max(0, klembordLog.length - 1)
      tekenKlembord()
    }
  })

  document.getElementById('klembord-plak').disabled = !klembordLog.length
  document.getElementById('klembord-leeg').disabled = !klembordLog.length
}

// De aangewezen kopie plakken. Die gaat ook meteen weer op het klembord van
// Windows, zodat je hem daarna gewoon met Ctrl+V kunt blijven gebruiken.
async function plakGekozenKopie() {
  const keuze = klembordLog[klembordKeuze]
  if (!keuze) return
  sluitKlembordVenster()
  bestandsKlembord = { paden: [...keuze.paden], knippen: keuze.knippen }
  window.api.zetKlembord({ paden: keuze.paden, knippen: keuze.knippen })
  await plakHier({ paden: keuze.paden, knippen: keuze.knippen })
}

function sluitKlembordVenster() {
  document.getElementById('modal-klembord').hidden = true
}

async function verwijderItems(items, definitief) {
  if (!items.length) return
  const wat = items.length === 1 ? `"${items[0].name}"` : I18N.t('common.itemsCount', { count: items.length })

  if (definitief && !await vraagJaNee(I18N.t('dialog.deletePermanentTitle', { what: wat }),
    I18N.t('dialog.deletePermanentText'),
    I18N.t('dialog.deletePermanentConfirm'), 'gevaar', items.map(i => i.name))) return
  if (!definitief && items.length > 3 && !await vraagJaNee(I18N.t('dialog.deleteTrashTitle', { what: wat }),
    I18N.t('dialog.deleteTrashText'),
    I18N.t('dialog.deleteTrashConfirm'), 'primair', items.map(i => i.name))) return

  const r = await window.api.verwijderItems({ paden: items.map(i => i.path), definitief })
  if (!r || !r.ok) { browserFout = I18N.t('error.deleteFailedPrefix') + (r?.reason || I18N.t('common.unknownError')); renderBrowser(); return }

  items.forEach(i => vergeetGroottes(i.path))
  vergeetGroottes(browserPath)
  await navigeerNaar(browserPath)
  if (r.fouten?.length) { browserFout = r.fouten.join(' · '); renderBrowser(); return }
  showToast(r.gedaan === 1
    ? (definitief ? I18N.t('toast.deletedOne') : I18N.t('toast.trashedOne'))
    : (definitief ? I18N.t('toast.deletedMany', { count: r.gedaan }) : I18N.t('toast.trashedMany', { count: r.gedaan })))
}

async function hernoemItem(item) {
  const naam = await vraagNaam({ titel: I18N.t('ctx.rename'), label: I18N.t('dialog.newNameLabel'), waarde: item.name })
  if (!naam || naam === item.name) return

  const r = await window.api.hernoemItem({ pad: item.path, naam })
  if (!r || !r.ok) { browserFout = I18N.t('error.renameFailedPrefix') + (r?.reason || I18N.t('common.unknownError')); renderBrowser(); return }

  showToast(I18N.t('toast.renamedTo', { name: naam }))
  vergeetGroottes(item.path)
  await navigeerNaar(browserPath)
  const n = browserZichtbaar.findIndex(i => i.path === r.path)
  if (n >= 0) selecteerAlleen(n)
}

async function maakNieuw(isMap) {
  const naam = await vraagNaam({
    titel: isMap ? I18N.t('ctx.newFolder') : I18N.t('ctx.newFile'),
    label: I18N.t('common.name'),
    waarde: isMap ? I18N.t('dialog.newFolderDefaultName') : I18N.t('dialog.newFileDefaultName'),
  })
  if (!naam) return

  const r = await window.api.nieuwItem({ map: browserPath, naam, isMap })
  if (!r || !r.ok) { browserFout = r?.reason || I18N.t('error.createFailed'); renderBrowser(); return }

  showToast(r.hernoemd
    ? I18N.t('toast.createdRenamed', { name: r.path.split(/[\\/]/).pop() })
    : (isMap ? I18N.t('toast.folderCreated') : I18N.t('toast.fileCreated')))
  vergeetGroottes(browserPath)
  await navigeerNaar(browserPath)
  // De nieuwe regel meteen aanwijzen
  const n = browserZichtbaar.findIndex(i => i.path === r.path)
  if (n >= 0) selecteerAlleen(n)
}

async function pakIn(items) {
  const voorstel = items.length === 1
    ? items[0].name.replace(/\.[^.]+$/, '') + '.zip'
    : (browserPath.split(/[\\/]/).filter(Boolean).pop() || I18N.t('dialog.archiveDefaultName')) + '.zip'

  const naam = await vraagNaam({ titel: I18N.t('ctx.zip'), label: I18N.t('dialog.fileNameLabel'), waarde: voorstel })
  if (!naam) return

  showToast(I18N.t('toast.zipping'))
  const doel = browserPath.replace(/[\\/]+$/, '') + '\\' + (/\.zip$/i.test(naam) ? naam : naam + '.zip')
  const r = await window.api.maakZip({ paden: items.map(i => i.path), doel })
  if (!r || !r.ok) { browserFout = I18N.t('error.zipFailedPrefix') + (r?.reason || I18N.t('common.unknownError')); renderBrowser(); return }

  showToast(r.aantal === 1
    ? I18N.t('toast.zippedOne', { size: toonBytes(r.grootte) })
    : I18N.t('toast.zippedMany', { count: r.aantal, size: toonBytes(r.grootte) }))
  vergeetGroottes(browserPath)
  await navigeerNaar(browserPath)
}

async function toonEigenschappen(pad) {
  const r = await window.api.bestandInfo(pad)
  const lijst = document.getElementById('info-lijst')
  if (!r || !r.ok) {
    lijst.innerHTML = `<div class="info-rij"><span>${I18N.t('common.error')}</span><span>${esc(r?.reason || I18N.t('common.unknown'))}</span></div>`
  } else {
    const datum = (ms) => ms ? new Date(ms).toLocaleString(I18N.getLanguage()) : '—'
    const padLabel = I18N.t('props.path')
    const rijen = [
      [I18N.t('props.name'), r.naam],
      [I18N.t('props.type'), r.map ? I18N.t('props.folder') : (r.naam.match(/\.([^.]+)$/)?.[1] ? I18N.t('props.fileTypeExt', { ext: r.naam.match(/\.([^.]+)$/)[1].toUpperCase() }) : I18N.t('props.file'))],
      [I18N.t('props.size'), r.map ? I18N.t('props.folderSizeUnknown') : toonBytes(r.size)],
      [I18N.t('props.modified'), datum(r.gewijzigd)],
      [I18N.t('props.created'), datum(r.gemaakt)],
      [I18N.t('props.readonly'), r.alleenLezen ? I18N.t('common.yes') : I18N.t('common.no')],
      [padLabel, r.path],
    ]
    lijst.innerHTML = rijen.map(([k, v]) =>
      `<div class="info-rij"><span>${esc(k)}</span><span class="${k === padLabel ? 'mono info-pad' : ''}">${esc(String(v))}</span></div>`).join('')
  }
  document.getElementById('modal-info').hidden = false
}

// Kleine hulpdialoog: vraagt om een naam en geeft die terug (of null)
let naamKlaar = null
function vraagNaam({ titel, label, waarde }) {
  return new Promise(resolve => {
    naamKlaar = resolve
    document.getElementById('modal-naam-titel').textContent = titel
    document.getElementById('modal-naam-label').textContent = label
    const veld = document.getElementById('naam-invoer')
    veld.value = waarde || ''
    document.getElementById('naam-fout').hidden = true
    document.getElementById('modal-naam').hidden = false
    requestAnimationFrame(() => {
      veld.focus()
      // De extensie niet meeselecteren; die wil je meestal laten staan
      const punt = veld.value.lastIndexOf('.')
      veld.setSelectionRange(0, punt > 0 ? punt : veld.value.length)
    })
  })
}

function sluitNaamVraag(waarde) {
  document.getElementById('modal-naam').hidden = true
  // Focus loslaten, anders vangt het invoerveld daarna nog toetsen af
  document.getElementById('naam-invoer').blur()
  const klaar = naamKlaar
  naamKlaar = null
  klaar?.(waarde)
}

function setupContextMenu() {
  document.addEventListener('contextmenu', (e) => {
    const lijst = brEl('br-list')
    if (termTab !== 'browser' || !lijst || !lijst.contains(e.target) || anyModalOpen()) return
    e.preventDefault()

    const rij = e.target.closest('.br-item')
    let item = null
    if (rij) {
      const n = parseInt(rij.dataset.i)
      item = browserZichtbaar[n]
      // Rechtsklikken buiten de selectie wijst eerst dat ene aan
      if (!browserSelectie.has(item.path)) selecteerAlleen(n)
    }
    toonContextMenu(e.clientX, e.clientY, bouwContextMenu(item))
  })

  document.addEventListener('mousedown', (e) => {
    const menu = document.getElementById('ctx-menu')
    if (menu && !menu.hidden && !menu.contains(e.target)) sluitContextMenu()

    // Het themamenu in het woordenboek gaat ook dicht als je ernaast klikt
    const thema = document.getElementById('dict-thema-menu')
    if (thema && !thema.hidden && !thema.contains(e.target)
        && !document.getElementById('dict-thema')?.contains(e.target)) thema.hidden = true
  })
  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return
    sluitContextMenu()
    // Eerst de wismodus eruit; anders sluit het menu en staat die er de
    // volgende keer nog aan zonder dat je het verwacht.
    if (themaWisModus) { themaWisModus = false; bouwThemaMenu(); return }
    const thema = document.getElementById('dict-thema-menu')
    if (thema) thema.hidden = true
  })
}

// ── Selectiekader ─────────────────────────────────────────────────────────────
// Vanaf een lege plek slepen trekt een kader; alles wat eronder ligt komt in de
// selectie. Met Ctrl erbij blijft wat je al had staan.
function regelsInKader(kader, regels) {
  const raakt = []
  regels.forEach((el, i) => {
    const r = el.getBoundingClientRect()
    const overlap = r.left < kader.right && r.right > kader.left
                 && r.top  < kader.bottom && r.bottom > kader.top
    if (overlap) raakt.push(i)
  })
  return raakt
}

// Eén keer instellen bij het opstarten. De verkenner wordt per paneel opnieuw
// opgebouwd; luisteraars per keer toevoegen zou ze laten opstapelen.
function setupSelectieKader() {
  let bezig = false
  let startX = 0, startY = 0
  let beginSelectie = null

  document.addEventListener('mousedown', (e) => {
    const lijst = brEl('br-list')
    const kader = brEl('br-kader')
    if (!lijst || !kader || termTab !== 'browser') return
    // Alleen binnen de lijst, en alleen vanaf een lege plek: op een regel
    // betekent slepen iets anders.
    if (e.button !== 0 || !lijst.contains(e.target) || e.target.closest('.br-item')) return
    bezig = true
    const doos = lijst.getBoundingClientRect()
    startX = e.clientX; startY = e.clientY
    beginSelectie = e.ctrlKey ? new Set(browserSelectie) : new Set()
    if (!e.ctrlKey) wisSelectie()

    kader.hidden = false
    kader.style.left = (startX - doos.left + lijst.scrollLeft) + 'px'
    kader.style.top  = (startY - doos.top  + lijst.scrollTop) + 'px'
    kader.style.width = '0px'
    kader.style.height = '0px'
    e.preventDefault()
  })

  document.addEventListener('mousemove', (e) => {
    if (!bezig) return
    const lijst = brEl('br-list')
    const kader = brEl('br-kader')
    if (!lijst || !kader) { bezig = false; return }
    const doos = lijst.getBoundingClientRect()
    const links = Math.min(startX, e.clientX)
    const boven = Math.min(startY, e.clientY)
    const breed = Math.abs(e.clientX - startX)
    const hoog  = Math.abs(e.clientY - startY)

    kader.style.left = (links - doos.left + lijst.scrollLeft) + 'px'
    kader.style.top  = (boven - doos.top  + lijst.scrollTop) + 'px'
    kader.style.width = breed + 'px'
    kader.style.height = hoog + 'px'

    const raakt = regelsInKader(
      { left: links, top: boven, right: links + breed, bottom: boven + hoog },
      [...browserRegels()])

    browserSelectie = new Set(beginSelectie)
    raakt.forEach(i => { const p = browserZichtbaar[i]?.path; if (p) browserSelectie.add(p) })
    toonSelectie()
  })

  document.addEventListener('mouseup', () => {
    if (!bezig) return
    bezig = false
    const kader = brEl('br-kader')
    if (kader) kader.hidden = true
    // Het anker op de eerste geraakte regel zetten, zodat Shift daarna klopt
    const eerste = browserZichtbaar.findIndex(i => browserSelectie.has(i.path))
    if (eerste >= 0) { browserAnker = eerste; browserFocus = eerste; toonSelectie() }
  })
}

// Voortgang van een kopieer- of verplaatsactie
function setupVoortgang() {
  window.api.onVoortgang((d) => {
    const vak = brEl('br-voortgang')
    if (!vak) return
    if (!d.bezig) { vak.hidden = true; return }

    vak.hidden = false
    const deel = d.totaal ? Math.min(100, Math.round(d.gedaan / d.totaal * 100)) : 0
    brEl('br-balk-vol').style.width = deel + '%'
    brEl('br-voortgang-tekst').textContent =
      I18N.t('browser.progressText', { pct: deel, done: toonBytes(d.gedaan), total: toonBytes(d.totaal) }) + (d.bestand ? ` · ${d.bestand}` : '')
  })
}

function setupBrowserToetsen() {
  document.addEventListener('keydown', (e) => {
    if (termTab !== 'browser' || anyModalOpen()) return
    // In het padveld en het filter gelden eigen regels
    if (isTypingTarget(document.activeElement)) return
    const gekozen = gekozenItems()
    if (e.ctrlKey && !e.altKey) {
      const k = e.key.toLowerCase()
      if (k === 'a') { e.preventDefault(); selecteerAlles(); return }
      if (k === 'c' && gekozen.length) { e.preventDefault(); kopieerNaarKlembord(gekozen, false); return }
      if (k === 'x' && gekozen.length) { e.preventDefault(); kopieerNaarKlembord(gekozen, true); return }
      if (k === 'v' && e.shiftKey) { e.preventDefault(); toonKlembord(); return }
      if (k === 'v') { e.preventDefault(); plakHier(); return }
    }
    if (e.key === 'Delete' && gekozen.length) { e.preventDefault(); verwijderItems(gekozen, e.shiftKey); return }
    if (e.key === 'F2' && gekozen.length === 1) { e.preventDefault(); hernoemItem(gekozen[0]); return }
    if (e.ctrlKey || e.altKey) return

    // In tegels staan er meer naast elkaar: omlaag hoort dan een rij verder te
    // gaan, niet één tegel.
    const kol = kolommenInLijst()
    if (e.key === 'ArrowDown') { e.preventDefault(); verplaatsBrowserFocus(kol, e.shiftKey); return }
    if (e.key === 'ArrowUp')   { e.preventDefault(); verplaatsBrowserFocus(-kol, e.shiftKey); return }
    if (kol > 1 && e.key === 'ArrowRight') { e.preventDefault(); verplaatsBrowserFocus(1, e.shiftKey); return }
    if (kol > 1 && e.key === 'ArrowLeft')  { e.preventDefault(); verplaatsBrowserFocus(-1, e.shiftKey); return }
    if (e.key === 'Home')      { e.preventDefault(); browserFocus = -1; verplaatsBrowserFocus(1, e.shiftKey); return }
    if (e.key === 'End')       { e.preventDefault(); browserFocus = -1; verplaatsBrowserFocus(-1, e.shiftKey); return }
    if (e.key === 'Backspace') { e.preventDefault(); navigeerNaar(browserParent || DEZE_PC); return }
    if (e.key === 'Escape')    { e.preventDefault(); wisSelectie(); return }

    if (e.key === 'Enter' && browserFocus >= 0) {
      const item = browserZichtbaar[browserFocus]
      if (!item) return
      e.preventDefault()
      openBrowserItem(item)
    }
  })
}

// ── Suggesties in de adresbalk ────────────────────────────────────────────────
// Terwijl je typt verschijnen de mappen en bestanden die bij wat je hebt
// ingetypt passen; met de pijltjes loop je erdoorheen en met Enter spring je
// erheen. Zo hoef je geen pad uit te typen.
async function ververSuggesties() {
  const veld = brEl('br-path')
  const box  = brEl('br-suggest')
  if (!veld || !box) return

  const tekst = veld.value
  if (!tekst || tekst === 'Deze pc') { verbergSuggesties(); return }

  // Alles tot de laatste scheiding is de map, de rest is waar je op filtert
  const knip = Math.max(tekst.lastIndexOf('\\'), tekst.lastIndexOf('/'))
  const map    = knip >= 0 ? tekst.slice(0, knip + 1) : ''
  const stukje = (knip >= 0 ? tekst.slice(knip + 1) : tekst).toLowerCase()
  if (!map) { verbergSuggesties(); return }

  const r = await window.api.listDir(map)
  if (!r || !r.ok) { verbergSuggesties(); return }

  sugItems = r.items
    .filter(i => !stukje || i.name.toLowerCase().startsWith(stukje))
    .slice(0, 12)
  sugIndex = -1

  if (!sugItems.length) { verbergSuggesties(); return }
  clearTimeout(sugVerbergTimer)      // een oude "straks verbergen" telt niet meer
  sugVerbergTimer = null
  box.hidden = false
  box.innerHTML = sugItems.map((i, n) => `
    <div class="br-sug ${n === sugIndex ? 'actief' : ''}" data-s="${n}">
      <i class="ti ${i.dir ? 'ti-folder' : 'ti-file'}"></i> ${esc(i.name)}
    </div>`).join('')

  box.querySelectorAll('[data-s]').forEach(el => {
    el.onmousedown = (ev) => { ev.preventDefault(); kiesSuggestie(parseInt(el.dataset.s)) }
  })
}

function markeerSuggestie() {
  const box = brEl('br-suggest')
  if (!box) return
  box.querySelectorAll('.br-sug').forEach((el, i) => el.classList.toggle('actief', i === sugIndex))
  box.querySelectorAll('.br-sug')[sugIndex]?.scrollIntoView?.({ block: 'nearest' })
  const veld = brEl('br-path')
  if (veld && sugItems[sugIndex]) veld.value = sugItems[sugIndex].path
}

function kiesSuggestie(i) {
  const item = sugItems[i]
  if (!item) return
  verbergSuggesties()
  if (item.dir) navigeerNaar(item.path)
  else openBrowserItem(item)
}

function verbergSuggesties() {
  const box = brEl('br-suggest')
  if (box) { box.hidden = true; box.innerHTML = '' }
  sugItems = []
  sugIndex = -1
}

function setupNavigatie() {
  document.getElementById('btn-nav-back').onclick    = () => navTerug()
  document.getElementById('btn-nav-forward').onclick = () => navVooruit()

  // De zijknoppen van een muis: 3 is vorige, 4 is volgende.
  window.addEventListener('mouseup', (e) => {
    if (e.button === 3) { e.preventDefault(); navTerug() }
    if (e.button === 4) { e.preventDefault(); navVooruit() }
  })
  // Chromium wil op die knoppen ook zelf navigeren; dat hoort hier niet.
  window.addEventListener('mousedown', (e) => { if (e.button === 3 || e.button === 4) e.preventDefault() })
  window.addEventListener('auxclick',  (e) => { if (e.button === 3 || e.button === 4) e.preventDefault() })

  window.addEventListener('keydown', (e) => {
    if (!e.altKey || e.ctrlKey || e.metaKey) return
    if (e.key === 'ArrowLeft')  { e.preventDefault(); navTerug() }
    if (e.key === 'ArrowRight') { e.preventDefault(); navVooruit() }
  })
}

// ── View router ───────────────────────────────────────────────────────────────
const PANELS = { project: 'main', cmd: 'cmd-panel', ps: 'ps-panel', dict: 'dict-panel', bat: 'bat-panel', settings: 'settings-panel' }

// Panelen delen element-ID's (terminal, verkenner). Verborgen panelen houden
// hun DOM, maar hun id's gaan naar data-bewaard-id zodat getElementById alleen
// het zichtbare paneel treft. Opnieuw opbouwen bij elke wissel was de lag.
function setView(v) {
  // Meldingen horen bij het scherm waar ze ontstonden. Een waarschuwing over
  // een bat-bestand of de afloop van een commando moet niet blijven hangen als
  // je ergens anders heen gaat.
  if (v !== view) {
    batState.warning = ''
    bergVerkennerOp()
  }

  if (v === 'settings') {
    view = v
    toonSettingsVolledig()
    zetSidebarVoorView()
    renderSettingsPanel()
    rememberView()
    navPush()
    keurStatusNa()
    return
  }

  const werk = document.getElementById('werk')
  if (werk) werk.hidden = false
  const settingsEl = document.getElementById('settings-panel')
  if (settingsEl) {
    settingsEl.style.display = 'none'
    settingsEl.innerHTML = ''
  }

  // Een project is een eigen pagina. Woordenboek ernaast mag alleen als je
  // zelf op woordenboek klikt — niet omdat die split nog open of onthouden was.
  if (v === 'project' && splitAan() && (
    splitGemengd() ||
    (splitTweeProjecten() && !werkSlots.some(s => s.projectId === activeId))
  )) {
    sluitSplitVoorView()
  } else if (splitAan()) {
    plaatsInSplit(v)
    return
  }

  view = v
  if (v === 'cmd' || v === 'ps') lastShellView = v
  toonPanelenVolledig(v)
  zetSidebarVoorView()
  tekenView(v)
  pasWerkSplitKnoppenAan()
  rememberView()
  navPush()
  keurStatusNa()
}

// Onthouden waar je gebleven was, zodat de app daar weer opent.
function rememberView() {
  if (view === 'settings') return   // instellingen wil je niet terugkrijgen bij het opstarten
  const next = { view, projectId: view === 'project' ? (activeId || '') : '' }
  const cur  = settings.lastView || {}
  if (cur.view === next.view && cur.projectId === next.projectId) return
  settings.lastView = next
  clearTimeout(lastViewBewaarTimer)
  lastViewBewaarTimer = setTimeout(() => window.api.saveSettings(settings), 400)
}

// Bij het opstarten terug naar de laatste weergave. Bestaat het project niet
// meer, dan begin je gewoon op het lege startscherm.
function restoreLastView() {
  const last = settings.lastView || {}
  if (last.view === 'cmd' || last.view === 'ps' || last.view === 'dict' || last.view === 'bat') { setView(last.view); return }
  if (last.view === 'project' && last.projectId && projects.some(p => p.id === last.projectId)) {
    activeId = last.projectId
    setView('project')
    return
  }
  renderSidebar()
}

// ── Zijbalkbreedte ────────────────────────────────────────────────────────────
// De lijn tussen links en rechts is een knop. Verslepen zet hoe breed de
// zijbalk is; de rechterkant vult de rest. Dubbelklik brengt 210px terug.
const ZIJBALK_BREEDTE_STANDAARD = 210
const ZIJBALK_BREEDTE_MIN = 140
// Ingeklapt: alleen nog de eerste letter van elke sectie en het icoon van een
// project. Onder de drempel is er geen ruimte meer voor namen, en bij een smal
// venster gaat hij sowieso dicht -- dan is de rest van het scherm harder nodig.
const ZIJBALK_SMAL = 52
const ZIJBALK_SMAL_DREMPEL = 120
// Wat het werkvlak rechts minstens nodig heeft. Blijft daar minder van over,
// dan wijkt de zijbalk -- niet omdat het venster een bepaalde maat heeft, maar
// omdat het werk anders in de knel komt. Dat is ook het enige wat je merkt.
const WERK_BREEDTE_MIN = 420

function zijbalkBreedteMax() {
  const venster = Number(window.innerWidth)
  const breed = Number.isFinite(venster) && venster > 400 ? venster : 900
  return Math.max(ZIJBALK_BREEDTE_MIN, Math.round(breed - WERK_BREEDTE_MIN))
}

function gewensteZijbalkBreedte() {
  const n = Number(settings.zijbalkBreedte)
  return Number.isFinite(n) ? n : ZIJBALK_BREEDTE_STANDAARD
}

// Ingeklapt omdat je hem zelf smal hebt getrokken, of omdat er anders te weinig
// werkvlak overblijft. Dat tweede zonder iets te bewaren: maak je het venster
// weer breed, dan staat de zijbalk terug zoals jij hem had.
//
// Het gaat om wat er ná de zijbalk overblijft, niet om de maat van het venster
// zelf. Een venster van 800 met een zijbalk van 210 houdt bijna 600 pixels over
// -- daar is niets mis mee, en dan hoort hij gewoon te blijven staan.
function zijbalkSmal() {
  const gewenst = gewensteZijbalkBreedte()
  if (gewenst < ZIJBALK_SMAL_DREMPEL) return true
  const venster = Number(window.innerWidth)
  if (!Number.isFinite(venster) || venster <= 0) return false
  // De breedte die jij wilde, niet de afgeknepen versie ervan: knijpen we hem
  // eerst af tot wat er nog net past, dan blijft er per definitie genoeg over
  // en klapt hij nooit in.
  return venster - gewenst < WERK_BREEDTE_MIN
}

function zijbalkBreedte() {
  if (zijbalkSmal()) return ZIJBALK_SMAL
  return Math.max(ZIJBALK_BREEDTE_MIN, Math.min(zijbalkBreedteMax(), Math.round(gewensteZijbalkBreedte())))
}

function pasZijbalkBreedteToe() {
  const layout = document.querySelector('.layout')
  if (layout) layout.style.setProperty('--sidebar-w', zijbalkBreedte() + 'px')
  const zijbalk = document.querySelector('.sidebar')
  if (zijbalk) zijbalk.classList.toggle('smal', zijbalkSmal())
  zetKorteLabels()
}

function zetZijbalkBreedte(px, { bewaren = true } = {}) {
  // Onder de drempel klapt hij dicht, en dan is de bewaarde breedte ook echt de
  // breedte die je ziet. Bewaarden we hier de gesleepte waarde (bijvoorbeeld
  // 118 terwijl er 52 staat), dan begint de volgende sleep op een andere plek
  // dan waar je hem vastpakt -- en verschuift het punt waarop hij omklapt elke
  // keer een stukje.
  const gevraagd = Math.round(px)
  const w = gevraagd < ZIJBALK_SMAL_DREMPEL
    ? ZIJBALK_SMAL
    : Math.max(ZIJBALK_BREEDTE_MIN, Math.min(zijbalkBreedteMax(), gevraagd))
  settings.zijbalkBreedte = w
  pasZijbalkBreedteToe()
  updateTermPlaceholder()
  if (termTab === 'output' || termSplitAan()) pasPtyMaatAan(ptySessies.get(activeTermId))
  if (bewaren) window.api.saveSettings(settings)
}

// Met de pijltjes tien pixels tegelijk. Ingeklapt zou dat betekenen dat je
// zeven keer moet drukken voordat er iets gebeurt; daar is één druk genoeg.
function stapZijbalkBreedte(delta) {
  if (zijbalkSmal()) {
    if (delta > 0) zetZijbalkBreedte(ZIJBALK_BREEDTE_MIN)
    return
  }
  zetZijbalkBreedte(zijbalkBreedte() + delta)
}

function startZijbalkSleep(e) {
  e.preventDefault()
  e.stopPropagation()
  const startX = e.clientX
  const startW = zijbalkBreedte()

  const onMove = (ev) => {
    zetZijbalkBreedte(startW + (ev.clientX - startX), { bewaren: false })
  }
  const onUp = () => {
    document.removeEventListener('mousemove', onMove)
    document.removeEventListener('mouseup', onUp)
    document.body.classList.remove('bezig-breedte')
    window.api.saveSettings(settings)
  }
  document.body.classList.add('bezig-breedte')
  document.addEventListener('mousemove', onMove)
  document.addEventListener('mouseup', onUp)
}

function bedraadZijbalkBreedte() {
  const greep = document.getElementById('zijbalk-greep')
  if (!greep || greep.dataset.bedraad) return
  greep.dataset.bedraad = '1'

  greep.addEventListener('mousedown', (e) => {
    if (e.button !== 0) return
    startZijbalkSleep(e)
  })
  greep.addEventListener('dblclick', (e) => {
    e.preventDefault()
    e.stopPropagation()
    zetZijbalkBreedte(ZIJBALK_BREEDTE_STANDAARD)
    showToast(I18N.t('sidebar.defaultWidthRestoredToast'))
  })
  greep.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowLeft')  { e.preventDefault(); stapZijbalkBreedte(-10) }
    if (e.key === 'ArrowRight') { e.preventDefault(); stapZijbalkBreedte(10) }
    if (e.key === 'Home')       { e.preventDefault(); zetZijbalkBreedte(ZIJBALK_BREEDTE_STANDAARD) }
  })

  pasZijbalkBreedteToe()
}

// ── Sidebar ───────────────────────────────────────────────────────────────────
// ── Volgorde van de zijbalk ───────────────────────────────────────────────────
// Met de knop naast een kopje zet je die lijst in de sorteerstand: dan kun je
// slepen of de pijltjes gebruiken, en klikken opent even niets.
let sorteerModus = ''            // '' | 'nav' | 'proj' | 'sectie'
let sleepBron = null
let sleepKnop = null         // { sectie, id } tijdens het slepen in een knoppenrij

const NAV_KNOPPEN = [
  { sleutel: 'cmd',  id: 'btn-nav-cmd',  open: () => setView('cmd') },
  { sleutel: 'ps',   id: 'btn-nav-ps',   open: () => setView('ps') },
  { sleutel: 'bat',  id: 'btn-nav-bat',  open: () => openBatView() },
  { sleutel: 'dict', id: 'btn-nav-dict', open: () => setView('dict') },
]

function navVolgorde() {
  const bekend = NAV_KNOPPEN.map(n => n.sleutel)
  const eigen = (settings.navVolgorde || []).filter(k => bekend.includes(k))
  const rest = bekend.filter(k => !eigen.includes(k))
  if (!eigen.length) return bekend
  // Nieuwe knoppen horen op hun vaste plek, niet onderaan een oude volgorde.
  const uit = [...eigen]
  for (const k of rest) {
    if (k === 'ps') {
      const i = uit.indexOf('cmd')
      if (i >= 0) uit.splice(i + 1, 0, k)
      else uit.unshift(k)
    } else {
      uit.push(k)
    }
  }
  return uit
}

function zetSorteerModus(welke) {
  sorteerModus = sorteerModus === welke ? '' : welke
  renderSidebar()
}

function pijlenHtml(eerste, laatste, horizontaal = false) {
  if (horizontaal) {
    return `<span class="sort-pijlen horizontaal">
    <span class="sort-pijl ${eerste ? 'uit' : ''}" data-op="links"><i class="ti ti-chevron-left"></i></span>
    <span class="sort-pijl ${laatste ? 'uit' : ''}" data-op="rechts"><i class="ti ti-chevron-right"></i></span>
  </span>`
  }
  return `<span class="sort-pijlen">
    <span class="sort-pijl ${eerste ? 'uit' : ''}" data-op="op"><i class="ti ti-chevron-up"></i></span>
    <span class="sort-pijl ${laatste ? 'uit' : ''}" data-op="neer"><i class="ti ti-chevron-down"></i></span>
  </span>`
}

function sortPijlDoel(idx, op, horizontaal = false) {
  if (horizontaal) return op === 'links' ? idx - 1 : idx + 1
  return op === 'op' ? idx - 1 : idx + 1
}

function verschuif(lijst, van, naar) {
  return Knoppenrij.verschuif(lijst, van, naar)
}

async function verplaatsProject(van, naar) {
  if (!verschuif(projects, van, naar)) return
  await window.api.saveProjects(projects)
  renderSidebar()
}

function verplaatsNav(van, naar) {
  const volgorde = navVolgorde()
  if (!verschuif(volgorde, van, naar)) return
  settings.navVolgorde = volgorde
  window.api.saveSettings(settings)
  renderSidebar()
}

// Slepen werkt in beide lijsten hetzelfde: onthoud waar je begon, teken een
// streep bij de regel waar je overheen zweeft, en verplaats bij loslaten.
function maakSleepbaar(el, index, verplaats) {
  el.draggable = true
  el.ondragstart = (e) => {
    sleepBron = index
    el.classList.add('sleept')
    try { e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', String(index)) } catch {}
  }
  el.ondragend = () => { sleepBron = null; el.classList.remove('sleept') }
  el.ondragover = (e) => { e.preventDefault(); el.classList.add('doelwit') }
  el.ondragleave = () => el.classList.remove('doelwit')
  el.ondrop = (e) => {
    e.preventDefault()
    el.classList.remove('doelwit')
    const van = sleepBron ?? parseInt(e.dataTransfer?.getData('text/plain'))
    sleepBron = null
    if (Number.isInteger(van) && van !== index) verplaats(van, index)
  }
}

// ── Secties in de zijbalk ─────────────────────────────────────────────────────
// De secties zijn in te klappen en van plek te wisselen. Slepen begint pas na
// een lange druk op de kop: anders zou elke klik om in te klappen al een sleep
// kunnen worden, en dat vecht met elkaar.
const SECTIES = ['cmd', 'dezepc', 'projecten']
const LANG_DRUKKEN_MS = 400

function sectieVolgorde() {
  const eigen = (settings.zijbalkVolgorde || []).filter(k => SECTIES.includes(k))
  return [...eigen, ...SECTIES.filter(k => !eigen.includes(k))]
}

function sectieOpen(sleutel) {
  const open = settings.zijbalkOpen || {}
  return open[sleutel] !== false
}

function zetSectieOpen(sleutel, open) {
  settings.zijbalkOpen = { ...(settings.zijbalkOpen || {}), [sleutel]: open }
  window.api.saveSettings(settings)
  renderSecties()
}

function verplaatsSectie(van, naar) {
  const volgorde = sectieVolgorde()
  if (van < 0 || van >= volgorde.length) return
  const doel = Math.max(0, Math.min(volgorde.length - 1, naar))
  if (doel === van) return
  const [eruit] = volgorde.splice(van, 1)
  volgorde.splice(doel, 0, eruit)
  settings.zijbalkVolgorde = volgorde
  window.api.saveSettings(settings)
  renderSecties()
}

// Zet de secties in de gekozen volgorde en klapt ze open of dicht.
function renderSecties() {
  const zijbalk = document.querySelector('.sidebar')
  if (!zijbalk) return
  const volgorde = sectieVolgorde()
  const sorteerSectie = sorteerModus === 'sectie'

  volgorde.forEach((sleutel, n) => {
    const sectie = zijbalk.querySelector(`.sidebar-sectie[data-zijsectie="${sleutel}"]`)
    if (!sectie) return
    zijbalk.appendChild(sectie)                    // hiermee komt hij op zijn plek

    const open = sectieOpen(sleutel)
    sectie.classList.toggle('dicht', !open)
    const inhoud = sectie.querySelector('.sectie-inhoud')
    if (inhoud) inhoud.hidden = !open
    const pijl = sectie.querySelector('.sectie-pijl')
    if (pijl) pijl.className = 'ti sectie-pijl ' + (open ? 'ti-chevron-down' : 'ti-chevron-right')
    const kop = sectie.querySelector('.sidebar-header')
    if (kop) {
      kop.title = sorteerSectie
        ? I18N.t('sidebar.sectionSortTitle')
        : open ? I18N.t('sidebar.sectionCollapseTitle')
               : I18N.t('sidebar.sectionExpandTitle')
      // Pijltjes voor sectie-volgorde (zelfde patroon als cmd/projecten)
      kop.querySelector('.sort-pijlen')?.remove()
      if (sorteerSectie) {
        const titel = [...kop.children].find(el => el.tagName === 'SPAN')
        if (titel) {
          titel.insertAdjacentHTML('afterend', pijlenHtml(n === 0, n === volgorde.length - 1))
          kop.querySelectorAll('[data-op]').forEach(pijltje => {
            pijltje.onclick = (e) => {
              e.stopPropagation()
              verplaatsSectie(n, pijltje.dataset.op === 'op' ? n - 1 : n + 1)
            }
          })
        }
      }
    }
  })

  document.querySelectorAll('.sort-hint-sectie').forEach(el => el.remove())
  // Geen uitlegtekst meer bij sorteren/verplaatsen — de knoppen en pijltjes
  // spreken voor zich.

  // De hoogte-greep hoort alleen zichtbaar te zijn als de modus aan staat én
  // de sectie open is — anders zou je onder een dichtgeklapte kop slepen.
  pasBoomHoogteToe()
  syncBoomGreep()
  pasDezepcVolToe()
}

function bedraadSecties() {
  const zijbalk = document.querySelector('.sidebar')
  if (!zijbalk) return

  zijbalk.querySelectorAll('.sidebar-sectie').forEach(sectie => {
    const sleutel = sectie.dataset.zijsectie
    const kop = sectie.querySelector('.sidebar-header')
    if (!kop || kop.dataset.bedraad) return
    kop.dataset.bedraad = '1'

    let timer = null
    let langIngedrukt = false   // de lange druk is geweest: slepen mag
    let gesleept = false        // er is daadwerkelijk gesleept

    const ontwapen = () => {
      clearTimeout(timer); timer = null
      sectie.draggable = false
      sectie.classList.remove('sleepklaar')
    }

    kop.addEventListener('mousedown', (e) => {
      if (e.button !== 0 || e.target.closest('button')) return
      gesleept = false
      langIngedrukt = false
      timer = setTimeout(() => {
        langIngedrukt = true
        sectie.draggable = true
        sectie.classList.add('sleepklaar')
        showToast(I18N.t('sidebar.dragSectionToast'))
      }, LANG_DRUKKEN_MS)
    })
    kop.addEventListener('mouseup', () => { clearTimeout(timer); timer = null })
    kop.addEventListener('mouseleave', () => { clearTimeout(timer); timer = null })

    // Een gewone klik klapt in of uit. Was het een lange druk — of heb je net
    // gesleept — dan wilde je iets anders, en laten we de sectie met rust.
    kop.addEventListener('click', (e) => {
      if (e.target.closest('button')) return
      if (gesleept || langIngedrukt) {
        gesleept = false
        langIngedrukt = false
        ontwapen()
        return
      }
      // Deze pc is een boom met mappen erin; op 52 pixels valt daar niets
      // zinnigs mee te doen. Uitklappen doet dan niets zichtbaars, dus zeg
      // liever wat eraan schort.
      if (sleutel === 'dezepc' && zijbalkSmal()) {
        showToast(I18N.t('sidebar.dezepcNeedsRoomToast'))
        return
      }
      zetSectieOpen(sleutel, !sectieOpen(sleutel))
    })

    sectie.addEventListener('dragstart', (e) => {
      gesleept = true
      sleepSectie = sleutel
      sectie.classList.add('sleept')
      try { e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', sleutel) } catch {}
    })
    sectie.addEventListener('dragend', () => {
      sleepSectie = null
      gesleept = false
      langIngedrukt = false
      sectie.classList.remove('sleept')
      ontwapen()
    })
    sectie.addEventListener('dragover', (e) => {
      if (!sleepSectie || sleepSectie === sleutel) return
      e.preventDefault()
      sectie.classList.add('doelwit')
    })
    sectie.addEventListener('dragleave', () => sectie.classList.remove('doelwit'))
    sectie.addEventListener('sectie-ontwapend', () => {
      clearTimeout(timer); timer = null
      gesleept = false
      langIngedrukt = false
    })
    sectie.addEventListener('drop', (e) => {
      e.preventDefault()
      sectie.classList.remove('doelwit')
      const van = sleepSectie || e.dataTransfer?.getData('text/plain')
      sleepSectie = null
      ontwapenAlleSecties()
      if (!van || van === sleutel) return
      const volgorde = sectieVolgorde()
      verplaatsSectie(volgorde.indexOf(van), volgorde.indexOf(sleutel))
    })
  })
}

let sleepSectie = null

// Na een sleep staat er niets meer op scherp — ook niet als de browser geen
// dragend stuurt omdat er buiten het venster is losgelaten.
function ontwapenAlleSecties() {
  document.querySelectorAll('.sidebar-sectie').forEach(el => {
    el.draggable = false
    el.classList.remove('sleepklaar', 'sleept', 'doelwit')
    el.dispatchEvent(new Event('sectie-ontwapend'))
  })
}

function zetSidebarVoorView() {
  if (sidebarGetekend) updateSidebarActief()
  else renderSidebar()
}

function updateSidebarActief() {
  document.querySelectorAll('#proj-list .proj-item').forEach((el, i) => {
    const p = projects[i]
    if (!p) return
    const inAnderVlak = splitAan() && werkSlots.some(s => s.view === 'project' && s.projectId === p.id)
      && !(view === 'project' && p.id === activeId)
    el.classList.toggle('active', view === 'project' && p.id === activeId)
    el.classList.toggle('in-split', !!inAnderVlak)
  })
  for (const def of NAV_KNOPPEN) {
    const knop = document.getElementById(def.id)
    if (!knop) continue
    knop.classList.toggle('active', view === def.sleutel)
    knop.classList.toggle('in-split', splitAan() && werkSlots.some((s, i) => i !== werkSlotFocus && s.view === def.sleutel))
  }
  const settingsBtn = document.getElementById('btn-settings')
  if (settingsBtn) settingsBtn.classList.toggle('active', view === 'settings')
  const count = (history.entries || []).length
  const dictCount = document.getElementById('nav-dict-count')
  if (dictCount) dictCount.textContent = count ? String(count) : ''
}

// De letter die overblijft als de zijbalk dichtklapt. Uit de tekst zelf, dus
// in het Engels staat er een c van commands waar hier een o van opdrachten
// staat -- een vaste letter in de code zou daar niet meer kloppen.
function zetKorteLabels() {
  const smal = zijbalkSmal()
  document.querySelectorAll('.sidebar-header, .nav-item').forEach(el => {
    const tekst = (el.querySelector('span[data-i18n]')?.textContent || '').trim()
    if (!tekst) return
    el.dataset.kort = tekst.charAt(0)
    // Ingeklapt staat er alleen een letter; dan hoort de naam er als tooltip
    // bij. Uitgeklapt staat hij er gewoon en is een tooltip dubbelop.
    if (smal) el.title = tekst; else el.removeAttribute('title')
  })
}

function renderSidebar() {
  sidebarGetekend = true
  const list = document.getElementById('proj-list')
  const sorteerProj = sorteerModus === 'proj'
  list.innerHTML = ''
  list.classList.toggle('sorteren', sorteerProj)
  projects.forEach((p, n) => {
    const activeLoc = p.locations[p.activeLocation] || p.locations[0]
    const div = document.createElement('div')
    const inAnderVlak = splitAan() && werkSlots.some(s => s.view === 'project' && s.projectId === p.id)
      && !(view === 'project' && p.id === activeId)
    div.className = 'proj-item'
      + (view === 'project' && p.id === activeId ? ' active' : '')
      + (inAnderVlak ? ' in-split' : '')
    // Ingeklapt blijft alleen het icoon over; dan is dit het enige wat nog
    // vertelt welk project het is.
    div.title = p.name + (activeLoc ? ' — ' + activeLoc.label : '')
    div.innerHTML = `
      <div class="proj-icon">${p.icon}</div>
      <div class="proj-info">
        <div class="proj-label">${esc(p.name)}</div>
        <div class="proj-sub">${esc(activeLoc ? activeLoc.label : '—')}</div>
      </div>
      ${sorteerProj ? pijlenHtml(n === 0, n === projects.length - 1) : ''}
      <button class="proj-edit" title="${esc(I18N.t('dict.editTitle'))}"><i class="ti ti-pencil" style="font-size:13px"></i></button>
    `
    div.querySelector('.proj-edit').onclick = (e) => { e.stopPropagation(); openEditModal(p.id) }
    if (sorteerProj) {
      div.querySelectorAll('[data-op]').forEach(pijl => {
        pijl.onclick = (e) => {
          e.stopPropagation()
          verplaatsProject(n, pijl.dataset.op === 'op' ? n - 1 : n + 1)
        }
      })
      maakSleepbaar(div, n, verplaatsProject)
    } else {
      div.onclick = () => selectProject(p.id)
    }
    list.appendChild(div)
  })

  document.getElementById('btn-add-proj').onclick = openNewModal
  pasZijbalkBreedteToe()
  bedraadSecties()
  renderSecties()
  bedraadBoom()
  renderBoom()

  // Navigatieknoppen: in de volgorde die jij hebt gekozen
  const navLijst = document.querySelector('.nav-list')
  const sorteerNav = sorteerModus === 'nav'
  const volgorde = navVolgorde()
  navLijst.classList.toggle('sorteren', sorteerNav)

  volgorde.forEach((sleutel, n) => {
    const def = NAV_KNOPPEN.find(k => k.sleutel === sleutel)
    const knop = document.getElementById(def.id)
    navLijst.appendChild(knop)                       // hiermee komt hij op zijn plek
    knop.classList.toggle('active', view === sleutel)
    knop.classList.toggle('in-split', splitAan() && werkSlots.some((s, i) => i !== werkSlotFocus && s.view === sleutel))

    knop.querySelector('.sort-pijlen')?.remove()
    if (sorteerNav) {
      knop.insertAdjacentHTML('beforeend', pijlenHtml(n === 0, n === volgorde.length - 1, true))
      knop.querySelectorAll('[data-op]').forEach(pijl => {
        pijl.onclick = (e) => {
          e.stopPropagation()
          verplaatsNav(n, sortPijlDoel(n, pijl.dataset.op, true))
        }
      })
      knop.onclick = null
      knop.onmousedown = knop.onmouseup = knop.onmouseleave = null
      maakSleepbaar(knop, n, verplaatsNav)
    } else {
      knop.draggable = false
      knop.ondragstart = knop.ondragover = knop.ondrop = knop.ondragend = knop.ondragleave = null
      let timer = null
      knop.onmousedown = (e) => {
        if (e.button !== 0) return
        timer = setTimeout(() => {
          sorteerModus = 'nav'
          showToast(I18N.t('project.cmdSortToast'))
          renderSidebar()
        }, LANG_DRUKKEN_MS)
      }
      knop.onmouseup = () => { clearTimeout(timer); timer = null }
      knop.onmouseleave = () => { clearTimeout(timer); timer = null }
      knop.onclick = def.open
    }
  })

  document.getElementById('sort-nav').classList.toggle('aan', sorteerNav)
  document.getElementById('sort-proj').classList.toggle('aan', sorteerProj)
  const sortDezepc = document.getElementById('sort-dezepc')
  if (sortDezepc) sortDezepc.classList.toggle('aan', boomVerplaatsModus)
  document.getElementById('sort-nav').onclick  = () => zetSorteerModus('nav')
  document.getElementById('sort-proj').onclick = () => zetSorteerModus('proj')
  if (sortDezepc) sortDezepc.onclick = (e) => {
    e.stopPropagation()
    // Deze pc: selecteer mappen/bestanden en sleep ze naar een andere map.
    // Sectie-volgorde blijft via lang drukken op de koppen.
    if (sorteerModus) { sorteerModus = ''; renderSidebar() }
    zetBoomVerplaatsModus()
  }

  // Uitleg onder cmd/projecten bij sorteren. Bij deze pc (verplaatsen) geen
  // hinttekst — selecteren + slepen is genoeg.
  document.querySelectorAll('.sort-hint:not(.sort-hint-sectie)').forEach(el => el.remove())
  if (sorteerNav || sorteerProj) {
    const na = sorteerNav ? navLijst : document.getElementById('btn-add-proj')
    na.insertAdjacentHTML(sorteerNav ? 'afterend' : 'beforebegin',
      `<div class="sort-hint">${esc(sorteerNav ? I18N.t('project.cmdSortHint') : I18N.t('sidebar.sectionSortHint'))}</div>`)
  }

  const count = (history.entries || []).length
  document.getElementById('nav-dict-count').textContent = count ? String(count) : ''

  const settingsBtn = document.getElementById('btn-settings')
  settingsBtn.classList.toggle('active', view === 'settings')
  settingsBtn.onclick = toggleSettings
}

function selectProject(id) {
  cmdSorteerModus = ''
  bergVerkennerOp()
  activeId = id
  // Stil kijken of de remote iets heeft wat jij niet hebt. Hoogstens eens per
  // tien minuten per map, en een mislukking blijft onzichtbaar.
  if (projects.some(x => x.id === id)) setTimeout(() => controleerAchterstand(), 400)

  const naOpenen = () => {
    const p = projects.find(x => x.id === id)
    bepaalToolsVoorProject(p).then(verborgen => {
      if (!verborgen) return
      if (activeId === id) vraagProjectHertekenen()
      showToast(I18N.t('project.notFlutterToast'))
    })
  }

  // Een project in de zijbalk is één pagina, net als cmd. Het woordenboek
  // ernaast mag alleen als je zelf op woordenboek klikt — niet omdat dit
  // project eerder in een split stond, en niet bij de derde projectklik.
  if (splitGemengd()) {
    sluitSplitVoorView()
    setView('project')
    naOpenen()
    return
  }

  if (splitTweeProjecten()) {
    const erin = werkSlots.some(s => s.projectId === id)
    if (erin) {
      plaatsInSplit('project')
    } else {
      sluitSplitVoorView()
      setView('project')
    }
    naOpenen()
    return
  }

  if (splitAan()) {
    plaatsInSplit('project')
    naOpenen()
    return
  }
  // Al op het projectscherm: niet de andere panelen en de zijbalkboom slopen.
  if (view === 'project') {
    toonPanelenVolledig('project')
    renderMain()
    updateSidebarActief()
    rememberView()
    navPush()
    keurStatusNa()
    naOpenen()
    return
  }
  // Vanuit cmd/ps/dict: panelen blijven staan, maar de projectknoppen moeten
  // wel kloppen (nieuwe editors, eigen knoppen, git).
  projectWeergaveAchterhaald = true
  setView('project')
  naOpenen()
}

let prevView = 'project'
function toggleSettings() {
  if (view === 'settings') {
    settingsSubPage = null
    setView(prevView === 'settings' ? 'project' : prevView)
  } else {
    prevView = view
    setView('settings')
  }
}

// ── Main panel ────────────────────────────────────────────────────────────────
// -- Mappen bedienen ---------------------------------------------------------
// De rij waar een knop in meedoet: los in de sectie, of binnen zijn map. De
// pijltjes van een knop in een map schuiven binnen die map. Eruit springen doe
// je door hem eruit te slepen, niet door hem langs alle andere knoppen te
// duwen tot hij er per ongeluk uit valt.
function knopRij(p, sectie, id) {
  return Knoppenrij.knopRij(projectRij(p, sectie), id)
}

function mapVanKnop(p, sectie, id) {
  return Knoppenrij.mapIdVanKnop(projectRij(p, sectie), id)
}

function legInMap(p, sectie, knopId, mapId) {
  return Knoppenrij.legInMap(projectRij(p, sectie), knopId, mapId)
}

function bedraadMapKoppen(p, sectie, grid) {
  const rij = rijVoor(p, sectie)
  grid.querySelectorAll('[data-map]').forEach(kop => {
    const f = folderOp(rij.bron, kop.dataset.map)
    if (!f) return
    kop.onclick = (e) => {
      e.preventDefault()
      e.stopPropagation()
      f.open = f.open === false
      rij.bewaar()
    }
    kop.oncontextmenu = (e) => {
      e.preventDefault()
      e.stopPropagation()
      toonContextMenu(e.clientX, e.clientY, [
        { label: I18N.t('folder.rename'), icoon: 'ti-pencil', doe: () => hernoemMap(p, sectie, f.id) },
        { label: I18N.t('folder.dissolve'), icoon: 'ti-folder-off', doe: () => hefMappenOp(p, sectie, [f.id]) },
      ])
    }
  })
}

function bedraadKnopSlepen(p, sectie, blok, grid) {
  const rij = rijVoor(p, sectie)
  const bewaar = () => rij.bewaar()
  const gesleept = () => (sleepKnop && sleepKnop.sectie === sectie ? sleepKnop.id : null)

  blok.querySelectorAll('.cmd-sort-item[data-volgorde-id]').forEach(item => {
    const id = item.dataset.volgordeId
    item.draggable = true
    item.ondragstart = (e) => {
      sleepKnop = { sectie, id }
      item.classList.add('sleept')
      try { e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', id) } catch {}
    }
    item.ondragend = () => { sleepKnop = null; item.classList.remove('sleept') }
    item.ondragover = (e) => { e.preventDefault(); item.classList.add('doelwit') }
    item.ondragleave = () => item.classList.remove('doelwit')
    item.ondrop = (e) => {
      e.preventDefault()
      e.stopPropagation()
      item.classList.remove('doelwit')
      const bron = gesleept()
      sleepKnop = null
      if (!bron || bron === id) return
      // Op een mapkop laten vallen betekent: erin. Op een knop betekent: op
      // die plek, en dus in dezelfde map als die knop.
      if (isMapId(id) && !isMapId(bron)) Knoppenrij.legInMap(rij, bron, mapIdVan(id))
      else {
        const lijst = Knoppenrij.knopRij(rij, id)
        const vanaf = lijst.indexOf(bron)
        Knoppenrij.verplaatsKnop(rij, bron, id, Knoppenrij.mapIdVanKnop(rij, id), vanaf >= 0 && vanaf < lijst.indexOf(id))
      }
      bewaar()
    }
    item.querySelectorAll('.sort-pijl:not(.uit)').forEach(pijl => {
      pijl.onclick = (e) => {
        e.preventDefault()
        e.stopPropagation()
        const lijst = Knoppenrij.knopRij(rij, id)
        const i = lijst.indexOf(id)
        const doel = sortPijlDoel(i, pijl.dataset.op, true)
        if (i < 0 || doel < 0 || doel >= lijst.length) return
        Knoppenrij.verplaatsKnop(rij, id, lijst[doel], Knoppenrij.mapIdVanKnop(rij, id), doel > i)
        bewaar()
      }
    })
  })

  // In de lege ruimte van een map laten vallen hoort ook gewoon "erin" te
  // betekenen. Precies mikken op de kop is geen bediening.
  blok.querySelectorAll('[data-map-groep]').forEach(groep => {
    groep.ondragover = (e) => { if (gesleept()) e.preventDefault() }
    groep.ondrop = (e) => {
      const bron = gesleept()
      if (!bron || isMapId(bron)) return
      e.preventDefault()
      e.stopPropagation()
      sleepKnop = null
      Knoppenrij.legInMap(rij, bron, groep.dataset.mapGroep)
      bewaar()
    }
  })

  // Buiten een map laten vallen haalt hem eruit. Zonder die weg terug is een
  // map een eenrichtingsstraat.
  grid.ondragover = (e) => { if (gesleept()) e.preventDefault() }
  grid.ondrop = (e) => {
    const bron = gesleept()
    sleepKnop = null
    if (!bron || isMapId(bron) || !Knoppenrij.mapVanKnop(rij, bron)) return
    e.preventDefault()
    Knoppenrij.verplaatsKnop(rij, bron, null, null, false)
    bewaar()
  }
}

// -- Mappen maken en opruimen ------------------------------------------------
async function nieuweMap(p, sectie) {
  const naam = await vraagTekst({
    titel: I18N.t('folder.newTitle'),
    placeholder: I18N.t('folder.namePlaceholder'),
    okLabel: I18N.t('folder.newButton'),
  })
  if (naam == null) return
  const rij = rijVoor(p, sectie)
  Knoppenrij.nieuweMap(rij, naam.trim() || I18N.t('folder.defaultName'))
  zetRijSorteerModus(sectie, true)
  rij.bewaar()
}

async function hernoemMap(p, sectie, mapId) {
  const rij = rijVoor(p, sectie)
  const f = folderOp(rij.bron, mapId)
  if (!f) return
  const naam = await vraagTekst({
    titel: I18N.t('folder.renameTitle'), waarde: f.label, okLabel: I18N.t('common.save'),
  })
  if (naam == null || !naam.trim()) return
  f.label = naam.trim()
  // Zelf een naam gekozen: dan hoort automatisch mappen die niet meer te
  // overschrijven.
  f.auto = ''
  rij.bewaar()
}

// De map gaat weg, de knoppen blijven. Ze stonden al op hun eigen plek in de
// volgorde, dus ze komen daar gewoon weer tevoorschijn.
function hefMappenOp(p, sectie, mapIds) {
  const rij = rijVoor(p, sectie)
  const aantal = Knoppenrij.hefMappen(rij, mapIds)
  if (!aantal) { showToast(I18N.t('folder.noneToast')); return }
  rij.bewaar()
  showToast(I18N.t('folder.dissolvedToast', { count: aantal }))
}

// Waar hoort een knop vanzelf thuis? Drie groepen, te herkennen aan het id.
// Wat er niet in past blijft los staan: een map met een restje erin helpt
// niemand aan overzicht.
const TOOLS_IDS = new Set(TOOLS_CMD_DEFS.map(d => d.id))
const AUTO_MAPPEN = [
  { auto: 'git',       sleutel: 'folder.autoGit',   toets: (id) => GitTools.isGitId(id) },
  { auto: 'ai',        sleutel: 'folder.autoAi',    toets: (id) => id.startsWith('ai:') && !id.startsWith('ai:prog:') },
  { auto: 'prog',      sleutel: 'folder.autoProgs', toets: (id) => id.startsWith('editor:custom:') || id.startsWith('ai:prog:') },
  { auto: FLUTTER_MAP, sleutel: 'folder.flutter',   toets: (id) => TOOLS_IDS.has(id) },
]

// De namen komen er hier pas bij: knoppenrij.js kent geen talen, dus die krijgt
// het label mee in plaats van de sleutel.
function autoSoorten() {
  return AUTO_MAPPEN.map(s => ({ auto: s.auto, label: I18N.t(s.sleutel), toets: s.toets }))
}

function maakAutoMappen(p, sectie) {
  return Knoppenrij.maakAutoMappen(rijVoor(p, sectie))
}

function autoMappen(p, sectie) {
  const rij = rijVoor(p, sectie)
  const gedaan = Knoppenrij.maakAutoMappen(rij)
  if (!gedaan) { showToast(I18N.t('folder.autoNothingToast')); return }
  rij.bewaar()
  showToast(I18N.t('folder.autoDoneToast', { count: gedaan }))
}

// Een project begint geordend: git bij git, AI bij AI, programma's bij
// programma's. Dat is wat je zelf ook meteen zou doen, en het scheelt iedereen
// die de app voor het eerst opent een rij van dertig losse knoppen. Eenmalig --
// wie zijn mappen daarna opheft, houdt ze opgeheven.
function ordenProject(p) {
  if (!p || p.knoppenGeordend) return false
  p.knoppenGeordend = true
  maakAutoMappen(p, 'run')
  return true
}

// De mappen van deze rij, waar hij ook staat.
function mappenVanSectie(p, sectie) {
  const rij = rijVoor(p, sectie)
  return Knoppenrij.mappenVan(rij.bron, sectie)
}

function bedraadMapMenu(p, sectie, blok) {
  const knop = blok.querySelector('[data-map-sectie]')
  if (!knop) return
  knop.onclick = (e) => {
    e.preventDefault()
    e.stopPropagation()
    const doos = knop.getBoundingClientRect()
    knop.classList.add('aan')
    toonContextMenu(doos.left, doos.bottom + 4, [
      { label: I18N.t('folder.new'), icoon: 'ti-folder-plus', doe: () => nieuweMap(p, sectie) },
      { label: I18N.t('folder.auto'), icoon: 'ti-wand', doe: () => autoMappen(p, sectie) },
      { scheiding: true },
      { label: I18N.t('folder.dissolveAll'), icoon: 'ti-folder-off',
        uit: !mappenVanSectie(p, sectie).length,
        doe: () => hefMappenOp(p, sectie, mappenVanSectie(p, sectie).map(f => f.id)) },
    ])
  }
}

// Elk blok met knoppen wordt op dezelfde manier bediend: de hint en de
// klaar-knop in de kop, het mappenmenu, de mapkoppen, het slepen en lang
// drukken. `wortel` bepaalt welke blokken: bij een project het hele scherm, bij
// cmd en powershell alleen dat paneel -- anders bedraadt een paneel de blokken
// van een project dat er nog naast staat.
function bedraadCmdKnopVolgorde(p, wortel = document) {
  wortel.querySelectorAll('[data-sectieblok]').forEach(blok => {
    const sectie = blok.dataset.sectieblok
    const grid = blok.querySelector('.cmd-grid')
    if (!grid) return
    const rij = rijVoor(p, sectie)
    const sorteren = sorteertSectie(sectie)

    blok.querySelector('.cmd-sort-hint')?.remove()
    blok.querySelector('.sort-klaar')?.remove()
    if (sorteren) {
      const kop = blok.querySelector('.cmd-section-label-row')
      const hint = document.createElement('div')
      hint.className = 'cmd-sort-hint sort-hint'
      hint.textContent = I18N.t('project.cmdSortHint')
      // Vóór het knoppenhoekje, anders komt de hint rechts van de knoppen te
      // staan en verspringen die alsnog.
      const hoek = kop?.querySelector('.kop-acties')
      if (hoek) kop.insertBefore(hint, hoek); else kop?.appendChild(hint)
      // Zonder knop is Escape de enige uitweg, en die moet je maar net kennen.
      const klaar = document.createElement('button')
      klaar.className = 'sort-klaar'
      klaar.title = I18N.t('common.sortDoneTitle')
      klaar.innerHTML = '<i class="ti ti-check"></i>'
      klaar.onclick = () => { zetRijSorteerModus(sectie, false); knopWisModus = ''; rij.herteken() }
      // Achter de prullenbak in hetzelfde hoekje, niet ergens los in de kop.
      ;(kop?.querySelector('.kop-acties') || kop)?.appendChild(klaar)
    }

    bedraadMapMenu(p, sectie, blok)
    // Op het hele blok en niet alleen het raster: de dichte mappen staan in de
    // kopregel, en die moeten net zo goed open kunnen en dingen kunnen ontvangen.
    bedraadMapKoppen(p, sectie, blok)
    if (sorteren) bedraadKnopSlepen(p, sectie, blok, grid)

    grid.querySelectorAll('.cmd-btn').forEach(btn => {
      let timer = null
      btn.onmousedown = (e) => {
        if (e.button !== 0 || sorteertSectie(sectie)) return
        timer = setTimeout(() => {
          zetRijSorteerModus(sectie, true)
          knopWisModus = ''
          showToast(I18N.t('project.cmdSortToast'))
          rij.herteken()
        }, LANG_DRUKKEN_MS)
      }
      btn.onmouseup = () => { clearTimeout(timer); timer = null }
      btn.onmouseleave = () => { clearTimeout(timer); timer = null }
    })
  })
}

// ── Knoppen weghalen ──────────────────────────────────────────────────────────
// Een klein prullenbakje in de sectiekop zet de wismodus aan; daarna haalt een
// klik op een knop hem weg. Wat "weghalen" betekent kies je één keer:
//
//   individueel — alleen hier verbergen. Terug te zetten in het bewerkvenster
//                 van het project, of in de cmd-instellingen.
//   globaal     — overal weg. Bestaat de knop nergens anders (een eigen
//                 commando, een gevonden programma), dan gaat hij echt weg.
//
// Die keuze wordt de eerste keer gevraagd en staat daarna in de instellingen.
let knopWisModus = ''        // '' | 'run' | 'snel'

function wisWijze() {
  const w = settings.knopVerwijderen
  return (w === 'globaal' || w === 'individueel') ? w : ''
}

function zetWisWijze(wijze) {
  settings.knopVerwijderen = wijze
  window.api.saveSettings(settings)
}

// Eerste keer: laten kiezen. Zonder keuze gaat er niets weg.
async function vraagWisWijze() {
  const gekozen = await vraagKeuze({
    titel: I18N.t('wis.chooseTitle'),
    tekst: I18N.t('wis.chooseText'),
    knoppen: [
      { label: I18N.t('common.cancel'), waarde: '' },
      { label: I18N.t('wis.chooseGlobal'), waarde: 'globaal', soort: 'gevaar' },
      { label: I18N.t('wis.chooseIndividual'), waarde: 'individueel', soort: 'primair' },
    ],
  })
  if (!gekozen) return ''
  zetWisWijze(gekozen)
  showToast(I18N.t(gekozen === 'globaal' ? 'wis.setGlobalToast' : 'wis.setIndividualToast'))
  return gekozen
}

async function zetKnopWisModus(sectie) {
  if (knopWisModus === sectie) { knopWisModus = ''; hertekenWeergave(); return }
  if (!sorteertSectie(sectie)) return
  if (!wisWijze() && !await vraagWisWijze()) return
  knopWisModus = sectie
  showToast(I18N.t('wis.modeOnToast'))
  hertekenWeergave()
}

function hertekenWeergave() {
  if (view === 'cmd') renderCmdPanel()
  else if (view === 'ps') renderPsPanel()
  else if (view === 'project' && activeId) renderMain()
}

// Waar hoort deze knop bij, en wat is er van te maken?
function knopOmschrijving(id) {
  if (id.startsWith('ai:prog:') || id.startsWith('ai:')) {
    const d = aiKlaarDiensten().find(x => 'ai:' + x.id === id)
    return d ? d.label : id
  }
  if (id.startsWith('editor:custom:')) {
    const e = (settings.customEditors || []).find(x => 'editor:custom:' + x.id === id)
    return (e && e.label) || id
  }
  if (id.startsWith('custom:')) {
    const p = projects.find(x => x.id === activeId)
    const c = (p?.customCmds || []).find(x => 'custom:' + x.id === id)
    return (c && (c.label || c.cmd)) || id
  }
  if (id.startsWith('pscmd:')) {
    const item = psSnelItems().find(x => x.id === id)
    return (item && item.label) || id.slice(6)
  }
  if (id.startsWith('quick:')) {
    const e = (history.entries || []).find(x => 'quick:' + x.id === id)
    return (e && (e.label || e.cmd)) || id
  }
  const def = [...RUN_CMD_DEFS, ...TOOLS_CMD_DEFS].find(d => d.id === id)
  return def ? defLabel(def) : id
}

// Bestaat deze knop maar op één plek? Dan is "globaal weghalen" echt weghalen.
function knopIsUniek(id) {
  return id.startsWith('custom:') || id.startsWith('editor:custom:')
}

// Waar hoort deze rij bij? Dat hoort in de vraag te staan, anders weet je niet
// waar de knop uit verdwijnt.
function wisPlaatsNaam(ctx) {
  if (!ctx || ctx.id === CMD_CTX_ID) return 'cmd'
  if (ctx.id === PS_CTX_ID) return 'powershell'
  const p = projects.find(x => x.id === ctx.id)
  return (p && p.name) || 'dit project'
}

async function verwijderKnop(ctx, sectie, id) {
  const wijze = wisWijze() || await vraagWisWijze()
  if (!wijze) return
  const naam = knopOmschrijving(id)
  const echtWeg = wijze === 'globaal' && knopIsUniek(id)
  const plaats = wisPlaatsNaam(ctx)

  // Altijd eerst vragen. Eén misklik in een rij knoppen is zo gebeurd, en de
  // vraag zegt erbij waar hij uit verdwijnt.
  const titel = echtWeg ? 'wis.confirmDeleteTitle'
              : wijze === 'globaal' ? 'wis.confirmHideAllTitle'
              : 'wis.confirmHereTitle'
  const tekst = echtWeg ? 'wis.confirmDeleteText'
              : wijze === 'globaal' ? 'wis.confirmHideAllText'
              : 'wis.confirmHereText'
  const ja = await vraagJaNee(
    I18N.t(titel, { name: naam, place: plaats }),
    I18N.t(tekst, { name: naam, place: plaats }),
    I18N.t('wis.confirmButton'), 'gevaar')
  if (!ja) return

  if (sectie === 'snel') {
    // De cmd-rij bestaat maar één keer, dus daar valt niets globaal te doen.
    zetCmdSnelZichtbaar(id, false)
  } else if (sectie === 'ps-snel') {
    zetPsSnelZichtbaar(id, false)
  } else if (wijze === 'individueel') {
    const p = projects.find(x => x.id === ctx.id)
    if (!p) return
    p.cmdVisibility = { ...(p.cmdVisibility || {}), [id]: false }
    saveProjects()
  } else if (id.startsWith('custom:')) {
    const p = projects.find(x => x.id === ctx.id)
    if (!p) return
    p.customCmds = (p.customCmds || []).filter(c => 'custom:' + c.id !== id)
    saveProjects()
  } else if (id.startsWith('editor:custom:')) {
    settings.customEditors = (settings.customEditors || [])
      .filter(e => 'editor:custom:' + e.id !== id)
    window.api.saveSettings(settings)
  } else if (id.startsWith('ai:')) {
    const uit = { ...((settings.ai || {}).knoppenUit || {}) }
    uit[id.slice(3)] = true
    settings.ai = { ...(settings.ai || {}), knoppenUit: uit }
    window.api.saveSettings(settings)
    aiKnopStempel = null
  } else {
    // Een vaste knop bestaat in elk project; overal verbergen dus.
    projects.forEach(p => { p.cmdVisibility = { ...(p.cmdVisibility || {}), [id]: false } })
    saveProjects()
  }

  showToast(I18N.t(echtWeg ? 'wis.deletedToast' : 'wis.hiddenToast', { name: naam }))
  hertekenWeergave()
}

// Eén luisteraar op het raster in plaats van op elke knop apart: er zijn zes
// soorten knoppen en die zouden anders allemaal hun eigen uitzondering krijgen.
function bedraadKnopWissen(ctx, sectie, grid) {
  if (!grid || knopWisModus !== sectie) return
  grid.classList.add('cmd-wissen')
  grid.addEventListener('click', (e) => {
    // Een mapkop hoort in deze modus niet open te klappen maar weg te gaan.
    // Deze luisteraar zit op capture, dus hij is eerder aan de beurt dan het
    // openklappen -- daar hoeft dat verderop niets van te weten.
    const kop = e.target.closest('.cmd-map-kop')
    if (kop && grid.contains(kop)) {
      e.preventDefault()
      e.stopPropagation()
      verwijderMap(ctx, sectie, kop.dataset.map)
      return
    }
    const btn = e.target.closest('.cmd-btn')
    if (!btn || !grid.contains(btn)) return
    e.preventDefault()
    e.stopPropagation()
    const id = btn.dataset.volgordeId
    if (id) verwijderKnop(ctx, sectie, id)
  }, true)
}

// Een volle map weggooien zou de knoppen erin ook laten verdwijnen, en dat is
// niet wat iemand bedoelt die op een prullenbak drukt bij een naam. Dus eerst
// leegmaken. Wie de knoppen wil houden maar de map niet, heeft "map opheffen"
// in het rechtermuismenu -- die laat de knoppen staan.
function verwijderMap(p, sectie, mapId) {
  const rij = rijVoor(p, sectie)
  const f = folderOp(rij.bron, mapId)
  if (!f) return
  if (Knoppenrij.knoppenInMap(rij, mapId).length) {
    showToast(I18N.t('folder.notEmptyToast', { name: f.label }))
    return
  }
  hefMappenOp(p, sectie, [mapId])
}

// Rechts in de sectiekop: eerst de prullenbak, dan de klaar-knop. In een eigen
// hoekje, want anders bepaalt de rest van de kop (het schuifje, --release)
// waar ze belanden en staan ze per sectie ergens anders.
function kopActiesHtml(sectie) {
  return `<span class="kop-acties">${wisKnopHtml(sectie)}${mapKnopHtml(sectie)}</span>`
}

// Mappen maak je terwijl je de rij ordent, niet ertussendoor: de knop staat
// daarom in hetzelfde hoekje als de prullenbak en komt in dezelfde modus
// tevoorschijn. Elke rij heeft hem, ook de snelrijen van cmd en powershell --
// die worden net zo goed lang.
function mapKnopHtml(sectie) {
  if (!sorteertSectie(sectie)) return ''
  return `<button class="knop-map" data-map-sectie="${esc(sectie)}" title="${esc(I18N.t('folder.menuTitle'))}"><i class="ti ti-folder"></i></button>`
}

// Weghalen hoort bij het herschikken van een rij, niet bij het dagelijks
// gebruik ervan. De prullenbak verschijnt daarom pas in de verplaatsmodus —
// anders staat er permanent een knop waarmee je per ongeluk iets weggooit.
function sorteertSectie(sectie) {
  if (sectie === SNEL_SECTIE.cmd) return cmdSnelSorteerModus
  if (sectie === SNEL_SECTIE.ps) return psSnelSorteerModus
  return cmdSorteerModus === sectie
}

// De verplaatsmodus staat per rij ergens anders opgeslagen. Wie hem aan- of
// uitzet gaat hierlangs, zodat dat verschil op één plek zit.
function zetRijSorteerModus(sectie, aan) {
  if (sectie === SNEL_SECTIE.cmd) cmdSnelSorteerModus = !!aan
  else if (sectie === SNEL_SECTIE.ps) psSnelSorteerModus = !!aan
  else cmdSorteerModus = aan ? sectie : ''
}

// Hoeveel knoppen staan er nu verborgen? Alleen wat "alleen hier" weggehaald
// is, want dat is het enige dat we kunnen terugzetten.
function verborgenKnopAantal() {
  let n = 0
  for (const p of projects) n += Object.values(p.cmdVisibility || {}).filter(v => v === false).length
  for (const soort of ['cmd', 'ps']) {
    n += Object.values((settings[soort] || {}).cmdVisibility || {}).filter(v => v === false).length
  }
  return n
}

async function herstelVerborgenKnoppen() {
  const n = verborgenKnopAantal()
  if (!n) { showToast(I18N.t('wis.nothingHiddenToast')); return }
  if (!await vraagJaNee(I18N.t('wis.restoreTitle'), I18N.t('wis.restoreText', { count: n }),
      I18N.t('wis.restoreButton'))) return

  // Alleen de uitzettingen terugdraaien. Een knop die standaard uit staat en
  // die je juist expliciet hebt aangezet, is geen verborgen knop — die telt
  // hierboven ook niet mee, dus hem hier wegvegen zou hem stilletjes laten
  // verdwijnen bij een handeling die knoppen zou moeten terugbrengen.
  projects.forEach(p => {
    p.cmdVisibility = Object.fromEntries(
      Object.entries(p.cmdVisibility || {}).filter(([, v]) => v === true))
  })
  saveProjects()
  for (const soort of ['cmd', 'ps']) {
    const bron = settings[soort]
    if (!bron) continue
    bron.cmdVisibility = Object.fromEntries(
      Object.entries(bron.cmdVisibility || {}).filter(([, v]) => v === true))
  }
  window.api.saveSettings(settings)

  showToast(I18N.t('wis.restoredToast', { count: n }))
  renderSettingsPanel()
}

function wisKnopHtml(sectie) {
  if (!sorteertSectie(sectie)) return ''
  // Bewust niet de klasse van het sorteericoon: die staat op opacity 0 tot je
  // over een zijbalkkop gaat, en in een sectiekop werd hij dus nooit zichtbaar.
  return `<button class="knop-wis ${knopWisModus === sectie ? 'aan' : ''}" data-wis-sectie="${esc(sectie)}" title="${esc(I18N.t('wis.modeTitle'))}"><i class="ti ti-trash"></i></button>`
}

function bedraadWisKnoppen() {
  document.querySelectorAll('[data-wis-sectie]').forEach(btn => {
    btn.onclick = () => zetKnopWisModus(btn.dataset.wisSectie)
  })
}

function renderMain() {
  aiKnopStempel = aiKnopVingerafdruk()
  const p    = projects.find(x => x.id === activeId)
  const main = document.getElementById('main')
  if (!p) {
    getekendProjectId = ''
    main.innerHTML = `<div class="empty-state"><i class="ti ti-layout-sidebar-left-expand"></i><p>${esc(I18N.t('main.emptyState'))}</p></div>`
    keurStatusNa()
    return
  }

  const zelfdeProject = getekendProjectId === p.id

  const activeLoc  = p.locations[p.activeLocation] || p.locations[0]

  // Nog niet gemeten? Dan halen we het op en tekent die aanroep zelf opnieuw.
  ververesGitStaat(p)

  const runGridHtml = cmdGridHtml(p, 'run')
  const aiShell     = aiShellKnop(p.id)
  const runInhoud   = !!zichtbareCmdVolgorde(p, 'run').length
  const runAan      = sectieAan(p, 'run')


  const chromeHtml = `
    <div class="proj-header" data-krap>
      <div class="proj-header-left" data-krap>
        <span class="proj-header-icon">${p.icon}</span>
        <span class="proj-header-name">${esc(p.name)}</span>
        ${gitIndicatorHtml(p)}
      </div>
      <div class="loc-switcher">
        <label>${esc(I18N.t('project.locationLabel'))}</label>
        ${locKnopHtml(p)}
        <button class="btn-open-folder" id="btn-open-folder" title="${esc(I18N.t('project.openFolderButton'))}">
          <i class="ti ti-folder-open" style="font-size:14px"></i>${knopTekst(I18N.t('project.openFolderButton'))}
        </button>
        <button class="btn-open-folder" id="btn-open-cmd" title="cmd">
          <i class="ti ti-terminal-2" style="font-size:14px"></i>${knopTekst('cmd')}
        </button>
        <button class="btn-open-folder" id="btn-copy-loc" title="${esc(I18N.t('ctx.copyPath'))}">
          <i class="ti ti-copy" style="font-size:14px"></i>
        </button>
      </div>
    </div>

    ${(runInhoud || aiShell) ? `
    <div class="cmd-section ${runAan ? '' : 'sectie-uit'}" data-sectieblok="run">
      <div class="cmd-section-label-row">
        <div class="cmd-section-label">${esc(I18N.t('project.buttonsSectionLabel'))}</div>
        <label class="toggle-switch" title="${esc(I18N.t('project.sectionToggleTitle'))}">
          <input type="checkbox" id="toggle-sectie-run" ${runAan ? 'checked' : ''} />
          <span class="toggle-slider"></span>
        </label>
        ${dichteMappenHtml(p, 'run')}
        ${kopActiesHtml('run')}
      </div>
      <div class="cmd-grid ${cmdSorteerModus === 'run' ? 'cmd-sorteren' : ''}">
        ${runGridHtml}${cmdSorteerModus === 'run' ? '' : aiShell}
      </div>
    </div>` : ''}

  `

  const wrapBestaat = levend('#main .terminal-wrap.splitbaar')
  const houdWerkvlak = wrapBestaat && (
    splitTweeProjecten()
    || (splitGemengd() && werkSlots.some(s => s.view === 'project' && s.projectId === activeId))
  )
  if (houdWerkvlak) {
    let chrome = document.querySelector('#main .proj-chrome')
    if (!chrome) {
      chrome = document.createElement('div')
      chrome.className = 'proj-chrome'
      wrapBestaat.parentNode.insertBefore(chrome, wrapBestaat)
      ;[...wrapBestaat.parentNode.children].forEach(el => {
        if (el !== chrome && el !== wrapBestaat) el.remove()
      })
    }
    chrome.innerHTML = chromeHtml
  } else {
    main.innerHTML = `
    <div class="proj-chrome">${chromeHtml}</div>
    ${terminalMarkup({ splitbaar: true })}
  `
  }

  getekendProjectId = p.id
  projectWeergaveAchterhaald = false

  bedraadLocKiezer(p)
  document.getElementById('btn-open-folder').onclick = () => {
    if (activeLoc) window.api.openFolder(activeLoc.path)
  }
  document.getElementById('btn-open-cmd').onclick = () => {
    if (activeLoc) openCmdMetMelding(activeLoc.path)
  }
  document.getElementById('btn-copy-loc').onclick = () => {
    if (!activeLoc) return
    navigator.clipboard.writeText(activeLoc.path)
    showToast(I18N.t('toast.copiedGeneric'))
  }
  const releaseEl = document.getElementById('toggle-release')
  if (releaseEl) releaseEl.onchange = (e) => {
    p.release = e.target.checked
    saveProjects()
  }
  bedraadAiKnoppen(p)
  bedraadWisKnoppen()
  document.querySelectorAll('[data-sectieblok]').forEach(blok => {
    bedraadKnopWissen(p, blok.dataset.sectieblok, blok.querySelector('.cmd-grid'))
  })

  const runToggle = document.getElementById('toggle-sectie-run')
  if (runToggle) runToggle.onchange = (e) => {
    zetSectie(p, 'run', e.target.checked); renderMain()
  }

  // Flutter commands
  main.querySelectorAll('.cmd-btn[data-cmd]').forEach(btn => {
    btn.onclick = () => {
      if (cmdSorteerModus) return
      runCmd(p, btn.dataset.cmd)
    }
  })

  // Eigen knoppen uit het woordenboek
  main.querySelectorAll('.cmd-btn[data-custom]').forEach(btn => {
    btn.onclick = () => {
      if (cmdSorteerModus) return
      const c = (p.customCmds || []).find(x => x.id === btn.dataset.custom)
      if (c) executeCmd(p, c.cmd, null)
    }
  })

  // Editor buttons (alleen customEditors / automatisch gevonden programma's)
  main.querySelectorAll('.cmd-btn[data-editor]').forEach(btn => {
    btn.onclick = async () => {
      if (cmdSorteerModus) return
      const key = btn.dataset.editor
      const loc = p.locations[p.activeLocation] || p.locations[0]
      if (!loc?.path) { showToast(I18N.t('editor.noLocationSetToast')); return }
      const prog = (settings.customEditors || []).find(x => x.id === key.slice(7))
      const editorPath = prog?.path
      if (!editorPath) { showToast(I18N.t('editor.pathNotSetToast')); return }

      // Claude (desktop) opent geen map zoals een editor dat doet: die krijgt
      // het project via zijn eigen claude://-koppeling mee. Zonder deze stap
      // start hij wel op, maar zonder het juiste project.
      if (prog.catalogId === 'claudeDesktop') {
        const gelukt = await window.api.openClaudeDesktop({ cwd: loc.path })
        showToast(I18N.t(gelukt ? 'editor.claudeDesktopOpenedToast' : 'editor.noLocationSetToast'))
        return
      }

      // De naam zonder extensie: `claude.cmd` (npm) is net zo goed Claude Code
      // als `claude.exe`, en alleen zo herkent de lijst hieronder dat het om
      // een programma gaat dat een echt toetsenbord nodig heeft.
      const progNaam = editorPath.split(/[\\/]/).pop().replace(/\.(exe|cmd|bat|com|ps1)$/i, '')
      if (vraagtOmEenVenster(progNaam)) {
        const commando = /\s/.test(editorPath) ? `"${editorPath}"` : editorPath
        if (await startPtySessie(p.id, commando, loc.path)) {
          showToast(I18N.t('editor.runningInOutputToast', { name: ptyNaam(editorPath) }))
          return
        }
        const r = await openCmdMetMelding({ cwd: loc.path, cmd: `"${editorPath}"` })
        // Netwerk-toast wint: die is nieuwer en zegt iets wat de gebruiker
        // anders niet ziet in het losse venster.
        if (!(r && r.viaLetter)) showToast(I18N.t('editor.claudeCodeOpenedToast'))
        return
      }
      window.api.openEditor({ editorPath, cwd: loc.path })
    }
  })

  bedraadCmdKnopVolgorde(p)
  if (houdWerkvlak) {
    activeTermId = p.id
    haalVerkennerOp(p.id)
    termTab = werkSlots[werkSlotFocus].tab
    const loc = p.locations[p.activeLocation] || p.locations[0]
    updateTermPlaceholder(loc?.path || '')
    pasTermSchermAan()
    vulIdleVerkenner()
    keurKrappeBalken()
    keurStatusNa()
    return
  }
  wireTerminal(p, { volgBoom: !zelfdeProject })
  keurKrappeBalken()
  keurStatusNa()
}

// Verkenner-HTML, een keer per vlak. Zonder suffix blijven de oude id's (tests
// en de bestaande bedrading); het andere vlak krijgt "-andere" achter elke id.
function verkennerMarkup(suffix = '') {
  const id = n => n + suffix
  return `
      <div class="br-host" id="${id('browser')}" hidden>
        <div class="br-bar">
          <button class="br-btn" id="${id('br-up')}" title="${esc(I18N.t('browser.upTitle'))}"><i class="ti ti-arrow-up"></i></button>
          <button class="br-btn" id="${id('br-home')}" title="${esc(I18N.t('browser.homeTitle'))}"><i class="ti ti-home"></i></button>
          <div class="br-path-wrap">
            <input class="field mono br-path" id="${id('br-path')}" spellcheck="false" autocomplete="off" placeholder="${esc(I18N.t('browser.pathPlaceholder'))}" />
            <div class="br-suggest" id="${id('br-suggest')}" hidden></div>
          </div>
          <select class="loc-select br-drives" id="${id('br-drives')}" title="${esc(I18N.t('browser.drivesTitle'))}"></select>
          <button class="br-btn" id="${id('br-refresh')}" title="${esc(I18N.t('ctx.refresh'))}"><i class="ti ti-refresh"></i></button>
          <button class="br-btn" id="${id('br-external')}" title="${esc(I18N.t('browser.openInExplorerTitle'))}"><i class="ti ti-external-link"></i></button>
        </div>
        <div class="br-bar" data-krap>
          <input class="field br-filter" id="${id('br-filter')}" placeholder="${esc(I18N.t('browser.filterPlaceholder'))}" spellcheck="false" />
          <button class="br-btn" id="${id('br-diep')}" title="${esc(I18N.t('browser.deepSearchTitle'))}"><i class="ti ti-zoom-scan"></i></button>
          <button class="br-btn werkhier" id="${id('br-usehere')}" title="${esc(I18N.t('browser.useHereTitle'))}"><i class="ti ti-arrow-big-right-filled"></i>${knopTekst(I18N.t('browser.useHereButton'))}</button>
        </div>
        <div class="br-list" id="${id('br-list')}"><div class="br-kader" id="${id('br-kader')}" hidden></div></div>
        <div class="br-status" id="${id('br-status')}"></div>
        <div class="br-voortgang" id="${id('br-voortgang')}" hidden>
          <div class="br-balk"><div class="br-balk-vol" id="${id('br-balk-vol')}"></div></div>
          <span class="br-voortgang-tekst" id="${id('br-voortgang-tekst')}"></span>
          <button class="br-btn" id="${id('br-annuleer')}" title="${esc(I18N.t('browser.cancelTitle'))}"><i class="ti ti-x"></i></button>
        </div>
      </div>`
}

// ── De locatiekiezer ──────────────────────────────────────────────────────────
// Was een keuzelijst met "label — heel lang pad" erin; die werd bij twee
// locaties al breder dan de halve kopregel. Nu staat er alleen de naam van de
// locatie met een pijltje erachter, en het pad zit in het menu en in de titel.
function locKnopHtml(p) {
  const loc = p.locations[p.activeLocation] || p.locations[0] || { label: '', path: '' }
  return `<button class="loc-select loc-knop" id="loc-kiezer" title="${esc(loc.label + ' — ' + loc.path)}">
      <span class="loc-naam">${esc(loc.label || I18N.t('project.locationLabel'))}</span>
      <i class="ti ti-chevron-down"></i>
    </button>`
}

function bedraadLocKiezer(p) {
  const knop = document.getElementById('loc-kiezer')
  if (!knop) return
  knop.onclick = (e) => {
    e.preventDefault()
    e.stopPropagation()
    const doos = knop.getBoundingClientRect()
    knop.classList.add('aan')
    toonContextMenu(doos.left, doos.bottom + 4, p.locations.map((l, i) => ({
      label: `${l.label} — ${shortenPath(l.path, 44)}`,
      icoon: i === p.activeLocation ? 'ti-check' : 'ti-folder',
      doe: () => {
        if (i === p.activeLocation) return
        p.activeLocation = i
        saveProjects(); renderSidebar(); renderMain()
      },
    })))
  }
}

// ── Krappe balken ─────────────────────────────────────────────────────────────
// Past een balk niet meer, dan gaan de teksten eruit en blijven de iconen. Dat
// wordt gemeten en niet geraden: een vaste breedte-grens klopt niet bij elke
// taal, en al helemaal niet in een gesplitst vlak -- daar is de helft van het
// scherm de ruimte die telt, en het venster zegt daar niets over.
//
// De tekst van een knop staat daarom in een eigen span, en de titel herhaalt
// hem: blijft alleen het icoon over, dan kun je er nog steeds achter komen wat
// het is.
function knopTekst(tekst) {
  return `<span class="knop-tekst">${esc(tekst)}</span>`
}

function keurKrappeBalken() {
  document.querySelectorAll('[data-krap]').forEach(el => {
    // Eerst ruim aannemen en dan meten: anders meet je de ingeklapte stand en
    // klapt hij nooit meer uit.
    el.classList.remove('krap')
    if (el.scrollWidth > el.clientWidth + 1) el.classList.add('krap')
  })
}

// De panelen zelf blijven bestaan; alleen hun inhoud wordt hertekend. Daarom
// kijken we naar die panelen en niet naar de balken erin: dan is één keer
// aanmelden genoeg en houden we geen losgeraakte elementen vast.
function volgKrappeVlakken() {
  if (typeof ResizeObserver !== 'function') return
  const waarnemer = new ResizeObserver(() => keurKrappeBalken())
  document.querySelectorAll('.werk .main').forEach(el => waarnemer.observe(el))
}

// ── Herbruikbare terminal ─────────────────────────────────────────────────────
// Zowel de projectweergave als de losse CMD-sectie gebruiken deze; ze verschillen
// alleen in welke context (map + id) de commando's krijgen.
function terminalMarkup(opts = {}) {
  const splitbaar = opts.splitbaar === true
  const splitHits = splitbaar ? `
        <button type="button" class="term-split-plus" data-split="left" hidden><i class="ti ti-minus"></i></button>
        <button type="button" class="term-split-plus" data-split="top" hidden><i class="ti ti-minus"></i></button>
        <button type="button" class="term-split-plus" data-split="right" title="${esc(I18N.t('term.splitRightTitle'))}" aria-label="${esc(I18N.t('term.splitRightTitle'))}"><i class="ti ti-plus"></i></button>
        <button type="button" class="term-split-plus" data-split="bottom" title="${esc(I18N.t('term.splitBottomTitle'))}" aria-label="${esc(I18N.t('term.splitBottomTitle'))}"><i class="ti ti-plus"></i></button>
  ` : ''
  return `
    <div class="terminal-wrap${splitbaar ? ' splitbaar' : ''}">
      <div class="terminal-bar" data-krap>
        <div class="term-tabs">
          <button class="term-tab active" data-tab="output" title="${esc(I18N.t('term.tabOutput'))}"><i class="ti ti-terminal-2"></i>${knopTekst(I18N.t('term.tabOutput'))}<span class="pty-punt" id="pty-punt" hidden></span></button>
          <button class="term-tab" data-tab="browser" title="${esc(I18N.t('term.tabBrowser'))}"><i class="ti ti-folders"></i>${knopTekst(I18N.t('term.tabBrowser'))}</button>
        </div>
        <div class="terminal-bar-btns">
          <button class="term-btn alleen-verkenner" id="br-weergave" title="${esc(I18N.t('term.viewTitle'))}" hidden><i class="ti ti-layout-grid" style="font-size:13px"></i>${knopTekst(I18N.t('term.viewButton'))}</button>
          <button class="term-btn alleen-verkenner" id="br-sorteer" title="${esc(I18N.t('term.sortTitle'))}" hidden><i class="ti ti-arrows-sort" style="font-size:13px"></i>${knopTekst(I18N.t('term.sortButton'))}</button>
          <button class="term-btn" id="btn-copy-last" title="${esc(I18N.t('term.copyLastButton'))}"><i class="ti ti-copy" style="font-size:13px"></i>${knopTekst(I18N.t('term.copyLastButton'))}</button>
          <button class="term-btn" id="btn-copy-all" title="${esc(I18N.t('term.copyAllButton'))}"><i class="ti ti-clipboard" style="font-size:13px"></i>${knopTekst(I18N.t('term.copyAllButton'))}</button>
          <button class="term-btn bat" id="btn-bat" title="${esc(I18N.t('term.batButtonTitle'))}"><i class="ti ti-file-code" style="font-size:13px"></i>${knopTekst('bat')}</button>
          <button class="term-btn stop" id="btn-kill" title="${esc(I18N.t('term.stopButton'))}"><i class="ti ti-player-stop" style="font-size:13px"></i>${knopTekst(I18N.t('term.stopButton'))}</button>
          <button class="term-btn" id="btn-pty-sluit" title="${esc(I18N.t('term.closeSessionButton'))}" hidden><i class="ti ti-x" style="font-size:13px"></i>${knopTekst(I18N.t('term.closeSessionButton'))}</button>
          <button class="term-btn" id="btn-clear" title="${esc(I18N.t('common.clear'))}"><i class="ti ti-trash" style="font-size:13px"></i>${knopTekst(I18N.t('common.clear'))}</button>
          <button class="term-btn update" id="btn-relaunch" title="${esc(I18N.t('term.relaunchTitle'))}"><i class="ti ti-refresh" style="font-size:13px"></i>${knopTekst(I18N.t('term.relaunchButton'))}</button>
        </div>
      </div>
      <div class="term-stage">
        <div class="term-pane" data-pane="output" data-slot="0">
          <div class="term-pane-naam"></div>
          <div id="terminal"><span class="t-cursor"></span></div>
          <div id="pty-host" hidden></div>
          ${splitbaar ? verkennerMarkup('-andere') : ''}
        </div>
        <div class="term-pane" data-pane="browser" data-slot="1">
          <div class="term-pane-naam"></div>
          <div id="terminal-andere" hidden></div>
          <div id="pty-host-andere" hidden></div>
          ${verkennerMarkup()}
        </div>
        ${splitHits}
      </div>
      <div class="term-input-wrap">
        <span class="term-input-prompt">$</span>
        <div class="term-input-inner">
          <textarea class="term-input" id="term-input" rows="1" placeholder="" autocomplete="off" spellcheck="false"></textarea>
          <div class="term-autocomplete" id="term-autocomplete" hidden></div>
        </div>
        <button class="term-pick-btn" id="term-pick-folder" title="${esc(I18N.t('cmd.pickFolderTitle'))}" hidden><i class="ti ti-folder-search"></i></button>
        <button class="term-run-btn" id="term-run-btn"><i class="ti ti-corner-down-left"></i></button>
      </div>
    </div>
  `
}

// ── Werkmap in het invoerveld ─────────────────────────────────────────────────
// Lange paden worden in het midden ingekort op een mapgrens, zodat het begin
// (de schijf) en vooral het eind (waar je zit) leesbaar blijven:
//   C:\Users\.....\laatste\stuk\map
function shortenPath(p, maxChars) {
  const s = String(p || '')
  if (!s || s.length <= maxChars) return s

  const sep   = s.includes('\\') ? '\\' : '/'
  const parts = s.split(sep)
  const midden = (txt) => {
    const keep = Math.max(3, Math.floor((maxChars - 5) / 2))
    return txt.slice(0, keep) + '.....' + txt.slice(-keep)
  }

  // Te weinig segmenten om weg te laten: dan maar hard in het midden knippen
  if (parts.length < 4) return midden(s)

  const head = parts.slice(0, 2).join(sep)   // bijv. C:\Users
  let best = null
  // Zoveel mogelijk van het eind bewaren zolang het past
  for (let n = 1; n <= parts.length - 3; n++) {
    const cand = head + sep + '.....' + sep + parts.slice(-n).join(sep)
    if (cand.length > maxChars) break
    best = cand
  }
  if (best) return best

  // Zelfs met één staartsegment te lang
  const minimal = head + sep + '.....' + sep + parts[parts.length - 1]
  return minimal.length <= maxChars ? minimal : midden(s)
}

// Hoeveel tekens er in de helft van het venster passen
function promptMaxChars() {
  const el = termEl('term-input')
  let fontSize = 12
  try { fontSize = parseFloat(window.getComputedStyle(el).fontSize) || 12 } catch {}
  const halfScreen = Math.floor((window.innerWidth || 1000) / 2)
  return Math.max(14, Math.floor(halfScreen / (fontSize * 0.6)))
}

function updateTermPlaceholder(cwd) {
  const el = termEl('term-input')
  if (!el) return
  const path = cwd ?? currentCwd()
  // In gespreksmodus zegt de werkmap niets; dan wil je zien met wie je praat.
  if (aiAan(activeTermId)) {
    const s = aiSessie(activeTermId)
    const info = aiInfo(s.providerId)
    el.placeholder = I18N.t('ai.inputPlaceholder', {
      name: (info && info.label) || s.providerId, model: aiModelNaam(s) })
    el.title = path || ''
    return
  }
  el.placeholder = path ? shortenPath(path, promptMaxChars()) : I18N.t('term.noCwdPlaceholder')
  el.title = path || ''
}

function currentCwd() {
  const ctx = currentCtx()
  if (!ctx) return ''
  const loc = ctx.locations[ctx.activeLocation] || ctx.locations[0]
  return loc?.path || ''
}

// Leegt de zichtbare uitvoer én wat ervan bewaard is voor deze weergave.
function wisTerminal() {
  const term = termEl('terminal')
  if (term) term.innerHTML = '<span class="t-cursor"></span>'
  if (activeTermId) termOutput[activeTermId] = ''
  // Loopt er een antwoord binnen, dan hoort dat verder te groeien in een vers
  // vak. Zonder dit schreef het volgende stukje de zojuist gewiste uitvoer
  // gewoon weer terug.
  if (activeTermId) aiStroomHervat(activeTermId)
  setStatus('hide')
}

// ── Verkenner ─────────────────────────────────────────────────────────────────
// Het uitvoervenster kan omschakelen naar een bladerweergave: door mappen lopen,
// bestanden openen, en in de cmd-sectie een map als werkmap kiezen.
const DEZE_PC = '::deze-pc'   // virtueel niveau boven de schijven

// Letters van gekoppelde netwerkschijven (P:, Z:, …), bijgewerkt bij listDrives.
// UNC wordt apart herkend via isUncPad; deze set vult isNetwerkPad aan.
let netwerkSchijfLetters = new Set()

function onthoudNetwerkSchijven(schijven) {
  const set = new Set()
  for (const d of schijven || []) {
    if (!d || !d.netwerk) continue
    const letter = GitTools.schijfLetterVan(d.path)
    if (letter) set.add(letter)
  }
  netwerkSchijfLetters = set
}

function padIsNetwerk(pad) {
  return GitTools.isNetwerkPad(pad, netwerkSchijfLetters)
}

// Hoe een wortel heet in de boom, de verkenner en de schijvenlijst: "C:" voor
// een schijf, "server\share" voor een netwerkmap. Die laatste heeft geen letter,
// dus zonder dit stond er `\server\share` — de eerste streep eraf gehaald door
// een replace die op schijven was geschreven.
function wortelNaam(d) {
  const pad = String((d && d.path) || d || '')
  // Alleen UNC-wortels: een gekoppelde letter (P:) is óók netwerk voor git, maar
  // hoort in de boom gewoon als "P:" te blijven staan.
  if (d && d.netwerk && GitTools.isUncPad(pad)) return GitTools.uncNaam(pad)
  return pad.replace(/[\\/]+$/, '')
}
const ARCHIEF_EXT = /\.(zip|jar|apk|aar|war|docx|xlsx|pptx|epub|whl|nupkg|vsix|rar|7z|tar|gz|tgz|bz2|xz|iso|cab)$/i

// Een pad ín een archief ziet eruit als  C:\map\archief.zip::submap/bestand
function inArchief(p) { return String(p || '').includes('.') && /\.[a-z0-9]+::/i.test(p) }

let termTab        = 'output'   // 'output' | 'browser'
let termSplit      = null       // null | 'right' | 'bottom' — alleen in een project
let termSplitFirst = 'output'   // welk paneel links/boven blijft staan
let werkSlots      = null       // null | [{ view, projectId?, tab? }, { view, projectId?, tab? }]
let werkSlotFocus  = 0          // 0 = output-paneel, 1 = verkenner-paneel
let browserPath  = ''
let browserItems = []
let browserFout  = ''
// Selectie: een verzameling paden, plus waar de aandacht ligt en waar een
// reeks met Shift vandaan begint.
let browserSelectie = new Set()
let browserFocus    = -1    // regel waar de pijltjes staan
let browserAnker    = -1    // beginpunt van een Shift-reeks
let browserZichtbaar = []   // wat er nu in de lijst staat, na filteren
let browserParent = null
let sugItems = []
let sugIndex = -1
let sugVerbergTimer = null

// Per project bewaren we de verkenner, zodat twee open projecten elk hun
// eigen map, lijst en selectie houden.
const verkennerById = {}
let verkennerTekenPid = null   // tijdelijk: tekenen of navigeren voor een ander project

function verkennerPid() {
  if (verkennerTekenPid) return verkennerTekenPid
  if (view === 'cmd') return CMD_CTX_ID
  if (view === 'ps') return PS_CTX_ID
  // In een split hoort de verkenner bij het project dat in beeld staat, niet bij
  // activeId. Staat het woordenboek ernaast, dan loopt activeId achter op het
  // project in het vlak, en werd de map van het ene project onder het andere
  // weggeschreven -- daarna opende dat project in de map van zijn buurman.
  if (splitAan() && werkSlots) {
    const gericht = werkSlots[werkSlotFocus]
    if (gericht && gericht.view === 'project' && gericht.projectId) return gericht.projectId
    const ander = werkSlots.find(s => s && s.view === 'project' && s.projectId)
    if (ander) return ander.projectId
  }
  return activeId || activeTermId
}

function verkennerStaat(pid = verkennerPid()) {
  const id = pid || '__none__'
  if (!verkennerById[id]) {
    verkennerById[id] = {
      path: (settings.verkennerPaden || {})[id] || '',
      items: [], fout: '', parent: null,
      selectie: new Set(), focus: -1, anker: -1, zichtbaar: [],
      scroll: 0,
    }
  }
  return verkennerById[id]
}

function bewaarVerkennerPad(pid, pad) {
  if (!pid || !pad) return
  const next = { ...(settings.verkennerPaden || {}) }
  if (next[pid] === pad) return
  next[pid] = pad
  settings.verkennerPaden = next
  window.api.saveSettings(settings)
}

function bergVerkennerOp(pid = verkennerPid()) {
  if (!pid) return
  const s = verkennerStaat(pid)
  s.path = browserPath
  s.items = Array.isArray(browserItems) ? browserItems.slice() : []
  s.fout = browserFout
  s.parent = browserParent
  s.selectie = browserSelectie instanceof Set ? new Set(browserSelectie) : new Set()
  s.focus = browserFocus
  s.anker = browserAnker
  s.zichtbaar = Array.isArray(browserZichtbaar) ? browserZichtbaar.slice() : []
  const lijst = brEl('br-list', pid)
  if (lijst) s.scroll = lijst.scrollTop
  bewaarVerkennerPad(pid, browserPath)
}

function haalVerkennerOp(pid = verkennerPid()) {
  const s = verkennerStaat(pid)
  browserPath = s.path || (settings.verkennerPaden || {})[pid] || ''
  browserItems = Array.isArray(s.items) ? s.items.slice() : []
  browserFout = s.fout
  browserParent = s.parent
  browserSelectie = s.selectie instanceof Set ? new Set(s.selectie) : new Set()
  browserFocus = s.focus
  browserAnker = s.anker
  browserZichtbaar = Array.isArray(s.zichtbaar) ? s.zichtbaar.slice() : []
}

function brSuffix(pid = verkennerPid()) {
  if (splitTweeProjecten() && werkSlots && werkSlots[0].projectId === pid) return '-andere'
  return ''
}

function brEl(name, pid) {
  const id = pid || verkennerPid()
  const inPaneel = (root, n) => root && (root.querySelector('#' + n) || root.querySelector(`[data-bewaard-id="${n}"]`))
  if (id === CMD_CTX_ID) return inPaneel(document.getElementById('cmd-panel'), name) || document.getElementById(name)
  if (id === PS_CTX_ID) return inPaneel(document.getElementById('ps-panel'), name) || document.getElementById(name)
  const s = brSuffix(pid)
  if (s) return document.getElementById(name + s) || document.getElementById(name)
  return inPaneel(document.getElementById('main'), name) || document.getElementById(name)
}

function paneelVoorCtx(id) {
  if (id === CMD_CTX_ID) return document.getElementById('cmd-panel')
  if (id === PS_CTX_ID) return document.getElementById('ps-panel')
  return document.getElementById('main')
}

function termEl(base, id = activeTermId) {
  const root = paneelVoorCtx(id)
  if (root) {
    const el = root.querySelector('#' + base) || root.querySelector(`[data-bewaard-id="${base}"]`)
    if (el) return el
  }
  return document.getElementById(base)
}

function cwdVoorProject(pid) {
  if (!pid || pid === activeId) return currentCwd()
  const p = projects.find(x => x.id === pid)
  const loc = p?.locations[p.activeLocation] || p?.locations[0]
  return loc?.path || ''
}

// Teken of navigeer even voor een ander project, zonder de gerichte verkenner
// kwijt te raken. Na afloop staan de globals weer op het actieve vlak.
function metVerkenner(pid, fn) {
  const live = (splitTweeProjecten() && werkSlots)
    ? werkSlots[werkSlotFocus].projectId
    : (activeId || activeTermId)
  const ander = pid && pid !== live
  const vorig = verkennerTekenPid
  if (ander) {
    bergVerkennerOp(live)
    haalVerkennerOp(pid)
  }
  verkennerTekenPid = pid || null
  const klaar = () => {
    bergVerkennerOp(pid || verkennerPid())
    verkennerTekenPid = vorig
    if (ander) haalVerkennerOp(live)
  }
  try {
    const uit = fn()
    if (uit && typeof uit.then === 'function') return uit.finally(klaar)
    klaar()
    return uit
  } catch (err) {
    klaar()
    throw err
  }
}

// ── Mapgroottes ───────────────────────────────────────────────────────────────
// Een map heeft geen grootte die Windows bijhoudt; die moet je uitrekenen door
// alles eronder op te tellen. Dat gebeurt op de achtergrond, één map tegelijk,
// en stopt zodra je wegnavigeert. Wat al berekend is blijft in een cache staan.
const grootteCache = new Map()   // pad -> { bytes, bestanden, mappen, deels }
let grootteRonde = 0
let grootteLoop  = Promise.resolve()   // rondes netjes achter elkaar

function vergeetGroottes(pad) {
  // De boom toont dezelfde mappen; wat hier verandert, verandert daar ook.
  vergeetBoomTak(pad)
  if (!pad) { grootteCache.clear(); return }
  const laag = String(pad).toLowerCase()
  for (const k of [...grootteCache.keys()]) {
    const kl = k.toLowerCase()
    if (kl === laag || kl.startsWith(laag + '\\') || laag.startsWith(kl + '\\')) grootteCache.delete(k)
  }
}

function grootteTekst(g) {
  if (!g) return ''
  return (g.deels ? '> ' : '') + toonBytes(g.bytes)
}

// De cel bijwerken zonder de hele lijst opnieuw te tekenen: anders verlies je
// je selectie en springt de lijst onder je muis vandaan.
function zetGrootteCel(pad, tekst, bezig) {
  const lijst = brEl('br-list')
  if (!lijst) return
  const n = browserZichtbaar.findIndex(i => i.path === pad)
  if (n < 0) return
  const cel = lijst.querySelector(`[data-i="${n}"] .br-meta`)
  if (!cel) return
  cel.textContent = tekst
  cel.classList.toggle('bezig', !!bezig)
}

// Nieuwe map in beeld: alles wat nog liep afbreken en opnieuw beginnen. De
// rondes gaan achter elkaar in de rij, zodat er nooit twee tegelijk meten.
function startMapGroottes() {
  grootteRonde++
  const mijn = grootteRonde
  window.api.stopGroottes?.()

  if (settings.mapGroottes === false) return grootteLoop
  if (browserPath === DEZE_PC || inArchief(browserPath)) return grootteLoop

  const lijst = browserItems.slice(0, 300)
  grootteLoop = grootteLoop.then(() => meetLijst(lijst, mijn)).catch(() => {})
  return grootteLoop
}

// Hoe lang één ronde in totaal aan het meten mag blijven. Zonder die grens kan
// een map vol zware submappen de schijf minutenlang bezig houden; wat er dan nog
// over is kun je met rechtsklik alsnog laten uitrekenen.
const GROOTTE_RONDE_MAX = 90000

async function meetLijst(lijst, mijn) {
  const stop = Date.now() + GROOTTE_RONDE_MAX
  for (const item of lijst) {
    if (mijn !== grootteRonde) return          // je bent alweer verder gelopen
    if (Date.now() > stop) return              // genoeg voor nu
    if (!item.dir || item.schijf || item.inArchief) continue
    if (grootteCache.has(item.path)) { zetGrootteCel(item.path, grootteTekst(grootteCache.get(item.path))); continue }

    zetGrootteCel(item.path, '…', true)
    const r = await window.api.mapGrootte({ path: item.path, ronde: mijn })
    if (mijn !== grootteRonde) return
    if (!r || !r.ok) { zetGrootteCel(item.path, r?.reason === 'afgebroken' ? '' : '—'); continue }

    grootteCache.set(item.path, { bytes: r.bytes, bestanden: r.bestanden, mappen: r.mappen, deels: r.deels })
    zetGrootteCel(item.path, grootteTekst(grootteCache.get(item.path)))
  }
}

// Rechtsklik: deze map wél uitrekenen, ook als het lang duurt of de automaat uit staat.
async function meetDezeMap(item) {
  if (!item?.dir) return
  grootteCache.delete(item.path)
  zetGrootteCel(item.path, '…', true)
  const r = await window.api.mapGrootte({ path: item.path, ronde: grootteRonde, budget: 120000 })
  if (!r || !r.ok) { zetGrootteCel(item.path, '—'); showToast(I18N.t('browser.calcSizeFailedToast')); return }
  grootteCache.set(item.path, { bytes: r.bytes, bestanden: r.bestanden, mappen: r.mappen, deels: r.deels })
  zetGrootteCel(item.path, grootteTekst(grootteCache.get(item.path)))
  showToast(I18N.t('browser.sizeSummaryToast', {
    name: item.name,
    size: grootteTekst(grootteCache.get(item.path)),
    files: I18N.t(r.bestanden === 1 ? 'browser.status.fileOne' : 'browser.status.fileMany', { n: r.bestanden }),
    partial: r.deels ? I18N.t('browser.sizeIncompleteSuffix') : '',
  }))
}

function toonBytes(n) {
  if (n < 1024) return n + ' B'
  if (n < 1024 * 1024) return (n / 1024).toFixed(0) + ' KB'
  if (n < 1024 * 1024 * 1024) return (n / 1024 / 1024).toFixed(1) + ' MB'
  return (n / 1024 / 1024 / 1024).toFixed(1) + ' GB'
}

const WERK_SPLIT_ID = '__werk__'

function normaliseerSlot(s) {
  if (!s || typeof s !== 'object') {
    return { view: 'project', projectId: activeId, tab: 'output' }
  }
  const v = ['project', 'cmd', 'ps', 'dict', 'bat'].includes(s.view) ? s.view : 'project'
  if (v === 'project') {
    return {
      view: 'project',
      projectId: s.projectId || activeId,
      tab: s.tab === 'browser' ? 'browser' : 'output',
    }
  }
  return { view: v }
}

function splitAan() {
  return !!(termSplit && werkSlots && werkSlots.length === 2)
}

function isGemengdeSplit(rec) {
  const slots = rec && rec.slots
  if (!Array.isArray(slots) || slots.length !== 2) return false
  return slots.some(s => s && s.view && s.view !== 'project')
}

function wisGemengdeProjectSplits() {
  const next = { ...(settings.termSplits || {}) }
  let veranderd = false
  for (const [id, rec] of Object.entries(next)) {
    if (id === WERK_SPLIT_ID) continue
    if (!isGemengdeSplit(rec)) continue
    delete next[id]
    veranderd = true
  }
  if (!veranderd) return
  settings.termSplits = next
  window.api.saveSettings(settings)
}

function splitGemengd() {
  return splitAan() && !(
    werkSlots[0].view === 'project' && werkSlots[1].view === 'project'
  )
}

function splitTweeProjecten() {
  return termSplitAan() && !!werkSlots
    && werkSlots[0].view === 'project' && werkSlots[1].view === 'project'
    && werkSlots[0].projectId !== werkSlots[1].projectId
}

function heeftEigenTerminal(s) {
  return s && (s.view === 'cmd' || s.view === 'ps')
}

function kanSamen(a, b) {
  if (!a || !b) return false
  if (a.view === 'project' && b.view === 'project') return true
  // Twee keer hetzelfde paneel kan niet (één DOM-knooppunt). Cmd/ps naast
  // een project wél: dat zijn aparte panelen in de twee werkvlakken.
  if (a.view === b.view) return false
  return true
}

function tweedeSlotVoor(v) {
  if ((v === 'dict' || v === 'bat') && activeId && projects.some(p => p.id === activeId)) {
    return { view: 'project', projectId: activeId, tab: 'output' }
  }
  if (v === 'cmd' || v === 'ps') return { view: 'dict' }
  if (v === 'dict') return { view: 'cmd' }
  return { view: 'dict' }
}

function nieuwSlot(v) {
  if (v === 'project') {
    return { view: 'project', projectId: activeId, tab: termTab === 'browser' ? 'browser' : 'output' }
  }
  return { view: v }
}

function richtTermOpSlot(s) {
  if (!s) return
  if (s.view === 'cmd') activeTermId = CMD_CTX_ID
  else if (s.view === 'ps') activeTermId = PS_CTX_ID
  else if (s.view === 'project' && s.projectId) activeTermId = s.projectId
}

function zelfdeSlot(s, v) {
  if ((s.view || 'project') !== v) return false
  if (v === 'project') return s.projectId === activeId
  return true
}

function zelfdeProjectSplit() {
  return splitAan() && !!werkSlots
    && werkSlots[0].view === 'project' && werkSlots[1].view === 'project'
    && werkSlots[0].projectId === werkSlots[1].projectId
}

// Slot 0 is links/boven, slot 1 rechts/onder. Bij output|verkenner kan
// termSplitFirst de DOM-panelen omwisselen; dan is het browser-paneel visueel 0.
function visueelSlotVoorTermPane(pane) {
  if (termSplitFirst === 'browser') return pane === 'browser' ? 0 : 1
  return pane === 'browser' ? 1 : 0
}

function visueelTermPaneVoorSlot(visueel) {
  if (termSplitFirst === 'browser') return visueel === 0 ? 'browser' : 'output'
  return visueel === 0 ? 'output' : 'browser'
}

function zetSlotsOpSchermvolgorde() {
  if (!werkSlots || werkSlots.length !== 2) return
  if (termSplitFirst !== 'browser') return
  if (!splitGemengd()) werkSlots.reverse()
  termSplitFirst = 'output'
}

function zorgVoorSlots() {
  if (werkSlots && werkSlots.length === 2) {
    werkSlots = werkSlots.map(normaliseerSlot)
    return
  }
  if (view === 'project') {
    werkSlots = [
      { view: 'project', projectId: activeId, tab: 'output' },
      { view: 'project', projectId: activeId, tab: 'browser' },
    ]
    // Het nieuwe vlak (rechts/onder) krijgt de focus, zodat de volgende
    // zijbalkkeuze daar landt — niet op het scherm dat al open was.
    werkSlotFocus = 1
    return
  }
  werkSlots = [{ view }, tweedeSlotVoor(view)]
  werkSlotFocus = 1
}

function paneelEl(v) {
  return document.getElementById(PANELS[v])
}

function paneelHeeftInhoud(v) {
  const el = paneelEl(v)
  if (!el) return false
  if (v === 'project') return !!el.querySelector('.terminal-wrap')
  return !!el.innerHTML.trim()
}

// Verborgen panelen mogen hun knoppen en terminal houden, maar niet hun id's:
// anders vindt getElementById het verkeerde #terminal / #term-input.
function bevriesPaneelIds(el) {
  if (!el) return
  el.classList.add('paneel-bevroren')
  el.querySelectorAll('[id]').forEach(n => {
    if (!n.id) return
    n.setAttribute('data-bewaard-id', n.id)
    n.removeAttribute('id')
  })
}

function ontdooiPaneelIds(el) {
  if (!el) return
  el.classList.remove('paneel-bevroren')
  el.querySelectorAll('[data-bewaard-id]').forEach(n => {
    n.id = n.getAttribute('data-bewaard-id')
    n.removeAttribute('data-bewaard-id')
  })
}

function inBevrorenPaneel(el) {
  const host = el && el.closest && el.closest('.paneel-bevroren')
  return !!(host && host !== el)
}

function levend(sel, root = document) {
  return [...root.querySelectorAll(sel)].find(el => !inBevrorenPaneel(el)) || null
}

function levenden(sel, root = document) {
  return [...root.querySelectorAll(sel)].filter(el => !inBevrorenPaneel(el))
}

function vraagProjectHertekenen() {
  if (view === 'project') renderMain()
  else projectWeergaveAchterhaald = true
}

function wisBewaardePanelen() {
  getekendProjectId = ''
  projectWeergaveAchterhaald = false
  Object.entries(PANELS).forEach(([name, id]) => {
    if (name === 'settings') return
    const el = document.getElementById(id)
    if (el) el.innerHTML = ''
  })
}

function herstelBewaardPaneel(v) {
  if (v === 'cmd') activeTermId = CMD_CTX_ID
  else if (v === 'ps') activeTermId = PS_CTX_ID
  else if (v === 'project') activeTermId = activeId
  toonPtySessie()
  if (v === 'cmd' || v === 'ps' || v === 'project') {
    if (v === 'project') {
      const p = projects.find(x => x.id === activeId)
      const loc = p?.locations[p.activeLocation] || p?.locations[0]
      if (loc?.path) updateTermPlaceholder(loc.path)
      const gewenst = (settings.termTabs || {})[activeTermId] === 'browser' ? 'browser' : 'output'
      if (!termSplitAan()) termTab = gewenst
    }
    pasTermSchermAan()
    focusTerminalInput()
  }
  if (v === 'dict') {
    const search = document.getElementById('dict-search')
    if (search) requestAnimationFrame(() => { search.focus(); search.selectionStart = search.selectionEnd = search.value.length })
  }
}

function tekenView(v, { alsLeeg = false } = {}) {
  if (v === 'project') {
    const zelfde = getekendProjectId === activeId && paneelHeeftInhoud('project') && !projectWeergaveAchterhaald
    // Tijdens een splitsing moet renderMain de tabs/vlakken bijwerken; overslaan
    // zou de focus van de verkenner kwijtraken.
    if (zelfde && !splitAan()) { herstelBewaardPaneel('project'); return }
    renderMain()
    return
  }
  if (alsLeeg && paneelHeeftInhoud(v)) return
  if (v === 'cmd')  renderCmdPanel()
  if (v === 'ps')   renderPsPanel()
  if (v === 'dict') renderDictPanel()
  if (v === 'bat')  renderBatPanel()
}

function toonPanelenVolledig(v) {
  Object.entries(PANELS).forEach(([name, id]) => {
    if (name === 'settings') return
    const el = document.getElementById(id)
    if (!el) return
    const on = name === v
    el.style.display = on ? 'flex' : 'none'
    if (!on) bevriesPaneelIds(el)
  })
  const zichtbaar = paneelEl(v)
  if (zichtbaar) ontdooiPaneelIds(zichtbaar)
}

function toonSettingsVolledig() {
  const werk = document.getElementById('werk')
  if (werk) werk.hidden = true
  Object.entries(PANELS).forEach(([name, id]) => {
    const el = document.getElementById(id)
    if (!el) return
    const on = name === 'settings'
    el.style.display = on ? 'flex' : 'none'
    if (!on) bevriesPaneelIds(el)
  })
}

function verzamelPanelenInVlak0() {
  const vlak0 = document.getElementById('werk-vlak-0')
  const vlak1 = document.getElementById('werk-vlak-1')
  if (!vlak0 || !vlak1) return
  ;[...vlak1.children].forEach(el => {
    if (el.classList.contains('werk-vlak-naam')) return
    vlak0.appendChild(el)
  })
}

function plaatsPanelenInVlakken() {
  const vlak0 = document.getElementById('werk-vlak-0')
  const vlak1 = document.getElementById('werk-vlak-1')
  if (!vlak0 || !vlak1 || !werkSlots) return

  Object.entries(PANELS).forEach(([name, id]) => {
    if (name === 'settings') return
    const el = document.getElementById(id)
    if (el) bevriesPaneelIds(el)
  })

  werkSlots.forEach((s, i) => {
    const el = paneelEl(s.view)
    const dest = i === 0 ? vlak0 : vlak1
    if (el && dest && el.parentElement !== dest) dest.appendChild(el)
    if (el) {
      el.style.display = 'flex'
      ontdooiPaneelIds(el)
    }
  })
  Object.entries(PANELS).forEach(([name, id]) => {
    if (name === 'settings') return
    if (werkSlots.some(s => s.view === name)) return
    const el = document.getElementById(id)
    if (!el) return
    if (el.parentElement !== vlak0) vlak0.appendChild(el)
    el.style.display = 'none'
  })
}

function slotNaam(s) {
  if (!s) return ''
  if (s.view === 'project') {
    const p = projects.find(x => x.id === s.projectId)
    return p ? p.name : ''
  }
  if (s.view === 'cmd')  return I18N.t('sidebar.navCmd')
  if (s.view === 'ps')   return I18N.t('sidebar.navPowershell')
  if (s.view === 'dict') return I18N.t('sidebar.navDict')
  if (s.view === 'bat')  return I18N.t('sidebar.navBat')
  return ''
}

function pasWerkVlakNamenAan() {
  document.querySelectorAll('.werk-vlak').forEach(vlak => {
    const naam = vlak.querySelector('.werk-vlak-naam')
    if (!naam) return
    if (!splitGemengd() || !werkSlots) { naam.textContent = ''; return }
    const slot = Number(vlak.dataset.slot)
    naam.textContent = slotNaam(werkSlots[slot])
  })
}

function werkPlusNodig() {
  if (view === 'settings') return false
  if (splitGemengd()) return true
  if (levend('.terminal-wrap.splitbaar')) return false
  return view === 'cmd' || view === 'ps' || view === 'dict' || view === 'bat'
}

// Chromium stuurt na een hertekening geen mousemove zolang de muis stilstaat.
// Zonder de laatste positie te hergebruiken blijft +/− dus onzichtbaar tot je
// de muis een tik geeft — ook als die al op de knop stond.
let muisX = 0
let muisY = 0
let muisGezien = false
let splitPlusVerversBezig = false

function noteerMuis(e) {
  if (!e || e.clientX == null) return
  muisX = e.clientX
  muisY = e.clientY
  muisGezien = true
}

function randPlusZichtbaar(host, actieveSplit, kant) {
  if (!muisGezien || !host) return false
  const r = host.getBoundingClientRect()
  if (r.width < 8 || r.height < 8) return false
  const x = muisX - r.left
  const y = muisY - r.top
  if (x < 0 || y < 0 || x > r.width || y > r.height) return false
  const midY = y > r.height * 0.12 && y < r.height * 0.88
  const midX = x > r.width * 0.12 && x < r.width * 0.88
  if (kant === 'right') return (r.width - x) < 56 && midY
  if (kant === 'left') return actieveSplit === 'right' && x < 56 && midY
  if (kant === 'top') return actieveSplit === 'bottom' && y < 56 && midX
  return (r.height - y) < 56 && midX
}

function zetSplitPlusZicht(btn, host, split, kant) {
  if (!btn || btn.hidden) return
  btn.classList.toggle('zichtbaar', randPlusZichtbaar(host, split, kant))
}

function verversSplitPlusZicht() {
  const wrap = levend('.terminal-wrap.splitbaar')
  const stage = wrap?.querySelector('.term-stage')
  if (stage && !splitGemengd()) {
    ;['right', 'bottom', 'left', 'top'].forEach(kant => {
      zetSplitPlusZicht(wrap.querySelector(`.term-split-plus[data-split="${kant}"]`), stage, termSplit, kant)
    })
  }
  const werk = document.getElementById('werk')
  if (werk && werkPlusNodig()) {
    const split = splitGemengd() ? termSplit : null
    ;['right', 'bottom', 'left', 'top'].forEach(kant => {
      zetSplitPlusZicht(werk.querySelector(`.werk-split-plus[data-split="${kant}"]`), werk, split, kant)
    })
  }
}

function planSplitPlusVervers() {
  verversSplitPlusZicht()
  if (splitPlusVerversBezig) return
  splitPlusVerversBezig = true
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      splitPlusVerversBezig = false
      verversSplitPlusZicht()
    })
  })
}

function pasWerkSplitKnoppenAan() {
  const werk = document.getElementById('werk')
  const plusR = werk?.querySelector('.werk-split-plus[data-split="right"]')
  const plusB = werk?.querySelector('.werk-split-plus[data-split="bottom"]')
  const plusL = werk?.querySelector('.werk-split-plus[data-split="left"]')
  const plusT = werk?.querySelector('.werk-split-plus[data-split="top"]')
  if (!plusR || !plusB) return
  if (!werkPlusNodig()) {
    ;[plusR, plusB, plusL, plusT].forEach(b => {
      if (!b) return
      b.hidden = true
      b.classList.remove('zichtbaar', 'is-min')
    })
    return
  }
  const naast = splitGemengd() && termSplit === 'right'
  const onder = splitGemengd() && termSplit === 'bottom'
  pasSplitKnopAan(plusR, naast, I18N.t('term.splitViewRightTitle'))
  pasSplitKnopAan(plusB, onder, I18N.t('term.splitViewBottomTitle'))
  pasSplitSluitRandAan(plusL, naast, I18N.t('term.splitCloseLeftTitle'))
  pasSplitSluitRandAan(plusT, onder, I18N.t('term.splitCloseTopTitle'))
  planSplitPlusVervers()
}

function pasWerkSchermAan() {
  const werk = document.getElementById('werk')
  const vlak0 = document.getElementById('werk-vlak-0')
  const vlak1 = document.getElementById('werk-vlak-1')
  if (!werk || !vlak0 || !vlak1) {
    if (!splitGemengd()) pasTermSchermAan()
    return
  }

  const gemengd = splitGemengd()
  if (gemengd) zetSlotsOpSchermvolgorde()
  werk.hidden = view === 'settings'
  werk.classList.toggle('gesplitst', gemengd)
  werk.classList.toggle('naast', gemengd && termSplit === 'right')
  werk.classList.toggle('onder', gemengd && termSplit === 'bottom')
  vlak1.hidden = !gemengd
  vlak0.classList.toggle('actief', !gemengd || werkSlotFocus === 0)
  vlak1.classList.toggle('actief', gemengd && werkSlotFocus === 1)

  if (gemengd) {
    plaatsPanelenInVlakken()
    const wasView = view
    const wasId = activeId
    const wasTab = termTab
    werkSlots.forEach((s) => {
      view = s.view
      if (s.view === 'project') {
        activeId = s.projectId
        termTab = s.tab || 'output'
      }
      tekenView(s.view, { alsLeeg: true })
    })
    view = wasView
    activeId = wasId
    termTab = wasTab
    const focus = werkSlots[werkSlotFocus]
    if (focus) {
      view = focus.view
      if (focus.view === 'project') {
        activeId = focus.projectId
        termTab = focus.tab || 'output'
      }
      richtTermOpSlot(focus)
    }
  } else {
    verzamelPanelenInVlak0()
    toonPanelenVolledig(view)
    tekenView(view, { alsLeeg: true })
  }

  pasWerkVlakNamenAan()
  pasWerkSplitKnoppenAan()
  // Een vlak dat halveert is de belangrijkste reden dat een balk ineens niet
  // meer past, dus meteen opnieuw meten.
  keurKrappeBalken()

  if (splitGemengd() || levend('.terminal-wrap.splitbaar')) pasTermSchermAan()
}

function focusWerkSlot(slot) {
  if (!werkSlots || slot === werkSlotFocus) return
  if (werkSlots[werkSlotFocus]?.view === 'project') bergVerkennerOp()
  werkSlotFocus = slot
  const s = werkSlots[slot]
  view = s.view
  if (s.view === 'cmd' || s.view === 'ps') lastShellView = s.view
  if (s.view === 'project') {
    activeId = s.projectId
    termTab = s.tab || 'output'
    haalVerkennerOp(s.projectId)
  }
  richtTermOpSlot(s)
  pasWerkSchermAan()
  renderSidebar()
  bewaarTermSplit()
  keurStatusNa()
}

function sluitSplitVoorView() {
  termSplit = null
  bewaarTermSplit()
  werkSlots = null
  werkSlotFocus = 0
  verzamelPanelenInVlak0()
  const werk = document.getElementById('werk')
  if (werk) werk.classList.remove('gesplitst', 'naast', 'onder')
  const vlak1 = document.getElementById('werk-vlak-1')
  if (vlak1) vlak1.hidden = true
  // Anders blijven main en woordenboek allebei flex in hetzelfde vlak
  // staan — dat ziet eruit als een tweede venster zonder split-klasse.
  if (view && view !== 'settings') toonPanelenVolledig(view)
}

function plaatsInSplit(v) {
  zorgVoorSlots()
  const visueelDoel = werkSlotFocus === 1 ? 1 : 0
  zetSlotsOpSchermvolgorde()
  const nieuw = nieuwSlot(v)
  const al = werkSlots.findIndex(s => zelfdeSlot(s, v))
  if (al >= 0) {
    if (v === 'project' && werkSlots.some(s => s.view === 'dict')) {
      sluitSplitVoorView()
      setView('project')
      return
    }
    werkSlotFocus = al
    if (v === 'project') {
      termTab = werkSlots[al].tab || 'output'
      haalVerkennerOp(activeId)
    }
    view = v
    if (v === 'cmd' || v === 'ps') lastShellView = v
    richtTermOpSlot(werkSlots[al])
    pasWerkSchermAan()
    renderSidebar()
    rememberView()
    navPush()
    keurStatusNa()
    bewaarTermSplit()
    return
  }

  let doel = visueelDoel
  const kandidaat = werkSlots.map((s, i) => i === doel ? nieuw : s)
  if (!kanSamen(kandidaat[0], kandidaat[1])) {
    const ander = 1 - doel
    const alt = werkSlots.map((s, i) => i === ander ? nieuw : s)
    if (kanSamen(alt[0], alt[1])) doel = ander
    else {
      sluitSplitVoorView()
      setView(v)
      return
    }
  }
  werkSlots[doel] = nieuw
  if (v === 'project' && werkSlots.some(s => s.view === 'dict')) {
    sluitSplitVoorView()
    setView('project')
    return
  }
  werkSlotFocus = doel
  view = v
  if (v === 'cmd' || v === 'ps') lastShellView = v
  if (v === 'project') termTab = nieuw.tab
  richtTermOpSlot(nieuw)
  pasWerkSchermAan()
  renderSidebar()
  rememberView()
  navPush()
  keurStatusNa()
  bewaarTermSplit()
}

function herstelWerkSplitNaStart() {
  if (splitAan() && splitGemengd()) {
    pasWerkSchermAan()
    renderSidebar()
    return
  }
  const raw = (settings.termSplits || {})[WERK_SPLIT_ID]
    || (activeId && (settings.termSplits || {})[activeId])
  const gelezen = leesTermSplit(raw)
  if (!gelezen || !Array.isArray(raw?.slots) || raw.slots.length !== 2) return
  const slots = raw.slots.map(normaliseerSlot)
  if (slots[0].view === 'project' && slots[1].view === 'project') return
  // Project + woordenboek niet terugzetten bij opstarten. Anders staat het
  // woordenboek bij de eerste projectklik al als tweede venster klaar.
  if (slots.some(s => s.view === 'project')) return
  if (!slots.some(s => s.view === view)) return
  const ok = slots.every(s => {
    if (s.view === 'project') return !!(s.projectId && projects.some(p => p.id === s.projectId))
    return ['cmd', 'ps', 'dict', 'bat'].includes(s.view)
  })
  if (!ok) return
  termSplit = gelezen.dir
  termSplitFirst = gelezen.first
  werkSlots = slots
  const i = slots.findIndex(s => s.view === view || (s.view === 'project' && s.projectId === activeId))
  werkSlotFocus = i >= 0 ? i : (raw.focus === 1 ? 1 : 0)
  pasWerkSchermAan()
  renderSidebar()
}

function wireWerkSplit() {
  const werk = document.getElementById('werk')
  if (!werk || werk.dataset.wired) return
  werk.dataset.wired = '1'
  const plusR = werk.querySelector('.werk-split-plus[data-split="right"]')
  const plusB = werk.querySelector('.werk-split-plus[data-split="bottom"]')
  if (!plusR || !plusB) return

  werk.addEventListener('mousemove', (e) => { noteerMuis(e); verversSplitPlusZicht() })
  werk.addEventListener('pointerenter', (e) => { noteerMuis(e); verversSplitPlusZicht() })
  werk.addEventListener('mouseleave', (e) => {
    if (e.relatedTarget && werk.contains(e.relatedTarget)) return
    noteerMuis(e)
    verversSplitPlusZicht()
  })
  const knopSleepStop = e => e.stopPropagation()
  plusR.addEventListener('mousedown', knopSleepStop)
  plusB.addEventListener('mousedown', knopSleepStop)
  plusR.onclick = (e) => {
    e.preventDefault(); e.stopPropagation()
    noteerMuis(e)
    klikSplitPlus('right')
  }
  plusB.onclick = (e) => {
    e.preventDefault(); e.stopPropagation()
    noteerMuis(e)
    klikSplitPlus('bottom')
  }
  const plusL = werk.querySelector('.werk-split-plus[data-split="left"]')
  const plusT = werk.querySelector('.werk-split-plus[data-split="top"]')
  if (plusL) {
    plusL.addEventListener('mousedown', knopSleepStop)
    plusL.onclick = (e) => {
      e.preventDefault(); e.stopPropagation()
      noteerMuis(e)
      klikSplitPlus('left')
    }
  }
  if (plusT) {
    plusT.addEventListener('mousedown', knopSleepStop)
    plusT.onclick = (e) => {
      e.preventDefault(); e.stopPropagation()
      noteerMuis(e)
      klikSplitPlus('top')
    }
  }
  werk.querySelectorAll('.werk-vlak').forEach(vlak => {
    vlak.addEventListener('mousedown', () => {
      if (!splitGemengd()) return
      const slot = Number(vlak.dataset.slot)
      if (Number.isInteger(slot)) focusWerkSlot(slot)
    })
  })
}

function bewaarZichtbareUitvoer() {
  const term = document.getElementById('terminal')
  if (term && activeTermId) {
    termOutput[activeTermId] = term.innerHTML.replace(/<span class="t-cursor"><\/span>/g, '')
  }
  const andere = document.getElementById('terminal-andere')
  if (andere && splitTweeProjecten()) {
    const idleId = werkSlots[1 - werkSlotFocus].projectId
    if (idleId) termOutput[idleId] = andere.innerHTML.replace(/<span class="t-cursor"><\/span>/g, '')
  }
}

function bewaarTermSplit(extraId) {
  const ids = new Set([activeId, activeTermId, extraId].filter(Boolean))
  if (werkSlots) werkSlots.forEach(s => { if (s.projectId) ids.add(s.projectId) })
  const next = { ...(settings.termSplits || {}) }
  if (!termSplit) {
    ids.forEach(id => { delete next[id] })
    delete next[WERK_SPLIT_ID]
  } else {
    const rec = {
      dir: termSplit,
      first: termSplitFirst,
      slots: (werkSlots || []).map(s => ({
        view: s.view || 'project',
        projectId: (s.view || 'project') === 'project' ? s.projectId : undefined,
        tab: s.tab === 'browser' ? 'browser' : 'output',
      })),
      focus: werkSlotFocus,
    }
    if (splitGemengd()) {
      // Woordenboek/cmd hoort bij dit werkvlak, niet bij elk project. Anders
      // komt het woordenboek bij de volgende projectwissel als tweede venster terug.
      ids.forEach(id => { if (id && isGemengdeSplit(next[id])) delete next[id] })
      next[WERK_SPLIT_ID] = rec
    } else {
      ids.forEach(id => { if (id) next[id] = rec })
      delete next[WERK_SPLIT_ID]
    }
  }
  settings.termSplits = next
  window.api.saveSettings(settings)
}

function kiesProjectInSplit(id) {
  zorgVoorSlots()
  bewaarZichtbareUitvoer()
  bergVerkennerOp()
  const zelfde = werkSlots[0].view === 'project' && werkSlots[1].view === 'project'
    && werkSlots[0].projectId === werkSlots[1].projectId
  const al = werkSlots.findIndex(s => (s.view || 'project') === 'project' && s.projectId === id)
  if (al >= 0) {
    if (!zelfde) werkSlotFocus = al
  } else {
    const tab = werkSlots[werkSlotFocus].tab === 'browser' ? 'browser' : 'output'
    werkSlots[werkSlotFocus] = { view: 'project', projectId: id, tab }
  }
  termTab = werkSlots[werkSlotFocus].tab || 'output'
  bewaarTermSplit(id)
}

function zetLiveInSlot(slot) {
  if (!splitTweeProjecten()) return
  const pane0 = levend('.term-pane[data-pane="output"]')
  const pane1 = levend('.term-pane[data-pane="browser"]')
  if (!pane0 || !pane1) return
  const live = slot === 0 ? pane0 : pane1
  const idle = slot === 0 ? pane1 : pane0
  const term = document.getElementById('terminal')
  const pty = document.getElementById('pty-host')
  const andere = document.getElementById('terminal-andere')
  const ptyAndere = document.getElementById('pty-host-andere')
  const naamLive = live.querySelector('.term-pane-naam')
  const naamIdle = idle.querySelector('.term-pane-naam')
  if (term && term.parentNode !== live) {
    if (naamLive) naamLive.after(term)
    else live.prepend(term)
  }
  if (pty && term) term.after(pty)
  else if (pty && naamLive) naamLive.after(pty)
  if (andere && andere.parentNode !== idle) {
    if (naamIdle) naamIdle.after(andere)
    else idle.prepend(andere)
  }
  if (ptyAndere && andere) andere.after(ptyAndere)
}

function pasPaneNamenAan() {
  const twee = splitTweeProjecten()
  levenden('.term-pane').forEach(pane => {
    const naam = pane.querySelector('.term-pane-naam')
    if (!naam) return
    if (!twee || !werkSlots) { naam.textContent = ''; return }
    const slot = pane.dataset.pane === 'browser' ? 1 : 0
    const p = projects.find(x => x.id === werkSlots[slot].projectId)
    naam.textContent = p ? p.name : ''
  })
}

function vulSplitPanelen() {
  const andere = document.getElementById('terminal-andere')
  const ptyAndere = document.getElementById('pty-host-andere')
  if (!splitTweeProjecten()) {
    if (andere) { andere.hidden = true; andere.removeAttribute('data-gevuld'); andere.innerHTML = '' }
    if (ptyAndere) { ptyAndere.hidden = true; ptyAndere.replaceChildren() }
    return
  }
  const idleId = werkSlots[1 - werkSlotFocus].projectId
  const idlePty = ptySessies.get(idleId)
  if (andere) {
    andere.hidden = !!idlePty
    if (!andere.dataset.gevuld) {
      andere.innerHTML = (termOutput[idleId] || '') + '<span class="t-cursor"></span>'
      andere.dataset.gevuld = '1'
      andere.scrollTop = andere.scrollHeight
    }
  }
  if (ptyAndere) {
    ptyAndere.hidden = !idlePty
    if (idlePty) {
      if (idlePty.houder.parentNode !== ptyAndere) ptyAndere.replaceChildren(idlePty.houder)
      pasPtyMaatAan(idlePty)
    } else ptyAndere.replaceChildren()
  }
  zetLiveInSlot(werkSlotFocus)
  pasPaneNamenAan()
  toonSlotInhoud()
}

function toonSlotInhoud() {
  if (!splitTweeProjecten() || !werkSlots) return
  const term = document.getElementById('terminal')
  const pty = document.getElementById('pty-host')
  const andere = document.getElementById('terminal-andere')
  const ptyAndere = document.getElementById('pty-host-andere')
  const br = document.getElementById('browser')
  const brAndere = document.getElementById('browser-andere')

  const liveTab = werkSlots[werkSlotFocus].tab
  const idleId = werkSlots[1 - werkSlotFocus].projectId
  const idleTab = werkSlots[1 - werkSlotFocus].tab
  const livePty = ptySessies.get(activeTermId)
  const idlePty = ptySessies.get(idleId)

  if (term) term.hidden = liveTab !== 'output' || !!livePty
  if (pty) pty.hidden = liveTab !== 'output' || !livePty
  if (andere) andere.hidden = idleTab !== 'output' || !!idlePty
  if (ptyAndere) ptyAndere.hidden = idleTab !== 'output' || !idlePty

  // Slot 0 gebruikt altijd #browser-andere, slot 1 #browser.
  if (brAndere) brAndere.hidden = werkSlots[0].tab !== 'browser'
  if (br) br.hidden = werkSlots[1].tab !== 'browser'
}

function vulIdleVerkenner() {
  if (!splitTweeProjecten() || !werkSlots) return
  werkSlots.forEach(s => {
    if (s.tab !== 'browser') return
    const staat = verkennerStaat(s.projectId)
    if (s.projectId === verkennerPid()) {
      if (!browserItems.length) navigeerNaar(staat.path || cwdVoorProject(s.projectId))
      else renderBrowser()
      return
    }
    if (staat.items.length || staat.path) {
      metVerkenner(s.projectId, () => { renderBrowser() })
      return
    }
    const cwd = cwdVoorProject(s.projectId)
    if (cwd) navigeerNaar(cwd, s.projectId)
  })
}

function termSplitAan() {
  if (splitGemengd()) return false
  return !!(termSplit && levend('.terminal-wrap.splitbaar'))
}

function springNaarOutput() {
  // Zelfde project gesplitst: uitvoer is al in beeld, verkenner blijft.
  // Twee projecten: een commando hoort in het gerichte vlak zichtbaar te zijn.
  if (termSplitAan() && !splitTweeProjecten()) return
  if (termTab === 'browser') setTermTab('output')
}

function leesTermSplit(v) {
  if (v === 'right' || v === 'bottom') return { dir: v, first: 'output' }
  if (v && typeof v === 'object' && (v.dir === 'right' || v.dir === 'bottom')) {
    return { dir: v.dir, first: v.first === 'browser' ? 'browser' : 'output' }
  }
  return null
}

function herstelTermSplit(ctx) {
  // Cmd en powershell hebben geen splitbare wrap; hun bedrading mag een
  // open werksplit (project ernaast) niet weggooien. Een verse gemengde
  // split evenmin — die staat al in werkSlots, een oud projectrecord mag
  // die niet terugzetten.
  if (ctx?.id === CMD_CTX_ID || ctx?.id === PS_CTX_ID) return
  if (splitGemengd()) return
  const raw = (settings.termSplits || {})[ctx?.id]
  const gelezen = leesTermSplit(raw)
  if (!gelezen) { termSplit = null; termSplitFirst = 'output'; werkSlots = null; werkSlotFocus = 0; return }
  termSplit = gelezen.dir
  termSplitFirst = gelezen.first
  if (raw && Array.isArray(raw.slots) && raw.slots.length === 2) {
    const slots = raw.slots.map(normaliseerSlot)
    const gemengd = slots[0].view !== 'project' || slots[1].view !== 'project'
    const ok = slots.every(s => {
      if (s.view === 'project') return !!(s.projectId && (s.projectId === ctx?.id || projects.some(p => p.id === s.projectId)))
      return ['cmd', 'ps', 'dict', 'bat'].includes(s.view)
    })
    // Gemengd (woordenboek/cmd ernaast) niet hier terugzetten: dat plakte het
    // woordenboek op elk project dat je daarna opende.
    if (ok && gemengd) {
      termSplit = null
      termSplitFirst = 'output'
      werkSlots = null
      werkSlotFocus = termTab === 'browser' ? 1 : 0
      document.getElementById('werk')?.classList.remove('gesplitst', 'naast', 'onder')
      return
    }
    if (ok && !gemengd && levend('.terminal-wrap.splitbaar')) {
      const zelfdeProject = slots[0].projectId && slots[0].projectId === slots[1].projectId
      if (!zelfdeProject) {
        // Twee verschillende projecten niet terugzetten bij opnieuw openen:
        // dat was de glitch bij "project voor de 2e keer" / derde project.
        termSplit = null
        termSplitFirst = 'output'
        werkSlots = null
        werkSlotFocus = termTab === 'browser' ? 1 : 0
        document.getElementById('werk')?.classList.remove('gesplitst', 'naast', 'onder')
        return
      }
      werkSlots = slots
      const i = slots.findIndex(s => s.projectId === ctx?.id)
      werkSlotFocus = i >= 0 ? i : (raw.focus === 1 ? 1 : 0)
      termTab = werkSlots[werkSlotFocus].tab
      return
    }
  }
  if (!levend('.terminal-wrap.splitbaar') && !splitGemengd()) {
    termSplit = null
    termSplitFirst = 'output'
    werkSlots = null
    werkSlotFocus = termTab === 'browser' ? 1 : 0
    return
  }
  werkSlots = null
  werkSlotFocus = termTab === 'browser' ? 1 : 0
}

function zetTermSplit(richting, houdenInhoud) {
  if (richting === 'right' || richting === 'bottom') {
    // Het scherm dat je nu open hebt blijft staan; het andere komt rechts of onder.
    if (!termSplit) {
      termSplitFirst = (view === 'project' && termTab === 'browser') ? 'browser' : 'output'
      zorgVoorSlots()
      werkSlotFocus = 1
      if (view === 'project') termTab = visueelTermPaneVoorSlot(1)
    }
    termSplit = richting
  } else {
    const houden = houdenInhoud || (werkSlots && werkSlots[werkSlotFocus])
    termSplit = null
    bewaarTermSplit()
    werkSlots = null
    werkSlotFocus = 0
    if (houden) {
      view = houden.view || 'project'
      if (view === 'project') {
        activeId = houden.projectId
        termTab = houden.tab || 'output'
      }
    }
  }
  if (termSplit) bewaarTermSplit()
  pasWerkSchermAan()
  planSplitPlusVervers()
  if (termSplit && !splitGemengd() && !browserItems.length) navigeerNaar(browserPath || currentCwd())
  requestAnimationFrame(() => pasPtyMaatAan(ptySessies.get(activeTermId)))
}

// Min links/boven sluit dat vlak; het andere (rechts/onder) blijft staan.
// visueel 0 = links/boven, visueel 1 = rechts/onder — niet het geselecteerde vlak.
function inhoudVanVisueelSlot(visueel) {
  if (werkSlots && werkSlots.length === 2) {
    if (splitGemengd()) {
      const omgewisseld = termSplitFirst === 'browser'
      const s = omgewisseld ? werkSlots[visueel === 0 ? 1 : 0] : werkSlots[visueel]
      return s ? { ...s } : null
    }
    const pane = visueelTermPaneVoorSlot(visueel)
    // Twee projecten: werkSlots[0] hoort bij het output-paneel, [1] bij verkenner.
    // Die panelen kunnen visueel omgewisseld zijn via termSplitFirst.
    const dataSlot = pane === 'browser' ? 1 : 0
    const s = werkSlots[dataSlot] || werkSlots[visueel]
    if ((s.view || 'project') !== 'project') return { ...s }
    return { view: 'project', projectId: s.projectId || activeId, tab: s.tab || pane }
  }
  return { view: 'project', projectId: activeId, tab: visueelTermPaneVoorSlot(visueel) }
}

function sluitSplitAanKant(kant) {
  if (!termSplit) return
  if ((kant === 'left' || kant === 'right') && termSplit !== 'right') return
  if ((kant === 'top' || kant === 'bottom') && termSplit !== 'bottom') return
  bergVerkennerOp()
  const houdenVisueel = (kant === 'left' || kant === 'top') ? 1 : 0
  const houden = inhoudVanVisueelSlot(houdenVisueel)
  if (houden) {
    view = houden.view || 'project'
    if (view === 'project') {
      const tab = houden.tab === 'browser' ? 'browser' : 'output'
      houden.tab = tab
      activeId = houden.projectId
      termTab = tab
      if (houden.projectId) {
        settings.termTabs = { ...(settings.termTabs || {}), [houden.projectId]: tab }
        window.api.saveSettings(settings)
      }
    }
    werkSlotFocus = 0
  }
  zetTermSplit(null, houden)
}

function klikSplitPlus(kant) {
  if (kant === 'right') {
    if (termSplit === 'right') sluitSplitAanKant('right')
    else zetTermSplit('right')
    return
  }
  if (kant === 'bottom') {
    if (termSplit === 'bottom') sluitSplitAanKant('bottom')
    else zetTermSplit('bottom')
    return
  }
  sluitSplitAanKant(kant)
}

function pasSplitKnopAan(btn, alsMin, titelPlus) {
  if (!btn) return
  const ico = btn.querySelector('i')
  if (ico) ico.className = alsMin ? 'ti ti-minus' : 'ti ti-plus'
  const titel = alsMin ? I18N.t('term.splitCloseTitle') : titelPlus
  btn.title = titel
  btn.setAttribute('aria-label', titel)
  btn.classList.toggle('is-min', alsMin)
  btn.hidden = false
}

function pasSplitSluitRandAan(btn, aan, titel) {
  if (!btn) return
  const ico = btn.querySelector('i')
  if (ico) ico.className = 'ti ti-minus'
  btn.title = titel
  btn.setAttribute('aria-label', titel)
  btn.classList.toggle('is-min', aan)
  btn.hidden = !aan
  if (!aan) btn.classList.remove('zichtbaar')
}

function pasTermSchermAan() {
  if (splitGemengd() && werkSlots) {
    document.querySelectorAll('#werk .terminal-wrap').forEach(w => {
      if (inBevrorenPaneel(w)) return
      w.classList.remove('gesplitst', 'naast', 'onder', 'twee-projecten')
      w.querySelectorAll('.term-split-plus').forEach(b => {
        b.hidden = true
        b.classList.remove('zichtbaar', 'is-min')
      })
      const inMain = !!w.closest('#main')
      const projectSlot = werkSlots.find(s => s.view === 'project')
      const tab = inMain ? (projectSlot?.tab === 'browser' ? 'browser' : 'output') : 'output'
      const paneOut = w.querySelector('.term-pane[data-pane="output"]')
      const paneBr = w.querySelector('.term-pane[data-pane="browser"]')
      if (paneOut) paneOut.hidden = tab === 'browser'
      if (paneBr) paneBr.hidden = tab !== 'browser'
      const term = w.querySelector('#terminal')
      const br = w.querySelector('#browser')
      const pty = w.querySelector('#pty-host')
      const ctxId = inMain ? (projectSlot?.projectId || activeId) : (w.closest('#cmd-panel') ? CMD_CTX_ID : PS_CTX_ID)
      const sessie = ptySessies.get(ctxId)
      if (term) term.hidden = tab === 'browser' || !!sessie
      if (br) br.hidden = tab !== 'browser'
      if (pty) pty.hidden = tab === 'browser' || !sessie
    })
    planSplitPlusVervers()
    keurStatusNa()
    return
  }

  const wrap = levend('#main .terminal-wrap.splitbaar')
    || levend('.terminal-wrap')
  const term = wrap?.querySelector('#terminal') || document.getElementById('terminal')
  const br   = wrap?.querySelector('#browser') || document.getElementById('browser')
  const pty  = wrap?.querySelector('#pty-host') || document.getElementById('pty-host')
  if (!term || !br) return

  const split = termSplitAan()
  const tab = termTab
  const sessie = ptySessies.get(activeTermId)
  const sessieLeeft = !!sessie
  const outputZichtbaar = split || tab === 'output'
  const sessieAanZet = tab === 'output' && sessieLeeft
  const ptyZichtbaar = sessieLeeft && outputZichtbaar

  const twee = splitTweeProjecten()
  if (wrap) {
    wrap.classList.toggle('gesplitst', split)
    wrap.classList.toggle('naast', split && termSplit === 'right')
    wrap.classList.toggle('onder', split && termSplit === 'bottom')
    wrap.classList.toggle('twee-projecten', twee)
  }

  const paneOut = wrap?.querySelector('.term-pane[data-pane="output"]')
  const paneBr  = wrap?.querySelector('.term-pane[data-pane="browser"]')
  const browserEerst = split && termSplitFirst === 'browser'
  if (paneOut) {
    paneOut.hidden = twee ? false : !outputZichtbaar
    paneOut.classList.toggle('actief', split && (twee ? werkSlotFocus === 0 : tab === 'output'))
    paneOut.style.order = browserEerst ? '2' : '1'
    paneOut.classList.toggle('split-tweede', split && browserEerst)
  }
  if (paneBr) {
    paneBr.hidden = split ? false : tab !== 'browser'
    paneBr.classList.toggle('actief', split && (twee ? werkSlotFocus === 1 : tab === 'browser'))
    paneBr.style.order = browserEerst ? '1' : '2'
    paneBr.classList.toggle('split-tweede', split && !browserEerst)
  }

  const brAndere = document.getElementById('browser-andere')
  if (twee && werkSlots) {
    // Per vlak terminal of verkenner; toonSlotInhoud doet dat via vulSplitPanelen.
  } else {
    term.hidden = !outputZichtbaar || ptyZichtbaar
    br.hidden = split ? false : tab !== 'browser'
    if (brAndere) brAndere.hidden = true
    if (pty) pty.hidden = !ptyZichtbaar
  }
  vulSplitPanelen()
  vulIdleVerkenner()

  const invoer = levend('.term-input-wrap')
  if (invoer) {
    invoer.hidden = sessieLeeft
    if (sessieLeeft) {
      const ac = document.getElementById('term-autocomplete')
      if (ac) ac.hidden = true
    }
  }
  const sluit = document.getElementById('btn-pty-sluit')
  if (sluit) sluit.hidden = !sessieAanZet
  levenden('.alleen-verkenner').forEach(b => { b.hidden = tab !== 'browser' })
  levenden('.term-tab').forEach(b => {
    b.classList.toggle('active', b.dataset.tab === tab)
  })
  pasSplitKnopAan(wrap?.querySelector('.term-split-plus[data-split="right"]'),
    split && termSplit === 'right', I18N.t('term.splitRightTitle'))
  pasSplitKnopAan(wrap?.querySelector('.term-split-plus[data-split="bottom"]'),
    split && termSplit === 'bottom', I18N.t('term.splitBottomTitle'))
  pasSplitSluitRandAan(wrap?.querySelector('.term-split-plus[data-split="left"]'),
    split && termSplit === 'right', I18N.t('term.splitCloseLeftTitle'))
  pasSplitSluitRandAan(wrap?.querySelector('.term-split-plus[data-split="top"]'),
    split && termSplit === 'bottom', I18N.t('term.splitCloseTopTitle'))
  if (splitGemengd()) {
    wrap?.querySelectorAll('.term-split-plus').forEach(b => {
      b.hidden = true
      b.classList.remove('zichtbaar', 'is-min')
    })
  }
  planSplitPlusVervers()
  keurStatusNa()
}

function wireTermSplit() {
  const wrap = levend('.terminal-wrap.splitbaar')
  if (!wrap) return
  const stage = wrap.querySelector('.term-stage')
  const plusR = wrap.querySelector('.term-split-plus[data-split="right"]')
  const plusB = wrap.querySelector('.term-split-plus[data-split="bottom"]')
  if (!stage || !plusR || !plusB) return

  stage.addEventListener('mousemove', (e) => { noteerMuis(e); verversSplitPlusZicht() })
  stage.addEventListener('pointerenter', (e) => { noteerMuis(e); verversSplitPlusZicht() })
  stage.addEventListener('mouseleave', (e) => {
    if (e.relatedTarget && stage.contains(e.relatedTarget)) return
    noteerMuis(e)
    verversSplitPlusZicht()
  })
  const knopSleepStop = e => e.stopPropagation()
  plusR.addEventListener('mousedown', knopSleepStop)
  plusB.addEventListener('mousedown', knopSleepStop)
  plusR.onclick = (e) => {
    e.preventDefault(); e.stopPropagation()
    noteerMuis(e)
    klikSplitPlus('right')
  }
  plusB.onclick = (e) => {
    e.preventDefault(); e.stopPropagation()
    noteerMuis(e)
    klikSplitPlus('bottom')
  }
  const plusL = wrap.querySelector('.term-split-plus[data-split="left"]')
  const plusT = wrap.querySelector('.term-split-plus[data-split="top"]')
  if (plusL) {
    plusL.addEventListener('mousedown', knopSleepStop)
    plusL.onclick = (e) => {
      e.preventDefault(); e.stopPropagation()
      noteerMuis(e)
      klikSplitPlus('left')
    }
  }
  if (plusT) {
    plusT.addEventListener('mousedown', knopSleepStop)
    plusT.onclick = (e) => {
      e.preventDefault(); e.stopPropagation()
      noteerMuis(e)
      klikSplitPlus('top')
    }
  }
  planSplitPlusVervers()

  wrap.querySelectorAll('.term-pane').forEach(pane => {
    pane.addEventListener('mousedown', () => {
      if (splitTweeProjecten()) {
        const slot = visueelSlotVoorTermPane(pane.dataset.pane)
        const id = werkSlots[slot].projectId
        bergVerkennerOp()
        if (id && id !== activeId) selectProject(id)
        else {
          werkSlotFocus = slot
          termTab = werkSlots[slot].tab
          haalVerkennerOp(id)
          pasTermSchermAan()
          bewaarTermSplit()
        }
        return
      }
      const tab = pane.dataset.pane
      if (tab === 'output' || tab === 'browser') {
        if (termSplitAan() && werkSlots && !splitGemengd()) {
          werkSlotFocus = visueelSlotVoorTermPane(tab)
          bewaarTermSplit()
        }
        if (termTab !== tab) setTermTab(tab)
      }
    })
  })
  wrap.querySelector('.term-input-wrap')?.addEventListener('mousedown', () => {
    if (termSplitAan() && termTab !== 'output') setTermTab('output')
  })
}

function setTermTab(tab) {
  if (tab !== 'output' && tab !== 'browser') return
  termTab = tab
  if (splitAan() && werkSlots && zelfdeProjectSplit()) {
    werkSlotFocus = visueelSlotVoorTermPane(tab)
    if (termSplit) bewaarTermSplit()
  } else if (werkSlots && werkSlots[werkSlotFocus]) {
    werkSlots[werkSlotFocus].tab = tab
    if (termSplit) bewaarTermSplit()
  }
  // Per project (en voor de cmd-sectie) onthouden welke weergave je open had,
  // ook na het afsluiten van de app.
  if (activeTermId && (settings.termTabs || {})[activeTermId] !== tab) {
    settings.termTabs = { ...(settings.termTabs || {}), [activeTermId]: tab }
    window.api.saveSettings(settings)
  }
  const term = document.getElementById('terminal')
  const br   = document.getElementById('browser')
  if (!term || !br) return
  pasTermSchermAan()
  const sessieLeeft = ptySessies.has(activeTermId)
  const sessieAanZet = tab === 'output' && sessieLeeft
  keurStatusNa()
  if (sessieAanZet) { toonPtySessie(); navPush(); return }
  if (tab === 'browser') {
    // Het commandoveld loslaten, anders vangt dat Enter af terwijl je in de
    // verkenner iets hebt aangewezen.
    if (document.activeElement === document.getElementById('term-input')) document.activeElement.blur()
    if (!browserItems.length) navigeerNaar(browserPath || cwdVoorProject(verkennerPid()))
  }
  if (tab === 'output' && !sessieLeeft) focusTerminalInput()
  navPush()
}

async function navigeerNaar(pad, pid) {
  if (pid && pid !== verkennerPid()) {
    return metVerkenner(pid, () => navigeerNaar(pad))
  }
  // Een zoekopdracht hoort bij de map waarin je zocht; ga je ergens anders
  // heen, dan slaan die resultaten nergens meer op.
  stopZoeken()
  if (!pad) { browserFout = I18N.t('browser.noFolderChosenError'); browserItems = []; renderBrowser(); return }

  // Boven de schijven zit geen echte map, maar wel een zinnig overzicht.
  if (pad === DEZE_PC) {
    let schijven = []
    try { schijven = await window.api.listDrives() } catch {}
    onthoudNetwerkSchijven(schijven)
    browserFout   = schijven.length ? '' : I18N.t('browser.noDrivesFoundError')
    browserPath   = DEZE_PC
    browserParent = null
    browserItems  = schijven.map(d => ({
      name: wortelNaam(d),
      path: d.path,
      dir: true,
      size: 0,
      mtime: 0,
      schijf: d,
    }))
    renderBrowser()
    renderBoom()
    navPush()
    startMapGroottes()
    bergVerkennerOp()
    return
  }

  // Een archief, of iets erin: dan de archiefweg in plaats van de schijf
  const viaArchief = inArchief(pad) || ARCHIEF_EXT.test(pad)
  const r = viaArchief ? await window.api.listArchive(pad) : await window.api.listDir(pad)
  if (!r || !r.ok) {
    browserFout = r?.geenTool
      ? r.reason
      : r?.reason === 'geen toegang tot deze map'
        ? I18N.t('browser.noAccessError')
        : I18N.t('browser.cannotOpenPrefix') + (r?.reason || I18N.t('common.unknownError'))
    browserItems = []
    renderBrowser()
    bergVerkennerOp()
    return
  }
  browserFout  = ''
  browserPath  = r.path
  browserItems = r.items
  browserParent = r.parent
  browserSelectie = new Set()
  browserFocus = -1
  browserAnker = -1
  renderBrowser()
  // De boom laat zien waar je terecht bent gekomen; binnen een archief houdt
  // dat op, want daar kent Windows geen mappen meer.
  if (viaArchief) renderBoom()
  else volgBoomNaar(browserPath)
  navPush()
  startMapGroottes()
  bergVerkennerOp()
}

function renderBrowser() {
  const lijst = brEl('br-list')
  const padVeld = brEl('br-path')
  if (!lijst || !padVeld) return
  const stond = lijst.scrollTop

  lijst.className = 'br-list weergave-' + huidigeWeergave()

  if (document.activeElement !== padVeld) padVeld.value = browserPath === DEZE_PC ? I18N.t('browser.thisComputerLabel') : browserPath
  // Vanaf een schijfwortel gaat omhoog naar het schijvenoverzicht.
  const omhoog = brEl('br-up')
  if (omhoog) omhoog.disabled = browserPath === DEZE_PC

  if (browserFout) {
    lijst.innerHTML = `<div class="br-leeg"><i class="ti ti-alert-triangle"></i> ${esc(browserFout)}</div>`
    toonSelectieStatus()
    bergVerkennerOp()
    return
  }

  const q = (brEl('br-filter')?.value || '').trim().toLowerCase()
  // Bij zoeken in submappen heeft de zoekopdracht het filteren al gedaan.
  const zoeken = diepZoekenAan() && zoekStand !== 'uit'
  const gefilterd = zoeken
    ? zoekItems
    : (q ? browserItems.filter(i => pastBijFilter(i.name, q)) : browserItems)
  const tonen = sorteerItems(gefilterd)
  browserZichtbaar = tonen

  const tegels = isTegelWeergave()

  if (!tonen.length) {
    // Zolang er nog gezocht wordt is "niks gevonden" gewoon niet waar.
    const tekst = (zoekStand === 'wacht' || zoekStand === 'bezig')
      ? `<i class="ti ti-loader-2 zoekt"></i> ${esc(I18N.t('browser.status.searchingEmpty'))}`
      : zoekStand === 'klaar'
        ? I18N.t('browser.noResultsQueryFolder', { query: esc(zoekVraag) })
        : q
          ? (diepZoekenAan()
              ? I18N.t('browser.noResultsQueryShort', { query: esc(q) })
              : I18N.t('browser.noResultsQuery', { query: esc(q) }))
          : I18N.t('browser.emptyFolder')
    lijst.innerHTML = `<div class="br-leeg">${tekst}</div>`
    toonSelectieStatus()
    bergVerkennerOp()
    return
  }

  let kader = lijst.querySelector('.br-kader')
  if (!kader) {
    kader = document.createElement('div')
    kader.className = 'br-kader'
    kader.hidden = true
    const suffix = String(lijst.id || '').replace(/^br-list/, '')
    kader.id = 'br-kader' + suffix
  }
  lijst.innerHTML = tonen.slice(0, 800).map((i, n) => `
    <div class="br-item ${i.dir ? 'map' : ''} ${(i.archief || (!i.inArchief && ARCHIEF_EXT.test(i.name))) ? 'archief' : ''} ${browserSelectie.has(i.path) ? 'gekozen' : ''} ${n === browserFocus ? 'focus' : ''}" data-i="${n}" title="${esc(i.path)}">
      <i class="ti ${i.schijf ? 'ti-device-desktop' : i.dir ? 'ti-folder' : (i.archief || ARCHIEF_EXT.test(i.name)) ? 'ti-file-zip' : 'ti-file'}"></i>
      <span class="br-naam">${esc(i.name)}</span>${tegels ? '' : `
      <span class="br-meta ${i.dir && !i.schijf && !grootteCache.has(i.path) ? 'bezig' : ''}">${
        i.schijf ? '' : i.dir ? (grootteCache.has(i.path) ? grootteTekst(grootteCache.get(i.path)) : '') : toonBytes(i.size)}</span>
      <span class="br-meta br-tijd">${i.gevondenIn && i.gevondenIn !== '.'
        ? esc(i.gevondenIn)
        : i.schijf
          ? (i.schijf.total ? esc(I18N.t('browser.freeOfTotal', { free: toonBytes(i.schijf.free), total: toonBytes(i.schijf.total) })) : esc(I18N.t('browser.driveLabel')))
          : esc(relTime(i.mtime))}</span>`}
    </div>`).join('')

  if (kader) lijst.appendChild(kader)
  lijst.scrollTop = stond
  toonSelectieStatus()

  lijst.querySelectorAll('[data-i]').forEach(el => {
    const item = tonen[parseInt(el.dataset.i)]

    // Eén klik selecteert alleen; openen gaat met dubbelklik, zoals je van de
    // verkenner van Windows gewend bent.
    el.onclick = (ev) => {
      const n = parseInt(el.dataset.i)
      if (ev.shiftKey)     selecteerReeks(n, ev.ctrlKey)
      else if (ev.ctrlKey) wisselSelectie(n)
      else                 selecteerAlleen(n)
      // Focus weghalen bij het commandoveld, zodat Enter deze regel opent.
      const ti = document.getElementById('term-input')
      if (document.activeElement === ti) ti.blur()
    }
    el.ondblclick = () => openBrowserItem(item)
  })
  bergVerkennerOp()
}

async function openBrowserItem(item) {
  // Een archief gedraagt zich als een map: je gaat erin
  if (item.dir || (!item.inArchief && ARCHIEF_EXT.test(item.name))) {
    const f = brEl('br-filter')
    if (f) f.value = ''
    wisSelectie()
    navigeerNaar(item.path)
    return
  }

  if (item.inArchief) {
    // Uit een archief moet het bestand eerst naar een tijdelijke kopie
    showToast(I18N.t('browser.unpackingToast'))
    const r = await window.api.openInArchive(item.path)
    if (!r || !r.ok) { browserFout = I18N.t('error.openFailedPrefix') + (r?.reason || I18N.t('common.unknownError')); renderBrowser(); return }
    showToast(I18N.t('browser.openedCopyToast', { name: item.name }))
    return
  }

  // Bestanden openen met het programma dat Windows eraan gekoppeld heeft
  window.api.openFolder(item.path)
  showToast(I18N.t('browser.openedToast', { name: item.name }))
}

async function wireBrowser(ctx, opts = {}) {
  haalVerkennerOp(ctx.id)
  if (!browserPath) {
    const bewaard = (settings.verkennerPaden || {})[ctx.id]
    const loc = ctx.locations[ctx.activeLocation] || ctx.locations[0]
    browserPath = bewaard || loc?.path || ''
    browserItems = []
    browserFout = ''
  }

  // De boom hoort mee te gaan naar het project dat je net koos, ook als je op
  // de output blijft staan — anders wijst hij nog naar waar je hiervoor was.
  if (browserPath && opts.volgBoom !== false) volgBoomNaar(browserPath)
  const bewaardeScroll = verkennerStaat(ctx.id).scroll || 0
  if (browserItems.length) {
    renderBrowser()
    const lijst = brEl('br-list', ctx.id)
    if (lijst) {
      lijst.scrollTop = bewaardeScroll
      verkennerStaat(ctx.id).scroll = bewaardeScroll
    }
  }

  const tabRoot = paneelVoorCtx(ctx.id) || document
  tabRoot.querySelectorAll('.term-tab').forEach(b => b.onclick = () => setTermTab(b.dataset.tab))

  const weergave = document.getElementById('br-weergave')
  if (weergave) weergave.onclick = (e) => {
    const d = e.currentTarget.getBoundingClientRect()
    weergaveMenu(d.left, d.bottom + 4)
  }
  const sorteer = document.getElementById('br-sorteer')
  if (sorteer) sorteer.onclick = (e) => {
    const d = e.currentTarget.getBoundingClientRect()
    sorteerMenu(d.left, d.bottom + 4)
  }

  await bedraadVerkennerHost('')
  if (document.getElementById('browser-andere')) await bedraadVerkennerHost('-andere')

  if (splitTweeProjecten()) setTermTab(werkSlots[werkSlotFocus].tab)
  else setTermTab((settings.termTabs || {})[ctx.id] === 'browser' ? 'browser' : 'output')
  ververPtyStatus()
}

async function bedraadVerkennerHost(suffix) {
  const $ = id => document.getElementById(id + suffix)
  if (!$('br-list')) return

  $('br-up').onclick      = () => navigeerNaar(browserParent || DEZE_PC)
  $('br-home').onclick    = () => navigeerNaar(cwdVoorProject(verkennerPid()))
  $('br-refresh').onclick = () => navigeerNaar(browserPath)

  // Ctrl+scroll stapt door de maten; zonder Ctrl scrol je gewoon de lijst.
  $('br-list').addEventListener('wheel', (e) => {
    if (!e.ctrlKey) return
    e.preventDefault()
    stapWeergave(e.deltaY < 0 ? 1 : -1)
  }, { passive: false })
  if ($('br-external')) $('br-external').onclick = () => browserPath && window.api.openFolder(browserPath)
  $('br-filter').addEventListener('input', () => { wisSelectie(); planZoek(); renderBrowser() })
  $('br-filter').addEventListener('keydown', (e) => {
    // Enter zoekt meteen, zonder te wachten tot je stil bent.
    if (e.key !== 'Enter' || !diepZoekenAan()) return
    e.preventDefault()
    clearTimeout(zoekTimer)
    const vraag = zoekTekst()
    if (vraag.length >= 2) doeZoek(vraag)
  })
  $('br-diep').onclick = () => zetDiepZoeken(!diepZoekenAan())
  zetDiepZoekenUiterlijk()
  if ($('br-annuleer')) $('br-annuleer').onclick = () => { window.api.annuleerKopie(); showToast(I18N.t('browser.cancellingToast')) }

  $('br-path').addEventListener('input', ververSuggesties)
  // Bij het verlaten van het veld verdwijnt de lijst, maar pas na een tel: anders
  // is hij al weg voordat je klik op een suggestie is aangekomen. Kom je meteen
  // weer terug in het veld, dan blaas je dat af — anders klapt de lijst alsnog
  // dicht terwijl je aan het typen bent.
  $('br-path').addEventListener('blur', () => {
    clearTimeout(sugVerbergTimer)
    sugVerbergTimer = setTimeout(verbergSuggesties, 150)
  })
  $('br-path').addEventListener('focus', () => { clearTimeout(sugVerbergTimer); sugVerbergTimer = null })
  $('br-path').addEventListener('keydown', (e) => {
    if (e.key === 'ArrowDown' && sugItems.length) {
      e.preventDefault(); sugIndex = Math.min(sugItems.length - 1, sugIndex + 1); markeerSuggestie(); return
    }
    if (e.key === 'ArrowUp' && sugItems.length) {
      e.preventDefault(); sugIndex = Math.max(0, sugIndex - 1); markeerSuggestie(); return
    }
    if (e.key === 'Escape') { e.preventDefault(); verbergSuggesties(); return }
    if (e.key === 'Enter') {
      e.preventDefault()
      e.stopPropagation()
      if (sugIndex >= 0) { kiesSuggestie(sugIndex); return }
      verbergSuggesties()
      const ingetypt = $('br-path').value.trim()
      navigeerNaar(/^deze pc$/i.test(ingetypt) ? DEZE_PC : ingetypt)
      $('br-path').blur()
    }
  })

  const werkKnop = $('br-usehere')
  if (werkKnop) werkKnop.onclick = async () => {
    if (!browserPath || browserPath === DEZE_PC) return
    if (inArchief(browserPath)) { showToast(I18N.t('browser.archiveCannotBeCwdToast')); return }

    const pid = verkennerPid()
    if (pid === CMD_CTX_ID) {
      await setCmdCwd(browserPath)
      renderCmdPanel()
      showToast(I18N.t('cmd.cwdSetToast', { path: browserPath }))
      return
    }
    if (pid === PS_CTX_ID) {
      await setPsCwd(browserPath)
      renderPsPanel()
      showToast(I18N.t('ps.cwdSetToast', { path: browserPath }))
      return
    }

    const p = projects.find(x => x.id === pid)
    if (!p) return

    const norm = (x) => String(x || '').replace(/[\\/]+$/, '').toLowerCase()
    let i = p.locations.findIndex(l => norm(l.path) === norm(browserPath))
    if (i < 0) {
      p.locations.push({ label: browserPath.split(/[\\/]/).filter(Boolean).pop() || I18N.t('project.defaultLocationLabel'), path: browserPath })
      i = p.locations.length - 1
      showToast(I18N.t('project.locationAddedToast', { label: p.locations[i].label }))
    } else {
      showToast(I18N.t('cmd.cwdSetToast', { path: p.locations[i].label }))
    }
    p.activeLocation = i
    saveProjects()
    renderSidebar()
    renderMain()
  }

  const drives = $('br-drives')
  let schijven = []
  try { schijven = await window.api.listDrives() } catch {}
  onthoudNetwerkSchijven(schijven)
  drives.innerHTML = [`<option value="${DEZE_PC}">${esc(I18N.t('browser.thisComputerLabel'))}</option>`]
    .concat(schijven.map(d => `<option value="${esc(d.path)}">${esc(wortelNaam(d))}</option>`)).join('')
  // Welke wortel staat er open? Opzoeken in de lijst zelf en niet de eerste drie
  // tekens pakken: een netwerkmap begint niet met een schijfletter, en dan koos
  // de lijst zichzelf leeg.
  const kaalPad = (p) => String(p || '').replace(/[\\/]+$/, '').toLowerCase()
  const open = schijven.find(d => {
    const k = kaalPad(d.path)
    const l = kaalPad(browserPath)
    return l === k || l.startsWith(k + '\\') || l.startsWith(k + '/')
  })
  drives.value = browserPath === DEZE_PC ? DEZE_PC
    : (open ? open.path : (browserPath.slice(0, 3) || '').toUpperCase())
  drives.onchange = () => navigeerNaar(drives.value)
}

function wireTerminal(ctx, opts = {}) {
  activeTermId = ctx.id
  herstelTermSplit(ctx)
  const $id = (id) => termEl(id, ctx.id)
  const loc = ctx.locations[ctx.activeLocation] || ctx.locations[0]
  updateTermPlaceholder(loc?.path || '')

  $id('btn-clear').onclick = () => wisTerminal()
  $id('btn-kill').onclick = () => {
    // Loopt er een antwoord binnen, dan is dát wat je wilt afbreken.
    if (aiBezig(activeTermId)) {
      window.api.aiStop({ id: activeTermId })
      return
    }
    // Staat er een echte terminal open, dan bedoel je die te stoppen.
    if ((termTab === 'output' || termSplitAan()) && ptySessies.has(activeTermId)) {
      stopPtySessie(activeTermId)
      setStatus('failed', '✗ ' + I18N.t('term.sessionStoppedStatus'))
      return
    }
    window.api.killCmd()
    setStatus('failed', '✗ ' + I18N.t('term.stoppedStatus'))
  }
  const sluitKnop = $id('btn-pty-sluit')
  if (sluitKnop) sluitKnop.onclick = () => stopPtySessie(activeTermId)
  $id('btn-copy-last').onclick = () => {
    const term  = $id('terminal')
    const lines = [...term.querySelectorAll('div:not(.t-sep)')]
    let lastIdx = -1
    lines.forEach((el, i) => { if (el.classList.contains('t-cmd')) lastIdx = i })
    const text = (lastIdx >= 0 ? lines.slice(lastIdx) : lines).map(el => el.textContent).filter(Boolean).join('\n')
    if (text) { navigator.clipboard.writeText(text); showToast(I18N.t('term.copyLastToast')) }
  }
  $id('btn-copy-all').onclick = () => {
    const text = [...$id('terminal').querySelectorAll('div:not(.t-sep)')].map(el => el.textContent).filter(Boolean).join('\n')
    if (text) { navigator.clipboard.writeText(text); showToast(I18N.t('term.copyAllToast')) }
  }
  $id('btn-bat').onclick = () => {
    // Snelkoppeling: neemt mee wat je net getypt hebt naar de bat-sectie
    const typed = $id('term-input')?.value || ''
    openBatView({ cmds: typed })
  }
  $id('btn-relaunch').onclick = () => {
    vraagJaNee(I18N.t('term.relaunchConfirmTitle'), I18N.t('term.relaunchConfirmText'), I18N.t('term.relaunchConfirmButton'))
      .then(ja => { if (ja) window.api.relaunch() })
  }

  // Ctrl+scroll over de uitvoer verandert de tekstgrootte, net als in de lijst.
  const uitvoer = $id('terminal')
  if (uitvoer) uitvoer.addEventListener('wheel', (e) => {
    if (!e.ctrlKey) return
    e.preventDefault()
    stapOutputMaat(e.deltaY < 0 ? 1 : -1)
  }, { passive: false })
  const ptyVak = $id('pty-host')
  if (ptyVak) ptyVak.addEventListener('wheel', (e) => {
    if (!e.ctrlKey) return
    e.preventDefault()
    stapOutputMaat(e.deltaY < 0 ? 1 : -1)
  }, { passive: false })
  pasOutputMaatToe()

  setupTerminalInput(ctx)
  aiVerversBalk()
  wireBrowser(ctx, opts)

  if (termOutput[ctx.id]) {
    const term = $id('terminal')
    term.innerHTML = termOutput[ctx.id] + '<span class="t-cursor"></span>'
    term.scrollTop = term.scrollHeight
  }

  wireTermSplit()
  if (termSplitAan() && !browserItems.length) navigeerNaar(browserPath || currentCwd())
  focusTerminalInput()
}

// ── CMD panel ─────────────────────────────────────────────────────────────────
// Losse terminal, niet aan een project gebonden. De werkmap wordt onthouden in
// settings.json, dus na herstarten sta je weer in dezelfde map.
async function setCmdCwd(p) {
  if (!p) return
  settings.cmd = settings.cmd || { cwd: '', recentCwds: [] }
  settings.cmd.cwd = p
  const rest = (settings.cmd.recentCwds || []).filter(x => x !== p)
  settings.cmd.recentCwds = [p, ...rest].slice(0, 12)
  await window.api.saveSettings(settings)
}

async function setPsCwd(p) {
  if (!p) return
  settings.ps = settings.ps || { cwd: '', recentCwds: [] }
  settings.ps.cwd = p
  const rest = (settings.ps.recentCwds || []).filter(x => x !== p)
  settings.ps.recentCwds = [p, ...rest].slice(0, 12)
  await window.api.saveSettings(settings)
}

// Snelkoppelingen tonen alleen wat je zélf hebt aangewezen: favorieten en
// handmatig toegevoegde commando's. Gewoon iets draaien zet het hier dus niet
// tussen — anders loopt deze rij binnen een dag vol.
function quickCmds() {
  return (history.entries || [])
    .filter(e => (e.favorite || e.source === 'manual') && entryDraaitIn(e, 'cmd'))
    .sort((a, b) => (b.favorite ? 1 : 0) - (a.favorite ? 1 : 0) || (b.lastRun || 0) - (a.lastRun || 0))
    .slice(0, 12)
}

// ── Snelkoppelingen in de cmd- en powershell-sectie ───────────────────────────
// Dezelfde rij als "uitvoeren" bij een project, maar die hangt niet aan een
// project. Volgorde, zichtbaarheid en mappen staan daarom in de instellingen en
// niet in projects.json -- in dezelfde vier velden als bij een project, zodat
// knoppenrij.js er niets van hoeft te weten. Ids: `quick:<id>` voor een
// commando uit het woordenboek, `pscmd:<cmd>` voor een standaard
// powershell-knop, `ai:<dienst>` voor een AI-knop.
let cmdSnelSorteerModus = false

function snelBron(soort) {
  if (!settings[soort] || typeof settings[soort] !== 'object') settings[soort] = {}
  return settings[soort]
}

// De regel uit het woordenboek achter een `quick:`-knop. Nodig om te weten of
// het een favoriet is of iets dat je zelf hebt toegevoegd.
function snelEntry(id) {
  return (history.entries || []).find(e => 'quick:' + e.id === id) || null
}

// Waar hoort een snelknop vanzelf thuis? Op soort, net als bij een project:
// wat je met een ster hebt aangewezen, wat je zelf hebt toegevoegd, wat de app
// meelevert, en de AI-knoppen.
const SNEL_AUTO_MAPPEN = [
  { auto: 'fav',       sleutel: 'folder.autoFav',      toets: (id) => id.startsWith('quick:') && !!(snelEntry(id) || {}).favorite },
  { auto: 'eigen',     sleutel: 'folder.autoOwn',      toets: (id) => id.startsWith('quick:') && !(snelEntry(id) || {}).favorite },
  { auto: 'standaard', sleutel: 'folder.autoStandard', toets: (id) => id.startsWith('pscmd:') },
  { auto: 'ai',        sleutel: 'folder.autoAi',       toets: (id) => id.startsWith('ai:') },
]

function snelAutoSoorten() {
  return SNEL_AUTO_MAPPEN.map(x => ({ auto: x.auto, label: I18N.t(x.sleutel), toets: x.toets }))
}

// Eenmalig: quickVolgorde en quickUit worden de vier velden die elke rij
// gebruikt. Geeft terug of er iets te verhuizen viel.
function migreerSnelRijen() {
  let gedaan = false
  for (const soort of ['cmd', 'ps']) {
    if (settings[soort] && Knoppenrij.migreer(settings[soort], SNEL_SECTIE[soort])) gedaan = true
  }
  return gedaan
}

function snelRij(sectie) {
  const soort = sectie === SNEL_SECTIE.ps ? 'ps' : 'cmd'
  const bron = snelBron(soort)
  return {
    bron,
    sectie,
    // Een map staat in dezelfde lijst als de knoppen, precies zoals bij een
    // project: zo houdt hij zijn plek in de volgorde zonder een tweede lijst.
    alle: () => [
      ...(soort === 'ps' ? psSnelIds() : cmdSnelIds()),
      ...Knoppenrij.mappenVan(bron, sectie).map(f => Knoppenrij.MAP_PREFIX + f.id),
    ],
    sorteert: sorteertSectie(sectie),
    autoSoorten: snelAutoSoorten(),
    knopHtml: () => (soort === 'ps' ? psSnelKnopMap() : cmdSnelKnopMap()),
    herteken: () => { if (soort === 'ps') renderPsPanel(); else renderCmdPanel() },
    bewaar: () => {
      window.api.saveSettings(settings)
      if (soort === 'ps') renderPsPanel(); else renderCmdPanel()
    },
  }
}

// Onder deze namen gebruikt de rest van het bestand de rij. Ze doen alle drie
// hetzelfde voor cmd en powershell; het verschil zit alleen in de sectie.
function snelVolgorde(sectie) {
  return Knoppenrij.volgorde(snelRij(sectie))
}

// Heeft deze rij überhaupt knoppen? Mappen tellen niet mee -- die zijn geen
// knop -- en verborgen knoppen wél: die zijn er, ze staan alleen even uit.
function snelHeeftKnoppen(sectie) {
  return snelVolgorde(sectie).some(id => !Knoppenrij.isMapId(id))
}

function snelZichtbaar(sectie, id) {
  return Knoppenrij.zichtbaar(snelRij(sectie), id)
}

function zetSnelZichtbaar(sectie, id, aan) {
  const bron = snelRij(sectie).bron
  bron.cmdVisibility = { ...(bron.cmdVisibility || {}), [id]: !!aan }
  window.api.saveSettings(settings)
}

function cmdSnelIds() {
  const ids = quickCmds().map(e => 'quick:' + e.id)
  if ((settings.ai || {}).knoppen !== false) {
    for (const d of aiKlaarDiensten()) ids.push('ai:' + d.id)
  }
  return ids
}

function cmdSnelVolgorde() {
  return snelVolgorde(SNEL_SECTIE.cmd)
}

function cmdSnelZichtbaar(id) {
  return snelZichtbaar(SNEL_SECTIE.cmd, id)
}

function zetCmdSnelZichtbaar(id, aan) {
  zetSnelZichtbaar(SNEL_SECTIE.cmd, id, aan)
}

function cmdSnelKnopMap() {
  const map = {}
  const actief = (aiSessies[CMD_CTX_ID] && aiSessies[CMD_CTX_ID].aan)
    ? aiSessies[CMD_CTX_ID].providerId : ''
  quickCmds().forEach(e => {
    const id = 'quick:' + e.id
    map[id] = `<button class="cmd-btn" data-quick="${esc(e.id)}" data-volgorde-id="${esc(id)}" title="${esc(e.note || e.cmd)}">
            <i class="ti ${e.favorite ? 'ti-star' : 'ti-bookmark'}"></i> ${esc(e.label || e.cmd)}
          </button>`
  })
  aiKlaarDiensten().forEach(d => { map['ai:' + d.id] = aiKnopHtml(d, actief) })
  return map
}

function cmdSnelLabel(id) {
  if (id.startsWith('ai:')) {
    const d = aiInfo(id.slice(3))
    return { label: (d && d.label) || id.slice(3), icoon: AI_KNOP_ICON[id.slice(3)] || 'ti-sparkles' }
  }
  const e = (history.entries || []).find(x => 'quick:' + x.id === id)
  return { label: (e && (e.label || e.cmd)) || id, icoon: e && e.favorite ? 'ti-star' : 'ti-bookmark' }
}

function cmdSnelGridHtml() {
  return cmdGridHtml(null, SNEL_SECTIE.cmd)
}

// ── Instellingenvenster van de cmd-sectie ─────────────────────────────────────
// Zelfde vorm als "project bewerken": een knopje in de kop opent een venster.
// Nu staan er alleen de snelkoppelingen in; het is een venster en geen
// uitklapvlak omdat hier meer bij gaat komen.
function openCmdInstellingen() {
  const body = document.getElementById('cmdset-body')
  if (!body) return
  const alle = cmdSnelVolgorde()

  const rijen = alle.map(id => {
    const { label, icoon } = cmdSnelLabel(id)
    return `<label class="cmdvis-row">
        <input type="checkbox" data-snel-aan="${esc(id)}" ${cmdSnelZichtbaar(id) ? 'checked' : ''} />
        <i class="ti ${esc(icoon)}"></i>
        <span>${esc(label)}</span>
      </label>`
  }).join('')

  body.innerHTML = `
    <div class="cmdvis-group">
      <div class="cmdvis-group-title">${esc(I18N.t('cmd.quickCmdsLabel'))}</div>
      <p class="hint-row">${esc(I18N.t('cmd.quickSettingsHint'))}</p>
      ${alle.length ? `<div class="cmdvis-list">${rijen}</div>`
                    : `<div class="hint-row">${esc(I18N.t('cmd.quickCmdsEmptyHint'))}</div>`}
    </div>`

  body.querySelectorAll('[data-snel-aan]').forEach(el => {
    el.onchange = () => {
      zetCmdSnelZichtbaar(el.dataset.snelAan, el.checked)
      renderCmdPanel()          // de rij achter het venster meteen bijwerken
    }
  })

  document.getElementById('modal-cmdset').hidden = false
}

function sluitCmdInstellingen() {
  document.getElementById('modal-cmdset').hidden = true
  focusTerminalInput()
}

function psOpties() {
  const ps = settings.ps || {}
  return {
    exe: ps.exe === 'pwsh' ? 'pwsh' : 'powershell',
    noProfile: ps.noProfile !== false,
    executionPolicy: ps.executionPolicy || '',
  }
}

function zetPsOptie(patch) {
  settings.ps = { ...(settings.ps || {}), ...patch }
  window.api.saveSettings(settings)
}

function openPsInstellingen() {
  const body = document.getElementById('psset-body')
  if (!body) return
  const opt = psOpties()
  const alle = psSnelVolgorde()
  const policy = ['', 'Bypass', 'RemoteSigned', 'Unrestricted'].includes(opt.executionPolicy)
    ? opt.executionPolicy : ''

  const rijen = alle.map(id => {
    const { label, icoon } = psSnelLabel(id)
    return `<label class="cmdvis-row">
        <input type="checkbox" data-ps-snel-aan="${esc(id)}" ${psSnelZichtbaar(id) ? 'checked' : ''} />
        <i class="ti ${esc(icoon)}"></i>
        <span>${esc(label)}</span>
      </label>`
  }).join('')

  body.innerHTML = `
    <div class="cmdvis-group">
      <div class="cmdvis-group-title">${esc(I18N.t('ps.exeLabel'))}</div>
      <div class="shell-pick" id="ps-exe">
        <label class="shell-pick-opt">
          <input type="radio" name="ps-exe" id="ps-exe-powershell" value="powershell" ${opt.exe === 'powershell' ? 'checked' : ''} />
          <span>${esc(I18N.t('ps.exePowershell'))}</span>
        </label>
        <label class="shell-pick-opt">
          <input type="radio" name="ps-exe" id="ps-exe-pwsh" value="pwsh" ${opt.exe === 'pwsh' ? 'checked' : ''} />
          <span>${esc(I18N.t('ps.exePwsh'))}</span>
        </label>
      </div>
      <p class="hint-row">${esc(I18N.t('ps.exeHint'))}</p>
    </div>
    <div class="cmdvis-group">
      <label class="cmdvis-row">
        <input type="checkbox" id="ps-noprofile" ${opt.noProfile ? 'checked' : ''} />
        <i class="ti ti-user-off"></i>
        <span>${esc(I18N.t('ps.noProfileLabel'))}</span>
      </label>
      <p class="hint-row">${esc(I18N.t('ps.noProfileHint'))}</p>
      <label class="field-label">${esc(I18N.t('ps.policyLabel'))}</label>
      <select class="field" id="ps-exec-policy">
        <option value="" ${policy === '' ? 'selected' : ''}>${esc(I18N.t('ps.policySystem'))}</option>
        <option value="Bypass" ${policy === 'Bypass' ? 'selected' : ''}>${esc(I18N.t('ps.policyBypass'))}</option>
        <option value="RemoteSigned" ${policy === 'RemoteSigned' ? 'selected' : ''}>${esc(I18N.t('ps.policyRemoteSigned'))}</option>
        <option value="Unrestricted" ${policy === 'Unrestricted' ? 'selected' : ''}>${esc(I18N.t('ps.policyUnrestricted'))}</option>
      </select>
      <p class="hint-row">${esc(I18N.t('ps.policyHint'))}</p>
    </div>
    <div class="cmdvis-group">
      <div class="cmdvis-group-title">${esc(I18N.t('cmd.quickCmdsLabel'))}</div>
      <p class="hint-row">${esc(I18N.t('cmd.quickSettingsHint'))}</p>
      ${alle.length ? `<div class="cmdvis-list">${rijen}</div>`
                    : `<div class="hint-row">${esc(I18N.t('cmd.quickCmdsEmptyHint'))}</div>`}
    </div>`

  body.querySelectorAll('input[name="ps-exe"]').forEach(el => {
    el.onchange = () => { if (el.checked) zetPsOptie({ exe: el.value }) }
  })
  document.getElementById('ps-noprofile').onchange = (e) => zetPsOptie({ noProfile: e.target.checked })
  document.getElementById('ps-exec-policy').onchange = (e) => zetPsOptie({ executionPolicy: e.target.value })
  body.querySelectorAll('[data-ps-snel-aan]').forEach(el => {
    el.onchange = () => {
      zetPsSnelZichtbaar(el.dataset.psSnelAan, el.checked)
      if (view === 'ps') renderPsPanel()
    }
  })

  document.getElementById('modal-psset').hidden = false
}

function sluitPsInstellingen() {
  document.getElementById('modal-psset').hidden = true
  focusTerminalInput()
}

// De snelrij wordt precies zo bediend als de rij bij een project: hetzelfde
// blok, dezelfde wiring. Alleen de knoppen erin verschillen, en die komen uit
// de rij-beschrijving.
function bedraadCmdSnel() {
  const paneel = document.getElementById('cmd-panel')
  if (paneel) bedraadCmdKnopVolgorde(null, paneel)
}

function renderCmdPanel() {
  aiKnopStempel = aiKnopVingerafdruk()
  const panel  = document.getElementById('cmd-panel')
  const cfg    = settings.cmd || {}
  const cwd    = cfg.cwd || ''
  const recent = (cfg.recentCwds || []).filter(Boolean)

  const cwdOptions = recent.length
    ? recent.map(p => `<option value="${esc(p)}" ${p === cwd ? 'selected' : ''}>${esc(p)}</option>`).join('')
    : `<option value="">${esc(I18N.t('cmd.noFolderChosenOption'))}</option>`

  const snelGrid = cmdSnelGridHtml()
  // Alleen als er echt niets is valt er iets uit te leggen. Staat er wél iets --
  // ook al ligt het in een dichte map of staat het even uit -- dan is een regel
  // tekst boven de rij alleen ruimte die de knoppen naar beneden duwt.
  const heeftSnel = snelHeeftKnoppen(SNEL_SECTIE.cmd)
  const quickMarkup = `
    <div class="cmd-section" data-sectieblok="${SNEL_SECTIE.cmd}">
      <div class="cmd-section-label-row">
        <div class="cmd-section-label">${esc(I18N.t('cmd.quickCmdsLabel'))}</div>
        ${dichteMappenHtml(null, SNEL_SECTIE.cmd)}
        ${kopActiesHtml(SNEL_SECTIE.cmd)}
      </div>
      <div class="cmd-grid ${cmdSnelSorteerModus ? 'cmd-sorteren' : ''}" id="cmd-snel-grid">${snelGrid}${cmdSnelSorteerModus ? '' : aiShellKnop(CMD_CTX_ID)}</div>
      ${heeftSnel ? '' : `<div class="hint-row">${esc(I18N.t('cmd.quickCmdsEmptyHint'))}</div>`}
    </div>`

  panel.innerHTML = `
    <div class="proj-header" data-krap>
      <div class="proj-header-left" data-krap>
        <span class="proj-header-icon"><i class="ti ti-terminal-2" style="color:var(--accent)"></i></span>
        <span class="proj-header-name">cmd</span>
      </div>
      <div class="loc-switcher">
        <label>${esc(I18N.t('cmd.folderLabel'))}</label>
        <select class="loc-select" id="cmd-cwd-select">${cwdOptions}</select>
        <button class="btn-open-folder" id="cmd-pick-folder" title="${esc(I18N.t('cmd.pickFolderTitle'))}">
          <i class="ti ti-folder-search" style="font-size:14px"></i>${knopTekst(I18N.t('cmd.pickButton'))}
        </button>
        <button class="btn-open-folder" id="cmd-open-folder" title="${esc(I18N.t('project.openFolderButton'))}">
          <i class="ti ti-folder-open" style="font-size:14px"></i>${knopTekst(I18N.t('project.openFolderButton'))}
        </button>
        <button class="btn-open-folder" id="cmd-open-cmd" title="cmd">
          <i class="ti ti-terminal-2" style="font-size:14px"></i>${knopTekst('cmd')}
        </button>
        <button class="btn-open-folder" id="cmd-copy-loc" title="${esc(I18N.t('ctx.copyPath'))}">
          <i class="ti ti-copy" style="font-size:14px"></i>
        </button>
      </div>
    </div>

    ${quickMarkup}

    ${terminalMarkup()}
  `

  document.getElementById('cmd-cwd-select').onchange = async (e) => {
    await setCmdCwd(e.target.value)
    renderCmdPanel()
  }
  document.getElementById('cmd-pick-folder').onclick = async () => {
    const picked = await window.api.pickFolder()
    if (picked) { await setCmdCwd(picked); renderCmdPanel(); showToast(I18N.t('cmd.cwdSetToast', { path: picked })) }
  }
  document.getElementById('cmd-open-folder').onclick = () => { if (cwd) window.api.openFolder(cwd) }
  document.getElementById('cmd-open-cmd').onclick    = () => { if (cwd) openCmdMetMelding(cwd) }
  document.getElementById('cmd-copy-loc').onclick    = () => {
    if (!cwd) return
    navigator.clipboard.writeText(cwd)
    showToast(I18N.t('toast.copiedGeneric'))
  }

  panel.querySelectorAll('[data-quick]').forEach(btn => {
    btn.onclick = () => {
      if (cmdSnelSorteerModus) return
      const entry = (history.entries || []).find(e => e.id === btn.dataset.quick)
      if (entry) executeCmd(cmdContext(), entry.cmd, null)
    }
  })

  bedraadCmdSnel()
  bedraadWisKnoppen()
  bedraadKnopWissen(cmdContext(), 'snel', document.getElementById('cmd-snel-grid'))
  bedraadAiKnoppen(cmdContext())
  wireTerminal(cmdContext())
  keurKrappeBalken()
  keurStatusNa()
}

// ── Snelkoppelingen in de powershell-sectie ───────────────────────────────────
// Zelfde rij als bij cmd: favorieten en zelf toegevoegde commando's, maar
// alleen powershell. Daarbij een vaste startset, zodat de rij niet leeg is
// tot je in het woordenboek sterren gaat zetten.
const PS_SNEL_STANDAARD = [
  { cmd: 'Get-ChildItem',                label: 'Bestanden in deze map',         icoon: 'ti-folder' },
  { cmd: 'Get-Location',                 label: 'Huidige map',                   icoon: 'ti-current-location' },
  { cmd: 'Get-Process',                  label: 'Draaiende processen',           icoon: 'ti-cpu' },
  { cmd: 'Get-Service',                  label: 'Windows-diensten',              icoon: 'ti-server' },
  { cmd: 'Get-Date',                     label: 'Datum en tijd',                 icoon: 'ti-calendar' },
  { cmd: '$PSVersionTable',              label: 'PowerShell-versie',             icoon: 'ti-info-circle' },
  { cmd: 'Get-NetIPAddress',             label: 'IP-adressen van deze pc',       icoon: 'ti-network' },
  { cmd: 'Get-ChildItem Env:',           label: 'Alle omgevingsvariabelen',      icoon: 'ti-variable' },
  { cmd: 'Get-ExecutionPolicy -List',    label: 'Execution policy per niveau',   icoon: 'ti-shield-check' },
  { cmd: 'Get-PSDrive',                  label: 'Schijven en powershell-drives', icoon: 'ti-device-floppy' },
]

let psSnelSorteerModus = false

// Waar hoort dit commando thuis? `shell` is leidend; het label `powershell`
// is alleen nog een vangnet voor oudere woordenboekregels.
function entryShell(e) {
  const s = String(e && e.shell || '').toLowerCase()
  if (s === 'powershell' || s === 'both' || s === 'cmd') return s
  if ((e.tags || []).some(t => String(t).toLowerCase() === 'powershell')) return 'powershell'
  return 'cmd'
}

function entryDraaitIn(e, shell) {
  const s = entryShell(e)
  return s === 'both' || s === shell
}

function isPsEntry(e) {
  return !!e && entryDraaitIn(e, 'powershell')
}

function psSnelItems() {
  const entries = history.entries || []
  const user = entries
    .filter(e => isPsEntry(e) && (e.favorite || e.source === 'manual') && !e.snippet)
    .sort((a, b) => (b.favorite ? 1 : 0) - (a.favorite ? 1 : 0) || (b.lastRun || 0) - (a.lastRun || 0))
    .map(e => ({
      id: 'quick:' + e.id,
      cmd: e.cmd,
      label: e.label || e.cmd,
      note: e.note || e.cmd,
      icoon: e.favorite ? 'ti-star' : 'ti-bookmark',
    }))
  const gezien = new Set(user.map(x => String(x.cmd).toLowerCase()))
  // Een verborgen favoriet mag de standaardknop niet terugbrengen: anders
  // duikt Get-ChildItem weer op zodra je die ster-knop hebt weggehaald.
  for (const e of entries) {
    if (isPsEntry(e) && ((settings.ps || {}).cmdVisibility || {})['quick:' + e.id] === false) {
      gezien.add(String(e.cmd).toLowerCase())
    }
  }
  const standaard = []
  for (const def of PS_SNEL_STANDAARD) {
    if (gezien.has(String(def.cmd).toLowerCase())) continue
    const e = entries.find(x => String(x.cmd).toLowerCase() === String(def.cmd).toLowerCase() && isPsEntry(x))
    standaard.push({
      id: 'pscmd:' + def.cmd,
      cmd: def.cmd,
      label: (e && e.label) || def.label || def.cmd,
      note: (e && e.note) || def.label || def.cmd,
      icoon: def.icoon,
    })
    gezien.add(String(def.cmd).toLowerCase())
  }
  return [...user, ...standaard]
}

function psSnelIds() {
  const ids = psSnelItems().map(x => x.id)
  if ((settings.ai || {}).knoppen !== false) {
    for (const d of aiKlaarDiensten()) ids.push('ai:' + d.id)
  }
  return ids
}

function psSnelVolgorde() {
  return snelVolgorde(SNEL_SECTIE.ps)
}

function psSnelZichtbaar(id) {
  return snelZichtbaar(SNEL_SECTIE.ps, id)
}

function zetPsSnelZichtbaar(id, aan) {
  zetSnelZichtbaar(SNEL_SECTIE.ps, id, aan)
}

function psSnelLabel(id) {
  if (id.startsWith('ai:')) {
    const d = aiInfo(id.slice(3))
    return { label: (d && d.label) || id.slice(3), icoon: AI_KNOP_ICON[id.slice(3)] || 'ti-sparkles' }
  }
  const item = psSnelItems().find(x => x.id === id)
  if (item) return { label: item.label, icoon: item.icoon }
  const e = (history.entries || []).find(x => 'quick:' + x.id === id)
  return { label: (e && (e.label || e.cmd)) || id, icoon: e && e.favorite ? 'ti-star' : 'ti-bookmark' }
}

function psSnelKnopMap() {
  const map = {}
  const actief = (aiSessies[PS_CTX_ID] && aiSessies[PS_CTX_ID].aan)
    ? aiSessies[PS_CTX_ID].providerId : ''
  psSnelItems().forEach(item => {
    map[item.id] = `<button class="cmd-btn" data-ps-cmd="${esc(item.cmd)}" data-volgorde-id="${esc(item.id)}" title="${esc(item.note)}">
            <i class="ti ${item.icoon}"></i> ${esc(item.label)}
          </button>`
  })
  aiKlaarDiensten().forEach(d => { map['ai:' + d.id] = aiKnopHtml(d, actief) })
  return map
}

function psSnelGridHtml() {
  return cmdGridHtml(null, SNEL_SECTIE.ps)
}

function bedraadPsSnel() {
  const paneel = document.getElementById('ps-panel')
  if (paneel) bedraadCmdKnopVolgorde(null, paneel)
}

// ── PowerShell panel ──────────────────────────────────────────────────────────
// Zelfde soort losse terminal als cmd, maar opdrachten gaan naar powershell.exe
// in plaats van cmd.exe. Eigen werkmap, zodat de twee shells elkaar niet
// in de weg zitten.
function renderPsPanel() {
  aiKnopStempel = aiKnopVingerafdruk()
  const panel  = document.getElementById('ps-panel')
  if (!panel) return
  const cfg    = settings.ps || {}
  const cwd    = cfg.cwd || ''
  const recent = (cfg.recentCwds || []).filter(Boolean)

  const cwdOptions = recent.length
    ? recent.map(p => `<option value="${esc(p)}" ${p === cwd ? 'selected' : ''}>${esc(p)}</option>`).join('')
    : `<option value="">${esc(I18N.t('cmd.noFolderChosenOption'))}</option>`

  const snelGrid = psSnelGridHtml()
  const heeftSnel = snelHeeftKnoppen(SNEL_SECTIE.ps)
  const quickMarkup = `
    <div class="cmd-section" data-sectieblok="${SNEL_SECTIE.ps}">
      <div class="cmd-section-label-row">
        <div class="cmd-section-label">${esc(I18N.t('cmd.quickCmdsLabel'))}</div>
        ${dichteMappenHtml(null, SNEL_SECTIE.ps)}
        ${kopActiesHtml(SNEL_SECTIE.ps)}
      </div>
      <div class="cmd-grid ${psSnelSorteerModus ? 'cmd-sorteren' : ''}" id="ps-snel-grid">${snelGrid}${psSnelSorteerModus ? '' : aiShellKnop(PS_CTX_ID)}</div>
      ${heeftSnel ? '' : `<div class="hint-row">${esc(I18N.t('cmd.quickCmdsEmptyHint'))}</div>`}
    </div>`

  panel.innerHTML = `
    <div class="proj-header" data-krap>
      <div class="proj-header-left" data-krap>
        <span class="proj-header-icon"><i class="ti ti-brand-powershell" style="color:#5391FE"></i></span>
        <span class="proj-header-name">powershell</span>
      </div>
      <div class="loc-switcher">
        <label>${esc(I18N.t('cmd.folderLabel'))}</label>
        <select class="loc-select" id="ps-cwd-select">${cwdOptions}</select>
        <button class="btn-open-folder" id="ps-pick-folder" title="${esc(I18N.t('cmd.pickFolderTitle'))}">
          <i class="ti ti-folder-search" style="font-size:14px"></i>${knopTekst(I18N.t('cmd.pickButton'))}
        </button>
        <button class="btn-open-folder" id="ps-open-folder" title="${esc(I18N.t('project.openFolderButton'))}">
          <i class="ti ti-folder-open" style="font-size:14px"></i>${knopTekst(I18N.t('project.openFolderButton'))}
        </button>
        <button class="btn-open-folder" id="ps-open-ps" title="powershell">
          <i class="ti ti-brand-powershell" style="font-size:14px"></i>${knopTekst('powershell')}
        </button>
      </div>
    </div>

    ${quickMarkup}

    ${terminalMarkup()}
  `

  document.getElementById('ps-cwd-select').onchange = async (e) => {
    await setPsCwd(e.target.value)
    renderPsPanel()
  }
  document.getElementById('ps-pick-folder').onclick = async () => {
    const picked = await window.api.pickFolder()
    if (picked) { await setPsCwd(picked); renderPsPanel(); showToast(I18N.t('ps.cwdSetToast', { path: picked })) }
  }
  document.getElementById('ps-open-folder').onclick = () => { if (cwd) window.api.openFolder(cwd) }
  document.getElementById('ps-open-ps').onclick     = () => { if (cwd) window.api.openPs(cwd) }

  panel.querySelectorAll('[data-ps-cmd]').forEach(btn => {
    btn.onclick = () => {
      if (psSnelSorteerModus) return
      executeCmd(psContext(), btn.dataset.psCmd, null)
    }
  })

  bedraadPsSnel()
  bedraadWisKnoppen()
  bedraadKnopWissen(psContext(), 'ps-snel', document.getElementById('ps-snel-grid'))
  bedraadAiKnoppen(psContext())
  wireTerminal(psContext())
  keurKrappeBalken()
  keurStatusNa()
}

// ── Woordenboek ───────────────────────────────────────────────────────────────
const normPath = s => String(s || '').replace(/[\\/]+$/, '')

// Filteren + sorteren, los gehouden van de DOM zodat het te testen valt
function dictVisibleEntries() {
  let list = (history.entries || []).slice()

  const q = dictSearch.trim().toLowerCase()
  if (q) {
    list = list.filter(e =>
      (e.cmd   || '').toLowerCase().includes(q) ||
      (e.label || '').toLowerCase().includes(q) ||
      (e.note  || '').toLowerCase().includes(q) ||
      (e.tags  || []).some(t => String(t).toLowerCase().includes(q)))
  }

  if (dictFilter === 'fav') {
    list = list.filter(e => e.favorite)
  } else if (dictFilter.startsWith('cwd:')) {
    const w = normPath(dictFilter.slice(4))
    list = list.filter(e => (e.cwds || []).some(c => normPath(c.path) === w))
  }

  // Thema's: binnen een groep telt "of", tussen de groepen telt "en". Kies je
  // bestanden + netwerk, dan zie je allebei; kies je daar favoriet bij, dan
  // alleen de favorieten daarvan.
  const gekozenTags   = [...dictThemas].filter(t => t.startsWith('tag:')).map(t => t.slice(4))
  const gekozenSoort  = DICT_SOORTEN.filter(s => dictThemas.has(s.id))
  if (gekozenTags.length) {
    list = list.filter(e => (e.tags || []).some(t => gekozenTags.includes(String(t).toLowerCase())))
  }
  if (gekozenSoort.length) {
    list = list.filter(e => gekozenSoort.some(s => s.past(e)))
  }

  const within =
    dictSort === 'used'  ? (a, b) => (b.runCount || 0) - (a.runCount || 0) :
    dictSort === 'alpha' ? (a, b) => String(a.cmd).localeCompare(String(b.cmd)) :
                           (a, b) => (b.lastRun || b.firstRun || 0) - (a.lastRun || a.firstRun || 0)

  // Favorieten staan altijd bovenaan; de gekozen sortering bepaalt de volgorde
  // binnen de favorieten en binnen de rest.
  list.sort((a, b) => (b.favorite ? 1 : 0) - (a.favorite ? 1 : 0) || within(a, b))

  return list
}

// Alle thema's die in het woordenboek voorkomen, met hoe vaak
function alleThemas() {
  const tel = new Map()
  // Zelf aangemaakte thema's staan er ook bij als er nog niets in zit — anders
  // kun je er niets aan toevoegen omdat ze pas na de eerste regel bestaan.
  for (const t of (settings.dictThemas || [])) {
    const naam = String(t).trim().toLowerCase()
    if (naam) tel.set(naam, 0)
  }
  for (const e of history.entries || []) {
    for (const t of e.tags || []) {
      const naam = String(t).trim().toLowerCase()
      if (naam) tel.set(naam, (tel.get(naam) || 0) + 1)
    }
  }
  return [...tel.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([naam, aantal]) => ({ naam, aantal }))
}

function themaAantal(soort) {
  return (history.entries || []).filter(soort.past).length
}

function filtersActief() {
  return dictThemas.size > 0 || dictFilter !== 'all' || !!dictSearch.trim()
}

function wisDictFilters() {
  dictThemas.clear()
  dictFilter = 'all'
  dictSearch = ''
}

// Alle mappen waarin ooit iets gedraaid heeft, drukste eerst
function allCwds() {
  const counts = new Map()
  for (const e of history.entries || []) {
    for (const c of e.cwds || []) {
      if (!c.path) continue
      counts.set(c.path, (counts.get(c.path) || 0) + (c.runCount || 1))
    }
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([path, count]) => ({ path, count }))
}

function relTime(ts) {
  if (!ts) return I18N.t('dict.rel.never')
  const s = Math.floor((Date.now() - ts) / 1000)
  if (s < 60)    return I18N.t('dict.rel.justNow')
  if (s < 3600)  return I18N.t('dict.rel.minutesAgo', { n: Math.floor(s / 60) })
  if (s < 86400) return I18N.t('dict.rel.hoursAgo', { n: Math.floor(s / 3600) })
  const d = Math.floor(s / 86400)
  if (d === 1)   return I18N.t('dict.rel.yesterday')
  if (d < 30)    return I18N.t('dict.rel.daysAgo', { n: d })
  const mo = Math.floor(d / 30)
  return mo < 12 ? I18N.t('dict.rel.monthsAgo', { n: mo }) : I18N.t('dict.rel.yearsAgo', { n: Math.floor(d / 365) })
}

function shortPath(p) {
  const parts = normPath(p).split(/[\\/]/).filter(Boolean)
  return parts.length <= 2 ? p : '…\\' + parts.slice(-2).join('\\')
}

function renderDictPanel() {
  const panel = document.getElementById('dict-panel')

  panel.innerHTML = `
    <div class="settings-header">
      <i class="ti ti-book" style="font-size:18px;color:var(--accent)"></i>
      <span class="settings-header-title">${esc(I18N.t('dict.title'))}</span>
      <button class="btn-primary dict-add-btn" id="dict-add" title="${esc(I18N.t('dict.addButton'))}"><i class="ti ti-plus" style="font-size:13px"></i>${knopTekst(I18N.t('dict.addButton'))}</button>
    </div>

    <div class="dict-toolbar" data-krap>
      <div class="dict-search-wrap">
        <i class="ti ti-search"></i>
        <input class="field dict-search" id="dict-search" placeholder="${esc(I18N.t('dict.searchPlaceholder'))}" autocomplete="off" spellcheck="false" />
      </div>
      <select class="loc-select" id="dict-filter"></select>
      <div class="thema-wrap">
        <button class="loc-select thema-knop" id="dict-thema">
          <i class="ti ti-tags"></i>
          <span id="dict-thema-tekst">${esc(I18N.t('dict.theme.allThemes'))}</span>
          <i class="ti ti-chevron-down"></i>
        </button>
        <div class="thema-menu" id="dict-thema-menu" hidden></div>
      </div>
      <select class="loc-select" id="dict-sort">
        <option value="recent">${esc(I18N.t('dict.sort.recent'))}</option>
        <option value="used">${esc(I18N.t('dict.sort.used'))}</option>
        <option value="alpha">${esc(I18N.t('dict.sort.alpha'))}</option>
      </select>
    </div>

    <div class="dict-list" id="dict-list"></div>
  `

  const search = document.getElementById('dict-search')
  search.value = dictSearch
  search.oninput = () => { dictSearch = search.value; renderDictList() }

  const filter = document.getElementById('dict-filter')
  filter.innerHTML = [
    `<option value="all">${esc(I18N.t('dict.filter.allFolders'))}</option>`,
    `<option value="fav">${esc(I18N.t('dict.filter.favorites'))}</option>`,
    ...allCwds().map(c => `<option value="cwd:${esc(c.path)}">${esc(shortPath(c.path))} (${c.count}×)</option>`),
  ].join('')
  filter.value = dictFilter
  filter.onchange = () => { dictFilter = filter.value; renderDictList() }

  bouwThemaMenu()
  document.getElementById('dict-thema').onclick = (e) => {
    e.stopPropagation()
    const menu = document.getElementById('dict-thema-menu')
    menu.hidden = !menu.hidden
  }

  const sort = document.getElementById('dict-sort')
  sort.value = dictSort
  sort.onchange = () => { dictSort = sort.value; renderDictList() }

  document.getElementById('dict-add').onclick = () => openDictModal(null)

  renderDictList()
  keurKrappeBalken()
  requestAnimationFrame(() => { search.focus(); search.selectionStart = search.selectionEnd = search.value.length })
}

// Uitklapmenu met thema's. Bovenaan een knop om alles weer aan te zetten.
// ── Eigen thema's in het woordenboek ──────────────────────────────────────────
// Een thema is niet meer dan een label op een commando, dus normaal ontstaat er
// pas een thema zodra er iets in zit. Eentje die je zelf aanmaakt bewaren we
// apart, anders zou hij meteen weer weg zijn omdat hij nog leeg is.
//
// Werkt vanuit de cmd-sectie én vanuit een project:
//   theme                     welke thema's zijn er
//   theme <naam>              thema maken, of laten zien wat erin zit
//   theme <naam> <commando>   dat commando eronder in het woordenboek zetten
//   theme wis <naam>          een zelfgemaakt thema weghalen

function isThemaCommando(cmd) {
  return /^\s*(theme|thema)(\s|$)/i.test(String(cmd || ''))
}

function eigenThemas() {
  return (settings.dictThemas || []).map(t => String(t).toLowerCase())
}

function bewaarEigenThemas(lijst) {
  settings.dictThemas = [...new Set(lijst.map(t => String(t).trim().toLowerCase()).filter(Boolean))].sort()
  window.api.saveSettings(settings)
}

function themaTeller(naam) {
  const kaal = String(naam).toLowerCase()
  return (history.entries || []).filter(e => (e.tags || []).some(t => String(t).toLowerCase() === kaal)).length
}

function themaBestaat(naam) {
  return themaTeller(naam) > 0 || eigenThemas().includes(String(naam).toLowerCase())
}

// Na een wijziging moet het woordenboek het meteen laten zien.
function themaVerversWeergave() {
  renderSidebar()
  if (view === 'dict') { bouwThemaMenu(); renderDictList() }
}

async function themaCommando(ctx, regel) {
  const kaal = String(regel).trim()
  appendLine('cmd', '> ' + kaal)
  const rest = kaal.replace(/^(theme|thema)\s*/i, '').trim()

  if (!rest) { themaToonAlle(); return }

  // theme wis <naam>
  const weg = rest.match(/^(wis|weg|verwijder|remove|del|delete)\s+(.+)$/i)
  if (weg) { themaWis(weg[2].trim()); return }

  const woorden  = rest.split(/\s+/)
  const naam     = woorden[0].toLowerCase()
  const commando = woorden.slice(1).join(' ').trim()

  if (!/^[\w][\w -]*$/.test(naam)) {
    appendLine('err', I18N.t('theme.badNameError', { name: naam }))
    appendLine('sep', '')
    return
  }

  // theme <naam> <commando> — er meteen iets in zetten
  if (commando) {
    try {
      history = await window.api.addHistory({ cmd: commando, tags: [naam], label: '' })
    } catch (e) {
      appendLine('err', I18N.t('theme.addFailedError', { message: e.message || String(e) }))
      return
    }
    if (!eigenThemas().includes(naam)) bewaarEigenThemas([...eigenThemas(), naam])
    appendLine('ok', '✓ ' + I18N.t('theme.addedLine', { cmd: commando, name: naam }))
    appendLine('sep', '')
    themaVerversWeergave()
    return
  }

  // theme <naam> — maken, of laten zien wat er al in zit
  const aantal = themaTeller(naam)
  if (!eigenThemas().includes(naam)) bewaarEigenThemas([...eigenThemas(), naam])

  if (aantal) {
    appendLine('info', I18N.t('theme.existsLine', { name: naam, count: aantal }))
    ;(history.entries || [])
      .filter(e => (e.tags || []).some(t => String(t).toLowerCase() === naam))
      .slice(0, 8)
      .forEach(e => appendLine('out', '  ' + e.cmd + (e.label ? '   — ' + e.label : '')))
  } else {
    appendLine('ok', '✓ ' + I18N.t('theme.createdLine', { name: naam }))
    appendLine('out', '  ' + I18N.t('theme.createdHint', { name: naam }))
  }
  appendLine('out', '  ' + I18N.t('theme.whereHint'))
  appendLine('sep', '')
  themaVerversWeergave()
}

function themaToonAlle() {
  const uit = new Map()
  for (const t of alleThemas()) uit.set(t.naam, t.aantal)
  for (const t of eigenThemas()) if (!uit.has(t)) uit.set(t, 0)
  if (!uit.size) { appendLine('warn', I18N.t('theme.noneLine')); appendLine('sep', ''); return }

  appendLine('ok', '✦ ' + I18N.t('theme.listTitle'))
  ;[...uit.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .forEach(([naam, aantal]) => appendLine('out', ` ${naam.padEnd(18, ' ')} ${aantal}`))
  appendLine('out', '  ' + I18N.t('theme.listHint'))
  appendLine('sep', '')
}

function themaWis(naam) {
  const kaal = String(naam).trim().toLowerCase()
  if (!eigenThemas().includes(kaal)) {
    appendLine('err', I18N.t('theme.notYoursError', { name: kaal }))
    appendLine('sep', '')
    return
  }
  bewaarEigenThemas(eigenThemas().filter(t => t !== kaal))
  const aantal = themaTeller(kaal)
  appendLine('ok', '✓ ' + I18N.t('theme.removedLine', { name: kaal }))
  // De labels op de commando's zelf laten we staan: die weghalen zou zonder
  // waarschuwing je woordenboek verbouwen.
  if (aantal) appendLine('warn', I18N.t('theme.removedButUsedWarn', { name: kaal, count: aantal }))
  appendLine('sep', '')
  themaVerversWeergave()
}

// Het themamenu. Met een woordenboek van een paar honderd commando's lopen de
// thema's snel op; zonder zoekveld sta je te scrollen naar iets waarvan je de
// naam allang weet. Zelf aangemaakte thema's krijgen een merkje, zodat je die
// terugvindt tussen de ingebouwde.
let themaZoek = ''
let themaZoekAan = false      // staat het zoekveld open
let themaWisModus = false     // klikken op een thema haalt het weg

function themaRijenHtml() {
  const zoek = themaZoek.trim().toLowerCase()
  const eigen = new Set(eigenThemas())
  const tags = alleThemas().filter(t => !zoek || t.naam.includes(zoek))

  // In de wismodus gaat het alleen over thema's. De soorten eronder (favoriet,
  // ingrijpend, sjabloon) zijn geen labels maar eigenschappen van een commando;
  // die vallen niet weg te halen.
  if (themaWisModus) {
    if (!tags.length) return `<div class="hint-row" style="padding:6px 2px">${esc(I18N.t('dict.theme.noMatch'))}</div>`
    return `
      <div class="thema-kop wis">${esc(I18N.t('dict.theme.deleteHeading'))}</div>
      ${tags.map(t => `
        <button class="thema-regel wis" data-thema-wis="${esc(t.naam)}" title="${esc(I18N.t('dict.theme.deleteRowTitle', { name: t.naam }))}">
          <i class="ti ti-trash"></i>
          <span class="thema-naam">${esc(t.naam)}</span>
          ${eigen.has(t.naam) ? `<i class="ti ti-user thema-eigen" title="${esc(I18N.t('dict.theme.ownTitle'))}"></i>` : ''}
          <span class="thema-aantal">${t.aantal}</span>
        </button>`).join('')}`
  }

  const soorten = DICT_SOORTEN
    .map(s => ({ ...s, aantal: themaAantal(s) }))
    .filter(s => s.aantal > 0 && (!zoek || I18N.t(s.labelKey).toLowerCase().includes(zoek)))

  if (!tags.length && !soorten.length) {
    return `<div class="hint-row" style="padding:6px 2px">${esc(I18N.t('dict.theme.noMatch'))}</div>`
  }

  return `
    ${tags.length ? `<div class="thema-kop">${esc(I18N.t('dict.theme.tagHeading'))}</div>` : ''}
    ${tags.map(t => `
      <label class="thema-regel">
        <input type="checkbox" data-thema="tag:${esc(t.naam)}" ${dictThemas.has('tag:' + t.naam) ? 'checked' : ''} />
        <span class="thema-naam">${esc(t.naam)}</span>
        ${eigen.has(t.naam) ? `<i class="ti ti-user thema-eigen" title="${esc(I18N.t('dict.theme.ownTitle'))}"></i>` : ''}
        <span class="thema-aantal">${t.aantal}</span>
      </label>`).join('')}
    ${soorten.length ? `<div class="thema-kop">${esc(I18N.t('dict.theme.kindHeading'))}</div>` : ''}
    ${soorten.map(s => `
      <label class="thema-regel">
        <input type="checkbox" data-thema="${s.id}" ${dictThemas.has(s.id) ? 'checked' : ''} />
        <i class="ti ${s.icoon}"></i>
        <span class="thema-naam">${esc(I18N.t(s.labelKey))}</span>
        <span class="thema-aantal">${s.aantal}</span>
      </label>`).join('')}`
}

// Een thema weghalen is het label van elk commando afhalen. Dat is niet terug
// te draaien, dus eerst laten zien wat het raakt en het laten bevestigen.
async function wisThema(naam) {
  const aantal = themaTeller(naam)
  const voorbeelden = (history.entries || [])
    .filter(e => (e.tags || []).some(t => String(t).toLowerCase() === naam))
    .slice(0, 6).map(e => e.cmd)

  const ja = await vraagJaNee(
    I18N.t('dict.theme.deleteConfirmTitle', { name: naam }),
    aantal ? I18N.t('dict.theme.deleteConfirmText', { name: naam, count: aantal })
           : I18N.t('dict.theme.deleteConfirmEmpty', { name: naam }),
    I18N.t('dict.theme.deleteConfirmButton'), 'gevaar', voorbeelden)
  if (!ja) return

  if (aantal) {
    try {
      const r = await window.api.verwijderThema({ tag: naam })
      if (r && r.history) history = r.history
    } catch (e) {
      showToast(I18N.t('dict.theme.deleteFailedToast', { message: e.message || String(e) }))
      return
    }
  }
  // Ook uit je eigen lijst en uit het filter dat nu aanstaat.
  if (eigenThemas().includes(naam)) bewaarEigenThemas(eigenThemas().filter(t => t !== naam))
  dictThemas.delete('tag:' + naam)

  showToast(I18N.t('dict.theme.deletedToast', { name: naam, count: aantal }))
  bouwThemaMenu()
  werkThemaKnopBij()
  renderDictList()
  renderSidebar()
}

function vulThemaLijst() {
  const lijst = document.getElementById('thema-lijst')
  if (!lijst) return
  lijst.innerHTML = themaRijenHtml()
  lijst.querySelectorAll('[data-thema-wis]').forEach(el => {
    el.onclick = () => wisThema(el.dataset.themaWis)
  })
  lijst.querySelectorAll('[data-thema]').forEach(el => {
    el.onchange = () => {
      if (el.checked) dictThemas.add(el.dataset.thema)
      else dictThemas.delete(el.dataset.thema)
      werkThemaKnopBij()
      document.getElementById('thema-reset')?.classList.toggle('uit', !filtersActief())
      renderDictList()
    }
  })
}

function bouwThemaMenu() {
  const menu = document.getElementById('dict-thema-menu')
  if (!menu) return

  menu.innerHTML = `
    <div class="thema-kop-rij">
      <button class="thema-reset ${filtersActief() ? '' : 'uit'}" id="thema-reset">
        <i class="ti ti-filter-off"></i> ${esc(I18N.t('dict.theme.resetAllButton'))}
      </button>
      <button class="thema-icoonknop ${themaZoekAan ? 'aan' : ''}" id="thema-zoek-knop"
              title="${esc(I18N.t('dict.theme.searchTitle'))}"><i class="ti ti-search"></i></button>
      <button class="thema-icoonknop gevaar ${themaWisModus ? 'aan' : ''}" id="thema-wis-knop"
              title="${esc(I18N.t('dict.theme.deleteModeTitle'))}"><i class="ti ti-trash"></i></button>
    </div>
    <input class="field thema-zoek" id="thema-zoek" spellcheck="false" autocomplete="off"
           ${themaZoekAan ? '' : 'hidden'}
           placeholder="${esc(I18N.t('dict.theme.searchPlaceholder'))}" value="${esc(themaZoek)}" />
    ${themaWisModus ? `<div class="thema-wis-uitleg">${esc(I18N.t('dict.theme.deleteModeHint'))}</div>` : ''}
    <div id="thema-lijst"></div>
  `
  vulThemaLijst()

  document.getElementById('thema-zoek-knop').onclick = () => {
    themaZoekAan = !themaZoekAan
    if (!themaZoekAan) themaZoek = ''
    bouwThemaMenu()
    if (themaZoekAan) document.getElementById('thema-zoek')?.focus()
  }
  document.getElementById('thema-wis-knop').onclick = () => {
    themaWisModus = !themaWisModus
    bouwThemaMenu()
  }

  const zoekVeld = document.getElementById('thema-zoek')
  // Alleen de lijst opnieuw tekenen: het hele menu opbouwen zou het veld de
  // focus afnemen bij elke toetsaanslag.
  zoekVeld.addEventListener('input', () => { themaZoek = zoekVeld.value; vulThemaLijst() })
  zoekVeld.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return
    e.stopPropagation()
    if (themaZoek) { themaZoek = ''; zoekVeld.value = ''; vulThemaLijst(); return }
    document.getElementById('dict-thema-menu').hidden = true
  })

  document.getElementById('thema-reset').onclick = () => {
    wisDictFilters()
    themaZoek = ''
    const zoek = document.getElementById('dict-search')
    if (zoek) zoek.value = ''
    const mapKeuze = document.getElementById('dict-filter')
    if (mapKeuze) mapKeuze.value = 'all'
    bouwThemaMenu()
    werkThemaKnopBij()
    renderDictList()
  }
  menu.onclick = (e) => e.stopPropagation()

  werkThemaKnopBij()
}

function werkThemaKnopBij() {
  const tekst = document.getElementById('dict-thema-tekst')
  const knop  = document.getElementById('dict-thema')
  if (!tekst || !knop) return
  const n = dictThemas.size
  const namen = [...dictThemas].map(t => t.startsWith('tag:')
    ? t.slice(4)
    : I18N.t(DICT_SOORTEN.find(s => s.id === t)?.labelKey) || t)
  tekst.textContent = n === 0 ? I18N.t('dict.theme.allThemes') : n <= 2 ? namen.join(' + ') : I18N.t('dict.theme.countThemes', { n })
  knop.classList.toggle('aan', n > 0)
}

function renderDictList() {
  const list = document.getElementById('dict-list')
  if (!list) return
  const entries = dictVisibleEntries()

  if (!entries.length) {
    const total = (history.entries || []).length
    list.innerHTML = `<div class="empty-state">
      <i class="ti ti-book-off"></i>
      <p>${esc(total ? I18N.t('dict.emptyFiltered') : I18N.t('dict.emptyNone'))}</p>
    </div>`
    return
  }

  list.innerHTML = entries.map(e => {
    const cwds = (e.cwds || []).slice().sort((a, b) => (b.lastRun || 0) - (a.lastRun || 0))
    const cwdChips = cwds.map(c =>
      `<button class="dict-cwd" data-run="${esc(e.id)}" data-cwd="${esc(c.path)}" title="${esc(I18N.t('dict.runInFolderTitle', { path: c.path }))}">
         <i class="ti ti-folder"></i> ${esc(shortPath(c.path))} <span class="dict-cwd-n">${c.runCount || 0}×</span>
       </button>`).join('')

    const tags = (e.tags || []).map(t => `<span class="dict-tag">${esc(t)}</span>`).join('')
    // Een fragment hoort ín een bat-bestand; los uitvoeren slaat nergens op.
    const fragment = !!e.snippet
    const zwaar    = !!e.danger
    // Een sjabloon moet je eerst invullen; zo uitvoeren of als knop vastzetten
    // levert alleen een mislukking op.
    const sjabloon = !!e.template
    const draaibaar = !fragment && !sjabloon
    const shell = entryShell(e)
    const shellBadge = shell === 'cmd' ? ''
      : `<span class="dict-shell">${esc(I18N.t(shell === 'both' ? 'dict.kind.both' : 'dict.kind.powershell'))}</span>`

    return `
      <div class="dict-row" data-id="${esc(e.id)}">
        <button class="dict-fav ${e.favorite ? 'on' : ''}" data-fav="${esc(e.id)}" title="${esc(e.favorite ? I18N.t('dict.unfavoriteTitle') : I18N.t('dict.favoriteTitle'))}">
          <i class="ti ${e.favorite ? 'ti-star-filled' : 'ti-star'}"></i>
        </button>
        <div class="dict-main">
          <div class="dict-cmd">${esc(e.cmd)}</div>
          ${e.label || tags || fragment || zwaar || sjabloon || shellBadge ? `<div class="dict-meta">${e.label ? esc(e.label) : ''}${shellBadge}${fragment ? `<span class="dict-snippet">${esc(I18N.t('dict.kind.fragment'))}</span>` : ''}${sjabloon ? `<span class="dict-template">${esc(I18N.t('dict.kind.template'))}</span>` : ''}${zwaar ? `<span class="dict-danger">${esc(I18N.t('dict.kind.dangerous'))}</span>` : ''}${tags}</div>` : ''}
          ${e.note ? `<div class="dict-note">${esc(e.note)}</div>` : ''}
          ${draaibaar ? `<div class="dict-cwds">${cwdChips || `<span class="dict-nocwd">${esc(I18N.t('dict.noCwdYet'))}</span>`}</div>` : ''}
        </div>
        <div class="dict-side">
          <div class="dict-stat">${fragment ? esc(I18N.t('dict.buildingBlock')) : sjabloon ? esc(I18N.t('dict.fillFirst')) : `${e.runCount || 0}× · ${esc(relTime(e.lastRun))}`}</div>
          <div class="dict-actions">
            ${draaibaar ? `<button class="term-btn" data-run="${esc(e.id)}" title="${esc(I18N.t('dict.runTitle'))}"><i class="ti ti-player-play" style="font-size:13px"></i> run</button>` : ''}
            ${draaibaar ? `<button class="term-btn" data-addbtn="${esc(e.id)}" title="${esc(I18N.t('dict.addAsButtonTitle'))}"><i class="ti ti-square-plus" style="font-size:13px"></i></button>` : ''}
            <button class="term-btn" data-copy="${esc(e.id)}" title="${esc(I18N.t('ctx.copy'))}"><i class="ti ti-copy" style="font-size:13px"></i></button>
            <button class="term-btn" data-edit="${esc(e.id)}" title="${esc(I18N.t('dict.editTitle'))}"><i class="ti ti-pencil" style="font-size:13px"></i></button>
            <button class="term-btn stop" data-del="${esc(e.id)}" title="${esc(I18N.t('ctx.delete'))}"><i class="ti ti-trash" style="font-size:13px"></i></button>
          </div>
        </div>
      </div>`
  }).join('')

  const byId = id => (history.entries || []).find(e => e.id === id)

  list.querySelectorAll('[data-fav]').forEach(b => b.onclick = async () => {
    const e = byId(b.dataset.fav)
    if (!e) return
    history = await window.api.updateHistory({ id: e.id, patch: { favorite: !e.favorite } })
    renderDictList()
  })
  list.querySelectorAll('[data-run]').forEach(b => b.onclick = () => {
    const e = byId(b.dataset.run)
    if (e) runFromDict(e, b.dataset.cwd || null)
  })
  list.querySelectorAll('[data-copy]').forEach(b => b.onclick = () => {
    const e = byId(b.dataset.copy)
    if (e) { navigator.clipboard.writeText(e.cmd); showToast(I18N.t('toast.copiedGeneric')) }
  })
  list.querySelectorAll('[data-addbtn]').forEach(b => b.onclick = () => openAddBtnModal(b.dataset.addbtn))
  list.querySelectorAll('[data-edit]').forEach(b => b.onclick = () => openDictModal(b.dataset.edit))
  list.querySelectorAll('[data-del]').forEach(b => b.onclick = async () => {
    const e = byId(b.dataset.del)
    if (!e) return
    if (!await vraagJaNee(I18N.t('dict.deleteConfirmTitle'), e.cmd, I18N.t('common.delete'), 'gevaar')) return
    history = await window.api.deleteHistory({ id: e.id })
    renderDictList(); renderSidebar()
  })
}

// Uitvoeren vanuit het woordenboek: naar de shell die bij dit commando hoort.
// 'beide' volgt het paneel waar je het laatst was (cmd of powershell).
async function runFromDict(entry, cwd) {
  // Commando's die schijven wissen of het systeem herstarten niet per ongeluk
  // met één klik laten starten.
  if (entry.danger && !await vraagJaNee(I18N.t('dict.dangerRunTitle'),
      (entry.note ? entry.note + ' ' : '') + I18N.t('dict.dangerRunConfirmSuffix'),
      I18N.t('dict.dangerRunButton'), 'gevaar', [entry.cmd])) return

  // Commando's van de app zelf (alles met een / ervoor, en `theme`) gaan niet
  // naar een shell, dus daar hoort ook geen werkmap bij.
  if (/^\s*\//.test(entry.cmd) || isThemaCommando(entry.cmd)) {
    setView('cmd')
    executeCmd(cmdContext(), entry.cmd, null)
    return
  }

  const shell = entryShell(entry)
  const viaPs = shell === 'powershell' || (shell === 'both' && lastShellView === 'ps')

  if (viaPs) {
    const psTarget = cwd || entry.lastCwd || (entry.cwds || [])[0]?.path || settings.ps?.cwd
    if (!psTarget) {
      showToast(I18N.t('ps.pickCwdFirstToast'))
      setView('ps')
      return
    }
    await setPsCwd(psTarget)
    setView('ps')
    executeCmd(psContext(), entry.cmd, null)
    return
  }

  const target = cwd || entry.lastCwd || (entry.cwds || [])[0]?.path || settings.cmd?.cwd
  if (!target) {
    showToast(I18N.t('cmd.pickCwdFirstToast'))
    setView('cmd')
    return
  }
  await setCmdCwd(target)
  setView('cmd')
  executeCmd(cmdContext(), entry.cmd, null)
}

// ── Woordenboek-modal ─────────────────────────────────────────────────────────
function openDictModal(id) {
  dictEditId = id || null
  const e = id ? (history.entries || []).find(x => x.id === id) : null
  document.getElementById('modal-dict-title').textContent = e ? I18N.t('modal.dict.editTitle') : I18N.t('modal.dict.title')
  document.getElementById('d-cmd').value   = e?.cmd   || ''
  document.getElementById('d-label').value = e?.label || ''
  document.getElementById('d-note').value  = e?.note  || ''
  const tagVeld = document.getElementById('d-tags')
  tagVeld.value = (e?.tags || []).join(', ')
  // De thema's die er al zijn aanbieden, zodat je er niet per ongeluk een
  // tweede variant naast typt.
  let lijst = document.getElementById('d-tags-lijst')
  if (!lijst) {
    lijst = document.createElement('datalist')
    lijst.id = 'd-tags-lijst'
    tagVeld.parentNode.appendChild(lijst)
    tagVeld.setAttribute('list', 'd-tags-lijst')
  }
  lijst.innerHTML = alleThemas().map(t => `<option value="${esc(t.naam)}"></option>`).join('')
  document.getElementById('d-fav').checked = !!e?.favorite
  zetDictShellKeuze(e ? entryShell(e) : 'cmd')
  document.getElementById('modal-dict').hidden = false
  focusField('d-cmd')
}

function dictShellKeuze() {
  const el = document.querySelector('#d-shell input:checked')
  const v = el && el.value
  return v === 'powershell' || v === 'both' ? v : 'cmd'
}

function zetDictShellKeuze(v) {
  const val = v === 'powershell' || v === 'both' ? v : 'cmd'
  document.querySelectorAll('#d-shell input[name="d-shell"]').forEach(r => {
    r.checked = r.value === val
  })
}

function closeDictModal() {
  document.getElementById('modal-dict').hidden = true
  dictEditId = null
  focusTerminalInput()
}

async function saveDictModal() {
  const cmd   = document.getElementById('d-cmd').value.trim()
  const label = document.getElementById('d-label').value.trim()
  const note  = document.getElementById('d-note').value.trim()
  const tags  = document.getElementById('d-tags').value.split(',').map(t => t.trim()).filter(Boolean)
  const fav   = document.getElementById('d-fav').checked
  const shell = dictShellKeuze()
  if (!cmd) { focusField('d-cmd'); return }

  const wasEdit = !!dictEditId
  history = wasEdit
    ? await window.api.updateHistory({ id: dictEditId, patch: { cmd, label, note, tags, favorite: fav, shell } })
    : await window.api.addHistory({ cmd, label, note, tags, favorite: fav, shell })

  closeDictModal()
  showToast(wasEdit ? I18N.t('toast.savedGeneric') : I18N.t('toast.addedToDict'))
  renderSidebar()
  if (view === 'dict') renderDictList()
  if (view === 'cmd')  renderCmdPanel()
  if (view === 'ps')   renderPsPanel()
}

// ── Bat-bestanden ─────────────────────────────────────────────────────────────
// Eigen sectie in de zijbalk. Alles staat in batState en niet in de DOM, want
// het paneel wordt bij elke wissel opnieuw opgebouwd — anders was je bewerking
// weg zodra je even naar cmd sprong.
const batState = {
  path: null,        // bestaand bestand dat bewerkt wordt (null = nieuw)
  mtime: null,       // wijzigingstijd bij het inladen
  dirty: false,      // zelf getypt sinds het laden
  content: '',
  name: '',
  sourceCmds: '',    // commando's waaruit het sjabloon is opgebouwd
  runFiles: [],      // bestanden die het bat-bestand moet uitvoeren
  warning: '',
  files: [],         // bat-bestanden in de huidige map
}

const BAT_DEFAULTS = {
  cd: true, stopOnError: true, pause: 'always',
  admin: false, log: false, timer: false, echo: false, hidden: false, icon: true, title: '',
}

// De sectie onthoudt zijn eigen map. De eerste keer beginnen we bij het actieve
// project, maar daarna volgt hij jou — niet andersom.
function batCwd() {
  if (settings.batCwd) return settings.batCwd
  const p = projects.find(x => x.id === activeId) || projects[0]
  const loc = p && (p.locations[p.activeLocation] || p.locations[0])
  return loc?.path || settings.cmd?.cwd || ''
}

async function setBatCwd(p) {
  if (!p) return
  settings.batCwd = p
  const rest = (settings.batRecentCwds || []).filter(x => x !== p)
  settings.batRecentCwds = [p, ...rest].slice(0, 12)
  await window.api.saveSettings(settings)
}

// Mappen voor de keuzelijst: eerder gebruikt plus de wortels van je projecten
function batCwdOptions() {
  const uit = []
  const zie = new Set()
  const push = (path, label) => {
    if (!path || zie.has(path)) return
    zie.add(path); uit.push({ path, label })
  }
  push(batCwd(), null)
  ;(settings.batRecentCwds || []).forEach(p => push(p, null))
  projects.forEach(p => {
    const loc = p.locations[p.activeLocation] || p.locations[0]
    if (loc?.path) push(loc.path, `${p.icon} ${p.name}`)
  })
  if (settings.cmd?.cwd) push(settings.cmd.cwd, I18N.t('cmd.sectionLabel'))
  return uit
}

const BAT_DEFAULT_OPTS = () => ({ ...BAT_DEFAULTS, ...(settings.bat || {}) })

// Regels die deze app zelf om je script heen zet. Ze worden bij het opnieuw
// opbouwen weer afgepeld, zodat je eigen inhoud niet steeds verdwijnt.
const BAT_KOPREGELS = /^(@?echo\s+(on|off)|setlocal\b.*|title\s.*|cd\s+\/d\s+".*"|set\s+"_LOG=.*|set\s+"_START=.*|echo\s+===\s+%DATE%.*|rem\s+(cd \/d|draait in de map|Zonder venster draaien|Beheerdersrechten nodig|Uitvoer komt naast|zet hier je commando).*)$/i
const BAT_STAARTREGELS = /^(echo\.|echo\s+Klaar\.|echo\s+Gestart om %_START%.*|echo\s+Log:\s*%_LOG%|pause|exit\s*\/b(\s+\d+)?|exit)$/i

// Slaat een `... (` … `)`-blok over en geeft de index erna terug.
function slaBlokOver(regels, i) {
  let diepte = 0
  for (; i < regels.length; i++) {
    const t = regels[i].trim()
    if (/\($/.test(t)) diepte++
    if (/^\)/.test(t)) { diepte--; if (diepte <= 0) return i + 1 }
  }
  return regels.length
}

// Haalt de eigenlijke commando's terug uit een bat-bestand. Werkt ook op
// bestanden die hier niet gemaakt zijn: wat niet als steiger herkend wordt,
// blijft gewoon staan — inclusief commentaar, labels en lege regels.
function extractBatBody(content) {
  let regels = String(content || '').replace(/\r\n/g, '\n').split('\n')

  // Alles vanaf ons foutblok valt af
  const mislukt = regels.findIndex(l => /^\s*:mislukt\s*$/i.test(l))
  if (mislukt >= 0) regels = regels.slice(0, mislukt)

  // Kop afpellen. Alleen bovenaan, zodat een `cd` midden in jouw script blijft.
  let i = 0
  while (i < regels.length) {
    const t = regels[i].trim()
    if (!t) { i++; continue }
    if (/^if not "%~1"=="_verborgen"\s*\($/i.test(t)) { i = slaBlokOver(regels, i); continue }
    if (/^net session\b/i.test(t)) {
      i++
      while (i < regels.length && !regels[i].trim()) i++
      if (i < regels.length && /^if errorlevel 1\s*\($/i.test(regels[i].trim())) i = slaBlokOver(regels, i)
      continue
    }
    if (BAT_KOPREGELS.test(t)) { i++; continue }
    break
  }
  regels = regels.slice(i)

  // Steigers op regelniveau
  const uit = []
  for (const raw of regels) {
    const t = raw.trim()
    if (/^if errorlevel 1 goto mislukt$/i.test(t)) continue
    if (/^echo \^>\s/i.test(t)) continue
    uit.push(raw.replace(/\s*>>\s*"%_LOG%"\s*2>&1\s*$/i, ''))
  }

  // Staart afpellen
  while (uit.length) {
    const t = uit[uit.length - 1].trim()
    if (!t || BAT_STAARTREGELS.test(t)) uit.pop()
    else break
  }

  return uit.join('\n').replace(/\n{3,}/g, '\n\n').trim()
}

// Na welke regels een foutcontrole zinnig is. Commentaar, labels, lege regels
// en blokconstructies overslaan: daar zou `if errorlevel 1 goto mislukt` de
// structuur van je script breken.
function isCheckableCommand(t) {
  if (!t) return false
  if (/^(rem\b|::)/i.test(t)) return false          // commentaar
  if (/^:/.test(t)) return false                    // label
  if (/\($/.test(t) || /^\)/.test(t)) return false  // begin/eind van een blok
  if (/^@?(if|for|goto|exit|setlocal|endlocal|set|title|pause|shift|cls|echo)\b/i.test(t)) return false
  return true
}

// Bouwt het sjabloon op uit de commando's plus de gekozen opties.
function buildBatTemplate(cmds, cwd, opts = {}) {
  const o = { ...BAT_DEFAULTS, ...opts }
  // Zonder venster is er niemand om op een toets te drukken; `pause` zou het
  // script dan onzichtbaar laten hangen. Hier afdwingen in plaats van alleen in
  // de UI, zodat het ook klopt als deze functie ergens anders aangeroepen wordt.
  if (o.hidden) o.pause = 'never'

  const regels = String(cmds || '').replace(/\r\n/g, '\n').split('\n')
  const heeftInhoud = regels.some(l => l.trim())
  const out = []

  out.push(o.echo ? '@echo on' : '@echo off')
  out.push('setlocal')
  if (o.title) out.push(`title ${o.title}`)

  // Zonder venster draaien kan niet vanuit het script zelf: Windows maakt de
  // console al aan vóórdat de eerste regel draait. Het bijgeleverde .vbs-bestand
  // start het script daarom van buitenaf, zonder console. In het script zelf
  // staat hier dus niets — een zelf-herstart gaf alleen maar extra geflits.
  if (o.admin) {
    // De verhoogde kopie ook verbergen als dat de bedoeling is. De UAC-vraag
    // zelf blijft altijd zichtbaar; dat is Windows.
    const args = o.hidden ? ' -WindowStyle Hidden' : ''
    out.push('',
      'rem Beheerdersrechten nodig: opnieuw starten via UAC als dat nog niet zo is.',
      'net session >nul 2>&1',
      'if errorlevel 1 (',
      '  echo Beheerdersrechten nodig - opnieuw starten...',
      `  powershell -NoProfile -Command "Start-Process -FilePath '%~f0'${args} -Verb RunAs"`,
      '  exit /b',
      ')')
  }

  out.push('')
  out.push(o.cd
    ? (cwd ? `cd /d "${cwd}"` : 'rem cd /d "C:\\pad\\naar\\map"')
    : 'rem draait in de map waar dit bestand staat')

  if (o.log) {
    out.push('',
      'rem Uitvoer komt naast dit bestand te staan, met dezelfde naam en .log',
      'set "_LOG=%~dpn0.log"',
      'echo === %DATE% %TIME% === >> "%_LOG%"')
  }
  if (o.timer) out.push('', 'set "_START=%TIME%"')

  out.push('')
  if (heeftInhoud) {
    // Regels blijven zoals ze zijn — commentaar, labels en lege regels ook.
    for (const raw of regels) {
      const t = raw.trim()
      if (!isCheckableCommand(t)) { out.push(raw); continue }
      out.push(o.log ? `echo ^> ${t}` : null)
      out.push(o.log ? `${raw} >> "%_LOG%" 2>&1` : raw)
      if (o.stopOnError) out.push('if errorlevel 1 goto mislukt')
    }
  } else {
    out.push("rem zet hier je commando's")
  }

  const body = out.filter(l => l !== null)
  body.push('', 'echo.')
  if (o.timer) body.push('echo Gestart om %_START%, klaar om %TIME%')
  if (o.log)   body.push('echo Log: %_LOG%')
  body.push('echo Klaar.')
  if (o.pause === 'always') body.push('pause')
  body.push('exit /b 0')

  // Bij 'stoppen bij fout' uit is er geen sprong naar :mislukt, dus dan hoeft
  // dat blok er ook niet te staan.
  if (o.stopOnError) {
    body.push('', ':mislukt', 'echo.', 'echo Er ging iets mis - zie de melding hierboven.')
    if (o.log) body.push('echo Log: %_LOG%')
    if (o.pause === 'always' || o.pause === 'onerror') body.push('pause')
    body.push('exit /b 1')
  }

  return body.join('\r\n')
}

// Los startbestand dat het script écht zonder venster start. Een .bat krijgt
// bij dubbelklikken altijd eerst een console van Windows; wscript.exe niet.
function buildHiddenLauncher(batName) {
  return [
    "' Start " + batName + ' volledig zonder venster.',
    "' Dubbelklik dit bestand in plaats van het bat-bestand zelf:",
    "' wscript.exe maakt geen console aan, dus er verschijnt niets in beeld.",
    'Set fso = CreateObject("Scripting.FileSystemObject")',
    'Set sh  = CreateObject("WScript.Shell")',
    'bat = fso.BuildPath(fso.GetParentFolderName(WScript.ScriptFullName), "' + batName + '")',
    "sh.Run \"\"\"\" & bat & \"\"\"\", 0, False",
    '',
  ].join('\r\n')
}

// "flutter build apk" -> "flutter-build-apk.bat"
function suggestBatName(cmds) {
  const first = String(cmds || '').split(/\r?\n/).map(l => l.trim()).find(Boolean) || 'script'
  const slug = first
    .replace(/["']/g, '')
    .replace(/[^\w.\- ]+/g, ' ')
    .trim()
    .split(/\s+/)
    .slice(0, 4)
    .join('-')
    .toLowerCase()
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
  return (slug || 'script') + '.bat'
}

function ensureBatExt(name) {
  const n = String(name || '').trim()
  if (!n) return ''
  return /\.(bat|cmd)$/i.test(n) ? n : n + '.bat'
}

// Het juiste commando per bestandstype. `call` is bij een ander bat-bestand
// essentieel: zonder call komt de besturing er niet meer terug en stopt jouw
// script zodra dat andere klaar is.
function runCommandForFile(p) {
  const q = `"${p}"`
  if (/\.(bat|cmd)$/i.test(p)) return `call ${q}`
  if (/\.ps1$/i.test(p))       return `powershell -NoProfile -ExecutionPolicy Bypass -File ${q}`
  if (/\.py$/i.test(p))        return `python ${q}`
  if (/\.(js|mjs|cjs)$/i.test(p)) return `node ${q}`
  if (/\.vbs$/i.test(p))       return `cscript //nologo ${q}`
  if (/\.(exe|com|msi)$/i.test(p)) return q
  // Onbekend type: door Windows laten openen met het bijbehorende programma
  return `start "" ${q}`
}

// De inhoud waaruit het sjabloon opgebouwd wordt. Toegevoegde bestanden zijn
// hier al in verwerkt, dus dit is simpelweg wat er staat.
function batAllCmds() { return batState.sourceCmds || '' }

// ── Sectie openen ─────────────────────────────────────────────────────────────
// Vanuit de zijbalk zonder argument, vanuit de bat-knop in de terminal mét de
// commando's die daar getypt zijn.
async function openBatView({ cmds = null } = {}) {
  if (cmds !== null && String(cmds).trim()) {
    newBatDraft(String(cmds))
  } else if (!batState.path && !batState.content) {
    newBatDraft('')
  }
  setView('bat')
}

function newBatDraft(cmds) {
  batState.path = null
  batState.mtime = null
  batState.dirty = false
  batState.sourceCmds = cmds || ''
  batState.runFiles = []
  batState.warning = ''
  batState.content = buildBatTemplate(batAllCmds(), batCwd(), BAT_DEFAULT_OPTS())
  batState.name = suggestBatName(cmds)
}

function setBatWarning(msg) {
  batState.warning = msg || ''
  const el = document.getElementById('bat-warn')
  if (!el) return
  el.textContent = batState.warning
  el.hidden = !batState.warning
}

// ── Paneel ────────────────────────────────────────────────────────────────────
async function renderBatPanel() {
  const panel = document.getElementById('bat-panel')
  if (!panel) return
  const cwd = batCwd()
  const o   = BAT_DEFAULT_OPTS()

  const cwdOptions = batCwdOptions()
    .map(c => `<option value="${esc(c.path)}" ${c.path === cwd ? 'selected' : ''}>${esc(c.label ? c.label + ' — ' + shortenPath(c.path, 40) : c.path)}</option>`)
    .join('') || `<option value="">${esc(I18N.t('cmd.noFolderChosenOption'))}</option>`

  const chk = (id, on, icon, labelKey, titleKey) =>
    `<label class="bat-opt" title="${esc(I18N.t(titleKey))}"><input type="checkbox" id="${id}" ${on ? 'checked' : ''} /> <i class="ti ${icon}"></i> ${esc(I18N.t(labelKey))}</label>`

  panel.innerHTML = `
    <div class="settings-header">
      <i class="ti ti-file-code" style="font-size:18px;color:var(--green)"></i>
      <span class="settings-header-title">${esc(I18N.t('bat.title'))}</span>
      <button class="btn-primary dict-add-btn" id="bat-new" title="${esc(I18N.t('bat.newFileButton'))}"><i class="ti ti-file-plus" style="font-size:13px"></i>${knopTekst(I18N.t('bat.newFileButton'))}</button>
    </div>

    <div class="dict-toolbar" data-krap>
      <label class="field-label" style="margin:0">${esc(I18N.t('bat.folderLabel'))}</label>
      <select class="loc-select" id="bat-cwd-select" style="flex:1">${cwdOptions}</select>
      <button class="btn-open-folder" id="bat-pick-dir" title="${esc(I18N.t('bat.pickFolderTitle'))}"><i class="ti ti-folder-search" style="font-size:14px"></i>${knopTekst(I18N.t('cmd.pickButton'))}</button>
      <button class="btn-open-folder" id="bat-open-dir" title="${esc(I18N.t('bat.openFolderTitle'))}"><i class="ti ti-folder-open" style="font-size:14px"></i>${knopTekst(I18N.t('project.openFolderButton'))}</button>
      <button class="btn-open-folder" id="bat-browse" title="${esc(I18N.t('bat.browseTitle'))}"><i class="ti ti-file-search" style="font-size:14px"></i>${knopTekst(I18N.t('bat.browseButton'))}</button>
    </div>

    <div class="bat-layout">
      <aside class="bat-files">
        <div class="bat-files-head" id="bat-files-head"></div>
        <div class="bat-file-list" id="bat-file-list"></div>
      </aside>

      <section class="bat-edit">
        <div class="bat-edit-head" data-krap>
          <span class="bat-edit-title" id="bat-edit-title"></span>
          <button class="term-btn" id="bat-reload" title="${esc(I18N.t('bat.reloadTitle'))}"><i class="ti ti-refresh" style="font-size:12px"></i>${knopTekst(I18N.t('bat.reloadButton'))}</button>
          <button class="term-btn" id="bat-regen" title="${esc(I18N.t('bat.regenTitle'))}"><i class="ti ti-wand" style="font-size:12px"></i>${knopTekst(I18N.t('bat.regenButton'))}</button>
        </div>

        <div class="bat-opts">
          ${chk('bo-pause',     o.pause === 'always',  'ti-player-pause',   'bat.opt.pauseLabel',    'bat.opt.pauseTitle')}
          ${chk('bo-pause-err', o.pause === 'onerror', 'ti-alert-triangle', 'bat.opt.pauseErrLabel', 'bat.opt.pauseErrTitle')}
          ${chk('bo-stop',      o.stopOnError,         'ti-hand-stop',      'bat.opt.stopLabel',     'bat.opt.stopTitle')}
          ${chk('bo-cd',        o.cd,                  'ti-folder',         'bat.opt.cdLabel',       'bat.opt.cdTitle')}
          ${chk('bo-admin',     o.admin,               'ti-shield-lock',    'bat.opt.adminLabel',    'bat.opt.adminTitle')}
          ${chk('bo-log',       o.log,                 'ti-file-text',      'bat.opt.logLabel',      'bat.opt.logTitle')}
          ${chk('bo-timer',     o.timer,               'ti-clock',          'bat.opt.timerLabel',    'bat.opt.timerTitle')}
          ${chk('bo-echo',      o.echo,                'ti-eye',            'bat.opt.echoLabel',     'bat.opt.echoTitle')}
          ${chk('bo-icon',      o.icon,                'ti-photo',          'bat.opt.iconLabel',     'bat.opt.iconTitle')}
          ${chk('bo-hidden',    o.hidden,              'ti-eye-off',        'bat.opt.hiddenLabel',   'bat.opt.hiddenTitle')}
          <button class="bat-opt bat-opt-btn" id="bo-add-run" title="${esc(I18N.t('bat.addRunFileTitle'))}">
            <i class="ti ti-player-play"></i> ${esc(I18N.t('bat.addRunFileButton'))}
          </button>
          <label class="bat-opt bat-opt-title" title="${esc(I18N.t('bat.windowTitleFieldTitle'))}">
            <i class="ti ti-tag"></i>
            <input class="field" id="bo-title" value="${esc(o.title || '')}" placeholder="${esc(I18N.t('bat.windowTitlePlaceholder'))}" />
          </label>
        </div>
        <div class="bat-runfiles" id="bat-runfiles" hidden></div>

        <textarea class="field mono bat-editor" id="bat-content" spellcheck="false"></textarea>

        <div class="bat-warn" id="bat-warn" hidden></div>

        <div class="bat-edit-foot" data-krap>
          <input class="field mono bat-name" id="bat-name" placeholder="${esc(I18N.t('bat.namePlaceholder'))}" />
          <button class="btn-run" id="bat-test" title="${esc(I18N.t('bat.testTitle'))}">
            <i class="ti ti-player-play" style="font-size:13px"></i>${knopTekst(I18N.t('bat.testButton'))}
          </button>
          <button class="btn-exe" id="bat-exe" title="${esc(I18N.t('bat.exeTitle'))}">
            <i class="ti ti-app-window" style="font-size:13px"></i>${knopTekst(I18N.t('bat.exeButton'))}
          </button>
          <button class="btn-primary" id="bat-save" title="${esc(I18N.t('common.save'))}"><i class="ti ti-device-floppy" style="font-size:13px"></i>${knopTekst(I18N.t('common.save'))}</button>
        </div>
      </section>
    </div>
  `

  document.getElementById('bat-content').value = batState.content
  document.getElementById('bat-name').value    = batState.name
  setBatWarning(batState.warning)
  renderBatRunFiles()
  updateBatEditTitle()
  syncBatPauseState()
  wireBatPanel()
  keurKrappeBalken()
  await refreshBatFiles()

  const ta = document.getElementById('bat-content')
  requestAnimationFrame(() => { ta.focus(); ta.selectionStart = ta.selectionEnd = ta.value.length })
}

function updateBatEditTitle() {
  const el = document.getElementById('bat-edit-title')
  if (!el) return
  el.innerHTML = batState.path
    ? `<i class="ti ti-pencil"></i> ${esc(batState.path.split(/[\\/]/).pop())}`
    : `<i class="ti ti-file-plus"></i> ${esc(I18N.t('bat.newFileButton'))}`
}

async function refreshBatFiles() {
  const cwd = batCwd()
  let files = []
  try { files = await window.api.listBats(cwd) } catch {}
  batState.files = files || []
  renderBatFileList()
}

function renderBatFileList() {
  const list = document.getElementById('bat-file-list')
  const head = document.getElementById('bat-files-head')
  if (!list) return

  head.textContent = batState.files.length
    ? I18N.t('bat.filesCountInFolder', { files: I18N.t(batState.files.length === 1 ? 'browser.status.fileOne' : 'browser.status.fileMany', { n: batState.files.length }) })
    : I18N.t('bat.noFilesInFolder')

  if (!batState.files.length) {
    list.innerHTML = `<div class="bat-files-empty">${I18N.t('bat.emptyHint', { btn: `<strong>${esc(I18N.t('bat.newFileButton'))}</strong>` })}</div>`
    return
  }

  list.innerHTML = batState.files.map(f => `
    <div class="bat-file ${f.path === batState.path ? 'active' : ''}" data-file="${esc(f.path)}" title="${esc(f.path)}">
      <i class="ti ti-file-code"></i>
      <div class="bat-file-main">
        <div class="bat-file-name">${esc(f.name)}</div>
        <div class="bat-file-meta">${esc(relTime(f.mtime))}</div>
      </div>
      <button class="bat-file-btn" data-run-file="${esc(f.path)}" title="${esc(I18N.t('bat.runInWindowTitle'))}"><i class="ti ti-player-play"></i></button>
      <button class="bat-file-btn danger" data-del-file="${esc(f.path)}" title="${esc(I18N.t('ctx.delete'))}"><i class="ti ti-trash"></i></button>
    </div>`).join('')

  list.querySelectorAll('[data-file]').forEach(row => {
    row.onclick = (e) => {
      if (e.target.closest('[data-run-file],[data-del-file]')) return
      loadBatFile(row.dataset.file)
    }
  })
  list.querySelectorAll('[data-run-file]').forEach(b => b.onclick = async () => {
    const r = await window.api.testBat({ dir: batCwd(), name: 'run', content: `call "${b.dataset.runFile}"` })
    if (!r?.ok) showToast(I18N.t('bat.startFailedToast'))
    else batToastNaStart(r, 'bat.startedToast')
  })
  list.querySelectorAll('[data-del-file]').forEach(b => b.onclick = async () => {
    const naam = b.dataset.delFile.split(/[\\/]/).pop()
    if (!await vraagJaNee(I18N.t('bat.deleteFileConfirmTitle', { name: naam }), I18N.t('bat.deleteFileConfirmText'), I18N.t('common.delete'), 'gevaar')) return
    const r = await window.api.deleteBat(b.dataset.delFile)
    if (!r || !r.ok) { setBatWarning(I18N.t('error.deleteFailedPrefix') + (r?.reason || I18N.t('common.unknownError'))); return }
    if (batState.path === b.dataset.delFile) { newBatDraft(''); syncBatToDom() }
    showToast(I18N.t('bat.fileDeletedToast', { name: naam }))
    await refreshBatFiles()
  })
}

// De gekozen bestanden als verwijderbare regels onder de opties
function renderBatRunFiles() {
  const box = document.getElementById('bat-runfiles')
  if (!box) return
  if (!batState.runFiles.length) { box.hidden = true; box.innerHTML = ''; return }

  box.hidden = false
  box.innerHTML = batState.runFiles.map((p, i) => `
    <div class="bat-runfile" title="${esc(runCommandForFile(p))}">
      <i class="ti ti-player-play"></i>
      <span class="bat-runfile-name">${esc(p.split(/[\\/]/).pop())}</span>
      <span class="bat-runfile-path mono">${esc(shortenPath(p, 46))}</span>
      <button class="cmdvis-del" data-del-run="${i}" title="${esc(I18N.t('clipboard.removeFromListTitle'))}"><i class="ti ti-x"></i></button>
    </div>`).join('')

  box.querySelectorAll('[data-del-run]').forEach(btn => {
    btn.onclick = () => {
      const weg = runCommandForFile(batState.runFiles[parseInt(btn.dataset.delRun)])
      batState.runFiles.splice(parseInt(btn.dataset.delRun), 1)
      const over = extractBatBody(document.getElementById('bat-content').value)
        .split('\n').filter(l => l.trim() !== weg).join('\n')
      regenerateBat({ cmds: over })
    }
  })
}

function syncBatToDom() {
  const ta = document.getElementById('bat-content')
  const nm = document.getElementById('bat-name')
  if (ta) ta.value = batState.content
  if (nm) nm.value = batState.name
  updateBatEditTitle()
  renderBatRunFiles()
  renderBatFileList()
  setBatWarning(batState.warning)
}

// ── Opties ────────────────────────────────────────────────────────────────────
function readBatOpts() {
  const on = id => !!document.getElementById(id)?.checked
  return {
    cd:          on('bo-cd'),
    stopOnError: on('bo-stop'),
    pause:       on('bo-hidden') ? 'never' : (on('bo-pause') ? 'always' : (on('bo-pause-err') ? 'onerror' : 'never')),
    admin:       on('bo-admin'),
    log:         on('bo-log'),
    timer:       on('bo-timer'),
    echo:        on('bo-echo'),
    hidden:      on('bo-hidden'),
    icon:        on('bo-icon'),
    title:       document.getElementById('bo-title')?.value.trim() || '',
  }
}

// Zonder venster kun je nergens op 'druk op een toets' klikken, dus dan mogen de
// pauze-opties niet aan staan.
function syncBatPauseState() {
  const verborgen = !!document.getElementById('bo-hidden')?.checked

  ;['bo-pause', 'bo-pause-err'].forEach(id => {
    const el = document.getElementById(id)
    if (!el) return
    if (verborgen) el.checked = false
    el.disabled = verborgen
    el.closest('.bat-opt')?.classList.toggle('uit', verborgen)
  })
}

// Opnieuw opbouwen na een optiewijziging. Heb je zelf in het tekstvak zitten
// typen, dan eerst vragen — anders gooi je die aanpassingen zomaar weg.
// Bouwt het sjabloon opnieuw op. De inhoud wordt eerst uit het tekstvak
// teruggehaald, dus je commando's blijven staan — ook bij een bestand dat niet
// door deze app gemaakt is.
function regenerateBat({ cmds = null } = {}) {
  const opts = readBatOpts()
  settings.bat = { ...(settings.bat || {}), ...opts }
  window.api.saveSettings(settings)

  const huidig = document.getElementById('bat-content')?.value ?? batState.content
  batState.sourceCmds = cmds !== null ? cmds : extractBatBody(huidig)
  batState.content = buildBatTemplate(batAllCmds(), batCwd(), opts)
  batState.dirty = false
  document.getElementById('bat-content').value = batState.content
  renderBatRunFiles()
  return true
}

// ── Bestanden laden, opslaan, proefdraaien ────────────────────────────────────
// Leest het bestand altijd opnieuw van schijf, dus bewerkingen die je buiten de
// app hebt gedaan komen mee.
async function loadBatFile(filePath) {
  if (batState.dirty && !await vraagJaNee(I18N.t('bat.openOtherConfirmTitle'), I18N.t('bat.unsavedLostText'), I18N.t('project.openFolderButton'))) return false

  const r = await window.api.readBat(filePath)
  if (!r || !r.ok) { setBatWarning(I18N.t('bat.cannotOpenFileWarning')); return false }

  batState.path    = filePath
  batState.mtime   = r.mtime ?? null
  batState.dirty   = false
  batState.content = r.content
  batState.name    = filePath.split(/[\\/]/).pop()
  batState.warning = ''
  // De commando's uit het bestand worden de bron voor 'sjabloon opnieuw', zodat
  // een optie aanpassen je script niet leegveegt.
  batState.sourceCmds = extractBatBody(r.content)
  batState.runFiles = []

  syncBatToDom()
  return true
}

async function batChangedOnDisk() {
  if (!batState.path || batState.mtime == null) return false
  const st = await window.api.batStat(batState.path)
  return !!(st && st.ok && st.mtime !== batState.mtime)
}

// Bij terugkeer naar de app controleren of het bestand elders is bijgewerkt.
async function checkBatFreshness() {
  if (view !== 'bat' || !batState.path) return
  if (!(await batChangedOnDisk())) return

  const naam = batState.path.split(/[\\/]/).pop()
  if (!batState.dirty) {
    const pad = batState.path
    batState.dirty = false
    const r = await window.api.readBat(pad)
    if (r && r.ok) {
      batState.content = r.content
      batState.mtime = r.mtime ?? null
      syncBatToDom()
      setBatWarning(I18N.t('bat.changedElsewhereReloadedWarning', { name: naam }))
    }
  } else {
    setBatWarning(I18N.t('bat.changedElsewhereDirtyWarning'))
  }
}

async function saveBatFile() {
  const name = ensureBatExt(document.getElementById('bat-name').value)
  const dir  = batCwd()
  const body = document.getElementById('bat-content').value

  if (!name) { setBatWarning(I18N.t('bat.nameRequiredWarning')); focusField('bat-name'); return }
  if (!dir)  { setBatWarning(I18N.t('bat.pickFolderFirstWarning')); return }

  const sep      = dir.includes('/') && !dir.includes('\\') ? '/' : '\\'
  const filePath = dir.replace(/[\\/]+$/, '') + sep + name

  // Bestaand bestand overschrijven alleen na bevestiging — behalve als je dat
  // bestand juist aan het bewerken bent.
  if (filePath !== batState.path && await window.api.batExists(filePath)) {
    if (!await vraagJaNee(I18N.t('bat.overwriteConfirmTitle', { name }), I18N.t('bat.overwriteConfirmText'), I18N.t('bat.overwriteConfirmButton'), 'gevaar')) return
  }
  // Elders bijgewerkt terwijl je hier zat: niet stilletjes overschrijven.
  if (filePath === batState.path && await batChangedOnDisk()) {
    if (!await vraagJaNee(I18N.t('bat.changedElsewhereConfirmTitle', { name }),
      I18N.t('bat.changedElsewhereConfirmText'),
      I18N.t('bat.changedElsewhereConfirmButton'), 'gevaar')) return
  }

  const r = await window.api.saveBat({ filePath, content: body })
  if (!r || !r.ok) {
    setBatWarning(r?.reason === 'nodir' ? I18N.t('bat.folderMissingWarning') : I18N.t('error.saveFailedPrefix') + (r?.reason || I18N.t('common.unknownError')))
    return
  }

  batState.path    = filePath
  batState.mtime   = r.mtime ?? null
  batState.content = body
  batState.name    = name
  batState.dirty   = false
  updateBatEditTitle()

  // Bij 'zonder venster' hoort een starter: dubbelklik je het bat-bestand zelf,
  // dan geeft Windows er hoe dan ook eerst een console bij. wscript.exe niet,
  // dus daarmee is het werkelijk onzichtbaar. De hint in het paneel legt al uit
  // welk bestand je moet starten, dus daar hoeft geen melding meer bij.
  if (readBatOpts().hidden) {
    const vbsNaam = name.replace(/\.(bat|cmd)$/i, '') + '-verborgen.vbs'
    await window.api.saveBat({
      filePath: dir.replace(/[\\/]+$/, '') + sep + vbsNaam,
      content: buildHiddenLauncher(name),
    })
  }

  setBatWarning('')
  showToast(I18N.t('bat.savedToast', { name }))
  await refreshBatFiles()
}

async function testBatNow() {
  const content = document.getElementById('bat-content').value
  if (!content.trim()) { setBatWarning(I18N.t('bat.nothingToRunWarning')); return }
  const r = await window.api.testBat({
    dir: batCwd(), name: document.getElementById('bat-name').value.trim(), content,
  })
  if (!r || !r.ok) { setBatWarning(I18N.t('bat.testFailedPrefix') + (r?.reason || I18N.t('common.unknownError'))); return }
  setBatWarning('')
  batToastNaStart(r, 'bat.testStartedToast')
}

// ── Knoppen in het paneel ─────────────────────────────────────────────────────
function wireBatPanel() {
  const $ = id => document.getElementById(id)

  $('bat-cwd-select').onchange = async (e) => {
    if (!e.target.value) return
    await setBatCwd(e.target.value)
    renderBatPanel()
  }
  $('bat-pick-dir').onclick = async () => {
    const picked = await window.api.pickFolder()
    if (!picked) return
    await setBatCwd(picked)
    renderBatPanel()
  }
  $('bat-open-dir').onclick = () => { const c = batCwd(); if (c) window.api.openFolder(c) }
  $('bat-browse').onclick = async () => {
    const picked = await window.api.pickBat(batCwd())
    if (!picked) return
    const map = picked.slice(0, picked.length - picked.split(/[\\/]/).pop().length - 1)
    if (map && map !== batCwd()) { await setBatCwd(map); await renderBatPanel() }
    await loadBatFile(picked)
    await refreshBatFiles()
  }

  $('bat-new').onclick = async () => {
    if (batState.dirty && !await vraagJaNee(I18N.t('bat.newFileConfirmTitle'), I18N.t('bat.unsavedLostText'), I18N.t('bat.newFileConfirmButton'))) return
    newBatDraft(batState.sourceCmds)
    syncBatToDom()
    focusField('bat-content')
  }

  $('bat-reload').onclick = async () => {
    if (!batState.path) { setBatWarning(I18N.t('bat.noOpenFileWarning')); return }
    if (batState.dirty && !await vraagJaNee(I18N.t('bat.reloadConfirmTitle'), I18N.t('bat.reloadUnsavedText'), I18N.t('bat.reloadButton'))) return
    batState.dirty = false
    if (await loadBatFile(batState.path)) showToast(I18N.t('bat.reloadedToast'))
  }
  $('bat-regen').onclick = () => { regenerateBat(); showToast(I18N.t('bat.regenToast')) }

  $('bat-content').addEventListener('input', (e) => {
    batState.dirty = true
    batState.content = e.target.value
  })
  $('bat-name').addEventListener('input', (e) => { batState.name = e.target.value })

  ;['bo-cd', 'bo-stop', 'bo-admin', 'bo-log', 'bo-timer', 'bo-echo'].forEach(id => {
    $(id).onchange = () => regenerateBat()
  })
  $('bo-hidden').onchange = () => { syncBatPauseState(); regenerateBat() }
  // Deze optie verandert het script niet, alleen wat er bij het exporteren
  // gebeurt — dus alleen onthouden, niet het sjabloon opnieuw opbouwen.
  $('bo-icon').onchange = () => {
    settings.bat = { ...(settings.bat || {}), ...readBatOpts() }
    window.api.saveSettings(settings)
  }
  // De twee pauze-vinkjes sluiten elkaar uit
  $('bo-pause').onchange = (e) => {
    if (e.target.checked) $('bo-pause-err').checked = false
    regenerateBat()
  }
  $('bo-pause-err').onchange = (e) => {
    if (e.target.checked) $('bo-pause').checked = false
    regenerateBat()
  }
  $('bo-title').addEventListener('change', () => regenerateBat())

  $('bo-add-run').onclick = async () => {
    const gekozen = await window.api.pickRunFiles(batCwd())
    if (!gekozen || !gekozen.length) return

    const nieuw = gekozen.filter(p => !batState.runFiles.includes(p))
    if (!nieuw.length) { showToast(I18N.t('bat.alreadyAddedToast')); return }
    batState.runFiles.push(...nieuw)

    const huidig = extractBatBody($('bat-content').value)
    regenerateBat({ cmds: (huidig ? huidig + '\n' : '') + nieuw.map(runCommandForFile).join('\n') })
    showToast(nieuw.length === 1 ? I18N.t('bat.addedOneToast', { name: nieuw[0].split(/[\\/]/).pop() }) : I18N.t('bat.addedManyToast', { count: nieuw.length }))
  }

  $('bat-test').onclick = () => testBatNow()
  $('bat-save').onclick = () => saveBatFile()
  $('bat-exe').onclick  = () => makeExeFromBat()
}

// ── Exporteren naar exe ───────────────────────────────────────────────────────
async function makeExeFromBat() {
  const inhoud = document.getElementById('bat-content').value
  if (!inhoud.trim()) { setBatWarning(I18N.t('bat.nothingToPackWarning')); return }

  // Eén keer uitleggen wat je wel en niet krijgt; daarna niet meer zeuren.
  if (!settings.batExeWarned) {
    const akkoord = await vraagJaNee(
      I18N.t('bat.exeWrapperTitle'),
      I18N.t('bat.exeWrapperText'), I18N.t('bat.exeWrapperButton'), 'primair',
      [I18N.t('bat.exeWrapperBullet1'),
       I18N.t('bat.exeWrapperBullet2'),
       I18N.t('bat.exeWrapperBullet3')])
    if (!akkoord) return
    settings.batExeWarned = true
    window.api.saveSettings(settings)
  }

  const bestandsnaam = ensureBatExt(document.getElementById('bat-name').value) || 'script.bat'
  const naam = bestandsnaam.replace(/\.(bat|cmd)$/i, '')
  const exe = await window.api.saveAs({
    title: I18N.t('bat.saveExeDialogTitle'),
    defaultPath: batCwd().replace(/[\\/]+$/, '') + '\\' + naam + '.exe',
    name: I18N.t('bat.saveExeDialogName'), extensions: ['exe'],
  })
  if (!exe) return

  const opts = { ...BAT_DEFAULTS, ...(settings.bat || {}) }

  // Staat de icoon-optie aan, dan meteen de kiezer; anders overslaan zonder vraag.
  const iconPath = opts.icon ? await window.api.pickIcon(batCwd()) : null
  setBatWarning(I18N.t('bat.buildingWarning'))
  // De inhoud van de editor gaat rechtstreeks mee; opslaan is niet nodig.
  const r = await window.api.makeExe({
    content: inhoud, isCmd: /\.cmd$/i.test(bestandsnaam),
    exePath: exe, iconPath,
    admin: !!opts.admin,
    hideWindow: !!opts.hidden,
  })

  if (!r || !r.ok) {
    const uitleg = {
      geeniexpress: I18N.t('bat.exeErrorNoIexpress'),
      nowork:       I18N.t('bat.exeErrorNoWork'),
      nooutput:     I18N.t('bat.exeErrorNoOutput'),
      notfound:     I18N.t('bat.exeErrorNotFound'),
    }[r?.reason]
    setBatWarning(I18N.t('bat.exeFailedPrefix') + (uitleg || r?.reason || I18N.t('common.unknownError')))
    return
  }
  // De exe staat er; alleen het icoon kan nog misgaan zonder dat de rest faalt.
  if (r.iconWarning) {
    setBatWarning(I18N.t('bat.exeIconWarningPrefix') + r.iconWarning)
  } else if (r.iconCount) {
    // Bevestigd door het bestand daarna opnieuw in te lezen.
    setBatWarning(I18N.t('bat.iconInFileSummary', { count: r.iconCount, word: I18N.t(r.iconCount === 1 ? 'bat.iconInFileOne' : 'bat.iconInFileMany') })
      + (r.cacheVervers
        ? I18N.t('bat.iconCacheRefreshedSuffix')
        : I18N.t('bat.iconCacheStaleSuffix')))
  } else {
    setBatWarning('')
  }
  showToast(I18N.t('bat.exeCreatedToast', { name: exe.split(/[\\/]/).pop() }))
}

// ── Bat-bestand naar binnen slepen ────────────────────────────────────────────
// Een .bat of .cmd op het venster laten vallen opent 'm meteen in de editor.
function setupBatDrop() {
  const overlay = document.getElementById('drop-overlay')
  let depth = 0

  const isBatDrag = (e) => {
    const items = e.dataTransfer?.items
    if (items && items.length) return [...items].some(i => i.kind === 'file')
    return [...(e.dataTransfer?.types || [])].includes('Files')
  }

  document.addEventListener('dragenter', (e) => {
    if (!isBatDrag(e)) return
    e.preventDefault()
    depth++
    overlay?.removeAttribute('hidden')
  })
  document.addEventListener('dragover', (e) => {
    if (!isBatDrag(e)) return
    e.preventDefault()
    e.dataTransfer.dropEffect = 'copy'
  })
  document.addEventListener('dragleave', () => {
    depth = Math.max(0, depth - 1)
    if (!depth) overlay?.setAttribute('hidden', '')
  })

  document.addEventListener('drop', async (e) => {
    depth = 0
    overlay?.setAttribute('hidden', '')
    const files = [...(e.dataTransfer?.files || [])]
    if (!files.length) return
    e.preventDefault()

    // Electron 32+ kent geen File.path meer; het pad komt uit de preload.
    const paths = files.map(f => window.api.getFilePath(f)).filter(Boolean)
    const bat   = paths.find(p => /\.(bat|cmd)$/i.test(p))

    if (!bat) {
      showToast(paths.length ? I18N.t('bat.dropOnlyBatCmdToast') : I18N.t('bat.dropPathReadFailedToast'))
      return
    }

    // Naar de map van het gesleepte bestand, zodat de lijst ernaast klopt
    const map = bat.slice(0, bat.length - bat.split(/[\\/]/).pop().length - 1)
    if (map && map !== batCwd()) await setBatCwd(map)

    await openBatView()
    if (await loadBatFile(bat)) {
      await refreshBatFiles()
      showToast(I18N.t('browser.openedToast', { name: bat.split(/[\\/]/).pop() }))
    }
  })
}

// ── Commando als knop aan een project hangen ──────────────────────────────────
let addBtnEntryId = null

function openAddBtnModal(entryId) {
  const e = (history.entries || []).find(x => x.id === entryId)
  if (!e) return
  if (!projects.length) { showToast(I18N.t('addBtn.needProjectFirstToast')); return }

  addBtnEntryId = entryId
  document.getElementById('addbtn-cmd').textContent = e.cmd
  document.getElementById('addbtn-label').value = e.label || e.cmd

  const sel = document.getElementById('addbtn-proj')
  sel.innerHTML = projects.map(p =>
    `<option value="${esc(p.id)}" ${p.id === activeId ? 'selected' : ''}>${p.icon} ${esc(p.name)}</option>`).join('')

  document.getElementById('modal-addbtn').hidden = false
  focusField('addbtn-label')
}

function closeAddBtnModal() {
  document.getElementById('modal-addbtn').hidden = true
  addBtnEntryId = null
  focusTerminalInput()
}

function saveAddBtnModal() {
  const e = (history.entries || []).find(x => x.id === addBtnEntryId)
  if (!e) { closeAddBtnModal(); return }
  const p = projects.find(x => x.id === document.getElementById('addbtn-proj').value)
  if (!p) { closeAddBtnModal(); return }

  const label = document.getElementById('addbtn-label').value.trim() || e.cmd

  p.customCmds = p.customCmds || []
  if (p.customCmds.some(c => c.cmd === e.cmd)) {
    showToast(I18N.t('addBtn.alreadyThereToast'))
    closeAddBtnModal()
    return
  }
  p.customCmds.push({
    id: 'c_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
    cmd: e.cmd, label, section: 'run', icon: 'ti-player-play',
  })

  saveProjects()
  closeAddBtnModal()
  showToast(I18N.t('addBtn.addedToProjectToast', { project: p.name }))
  vraagProjectHertekenen()
}

// ── Settings panel ────────────────────────────────────────────────────────────
// ── Accounts ─────────────────────────────────────────────────────────────────
// Gescheiden inhoud, geen beveiliging — zie de uitleg in accounts.js en de
// tekst die onder het blok in de instellingen staat.
let accounts = []
let actiefAccount = ''
let accountPinNodig = false
// Staat er een inlog open? Zolang dat zo is houdt de achterstandvraag zich
// stil: ze delen één venster, en dooreen vragen kost je je pincode. Een teller
// en geen ja/nee, want inloggen kan geneste stappen hebben (kiezen, dan de
// pincode van het account waar je heen wisselt).
let inlogBezig = 0

// Een pincode vragen. Twee keer bij het instellen, zodat een typefout je niet
// buitensluit uit je eigen account.
async function vraagPin(titel, tekst, okLabel) {
  const pin = await vraagTekst({ titel, tekst, verborgen: true, placeholder: '••••', okLabel })
  return pin === null ? null : String(pin).trim()
}

async function vraagNieuwePin(titel) {
  for (;;) {
    const een = await vraagPin(titel, I18N.t('accounts.pinNieuwTekst', { min: Accounts.PIN_MIN }), I18N.t('common.next'))
    if (een === null) return null
    if (!Accounts.geldigePin(een)) { await meldKort(titel, I18N.t('accounts.pinOngeldig')); continue }
    const twee = await vraagPin(titel, I18N.t('accounts.pinHerhaal'), I18N.t('common.save'))
    if (twee === null) return null
    if (een !== twee) { await meldKort(titel, I18N.t('accounts.pinVerschilt')); continue }
    return een
  }
}

// Vragen om de pincode van een bestaand account. Drie pogingen: daarna is het
// duidelijk dat je het niet weet, en blijven vragen helpt niemand.
async function vraagBestaandePin(account) {
  for (let poging = 1; poging <= 3; poging++) {
    const pin = await vraagPin(
      I18N.t('accounts.pinVragenTitel', { naam: account.naam }),
      poging === 1 ? I18N.t('accounts.pinVragenTekst') : I18N.t('accounts.pinFout', { over: 4 - poging }),
      I18N.t('accounts.inloggen'))
    if (pin === null) return null
    const r = await window.api.accountCheck({ id: account.id, pin })
    if (r && r.ok) return pin
  }
  await meldKort(I18N.t('accounts.pinVragenTitel', { naam: account.naam }), I18N.t('accounts.pinOp'))
  return null
}

// Het git-account meeschakelen met het app-account. Dit is waar het om begon:
// wissel je van account, dan commit en push je als die persoon — en niet als
// degene die er toevallig het laatst was.
// Inloggen bij GitHub zonder de omweg via cmd. `gh auth login --web` opent je
// browser en toont een code; er gaat nooit een wachtwoord door deze app heen,
// en er komt geen token in beeld dat iemand kan meelezen.
// Naam, adres en GitHub-account: de drie dingen die bepalen onder wiens naam
// je commit en met wiens account je pusht. In één keer vragen, want los van
// elkaar zijn ze onaf.
async function vraagGitIdentiteit(accountNaam, huidig) {
  // Eerst aanbieden om het op te halen. Wie is ingelogd bij GitHub hoeft dan
  // niets te typen — en een overgetypt e-mailadres met een tikfout is precies
  // hoe je commits niet meer aan je account gekoppeld worden.
  const opgehaald = await haalGitIdentiteitOp(accountNaam)
  if (opgehaald === false) return null        // afgebroken: helemaal stoppen
  if (opgehaald) return opgehaald             // opgehaald bij GitHub
  // null: zelf invullen, of ophalen lukte niet — dan gewoon vragen.

  const naam = await vraagTekst({
    titel: I18N.t('accounts.gitTitel', { naam: accountNaam }),
    tekst: I18N.t('accounts.gitNaamTekst'),
    waarde: huidig.gitNaam || accountNaam || '',
    placeholder: 'jouw naam',
    okLabel: I18N.t('common.next'),
  })
  if (naam === null || !naam) return null

  const email = await vraagTekst({
    titel: I18N.t('accounts.gitTitel', { naam: accountNaam }),
    tekst: I18N.t('accounts.gitEmailTekst'),
    waarde: huidig.gitEmail || '',
    placeholder: 'jij@voorbeeld.nl',
    okLabel: I18N.t('common.next'),
  })
  if (email === null || !email) return null

  // Het GitHub-account mag leeg blijven: niet iedereen pusht ergens heen, en
  // dan is een verplicht veld alleen maar in de weg.
  const gh = await vraagTekst({
    titel: I18N.t('accounts.gitTitel', { naam: accountNaam }),
    tekst: I18N.t('accounts.gitGhTekst'),
    waarde: huidig.ghGebruiker || '',
    placeholder: 'gebruikersnaam (mag leeg)',
    okLabel: I18N.t('common.save'),
  })
  if (gh === null) return null

  return { gitNaam: naam, gitEmail: email, ghGebruiker: gh }
}

// Probeert de identiteit bij GitHub op te halen. Geeft null terug als dat niet
// kan of als de gebruiker het liever zelf invult — dan volgt de gewone vraag.
// De GitHub-CLI installeren, alleen als je erom vraagt. Nooit bij het
// opstarten en nooit stilletjes: software installeren op iemands pc is een
// beslissing van die persoon, niet van een launcher.
// De code die gh toont, in een venster in plaats van in een terminal waar je
// hem niet kunt selecteren. Met een knop die hem op je klembord zet en de
// juiste pagina opent.
let ghCodeVenster = null
let ghKopieerLink = false

// Zorgt dat er een bruikbaar GitHub-account klaarstaat, of geeft eerlijk terug
// dat het er niet is. Drie situaties, elk met een uitweg:
//   gh ontbreekt      -> aanbieden te installeren
//   niet ingelogd     -> inloggen via de browser
//   geen account      -> naar github.com om er een te maken
//
// Geeft true (klaar), false (verder zonder gh) of 'gestopt' (afgebroken).
async function zorgVoorGithub() {
  let st = { geinstalleerd: false, ingelogd: false }
  try { st = await window.api.gitGhStatus() } catch {}
  if (st.ingelogd) return true

  const keuze = await vraagKeuze({
    titel: I18N.t('git.zorg.titel'),
    tekst: I18N.t(st.geinstalleerd ? 'git.zorg.tekstNietIngelogd' : 'git.zorg.tekstGeenGh'),
    knoppen: [
      { label: I18N.t('common.cancel'), waarde: '' },
      { label: I18N.t('git.zorg.geenAccount'), waarde: 'nieuw' },
      { label: I18N.t('git.zorg.zelfDoen'), waarde: 'zelf' },
      { label: I18N.t(st.geinstalleerd ? 'accounts.gitInloggenEnOphalen' : 'git.zorg.installerenEnInloggen'),
        waarde: 'inloggen', soort: 'primair' },
    ],
  })
  if (!keuze) return 'gestopt'

  // Nog helemaal geen GitHub-account: dat maak je daar, niet hier. Daarna kan
  // je gewoon terugkomen en op dezelfde knop drukken.
  if (keuze === 'nieuw') {
    await window.api.openUrl('https://github.com/signup')
    await meldKort(I18N.t('git.zorg.titel'), I18N.t('git.zorg.naAanmelden'))
    return 'gestopt'
  }

  // "zelf doen" = de oude weg: repo met de hand aanmaken en de url plakken.
  if (keuze === 'zelf') return false

  if (!st.geinstalleerd) {
    const gelukt = await installeerGh()
    if (!gelukt) return false
  }

  const ingelogd = await githubInloggen({ stil: true })
  return ingelogd ? true : false
}

async function startGhLogin(opties = {}) {
  ghCodeVenster = null
  ghKopieerLink = !!opties.kopieerLink
  let stopLuisteren = null
  try {
    stopLuisteren = window.api.opGhCode((info) => {
      // Zodra gh code of adres prijsgeeft: laten zien. Het inloggen loopt
      // ondertussen door; dit venster is om te kopiëren, niet om te wachten.
      if (ghCodeVenster) return
      if (ghKopieerLink && info && info.url) kopieer(info.url, I18N.t('git.inlog.linkAutoGekopieerd'))
      toonGhCode(info)
    })
  } catch {}

  const r = await window.api.gitGhLogin({ geenBrowser: ghKopieerLink })

  try { if (typeof stopLuisteren === 'function') stopLuisteren() } catch {}

  // Het codevenster mag weg zodra het gelukt is.
  if (ghCodeVenster && vraagKlaar) sluitVraag('klaar')
  ghCodeVenster = null
  ghKopieerLink = false

  try { await window.api.gitGhVergeet() } catch {}
  return r
}

// Het venster met de inlogcode. "Openen in browser" gebruikt de standaard-
// browser van Windows, en dáár zit het probleem waar dit venster op is
// aangepast: is die browser al ingelogd met een ánder GitHub-account, dan keurt
// GitHub de code voor dát account goed en heb je de verkeerde koppeling.
// Vandaar de knop om de link te kopiëren: dan kies je zelf in welke browser —
// of welk privévenster — je hem opent.
async function toonGhCode(info) {
  const code = typeof info === 'string' ? info : (info && info.code) || ''
  const url = (info && info.url) || 'https://github.com/login/device'
  ghCodeVenster = code || url

  const knoppen = [
    { label: I18N.t('git.inlog.codeSluit'), waarde: 'sluit' },
  ]
  if (code) knoppen.push({ label: I18N.t('git.inlog.codeKopieer'), waarde: 'code' })
  knoppen.push({ label: I18N.t('git.inlog.linkKopieer'), waarde: 'link', soort: ghKopieerLink ? 'primair' : '' })
  knoppen.push({ label: I18N.t('git.inlog.codeOpen'), waarde: 'open', soort: ghKopieerLink ? '' : 'primair' })

  const keuze = await vraagKeuze({
    titel: I18N.t('git.inlog.codeTitel'),
    tekst: I18N.t('git.inlog.codeTekst') + '\n\n' + I18N.t('git.inlog.codeWaarschuwing'),
    regels: [code, url].filter(Boolean),
    knoppen,
  })

  // Elke keuze behalve sluiten laat het venster terugkomen: je hebt de code
  // straks nog nodig, en na één klik weg zijn is precies waar het op vastliep.
  const opnieuw = () => { if (ghCodeVenster) setTimeout(() => { if (ghCodeVenster) toonGhCode({ code, url }) }, 400) }

  if (keuze === 'code') { await kopieer(code, I18N.t('git.inlog.codeGekopieerd')); opnieuw(); return }
  if (keuze === 'link') { await kopieer(url, I18N.t('git.inlog.linkGekopieerd')); opnieuw(); return }
  if (keuze === 'open') {
    // Kopiëren én de pagina openen: plakken is dan het enige wat overblijft.
    if (code) await kopieer(code, '')
    await window.api.openUrl(url)
    opnieuw()
  }
}

// navigator.clipboard werkt niet overal in Electron zonder https-context; de
// tekstvak-omweg wel. Stil mislukken mag niet — dan sta je te plakken wat er
// nog van gisteren stond.
async function kopieer(tekst, melding) {
  let gelukt = false
  try { await navigator.clipboard.writeText(tekst); gelukt = true } catch {}
  if (!gelukt) {
    try {
      const vak = document.createElement('textarea')
      vak.value = tekst
      vak.style.position = 'fixed'; vak.style.opacity = '0'
      document.body.appendChild(vak); vak.select()
      gelukt = document.execCommand('copy')
      vak.remove()
    } catch {}
  }
  if (melding) showToast(gelukt ? melding : I18N.t('git.inlog.kopieMislukt'))
  return gelukt
}

async function installeerGh() {
  let winget = false
  try { winget = await window.api.gitWinget() } catch {}

  const keuze = await vraagKeuze({
    titel: I18N.t('git.inlog.geenGhTitel'),
    tekst: I18N.t(winget ? 'git.inlog.geenGhTekst' : 'git.inlog.geenWingetTekst'),
    knoppen: [
      { label: I18N.t('common.cancel'), waarde: '' },
      { label: I18N.t('git.inlog.naarSite'), waarde: 'site' },
      ...(winget ? [{ label: I18N.t('git.inlog.installeren'), waarde: 'winget', soort: 'primair' }] : []),
    ],
  })
  if (!keuze) return false
  if (keuze === 'site') { await window.api.openUrl('https://cli.github.com/'); return false }

  const p = projects.find(x => x.id === activeId) || projects[0]
  if (!p) { await meldKort(I18N.t('git.inlog.geenGhTitel'), I18N.t('git.inlog.geenProject')); return false }

  // In de terminal, zodat je ziet wat er geïnstalleerd wordt en waar het
  // vandaan komt. Geen voortgangsbalkje dat het verbergt.
  if (view === 'settings') toggleSettings()
  await executeCmd(p, GitTools.ghInstallCommando(), null)

  // De app zoekt gh met een verse PATH uit het register, dus een herstart is
  // niet nodig — maar we moeten de oude meting wel weggooien.
  try { await window.api.gitGhVergeet() } catch {}
  let nu = false
  try { nu = await window.api.gitGh() } catch {}
  if (!nu) {
    await toonGhZelfDoen({ mislukt: true })
    return false
  }
  return true
}

// Uitleg als gh ontbreekt of winget geblokkeerd is. Geen stille installatie:
// de gebruiker kiest, en ziet waar het vandaan komt.
async function toonGhZelfDoen(opties = {}) {
  const keuze = await vraagKeuze({
    titel: I18N.t(opties.mislukt ? 'git.inlog.geenGhTitel' : 'git.push.inlogUitlegTitel'),
    tekst: (opties.mislukt ? I18N.t('git.inlog.installMislukt') + '\n\n' : '')
      + I18N.t('git.push.inlogUitlegTekst'),
    knoppen: [
      { label: I18N.t('common.ok'), waarde: '' },
      { label: I18N.t('git.inlog.naarSite'), waarde: 'site', soort: 'primair' },
    ],
  })
  if (keuze === 'site') await window.api.openUrl('https://cli.github.com/')
}

// Na een 403 of vóór een push met het verkeerde GitHub-account. Niet "nieuwe
// repo aanmaken": de repo bestaat, je mag er alleen niet bij met wie er nu
// op deze pc is opgeslagen.
//
// Geeft true (account rechtgezet), false (afgebroken), of 'meer' (oude
// herstelweg: ander adres / nieuwe repo / losmaken).
async function herstelVerkeerdeGithub(project, info = {}) {
  let st = { geinstalleerd: false, ingelogd: false, accounts: [] }
  try { st = await window.api.gitGhStatus() } catch {}

  const als = info.als || (st.accounts && st.accounts[0]) || ''
  const doel = info.doel || info.eigenaar || ''
  const kanWisselen = doel && (st.accounts || []).some(n => GitTools.zelfdeGhNaam(n, doel))

  let tekstSleutel = 'git.push.inlogTekst'
  if (!st.geinstalleerd) tekstSleutel = 'git.push.inlogTekstGeenGh'
  else if (info.verkeerd || (als && doel && !GitTools.zelfdeGhNaam(als, doel))) {
    tekstSleutel = 'git.push.inlogTekstVerkeerd'
  }

  const knoppen = [
    { label: I18N.t('common.cancel'), waarde: '' },
    { label: I18N.t('git.push.inlogUitleg'), waarde: 'uitleg' },
    { label: I18N.t('git.push.inlogMeer'), waarde: 'meer' },
  ]
  if (!st.geinstalleerd) {
    knoppen.push({ label: I18N.t('git.push.inlogInstalleren'), waarde: 'installeren', soort: 'primair' })
  } else if (kanWisselen) {
    knoppen.push({ label: I18N.t('git.push.inlogInloggenLos'), waarde: 'inloggen' })
    knoppen.push({ label: I18N.t('git.push.inlogWissel', { doel }), waarde: 'wissel', soort: 'primair' })
  } else if (doel) {
    knoppen.push({ label: I18N.t('git.push.inlogInloggen', { doel }), waarde: 'inloggen', soort: 'primair' })
  } else {
    knoppen.push({ label: I18N.t('git.push.inlogInloggenLos'), waarde: 'inloggen', soort: 'primair' })
  }

  const keuze = await vraagKeuze({
    titel: I18N.t('git.push.inlogTitel'),
    tekst: I18N.t(tekstSleutel, { als: als || '?', doel: doel || '?' }),
    regels: [info.eigenaar && doel && info.eigenaar !== doel ? `${info.eigenaar} / ${doel}` : (doel || info.eigenaar || '')].filter(Boolean),
    knoppen,
  })
  if (!keuze) return false
  if (keuze === 'meer') return 'meer'
  if (keuze === 'uitleg') { await toonGhZelfDoen(); return false }

  if (keuze === 'installeren') {
    const gelukt = await installeerGh()
    if (!gelukt) return false
    try { st = await window.api.gitGhStatus() } catch {}
  }

  if (keuze === 'wissel' || (keuze === 'installeren' && doel
      && (st.accounts || []).some(n => GitTools.zelfdeGhNaam(n, doel)))) {
    const cmd = GitTools.ghSwitchCommando(doel)
    if (cmd) await executeCmd(project, cmd, 'git-profiel', { eigenTerminal: true })
    await activeerGitVoorAccount()
    return true
  }

  // Privévenster, niet de standaardbrowser: op een gedeelde pc is die vaak
  // al ingelogd als de ándere persoon, en dán krijg je opnieuw een 403.
  const gelukt = await githubInloggen({ stil: true, kopieerLink: true })
  if (!gelukt) return false

  if (doel) {
    try { st = await window.api.gitGhStatus() } catch {}
    const nu = (st.accounts || [])[0] || ''
    if (nu && !GitTools.zelfdeGhNaam(nu, doel)) {
      await meldKort(I18N.t('git.push.inlogTitel'),
        I18N.t('git.push.inlogNogVerkeerd', { als: nu, doel }))
    }
    const cmd = GitTools.ghSwitchCommando(doel)
    if (cmd && (st.accounts || []).some(n => GitTools.zelfdeGhNaam(n, doel))) {
      await executeCmd(project, cmd, 'git-profiel', { eigenTerminal: true })
    }
  }
  await activeerGitVoorAccount()
  return true
}

// Vóór een push/pull: als dit CommandDeck-account een GitHub-gebruiker heeft
// en gh staat er, schakel daarnaartoe. Ontbreekt dat account op deze pc, dan
// de herstelvraag — niet pas ná de 403.
async function zorgVoorJuisteGithubPush(project) {
  const prof = gitStandaardProfiel()
  const doel = (prof && GitTools.geldigeGhGebruiker(prof.ghGebruiker)) ? prof.ghGebruiker : ''
  if (!doel) return true

  let st = { geinstalleerd: false, ingelogd: false, accounts: [] }
  try { st = await window.api.gitGhStatus() } catch {}
  if (!st.geinstalleerd) return true

  const heeft = (st.accounts || []).some(n => GitTools.zelfdeGhNaam(n, doel))
  if (heeft) {
    await activeerGitVoorAccount()
    return true
  }

  const staat = gitStaten[actieveLocPad(project)] || {}
  const wat = await herstelVerkeerdeGithub(project, {
    doel,
    eigenaar: GitTools.githubEigenaarUitUrl(staat.remoteUrl || ''),
    als: (st.accounts || [])[0] || '',
    verkeerd: !!(st.accounts || []).length,
  })
  return wat === true
}

async function naMislukteRemote(project, cmdKey, result) {
  if (!['git-push', 'git-pull', 'git-fetch'].includes(cmdKey)) return
  const pad = actieveLocPad(project)
  const tekst = (result && result.output) || ''
  if (result && result.success === false && GitTools.remoteFoutReden(tekst) === 'inloggen') {
    const staat = gitStaten[pad] || {}
    const info = GitTools.pushInlogProbleem({
      tekst,
      remoteUrl: staat.remoteUrl || '',
      verwacht: (gitStandaardProfiel() || {}).ghGebruiker,
    }) || { reden: 'inloggen', als: '', doel: '', eigenaar: GitTools.githubEigenaarUitUrl(staat.remoteUrl || '') }
    const wat = await herstelVerkeerdeGithub(project, info)
    if (wat === true) {
      await controleerKoppeling(pad, true)
      return 'opnieuw'
    }
    if (wat === 'meer') {
      await controleerKoppeling(pad, true)
      const nu = gitStaten[pad] || staat
      await herstelKoppeling(project, pad,
        nu.koppelingStuk ? nu : { ...nu, koppelingStuk: true, remoteReden: 'inloggen' },
        { slaInlogOver: true })
      return
    }
  }
  await controleerKoppeling(pad, true)
}

async function haalGitIdentiteitOp(accountNaam) {
  // Geïnstalleerd en ingelogd zijn twee dingen. Alleen op het eerste kijken is
  // precies waarom dit doodliep bij iemand die gh wél had maar nooit had
  // ingelogd: dan sloegen we het inloggen over en liepen we tegen de API aan.
  let st = { geinstalleerd: false, ingelogd: false, accounts: [] }
  try { st = await window.api.gitGhStatus() } catch {}

  const tekst = !st.geinstalleerd ? 'accounts.gitHaalTekstGeenGh'
    : !st.ingelogd ? 'accounts.gitHaalTekstNietIngelogd'
    : 'accounts.gitHaalTekstExtra'
  const knopLabel = st.ingelogd ? 'accounts.gitOphalen' : 'accounts.gitInloggenEnOphalen'

  const keuze = await vraagKeuze({
    titel: I18N.t('accounts.gitTitel', { naam: accountNaam }),
    tekst: I18N.t(tekst),
    knoppen: [
      { label: I18N.t('common.cancel'), waarde: '' },
      { label: I18N.t('accounts.gitZelfInvullen'), waarde: 'zelf' },
      { label: I18N.t('accounts.gitKopieerLink'), waarde: 'link' },
      { label: I18N.t(knopLabel), waarde: 'github', soort: 'primair' },
    ],
  })
  if (!keuze) return false          // false = afgebroken, niet doorgaan
  if (keuze === 'zelf') return null // null = zelf invullen

  if (!st.geinstalleerd) {
    const gelukt = await installeerGh()
    if (!gelukt) return null
  }

  // 'Kopieer link' start altijd een verse inlog — ook als er al een account
  // klaarstaat. Anders kun je geen tweede GitHub-account koppelen: ophalen
  // pakt dan stilletjes het eerste. En de standaardbrowser gaat niet open,
  // zodat je de link in een privévenster kunt plakken.
  const accountsVoor = (st.accounts || []).slice()
  if (keuze === 'link' || !st.ingelogd) {
    const gelukt = await githubInloggen({ stil: true, kopieerLink: keuze === 'link' })
    if (!gelukt) return null
  }

  // Meerdere GitHub-accounts op deze pc? Dan is "het actieve account" een gok,
  // en die gok kwam er eerder naast te zitten. Een account dat er net bij is
  // gekomen wint: dát is wie je zojuist hebt ingelogd.
  let gekozenGh = ''
  try {
    const na = await window.api.gitGhStatus()
    const lijst = (na && na.accounts) || []
    const nieuw = GitTools.nieuwGhAccount(accountsVoor, lijst)
    if (nieuw.length === 1) gekozenGh = nieuw[0]
    else if (lijst.length > 1) {
      gekozenGh = await vraagKeuze({
        titel: I18N.t('accounts.gitWelkAccountTitel'),
        tekst: I18N.t('accounts.gitWelkAccountTekst'),
        knoppen: [
          { label: I18N.t('common.cancel'), waarde: '' },
          ...lijst.map((n, i) => ({ label: n, waarde: n, soort: i === 0 ? 'primair' : '' })),
        ],
      })
      if (!gekozenGh) return null
    }
  } catch {}

  const r = await window.api.gitGhIdentiteit(gekozenGh)
  if (!r || !r.ok) {
    // Zeggen wát er misging, met de foutregel van gh erbij. Anders sta je met
    // een melding die niets oplost.
    const reden = (r && r.reden) || 'onbekend'
    const regels = (r && r.detail) ? [r.detail] : []
    await vraagKeuze({
      titel: I18N.t('accounts.gitTitel', { naam: accountNaam }),
      tekst: I18N.t('accounts.gitOphalen.' + (reden === 'geen-gh' ? 'geenGh' : 'nietIngelogd')),
      regels,
      knoppen: [{ label: I18N.t('common.ok'), waarde: 'ok', soort: 'primair' }],
    })
    return null
  }

  const ident = r.identiteit
  const ja = await vraagJaNee(I18N.t('accounts.gitGevondenTitel'),
    I18N.t(r.viaStatus ? 'accounts.gitGevondenViaStatus' : 'accounts.gitGevondenTekst', {
      naam: ident.gitNaam, email: ident.gitEmail, gh: ident.ghGebruiker,
    }), I18N.t('common.save'), 'primair')
  return ja ? ident : null
}

async function githubInloggen(opties = {}) {
  let gh = false
  try { gh = await window.api.gitGh() } catch {}
  if (!gh) {
    const gelukt = await installeerGh()
    if (!gelukt) return false
  }

  if (!opties.stil) {
    const ja = await vraagJaNee(I18N.t('settings.git.inlogKnop'), I18N.t('git.inlog.uitleg'),
      I18N.t('git.inlog.starten'), 'primair')
    if (!ja) return false
  }

  // De app voert de dialoog met gh. Jij krijgt alleen de code te zien, in een
  // venster waar je hem kunt kopiëren — in de terminal kan dat niet, en dáár
  // liep het op vast.
  const r = await startGhLogin({ kopieerLink: !!opties.kopieerLink })
  if (!r || !r.ok) {
    if (!opties.stil) {
      await vraagKeuze({
        titel: I18N.t('settings.git.inlogKnop'),
        tekst: I18N.t('git.inlog.nietGelukt'),
        regels: (r && r.uitvoer) ? String(r.uitvoer).split('\n').filter(Boolean).slice(-6) : [],
        knoppen: [{ label: I18N.t('common.ok'), waarde: 'ok', soort: 'primair' }],
      })
    }
    return false
  }
  const namen = r.accounts || []

  if (!opties.stil) {
    await meldKort(I18N.t('git.inlog.klaarTitel'),
      I18N.t('git.inlog.klaarTekst', { namen: namen.join(', ') }), namen)
  }
  return true
}

async function activeerGitVoorAccount() {
  const prof = gitStandaardProfiel()
  if (!prof) return null
  try {
    const r = await window.api.gitAccountActiveren(prof)
    if (r && r.mislukt && r.mislukt.includes('gh-wissel')) {
      // Naam en adres staan dan wel goed, maar pushen kan alsnog met het
      // verkeerde GitHub-account.
      showToast(I18N.t('accounts.ghWisselMislukt', { naam: prof.ghGebruiker || '' }))
    }
    // De rest werd hier weggeslikt. Juist die stappen faalden jarenlang stil,
    // en dat is waarom de app een account bleef tonen dat git nooit kreeg.
    const stil = (r && r.mislukt ? r.mislukt : []).filter(x => x !== 'gh-wissel')
    if (stil.length) {
      console.warn('git-account activeren mislukt:', stil, (r && r.fouten) || {})
      showToast(I18N.t('accounts.activerenMislukt', { stappen: stil.join(', ') }))
    }
    return r
  } catch { return null }
}

// Het profiel dat bij dit app-account hoort. De profielenlijst staat al per
// account, dus dit is simpelweg het standaardprofiel van wie er nu werkt.
function gitStandaardProfiel() {
  return Accounts.accountProfiel(huidigAccount())
}

async function laadAccounts() {
  try {
    const r = await window.api.accountsList()
    accounts = (r && r.accounts) || []
    actiefAccount = (r && r.actief) || ''
    accountPinNodig = !!(r && r.pinNodig)
  } catch { accounts = []; actiefAccount = ''; accountPinNodig = false }
}

const huidigAccount = () => accounts.find(a => a.id === actiefAccount) || null

async function bewaarAccountGit(a, git) {
  if (!a || !git) return false
  const r = await window.api.accountSetGit({ id: a.id, ...git })
  if (!r || !r.ok) return false
  await laadAccounts()
  if (a.id === actiefAccount) await activeerGitVoorAccount()
  return true
}

// Wisselen betekent: andere projecten, andere git-instellingen. Alles wat aan
// het vorige account hing moet dus weg, anders zie je even de projectenlijst
// van iemand anders of blijft een git-toestand van een ander pad hangen.
// Geeft true als er echt gewisseld is. `geenWerkcontrole` is voor het geval
// waarin het account waar je vandaan komt niet meer bestaat: dan valt er niets
// meer weg te zetten en zou de vraag alleen in de weg staan.
async function wisselAccount(id, pin = null, opties = {}) {
  if (!id || id === actiefAccount) return false

  // Eerst het werk van dit account wegzetten. Daarna pas pincode en wissel,
  // anders belandt onopgeslagen werk bij niemand.
  if (!opties.geenWerkcontrole) {
    await wachtOpOnveiligWerk()
    onveiligWerkBezig = true
    try {
      if (await controleerOnveiligWerk('wisselen') === 'blijven') return false
    } catch {
      // Liever wisselen dan vastzitten in een mislukte git-check.
    } finally {
      onveiligWerkBezig = false
    }
  }

  // Vanaf twee accounts is inloggen altijd nodig — juist bij het wisselen, want
  // dat is het moment waarop je in het verkeerde account belandt.
  if (accountPinNodig && pin === null) {
    const doel = accounts.find(a => a.id === id)
    if (!doel) return false
    inlogBezig++
    try {
      pin = await vraagBestaandePin(doel)
    } finally {
      inlogBezig--
    }
    if (pin === null) return false
  }

  const r = await window.api.accountSwitch({ id, pin: pin || '' })
  if (!r || !r.ok) {
    if (r && r.reden === 'pin-fout') await meldKort(I18N.t('accounts.wisselen'), I18N.t('accounts.pinOp'))
    return false
  }

  const inInstellingen = view === 'settings'

  // Eerst de deur dicht: main mag vanaf nu niets meer met de mappen van het
  // vorige account, ook niet als er nog een verversing onderweg is.
  try { window.api.gitPaden({ accountId: id, paden: [] }) } catch {}
  try { window.api.gitProjecten({ accountId: id, lijst: [] }) } catch {}

  actiefAccount = id
  projects = r.projects || []
  settings = r.settings || settings
  if (migreerSnelRijen()) window.api.saveSettings(settings)
  migreerAlleProjecten()
  gitStaten = {}
  gitRemoteGedaan.clear()
  for (const k of Object.keys(gitLaatsteFetch)) delete gitLaatsteFetch[k]
  meldGitPadenAanMain()
  activeId = projects[0] ? projects[0].id : ''
  wisBewaardePanelen()

  // Vanuit instellingen blijf je daar: de wisselknop is een accountrij, geen
  // deur naar een ander scherm. Anders lijkt hij niks te doen.
  if (inInstellingen) {
    renderSidebar()
    renderSettingsPanel()
  } else {
    setView(projects.length ? 'project' : 'cmd')
    renderSidebar()
    renderMain()
  }
  showToast(I18N.t('accounts.gewisseld', { naam: (huidigAccount() || {}).naam || '' }))
  startGitPolling()
  activeerGitVoorAccount().then(async () => {
    await ververesAlleGitStaten(true)
    // Net ingelogd: dit is hét moment om te horen dat er op de andere pc iets
    // is gebeurd in het project dat nu opengaat.
    controleerAchterstand()
  })
  return true
}

// Bij het opstarten vragen wie er achter de pc zit. Alleen als er iets te
// kiezen valt — bij één account is dit een venster dat niets toevoegt.
// Een account erbij. Staat los van de instellingen, want dit moet ook kunnen
// vanaf het inlogscherm: daar sta je juist als je nog geen eigen account hebt.
// Geeft true als er echt een account bij is gekomen.
const NIEUW_ACCOUNT = '__nieuw-account__'

async function voegAccountToe() {
  // Vanaf nu zijn er twee accounts en gaat de pincode meetellen. Heeft het
  // huidige account er nog geen, dan moet die er eerst komen — anders maak je
  // een slot op de ene deur en staat de andere open.
  const ik = huidigAccount()
  if (ik && !ik.heeftPin) {
    await meldKort(I18N.t('accounts.eigenPinTitel'), I18N.t('accounts.eigenPinTekst', { naam: ik.naam }))
    const eigen = await vraagNieuwePin(I18N.t('accounts.eigenPinTitel'))
    if (eigen === null) return false
    const rp = await window.api.accountSetPin({ id: ik.id, pin: eigen })
    if (!rp || !rp.ok) { await meldKort(I18N.t('accounts.eigenPinTitel'), I18N.t('accounts.pinOngeldig')); return false }
    await laadAccounts()
  }

  const naam = await vraagTekst({
    titel: I18N.t('accounts.toevoegen'), tekst: I18N.t('accounts.toevoegenTekst'),
    placeholder: I18N.t('accounts.naamPlaceholder'), okLabel: I18N.t('common.next'),
  })
  if (!naam) return false

  // Meteen de git-kant erbij: dit account ís straks de naam onder de commits,
  // en achteraf invullen is precies hoe je met de verkeerde naam commit.
  const git = await vraagGitIdentiteit(naam, {})
  if (!git) return false

  const pin = await vraagNieuwePin(I18N.t('accounts.pinVoorTitel', { naam }))
  if (pin === null) return false

  const r = await window.api.accountAdd({ naam, pin, ...git })
  if (!r || !r.ok) {
    await meldKort(I18N.t('accounts.toevoegen'),
      I18N.t(r && r.reden === 'pin-ongeldig' ? 'accounts.pinOngeldig' : 'accounts.naamBezet'))
    return false
  }
  await laadAccounts()
  return true
}

async function kiesAccountBijStart() {
  if (accounts.length < 2) return
  inlogBezig++
  try {
    await kiesAccountVenster()
  } finally {
    inlogBezig--
  }
}

async function kiesAccountVenster() {

  const tonen = accounts.slice(0, 8)
  const knoppen = []
  // column-reverse: achterste eerst. Dus onderaan beginnen: "account
  // toevoegen" hoort onder de mensen te staan, niet ertussen.
  knoppen.push({ label: I18N.t('accounts.toevoegenBijStart'), waarde: NIEUW_ACCOUNT })
  for (let i = tonen.length - 1; i >= 0; i--) {
    const a = tonen[i]
    knoppen.push({
      label: `${a.icoon || '👤'} ${a.naam}`,
      waarde: a.id,
      soort: a.id === actiefAccount ? 'primair' : '',
    })
  }
  const id = await vraagKeuze({
    titel: I18N.t('accounts.kiesTitel'),
    tekst: I18N.t(accountPinNodig ? 'accounts.kiesTekstPin' : 'accounts.kiesTekst'),
    knoppen,
  })
  if (!id) return

  // Even naar het toevoegscherm en daarna terug naar deze lijst — dan staat de
  // nieuwe erbij en log je gewoon in. Zonder deze weg kom je bij het opstarten
  // niet verder dan de accounts die er al waren.
  if (id === NIEUW_ACCOUNT) {
    await voegAccountToe()
    if (accounts.length >= 2) await kiesAccountVenster()
    return
  }

  // Ook het account waar je al op stond vraagt om de pincode: anders is het
  // venster bij het opstarten een deur die je zonder sleutel voorbij loopt.
  if (id === actiefAccount) {
    if (!accountPinNodig) return
    const ik = accounts.find(a => a.id === id)
    const pin = ik ? await vraagBestaandePin(ik) : null
    if (pin === null) { await kiesAccountVenster(); return }
    return
  }
  await wisselAccount(id)
}

function accountGitRegel(a) {
  if (!a.gitCompleet) return `<span class="account-git onaf">${esc(I18N.t('accounts.gitOnaf'))}</span>`
  const gh = a.ghGebruiker ? `  ·  ${esc(a.ghGebruiker)}` : ''
  return `<span class="account-git"><i class="ti ti-git-commit"></i> ${esc(a.gitNaam)} &lt;${esc(a.gitEmail)}&gt;${gh}</span>`
}

function accountRijenHtml() {
  return accounts.map(a => `
    <div class="instel-rij account-rij ${a.id === actiefAccount ? 'actief' : ''}" data-account="${esc(a.id)}"
      ${a.id === actiefAccount ? '' : `title="${esc(I18N.t('accounts.wisselen'))}"`}>
      <div class="editor-row-name">${esc(a.icoon || '👤')} ${esc(a.naam)}</div>
      ${accountGitRegel(a)}
      <div class="account-acties">
        <button class="term-btn ${a.gitCompleet ? '' : 'btn-danger'}" data-account-git="${esc(a.id)}"
          title="${esc(I18N.t('accounts.gitBewerken'))}"><i class="ti ti-git-commit" style="font-size:13px"></i></button>
        ${a.id === actiefAccount
          ? `<span class="instel-uitleg">${esc(I18N.t('accounts.ditBenJij'))}</span>`
          : `<button class="term-btn" data-account-kies="${esc(a.id)}">${esc(I18N.t('accounts.wisselen'))}</button>`}
        <button class="term-btn" data-account-hernoem="${esc(a.id)}" title="${esc(I18N.t('accounts.hernoemen'))}"><i class="ti ti-pencil" style="font-size:13px"></i></button>
        <button class="term-btn ${a.heeftPin ? '' : 'btn-danger'}" data-account-pin="${esc(a.id)}"
          title="${esc(I18N.t(a.heeftPin ? 'accounts.pinWijzigen' : 'accounts.pinZetten'))}"><i class="ti ti-lock" style="font-size:13px"></i></button>
        ${accounts.length > 1 && a.id === actiefAccount
          ? `<button class="term-btn" data-account-weg="${esc(a.id)}" title="${esc(I18N.t('accounts.verwijderen'))}"><i class="ti ti-trash" style="font-size:13px"></i></button>`
          : ''}
      </div>
    </div>`).join('')
}

function gitAfsluitWijze() {
  return GitTools.afsluitInstelling((settings.git || {}).afsluiten)
}

// ── Logboek ──────────────────────────────────────────────────────────────────
// Aanzetten wat je nodig hebt, niet alles altijd. Git staat standaard aan: dat
// is waar de meeste tijd in verdwijnt, en een git-commando is kort. De rest kun
// je erbij zetten als je een probleem zoekt en weer uitzetten als je het hebt.
const LOG_SOORTEN = ['git', 'commando', 'bestanden', 'ai', 'app']
let logKeuze = { git: true, commando: true, bestanden: false, ai: false, app: true }
let logRegels = []
let logZoek = ''

function logSettingsMarkup() {
  const rijen = logRegels.length
    ? logRegels.map(r => {
        const tijd = new Date(r.t).toLocaleTimeString()
        const extra = r.extra ? JSON.stringify(r.extra) : ''
        const stuk = /MISLUKT|fout|error/i.test(r.bericht) ? ' stuk' : ''
        return `<div class="log-regel${stuk}">
          <span class="log-tijd">${esc(tijd)}</span>
          <span class="log-soort">${esc(r.soort)}</span>
          <span class="log-tekst">${esc(r.bericht)}${extra ? `<span class="log-extra">${esc(extra)}</span>` : ''}</span>
        </div>`
      }).join('')
    : `<div class="log-leeg">${esc(I18N.t('settings.log.leeg'))}</div>`

  return `
      <div>
        <div class="settings-section-title">${I18N.t('settings.section.logTitle')}</div>
        <div class="instel-rij">
          <span class="instel-uitleg">${I18N.t('settings.log.uitleg')}</span>
        </div>
        <div class="instel-rij">
          ${LOG_SOORTEN.map(soort => `
          <label class="bat-opt">
            <input type="checkbox" data-log-soort="${soort}" ${logKeuze[soort] ? 'checked' : ''} />
            ${esc(I18N.t('settings.log.soort.' + soort))}
          </label>`).join('')}
        </div>
        <div class="instel-rij">
          <input class="field log-zoek" id="log-zoek" placeholder="${esc(I18N.t('settings.log.zoek'))}" value="${esc(logZoek)}" />
          <button class="term-btn" id="log-ververs"><i class="ti ti-refresh" style="font-size:13px"></i> ${esc(I18N.t('settings.log.ververs'))}</button>
          <button class="term-btn" id="log-kopieer"><i class="ti ti-copy" style="font-size:13px"></i> ${esc(I18N.t('settings.log.kopieer'))}</button>
          <button class="term-btn" id="log-map"><i class="ti ti-folder-open" style="font-size:13px"></i> ${esc(I18N.t('settings.log.map'))}</button>
          <button class="term-btn" id="log-wis"><i class="ti ti-trash" style="font-size:13px"></i> ${esc(I18N.t('settings.log.wis'))}</button>
        </div>
        <div class="log-lijst">${rijen}</div>
      </div>`
}

async function ververesLog() {
  try {
    const r = await window.api.logLees({ soorten: LOG_SOORTEN.filter(x => logKeuze[x]), zoek: logZoek, aantal: 300 })
    if (!r) return
    logRegels = r.regels || []
    if (r.aan) logKeuze = { ...logKeuze, ...r.aan }
  } catch { logRegels = [] }
  renderSettingsPanel()
}

let logOpgehaald = false

function bedraadLogSectie() {
  // Eén keer zelf ophalen bij het openen; daarna alleen op verzoek. Anders
  // roept ververesLog() het tekenen aan dat weer ververesLog() aanroept.
  if (!logOpgehaald) { logOpgehaald = true; ververesLog() }
  document.querySelectorAll('[data-log-soort]').forEach(chk => {
    chk.onchange = async () => {
      logKeuze[chk.dataset.logSoort] = chk.checked
      settings.logboek = { ...logKeuze }
      window.api.saveSettings(settings)
      try { await window.api.logZet(logKeuze) } catch {}
      ververesLog()
    }
  })
  const zoek = document.getElementById('log-zoek')
  if (zoek) zoek.onchange = () => { logZoek = zoek.value.trim(); ververesLog() }
  const ververs = document.getElementById('log-ververs')
  if (ververs) ververs.onclick = () => ververesLog()
  const map = document.getElementById('log-map')
  if (map) map.onclick = () => window.api.logMap()
  const wis = document.getElementById('log-wis')
  if (wis) wis.onclick = async () => { await window.api.logWis(); ververesLog() }
  const kop = document.getElementById('log-kopieer')
  if (kop) kop.onclick = async () => {
    const tekst = logRegels.map(r => new Date(r.t).toISOString().slice(0, 19).replace('T', ' ')
      + ' [' + r.soort + '] ' + r.bericht + (r.extra ? '  ' + JSON.stringify(r.extra) : '')).join('\n')
    try { await navigator.clipboard.writeText(tekst); showToast(I18N.t('settings.log.gekopieerd')) } catch {}
  }
}

function renderSettingsPanel() {
  const panel = document.getElementById('settings-panel')
  if (settingsSubPage === 'talen') { renderTalenSubPage(panel); return }
  const hist  = settings.history || {}

  const projRows = projects.map(p => {
    const locs = p.locations.map(l => l.path).join('  •  ')
    return `
      <div class="settings-proj-item" data-proj-id="${p.id}">
        <div class="settings-proj-icon">${p.icon}</div>
        <div class="settings-proj-info">
          <div class="settings-proj-name">${esc(p.name)}</div>
          <div class="settings-proj-locs">${esc(locs)}</div>
        </div>
        <button class="settings-proj-edit" data-edit-id="${p.id}"><i class="ti ti-pencil"></i> ${I18N.t('common.edit')}</button>
      </div>
    `
  }).join('')

  panel.innerHTML = `
    <div class="settings-header">
      <i class="ti ti-settings" style="font-size:18px;color:var(--accent)"></i>
      <span class="settings-header-title">${I18N.t('sidebar.settingsTitle')}</span>
    </div>
    <div class="settings-body">
      <div>
        <div class="settings-section-title">${I18N.t('settings.section.accountsTitle')}</div>
        ${accountRijenHtml()}
        <div class="instel-rij">
          <button class="add-proj-btn" id="btn-account-add" style="margin:0">
            <i class="ti ti-plus"></i> ${I18N.t('accounts.toevoegen')}
          </button>
          <span class="instel-uitleg">${I18N.t('accounts.uitleg')}</span>
        </div>
        <div class="instel-rij">
          <span class="instel-uitleg account-eerlijk">${I18N.t('accounts.eerlijk')}</span>
        </div>
      </div>
      <div>
        <div class="settings-section-title">${I18N.t('settings.section.gitTitle')}</div>
        <div class="instel-rij">
          <div class="editor-row-name"><i class="ti ti-git-branch"></i> ${I18N.t('settings.git.label')}</div>
          <select class="loc-select" id="set-git-afsluiten">
            <option value="uit" ${gitAfsluitWijze() === 'uit' ? 'selected' : ''}>${I18N.t('settings.git.off')}</option>
            <option value="waarschuwen" ${gitAfsluitWijze() === 'waarschuwen' ? 'selected' : ''}>${I18N.t('settings.git.warn')}</option>
            <option value="stashen" ${gitAfsluitWijze() === 'stashen' ? 'selected' : ''}>${I18N.t('settings.git.stash')}</option>
          </select>
          <span class="instel-uitleg">${I18N.t('settings.git.desc')}</span>
        </div>
        <div class="instel-rij">
          <label class="bat-opt">
            <input type="checkbox" id="set-git-fetch" ${(settings.git || {}).fetchBijOpenen !== false ? 'checked' : ''} />
            ${I18N.t('settings.git.fetchLabel')}
          </label>
          <span class="instel-uitleg">${I18N.t('settings.git.fetchDesc')}</span>
        </div>
        <div class="instel-rij">
          <div class="editor-row-name"><i class="ti ti-refresh"></i> ${I18N.t('settings.git.pollLabel')}</div>
          <select class="loc-select" id="set-git-poll">
            ${[0, 15, 30, 60, 300].map(sec => `
              <option value="${sec}" ${gitPollSec() === sec ? 'selected' : ''}>
                ${sec === 0 ? esc(I18N.t('settings.git.pollUit')) : esc(I18N.t('settings.git.pollSec', { sec }))}
              </option>`).join('')}
          </select>
          <span class="instel-uitleg">${I18N.t('settings.git.pollDesc')}</span>
        </div>
        <div class="instel-rij">
          <div class="editor-row-name"><i class="ti ti-user-circle"></i> ${I18N.t('settings.git.profielLabel')}</div>
          <span class="instel-uitleg">${I18N.t('settings.git.profielDesc')}</span>
          <div id="git-profiel-lijst"></div>
          <button class="add-proj-btn" id="btn-add-git-profiel" style="margin:0;margin-top:4px">
            <i class="ti ti-plus"></i> ${I18N.t('settings.git.profielAdd')}
          </button>
          <button class="add-proj-btn" id="btn-git-inloggen" style="margin:0;margin-top:4px">
            <i class="ti ti-brand-github"></i> ${I18N.t('settings.git.inlogKnop')}
          </button>
          <span class="instel-uitleg">${I18N.t('settings.git.inlogEerlijk')}</span>
        </div>
      </div>
      <div>
        <div class="settings-section-title">${I18N.t('settings.section.autofixTitle')}</div>
        <div class="editor-row enabled" id="autofix-row">
          <input type="checkbox" id="autofix-check" ${settings.autoFix?.enabled !== false ? 'checked' : ''} />
          <div class="editor-row-name"><i class="ti ti-wand"></i> ${I18N.t('settings.autofix.label')}</div>
          <div class="instel-uitleg">
            ${I18N.t('settings.autofix.desc')}
          </div>
        </div>
      </div>
      <div>
        <div class="settings-section-title">${I18N.t('settings.section.explorerTitle')}</div>
        <div class="editor-row enabled">
          <input type="checkbox" id="set-mapgroottes" ${settings.mapGroottes !== false ? 'checked' : ''} />
          <div class="editor-row-name"><i class="ti ti-ruler-measure"></i> ${I18N.t('settings.explorer.folderSizesLabel')}</div>
          <div class="instel-uitleg">
            ${I18N.t('settings.explorer.folderSizesDesc')}
          </div>
        </div>
      </div>
      <div>
        <div class="settings-section-title">${I18N.t('settings.section.historyTitle')}</div>
        <div class="editor-row enabled">
          <input type="checkbox" id="hist-enabled" ${hist.enabled !== false ? 'checked' : ''} />
          <div class="editor-row-name"><i class="ti ti-history"></i> ${I18N.t('settings.history.enabledLabel')}</div>
          <div class="instel-uitleg">
            ${I18N.t('settings.history.enabledDesc')}
          </div>
        </div>
        <div class="editor-row enabled">
          <input type="checkbox" id="hist-persist" ${hist.persist !== false ? 'checked' : ''} />
          <div class="editor-row-name"><i class="ti ti-device-floppy"></i> ${I18N.t('settings.history.persistLabel')}</div>
          <div class="instel-uitleg">
            ${I18N.t('settings.history.persistDesc')}
          </div>
        </div>
        <div class="editor-row enabled">
          <div class="editor-row-name"><i class="ti ti-arrows-sort"></i> ${I18N.t('settings.history.countsLabel')}</div>
          <div class="hist-limits">
            <label>${I18N.t('settings.history.recentLabel')} <input class="field mono" type="number" min="10" max="5000" id="hist-max-recent" value="${Number(hist.maxRecent) || 300}" /></label>
            <label>${I18N.t('sidebar.navDict')} <input class="field mono" type="number" min="50" max="20000" id="hist-max-entries" value="${Number(hist.maxEntries) || 2000}" /></label>
          </div>
        </div>
        <div class="hist-clear-row">
          <button class="term-btn" id="hist-seed" title="${I18N.t('settings.history.seedTitle')}"><i class="ti ti-book-upload" style="font-size:13px"></i> ${I18N.t('settings.history.seedButton')}</button>
          <button class="term-btn" id="hist-clear-recent"><i class="ti ti-eraser" style="font-size:13px"></i> ${I18N.t('settings.history.clearRecentButton')}</button>
          <button class="term-btn stop" id="hist-clear-all"><i class="ti ti-trash" style="font-size:13px"></i> ${I18N.t('settings.history.clearAllButton')}</button>
          <span class="hist-count">${I18N.t('settings.history.countSummary', { commands: (history.entries || []).length, runs: (history.recent || []).length })}</span>
        </div>
      </div>
      <div>
        <div class="settings-section-title-row">
          <div class="settings-section-title">${I18N.t('settings.section.customEditorsTitle')}</div>
          <button class="term-btn" id="btn-scan-editors" title="${I18N.t('settings.customEditors.scanTitle')}"><i class="ti ti-search" style="font-size:13px"></i> ${I18N.t('settings.customEditors.scanButton')}</button>
        </div>
        <p style="font-size:11px;color:var(--muted);margin:4px 0 8px">
          ${I18N.t('settings.editors.hint')}
        </p>
        <div id="custom-editor-list"></div>
        <button class="add-proj-btn" id="btn-add-custom-editor" style="margin:0;margin-top:4px">
          <i class="ti ti-plus"></i> ${I18N.t('settings.customEditors.addButton')}
        </button>
      </div>
      <div>
        <div class="settings-section-title">${I18N.t('settings.section.deleteTitle')}</div>
        <div class="instel-rij">
          <div class="editor-row-name"><i class="ti ti-trash"></i> ${I18N.t('settings.delete.label')}</div>
          <select class="loc-select" id="set-wiswijze">
            <option value="" ${!wisWijze() ? 'selected' : ''}>${I18N.t('settings.delete.askOption')}</option>
            <option value="individueel" ${wisWijze() === 'individueel' ? 'selected' : ''}>${I18N.t('wis.chooseIndividual')}</option>
            <option value="globaal" ${wisWijze() === 'globaal' ? 'selected' : ''}>${I18N.t('wis.chooseGlobal')}</option>
          </select>
          <span class="instel-uitleg">${I18N.t('settings.delete.desc')}</span>
          ${wisWijze() === 'individueel' ? `
          <button class="term-btn" id="wis-herstel" title="${esc(I18N.t('wis.restoreTitleShort'))}">
            <i class="ti ti-arrow-back-up" style="font-size:13px"></i> ${I18N.t('wis.restoreButtonShort', { count: verborgenKnopAantal() })}
          </button>` : ''}
        </div>
      </div>
      ${logSettingsMarkup()}
      ${aiSettingsMarkup()}
      <div>
        <div class="settings-section-title">${I18N.t('settings.section.languageTitle')}</div>
        <div class="settings-proj-item" id="settings-open-talen">
          <i class="ti ti-language" style="font-size:20px;color:var(--muted2)"></i>
          <div class="settings-proj-info">
            <div class="settings-proj-name">${I18N.t('settings.language.rowTitle')}</div>
            <div class="settings-proj-locs">${esc(taalNaam(settings.language))}</div>
          </div>
          <button class="settings-proj-edit"><i class="ti ti-chevron-right"></i></button>
        </div>
      </div>
      <div>
        <div class="settings-section-title">${I18N.t('sidebar.sectionProjects')}</div>
        ${projRows}
        <button class="add-proj-btn" id="settings-add-proj" style="margin:0;margin-top:4px">
          <i class="ti ti-plus"></i> ${I18N.t('sidebar.addProject')}
        </button>
      </div>
    </div>
    <div class="settings-save-bar">
      <button class="btn-ghost" id="settings-cancel">${I18N.t('common.cancel')}</button>
      <button class="btn-primary" id="settings-save"><i class="ti ti-device-floppy" style="font-size:13px"></i> ${I18N.t('common.save')}</button>
    </div>
  `

  renderCustomEditors()
  bedraadAiSettings()
  bedraadLogSectie()
  document.getElementById('btn-scan-editors').onclick = async () => {
    showToast(I18N.t('common.searching'))
    await zoekEditors({ stil: false })
  }
  document.getElementById('btn-add-custom-editor').onclick = () => {
    settings.customEditors = [...(settings.customEditors || []),
      { id: 'ce_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5), label: '', path: '', enabled: true, kleur: volgendeProgKleur() }]
    renderCustomEditors()
    focusField('ce-label-' + settings.customEditors[settings.customEditors.length - 1].id)
  }

  panel.querySelectorAll('[data-edit-id]').forEach(btn => {
    btn.onclick = (e) => { e.stopPropagation(); openEditModal(btn.dataset.editId) }
  })

  document.getElementById('settings-add-proj').onclick = openNewModal

  document.getElementById('settings-open-talen').onclick = () => {
    settingsSubPage = 'talen'; talenZoekterm = ''
    renderSettingsPanel()
  }

  document.getElementById('settings-cancel').onclick = toggleSettings

  const gitKeuze = document.getElementById('set-git-afsluiten')
  if (gitKeuze) gitKeuze.onchange = () => {
    settings.git = { ...(settings.git || {}), afsluiten: gitKeuze.value }
    window.api.saveSettings(settings)
  }

  panel.querySelectorAll('[data-account-kies]').forEach(btn => {
    btn.onclick = (e) => { e.stopPropagation(); wisselAccount(btn.dataset.accountKies) }
  })
  panel.querySelectorAll('.account-rij:not(.actief)').forEach(rij => {
    rij.onclick = (e) => {
      if (e.target.closest('button')) return
      wisselAccount(rij.dataset.account)
    }
  })
  panel.querySelectorAll('[data-account-hernoem]').forEach(btn => {
    btn.onclick = async () => {
      const a = accounts.find(x => x.id === btn.dataset.accountHernoem)
      if (!a) return
      const naam = await vraagTekst({
        titel: I18N.t('accounts.hernoemen'), waarde: a.naam,
        okLabel: I18N.t('common.save'),
      })
      if (!naam) return
      const r = await window.api.accountRename({ id: a.id, naam })
      if (!r || !r.ok) { await meldKort(I18N.t('accounts.hernoemen'), I18N.t('accounts.naamBezet')); return }
      await laadAccounts(); renderSettingsPanel()
    }
  })
  panel.querySelectorAll('[data-account-weg]').forEach(btn => {
    btn.onclick = async () => {
      const a = accounts.find(x => x.id === btn.dataset.accountWeg)
      if (!a) return
      // Alleen je eigen account, en dan nog met je pincode erbij. Weggeklikt
      // is weggeklikt: hierna log je uit naar een ander account.
      if (a.id !== actiefAccount) {
        await meldKort(I18N.t('accounts.verwijderen'), I18N.t('accounts.verwijderAnderTekst'))
        return
      }
      const ja = await vraagJaNee(I18N.t('accounts.verwijderen'),
        I18N.t('accounts.verwijderTekst', { naam: a.naam }),
        I18N.t('accounts.verwijderen'), 'gevaar')
      if (!ja) return

      let pin = ''
      if (a.heeftPin) {
        pin = await vraagPin(I18N.t('accounts.verwijderen'),
          I18N.t('accounts.verwijderPinTekst', { naam: a.naam }),
          I18N.t('accounts.verwijderen'))
        if (pin === null) return
      }

      const r = await window.api.accountRemove({ id: a.id, pin })
      if (!r || !r.ok) {
        const reden = (r && r.reden) || 'laatste'
        await meldKort(I18N.t('accounts.verwijderen'), I18N.t(
          reden === 'pin-fout'    ? 'accounts.verwijderPinFout'
          : reden === 'niet-jezelf' ? 'accounts.verwijderAnderTekst'
          :                           'accounts.laatsteAccount'))
        return
      }
      // Het projectbestand blijft staan; dat zeggen we er ook bij.
      await meldKort(I18N.t('accounts.verwijderd'), I18N.t('accounts.bestandBlijft', { bestand: r.bestand || '' }))

      // Het account waar je in zat bestaat niet meer. Eerst hier alles leeg —
      // anders staan de projecten en git-mappen van een verdwenen account nog
      // in beeld — en daarna inloggen op wat er nog over is.
      try { window.api.gitPaden({ accountId: r.actief, paden: [] }) } catch {}
      try { window.api.gitProjecten({ accountId: r.actief, lijst: [] }) } catch {}
      projects = []; activeId = ''; gitStaten = {}
      gitRemoteGedaan.clear()
      for (const k of Object.keys(gitLaatsteFetch)) delete gitLaatsteFetch[k]
      wisBewaardePanelen()
      renderSidebar()

      await laadAccounts()
      // laadAccounts zet actiefAccount alvast op het volgende account; leegmaken
      // zodat de wissel écht langs de pincode gaat en niet stilletjes overslaat.
      actiefAccount = ''
      await wisselAccount(r.actief, null, { geenWerkcontrole: true })
      renderSettingsPanel()
    }
  })
  const accountAdd = document.getElementById('btn-account-add')
  if (accountAdd) accountAdd.onclick = async () => {
    const gelukt = await voegAccountToe()
    if (gelukt) renderSettingsPanel()
  }

  panel.querySelectorAll('[data-account-git]').forEach(btn => {
    btn.onclick = async () => {
      const a = accounts.find(x => x.id === btn.dataset.accountGit)
      if (!a) return
      const git = await vraagGitIdentiteit(a.naam, a)
      if (!git) return
      if (!await bewaarAccountGit(a, git)) return
      renderSettingsPanel()
    }
  })

  panel.querySelectorAll('[data-account-pin]').forEach(btn => {
    btn.onclick = async () => {
      const a = accounts.find(x => x.id === btn.dataset.accountPin)
      if (!a) return
      const pin = await vraagNieuwePin(I18N.t('accounts.pinVoorTitel', { naam: a.naam }))
      if (pin === null) return
      const r = await window.api.accountSetPin({ id: a.id, pin })
      if (!r || !r.ok) { await meldKort(I18N.t('accounts.pinWijzigen'), I18N.t('accounts.pinOngeldig')); return }
      await laadAccounts(); renderSettingsPanel()
    }
  })

  const gitInlog = document.getElementById('btn-git-inloggen')
  if (gitInlog) gitInlog.onclick = () => githubInloggen()

  const gitPoll = document.getElementById('set-git-poll')
  if (gitPoll) gitPoll.onchange = () => {
    settings.git = { ...(settings.git || {}), pollSec: parseInt(gitPoll.value, 10) }
    window.api.saveSettings(settings)
    startGitPolling()          // meteen op de nieuwe stand, niet pas na herstart
  }

  const gitFetchVak = document.getElementById('set-git-fetch')
  if (gitFetchVak) gitFetchVak.onchange = (e) => {
    settings.git = { ...(settings.git || {}), fetchBijOpenen: e.target.checked }
    window.api.saveSettings(settings)
  }

  renderGitProfielen()
  const profielKnop = document.getElementById('btn-add-git-profiel')
  if (profielKnop) profielKnop.onclick = () => {
    const nieuw = GitTools.maakProfiel({ id: 'gp_' + Date.now().toString(36) })
    zetGitProfielen([...gitProfielen(), nieuw],
      gitStandaardProfielId() || nieuw.id)   // de eerste is vanzelf de standaard
    renderGitProfielen()
    document.querySelector(`[data-gp-naam="${nieuw.id}"]`)?.focus()
  }

  const wisKeuze = document.getElementById('set-wiswijze')
  if (wisKeuze) wisKeuze.onchange = () => {
    settings.knopVerwijderen = wisKeuze.value
    window.api.saveSettings(settings)
    renderSettingsPanel()      // de herstelknop hoort alleen bij "alleen hier"
  }
  const wisHerstel = document.getElementById('wis-herstel')
  if (wisHerstel) wisHerstel.onclick = herstelVerborgenKnoppen
  document.getElementById('set-mapgroottes').onchange = (e) => {
    settings.mapGroottes = e.target.checked
    window.api.saveSettings(settings)
    if (settings.mapGroottes) startMapGroottes()
  }
  document.getElementById('hist-seed').onclick = async () => {
    const r = await window.api.seedDefaults()
    if (r && r.history) history = r.history
    renderSettingsPanel(); renderSidebar()
    showToast(r?.added ? I18N.t('settings.history.seedAddedToast', { count: r.added }) : I18N.t('settings.history.seedNoneToast'))
  }
  document.getElementById('hist-clear-recent').onclick = async () => {
    if (!await vraagJaNee(I18N.t('settings.history.clearRecentConfirmTitle'), I18N.t('settings.history.clearRecentConfirmText'), I18N.t('common.clear'), 'gevaar')) return
    history = await window.api.clearHistory({ what: 'recent' })
    renderSettingsPanel(); renderSidebar(); showToast(I18N.t('settings.history.clearedRecentToast'))
  }
  document.getElementById('hist-clear-all').onclick = async () => {
    if (!await vraagJaNee(I18N.t('settings.history.clearAllConfirmTitle'), I18N.t('settings.history.clearAllConfirmText'), I18N.t('settings.history.clearAllButton'), 'gevaar')) return
    history = await window.api.clearHistory({ what: 'all' })
    renderSettingsPanel(); renderSidebar(); showToast(I18N.t('settings.history.clearedAllToast'))
  }

  document.getElementById('settings-save').onclick = () => {
    settings.autoFix = {
      enabled: document.getElementById('autofix-check').checked,
    }
    settings.history = {
      ...(settings.history || {}),
      enabled:    document.getElementById('hist-enabled').checked,
      persist:    document.getElementById('hist-persist').checked,
      maxRecent:  Math.max(10, parseInt(document.getElementById('hist-max-recent').value)  || 300),
      maxEntries: Math.max(50, parseInt(document.getElementById('hist-max-entries').value) || 2000),
    }
    // Regels zonder pad zijn half ingevuld; die bewaren we niet.
    settings.customEditors = (settings.customEditors || [])
      .filter(e => (e.path || '').trim())
      .map(e => ({ ...e, label: (e.label || '').trim() || I18N.t('settings.customEditors.defaultLabel'), path: e.path.trim() }))
    window.api.saveSettings(settings)
    showToast(I18N.t('settings.savedToast'))
    vraagProjectHertekenen()
  }
}

// ── Instellingen: AI-diensten ─────────────────────────────────────────────────
// De lijst met diensten komt uit het hoofdproces (ai-providers.js). Sleutels
// gaan er wel naartoe maar komen er nooit uit: hier zie je alleen óf er een is
// en waar hij vandaan komt.
let aiSettingsHerladen = false

function aiSettingsMarkup() {
  const titel = I18N.t('settings.section.aiTitle')
  if (!aiProviders.length) {
    return `<div>
      <div class="settings-section-title">${titel}</div>
      <div class="hint-row">${I18N.t('settings.ai.loadingHint')}</div>
    </div>`
  }

  const cfg     = settings.ai || {}
  const dienst  = aiInfo(cfg.provider) || aiProviders[0]
  const model   = (cfg.modellen  || {})[dienst.id] || dienst.standaardModel || ''
  const endpoint= (cfg.endpoints || {})[dienst.id] || ''

  const status = !dienst.sleutelNodig
    ? `<span class="ai-status ok">${esc(I18N.t('ai.status.noKeyNeeded'))}</span>`
    : dienst.heeftSleutel
      ? `<span class="ai-status ok">${esc(I18N.t('ai.status.keyFrom', { source: dienst.sleutelBron }))}</span>`
      : `<span class="ai-status uit">${esc(I18N.t('ai.status.noKey'))}</span>`

  const dienstOpties = aiProviders.map(p =>
    `<option value="${esc(p.id)}" ${p.id === dienst.id ? 'selected' : ''}>${esc(p.label)} — ${esc(p.merk)}</option>`).join('')

  // De ingebouwde lijst plus wat er bij de dienst is opgehaald, plus het model
  // dat je zelf hebt ingetypt — anders zou dat uit de keuzelijst verdwijnen.
  const bekend = aiAlleModellen(dienst.id)
  const modelOpties =
    (model ? '' : `<option value="" selected>${esc(I18N.t('settings.ai.pickModelOption'))}</option>`)
    + bekend.map(m =>
        `<option value="${esc(m.id)}" ${m.id === model ? 'selected' : ''}>${esc(m.label ? m.id + ' — ' + m.label : m.id)}</option>`).join('')
    + ((!model || bekend.some(m => m.id === model)) ? ''
       : `<option value="${esc(model)}" selected>${esc(model)}</option>`)

  return `<div>
    <div class="settings-section-title">${titel}</div>
    <p style="font-size:11px;color:var(--muted);margin:4px 0 8px">${I18N.t('settings.ai.hint')}</p>

    <div class="ai-rij">
      <div class="ai-rij-naam"><i class="ti ti-sparkles"></i> ${I18N.t('settings.ai.providerLabel')}</div>
      <select class="loc-select" id="ai-provider">${dienstOpties}</select>
      <select class="loc-select" id="ai-model">${modelOpties}</select>
      <button class="term-btn" id="ai-models-fetch" title="${esc(I18N.t('settings.ai.fetchModelsTitle'))}"><i class="ti ti-refresh" style="font-size:13px"></i> ${I18N.t('settings.ai.fetchModelsButton')}</button>
    </div>

    <div class="ai-rij">
      <div class="ai-rij-naam"><i class="ti ti-key"></i> ${I18N.t('settings.ai.keyLabel')}</div>
      <input class="field mono" type="password" id="ai-key" autocomplete="off"
             placeholder="${esc(I18N.t('settings.ai.keyPlaceholder'))}" />
      <button class="term-btn" id="ai-key-save"><i class="ti ti-device-floppy" style="font-size:13px"></i> ${I18N.t('common.save')}</button>
      <button class="term-btn" id="ai-key-clear"><i class="ti ti-eraser" style="font-size:13px"></i> ${I18N.t('common.clear')}</button>
      <button class="term-btn" id="ai-test"><i class="ti ti-plug-connected" style="font-size:13px"></i> ${I18N.t('settings.ai.testButton')}</button>
      ${status}
    </div>
    <p style="font-size:11px;color:var(--muted);margin:0 0 8px">
      ${I18N.t('settings.ai.keyHint', { where: dienst.sleutelWaar || '', env: dienst.sleutelEnv || '' })}
    </p>

    <div class="ai-rij">
      <div class="ai-rij-naam"><i class="ti ti-world"></i> ${I18N.t('settings.ai.endpointLabel')}</div>
      <input class="field mono" id="ai-endpoint" value="${esc(endpoint)}" placeholder="${esc(dienst.url || '')}" />
    </div>

    <div class="ai-rij">
      <div class="ai-rij-naam"><i class="ti ti-message-2"></i> ${I18N.t('settings.ai.systemLabel')}</div>
      <textarea class="field mono" id="ai-systeem" rows="2"
                placeholder="${esc(I18N.t('settings.ai.systemPlaceholder'))}">${esc(cfg.systeem || '')}</textarea>
    </div>

    <div class="ai-rij">
      <input type="checkbox" id="ai-knoppen" ${cfg.knoppen !== false ? 'checked' : ''} />
      <div class="ai-rij-naam">${I18N.t('settings.ai.buttonsLabel')}</div>
      <span class="instel-uitleg">${I18N.t('settings.ai.buttonsDesc')}</span>
    </div>

    <div class="ai-rij">
      <input type="checkbox" id="ai-mapin" ${cfg.mapInSysteem !== false ? 'checked' : ''} />
      <div class="ai-rij-naam">${I18N.t('settings.ai.cwdLabel')}</div>
      <label style="font-size:11px;color:var(--muted)">${I18N.t('settings.ai.maxTokensLabel')}
        <input class="field mono" type="number" min="256" max="32000" id="ai-maxtokens"
               value="${Number(cfg.maxTokens) || 4096}" style="width:90px" />
      </label>
    </div>
  </div>`
}

function bedraadAiSettings() {
  // Nog geen lijst binnen: één keer ophalen en dan opnieuw tekenen.
  if (!aiProviders.length) {
    if (aiSettingsHerladen) return
    aiSettingsHerladen = true
    aiLaadProviders().then(() => { if (view === 'settings') renderSettingsPanel() })
    return
  }
  aiSettingsHerladen = false

  const $$ = (id) => document.getElementById(id)
  const cfg = () => (settings.ai = { ...(settings.ai || {}) })
  const dienstId = () => $$('ai-provider')?.value || (settings.ai || {}).provider

  const bewaar = () => window.api.saveSettings(settings)

  if ($$('ai-provider')) $$('ai-provider').onchange = () => {
    cfg().provider = $$('ai-provider').value
    bewaar()
    renderSettingsPanel()
  }

  if ($$('ai-model')) $$('ai-model').onchange = () => {
    const c = cfg()
    c.modellen = { ...(c.modellen || {}), [dienstId()]: $$('ai-model').value }
    bewaar()
  }

  if ($$('ai-endpoint')) $$('ai-endpoint').onchange = () => {
    const c = cfg()
    c.endpoints = { ...(c.endpoints || {}), [dienstId()]: $$('ai-endpoint').value.trim() }
    bewaar()
  }

  if ($$('ai-systeem')) $$('ai-systeem').onchange = () => { cfg().systeem = $$('ai-systeem').value; bewaar() }
  if ($$('ai-mapin'))   $$('ai-mapin').onchange   = () => { cfg().mapInSysteem = $$('ai-mapin').checked; bewaar() }
  if ($$('ai-knoppen')) $$('ai-knoppen').onchange = () => {
    cfg().knoppen = $$('ai-knoppen').checked
    bewaar()
    aiKnopStempel = null       // de rij wordt opnieuw opgebouwd zodra je terug bent
  }
  if ($$('ai-maxtokens')) $$('ai-maxtokens').onchange = () => {
    cfg().maxTokens = Math.min(32000, Math.max(256, parseInt($$('ai-maxtokens').value) || 4096))
    bewaar()
  }

  if ($$('ai-key-save')) $$('ai-key-save').onclick = async () => {
    const veld = $$('ai-key')
    const sleutel = (veld?.value || '').trim()
    if (!sleutel) { showToast(I18N.t('settings.ai.keyEmptyToast')); return }
    const r = await window.api.aiZetSleutel({ providerId: dienstId(), sleutel })
    if (veld) veld.value = ''
    await aiLaadProviders()
    showToast(r && r.versleuteld ? I18N.t('settings.ai.keySavedToast') : I18N.t('settings.ai.keySavedPlainToast'))
    aiKnopStempel = null      // de rij wordt opnieuw opgebouwd zodra je terug bent
    renderSettingsPanel()
  }

  if ($$('ai-key-clear')) $$('ai-key-clear').onclick = async () => {
    await window.api.aiZetSleutel({ providerId: dienstId(), sleutel: '' })
    await aiLaadProviders()
    showToast(I18N.t('settings.ai.keyClearedToast'))
    renderSettingsPanel()
  }

  if ($$('ai-models-fetch')) $$('ai-models-fetch').onclick = async () => {
    const knop = $$('ai-models-fetch')
    knop.disabled = true
    const id = dienstId()
    const r = await aiHaalModellen(id, ((settings.ai || {}).endpoints || {})[id] || '')
    knop.disabled = false
    if (r.ok) {
      showToast(I18N.t('settings.ai.modelsFetchedToast', { count: (r.modellen || []).length }))
      renderSettingsPanel()
      return
    }
    const bericht = r.soort === 'sleutel' ? I18N.t('ai.status.noKey')
                  : r.soort === 'http'    ? `HTTP ${r.status} — ${r.bericht || ''}`
                  : r.bericht || r.soort
    showToast(I18N.t('settings.ai.modelsFailToast', { message: bericht }))
  }

  if ($$('ai-test')) $$('ai-test').onclick = async () => {
    const knop = $$('ai-test')
    knop.disabled = true
    showToast(I18N.t('settings.ai.testingToast'))
    const c = settings.ai || {}
    const id = dienstId()
    const r = await window.api.aiTest({
      providerId: id,
      model: (c.modellen || {})[id] || '',
      endpoint: (c.endpoints || {})[id] || '',
    })
    knop.disabled = false
    if (r && r.ok) { showToast(I18N.t('settings.ai.testOkToast', { model: r.model || '' })); return }
    const soort = (r && r.soort) || 'onbekendefout'
    const bericht = soort === 'sleutel' ? I18N.t('ai.status.noKey')
                  : soort === 'http'    ? `HTTP ${r.status} — ${r.bericht || ''}`
                  : (r && r.bericht) || soort
    showToast(I18N.t('settings.ai.testFailToast', { message: bericht }))
  }
}

function taalNaam(code) {
  return LANGUAGES.find(l => l.code === code)?.nativeName || code || '—'
}

// Talen-subpagina: zoekbalk boven, Windows-taal als eerste gepinde item,
// daarna de rest van de lijst (gefilterd op eigen naam, Engelse naam of code).
function renderTalenSubPage(panel) {
  const huidige  = settings.language
  const term     = talenZoekterm.trim().toLowerCase()
  const matcht   = (l) => !term
    || l.nativeName.toLowerCase().includes(term)
    || l.englishName.toLowerCase().includes(term)
    || l.code.toLowerCase().includes(term)

  const gepind   = LANGUAGES.find(l => l.code === detectedLanguageCode)
  const overige  = LANGUAGES
    .filter(l => l.code !== detectedLanguageCode)
    .filter(matcht)
    .sort((a, b) => a.nativeName.localeCompare(b.nativeName))

  const rij = (l, isGepind) => `
    <div class="settings-proj-item" data-lang-code="${esc(l.code)}">
      <i class="ti ${l.code === huidige ? 'ti-circle-check-filled' : 'ti-circle'}" style="font-size:20px;color:${l.code === huidige ? 'var(--accent)' : 'var(--muted2)'}"></i>
      <div class="settings-proj-info">
        <div class="settings-proj-name">${esc(l.nativeName)}${isGepind ? ` <span style="color:var(--muted2);font-weight:400">· ${I18N.t('talen.windowsTag')}</span>` : ''}</div>
        <div class="settings-proj-locs">${esc(l.englishName)}</div>
      </div>
    </div>
  `

  panel.innerHTML = `
    <div class="settings-header">
      <button class="settings-proj-edit" id="talen-terug" style="flex-shrink:0"><i class="ti ti-arrow-left"></i> ${I18N.t('common.back')}</button>
      <span class="settings-header-title">${I18N.t('talen.pageTitle')}</span>
    </div>
    <div class="dict-toolbar" style="border-bottom:1px solid var(--border);padding:12px 22px">
      <div class="dict-search-wrap">
        <i class="ti ti-search"></i>
        <input class="field dict-search" id="talen-zoek" placeholder="${I18N.t('talen.searchPlaceholder')}" value="${esc(talenZoekterm)}" autofocus />
      </div>
    </div>
    <div class="settings-body">
      <div>
        ${gepind && matcht(gepind) ? rij(gepind, true) : ''}
        ${overige.map(l => rij(l, false)).join('') || (term ? `<div class="hint-row">${I18N.t('talen.noResults')}</div>` : '')}
      </div>
    </div>
  `

  document.getElementById('talen-terug').onclick = () => {
    settingsSubPage = null
    renderSettingsPanel()
  }

  const zoekInput = document.getElementById('talen-zoek')
  zoekInput.oninput = (e) => { talenZoekterm = e.target.value; renderTalenSubPage(panel) }
  zoekInput.focus()
  zoekInput.selectionStart = zoekInput.selectionEnd = zoekInput.value.length

  panel.querySelectorAll('[data-lang-code]').forEach(row => {
    row.onclick = async () => {
      const code = row.dataset.langCode
      if (code === settings.language) return
      settings.language = code
      await window.api.saveSettings(settings)
      await I18N.setLanguage(code)
      showToast(I18N.t('talen.setToast', { name: taalNaam(code) }))
      renderTalenSubPage(panel)
    }
  })
}

// Beheerlijst van de eigen editors. Ze worden direct in settings bijgehouden en
// pas weggeschreven bij het opslaan van de instellingen, net als de rest.
function renderCustomEditors() {
  const box = document.getElementById('custom-editor-list')
  if (!box) return
  const lijst = settings.customEditors || []

  if (!lijst.length) {
    box.innerHTML = `<div class="hint-row">${I18N.t('settings.customEditors.emptyHint')}</div>`
    return
  }

  box.innerHTML = lijst.map((e, i) => `
    <div class="editor-row ${e.enabled !== false ? 'enabled' : ''}">
      <input type="checkbox" data-ce-on="${esc(e.id)}" ${e.enabled !== false ? 'checked' : ''} />
      <span class="prog-kleur-vak ${progKleurCls(e, i)}" title="${esc(I18N.t('settings.customEditors.colorTitle'))}"></span>
      <div class="editor-row-name">
        <i class="ti ${progIcoon(e)}"></i>
        <input class="field editor-label-input" id="ce-label-${esc(e.id)}" data-ce-label="${esc(e.id)}"
               value="${esc(e.label || '')}" placeholder="${I18N.t('settings.customEditors.namePlaceholder')}" style="width:110px;padding:4px 7px" />
      </div>
      <div class="editor-path-wrap">
        <input class="field mono" data-ce-path="${esc(e.id)}" value="${esc(e.path || '')}" placeholder="${esc(I18N.t('settings.customEditors.pathPlaceholder'))}" />
        <button class="editor-browse" data-ce-pick="${esc(e.id)}" title="${I18N.t('settings.editors.pickInstalledTitle')}"><i class="ti ti-apps"></i></button>
        <button class="editor-browse" data-ce-browse="${esc(e.id)}" title="${I18N.t('settings.editors.browseTitle')}"><i class="ti ti-folder-open"></i></button>
        <button class="cmdvis-del" data-ce-del="${esc(e.id)}" title="${I18N.t('settings.editors.removeTitle')}"><i class="ti ti-x"></i></button>
      </div>
    </div>`).join('')

  const vind = id => (settings.customEditors || []).find(x => x.id === id)
  box.querySelectorAll('[data-ce-on]').forEach(el =>
    el.onchange = () => { vind(el.dataset.ceOn).enabled = el.checked; renderCustomEditors() })
  box.querySelectorAll('[data-ce-label]').forEach(el =>
    el.oninput = () => { vind(el.dataset.ceLabel).label = el.value })
  box.querySelectorAll('[data-ce-path]').forEach(el =>
    el.oninput = () => { vind(el.dataset.cePath).path = el.value })
  box.querySelectorAll('[data-ce-browse]').forEach(el =>
    el.onclick = async () => {
      const gekozen = await window.api.pickExe()
      if (!gekozen) return
      vind(el.dataset.ceBrowse).path = gekozen
      renderCustomEditors()
    })
  box.querySelectorAll('[data-ce-pick]').forEach(el =>
    el.onclick = () => openProgramModal((p) => {
      const ed = vind(el.dataset.cePick)
      ed.path = p.pad
      if (!(ed.label || '').trim()) ed.label = p.naam
      renderCustomEditors()
    }))
  box.querySelectorAll('[data-ce-del]').forEach(el =>
    el.onclick = () => {
      settings.customEditors = (settings.customEditors || []).filter(x => x.id !== el.dataset.ceDel)
      renderCustomEditors()
    })
}

// ── Git-profielen beheren ─────────────────────────────────────────────────────
// Eén profiel is één persoon: de naam die in de geschiedenis komt, en welk
// GitHub-account daarbij hoort. Het label is er alleen voor jezelf ("werk",
// "privé") en mag leeg blijven.
function zetGitProfielen(lijst, standaard) {
  settings.git = {
    ...(settings.git || {}),
    profielen: lijst.map(p => GitTools.maakProfiel(p)),
    standaardProfiel: standaard !== undefined ? String(standaard || '') : gitStandaardProfielId(),
  }
  window.api.saveSettings(settings)
}

function renderGitProfielen() {
  const box = document.getElementById('git-profiel-lijst')
  if (!box) return
  const lijst = gitProfielen()

  if (!lijst.length) {
    box.innerHTML = `<div class="hint-row">${esc(I18N.t('settings.git.profielEmptyHint'))}</div>`
    return
  }

  const standaard = gitStandaardProfielId()
  box.innerHTML = lijst.map(p => `
    <div class="git-profiel-rij ${GitTools.profielGeldig(p) ? '' : 'onaf'}">
      <label class="git-profiel-std" title="${esc(I18N.t('settings.git.profielStdTitle'))}">
        <input type="radio" name="git-profiel-std" data-gp-std="${esc(p.id)}" ${standaard === p.id ? 'checked' : ''} />
      </label>
      <input class="field" data-gp-label="${esc(p.id)}" value="${esc(p.label || '')}"
             placeholder="${esc(I18N.t('settings.git.profielLabelPlaceholder'))}" style="width:80px;padding:4px 7px" />
      <input class="field" data-gp-naam="${esc(p.id)}" value="${esc(p.naam || '')}"
             placeholder="${esc(I18N.t('settings.git.profielNamePlaceholder'))}" style="width:120px;padding:4px 7px" />
      <input class="field mono" data-gp-email="${esc(p.id)}" value="${esc(p.email || '')}"
             placeholder="${esc(I18N.t('settings.git.profielEmailPlaceholder'))}" style="flex:1;min-width:150px;padding:4px 7px" />
      <button class="cmdvis-del" data-gp-del="${esc(p.id)}" title="${esc(I18N.t('settings.git.profielRemoveTitle'))}"><i class="ti ti-x"></i></button>
      <div class="git-profiel-tweede">
        <i class="ti ti-brand-github"></i>
        <input class="field mono" data-gp-gh="${esc(p.id)}" value="${esc(p.ghGebruiker || '')}"
               placeholder="${esc(I18N.t('settings.git.profielGhPlaceholder'))}" style="width:130px;padding:4px 7px" />
        <select class="loc-select" data-gp-inlog="${esc(p.id)}" style="width:auto">
          <option value="onthouden" ${p.inloggen !== 'vragen' ? 'selected' : ''}>${esc(I18N.t('settings.git.inlogRemember'))}</option>
          <option value="vragen" ${p.inloggen === 'vragen' ? 'selected' : ''}>${esc(I18N.t('settings.git.inlogAsk'))}</option>
        </select>
        ${GitTools.profielGeldig(p) ? '' : `<span class="git-profiel-onaf">${esc(I18N.t('settings.git.profielIncomplete'))}</span>`}
      </div>
    </div>`).join('')

  // Bewerken schrijft rechtstreeks in settings; onchange en niet oninput, zodat
  // er niet bij elke aanslag naar schijf wordt geschreven.
  const zet = (id, veld, waarde) => {
    zetGitProfielen(gitProfielen().map(p => p.id === id ? { ...p, [veld]: waarde } : p))
  }
  const bind = (attr, veld, hertekenen) => {
    box.querySelectorAll(`[data-gp-${attr}]`).forEach(el => {
      el.onchange = () => {
        zet(el.dataset['gp' + attr[0].toUpperCase() + attr.slice(1)], veld, el.value)
        if (hertekenen) renderGitProfielen()
      }
    })
  }
  bind('label', 'label', false)
  bind('naam', 'naam', true)      // hertekenen: "nog niet af" kan hierdoor weggaan
  bind('email', 'email', true)
  bind('gh', 'ghGebruiker', false)
  bind('inlog', 'inloggen', false)

  box.querySelectorAll('[data-gp-std]').forEach(el => {
    el.onchange = () => { zetGitProfielen(gitProfielen(), el.dataset.gpStd) }
  })

  box.querySelectorAll('[data-gp-del]').forEach(el => {
    el.onclick = async () => {
      const id = el.dataset.gpDel
      const p = GitTools.zoekProfiel(gitProfielen(), id)
      // Projecten die naar dit profiel wijzen vallen daarna terug op de
      // standaard. Dat is beter dan geen profiel, maar je moet het wel weten.
      const gebruikt = projects.filter(x => x.gitProfiel === id).length
      if (GitTools.profielGeldig(p) && !await vraagJaNee(
        I18N.t('settings.git.profielRemoveTitle'),
        I18N.t(gebruikt ? 'settings.git.profielRemoveUsed' : 'settings.git.profielRemoveText',
               { naam: GitTools.profielLabel(p), aantal: gebruikt }),
        I18N.t('common.delete'), 'gevaar')) return

      const over = gitProfielen().filter(x => x.id !== id)
      const std = gitStandaardProfielId() === id ? (over[0] ? over[0].id : '') : gitStandaardProfielId()
      zetGitProfielen(over, std)
      projects.forEach(x => { if (x.gitProfiel === id) x.gitProfiel = '' })
      saveProjects()
      renderGitProfielen()
      hertekenWeergave()
    }
  })
}

// ── Gevonden editors aanbieden ────────────────────────────────────────────────
// Bij het opstarten kijken we of er bekende editors op de pc staan die nog niet
// als knop bij je projecten zitten. Wat je wegklikt vragen we niet nog eens.
let gevondenEditors = []

function alGeconfigureerd() {
  const paden = new Set()
  const cats = new Set()
  const stammen = new Set()
  const voeg = (path, catalogId) => {
    if (path) {
      paden.add(padNorm(path))
      paden.add(String(path).toLowerCase())
      const s = padStam(path)
      if (s) stammen.add(s)
    }
    if (catalogId) cats.add(catalogId)
  }
  Object.entries(settings.editors || {}).forEach(([k, e]) => {
    const def = OUDE_EDITOR_DEFS.find(d => d.key === k)
    voeg(e?.path, def && def.catalogId)
  })
  ;(settings.customEditors || []).forEach(e => voeg(e?.path, e?.catalogId))
  return { paden, cats, stammen }
}

async function zoekEditors({ stil = false, automatisch = false } = {}) {
  let gevonden = []
  try { gevonden = await window.api.scanEditors() } catch {}

  const bestaand  = alGeconfigureerd()
  const geweigerd = new Set(settings.editorsGeweigerd || [])
  const norm = p => String(p || '').toLowerCase()

  gevondenEditors = gevonden.filter(g =>
    !bestaand.paden.has(padNorm(g.path)) &&
    !bestaand.paden.has(norm(g.path)) &&
    !bestaand.cats.has(g.id) &&
    !bestaand.stammen.has(padStam(g.path)) &&
    (!stil || !geweigerd.has(g.id)))

  if (!gevondenEditors.length) {
    if (!stil && !automatisch) showToast(I18N.t('settings.customEditors.noneFoundToast'))
    return 0
  }

  if (automatisch) {
    const n = gevondenEditors.length
    voegGevondenEditorsAutomatischToe()
    return n
  }

  toonGevondenEditors(stil)
  return gevondenEditors.length
}

function voegGevondenEditorsAutomatischToe() {
  const toegevoegd = gevondenEditors.map(g => maakCustomEditor(g))
  if (!toegevoegd.length) return
  settings.customEditors = [...(settings.customEditors || []), ...toegevoegd]
  settings.editorsGezocht = true
  window.api.saveSettings(settings)
  gevondenEditors = []
  vraagProjectHertekenen()
}

function toonGevondenEditors(stil) {
  const n = gevondenEditors.length
  document.getElementById('modal-found-title').textContent =
    n === 1 ? I18N.t('modal.foundEditors.titleOne') : I18N.t('modal.foundEditors.titleMany', { count: n })
  document.getElementById('found-uitleg').textContent = stil
    ? I18N.t('modal.foundEditors.explainSilent')
    : I18N.t('modal.foundEditors.explainManual')

  document.getElementById('found-list').innerHTML = gevondenEditors.map((g, i) => `
    <label class="found-item">
      <input type="checkbox" data-found="${i}" checked />
      <div class="found-main">
        <div class="found-naam">${esc(g.label)}</div>
        <div class="found-pad mono">${esc(shortenPath(g.path, 58))}</div>
      </div>
      <span class="found-bron">${esc(g.bron)}</span>
    </label>`).join('')

  document.getElementById('modal-found-skip').hidden = !stil
  document.getElementById('modal-found').hidden = false
}

function sluitGevondenEditors() {
  document.getElementById('modal-found').hidden = true
  gevondenEditors = []
  focusTerminalInput()
}

function voegGevondenEditorsToe() {
  const gekozen = [...document.querySelectorAll('[data-found]')]
    .filter(c => c.checked)
    .map(c => gevondenEditors[parseInt(c.dataset.found)])

  if (!gekozen.length) { sluitGevondenEditors(); return }

  settings.customEditors = [
    ...(settings.customEditors || []),
    ...gekozen.map(g => maakCustomEditor(g)),
  ]
  // Wat je niet aanvinkt hoeft niet nog eens gevraagd te worden
  const nietGekozen = gevondenEditors.filter(g => !gekozen.includes(g)).map(g => g.id)
  settings.editorsGeweigerd = [...new Set([...(settings.editorsGeweigerd || []), ...nietGekozen])]
  settings.editorsGezocht = true
  window.api.saveSettings(settings)

  showToast(gekozen.length === 1 ? I18N.t('modal.foundEditors.addedOneToast', { name: gekozen[0].label }) : I18N.t('modal.foundEditors.addedManyToast', { count: gekozen.length }))
  sluitGevondenEditors()
  vraagProjectHertekenen()
  if (view === 'settings') renderSettingsPanel()
}

function slaGevondenEditorsOver() {
  settings.editorsGeweigerd = [...new Set([...(settings.editorsGeweigerd || []), ...gevondenEditors.map(g => g.id)])]
  settings.editorsGezocht = true
  window.api.saveSettings(settings)
  sluitGevondenEditors()
}

// ── Programmakiezer ───────────────────────────────────────────────────────────
// De verkenner-map "Applications" bestaat niet echt op schijf, dus een
// bestandskiezer vindt daar niets. Deze lijst komt uit het startmenu en wijst
// wel naar de echte programma's.
let progLijst = []
let progKies  = null

async function openProgramModal(bijKeuze) {
  progKies = bijKeuze
  document.getElementById('prog-search').value = ''
  document.getElementById('prog-list').innerHTML = `<div class="prog-leeg">${I18N.t('common.searching')}</div>`
  document.getElementById('modal-prog').hidden = false

  try { progLijst = await window.api.listPrograms() } catch { progLijst = [] }
  renderProgramList()
  focusField('prog-search')
}

function renderProgramList() {
  const box = document.getElementById('prog-list')
  if (!box) return
  const q = (document.getElementById('prog-search')?.value || '').trim().toLowerCase()
  const tonen = (q ? progLijst.filter(p => p.naam.toLowerCase().includes(q) || p.pad.toLowerCase().includes(q)) : progLijst).slice(0, 300)

  if (!progLijst.length) {
    box.innerHTML = `<div class="prog-leeg">${I18N.t('modal.program.noneInStartMenu')}</div>`
    return
  }
  if (!tonen.length) { box.innerHTML = `<div class="prog-leeg">${I18N.t('modal.program.noMatch', { query: esc(q) })}</div>`; return }

  box.innerHTML = tonen.map((p, i) => `
    <button class="prog-item" data-prog="${i}">
      <i class="ti ti-app-window"></i>
      <span class="prog-item-main">
        ${esc(p.naam)}
        <span class="prog-item-pad">${esc(shortenPath(p.pad, 60))}</span>
      </span>
    </button>`).join('')

  box.querySelectorAll('[data-prog]').forEach(btn => {
    btn.onclick = () => {
      const p = tonen[parseInt(btn.dataset.prog)]
      // Eerst vastpakken: het sluiten wist de verwijzing naar deze functie.
      const bijKeuze = progKies
      closeProgramModal()
      bijKeuze?.(p)
    }
  })
}

function closeProgramModal() {
  document.getElementById('modal-prog').hidden = true
  progKies = null
}

// ── Terminal ──────────────────────────────────────────────────────────────────
// Programma's die hun voortgang laten zien tekenen die steeds opnieuw: cursor
// verplaatsen, regel wissen, opnieuw schrijven. In een echte terminal zie je
// dan een balk die vult; in een lijst met regels zie je de stuurcodes zelf,
// zoals `[?25l[A[1G`. Die halen we eruit, en van een regel die zichzelf
// overschrijft houden we de laatste stand over.
// Zoveel regels blijven er in beeld staan; wat ouder is verdwijnt.
const MAX_UITVOERREGELS = 2000

const STUURCODES = /\x1b\][\s\S]*?(?:\x07|\x1b\\)|\x1b[@-Z\\-_]|\x1b\[[0-?]*[ -\/]*[@-~]/g

function schoonUitvoer(tekst) {
  const zonder = String(tekst ?? '').replace(STUURCODES, '')
  const kaal = zonder.includes('\n') ? zonder : zonder.split('\r').pop()
  return kaal.replace(/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/g, '')
}

function appendLineNaar(termId, elId, type, text) {
  text = schoonUitvoer(text)
  const term = document.getElementById(elId)
  if (!termOutput[termId]) termOutput[termId] = ''
  if (!term) return
  term.querySelector('.t-cursor')?.remove()
  if (type === 'sep') {
    const hr = document.createElement('div'); hr.className = 't-sep'; term.appendChild(hr)
  } else {
    const div = document.createElement('div'); div.className = `t-${type}`; div.textContent = text; term.appendChild(div)
  }
  const cursor = document.createElement('span'); cursor.className = 't-cursor'; term.appendChild(cursor)
  const teveel = term.childElementCount - MAX_UITVOERREGELS
  for (let i = 0; i < teveel; i++) term.firstElementChild?.remove()
  term.scrollTop = term.scrollHeight
  termOutput[termId] = term.innerHTML.replace('<span class="t-cursor"></span>', '')
}

function appendLine(type, text) {
  const term = termEl('terminal')
  if (!term) return
  text = schoonUitvoer(text)
  // Er komt uitvoer binnen: dan wil je die zien, niet de verkenner.
  if (type !== 'sep') springNaarOutput()
  term.querySelector('.t-cursor')?.remove()

  if (type === 'sep') {
    const hr = document.createElement('div'); hr.className = 't-sep'; term.appendChild(hr)
  } else {
    const div = document.createElement('div'); div.className = `t-${type}`; div.textContent = text; term.appendChild(div)
  }

  const cursor = document.createElement('span'); cursor.className = 't-cursor'; term.appendChild(cursor)

  // Een download of een lange build kan duizenden regels opleveren. Elke regel
  // is een element én komt in de bewaarde uitvoer terug; zonder grens wordt het
  // venster daar merkbaar traag van. De oudste regels mogen weg.
  const teveel = term.childElementCount - MAX_UITVOERREGELS
  for (let i = 0; i < teveel; i++) term.firstElementChild?.remove()

  term.scrollTop = term.scrollHeight
  if (!termOutput[activeTermId]) termOutput[activeTermId] = ''
  termOutput[activeTermId] = term.innerHTML.replace('<span class="t-cursor"></span>', '')
  plaatsStatus()

  // Detect flutter install complete — app is running on device
  const installDonePatterns = [
    /flutter run.*key commands/i,
    /to (quit|detach), press/i,
    /syncing files to device/i,
    /debug service listening/i,
    /\(F\)lutter \(D\)ebug/i,
    /flutter: observatory/i,
    /an observatory debugger/i,
    /running with sound null safety/i,
  ]
  if (installDonePatterns.some(r => r.test(text))) {
    setStatus('done', '✓ ' + I18N.t('term.appRunningStatus'))
  }

  if (type === 'fix') {
    setStatus('fixing', text.replace(/^⟳\s*/, '').slice(0, 72))
    if (text.startsWith('✓ Auto-fix')) {
      setStatus('done', text)
    } else if (text.startsWith('✗ Auto-fix')) {
      setStatus('failed', text)
    }
    return
  }

  if (type === 'manual') {
    setStatus('failed', text.replace(/^⚠\s*Handmatige actie:\s*/, '').slice(0, 72))
    return
  }

  if (type === 'warn') {
    return
  }

  // Process fully ended (exit codes) — alleen voor losse commando's zonder lopende flow
  if (!cmdFlowActive && type === 'ok' && text.startsWith('✓')) {
    setStatus('ended', text)
    isRunning = false
    updateRunBtnIfVisible()
  } else if (!cmdFlowActive && type === 'err' && (text.startsWith('✗') || text.startsWith('Fout:'))) {
    setStatus('failed', text)
    isRunning = false
    updateRunBtnIfVisible()
  }
}

function updateRunBtnIfVisible() {
  const btn = document.getElementById('term-run-btn')
  if (!btn) return
  if (isRunning) {
    btn.innerHTML = '<i class="ti ti-player-stop"></i>'
    btn.classList.add('running')
    btn.title = I18N.t('term.stopTitle')
    btn.onclick = () => {
      window.api.killCmd()
      setStatus('failed', '✗ ' + I18N.t('term.stoppedStatus'))
      isRunning = false
      cmdFlowActive = false
      updateRunBtnIfVisible()
    }
  } else {
    btn.innerHTML = '<i class="ti ti-corner-down-left"></i>'
    btn.classList.remove('running')
    btn.title = I18N.t('term.runTitle')
    // Dezelfde submit-functie als de Enter-toets, zodat meerdere regels en het
    // leegmaken van het veld ook via de knop goed gaan.
    btn.onclick = () => { activeSubmitCmd?.() }
  }
}

// ── Command status pill ───────────────────────────────────────────────────────
// Los van de terminal, op body, zodat hij over de uitvoer blijft zweven.
// Hij hoort bij één scherm: op een andere pagina is hij weg, kom je terug
// dan staat hij er weer zolang het commando nog relevant is.
let statusHideTimer = null
let statusMelding = null   // { id, state, label } of null

function statusPastBijScherm() {
  if (!statusMelding) return false
  if (termTab !== 'output' && !termSplitAan()) return false
  if (view === 'project') return statusMelding.id === activeId
  if (view === 'cmd') return statusMelding.id === CMD_CTX_ID
  if (view === 'ps') return statusMelding.id === PS_CTX_ID
  return false
}

function plaatsStatus() {
  const el = document.getElementById('cmd-status')
  if (!el) return
  // Zelfde lijn als het knipperende balkje in de uitvoer; anders de invoerregel.
  const cursor = levend('#terminal .t-cursor')
  const invoer = levend('.term-input-wrap:not([hidden]) .term-input')
    || levend('.term-input-wrap:not([hidden])')
  const doel = cursor || invoer
  if (!doel) { el.style.bottom = ''; return }
  const r = doel.getBoundingClientRect()
  if (r.height <= 0) { el.style.bottom = ''; return }
  const h = el.offsetHeight || 28
  const midden = r.top + r.height / 2
  el.style.bottom = Math.max(4, Math.round(window.innerHeight - midden - h / 2)) + 'px'
}

function toonStatus() {
  const el  = document.getElementById('cmd-status')
  const lbl = document.getElementById('cmd-status-label')
  if (!el) return
  if (!statusPastBijScherm()) {
    el.classList.remove('show')
    return
  }
  el.className = `show ${statusMelding.state}`
  if (lbl) lbl.textContent = statusMelding.label
  plaatsStatus()
}

function keurStatusNa() {
  toonStatus()
}

function setStatus(state, label) {
  const el = document.getElementById('cmd-status')
  if (!el) return
  clearTimeout(statusHideTimer)

  if (state === 'hide') {
    statusMelding = null
    toonStatus()
    return
  }

  statusMelding = { id: activeTermId, state, label }
  if (state === 'ended') {
    statusHideTimer = setTimeout(() => {
      statusMelding = null
      toonStatus()
    }, 6000)
  }
  toonStatus()
}

// ── Run command ───────────────────────────────────────────────────────────────
let cmdFlowActive = false

// De context waarin een commando nu zou draaien: het geopende project, of de
// losse CMD-sectie met z'n eigen werkmap.
function currentCtx() {
  if (view === 'cmd') return cmdContext()
  if (view === 'ps') return psContext()
  return projects.find(x => x.id === activeId) || null
}

// Of een powershell-tekst nog een vervolgregel nodig heeft. Zelfde regels als
// in ps-launch.js: open { ( [ ", here-string, of een regel die eindigt op | + , ` of =.
function psScriptIncomplete(script) {
  const text = String(script || '')
  if (!text.trim()) return false
  const lines = text.split(/\r?\n/)
  let quote = null
  let here = null
  let paren = 0
  let brace = 0
  let bracket = 0

  for (let li = 0; li < lines.length; li++) {
    const line = lines[li]
    if (here) {
      if ((here === "'" && line.startsWith("'@")) || (here === '"' && line.startsWith('"@'))) here = null
      continue
    }
    for (let i = 0; i < line.length; i++) {
      const c = line[i]
      const next = line[i + 1]
      if (quote === "'") {
        if (c === "'" && next === "'") { i++; continue }
        if (c === "'") quote = null
        continue
      }
      if (quote === '"') {
        if (c === '`') { i++; continue }
        if (c === '"') quote = null
        continue
      }
      if (c === '`') {
        if (i === line.length - 1 && li === lines.length - 1) return true
        i++
        continue
      }
      if (c === '#') break
      if (c === '@' && (next === "'" || next === '"')) { here = next; break }
      if (c === "'" || c === '"') { quote = c; continue }
      if (c === '{') brace++
      else if (c === '}') brace = Math.max(0, brace - 1)
      else if (c === '(') paren++
      else if (c === ')') paren = Math.max(0, paren - 1)
      else if (c === '[') bracket++
      else if (c === ']') bracket = Math.max(0, bracket - 1)
    }
  }
  if (here || quote) return true
  if (brace > 0 || paren > 0 || bracket > 0) return true

  const last = [...lines].reverse().find(l => {
    const t = l.trim()
    return t && !t.startsWith('#')
  }) || ''
  const t = last.trimEnd()
  if (/[`|,+]$/.test(t)) return true
  if (/=\s*$/.test(t)) return true
  return false
}

function updateTermPrompt() {
  const prompt = levend('.term-input-prompt')
  if (!prompt) return
  if (aiAan(activeTermId)) {
    prompt.textContent = '✦'
    prompt.classList.add('ai')
    return
  }
  prompt.classList.remove('ai')
  if (view === 'ps') {
    const val = document.getElementById('term-input')?.value || ''
    prompt.textContent = psScriptIncomplete(val) ? '>>' : 'PS>'
  } else {
    prompt.textContent = '$'
  }
}

// `cd` in een los shell-proces heeft geen blijvend effect — elke opdracht start
// een nieuwe shell. We vangen 'm daarom af en verzetten de werkmap zelf.
function parseCd(cmd, project) {
  const s = String(cmd || '').trim()
  // Meerdere regels: laat de shell het hele script zien, niet alleen een cd.
  if (/[\r\n]/.test(s)) return null
  const isPs = project && project.id === PS_CTX_ID
  // `cd..` zonder spatie werkt in cmd en in powershell.
  if (/^(?:cd|chdir)\.\.$/i.test(s)) return '..'
  if (isPs && /^(?:sl|set-location)\.\.$/i.test(s)) return '..'
  const re = isPs
    ? /^(?:cd|chdir|sl|set-location)\s+(?:-Path\s+|-LiteralPath\s+)?(.+)$/i
    : /^(?:cd|chdir)\s+(?:\/d\s+)?(.+)$/i
  const m = s.match(re)
  if (!m) return null
  return m[1].trim().replace(/^["']|["']$/g, '')
}

async function handleCd(target, project) {
  appendLine('cmd', `> cd ${target}`)

  // Relatief pad oplossen vanaf de huidige map, en controleren dat het bestaat.
  const loc = project.locations[project.activeLocation] || project.locations[0]
  const r = await window.api.resolveDir({ base: loc?.path || '', target })
  if (!r || !r.ok) {
    appendLine('err', r?.reason === 'geen map'
      ? I18N.t('term.notAFolderError', { path: r.path })
      : I18N.t('term.pathNotFoundError', { path: r?.path || target }))
    appendLine('sep', '')
    setStatus('failed', '✗ ' + I18N.t('term.folderDoesNotExistStatus'))
    return
  }
  target = r.path

  if (project.id === PS_CTX_ID) await setPsCwd(target)
  else await setCmdCwd(target)
  appendLine('ok',  '✓ ' + I18N.t('term.cwdSetLine', { target }))
  if (project.id !== CMD_CTX_ID && project.id !== PS_CTX_ID) {
    appendLine('warn', I18N.t('term.cmdSectionCwdWarning'))
  }
  appendLine('sep', '')
  if (view === 'cmd') renderCmdPanel()
  else if (view === 'ps') renderPsPanel()
  else updateTermPlaceholder(target)
}

// Dezelfde zoekregels als in main.js: meerdere woorden moeten allemaal
// voorkomen, en * en ? werken zoals je verwacht (*.mp3, foto?.jpg). Ze staan
// hier nog een keer omdat de renderer niets uit main.js kan lenen.
function zoekTermen(vraag) {
  return String(vraag || '').toLowerCase().split(/\s+/).filter(Boolean).map(term => {
    if (!/[*?]/.test(term)) return { tekst: term }
    const patroon = term.split('').map(teken =>
      teken === '*' ? '.*'
      : teken === '?' ? '.'
      : teken.replace(/[.+^${}()|[\]\\]/g, '\\$&')).join('')
    try { return { re: new RegExp('^' + patroon + '$') } } catch { return { tekst: term } }
  })
}

function pastBijFilter(naam, vraag) {
  const termen = zoekTermen(vraag)
  if (!termen.length) return true
  const n = String(naam || '').toLowerCase()
  return termen.every(t => t.re ? t.re.test(n) : n.includes(t.tekst))
}

// ── Zoeken in submappen ───────────────────────────────────────────────────────
// Het filter kijkt normaal alleen in de map waar je staat. Staat de knop aan,
// dan gaat dezelfde tekst als zoekopdracht de mappen eronder in. Dat duurt
// langer, dus het gebeurt pas als je even niets typt.
let zoekItems   = []
let zoekVraag   = ''
let zoekTimer   = null
let zoekToken   = 0        // waarmee binnenkomende treffers bij de juiste zoekopdracht horen
let zoekTeken   = null     // rem op het opnieuw tekenen tijdens het binnenstromen
let zoekAfgekapt = ''      // '' | 'genoeg' | 'tijd'
// 'uit' = niets aan de hand, 'wacht' = je typt nog, 'bezig' = hij loopt,
// 'klaar' = alles bekeken. Dit stuurt wat er in beeld staat; eerder stond er
// "niks gevonden" terwijl het zoeken nog moest beginnen.
let zoekStand   = 'uit'

function diepZoekenAan() { return verkennerVoorkeur().diep === true }

function zetDiepZoeken(aan) {
  zetVerkennerVoorkeur({ diep: aan })
  zetDiepZoekenUiterlijk()
  stopZoeken()
  planZoek()
  renderBrowser()
}

// De knop en het invoerveld laten zien in welke stand je staat.
function zetDiepZoekenUiterlijk() {
  const aan = diepZoekenAan()
  const knop = brEl('br-diep')
  if (knop) knop.classList.toggle('aan', aan)
  const veld = brEl('br-filter')
  if (veld) veld.placeholder = aan ? I18N.t('browser.deepSearchPlaceholder') : I18N.t('browser.filterPlaceholder')
}

function stopZoeken() {
  clearTimeout(zoekTimer); zoekTimer = null
  clearTimeout(zoekTeken); zoekTeken = null
  if (zoekStand === 'bezig') { try { window.api.stopZoeken() } catch {} }
  zoekToken++                 // wat er nog binnenkomt hoort bij niets meer
  zoekStand = 'uit'
  zoekItems = []
  zoekAfgekapt = ''
  zoekVraag = ''
}

// Treffers komen in stukjes binnen terwijl het zoeken doorloopt.
function zoekTrefferBinnen({ token, items }) {
  if (token !== zoekToken || zoekStand !== 'bezig') return
  if (!items || !items.length) return
  zoekItems = zoekItems.concat(items.map(i => ({ ...i, gevondenIn: i.map })))
  // Niet bij elk stukje opnieuw tekenen: dat maakt het zoeken alleen trager.
  if (zoekTeken) return
  zoekTeken = setTimeout(() => { zoekTeken = null; renderBrowser() }, 120)
}

// Wat er in het filterveld staat, met de spaties eraf.
function zoekTekst() {
  return (brEl('br-filter')?.value || '').trim()
}

function planZoek() {
  clearTimeout(zoekTimer)
  if (!diepZoekenAan()) return
  const vraag = zoekTekst()
  // Eén letter levert half de schijf op; daar heb je niets aan.
  if (vraag.length < 2) {
    if (zoekVraag || zoekStand !== 'uit') stopZoeken()
    return
  }
  // Meteen laten zien dat er iets gaat gebeuren, nog voor het zoeken begint.
  zoekVraag = vraag
  zoekStand = 'wacht'
  zoekItems = []
  zoekAfgekapt = ''
  zoekTimer = setTimeout(() => doeZoek(vraag), 350)
}

async function doeZoek(vraag) {
  const root = browserPath
  if (!root || root === DEZE_PC || inArchief(root)) { zoekStand = 'uit'; return }

  const token = ++zoekToken
  zoekVraag = vraag
  zoekStand = 'bezig'
  zoekItems = []
  zoekAfgekapt = ''
  browserSelectie = new Set()
  browserFocus = -1
  browserAnker = -1
  renderBrowser()

  let r
  try {
    r = await window.api.zoek({ root, vraag, token, max: 1000 })
  } catch (e) {
    r = { ok: false, reason: e && e.message ? e.message : String(e) }
  }

  // Ondertussen doorgetypt of weggenavigeerd? Dan hoort dit antwoord bij een
  // zoekopdracht die niet meer op het scherm staat.
  if (token !== zoekToken) return
  if (r?.afgebroken || vraag !== zoekTekst() || root !== browserPath) return

  clearTimeout(zoekTeken); zoekTeken = null
  zoekStand = 'klaar'
  if (!r || !r.ok) { zoekItems = []; renderBrowser(); return }

  // De volledige lijst uit het antwoord is de waarheid; wat onderweg binnenkwam
  // was alleen om niet naar een leeg scherm te hoeven kijken.
  zoekItems = (r.items || []).map(i => ({ ...i, gevondenIn: i.map }))
  zoekAfgekapt = r.afgekapt || ''
  renderBrowser()
}

// ── De boom onder "deze pc" ───────────────────────────────────────────────────
// De linkerkant: een boom die begint bij de schijven (C:, D:, …). Daaronder
// mappen en bestanden. Geen aparte "Deze pc"-regel — die staat al als sectiekop.
// Intern blijft DEZE_PC de sleutel waaronder de schijvenlijst hangt.
// Takken worden pas ingelezen als je ze openklapt.
let boomGekozen = ''             // wat je in de boom hebt aangeklikt
const boomKinderen = new Map()   // pad -> lijst met items
const boomBezig    = new Set()   // paden die op dit moment ingelezen worden
const boomFout     = new Map()   // pad -> waarom het niet lukte
const BOOM_MAX = 200             // zoveel regels per map; de rest zie je in de verkenner

// Verplaatsmodus: meerdere mappen/bestanden selecteren en naar een andere
// map slepen. Het pijltje (> / v) klapt alleen open/dicht — selecteert niets.
let boomVerplaatsModus = false
let boomSelectie = new Set()     // geselecteerde paden in de boom
let boomSelectieAnker = ''       // voor Shift+klik reeks

function zetBoomVerplaatsModus(aan) {
  const nieuw = aan == null ? !boomVerplaatsModus : !!aan
  boomVerplaatsModus = nieuw
  if (!nieuw) { boomSelectie.clear(); boomSelectieAnker = '' }
  else if (sorteerModus) { sorteerModus = ''; }
  renderSidebar()
  renderBoom()
}

function boomPadGelijk(a, b) {
  const kaal = (p) => String(p || '').replace(/[\\/]+$/, '').toLowerCase()
  return kaal(a) === kaal(b)
}

function boomIsInOfZelf(pad, mapPad) {
  const a = String(pad || '').replace(/[\\/]+$/, '').toLowerCase()
  const b = String(mapPad || '').replace(/[\\/]+$/, '').toLowerCase()
  if (!a || !b) return false
  return a === b || a.startsWith(b + '\\') || a.startsWith(b + '/')
}

function wisselBoomSelectie(pad, metShift = false) {
  if (!pad) return
  const rijen = boomRijen().filter(r => !r.meer && !r.schijf)
  if (metShift && boomSelectieAnker) {
    const van = rijen.findIndex(r => boomPadGelijk(r.pad, boomSelectieAnker))
    const naar = rijen.findIndex(r => boomPadGelijk(r.pad, pad))
    if (van >= 0 && naar >= 0) {
      const lo = Math.min(van, naar), hi = Math.max(van, naar)
      for (let i = lo; i <= hi; i++) boomSelectie.add(rijen[i].pad)
      renderBoom()
      return
    }
  }
  if (boomSelectie.has(pad)) boomSelectie.delete(pad)
  else boomSelectie.add(pad)
  boomSelectieAnker = pad
  renderBoom()
}

async function verplaatsPadenNaar(paden, doelMap) {
  if (!paden?.length || !doelMap || doelMap === DEZE_PC) return
  const schoon = [...new Set(paden)].filter(p => {
    if (!p || boomPadGelijk(p, doelMap)) return false
    if (boomIsInOfZelf(doelMap, p)) return false          // map in zichzelf / kind
    if (boomPadGelijk(ouderVan(p), doelMap)) return false // al in die map
    return true
  })
  if (!schoon.length) {
    showToast(I18N.t('tree.moveNothingToast'))
    return
  }

  let bijConflict = 'hernoemen'
  const c = await window.api.conflicten({ bronnen: schoon, doelMap })
  if (c?.ok && c.namen.length) {
    const keuze = await vraagKeuze({
      titel: c.namen.length === 1 ? I18N.t('dialog.conflictTitleOne') : I18N.t('dialog.conflictTitleMany', { count: c.namen.length }),
      regels: c.namen,
      knoppen: [
        { label: I18N.t('common.cancel'),          waarde: null },
        { label: I18N.t('dialog.conflictKeepBoth'), waarde: 'hernoemen', soort: 'primair' },
        { label: I18N.t('dialog.conflictReplace'),  waarde: 'vervangen', soort: 'gevaar' },
      ],
    })
    if (!keuze) return
    bijConflict = keuze
  }

  const r = await window.api.kopieerItems({ bronnen: schoon, doelMap, verplaatsen: true, bijConflict })
  if (!r || !r.ok) {
    showToast(I18N.t('error.pasteFailedPrefix') + (r?.reason || I18N.t('common.unknownError')))
    return
  }

  schoon.forEach(p => boomSelectie.delete(p))
  schoon.forEach(vergeetGroottes)
  vergeetGroottes(doelMap)
  // Ouders + doel opnieuw inlezen zodat de boom klopt
  const raak = new Set([doelMap, ...schoon.map(ouderVan)])
  raak.forEach(p => { if (p && p !== DEZE_PC) vergeetBoomTak(p) })
  vergeetBoomTak(doelMap)

  if (browserPath === doelMap || schoon.some(p => boomPadGelijk(ouderVan(p), browserPath))) {
    await navigeerNaar(browserPath)
  }

  if (r.afgebroken) showToast(I18N.t('toast.aborted'))
  else if (r.fouten?.length) showToast(r.fouten.join(' · '))
  else showToast(
    r.gedaan === 1
      ? I18N.t('toast.movedOne')
      : I18N.t('toast.movedMany', { count: r.gedaan }))
}

function boomOpenLijst() {
  // Nog nooit iets ingesteld? Lege lijst: de schijven staan toch altijd open
  // (die zijn het eerste niveau). Opengeklapte mappen komen er later bij.
  return Array.isArray(settings.boomOpen) ? settings.boomOpen : []
}
function boomIsOpen(pad) { return boomOpenLijst().includes(pad) }

function zetBoomOpen(pad, open) {
  const nu = new Set(boomOpenLijst())
  if (open) nu.add(pad); else nu.delete(pad)
  settings.boomOpen = [...nu]
  window.api.saveSettings(settings)
}

// De keten van schijf naar map: C:\a\lib wordt C:\, C:\a, C:\a\lib.
// We beginnen bij de schijf die al in de boom staat, niet bij het uiterlijk van
// het pad — dan klopt de eerste schakel altijd met de sleutel die de boom zelf
// gebruikt, en werkt het ook als een pad er anders uitziet dan verwacht.
function boomKeten(pad) {
  const schoon = String(pad || '').replace(/[\\/]+$/, '')
  if (!schoon) return []

  const kaal = (p) => String(p).replace(/[\\/]+$/, '')
  const schijf = (boomKinderen.get(DEZE_PC) || [])
    .map(s => s.pad)
    .find(p => {
      const k = kaal(p).toLowerCase()
      const l = schoon.toLowerCase()
      return l === k || l.startsWith(k + '\\') || l.startsWith(k + '/')
    })

  if (!schijf) {
    // Schijven nog niet ingelezen: dan afgaan op de vorm van het pad.
    // Een netwerkpad begint bij \\server\share; die twee delen horen bij elkaar
    // en vormen samen één schakel, want los is geen van beide een map.
    const wortel = GitTools.uncWortel(schoon)
    if (wortel) {
      const keten = [wortel]
      let nu = wortel
      for (const deel of schoon.slice(wortel.length).split(/[\\/]/).filter(Boolean)) {
        nu += '\\' + deel
        keten.push(nu)
      }
      return keten
    }
    if (!/^[a-z]:/i.test(schoon)) return []
    const delen = schoon.split(/[\\/]/)
    const keten = [delen[0] + '\\']
    for (let i = 1; i < delen.length; i++) {
      if (!delen[i]) continue
      keten.push(kaal(keten[keten.length - 1]) + '\\' + delen[i])
    }
    return keten
  }

  const scheider = schijf.includes('/') ? '/' : '\\'
  const rest = schoon.slice(kaal(schijf).length).split(/[\\/]/).filter(Boolean)
  const keten = [schijf]
  let nu = kaal(schijf)
  for (const deel of rest) {
    nu += scheider + deel
    keten.push(nu)
  }
  return keten
}

async function laadTak(pad, opnieuw = false) {
  if (!opnieuw && boomKinderen.has(pad)) return boomKinderen.get(pad)
  if (boomBezig.has(pad)) return null
  boomBezig.add(pad)
  boomFout.delete(pad)

  try {
    if (pad === DEZE_PC) {
      const schijven = await window.api.listDrives()
      onthoudNetwerkSchijven(schijven)
      boomKinderen.set(pad, (schijven || []).map(d => ({
        naam: wortelNaam(d),
        pad: d.path,
        dir: true,
        schijf: true,
        netwerk: !!d.netwerk,
        // null = nog niet uitgezocht. Dat is iets anders dan onbereikbaar, en de
        // boom hoort die twee niet door elkaar te halen.
        bereikbaar: d.bereikbaar === undefined ? true : d.bereikbaar,
      })))
    } else {
      const r = await window.api.listDir(pad)
      if (!r || !r.ok) {
        boomFout.set(pad, r?.reason || I18N.t('tree.cannotReadFolderError'))
        boomKinderen.set(pad, [])
      } else {
        boomKinderen.set(pad, (r.items || []).map(i => ({
          naam: i.name, pad: i.path, dir: !!i.dir, archief: !!i.archief,
        })))
      }
    }
  } catch (e) {
    boomFout.set(pad, e && e.message ? e.message : String(e))
    boomKinderen.set(pad, [])
  } finally {
    boomBezig.delete(pad)
  }
  return boomKinderen.get(pad)
}

// Wat in de verkenner verandert (plakken, verwijderen, hernoemen, aanmaken)
// moet de boom niet blijven tonen. De takken die open staan lezen we meteen
// opnieuw in; de rest wacht gewoon tot je hem openklapt.
function vergeetBoomTak(pad) {
  if (!boomKinderen.size) return
  const raak = []
  if (!pad) {
    raak.push(...boomKinderen.keys())
  } else {
    const laag = String(pad).toLowerCase()
    for (const k of boomKinderen.keys()) {
      const kl = k.toLowerCase()
      if (kl === laag || kl.startsWith(laag + '\\') || laag.startsWith(kl + '\\')) raak.push(k)
    }
  }
  if (!raak.length) return

  raak.forEach(k => boomKinderen.delete(k))
  const opnieuw = raak.filter(k => k === DEZE_PC || boomIsOpen(k))
  renderBoom()
  if (opnieuw.length) Promise.all(opnieuw.map(k => laadTak(k, true))).then(renderBoom)
}

async function wisselTak(pad) {
  const open = !boomIsOpen(pad)
  zetBoomOpen(pad, open)
  if (open && !boomKinderen.has(pad)) {
    renderBoom()                      // eerst het draaiende puntje laten zien
    await laadTak(pad)
  }
  renderBoom()
}

// Alles wat zichtbaar is, plat achter elkaar: makkelijker te tekenen en te
// testen dan geneste elementen.
function boomRijen() {
  const rijen = []
  const verzamel = (pad, diepte) => {
    const kinderen = boomKinderen.get(pad)
    if (!kinderen) return
    const mappen = kinderen.filter(k => k.dir)
    const rest   = kinderen.filter(k => !k.dir)
    const alles  = [...mappen, ...rest]
    alles.slice(0, BOOM_MAX).forEach(k => {
      rijen.push({ ...k, diepte })
      if (k.dir && boomIsOpen(k.pad)) verzamel(k.pad, diepte + 1)
    })
    if (alles.length > BOOM_MAX) {
      rijen.push({ pad, diepte, meer: alles.length - BOOM_MAX })
    }
  }
  // Schijven als eerste niveau — DEZE_PC is alleen de interne bak ervoor.
  verzamel(DEZE_PC, 0)
  return rijen
}

// Wat open hoort te staan maar leeg is, halen we op. Eén niveau per ronde: elke
// keer dat er iets binnenkomt tekent de boom opnieuw en komt het volgende
// niveau aan de beurt.
function vulOpenTakken(rijen) {
  const ophalen = rijen
    .filter(r => r.dir && boomIsOpen(r.pad) && !boomKinderen.has(r.pad) && !boomBezig.has(r.pad))
    .map(r => r.pad)
  if (!ophalen.length) return
  Promise.all(ophalen.map(p => laadTak(p))).then(renderBoom)
}

function boomIcoon(rij) {
  if (rij.schijf) return 'ti-database'
  if (rij.dir) return boomIsOpen(rij.pad) ? 'ti-folder-open' : 'ti-folder'
  if (rij.archief || ARCHIEF_EXT.test(rij.naam || '')) return 'ti-file-zip'
  return 'ti-file'
}

function bedraadBoom() {
  const knop = document.getElementById('boom-ververs')
  if (!knop || knop.dataset.bedraad) return
  knop.dataset.bedraad = '1'
  knop.onclick = async (e) => {
    e.stopPropagation()                     // niet de sectie in- of uitklappen
    const opnieuw = [DEZE_PC, ...boomOpenLijst().filter(p => p !== DEZE_PC)]
    boomKinderen.clear()
    boomFout.clear()
    renderBoom()
    for (const p of opnieuw) if (p === DEZE_PC || boomIsOpen(p)) await laadTak(p, true)
    renderBoom()
  }

  bedraadBoomHoogte()

  // Bij het opstarten de schijven meteen ophalen, zodat je niet eerst hoeft
  // te klikken om iets te zien.
  if (!boomKinderen.has(DEZE_PC)) laadTak(DEZE_PC).then(renderBoom)
}

// Hoogte van "deze pc" — twee knoppen:
// 1. boom-hoogte → max. hoogte instellen (vasthouden + swipen, grepen boven/onder)
// 2. boom-vol    → volledige hoogte: cmd + projecten tijdelijk weg
const BOOM_HOOGTE_MIN = 92
let dezepcVol = false

function boomHoogteModus() {
  return !!document.getElementById('boom-hoogte')?.classList.contains('aan')
}

function syncBoomGreep() {
  const onder = document.getElementById('boom-greep')
  const boven = document.getElementById('boom-greep-boven')
  const sectie = document.querySelector('.sidebar-sectie[data-zijsectie="dezepc"]')
  if (!sectie) return
  // In vol-modus geen grepen: de sectie vult al alles.
  const zichtbaar = boomHoogteModus() && !dezepcVol && !sectie.classList.contains('dicht')
  if (onder) onder.hidden = !zichtbaar
  if (boven) boven.hidden = !zichtbaar
}

function pasBoomHoogteToe() {
  const sectie = document.querySelector('.sidebar-sectie[data-zijsectie="dezepc"]')
  if (!sectie) return
  // Volledige hoogte wint: geen max-height, CSS zorgt voor het vullen.
  if (dezepcVol) {
    sectie.style.maxHeight = ''
    sectie.style.height = ''
    sectie.classList.remove('met-max')
    return
  }
  const h = settings.dezepcMaxHoogte
  const geldig = Number.isFinite(h) && h >= BOOM_HOOGTE_MIN
  if (geldig) {
    sectie.style.maxHeight = h + 'px'
    sectie.style.height = ''
    sectie.classList.add('met-max')
  } else {
    sectie.style.maxHeight = ''
    sectie.style.height = ''
    sectie.classList.remove('met-max')
  }
}

function pasDezepcVolToe() {
  const zijbalk = document.querySelector('.sidebar')
  const knop = document.getElementById('boom-vol')
  const sectie = document.querySelector('.sidebar-sectie[data-zijsectie="dezepc"]')
  if (zijbalk) zijbalk.classList.toggle('dezepc-vol', dezepcVol)
  if (knop) {
    knop.classList.toggle('aan', dezepcVol)
    knop.title = dezepcVol ? I18N.t('tree.fullHeightBackTitle') : I18N.t('sidebar.dezepcFullTitle')
    const icoon = knop.querySelector('i')
    if (icoon) icoon.className = 'ti ' + (dezepcVol ? 'ti-arrows-minimize' : 'ti-arrows-maximize')
  }
  // Vol aanzetten: sectie open houden en hoogte-modus uit (grepen weg).
  if (dezepcVol && sectie) {
    sectie.classList.remove('dicht')
    const inhoud = sectie.querySelector('.sectie-inhoud')
    if (inhoud) inhoud.hidden = false
    const pijl = sectie.querySelector('.sectie-pijl')
    if (pijl) pijl.className = 'ti sectie-pijl ti-chevron-down'
    const hoogteKnop = document.getElementById('boom-hoogte')
    if (hoogteKnop) hoogteKnop.classList.remove('aan')
    sectie.classList.remove('hoogte-zetten')
  }
  pasBoomHoogteToe()
  syncBoomGreep()
}

function boomHoogteStart() {
  const sectie = document.querySelector('.sidebar-sectie[data-zijsectie="dezepc"]')
  if (!sectie) return BOOM_HOOGTE_MIN
  const huidig = sectie.getBoundingClientRect().height
  return Number.isFinite(settings.dezepcMaxHoogte) && settings.dezepcMaxHoogte >= BOOM_HOOGTE_MIN
    ? settings.dezepcMaxHoogte
    : Math.max(BOOM_HOOGTE_MIN, Math.round(huidig))
}

function boomHoogteMax() {
  const zijbalk = document.querySelector('.sidebar')
  return Math.max(BOOM_HOOGTE_MIN, (zijbalk?.clientHeight || window.innerHeight) - 40)
}

// richting: 1 = ondergreep / knop-swipe (omlaag = hoger),
//          -1 = bovengreep (omlaag = lager)
function startBoomHoogteSleep(e, richting) {
  e.preventDefault()
  e.stopPropagation()
  const startY = e.clientY
  const startH = boomHoogteStart()
  const maxMogelijk = boomHoogteMax()

  const onMove = (ev) => {
    const h = Math.max(
      BOOM_HOOGTE_MIN,
      Math.min(maxMogelijk, Math.round(startH + richting * (ev.clientY - startY))),
    )
    settings.dezepcMaxHoogte = h
    pasBoomHoogteToe()
  }
  const onUp = () => {
    document.removeEventListener('mousemove', onMove)
    document.removeEventListener('mouseup', onUp)
    document.body.classList.remove('bezig-hoogte')
    window.api.saveSettings(settings)
  }
  document.body.classList.add('bezig-hoogte')
  document.addEventListener('mousemove', onMove)
  document.addEventListener('mouseup', onUp)
}

function wisBoomHoogte() {
  settings.dezepcMaxHoogte = null
  pasBoomHoogteToe()
  window.api.saveSettings(settings)
  showToast(I18N.t('sidebar.maxHeightClearedToast'))
}

function bedraadBoomHoogte() {
  const hoogteKnop = document.getElementById('boom-hoogte')
  const volKnop = document.getElementById('boom-vol')
  const greepOnder = document.getElementById('boom-greep')
  const greepBoven = document.getElementById('boom-greep-boven')
  const sectie = document.querySelector('.sidebar-sectie[data-zijsectie="dezepc"]')
  if (!hoogteKnop || !volKnop || !greepOnder || !greepBoven || !sectie) return
  if (hoogteKnop.dataset.bedraad) return
  hoogteKnop.dataset.bedraad = '1'
  volKnop.dataset.bedraad = '1'

  const zetHoogteModus = (aan) => {
    hoogteKnop.classList.toggle('aan', aan)
    sectie.classList.toggle('hoogte-zetten', aan)
    if (aan && dezepcVol) {
      dezepcVol = false
      pasDezepcVolToe()
    }
    syncBoomGreep()
    pasBoomHoogteToe()
    if (aan) showToast(I18N.t('sidebar.heightDragHintToast'))
  }

  // Max. hoogte: vasthouden + swipen, of klikken voor grepen boven/onder.
  hoogteKnop.addEventListener('mousedown', (e) => {
    if (e.button !== 0) return
    e.stopPropagation()
    const stondAan = hoogteKnop.classList.contains('aan')
    zetHoogteModus(true)
    let bewogen = false
    const startY = e.clientY
    const startH = boomHoogteStart()
    const maxMogelijk = boomHoogteMax()

    const onMove = (ev) => {
      if (Math.abs(ev.clientY - startY) > 3) bewogen = true
      const h = Math.max(
        BOOM_HOOGTE_MIN,
        Math.min(maxMogelijk, Math.round(startH + (ev.clientY - startY))),
      )
      settings.dezepcMaxHoogte = h
      pasBoomHoogteToe()
    }
    const onUp = () => {
      document.removeEventListener('mousemove', onMove)
      document.removeEventListener('mouseup', onUp)
      document.body.classList.remove('bezig-hoogte')
      if (bewogen) {
        window.api.saveSettings(settings)
      } else if (stondAan) {
        zetHoogteModus(false)
      }
    }
    document.body.classList.add('bezig-hoogte')
    document.addEventListener('mousemove', onMove)
    document.addEventListener('mouseup', onUp)
  })
  hoogteKnop.addEventListener('click', (e) => e.stopPropagation())

  // Volledige hoogte: cmd + projecten tijdelijk weg, deze pc vult de zijbalk.
  volKnop.onclick = (e) => {
    e.stopPropagation()
    dezepcVol = !dezepcVol
    pasDezepcVolToe()
    showToast(dezepcVol ? I18N.t('sidebar.dezepcFullTitle') : I18N.t('sidebar.normalSidebarRestoredToast'))
  }

  greepOnder.addEventListener('mousedown', (e) => {
    if (e.button !== 0) return
    startBoomHoogteSleep(e, 1)
  })
  greepBoven.addEventListener('mousedown', (e) => {
    if (e.button !== 0) return
    startBoomHoogteSleep(e, -1)
  })

  greepOnder.addEventListener('dblclick', (e) => { e.stopPropagation(); wisBoomHoogte() })
  greepBoven.addEventListener('dblclick', (e) => { e.stopPropagation(); wisBoomHoogte() })

  pasDezepcVolToe()
  pasBoomHoogteToe()
  syncBoomGreep()
}

function renderBoom() {
  const el = document.getElementById('boom')
  if (!el) return

  const stond = el.scrollTop
  const rijen = boomRijen()
  el.classList.toggle('boom-verplaatsen', boomVerplaatsModus)
  el.innerHTML = rijen.map((r, n) => {
    if (r.meer) {
      return `<div class="boom-meer" data-b="${n}" style="padding-left:${8 + r.diepte * 13}px">
                ${esc(I18N.t('tree.moreItemsRow', { n: r.meer }))}</div>`
    }
    const open = r.dir && boomIsOpen(r.pad)
    const bezig = boomBezig.has(r.pad)
    // Weten we al dat er niets in zit, dan hoort daar ook geen pijltje bij.
    const leeg = r.dir && boomKinderen.has(r.pad) && boomKinderen.get(r.pad).length === 0
    // Twee dingen om te laten zien: wat jij hebt aangeklikt, en in welke map de
    // verkenner staat. Meestal is dat hetzelfde, bij een bestand niet.
    const gekozen = boomVerplaatsModus
      ? boomSelectie.has(r.pad)
      : r.pad === boomGekozen
    const hier = r.dir && r.pad === browserPath && !gekozen
    return `
      <div class="boom-rij ${r.dir ? 'map' : 'bestand'} ${r.schijf ? 'schijf' : ''} ${hier ? 'aan' : ''} ${gekozen ? 'gekozen' : ''}"
           data-b="${n}" title="${esc(r.pad)}" ${boomVerplaatsModus && !r.schijf ? 'draggable="true"' : ''}>
        <span class="boom-pijl" style="margin-left:${r.diepte * 13}px" data-klap="${n}">
          ${r.dir && !leeg ? `<i class="ti ${bezig ? 'ti-loader-2 draait' : open ? 'ti-chevron-down' : 'ti-chevron-right'}"></i>` : ''}
        </span>
        <i class="ti ${boomIcoon(r)} boom-icoon"></i>
        <span class="boom-naam">${esc(r.naam)}</span>
      </div>`
  }).join('')

  el.scrollTop = stond

  // Takken die onthouden zijn als "open" maar nog niet ingelezen zijn, alsnog
  // ophalen. Na het opstarten geldt dat voor álle onthouden takken: die stonden
  // anders open met niets eronder, en dan lijkt er niets te selecteren.
  vulOpenTakken(rijen)

  const foutPad = [...boomFout.keys()].find(p => p !== DEZE_PC && boomIsOpen(p))
  if (foutPad) {
    const melding = document.createElement('div')
    melding.className = 'boom-fout'
    melding.textContent = boomFout.get(foutPad)
    el.appendChild(melding)
  }

  el.querySelectorAll('[data-b]').forEach(rij => {
    const r = rijen[parseInt(rij.dataset.b)]
    if (!r) return
    if (r.meer) { rij.onclick = () => openInVerkenner(r.pad); return }

    const pijl = rij.querySelector('[data-klap]')
    if (pijl) pijl.onclick = (e) => {
      e.stopPropagation()
      // Pijltje klapt alleen open/dicht — selecteert of navigeert nooit.
      if (r.dir) wisselTak(r.pad)
    }

    if (boomVerplaatsModus) {
      rij.onclick = (e) => {
        if (r.schijf) return
        wisselBoomSelectie(r.pad, e.shiftKey)
      }
      rij.ondblclick = () => { if (r.dir) wisselTak(r.pad) }

      if (!r.schijf) {
        rij.ondragstart = (e) => {
          // Sleep wat geselecteerd is; zat dit item er niet in, dan alleen dit.
          if (!boomSelectie.has(r.pad)) {
            boomSelectie = new Set([r.pad])
            boomSelectieAnker = r.pad
            el.querySelectorAll('.boom-rij').forEach(node => {
              const rr = rijen[parseInt(node.dataset.b)]
              node.classList.toggle('gekozen', rr && boomSelectie.has(rr.pad))
            })
          }
          e.dataTransfer.setData('application/x-commanddeck-paden', JSON.stringify([...boomSelectie]))
          e.dataTransfer.effectAllowed = 'move'
          rij.classList.add('sleept')
        }
        rij.ondragend = () => {
          rij.classList.remove('sleept')
          el.querySelectorAll('.boom-rij.doelwit').forEach(n => n.classList.remove('doelwit'))
        }
      }

      if (r.dir) {
        rij.ondragover = (e) => {
          const ruw = e.dataTransfer.types.includes('application/x-commanddeck-paden')
          if (!ruw) return
          // Niet op een geselecteerde map of in een kind daarvan droppen
          if ([...boomSelectie].some(p => boomIsInOfZelf(r.pad, p))) return
          e.preventDefault()
          e.dataTransfer.dropEffect = 'move'
          rij.classList.add('doelwit')
        }
        rij.ondragleave = () => rij.classList.remove('doelwit')
        rij.ondrop = async (e) => {
          e.preventDefault()
          e.stopPropagation()
          rij.classList.remove('doelwit')
          let paden = []
          try { paden = JSON.parse(e.dataTransfer.getData('application/x-commanddeck-paden') || '[]') } catch { return }
          if (!Array.isArray(paden) || !paden.length) return
          await verplaatsPadenNaar(paden, r.pad)
        }
      }
    } else {
      rij.onclick = () => {
        // Eerst aanwijzen, dan pas navigeren: dan zie je meteen wat je koos,
        // ook als het inlezen van de map nog even duurt.
        boomGekozen = r.pad
        renderBoom()
        if (r.dir) openInVerkenner(r.pad)
        else openInVerkenner(ouderVan(r.pad), r.pad)
      }
      rij.ondblclick = () => { if (r.dir) wisselTak(r.pad) }
    }

    // Rechtsklikken in de boom geeft hetzelfde menu als in de verkenner. Om
    // dat waar te maken wijzen we het item eerst echt aan: we gaan naar de map
    // eromheen en selecteren het. Daarna kunnen kopiëren, hernoemen, plakken
    // en de rest gewoon hun werk doen, met dezelfde code als altijd.
    rij.oncontextmenu = async (e) => {
      e.preventDefault()
      e.stopPropagation()
      const x = e.clientX, y = e.clientY

      boomGekozen = r.pad
      renderBoom()
      await openInVerkenner(ouderVan(r.pad), r.pad)
      const item = browserZichtbaar.find(i => i.path === r.pad)
      const menu = bouwContextMenu(item)
      if (r.dir) {
        menu.unshift({ scheiding: true })
        menu.unshift({ label: I18N.t('tree.reloadBranchLabel'), icoon: 'ti-refresh',
          doe: () => laadTak(r.pad, true).then(renderBoom) })
      }
      toonContextMenu(x, y, menu)
    }
  })
}

// De map waar dit pad in zit. Boven een schijf zit alleen nog Deze pc.
function ouderVan(pad) {
  const kaal = String(pad || '').replace(/[\\/]+$/, '')
  // Een netwerkshare is zelf de bovenste laag, net als een schijfletter. Zonder
  // dit liep de boom door naar \\server en daarna naar een losse \ — allebei
  // geen map die je kunt openen.
  if (GitTools.isUncWortel(kaal)) return DEZE_PC
  const knip = Math.max(kaal.lastIndexOf('\\'), kaal.lastIndexOf('/'))
  if (knip < 0) return DEZE_PC
  const ouder = kaal.slice(0, knip)
  if (!ouder) return DEZE_PC
  return /^[a-z]:$/i.test(ouder) ? ouder + '\\' : ouder
}

// Vanuit de boom naar de verkenner. Staat er geen verkenner op het scherm
// (bijvoorbeeld in de instellingen), dan gaan we eerst naar de cmd-sectie.
async function openInVerkenner(mapPad, bestandPad = '') {
  if (!document.getElementById('br-list')) setView('cmd')
  setTermTab('browser')
  await navigeerNaar(mapPad)
  if (bestandPad) {
    const n = browserZichtbaar.findIndex(i => i.path === bestandPad)
    if (n >= 0) selecteerAlleen(n)
  }
}

// De boom loopt mee met waar je in de verkenner staat: de takken ernaartoe
// klappen open, zodat je ziet waar je zit.
async function volgBoomNaar(pad) {
  if (!document.getElementById('boom')) return

  await laadTak(DEZE_PC)
  const keten = boomKeten(pad)
  if (!keten.length) { renderBoom(); toonBoomRegel(); return }

  const nu = new Set(boomOpenLijst())
  nu.add(DEZE_PC)
  // De map zelf hoeft niet open; zijn ouders wel, anders zie je hem niet staan.
  keten.slice(0, -1).forEach(p => nu.add(p))
  settings.boomOpen = [...nu]
  window.api.saveSettings(settings)

  for (const p of keten.slice(0, -1)) await laadTak(p)
  renderBoom()
  toonBoomRegel()
}

// De map waar je nu staat in beeld halen. Met honderden mappen erboven staat
// die anders ver buiten beeld en moet je zelf gaan zoeken; midden in het vak
// is hij het makkelijkst terug te vinden.
function toonBoomRegel() {
  const sectie = document.querySelector('.sidebar-sectie[data-zijsectie="dezepc"]')
  // Dichtgeklapt heeft scrollen geen zin, en het zou de zijbalk laten springen.
  if (!sectie || sectie.classList.contains('dicht')) return
  const boom = document.getElementById('boom')
  const rij = document.querySelector('#boom .boom-rij.aan')
  if (!boom || !rij) return

  // Midden in het vak: dan zie je ook wat eromheen staat, en je hoeft niet te
  // raden of er nog meer onder zit.
  if (boom.clientHeight && rij.offsetHeight) {
    const midden = rij.offsetTop - (boom.clientHeight / 2) + (rij.offsetHeight / 2)
    boom.scrollTop = Math.max(0, midden)
  }
  // En als het vak zelf buiten beeld staat, schuift de zijbalk mee.
  if (rij.scrollIntoView) rij.scrollIntoView({ block: 'nearest' })
}

// ── Weergave en sortering van de verkenner ────────────────────────────────────
// Eén rij van klein naar groot: eerst lijsten, dan tegels. Ctrl+scrollen loopt
// daar doorheen, dus de volgorde hier is ook de volgorde die je onder je vinger
// voelt. Tegels tonen alleen een icoon en een naam — grootte en datum staan
// daar in de weg.
const WEERGAVES = [
  { id: 'lijst-s',  labelKey: 'view.listSmall',  icoon: 'ti-list',           tegel: false },
  { id: 'lijst-m',  labelKey: 'view.listMedium', icoon: 'ti-list',           tegel: false },
  { id: 'lijst-l',  labelKey: 'view.listLarge',  icoon: 'ti-list',           tegel: false },
  { id: 'lijst-xl', labelKey: 'view.listXL',     icoon: 'ti-list',           tegel: false },
  { id: 'tegel-s',  labelKey: 'view.tileSmall',  icoon: 'ti-layout-grid',    tegel: true  },
  { id: 'tegel-m',  labelKey: 'view.tileMedium', icoon: 'ti-layout-grid',    tegel: true  },
  { id: 'tegel-l',  labelKey: 'view.tileLarge',  icoon: 'ti-layout-grid',    tegel: true  },
]

const SORTERINGEN = [
  { id: 'naam',    labelKey: 'sort.name', icoon: 'ti-abc' },
  { id: 'grootte', labelKey: 'sort.size', icoon: 'ti-scale' },
  { id: 'type',    labelKey: 'sort.type', icoon: 'ti-file-description' },
  { id: 'datum',   labelKey: 'sort.date', icoon: 'ti-clock' },
]

// Tekstgroottes van het uitvoerpaneel. Ook een draaiende terminal-sessie gaat
// mee, anders staat de helft van je scherm ineens uit de pas.
const OUTPUT_MATEN = [11, 12, 13.5, 15, 17]

function verkennerVoorkeur() {
  const v = settings.verkenner || {}
  return {
    weergave: WEERGAVES.some(w => w.id === v.weergave) ? v.weergave : 'lijst-s',
    sorteer:  SORTERINGEN.some(x => x.id === v.sorteer) ? v.sorteer : 'naam',
    richting: v.richting === 'af' ? 'af' : 'op',
    // Standaard aan: als je in het filter typt, verwacht je dat alles onder
    // deze map meetelt. Uitzetten kan met de knop.
    diep: v.diep !== false,
  }
}

function huidigeWeergave() { return verkennerVoorkeur().weergave }
function isTegelWeergave() {
  return !!WEERGAVES.find(w => w.id === huidigeWeergave())?.tegel
}

function zetVerkennerVoorkeur(nieuw) {
  settings.verkenner = { ...verkennerVoorkeur(), ...nieuw }
  window.api.saveSettings(settings)
}

// Sorteren verandert de volgorde, dus waar de pijltjes stonden slaat nergens
// meer op. De selectie zelf gaat op pad en blijft dus gewoon staan.
function zetSortering(sorteer, richting) {
  zetVerkennerVoorkeur({ sorteer, richting })
  browserFocus = -1
  browserAnker = -1
  renderBrowser()
}

function zetWeergave(id) {
  if (!WEERGAVES.some(w => w.id === id)) return
  zetVerkennerVoorkeur({ weergave: id })
  renderBrowser()
}

// Ctrl+scroll: een stap groter of kleiner, en niet verder dan de uiteinden.
function stapWeergave(richting) {
  const nu = WEERGAVES.findIndex(w => w.id === huidigeWeergave())
  const volgend = Math.max(0, Math.min(WEERGAVES.length - 1, nu + richting))
  if (volgend === nu) return
  zetWeergave(WEERGAVES[volgend].id)
  showToast(I18N.t(WEERGAVES[volgend].labelKey))
}

// Het achtervoegsel bepaalt het type; een map heeft er geen en gaat voorop.
function bestandsType(item) {
  if (item.dir || item.schijf) return ''
  const m = /\.([^.\\/]+)$/.exec(item.name || '')
  return m ? m[1].toLowerCase() : ''
}

function itemGrootte(item) {
  if (item.schijf) return item.schijf.total || 0
  if (item.dir) return grootteCache.has(item.path) ? grootteCache.get(item.path) : -1
  return item.size || 0
}

function sorteerItems(lijst) {
  const { sorteer, richting } = verkennerVoorkeur()
  const keer = richting === 'af' ? -1 : 1
  const opNaam = (a, b) => String(a.name || '').localeCompare(String(b.name || ''), 'nl', { numeric: true, sensitivity: 'base' })

  return [...lijst].sort((a, b) => {
    // Mappen blijven bovenaan, ook aflopend: anders moet je scrollen om ergens
    // naartoe te navigeren.
    if (!!a.dir !== !!b.dir) return a.dir ? -1 : 1

    let v = 0
    if (sorteer === 'grootte')    v = itemGrootte(a) - itemGrootte(b)
    else if (sorteer === 'type')  v = bestandsType(a).localeCompare(bestandsType(b))
    else if (sorteer === 'datum') v = (a.mtime || 0) - (b.mtime || 0)
    else                          v = opNaam(a, b)

    // Gelijk op de gekozen sleutel? Dan alfabetisch, zodat de volgorde niet
    // per keer verspringt.
    if (v === 0 && sorteer !== 'naam') return opNaam(a, b)
    return v * keer
  })
}

function weergaveMenu(x, y) {
  const nu = huidigeWeergave()
  toonContextMenu(x, y, WEERGAVES.map(w => ({
    label: I18N.t(w.labelKey),
    icoon: w.id === nu ? 'ti-check' : w.icoon,
    doe: () => zetWeergave(w.id),
  })))
}

function sorteerMenu(x, y) {
  const { sorteer, richting } = verkennerVoorkeur()
  const items = SORTERINGEN.map(o => ({
    label: I18N.t(o.labelKey),
    icoon: o.id === sorteer ? 'ti-check' : o.icoon,
    doe: () => zetSortering(o.id, richting),
  }))
  items.push({ scheiding: true })
  items.push({
    label: I18N.t('sort.ascending'), icoon: richting === 'op' ? 'ti-check' : 'ti-sort-ascending',
    doe: () => zetSortering(sorteer, 'op'),
  })
  items.push({
    label: I18N.t('sort.descending'), icoon: richting === 'af' ? 'ti-check' : 'ti-sort-descending',
    doe: () => zetSortering(sorteer, 'af'),
  })
  toonContextMenu(x, y, items)
}

// ── Tekstgrootte van de output ────────────────────────────────────────────────
function outputMaatIndex() {
  const n = Number(settings.outputMaat)
  return Number.isInteger(n) && n >= 0 && n < OUTPUT_MATEN.length ? n : 1
}

function pasOutputMaatToe() {
  const px = OUTPUT_MATEN[outputMaatIndex()]
  const term = document.getElementById('terminal')
  if (term) {
    term.style.fontSize = px + 'px'
    term.style.lineHeight = '1.65'
  }
  // Een draaiende sessie groeit mee; daarna opnieuw uitmeten, want er passen
  // nu minder regels op het scherm.
  for (const s of ptySessies.values()) {
    try { s.term.options.fontSize = px } catch {}
  }
  const actief = ptySessies.get(activeTermId)
  if (actief) pasPtyMaatAan(actief)
}

function stapOutputMaat(richting) {
  const nu = outputMaatIndex()
  const volgend = Math.max(0, Math.min(OUTPUT_MATEN.length - 1, nu + richting))
  if (volgend === nu) return
  settings.outputMaat = volgend
  window.api.saveSettings(settings)
  pasOutputMaatToe()
  showToast(I18N.t('term.textSizeToast', { size: OUTPUT_MATEN[volgend] }))
}

// ── Echte terminal in het venster zelf ────────────────────────────────────────
// Commando's die met je willen praten kregen vroeger een eigen consolevenster.
// Dat werkt, maar het is niet waar je ze wilt hebben. Met een pseudo-terminal
// (main.js, "pty:") draait zo'n commando gewoon hier: het krijgt een echt
// toetsenbord en een echt scherm, en wij tekenen dat met xterm.js in het
// uitvoerpaneel. Lukt dat niet — geen xterm geladen, of node-pty doet het niet
// op deze machine — dan valt alles terug op het eigen venster van vroeger.

const ptySessies = new Map()   // termId -> { term, fit, houder, naam, cmd, actief }
let ptyKan = null              // null = nog niet nagevraagd
let ptyReden = ''

async function ptyMogelijk() {
  if (typeof window.Terminal !== 'function') return false
  if (ptyKan === null) {
    try {
      const r = await window.api.ptyBeschikbaar()
      ptyKan   = !!(r && r.ok)
      ptyReden = (r && r.reden) || ''
    } catch (e) {
      ptyKan = false
      ptyReden = e && e.message ? e.message : String(e)
    }
  }
  return ptyKan
}

// De naam op het tabblad: het programma, niet de hele regel met vlaggen.
function ptyNaam(cmd) {
  const eerste = String(cmd || '').trim().split(/\s+/)[0] || 'sessie'
  return eerste.split(/[\\/]/).pop().replace(/\.(exe|cmd|bat)$/i, '')
}

// Het lampje bij "output" zegt of hier een sessie draait. Een sessie van een
// ander project loopt gewoon door, maar is daar niet te zien.
function ververPtyStatus() {
  const s = ptySessies.get(activeTermId)
  const punt = document.getElementById('pty-punt')
  if (punt) {
    punt.hidden = !s
    punt.classList.toggle('uit', !!s && !s.actief)
    punt.title = s ? I18N.t(s.actief ? 'term.ptyRunningTitle' : 'term.ptyExitedTitle', { name: s.naam }) : ''
  }
  const sluit = document.getElementById('btn-pty-sluit')
  if (sluit) sluit.hidden = !s || termTab !== 'output'
}

// De terminal van een sessie leeft in zijn eigen los element. Dat overleeft het
// opnieuw opbouwen van de weergave: we hangen hem er daarna weer in.
function toonPtySessie() {
  const host = document.getElementById('pty-host')
  if (!host) return
  const s = ptySessies.get(activeTermId)
  if (!s) { host.replaceChildren(); return }
  if (s.houder.parentNode !== host) host.replaceChildren(s.houder)
  pasPtyMaatAan(s)
  try { s.term.focus() } catch {}
}

function pasPtyMaatAan(s) {
  if (!s || !s.fit) return
  try {
    s.fit.fit()
    window.api.ptyResize({ id: s.id, cols: s.term.cols, rows: s.term.rows })
  } catch {}
}

async function startPtySessie(termId, cmd, cwd, shell) {
  if (!await ptyMogelijk()) return false

  // Er kan er maar één tegelijk in dit venster. Draaide er al iets, dan sluit
  // dat — en dan hoor je te zien wát er gesloten is.
  const draaiend = ptySessies.get(termId)
  if (draaiend && draaiend.naam !== ptyNaam(cmd)) {
    appendLine('ok', '✓ ' + I18N.t('ai.closedProgramLine', { name: draaiend.naam }))
  }
  stopPtySessie(termId, { stil: true })

  const houder = document.createElement('div')
  houder.className = 'pty-sessie'

  let term, fit
  try {
    term = new window.Terminal({
      fontFamily: 'Consolas, "Cascadia Mono", monospace',
      fontSize: OUTPUT_MATEN[outputMaatIndex()],
      cursorBlink: true,
      scrollback: 5000,
      theme: { background: '#050505', foreground: '#c8c8c8' },
    })
    const FitKlasse = window.FitAddon && window.FitAddon.FitAddon
    if (FitKlasse) { fit = new FitKlasse(); term.loadAddon(fit) }
    term.open(houder)
  } catch (e) {
    return false
  }

  const s = { id: termId, term, fit, houder, naam: ptyNaam(cmd), cmd, actief: true }
  ptySessies.set(termId, s)

  // Eerst tonen, dan starten: de pty krijgt zo meteen de goede afmetingen mee.
  setTermTab('output')
  ververPtyStatus()

  let r
  try {
    r = await window.api.ptyStart({ id: termId, cmd, cwd, cols: term.cols, rows: term.rows, shell })
  } catch (e) {
    r = { ok: false, reason: e && e.message ? e.message : String(e) }
  }
  if (!r || !r.ok) {
    ptySessies.delete(termId)
    try { term.dispose() } catch {}
    setTermTab('output')
    ververPtyStatus()
    ptyReden = (r && r.reason) || ptyReden
    return false
  }

  term.onData(d => window.api.ptyWrite({ id: termId, data: d }))

  // Zolang een programma draait heeft dát het toetsenbord: wat je typt gaat er
  // rechtstreeks heen. Woorden onderscheppen kan niet — `exit` kan net zo goed
  // een stuk van je vraag zijn, en dan zouden we je tekst opeten. Eén
  // toetscombinatie vangen we wel af, zodat er altijd een uitweg is die niet
  // afhangt van wat dit programma toevallig kent.
  try {
    term.attachCustomKeyEventHandler((e) => {
      if (e.type !== 'keydown') return true
      if (!e.ctrlKey || !e.shiftKey || (e.key || '').toLowerCase() !== 'q') return true
      e.preventDefault()
      stopPtySessie(termId)
      appendLine('ok', '✓ ' + I18N.t('term.ptyClosedByShortcut', { name: ptyNaam(cmd) }))
      return false
    })
  } catch {}

  pasPtyMaatAan(s)

  // Een programma neemt het venster over: de commandobalk verdwijnt, en daarmee
  // ook de weg naar een gesprek dat via de API loopt. Dat gesprek sluiten we
  // dus, in plaats van het onbereikbaar te laten staan.
  if (aiAan(termId)) {
    const gesprek = aiSessies[termId]
    if (gesprek.bezig) { try { window.api.aiStop({ id: termId }) } catch {} }
    gesprek.aan = false
    aiVerversBalk()
    aiVerversKnoppen(termId)
  }
  return true
}

function stopPtySessie(termId, { stil = false } = {}) {
  const s = ptySessies.get(termId)
  if (!s) return false
  ptySessies.delete(termId)
  try { window.api.ptyStop({ id: termId }) } catch {}
  try { s.term.blur?.() } catch {}
  try { s.term.dispose() } catch {}
  if (s.houder.parentNode) s.houder.parentNode.removeChild(s.houder)
  if (!stil) {
    setTermTab('output')
    ververPtyStatus()
    // xterm had de focus; zonder dit moet je eerst ergens klikken
    // voordat je weer in het commandoveld kunt typen.
    focusTerminalInput()
  }
  return true
}

function ptyDataBinnen({ id, data }) {
  const s = ptySessies.get(id)
  if (!s) return
  try { s.term.write(data) } catch {}
}

function ptyGestopt({ id, code }) {
  const s = ptySessies.get(id)
  if (!s) return
  s.actief = false
  const naam = s.naam
  const hier = id === activeTermId
  if (hier) {
    appendLine('ok', '✓ ' + I18N.t('term.ptySessionEndedLine', { name: naam, code }))
    appendLine('sep', '')
    setStatus('ended', '✓ ' + I18N.t('term.ptyExitedTitle', { name: naam }))
  }
  // Sessie meteen opruimen: anders blijft xterm de focus houden en kun je
  // niet typen tot je ergens in de uitvoer klikt of "sessie sluiten" gebruikt.
  stopPtySessie(id, { stil: !hier })
}

// ── AI-gesprek in het uitvoervenster ──────────────────────────────────────────
// Hetzelfde vak, een ander tegenover. In gespreksmodus gaat wat je typt niet
// naar de shell maar naar een AI-dienst; het antwoord groeit in beeld zoals
// gewone uitvoer dat doet. Welke dienst dat is weet dit bestand niet: dat staat
// in ai-providers.js, en het praten zelf gebeurt in het hoofdproces
// (ai-runtime.js) omdat de sleutel daar hoort en niet in het venster.
//
// Per weergave een eigen gesprek: het project waar je in staat, of de losse
// cmd-sectie. Wissel je van project, dan wissel je van gesprek.

function aiSessie(id) {
  if (!aiSessies[id]) {
    const cfg = settings.ai || {}
    const providerId = cfg.provider || 'claude'
    aiSessies[id] = {
      aan: false,            // gaat getypte tekst naar de AI of naar de shell?
      providerId,
      model: (cfg.modellen || {})[providerId] || '',
      berichten: [],         // [{ rol: 'gebruiker' | 'ai', tekst }]
      bezig: false,
      lopend: '',            // het antwoord zoals het nu binnenkomt
      divId: '',
      voor: '',              // uitvoer tot aan het lopende antwoord
    }
  }
  return aiSessies[id]
}

function aiAan(id)   { return !!(aiSessies[id] && aiSessies[id].aan) }
function aiBezig(id) { return !!(aiSessies[id] && aiSessies[id].bezig) }
function aiInfo(providerId) { return aiProviders.find(p => p.id === providerId) || null }

async function aiLaadProviders() {
  try { aiProviders = await window.api.aiProviders() } catch { aiProviders = [] }
  aiSchoonModellen()
  return aiProviders
}

// Een eerdere versie kon het model van de ene dienst onder een andere opslaan.
// Staat er zoiets in je instellingen, dan halen we het er stilletjes uit: het
// zou anders bij elke poging opnieuw misgaan.
function aiSchoonModellen() {
  const cfg = settings.ai || {}
  const modellen = { ...(cfg.modellen || {}) }
  let veranderd = false
  for (const [id, model] of Object.entries(modellen)) {
    if (!model) continue
    const dienst = aiInfo(id)
    if (!dienst) continue
    if ((dienst.modellen || []).some(m => m.id === model)) continue
    const vanEenAnder = aiProviders.some(p =>
      p.id !== id && (p.modellen || []).some(m => m.id === model))
    if (!vanEenAnder) continue          // eigen naam, of zelf ingetypt: laten staan
    delete modellen[id]
    veranderd = true
  }
  if (!veranderd) return
  settings.ai = { ...cfg, modellen }
  window.api.saveSettings(settings)
}

function aiModelNaam(s) {
  const info = aiInfo(s.providerId)
  return s.model || (info && info.standaardModel) || ''
}

// ── Schrijven ─────────────────────────────────────────────────────────────────
// Een antwoord kan binnenkomen terwijl je ergens anders kijkt. Staat de
// weergave in beeld, dan gaat het via de DOM; staat hij dat niet, dan schrijven
// we alleen in de bewaarde uitvoer, zodat het er staat als je terugkomt.
function aiHtmlErbij(id, html) {
  const term = (id === activeTermId) ? document.getElementById('terminal') : null
  if (!term) { termOutput[id] = (termOutput[id] || '') + html; return }
  springNaarOutput()
  term.querySelector('.t-cursor')?.remove()
  term.insertAdjacentHTML('beforeend', html)
  const cursor = document.createElement('span')
  cursor.className = 't-cursor'
  term.appendChild(cursor)
  term.scrollTop = term.scrollHeight
  termOutput[id] = term.innerHTML.replace('<span class="t-cursor"></span>', '')
  plaatsStatus()
}

function aiRegel(id, klasse, tekst) {
  aiHtmlErbij(id, `<div class="${klasse}">${esc(tekst)}</div>`)
}

// Het antwoordvak openen. Daarna weten we precies wat eraan voorafging, en kan
// elk stukje tekst dat binnenkomt er zonder gedoe achter.
function aiStroomStart(id) {
  const s = aiSessie(id)
  s.divId = 'ai-antwoord-' + (++aiTeller)
  s.lopend = ''
  aiHtmlErbij(id, `<div class="t-ai" id="${s.divId}"></div>`)
  s.voor = String(termOutput[id] || '').slice(0, -6)   // zonder de </div>
}

// Per stukje tekst alleen dát stukje aanhangen. Het hele antwoord opnieuw
// zetten — en opnieuw door esc() halen — kost bij elk woord meer tijd dan bij
// het vorige; halverwege een lang antwoord loopt dat flink op.
let aiBewaarTimer = null

function aiStroomStuk(id, tekst) {
  const s = aiSessies[id]
  if (!s || !s.divId) return
  s.lopend += tekst
  if (id === activeTermId) {
    const el = document.getElementById(s.divId)
    if (el) {
      el.appendChild(document.createTextNode(tekst))
      const term = document.getElementById('terminal')
      if (term) term.scrollTop = term.scrollHeight
    }
  }
  // De bewaarde uitvoer hoeft niet bij elk woord te kloppen, alleen als je
  // wegklikt of als het antwoord klaar is. Een paar keer per seconde is genoeg.
  if (aiBewaarTimer) return
  aiBewaarTimer = setTimeout(() => { aiBewaarTimer = null; aiStroomBewaar(id) }, 250)
}

function aiStroomBewaar(id) {
  const s = aiSessies[id]
  if (!s || !s.divId) return
  termOutput[id] = s.voor + esc(s.lopend) + '</div>'
}

// Kwam er niets binnen (fout meteen bij het versturen), dan hoort er ook geen
// lege regel te blijven staan waar het antwoord had moeten komen.
function aiStroomWeg(id) {
  const s = aiSessies[id]
  if (!s || !s.divId) return
  const el = (id === activeTermId) ? document.getElementById(s.divId) : null
  if (el) {
    el.remove()
    const term = document.getElementById('terminal')
    if (term) termOutput[id] = term.innerHTML.replace('<span class="t-cursor"></span>', '')
  } else {
    const knip = s.voor.lastIndexOf('<div class="t-ai"')
    if (knip >= 0) termOutput[id] = s.voor.slice(0, knip)
  }
}

// Na het wissen van de uitvoer opnieuw een vak openen voor het antwoord dat
// nog binnenkomt, met wat er al stond.
function aiStroomHervat(id) {
  const s = aiSessies[id]
  if (!s || !s.bezig || !s.divId) return
  aiHtmlErbij(id, `<div class="t-ai" id="${s.divId}"></div>`)
  s.voor = String(termOutput[id] || '').slice(0, -6)
  const el = (id === activeTermId) ? document.getElementById(s.divId) : null
  if (el) el.textContent = s.lopend
  termOutput[id] = s.voor + esc(s.lopend) + '</div>'
}

function aiStroomKlaar(id) {
  const s = aiSessies[id]
  if (!s) return
  clearTimeout(aiBewaarTimer)
  aiBewaarTimer = null
  aiStroomBewaar(id)          // laatste stand vastleggen
  s.divId = ''
  s.voor = ''
}

// ── Een vraag stellen ─────────────────────────────────────────────────────────
async function aiVraag(project, vraag) {
  const id = project.id
  const s  = aiSessie(id)
  const info = aiInfo(s.providerId)

  if (!String(vraag || '').trim()) return
  if (!info && !aiProviders.length) await aiLaadProviders()
  if (!aiInfo(s.providerId)) {
    aiRegel(id, 't-err', I18N.t('ai.unknownProviderError', { name: s.providerId }))
    return
  }
  if (s.bezig) { aiRegel(id, 't-warn', I18N.t('ai.busyWarn')); return }

  // Geen model gekozen? Dan eerst zelf kijken of er inmiddels een is. Je hebt
  // net een model gedownload; dan is "haal de lijst op met /modellen live" werk
  // dat de app net zo goed zelf kan doen.
  if (!aiModelNaam(s) && aiInfo(s.providerId).kanModellenHalen) {
    const r = await aiHaalModellen(s.providerId, ((settings.ai || {}).endpoints || {})[s.providerId] || '')
    if (r.ok && (r.modellen || []).length) {
      aiKiesModel(id, aiBesteModel(r.modellen))
      aiRegel(id, 't-ok', I18N.t('ai.autoModelLine', { model: aiModelNaam(s) }))
    }
  }

  const dienst = aiInfo(s.providerId)
  springNaarOutput()
  aiRegel(id, 't-jij', '❯ ' + vraag)

  s.berichten.push({ rol: 'gebruiker', tekst: vraag })
  s.bezig = true
  setStatus('running', dienst.label)
  aiVerversBalk()
  aiStroomStart(id)

  const loc = project.locations[project.activeLocation] || project.locations[0]
  const cfg = settings.ai || {}
  let systeem = String(cfg.systeem || '').trim()
  if (cfg.mapInSysteem !== false && loc && loc.path) {
    systeem = (systeem ? systeem + '\n\n' : '') + I18N.t('ai.systemCwdLine', { path: loc.path })
  }

  let r
  try {
    r = await window.api.aiStuur({
      id,
      providerId: s.providerId,
      model: aiModelNaam(s),
      extraModellen: aiModelCache[s.providerId] || [],
      endpoint: (cfg.endpoints || {})[s.providerId] || '',
      systeem,
      maxTokens: cfg.maxTokens,
      berichten: s.berichten,
    })
  } catch (e) {
    r = { ok: false, soort: 'onbekendefout', bericht: e && e.message ? e.message : String(e) }
  }

  s.bezig = false
  const tekst = (r && r.tekst) || s.lopend || ''
  if (!tekst) aiStroomWeg(id)
  aiStroomKlaar(id)

  if (r && r.ok) {
    s.berichten.push({ rol: 'ai', tekst })
    // Niet elke dienst telt tokens; dan is "0 in, 0 uit" alleen maar verwarrend.
    const v = r.verbruik || {}
    aiRegel(id, 't-warn', (v.in || v.uit)
      ? I18N.t('ai.usageLine', { model: r.model || aiModelNaam(s), in: v.in || 0, out: v.uit || 0 })
      : I18N.t('ai.modelLine', { model: r.model || aiModelNaam(s) }))
    aiHtmlErbij(id, '<div class="t-sep"></div>')
    setStatus('ended', '✓ ' + I18N.t('ai.doneStatus'))
  } else {
    // Wat er al binnen was blijft staan — een half antwoord is beter dan geen.
    // Alleen als er niets kwam halen we de vraag weer uit het gesprek, zodat
    // een nieuwe poging niet twee keer hetzelfde verstuurt.
    if (tekst.trim()) s.berichten.push({ rol: 'ai', tekst })
    else s.berichten.pop()
    aiFoutUitleg(id, r || {})
    setStatus('failed', '✗ ' + I18N.t('ai.failedStatus'))
    // Kan deze dienst niet antwoorden zolang er niets verandert, dan heeft in
    // gesprek blijven geen zin: alles wat je daarna typt loopt tegen dezelfde
    // muur, ook je poging om eruit te komen.
    if (aiKansloos(r)) {
      const t = aiSessie(id)
      if (t.aan) {
        t.aan = false
        aiRegel(id, 't-ok', '✓ ' + I18N.t('ai.leftAfterErrorLine'))
        aiVerversKnoppen(id)
      }
      // Is er een programma van dezelfde dienst, dan is dát de weg die wel
      // werkt. We wijzen ernaar — we sturen je er niet stiekem heen: die knop
      // heet niet voor niets anders dan deze.
      const dienst = aiInfo(t.providerId)
      const prog = dienst && aiProgrammaVoor(t.providerId)
      if (prog) {
        aiRegel(id, 't-warn', I18N.t('ai.useProgramButtonLine', {
          name: prog.label || prog.cmd, cmd: prog.cmd }))
      }
    }
  }
  aiVerversBalk()
}

// Elke fout krijgt een reden én een volgende stap. "Er ging iets mis" helpt
// niemand verder; "geen sleutel, zet hem met /sleutel" wel.
// De stappen die bij deze dienst horen, uit ai-providers.js. "Er ging iets mis"
// helpt niemand; "maak een sleutel hier, plak hem zo" wel.
//
// Twee dingen krijgen extra aandacht, want dat is wat je moet dóen:
//   - een adres komt op een eigen regel te staan, in kleur, en opent in je
//     browser als je erop klikt
//   - een commando achter de dubbele punt zet zichzelf in de commandobalk
// Alleen echte topniveaudomeinen tellen mee, anders zou een bestandsnaam als
// ai-providers.js ook als adres worden gezien.
const AI_ADRES = /(?:https?:\/\/)?(?:[a-z0-9-]+\.)+(?:com|ai|net|org|io|dev|app|co|nl|be|de|eu|me|sh|cloud)(?:\/[^\s,)]*)?/i

function aiStappen(id, regels) {
  if (!regels || !regels.length) return false
  regels.forEach(r => aiStap(id, String(r)))
  return true
}

function aiStap(id, regel) {
  // Achter de dubbele punt staat een commando. Dat begint met ! of / — of het
  // is de naam van een AI-programma, en die stond er tot nu toe als dode tekst
  // terwijl dat juist de uitweg is die je moet kunnen aanklikken.
  const cmd = regel.match(/^(.*?:)\s{2,}(\S.*?)\s*$/)
  if (cmd) {
    const tekst = cmd[2]
    const isApp = /^[!/]/.test(tekst)
    const isProgramma = !isApp && aiLijktProgramma(tekst)
    if (isApp || isProgramma) {
      // Een programma mag meteen starten; iets wat je nog moet aanvullen of wat
      // gigabytes ophaalt zetten we alleen klaar.
      const soort = isProgramma ? 'data-ai-run' : 'data-ai-cmd'
      const titel = isProgramma ? I18N.t('ai.runAnywayTitle', { name: tekst })
                                : I18N.t('ai.insertCmdTitle')
      aiHtmlErbij(id, `<div class="t-out">  ${esc(cmd[1])} ` +
        `<span class="t-doe" ${soort}="${esc(tekst)}" title="${esc(titel)}">${esc(tekst)}</span></div>`)
      return
    }
  }

  const m = regel.match(AI_ADRES)
  if (!m) { aiRegel(id, 't-out', '  ' + regel); return }

  let voor = regel.slice(0, m.index).replace(/\s+$/, '')
  const na = regel.slice(m.index + m[0].length).replace(/^[\s,]+/, '')
  const adres = m[0]
  const href = /^https?:\/\//i.test(adres) ? adres : 'https://' + adres

  if (voor && !/:$/.test(voor)) voor += ':'
  if (voor) aiRegel(id, 't-out', '  ' + voor)
  aiHtmlErbij(id, `<div class="t-link">  ` +
    `<span data-ai-url="${esc(href)}" title="${esc(I18N.t('ai.openLinkTitle'))}">${esc(adres)}</span></div>`)
  if (na) aiRegel(id, 't-out', '  ' + na)
}

// Klikken op een adres of een commando. Via de container, want de uitvoer wordt
// bij elke wisseling opnieuw opgebouwd — losse handlers zouden dat niet overleven.
function setupAiKlikbaar() {
  document.addEventListener('click', (e) => {
    const doel = e.target && e.target.closest ? e.target : null
    if (!doel) return

    const adres = doel.closest('[data-ai-url]')
    if (adres) {
      e.preventDefault()
      if (window.api.openUrl) window.api.openUrl(adres.dataset.aiUrl)
      return
    }

    // Een app-commando dat af is en niets sloopt mag meteen lopen; iets wat je
    // nog moet aanvullen of wat gigabytes downloadt zetten we alleen klaar.
    const meteen = doel.closest('[data-ai-run]')
    if (meteen) {
      e.preventDefault()
      const ctx = currentCtx()
      if (!ctx) return
      let opdracht = meteen.dataset.aiRun
      // Zit je nog in een gesprek, dan gaat een programmanaam daar naartoe.
      // Met een uitroepteken ervoor komt hij wel waar hij hoort.
      if (aiAan(ctx.id) && !/^[!/]/.test(opdracht) && aiLijktProgramma(opdracht)) {
        opdracht = '!' + opdracht
      }
      executeCmd(ctx, opdracht, null)
      return
    }

    const cmd = doel.closest('[data-ai-cmd]')
    if (!cmd) return
    e.preventDefault()
    const input = document.getElementById('term-input')
    if (!input || input.closest('[hidden]')) { showToast(I18N.t('ai.insertCmdBusyToast')); return }
    input.value = cmd.dataset.aiCmd
    input.dispatchEvent(new Event('input', { bubbles: true }))
    input.focus()
    input.selectionStart = input.selectionEnd = input.value.length
  })
}

// Wat lost zichzelf op en wat niet? Even te snel gevraagd hebben wel; geen
// sleutel, geen tegoed of een geweigerde sleutel niet.
function aiKansloos(r) {
  if (!r || r.ok) return false
  if (r.soort === 'sleutel' || r.soort === 'geenmodel') return true
  if (r.soort !== 'http') return false
  if (r.status === 401 || r.status === 403) return true
  if (r.status !== 429) return false
  return /quota|billing|insufficient|credit|balance|tegoed/i.test(r.bericht || '')
}

function aiFoutUitleg(id, r) {
  const s = aiSessies[id] || {}
  const info = aiInfo(r.provider || s.providerId)
  const naam = (info && info.label) || s.providerId || ''
  const hulp = (info && info.hulp) || {}
  switch (r.soort) {
    case 'sleutel':
      aiRegel(id, 't-err',  I18N.t('ai.err.noKey', { name: naam }))
      if (!aiStappen(id, hulp.sleutel)) {
        aiRegel(id, 't-warn', I18N.t('ai.err.noKeyHow', { where: r.waar || '', env: r.env || '' }))
      }
      if (r.env) aiRegel(id, 't-warn', I18N.t('ai.err.orEnv', { env: r.env }))
      break
    case 'http':
      aiRegel(id, 't-err', I18N.t('ai.err.http', { status: r.status, message: r.bericht || '' }))
      if (r.status === 401 || r.status === 403) {
        if (!aiStappen(id, hulp.geweigerd || hulp.sleutel)) aiRegel(id, 't-warn', I18N.t('ai.err.httpAuth'))
      }
      else if (r.status === 429) {
        // Twee heel verschillende dingen geven een 429: te snel achter elkaar
        // vragen, of geen saldo. Het eerste lost zichzelf op, het tweede niet —
        // dus "wacht even" is dan precies het verkeerde advies.
        const geenSaldo = /quota|billing|insufficient|credit|balance|tegoed/i.test(r.bericht || '')
        if (!geenSaldo) aiRegel(id, 't-warn', I18N.t('ai.err.httpRate'))
        else if (!aiStappen(id, hulp.tegoed)) aiRegel(id, 't-warn', I18N.t('ai.err.httpQuota'))
      }
      else if (r.status >= 500)  aiRegel(id, 't-warn', I18N.t('ai.err.httpServer'))
      else if (r.status === 404) {
        aiRegel(id, 't-warn', I18N.t('ai.err.httpNotFound'))
        if (r.model) aiRegel(id, 't-warn', I18N.t('ai.err.httpNotFoundModel', { model: r.model }))
      }
      break
    case 'netwerk':
      aiRegel(id, 't-err', I18N.t('ai.err.networkAt', {
        name: naam, url: r.url || '', message: r.bericht || '' }))
      if (!aiStappen(id, hulp.onbereikbaar)) {
        aiRegel(id, 't-warn', I18N.t('ai.err.networkHint'))
      }
      break
    case 'geenmodel':
      aiRegel(id, 't-err', I18N.t('ai.err.noModel', { name: naam }))
      if (!aiStappen(id, hulp.geenmodellen)) {
        aiRegel(id, 't-warn', I18N.t('ai.err.noModelHow'))
      }
      break
    case 'kanniet':      aiRegel(id, 't-warn', I18N.t('ai.err.cannotList')); break
    case 'afgebroken':   aiRegel(id, 't-warn', I18N.t('ai.err.aborted')); break
    case 'dienst':       aiRegel(id, 't-err',  I18N.t('ai.err.service', { message: r.bericht || '' })); break
    case 'leegantwoord': aiRegel(id, 't-warn', I18N.t('ai.err.empty')); break
    case 'leeg':         aiRegel(id, 't-warn', I18N.t('ai.err.emptyQuestion')); break
    case 'onbekend':     aiRegel(id, 't-err',  I18N.t('ai.unknownProviderError', { name: r.bericht || '' })); break
    default:             aiRegel(id, 't-err',  I18N.t('ai.err.other', { message: r.bericht || '' }))
  }
  aiHtmlErbij(id, '<div class="t-sep"></div>')
}

// ── Balk ──────────────────────────────────────────────────────────────────────
function aiVerversBalk() {
  const aan = aiAan(activeTermId)
  const wrap = levend('.term-input-wrap')
  if (wrap) wrap.classList.toggle('ai-modus', aan)
  updateTermPrompt()
  updateTermPlaceholder()
}

// ── Knoppen per dienst ────────────────────────────────────────────────────────
// Zodra een dienst klaarstaat — er is een sleutel, of het is een lokale server
// die je al eens gebruikt hebt — krijgt hij een knop. Eén klik zet je in
// gesprek; nog een klik op dezelfde knop zet je terug in de shell. Dezelfde rij
// staat bij een project en in de losse cmd-sectie.

const AI_KNOP_ICON = {
  claude: 'ti-sparkles', openai: 'ti-message-chatbot', gemini: 'ti-diamond',
  openrouter: 'ti-route', deepseek: 'ti-cpu', mistral: 'ti-wind',
  groq: 'ti-bolt', cerebras: 'ti-brain', grok: 'ti-letter-x',
  ollama: 'ti-server', lmstudio: 'ti-device-desktop', eigen: 'ti-plug',
}

// Een dienst met een sleutel kun je meteen gebruiken. Een lokale server heeft
// geen sleutel, maar we willen ook niet drie knoppen tonen voor servers die
// niet draaien — die verschijnen pas nadat je hem zelf een keer koos.
// Staat het opdrachtregelprogramma van deze dienst op deze pc? Dat weten we
// uit de gevonden programma's: die dragen het catalogus-id met zich mee.
function aiProgrammaVoor(providerId) {
  const info = aiInfo(providerId)
  const cat = info && info.programma && info.programma.catalogId
  if (!cat) return null
  const gevonden = (settings.customEditors || [])
    .find(e => e.catalogId === cat && e.enabled !== false && e.path)
  return gevonden ? { ...info.programma, label: gevonden.label || info.programma.cmd } : null
}

// Elk geinstalleerd AI-programma krijgt een eigen knop. Eerder zat dat verstopt
// achter de knop van de bijbehorende dienst, en programmaknoppen bestonden
// alleen in de projectweergave — in de cmd-sectie was er dus geen enkele manier
// om Codex of Claude Code met een klik te starten.
function aiProgrammaKnoppen() {
  const uit = []
  for (const p of aiProviders) {
    const prog = aiProgrammaVoor(p.id)
    if (!prog) continue
    uit.push({
      id: 'prog:' + p.id,
      label: prog.label || prog.cmd,
      merk: I18N.t('ai.programBrand'),
      programma: prog,
      dienst: p,
    })
  }
  return uit
}

function aiKlaarDiensten() {
  const gekozen = new Set(Object.keys(((settings.ai || {}).modellen) || {}))
  // Diensten waar je meteen mee kunt praten: een sleutel, of een lokale server
  // die je al koos. Daarnaast elk programma dat op deze pc staat.
  const uit = ((settings.ai || {}).knoppenUit) || {}
  const viaApi = aiProviders.filter(p => p.sleutelBron || (p.lokaal && gekozen.has(p.id)))
  return [...aiProgrammaKnoppen(), ...viaApi].filter(d => !uit[d.id])
}

// In de projectrij al een editor-knop voor hetzelfde programma? Dan geen
// extra AI-programmaknop ernaast. In de cmd-sectie blijven ze wel, want
// daar staan geen editor-knoppen.
function aiDienstenOpProject() {
  const cats = new Set(eigenEditors().map(e => e.catalogId).filter(Boolean))
  const stammen = new Set(eigenEditors().map(e => padStam(e.path)).filter(Boolean))
  return aiKlaarDiensten().filter(d => {
    if (!d.programma) return true
    if (d.programma.catalogId && cats.has(d.programma.catalogId)) return false
    const cmd = padStam(d.programma.cmd)
    if (cmd && stammen.has(cmd)) return false
    return true
  })
}

let aiKnopStempel = null
function aiKnopVingerafdruk() { return aiKlaarDiensten().map(p => p.id).join(',') }

// Losse knoppen, geen eigen sectie: ze schuiven aan bij "uitvoeren" van een
// project en bij de snelkoppelingen in de cmd- en powershell-sectie. Een eigen
// rij ervoor kostte te veel hoogte voor wat het is.
// Eén plek die een dienstknop tekent; project, cmd en powershell gebruiken
// hem allemaal, zodat ze niet uit elkaar gaan lopen.
function aiKnopIcoon(d) {
  if (AI_KNOP_ICON[d.id]) return AI_KNOP_ICON[d.id]
  // Een programmaknop leent het icoon van de dienst waar hij bij hoort.
  if (d.programma && d.dienst) return AI_KNOP_ICON[d.dienst.id] || 'ti-terminal-2'
  return 'ti-sparkles'
}

function aiKnopHtml(d, actiefId) {
  const titel = d.programma
    ? I18N.t('ai.programButtonTitle', { name: d.label, cmd: d.programma.cmd })
    : I18N.t('ai.buttonTitle', { name: d.label })
  return `<button class="cmd-btn ai-knop ${d.programma ? 'ai-prog' : ''} ${d.id === actiefId ? 'ai-actief' : ''}" data-ai-dienst="${esc(d.id)}" data-volgorde-id="ai:${esc(d.id)}" title="${esc(titel)}"><i class="ti ${aiKnopIcoon(d)}"></i> ${esc(d.label)}</button>`
}

function aiKnoppenBtns(ctxId) {
  if ((settings.ai || {}).knoppen === false) return ''
  const lijst = aiKlaarDiensten()
  if (!lijst.length) return ''

  const s = aiSessies[ctxId]
  const actief = (s && s.aan) ? s.providerId : ''

  return lijst.map(p => aiKnopHtml(p, actief)).join('')
}

// Terug naar de shell. Geen gewone knop: hij hoort niet in de volgorde en valt
// niet uit te zetten, want hij verschijnt alleen terwijl je in gesprek bent.
function aiShellKnop(ctxId) {
  if ((settings.ai || {}).knoppen === false) return ''
  if (!aiKlaarDiensten().length) return ''
  const s = aiSessies[ctxId]
  const actief = (s && s.aan) ? s.providerId : ''
  return `
          <button class="cmd-btn ai-shell" data-ai-uit="1" ${actief ? '' : 'hidden'}
                  title="${esc(I18N.t('ai.buttonShellTitle'))}">
            <i class="ti ti-terminal-2"></i> shell
          </button>`
}

function aiVerversKnoppen(ctxId) {
  const s = aiSessies[ctxId]
  const actief = (s && s.aan) ? s.providerId : ''
  const root = paneelVoorCtx(ctxId) || document
  levenden('[data-ai-dienst]', root).forEach(b => {
    b.classList.toggle('ai-actief', b.dataset.aiDienst === actief)
  })
  const uit = levend('[data-ai-uit]', root)
  if (uit) uit.hidden = !actief
}

function bedraadAiKnoppen(ctx) {
  const root = paneelVoorCtx(ctx.id) || document
  root.querySelectorAll('[data-ai-dienst]').forEach(btn => {
    btn.onclick = async () => {
      if (cmdSorteerModus || cmdSnelSorteerModus || psSnelSorteerModus) return
      const keuze = btn.dataset.aiDienst

      // Een programmaknop start gewoon dat programma. Geen sleutels, geen
      // tegoed, geen omleiding — één knop, één ding.
      if (keuze.startsWith('prog:')) {
        const knop = aiProgrammaKnoppen().find(k => k.id === keuze)
        if (knop) await aiStartProgramma(ctx, knop.dienst, knop.programma)
        return
      }

      const s = aiSessie(ctx.id)
      // Nog een keer op de knop van de dienst waar je in zit: terug naar de shell.
      if (s.aan && s.providerId === keuze) { aiZetShell(ctx.id); return }
      await aiKiesDienst(ctx, keuze)
      aiVerversKnoppen(ctx.id)
    }
  })
  const uit = root.querySelector('[data-ai-uit]')
  if (uit) uit.onclick = () => {
    if (cmdSorteerModus || cmdSnelSorteerModus || psSnelSorteerModus) return
    aiZetShell(ctx.id)
  }
}

function aiZetShell(ctxId) {
  const s = aiSessie(ctxId)
  if (!s.aan) return
  s.aan = false
  aiRegel(ctxId, 't-ok', I18N.t('ai.modeOffLine'))
  aiVerversBalk()
  aiVerversKnoppen(ctxId)
}

// Hetzelfde, maar met de uitleg erbij dat exit hier iets anders doet dan
// erbuiten — anders sluit iemand een keer per ongeluk de hele app af.
// Een korte regel die met de naam van een programma begint is een commando,
// geen vraag. Een echte vraag is langer of heeft een vraagteken — "wat doet
// codex eigenlijk?" gaat dus gewoon naar de AI.
function aiLijktProgramma(tekst) {
  const kaal = String(tekst || '').trim()
  if (!kaal || kaal.includes('?')) return false
  const woorden = kaal.split(/\s+/)
  if (woorden.length > 3) return false
  if (!vraagtOmEenVenster(woorden[0])) return false
  if (woorden.length === 1) return true
  // Wat erachter staat moet op vlaggen en subcommando's lijken, niet op tekst.
  return woorden.slice(1).every(w => /^(-{1,2}[\w-]+|[a-z][\w.:\/-]{0,14})$/.test(w))
}

function aiBedoeldeJeCommando(ctxId, woord) {
  aiRegel(ctxId, 't-jij', '❯ ' + woord)
  aiRegel(ctxId, 't-warn', I18N.t('ai.looksLikeCommand', { name: woord }))
  aiHtmlErbij(ctxId, `<div class="t-out">  ` +
    `<span class="t-doe" data-ai-run="!${esc(woord)}" title="${esc(I18N.t('ai.runAnywayTitle', { name: woord }))}">!${esc(woord)}</span>` +
    `<span class="t-voorstel-wat">  ${esc(I18N.t('ai.runAnywayNote', { name: woord }))}</span></div>`)
  aiHtmlErbij(ctxId, `<div class="t-out">  ` +
    `<span class="t-doe" data-ai-run="/shell" title="${esc(I18N.t('ai.buttonShellTitle'))}">/shell</span>` +
    `<span class="t-voorstel-wat">  ${esc(I18N.t('ai.leaveChatNote'))}</span></div>`)
  aiRegel(ctxId, 't-warn', I18N.t('ai.askInsteadHint', { name: woord }))
  aiHtmlErbij(ctxId, '<div class="t-sep"></div>')
}

function aiWisScherm(ctxId) {
  const s = aiSessie(ctxId)
  wisTerminal()
  if (s.berichten.length) {
    showToast(I18N.t('ai.clearedScreenToast', { count: s.berichten.length }))
  }
}

function aiSluitViaExit(ctxId) {
  const s = aiSessie(ctxId)
  const info = aiInfo(s.providerId)
  appendLine('cmd', '> exit')
  // Loopt er nog een antwoord binnen, dan hoort dat mee te stoppen.
  if (s.bezig) window.api.aiStop({ id: ctxId })
  s.aan = false
  aiRegel(ctxId, 't-ok', '✓ ' + I18N.t('ai.exitLine', { name: (info && info.label) || s.providerId }))
  aiRegel(ctxId, 't-warn', I18N.t('ai.exitHint'))
  aiHtmlErbij(ctxId, '<div class="t-sep"></div>')
  aiVerversBalk()
  aiVerversKnoppen(ctxId)
}

// Is er een dienst bij gekomen of weggevallen, dan hoort de rij opnieuw
// getekend te worden. Anders niet: opnieuw tekenen midden in een gesprek is
// onnodig onrustig.
function aiHerteken() {
  aiKnopStempel = null
  if (view === 'project' && activeId) renderMain()
  else if (view === 'cmd') renderCmdPanel()
  else if (view === 'ps') renderPsPanel()
}

function aiHertekenAlsNodig() {
  if (aiKnopStempel === null) return
  if (aiKnopVingerafdruk() === aiKnopStempel) return
  aiHerteken()
}

// ── Slash-commando's ──────────────────────────────────────────────────────────
// Alles wat met / begint hoort bij de app zelf en gaat nooit naar de shell.
const AI_SLASH_SUGGESTIES = [
  '/hulp', '/use claude', '/use openai', '/use gemini', '/use ollama',
  '/model ', '/modellen', '/modellen live', '/diensten', '/knoppen uit', '/thema ',
  '/sleutel ', '/systeem ', '/nieuw', '/stop', '/shell', '/ai ',
]

async function aiSlash(project, regel) {
  const id = project.id
  const s  = aiSessie(id)
  const zonder = String(regel).replace(/^\s*\//, '')
  const woord  = (zonder.split(/\s+/)[0] || '').toLowerCase()
  const arg    = zonder.slice(woord.length).trim()

  springNaarOutput()

  // Een sleutel hoort niet in beeld en niet in de geschiedenis.
  const geheim = (woord === 'sleutel' || woord === 'key')
  aiRegel(id, 't-cmd', '> ' + (geheim ? '/' + woord + (arg ? ' ••••••••' : '') : regel))

  if (!aiProviders.length) await aiLaadProviders()

  switch (woord) {
    case '': case 'hulp': case 'help': case '?':
      aiHulp(id); break

    case 'use': case 'gebruik':
      await aiKiesDienst(project, arg); break

    case 'diensten': case 'providers':
      aiToonDiensten(id); break

    case 'model':
      aiKiesModel(id, arg); break

    case 'modellen': case 'models':
      await aiToonModellen(id, /^(live|nieuw|ophalen)$/i.test(arg)); break

    case 'sleutel': case 'key':
      await aiZetSleutel(id, arg); break

    case 'systeem': case 'system':
      settings.ai = { ...(settings.ai || {}), systeem: arg }
      window.api.saveSettings(settings)
      aiRegel(id, 't-ok', arg ? I18N.t('ai.systemSetLine') : I18N.t('ai.systemClearedLine'))
      break

    case 'thema': case 'theme':
      await themaCommando(project, 'theme ' + arg)
      break

    case 'knoppen': case 'buttons': {
      const aanKnop = !/^(uit|off|nee|no|0|false)$/i.test(arg)
      settings.ai = { ...(settings.ai || {}), knoppen: aanKnop }
      window.api.saveSettings(settings)
      aiRegel(id, 't-ok', I18N.t(aanKnop ? 'ai.buttonsOnLine' : 'ai.buttonsOffLine'))
      aiHerteken()
      break
    }

    case 'nieuw': case 'new': case 'reset':
      s.berichten = []
      aiRegel(id, 't-ok', I18N.t('ai.conversationClearedLine'))
      break

    case 'stop':
      if (await window.api.aiStop({ id })) aiRegel(id, 't-warn', I18N.t('ai.stoppingLine'))
      else aiRegel(id, 't-warn', I18N.t('ai.nothingRunningLine'))
      break

    case 'shell': case 'exit': case 'sluit':
      s.aan = false
      aiRegel(id, 't-ok', I18N.t('ai.modeOffLine'))
      aiVerversBalk()
      break

    case 'ai':
      if (!arg) { aiRegel(id, 't-warn', I18N.t('ai.err.emptyQuestion')); break }
      await aiVraag(project, arg)
      break

    default:
      aiRegel(id, 't-err',  I18N.t('ai.unknownCommandError', { name: woord }))
      aiRegel(id, 't-warn', I18N.t('ai.tryHelpHint'))
  }
}

function aiHulp(id) {
  const regels = [
    ['/use <dienst>[:<model>]', I18N.t('ai.help.use')],
    ['/ai <vraag>',             I18N.t('ai.help.ask')],
    ['/model <naam>',           I18N.t('ai.help.model')],
    ['/modellen [live]',        I18N.t('ai.help.models')],
    ['/diensten',               I18N.t('ai.help.providers')],
    ['/sleutel <sleutel>',      I18N.t('ai.help.key')],
    ['/systeem <tekst>',        I18N.t('ai.help.system')],
    ['/nieuw',                  I18N.t('ai.help.new')],
    ['clear',                   I18N.t('ai.help.clear')],
    ['/stop',                   I18N.t('ai.help.stop')],
    ['/shell  of  exit',        I18N.t('ai.help.shell')],
    ['/knoppen aan|uit',        I18N.t('ai.help.buttons')],
    ['/thema <naam>',           I18N.t('ai.help.theme')],
    ['!<commando>',             I18N.t('ai.help.bang')],
  ]
  aiRegel(id, 't-ok', '✦ ' + I18N.t('ai.help.title'))
  regels.forEach(([k, v]) => aiRegel(id, 't-out', '  ' + k.padEnd(26, ' ') + v))
  aiHtmlErbij(id, '<div class="t-sep"></div>')
}

function aiToonDiensten(id) {
  const s = aiSessies[id] || {}
  if (!aiProviders.length) { aiRegel(id, 't-warn', I18N.t('ai.noProvidersLine')); return }
  aiRegel(id, 't-ok', '✦ ' + I18N.t('ai.providersTitle'))
  const teProberen = aiProviders.filter(p => p.gratis && !p.heeftSleutel).map(p => p.id)
  aiProviders.forEach(p => {
    const hier = p.id === s.providerId ? '›' : ' '
    const status = !p.sleutelNodig
      ? I18N.t('ai.status.noKeyNeeded')
      : p.heeftSleutel
        ? I18N.t('ai.status.keyFrom', { source: p.sleutelBron })
        : I18N.t('ai.status.noKey')
    const gratis = p.gratis && !p.heeftSleutel ? ' · ' + I18N.t('ai.status.free') : ''
    aiRegel(id, 't-out', ` ${hier} ${p.id.padEnd(12, ' ')} ${p.label} · ${p.merk} — ${status}${gratis}`)
  })
  if (teProberen.length) {
    aiRegel(id, 't-warn', I18N.t('ai.freeHint', { list: teProberen.join(', ') }))
  }
  aiHtmlErbij(id, '<div class="t-sep"></div>')
}

// De lijst die de dienst zélf teruggeeft. Wat in ai-providers.js staat is een
// startpunt dat veroudert; bij een lokale server is dit bovendien de enige
// manier om te weten wat er is gedownload.
async function aiHaalModellen(providerId, endpoint) {
  let r
  try { r = await window.api.aiModellen({ providerId, endpoint }) }
  catch (e) { r = { ok: false, soort: 'onbekendefout', bericht: e.message || String(e) } }
  if (r && r.ok) aiModelCache[providerId] = r.modellen || []
  return r || { ok: false, soort: 'onbekendefout' }
}

// Alles wat we van een dienst kennen: de ingebouwde lijst plus wat er is opgehaald.
function aiAlleModellen(providerId) {
  const info = aiInfo(providerId)
  const uit = []
  const gezien = new Set()
  for (const m of [...((info && info.modellen) || []), ...(aiModelCache[providerId] || [])]) {
    if (!m || !m.id || gezien.has(m.id)) continue
    gezien.add(m.id)
    uit.push(m)
  }
  return uit
}

// Ollama zet naast wat op je schijf staat ook modellen in de lijst die in de
// cloud draaien (`:cloud`). Die hebben een account nodig en zijn niet waar je
// die 4,7 GB voor hebt gedownload. Dus: eerst wat lokaal is, en daarbinnen het
// nieuwste — dat is bijna altijd het model dat je net hebt opgehaald.
function isCloudModel(id) { return /[:\-]cloud$/i.test(String(id || '')) }

function aiBesteModel(lijst) {
  if (!lijst || !lijst.length) return ''
  const lokaal = lijst.filter(m => !isCloudModel(m.id))
  const keuze = lokaal.length ? lokaal : lijst
  return [...keuze].sort((a, b) => (b.tijd || 0) - (a.tijd || 0))[0].id
}

async function aiToonModellen(id, live) {
  const s = aiSessie(id)
  const info = aiInfo(s.providerId)
  if (!info) { aiRegel(id, 't-err', I18N.t('ai.unknownProviderError', { name: s.providerId })); return }

  if (live) {
    aiRegel(id, 't-warn', I18N.t('ai.fetchingModelsLine', { name: info.label }))
    const r = await aiHaalModellen(s.providerId, ((settings.ai || {}).endpoints || {})[s.providerId] || '')
    if (!r.ok) { aiFoutUitleg(id, r); return }
    // Wél antwoord, maar niets erin. Bij een server op je eigen pc betekent dat
    // iets heel anders dan "het lukte niet", en er valt ook iets aan te doen.
    if (!(r.modellen || []).length) { aiGeenModellen(id, info); return }
    aiRegel(id, 't-ok', I18N.t('ai.modelsFetchedLine', { count: r.modellen.length }))
    if (!aiModelNaam(s)) aiKiesModel(id, aiBesteModel(r.modellen))
  }

  const lijst = aiAlleModellen(s.providerId)
  if (!lijst.length) { aiGeenModellen(id, info); return }
  aiRegel(id, 't-ok', '✦ ' + I18N.t('ai.modelsTitle', { name: info.label }))
  const nu = aiModelNaam(s)
  lijst.forEach(m => {
    const merk = m.id === nu ? '›' : ' '
    const extra = [m.label || '', isCloudModel(m.id) ? I18N.t('ai.modelCloudNote') : '']
      .filter(Boolean).join(' · ')
    aiHtmlErbij(id, `<div class="t-out"> ${merk} ` +
      `<span class="t-doe" data-ai-run="/model ${esc(m.id)}" title="${esc(I18N.t('ai.pickModelTitle', { model: m.id }))}">${esc(m.id)}</span>` +
      (extra ? `<span class="t-voorstel-wat">  ${esc(extra)}</span>` : '') + `</div>`)
  })
  aiRegel(id, 't-warn', I18N.t('ai.modelsPickHint'))
  aiHtmlErbij(id, '<div class="t-sep"></div>')
}

// De server doet het, maar heeft niets te bieden. Per dienst hoort daar een
// ander antwoord bij: bij Ollama moet je er een downloaden, bij LM Studio een
// laden, en bij een eigen server mag je de naam gewoon zelf intypen.
function aiGeenModellen(id, info) {
  aiRegel(id, 't-warn', I18N.t('ai.noModelsFoundLine', { name: (info && info.label) || '' }))
  if (!aiStappen(id, (info && info.hulp || {}).geenmodellen)) {
    aiRegel(id, 't-warn', I18N.t('ai.noModelsHint'))
  }
  aiToonVoorstellen(id, info)
  aiHtmlErbij(id, '<div class="t-sep"></div>')
}

// Een server op je eigen pc kan alleen vertellen wat je al hebt gedownload, en
// dat is niets. Dan hoor je hier te kunnen kiezen in plaats van zelf een naam
// te moeten opzoeken: klik er een aan en het ophaalcommando staat klaar.
function aiToonVoorstellen(id, info) {
  const lijst = (info && info.voorstellen) || []
  const patroon = (info && info.haalPatroon) || ''
  if (!lijst.length || !patroon) return false
  aiRegel(id, 't-ok', '✦ ' + I18N.t('ai.suggestTitle'))
  lijst.forEach(v => {
    const cmd = '!' + patroon.replace('{model}', v.id)
    aiHtmlErbij(id, `<div class="t-out">  ` +
      `<span class="t-doe" data-ai-cmd="${esc(cmd)}" title="${esc(I18N.t('ai.suggestTitleHover', { model: v.id }))}">${esc(v.id)}</span>` +
      `<span class="t-voorstel-wat">  ${esc(v.wat || '')}${v.grootte ? ' · ' + esc(v.grootte) : ''}</span></div>`)
  })
  aiRegel(id, 't-warn', I18N.t('ai.suggestHint'))
  return true
}

async function aiKiesDienst(project, arg) {
  const id = project.id
  const s  = aiSessie(id)
  const [naamRuw, modelRuw] = String(arg || '').split(/[:\s]+/)
  const naam = (naamRuw || '').toLowerCase()
  if (!naam) { aiToonDiensten(id); return }

  const info = aiInfo(naam)
  if (!info) {
    aiRegel(id, 't-err', I18N.t('ai.unknownProviderError', { name: naam }))
    aiToonDiensten(id)
    return
  }

  const andereDienst = s.providerId !== info.id
  const vorige = aiInfo(s.providerId)

  // Eerst afsluiten wat er nu draait. Anders praat je straks met twee tegelijk,
  // of blijft er een antwoord binnendruppelen dat bij de vorige dienst hoort.
  if (s.bezig) {
    try { window.api.aiStop({ id }) } catch {}
    s.bezig = false
    aiStroomKlaar(id)
  }
  // Draait er een AI-programma in het venster (Claude Code, Codex), dan is dát
  // wat er actief is. Dat gaat eerst dicht.
  if (ptySessies.has(id)) {
    const draaiend = ptySessies.get(id).naam
    stopPtySessie(id)
    aiRegel(id, 't-ok', '✓ ' + I18N.t('ai.closedProgramLine', { name: draaiend }))
  }
  // Een gesprek hoort bij één dienst. De volgende heeft je vorige vragen niet
  // gezien, en ze ongemerkt doorsturen naar een ander bedrijf hoort niet.
  if (andereDienst && s.berichten.length) {
    aiRegel(id, 't-ok', '✓ ' + I18N.t('ai.closedChatLine', {
      name: (vorige && vorige.label) || s.providerId, count: s.berichten.length }))
    s.berichten = []
  }

  // Van dienst wisselen betekent ook van model wisselen. Bleef het model van
  // de vorige dienst staan, dan ging er een verzoek de deur uit met een naam
  // die deze dienst niet kent — en dat las je pas terug in de foutmelding.
  s.providerId = info.id
  if (modelRuw) s.model = modelRuw
  else if (andereDienst || !s.model) {
    s.model = ((settings.ai || {}).modellen || {})[info.id] || info.standaardModel || ''
  }
  s.aan = true

  // Een lokale server heeft geen vaste modellen: wat er is hangt af van wat jij
  // hebt gedownload. Dan halen we de lijst meteen op en pakken de eerste, zodat
  // je niet eerst zelf hoeft uit te zoeken hoe je model heet.
  if (!s.model && info.kanModellenHalen) {
    aiRegel(id, 't-warn', I18N.t('ai.fetchingModelsLine', { name: info.label }))
    const r = await aiHaalModellen(info.id, ((settings.ai || {}).endpoints || {})[info.id] || '')
    if (r.ok && (r.modellen || []).length) {
      s.model = aiBesteModel(r.modellen)
      aiRegel(id, 't-ok', I18N.t('ai.autoModelLine', { model: s.model }))
      aiRegel(id, 't-warn', I18N.t('ai.autoModelHint'))
    } else if (!r.ok) {
      aiFoutUitleg(id, r)
    } else {
      aiGeenModellen(id, info)
    }
  }

  settings.ai = {
    ...(settings.ai || {}),
    provider: info.id,
    modellen: { ...((settings.ai || {}).modellen || {}), [info.id]: s.model },
  }
  window.api.saveSettings(settings)

  aiRegel(id, 't-ok', '✦ ' + I18N.t('ai.switchedLine', { name: info.label, model: aiModelNaam(s) || '—' }))

  // Nog geen sleutel? Dan hoor je dat nu te lezen, niet pas als je vraag
  // mislukt — met de stappen die bij déze dienst horen.
  if (info.sleutelNodig && !info.heeftSleutel) {
    aiRegel(id, 't-err', I18N.t('ai.err.noKey', { name: info.label }))
    if (!aiStappen(id, (info.hulp || {}).sleutel)) {
      aiRegel(id, 't-warn', I18N.t('ai.err.noKeyHow', { where: info.sleutelWaar, env: info.sleutelEnv }))
    }
    if (info.sleutelEnv) aiRegel(id, 't-warn', I18N.t('ai.err.orEnv', { env: info.sleutelEnv }))
  }
  aiRegel(id, 't-warn', I18N.t('ai.modeOnHint'))
  aiVerversBalk()
  aiVerversKnoppen(id)
  aiHertekenAlsNodig()
}

// Het programma van een dienst starten in een echte terminal in het venster.
async function aiStartProgramma(project, info, programma) {
  const id = project.id
  const loc = project.locations[project.activeLocation] || project.locations[0]
  if (!loc || !loc.path) { aiRegel(id, 't-err', I18N.t('editor.noLocationSetToast')); return }

  aiRegel(id, 't-ok', '✦ ' + I18N.t('ai.viaProgramLine', { name: info.label, cmd: programma.cmd }))
  // Hoe je eruit komt verschilt per programma, dus dat zeggen we erbij in
  // plaats van "typ exit" te gokken. En er is altijd nog de knop hiernaast.
  aiRegel(id, 't-warn', I18N.t('ai.viaProgramHint', {
    name: programma.label || programma.cmd,
    hoe: programma.sluiten || I18N.t('ai.programCloseUnknown'),
  }))
  aiRegel(id, 't-warn', I18N.t('ai.viaProgramEscape'))

  if (await startPtySessie(id, programma.cmd, loc.path)) return

  // Geen echte terminal beschikbaar: dan alsnog een eigen consolevenster.
  aiRegel(id, 't-warn', I18N.t('term.notForInteractiveWarn'))
  openCmdMetMelding({ cwd: loc.path, cmd: programma.cmd })
}

function aiKiesModel(id, arg) {
  const s = aiSessie(id)
  if (!arg) { aiToonModellen(id); return }
  s.model = arg
  settings.ai = {
    ...(settings.ai || {}),
    modellen: { ...((settings.ai || {}).modellen || {}), [s.providerId]: arg },
  }
  window.api.saveSettings(settings)
  aiRegel(id, 't-ok', '✦ ' + I18N.t('ai.modelSetLine', { model: arg }))
  aiVerversBalk()
}

async function aiZetSleutel(id, arg) {
  const s = aiSessie(id)
  const info = aiInfo(s.providerId)
  const naam = (info && info.label) || s.providerId
  let r
  try { r = await window.api.aiZetSleutel({ providerId: s.providerId, sleutel: arg }) }
  catch (e) { aiRegel(id, 't-err', I18N.t('ai.err.other', { message: e.message || String(e) })); return }
  await aiLaadProviders()
  if (!arg) { aiRegel(id, 't-ok', I18N.t('ai.keyClearedLine', { name: naam })); return }
  aiRegel(id, 't-ok', I18N.t('ai.keySavedLine', { name: naam }))
  if (r && !r.versleuteld) aiRegel(id, 't-warn', I18N.t('ai.keyPlainWarn'))
  aiHertekenAlsNodig()
}

// ── Commando's die een echt venster nodig hebben ──────────────────────────────
// De uitvoer hieronder is precies dat: uitvoer. Er is geen toetsenbord op
// aangesloten, dus alles wat je iets vraagt of een eigen scherm tekent — Claude
// Code, een REPL, ssh, vim — loopt hier vast. Zulke commando's gaan naar een
// echt consolevenster in dezelfde werkmap.
const VRAAGT_OM_VENSTER = [
  // AI-programma's op de opdrachtregel. Ze tekenen een eigen scherm en willen
  // een toetsenbord; zonder echte terminal stoppen ze met "stdin is not a
  // terminal". Elk met de uitzondering voor de stand waarin ze juist niets
  // vragen en gewoon antwoord teruggeven.
  /^claude(\s|$)(?!.*(-p|--print)\b)/i,      // Claude Code, tenzij je zelf --print gebruikt
  /^codex(?!\s+exec\b)(\s|$)/i,             // Codex CLI, behalve `codex exec`
  /^gemini(\s|$)(?!.*(-p|--prompt)\b)/i,     // Gemini CLI
  /^(aider|opencode|cursor-agent|qwen|goose)(\s|$)/i,
  /^(node|python|python3|py|irb|ipython|deno|dart|R)$/i,   // kale REPL
  /^(powershell|pwsh|cmd|bash|sh|zsh|wsl)$/i,
  /^(ssh|sftp|ftp|telnet|scp\s+-r?\s*$)/i,
  /^(vi|vim|nvim|nano|emacs|less|more|top|htop|btop)(\s|$)/i,
  /^(mysql|psql|sqlite3|mongosh|redis-cli)(\s|$)/i,
  /^gh\s+auth\s+login\b/i,
  /^git\s+(rebase\s+-i|add\s+-p|add\s+--patch)\b/i,
  /^npm\s+init\s*$/i,
  /^npx\s+create-/i,
  /^flutter\s+attach\b/i,
  /^ollama\s+(run|pull|serve)\b/i,   // pull tekent een voortgangsbalk
]

function vraagtOmEenVenster(cmd) {
  const kaal = String(cmd || '').trim()
  if (!kaal) return false
  return VRAAGT_OM_VENSTER.some(re => re.test(kaal))
}

// De melding die je krijgt als zoiets tóch in de uitvoer belandt
const STDIN_KLACHTEN = /no stdin data received|must be provided either through stdin|not a tty|inquirer|raw mode is not supported/i
let stdinKlacht = false

// Git klaagde over een index.lock die er al staat. Zie regelGitSlot hieronder.
let slotKlacht = false

// `opties.eigenTerminal` dwingt de weg met een echt toetsenbord af, ook als het
// commando er niet naar uitziet. Nodig zodra git zelf om inloggegevens vraagt:
// zonder terminal blijft een push wachten op een token dat niemand kan typen.
async function executeCmd(project, cmd, cmdKey = null, opties = {}) {
  const loc = project.locations[project.activeLocation] || project.locations[0]
  const werkmap = String((opties && opties.cwd) || (loc && loc.path) || '').trim()

  // Alles met een / ervoor hoort bij de app zelf: van dienst wisselen, een
  // sleutel zetten, het gesprek wissen. Dat gaat nooit naar de shell.
  if (/^\s*\//.test(cmd)) { await aiSlash(project, String(cmd).trim()); return }

  // Sta je in gesprek, dan gaat wat je typt naar de AI. Met een uitroepteken
  // ervoor draai je alsnog gewoon een commando, zonder de modus te verlaten.
  if (aiAan(project.id)) {
    const kaalAi = String(cmd || '').trim()
    // `exit` sluit hier het gesprek. Dat is wat elk AI-programma op de
    // opdrachtregel doet, dus dat verwacht je hier ook. Buiten een gesprek
    // sluit exit nog steeds gewoon CommandDeck.
    if (/^(exit|quit)$/i.test(kaalAi)) { aiSluitViaExit(project.id); return }
    // `clear` maakt het scherm leeg, net als buiten een gesprek. Het gesprek
    // zelf blijft staan — dat weggooien kun je niet terugdraaien, dus daar is
    // /nieuw voor. Wel even zeggen dat het verschil er is.
    if (/^(clear|cls)$/i.test(kaalAi)) { aiWisScherm(project.id); return }
    // Eén los woord dat ook de naam van een AI-programma is: dat bedoel je
    // bijna zeker als commando en niet als vraag. Niet zomaar starten — wel
    // vragen, want anders verstook je er een verzoek aan.
    if (aiLijktProgramma(kaalAi)) { aiBedoeldeJeCommando(project.id, kaalAi); return }
    if (kaalAi.startsWith('!')) {
      cmd = kaalAi.slice(1).trim()
      if (!cmd) return
    } else {
      await aiVraag(project, kaalAi)
      return
    }
  }

  const cdTarget = parseCd(cmd, project)
  if (cdTarget) { await handleCd(cdTarget, project); return }

  // Een paar commando's horen bij het venster zelf en niet bij een losse shell:
  // in een nieuw proces uitgevoerd zouden ze niets doen.
  // `theme` hoort bij het woordenboek, niet bij de shell.
  if (isThemaCommando(cmd)) { await themaCommando(project, cmd); return }

  const kaal = String(cmd || '').trim().toLowerCase()
  if (kaal === 'cls' || kaal === 'clear' || kaal === 'clear-host') { wisTerminal(); return }
  if (kaal === 'exit') {
    appendLine('cmd', '> exit')
    appendLine('ok', '✓ ' + I18N.t('term.exitLine'))
    setTimeout(() => window.api.close(), 250)
    return
  }

  if (!werkmap) {
    appendLine('err', (project.id === CMD_CTX_ID || project.id === PS_CTX_ID)
      ? I18N.t('term.noCwdWithButtonError')
      : I18N.t('term.noLocationConfiguredError'))
    return
  }

  // Iets dat om invoer vraagt: dat heeft een echt toetsenbord nodig. Dat kan
  // hier, in een eigen tabblad met een echte terminal erin. Alleen als dat niet
  // lukt gaat het alsnog naar een consolevenster van Windows.
  if (vraagtOmEenVenster(cmd) || opties.eigenTerminal) {
    springNaarOutput()
    appendLine('cmd', '> ' + cmd)

    if (await startPtySessie(project.id, cmd, werkmap, shellVoor(project))) {
      appendLine('ok', '✓ ' + I18N.t('term.runningHereLine', { name: ptyNaam(cmd), path: werkmap }))
      appendLine('sep', '')
      recordHistory({ cmd, cwd: werkmap, projectId: project.id, source: cmdKey ? 'button' : 'run' })
      setStatus('running', cmd)
      return
    }

    appendLine('warn', I18N.t('term.notForInteractiveWarn'))
    appendLine('ok',  '✓ ' + I18N.t('term.openedInOwnWindowLine', { path: werkmap }))
    appendLine('sep', '')
    if (project.id === PS_CTX_ID) window.api.openPs({ cwd: werkmap, cmd })
    else openCmdMetMelding({ cwd: werkmap, cmd })
    recordHistory({ cmd, cwd: werkmap, projectId: project.id, source: cmdKey ? 'button' : 'run' })
    setStatus('ended', '✓ ' + I18N.t('term.endedOwnWindowStatus'))
    return
  }

  // Je start iets: dan wil je de uitvoer zien, niet de verkenner.
  springNaarOutput()

  const autoFixOn = settings.autoFix?.enabled !== false
  const useAutofix = autoFixOn && isAutofixEligible(cmdKey, cmd)

  setStatus('running', cmd)
  isRunning = true
  stdinKlacht = false
  cmdFlowActive = useAutofix
  updateRunBtnIfVisible()

  try {
    let result
    if (useAutofix) {
      result = await window.api.runCmdWithAutofix({
        projectId: project.id, cmd, cwd: werkmap, cmdKey, autoFixEnabled: true,
      })
    } else {
      const r = await window.api.runCmd({ projectId: project.id, cmd, cwd: werkmap, shell: shellVoor(project) })
      result = (r && typeof r === 'object') ? r : { success: true }
    }

    // Alleen bewaren wat gelukt is. Zelf gestopt telt niet als mislukt — een
    // `flutter run` die je afbreekt wil je later gewoon terug kunnen halen.
    if (result.success || result.cancelled) {
      recordHistory({ cmd, cwd: werkmap, projectId: project.id, source: cmdKey ? 'button' : 'run' })
    }

    if (useAutofix) {
      if (result.cancelled) {
        // status staat al op '✗ gestopt' via de Stop-knop, niet overschrijven
      } else if (result.manual || result.flutterMissing) {
        setStatus('failed', '⚠ ' + I18N.t('term.manualActionRequiredStatus'))
      } else if (result.success && !result.autoFixed) {
        setStatus('ended', '✓ ' + I18N.t('term.doneStatus'))
      } else if (!result.success) {
        setStatus('failed', '✗ ' + (result.autoFixed ? I18N.t('term.autofixDidNotHelpStatus') : I18N.t('term.installFailedStatus')))
      }
    } else if (result.flutterMissing || result.manual) {
      setStatus('failed', '⚠ ' + I18N.t('term.manualActionRequiredStatus'))
    }
    // Het commando klaagde dat het geen invoer kreeg: dan weet je waarom, en
    // hoe je het wel voor elkaar krijgt.
    if (stdinKlacht) {
      appendLine('warn', I18N.t('term.stdinExpectedWarn1'))
      appendLine('warn', I18N.t('term.stdinExpectedWarn2'))
      stdinKlacht = false
    }

    // Struikelde git over een slot dat er nog stond? Dan is er niets mis met
    // het commando en heeft opnieuw proberen zin — zodra dat slot weg is.
    if (slotKlacht) {
      slotKlacht = false
      if (!opties.geenSlotHerstel) {
        const opnieuw = await regelGitSlot(project, werkmap)
        if (opnieuw) return await executeCmd(project, cmd, cmdKey, { ...opties, geenSlotHerstel: true })
      }
    }
    return result
  } finally {
    cmdFlowActive = false
    isRunning = false
    updateRunBtnIfVisible()
  }
}

// ── Een blijven staan slot ───────────────────────────────────────────────────
// "Another git process seems to be running" stuurt je normaal de verkenner in
// om in .git een bestand te gaan zoeken. Bijna altijd is het een restje van een
// opdracht die is afgebroken en kan het gewoon weg. Bijna — dus eerst kijken
// wat er nog draait, dat eerlijk zeggen, en de gebruiker laten kiezen.
//
// Processen doodschieten doen we niet: op Windows is niet te zien bij wélke map
// een git-proces hoort, dus dat zou ook de commit van een ander project kunnen
// afkappen — en juist dát is hoe je een half geschreven index krijgt.
// Geeft true als het commando opnieuw geprobeerd mag worden.
async function regelGitSlot(project, pad) {
  const netwerk = padIsNetwerk(pad)

  // Op SMB ruimt git index.lock trager op dan lokaal. Eén stille wachtronde
  // voorkomt dat we meteen "weghalen" aanbieden terwijl het slot nog mag
  // verdwijnen. Geen auto-unlink — de gebruiker beslist.
  if (netwerk) {
    await new Promise(r => setTimeout(r, 5000))
  }

  let info = await window.api.gitSlotInfo(pad).catch(() => null)
  if (!info || !info.bestaat) {
    // Slot al weg, en toch de melding: dan was het een wedloop met iets anders.
    // Opnieuw proberen is dan precies het goede antwoord.
    return await vraagJaNee(I18N.t('git.slot.titel'), I18N.t('git.slot.wegTekst'),
      I18N.t('git.slot.opnieuw'))
  }

  if (info.eigenCommandoDraait) {
    await meldKort(I18N.t('git.slot.titel'), I18N.t('git.slot.eigenTekst'))
    return false
  }

  const minuten = Math.floor((info.ouderdomMs || 0) / 60000)
  const ouderdom = minuten >= 1
    ? I18N.t('git.slot.ouderdomMin', { minuten })
    : I18N.t('git.slot.ouderdomNet')
  const draaien = Number.isFinite(info.gitProcessen) ? info.gitProcessen : null

  const regels = [info.pad || '', ouderdom]
  if (draaien) regels.push(I18N.t('git.slot.draaien', { aantal: draaien }))

  // Draait er nergens een git, dan is weghalen het veilige antwoord en mag het
  // de aanbevolen knop zijn. Draait er wel een, dan is wachten dat.
  // Op netwerk: tot 2 minuten ouderdom blijft "opnieuw" primair — SMB kan
  // trager zijn met opruimen, ook zonder zichtbare git.exe.
  const rustig = !draaien
  const netwerkGeduld = netwerk && (info.ouderdomMs || 0) < 120000
  const opnieuwPrimair = !rustig || netwerkGeduld
  const tekstSleutel = netwerk
    ? 'git.slot.netwerkTekst'
    : (rustig ? 'git.slot.rustigTekst' : 'git.slot.drukTekst')
  const keuze = await vraagKeuze({
    titel: I18N.t('git.slot.titel'),
    tekst: I18N.t(tekstSleutel),
    regels,
    knoppen: [
      { label: I18N.t('common.cancel'), waarde: '' },
      { label: I18N.t('git.slot.opnieuw'), waarde: 'opnieuw', soort: opnieuwPrimair ? 'primair' : '' },
      { label: I18N.t('git.slot.weghalen'), waarde: 'weg', soort: opnieuwPrimair ? 'gevaar' : 'primair' },
    ],
  })
  if (!keuze) return false
  if (keuze === 'opnieuw') return true

  const r = await window.api.gitSlotWeg(pad).catch(() => null)
  if (!r || !r.ok) {
    await meldKort(I18N.t('git.slot.titel'),
      I18N.t(r && r.reden === 'eigen-commando' ? 'git.slot.eigenTekst' : 'git.slot.mislukt'))
    return false
  }
  appendLine('ok', '✓ ' + I18N.t('git.slot.weggehaald'))
  return true
}

// ── Achterlopen opmerken ─────────────────────────────────────────────────────
// De spiegel van de afsluitcontrole: die vangt "je hebt werk dat nergens
// anders staat", dit vangt "er staat werk dat jij niet hebt". Precies wat
// misgaat als je op twee machines aan hetzelfde project werkt.
const gitLaatsteFetch = {}     // pad -> tijdstip
let achterstandBezig = false

// Wachten tot het scherm vrij is. Inloggen en deze vraag delen één venster en
// één antwoord; komt de een ertussendoor, dan overschrijft hij het antwoord van
// de ander en blijft het inloggen hangen. Geeft false als het te lang duurt.
async function wachtOpVrijVenster(maxMs = 3 * 60 * 1000) {
  const eind = Date.now() + maxMs
  while (inlogBezig || vraagKlaar) {
    if (Date.now() > eind) return false
    await new Promise(r => setTimeout(r, 200))
  }
  return true
}

// Kijkt of de remote iets heeft wat deze pc niet heeft, en biedt aan het op te
// halen. Draait bij het openen van een project, en na het inloggen voor het
// project dat dan openstaat — dat is precies het moment waarop je wil weten dat
// je gisteren op de andere pc verder bent gegaan.
async function controleerAchterstand() {
  if (achterstandBezig) return
  if ((settings.git || {}).fetchBijOpenen === false) return
  if (!await wachtOpVrijVenster()) return

  // Pas ná het wachten kijken welk project openstaat: tijdens het inloggen kan
  // er van account gewisseld zijn, en dan gaat dit over andermans map.
  const p = projects.find(x => x.id === activeId)
  if (!p) return
  const pad = actieveLocPad(p)
  if (!pad) return

  const staat = gitStaten[pad] || await ververesGitPad(pad)
  if (!GitTools.magFetchen(staat, gitLaatsteFetch[pad])) return

  achterstandBezig = true
  try {
    // Ook bij een mislukte fetch de tijd bijwerken: anders probeert hij het
    // bij elke klik opnieuw als je offline bent.
    gitLaatsteFetch[pad] = Date.now()
    const r = await window.api.gitFetch(pad)
    if (!r || !r.ok) return

    const na = await ververesGitPad(pad, true)
    const plan = GitTools.achterstandKeuzes(na)
    if (!plan) return
    // Je kunt inmiddels ergens anders zijn; dan niet alsnog een venster
    // openen over een project dat je niet meer voor je hebt.
    if (activeId !== p.id) return

    await biedAchterstandAan(p, pad, plan)
  } catch {
    // Netwerk weg, remote onbereikbaar: de indicator blijft staan op wat hij
    // wist. Dat is beter dan een foutmelding over iets waar je niet om vroeg.
  } finally {
    achterstandBezig = false
  }
}

// De vraag zelf. De knoppen hangen af van wat er aan de hand is: vooruitspoelen
// kan alleen als jij zelf niets extra's hebt, en niet-vastgelegd werk moet eerst
// opzij. Eén knop "ophalen" die in de helft van de gevallen een foutmelding
// geeft is geen keuze, dus staan de echte mogelijkheden er gewoon.
async function biedAchterstandAan(p, pad, plan) {
  const regels = []
  if (plan.uitEenLopend) regels.push(I18N.t('git.achter.uitEenLopend', { aantal: plan.ahead || 0 }))
  if (plan.vuil) regels.push(I18N.t('git.achter.vuil', { aantal: plan.vuil }))

  // column-reverse in het venster: achterste knop komt bovenaan. Dus de
  // aanbevolen weg als laatste in de lijst.
  const knoppen = [{ label: I18N.t('git.achter.later'), waarde: '' }]
  for (const wijze of [...plan.wijzen].reverse()) {
    knoppen.push({
      label: I18N.t((plan.stashNodig ? 'git.achter.knopWegzetten.' : 'git.achter.knop.') + wijze),
      waarde: wijze,
      soort: wijze === plan.wijzen[0] ? 'primair' : '',
    })
  }

  const wijze = await vraagKeuze({
    titel: I18N.t('git.achter.titel', { aantal: plan.behind, branch: plan.branch }),
    tekst: I18N.t(plan.uitEenLopend ? 'git.achter.tekstUitEen'
                : plan.vuil        ? 'git.achter.tekstVuil'
                :                    'git.achter.tekst'),
    regels,
    knoppen,
  })
  if (!wijze) return

  // Eerst het eigen werk opzij. Lukt dat niet, dan stoppen we: doorgaan zou
  // betekenen dat git over aangepaste bestanden heen wil, en dat weigert hij
  // toch — of erger, halverwege.
  let weggezet = false
  if (plan.stashNodig) {
    await executeCmd(p, GitTools.stashCommando(), 'git-stash')
    const naStash = await ververesGitPad(pad, true)
    if (naStash && naStash.vuil) {
      await meldKort(I18N.t('git.achter.titel', { aantal: plan.behind, branch: plan.branch }),
        I18N.t('git.achter.stashMislukt'))
      return
    }
    weggezet = true
  }

  await executeCmd(p, GitTools.pullCommando(wijze), 'git-pull')
  const naPull = await ververesGitPad(pad, true)

  // Het werk terughalen dat we net opzij zetten. Ook als de pull mislukte —
  // anders staat je werk in een stash waar je niet om vroeg.
  if (weggezet) {
    const lijst = await window.api.gitStashLijst(pad).catch(() => null)
    const bovenste = (lijst && lijst[0]) || null
    if (bovenste) {
      await executeCmd(p, GitTools.stashPopCommando(bovenste.ref), 'git-stash-lijst')
      await ververesGitPad(pad, true)
    }
  }

  if (naPull && naPull.behind) {
    await meldKort(I18N.t('git.achter.titel', { aantal: naPull.behind, branch: naPull.branch || plan.branch }),
      I18N.t('git.achter.mislukt'))
  }
  vraagProjectHertekenen()
}

// ── Onveilig git-werk: afsluiten én accountwisselen ──────────────────────────
// Het main-proces houdt het sluiten tegen en vraagt ons om te kijken. Dezelfde
// ronde draait bij het wisselen van account: per project een eigen vraag, zodat
// meerdere mappen achter elkaar weggezet kunnen worden. Dit ziet ook werk dat
// buiten CommandDeck om is gemaakt: git kijkt naar de bestanden, niet naar wie
// ze geschreven heeft.
let onveiligWerkBezig = false

function hartslagAfsluiten(ms) {
  try { window.api.gitAfsluitHartslag({ ms: ms || 60 * 1000 }) } catch {}
}

async function wachtOpOnveiligWerk() {
  while (onveiligWerkBezig) {
    hartslagAfsluiten()
    await new Promise(r => setTimeout(r, 250))
  }
}

// Geeft 'door' (verder: sluiten of wisselen) of 'blijven' (afbreken).
async function controleerOnveiligWerk(reden) {
  await ververesAlleGitStaten(true)

  const instelling = GitTools.afsluitInstelling((settings.git || {}).afsluiten)
  const teVragen = GitTools.teVragenProjecten(gitProjectenLijst(), instelling)
  const totaal = teVragen.length

  for (let i = 0; i < totaal; i++) {
    hartslagAfsluiten(totaal > 1 ? 90 * 1000 : 60 * 1000)
    const klaar = await vraagOverProject(teVragen[i], { reden, nr: i + 1, totaal })
    if (klaar === 'blijven') return 'blijven'
  }
  return 'door'
}

async function controleerVoorAfsluiten(info = {}) {
  hartslagAfsluiten()
  await wachtOpOnveiligWerk()
  onveiligWerkBezig = true
  try {
    const uitkomst = await controleerOnveiligWerk('afsluiten')
    if (uitkomst === 'blijven') { window.api.gitAfsluitenAf(); return }

    // Windows wilde afsluiten en wij hebben dat stilgezet. Dat betekent dat
    // Windows er zelf mee is gestopt — dus zeg dat, anders sta je te wachten op
    // een pc die niet meer uitgaat.
    if (info && info.aanleiding === 'windows') {
      hartslagAfsluiten(180 * 1000)
      await meldKort(I18N.t('git.afsluit.windowsTitel'), I18N.t('git.afsluit.windowsTekst'))
    }
    window.api.gitAfsluitenMag()
  } catch (e) {
    // Nooit door onze eigen fout het venster onsluitbaar maken.
    window.api.gitAfsluitenMag()
  } finally {
    onveiligWerkBezig = false
  }
}

// Geeft 'door' (volgende project) of 'blijven' (afsluiten/wisselen afbreken).
async function vraagOverProject(project, opties = {}) {
  const prefix = opties.reden === 'wisselen' ? 'git.wissel' : 'git.afsluit'
  const nr = opties.nr || 1
  const totaal = opties.totaal || 1
  const redenen = GitTools.onveiligeRedenen(project.staat)
  const regels = redenen.map(r => I18N.t('git.afsluit.reden.' + r.soort, { aantal: r.aantal }))
  if (project.staat.bestanden && project.staat.bestanden.length) {
    regels.push('', ...project.staat.bestanden.slice(0, 12))
  }

  let tekst = I18N.t(prefix + '.tekst')
  if (totaal > 1) tekst += ' ' + I18N.t('git.afsluit.teller', { n: nr, totaal })

  const keuze = await vraagKeuze({
    titel: I18N.t(prefix + '.titel', { project: project.naam }),
    tekst,
    regels,
    // Onder elkaar (vier keuzes), dus achterste eerst: commit & push bovenaan,
    // blijven onderaan, en de rode knop niet direct onder de aanbevolen.
    knoppen: [
      { label: I18N.t('git.afsluit.blijven'), waarde: 'blijven' },
      { label: I18N.t(prefix + '.tochAf'), waarde: 'door', soort: 'gevaar' },
      { label: I18N.t('git.afsluit.terminal'), waarde: 'terminal' },
      { label: I18N.t('git.afsluit.commitPush'), waarde: 'commitpush', soort: 'primair' },
    ],
  })

  if (!keuze || keuze === 'blijven') return 'blijven'
  if (keuze === 'door') return 'door'

  if (keuze === 'terminal') {
    // Zelf regelen in een echte terminal. Het afsluiten of wisselen gaat niet
    // door — de gebruiker is nu juist aan het werk in dat project.
    try { await openCmdMetMelding({ cwd: project.pad }) } catch {}
    return 'blijven'
  }

  // Commit en push in één keer. We tonen het in de terminal van de app zodat
  // je ziet wat er gebeurt, en kijken daarna of het gelukt is.
  hartslagAfsluiten(180 * 1000)
  const p = projects.find(x => x.id === project.id)
  if (!p) return 'door'

  // executeCmd draait op de áctieve locatie van het project. Gaat deze melding
  // over een andere locatie, dan moet die eerst actief worden — anders wordt er
  // gecommit in de verkeerde map, en dat merk je pas veel later.
  if (typeof project.locIndex === 'number' && p.activeLocation !== project.locIndex) {
    p.activeLocation = project.locIndex
    saveProjects()
  }

  if (project.staat.vuil > 0) {
    const bericht = await vraagTekst({
      titel: I18N.t('git.commit.title'),
      tekst: I18N.t('git.commit.text', { aantal: project.staat.vuil }),
      placeholder: GitTools.automatischCommitBericht(project.staat),
      okLabel: I18N.t('git.afsluit.commitPush'),
    })
    // null = geannuleerd. Leeg = wel doorgaan, maar zonder eigen bericht;
    // dan vullen we er zelf een in op basis van wat er verandert.
    if (bericht === null) return 'blijven'
    selectProject(p.id)
    hartslagAfsluiten(180 * 1000)
    await executeCmd(p, GitTools.commitCommando(bericht || GitTools.automatischCommitBericht(project.staat)), 'git-commit')
  }

  const na = await ververesGitStaat(p, true)
  const pushCmd = GitTools.pushCommando(na)
  if (pushCmd) {
    hartslagAfsluiten(180 * 1000)
    if (!await zorgVoorJuisteGithubPush(p)) return 'blijven'
    const pushResult = await executeCmd(p, pushCmd, 'git-push')
    const opnieuw = await naMislukteRemote(p, 'git-push', pushResult)
    if (opnieuw === 'opnieuw') {
      const staatNu = gitStaten[actieveLocPad(p)]
      const retry = staatNu ? GitTools.pushCommando(staatNu) : pushCmd
      if (retry) await executeCmd(p, retry, 'git-push')
    }
  }

  // Nagekeken in plaats van aangenomen: als de push mislukte (geen netwerk,
  // geweigerd) staat het werk er nog steeds, en dan hoor je dat te weten.
  const eind = await ververesGitStaat(p, true)
  const nog = GitTools.indicator(eind)
  if (nog && nog.onveilig) {
    const toch = await vraagJaNee(
      I18N.t('git.afsluit.misluktTitel'),
      I18N.t(prefix + '.misluktTekst', { project: project.naam }),
      I18N.t(prefix + '.tochAf'), 'gevaar')
    return toch ? 'door' : 'blijven'
  }
  return 'door'
}

// Bij de vorige Windows-shutdown is er werk opzijgezet. Dat hoor je te weten,
// anders zoek je je een ongeluk naar wijzigingen die "opeens weg" zijn.
async function toonStashMeldingBijStart() {
  try {
    const m = await window.api.gitStashMelding()
    if (!m || !m.projecten || !m.projecten.length) return

    // Bij precies één project weten we welke knop je nodig hebt en zetten we
    // hem meteen open. Bij meer zou dat een willekeurige keuze zijn; dan is de
    // lijst genoeg, want bij elk van die projecten staat de terughaalknop nu
    // vanzelf in de rij.
    // Over álle locaties zoeken: de stash kan gemaakt zijn in een locatie die
    // op dit moment niet de actieve is. Vinden we hem, dan zetten we die
    // locatie meteen actief, zodat de terughaalknop op de goede map werkt.
    let enkel = null
    if (m.projecten.length === 1) {
      const doel = padNorm(m.projecten[0].pad)
      for (const kandidaat of projects) {
        const loc = projectLocaties(kandidaat).find(l => padNorm(l.pad) === doel)
        if (!loc) continue
        if (kandidaat.activeLocation !== loc.index) { kandidaat.activeLocation = loc.index; saveProjects() }
        enkel = kandidaat
        break
      }
    }

    const keuze = await vraagKeuze({
      titel: I18N.t('git.stashMelding.titel'),
      tekst: I18N.t('git.stashMelding.tekst'),
      regels: m.projecten.map(p => p.naam),
      knoppen: enkel
        ? [{ label: I18N.t('common.ok'), waarde: 'ok' },
           { label: I18N.t('git.stashMelding.terughalen'), waarde: 'open', soort: 'primair' }]
        : [{ label: I18N.t('common.ok'), waarde: 'ok', soort: 'primair' }],
    })
    if (keuze !== 'open' || !enkel) return

    selectProject(enkel.id)
    await stashOverzicht(enkel)
  } catch {}
}

// ── Wie ben je in deze map? ──────────────────────────────────────────────────
// Twee problemen die op hetzelfde moment zichtbaar horen te worden: vóór de
// commit, niet erna.
//
//   1. Er staat helemaal geen naam. `git commit` weigert dan met "Author
//      identity unknown". Op een verse pc is dat de normale toestand, en nu
//      merk je het pas nadat je een bericht hebt getypt.
//   2. Er staat een naam die hier niet hoort. Een commit op de verkeerde naam
//      merk je pas dagen later, en rechtzetten betekent geschiedenis
//      herschrijven. Dit is de fout die het duurst is om laat te ontdekken.

// Het profiel op één map zetten: naam, adres, welk GitHub-account en of de
// inloggegevens onthouden mogen worden. Gaat als zichtbaar commando naar de
// terminal, want dit schrijft in je .git/config en dat hoor je te zien.
//
// Onder water is dit `git config user.name` en `user.email` per repo — dus het
// geldt ook als je daarna buiten de app om commit.
async function pasProfielToe(project, profiel, opties = {}) {
  const pad = actieveLocPad(project)
  if (!pad || !GitTools.profielGeldig(profiel)) return false

  let huidig = {}
  try { huidig = await window.api.gitAccountInfo(pad) } catch {}

  const cmd = GitTools.profielCommando(profiel, huidig)
  if (!cmd) {
    // Alles stond al goed. Niets doen is hier het juiste antwoord, maar wel
    // zeggen — anders lijkt de knop kapot.
    if (!opties.stil) showToast(I18N.t('git.profiel.alGoedToast', { naam: GitTools.profielLabel(profiel) }))
    return true
  }

  if (!opties.stil) {
    const ja = await vraagJaNee(
      I18N.t('git.profiel.toepassenTitel'),
      I18N.t('git.profiel.toepassenTekst', {
        naam: profiel.naam, email: profiel.email, map: pad,
      }),
      I18N.t('git.profiel.toepassenOk'), 'primair', cmd.split(' && '))
    if (!ja) return false
  }

  await executeCmd(project, cmd, 'git-profiel')
  await ververesGitStaat(project, true)

  // Loopt het inloggen via gh, dan bepaalt gh welk account er gebruikt wordt en
  // doet credential.username niets. Dat kunnen we niet stilzwijgend laten
  // gebeuren, want dan lijkt het gewisseld terwijl je nog de oude bent.
  if (huidig.ghCli && GitTools.geldigeGhGebruiker(profiel.ghGebruiker)) {
    const ghCmd = GitTools.ghSwitchCommando(profiel.ghGebruiker)
    const ja = await vraagJaNee(
      I18N.t('git.profiel.ghTitel'),
      I18N.t('git.profiel.ghTekst', { naam: profiel.ghGebruiker }),
      I18N.t('git.profiel.ghOk'), 'primair', [ghCmd])
    if (ja) await executeCmd(project, ghCmd, 'git-profiel', { eigenTerminal: true })
  }
  return true
}

// Naam en adres vragen als er nog niets staat. Geeft het ingestelde profiel
// terug, of null bij annuleren.
async function vraagIdentiteit(project) {
  const naam = await vraagTekst({
    titel: I18N.t('git.ident.vraagNaamTitel'),
    tekst: I18N.t('git.ident.vraagNaamTekst'),
    placeholder: I18N.t('settings.git.profielNamePlaceholder'),
    okLabel: I18N.t('common.next'),
  })
  if (!naam) return null

  const email = await vraagTekst({
    titel: I18N.t('git.ident.vraagEmailTitel'),
    tekst: I18N.t('git.ident.vraagEmailTekst'),
    placeholder: I18N.t('settings.git.profielEmailPlaceholder'),
    okLabel: I18N.t('git.ident.instellenOk'),
  })
  if (!email) return null

  const profiel = GitTools.maakProfiel({ id: 'gp_' + Date.now().toString(36), naam, email })
  if (!GitTools.profielGeldig(profiel)) {
    await meldKort(I18N.t('git.ident.emailFoutTitel'), I18N.t('git.ident.emailFoutTekst'))
    return null
  }

  // Stil, want je hebt de naam net zelf ingetypt: daar nog een keer "weet je
  // het zeker" overheen is één vraag te veel.
  if (!await pasProfielToe(project, profiel, { stil: true })) return null

  // Bewaren is een aparte vraag. Eén keer instellen is genoeg om te kunnen
  // committen; een profiel maak je pas als je er meer dan één hebt, of als je
  // wilt dat de app hierop gaat letten.
  if (await vraagJaNee(
    I18N.t('git.ident.bewaarTitel'),
    I18N.t('git.ident.bewaarTekst', { naam: profiel.naam, email: profiel.email }),
    I18N.t('git.ident.bewaarOk'))) {
    zetGitProfielen([...gitProfielen(), profiel], gitStandaardProfielId() || profiel.id)
    if (project) { project.gitProfiel = profiel.id; saveProjects() }
    if (view === 'settings') renderSettingsPanel()
  }
  return profiel
}

// De poort vóór de commit. `true` = doorgaan, `false` = afbreken.
async function controleerIdentiteit(project, staat) {
  const verwacht = profielVanProject(project)
  const status = GitTools.identiteitStatus(gitProfielen(), staat, verwacht)
  if (!status || status.soort === 'klopt' || status.soort === 'geen-profielen') return true

  const bruikbaar = gitProfielen().filter(GitTools.profielGeldig)

  if (status.soort === 'ontbreekt') {
    // Zonder naam gáát het niet. Hier dus geen "toch doorgaan": dat zou een
    // knop zijn die gegarandeerd een foutmelding oplevert.
    const knoppen = [{ label: I18N.t('common.cancel'), waarde: '' }]
    for (let i = bruikbaar.length - 1; i >= 0; i--) {
      knoppen.push({ label: GitTools.profielLabel(bruikbaar[i]), waarde: 'p:' + bruikbaar[i].id })
    }
    knoppen.push({ label: I18N.t('git.ident.instellenOk'), waarde: 'nieuw', soort: 'primair' })

    const keuze = await vraagKeuze({
      titel: I18N.t('git.ident.ontbreektTitel'),
      tekst: I18N.t(bruikbaar.length ? 'git.ident.ontbreektTekstProfielen' : 'git.ident.ontbreektTekst'),
      knoppen,
    })
    if (!keuze) return false
    if (keuze === 'nieuw') return !!await vraagIdentiteit(project)

    const gekozen = GitTools.zoekProfiel(gitProfielen(), keuze.slice(2))
    if (!gekozen) return false
    return await pasProfielToe(project, gekozen)
  }

  // Wel een naam, maar niet de goede. Hier mag je wél doorheen: misschien
  // commit je bewust een keer onder een andere naam. Wat de app moet doen is
  // zorgen dat het een keuze is en geen ongeluk.
  const sleutel = status.soort === 'ander-profiel' ? 'git.ident.anderTekst' : 'git.ident.onbekendTekst'
  const knoppen = [
    { label: I18N.t('common.cancel'), waarde: '' },
    { label: I18N.t('git.ident.tochCommitten'), waarde: 'door' },
  ]
  if (verwacht) knoppen.push({ label: I18N.t('git.ident.rechtzettenOk', { naam: GitTools.profielLabel(verwacht) }), waarde: 'zet', soort: 'primair' })

  const keuze = await vraagKeuze({
    titel: I18N.t('git.ident.verkeerdTitel'),
    tekst: I18N.t(sleutel, {
      naam: status.huidig.naam, email: status.huidig.email,
      profiel: GitTools.profielLabel(status.gevonden), verwacht: GitTools.profielLabel(verwacht),
    }),
    knoppen,
  })
  if (!keuze) return false
  if (keuze === 'door') return true
  return await pasProfielToe(project, verwacht)
}

// ── Git-knoppen ──────────────────────────────────────────────────────────────

async function runGitCmd(project, cmdKey) {
  if (cmdKey === 'git-koppelen') { await koppelGithub(project); return }
  // Terughalen schrijft ook, maar het is geen commando met één vaste vraag
  // ervoor: eerst moet je zien wat er ligt. Dus een eigen weg, net als koppelen.
  if (cmdKey === 'git-stash-lijst') { await stashOverzicht(project); return }
  if (cmdKey === 'git-branch') { await branchOverzicht(project); return }
  if (cmdKey === 'git-diff') { await toonDiff(project); return }
  if (cmdKey === 'git-terug') { await terugdraaien(project); return }
  if (GitTools.isSchrijfKnop(cmdKey)) { await schrijfGitCmd(project, cmdKey); return }

  const cmd = GitTools.GIT_CMD_MAP[cmdKey]
  if (!cmd) return
  if (['git-pull', 'git-fetch'].includes(cmdKey)) {
    if (!await zorgVoorJuisteGithubPush(project)) return
  }
  const result = await executeCmd(project, cmd, cmdKey, { eigenTerminal: eigenTerminalNodig(project, cmdKey) })
  // Een pull of fetch kan de toestand veranderen (eerste upstream, andere
  // branch), dus daarna opnieuw kijken.
  await ververesGitStaat(project, true)
  // Ging het naar de remote, dan is dit ook het moment waarop we merken dat
  // het adres niet meer werkt. Opnieuw controleren, zodat de koppelknop
  // terugkomt in plaats van dat je de fout nog eens uitlokt.
  if (['git-pull', 'git-fetch', 'git-push'].includes(cmdKey)) {
    const opnieuw = await naMislukteRemote(project, cmdKey, result)
    if (opnieuw === 'opnieuw' && cmdKey !== 'git-push') {
      await executeCmd(project, cmd, cmdKey, { eigenTerminal: eigenTerminalNodig(project, cmdKey) })
      await ververesGitStaat(project, true)
      await controleerKoppeling(actieveLocPad(project), true)
    }
  }
}

// Vraagt git bij dit commando zelf om inloggegevens? Dan heeft het een echt
// toetsenbord nodig. In de gewone uitvoer is er geen terminal om op te typen,
// en dan blijft een push staan wachten op iets wat niemand kan invoeren.
//
// De app ziet dat token nooit: git vraagt het, jij typt het in zijn eigen
// prompt. Wij zetten alleen de terminal klaar waarin dat kan.
function eigenTerminalNodig(project, cmdKey) {
  return GitTools.vraagtOmInloggen(profielVanProject(project), cmdKey)
}

// Commit, push en stash veranderen iets. Ze vragen daarom eerst, en ze laten
// in die vraag zien waar het over gaat: hoeveel bestanden, welke branch,
// hoeveel commits vooruit. Zonder die cijfers klik je blind op ok.
async function schrijfGitCmd(project, cmdKey) {
  // De cijfers moeten kloppen op het moment van vragen, niet van tekenen.
  const staat = await ververesGitStaat(project, true)
  if (!staat || !staat.isRepo) return

  const reden = GitTools.blokkade(cmdKey, staat)
  if (reden) { await meldKort(I18N.t('git.block.' + reden + 'Title'), I18N.t('git.block.' + reden + 'Text')); return }

  let cmd = null

  if (cmdKey === 'git-commit') {
    // Eerst: onder wiens naam gaat dit? Zonder identiteit weigert git, en met
    // de verkeerde identiteit staat het er morgen nog. Beide vragen horen vóór
    // het bericht — daarna is het te laat om er nog iets aan te doen.
    if (!await controleerIdentiteit(project, staat)) return
    // De plaatshouder is meteen het bericht dat je krijgt als je niets typt.
    // Zo zie je vóór het klikken wat er komt te staan.
    // Gaan er nieuwe bestanden mee, dan eerst vragen of je die wilt zien. Dat
    // is de categorie waar een .env of een sleutel in zit, en `add -A` pakt ze
    // gewoon mee.
    // Staat er bouwrommel klaar (app/build/, node_modules/, .gradle/)? Dan is
    // dít het moment, niet nadat `git add -A` erop is stukgelopen. Eén map met
    // gegenereerde bestanden kan duizenden paden opleveren waarvan er één te
    // lang is voor Windows — en dan valt de hele commit om.
    const rommel = GitTools.bouwrommel(staat.nieuweBestanden)
    if (rommel.length) {
      const wat = await vraagKeuze({
        titel: I18N.t('gitignore.rommelTitel'),
        tekst: I18N.t('gitignore.rommelTekst', { aantal: rommel.length }),
        regels: rommel,
        knoppen: [
          { label: I18N.t('common.cancel'), waarde: '' },
          { label: I18N.t('gitignore.tochMeenemen'), waarde: 'door' },
          { label: I18N.t('gitignore.negeren'), waarde: 'negeer', soort: 'primair' },
        ],
      })
      if (!wat) return
      if (wat === 'negeer') {
        await regelGitignore(project, { stil: true })
        // De lijst is nu anders; opnieuw beginnen met verse cijfers.
        await schrijfGitCmd(project, cmdKey)
        return
      }
    }

    if (staat.nieuw > 0) {
      const kijk = await vraagKeuze({
        titel: I18N.t('git.commit.nieuwTitel'),
        tekst: I18N.t('git.commit.nieuwTekst', { aantal: staat.nieuw, totaal: staat.vuil }),
        regels: staat.nieuweBestanden.slice(0, 12),
        knoppen: [
          { label: I18N.t('common.cancel'), waarde: '' },
          { label: I18N.t('git.commit.bekijken'), waarde: 'diff' },
          { label: I18N.t('git.commit.doorgaan'), waarde: 'door', soort: 'primair' },
        ],
      })
      if (!kijk) return
      if (kijk === 'diff') { await toonDiff(project); return }
    }

    const automatisch = GitTools.automatischCommitBericht(staat)
    const bericht = await vraagTekst({
      titel: I18N.t('git.commit.title'),
      tekst: I18N.t('git.commit.text', { aantal: staat.vuil }),
      placeholder: automatisch,
      okLabel: I18N.t('git.commit.ok'),
    })
    // null = geannuleerd; leeg = doorgaan met het automatische bericht.
    if (bericht === null) return
    cmd = GitTools.commitCommando(bericht || automatisch)
    if (!cmd) return

  } else if (cmdKey === 'git-push') {
    // Zonder upstream is het een push -u; dat is een ander commando en de
    // vraag zegt dat er ook bij, want daarna volgt je branch de remote.
    const sleutel = staat.upstream ? 'git.push.text' : 'git.push.textEerste'
    const ja = await vraagJaNee(
      I18N.t('git.push.title'),
      I18N.t(sleutel, { branch: staat.branch || '?', remote: staat.remote || 'origin', aantal: staat.ahead }),
      I18N.t('git.push.ok'), 'primair')
    if (!ja) return
    if (!await zorgVoorJuisteGithubPush(project)) return
    cmd = GitTools.pushCommando(staat)
    if (!cmd) return

  } else if (cmdKey === 'git-stash') {
    const ja = await vraagJaNee(
      I18N.t('git.stash.title'),
      I18N.t('git.stash.text', { aantal: staat.vuil }),
      I18N.t('git.stash.ok'), 'gevaar', staat.bestanden)
    if (!ja) return
    cmd = GitTools.stashCommando()
  }

  if (!cmd) return
  const result = await executeCmd(project, cmd, cmdKey, { eigenTerminal: eigenTerminalNodig(project, cmdKey) })
  await ververesGitStaat(project, true)
  // Een push is de eerste keer dat we écht met de remote praten. Lukt dat niet,
  // dan hoort de koppelknop terug te komen in plaats van dat je het morgen
  // nog eens probeert.
  if (cmdKey === 'git-push') {
    const opnieuw = await naMislukteRemote(project, cmdKey, result)
    if (opnieuw === 'opnieuw') {
      const staatNu = gitStaten[actieveLocPad(project)]
      const retry = staatNu ? GitTools.pushCommando(staatNu) : cmd
      if (retry) {
        await executeCmd(project, retry, cmdKey, { eigenTerminal: eigenTerminalNodig(project, cmdKey) })
        await ververesGitStaat(project, true)
        await controleerKoppeling(actieveLocPad(project), true)
      }
    }
  }
}

// ── De stash terughalen ──────────────────────────────────────────────────────
// De app kon werk wegzetten zonder het terug te kunnen geven. Dat is de reden
// dat dit er is: niet omdat stash zo'n gemis was, maar omdat de weg terug
// alleen door de terminal liep.
//
// Hoe een stash zich laat lezen. `git stash list` geeft "WIP on main: 1f4a2c3
// vorige commit" — dat is de commit waar je op stond, niet je wijzigingen.
// Alleen dát tonen is misleidend, dus we halen het uit elkaar en zetten de
// bestanden erbij die er echt in zitten.
function stashLabel(s) {
  if (!s) return ''
  const wat = s.eigen && s.bericht
    ? s.bericht
    : I18N.t('git.stashLijst.wijzigingenOp', { branch: s.branch || '?' })
  return s.datum ? `${wat} — ${s.datum}` : wat
}

// Zien wat er verandert vóór je het vastlegt. `git diff HEAD` toont alles wat
// deze commit zou bevatten — behálve nieuwe bestanden, want die kent git nog
// niet. Juist daar zit het risico (een .env, een sleutel), dus die noemen we
// er apart bij in plaats van te doen alsof de diff het hele verhaal is.
async function toonDiff(project) {
  const staat = await ververesGitStaat(project, true)
  if (!staat || !staat.isRepo) return

  if (!staat.vuil) { await meldKort(I18N.t('git.diff.leegTitel'), I18N.t('git.diff.leegTekst')); return }

  await executeCmd(project, GitTools.diffCommando(), 'git-diff')

  if (staat.nieuw > 0) {
    springNaarOutput()
    appendLine('out', '')
    appendLine('out', I18N.t('git.diff.nieuweKop', { aantal: staat.nieuw }))
    for (const b of staat.nieuweBestanden.slice(0, 20)) appendLine('out', '  ?  ' + b)
    if (staat.nieuw > 20) appendLine('out', '  …')
  }
}

// ── Terugdraaien ─────────────────────────────────────────────────────────────
// Drie dingen, elk met een eigen bevestiging. Reset en amend herschrijven je
// geschiedenis; staat die commit al op GitHub, dan gaat je repo afwijken en
// wordt de volgende push geweigerd. Dat zeggen we vóóraf, niet achteraf.
async function terugdraaien(project) {
  const staat = await ververesGitStaat(project, true)
  if (!staat || !staat.isRepo) return
  if (!staat.commits) { await meldKort(I18N.t('git.terug.titel'), I18N.t('git.block.geen-commitsText')); return }

  const gepusht = GitTools.alGepusht(staat)
  const keuze = await vraagKeuze({
    titel: I18N.t('git.terug.titel'),
    tekst: I18N.t(gepusht ? 'git.terug.tekstGepusht' : 'git.terug.tekst'),
    knoppen: [
      { label: I18N.t('common.cancel'), waarde: '' },
      { label: I18N.t('git.terug.weggooien'), waarde: 'weg', soort: 'gevaar' },
      { label: I18N.t('git.terug.bericht'), waarde: 'amend' },
      { label: I18N.t('git.terug.commit'), waarde: 'reset', soort: 'gevaar' },
    ],
  })
  if (!keuze) return

  if (keuze === 'reset') {
    const ja = await vraagJaNee(I18N.t('git.terug.commitTitel'),
      I18N.t(gepusht ? 'git.terug.commitTekstGepusht' : 'git.terug.commitTekst'),
      I18N.t('git.terug.commit'), 'gevaar')
    if (!ja) return
    await executeCmd(project, GitTools.resetZachtCommando(), 'git-terug')
    await ververesGitStaat(project, true)
    return
  }

  if (keuze === 'amend') {
    const bericht = await vraagTekst({
      titel: I18N.t('git.terug.berichtTitel'),
      tekst: I18N.t(gepusht ? 'git.terug.berichtTekstGepusht' : 'git.terug.berichtTekst'),
      placeholder: I18N.t('git.commit.placeholder'),
      okLabel: I18N.t('git.terug.bericht'),
    })
    if (!bericht) return          // leeg bericht is hier geen commit waard
    const cmd = GitTools.amendCommando(bericht)
    if (!cmd) return
    await executeCmd(project, cmd, 'git-terug')
    await ververesGitStaat(project, true)
    return
  }

  // Wijzigingen in één bestand weggooien. Dit is het enige dat niet terug te
  // halen is: geen commit, geen stash, niets. Dus eerst kiezen wélk bestand,
  // en dan nog een keer vragen met de naam erin.
  const blok = GitTools.terugdraaiBlokkade('weggooien', staat)
  if (blok) { await meldKort(I18N.t('git.terug.titel'), I18N.t('git.block.schoonText')); return }

  const bestanden = (staat.bestanden || []).slice(0, 8)
  const knoppen = [{ label: I18N.t('common.cancel'), waarde: '' }]
  for (let i = bestanden.length - 1; i >= 0; i--) {
    knoppen.push({ label: bestanden[i], waarde: bestanden[i], soort: i === 0 ? 'gevaar' : '' })
  }
  const pad = await vraagKeuze({
    titel: I18N.t('git.terug.weggooiTitel'),
    tekst: I18N.t('git.terug.weggooiKies', { aantal: staat.vuil }),
    knoppen,
  })
  if (!pad) return

  // Een nieuw bestand kan git niet terugzetten: er is geen eerdere versie.
  if ((staat.nieuweBestanden || []).includes(pad)) {
    await meldKort(I18N.t('git.terug.nieuwTitel'), I18N.t('git.terug.nieuwTekst', { naam: pad }))
    return
  }

  const zeker = await vraagJaNee(I18N.t('git.terug.weggooiTitel'),
    I18N.t('git.terug.weggooiBevestig', { naam: pad }), I18N.t('git.terug.weggooien'), 'gevaar')
  if (!zeker) return

  await executeCmd(project, GitTools.weggooiBestandCommando(pad), 'git-terug')
  await ververesGitStaat(project, true)
}

// ── Branches ─────────────────────────────────────────────────────────────────
// Eén ingang voor wisselen, maken, samenvoegen en verwijderen. Conflicten
// lossen we niet zelf op: die melden we en dan gaat de map open in een echte
// terminal. Een merge-tool bouwen hoort niet in een launcher thuis.

function branchLabel(b, huidig) {
  const omschrijving = GitTools.branchOmschrijving(b)
  return b.naam === huidig ? '● ' + omschrijving : omschrijving
}

// Kiezen uit een lijst branches, in dezelfde vorm als de stash-lijst: de
// items zijn de knoppen. Geeft de gekozen branch terug, of null.
async function kiesBranch(lijst, titel, tekst, soort = '') {
  if (!lijst.length) { await meldKort(titel, I18N.t('git.branch.geenKeuze')); return null }
  if (lijst.length === 1) return lijst[0]

  const tonen = lijst.slice(0, 8)
  const knoppen = [{ label: I18N.t('common.cancel'), waarde: '' }]
  // column-reverse: achterste eerst, zodat de eerste uit de lijst bovenaan komt.
  for (let i = tonen.length - 1; i >= 0; i--) {
    knoppen.push({ label: GitTools.branchOmschrijving(tonen[i]), waarde: tonen[i].naam, soort: i === 0 ? soort : '' })
  }
  const naam = await vraagKeuze({
    titel,
    tekst: lijst.length > tonen.length
      ? I18N.t('git.branch.kiesMeer', { aantal: lijst.length, getoond: tonen.length })
      : tekst,
    knoppen,
  })
  return naam ? lijst.find(b => b.naam === naam) || null : null
}

async function branchOverzicht(project) {
  const pad = actieveLocPad(project)
  if (!pad) return

  const staat = await ververesGitStaat(project, true)
  if (!staat || !staat.isRepo) return

  let lijst = []
  try { lijst = await window.api.gitBranches(pad) } catch {}
  if (!lijst.length) { await meldKort(I18N.t('git.branch.titel'), I18N.t('git.branch.geenBranches')); return }

  const huidig = staat.branch || (GitTools.huidigeBranch(lijst) || {}).naam || ''
  const lokaal = GitTools.lokaleBranches(lijst)
  const opRemote = GitTools.nieuweRemoteBranches(lijst)
  const anderen = lokaal.filter(b => b.naam !== huidig)

  const regels = [
    ...anderen.map(b => branchLabel(b, huidig)),
    ...opRemote.map(b => branchLabel(b, huidig)),
  ].slice(0, 12)

  const keuze = await vraagKeuze({
    titel: I18N.t('git.branch.titel'),
    tekst: I18N.t('git.branch.tekst', {
      branch: huidig || '?', lokaal: lokaal.length, remote: opRemote.length,
    }),
    regels,
    knoppen: [
      { label: I18N.t('common.cancel'), waarde: '' },
      { label: I18N.t('git.branch.verwijderen'), waarde: 'weg', soort: 'gevaar' },
      { label: I18N.t('git.branch.samenvoegen'), waarde: 'merge' },
      { label: I18N.t('git.branch.wisselen'), waarde: 'wissel' },
      { label: I18N.t('git.branch.nieuw'), waarde: 'nieuw', soort: 'primair' },
    ],
  })
  if (!keuze) return

  if (keuze === 'nieuw')  return branchNieuw(project, staat)
  if (keuze === 'wissel') return branchWisselen(project, staat, [...anderen, ...opRemote])
  if (keuze === 'merge')  return branchSamenvoegen(project, [...anderen, ...opRemote], huidig)
  if (keuze === 'weg')    return branchVerwijderen(project, [...anderen, ...opRemote], huidig)
}

async function branchNieuw(project, staat) {
  const ruw = await vraagTekst({
    titel: I18N.t('git.branch.nieuwTitel'),
    tekst: I18N.t('git.branch.nieuwTekst', { branch: staat.branch || '?' }),
    placeholder: 'feature/mijn-wijziging',
    okLabel: I18N.t('git.branch.nieuw'),
  })
  if (!ruw) return

  const naam = GitTools.veiligeBranchNaam(ruw)
  if (!naam) { await meldKort(I18N.t('git.branch.naamFoutTitel'), I18N.t('git.branch.naamFoutTekst')); return }

  // Opgeschoond? Dat moet je zien voordat het gebeurt, niet erna in de log.
  if (naam !== ruw.trim()) {
    const ja = await vraagJaNee(I18N.t('git.branch.naamAangepastTitel'),
      I18N.t('git.branch.naamAangepastTekst', { ingevoerd: ruw.trim(), naam }),
      I18N.t('git.branch.nieuw'), 'primair')
    if (!ja) return
  }

  await executeCmd(project, GitTools.nieuweBranchCommando(naam), 'git-branch')
  await ververesGitStaat(project, true)
}

async function branchWisselen(project, staat, kandidaten) {
  const doel = await kiesBranch(kandidaten, I18N.t('git.branch.wisselTitel'),
    I18N.t('git.branch.wisselTekst'), 'primair')
  if (!doel) return

  // Een ☁-branch bestaat alleen op de remote. "Wisselen" maakt er dan lokaal
  // een nieuwe aan op de commit waar de remote staat — en dat kan een oudere
  // zijn dan waar je vandaan komt. Dat is iets anders dan ergens naartoe gaan,
  // dus dat hoort in het venster te staan en niet stilletjes te gebeuren.
  if (doel.remote) {
    const lokaleNaam = doel.naam.replace(/^[^/]+\//, '')
    const ja = await vraagJaNee(I18N.t('git.branch.remoteHalenTitel'),
      I18N.t('git.branch.remoteHalenTekst', { remote: doel.naam, naam: lokaleNaam }),
      I18N.t('git.branch.remoteHalenOk'), 'primair')
    if (!ja) return
  }

  const blok = GitTools.wisselBlokkade(staat, doel.naam)
  if (blok === 'zelfde') { await meldKort(I18N.t('git.branch.zelfdeTitel'), I18N.t('git.branch.zelfdeTekst')); return }

  if (blok === 'vuil') {
    // Git weigert alleen als de andere tak dezelfde bestanden aanraakt, en dat
    // weet git zelf pas tijdens het wisselen. Dus waarschuwen bij alles wat
    // vuil is, en de gebruiker laten beslissen.
    const ja = await vraagJaNee(I18N.t('git.branch.vuilTitel'),
      I18N.t('git.branch.vuilTekst', { aantal: staat.vuil, branch: doel.naam }),
      I18N.t('git.branch.tochWisselen'), 'gevaar', staat.bestanden.slice(0, 10))
    if (!ja) return
  }

  await executeCmd(project, GitTools.checkoutCommando(doel), 'git-branch')
  await ververesGitStaat(project, true)
}

async function branchSamenvoegen(project, kandidaten, huidig) {
  const bron = await kiesBranch(kandidaten, I18N.t('git.branch.mergeTitel'),
    I18N.t('git.branch.mergeKies', { branch: huidig }), 'primair')
  if (!bron) return

  const ja = await vraagJaNee(I18N.t('git.branch.mergeTitel'),
    I18N.t('git.branch.mergeBevestig', { bron: bron.naam, doel: huidig }),
    I18N.t('git.branch.samenvoegen'), 'primair')
  if (!ja) return

  await executeCmd(project, GitTools.mergeCommando(bron.naam), 'git-branch')

  // Conflicten halen we uit de status en niet uit de uitvoer van het commando:
  // die tekst verandert per taal en per git-versie, de status niet.
  const na = await ververesGitStaat(project, true)
  if (na && na.conflicten > 0) {
    const keuze = await vraagKeuze({
      titel: I18N.t('git.branch.conflictTitel'),
      tekst: I18N.t('git.branch.conflictTekst', { aantal: na.conflicten }),
      regels: (na.bestanden || []).slice(0, 12),
      knoppen: [
        { label: I18N.t('common.ok'), waarde: 'ok' },
        { label: I18N.t('git.afsluit.terminal'), waarde: 'terminal', soort: 'primair' },
      ],
    })
    if (keuze === 'terminal') {
      try { await openCmdMetMelding({ cwd: actieveLocPad(project) }) } catch {}
    }
  }
}

async function branchVerwijderen(project, kandidaten, huidig) {
  const doel = await kiesBranch(kandidaten, I18N.t('git.branch.wegTitel'),
    I18N.t('git.branch.wegKies'), 'gevaar')
  if (!doel) return
  if (doel.naam === huidig) { await meldKort(I18N.t('git.branch.wegTitel'), I18N.t('git.branch.wegHuidig')); return }

  // De hoofdtak weggooien mag van git zodra hij ergens in samengevoegd is, maar
  // het is bijna nooit de bedoeling. Eén extra vraag, met erbij waaróm.
  if (GitTools.isHoofdtak(doel.naam)) {
    const zeker = await vraagJaNee(I18N.t('git.branch.hoofdtakTitel'),
      I18N.t('git.branch.hoofdtakTekst', { naam: doel.naam }),
      I18N.t('git.branch.wegForceren'), 'gevaar')
    if (!zeker) return
  }

  // Staat er werk op dat nergens anders is? Dan moet dat vóór de vraag staan,
  // niet erna in een foutmelding van git.
  if (GitTools.branchHeeftEigenWerk(doel)) {
    const zeker = await vraagJaNee(I18N.t('git.branch.eigenWerkTitel'),
      I18N.t(doel.ahead ? 'git.branch.eigenWerkVooruit' : 'git.branch.eigenWerkGeenRemote',
        { naam: doel.naam, aantal: doel.ahead }),
      I18N.t('git.branch.wegForceren'), 'gevaar')
    if (!zeker) return
  }

  const opRemote = !!doel.remote
  const ja = await vraagJaNee(I18N.t('git.branch.wegTitel'),
    I18N.t(opRemote ? 'git.branch.wegRemoteBevestig' : 'git.branch.wegBevestig', { naam: doel.naam }),
    I18N.t('git.branch.verwijderen'), 'gevaar')
  if (!ja) return

  const cmd = opRemote
    ? GitTools.verwijderRemoteBranchCommando(doel.naam.replace(/\/.*$/, ''), doel.naam)
    : GitTools.verwijderBranchCommando(doel.naam, false)
  if (!cmd) return
  await executeCmd(project, cmd, 'git-branch')

  if (opRemote) { await ververesGitStaat(project, true); return }

  // `git branch -d` weigert als de tak nog niet is samengevoegd. Staat hij er
  // daarna nog, dan is dat wat er gebeurd is — en dan pas bieden we -D aan,
  // met erbij wat dat betekent. Nooit stilletjes forceren.
  let na = []
  try { na = await window.api.gitBranches(actieveLocPad(project)) } catch {}
  if (!na.some(b => !b.remote && b.naam === doel.naam)) {
    await ruimRemoteBranchOp(project, doel.naam, na)
    await ververesGitStaat(project, true)
    return
  }

  const forceren = await vraagJaNee(I18N.t('git.branch.wegNietSamengevoegdTitel'),
    I18N.t('git.branch.wegNietSamengevoegdTekst', { naam: doel.naam }),
    I18N.t('git.branch.wegForceren'), 'gevaar')
  if (!forceren) return
  await executeCmd(project, GitTools.verwijderBranchCommando(doel.naam, true), 'git-branch')

  let daarna = []
  try { daarna = await window.api.gitBranches(actieveLocPad(project)) } catch {}
  await ruimRemoteBranchOp(project, doel.naam, daarna)
  await ververesGitStaat(project, true)
}

// Lokaal weg, maar op GitHub staat hij nog. Zonder deze stap blijft hij in de
// lijst staan als ☁-branch, en dan haal je hem er per ongeluk zo weer bij.
async function ruimRemoteBranchOp(project, naam, lijst) {
  const rest = (lijst || []).find(b => b.remote && b.naam.replace(/^[^/]+\//, '') === naam)
  if (!rest) return

  const ja = await vraagJaNee(I18N.t('git.branch.ookRemoteTitel'),
    I18N.t('git.branch.ookRemoteTekst', { naam: rest.naam }),
    I18N.t('git.branch.ookRemoteOk'), 'gevaar')
  if (!ja) return

  const cmd = GitTools.verwijderRemoteBranchCommando(rest.naam.replace(/\/.*$/, ''), rest.naam)
  if (cmd) await executeCmd(project, cmd, 'git-branch')
}

async function stashOverzicht(project) {
  const pad = actieveLocPad(project)
  if (!pad) return

  // De cijfers moeten kloppen op het moment van vragen. De knop kan van een
  // verversing geleden zijn en er kan intussen in de terminal van alles zijn
  // gebeurd.
  const staat = await ververesGitStaat(project, true)
  if (!staat || !staat.isRepo) return

  let lijst = []
  try { lijst = await window.api.gitStashLijst(pad) } catch {}

  if (!lijst.length) {
    // Kan gebeuren: je hebt hem in de terminal al leeggehaald, of de knop
    // stond nog van een verversing geleden. Dan meteen de toestand bijwerken,
    // zodat de knop ook verdwijnt.
    await meldKort(I18N.t('git.stashLijst.leegTitel'), I18N.t('git.stashLijst.leegTekst'))
    await ververesGitStaat(project, true)
    return
  }

  // Bij één stash valt er niets te kiezen. Bij meer wel — nieuwste bovenaan,
  // want dat is bijna altijd degene die je zoekt. De knoppenbak staat in
  // column-reverse, dus achterste eerst (zie .modal-footer.kolom).
  let gekozen = lijst[0]
  if (lijst.length > 1) {
    const tonen = lijst.slice(0, 8)
    const knoppen = [{ label: I18N.t('common.cancel'), waarde: '' }]
    for (let i = tonen.length - 1; i >= 0; i--) {
      knoppen.push({ label: stashLabel(tonen[i]), waarde: tonen[i].ref, soort: i === 0 ? 'primair' : '' })
    }
    const ref = await vraagKeuze({
      titel: I18N.t('git.stashLijst.kiesTitel'),
      tekst: lijst.length > tonen.length
        ? I18N.t('git.stashLijst.kiesTekstMeer', { aantal: lijst.length, getoond: tonen.length })
        : I18N.t('git.stashLijst.kiesTekst', { aantal: lijst.length }),
      knoppen,
    })
    if (!ref) return
    gekozen = lijst.find(s => s.ref === ref)
    if (!gekozen) return
  }

  // Wát er in zit, vóór de keuze om hem terug te halen of weg te gooien. Zonder
  // die lijst is "stash@{0}" een naam zonder inhoud en klik je op goed geluk.
  let bestanden = []
  try { bestanden = await window.api.gitStashInhoud(pad, gekozen.ref) } catch {}

  // Zitten er bestanden in die je nú ook aan het bewerken bent, dan weigert
  // `git stash pop` en gebeurt er niets. Dat is veilig, maar het ziet eruit
  // als een knop die niet werkt. Beter dat je het vooraf weet, met de namen
  // erbij, dan achteraf uit een foutmelding in de terminal.
  const botsend = GitTools.botsendeBestanden(bestanden, staat.bestanden)

  // Terughalen bovenaan, weggooien onderaan met de cancel ertussen: de rode
  // knop hoort niet direct onder de knop die je waarschijnlijk wilt.
  const keuze = await vraagKeuze({
    titel: I18N.t('git.stashLijst.actieTitel'),
    tekst: I18N.t(botsend.length ? 'git.stashLijst.actieTekstBotsing' : 'git.stashLijst.actieTekst', {
      omschrijving: stashLabel(gekozen), aantal: bestanden.length, botsend: botsend.length,
    }),
    regels: bestanden,
    knoppen: [
      { label: I18N.t('git.stashLijst.drop'), waarde: 'drop', soort: 'gevaar' },
      { label: I18N.t('common.cancel'), waarde: '' },
      { label: I18N.t('git.stashLijst.pop'), waarde: 'pop', soort: 'primair' },
    ],
  })
  if (!keuze) return

  if (keuze === 'drop') {
    const ja = await vraagJaNee(
      I18N.t('git.stashLijst.dropTitel'),
      I18N.t('git.stashLijst.dropTekst', { omschrijving: stashLabel(gekozen) }),
      I18N.t('git.stashLijst.dropOk'), 'gevaar', bestanden)
    if (!ja) return
    const cmd = GitTools.stashDropCommando(gekozen.ref)
    if (!cmd) return
    await executeCmd(project, cmd, 'git-stash-lijst')
    await ververesGitStaat(project, true)
    return
  }

  const cmd = GitTools.stashPopCommando(gekozen.ref)
  if (!cmd) return
  await executeCmd(project, cmd, 'git-stash-lijst')
  const na = await ververesGitStaat(project, true)
  if (!na) return

  // Twee manieren waarop een pop niet gewoon slaagt, en ze zien er in de
  // terminal ongeveer hetzelfde uit terwijl ze iets heel anders betekenen.
  // Beide laten de stash staan, dus daar kun je ze niet aan herkennen — wel
  // aan de conflictregels in de status.
  //
  //   conflicten > 0   git heeft samengevoegd en er zijn markeringen ingezet;
  //                    je moet ze uit elkaar halen
  //   anders           git heeft niets gedaan en meteen afgekapt, omdat je in
  //                    dezelfde bestanden aan het werk was
  if (na.conflicten > 0) {
    // Zelf een conflict oplossen doet deze app niet — dat is werk in
    // bestanden, en daar is een editor of Claude Code voor.
    await meldKort(
      I18N.t('git.stashLijst.conflictTitel'),
      I18N.t('git.stashLijst.conflictTekst', { aantal: na.conflicten, ref: gekozen.ref }))
    return
  }

  if (na.stashes >= (staat.stashes || 0)) {
    await meldKort(
      I18N.t('git.stashLijst.geweigerdTitel'),
      I18N.t('git.stashLijst.geweigerdTekst', { ref: gekozen.ref }),
      botsend.length ? botsend : bestanden)
  }
}

// Koppelen doen we in stappen en niet in één klik. Een map die nog helemaal
// niet onder git staat krijgt eerst alleen `git init`: wat er in je eerste
// commit belandt bepaal je zelf, want zonder .gitignore staat node_modules
// zo in je geschiedenis en krijg je hem er nooit meer netjes uit.
// Er staat een adres in .git/config, maar het antwoordt niet: de repo is er
// nooit gekomen, is hernoemd, of staat op een account waar je niet meer bij
// kunt. `gh repo create` zou hier stuklopen op "remote origin already exists",
// dus dit is een eigen weg — en de gebruiker kiest wat er gebeurt, want alleen
// die weet wat er met die repo is.
// ── .gitignore ───────────────────────────────────────────────────────────────
// De aanleiding: `git init` en dan committen in een Android-map. `git add -A`
// pakt app/build/ mee — duizenden gegenereerde bestanden — en valt om op een
// pad dat Windows niet aankan. Je houdt een repo zonder enkele commit over en
// een foutmelding die niets zegt over de oorzaak.
//
// Dus wordt dit aangeboden vóór de eerste commit, met de inhoud erbij: je ziet
// wat er genegeerd gaat worden voordat je ja zegt.
async function regelGitignore(project, { stil = false } = {}) {
  const pad = actieveLocPad(project)
  if (!pad) return false

  let v = null
  try { v = await window.api.gitIgnoreVoorstel(pad) } catch {}
  if (!v || !v.ok) return false

  const regels = String(v.inhoud || '').split('\n').filter(r => r.trim())
  const keuze = await vraagKeuze({
    titel: I18N.t(v.bestaat ? 'gitignore.aanvullenTitel' : 'gitignore.titel'),
    tekst: I18N.t(v.bestaat ? 'gitignore.aanvullenTekst' : 'gitignore.tekst',
      { soorten: v.soorten.length ? v.soorten.join(', ') : I18N.t('gitignore.geenSoort') }),
    regels,
    knoppen: [
      { label: I18N.t('common.cancel'), waarde: '' },
      { label: I18N.t(v.bestaat ? 'gitignore.aanvullen' : 'gitignore.schrijven'), waarde: 'ja', soort: 'primair' },
    ],
  })
  if (!keuze) return false

  const r = await window.api.gitIgnoreSchrijf({ dir: pad, inhoud: v.inhoud, erbij: v.bestaat })
  if (!r || !r.ok) {
    await meldKort(I18N.t('gitignore.titel'), I18N.t('gitignore.mislukt', { reden: (r && r.reden) || '' }))
    return false
  }
  // Al vastgelegde bouwmappen blijven in de index staan ondanks .gitignore.
  // Daar zeggen we hier niets over: bij een verse repo speelt het niet, en bij
  // een bestaande is `git rm -r --cached` een ingreep die je zelf moet willen.
  if (!stil) showToast(I18N.t('gitignore.klaar'))
  await ververesGitStaat(project, true)
  return true
}

async function zetLangePaden(project) {
  const ja = await vraagJaNee(I18N.t('gitset.prob.lange-paden'), I18N.t('gitset.langePadenTekst'),
    I18N.t('common.ok'), 'primair')
  if (!ja) return false
  await executeCmd(project, GitTools.langePadenCommando(), 'git-koppelen')
  await ververesGitStaat(project, true)
  return true
}

async function herstelKoppeling(project, pad, staat, opties = {}) {
  const probleem = GitTools.koppelingProbleem(staat)
  if (!probleem) return

  // 403 / verkeerd account is geen dood adres. Eerst inloggen of wisselen;
  // een nieuwe repo aanmaken is hier bijna altijd de verkeerde knop.
  if (!opties.slaInlogOver && probleem.reden === 'inloggen') {
    const wat = await herstelVerkeerdeGithub(project, GitTools.pushInlogProbleem({
      remoteUrl: probleem.url,
      verwacht: (gitStandaardProfiel() || {}).ghGebruiker,
    }) || { doel: (gitStandaardProfiel() || {}).ghGebruiker || '', eigenaar: GitTools.githubEigenaarUitUrl(probleem.url) })
    if (wat === true) {
      await controleerKoppeling(pad, true)
      return
    }
    if (wat !== 'meer') return
  }

  const keuze = await vraagKeuze({
    titel: I18N.t('git.repair.title'),
    tekst: I18N.t(probleem.sleutel, { remote: probleem.remote }),
    regels: [probleem.url || probleem.remote],
    knoppen: [
      { label: I18N.t('common.cancel'), waarde: '' },
      { label: I18N.t('git.repair.new'), waarde: 'nieuw', soort: 'primair' },
      { label: I18N.t('git.repair.url'), waarde: 'url' },
      { label: I18N.t('git.repair.drop'), waarde: 'los', soort: 'gevaar' },
    ],
  })
  if (!keuze) return

  // Alleen het adres eraf. De commits en de geschiedenis blijven staan, en
  // daarna staat de gewone koppelknop er weer.
  if (keuze === 'los') {
    const ja = await vraagJaNee(I18N.t('git.repair.dropTitle'),
      I18N.t('git.repair.dropText', { remote: probleem.remote }), I18N.t('git.repair.drop'), 'gevaar')
    if (!ja) return
    await executeCmd(project, GitTools.ontkoppelCommando(staat), 'git-koppelen')
    await controleerKoppeling(pad, true)
    return
  }

  // Het adres verbeteren: de repo bestaat wel, hij heet alleen anders.
  if (keuze === 'url') {
    const ruw = await vraagTekst({
      titel: I18N.t('git.link.urlTitle'),
      tekst: I18N.t('git.link.urlText'),
      waarde: probleem.url || '',
      placeholder: 'https://github.com/gebruiker/repo.git',
      okLabel: I18N.t('git.link.linkOk'),
    })
    if (!ruw) return
    const cmd = GitTools.herstelCommando(staat, { url: ruw })
    if (!cmd) { await meldKort(I18N.t('git.link.urlBadTitle'), I18N.t('git.link.urlBadText')); return }
    await executeCmd(project, cmd, 'git-koppelen')
    await controleerKoppeling(pad, true)
    return
  }

  // Opnieuw aanmaken. Hiervoor is gh wel nodig — installeren en inloggen doet
  // zorgVoorGithub, met dezelfde vragen als bij een eerste koppeling.
  const ghKlaar = await zorgVoorGithub()
  if (ghKlaar !== true) {
    if (ghKlaar === 'gestopt') return
    // Zonder gh kan de app geen repo aanmaken. Dan blijft het handwerk over:
    // zelf aanmaken op github.com en het adres hier invullen.
    const open = await vraagJaNee(I18N.t('git.link.ghMissingTitle'),
      I18N.t('git.link.ghMissingText'), I18N.t('git.link.openGithub'))
    if (open) await window.api.openUrl('https://github.com/new')
    return
  }

  const naam = await vraagTekst({
    titel: I18N.t('git.link.nameTitle'),
    tekst: I18N.t('git.link.nameText'),
    waarde: GitTools.veiligeRepoNaam(project.name),
    okLabel: I18N.t('common.next'),
  })
  if (!naam) return

  const zicht = await vraagKeuze({
    titel: I18N.t('git.link.visTitle'),
    tekst: I18N.t('git.link.visText', { naam: GitTools.veiligeRepoNaam(naam) }),
    knoppen: [
      { label: I18N.t('common.cancel'), waarde: '' },
      { label: I18N.t('git.link.public'), waarde: 'publiek' },
      { label: I18N.t('git.link.private'), waarde: 'prive', soort: 'primair' },
    ],
  })
  if (!zicht) return

  // Het dode adres gaat er in hetzelfde commando af, zodat je nooit met twee
  // remotes achterblijft waarvan er één niet werkt.
  await executeCmd(project, GitTools.herstelCommando(staat, { naam, prive: zicht === 'prive' }), 'git-koppelen')
  await controleerKoppeling(pad, true)
}

// Bare-repo-patroon op een netwerkpad: bare op de share, werkkopie lokaal.
// De share blijft remote; de projectlocatie wijst daarna naar de lokale kloon.
async function initBareOpNetwerk(project, sharePad) {
  const lokaleOuder = await window.api.pickFolder()
  if (!lokaleOuder) return

  const naam = GitTools.veiligeRepoNaam(project.name)
  const barePad = GitTools.joinPad(sharePad, naam + '.git')
  const lokaleMap = GitTools.joinPad(lokaleOuder, naam)

  // Bestaat de bare-map of de lokale kloon al? Dan niet overschrijven.
  const bareCheck = await window.api.listDir(barePad).catch(() => null)
  if (bareCheck && bareCheck.ok) {
    await meldKort(I18N.t('git.link.netwerkTitle'), I18N.t('git.link.netwerkBareBestaat', { pad: barePad }))
    return
  }
  const lokaalCheck = await window.api.listDir(lokaleMap).catch(() => null)
  if (lokaalCheck && lokaalCheck.ok) {
    await meldKort(I18N.t('git.link.netwerkTitle'), I18N.t('git.link.netwerkLokaalBestaat', { pad: lokaleMap }))
    return
  }

  const initCmd = GitTools.bareInitCommando(barePad)
  const cloneCmd = GitTools.bareCloneCommando(barePad, lokaleMap)
  if (!initCmd || !cloneCmd) return

  const initResult = await executeCmd(project, initCmd, 'git-koppelen', { cwd: sharePad })
  if (!initResult || !initResult.success) return

  const cloneResult = await executeCmd(project, cloneCmd, 'git-koppelen', { cwd: lokaleOuder })
  if (!cloneResult || !cloneResult.success) return

  // Verdere git-knoppen horen op de lokale werkkopie te landen, niet op de share.
  const i = Number.isFinite(project.activeLocation) ? project.activeLocation : 0
  if (project.locations && project.locations[i]) {
    project.locations[i].path = lokaleMap
    if (!project.locations[i].label || project.locations[i].label === sharePad) {
      project.locations[i].label = naam
    }
    saveProjects()
  }

  await ververesGitStaat(project, true)
  await meldKort(I18N.t('git.link.netwerkTitle'), I18N.t('git.link.netwerkKlaar'))
  await regelGitignore(project)
  renderMain()
}

async function koppelGithub(project) {
  const pad = actieveLocPad(project)
  if (!pad) return

  let staat = await ververesGitStaat(project, true)
  if (!staat) return
  if (!staat.beschikbaar) {
    await meldKort(I18N.t('git.link.noGitTitle'), I18N.t('git.link.noGitText'))
    return
  }

  // Staat er een adres dat we nog niet nagekeken hebben? Dan eerst kijken, want
  // "al gekoppeld" tegen iemand zeggen van wie de push straks stukloopt is
  // precies het probleem dat we hier oplossen. En andersom: een oordeel van een
  // half uur geleden is oud genoeg om opnieuw te controleren voordat we met een
  // herstelvraag komen.
  if (staat.heeftRemote) {
    await controleerKoppeling(pad, true)
    staat = gitStaten[pad] || staat
  }

  // Kapot heeft zijn eigen weg. Die vraagt niet eerst naar gh: wie alleen het
  // adres wil verbeteren hoeft daar niets voor te installeren.
  if (staat.koppelingStuk) { await herstelKoppeling(project, pad, staat); return }

  // Hier stond alleen "is gh geïnstalleerd". Maar wie hem niet heeft, of hem
  // wel heeft maar nooit inlogde, kreeg meteen de omweg via de browser
  // voorgeschoteld — terwijl de app dat allebei kan oplossen. En wie helemaal
  // nog geen GitHub-account heeft, kreeg nergens te horen dat dat de eerste
  // stap is.
  const ghKlaar = await zorgVoorGithub()
  if (ghKlaar === 'gestopt') return

  const stap = GitTools.koppelStap(staat, ghKlaar === true)

  if (stap === GitTools.KOPPEL_AL_GEDAAN) {
    await meldKort(I18N.t('git.link.doneTitle'), I18N.t('git.link.doneText', { remote: staat.remote || 'origin' }))
    renderMain()
    return
  }

  if (stap === GitTools.KOPPEL_INIT) {
    // Op een netwerkpad eerst het bare-patroon voorstellen: werkkopie met .git
    // op SMB is afgeraden (index.lock, latentie, PowerShell-zone). Zie
    // onderzoek-netwerkschijven §4.
    try {
      if (!netwerkSchijfLetters.size) {
        const schijven = await window.api.listDrives()
        onthoudNetwerkSchijven(schijven)
      }
    } catch {}

    if (padIsNetwerk(pad)) {
      const keuze = await vraagKeuze({
        titel: I18N.t('git.link.netwerkTitle'),
        tekst: I18N.t('git.link.netwerkText'),
        knoppen: [
          { label: I18N.t('common.cancel'), waarde: '' },
          { label: I18N.t('git.link.netwerkTochHier'), waarde: 'hier' },
          { label: I18N.t('git.link.netwerkBare'), waarde: 'bare', soort: 'primair' },
        ],
      })
      if (!keuze) return
      if (keuze === 'bare') {
        await initBareOpNetwerk(project, pad)
        return
      }
      // 'hier': door naar dezelfde init als op een lokale schijf.
    } else {
      const ja = await vraagJaNee(I18N.t('git.link.initTitle'), I18N.t('git.link.initText'), I18N.t('git.link.initOk'))
      if (!ja) return
    }
    await executeCmd(project, GitTools.koppelCommando(GitTools.KOPPEL_INIT), 'git-koppelen')
    await ververesGitStaat(project, true)
    // Meteen erachteraan, want de eerstvolgende knop die je indrukt is
    // "vastleggen" — en dán is het te laat.
    await regelGitignore(project)
    return
  }

  if (stap === GitTools.KOPPEL_COMMIT) {
    // Zonder .gitignore loopt die eerste commit stuk op de bouwmappen. Dus
    // eerst dat, dan pas "leg iets vast".
    if (staat.gitignore === false) await regelGitignore(project)
    await meldKort(I18N.t('git.link.commitTitle'), I18N.t('git.link.commitText'))
    return
  }

  if (stap === GitTools.KOPPEL_GH) {
    const naam = await vraagTekst({
      titel: I18N.t('git.link.nameTitle'),
      tekst: I18N.t('git.link.nameText'),
      waarde: GitTools.veiligeRepoNaam(project.name),
      okLabel: I18N.t('common.next'),
    })
    if (!naam) return

    const zicht = await vraagKeuze({
      titel: I18N.t('git.link.visTitle'),
      tekst: I18N.t('git.link.visText', { naam: GitTools.veiligeRepoNaam(naam) }),
      knoppen: [
        { label: I18N.t('common.cancel'), waarde: '' },
        { label: I18N.t('git.link.public'), waarde: 'publiek' },
        { label: I18N.t('git.link.private'), waarde: 'prive', soort: 'primair' },
      ],
    })
    if (!zicht) return

    const cmd = GitTools.koppelCommando(GitTools.KOPPEL_GH, {
      naam: GitTools.veiligeRepoNaam(naam), prive: zicht === 'prive',
    })
    await executeCmd(project, cmd, 'git-koppelen')
    await controleerKoppeling(pad, true)
    return
  }

  // Geen gh op deze pc: dan maakt de gebruiker de repo zelf aan in de browser
  // en plakt hij het adres. Dat is één stap meer, maar het werkt overal.
  const keuze = await vraagKeuze({
    titel: I18N.t('git.link.ghMissingTitle'),
    tekst: I18N.t('git.link.ghMissingText'),
    knoppen: [
      { label: I18N.t('common.cancel'), waarde: '' },
      { label: I18N.t('git.link.openGithub'), waarde: 'open' },
      { label: I18N.t('git.link.haveUrl'), waarde: 'url', soort: 'primair' },
    ],
  })
  if (!keuze) return
  if (keuze === 'open') { await window.api.openUrl('https://github.com/new'); return }

  const ruw = await vraagTekst({
    titel: I18N.t('git.link.urlTitle'),
    tekst: I18N.t('git.link.urlText'),
    placeholder: 'https://github.com/gebruiker/repo.git',
    okLabel: I18N.t('git.link.linkOk'),
  })
  if (!ruw) return

  const url = GitTools.normaliseerRepoUrl(ruw)
  if (!url) { await meldKort(I18N.t('git.link.urlBadTitle'), I18N.t('git.link.urlBadText')); return }

  await executeCmd(project, GitTools.koppelCommando(GitTools.KOPPEL_URL, {
    url, branch: staat.branch || 'main',
  }), 'git-koppelen')
  await controleerKoppeling(pad, true)
}

async function runCmd(project, cmdKey) {
  // Git heeft zijn eigen route: koppelen vraagt eerst iets, en na afloop kan
  // de knoppenrij er anders uitzien dan ervoor.
  if (GitTools.isGitId(cmdKey)) { await runGitCmd(project, cmdKey); return }

  const releaseFlag = project.release === true ? ' --release' : ''

  // Meerdere telefoons/emulators tegelijk aangesloten? Dan is 'de' Android-
  // device niet eenduidig — laat de gebruiker kiezen i.p.v. te gokken.
  if (cmdKey === 'run-android') {
    const deviceId = await kiesAndroidApparaat(project)
    if (!deviceId) return
    executeCmd(project, `flutter run -d ${deviceId}${releaseFlag}`, cmdKey)
    return
  }

  const cmdMap = {
    'run-windows':   `flutter run -d windows${releaseFlag}`,
    'run-chrome':    `flutter run -d chrome${releaseFlag}`,
    'devices':       'flutter devices',
    'pub-get':       'flutter pub get',
    'clean':         'flutter clean',
    'doctor':        'flutter doctor',
    'build-apk':     'flutter build apk --release',
    'build-web':     'flutter build web',
    'build-windows': 'flutter build windows',
  }
  const cmd = cmdMap[cmdKey]
  if (!cmd) return
  executeCmd(project, cmd, cmdKey)
}

// Geeft het gekozen device-id terug, of null bij annuleren/geen apparaat.
// Bij precies één aangesloten telefoon/emulator wordt niet lastiggevallen.
async function kiesAndroidApparaat(project) {
  const loc = project.locations[project.activeLocation] || project.locations[0]
  if (!loc || !loc.path) {
    springNaarOutput()
    appendLine('err', I18N.t('term.noLocationConfiguredError'))
    return null
  }

  springNaarOutput()
  appendLine('cmd', '> flutter devices')
  setStatus('running', 'flutter devices')

  let devices = []
  try { devices = await window.api.listFlutterDevices({ cwd: loc.path }) } catch { devices = [] }

  if (!devices.length) {
    appendLine('err', I18N.t('project.noAndroidDeviceToast'))
    appendLine('sep', '')
    setStatus('failed', '✗ ' + I18N.t('project.noAndroidDeviceToast'))
    return null
  }
  appendLine('ok', '✓ ' + I18N.t('project.androidDevicesFoundLine', { count: devices.length }))
  if (devices.length === 1) {
    appendLine('info', `${devices[0].name} (${devices[0].id})`)
    return devices[0].id
  }

  const laatst = project.lastAndroidDevice
  const keuze = await vraagKeuze({
    titel: I18N.t('project.pickAndroidDeviceTitle'),
    knoppen: [
      ...devices.map(d => ({
        label: `${d.name} (${d.id})`, waarde: d.id,
        soort: d.id === laatst ? 'primair' : 'normaal',
      })),
      { label: I18N.t('common.cancel'), waarde: null },
    ],
  })
  if (keuze) { project.lastAndroidDevice = keuze; saveProjects() }
  return keuze
}

// ── Terminal input ────────────────────────────────────────────────────────────
let   historyIndex  = -1
let   isRunning     = false
let   activeSubmitCmd = null   // submit-functie van de nu zichtbare terminal

// De pijltjes lopen over `history.recent` — dat is de op schijf bewaarde lijst,
// dus na herstarten van de app scroll je nog steeds door je laatste commando's.
function recentCmds() {
  const seen = new Set()
  const out  = []
  for (const r of (history.recent || [])) {
    if (!r || !r.cmd || seen.has(r.cmd)) continue
    seen.add(r.cmd)
    out.push(r.cmd)
  }
  return out
}

// Alle bekende commando's uit het woordenboek, favorieten en recent gebruikte eerst.
function knownCmds() {
  return (history.entries || [])
    .slice()
    .sort((a, b) => (b.favorite ? 1 : 0) - (a.favorite ? 1 : 0) || (b.lastRun || 0) - (a.lastRun || 0))
    .map(e => e.cmd)
}

const FLUTTER_SUGGESTIONS = [
  'flutter run',
  'flutter run -d windows',
  'flutter run -d chrome',
  'flutter run -d android',
  'flutter run --release',
  'flutter run --profile',
  'flutter build apk --release',
  'flutter build apk --debug',
  'flutter build appbundle --release',
  'flutter build web',
  'flutter build windows',
  'flutter build ios',
  'flutter pub get',
  'flutter pub upgrade',
  'flutter pub outdated',
  'flutter clean',
  'flutter doctor',
  'flutter doctor -v',
  'flutter devices',
  'flutter emulators',
  'flutter analyze',
  'flutter test',
  'flutter test --coverage',
  'flutter format .',
  'flutter create .',
  'flutter upgrade',
  'dart pub get',
  'dart run',
  'dart analyze',
  'dart format .',
  'git status',
  'git pull',
  'git push',
  'git add .',
  'git commit -m ""',
  'git log --oneline',
  'npm install',
  'npm run build',
]

function setupTerminalInput(project) {
  const input    = termEl('term-input', project.id)
  const runBtn   = termEl('term-run-btn', project.id)
  const acList   = termEl('term-autocomplete', project.id)
  if (!input) return

  let acIndex = -1   // selected autocomplete item

  // Alles wat je typt hoort bij dit project (of bij de losse cmd-sectie). Het
  // paneel wordt bij elke wissel opnieuw opgebouwd, dus bewaren we de tekst
  // hier en zetten hem verderop weer terug.
  const invoerSleutel = project.id
  const bewaarInvoer = () => { termInvoer[invoerSleutel] = input.value }

  function getMatches(val) {
    if (!val.trim()) return []
    const lower = val.toLowerCase()
    // Begin je met een /, dan bedoel je de app zelf en niet de shell.
    const all = val.trim().startsWith('/')
      ? AI_SLASH_SUGGESTIES
      // Eigen eerder gebruikte commando's staan vooraan, daarna de standaardsuggesties
      : [...new Set([...knownCmds(), ...FLUTTER_SUGGESTIONS])]
    return all.filter(s => s.toLowerCase().includes(lower) && s !== val).slice(0, 8)
  }

  function showAC(matches, val) {
    if (!matches.length) { acList.hidden = true; return }
    acList.hidden = false
    acList.innerHTML = ''
    acIndex = -1
    matches.forEach((m, i) => {
      const item = document.createElement('div')
      item.className = 'ac-item'
      // Highlight matching part
      const idx = m.toLowerCase().indexOf(val.toLowerCase())
      if (idx >= 0) {
        item.innerHTML = esc(m.slice(0, idx))
          + `<span class="ac-match">${esc(m.slice(idx, idx + val.length))}</span>`
          + esc(m.slice(idx + val.length))
      } else {
        item.textContent = m
      }
      item.onmousedown = (e) => { e.preventDefault(); input.value = m; acList.hidden = true; input.focus(); autoResize(); bewaarInvoer() }
      acList.appendChild(item)
    })
  }

  function hideAC() { acList.hidden = true; acIndex = -1 }

  // Zodra je `cd` typt verschijnt er een knop om de map in de verkenner te
  // kiezen — dan hoef je geen pad uit te typen.
  const pickBtn = termEl('term-pick-folder', project.id)
  function updatePickBtn() {
    if (!pickBtn) return
    const lastLine = input.value.split(/\r?\n/).pop().trim()
    pickBtn.hidden = !/^cd\b/i.test(lastLine)
  }
  if (pickBtn) {
    pickBtn.onclick = async () => {
      const picked = await window.api.pickFolder()
      if (!picked) { input.focus(); return }
      const lines = input.value.split(/\r?\n/)
      lines[lines.length - 1] = `cd ${/\s/.test(picked) ? `"${picked}"` : picked}`
      input.value = lines.join('\n')
      hideAC(); autoResize(); updatePickBtn(); bewaarInvoer()
      input.focus()
      input.selectionStart = input.selectionEnd = input.value.length
    }
  }

  function autoResize() {
    input.style.height = 'auto'
    const max = 160
    const h = Math.min(input.scrollHeight, max)
    input.style.height = h + 'px'
    input.style.overflowY = input.scrollHeight > max ? 'auto' : 'hidden'
  }

  async function submitCmd() {
    // PowerShell: het hele vak is één script. Plakken met pipes en { } over
    // meerdere regels mag niet uit elkaar getrokken worden tot losse processen.
    if (project.id === PS_CTX_ID) {
      const script = input.value.replace(/\s+$/, '')
      if (!script.trim()) return
      if (psScriptIncomplete(script)) {
        if (!/\n$/.test(input.value)) input.value += '\n'
        bewaarInvoer()
        autoResize()
        updateTermPrompt()
        input.focus()
        input.selectionStart = input.selectionEnd = input.value.length
        return
      }
      historyIndex = -1
      input.value = ''
      bewaarInvoer()
      hideAC()
      autoResize()
      updateTermPrompt()
      await executeCmd(project, script, null)
      return
    }

    const lines = input.value.split(/\r?\n/).map(l => l.trim()).filter(Boolean)
    if (!lines.length) return
    historyIndex = -1
    input.value = ''
    bewaarInvoer()
    hideAC()
    autoResize()

    // Opslaan gebeurt centraal in executeCmd, zodat knop-commando's er ook in komen
    for (const cmd of lines) {
      await executeCmd(project, cmd, null)
    }
  }

  function updateRunBtn() {
    const btn = document.getElementById('term-run-btn')
    if (!btn) return
    if (isRunning) {
      btn.innerHTML = '<i class="ti ti-player-stop"></i>'
      btn.classList.add('running')
      btn.title = I18N.t('term.stopTitle')
      btn.onclick = () => { window.api.killCmd(); setStatus('failed', '✗ ' + I18N.t('term.stoppedStatus')); isRunning = false; updateRunBtn() }
    } else {
      btn.innerHTML = '<i class="ti ti-corner-down-left"></i>'
      btn.classList.remove('running')
      btn.title = I18N.t('term.runTitle')
      btn.onclick = submitCmd
    }
  }

  activeSubmitCmd = submitCmd
  runBtn.onclick  = submitCmd

  input.addEventListener('input', () => {
    historyIndex = -1
    bewaarInvoer()
    showAC(getMatches(input.value), input.value)
    autoResize()
    updatePickBtn()
    updateTermPrompt()
  })
  updatePickBtn()

  input.addEventListener('keydown', (e) => {
    const items = acList.querySelectorAll('.ac-item')
    const singleLine = !input.value.includes('\n')

    // Ctrl+A selecteert hier de hele regel. Laten we dat aan de omgeving over,
    // dan zet die de cursor soms alleen aan het begin van de regel.
    if ((e.ctrlKey || e.metaKey) && !e.altKey && (e.key === 'a' || e.key === 'A')) {
      e.preventDefault()
      hideAC()
      input.select()
      return
    }

    if (e.key === 'Tab') {
      e.preventDefault()
      if (!acList.hidden && items.length) {
        // Tab cycles through suggestions
        acIndex = (acIndex + 1) % items.length
        items.forEach((el, i) => el.classList.toggle('ac-active', i === acIndex))
        input.value = items[acIndex].textContent
      } else {
        // No list open yet — show all flutter suggestions matching current input
        const val = input.value.trim()
        showAC(val ? getMatches(val) : FLUTTER_SUGGESTIONS.slice(0, 8), val)
      }
      autoResize()
    } else if (e.key === 'ArrowUp') {
      if (!singleLine) return // let textarea move the cursor normally
      e.preventDefault()
      if (!acList.hidden && items.length) {
        acIndex = Math.max(0, acIndex - 1)
        items.forEach((el, i) => el.classList.toggle('ac-active', i === acIndex))
        input.value = items[acIndex].textContent
      } else {
        // History navigation — uit de bewaarde geschiedenis, dus ook van vorige sessies
        hideAC()
        const hist = recentCmds()
        if (historyIndex < hist.length - 1) {
          historyIndex++
          input.value = hist[historyIndex]
        }
      }
      autoResize()
    } else if (e.key === 'ArrowDown') {
      if (!singleLine) return // let textarea move the cursor normally
      e.preventDefault()
      if (!acList.hidden && items.length) {
        acIndex = Math.min(items.length - 1, acIndex + 1)
        items.forEach((el, i) => el.classList.toggle('ac-active', i === acIndex))
        input.value = items[acIndex].textContent
      } else {
        hideAC()
        const hist = recentCmds()
        if (historyIndex > 0) {
          historyIndex--
          input.value = hist[historyIndex]
        } else {
          historyIndex = -1
          input.value = ''
        }
      }
      autoResize()
    } else if (e.key === 'Enter') {
      if (e.shiftKey) return // allow newline, textarea handles it
      e.preventDefault()
      submitCmd()
    } else if (e.key === 'Escape') {
      hideAC()
    }
    // Pijltjes en Tab zetten de tekst rechtstreeks; die geven geen input-event.
    bewaarInvoer()
  })

  input.addEventListener('blur', () => { bewaarInvoer(); setTimeout(hideAC, 150) })

  // Terug in deze weergave: zetten wat je hier had staan maar nog niet had
  // verstuurd er weer neer.
  if (termInvoer[invoerSleutel]) {
    input.value = termInvoer[invoerSleutel]
    autoResize()
    updatePickBtn()
  }

  updateTermPrompt()
  input.focus()
}

// ── Modal: Add / Edit project ─────────────────────────────────────────────────
function setupModalEvents() {
  document.getElementById('modal-proj-close').onclick  = closeProjectModal
  document.getElementById('modal-proj-cancel').onclick = closeProjectModal
  document.getElementById('modal-proj-save').onclick   = () => saveProjectModal()
  document.getElementById('btn-add-loc').onclick       = () => addLocEntry()
  const gitUrl = document.getElementById('f-git-url')
  if (gitUrl) gitUrl.oninput = onCloneUrlInvoer
  const repoKnop = document.getElementById('btn-git-repos')
  if (repoKnop) repoKnop.onclick = wisselRepoKiezer
  const repoHerlaad = document.getElementById('btn-git-repos-herlaad')
  if (repoHerlaad) repoHerlaad.onclick = () => laadGithubRepos({ opnieuw: true })
  const repoZoek = document.getElementById('f-git-repo-zoek')
  if (repoZoek) repoZoek.oninput = () => tekenRepoLijst()
  const naamVeld = document.getElementById('f-name')
  if (naamVeld) naamVeld.oninput = () => { cloneNaamOvergenomen = false }
  // Het potlood zit ín de cmd-knop van de zijbalk. Klikken mag die knop niet
  // ook nog eens openen, en lang drukken hoort de sorteerstand niet aan te
  // zetten — vandaar dat beide gebeurtenissen hier stoppen.
  const cmdPotlood = document.getElementById('nav-cmd-edit')
  if (cmdPotlood) {
    cmdPotlood.onmousedown = (e) => e.stopPropagation()
    cmdPotlood.onclick = (e) => { e.stopPropagation(); openCmdInstellingen() }
    cmdPotlood.onkeydown = (e) => {
      if (e.key !== 'Enter' && e.key !== ' ') return
      e.preventDefault(); e.stopPropagation(); openCmdInstellingen()
    }
  }
  const psPotlood = document.getElementById('nav-ps-edit')
  if (psPotlood) {
    psPotlood.onmousedown = (e) => e.stopPropagation()
    psPotlood.onclick = (e) => { e.stopPropagation(); openPsInstellingen() }
    psPotlood.onkeydown = (e) => {
      if (e.key !== 'Enter' && e.key !== ' ') return
      e.preventDefault(); e.stopPropagation(); openPsInstellingen()
    }
  }

  document.getElementById('modal-cmdset-close').onclick = sluitCmdInstellingen
  document.getElementById('modal-cmdset-klaar').onclick = sluitCmdInstellingen
  document.getElementById('modal-psset-close').onclick  = sluitPsInstellingen
  document.getElementById('modal-psset-klaar').onclick  = sluitPsInstellingen
  document.getElementById('vraag-sluit').onclick       = () => sluitVraag(false)
  document.getElementById('klembord-sluit').onclick    = sluitKlembordVenster
  document.getElementById('klembord-annuleer').onclick = sluitKlembordVenster
  document.getElementById('klembord-leeg').onclick     = async () => {
    klembordLog = []
    klembordKeuze = 0
    bestandsKlembord = { paden: [], knippen: false }
    await window.api.zetKlembord({ paden: [], knippen: false })
    tekenKlembord(); toonSelectie(); showToast(I18N.t('toast.clipboardClearedToast'))
  }
  document.getElementById('klembord-plak').onclick     = () => plakGekozenKopie()

  // Escape sluit deze twee vensters; bij een vraag telt dat als afbreken.
  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return
    if (!document.getElementById('modal-cmdset').hidden)   { e.preventDefault(); sluitCmdInstellingen(); return }
    if (!document.getElementById('modal-psset').hidden)    { e.preventDefault(); sluitPsInstellingen(); return }
    if (!document.getElementById('modal-vraag').hidden)    { e.preventDefault(); sluitVraag(false); return }
    if (!document.getElementById('modal-klembord').hidden) { e.preventDefault(); sluitKlembordVenster() }
  })

  document.getElementById('modal-naam-close').onclick  = () => sluitNaamVraag(null)
  document.getElementById('modal-naam-cancel').onclick = () => sluitNaamVraag(null)
  document.getElementById('modal-naam-ok').onclick     = () => {
    const v = document.getElementById('naam-invoer').value.trim()
    const fout = document.getElementById('naam-fout')
    if (!v) { fout.textContent = I18N.t('dialog.nameRequiredError'); fout.hidden = false; return }
    if (/[\\/:*?"<>|]/.test(v)) { fout.textContent = I18N.t('dialog.nameInvalidCharsError'); fout.hidden = false; return }
    sluitNaamVraag(v)
  }
  document.getElementById('naam-invoer').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); document.getElementById('modal-naam-ok').click() }
    if (e.key === 'Escape') { e.preventDefault(); sluitNaamVraag(null) }
  })

  document.getElementById('modal-info-close').onclick = () => { document.getElementById('modal-info').hidden = true }
  document.getElementById('modal-info-ok').onclick    = () => { document.getElementById('modal-info').hidden = true }

  document.getElementById('modal-found-close').onclick = sluitGevondenEditors
  document.getElementById('modal-found-later').onclick = sluitGevondenEditors
  document.getElementById('modal-found-skip').onclick  = slaGevondenEditorsOver
  document.getElementById('modal-found-add').onclick   = voegGevondenEditorsToe

  document.getElementById('modal-prog-close').onclick  = closeProgramModal
  document.getElementById('modal-prog-cancel').onclick = closeProgramModal
  document.getElementById('prog-search').addEventListener('input', renderProgramList)

  document.getElementById('modal-addbtn-close').onclick  = closeAddBtnModal
  document.getElementById('modal-addbtn-cancel').onclick = closeAddBtnModal
  document.getElementById('modal-addbtn-save').onclick   = saveAddBtnModal

  document.getElementById('modal-dict-close').onclick  = closeDictModal
  document.getElementById('modal-dict-cancel').onclick = closeDictModal
  document.getElementById('modal-dict-save').onclick   = saveDictModal

  const closeDel = () => { document.getElementById('modal-del').hidden = true; focusTerminalInput() }
  document.getElementById('modal-del-close').onclick   = closeDel
  document.getElementById('del-cancel').onclick        = closeDel
  document.getElementById('del-confirm').onclick       = () => {
    const weg = projects.find(p => p.id === deleteId)
    projects = projects.filter(p => p.id !== deleteId)
    // Alles wat over dit project onthouden was gaat mee weg. Bleef die
    // git-toestand staan, dan telde zijn repo daarna nog steeds als bezet en
    // was hij niet meer te kiezen voor een nieuw project -- tot je de app
    // herstartte, want dan is de cache leeg.
    for (const loc of projectLocaties(weg || {})) {
      delete gitStaten[loc.pad]
      gitRemoteGedaan.delete(loc.pad)
      delete gitLaatsteFetch[loc.pad]
    }
    if (activeId === deleteId) {
      activeId = null
      document.getElementById('main').innerHTML = `<div class="empty-state"><i class="ti ti-layout-sidebar-left-expand"></i><p>${esc(I18N.t('main.emptyState'))}</p></div>`
    }
    saveProjects()
    meldGitPadenAanMain()
    sidebarGetekend = false
    renderSidebar()
    if (view === 'settings') renderSettingsPanel()
    document.getElementById('modal-del').hidden = true
    focusTerminalInput()
  }
}

function buildEmojiPicker() {
  const row = document.getElementById('emoji-row')
  if (!row || row.children.length > 0) return
  EMOJIS.forEach(e => {
    const span = document.createElement('span')
    span.className = 'emoji-opt'; span.textContent = e
    span.onclick = () => {
      row.querySelectorAll('.emoji-opt').forEach(x => x.classList.remove('sel'))
      span.classList.add('sel'); selEmoji = e
    }
    row.appendChild(span)
  })
}


// ── De git-sectie bij de projectinstellingen ─────────────────────────────────
// De knoppen in het projectvenster doen het gewone werk: committen, pushen,
// koppelen. Wat hier hoort is het onderhoud eromheen — wat er precies aan
// remotes vastzit, wat er mis is, en hoe je dat losmaakt of repareert. Dat wil
// je één keer per jaar doen en dan wél kunnen vinden, dus het staat niet
// tussen de knoppen die je elke dag gebruikt.
//
// Alles wat hier staat gaat over de actieve locatie van het project: een
// project met twee mappen heeft twee repo's, en die kunnen los van elkaar stuk
// zijn.
let gitSectieProject = null
// Wat git in deze map werkelijk doet, per pad. Los van gitStaten omdat het
// alleen nodig is als je dit paneel openslaat -- er zit een netwerkvraag bij.
let gitDiagnoses = {}

function toonGitSectie(p) {
  const vak = document.getElementById('f-git-sectie')
  if (!vak) return
  gitSectieProject = p || null
  // Een nieuw project heeft nog geen map. Dan valt er niets te zeggen.
  vak.hidden = !p || !actieveLocPad(p)
  if (vak.hidden) return
  tekenGitSectie()
  // De staat kan oud zijn; opnieuw ophalen en dan nog een keer tekenen.
  ververesGitStaat(p, true).then(() => tekenGitSectie())
  ververesGitDiagnose(actieveLocPad(p))
}

// Wie commit hier, wie pusht hier, en mag die dat ook. Drie vragen die het
// paneel niet stelde -- en die alle drie fout stonden terwijl er "koppeling
// werkt" naast stond.
async function ververesGitDiagnose(pad) {
  if (!pad) return
  try {
    const d = await window.api.gitKoppelingDiagnose(pad)
    if (d) { gitDiagnoses[pad] = d; tekenGitSectie() }
  } catch {}
}

function accountAlsProfiel() {
  const acc = huidigAccount()
  if (!acc) return {}
  return { naam: acc.gitNaam || '', email: acc.gitEmail || '', ghGebruiker: acc.ghGebruiker || '' }
}

// Eerst uitleggen wat er aan de hand is, dan pas de keuzes. Wie hier komt
// heeft net een push zien mislukken en weet niet waarom; een knop zonder verhaal
// is dan alleen maar een tweede raadsel. Niets gebeurt uit zichzelf -- stil
// ingrijpen is precies hoe dit probleem zo lang verborgen kon blijven.
//
// Geeft true terug als er iets veranderd is en het paneel opnieuw moet.
async function legKoppelProbleemUit(project, pad, pr) {
  const van = pr.van || '—'
  const naar = pr.naar || '—'

  if (pr.actie === 'via-gh') {
    const keuze = await vraagKeuze({
      titel: I18N.t('gitset.viaGhTitel'),
      tekst: I18N.t('gitset.viaGhTekst'),
      regels: [I18N.t('gitset.inlog-anders', { van, naar })],
      knoppen: [
        { label: I18N.t('gitset.nietsDoen'), waarde: '' },
        { label: I18N.t('gitset.viaGhKnop'), waarde: 'doen', soort: 'primair' },
      ],
    })
    if (keuze !== 'doen') return false
    const r = await window.api.gitViaGhInloggen()
    showToast(r && r.ok ? I18N.t('gitset.viaGhGelukt')
      : I18N.t('gitset.viaGhMislukt', { fout: (r && r.fout) || (r && r.reden) || '' }))
    if (r && r.ok) await ververesGitDiagnose(pad)
    return !!(r && r.ok)
  }

  if (pr.actie === 'gh-wissel') {
    const keuze = await vraagKeuze({
      titel: I18N.t('gitset.ghWisselTitel'),
      tekst: I18N.t('gitset.ghWisselTekst', { van, naar }),
      knoppen: [
        { label: I18N.t('gitset.nietsDoen'), waarde: '' },
        { label: I18N.t('gitset.ghWisselKnop', { naar }), waarde: 'doen', soort: 'primair' },
      ],
    })
    if (keuze !== 'doen') return false
    await activeerGitVoorAccount()
    await ververesGitDiagnose(pad)
    return true
  }

  if (pr.actie === 'identiteit') {
    const keuze = await vraagKeuze({
      titel: I18N.t('gitset.identFixTitel'),
      tekst: I18N.t('gitset.identFixTekst', { van, naar }),
      knoppen: [
        { label: I18N.t('gitset.nietsDoen'), waarde: '' },
        { label: I18N.t('gitset.identFixKnop'), waarde: 'doen', soort: 'primair' },
      ],
    })
    if (keuze !== 'doen') return false
    const prof = gitStandaardProfiel()
    if (prof) await pasProfielToe(project, prof, { stil: true })
    await ververesGitDiagnose(pad)
    return true
  }
  return false
}

function tekenGitSectie() {
  const doel = document.getElementById('git-sectie')
  const p = gitSectieProject
  if (!doel || !p) return
  const pad = actieveLocPad(p)
  const staat = gitStaten[pad] || null

  if (!staat) { doel.innerHTML = `<div class="git-set-leeg">${esc(I18N.t('gitset.laden'))}</div>`; return }

  const problemen = GitTools.gitProblemen(staat)
  const ernst = GitTools.ergsteErnst(problemen)

  // 1. Waar staat het, en werkt het.
  const kop = staat.isRepo
    ? I18N.t('gitset.kopRepo', { branch: staat.branch || 'HEAD' })
    : I18N.t('gitset.kopGeenRepo')
  const koppelTekst = !staat.isRepo ? ''
    : staat.koppeling === 'geen'     ? I18N.t('gitset.koppelGeen')
    : staat.koppeling === 'ok'       ? I18N.t('gitset.koppelOk')  // zie hieronder: dit zegt alleen dat het adres antwoordt
    : staat.koppeling === 'stuk'     ? I18N.t('gitset.koppelStuk')
    :                                  I18N.t('gitset.koppelOnbekend')

  // De identiteit die hier stond kwam uit het accountbestand van de app. Dat
  // is een wens, geen feit: git kan in deze map iets heel anders hebben staan,
  // en dat is precies wat er misging. Dus tonen we wat git zelf zegt, en pas
  // als we dat nog niet weten vallen we terug op het account.
  const acc = huidigAccount()
  const diag = gitDiagnoses[pad] || null
  const gitIdent = (diag && diag.identiteit) || null
  const identTekst = gitIdent && (gitIdent.naam || gitIdent.email)
    ? I18N.t('gitset.identiteit', {
        naam: gitIdent.naam || '—', email: gitIdent.email || '—',
        gh: diag.credentialGebruiker ? ' · ' + diag.credentialGebruiker : '',
      })
    : acc && acc.gitCompleet
      ? I18N.t('gitset.identiteit', {
          naam: acc.gitNaam, email: acc.gitEmail,
          gh: acc.ghGebruiker ? ' · ' + acc.ghGebruiker : '',
        })
      : I18N.t('gitset.identiteitOnaf')

  const koppelProblemen = diag
    ? GitTools.koppelingProblemen({ ...diag, account: accountAlsProfiel() })
    : []

  // `git ls-remote` bewijst alleen dat het adres te lézen is. Een publieke repo
  // antwoordt ook als je er niets in mag zetten, en dan stond hier groen naast
  // een push die stukliep. Weten we het echte antwoord, dan telt dat.
  const pushRecht = diag ? diag.pushRecht : null
  const koppelSoort = pushRecht === false ? 'stuk' : pushRecht === true ? 'ok' : staat.koppeling
  const koppelBadge = pushRecht === false ? I18N.t('gitset.koppelGeenPush')
    : pushRecht === true ? I18N.t('gitset.koppelPushOk')
    : koppelTekst

  const delen = [`<div class="git-set-kop ${ernst ? 'e-' + ernst : ''}">
      <i class="ti ti-git-branch"></i>
      <span>${esc(kop)}</span>
      ${koppelBadge ? `<span class="git-set-status s-${esc(koppelSoort)}">${esc(koppelBadge)}</span>` : ''}
    </div>`,
    `<div class="git-set-ident ${acc && acc.gitCompleet ? '' : 'onaf'}">
      <i class="ti ti-brand-github"></i>
      <span>${esc(identTekst)}</span>
      <button class="btn-ghost btn-mini" id="git-set-identiteit">${esc(I18N.t('gitset.identiteitKnop'))}</button>
    </div>`]

  // Eerst zeggen wát er niet klopt, met de twee namen erbij. De knop legt uit
  // en biedt de keuzes; hier direct iets veranderen zou hetzelfde stille
  // gedrag zijn waar dit hele probleem uit voortkwam.
  if (koppelProblemen.length) {
    delen.push(`<div class="git-set-waarschuwingen">` + koppelProblemen.map(pr => `
      <div class="git-set-waarschuwing e-${esc(pr.ernst)}">
        <i class="ti ti-alert-triangle"></i>
        <span>${esc(I18N.t('gitset.' + pr.id, { van: pr.van || '', naar: pr.naar || '' }))}</span>
        <button class="btn-ghost btn-mini" data-koppel-fix="${esc(pr.actie)}">${esc(I18N.t('gitset.bekijken'))}</button>
      </div>`).join('') + `</div>`)
  }

  // 2. Elk adres apart, met een knop om het te wijzigen of weg te halen. Bij
  //    twee remotes waarvan er één dood is, is dit de plek waar je ziet welke.
  if (staat.remoteLijst && staat.remoteLijst.length) {
    delen.push(`<div class="git-set-remotes">` + staat.remoteLijst.map(r => `
      <div class="git-set-remote${r.naam === staat.remote ? ' actief' : ''}">
        <div class="git-set-remote-tekst">
          <span class="git-set-remote-naam">${esc(r.naam)}</span>
          <span class="git-set-remote-url mono">${esc(r.url)}</span>
        </div>
        <button class="btn-ghost btn-mini" data-remote-url="${esc(r.naam)}">${esc(I18N.t('gitset.adresWijzigen'))}</button>
        <button class="btn-ghost btn-mini gevaar" data-remote-weg="${esc(r.naam)}">${esc(I18N.t('gitset.adresWeg'))}</button>
      </div>`).join('') + `</div>`)
  }

  // 3. Wat er mis is, met per punt de knop die het oplost.
  if (problemen.length) {
    delen.push(`<div class="git-set-problemen">` + problemen.map(pr => `
      <div class="git-set-probleem e-${esc(pr.ernst)}">
        <i class="ti ${pr.ernst === 'fout' ? 'ti-alert-triangle' : pr.ernst === 'let-op' ? 'ti-alert-circle' : 'ti-info-circle'}"></i>
        <span>${esc(I18N.t('gitset.prob.' + pr.id, { aantal: pr.aantal || 0, remote: pr.remote || '', url: pr.url || '' }))}</span>
        ${pr.actie ? `<button class="btn-ghost btn-mini" data-git-actie="${esc(pr.actie)}">${esc(I18N.t('gitset.actie.' + pr.actie))}</button>` : ''}
      </div>`).join('') + `</div>`)
  } else if (staat.isRepo) {
    delen.push(`<div class="git-set-ok"><i class="ti ti-check"></i> ${esc(I18N.t('gitset.nietsMis'))}</div>`)
  }

  // 4. Altijd bereikbaar, ook als de app níéts mis ziet — want "de app ziet
  //    het niet" is precies de klacht die hier begon.
  delen.push(`<div class="git-set-acties">
      <button class="btn-ghost btn-mini" id="git-set-check"><i class="ti ti-refresh"></i> ${esc(I18N.t('gitset.controleren'))}</button>
      ${staat.heeftRemote ? `<button class="btn-ghost btn-mini" id="git-set-herstel">${esc(I18N.t('gitset.herstellen'))}</button>` : ''}
      ${staat.isRepo ? `<button class="btn-ghost btn-mini" id="git-set-koppel">${esc(I18N.t(staat.heeftRemote ? 'gitset.opnieuwKoppelen' : 'gitset.koppelen'))}</button>` : ''}
    </div>`)

  doel.innerHTML = delen.join('')
  bindGitSectie(p, pad, staat, koppelProblemen)
}

function bindGitSectie(p, pad, staat, koppelProblemen = []) {
  const doel = document.getElementById('git-sectie')
  if (!doel) return

  // Na élke handeling opnieuw controleren én opnieuw tekenen: de sectie is de
  // plek waar je komt kijken of het gelukt is.
  const naAfloop = async () => { await controleerKoppeling(pad, true); tekenGitSectie() }

  doel.querySelector('#git-set-check')?.addEventListener('click', async (e) => {
    e.target.closest('button').disabled = true
    await naAfloop()
  })
  doel.querySelector('#git-set-herstel')?.addEventListener('click', async () => {
    // De herstelweg wil een kapotte koppeling zien. Is hij niet kapot, dan
    // laten we hem hier toch los — de gebruiker vraagt er expliciet om.
    const nu = gitStaten[pad] || staat
    await herstelKoppeling(p, pad, nu.koppelingStuk ? nu : { ...nu, koppelingStuk: true, remoteReden: nu.remoteReden || 'onbekend' })
    await naAfloop()
  })
  doel.querySelector('#git-set-koppel')?.addEventListener('click', async () => {
    await koppelGithub(p)
    await naAfloop()
  })
  doel.querySelectorAll('[data-koppel-fix]').forEach(knop => {
    const pr = koppelProblemen.find(x => x.actie === knop.dataset.koppelFix)
    knop.addEventListener('click', async () => {
      if (pr && await legKoppelProbleemUit(p, pad, pr)) await naAfloop()
    })
  })
  doel.querySelector('#git-set-identiteit')?.addEventListener('click', async () => {
    const a = huidigAccount()
    if (!a) return
    const git = await vraagGitIdentiteit(a.naam, a)
    if (!git) return
    await bewaarAccountGit(a, git)
    await naAfloop()
  })

  doel.querySelectorAll('[data-remote-weg]').forEach(el => el.addEventListener('click', async () => {
    const naam = el.dataset.remoteWeg
    const ja = await vraagJaNee(I18N.t('gitset.wegTitel'),
      I18N.t('gitset.wegTekst', { remote: naam }), I18N.t('gitset.adresWeg'), 'gevaar')
    if (!ja) return
    await executeCmd(p, GitTools.remoteWegCommando(naam), 'git-koppelen')
    await naAfloop()
  }))

  doel.querySelectorAll('[data-remote-url]').forEach(el => el.addEventListener('click', async () => {
    const naam = el.dataset.remoteUrl
    const oud = (staat.remoteLijst.find(r => r.naam === naam) || {}).url || ''
    const ruw = await vraagTekst({
      titel: I18N.t('git.link.urlTitle'), tekst: I18N.t('git.link.urlText'),
      waarde: oud, placeholder: 'https://github.com/gebruiker/repo.git',
      okLabel: I18N.t('common.save'),
    })
    if (!ruw) return
    const cmd = GitTools.remoteUrlCommando(naam, ruw)
    if (!cmd) { await meldKort(I18N.t('git.link.urlBadTitle'), I18N.t('git.link.urlBadText')); return }
    await executeCmd(p, cmd, 'git-koppelen')
    await naAfloop()
  }))

  doel.querySelectorAll('[data-git-actie]').forEach(el => el.addEventListener('click', async () => {
    const actie = el.dataset.gitActie
    const nu = gitStaten[pad] || staat
    if (actie === 'herstellen')  await herstelKoppeling(p, pad, nu)
    else if (actie === 'koppelen') await koppelGithub(p)
    else if (actie === 'commit')   await schrijfGitCmd(p, 'git-commit')
    else if (actie === 'push')     await schrijfGitCmd(p, 'git-push')
    else if (actie === 'diff')     await toonDiff(p)
    else if (actie === 'branch')   await branchOverzicht(p)
    else if (actie === 'profiel')  await controleerIdentiteit(p, nu)
    else if (actie === 'gitignore') await regelGitignore(p)
    else if (actie === 'langepaden') await zetLangePaden(p)
    else if (actie === 'remotes')  await meldKort(I18N.t('gitset.remotesTitel'), I18N.t('gitset.remotesTekst'))
    await naAfloop()
  }))
}

function openNewModal() {
  editingId = null; selEmoji = '📱'
  cloneNaamOvergenomen = false
  document.getElementById('modal-title').textContent = I18N.t('modal.project.title')
  document.getElementById('f-name').value   = ''
  document.getElementById('f-device').value = ''
  pendingLocs = [{ label: 'main', path: '' }]
  pendingCmdVisibility = {}
  pendingSecties = {}
  pendingCustomCmds = []
  pendingCmdVolgorde = { run: [], tools: [] }
  cmdvisSorteerModus = ''
  document.getElementById('modal-proj').hidden = false
  buildEmojiPicker()
  refreshEmojiPicker(); refreshLocList(); renderCmdVisibilitySection()
  toonGitSectie(null)
  toonCloneVeld(true)
  focusField('f-name')
}

function openEditModal(id) {
  const p = projects.find(x => x.id === id)
  if (!p) return
  editingId = id; selEmoji = p.icon
  document.getElementById('modal-title').textContent = I18N.t('modal.project.editTitle')
  document.getElementById('f-name').value   = p.name
  document.getElementById('f-device').value = p.device || ''
  pendingLocs = p.locations.map(l => ({ ...l }))
  pendingCmdVisibility = { ...(p.cmdVisibility || {}) }
  pendingSecties = { ...(p.secties || {}) }
  pendingCustomCmds = (p.customCmds || []).map(c => ({ ...c }))
  pendingCmdVolgorde = {
    run:   [...((p.cmdVolgorde && p.cmdVolgorde.run)   || [])],
    tools: [...((p.cmdVolgorde && p.cmdVolgorde.tools) || [])],
  }
  cmdvisSorteerModus = ''
  document.getElementById('modal-proj').hidden = false
  buildEmojiPicker()
  refreshEmojiPicker(); refreshLocList(); renderCmdVisibilitySection()
  toonGitSectie(p)
  toonCloneVeld(false)

  const footer = document.querySelector('#modal-proj .modal-footer')
  if (!footer.querySelector('.btn-delete')) {
    const delBtn = document.createElement('button')
    delBtn.className = 'btn-danger btn-delete'; delBtn.style.marginRight = 'auto'
    delBtn.innerHTML = `<i class="ti ti-trash"></i> ${esc(I18N.t('common.delete'))}`
    delBtn.onclick = () => { deleteId = id; closeProjectModal(); document.getElementById('modal-del').hidden = false }
    footer.prepend(delBtn)
  }
  document.getElementById('modal-proj').hidden = false
  focusField('f-name')
}

function focusField(id) {
  const el = document.getElementById(id)
  if (!el) return
  requestAnimationFrame(() => { el.focus(); el.select?.() })
}

function closeProjectModal() {
  document.getElementById('modal-proj').hidden = true
  document.querySelector('#modal-proj .btn-delete')?.remove()
  // Niet laten staan: zolang dit gevuld is telt dat project niet mee als
  // "repo al bezet", ook als je allang klaar bent met bewerken.
  editingId = null
  cmdvisSorteerModus = ''
  toonCloneVeld(false)
  focusTerminalInput()
}

function toonCloneVeld(aan) {
  const vak = document.getElementById('f-git-clone')
  if (vak) vak.hidden = !aan
  const url = document.getElementById('f-git-url')
  if (url && !aan) url.value = ''
  const zoek = document.getElementById('f-git-repo-zoek')
  if (zoek && !aan) zoek.value = ''
  if (!aan) {
    cloneNaamOvergenomen = false
    // Verse lijst bij de volgende keer: tussendoor kan er van account gewisseld
    // zijn, en dan hoort er een andere lijst te staan.
    cloneRepos = null
    cloneRepoFout = ''
    zetRepoKiezer(false)
  } else {
    // Uitgeklapt en meteen aan het ophalen: je opent dit venster om een project
    // te kiezen, dus daar hoort geen extra klik voor te staan. Inklappen kan,
    // voor als je alleen een adres komt plakken.
    zetRepoKiezer(true)
    laadGithubRepos()
  }
  updateCloneDoelPreview()
}

function cloneUrlInvoer() {
  return (document.getElementById('f-git-url')?.value || '').trim()
}

function updateCloneDoelPreview() {
  const doelEl = document.getElementById('f-git-clone-doel')
  if (!doelEl) return
  const vak = document.getElementById('f-git-clone')
  if (!vak || vak.hidden) { doelEl.hidden = true; return }
  const url = cloneUrlInvoer()
  const loc = (pendingLocs[0] && pendingLocs[0].path || '').trim()
  const doel = GitTools.cloneDoelPad(url, loc)
  if (!doel) { doelEl.hidden = true; doelEl.textContent = ''; return }
  doelEl.hidden = false
  doelEl.textContent = I18N.t('modal.project.gitCloneDoel', { pad: doel })
}

function onCloneUrlInvoer() {
  const naam = GitTools.repoNaamUitUrl(cloneUrlInvoer())
  const nameEl = document.getElementById('f-name')
  if (naam && nameEl && (!nameEl.value.trim() || cloneNaamOvergenomen)) {
    nameEl.value = naam
    cloneNaamOvergenomen = true
  }
  updateCloneDoelPreview()
  markeerGekozenRepo()
}

// ── Een project van je GitHub-account kiezen ─────────────────────────────────
// De lijst komt van `gh repo list`, dus van het account waarmee je bent
// ingelogd. Eén keer ophalen zolang het venster openstaat: het gaat over een
// netwerkverbinding, en de lijst verandert niet terwijl je hem doorleest.
let cloneRepos      = null    // null = nog niet opgehaald
let cloneRepoFout   = ''
let cloneReposBezig = false

function zetRepoKiezer(open) {
  const vak = document.getElementById('f-git-repos')
  if (vak) vak.hidden = !open
  // Het pijltje in de kop wijst naar wat er gebeurt als je klikt.
  const knop = document.getElementById('btn-git-repos')
  if (!knop) return
  knop.classList.toggle('dicht', !open)
  const pijl = knop.querySelector('i')
  pijl?.classList.toggle('ti-chevron-down', !!open)
  pijl?.classList.toggle('ti-chevron-right', !open)
}

async function wisselRepoKiezer() {
  const vak = document.getElementById('f-git-repos')
  if (!vak) return
  if (!vak.hidden) { zetRepoKiezer(false); return }

  zetRepoKiezer(true)
  await laadGithubRepos()
  document.getElementById('f-git-repo-zoek')?.focus()
}

// De adressen die al aan een project hangen. Best effort: alleen mappen die de
// app heeft nagekeken staan in gitStaten, en dat is precies de verzameling waar
// "die heb ik al" over gaat.
// Welke repo's hangen al aan een ander project? Het project dat je op dit
// moment bewerkt telt niet mee: dat filterde zichzelf uit zijn eigen
// keuzelijst, en dan lijkt de repo verdwenen. Na een herstart leek dat over,
// maar alleen omdat gitStaten dan nog leeg is en er niets te filteren valt.
function gekoppeldeRepoAdressen() {
  const uit = []
  for (const p of projects) {
    if (editingId && p.id === editingId) continue
    for (const loc of projectLocaties(p)) {
      const staat = gitStaten[loc.pad]
      if (!staat || !staat.isRepo) continue
      for (const r of (staat.remoteLijst || [])) if (r && r.url) uit.push(r.url)
      if (staat.remoteUrl) uit.push(staat.remoteUrl)
    }
  }
  return uit
}

async function laadGithubRepos(opties = {}) {
  if (cloneReposBezig) return
  if (opties.opnieuw) { cloneRepos = null; cloneRepoFout = '' }
  if (cloneRepos !== null && !cloneRepoFout) { tekenRepoLijst(); return }
  cloneReposBezig = true
  cloneRepoFout = ''
  tekenRepoLijst()
  try {
    // Meerdere accounts op deze pc: vragen om de repos van het GitHub-account
    // dat bij dít CommandDeck-account hoort, niet om die van het actieve.
    const acc = huidigAccount()
    const uitslag = await window.api.gitGhRepos({ gebruiker: (acc && acc.ghGebruiker) || '' })
    if (uitslag && uitslag.ok) { cloneRepos = uitslag.repos || []; cloneRepoFout = '' }
    else { cloneRepos = []; cloneRepoFout = (uitslag && uitslag.reden) || 'mislukt' }
  } catch {
    cloneRepos = []
    cloneRepoFout = 'mislukt'
  } finally {
    cloneReposBezig = false
    tekenRepoLijst()
  }
}

function tekenRepoLijst() {
  const doel = document.getElementById('f-git-repo-lijst')
  if (!doel) return

  if (cloneReposBezig) {
    doel.innerHTML = `<div class="git-repo-melding">${esc(I18N.t('modal.project.gitRepoLaden'))}</div>`
    return
  }

  // Niets kúnnen ophalen is iets anders dan niets hebben: bij het eerste hoort
  // een knop die de oorzaak wegneemt, bij het tweede alleen een zin.
  if (cloneRepoFout) {
    const sleutel = cloneRepoFout === 'geen-gh'       ? 'gitRepoGeenGh'
                  : cloneRepoFout === 'niet-ingelogd' ? 'gitRepoNietIngelogd'
                  :                                     'gitRepoMislukt'
    doel.innerHTML =
      `<div class="git-repo-melding">${esc(I18N.t('modal.project.' + sleutel))}</div>`
      + `<div class="git-repo-acties"><button class="btn-ghost btn-mini" type="button" id="git-repo-inloggen">`
      + `${esc(I18N.t('modal.project.gitRepoInloggen'))}</button></div>`
    doel.querySelector('#git-repo-inloggen')?.addEventListener('click', async () => {
      const klaar = await zorgVoorGithub()
      if (klaar === true) { cloneRepos = null; await laadGithubRepos() }
    })
    return
  }

  const opgehaald = cloneRepos || []
  if (!opgehaald.length) {
    doel.innerHTML = `<div class="git-repo-melding">${esc(I18N.t('modal.project.gitRepoLeeg'))}</div>`
    return
  }

  // Wat al aan een project hangt hoeft niet nóg een keer binnengehaald te
  // worden. Wel zeggen hoeveel er wegvielen, anders zoek je straks naar iets
  // waarvan je zeker weet dat het er is.
  const { lijst: over, verborgen } = GitTools.zonderGekoppelde(opgehaald, gekoppeldeRepoAdressen())
  const staart = verborgen
    ? `<div class="git-repo-melding">${esc(I18N.t('modal.project.gitRepoAl', { aantal: verborgen }))}</div>`
    : ''

  if (!over.length) {
    doel.innerHTML = `<div class="git-repo-melding">${esc(I18N.t('modal.project.gitRepoAllesAl'))}</div>`
    return
  }

  const lijst = GitTools.filterRepos(over, document.getElementById('f-git-repo-zoek')?.value || '')
  if (!lijst.length) {
    doel.innerHTML = `<div class="git-repo-melding">${esc(I18N.t('modal.project.gitRepoNiets'))}</div>` + staart
    return
  }

  const tonen = lijst.slice(0, 60)
  doel.innerHTML = tonen.map((r, i) => `
    <button class="git-repo-rij" type="button" data-repo="${i}" data-sleutel="${esc(GitTools.repoSleutel(r.url))}">
      <i class="ti ${r.prive ? 'ti-lock' : 'ti-book-2'}"></i>
      <span class="git-repo-naam">${esc(r.volledig)}</span>
      ${r.beschrijving ? `<span class="git-repo-om">${esc(r.beschrijving)}</span>` : ''}
    </button>`).join('')
    + (lijst.length > tonen.length
        ? `<div class="git-repo-melding">${esc(I18N.t('modal.project.gitRepoMeer', { aantal: lijst.length - tonen.length }))}</div>`
        : '')
    + staart

  doel.querySelectorAll('[data-repo]').forEach(el => el.addEventListener('click', () => {
    kiesRepo(tonen[parseInt(el.dataset.repo, 10)])
  }))
  markeerGekozenRepo()
}

// Een gekozen repo vult het adres, en de projectnaam als je die nog niet zelf
// hebt getypt. Het venster blijft open: de map hoort er nog bij.
function kiesRepo(repo) {
  if (!repo) return
  const url = document.getElementById('f-git-url')
  if (url) url.value = repo.url
  onCloneUrlInvoer()
  markeerGekozenRepo()
}

// De lijst blijft staan na een keuze — je kunt je bedenken — dus moet eraan te
// zien zijn welke het is. Het adresveld is de waarheid, ook als je zelf typt.
function markeerGekozenRepo() {
  const sleutel = GitTools.repoSleutel(cloneUrlInvoer())
  document.querySelectorAll('#f-git-repo-lijst .git-repo-rij').forEach(el => {
    el.classList.toggle('gekozen', !!sleutel && el.dataset.sleutel === sleutel)
  })
}

let projectOpslaanBezig = false

async function saveProjectModal() {
  if (projectOpslaanBezig) return
  const name   = document.getElementById('f-name').value.trim()
  const device = document.getElementById('f-device').value.trim()
  // Het profiel staat niet meer in dit venster (Instellingen > Git), dus een
  // bewerkte project houdt gewoon wat het had.
  const bestaand = editingId ? projects.find(x => x.id === editingId) : null
  const profielId = (bestaand && bestaand.gitProfiel) || ''
  const locs   = pendingLocs.filter(l => l.path.trim())
  if (!name) { document.getElementById('f-name').focus(); return }
  if (!locs.length) { showToast(I18N.t('project.needLocationToast')); return }

  let cloneAdres = ''
  let cloneDoel = ''
  let cloneOuder = ''
  if (!editingId) {
    const ruw = cloneUrlInvoer()
    if (ruw) {
      cloneAdres = GitTools.normaliseerRepoUrl(ruw)
      if (!cloneAdres) {
        await meldKort(I18N.t('git.link.urlBadTitle'), I18N.t('git.link.urlBadText'))
        document.getElementById('f-git-url')?.focus()
        return
      }
      cloneDoel = GitTools.cloneDoelPad(cloneAdres, locs[0].path)
      cloneOuder = GitTools.cloneOuderPad(cloneDoel)
      if (!cloneDoel || !cloneOuder) {
        await meldKort(I18N.t('git.link.urlBadTitle'), I18N.t('git.clone.geenOuder'))
        return
      }
      locs[0] = { ...locs[0], path: cloneDoel }
      if (!locs[0].label) locs[0].label = 'main'
    }
  }

  if (editingId) {
    const p = projects.find(x => x.id === editingId)
    p.gitProfiel = profielId
    p.name = name; p.icon = selEmoji; p.device = device; p.locations = locs
    p.cmdVisibility = { ...pendingCmdVisibility }
    p.secties = { ...pendingSecties }
    p.customCmds = pendingCustomCmds.map(c => ({ ...c }))
    p.cmdVolgorde = {
      run:   [...(pendingCmdVolgorde.run   || [])],
      tools: [...(pendingCmdVolgorde.tools || [])],
    }
    if (p.activeLocation >= locs.length) p.activeLocation = 0
  } else {
    const vers = { id: 'proj_' + Date.now(), name, icon: selEmoji, device, gitProfiel: profielId, locations: locs, activeLocation: 0, release: false, cmdVisibility: { ...pendingCmdVisibility }, secties: { ...pendingSecties }, customCmds: pendingCustomCmds.map(c => ({ ...c })), cmdVolgorde: { run: [...(pendingCmdVolgorde.run || [])], tools: [...(pendingCmdVolgorde.tools || [])] } }
    // Ook een vers project krijgt zijn mappen: dan staat elk project er
    // hetzelfde bij, ongeacht wanneer het is aangemaakt.
    migreerToolsNaarMap(vers)
    ordenProject(vers)
    projects.push(vers)
  }

  saveProjects(); renderSidebar()

  const vers = !editingId ? projects[projects.length - 1] : null

  // Nieuw project zonder eigen keuze over tools: even kijken of het Flutter is
  if (vers) {
    bepaalToolsVoorProject(vers).then(verborgen => {
      if (verborgen) showToast(I18N.t('project.notFlutterToast'))
      if (activeId === vers.id) vraagProjectHertekenen()
      renderSidebar()
    })
  }

  if (editingId === activeId) vraagProjectHertekenen()
  if (view === 'settings') renderSettingsPanel()
  closeProjectModal()

  if (vers && cloneAdres) {
    projectOpslaanBezig = true
    try {
      selectProject(vers.id)
      meldGitPadenAanMain()
      await haalRepoBinnen(vers, cloneAdres, cloneDoel, cloneOuder)
    } finally {
      projectOpslaanBezig = false
    }
  }
}

// Map binnenhalen en daarna de git-knoppen laten werken: verse staat, koppeling
// nagekeken, profiel in .git/config. Zonder die laatste stappen blijft de
// koppelknop staan alsof er niets is gedownload.
async function haalRepoBinnen(project, adres, doel, ouder) {
  const cmd = GitTools.cloneCommando(adres, doel)
  if (!cmd) return

  await ververesGitStaat(project, true)
  const al = gitStaatVan(project)
  if (!(al && al.isRepo)) {
    await executeCmd(project, cmd, 'git-clone', { cwd: ouder })
    await ververesGitStaat(project, true)
    const staat = gitStaatVan(project)
    if (!staat || !staat.isRepo) {
      await meldKort(I18N.t('git.clone.misluktTitel'), I18N.t('git.clone.misluktTekst'))
      vraagProjectHertekenen()
      return
    }
  }

  await controleerKoppeling(doel, true)
  const profiel = profielVanProject(project)
  if (GitTools.profielGeldig(profiel)) await pasProfielToe(project, profiel)
  bepaalToolsVoorProject(project).then(verborgen => {
    if (verborgen) showToast(I18N.t('project.notFlutterToast'))
    if (activeId === project.id) vraagProjectHertekenen()
    renderSidebar()
  })
  vraagProjectHertekenen()
}

function refreshLocList() {
  const container = document.getElementById('loc-list')
  container.innerHTML = ''
  pendingLocs.forEach((loc, i) => {
    const row = document.createElement('div')
    row.className = 'loc-entry'

    const labelInput = document.createElement('input')
    labelInput.className = 'field'; labelInput.value = loc.label; labelInput.placeholder = I18N.t('location.labelPlaceholder')
    labelInput.oninput = () => { pendingLocs[i].label = labelInput.value }

    const pathInput = document.createElement('input')
    pathInput.className = 'field mono'; pathInput.value = loc.path; pathInput.placeholder = I18N.t('location.pathPlaceholder')
    pathInput.oninput = () => { pendingLocs[i].path = pathInput.value; updateCloneDoelPreview() }

    const browseBtn = document.createElement('button')
    browseBtn.className = 'loc-browse'; browseBtn.title = I18N.t('location.pickFolderTitle')
    browseBtn.innerHTML = '<i class="ti ti-folder-open" style="font-size:14px"></i>'
    browseBtn.onclick = async () => {
      const picked = await window.api.pickFolder()
      if (picked) { pendingLocs[i].path = picked; pathInput.value = picked; updateCloneDoelPreview() }
    }

    const delBtn = document.createElement('button')
    delBtn.className = 'loc-del'; delBtn.title = I18N.t('ctx.delete')
    delBtn.innerHTML = '<i class="ti ti-x" style="font-size:13px"></i>'
    delBtn.onclick = () => { pendingLocs.splice(i, 1); refreshLocList() }

    row.appendChild(labelInput); row.appendChild(pathInput); row.appendChild(browseBtn); row.appendChild(delBtn)
    container.appendChild(row)
  })
}

function addLocEntry() { pendingLocs.push({ label: '', path: '' }); refreshLocList() }

function renderCmdVisibilitySection() {
  const container = document.getElementById('cmdvis-section')
  if (!container) return

  // Het vinkje volgt dezelfde regel als de knoppenrij zelf: geen keuze
  // vastgelegd betekent de standaard van die knop, en die is niet voor
  // iedereen "aan".
  const aan = (id) => cmdZichtbaar({}, id, pendingCmdVisibility)

  const rowHtml = (row, i, sectie, totaal) => {
    const sorteren = cmdvisSorteerModus === sectie
    const wrapOpen = sorteren ? `<div class="cmdvis-sort-item cmd-sort-item" data-cmdvis-index="${i}">${pijlenHtml(i === 0, i === totaal - 1, true)}` : ''
    const wrapClose = sorteren ? '</div>' : ''
    if (row.custom) {
      const c = row.custom
      return `${wrapOpen}<label class="cmdvis-row custom">
      <input type="checkbox" data-cmdvis-id="custom:${esc(c.id)}" ${aan('custom:' + c.id) ? 'checked' : ''} />
      <i class="ti ${esc(c.icon || 'ti-player-play')}"></i>
      <span class="cmdvis-custom-label">${esc(c.label || c.cmd)}</span>
      <span class="cmdvis-custom-cmd mono">${esc(c.cmd)}</span>
      <button class="cmdvis-del" data-del-custom="${esc(c.id)}" title="${esc(I18N.t('cmdvis.removeButtonTitle'))}"><i class="ti ti-x"></i></button>
    </label>${wrapClose}`
    }
    // "standaard uit" erbij zetten is het halve punt van het mechanisme: zonder
    // die tekst is een leeg vinkje niet te onderscheiden van iets dat je zelf
    // ooit hebt uitgezet en vergeten bent.
    const hint = CMD_STANDAARD_UIT.has(row.id)
      ? `<span class="cmdvis-standaard-uit">${esc(I18N.t('cmdvis.defaultOff'))}</span>` : ''
    return `${wrapOpen}<label class="cmdvis-row">
      <input type="checkbox" data-cmdvis-id="${row.id}" ${aan(row.id) ? 'checked' : ''} />
      ${row.kleurCls ? `<span class="prog-kleur-vak ${row.kleurCls}"></span>` : `<i class="ti ${row.icon}"></i>`}
      ${esc(row.label)}${hint}
    </label>${wrapClose}`
  }

  const group = (title, sleutel) => {
    const rows = cmdvisRijen(sleutel)
    const aan = pendingSecties[sleutel] !== false
    const sorteren = cmdvisSorteerModus === sleutel
    return `
    <div class="cmdvis-group ${aan ? '' : 'uit'} ${sorteren ? 'cmdvis-sorteren' : ''}" data-cmdvis-sectie="${sleutel}">
      <div class="cmdvis-group-title">
        <span>${title}</span>
        <label class="toggle-switch" title="${esc(I18N.t('cmdvis.sectionToggleTitle'))}">
          <input type="checkbox" data-sectie="${sleutel}" ${aan ? 'checked' : ''} />
          <span class="toggle-slider"></span>
        </label>
      </div>
      ${sorteren ? `<div class="sort-hint">${esc(I18N.t('project.cmdSortHint'))}</div>` : ''}
      <div class="cmdvis-list">${rows.map((row, i) => rowHtml(row, i, sleutel, rows.length)).join('')}</div>
    </div>
  `}

  container.innerHTML = group(esc(I18N.t('project.buttonsSectionLabel')), 'run')

  container.querySelectorAll('[data-sectie]').forEach(chk => {
    chk.onchange = () => {
      pendingSecties[chk.dataset.sectie] = chk.checked
      renderCmdVisibilitySection()
    }
  })

  container.querySelectorAll('[data-cmdvis-id]').forEach(chk => {
    chk.onchange = () => { pendingCmdVisibility[chk.dataset.cmdvisId] = chk.checked }
  })
  container.querySelectorAll('[data-del-custom]').forEach(btn => {
    btn.onclick = (ev) => {
      ev.preventDefault(); ev.stopPropagation()
      pendingCustomCmds = pendingCustomCmds.filter(c => c.id !== btn.dataset.delCustom)
      renderCmdVisibilitySection()
    }
  })

  ;['run'].forEach(sectie => {
    const groep = container.querySelector(`.cmdvis-group[data-cmdvis-sectie="${sectie}"]`)
    if (!groep) return
    // Dit venster toont elke knop, ook de uitgevinkte -- dus 'alles'. En het
    // project bestaat hier nog niet: modalProjectCtx() geeft elke keer een
    // vers hulpobject, dus de nieuwe volgorde moet er zelf uit gehaald en in
    // pendingCmdVolgorde gezet worden. Zonder dat verdwijnt elke sleep.
    const verplaatsHier = (van, naar) => {
      const ctx = modalProjectCtx()
      if (!verplaatsCmdVolgorde(ctx, sectie, van, naar, 'alles', pendingCmdVisibility)) return
      pendingCmdVolgorde = ctx.cmdVolgorde
      renderCmdVisibilitySection()
    }

    if (cmdvisSorteerModus === sectie) {
      groep.querySelectorAll('.cmdvis-sort-item').forEach((item, index) => {
        item.dataset.cmdvisIndex = String(index)
        maakSleepbaar(item, index, verplaatsHier)
        item.querySelectorAll('.sort-pijl:not(.uit)').forEach(pijl => {
          pijl.onclick = (e) => {
            e.preventDefault(); e.stopPropagation()
            const idx = parseInt(item.dataset.cmdvisIndex)
            verplaatsHier(idx, sortPijlDoel(idx, pijl.dataset.op, true))
          }
        })
      })
    }

    groep.querySelectorAll('.cmdvis-row').forEach(row => {
      let timer = null
      row.onmousedown = (e) => {
        if (e.button !== 0 || e.target.closest('button') || e.target.closest('input')) return
        if (cmdvisSorteerModus === sectie) return
        timer = setTimeout(() => {
          cmdvisSorteerModus = sectie
          showToast(I18N.t('project.cmdSortToast'))
          renderCmdVisibilitySection()
        }, LANG_DRUKKEN_MS)
      }
      row.onmouseup = () => { clearTimeout(timer); timer = null }
      row.onmouseleave = () => { clearTimeout(timer); timer = null }
    })
  })
}

function refreshEmojiPicker() {
  document.querySelectorAll('.emoji-opt').forEach(el => el.classList.toggle('sel', el.textContent === selEmoji))
}

// ── Geschiedenis ──────────────────────────────────────────────────────────────
async function recordHistory(payload) {
  if (settings.history?.enabled === false) return
  historyIndex = -1
  try {
    const h = await window.api.recordHistory(payload)
    if (h && Array.isArray(h.recent)) history = h
  } catch (e) {
    console.error('history opslaan mislukt:', e)
  }
}

// ── Focus ─────────────────────────────────────────────────────────────────────
function isTypingTarget(el) {
  if (!el) return false
  return el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' || el.isContentEditable
}

function anyModalOpen() {
  return [...document.querySelectorAll('.modal-backdrop')].some(m => !m.hidden)
}

// Zet de cursor in het commandoveld zodra dat zinnig is, zodat je nooit
// eerst hoeft te klikken voordat je kunt typen.
function focusTerminalInput() {
  if (anyModalOpen()) return
  // Tijdens een echte terminal-sessie (Claude e.d.) is de balk weg — focus
  // daar dan ook niet naartoe, anders vecht het met xterm.
  if (activeTermId && ptySessies.has(activeTermId)) return
  const input = document.getElementById('term-input')
  if (!input || input.closest('[hidden]')) return
  requestAnimationFrame(() => {
    // Nog een keer kijken. Tussen de aanroep en dit beeldje kan er een venster
    // opengegaan zijn — de pincodevraag bij het opstarten is er zo een — en dan
    // springt de cursor uit dat venster weg terwijl je aan het typen bent.
    if (anyModalOpen()) return
    if (!input.isConnected || input.closest('[hidden]')) return
    input.focus()
    input.selectionStart = input.selectionEnd = input.value.length
  })
}

// Overal in de app beginnen te typen: toetsaanslagen die nergens anders heen
// gaan, worden doorgestuurd naar het commandoveld.
function setupGlobalTypeCapture() {
  document.addEventListener('keydown', (e) => {
    if (e.ctrlKey || e.metaKey || e.altKey) return
    if (isTypingTarget(document.activeElement)) return
    if (anyModalOpen()) return
    // Claude / pty heeft het toetsenbord; niet naar het (verborgen) commandoveld.
    if (activeTermId && ptySessies.has(activeTermId) && termTab === 'output') return

    // Sta je in de verkenner, dan gaat typen naar het filterveld en niet naar
    // de commandoregel. Enter en de pijltjes laten we daar met rust; die horen
    // bij het openen van wat je hebt aangewezen.
    if (termTab === 'browser') {
      const filter = brEl('br-filter')
      if (!filter) return
      if (e.key.length === 1) {
        e.preventDefault()
        filter.focus()
        filter.value += e.key
        filter.dispatchEvent(new Event('input', { bubbles: true }))
      }
      return
    }

    // Verborgen panelen hebben hun id bevroren, dus #term-input is het
    // zichtbare commandoveld.
    const input = document.getElementById('term-input')
    if (!input || input.closest('[hidden]')) return

    if (e.key.length === 1) {
      e.preventDefault()
      input.focus()
      input.value += e.key
      input.dispatchEvent(new Event('input', { bubbles: true }))
    } else if (e.key === 'Backspace') {
      e.preventDefault()
      input.focus()
      input.value = input.value.slice(0, -1)
      input.dispatchEvent(new Event('input', { bubbles: true }))
    } else if (e.key === 'ArrowUp' || e.key === 'ArrowDown' || e.key === 'Enter') {
      e.preventDefault()
      input.focus()
      input.dispatchEvent(new KeyboardEvent('keydown', { key: e.key, bubbles: true, cancelable: true }))
    }
  })
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function saveProjects() { window.api.saveProjects(projects) }
function esc(str) { return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;') }

let toastTimer = null
function showToast(msg) {
  let toast = document.getElementById('toast')
  if (!toast) {
    toast = document.createElement('div'); toast.id = 'toast'; toast.className = 'toast'
    toast.innerHTML = '<i class="ti ti-check" style="font-size:14px"></i> <span id="toast-msg"></span>'
    document.body.appendChild(toast)
  }
  document.getElementById('toast-msg').textContent = msg
  toast.classList.add('show')
  clearTimeout(toastTimer)
  toastTimer = setTimeout(() => toast.classList.remove('show'), 2200)
}

// Los consolevenster op een UNC-pad: main geeft viaLetter mee omdat er geen
// uitvoerpaneel is voor de melding die runCommandOnce wél in de terminal zet.
async function openCmdMetMelding(arg) {
  const r = await window.api.openCmd(arg)
  if (r && r.viaLetter) showToast(I18N.t('cmd.uncViaLetterToast'))
  return r
}

function batToastNaStart(r, gewoneSleutel) {
  if (r && r.viaLetter) showToast(I18N.t('cmd.uncViaLetterToast'))
  else showToast(I18N.t(gewoneSleutel))
}
