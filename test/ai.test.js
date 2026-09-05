// Tests voor de AI-kant: het providerregister (ai-providers.js) en de
// stroom-/foutafhandeling (ai-runtime.js). Geen netwerk en geen Electron:
// fetch en safeStorage worden nagebootst, zodat dit overal draait.

const os = require('os')
const fs = require('fs')
const path = require('path')

const REAL = path.join(__dirname, '..')
const { AI_PROVIDERS, vindProvider, vindModel } = require('../ai-providers')
const { maakAi, sseBlokken, sseData } = require('../ai-runtime')

let ok = true
const check = (l, c) => { console.log((c ? 'PASS  ' : 'FAIL  ') + l); if (!c) ok = false }

// Haalt de regelset op die met précies deze selector begint. Zoeken op
// `sel + ' {'` is niet genoeg: `.instel-uitleg {` zit óók in
// `.account-acties .instel-uitleg {`, en dan lees je de override in plaats van
// de basisregel. Een selector begint hier altijd aan het begin van een regel,
// dus daarop ankeren we.
const regelUitCss = (css, sel) => {
  const veilig = sel.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const m = new RegExp('(?:^|\\n)\\s*' + veilig + '\\s*\\{').exec(css)
  if (!m) return ''
  const i = m.index + m[0].length - 1
  return css.slice(i, css.indexOf('}', i) + 1)
}

// ── Register ──────────────────────────────────────────────────────────────────
check('er staat minstens één dienst in', AI_PROVIDERS.length >= 1)
check('elke dienst heeft id, label en url',
  AI_PROVIDERS.every(p => p.id && p.label && p.url))
check('geen dubbele ids',
  new Set(AI_PROVIDERS.map(p => p.id)).size === AI_PROVIDERS.length)
check('elke dienst kan een verzoek opbouwen en tekst uitpakken',
  AI_PROVIDERS.every(p => typeof p.headers === 'function' && typeof p.body === 'function'
    && typeof p.stuk === 'function' && typeof p.fout === 'function'))
// Een lokale server heeft geen vaste modellenlijst: wat er is hangt af van wat
// jij hebt gedownload. Die moet hem dus wel kunnen ophalen.
check('elke dienst heeft modellen met een standaard, of kan ze ophalen',
  AI_PROVIDERS.every(p => ((p.modellen || []).length && p.standaardModel)
    || (p.modellenUrl && p.modellenUit)))
check('elke dienst kan zijn modellenlijst ophalen',
  AI_PROVIDERS.every(p => p.modellenUrl && typeof p.modellenUit === 'function'))
check('elke dienst zegt of er een sleutel bij hoort',
  AI_PROVIDERS.every(p => p.sleutel && typeof p.sleutel.nodig === 'boolean'))
check('lokale diensten wijzen naar deze machine',
  AI_PROVIDERS.filter(p => p.lokaal).every(p => /localhost|127\.0\.0\.1/.test(p.url)))
check('en vragen geen sleutel',
  AI_PROVIDERS.filter(p => p.lokaal).every(p => p.sleutel.nodig === false))
check('er zitten diensten van meerdere makers in',
  new Set(AI_PROVIDERS.map(p => p.merk)).size >= 5)

const claude = vindProvider('claude')
check('claude is te vinden', !!claude)
check('en ook hoofdletterongevoelig', vindProvider('CLAUDE') === claude)
check('onbekende dienst geeft niets', vindProvider('nietbestaand') === null)

check('model op gedeeltelijke naam', vindModel(claude, 'opus') === 'claude-opus-5')
check('model exact blijft staan', vindModel(claude, 'claude-haiku-4-5') === 'claude-haiku-4-5')
check('zonder naam het standaardmodel', vindModel(claude, '') === claude.standaardModel)
check('onbekend model gaat toch mee', vindModel(claude, 'claude-toekomst-9') === 'claude-toekomst-9')

// Het verzoek zoals het echt de deur uitgaat
const kop = claude.headers({ sleutel: 'sk-test' })
check('de sleutel gaat mee als x-api-key', kop['x-api-key'] === 'sk-test')
check('en met een api-versie', !!kop['anthropic-version'])

const body = claude.body({
  model: 'claude-sonnet-5', maxTokens: 1024, systeem: 'wees kort',
  berichten: [{ rol: 'gebruiker', tekst: 'hoi' }, { rol: 'ai', tekst: 'hallo' }],
})
check('rollen worden vertaald naar de dienst',
  body.messages[0].role === 'user' && body.messages[1].role === 'assistant')
check('de systeemprompt zit erin', body.system === 'wees kort')
check('en er wordt gestreamd', body.stream === true)
check('zonder systeemprompt blijft het veld weg',
  claude.body({ model: 'm', maxTokens: 1, systeem: '', berichten: [] }).system === undefined)

