// Archieven inkijken.
//
// Twee wegen:
//
//  1. Zip (en jar, apk, docx — allemaal zip onder de motorkap) lezen we zelf.
//     Een zipbestand heeft achterin een inhoudsopgave, dus je kunt zien wat er
//     in zit zonder ook maar iets uit te pakken. Uitpakken van één bestand kan
//     daarna met zlib, dat in Node ingebouwd zit. Geen extern programma nodig.
//
//  2. Rar, 7z en de rest kan dat niet. Rar is een gesloten formaat van WinRAR;
//     er bestaat geen bibliotheek die het vrij mag uitpakken. Daarvoor leunen we
//     op 7-Zip of WinRAR als die op de pc staan.

const fs = require('fs')
const path = require('path')
const zlib = require('zlib')
const { spawn } = require('child_process')

// Zelf te lezen, want het zijn allemaal zipbestanden
const ZIP_EXT = /\.(zip|jar|apk|aar|war|docx|xlsx|pptx|epub|whl|nupkg|vsix)$/i
// Alleen met een hulpprogramma
const TOOL_EXT = /\.(rar|7z|tar|gz|tgz|bz2|xz|iso|cab|arj|lzh|z)$/i

function isArchief(p)     { return ZIP_EXT.test(p) || TOOL_EXT.test(p) }
function isZipArchief(p)  { return ZIP_EXT.test(p) }

// ── Zip ───────────────────────────────────────────────────────────────────────

// De inhoudsopgave staat achteraan, achter een eindmarkering die zelf ook nog
// een commentaar van maximaal 64 kB achter zich kan hebben. Daarom zoeken we
// van achter naar voren.
function zoekEocd(buf) {
  const SIG = 0x06054b50
  const min = Math.max(0, buf.length - 22 - 0xffff)
  for (let i = buf.length - 22; i >= min; i--) {
    if (buf.readUInt32LE(i) === SIG) return i
  }
  return -1
}

// Zip64 wordt gebruikt zodra een archief of bestand boven de 4 GB komt, of
// boven 65535 items. Dan staan de echte getallen in een apart blok.
function leesZip64(buf, eocd) {
  const locatorPos = eocd - 20
  if (locatorPos < 0 || buf.readUInt32LE(locatorPos) !== 0x07064b50) return null
  const eocd64 = Number(buf.readBigUInt64LE(locatorPos + 8))
  if (eocd64 < 0 || eocd64 + 56 > buf.length) return null
  if (buf.readUInt32LE(eocd64) !== 0x06064b50) return null
  return {
    aantal: Number(buf.readBigUInt64LE(eocd64 + 32)),
    start:  Number(buf.readBigUInt64LE(eocd64 + 48)),
  }
}

// Datum en tijd staan in het oude MS-DOS-formaat, samengeperst in twee getallen
function dosTijd(tijd, datum) {
  try {
    const jaar = ((datum >> 9) & 0x7f) + 1980
    const maand = ((datum >> 5) & 0x0f) - 1
    const dag = datum & 0x1f
    const uur = (tijd >> 11) & 0x1f
    const min = (tijd >> 5) & 0x3f
    const sec = (tijd & 0x1f) * 2
    return new Date(jaar, maand, dag, uur, min, sec).getTime()
  } catch { return 0 }
}

