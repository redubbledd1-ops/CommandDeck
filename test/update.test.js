const Module=require('module'),path=require('path'),fs=require('fs'),os=require('os')
const REAL=path.join(__dirname,'..')
let ok=true; const check=(l,c)=>{console.log((c?'PASS  ':'FAIL  ')+l);if(!c)ok=false}

const ROOT=fs.mkdtempSync(path.join(os.tmpdir(),'bat-'))
const SRC=path.join(ROOT,'Mijn Projecten','commanddeck')
fs.mkdirSync(path.join(SRC,'dist'),{recursive:true})
fs.writeFileSync(path.join(SRC,'package.json'),JSON.stringify({name:'commanddeck'}))
fs.writeFileSync(path.join(SRC,'main.js'),'')

const handlers={}, spawned=[]
let quitCalled=false, exitCalled=false
const UD=fs.mkdtempSync(path.join(os.tmpdir(),'ud-'))
const fake={app:{getPath:()=>UD,whenReady:()=>({then:()=>{}}),on:()=>{},relaunch:()=>{},
    quit:()=>{quitCalled=true},exit:()=>{exitCalled=true},isPackaged:false,getAppPath:()=>SRC},
  BrowserWindow:function(){this.loadFile=()=>{};this.webContents={send:()=>{}};this.isDestroyed=()=>false},
  ipcMain:{on:()=>{},handle:(n,f)=>{handlers[n]=f}},
  dialog:{showOpenDialog:async()=>({canceled:true})},shell:{openPath:()=>{}}}
const orig=Module._load
Module._load=function(r){
  if(r==='electron')return fake
  if(r==='child_process'){const cp=orig.apply(this,arguments)
    return {...cp, spawn:(c,a,o)=>{spawned.push({c,a,o});return {unref(){},on(){},stdout:{on(){}},stderr:{on(){}},kill(){}}}}}
  return orig.apply(this,arguments)}
require(path.join(REAL,'main.js'))
Module._load=orig

