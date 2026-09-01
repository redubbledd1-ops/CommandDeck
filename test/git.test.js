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
t('elke stap is een los commando — ze mogen apart mislukken',
  metGh.every(x => typeof x.cmd === 'string' && x.cmd.length > 0))
t('zonder profiel valt er niets te activeren',
  G.accountActiveerStappen(null, true).length === 0)
t('een profiel zonder GitHub-account zet alleen de naam',
  G.accountActiveerStappen({ ...prof, ghGebruiker: '' }, true).map(x => x.soort).join() === 'identiteit')

// ── inloggen is interactief; de app voert die dialoog ────────────────────────
// `gh auth login --web` toont een code en wacht op Enter. In de gewone terminal
// van de app kun je niets typen en de uitvoer niet selecteren — daar liep het
// op vast. Main voert het gesprek nu zelf.
const mainBron5 = require('fs').readFileSync(require('path').join(__dirname, '..', 'main.js'), 'utf8')
const loginBlok = (mainBron5.match(/ipcMain\.handle\('git:ghLogin'[\s\S]*?\n\}\)\)/) || [''])[0]

t('inloggen draait als los proces met stdin, niet als kaal commando',
  /spawn\('gh', \['auth', 'login'/.test(loginBlok) && /proc\.stdin\.write/.test(loginBlok))
t('de code wordt uit de uitvoer gevist', /\[A-Z0-9\]\{4\}-\[A-Z0-9\]\{4\}/.test(loginBlok))
t('en naar het venster gestuurd zodat je hem kunt kopiëren',
  /webContents\.send\('git:ghCode'/.test(loginBlok))
t('de app drukt zelf op Enter bij "press enter"', /press enter/i.test(loginBlok))
t('gh schrijft naar stderr, dus die lezen we ook', /stderr\.on\('data'/.test(loginBlok))
t('het resultaat komt uit gh auth status, niet uit de exitcode',
  /auth', 'status'/.test(loginBlok) && /accounts\.length > 0/.test(loginBlok))
t('en het blijft niet eeuwig hangen', /setTimeout\([\s\S]{0,80}proc\.kill/.test(loginBlok))

// De code is van de vorm ABCD-1234; die vorm moet de regex herkennen.
for (const code of ['1A2B-3C4D', 'ABCD-1234', '0000-FFFF']) {
  t('code herkend: ' + code, /\b([A-Z0-9]{4}-[A-Z0-9]{4})\b/.test(code))
}
t('een gewone zin levert geen code op',
  !/\b([A-Z0-9]{4}-[A-Z0-9]{4})\b/.test('Press Enter to open github.com in your browser'))

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
  rendererBron.indexOf('if (!st.ingelogd) {') > 0
  && rendererBron.indexOf('if (!st.ingelogd) {') < rendererBron.indexOf('await window.api.gitGhIdentiteit()'))

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
                       'git.afsluit.reden.niet-gepusht', 'git.stashMelding.titel',
                       'settings.git.label', 'settings.git.off', 'settings.git.warn', 'settings.git.stash']) {
  t('afsluit-tekst ' + sleutel + ' bestaat in nl en en', !!nl[sleutel] && !!en[sleutel])
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
                       'settings.git.inlogAsk', 'settings.git.inlogEerlijk',
                       'modal.project.profielLabel', 'modal.project.profielDefault']) {
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
t('index.html heeft de profielkeuze in het projectvenster',
  html.includes('id="f-profiel"') && html.includes('id="f-profiel-rij"'))

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
