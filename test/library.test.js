// De startvoorraad van het woordenboek
const Module = require('module'), path = require('path'), fs = require('fs'), os = require('os')
const REAL = path.join(__dirname, '..')
const { BUILTIN_COMMANDS } = require(path.join(REAL, 'cmd-library'))

let ok = true
const t = (l, c) => { console.log((c ? 'PASS  ' : 'FAIL  ') + l); if (!c) ok = false }

// ── de lijst zelf ────────────────────────────────────────────────────────────
t('er staat een flinke startvoorraad in', BUILTIN_COMMANDS.length >= 150)
t('elke regel heeft een commando', BUILTIN_COMMANDS.every(b => b.cmd && b.cmd.trim()))
t('elke regel heeft een omschrijving', BUILTIN_COMMANDS.every(b => b.label && b.label.trim()))
t('elke regel heeft minstens één label', BUILTIN_COMMANDS.every(b => (b.tags || []).length))
t('geen dubbele commando\'s',
  new Set(BUILTIN_COMMANDS.map(b => b.cmd.replace(/\s+/g, ' ').trim())).size === BUILTIN_COMMANDS.length)

const cats = [...new Set(BUILTIN_COMMANDS.flatMap(b => b.tags || []))]
t('meerdere categorieën om op te filteren', cats.length >= 5)
t('er zijn bat-bouwstenen', BUILTIN_COMMANDS.some(b => (b.tags || []).includes('bat')))
t('er zijn netwerkcommando\'s', BUILTIN_COMMANDS.some(b => (b.tags || []).includes('netwerk')))
t('er zijn bestandscommando\'s', BUILTIN_COMMANDS.some(b => (b.tags || []).includes('bestanden')))
t('er zijn Flutter-commando\'s', BUILTIN_COMMANDS.some(b => (b.tags || []).includes('flutter')))
t('er zijn git-commando\'s', BUILTIN_COMMANDS.some(b => (b.tags || []).includes('git')))
t('er zijn adb/android-commando\'s', BUILTIN_COMMANDS.some(b => (b.tags || []).includes('adb')))
t('flutter doctor staat erin', BUILTIN_COMMANDS.some(b => b.cmd === 'flutter doctor'))
t('flutter build apk --release staat erin',
  BUILTIN_COMMANDS.some(b => b.cmd === 'flutter build apk --release'))
t('genoeg Flutter-gerelateerde regels',
  BUILTIN_COMMANDS.filter(b => (b.tags || []).some(t =>
    ['flutter', 'dart', 'pub', 'android', 'adb', 'git', 'firebase'].includes(t))).length >= 60)

const fragmenten = BUILTIN_COMMANDS.filter(b => b.snippet)
t('fragmenten zijn als zodanig gemarkeerd', fragmenten.length >= 40)
t('fragmenten hebben het label bat of powershell',
  fragmenten.every(b => (b.tags || []).includes('bat') || (b.tags || []).includes('powershell')))
t('@echo off is een fragment, geen uitvoerbaar commando',
  BUILTIN_COMMANDS.find(b => b.cmd === '@echo off').snippet === true)
t('dir is juist wel uitvoerbaar', !BUILTIN_COMMANDS.find(b => b.cmd === 'dir').snippet)
t('de gevaarlijke commando\'s hebben een waarschuwing in de notitie',
  ['rmdir /s /q "map"', 'robocopy "bron" "doel" /mir'].every(c => {
    const e = BUILTIN_COMMANDS.find(b => b.cmd === c)
    return e && /onherroepelijk|verwijdert|test eerst/i.test(e.note || '')
  }))

// ── de commando's die gevraagd zijn ─────────────────────────────────────────
const heeft = (start) => BUILTIN_COMMANDS.some(b => b.cmd.toLowerCase().startsWith(start))
const gevraagd = ['echo', 'logoff', 'shutdown', 'tasklist', 'taskkill', 'sfc /scannow',
                  'format', 'diskpart', 'ver', 'systeminfo', 'ipconfig', 'ping', 'netsh',
                  'help', 'tree']
gevraagd.forEach(c => t(`"${c}" staat erin`, heeft(c)))