;(async()=>{
  const res = await handlers['app:updateAndRestart'](null)
  check('update meldt succes met de gevonden bronmap', res.ok===true && res.dir===SRC)
  check('bronmap wordt onthouden in settings',
    JSON.parse(fs.readFileSync(path.join(UD,'settings.json'),'utf8')).sourceDir===SRC)

  const exe=path.join(SRC,'dist','CommandDeck.exe')
  const hashFile=path.join(SRC,'dist','gebouwd.hash')
  // Het script staat in TEMP met een unieke naam: cmd leest een draaiend
  // .bat-bestand op byte-positie, dus overschrijven tijdens het draaien levert
  // halve regels als commando's op.
  const batPath = spawned.at(-1).a.at(-1)
  check('script krijgt een eigen naam per keer', /commanddeck-update-\d+\.bat$/.test(batPath))
  check('en staat buiten de projectmap', !batPath.startsWith(SRC))
  check('script is geschreven', fs.existsSync(batPath))
  check('het oude vaste bestand blijft niet rondslingeren',
    !fs.existsSync(path.join(SRC, 'update-run.bat')))
  const bat=fs.readFileSync(batPath,'utf8')

  // cmd leest een .bat op byte-positie maar leest de tekens in de codepagina van
  // de console. Zit er iets in dat daar niet in past - een kaderstreepje, een
  // accent - dan loopt die telling uit de pas en voert cmd vanaf dat punt halve
  // regels uit ('LSS' is not recognized). Dus: niets buiten ASCII.
  const raar = [...bat].filter(c => c.charCodeAt(0) > 126 || (c.charCodeAt(0) < 32 && !'\t\r\n'.includes(c)))
  check('het script bevat niets buiten ASCII', raar.length === 0)
  check('en gebruikt Windows-regeleindes',
    bat.includes('\r\n') && !/[^\r]\n/.test(bat))

  // twee updates tegelijk zouden om dezelfde mappen vechten
  const lock = path.join(SRC, 'update-bezig.lock')
  check('er wordt een slot gezet', bat.includes(`echo bezig sinds %DATE% %TIME%> "${lock}"`))
  check('en eerst gekeken of er al een draait',
    bat.indexOf(`if not exist "${lock}" goto lock_vrij`) < bat.indexOf(`echo bezig sinds`))
  check('het slot gaat er bij een geslaagde build weer af',
    bat.slice(bat.indexOf('Stap 5/6') - 300, bat.indexOf('Stap 5/6')).includes(`del /f /q "${lock}"`))
  check('en ook als het misgaat',
    bat.slice(bat.indexOf(':build_mislukt')).includes(`del /f /q "${lock}"`))

  // volgorde: afsluiten moet vóór opruimen en bouwen
  const iClose=bat.indexOf('Stap 1/6'), iInstall=bat.indexOf('Stap 2/6'),
        iClean=bat.indexOf('Stap 3/6'), iBuild=bat.indexOf('Stap 4/6'),
        iSetup=bat.indexOf('Stap 5/6'), iStart=bat.indexOf('Stap 6/6')
  check('stap 1 is het afsluiten van de app', bat.slice(iClose,iClose+60).includes('afsluiten'))
  check('afsluiten gebeurt vóór het opruimen van dist', iClose<iClean)
  check('opruimen gebeurt vóór het bouwen', iClean<iBuild)
  check('herinstalleren gebeurt na de build', iSetup>iBuild)
  check('starten is de laatste stap', iStart>iSetup)

  check('wacht op ons eigen proces-id', bat.includes(`PID eq ${process.pid}`))
  check('forceert pas na een wachtlus', bat.includes('WAITED') && bat.includes(`taskkill /F /PID ${process.pid}`))
  check('sloopt niet alle electron-programma\'s', !bat.includes('/IM electron.exe'))
  check('controleert of npm bestaat', bat.includes('where npm'))
  check('controleert of het de juiste bronmap is', bat.includes('if not exist "package.json"'))
  check('geen hardgecodeerd redub-pad meer', !bat.includes('C:\\Users\\redub'))
  check('bronmap met spaties staat tussen aanhalingstekens', bat.includes(`cd /d "${SRC}"`))
  check('paden om te starten staan tussen aanhalingstekens',
    bat.includes(`if exist "${path.join(SRC,'dist','CommandDeck.exe')}"`))
  check('en er wordt gestart via de gekozen kandidaat',
    bat.includes('start "" "!START_EXE!"'))
  check('code-signing blijft uitgeschakeld', bat.includes('CSC_IDENTITY_AUTO_DISCOVERY=false'))

  // ── vergrendelde restanten van een vorige build ────────────────────────────
  // Een afgebroken build laat dist\win-unpacked.tmp staan; daar loopt de
  // volgende poging op stuk met EPERM als je hem laat liggen.
  check('opruimen haalt ook de tmp-map weg', bat.includes('rmdir /s /q "dist\\win-unpacked.tmp"'))
  check('opruimen zit in een aparte routine', bat.includes(':ruim_op'))
  check('en wordt vanuit stap 3 aangeroepen',
    bat.slice(iClean, iBuild).includes('call :ruim_op'))
  check('voor elke nieuwe bouwpoging wordt opnieuw opgeruimd',
    bat.slice(iBuild).includes('call :ruim_op'))
  check('opruimen probeert het meerdere keren', bat.includes('DELTRIES'))
  check('en schiet een blijvend proces alsnog af',
    bat.slice(bat.indexOf(':ruim_op')).includes('taskkill /F /IM CommandDeck.exe'))
  // De uitvoermap ligt buiten het project, dus electron-builder sluit dist niet
  // meer vanzelf uit. Zonder deze regels pakt hij de vorige exe mee in de nieuwe
  // en groeit het bestand met elke build.
  const pkg = JSON.parse(fs.readFileSync(path.join(REAL, 'package.json'), 'utf8'))
  check('dist wordt niet mee ingepakt', (pkg.build.files || []).includes('!dist/**'))
  check('de tests ook niet', (pkg.build.files || []).includes('!test/**'))
  check('en alles wat wel nodig is blijft', (pkg.build.files || [])[0] === '**/*')

  // ── bouwen buiten de projectmap ────────────────────────────────────────────
  // Het uitpakken en hernoemen van Electron gaat mis in mappen die OneDrive of
  // een virusscanner in de gaten houdt. Daarom bouwen we in %LOCALAPPDATA% en
  // komt alleen de kant-en-klare exe terug.
  check('er is een bouwmap buiten het project',
    bat.includes('set "BUILDDIR=%LOCALAPPDATA%\\CommandDeckBuild"'))
  check('de build schrijft daarheen',
    bat.includes('npm run build -- -c.directories.output="%BUILDDIR%"'))
  check('en bouwt ook de NSIS-installer (niet alleen portable)',
    bat.includes('CommandDeck-Setup-*.exe') && bat.includes('npm run build --'))
  check('de nieuwe exe wordt daarna teruggezet in dist',
    bat.includes(`copy /y "%BUILDDIR%\\CommandDeck.exe" "${exe}"`))
  check('een mislukte kopie telt als mislukte poging',
    bat.indexOf('kon de nieuwe exe niet in dist zetten') < bat.indexOf(':build_opnieuw'))
  check('de bouwmap wordt ook opgeruimd', bat.includes('rmdir /s /q "%BUILDDIR%"'))

  // De portable exe pakt bij elke start honderden MB uit naar TEMP; de
  // uitgepakte versie start meteen. Die krijgt een vaste plek.
  check('er is een vaste plek voor de snelstartversie',
    bat.includes('set "APPDIR=%LOCALAPPDATA%\\CommandDeck"'))
  check('die wordt na een geslaagde build ververst',
    bat.includes('move "%BUILDDIR%\\win-unpacked" "%APPDIR%"'))
  check('en de snelstartversie is een van de startkandidaten',
    bat.includes('if exist "%APPDIR%\\CommandDeck.exe" set "START_EXE=%APPDIR%\\CommandDeck.exe"'))
  check('de geinstalleerde versie ook',
    bat.includes('%LOCALAPPDATA%\\Programs\\CommandDeck\\CommandDeck.exe'))
  check('met de portable exe als laatste terugval',
    bat.slice(bat.indexOf('Stap 6/6')).includes(`set "START_EXE=${exe}"`))
  check('en een duidelijke melding als er niets te starten valt',
    bat.includes(':geen_start'))

  // ── Setup stil herinstalleren ──────────────────────────────────────────────
  // Alleen Setup in dist zetten liet Start-menu / Programs op de oude files
  // staan. De update moet de installer dus ook echt draaien.
  check('er is een herinstalleer-stap via Setup',
    bat.includes('Stap 5/6') && bat.includes('herinstalleren via Setup'))
  check('Setup draait stil (/S)',
    bat.includes('"!SETUP_EXE!" /S') || bat.includes('"%SETUP_EXE%" /S'))
  check('Setup-pad komt uit dist',
    bat.includes('for %%F in ("dist\\CommandDeck-Setup-*.exe")'))
  // Dit ging mis: de Setup werd stil gedraaid in de veronderstelling dat hij de
  // app zelf wel start (runAfterFinish). Dat doet hij alleen op het afrondscherm,
  // en met /S is er geen afrondscherm — dus startte er na een update niets meer.
  // Alleen naar echte regels kijken; een rem-regel mag erover vertellen.
  const zonderRem = (t) => t.split(/\r?\n/).filter(r => !/^\s*rem\b/i.test(r)).join('\n')
  check('na een geslaagde Setup wordt de startstap wel bereikt',
    !zonderRem(bat.slice(bat.indexOf('herinstallatie klaar'), bat.indexOf('Stap 6/6')))
      .includes('goto update_klaar'))
  check('starten gebeurt langs een lijst kandidaten, beste eerst',
    bat.slice(bat.indexOf('Stap 6/6')).includes('set "START_EXE="'))
  check('bij mislukte Setup valt hij terug op snelstart/portable',
    bat.includes('goto setup_skip') && bat.indexOf(':setup_skip') < bat.indexOf('Stap 6/6'))

  // ── wat telt mee voor "er is niets veranderd" ─────────────────────────────
  // De taalbestanden zitten in de app, dus een wijziging daarin is een echte
  // wijziging. Stonden ze er niet bij, dan meldde de app "niets te updaten"
  // terwijl er wel degelijk iets veranderd was.
  {
    const vingerUit = (t) => (t.match(/echo ([0-9a-f]{40})> /) || [])[1]
    const hashVoor = vingerUit(bat)
    fs.mkdirSync(path.join(SRC, 'locales'), { recursive: true })
    fs.writeFileSync(path.join(SRC, 'locales', 'nl.json'), '{"a":"b"}')
    const na = await handlers['app:updateAndRestart'](null)
    check('een gewijzigd taalbestand telt als update', na.ok === true)
    const hashNa = vingerUit(fs.readFileSync(spawned.at(-1).a.at(-1), 'utf8'))
    check('en levert een andere vingerafdruk op',
      !!hashVoor && !!hashNa && hashNa !== hashVoor)
    // Weer opruimen, anders is de broncode voor de tests hierna veranderd.
    fs.rmSync(path.join(SRC, 'locales'), { recursive: true, force: true })
  }

  // ── niet opnieuw bouwen als er niets veranderd is ──────────────────────────
  // Anders gooit een update de werkende versie weg voor precies hetzelfde.
  check('de vingerafdruk van de broncode wordt vastgelegd na een geslaagde build',
    bat.includes(`> "${hashFile}"`))
  const hash = bat.match(/echo ([0-9a-f]{40})> /)
  check('en dat is een echte vingerafdruk', !!hash)
  check('pas nadat de build gelukt is',
    bat.indexOf(`> "${hashFile}"`) > bat.indexOf(':build_klaar'))
  check('en na afloop weer weggegooid',
    bat.slice(bat.indexOf(':build_klaar')).includes('rmdir /s /q "%BUILDDIR%"'))

  check('de uitleg noemt ook vergrendeling, niet alleen netwerk',
    bat.includes('EPERM') && bat.includes('OneDrive'))
  check('met het volledige pad dat je zelf kunt weggooien',
    bat.includes(`"${SRC}\\dist\\win-unpacked.tmp"`))

  // Doen alsof die build gelukt is: dan hoort een volgende update te melden dat
  // er niets te doen valt.
  fs.writeFileSync(hashFile, hash[1] + '\r\n')
  fs.writeFileSync(exe, 'x')
  // Tellen ten opzichte van wat er al gedraaid heeft; een absolute telling
  // breekt zodra er een test bij komt.
  const gedraaid = spawned.length
  let res2 = await handlers['app:updateAndRestart'](null)
  check('een tweede update met dezelfde broncode doet niets',
    res2.ok === false && res2.reason === 'actueel')
  check('en start dus ook geen script', spawned.length === gedraaid)
  check('de oude versie blijft gewoon staan', fs.existsSync(exe))

  res2 = await handlers['app:updateAndRestart'](null, { force: true })
  check('met force bouwt hij wel', res2.ok === true && spawned.length === gedraaid + 1)

  fs.writeFileSync(path.join(SRC, 'renderer.js'), '// iets veranderd')
  res2 = await handlers['app:updateAndRestart'](null)
  check('een echte wijziging wordt wel opgepakt', res2.ok === true)
  const bat2 = fs.readFileSync(spawned.at(-1).a.at(-1), 'utf8')
  check('en levert een andere vingerafdruk op',
    !bat2.includes(`echo ${hash[1]}> `))

  fs.rmSync(hashFile, { force: true })

  // ── een blijven hangen slotbestand ─────────────────────────────────────────
  // Breekt een update halverwege af, dan blijft het slot liggen. Zonder
  // vervaldatum kun je daarna nooit meer updaten.
  // (lock is hierboven al bepaald)
  fs.writeFileSync(lock, 'bezig')
  const voor = spawned.length
  let res3 = await handlers['app:updateAndRestart'](null)
  check('een vers slot houdt een tweede update tegen',
    res3.ok === false && res3.reason === 'bezig' && spawned.length === voor)
  check('en vertelt sinds wanneer', typeof res3.sinds === 'number')

  res3 = await handlers['app:updateAndRestart'](null, { force: true })
  check('met force gaat het slot eraf en draait hij wel',
    res3.ok === true && !fs.existsSync(lock))

  // een oud slot is geen slot meer
  fs.writeFileSync(lock, 'bezig')
  const oud = Date.now() - 20 * 60e3
  fs.utimesSync(lock, new Date(oud), new Date(oud))
  res3 = await handlers['app:updateAndRestart'](null)
  check('een slot van 20 minuten oud wordt genegeerd',
    res3.ok === true && !fs.existsSync(lock))

  const bat3 = fs.readFileSync(spawned.at(-1).a.at(-1), 'utf8')
  check('het slot legt vast wanneer het gezet is', bat3.includes('echo bezig sinds %DATE% %TIME%>'))
  check('en gaat er ook af als npm install struikelt',
    bat3.slice(bat3.indexOf('npm install'), bat3.indexOf('Stap 3/6')).includes(`del /f /q "${lock}"`))

  // ── bestand tegen tijdelijke netwerkfouten ─────────────────────────────────
  const backup = path.join(SRC, 'dist', 'CommandDeck.vorige.exe')
  check('build wordt opnieuw geprobeerd bij een fout',
    bat.includes(':build_try') && bat.includes('goto build_try'))
  check('er wordt maximaal drie keer geprobeerd', bat.includes('BUILDTRY! LSS 3'))
  check('er zit een wachttijd tussen de pogingen',
    bat.slice(bat.indexOf(':build_try')).includes('ping -n 6'))
  check('netwerkfouten worden bij naam genoemd',
    bat.includes('socket hang up') && bat.includes('ETIMEDOUT'))
  check('de cache-map wordt genoemd als oplossing',
    bat.includes('electron-builder\\Cache'))

  // vorige versie veiligstellen
  check('vorige exe wordt veiliggesteld voor de build',
    bat.includes(`copy /y "${exe}" "${backup}"`))
  check('veiligstellen gebeurt vóór het verwijderen',
    bat.indexOf(`copy /y "${exe}"`) < bat.indexOf(`del /f /q "${exe}"`))
  check('vorige exe wordt teruggezet als de build faalt',
    bat.includes(`move /y "${backup}" "${exe}"`))
  check('terugzetten staat in de mislukt-route',
    bat.indexOf(`move /y "${backup}"`) > bat.indexOf(':build_mislukt'))
  check('na een mislukte update start de oude versie weer',
    bat.slice(bat.indexOf(':build_mislukt')).includes(`start "" "${exe}"`))
  check('reservekopie wordt opgeruimd na een geslaagde build',
    bat.indexOf(`del /f /q "${backup}"`) > bat.indexOf(':build_klaar') &&
    bat.indexOf(`del /f /q "${backup}"`) < bat.indexOf(':build_mislukt'))
  check('geslaagde route eindigt vóór de mislukt-route',
    bat.indexOf('Stap 5/6') < bat.indexOf(':build_mislukt'))

  // Pad met haakjes (Program Files (x86)): die zijn batch-syntax in if-blokken.
  const SRC86 = path.join(ROOT, 'Program Files (x86)', 'commanddeck')
  fs.mkdirSync(path.join(SRC86, 'dist'), { recursive: true })
  fs.writeFileSync(path.join(SRC86, 'package.json'), JSON.stringify({ name: 'commanddeck' }))
  fs.writeFileSync(path.join(SRC86, 'main.js'), '')
  const settingsPath = path.join(UD, 'settings.json')
  const settings86 = JSON.parse(fs.readFileSync(settingsPath, 'utf8'))
  settings86.sourceDir = SRC86
  fs.writeFileSync(settingsPath, JSON.stringify(settings86))
  const res86 = await handlers['app:updateAndRestart'](null, { force: true })
  const bat86 = fs.readFileSync(spawned.at(-1).a.at(-1), 'utf8')
  const exe86 = path.join(SRC86, 'dist', 'CommandDeck.exe')
  check('update werkt ook in Program Files (x86)', res86.ok === true && res86.dir === SRC86)
  check('pad met haakjes gebruikt goto i.p.v. if-blokken',
    bat86.includes(`if exist "${exe86}" goto build_klaar_verder`) &&
    !bat86.includes(`echo FOUT: ${exe86} bestaat niet`))
  settings86.sourceDir = SRC
  fs.writeFileSync(settingsPath, JSON.stringify(settings86))

  // spawn
  check('script wordt in een eigen console gestart',
    spawned.some(s=>s.a.join(' ').includes('start') && s.a.includes(batPath) && s.o.detached===true))

  check('app sluit zichzelf nog niet meteen', quitCalled===false)
  await new Promise(r=>setTimeout(r,1700))
  check('app sluit zichzelf af nadat het script draait', quitCalled===true)

  console.log(ok?'\nALLE TESTS GESLAAGD':'\nER ZIJN TESTS GEFAALD')
  process.exit(ok?0:1)
})()
