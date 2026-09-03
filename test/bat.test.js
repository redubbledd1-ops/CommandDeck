// Bat-sjabloon, bestandsnamen en de lees/schrijf-handlers
const Module = require('module'), path = require('path'), fs = require('fs'), os = require('os')
const REAL = path.join(__dirname, '..')

let ok = true
const t = (l, c) => { console.log((c ? 'PASS  ' : 'FAIL  ') + l); if (!c) ok = false }

// ── sjabloon + naamgeving (uit renderer.js) ──────────────────────────────────
// Regeleindes eerst gelijktrekken. Op Windows checkt git renderer.js met CRLF
// uit, en in een regex matcht . geen \r — dan vindt /const X = .*\n/ niets en
// klapt deze hele test eruit op een verschil dat niets met bat-bestanden te
// maken heeft. De regels hieronder zoeken in de tekst, niet in de opmaak.
const src = fs.readFileSync(path.join(REAL, 'renderer.js'), 'utf8').replace(/\r\n/g, '\n')
eval(src.match(/const BAT_DEFAULTS = \{[\s\S]*?\n\}/)[0].replace('const','var'))
eval(src.match(/const BAT_KOPREGELS = .*\n/)[0].replace('const', 'var'))
eval(src.match(/const BAT_STAARTREGELS = .*\n/)[0].replace('const', 'var'))
eval(src.match(/function slaBlokOver[\s\S]*?\n}/)[0])
eval(src.match(/function extractBatBody[\s\S]*?\n}/)[0])
eval(src.match(/function isCheckableCommand[\s\S]*?\n}/)[0])
eval(src.match(/function buildBatTemplate[\s\S]*?\n  return body\.join\('\\r\\n'\)\n}/)[0])
eval(src.match(/function suggestBatName[\s\S]*?\n}/)[0])
eval(src.match(/function ensureBatExt[\s\S]*?\n}/)[0])
eval(src.match(/function runCommandForFile[\s\S]*?\n}/)[0])

const CWD = 'C:\\Users\\redub\\Desktop\\dd_crypto'
const bat = buildBatTemplate('flutter clean\nflutter pub get\nflutter build apk --release', CWD)

t('begint met @echo off', bat.startsWith('@echo off'))
t('springt naar de werkmap', bat.includes(`cd /d "${CWD}"`))
t('bevat alle drie de commando\'s',
  bat.includes('flutter clean') && bat.includes('flutter pub get') && bat.includes('flutter build apk --release'))
t('controleert na elk commando op fouten',
  (bat.match(/if errorlevel 1 goto mislukt/g) || []).length === 3)
t('heeft een foutafhandeling onderaan', bat.includes(':mislukt') && bat.includes('exit /b 1'))
t('houdt het venster open', bat.includes('pause'))
t('gebruikt Windows-regeleindes', bat.includes('\r\n') && !/[^\r]\n/.test(bat))
t('eindigt de geslaagde route met exit /b 0', bat.indexOf('exit /b 0') < bat.indexOf(':mislukt'))

// ── opties ────────────────────────────────────────────────────────────────────
const met = (o) => buildBatTemplate('dir\nver', CWD, o)

t('venster openhouden staat standaard aan', met({}).includes('\r\npause'))
t('openhouden uit laat pause weg bij succes',
  !met({ pause: 'never' }).split(':mislukt')[0].includes('pause'))
t('alleen bij fout pauzeert niet bij succes',
  !met({ pause: 'onerror' }).split(':mislukt')[0].includes('\r\npause') &&
  met({ pause: 'onerror' }).split(':mislukt')[1].includes('pause'))

t('stoppen bij fout uit laat de controles weg',
  !met({ stopOnError: false }).includes('goto mislukt'))
t('zonder foutcontrole is er ook geen mislukt-blok',
  !met({ stopOnError: false }).includes(':mislukt'))

t('naar werkmap uit laat cd weg', !met({ cd: false }).includes(`cd /d "${CWD}"`))

const admin = met({ admin: true })
t('administrator voegt een UAC-herstart toe',
  admin.includes('net session') && admin.includes('-Verb RunAs'))
t('UAC-blok staat vóór de commando\'s', admin.indexOf('RunAs') < admin.indexOf('dir'))

const log = met({ log: true })
t('logbestand zet een _LOG variabele', log.includes('set "_LOG=%~dpn0.log"'))
t('elk commando schrijft naar het log',
  (log.match(/>> "%_LOG%" 2>&1/g) || []).length >= 2)
