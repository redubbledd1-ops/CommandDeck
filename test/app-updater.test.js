const { EventEmitter } = require('events')
const { maakUpdater, RELEASES_URL } = require('../app-updater')
let ok = true; const check = (l, c) => { console.log((c ? 'PASS  ' : 'FAIL  ') + l); if (!c) ok = false }
const wacht = (ms) => new Promise(r => setTimeout(r, ms))

function opzet({ packaged = true, portable = false, checkFout = null, herkansing } = {}) {
  const handlers = {}, verzonden = [], geopend = []
  let geladen = 0, gezocht = 0, geinstalleerd = null, voor = 0
  const au = new EventEmitter()
  au.setFeedURL = (c) => { au.feed = c }
  au.checkForUpdates = async () => { gezocht++; if (au.checkFout) throw new Error(au.checkFout) }
  au.checkFout = checkFout
  au.downloadUpdate = async () => { au.emit('download-progress', { percent: 42.4 }); au.emit('update-downloaded', {}) }
  au.quitAndInstall = (s, r) => { geinstalleerd = [s, r] }
  const win = { isDestroyed: () => false, webContents: { send: (k, v) => verzonden.push([k, v]) } }
  const u = maakUpdater({
    app: { isPackaged: packaged },
    ipcMain: { handle: (n, f) => { handlers[n] = f } },
    shell: { openExternal: (url) => geopend.push(url) },
    getWin: () => win,
    voorInstalleren: () => voor++,
    laadAutoUpdater: () => { geladen++; return au },
    vertraging: 20, portable, herkansing: herkansing || [5000],
    log: { warn: () => {} },
  })
  return { u, au, handlers, verzonden, geopend,
    get geladen() { return geladen }, get gezocht() { return gezocht },
    get geinstalleerd() { return geinstalleerd }, get voor() { return voor } }
}

;(async () => {
  // Opstarten mag niet trager worden: niets laden of zoeken tot planCheck + wachttijd.
  let t = opzet()
  check('electron-updater wordt niet bij het opstarten geladen', t.geladen === 0)
  t.u.planCheck(); t.u.planCheck()
  check('ook direct na planCheck nog niet gezocht', t.gezocht === 0 && t.geladen === 0)
  await wacht(50)
  check('na de wachttijd één keer gezocht', t.gezocht === 1)
  check('feed wijst naar de publieke repo', t.au.feed.owner === 'redubbledd1-ops' && t.au.feed.repo === 'CommandDeck')
  check('niets automatisch downloaden', t.au.autoDownload === false)

  check('status is eerst "geen"', (await t.handlers['update:status']()).staat === 'geen')
  check('installeren zonder update doet niets', (await t.handlers['update:install']()).ok === false)

  t.au.emit('update-available', { version: '1.0.1' })
  const laatst = t.verzonden.at(-1)
  check('renderer hoort dat er een update is, met versie',
    laatst[0] === 'update:status' && laatst[1].staat === 'beschikbaar' && laatst[1].versie === '1.0.1')

  const r = await t.handlers['update:install']()
  check('installeren downloadt en meldt voortgang', r.ok && t.verzonden.some(([, v]) => v.staat === 'downloaden' && v.procent === 42))
  check('na download stil installeren en herstarten', JSON.stringify(t.geinstalleerd) === '[true,true]')
  check('main krijgt vooraf een seintje (flutter opruimen)', t.voor === 1)

  // Fouten blijven stil; geen crash en geen knop.
  t = opzet({ checkFout: 'net::ERR_INTERNET_DISCONNECTED' })
  t.u.planCheck(); await wacht(50)
  t.au.emit('error', new Error('offline'))
  check('offline: geen crash, status blijft "geen"', (await t.handlers['update:status']()).staat === 'geen')

  // Mislukt de eerste poging (netwerk nog niet klaar na het opstarten), dan
  // niet pas na het interval opnieuw — anders geen update-knop die hele dag.
  t = opzet({ checkFout: 'net::ERR_NETWORK_CHANGED', herkansing: [30, 30] })
  t.u.planCheck(); await wacht(50)
  check('eerste poging mislukt', t.gezocht === 1)
  t.au.checkFout = null
  await wacht(60)
  check('kort daarna opnieuw geprobeerd', t.gezocht === 2)
  await wacht(80)
  check('en na een geslaagde poging geen extra herkansingen', t.gezocht === 2)

  // Mislukte download: knop terug naar 'beschikbaar'.
  t = opzet()
  t.u.planCheck(); await wacht(50)
  t.au.emit('update-available', { version: '1.0.1' })
  t.au.downloadUpdate = async () => { const e = new Error('kapot'); t.au.emit('error', e); throw e }
  const mis = await t.handlers['update:install']()
  check('mislukte download meldt fout', mis.ok === false && mis.fout === 'kapot')
  check('en zet de knop terug op "beschikbaar"', (await t.handlers['update:status']()).staat === 'beschikbaar')
  check('en installeert niets', t.geinstalleerd === null)

  // Development: nooit zoeken.
  t = opzet({ packaged: false })
  t.u.planCheck(); await wacht(50)
  check('in development wordt niet gezocht', t.gezocht === 0 && t.geladen === 0)

  // Portable: releasepagina openen in plaats van installeren.
  t = opzet({ portable: true })
  t.u.planCheck(); await wacht(50)
  t.au.emit('update-available', { version: '1.0.1' })
  const p = await t.handlers['update:install']()
  check('portable opent de releasepagina', p.portable && t.geopend[0] === RELEASES_URL && t.geinstalleerd === null)

  console.log(ok ? '\nALLES OK' : '\nER GING IETS MIS')
  process.exit(ok ? 0 : 1)
})()