// ── powershell ──────────────────────────────────────────────────────────────
const ps = BUILTIN_COMMANDS.filter(b => (b.tags || []).includes('powershell'))
t('er is een flinke powershell-voorraad', ps.length >= 40)
t('elke powershell-regel is gemarkeerd voor de powershell-shell',
  ps.every(b => b.shell === 'powershell'))
t('Get-ChildItem staat erin', ps.some(b => b.cmd === 'Get-ChildItem'))
t('Get-Process staat erin', ps.some(b => b.cmd === 'Get-Process'))
t('Get-Service staat erin', ps.some(b => b.cmd === 'Get-Service'))
t('er is een netwerk-cmdlet bij',
  ps.some(b => /Get-NetIPAddress|Test-NetConnection/.test(b.cmd)))
t('er is een zoek-cmdlet bij', ps.some(b => b.cmd.startsWith('Select-String')))
t('openbaar ip staat erin', ps.some(b => /ipify/.test(b.cmd)))
t('path-vernieuwen staat erin', ps.some(b => /GetEnvironmentVariable/.test(b.cmd)))
t('niet-powershell-regels hebben geen powershell-shell',
  BUILTIN_COMMANDS.filter(b => b.shell === 'powershell').every(b => (b.tags || []).includes('powershell')))
t('cmd-regels zijn niet als powershell gemarkeerd',
  BUILTIN_COMMANDS.filter(b => (b.tags || []).includes('bestanden') && !(b.tags || []).includes('powershell'))
    .every(b => b.shell !== 'powershell'))
t('er zijn powershell-bouwstenen voor scripts',
  ps.some(b => b.snippet))
t('ingrijpende powershell-commando\'s hebben uitleg',
  ps.filter(b => b.danger).every(b => b.note && b.note.length > 20))

// ── recepten ────────────────────────────────────────────────────────────────
const recepten = BUILTIN_COMMANDS.filter(b => (b.tags || []).includes('recept'))
t('er zijn kant-en-klare bat-recepten', recepten.length >= 15)
t('recepten zijn fragmenten', recepten.every(b => b.snippet))
t('recepten bestaan uit meerdere regels of zijn compleet',
  recepten.every(b => b.cmd.includes('\r\n') || b.cmd.length > 25))
t('recepten hebben allemaal uitleg', recepten.filter(b => b.note).length >= recepten.length - 3)
t('de lus-tellter gebruikt uitgestelde expansie zoals het hoort', (() => {
  const r = recepten.find(b => b.label.includes('Tellen'))
  return r && r.cmd.includes('enabledelayedexpansion') && r.cmd.includes('!AANTAL!')
})())
t('het backup-recept haalt de datum betrouwbaar op', (() => {
  const r = recepten.find(b => b.label.includes('Reservekopie'))
  return r && r.cmd.includes('Get-Date -Format yyyy-MM-dd')
})())

// ── ingrijpende commando's ──────────────────────────────────────────────────
const zwaar = BUILTIN_COMMANDS.filter(b => b.danger)
t('ingrijpende commando\'s zijn gemarkeerd', zwaar.length >= 10)
t('die hebben allemaal uitleg over het risico', zwaar.every(b => b.note && b.note.length > 30))
t('format is als ingrijpend gemarkeerd',
  BUILTIN_COMMANDS.find(b => b.cmd.startsWith('format')).danger === true)
t('diskpart ook', BUILTIN_COMMANDS.find(b => b.cmd === 'diskpart').danger === true)
t('een gewone dir juist niet', !BUILTIN_COMMANDS.find(b => b.cmd === 'dir').danger)

// ── sjablonen: eerst invullen, dus geen uitvoerknop ─────────────────────────
const sjablonen = BUILTIN_COMMANDS.filter(b => b.template)
const direct    = BUILTIN_COMMANDS.filter(b => !b.template && !b.snippet)
t('er zijn sjablonen gemarkeerd', sjablonen.length >= 30)
t('en genoeg dat je zo kunt draaien', direct.length >= 50)
t('geen enkel commando is tegelijk sjabloon en fragment',
  !BUILTIN_COMMANDS.some(b => b.template && b.snippet))