t('log toont wel voortgang op het scherm', log.includes('echo ^> dir'))
t('log wordt aan het eind genoemd', log.includes('echo Log: %_LOG%'))

const timer = met({ timer: true })
t('doorlooptijd legt de starttijd vast', timer.includes('set "_START=%TIME%"'))
t('doorlooptijd toont begin en eind', timer.includes('Gestart om %_START%'))

t('commando\'s tonen zet echo aan', met({ echo: true }).startsWith('@echo on'))
t('zonder die optie blijft echo uit', met({ echo: false }).startsWith('@echo off'))

const verborgen = met({ hidden: true })
t('zonder venster zet geen zelf-herstart in het script (die hielp toch niet)',
  !verborgen.includes('_verborgen') && !verborgen.includes('Start-Process -FilePath'))
t('het script blijft er verder normaal uitzien', verborgen.includes('dir') && verborgen.includes('ver'))
t('zonder venster wordt er niet gepauzeerd (dat zou onzichtbaar blijven hangen)',
  !buildBatTemplate('dir', CWD, { hidden: true, pause: 'always' }).split(':mislukt')[0].includes('\r\npause'))

const verborgenAdmin = met({ hidden: true, admin: true })
t('verborgen plus administrator verbergt ook de verhoogde kopie',
  verborgenAdmin.includes("-WindowStyle Hidden -Verb RunAs"))
t('zonder verborgen blijft de UAC-herstart gewoon zichtbaar',
  met({ admin: true }).includes("-FilePath '%~f0' -Verb RunAs"))

t('venstertitel wordt gezet', met({ title: 'Mijn build' }).includes('title Mijn build'))
t('lege titel voegt niets toe', !met({ title: '' }).includes('\r\ntitle '))

t('alle opties tegelijk levert geldige tekst op', (() => {
  const alles = met({ cd: true, stopOnError: true, pause: 'always', admin: true, log: true, timer: true, echo: true, title: 'Alles' })
  return alles.startsWith('@echo on') && alles.includes('RunAs') && alles.includes('_LOG')
      && alles.includes('_START') && alles.includes('title Alles') && alles.includes(':mislukt')
})())

const leeg = buildBatTemplate('', CWD)
t('leeg commando geeft een bruikbaar skelet', leeg.includes('rem zet hier je commando') && leeg.includes('@echo off'))
t('zonder werkmap komt er een rem-regel', buildBatTemplate('dir', '').includes('rem cd /d'))
t('lege regels tussen commando\'s worden overgeslagen',
  (buildBatTemplate('dir\n\n\nver', CWD).match(/if errorlevel 1 goto mislukt/g) || []).length === 2)

t('bestandsnaam uit commando', suggestBatName('flutter build apk --release') === 'flutter-build-apk-release.bat')
t('rare tekens verdwijnen uit de naam', /^[\w.-]+\.bat$/.test(suggestBatName('git commit -m "test!"')))
t('leeg commando geeft script.bat', suggestBatName('') === 'script.bat')
t('meerdere regels gebruiken de eerste', suggestBatName('dir\nver').startsWith('dir'))

t('extensie wordt toegevoegd', ensureBatExt('build') === 'build.bat')
t('bestaande .bat blijft', ensureBatExt('build.bat') === 'build.bat')
t('.cmd wordt geaccepteerd', ensureBatExt('build.cmd') === 'build.cmd')
t('hoofdletters tellen mee', ensureBatExt('Build.BAT') === 'Build.BAT')
t('lege naam blijft leeg', ensureBatExt('  ') === '')

// ── inhoud behouden bij opnieuw opbouwen ─────────────────────────────────────
// Een script dat niet door deze app gemaakt is, met commentaar en een eigen exit
const vreemd = [
  '@echo off',
  'echo Restarting Logitech Gaming Software...',
  ':: Sluit LCore.exe geforceerd',
  'taskkill /f /im LCore.exe',
  ':: Wacht 1 seconde',
  'timeout /t 1 /nobreak >nul',
  ':: Start LCore.exe opnieuw',
  'start "" "C:\\Program Files\\Logitech Gaming Software\\LCore.exe"',
  'echo Done!',
  'exit',
].join('\r\n')

const kern = extractBatBody(vreemd)
t('commando\'s van een vreemd script blijven behouden',
  kern.includes('taskkill /f /im LCore.exe') && kern.includes('timeout /t 1 /nobreak >nul'))
