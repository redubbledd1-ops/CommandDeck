const { isAndroidDevice, parseFlutterAndroidDevices } = require('../flutter-devices')

let ok = true
const t = (l, c) => { console.log((c ? 'PASS  ' : 'FAIL  ') + l); if (!c) ok = false }

const MACHINE = `[
  {
    "name": "CPH2699",
    "id": "437d872e",
    "isSupported": true,
    "targetPlatform": "android-arm64",
    "emulator": false,
    "sdk": "Android 16 (API 36)",
    "capabilities": { "hotReload": true }
  },
  {
    "name": "Windows",
    "id": "windows",
    "isSupported": true,
    "targetPlatform": "windows-x64",
    "emulator": false,
    "sdk": "Microsoft Windows [Version 10.0.22631.6199]"
  },
  {
    "name": "Chrome",
    "id": "chrome",
    "isSupported": true,
    "targetPlatform": "web-javascript",
    "emulator": false,
    "sdk": "Google Chrome 151.0.7922.174"
  },
  {
    "name": "Edge",
    "id": "edge",
    "isSupported": true,
    "targetPlatform": "web-javascript",
    "emulator": false,
    "sdk": "Microsoft Edge 151.0.4129.101"
  }
]`

const TABLE = `Found 4 connected devices:
CPH2699 (mobile) • 437d872e • android-arm64 • Android 16 (API 36)
Windows (desktop) • windows • windows-x64 • Microsoft Windows [Version 10.0.22631.6199]
Chrome (web) • chrome • web-javascript • Google Chrome 151.0.7922.174
Edge (web) • edge • web-javascript • Microsoft Edge 151.0.4129.101`

t('telefoon is android (zonder category-veld)', isAndroidDevice({
  name: 'CPH2699', id: '437d872e', targetPlatform: 'android-arm64',
  sdk: 'Android 16 (API 36)',
}))
t('windows is geen android', !isAndroidDevice({
  name: 'Windows', id: 'windows', targetPlatform: 'windows-x64',
}))
t('chrome is geen android', !isAndroidDevice({
  name: 'Chrome', id: 'chrome', targetPlatform: 'web-javascript',
}))
t('emulator is android', isAndroidDevice({
  name: 'sdk gphone64', id: 'emulator-5554', targetPlatform: 'android-x64',
  emulator: true, sdk: 'Android 14 (API 34)',
}))
t('ios is geen android', !isAndroidDevice({
  name: 'iPhone', id: '00008030', targetPlatform: 'ios', category: 'mobile',
}))

const fromJson = parseFlutterAndroidDevices(MACHINE)
t('machine-json vindt precies 1 android', fromJson.length === 1)
t('machine-json pakt CPH2699', fromJson[0] && fromJson[0].id === '437d872e' && fromJson[0].name === 'CPH2699')

const ruis = 'Waiting for another flutter command to release the startup lock...\n' + MACHINE
t('startup-ruis vóór json mag niet storen', parseFlutterAndroidDevices(ruis)[0].id === '437d872e')

const fromTable = parseFlutterAndroidDevices(TABLE)
t('tabel vindt precies 1 android', fromTable.length === 1)
t('tabel pakt CPH2699', fromTable[0] && fromTable[0].id === '437d872e')

const twee = parseFlutterAndroidDevices(`[
  { "name": "CPH2699", "id": "437d872e", "targetPlatform": "android-arm64", "sdk": "Android 16" },
  { "name": "Pixel 8", "id": "emulator-5554", "targetPlatform": "android-x64", "sdk": "Android 14" }
]`)
t('twee android-apparaten blijven beide over', twee.length === 2)

t('lege output → geen apparaten', parseFlutterAndroidDevices('').length === 0)
t('onzin-output → geen crash, geen apparaten', parseFlutterAndroidDevices('flutter is not recognized').length === 0)

const fs = require('fs')
const path = require('path')
const main = fs.readFileSync(path.join(__dirname, '..', 'main.js'), 'utf8')
t('main.js filtert niet meer op category === mobile', !main.includes("d.category === 'mobile'"))
t('main.js gebruikt childEnv bij apparaatscan', /flutter devices[\s\S]{0,400}childEnv\(\)/.test(main)
  || /childEnv\(\)[\s\S]{0,200}flutter devices/.test(main)
  || /spawn\('flutter devices --machine'[\s\S]{0,250}env:\s*childEnv\(\)/.test(main))

console.log(ok ? '\nALLE TESTS GESLAAGD' : '\nER ZIJN TESTS GEFAALD')
process.exit(ok ? 0 : 1)
