/**
 * Analyseert Flutter install/run output en stelt automatische fixes voor.
 * Gebruikt door main.js bij mislukte run/build commando's.
 */

const AUTOFIX_CMD_KEYS = new Set([
  'run-android', 'run-windows', 'run-chrome',
  'build-apk', 'build-web', 'build-windows',
])

/** Commando's die auto-fix mogen triggeren (ook via terminal). */
function isAutofixEligible(cmdKey, cmd) {
  if (cmdKey && AUTOFIX_CMD_KEYS.has(cmdKey)) return true
  return /\bflutter\s+(run|build|install)\b/i.test(cmd || '')
}

function isFlutterCommand(cmd) {
  return /^\s*flutter\b/i.test(String(cmd || '').trim())
}

function looksLikeFlutterMissing(output) {
  const text = String(output || '')
  return /'flutter' is not recognized/i.test(text)
    || /"flutter" is not recognized/i.test(text)
    || /flutter['"]?\s+is not recognized/i.test(text)
    || /The term 'flutter' is not recognized/i.test(text)
    || /Cannot find .*flutter/i.test(text)
    || /flutter(\.bat)?\s*:\s*(command not found|not found)/i.test(text)
    || /no such file or directory:.*flutter/i.test(text)
    || /command not found:\s*flutter/i.test(text)
}

const FLUTTER_MISSING_HELP = [
  'Flutter lijkt niet geïnstalleerd (of staat niet in je PATH).',
  '1. Installeer Flutter: https://docs.flutter.dev/get-started/install/windows',
  '2. Voeg de map flutter\\bin toe aan de Windows PATH-variabele',
  '3. Open een nieuwe Command Prompt en test:  flutter doctor',
  '4. Herstart daarna CommandDeck en probeer opnieuw',
]

/**
 * Elk rule-object:
 * - category: 'auto' (default) | 'manual' | 'warn'
 * - patterns: RegExp[] — minstens één moet matchen (of alle bij matchAll: true)
 * - matchAll: optioneel — alle patterns moeten matchen
 * - fixes: acties (cmd, fs, kill) — alleen voor category 'auto'
 * - message: string | (text) => string — terminalmelding voor manual/warn
 * - label: korte NL beschrijving
 * - weight: hoger = eerder / belangrijker bij meerdere matches
 */
const FIX_RULES = [
  {
    id: 'flutter-sdk-missing',
    category: 'manual',
    label: 'Flutter SDK ontbreekt',
    patterns: [
      /'flutter' is not recognized/i,
      /"flutter" is not recognized/i,
      /flutter['"]?\s+is not recognized/i,
      /The term 'flutter' is not recognized/i,
      /Cannot find .*flutter/i,
      /flutter(\.bat)?\s*:\s*(command not found|not found)/i,
      /no such file or directory:.*flutter/i,
      /command not found:\s*flutter/i,
      /is not recognized as an internal or external command[\s\S]{0,80}flutter/i,
    ],
    message:
      'Flutter is niet geïnstalleerd of staat niet in PATH. Installeer via https://docs.flutter.dev/get-started/install/windows — voeg ...\\flutter\\bin toe aan PATH, open een nieuwe terminal, test met `flutter doctor`, en herstart daarna CommandDeck.',
    weight: 220,
  },
  {
    id: 'msvc-coroutine-deprecation',
    category: 'manual',
    label: 'MSVC coroutine deprecation (Windows)',
    patterns: [
      /C2338/i,
      /experimental\/coroutine|_SILENCE_EXPERIMENTAL_COROUTINE_DEPRECATION_WARNINGS/i,
    ],
    matchAll: true,
    message:
      'MSVC coroutine deprecation — voeg toe aan windows/CMakeLists.txt: add_definitions(-D_SILENCE_EXPERIMENTAL_COROUTINE_DEPRECATION_WARNINGS) — dit lost zichzelf niet op via clean/pub get.',
    weight: 210,
  },
  {
    id: 'wrong-project-path',
    category: 'manual',
    label: 'Verkeerde projectmap / geen pubspec.yaml',
    patterns: [
      /No pubspec\.yaml file found/i,
      /Expected to find project root/i,
      /Not a flutter project/i,
      /does not appear to be a Flutter project/i,
    ],
    message:
      'Verkeerde projectmap of pubspec.yaml ontbreekt — controleer het pad in projectinstellingen.',
    weight: 205,
  },
  {
    id: 'audio-service-config',
    category: 'manual',
    label: 'AudioServiceConfig assertion conflict',
    patterns: [
      /androidNotificationOngoing/i,
      /androidStopForegroundOnPause/i,
      /assertion/i,
    ],
    matchAll: true,
    message:
      'AudioServiceConfig conflict: androidNotificationOngoing: true vereist androidStopForegroundOnPause: true. Pas dit aan in main.dart/audio_handler.dart.',
    weight: 200,
  },
  {
    id: 'dart-compile-getter',
    category: 'manual',
    label: 'Compile error — ontbrekende getter/variabele',
    patterns: [
      /Error: The getter '.+' isn't defined for the type/i,
      /Error: The method '.+' isn't defined for the type/i,
      /Error: Undefined name '/i,
    ],
    message: (text) => {
      const getter = text.match(/Error: The getter '([^']+)' isn't defined/)?.[1]
      const method = text.match(/Error: The method '([^']+)' isn't defined/)?.[1]
      const name   = text.match(/Error: Undefined name '([^']+)'/)?.[1]
      const sym    = getter || method || name
      const loc    = text.match(/([\w./\\-]+\.dart):(\d+):(\d+)/)
      const where  = loc ? `${loc[1]}:${loc[2]}` : 'zie output hierboven'
      const detail = sym ? ` '${sym}'` : ''
      return `Compile error in eigen code, geen install-fix mogelijk${detail} (${where})`
    },
    weight: 195,
  },
  {
    id: 'kotlin-kgp-warning',
    category: 'warn',
    label: 'Kotlin Gradle Plugin (KGP) waarschuwing',
    patterns: [
      /apply Kotlin Gradle Plugin \(KGP\)/i,
      /Built-in Kotlin/i,
    ],
    message:
      'Let op: Kotlin Gradle Plugin (KGP) waarschuwing — dit wordt straks een harde build failure. Controleer android/build.gradle en plugin-versies.',
    weight: 150,
  },
  {
    id: 'flutter-lock',
    label: 'Flutter lock / ander proces actief',
    patterns: [
      /waiting for another flutter command/i,
      /lockfile timeout/i,
      /flutter.*\.lock/i,
      /another instance of gradle/i,
    ],
    fixes: [
      { type: 'kill' },
      { cmd: 'flutter pub cache repair', label: 'Pub cache repareren' },
    ],
    weight: 100,
  },
  {
    id: 'file-locked',
    label: 'Bestand vergrendeld / toegang geweigerd',
    patterns: [
      /being used by another process/i,
      /access is denied/i,
      /\bEBUSY\b/i,
      /cannot delete file/i,
      /file is locked/i,
      /process cannot access the file/i,
    ],
    fixes: [
      { type: 'kill' },
      { cmd: 'flutter clean', label: 'Flutter clean' },
    ],
    weight: 95,
  },
  {
    id: 'gradle-failed',
    label: 'Gradle/Android build mislukt',
    patterns: [
      /gradle task .* failed/i,
      /\bBUILD FAILED\b/,
      /execution failed for task/i,
      /could not resolve all files for configuration/i,
      /could not resolve all dependencies/i,
      /failed to apply plugin/i,
      /android\.gradle/i,
      /com\.android\.tools\.build:gradle/i,
    ],
    fixes: [
      { cmd: 'flutter clean', label: 'Flutter clean' },
      { fs: 'deleteDir', path: 'build', label: 'build/ map wissen' },
      { fs: 'deleteDir', path: 'android/.gradle', label: 'android/.gradle wissen' },
      { fs: 'deleteDir', path: 'android/app/build', label: 'android/app/build wissen' },
      { cmd: 'flutter pub get', label: 'Pub get' },
      { cmd: 'cd android && gradlew clean', label: 'Gradle clean (android/)' },
    ],
    weight: 90,
  },
  {
    id: 'kotlin-gradle-version',
    label: 'Kotlin/Gradle versie conflict',
    patterns: [
      /kotlin version/i,
      /incompatible gradle/i,
      /minimum supported gradle/i,
      /requires gradle/i,
    ],
    fixes: [
      { cmd: 'flutter clean', label: 'Flutter clean' },
      { fs: 'deleteDir', path: 'android/.gradle', label: 'android/.gradle wissen' },
      { cmd: 'flutter pub get', label: 'Pub get' },
    ],
    weight: 85,
  },
  {
    id: 'pub-version-solving',
    label: 'Pub dependency conflict',
    patterns: [
      /version solving failed/i,
      /because .* depends on/i,
      /pub get failed/i,
      /resolving dependencies failed/i,
      /failed to update packages/i,
      /incompatible with/i,
      /satisfiable version/i,
    ],
    fixes: [
      { fs: 'deleteFile', path: 'pubspec.lock', label: 'pubspec.lock verwijderen' },
      { fs: 'deleteDir', path: '.dart_tool', label: '.dart_tool wissen' },
      { cmd: 'flutter pub get', label: 'Pub get' },
    ],
    weight: 88,
  },
  {
    id: 'missing-generated',
    label: 'Ontbrekende gegenereerde bestanden',
    patterns: [
      /\.flutter-plugins/i,
      /\.flutter-plugins-dependencies/i,
      /generated\.xcconfig/i,
      /package_config\.json/i,
      /run "flutter pub get"/i,
      /must run "flutter pub get"/i,
      /has not been generated/i,
      /target file .* not found/i,
    ],
    fixes: [
      { fs: 'deleteDir', path: '.dart_tool', label: '.dart_tool wissen' },
      { cmd: 'flutter pub get', label: 'Pub get' },
    ],
    weight: 80,
  },
  {
    id: 'kernel-snapshot',
    label: 'Dart kernel / snapshot build mislukt',
    patterns: [
      /kernel_snapshot/i,
      /frontend_server/i,
      /failed to compile/i,
      /error when reading/i,
      /dart compiler exited unexpectedly/i,
    ],
    fixes: [
      { cmd: 'flutter clean', label: 'Flutter clean' },
      { fs: 'deleteDir', path: '.dart_tool', label: '.dart_tool wissen' },
      { cmd: 'flutter pub get', label: 'Pub get' },
    ],
    weight: 75,
  },
  {
    id: 'stale-build',
    label: 'Verouderde build cache',
    patterns: [
      /stale file/i,
      /stale build/i,
      /build failed due to use of deleted/i,
      /output file .* already exists/i,
      /could not delete.*build/i,
    ],
    fixes: [
      { cmd: 'flutter clean', label: 'Flutter clean' },
      { fs: 'deleteDir', path: 'build', label: 'build/ map wissen' },
      { cmd: 'flutter pub get', label: 'Pub get' },
    ],
    weight: 70,
  },
  {
    id: 'cmake-cache-path-mismatch',
    label: 'CMake cache pad-mismatch (project verplaatst/gekopieerd)',
    patterns: [
      /current CMakeCache\.txt directory .* is different than/i,
      /is different than the directory .* where CMakeCache\.txt was created/i,
      /does not match the source .* used to generate cache/i,
      /Re-run cmake with a different source directory/i,
    ],
    fixes: [
      { cmd: 'flutter clean', label: 'Flutter clean' },
      { fs: 'deleteDir', path: 'build', label: 'build/ map wissen' },
      { cmd: 'flutter pub get', label: 'Pub get' },
    ],
    weight: 94,
  },
  {
    id: 'shader-compilation',
    label: 'Shader compilatie mislukt',
    patterns: [
      /shader compilation/i,
      /impellerc/i,
      /shaderc/i,
    ],
    fixes: [
      { cmd: 'flutter clean', label: 'Flutter clean' },
      { fs: 'deleteDir', path: 'build', label: 'build/ map wissen' },
      { cmd: 'flutter pub get', label: 'Pub get' },
    ],
    weight: 65,
  },
  {
    id: 'windows-desktop-disabled',
    label: 'Windows desktop niet ingeschakeld',
    patterns: [
      /windows desktop.*not enabled/i,
      /enable-windows-desktop/i,
      /"windows" is not an allowed/i,
    ],
    fixes: [
      { cmd: 'flutter config --enable-windows-desktop', label: 'Windows desktop inschakelen' },
      { cmd: 'flutter pub get', label: 'Pub get' },
    ],
    weight: 60,
  },
  {
    id: 'web-not-enabled',
    label: 'Web/Chrome niet ingeschakeld',
    patterns: [
      /web support.*not enabled/i,
      /enable-web/i,
      /chrome.*not found/i,
      /cannot find chrome executable/i,
      /no supported browser/i,
    ],
    fixes: [
      { cmd: 'flutter config --enable-web', label: 'Web support inschakelen' },
      { cmd: 'flutter pub get', label: 'Pub get' },
    ],
    weight: 58,
  },
  {
    id: 'missing-web-platform-dir',
    label: 'Project mist web/ map',
    patterns: [
      /web_templated_files/i,
    ],
    fixes: [
      { cmd: 'flutter create . --platforms=web', label: 'web/ map genereren' },
      { cmd: 'flutter pub get', label: 'Pub get' },
    ],
    weight: 92,
  },
  {
    id: 'missing-windows-platform-dir',
    label: 'Project mist windows/ map',
    patterns: [
      /No Windows desktop project configured/i,
    ],
    fixes: [
      { cmd: 'flutter create . --platforms=windows', label: 'windows/ map genereren' },
      { cmd: 'flutter pub get', label: 'Pub get' },
    ],
    weight: 92,
  },
  {
    id: 'missing-android-platform-dir',
    label: 'Project mist android/ map',
    patterns: [
      /No application found for TargetPlatform\.android/i,
    ],
    fixes: [
      { cmd: 'flutter create . --platforms=android', label: 'android/ map genereren' },
      { cmd: 'flutter pub get', label: 'Pub get' },
    ],
    weight: 92,
  },
  {
    id: 'visual-studio-missing',
    label: 'Visual Studio / Windows toolchain',
    patterns: [
      /visual studio.*not installed/i,
      /unable to find suitable visual studio/i,
      /windows sdk/i,
      /msvc.*not found/i,
    ],
    fixes: [
      { cmd: 'flutter doctor', label: 'Flutter doctor (diagnose)' },
    ],
    weight: 40,
  },
  {
    id: 'npm-web-assets',
    label: 'NPM/web assets probleem',
    patterns: [
      /\bnpm ERR!/i,
      /cannot find module/i,
      /node_modules/i,
      /package\.json.*not found/i,
    ],
    fixes: [
      { cmd: 'npm install', label: 'npm install' },
      { cmd: 'flutter pub get', label: 'Pub get' },
    ],
    weight: 55,
  },
  {
    id: 'ios-pods',
    label: 'CocoaPods probleem',
    patterns: [
      /pod install/i,
      /cocoapods/i,
      /\.symlinks/i,
      /specs repository/i,
    ],
    fixes: [
      { cmd: 'cd ios && pod install --repo-update', label: 'Pod install (ios/)' },
      { cmd: 'flutter pub get', label: 'Pub get' },
    ],
    weight: 50,
  },
  {
    id: 'device-offline',
    label: 'Apparaat offline of niet gevonden',
    patterns: [
      /device .* not found/i,
      /no devices found/i,
      /unable to find.*device/i,
      /device offline/i,
      /adb.*device unauthorized/i,
      /more than one device/i,
    ],
    fixes: [
      { cmd: 'flutter devices', label: 'Apparaten opnieuw scannen' },
      { cmd: 'adb kill-server && adb start-server', label: 'ADB herstarten' },
    ],
    weight: 45,
  },
  {
    id: 'pub-cache-corrupt',
    label: 'Pub cache beschadigd',
    patterns: [
      /pub cache/i,
      /corrupted/i,
      /checksum mismatch/i,
      /failed to load.*package/i,
    ],
    fixes: [
      { cmd: 'flutter pub cache repair', label: 'Pub cache repareren' },
      { cmd: 'flutter pub get', label: 'Pub get' },
    ],
    weight: 72,
  },
  {
    id: 'generic-pub-get',
    label: 'Algemene dependency/build fout',
    patterns: [
      /error: unable to find/i,
      /compilation failed/i,
      /failed to build/i,
      /launching .* has failed/i,
      /afgebroken \(exit [1-9]/i,
    ],
    fixes: [
      { cmd: 'flutter clean', label: 'Flutter clean' },
      { cmd: 'flutter pub get', label: 'Pub get' },
    ],
    weight: 10,
  },
]