t('commentaarregels blijven staan', kern.includes(':: Wacht 1 seconde'))
t('paden met spaties blijven heel', kern.includes('"C:\\Program Files\\Logitech Gaming Software\\LCore.exe"'))
t('@echo off wordt eraf gehaald (die zetten we zelf terug)', !kern.startsWith('@echo off'))
t('de losse exit aan het eind valt weg', !/\bexit\s*$/.test(kern))
t('echo Done! blijft juist wel staan', kern.includes('echo Done!'))

// drie keer een optie omzetten mag niets kosten
const ronde1 = buildBatTemplate(kern, 'C:\\scripts', { hidden: true, stopOnError: false })
const ronde2 = buildBatTemplate(extractBatBody(ronde1), 'C:\\scripts', { hidden: false, stopOnError: true })
const ronde3 = buildBatTemplate(extractBatBody(ronde2), 'C:\\scripts', { log: true, admin: true })
const eind = extractBatBody(ronde3)
t('inhoud overleeft drie optiewijzigingen',
  ['taskkill /f /im LCore.exe', 'timeout /t 1 /nobreak >nul', 'echo Done!', ':: Wacht 1 seconde']
    .every(l => eind.includes(l)))
t('er stapelen zich geen steigers op',
  (eind.match(/@echo off/g) || []).length === 0 && !eind.includes('goto mislukt') && !eind.includes('_verborgen'))
const oudeStijl = ['@echo off', 'setlocal', '',
  'rem Zonder venster draaien: zichzelf verborgen opnieuw starten.',
  'if not "%~1"=="_verborgen" (',
  '  powershell -NoProfile -WindowStyle Hidden -Command "Start-Process ..."',
  '  exit /b',
  ')', '', 'cd /d "C:\\s"', '', 'echo mijn werk', '', 'echo.', 'echo Klaar.', 'exit /b 0'].join('\r\n')
t('een bestand van de vorige generatie wordt netjes opgeschoond',
  extractBatBody(oudeStijl) === 'echo mijn werk')

t('de logregels van een vorige ronde blijven niet hangen',
  !eind.includes('%_LOG%') && !eind.includes('echo ^>'))

// foutcontroles komen alleen na echte commando's
const metCheck = buildBatTemplate(kern, 'C:\\s', { stopOnError: true })
const naComment = metCheck.split('\r\n')
t('geen foutcontrole direct na een commentaarregel',
  !naComment.some((l, i) => /^::/.test(l.trim()) && /goto mislukt/.test(naComment[i + 1] || '')))
t('geen foutcontrole na een echo', !naComment.some((l, i) => /^echo /i.test(l.trim()) && /goto mislukt/.test(naComment[i + 1] || '')))
t('wel een foutcontrole na taskkill',
  naComment.some((l, i) => /taskkill/.test(l) && /goto mislukt/.test(naComment[i + 1] || '')))

// blokconstructies blijven heel
const metBlok = 'if exist "x.txt" (\r\n  echo gevonden\r\n) else (\r\n  echo niet gevonden\r\n)'
const blokUit = buildBatTemplate(metBlok, 'C:\\s', { stopOnError: true })
t('een if-blok wordt niet doorbroken door foutcontroles',
  !/\(\r\nif errorlevel/.test(blokUit) && blokUit.includes(') else ('))
t('labels blijven labels',
  buildBatTemplate(':start\r\necho hoi\r\ngoto start', 'C:\\s', { stopOnError: true }).includes(':start'))

// het startbestand voor verborgen draaien
eval(src.match(/function buildHiddenLauncher[\s\S]*?\n}/)[0])
const vbs = buildHiddenLauncher('mijn-script.bat')
t('startbestand verwijst naar het bat-bestand', vbs.includes('"mijn-script.bat"'))
t('startbestand draait zonder venster', vbs.includes(', 0, False'))
t('startbestand geeft geen extra argument mee (dat zou %1 van je script verstoren)',
  !vbs.includes('_verborgen'))
t('startbestand zoekt het script naast zichzelf', vbs.includes('GetParentFolderName(WScript.ScriptFullName)'))

