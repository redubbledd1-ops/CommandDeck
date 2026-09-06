/**
 * Detecteert processen/locks die flutter run/build/install in de weg zitten.
 * Breed: bekende IDE's en build-tools (Android Studio, Visual Studio, JetBrains,
 * MSBuild, Gradle, CMake, …) — ook als ze níet via CommandDeck gestart zijn.
 * Doden gebeurt nooit hier — alleen scannen + classificeren.
 */

const { execFileSync, spawn } = require('child_process')
const fs = require('fs')
const path = require('path')

const CONFLICT_CMD_KEYS = new Set([
  'run-android', 'run-windows', 'run-chrome',
  'build-apk', 'build-web', 'build-windows',
  'clean', 'pub-get',
])

// Bekende namen die ~90% van Flutter/Windows/Android-builds raken.
// Geen VS Code/Cursor: die staan bijna altijd open en blokkeren zelden.
const PROCESS_NAMES = new Set([
  // Flutter / Dart
  'dart.exe',
  // Android / Gradle
  'java.exe',
  'gradle.exe',
  'gradlew.exe',
  // Android Studio
  'studio64.exe',
  'studio.exe',
  // Visual Studio
  'devenv.exe',
  'msbuild.exe',
  'vbcscompiler.exe',
  'dotnet.exe',
  // MSVC / C++ toolchain (Flutter Windows)
  'cmake.exe',
  'ninja.exe',
  'cl.exe',
  'link.exe',
  // JetBrains (Flutter-plugin / eigen builds)
  'idea64.exe',
  'idea.exe',
  'rider64.exe',
  'rider.exe',
  'clion64.exe',
  'clion.exe',
])

// Editors die zelden de dader zijn, maar wél een tip verdienen als er een
// blokkade is zonder duidelijke build-tool. Nooit auto-kill / nooit harde conflict.
const EDITOR_NAMES = new Set([
  'Code.exe',
  'Cursor.exe',
  'Code - Insiders.exe',
])

const WATCHED_NAMES = new Set([...PROCESS_NAMES, ...EDITOR_NAMES])

function isConflictCheckEligible(cmdKey, cmd) {
  if (cmdKey && CONFLICT_CMD_KEYS.has(cmdKey)) return true
  return /\bflutter\s+(run|build|install|clean|pub)\b/i.test(cmd || '')
}

function isAndroidRelated(cmdKey, cmd) {
  if (cmdKey === 'run-android' || cmdKey === 'build-apk') return true
  if (cmdKey === 'run-windows' || cmdKey === 'run-chrome'
    || cmdKey === 'build-web' || cmdKey === 'build-windows'
    || cmdKey === 'clean' || cmdKey === 'pub-get') return false
  const c = String(cmd || '')
  if (/\bbuild\s+apk\b/i.test(c) || /\bflutter\s+install\b/i.test(c)) return true
  if (/\b-d\s+(windows|chrome|web|macos|linux)\b/i.test(c)) return false
  if (/\b-d\s+android\b/i.test(c) || /\bandroid\b/i.test(c)) return true
  // Losse `flutter run` zonder device: kan Android zijn
  return /\bflutter\s+run\b/i.test(c)
}

function isWindowsRelated(cmdKey, cmd) {
  if (cmdKey === 'run-windows' || cmdKey === 'build-windows') return true
  if (cmdKey === 'run-android' || cmdKey === 'build-apk'
    || cmdKey === 'run-chrome' || cmdKey === 'build-web'
    || cmdKey === 'clean' || cmdKey === 'pub-get') return false
  const c = String(cmd || '')
  if (/\b-d\s+windows\b/i.test(c) || /\bbuild\s+windows\b/i.test(c)) return true
  if (/\b-d\s+(android|chrome|web|macos|linux)\b/i.test(c)) return false
  if (/\bbuild\s+apk\b/i.test(c) || /\bbuild\s+web\b/i.test(c)) return false
  // Losse flutter run/build: kan Windows desktop zijn
  return /\bflutter\s+(run|build)\b/i.test(c)
}

