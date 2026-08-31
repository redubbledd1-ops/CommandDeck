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
    { id: 'git-commit',   labelKey: 'git.btn.commit', label: 'commit',          icon: 'ti-git-commit',   cls: 'gitcommit', schrijft: true },
    { id: 'git-push',     labelKey: 'git.btn.push',   label: 'push',            icon: 'ti-arrow-up',     cls: 'gitpush',   schrijft: true },
    { id: 'git-pull',     labelKey: 'git.btn.pull',   label: 'git pull',        icon: 'ti-arrow-down',   cls: 'gitpull'  },
    { id: 'git-fetch',    labelKey: 'git.btn.fetch',  label: 'git fetch',       icon: 'ti-refresh',      cls: 'gitfetch' },
    { id: 'git-stash',    labelKey: 'git.btn.stash',  label: 'stash',           icon: 'ti-archive',      cls: 'gitstash',  schrijft: true, gevaar: true },
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

  // `git status --porcelain=v2 --branch` in één keer uitlezen. Dit formaat is
  // machineleesbaar en verandert niet mee met de taal van de gebruiker of de
  // git-versie — de gewone `git status`-tekst doet dat wel, dus die parsen we
  // nooit.
  //
  //   # branch.oid <sha>        of (initial) bij een repo zonder commits
  //   # branch.head <naam>      of (detached)
  //   # branch.upstream <naam>  ontbreekt als de branch nergens naartoe wijst
  //   # branch.ab +2 -0         ontbreekt dan ook
  //   1/2/u/? <...> <pad>       één regel per gewijzigd of onbekend bestand
  function parseStatusV2(uit) {
    const r = { branch: null, upstream: null, ahead: 0, behind: 0, commits: false, vuil: 0, bestanden: [] }
    for (const regel of String(uit || '').split('\n')) {
      const r2 = regel.replace(/\r$/, '')
      if (!r2) continue

      if (r2.startsWith('# branch.oid ')) {
        r.commits = r2.slice(13).trim() !== '(initial)'
      } else if (r2.startsWith('# branch.head ')) {
        const naam = r2.slice(14).trim()
        r.branch = (naam && naam !== '(detached)') ? naam : null
      } else if (r2.startsWith('# branch.upstream ')) {
        r.upstream = r2.slice(18).trim() || null
      } else if (r2.startsWith('# branch.ab ')) {
        const m = r2.slice(12).trim().match(/^\+(\d+)\s+-(\d+)$/)
        if (m) { r.ahead = parseInt(m[1], 10); r.behind = parseInt(m[2], 10) }
      } else if (r2[0] === '#') {
        continue
      } else if ('12u?'.includes(r2[0]) && r2[1] === ' ') {
        r.vuil++
        const pad = padUitStatusRegel(r2)
        if (pad && r.bestanden.length < 40) r.bestanden.push(pad)
      }
    }
    return r
  }

  // Het pad staat achteraan, na een vast aantal velden dat per regeltype
  // verschilt. Bij een hernoeming volgt na een tab het oude pad; dat laten we
  // weg, we willen alleen weten wélk bestand het is.
  function padUitStatusRegel(regel) {
    const soort = regel[0]
    const velden = regel.split(' ')
    let vanaf = 0
    if (soort === '?' || soort === '!') vanaf = 1
    else if (soort === '1') vanaf = 8
    else if (soort === '2') vanaf = 9
    else if (soort === 'u') vanaf = 10
    else return ''
    return velden.slice(vanaf).join(' ').split('\t')[0].trim()
  }

  // Alles bij elkaar tot één toestand waar de rest van de app op kan sturen.
  //
  //   beschikbaar  is git zelf te vinden op deze pc
  //   isRepo       staat deze map onder versiebeheer
  //   gekoppeld    hangt er een remote aan (dan pas is pull/fetch zinvol)
  //   branch       null bij detached HEAD of bij een repo zonder commits
  //   commits      false bij een verse `git init` zonder enkele commit
  function maakStaat({ beschikbaar = true, isRepo = false, remotes = [], branch = null,
                       commits = true, upstream = null, ahead = 0, behind = 0,
                       vuil = 0, bestanden = [] } = {}) {
    const lijst = Array.isArray(remotes) ? remotes.filter(Boolean) : parseRemotes(remotes)
    return {
      beschikbaar: !!beschikbaar,
      isRepo: !!isRepo,
      gekoppeld: !!isRepo && lijst.length > 0,
      remotes: lijst,
      remote: lijst.includes('origin') ? 'origin' : (lijst[0] || null),
      branch: branch || null,
      commits: !!commits,
      upstream: upstream || null,
      ahead: ahead || 0,
      behind: behind || 0,
      vuil: vuil || 0,
      bestanden: Array.isArray(bestanden) ? bestanden : [],
    }
  }

  // ── Welke knoppen zie je? ───────────────────────────────────────────────────
  // Niet gekoppeld: alleen de koppelknop, anders sta je naar een push-knop te
  // kijken die nergens heen kan. Gekoppeld: de koppelknop valt weg en de
  // gewone git-knoppen komen ervoor in de plaats.
  // Wat een knop nodig heeft, bepaalt of hij er staat:
  //   geen repo   -> alleen koppelen
  //   wel repo    -> ook alles wat lokaal werkt (status, commit, stash, log)
  //   met remote  -> koppelen valt weg, push/pull/fetch komen erbij
  // Commit hoort dus al bij een niet-gekoppelde repo. Anders stuurt de
  // koppel-dialoog je naar "maak eerst een commit" zonder knop om dat te doen.
  const LOKAAL = ['git-status', 'git-commit', 'git-stash', 'git-log']
  const REMOTE = ['git-push', 'git-pull', 'git-fetch']

  function zichtbareGitIds(staat) {
    if (!staat || staat.gemeten === false) return []
    if (!staat.beschikbaar) return []
    if (!staat.isRepo) return ['git-koppelen']

    const uit = staat.gekoppeld ? [] : ['git-koppelen']
    for (const id of GIT_IDS) {
      if (id === 'git-koppelen') continue
      if (REMOTE.includes(id) && !staat.gekoppeld) continue
      uit.push(id)
    }
    return uit
  }

  const schrijftIds = GIT_CMD_DEFS.filter(d => d.schrijft).map(d => d.id)
  const isSchrijfKnop = (id) => schrijftIds.includes(id)

  // ── De indicator (ronde 3) ──────────────────────────────────────────────────
  // Wat er in de projectkop komt te staan, en — belangrijker — of er werk is
  // dat nergens anders staat. Dat laatste is wat de afsluitcontrole van ronde 5
  // straks per project moet weten, dus die vraag hoort hier en niet in de
  // opmaak.
  function indicator(staat) {
    if (!staat || !staat.beschikbaar || !staat.isRepo) return null

    const vuil = staat.vuil || 0
    const ahead = staat.ahead || 0
    const behind = staat.behind || 0

    return {
      branch: staat.branch || 'HEAD',
      losgekoppeld: !staat.branch,          // detached HEAD
      gekoppeld: !!staat.gekoppeld,
      volgt: !!staat.upstream,              // wijst deze branch ergens naartoe
      ahead, behind, vuil,
      // Niets te doen: niets gewijzigd, niets vooruit, niets achter.
      schoon: vuil === 0 && ahead === 0 && behind === 0,
      // Werk dat alleen op deze pc bestaat. Niet-vastgelegde wijzigingen, of
      // commits die nog nergens heen zijn gepusht. Dit is de vraag waar de
      // afsluitcontrole op afgaat.
      onveilig: vuil > 0 || ahead > 0,
      // De remote heeft iets wat jij niet hebt. Alleen betrouwbaar kort na een
      // fetch — zonder fetch blijft dit 0, ook al staat er werk klaar.
      achter: behind > 0,
    }
  }

  // Waarom een project onveilig is, in de volgorde waarin je het wilt horen.
  // Geeft [] terug als er niets aan de hand is.
  function onveiligeRedenen(staat) {
    const i = indicator(staat)
    if (!i || !i.onveilig) return []
    const uit = []
    if (i.vuil > 0) uit.push({ soort: 'niet-vastgelegd', aantal: i.vuil })
    if (i.ahead > 0) uit.push({ soort: 'niet-gepusht', aantal: i.ahead })
    return uit
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

  // ── Schrijven (ronde 2) ─────────────────────────────────────────────────────

  // De commando's gaan naar cmd.exe (`spawn(cmd, [], { shell: true })`), en het
  // bericht staat daar tussen dubbele aanhalingstekens. Eén " erin en de regel
  // valt uit elkaar, dus die wordt een enkele. Regeleindes worden spaties:
  // -m neemt maar één regel, en een meerregelig bericht hoort in ronde 4 met
  // een echt tekstvlak. Let op: %NAAM% wordt door cmd.exe vervangen als die
  // variabele bestaat — zeldzaam in een commit-bericht, maar het kan.
  function veiligCommitBericht(bericht) {
    return String(bericht || '')
      .replace(/[\r\n\t]+/g, ' ')
      .replace(/"/g, "'")
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 200)
  }

  // Alles in één regel, zodat je in de terminal precies ziet wat er gebeurde.
  function commitCommando(bericht) {
    const schoon = veiligCommitBericht(bericht)
    if (!schoon) return null
    return `git add -A && git commit -m "${schoon}"`
  }

  // Zonder upstream weigert `git push` met "no upstream branch". Dat weten we
  // van tevoren uit branch.upstream, dus we sturen meteen de -u-variant in
  // plaats van je eerst tegen een foutmelding aan te laten lopen.
  function pushCommando(staat) {
    if (!staat || !staat.gekoppeld) return null
    if (staat.upstream) return 'git push'
    const remote = staat.remote || 'origin'
    const branch = staat.branch
    if (!branch) return null
    return `git push -u ${remote} ${branch}`
  }

  // -u pakt ook nieuwe bestanden mee. Dat is bijna altijd de bedoeling bij
  // "even opzij zetten", maar het is wel het punt waarop werk uit beeld raakt.
  function stashCommando() {
    return 'git stash -u'
  }

  // Waarom een knop niet kan draaien, of null als er niets in de weg staat.
  // De renderer zet dat om in een melding in plaats van een commando dat
  // zichtbaar niets doet.
  function blokkade(id, staat) {
    if (!staat) return null
    if (id === 'git-commit' || id === 'git-stash') {
      if (!staat.vuil) return 'schoon'
    }
    if (id === 'git-push') {
      if (!staat.commits) return 'geen-commits'
      if (staat.upstream && staat.ahead === 0) return 'niets-vooruit'
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
    GIT_CMD_DEFS, GIT_CMD_MAP, GIT_IDS, isGitId, isSchrijfKnop,
    parseRemotes, parseBranch, parseStatusV2, maakStaat, zichtbareGitIds,
    koppelStap, koppelCommando, veiligeRepoNaam, normaliseerRepoUrl,
    veiligCommitBericht, commitCommando, pushCommando, stashCommando, blokkade,
    indicator, onveiligeRedenen,
    KOPPEL_INIT, KOPPEL_COMMIT, KOPPEL_GH, KOPPEL_URL, KOPPEL_AL_GEDAAN,
  }
})
