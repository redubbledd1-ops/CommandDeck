// Het eigen icoon van een project opzoeken.
//
// Een project in de zijbalk had tot nu toe een emoji. Prima als vlaggetje,
// maar je apps hébben een icoon — het staat in de projectmap, klaar om
// meegebouwd te worden. Dat icoon hier tonen scheelt kiezen én je herkent een
// project meteen aan hetzelfde plaatje dat op je telefoon staat.
//
// De vangst zit in het woord "eigen". Een verse `flutter create` zet overal
// het blauwe Flutter-logo neer. Zou dat doorkomen, dan kregen tien projecten
// tien keer hetzelfde plaatje en was de zijbalk juist onleesbaar geworden.
// Daarom is een gevonden bestand pas een projecticoon als het níet het
// sjabloonicoon is. Wat overblijft valt terug op de emoji, precies zoals
// vroeger.
//
// Herkennen doen we op de inhoud (md5), niet op de datum of de grootte: wie
// een icoon vervangt door een eigen exemplaar van toevallig dezelfde afmeting
// hoort gewoon zijn eigen icoon te zien.
//
// Niet elk project is Flutter. Een native Android-app (zoals DayKit) zet het
// icoon vaak onder app/src/main/res/ en noemt het in AndroidManifest.xml —
// soms als vector-drawable (.xml) in plaats van png. Die route lezen we ook:
// het manifest zegt welk resource het is, en een vector zetten we om naar
// SVG zodat de zijbalk hem als gewone img kan tonen.

const fs = require('fs')
const path = require('path')
const crypto = require('crypto')

// Dichtheden, grootste eerst — voor native én Flutter-Android.
const ANDROID_DICHT = ['xxxhdpi', 'xxhdpi', 'xhdpi', 'hdpi', 'mdpi']

function androidMipmapKandidaten(prefix) {
  const uit = []
  for (const d of ANDROID_DICHT) {
    uit.push({ rel: `${prefix}/mipmap-${d}/ic_launcher.png`, soort: 'android' })
  }
  for (const d of ANDROID_DICHT) {
    uit.push({ rel: `${prefix}/mipmap-${d}/ic_launcher_foreground.png`, soort: 'android' })
  }
  uit.push({ rel: `${prefix}/drawable-xxxhdpi/ic_launcher_foreground.png`, soort: 'android' })
  uit.push({ rel: `${prefix}/drawable/ic_launcher_foreground.png`, soort: 'android' })
  // Eigen artwork naast de launcher (TimeGuess e.d.).
  uit.push({ rel: `${prefix}/icon.png`, soort: 'android' })
  return uit
}