// ── Uitleg per dienst ─────────────────────────────────────────────────────────
// Een foutmelding zonder volgende stap is geen hulp. Elke dienst hoort te
// kunnen vertellen wat de gebruiker moet doen.
{
  const regelsOk = (r) => Array.isArray(r) && r.length
    && r.every(x => typeof x === 'string' && x.trim().length > 5)

  check('elke dienst heeft uitleg', AI_PROVIDERS.every(p => p.hulp))
  check('een dienst met een sleutel legt uit hoe je die krijgt',
    AI_PROVIDERS.filter(p => p.sleutel.nodig).every(p => regelsOk(p.hulp.sleutel)))
  check('en noemt daarbij het commando om hem te zetten',
    AI_PROVIDERS.filter(p => p.sleutel.nodig)
      .every(p => p.hulp.sleutel.some(r => r.includes('/sleutel'))))
  check('en waar je hem haalt',
    AI_PROVIDERS.filter(p => p.sleutel.nodig)
      .every(p => p.hulp.sleutel.some(r => r.includes(p.sleutel.waar.split('/')[0]))))
  // Een 429 kan "te snel" betekenen of "saldo op". Bij een betaalde dienst hoort
  // dat tweede uitgelegd te worden, inclusief dat een abonnement niet meetelt.
  check('een betaalde dienst legt uit wat te doen als het tegoed op is',
    AI_PROVIDERS.filter(p => p.sleutel.nodig && !p.gratis)
      .every(p => regelsOk(p.hulp.tegoed)))
  check('en noemt daarbij dat een abonnement geen API-tegoed geeft',
    AI_PROVIDERS.filter(p => p.hulp && p.hulp.tegoed)
      .some(p => p.hulp.tegoed.some(r => /abonnement/i.test(r))))

  check('een lokale server legt uit wat te doen als hij niet draait',
    AI_PROVIDERS.filter(p => p.lokaal).every(p => regelsOk(p.hulp.onbereikbaar)))
  // Draaien maar leeg is iets anders dan niet draaien, en er valt iets aan te doen.
  check('en wat te doen als hij draait maar leeg is',
    AI_PROVIDERS.filter(p => p.lokaal).every(p => regelsOk(p.hulp.geenmodellen)))
  check('bij Ollama staat erbij hoe je een model binnenhaalt',
    AI_PROVIDERS.find(p => p.id === 'ollama').hulp.geenmodellen
      .some(r => /ollama pull \S+/.test(r)))

  // Een server op je eigen pc kan alleen melden wat je al hebt. Dan hoort er
  // iets te kiezen te zijn in plaats van een naam die je zelf moet opzoeken.
  const ollama = AI_PROVIDERS.find(p => p.id === 'ollama')
  check('er staan modellen klaar om te kiezen', (ollama.voorstellen || []).length >= 3)
  check('elk voorstel heeft een naam en een omschrijving',
    ollama.voorstellen.every(v => v.id && v.wat && v.grootte))
  check('en er is een patroon om ze op te halen',
    /\{model\}/.test(ollama.haalPatroon || ''))
  check('voorstellen zijn platte gegevens, want ze gaan naar het venster',
    JSON.parse(JSON.stringify(ollama.voorstellen)).length === ollama.voorstellen.length)
  check('er zit een kleine bij voor een lichtere pc',
    ollama.voorstellen.some(v => /:3b$/.test(v.id)))

  // Ollama zet ook modellen in de lijst die in de cloud draaien. Automatisch
  // daarvoor kiezen negeert precies het model dat je net hebt gedownload.
  const uit = ollama.modellenUit({ data: [
    { id: 'minimax-m3:cloud', created: 100 },
    { id: 'qwen2.5-coder:7b', created: 200 },
    { id: 'llama3.2:3b',      created: 300 },
  ] })
  check('de modellenlijst bewaart wanneer een model erbij kwam',
    uit.every(m => typeof m.tijd === 'number') && uit[1].tijd === 200)
  // Dezelfde keuze als aiBesteModel in renderer.js maakt.
  const beste = (lijst) => {
    const lokaal = lijst.filter(m => !/[:\-]cloud$/i.test(m.id))
    const keuze = lokaal.length ? lokaal : lijst
    return [...keuze].sort((a, b) => (b.tijd || 0) - (a.tijd || 0))[0].id
  }
  check('een cloudmodel wordt niet vanzelf gekozen', beste(uit) !== 'minimax-m3:cloud')
  check('en van wat lokaal staat het nieuwste', beste(uit) === 'llama3.2:3b')
  check('staat er alleen cloud, dan mag dat wel',
    beste(ollama.modellenUit({ data: [{ id: 'iets:cloud', created: 1 }] })) === 'iets:cloud')

  // De uitleg wordt in beeld opgeknipt: een adres krijgt een eigen regel in
  // kleur en is aan te klikken, een commando achter een dubbele punt zet
  // zichzelf in de commandobalk. Dat werkt alleen als de teksten die vorm
  // aanhouden. Deze twee patronen staan gelijk aan die in renderer.js.
  const ADRES = /(?:https?:\/\/)?(?:[a-z0-9-]+\.)+(?:com|ai|net|org|io|dev|app|co|nl|be|de|eu|me|sh|cloud)(?:\/[^\s,)]*)?/i
  const COMMANDO = /^(.*?:)\s{2,}([!/].+?)\s*$/
  const alleRegels = (p) => Object.values(p.hulp || {}).flat()

  check('waar je een sleutel haalt staat als aanklikbaar adres in de uitleg',
    AI_PROVIDERS.filter(p => p.sleutel.nodig)
      .every(p => (p.hulp.sleutel || []).some(r => ADRES.test(r))))
  check('een lokale server wijst naar waar je hem haalt',
    AI_PROVIDERS.filter(p => p.lokaal && p.sleutel.waar)
      .every(p => (p.hulp.onbereikbaar || []).some(r => ADRES.test(r))))
  check('het adres staat achteraan in de zin, zodat de regel eronder klopt',
    AI_PROVIDERS.every(p => alleRegels(p)
      .filter(r => ADRES.test(r) && !COMMANDO.test(r))
      .every(r => {
        const m = r.match(ADRES)
        return r.slice(m.index + m[0].length).replace(/^[\s,]+/, '').length < 60
      })))
  check('een commando staat achter een dubbele punt met twee spaties',
    AI_PROVIDERS.every(p => alleRegels(p)
      .filter(r => /(^|\s)(![a-z]|\/(sleutel|modellen?|use|nieuw|stop|shell|hulp|knoppen|thema|ai)\b)/.test(r))
      .every(r => COMMANDO.test(r))))
  check('geen enkele uitlegregel bevat een bestandsnaam die als adres zou tellen',
    AI_PROVIDERS.every(p => alleRegels(p).every(r => !/\.(js|json|exe|bat|cmd|txt|md)\b/i.test(r))))

  // Het opruimen van een verkeerd opgeslagen model werkt alleen als een
  // modelnaam bij precies één dienst hoort.
  const vanWie = new Map()
  let gedeeld = []
  for (const p of AI_PROVIDERS) {
    for (const m of (p.modellen || [])) {
      if (vanWie.has(m.id) && vanWie.get(m.id) !== p.id) gedeeld.push(m.id)
      vanWie.set(m.id, p.id)
    }
  }
  check('een modelnaam hoort bij precies één dienst', gedeeld.length === 0)
}

// ── Twee routes naar dezelfde dienst ──────────────────────────────────────────
// ChatGPT en Claude hebben allebei een betaalde API én een programma dat op je
// abonnement draait. Een knop die alleen de betaalde weg kent doet het voor de
// meeste mensen nooit, dus de dienst moet weten dat die tweede weg bestaat.
{
  const metProgramma = AI_PROVIDERS.filter(p => p.programma)
  check('er zijn diensten met een eigen opdrachtregelprogramma', metProgramma.length >= 2)
  check('elk daarvan noemt het commando en het catalogus-id',
    metProgramma.every(p => p.programma.cmd && p.programma.catalogId))
  // Hoe je uit zo'n programma komt verschilt per tool. Het staat erbij omdat
  // raden fout gaat: Codex kent geen kaal `exit`, Claude Code wel.
  check('en hoe je er weer uit komt',
    metProgramma.every(p => (p.programma.sluiten || '').length > 3))
  check('bij Codex staat er niet dat een kaal exit werkt', (() => {
    const codex = AI_PROVIDERS.find(p => p.id === 'openai').programma.sluiten
    return /\/exit|\/quit|Ctrl\+C/.test(codex) && !/(^|[^/])\bexit\b/.test(codex)
  })())
  check('en de tekst wijst ook naar de knop van de app zelf', (() => {
    const nl = JSON.parse(fs.readFileSync(path.join(REAL, 'locales', 'nl.json'), 'utf8'))
    return /sessie sluiten/.test(nl['ai.viaProgramHint'] || '')
  })())
  check('dat catalogus-id bestaat ook echt in de programmacatalogus', (() => {
    const { EDITORS } = require('../editor-catalog')
    return metProgramma.every(p => EDITORS.some(e => e.id === p.programma.catalogId))
  })())
  check('en dat commando krijgt een echte terminal', (() => {
    const bron = fs.readFileSync(path.join(REAL, 'renderer.js'), 'utf8')
    const blok = bron.slice(bron.indexOf('const VRAAGT_OM_VENSTER'), bron.indexOf('function vraagtOmEenVenster'))
    const patronen = eval(blok.replace('const VRAAGT_OM_VENSTER =', ''))
    return metProgramma.every(p => patronen.some(re => re.test(p.programma.cmd)))
  })())
  check('ChatGPT wijst naar codex',
    AI_PROVIDERS.find(p => p.id === 'openai').programma.cmd === 'codex')
  check('en heet niet zomaar "ChatGPT", want dit is de betaalde API',
    /API/i.test(AI_PROVIDERS.find(p => p.id === 'openai').label))

  const bron = fs.readFileSync(path.join(REAL, 'renderer.js'), 'utf8')
  const klaar = bron.slice(bron.indexOf('function aiProgrammaKnoppen'), bron.indexOf('let aiKnopStempel'))
  check('een geinstalleerd programma komt in de knoppenrij',
    /aiProgrammaKnoppen\(\)/.test(klaar))
  // Tot aan de volgende functie: aiStartProgramma staat er vlak achter, en die
  // definitie zou anders meetellen als "de knop leidt om".
  const kies = bron.slice(bron.indexOf('async function aiKiesDienst'),
                          bron.indexOf('async function aiStartProgramma'))
  // Eén knop, één ding. Een knop die "ChatGPT (API)" heet en stiekem Codex
  // start liegt over wat hij doet, ook als dat behulpzaam bedoeld is. Het
  // programma heeft zijn eigen knop; die van de API blijft de API.
  check('de API-knop leidt niet om naar een programma',
    !/aiStartProgramma/.test(kies))
  check('en er wordt niets onthouden over kapotte API-sleutels',
    !/apiOnbruikbaar/.test(bron))
  const vraag = bron.slice(bron.indexOf('async function aiVraag'), bron.indexOf('function aiKansloos'))
  check('bij een mislukking wordt wel naar die andere knop gewezen',
    /useProgramButtonLine/.test(vraag))
}