function leesZip(bestand) {
  const buf = fs.readFileSync(bestand)
  const eocd = zoekEocd(buf)
  if (eocd < 0) throw new Error('dit lijkt geen geldig zipbestand')

  let aantal = buf.readUInt16LE(eocd + 10)
  let start  = buf.readUInt32LE(eocd + 16)

  if (aantal === 0xffff || start === 0xffffffff) {
    const z64 = leesZip64(buf, eocd)
    if (z64) { aantal = z64.aantal; start = z64.start }
  }

  const items = []
  let p = start
  for (let i = 0; i < aantal && p + 46 <= buf.length; i++) {
    if (buf.readUInt32LE(p) !== 0x02014b50) break

    const methode    = buf.readUInt16LE(p + 10)
    const tijd       = buf.readUInt16LE(p + 12)
    const datum      = buf.readUInt16LE(p + 14)
    const naamLen    = buf.readUInt16LE(p + 28)
    const extraLen   = buf.readUInt16LE(p + 30)
    const commLen    = buf.readUInt16LE(p + 32)
    let   gepakt     = buf.readUInt32LE(p + 20)
    let   uitgepakt  = buf.readUInt32LE(p + 24)
    let   lokaal     = buf.readUInt32LE(p + 42)
    const naam       = buf.toString('utf8', p + 46, p + 46 + naamLen)

    // Waarden van 0xFFFFFFFF betekenen: kijk in het zip64-blokje hiernaast
    if (uitgepakt === 0xffffffff || gepakt === 0xffffffff || lokaal === 0xffffffff) {
      let e = p + 46 + naamLen
      const eind = e + extraLen
      while (e + 4 <= eind) {
        const id = buf.readUInt16LE(e)
        const len = buf.readUInt16LE(e + 2)
        if (id === 0x0001) {
          let q = e + 4
          if (uitgepakt === 0xffffffff && q + 8 <= eind) { uitgepakt = Number(buf.readBigUInt64LE(q)); q += 8 }
          if (gepakt    === 0xffffffff && q + 8 <= eind) { gepakt    = Number(buf.readBigUInt64LE(q)); q += 8 }
          if (lokaal    === 0xffffffff && q + 8 <= eind) { lokaal    = Number(buf.readBigUInt64LE(q)); q += 8 }
          break
        }
        e += 4 + len
      }
    }

    items.push({
      name: naam.replace(/\\/g, '/'),
      dir: naam.endsWith('/'),
      size: uitgepakt,
      packed: gepakt,
      mtime: dosTijd(tijd, datum),
      methode,
      lokaal,
    })

    p += 46 + naamLen + extraLen + commLen
  }
  return items
}

// Eén bestand uit een zip halen, zonder de rest aan te raken
function pakZipUit(bestand, naamInArchief) {
  const items = leesZip(bestand)
  const item = items.find(i => i.name === naamInArchief.replace(/\\/g, '/'))
  if (!item) throw new Error('dit bestand zit niet in het archief')
  if (item.dir) throw new Error('dit is een map, geen bestand')

  const buf = fs.readFileSync(bestand)
  if (buf.readUInt32LE(item.lokaal) !== 0x04034b50) throw new Error('het archief is beschadigd')

  const naamLen  = buf.readUInt16LE(item.lokaal + 26)
  const extraLen = buf.readUInt16LE(item.lokaal + 28)
  const begin    = item.lokaal + 30 + naamLen + extraLen
  const rauw     = buf.subarray(begin, begin + item.packed)

  if (item.methode === 0) return rauw                    // niet gecomprimeerd
  if (item.methode === 8) return zlib.inflateRawSync(rauw)
  throw new Error(`compressiemethode ${item.methode} wordt niet ondersteund`)
}

// ── Zip schrijven ─────────────────────────────────────────────────────────────

let crcTabel = null
function crc32(buf) {
  if (!crcTabel) {
    crcTabel = new Int32Array(256)
    for (let n = 0; n < 256; n++) {
      let c = n
      for (let k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1)
      crcTabel[n] = c
    }
  }
  let c = -1
  for (let i = 0; i < buf.length; i++) c = crcTabel[(c ^ buf[i]) & 0xff] ^ (c >>> 8)
  return (c ^ -1) >>> 0
}