// Bestanden waar het icoon van een project in kan zitten, beste eerst.
//
// De volgorde is niet willekeurig. Wat er als eerste staat is wat de
// gebruiker als "het icoon van deze app" herkent: het launcher-icoon dat op
// het toestel verschijnt. Grootste variant eerst, want dit plaatje wordt in de
// projectkop op 22px getoond en op een groot scherm nog groter — een 48px
// mdpi-icoon uitrekken ziet er vies uit.
const KANDIDATEN = [
  // Eigen artwork-map eerst als die er is: vaak scherper dan de mipmaps
  // (512 vs 192) en handig zolang de launcher nog niet is bijgewerkt.
  { rel: 'icoon/resume-icon-512.png', soort: 'app' },
  { rel: 'icoon/resume-icon-256.png', soort: 'app' },
  { rel: 'icoon/icon-512.png',        soort: 'app' },
  { rel: 'icoon/icon-256.png',        soort: 'app' },
  { rel: 'icoon/icon.png',            soort: 'app' },

  // Flutter: android/app/...
  ...androidMipmapKandidaten('android/app/src/main/res'),
  // Native Android / Kotlin-Gradle: app/src/main/res (zonder android/-prefix)
  ...androidMipmapKandidaten('app/src/main/res'),
  { rel: 'app/src/main/icon.png', soort: 'android' },

  { rel: 'ios/Runner/Assets.xcassets/AppIcon.appiconset/Icon-App-1024x1024@1x.png', soort: 'ios' },
  { rel: 'ios/Runner/Assets.xcassets/AppIcon.appiconset/Icon-App-83.5x83.5@2x.png', soort: 'ios' },
  { rel: 'macos/Runner/Assets.xcassets/AppIcon.appiconset/app_icon_512.png', soort: 'macos' },

  { rel: 'web/icons/Icon-512.png',          soort: 'web' },
  { rel: 'web/icons/Icon-maskable-512.png', soort: 'web' },
  { rel: 'web/icons/Icon-192.png',          soort: 'web' },
  { rel: 'web/favicon.png',                 soort: 'web' },

  { rel: 'windows/runner/resources/app_icon.ico', soort: 'windows' },

  // Electron-projecten en gewone websites. CommandDeck zelf valt hieronder.
  { rel: 'assets/icon.png',    soort: 'app' },
  { rel: 'assets/icon.ico',    soort: 'app' },
  { rel: 'build/icon.png',     soort: 'app' },
  { rel: 'build/icon.ico',     soort: 'app' },
  { rel: 'public/favicon.ico', soort: 'web' },
  { rel: 'public/favicon.png', soort: 'web' },
  { rel: 'static/favicon.ico', soort: 'web' },
  { rel: 'favicon.ico',        soort: 'web' },
  { rel: 'favicon.png',        soort: 'web' },
]

// De sjabloon-iconen van Flutter, op inhoud. Deze lijst is uit de mappen van
// echte projecten getrokken en dekt de Flutter-versies waar deze projecten mee
// zijn aangemaakt. Nieuwere sjablonen worden hier niet door gedekt — daar is
// sjabloonHashesVanSdk() voor, die leest ze uit de SDK die op deze pc staat.
const STANDAARD_HASHES = new Set([
  // android mipmap-*/ic_launcher.png
  '6270344430679711b81476e29878caa7', // mdpi
  '13e9c72ec37fac220397aa819fa1ef2d', // hdpi
  'a0a8db5985280b3679d99a820ae2db79', // xhdpi
  'afe1b655b9f32da22f9a4301bb8e6ba8', // xxhdpi
  '57838d52c318faff743130c3fcfae0c6', // xxxhdpi
  // web
  'ac9a721a12bbc803b44f645561ecb1e1', // Icon-192.png
  '96e752610906ba2a93c65f8abe1645f1', // Icon-512.png
  'c457ef57daa1d16f64b27b786ec2ea3c', // Icon-maskable-192.png
  '301a7604d45b3e739efc881eb04896ea', // Icon-maskable-512.png
  '5dcef449791fa27946b3d35ad8803796', // favicon.png
  // windows
  '6ea04d80ca2a3fa92c7717c3c44ccc19', // runner/resources/app_icon.ico
])

const MIMES = {
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
}

// Een icoon van meer dan dit gaat niet als data-URL het venster in. Een
// launcher-icoon is een paar kilobyte; wat hier overheen gaat is geen icoon
// maar iemands artwork-bestand.
const MAX_BYTES = 1_500_000

// Manifests die we naast de vaste kandidaten raadplegen. Native Android eerst:
// daar zit juist het icoon dat de vaste Flutter-paden missen.
const MANIFEST_PADEN = [
  'app/src/main/AndroidManifest.xml',
  'android/app/src/main/AndroidManifest.xml',
]

// ── Sjabloonhashes uit de geïnstalleerde Flutter-SDK ─────────────────────────
// De lijst hierboven veroudert: elke Flutter-versie mag zijn sjabloonplaatjes
// vervangen. Staat de SDK op deze pc, dan is dat de betrouwbaarste bron voor
// "dit is het standaardicoon" — we lezen de sjabloonbestanden en hashen ze.
// Eén keer per sessie; daarna is het een lookup.
let sdkHashes = null
let sdkHashesVoorWortel = null

