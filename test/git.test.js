const fs = require('fs'), path = require('path')
const G = require('../git-tools')

let ok = true
const t = (l, c) => { console.log((c ? 'PASS  ' : 'FAIL  ') + l); if (!c) ok = false }
const gelijk = (l, a, b) => t(l + '  (' + JSON.stringify(a) + ')', JSON.stringify(a) === JSON.stringify(b))

// ── uitvoer van git lezen ────────────────────────────────────────────────────
gelijk('remotes: één remote', G.parseRemotes('origin\n'), ['origin'])
gelijk('remotes: meerdere', G.parseRemotes('origin\nupstream\n'), ['origin', 'upstream'])
gelijk('remotes: geen enkele', G.parseRemotes(''), [])
gelijk('remotes: alleen witruimte', G.parseRemotes('\n  \n'), [])

t('branch: gewone naam', G.parseBranch('main\n') === 'main')
t('branch: master telt ook', G.parseBranch('master\n') === 'master')
t('branch: detached HEAD geeft null', G.parseBranch('HEAD\n') === null)
t('branch: lege uitvoer geeft null', G.parseBranch('') === null)
t('branch: undefined geeft null', G.parseBranch(undefined) === null)

// ── de toestand ──────────────────────────────────────────────────────────────
const geenRepo   = G.maakStaat({ isRepo: false })
const losseRepo  = G.maakStaat({ isRepo: true, remotes: [], branch: 'master' })
const gekoppeld  = G.maakStaat({ isRepo: true, remotes: ['origin'], branch: 'main' })
const versRepo   = G.maakStaat({ isRepo: true, remotes: [], branch: null, commits: false })
const geenGit    = G.maakStaat({ beschikbaar: false })

t('geen repo is niet gekoppeld', geenRepo.gekoppeld === false)
t('repo zonder remote is niet gekoppeld', losseRepo.gekoppeld === false)
t('repo met origin is gekoppeld', gekoppeld.gekoppeld === true)
t('remote-naam is origin', gekoppeld.remote === 'origin')
t('zonder origin pakt hij de eerste remote',
  G.maakStaat({ isRepo: true, remotes: ['upstream'] }).remote === 'upstream')
t('remotes mag ook rauwe tekst zijn',
  G.maakStaat({ isRepo: true, remotes: 'origin\n' }).gekoppeld === true)

// ── welke knoppen zie je ─────────────────────────────────────────────────────
gelijk('geen repo -> alleen koppelen', G.zichtbareGitIds(geenRepo), ['git-koppelen'])
gelijk('losse repo -> koppelen plus wat lokaal werkt',
  G.zichtbareGitIds(losseRepo), ['git-koppelen', 'git-status', 'git-commit', 'git-stash', 'git-log'])
gelijk('gekoppeld -> alles, koppelen valt weg',
  G.zichtbareGitIds(gekoppeld),
  ['git-status', 'git-commit', 'git-push', 'git-pull', 'git-fetch', 'git-stash', 'git-log'])
gelijk('nog niet gemeten -> geen enkele knop', G.zichtbareGitIds(null), [])
gelijk('git ontbreekt -> geen enkele knop', G.zichtbareGitIds(geenGit), [])
t('koppelen verdwijnt zodra er een remote is',
  !G.zichtbareGitIds(gekoppeld).includes('git-koppelen'))

// ── koppelstappen ────────────────────────────────────────────────────────────
t('geen repo -> init',            G.koppelStap(geenRepo, true)  === G.KOPPEL_INIT)
t('verse repo -> eerst committen', G.koppelStap(versRepo, true)  === G.KOPPEL_COMMIT)
t('repo + gh -> gh maakt hem aan', G.koppelStap(losseRepo, true) === G.KOPPEL_GH)
t('repo zonder gh -> url vragen',  G.koppelStap(losseRepo, false) === G.KOPPEL_URL)
t('al gekoppeld -> niets te doen', G.koppelStap(gekoppeld, true) === G.KOPPEL_AL_GEDAAN)
t('git ontbreekt -> geen stap',    G.koppelStap(geenGit, true)   === null)

t('init-commando', G.koppelCommando(G.KOPPEL_INIT) === 'git init -b main')
t('gh privé', G.koppelCommando(G.KOPPEL_GH, { naam: 'CommandDeck', prive: true })
  === 'gh repo create CommandDeck --private --source=. --push')