function normalizePad(p) {
  return String(p || '').replace(/\//g, '\\').toLowerCase()
}

function padInTekst(tekst, cwd) {
  if (!tekst || !cwd) return false
  const t = normalizePad(tekst)
  const c = normalizePad(cwd)
  if (!c || c.length < 4) return false
  if (t.includes(c)) return true
  if (t.includes(c.replace(/\\/g, '\\\\'))) return true
  return false
}

function isEditor(name) {
  const n = String(name || '')
  return /^Code\.exe$/i.test(n)
    || /^Cursor\.exe$/i.test(n)
    || /^Code - Insiders\.exe$/i.test(n)
}

function editorLabel(name) {
  if (/^Cursor\.exe$/i.test(name || '')) return 'Cursor'
  if (/^Code - Insiders\.exe$/i.test(name || '')) return 'VS Code Insiders'
  if (/^Code\.exe$/i.test(name || '')) return 'VS Code'
  return name || '?'
}

/** Soft hints: editors die open staan (geen harde conflict, wel tip). */
function collectEditorHints(raw, cwd) {
  const byLabel = new Map()
  for (const proc of raw || []) {
    if (!isEditor(proc.name)) continue
    const label = editorLabel(proc.name)
    const padMatch = padInTekst(proc.cmdline, cwd)
    const cur = byLabel.get(label) || {
      label, name: proc.name, count: 0, padMatch: false, pid: proc.pid,
    }
    cur.count += 1
    if (padMatch) cur.padMatch = true
    byLabel.set(label, cur)
  }
  return [...byLabel.values()]
}

function isAndroidStudio(name) {
  return /^studio(64)?\.exe$/i.test(name || '')
}

function isVisualStudioIde(name) {
  return /^devenv\.exe$/i.test(name || '')
}

function isJetBrainsIde(name) {
  return /^(idea|rider|clion)(64)?\.exe$/i.test(name || '')
}

/** IDE-hoofdproces: nooit auto-kill (ongesaved werk). */
function isIde(name) {
  return isAndroidStudio(name) || isVisualStudioIde(name) || isJetBrainsIde(name)
}

function isGradleJava(name, cmdline) {
  if (/^gradle/i.test(name || '')) return true
  if (!/^java\.exe$/i.test(name || '')) return false
  const c = String(cmdline || '')
  return /gradle|org\.gradle|gradlew|android\.tools\.build/i.test(c)
}

function isDartOfFlutter(name, cmdline) {
  if (/^dart\.exe$/i.test(name || '')) return true
  return /flutter/i.test(String(cmdline || ''))
}

/** Visual Studio / .NET / C++ build-tools (niet de IDE zelf). */
function isMsBuildToolchain(name, cmdline) {
  const n = String(name || '')
  if (/^(msbuild|vbcscompiler|cmake|ninja|cl|link)\.exe$/i.test(n)) return true
  if (!/^dotnet\.exe$/i.test(n)) return false
  // dotnet draait vaak voor andere dingen; alleen bij build-achtige args
  return /\b(build|msbuild|publish|pack|restore|run|test)\b/i.test(String(cmdline || ''))
}

/**
 * @returns {'laag'|'middel'|'hoog'}
 * laag   = vrij veilig te stoppen (dart/flutter van deze map)
 * middel = stopt een build (Gradle, MSBuild, …)
 * hoog   = IDE zelf — niet automatisch doden, Taakbeheer wijzen
 */
function classifyDanger(proc, cwd) {
  const name = proc.name || ''
  const cmd = proc.cmdline || ''
  if (isIde(name)) return 'hoog'
  const match = padInTekst(cmd, cwd)
  if (isDartOfFlutter(name, cmd)) return match ? 'laag' : 'middel'
  if (isGradleJava(name, cmd)) return 'middel'
  if (isMsBuildToolchain(name, cmd)) return match ? 'middel' : 'middel'
  return match ? 'middel' : 'hoog'
}

function canAutoKill(proc, danger) {
  if (isIde(proc.name)) return false
  return danger === 'laag' || danger === 'middel'
}

function maxDangerOf(list) {
  if (list.includes('hoog')) return 'hoog'
  if (list.includes('middel')) return 'middel'
  if (list.includes('laag')) return 'laag'
  return null
}

function labelFor(proc, danger, cwd) {
  const name = proc.name || '?'
  if (isAndroidStudio(name)) return 'Android Studio'
  if (isVisualStudioIde(name)) return 'Visual Studio'
  if (/^idea(64)?\.exe$/i.test(name)) return 'IntelliJ IDEA'
  if (/^rider(64)?\.exe$/i.test(name)) return 'JetBrains Rider'
  if (/^clion(64)?\.exe$/i.test(name)) return 'CLion'
  if (isGradleJava(name, proc.cmdline)) {
    return padInTekst(proc.cmdline, cwd)
      ? 'Gradle / Java (deze projectmap)'
      : 'Gradle / Java (map onbekend — mogelijk IDE of ander project)'
  }
  if (isDartOfFlutter(name, proc.cmdline)) {
    return padInTekst(proc.cmdline, cwd)
      ? 'Flutter / Dart (deze projectmap)'
      : 'Flutter / Dart (map onbekend)'
  }
  if (/^msbuild\.exe$/i.test(name)) {
    return padInTekst(proc.cmdline, cwd)
      ? 'MSBuild (deze projectmap)'
      : 'MSBuild (map onbekend — mogelijk Visual Studio of ander project)'
  }
  if (/^dotnet\.exe$/i.test(name)) {
    return padInTekst(proc.cmdline, cwd)
      ? '.NET / dotnet build (deze projectmap)'
      : '.NET / dotnet (map onbekend)'
  }
  if (/^(cmake|ninja|cl|link|vbcscompiler)\.exe$/i.test(name)) {
    const kort = name.replace(/\.exe$/i, '')
    return padInTekst(proc.cmdline, cwd)
      ? `${kort} (deze projectmap)`
      : `${kort} (map onbekend — C++/Windows-build)`
  }
  return name
}

function parseProcessJson(raw) {
  const text = String(raw || '').trim()
  if (!text) return []
  try {
    const data = JSON.parse(text)
    return Array.isArray(data) ? data : [data]
  } catch {
    return []
  }
}

function listWindowsBuildProcesses() {
  if (process.platform !== 'win32') return []
  // Set in PowerShell i.p.v. één lange WMI-Filter (limiet / leesbaarheid).
  const namesPs = [...WATCHED_NAMES].map(n => `'${n.replace(/'/g, "''")}'`).join(',')
  const ps = [
    `$ErrorActionPreference='SilentlyContinue'`,
    `$names = @(${namesPs})`,
    `$set = [System.Collections.Generic.HashSet[string]]::new([string[]]$names, [StringComparer]::OrdinalIgnoreCase)`,
    `Get-CimInstance Win32_Process |`,
    `Where-Object { $set.Contains($_.Name) } |`,
    `Select-Object ProcessId,Name,CommandLine |`,
    `ConvertTo-Json -Compress`,
  ].join(' ')
  try {
    const uit = execFileSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', ps], {
      encoding: 'utf8',
      timeout: 10000,
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'ignore'],
      maxBuffer: 8 * 1024 * 1024,
    })
    return parseProcessJson(uit).map(row => ({
      pid: Number(row.ProcessId) || 0,
      name: String(row.Name || ''),
      cmdline: String(row.CommandLine || ''),
    })).filter(p => p.pid > 0 && p.name)
  } catch {
    return []
  }
}