function sjabloonHashesVanSdk(flutterWortel, deps = {}) {
  const bestand = deps.fs || fs
  if (!flutterWortel) return new Set()
  if (sdkHashes && sdkHashesVoorWortel === flutterWortel) return sdkHashes

  const gevonden = new Set()
  const sjablonen = path.join(flutterWortel, 'packages', 'flutter_tools', 'templates')
  // Niet de hele sjabloonmap doorlopen: daar staan duizenden bestanden in en
  // dit draait op de eerste tekening van de zijbalk. De iconen zitten in de
  // app-sjablonen, dus daar kijken we, en alleen als die er zijn.
  const takken = ['app_shared', 'app', 'app_integration_test']
    .map(t => path.join(sjablonen, t))
    .filter(p => { try { return bestand.existsSync(p) } catch { return false } })

  const interessant = /(ic_launcher|app_icon|icon-|favicon|appicon)/i
  const loop = (map, diepte) => {
    if (diepte > 10) return
    let items = []
    try { items = bestand.readdirSync(map, { withFileTypes: true }) } catch { return }
    for (const item of items) {
      const vol = path.join(map, item.name)
      if (item.isDirectory()) { loop(vol, diepte + 1); continue }
      if (!interessant.test(item.name)) continue
      try {
        const st = bestand.statSync(vol)
        if (st.size > MAX_BYTES) continue
        gevonden.add(md5(bestand.readFileSync(vol)))
      } catch { /* onleesbaar sjabloonbestand: overslaan */ }
    }
  }
  for (const tak of takken) loop(tak, 0)

  sdkHashes = gevonden
  sdkHashesVoorWortel = flutterWortel
  return gevonden
}

function vergeetSdkHashes() { sdkHashes = null; sdkHashesVoorWortel = null }

function md5(buf) { return crypto.createHash('md5').update(buf).digest('hex') }

function isStandaardIcoon(hash, flutterWortel, deps) {
  if (STANDAARD_HASHES.has(hash)) return true
  return sjabloonHashesVanSdk(flutterWortel, deps).has(hash)
}

// ── Onthouden wat we al gelezen hebben ───────────────────────────────────────
// De zijbalk tekent zichzelf bij elke klik opnieuw. Dat mag geen tien
// bestanden per keer inlezen en base64'en. Statten doen we wél elke keer —
// dat is goedkoop — zodat een vervangen icoon meteen doorkomt.
// Sleutel is het bestandspad, niet de projectmap: één project levert
// meerdere kandidaten en die willen we los van elkaar onthouden.
const cache = new Map()   // bestandspad -> { mtimeMs, size, uitkomst }

function leegCache(pad) {
  if (!pad) { cache.clear(); return }
  const wortel = path.resolve(pad)
  for (const sleutel of [...cache.keys()]) {
    if (sleutel === wortel || sleutel.startsWith(wortel + path.sep)) cache.delete(sleutel)
  }
}

// ── Bitmap → data-URL ────────────────────────────────────────────────────────

function bitmapUitkomst(vol, buf, st, soort) {
  const mime = MIMES[path.extname(vol).toLowerCase()] || 'image/png'
  return {
    ok: true,
    soort,
    bron: vol,
    hash: md5(buf),
    bytes: st.size,
    dataUrl: `data:${mime};base64,${buf.toString('base64')}`,
  }
}

function leesBitmapKandidaat(vol, soort, flutterWortel, deps) {
  const bestand = deps.fs || fs
  let st
  try { st = bestand.statSync(vol) } catch { return null }
  if (!st.isFile() || !st.size || st.size > MAX_BYTES) return null

  const eerder = cache.get(vol)
  if (eerder && eerder.mtimeMs === st.mtimeMs && eerder.size === st.size) {
    return eerder.uitkomst
  }

  let buf
  try { buf = bestand.readFileSync(vol) } catch { return null }
  const hash = md5(buf)

  if (isStandaardIcoon(hash, flutterWortel, deps)) {
    const uitkomst = { ok: false, reden: 'standaard' }
    cache.set(vol, { mtimeMs: st.mtimeMs, size: st.size, uitkomst })
    return uitkomst
  }

  const uitkomst = bitmapUitkomst(vol, buf, st, soort)
  cache.set(vol, { mtimeMs: st.mtimeMs, size: st.size, uitkomst })
  return uitkomst
}

