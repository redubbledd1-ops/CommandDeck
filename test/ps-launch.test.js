// Hoe de powershell-sectie een proces start, los van Electron.
const { psLaunchConfig, psCommandLaunch, psWindowLaunch,
        psFileLaunch, parsePs1Invocation,
        psEncodeCommand, psScriptIncomplete } = require('../ps-launch')

let ok = true
const t = (l, c) => { console.log((c ? 'PASS  ' : 'FAIL  ') + l); if (!c) ok = false }

const leeg = psLaunchConfig({})
t('standaard is powershell.exe', leeg.exe === 'powershell.exe')
t('standaard zonder profiel', leeg.args.includes('-NoProfile'))
t('standaard geen execution policy', !leeg.args.includes('-ExecutionPolicy'))

const pwsh = psLaunchConfig({ exe: 'pwsh', noProfile: true, executionPolicy: 'Bypass' })
t('pwsh kiest pwsh.exe', pwsh.exe === 'pwsh.exe')
t('bypass gaat mee',
  pwsh.args.includes('-ExecutionPolicy') && pwsh.args.includes('Bypass'))

const metProfiel = psLaunchConfig({ noProfile: false })
t('profiel aanzetten haalt -NoProfile weg', !metProfiel.args.includes('-NoProfile'))

const onzin = psLaunchConfig({ executionPolicy: 'nogniet' })
t('onbekende policy wordt genegeerd', !onzin.args.includes('-ExecutionPolicy'))

const cmd = psCommandLaunch({ exe: 'powershell', noProfile: true }, 'Get-Date')
t('commando krijgt -EncodedCommand', cmd.args.includes('-EncodedCommand'))
t('en geen -NoExit', !cmd.args.includes('-NoExit'))
t('en geen -Command meer', !cmd.args.includes('-Command'))
t('encoded script is Get-Date',
  Buffer.from(cmd.args[cmd.args.indexOf('-EncodedCommand') + 1], 'base64').toString('utf16le') === 'Get-Date')

const venster = psWindowLaunch({ noProfile: true, executionPolicy: 'RemoteSigned' }, '')
t('leeg venster blijft open', venster.args.includes('-NoExit'))
t('zonder commando geen encoded script', !venster.args.includes('-EncodedCommand'))

const vensterCmd = psWindowLaunch({ exe: 'pwsh' }, 'Get-ChildItem')
t('venster met commando start pwsh', vensterCmd.exe === 'pwsh.exe')
t('en encoded het commando',
  Buffer.from(vensterCmd.args[vensterCmd.args.indexOf('-EncodedCommand') + 1], 'base64').toString('utf16le') === 'Get-ChildItem')

t('.ps1 is een scriptstart', !!parsePs1Invocation('.\\deploy.ps1'))
t('Get-Content van een ps1 is dat niet', !parsePs1Invocation('Get-Content .\\deploy.ps1'))
t('pipeline blijft een commando', !parsePs1Invocation('.\\deploy.ps1 | Out-String'))
t('aanhalingstekens en argumenten blijven heel', (() => {
  const p = parsePs1Invocation('"C:\\Mijn Scripts\\run.ps1" -Env prod')
  return p && p.file === 'C:\\Mijn Scripts\\run.ps1' && p.extra === '-Env prod'
})())
t('call-operator telt mee', parsePs1Invocation("& '.\\x.ps1'").file === '.\\x.ps1')

const script = psCommandLaunch({ exe: 'powershell', noProfile: true }, '.\\deploy.ps1')
t('.ps1 gaat via -File', script.args.includes('-File') && script.args.at(-1) === '.\\deploy.ps1')
t('niet via -Command', !script.args.includes('-Command'))
t('en altijd met Bypass',
  script.args.includes('-ExecutionPolicy') && script.args.includes('Bypass'))

const policyWeg = psCommandLaunch({ executionPolicy: 'RemoteSigned' }, '.\\x.ps1')
t('RemoteSigned wijkt voor Bypass bij een script', (() => {
  const i = policyWeg.args.indexOf('-ExecutionPolicy')
  return i >= 0 && policyWeg.args[i + 1] === 'Bypass'
    && policyWeg.args.filter(a => a === '-ExecutionPolicy').length === 1
})())

const metArgs = psCommandLaunch({}, '"C:\\a b\\x.ps1" -Name "foo bar"')
t('scriptargumenten volgen na -File',
  metArgs.args.includes('-File') && metArgs.args.at(-2) === '-Name' && metArgs.args.at(-1) === 'foo bar')

const pwshFile = psFileLaunch({ exe: 'pwsh', noProfile: false }, 'C:\\a.ps1')
t('pwsh zonder profielvlag blijft zo', pwshFile.exe === 'pwsh.exe' && !pwshFile.args.includes('-NoProfile'))
t('en krijgt alsnog Bypass -File',
  pwshFile.args.includes('-ExecutionPolicy') && pwshFile.args.includes('Bypass')
  && pwshFile.args.includes('-File') && pwshFile.args.at(-1) === 'C:\\a.ps1')

const vensterPs1 = psWindowLaunch({ noProfile: true }, '.\\setup.ps1 -Quiet')
t('venster met script blijft open', vensterPs1.args.includes('-NoExit'))
t('-NoExit staat vóór -File', vensterPs1.args.indexOf('-NoExit') < vensterPs1.args.indexOf('-File'))
t('en start het script, niet -Command',
  vensterPs1.args.includes('-File') && !vensterPs1.args.includes('-Command')
  && vensterPs1.args.includes('.\\setup.ps1') && vensterPs1.args.at(-1) === '-Quiet')

t('encode is utf16le/base64',
  Buffer.from(psEncodeCommand('abc'), 'base64').toString('utf16le') === 'abc')
t('kale Get-Date is compleet', !psScriptIncomplete('Get-Date'))
t('pipe aan het eind is incompleet', psScriptIncomplete('Get-ChildItem |'))
t('open accolade is incompleet', psScriptIncomplete('1..10 | ForEach-Object {'))
t('plus aan het eind is incompleet',
  psScriptIncomplete("$env:PATH = [Environment]::GetEnvironmentVariable('PATH','Machine') + ';' +"))
t('pipeline over regels is compleet', !psScriptIncomplete(
  'Get-ChildItem C:\\ -Recurse -ErrorAction SilentlyContinue |\nWhere-Object { $_.Length -gt 500MB } |\nSelect-Object FullName, Length'))
t('foreach-blok over regels is compleet', !psScriptIncomplete(
  '1..3 | ForEach-Object {\n  $_\n}'))
t('path over twee regels is compleet', !psScriptIncomplete(
  "$env:PATH = [Environment]::GetEnvironmentVariable('PATH','Machine') + ';' +\n[Environment]::GetEnvironmentVariable('PATH','User')"))
t('open quote is incompleet', psScriptIncomplete('Write-Output "hallo'))
t('Get-Content van een bestand is compleet', !psScriptIncomplete('Get-Content .\\x.ps1'))

console.log(ok ? '\nALLE TESTS GESLAAGD' : '\nER ZIJN TESTS GEFAALD')
process.exit(ok ? 0 : 1)
