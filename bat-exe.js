// SED-bestanden voor IExpress.
//
// IExpress (iexpress.exe, staat standaard in System32) maakt van een set
// bestanden een zelfuitpakkende .exe die na het uitpakken een commando start.
// Het gedrag wordt gestuurd door een SED-bestand: een INI-achtig configuratie-
// bestand dat de wizard normaal zelf schrijft.
//
// Twee eigenaardigheden waar dit omheen werkt:
//
//  1. AppLaunched kan een .bat niet rechtstreeks starten — dat levert
//     "Error creating process". Daarom gaat het via `cmd.exe /c`.
//  2. IExpress loopt vast op bronpaden met spaties. De aanroeper bouwt daarom
//     in een tijdelijke map met een kort, spatieloos pad en kopieert het
//     resultaat achteraf naar de gewenste plek.
//
// Wat je krijgt is een wrapper, geen compilatie: het script wordt bij het
// starten naar %TEMP% uitgepakt en daar gedraaid.

// Waarden in de [Strings]-sectie mogen geen regeleindes of aanhalingstekens
// bevatten; die zouden het INI-formaat breken.
function sanitizeString(v) {
  return String(v == null ? '' : v).replace(/[\r\n]+/g, ' ').replace(/"/g, "'").trim()
}

/**
 * Bouwt de inhoud van een SED-bestand.
 *
 * @param {object} o
 * @param {string} o.workDir       map met het bat-bestand (zonder spaties!)
 * @param {string} o.batName       bestandsnaam van het script in workDir
 * @param {string} o.exePath       volledig pad van de te maken .exe
 * @param {string} [o.friendlyName] titel in de vensters van het installatieproces
 * @param {boolean} [o.hideWindow] venster van het script verbergen
 * @param {boolean} [o.admin]      beheerdersrechten vragen bij het starten
 */
function buildSed(o = {}) {
  const workDir  = String(o.workDir || '').replace(/[\\/]+$/, '')
  const batName  = sanitizeString(o.batName)
  const exePath  = sanitizeString(o.exePath)
  const friendly = sanitizeString(o.friendlyName || batName.replace(/\.(bat|cmd)$/i, '')) || 'script'

  if (!workDir) throw new Error('workDir ontbreekt')
  if (!batName) throw new Error('batName ontbreekt')
  if (!exePath) throw new Error('exePath ontbreekt')
  if (/\s/.test(workDir)) throw new Error('workDir mag geen spaties bevatten — IExpress struikelt daarover')

  return [
    '[Version]',
    'Class=IEXPRESS',
    'SEDVersion=3',
    '[Options]',
    'PackagePurpose=InstallApp',
    // 0 = normaal venster. Verbergen kan, maar een script met `pause` blijft dan
    // onzichtbaar wachten, dus dat is standaard uit.
    `ShowInstallProgramWindow=${o.hideWindow ? 1 : 0}`,
    'HideExtractAnimation=1',
    'UseLongFileName=1',
    'InsideCompressed=0',
    'CAB_FixedSize=0',
    'CAB_ResvCodeSigning=0',
    'RebootMode=N',
    `CheckAdminRights=${o.admin ? 1 : 0}`,
    'InstallPrompt=%InstallPrompt%',
    'DisplayLicense=%DisplayLicense%',
    'FinishMessage=%FinishMessage%',
    'TargetName=%TargetName%',
    'FriendlyName=%FriendlyName%',
    'AppLaunched=%AppLaunched%',
    'PostInstallCmd=%PostInstallCmd%',
    'AdminQuietInstCmd=%AdminQuietInstCmd%',
    'UserQuietInstCmd=%UserQuietInstCmd%',
    'SourceFiles=SourceFiles',
    '[Strings]',
    // Leeg = geen vraag vooraf, geen licentiescherm, geen melding achteraf.
    'InstallPrompt=',
    'DisplayLicense=',
    'FinishMessage=',
    `TargetName=${exePath}`,
    `FriendlyName=${friendly}`,
    // De omweg voor de bat-beperking van AppLaunched
    `AppLaunched=cmd.exe /c "${batName}"`,
    'PostInstallCmd=<None>',
    'AdminQuietInstCmd=',
    'UserQuietInstCmd=',
    `FILE0="${batName}"`,
    '[SourceFiles]',
    `SourceFiles0=${workDir}\\`,
    '[SourceFiles0]',
    '%FILE0%=',
    '',
  ].join('\r\n')
}

module.exports = { buildSed, sanitizeString }
