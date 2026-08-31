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
gelijk('losse repo -> alleen koppelen', G.zichtbareGitIds(losseRepo), ['git-koppelen'])
gelijk('gekoppeld -> de leesknoppen, koppelen valt weg',
  G.zichtbareGitIds(gekoppeld), ['git-status', 'git-pull', 'git-fetch', 'git-log'])
gelijk('nog niet gemeten -> geen enkele knop', G.zichtbareGitIds(null), [])
gelijk('git ontbreekt -> geen enkele knop', G.zichtbareGitIds(geenGit), [])
t('koppelen en de leesknoppen sluiten elkaar uit',
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
t('elke leesknop heeft een commando',
  G.zichtbareGitIds(gekoppeld).every(id => typeof G.GIT_CMD_MAP[id] === 'string'))
t('ronde 1 schrijft nergens',
  Object.values(G.GIT_CMD_MAP).every(c => !/\b(commit|push|stash|reset|checkout|merge|rebase)\b/.test(c)))

// ── knop-definities ──────────────────────────────────────────────────────────
t('elke knop heeft een icoon en een kleurklasse',
  G.GIT_CMD_DEFS.every(d => d.icon && d.cls && d.labelKey))
t('id\'s zijn uniek', new Set(G.GIT_IDS).size === G.GIT_IDS.length)
t('isGitId herkent de eigen knoppen', G.GIT_IDS.every(id => G.isGitId(id)))
t('isGitId laat flutter-knoppen met rust',
  !G.isGitId('build-apk') && !G.isGitId('run-windows') && !G.isGitId('custom:abc'))
t('elke zichtbare id bestaat ook als knop', [geenRepo, losseRepo, gekoppeld]
  .every(s => G.zichtbareGitIds(s).every(id => G.GIT_IDS.includes(id))))

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
