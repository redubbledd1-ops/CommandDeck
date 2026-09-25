// Online updates voor de geïnstalleerde app, via GitHub Releases.
//
// Het zoeken gebeurt pas ná het opstarten: main.js roept planCheck() aan
// zodra het venster geladen is, en dan wachten we nog even. electron-updater
// wordt ook pas op dat moment geladen, zodat het de start niet vertraagt.
//
// Er wordt niets zonder klik gedownload. Is er een nieuwe versie, dan krijgt
// de renderer 'update:status' en toont hij de update-knop; die roept
// 'update:install' aan: downloaden, afsluiten, stil installeren, herstarten.
//
// De portable exe kan zichzelf niet vervangen (hij draait uitgepakt uit
// %TEMP%); daar opent de knop de releasepagina om hem zelf op te halen.
//
// Geen internet, GitHub-limiet of een release zonder latest.yml: dan blijft
// de knop gewoon weg. Daar hoeft niemand een melding van te krijgen.

const REPO = { provider: 'github', owner: 'redubbledd1-ops', repo: 'CommandDeck' }
const RELEASES_URL = `https://github.com/${REPO.owner}/${REPO.repo}/releases/latest`

function maakUpdater({
  app, ipcMain, shell, getWin,
  voorInstalleren = () => {},
  laadAutoUpdater = () => require('electron-updater').autoUpdater,
  vertraging = 10e3,
  // Elk uur: wie CommandDeck de hele dag open heeft, hoort het dan dezelfde dag.
  interval = 3600e3,
  // Mislukt het zoeken (vlak na het opstarten is het netwerk er vaak nog niet),
  // dan niet een uur wachten maar na deze pauzes opnieuw proberen.
  herkansing = [60e3, 5 * 60e3, 15 * 60e3],
  portable = !!process.env.PORTABLE_EXECUTABLE_DIR,
  log = console,
}) {
  // staat: 'geen' | 'beschikbaar' | 'downloaden' | 'klaar'
  let status = { staat: 'geen', portable }
  let updater = null
  let gepland = false
  let installeren = false

  function zet(nieuw) {
    status = { ...status, ...nieuw }
    const win = getWin()
    if (win && !win.isDestroyed()) win.webContents.send('update:status', status)
  }

  function initUpdater() {
    if (updater) return updater
    updater = laadAutoUpdater()
    updater.autoDownload = false
    updater.autoInstallOnAppQuit = false
    updater.logger = null
    // Vast naar de publieke repo, zodat het ook werkt als een build (portable)
    // geen app-update.yml meekreeg.
    updater.setFeedURL(REPO)
    updater.on('update-available', (info) => zet({ staat: 'beschikbaar', versie: info.version }))
    updater.on('update-not-available', () => zet({ staat: 'geen', versie: undefined }))
    updater.on('download-progress', (p) => zet({ staat: 'downloaden', procent: Math.round(p.percent || 0) }))
    updater.on('update-downloaded', () => {
      zet({ staat: 'klaar' })
      if (installeren) installeerNu()
    })
    // Zonder luisteraar gooit een EventEmitter 'error' als exceptie.
    updater.on('error', (err) => {
      log.warn('[update]', err && err.message || err)
      // Mislukte download: knop weer op 'beschikbaar' zodat opnieuw kan.
      if (status.staat === 'downloaden') zet({ staat: 'beschikbaar', procent: undefined })
      installeren = false
    })
    return updater
  }

  let mislukt = 0
  let herkansKlok = null

  async function check() {
    try {
      await initUpdater().checkForUpdates()
      mislukt = 0
    } catch (err) {
      log.warn('[update] zoeken mislukt:', err && err.message || err)
      // Eén mislukte poging bij het opstarten betekende: de rest van de dag
      // geen update-knop. Nu een paar herkansingen, daarna gewoon het interval.
      if (!herkansKlok && mislukt < herkansing.length) {
        herkansKlok = setTimeout(() => { herkansKlok = null; check() }, herkansing[mislukt++])
        herkansKlok.unref?.()
      }
    }
  }

  function planCheck() {
    // In development is er niets te updaten; electron-updater geeft daar
    // alleen een fout. De oude bouw-vanuit-bron-knop dekt dat geval.
    if (!app.isPackaged || gepland) return
    gepland = true
    setTimeout(check, vertraging).unref?.()
    setInterval(check, interval).unref?.()
  }

  function installeerNu() {
    voorInstalleren()
    // Stil installeren in de bestaande map en daarna CommandDeck weer starten.
    updater.quitAndInstall(true, true)
  }

  ipcMain.handle('update:status', () => status)
  ipcMain.handle('update:install', async () => {
    if (status.staat === 'geen') return { ok: false }
    if (portable) { shell.openExternal(RELEASES_URL); return { ok: true, portable: true } }
    if (status.staat === 'klaar') { installeerNu(); return { ok: true } }
    if (installeren) return { ok: true }
    installeren = true
    zet({ staat: 'downloaden', procent: 0 })
    try { await updater.downloadUpdate() }
    catch (err) {
      // Het 'error'-event heeft de status al teruggezet.
      installeren = false
      return { ok: false, fout: err && err.message || String(err) }
    }
    return { ok: true }
  })

  return { planCheck, check }
}

module.exports = { maakUpdater, RELEASES_URL }
