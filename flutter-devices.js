/**
 * Parseert `flutter devices` / `flutter devices --machine` en houdt alleen
 * Android-telefoons en -emulators over.
 *
 * `--machine` levert JSON zónder `category`. De mens-leesbare tabel toont
 * wel "(mobile)", maar dat veld zit niet in de JSON — filteren op
 * category === 'mobile' vindt daardoor nooit een telefoon.
 */

function isAndroidDevice(d) {
  if (!d || typeof d !== 'object') return false
  const platform = String(d.targetPlatform || d.platform || '').toLowerCase()
  if (platform.startsWith('android')) return true
  const sdk = String(d.sdk || '').toLowerCase()
  if (sdk.includes('android') && !/^(ios|web-|windows|darwin|macos|linux)/.test(platform)) {
    return true
  }
  return false
}

function toDevice(d) {
  return {
    id: d.id,
    name: d.name,
    platform: d.targetPlatform || d.platform || '',
  }
}

function parseJsonDevices(text) {
  const s = String(text || '')
  let start = s.lastIndexOf('\n[')
  if (start >= 0) start += 1
  else start = s.indexOf('[')
  if (start < 0) return null
  const from = s.slice(start)
  const end = from.lastIndexOf(']')
  if (end < 0) return null
  try {
    const alle = JSON.parse(from.slice(0, end + 1))
    return Array.isArray(alle) ? alle : null
  } catch {
    return null
  }
}

// CPH2699 (mobile) • 437d872e • android-arm64 • Android 16 (API 36)
const TABLE_RE = /^(.+?) \(([^)]+)\) • (\S+) • (\S+) • (.+)$/

function parseTableDevices(text) {
  const out = []
  for (const raw of String(text || '').split(/\r?\n/)) {
    const m = raw.trim().match(TABLE_RE)
    if (!m) continue
    out.push({
      name: m[1],
      category: m[2],
      id: m[3],
      targetPlatform: m[4],
      sdk: m[5],
    })
  }
  return out
}

function parseFlutterAndroidDevices(text) {
  const alle = parseJsonDevices(text) || parseTableDevices(text)
  return alle.filter(isAndroidDevice).map(toDevice)
}

module.exports = {
  isAndroidDevice,
  parseJsonDevices,
  parseTableDevices,
  parseFlutterAndroidDevices,
}