t('gh publiek', G.koppelCommando(G.KOPPEL_GH, { naam: 'CommandDeck', prive: false })
  === 'gh repo create CommandDeck --public --source=. --push')
t('gh zonder naam geeft niets', G.koppelCommando(G.KOPPEL_GH, { naam: '' }) === null)
t('url-commando gebruikt de echte branch',
  G.koppelCommando(G.KOPPEL_URL, { url: 'https://github.com/a/b.git', branch: 'master' })
  === 'git remote add origin https://github.com/a/b.git && git push -u origin master')
t('url-commando valt terug op main',
  G.koppelCommando(G.KOPPEL_URL, { url: 'https://github.com/a/b.git' })
  === 'git remote add origin https://github.com/a/b.git && git push -u origin main')
t('url zonder adres geeft niets', G.koppelCommando(G.KOPPEL_URL, { url: '' }) === null)

// ── de leescommando's ────────────────────────────────────────────────────────
t('status', G.GIT_CMD_MAP['git-status'] === 'git status -sb')
t('pull is ff-only', G.GIT_CMD_MAP['git-pull'] === 'git pull --ff-only')
t('fetch snoeit', G.GIT_CMD_MAP['git-fetch'] === 'git fetch --prune')
t('log is een graaf', G.GIT_CMD_MAP['git-log'] === 'git log --graph --oneline --decorate -20')
t('koppelen heeft geen vast commando', G.GIT_CMD_MAP['git-koppelen'] === undefined)
// Elke knop komt óf uit de vaste lijst, óf wordt door een functie opgebouwd
// omdat hij van de toestand afhangt. Geen enkele knop mag door de mazen vallen.
t('elke zichtbare knop kan ergens vandaan komen',
  G.zichtbareGitIds(gekoppeld).every(id =>
    typeof G.GIT_CMD_MAP[id] === 'string' || G.isSchrijfKnop(id) || id === 'git-koppelen'))
t('de vaste commandolijst schrijft nergens — alles wat schrijft gaat langs een vraag',
  Object.values(G.GIT_CMD_MAP).every(c => !/\b(commit|push|stash|reset|checkout|merge|rebase)\b/.test(c)))
t('geen enkele knop kan zonder bevestiging schrijven',
  G.GIT_CMD_DEFS.filter(d => d.schrijft).every(d => G.GIT_CMD_MAP[d.id] === undefined))

// ── knop-definities ──────────────────────────────────────────────────────────
t('elke knop heeft een icoon en een kleurklasse',
  G.GIT_CMD_DEFS.every(d => d.icon && d.cls && d.labelKey))
t('id\'s zijn uniek', new Set(G.GIT_IDS).size === G.GIT_IDS.length)
t('isGitId herkent de eigen knoppen', G.GIT_IDS.every(id => G.isGitId(id)))
t('isGitId laat flutter-knoppen met rust',
  !G.isGitId('build-apk') && !G.isGitId('run-windows') && !G.isGitId('custom:abc'))
t('elke zichtbare id bestaat ook als knop', [geenRepo, losseRepo, gekoppeld]
  .every(s => G.zichtbareGitIds(s).every(id => G.GIT_IDS.includes(id))))

// ── ronde 2: de statusparser ─────────────────────────────────────────────────
const VOL = [
  '# branch.oid 718c29a659615b765800296610bc1968cf3be467',
  '# branch.head main',
  '# branch.upstream origin/main',
  '# branch.ab +2 -1',
  '1 .M N... 100644 100644 100644 aaa bbb renderer.js',
  '1 M. N... 100644 100644 100644 ccc ddd main.js',
  '? nieuw.txt',
].join('\n')

const st = G.parseStatusV2(VOL)
t('branch uit de status', st.branch === 'main')
t('upstream uit de status', st.upstream === 'origin/main')
t('vooruit', st.ahead === 2)
t('achter', st.behind === 1)
t('commits aanwezig', st.commits === true)
t('drie vuile bestanden', st.vuil === 3)
gelijk('en hun paden', st.bestanden, ['renderer.js', 'main.js', 'nieuw.txt'])

const stCrlf = G.parseStatusV2(VOL.split('\n').join('\r\n'))
t('werkt ook met Windows-regeleindes', stCrlf.vuil === 3 && stCrlf.branch === 'main')

