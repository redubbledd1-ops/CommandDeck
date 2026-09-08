// Het eigen icoon van een projectmap opzoeken.
//
// Waar het hier om draait is de uitzondering: een vers `flutter create`-project
// heeft wél een ic_launcher.png, maar dat is het blauwe sjabloonlogo. Zou dat
// doorkomen, dan kreeg elk nieuw project hetzelfde plaatje in de zijbalk en
// was de emoji-keuze voor niets weggehaald. De tests hieronder leggen die
// grens vast, plus de volgorde (launcher-icoon boven favicon) en de cache.

const fs = require('fs'), os = require('os'), path = require('path')
const Ico = require('../project-icoon')

let ok = true
const t = (l, c) => { console.log((c ? 'PASS  ' : 'FAIL  ') + l); if (!c) ok = false }

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'projico-'))
let teller = 0

function maakProject(bestanden) {
  const wortel = path.join(TMP, 'p' + (++teller))
  for (const [rel, inhoud] of Object.entries(bestanden)) {
    const vol = path.join(wortel, ...rel.split('/'))
    fs.mkdirSync(path.dirname(vol), { recursive: true })
    fs.writeFileSync(vol, inhoud)
  }
  fs.mkdirSync(wortel, { recursive: true })
  return wortel
}

const ANDROID = 'android/app/src/main/res/mipmap-xxxhdpi/ic_launcher.png'
const SJABLOON_BYTES = Buffer.from('het blauwe flutter-logo')

// Een nagemaakte Flutter-SDK: alleen de sjabloonmap met het icoon erin. Zo
// kunnen we testen dat een project met precies dát bestand als "geen eigen
// icoon" geldt, zonder een echte SDK nodig te hebben.
const SDK = path.join(TMP, 'flutter-sdk')
const sjabloonBestand = path.join(SDK, 'packages', 'flutter_tools', 'templates',
  'app_shared', 'android.tmpl', 'app', 'src', 'main', 'res', 'mipmap-xxxhdpi', 'ic_launcher.png.img.tmpl')
fs.mkdirSync(path.dirname(sjabloonBestand), { recursive: true })
fs.writeFileSync(sjabloonBestand, SJABLOON_BYTES)

// ── Een project met een eigen icoon ─────────────────────────────────────────
{
  const wortel = maakProject({ [ANDROID]: Buffer.from('mijn eigen app-icoon') })
  const r = Ico.zoekProjectIcoon(wortel)
  t('eigen android-icoon wordt gevonden', r.ok === true)
  t('soort is android', r.soort === 'android')
  t('data-url is bruikbaar in een img', /^data:image\/png;base64,[A-Za-z0-9+/=]+$/.test(r.dataUrl || ''))
  t('de bron staat erbij', String(r.bron || '').endsWith('ic_launcher.png'))
}

// ── Het sjabloonicoon van Flutter telt niet als eigen icoon ─────────────────
{
  Ico.vergeetSdkHashes()
  const wortel = maakProject({ [ANDROID]: SJABLOON_BYTES })
  const r = Ico.zoekProjectIcoon(wortel, { flutterWortel: SDK })
  t('sjabloonicoon uit de SDK wordt herkend', r.ok === false && r.reden === 'standaard')
}

// Zonder SDK op de pc valt het terug op de vaste lijst. Die is uit echte
// projectmappen getrokken; dit controleert dat hij nog gevuld is en dat de
// hash van het bekende hdpi-sjabloon erin zit.
t('vaste lijst met sjabloonhashes is gevuld', Ico.STANDAARD_HASHES.size >= 10)
t('bekende flutter-hash geldt als standaard',
  Ico.isStandaardIcoon('13e9c72ec37fac220397aa819fa1ef2d', null) === true)
t('een willekeurige hash geldt niet als standaard',
  Ico.isStandaardIcoon('00000000000000000000000000000000', null) === false)

// ── Adaptief icoon: de tekening zit in de voorgrondlaag ─────────────────────
// ic_launcher.png blijft dan het sjabloon en zou het project onterecht als
// "geen eigen icoon" bestempelen.
{
  const wortel = maakProject({
    [ANDROID]: SJABLOON_BYTES,
    'android/app/src/main/res/mipmap-xxxhdpi/ic_launcher_foreground.png': Buffer.from('eigen voorgrond'),
  })
  const r = Ico.zoekProjectIcoon(wortel, { flutterWortel: SDK })
  t('voorgrondlaag telt als eigen icoon', r.ok === true && String(r.bron).endsWith('ic_launcher_foreground.png'))
}

// ── Niets gevonden ──────────────────────────────────────────────────────────
{
  const wortel = maakProject({ 'README.md': 'niks te zien' })
  const r = Ico.zoekProjectIcoon(wortel)
  t('lege map geeft geen icoon', r.ok === false && r.reden === 'geen')
  t('een pad dat niet bestaat klapt niet', Ico.zoekProjectIcoon(path.join(TMP, 'bestaat-niet')).reden === 'geenmap')
  t('zonder pad ook niet', Ico.zoekProjectIcoon('').reden === 'geenpad')
}

// ── Volgorde: het launcher-icoon wint van de favicon ────────────────────────
{
  const wortel = maakProject({
    'web/favicon.png': Buffer.from('favicon'),
    [ANDROID]: Buffer.from('launcher'),
  })
  const r = Ico.zoekProjectIcoon(wortel)
  t('launcher-icoon gaat voor de favicon', r.soort === 'android')
}

// ── Niet-Flutter: een electron-project of website ───────────────────────────
{
  const wortel = maakProject({ 'assets/icon.ico': Buffer.from('een ico-bestand') })
  const r = Ico.zoekProjectIcoon(wortel)
  t('assets/icon.ico wordt gevonden', r.ok === true && r.soort === 'app')
  t('ico krijgt het juiste mime-type', String(r.dataUrl).startsWith('data:image/x-icon;base64,'))
}