function ruleMatches(rule, text) {
  if (!rule.patterns?.length) return false
  if (rule.matchAll) return rule.patterns.every(p => p.test(text))
  return rule.patterns.some(p => p.test(text))
}

function buildMessage(rule, text) {
  if (typeof rule.message === 'function') return rule.message(text)
  if (rule.message) return rule.message
  return rule.label
}

function fixKey(fix) {
  if (fix.type === 'kill') return 'kill'
  if (fix.fs) return `${fix.fs}:${fix.path}`
  return fix.cmd || ''
}

function dedupeFixes(fixes) {
  const seen = new Set()
  const out = []
  for (const fix of fixes) {
    const key = fixKey(fix)
    if (!key || seen.has(key)) continue
    seen.add(key)
    out.push(fix)
  }
  return out
}

/**
 * @returns {{ matchedRules: string[], summary: string, fixes: object[], manual?: boolean, messages?: string[], warnings?: string[] }}
 */
function analyzeFailure(output, cmdKey, cmd) {
  const text = String(output || '')
  const eligible = isAutofixEligible(cmdKey, cmd)

  const matched = text.trim()
    ? FIX_RULES.filter(rule => ruleMatches(rule, text)).sort((a, b) => b.weight - a.weight)
    : []

  const manualRules = matched.filter(r => r.category === 'manual')
  const warnRules   = matched.filter(r => r.category === 'warn')
  const autoRules   = matched.filter(r => !r.category || r.category === 'auto')

  if (manualRules.length) {
    return {
      matchedRules: manualRules.map(r => r.id),
      summary: manualRules[0].label,
      fixes: [],
      manual: true,
      messages: manualRules.map(r => buildMessage(r, text)),
      warnings: warnRules.map(r => buildMessage(r, text)),
      cmdKey,
      cmd,
    }
  }

  if (!matched.length) {
    if (eligible) {
      return {
        matchedRules: ['fallback-clean'],
        summary: 'Standaard clean + pub get',
        fixes: [
          { cmd: 'flutter clean', label: 'Flutter clean' },
          { cmd: 'flutter pub get', label: 'Pub get' },
        ],
        warnings: [],
        cmdKey,
        cmd,
      }
    }
    return { matchedRules: [], summary: '', fixes: [], warnings: [], cmdKey, cmd }
  }

  const fixes = dedupeFixes(autoRules.flatMap(r => r.fixes || []))
  const labels = [...manualRules, ...autoRules].slice(0, 3).map(r => r.label)
  const summary = labels.join(' + ') || matched[0].label

  return {
    matchedRules: matched.map(r => r.id),
    summary,
    fixes,
    warnings: warnRules.map(r => buildMessage(r, text)),
    cmdKey,
    cmd,
  }
}

module.exports = {
  AUTOFIX_CMD_KEYS,
  FIX_RULES,
  FLUTTER_MISSING_HELP,
  isAutofixEligible,
  isFlutterCommand,
  looksLikeFlutterMissing,
  analyzeFailure,
  dedupeFixes,
  ruleMatches,
  buildMessage,
}