/**
 * @param {{ androidRelated?: boolean, windowsRelated?: boolean }} ctx
 */
function relevantProcess(proc, ctx = {}) {
  const name = proc.name || ''
  const cmd = proc.cmdline || ''
  // Editors horen niet in de harde conflictlijst
  if (isEditor(name)) return false
  const androidRelated = !!ctx.androidRelated
  const windowsRelated = !!ctx.windowsRelated

  if (isAndroidStudio(name)) return androidRelated
  if (isVisualStudioIde(name)) return windowsRelated
  // JetBrains Flutter-plugin: bij elke flutter run/build relevant
  if (isJetBrainsIde(name)) return true

  if (isDartOfFlutter(name, cmd)) return true
  if (isGradleJava(name, cmd)) return true

  if (isMsBuildToolchain(name, cmd)) {
    if (windowsRelated) return true
    if (padInTekst(cmd, ctx.cwd || '')) return true
    return false
  }

  return false
}

function findProjectLocks(cwd) {
  const locks = []
  if (!cwd) return locks
  const candidates = [
    path.join(cwd, '.dart_tool', 'flutter_build_lock'),
    path.join(cwd, 'android', '.gradle', 'noVersion', 'buildLogic.lock'),
  ]
  for (const pad of candidates) {
    try {
      if (fs.existsSync(pad)) {
        const st = fs.statSync(pad)
        locks.push({
          pad,
          ouderdomMs: Math.max(0, Date.now() - st.mtimeMs),
        })
      }
    } catch { /* ignore */ }
  }
  try {
    const gradleDir = path.join(cwd, 'android', '.gradle')
    if (fs.existsSync(gradleDir)) {
      const walk = (dir, depth) => {
        if (depth > 3) return
        let entries = []
        try { entries = fs.readdirSync(dir, { withFileTypes: true }) } catch { return }
        for (const e of entries) {
          const full = path.join(dir, e.name)
          if (e.isDirectory()) walk(full, depth + 1)
          else if (/\.lock$/i.test(e.name) || /lockfile/i.test(e.name)) {
            try {
              const st = fs.statSync(full)
              locks.push({ pad: full, ouderdomMs: Math.max(0, Date.now() - st.mtimeMs) })
            } catch { /* ignore */ }
          }
        }
      }
      walk(gradleDir, 0)
    }
  } catch { /* ignore */ }
  return locks.slice(0, 8)
}