// ── Android vector-drawable → SVG ────────────────────────────────────────────
// De browser kan geen Android-vector-XML, wel SVG. De subset die we hier
// omzetten (viewport + path + fill) dekt de launcher-iconen die we in de
// praktijk tegenkomen; fancy clip-paths en gradients laten we liggen.

function androidKleurNaarSvg(kleur) {
  if (!kleur || typeof kleur !== 'string') return null
  const k = kleur.trim()
  if (k.startsWith('@') || k.startsWith('?')) return null
  const m = k.match(/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/)
  if (!m) return null
  let hex = m[1]
  if (hex.length === 3) {
    hex = hex.split('').map(c => c + c).join('')
  }
  if (hex.length === 6) return { fill: '#' + hex.toLowerCase(), opacity: null }
  // #AARRGGBB
  const a = parseInt(hex.slice(0, 2), 16) / 255
  const rgb = hex.slice(2).toLowerCase()
  return { fill: '#' + rgb, opacity: a >= 0.999 ? null : (Math.round(a * 1000) / 1000) }
}

function attr(tag, naam) {
  const m = tag.match(new RegExp(`android:${naam}\\s*=\\s*"([^"]*)"`, 'i'))
  return m ? m[1] : null
}

function vectorXmlNaarSvg(xml) {
  if (!xml || !/<vector\b/i.test(xml)) return null
  const vectorTag = xml.match(/<vector\b[^>]*>/i)
  if (!vectorTag) return null
  const vw = parseFloat(attr(vectorTag[0], 'viewportWidth')) || parseFloat(attr(vectorTag[0], 'width')) || 24
  const vh = parseFloat(attr(vectorTag[0], 'viewportHeight')) || parseFloat(attr(vectorTag[0], 'height')) || 24

  const paden = []
  const pathRe = /<path\b[^>]*\/?>/gi
  let treffer
  while ((treffer = pathRe.exec(xml))) {
    const tag = treffer[0]
    const d = attr(tag, 'pathData')
    if (!d) continue
    const kleur = androidKleurNaarSvg(attr(tag, 'fillColor'))
    if (!kleur) continue
    let stuk = `<path d="${d.replace(/"/g, '&quot;')}" fill="${kleur.fill}"`
    if (kleur.opacity != null) stuk += ` fill-opacity="${kleur.opacity}"`
    stuk += '/>'
    paden.push(stuk)
  }
  if (!paden.length) return null

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${vw} ${vh}" width="${vw}" height="${vh}">${paden.join('')}</svg>`
}

function svgUitkomst(vol, svg, soort) {
  const buf = Buffer.from(svg, 'utf8')
  return {
    ok: true,
    soort,
    bron: vol,
    hash: md5(buf),
    bytes: buf.length,
    dataUrl: `data:image/svg+xml;base64,${buf.toString('base64')}`,
  }
}

// ── Android-resources via het manifest ───────────────────────────────────────
// DayKit: android:icon="@drawable/clockgood" → drawable/clockgood.xml (vector).
// TimeGuess: @mipmap/ic_launcher → adaptive-icon xml → foreground drawable.
// Zonder deze route blijven die projecten op de emoji hangen.

function applicationIcoonRefs(manifestXml) {
  const m = manifestXml.match(/<application\b([^>]*(?:\/>|>))/i)
  if (!m) return []
  const attrs = m[1]
  const refs = []
  for (const key of ['icon', 'roundIcon']) {
    const r = attrs.match(new RegExp(`android:${key}\\s*=\\s*"(@(?:mipmap|drawable)\\/[\\w]+)"`, 'i'))
    if (r && !refs.includes(r[1])) refs.push(r[1])
  }
  return refs
}

