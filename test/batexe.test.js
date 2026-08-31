// SED-generatie voor IExpress
const path = require('path')
const { buildSed, sanitizeString } = require(path.join(__dirname, '..', 'bat-exe'))

let ok = true
const t = (l, c) => { console.log((c ? 'PASS  ' : 'FAIL  ') + l); if (!c) ok = false }

const sed = buildSed({
  workDir: 'C:\\Temp\\flbat-a1b2c3',
  batName: 'script.bat',
  exePath: 'C:\\Temp\\flbat-a1b2c3\\out.exe',
  friendlyName: 'Mijn build',
})

t('begint met de versiesectie', sed.startsWith('[Version]\r\nClass=IEXPRESS'))
t('gebruikt Windows-regeleindes', sed.includes('\r\n') && !/[^\r]\n/.test(sed))
t('is een installatiepakket', sed.includes('PackagePurpose=InstallApp'))

// de bat-beperking
t('start het script via cmd.exe /c', sed.includes('AppLaunched=cmd.exe /c "script.bat"'))
t('roept de bat niet rechtstreeks aan', !sed.includes('AppLaunched=script.bat'))

t('doelpad van de exe staat erin', sed.includes('TargetName=C:\\Temp\\flbat-a1b2c3\\out.exe'))
t('bronmap eindigt op een backslash', sed.includes('SourceFiles0=C:\\Temp\\flbat-a1b2c3\\'))
t('het bestand staat in de bronlijst', sed.includes('FILE0="script.bat"') && sed.includes('%FILE0%='))
t('naam wordt overgenomen', sed.includes('FriendlyName=Mijn build'))
t('geen vraag vooraf of melding achteraf',
  sed.includes('InstallPrompt=\r\n') && sed.includes('FinishMessage=\r\n'))
t('herstart niet', sed.includes('RebootMode=N'))

// opties
t('venster is standaard zichtbaar', sed.includes('ShowInstallProgramWindow=0'))
t('verbergen kan', buildSed({ workDir: 'C:\\t', batName: 'a.bat', exePath: 'C:\\t\\o.exe', hideWindow: true })
  .includes('ShowInstallProgramWindow=1'))
t('beheerdersrechten staan standaard uit', sed.includes('CheckAdminRights=0'))
t('beheerdersrechten kunnen aan', buildSed({ workDir: 'C:\\t', batName: 'a.bat', exePath: 'C:\\t\\o.exe', admin: true })
  .includes('CheckAdminRights=1'))

// naam afleiden als er geen meegegeven is
t('zonder naam wordt de bestandsnaam gebruikt',
  buildSed({ workDir: 'C:\\t', batName: 'opruimen.bat', exePath: 'C:\\t\\o.exe' }).includes('FriendlyName=opruimen'))

// randgevallen
let gooide = false
try { buildSed({ workDir: 'C:\\Mijn Map', batName: 'a.bat', exePath: 'C:\\o.exe' }) } catch { gooide = true }
t('map met spaties wordt geweigerd (IExpress kan dat niet)', gooide)

gooide = false
try { buildSed({ batName: 'a.bat', exePath: 'C:\\o.exe' }) } catch { gooide = true }
t('zonder werkmap gaat het mis', gooide)

gooide = false
try { buildSed({ workDir: 'C:\\t', exePath: 'C:\\o.exe' }) } catch { gooide = true }
t('zonder bestandsnaam gaat het mis', gooide)

t('regeleindes in een naam breken het formaat niet',
  !buildSed({ workDir: 'C:\\t', batName: 'a.bat', exePath: 'C:\\t\\o.exe', friendlyName: 'een\nnaam' })
    .includes('FriendlyName=een\nnaam'))
t('aanhalingstekens worden vervangen', sanitizeString('een "test"') === "een 'test'")
t('trailing backslash in de werkmap wordt niet verdubbeld',
  buildSed({ workDir: 'C:\\t\\', batName: 'a.bat', exePath: 'C:\\t\\o.exe' }).includes('SourceFiles0=C:\\t\\\r\n'))

console.log(ok ? '\nALLE TESTS GESLAAGD' : '\nER ZIJN TESTS GEFAALD')
process.exit(ok ? 0 : 1)
