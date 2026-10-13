# Todo — AI-diensten in het uitvoervenster

CommandDeck praat zelf met een AI-dienst: geen los programma, geen terminal,
maar HTTP vanuit het hoofdproces, met het antwoord als tekst in de uitvoer.
Beginnen doe je met `/use <dienst>`, `/hulp` geeft de rest.

> Niet te verwarren met **Claude Code**, dat als programma in een echte
> terminal draait (`claude` intypen). Die weg is ongewijzigd; zie
> `VRAAGT_OM_VENSTER` in `renderer.js`.

## Waar het staat in de code

| Wat | Waar |
|---|---|
| De catalogus: één object per dienst | `ai-providers.js` |
| HTTP, streamen, sleutels, afbreken | `ai-runtime.js` |
| Aanhaken + `settings.ai` | `main.js` (`maakAi(...)`) |
| Gespreksmodus, slash-commando's, weergave | `renderer.js`, zoek op `── AI-gesprek` |
| Instellingen-sectie | `renderer.js`, zoek op `── Instellingen: AI-diensten` |
| Brug tussen beide | `preload.js` (`ai*`) |
| Tests zonder netwerk of Electron | `test/ai.test.js` (`npm run test:ai`) |

---

## Ronde 1 — raamwerk ✅ af

- [x] Providerregister waarin een dienst één object is
- [x] Streamen via server-sent events, ook als een bericht in twee brokken aankomt
- [x] Sleutels versleuteld in `ai-keys.json`, los van `settings.json`
- [x] Sleutel uit een omgevingsvariabele wordt vanzelf gebruikt
- [x] Per weergave een eigen gesprek (project of cmd-sectie)
- [x] Antwoord groeit live in beeld; kijk je elders, dan staat het er als je terugkomt
- [x] Afbreken met `/stop` en met de stopknop
- [x] Foutafhandeling met een reden **en** een volgende stap per soort
- [x] Slash-commando's, `!` om er een shell-commando doorheen te draaien
- [x] Instellingen: dienst, model, sleutel, adres, systeemprompt, tokengrens, test

## Ronde 2 — diensten ✅ af

Elke dienst is een object in `ai-providers.js`. De meeste spreken de OpenAI-vorm
en krijgen hun gedrag van `openAiCompat()`; die zijn een paar regels groot.

| Dienst | `/use` | Sleutel uit | Gratis te proberen |
|---|---|---|---|
| Claude | `claude` | `ANTHROPIC_API_KEY` | nee — eigen vorm |
| ChatGPT | `openai` | `OPENAI_API_KEY` | nee |
| Gemini | `gemini` | `GEMINI_API_KEY` | **ja** — eigen vorm, model in het adres |
| OpenRouter | `openrouter` | `OPENROUTER_API_KEY` | **ja** — modellen met `:free` |
| Groq | `groq` | `GROQ_API_KEY` | **ja** — erg snel |
| Cerebras | `cerebras` | `CEREBRAS_API_KEY` | **ja** |
| Mistral | `mistral` | `MISTRAL_API_KEY` | **ja** — "Experiment"-tier |
| DeepSeek | `deepseek` | `DEEPSEEK_API_KEY` | nee |
| Grok | `grok` | `XAI_API_KEY` | nee |
| Ollama | `ollama` | — | **ja** — lokaal, `localhost:11434` |
| LM Studio | `lmstudio` | — | **ja** — lokaal, `localhost:1234` |
| Eigen server | `eigen` | optioneel | vLLM, llama.cpp, een proxy |

- [x] Modellenlijst ophalen bij de dienst zelf (`/modellen live`, of de knop
      **Ophalen** in de instellingen) — wat hardgecodeerd staat veroudert
- [x] Lokale dienst zonder gekozen model kiest bij `/use` zelf het eerste model
- [x] Een modelnaam die nergens in de lijst staat mag je gewoon intypen
- [x] **Knoppen per dienst**: zodra een dienst een sleutel heeft (of een lokale
      server die je al koos) verschijnt er een knop. Die schuiven aan bij
      **uitvoeren** van een project en bij de **snelkoppelingen** in de
      cmd-sectie — geen eigen rij, dat kostte te veel hoogte. Klik = in gesprek,
      nog een klik = terug naar de shell. Aan/uit met `/knoppen aan|uit` of het
      vinkje in de instellingen.
- [x] **Uitleg per dienst** bij `/use`, in `ai-providers.js` onder `hulp`:
      wat te doen bij geen sleutel, bij een geweigerde sleutel (401/403) en bij
      een server die niet antwoordt. Adres, knopnaam en vorm van de sleutel
      verschillen per dienst, dus dat is dienstkennis en hoort in de catalogus.