// ── Een geinstalleerd programma is een eigen knop ─────────────────────────────
// Programmaknoppen bestonden alleen in de projectweergave; in de cmd-sectie was
// er dus geen enkele manier om Codex of Claude Code met een klik te starten.
{
  const bron = fs.readFileSync(path.join(REAL, 'renderer.js'), 'utf8')
  const pak = (naam) => {
    const i = bron.indexOf('function ' + naam + '(')
    return bron.slice(i, bron.indexOf('\n}', i) + 2)
  }
  const code = ['aiProgrammaVoor', 'aiProgrammaKnoppen', 'aiKlaarDiensten'].map(pak).join('\n')
  const bouw = new Function('settings', 'aiProviders', 'I18N', 'aiInfo',
    code + '; return { aiProgrammaKnoppen, aiKlaarDiensten }')

  const providers = AI_PROVIDERS.map(p => ({
    id: p.id, label: p.label, sleutelNodig: !!(p.sleutel && p.sleutel.nodig),
    sleutelBron: '', lokaal: !!p.lokaal, programma: p.programma || null,
  }))
  const info = (id) => providers.find(p => p.id === id) || null
  const draai = (customEditors) => bouw(
    { customEditors, ai: { modellen: {} } }, providers, { t: (k) => k }, info)

  const geen = draai([])
  check('zonder programma en zonder sleutel geen enkele knop',
    geen.aiKlaarDiensten().length === 0)

  const metCodex = draai([{ catalogId: 'codex', label: 'Codex CLI', path: 'C:\\codex.cmd', enabled: true }])
  const knoppen = metCodex.aiKlaarDiensten()
  check('Codex geinstalleerd geeft een eigen knop', knoppen.length === 1)
  check('met de naam uit de programmacatalogus', knoppen[0].label === 'Codex CLI')
  check('en een eigen id, los van de dienst', knoppen[0].id === 'prog:openai')
  check('die knop start een programma en geen API-gesprek',
    !!knoppen[0].programma && knoppen[0].programma.cmd === 'codex')

  providers.find(p => p.id === 'openai').sleutelBron = 'opgeslagen'
  const beide = draai([{ catalogId: 'codex', label: 'Codex CLI', path: 'C:\\codex.cmd', enabled: true }])
    .aiKlaarDiensten()
  check('met sleutel én programma staan ze allebei in de rij', beide.length === 2)
  check('het programma vooraan, want dat werkt zonder tegoed',
    beide[0].id === 'prog:openai' && beide[1].id === 'openai')

  const klik = bron.slice(bron.indexOf('function bedraadAiKnoppen'), bron.indexOf('function aiZetShell'))
  check('klikken op een programmaknop start dat programma',
    /keuze\.startsWith\('prog:'\)/.test(klik) && /aiStartProgramma/.test(klik))
  check('klikken is uit tijdens powershell-herschikken',
    /psSnelSorteerModus/.test(klik))
}