function resourceBestanden(moduleWortel, type, naam, bestand) {
  const resDir = path.join(moduleWortel, 'src', 'main', 'res')
  const uit = []
  let items = []
  try { items = bestand.readdirSync(resDir, { withFileTypes: true }) } catch { return uit }

  const prefix = type + '-'
  const mappen = items
    .filter(i => i.isDirectory() && (i.name === type || i.name.startsWith(prefix)))
    .map(i => i.name)

  // Dichtheid eerst (xxxhdpi …), daarna anydpi, daarna kale drawable/mipmap.
  const score = (mapNaam) => {
    for (let i = 0; i < ANDROID_DICHT.length; i++) {
      if (mapNaam.endsWith('-' + ANDROID_DICHT[i])) return i
    }
    if (/anydpi/i.test(mapNaam)) return 50
    if (mapNaam === type) return 60
    return 40
  }
  mappen.sort((a, b) => score(a) - score(b))

  const exts = ['.png', '.webp', '.jpg', '.jpeg', '.xml']
  for (const mapNaam of mappen) {
    for (const ext of exts) {
      const vol = path.join(resDir, mapNaam, naam + ext)
      try {
        if (bestand.statSync(vol).isFile()) uit.push(vol)
      } catch { /* bestaat niet */ }
    }
  }
  return uit
}

function parseResourceRef(ref) {
  const m = String(ref || '').match(/^@(mipmap|drawable)\/(\w+)$/i)
  if (!m) return null
  return { type: m[1].toLowerCase(), naam: m[2] }
}

function haalDrawableRefUitXml(xml, tagNaam) {
  // <foreground android:drawable="@drawable/x"/> of nested.
  const re = new RegExp(
    `<${tagNaam}\\b[^>]*android:drawable\\s*=\\s*"(@(?:mipmap|drawable)\\/\\w+)"[^>]*/?>` +
    `|<${tagNaam}\\b[^>]*>[\\s\\S]*?android:drawable\\s*=\\s*"(@(?:mipmap|drawable)\\/\\w+)"`,
    'i'
  )
  const m = xml.match(re)
  return m ? (m[1] || m[2]) : null
}

function leesXmlResource(vol, moduleWortel, flutterWortel, deps, bezocht) {
  const bestand = deps.fs || fs
  let st
  try { st = bestand.statSync(vol) } catch { return null }
  if (!st.isFile() || !st.size || st.size > MAX_BYTES) return null

  const eerder = cache.get(vol)
  if (eerder && eerder.mtimeMs === st.mtimeMs && eerder.size === st.size) {
    return eerder.uitkomst
  }

  let txt
  try { txt = bestand.readFileSync(vol, 'utf8') } catch { return null }

  let uitkomst = { ok: false, reden: 'geen' }

  if (/<vector\b/i.test(txt)) {
    const svg = vectorXmlNaarSvg(txt)
    if (svg) uitkomst = svgUitkomst(vol, svg, 'android')
  } else if (/<adaptive-icon\b/i.test(txt)) {
    const fg = haalDrawableRefUitXml(txt, 'foreground')
    if (fg) {
      const nested = resolveerAndroidRef(moduleWortel, fg, flutterWortel, deps, bezocht)
      if (nested && nested.ok) uitkomst = { ...nested, bron: nested.bron || vol }
    }
  } else if (/<inset\b/i.test(txt) || /<bitmap\b/i.test(txt)) {
    const inner = txt.match(/android:(?:drawable|src)\s*=\s*"(@(?:mipmap|drawable)\/\w+)"/i)
    if (inner) {
      const nested = resolveerAndroidRef(moduleWortel, inner[1], flutterWortel, deps, bezocht)
      if (nested && nested.ok) uitkomst = { ...nested, bron: nested.bron || vol }
    }
  }

  cache.set(vol, { mtimeMs: st.mtimeMs, size: st.size, uitkomst })
  return uitkomst
}

