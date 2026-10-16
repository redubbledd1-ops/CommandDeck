// Release-logica: versies, projecttype, changelog, controles en stappen
const path = require('path')
const R = require(path.join(__dirname, '..', 'src', 'release-tools.js'))

let ok = true
const t = (l, c) => { console.log((c ? 'PASS  ' : 'FAIL  ') + l); if (!c) ok = false }
const is = (l, a, b) => { const g = JSON.stringify(a) === JSON.stringify(b); t(l + (g ? '' : `  (kreeg ${JSON.stringify(a)}, verwacht ${JSON.stringify(b)})`), g) }

// ── versies ──────────────────────────────────────────────────────────────────
is('patch', R.verhoogVersie('1.0.12', 'patch'), '1.0.13')
is('minor zet patch op 0', R.verhoogVersie('1.4.9', 'minor'), '1.5.0')
is('major zet minor en patch op 0', R.verhoogVersie('1.4.9', 'major'), '2.0.0')
is('buildnummer gaat mee omhoog', R.verhoogVersie('1.2.3+4', 'patch'), '1.2.4+5')
is('onbekende soort geeft null', R.verhoogVersie('1.0.0', 'groot'), null)
is('rare versie geeft null', R.verhoogVersie('abc', 'patch'), null)
is('tag zonder buildnummer', R.tagNaam('1.2.4+5'), 'v1.2.4')
is('kale versie', R.kaleVersie('1.2.4+5'), '1.2.4')
t('geldige versie', R.geldigeVersie('10.20.30') && R.geldigeVersie('1.2.3+7'))
t('ongeldige versies', !R.geldigeVersie('1.2') && !R.geldigeVersie('1.2.3; calc') && !R.geldigeVersie('') && !R.geldigeVersie(null))

// ── type herkennen ───────────────────────────────────────────────────────────
is('electron', R.detecteerType({ pkg: { devDependencies: { electron: '^41' } } }), 'electron')
is('electron via builder', R.detecteerType({ pkg: { devDependencies: { 'electron-builder': '^26' } } }), 'electron')
is('node', R.detecteerType({ pkg: { dependencies: { express: '4' } } }), 'node')
is('flutter', R.detecteerType({ pubspec: 'name: x\ndependencies:\n  flutter:\n    sdk: flutter\n' }), 'flutter')
is('extensie', R.detecteerType({ manifest: { manifest_version: 3, version: '1.0.0' } }), 'extensie')
is('onbekend', R.detecteerType({}), 'onbekend')
is('electron wint van flutter-achtige tekst', R.detecteerType({ pkg: { devDependencies: { electron: '1' } }, pubspec: 'flutter:\n sdk: flutter' }), 'electron')

// ── versie lezen en schrijven ────────────────────────────────────────────────
is('versie uit package.json', R.leesVersie('electron', { pkg: { version: '1.0.12' } }), '1.0.12')
is('versie uit pubspec', R.leesVersie('flutter', { pubspec: 'name: a\nversion: 2.0.1+9 # tekst\n' }), '2.0.1+9')
is('versie uit manifest', R.leesVersie('extensie', { manifest: { version: '0.9.0' } }), '0.9.0')
is('pubspec schrijven', R.zetVersieInTekst('flutter', 'name: a\nversion: 2.0.1+9\nfoo: 1\n', '2.0.2+10'), 'name: a\nversion: 2.0.2+10\nfoo: 1\n')
is('manifest schrijven laat opmaak staan',
  R.zetVersieInTekst('extensie', '{\n  "name": "x",\n  "version": "1.0.0",\n  "manifest_version": 3\n}', '1.0.1'),
  '{\n  "name": "x",\n  "version": "1.0.1",\n  "manifest_version": 3\n}')
is('schrijven weigert rare versie', R.zetVersieInTekst('flutter', 'version: 1.0.0', '1.0.0; rm'), null)
is('schrijven zonder versieregel geeft null', R.zetVersieInTekst('flutter', 'name: a', '1.0.1'), null)

// ── changelog ────────────────────────────────────────────────────────────────
is('changelog laat ruis weg',
  R.changelogConcept(['1.0.12', 'Fix xterm path', 'wijziging in renderer.js', 'wijzigingen in 7 bestanden (a.js, +5)', 'Merge branch x', 'Fix xterm path', 'WIP']),
  '- Fix xterm path')
