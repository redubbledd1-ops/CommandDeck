const C = require('../process-conflict')
let ok = true
const t = (l, c) => { console.log((c ? 'PASS  ' : 'FAIL  ') + l); if (!c) ok = false }

t('eligible run-android', C.isConflictCheckEligible('run-android', ''))
t('eligible build-apk', C.isConflictCheckEligible('build-apk', ''))
t('eligible clean', C.isConflictCheckEligible('clean', ''))
t('eligible typed flutter run', C.isConflictCheckEligible(null, 'flutter run -d windows'))
t('eligible flutter pub get', C.isConflictCheckEligible(null, 'flutter pub get'))
t('niet eligible doctor', !C.isConflictCheckEligible('doctor', 'flutter doctor'))
t('niet eligible git', !C.isConflictCheckEligible(null, 'git status'))

t('pad match slash', C.padInTekst('C:\\Proj\\App\\android', 'C:/Proj/App'))
t('pad match case', C.padInTekst('working on c:\\proj\\app', 'C:\\Proj\\App'))
t('pad geen match', !C.padInTekst('C:\\Other\\App', 'C:\\Proj\\App'))

t('studio = hoog', C.classifyDanger({ name: 'studio64.exe', cmdline: '' }, 'C:\\P') === 'hoog')
t('devenv = hoog', C.classifyDanger({ name: 'devenv.exe', cmdline: '' }, 'C:\\P') === 'hoog')
t('idea = hoog', C.classifyDanger({ name: 'idea64.exe', cmdline: '' }, 'C:\\P') === 'hoog')
t('msbuild = middel', C.classifyDanger({ name: 'MSBuild.exe', cmdline: 'msbuild C:\\P' }, 'C:\\P') === 'middel')
t('cmake = middel', C.classifyDanger({ name: 'cmake.exe', cmdline: '' }, 'C:\\P') === 'middel')
t('dart pad-match = laag', C.classifyDanger({
  name: 'dart.exe', cmdline: 'dart.exe C:\\P\\foo',
}, 'C:\\P') === 'laag')
t('dart andere map = middel', C.classifyDanger({
  name: 'dart.exe', cmdline: 'dart.exe C:\\Other\\foo',
}, 'C:\\P') === 'middel')
t('gradle zonder pad = middel', C.classifyDanger({
  name: 'java.exe', cmdline: 'java.exe org.gradle.launcher',
}, 'C:\\P') === 'middel')

t('studio niet killable', !C.canAutoKill({ name: 'studio64.exe' }, 'hoog'))
t('devenv niet killable', !C.canAutoKill({ name: 'devenv.exe' }, 'hoog'))
t('dart killable', C.canAutoKill({ name: 'dart.exe' }, 'laag'))
t('msbuild killable', C.canAutoKill({ name: 'MSBuild.exe' }, 'middel'))
t('gradle killable', C.canAutoKill({ name: 'java.exe' }, 'middel'))

t('maxDanger middel', C.maxDangerOf(['laag', 'middel']) === 'middel')
t('maxDanger hoog', C.maxDangerOf(['laag', 'hoog', 'middel']) === 'hoog')
t('maxDanger leeg', C.maxDangerOf([]) === null)