const isSjabloon = (c) => (BUILTIN_COMMANDS.find(b => b.cmd === c) || {}).template === true
;[['taskkill /f /im programma.exe', 'een programmanaam die je zelf invult'],
  ['copy bron.txt doel.txt', 'twee bestandsnamen'],
  ['findstr /s /i /n "zoekterm" *.txt', 'een zoekterm'],
  ['format D: /fs:ntfs /q', 'een schijfletter'],
  ['diskpart', 'vraagt om invoer en blijft anders hangen'],
  ['chkdsk C: /f', 'vraagt om bevestiging'],
  ['color 0a', 'heeft alleen zin in een eigen venster'],
].forEach(([c, waarom]) => t(`"${c}" is een sjabloon (${waarom})`, isSjabloon(c)))

;['dir', 'ipconfig /all', 'systeminfo', 'tasklist', 'whoami', 'ver', 'cls', 'help',
  'netstat -ano', 'tree /f'].forEach(c =>
  t(`"${c}" mag gewoon gedraaid worden`, !isSjabloon(c)))

// ── aanvullen via main.js ────────────────────────────────────────────────────
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'lib-'))
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
  const h = await call('history:load')
  t('een vers woordenboek is meteen gevuld', h.entries.length === BUILTIN_COMMANDS.length)
  t('de markeringen komen mee',
    h.entries.some(e => e.snippet) && h.entries.some(e => e.danger) && h.entries.some(e => e.template))
  t('ze staan gemarkeerd als meegeleverd', h.entries.every(e => e.source === 'builtin'))
  t('ze zijn nooit gedraaid', h.entries.every(e => e.runCount === 0 && e.lastRun === null))
  t('de uitleg is meegekomen', h.entries.some(e => e.note && e.note.length > 20))
  t('de pijltjes-geschiedenis blijft leeg', h.recent.length === 0)

  // eigen commando's raken niet kwijt en er komt niets dubbel bij
  await call('history:record', { cmd: 'mijn eigen commando', cwd: 'C:\\x' })
  let r = await call('history:seedDefaults')
  t('nogmaals aanvullen voegt niets dubbels toe', r.added === 0)
  t('eigen commando staat er nog', r.history.entries.some(e => e.cmd === 'mijn eigen commando'))
  t('totaal klopt', r.history.entries.length === BUILTIN_COMMANDS.length + 1)

  // na alles wissen komen ze niet ongevraagd terug, maar wel op verzoek
  await call('history:clear', { what: 'all' })
  t('wissen haalt ook de standaardregels weg', (await call('history:load')).entries.length === 0)
  r = await call('history:seedDefaults')
  t('handmatig terughalen werkt', r.added === BUILTIN_COMMANDS.length)

  // opschonen mag ze niet weggooien
  const s = await call('settings:load')
  s.history = { ...s.history, maxEntries: 60 }
  await call('settings:save', s)
  for (let i = 0; i < 40; i++) await call('history:record', { cmd: 'wegwerp-' + i, cwd: 'C:\\x' })
  const na = await call('history:load')
  t('standaardregels overleven het opschonen',
    na.entries.filter(e => e.source === 'builtin').length === BUILTIN_COMMANDS.length)

  // zelf invullen maakt er een gewoon commando van
  const vers = await call('history:load')
  const sj = vers.entries.find(e => e.template)
  const naInvullen = await call('history:update', { id: sj.id, patch: { cmd: 'taskkill /f /im echt-programma.exe' } })
  t('een ingevuld sjabloon telt niet langer als sjabloon',
    naInvullen.entries.find(e => e.id === sj.id).template === false)
  const sj2 = vers.entries.filter(e => e.template)[1]
  await call('history:update', { id: sj2.id, patch: { favorite: true } })
  t('alleen een favoriet aanvinken laat de markering staan',
    (await call('history:load')).entries.find(e => e.id === sj2.id).template === true)
  t('het is op schijf bewaard', fs.existsSync(path.join(TMP, 'history.json')))

  // fragmenten met regeleindes overleven het opslaan
  const meerRegels = h.entries.find(e => e.cmd.includes('\r\n'))
  t('meerregelige fragmenten blijven heel', !!meerRegels && meerRegels.cmd.split('\r\n').length > 1)

  console.log(ok ? '\nALLE TESTS GESLAAGD' : '\nER ZIJN TESTS GEFAALD')
  process.exit(ok ? 0 : 1)
})()
