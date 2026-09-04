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

t('dezelfde weergave is gelijk', G.zelfdeGitWeergave(gekoppeld, G.maakStaat({ isRepo: true, remotes: ['origin'], branch: 'main' })))
t('een andere branch is dat niet', !G.zelfdeGitWeergave(gekoppeld, G.maakStaat({ isRepo: true, remotes: ['origin'], branch: 'dev' })))
t('een langere bestandslijst verandert de knoppen niet',
  G.zelfdeGitWeergave(gekoppeld, G.maakStaat({ isRepo: true, remotes: ['origin'], branch: 'main', bestanden: ['a', 'b', 'c'] })))
t('null is nooit gelijk aan een staat', !G.zelfdeGitWeergave(gekoppeld, null) && !G.zelfdeGitWeergave(null, gekoppeld))
t('twee keer dezelfde verwijzing is gelijk', G.zelfdeGitWeergave(gekoppeld, gekoppeld))

// ── welke knoppen zie je ─────────────────────────────────────────────────────
gelijk('geen repo -> alleen koppelen', G.zichtbareGitIds(geenRepo), ['git-koppelen'])
gelijk('losse repo -> koppelen plus wat lokaal werkt',
  G.zichtbareGitIds(losseRepo),
  ['git-koppelen', 'git-status', 'git-commit', 'git-stash', 'git-branch', 'git-terug', 'git-log'])
gelijk('gekoppeld -> alles, koppelen valt weg',
  G.zichtbareGitIds(gekoppeld),
  ['git-status', 'git-commit', 'git-push', 'git-pull', 'git-fetch', 'git-stash', 'git-branch', 'git-terug', 'git-log'])
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

// core.longpaths hoort erbij: zonder dat valt de eerste commit van een
// Android- of node-project op Windows om met "Filename too long", en dat zegt
// niets over de oorzaak.
t('init-commando', G.koppelCommando(G.KOPPEL_INIT) === 'git init -b main && git config core.longpaths true')
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
// Zonder stash valt behalve koppelen ook de terughaalknop weg: die twee zijn
// de enige die van iets anders afhangen dan van de remote.
t('gekoppeld: alles behalve koppelen en terughalen',
  G.zichtbareGitIds(repoVol).length === G.GIT_IDS.length - 2
  && !G.zichtbareGitIds(repoVol).includes('git-koppelen')
  && !G.zichtbareGitIds(repoVol).includes('git-stash-lijst'))
t('de volgorde volgt de knoppenlijst',
  G.zichtbareGitIds(repoVol).join()
  === G.GIT_IDS.filter(i => i !== 'git-koppelen' && i !== 'git-stash-lijst').join())

t('commit, push en stash schrijven',
  ['git-commit', 'git-push', 'git-stash'].every(id => G.isSchrijfKnop(id)))
t('de leesknoppen schrijven niet',
  ['git-status', 'git-pull', 'git-fetch', 'git-log', 'git-koppelen'].every(id => !G.isSchrijfKnop(id)))
// Gevaarlijk = het kan werk uit beeld halen of je geschiedenis herschrijven.
gelijk('alleen stash en terugdraaien zijn als gevaarlijk gemarkeerd',
  G.GIT_CMD_DEFS.filter(d => d.gevaar).map(d => d.id), ['git-stash', 'git-terug'])

// ── fase 1: knoppen die standaard uit staan ──────────────────────────────────
// Uit staan is niet hetzelfde als niet bestaan. Deze twee blijven gewoon in de
// lijst zitten, zodat de instellingen ze kunnen tonen en je ze aan kunt zetten.
gelijk('fetch, stash, branches en terugdraaien staan standaard uit',
  G.STANDAARD_UIT_IDS, ['git-fetch', 'git-stash', 'git-branch', 'git-terug'])
t('standaard uit staat alleen op knoppen die ook echt bestaan',
  G.STANDAARD_UIT_IDS.every(id => G.GIT_IDS.includes(id)))
t('de dagelijkse lus staat gewoon aan',
  ['git-koppelen', 'git-status', 'git-commit', 'git-push', 'git-pull', 'git-log']
    .every(id => !G.STANDAARD_UIT_IDS.includes(id)))
t('terughalen staat nooit standaard uit — dat is de weg terug',
  !G.STANDAARD_UIT_IDS.includes('git-stash-lijst'))
t('zichtbareGitIds trekt zich niets aan van standaard uit — dat doet de renderer',
  G.zichtbareGitIds(repoVol).includes('git-fetch') && G.zichtbareGitIds(repoVol).includes('git-stash'))

// ── fase 1: de stash terughalen ──────────────────────────────────────────────
const repoStash = G.maakStaat({ isRepo: true, remotes: ['origin'], branch: 'main',
                                upstream: 'origin/main', vuil: 0, stashes: 2 })

t('geen stash -> geen terughaalknop', !G.zichtbareGitIds(repoVol).includes('git-stash-lijst'))
t('wel een stash -> wel een terughaalknop', G.zichtbareGitIds(repoStash).includes('git-stash-lijst'))
// Deze repo heeft een stash maar geen wijzigingen, dus de diff-knop hoort
// er niet te staan: er valt niets te vergelijken.
gelijk('met een stash staat de hele lijst er, op koppelen en diff na',
  G.zichtbareGitIds(repoStash),
  G.GIT_IDS.filter(i => i !== 'git-koppelen' && i !== 'git-diff'))
t('en mét wijzigingen staat werkelijk alles er, op koppelen na',
  G.zichtbareGitIds(G.maakStaat({ isRepo: true, remotes: ['origin'], branch: 'main',
    upstream: 'origin/main', vuil: 1, stashes: 2 })).join()
  === G.GIT_IDS.filter(i => i !== 'git-koppelen').join())
t('een stash in een losse repo mag ook terug',
  G.zichtbareGitIds(G.maakStaat({ isRepo: true, remotes: [], branch: 'main', stashes: 1 }))
    .includes('git-stash-lijst'))
t('stashes staat standaard op nul', G.maakStaat({ isRepo: true }).stashes === 0)

gelijk('stash tellen', [G.parseStashAantal('stash@{0}: WIP on main: abc\nstash@{1}: On main: x\n'),
                        G.parseStashAantal(''), G.parseStashAantal(null),
                        G.parseStashAantal('\n  \n')], [2, 0, 0, 0])

// Precies zoals `git stash list --pretty=%gd%x09%cs%x09%gs` het teruggeeft;
// nagelopen tegen git 2.54 op deze pc.
const stashUit = [
  'stash@{0}\t2026-09-01\tWIP on main: 1f4a2c3 laatste commit-bericht',
  'stash@{1}\t2026-08-30\tOn main: CommandDeck: automatisch bij afsluiten',
  '',
].join('\n')
const stashLijst = G.parseStashLijst(stashUit)

t('twee stashes gelezen', stashLijst.length === 2)
gelijk('de automatische stash houdt zijn eigen bericht',
  { ref: stashLijst[1].ref, branch: stashLijst[1].branch, bericht: stashLijst[1].bericht, eigen: stashLijst[1].eigen },
  { ref: 'stash@{1}', branch: 'main', bericht: 'CommandDeck: automatisch bij afsluiten', eigen: true })
// Het belangrijkste stuk: "WIP on main: <sha> <bericht>" is het bericht van de
// commit waar je op stond, niet van je wijzigingen. Dat mag niet als
// omschrijving van je werk op het scherm belanden.
t('bij WIP blijft het bericht leeg', stashLijst[0].bericht === '')
t('bij WIP kennen we wel de branch', stashLijst[0].branch === 'main')
t('en het commit-bericht gaat apart mee als basis',
  stashLijst[0].basis === 'laatste commit-bericht' && stashLijst[0].eigen === false)
t('de datum komt mee', stashLijst[0].datum === '2026-09-01')
gelijk('lege uitvoer geeft een lege lijst', G.parseStashLijst(''), [])
gelijk('rommel zonder geldige ref wordt overgeslagen',
  G.parseStashLijst('zomaar wat\nnog iets\n'), [])

// De kale uitvoer moet er ook doorheen komen: kent een oudere git de opmaak
// niet, dan is dit wat er terugkomt, en dan hoort de app nog steeds te weten
// dat er werk ligt — alleen zonder datum.
const kaalUit = 'stash@{0}: WIP on main: 1f4a2c3 laatste commit-bericht\n'
             + 'stash@{1}: On main: eigen bericht\n'
const kaal = G.parseStashLijst(kaalUit)
t('kale uitvoer levert dezelfde refs', kaal.length === 2 && kaal[0].ref === 'stash@{0}' && kaal[1].ref === 'stash@{1}')
t('kale uitvoer kent de branch nog steeds', kaal[0].branch === 'main')
t('kale uitvoer houdt een eigen bericht heel', kaal[1].bericht === 'eigen bericht' && kaal[1].eigen === true)
t('kale uitvoer heeft geen datum, en dat mag', kaal[0].datum === '')
// Een datumopmaak (--date=short) maakt van %gd "stash@{2026-09-01}". Die vorm
// wijst geen stash aan en mag er dus niet doorheen glippen als een geldige ref.
gelijk('een datum in plaats van een index wordt geweigerd',
  G.parseStashLijst('stash@{2026-09-01}\t2026-09-01\tWIP on main: abc1234 iets\n'), [])
t('een branchnaam met een streepje overleeft het',
  G.parseStashOnderwerp('WIP on feature/iets-nieuws: abc1234 test').branch === 'feature/iets-nieuws')
t('een onbekende vorm gaat heel mee als bericht',
  G.parseStashOnderwerp('zomaar iets').bericht === 'zomaar iets')

t('geldige ref', G.stashRefGeldig('stash@{0}') && G.stashRefGeldig('stash@{12}'))
t('ongeldige refs worden geweigerd',
  !G.stashRefGeldig('stash@{0} && del *.*') && !G.stashRefGeldig('HEAD')
  && !G.stashRefGeldig('') && !G.stashRefGeldig(null) && !G.stashRefGeldig('stash@{}'))
t('pop-commando', G.stashPopCommando('stash@{0}') === 'git stash pop "stash@{0}"')
t('drop-commando', G.stashDropCommando('stash@{1}') === 'git stash drop "stash@{1}"')
t('een ref die niet klopt levert geen commando op — geen tekst de shell in',
  G.stashPopCommando('stash@{0}; rm -rf /') === null
  && G.stashDropCommando('$(kwaad)') === null)
t('terughalen en weggooien staan niet in de vaste lijst; ze hangen aan een ref',
  G.GIT_CMD_MAP['git-stash-lijst'] === undefined)
t('terughalen telt als schrijfknop', G.isSchrijfKnop('git-stash-lijst'))

// Nagelopen tegen echte git: `git stash pop` met eigen wijzigingen in
// hetzelfde bestand geeft géén conflict maar een weigering ("your local
// changes would be overwritten"). Er gebeurt dan niets. Dat is precies het
// geval dat je in de praktijk raakt, dus dat willen we vóóraf zien aankomen.
gelijk('botsende bestanden gevonden',
  G.botsendeBestanden(['a.txt', 'lib/main.dart'], ['a.txt', 'leesmij.md']), ['a.txt'])
gelijk('geen overlap is een lege lijst',
  G.botsendeBestanden(['a.txt'], ['b.txt']), [])
gelijk('een schone map botst nooit', G.botsendeBestanden(['a.txt'], []), [])
gelijk('een lege stash botst ook niet', G.botsendeBestanden([], ['a.txt']), [])
gelijk('backslashes en forward slashes zijn hetzelfde bestand',
  G.botsendeBestanden(['lib/main.dart'], ['lib\\main.dart']), ['lib/main.dart'])
gelijk('aanhalingstekens uit git status tellen niet mee als naam',
  G.botsendeBestanden(['map/bestand.txt'], ['"map/bestand.txt"']), ['map/bestand.txt'])
gelijk('niets meegegeven klapt niet', G.botsendeBestanden(null, null), [])

// ── fase 2: identiteit lezen ─────────────────────────────────────────────────
// `git config --get-regexp ^user\.(name|email)$` — bewust zonder --local, want
// we willen weten wat git straks gaat gebruiken, dus inclusief het globale.
gelijk('naam en adres gelezen',
  G.parseIdentiteit('user.name redub\nuser.email redubbledd@hotmail.nl\n'),
  { naam: 'redub', email: 'redubbledd@hotmail.nl' })
gelijk('een naam met spaties blijft heel',
  G.parseIdentiteit('user.name Jan de Vries\n'), { naam: 'Jan de Vries', email: '' })
gelijk('alleen een adres is ook onaf',
  G.parseIdentiteit('user.email jan@voorbeeld.nl\n'), { naam: '', email: 'jan@voorbeeld.nl' })
gelijk('lege uitvoer — dit is de verse pc', G.parseIdentiteit(''), { naam: '', email: '' })
t('identiteit staat standaard leeg in de staat',
  G.maakStaat({ isRepo: true }).naam === '' && G.maakStaat({ isRepo: true }).email === '')

t('een adres zonder apenstaartje is geen adres', !G.geldigEmail('jan'))
t('een adres zonder punt erachter ook niet', !G.geldigEmail('jan@lokaal'))
t('een gewoon adres wel', G.geldigEmail('jan@voorbeeld.nl'))
t('een adres met plusje wel', G.geldigEmail('jan+git@voorbeeld.nl'))
t('github noreply-adressen wel', G.geldigEmail('123456+naam@users.noreply.github.com'))

// ── fase 2: profielen ────────────────────────────────────────────────────────
const werk  = G.maakProfiel({ id: 'p1', label: 'werk', naam: 'Jan Jansen', email: 'jan@werk.nl', ghGebruiker: 'jan-werk' })
const prive = G.maakProfiel({ id: 'p2', label: 'privé', naam: 'Jan', email: 'jan@thuis.nl', inloggen: 'vragen' })
const onaf  = G.maakProfiel({ id: 'p3', label: 'half', naam: 'Jan' })
const profielen = [werk, prive, onaf]

t('een profiel met naam en adres is geldig', G.profielGeldig(werk))
t('zonder adres is het niet af', !G.profielGeldig(onaf))
t('zonder naam ook niet', !G.profielGeldig(G.maakProfiel({ email: 'a@b.nl' })))
t('niets is niet geldig', !G.profielGeldig(null))
t('inloggen valt terug op onthouden', G.maakProfiel({}).inloggen === G.INLOG_ONTHOUDEN)
t('een onzinwaarde voor inloggen ook', G.maakProfiel({ inloggen: 'zomaar' }).inloggen === G.INLOG_ONTHOUDEN)
t('vragen blijft vragen', prive.inloggen === G.INLOG_VRAGEN)

t('label wint', G.profielLabel(werk) === 'werk')
t('zonder label je naam', G.profielLabel(G.maakProfiel({ naam: 'Jan' })) === 'Jan')
t('zonder naam je adres', G.profielLabel(G.maakProfiel({ email: 'a@b.nl' })) === 'a@b.nl')

t('project met eigen profiel krijgt dat',
  G.profielVoorProject(profielen, 'p1', 'p2') === prive)
t('project zonder eigen profiel krijgt de standaard',
  G.profielVoorProject(profielen, 'p1', '') === werk)
// Een verwijderd profiel mag niet stilletjes elke controle uitzetten.
t('project dat naar een verdwenen profiel wijst valt terug op de standaard',
  G.profielVoorProject(profielen, 'p1', 'weg') === werk)
t('zonder profielen is er niets te kiezen',
  G.profielVoorProject([], 'p1', 'p2') === null)

// ── fase 2: klopt de naam in deze map? ───────────────────────────────────────
const repoMet = (naam, email) => G.maakStaat({ isRepo: true, remotes: ['origin'], branch: 'main', naam, email })

t('geen naam -> ontbreekt',
  G.identiteitStatus(profielen, repoMet('', ''), werk).soort === 'ontbreekt')
t('alleen een naam is nog steeds ontbreekt',
  G.identiteitStatus(profielen, repoMet('Jan Jansen', ''), werk).soort === 'ontbreekt')
t('geen profielen -> niets te vergelijken',
  G.identiteitStatus([], repoMet('Jan Jansen', 'jan@werk.nl'), null).soort === 'geen-profielen')
t('het goede profiel -> klopt',
  G.identiteitStatus(profielen, repoMet('Jan Jansen', 'jan@werk.nl'), werk).soort === 'klopt')
t('hoofdletters maken geen ander mens',
  G.identiteitStatus(profielen, repoMet('jan jansen', 'JAN@WERK.NL'), werk).soort === 'klopt')
t('een profiel dat je kent maar hier niet hoort -> ander-profiel',
  G.identiteitStatus(profielen, repoMet('Jan', 'jan@thuis.nl'), werk).soort === 'ander-profiel')
t('en dan weet de app ook wie het wél is',
  G.identiteitStatus(profielen, repoMet('Jan', 'jan@thuis.nl'), werk).gevonden === prive)
t('een naam die nergens bij hoort -> onbekend',
  G.identiteitStatus(profielen, repoMet('Iemand', 'iemand@elders.nl'), werk).soort === 'onbekend')
t('zonder verwachting is een bekend profiel gewoon goed',
  G.identiteitStatus(profielen, repoMet('Jan', 'jan@thuis.nl'), null).soort === 'klopt')
// Een half ingevuld profiel telt niet mee als "bekend": daar kun je niet mee
// committen, dus het is geen identiteit die de app herkent.
t('een onaf profiel maakt niets bekend',
  G.identiteitStatus(profielen, repoMet('Jan', ''), null).soort === 'ontbreekt')
t('geen repo -> geen uitspraak', G.identiteitStatus(profielen, G.maakStaat({ isRepo: false }), werk) === null)
t('geen git -> geen uitspraak', G.identiteitStatus(profielen, G.maakStaat({ beschikbaar: false }), werk) === null)

// Alleen een ontbrekende naam houdt de commit tegen. De rest is een
// waarschuwing waar je doorheen mag: soms commit je bewust anders.
t('ontbreken blokkeert', G.identiteitBlokkeert(G.identiteitStatus(profielen, repoMet('', ''), werk)))
t('onbekend blokkeert niet',
  !G.identiteitBlokkeert(G.identiteitStatus(profielen, repoMet('X', 'x@y.nl'), werk)))
t('klopt blokkeert niet',
  !G.identiteitBlokkeert(G.identiteitStatus(profielen, repoMet('Jan Jansen', 'jan@werk.nl'), werk)))

// ── fase 2: de commando's ────────────────────────────────────────────────────
t('identiteit zetten',
  G.identiteitCommando(werk) === 'git config user.name "Jan Jansen" && git config user.email "jan@werk.nl"')
t('een onaf profiel levert geen commando op', G.identiteitCommando(onaf) === null)
t('aanhalingstekens in een naam breken de regel niet',
  G.identiteitCommando(G.maakProfiel({ naam: 'Jan "de Baas"', email: 'a@b.nl' }))
  === `git config user.name "Jan 'de Baas'" && git config user.email "a@b.nl"`)

t('github-naam mag letters, cijfers en streepjes', G.geldigeGhGebruiker('jan-werk-2'))
t('maar geen spaties of tekens die de shell aangaan',
  !G.geldigeGhGebruiker('jan werk') && !G.geldigeGhGebruiker('jan;del') && !G.geldigeGhGebruiker('$(kwaad)'))
