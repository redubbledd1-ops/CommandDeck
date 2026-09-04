const { app, BrowserWindow, ipcMain, dialog, shell, safeStorage } = require('electron')
const path = require('path')
const fs = require('fs')
const os = require('os')
const crypto = require('crypto')
const { spawn, execFileSync, execFile } = require('child_process')
const { analyzeFailure, isAutofixEligible, isFlutterCommand,
        looksLikeFlutterMissing, FLUTTER_MISSING_HELP } = require('./install-fixer')
const { parseFlutterAndroidDevices } = require('./flutter-devices')
const { buildSed } = require('./bat-exe')
const { BUILTIN_COMMANDS } = require('./cmd-library')
const { psCommandLaunch, psWindowLaunch } = require('./ps-launch')
const { EDITORS } = require('./editor-catalog')
const GitTools = require('./git-tools')
const Accounts = require('./accounts')
const { maakAi } = require('./ai-runtime')
const { SUPPORTED_LANGUAGES } = require('./locales/languages')
const { isArchief, isZipArchief, leesZip, pakZipUit,
        zoekHulpprogramma, leesViaHulpprogramma, pakUitViaHulpprogramma, schrijfZip } = require('./archive')

// Oude installaties heetten flutter-launcher; userData lag in %APPDATA%\flutter-launcher.
// Eenmalig meenemen zodat projecten/instellingen niet zoekraken na de hernoeming.
;(function migrateUserDataFromLegacyName() {
  try {
    const nieuw = app.getPath('userData')
    const oud = path.join(path.dirname(nieuw), 'flutter-launcher')
    if (path.resolve(nieuw) === path.resolve(oud)) return
    if (!fs.existsSync(oud)) return
    fs.mkdirSync(nieuw, { recursive: true })
    const heeftNieuw = fs.readdirSync(nieuw).some(n => !n.startsWith('.'))
    if (heeftNieuw) return
    for (const naam of fs.readdirSync(oud)) {
      const van = path.join(oud, naam)
      const naar = path.join(nieuw, naam)
      if (fs.existsSync(naar)) continue
      try { fs.renameSync(van, naar) }
      catch {
        try { fs.cpSync(van, naar, { recursive: true }) } catch {}
      }
    }
  } catch {}
})()

const DATA_FILE     = path.join(app.getPath('userData'), 'projects.json')
const SETTINGS_FILE = path.join(app.getPath('userData'), 'settings.json')
const HISTORY_FILE  = path.join(app.getPath('userData'), 'history.json')
const LOCALES_DIR   = path.join(__dirname, 'locales')

// ── Taal ─────────────────────────────────────────────────────────────────────
// Windows/systeemtaal (bv. 'nl-NL') matchen tegen de ondersteunde talen. Exacte
// code wint (voor varianten als 'pt-BR'), anders de hoofdtaal (nl-BE -> nl).
// Geen match: Engels als fallback, nooit crashen op een onbekende locale.
function detectSystemLanguage() {
  const sysLocale = (typeof app.getLocale === 'function' ? app.getLocale() : 'en').toLowerCase()
  const exact = SUPPORTED_LANGUAGES.find(l => l.code.toLowerCase() === sysLocale)
  if (exact) return exact.code
  const primary = sysLocale.split('-')[0]
  const partial = SUPPORTED_LANGUAGES.find(l => l.code.toLowerCase().split('-')[0] === primary)
  return partial ? partial.code : 'en'
}
function loadLocaleFile(lang) {
  try {
    const p = path.join(LOCALES_DIR, `${lang}.json`)
    if (fs.existsSync(p)) return JSON.parse(fs.readFileSync(p, 'utf8'))
  } catch {}
  return null
}
ipcMain.handle('i18n:languages', () => SUPPORTED_LANGUAGES)
ipcMain.handle('i18n:detect',    () => detectSystemLanguage())
ipcMain.handle('i18n:load',      (_, lang) => loadLocaleFile(lang) || loadLocaleFile('en') || {})

// ── Window ───────────────────────────────────────────────────────────────────
let win
let isQuittingForUpdate = false
function createWindow() {
  win = new BrowserWindow({
    width: 1050, height: 680, minWidth: 820, minHeight: 520,
    frame: false, backgroundColor: '#0a0a0a',
    icon: path.join(__dirname, 'assets', 'icon.ico'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  })
  win.loadFile('index.html')

  // Afsluitcontrole. Het sluiten wordt één keer tegengehouden; de renderer
  // kijkt de projecten na, stelt per project een vraag en meldt zich terug.
  // Zo lang wachten als nodig — behalve als er helemaal geen antwoord komt,
  // want dan zou het venster onsluitbaar zijn. Vandaar de noodrem. Die wordt
  // bij elke nieuwe vraag en bij commit & push opnieuw gezet, zodat meerdere
  // projecten achter elkaar aan de beurt komen.
  win.on('close', (e) => {
    if (afsluitenBevestigd) return
    if (actieveInstellingen().git.afsluiten === 'uit') return
    if (!win.webContents || win.webContents.isDestroyed()) return

    e.preventDefault()
    startAfsluitControle()
  })

  // Windows afsluiten of uitloggen. Windows vraagt eerst toestemming
  // (WM_QUERYENDSESSION) en geeft daarna nog een paar seconden. Sinds Electron
  // 34 kun je op die vraag 'nee' zeggen: dan zet Windows het afsluiten stil en
  // toont het scherm "deze app verhindert het afsluiten", met CommandDeck erbij
  // en een knop om het tóch te doen. Dat is precies de ruimte die we nodig
  // hebben — vragen wat er met niet-weggezet werk moet gebeuren, in plaats van
  // vijf seconden en een stash.
  //
  // Alleen tegenhouden als er écht iets te redden valt. Iemand ophouden bij het
  // afsluiten terwijl alles al gepusht is, is precies het soort app waar mensen
  // een hekel aan krijgen.
  win.on('query-session-end', (e) => {
    if (afsluitenBevestigd) return          // je koos zelf al 'toch afsluiten'
    if (!heeftWerkOmTeRedden()) return
    e.preventDefault()
    // Wij zijn nu degene die het ophoudt, dus moeten we ook in beeld staan.
    try {
      if (win && !win.isDestroyed()) {
        if (win.isMinimized()) win.restore()
        win.show()
        win.focus()
      }
    } catch {}
    startAfsluitControle('windows')
  })
}

// Is er werk dat alleen op deze pc staat? Dit moet synchroon kunnen: op het
// moment dat Windows het vraagt is er geen tijd om de renderer iets te vragen.
// Vandaar de lijst die de renderer bijhoudt (zie git:projecten).
function heeftWerkOmTeRedden() {
  try {
    const instelling = actieveInstellingen().git.afsluiten
    if (instelling === 'uit') return false
    // Hoort die lijst nog bij wie er nu ingelogd is? Zo niet, dan weten we het
    // niet en houden we niemand op.
    if (gitProjectenVoorAfsluiten.accountId !== accountStand().actiefAccount) return false
    return GitTools.teVragenProjecten(gitProjectenVoorAfsluiten.lijst, instelling).length > 0
  } catch { return false }
}

let afsluitenBevestigd = false
let afsluitenGevraagd = false
let afsluitNoodrem = null
const AFSLUIT_NOODREM_MS = 20 * 1000

function startAfsluitNoodrem(ms) {
  if (afsluitNoodrem) { clearTimeout(afsluitNoodrem); afsluitNoodrem = null }
  const wacht = Math.max(AFSLUIT_NOODREM_MS, Number(ms) || AFSLUIT_NOODREM_MS)
  afsluitNoodrem = setTimeout(() => {
    afsluitenBevestigd = true
    try { if (win && !win.isDestroyed()) win.close() } catch {}
  }, wacht)
}

function startAfsluitControle(aanleiding) {
  if (afsluitenBevestigd) return
  if (actieveInstellingen().git.afsluiten === 'uit') return
  if (!win || !win.webContents || win.webContents.isDestroyed()) return

  if (afsluitenGevraagd) {
    // Al bezig (volgend project, commit & push). Niet opnieuw starten,
    // wél de noodrem openhouden zodat wij zelf niet afkappen.
    startAfsluitNoodrem(60 * 1000)
    return
  }
  afsluitenGevraagd = true
  // De aanleiding gaat mee: bij een Windows-afsluiten dat wij hebben stilgezet
  // hoort er achteraf iets anders te gebeuren dan bij het kruisje.
  win.webContents.send('git:controleerVoorAfsluiten', { aanleiding: aanleiding || 'venster' })
  startAfsluitNoodrem(AFSLUIT_NOODREM_MS)
}

ipcMain.on('git:afsluitenMag', () => {
  if (afsluitNoodrem) { clearTimeout(afsluitNoodrem); afsluitNoodrem = null }
  afsluitenBevestigd = true
  if (win && !win.isDestroyed()) win.close()
})

// De gebruiker koos "toch blijven": alles terugdraaien zodat een volgende
// poging opnieuw wordt nagekeken.
ipcMain.on('git:afsluitenAfgebroken', () => {
  if (afsluitNoodrem) { clearTimeout(afsluitNoodrem); afsluitNoodrem = null }
  afsluitenGevraagd = false
})

// Renderer is nog bezig (volgende project, commitvenster, push). Zonder deze
// tik kapt de noodrem af na één vraag, en komen de andere projecten nooit.
ipcMain.on('git:afsluitHartslag', (_, extra) => {
  if (!afsluitenGevraagd || afsluitenBevestigd) return
  startAfsluitNoodrem(extra && extra.ms)
})
app.whenReady().then(() => {
  // Eén keer blokkerend, vóór het venster er is: daarna heeft elke git- of
  // gh-aanroep meteen een pad en hoeft er nooit meer gewacht te worden.
  try { windowsPathNu() } catch {}
  createWindow()
})

// De AI-kant registreert zijn eigen ipc-handlers. Alles wat dienst-specifiek is
// staat in ai-providers.js; hier geven we alleen door waar het venster en de
// gebruikersmap zitten.
maakAi({
  ipcMain,
  getWin: () => win,
  userDataDir: app.getPath('userData'),
  safeStorage,
})
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit() })

// Een lopend commando (flutter run, een build) houdt bestanden vast. Bij het
// afsluiten — en zeker vlak voor een update-build — moet dat proces mee weg.
app.on('before-quit', () => {
  if (activeProc) { try { activeProc.kill() } catch {} activeProc = null }
  if (isQuittingForUpdate) { try { killFlutterProcesses() } catch {} }
})

// ── Window controls ──────────────────────────────────────────────────────────
ipcMain.on('win-minimize', () => win.minimize())
ipcMain.on('win-maximize', () => win.isMaximized() ? win.unmaximize() : win.maximize())
ipcMain.on('win-close',    () => win.close())

// ── Projects ─────────────────────────────────────────────────────────────────
// Alleen gebruikt bij een échte eerste start (geen projects.json).
// Bestaande installaties / updates lezen gewoon %APPDATA%/commanddeck/projects.json.
const DEFAULT_PROJECTS = [
  {
    id: 'default_flutter',
    name: 'Default Flutter Project',
    icon: '📱',
    device: '',
    locations: [{ label: 'main', path: '' }],
    activeLocation: 0,
    release: false,
  },
]

// Elk account heeft zijn eigen projectenlijst. Het eerste account erft
// projects.json, zodat een bestaande installatie niets kwijtraakt.
function projectPad(accountId) {
  const st = accountStand()
  const naam = Accounts.projectBestand(accountId || st.actiefAccount, st.accounts[0] && st.accounts[0].id)
  return path.join(app.getPath('userData'), naam)
}

function loadProjects(accountId) {
  const bestand = projectPad(accountId)
  try {
    if (fs.existsSync(bestand)) {
      const data = JSON.parse(fs.readFileSync(bestand, 'utf8'))
      if (Array.isArray(data) && data.length > 0) return data
    }
  } catch {}
  // Een nieuw account begint leeg, niet met de voorbeeldprojecten: die horen
  // bij een verse installatie, niet bij een collega die erbij komt.
  const st = accountStand()
  const isEerste = !st.accounts.length || (accountId || st.actiefAccount) === st.accounts[0].id
  return isEerste ? DEFAULT_PROJECTS : []
}

function saveProjects(projects, accountId) {
  const bestand = projectPad(accountId)
  fs.mkdirSync(path.dirname(bestand), { recursive: true })
  fs.writeFileSync(bestand, JSON.stringify(projects, null, 2))
}
ipcMain.handle('projects:load', () => loadProjects())
ipcMain.handle('projects:save', (_, p) => { saveProjects(p); return true })

// ── Settings ─────────────────────────────────────────────────────────────────
const DEFAULT_SETTINGS = {
  // null = nog niet gekozen; wordt bij eerste start ingevuld met de Windows-taal
  language: null,
  autoFix: { enabled: true },
  // Geschiedenis / commando-woordenboek. Standaard: alles onthouden, ook na afsluiten.
  history: {
    enabled:     true,   // acties überhaupt onthouden
    persist:     true,   // false = alleen deze sessie (niets naar schijf)
    maxRecent:   300,    // hoeveel losse uitvoeringen bewaard blijven voor de pijltjes
    maxEntries:  2000,   // hoeveel unieke commando's in het woordenboek passen
  },
  // Losse CMD-sectie: onthoudt de laatst gebruikte map, ook na afsluiten
  // Werkmap van de losse cmd-sectie, plus welke snelkoppelingen daar staan
  // en in welke volgorde. Die rij hangt niet aan een project, dus dat hoort
  // hier en niet in projects.json.
  cmd: { cwd: '', recentCwds: [], quickUit: [], quickVolgorde: [] },
  // Losse PowerShell-sectie: eigen werkmap, los van cmd
  ps: {
    cwd: '', recentCwds: [], quickUit: [], quickVolgorde: [],
    exe: 'powershell', noProfile: true, executionPolicy: '',
  },
  // Mapgroottes in de verkenner op de achtergrond uitrekenen
  mapGroottes: true,
  // Afsluitcontrole op niet-vastgelegd of niet-gepusht werk.
  //   uit          niets doen
  //   waarschuwen  vragen bij het sluiten van het venster (standaard)
  //   stashen      idem, plus bij een Windows-shutdown automatisch stashen
  // profielen: [{ id, label, naam, email, ghGebruiker, inloggen }] — zie
  // "Identiteit en accounts" in git-tools.js
  git: { afsluiten: 'waarschuwen', fetchBijOpenen: true, pollSec: 30, profielen: [], standaardProfiel: '' },
  // Accounts binnen de app: gescheiden inhoud, geen beveiliging. Zie accounts.js.
  accounts: [],
  actiefAccount: '',
  perAccount: {},
  // Volgorde van de knoppen onder het kopje "opdrachten" in de zijbalk
  navVolgorde: ['cmd', 'ps', 'bat', 'dict'],
  // Map met de broncode; wordt automatisch gevonden, hier alleen onthouden
  sourceDir: '',
  // Waar je gebleven was: wordt bij het opstarten weer geopend
  lastView: { view: 'project', projectId: '' },
  // De bat-sectie onthoudt zijn eigen map, los van de cmd-sectie
  batCwd: '',
  batRecentCwds: [],
  // Onthouden voorkeuren voor nieuwe bat-bestanden
  bat: {
    cd: true,            // eerst naar de werkmap springen
    stopOnError: true,   // na elk commando de foutcode controleren
    pause: 'always',     // 'always' | 'onerror' | 'never'
    admin: false,        // zichzelf herstarten met beheerdersrechten
    log: false,          // uitvoer wegschrijven naar een logbestand
    timer: false,        // begin- en eindtijd tonen
    echo: false,         // commando's tonen tijdens het draaien
    hidden: false,       // volledig op de achtergrond draaien
    icon: true,          // bij het maken van een exe om een icoon vragen
    title: '',           // titel van het venster
  },
  editors: {
    cursor:        { enabled: false, path: 'cursor' },
    claudeCode:    { enabled: false, path: 'claude' },
    vscode:        { enabled: false, path: 'code'   },
    androidStudio: { enabled: false, path: 'D:\\Program Files\\Android\\Android Studio\\bin\\studio64.exe' },
    claudeDesktop: { enabled: false, path: '' },
    custom:        { enabled: false, path: '', label: '' },
  },
  // Eigen editors: zoveel als je wilt, elk met een eigen naam en pad
  customEditors: [],
  // Per project (en voor de cmd-sectie) of je output of de verkenner open had
  termTabs: {},
  // Per project: output en verkenner tegelijk, naast of onder elkaar
  termSplits: {},
  // Per project (en voor cmd/ps) de laatst geopende map in de verkenner
  verkennerPaden: {},
  // Hoe de verkenner eruitziet en waarop hij sorteert
  verkenner: {
    weergave: 'lijst-s',   // zie WEERGAVES in renderer.js
    sorteer:  'naam',      // naam | grootte | type | datum
    richting: 'op',        // op | af
    diep:     true,        // het filter ook door de submappen laten lopen
  },
  // Tekstgrootte van het uitvoerpaneel (index in OUTPUT_MATEN)
  outputMaat: 1,
  // Zijbalk: volgorde van de secties en of ze open staan
  zijbalkVolgorde: ['cmd', 'dezepc', 'projecten'],
  zijbalkOpen: { cmd: true, dezepc: true, projecten: true },
  // Breedte van de linker zijbalk in pixels; de greep ernaast is te verslepen
  zijbalkBreedte: 210,
  // Max. hoogte van de "deze pc"-sectie in pixels; null = geen limiet
  dezepcMaxHoogte: null,
  // Welke takken van de boom onder "deze pc" open staan. De schijven zelf
  // staan altijd in beeld; hier bewaren we alleen opengeklapte mappen.
  boomOpen: [],
  // Netwerkmappen (\\server\share) die naast de schijven in de boom horen.
  // Die hebben geen schijfletter, dus de A-Z-ronde in fs:listDrives vindt ze
  // nooit; ze moeten hier staan of ze bestaan niet voor de app.
  netwerkWortels: [],
  // Gevonden editors die je hebt weggeklikt; daar vragen we niet meer naar
  editorsGeweigerd: [],
  editorsGezocht: false,
  // Thema's die je zelf hebt aangemaakt in het woordenboek. Een thema is een
  // label op een commando, dus een leeg thema zou anders meteen weer weg zijn.
  dictThemas: [],
  // Wat het prullenbakje bij een sectiekop doet: '' = eerste keer vragen,
  // 'individueel' = alleen hier verbergen, 'globaal' = overal weghalen.
  knopVerwijderen: '',
  // Praten met een AI-dienst vanuit het uitvoervenster. De sleutels staan
  // bewust niet hier maar in ai-keys.json (zie ai-runtime.js).
  ai: {
    provider: 'claude',      // welke dienst standaard aan staat
    modellen: {},            // per dienst het gekozen model
    endpoints: {},           // per dienst een afwijkend adres (proxy, lokaal)
    systeem: '',             // eigen systeemprompt
    mapInSysteem: true,      // de werkmap meegeven, zodat antwoorden kloppen
    maxTokens: 4096,
  },
}
function gebruikerHome() {
  try {
    const home = os.homedir()
    if (home && fs.existsSync(home)) return home
  } catch {}
  return ''
}

// Nieuwe installatie (of nog nooit een map gekozen): starten in C:\Users\<naam>,
// niet met een lege dropdown die eerst om een map vraagt. Een bestaande keuze
// blijft staan.
function vulLegeWerkmap(sectie) {
  const home = gebruikerHome()
  if (!home || !sectie || sectie.cwd) return { sectie, gewijzigd: false }
  const recent = (sectie.recentCwds || []).filter(Boolean)
  return {
    sectie: {
      ...sectie,
      cwd: home,
      recentCwds: [home, ...recent.filter(p => p !== home)].slice(0, 12),
    },
    gewijzigd: true,
  }
}

function loadSettings() {
  let merged = null
  try {
    if (fs.existsSync(SETTINGS_FILE)) {
      const s = JSON.parse(fs.readFileSync(SETTINGS_FILE, 'utf8'))
      merged = {
        ...DEFAULT_SETTINGS,
        ...s,
        autoFix: { ...DEFAULT_SETTINGS.autoFix, ...(s.autoFix || {}) },
        history: { ...DEFAULT_SETTINGS.history, ...(s.history || {}) },
        cmd:      { ...DEFAULT_SETTINGS.cmd,      ...(s.cmd      || {}) },
        ps:       { ...DEFAULT_SETTINGS.ps,       ...(s.ps       || {}) },
        lastView: { ...DEFAULT_SETTINGS.lastView, ...(s.lastView || {}) },
        bat:      { ...DEFAULT_SETTINGS.bat,      ...(s.bat      || {}) },
        git:      { ...DEFAULT_SETTINGS.git,      ...(s.git      || {}) },
        editors: { ...DEFAULT_SETTINGS.editors, ...(s.editors || {}) },
        customEditors: migreerEigenEditors(s),
        termTabs: { ...DEFAULT_SETTINGS.termTabs, ...(s.termTabs || {}) },
        termSplits: { ...DEFAULT_SETTINGS.termSplits, ...(s.termSplits || {}) },
        verkennerPaden: { ...DEFAULT_SETTINGS.verkennerPaden, ...(s.verkennerPaden || {}) },
        editorsGeweigerd: Array.isArray(s.editorsGeweigerd) ? s.editorsGeweigerd : [],
        netwerkWortels: Array.isArray(s.netwerkWortels) ? s.netwerkWortels : [],
        dictThemas: Array.isArray(s.dictThemas) ? s.dictThemas : [],
        ai: { ...DEFAULT_SETTINGS.ai, ...(s.ai || {}),
              modellen:  { ...(s.ai && s.ai.modellen  || {}) },
              endpoints: { ...(s.ai && s.ai.endpoints || {}) } },
      }
    }
  } catch {}
  if (!merged) merged = { ...DEFAULT_SETTINGS }
  let moetOpslaan = false
  // Eerste start (of oud settings-bestand zonder taalveld): Windows-taal overnemen
  // en meteen wegschrijven, zodat dit maar één keer hoeft te gebeuren.
  if (!merged.language || !SUPPORTED_LANGUAGES.some(l => l.code === merged.language)) {
    merged.language = detectSystemLanguage()
    moetOpslaan = true
  }
  const cmdVul = vulLegeWerkmap(merged.cmd)
  merged.cmd = cmdVul.sectie
  if (cmdVul.gewijzigd) moetOpslaan = true
  const psVul = vulLegeWerkmap(merged.ps)
  merged.ps = psVul.sectie
  if (psVul.gewijzigd) moetOpslaan = true
  if (moetOpslaan) saveSettings(merged)
  return merged
}
// Vroeger was er één vaste 'eigen editor'. Die verhuist nu naar de lijst, zodat
// niemand zijn instelling kwijtraakt bij het bijwerken.
function migreerEigenEditors(s) {
  const lijst = Array.isArray(s.customEditors) ? s.customEditors.slice() : []
  const oud = s.editors && s.editors.custom
  if (oud && oud.path && !lijst.some(e => e.path === oud.path)) {
    lijst.unshift({
      id: 'ce_migratie',
      label: oud.label || 'Eigen editor',
      path: oud.path,
      enabled: oud.enabled !== false,
    })
  }
  return lijst
}

function saveSettings(s) {
  fs.mkdirSync(path.dirname(SETTINGS_FILE), { recursive: true })
  fs.writeFileSync(SETTINGS_FILE, JSON.stringify(s, null, 2))
}
// ── Accounts ─────────────────────────────────────────────────────────────────
// De accountlijst en welk account actief is, staan in settings.json. Bij een
// bestaande installatie is er nog geen lijst; dan maken we er één van wat er
// al ligt, zodat niemand iets hoeft over te zetten.
function accountStand() {
  const s = loadSettings()
  const st = Accounts.migreer(s)

  // De git-gegevens stonden vroeger in een losse profielenlijst naast het
  // account. Die halen we eenmalig naar binnen: het account ís de identiteit,
  // en niemand hoeft iets opnieuw in te vullen.
  const metGit = st.accounts.map(a => {
    if (Accounts.gitCompleet(a)) return a
    const eigen = Accounts.samengevoegd(s, a.id).git || {}
    const lijst = Array.isArray(eigen.profielen) ? eigen.profielen : []
    const std = lijst.find(p => p && p.id === eigen.standaardProfiel) || lijst[0] || null
    return Accounts.neemProfielOver(a, std)
  })
  const veranderd = st.gemigreerd || metGit.some((a, i) => a !== st.accounts[i])
  if (veranderd) {
    saveSettings({ ...s, accounts: metGit, actiefAccount: st.actiefAccount })
  }
  return { ...st, accounts: metGit }
}

// Wat de renderer krijgt: de gedeelde instellingen met de persoonlijke stukken
// van het actieve account eroverheen. Zo werkt een vers account meteen goed.
function actieveInstellingen() {
  const st = accountStand()
  return Accounts.samengevoegd(loadSettings(), st.actiefAccount)
}

ipcMain.handle('settings:load', () => actieveInstellingen())
// De accountlijst hoort bij het main-proces en komt nooit uit het venster
// terug. Het venster heeft er een kopie van die al verouderd kan zijn — sluit
// je een account af of verwijder je er een, dan stond hij in die kopie nog. De
// eerstvolgende bewaaractie (en `lastView` schrijft bij elke schermwissel)
// zette die oude lijst er dan weer overheen, en na een herstart was het
// verwijderde account terug. Dit is waar dat gebeurde.
const ALLEEN_VAN_MAIN = ['accounts', 'actiefAccount', 'perAccount']

ipcMain.handle('settings:save', (_, s) => {
  // De persoonlijke stukken (git) gaan naar het account, de rest is gedeeld.
  const st = accountStand()
  const opSchijf = loadSettings()

  const binnen = { ...(s || {}) }
  for (const sleutel of ALLEEN_VAN_MAIN) delete binnen[sleutel]

  const basis = {
    ...binnen,
    accounts: st.accounts,
    actiefAccount: st.actiefAccount,
    perAccount: opSchijf.perAccount || {},
  }
  saveSettings(Accounts.metAccountInstellingen(basis, st.actiefAccount, binnen))
  return true
})

