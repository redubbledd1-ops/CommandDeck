// Bureaubladsnelkoppeling voor een gebouwde Flutter-Windows-app.
//
// Kern om vast te leggen: welke regels herkend worden als "hier staat de exe",
// dat een .ico-icoon direct gebruikt wordt (geen omweg via PowerShell), dat een
// PNG wél omgezet wordt, en dat zonder eigen icoon de snelkoppeling gewoon
// zonder IconLocation gezet wordt (dan toont Windows het icoon van de exe zelf).

const Module = require('module'), fs = require('fs'), os = require('os'), path = require('path')

let ok = true
const t = (l, c) => { console.log((c ? 'PASS  ' : 'FAIL  ') + l); if (!c) ok = false }

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'dtsnel-'))

// PowerShell-aanroepen nabootsen zonder een echte shell te starten.
const psAanroepen = []
let volgendResultaat = { ok: true }
const orig = Module._load
Module._load = function (r) {
  if (r === 'child_process') {
    const cp = orig.apply(this, arguments)
    return {
      ...cp,
      spawn: (c, a) => {
        const h = {}
        if (/powershell/i.test(c)) {
          const script = (a || []).join(' ')
          psAanroepen.push(script)
          setTimeout(() => {
            if (volgendResultaat.ok) {
              // .ico maken: schrijf iets weg op het pad achter File]::Create('...')
              const m = script.match(/File\]::Create\('([^']+)'\)/)
              if (m) fs.writeFileSync(m[1].replace(/''/g, "'"), 'nep-ico')
              // .lnk maken: schrijf iets weg op het pad achter CreateShortcut('...')
              const m2 = script.match(/CreateShortcut\('([^']+)'\)/)
              if (m2) fs.writeFileSync(m2[1].replace(/''/g, "'"), 'nep-lnk')
            }
            h.close && h.close(volgendResultaat.ok ? 0 : 1)
          }, 0)
        }
        return { unref() {}, on(e, f) { h[e] = f }, stdout: { on() {} }, stderr: { on() {} }, kill() {} }
      },
    }
  }
  return orig.apply(this, arguments)
}

// desktop-snelkoppeling.js haalt `spawn` er via destructuring bij het `require`
// hierboven al uit — de nagebootste versie blijft dus gebonden ook nadat de
// override hier weer teruggezet wordt.
const DS = require('../desktop-snelkoppeling')
Module._load = orig