// ── commando per bestandstype ────────────────────────────────────────────────
t('bat-bestand krijgt call ervoor', runCommandForFile('C:\\a\\sub.bat') === 'call "C:\\a\\sub.bat"')
t('cmd-bestand ook', runCommandForFile('C:\\a\\sub.cmd') === 'call "C:\\a\\sub.cmd"')
t('exe wordt direct aangeroepen', runCommandForFile('C:\\a\\tool.exe') === '"C:\\a\\tool.exe"')
t('powershell-script krijgt powershell ervoor',
  runCommandForFile('C:\\a\\s.ps1').startsWith('powershell -NoProfile -ExecutionPolicy Bypass -File'))
t('python-script krijgt python ervoor', runCommandForFile('C:\\a\\s.py') === 'python "C:\\a\\s.py"')
t('node-script krijgt node ervoor', runCommandForFile('C:\\a\\s.js') === 'node "C:\\a\\s.js"')
t('vbs krijgt cscript ervoor', runCommandForFile('C:\\a\\s.vbs').startsWith('cscript //nologo'))
t('onbekend type gaat via start', runCommandForFile('C:\\a\\lijst.xlsx') === 'start "" "C:\\a\\lijst.xlsx"')
t('pad met spaties staat tussen aanhalingstekens',
  runCommandForFile('C:\\Mijn Map\\tool.exe') === '"C:\\Mijn Map\\tool.exe"')
t('hoofdletters in de extensie tellen mee', runCommandForFile('C:\\a\\S.BAT').startsWith('call '))

// ── handlers in main.js ──────────────────────────────────────────────────────
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'bat-'))
const handlers = {}
const fake = {
  app: { getPath: () => TMP, whenReady: () => ({ then: () => {} }), on: () => {}, relaunch: () => {}, quit: () => {}, exit: () => {}, isPackaged: false, getAppPath: () => REAL },
  BrowserWindow: function () { this.on = () => {}; this.close = () => {}; this.loadFile = () => {}; this.webContents = { send: () => {} }; this.isDestroyed = () => false },
  ipcMain: { on: () => {}, handle: (n, f) => { handlers[n] = f } },
  dialog: { showOpenDialog: async () => ({ canceled: true }) },
  shell: { openPath: () => {} },
}
const spawned = []
let iexpressFail = false
let sedGebruikt = ''
const orig = Module._load
Module._load = function (r) {
  if (r === 'electron') return fake
  if (r === 'child_process') {
    const cp = orig.apply(this, arguments)
    return { ...cp, spawn: (c, a, o) => {
      spawned.push({ c, a, o })
      const handlers = {}
      if (/iexpress/i.test(c)) {
        // doet wat IExpress doet: leest de sed en schrijft de TargetName weg
        setTimeout(() => {
          try {
            if (!iexpressFail) {
              const sed = require('fs').readFileSync(a[a.length - 1], 'utf8')
              sedGebruikt = sed
              // TargetName staat twee keer in een SED: de placeholder in
              // [Options] en de echte waarde in [Strings]. We willen de tweede.
              const regel = sed.split(/\r?\n/).filter(l => l.startsWith('TargetName=') && !l.includes('%')).pop()
              if (regel) require('fs').writeFileSync(regel.slice('TargetName='.length).trim(), 'MZ-nep-exe')
            }
          } catch {}
          handlers.close && handlers.close(iexpressFail ? 1 : 0)
        }, 0)
      }
      return { unref() {}, on(ev, fn) { handlers[ev] = fn }, stdout: { on() {} }, stderr: { on() {} }, kill() {} }
    } }
  }
  return orig.apply(this, arguments)
}
require(path.join(REAL, 'main.js'))
Module._load = orig
const call = (n, a) => handlers[n](null, a)