function resolveerAndroidRef(moduleWortel, ref, flutterWortel, deps, bezocht = new Set()) {
  const parsed = parseResourceRef(ref)
  if (!parsed) return null
  const sleutel = parsed.type + '/' + parsed.naam
  if (bezocht.has(sleutel)) return null
  bezocht.add(sleutel)

  const bestand = deps.fs || fs
  const bestanden = resourceBestanden(moduleWortel, parsed.type, parsed.naam, bestand)
  let sjabloonGezien = false

  for (const vol of bestanden) {
    const ext = path.extname(vol).toLowerCase()
    if (ext === '.xml') {
      const uit = leesXmlResource(vol, moduleWortel, flutterWortel, deps, bezocht)
      if (uit && uit.ok) return uit
      continue
    }
    const uit = leesBitmapKandidaat(vol, 'android', flutterWortel, deps)
    if (!uit) continue
    if (uit.ok) return uit
    if (uit.reden === 'standaard') sjabloonGezien = true
  }

  return { ok: false, reden: sjabloonGezien ? 'standaard' : 'geen' }
}

function zoekViaAndroidManifest(projectWortel, flutterWortel, deps) {
  const bestand = deps.fs || fs
  let sjabloonGezien = false

  for (const rel of MANIFEST_PADEN) {
    const manifestPad = path.join(projectWortel, ...rel.split('/'))
    let xml
    try { xml = bestand.readFileSync(manifestPad, 'utf8') } catch { continue }

    // Modulewortel = map die `src/main` bevat (…/app of …/android/app).
    const moduleWortel = path.dirname(path.dirname(path.dirname(manifestPad)))
    const refs = applicationIcoonRefs(xml)
    for (const ref of refs) {
      const uit = resolveerAndroidRef(moduleWortel, ref, flutterWortel, deps)
      if (uit && uit.ok) return uit
      if (uit && uit.reden === 'standaard') sjabloonGezien = true
    }
  }

  return sjabloonGezien ? { ok: false, reden: 'standaard' } : null
}

// Zoekt het icoon van één projectmap.
//
// Geeft altijd een object terug, ook als er niets is — de aanroeper wil het
// verschil weten tussen "nog niet gekeken", "niets gevonden" en "alleen het
// sjabloonicoon", want dat laatste is iets om in het projectvenster te
// vertellen in plaats van stil de emoji te tonen.
function zoekProjectIcoon(projectPad, opties = {}) {
  const bestand = opties.fs || fs
  const flutterWortel = opties.flutterWortel || null
  const deps = { fs: bestand }

  if (!projectPad) return { ok: false, reden: 'geenpad' }
  const wortel = path.resolve(projectPad)
  try { if (!bestand.statSync(wortel).isDirectory()) return { ok: false, reden: 'geenmap' } }
  catch { return { ok: false, reden: 'geenmap' } }

  let sjabloonGezien = false

  for (const kandidaat of KANDIDATEN) {
    const vol = path.join(wortel, ...kandidaat.rel.split('/'))
    const uit = leesBitmapKandidaat(vol, kandidaat.soort, flutterWortel, deps)
    if (!uit) continue
    if (uit.ok) return uit
    if (uit.reden === 'standaard') sjabloonGezien = true
  }

  // Manifest-route: custom namen (clockgood) en vector-/adaptive-iconen.
  const viaManifest = zoekViaAndroidManifest(wortel, flutterWortel, deps)
  if (viaManifest) {
    if (viaManifest.ok) return viaManifest
    if (viaManifest.reden === 'standaard') sjabloonGezien = true
  }

  return { ok: false, reden: sjabloonGezien ? 'standaard' : 'geen' }
}

module.exports = {
  KANDIDATEN,
  STANDAARD_HASHES,
  MAX_BYTES,
  MANIFEST_PADEN,
  zoekProjectIcoon,
  isStandaardIcoon,
  sjabloonHashesVanSdk,
  vergeetSdkHashes,
  leegCache,
  vectorXmlNaarSvg,
  applicationIcoonRefs,
}