is('changelog leeg als alles ruis is', R.changelogConcept(['v1.0.1', 'wijziging in a.js']), '')
is('changelog met max', R.changelogConcept(['a', 'b', 'c'], { max: 2 }), '- a\n- b')

// ── updates in het programma (Electron) ──────────────────────────────────────
const goed = {
  dependencies: { 'electron-updater': '^6' },
  build: { publish: { provider: 'github', owner: 'Jan', repo: 'App' }, win: { target: [{ target: 'nsis' }, { target: 'portable' }] } },
}
const rem = { owner: 'jan', repo: 'app' }
const gr = (o) => R.electronGereedheid(o)
t('alles goed: updates mogelijk', R.updatesMogelijk(gr({ pkg: goed, updaterGeinstalleerd: true, gebruiktUpdater: true, remote: rem })))
t('updater niet geïnstalleerd', !R.updatesMogelijk(gr({ pkg: goed, updaterGeinstalleerd: false, gebruiktUpdater: true, remote: rem })))
t('updater niet in package.json', !R.updatesMogelijk(gr({ pkg: { ...goed, dependencies: {} }, updaterGeinstalleerd: true, remote: rem })))
t('publish ontbreekt', !R.updatesMogelijk(gr({ pkg: { ...goed, build: {} }, updaterGeinstalleerd: true, remote: rem })))
t('publish wijst naar andere repo', !R.updatesMogelijk(gr({ pkg: goed, updaterGeinstalleerd: true, remote: { owner: 'jan', repo: 'ander' } })))
t('alleen portable geeft geen latest.yml',
  !R.updatesMogelijk(gr({ pkg: { ...goed, build: { ...goed.build, win: { target: ['portable'] } } }, updaterGeinstalleerd: true, remote: rem })))
t('geen win-target: nsis is de standaard',
  R.updatesMogelijk(gr({ pkg: { ...goed, build: { publish: goed.build.publish } }, updaterGeinstalleerd: true, remote: rem })))
t('code zonder updater is alleen een waarschuwing',
  R.updatesMogelijk(gr({ pkg: goed, updaterGeinstalleerd: true, gebruiktUpdater: false, remote: rem })) &&
  gr({ pkg: goed, updaterGeinstalleerd: true, gebruiktUpdater: false, remote: rem }).some(c => c.id === 'updaterGebruikt' && !c.ok))
is('repo uit https-url', R.githubRepoUitUrl('https://github.com/redubbledd1-ops/CommandDeck.git'), { owner: 'redubbledd1-ops', repo: 'CommandDeck' })
is('repo uit ssh-url', R.githubRepoUitUrl('git@github.com:a/b.git'), { owner: 'a', repo: 'b' })
is('geen github-url', R.githubRepoUitUrl('https://gitlab.com/a/b'), null)

// ── blokkades ────────────────────────────────────────────────────────────────
const prima = { isRepo: true, remote: { owner: 'a', repo: 'b' }, branch: 'main', schoon: true, upstream: 'origin/main', ahead: 0, behind: 0, gh: 'ok', tags: ['v1.0.0'] }
const ids = (i, n) => R.blokkades(i, n).map(b => b.id)
is('niets in de weg', ids(prima, '1.0.1'), [])
is('geen repo', ids({ isRepo: false }), ['geenRepo'])
is('vuile werkmap', ids({ ...prima, schoon: false }, '1.0.1'), ['vuil'])
is('verkeerde branch', ids({ ...prima, branch: 'dev' }, '1.0.1'), ['verkeerdeBranch'])
is('niet gepusht', ids({ ...prima, ahead: 2 }, '1.0.1'), ['nietGepusht'])
is('achterlopen', ids({ ...prima, behind: 1 }, '1.0.1'), ['achter'])
is('gh niet ingelogd', ids({ ...prima, gh: 'uit' }, '1.0.1'), ['ghUit'])
is('gh ontbreekt', ids({ ...prima, gh: 'ontbreekt' }, '1.0.1'), ['ghOntbreekt'])
is('tag bestaat al', ids(prima, '1.0.0'), ['tagBestaat'])
is('zonder upstream', ids({ ...prima, upstream: '' }, '1.0.1'), ['geenUpstream'])
is('fetch mislukt', ids({ ...prima, fetchMislukt: true }, '1.0.1'), ['fetchMislukt'])
is('zonder nieuwe versie wordt de tag niet gecontroleerd', ids(prima), [])
is('ontbrekende dependencies houden de release tegen', ids({ ...prima, ontbreekt: ['electron-updater'] }, '1.0.1'), ['afhankelijkheden'])