t('studio alleen android-related', C.relevantProcess({ name: 'studio64.exe', cmdline: '' }, { androidRelated: true }))
t('studio niet bij chrome-run', !C.relevantProcess({ name: 'studio64.exe', cmdline: '' }, { androidRelated: false, windowsRelated: false }))
t('devenv bij windows-related', C.relevantProcess({ name: 'devenv.exe', cmdline: '' }, { windowsRelated: true }))
t('devenv niet bij android-only', !C.relevantProcess({ name: 'devenv.exe', cmdline: '' }, { androidRelated: true, windowsRelated: false }))
t('rider altijd relevant', C.relevantProcess({ name: 'rider64.exe', cmdline: '' }, { androidRelated: false, windowsRelated: false }))
t('msbuild bij windows', C.relevantProcess({ name: 'MSBuild.exe', cmdline: '' }, { windowsRelated: true }))
t('msbuild met pad-match zonder windows-flag', C.relevantProcess({
  name: 'MSBuild.exe', cmdline: 'msbuild C:\\P\\windows',
}, { windowsRelated: false, cwd: 'C:\\P' }))
t('msbuild ander project negeren', !C.relevantProcess({
  name: 'MSBuild.exe', cmdline: 'msbuild C:\\Other',
}, { windowsRelated: false, cwd: 'C:\\P' }))
t('dart altijd relevant', C.relevantProcess({ name: 'dart.exe', cmdline: '' }, { androidRelated: false }))
t('java zonder gradle negeren', !C.relevantProcess({
  name: 'java.exe', cmdline: 'minecraft server',
}, { androidRelated: true }))
t('dotnet build telt', C.isMsBuildToolchain('dotnet.exe', 'dotnet build'))
t('dotnet zonder build niet', !C.isMsBuildToolchain('dotnet.exe', 'dotnet --info'))

t('windows-related build-windows', C.isWindowsRelated('build-windows', ''))
t('windows-related niet android', !C.isWindowsRelated('run-android', ''))

t('label studio', C.labelFor({ name: 'studio64.exe', cmdline: '' }, 'hoog', 'C:\\P') === 'Android Studio')
t('label devenv', C.labelFor({ name: 'devenv.exe', cmdline: '' }, 'hoog', 'C:\\P') === 'Visual Studio')
t('label msbuild', /MSBuild/.test(C.labelFor({ name: 'MSBuild.exe', cmdline: 'x C:\\P' }, 'middel', 'C:\\P')))
t('bekende namen bevatten devenv+msbuild', C.PROCESS_NAMES.has('devenv.exe') && C.PROCESS_NAMES.has('msbuild.exe'))
t('geen vscode in harde lijst', !C.PROCESS_NAMES.has('Code.exe') && !C.PROCESS_NAMES.has('Cursor.exe'))
t('editors wel in watched', C.EDITOR_NAMES.has('Code.exe') && C.EDITOR_NAMES.has('Cursor.exe'))
t('isEditor Code', C.isEditor('Code.exe'))
t('isEditor Cursor', C.isEditor('Cursor.exe'))
t('niet editor dart', !C.isEditor('dart.exe'))
t('editorLabel', C.editorLabel('Code.exe') === 'VS Code' && C.editorLabel('Cursor.exe') === 'Cursor')
t('collectEditorHints groepeert', (() => {
  const h = C.collectEditorHints([
    { name: 'Code.exe', pid: 1, cmdline: 'Code.exe C:\\P\\x' },
    { name: 'Code.exe', pid: 2, cmdline: 'Code.exe' },
    { name: 'Cursor.exe', pid: 3, cmdline: '' },
  ], 'C:\\P')
  const code = h.find(e => e.label === 'VS Code')
  const cur = h.find(e => e.label === 'Cursor')
  return code && code.count === 2 && code.padMatch && cur && cur.count === 1 && !cur.padMatch
})())
t('editor niet als relevant process', !C.relevantProcess({ name: 'Code.exe', cmdline: 'C:\\P' }, { windowsRelated: true, cwd: 'C:\\P' }))
t('parse leeg', C.parseProcessJson('').length === 0)
t('parse object', C.parseProcessJson('{"ProcessId":1,"Name":"dart.exe"}').length === 1)

const fs = require('fs')
const path = require('path')
const main = fs.readFileSync(path.join(__dirname, '..', 'main.js'), 'utf8')
t('main: conflictScan ipc', main.includes("cmd:conflictScan"))
t('main: openTaskManager ipc', main.includes("cmd:openTaskManager"))
t('main: geen stille killFlutter in applyFix kill-tak',
  /fix\.type === 'kill'[\s\S]{0,200}conflict/i.test(main)
  || main.includes('stop het eerst via de dialoog'))

console.log(ok ? '\nALLE TESTS GESLAAGD' : '\nER ZIJN TESTS GEFAALD')
process.exit(ok ? 0 : 1)
