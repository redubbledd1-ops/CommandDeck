// Bouwt het powershell-commando uit de sectie-instellingen: welk programma,
// of het profiel meegaat, en welke execution policy. Alleen voor wat de
// powershell-sectie zelf start — interne scripts van de app blijven
// hard op powershell.exe -NoProfile staan.
const os = require('os')

const POLICIES = new Set(['Bypass', 'RemoteSigned', 'Unrestricted', 'Restricted', 'AllSigned'])

// -Command knipt quotes en dollars kapot. -EncodedCommand is UTF-16LE/base64
// en houdt newlines, `$env:…` en accolades heel.
function psEncodeCommand(script) {
  return Buffer.from(String(script ?? ''), 'utf16le').toString('base64')
}

// Of deze tekst nog een vervolgregel nodig heeft: open { ( [ ", een here-string,
// of een regel die eindigt op | + , ` of =. Gelijk houden met renderer.js.
function psScriptIncomplete(script) {
  const text = String(script || '')
  if (!text.trim()) return false
  const lines = text.split(/\r?\n/)
  let quote = null
  let here = null
  let paren = 0
  let brace = 0
  let bracket = 0

  for (let li = 0; li < lines.length; li++) {
    const line = lines[li]
    if (here) {
      if ((here === "'" && line.startsWith("'@")) || (here === '"' && line.startsWith('"@'))) here = null
      continue
    }
    for (let i = 0; i < line.length; i++) {
      const c = line[i]
      const next = line[i + 1]
      if (quote === "'") {
        if (c === "'" && next === "'") { i++; continue }
        if (c === "'") quote = null
        continue
      }
      if (quote === '"') {
        if (c === '`') { i++; continue }
        if (c === '"') quote = null
        continue
      }
      if (c === '`') {
        if (i === line.length - 1 && li === lines.length - 1) return true
        i++
        continue
      }
      if (c === '#') break
      if (c === '@' && (next === "'" || next === '"')) { here = next; break }
      if (c === "'" || c === '"') { quote = c; continue }
      if (c === '{') brace++
      else if (c === '}') brace = Math.max(0, brace - 1)
      else if (c === '(') paren++
      else if (c === ')') paren = Math.max(0, paren - 1)
      else if (c === '[') bracket++
      else if (c === ']') bracket = Math.max(0, bracket - 1)
    }
  }
  if (here || quote) return true
  if (brace > 0 || paren > 0 || bracket > 0) return true

  const last = [...lines].reverse().find(l => {
    const t = l.trim()
    return t && !t.startsWith('#')
  }) || ''
  const t = last.trimEnd()
  if (/[`|,+]$/.test(t)) return true
  if (/=\s*$/.test(t)) return true
  return false
}

function psLaunchConfig(ps = {}) {
  const exe = ps.exe === 'pwsh' ? 'pwsh.exe' : 'powershell.exe'
  const args = []
  if (ps.noProfile !== false) args.push('-NoProfile')
  if (POLICIES.has(ps.executionPolicy)) args.push('-ExecutionPolicy', ps.executionPolicy)
  return { exe, args }
}

// Extra na de bestandsnaam: argumenten voor het script. Geen pipeline,
// geen `;`, geen omleiding — dat is dan een powershell-commando, geen -File.
function isSimplePs1Extra(extra) {
  if (!extra) return true
  return !/[|;{}<>]|(?:^|\s)(?:&&|\|\|)/.test(extra)
}

function splitPsArgs(s) {
  const out = []
  const re = /"([^"]*)"|'([^']*)'|(\S+)/g
  let m
  while ((m = re.exec(String(s || '')))) {
    out.push(m[1] != null ? m[1] : m[2] != null ? m[2] : m[3])
  }
  return out
}

function resolvePs1Path(file) {
  if (file === '~' || file.startsWith('~/') || file.startsWith('~\\')) {
    return os.homedir() + file.slice(1)
  }
  return file
}

// Typ je `.\script.ps1` (eventueel met `&` of aanhalingstekens), dan is dat
// een scriptstart — geen willekeurig commando dat toevallig .ps1 in de tekst heeft.
function parsePs1Invocation(cmd) {
  let s = String(cmd || '').trim()
  if (!s) return null
  if (s[0] === '&') {
    const rest = s.slice(1).trim()
    if (!rest || rest[0] === '{') return null
    s = rest
  }
  let file = null
  let extra = ''
  if (s[0] === '"') {
    const end = s.indexOf('"', 1)
    if (end < 0) return null
    file = s.slice(1, end)
    extra = s.slice(end + 1).trim()
  } else if (s[0] === "'") {
    const end = s.indexOf("'", 1)
    if (end < 0) return null
    file = s.slice(1, end)
    extra = s.slice(end + 1).trim()
  } else {
    const m = s.match(/^(\S+)([\s\S]*)$/)
    if (!m) return null
    file = m[1]
    extra = (m[2] || '').trim()
  }
  if (!/\.ps1$/i.test(file)) return null
  if (!isSimplePs1Extra(extra)) return null
  return { file: resolvePs1Path(file), extra }
}

// .ps1 altijd met Bypass -File, anders blokkeert Restricted/RemoteSigned het
// script. Programma en -NoProfile blijven uit de sectie-instellingen.
function psFileLaunch(ps, file, extra) {
  const { exe, args } = psLaunchConfig({ ...(ps || {}), executionPolicy: 'Bypass' })
  const extraArgs = Array.isArray(extra) ? extra.filter(a => a != null && a !== '') : splitPsArgs(extra)
  return { exe, args: [...args, '-File', file, ...extraArgs] }
}

function withNoExit(start) {
  const i = start.args.indexOf('-File')
  const at = i >= 0 ? i : start.args.length
  return { exe: start.exe, args: [...start.args.slice(0, at), '-NoExit', ...start.args.slice(at)] }
}

function psCommandLaunch(ps, cmd) {
  const parsed = parsePs1Invocation(cmd)
  if (parsed) return psFileLaunch(ps, parsed.file, parsed.extra)
  const { exe, args } = psLaunchConfig(ps)
  return { exe, args: [...args, '-EncodedCommand', psEncodeCommand(cmd)] }
}

function psWindowLaunch(ps, cmd) {
  const parsed = parsePs1Invocation(cmd)
  if (parsed) return withNoExit(psFileLaunch(ps, parsed.file, parsed.extra))
  const { exe, args } = psLaunchConfig(ps)
  const extra = [...args, '-NoExit']
  if (cmd) extra.push('-EncodedCommand', psEncodeCommand(cmd))
  return { exe, args: extra }
}

module.exports = {
  psLaunchConfig, psCommandLaunch, psWindowLaunch,
  psFileLaunch, parsePs1Invocation,
  psEncodeCommand, psScriptIncomplete,
}
