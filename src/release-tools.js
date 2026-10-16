// Alles wat over een versie uitbrengen gaat en zonder Electron te testen is.
//
// Net als git-tools.js wordt dit bestand op twee plekken geladen:
//   - main.js en de tests via require()
//   - index.html via een <script>-tag, waarna het als ReleaseTools klaarstaat
//
// Het idee: één release-knop voor elk project dat via CommandDeck wordt
// gemaakt. Wat voor elk project gelijk is (controles, versie ophogen, tag,
// push, GitHub Release met changelog) staat hier één keer. Wat per type
// verschilt (waar de versie staat, hoe je bouwt, wat je uploadt) is een recept.
//
// De stappen die hier worden samengesteld bevatten nooit tekst die de
// gebruiker typte: de versie komt uit een vaste regex, de changelog gaat via
// een bestand. Zo kan een changelog met een aanhalingsteken of een & het
// commando niet veranderen.
;(function (root, factory) {
  const api = factory()
  if (typeof module === 'object' && module.exports) module.exports = api
  else root.ReleaseTools = api
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {

  const SOORTEN = ['patch', 'minor', 'major']
  const VERSIE_RE = /^(\d+)\.(\d+)\.(\d+)(?:\+(\d+))?$/
  const HOOFD_BRANCHES = ['main', 'master']

  // ── Versies ─────────────────────────────────────────────────────────────────

  // "1.2.3" of, zoals Flutter het schrijft, "1.2.3+4" (met buildnummer).
  function parseVersie(v) {
    const m = VERSIE_RE.exec(String(v == null ? '' : v).trim())
    if (!m) return null
    return {
      major: parseInt(m[1], 10), minor: parseInt(m[2], 10), patch: parseInt(m[3], 10),
      bouw: m[4] === undefined ? null : parseInt(m[4], 10),
    }
  }

  const geldigeVersie = (v) => !!parseVersie(v)

  // Zonder buildnummer: dit is wat in de tag en de titel van de release komt.
  function kaleVersie(v) {
    const p = parseVersie(v)
    return p ? `${p.major}.${p.minor}.${p.patch}` : ''
  }

  const tagNaam = (v) => (kaleVersie(v) ? 'v' + kaleVersie(v) : '')

  // Een buildnummer gaat altijd mee omhoog: Android weigert een update met
  // hetzelfde versionCode, ook als de versie zelf is opgehoogd.
  function verhoogVersie(huidig, soort) {
    const p = parseVersie(huidig)
    if (!p || !SOORTEN.includes(soort)) return null
    let { major, minor, patch } = p
    if (soort === 'major') { major++; minor = 0; patch = 0 }
    else if (soort === 'minor') { minor++; patch = 0 }
    else patch++
    const kaal = `${major}.${minor}.${patch}`
    return p.bouw === null ? kaal : `${kaal}+${p.bouw + 1}`
  }

  // ── Het projecttype herkennen ───────────────────────────────────────────────
  // `bestanden`: { pkg, pubspec, manifest } — de geparste package.json, de
  // tekst van pubspec.yaml en de geparste manifest.json (of null).

  function detecteerType(bestanden) {
    const b = bestanden || {}
    const pkg = b.pkg
    const deps = pkg ? { ...(pkg.dependencies || {}), ...(pkg.devDependencies || {}) } : {}
    if (pkg && ('electron' in deps || 'electron-builder' in deps)) return 'electron'
    if (typeof b.pubspec === 'string' && /^\s*flutter\s*:/m.test(b.pubspec) && /sdk\s*:\s*flutter/.test(b.pubspec)) return 'flutter'
    if (b.manifest && typeof b.manifest === 'object' && b.manifest.manifest_version) return 'extensie'
    if (pkg) return 'node'
    return 'onbekend'
  }

  // Waar de versie van dit type staat.
  const VERSIE_BESTAND = {
    electron: 'package.json',
    node: 'package.json',
    flutter: 'pubspec.yaml',
    extensie: 'manifest.json',
  }

  function leesVersie(type, bestanden) {
    const b = bestanden || {}
    if (type === 'electron' || type === 'node') return b.pkg && b.pkg.version ? String(b.pkg.version) : null
    if (type === 'flutter') {
      const m = /^version\s*:\s*([^\s#]+)/m.exec(b.pubspec || '')
      return m ? m[1] : null
    }
    if (type === 'extensie') return b.manifest && b.manifest.version ? String(b.manifest.version) : null
    return null
  }

  // De nieuwe versie in de tekst van een versiebestand zetten, zonder de rest
  // van de opmaak aan te raken. Geeft null als de regel er niet in staat.
  function zetVersieInTekst(type, tekst, nieuw) {
    if (!geldigeVersie(nieuw) || typeof tekst !== 'string') return null
    if (type === 'flutter') {
      const re = /^(version\s*:\s*)[^\s#]+/m
      return re.test(tekst) ? tekst.replace(re, (_, vooraf) => vooraf + nieuw) : null
    }
    if (type === 'extensie' || type === 'node' || type === 'electron') {
      const re = /("version"\s*:\s*")[^"]*(")/
      return re.test(tekst) ? tekst.replace(re, (_, a, b) => a + nieuw + b) : null
    }
    return null
  }

  // ── De changelog ────────────────────────────────────────────────────────────
  // Een eerste concept uit de onderwerpen van de commits sinds de vorige tag.
  // Niet alles hoort erin: versiecommits zeggen niets, en de bericht-vulling
  // die CommandDeck zelf maakt ("wijziging in renderer.js") ook niet.

  const RUIS = [
    /^v?\d+\.\d+\.\d+([-+].*)?$/i,          // "1.0.12" of "v1.0.12"
    /^merge\b/i,
    /^wijziging(en)? in\b/i,                  // automatisch commitbericht
    /^wip\b/i,
  ]

  const isRuis = (onderwerp) => RUIS.some(re => re.test(String(onderwerp || '').trim()))

  function changelogConcept(onderwerpen, { max = 30 } = {}) {
    const gezien = new Set()
    const regels = []
    for (const o of onderwerpen || []) {
      const tekst = String(o || '').trim()
      if (!tekst || isRuis(tekst)) continue
      const sleutel = tekst.toLowerCase()
      if (gezien.has(sleutel)) continue
      gezien.add(sleutel)
      regels.push('- ' + tekst)
      if (regels.length >= max) break
    }
    return regels.join('\n')
  }

  // ── Kan deze app updates ontvangen? (Electron) ──────────────────────────────
  // Een release zet de bestanden op GitHub. Of mensen de update in het
  // programma zelf zien, hangt af van de app: die moet electron-updater
  // meebrengen, naar de goede repo kijken en een installer krijgen die een
  // latest.yml oplevert. Dat laatste ging eerder mis (1.0.2 ging zonder
  // updater de deur uit), dus dat controleren we vóór we iets uitbrengen.
  //
  // `niveau` 'fout' = de app zal deze update niet te zien krijgen;
  // 'waarschuwing' = waarschijnlijk niet goed, maar niet zeker.

  function githubRepoUitUrl(url) {
    const m = /github\.com[:/]+([^/\s]+)\/([^/\s]+?)(?:\.git)?\/?\s*$/i.exec(String(url || '').trim())
    return m ? { owner: m[1], repo: m[2] } : null
  }

  function publishGithub(pkg) {
    const p = pkg && pkg.build && pkg.build.publish
    const lijst = Array.isArray(p) ? p : (p ? [p] : [])
    return lijst.find(x => x && x.provider === 'github') || null
  }

  function winTargets(pkg) {
    const t = pkg && pkg.build && pkg.build.win && pkg.build.win.target
    if (!t) return null                      // niet ingesteld: electron-builder neemt nsis
    return (Array.isArray(t) ? t : [t]).map(x => String(typeof x === 'string' ? x : (x && x.target) || '').toLowerCase())
  }

  function electronGereedheid({ pkg, updaterGeinstalleerd = false, gebruiktUpdater = false, remote = null } = {}) {
    const uit = []
    const deps = (pkg && pkg.dependencies) || {}
    const zet = (id, ok, niveau, vars) => uit.push({ id, ok: !!ok, niveau, vars: vars || {} })

    zet('updaterPakket', 'electron-updater' in deps && updaterGeinstalleerd, 'fout',
      { ontbreektInPackage: !('electron-updater' in deps), nietGeinstalleerd: ('electron-updater' in deps) && !updaterGeinstalleerd })

    const pub = publishGithub(pkg)
    zet('publish', !!(pub && pub.owner && pub.repo), 'fout')

    if (pub && pub.owner && pub.repo && remote) {
      const zelfde = pub.owner.toLowerCase() === remote.owner.toLowerCase()
        && pub.repo.toLowerCase() === remote.repo.toLowerCase()
      zet('publishRepo', zelfde, 'fout', { publish: `${pub.owner}/${pub.repo}`, remote: `${remote.owner}/${remote.repo}` })
    }

    const targets = winTargets(pkg)
    zet('installer', targets === null || targets.includes('nsis'), 'fout')

    zet('updaterGebruikt', gebruiktUpdater, 'waarschuwing')
    return uit
  }

  // Alles wat in orde moet zijn om gebruikers de update in het programma te
  // laten zien. Een waarschuwing telt niet mee.
  const updatesMogelijk = (checks) => (checks || []).every(c => c.ok || c.niveau !== 'fout')

  // ── Wat de release tegenhoudt ───────────────────────────────────────────────
  // `info` komt uit main (release:info). Elke blokkade heeft een id; de tekst
  // erbij staat in de taalbestanden onder release.blok.<id>.

  function blokkades(info, nieuw) {
    const b = []
    const i = info || {}
    if (!i.isRepo) { b.push({ id: 'geenRepo' }); return b }
    if (!i.remote) b.push({ id: 'geenRemote' })
    if (i.branch && !HOOFD_BRANCHES.includes(i.branch)) b.push({ id: 'verkeerdeBranch', vars: { branch: i.branch } })
    if (!i.schoon) b.push({ id: 'vuil' })
    if (i.remote && !i.upstream) b.push({ id: 'geenUpstream', vars: { branch: i.branch || '?' } })
    if (i.fetchMislukt) b.push({ id: 'fetchMislukt' })
    if (i.upstream && i.ahead > 0) b.push({ id: 'nietGepusht', vars: { aantal: i.ahead } })
    if (i.upstream && i.behind > 0) b.push({ id: 'achter', vars: { aantal: i.behind } })
    if (i.ontbreekt && i.ontbreekt.length) b.push({ id: 'afhankelijkheden', vars: { lijst: i.ontbreekt.join(', ') } })
    if (i.gh === 'ontbreekt') b.push({ id: 'ghOntbreekt' })
    else if (i.gh !== 'ok') b.push({ id: 'ghUit' })
    if (nieuw !== undefined) {
      if (!nieuw) b.push({ id: 'geenVersie' })
      else if ((i.tags || []).includes(tagNaam(nieuw))) b.push({ id: 'tagBestaat', vars: { tag: tagNaam(nieuw) } })
    }
    return b
  }

  // ── De stappen ──────────────────────────────────────────────────────────────
  // Elke stap is een commando (`cmd`) of een interne actie (`intern`). Stappen
  // met `tokenNodig` krijgen het GitHub-token van `gh auth token` mee in hun
  // omgeving; dat token komt nooit in een commando of in de uitvoer.

  const HEEFT_BOUWEN = ['electron', 'flutter']

  function bouwStappen({ type, nieuw, versieBestanden = [], notesPad, bouwen = true } = {}) {
    if (!geldigeVersie(nieuw)) return []
    const kaal = kaleVersie(nieuw)
    const tag = tagNaam(nieuw)
    const stappen = []
    const heeftVersieBestand = !!VERSIE_BESTAND[type]

    if (heeftVersieBestand) {
      if (type === 'electron' || type === 'node') {
        stappen.push({ id: 'versie', label: `versie ophogen naar ${nieuw}`,
          cmd: `npm version ${nieuw} --no-git-tag-version --ignore-scripts` })
      } else {
        stappen.push({ id: 'versie', label: `versie ophogen naar ${nieuw}`,
          intern: { actie: 'schrijfVersie', bestand: VERSIE_BESTAND[type], type, nieuw } })
      }
      const bestanden = versieBestanden.length ? versieBestanden : [VERSIE_BESTAND[type]]
      stappen.push({ id: 'add', label: 'versiebestand klaarzetten',
        cmd: `git add -- ${bestanden.map(f => `"${f}"`).join(' ')}` })
      stappen.push({ id: 'commit', label: `commit "${kaal}"`, cmd: `git commit -m "${kaal}"` })
    }
    stappen.push({ id: 'tag', label: `tag ${tag}`, cmd: `git tag -a ${tag} -m "${tag}"` })
    stappen.push({ id: 'push', label: 'pushen naar GitHub', cmd: 'git push --follow-tags' })
    stappen.push({ id: 'release', label: `GitHub Release ${tag} aanmaken`, tokenNodig: true,
      cmd: `gh release create ${tag} --verify-tag --title "${kaal}" --notes-file "${notesPad}"` })

    if (bouwen && type === 'electron') {
      stappen.push({ id: 'bouw', label: 'bouwen en uploaden (electron-builder)', tokenNodig: true,
        env: { CSC_IDENTITY_AUTO_DISCOVERY: 'false' },
        cmd: 'npx electron-builder --win --x64 --publish always' })
    } else if (bouwen && type === 'flutter') {
      stappen.push({ id: 'bouw', label: 'apk bouwen', cmd: 'flutter build apk --release' })
      stappen.push({ id: 'upload', label: 'apk uploaden', tokenNodig: true,
        cmd: `gh release upload ${tag} "build\\app\\outputs\\flutter-apk\\app-release.apk" --clobber` })
    }
    return stappen
  }

  // Wat je moet weten als een stap faalt: wat er al wel gebeurd is, en wat je
  // zelf nog kunt doen. De release is geen transactie; vanaf de push staat de
  // versie online.
  function afmaakTip(stappen, mislukteId) {
    const lijst = stappen || []
    const idx = lijst.findIndex(s => s.id === mislukteId)
    if (idx < 0) return ''
    const stap = lijst[idx]
    const naPush = idx > lijst.findIndex(s => s.id === 'push')
    const tag = (lijst.find(s => s.id === 'tag') || {}).cmd
    const tagTekst = tag ? (/(v\d+\.\d+\.\d+)/.exec(tag) || [])[1] : ''
    if (stap.id === 'push') {
      return `De versie is lokaal opgehoogd, gecommit en getagd (${tagTekst}), maar niet gepusht. Los het probleem op en draai zelf: git push --follow-tags`
    }
    if (naPush) {
      return `${tagTekst} staat al op GitHub. Los het probleem op en draai de stap zelf opnieuw: ${stap.cmd}`
    }
    return 'Er is nog niets gepusht. Los het probleem op en probeer opnieuw; kijk met git status wat er lokaal al is veranderd.'
  }

  return {
    SOORTEN, HOOFD_BRANCHES, HEEFT_BOUWEN, VERSIE_BESTAND,
    parseVersie, geldigeVersie, kaleVersie, tagNaam, verhoogVersie,
    detecteerType, leesVersie, zetVersieInTekst,
    isRuis, changelogConcept,
    githubRepoUitUrl, electronGereedheid, updatesMogelijk,
    blokkades, bouwStappen, afmaakTip,
  }
})