t('en niet beginnen of eindigen met een streepje',
  !G.geldigeGhGebruiker('-jan') && !G.geldigeGhGebruiker('jan-'))
t('en niet leeg', !G.geldigeGhGebruiker(''))

// Alleen zetten wat verandert: --unset mislukt als er niets staat, en één
// mislukking kapt de hele &&-ketting af.
t('alles staat al goed -> geen commando',
  G.profielCommando(werk, { naam: 'Jan Jansen', email: 'jan@werk.nl', ghGebruiker: 'jan-werk' }) === null)
t('alleen de identiteit verschilt -> alleen die twee',
  G.profielCommando(werk, { naam: 'Iemand', email: 'x@y.nl', ghGebruiker: 'jan-werk' })
  === G.identiteitCommando(werk))
t('github-account erbij als het anders is',
  G.profielCommando(werk, { naam: 'Jan Jansen', email: 'jan@werk.nl', ghGebruiker: 'oud' })
  === 'git config "credential.https://github.com.username" "jan-werk"')
t('geen github-naam in het profiel maar wel lokaal in de map -> weghalen',
  G.profielCommando(prive, { naam: 'Jan', email: 'jan@thuis.nl', ghGebruiker: 'oud', ghGebruikerLokaal: true, helperLokaal: true })
  === 'git config --unset "credential.https://github.com.username"')
// Staat de naam globaal, dan kunnen we hem hier niet weghalen — en een --unset
// die mislukt kapt de hele &&-ketting af. Er blijft dan alleen de helper over.
t('een github-naam die niet lokaal staat laten we met rust',
  G.profielCommando(prive, { naam: 'Jan', email: 'jan@thuis.nl', ghGebruiker: 'globaal', ghGebruikerLokaal: false })
  === 'git config credential.helper ""')
t('en staat alles al zo, dan valt er niets te doen',
  G.profielCommando(prive, { naam: 'Jan', email: 'jan@thuis.nl', ghGebruiker: 'globaal', helperLokaal: true }) === null)
t('elke keer vragen zet de helper uit',
  G.profielCommando(prive, { naam: 'Jan', email: 'jan@thuis.nl' })
  === 'git config credential.helper ""')
t('en onthouden haalt een lokale helper juist weg',
  G.profielCommando(werk, { naam: 'Jan Jansen', email: 'jan@werk.nl', ghGebruiker: 'jan-werk', helperLokaal: true })
  === 'git config --unset-all credential.helper')
t('een lege map krijgt alles in één regel',
  G.profielCommando(werk, {}).split(' && ').length === 3)
t('een onaf profiel levert nooit een commando op', G.profielCommando(onaf, {}) === null)

t('gh switch', G.ghSwitchCommando('jan-werk') === 'gh auth switch --hostname github.com --user jan-werk')
t('gh switch weigert onzin', G.ghSwitchCommando('jan werk; del') === null)

// Alleen commando's die het netwerk op gaan hebben een toetsenbord nodig; een
// commit vraagt nooit om een token.
t('push vraagt om inloggen bij "elke keer vragen"', G.vraagtOmInloggen(prive, 'git-push'))
t('pull ook', G.vraagtOmInloggen(prive, 'git-pull'))
t('commit niet', !G.vraagtOmInloggen(prive, 'git-commit'))
t('en bij onthouden nooit', !G.vraagtOmInloggen(werk, 'git-push'))
t('zonder profiel ook niet', !G.vraagtOmInloggen(null, 'git-push'))

// ── fase 1: conflicten herkennen ─────────────────────────────────────────────
// Na een `stash pop` die botst staan er u-regels in de status. Die tellen als
// vuil (er staat immers werk in je map) maar ze zijn een ander probleem.
const metConflict = G.parseStatusV2([
  '# branch.head main',
  'u UU N... 100644 100644 100644 100644 aaa bbb ccc botsing.js',
  '1 .M N... 100644 100644 100644 ddd eee gewoon.js',
].join('\n'))
t('conflict wordt geteld', metConflict.conflicten === 1)
t('en telt ook gewoon als vuil', metConflict.vuil === 2)
t('het conflictbestand staat in de lijst', metConflict.bestanden.includes('botsing.js'))
t('zonder u-regels geen conflicten', G.parseStatusV2('1 .M N... 100644 100644 100644 a b c.js').conflicten === 0)
t('conflicten staan standaard op nul', G.maakStaat({ isRepo: true }).conflicten === 0)

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

// ── ronde 5: de afsluitcontrole ──────────────────────────────────────────────
const mk = (naam, opties) => ({ id: naam, naam, pad: 'C:\\' + naam, staat: G.maakStaat(opties) })
const BASIS = { isRepo: true, remotes: ['origin'], branch: 'main', upstream: 'origin/main' }

const projecten = [
  mk('vuil',      { ...BASIS, vuil: 3 }),
  mk('vooruit',   { ...BASIS, ahead: 2 }),
  mk('allebei',   { ...BASIS, vuil: 1, ahead: 1 }),
  mk('schoon',    { ...BASIS }),
  mk('achter',    { ...BASIS, behind: 5 }),
  mk('geenrepo',  { isRepo: false }),
]

gelijk('waarschuwen: alleen wat nergens anders staat',
  G.teVragenProjecten(projecten, 'waarschuwen').map(p => p.naam), ['vuil', 'vooruit', 'allebei'])
gelijk('uit: nooit iets vragen', G.teVragenProjecten(projecten, 'uit'), [])
gelijk('stashen vraagt óók bij het sluiten van het venster',
  G.teVragenProjecten(projecten, 'stashen').map(p => p.naam), ['vuil', 'vooruit', 'allebei'])
t('een achterlopend project houdt het afsluiten niet tegen',
  !G.teVragenProjecten(projecten, 'waarschuwen').some(p => p.naam === 'achter'))
t('een map zonder repo ook niet',
  !G.teVragenProjecten(projecten, 'waarschuwen').some(p => p.naam === 'geenrepo'))

gelijk('stashen pakt alleen niet-vastgelegd werk',
  G.teStashenProjecten(projecten, 'stashen').map(p => p.naam), ['vuil', 'allebei'])
t('niet-gepushte commits worden niet gestasht — die staan al veilig in de repo',
  !G.teStashenProjecten(projecten, 'stashen').some(p => p.naam === 'vooruit'))
gelijk('zonder de stash-instelling gebeurt er niets', G.teStashenProjecten(projecten, 'waarschuwen'), [])
gelijk('en met de controle uit al helemaal niet', G.teStashenProjecten(projecten, 'uit'), [])

t('onbekende instelling valt terug op waarschuwen', G.afsluitInstelling('onzin') === 'waarschuwen')
t('ontbrekende instelling ook', G.afsluitInstelling(undefined) === 'waarschuwen')
t('uit blijft uit', G.afsluitInstelling('uit') === 'uit')
gelijk('de keuzes staan vast', G.AFSLUIT_KEUZES, ['uit', 'waarschuwen', 'stashen'])

const sam = G.afsluitSamenvatting(mk('x', { ...BASIS, vuil: 2, ahead: 3 }))
t('samenvatting noemt het project', sam.naam === 'x')
gelijk('en beide redenen', sam.redenen,
  [{ soort: 'niet-vastgelegd', aantal: 2 }, { soort: 'niet-gepusht', aantal: 3 }])

t('lege lijst klapt niet', G.teVragenProjecten([], 'waarschuwen').length === 0)
t('undefined klapt niet', G.teVragenProjecten(undefined, 'waarschuwen').length === 0)
t('een project zonder staat klapt niet',
  G.teVragenProjecten([{ naam: 'x' }], 'waarschuwen').length === 0)

// ── deel D: achterlopen opmerken ─────────────────────────────────────────────
const NU = 1_700_000_000_000
const TIEN_MIN = 10 * 60 * 1000
const stGekoppeld = G.maakStaat({ ...BASIS })

t('nooit eerder gefetcht mag altijd', G.magFetchen(stGekoppeld, null, NU) === true)
t('net gefetcht mag niet opnieuw', G.magFetchen(stGekoppeld, NU - 60_000, NU) === false)
t('precies op de grens mag wel', G.magFetchen(stGekoppeld, NU - TIEN_MIN, NU) === true)
t('ruim over de grens mag ook', G.magFetchen(stGekoppeld, NU - 60 * 60_000, NU) === true)
t('zonder remote valt er niets te halen',
  G.magFetchen(G.maakStaat({ isRepo: true, remotes: [], branch: 'main' }), null, NU) === false)
t('geen repo, geen fetch', G.magFetchen(G.maakStaat({ isRepo: false }), null, NU) === false)
t('zonder git, geen fetch', G.magFetchen(G.maakStaat({ beschikbaar: false }), null, NU) === false)
t('onbekende staat klapt niet', G.magFetchen(null, null, NU) === false)

t('gelijk lopen levert geen melding',
  G.achterstandMelding(G.maakStaat({ ...BASIS })) === null)
t('vooruit lopen levert geen melding',
  G.achterstandMelding(G.maakStaat({ ...BASIS, ahead: 3 })) === null)

const mAchter = G.achterstandMelding(G.maakStaat({ ...BASIS, behind: 3 }))
t('achterlopen levert wel een melding', mAchter.behind === 3 && mAchter.branch === 'main')
t('en is dan een gewone pull', mAchter.uitEenLopend === false && mAchter.vuil === 0)

const mUitEen = G.achterstandMelding(G.maakStaat({ ...BASIS, behind: 2, ahead: 1 }))
t('vooruit én achter is uiteenlopend — ff-only gaat weigeren', mUitEen.uitEenLopend === true)

const mVuil = G.achterstandMelding(G.maakStaat({ ...BASIS, behind: 2, vuil: 4 }))
t('vuile bestanden worden meegegeven — git weigert die te overschrijven', mVuil.vuil === 4)
t('maar dat maakt het nog geen uiteenlopende geschiedenis', mVuil.uitEenLopend === false)

t('een repo zonder repo geeft geen melding',
  G.achterstandMelding(G.maakStaat({ isRepo: false })) === null)

// ── commit zonder eigen bericht ──────────────────────────────────────────────
// Leeg laten mag, maar dan wel iets dat je over een maand nog iets zegt.
const stB = (v, b) => G.maakStaat({ isRepo: true, remotes: ['origin'], branch: 'main', vuil: v, bestanden: b })

t('één bestand krijgt zijn eigen naam',
  G.automatischCommitBericht(stB(1, ['lib/main.dart'])) === 'wijziging in main.dart')
t('paden worden ingekort tot de bestandsnaam',
  !G.automatischCommitBericht(stB(1, ['lib/services/api_service.dart'])).includes('/'))
t('Windows-paden ook',
  G.automatischCommitBericht(stB(1, ['lib\\services\\api.dart'])) === 'wijziging in api.dart')
t('twee of drie bestanden worden opgesomd',
  G.automatischCommitBericht(stB(3, ['a.js', 'b.css', 'c.md'])) === 'wijzigingen in a.js, b.css, c.md')
t('meer dan drie wordt een aantal met twee namen',
  G.automatischCommitBericht(stB(13, ['renderer.js', 'style.css', 'main.js', 'x.js']))
  === 'wijzigingen in 13 bestanden (renderer.js, style.css, +11)')
t('zonder namen valt hij terug op het aantal',
  G.automatischCommitBericht(stB(5, [])) === 'wijzigingen in 5 bestand(en)')
t('zonder staat klapt hij niet', G.automatischCommitBericht(null) === 'wijzigingen vastgelegd')
t('het levert altijd een bruikbaar commando op',
  [stB(1, ['a.js']), stB(9, ['a.js', 'b.js', 'c.js', 'd.js']), stB(2, []), null]
    .every(x => typeof G.commitCommando(G.automatischCommitBericht(x)) === 'string'))
t('en nooit een leeg bericht',
  [stB(1, ['a.js']), stB(2, []), null].every(x => G.automatischCommitBericht(x).trim().length > 0))
t('het bericht overleeft de opschoning voor cmd.exe',
  G.veiligCommitBericht(G.automatischCommitBericht(stB(13, ['renderer.js', 'style.css'])))
  === 'wijzigingen in 13 bestanden (renderer.js, style.css, +11)')

// ── meerdere locaties per project ────────────────────────────────────────────
const pTwee = { name: 'resume', locations: [
  { label: 'main', path: 'C:\\resume' }, { label: 'extensie', path: 'C:\\resume\\extension' }] }
const pEen = { name: 'DD-Music', locations: [{ label: 'main', path: 'C:\\music' }] }

gelijk('beide locaties komen terug, met hun index', G.projectLocaties(pTwee),
  [{ index: 0, pad: 'C:\\resume', label: 'main' },
   { index: 1, pad: 'C:\\resume\\extension', label: 'extensie' }])
t('de index klopt met de plek in de lijst',
  G.projectLocaties(pTwee)[1].index === 1)
t('hetzelfde pad twee keer telt één keer',
  G.projectLocaties({ name: 'x', locations: [{ label: 'a', path: 'C:\\z' }, { label: 'b', path: 'C:\\z' }] }).length === 1)
t('locaties zonder pad vallen af',
  G.projectLocaties({ name: 'x', locations: [{ label: 'a', path: '' }, { label: 'b', path: 'C:\\z' }] }).length === 1)
t('geen project klapt niet', G.projectLocaties(null).length === 0)
t('project zonder locaties klapt niet', G.projectLocaties({ name: 'x' }).length === 0)

t('bij meerdere locaties staat erbij wélke',
  G.locatieNaam(pTwee, G.projectLocaties(pTwee)[1]) === 'resume — extensie')
t('bij één locatie is de projectnaam genoeg',
  G.locatieNaam(pEen, G.projectLocaties(pEen)[0]) === 'DD-Music')
t('zonder label geen streepje achter de naam',
  G.locatieNaam({ name: 'x', locations: [{ path: 'a' }, { path: 'b' }] },
    { index: 0, pad: 'a', label: '' }) === 'x')
t('zonder project een lege naam in plaats van een fout',
  G.locatieNaam(null, null) === '')

// De afsluitcontrole werkt per regel, dus twee locaties van hetzelfde project
// horen er allebei los in te kunnen staan.
const tweeLocs = [
  { id: 'r', naam: 'resume — main', pad: 'C:\\resume', locIndex: 0,
    staat: G.maakStaat({ ...BASIS, vuil: 2 }) },
  { id: 'r', naam: 'resume — extensie', pad: 'C:\\resume\\extension', locIndex: 1,
    staat: G.maakStaat({ ...BASIS, ahead: 1 }) },
]
gelijk('beide locaties van hetzelfde project houden het afsluiten tegen',
  G.teVragenProjecten(tweeLocs, 'waarschuwen').map(x => x.naam),
  ['resume — main', 'resume — extensie'])
t('en de locIndex blijft bewaard, anders commit je in de verkeerde map',
  G.teVragenProjecten(tweeLocs, 'waarschuwen')[1].locIndex === 1)
gelijk('stashen pakt alleen de locatie met niet-vastgelegd werk',
  G.teStashenProjecten(tweeLocs, 'stashen').map(x => x.naam), ['resume — main'])

// ── zien wat er verandert ────────────────────────────────────────────────────
const stDiff = G.parseStatusV2([
  '# branch.oid a', '# branch.head main',
  '1 .M N... 100644 100644 100644 a b renderer.js',
  '1 M. N... 100644 100644 100644 c d style.css',
  '? .env',
  '? lib/nieuw.dart',
].join('\n'))

t('drie wijzigingen in totaal', stDiff.vuil === 4)
t('waarvan twee nieuw', stDiff.nieuw === 2)
gelijk('en die worden apart bijgehouden', stDiff.nieuweBestanden, ['.env', 'lib/nieuw.dart'])
gelijk('terwijl de volledige lijst alles bevat', stDiff.bestanden,
  ['renderer.js', 'style.css', '.env', 'lib/nieuw.dart'])
t('zonder nieuwe bestanden is de lijst leeg',
  G.parseStatusV2('# branch.oid a\n# branch.head main\n1 .M N... 1 2 3 a b x.js').nieuweBestanden.length === 0)
t('en het aantal nul',
  G.parseStatusV2('# branch.oid a\n# branch.head main\n1 .M N... 1 2 3 a b x.js').nieuw === 0)

t('de diff vergelijkt met HEAD, niet alleen met wat klaarstaat',
  G.diffCommando() === 'git diff HEAD')
t('de diff schrijft niets',
  !/\b(commit|push|stash|reset|checkout|merge|rebase|add)\b/.test(G.diffCommando()))

t('de diff-knop staat aan — dit is hoe je een sleutel opmerkt',
  !G.GIT_CMD_DEFS.find(d => d.id === 'git-diff').standaardUit)
t('de diff-knop verschijnt zodra er iets gewijzigd is',
  G.zichtbareGitIds(G.maakStaat({ isRepo: true, remotes: [], branch: 'main', vuil: 1 })).includes('git-diff'))
t('en verdwijnt als er niets te vergelijken valt',
  !G.zichtbareGitIds(G.maakStaat({ isRepo: true, remotes: [], branch: 'main', vuil: 0 })).includes('git-diff'))
t('hij werkt ook zonder remote',
  G.zichtbareGitIds(G.maakStaat({ isRepo: true, remotes: [], branch: 'main', vuil: 2 })).includes('git-diff'))

// ── het git-account laten meeschakelen met het app-account ───────────────────
const prof = { id: 'p1', label: 'Redub', naam: 'redub', email: 'redubbledd@hotmail.nl',
               ghGebruiker: 'redubbledd1-ops', inloggen: 'onthouden' }

t('identiteit wordt globaal gezet, niet per map',
  G.globaalIdentiteitCommando(prof)
  === 'git config --global user.name "redub" && git config --global user.email "redubbledd@hotmail.nl"')
t('een onvolledig profiel levert niets op',
  G.globaalIdentiteitCommando({ naam: 'x' }) === null)
t('het GitHub-account wordt ook globaal gezet',
  G.globaalGhGebruikerCommando('redubbledd1-ops')
  === 'git config --global "credential.https://github.com.username" "redubbledd1-ops"')
t('een onmogelijke gebruikersnaam wordt geweigerd',
  G.globaalGhGebruikerCommando('niet geldig!') === null)

const zonderGh = G.accountActiveerStappen(prof, false)
const metGh = G.accountActiveerStappen(prof, true)
gelijk('zonder gh: naam en GitHub-gebruiker', zonderGh.map(x => x.soort),
  ['identiteit', 'github-gebruiker'])
gelijk('met gh: ook echt van account wisselen', metGh.map(x => x.soort),
  ['identiteit', 'github-gebruiker', 'gh-wissel'])
// Losse argumenten, geen commandoregel. Een regel moest door een shell heen en
// daar sneuvelden de aanhalingstekens: `user.name "Frank de Boer"` kwam bij git
// aan als losse woorden, en de credential-sleutel kwam aan mét aanhalingstekens
// ("invalid key"). Beide mislukten stil, jarenlang.
t('elke stap draait als losse argumenten, niet als tekstregel',
  metGh.every(x => Array.isArray(x.opdrachten) && x.opdrachten.length
    && x.opdrachten.every(o => o.prog && Array.isArray(o.args) && o.args.length)))