;(async () => {
  // ── vindGebouwdeExe: herkent de "Built ...exe"-regel in zijn varianten ─────
  t('gewone regel met vinkje', DS.vindGebouwdeExe('√ Built build\\windows\\x64\\runner\\Debug\\mijn_app.exe.') === 'build\\windows\\x64\\runner\\Debug\\mijn_app.exe')
  t('zonder x64-map (oudere flutter)', DS.vindGebouwdeExe('√ Built build\\windows\\runner\\Release\\app.exe.') === 'build\\windows\\runner\\Release\\app.exe')
  t('zonder punt op het eind', DS.vindGebouwdeExe('Built build\\windows\\x64\\runner\\Debug\\app.exe') === 'build\\windows\\x64\\runner\\Debug\\app.exe')
  t('andere regels leveren niets op', DS.vindGebouwdeExe('Launching lib\\main.dart on Windows in debug mode...') === null)
  t('een build-fout is geen "Built"-regel', DS.vindGebouwdeExe('Error: Building Windows application... FAILED') === null)

  // ── veiligeBestandsnaam ──────────────────────────────────────────────────────
  t('rare tekens uit de bestandsnaam gehaald', DS.veiligeBestandsnaam('mijn:app*naam?') === 'mijnappnaam')
  t('lege naam valt terug op app', DS.veiligeBestandsnaam('') === 'app')

  // ── icoonBestandVoor: .ico direct, geen powershell nodig ────────────────────
  {
    const icoBron = path.join(TMP, 'bron.ico')
    fs.writeFileSync(icoBron, 'echt-ico')
    psAanroepen.length = 0
    const r = await DS.icoonBestandVoor({ ok: true, bron: icoBron }, path.join(TMP, 'cache1'))
    t('.ico wordt direct teruggegeven', r === icoBron)
    t('daarvoor is geen powershell nodig', psAanroepen.length === 0)
  }

  // ── icoonBestandVoor: PNG wordt omgezet en gecachet ─────────────────────────
  {
    const pngBron = path.join(TMP, 'bron.png')
    fs.writeFileSync(pngBron, 'nep-png')
    const cache = path.join(TMP, 'cache2')
    psAanroepen.length = 0
    const r = await DS.icoonBestandVoor({ ok: true, bron: pngBron, hash: 'abc123' }, cache)
    t('png levert een ico-pad op', r === path.join(cache, 'abc123.ico'))
    t('en dat bestand bestaat echt', fs.existsSync(r))
    t('daarvoor werd powershell gebruikt', psAanroepen.some(a => /GetHicon/.test(a)))

    psAanroepen.length = 0
    const r2 = await DS.icoonBestandVoor({ ok: true, bron: pngBron, hash: 'abc123' }, cache)
    t('een tweede keer komt uit de cache, geen powershell', r2 === r && psAanroepen.length === 0)
  }

  // ── icoonBestandVoor: geen eigen icoon → null (snelkoppeling valt terug) ────
  {
    const r1 = await DS.icoonBestandVoor({ ok: false }, path.join(TMP, 'cache3'))
    t('geen vondst geeft null', r1 === null)
    const svgAchtig = { ok: true, bron: path.join(TMP, 'iets.xml') }
    const r2 = await DS.icoonBestandVoor(svgAchtig, path.join(TMP, 'cache3'))
    t('een niet-bitmapbron (xml/svg-afgeleid) geeft null', r2 === null)
  }

  // ── maakSnelkoppeling ────────────────────────────────────────────────────────
  {
    const desktop = path.join(TMP, 'Desktop'); fs.mkdirSync(desktop, { recursive: true })
    const exePad = path.join(TMP, 'build', 'app.exe'); fs.mkdirSync(path.dirname(exePad), { recursive: true })
    fs.writeFileSync(exePad, 'nep-exe')
    const iconPad = path.join(TMP, 'icoon.ico'); fs.writeFileSync(iconPad, 'nep-ico')

    const r = await DS.maakSnelkoppeling({ desktopPad: desktop, naam: 'Mijn App', exePad, iconPad })
    t('snelkoppeling wordt gemaakt op het bureaublad', r === path.join(desktop, 'Mijn App.lnk'))
    t('en het bestand bestaat echt', fs.existsSync(r))

    psAanroepen.length = 0
    const rZonder = await DS.maakSnelkoppeling({ desktopPad: desktop, naam: 'Zonder Icoon', exePad })
    t('zonder iconPad wordt er geen IconLocation meegegeven', !psAanroepen.some(a => /IconLocation/.test(a)))
    t('de snelkoppeling wordt alsnog gemaakt', rZonder === path.join(desktop, 'Zonder Icoon.lnk'))
  }

  // ── verwerkRegel: end-to-end met een nagemaakte project-icoon.zoekProjectIcoon ─
  {
    const cwd = path.join(TMP, 'project'); fs.mkdirSync(cwd, { recursive: true })
    const exeRel = 'build\\windows\\x64\\runner\\Debug\\app.exe'
    const exeAbs = path.join(cwd, 'build', 'windows', 'x64', 'runner', 'Debug', 'app.exe')
    fs.mkdirSync(path.dirname(exeAbs), { recursive: true })
    fs.writeFileSync(exeAbs, 'nep-exe')
    const desktop = path.join(TMP, 'Desktop2'); fs.mkdirSync(desktop, { recursive: true })
    const icoBron = path.join(cwd, 'eigen.ico'); fs.writeFileSync(icoBron, 'nep-ico')

    const nepProjectIcoon = { zoekProjectIcoon: () => ({ ok: true, bron: icoBron, soort: 'app' }) }
    const res = await DS.verwerkRegel(`√ Built ${exeRel}.`, {
      cwd, flutterWortel: null, projectIcoon: nepProjectIcoon,
      desktopPad: desktop, cacheDir: path.join(TMP, 'cache4'),
    })
    t('verwerkRegel geeft een resultaat terug', !!res)
    t('de snelkoppeling wijst naar de echte exe', res.exePad === exeAbs)
    t('het eigen icoon werd gevonden', res.iconGevonden === true)
    t('het lnk-bestand staat op het bureaublad', fs.existsSync(res.lnkPad))

    // een regel die niet over een build gaat levert niets op
    const geen = await DS.verwerkRegel('Some unrelated log line', {
      cwd, flutterWortel: null, projectIcoon: nepProjectIcoon, desktopPad: desktop, cacheDir: TMP,
    })
    t('een niet-"Built"-regel doet niets', geen === null)

    // een exe die (nog) niet bestaat: geen snelkoppeling
    const nietBestaand = await DS.verwerkRegel('√ Built build\\windows\\x64\\runner\\Debug\\nietbestaand.exe.', {
      cwd, flutterWortel: null, projectIcoon: nepProjectIcoon, desktopPad: desktop, cacheDir: TMP,
    })
    t('een nog niet bestaande exe levert niets op', nietBestaand === null)
  }

  try { fs.rmSync(TMP, { recursive: true, force: true }) } catch { /* tijdelijke map */ }

  console.log(ok ? '\nAlles goed' : '\nEr ging iets mis')
  process.exit(ok ? 0 : 1)
})()
