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
    // Terugdraaien: één knop met de drie dingen die je écht wilt kunnen.
    // Standaard uit, want de meeste dagen heb je hem niet nodig — en als je
    // hem nodig hebt, moet elke stap een bewuste keuze zijn.
    { id: 'git-terug',    labelKey: 'git.btn.undo',   label: 'terugdraaien',    icon: 'ti-arrow-back-up', cls: 'gitterug', schrijft: true, gevaar: true, standaardUit: true },
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

  // `git remote -v` geeft twee regels per remote (fetch en push) met het adres
  // erbij. Eén aanroep meer levert niets op — dit vervangt `git remote` — maar
  // het scheelt wel een `git remote get-url` per project per ronde, en de
  // instellingen kunnen nu álle adressen tonen in plaats van alleen het
  // gekozene. Dat laatste is precies wat je nodig hebt als er twee remotes
  // staan en er één weg moet.
  function parseRemoteRegels(uit) {
    const gezien = new Map()
    for (const regel of String(uit || '').split('\n')) {
      const m = regel.replace(/\r$/, '').match(/^(\S+)\s+(\S+)/)
      if (!m) continue
      if (!gezien.has(m[1])) gezien.set(m[1], { naam: m[1], url: m[2] })
    }
    return [...gezien.values()]
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

  // ── Is de koppeling ook echt een koppeling? ─────────────────────────────────
  // Een remote in .git/config is een adres, geen bewijs. De repo kan nooit
  // aangemaakt zijn, hernoemd zijn, van een ander account zijn, of weggegooid.
  // Dan staat er wel een remote, maar loopt elke push stuk. Vandaar vier
  // toestanden in plaats van een ja/nee:
  //
  //   'geen'      geen repo, of een repo zonder remote      -> koppelknop
  //   'onbekend'  er is een remote, nog niet nagekeken      -> gewoon gebruiken
  //   'ok'        nagekeken en het adres antwoordt          -> gewoon gebruiken
  //   'stuk'      nagekeken en het adres antwoordt niet     -> koppelknop terug
  //
  // 'onbekend' telt bewust als bruikbaar. Het alternatief zou betekenen dat je
  // zonder internet je push-knop kwijt bent, en dat is precies het moment
  // waarop je wél wilt kunnen committen en straks pushen. Alleen een aantoonbaar
  // kapot adres haalt de knoppen weg.
  const KOPPELING_GEEN     = 'geen'
  const KOPPELING_ONBEKEND = 'onbekend'
  const KOPPELING_OK       = 'ok'
  const KOPPELING_STUK     = 'stuk'

  // Waarom liep de controle stuk? Alleen de eerste twee zijn een kapotte
  // koppeling; de rest zegt iets over deze pc op dit moment en mag de knoppen
  // niet weghalen.
  //
  //   'inloggen'  git mag er niet bij (geen of verkeerde inlog)
  //   'weg'       het adres bestaat niet (meer)
  //   'netwerk'   geen verbinding — zegt niets over de koppeling
  //   'onbekend'  iets anders; we gokken niet
  function remoteFoutReden(tekst) {
    const t = String(tekst || '').toLowerCase()
    if (/could not resolve host|couldn't resolve host|timed out|connection refused|network is unreachable|temporary failure in name resolution|operation timed out/.test(t)) return 'netwerk'
    if (/not found|does not exist|repository .* not found|remote: repository not found|404/.test(t)) return 'weg'
    if (/could not read username|could not read password|authentication failed|invalid username or password|terminal prompts disabled|permission denied|access denied|403|401|no such device or address/.test(t)) return 'inloggen'
    return 'onbekend'
  }

  // GitHub zegt bij een 403 wíe er probeerde: "Permission to owner/repo.git
  // denied to iemandAnders." Zonder die naam krijg je alleen "inloggen", en
  // dan lijkt het of de koppeling stuk is terwijl het account verkeerd is.
  function parseDeniedGebruiker(tekst) {
    const m = String(tekst || '').match(/denied to\s+([A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?)/i)
    return m ? m[1] : ''
  }

  // Eigenaar van een github.com-adres, of uit diezelfde 403-regel.
  function githubEigenaarUitUrl(invoer) {
    const s = String(invoer || '')
    const uitFout = s.match(/permission to\s+([A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?)\//i)
    if (uitFout) return uitFout[1]
    const uitUrl = s.match(/github\.com[/:]([A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?)\//i)
    return uitUrl ? uitUrl[1] : ''
  }

  function zelfdeGhNaam(a, b) {
    const x = String(a || '').trim().toLowerCase()
    const y = String(b || '').trim().toLowerCase()
    return !!x && x === y
  }

  // Wat er mis is bij een geweigerde push, in één oordeel. `verwacht` is het
  // GitHub-account van dit CommandDeck-account; ontbreekt dat, dan de eigenaar
  // van de repo. `alsNu` is wie gh denkt dat je bent als de fouttekst dat niet
  // zegt.
  function pushInlogProbleem({ tekst = '', remoteUrl = '', verwacht = '', alsNu = '' } = {}) {
    if (tekst && remoteFoutReden(tekst) !== 'inloggen') return null
    const als = parseDeniedGebruiker(tekst) || String(alsNu || '').trim()
    const eigenaar = githubEigenaarUitUrl(remoteUrl) || githubEigenaarUitUrl(tekst)
    const doel = String(verwacht || '').trim() || eigenaar
    if (!tekst && !als && !doel) return null
    return {
      reden: 'inloggen',
      als,
      eigenaar,
      doel,
      verkeerd: !!(als && doel && !zelfdeGhNaam(als, doel)),
    }
  }

  // De uitslag van één controle omzetten naar iets waar maakStaat mee verder
  // kan. `ok: null` betekent: we weten het nog steeds niet. Dat is geen fout,
  // dat is eerlijk — en het laat de knoppen staan.
  function remoteUitslag(code, tekst) {
    if (code === 0) return { ok: true, reden: '' }
    const reden = remoteFoutReden(tekst)
    if (reden === 'netwerk' || reden === 'onbekend') return { ok: null, reden }
    return { ok: false, reden }
  }

  // Het commando dat de controle doet. --exit-code maakt een lege repo ook een
  // fout op zich, dus die vragen we niet; we willen alleen weten of het adres
  // antwoordt. -h houdt het antwoord klein bij een repo met veel tags.
  function lsRemoteArgs(remote) {
    return ['ls-remote', '-h', '--', String(remote || 'origin')]
  }

  // Alles bij elkaar tot één toestand waar de rest van de app op kan sturen.
  //
  //   beschikbaar  is git zelf te vinden op deze pc
  //   isRepo       staat deze map onder versiebeheer
  //   gekoppeld    hangt er een remote aan die ook echt werkt
  //   koppeling    geen | onbekend | ok | stuk (zie hierboven)
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
                       remoteOk = null, remoteReden = '', remoteUrl = '', remoteLijst = [],
                       gitignore = null, langePaden = null, windows = false,
                       naam = '', email = '' } = {}) {
    // Twee vormen die hetzelfde beschrijven: alleen namen (zoals `git remote`
    // geeft) of namen mét adres (`git remote -v`). Beide mogen, want de tests
    // en de oudere aanroepen kennen alleen de eerste.
    const metUrl = Array.isArray(remoteLijst) ? remoteLijst.filter(r => r && r.naam) : parseRemoteRegels(remoteLijst)
    const gegeven = Array.isArray(remotes) ? remotes.filter(Boolean) : parseRemotes(remotes)
    const lijst = gegeven.length ? gegeven : metUrl.map(r => r.naam)
    const heeftRemote = !!isRepo && lijst.length > 0

    // Welke remote is "de" remote? Niet blind origin: een repo kan er meer
    // hebben, en dan is degene waar de branch naartoe wijst de enige juiste.
    // Pushen naar origin terwijl je master origin niet volgt maar github, is
    // hoe werk in de verkeerde repo belandt.
    const uitUpstream = String(upstream || '').split('/')[0]
    const remote = heeftRemote
      ? (lijst.includes(uitUpstream) ? uitUpstream
         : (lijst.includes('origin') ? 'origin' : lijst[0]))
      : null

    const koppeling = !heeftRemote ? KOPPELING_GEEN
      : remoteOk === true  ? KOPPELING_OK
      : remoteOk === false ? KOPPELING_STUK
      : KOPPELING_ONBEKEND

    return {
      beschikbaar: !!beschikbaar,
      isRepo: !!isRepo,
      // Alleen een aantoonbaar kapotte koppeling telt niet mee. Ongecontroleerd
      // blijft bruikbaar — zie de uitleg bij KOPPELING_ONBEKEND.
      gekoppeld: koppeling === KOPPELING_OK || koppeling === KOPPELING_ONBEKEND,
      koppeling,
      koppelingStuk: koppeling === KOPPELING_STUK,
      // Er stáát wel een adres, ook als het niet werkt. Dat verschil heeft de
      // herstelknop nodig: een dood adres moet weg vóór je een nieuw aanmaakt.
      heeftRemote,
      remoteReden: koppeling === KOPPELING_STUK ? String(remoteReden || '') : '',
      remoteUrl: String(remoteUrl || (metUrl.find(r => r.naam === remote) || {}).url || ''),
      remotes: lijst,
      // Alle adressen, niet alleen dat van de gekozen remote. De git-sectie in
      // de projectinstellingen laat ze allemaal zien, want bij twee remotes
      // waarvan er één dood is moet je kunnen zien wélke.
      remoteLijst: metUrl,
      remote,
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
      // null = niet gemeten (bijvoorbeeld in een test of vóór de eerste ronde);
      // dan zegt de app er niets over in plaats van iets te verzinnen.
      gitignore: gitignore === null ? null : !!gitignore,
      langePaden: langePaden === null ? null : !!langePaden,
      windows: !!windows,
      naam: String(naam || '').trim(),
      email: String(email || '').trim(),
    }
  }

  // Wat de knoppen en de indicator nodig hebben. Bestandslijsten en adressen
  // laten we links liggen: die veranderen de tekening niet, en ze vergelijken
  // via JSON.stringify bij élke poll is precies hoe het venster blijft hangen.
  function zelfdeGitWeergave(a, b) {
    if (a === b) return true
    if (!a || !b) return false
    return a.beschikbaar === b.beschikbaar && a.isRepo === b.isRepo
      && a.gekoppeld === b.gekoppeld && a.koppeling === b.koppeling
      && a.heeftRemote === b.heeftRemote && a.branch === b.branch
      && a.ahead === b.ahead && a.behind === b.behind
      && a.vuil === b.vuil && a.nieuw === b.nieuw && a.conflicten === b.conflicten
      && a.stashes === b.stashes && a.commits === b.commits
      && a.naam === b.naam && a.email === b.email
      && a.gitignore === b.gitignore && a.langePaden === b.langePaden
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
  const LOKAAL = ['git-status', 'git-commit', 'git-diff', 'git-stash', 'git-branch', 'git-terug', 'git-log']
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
      // Zonder commits valt er niets terug te draaien.
      if (id === 'git-terug' && !staat.commits) continue
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
      // Er staat een adres, maar het antwoordt niet. Dat moet je in de kop
      // kunnen zien: anders lijkt het project keurig bij te zijn terwijl het
      // al weken nergens naartoe gaat.
      koppelingStuk: !!staat.koppelingStuk,
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
      ahead: i.ahead || 0,
      branch: i.branch,
      // Vooruit én achter: `pull --ff-only` gaat weigeren. Beter dat je dat
      // vooraf weet dan dat je op een knop drukt die een foutmelding geeft.
      uitEenLopend: i.ahead > 0,
      // Niet-vastgelegd werk maakt een pull riskant: git weigert bestanden te
      // overschrijven die je hebt aangepast.
      vuil: i.vuil,
    }
  }

  // Wat kún je doen met die achterstand? Dat hangt af van twee dingen: loop je
  // zelf ook vooruit (dan is `--ff-only` kansloos), en staat er niet-vastgelegd
  // werk in de weg (dan weigert git bestanden te overschrijven). Dit rekent dat
  // uit, zodat het venster de juiste knoppen krijgt in plaats van één knop die
  // in de helft van de gevallen een foutmelding oplevert.
  //
  //   ffonly  vooruitspoelen; kan alleen als jij zelf niets extra's hebt
  //   merge   allebei behouden, met een samenvoeg-commit erbij
  //   rebase  jouw commits opnieuw bovenop die van de ander
  function achterstandKeuzes(staat) {
    const melding = achterstandMelding(staat)
    if (!melding) return null
    return {
      ...melding,
      // Uit elkaar gelopen: dan is vooruitspoelen geen optie meer en moet je
      // kiezen hoe de twee kanten samenkomen.
      wijzen: melding.uitEenLopend ? ['merge', 'rebase'] : ['ffonly'],
      // Niet-vastgelegd werk gaat eerst opzij en komt er daarna weer bij.
      stashNodig: melding.vuil > 0,
    }
  }

  function pullCommando(wijze) {
    if (wijze === 'merge')  return 'git pull --no-rebase'
    if (wijze === 'rebase') return 'git pull --rebase'
    return 'git pull --ff-only'
  }

  // ── Zien wat er verandert ───────────────────────────────────────────────────
  // `git diff` alleen laat de bestanden zien die al onder versiebeheer staan,
  // en dan nog alleen wat niet klaargezet is. Met HEAD erbij zie je alles wat
  // deze commit zou bevatten — behalve nieuwe bestanden, want die kent git nog
  // niet. Die noemen we apart; het zijn juist de gevaarlijkste.
  function diffCommando() {
    return 'git diff HEAD'
  }

  // ── Terugdraaien ────────────────────────────────────────────────────────────
  // Drie dingen, en bewust niet meer. `reset --hard` staat er niet bij: dat
  // gooit je werk weg zonder dat er ergens een kopie achterblijft, en geen
  // bevestigingsvenster maakt dat veilig genoeg voor een knop.

  // De commit terug, de wijzigingen blijven staan. Dit is de knop voor "oeps,
  // te vroeg gecommit" — je verliest niets, de commit wordt alleen ongedaan.
  function resetZachtCommando() {
    return 'git reset --soft HEAD~1'
  }

  // Alleen het bericht van de laatste commit veranderen. --amend maakt een
  // nieuwe commit met dezelfde inhoud, dus het is een herschrijving van de
  // geschiedenis — daarom hetzelfde voorbehoud als bij reset.
  function amendCommando(bericht) {
    const schoon = veiligCommitBericht(bericht)
    if (!schoon) return null
    return `git commit --amend -m "${schoon}"`
  }

  // De wijzigingen in één bestand weggooien. Dit is het enige van de drie dat
  // echt onomkeerbaar is: er is geen commit en geen stash om op terug te
  // vallen. Aanhalingstekens eromheen, want een pad mag spaties bevatten.
  function weggooiBestandCommando(pad) {
    const p = String(pad || '').trim().replace(/"/g, '')
    if (!p) return null
    return `git checkout -- "${p}"`
  }

  // Staat de laatste commit al op de remote? Dan is terugdraaien niet zomaar
  // ongedaan maken: je geschiedenis gaat afwijken van wat er op GitHub staat,
  // en de volgende push wordt geweigerd. Dat hoor je vooraf te weten.
  function alGepusht(staat) {
    return !!(staat && staat.upstream && (staat.ahead || 0) === 0)
  }

  // Waarom een terugdraai-actie nu niet kan.
  function terugdraaiBlokkade(soort, staat) {
    if (!staat || !staat.isRepo) return 'geen-repo'
    if (!staat.commits) return 'geen-commits'
    if (soort === 'weggooien' && !(staat.vuil > 0)) return 'schoon'
    return null
  }

  // ── Branches ────────────────────────────────────────────────────────────────
  // Uitgelezen met:
  //   git branch -a --format=%(HEAD)%09%(refname)%09%(refname:short)%09%(upstream:short)%09%(upstream:track)
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
      const track = String(velden[4] || '')
      if (!kort) continue

      // Onder refs/remotes/ staan ook dingen die geen branch zijn:
      //   origin/HEAD   wijst alleen naar de standaardtak
      //   origin        een kale verwijzing naar de remote zelf, zonder tak
      // Allebei zijn ze niets om naartoe te wisselen of te verwijderen, en de
      // tweede zag er in het venster uit als een branch die 'origin' heet.
      const isRemoteRef = vol.startsWith('refs/remotes/')
      if (kort.endsWith('/HEAD') || kort.includes(' -> ')) continue
      if (isRemoteRef && !kort.includes('/')) continue

      lijst.push({
        naam: kort,
        huidig: String(vlag || '').trim() === '*',
        upstream: upstream || null,
        remote: isRemoteRef,
        ...parseTrack(track),
      })
    }
    return lijst
  }

  // %(upstream:track) geeft '[ahead 1]', '[behind 2]', '[ahead 1, behind 2]',
  // '[gone]' als de remote-tak verdwenen is, of niets. Dit is precies wat je
  // wilt weten vóórdat je een branch weggooit: staat er werk op dat nergens
  // anders is?
  function parseTrack(tekst) {
    const t = String(tekst || '')
    const a = t.match(/ahead (\d+)/)
    const b = t.match(/behind (\d+)/)
    return {
      ahead: a ? parseInt(a[1], 10) : 0,
      behind: b ? parseInt(b[1], 10) : 0,
      wegOpRemote: /\bgone\b/.test(t),
    }
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

  // Hoe een branch in een keuzelijst hoort te staan. De ☁ zegt dat hij alleen
  // op de remote bestaat — kiezen betekent dan dat er lokaal een nieuwe wordt
  // gemaakt, en dat is iets heel anders dan ergens naartoe wisselen.
  function branchOmschrijving(b) {
    if (!b || !b.naam) return ''
    if (b.remote) return '☁ ' + b.naam
    const merk = []
    if (b.ahead) merk.push('↑' + b.ahead)
    if (b.behind) merk.push('↓' + b.behind)
    if (b.wegOpRemote) merk.push('⚠')
    return b.naam + (merk.length ? '  ' + merk.join(' ') : '')
  }

  // Staat er op deze branch werk dat nergens anders is? Dat is de vraag die
  // vóór het verwijderen beantwoord moet worden, en die je nu pas achteraf
  // uit een foutmelding van git moest afleiden.
  const branchHeeftEigenWerk = (b) => !!b && !b.remote && (b.ahead > 0 || !b.upstream || !!b.wegOpRemote)

  // Git laat je de hoofdtak gewoon verwijderen als hij ergens in is
  // samengevoegd. Dat is zelden de bedoeling, en voor wie net begint is het een
  // dure vergissing. We houden het niet tegen, maar we vragen wél extra door.
  const HOOFDTAKKEN = ['main', 'master']
  const isHoofdtak = (naam) => HOOFDTAKKEN.includes(String(naam || '').replace(/^[^/]+\//, ''))

  // Waarom je nu niet kunt wisselen. Git weigert bij vuile bestanden die de
  // andere tak ook aanraakt — maar wélke dat zijn weet git pas als het misgaat,
  // dus we waarschuwen bij alles wat vuil is.
  function wisselBlokkade(staat, doelNaam) {
    if (!staat || !staat.isRepo) return 'geen-repo'
    if (doelNaam && staat.branch === doelNaam) return 'zelfde'
    if (staat.vuil > 0) return 'vuil'
    return null
  }

  // ── Netwerkpaden (UNC) ──────────────────────────────────────────────────────
  // `\\server\share\map` is een geldig pad voor Node, voor de verkenner en voor
  // git. Niet voor cmd.exe: die weigert een UNC-pad als werkmap, wijkt uit naar
  // C:\Windows en geeft daarna gewoon exit 0 terug. Het commando draait dan in
  // de verkeerde map terwijl alles op geslaagd lijkt — en bij `git add -A` of
  // iets dat bestanden weggooit is dat geen kleine vergissing. Vandaar dat de
  // app zo'n pad moet kunnen herkennen vóórdat er iets start.
  //
  // Een gekoppelde schijfletter (P:\) heeft dit probleem niet. Voor cmd is dat
  // een gewone schijf, ook al zit er een netwerkshare achter. Dat is meteen de
  // uitweg die we de gebruiker aanraden.
  //
  // Alleen een servernaam (`\\server`) telt niet: daar valt niet in te werken,
  // er moet een share achter staan.
  function serverEnShare(rest) {
    return /^[^\\/]+[\\/]+[^\\/]/.test(String(rest || ''))
  }

  function isUncPad(pad) {
    const p = String(pad || '')
    if (!/^[\\/]{2}/.test(p)) return false
    const rest = p.slice(2)
    // `\\?\` en `\\.\` zijn apparaatnamen, geen netwerkpad. Uitzondering:
    // `\\?\UNC\server\share` is er wél een, alleen in de lange schrijfwijze.
    if (/^[?.][\\/]/.test(rest)) {
      const lang = rest.match(/^[?.][\\/]UNC[\\/]([\s\S]+)$/i)
      return lang ? serverEnShare(lang[1]) : false
    }
    return serverEnShare(rest)
  }

  // Schijfletter uit een pad (`P:\x` → `P`). Leeg bij UNC of iets zonder letter.
  function schijfLetterVan(pad) {
    const m = String(pad || '').match(/^([a-zA-Z]):/)
    return m ? m[1].toUpperCase() : ''
  }

  // UNC óf een gekoppelde netwerkschijf (P:, Z:, …). De set met letters komt
  // van buiten — git-tools blijft puur, main/renderer bepalen welke letters
  // Remote zijn. Zonder set blijft alleen UNC herkend: dat is bewust, zodat
  // tests en niet-Windows geen valse positieven krijgen op C:.
  function isNetwerkPad(pad, netwerkLetters) {
    if (isUncPad(pad)) return true
    const letter = schijfLetterVan(pad)
    if (!letter) return false
    if (!netwerkLetters) return false
    if (netwerkLetters instanceof Set) return netwerkLetters.has(letter)
    if (Array.isArray(netwerkLetters)) return netwerkLetters.map(l => String(l).toUpperCase()).includes(letter)
    return false
  }

  // De regel waarmee cmd.exe meldt dat hij is uitgeweken. Dit is een vangnet en
  // niet de eerste verdediging: Windows vertaalt deze tekst, dus op een
  // anderstalige installatie herkennen we hem niet. Daarom houdt de app een
  // UNC-werkmap al tegen vóór het starten, en dient dit alleen voor het geval
  // een commando er onderweg zelf een van maakt.
  function uncWaarschuwing(regel) {
    const r = String(regel || '')
    return /UNC[- ]paths? are not supported/i.test(r)
        || /CMD\.EXE was started with the above path/i.test(r)
  }

  // De wortel van een netwerkpad: `\\server\share`, zonder wat erachter staat.
  // Geeft '' als het geen netwerkpad is.
  //
  // De boom heeft dit op twee plekken nodig. Bij "omhoog", want boven een share
  // zit geen map meer — en bij het opbouwen van de keten naar een pad, want die
  // begint daar bij `\\server\share` in plaats van bij een schijfletter.
  function uncWortel(pad) {
    const p = String(pad || '')
    if (!isUncPad(p)) return ''
    const scheider = p[0] === '/' ? '/' : '\\'
    // `\\?\UNC\server\share` wijst naar dezelfde plek als `\\server\share`, maar
    // het voorvoegsel hoort bij de wortel: laat je het weg, dan is het pad niet
    // langer hetzelfde pad.
    const lang = p.slice(2).match(/^([?.][\\/]UNC[\\/])([\s\S]+)$/i)
    const kop = lang ? p.slice(0, 2) + lang[1] : p.slice(0, 2)
    const delen = (lang ? lang[2] : p.slice(2)).split(/[\\/]/).filter(Boolean)
    if (delen.length < 2) return ''
    return kop + delen[0] + scheider + delen[1]
  }

  // Is dit de share zelf, zonder submap erachter? Dan houdt "omhoog" hier op.
  function isUncWortel(pad) {
    const w = uncWortel(pad)
    if (!w) return false
    const kaal = (x) => String(x).replace(/[\\/]+$/, '').toLowerCase()
    return kaal(w) === kaal(pad)
  }

  // Hoe een netwerkwortel in de boom en de schijvenlijst komt te staan. De twee
  // strepen ervoor zeggen niets extra's; `server\share` leest prettiger en valt
  // meteen op tussen C: en D:.
  function uncNaam(pad) {
    const w = uncWortel(pad) || String(pad || '')
    return w.replace(/^[\\/]{2}/, '').replace(/^[?.][\\/]UNC[\\/]/i, '')
  }

  // Een cmd-commando dat wél in een netwerkmap draait.
  //
  // cmd kan zelf niet in een UNC-map starten, maar `pushd` kan er een tijdelijke
  // schijfletter aan hangen en daarheen springen. Die letter verdwijnt vanzelf
  // zodra het cmd-proces eindigt — nagemeten over zes ronden, er blijft niets
  // hangen in `net use`.
  //
  // Er staat bewust géén `popd` achteraan, en dat is geen slordigheid: `… & popd`
  // overschrijft de exitcode van het commando met die van popd. Gemeten gaf
  // `pushd … && cmd /c exit 3 & popd` gewoon status 0, en `git` in een map zonder
  // repo net zo goed. Dan meldt de app "klaar" bij een mislukking, en dat is
  // precies de fout die dit hele verhaal moest oplossen.
  //
  // `&&` in plaats van `&` is net zo bewust: lukt pushd niet (share weg, geen
  // rechten), dan draait het commando niet alsnog in een andere map. Dat is
  // gemeten: een niet-bestaande share geeft status 1 en het commando blijft uit.
  //
  // Geeft terug wat er gespawned moet worden. Op een gewoon pad, of buiten
  // Windows, verandert er niets: zelfde commando, zelfde werkmap.
  //
  // Let op — `%CD%` en andere `%VAR%` in het commando worden door cmd uitgevouwen
  // vóórdat pushd draait, dus die wijzen niet naar de netwerkmap. Daar valt
  // binnen cmd niets aan te doen; de app zegt het er daarom bij.
  function cmdInMap(cmd, pad, windows = true) {
    if (!windows || !isUncPad(pad)) return { cmd, cwd: pad, viaLetter: false }
    // Een aanhalingsteken kan niet in een Windows-pad voorkomen, dus weghalen
    // kan geen geldig pad slopen — en het houdt de commandoregel heel.
    const schoon = String(pad).replace(/["\r\n]+/g, '')
    // Zonder commando is er niets om aan vast te plakken: dan alleen de sprong,
    // en geen `&&` die aan het eind in de lucht hangt. Dat geval bestaat bij het
    // lege consolevenster (zie vensterInMap).
    const kern = String(cmd == null ? '' : cmd).trim()
    if (!kern) return { cmd: `pushd "${schoon}"`, cwd: null, viaLetter: true }
    return { cmd: `pushd "${schoon}" && ${kern}`, cwd: null, viaLetter: true }
  }

  // Hetzelfde probleem, maar voor de knoppen die een LOS consolevenster openen.
  //
  // Die gaan via `cmd.exe /c start "" /D <map> <programma>`. Gemeten op
  // `\\192.168.100.200\Projecten`: `/D` met een netwerkpad gaat mis zodra het
  // programma cmd.exe is (of een .bat, want die wordt dóór cmd gedraaid). Het
  // venster opende gewoon, maar stond in `C:\Windows` — dezelfde stille
  // verhuizing als in fase 1, en nog stiller, want main.js doet `.unref()` en
  // meldt `true` zonder ooit naar een exitcode te kijken. Een andere ronde gaf
  // `start` zelf "The current directory is invalid." en helemaal geen venster.
  // Geen van beide is te zien voor de gebruiker.
  //
  // `/D` is niet de boosdoener: met powershell.exe erachter landde hetzelfde
  // `start "" /D <unc>` netjes in de share. Het is opnieuw cmd.exe zelf. Daarom
  // blijft de powershell-knop ongemoeid.
  //
  // De oplossing is dezelfde `pushd` als bij cmdInMap, maar hij moet nu door twee
  // cmd-lagen heen: die van `start` en die van het venster. Dat overleeft een
  // argumentenlijst niet — node ontsnapt een `"` in een argument als `\"`, en
  // cmd.exe kent die schrijfwijze niet. Gemeten: met een argumentenlijst kwam er
  // "The specified path is invalid." en geen venster. Met één commandoregel via
  // `shell: true` (precies zoals runCommandOnce het al doet) opende het venster
  // wél op de tijdelijke letter, ook bij een share met een spatie in de naam.
  //
  // Het extra paar aanhalingstekens om de hele pushd-regel is nodig en niet
  // dubbelop: het houdt de `&&` binnen de aanhalingstekens, zodat de buitenste
  // cmd (die van `start`) hem niet als scheidingsteken opvat en het commando
  // buiten het venster om zou draaien. `cmd /k` haalt dat buitenste paar er zelf
  // weer af.
  //
  // Ook hier geen `popd`. Bij cmdInMap omdat het de exitcode opslokt; hier omdat
  // een venster dat blijft openstaan de gebruiker meteen weer uit de map zou
  // gooien terwijl hij nog zit te typen.
  //
  // Prijs daarvan, nagemeten: gaat het venster hard dicht (kruisje, taskkill),
  // dan blijft de tijdelijke letter in `net use` staan. Sluit de gebruiker het
  // met `exit`, of eindigt het commando gewoon, dan ruimt cmd hem wel op. Een
  // achtergebleven letter wijst naar dezelfde share die de gebruiker zelf koos,
  // dus hij is onschuldig — maar hij is er.
  //
  //   pad        de map waar het venster moet staan
  //   binnen     wat er in dat venster moet draaien; leeg = alleen de prompt.
  //              Een pad met spaties hoort hier al tussen aanhalingstekens.
  //   blijfOpen  true -> `cmd /k`, het venster blijft na afloop staan
  //              false -> `cmd /c`, het venster sluit als het klaar is
  //
  // Geeft `null` terug als er niets bijzonders nodig is (geen Windows, of een
  // gewoon pad). De aanroeper houdt dan zijn eigen `start "" /D <map> …` en er
  // verandert helemaal niets. Anders een kant-en-klare commandoregel voor
  // `spawn(regel, [], { shell: true })`.
  function vensterInMap(pad, binnen, blijfOpen, windows = true) {
    if (!windows || !isUncPad(pad)) return null
    const kern = cmdInMap(binnen, pad, true).cmd
    return `start "" cmd.exe ${blijfOpen ? '/k' : '/c'} "${kern}"`
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
  //   Venster sluiten / account wisselen
  //                     volledig controleerbaar. Per onveilig project een
  //                     eigen vraag, en pas verder als de gebruiker klaar is.
  //   Windows afsluiten ~5 seconden als Windows het proces afkapt. We starten
  //                     dezelfde vragen (close / QUERYENDSESSION); stash is
  //                     het vangnet als er geen tijd meer is voor een gesprek.
  //
  // De instelling `stashen` gaat over dat vangnet. Bij het sluiten van het
  // venster en bij wisselen krijg je altijd de vraag, tenzij de controle
  // helemaal uit staat.
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


  // ── .gitignore ──────────────────────────────────────────────────────────────
  // Waarom dit bestaat: `git init` gevolgd door `git add -A` in een Android-map
  // probeert app/build/ mee te nemen. Duizenden gegenereerde bestanden, en één
  // ervan heeft een pad langer dan Windows aankan — dan valt de hele commit om
  // met "Filename too long" en heb je een repo zonder enkele commit. Datzelfde
  // geldt voor node_modules, .gradle, build en target.
  //
  // Dus: vóór de eerste commit een .gitignore die past bij wat er in de map
  // staat. Niet één grote lijst voor alles — dan staat er van alles in wat
  // niets met dit project te maken heeft en leest niemand hem meer.

  // Wat ligt er in de map, en wat zegt dat over het soort project? Alleen de
  // bovenste laag: dieper zoeken kost tijd en zegt niets extra's.
  const SOORT_MARKERS = [
    { soort: 'flutter', bestanden: ['pubspec.yaml'] },
    { soort: 'gradle',  bestanden: ['build.gradle', 'build.gradle.kts', 'settings.gradle', 'settings.gradle.kts', 'gradlew'] },
    { soort: 'node',    bestanden: ['package.json'] },
    { soort: 'python',  bestanden: ['requirements.txt', 'pyproject.toml', 'setup.py', 'Pipfile'] },
    { soort: 'rust',    bestanden: ['Cargo.toml'] },
    { soort: 'go',      bestanden: ['go.mod'] },
    { soort: 'dotnet',  bestanden: ['.sln', '.csproj'] },   // achtervoegsels
    { soort: 'php',     bestanden: ['composer.json'] },
    { soort: 'ruby',    bestanden: ['Gemfile'] },
  ]

  function projectSoorten(namen) {
    const lijst = (Array.isArray(namen) ? namen : []).map(n => String(n || ''))
    const uit = []
    for (const m of SOORT_MARKERS) {
      const raak = lijst.some(n => m.bestanden.some(b =>
        b.startsWith('.') ? n.toLowerCase().endsWith(b) : n === b))
      if (raak) uit.push(m.soort)
    }
    // Flutter brengt zijn eigen android/-map mee met gradle erin. Dan is
    // "flutter" het antwoord en zou "gradle" erbij alleen maar dubbele regels
    // opleveren voor een build/-map die de flutter-regels al dekken.
    return uit.includes('flutter') ? uit.filter(s => s !== 'gradle') : uit
  }

  // De blokken zelf. Elk blok begint met een regel die zegt waaróm het er
  // staat: een .gitignore die je over een jaar terugleest moet zichzelf
  // uitleggen, anders durft niemand er iets uit te halen.
  const NEGEER_BLOKKEN = {
    algemeen: ['# rommel van het systeem en de editor',
               '.DS_Store', 'Thumbs.db', 'desktop.ini', '*.log',
               '.idea/', '.vscode/', '*.iml', '*.swp', '*~'],
    geheim:   ['# sleutels en wachtwoorden horen niet in de geschiedenis',
               '.env', '.env.*', '!.env.example', '*.pem', '*.key'],
    flutter:  ['# flutter/dart', '.dart_tool/', '.packages', '.flutter-plugins',
               '.flutter-plugins-dependencies', 'build/', '.pub-cache/', '.pub/',
               'ios/Pods/', 'ios/.symlinks/', 'android/.gradle/', 'android/local.properties'],
    gradle:   ['# gradle/android — dit is gegenereerd, het hoort niet in git',
               '.gradle/', 'build/', '*/build/', '.kotlin/', '.cxx/', 'captures/',
               'local.properties', '*.apk', '*.aab', '*.keystore', '*.jks'],
    node:     ['# node', 'node_modules/', 'dist/', 'build/', '.next/', 'coverage/',
               'npm-debug.log*', 'yarn-error.log*'],
    python:   ['# python', '__pycache__/', '*.py[cod]', '.venv/', 'venv/',
               '*.egg-info/', '.pytest_cache/', '.mypy_cache/'],
    rust:     ['# rust', 'target/'],
    go:       ['# go', 'vendor/'],
    dotnet:   ['# .net', 'bin/', 'obj/', '*.user'],
    php:      ['# php', 'vendor/'],
    ruby:     ['# ruby', '.bundle/', 'vendor/bundle/'],
  }

  function gitignoreVoor(soorten) {
    const lijst = (Array.isArray(soorten) ? soorten : []).filter(s => NEGEER_BLOKKEN[s])
    const delen = [NEGEER_BLOKKEN.algemeen.join('\n'), NEGEER_BLOKKEN.geheim.join('\n')]
    for (const s of lijst) delen.push(NEGEER_BLOKKEN[s].join('\n'))
    return delen.join('\n\n') + '\n'
  }

  // Mappen die er nooit in horen, waar ze ook staan. Hiermee herkennen we in de
  // lijst met nog-niet-vastgelegde bestanden of er bouwrommel klaarstaat om
  // meegenomen te worden — dát is het moment om het te zeggen, niet nadat de
  // commit is omgevallen.
  const BOUWMAPPEN = ['node_modules', 'build', '.gradle', 'target', '.dart_tool',
                      'dist', '__pycache__', '.next', 'bin', 'obj', 'vendor', '.kotlin']

  function bouwrommel(bestanden) {
    const uit = []
    for (const b of (Array.isArray(bestanden) ? bestanden : [])) {
      const delen = String(b || '').split(/[\\/]/).filter(Boolean)
      const raak = delen.find(d => BOUWMAPPEN.includes(d))
      if (raak && !uit.includes(b)) uit.push(b)
    }
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
  const KOPPEL_HERSTEL   = 'herstel'   // er staat een adres, maar het werkt niet
  const KOPPEL_AL_GEDAAN = 'gekoppeld' // niets te doen

  function koppelStap(staat, ghAanwezig) {
    if (!staat || !staat.beschikbaar) return null
    // Kapot gaat vóór klaar: er staat wel een remote, dus KOPPEL_GH zou hier
    // stukloopen op "remote origin already exists". Eerst opruimen.
    if (staat.koppelingStuk) return KOPPEL_HERSTEL
    if (staat.gekoppeld) return KOPPEL_AL_GEDAAN
    if (!staat.isRepo) return KOPPEL_INIT
    if (!staat.commits) return KOPPEL_COMMIT
    return ghAanwezig ? KOPPEL_GH : KOPPEL_URL
  }

  // Wat er mis is, in woorden die iets voorstellen. De sleutel wijst naar de
  // vertaling; de app plakt er zelf het adres bij.
  function koppelingProbleem(staat) {
    if (!staat || !staat.koppelingStuk) return null
    const reden = staat.remoteReden || 'onbekend'
    return {
      reden,
      sleutel: 'git.koppel.stuk.' + (reden === 'weg' ? 'weg' : 'inloggen'),
      remote: staat.remote || 'origin',
      url: staat.remoteUrl || '',
    }
  }

  // Herstellen kan op twee manieren, en welke het wordt bepaalt de gebruiker,
  // niet wij: het adres verbeteren (de repo bestaat, hij heette anders) of
  // opnieuw beginnen (de repo is er nooit gekomen). Allebei halen we eerst het
  // oude adres weg — een remote die blijft staan is precies hoe deze situatie
  // ontstond.
  function herstelCommando(staat, opties = {}) {
    const { naam = '', url = '', prive = true } = opties
    const remote = (staat && staat.remote) || 'origin'
    const branch = (staat && staat.branch) || 'main'
    if (url) {
      const schoon = normaliseerRepoUrl(url)
      if (!schoon) return null
      return `git remote set-url ${remote} ${schoon} && git push -u ${remote} ${branch}`
    }
    if (naam) {
      const repo = veiligeRepoNaam(naam)
      if (!repo) return null
      return `git remote remove ${remote} && gh repo create ${repo} ${prive ? '--private' : '--public'} --source=. --push`
    }
    return null
  }

  // Losmaken zonder iets nieuws: het adres eraf, de geschiedenis blijft.
  // Daarna staat de gewone koppelknop er weer en begin je schoon opnieuw.
  function ontkoppelCommando(staat) {
    return remoteWegCommando(staat && staat.remote)
  }

  function langePadenCommando() {
    return 'git config core.longpaths true'
  }

  // Dezelfde twee handelingen, maar dan op een remote die je zelf aanwijst.
  // Nodig zodra er meer dan één is: dan is "de" remote niet genoeg.
  function remoteWegCommando(naam) {
    return naam ? `git remote remove ${naam}` : null
  }

  function remoteUrlCommando(naam, url) {
    const schoon = normaliseerRepoUrl(url)
    return (naam && schoon) ? `git remote set-url ${naam} ${schoon}` : null
  }

  // ── Wat is er mis met deze repo? ────────────────────────────────────────────
  // De git-sectie bij de projectinstellingen laat dit zien met per punt een
  // knop. Het staat hier en niet in de renderer omdat het puur een oordeel over
  // de toestand is — en omdat "welke problemen zie je" precies het soort vraag
  // is dat je wilt kunnen testen zonder een venster te openen.
  //
  //   ernst 'fout'   je loopt hier vast: dit moet eerst
  //   ernst 'let-op' het werkt, maar het gaat een keer misgaan
  //   ernst 'info'   niets kapots, alleen nog niet gedaan
  //
  // `actie` zegt welke knop erbij hoort; null betekent: alleen uitleg.
  function gitProblemen(staat) {
    const uit = []
    if (!staat) return uit
    if (!staat.beschikbaar) return [{ id: 'geen-git', ernst: 'fout', actie: null }]
    if (!staat.isRepo) return [{ id: 'geen-repo', ernst: 'info', actie: 'koppelen' }]

    // Bovenaan wat je tegenhoudt, daaronder wat later pijn doet. De volgorde
    // is de volgorde waarin je het wilt oplossen.
    if (staat.koppelingStuk) {
      uit.push({ id: 'koppeling-stuk', ernst: 'fout', actie: 'herstellen',
                 reden: staat.remoteReden || 'onbekend', remote: staat.remote, url: staat.remoteUrl })
    }
    if (staat.conflicten > 0) uit.push({ id: 'conflicten', ernst: 'fout', actie: 'diff', aantal: staat.conflicten })
    if (!staat.naam || !staat.email) uit.push({ id: 'geen-identiteit', ernst: 'fout', actie: 'profiel' })
    if (staat.commits && !staat.branch) uit.push({ id: 'losgekoppeld', ernst: 'fout', actie: 'branch' })

    // De branch volgt een remote die niet meer bestaat. Dan lijkt `git status`
    // te werken maar weet git niet meer waar vooruit/achter op slaat.
    const volgt = String(staat.upstream || '').split('/')[0]
    if (volgt && !staat.remotes.includes(volgt)) {
      uit.push({ id: 'upstream-weg', ernst: 'fout', actie: 'push', remote: volgt })
    }

    // Dit is de volgorde waarin het misgaat: eerst staat er geen .gitignore,
    // dan pakt `git add -A` de bouwmappen mee, en dan valt de commit om op een
    // pad dat Windows niet aankan. Alle drie apart melden, want ze zijn apart
    // op te lossen — en de eerste voorkomt de andere twee.
    const rommel = bouwrommel(staat.nieuweBestanden)
    if (staat.gitignore === false) {
      uit.push({ id: 'geen-gitignore', ernst: rommel.length ? 'fout' : 'let-op', actie: 'gitignore' })
    } else if (rommel.length) {
      uit.push({ id: 'bouwmap-in-git', ernst: 'fout', actie: 'gitignore',
                 aantal: rommel.length, mappen: rommel.slice(0, 6) })
    }
    if (staat.windows && staat.langePaden === false) {
      uit.push({ id: 'lange-paden', ernst: 'let-op', actie: 'langepaden' })
    }

    if (!staat.commits) uit.push({ id: 'geen-commits', ernst: 'info', actie: 'commit' })
    else if (!staat.heeftRemote) uit.push({ id: 'geen-remote', ernst: 'info', actie: 'koppelen' })
    else if (!staat.koppelingStuk && !staat.upstream) uit.push({ id: 'geen-upstream', ernst: 'let-op', actie: 'push' })

    // Twee remotes is zelden bedoeld en bijna altijd het spoor van een eerdere
    // koppelpoging. Het is niet kapot, maar het is wel hoe een push in de
    // verkeerde repo belandt.
    if (staat.remotes.length > 1) {
      uit.push({ id: 'meerdere-remotes', ernst: 'let-op', actie: 'remotes', aantal: staat.remotes.length })
    }
    return uit
  }

  // Het ergste wat er in de lijst staat. Bepaalt de kleur van de sectiekop, en
  // of er überhaupt iets te melden valt.
  function ergsteErnst(problemen) {
    const lijst = problemen || []
    if (lijst.some(p => p.ernst === 'fout')) return 'fout'
    if (lijst.some(p => p.ernst === 'let-op')) return 'let-op'
    return lijst.length ? 'info' : ''
  }

  // De commandoregel die bij een stap hoort. Eén regel, zodat hij in de
  // terminal van de app zichtbaar draait en je de uitvoer gewoon ziet.
  function koppelCommando(stap, opties = {}) {
    const { naam = '', url = '', branch = 'main', prive = true } = opties
    // core.longpaths erbij: zonder dat loopt Windows vast op een pad langer
    // dan 260 tekens, en dat is precies wat een Android- of node-project met
    // gegenereerde bestanden oplevert. De fout die je dan krijgt ("Filename too
    // long") zegt niets over de oorzaak en laat je met een repo zonder commits
    // achter. Op Linux en macOS doet de instelling niets.
    if (stap === KOPPEL_INIT) return 'git init -b main && git config core.longpaths true'
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

  // Aanhalingstekens om een pad op de commandoregel. Dubbele quotes erin
  // worden weggehaald — cmd ziet die anders als einde van de string.
  function cmdPad(pad) {
    return '"' + String(pad || '').replace(/"/g, '') + '"'
  }

  // Bare repo op een share. Zonder `-b main` zet `git init --bare` HEAD op
  // master; een kloon komt dan op een lege master uit (gemeten, zie onderzoek
  // netwerkschijven §4). Het pad zit in het commando zodat cwd de bestaande
  // share mag blijven — de bare-map hoeft nog niet te bestaan.
  function bareInitCommando(barePad) {
    if (!barePad) return null
    return `git init --bare -b main ${cmdPad(barePad)}`
  }

  function bareCloneCommando(barePad, lokaleMap) {
    if (!barePad || !lokaleMap) return null
    return `git clone ${cmdPad(barePad)} ${cmdPad(lokaleMap)}`
  }

  // Pad + mapnaam samenvoegen, met de scheidingstekens van het basispad.
  function joinPad(basis, naam) {
    const b = String(basis || '').replace(/[\\/]+$/, '')
    if (!b) return String(naam || '')
    const sep = b.includes('/') && !b.includes('\\') ? '/' : '\\'
    return b + sep + String(naam || '')
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
  // Bij het wisselen van app-account moet git meeschakelen. Niet per map maar
  // globaal: je bent nú deze persoon, en dat geldt voor elke repo waar niets
  // anders is ingesteld. Een repo met een eigen user.name blijft die houden —
  // dat is een bewuste keuze van wie hem daar heeft gezet.
  function globaalIdentiteitCommando(profiel) {
    if (!profielGeldig(profiel)) return null
    return `git config --global user.name "${veiligConfigWaarde(profiel.naam)}"`
         + ` && git config --global user.email "${veiligConfigWaarde(profiel.email)}"`
  }

  // Welk GitHub-account git moet gebruiken als er meerdere in de Windows-kluis
  // staan. Zonder dit pakt git de eerste de beste en push je als de verkeerde.
  function globaalGhGebruikerCommando(ghGebruiker) {
    const naam = String(ghGebruiker || '').trim()
    if (!geldigeGhGebruiker(naam)) return null
    return `git config --global "credential.https://github.com.username" "${naam}"`
  }

  // Alles wat er bij het activeren van een account moet gebeuren, als losse
  // stappen. Los, want ze kunnen onafhankelijk van elkaar mislukken: gh hoeft
  // niet geïnstalleerd te zijn om je naam wel goed te zetten.
  function accountActiveerStappen(profiel, ghAanwezig = false) {
    const uit = []
    const ident = globaalIdentiteitCommando(profiel)
    if (ident) uit.push({ soort: 'identiteit', cmd: ident })

    const cred = globaalGhGebruikerCommando(profiel && profiel.ghGebruiker)
    if (cred) uit.push({ soort: 'github-gebruiker', cmd: cred })

    if (ghAanwezig) {
      const sw = ghSwitchCommando(profiel && profiel.ghGebruiker)
      if (sw) uit.push({ soort: 'gh-wissel', cmd: sw })
    }
    return uit
  }

  // De inlogstroom van de GitHub-CLI. --web opent je browser en toont een code;
  // dat is de enige variant die zonder token-plakwerk werkt en waarbij er nooit
  // een wachtwoord door de app heen gaat.
  function ghLoginCommando() {
    return 'gh auth login --hostname github.com --git-protocol https --web'
  }

  // De GitHub-CLI installeren. Alleen op verzoek, nooit uit zichzelf: een app
  // die ongevraagd andere software installeert is gedrag dat je van malware
  // verwacht. De vlaggen zijn nodig omdat winget anders om bevestiging vraagt
  // in een venster dat niemand ziet; --scope user voorkomt dat er om
  // beheerdersrechten wordt gevraagd.
  function ghInstallCommando() {
    return 'winget install --id GitHub.cli -e --source winget --scope user'
         + ' --accept-package-agreements --accept-source-agreements'
  }

  // ── Je gegevens ophalen bij GitHub ──────────────────────────────────────────
  // Na het inloggen weet gh wie je bent. Dan hoeft niemand zijn naam en adres
  // over te typen — de app haalt ze op. Dat scheelt niet alleen werk maar ook
  // typefouten: een verkeerd adres in je commits merk je pas als GitHub ze niet
  // meer aan je account koppelt.
  function parseGhUser(json) {
    let d = null
    try { d = JSON.parse(String(json || '')) } catch { return null }
    if (!d || typeof d !== 'object') return null
    const login = String(d.login || '').trim()
    if (!login) return null
    return {
      login,
      naam: String(d.name || '').trim() || login,
      email: String(d.email || '').trim(),
      id: Number.isFinite(d.id) ? d.id : null,
    }
  }

  // Het adres waarmee GitHub je commits aan je account koppelt zónder je echte
  // adres te tonen. Wie zijn e-mailadres privé heeft staan, hoort dit te
  // krijgen — anders belandt zijn privéadres in een publieke geschiedenis.
  function noreplyEmail(id, login) {
    const l = String(login || '').trim()
    if (!l) return ''
    return Number.isFinite(id) ? `${id}+${l}@users.noreply.github.com` : `${l}@users.noreply.github.com`
  }

  // `gh api user/emails` geeft alle adressen. We willen het primaire dat ook
  // geverifieerd is; een niet-geverifieerd adres accepteert GitHub niet.
  function parseGhEmails(json) {
    let d = null
    try { d = JSON.parse(String(json || '')) } catch { return '' }
    if (!Array.isArray(d)) return ''
    const primair = d.find(e => e && e.primary && e.verified)
    if (primair && primair.email) return String(primair.email).trim()
    const geverifieerd = d.find(e => e && e.verified && e.email)
    return geverifieerd ? String(geverifieerd.email).trim() : ''
  }

  // Alles bij elkaar tot de identiteit die op het account komt te staan.
  // Volgorde: het geverifieerde primaire adres, anders wat er op het profiel
  // staat, anders het noreply-adres. Nooit leeg als we een login hebben.
  function ghIdentiteit(user, emails = '') {
    if (!user || !user.login) return null
    return {
      gitNaam: user.naam || user.login,
      gitEmail: emails || user.email || noreplyEmail(user.id, user.login),
      ghGebruiker: user.login,
    }
  }

  // Welke GitHub-accounts staan er al klaar op deze pc?
  function parseGhAccounts(uit) {
    const namen = []
    for (const regel of String(uit || '').split('\n')) {
      // 'Logged in to github.com account redubbledd1-ops (keyring)'
      const m = regel.match(/account\s+([A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?)/)
      if (m && !namen.includes(m[1])) namen.push(m[1])
    }
    return namen
  }

  // De eenmalige code die gh toont: ABCD-1234. Zonder die vorm is er niets
  // om te kopiëren — een gewone zin als "Press Enter" mag dus geen code zijn.
  function parseGhLoginCode(tekst) {
    const m = String(tekst || '').match(/\b([A-Z0-9]{4}-[A-Z0-9]{4})\b/)
    return m ? m[1] : ''
  }

  // Het adres dat je in een privévenster of andere browser plakt. gh zet het
  // in twee vormen neer: "Open this URL: …" zonder TTY, of "Press Enter to
  // open …" mét. Device-flow en oauth-authorize allebei, want gh kiest zelf.
  function parseGhLoginUrl(tekst) {
    const m = String(tekst || '').match(/https:\/\/(?:www\.)?github\.com\/login\/(?:device|oauth\/authorize)[^\s"'<>]*/i)
    return m ? m[0].replace(/[.,);]+$/, '') : ''
  }

  // Welke GitHub-accounts zijn erbíj gekomen? Na een tweede inlog is dát de
  // persoon die je zojuist hebt gekoppeld — niet het account dat er al stond.
  function nieuwGhAccount(voor, na) {
    const oud = new Set(voor || [])
    return (na || []).filter(n => !oud.has(n))
  }

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

  // De mapnaam die `git clone` zou kiezen: het laatste stuk van het adres,
  // zonder .git. Leeg als het geen repository-adres is.
  function repoNaamUitUrl(invoer) {
    const url = normaliseerRepoUrl(invoer)
    if (!url) return ''
    const kaal = String(url).replace(/\.git$/i, '').replace(/[\\/]+$/, '')
    const stuk = (kaal.split(/[:/\\]/).filter(Boolean).pop() || '').trim()
    if (!stuk) return ''
    return veiligeRepoNaam(stuk)
  }

  // Waar de bestanden terechtkomen. Is de gekozen locatie al de reponaam,
  // dan is dat de map zelf; anders komt er een map met die naam onder.
  function cloneDoelPad(url, locatiePad) {
    const naam = repoNaamUitUrl(url)
    const loc = String(locatiePad || '').replace(/[\\/]+$/, '')
    if (!naam || !loc) return null
    const basis = (loc.split(/[/\\]/).filter(Boolean).pop() || '')
    if (basis.toLowerCase() === naam.toLowerCase()) return loc
    const sep = loc.includes('/') && !loc.includes('\\') ? '/' : '\\'
    return loc + sep + naam
  }

  function cloneOuderPad(doel) {
    const p = String(doel || '').replace(/[\\/]+$/, '')
    const i = Math.max(p.lastIndexOf('\\'), p.lastIndexOf('/'))
    if (i < 0) return ''
    if (i === 2 && /^[A-Za-z]:/.test(p)) return p.slice(0, 3)
    return p.slice(0, i)
  }

  // De repositories van het ingelogde GitHub-account. Twee vormen komen hier
  // binnen: `gh repo list --json` (nameWithOwner/url/isPrivate) en, als terugval
  // voor oudere gh, `gh api user/repos` (full_name/html_url/private). Ze wijzen
  // naar hetzelfde, dus vertalen we ze allebei naar één vorm.
  function parseGhRepos(uitvoer) {
    let ruw = null
    try { ruw = JSON.parse(String(uitvoer || '')) } catch { return [] }
    if (!Array.isArray(ruw)) return []

    const uit = []
    for (const r of ruw) {
      if (!r || typeof r !== 'object') continue
      const volledig = String(r.nameWithOwner || r.full_name || '').trim()
      if (!volledig) continue
      const naam = String(r.name || volledig.split('/').pop() || '').trim()
      const adres = String(r.url || r.html_url || r.clone_url || '').trim()
        || ('https://github.com/' + volledig)
      uit.push({
        naam,
        volledig,
        url: adres.replace(/\.git$/i, '') + '.git',
        beschrijving: String(r.description || '').trim(),
        prive: !!(r.isPrivate || r.private),
        bijgewerkt: String(r.updatedAt || r.updated_at || r.pushedAt || r.pushed_at || '').trim(),
      })
    }

    // Nieuwste bovenaan: waar je gisteren aan werkte is bijna altijd waar je
    // nu naar zoekt.
    uit.sort((a, b) => String(b.bijgewerkt).localeCompare(String(a.bijgewerkt)))
    return uit
  }

  // ── Een blijven staan slot ──────────────────────────────────────────────────
  // Git zet een index.lock neer voordat hij schrijft en haalt hem daarna weg.
  // Wordt hij onderweg afgebroken — venster dicht, pc uit, een crash — dan
  // blijft dat bestand staan en weigert élke volgende commit. De melding komt
  // altijd in het Engels uit git zelf, dus daar kunnen we op af.
  function gitSlotFout(tekst) {
    const s = String(tekst || '')
    if (!/index\.lock/i.test(s) && !/Another git process seems to be running/i.test(s)) return null
    const m = s.match(/(?:Unable to create|kan .* niet maken)\s+'([^']*index\.lock)'/i)
    return { pad: m ? m[1] : '' }
  }

  // "eigenaar/repo", kleingeschreven, uit welk adres dan ook. Https, ssh en
  // `gebruiker/repo` wijzen naar dezelfde repository maar zien er anders uit;
  // hiermee herken je dat het om dezelfde gaat.
  function repoSleutel(invoer) {
    const url = normaliseerRepoUrl(invoer)
    if (!url) return ''
    const kaal = String(url).replace(/\.git$/i, '').replace(/[\\/]+$/, '')
    const delen = kaal.replace(/^[a-z+]+:\/\//i, '').replace(/^[^@/]+@/, '').split(/[:/\\]/).filter(Boolean)
    if (delen.length < 2) return ''
    return delen.slice(-2).join('/').toLowerCase()
  }

  // Repositories die al aan een project van deze gebruiker hangen horen niet in
  // de kieslijst: die staan er al. Wel tellen hoeveel er wegvielen, want een
  // stilzwijgend kortere lijst is een lijst waarin je gaat zoeken naar iets dat
  // er wél zou moeten staan.
  function zonderGekoppelde(lijst, gebruikteAdressen) {
    const alles = Array.isArray(lijst) ? lijst.slice() : []
    const bezet = new Set((gebruikteAdressen || []).map(repoSleutel).filter(Boolean))
    if (!bezet.size) return { lijst: alles, verborgen: 0 }
    const over = alles.filter(r => !bezet.has(repoSleutel(r && r.url)))
    return { lijst: over, verborgen: alles.length - over.length }
  }

  // Zoeken in die lijst. Naam, eigenaar en omschrijving tellen allemaal mee, en
  // losse woorden mogen in willekeurige volgorde: "dd music" vindt DD-Music.
  function filterRepos(lijst, zoek) {
    const q = String(zoek || '').trim().toLowerCase()
    const alles = Array.isArray(lijst) ? lijst.slice() : []
    if (!q) return alles
    const delen = q.split(/\s+/).filter(Boolean)
    return alles.filter(r => {
      const hooiberg = ((r && r.volledig) || '') + ' ' + ((r && r.beschrijving) || '')
      const kleine = hooiberg.toLowerCase()
      return delen.every(d => kleine.includes(d))
    })
  }

  function cloneCommando(url, doel) {
    const adres = String(normaliseerRepoUrl(url) || '').replace(/[\r\n"]+/g, '').trim()
    const map = String(doel || '').replace(/[\r\n"]+/g, '').trim()
    if (!adres || !map) return null
    return `git clone -- "${adres}" "${map}"`
  }

  return {
    GIT_CMD_DEFS, GIT_CMD_MAP, GIT_IDS, isGitId, isSchrijfKnop, STANDAARD_UIT_IDS,
    parseRemotes, parseBranch, parseStatusV2, maakStaat, zichtbareGitIds,
    zelfdeGitWeergave,
    koppelStap, koppelCommando, veiligeRepoNaam, normaliseerRepoUrl,
    bareInitCommando, bareCloneCommando, joinPad, cmdPad,
    repoNaamUitUrl, cloneDoelPad, cloneOuderPad, cloneCommando,
    parseGhRepos, filterRepos, repoSleutel, zonderGekoppelde, gitSlotFout,
    KOPPELING_GEEN, KOPPELING_ONBEKEND, KOPPELING_OK, KOPPELING_STUK,
    remoteFoutReden, remoteUitslag, lsRemoteArgs, koppelingProbleem,
    parseDeniedGebruiker, githubEigenaarUitUrl, zelfdeGhNaam, pushInlogProbleem,
    herstelCommando, ontkoppelCommando, KOPPEL_HERSTEL,
    parseRemoteRegels, remoteWegCommando, remoteUrlCommando,
    projectSoorten, gitignoreVoor, bouwrommel, NEGEER_BLOKKEN, langePadenCommando,
    gitProblemen, ergsteErnst,
    veiligCommitBericht, automatischCommitBericht, commitCommando, pushCommando, stashCommando, blokkade,
    parseStashAantal, parseStashLijst, parseStashOnderwerp, stashRefGeldig,
    stashPopCommando, stashDropCommando, botsendeBestanden,
    parseIdentiteit, geldigEmail, maakProfiel, profielGeldig, profielLabel,
    zoekProfiel, profielVoorProject, zelfdeIdentiteit, identiteitStatus,
    identiteitBlokkeert, veiligConfigWaarde, geldigeGhGebruiker,
    identiteitCommando, profielCommando, ghSwitchCommando, vraagtOmInloggen,
    INLOG_ONTHOUDEN, INLOG_VRAGEN, INLOG_KEUZES,
    indicator, onveiligeRedenen, magFetchen, achterstandMelding, FETCH_INTERVAL_MS,
    achterstandKeuzes, pullCommando,
    globaalIdentiteitCommando, globaalGhGebruikerCommando, accountActiveerStappen,
    ghLoginCommando, ghInstallCommando, parseGhAccounts, parseGhLoginCode, parseGhLoginUrl, nieuwGhAccount,
    parseGhUser, parseGhEmails, noreplyEmail, ghIdentiteit,
    diffCommando, isHoofdtak, parseTrack, branchOmschrijving, branchHeeftEigenWerk,
    resetZachtCommando, amendCommando, weggooiBestandCommando, alGepusht, terugdraaiBlokkade,
    parseBranches, lokaleBranches, huidigeBranch, nieuweRemoteBranches,
    geldigeBranchNaam, veiligeBranchNaam, checkoutCommando, nieuweBranchCommando,
    verwijderBranchCommando, verwijderRemoteBranchCommando, mergeCommando, wisselBlokkade,
    projectLocaties, locatieNaam,
    isUncPad, uncWaarschuwing, cmdInMap, vensterInMap, uncWortel, isUncWortel, uncNaam,
    schijfLetterVan, isNetwerkPad,
    teVragenProjecten, teStashenProjecten, afsluitSamenvatting, afsluitInstelling,
    AFSLUIT_UIT, AFSLUIT_WAARSCHUWEN, AFSLUIT_STASHEN, AFSLUIT_KEUZES,
    KOPPEL_INIT, KOPPEL_COMMIT, KOPPEL_GH, KOPPEL_URL, KOPPEL_AL_GEDAAN,
  }
})
