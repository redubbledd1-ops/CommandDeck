const fx = require('../install-fixer')
const fs = require('fs')
const path = require('path')
let ok = true
const t = (l, c) => { console.log((c ? 'PASS  ' : 'FAIL  ') + l); if (!c) ok = false }

t('isFlutterCommand doctor', fx.isFlutterCommand('flutter doctor'))
t('isFlutterCommand pub get', fx.isFlutterCommand('  flutter pub get'))
t('niet flutter', !fx.isFlutterCommand('npm start'))
t('cmd not recognized', fx.looksLikeFlutterMissing("'flutter' is not recognized as an internal or external command"))
t('powershell missing', fx.looksLikeFlutterMissing("The term 'flutter' is not recognized"))
t('geen false positive', !fx.looksLikeFlutterMissing('BUILD FAILED'))

const a = fx.analyzeFailure("'flutter' is not recognized as an internal or external command", 'doctor', 'flutter doctor')
t('rule flutter-sdk-missing matcht', a.matchedRules.includes('flutter-sdk-missing'))
t('helptekst aanwezig', fx.FLUTTER_MISSING_HELP.length >= 4)

const main = fs.readFileSync(path.join(__dirname, '..', 'main.js'), 'utf8')
t('default projectnaam', main.includes("name: 'Default Flutter Project'"))
t('geen dd_crypto meer', !main.includes('dd_crypto'))
t('geen persoonlijk redub-pad', !main.includes('Users\\\\redub\\\\Desktop\\\\dd_crypto'))

console.log(ok ? '\nALLE TESTS GESLAAGD' : '\nER ZIJN TESTS GEFAALD')
process.exit(ok ? 0 : 1)