- [x] **Adressen en commando's aanklikbaar** in die uitleg: een adres krijgt een
      eigen regel in kleur en opent in je browser, een commando achter een
      dubbele punt zet zichzelf in de commandobalk. Werkt voor alle diensten,
      omdat het uit de tekst zelf wordt gehaald (`aiStap` in `renderer.js`).
      Openen gaat via `shell:openUrl`, dat alleen http en https doorlaat.

### Opgeloste fouten

- [x] Van dienst wisselen liet het model van de vórige dienst staan
      (`/use gemini` → `/use ollama` gaf "Ollama · gemini-3.7-flash"), en sloeg
      dat ook nog op. Bij een wissel wordt het model nu opnieuw bepaald, en een
      eerder verkeerd opgeslagen model wordt bij het opstarten stil opgeruimd.
- [x] De uitvoer wissen tijdens een lopend antwoord toverde de gewiste tekst
      terug zodra het volgende stukje binnenkwam.

### Nog even nakijken met een echte sleutel

De vorm van elk verzoek is getest tegen nagebootste antwoorden, maar per dienst
één keer echt uitproberen is verstandig. Per dienst: `/use <naam>`,
`/sleutel <sleutel>`, een vraag, en `/modellen live`.

Begin bij de gratis, die kosten alleen een aanmelding:

- [ ] Ollama (lokaal, geen aanmelding — alleen `ollama pull` van een model)
- [ ] Gemini — sleutel op aistudio.google.com/apikey
- [ ] Groq — console.groq.com/keys
- [ ] Cerebras — cloud.cerebras.ai
- [ ] OpenRouter — openrouter.ai/keys, model met `:free` achteraan
- [ ] Mistral — console.mistral.ai
- [ ] LM Studio (lokaal)

Daarna de betaalde:

- [ ] ChatGPT
- [ ] DeepSeek
- [ ] Grok

## Ronde 2b — in het woordenboek ✅ af

Instellingen die je alleen met de hand in een JSON-bestand kon zetten horen daar
niet thuis. Alles wat je met de app kunt doen staat nu als commando in het
woordenboek, en is dus vindbaar en uitvoerbaar.

- [x] Thema **ai** met de commando's om een dienst te kiezen, een sleutel te
      zetten, modellen op te halen en de knoppenrij aan of uit te zetten
- [x] Thema **woordenboek** met de `theme`-commando's
- [x] `/knoppen aan|uit` en een vinkje in de instellingen, in plaats van
      `settings.ai.knoppen` met de hand aanpassen
- [x] Een app-commando uit het woordenboek draaien vraagt niet meer om een
      werkmap — die heeft het niet nodig

### Eigen thema's

Werkt vanuit de cmd-sectie én vanuit een project:

| Commando | Wat |
|---|---|
| `theme` | welke thema's zijn er, met hoeveel erin zit |
| `theme <naam>` | thema aanmaken, of laten zien wat erin zit |
| `theme <naam> <commando>` | dat commando meteen in het woordenboek zetten onder dat thema |
| `theme wis <naam>` | een zelfgemaakt thema weghalen |

Ook als `/thema <naam>`, zodat het werkt terwijl je in gesprek bent met een AI.
Zelfgemaakte thema's staan in `settings.dictThemas`, want een thema is een label
op een commando — een leeg thema zou anders meteen weer verdwijnen.

## Ronde 3 — nog te doen

- [ ] **Gesprek bewaren** tussen herstarts, per project (nu leeft het in het geheugen)
- [ ] **Bestanden meesturen**: `/lees <pad>` of het bestand uit de verkenner erbij
- [ ] **Uitvoer meesturen**: "waarom faalt dit?" met de laatste terminaluitvoer erbij
- [ ] **Antwoord opmaken**: codeblokken herkennen, met een knop om te kopiëren
      of als bat-bestand op te slaan
- [ ] **Een commando voorstellen** dat je met één klik in de commandobalk zet
- [ ] **Kosten bijhouden** per dienst, op basis van de tokentelling die al binnenkomt
- [ ] **Redeneerstappen** tonen of verbergen (Claude `thinking`, OpenAI reasoning)
- [ ] **Meer diensten**: Cohere, Fireworks, Perplexity, Cloudflare Workers AI,
      Azure AI Foundry, AWS Bedrock, Google Vertex — de eerste vier zijn
      OpenAI-compatibel en dus elk een paar regels; de laatste drie hebben eigen
      authenticatie. (GitHub Models is per 30 juli 2026 gestopt, dus die niet.)
- [ ] **Gereedschap** (tool use), zodat de AI zelf een commando mag voorstellen
      én uitvoeren — pas doen met een bevestiging per stap
