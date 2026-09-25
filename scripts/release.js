// Bouwt CommandDeck en zet de Setup + latest.yml als GitHub Release online.
// Geïnstalleerde versies vergelijken hun eigen versie met die release, dus
// wat hier online gaat moet exact een gepushte commit zijn: vandaar de checks.
//
// Gebruik: eerst "version" in package.json ophogen, committen, pushen, dan
//   npm run release
const { execSync, spawnSync } = require('child_process')
const { version } = require('../package.json')

const run = (cmd) => execSync(cmd, { encoding: 'utf8' }).trim()
const stop = (msg) => { console.error('\nRelease afgebroken: ' + msg + '\n'); process.exit(1) }

if (run('git status --porcelain')) stop('er staan nog niet-gecommitte wijzigingen.')

run('git fetch origin --tags --quiet')
if (run('git rev-parse HEAD') !== run('git rev-parse @{u}')) stop('lokale branch loopt niet gelijk met origin; eerst pushen/pullen.')

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
if (assets && assets.includes('latest.yml')) stop(`${tag} is al gepubliceerd; hoog "version" in package.json op.`)

// GitHub weigert een gepubliceerde release op een tag die nog niet bestaat,
// dus zetten we hem zelf, op precies deze commit.
const remoteTag = run(`git ls-remote --tags origin refs/tags/${tag}`).split(/\s/)[0]
if (!remoteTag) {
  run(`git tag ${tag}`)
  run(`git push origin ${tag}`)
} else if (remoteTag !== run('git rev-parse HEAD')) {
  stop(`tag ${tag} staat op een andere commit; hoog "version" in package.json op.`)
}

console.log(`Release ${tag} bouwen en publiceren…`)
const r = spawnSync('npx', ['electron-builder', '--win', '--x64', '--publish', 'always'], {
  stdio: 'inherit',
  shell: true,
  env: { ...process.env, GH_TOKEN: token, CSC_IDENTITY_AUTO_DISCOVERY: 'false' },
})
process.exit(r.status ?? 1)