// Datum en tijd terug naar het MS-DOS-formaat dat zip gebruikt
function naarDosTijd(ms) {
  const d = new Date(ms || Date.now())
  const jaar = Math.max(1980, d.getFullYear())
  return {
    tijd: (d.getHours() << 11) | (d.getMinutes() << 5) | (Math.floor(d.getSeconds() / 2)),
    datum: ((jaar - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate(),
  }
}

// Alles onder een map, met de paden zoals ze in het archief moeten komen
function verzamel(bron, voorvoegsel, uit) {
  const st = fs.statSync(bron)
  if (!st.isDirectory()) { uit.push({ bron, naam: voorvoegsel, map: false }); return }

  const kinderen = fs.readdirSync(bron)
  if (!kinderen.length) { uit.push({ bron, naam: voorvoegsel + '/', map: true }); return }
  for (const k of kinderen) verzamel(path.join(bron, k), voorvoegsel + '/' + k, uit)
}

/**
 * Pakt bestanden en mappen in tot één zipbestand.
 * @param {string} doel   pad van het zipbestand dat gemaakt wordt
 * @param {string[]} paden  wat erin moet; mappen gaan met inhoud mee
 */
function schrijfZip(doel, paden) {
  const items = []
  for (const p of paden) {
    if (!fs.existsSync(p)) continue
    verzamel(p, path.basename(p), items)
  }
  if (!items.length) throw new Error('er is niets om in te pakken')

  const lokaal = [], centraal = []
  let offset = 0

  for (const item of items) {
    const naam = Buffer.from(item.naam.replace(/\\/g, '/'), 'utf8')
    const rauw = item.map ? Buffer.alloc(0) : fs.readFileSync(item.bron)
    // Kleine bestanden worden door comprimeren soms groter; dan maar opslaan
    const gedeflate = item.map ? Buffer.alloc(0) : zlib.deflateRawSync(rauw)
    const comprimeren = gedeflate.length < rauw.length
    const data = comprimeren ? gedeflate : rauw
    const methode = comprimeren ? 8 : 0
    const som = crc32(rauw)
    const { tijd, datum } = naarDosTijd(fs.statSync(item.bron).mtimeMs)

    const lh = Buffer.alloc(30)
    lh.writeUInt32LE(0x04034b50, 0)
    lh.writeUInt16LE(20, 4)                    // benodigde versie
    lh.writeUInt16LE(0x0800, 6)                // namen staan in UTF-8
    lh.writeUInt16LE(methode, 8)
    lh.writeUInt16LE(tijd, 10); lh.writeUInt16LE(datum, 12)
    lh.writeUInt32LE(som, 14)
    lh.writeUInt32LE(data.length, 18)
    lh.writeUInt32LE(rauw.length, 22)
    lh.writeUInt16LE(naam.length, 26)
    lokaal.push(lh, naam, data)

    const ch = Buffer.alloc(46)
    ch.writeUInt32LE(0x02014b50, 0)
    ch.writeUInt16LE(20, 4); ch.writeUInt16LE(20, 6)
    ch.writeUInt16LE(0x0800, 8)
    ch.writeUInt16LE(methode, 10)
    ch.writeUInt16LE(tijd, 12); ch.writeUInt16LE(datum, 14)
    ch.writeUInt32LE(som, 16)
    ch.writeUInt32LE(data.length, 20)
    ch.writeUInt32LE(rauw.length, 24)
    ch.writeUInt16LE(naam.length, 28)
    ch.writeUInt32LE(item.map ? 0x10 : 0, 38)  // mapkenmerk
    ch.writeUInt32LE(offset, 42)
    centraal.push(ch, naam)

    offset += 30 + naam.length + data.length
  }

  const cd = Buffer.concat(centraal)
  const eocd = Buffer.alloc(22)
  eocd.writeUInt32LE(0x06054b50, 0)
  eocd.writeUInt16LE(items.length, 8)
  eocd.writeUInt16LE(items.length, 10)
  eocd.writeUInt32LE(cd.length, 12)
  eocd.writeUInt32LE(offset, 16)

  fs.writeFileSync(doel, Buffer.concat([...lokaal, cd, eocd]))
  return { aantal: items.length, grootte: fs.statSync(doel).size }
}

// ── Hulpprogramma's voor de rest ──────────────────────────────────────────────

const TOOL_PADEN = [
  'C:\\Program Files\\7-Zip\\7z.exe',
  'C:\\Program Files (x86)\\7-Zip\\7z.exe',
  'C:\\Program Files\\WinRAR\\WinRAR.exe',
  'C:\\Program Files (x86)\\WinRAR\\WinRAR.exe',
]

// Zoekt 7-Zip of WinRAR. Eerst de gebruikelijke plekken, daarna in PATH.
function zoekHulpprogramma(zoekInPad = true) {
  for (const p of TOOL_PADEN) {
    try { if (fs.existsSync(p)) return { pad: p, soort: /7z/i.test(p) ? '7z' : 'winrar' } } catch {}
  }
  if (!zoekInPad) return null
  for (const naam of ['7z.exe', '7za.exe', 'UnRAR.exe']) {
    const dirs = (process.env.PATH || '').split(path.delimiter)
    for (const d of dirs) {
      try {
        const p = path.join(d, naam)
        if (fs.existsSync(p)) return { pad: p, soort: /unrar/i.test(naam) ? 'unrar' : '7z' }
      } catch {}
    }
  }
  return null
}

function draai(exe, args) {
  return new Promise((resolve) => {
    let uit = ''
    const p = spawn(exe, args, { windowsHide: true })
    p.stdout.on('data', d => { uit += d.toString('utf8') })
    p.stderr.on('data', () => {})
    p.on('close', code => resolve({ code, uit }))
    p.on('error', () => resolve({ code: -1, uit: '' }))
  })
}

// 7-Zip met -slt geeft een blok per bestand met "naam = waarde"-regels; dat is
// een stuk betrouwbaarder te lezen dan de tabel die hij standaard toont.
function parse7zSlt(tekst) {
  const items = []
  let huidig = null
  for (const regel of tekst.split(/\r?\n/)) {
    const m = regel.match(/^([A-Za-z ]+) = (.*)$/)
    if (!m) continue
    const [, sleutel, waarde] = m
    if (sleutel === 'Path') { huidig = { name: waarde.replace(/\\/g, '/'), dir: false, size: 0, mtime: 0 }; items.push(huidig); continue }
    if (!huidig) continue
    if (sleutel === 'Size')       huidig.size = parseInt(waarde) || 0
    if (sleutel === 'Attributes') huidig.dir = /D/.test(waarde)
    if (sleutel === 'Modified')   huidig.mtime = Date.parse(waarde.replace(' ', 'T')) || 0
  }
  // De eerste blokken beschrijven het archief zelf, niet de inhoud
  return items.filter(i => i.name && !/^\d+$/.test(i.name))
}

async function leesViaHulpprogramma(bestand, tool) {
  if (tool.soort === 'unrar') {
    const r = await draai(tool.pad, ['lb', '-v', bestand])
    if (r.code !== 0 && !r.uit) throw new Error('uitlezen mislukt')
    return r.uit.split(/\r?\n/).filter(Boolean)
      .map(n => ({ name: n.replace(/\\/g, '/'), dir: false, size: 0, mtime: 0 }))
  }
  // 7-Zip kan ook rar lezen
  const r = await draai(tool.pad, ['l', '-slt', bestand])
  if (r.code !== 0 && !r.uit) throw new Error('uitlezen mislukt')
  return parse7zSlt(r.uit)
}

async function pakUitViaHulpprogramma(bestand, naamInArchief, doelMap, tool) {
  // -o zonder spatie is de vorm die 7-Zip verwacht; e pakt zonder mapstructuur uit
  const args = tool.soort === 'unrar'
    ? ['e', '-y', bestand, naamInArchief, doelMap]
    : ['e', '-y', `-o${doelMap}`, bestand, naamInArchief]
  const r = await draai(tool.pad, args)
  const uit = path.join(doelMap, path.basename(naamInArchief))
  if (!fs.existsSync(uit)) throw new Error(r.code === -1 ? 'het hulpprogramma kon niet gestart worden' : 'uitpakken mislukt')
  return uit
}

module.exports = {
  isArchief, isZipArchief, leesZip, pakZipUit, schrijfZip, crc32,
  zoekHulpprogramma, leesViaHulpprogramma, pakUitViaHulpprogramma,
  parse7zSlt, ZIP_EXT, TOOL_EXT,
}