// ── Native Android: mipmap zonder android/-prefix ───────────────────────────
{
  const wortel = maakProject({
    'app/src/main/res/mipmap-xxxhdpi/ic_launcher.png': Buffer.from('native launcher'),
  })
  const r = Ico.zoekProjectIcoon(wortel)
  t('native android-mipmap wordt gevonden', r.ok === true && r.soort === 'android')
}

// ── Native Android: icoon via AndroidManifest + vector-drawable ─────────────
// DayKit-achtig: geen ic_launcher.png, wel android:icon="@drawable/…" als
// vector. Zonder manifest-route bleef zo'n project op de emoji hangen.
{
  const vector = `<?xml version="1.0" encoding="utf-8"?>
<vector xmlns:android="http://schemas.android.com/apk/res/android"
    android:width="24dp" android:height="24dp"
    android:viewportWidth="24" android:viewportHeight="24">
  <path android:fillColor="#FF112233" android:pathData="M0,0h24v24H0z"/>
  <path android:fillColor="#FFFFFFFF" android:pathData="M4,4h16v16H4z"/>
</vector>`
  const wortel = maakProject({
    'app/src/main/AndroidManifest.xml':
      '<manifest><application android:icon="@drawable/clockgood" android:roundIcon="@drawable/clockgood"/></manifest>',
    'app/src/main/res/drawable/clockgood.xml': vector,
  })
  const r = Ico.zoekProjectIcoon(wortel)
  t('manifest-vector wordt gevonden', r.ok === true && r.soort === 'android')
  t('vector komt als svg-data-url', String(r.dataUrl || '').startsWith('data:image/svg+xml;base64,'))
  t('svg bevat de paden', Buffer.from(String(r.dataUrl).split(',')[1], 'base64').toString('utf8').includes('path d='))
}

// ── Adaptive icon → foreground-drawable (TimeGuess-achtig) ──────────────────
{
  const logo = `<vector xmlns:android="http://schemas.android.com/apk/res/android"
    android:viewportWidth="10" android:viewportHeight="10">
  <path android:fillColor="#4ECDC4" android:pathData="M0,0h10v10H0z"/>
</vector>`
  const wortel = maakProject({
    'app/src/main/AndroidManifest.xml':
      '<manifest><application android:icon="@mipmap/ic_launcher"/></manifest>',
    'app/src/main/res/mipmap-anydpi-v26/ic_launcher.xml':
      `<adaptive-icon xmlns:android="http://schemas.android.com/apk/res/android">
        <background android:drawable="@color/ic_launcher_background"/>
        <foreground android:drawable="@drawable/app_logo"/>
      </adaptive-icon>`,
    'app/src/main/res/drawable/app_logo.xml': logo,
  })
  const r = Ico.zoekProjectIcoon(wortel)
  t('adaptive foreground-vector telt als icoon', r.ok === true)
  t('en is een svg', String(r.dataUrl || '').startsWith('data:image/svg+xml;base64,'))
}

// ── vectorXmlNaarSvg: Android #AARRGGBB → SVG-kleur ─────────────────────────
{
  const svg = Ico.vectorXmlNaarSvg(`<vector android:viewportWidth="2" android:viewportHeight="2">
    <path android:fillColor="#8000FF00" android:pathData="M0,0h2v2H0z"/>
  </vector>`)
  t('vector-omzetter maakt svg', !!svg && svg.includes('<svg'))
  t('alpha uit AARRGGBB wordt fill-opacity', svg.includes('fill-opacity="0.502"') || svg.includes('fill-opacity="0.5"'))
  t('rgb uit AARRGGBB klopt', svg.includes('fill="#00ff00"'))
}

// ── Te groot om als data-url door te geven ──────────────────────────────────
{
  const wortel = maakProject({ [ANDROID]: Buffer.alloc(Ico.MAX_BYTES + 1, 0x61) })
  const r = Ico.zoekProjectIcoon(wortel)
  t('een veel te groot bestand wordt overgeslagen', r.ok === false)
}

// ── Cache: vervangen icoon komt door, ongewijzigd icoon wordt niet herlezen ─
{
  const wortel = maakProject({ [ANDROID]: Buffer.from('versie een') })
  const eerst = Ico.zoekProjectIcoon(wortel)

  const gelezen = []
  const nepFs = {
    statSync: (p) => fs.statSync(p),
    readFileSync: (p) => { gelezen.push(p); return fs.readFileSync(p) },
    readdirSync: (p, o) => fs.readdirSync(p, o),
    existsSync: (p) => fs.existsSync(p),
  }
  Ico.zoekProjectIcoon(wortel, { fs: nepFs })
  t('ongewijzigd icoon wordt niet opnieuw ingelezen', gelezen.length === 0)

  const vol = path.join(wortel, ...ANDROID.split('/'))
  fs.writeFileSync(vol, Buffer.from('versie twee, andere lengte'))
  const daarna = Ico.zoekProjectIcoon(wortel)
  t('een vervangen icoon komt door', daarna.ok && daarna.dataUrl !== eerst.dataUrl)

  Ico.leegCache(wortel)
  gelezen.length = 0
  Ico.zoekProjectIcoon(wortel, { fs: nepFs })
  t('na leegCache wordt er wel opnieuw gelezen', gelezen.length === 1)
}

try { fs.rmSync(TMP, { recursive: true, force: true }) } catch { /* tijdelijke map */ }

console.log(ok ? '\nAlles goed' : '\nEr ging iets mis')
process.exit(ok ? 0 : 1)