const stSchoon = G.parseStatusV2('# branch.oid abc\n# branch.head main\n# branch.upstream origin/main\n# branch.ab +0 -0')
t('schone repo heeft niets vuils', stSchoon.vuil === 0 && stSchoon.ahead === 0)

const stVers = G.parseStatusV2('# branch.oid (initial)\n# branch.head main\n? a.txt')
t('verse repo: geen commits', stVers.commits === false)
t('verse repo: geen upstream', stVers.upstream === null)
t('verse repo: wel een vuil bestand', stVers.vuil === 1)

const stLos = G.parseStatusV2('# branch.oid abc\n# branch.head (detached)')
t('detached HEAD geeft geen branch', stLos.branch === null)

t('lege uitvoer klapt niet', G.parseStatusV2('').vuil === 0)
t('hernoeming telt één bestand',
  G.parseStatusV2('2 R. N... 100644 100644 100644 aaa bbb R100 nieuw.js\toud.js').bestanden[0] === 'nieuw.js')
t('pad met spaties blijft heel',
  G.parseStatusV2('? mijn map/bestand met spatie.txt').bestanden[0] === 'mijn map/bestand met spatie.txt')

// ── ronde 2: welke knoppen bij welke toestand ────────────────────────────────
const repoLos  = G.maakStaat({ isRepo: true, remotes: [], branch: 'main', vuil: 2 })
const repoVol  = G.maakStaat({ isRepo: true, remotes: ['origin'], branch: 'main', upstream: 'origin/main', ahead: 1, vuil: 2 })
const repoLeeg = G.maakStaat({ isRepo: false })

t('zonder repo nog steeds alleen koppelen',
  JSON.stringify(G.zichtbareGitIds(repoLeeg)) === JSON.stringify(['git-koppelen']))
t('repo zonder remote kan wel committen',
  G.zichtbareGitIds(repoLos).includes('git-commit'))
t('repo zonder remote kan niet pushen, pullen of fetchen',
  !['git-push', 'git-pull', 'git-fetch'].some(id => G.zichtbareGitIds(repoLos).includes(id)))
t('repo zonder remote houdt de koppelknop',
  G.zichtbareGitIds(repoLos).includes('git-koppelen'))
t('gekoppeld: alles behalve koppelen',
  G.zichtbareGitIds(repoVol).length === G.GIT_IDS.length - 1
  && !G.zichtbareGitIds(repoVol).includes('git-koppelen'))
t('de volgorde volgt de knoppenlijst',
  G.zichtbareGitIds(repoVol).join() === G.GIT_IDS.filter(i => i !== 'git-koppelen').join())

t('commit, push en stash schrijven',
  ['git-commit', 'git-push', 'git-stash'].every(id => G.isSchrijfKnop(id)))
t('de leesknoppen schrijven niet',
  ['git-status', 'git-pull', 'git-fetch', 'git-log', 'git-koppelen'].every(id => !G.isSchrijfKnop(id)))
t('alleen stash is als gevaarlijk gemarkeerd',
  G.GIT_CMD_DEFS.filter(d => d.gevaar).map(d => d.id).join() === 'git-stash')

// ── ronde 2: de commando's ───────────────────────────────────────────────────
t('commit legt alles vast', G.commitCommando('fix: iets')
  === 'git add -A && git commit -m "fix: iets"')
t('leeg bericht wordt geweigerd', G.commitCommando('   ') === null)
t('aanhalingstekens worden enkel — anders breekt de cmd-regel',
  G.commitCommando('fix: de "rare" bug') === 'git add -A && git commit -m "fix: de \'rare\' bug"')
t('regeleindes worden spaties',
  G.commitCommando('eerste regel\ntweede regel') === 'git add -A && git commit -m "eerste regel tweede regel"')
t('dubbele spaties worden er één', G.veiligCommitBericht('a    b') === 'a b')
t('heel lang bericht wordt afgekapt op 200',
  G.veiligCommitBericht('x'.repeat(500)).length === 200)

t('push met upstream is gewoon push', G.pushCommando(repoVol) === 'git push')
t('push zonder upstream zet hem meteen', G.pushCommando(repoLos.gekoppeld ? repoLos
  : G.maakStaat({ isRepo: true, remotes: ['origin'], branch: 'master' })) === 'git push -u origin master')
t('push zonder remote kan niet', G.pushCommando(repoLos) === null)
t('push zonder branch kan niet',
  G.pushCommando(G.maakStaat({ isRepo: true, remotes: ['origin'], branch: null })) === null)
