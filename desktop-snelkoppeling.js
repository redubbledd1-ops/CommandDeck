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
//
// Niet via Bitmap.GetHicon() + Icon.Save(): die route levert één formaat, en
// Icon.Save schrijft een icoon dat uit een handle komt weg als 16-kleuren
// bitmap. Windows moet dat dan zelf op- of afschalen en het resultaat is
// korrelig en pixelig. Hier schalen we de bron zelf (bicubic, met behoud van
// transparantie) naar elk formaat dat Windows gebruikt — van 16px in een lijst
// tot 256px op een groot bureaublad — en schrijven die als 32-bit PNG's in één
// .ico. Dan kiest Windows per plek het passende formaat en hoeft niets te
// rekken.
const ICO_MATEN = [16, 20, 24, 32, 40, 48, 64, 96, 128, 256]

async function bitmapNaarIco(bronPad, uitPad) {
  const script = [
    'Add-Type -AssemblyName System.Drawing',
    `$src = [System.Drawing.Image]::FromFile('${q(bronPad)}')`,
    `$maten = @(${ICO_MATEN.join(',')})`,
    '$pngs = @()',
    'foreach ($n in $maten) {',
    '  $bmp = New-Object System.Drawing.Bitmap($n, $n, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)',
    '  $g = [System.Drawing.Graphics]::FromImage($bmp)',
    '  $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic',
    '  $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality',
    '  $g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality',
    '  $g.CompositingQuality = [System.Drawing.Drawing2D.CompositingQuality]::HighQuality',
    '  $g.Clear([System.Drawing.Color]::Transparent)',
    // Niet-vierkante bron: passend maken en centreren in plaats van uitrekken.
    '  $s = [Math]::Min($n / $src.Width, $n / $src.Height)',
    '  $w = [Math]::Max(1, [int][Math]::Round($src.Width * $s))',
    '  $h = [Math]::Max(1, [int][Math]::Round($src.Height * $s))',
    '  $doel = New-Object System.Drawing.Rectangle([int][Math]::Floor(($n - $w) / 2), [int][Math]::Floor(($n - $h) / 2), $w, $h)',
    // TileFlipXY voorkomt de lichte rand die bicubic anders langs de kanten trekt.
    '  $ia = New-Object System.Drawing.Imaging.ImageAttributes',
    '  $ia.SetWrapMode([System.Drawing.Drawing2D.WrapMode]::TileFlipXY)',
    '  $g.DrawImage($src, $doel, 0, 0, $src.Width, $src.Height, [System.Drawing.GraphicsUnit]::Pixel, $ia)',
    '  $g.Dispose(); $ia.Dispose()',
    '  $ms = New-Object System.IO.MemoryStream',
    '  $bmp.Save($ms, [System.Drawing.Imaging.ImageFormat]::Png)',
    '  $bmp.Dispose()',
    '  $pngs += ,$ms.ToArray()',
    '}',
    '$src.Dispose()',
    // ICO-opmaak: ICONDIR (6 bytes), per formaat een ICONDIRENTRY (16 bytes),
    // daarna de PNG-data. 256 wordt als 0 genoteerd.
    `$fs = [System.IO.File]::Create('${q(uitPad)}')`,
    '$bw = New-Object System.IO.BinaryWriter($fs)',
    '$bw.Write([UInt16]0); $bw.Write([UInt16]1); $bw.Write([UInt16]$maten.Count)',
    '$off = 6 + 16 * $maten.Count',
    'for ($i = 0; $i -lt $maten.Count; $i++) {',
    '  $d = if ($maten[$i] -ge 256) { 0 } else { $maten[$i] }',
    '  $bw.Write([Byte]$d); $bw.Write([Byte]$d); $bw.Write([Byte]0); $bw.Write([Byte]0)',
    '  $bw.Write([UInt16]1); $bw.Write([UInt16]32)',
    '  $bw.Write([UInt32]$pngs[$i].Length); $bw.Write([UInt32]$off)',
    '  $off += $pngs[$i].Length',
    '}',
    'foreach ($p in $pngs) { $bw.Write($p) }',
    '$bw.Close()',
  ].join('\n')
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
  // -hq: iconen uit de oude, pixelige omzetting staan onder de kale hash in de
  // cache en mogen niet meer hergebruikt worden.
  const uitPad = path.join(cacheDir, `${hash}-hq.ico`)
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
