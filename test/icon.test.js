// Icoonbron inlezen: .ico, een programma, of een snelkoppeling die ernaar wijst
const Module = require('module'), path = require('path'), fs = require('fs'), os = require('os')
const REAL = path.join(__dirname, '..')

let ok = true
const t = (l, c) => { console.log((c ? 'PASS  ' : 'FAIL  ') + l); if (!c) ok = false }

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'ico-'))
const handlers = {}
const gelezen = []          // alles wat aan NtExecutable.from is doorgegeven
let shortcutData = {}
const psAanroepen = []
const cacheAanroepen = []
let ie4Faalt = false
let psFaalt = false
let leegResultaat = false
let geenGroepen = false
let leegNaSchrijven = false

// resedit nabootsen, zodat we kunnen zien met welke opties er gelezen wordt
const nepResedit = {
  NtExecutable: {
    from: (buf, opts) => {
      gelezen.push({ opts })
      // dit is precies wat pe-library doet zonder ignoreCert
      if (!opts?.ignoreCert && buf.toString().includes('ONDERTEKEND')) {
        throw new Error('Parsing signed executable binary is not allowed by default.')
      }
      if (buf.toString().includes('GEEN GELDIG')) throw new Error('Invalid binary format')
      return { generate: () => new ArrayBuffer(8) }
    },
  },
  NtExecutableResource: {
    from: () => (leegNaSchrijven ? { entries: [], outputResource: () => {} } : {
      // Twee icoongroepen, met de laagste id bewust als tweede in de lijst —
      // precies het geval waarin 'pak de eerste' de verkeerde te pakken had.
      entries: [
        { type: 14, id: 5, lang: 1033, bin: new ArrayBuffer(2) },
        { type: 14, id: 1, lang: 1033, bin: new ArrayBuffer(2) },
        { type: 3,  id: 7, lang: 1033, bin: new ArrayBuffer(4) },
      ],
      outputResource: () => {},
    }),
  },
  Data: { IconFile: { from: () => ({ icons: [{ data: { isIcon: () => true, generate: () => new ArrayBuffer(4) } }] }) } },
  Resource: {
    IconGroupEntry: {
      // Net als de echte: een groep levert IconItem-objecten, geen buffers.
      fromEntries: (entries) => (geenGroepen || !entries || !entries.length) ? [] : [{
        icons: [{ iconID: 7 }],
        getIconItemsFromEntries: () => [{ isIcon: () => true, generate: () => new ArrayBuffer(4) }],
      }],
      replaceIconsForResource: (...a) => {
        const icons = a[3]
        if (leegResultaat) { leegNaSchrijven = true; vervangen.push(a); return }
        // Precies de controle die de echte bibliotheek doet en waar het op stukliep
        if (!icons.every(i => typeof i.isIcon === 'function')) {
          throw new TypeError('icon.isIcon is not a function')
        }
        vervangen.push(a)
      },
    },
  },
}
const vervangen = []

const fake = {
  app: { getPath: () => TMP, whenReady: () => ({ then: () => {} }), on: () => {}, relaunch: () => {}, quit: () => {}, exit: () => {}, isPackaged: false, getAppPath: () => REAL },
  BrowserWindow: function () { this.loadFile = () => {}; this.webContents = { send: () => {} }; this.isDestroyed = () => false },
  ipcMain: { on: () => {}, handle: (n, f) => { handlers[n] = f } },
  dialog: { showOpenDialog: async () => ({ canceled: true }) },
  shell: { openPath: () => {}, readShortcutLink: () => shortcutData },
}
const orig = Module._load
Module._load = function (r) {
  if (r === 'electron') return fake
  if (r === 'resedit') return nepResedit
  if (r === 'child_process') {
    const cp = orig.apply(this, arguments)
    return { ...cp, spawn: (c, a) => {
      const h = {}
      if (/ie4uinit/i.test(c)) {
        cacheAanroepen.push(a.join(' '))
        setTimeout(() => h.close && h.close(ie4Faalt ? 1 : 0), 0)
      }
      if (/powershell/i.test(c)) {
        psAanroepen.push(a.join(' '))
        setTimeout(() => {
          if (!psFaalt) {
            const m = a.join(' ').match(/File\]::Create\('([^']+)'\)/)
            if (m) fs.writeFileSync(m[1], 'nep-ico-van-windows')
          }
          h.close && h.close(0)
        }, 0)
      }
      if (/iexpress/i.test(c)) setTimeout(() => {
        const sed = fs.readFileSync(a[a.length - 1], 'utf8')
        const regel = sed.split(/\r?\n/).filter(l => l.startsWith('TargetName=') && !l.includes('%')).pop()
        fs.writeFileSync(regel.slice('TargetName='.length).trim(), 'nep-exe')
        h.close && h.close(0)
      }, 0)
      return { unref() {}, on(e, f) { h[e] = f }, stdout: { on() {} }, stderr: { on() {} }, kill() {} }
    } }
  }
  return orig.apply(this, arguments)
}
require(path.join(REAL, 'main.js'))
// Let op: de override blijft staan. main.js doet require('resedit') pas op het
// moment dat er een icoon gezet wordt, dus terugdraaien zou de echte
// bibliotheek alsnog binnenhalen.
const call = (n, a) => handlers[n](null, a)