/**
 * @param {{ cwd?: string, cmdKey?: string, cmd?: string, eigenCommandoDraait?: boolean }} opts
 */
function scanConflicts(opts = {}) {
  const cwd = opts.cwd || ''
  const androidRelated = isAndroidRelated(opts.cmdKey, opts.cmd)
  const windowsRelated = isWindowsRelated(opts.cmdKey, opts.cmd)
  const raw = listWindowsBuildProcesses()
  const processes = []
  for (const proc of raw) {
    if (!relevantProcess(proc, { androidRelated, windowsRelated, cwd })) continue
    const danger = classifyDanger(proc, cwd)
    const killable = canAutoKill(proc, danger)
    processes.push({
      pid: proc.pid,
      name: proc.name,
      cmdline: proc.cmdline.slice(0, 400),
      danger,
      killable,
      padMatch: padInTekst(proc.cmdline, cwd),
      label: labelFor(proc, danger, cwd),
    })
  }
  const rank = { hoog: 0, middel: 1, laag: 2 }
  processes.sort((a, b) => (rank[a.danger] - rank[b.danger]) || (a.pid - b.pid))

  const locks = findProjectLocks(cwd)
  const editors = collectEditorHints(raw, cwd)
  const dangers = processes.map(p => p.danger)
  if (locks.length) dangers.push('middel')
  if (opts.eigenCommandoDraait) dangers.push('middel')

  const hasConflict = processes.length > 0 || locks.length > 0 || !!opts.eigenCommandoDraait
  // Onduidelijke blokkade: wel lock/eigen cmd, geen killbare build-tool
  const onduidelijk = hasConflict
    && processes.filter(p => p.killable).length === 0
    && !processes.some(p => p.danger === 'hoog')

  return {
    processes,
    locks,
    editors,
    eigenCommandoDraait: !!opts.eigenCommandoDraait,
    hasConflict,
    onduidelijk,
    maxDanger: maxDangerOf(dangers),
    killablePids: processes.filter(p => p.killable).map(p => p.pid),
  }
}

function killPids(pids) {
  const list = [...new Set((pids || []).map(Number).filter(n => n > 0))]
  if (!list.length) return Promise.resolve({ ok: true, gestopt: [], mislukt: [] })
  return new Promise((resolve) => {
    const gestopt = []
    const mislukt = []
    let i = 0
    const next = () => {
      if (i >= list.length) {
        resolve({ ok: mislukt.length === 0, gestopt, mislukt })
        return
      }
      const pid = list[i++]
      const killer = spawn('taskkill', ['/F', '/PID', String(pid), '/T'], {
        shell: true, windowsHide: true,
      })
      killer.on('close', (code) => {
        if (code === 0) gestopt.push(pid)
        else mislukt.push(pid)
        next()
      })
      killer.on('error', () => { mislukt.push(pid); next() })
    }
    next()
  })
}

function openTaskManager() {
  if (process.platform !== 'win32') return false
  try {
    spawn('taskmgr.exe', [], { detached: true, stdio: 'ignore', windowsHide: false }).unref()
    return true
  } catch {
    try {
      spawn('cmd.exe', ['/c', 'start', '', 'taskmgr'], { detached: true, stdio: 'ignore', windowsHide: true }).unref()
      return true
    } catch {
      return false
    }
  }
}

module.exports = {
  CONFLICT_CMD_KEYS,
  PROCESS_NAMES,
  EDITOR_NAMES,
  WATCHED_NAMES,
  isConflictCheckEligible,
  isAndroidRelated,
  isWindowsRelated,
  normalizePad,
  padInTekst,
  isAndroidStudio,
  isVisualStudioIde,
  isJetBrainsIde,
  isIde,
  isEditor,
  editorLabel,
  collectEditorHints,
  isMsBuildToolchain,
  classifyDanger,
  canAutoKill,
  maxDangerOf,
  labelFor,
  parseProcessJson,
  relevantProcess,
  findProjectLocks,
  scanConflicts,
  listWindowsBuildProcesses,
  killPids,
  openTaskManager,
}