// ── Pincode ──────────────────────────────────────────────────────────────────
// Gehasht met scrypt en een eigen salt per account, zodat de code niet leesbaar
// in settings.json staat. Dat is het maximum dat hier zin heeft: wie bij dat
// bestand kan, kan een viercijferige code alsnog in een oogwenk raden. Het slot
// is bedoeld tegen vergissingen, niet tegen inbraak — en dat zegt de app er ook
// bij.
function maakPin(pin) {
  const salt = crypto.randomBytes(16).toString('hex')
  const hash = crypto.scryptSync(String(pin), salt, 32).toString('hex')
  return { salt, hash }
}

function pinKlopt(account, pin) {
  if (!Accounts.heeftPin(account)) return false
  if (!Accounts.geldigePin(pin)) return false
  try {
    const proef = crypto.scryptSync(String(pin), account.pin.salt, 32)
    const echt = Buffer.from(account.pin.hash, 'hex')
    // Vergelijken in vaste tijd: anders lekt de duur van de vergelijking iets
    // over hoeveel er klopte.
    return proef.length === echt.length && crypto.timingSafeEqual(proef, echt)
  } catch { return false }
}

// De renderer krijgt de accounts nooit mét hash en salt: die hoeven daar niet
// te zijn, en wat er niet is kan ook niet per ongeluk in beeld komen.
const zonderGeheim = (a) => ({
  id: a.id, naam: a.naam, icoon: a.icoon, heeftPin: Accounts.heeftPin(a),
  gitNaam: a.gitNaam || '', gitEmail: a.gitEmail || '', ghGebruiker: a.ghGebruiker || '',
  gitCompleet: Accounts.gitCompleet(a),
})

ipcMain.handle('accounts:list', () => {
  const st = accountStand()
  return {
    accounts: st.accounts.map(zonderGeheim),
    actief: st.actiefAccount,
    pinNodig: Accounts.pinNodig(st.accounts),
    zonderPin: Accounts.accountsZonderPin(st.accounts).map(a => a.id),
  }
})

ipcMain.handle('accounts:setPin', (_, { id, pin } = {}) => {
  const st = accountStand()
  if (!st.accounts.some(a => a.id === id)) return { ok: false, reden: 'onbekend' }
  if (!Accounts.geldigePin(pin)) return { ok: false, reden: 'pin-ongeldig' }
  const s = loadSettings()
  saveSettings({ ...s, accounts: st.accounts.map(a => a.id === id ? { ...a, pin: maakPin(pin) } : a) })
  return { ok: true }
})

ipcMain.handle('accounts:check', (_, { id, pin } = {}) => {
  const st = accountStand()
  const a = st.accounts.find(x => x.id === id)
  if (!a) return { ok: false, reden: 'onbekend' }
  // Geen pincode gezet en er is er maar één: dan valt er niets te controleren.
  if (!Accounts.heeftPin(a)) return { ok: !Accounts.pinNodig(st.accounts), reden: 'geen-pin' }
  return { ok: pinKlopt(a, pin) }
})

ipcMain.handle('accounts:add', (_, { naam, icoon, pin, gitNaam, gitEmail, ghGebruiker } = {}) => {
  const st = accountStand()
  if (!Accounts.naamVrij(st.accounts, naam)) return { ok: false, reden: 'naam-bezet' }
  // Aanmaken kan alleen mét pincode. Achteraf toevoegen zou betekenen dat er
  // een account bestaat waar iedereen zo in kan, precies zolang niemand eraan
  // denkt hem te zetten.
  if (!Accounts.geldigePin(pin)) return { ok: false, reden: 'pin-ongeldig' }
  const nieuw = { ...Accounts.maakAccount({ naam, icoon, gitNaam, gitEmail, ghGebruiker }), pin: maakPin(pin) }
  if (!Accounts.accountGeldig(nieuw)) return { ok: false, reden: 'naam-leeg' }
  const s = loadSettings()
  saveSettings({ ...s, accounts: [...st.accounts, nieuw], actiefAccount: st.actiefAccount })
  return { ok: true, account: zonderGeheim(nieuw) }
})

ipcMain.handle('accounts:setGit', (_, { id, gitNaam, gitEmail, ghGebruiker } = {}) => {
  const st = accountStand()
  if (!st.accounts.some(a => a.id === id)) return { ok: false, reden: 'onbekend' }
  const s = loadSettings()
  saveSettings({
    ...s,
    accounts: st.accounts.map(a => a.id === id
      ? { ...a, ...Accounts.maakAccount({ ...a, gitNaam, gitEmail, ghGebruiker }) , pin: a.pin }
      : a),
  })
  return { ok: true }
})

ipcMain.handle('accounts:rename', (_, { id, naam } = {}) => {
  const st = accountStand()
  if (!st.accounts.some(a => a.id === id)) return { ok: false, reden: 'onbekend' }
  if (!Accounts.naamVrij(st.accounts, naam, id)) return { ok: false, reden: 'naam-bezet' }
  const s = loadSettings()
  saveSettings({ ...s, accounts: st.accounts.map(a => a.id === id ? { ...a, naam: Accounts.schoneNaam(naam) } : a) })
  return { ok: true }
})

ipcMain.handle('accounts:switch', (_, arg) => {
  const { id, pin } = (typeof arg === 'string') ? { id: arg, pin: '' } : (arg || {})
  const st = accountStand()
  const doel = st.accounts.find(a => a.id === id)
  if (!doel) return { ok: false, reden: 'onbekend' }
  // De controle hoort hier en niet alleen in het venster: een scherm is een
  // scherm, dit is de plek waar de projecten vandaan komen.
  if (Accounts.pinNodig(st.accounts) && !pinKlopt(doel, pin)) return { ok: false, reden: 'pin-fout' }
  saveSettings({ ...loadSettings(), actiefAccount: id })
  return { ok: true, projects: loadProjects(id), settings: Accounts.samengevoegd(loadSettings(), id) }
})

// Verwijderen laat het projectbestand met rust. Dat is bewust: het is de enige
// plek waar iemands werk staat, en een verkeerd aangeklikt account mag geen
// projectenlijst kosten. De map opruimen doe je zelf.
//
// Je kunt alleen het account weghalen waar je zelf op ingelogd bent, en je
// pincode moet er opnieuw bij. Dat is geen slot tegen inbraak — zie de uitleg
// bij de pincode — maar het houdt wel tegen dat iemand die even achter je pc
// zit het account van een ander wegklikt. De controle staat hier en niet in het
// venster: een scherm is een scherm, dit is waar het bestand geschreven wordt.
ipcMain.handle('accounts:remove', (_, arg) => {
  const { id, pin } = (typeof arg === 'string') ? { id: arg, pin: '' } : (arg || {})
  const st = accountStand()

  const doel = st.accounts.find(a => a.id === id)
  if (!doel) return { ok: false, reden: 'onbekend' }
  if (id !== st.actiefAccount) return { ok: false, reden: 'niet-jezelf' }
  if (Accounts.heeftPin(doel) && !pinKlopt(doel, pin)) return { ok: false, reden: 'pin-fout' }

  const na = Accounts.naVerwijderen(st.accounts, st.actiefAccount, id)
  if (!na) return { ok: false, reden: 'laatste' }
  const s = loadSettings()
  const perAccount = { ...(s.perAccount || {}) }
  delete perAccount[id]
  saveSettings({ ...s, accounts: na.accounts, actiefAccount: na.actiefAccount, perAccount })
  return { ok: true, actief: na.actiefAccount, bestand: path.basename(projectPad(id)) }
})

// ── Geschiedenis & commando-woordenboek ───────────────────────────────────────
// Twee lijsten in één bestand:
//   entries — het woordenboek: één regel per uniek commando, met per map hoe vaak
//             en wanneer het daar draaide. Dit is de blijvende kennisbank.
//   recent  — een chronologisch logboek van losse uitvoeringen. Hier scrollen de
//             pijltjes doorheen; nieuwste eerst.
const EMPTY_HISTORY = { version: 1, entries: [], recent: [] }
let historyCache = null