;(async () => {
  const WORK = path.join(TMP, 'werk')
  fs.mkdirSync(WORK, { recursive: true })

  t('lege map geeft lege lijst', (await call('bat:list', WORK)).length === 0)

  const f1 = path.join(WORK, 'build.bat')
  let r = await call('bat:save', { filePath: f1, content: 'echo hallo\necho tweede regel' })
  t('opslaan lukt', r.ok === true && r.path === f1)
  t('bestand staat op schijf', fs.existsSync(f1))
  t('regeleindes zijn omgezet naar Windows',
    fs.readFileSync(f1, 'utf8') === 'echo hallo\r\necho tweede regel')

  r = await call('bat:read', f1)
  t('teruglezen geeft dezelfde inhoud', r.ok === true && r.content.includes('echo hallo'))
  t('lezen geeft de wijzigingstijd mee', typeof r.mtime === 'number' && r.mtime > 0)

  // externe bewerking moet opgemerkt worden
  const mtimeVoor = (await call('bat:stat', f1)).mtime
  await new Promise(res => setTimeout(res, 15))
  fs.writeFileSync(f1, 'buiten de app aangepast')       // simuleert een ander programma
  const st = await call('bat:stat', f1)
  t('bat:stat geeft de wijzigingstijd', st.ok === true && typeof st.mtime === 'number')
  t('externe bewerking verandert de wijzigingstijd', st.mtime !== mtimeVoor)
  t('opnieuw lezen geeft de nieuwe inhoud',
    (await call('bat:read', f1)).content === 'buiten de app aangepast')
  t('bat:stat van een onbekend bestand faalt netjes',
    (await call('bat:stat', path.join(WORK, 'nee.bat'))).ok === false)
  await call('bat:save', { filePath: f1, content: 'echo hallo\necho tweede regel' })

  await call('bat:save', { filePath: path.join(WORK, 'deploy.cmd'), content: 'echo deploy' })
  fs.writeFileSync(path.join(WORK, 'leesmij.txt'), 'geen bat')
  const lijst = await call('bat:list', WORK)
  t('lijst bevat .bat en .cmd', lijst.length === 2)
  t('lijst negeert andere bestanden', !lijst.some(b => b.name.endsWith('.txt')))
  t('lijst geeft volledige paden', lijst.every(b => b.path.startsWith(WORK)))

  t('bestaand bestand wordt herkend', (await call('bat:exists', f1)) === true)
  t('onbekend bestand wordt niet herkend', (await call('bat:exists', path.join(WORK, 'nee.bat'))) === false)

  r = await call('bat:read', path.join(WORK, 'bestaat-niet.bat'))
  t('onbekend bestand lezen faalt netjes', r.ok === false && r.reason === 'notfound')

  r = await call('bat:save', { filePath: path.join(TMP, 'geen-map', 'x.bat'), content: 'x' })
  t('opslaan in onbestaande map faalt netjes', r.ok === false && r.reason === 'nodir')

  r = await call('bat:save', { content: 'x' })
  t('opslaan zonder pad faalt netjes', r.ok === false && r.reason === 'nopath')

  t('lijst van onbestaande map is leeg', (await call('bat:list', path.join(TMP, 'nergens'))).length === 0)

  // overschrijven
  await call('bat:save', { filePath: f1, content: 'nieuwe inhoud' })
  t('bestaand bestand wordt overschreven',
    (await call('bat:read', f1)).content === 'nieuwe inhoud')

  // ── proefdraaien ───────────────────────────────────────────────────────────
  let r2 = await call('bat:test', { dir: WORK, name: 'mijn-script.bat', content: 'echo proef\necho tweede' })
  t('proefdraaien lukt', r2.ok === true)
  t('viaLetter staat in het antwoord', r2.viaLetter === false)
  t('tijdelijk bestand staat in de doelmap', r2.path.startsWith(WORK) && /~proef-mijn-script\.bat$/.test(r2.path))
  t('tijdelijk bestand bestaat', fs.existsSync(r2.path))
  t('inhoud klopt en heeft Windows-regeleindes',
    fs.readFileSync(r2.path, 'utf8') === 'echo proef\r\necho tweede')
  t('er is een venster gestart',
    spawned.some(s => s.a.includes('start') && s.a.includes(r2.path) && s.o.detached === true))

  const eerstePad = r2.path
  r2 = await call('bat:test', { dir: WORK, name: 'ander-script', content: 'echo twee' })
  t('vorig proefbestand wordt opgeruimd', !fs.existsSync(eerstePad))
  t('nieuw proefbestand staat er wel', fs.existsSync(r2.path))
  const lijstNa = await call('bat:list', WORK)
  t('proefbestand vervuilt de keuzelijst niet',
    !lijstNa.some(b => b.name.startsWith('~proef-')))
  t('echte bat-bestanden staan er nog wel in', lijstNa.some(b => b.name === 'build.bat'))

  r2 = await call('bat:test', { dir: path.join(TMP, 'bestaat-niet'), name: 'x', content: 'echo x' })
  t('zonder geldige map valt het terug op de tijdelijke map', r2.ok === true && !r2.path.startsWith(WORK))

  // ── exe via IExpress ───────────────────────────────────────────────────────
  const exe = path.join(WORK, 'mijn programma.exe')   // spaties in het doelpad
  const voorSpawn = spawned.length
  r3 = await call('bat:makeExe', { batPath: f1, exePath: exe })
  t('exe maken lukt', r3.ok === true && r3.path === exe)
  t('exe staat op de gekozen plek, ook met spaties in het pad', fs.existsSync(exe))

  const iexAanroep = spawned.slice(voorSpawn).find(s => /iexpress/i.test(s.c))
  t('iexpress wordt stil aangeroepen',
    iexAanroep && iexAanroep.a.includes('/N') && iexAanroep.a.includes('/Q'))
  t('er wordt in een map zonder spaties gebouwd', !/\s/.test(path.dirname(iexAanroep.a[iexAanroep.a.length - 1])))
  t('tijdelijke werkmap is opgeruimd', !fs.existsSync(path.dirname(iexAanroep.a[iexAanroep.a.length - 1])))

  iexpressFail = true
  r3 = await call('bat:makeExe', { batPath: f1, exePath: path.join(WORK, 'faalt.exe') })
  t('mislukte build wordt gemeld', r3.ok === false && r3.reason === 'nooutput')
  t('er blijft geen half bestand achter', !fs.existsSync(path.join(WORK, 'faalt.exe')))
  iexpressFail = false

  r3 = await call('bat:makeExe', { batPath: path.join(WORK, 'weg.bat'), exePath: exe })
  t('exe zonder bat-bestand faalt netjes', r3.ok === false && r3.reason === 'notfound')
  r3 = await call('bat:makeExe', { batPath: f1 })
  t('exe zonder doelpad faalt netjes', r3.ok === false && r3.reason === 'nopath')

  // ── exe zonder opgeslagen bat-bestand ──────────────────────────────────────
  const losseExe = path.join(WORK, 'zonder-bestand.exe')
  r3 = await call('bat:makeExe', { content: 'echo alleen in de editor', exePath: losseExe })
  t('exe maken lukt zonder dat er een bat op schijf staat', r3.ok === true && fs.existsSync(losseExe))
  t('de inhoud uit de editor zit erin', sedGebruikt.includes('script.bat'))
  t('er is geen los bat-bestand achtergebleven',
    !(await call('bat:list', WORK)).some(b => b.name === 'zonder-bestand.bat'))

  r3 = await call('bat:makeExe', { content: 'echo x', isCmd: true, exePath: path.join(WORK, 'als-cmd.exe') })
  t('een .cmd-script wordt ook als .cmd ingepakt', sedGebruikt.includes('script.cmd'))

  // ── eigen icoon op de exe ──────────────────────────────────────────────────
  // Een echt icoon zetten vraagt een geldig PE-bestand; onze nep-exe is dat
  // niet, dus resedit klaagt. Belangrijk is dat de exe er dan tóch komt en dat
  // het probleem gemeld wordt in plaats van stilletjes te verdwijnen.
  const nepIco = path.join(WORK, 'icoon.ico')
  fs.writeFileSync(nepIco, 'geen-echt-icoon')
  const metIcon = path.join(WORK, 'met-icoon.exe')
  r3 = await call('bat:makeExe', { batPath: f1, exePath: metIcon, iconPath: nepIco })
  t('exe komt er ook als het icoon niet lukt', r3.ok === true && fs.existsSync(metIcon))
  t('mislukt icoon wordt apart gemeld', typeof r3.iconWarning === 'string' && r3.iconWarning.length > 0)

  r3 = await call('bat:makeExe', { batPath: f1, exePath: path.join(WORK, 'geen-icoon.exe') })
  t('zonder icoon geen waarschuwing', r3.ok === true && !r3.iconWarning)

  r3 = await call('bat:makeExe', { batPath: f1, exePath: path.join(WORK, 'weg-ico.exe'), iconPath: path.join(WORK, 'bestaat-niet.ico') })
  t('onbestaand icoon wordt overgeslagen', r3.ok === true && !r3.iconWarning)

  // opties gaan door naar het sed-bestand
  const voor2 = spawned.length
  await call('bat:makeExe', { batPath: f1, exePath: path.join(WORK, 'verborgen.exe'), hideWindow: true })
  t('verborgen venster wordt doorgegeven aan IExpress', sedGebruikt.includes('ShowInstallProgramWindow=1'))

  console.log(ok ? '\nALLE TESTS GESLAAGD' : '\nER ZIJN TESTS GEFAALD')
  process.exit(ok ? 0 : 1)
})()