{
  const bron = fs.readFileSync(path.join(REAL, 'renderer.js'), 'utf8')
  const ps = bron.slice(bron.indexOf('function renderPsPanel'), bron.indexOf('function dictVisibleEntries') > 0
    ? bron.indexOf('function dictVisibleEntries')
    : bron.indexOf('// ── Woordenboek'))
  check('powershell-paneel tekent de AI-knoppen',
    /aiShellKnop\(PS_CTX_ID\)/.test(ps) && /aiKnopHtml/.test(bron.slice(bron.indexOf('function psSnelKnopMap'), bron.indexOf('function psSnelGridHtml'))))
  check('en hangt ze aan de powershell-sessie',
    /bedraadAiKnoppen\(psContext\(\)\)/.test(ps))
  check('de shell-knop verdwijnt tijdens herschikken',
    /psSnelSorteerModus \? '' : aiShellKnop\(PS_CTX_ID\)/.test(ps))
  check('project, cmd en powershell bedraden de AI-knoppen',
    (bron.match(/bedraadAiKnoppen\(/g) || []).length >= 4)
}

// Flutter-run hoort bij tools. Dubbele editors en dubbele AI-programmaknoppen
// horen niet in dezelfde rij. Elke knop krijgt een eigen kleur.
{
  const bron = fs.readFileSync(path.join(REAL, 'renderer.js'), 'utf8')
  const css = fs.readFileSync(path.join(REAL, 'style.css'), 'utf8')
  const runBlok = bron.slice(bron.indexOf('const RUN_CMD_DEFS'), bron.indexOf('const TOOLS_CMD_DEFS'))
  const toolsBlok = bron.slice(bron.indexOf('const TOOLS_CMD_DEFS'), bron.indexOf('const PROG_KLEUR_AANTAL'))
  check('uitvoeren heeft geen flutter-run meer', !/run-android/.test(runBlok))
  check('tools heeft run android, windows en web',
    /run-android/.test(toolsBlok) && /run-windows/.test(toolsBlok) && /run-chrome/.test(toolsBlok))
  check('dubbele editors worden samengevoegd', /function ontdubbelCustomEditors\(/.test(bron))
  check('scan slaat een catalogus over die er al is', /bestaand\.cats\.has\(g\.id\)/.test(bron))
  check('AI-programmaknoppen verdwijnen als de editor er al staat',
    /function aiDienstenOpProject\(/.test(bron) && /aiDienstenOpProject\(\)/.test(bron))
  check('bekende programma\'s hebben een merkkleur',
    /MERK_KLEUR/.test(bron) && /editor-vscode/.test(bron) && /editor-claude/.test(bron))
  check('en die merkkleur staat in de css',
    /merk-codex/.test(css) && /merk-gemini/.test(css) && /merk-ollama/.test(css))
  check('--release hangt aan de flutter-map en niet aan een sectie',
    /function mapExtraHtml\(/.test(bron) && /f\.auto !== FLUTTER_MAP/.test(bron)
    && !/data-sectieblok="tools"/.test(bron))
}

// ── Knoppen weghalen ──────────────────────────────────────────────────────────
// "Weghalen" betekent twee dingen: hier verbergen, of overal weg. Alleen bij
// een knop die nergens anders bestaat is het onomkeerbaar — en juist dáár moet
// om bevestiging gevraagd worden.
{
  const bron = fs.readFileSync(path.join(REAL, 'renderer.js'), 'utf8')
  const pak = (n) => {
    const i = bron.indexOf('function ' + n + '(')
    return bron.slice(i, bron.indexOf('\n}', i) + 2)
  }
  const f = new Function('settings',
    [pak('wisWijze'), pak('knopIsUniek')].join('\n') + '; return { wisWijze, knopIsUniek }')

  const g = f({})
  check('een eigen commando bestaat maar op één plek', g.knopIsUniek('custom:abc'))
  check('een gevonden programma ook', g.knopIsUniek('editor:custom:ce1'))
  check('een vaste knop niet, die staat in elk project', !g.knopIsUniek('run-android'))
  check('een AI-knop ook niet', !g.knopIsUniek('ai:openai') && !g.knopIsUniek('ai:prog:openai'))

  check('zonder keuze wordt er niets aangenomen', f({}).wisWijze() === '')
  check('een gemaakte keuze blijft staan',
    f({ knopVerwijderen: 'globaal' }).wisWijze() === 'globaal')
  check('en onzin in het instellingenbestand telt niet als keuze',
    f({ knopVerwijderen: 'onzin' }).wisWijze() === '')

  const verw = bron.slice(bron.indexOf('async function verwijderKnop'), bron.indexOf('function bedraadKnopWissen'))
  check('zonder keuze gebeurt er niets', /if \(!wijze\) return/.test(verw))
  // Eén misklik in een rij knoppen is zo gebeurd, dus altijd eerst vragen —
  // ook bij "alleen hier".
  check('elke manier van weghalen vraagt eerst om bevestiging',
    /vraagJaNee/.test(verw) && /if \(!ja\) return/.test(verw))
  check('de vraag zegt erbij waar de knop uit verdwijnt',
    /wisPlaatsNaam\(ctx\)/.test(bron) && /place: plaats/.test(verw))
  check('en de tekst verschilt per geval', /echtWeg \?/.test(verw) && /confirmHereTitle/.test(verw))

  // Terugzetten kan alleen wat "alleen hier" is weggehaald; bij "overal" is er
  // niets bewaard om uit te herstellen.
  const herstel = bron.slice(bron.indexOf('async function herstelVerborgenKnoppen'), bron.indexOf('function wisKnopHtml'))
  check('er is een knop om weggehaalde knoppen terug te zetten',
    /p\.cmdVisibility = Object\.fromEntries/.test(herstel)
    && /for \(const soort of \['cmd', 'ps'\]\)/.test(herstel))
  // Sinds knoppen standaard uit kunnen staan is "alles wissen" niet meer goed
  // genoeg: een knop die je juist expliciet hebt aangezet is geen verborgen
  // knop, en zou anders verdwijnen bij een handeling die knoppen terugbrengt.
  check('maar wat je expliciet hebt aangezet blijft staan', /v === true/.test(herstel))
  check('die vraagt eerst en zegt hoeveel er terugkomen',
    /vraagJaNee/.test(herstel) && /count: n/.test(herstel))
  check('en staat alleen bij "alleen hier"',
    /wisWijze\(\) === 'individueel' \? `/.test(bron))

  // Dit ging mis: de knop leende de klasse van het sorteericoon, en die staat
  // op opacity 0 tot je over een zijbalkkop gaat. In een sectiekop gebeurt dat
  // nooit, dus de knop was er wel maar zag niemand hem.
  const html = pak('wisKnopHtml')
  check('de wisknop gebruikt niet de klasse van het sorteericoon',
    !/sec-sort/.test(html) && /knop-wis/.test(html))
  const css = fs.readFileSync(path.join(REAL, 'style.css'), 'utf8')
  const regel = css.slice(css.indexOf('.knop-wis {'), css.indexOf('}', css.indexOf('.knop-wis {')))
  check('en is niet doorzichtig gemaakt', !/opacity:\s*0/.test(regel))
  // Elke rij heeft zijn eigen kop met dezelfde knoppen erin: het project, cmd
  // en powershell.
  check('de wisknop staat in elke sectiekop',
    (bron.match(/kopActiesHtml\((?:'run'|SNEL_SECTIE\.(?:cmd|ps))\)/g) || []).length === 3)

  // Weghalen hoort bij het herschikken, niet bij dagelijks gebruik: anders
  // staat er permanent een knop waarmee je per ongeluk iets weggooit.
  {
    const pk = (n) => {
      const i = bron.indexOf('function ' + n + '(')
      return bron.slice(i, bron.indexOf('\n}', i) + 2)
    }
    const bouw = (sorteer, snel, psSnel = false) => new Function(
      'cmdSorteerModus', 'cmdSnelSorteerModus', 'psSnelSorteerModus', 'SNEL_SECTIE',
      'knopWisModus', 'I18N', 'esc',
      [pk('sorteertSectie'), pk('wisKnopHtml')].join('\n') + '; return wisKnopHtml'
    )(sorteer, snel, psSnel, { cmd: 'snel', ps: 'ps-snel' }, '', { t: () => 'x' }, (x) => x)

    const rust = bouw('', false)
    check('buiten de verplaatsmodus is de wisknop er niet',
      !rust('run') && !rust('tools') && !rust('snel'))
    const inRun = bouw('run', false)
    check('in de verplaatsmodus alleen bij die ene sectie',
      !!inRun('run') && !inRun('tools') && !inRun('snel'))
    const inSnel = bouw('', true)
    check('en bij de snelkoppelingen op hun eigen modus',
      !!inSnel('snel') && !inSnel('run'))
  }
  check('de wismodus stopt zodra het verplaatsen stopt',
    (bron.match(/knopWisModus = ''/g) || []).length >= 4)
  // Rechts in de kop, en de klaar-knop erachter. Zonder eigen hoekje bepaalt
  // de rest van die kop (het schuifje, --release) waar ze belanden.
  check('ze zitten in een eigen hoekje rechts', /class="kop-acties"/.test(bron))
  check('dat hoekje wordt naar rechts geduwd', (() => {
    const css = fs.readFileSync(path.join(REAL, 'style.css'), 'utf8')
    const r = css.slice(css.indexOf('.kop-acties {'), css.indexOf('}', css.indexOf('.kop-acties {')))
    return /margin-left:\s*auto/.test(r)
  })())
  check('en de klaar-knop komt daar achter de prullenbak in',
    /querySelector\('\.kop-acties'\)/.test(bron))
  check('en wordt in beide weergaves bedraad',
    (bron.match(/bedraadWisKnoppen\(\)/g) || []).length >= 2)
}

// ── Een uitweg die niet van het programma afhangt ─────────────────────────────
// Draait er een programma, dan heeft dát het toetsenbord. Woorden onderscheppen
// kan niet: `exit` kan net zo goed een stuk van je vraag zijn. Eén
// toetscombinatie vangt de app wel af, zodat je er altijd uit komt.
{
  const bron = fs.readFileSync(path.join(REAL, 'renderer.js'), 'utf8')
  const pty = bron.slice(bron.indexOf('async function startPtySessie'),
                         bron.indexOf('function stopPtySessie'))
  check('er is een toetscombinatie die de sessie sluit',
    /attachCustomKeyEventHandler/.test(pty))
  check('die combinatie stopt de sessie en gaat niet door naar het programma',
    /stopPtySessie\(termId\)/.test(pty) && /return false/.test(pty))
  check('alleen bij die ene combinatie, de rest gaat gewoon door',
    /ctrlKey/.test(pty) && /shiftKey/.test(pty) && /return true/.test(pty))
  check('en alleen op keydown, niet ook op keyup', /keydown/.test(pty))
  check('de melding bij het starten noemt die uitweg', (() => {
    const nl = JSON.parse(fs.readFileSync(path.join(REAL, 'locales', 'nl.json'), 'utf8'))
    return /Ctrl\+Shift\+Q/.test(nl['ai.viaProgramEscape'] || '')
  })())
}

// ── De statusmelding ──────────────────────────────────────────────────────────
// Zo'n melding hoort bij het scherm waar hij ontstond. Bleef hij staan, dan las
// je bij een ander project nog "afgebroken (exit 1)" van iets heel anders.
{
  const bron = fs.readFileSync(path.join(REAL, 'renderer.js'), 'utf8')
  const css = fs.readFileSync(path.join(REAL, 'style.css'), 'utf8')
  const html = fs.readFileSync(path.join(REAL, 'index.html'), 'utf8')
  const regel = (sel) => regelUitCss(css, sel)

  check('de melding onthoudt bij welke weergave hij hoort',
    /statusMelding = \{ id: activeTermId/.test(bron))
  check('en verdwijnt op een ander scherm, ook als er nog iets draait',
    bron.includes('function statusPastBijScherm') && bron.includes('function keurStatusNa'))
  check('setView, renderMain, setTermTab en renderCmdPanel kijken de melding na',
    ['function setView', 'function renderMain', 'function setTermTab', 'function renderCmdPanel']
      .every(fn => {
        const i = bron.indexOf(fn)
        const j = bron.indexOf('keurStatusNa()', i)
        return i >= 0 && j > i && j - i < 16000
      }))
  check('een project kan output en verkenner tegelijk tonen',
    bron.includes('terminalMarkup({ splitbaar: true })') &&
    bron.includes('function zetTermSplit') &&
    bron.includes('function springNaarOutput') &&
    bron.includes('termSplitFirst') &&
    bron.includes('ti-minus'))
  check('het plusje wordt eerder zichtbaar zonder grotere klikcirkel',
    bron.includes("classList.toggle('zichtbaar'") &&
    /< 56/.test(bron) &&
    /0\.12/.test(bron) &&
    !/btn\.hidden = !alsMin/.test(bron))
  check('plus en min zijn meteen zichtbaar zonder de muis te bewegen',
    bron.includes('function verversSplitPlusZicht') &&
    bron.includes('function planSplitPlusVervers') &&
    bron.includes("addEventListener('pointermove'") &&
    bron.includes('planSplitPlusVervers()'))
  check('een min links of boven sluit dat vlak',
    bron.includes('function sluitSplitAanKant') &&
    bron.includes('function klikSplitPlus') &&
    bron.includes('data-split="left"') &&
    bron.includes('data-split="top"') &&
    bron.includes('term.splitCloseLeftTitle'))
  check('sluiten van een split onthoudt het vlak dat blijft, niet de selectie',
    /termTabs/.test(bron.slice(bron.indexOf('function sluitSplitAanKant'), bron.indexOf('function klikSplitPlus'))) &&
    /houdenVisueel/.test(bron.slice(bron.indexOf('function sluitSplitAanKant'), bron.indexOf('function klikSplitPlus'))) &&
    bron.slice(bron.indexOf('function sluitSplitAanKant'), bron.indexOf('function klikSplitPlus')).includes('bergVerkennerOp()') &&
    !/ptySessies\.has\(ctx\.id\)\) setTermTab\('output'\)/.test(
      bron.slice(bron.indexOf('async function wireBrowser'), bron.indexOf('async function bedraadVerkennerHost'))))
  check('min boven staat in het midden van de bovenrand',
    /left:\s*0/.test(regel('.term-split-plus[data-split="top"]')) &&
    /right:\s*0/.test(regel('.term-split-plus[data-split="top"]')) &&
    /margin-inline:\s*auto/.test(regel('.term-split-plus[data-split="top"]')) &&
    css.includes('.term-split-plus[hidden]'))
  check('een tweede project kan in het andere vlak',
    bron.includes('function splitTweeProjecten') &&
    bron.includes('function kiesProjectInSplit') &&
    bron.includes('terminal-andere') &&
    bron.includes('twee-projecten'))
  check('twee projecten kunnen elk hun eigen verkenner houden',
    bron.includes('browser-andere') &&
    bron.includes('function brEl') &&
    bron.includes('function vulIdleVerkenner') &&
    !/splitTweeProjecten\(\) && tab === 'browser'/.test(
      bron.slice(bron.indexOf('function setTermTab'), bron.indexOf('async function navigeerNaar'))))
  check('elk project onthoudt zijn verkenner-map alleen binnen het project',
    bron.includes('function bewaarVerkennerPad') &&
    bron.includes('function wisVerkennerBuitenBeeld') &&
    bron.includes('function schoonVerkennerPadenBijStart') &&
    bron.includes('verkennerPaden') &&
    bron.includes('bergVerkennerOp()') &&
    /view === 'cmd'/.test(bron.slice(bron.indexOf('function verkennerPid'), bron.indexOf('function verkennerStaat'))) &&
    bron.includes('lijst.scrollTop = stond'))
  check('in split kun je woordenboek naast een project zetten',
    bron.includes('function splitGemengd') &&
    bron.includes('function plaatsInSplit') &&
    bron.includes('werk-vlak') &&
    html.includes('id="werk"'))
  check('bestanden-editor mag in split naast verkenner of woordenboek',
    bron.includes('function normaliseerProjectTab') &&
    /tab === 'editor'/.test(bron.slice(bron.indexOf('function setTermTab'), bron.indexOf('async function navigeerNaar'))) &&
    !/zetTermSplit\(null\)/.test(bron.slice(bron.indexOf('function setTermTab'), bron.indexOf('async function navigeerNaar'))) &&
    /normaliseerProjectTab\(s\.tab\) === 'editor'/.test(bron))
  check('bestand in split houdt de preview, niet de verkenner',
    /normaliseerProjectTab\(s\.tab\) === 'output'/.test(
      bron.slice(bron.indexOf('function setTermTab'), bron.indexOf('async function navigeerNaar'))) &&
    /werkSlots\[1\]\.tab = 'output'/.test(
      bron.slice(bron.indexOf('function zetTermSplit'), bron.indexOf('function sluitSplitAanKant'))))
  check('woordenboek-split wordt niet per project onthouden',
    bron.includes('function isGemengdeSplit') &&
    bron.includes('function wisGemengdeProjectSplits') &&
    /splitGemengd\(\)/.test(bron.slice(bron.indexOf('function selectProject'), bron.indexOf('function toggleSettings'))))
  check('een derde project wringt niet in de split',
    /splitTweeProjecten\(\)/.test(bron.slice(bron.indexOf('function selectProject'), bron.indexOf('function toggleSettings'))) &&
    bron.includes('sluitSplitVoorView()'))
  check('een projectklik sluit een woordenboek-split',
    /v === 'project'/.test(bron.slice(bron.indexOf('function setView'), bron.indexOf('function rememberView'))) &&
    /splitGemengd\(\)/.test(bron.slice(bron.indexOf('function setView'), bron.indexOf('function rememberView'))))
  check('setView leegt het andere vlak niet als de split gemengd is',
    /splitAan\(\)/.test(bron.slice(bron.indexOf('function setView'), bron.indexOf('function rememberView'))) &&
    bron.includes('function plaatsInSplit'))
  check('een nieuwe split-keuze landt in het gerichte vlak, rechts of onder',
    bron.includes('function visueelSlotVoorTermPane') &&
    bron.includes('function zetSlotsOpSchermvolgorde') &&
    /werkSlotFocus = 1/.test(bron.slice(bron.indexOf('function zorgVoorSlots'), bron.indexOf('function paneelEl'))) &&
    bron.includes('const visueelDoel'))
  check('opdrachten kunnen naast een project in split',
    !/\(a\.view === 'project' && heeftEigenTerminal\(b\)\)/.test(bron) &&
    bron.includes('ctx?.id === CMD_CTX_ID') &&
    bron.includes('if (splitGemengd()) return') &&
    bron.includes('function richtTermOpSlot'))
  check('cmd en powershell splitsen dat werkvlak niet',
    (bron.match(/\$\{terminalMarkup\(\)\}/g) || []).length >= 2)
  check('de melding gaat boven de invoerbalk staan',
    bron.includes('function plaatsStatus') && /term-input-wrap:not\(\[hidden\]\)/.test(bron))

  check('er zit een kruisje op om hem weg te klikken',
    /id="cmd-status-sluit"/.test(html) && /cmd-status-sluit'\)/.test(bron))
  check('dat kruisje is alleen aanklikbaar als de melding er staat',
    /pointer-events:\s*auto/.test(regel('#cmd-status.show')))
  check('en de melding staat op één lijn met de terminalcursor',
    /#terminal \.t-cursor/.test(bron) && bron.includes('function plaatsStatus'))
}

// ── Instellingenrijen ─────────────────────────────────────────────────────────
// Deze rijen stonden op een vast raster van vier kolommen, maar ze hebben niet
// allemaal evenveel onderdelen: de ene is vinkje + naam + uitleg, de andere
// vinkje + kleur + naam + pad met drie knoppen. Dan valt de tekst over elkaar
// heen of loopt de rij van het scherm. Een flexrij past zich per rij aan.
{
  const css = fs.readFileSync(path.join(REAL, 'style.css'), 'utf8')
  const regel = (sel) => regelUitCss(css, sel)
  check('instellingenrijen liggen niet meer op een vast raster',
    !/grid-template-columns/.test(regel('.editor-row')))
  check('en breken af in plaats van door te lopen',
    /flex-wrap:\s*wrap/.test(regel('.editor-row')))
  check('velden mogen krimpen, anders duwen ze de rij van het scherm',
    /min-width:\s*0/.test(regel('.editor-path-wrap')))

  // Een inline stijl wint van css, dus die uitleg was niet bij te sturen.
  const bron = fs.readFileSync(path.join(REAL, 'renderer.js'), 'utf8')
  check('de uitleg naast een instelling zit in een klasse, niet in een stijl',
    !/style="font-size:11px;color:var\(--muted\);flex:1"/.test(bron))
  check('en springt naar een nieuwe regel voordat hij te smal wordt',
    /flex:\s*1 1 200px/.test(regel('.instel-uitleg')))
}

// ── Wisselen van AI ───────────────────────────────────────────────────────────
// Er kan er maar één tegelijk praten in een weergave. De regels daarvoor staan
// in renderer.js; hier leggen we vast dát ze er zijn, zodat ze niet stilletjes
// sneuvelen bij een volgende verbouwing.
{
  const bron = fs.readFileSync(path.join(REAL, 'renderer.js'), 'utf8')
  const kies = bron.slice(bron.indexOf('async function aiKiesDienst'),
                          bron.indexOf('function aiKiesModel'))

  check('van dienst wisselen breekt een lopend antwoord af',
    /aiStop\(\{ id \}\)/.test(kies))
  check('en sluit een AI-programma dat in het venster draait',
    /ptySessies\.has\(id\)/.test(kies) && /stopPtySessie\(id\)/.test(kies))
  check('en begint bij een andere dienst met een leeg gesprek',
    /andereDienst && s\.berichten\.length/.test(kies) && /s\.berichten = \[\]/.test(kies))
  check('bij dezelfde dienst blijft het gesprek staan',
    kies.indexOf('andereDienst &&') > 0)

  const pty = bron.slice(bron.indexOf('async function startPtySessie'),
                         bron.indexOf('function stopPtySessie'))
  check('een programma starten sluit een gesprek dat via de API loopt',
    /aiAan\(termId\)/.test(pty) && /gesprek\.aan = false/.test(pty))
  check('en meldt welk programma ervoor moest wijken',
    /closedProgramLine/.test(pty))
}

// ── Knoppen die je zelf kunt in- en uitschakelen ──────────────────────────────
// De id's van de AI-knoppen komen in projects.json en settings.json terecht
// (cmdVisibility, cmdVolgorde, cmd.quickUit). Veranderen ze van vorm, dan raakt
// iedereen zijn instellingen kwijt zonder dat er iets stukgaat — dus vastleggen.
{
  const ids = AI_PROVIDERS.map(p => 'ai:' + p.id)
  check('elke dienst heeft een knop-id met een eigen voorvoegsel',
    ids.every(id => /^ai:[a-z0-9-]+$/.test(id)))
  check('dat voorvoegsel botst niet met de andere soorten knoppen',
    ids.every(id => !/^(custom:|editor:|run-|build-|quick:)/.test(id)))
  check('en is uit de dienst af te leiden zonder tabel',
    ids.every((id, i) => id.slice(3) === AI_PROVIDERS[i].id))
}

// ── Wat er in het woordenboek terechtkomt ─────────────────────────────────────
{
  const { BUILTIN_COMMANDS } = require('../cmd-library')
  const metTag = (t) => BUILTIN_COMMANDS.filter(c => (c.tags || []).includes(t))
  const ai = metTag('ai')
  const wb = metTag('woordenboek')

  check('er is een thema ai in het woordenboek', ai.length >= 10)
  check('en een thema woordenboek', wb.length >= 3)
  // Twee soorten in dit thema: commando's van de app zelf (met een /), en
  // AI-programma's die je start. Meer dan dat hoort er niet in te staan.
  const appCmd = ai.filter(c => c.cmd.startsWith('/'))
  const programma = ai.filter(c => !c.cmd.startsWith('/'))
  check('er staan app-commando\'s in', appCmd.length >= 10)
  check('en programma\'s om te starten', programma.length >= 3)
  check('die programma\'s zijn kale commando\'s zonder shell-trucs',
    programma.every(c => !/[|&><;]/.test(c.cmd)))
  check('en leggen uit hoe je ze binnenhaalt of wat ze kosten',
    programma.filter(c => c.cmd !== 'claude').every(c => (c.note || '').length > 20))
  check('elke ai-regel heeft een label', ai.every(c => (c.label || '').trim()))
  check('er zit een regel bij om een dienst te kiezen',
    ai.some(c => /^\/use /.test(c.cmd)))

  // Een AI-programma dat geen echte terminal krijgt stopt met "stdin is not a
  // terminal". De lijst in renderer.js bepaalt wie er wel een krijgt; die moet
  // dus meegroeien met wat er in het woordenboek staat.
  {
    const bron = fs.readFileSync(path.join(REAL, 'renderer.js'), 'utf8')
    const blok = bron.slice(bron.indexOf('const VRAAGT_OM_VENSTER'), bron.indexOf('function vraagtOmEenVenster'))
    const patronen = eval(blok.replace('const VRAAGT_OM_VENSTER =', ''))
    const vraagtVenster = (c) => patronen.some(re => re.test(String(c).trim()))

    check('elk AI-programma uit het woordenboek krijgt een echte terminal',
      programma.every(c => vraagtVenster(c.cmd)))
    check('een stand die juist niets vraagt niet',
      !vraagtVenster('codex exec "fix"') && !vraagtVenster('claude -p "hoi"') && !vraagtVenster('gemini -p "hoi"'))
    check('en een gewoon commando ook niet',
      !vraagtVenster('git status') && !vraagtVenster('npm install') && !vraagtVenster('codexfoo'))

    // In een gesprek gaat alles naar de AI. Typ je daar de naam van een
    // programma, dan bedoel je dat bijna zeker als commando — anders verstook
    // je er een verzoek aan en kom je er niet uit. Zelfde regel als in
    // aiLijktProgramma in renderer.js.
    const lijktProgramma = (t) => {
      const kaal = String(t || '').trim()
      if (!kaal || kaal.includes('?')) return false
      const w = kaal.split(/\s+/)
      if (w.length > 3 || !vraagtVenster(w[0])) return false
      if (w.length === 1) return true
      return w.slice(1).every(x => /^(-{1,2}[\w-]+|[a-z][\w.:/-]{0,14})$/.test(x))
    }
    check('een programmanaam in een gesprek telt als commando',
      ['codex', 'codex login', 'claude', 'gemini'].every(lijktProgramma))
    check('maar een echte vraag niet',
      ['hey', 'wat doet codex?', 'claude is beter dan gpt', 'hoi codex'].every(t => !lijktProgramma(t)))
  }
  check('en een om de knoppenrij uit te zetten',
    ai.some(c => /^\/knoppen (uit|aan)/.test(c.cmd)))
  check('geen enkele ai-regel is als ingrijpend gemarkeerd',
    ai.every(c => !c.danger))
  check('een sleutel invullen is een sjabloon, geen knop',
    ai.filter(c => /^\/sleutel/.test(c.cmd)).every(c => c.template))
  check('/use en /shell zijn juist wel te draaien',
    ai.filter(c => /^\/(use|shell|nieuw|stop|diensten)\b/.test(c.cmd)).every(c => !c.template))

  // exit sluit tijdens een gesprek de AI, en daarbuiten de app. Dat verschil
  // hoort in het woordenboek te staan, anders sluit iemand per ongeluk alles af.
  check('bij /shell staat dat exit hetzelfde doet',
    ai.filter(c => c.cmd === '/shell').every(c => /\bexit\b/.test(c.note || '')))
  check('en dat exit buiten een gesprek de app sluit',
    ai.filter(c => c.cmd === '/shell').every(c => /CommandDeck/.test(c.note || '')))

  // clear maakt het scherm leeg, /nieuw wist wat de AI onthoudt. Twee heel
  // verschillende dingen, dus dat verschil hoort erbij te staan.
  check('bij /nieuw staat het verschil met clear uitgelegd',
    ai.filter(c => c.cmd === '/nieuw').every(c => /\bclear\b/.test(c.note || '')))

  check('het thema-commando staat erin', wb.some(c => c.cmd === 'theme'))
  check('met een voorbeeld om er iets in te zetten',
    wb.some(c => /^theme \w+ \S/.test(c.cmd)))
  check('en een om er een weg te halen', wb.some(c => /^theme wis /.test(c.cmd)))

  const alle = new Set()
  let dubbel = 0
  for (const c of BUILTIN_COMMANDS) {
    const k = String(c.cmd).trim()
    if (alle.has(k)) dubbel++
    alle.add(k)
  }
  check('geen dubbele commando\'s in de startvoorraad', dubbel === 0)
}

// ── De OpenAI-vorm, die de meeste diensten spreken ────────────────────────────
{
  const openai = vindProvider('openai')
  const b = openai.body({ model: 'gpt', maxTokens: 500, systeem: 'kort',
                          berichten: [{ rol: 'gebruiker', tekst: 'hoi' }, { rol: 'ai', tekst: 'hallo' }] })
  check('de systeemprompt wordt een eerste bericht', b.messages[0].role === 'system')
  check('en de rollen kloppen',
    b.messages[1].role === 'user' && b.messages[2].role === 'assistant')
  check('de sleutel gaat mee als bearer',
    openai.headers({ sleutel: 'sk-x' }).authorization === 'Bearer sk-x')
  check('tekst komt uit delta.content',
    openai.stuk({ choices: [{ delta: { content: 'ja' } }] }) === 'ja')
  check('een stuk zonder tekst levert niets',
    openai.stuk({ choices: [{ delta: {} }] }) === '')
  check('het einde wordt herkend',
    openai.klaar({ choices: [{ finish_reason: 'stop' }] }) === true)
  check('de modellenlijst wordt uitgepakt',
    openai.modellenUit({ data: [{ id: 'gpt-x' }] })[0].id === 'gpt-x')

  const lokaal = vindProvider('ollama')
  check('een lokale dienst stuurt geen sleutelkop mee',
    lokaal.headers({ sleutel: '' }).authorization === undefined)
  check('en vraagt niet om een verbruikstelling die hij niet kent',
    lokaal.body({ model: 'm', maxTokens: 1, berichten: [] }).stream_options === undefined)
}

// ── Gemini: eigen vorm, model in het adres ────────────────────────────────────
{
  const g = vindProvider('gemini')
  check('het model komt in het adres te staan',
    g.urlVoor({ basis: g.url, model: 'gemini-3.7-flash' })
      === 'https://generativelanguage.googleapis.com/v1beta/models/gemini-3.7-flash:streamGenerateContent?alt=sse')
  check('een eigen adres blijft behouden',
    g.urlVoor({ basis: 'http://proxy/v1beta/models/', model: 'm' })
      === 'http://proxy/v1beta/models/m:streamGenerateContent?alt=sse')
  check('de sleutel gaat mee als google-kop',
    g.headers({ sleutel: 'k' })['x-goog-api-key'] === 'k')
  const gb = g.body({ model: 'm', maxTokens: 42, systeem: 'kort',
                      berichten: [{ rol: 'gebruiker', tekst: 'hoi' }, { rol: 'ai', tekst: 'hallo' }] })
  check('rollen heten hier user en model',
    gb.contents[0].role === 'user' && gb.contents[1].role === 'model')
  check('de systeemprompt zit apart', gb.systemInstruction.parts[0].text === 'kort')
  check('en de tokengrens ook', gb.generationConfig.maxOutputTokens === 42)
  check('tekst komt uit de parts',
    g.stuk({ candidates: [{ content: { parts: [{ text: 'a' }, { text: 'b' }] } }] }) === 'ab')
  check('de modellenlijst laat models/ vallen',
    g.modellenUit({ models: [{ name: 'models/gemini-x', supportedGenerationMethods: ['generateContent'] }] })[0].id === 'gemini-x')
  check('en laat wat niet kan chatten weg',
    g.modellenUit({ models: [{ name: 'models/embed', supportedGenerationMethods: ['embedContent'] }] }).length === 0)
}

// ── SSE uit elkaar halen ──────────────────────────────────────────────────────
{
  const { blokken, rest } = sseBlokken('event: a\ndata: {"x":1}\n\nevent: b\ndata: {"x":2}\n\ndata: {"x"')
  check('afgeronde blokken komen eruit', blokken.length === 2)
  check('en het half binnengekomen stuk blijft staan', rest === 'data: {"x"')
  check('data wordt uitgepakt', sseData(blokken[0]).x === 1)
}
check('\\r\\n werkt net zo goed', sseBlokken('data: {"x":1}\r\n\r\n').blokken.length === 1)
check('[DONE] is geen bericht', sseData('data: [DONE]') === null)
check('kapotte json laat de rest met rust', sseData('data: {kapot') === null)
check('een blok zonder data levert niets', sseData('event: ping') === null)

// ── Runtime ───────────────────────────────────────────────────────────────────
function nepIpc() {
  const handlers = {}
  return { handlers, handle: (naam, fn) => { handlers[naam] = fn } }
}

// Een antwoordstroom nabootsen: de brokken komen binnen zoals bij een echte
// verbinding, dus ook midden in een bericht afgebroken.
function nepStroom(brokken) {
  const enc = new TextEncoder()
  let i = 0
  return { getReader: () => ({
    read: async () => i < brokken.length
      ? { done: false, value: enc.encode(brokken[i++]) }
      : { done: true, value: undefined },
  }) }
}

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'cd-ai-'))
const nepSafe = {
  isEncryptionAvailable: () => true,
  encryptString: (s) => Buffer.from('enc:' + s, 'utf8'),
  decryptString: (b) => Buffer.from(b).toString('utf8').replace(/^enc:/, ''),
}

function maak(fetchImpl) {
  return maakAi({
    ipcMain: nepIpc(), getWin: () => null, userDataDir: tmp,
    safeStorage: nepSafe, fetchImpl,
  })
}

;(async () => {
  // Sleutels
  {
    const ai = maak(async () => { throw new Error('niet gebruikt') })
    check('zonder sleutel is de dienst niet klaar',
      ai.providerOverzicht().find(p => p.id === 'claude').heeftSleutel === false)
    ai.zetSleutel('claude', 'sk-geheim')
    check('opgeslagen sleutel wordt teruggevonden',
      ai.sleutelVoor(vindProvider('claude')).sleutel === 'sk-geheim')
    const ruw = fs.readFileSync(path.join(tmp, 'ai-keys.json'), 'utf8')
    check('en staat niet leesbaar op schijf', !ruw.includes('sk-geheim'))
    check('de dienst is nu wel klaar',
      ai.providerOverzicht().find(p => p.id === 'claude').heeftSleutel === true)
    ai.zetSleutel('claude', '')
    check('wissen werkt', ai.sleutelVoor(vindProvider('claude')).sleutel === '')
  }

  // Sleutel uit de omgeving telt mee
  {
    process.env.ANTHROPIC_API_KEY = 'sk-uit-omgeving'
    const ai = maak(async () => { throw new Error('niet gebruikt') })
    const b = ai.sleutelVoor(vindProvider('claude'))
    check('een sleutel uit de omgeving wordt gebruikt', b.sleutel === 'sk-uit-omgeving')
    check('en de herkomst is te zien', b.bron === 'ANTHROPIC_API_KEY')
    delete process.env.ANTHROPIC_API_KEY
  }

  // Zonder sleutel wordt er niets verstuurd
  {
    let geroepen = false
    const ai = maak(async () => { geroepen = true })
    const r = await ai.stuur({ id: 'p1', providerId: 'claude', berichten: [{ rol: 'gebruiker', tekst: 'hoi' }] })
    check('zonder sleutel: duidelijke reden', r.ok === false && r.soort === 'sleutel')
    check('en er gaat niets de deur uit', geroepen === false)
    check('met de vindplaats erbij', !!r.waar && !!r.env)
  }

  process.env.ANTHROPIC_API_KEY = 'sk-test'

  // Een geslaagd antwoord
  {
    const stukken = []
    const ai = maak(async () => ({
      ok: true,
      body: nepStroom([
        'event: message_start\ndata: {"type":"message_start","message":{"usage":{"input_tokens":12}}}\n\n',
        'data: {"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":"Hal"}}\n\n',
        'data: {"type":"content_block_delta","index":0,"delta":{"type":"text_de',   // afgebroken
        'lta","text":"lo"}}\n\ndata: {"type":"message_delta","usage":{"output_tokens":5}}\n\n',
        'data: {"type":"message_stop"}\n\n',
      ]),
    }))
    const r = await ai.stuur({ id: 'p1', providerId: 'claude', berichten: [{ rol: 'gebruiker', tekst: 'hoi' }] })
    check('het antwoord komt compleet binnen', r.ok === true && r.tekst === 'Hallo')
    check('ook als een bericht in twee brokken aankomt', r.tekst === 'Hallo')
    check('het verbruik wordt opgeteld', r.verbruik.in === 12 && r.verbruik.uit === 5)
    check('het gebruikte model komt terug', r.model === vindProvider('claude').standaardModel)
  }

  // Foutafhandeling
  {
    const ai = maak(async () => ({ ok: false, status: 401, text: async () => JSON.stringify({ error: { message: 'invalid x-api-key' } }) }))
    const r = await ai.stuur({ id: 'p1', providerId: 'claude', berichten: [{ rol: 'gebruiker', tekst: 'hoi' }] })
    check('een http-fout wordt herkend', r.soort === 'http' && r.status === 401)
    check('en de melding van de dienst komt mee', /invalid x-api-key/.test(r.bericht))
  }
  {
    const ai = maak(async () => ({ ok: false, status: 500, text: async () => 'Internal Server Error' }))
    const r = await ai.stuur({ id: 'p1', providerId: 'claude', berichten: [{ rol: 'gebruiker', tekst: 'hoi' }] })
    check('ook een antwoord zonder json blijft leesbaar', /Internal Server Error/.test(r.bericht))
  }
  {
    const ai = maak(async () => { throw new Error('getaddrinfo ENOTFOUND') })
    const r = await ai.stuur({ id: 'p1', providerId: 'claude', berichten: [{ rol: 'gebruiker', tekst: 'hoi' }] })
    check('een netwerkfout wordt apart gemeld', r.soort === 'netwerk' && /ENOTFOUND/.test(r.bericht))
  }
  {
    const ai = maak(async () => ({ ok: true, body: nepStroom([
      'data: {"type":"content_block_delta","delta":{"type":"text_delta","text":"begin"}}\n\n',
      'data: {"type":"error","error":{"type":"overloaded_error","message":"Overloaded"}}\n\n',
    ]) }))
    const r = await ai.stuur({ id: 'p1', providerId: 'claude', berichten: [{ rol: 'gebruiker', tekst: 'hoi' }] })
    check('een fout midden in de stroom stopt het antwoord', r.soort === 'dienst' && /Overloaded/.test(r.bericht))
    check('en wat al binnen was blijft behouden', r.tekst === 'begin')
  }
  {
    const ai = maak(async () => ({ ok: true, body: nepStroom(['data: {"type":"message_stop"}\n\n']) }))
    const r = await ai.stuur({ id: 'p1', providerId: 'claude', berichten: [{ rol: 'gebruiker', tekst: 'hoi' }] })
    check('een leeg antwoord is ook een fout', r.soort === 'leegantwoord')
  }
  {
    const ai = maak(async () => ({ ok: true, body: nepStroom([]) }))
    const r = await ai.stuur({ id: 'p1', providerId: 'nietbestaand', berichten: [{ rol: 'gebruiker', tekst: 'x' }] })
    check('een onbekende dienst wordt netjes geweigerd', r.soort === 'onbekend')
    const leeg = await ai.stuur({ id: 'p1', providerId: 'claude', berichten: [] })
    check('en een leeg gesprek ook', leeg.soort === 'leeg')
  }

  // Afbreken
  {
    let signaal = null
    const ai = maak(async (_u, opts) => {
      signaal = opts.signal
      await new Promise((res, rej) => { opts.signal.addEventListener('abort', () => rej(new Error('aborted'))) })
    })
    const bezig = ai.stuur({ id: 'p9', providerId: 'claude', berichten: [{ rol: 'gebruiker', tekst: 'hoi' }] })
    await new Promise(r => setTimeout(r, 10))
    check('stoppen meldt dat er iets liep', ai.stop('p9') === true)
    const r = await bezig
    check('en het resultaat zegt: afgebroken', r.soort === 'afgebroken')
    check('het signaal stond ook echt op afgebroken', signaal.aborted === true)
    check('daarna valt er niets meer te stoppen', ai.stop('p9') === false)
  }

  // Modellen ophalen bij de dienst zelf
  process.env.OPENAI_API_KEY = 'sk-openai-test'
  {
    const ai = maak(async (url, opts) => {
      if (!/\/models$/.test(url)) throw new Error('verkeerd adres: ' + url)
      if (opts.method !== 'GET') throw new Error('geen GET')
      return { ok: true, json: async () => ({ data: [{ id: 'zeta' }, { id: 'alfa' }] }) }
    })
    const r = await ai.modellen({ providerId: 'openai' })
    check('modellen worden opgehaald', r.ok === true && r.modellen.length === 2)
    check('en op naam gezet', r.modellen[0].id === 'alfa')
  }
  {
    const ai = maak(async () => ({ ok: false, status: 404, text: async () => 'nope' }))
    const r = await ai.modellen({ providerId: 'openai' })
    check('een mislukte lijst geeft een reden', r.ok === false && r.status === 404)
  }
  {
    let gezien = ''
    const ai = maak(async (url) => { gezien = url; return { ok: true, json: async () => ({ data: [] }) } })
    await ai.modellen({ providerId: 'ollama', endpoint: 'http://localhost:9999/v1/chat/completions' })
    check('een eigen adres telt ook voor de modellenlijst',
      gezien === 'http://localhost:9999/v1/models')
  }

  delete process.env.OPENAI_API_KEY

  // Zonder model kan er niets
  {
    const ai = maak(async () => { throw new Error('niet gebruikt') })
    const r = await ai.stuur({ id: 'p1', providerId: 'ollama', berichten: [{ rol: 'gebruiker', tekst: 'hoi' }] })
    check('een lokale dienst zonder gekozen model zegt dat', r.soort === 'geenmodel')
  }

  // Gemini: het model hoort in het adres
  {
    process.env.GEMINI_API_KEY = 'g-test'
    let gezien = ''
    const ai = maak(async (url) => {
      gezien = url
      return { ok: true, body: nepStroom([
        'data: {"candidates":[{"content":{"parts":[{"text":"hoi"}]}}],"usageMetadata":{"promptTokenCount":3,"candidatesTokenCount":2}}\n\n']) }
    })
    const r = await ai.stuur({ id: 'p1', providerId: 'gemini', model: 'gemini-2.5-flash',
                               berichten: [{ rol: 'gebruiker', tekst: 'hoi' }] })
    check('gemini antwoordt gewoon', r.ok === true && r.tekst === 'hoi')
    check('en het model stond in het adres', /gemini-2\.5-flash:streamGenerateContent/.test(gezien))
    check('het verbruik komt mee', r.verbruik.in === 3 && r.verbruik.uit === 2)
    delete process.env.GEMINI_API_KEY
  }

  // Lopende totalen mogen niet dubbel geteld worden
  {
    const ai = maak(async () => ({ ok: true, body: nepStroom([
      'data: {"type":"content_block_delta","delta":{"type":"text_delta","text":"x"}}\n\n',
      'data: {"type":"message_delta","usage":{"output_tokens":10}}\n\n',
      'data: {"type":"message_delta","usage":{"output_tokens":20}}\n\n',
      'data: {"type":"message_stop"}\n\n',
    ]) }))
    const r = await ai.stuur({ id: 'p1', providerId: 'claude', berichten: [{ rol: 'gebruiker', tekst: 'hoi' }] })
    check('een tweede telling vervangt de eerste', r.verbruik.uit === 20)
  }

  // Endpoint en tokengrens
  {
    let gezien = null
    const ai = maak(async (url, opts) => {
      gezien = { url, body: JSON.parse(opts.body) }
      return { ok: true, body: nepStroom([
        'data: {"type":"content_block_delta","delta":{"type":"text_delta","text":"ok"}}\n\n']) }
    })
    await ai.stuur({ id: 'p1', providerId: 'claude', endpoint: 'http://localhost:1234/v1/messages',
                     model: 'opus', maxTokens: 99, berichten: [{ rol: 'gebruiker', tekst: 'hoi' }] })
    check('een eigen adres wordt gebruikt', gezien.url === 'http://localhost:1234/v1/messages')
    check('een korte modelnaam wordt uitgeschreven', gezien.body.model === 'claude-opus-5')
    check('een te lage tokengrens wordt opgetrokken', gezien.body.max_tokens === 256)
  }

  delete process.env.ANTHROPIC_API_KEY
  try { fs.rmSync(tmp, { recursive: true, force: true }) } catch {}

  console.log('')
  console.log(ok ? 'ALLE TESTS GESLAAGD' : 'ER ZIJN TESTS GEFAALD')
  process.exit(ok ? 0 : 1)
})()
