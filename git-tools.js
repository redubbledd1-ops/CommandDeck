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
  //
  // `standaardUit` betekent: de knop bestaat, maar staat niet in de weg tot je
  // hem aanzet bij de projectinstellingen. Bedoeld voor wat je zelden nodig
  // hebt — een rij van acht knoppen waarvan je er vijf gebruikt, is een rij
  // waarin je de goede niet meer ziet. Het is geen slot: alles staat er nog,
  // één vinkje verderop.
  const GIT_CMD_DEFS = [
    { id: 'git-koppelen', labelKey: 'git.btn.link',   label: 'github koppelen', icon: 'ti-brand-github', cls: 'gitlink'  },
    { id: 'git-status',   labelKey: 'git.btn.status', label: 'git status',      icon: 'ti-git-branch',   cls: 'gitread'  },
    { id: 'git-commit',   labelKey: 'git.btn.commit', label: 'commit',          icon: 'ti-git-commit',   cls: 'gitcommit', schrijft: true },
    { id: 'git-push',     labelKey: 'git.btn.push',   label: 'push',            icon: 'ti-arrow-up',     cls: 'gitpush',   schrijft: true },
    { id: 'git-pull',     labelKey: 'git.btn.pull',   label: 'git pull',        icon: 'ti-arrow-down',   cls: 'gitpull'  },
    // Fetch haalt op wat de app zelf al elke tien minuten stil ophaalt; de
    // knop voegt daar weinig aan toe. Stash zet werk uit beeld — nuttig, maar
    // niet iets wat je dagelijks nodig hebt.
    { id: 'git-fetch',    labelKey: 'git.btn.fetch',  label: 'git fetch',       icon: 'ti-refresh',      cls: 'gitfetch', standaardUit: true },
    { id: 'git-stash',    labelKey: 'git.btn.stash',  label: 'stash',           icon: 'ti-archive',      cls: 'gitstash',  schrijft: true, gevaar: true, standaardUit: true },
    // Branches: één knop die een overzicht opent, geen rij losse knoppen.
    // Wisselen, maken, samenvoegen en verwijderen horen bij elkaar, en de
    // meeste mensen die in hun eentje werken openen dit nooit.
    { id: 'git-branch',   labelKey: 'git.btn.branch', label: 'branches',        icon: 'ti-git-fork',     cls: 'gitbranch', schrijft: true, standaardUit: true },
    // Zien wat er verandert vóór je het vastlegt. Staat wél aan: dit is hoe je
    // merkt dat er een sleutel of een debug-regel meegaat.
    { id: 'git-diff',     labelKey: 'git.btn.diff',   label: 'diff',            icon: 'ti-file-diff',    cls: 'gitdiff' },
    // Terughalen staat wél aan, en verschijnt vanzelf zodra er iets in de
    // stash zit — ook als dat er door de afsluitcontrole in is gezet en je
    // de stash-knop nooit hebt aangeraakt. Dit is de weg terug; die mag nooit
    // achter een instelling zitten.
    { id: 'git-stash-lijst', labelKey: 'git.btn.stashList', label: 'stash terughalen', icon: 'ti-restore', cls: 'gitstashlijst', schrijft: true },
    { id: 'git-log',      labelKey: 'git.btn.log',    label: 'git log',         icon: 'ti-history',      cls: 'gitlog'   },
  ]

  // De id's die standaard uit staan. De renderer gebruikt deze lijst om een
  // ontbrekende voorkeur te lezen als "uit" in plaats van als "aan".
  const STANDAARD_UIT_IDS = GIT_CMD_DEFS.filter(d => d.standaardUit).map(d => d.id)

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
    const r = { branch: null, upstream: null, ahead: 0, behind: 0, commits: false,
                vuil: 0, conflicten: 0, nieuw: 0, bestanden: [], nieuweBestanden: [] }
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
        // Een u-regel is een bestand waar git er zelf niet uit kwam: twee
        // versies die elkaar tegenspreken. Dat telt ook als vuil, maar het is
        // een ander soort probleem — je moet het oplossen, niet vastleggen.
        if (r2[0] === 'u') r.conflicten++
        // '?' = nog niet in versiebeheer. Dat zijn de bestanden waar het bij
        // een commit mis kan gaan: `git add -A` pakt ze mee, en een .env of
        // een sleutel die er nog nooit in zat staat er dan ineens in.
        if (r2[0] === '?') r.nieuw++
        const pad = padUitStatusRegel(r2)
        if (pad && r.bestanden.length < 40) r.bestanden.push(pad)
        if (pad && r2[0] === '?' && r.nieuweBestanden.length < 40) r.nieuweBestanden.push(pad)
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
  //   stashes      hoeveel er opzij staat; 0 laat de terughaalknop weg
  //   conflicten   bestanden waar git er niet uit kwam (na een pop of merge)
  //   naam/email   onder wiens naam een commit hier terechtkomt; leeg betekent
  //                dat `git commit` gaat weigeren
  function maakStaat({ beschikbaar = true, isRepo = false, remotes = [], branch = null,
                       commits = true, upstream = null, ahead = 0, behind = 0,
                       vuil = 0, conflicten = 0, nieuw = 0, stashes = 0,
                       bestanden = [], nieuweBestanden = [],
                       naam = '', email = '' } = {}) {
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
      conflicten: conflicten || 0,
      nieuw: nieuw || 0,
      nieuweBestanden: Array.isArray(nieuweBestanden) ? nieuweBestanden : [],
      stashes: stashes || 0,
      bestanden: Array.isArray(bestanden) ? bestanden : [],
      naam: String(naam || '').trim(),
      email: String(email || '').trim(),
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
  const LOKAAL = ['git-status', 'git-commit', 'git-diff', 'git-stash', 'git-branch', 'git-log']
  const REMOTE = ['git-push', 'git-pull', 'git-fetch']

  function zichtbareGitIds(staat) {
    if (!staat || staat.gemeten === false) return []
    if (!staat.beschikbaar) return []
    if (!staat.isRepo) return ['git-koppelen']

    const uit = staat.gekoppeld ? [] : ['git-koppelen']
    for (const id of GIT_IDS) {
      if (id === 'git-koppelen') continue
      if (REMOTE.includes(id) && !staat.gekoppeld) continue
      // Terughalen heeft alleen zin als er iets ligt. Zo is de knop meteen
      // het antwoord op de vraag "is er iets weggezet?" — staat hij er, dan
      // ligt er werk; staat hij er niet, dan is er niets kwijt.
      if (id === 'git-stash-lijst' && !(staat.stashes > 0)) continue
      // Zonder commit bestaat er nog geen branch om iets mee te doen: git
      // heeft dan wel een naam voor HEAD, maar nog geen tak.
      if (id === 'git-branch' && !staat.commits) continue
      // Zonder wijzigingen valt er niets te vergelijken. Zo is de knop meteen
      // het antwoord op "is er iets veranderd?".
      if (id === 'git-diff' && !(staat.vuil > 0)) continue
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

  // ── Achterlopen opmerken (deel D) ───────────────────────────────────────────
  // `↓3 achter` weet git alleen ná een fetch. Zonder fetch staat er ↓0 terwijl
  // er een uur geleden gepusht is — misleidender dan niets tonen. Dus fetchen
  // we stil bij het openen van een project, maar niet vaker dan nodig: een
  // fetch is netwerk, en tien projecten aanklikken mag geen tien
  // netwerkrondes per minuut worden.
  const FETCH_INTERVAL_MS = 10 * 60 * 1000

  function magFetchen(staat, laatsteFetch, nu = Date.now(), interval = FETCH_INTERVAL_MS) {
    if (!staat || !staat.beschikbaar || !staat.isRepo) return false
    if (!staat.gekoppeld) return false        // niets om bij op te halen
    if (!laatsteFetch) return true
    return (nu - laatsteFetch) >= interval
  }

  // Melden we dat de remote vóórloopt? Alleen als er ook echt iets te halen
  // valt. Loop je zelf ook vooruit, dan is het geen simpele pull meer maar
  // een uiteenlopende geschiedenis — dat zeggen we er dan bij.
  function achterstandMelding(staat) {
    const i = indicator(staat)
    if (!i || !i.behind) return null
    return {
      behind: i.behind,
      branch: i.branch,
      // Vooruit én achter: `pull --ff-only` gaat weigeren. Beter dat je dat
      // vooraf weet dan dat je op een knop drukt die een foutmelding geeft.
      uitEenLopend: i.ahead > 0,
      // Niet-vastgelegd werk maakt een pull riskant: git weigert bestanden te
      // overschrijven die je hebt aangepast.
      vuil: i.vuil,
    }
  }

  // ── Zien wat er verandert ───────────────────────────────────────────────────
  // `git diff` alleen laat de bestanden zien die al onder versiebeheer staan,
  // en dan nog alleen wat niet klaargezet is. Met HEAD erbij zie je alles wat
  // deze commit zou bevatten — behalve nieuwe bestanden, want die kent git nog
  // niet. Die noemen we apart; het zijn juist de gevaarlijkste.
  function diffCommando() {
    return 'git diff HEAD'
  }

  // ── Branches ────────────────────────────────────────────────────────────────
  // Uitgelezen met:
  //   git branch -a --format=%(HEAD)%09%(refname)%09%(refname:short)%09%(upstream:short)
  //
  // De vólledige refnaam moet erbij. `refname:short` geeft voor een remote-tak
  // gewoon 'origin/main' — niet 'remotes/origin/main' — en dan is een tak met
  // een schuine streep in de naam niet te onderscheiden van een remote-tak.
  // refs/heads/ tegenover refs/remotes/ is wél ondubbelzinnig.
  //
  // Tabs als scheiding: een branchnaam mag geen witruimte bevatten.
  // %(HEAD) is '*' voor de huidige branch en anders een spatie.
  function parseBranches(uit) {
    const lijst = []
    for (const regel of String(uit || '').split('\n')) {
      const r = regel.replace(/\r$/, '')
      if (!r.trim()) continue

      const velden = r.split('\t')
      if (velden.length < 3) continue

      const vlag = velden[0]
      const vol = String(velden[1] || '').trim()
      const kort = String(velden[2] || '').trim()
      const upstream = String(velden[3] || '').trim()
      if (!kort) continue

      // 'origin/HEAD' wijst alleen maar naar de standaardtak; geen echte branch.
      if (kort.endsWith('/HEAD') || kort.includes(' -> ')) continue

      lijst.push({
        naam: kort,
        huidig: String(vlag || '').trim() === '*',
        upstream: upstream || null,
        remote: vol.startsWith('refs/remotes/'),
      })
    }
    return lijst
  }

  const lokaleBranches = (lijst) => (lijst || []).filter(b => !b.remote)
  const huidigeBranch = (lijst) => (lijst || []).find(b => b.huidig) || null

  // Remote-takken waar nog geen lokale tegenhanger van bestaat. Dat zijn de
  // enige waarvoor uitchecken iets nieuws oplevert; de rest heb je al.
  function nieuweRemoteBranches(lijst) {
    const lokaal = new Set(lokaleBranches(lijst).map(b => b.naam))
    return (lijst || []).filter(b => b.remote && !lokaal.has(b.naam.replace(/^[^/]+\//, '')))
  }

  // De regels van git zelf, voor zover ze hier toe doen. Fout gaan betekent een
  // foutmelding uit git die niemand leest, dus liever vooraf tegenhouden.
  function geldigeBranchNaam(naam) {
    const n = String(naam || '').trim()
    if (!n) return false
    if (n.length > 200) return false
    if (/[\s~^:?*\[\\]/.test(n)) return false     // witruimte en de tekens die git verbiedt
    if (n.includes('..') || n.includes('@{')) return false
    if (n.startsWith('/') || n.endsWith('/') || n.includes('//')) return false
    if (n.startsWith('-') || n.startsWith('.') || n.endsWith('.')) return false
    if (n.endsWith('.lock')) return false
    if (n === 'HEAD') return false
    return true
  }

  // Wat mensen typen omzetten naar iets dat git accepteert: spaties worden
  // streepjes, verboden tekens verdwijnen.
  function veiligeBranchNaam(naam) {
    const n = String(naam || '').trim()
      .replace(/\s+/g, '-')
      .replace(/[~^:?*\[\\]/g, '')
      .replace(/\.\.+/g, '.')
      .replace(/\/{2,}/g, '/')
      .replace(/^[-./]+|[-./]+$/g, '')
      .slice(0, 200)
    return geldigeBranchNaam(n) ? n : ''
  }

  // Een remote-tak uitchecken maakt er een lokale van die hem volgt; daarna
  // werken push en pull vanzelf. Een lokale tak is gewoon wisselen.
  function checkoutCommando(branch) {
    if (!branch || !branch.naam) return null
    if (!branch.remote) return `git checkout ${branch.naam}`
    const lokaal = branch.naam.replace(/^[^/]+\//, '')
    if (!lokaal) return null
    return `git checkout -b ${lokaal} --track ${branch.naam}`
  }

  function nieuweBranchCommando(naam) {
    const n = veiligeBranchNaam(naam)
    return n ? `git checkout -b ${n}` : null
  }

  // -d weigert als de branch niet is samengevoegd; -D gooit hem hoe dan ook
  // weg. Dat verschil hoort een bewuste keuze te zijn, geen vlag die we stil
  // meesturen.
  function verwijderBranchCommando(naam, geforceerd = false) {
    const n = String(naam || '').trim()
    if (!geldigeBranchNaam(n)) return null
    return `git branch ${geforceerd ? '-D' : '-d'} ${n}`
  }

  function verwijderRemoteBranchCommando(remote, naam) {
    const r = String(remote || '').trim()
    const n = String(naam || '').replace(/^[^/]+\//, '').trim()
    if (!r || !geldigeBranchNaam(n)) return null
    return `git push ${r} --delete ${n}`
  }

  function mergeCommando(naam) {
    const n = String(naam || '').trim()
    if (!geldigeBranchNaam(n) && !/^[\w.-]+\/[\w./-]+$/.test(n)) return null
    return `git merge ${n}`
  }

  // Waarom je nu niet kunt wisselen. Git weigert bij vuile bestanden die de
  // andere tak ook aanraakt — maar wélke dat zijn weet git pas als het misgaat,
  // dus we waarschuwen bij alles wat vuil is.
  function wisselBlokkade(staat, doelNaam) {
    if (!staat || !staat.isRepo) return 'geen-repo'
    if (doelNaam && staat.branch === doelNaam) return 'zelfde'
    if (staat.vuil > 0) return 'vuil'
    return null
  }

  // ── Locaties van een project ────────────────────────────────────────────────
  // Een project kan meerdere mappen hebben — Resume heeft er een voor de app en
  // een voor de extensie — en die kunnen los van elkaar vuil staan. Alles wat
  // over "het project" gaat moet ze dus alle langs, niet alleen de actieve.
  function projectLocaties(project) {
    const uit = []
    const locs = (project && project.locations) || []
    for (let i = 0; i < locs.length; i++) {
      const pad = locs[i] && locs[i].path
      if (!pad) continue
      if (uit.some(x => x.pad === pad)) continue   // hetzelfde pad twee keer telt één keer
      uit.push({ index: i, pad, label: String((locs[i].label || '')).trim() })
    }
    return uit
  }

  // Hoe heet dit in een melding? Bij één locatie is de projectnaam genoeg; bij
  // meerdere moet erbij staan wélke, anders weet je niet waar je moet zijn.
  function locatieNaam(project, loc) {
    const naam = (project && project.name) || ''
    const meer = projectLocaties(project).length > 1
    return (meer && loc && loc.label) ? `${naam} — ${loc.label}` : naam
  }

  // ── Afsluitcontrole (ronde 5) ───────────────────────────────────────────────
  // Twee heel verschillende momenten:
  //
  //   Venster sluiten   volledig controleerbaar. We houden het sluiten tegen,
  //                     stellen per project een vraag, en sluiten pas als de
  //                     gebruiker klaar is. Zo lang wachten als nodig.
  //   Windows afsluiten ~5 seconden, geen tijd voor een gesprek. Hoogstens
  //                     synchroon iets veiligstellen en het achteraf melden.
  //
  // De instelling gaat alleen over dat tweede geval. Bij het sluiten van het
  // venster krijg je altijd de vraag, tenzij de controle helemaal uit staat.
  const AFSLUIT_UIT          = 'uit'
  const AFSLUIT_WAARSCHUWEN  = 'waarschuwen'
  const AFSLUIT_STASHEN      = 'stashen'
  const AFSLUIT_KEUZES = [AFSLUIT_UIT, AFSLUIT_WAARSCHUWEN, AFSLUIT_STASHEN]

  function afsluitInstelling(waarde) {
    return AFSLUIT_KEUZES.includes(waarde) ? waarde : AFSLUIT_WAARSCHUWEN
  }

  // Welke projecten houden het sluiten van het venster tegen?
  // `projecten` is [{ id, naam, pad, staat }].
  function teVragenProjecten(projecten, instelling) {
    if (afsluitInstelling(instelling) === AFSLUIT_UIT) return []
    return (projecten || []).filter(p => {
      const i = indicator(p && p.staat)
      return !!(i && i.onveilig)
    })
  }

  // Welke projecten kunnen bij een Windows-shutdown nog gestasht worden?
  //
  // Alleen projecten met niet-vastgelegde wijzigingen. `git stash` doet niets
  // aan commits die nog niet gepusht zijn — die staan al veilig in je repo en
  // gaan bij een shutdown ook niet verloren. Ze meenemen zou een stash maken
  // die niets bevat.
  function teStashenProjecten(projecten, instelling) {
    if (afsluitInstelling(instelling) !== AFSLUIT_STASHEN) return []
    return (projecten || []).filter(p => {
      const i = indicator(p && p.staat)
      return !!(i && i.vuil > 0)
    })
  }

  // Korte samenvatting per project, zodat de popup en de melding bij de
  // volgende start dezelfde woorden gebruiken.
  function afsluitSamenvatting(project) {
    const redenen = onveiligeRedenen(project && project.staat)
    return { naam: (project && project.naam) || '', pad: (project && project.pad) || '', redenen }
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

  // Laat je het bericht leeg, dan maken we er zelf een. Geen volgnummer maar
  // de bestandsnamen: "wijzigingen in 13 bestanden (renderer.js, style.css,
  // +11)" vertelt je over een maand nog iets, "commit 14" niet. De datum laten
  // we weg — die staat al in de commit zelf.
  function automatischCommitBericht(staat) {
    const bestanden = (staat && Array.isArray(staat.bestanden)) ? staat.bestanden.filter(Boolean) : []
    const aantal = (staat && staat.vuil) || bestanden.length

    // Alleen de bestandsnaam, niet het hele pad: anders is de eerste regel op
    // een diepe map meteen vol.
    const namen = bestanden.map(b => String(b).split(/[\\/]/).pop()).filter(Boolean)

    if (!namen.length) return aantal ? `wijzigingen in ${aantal} bestand(en)` : 'wijzigingen vastgelegd'

    // Opsommen mag alleen als we ze ook allemaal kennen. De bestandenlijst uit
    // de status is afgekapt op 40, dus bij een grote wijziging is `aantal`
    // hoger dan wat we kunnen noemen — dan zou opsommen de rest verzwijgen.
    const volledig = namen.length === aantal
    if (volledig && aantal === 1) return `wijziging in ${namen[0]}`
    if (volledig && aantal <= 3) return `wijzigingen in ${namen.join(', ')}`
    return `wijzigingen in ${aantal} bestanden (${namen.slice(0, 2).join(', ')}, +${aantal - 2})`
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

  // ── De stash terughalen ─────────────────────────────────────────────────────
  // Werk wegzetten kon de app al; terughalen niet. Dat is de vervelendste soort
  // ontbrekende functie: je hebt hem pas nodig als je hem niet hebt, en tot die
  // tijd lijkt er niets aan de hand.

  // Alleen tellen, voor de vraag "moet de terughaalknop er staan". Draait mee
  // in de achtergrondverversing, dus hier geen opmaak opvragen die we toch niet
  // laten zien.
  function parseStashAantal(uit) {
    return String(uit || '').split('\n').filter(r => r.trim()).length
  }

  // Uitgelezen met een eigen opmaak, zodat er niets te raden valt:
  //
  //   git stash list --pretty=%gd%x09%cs%x09%gs
  //   stash@{0}<tab>2026-09-01<tab>WIP on main: 1f4a2c3 vorige commit
  //
  // Waarom niet `--date=short`: dat lijkt de nette manier om aan die datum te
  // komen, maar het verandert óók %gd, en dan staat er stash@{2026-09-01} in
  // plaats van stash@{0}. De index is dan weg en daarmee de enige manier om de
  // stash aan te wijzen. Vandaar %cs, dat zijn eigen vaste vorm heeft.
  //
  // De kale uitvoer wordt ook gelezen (stash@{0}: WIP on main: ...), zodat een
  // git die deze opmaak niet kent niet stilletjes "er ligt niets" oplevert.
  //
  // Let op wat %gs bij een gewone `git stash` teruggeeft: "WIP on main:" plus
  // het bericht van de commit waar je op stond. Dat is níét wat er in de stash
  // zit — het is waar je vandaan kwam. Ongefilterd tonen leest als een
  // omschrijving van je werk en dat is het niet, dus splitsen we het uit elkaar
  // en laat de app er zelf "wijzigingen op main" van maken.
  function parseStashLijst(uit) {
    const lijst = []
    for (const regel of String(uit || '').split('\n')) {
      const r = regel.replace(/\r$/, '')
      if (!r.trim()) continue

      if (r.includes('\t')) {
        const velden = r.split('\t')
        const ref = (velden[0] || '').trim()
        if (!stashRefGeldig(ref)) continue
        lijst.push({ ref, datum: (velden[1] || '').trim(), ...parseStashOnderwerp(velden.slice(2).join('\t')) })
        continue
      }

      const kaal = r.match(/^(stash@\{\d{1,4}\}):\s*(.*)$/)
      if (kaal) lijst.push({ ref: kaal[1], datum: '', ...parseStashOnderwerp(kaal[2]) })
    }
    return lijst
  }

  // "WIP on main: 1f4a2c3 ..." is er automatisch ingezet; "On main: ..." is een
  // bericht dat iemand zelf heeft meegegeven — dat laatste zegt wél iets, dus
  // dat houden we heel.
  function parseStashOnderwerp(onderwerp) {
    const s = String(onderwerp || '').trim()
    const wip = s.match(/^WIP on ([^:]+):\s*[0-9a-f]{4,40}\s*(.*)$/)
    if (wip) return { branch: wip[1].trim(), bericht: '', basis: wip[2].trim(), eigen: false }
    const eigen = s.match(/^On ([^:]+):\s*(.*)$/)
    if (eigen) return { branch: eigen[1].trim(), bericht: eigen[2].trim(), basis: '', eigen: true }
    return { branch: '', bericht: s, basis: '', eigen: !!s }
  }

  // Een ref komt uit onze eigen lijst, maar hij gaat wel als tekst een
  // shell-regel in. Dus: alleen precies stash@{cijfers} mag erdoor, en al het
  // andere levert null op in plaats van een commando.
  function stashRefGeldig(ref) {
    return /^stash@\{\d{1,4}\}$/.test(String(ref || '').trim())
  }

  // Pop haalt terug én ruimt de stash op. Loopt het mis op een conflict, dan
  // laat git de stash juist staan — precies goed, want dan is er nog een weg
  // terug. Daar rekenen we op: de app zegt na een mislukte pop dat het werk er
  // nog is, en dat klopt dan ook.
  function stashPopCommando(ref) {
    return stashRefGeldig(ref) ? `git stash pop "${String(ref).trim()}"` : null
  }

  // Weggooien is het enige hier dat je niet terug kunt draaien.
  function stashDropCommando(ref) {
    return stashRefGeldig(ref) ? `git stash drop "${String(ref).trim()}"` : null
  }

  // ── Identiteit en accounts (fase 2) ─────────────────────────────────────────
  //
  // Twee dingen die bij "meerdere accounts" voortdurend door elkaar lopen, en
  // waar het hele ontwerp aan hangt:
  //
  //   identiteit   user.name en user.email. Bepaalt wiens naam er in de
  //                geschiedenis komt te staan. Staat per repo in .git/config,
  //                dus dit kan de app volledig sturen.
  //   account      je inloggegevens bij GitHub. Bepaalt wat je mag pushen.
  //                Die zitten in Windows Credential Manager, gekoppeld aan je
  //                Windows-gebruiker — daar kan de app hooguit naar wijzen.
  //
  // Een profiel bindt ze aan elkaar, maar ze blijven twee dingen. Committen
  // onder de verkeerde naam kan de app voorkomen; echte scheiding tussen
  // personen niet. Delen twee mensen één Windows-account, dan delen ze de
  // opgeslagen tokens, en daar komt geen enkel programma omheen.

  const INLOG_ONTHOUDEN = 'onthouden'   // de credential manager, zoals nu
  const INLOG_VRAGEN    = 'vragen'      // helper uit; git vraagt per keer
  const INLOG_KEUZES = [INLOG_ONTHOUDEN, INLOG_VRAGEN]

  // Wat de app over een identiteit weet zodra hij een repo heeft bekeken.
  //
  //   git config --get-regexp ^user\.(name|email)$
  //   user.name redub
  //   user.email redubbledd@hotmail.nl
  //
  // Ontbreekt er één van de twee, dan weigert `git commit` met "Author
  // identity unknown" — precies de foutmelding waar dit voor bedoeld is.
  function parseIdentiteit(uit) {
    const r = { naam: '', email: '' }
    for (const regel of String(uit || '').split('\n')) {
      const s = regel.replace(/\r$/, '')
      if (s.startsWith('user.name ')) r.naam = s.slice(10).trim()
      else if (s.startsWith('user.email ')) r.email = s.slice(11).trim()
    }
    return r
  }

  // Bewust ruim: git accepteert van alles als e-mailadres, en een adres
  // afkeuren dat git wél zou nemen is vervelender dan er eentje doorlaten die
  // achteraf een typefout blijkt.
  function geldigEmail(s) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(s || '').trim())
  }

  function maakProfiel(v = {}) {
    return {
      id: String(v.id || '').trim(),
      label: String(v.label || '').trim(),
      naam: String(v.naam || '').trim(),
      email: String(v.email || '').trim(),
      ghGebruiker: String(v.ghGebruiker || '').trim(),
      inloggen: v.inloggen === INLOG_VRAGEN ? INLOG_VRAGEN : INLOG_ONTHOUDEN,
    }
  }

  // Zonder naam én adres kun je er niet mee committen; dan is het geen profiel
  // maar een halve invulling.
  function profielGeldig(p) {
    return !!(p && String(p.naam || '').trim() && geldigEmail(p.email))
  }

  // Waar de gebruiker het profiel aan herkent. Het label is optioneel — heb je
  // er geen bedacht, dan is je eigen naam een prima aanduiding.
  function profielLabel(p) {
    if (!p) return ''
    return String(p.label || '').trim() || String(p.naam || '').trim() || String(p.email || '').trim()
  }

  function zoekProfiel(profielen, id) {
    if (!id) return null
    return (profielen || []).find(p => p && p.id === id) || null
  }

  // Welk profiel hoort bij dit project? Het profiel van het project zelf, en
  // anders de standaard. Wijst een project naar een profiel dat is verwijderd,
  // dan valt het terug op de standaard in plaats van naar niets — anders zou
  // één verwijdering stilletjes elke controle uitzetten.
  function profielVoorProject(profielen, standaardId, projectProfielId) {
    const lijst = Array.isArray(profielen) ? profielen : []
    if (!lijst.length) return null
    return zoekProfiel(lijst, projectProfielId) || zoekProfiel(lijst, standaardId) || null
  }

  // Hoofdletterongevoelig vergelijken: git bewaart wat je typt, en "Redub" en
  // "redub" zijn dezelfde persoon.
  function zelfdeIdentiteit(a, b) {
    const gelijk = (x, y) => String(x || '').trim().toLowerCase() === String(y || '').trim().toLowerCase()
    return gelijk(a && a.naam, b && b.naam) && gelijk(a && a.email, b && b.email)
  }

  // De kernvraag vóór elke commit: klopt de naam waar dit onder komt te staan?
  //
  //   ontbreekt       geen naam of adres — `git commit` gaat weigeren
  //   geen-profielen  niets om tegen te vergelijken; dan is alles goed
  //   klopt           dit is het profiel dat hier hoort
  //   ander-profiel   een profiel dat je kent, maar niet die van dit project
  //   onbekend        een naam die bij geen enkel profiel hoort
  //
  // Het verschil tussen die laatste twee is de moeite waard: bij "ander
  // profiel" weet de app precies wie het wél is en kan hij het aanbieden om
  // recht te zetten; bij "onbekend" kan hij alleen melden wat hij ziet.
  function identiteitStatus(profielen, staat, verwacht) {
    if (!staat || !staat.beschikbaar || !staat.isRepo) return null
    const huidig = { naam: staat.naam || '', email: staat.email || '' }
    if (!huidig.naam || !huidig.email) return { soort: 'ontbreekt', huidig, gevonden: null, verwacht: verwacht || null }

    const lijst = Array.isArray(profielen) ? profielen.filter(profielGeldig) : []
    if (!lijst.length) return { soort: 'geen-profielen', huidig, gevonden: null, verwacht: null }

    const gevonden = lijst.find(p => zelfdeIdentiteit(p, huidig)) || null
    if (!gevonden) return { soort: 'onbekend', huidig, gevonden: null, verwacht: verwacht || null }
    if (verwacht && gevonden.id !== verwacht.id) return { soort: 'ander-profiel', huidig, gevonden, verwacht }
    return { soort: 'klopt', huidig, gevonden, verwacht: verwacht || null }
  }

  // Alleen deze twee horen de commit tegen te houden. "Onbekend" is een
  // waarschuwing waar je doorheen mag: misschien commit je bewust een keer
  // onder een andere naam, en dan is tegenhouden betuttelend.
  function identiteitBlokkeert(status) {
    return !!status && status.soort === 'ontbreekt'
  }

  // ── De commando's ───────────────────────────────────────────────────────────
  // Alles gaat als één zichtbare regel naar de terminal, net als commit en
  // push. Je hoort te kunnen zien wat de app in je .git/config zet.

  // Zelfde behandeling als een commit-bericht: het beland tussen dubbele
  // aanhalingstekens op een cmd-regel.
  function veiligConfigWaarde(waarde) {
    return String(waarde || '')
      .replace(/[\r\n\t]+/g, ' ')
      .replace(/"/g, "'")
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 200)
  }

  // GitHub-gebruikersnamen: letters, cijfers en streepjes, hooguit 39 lang.
  // Alles daarbuiten weigeren we, want dit gaat een commandoregel in.
  function geldigeGhGebruiker(naam) {
    return /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,37}[A-Za-z0-9])?$/.test(String(naam || '').trim())
  }

  function identiteitCommando(profiel) {
    if (!profielGeldig(profiel)) return null
    return `git config user.name "${veiligConfigWaarde(profiel.naam)}"`
         + ` && git config user.email "${veiligConfigWaarde(profiel.email)}"`
  }

  // Het hele profiel toepassen op één map: naam, adres, welk GitHub-account, en
  // of de inloggegevens onthouden mogen worden.
  //
  // `huidig` is wat er nú in die repo staat — nodig omdat `--unset` mislukt als
  // er niets te wissen valt, en één mislukking de hele &&-ketting afkapt. Dus
  // zetten we alleen wat er staat te veranderen.
  //
  // Let op wat dit níét doet: het raakt de opgeslagen tokens niet aan. Het
  // wijst alleen aan wélk opgeslagen account bij deze map hoort.
  function profielCommando(profiel, huidig = {}) {
    if (!profielGeldig(profiel)) return null
    const delen = []

    if (!zelfdeIdentiteit(profiel, huidig)) delen.push(identiteitCommando(profiel))

    // Zetten doen we op wat er effectief staat (staat het globaal al goed, dan
    // hoeft er niets); weghalen alleen als het in déze .git/config staat, want
    // `--unset` mislukt op iets dat daar niet in staat en kapt de ketting af.
    const wil = geldigeGhGebruiker(profiel.ghGebruiker) ? String(profiel.ghGebruiker).trim() : ''
    const heeft = String(huidig.ghGebruiker || '').trim()
    if (wil && wil !== heeft) {
      delen.push(`git config "credential.https://github.com.username" "${wil}"`)
    } else if (!wil && huidig.ghGebruikerLokaal) {
      delen.push('git config --unset "credential.https://github.com.username"')
    }

    // Een lege helper zet de hele keten uit, ook de manager die op
    // systeemniveau staat. Dat is de enige manier om git per repo weer zelf te
    // laten vragen.
    const vraagt = profiel.inloggen === INLOG_VRAGEN
    if (vraagt && !huidig.helperLokaal) delen.push('git config credential.helper ""')
    else if (!vraagt && huidig.helperLokaal) delen.push('git config --unset-all credential.helper')

    return delen.length ? delen.join(' && ') : null
  }

  // Met gh erbij loopt het wisselen van account via gh zelf; die houdt zijn
  // eigen tokens bij en zet zich als credential helper voor github.com. Dan is
  // credential.username niet de knop die iets doet.
  function ghSwitchCommando(ghGebruiker) {
    const naam = String(ghGebruiker || '').trim()
    if (!geldigeGhGebruiker(naam)) return null
    return `gh auth switch --hostname github.com --user ${naam}`
  }

  // Vraagt git om inloggegevens bij dit commando? Dan heeft het een echte
  // terminal nodig: zonder toetsenbord blijft een push staan wachten op een
  // token dat niemand kan intypen.
  function vraagtOmInloggen(profiel, cmdId) {
    if (!profiel || profiel.inloggen !== INLOG_VRAGEN) return false
    return ['git-push', 'git-pull', 'git-fetch', 'git-koppelen'].includes(cmdId)
  }

  // Welke bestanden zitten zowel in de stash als ongewijzigd-vastgelegd in je
  // map? Dat is de vraag die je vóór een pop wilt stellen, want git weigert
  // dan — hij zegt "your local changes would be overwritten" en doet niets.
  //
  // Belangrijk: dat is géén conflict. Een conflict krijg je alleen als de
  // stash botst met iets dat al vastligt; botst hij met werk dat nog los in je
  // map staat, dan kapt git er meteen mee en blijft alles zoals het was. Dat
  // is veilig, maar zonder uitleg lijkt het op een knop die stuk is.
  function botsendeBestanden(inStash, inMap) {
    const nu = new Set((inMap || []).map(p => String(p).replace(/\\/g, '/').replace(/^"|"$/g, '')))
    return (inStash || [])
      .map(p => String(p).replace(/\\/g, '/'))
      .filter(p => nu.has(p))
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
    GIT_CMD_DEFS, GIT_CMD_MAP, GIT_IDS, isGitId, isSchrijfKnop, STANDAARD_UIT_IDS,
    parseRemotes, parseBranch, parseStatusV2, maakStaat, zichtbareGitIds,
    koppelStap, koppelCommando, veiligeRepoNaam, normaliseerRepoUrl,
    veiligCommitBericht, automatischCommitBericht, commitCommando, pushCommando, stashCommando, blokkade,
    parseStashAantal, parseStashLijst, parseStashOnderwerp, stashRefGeldig,
    stashPopCommando, stashDropCommando, botsendeBestanden,
    parseIdentiteit, geldigEmail, maakProfiel, profielGeldig, profielLabel,
    zoekProfiel, profielVoorProject, zelfdeIdentiteit, identiteitStatus,
    identiteitBlokkeert, veiligConfigWaarde, geldigeGhGebruiker,
    identiteitCommando, profielCommando, ghSwitchCommando, vraagtOmInloggen,
    INLOG_ONTHOUDEN, INLOG_VRAGEN, INLOG_KEUZES,
    indicator, onveiligeRedenen, magFetchen, achterstandMelding, FETCH_INTERVAL_MS,
    diffCommando,
    parseBranches, lokaleBranches, huidigeBranch, nieuweRemoteBranches,
    geldigeBranchNaam, veiligeBranchNaam, checkoutCommando, nieuweBranchCommando,
    verwijderBranchCommando, verwijderRemoteBranchCommando, mergeCommando, wisselBlokkade,
    projectLocaties, locatieNaam,
    teVragenProjecten, teStashenProjecten, afsluitSamenvatting, afsluitInstelling,
    AFSLUIT_UIT, AFSLUIT_WAARSCHUWEN, AFSLUIT_STASHEN, AFSLUIT_KEUZES,
    KOPPEL_INIT, KOPPEL_COMMIT, KOPPEL_GH, KOPPEL_URL, KOPPEL_AL_GEDAAN,
  }
})