// ── stappen ──────────────────────────────────────────────────────────────────
const cmds = (s) => s.map(x => x.cmd || '[intern]')
const el = R.bouwStappen({ type: 'electron', nieuw: '1.0.13', versieBestanden: ['package.json', 'package-lock.json'], notesPad: 'C:\\tmp\\n.md' })
is('electron-stappen', el.map(s => s.id), ['versie', 'add', 'commit', 'tag', 'push', 'release', 'bouw', 'controle'])
t('electron: npm version zonder hooks en zonder eigen tag', el[0].cmd === 'npm version 1.0.13 --no-git-tag-version --ignore-scripts')
t('electron: beide bestanden toegevoegd', el[1].cmd === 'git add -- "package.json" "package-lock.json"')
t('electron: bouwen krijgt token', el.find(s => s.id === 'bouw').tokenNodig === true)
t('electron: release via bestand, niet via tekst', el.find(s => s.id === 'release').cmd.includes('--notes-file "C:\\tmp\\n.md"'))
is('electron zonder bouwen', R.bouwStappen({ type: 'electron', nieuw: '1.0.13', notesPad: 'x', bouwen: false }).map(s => s.id), ['versie', 'add', 'commit', 'tag', 'push', 'release'])
const fl = R.bouwStappen({ type: 'flutter', nieuw: '1.2.4+5', notesPad: 'x' })
is('flutter-stappen', fl.map(s => s.id), ['versie', 'add', 'commit', 'tag', 'push', 'release', 'bouw', 'upload'])
t('flutter: tag zonder buildnummer', fl.find(s => s.id === 'tag').cmd === 'git tag -a v1.2.4 -m "v1.2.4"')
t('flutter: versie intern geschreven', fl[0].intern && fl[0].intern.bestand === 'pubspec.yaml' && fl[0].intern.nieuw === '1.2.4+5')
is('onbekend type: alleen tag en release', R.bouwStappen({ type: 'onbekend', nieuw: '0.1.0', notesPad: 'x' }).map(s => s.id), ['tag', 'push', 'release'])
is('ongeldige versie geeft geen stappen', R.bouwStappen({ type: 'electron', nieuw: '1.0; calc', notesPad: 'x' }), [])
t('geen enkel commando bevat een bron buiten de whitelist',
  cmds([...el, ...fl]).every(c => /^(npm version|git |gh release|npx electron-builder|flutter build|\[intern\])/.test(c)))

// ── tips bij een mislukte stap ───────────────────────────────────────────────
t('tip bij mislukte push noemt de lokale tag', R.afmaakTip(el, 'push').includes('v1.0.13') && R.afmaakTip(el, 'push').includes('git push --follow-tags'))
t('tip na de push noemt de stap zelf', R.afmaakTip(el, 'bouw').includes('npx electron-builder'))
t('tip voor de push zegt dat er niets gepusht is', R.afmaakTip(el, 'versie').includes('nog niets gepusht'))
is('tip bij onbekende stap', R.afmaakTip(el, 'bestaatniet'), '')
// Een release zonder bestanden blokkeert de update-melding van iedereen
t('mislukt bouwen: terug naar concept', R.TERUG_NAAR_CONCEPT.includes('bouw') && R.TERUG_NAAR_CONCEPT.includes('controle'))
t('maar niet als de release zelf al mislukt', !R.TERUG_NAAR_CONCEPT.includes('release') && !R.TERUG_NAAR_CONCEPT.includes('push'))
is('concept-commando', R.conceptCommando('v1.0.14'), 'gh release edit v1.0.14 --draft')
is('publiceer-commando', R.publiceerCommando('v1.0.14'), 'gh release edit v1.0.14 --draft=false --latest')
t('tip bij mislukt bouwen zegt hoe je publiceert', R.afmaakTip(el, 'bouw').includes('gh release edit v1.0.13 --draft=false --latest') && R.afmaakTip(el, 'bouw').includes('concept'))
t('controle van latest.yml hoort bij electron', el.find(s => s.id === 'controle').intern.verwacht[0] === 'latest.yml')
t('flutter heeft geen latest.yml-controle', !fl.some(s => s.id === 'controle'))

if (!ok) { console.log('\n✗ ER ZIJN TESTS GEFAALD'); process.exit(1) }
console.log('\n✓ alle release-tests geslaagd')