function normCmd(cmd) { return String(cmd || '').replace(/\s+/g, ' ').trim() }
function normCwd(cwd) { return String(cwd || '').replace(/[\\/]+$/, '') }
function newId()      { return 'h_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7) }

// Voegt de standaardcommando's toe die er nog niet in staan. Geeft terug
// hoeveel er bij gekomen zijn.
function vulAanMetStandaard() {
  const h = historyCache
  const bestaand = new Set(h.entries.map(e => normCmd(e.cmd)))
  let toegevoegd = 0

  for (const b of BUILTIN_COMMANDS) {
    const c = normCmd(b.cmd)
    if (!c || bestaand.has(c)) continue
    bestaand.add(c)
    toegevoegd++
    h.entries.push({
      id: newId(),
      cmd: b.cmd,                      // niet genormaliseerd: fragmenten hebben regeleindes
      label: b.label || '',
      note: b.note || '',
      tags: b.tags || [],
      favorite: false,
      snippet: !!b.snippet,
      danger: !!b.danger,
      template: !!b.template,
      shell: b.shell || '',
      source: 'builtin',
      firstRun: Date.now(),
      lastRun: null,
      runCount: 0,
      cwds: [],
    })
  }
  return toegevoegd
}

function loadHistory() {
  if (historyCache) return historyCache
  try {
    if (fs.existsSync(HISTORY_FILE)) {
      const h = JSON.parse(fs.readFileSync(HISTORY_FILE, 'utf8'))
      historyCache = {
        version: 1,
        seeded:  !!h.seeded,
        entries: Array.isArray(h.entries) ? h.entries : [],
        recent:  Array.isArray(h.recent)  ? h.recent  : [],
      }
      // Altijd ontbrekende standaardcommando's bijvullen — zo krijgen bestaande
      // gebruikers nieuwe meegeleverde regels (bijv. Flutter) bij een update.
      const wasSeeded = historyCache.seeded
      const n = vulAanMetStandaard()
      if (!wasSeeded || n > 0) {
        historyCache.seeded = true
        saveHistory()
      }
      return historyCache
    }
  } catch {}
  historyCache = { ...EMPTY_HISTORY, entries: [], recent: [], seeded: true }
  vulAanMetStandaard()
  saveHistory()
  return historyCache
}

// Handmatig terughalen, bijvoorbeeld nadat je ze hebt weggegooid.
ipcMain.handle('history:seedDefaults', () => {
  loadHistory()
  const n = vulAanMetStandaard()
  historyCache.seeded = true
  saveHistory()
  return { ok: true, added: n, history: historyCache }
})

function saveHistory() {
  // persist:false → alles blijft in het geheugen en verdwijnt bij afsluiten
  if (loadSettings().history?.persist === false) return
  try {
    fs.mkdirSync(path.dirname(HISTORY_FILE), { recursive: true })
    fs.writeFileSync(HISTORY_FILE, JSON.stringify(historyCache, null, 2))
  } catch (e) {
    console.error('history opslaan mislukt:', e.message)
  }
}

function trimHistory() {
  const cfg = loadSettings().history || {}
  const maxRecent  = Number(cfg.maxRecent)  > 0 ? Number(cfg.maxRecent)  : 300
  const maxEntries = Number(cfg.maxEntries) > 0 ? Number(cfg.maxEntries) : 2000
  if (historyCache.recent.length > maxRecent) historyCache.recent.length = maxRecent
  if (historyCache.entries.length > maxEntries) {
    // Favorieten en handmatige woordenboek-regels overleven het opschonen altijd;
    // van de rest sneuvelen de langst ongebruikte.
    const keep = historyCache.entries.filter(e => e.favorite || e.source === 'manual' || e.source === 'builtin')
    const rest = historyCache.entries
      .filter(e => !e.favorite && e.source !== 'manual' && e.source !== 'builtin')
      .sort((a, b) => (b.lastRun || 0) - (a.lastRun || 0))
      .slice(0, Math.max(0, maxEntries - keep.length))
    historyCache.entries = [...keep, ...rest]
  }
}

function findEntry(cmd) {
  const c = normCmd(cmd)
  return historyCache.entries.find(e => normCmd(e.cmd) === c)
}

// Registreert een uitvoering: werkt het woordenboek bij én zet hem vooraan in recent.
function recordRun({ cmd, cwd, projectId, source }) {
  const h  = loadHistory()
  const c  = normCmd(cmd)
  if (!c) return h
  const w  = normCwd(cwd)
  const ts = Date.now()

  let entry = findEntry(c)
  if (!entry) {
    entry = {
      id: newId(), cmd: c, label: '', note: '', tags: [], favorite: false,
      source: source || 'run', firstRun: ts, lastRun: ts, runCount: 0, cwds: [],
    }
    h.entries.unshift(entry)
  }
  entry.lastRun  = ts
  entry.runCount = (entry.runCount || 0) + 1
  entry.lastCwd  = w

  if (w) {
    if (!Array.isArray(entry.cwds)) entry.cwds = []
    const hit = entry.cwds.find(x => normCwd(x.path) === w)
    if (hit) { hit.lastRun = ts; hit.runCount = (hit.runCount || 0) + 1 }
    else     { entry.cwds.push({ path: w, lastRun: ts, runCount: 1, projectId: projectId || null }) }
  }

  // Opeenvolgende herhalingen niet twee keer in recent zetten — dan blijft
  // pijltje-omhoog nuttig in plaats van tien keer hetzelfde commando.
  const head = h.recent[0]
  if (head && normCmd(head.cmd) === c && normCwd(head.cwd) === w) {
    head.ts = ts
  } else {
    h.recent.unshift({ cmd: c, cwd: w, projectId: projectId || null, ts, entryId: entry.id, source: source || 'run' })
  }

  trimHistory()
  saveHistory()
  return h
}

ipcMain.handle('history:load', () => loadHistory())

ipcMain.handle('history:record', (_, payload) => {
  if (loadSettings().history?.enabled === false) return loadHistory()
  return recordRun(payload || {})
})

// Handmatig een commando aan het woordenboek toevoegen (zonder het uit te voeren)
ipcMain.handle('history:add', (_, { cmd, label, note, tags, cwd, favorite, shell } = {}) => {
  const h = loadHistory()
  const c = normCmd(cmd)
  if (!c) return h
  let entry = findEntry(c)
  const shellVal = shell === 'powershell' || shell === 'both' ? shell : 'cmd'
  if (!entry) {
    entry = {
      id: newId(), cmd: c, label: label || '', note: note || '', tags: tags || [],
      favorite: !!favorite, shell: shellVal, source: 'manual', firstRun: Date.now(), lastRun: null,
      runCount: 0, cwds: cwd ? [{ path: normCwd(cwd), lastRun: null, runCount: 0 }] : [],
    }
    h.entries.unshift(entry)
  } else {
    if (label !== undefined) entry.label = label
    if (note  !== undefined) entry.note  = note
    if (tags  !== undefined) entry.tags  = tags
    if (favorite !== undefined) entry.favorite = !!favorite
    if (shell !== undefined) entry.shell = shellVal
  }
  trimHistory(); saveHistory()
  return h
})

ipcMain.handle('history:update', (_, { id, patch } = {}) => {
  const h = loadHistory()
  const entry = h.entries.find(e => e.id === id)
  if (entry) {
    // Eerst onthouden wat er stond: hieronder wordt entry.cmd overschreven.
    const oudeCmd = normCmd(entry.cmd)

    const allowed = ['label', 'note', 'tags', 'favorite', 'cmd', 'snippet', 'danger', 'template', 'shell']
    for (const k of allowed) if (patch && k in patch) entry[k] = patch[k]
    if (patch && 'shell' in patch) {
      const s = patch.shell
      entry.shell = s === 'powershell' || s === 'both' ? s : 'cmd'
    }

    if (patch && 'cmd' in patch) {
      entry.cmd = normCmd(patch.cmd)
      // Zelf ingevuld? Dan is het geen sjabloon meer en mag hij gewoon draaien.
      if (entry.template && entry.cmd !== oudeCmd) entry.template = false
    }
    saveHistory()
  }
  return h
})

ipcMain.handle('history:delete', (_, { id } = {}) => {
  const h = loadHistory()
  h.entries = h.entries.filter(e => e.id !== id)
  h.recent  = h.recent.filter(r => r.entryId !== id)
  saveHistory()
  return h
})

// Een thema is een label op commando's. Weghalen betekent dus: dat label van
// elk commando afhalen. De commando's zelf blijven staan — die weggooien zou
// veel verder gaan dan waar iemand om vroeg.
ipcMain.handle('history:verwijderThema', (_, { tag } = {}) => {
  const h = loadHistory()
  const kaal = String(tag || '').trim().toLowerCase()
  if (!kaal) return { history: h, geraakt: 0 }
  let geraakt = 0
  for (const e of h.entries) {
    const voor = (e.tags || []).length
    e.tags = (e.tags || []).filter(t => String(t).toLowerCase() !== kaal)
    if (e.tags.length !== voor) geraakt++
  }
  if (geraakt) saveHistory()
  return { history: h, geraakt }
})

ipcMain.handle('history:clear', (_, { what } = {}) => {
  const h = loadHistory()
  if (what === 'recent')       h.recent  = []
  else if (what === 'entries') h.entries = []
  else { h.recent = []; h.entries = [] }
  saveHistory()
  return h
})

// ── Folder / file picker ──────────────────────────────────────────────────────
ipcMain.handle('dialog:pickFolder', async () => {
  const r = await dialog.showOpenDialog(win, { properties: ['openDirectory'], title: 'Selecteer projectmap' })
  return r.canceled ? null : r.filePaths[0]
})
// Een snelkoppeling is geen programma: cmd.exe kan een .lnk niet starten. Als
// je er een aanwijst — van het bureaublad of uit het startmenu — halen we het
// programma waar hij naar wijst eruit.
function losSnelkoppelingOp(p) {
  if (!p || !/\.lnk$/i.test(p)) return p
  try {
    const link = shell.readShortcutLink(p)
    if (link.target && fs.existsSync(link.target)) return link.target
  } catch {}
  return p
}

// Alle geïnstalleerde programma's, gelezen uit het startmenu.
//
// De map "Applications" die je in de verkenner ziet is geen echte map maar een
// virtuele shell-lijst; een bestandskiezer kan daar niets vinden omdat het geen
// bestanden zijn. Het startmenu bevat wél echte snelkoppelingen, en die wijzen
// naar de programma's zelf.
function scanStartMenu(dir, uit, diepte = 0) {
  if (diepte > 4 || uit.length > 800) return
  let items = []
  try { items = fs.readdirSync(dir, { withFileTypes: true }) } catch { return }

  for (const it of items) {
    const vol = path.join(dir, it.name)
    if (it.isDirectory()) { scanStartMenu(vol, uit, diepte + 1); continue }
    if (!/\.lnk$/i.test(it.name)) continue

    const naam = it.name.replace(/\.lnk$/i, '')
    if (/^(uninstall|verwijder)/i.test(naam)) continue   // ruis

    try {
      const link = shell.readShortcutLink(vol)
      if (!link.target || !/\.exe$/i.test(link.target) || !fs.existsSync(link.target)) continue
      uit.push({ naam, pad: link.target })
    } catch {}
  }
}

ipcMain.handle('app:listPrograms', () => {
  const mappen = [
    path.join(process.env.ProgramData || 'C:\\ProgramData', 'Microsoft', 'Windows', 'Start Menu', 'Programs'),
    path.join(process.env.APPDATA || '', 'Microsoft', 'Windows', 'Start Menu', 'Programs'),
  ].filter(d => d && fs.existsSync(d))

  const gevonden = []
  mappen.forEach(d => scanStartMenu(d, gevonden))

  // Hetzelfde programma staat vaak in beide startmenu's
  const gezien = new Set()
  return gevonden
    .filter(p => { const k = p.pad.toLowerCase(); if (gezien.has(k)) return false; gezien.add(k); return true })
    .sort((a, b) => a.naam.localeCompare(b.naam))
})

// ── Bekende editors opsporen ──────────────────────────────────────────────────
// Drie wegen, van goedkoop naar grondig: het startmenu (dekt de meeste
// installaties), de gebruikelijke installatiemappen op élke schijf, en PATH.
function programmaWortels() {
  const wortels = []
  for (let i = 65; i <= 90; i++) {
    const schijf = String.fromCharCode(i) + ':\\'
    try { if (!fs.existsSync(schijf)) continue } catch { continue }
    for (const naam of ['Program Files', 'Program Files (x86)', 'Programs', 'Apps']) {
      const p = path.join(schijf, naam)
      try { if (fs.existsSync(p)) wortels.push(p) } catch {}
    }
  }
  // Veel editors installeren zichzelf tegenwoordig zonder beheerdersrechten
  for (const env of ['LOCALAPPDATA', 'APPDATA', 'ProgramW6432']) {
    const p = process.env[env]
    try { if (p && fs.existsSync(p)) wortels.push(p) } catch {}
  }
  return wortels
}

// Nieuwste eerst, zodat "IntelliJ IDEA 2024.3" boven "2023.2" komt
function nieuwsteMap(basis, patroon) {
  try {
    const kandidaten = fs.readdirSync(basis, { withFileTypes: true })
      .filter(d => d.isDirectory() && patroon.test(d.name))
      .map(d => d.name)
      .sort((a, b) => b.localeCompare(a, undefined, { numeric: true }))
    return kandidaten.length ? path.join(basis, kandidaten[0]) : null
  } catch { return null }
}

function zoekEditorOpSchijf(ed, wortels) {
  for (const wortel of wortels) {
    for (const rel of (ed.paden || [])) {
      const p = path.join(wortel, rel)
      try { if (fs.existsSync(p)) return p } catch {}
    }
    for (const rel of (ed.gebruiker || [])) {
      const p = path.join(wortel, rel)
      try { if (fs.existsSync(p)) return p } catch {}
    }
    if (ed.versieMap) {
      const basis = ed.versieMap.onder ? path.join(wortel, ed.versieMap.onder) : wortel
      const map = nieuwsteMap(basis, ed.versieMap.patroon)
      if (map) {
        const p = path.join(map, ed.versieMap.exe)
        try { if (fs.existsSync(p)) return p } catch {}
      }
    }
  }
  return null
}

function zoekInPad(naam) {
  const padWaarde = process.platform === 'win32' ? windowsMergedPath() : (process.env.PATH || '')
  for (const d of padWaarde.split(path.delimiter)) {
    for (const ext of ['.exe', '.cmd', '.bat']) {
      try {
        const p = path.join(d, naam + ext)
        if (fs.existsSync(p)) return p
      } catch {}
    }
  }
  return null
}

ipcMain.handle('app:scanEditors', () => {
  const wortels = programmaWortels()

  // Het startmenu levert naam + pad; dat vangt installaties op onbekende plekken
  let startMenu = []
  try {
    const mappen = [
      path.join(process.env.ProgramData || 'C:\\ProgramData', 'Microsoft', 'Windows', 'Start Menu', 'Programs'),
      path.join(process.env.APPDATA || '', 'Microsoft', 'Windows', 'Start Menu', 'Programs'),
    ].filter(d => d && fs.existsSync(d))
    mappen.forEach(d => scanStartMenu(d, startMenu))
  } catch {}

  const gevonden = []
  for (const ed of EDITORS) {
    let pad = zoekEditorOpSchijf(ed, wortels)
    let bron = 'installatiemap'

    if (!pad && ed.startMenu) {
      const hit = startMenu.find(p => ed.startMenu.test(p.naam))
      if (hit) { pad = hit.pad; bron = 'startmenu' }
    }
    if (!pad && ed.cli) {
      const p = zoekInPad(ed.cli)
      if (p) { pad = p; bron = 'PATH' }
    }
    if (pad) gevonden.push({ id: ed.id, label: ed.label, path: pad, bron })
  }
  return gevonden
})

ipcMain.handle('dialog:pickExe', async () => {
  const r = await dialog.showOpenDialog(win, {
    properties: ['openFile'], title: 'Selecteer programma of snelkoppeling',
    filters: [
      { name: 'Programma of snelkoppeling', extensions: ['exe', 'cmd', 'bat', 'lnk', 'com'] },
      { name: 'Alle bestanden', extensions: ['*'] },
    ],
  })
  return r.canceled ? null : losSnelkoppelingOp(r.filePaths[0])
})
// Lost een `cd`-doel op ten opzichte van de huidige map en controleert of het
// bestaat. Zonder deze stap zet `cd bestaat-niet` de werkmap op een pad dat er
// niet is, en falen alle volgende commando's zonder duidelijke reden.
ipcMain.handle('fs:resolveDir', (_, { base, target } = {}) => {
  try {
    if (!target) return { ok: false, reason: 'leeg' }
    let doel = String(target).trim()
    // PowerShell (en handig in cmd): `cd ~` is de gebruikersmap.
    if (doel === '~' || doel.startsWith('~/') || doel.startsWith('~\\')) {
      doel = path.join(os.homedir(), doel.slice(1).replace(/^[\\/]+/, ''))
    }
    const volledig = path.resolve(base || process.cwd(), doel)
    if (!fs.existsSync(volledig)) return { ok: false, reason: 'bestaat niet', path: volledig }
    if (!fs.statSync(volledig).isDirectory()) return { ok: false, reason: 'geen map', path: volledig }
    return { ok: true, path: volledig }
  } catch (e) { return { ok: false, reason: e.message } }
})

// ── Bladeren door mappen ──────────────────────────────────────────────────────
ipcMain.handle('fs:listDir', async (_, dirPath) => {
  try {
    if (!dirPath) return { ok: false, reason: 'geen pad' }
    // Netwerkpad: eerst asynchroon aankloppen bij de share. Zonder dit zet de
    // fs.existsSync hieronder het hele venster 28 seconden vast zodra de server
    // niet antwoordt — zie de uitleg bij netwerkBereikbaar. Op een share die het
    // gewoon doet kost dit niets: het antwoord staat na de eerste keer vast.
    const wortel = netwerkWortelVan(dirPath)
    if (wortel && !(await netwerkBereikbaar(wortel))) {
      return { ok: false, reason: 'netwerkmap niet bereikbaar' }
    }
    if (!fs.existsSync(dirPath)) return { ok: false, reason: 'bestaat niet' }
    if (!fs.statSync(dirPath).isDirectory()) return { ok: false, reason: 'geen map' }

    const items = []
    for (const d of fs.readdirSync(dirPath, { withFileTypes: true })) {
      const vol = path.join(dirPath, d.name)
      let dir = d.isDirectory(), size = 0, mtime = 0, verborgen = false
      try {
        const st = fs.statSync(vol)          // volgt snelkoppelingen naar mappen
        dir = st.isDirectory()
        size = st.size
        mtime = st.mtimeMs
      } catch { if (!d.isDirectory()) continue }   // ontoegankelijk: overslaan
      verborgen = d.name.startsWith('.')
      items.push({ name: d.name, path: vol, dir, size, mtime, verborgen, archief: !dir && isArchief(d.name) })
    }

    // Mappen eerst, daarbinnen op naam
    items.sort((a, b) => (b.dir - a.dir) || a.name.localeCompare(b.name, 'nl', { sensitivity: 'base' }))

    const volledig = path.resolve(dirPath)
    const omhoog = path.dirname(volledig)
    return { ok: true, path: volledig, parent: omhoog === volledig ? null : omhoog, items }
  } catch (e) {
    return { ok: false, reason: e.code === 'EPERM' || e.code === 'EACCES' ? 'geen toegang tot deze map' : e.message }
  }
})

// ── Wat voor project is dit? ──────────────────────────────────────────────────
// De tools-knoppen (pub get, clean, build apk, doctor) slaan alleen ergens op
// bij een Flutter-project. Een pubspec.yaml met een flutter-afhankelijkheid is
// daarvoor het bewijs; een pubspec zonder die afhankelijkheid is een gewoon
// Dart-pakket, en dan hoort er ook geen "build apk" te staan.
ipcMain.handle('fs:projectSoort', (_, dir) => {
  try {
    if (!dir || !fs.existsSync(dir)) return { ok: false, reason: 'bestaat niet' }

    let pubspec = false, flutter = false
    try {
      const tekst = fs.readFileSync(path.join(dir, 'pubspec.yaml'), 'utf8')
      pubspec = true
      // "sdk: flutter" onder dependencies, of een eigen flutter:-blok
      flutter = /^\s*sdk:\s*flutter\s*$/m.test(tekst) || /^flutter\s*:/m.test(tekst)
    } catch {}

    // Zonder pubspec kan het nog steeds een Flutter-map zijn die half is
    // uitgecheckt; .metadata schrijft Flutter zelf en is een goede tweede bron.
    if (!flutter) {
      try {
        const meta = fs.readFileSync(path.join(dir, '.metadata'), 'utf8')
        if (/project_type:/.test(meta)) flutter = true
      } catch {}
    }

    const heeft = (n) => { try { return fs.existsSync(path.join(dir, n)) } catch { return false } }
    return {
      ok: true,
      flutter,
      dart: pubspec,
      node: heeft('package.json'),
      pubspec,
      git: heeft('.git'),
    }
  } catch (e) {
    return { ok: false, reason: e.message }
  }
})

// ── Git ───────────────────────────────────────────────────────────────────────
// De knoppen in de app moeten weten of een map onder versiebeheer staat en of
// er een remote aan hangt. Dat is drie keer een kort commando; we vragen het
// stil op (niet in de terminal) zodat het tijdens het tekenen kan.

// Kort en met een harde tijdslimiet: dit draait tijdens het renderen en mag
// het venster nooit laten wachten. Geeft null terug als git zelf ontbreekt.
function gitUit(dir, args) {
  try {
    return execFileSync('git', args, {
      cwd: dir, encoding: 'utf8', timeout: 4000, windowsHide: true,
      // childEnv leest PATH vers uit het register. Zonder dat vindt de app een
      // net geïnstalleerde git of gh pas na een herstart van CommandDeck, en
      // dan lijkt de installatie mislukt terwijl hij gelukt is.
      env: childEnv(),
      stdio: ['ignore', 'pipe', 'ignore'],
    })
  } catch (e) {
    // ENOENT = git staat niet in PATH. Al het andere is een gewone git-fout
    // (geen repo, geen commits) en betekent alleen 'geen antwoord'.
    if (e && e.code === 'ENOENT') return null
    return ''
  }
}

// Zelfde als gitUit, maar zonder de hoofdthread te blokkeren. git:info draait
// tijdens het tekenen; execFileSync daar laat het hele venster stilstaan.
function gitUitAsync(dir, args, env) {
  return new Promise((resolve) => {
    execFile('git', args, {
      cwd: dir, encoding: 'utf8', timeout: 4000, windowsHide: true,
      env: env || childEnv(),
    }, (err, stdout) => {
      if (err && err.code === 'ENOENT') resolve(null)
      else if (err) resolve('')
      else resolve(stdout)
    })
  })
}

let gitAanwezig = null
function heeftGit() {
  if (gitAanwezig === null) gitAanwezig = gitUit(os.homedir(), ['--version']) !== null
  return gitAanwezig
}

// ── Werkt de koppeling ook echt? ─────────────────────────────────────────────
// Een remote in .git/config is een adres, geen bewijs. Of dat adres bestaat en
// of je erbij mag, weet alleen de andere kant — dus dat moet over het netwerk.
// Daarom staat het niet in git:info: die draait elke paar seconden, en een
// netwerkaanroep per project per keer is niet uit te leggen. git:info leest
// alleen wat hier al een keer is uitgezocht.
//
// De uitkomst blijft een half uur staan. Korter en je zit alsnog te wachten na
// elke herstart; langer en een repo die je net hebt aangemaakt blijft "stuk".
// Na een geslaagd koppelen of herstellen gooit git:remoteVergeet hem meteen weg.
const REMOTE_TTL = 30 * 60 * 1000
const remoteCache = new Map()   // sleutel: map + url  ->  { ok, reden, tijd }

function remoteSleutel(dir, url) { return String(dir) + '\u0000' + String(url || '') }

function remoteUitCache(dir, url) {
  if (!url) return null
  const hit = remoteCache.get(remoteSleutel(dir, url))
  if (!hit) return null
  if (Date.now() - hit.tijd > REMOTE_TTL) { remoteCache.delete(remoteSleutel(dir, url)); return null }
  return hit
}

// De controle zelf. Twee dingen zijn hier belangrijker dan de uitslag:
//
//  1. Hij mag nóóit om een wachtwoord vragen. Zonder GIT_TERMINAL_PROMPT=0 en
//     GCM_INTERACTIVE=never opent Windows een inlogvenster of blijft git
//     hangen op een prompt die niemand ziet — en dan hangt de app.
//  2. Hij mag niet lang duren. 15 seconden is ruim voor een handshake en kort
//     genoeg om niet als vastloper te voelen.
function controleerRemote(dir, remote) {
  return new Promise((resolve) => {
    const env = childEnv({ GIT_TERMINAL_PROMPT: '0', GCM_INTERACTIVE: 'never' })
    // Leegmaken is niet genoeg: een lege GIT_ASKPASS laat git alsnog iets
    // proberen te starten. Ze moeten wég, anders opent er een inlogvenster dat
    // niemand verwacht bij een achtergrondcontrole.
    delete env.GIT_ASKPASS
    delete env.SSH_ASKPASS
    execFile('git', GitTools.lsRemoteArgs(remote), {
      cwd: dir, encoding: 'utf8', timeout: 15000, windowsHide: true, env,
    }, (e, _stdout, stderr) => {
      if (e && e.code === 'ENOENT') { resolve({ ok: null, reden: 'onbekend' }); return }
      if (e && (e.signal === 'SIGTERM' || e.killed)) { resolve({ ok: null, reden: 'netwerk' }); return }
      if (!e) { resolve(GitTools.remoteUitslag(0, '')); return }
      const tekst = String(stderr || '') + ' ' + String((e && e.message) || '')
      resolve(GitTools.remoteUitslag(e && typeof e.status === 'number' ? e.status : 1, tekst))
    })
  })
}

// De renderer vraagt dit los aan, per project, op een rustig moment — niet in
// de poll-lus. Antwoord is dezelfde vorm als wat git:info meestuurt.
ipcMain.handle('git:remoteCheck', async (_, dir) => {
  if (!padToegestaan(dir)) return { ok: null, reden: 'onbekend' }
  if (!dir || !fs.existsSync(dir) || !heeftGit()) return { ok: null, reden: 'onbekend' }

  const remoteLijst = GitTools.parseRemoteRegels(gitUit(dir, ['remote', '-v']))
  if (!remoteLijst.length) return { ok: null, reden: '', geen: true }

  const st = GitTools.parseStatusV2(gitUit(dir, ['status', '--porcelain=v2', '--branch']))
  const staat = GitTools.maakStaat({ beschikbaar: true, isRepo: true, remoteLijst, upstream: st.upstream })
  const remote = staat.remote
  const url = staat.remoteUrl

  const bekend = remoteUitCache(dir, url)
  if (bekend) return { ok: bekend.ok, reden: bekend.reden, remote, url, uitCache: true }

  const uitslag = await controleerRemote(dir, remote)
  remoteCache.set(remoteSleutel(dir, url), { ok: uitslag.ok, reden: uitslag.reden, tijd: Date.now() })
  return { ok: uitslag.ok, reden: uitslag.reden, remote, url }
})

// ── .gitignore ───────────────────────────────────────────────────────────────
// Wat er in deze map ligt bepaalt wat erin moet. We kijken alleen naar de
// bovenste laag: dieper zoeken kost tijd en zegt niets extra's.
ipcMain.handle('git:gitignoreVoorstel', (_, dir) => {
  if (!padToegestaan(dir) || !dir || !fs.existsSync(dir)) return { ok: false }
  let namen = []
  try { namen = fs.readdirSync(dir).slice(0, 400) } catch { return { ok: false } }
  const soorten = GitTools.projectSoorten(namen)
  return {
    ok: true,
    bestaat: fs.existsSync(path.join(dir, '.gitignore')),
    soorten,
    inhoud: GitTools.gitignoreVoor(soorten),
  }
})

// Schrijven doet main, niet een commando in de terminal: tientallen regels door
// cmd.exe jagen gaat stuk op het eerste rare teken, en dit is een bestand dat
// gewoon goed moet staan.
ipcMain.handle('git:gitignoreSchrijf', (_, { dir, inhoud, erbij } = {}) => {
  if (!padToegestaan(dir) || !dir || !fs.existsSync(dir)) return { ok: false, reden: 'geen-map' }
  const doel = path.join(dir, '.gitignore')
  try {
    if (erbij && fs.existsSync(doel)) {
      // Aanvullen, niet overschrijven: wat er staat is van de gebruiker.
      const oud = fs.readFileSync(doel, 'utf8')
      fs.appendFileSync(doel, (oud.endsWith('\n') ? '' : '\n') + '\n' + String(inhoud || ''), 'utf8')
    } else {
      fs.writeFileSync(doel, String(inhoud || ''), 'utf8')
    }
    return { ok: true, pad: doel }
  } catch (e) {
    return { ok: false, reden: String((e && e.message) || 'onbekend') }
  }
})

// Na koppelen, herstellen of een mislukte push wil je niet nog een half uur
// naar het oude oordeel kijken.
ipcMain.handle('git:remoteVergeet', (_, dir) => {
  const voor = String(dir || '') + '\u0000'
  for (const sleutel of [...remoteCache.keys()]) {
    if (!dir || sleutel.startsWith(voor)) remoteCache.delete(sleutel)
  }
  return true
})

// ── Wat mag dit account zien? ────────────────────────────────────────────────
// Niet tegen meelezen — dat kan de app niet, alles staat in de map van de
// Windows-gebruiker. Dit gaat over iets anders en dat kán wel sluitend: er mag
// nooit een git-actie draaien op de map van een ánder account, en niemand mag
// een melding krijgen over andermans repo. Dus houdt main bij welke paden bij
// het actieve account horen, en weigert al het andere.
let gitToegang = { accountId: '', paden: null }   // null = de renderer heeft nog niets gemeld

ipcMain.on('git:paden', (_, data) => {
  const d = data || {}
  gitToegang = {
    accountId: String(d.accountId || ''),
    paden: (Array.isArray(d.paden) ? d.paden : []).filter(Boolean),
  }
})

// Vóór de eerste melding (het moment tussen opstarten en de eerste render)
// laten we alles door: er is dan nog geen tweede account in beeld en anders
// zou de app bij de start niets over zichzelf kunnen zeggen.
function padToegestaan(dir) {
  if (!gitToegang.paden) return true
  return Accounts.padHoortBij(gitToegang.paden, dir)
}

ipcMain.handle('git:info', async (_, dir) => {
  if (!padToegestaan(dir)) return GitTools.maakStaat({ beschikbaar: heeftGit(), isRepo: false })
  if (!dir || !fs.existsSync(dir)) return GitTools.maakStaat({ beschikbaar: heeftGit(), isRepo: false })
  if (!heeftGit()) return GitTools.maakStaat({ beschikbaar: false })

  const binnen = String(await gitUitAsync(dir, ['rev-parse', '--is-inside-work-tree']) || '').trim()
  if (binnen !== 'true') return GitTools.maakStaat({ beschikbaar: true, isRepo: false })

  // Los van elkaar: vijf korte git-aanroepen naast elkaar in plaats van zes
  // keer achter elkaar de hoofdthread vastzetten.
  const env = childEnv()
  const [remoteUit, statusUit, stashUit, identUit, langeUit] = await Promise.all([
    gitUitAsync(dir, ['remote', '-v'], env),
    gitUitAsync(dir, ['status', '--porcelain=v2', '--branch'], env),
    gitUitAsync(dir, ['stash', 'list'], env),
    gitUitAsync(dir, ['config', '--get-regexp', '^user\\.(name|email)$'], env),
    gitUitAsync(dir, ['config', '--get', 'core.longpaths'], env),
  ])

  const remoteLijst = GitTools.parseRemoteRegels(remoteUit)
  const st = GitTools.parseStatusV2(statusUit)
  const stashes = GitTools.parseStashAantal(stashUit)
  const ident = GitTools.parseIdentiteit(identUit)
  const gitignore = fs.existsSync(path.join(dir, '.gitignore'))
  const langePaden = String(langeUit || '').trim() === 'true'

  let remoteOk = null, remoteReden = ''
  if (remoteLijst.length) {
    const kies = GitTools.maakStaat({ beschikbaar: true, isRepo: true, remoteLijst, upstream: st.upstream })
    const bekend = remoteUitCache(dir, kies.remoteUrl)
    if (bekend) { remoteOk = bekend.ok; remoteReden = bekend.reden }
  }

  return GitTools.maakStaat({
    beschikbaar: true, isRepo: true, remoteLijst,
    branch: st.branch, commits: st.commits, upstream: st.upstream,
    nieuw: st.nieuw, nieuweBestanden: st.nieuweBestanden,
    ahead: st.ahead, behind: st.behind, vuil: st.vuil,
    conflicten: st.conflicten, stashes, bestanden: st.bestanden,
    remoteOk, remoteReden,
    gitignore, langePaden, windows: process.platform === 'win32',
    naam: ident.naam, email: ident.email,
  })
})

// Wat er in déze map aan account-instellingen staat. Apart van git:info omdat
// het alleen nodig is op het moment dat je een profiel gaat toepassen, en
// git:info al vaak genoeg draait.
//
// `helperLokaal` is de vraag of er in .git/config zelf een credential.helper
// staat. Dat is iets anders dan of er überhaupt een helper is: die staat bij
// een gewone Git-voor-Windows op systeemniveau. Alleen een lokale kunnen we
// weer weghalen.
ipcMain.handle('git:accountInfo', (_, dir) => {
  if (!padToegestaan(dir)) return null
  const leeg = { naam: '', email: '', ghGebruiker: '', helperLokaal: false, ghCli: false }
  if (!dir || !fs.existsSync(dir) || !heeftGit()) return leeg

  const ident = GitTools.parseIdentiteit(gitUit(dir, ['config', '--get-regexp', '^user\\.(name|email)$']))

  // Via --list en niet via --get-all, en dat is geen smaakkwestie: een helper
  // die op "" staat — precies wat "elke keer vragen" zet — geeft bij --get-all
  // een lege regel terug. Niet te onderscheiden van "staat er niet", en dan
  // zou terugzetten naar "onthouden" de helper voorgoed uit laten staan.
  // In --list staat hij als `credential.helper=` en is hij wél zichtbaar.
  const lokaal = String(gitUit(dir, ['config', '--local', '--list']) || '')

  return {
    naam: ident.naam,
    email: ident.email,
    // Effectief, dus inclusief globaal: staat het elders al goed, dan hoeven
    // we niets te zetten.
    ghGebruiker: String(gitUit(dir, ['config', '--get', 'credential.https://github.com.username']) || '').trim(),
    // Weghalen kan alleen wat in déze .git/config staat.
    ghGebruikerLokaal: /^credential\.https:\/\/github\.com\.username=/m.test(lokaal),
    helperLokaal: /^credential\.helper=/m.test(lokaal),
    // Draait het inloggen via gh, dan is credential.username niet de knop die
    // iets doet — dan gaat wisselen van account via `gh auth switch`.
    ghCli: /gh auth git-credential/i.test(String(gitUit(dir, ['config', '--get-all', 'credential.helper']) || '')),
  }
})

// Wat er in de stash staat, met datum en branch. Alleen op aanvraag: dit hangt
// aan een klik en niet aan het tekenen, dus hier mag het iets meer kosten.
// Alle branches, lokaal en op de remote. Alleen op aanvraag: dit hangt aan een
// knop en hoeft niet mee te draaien in de achtergrondverversing.
// ── Een blijven staan index.lock ─────────────────────────────────────────────
// Git zet dat bestand neer voordat hij schrijft. Breekt hij onderweg af, dan
// blijft het staan en weigert elke volgende commit — met een melding die de
// gebruiker naar de verkenner stuurt om zelf in .git te gaan graven. Dat kan
// de app doen, mits ze eerst kijkt of er echt niets meer aan het schrijven is.

function gitSlotPad(dir) {
  return path.join(dir, '.git', 'index.lock')
}

// Draait er nog een git op deze pc? Niet te zeggen bij wélke map hij hoort —
// Windows geeft geen werkmap prijs — dus dit is een aanwijzing, geen bewijs.
// Daarom staat het aantal in de vraag en beslist de gebruiker.
function gitProcessenOpDezePc() {
  if (process.platform !== 'win32') return null
  try {
    const uit = execFileSync('tasklist', ['/FI', 'IMAGENAME eq git.exe', '/NH', '/FO', 'CSV'], {
      encoding: 'utf8', timeout: 4000, windowsHide: true, stdio: ['ignore', 'pipe', 'ignore'],
    })
    return (String(uit).match(/^"git\.exe"/gmi) || []).length
  } catch { return null }
}

ipcMain.handle('git:slotInfo', (_, dir) => {
  if (!padToegestaan(dir) || !dir) return { bestaat: false }
  const slot = gitSlotPad(dir)
  let stat = null
  try { stat = fs.statSync(slot) } catch { return { bestaat: false } }
  return {
    bestaat: true,
    pad: slot,
    ouderdomMs: Math.max(0, Date.now() - stat.mtimeMs),
    // Draait CommandDeck zélf nog iets? Dan is het slot van ons en mag het
    // niet weg: dat is de enige zekerheid die we hier hebben.
    eigenCommandoDraait: !!activeProc,
    gitProcessen: gitProcessenOpDezePc(),
  }
})

ipcMain.handle('git:slotWeg', (_, dir) => {
  if (!padToegestaan(dir) || !dir) return { ok: false, reden: 'pad' }
  if (activeProc) return { ok: false, reden: 'eigen-commando' }
  const slot = gitSlotPad(dir)
  try {
    if (!fs.existsSync(slot)) return { ok: true, alWeg: true }
    fs.unlinkSync(slot)
    return { ok: true }
  } catch (e) {
    return { ok: false, reden: 'mislukt', fout: String((e && e.message) || '').split('\n')[0] }
  }
})

ipcMain.handle('git:branches', (_, dir) => {
  if (!padToegestaan(dir)) return []
  if (!dir || !fs.existsSync(dir) || !heeftGit()) return []
  return GitTools.parseBranches(
    gitUit(dir, ['branch', '-a', '--format=%(HEAD)%09%(refname)%09%(refname:short)%09%(upstream:short)%09%(upstream:track)']))
})

ipcMain.handle('git:stashLijst', (_, dir) => {
  if (!padToegestaan(dir)) return []
  if (!dir || !fs.existsSync(dir) || !heeftGit()) return []
  const lijst = GitTools.parseStashLijst(gitUit(dir, ['stash', 'list', '--pretty=%gd%x09%cs%x09%gs']))
  if (lijst.length) return lijst
  // %cs bestaat pas vanaf git 2.21. Kent deze git hem niet, dan faalt het hele
  // commando en levert gitUit een lege tekst op — en dan zou de app zeggen dat
  // er niets ligt terwijl er wél iets ligt. Dat is precies het soort stilte dat
  // deze functie moest wegnemen, dus vallen we terug op de kale uitvoer.
  return GitTools.parseStashLijst(gitUit(dir, ['stash', 'list']))
})

// Welke bestanden zitten er in één stash. Dat is de vraag die je stelt vóór je
// hem terughaalt of weggooit: "was dit het werk dat ik zoek?"
ipcMain.handle('git:stashInhoud', (_, dir, ref) => {
  if (!padToegestaan(dir)) return []
  if (!dir || !fs.existsSync(dir) || !heeftGit()) return []
  if (!GitTools.stashRefGeldig(ref)) return []
  // --include-untracked, want de stash-knop zet met -u ook nieuwe bestanden
  // weg. Zonder deze vlag zie je die niet staan en lijkt de stash kleiner dan
  // hij is. De vlag bestaat pas vanaf git 2.32; op een oudere git faalt het
  // commando en levert gitUit een lege tekst op, dus dan nog eens zonder.
  const schoon = String(ref).trim()
  let uit = gitUit(dir, ['stash', 'show', '--name-only', '--include-untracked', schoon])
  if (!String(uit || '').trim()) uit = gitUit(dir, ['stash', 'show', '--name-only', schoon])
  return String(uit || '').split('\n').map(r => r.replace(/\r$/, '').trim()).filter(Boolean).slice(0, 40)
})

// ── Windows afsluiten of uitloggen ───────────────────────────────────────────
// Het echte pauzeren gebeurt bij query-session-end (zie createWindow): daar
// zeggen we 'nee' tegen WM_QUERYENDSESSION en zet Windows het afsluiten stil,
// met een scherm waarop staat dat CommandDeck het ophoudt. Dat vroeg vroeger om
// een native module; sinds Electron 34 zit het in de doos.
//
// Dit stuk is het vangnet daaronder. Kiest iemand op dat scherm voor "toch
// afsluiten", of houden we het niet tegen omdat er niets te redden leek, dan
// krijgt het proces nog ongeveer vijf seconden. Geen renderer, geen dialoog,
// geen await — alles wat hier gebeurt moet synchroon zijn en meteen af.

// De renderer houdt bij welke projecten een git-map hebben en hoe ze ervoor
// staan. Die lijst zetten we hier klaar, want op het moment zelf kunnen we hem
// niet meer opvragen.
let gitProjectenVoorAfsluiten = { accountId: '', lijst: [] }
ipcMain.on('git:projecten', (_, lijst) => {
  const d = lijst || {}
  // Mét het account erbij. Bij een Windows-shutdown vlak na het wisselen mag
  // er nooit gestasht worden in de map van degene die net is uitgelogd.
  gitProjectenVoorAfsluiten = {
    accountId: String(d.accountId || ''),
    lijst: Array.isArray(d.lijst) ? d.lijst : [],
  }
})

// Per account een eigen melding. Anders krijgt je collega bij het opstarten te
// horen dat er werk van jou is weggezet, met jouw projectnamen erbij.
const stashMeldingBestand = (accountId) =>
  path.join(app.getPath('userData'), `git-stash-melding-${Accounts.geldigAccountId(accountId) ? accountId : 'onbekend'}.json`)

app.on('session-end', () => {
  try {
    const alBezig = afsluitenGevraagd

    // Alleen stashen als er nog geen gesprek liep. Midden in commit & push
    // zou stash de index op slot zetten en de keuze van de gebruiker weggooien.
    if (!alBezig && actieveInstellingen().git.afsluiten === 'stashen') {
      const st = accountStand()
      // Hoort deze lijst nog bij wie er nu ingelogd is? Zo niet, dan raken we
      // niets aan: liever niets stashen dan in de map van een ander.
      if (gitProjectenVoorAfsluiten.accountId !== st.actiefAccount) {
        /* stash overslaan */
      } else {
        const teStashen = GitTools.teStashenProjecten(gitProjectenVoorAfsluiten.lijst, 'stashen')
        const gelukt = []
        for (const p of teStashen) {
          try {
            execFileSync('git', ['stash', 'push', '-u', '-m', 'CommandDeck: automatisch bij afsluiten'], {
              cwd: p.pad, encoding: 'utf8', timeout: 1500, windowsHide: true,
              stdio: ['ignore', 'pipe', 'ignore'],
            })
            gelukt.push({ naam: p.naam, pad: p.pad })
          } catch { /* geen tijd om iets te proberen; door naar het volgende */ }
        }
        if (gelukt.length) {
          fs.writeFileSync(stashMeldingBestand(st.actiefAccount),
            JSON.stringify({ op: Date.now(), projecten: gelukt }))
        }
      }
    }

    // Zelfde vragen als bij het kruisje: niet-gepushte commits (stash pakt die
    // niet) en, zonder stash-instelling, ook niet-vastgelegd werk. Meestal is
    // die ronde al gestart bij query-session-end; dan doet dit niets.
    try { startAfsluitControle('windows') } catch {}
  } catch { /* nooit het afsluiten van Windows ophouden met een fout van ons */ }
})

// De renderer haalt dit bij de start op en laat het zien. Lezen wist het
// bestand: de melding hoort één keer te komen, niet elke start opnieuw.
ipcMain.handle('git:stashMelding', () => {
  try {
    const bestand = stashMeldingBestand(accountStand().actiefAccount)
    if (!fs.existsSync(bestand)) return null
    const m = JSON.parse(fs.readFileSync(bestand, 'utf8'))
    try { fs.unlinkSync(bestand) } catch {}
    return m
  } catch { return null }
})

// Stil ophalen wat er op de remote staat, zodat "↓3 achter" iets betekent.
// Drie dingen zijn hier belangrijk:
//
//   async     dit mag het main-proces niet blokkeren, dus execFile en geen
//             execFileSync zoals bij git:info
//   geen vraag om inloggegevens: GIT_TERMINAL_PROMPT=0 en de credential
//             manager op non-interactief. Anders blijft er een onzichtbaar
//             proces staan wachten op invoer die niemand ziet
//   tijdslimiet zodat een trage of onbereikbare remote niet blijft hangen
ipcMain.handle('git:fetch', (_, dir) => new Promise((resolve) => {
  if (!padToegestaan(dir)) { resolve({ ok: false, reden: 'ander-account' }); return }
  if (!dir || !fs.existsSync(dir) || !heeftGit()) { resolve({ ok: false, reden: 'geen-repo' }); return }

  execFile('git', ['fetch', '--prune'], {
    cwd: dir,
    windowsHide: true,
    timeout: 15000,
    env: childEnv({
      GIT_TERMINAL_PROMPT: '0',
      GCM_INTERACTIVE: 'never',
      GIT_ASKPASS: '',
      SSH_ASKPASS: '',
    }),
  }, (fout) => {
    // Een mislukte fetch is geen ramp: de indicator blijft dan gewoon staan op
    // wat hij al wist. Niets melden, niets blokkeren.
    if (fout) { resolve({ ok: false, reden: fout.killed ? 'te-traag' : 'mislukt' }); return }
    resolve({ ok: true })
  })
}))

// Is de GitHub-CLI beschikbaar? Zo ja, dan kan de koppelknop de repo zelf
// aanmaken; zo nee, dan vragen we de gebruiker om de url.
let ghAanwezig = null
function ghBeschikbaar() {
  if (ghAanwezig === null) {
    try {
      execFileSync('gh', ['--version'], { encoding: 'utf8', timeout: 4000, windowsHide: true, env: childEnv(), stdio: ['ignore', 'pipe', 'ignore'] })
      ghAanwezig = true
    } catch { ghAanwezig = false }
  }
  return ghAanwezig
}

// Het git-account laten meeschakelen met het app-account. Stil en globaal: je
// bent nú deze persoon, dus elke repo zonder eigen instelling volgt dat. Elke
// stap apart, want ze kunnen los van elkaar mislukken — gh hoeft niet te
// bestaan om je naam wel goed te zetten.
ipcMain.handle('git:accountActiveren', (_, profiel) => {
  if (!heeftGit()) return { ok: false, reden: 'geen-git', gedaan: [], mislukt: [], fouten: {} }

  const gedaan = []
  const mislukt = []
  const fouten = {}
  for (const stap of GitTools.accountActiveerStappen(profiel, ghBeschikbaar())) {
    // Rechtstreeks, zonder shell ertussen. Ging dit als commandoregel door
    // cmd.exe, dan werden de aanhalingstekens onderdeel van de sleutel of viel
    // een naam met een spatie uit elkaar -- zie accountActiveerStappen.
    //
    // In de thuismap draaien: dit is globale config en hoort bij geen enkele repo.
    try {
      for (const o of stap.opdrachten) {
        execFileSync(o.prog, o.args, {
          cwd: os.homedir(), encoding: 'utf8', timeout: 8000, windowsHide: true,
          env: childEnv(), stdio: ['ignore', 'pipe', 'pipe'],
        })
      }
      gedaan.push(stap.soort)
    } catch (e) {
      // De reden bewaren en niet weggooien. Dat dit stil mislukte is precies
      // waarom niemand jarenlang zag dat de app een account toonde dat git
      // nooit had gekregen.
      mislukt.push(stap.soort)
      fouten[stap.soort] = String((e && e.stderr) || (e && e.message) || '').trim().slice(0, 300)
    }
  }
  return { ok: !!gedaan.length, gedaan, mislukt, fouten }
})

// ── Klopt wat de app zegt met wat git doet? ──────────────────────────────────
// Drie vragen die het paneel niet stelde en die alle drie fout stonden:
//
//   wie commit hier      -> user.name/user.email van déze map
//   wie pusht hier       -> welk account de credential helper teruggeeft
//   mag die ook pushen   -> `git ls-remote` zegt dat niet, dat is lezen
//
// Alles wat niet te meten is komt als null terug; daar hoort het paneel dan
// ook over te zwijgen.
ipcMain.handle('git:koppelingDiagnose', (_, dir) => {
  if (!padToegestaan(dir)) return null
  const leeg = {
    identiteit: { naam: '', email: '' }, credentialGebruiker: '',
    ghActief: '', viaGh: false, pushRecht: null, remote: '',
  }
  if (!dir || !fs.existsSync(dir) || !heeftGit()) return leeg

  const ident = GitTools.parseIdentiteit(gitUit(dir, ['config', '--get-regexp', '^user\\.(name|email)$']))
  const helpers = String(gitUit(dir, ['config', '--get-all', 'credential.https://github.com.helper']) || '')
    + String(gitUit(dir, ['config', '--get-all', 'credential.helper']) || '')
  const viaGh = /gh(\.exe)?['"]? auth git-credential/i.test(helpers)

  // Wie zou git zijn als hij nú naar github.com ging? Dat is de vraag die de
  // 403 verklaarde. Nooit om een wachtwoord vragen: dit draait onzichtbaar.
  let credentialGebruiker = ''
  try {
    const uit = execFileSync('git', ['credential', 'fill'], {
      cwd: dir, encoding: 'utf8', timeout: 8000, windowsHide: true,
      input: 'protocol=https\nhost=github.com\n\n',
      env: childEnv({ GIT_TERMINAL_PROMPT: '0', GCM_INTERACTIVE: 'never' }),
      stdio: ['pipe', 'pipe', 'ignore'],
    })
    const m = String(uit || '').match(/^username=(.*)$/m)
    credentialGebruiker = m ? m[1].trim() : ''
  } catch { credentialGebruiker = '' }

  let ghActief = ''
  let pushRecht = null
  const remote = String(gitUit(dir, ['remote', 'get-url', 'origin']) || '').trim()
  if (ghBeschikbaar()) {
    try {
      const uit = execFileSync('gh', ['auth', 'status', '--hostname', 'github.com'], {
        encoding: 'utf8', timeout: 8000, windowsHide: true, env: childEnv(),
        stdio: ['ignore', 'pipe', 'pipe'],
      })
      const m = String(uit || '').match(/account\s+([A-Za-z0-9-]+)/i)
      ghActief = m ? m[1] : ''
    } catch { ghActief = '' }

    const rp = GitTools.ghRepoUitUrl(remote)
    if (rp) {
      try {
        const uit = execFileSync('gh', ['api', `repos/${rp.eigenaar}/${rp.repo}`, '--jq', '.permissions.push'], {
          encoding: 'utf8', timeout: 8000, windowsHide: true, env: childEnv(),
          stdio: ['ignore', 'pipe', 'ignore'],
        })
        const t = String(uit || '').trim()
        pushRecht = t === 'true' ? true : t === 'false' ? false : null
      } catch { pushRecht = null }
    }
  }

  return { identiteit: ident, credentialGebruiker, ghActief, viaGh, pushRecht, remote }
})

// Git zijn inloggegevens bij gh laten ophalen. Dat is de enige manier om er
// één account van te maken: zonder dit houdt de Windows-kluis zijn eigen
// account bij en pusht git als iemand anders dan de app laat zien.
ipcMain.handle('git:viaGhInloggen', () => {
  if (!ghBeschikbaar()) return { ok: false, reden: 'geen-gh' }
  try {
    execFileSync('gh', ['auth', 'setup-git'], {
      cwd: os.homedir(), encoding: 'utf8', timeout: 15000, windowsHide: true,
      env: childEnv(), stdio: ['ignore', 'pipe', 'pipe'],
    })
    return { ok: true }
  } catch (e) {
    return { ok: false, reden: 'mislukt', fout: String((e && e.stderr) || (e && e.message) || '').trim().slice(0, 300) }
  }
})

// Wie ben je volgens GitHub? Na het inloggen weet gh dat, dus hoeft niemand
// zijn naam en adres over te typen.
ipcMain.handle('git:ghIdentiteit', (_, gebruiker) => {
  // Staan er meerdere GitHub-accounts op deze pc, dan haalt `gh api user` die
  // van de áctieve op — en dat is niet per se degene die je bedoelde. Vandaar
  // dat de renderer hier een naam mee kan geven: eerst wisselen, dan ophalen.
  // Dit is de fout waarbij het verkeerde account aan een profiel kwam te hangen.
  const gewenst = String(gebruiker || '').trim()
  if (gewenst && ghBeschikbaar()) {
    try {
      execFileSync('gh', ['auth', 'switch', '--hostname', 'github.com', '--user', gewenst], {
        encoding: 'utf8', timeout: 8000, windowsHide: true, env: childEnv(),
        stdio: ['ignore', 'pipe', 'pipe'],
      })
    } catch { /* lukt het niet, dan valt hij terug op het actieve account */ }
  }
  // Mislukken mag, maar dan moet er wél staan waaróm. "Kon je gegevens niet
  // ophalen" laat iemand met lege handen achter; met de reden erbij weet je of
  // je moet inloggen, installeren, of gewoon zelf invullen.
  if (!ghBeschikbaar()) return { ok: false, reden: 'geen-gh' }

  let laatsteFout = ''
  const roep = (pad) => {
    try {
      return execFileSync('gh', ['api', pad], {
        encoding: 'utf8', timeout: 8000, windowsHide: true, env: childEnv(),
        stdio: ['ignore', 'pipe', 'pipe'],
      })
    } catch (e) {
      laatsteFout = String((e && (e.stderr || e.message)) || '').trim().split('\n')[0]
      return ''
    }
  }

  const user = GitTools.parseGhUser(roep('user'))
  if (user) {
    // Het adressenlijstje vereist een extra recht (user:email). Lukt dat niet,
    // dan valt ghIdentiteit terug op het noreply-adres — dat werkt altijd en
    // houdt een privéadres uit een publieke geschiedenis.
    const email = GitTools.parseGhEmails(roep('user/emails'))
    return { ok: true, identiteit: GitTools.ghIdentiteit(user, email) }
  }

  // De API kan mislukken terwijl je wél ingelogd bent: geen netwerk, een token
  // zonder de juiste rechten, een proxy op het werk. `gh auth status` weet dan
  // nog steeds je gebruikersnaam, en daarmee kunnen we de identiteit alsnog
  // opbouwen — met het noreply-adres, dat altijd werkt.
  let statusUit = ''
  try {
    statusUit = execFileSync('gh', ['auth', 'status'], {
      encoding: 'utf8', timeout: 6000, windowsHide: true, env: childEnv(),
      stdio: ['ignore', 'pipe', 'pipe'],
    })
  } catch (e) { statusUit = String((e && (e.stdout || e.stderr)) || '') }

  const namen = GitTools.parseGhAccounts(statusUit)
  if (namen.length) {
    const login = namen[0]
    return {
      ok: true, viaStatus: true,
      identiteit: { gitNaam: login, gitEmail: GitTools.noreplyEmail(null, login), ghGebruiker: login },
    }
  }

  return { ok: false, reden: 'niet-ingelogd', detail: laatsteFout }
})

// Inloggen bij GitHub, met de app als tussenpersoon.
//
// `gh auth login --web` is interactief: het toont een code van acht tekens en
// wacht daarna op Enter voordat het je browser opent. In de gewone terminal van
// de app kun je niets intypen en de uitvoer niet selecteren, dus daar blijft
// het staan wachten op iets wat niemand kan geven. Daarom voeren we die
// dialoog hier: we vangen code én adres op, sturen ze naar het venster zodat
// je ze kunt kopiëren, en drukken zelf op Enter.
//
// `geenBrowser`: gh mag de standaardbrowser níét openen. Die is vaak al
// ingelogd met het eerste account; een tweede koppeling keurt GitHub dan goed
// voor dát account. De gebruiker plakt de link zelf in een privévenster.
function ghBrowserNoop() {
  if (process.platform === 'win32') {
    return path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'where.exe')
  }
  return 'true'
}

ipcMain.handle('git:ghLogin', (_, opties = {}) => new Promise((resolve) => {
  if (!ghBeschikbaar()) { resolve({ ok: false, reden: 'geen-gh' }); return }

  const extra = {}
  if (opties && opties.geenBrowser) extra.GH_BROWSER = ghBrowserNoop()

  const proc = spawn('gh', ['auth', 'login', '--hostname', 'github.com', '--git-protocol', 'https', '--web'], {
    env: childEnv(extra), windowsHide: true, shell: false,
  })

  let alles = ''
  let laatsteInfo = ''
  let enterGestuurd = false

  const bekijk = (brok) => {
    alles += brok
    if (alles.length > 20000) alles = alles.slice(-20000)

    // Code én adres, ook als gh de oauth-pagina gebruikt in plaats van de
    // device-code. Zonder adres is "Kopieer link" niks waard; zonder code mag
    // het venster de link nog steeds tonen.
    const code = GitTools.parseGhLoginCode(alles)
    const url = GitTools.parseGhLoginUrl(alles) || (code ? 'https://github.com/login/device' : '')
    if (code || url) {
      const key = code + '|' + url
      if (key !== laatsteInfo) {
        laatsteInfo = key
        try { if (win && !win.isDestroyed()) win.webContents.send('git:ghCode', { code, url }) } catch {}
      }
    }

    // "Press Enter to open github.com in your browser" — dat doen wij, zodat
    // niemand in een terminal hoeft te typen die geen toetsenbord heeft.
    if (!enterGestuurd && /press enter/i.test(alles)) {
      enterGestuurd = true
      try { proc.stdin.write('\n') } catch {}
    }
  }

  proc.stdout.on('data', d => bekijk(d.toString()))
  proc.stderr.on('data', d => bekijk(d.toString()))   // gh schrijft dit meeste naar stderr

  const klaar = (code) => {
    // Niet op de exitcode afgaan maar op de werkelijkheid: is er nu een account?
    let ingelogd = false
    let accounts = []
    try {
      const uit = execFileSync('gh', ['auth', 'status'], {
        encoding: 'utf8', timeout: 6000, windowsHide: true, env: childEnv(),
        stdio: ['ignore', 'pipe', 'pipe'],
      })
      accounts = GitTools.parseGhAccounts(uit)
    } catch (e) {
      accounts = GitTools.parseGhAccounts(String((e && (e.stdout || e.stderr)) || ''))
    }
    ingelogd = accounts.length > 0
    resolve({ ok: ingelogd, accounts, code, uitvoer: alles.slice(-1200) })
  }

  proc.on('error', () => resolve({ ok: false, reden: 'start-mislukt' }))
  proc.on('close', klaar)

  // Blijft het hangen — browser nooit geopend, code nooit ingevuld — dan houdt
  // het na vijf minuten op in plaats van voor altijd te blijven staan.
  setTimeout(() => { try { proc.kill() } catch {} }, 5 * 60 * 1000)
}))

// Geïnstalleerd én ingelogd zijn twee verschillende dingen. Alleen kijken of
// gh bestaat is precies waarom het ophalen doodliep bij iemand die hem wél had
// maar nooit had ingelogd.
ipcMain.handle('git:ghStatus', () => {
  if (!ghBeschikbaar()) return { geinstalleerd: false, ingelogd: false, accounts: [] }
  let uit = ''
  try {
    uit = execFileSync('gh', ['auth', 'status'], {
      encoding: 'utf8', timeout: 6000, windowsHide: true, env: childEnv(),
      stdio: ['ignore', 'pipe', 'pipe'],
    })
  } catch (e) { uit = String((e && (e.stdout || e.stderr)) || '') }

  const accounts = GitTools.parseGhAccounts(uit)
  return { geinstalleerd: true, ingelogd: accounts.length > 0, accounts }
})

// Welke GitHub-accounts staan al klaar op deze pc?
ipcMain.handle('git:ghAccounts', () => {
  if (!ghBeschikbaar()) return []
  try {
    const uit = execFileSync('gh', ['auth', 'status'], {
      encoding: 'utf8', timeout: 6000, windowsHide: true, env: childEnv(), stdio: ['ignore', 'pipe', 'pipe'],
    })
    return GitTools.parseGhAccounts(uit)
  } catch (e) {
    // gh schrijft de status naar stderr als je niet ingelogd bent; die tekst
    // bevat soms alsnog de accounts die wél bekend zijn.
    return GitTools.parseGhAccounts((e && (e.stdout || e.stderr)) || '')
  }
})

// De repositories van het GitHub-account, zodat je bij "project toevoegen" uit
// je eigen lijst kunt kiezen in plaats van een adres over te typen. Mislukken
// mag, maar dan staat erbij waaróm: zonder gh is de uitweg installeren, zonder
// login is het inloggen, en zonder netwerk helpt geen van beide.
ipcMain.handle('git:ghRepos', (_, opties = {}) => {
  if (!ghBeschikbaar()) return { ok: false, reden: 'geen-gh', repos: [] }

  // Meerdere GitHub-accounts op deze pc: eerst naar dat van dit CommandDeck-
  // account, anders krijg je de repositories van iemand anders te zien.
  const gewenst = String((opties && opties.gebruiker) || '').trim()
  if (gewenst) {
    try {
      execFileSync('gh', ['auth', 'switch', '--hostname', 'github.com', '--user', gewenst], {
        encoding: 'utf8', timeout: 8000, windowsHide: true, env: childEnv(),
        stdio: ['ignore', 'pipe', 'pipe'],
      })
    } catch { /* niet kunnen wisselen is geen reden om niets te tonen */ }
  }

  let laatsteFout = ''
  const roep = (args) => {
    try {
      return execFileSync('gh', args, {
        encoding: 'utf8', timeout: 20000, windowsHide: true, env: childEnv(),
        maxBuffer: 8 * 1024 * 1024, stdio: ['ignore', 'pipe', 'pipe'],
      })
    } catch (e) {
      laatsteFout = String((e && (e.stderr || e.message)) || '').trim().split('\n')[0]
      return ''
    }
  }

  const velden = 'nameWithOwner,name,url,description,isPrivate,updatedAt'
  let repos = GitTools.parseGhRepos(roep(['repo', 'list', '--limit', '200', '--json', velden]))

  // Oudere gh kent `--json` niet. Dan via de API, die dezelfde gegevens onder
  // andere namen teruggeeft — parseGhRepos snapt beide vormen.
  if (!repos.length) {
    repos = GitTools.parseGhRepos(roep(['api', 'user/repos?per_page=100&sort=updated']))
  }

  if (repos.length) return { ok: true, repos }
  if (!laatsteFout) return { ok: true, repos: [] }        // echt geen repositories
  const ingelogd = !/auth login|not logged|niet ingelogd/i.test(laatsteFout)
  return { ok: false, reden: ingelogd ? 'mislukt' : 'niet-ingelogd', fout: laatsteFout, repos: [] }
})

ipcMain.handle('git:gh', () => ghBeschikbaar())

// Kan deze pc überhaupt met winget installeren? Op oudere Windows-versies en
// op dichtgetimmerde werk-pc's niet, en dan is een installeerknop een knop die
// alleen maar een foutmelding oplevert.
let wingetAanwezig = null
ipcMain.handle('git:winget', () => {
  if (wingetAanwezig === null) {
    try {
      execFileSync('winget', ['--version'], {
        encoding: 'utf8', timeout: 6000, windowsHide: true, env: childEnv(),
        stdio: ['ignore', 'pipe', 'ignore'],
      })
      wingetAanwezig = true
    } catch { wingetAanwezig = false }
  }
  return wingetAanwezig
})

// Na een inlog is de uitkomst veranderd; anders blijft de app zeggen dat gh
// er niet is omdat hij dat één keer heeft gemeten.
// Na een installatie is het pad veranderd en staat de gebruiker te wachten of
// het gelukt is. Dán mag het even blokkeren: een verkeerd antwoord hier laat een
// geslaagde installatie op een mislukte lijken.
ipcMain.handle('git:ghVergeet', () => {
  ghAanwezig = null
  gitAanwezig = null
  try { windowsPathNu() } catch { windowsPathCache = { at: 0, value: '' } }
  return true
})

// ── Mapgroottes ───────────────────────────────────────────────────────────────
// Windows houdt nergens bij hoe groot een map is; dat moet je uitrekenen door de
// hele boom te doorlopen. Bij node_modules zijn dat tienduizenden bestanden, bij
// C:\Windows loopt het in de minuten. Daarom: async lopen (zodat het venster
// blijft reageren), afbreken zodra je wegnavigeert, en een tijdslimiet waarna we
// melden dat het er mínstens zoveel zijn.
let grootteRonde = 0

async function meetMap(start, isVerlopen, budgetMs) {
  const eind = Date.now() + budgetMs
  const stapel = [start]
  let bytes = 0, bestanden = 0, mappen = 0, deels = false

  while (stapel.length) {
    if (isVerlopen()) return { afgebroken: true, bytes, bestanden, mappen, deels: true }
    if (Date.now() >= eind) { deels = true; break }

    const map = stapel.pop()
    let inhoud
    try { inhoud = await fs.promises.readdir(map, { withFileTypes: true }) } catch { continue }

    const teMeten = []
    for (const d of inhoud) {
      // Snelkoppelingen niet volgen: anders tel je dingen dubbel of loop je rond
      if (d.isSymbolicLink()) continue
      const vol = path.join(map, d.name)
      if (d.isDirectory()) { stapel.push(vol); mappen++; continue }
      teMeten.push(vol)
    }

    // De bestanden van deze map in één keer opvragen: veel sneller dan één voor
    // één wachten, en het venster blijft ondertussen reageren.
    const maten = await Promise.all(teMeten.map(v => fs.promises.stat(v).then(st => st.size, () => null)))
    for (const m of maten) if (m !== null) { bytes += m; bestanden++ }
  }

  return { afgebroken: false, bytes, bestanden, mappen, deels }
}

ipcMain.handle('fs:mapGrootte', async (_, { path: dir, ronde = 0, budget } = {}) => {
  try {
    if (!dir) return { ok: false, reason: 'geen pad' }
    if (ronde > grootteRonde) grootteRonde = ronde
    const verlopen = () => ronde !== grootteRonde

    let st
    try { st = await fs.promises.stat(dir) } catch { return { ok: false, reason: 'bestaat niet' } }
    if (!st.isDirectory()) return { ok: true, path: dir, bytes: st.size, bestanden: 1, mappen: 0, deels: false }

    const r = await meetMap(dir, verlopen, Number.isFinite(budget) ? budget : 12000)
    if (r.afgebroken) return { ok: false, reason: 'afgebroken', path: dir }
    return { ok: true, path: dir, ...r }
  } catch (e) {
    return { ok: false, reason: e.message }
  }
})

// Wegnavigeren: alles wat nog loopt mag stoppen
ipcMain.handle('fs:stopGroottes', () => { grootteRonde++; return { ok: true, ronde: grootteRonde } })

// ── Archieven ─────────────────────────────────────────────────────────────────
// Zip lezen we zelf; voor rar en 7z is 7-Zip of WinRAR nodig. Een pad binnen een
// archief schrijven we als  C:\map\archief.zip::submap/bestand.txt
const ARCHIEF_SCHEIDING = '::'

function splitsArchiefPad(p) {
  const i = String(p || '').indexOf(ARCHIEF_SCHEIDING)
  if (i < 0) return null
  return { archief: p.slice(0, i), binnen: p.slice(i + ARCHIEF_SCHEIDING.length).replace(/^\/+/, '') }
}

ipcMain.handle('arch:tool', () => {
  const t = zoekHulpprogramma()
  return t ? { ok: true, ...t } : { ok: false }
})

// Alle items in een archief, of null als het geen archief is
async function leesArchief(archief) {
  if (isZipArchief(archief)) return leesZip(archief)
  const tool = zoekHulpprogramma()
  if (!tool) {
    const e = new Error('Voor dit type archief is 7-Zip of WinRAR nodig. Rar is een gesloten formaat; zonder zo\'n programma kan niemand erin kijken.')
    e.geenTool = true
    throw e
  }
  return leesViaHulpprogramma(archief, tool)
}

// Toont één niveau van een archief, alsof het een map is
ipcMain.handle('arch:list', async (_, p) => {
  try {
    const gesplitst = splitsArchiefPad(p)
    const archief = gesplitst ? gesplitst.archief : p
    const binnen  = gesplitst ? gesplitst.binnen.replace(/\/+$/, '') : ''

    if (!fs.existsSync(archief)) return { ok: false, reason: 'bestaat niet' }
    const alles = await leesArchief(archief)

    const voorvoegsel = binnen ? binnen + '/' : ''
    const gezien = new Map()

    for (const item of alles) {
      if (voorvoegsel && !item.name.startsWith(voorvoegsel)) continue
      const rest = item.name.slice(voorvoegsel.length).replace(/\/+$/, '')
      if (!rest) continue

      const stukjes = rest.split('/')
      const naam = stukjes[0]
      const isMap = stukjes.length > 1 || item.dir
      if (gezien.has(naam) && !isMap) continue
      if (gezien.has(naam)) continue

      gezien.set(naam, {
        name: naam,
        path: archief + ARCHIEF_SCHEIDING + voorvoegsel + naam,
        dir: isMap,
        size: isMap ? 0 : item.size,
        mtime: item.mtime || 0,
        inArchief: true,
      })
    }

    const items = [...gezien.values()]
      .sort((a, b) => (b.dir - a.dir) || a.name.localeCompare(b.name, 'nl', { sensitivity: 'base' }))

    const omhoog = binnen
      ? archief + ARCHIEF_SCHEIDING + binnen.split('/').slice(0, -1).join('/')
      : path.dirname(archief)

    return { ok: true, path: p, parent: omhoog, items, archief: true }
  } catch (e) {
    return { ok: false, reason: e.message, geenTool: !!e.geenTool }
  }
})

// Een bestand uit een archief naar een tijdelijke map halen en openen
ipcMain.handle('arch:open', async (_, p) => {
  try {
    const gesplitst = splitsArchiefPad(p)
    if (!gesplitst) return { ok: false, reason: 'geen archiefpad' }

    const map = fs.mkdtempSync(path.join(os.tmpdir(), 'fl-arch-'))
    let doel

    if (isZipArchief(gesplitst.archief)) {
      const data = pakZipUit(gesplitst.archief, gesplitst.binnen)
      doel = path.join(map, path.basename(gesplitst.binnen))
      fs.writeFileSync(doel, data)
    } else {
      const tool = zoekHulpprogramma()
      if (!tool) return { ok: false, reason: 'Voor dit type archief is 7-Zip of WinRAR nodig.', geenTool: true }
      doel = await pakUitViaHulpprogramma(gesplitst.archief, gesplitst.binnen, map, tool)
    }

    // Uit een archief komt het bestand altijd uit een tijdelijke map; dat is
    // een kopie, dus aanpassingen belanden niet terug in het archief.
    await shell.openPath(doel)
    return { ok: true, path: doel }
  } catch (e) {
    return { ok: false, reason: e.message }
  }
})

// ── Netwerkmappen (UNC) ──────────────────────────────────────────────────────
// Een UNC-pad naar een server die niet antwoordt laat fs.existsSync 28 seconden
// hangen. Gemeten, geen schatting. Dit draait in het hoofdproces, dus dat is
// geen trage lijst maar een bevroren venster.
//
// En het is erger dan het lijkt. Zo'n vastzittende lookup houdt een thread uit
// de libuv-pool bezet, en die pool is standaard vier threads groot. Met een
// handvol dode paden erin duurde een doodgewone stat op C:\Windows 29 seconden.
// Eén onbereikbare netwerkmap legt dus álle bestands-IO van de app stil, ook
// het lezen van je eigen schijf.
//
// Vandaar drie regels, en alle drie zijn ze nodig:
//   - nooit synchroon aankloppen (async houdt de event loop vrij)
//   - nooit meer dan één probe tegelijk (anders is de threadpool zo op)
//   - het antwoord onthouden (anders klop je bij elke tekenronde opnieuw aan)
//
// Een bereikbare share antwoordt in ~6 ms, dus wie gewoon verbinding heeft merkt
// hier niets van.
const NETWERK_TIMEOUT_MS = 2000
const NETWERK_GOED_TTL   = 5 * 60 * 1000
const NETWERK_STUK_TTL   = 60 * 1000
const netwerkCache = new Map()        // wortel (kleine letters) -> { ok, tijd }
let netwerkRij = Promise.resolve()    // probes achter elkaar, niet naast elkaar

const netwerkSleutel = (pad) => String(pad || '').replace(/[\\/]+$/, '').toLowerCase()

function netwerkUitCache(pad) {
  const sleutel = netwerkSleutel(pad)
  const hit = netwerkCache.get(sleutel)
  if (!hit) return null
  if (Date.now() - hit.tijd > (hit.ok ? NETWERK_GOED_TTL : NETWERK_STUK_TTL)) {
    netwerkCache.delete(sleutel)
    return null
  }
  return hit
}

// Geeft een belofte terug, nooit een blokkade. De tijdslimiet is er om snel
// antwoord te kunnen geven; de thread die eronder vastzit laten we los, die komt
// vanzelf vrij als Windows het opgeeft. Daarom blijft het antwoord ook staan:
// meteen opnieuw proberen zou precies die thread weer bezet houden.
function netwerkBereikbaar(pad) {
  const bekend = netwerkUitCache(pad)
  if (bekend) return Promise.resolve(bekend.ok)
  netwerkRij = netwerkRij.then(async () => {
    // Terwijl we in de rij stonden kan een ander dit al hebben uitgezocht.
    const nogSteeds = netwerkUitCache(pad)
    if (nogSteeds) return nogSteeds.ok
    let tijdje
    const ok = await Promise.race([
      fs.promises.stat(pad).then(() => true, () => false),
      new Promise(r => { tijdje = setTimeout(() => r(false), NETWERK_TIMEOUT_MS) }),
    ])
    clearTimeout(tijdje)
    netwerkCache.set(netwerkSleutel(pad), { ok, tijd: Date.now() })
    return ok
  }).catch(() => false)
  return netwerkRij
}

// De wortel waar dit pad bij hoort, zodat er één antwoord per share in de cache
// staat en niet één per submap.
function netwerkWortelVan(pad) {
  return GitTools.uncWortel(pad) || ''
}

function netwerkWortels() {
  const lijst = loadSettings().netwerkWortels
  return (Array.isArray(lijst) ? lijst : [])
    .map(p => String(p || '').trim())
    .filter(p => GitTools.isUncPad(p))
}

// Beschikbare schijven, met de vrije ruimte erbij voor het overzicht "Deze pc"
// Welke letters een netwerkschijf zijn (P:, Z:, …). Eén PowerShell-ronde voor
// alles tegelijk — GetDriveType per letter zou N ronden kosten. Cache kort, zodat
// listDrives niet elke boom-refresh PowerShell start, maar een net use tussendoor
// wél binnen een minuut zichtbaar wordt.
let netwerkLetterCache = { letters: null, tot: 0 }

function netwerkSchijfLetters() {
  if (process.platform !== 'win32') return new Set()
  if (netwerkLetterCache.letters && Date.now() < netwerkLetterCache.tot) {
    return netwerkLetterCache.letters
  }
  const letters = new Set()
  try {
    // DriveType Network = gekoppelde share. Lokaal (Fixed/Removable/CDRom) blijft
    // erbuiten; UNC-wortels gaan apart mee via netwerkWortels().
    const uit = execFileSync('powershell.exe', [
      '-NoProfile', '-Command',
      "[IO.DriveInfo]::GetDrives() | Where-Object { $_.DriveType -eq 'Network' } | ForEach-Object { $_.Name.Substring(0,1) }",
    ], { encoding: 'utf8', timeout: 5000, windowsHide: true, stdio: ['ignore', 'pipe', 'ignore'] })
    for (const regel of String(uit).split(/\r?\n/)) {
      const l = regel.trim().toUpperCase()
      if (/^[A-Z]$/.test(l)) letters.add(l)
    }
  } catch {}
  netwerkLetterCache = { letters, tot: Date.now() + 60_000 }
  return letters
}

ipcMain.handle('fs:listDrives', async () => {
  const uit = []
  const netwerkLetters = netwerkSchijfLetters()
  for (let i = 65; i <= 90; i++) {
    const letter = String.fromCharCode(i)
    const d = letter + ':\\'
    try {
      if (!fs.existsSync(d)) continue
      let free = 0, total = 0
      // statfs bestaat pas vanaf nieuwere Node-versies; zonder is het geen ramp.
      try {
        const st = fs.statfsSync(d)
        free  = st.bsize * st.bfree
        total = st.bsize * st.blocks
      } catch {}
      uit.push({
        path: d, free, total,
        // cmd heeft op een letter geen UNC-probleem, maar git-begeleiding wél:
        // werkkopie op SMB is afgeraden. Vandaar deze markering.
        netwerk: netwerkLetters.has(letter),
      })
    } catch {}
  }

  // De netwerkmappen erachteraan. Hier wordt bewust niet op een probe gewacht:
  // de boom moet meteen kunnen tekenen, ook als een server er niet is. Wat we al
  // weten gaat mee, de rest wordt op de achtergrond opgezocht en staat er de
  // volgende ronde bij. `bereikbaar: null` betekent dus "weten we nog niet",
  // niet "stuk".
  for (const pad of netwerkWortels()) {
    if (uit.some(d => netwerkSleutel(d.path) === netwerkSleutel(pad))) continue
    const bekend = netwerkUitCache(pad)
    if (!bekend) netwerkBereikbaar(pad).catch(() => {})
    uit.push({
      path: pad,
      // Vrije ruimte opvragen kan alleen synchroon, en dat is precies wat hier
      // niet mag. De boom gebruikt het niet; de verkenner toont dan niets.
      free: 0, total: 0,
      netwerk: true,
      bereikbaar: bekend ? bekend.ok : null,
    })
  }
  return uit
})

ipcMain.handle('fs:netwerkWortels', () => netwerkWortels().map(pad => ({
  pad,
  naam: GitTools.uncNaam(pad),
  bereikbaar: (netwerkUitCache(pad) || {}).ok ?? null,
})))

ipcMain.handle('fs:netwerkWortelToevoegen', async (_, ruw) => {
  const pad = String(ruw || '').trim().replace(/[\\/]+$/, '')
  if (!GitTools.isUncPad(pad)) return { ok: false, reden: 'geen-netwerkpad' }
  const wortel = GitTools.uncWortel(pad) || pad
  const s = loadSettings()
  const lijst = Array.isArray(s.netwerkWortels) ? s.netwerkWortels : []
  if (lijst.some(p => netwerkSleutel(p) === netwerkSleutel(wortel))) {
    return { ok: false, reden: 'staat-er-al', pad: wortel }
  }
  // Wél even kijken of het bestaat, maar met dezelfde tijdslimiet: iemand die
  // een typefout maakt hoort dat te horen, en niemand hoort er 28 seconden op
  // te wachten.
  const bereikbaar = await netwerkBereikbaar(wortel)
  if (!bereikbaar) return { ok: false, reden: 'niet-bereikbaar', pad: wortel }
  saveSettings({ ...s, netwerkWortels: [...lijst, wortel] })
  return { ok: true, pad: wortel, naam: GitTools.uncNaam(wortel) }
})

ipcMain.handle('fs:netwerkWortelWeg', (_, ruw) => {
  const s = loadSettings()
  const lijst = Array.isArray(s.netwerkWortels) ? s.netwerkWortels : []
  const over = lijst.filter(p => netwerkSleutel(p) !== netwerkSleutel(ruw))
  if (over.length === lijst.length) return { ok: false, reden: 'onbekend' }
  saveSettings({ ...s, netwerkWortels: over })
  netwerkCache.delete(netwerkSleutel(ruw))
  return { ok: true }
})

// ── Zoeken in submappen ───────────────────────────────────────────────────────
// Het filter in de verkenner kijkt alleen naar de map waar je staat. Dit loopt
// de mappen eronder af. Drie remmen, want een zoekopdracht op C:\ zou anders
// eindeloos doorlopen: een tijdslimiet, een maximum aantal treffers, en een
// rondenummer waarmee een nieuwe zoekopdracht de vorige stopzet.
let zoekRonde = 0

// Mappen die je bijna nooit zoekt maar wel enorm zijn. Ze worden niet
// overgeslagen — ze komen als laatste aan de beurt. Zonder dit loopt een
// zoekopdracht op C:\ eerst de hele Windows-map af (tienduizenden mappen) en is
// de tijd op voordat hij ooit bij je bureaublad komt. Gemeten op een nagebouwde
// C-schijf: een map op het bureaublad kwam pas na 2409 mappen in beeld, met deze
// volgorde na 4.
const ZOEK_RUIS = /^(windows|winsxs|\$recycle\.bin|system volume information|programdata|program files|program files \(x86\)|msocache|recovery|perflogs|\$windows\.~ws|\$windows\.~bt|onedrivetemp|node_modules|\.git|\.gradle|\.nuget|\.cache)$/i

// De zoektekst opdelen. Meerdere woorden moeten allemaal voorkomen, en * en ?
// werken zoals je verwacht: *.mp3, foto?.jpg. Dezelfde regels gelden voor het
// filter in de verkenner (zie renderer.js).
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

// Een term moet in de naam zitten. Zit er een schuine streep in de zoektekst,
// dan mag hij ook op het pad slaan — zo vind je "desktop\music".
function pastBijZoek(naam, relatiefPad, termen, padZoeken) {
  const n = String(naam || '').toLowerCase()
  // Schuine strepen gelijktrekken: "desktop/music" en "desktop\music" horen
  // allebei te werken, ongeacht hoe jij het intypt.
  const gelijk = (t) => String(t).toLowerCase().replace(/\//g, '\\')
  const p = gelijk((relatiefPad && relatiefPad !== '.' ? relatiefPad + '\\' : '') + naam)
  return termen.every(t => t.re
    ? (t.re.test(n) || (padZoeken && t.re.test(p)))
    : (n.includes(t.tekst) || (padZoeken && p.includes(gelijk(t.tekst)))))
}

ipcMain.handle('fs:stopZoeken', () => { zoekRonde++; return true })

ipcMain.handle('fs:zoek', async (_, opties = {}) => {
  const { root, vraag, token } = opties
  const max    = Math.min(2000, Math.max(1, Number(opties.max) || 500))
  const budget = Math.min(120000, Math.max(500, Number(opties.budget) || 30000))
  const naald  = String(vraag || '').trim().toLowerCase()
  const termen = zoekTermen(naald)
  const padZoeken = /[\\/]/.test(naald)

  if (!naald || !termen.length) return { ok: false, reason: 'niets om te zoeken' }
  if (!root || !fs.existsSync(root)) return { ok: false, reason: 'map bestaat niet' }

  const mijnRonde = ++zoekRonde
  const begin = Date.now()
  const treffers = []
  // Twee rijen: de gewone mappen eerst, de dikke systeemmappen daarna.
  const wachtrij = [{ pad: root, traag: false }]
  const traagRij = []
  let bekeken = 0
  let deels = false

  // Treffers gaan onderweg al naar het venster. Op een grote map duurt het
  // aflopen seconden; dan wil je niet naar een leeg scherm zitten kijken tot
  // alles klaar is.
  let mandje = []
  const stuurDoor = () => {
    if (!mandje.length) return
    if (win && !win.isDestroyed()) win.webContents.send('fs:zoekTreffers', { token, items: mandje })
    mandje = []
  }

  while (wachtrij.length || traagRij.length) {
    if (zoekRonde !== mijnRonde) return { ok: false, reason: 'afgebroken', afgebroken: true }
    if (treffers.length >= max)      { deels = true; break }
    if (Date.now() - begin > budget) { deels = true; break }

    const taak = wachtrij.length ? wachtrij.shift() : traagRij.shift()
    const map = taak.pad
    let inhoud
    try { inhoud = await fs.promises.readdir(map, { withFileTypes: true }) } catch { continue }
    bekeken++

    for (const d of inhoud) {
      const vol = path.join(map, d.name)
      // Snelkoppelingen niet volgen: die kunnen naar zichzelf terugwijzen en
      // dan loopt het zoeken rond in een kringetje.
      if (d.isSymbolicLink()) continue

      const isMap = d.isDirectory()
      if (isMap) {
        const traag = taak.traag || ZOEK_RUIS.test(d.name)
        ;(traag ? traagRij : wachtrij).push({ pad: vol, traag })
      }
      const waar = path.relative(root, path.dirname(vol)) || '.'
      if (!pastBijZoek(d.name, waar, termen, padZoeken)) continue
      if (treffers.length >= max) { deels = true; break }

      let size = 0, mtime = 0
      try { const st = await fs.promises.stat(vol); size = st.size; mtime = st.mtimeMs } catch {}
      const treffer = {
        name: d.name, path: vol, dir: isMap, size, mtime,
        verborgen: d.name.startsWith('.'),
        archief: !isMap && isArchief(d.name),
        // waar het gevonden is, gerekend vanaf de map waarin je zocht
        map: waar,
      }
      treffers.push(treffer)
      mandje.push(treffer)
      if (mandje.length >= 20) stuurDoor()
    }

    // Iedere paar mappen het roer teruggeven, zodat het venster blijft reageren
    // en een nieuwe zoekopdracht meteen kan afbreken.
    if (bekeken % 25 === 0) {
      stuurDoor()
      await new Promise(r => setImmediate(r))
    }
  }

  if (zoekRonde !== mijnRonde) return { ok: false, reason: 'afgebroken', afgebroken: true }
  stuurDoor()
  return {
    ok: true, root, vraag: naald, token, items: treffers, deels,
    mappenBekeken: bekeken,
    // waarom er gestopt is, zodat de app geen "niks gevonden" zegt terwijl het
    // eigenlijk "niet alles bekeken" is
    afgekapt: deels ? (treffers.length >= max ? 'genoeg' : 'tijd') : '',
  }
})

ipcMain.handle('shell:openFolder', (_, p) => shell.openPath(p))

// Een adres in de standaardbrowser openen. Alleen http en https: shell.openExternal
// start anders van alles op wat achter een schema kan zitten, en dat hoort niet
// vanuit een tekstregel te kunnen.
ipcMain.handle('shell:openUrl', (_, url) => {
  try {
    const u = new URL(String(url || ''))
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return false
    shell.openExternal(u.href)
    return true
  } catch { return false }
})

// ── Acties uit het rechtsklikmenu ─────────────────────────────────────────────
// Het "Openen met"-venster van Windows zelf, zodat je de lijst met programma's
// krijgt die je uit de verkenner kent.
ipcMain.handle('shell:openWith', (_, p) => {
  try {
    if (!p || !fs.existsSync(p)) return { ok: false, reason: 'bestaat niet' }
    spawn('rundll32.exe', ['shell32.dll,OpenAs_RunDLL', p], { windowsHide: false, detached: true }).unref()
    return { ok: true }
  } catch (e) { return { ok: false, reason: e.message } }
})

// Opent de verkenner met dit bestand al aangewezen
ipcMain.handle('shell:revealItem', (_, p) => {
  try {
    if (!p || !fs.existsSync(p)) return { ok: false, reason: 'bestaat niet' }
    shell.showItemInFolder(p)
    return { ok: true }
  } catch (e) { return { ok: false, reason: e.message } }
})

// Een naam die nog niet bestaat: "nieuw bestand.txt", "nieuw bestand (2).txt", …
function vrijeNaam(map, naam) {
  const ext = path.extname(naam)
  const basis = naam.slice(0, naam.length - ext.length)
  let p = path.join(map, naam)
  let n = 2
  while (fs.existsSync(p)) p = path.join(map, `${basis} (${n++})${ext}`)
  return p
}

ipcMain.handle('fs:nieuw', (_, { map, naam, isMap } = {}) => {
  try {
    if (!map || !fs.existsSync(map)) return { ok: false, reason: 'de map bestaat niet' }
    if (!naam || /[\\/:*?"<>|]/.test(naam)) return { ok: false, reason: 'die naam kan niet: \\ / : * ? " < > | mogen niet' }

    const doel = vrijeNaam(map, naam)
    if (isMap) fs.mkdirSync(doel)
    else fs.writeFileSync(doel, '')
    return { ok: true, path: doel, hernoemd: path.basename(doel) !== naam }
  } catch (e) { return { ok: false, reason: e.message } }
})

ipcMain.handle('arch:zip', (_, { paden, doel } = {}) => {
  try {
    if (!Array.isArray(paden) || !paden.length) return { ok: false, reason: 'er is niets gekozen' }
    const map = path.dirname(doel)
    if (!fs.existsSync(map)) return { ok: false, reason: 'de map bestaat niet' }
    const uit = vrijeNaam(map, path.basename(doel))
    const r = schrijfZip(uit, paden)
    return { ok: true, path: uit, ...r }
  } catch (e) { return { ok: false, reason: e.message } }
})

// ── Kopiëren, verplaatsen, verwijderen, hernoemen ─────────────────────────────
let kopieerAfgebroken = false
ipcMain.handle('fs:annuleer', () => { kopieerAfgebroken = true; return true })

function meldVoortgang(gegevens) {
  try { if (win && !win.isDestroyed()) win.webContents.send('fs:voortgang', gegevens) } catch {}
}

// Alles onder een pad, met de totale omvang — nodig om voortgang te kunnen tonen
function tellOp(p) {
  let bytes = 0, aantal = 0
  const loop = (q) => {
    let st
    try { st = fs.statSync(q) } catch { return }
    if (!st.isDirectory()) { bytes += st.size; aantal++; return }
    aantal++
    let kinderen = []
    try { kinderen = fs.readdirSync(q) } catch { return }
    for (const k of kinderen) loop(path.join(q, k))
  }
  loop(p)
  return { bytes, aantal }
}

// Kopiëren in stukjes, zodat een groot bestand af te breken is en je ziet
// hoever hij is. copyFileSync zou het venster laten bevriezen.
function kopieerBestand(bron, doel, ctx) {
  const grootte = fs.statSync(bron).size
  const inLezer = fs.openSync(bron, 'r')
  const uitLezer = fs.openSync(doel, 'w')
  const blok = Buffer.alloc(1024 * 1024)
  try {
    let gelezen
    while ((gelezen = fs.readSync(inLezer, blok, 0, blok.length, null)) > 0) {
      if (kopieerAfgebroken) throw new Error('afgebroken')
      fs.writeSync(uitLezer, blok, 0, gelezen)
      ctx.gedaan += gelezen
      const nu = Date.now()
      if (nu - ctx.laatsteMelding > 120) {
        ctx.laatsteMelding = nu
        meldVoortgang({ bezig: true, bestand: path.basename(bron), gedaan: ctx.gedaan, totaal: ctx.totaal })
      }
    }
  } finally {
    fs.closeSync(inLezer); fs.closeSync(uitLezer)
  }
  try { const st = fs.statSync(bron); fs.utimesSync(doel, st.atime, st.mtime) } catch {}
  if (grootte === 0) ctx.gedaan += 0
}

function kopieerRecursief(bron, doel, ctx) {
  if (kopieerAfgebroken) throw new Error('afgebroken')
  const st = fs.statSync(bron)
  if (!st.isDirectory()) { kopieerBestand(bron, doel, ctx); return }

  fs.mkdirSync(doel, { recursive: true })
  for (const k of fs.readdirSync(bron)) kopieerRecursief(path.join(bron, k), path.join(doel, k), ctx)
}

// Zit het doel ín de bron? Dan zou kopiëren zichzelf eindeloos herhalen.
function zitBinnen(map, mogelijkeOuder) {
  const a = path.resolve(map).toLowerCase()
  const b = path.resolve(mogelijkeOuder).toLowerCase()
  return a === b || a.startsWith(b + path.sep)
}

// Welke namen bestaan al op de bestemming?
ipcMain.handle('fs:conflicten', (_, { bronnen, doelMap } = {}) => {
  try {
    const uit = []
    for (const b of (bronnen || [])) {
      const doel = path.join(doelMap, path.basename(b))
      if (fs.existsSync(doel)) uit.push(path.basename(b))
    }
    return { ok: true, namen: uit }
  } catch (e) { return { ok: false, reason: e.message } }
})

ipcMain.handle('fs:kopieer', async (_, { bronnen, doelMap, verplaatsen, bijConflict = 'hernoemen' } = {}) => {
  kopieerAfgebroken = false
  try {
    if (!Array.isArray(bronnen) || !bronnen.length) return { ok: false, reason: 'er is niets gekozen' }
    if (!doelMap || !fs.existsSync(doelMap)) return { ok: false, reason: 'de doelmap bestaat niet' }

    for (const b of bronnen) {
      if (fs.existsSync(b) && fs.statSync(b).isDirectory() && zitBinnen(doelMap, b)) {
        return { ok: false, reason: `"${path.basename(b)}" kan niet in zichzelf geplaatst worden` }
      }
    }

    // Vooraf tellen, zodat de voortgang ergens op slaat
    let totaal = 0
    for (const b of bronnen) { if (fs.existsSync(b)) totaal += tellOp(b).bytes }
    const ctx = { gedaan: 0, totaal, laatsteMelding: 0 }
    meldVoortgang({ bezig: true, bestand: '', gedaan: 0, totaal })

    let gedaan = 0, overgeslagen = 0
    const fouten = []

    for (const bron of bronnen) {
      if (kopieerAfgebroken) break
      try {
        if (!fs.existsSync(bron)) { fouten.push(`${path.basename(bron)} bestaat niet meer`); continue }

        let doel = path.join(doelMap, path.basename(bron))
        if (path.resolve(bron).toLowerCase() === path.resolve(doel).toLowerCase()) {
          // Naar dezelfde plek: bij kopiëren een kopie ernaast, bij verplaatsen niets
          if (verplaatsen) { overgeslagen++; continue }
          doel = vrijeNaam(doelMap, path.basename(bron))
        } else if (fs.existsSync(doel)) {
          if (bijConflict === 'overslaan') { overgeslagen++; continue }
          if (bijConflict === 'hernoemen') doel = vrijeNaam(doelMap, path.basename(bron))
          else fs.rmSync(doel, { recursive: true, force: true })   // vervangen
        }

        // Binnen dezelfde schijf is verplaatsen één handeling; daarbuiten
        // moet het echt gekopieerd en daarna verwijderd worden.
        const zelfdeSchijf = path.parse(path.resolve(bron)).root.toLowerCase()
                          === path.parse(path.resolve(doel)).root.toLowerCase()
        if (verplaatsen && zelfdeSchijf) {
          fs.renameSync(bron, doel)
          ctx.gedaan += tellOp(doel).bytes
        } else {
          kopieerRecursief(bron, doel, ctx)
          if (verplaatsen) fs.rmSync(bron, { recursive: true, force: true })
        }
        gedaan++
      } catch (e) {
        if (/afgebroken/.test(e.message)) break
        fouten.push(`${path.basename(bron)}: ${e.message}`)
      }
    }

    meldVoortgang({ bezig: false })
    return { ok: true, gedaan, overgeslagen, fouten, afgebroken: kopieerAfgebroken }
  } catch (e) {
    meldVoortgang({ bezig: false })
    return { ok: false, reason: e.message }
  }
})

ipcMain.handle('fs:verwijder', async (_, { paden, definitief } = {}) => {
  try {
    if (!Array.isArray(paden) || !paden.length) return { ok: false, reason: 'er is niets gekozen' }
    let gedaan = 0
    const fouten = []
    for (const p of paden) {
      try {
        if (!fs.existsSync(p)) continue
        // De prullenbak is terug te draaien; definitief verwijderen niet.
        if (definitief) fs.rmSync(p, { recursive: true, force: true })
        else await shell.trashItem(p)
        gedaan++
      } catch (e) { fouten.push(`${path.basename(p)}: ${e.message}`) }
    }
    return { ok: true, gedaan, fouten }
  } catch (e) { return { ok: false, reason: e.message } }
})

ipcMain.handle('fs:hernoem', (_, { pad, naam } = {}) => {
  try {
    if (!pad || !fs.existsSync(pad)) return { ok: false, reason: 'bestaat niet' }
    if (!naam || /[\\/:*?"<>|]/.test(naam)) return { ok: false, reason: 'die naam kan niet: \\ / : * ? " < > | mogen niet' }

    const doel = path.join(path.dirname(pad), naam)
    if (path.resolve(doel).toLowerCase() === path.resolve(pad).toLowerCase()) return { ok: true, path: pad }
    if (fs.existsSync(doel)) return { ok: false, reason: 'er bestaat al iets met die naam' }

    fs.renameSync(pad, doel)
    return { ok: true, path: doel }
  } catch (e) { return { ok: false, reason: e.message } }
})

// ── Windows-klembord ──────────────────────────────────────────────────────────
// Electron kan zelf geen bestanden op het klembord zetten; het kent alleen
// tekst, HTML en afbeeldingen. Windows verwacht een bestandenlijst plus een
// vlaggetje dat aangeeft of het om kopiëren of knippen gaat. PowerShell kan dat
// wel, mits in STA-modus — het klembord van Windows vereist dat.
function klembordScript(paden, knippen) {
  const lijst = paden.map(p => `'${p.replace(/'/g, "''")}'`).join(',')
  return [
    'Add-Type -AssemblyName System.Windows.Forms',
    `$paden = @(${lijst})`,
    '$lijst = New-Object System.Collections.Specialized.StringCollection',
    'foreach ($p in $paden) { [void]$lijst.Add($p) }',
    '$data = New-Object System.Windows.Forms.DataObject',
    '$data.SetFileDropList($lijst)',
    // 2 = verplaatsen, 5 = kopiëren; dit is wat de verkenner uitleest
    `$vlag = [byte[]](${knippen ? '2' : '5'},0,0,0)`,
    '$stroom = New-Object System.IO.MemoryStream',
    '$stroom.Write($vlag, 0, 4)',
    '$data.SetData("Preferred DropEffect", $stroom)',
    '[System.Windows.Forms.Clipboard]::SetDataObject($data, $true)',
  ].join('; ')
}

ipcMain.handle('clip:zetBestanden', (_, { paden, knippen } = {}) => {
  return new Promise((resolve) => {
    try {
      const bestaand = (paden || []).filter(p => { try { return fs.existsSync(p) } catch { return false } })
      if (!bestaand.length) return resolve({ ok: false, reason: 'niets om te kopiëren' })

      const p = spawn('powershell.exe',
        ['-NoProfile', '-NonInteractive', '-STA', '-Command', klembordScript(bestaand, knippen)],
        { windowsHide: true })
      let fout = ''
      p.stderr.on('data', d => { fout += d.toString() })
      p.on('close', code => resolve(code === 0 ? { ok: true, aantal: bestaand.length } : { ok: false, reason: fout.trim() || 'klembord weigerde' }))
      p.on('error', () => resolve({ ok: false, reason: 'powershell niet gevonden' }))
    } catch (e) { resolve({ ok: false, reason: e.message }) }
  })
})

// Wat er op het Windows-klembord staat, zodat je ook vanuit de verkenner van
// Windows kunt kopiëren en hier plakken.
ipcMain.handle('clip:leesBestanden', () => {
  return new Promise((resolve) => {
    try {
      const script = [
        'Add-Type -AssemblyName System.Windows.Forms',
        '$d = [System.Windows.Forms.Clipboard]::GetDataObject()',
        'if ($d -eq $null -or -not $d.GetDataPresent("FileDrop")) { exit 0 }',
        '$effect = 5',
        'if ($d.GetDataPresent("Preferred DropEffect")) {',
        '  $s = $d.GetData("Preferred DropEffect"); $b = New-Object byte[] 4; [void]$s.Read($b,0,4); $effect = $b[0]',
        '}',
        'Write-Output ("EFFECT=" + $effect)',
        'foreach ($f in $d.GetData("FileDrop")) { Write-Output $f }',
      ].join('; ')

      const p = spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-STA', '-Command', script], { windowsHide: true })
      let uit = ''
      p.stdout.on('data', d => { uit += d.toString('utf8') })
      p.stderr.on('data', () => {})
      p.on('close', () => {
        const regels = uit.split(/\r?\n/).map(r => r.trim()).filter(Boolean)
        const eff = regels.find(r => r.startsWith('EFFECT='))
        const paden = regels.filter(r => !r.startsWith('EFFECT='))
        resolve({ ok: true, paden, knippen: eff ? eff.slice(7) === '2' : false })
      })
      p.on('error', () => resolve({ ok: false, paden: [] }))
    } catch { resolve({ ok: false, paden: [] }) }
  })
})

// Gegevens voor het eigenschappenvenster
ipcMain.handle('fs:info', (_, p) => {
  try {
    if (!p || !fs.existsSync(p)) return { ok: false, reason: 'bestaat niet' }
    const st = fs.statSync(p)
    return {
      ok: true,
      path: p,
      naam: path.basename(p),
      map: st.isDirectory(),
      size: st.size,
      gemaakt: st.birthtimeMs,
      gewijzigd: st.mtimeMs,
      alleenLezen: !(st.mode & 0o200),
    }
  } catch (e) { return { ok: false, reason: e.message } }
})
ipcMain.handle('shell:openCmd', (_, arg) => {
  // Mag een pad zijn, of { cwd, cmd } als er meteen iets moet draaien.
  const cwd = typeof arg === 'string' ? arg : arg?.cwd
  const cmd = typeof arg === 'string' ? '' : String(arg?.cmd || '').trim()
  if (!cwd || !fs.existsSync(cwd)) return { ok: false, viaLetter: false }

  // Op een netwerkpad kan `start "" /D <map> cmd.exe` niet: het venster opent
  // dan in C:\Windows zonder dat iemand het merkt. GitTools.vensterInMap maakt
  // er een pushd-regel van; op een gewoon pad geeft het null en blijft alles
  // zoals het was. viaLetter gaat mee terug zodat de renderer een toast kan
  // tonen — een los venster heeft geen uitvoerpaneel voor die melding.
  const viaLetter = GitTools.vensterInMap(cwd, cmd, true, process.platform === 'win32')
  if (viaLetter) {
    spawn(viaLetter, [], { detached: true, windowsHide: false, shell: true }).unref()
    return { ok: true, viaLetter: true }
  }

  if (cmd) {
    // /k houdt het venster open als het commando klaar is, zodat je de uitvoer
    // nog kunt lezen en gewoon door kunt typen.
    spawn('cmd.exe', ['/c', 'start', '""', '/D', cwd, 'cmd.exe', '/k', cmd], {
      detached: true, windowsHide: false, shell: false,
    }).unref()
    return { ok: true, viaLetter: false }
  }
  // Direct `spawn('cmd.exe', ...)` doesn't reliably pop a new visible window when
  // the Electron process has no console of its own to hand off (packaged .exe,
  // or even dev mode in some cases) — it can end up attached invisibly instead.
  // `start` explicitly asks Windows for a brand-new console window, same trick
  // already used elsewhere in this file (openClaudeDesktop, updateAndRestart).
  spawn('cmd.exe', ['/c', 'start', '""', '/D', cwd, 'cmd.exe'], {
    detached: true, windowsHide: false, shell: false,
  }).unref()
  return { ok: true, viaLetter: false }
})

ipcMain.handle('shell:openPs', (_, arg) => {
  const cwd = typeof arg === 'string' ? arg : arg?.cwd
  const cmd = typeof arg === 'string' ? '' : String(arg?.cmd || '').trim()
  if (!cwd || !fs.existsSync(cwd)) return false
  const start = psWindowLaunch(loadSettings().ps, cmd)
  // Geen pushd-omweg hier, en dat is gemeten en niet aangenomen: `start "" /D
  // <unc> powershell.exe` landde netjes op \\192.168.100.200\Projecten. `/D`
  // zelf kan een netwerkpad prima aan; het is cmd.exe als dóélprogramma dat het
  // weigert. Zie vensterInMap in git-tools.js.
  spawn('cmd.exe', ['/c', 'start', '""', '/D', cwd, start.exe, ...start.args], {
    detached: true, windowsHide: false, shell: false,
  }).unref()
  return true
})

// ── Bat-bestanden ─────────────────────────────────────────────────────────────
// Proefbestanden (~proef-…) zijn wegwerpspul van de proefdraai-knop en horen
// niet in de keuzelijst met bestaande bat-bestanden.
function isBat(f) { return /\.(bat|cmd)$/i.test(f) && !/^~proef-/i.test(f) }

// De .bat-bestanden in een map, nieuwste eerst
ipcMain.handle('bat:list', (_, cwd) => {
  try {
    if (!cwd || !fs.existsSync(cwd)) return []
    return fs.readdirSync(cwd)
      .filter(isBat)
      .map(name => {
        const full = path.join(cwd, name)
        let mtime = 0
        try { mtime = fs.statSync(full).mtimeMs } catch {}
        return { name, path: full, mtime }
      })
      .sort((a, b) => b.mtime - a.mtime)
  } catch { return [] }
})

// Altijd vers van schijf lezen, met de wijzigingstijd erbij zodat de renderer
// kan merken dat het bestand ondertussen elders is aangepast.
ipcMain.handle('bat:read', (_, filePath) => {
  try {
    if (!filePath || !fs.existsSync(filePath)) return { ok: false, reason: 'notfound' }
    return {
      ok: true,
      content: fs.readFileSync(filePath, 'utf8'),
      mtime: fs.statSync(filePath).mtimeMs,
    }
  } catch (e) { return { ok: false, reason: e.message } }
})

// Alleen de wijzigingstijd — om te controleren zonder het bestand te lezen
ipcMain.handle('bat:stat', (_, filePath) => {
  try {
    if (!filePath || !fs.existsSync(filePath)) return { ok: false, reason: 'notfound' }
    return { ok: true, mtime: fs.statSync(filePath).mtimeMs }
  } catch (e) { return { ok: false, reason: e.message } }
})

ipcMain.handle('bat:save', (_, { filePath, content } = {}) => {
  try {
    if (!filePath) return { ok: false, reason: 'nopath' }
    const dir = path.dirname(filePath)
    if (!fs.existsSync(dir)) return { ok: false, reason: 'nodir', dir }
    // Windows-regeleindes: cmd.exe struikelt over losse \n in sommige constructies
    fs.writeFileSync(filePath, String(content || '').replace(/\r?\n/g, '\r\n'), 'utf8')
    return { ok: true, path: filePath, mtime: fs.statSync(filePath).mtimeMs }
  } catch (e) { return { ok: false, reason: e.message } }
})

ipcMain.handle('bat:delete', (_, filePath) => {
  try {
    if (!filePath || !fs.existsSync(filePath)) return { ok: false, reason: 'notfound' }
    if (!isBat(path.basename(filePath)) && !/\.(bat|cmd)$/i.test(filePath)) {
      return { ok: false, reason: 'geen bat-bestand' }
    }
    fs.unlinkSync(filePath)
    return { ok: true }
  } catch (e) { return { ok: false, reason: e.message } }
})

ipcMain.handle('bat:exists', (_, filePath) => {
  try { return !!filePath && fs.existsSync(filePath) } catch { return false }
})

// Proefdraaien: de inhoud van de editor naar een tijdelijk bestand en dat in een
// eigen console starten. Een eigen venster, want een bat met `pause` erin zou in
// onze terminal blijven hangen — daar is geen toetsenbord om op te drukken.
ipcMain.handle('bat:test', (_, { dir, name, content } = {}) => {
  try {
    const target = dir && fs.existsSync(dir) ? dir : os.tmpdir()

    // Proefbestanden van een vorige keer opruimen
    try {
      for (const f of fs.readdirSync(target)) {
        if (/^~proef-.*\.(bat|cmd)$/i.test(f)) {
          try { fs.unlinkSync(path.join(target, f)) } catch {}
        }
      }
    } catch {}

    const base = String(name || 'script').replace(/\.(bat|cmd)$/i, '').replace(/[^\w.-]+/g, '-') || 'script'
    const file = path.join(target, `~proef-${base}.bat`)
    fs.writeFileSync(file, String(content || '').replace(/\r?\n/g, '\r\n'), 'utf8')

    // Een .bat wordt door cmd.exe gedraaid, dus dit loopt tegen dezelfde muur
    // aan als de cmd-knop: op een netwerkpad draaide de proef in C:\Windows.
    // `blijfOpen: false`, want een proefdraai hoort net als nu vanzelf te
    // sluiten als het script klaar is — met `pause` erin blijft hij staan.
    const viaLetter = GitTools.vensterInMap(target, `"${file}"`, false, process.platform === 'win32')
    if (viaLetter) {
      spawn(viaLetter, [], { detached: true, windowsHide: false, shell: true }).unref()
    } else {
      spawn('cmd.exe', ['/c', 'start', '""', '/D', target, file], {
        detached: true, windowsHide: false, shell: false,
      }).unref()
    }

    // viaLetter mee zodat de renderer een toast kan tonen — zelfde reden als
    // bij shell:openCmd: een los consolevenster heeft geen uitvoerpaneel.
    return { ok: true, path: file, dir: target, viaLetter: !!viaLetter }
  } catch (e) { return { ok: false, reason: e.message } }
})

// ── Exporteren naar exe ───────────────────────────────────────────────────────
// Het icoon van een exe zit in de resource-sectie van het PE-bestand. IExpress
// kan dat niet zetten, maar `resedit` wel — pure JavaScript, dus geen extern
// hulpprogramma dat meegeleverd of gedownload moet worden.
// Haalt de losse icoon-afbeeldingen uit wat de gebruiker aanwees. Naast .ico
// kan dat ook een programma of een snelkoppeling zijn — dat laatste bevat geen
// icoon maar een verwijzing ernaar, dus die volgen we door.
// Laat Windows zelf het icoon uit een bestand halen en als .ico wegschrijven.
// Terugval voor alles wat we niet zelf kunnen ontleden: werkt op programma's,
// snelkoppelingen en eigenlijk elk bestandstype, want dit is dezelfde bron als
// het icoon dat je in de verkenner ziet. Levert wel maar één formaat (32×32).
function extractIconViaWindows(bronPad) {
  return new Promise((resolve) => {
    const uit = path.join(os.tmpdir(), 'fl-icoon-' + Math.random().toString(36).slice(2, 8) + '.ico')
    const q = (p) => p.replace(/'/g, "''")
    const script = [
      'Add-Type -AssemblyName System.Drawing',
      `$i = [System.Drawing.Icon]::ExtractAssociatedIcon('${q(bronPad)}')`,
      'if ($i -eq $null) { exit 1 }',
      `$fs = [System.IO.File]::Create('${q(uit)}')`,
      '$i.Save($fs)',
      '$fs.Close()',
    ].join('; ')

    const p = spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script], { windowsHide: true })
    p.on('close', () => resolve(fs.existsSync(uit) ? uit : null))
    p.on('error', () => resolve(null))
  })
}

async function loadIconImages(iconPath, diepte = 0) {
  const { NtExecutable, NtExecutableResource, Data, Resource } = require('resedit')
  if (diepte > 3) throw new Error('te veel verwijzingen achter elkaar')
  if (!iconPath || !fs.existsSync(iconPath)) throw new Error('icoonbestand niet gevonden')

  const ext = path.extname(iconPath).toLowerCase()
  const uitIcoBestand = (p) => Data.IconFile.from(fs.readFileSync(p)).icons.map(i => i.data)

  if (ext === '.ico') return uitIcoBestand(iconPath)

  if (ext === '.lnk') {
    // Een snelkoppeling wijst naar een icoon (of, als dat niet ingesteld is,
    // naar het programma waar het icoon vandaan komt).
    try {
      const link = shell.readShortcutLink(iconPath)
      const bron = (link.icon && fs.existsSync(link.icon)) ? link.icon : link.target
      if (bron && fs.existsSync(bron)) return await loadIconImages(bron, diepte + 1)
    } catch {}
    // Uitlezen mislukt? Windows kent het icoon van deze snelkoppeling ook zelf.
  }

  // .exe / .dll / .cpl: het icoon uit de resource-sectie plukken.
  // ignoreCert is nodig omdat vrijwel elk echt programma digitaal ondertekend
  // is; zonder die vlag weigert de bibliotheek het bestand te openen. We lezen
  // hier alleen, dus aan de handtekening van dat bestand verandert niets.
  let eersteFout = null
  if (ext !== '.lnk') {
    try {
      const bronExe = NtExecutable.from(fs.readFileSync(iconPath), { ignoreCert: true })
      const bronRes = NtExecutableResource.from(bronExe)
      const groepen = Resource.IconGroupEntry.fromEntries(bronRes.entries)
      if (groepen.length) {
        // Niet de ruwe buffers pakken: replaceIconsForResource verwacht
        // IconItems, en die haal je hiermee compleet uit de resource-sectie —
        // alle formaten van de groep, met afmetingen en kleurdiepte erbij.
        const afbeeldingen = groepen[0].getIconItemsFromEntries(bronRes.entries)
        if (afbeeldingen.length) return afbeeldingen
      }
      eersteFout = 'in dit bestand zit geen icoon'
    } catch (e) {
      eersteFout = e.message
    }
  }

  // Zelf ontleden lukte niet — Windows om hulp vragen.
  const viaWindows = await extractIconViaWindows(iconPath)
  if (viaWindows) {
    try { return uitIcoBestand(viaWindows) }
    catch (e) { eersteFout = eersteFout || e.message }
    finally { try { fs.unlinkSync(viaWindows) } catch {} }
  }

  throw new Error(eersteFout || 'kon uit dit bestand geen icoon halen')
}

async function applyExeIcon(exePath, iconPath) {
  const { NtExecutable, NtExecutableResource, Resource } = require('resedit')

  const afbeeldingen = await loadIconImages(iconPath)
  // De exe van IExpress is niet ondertekend — we tekenen bewust niet — maar
  // mocht dat ooit veranderen, dan struikelt het inlezen hier niet over.
  const exe = NtExecutable.from(fs.readFileSync(exePath), { ignoreCert: true })
  const res = NtExecutableResource.from(exe)

  // Precies één groep vervangen — die met het laagste id, want dat is degene
  // die Windows toont. Meerdere groepen achter elkaar vervangen gaat mis:
  // replaceIconsForResource nummert de losse RT_ICON-bronnen zelf, dus de
  // tweede aanroep hernummert waar de eerste al naar verwees en dan klopt er
  // van geen van beide groepen meer iets.
  const groepen = res.entries
    .filter(e => e.type === 14)                                  // RT_GROUP_ICON
    .map(e => ({ id: e.id, lang: e.lang }))
    .sort((a, b) => (Number(a.id) || 0) - (Number(b.id) || 0))

  const doel = groepen[0] || { id: 1, lang: 1033 }               // 1033 = en-US
  Resource.IconGroupEntry.replaceIconsForResource(res.entries, doel.id, doel.lang, afbeeldingen)

  res.outputResource(exe)
  fs.writeFileSync(exePath, Buffer.from(exe.generate()))

  // Niet aannemen dat het gelukt is: het bestand opnieuw inlezen en tellen wat
  // er werkelijk in staat. Zonder deze controle sturen we een exe weg waarvan
  // we dénken dat hij een icoon heeft.
  return telIconen(exePath)
}

// Hoeveel icoonformaten staan er werkelijk in dit bestand?
function telIconen(exePath) {
  const { NtExecutable, NtExecutableResource, Resource } = require('resedit')
  const exe = NtExecutable.from(fs.readFileSync(exePath), { ignoreCert: true })
  const res = NtExecutableResource.from(exe)
  const groepen = Resource.IconGroupEntry.fromEntries(res.entries)
  if (!groepen.length) throw new Error('er staat geen icoongroep in het bestand')
  const items = groepen[0].getIconItemsFromEntries(res.entries)
  if (!items.length) throw new Error('de icoongroep verwijst nergens naar')
  return items.length
}

// De verkenner onthoudt iconen per bestandspad en blijft daar hardnekkig aan
// vasthouden. Dit is het standaardprogramma van Windows om die cache te
// verversen; op oudere versies heet de schakelaar anders.
function verversIcooncache() {
  return new Promise((resolve) => {
    const p = spawn('ie4uinit.exe', ['-show'], { windowsHide: true })
    p.on('close', (code) => {
      if (code === 0) return resolve(true)
      const p2 = spawn('ie4uinit.exe', ['-ClearIconCache'], { windowsHide: true })
      p2.on('close', (c2) => resolve(c2 === 0))
      p2.on('error', () => resolve(false))
    })
    p.on('error', () => resolve(false))
  })
}

// Een map met een kort, spatieloos pad — IExpress loopt vast op spaties.
function spatieloozeWerkmap() {
  const kandidaten = [os.tmpdir(), path.parse(os.tmpdir()).root || 'C:\\']
  for (const basis of kandidaten) {
    if (/\s/.test(basis)) continue
    const dir = path.join(basis, 'flbat-' + Math.random().toString(36).slice(2, 8))
    try { fs.mkdirSync(dir, { recursive: true }); return dir } catch {}
  }
  return null
}

// `content` heeft voorrang op `batPath`: dan hoeft er niets opgeslagen te zijn
// en bouwt hij precies wat er in de editor staat, net als proefdraaien.
ipcMain.handle('bat:makeExe', async (_, { batPath, content, isCmd, exePath, hideWindow, admin, iconPath } = {}) => {
  let work = null
  try {
    const uitBestand = content == null
    if (uitBestand && (!batPath || !fs.existsSync(batPath))) return { ok: false, reason: 'notfound' }
    if (!exePath) return { ok: false, reason: 'nopath' }

    work = spatieloozeWerkmap()
    if (!work) return { ok: false, reason: 'nowork' }

    // Vaste, korte namen binnen de werkmap: de originele naam kan spaties of
    // rare tekens bevatten en die overleven IExpress niet.
    const cmdExt  = uitBestand ? path.extname(batPath).toLowerCase() === '.cmd' : !!isCmd
    const batName = 'script' + (cmdExt ? '.cmd' : '.bat')
    const tmpExe  = path.join(work, 'out.exe')
    const sedPath = path.join(work, 'build.sed')

    if (uitBestand) fs.copyFileSync(batPath, path.join(work, batName))
    else fs.writeFileSync(path.join(work, batName), String(content).replace(/\r?\n/g, '\r\n'), 'utf8')
    fs.writeFileSync(sedPath, buildSed({
      workDir: work, batName, exePath: tmpExe,
      friendlyName: path.basename(exePath, path.extname(exePath)),
      hideWindow, admin,
    }), 'utf8')

    const code = await new Promise((resolve) => {
      const p = spawn('iexpress.exe', ['/N', '/Q', sedPath], { windowsHide: true, shell: false })
      p.on('close', c => resolve(c ?? 1))
      p.on('error', () => resolve(-1))
    })

    if (code === -1) return { ok: false, reason: 'geeniexpress' }
    if (!fs.existsSync(tmpExe)) return { ok: false, reason: 'nooutput', code }

    // Icoon zetten vóór het kopiëren, zodat er nooit een half bewerkte exe op
    // de eindbestemming belandt.
    let iconWarning = null
    let iconCount = 0
    if (iconPath && fs.existsSync(iconPath)) {
      try { iconCount = await applyExeIcon(tmpExe, iconPath) }
      catch (e) { iconWarning = e.message }
    }

    fs.mkdirSync(path.dirname(exePath), { recursive: true })
    fs.copyFileSync(tmpExe, exePath)

    // Ook het weggeschreven bestand nog een keer nakijken — dat is wat je
    // straks aanklikt, niet de tijdelijke kopie.
    let cacheVervers = false
    if (iconCount) {
      try { iconCount = telIconen(exePath) }
      catch (e) { iconWarning = 'het icoon staat niet in het uiteindelijke bestand: ' + e.message; iconCount = 0 }
      // Meteen de cache verversen, anders blijft de verkenner het oude plaatje
      // tonen en lijkt het alsof het icoon niet gewerkt heeft.
      if (iconCount) cacheVervers = await verversIcooncache()
    }

    return { ok: true, path: exePath, iconWarning, iconCount, cacheVervers }
  } catch (e) {
    return { ok: false, reason: e.message }
  } finally {
    if (work) { try { fs.rmSync(work, { recursive: true, force: true }) } catch {} }
  }
})

ipcMain.handle('dialog:saveAs', async (_, { title, defaultPath, name, extensions } = {}) => {
  const r = await dialog.showSaveDialog(win, {
    title: title || 'Opslaan als',
    defaultPath: defaultPath || undefined,
    filters: [{ name: name || 'Bestand', extensions: extensions || ['*'] }],
  })
  return r.canceled ? null : r.filePath
})

ipcMain.handle('dialog:pickIcon', async (_, cwd) => {
  const r = await dialog.showOpenDialog(win, {
    title: 'Kies een icoon — .ico, of een programma of snelkoppeling om het icoon uit te halen',
    properties: ['openFile'],
    defaultPath: cwd && fs.existsSync(cwd) ? cwd : undefined,
    filters: [
      { name: 'Icoonbron', extensions: ['ico', 'exe', 'dll', 'lnk', 'cpl'] },
      { name: 'Icoonbestand', extensions: ['ico'] },
      { name: 'Programma of snelkoppeling', extensions: ['exe', 'dll', 'lnk'] },
    ],
  })
  return r.canceled ? null : r.filePaths[0]
})

// Bestanden kiezen die het bat-bestand moet uitvoeren; meerdere tegelijk mag
ipcMain.handle('dialog:pickRunFiles', async (_, cwd) => {
  const r = await dialog.showOpenDialog(win, {
    title: 'Kies bestanden die dit bat-bestand moet uitvoeren',
    properties: ['openFile', 'multiSelections'],
    defaultPath: cwd && fs.existsSync(cwd) ? cwd : undefined,
    filters: [
      { name: 'Uitvoerbaar', extensions: ['exe', 'bat', 'cmd', 'ps1', 'py', 'js', 'vbs', 'msi', 'com'] },
      { name: 'Alle bestanden', extensions: ['*'] },
    ],
  })
  return r.canceled ? [] : r.filePaths
})

ipcMain.handle('dialog:pickBat', async (_, cwd) => {
  const r = await dialog.showOpenDialog(win, {
    title: 'Kies een bat-bestand om te bewerken',
    properties: ['openFile'],
    defaultPath: cwd && fs.existsSync(cwd) ? cwd : undefined,
    filters: [{ name: 'Batch-bestand', extensions: ['bat', 'cmd'] }],
  })
  return r.canceled ? null : r.filePaths[0]
})

// PATH van Windows (Machine + User), zodat tools die ná het starten van
// CommandDeck zijn geïnstalleerd ook gevonden worden. Electron houdt anders
// de PATH van het opstartmoment vast.
let windowsPathCache = { at: 0, value: '' }

function readRegPath(key) {
  try {
    const out = execFileSync('reg.exe', ['query', key, '/v', 'Path'], {
      encoding: 'utf8', windowsHide: true, timeout: 2500,
    })
    const line = String(out).split(/\r?\n/).find(l => /\sPath\s+REG_/i.test(l))
    if (!line) return ''
    const m = line.match(/REG_(?:EXPAND_)?SZ\s+(.*)$/i)
    return m ? m[1].trim() : ''
  } catch { return '' }
}

function expandWinEnv(s) {
  return String(s || '').replace(/%([^%]+)%/g, (_, n) => {
    const v = process.env[n] || process.env[n.toUpperCase()]
    return v != null ? v : `%${n}%`
  })
}

const PATH_SLEUTELS = [
  'HKLM\\SYSTEM\\CurrentControlSet\\Control\\Session Manager\\Environment',
  'HKCU\\Environment',
]

function readRegPathAsync(key) {
  return new Promise((resolve) => {
    execFile('reg.exe', ['query', key, '/v', 'Path'], {
      encoding: 'utf8', windowsHide: true, timeout: 2500,
    }, (err, stdout) => {
      if (err) return resolve('')
      const line = String(stdout).split(/\r?\n/).find(l => /\sPath\s+REG_/i.test(l))
      const m = line && line.match(/REG_(?:EXPAND_)?SZ\s+(.*)$/i)
      resolve(m ? m[1].trim() : '')
    })
  })
}

// Het pad vers uit het register lezen kost twee reg.exe-aanroepen. Synchroon
// zet dat de hoofdthread honderden milliseconden stil, en in die tijd reageert
// het venster nergens op — daar zat de hapering bij het typen, want git:info
// en elke andere aanroep gingen hier langs. Vandaar: één keer vullen vóór het
// venster er is, en daarna alleen nog in de achtergrond verversen. Een pad dat
// twee tellen oud is, is nooit erger dan een venster dat stilstaat.
let windowsPathVersBezig = false

function windowsMergedPath() {
  if (process.platform !== 'win32') return process.env.PATH || ''
  if (!windowsPathCache.value || Date.now() - windowsPathCache.at >= 120000) ververWindowsPath()
  return windowsPathCache.value || process.env.PATH || process.env.Path || ''
}

function ververWindowsPath() {
  if (windowsPathVersBezig) return
  windowsPathVersBezig = true
  // Meteen de klok bijzetten: anders start elke aanroep in de tussentijd nog
  // een ronde, en staan er tien reg.exe'jes tegelijk.
  windowsPathCache = { at: Date.now(), value: windowsPathCache.value }
  Promise.all(PATH_SLEUTELS.map(readRegPathAsync))
    .then(([machine, user]) => {
      const merged = [expandWinEnv(machine), expandWinEnv(user)].filter(Boolean).join(';')
      if (merged) windowsPathCache = { at: Date.now(), value: merged }
    })
    .catch(() => {})
    .finally(() => { windowsPathVersBezig = false })
}

// De blokkerende variant. Alleen op momenten waarop er tóch niets te doen is:
// bij het opstarten, en direct na een installatie waar de gebruiker op wacht.
function windowsPathNu() {
  if (process.platform !== 'win32') return process.env.PATH || ''
  const merged = PATH_SLEUTELS.map(k => expandWinEnv(readRegPath(k))).filter(Boolean).join(';')
  windowsPathCache = { at: Date.now(), value: merged || process.env.PATH || process.env.Path || '' }
  return windowsPathCache.value
}

function childEnv(extra) {
  const env = { ...process.env, ...(extra || {}) }
  if (process.platform === 'win32') {
    const p = windowsMergedPath()
    if (p) { env.PATH = p; env.Path = p }
  }
  return env
}

// ── Run command ───────────────────────────────────────────────────────────────
let activeProc = null
let cancelRequested = false

function sendOutput(projectId, type, text) {
  if (!win.isDestroyed()) win.webContents.send('cmd:output', { projectId, type, text })
}

function validateCwd(projectId, cwd, shell) {
  if (!cwd) {
    sendOutput(projectId, 'err', 'Geen projectmap ingesteld. Voeg een locatie toe via projectinstellingen.')
    sendOutput(projectId, 'sep', '')
    return false
  }
  if (!fs.existsSync(cwd)) {
    sendOutput(projectId, 'err', `Map bestaat niet: ${cwd}`)
    sendOutput(projectId, 'err', 'Controleer het pad in de projectinstellingen.')
    sendOutput(projectId, 'sep', '')
    return false
  }
  // Een netwerkpad wordt hier niet meer tegengehouden: GitTools.cmdInMap hangt
  // er een tijdelijke schijfletter aan zodat cmd er wél in kan werken.
  return true
}

function classifyLine(line) {
  // Uitwijken naar C:\Windows is geen mededeling maar een fout: vanaf dat moment
  // klopt de map niet meer waar het commando in draait.
  if (GitTools.uncWaarschuwing(line)) return 'err'
  return /^\s*(error:|exception|failed)/i.test(line) ? 'err' : 'info'
}

function sendFlutterMissingHelp(projectId) {
  sendOutput(projectId, 'manual', '⚠ ' + FLUTTER_MISSING_HELP[0])
  for (let i = 1; i < FLUTTER_MISSING_HELP.length; i++) {
    sendOutput(projectId, 'info', FLUTTER_MISSING_HELP[i])
  }
  sendOutput(projectId, 'sep', '')
}

// Cache: of `flutter` in PATH staat. Kort hergebruiken, zodat we niet bij
// elke knop `where` aanroepen — maar wel opnieuw kijken als iemand Flutter
// net geïnstalleerd heeft zonder CommandDeck te herstarten.
let flutterOpPad = null
let flutterOpPadSinds = 0
function checkFlutterOpPad() {
  return new Promise((resolve) => {
    const nu = Date.now()
    if (flutterOpPad !== null && nu - flutterOpPadSinds < 60_000) {
      resolve(flutterOpPad)
      return
    }
    const proc = spawn('where flutter', [], { windowsHide: true, shell: true })
    let out = ''
    proc.stdout.on('data', d => { out += d.toString() })
    proc.on('close', (code) => {
      flutterOpPad = code === 0 && /flutter/i.test(out)
      flutterOpPadSinds = Date.now()
      resolve(flutterOpPad)
    })
    proc.on('error', () => {
      flutterOpPad = false
      flutterOpPadSinds = Date.now()
      resolve(false)
    })
  })
}

function runCommandOnce({ projectId, cmd, cwd, echoCmd = true, shell } = {}) {
  return new Promise(async (resolve) => {
    if (!validateCwd(projectId, cwd, shell)) {
      resolve({ code: 1, output: '' })
      return
    }

    // Flutter-knop zonder SDK: meteen duidelijke hulp i.p.v. een cryptische
    // "is not recognized"-regel. Andere commando's (cmd, bat, editors) gaan door.
    if (isFlutterCommand(cmd) && !(await checkFlutterOpPad())) {
      if (echoCmd) sendOutput(projectId, 'cmd', `> ${cmd}`)
      sendFlutterMissingHelp(projectId)
      resolve({ code: 1, output: FLUTTER_MISSING_HELP.join('\n'), flutterMissing: true })
      return
    }

    const chunks = []
    const capture = (line) => { chunks.push(line) }
    // Zet cmd zichzelf onderweg alsnog in een andere map, dan mag de uitkomst
    // niet als geslaagd langskomen. Zie de uitleg bij isUncPad in git-tools.js.
    let uitgeweken = false

    if (echoCmd) sendOutput(projectId, 'cmd', `> ${cmd}`)

    const isPs = shell === 'powershell'
    const psStart = isPs ? psCommandLaunch(loadSettings().ps, cmd) : null
    // PowerShell kan gewoon in een netwerkmap starten; cmd niet, en die krijgt er
    // een tijdelijke schijfletter bij. Op een gewoon pad verandert er niets.
    const start = isPs ? null : GitTools.cmdInMap(cmd, cwd, process.platform === 'win32')
    if (start && start.viaLetter) {
      sendOutput(projectId, 'info', 'Netwerkpad: cmd werkt hier via een tijdelijke schijfletter. Paden in de uitvoer tonen die letter, en %CD% of %VAR% wijzen niet naar deze map.')
    }
    const proc = isPs
      ? spawn(psStart.exe, psStart.args, {
          cwd, env: childEnv(), windowsHide: true, shell: false,
        })
      : spawn(start.cmd, [], {
          // cwd null = starten waar het hoofdproces staat; pushd springt meteen
          // daarna naar de netwerkmap, en zonder dat springen doet het commando
          // niets (zie het `&&` in cmdInMap).
          cwd: start.cwd === null ? undefined : start.cwd,
          env: childEnv(), windowsHide: true, shell: true,
        })
    activeProc = proc

    const onLine = (type, line) => {
      if (GitTools.uncWaarschuwing(line)) uitgeweken = true
      capture(line)
      sendOutput(projectId, type, line)
    }

    proc.stdout.on('data', d =>
      d.toString().split(/\r?\n/).filter(Boolean).forEach(l => onLine('out', l)))
    proc.stderr.on('data', d =>
      d.toString().split(/\r?\n/).filter(Boolean).forEach(l => onLine(classifyLine(l), l)))

    proc.on('close', code => {
      if (activeProc === proc) activeProc = null
      const output = chunks.join('\n')
      // Exit 0 is hier niet genoeg: cmd geeft die ook af nadat hij zelf naar
      // C:\Windows is uitgeweken. Dan is er wel iets gedraaid, maar niet waar
      // het hoorde.
      const ok = code === 0 && !uitgeweken
      // Fallback: PATH-check was ok, maar het proces klaagt alsnog over flutter
      if (!ok && isFlutterCommand(cmd) && looksLikeFlutterMissing(output)) {
        flutterOpPad = false
        flutterOpPadSinds = Date.now()
        sendFlutterMissingHelp(projectId)
        resolve({ code: code ?? 1, output, flutterMissing: true })
        return
      }
      if (uitgeweken) {
        sendOutput(projectId, 'err', 'Dit commando draaide niet in de projectmap: cmd is uitgeweken naar C:\\Windows omdat de map een netwerkpad is.')
        sendOutput(projectId, 'err', 'Koppel er een schijfletter aan en zet de projectlocatie op die letter.')
      }
      sendOutput(projectId, ok ? 'ok' : 'err',
        ok           ? '✓ klaar'
        : uitgeweken ? '✗ niet in de projectmap gedraaid'
        :              `✗ afgebroken (exit ${code})`)
      sendOutput(projectId, 'sep', '')
      resolve({ code: uitgeweken && code === 0 ? 1 : (code ?? 1), output, uitgeweken })
    })

    proc.on('error', err => {
      if (activeProc === proc) activeProc = null
      const msg = `Fout: ${err.message}`
      capture(msg)
      sendOutput(projectId, 'err', msg)
      if (isFlutterCommand(cmd) && looksLikeFlutterMissing(msg)) {
        flutterOpPad = false
        flutterOpPadSinds = Date.now()
        sendFlutterMissingHelp(projectId)
        resolve({ code: 1, output: chunks.join('\n'), flutterMissing: true })
        return
      }
      sendOutput(projectId, 'sep', '')
      resolve({ code: 1, output: chunks.join('\n') })
    })
  })
}

function killFlutterProcesses() {
  return new Promise((resolve) => {
    if (activeProc) {
      try { activeProc.kill() } catch {}
      activeProc = null
    }
    const killer = spawn('taskkill', ['/F', '/IM', 'flutter.bat', '/T'], { shell: true, windowsHide: true })
    killer.on('close', () => {
      const killer2 = spawn('taskkill', ['/F', '/IM', 'dart.exe', '/T'], { shell: true, windowsHide: true })
      killer2.on('close', () => resolve())
    })
    killer.on('error', () => resolve())
  })
}

async function applyFix(fix, cwd, projectId) {
  if (fix.type === 'kill') {
    await killFlutterProcesses()
    sendOutput(projectId, 'fix', '⟳ Flutter/Dart processen gestopt')
    return
  }

  if (fix.fs === 'deleteFile') {
    const full = path.join(cwd, fix.path)
    if (fs.existsSync(full)) {
      fs.unlinkSync(full)
      sendOutput(projectId, 'fix', `⟳ ${fix.label}: ${fix.path} verwijderd`)
    } else {
      sendOutput(projectId, 'fix', `⟳ ${fix.label}: ${fix.path} (niet aanwezig)`)
    }
    return
  }

  if (fix.fs === 'deleteDir') {
    const full = path.join(cwd, fix.path)
    if (fs.existsSync(full)) {
      fs.rmSync(full, { recursive: true, force: true })
      sendOutput(projectId, 'fix', `⟳ ${fix.label}: ${fix.path}/ verwijderd`)
    } else {
      sendOutput(projectId, 'fix', `⟳ ${fix.label}: ${fix.path}/ (niet aanwezig)`)
    }
    return
  }

  if (fix.cmd) {
    sendOutput(projectId, 'fix', `⟳ ${fix.label}`)
    await runCommandOnce({ projectId, cmd: fix.cmd, cwd })
  }
}

function cancelledResult(autoFixed) {
  return { success: false, autoFixed, cancelled: true }
}

async function runWithAutofix({ projectId, cmd, cwd, cmdKey, autoFixEnabled }) {
  cancelRequested = false

  const first = await runCommandOnce({ projectId, cmd, cwd })
  if (cancelRequested) return cancelledResult(false)
  if (first.code === 0) return { success: true, autoFixed: false }
  // Zonder Flutter-SDK heeft auto-fix (clean/pub get) geen zin
  if (first.flutterMissing) return { success: false, autoFixed: false, manual: true, flutterMissing: true }

  const eligible = autoFixEnabled && isAutofixEligible(cmdKey, cmd)
  if (!eligible) return { success: false, autoFixed: false }

  const analysis = analyzeFailure(first.output, cmdKey, cmd)

  if (analysis.warnings?.length) {
    for (const msg of analysis.warnings) {
      sendOutput(projectId, 'warn', `ⓘ Let op: ${msg}`)
    }
    sendOutput(projectId, 'sep', '')
  }

  if (analysis.manual) {
    for (const msg of analysis.messages) {
      sendOutput(projectId, 'manual', `⚠ Handmatige actie: ${msg}`)
    }
    sendOutput(projectId, 'sep', '')
    return { success: false, autoFixed: false, manual: true, matchedRules: analysis.matchedRules }
  }

  if (!analysis.fixes.length) {
    sendOutput(projectId, 'info', 'Geen bekende auto-fix voor deze fout.')
    return { success: false, autoFixed: false }
  }

  sendOutput(projectId, 'fix', `⟳ Install mislukt — auto-fix: ${analysis.summary}`)
  sendOutput(projectId, 'sep', '')

  for (const fix of analysis.fixes) {
    if (cancelRequested) return cancelledResult(false)
    await applyFix(fix, cwd, projectId)
  }
  if (cancelRequested) return cancelledResult(false)

  sendOutput(projectId, 'fix', `⟳ Opnieuw proberen: ${cmd}`)
  sendOutput(projectId, 'sep', '')

  const retry = await runCommandOnce({ projectId, cmd, cwd })
  if (cancelRequested) return cancelledResult(true)

  if (retry.code === 0) {
    sendOutput(projectId, 'fix', `✓ Auto-fix gelukt (${analysis.summary})`)
  } else {
    sendOutput(projectId, 'fix', `✗ Auto-fix hielp niet — handmatig oplossen nodig`)
  }
  sendOutput(projectId, 'sep', '')

  return {
    success: retry.code === 0,
    autoFixed: true,
    summary: analysis.summary,
    matchedRules: analysis.matchedRules,
  }
}

// `--machine` JSON heeft géén `category` — filter op targetPlatform (android-*).
// Zonder childEnv() mist Electron op Windows vaak flutter in PATH, terwijl de
// gewone 'flutter devices'-knop wél werkt (die gebruikt childEnv wél).
function flutterDevicesOnce(cwd, machine) {
  return new Promise((resolve) => {
    let klaar = false
    const done = (devices) => {
      if (klaar) return
      klaar = true
      resolve(devices)
    }
    const cmd = machine ? 'flutter devices --machine' : 'flutter devices'
    const proc = spawn(cmd, [], {
      windowsHide: true, shell: true, cwd,
      env: childEnv(),
    })
    let out = ''
    proc.stdout.on('data', d => { out += d.toString() })
    proc.stderr.on('data', d => { out += d.toString() })
    const timer = setTimeout(() => {
      try { proc.kill() } catch {}
      done(parseFlutterAndroidDevices(out))
    }, 30000)
    proc.on('close', () => { clearTimeout(timer); done(parseFlutterAndroidDevices(out)) })
    proc.on('error', () => { clearTimeout(timer); done([]) })
  })
}

const wacht = (ms) => new Promise(r => setTimeout(r, ms))

// Net aangesloten telefoon: adb heeft soms een paar seconden nodig om 'm te
// zien. Eerste poging kan dan leeg terugkomen terwijl het apparaat er wel is
// (zelfde effect als handmatig 'flutter devices' twee keer moeten typen).
ipcMain.handle('cmd:listFlutterDevices', async (_, opts) => {
  const cwd = opts && opts.cwd ? opts.cwd : undefined
  let devices = await flutterDevicesOnce(cwd, true)
  if (!devices.length) {
    await wacht(2000)
    devices = await flutterDevicesOnce(cwd, true)
  }
  if (!devices.length) devices = await flutterDevicesOnce(cwd, false)
  return devices
})

ipcMain.handle('cmd:run', async (_, opts) => {
  // Reset ook hier, anders blijft een eerdere stop-actie doorwerken op de
  // volgende losse run en lijkt die ten onrechte afgebroken.
  cancelRequested = false
  const r = await runCommandOnce(opts)
  return {
    success: r.code === 0,
    code: r.code,
    cancelled: cancelRequested,
    flutterMissing: !!r.flutterMissing,
    manual: !!r.flutterMissing,
  }
})

ipcMain.handle('cmd:runWithAutofix', async (_, opts) => runWithAutofix(opts))

// ── Echte terminal (pty) ──────────────────────────────────────────────────────
// Een gewone spawn geeft het commando pipes in plaats van een toetsenbord.
// Claude Code, een REPL of vim ziet dan geen tty, tekent geen scherm en leest
// geen invoer. Een pseudo-terminal doet dat wel: het commando denkt dat het in
// een echte console draait, en wij krijgen de ruwe uitvoer binnen om in het
// venster zelf te tekenen.
//
// node-pty is een native module. De prebuilt binaries zijn tegen Node-API
// gebouwd, dus ze werken zonder opnieuw compileren — maar als het laden toch
// misgaat mag dat de app niet omver trekken. Dan valt de rest terug op een
// eigen consolevenster.
let ptyModule
let ptyFout = ''
function laadPty() {
  if (ptyModule !== undefined) return ptyModule
  try {
    ptyModule = require('@lydell/node-pty')
  } catch (e) {
    ptyModule = null
    ptyFout = e && e.message ? e.message : String(e)
  }
  return ptyModule
}

const ptySessies = new Map()

function ptyStuur(kanaal, payload) {
  if (win && !win.isDestroyed()) win.webContents.send(kanaal, payload)
}

ipcMain.handle('pty:beschikbaar', () => ({ ok: !!laadPty(), reden: ptyFout }))

ipcMain.handle('pty:start', (_, { id, cmd, cwd, cols, rows, shell } = {}) => {
  const pty = laadPty()
  if (!pty) return { ok: false, reason: ptyFout || 'node-pty niet beschikbaar' }
  if (!id || !cmd) return { ok: false, reason: 'geen commando' }
  if (!cwd || !fs.existsSync(cwd)) return { ok: false, reason: 'map bestaat niet' }
  stopPty(id)

  // De omgeving van Electron bevat vlaggen die een kindproces in de war sturen:
  // met ELECTRON_RUN_AS_NODE erin start een programma als kale Node.
  const env = childEnv({ TERM: 'xterm-256color' })
  delete env.ELECTRON_RUN_AS_NODE
  delete env.ELECTRON_NO_ATTACH_CONSOLE

  // Via de shell, zodat `claude` net zo wordt opgezocht als wanneer je het zelf
  // intypt — op Windows is dat vaak een .cmd-schil en geen .exe.
  const isWin = process.platform === 'win32'
  const isPs = shell === 'powershell'
  const psStart = isPs ? psCommandLaunch(loadSettings().ps, cmd) : null
  const shellPad = isWin
    ? (isPs ? psStart.exe : (process.env.COMSPEC || 'cmd.exe'))
    : (process.env.SHELL || '/bin/bash')
  // Zelfde verhaal als bij runCommandOnce: cmd komt een netwerkmap alleen
  // binnen via een tijdelijke schijfletter, powershell heeft dat niet nodig.
  const start = isPs ? null : GitTools.cmdInMap(cmd, cwd, isWin)
  const args = isWin
    ? (isPs ? psStart.args : ['/c', start.cmd])
    : ['-lc', cmd]
  // node-pty wil een bestaande map. Welke maakt niet uit zodra pushd het
  // overneemt, maar het UNC-pad zelf mag het niet zijn — daar struikelt cmd op
  // vóórdat hij aan het commando toekomt.
  const startMap = (start && start.viaLetter) ? os.homedir() : cwd

  let proc
  try {
    proc = pty.spawn(shellPad, args, {
      name: 'xterm-256color',
      cols: Math.max(20, Number(cols) || 100),
      rows: Math.max(5, Number(rows) || 30),
      cwd: startMap,
      env,
    })
  } catch (e) {
    return { ok: false, reason: e && e.message ? e.message : String(e) }
  }

  ptySessies.set(id, proc)
  proc.onData(data => ptyStuur('pty:data', { id, data }))
  proc.onExit(({ exitCode, signal }) => {
    if (ptySessies.get(id) === proc) ptySessies.delete(id)
    ptyStuur('pty:exit', { id, code: exitCode, signal })
  })
  return { ok: true, pid: proc.pid }
})

ipcMain.handle('pty:write', (_, { id, data } = {}) => {
  const proc = ptySessies.get(id)
  if (!proc) return false
  try { proc.write(String(data ?? '')) } catch {}
  return true
})

ipcMain.handle('pty:resize', (_, { id, cols, rows } = {}) => {
  const proc = ptySessies.get(id)
  if (!proc) return false
  try { proc.resize(Math.max(20, Number(cols) || 100), Math.max(5, Number(rows) || 30)) } catch {}
  return true
})

function stopPty(id) {
  const proc = ptySessies.get(id)
  if (!proc) return false
  ptySessies.delete(id)
  try { proc.kill() } catch {}
  return true
}

ipcMain.handle('pty:stop', (_, { id } = {}) => stopPty(id))

// Blijft er een sessie draaien als de app dichtgaat, dan houdt dat proces het
// afsluiten tegen (en op Windows blijft er een onzichtbare console hangen).
app.on('before-quit', () => { for (const id of [...ptySessies.keys()]) stopPty(id) })

// ── Open in editor ────────────────────────────────────────────────────────────
ipcMain.handle('cmd:openEditor', (_, { editorPath, cwd }) => {
  if (!cwd || !fs.existsSync(cwd)) return false
  if (!editorPath) return false
  // Ook hier voor de zekerheid: een pad dat ooit als snelkoppeling is opgeslagen
  // zou anders stilletjes niets doen.
  editorPath = losSnelkoppelingOp(editorPath)
  // With shell:true, spawn joins [file, ...args] with a plain space itself —
  // it does not quote either piece — before handing the whole line to cmd.exe.
  // A path with spaces (e.g. "D:\Program Files\...\studio64.exe") then splits
  // apart at the first space when cmd.exe parses it. Quoting each piece
  // ourselves keeps paths-with-spaces (editor path and/or project path) intact.
  spawn(`"${editorPath}"`, [`"${cwd}"`], { shell: true, windowsHide: false, detached: true }).unref()
  return true
})

ipcMain.handle('cmd:openClaudeDesktop', (_, { cwd }) => {
  if (!cwd || !fs.existsSync(cwd)) return false
  const url = `claude://cowork/new?folder=${encodeURIComponent(cwd)}`
  spawn('cmd.exe', ['/c', 'start', '', url], { windowsHide: true, detached: true, shell: false }).unref()
  return true
})

// ── Kill ──────────────────────────────────────────────────────────────────────
ipcMain.handle('cmd:kill', async () => {
  cancelRequested = true
  await killFlutterProcesses()
  return true
})

// ── Relaunch (update knop) ────────────────────────────────────────────────────
ipcMain.handle('app:relaunch', () => {
  app.relaunch()
  app.exit(0)
})

// Dev vs geïnstalleerde exe: de "Update & herstart"-knop bouwt vanuit broncode
// en hoort alleen in development zichtbaar te zijn. Online updates voor de
// geïnstalleerde Setup komen later via electron-updater.
ipcMain.handle('app:runtimeInfo', () => ({
  packaged: app.isPackaged,
  version: app.getVersion(),
}))

// ── Update & restart (npm install + npm run build, dan herstart) ─────────────
// De bronmap stond hier hardgecodeerd, waardoor de update op elke andere pc (of
// na het verplaatsen van de map) stilviel. We zoeken hem nu op.
//
// Een portable .exe pakt zichzelf uit in %TEMP%, dus process.execPath wijst dan
// naar die tijdelijke map. electron-builder zet voor portable targets wél
// PORTABLE_EXECUTABLE_DIR/-FILE met de echte locatie van de .exe; die staat in
// <bronmap>\dist, dus de map erboven is wat we zoeken.
function isSourceDir(dir) {
  try {
    if (!dir) return false
    const pkgPath = path.join(dir, 'package.json')
    if (!fs.existsSync(pkgPath)) return false
    if (!fs.existsSync(path.join(dir, 'main.js'))) return false
    return JSON.parse(fs.readFileSync(pkgPath, 'utf8')).name === 'commanddeck'
  } catch { return false }
}

function findSourceDir() {
  const cands = []
  const withParents = (d, levels = 2) => {
    let cur = d
    for (let i = 0; i <= levels && cur; i++) {
      cands.push(cur)
      const up = path.dirname(cur)
      if (up === cur) break
      cur = up
    }
  }

  // 1. Eerder gevonden of door de gebruiker aangewezen
  try { const s = loadSettings(); if (s.sourceDir) cands.push(s.sourceDir) } catch {}
  // 2. Portable build: echte map van de .exe (= <bronmap>\dist)
  withParents(process.env.PORTABLE_EXECUTABLE_DIR, 1)
  // 3. Dev-modus: het app-pad ís de bronmap
  if (!app.isPackaged) withParents(app.getAppPath(), 1)
  // 4. Uitgepakte build: <bronmap>\dist\win-unpacked\App.exe
  withParents(path.dirname(process.execPath), 3)
  // 5. Laatste redmiddel
  withParents(process.cwd(), 1)

  for (const c of cands) if (isSourceDir(c)) return path.resolve(c)
  return null
}

function rememberSourceDir(dir) {
  try {
    const s = loadSettings()
    if (s.sourceDir !== dir) { s.sourceDir = dir; saveSettings(s) }
  } catch {}
}

ipcMain.handle('app:findSourceDir', () => findSourceDir())

// Vingerafdruk van de broncode: alles wat mee de build in gaat. Verandert er
// niets, dan is opnieuw bouwen zonde van de tijd - en erger, de oude versie
// wordt er wel voor weggegooid. Dus eerst vergelijken.
// Mappen die mee de build in gaan en dus meetellen voor "is er iets veranderd".
// locales hoort er echt bij: die bestanden zitten in de app, en zonder deze
// regel meldde een taalwijziging zich als "niets te updaten".
const BRON_MAPPEN = ['assets', 'locales']
function bronVingerafdruk(dir) {
  const hash = crypto.createHash('sha1')
  const doe = (map, prefix) => {
    let items
    try { items = fs.readdirSync(map, { withFileTypes: true }) } catch { return }
    for (const d of [...items].sort((a, b) => a.name.localeCompare(b.name))) {
      const vol = path.join(map, d.name)
      if (d.isDirectory()) {
        if (prefix === '' && !BRON_MAPPEN.includes(d.name)) continue   // node_modules, dist, test...
        doe(vol, prefix + d.name + '/')
        continue
      }
      if (prefix === '' && !/\.(js|json|html|css)$/i.test(d.name)) continue
      if (/^(package-lock\.json|update-run\.bat)$/i.test(d.name)) continue
      try { hash.update(prefix + d.name + '\0' + fs.readFileSync(vol)) } catch {}
    }
  }
  doe(dir, '')
  return hash.digest('hex')
}

function gebouwdeVingerafdruk(dir) {
  try { return fs.readFileSync(path.join(dir, 'dist', 'gebouwd.hash'), 'utf8').trim() } catch { return '' }
}

// Is er al een bruikbare versie van deze broncode? Dan valt er niets te updaten.
function alBijgewerkt(dir) {
  const nu = bronVingerafdruk(dir)
  if (!nu || nu !== gebouwdeVingerafdruk(dir)) return false
  const exe = path.join(dir, 'dist', 'CommandDeck.exe')
  const app = path.join(process.env.LOCALAPPDATA || os.tmpdir(), 'CommandDeck', 'CommandDeck.exe')
  return fs.existsSync(exe) || fs.existsSync(app)
}

ipcMain.handle('app:updateAndRestart', async (_, opties = {}) => {
  let SOURCE_DIR = findSourceDir()

  // Niks gevonden — laat de gebruiker de map zelf aanwijzen in plaats van
  // stilletjes een script te starten dat toch nergens heen kan.
  if (!SOURCE_DIR) {
    const r = await dialog.showOpenDialog(win, {
      title: 'Waar staat de broncode van CommandDeck?',
      message: 'Kies de map met package.json en main.js',
      properties: ['openDirectory'],
    })
    if (r.canceled) return { ok: false, reason: 'cancelled' }
    if (!isSourceDir(r.filePaths[0])) return { ok: false, reason: 'invalid', dir: r.filePaths[0] }
    SOURCE_DIR = path.resolve(r.filePaths[0])
  }
  rememberSourceDir(SOURCE_DIR)

  // Zelfde broncode als de versie die je draait: dan niets slopen en niets
  // bouwen. Wil je toch, dan kan dat met force.
  if (!opties.force && alBijgewerkt(SOURCE_DIR)) {
    return { ok: false, reason: 'actueel', dir: SOURCE_DIR }
  }
  const vingerafdruk = bronVingerafdruk(SOURCE_DIR)

  // Blijft er een slotbestand liggen doordat een vorige update is afgebroken
  // (venster weggeklikt, script gestruikeld), dan zou je nooit meer kunnen
  // updaten. Een slot ouder dan tien minuten is dus geen slot meer.
  const lock = path.join(SOURCE_DIR, 'update-bezig.lock')
  try {
    const st = fs.statSync(lock)
    if (opties.force || Date.now() - st.mtimeMs > 10 * 60e3) fs.unlinkSync(lock)
    else return { ok: false, reason: 'bezig', dir: SOURCE_DIR, sinds: st.mtimeMs }
  } catch {}

  const exePath = path.join(SOURCE_DIR, 'dist', 'CommandDeck.exe')

  // Waar draaide deze app vandaan? Na een herinstallatie staat op precies dat
  // pad de nieuwe versie, dus dat is het beste startpunt. Bij `npm start` is
  // het electron.exe en dus niets om te starten; de kandidaten hieronder
  // vangen dat op.
  const huidigeExe = app.isPackaged ? app.getPath('exe') : ''

  // Kandidaten om na afloop te starten, beste eerst:
  //   1. waar hij vandaan kwam (net herinstalleerd)
  //   2. de standaardplek van de installer
  //   3. de uitgepakte snelstartversie
  //   4. de portable exe in dist — traag, want die pakt zichzelf elke start uit
  const startKandidaten = [
    huidigeExe,
    '%LOCALAPPDATA%\\Programs\\CommandDeck\\CommandDeck.exe',
    '%APPDIR%\\CommandDeck.exe',
    exePath,
  ].filter(Boolean)

  const restartCmd = [
    'set "START_EXE="',
    ...startKandidaten.map(k => `if not defined START_EXE if exist "${k}" set "START_EXE=${k}"`),
    'if not defined START_EXE goto geen_start',
    'echo   starten: !START_EXE!',
    'start "" "!START_EXE!"',
    'goto update_klaar',
    ':geen_start',
    'echo   LET OP: geen CommandDeck.exe gevonden om te starten.',
    'echo   Start hem zelf even; de update zelf is wel gelukt.',
    'pause',
  ].join('\n')
  const backupPath = path.join(SOURCE_DIR, 'dist', 'CommandDeck.vorige.exe')
  const lockPath   = path.join(SOURCE_DIR, 'update-bezig.lock')
  const ownPid = process.pid

  // Volgorde is hier het halve verhaal. Eerder stond het opruimen van
  // dist\win-unpacked VOOR het afsluiten van de app; draaide je een build die
  // uit die map komt, dan hield het draaiende proces de bestanden vergrendeld,
  // faalde het verwijderen tien keer en stopte de update met "Kon
  // dist\win-unpacked niet verwijderen". Afsluiten gaat nu als eerste.
  //
  // De app sluit zichzelf netjes af (app.quit(), zodat instellingen en
  // geschiedenis nog kunnen wegschrijven); dit script wacht daarop en grijpt
  // pas in als dat niet lukt. Dat is ook wat er misging: `taskkill /F` op een
  // nog draaiende app is geen nette afsluiting.
  //
  // De brede `taskkill /IM electron.exe /T` is eruit: die sloopt ook andere
  // Electron-programma's die op dat moment openstaan.
  // cmd.exe leest een .bat op byte-positie, maar interpreteert de inhoud in de
  // OEM-codepagina van de console. Staat er ook maar een teken in dat daar niet
  // in past (een streepje uit een kader, een accent), dan loopt die telling uit
  // de pas en krijg je vanaf dat punt halve regels als commando aangeboden:
  // 'LSS' is not recognized, 'gesynchroniseerd' is not recognized. Vandaar:
  // alleen ASCII, en Windows-regeleindes.
  function batVeilig(tekst) {
    return tekst
      .replace(/[\u2500-\u257F]/g, '-')       // kaderstreepjes
      .replace(/[\u2018\u2019]/g, "'")
      .replace(/[\u201C\u201D]/g, '"')
      .replace(/[\u2013\u2014]/g, '-')
      .replace(/\u2026/g, '...')
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '')   // accenten eraf
      .replace(/[^\x09\x0a\x0d\x20-\x7e]/g, '?')       // rest: onschadelijk maken
      .replace(/\r?\n/g, '\r\n')
  }
  // In een if (...)-blok zijn haakjes in paden (bijv. Program Files (x86)) batch-
  // syntax, geen tekst. Zelfs binnen aanhalingstekens in echo kan cmd het blok
  // verkeerd parsen. Daarom paden in if-blokken vermijden: goto i.p.v. (...).
  function batPadEcho(pad) {
    return `"${String(pad).replace(/"/g, '""')}"`
  }

  const batContent = `@echo off
setlocal enabledelayedexpansion
title CommandDeck bijwerken
echo ===============================================
echo   CommandDeck bijwerken
echo ===============================================
echo Bronmap: ${SOURCE_DIR}
echo.

rem Bouwen gebeurt buiten deze map. Reden: electron-builder pakt Electron uit in
rem dist\\win-unpacked.tmp en hernoemt die map daarna. Staat het project in een
rem map die OneDrive synchroniseert of die de virusscanner actief bekijkt, dan
rem mislukt precies die hernoeming met EPERM. In %LOCALAPPDATA% heeft niemand
rem daar last van; alleen de kant-en-klare exe komt daarna terug naar dist.
set "BUILDDIR=%LOCALAPPDATA%\\CommandDeckBuild"
rem De uitgepakte versie start meteen. De portable exe in dist is een
rem zelfuitpakkend archief: die pakt bij elke start eerst een paar honderd MB
rem uit naar %TEMP%, en dat is precies waarom hij zo traag opkomt. Daarom komt
rem de uitgepakte versie hier te staan; daar mag je gerust een snelkoppeling
rem naartoe maken.
set "APPDIR=%LOCALAPPDATA%\\CommandDeck"

cd /d "${SOURCE_DIR}"
if errorlevel 1 (
  echo FOUT: kan de bronmap niet openen.
  pause
  exit /b 1
)

if not exist "package.json" (
  echo FOUT: geen package.json gevonden in deze map.
  echo Dit lijkt niet de bronmap van CommandDeck te zijn.
  pause
  exit /b 1
)

rem Twee updates tegelijk vechten om dezelfde mappen; dat was precies wat er
rem misging. Een tegelijk dus.
if not exist "${lockPath}" goto lock_vrij
echo Er loopt al een update in een ander venster.
echo Sluit dat venster eerst. Blijft dit hangen, verwijder dan:
echo   ${batPadEcho(lockPath)}
pause
exit /b 1
:lock_vrij
echo bezig sinds %DATE% %TIME%> "${lockPath}"

where npm >nul 2>&1
if errorlevel 1 (
  echo FOUT: npm niet gevonden.
  echo Node.js moet geinstalleerd zijn en in PATH staan om te kunnen bouwen.
  echo Download: https://nodejs.org
  pause
  exit /b 1
)

echo Stap 1/6: de draaiende app afsluiten
set /a WAITED=0
:waitloop
tasklist /FI "PID eq ${ownPid}" 2>nul | find "${ownPid}" >nul
if errorlevel 1 goto app_closed
set /a WAITED+=1
if !WAITED! GEQ 20 (
  echo   sluit niet uit zichzelf af, wordt nu geforceerd afgesloten
  taskkill /F /PID ${ownPid} /T >nul 2>&1
  ping -n 3 127.0.0.1 >nul
  goto app_closed
)
ping -n 2 127.0.0.1 >nul
goto waitloop
:app_closed
rem Restanten van een eerdere versie die nog bestanden vasthouden.
taskkill /F /IM CommandDeck.exe >nul 2>&1
taskkill /F /IM "CommandDeck.exe" >nul 2>&1
ping -n 2 127.0.0.1 >nul
echo   afgesloten
echo.

echo Stap 2/6: dependencies installeren (npm install)
call npm install
if errorlevel 1 (
  echo.
  echo Update mislukt bij npm install ^(zie foutmelding hierboven^)
  del /f /q "${lockPath}" >nul 2>&1
  pause
  exit /b 1
)

echo.
echo Stap 3/6: oude build opruimen
call :ruim_op
if errorlevel 1 (
  echo.
  echo Kon de oude build niet opruimen. Zie de tips onderaan.
  goto opruimen_mislukt
)
rem De werkende versie eerst opzij zetten. Mislukt de build (bijvoorbeeld op een
rem netwerkfout), dan zet stap 4 hem terug en houd je een bruikbare app.
if not exist "${exePath}" goto veiligstellen_klaar
echo   vorige versie veiligstellen
copy /y "${exePath}" "${backupPath}" >nul 2>&1
:veiligstellen_klaar
del /f /q "${exePath}" >nul 2>&1

echo.
echo Stap 4/6: nieuwe versie bouwen (npm run build)
rem Er is geen echt code-signing certificaat ingesteld, dus electron-builder
rem tekent alleen met een automatisch self-signed testcertificaat. Dat is
rem precies waar het op vastliep: signtool.exe raakt net-uitgepakte .exe's aan
rem terwijl de virusscanner ze scant ("waiting for unlock..."). Dat testsignen
rem levert sowieso niks op, dus gewoon overslaan.
rem
rem Volledige build: NSIS-installer (CommandDeck-Setup-*.exe) EN portable
rem (CommandDeck.exe) + win-unpacked voor de snelstartversie. Alleen portable
rem bouwen liet de Setup in dist verouderd — precies waarom opnieuw installeren
rem geen nieuwe UI liet zien.
set CSC_IDENTITY_AUTO_DISCOVERY=false
set BUILDTRY=0
:build_try
set /a BUILDTRY+=1
if !BUILDTRY! GTR 1 echo   poging !BUILDTRY! van 3...
call npm run build -- -c.directories.output="%BUILDDIR%"
if errorlevel 1 goto build_opnieuw

if not exist "%BUILDDIR%\\CommandDeck.exe" (
  echo   FOUT: de build gaf geen CommandDeck.exe in %BUILDDIR%
  goto build_opnieuw
)
echo   nieuwe versie terugzetten in dist
if not exist "dist" mkdir "dist" >nul 2>&1
copy /y "%BUILDDIR%\\CommandDeck.exe" "${exePath}" >nul
if errorlevel 1 (
  echo   FOUT: kon de nieuwe exe niet in dist zetten ^(nog in gebruik?^)
  goto build_opnieuw
)

echo   installer ^(Setup^) terugzetten in dist
del /f /q "dist\\CommandDeck-Setup-*.exe" >nul 2>&1
del /f /q "dist\\CommandDeck-Setup-*.exe.blockmap" >nul 2>&1
set SETUP_OK=0
for %%F in ("%BUILDDIR%\\CommandDeck-Setup-*.exe") do (
  copy /y "%%F" "dist\\" >nul
  set SETUP_OK=1
)
for %%F in ("%BUILDDIR%\\CommandDeck-Setup-*.exe.blockmap") do (
  copy /y "%%F" "dist\\" >nul
)
if "!SETUP_OK!"=="1" (
  echo   Setup staat in dist
) else (
  echo   LET OP: geen CommandDeck-Setup-*.exe gevonden in de buildmap
)

echo   snelstartversie bijwerken
if exist "%APPDIR%" rmdir /s /q "%APPDIR%" >nul 2>&1
move "%BUILDDIR%\\win-unpacked" "%APPDIR%" >nul 2>&1
if exist "%APPDIR%\\CommandDeck.exe" goto build_klaar
echo   LET OP: de snelstartversie kon niet worden bijgewerkt; de app in dist
echo   is wel nieuw, alleen start die langzamer.
goto build_klaar
echo   FOUT: kon de nieuwe exe niet in dist zetten ^(nog in gebruik?^)

:build_opnieuw
rem electron-builder haalt nsis en winCodeSign van GitHub. Die download klapt er
rem geregeld uit met "socket hang up" of ETIMEDOUT; dat is tijdelijk, dus
rem gewoon opnieuw proberen lost het meestal op.
if !BUILDTRY! LSS 3 (
  echo.
  echo   Build mislukt. Gaat het om een download ^(socket hang up / ETIMEDOUT^),
  echo   dan is dat meestal tijdelijk. Over 5 seconden nog een poging...
  ping -n 6 127.0.0.1 >nul
  rem Een afgebroken build laat dist\\win-unpacked.tmp staan; die moet weg,
  rem anders struikelt de volgende poging daar meteen weer over.
  call :ruim_op
  goto build_try
)
goto build_mislukt

:build_klaar
if exist "${exePath}" goto build_klaar_verder
echo.
echo FOUT: ${batPadEcho(exePath)} bestaat niet na de build.
goto build_mislukt
:build_klaar_verder
del /f /q "${backupPath}" >nul 2>&1
rem De bouwmap is een paar honderd MB; die hoeft niet te blijven staan.
if exist "%BUILDDIR%" rmdir /s /q "%BUILDDIR%" >nul 2>&1

rem Vastleggen welke broncode hier in zit, zodat een volgende update ziet dat
rem er niets veranderd is en dan niets hoeft te slopen.
echo ${vingerafdruk}> "${path.join(SOURCE_DIR, 'dist', 'gebouwd.hash')}"
del /f /q "${lockPath}" >nul 2>&1

echo.
echo Stap 5/6: geinstalleerde exe herinstalleren via Setup
rem Alleen de Setup in dist zetten was niet genoeg: Start-menu / bureaublad /
rem Programs bleven op de oude bestanden staan tot je handmatig opnieuw
rem installeerde. Daarom draait de Setup hier stil (/S) zodat die plekken
rem mee bijgewerkt worden. Lukt dat niet, dan starten we hieronder alsnog
rem de snelstart- of portable-versie.
set "SETUP_EXE="
for %%F in ("dist\\CommandDeck-Setup-*.exe") do set "SETUP_EXE=%%~fF"
if not defined SETUP_EXE goto setup_skip
echo   Setup: !SETUP_EXE!
rem Nog even wachten tot Windows alle handles loslaat na de build-kopie.
ping -n 3 127.0.0.1 >nul
"!SETUP_EXE!" /S
if errorlevel 1 (
  echo   LET OP: stille herinstallatie mislukt — verder met snelstart/portable
  goto setup_skip
)
echo   herinstallatie klaar
rem Hier ging het mis: hieronder stond "goto update_klaar", in de veronderstelling
rem dat de Setup de app zelf wel start ^(runAfterFinish^). Dat doet hij alleen op
rem het afrondscherm van de installatie — en met /S is er geen afrondscherm. Er
rem startte dus niets meer, en je moest hem zelf weer opzoeken. Stap 6 hoort er
rem gewoon achteraan te komen.
rem Even wachten tot de installer klaar is met wegschrijven.
ping -n 3 127.0.0.1 >nul
:setup_skip

echo.
echo Stap 6/6: nieuwe versie starten
${restartCmd}

:update_klaar
exit

:build_mislukt
del /f /q "${lockPath}" >nul 2>&1
echo.
echo ===============================================
echo   Update mislukt na !BUILDTRY! pogingen
echo ===============================================
echo.
echo Stond er EPERM, EBUSY of "operation not permitted" in de melding hierboven?
echo Dan hield iets een bestand vast terwijl de build het wilde vervangen:
echo.
echo   1. Draait er nog een CommandDeck? Sluit die helemaal af.
echo   2. Staat de map dist open in de verkenner, of een bestand eruit in een
echo      editor? Sluit die vensters.
echo   3. Wordt deze map gesynchroniseerd door OneDrive of Dropbox? Zet de sync
echo      even op pauze, of zet het project op een map buiten de sync.
echo   4. Virusscanner: geef deze map een uitzondering.
echo   5. Werkt het nog niet, verwijder dan handmatig:
echo      "${SOURCE_DIR}\\dist\\win-unpacked.tmp"
echo      "%BUILDDIR%"
echo.
echo Stond er "socket hang up", ETIMEDOUT of ECONNRESET?
echo Dan lukte het downloaden van de bouwgereedschappen niet. Wat je kunt doen:
echo.
echo   1. Later opnieuw proberen - meestal is het tijdelijk.
echo   2. Deze map verwijderen als er een halve download in blijft hangen:
echo      %LOCALAPPDATA%\\electron-builder\\Cache
echo   3. VPN of firewall tijdelijk uitzetten; de bestanden komen van
echo      github.com/electron-userland/electron-builder-binaries
echo.
if not exist "${backupPath}" goto backup_klaar
echo De vorige versie wordt teruggezet, zodat je gewoon verder kunt werken.
move /y "${backupPath}" "${exePath}" >nul 2>&1
:backup_klaar
echo.
pause
if exist "${exePath}" start "" "${exePath}"
exit /b 1

:opruimen_mislukt
set BUILDTRY=0
goto build_mislukt

rem --- Alles weghalen wat de build in de weg zit ---────
rem Naast win-unpacked laat een afgebroken build ook win-unpacked.tmp achter.
rem Die map is precies waar electron-builder daarna op stukloopt met EPERM,
rem dus die moet net zo goed weg.
:ruim_op
set DELTRIES=0
:retry_del
if exist "%BUILDDIR%"              rmdir /s /q "%BUILDDIR%"              >nul 2>&1
if exist "dist\\win-unpacked"     rmdir /s /q "dist\\win-unpacked"     >nul 2>&1
if exist "dist\\win-unpacked.tmp" rmdir /s /q "dist\\win-unpacked.tmp" >nul 2>&1
if not exist "dist\\win-unpacked" if not exist "dist\\win-unpacked.tmp" if not exist "%BUILDDIR%" exit /b 0
set /a DELTRIES+=1
if !DELTRIES! GEQ 10 (
  echo   nog steeds vergrendeld na !DELTRIES! pogingen
  exit /b 1
)
echo   nog vergrendeld, nieuwe poging over 2 seconden...
taskkill /F /IM CommandDeck.exe >nul 2>&1
ping -n 3 127.0.0.1 >nul
goto retry_del
`

  // Elke update krijgt een eigen scriptbestand met een unieke naam. cmd.exe
  // leest een .bat regel voor regel en onthoudt daarbij alleen een positie in
  // het bestand. Overschrijf je datzelfde bestand terwijl het draait — en dat
  // gebeurde: een tweede keer op update drukken — dan leest cmd vrolijk verder
  // op die byte-positie in de nieuwe inhoud. Je krijgt dan halve regels als
  // commando's aangeboden ('LSS' is not recognized, 'gesynchroniseerd' is not
  // recognized). Met een unieke naam kan dat niet meer gebeuren.
  const batPath = path.join(os.tmpdir(), `commanddeck-update-${Date.now()}.bat`)
  fs.writeFileSync(batPath, batVeilig(batContent), 'latin1')

  // Oude scripts van eerdere updates opruimen
  try {
    for (const f of fs.readdirSync(os.tmpdir())) {
      if (!/^commanddeck-update-\d+\.bat$/.test(f)) continue
      const vol = path.join(os.tmpdir(), f)
      if (vol !== batPath && Date.now() - fs.statSync(vol).mtimeMs > 3600e3) fs.unlinkSync(vol)
    }
  } catch {}
  try { fs.unlinkSync(path.join(SOURCE_DIR, 'update-run.bat')) } catch {}

  // Same `start`-based trick already confirmed working for the cmd-knop.
  // NB: title must be "" (empty) here, not a descriptive string — a quoted
  // title containing spaces gets mangled by spawn's Windows arg-escaping
  // (each arg is escaped independently, so the embedded quotes+spaces come
  // out wrong) and `start` ends up trying to run a fragment of the title as
  // if it were the program name. That's exactly the "Kan het bestand
  // Launcher niet vinden" error — "Launcher" was a piece of the mangled title.
  spawn('cmd.exe', ['/c', 'start', '""', 'cmd.exe', '/k', batPath], {
    detached: true,
    windowsHide: false,
    shell: false,
  }).unref()

  // Zelf afsluiten, zodat de build de bestanden niet vergrendeld aantreft.
  // `start` zet het script in een eigen console die niet aan ons proces hangt,
  // dus die blijft draaien als wij weg zijn. Even wachten geeft dat venster de
  // tijd om op te komen; het script wacht daarna zelf tot dit proces weg is.
  setTimeout(() => {
    isQuittingForUpdate = true
    try { app.quit() } catch {}
    // Mocht een venster het afsluiten tegenhouden, dan alsnog hard eruit.
    setTimeout(() => { try { app.exit(0) } catch {} }, 4000)
  }, 1500)

  return { ok: true, dir: SOURCE_DIR }
})