t('stash pakt ook nieuwe bestanden', G.stashCommando() === 'git stash -u')

// ── ronde 2: wanneer een knop niets te doen heeft ────────────────────────────
const schoon = G.maakStaat({ isRepo: true, remotes: ['origin'], branch: 'main', upstream: 'origin/main', vuil: 0, ahead: 0 })
t('commit op een schone map wordt tegengehouden', G.blokkade('git-commit', schoon) === 'schoon')
t('stash op een schone map ook', G.blokkade('git-stash', schoon) === 'schoon')
t('push zonder iets vooruit wordt tegengehouden', G.blokkade('git-push', schoon) === 'niets-vooruit')
t('push zonder commits wordt tegengehouden',
  G.blokkade('git-push', G.maakStaat({ isRepo: true, remotes: ['origin'], commits: false })) === 'geen-commits')
t('met wijzigingen mag commit gewoon', G.blokkade('git-commit', repoVol) === null)
t('met commits vooruit mag push gewoon', G.blokkade('git-push', repoVol) === null)
t('een leesknop wordt nooit tegengehouden', G.blokkade('git-log', schoon) === null)

// ── ronde 3: de indicator ────────────────────────────────────────────────────
const iVol = G.indicator(G.maakStaat({ isRepo: true, remotes: ['origin'], branch: 'main',
  upstream: 'origin/main', ahead: 2, behind: 1, vuil: 3 }))
t('branch in de indicator', iVol.branch === 'main')
t('vooruit en achter', iVol.ahead === 2 && iVol.behind === 1)
t('vuile bestanden', iVol.vuil === 3)
t('niet schoon', iVol.schoon === false)
t('onveilig: er staat werk dat nergens anders is', iVol.onveilig === true)

const iSchoon = G.indicator(G.maakStaat({ isRepo: true, remotes: ['origin'], branch: 'main',
  upstream: 'origin/main' }))
t('alles gelijk is schoon', iSchoon.schoon === true)
t('en dus niet onveilig', iSchoon.onveilig === false)

const iAchter = G.indicator(G.maakStaat({ isRepo: true, remotes: ['origin'], branch: 'main',
  upstream: 'origin/main', behind: 4 }))
t('alleen achterlopen is niet schoon', iAchter.schoon === false)
t('maar ook niet onveilig — je raakt niets kwijt', iAchter.onveilig === false)
t('achter wordt wel gemeld', iAchter.achter === true)

const iVuil = G.indicator(G.maakStaat({ isRepo: true, remotes: ['origin'], branch: 'main',
  upstream: 'origin/main', vuil: 1 }))
t('niet-vastgelegd werk is onveilig', iVuil.onveilig === true)
const iVooruit = G.indicator(G.maakStaat({ isRepo: true, remotes: ['origin'], branch: 'main',
  upstream: 'origin/main', ahead: 1 }))
t('niet-gepusht werk is ook onveilig', iVooruit.onveilig === true)

const iLos = G.indicator(G.maakStaat({ isRepo: true, remotes: [], branch: 'main', vuil: 2 }))
t('zonder remote: gekoppeld is onwaar', iLos.gekoppeld === false)
t('zonder remote: volgt niets', iLos.volgt === false)
const iGeenUpstream = G.indicator(G.maakStaat({ isRepo: true, remotes: ['origin'], branch: 'main' }))
t('remote zonder upstream is een eigen geval', iGeenUpstream.gekoppeld === true && iGeenUpstream.volgt === false)

const iDetached = G.indicator(G.maakStaat({ isRepo: true, remotes: ['origin'], branch: null }))
t('detached HEAD toont HEAD', iDetached.branch === 'HEAD' && iDetached.losgekoppeld === true)

t('geen repo heeft geen indicator', G.indicator(G.maakStaat({ isRepo: false })) === null)
t('zonder git geen indicator', G.indicator(G.maakStaat({ beschikbaar: false })) === null)
t('nog niet gemeten geen indicator', G.indicator(null) === null)

// ── ronde 3: waarom is een project onveilig (basis voor ronde 5) ─────────────
gelijk('schoon project geeft geen redenen',
  G.onveiligeRedenen(G.maakStaat({ isRepo: true, remotes: ['origin'], branch: 'main', upstream: 'origin/main' })), [])
gelijk('alleen achterlopen geeft geen reden',
  G.onveiligeRedenen(G.maakStaat({ isRepo: true, remotes: ['origin'], branch: 'main', upstream: 'origin/main', behind: 3 })), [])
