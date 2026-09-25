// Bouwt CommandDeck en zet de Setup + latest.yml als GitHub Release online.
// Geïnstalleerde versies vergelijken hun eigen versie met die release, dus
// wat hier online gaat moet exact een gepushte commit zijn: vandaar de checks.
//
// Gebruik, in de gewone projectmap (niet in een worktree), op main, met alles
// gecommit:
//   npm run uitbrengen       (= npm version patch)
//
// Dat is alles. `npm version` draait eerst dit script met --voor-versie
// ("preversion" in package.json): sta je op de verkeerde plek, dan stopt het
// vóór het ophogen. Daarna hoogt het op, commit en tagt, en "postversion" pusht
// en draait dit script voor het bouwen en publiceren. Losse stappen bleken
// versies op te leveren die nooit online kwamen.
//
// Mislukt alleen het bouwen of uploaden, dan is de versie al gepusht: los het
// probleem op en draai "npm run release" om dezelfde versie af te maken.
const { execSync, execFileSync, spawnSync } = require('child_process')
const fs = require('fs')
const path = require('path')
const { version, dependencies = {} } = require('../package.json')

const voorVersie = process.argv.includes('--voor-versie')
const run = (cmd) => execSync(cmd, { encoding: 'utf8' }).trim()
// Rechtstreeks, zonder cmd.exe: die eet de ^ in "v1.0.5^{}" op.
const git = (...args) => execFileSync('git', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim()
const probeer = (fn) => { try { return fn() } catch { return '' } }
const stop = (msg) => {
  console.error('\n' + (voorVersie ? 'Versie niet opgehoogd: ' : 'Release afgebroken: ') + msg + '\n')
  process.exit(1)
}

// Alleen vanuit de gewone projectmap. In een worktree (bijv. die van een
// Claude-sessie, waar de terminal van die sessie in opent) staat een eigen
// branch zonder upstream en zonder node_modules: ophogen lukte daar wel, maar
// pushen en bouwen niet — en dus zag niemand ooit een update.
const gitMap = path.resolve(git('rev-parse', '--git-dir'))
const gedeeld = path.resolve(git('rev-parse', '--git-common-dir'))
if (gitMap !== gedeeld) {
  stop(`dit is een worktree (${process.cwd()}).\n` +
    `Ga eerst naar de gewone projectmap:\n  cd "${path.dirname(gedeeld)}"`)
}
const branch = git('rev-parse', '--abbrev-ref', 'HEAD')
if (branch !== 'main') stop(`je staat op branch "${branch}"; releases komen alleen van main.`)

if (git('status', '--porcelain')) stop('er staan nog niet-gecommitte wijzigingen.')

// electron-builder pakt alleen in wat in node_modules staat. Een dependency die
// in package.json staat maar nooit geïnstalleerd is, gaat stil niet mee — zo
// ging 1.0.2 de deur uit zonder electron-updater, en kon die versie zelf nooit
// meer een update vinden.
const wortel = path.join(__dirname, '..')
const ontbreekt = Object.keys(dependencies)
  .filter((naam) => !fs.existsSync(path.join(wortel, 'node_modules', naam, 'package.json')))
if (ontbreekt.length) stop('niet geïnstalleerd: ' + ontbreekt.join(', ') + '. Draai eerst "npm install".')

git('fetch', 'origin', '--tags', '--quiet')
const upstream = probeer(() => git('rev-parse', '@{u}'))
if (!upstream) stop('main volgt geen branch op GitHub; eerst "git push -u origin main".')
const head = git('rev-parse', 'HEAD')
if (head !== upstream) stop('main loopt niet gelijk met GitHub; eerst pushen/pullen.')

if (voorVersie) process.exit(0)

// Token van de gh-login lenen, zodat er geen GH_TOKEN in een bestand hoeft.
let token = process.env.GH_TOKEN
if (!token) {
  try { token = run('gh auth token') } catch { stop('geen GH_TOKEN en "gh auth token" werkt niet; log in met "gh auth login".') }
}

// Een release zonder latest.yml ziet de updater niet: die mag afgemaakt
// worden (bijv. na een afgebroken upload). Met latest.yml is hij af.
const tag = 'v' + version
let assets = null
try { assets = run(`gh release view ${tag} --json assets -q ".assets[].name"`).split(/\r?\n/) } catch {}
if (assets && assets.includes('latest.yml')) stop(`${tag} is al gepubliceerd; hoog de versie op met "npm version patch".`)

// GitHub weigert een gepubliceerde release op een tag die nog niet bestaat,
// dus zorgen we dat hij er staat, op precies deze commit. `npm version` maakt
// een annotated tag: die heeft een eigen SHA, en pas de ^{}-regel van
// ls-remote wijst naar de commit zelf.
const regels = git('ls-remote', '--tags', 'origin', `refs/tags/${tag}`, `refs/tags/${tag}^{}`)
  .split(/\r?\n/).filter(Boolean)
const remoteRegel = regels.find(r => r.endsWith('^{}')) || regels[0]
const remoteTag = remoteRegel ? remoteRegel.split(/\s/)[0] : ''
if (!remoteTag) {
  const lokaal = probeer(() => git('rev-parse', `${tag}^{commit}`))
  if (lokaal && lokaal !== head) stop(`tag ${tag} staat lokaal op een andere commit; hoog de versie op.`)
  if (!lokaal) git('tag', tag)
  git('push', 'origin', tag)
} else if (remoteTag !== head) {
  stop(`tag ${tag} staat op een andere commit; hoog de versie op met "npm version patch".`)
}

// Setup en portable publiceren tegelijk; bestaat de release nog niet, dan
// maken ze hem allebei aan en faalt er één (422) vóór latest.yml geschreven
// is. Vooraf aanmaken, dan uploaden ze alleen.
if (!assets) run(`gh release create ${tag} --verify-tag --title ${version} --notes ""`)

console.log(`Release ${tag} bouwen en publiceren…`)
const r = spawnSync('npx', ['electron-builder', '--win', '--x64', '--publish', 'always'], {
  stdio: 'inherit',
  shell: true,
  env: { ...process.env, GH_TOKEN: token, CSC_IDENTITY_AUTO_DISCOVERY: 'false' },
})
process.exit(r.status ?? 1)
