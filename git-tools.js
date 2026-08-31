// Alles wat over Git gaat en zonder Electron te testen is.
//
// Dit bestand wordt op twee plekken geladen:
//   - main.js en de tests via require()
//   - index.html via een <script>-tag, waarna het als GitTools klaarstaat
// Zo is er één plek waar de knoppen en de commando's staan, en kun je de
// beslislogica testen zonder een venster te openen.
;(function (root, factory) {
  const api = factory()
  if (typeof module === 'object' && module.exports) module.exports = api
  else root.GitTools = api
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {

  // ── De knoppen ──────────────────────────────────────────────────────────────
  // Volgorde is de volgorde waarin ze in de tools-sectie verschijnen.
  const GIT_CMD_DEFS = [
    { id: 'git-koppelen', labelKey: 'git.btn.link',   label: 'github koppelen', icon: 'ti-brand-github', cls: 'gitlink'  },
    { id: 'git-status',   labelKey: 'git.btn.status', label: 'git status',      icon: 'ti-git-branch',   cls: 'gitread'  },
    { id: 'git-pull',     labelKey: 'git.btn.pull',   label: 'git pull',        icon: 'ti-arrow-down',   cls: 'gitpull'  },
    { id: 'git-fetch',    labelKey: 'git.btn.fetch',  label: 'git fetch',       icon: 'ti-refresh',      cls: 'gitfetch' },
    { id: 'git-log',      labelKey: 'git.btn.log',    label: 'git log',         icon: 'ti-history',      cls: 'gitlog'   },
  ]

  // Ronde 1 leest alleen. `pull --ff-only` kan geen merge-conflict maken: hij
  // weigert liever als je uit elkaar loopt. Dat is duidelijker dan halverwege
  // in een conflict staan waar je niet om gevraagd hebt.
  const GIT_CMD_MAP = {
    'git-status': 'git status -sb',
    'git-pull':   'git pull --ff-only',
    'git-fetch':  'git fetch --prune',
    'git-log':    'git log --graph --oneline --decorate -20',
  }

  const GIT_IDS = GIT_CMD_DEFS.map(d => d.id)
  const isGitId = (id) => GIT_IDS.includes(id)

  // ── Uitvoer van git lezen ───────────────────────────────────────────────────

  // `git remote` geeft één naam per regel. Leeg = wel een repo, geen koppeling.
  function parseRemotes(uit) {
    return String(uit || '').split('\n').map(r => r.trim()).filter(Boolean)
  }

  // `git rev-parse --abbrev-ref HEAD` geeft de branchnaam, of "HEAD" als je
  // losgekoppeld staat (detached). Een verse repo zonder commits geeft een
  // foutmelding op stderr en niets op stdout.
  function parseBranch(uit) {
    const naam = String(uit || '').trim()
    if (!naam || naam === 'HEAD') return null
    return naam
  }

  // Alles bij elkaar tot één toestand waar de rest van de app op kan sturen.
  //
  //   beschikbaar  is git zelf te vinden op deze pc
  //   isRepo       staat deze map onder versiebeheer
  //   gekoppeld    hangt er een remote aan (dan pas is pull/fetch zinvol)
  //   branch       null bij detached HEAD of bij een repo zonder commits
  //   commits      false bij een verse `git init` zonder enkele commit
  function maakStaat({ beschikbaar = true, isRepo = false, remotes = [], branch = null, commits = true } = {}) {
    const lijst = Array.isArray(remotes) ? remotes.filter(Boolean) : parseRemotes(remotes)
    return {
      beschikbaar: !!beschikbaar,
      isRepo: !!isRepo,
      gekoppeld: !!isRepo && lijst.length > 0,
      remotes: lijst,
      remote: lijst.includes('origin') ? 'origin' : (lijst[0] || null),
      branch: branch || null,
      commits: !!commits,
    }
  }

  // ── Welke knoppen zie je? ───────────────────────────────────────────────────
  // Niet gekoppeld: alleen de koppelknop, anders sta je naar een push-knop te
  // kijken die nergens heen kan. Gekoppeld: de koppelknop valt weg en de
  // gewone git-knoppen komen ervoor in de plaats.
  function zichtbareGitIds(staat) {
    if (!staat || staat.gemeten === false) return []
    if (!staat.beschikbaar) return []
    if (!staat.gekoppeld) return ['git-koppelen']
    return ['git-status', 'git-pull', 'git-fetch', 'git-log']
  }

  // ── Koppelen ────────────────────────────────────────────────────────────────
  // Twee stappen, bewust niet in één klik. Een map zonder repo krijgt eerst
  // alleen `git init`; wat er gecommit wordt bepaal je zelf, want zonder
  // .gitignore staat node_modules zo in je geschiedenis.
  const KOPPEL_INIT      = 'init'      // nog geen repo: eerst git init
  const KOPPEL_COMMIT    = 'commit'    // repo zonder commits: eerst iets vastleggen
  const KOPPEL_GH        = 'gh'        // gh staat klaar: repo aanmaken en pushen
  const KOPPEL_URL       = 'url'       // geen gh: url vragen en handmatig koppelen
  const KOPPEL_AL_GEDAAN = 'gekoppeld' // niets te doen

  function koppelStap(staat, ghAanwezig) {
    if (!staat || !staat.beschikbaar) return null
    if (staat.gekoppeld) return KOPPEL_AL_GEDAAN
    if (!staat.isRepo) return KOPPEL_INIT
    if (!staat.commits) return KOPPEL_COMMIT
    return ghAanwezig ? KOPPEL_GH : KOPPEL_URL
  }

  // De commandoregel die bij een stap hoort. Eén regel, zodat hij in de
  // terminal van de app zichtbaar draait en je de uitvoer gewoon ziet.
  function koppelCommando(stap, opties = {}) {
    const { naam = '', url = '', branch = 'main', prive = true } = opties
    if (stap === KOPPEL_INIT) return 'git init -b main'
    if (stap === KOPPEL_GH) {
      if (!naam) return null
      return `gh repo create ${naam} ${prive ? '--private' : '--public'} --source=. --push`
    }
    if (stap === KOPPEL_URL) {
      if (!url) return null
      return `git remote add origin ${url} && git push -u origin ${branch || 'main'}`
    }
    return null
  }

  // Een repo-naam die GitHub accepteert: letters, cijfers, punt, streepje,
  // liggend streepje. De rest wordt een streepje, spaties incluis.
  function veiligeRepoNaam(naam) {
    const schoon = String(naam || '').trim().replace(/[^A-Za-z0-9._-]+/g, '-').replace(/^-+|-+$/g, '')
    return schoon || 'project'
  }

  // Accepteert wat mensen daadwerkelijk plakken: de https-url, de ssh-vorm,
  // of "gebruiker/repo" uit de adresbalk.
  function normaliseerRepoUrl(invoer) {
    const t = String(invoer || '').trim().replace(/\s+/g, '')
    if (!t) return null
    if (/^git@[\w.-]+:[\w.-]+\/[\w.-]+?(\.git)?$/.test(t)) return t
    if (/^https?:\/\/[\w.-]+\/[\w.-]+\/[\w.-]+?(\.git)?\/?$/.test(t)) return t.replace(/\/$/, '')
    if (/^[\w.-]+\/[\w.-]+$/.test(t)) return `https://github.com/${t}.git`
    return null
  }

  return {
    GIT_CMD_DEFS, GIT_CMD_MAP, GIT_IDS, isGitId,
    parseRemotes, parseBranch, maakStaat, zichtbareGitIds,
    koppelStap, koppelCommando, veiligeRepoNaam, normaliseerRepoUrl,
    KOPPEL_INIT, KOPPEL_COMMIT, KOPPEL_GH, KOPPEL_URL, KOPPEL_AL_GEDAAN,
  }
})