;(async () => {
  const bat = path.join(TMP, 'script.bat')
  fs.writeFileSync(bat, 'echo hoi')

  // een ondertekend programma als icoonbron — dit ging eerst mis
  const ondertekend = path.join(TMP, 'echt-programma.exe')
  fs.writeFileSync(ondertekend, 'ONDERTEKEND binair spul')

  gelezen.length = 0
  let r = await call('bat:makeExe', { batPath: bat, exePath: path.join(TMP, 'uit1.exe'), iconPath: ondertekend })
  t('icoon uit een ondertekend programma werkt nu', r.ok === true && !r.iconWarning)
  t('er wordt met ignoreCert gelezen', gelezen.every(g => g.opts && g.opts.ignoreCert === true))
  t('het icoon wordt daadwerkelijk vervangen', vervangen.length === 1)
  t('het aantal ingebedde formaten wordt gemeld', r.iconCount === 1)
  t('de icooncache wordt automatisch ververst',
    cacheAanroepen.some(a => a.includes('-show')) && r.cacheVervers === true)
  t('er wordt precies één groep vervangen (meerdere hernummert elkaar kapot)',
    vervangen.length === 1)
  t('en dat is de groep met het laagste id, want die toont Windows',
    vervangen[0][1] === 1)
  t('er worden IconItems doorgegeven, geen ruwe buffers',
    vervangen[0][3].every(i => typeof i.isIcon === 'function'))

  // .ico gaat langs de icoon-parser, niet langs de PE-lezer
  const ico = path.join(TMP, 'plaatje.ico')
  fs.writeFileSync(ico, 'nep-ico')
  gelezen.length = 0
  r = await call('bat:makeExe', { batPath: bat, exePath: path.join(TMP, 'uit2.exe'), iconPath: ico })
  t('.ico werkt ook', r.ok === true && !r.iconWarning)
  t('voor een .ico wordt de bron niet ontleed, alleen de exe (en de nacontrole)',
    gelezen.length === 3)

  // een snelkoppeling die naar een icoon wijst
  const lnk = path.join(TMP, 'snelkoppeling.lnk')
  fs.writeFileSync(lnk, 'nep-snelkoppeling')
  shortcutData = { icon: ondertekend, target: path.join(TMP, 'iets.exe') }
  r = await call('bat:makeExe', { batPath: bat, exePath: path.join(TMP, 'uit3.exe'), iconPath: lnk })
  const voorLnk = vervangen.length
  t('snelkoppeling met eigen icoon wordt gevolgd', r.ok === true && !r.iconWarning && voorLnk === 3)

  // een snelkoppeling zonder eigen icoon valt terug op het doelprogramma
  fs.writeFileSync(path.join(TMP, 'doel.exe'), 'ONDERTEKEND ook dit')
  shortcutData = { icon: '', target: path.join(TMP, 'doel.exe') }
  r = await call('bat:makeExe', { batPath: bat, exePath: path.join(TMP, 'uit4.exe'), iconPath: lnk })
  t('zonder eigen icoon wordt het doelprogramma gebruikt', r.ok === true && !r.iconWarning)

  // een snelkoppeling die nergens heen wijst
  shortcutData = { icon: '', target: '' }
  r = await call('bat:makeExe', { batPath: bat, exePath: path.join(TMP, 'uit5.exe'), iconPath: lnk })
  t('een snelkoppeling zonder bruikbare verwijzing lukt via de terugval',
    r.ok === true && !r.iconWarning)

  // een kring van snelkoppelingen mag niet blijven hangen
  const kring = path.join(TMP, 'kring.lnk')
  fs.writeFileSync(kring, 'x')
  shortcutData = { icon: kring, target: kring }
  r = await call('bat:makeExe', { batPath: bat, exePath: path.join(TMP, 'uit6.exe'), iconPath: kring })
  t('verwijzingen in een kring blijven niet hangen', r.ok === true)

  // ── terugval: Windows het icoon laten uitlezen ─────────────────────────────
  // Een bestand dat we zelf niet kunnen ontleden
  const raar = path.join(TMP, 'raar-programma.exe')
  fs.writeFileSync(raar, 'GEEN GELDIG PE-BESTAND')
  psAanroepen.length = 0
  shortcutData = {}
  const voorVervangen = vervangen.length
  r = await call('bat:makeExe', { batPath: bat, exePath: path.join(TMP, 'uit7.exe'), iconPath: raar })
  t('onontleedbaar bestand valt terug op Windows', r.ok === true && !r.iconWarning)
  t('daarvoor wordt powershell gebruikt', psAanroepen.some(a => /ExtractAssociatedIcon/.test(a)))
  t('en er komt alsnog een icoon uit', vervangen.length === voorVervangen + 1)

  // een snelkoppeling waarvan de verwijzing niet uitleesbaar is
  const lnk2 = path.join(TMP, 'kapotte-snelkoppeling.lnk')
  fs.writeFileSync(lnk2, 'x')
  shortcutData = { icon: '', target: '' }
  psAanroepen.length = 0
  r = await call('bat:makeExe', { batPath: bat, exePath: path.join(TMP, 'uit8.exe'), iconPath: lnk2 })
  t('snelkoppeling zonder bruikbare verwijzing gaat ook via Windows',
    r.ok === true && !r.iconWarning && psAanroepen.length === 1)
  t('de snelkoppeling zelf wordt aan Windows doorgegeven',
    psAanroepen[0].includes('kapotte-snelkoppeling.lnk'))

  // lukt ook dat niet, dan een duidelijke melding
  psFaalt = true
  r = await call('bat:makeExe', { batPath: bat, exePath: path.join(TMP, 'uit9.exe'), iconPath: raar })
  t('als niets werkt komt de oorspronkelijke fout terug',
    r.ok === true && typeof r.iconWarning === 'string' && r.iconWarning.length > 0)
  t('de exe komt er dan nog steeds', fs.existsSync(path.join(TMP, 'uit9.exe')))
  psFaalt = false

  // een echt programma dat we wél kunnen ontleden gaat niet via de omweg
  psAanroepen.length = 0
  r = await call('bat:makeExe', { batPath: bat, exePath: path.join(TMP, 'uit10.exe'), iconPath: ondertekend })
  t('ontleedbaar programma gebruikt de volledige icoongroep, niet de omweg',
    r.ok === true && psAanroepen.length === 0)

  // controle op het uiteindelijke bestand, niet alleen de tijdelijke kopie
  geenGroepen = true
  r = await call('bat:makeExe', { batPath: bat, exePath: path.join(TMP, 'uit12.exe'), iconPath: ico })
  t('een bestand zonder icoongroep wordt opgemerkt',
    r.ok === true && /geen icoongroep/.test(r.iconWarning || '') && r.iconCount === 0)
  geenGroepen = false

  // als het icoon niet in het bestand belandt, moet dat gemeld worden
  leegResultaat = true
  r = await call('bat:makeExe', { batPath: bat, exePath: path.join(TMP, 'uit11.exe'), iconPath: ico })
  t('een leeg resultaat wordt opgemerkt in plaats van stil doorgelaten',
    r.ok === true && /geen icoongroep/.test(r.iconWarning || '') && r.iconCount === 0)
  leegResultaat = false
  leegNaSchrijven = false

  // oudere Windows kent -show niet; dan de andere schakelaar proberen
  cacheAanroepen.length = 0
  ie4Faalt = true
  r = await call('bat:makeExe', { batPath: bat, exePath: path.join(TMP, 'uit13.exe'), iconPath: ico })
  t('bij een mislukte -show wordt -ClearIconCache geprobeerd',
    cacheAanroepen.some(a => a.includes('-ClearIconCache')))
  t('een mislukte verversing houdt de exe niet tegen', r.ok === true && r.iconCount === 1)
  t('en dat wordt eerlijk gemeld', r.cacheVervers === false)
  ie4Faalt = false

  // zonder icoon wordt de cache met rust gelaten
  cacheAanroepen.length = 0
  r = await call('bat:makeExe', { batPath: bat, exePath: path.join(TMP, 'uit14.exe') })
  t('zonder icoon wordt de icooncache niet aangeraakt', cacheAanroepen.length === 0)

  Module._load = orig
  console.log(ok ? '\nALLE TESTS GESLAAGD' : '\nER ZIJN TESTS GEFAALD')
  process.exit(ok ? 0 : 1)
})()
