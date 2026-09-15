// Bureaubladsnelkoppeling voor een net gebouwde Flutter-Windows-app.
//
// `flutter run -d windows` en `flutter build windows` melden in hun uitvoer
// waar de exe is neergezet: "√ Built build\windows\x64\runner\Debug\naam.exe.".
// Zodra die regel langskomt weten we genoeg om een snelkoppeling op het
// bureaublad te zetten — mét het eigen icoon van het project (project-icoon.js)
// in plaats van het standaard Flutter-logo, als het project er een heeft.
//
// PNG's kunnen niet direct als icoon van een .lnk dienen; Windows wil een
// .ico. ExtractAssociatedIcon (elders in main.js) geeft dan het icoon van het
// bestandstype terug (een plaatjes-viewer), niet de afbeelding zelf — daarom
// hier een eigen omzetting via Bitmap.GetHicon(), die wél de echte inhoud
// pakt. Resultaat wordt op hash gecachet zodat een ongewijzigd icoon niet bij
// elke run opnieuw via PowerShell hoeft.

const fs = require('fs')
const path = require('path')
const crypto = require('crypto')
const { spawn } = require('child_process')

const GEBOUWD_REGEX = /Built\s+(.+?\.exe)\.?\s*$/i

function vindGebouwdeExe(regel) {
  const m = GEBOUWD_REGEX.exec(String(regel || '').trim())
  return m ? m[1].trim() : null
}

function q(p) { return String(p).replace(/'/g, "''") }

function draaiPowershell(script) {
  return new Promise((resolve) => {
    let p
    try { p = spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script], { windowsHide: true }) }
    catch { resolve(false); return }
    p.on('close', code => resolve(code === 0))
    p.on('error', () => resolve(false))
  })
}

// Bitmap → .ico, met de werkelijke afbeelding (niet het icoon van het
// bestandstype).
async function bitmapNaarIco(bronPad, uitPad) {
  const script = [
    'Add-Type -AssemblyName System.Drawing',
    `$bmp = New-Object System.Drawing.Bitmap('${q(bronPad)}')`,
    '$h = $bmp.GetHicon()',
    '$ic = [System.Drawing.Icon]::FromHandle($h)',
    `$fs = [System.IO.File]::Create('${q(uitPad)}')`,
    '$ic.Save($fs)',
    '$fs.Close()',
    '$ic.Dispose()',
    '[System.Runtime.InteropServices.Marshal]::DestroyIcon($h) | Out-Null',
  ].join('; ')
  const ok = await draaiPowershell(script)
  return ok && fs.existsSync(uitPad) ? uitPad : null
}

// Bepaalt welk .ico-bestand als icoon van de snelkoppeling moet dienen, op
// basis van wat project-icoon.js voor dit project vond. Geeft null terug als
// er geen eigen icoon is (of als de vondst geen bestand op schijf is, zoals
// een uit XML afgeleide SVG) — dan valt de snelkoppeling terug op het icoon
// dat al in de exe zit.
async function icoonBestandVoor(gevonden, cacheDir) {
  if (!gevonden || !gevonden.ok || !gevonden.bron) return null
  const ext = path.extname(gevonden.bron).toLowerCase()
  if (ext === '.ico') return fs.existsSync(gevonden.bron) ? gevonden.bron : null
  if (!['.png', '.jpg', '.jpeg', '.bmp', '.gif'].includes(ext)) return null

  try { fs.mkdirSync(cacheDir, { recursive: true }) } catch {}
  const hash = gevonden.hash || crypto.createHash('md5').update(gevonden.bron).digest('hex')
  const uitPad = path.join(cacheDir, `${hash}.ico`)
  if (fs.existsSync(uitPad)) return uitPad
  return bitmapNaarIco(gevonden.bron, uitPad)
}

function veiligeBestandsnaam(naam) {
  return String(naam || 'app').replace(/[\\/:*?"<>|]/g, '').trim() || 'app'
}

async function maakSnelkoppeling({ desktopPad, naam, exePad, iconPad }) {
  const lnkPad = path.join(desktopPad, `${veiligeBestandsnaam(naam)}.lnk`)
  const iconRegel = iconPad ? `$s.IconLocation = '${q(iconPad)},0'` : ''
  const script = [
    '$w = New-Object -ComObject WScript.Shell',
    `$s = $w.CreateShortcut('${q(lnkPad)}')`,
    `$s.TargetPath = '${q(exePad)}'`,
    `$s.WorkingDirectory = '${q(path.dirname(exePad))}'`,
    iconRegel,
    '$s.Save()',
  ].filter(Boolean).join('; ')
  const ok = await draaiPowershell(script)
  return ok && fs.existsSync(lnkPad) ? lnkPad : null
}

// Verwerkt één regel commando-uitvoer. Levert alleen iets op als die regel de
// "Built ...exe"-melding was én de exe echt bestaat.
async function verwerkRegel(regel, { cwd, flutterWortel, projectIcoon, desktopPad, cacheDir } = {}) {
  const rel = vindGebouwdeExe(regel)
  if (!rel || !cwd || !desktopPad) return null
  const exePad = path.resolve(cwd, rel)
  if (!fs.existsSync(exePad)) return null

  const gevonden = projectIcoon.zoekProjectIcoon(cwd, { flutterWortel })
  const iconPad = await icoonBestandVoor(gevonden, cacheDir)
  const naam = path.basename(exePad, '.exe')
  const lnkPad = await maakSnelkoppeling({ desktopPad, naam, exePad, iconPad })

  return lnkPad ? { lnkPad, exePad, iconPad, iconGevonden: !!(gevonden && gevonden.ok) } : null
}

module.exports = {
  GEBOUWD_REGEX,
  vindGebouwdeExe,
  bitmapNaarIco,
  icoonBestandVoor,
  veiligeBestandsnaam,
  maakSnelkoppeling,
  verwerkRegel,
}