gelijk('niet-vastgelegd werk', G.onveiligeRedenen(G.maakStaat({ isRepo: true, remotes: ['origin'], branch: 'main', vuil: 4 })),
  [{ soort: 'niet-vastgelegd', aantal: 4 }])
gelijk('allebei, in de volgorde waarin je het wilt horen',
  G.onveiligeRedenen(G.maakStaat({ isRepo: true, remotes: ['origin'], branch: 'main', upstream: 'origin/main', vuil: 2, ahead: 5 })),
  [{ soort: 'niet-vastgelegd', aantal: 2 }, { soort: 'niet-gepusht', aantal: 5 }])
gelijk('een map zonder repo levert nooit een reden', G.onveiligeRedenen(G.maakStaat({ isRepo: false })), [])

// ── bedrading naar de app ────────────────────────────────────────────────────
// Zonder deze twee zie je de knoppen wel staan, maar grijs en zonder icoon —
// ze lijken dan uitgeschakeld. Dat is precies wat er de eerste keer misging.
const APP = path.join(__dirname, '..')
const css = fs.readFileSync(path.join(APP, 'style.css'), 'utf8')
const html = fs.readFileSync(path.join(APP, 'index.html'), 'utf8')
const nl = JSON.parse(fs.readFileSync(path.join(APP, 'locales', 'nl.json'), 'utf8'))
const en = JSON.parse(fs.readFileSync(path.join(APP, 'locales', 'en.json'), 'utf8'))

for (const d of G.GIT_CMD_DEFS) {
  t('kleurklasse ' + d.cls + ' bestaat in style.css', css.includes('.cmd-btn.' + d.cls + ' {'))
  t('vertaling ' + d.labelKey + ' bestaat in nl en en', !!nl[d.labelKey] && !!en[d.labelKey])
}
// Op de script-tags zelf kijken: renderer.js staat verderop ook in een comment.
for (const sleutel of ['git.ind.aheadTitle', 'git.ind.behindTitle', 'git.ind.dirtyTitle',
                       'git.ind.noRemote', 'git.ind.noUpstream']) {
  t('indicator-tekst ' + sleutel + ' bestaat in nl en en', !!nl[sleutel] && !!en[sleutel])
}

for (const reden of ['schoon', 'geen-commits', 'niets-vooruit']) {
  t('melding voor "' + reden + '" bestaat in nl en en',
    !!nl['git.block.' + reden + 'Title'] && !!en['git.block.' + reden + 'Text'])
}

t('index.html laadt git-tools.js vóór renderer.js',
  html.indexOf('src="git-tools.js"') > 0
  && html.indexOf('src="git-tools.js"') < html.indexOf('src="renderer.js"'))
t('ui.test.js laadt git-tools.js ook',
  fs.readFileSync(path.join(APP, 'test', 'ui.test.js'), 'utf8').includes('git-tools.js'))

// ── repo-naam en url opschonen ───────────────────────────────────────────────
t('spaties worden streepjes', G.veiligeRepoNaam('Mijn Project') === 'Mijn-Project')
t('rare tekens eruit', G.veiligeRepoNaam('resume (kopie)!') === 'resume-kopie')
t('punten en streepjes blijven', G.veiligeRepoNaam('dd.music-v2') === 'dd.music-v2')
t('lege naam wordt project', G.veiligeRepoNaam('   ') === 'project')

t('https-url blijft', G.normaliseerRepoUrl('https://github.com/a/b.git') === 'https://github.com/a/b.git')
t('trailing slash eraf', G.normaliseerRepoUrl('https://github.com/a/b/') === 'https://github.com/a/b')
t('ssh-vorm blijft', G.normaliseerRepoUrl('git@github.com:a/b.git') === 'git@github.com:a/b.git')
t('gebruiker/repo wordt een url',
  G.normaliseerRepoUrl('redubbledd1-ops/Resume') === 'https://github.com/redubbledd1-ops/Resume.git')
t('onzin wordt geweigerd', G.normaliseerRepoUrl('zomaar wat') === null)
t('leeg wordt geweigerd', G.normaliseerRepoUrl('') === null)

console.log(ok ? '\nALLE GIT-TESTS OK' : '\nER ZIJN GIT-TESTS GEZAKT')
process.exit(ok ? 0 : 1)