t('er zit nergens een aanhalingsteken in een argument',
  metGh.every(x => x.opdrachten.every(o => o.args.every(a => !/["']/.test(a)))))
t('een naam met een spatie blijft één argument',
  G.accountActiveerStappen({ ...prof, naam: 'Frank de Boer' }, false)[0]
    .opdrachten[0].args.includes('Frank de Boer'))
// Zonder --replace-all weigert git voorgoed te schrijven zodra er per ongeluk
// twee user.name-regels staan: "cannot overwrite multiple values". Dan kan de
// app zichzelf niet meer repareren.
t('schrijven gaat met --replace-all, zodat dubbele regels opgeruimd worden',
  metGh.filter(x => x.opdrachten[0].prog === 'git')
    .every(x => x.opdrachten.every(o => o.args.includes('--replace-all'))))
t('de credential-sleutel gaat kaal mee, zonder aanhalingstekens',
  metGh.find(x => x.soort === 'github-gebruiker')
    .opdrachten[0].args.includes('credential.https://github.com.username'))

// ── klopt wat de app zegt met wat git doet? ──────────────────────────────────
// Alle drie stonden ze fout terwijl er "koppeling werkt" naast stond.
const acc = { naam: 'redubbledd1-ops', email: 'a@b.nl', ghGebruiker: 'redubbledd1-ops' }
gelijk('alles gelijk levert geen enkele melding op',
  G.koppelingProblemen({ account: acc, identiteit: { naam: acc.naam, email: acc.email },
    credentialGebruiker: 'redubbledd1-ops', ghActief: 'redubbledd1-ops', viaGh: true, pushRecht: true })
    .map(x => x.id), [])
gelijk('een andere naam in deze map wordt gemeld',
  G.koppelingProblemen({ account: acc, identiteit: { naam: 'redub', email: 'x@y.nl' } })
    .map(x => x.id), ['identiteit-anders'])
gelijk('pushen als een ander account is een fout, geen opmerking',
  G.koppelingProblemen({ account: acc, credentialGebruiker: 'redubbledD', ghActief: 'redubbledd1-ops' })
    .map(x => [x.id, x.ernst].join(':')), ['inlog-anders:fout'])
t('en de voorgestelde oplossing hangt ervan af of git al via gh loopt',
  G.koppelingProblemen({ account: acc, credentialGebruiker: 'a', ghActief: 'b', viaGh: false })[0].actie === 'via-gh'
  && G.koppelingProblemen({ account: acc, credentialGebruiker: 'a', ghActief: 'b', viaGh: true })[0].actie === 'gh-wissel')
gelijk('leesrecht zonder schrijfrecht wordt apart gemeld',
  G.koppelingProblemen({ account: acc, pushRecht: false }).map(x => x.id), ['geen-push-recht'])
// Niet gemeten is niet hetzelfde als fout. Een waarschuwing die soms uit de
// lucht komt vallen klikt iedereen na een week weg zonder te lezen.
gelijk('wat niet gemeten is levert geen melding op',
  G.koppelingProblemen({ account: acc, identiteit: {}, credentialGebruiker: '', ghActief: '', pushRecht: null })
    .map(x => x.id), [])
gelijk('en zonder gegevens ook niet', G.koppelingProblemen(null).map(x => x.id), [])

// `git ls-remote` beantwoordt de push-vraag niet; GitHub zelf wel, maar dan
// moet je weten welke repo je bedoelt.
t('owner en repo komen uit het remote-adres',
  JSON.stringify(G.ghRepoUitUrl('https://github.com/redubbledd1-ops/CommandDeck.git'))
  === JSON.stringify({ eigenaar: 'redubbledd1-ops', repo: 'CommandDeck' }))
t('ssh-adressen tellen net zo goed',
  (G.ghRepoUitUrl('git@github.com:redubbledd1-ops/CommandDeck.git') || {}).repo === 'CommandDeck')
t('ergens anders dan github levert niets op',
  G.ghRepoUitUrl('https://gitlab.com/iemand/iets.git') === null
  && G.ghRepoUitUrl('') === null)
t('zonder profiel valt er niets te activeren',
  G.accountActiveerStappen(null, true).length === 0)
t('een profiel zonder GitHub-account zet alleen de naam',
  G.accountActiveerStappen({ ...prof, ghGebruiker: '' }, true).map(x => x.soort).join() === 'identiteit')

// ── de koppelknop in het project lost het zelf op ────────────────────────────
// Hij keek alleen of gh geïnstalleerd was. Wie hem niet had, of hem wel had
// maar nooit inlogde, kreeg meteen de omweg via de browser — terwijl de app
// het allebei kan oplossen. En wie helemaal geen GitHub-account had, hoorde
// nergens dat dát de eerste stap is.
const rendererBron2 = require('fs').readFileSync(require('path').join(__dirname, '..', 'renderer.js'), 'utf8')
const zorgBlok = (rendererBron2.match(/async function zorgVoorGithub\(\)[\s\S]*?\n\}/) || [''])[0]

t('de koppelknop vraagt eerst of GitHub klaarstaat',
  /const ghKlaar = await zorgVoorGithub\(\)/.test(rendererBron2))
t('en stopt netjes als je afbreekt', /ghKlaar === 'gestopt'/.test(rendererBron2))

t('er is een uitweg voor ontbrekende gh', /installeerGh\(\)/.test(zorgBlok))
t('een uitweg voor niet ingelogd', /githubInloggen\(\{ stil: true \}\)/.test(zorgBlok))
t('en een uitweg voor wie nog helemaal geen GitHub heeft',
  /github\.com\/signup/.test(zorgBlok))
t('zelf doen blijft mogelijk — dat is de oude weg met de url',
  /keuze === 'zelf'/.test(zorgBlok))
t('ingelogd? dan meteen door, zonder venster',
  /if \(st\.ingelogd\) return true/.test(zorgBlok))

// ── inloggen is interactief; de app voert die dialoog ────────────────────────
// `gh auth login --web` toont een code en wacht op Enter. In de gewone terminal
// van de app kun je niets typen en de uitvoer niet selecteren — daar liep het
// op vast. Main voert het gesprek nu zelf.
const mainBron5 = require('fs').readFileSync(require('path').join(__dirname, '..', 'main.js'), 'utf8')
const loginBlok = (mainBron5.match(/ipcMain\.handle\('git:ghLogin'[\s\S]*?\n\}\)\)/) || [''])[0]

t('inloggen draait als los proces met stdin, niet als kaal commando',
  /spawn\('gh', \['auth', 'login'/.test(loginBlok) && /proc\.stdin\.write/.test(loginBlok))
t('de code wordt uit de uitvoer gevist', /parseGhLoginCode/.test(loginBlok))
t('en het adres ook', /parseGhLoginUrl/.test(loginBlok))
t('en naar het venster gestuurd zodat je hem kunt kopiëren',
  /webContents\.send\('git:ghCode'/.test(loginBlok))
t('de app drukt zelf op Enter bij "press enter"', /press enter/i.test(loginBlok))
t('gh schrijft naar stderr, dus die lezen we ook', /stderr\.on\('data'/.test(loginBlok))
t('het resultaat komt uit gh auth status, niet uit de exitcode',
  /auth', 'status'/.test(loginBlok) && /accounts\.length > 0/.test(loginBlok))
t('en het blijft niet eeuwig hangen', /setTimeout\([\s\S]{0,80}proc\.kill/.test(loginBlok))

// De code is van de vorm ABCD-1234; die vorm moet de regex herkennen.
for (const code of ['1A2B-3C4D', 'ABCD-1234', '0000-FFFF']) {
  t('code herkend: ' + code, G.parseGhLoginCode(code) === code)
}
t('een gewone zin levert geen code op',
  G.parseGhLoginCode('Press Enter to open github.com in your browser') === '')
t('device-adres uit de uitvoer',
  G.parseGhLoginUrl('Open this URL: https://github.com/login/device') === 'https://github.com/login/device')
t('oauth-adres uit de uitvoer',
  G.parseGhLoginUrl('Press Enter to open https://github.com/login/oauth/authorize?client_id=abc in your browser')
  === 'https://github.com/login/oauth/authorize?client_id=abc')
t('zonder adres niets', G.parseGhLoginUrl('Press Enter to open github.com in your browser') === '')
gelijk('een nieuw account erbij', G.nieuwGhAccount(['jan'], ['jan', 'piet']), ['piet'])
gelijk('niets nieuws als het dezelfde is', G.nieuwGhAccount(['jan'], ['jan']), [])
gelijk('de eerste inlog is ook nieuw', G.nieuwGhAccount([], ['jan']), ['jan'])

// ── geïnstalleerd is niet hetzelfde als ingelogd ─────────────────────────────
// Hier ging het mis: gh stond er wél, maar was nooit ingelogd. De app sloeg het
// inloggen over en liep meteen tegen 'To get started with GitHub CLI' aan.
t('de tekst van gh bij niet-ingelogd levert geen account op',
  G.parseGhAccounts('To get started with GitHub CLI, please run:  gh auth login').length === 0)
t('ook niet de andere variant',
  G.parseGhAccounts('You are not logged into any GitHub hosts. To log in, run: gh auth login').length === 0)
t('en met een echte login wél',
  G.parseGhAccounts('  ✓ Logged in to github.com account frank-v (keyring)').length === 1)

const mainBron4 = require('fs').readFileSync(require('path').join(__dirname, '..', 'main.js'), 'utf8')
const statusBlok = (mainBron4.match(/ipcMain\.handle\('git:ghStatus'[\s\S]*?\n\}\)/) || [''])[0]
t('er is een status die beide vragen beantwoordt',
  /geinstalleerd/.test(statusBlok) && /ingelogd/.test(statusBlok))
t('ingelogd hangt aan een gevonden account, niet aan het bestaan van gh',
  /ingelogd: accounts\.length > 0/.test(statusBlok))

const rendererBron = require('fs').readFileSync(require('path').join(__dirname, '..', 'renderer.js'), 'utf8')
t('de renderer logt eerst in en haalt daarna pas op',
  rendererBron.indexOf('githubInloggen') > 0
  && rendererBron.indexOf('githubInloggen') < rendererBron.indexOf('await window.api.gitGhIdentiteit('))
t('een extra account logt in ook als er al één klaarstaat',
  /keuze === 'link' \|\| !st\.ingelogd/.test(rendererBron))

// ── terugval als de API niet lukt ────────────────────────────────────────────
// `gh api user` kan mislukken terwijl je wél ingelogd bent: geen netwerk, een
// proxy op het werk, een token zonder de juiste rechten. `gh auth status` weet
// dan nog steeds je gebruikersnaam, en daarmee is de identiteit alsnog te
// maken — met het noreply-adres, dat altijd werkt.
const statusUit = [
  'github.com',
  '  ✓ Logged in to github.com account frank-v (keyring)',
  '  - Active account: true',
].join('\n')
gelijk('de gebruikersnaam komt uit de status', G.parseGhAccounts(statusUit), ['frank-v'])
t('en daarmee is er een werkend adres',
  G.noreplyEmail(null, 'frank-v') === 'frank-v@users.noreply.github.com')
t('dat GitHub aan je account koppelt',
  G.noreplyEmail(null, 'frank-v').endsWith('@users.noreply.github.com'))
t('zonder login blijft het leeg — dan is er echt niets',
  G.parseGhAccounts('You are not logged into any GitHub hosts.').length === 0)

const mainBron3 = require('fs').readFileSync(require('path').join(__dirname, '..', 'main.js'), 'utf8')
const identBlok = (mainBron3.match(/ipcMain\.handle\('git:ghIdentiteit'[\s\S]*?\n\}\)/) || [''])[0]
t('mislukken levert een reden op, geen kale null',
  /reden: 'geen-gh'/.test(identBlok) && /reden: 'niet-ingelogd'/.test(identBlok))
t('en de foutregel van gh wordt meegegeven', /detail: laatsteFout/.test(identBlok))
t('er is een terugval via gh auth status', /viaStatus: true/.test(identBlok))
t('die het noreply-adres gebruikt', /noreplyEmail/.test(identBlok))

// ── de GitHub-CLI installeren ────────────────────────────────────────────────
// Alleen op verzoek. Een app die ongevraagd software installeert is gedrag dat
// je van malware verwacht, niet van een launcher.
const inst = G.ghInstallCommando()
t('installeert precies het juiste pakket', inst.includes('--id GitHub.cli') && inst.includes('-e'))
t('uit de winget-bron, niet zomaar ergens vandaan', inst.includes('--source winget'))
t('vraagt niet om beheerdersrechten', inst.includes('--scope user'))
t('en blijft niet hangen op een bevestiging die niemand ziet',
  inst.includes('--accept-package-agreements') && inst.includes('--accept-source-agreements'))
t('het installeert niets anders',
  !/(;|&&|\|\|)/.test(inst) && (inst.match(/--id/g) || []).length === 1)

// ── je gegevens ophalen bij GitHub ───────────────────────────────────────────
// Zodat niemand zijn naam en adres hoeft over te typen. Een tikfout in je
// e-mailadres merk je pas als GitHub je commits niet meer aan je koppelt.
const ghUser = G.parseGhUser(JSON.stringify({
  login: 'redubbledd1-ops', name: 'Redub', email: null, id: 12345678 }))
t('login komt eruit', ghUser.login === 'redubbledd1-ops')
t('de weergavenaam ook', ghUser.naam === 'Redub')
t('zonder naam valt hij terug op de login',
  G.parseGhUser(JSON.stringify({ login: 'jan', id: 1 })).naam === 'jan')
t('zonder login is er niets', G.parseGhUser(JSON.stringify({ name: 'x' })) === null)
t('rommel klapt niet', G.parseGhUser('geen json') === null && G.parseGhUser('') === null)

t('het primaire geverifieerde adres wint',
  G.parseGhEmails(JSON.stringify([
    { email: 'oud@x.nl', primary: false, verified: true },
    { email: 'echt@x.nl', primary: true, verified: true },
  ])) === 'echt@x.nl')
t('een niet-geverifieerd primair adres telt niet',
  G.parseGhEmails(JSON.stringify([
    { email: 'nieuw@x.nl', primary: true, verified: false },
    { email: 'oud@x.nl', primary: false, verified: true },
  ])) === 'oud@x.nl')
t('geen adressen levert niets', G.parseGhEmails('[]') === '')
t('rommel ook niet', G.parseGhEmails('nee') === '')

// Wie zijn adres privé heeft staan hoort het noreply-adres te krijgen: anders
// belandt zijn privéadres in een publieke geschiedenis.
t('noreply met id', G.noreplyEmail(12345678, 'jan') === '12345678+jan@users.noreply.github.com')
t('noreply zonder id', G.noreplyEmail(null, 'jan') === 'jan@users.noreply.github.com')
t('zonder login geen adres', G.noreplyEmail(1, '') === '')

gelijk('met een geverifieerd adres', G.ghIdentiteit(ghUser, 'echt@x.nl'),
  { gitNaam: 'Redub', gitEmail: 'echt@x.nl', ghGebruiker: 'redubbledd1-ops' })
t('zonder adres valt hij terug op noreply, nooit op leeg',
  G.ghIdentiteit(ghUser, '').gitEmail === '12345678+redubbledd1-ops@users.noreply.github.com')
t('een openbaar profieladres wordt gebruikt als er geen lijst is',
  G.ghIdentiteit({ login: 'jan', naam: 'Jan', email: 'jan@x.nl', id: 5 }, '').gitEmail === 'jan@x.nl')
t('zonder gebruiker geen identiteit', G.ghIdentiteit(null) === null)
t('het adres is nooit leeg als er een login is',
  ['', null].every(e => G.ghIdentiteit(ghUser, e).gitEmail.length > 0))

// De app moet git en gh met een verse PATH zoeken; anders vindt hij iets dat
// net geïnstalleerd is pas na een herstart, en lijkt de installatie mislukt.
const mainBron2 = require('fs').readFileSync(require('path').join(__dirname, '..', 'main.js'), 'utf8')
const gitUitBlok = (mainBron2.match(/function gitUit\([\s\S]*?\n\}/) || [''])[0]
t('git wordt gezocht met een verse PATH',
  gitUitBlok.length > 0 && /env: childEnv\(\)/.test(gitUitBlok))
t('gh ook', (mainBron2.match(/execFileSync\('gh'[\s\S]{0,200}?env: childEnv\(\)/g) || []).length >= 3)

t('inloggen gaat via de browser, niet via een token in een venster',
  G.ghLoginCommando().includes('--web'))
t('en nooit met een wachtwoord op de opdrachtregel',
  !/--password|--with-token|-p /.test(G.ghLoginCommando()))

gelijk('accounts uit de gh-status lezen',
  G.parseGhAccounts([
    'github.com',
    '  ✓ Logged in to github.com account redubbledd1-ops (keyring)',
    '  ✓ Logged in to github.com account collega-dev (keyring)',
  ].join('\n')), ['redubbledd1-ops', 'collega-dev'])
t('dubbele namen tellen één keer',
  G.parseGhAccounts('account jan\naccount jan').length === 1)
t('lege uitvoer geeft een lege lijst', G.parseGhAccounts('').length === 0)

// ── terugdraaien ─────────────────────────────────────────────────────────────
t('reset houdt je wijzigingen', G.resetZachtCommando() === 'git reset --soft HEAD~1')
t('en gooit dus nooit iets weg', !/--hard|--merge|--keep/.test(G.resetZachtCommando()))
t('geen enkel commando gebruikt reset --hard',
  Object.values(G.GIT_CMD_MAP).every(c => !/--hard/.test(c))
  && !/--hard/.test(G.resetZachtCommando()) && !/--hard/.test(G.amendCommando('x')))

t('amend past alleen het bericht aan',
  G.amendCommando('betere tekst') === 'git commit --amend -m "betere tekst"')
t('en schoont het net zo op als een gewone commit',
  G.amendCommando('met "quotes"') === 'git commit --amend -m "met \'quotes\'"')
t('leeg bericht levert geen commando', G.amendCommando('  ') === null)

t('een pad met spaties blijft heel',
  G.weggooiBestandCommando('lib/mijn map/x.dart') === 'git checkout -- "lib/mijn map/x.dart"')
t('aanhalingstekens in een pad worden geweerd',
  !G.weggooiBestandCommando('raar"pad.js').includes('""'))
t('leeg pad levert geen commando', G.weggooiBestandCommando('') === null)

const stGepusht = G.maakStaat({ ...BASIS, ahead: 0 })
const stEigen = G.maakStaat({ ...BASIS, ahead: 2 })
const stGeenRemote = G.maakStaat({ isRepo: true, remotes: [], branch: 'main' })
t('laatste commit staat al op de remote', G.alGepusht(stGepusht) === true)
t('eigen commits nog niet', G.alGepusht(stEigen) === false)
t('zonder upstream valt er niets te vergelijken', G.alGepusht(stGeenRemote) === false)

t('zonder commits valt er niets terug te draaien',
  G.terugdraaiBlokkade('commit', G.maakStaat({ ...BASIS, commits: false })) === 'geen-commits')
t('weggooien kan niet als er niets gewijzigd is',
  G.terugdraaiBlokkade('weggooien', G.maakStaat({ ...BASIS, vuil: 0 })) === 'schoon')
t('met wijzigingen mag het wel',
  G.terugdraaiBlokkade('weggooien', G.maakStaat({ ...BASIS, vuil: 2 })) === null)
t('geen repo, niets terug te draaien',
  G.terugdraaiBlokkade('commit', G.maakStaat({ isRepo: false })) === 'geen-repo')

t('de terugdraai-knop staat standaard uit',
  G.GIT_CMD_DEFS.find(d => d.id === 'git-terug').standaardUit === true)
t('en is als gevaarlijk gemarkeerd',
  G.GIT_CMD_DEFS.find(d => d.id === 'git-terug').gevaar === true)
t('hij verschijnt pas als er een commit is',
  !G.zichtbareGitIds(G.maakStaat({ isRepo: true, remotes: [], branch: 'main', commits: false })).includes('git-terug'))
t('en werkt ook zonder remote',
  G.zichtbareGitIds(stGeenRemote).includes('git-terug'))

// ── branches ─────────────────────────────────────────────────────────────────
// Zoals `git branch -a --format=...` het echt teruggeeft. De vólledige refnaam
// is nodig: refname:short geeft voor een remote-tak gewoon 'origin/main', en
// dan is die niet te onderscheiden van een lokale tak met een / in de naam.
const BR = [
  '*\trefs/heads/main\tmain\torigin/main',
  ' \trefs/heads/feature/knoppen\tfeature/knoppen\t',
  ' \trefs/remotes/origin/HEAD\torigin/HEAD\t',
  ' \trefs/remotes/origin/main\torigin/main\t',
  ' \trefs/remotes/origin/experiment\torigin/experiment\t',
].join('\n')

const br = G.parseBranches(BR)
t('vier branches, HEAD-verwijzing eruit', br.length === 4)
t('de huidige branch is gemarkeerd', G.huidigeBranch(br).naam === 'main')
t('upstream komt mee', br[0].upstream === 'origin/main')
t('een lokale tak met een / erin is geen remote-tak',
  br.find(b => b.naam === 'feature/knoppen').remote === false)
t('een remote-tak is wél als remote gemerkt',
  br.find(b => b.naam === 'origin/experiment').remote === true)
gelijk('lokale takken', G.lokaleBranches(br).map(b => b.naam), ['main', 'feature/knoppen'])
gelijk('alleen origin/experiment bestaat nog niet lokaal',
  G.nieuweRemoteBranches(br).map(b => b.naam), ['origin/experiment'])
t('werkt met Windows-regeleindes', G.parseBranches(BR.split('\n').join('\r\n')).length === 4)
t('lege uitvoer klapt niet', G.parseBranches('').length === 0)
t('een halve regel wordt overgeslagen', G.parseBranches('* \tref').length === 0)

// Onder refs/remotes/ staat niet alleen 'origin/main'. Een kale 'origin' zag er
// in het keuzevenster uit als een branch die zo heet.
const BR_KAAL = [
  '*\trefs/heads/main\tmain\torigin/main',
  ' \trefs/remotes/origin\torigin\t',
  ' \trefs/remotes/origin/HEAD\torigin/HEAD\t',
  ' \trefs/remotes/origin/main\torigin/main\t',
].join('\n')
gelijk('een kale remote-verwijzing is geen branch',
  G.parseBranches(BR_KAAL).map(b => b.naam), ['main', 'origin/main'])
t('en komt dus ook niet in de keuzelijst',
  !G.nieuweRemoteBranches(G.parseBranches(BR_KAAL)).some(b => b.naam === 'origin'))
t('een lokale tak zonder / blijft wél gewoon staan',
  G.parseBranches(' \trefs/heads/origin\torigin\t')[0].naam === 'origin')

// Vooruit/achter per branch. Dit is de informatie die ontbrak toen een branch
// werd weggegooid terwijl er nog een commit op stond die nergens anders was.
gelijk('ahead en behind', G.parseTrack('[ahead 2, behind 1]'), { ahead: 2, behind: 1, wegOpRemote: false })
gelijk('alleen vooruit', G.parseTrack('[ahead 3]'), { ahead: 3, behind: 0, wegOpRemote: false })
gelijk('alleen achter', G.parseTrack('[behind 4]'), { ahead: 0, behind: 4, wegOpRemote: false })
gelijk('gelijk', G.parseTrack(''), { ahead: 0, behind: 0, wegOpRemote: false })
gelijk('remote-tak verdwenen', G.parseTrack('[gone]'), { ahead: 0, behind: 0, wegOpRemote: true })

const brTrack = G.parseBranches([
  '*\trefs/heads/main\tmain\torigin/main\t',
  ' \trefs/heads/feature\tfeature\torigin/feature\t[ahead 2, behind 1]',
  ' \trefs/heads/los\tlos\t\t',
  ' \trefs/heads/verweesd\tverweesd\torigin/verweesd\t[gone]',
  ' \trefs/remotes/origin/nieuw\torigin/nieuw\t\t',
].join('\n'))
const brVan = (naam) => brTrack.find(b => b.naam === naam)

t('cijfers komen uit de branch-lijst', brVan('feature').ahead === 2 && brVan('feature').behind === 1)
t('een branch zonder remote heeft geen cijfers', brVan('los').ahead === 0)
t('en een verdwenen remote wordt gemarkeerd', brVan('verweesd').wegOpRemote === true)

t('gelijke branch krijgt geen tekens', G.branchOmschrijving(brVan('main')) === 'main')
t('vooruit en achter komen in het label', G.branchOmschrijving(brVan('feature')).includes('↑2')
  && G.branchOmschrijving(brVan('feature')).includes('↓1'))
t('een remote-tak krijgt een wolk, want kiezen maakt hem lokaal aan',
  G.branchOmschrijving(brVan('origin/nieuw')) === '☁ origin/nieuw')
t('leeg klapt niet', G.branchOmschrijving(null) === '')

t('vooruitlopen telt als eigen werk', G.branchHeeftEigenWerk(brVan('feature')) === true)
t('geen remote telt als eigen werk', G.branchHeeftEigenWerk(brVan('los')) === true)
t('een verdwenen remote ook — dat werk staat mogelijk nergens meer',
  G.branchHeeftEigenWerk(brVan('verweesd')) === true)
t('gelijk met de remote is geen eigen werk', G.branchHeeftEigenWerk(brVan('main')) === false)
t('een remote-tak is per definitie geen eigen werk',
  G.branchHeeftEigenWerk(brVan('origin/nieuw')) === false)

t('main en master gelden als hoofdtak',
  G.isHoofdtak('main') && G.isHoofdtak('master') && G.isHoofdtak('origin/main'))
t('een gewone tak niet', !G.isHoofdtak('feature/x') && !G.isHoofdtak('Even-testen'))
t('en niets ook niet', !G.isHoofdtak('') && !G.isHoofdtak(null))

t('lokaal wisselen is gewoon checkout',
  G.checkoutCommando({ naam: 'feature/knoppen', remote: false }) === 'git checkout feature/knoppen')
t('een remote-tak wordt lokaal aangemaakt en volgt hem',
  G.checkoutCommando({ naam: 'origin/experiment', remote: true })
  === 'git checkout -b experiment --track origin/experiment')
t('zonder branch geen commando', G.checkoutCommando(null) === null)

t('nieuwe branch', G.nieuweBranchCommando('feature/x') === 'git checkout -b feature/x')
t('spaties worden streepjes', G.nieuweBranchCommando('mijn nieuwe tak') === 'git checkout -b mijn-nieuwe-tak')
t('onbruikbare naam levert niets op', G.nieuweBranchCommando('...') === null)

t('verwijderen is standaard voorzichtig', G.verwijderBranchCommando('oud') === 'git branch -d oud')
t('forceren is een aparte keuze', G.verwijderBranchCommando('oud', true) === 'git branch -D oud')
t('remote verwijderen gaat via push --delete',
  G.verwijderRemoteBranchCommando('origin', 'origin/oud') === 'git push origin --delete oud')
t('merge', G.mergeCommando('feature/x') === 'git merge feature/x')
t('merge van een remote-tak mag ook', G.mergeCommando('origin/main') === 'git merge origin/main')

// Namen die git weigert horen we tegen te houden vóór het commando draait.
for (const slecht of ['mijn tak', 'a..b', 'a~b', 'a^b', 'a:b', 'a?b', 'a*b', 'a[b',
                      '-begin', '.begin', 'eind.', 'eind.lock', 'HEAD', '/a', 'a/', 'a//b', '', '   ']) {
  t('geweigerd: ' + JSON.stringify(slecht), G.geldigeBranchNaam(slecht) === false)
}
for (const goed of ['main', 'feature/x', 'fix-123', 'v1.2.3', 'a/b/c']) {
  t('toegestaan: ' + goed, G.geldigeBranchNaam(goed) === true)
}
t('opschonen maakt er iets bruikbaars van',
  G.veiligeBranchNaam('  Mijn Nieuwe Tak!  ') === 'Mijn-Nieuwe-Tak!')
t('opschonen haalt verboden tekens weg', G.veiligeBranchNaam('a~b^c:d') === 'abcd')
t('opschonen geeft leeg terug als er niets bruikbaars over is',
  G.veiligeBranchNaam('...') === '')

const vuilSt = G.maakStaat({ ...BASIS, vuil: 3 })
const schoonSt = G.maakStaat({ ...BASIS })
t('wisselen met vuil werk wordt gemeld', G.wisselBlokkade(vuilSt, 'anders') === 'vuil')
t('naar dezelfde branch wisselen heeft geen zin', G.wisselBlokkade(schoonSt, 'main') === 'zelfde')
t('schoon en een andere branch mag gewoon', G.wisselBlokkade(schoonSt, 'anders') === null)
t('geen repo, geen wissel', G.wisselBlokkade(G.maakStaat({ isRepo: false }), 'x') === 'geen-repo')

t('de branch-knop staat standaard uit',
  G.GIT_CMD_DEFS.find(d => d.id === 'git-branch').standaardUit === true)
t('branches werken ook zonder remote',
  G.zichtbareGitIds(G.maakStaat({ isRepo: true, remotes: [], branch: 'main' })).includes('git-branch'))
t('maar niet in een repo zonder commits',
  !G.zichtbareGitIds(G.maakStaat({ isRepo: true, remotes: [], branch: 'main', commits: false })).includes('git-branch'))

t('conflicten worden uit de status gehaald',
  G.parseStatusV2('# branch.oid a\n# branch.head main\nu UU N... 1 2 3 4 a b c x.js\n1 .M N... 1 2 3 a b y.js').conflicten === 1)
t('en tellen ook gewoon als vuil',
  G.parseStatusV2('# branch.oid a\n# branch.head main\nu UU N... 1 2 3 4 a b c x.js').vuil === 1)
t('zonder conflict is het nul',
  G.parseStatusV2('# branch.oid a\n# branch.head main\n1 .M N... 1 2 3 a b y.js').conflicten === 0)

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

for (const sleutel of ['git.afsluit.titel', 'git.afsluit.commitPush', 'git.afsluit.terminal',
                       'git.afsluit.tochAf', 'git.afsluit.reden.niet-vastgelegd',
                       'git.afsluit.reden.niet-gepusht', 'git.afsluit.teller',
                       'git.wissel.titel', 'git.wissel.tekst', 'git.wissel.tochAf',
                       'git.wissel.misluktTekst',
                       'git.stashMelding.titel',
                       'settings.git.label', 'settings.git.off', 'settings.git.warn', 'settings.git.stash']) {
  t('afsluit-tekst ' + sleutel + ' bestaat in nl en en', !!nl[sleutel] && !!en[sleutel])
}

{
  const ren = fs.readFileSync(path.join(APP, 'renderer.js'), 'utf8')
  const main = fs.readFileSync(path.join(APP, 'main.js'), 'utf8')
  const pre = fs.readFileSync(path.join(APP, 'preload.js'), 'utf8')
  t('elk onveilig project krijgt een eigen vraag',
    /for \(let i = 0; i < totaal; i\+\+\)/.test(ren)
    && /vraagOverProject\(teVragen\[i\]/.test(ren))
  t('afsluiten en wisselen gebruiken dezelfde ronde',
    /controleerOnveiligWerk\('afsluiten'\)/.test(ren)
    && /controleerOnveiligWerk\('wisselen'\)/.test(ren))
  t('bij meer projecten staat erbij welke beurt het is',
    /git\.afsluit\.teller/.test(ren))
  t('de noodrem wordt bij elke vraag opnieuw gezet',
    /git:afsluitHartslag/.test(main) && /gitAfsluitHartslag/.test(pre)
    && /hartslagAfsluiten/.test(ren))
  t('Windows-afsluiten start dezelfde vragen',
    /win\.on\('query-session-end'/.test(main)
    && main.slice(main.indexOf("app.on('session-end'")).includes("startAfsluitControle('windows')"))
}

for (const sleutel of ['git.btn.diff', 'git.diff.leegTitel', 'git.diff.nieuweKop',
                       'git.commit.nieuwTitel', 'git.commit.bekijken', 'git.commit.doorgaan']) {
  t('diff-tekst ' + sleutel + ' bestaat in nl en en', !!nl[sleutel] && !!en[sleutel])
}

for (const sleutel of ['git.btn.undo', 'git.terug.titel', 'git.terug.commit', 'git.terug.bericht',
                       'git.terug.weggooien', 'git.terug.weggooiBevestig', 'git.terug.nieuwTekst',
                       'settings.git.pollLabel', 'settings.git.pollUit', 'settings.git.pollSec']) {
  t('terugdraai-tekst ' + sleutel + ' bestaat in nl en en', !!nl[sleutel] && !!en[sleutel])
}

for (const sleutel of ['git.branch.remoteHalenTitel', 'git.branch.remoteHalenTekst',
                       'git.branch.eigenWerkTitel', 'git.branch.eigenWerkVooruit',
                       'git.branch.ookRemoteTitel', 'git.branch.ookRemoteOk']) {
  t('branch-waarschuwing ' + sleutel + ' bestaat in nl en en', !!nl[sleutel] && !!en[sleutel])
}

for (const sleutel of ['git.btn.branch', 'git.branch.titel', 'git.branch.nieuw', 'git.branch.wisselen',
                       'git.branch.samenvoegen', 'git.branch.verwijderen', 'git.branch.conflictTitel',
                       'git.branch.vuilTekst', 'git.branch.wegRemoteBevestig']) {
  t('branch-tekst ' + sleutel + ' bestaat in nl en en', !!nl[sleutel] && !!en[sleutel])
}

for (const sleutel of ['git.achter.titel', 'git.achter.tekst', 'git.achter.tekstUitEen',
                       'git.achter.nu', 'git.achter.later', 'git.achter.uitEenLopend',
                       'settings.git.fetchLabel']) {
  t('achterstand-tekst ' + sleutel + ' bestaat in nl en en', !!nl[sleutel] && !!en[sleutel])
}

for (const sleutel of ['git.stashLijst.leegTitel', 'git.stashLijst.leegTekst',
                       'git.stashLijst.kiesTitel', 'git.stashLijst.kiesTekst',
                       'git.stashLijst.kiesTekstMeer', 'git.stashLijst.wijzigingenOp',
                       'git.stashLijst.actieTitel', 'git.stashLijst.actieTekst',
                       'git.stashLijst.actieTekstBotsing',
                       'git.stashLijst.geweigerdTitel', 'git.stashLijst.geweigerdTekst',
                       'git.stashLijst.pop', 'git.stashLijst.drop',
                       'git.stashLijst.dropTitel', 'git.stashLijst.dropTekst', 'git.stashLijst.dropOk',
                       'git.stashLijst.conflictTitel', 'git.stashLijst.conflictTekst',
                       'git.stashMelding.terughalen', 'cmdvis.defaultOff']) {
  t('stash-tekst ' + sleutel + ' bestaat in nl en en', !!nl[sleutel] && !!en[sleutel])
}

// De oude tekst stuurde je naar de terminal omdat er niets anders was. Nu is
// er een knop, en dan hoort er in geen enkele taal meer een commando te staan
// dat je zelf moet typen.
for (const sleutel of ['git.stashMelding.tekst', 'git.stash.text']) {
  t(sleutel + ' verwijst niet meer naar een commando om te typen',
    !/git stash pop/.test(nl[sleutel] || '') && !/git stash pop/.test(en[sleutel] || ''))
}

for (const sleutel of ['git.ident.ontbreektTitel', 'git.ident.ontbreektTekst',
                       'git.ident.ontbreektTekstProfielen', 'git.ident.instellenOk',
                       'git.ident.vraagNaamTitel', 'git.ident.vraagNaamTekst',
                       'git.ident.vraagEmailTitel', 'git.ident.vraagEmailTekst',
                       'git.ident.emailFoutTitel', 'git.ident.emailFoutTekst',
                       'git.ident.bewaarTitel', 'git.ident.bewaarTekst', 'git.ident.bewaarOk',
                       'git.ident.verkeerdTitel', 'git.ident.anderTekst', 'git.ident.onbekendTekst',
                       'git.ident.tochCommitten', 'git.ident.rechtzettenOk',
                       'git.ident.chipMis', 'git.ident.chipMisTitle',
                       'git.ident.chipTitle', 'git.ident.chipFoutTitle',
                       'git.profiel.toepassenTitel', 'git.profiel.toepassenTekst',
                       'git.profiel.toepassenOk', 'git.profiel.alGoedToast',
                       'git.profiel.ghTitel', 'git.profiel.ghTekst', 'git.profiel.ghOk',
                       'settings.git.profielLabel', 'settings.git.profielDesc',
                       'settings.git.profielEmptyHint', 'settings.git.profielAdd',
                       'settings.git.profielStdTitle', 'settings.git.profielLabelPlaceholder',
                       'settings.git.profielNamePlaceholder', 'settings.git.profielEmailPlaceholder',
                       'settings.git.profielGhPlaceholder', 'settings.git.profielIncomplete',
                       'settings.git.profielRemoveTitle', 'settings.git.profielRemoveText',
                       'settings.git.profielRemoveUsed', 'settings.git.inlogRemember',
                       'settings.git.inlogAsk', 'settings.git.inlogEerlijk']) {
  t('identiteit-tekst ' + sleutel + ' bestaat in nl en en', !!nl[sleutel] && !!en[sleutel])
}

// De belofte die de app doet over "elke keer vragen" moet eerlijk zijn: het is
// een drempel, geen scheiding. Staat dat er niet in, dan wekt de instelling een
// verwachting die hij niet waarmaakt.
t('de inlog-uitleg zegt eerlijk dat het geen beveiliging is',
  /geen beveiliging/i.test(nl['settings.git.inlogEerlijk'])
  && /not security/i.test(en['settings.git.inlogEerlijk']))
t('en wijst naar aparte Windows-accounts als je het écht wilt scheiden',
  /Windows-accounts/i.test(nl['settings.git.inlogEerlijk'])
  && /Windows accounts/i.test(en['settings.git.inlogEerlijk']))

t('de identiteit-chip heeft opmaak in style.css',
  css.includes('.git-ident {') && css.includes('.git-ident.fout') && css.includes('.git-ident.mis'))
t('de profielrijen ook', css.includes('.git-profiel-rij {'))
// Het projectvenster gaat over het project, niet over wie je bent. De
// profielkeuze zat daar en hoort in Instellingen > Git; op zijn plek staat nu
// het binnenhalen van een repository.
t('index.html heeft geen profielkeuze meer in het projectvenster',
  !html.includes('id="f-profiel"') && !html.includes('id="f-profiel-rij"'))
t('maar wel een kiezer voor je GitHub-repositories',
  html.includes('id="btn-git-repos"') && html.includes('id="f-git-repo-lijst"'))

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

t('reponaam uit https', G.repoNaamUitUrl('https://github.com/a/Scan-Find.git') === 'Scan-Find')
t('reponaam uit gebruiker/repo', G.repoNaamUitUrl('a/daykit') === 'daykit')
t('reponaam uit ssh', G.repoNaamUitUrl('git@github.com:a/b.git') === 'b')
t('geen naam zonder adres', G.repoNaamUitUrl('zomaar') === '')

t('clone onder de gekozen map',
  G.cloneDoelPad('a/b', 'C:\\Projects') === 'C:\\Projects\\b')
t('clone in de map zelf als die al zo heet',
  G.cloneDoelPad('a/b', 'C:\\Projects\\b') === 'C:\\Projects\\b')
t('zonder locatie geen doel', G.cloneDoelPad('a/b', '') === null)
t('ouder van het doel', G.cloneOuderPad('C:\\Projects\\b') === 'C:\\Projects')
t('ouder van een schijfwortel-map', G.cloneOuderPad('D:\\repo') === 'D:\\')
t('clone-commando citeert adres en map',
  G.cloneCommando('a/b', 'C:\\Projects\\b')
  === 'git clone -- "https://github.com/a/b.git" "C:\\Projects\\b"')
t('zonder adres geen commando', G.cloneCommando('', 'C:\\x') === null)

// ── De repositories van je GitHub-account ────────────────────────────────────
// Twee vormen leveren dezelfde lijst: `gh repo list --json` en, als terugval
// voor oudere gh, `gh api user/repos`. Zolang beide hier doorheen komen, hoeft
// de rest van de app het verschil niet te kennen.
const ghLijstJson = JSON.stringify([
  { nameWithOwner: 'redubbledd1/DD-Music', name: 'DD-Music', url: 'https://github.com/redubbledd1/DD-Music',
    description: 'muziekspeler', isPrivate: false, updatedAt: '2026-08-30T10:00:00Z' },
  { nameWithOwner: 'redubbledd1/CommandDeck', name: 'CommandDeck', url: 'https://github.com/redubbledd1/CommandDeck',
    description: '', isPrivate: true, updatedAt: '2026-09-01T10:00:00Z' },
])
const ghApiJson = JSON.stringify([
  { full_name: 'redubbledd1/DD-Music', name: 'DD-Music', html_url: 'https://github.com/redubbledd1/DD-Music',
    description: 'muziekspeler', private: false, updated_at: '2026-08-30T10:00:00Z' },
])

const uitJson = G.parseGhRepos(ghLijstJson)
t('repolijst gelezen', uitJson.length === 2)
t('nieuwste bovenaan', uitJson[0].volledig === 'redubbledd1/CommandDeck')
t('privé wordt herkend', uitJson[0].prive === true && uitJson[1].prive === false)
t('het adres is er een om mee te clonen',
  uitJson[1].url === 'https://github.com/redubbledd1/DD-Music.git')
t('de omschrijving komt mee', uitJson[1].beschrijving === 'muziekspeler')

const uitApi = G.parseGhRepos(ghApiJson)
t('de api-vorm geeft hetzelfde',
  uitApi.length === 1 && uitApi[0].volledig === 'redubbledd1/DD-Music'
  && uitApi[0].url === 'https://github.com/redubbledd1/DD-Music.git')

t('rommel levert een lege lijst, geen fout', G.parseGhRepos('geen json').length === 0)
t('en een leeg antwoord ook', G.parseGhRepos('').length === 0)

// Hetzelfde adres in drie vormen: zo herken je dat een repo al aan een project
// hangt, ook als het project 'm via ssh heeft en gh https teruggeeft.
t('sleutel uit https', G.repoSleutel('https://github.com/A/B.git') === 'a/b')
t('sleutel uit ssh', G.repoSleutel('git@github.com:a/b.git') === 'a/b')
t('sleutel uit gebruiker/repo', G.repoSleutel('A/b') === 'a/b')
t('geen sleutel uit onzin', G.repoSleutel('zomaar') === '')

const gefilterd = G.zonderGekoppelde(uitJson, ['git@github.com:redubbledd1/CommandDeck.git'])
t('al gekoppelde repo valt weg', gefilterd.lijst.length === 1
  && gefilterd.lijst[0].volledig === 'redubbledd1/DD-Music')
t('en er wordt geteld hoeveel', gefilterd.verborgen === 1)
t('zonder gekoppelde blijft alles staan',
  G.zonderGekoppelde(uitJson, []).lijst.length === 2
  && G.zonderGekoppelde(uitJson, []).verborgen === 0)
t('een adres dat nergens op slaat filtert niets weg',
  G.zonderGekoppelde(uitJson, ['zomaar']).lijst.length === 2)

// ── Windows dat afsluit terwijl er werk openstaat ────────────────────────────
// Windows vraagt eerst toestemming (WM_QUERYENDSESSION) en kapt daarna binnen
// enkele seconden af. Vroeger was stashen het enige dat nog paste. Sinds
// Electron 34 kan er 'nee' gezegd worden op die vraag: Windows zet het afsluiten
// dan stil en toont wie het ophoudt. Dat is de ruimte om te vragen wat er moet
// gebeuren, in plaats van het te raden.
const mainAf = fs.readFileSync(path.join(APP, 'main.js'), 'utf8')
t('de app kan het afsluiten van Windows stilzetten',
  /win\.on\('query-session-end'/.test(mainAf)
  && /e\.preventDefault\(\)/.test(mainAf))
t('maar alleen als er echt werk te redden valt',
  /if \(!heeftWerkOmTeRedden\(\)\) return[\s\S]{0,40}e\.preventDefault\(\)/.test(mainAf))
t('en niet meer nadat je zelf "toch afsluiten" koos',
  /win\.on\('query-session-end'[\s\S]{0,160}if \(afsluitenBevestigd\) return/.test(mainAf))
t('de vraag komt van de lijst die de renderer bijhoudt, want synchroon moet het',
  /function heeftWerkOmTeRedden\(\)[\s\S]{0,600}GitTools\.teVragenProjecten\(gitProjectenVoorAfsluiten\.lijst/.test(mainAf))
t('en nooit over de mappen van een ander account',
  /function heeftWerkOmTeRedden\(\)[\s\S]{0,500}gitProjectenVoorAfsluiten\.accountId !== accountStand\(\)\.actiefAccount\) return false/.test(mainAf))
t('het venster komt naar voren, want wij houden het op',
  /win\.on\('query-session-end'[\s\S]{0,600}win\.focus\(\)/.test(mainAf))
t('de oude berichtenhaak is vervangen, niet verdubbeld',
  !/hookWindowMessage\(0x0011/.test(mainAf))
t('de aanleiding gaat mee naar het venster',
  /send\('git:controleerVoorAfsluiten', \{ aanleiding: aanleiding \|\| 'venster' \}\)/.test(mainAf))

const rendererAf = fs.readFileSync(path.join(APP, 'renderer.js'), 'utf8')
t('en het venster zegt achteraf dat Windows is gestopt met afsluiten',
  /info\.aanleiding === 'windows'[\s\S]{0,200}git\.afsluit\.windowsTekst/.test(rendererAf))
t('de stash blijft het vangnet als Windows ons tóch afkapt',
  /teStashenProjecten/.test(mainAf))
for (const sleutel of ['git.afsluit.windowsTitel', 'git.afsluit.windowsTekst']) {
  t('afsluit-tekst ' + sleutel + ' bestaat in nl en en', !!nl[sleutel] && !!en[sleutel])
}

// ── Achterlopen op de andere pc ──────────────────────────────────────────────
// Het geval waar dit voor bestaat: gisteren op pc 1 gewerkt, vandaag pc 2 aan.
// Eén knop "ophalen" is dan te weinig — `pull --ff-only` weigert zodra jij ook
// iets hebt, en niet-vastgelegd werk laat git niet overschrijven. De knoppen
// horen dus te passen bij wat er aan de hand is.
const achterStaat = (extra) => G.maakStaat(Object.assign(
  { beschikbaar: true, isRepo: true, remotes: ['origin'], branch: 'main',
    commits: true, upstream: 'origin/main' }, extra))

t('niets achter is geen vraag', G.achterstandKeuzes(achterStaat({ behind: 0 })) === null)

const gewoon = G.achterstandKeuzes(achterStaat({ behind: 3 }))
t('gewoon achter: vooruitspoelen is genoeg',
  gewoon.behind === 3 && gewoon.wijzen.join() === 'ffonly' && gewoon.stashNodig === false)

const uitEen = G.achterstandKeuzes(achterStaat({ behind: 3, ahead: 2 }))
t('allebei gewerkt: geen vooruitspoelen meer, wel een keuze',
  uitEen.uitEenLopend === true && uitEen.wijzen.join() === 'merge,rebase')
t('en er staat bij hoeveel van jou er nog niet zijn', uitEen.ahead === 2)

const vuil = G.achterstandKeuzes(achterStaat({ behind: 1, vuil: 2 }))
t('niet-vastgelegd werk gaat eerst opzij', vuil.stashNodig === true)
const beide = G.achterstandKeuzes(achterStaat({ behind: 1, ahead: 1, vuil: 2 }))
t('en dat geldt ook als je uit elkaar loopt',
  beide.stashNodig === true && beide.wijzen.join() === 'merge,rebase')

t('elke wijze heeft zijn eigen commando',
  G.pullCommando('ffonly') === 'git pull --ff-only'
  && G.pullCommando('merge') === 'git pull --no-rebase'
  && G.pullCommando('rebase') === 'git pull --rebase')
t('en iets onbekends spoelt hoogstens vooruit — nooit ongevraagd samenvoegen',
  G.pullCommando('zomaar') === 'git pull --ff-only' && G.pullCommando() === 'git pull --ff-only')

for (const sleutel of ['git.achter.tekstVuil', 'git.achter.stashMislukt', 'git.achter.mislukt',
                       'git.achter.knop.ffonly', 'git.achter.knop.merge', 'git.achter.knop.rebase',
                       'git.achter.knopWegzetten.ffonly', 'git.achter.knopWegzetten.merge',
                       'git.achter.knopWegzetten.rebase']) {
  t('achterstand-tekst ' + sleutel + ' bestaat in nl en en', !!nl[sleutel] && !!en[sleutel])
}

const rendererAchter = fs.readFileSync(path.join(APP, 'renderer.js'), 'utf8')
t('de vraag komt nooit over het inlogscherm heen',
  /async function wachtOpVrijVenster\(/.test(rendererAchter)
  && /while \(inlogBezig \|\| vraagKlaar\)/.test(rendererAchter)
  && /if \(!await wachtOpVrijVenster\(\)\) return/.test(rendererAchter))
t('en kijkt pas ná het inloggen welk project openstaat',
  /await wachtOpVrijVenster\(\)\) return[\s\S]{0,400}const p = projects\.find\(x => x\.id === activeId\)/.test(rendererAchter))
t('na het wisselen van account wordt er opnieuw gekeken',
  /await ververesAlleGitStaten\(true\)[\s\S]{0,220}controleerAchterstand\(\)/.test(rendererAchter))
t('weggezet werk komt na het ophalen weer terug',
  /stashPopCommando\(bovenste\.ref\)/.test(rendererAchter))
t('en bij een mislukte stash wordt er niets opgehaald',
  /git\.achter\.stashMislukt[\s\S]{0,80}return/.test(rendererAchter))

// ── Een blijven staan index.lock ─────────────────────────────────────────────
// De aanleiding: een afgebroken git liet zijn slotbestand staan en daarna
// weigerde élke commit, met een melding die je de verkenner in stuurt.
t('de melding van git wordt herkend, met het pad erbij',
  (G.gitSlotFout("fatal: Unable to create 'C:/x/.git/index.lock': File exists.") || {}).pad
  === 'C:/x/.git/index.lock')
t('ook de tweede zin, zonder pad',
  !!G.gitSlotFout('Another git process seems to be running in this repository'))
t('een gewone fout is geen slot', G.gitSlotFout('error: pathspec did not match') === null)
t('en niets is ook geen slot', G.gitSlotFout('') === null && G.gitSlotFout(null) === null)

for (const sleutel of ['git.slot.titel', 'git.slot.rustigTekst', 'git.slot.drukTekst',
                       'git.slot.netwerkTekst',
                       'git.slot.wegTekst', 'git.slot.eigenTekst', 'git.slot.ouderdomNet',
                       'git.slot.ouderdomMin', 'git.slot.draaien', 'git.slot.opnieuw',
                       'git.slot.weghalen', 'git.slot.weggehaald', 'git.slot.mislukt']) {
  t('slot-tekst ' + sleutel + ' bestaat in nl en en', !!nl[sleutel] && !!en[sleutel])
}

const mainSlot = fs.readFileSync(path.join(APP, 'main.js'), 'utf8')
t('main kan het slot bekijken en weghalen',
  /ipcMain\.handle\('git:slotInfo'/.test(mainSlot) && /ipcMain\.handle\('git:slotWeg'/.test(mainSlot))
t('maar niet terwijl de app zelf iets draait',
  /ipcMain\.handle\('git:slotWeg'[\s\S]{0,400}if \(activeProc\) return \{ ok: false/.test(mainSlot))
t('en alleen in een map die bij dit account hoort',
  /ipcMain\.handle\('git:slotWeg'[\s\S]{0,200}padToegestaan\(dir\)/.test(mainSlot))
t('git-processen worden nooit afgeschoten',
  !/taskkill[^\n]*git/i.test(mainSlot)
  && !/ipcMain\.handle\('git:slotWeg'[\s\S]{0,400}(taskkill|process\.kill)/.test(mainSlot))

const rendererSlot = fs.readFileSync(path.join(APP, 'renderer.js'), 'utf8')
t('de renderer biedt het aan en probeert daarna opnieuw',
  /async function regelGitSlot\(/.test(rendererSlot)
  && /geenSlotHerstel: true/.test(rendererSlot))
t('op een netwerkpad eerst een stille wachtronde',
  /padIsNetwerk\(pad\)/.test(rendererSlot)
  && /setTimeout\(r, 5000\)/.test(rendererSlot))
t('en houdt opnieuw primair tot twee minuten ouderdom',
  /netwerkGeduld/.test(rendererSlot) && /120000/.test(rendererSlot))
t('en probeert maar één keer opnieuw, geen kringetje',
  /if \(!opties\.geenSlotHerstel\)/.test(rendererSlot))

t('zoeken op naam', G.filterRepos(uitJson, 'music').length === 1)
t('losse woorden mogen door elkaar', G.filterRepos(uitJson, 'dd music').length === 1)
t('de omschrijving telt mee', G.filterRepos(uitJson, 'muziek').length === 1)
t('zonder zoekterm alles', G.filterRepos(uitJson, '').length === 2)
t('niets gevonden is een lege lijst', G.filterRepos(uitJson, 'zzz').length === 0)

// De teksten van de kiezer, in beide talen — anders staat er een sleutelnaam.
for (const sleutel of ['modal.project.gitRepoKiezen', 'modal.project.gitRepoZoek',
                       'modal.project.gitRepoLaden', 'modal.project.gitRepoLeeg',
                       'modal.project.gitRepoNiets', 'modal.project.gitRepoMeer',
                       'modal.project.gitRepoGeenGh', 'modal.project.gitRepoNietIngelogd',
                       'modal.project.gitRepoMislukt', 'modal.project.gitRepoInloggen',
                       'modal.project.gitRepoHerladen', 'modal.project.gitCloneOf',
                       'modal.project.gitRepoAl', 'modal.project.gitRepoAllesAl']) {
  t('kiezer-tekst ' + sleutel + ' bestaat in nl en en', !!nl[sleutel] && !!en[sleutel])
}
t('de repolijst heeft opmaak in style.css',
  css.includes('.git-repo-kiezer {') && css.includes('.git-repo-rij {'))
t('de kop is een knop om in en uit te klappen',
  html.includes('id="btn-git-repos"') && css.includes('.git-repo-kop-knop {'))
t('en de lijst staat niet dichtgeklapt in de html',
  /id="f-git-repos"(?![^>]*\bhidden\b)/.test(html))


// ── Een koppeling die geen koppeling is ──────────────────────────────────────
// De aanleiding: een project met een remote in .git/config naar een repo die
// nooit is aangemaakt. De app zei "gekoppeld", haalde de koppelknop weg en zette
// er push/pull/fetch voor in de plaats — knoppen die alleen een foutmelding
// konden geven. Een adres is geen bewijs; deze tests bewaken dat verschil.

const repoMetRemote = (extra = {}) => G.maakStaat(Object.assign(
  { beschikbaar: true, isRepo: true, remotes: ['origin'], branch: 'main', commits: true }, extra))

t('remote maar nog niet nagekeken heet onbekend',
  repoMetRemote().koppeling === 'onbekend')
t('en telt dan gewoon als gekoppeld',
  repoMetRemote().gekoppeld === true)
t('geen remote blijft geen',
  G.maakStaat({ isRepo: true, remotes: [] }).koppeling === 'geen')
t('nagekeken en goed is ok',
  repoMetRemote({ remoteOk: true }).koppeling === 'ok')
t('nagekeken en fout is stuk',
  repoMetRemote({ remoteOk: false, remoteReden: 'weg' }).koppeling === 'stuk')

t('een kapotte koppeling telt niet als gekoppeld',
  repoMetRemote({ remoteOk: false }).gekoppeld === false)
t('maar er stáát wel een remote — dat is iets anders',
  repoMetRemote({ remoteOk: false }).heeftRemote === true)
t('zonder repo staat er ook geen remote',
  G.maakStaat({ isRepo: false, remotes: ['origin'] }).heeftRemote === false)

// Dit is de knoppenrij waar de gebruiker over viel.
{
  const stuk = repoMetRemote({ remoteOk: false, remoteReden: 'weg', vuil: 0 })
  const ids = G.zichtbareGitIds(stuk)
  t('bij een kapotte koppeling komt de koppelknop terug', ids.includes('git-koppelen'))
  t('en push staat er niet meer', !ids.includes('git-push'))
  t('pull ook niet', !ids.includes('git-pull'))
  t('fetch ook niet', !ids.includes('git-fetch'))
  t('de lokale knoppen blijven wel', ids.includes('git-commit') && ids.includes('git-log'))
}
{
  const ids = G.zichtbareGitIds(repoMetRemote({ remoteOk: true }))
  t('een werkende koppeling laat de koppelknop weg', !ids.includes('git-koppelen'))
  t('en zet push erbij', ids.includes('git-push'))
}
{
  // Zonder deze regel is elke gebruiker zonder internet zijn push-knop kwijt.
  const ids = G.zichtbareGitIds(repoMetRemote())
  t('ongecontroleerd houdt push gewoon zichtbaar', ids.includes('git-push'))
  t('en laat de koppelknop weg', !ids.includes('git-koppelen'))
}

// ── De uitslag lezen ─────────────────────────────────────────────────────────
t('geen verbinding is netwerk', G.remoteFoutReden('fatal: unable to access: Could not resolve host: github.com') === 'netwerk')
t('timeout is netwerk', G.remoteFoutReden('Failed to connect: Operation timed out') === 'netwerk')
t('repo niet gevonden is weg', G.remoteFoutReden('remote: Repository not found.') === 'weg')
t('geen inlog is inloggen', G.remoteFoutReden('fatal: could not read Username for https://github.com') === 'inloggen')
t('geweigerde inlog is inloggen', G.remoteFoutReden('remote: Invalid username or password') === 'inloggen')
t('iets anders is onbekend', G.remoteFoutReden('fatal: iets raars') === 'onbekend')

t('exit 0 is goed', G.remoteUitslag(0, '').ok === true)
// Het belangrijkste van de hele controle: zonder internet mag hij niets
// concluderen. Anders halen we knoppen weg omdat de wifi even wegviel.
t('geen netwerk is geen oordeel', G.remoteUitslag(128, 'Could not resolve host: github.com').ok === null)
t('onbekende fout is ook geen oordeel', G.remoteUitslag(1, 'iets raars').ok === null)
t('repo weg is wel een oordeel', G.remoteUitslag(128, 'Repository not found').ok === false)
t('geen toegang is wel een oordeel', G.remoteUitslag(128, 'could not read Username').ok === false)
t('een netwerkfout laat de staat op onbekend',
  repoMetRemote({ remoteOk: G.remoteUitslag(128, 'Could not resolve host').ok }).koppeling === 'onbekend')

// ── Verkeerd GitHub-account (403 denied to …) ────────────────────────────────
const fout403 = "remote: Permission to redubbledd1-ops/CommandDeck.git denied to redubbledD.\n"
  + "fatal: unable to access 'https://github.com/redubbledd1-ops/CommandDeck/': The requested URL returned error: 403"
t('403 is inloggen, geen dood adres', G.remoteFoutReden(fout403) === 'inloggen')
t('denied to levert de verkeerde gebruiker', G.parseDeniedGebruiker(fout403) === 'redubbledD')
t('zonder die zin geen naam', G.parseDeniedGebruiker('fatal: Authentication failed') === '')
t('eigenaar uit de 403-regel', G.githubEigenaarUitUrl(fout403) === 'redubbledd1-ops')
t('eigenaar uit een https-adres',
  G.githubEigenaarUitUrl('https://github.com/redubbledd1-ops/CommandDeck.git') === 'redubbledd1-ops')
t('eigenaar uit ssh', G.githubEigenaarUitUrl('git@github.com:redubbledd1-ops/CommandDeck.git') === 'redubbledd1-ops')
t('geen github-adres levert geen eigenaar', G.githubEigenaarUitUrl('https://gitlab.com/x/y.git') === '')
t('github-namen zijn hoofdletterongevoelig', G.zelfdeGhNaam('redubbledD', 'redubbledd') === true)
t('lege namen zijn niet gelijk', G.zelfdeGhNaam('', '') === false)

{
  const p = G.pushInlogProbleem({ tekst: fout403, verwacht: 'redubbledd1-ops' })
  t('push-inlog ziet het verkeerde account', p && p.verkeerd === true)
  t('en noemt wie er probeerde', p.als === 'redubbledD')
  t('en wie het moet zijn', p.doel === 'redubbledd1-ops')
  t('een netwerkfout is geen inlogprobleem',
    G.pushInlogProbleem({ tekst: 'Could not resolve host: github.com' }) === null)
  t('zonder fouttekst blijft het oordeel staan als we de namen al weten',
    G.pushInlogProbleem({ alsNu: 'redubbledD', verwacht: 'redubbledd1-ops' }).verkeerd === true)
}

t('ls-remote vraagt niet om tags', G.lsRemoteArgs('origin').join(' ') === 'ls-remote -h -- origin')
t('en gebruikt de meegegeven remote', G.lsRemoteArgs('github').includes('github'))

// ── Welke remote is "de" remote ──────────────────────────────────────────────
// Het echte project had er twee: origin en github, met de branch die github
// volgde. Blind naar origin pushen zet je werk in de verkeerde repo.
t('de remote van de upstream wint van origin',
  G.maakStaat({ isRepo: true, remotes: ['origin', 'github'], upstream: 'github/master' }).remote === 'github')
t('zonder upstream is origin de keuze',
  G.maakStaat({ isRepo: true, remotes: ['github', 'origin'] }).remote === 'origin')
t('en anders gewoon de eerste',
  G.maakStaat({ isRepo: true, remotes: ['github'] }).remote === 'github')
t('een upstream die niet in de lijst staat telt niet mee',
  G.maakStaat({ isRepo: true, remotes: ['origin'], upstream: 'weg/main' }).remote === 'origin')

// ── Herstellen ───────────────────────────────────────────────────────────────
t('kapot gaat vóór alle andere stappen',
  G.koppelStap(repoMetRemote({ remoteOk: false }), true) === G.KOPPEL_HERSTEL)
t('ook zonder gh', G.koppelStap(repoMetRemote({ remoteOk: false }), false) === G.KOPPEL_HERSTEL)
t('een werkende koppeling is gewoon klaar',
  G.koppelStap(repoMetRemote({ remoteOk: true }), true) === 'gekoppeld')

{
  const stuk = repoMetRemote({ remotes: ['origin', 'github'], upstream: 'github/main',
                               remoteOk: false, remoteReden: 'weg', remoteUrl: 'https://github.com/a/b.git' })
  // Zonder het weghalen van de oude remote loopt gh repo create stuk op
  // "remote origin already exists" — en dan is er niets opgelost.
  const nieuw = G.herstelCommando(stuk, { naam: 'DayKit' })
  t('opnieuw aanmaken haalt eerst het dode adres weg', nieuw.startsWith('git remote remove github &&'))
  t('en maakt hem privé aan', nieuw.includes('gh repo create DayKit --private --source=. --push'))
  t('publiek kan ook', G.herstelCommando(stuk, { naam: 'DayKit', prive: false }).includes('--public'))
  t('een rare naam wordt opgeschoond', G.herstelCommando(stuk, { naam: 'Day Kit!' }).includes('gh repo create Day-Kit '))

  const ander = G.herstelCommando(stuk, { url: 'redubbledd1-ops/DayKit' })
  t('een ander adres wordt gezet, niet toegevoegd', ander.startsWith('git remote set-url github https://github.com/redubbledd1-ops/DayKit.git'))
  t('en meteen gepusht met upstream', ander.includes('&& git push -u github main'))
  t('een onzin-adres levert geen commando', G.herstelCommando(stuk, { url: 'zomaar wat' }) === null)
  t('zonder naam en zonder adres ook niet', G.herstelCommando(stuk, {}) === null)

  t('ontkoppelen haalt de juiste remote weg', G.ontkoppelCommando(stuk) === 'git remote remove github')
  t('zonder remote valt er niets te ontkoppelen', G.ontkoppelCommando(G.maakStaat({ isRepo: true })) === null)

  const pro = G.koppelingProbleem(stuk)
  t('het probleem noemt de remote', pro.remote === 'github')
  t('en het adres', pro.url === 'https://github.com/a/b.git')
  t('en wijst naar de juiste tekst', pro.sleutel === 'git.koppel.stuk.weg')
  t('bij geen toegang naar de andere tekst',
    G.koppelingProbleem(repoMetRemote({ remoteOk: false, remoteReden: 'inloggen' })).sleutel === 'git.koppel.stuk.inloggen')
  t('een gezonde koppeling heeft geen probleem', G.koppelingProbleem(repoMetRemote({ remoteOk: true })) === null)
}

// De reden hoort alleen bij een kapotte koppeling. Blijft hij hangen bij een
// herstelde, dan blijft de app een probleem melden dat er niet meer is.
t('de reden verdwijnt zodra het weer werkt',
  repoMetRemote({ remoteOk: true, remoteReden: 'weg' }).remoteReden === '')

// ── Wat de rest van de app ermee doet ────────────────────────────────────────
t('de indicator meldt een kapotte koppeling',
  G.indicator(repoMetRemote({ remoteOk: false })).koppelingStuk === true)
t('en zwijgt als het goed is',
  G.indicator(repoMetRemote({ remoteOk: true })).koppelingStuk === false)
// Een dood adres fetchen levert alleen maar foutmeldingen op.
t('een kapotte koppeling wordt niet gefetcht',
  G.magFetchen(repoMetRemote({ remoteOk: false }), 0) === false)
t('een werkende wel', G.magFetchen(repoMetRemote({ remoteOk: true }), 0) === true)
// Werk dat alleen hier staat blijft onveilig, ook als de koppeling stuk is —
// juist dan, want er is geen enkele plek waar het nog staat.
t('niet-gepusht werk blijft onveilig bij een kapotte koppeling',
  G.indicator(repoMetRemote({ remoteOk: false, ahead: 3 })).onveilig === true)
t('pushen kan niet zonder werkende koppeling',
  G.pushCommando(repoMetRemote({ remoteOk: false })) === null)

// ── De teksten bestaan ───────────────────────────────────────────────────────
for (const sleutel of ['git.ind.broken', 'git.ind.brokenTitle', 'git.repair.title',
                       'git.repair.new', 'git.repair.url', 'git.repair.drop',
                       'git.repair.dropTitle', 'git.repair.dropText',
                       'git.koppel.stuk.weg', 'git.koppel.stuk.inloggen',
                       'git.push.inlogTitel', 'git.push.inlogTekstVerkeerd',
                       'git.push.inlogTekstGeenGh', 'git.push.inlogInstalleren',
                       'git.push.inlogUitlegTekst', 'git.push.inlogOpnieuw']) {
  t('tekst ' + sleutel + ' staat in nl en en', !!nl[sleutel] && !!en[sleutel])
}
t('de kapotte-koppeling-indicator heeft opmaak in style.css',
  fs.readFileSync(path.join(APP, 'style.css'), 'utf8').includes('.git-ind-stuk'))

// ── De bedrading ─────────────────────────────────────────────────────────────
// Deze controle kost netwerk. Staat hij in git:info, dan draait hij mee met de
// poll-lus en doet de app om de dertig seconden een netwerkaanroep per project.
{
  const main = fs.readFileSync(path.join(APP, 'main.js'), 'utf8')
  t('main heeft een aparte controle-aanroep', main.includes("ipcMain.handle('git:remoteCheck'"))
  t('en een manier om het oordeel te vergeten', main.includes("ipcMain.handle('git:remoteVergeet'"))
  t('de controle vraagt nooit om een wachtwoord', main.includes('GIT_TERMINAL_PROMPT'))
  t('en heeft een tijdslimiet', /timeout:\s*15000/.test(main))
  // Alleen de body van de handler telt; onze eigen uitleg erboven noemt hem wel.
  const infoBody = main.slice(main.indexOf("ipcMain.handle('git:info'"))
    .slice(0, main.slice(main.indexOf("ipcMain.handle('git:info'")).indexOf('\n})'))
  t('git:info bestaat nog', infoBody.length > 200)
  t('git:info doet zelf geen netwerkaanroep', !infoBody.includes('controleerRemote'))
  t('git:info leest wel wat er al bekend is', infoBody.includes('remoteUitCache'))
  t('git:info blokkeert de hoofdthread niet', infoBody.includes('gitUitAsync') && infoBody.includes('Promise.all'))
  t('een poll tekent niet opnieuw als er niets zichtbaars veranderde',
    fs.readFileSync(path.join(APP, 'renderer.js'), 'utf8').includes('zelfdeGitWeergave'))

  const pre = fs.readFileSync(path.join(APP, 'preload.js'), 'utf8')
  t('de renderer kan erbij', pre.includes('gitRemoteCheck') && pre.includes('gitRemoteVergeet'))

  const ren = fs.readFileSync(path.join(APP, 'renderer.js'), 'utf8')
  t('de renderer controleert koppelingen', ren.includes('async function controleerKoppeling'))
  t('en doet dat voor alle projecten na het laden', ren.includes('controleerAlleKoppelingen()'))
  t('koppelen heeft een eigen herstelweg', ren.includes('async function herstelKoppeling'))
  // Wie alleen het adres wil verbeteren, hoeft daar geen gh voor te installeren.
  // Wie alleen het adres verbetert of de koppeling weghaalt, hoeft daar geen
  // gh voor te installeren: die wegen zijn klaar vóór gh ter sprake komt.
  {
    const body = ren.slice(ren.indexOf('async function herstelKoppeling'))
    const gh = body.indexOf('zorgVoorGithub')
    t('herstellen vraagt uiteindelijk wel om gh', gh > 0)
    for (const weg of ["keuze === 'los'", "keuze === 'url'"]) {
      const i = body.indexOf(weg)
      t('herstelweg ' + weg + ' komt vóór gh', i > 0 && i < gh)
      t('en is daarvoor al klaar', body.slice(i, gh).includes('return'))
    }
  }
  t('herstellen biedt aan het dode adres weg te halen', ren.includes('GitTools.ontkoppelCommando'))
  t('en biedt een nieuwe repo of een ander adres', ren.includes('GitTools.herstelCommando'))
  t('eerste opzet regelt gh zelf', ren.includes('async function zorgVoorGithub'))
  t('na een mislukte push wordt opnieuw gekeken',
    ren.includes('async function naMislukteRemote') && /git-push/.test(ren)
    && ren.includes('herstelVerkeerdeGithub'))
  t('een 403 opent niet meteen een nieuwe repo',
    /reden === 'inloggen'/.test(ren) && ren.includes('slaInlogOver'))
  t('gh wordt aangeboden, nooit stiekem geïnstalleerd',
    ren.includes('git.push.inlogInstalleren') && ren.includes('toonGhZelfDoen'))
  t('inloggen na 403 gebruikt een kopieerbare link, niet de standaardbrowser',
    /herstelVerkeerdeGithub[\s\S]*?kopieerLink: true/.test(ren))
  t('vóór een push wordt het GitHub-account rechtgezet',
    ren.includes('zorgVoorJuisteGithubPush'))
  t('bij het wisselen van account vervalt wat we wisten', ren.includes('gitRemoteGedaan.clear()'))
}


// ── De git-sectie bij de projectinstellingen ─────────────────────────────────
// Het onderhoud aan de koppeling hoort niet tussen de dagelijkse knoppen. Wat
// hier getest wordt is het oordeel: welke problemen ziet de app, in welke
// volgorde, en met welke knop erbij.

t('twee regels per remote worden één remote',
  G.parseRemoteRegels('origin\thttps://a/b.git (fetch)\norigin\thttps://a/b.git (push)').length === 1)
t('en het adres komt mee',
  G.parseRemoteRegels('origin\thttps://a/b.git (fetch)')[0].url === 'https://a/b.git')
t('meerdere remotes blijven apart',
  G.parseRemoteRegels('github\thttps://a/b.git (fetch)\norigin\thttps://a/c.git (fetch)')
    .map(r => r.naam).join(',') === 'github,origin')
t('rommel levert niets op', G.parseRemoteRegels('').length === 0)
t('de staat neemt de adressen over',
  G.maakStaat({ isRepo: true, remoteLijst: [{ naam: 'origin', url: 'https://a/b.git' }] }).remoteUrl === 'https://a/b.git')
t('en leidt de namen eruit af',
  G.maakStaat({ isRepo: true, remoteLijst: [{ naam: 'origin', url: 'u' }] }).remotes.join() === 'origin')
t('het adres hoort bij de gekozen remote, niet bij de eerste',
  G.maakStaat({ isRepo: true, upstream: 'github/main',
                remoteLijst: [{ naam: 'origin', url: 'fout' }, { naam: 'github', url: 'goed' }] }).remoteUrl === 'goed')

const probIds = (s) => G.gitProblemen(s).map(p => p.id)
const gezond = { beschikbaar: true, isRepo: true, remotes: ['origin'], branch: 'main',
                 commits: true, upstream: 'origin/main', remoteOk: true, naam: 'a', email: 'b@c' }

t('een gezonde repo heeft geen problemen', probIds(G.maakStaat(gezond)).length === 0)
t('geen git is het enige dat telt',
  probIds(G.maakStaat({ beschikbaar: false })).join() === 'geen-git')
t('geen repo ook',
  probIds(G.maakStaat({ beschikbaar: true, isRepo: false })).join() === 'geen-repo')
t('zonder identiteit weigert git te committen — dat is een fout',
  probIds(G.maakStaat({ ...gezond, naam: '', email: '' })).includes('geen-identiteit'))
t('een half ingevulde identiteit telt ook',
  probIds(G.maakStaat({ ...gezond, email: '' })).includes('geen-identiteit'))
t('conflicten worden gemeld',
  probIds(G.maakStaat({ ...gezond, conflicten: 2, vuil: 2 })).includes('conflicten'))
t('detached HEAD wordt gemeld',
  probIds(G.maakStaat({ ...gezond, branch: null })).includes('losgekoppeld'))
t('maar een verse repo zonder commits heet niet losgekoppeld',
  !probIds(G.maakStaat({ beschikbaar: true, isRepo: true, commits: false, branch: null, naam: 'a', email: 'b' })).includes('losgekoppeld'))
t('een verse repo krijgt wel "nog niets vastgelegd"',
  probIds(G.maakStaat({ beschikbaar: true, isRepo: true, commits: false, naam: 'a', email: 'b' })).includes('geen-commits'))
t('een repo zonder remote krijgt "hangt nergens aan"',
  probIds(G.maakStaat({ ...gezond, remotes: [], upstream: null, remoteOk: null })).includes('geen-remote'))
t('een branch die nog nooit gepusht is wordt gemeld',
  probIds(G.maakStaat({ ...gezond, upstream: null })).includes('geen-upstream'))
t('een kapotte koppeling staat bovenaan',
  probIds(G.maakStaat({ ...gezond, remoteOk: false, remoteReden: 'weg' }))[0] === 'koppeling-stuk')
t('twee remotes is een let-op, geen fout',
  G.gitProblemen(G.maakStaat({ ...gezond, remotes: ['origin', 'github'] }))
    .find(p => p.id === 'meerdere-remotes').ernst === 'let-op')

// Dit is DayKit: de branch volgt github, maar dat adres is er niet meer.
t('een upstream naar een verdwenen remote wordt gemeld',
  probIds(G.maakStaat({ ...gezond, remotes: ['origin'], upstream: 'github/master' })).includes('upstream-weg'))
t('en zwijgt als de remote er wel is',
  !probIds(G.maakStaat({ ...gezond, remotes: ['origin', 'github'], upstream: 'github/master' })).includes('upstream-weg'))

// Bij een kapotte koppeling is "nog nooit gepusht" ruis: eerst het adres.
t('geen dubbele meldingen bij een kapotte koppeling',
  !probIds(G.maakStaat({ ...gezond, upstream: null, remoteOk: false, remoteReden: 'weg' })).includes('geen-upstream'))

t('elk probleem heeft een ernst',
  G.gitProblemen(G.maakStaat({ ...gezond, remoteOk: false, remotes: ['a', 'b'], naam: '' }))
    .every(p => ['fout', 'let-op', 'info'].includes(p.ernst)))
t('het ergste bepaalt de kleur',
  G.ergsteErnst([{ ernst: 'let-op' }, { ernst: 'fout' }]) === 'fout')
t('let-op wint van info', G.ergsteErnst([{ ernst: 'info' }, { ernst: 'let-op' }]) === 'let-op')
t('niets is niets', G.ergsteErnst([]) === '')

t('een adres weghalen noemt de remote', G.remoteWegCommando('github') === 'git remote remove github')
t('zonder naam geen commando', G.remoteWegCommando('') === null)
t('een adres wijzigen zet, niet toevoegen',
  G.remoteUrlCommando('origin', 'a/b') === 'git remote set-url origin https://github.com/a/b.git')
t('een onzin-adres wijzigt niets', G.remoteUrlCommando('origin', 'zomaar wat') === null)

// Elke probleem-id en elke actie moet een tekst hebben, anders staat er een
// lege regel in de sectie waar juist de uitleg hoort.
{
  const alle = new Set()
  const acties = new Set()
  const staten = [
    G.maakStaat({ beschikbaar: false }),
    G.maakStaat({ beschikbaar: true, isRepo: false }),
    G.maakStaat({ ...gezond, naam: '', conflicten: 1, branch: null, remoteOk: false, remoteReden: 'weg', remotes: ['a', 'b'] }),
    G.maakStaat({ ...gezond, upstream: null }),
    G.maakStaat({ ...gezond, remotes: [], upstream: null, remoteOk: null }),
    G.maakStaat({ beschikbaar: true, isRepo: true, commits: false, naam: 'a', email: 'b' }),
    G.maakStaat({ ...gezond, remotes: ['origin'], upstream: 'weg/main' }),
  ]
  for (const s of staten) for (const p of G.gitProblemen(s)) { alle.add(p.id); if (p.actie) acties.add(p.actie) }
  t('alle elf probleemsoorten komen in de tests voor', alle.size === 11)
  for (const id of alle) t('tekst voor probleem ' + id, !!nl['gitset.prob.' + id] && !!en['gitset.prob.' + id])
  for (const a of acties) t('tekst voor actie ' + a, !!nl['gitset.actie.' + a] && !!en['gitset.actie.' + a])
}

for (const sleutel of ['modal.project.gitLabel', 'modal.project.gitCloneLabel',
                       'modal.project.gitCloneTekst', 'modal.project.gitCloneDoel',
                       'git.clone.misluktTitel', 'git.clone.misluktTekst', 'git.clone.geenOuder',
                       'gitset.kopRepo', 'gitset.kopGeenRepo',
                       'gitset.koppelOk', 'gitset.koppelStuk', 'gitset.koppelGeen', 'gitset.koppelOnbekend',
                       'gitset.adresWijzigen', 'gitset.adresWeg', 'gitset.wegTitel', 'gitset.wegTekst',
                       'gitset.nietsMis', 'gitset.controleren', 'gitset.herstellen', 'gitset.koppelen',
                       'gitset.opnieuwKoppelen', 'gitset.remotesTitel', 'gitset.remotesTekst', 'gitset.laden']) {
  t('tekst ' + sleutel + ' staat in nl en en', !!nl[sleutel] && !!en[sleutel])
}

{
  const css = fs.readFileSync(path.join(APP, 'style.css'), 'utf8')
  for (const klasse of ['#git-sectie', '.git-set-kop', '.git-set-status', '.git-set-remote',
                        '.git-set-probleem', '.git-set-acties', '.git-set-ident', '.btn-mini']) {
    t('opmaak voor ' + klasse, css.includes(klasse))
  }
  // Zonder deze regels is een fout niet van een waarschuwing te onderscheiden.
  t('fout en let-op zien er anders uit',
    css.includes('.git-set-probleem.e-fout') && css.includes('.git-set-probleem.e-let-op'))

  t('index.html heeft de git-sectie in het projectvenster',
    html.includes('id="f-git-sectie"') && html.includes('id="git-sectie"'))

  const ren = fs.readFileSync(path.join(APP, 'renderer.js'), 'utf8')
  t('de sectie wordt getekend', ren.includes('function tekenGitSectie'))
  // Een nieuw project heeft nog geen map; dan valt er niets te zeggen.
  t('en blijft weg zolang er geen map is', /vak\.hidden = !p \|\| !actieveLocPad\(p\)/.test(ren))
  t('de sectie gaat open bij bewerken', /openEditModal[\s\S]{0,1200}toonGitSectie\(p\)/.test(ren))
  t('en leeg bij een nieuw project', /openNewModal[\s\S]{0,900}toonGitSectie\(null\)/.test(ren))
  t('maar wel een veld om te clonen', html.includes('id="f-git-clone"') && html.includes('id="f-git-url"'))
  t('een nieuw project toont dat veld', /openNewModal[\s\S]{0,1200}toonCloneVeld\(true\)/.test(ren))
  t('bewerken verbergt het', /openEditModal[\s\S]{0,1600}toonCloneVeld\(false\)/.test(ren))
  t('na clonen wordt de git-staat nagekeken',
    /async function haalRepoBinnen/.test(ren) && /controleerKoppeling\(doel, true\)/.test(ren))
  t('clone draait in de map erboven, want de doelmap bestaat nog niet',
    /git-clone['"], \{ cwd: ouder \}/.test(ren))
  t('je kunt een los adres weghalen', ren.includes('data-remote-weg'))
  t('en een los adres wijzigen', ren.includes('data-remote-url'))
  t('elk probleem krijgt zijn eigen knop', ren.includes('data-git-actie'))
  // De klacht die hier begon: de app zag het niet. Dus moet je het altijd zelf
  // kunnen laten kijken, ook als de app niets mis ziet.
  t('controleren kan altijd met de hand', ren.includes("id=\"git-set-check\""))
  t('herstellen ook', ren.includes("id=\"git-set-herstel\""))
}


// ── .gitignore en lange paden ────────────────────────────────────────────────
// De aanleiding: `git init -b main` in een Android-map, daarna `git add -A`.
// Dat probeerde app/build/ mee te nemen, liep vast op een pad langer dan
// Windows aankan ("Filename too long"), en liet een repo zonder één commit
// achter. Alle drie de schakels — geen .gitignore, bouwmappen die meegaan,
// lange paden uit — zijn hier apart afgedekt.

t('gradle wordt herkend', G.projectSoorten(['build.gradle.kts', 'app']).join() === 'gradle')
t('flutter ook', G.projectSoorten(['pubspec.yaml', 'lib']).join() === 'flutter')
t('node ook', G.projectSoorten(['package.json']).join() === 'node')
t('python ook', G.projectSoorten(['pyproject.toml']).join() === 'python')
t('een sln-bestand telt op achtervoegsel',
  G.projectSoorten(['MijnApp.sln']).join() === 'dotnet')
// Flutter brengt zijn eigen android/-map met gradle mee. Twee blokken die
// allebei build/ negeren is alleen maar ruis.
t('flutter overschrijft gradle',
  G.projectSoorten(['pubspec.yaml', 'build.gradle']).join() === 'flutter')
t('meerdere soorten mogen naast elkaar',
  G.projectSoorten(['package.json', 'Cargo.toml']).join() === 'node,rust')
t('een lege map levert niets op', G.projectSoorten([]).length === 0)
t('en onzin ook niet', G.projectSoorten(['leesmij.txt']).length === 0)

{
  const g = G.gitignoreVoor(['gradle'])
  // Precies de mappen waar het op stukliep.
  t('gradle negeert de bouwmap', g.includes('\nbuild/\n') && g.includes('*/build/'))
  t('en .gradle', g.includes('.gradle/'))
  t('en local.properties, want daar staat een pad van deze pc in', g.includes('local.properties'))
  t('en de keystore, want daarmee onderteken je je app', g.includes('*.jks') && g.includes('*.keystore'))

  t('node negeert node_modules', G.gitignoreVoor(['node']).includes('node_modules/'))
  t('flutter negeert .dart_tool', G.gitignoreVoor(['flutter']).includes('.dart_tool/'))

  // Deze twee staan er altijd in, ongeacht het soort project.
  const kaal = G.gitignoreVoor([])
  t('geheimen worden altijd genegeerd', kaal.includes('\n.env\n'))
  t('maar een voorbeeldbestand niet', kaal.includes('!.env.example'))
  t('en systeemrommel ook altijd', kaal.includes('.DS_Store') && kaal.includes('Thumbs.db'))
  t('een onbekend soort levert nog steeds iets bruikbaars op', kaal.trim().length > 40)
  t('een onbekend soort verzint geen bouwmappen', !kaal.includes('node_modules'))
  t('elk blok legt zichzelf uit', G.gitignoreVoor(['node']).split('\n\n').every(b => b.trim().startsWith('#')))
}

t('app/build wordt als bouwrommel herkend', G.bouwrommel(['app/build/']).length === 1)
t('node_modules ook', G.bouwrommel(['node_modules/']).length === 1)
t('ook diep in de boom', G.bouwrommel(['pakket/sub/target/x.o']).length === 1)
t('backslashes tellen ook mee', G.bouwrommel(['app\\build\\x']).length === 1)
t('gewone broncode niet', G.bouwrommel(['lib/main.dart', 'app/src/Main.kt']).length === 0)
// "building.md" is geen bouwmap. Alleen hele padstukken tellen.
t('een naam die er alleen op lijkt telt niet', G.bouwrommel(['docs/building.md']).length === 0)
t('elke map maar één keer', G.bouwrommel(['build/', 'build/']).length === 1)

{
  const basis = { beschikbaar: true, isRepo: true, branch: 'main', commits: true,
                  upstream: 'origin/main', naam: 'a', email: 'b@c', remoteOk: true,
                  remotes: ['origin'] }
  const ids = (s) => G.gitProblemen(G.maakStaat(s)).map(p => p.id)

  t('geen .gitignore wordt gemeld', ids({ ...basis, gitignore: false }).includes('geen-gitignore'))
  t('en is een fout zodra er ook echt rommel klaarstaat',
    G.gitProblemen(G.maakStaat({ ...basis, gitignore: false, nieuw: 1, nieuweBestanden: ['app/build/'] }))
      .find(p => p.id === 'geen-gitignore').ernst === 'fout')
  t('zonder rommel is het een let-op',
    G.gitProblemen(G.maakStaat({ ...basis, gitignore: false }))
      .find(p => p.id === 'geen-gitignore').ernst === 'let-op')
  t('mét .gitignore blijft het stil', !ids({ ...basis, gitignore: true }).includes('geen-gitignore'))
  // Niet gemeten mag nooit een melding worden: in de tests en vóór de eerste
  // ronde weten we het simpelweg niet.
  t('niet gemeten is geen probleem', !ids(basis).includes('geen-gitignore'))
  t('en staat als null in de staat', G.maakStaat(basis).gitignore === null)

  t('bouwrommel ondanks een .gitignore wordt apart gemeld',
    ids({ ...basis, gitignore: true, nieuw: 1, nieuweBestanden: ['node_modules/'] }).includes('bouwmap-in-git'))
  t('maar niet dubbel met "geen .gitignore"',
    !ids({ ...basis, gitignore: false, nieuw: 1, nieuweBestanden: ['app/build/'] }).includes('bouwmap-in-git'))

  t('lange paden uit wordt gemeld op windows',
    ids({ ...basis, windows: true, langePaden: false }).includes('lange-paden'))
  t('maar niet als het aan staat',
    !ids({ ...basis, windows: true, langePaden: true }).includes('lange-paden'))
  // Buiten Windows bestaat het probleem niet; erover beginnen is dan onzin.
  t('en niet buiten windows',
    !ids({ ...basis, windows: false, langePaden: false }).includes('lange-paden'))
  t('lange paden zetten is één configregel', G.langePadenCommando() === 'git config core.longpaths true')
}

for (const sleutel of ['gitignore.titel', 'gitignore.tekst', 'gitignore.schrijven', 'gitignore.klaar',
                       'gitignore.aanvullenTitel', 'gitignore.aanvullenTekst', 'gitignore.aanvullen',
                       'gitignore.mislukt', 'gitignore.geenSoort',
                       'gitignore.rommelTitel', 'gitignore.rommelTekst', 'gitignore.negeren',
                       'gitignore.tochMeenemen', 'gitset.langePadenTekst',
                       'gitset.prob.geen-gitignore', 'gitset.prob.bouwmap-in-git', 'gitset.prob.lange-paden',
                       'gitset.actie.gitignore', 'gitset.actie.langepaden']) {
  t('tekst ' + sleutel + ' staat in nl en en', !!nl[sleutel] && !!en[sleutel])
}

// ── inloggen bij het juiste GitHub-account ───────────────────────────────────
// De klacht: er werd een ander account gekoppeld dan bedoeld. Twee oorzaken.
// De eerste: "openen in browser" gebruikt de standaardbrowser, en die is vaak
// al ingelogd — GitHub keurt de code dan goed voor dát account. Daarom moet de
// link te kopiëren zijn, zodat je zelf een privévenster kunt kiezen.
for (const sleutel of ['git.inlog.codeKopieer', 'git.inlog.linkKopieer', 'git.inlog.codeGekopieerd',
                       'git.inlog.linkGekopieerd', 'git.inlog.linkAutoGekopieerd', 'git.inlog.kopieMislukt',
                       'git.inlog.codeWaarschuwing',
                       'accounts.gitWelkAccountTitel', 'accounts.gitWelkAccountTekst',
                       'accounts.gitKopieerLink', 'accounts.gitHaalTekstExtra',
                       'gitset.identiteit', 'gitset.identiteitKnop', 'gitset.identiteitOnaf']) {
  t('tekst ' + sleutel + ' staat in nl en en', !!nl[sleutel] && !!en[sleutel])
}
t('de knop heet Kopieer link', nl['accounts.gitKopieerLink'] === 'Kopieer link')
{
  const ren = fs.readFileSync(path.join(APP, 'renderer.js'), 'utf8')
  const main = fs.readFileSync(path.join(APP, 'main.js'), 'utf8')
  const pre = fs.readFileSync(path.join(APP, 'preload.js'), 'utf8')

  t('het codevenster kan de link kopiëren', /waarde: 'link'/.test(ren))
  t('en de code apart', /waarde: 'code'/.test(ren))
  t('met een waarschuwing over de standaardbrowser', ren.includes('git.inlog.codeWaarschuwing'))
  t('het identiteitsscherm heeft Kopieer link', ren.includes('accounts.gitKopieerLink'))
  t('en start dan een inlog zonder standaardbrowser', /kopieerLink: keuze === 'link'/.test(ren))
  t('een net-gekoppeld account wordt vanzelf gekozen', /nieuwGhAccount/.test(ren))
  // Het adres komt uit gh zelf, zodat een gewijzigde pagina vanzelf meekomt.
  t('main leest het adres uit de uitvoer van gh', /parseGhLoginUrl/.test(main) && main.includes('github.com/login/device'))
  t('en stuurt code en adres samen door', /send\('git:ghCode', \{ code/.test(main))
  t('zonder de standaardbrowser als je de link kopieert', /geenBrowser/.test(main) && /GH_BROWSER/.test(main))
  t('de oude vorm blijft werken', pre.includes("typeof d === 'string'"))

  // De tweede oorzaak: `gh api user` haalt het áctieve account op. Met meerdere
  // accounts op één pc is dat een gok.
  t('bij meerdere accounts wordt gevraagd welke', ren.includes('accounts.gitWelkAccountTitel'))
  t('en die keuze gaat mee naar main', /gitGhIdentiteit\(gekozenGh\)/.test(ren))
  t('main wisselt dan eerst van account', /auth', 'switch'/.test(main))
  t('preload geeft de naam door', /gitGhIdentiteit: \(u\)/.test(pre))
  t('de git-sectie toont de identiteit', /git-set-identiteit/.test(ren) && css.includes('.git-set-ident'))

  t('main kan een .gitignore voorstellen', main.includes("ipcMain.handle('git:gitignoreVoorstel'"))
  t('en schrijven', main.includes("ipcMain.handle('git:gitignoreSchrijf'"))
  // Overschrijven van een bestaande .gitignore zou werk van de gebruiker
  // weggooien; aanvullen mag wel.
  t('een bestaande wordt aangevuld, niet overschreven', main.includes('appendFileSync'))
  t('de renderer biedt het aan', ren.includes('async function regelGitignore'))
  t('meteen na git init', /KOPPEL_INIT[\s\S]{0,400}regelGitignore/.test(ren))
  // Dit is de plek waar het misging: de commit zelf.
  t('en vóór een commit met bouwrommel erin', /GitTools\.bouwrommel[\s\S]{0,900}regelGitignore/.test(ren))
  t('lange paden zijn met één knop aan te zetten', ren.includes('async function zetLangePaden'))
}

// ── netwerkpaden (UNC) ───────────────────────────────────────────────────────
// cmd.exe weigert een UNC-pad als werkmap, wijkt uit naar C:\Windows en meldt
// dan alsnog exit 0. Herkennen is dus geen luxe: zonder dit draait een commando
// in de verkeerde map terwijl de app "klaar" toont.
t('UNC: server met share',        G.isUncPad('\\\\server\\share') === true)
t('UNC: met submap',              G.isUncPad('\\\\192.168.100.200\\Projecten\\app') === true)
t('UNC: forward slashes tellen ook', G.isUncPad('//server/share') === true)
t('UNC: alleen een servernaam is geen werkmap', G.isUncPad('\\\\server') === false)
t('UNC: gewoon schijfpad is geen UNC', G.isUncPad('C:\\Windows') === false)
t('UNC: gekoppelde letter is geen UNC — dat is juist de uitweg',
  G.isUncPad('P:\\') === false && G.isUncPad('P:\\project\\app') === false)
t('UNC: leeg of niets',           G.isUncPad('') === false && G.isUncPad(null) === false)
t('UNC: apparaatnaam \\\\?\\C: telt niet mee', G.isUncPad('\\\\?\\C:\\Users') === false)
t('UNC: maar \\\\?\\UNC\\server\\share wel',
  G.isUncPad('\\\\?\\UNC\\server\\share') === true)

t('de waarschuwing van cmd wordt herkend',
  G.uncWaarschuwing('UNC paths are not supported.  Defaulting to Windows directory.') === true)
t('ook de regel erboven',
  G.uncWaarschuwing('CMD.EXE was started with the above path as the current directory.') === true)
t('een gewone regel niet', G.uncWaarschuwing('alles ging goed') === false)

// Het omhulsel dat cmd alsnog in een netwerkmap laat werken.
{
  const B = String.fromCharCode(92)
  const share = B + B + 'server' + B + 'share'
  const omhuld = G.cmdInMap('git status', share)
  t('UNC krijgt een pushd ervoor', omhuld.cmd === 'pushd "' + share + '" && git status')
  t('en meldt dat er een letter aan hangt', omhuld.viaLetter === true)
  // cwd moet weg: geef je het UNC-pad alsnog mee, dan wijkt cmd uit vóórdat
  // pushd ooit draait en is het omhulsel zinloos.
  t('de werkmap gaat niet meer als cwd mee', omhuld.cwd === null)

  // `&&` en niet `&`: lukt pushd niet, dan hoort het commando niet alsnog in een
  // andere map te draaien.
  t('pushd en commando hangen met && aan elkaar', omhuld.cmd.includes('" && '))
  // Geen popd: die overschrijft de exitcode van het commando met die van popd,
  // en dan meldt een mislukking zich als geslaagd. De tijdelijke letter valt
  // vanzelf weg als het cmd-proces eindigt.
  t('er staat geen popd achter — die zou de exitcode opeten',
    !/popd/.test(omhuld.cmd))

  const gewoon = G.cmdInMap('git status', 'C:' + B + 'werk')
  t('gewoon schijfpad blijft onaangeraakt',
    gewoon.cmd === 'git status' && gewoon.cwd === 'C:' + B + 'werk' && gewoon.viaLetter === false)
  const letter = G.cmdInMap('git status', 'P:' + B + 'werk')
  t('gekoppelde letter blijft ook onaangeraakt',
    letter.cmd === 'git status' && letter.viaLetter === false)
  t('buiten Windows gebeurt er niets',
    G.cmdInMap('ls', '//server/share', false).viaLetter === false)
  // Een " kan niet in een Windows-pad voorkomen; weghalen kan dus geen geldig
  // pad slopen, en het houdt de commandoregel heel.
  t('aanhalingstekens in het pad worden weggehaald',
    !G.cmdInMap('x', share + '"rare').cmd.replace('pushd "', '').replace('" && x', '').includes('"'))

  const mainUnc = require('fs').readFileSync(require('path').join(__dirname, '..', 'main.js'), 'utf8')
  t('runCommandOnce gebruikt het omhulsel voor cmd',
    /const start = isPs \? null : GitTools\.cmdInMap\(cmd, cwd, process\.platform === 'win32'\)/.test(mainUnc))
  t('en spawnt het omhulde commando', /spawn\(start\.cmd, \[\]/.test(mainUnc))
  t('powershell gaat nog steeds rechtstreeks, met eigen cwd',
    /spawn\(psStart\.exe, psStart\.args, \{\s*\n\s*cwd,/.test(mainUnc))
  t('de gebruiker hoort dat er een tijdelijke letter aan hangt',
    /start\.viaLetter[\s\S]{0,200}tijdelijke schijfletter/.test(mainUnc))
  t('inclusief de waarschuwing over %CD%', /%CD% of %VAR%/.test(mainUnc))

  const ptyBlok = (mainUnc.match(/ipcMain\.handle\('pty:start'[\s\S]*?\n\}\)/) || [''])[0]
  t('de pty gebruikt hetzelfde omhulsel',
    /GitTools\.cmdInMap\(cmd, cwd, isWin\)/.test(ptyBlok))
  t('en start niet in het UNC-pad zelf',
    /const startMap = \(start && start\.viaLetter\) \? os\.homedir\(\) : cwd/.test(ptyBlok))

  // Vangnet uit fase 1 blijft staan: mocht een commando zichzelf alsnog laten
  // verhuizen, dan telt de uitkomst niet als geslaagd.
  t('classifyLine ziet het uitwijken nog steeds als fout',
    /function classifyLine[\s\S]{0,220}GitTools\.uncWaarschuwing/.test(mainUnc))
  t('exit 0 telt niet als geslaagd na uitwijken',
    /const ok = code === 0 && !uitgeweken/.test(mainUnc))
  t('en er komt een uitleg in beeld', /niet in de projectmap gedraaid/.test(mainUnc))
  t('validateCwd blokkeert netwerkpaden niet meer',
    !/isUncPad/.test((mainUnc.match(/function validateCwd\([\s\S]*?\n\}/) || [''])[0]))

  // Zonder commando hoort er geen `&&` in de lucht te blijven hangen; dat geval
  // bestaat bij de knop die een leeg consolevenster opent.
  const leeg = G.cmdInMap('', share)
  t('zonder commando alleen de sprong', leeg.cmd === 'pushd "' + share + '"')
  t('en geen losse && aan het eind', !/&&\s*$/.test(leeg.cmd))
  t('null telt als geen commando', G.cmdInMap(null, share).cmd === 'pushd "' + share + '"')
}

// ── losse consolevensters op een netwerkpad ──────────────────────────────────
// De knoppen die een eigen venster openen gaan via `start "" /D <map> …`. Met
// cmd.exe (of een .bat) als doelprogramma heeft dat dezelfde beperking als cmd
// zelf, maar dan onzichtbaar: gemeten op \\192.168.100.200\Projecten opende het
// venster in C:\Windows, en main.js kijkt daar nooit naar — het doet `.unref()`
// en meldt `true`.
{
  const B = String.fromCharCode(92)
  const share = B + B + 'server' + B + 'share'

  const metCmd = G.vensterInMap(share, 'git status', true)
  t('venster op een UNC-pad gaat via pushd',
    metCmd === 'start "" cmd.exe /k "pushd "' + share + '" && git status"')
  // Het extra paar aanhalingstekens is geen slordigheid: het houdt de `&&`
  // binnen de aanhalingstekens, zodat de cmd van `start` hem niet als
  // scheidingsteken pakt en het commando buiten het venster om draait.
  t('de hele pushd-regel staat tussen aanhalingstekens',
    /\/k "pushd .*"$/.test(metCmd))
  t('blijfOpen true wordt /k', metCmd.includes(' /k '))
  t('blijfOpen false wordt /c',
    G.vensterInMap(share, 'git status', false).includes(' /c '))

  // Ook hier geen popd, maar niet om dezelfde reden als bij cmdInMap: daar eet
  // popd de exitcode op, hier zou hij de gebruiker meteen weer uit de map
  // gooien terwijl het venster nog openstaat en hij zit te typen.
  t('geen popd achter een venster dat blijft openstaan', !/popd/.test(metCmd))
  // De titel moet leeg blijven: een titel met spaties wordt door de
  // argument-ontsnapping van spawn stukgemaakt en `start` draait er dan een
  // stuk van als programmanaam.
  t('de titel van start blijft leeg', metCmd.startsWith('start "" '))

  const leegVenster = G.vensterInMap(share, '', true)
  t('een leeg venster springt alleen naar de map',
    leegVenster === 'start "" cmd.exe /k "pushd "' + share + '""')
  t('en heeft geen losse && in zich', !leegVenster.includes('&&'))

  t('een gewoon pad verandert niet — dan blijft /D staan',
    G.vensterInMap('C:' + B + 'werk', 'git status', true) === null)
  t('een gekoppelde letter ook niet',
    G.vensterInMap('P:' + B + 'werk', '', true) === null)
  t('buiten Windows gebeurt er niets',
    G.vensterInMap('//server/share', 'ls', true, false) === null)
  t('aanhalingstekens in het pad worden weggehaald',
    G.vensterInMap(share + '"rare', '', true) ===
      'start "" cmd.exe /k "pushd "' + share + 'rare""')

  const mainVenster = require('fs').readFileSync(require('path').join(__dirname, '..', 'main.js'), 'utf8')
  const openCmdBlok = (mainVenster.match(/ipcMain\.handle\('shell:openCmd'[\s\S]*?\n\}\)/) || [''])[0]
  const openPsBlok = (mainVenster.match(/ipcMain\.handle\('shell:openPs'[\s\S]*?\n\}\)/) || [''])[0]
  const batTestBlok = (mainVenster.match(/ipcMain\.handle\('bat:test'[\s\S]*?\n\}\)/) || [''])[0]

  t('de cmd-knop vraagt het omhulsel op',
    /GitTools\.vensterInMap\(cwd, cmd, true, process\.platform === 'win32'\)/.test(openCmdBlok))
  // shell: true en niet een argumentenlijst: node ontsnapt een " in een argument
  // als \", en cmd.exe kent die schrijfwijze niet. Gemeten gaf dat "The
  // specified path is invalid." en helemaal geen venster.
  t('en spawnt die regel via de shell',
    /spawn\(viaLetter, \[\], \{ detached: true, windowsHide: false, shell: true \}\)/.test(openCmdBlok))
  t('de gewone weg met /D staat er nog voor gewone paden',
    /'start', '""', '\/D', cwd, 'cmd\.exe', '\/k', cmd/.test(openCmdBlok) &&
    /'start', '""', '\/D', cwd, 'cmd\.exe'\]/.test(openCmdBlok))

  // Gemeten: `start "" /D <unc> powershell.exe` landt wél in de share. /D kan
  // een netwerkpad prima aan; het is cmd.exe als doelprogramma dat het weigert.
  t('de powershell-knop blijft ongemoeid', !/GitTools\.vensterInMap\(/.test(openPsBlok))
  t('en houdt zijn eigen /D', /'start', '""', '\/D', cwd, start\.exe/.test(openPsBlok))

  // Een .bat wordt door cmd.exe gedraaid, dus de proefdraai loopt tegen dezelfde
  // muur aan. false: het venster hoort net als nu vanzelf te sluiten.
  t('de proefdraai gaat ook via het omhulsel',
    /GitTools\.vensterInMap\(target, `"\$\{file\}"`, false, process\.platform === 'win32'\)/.test(batTestBlok))
  t('en houdt de gewone /D-weg als terugval',
    /'start', '""', '\/D', target, file/.test(batTestBlok))

  t('nergens een popd achter een vensterknop',
    !/popd/.test(openCmdBlok + openPsBlok + batTestBlok))

  // Los venster heeft geen uitvoerpaneel: viaLetter gaat mee terug zodat de
  // renderer een toast kan tonen (zelfde tekst als bij runCommandOnce).
  t('openCmd geeft viaLetter terug bij het omhulsel',
    /return \{ ok: true, viaLetter: true \}/.test(openCmdBlok))
  t('openCmd geeft viaLetter false op een gewoon pad',
    /return \{ ok: true, viaLetter: false \}/.test(openCmdBlok))
  t('openCmd faalt als object, niet als false',
    /return \{ ok: false, viaLetter: false \}/.test(openCmdBlok))
  t('bat:test vermeldt viaLetter in het antwoord',
    /viaLetter:\s*!!viaLetter/.test(batTestBlok))
}

{
  // De toast hoort in de renderer: een los venster heeft geen uitvoerpaneel.
  const ren = require('fs').readFileSync(require('path').join(__dirname, '..', 'renderer.js'), 'utf8')
  t('renderer heeft openCmdMetMelding', /async function openCmdMetMelding\(arg\)/.test(ren))
  t('die toast bij viaLetter', /r\.viaLetter[\s\S]{0,80}cmd\.uncViaLetterToast/.test(ren))
  // Alleen de helper mag openCmd aanroepen; knoppen gaan via openCmdMetMelding.
  t('knoppen gaan via de helper, niet rechtstreeks',
    (ren.match(/window\.api\.openCmd\(/g) || []).length === 1
    && /openCmdMetMelding\(/.test(ren))
}

// ── netwerkmappen als wortel in de boom ──────────────────────────────────────
{
  const B = String.fromCharCode(92)
  const share = B + B + 'server' + B + 'share'

  t('wortel van een share is de share zelf', G.uncWortel(share) === share)
  t('wortel van een submap is nog steeds de share',
    G.uncWortel(share + B + 'map' + B + 'diep') === share)
  t('een gewoon pad heeft geen netwerkwortel', G.uncWortel('C:' + B + 'werk') === '')
  t('alleen een servernaam levert geen wortel', G.uncWortel(B + B + 'server') === '')
  t('forward slashes houden hun eigen vorm', G.uncWortel('//server/share/map') === '//server/share')
  t('de lange schrijfwijze houdt zijn voorvoegsel',
    G.uncWortel(B + B + '?' + B + 'UNC' + B + 'server' + B + 'share' + B + 'x')
      === B + B + '?' + B + 'UNC' + B + 'server' + B + 'share')

  t('de share zelf is een wortel', G.isUncWortel(share) === true)
  t('met een sluitende streep ook', G.isUncWortel(share + B) === true)
  t('een submap is geen wortel', G.isUncWortel(share + B + 'map') === false)
  t('een schijfpad is geen netwerkwortel', G.isUncWortel('C:' + B) === false)

  t('de naam in beeld laat de strepen weg', G.uncNaam(share) === 'server' + B + 'share')
  t('ook vanaf een submap', G.uncNaam(share + B + 'diep') === 'server' + B + 'share')

  // ouderVan liep hier door naar \\server en daarna naar een losse \, allebei
  // geen map die je kunt openen.
  const ren = require('fs').readFileSync(require('path').join(__dirname, '..', 'renderer.js'), 'utf8')
  const mainUnc = require('fs').readFileSync(require('path').join(__dirname, '..', 'main.js'), 'utf8')
  const ouderBlok = (ren.match(/function ouderVan\([\s\S]*?\n\}/) || [''])[0]
  t('boven een share zit alleen nog Deze pc',
    /GitTools\.isUncWortel\(kaal\)[\s\S]{0,40}return DEZE_PC/.test(ouderBlok))
  t('de boomketen herkent een netwerkpad',
    /const wortel = GitTools\.uncWortel\(schoon\)/.test(ren))
  t('en de schijvenlijst toont server\\share in plaats van \\server\\share',
    /function wortelNaam/.test(ren) && /naam: wortelNaam\(d\)/.test(ren))

  // Dit is de kern van fase 3. Een UNC-pad naar een server die niet antwoordt
  // laat fs.existsSync 28 seconden hangen, en dat gebeurt in het hoofdproces.
  // Erger nog: zo'n vastzittende lookup bezet een thread uit de libuv-pool, en
  // dan wacht een gewone stat op C:\Windows er 29 seconden achter. De volgorde
  // in fs:listDir is daarom geen stijlkwestie.
  const lijstBlok = (mainUnc.match(/ipcMain\.handle\('fs:listDir'[\s\S]*?\n\}\)/) || [''])[0]
  t('fs:listDir is asynchroon geworden', /handle\('fs:listDir', async/.test(lijstBlok))
  // Op de aanroep zoeken en niet op de naam: die staat er ook in het commentaar
  // vlak erboven, en dan vergelijk je de volgorde met een stuk uitleg.
  t('en klopt eerst aan bij de share',
    lijstBlok.indexOf('await netwerkBereikbaar') > 0 &&
    lijstBlok.indexOf('await netwerkBereikbaar') < lijstBlok.indexOf('if (!fs.existsSync(dirPath))'))
  t('een onbereikbare share geeft een nette reden',
    /netwerkmap niet bereikbaar/.test(lijstBlok))

  t('de probe heeft een tijdslimiet', /NETWERK_TIMEOUT_MS/.test(mainUnc))
  t('en onthoudt het antwoord', /netwerkCache/.test(mainUnc))
  t('probes staan in de rij, niet naast elkaar',
    /netwerkRij = netwerkRij\.then/.test(mainUnc))
  t('een onbereikbare wortel wordt korter onthouden dan een werkende',
    /NETWERK_STUK_TTL\s*=\s*60 \* 1000/.test(mainUnc) && /NETWERK_GOED_TTL\s*=\s*5 \* 60/.test(mainUnc))
  // De schijvenlijst mag nooit op een probe wachten: dan tekent de boom pas als
  // de laatste server geantwoord heeft.
  const drivesBlok = (mainUnc.match(/ipcMain\.handle\('fs:listDrives'[\s\S]*?\n\}\)/) || [''])[0]
  t('fs:listDrives wacht niet op een netwerkprobe',
    /if \(!bekend\) netwerkBereikbaar\(pad\)\.catch/.test(drivesBlok))
  t('en geeft "weten we nog niet" door als null',
    /bereikbaar: bekend \? bekend\.ok : null/.test(drivesBlok))
  // Gekoppelde letters (P:, Z:) markeren als netwerk — nodig voor git-begeleiding,
  // niet voor cmd (die kan op een letter wél).
  t('listDrives markeert netwerkschijfletters',
    /netwerk: netwerkLetters\.has\(letter\)/.test(drivesBlok)
    || /netwerk:\s*netwerkLetters\.has/.test(mainUnc))
  t('netwerkwortels worden bewaard in de instellingen',
    /netwerkWortels: \[\]/.test(mainUnc) &&
    /netwerkWortels: Array\.isArray\(s\.netwerkWortels\)/.test(mainUnc))
  t('toevoegen weigert iets dat geen netwerkpad is',
    /reden: 'geen-netwerkpad'/.test(mainUnc))
  t('en iets dat niet antwoordt', /reden: 'niet-bereikbaar'/.test(mainUnc))

  const pre = require('fs').readFileSync(require('path').join(__dirname, '..', 'preload.js'), 'utf8')
  t('de renderer kan erbij via preload',
    /netwerkWortelToevoegen/.test(pre) && /netwerkWortelWeg/.test(pre))
}

// ── fase 4: git-begeleiding op netwerklocaties ───────────────────────────────
{
  const B = String.fromCharCode(92)
  const share = B + B + 'server' + B + 'share'

  t('UNC is een netwerkpad', G.isNetwerkPad(share) === true)
  t('een gewone schijf niet, zonder letterset',
    G.isNetwerkPad('C:' + B + 'werk') === false)
  t('een letter in de set wel',
    G.isNetwerkPad('P:' + B + 'werk', new Set(['P'])) === true)
  t('dezelfde letter als array ook',
    G.isNetwerkPad('Z:' + B + 'x', ['Z']) === true)
  t('een andere letter niet',
    G.isNetwerkPad('P:' + B + 'werk', new Set(['Z'])) === false)
  t('schijfLetterVan pakt de letter', G.schijfLetterVan('p:' + B + 'x') === 'P')
  t('schijfLetterVan leeg bij UNC', G.schijfLetterVan(share) === '')

  // Zonder -b main zet git init --bare HEAD op master; een kloon komt dan op
  // een lege master uit (gemeten, onderzoek §4).
  const bare = G.bareInitCommando(share + B + 'proj.git')
  t('bare-init zet -b main', /git init --bare -b main/.test(bare))
  t('en neemt het pad mee', bare.includes(share + B + 'proj.git'))
  t('clone-commando koppelt bare aan lokaal',
    G.bareCloneCommando(share + B + 'proj.git', 'C:' + B + 'lok' + B + 'proj')
      === 'git clone "' + share + B + 'proj.git" "C:' + B + 'lok' + B + 'proj"')
  t('joinPad gebruikt de scheidingstekens van de basis',
    G.joinPad(share, 'x.git') === share + B + 'x.git')

  for (const sleutel of ['git.link.netwerkTitle', 'git.link.netwerkText',
                         'git.link.netwerkBare', 'git.link.netwerkTochHier',
                         'git.link.netwerkBareBestaat', 'git.link.netwerkLokaalBestaat',
                         'git.link.netwerkKlaar', 'cmd.uncViaLetterToast']) {
    t('netwerk-tekst ' + sleutel + ' bestaat in nl en en', !!nl[sleutel] && !!en[sleutel])
  }

  const ren4 = require('fs').readFileSync(require('path').join(__dirname, '..', 'renderer.js'), 'utf8')
  t('koppelen vraagt het bare-patroon op een netwerkpad',
    /padIsNetwerk\(pad\)/.test(ren4)
    && /git\.link\.netwerkBare/.test(ren4)
    && /initBareOpNetwerk/.test(ren4))
  t('bare-init gebruikt bareInitCommando',
    /GitTools\.bareInitCommando\(barePad\)/.test(ren4))
  t('en clone daarna lokaal',
    /GitTools\.bareCloneCommando\(barePad, lokaleMap\)/.test(ren4))
  // Geen popd in dit traject — die les is al duur betaald in fase 2.
  t('geen popd in de bare-flow',
    !/popd/.test((ren4.match(/async function initBareOpNetwerk[\s\S]*?\n\}/) || [''])[0]))
}

console.log(ok ? '\nALLE GIT-TESTS OK' : '\nER ZIJN GIT-TESTS GEZAKT')
process.exit(ok ? 0 : 1)
