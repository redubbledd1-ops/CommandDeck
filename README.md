# CommandDeck

Dark-mode Electron launcher for Flutter projects (and general terminal commands).

## Installeren

### Kant-en-klare installer (aanbevolen)

1. Bouw de installer (zie hieronder), of gebruik `dist\CommandDeck-Setup-1.0.0.exe`
2. Start de Setup
3. Kies desgewenst:
   - installatiemap
   - **snelkoppeling op het bureaublad** (standaard aan)
   - vastmaken aan de taakbalk (standaard uit)
4. Klaar — CommandDeck start na de installatie

De portable variant `dist\CommandDeck.exe` heeft geen installatiestap (handig op een USB-stick), maar start trager omdat hij zichzelf bij elke start uitpakt.

### Vanuit broncode

1. Zorg dat [Node.js](https://nodejs.org/) is geïnstalleerd (v18+)
2. Open de map in terminal:

```bash
cd flutter-launcher
npm install
npm start
```

## Bouwen

```bash
npm run build
```

Maakt in `dist/`:

| Bestand | Wat |
| --- | --- |
| `CommandDeck-Setup-1.0.0.exe` | NSIS-installer met desktop-/startmenu-opties |
| `CommandDeck.exe` | Portable (zelfuitpakkend) |

Alleen installer of alleen portable:

```bash
npm run build:installer
npm run build:portable
```

## Features

- Projecten met meerdere **locaties** (switchbaar via dropdown)
- **Selecteer map** via folder picker
- Commands: run android, run windows, run web, pub get, clean, doctor, build apk/web/windows
- Live terminal output in de app
- Projecten/instellingen in `%APPDATA%/commanddeck/` (blijven bewaard bij updates)
- Eerste start: één voorbeeldproject **Default Flutter Project** (nog zonder map — die kies je zelf)
- Mist Flutter in PATH bij een Flutter-actie: duidelijke installatiehulp in de terminal

> Tip: had je eerder **Flutter Launcher** geïnstalleerd, dan worden je oude projecten en instellingen automatisch overgenomen.

## AI-diensten in het uitvoervenster

Naast Claude Code (dat als los programma in een echte terminal draait) kan
CommandDeck zélf met een AI-dienst praten. Dat gebeurt in hetzelfde
uitvoervenster: je typt in de commandobalk, het antwoord verschijnt erboven.

### Gebruiken

| Commando | Wat |
| --- | --- |
| `/use claude` | in gesprek met Claude (`/use claude:opus` kiest meteen een model) |
| `/ai <vraag>` | één vraag stellen zonder van modus te wisselen |
| `/model`, `/modellen [live]` | model wisselen, of de lijst opvragen (`live` = bij de dienst zelf) |
| `/diensten` | welke diensten er zijn en of ze klaarstaan |
| `/sleutel <sleutel>` | API-sleutel opslaan (leeg = wissen) |
| `/systeem <tekst>` | eigen systeemprompt |
| `/nieuw` | gesprek wissen |
| `/stop` | het lopende antwoord afbreken |
| `/shell` | gespreksmodus uit |
| `!<commando>` | tóch een gewoon commando draaien, midden in een gesprek |

Zodra een dienst klaarstaat verschijnt er een knop: bij **uitvoeren** van een
project, en bij de **snelkoppelingen** in de cmd-sectie. Eén klik zet je in
gesprek, nog een klik op dezelfde knop zet je terug in de shell. Weg met
`/knoppen uit`.

Elk project (en de losse cmd-sectie) heeft zijn eigen gesprek. Wissel je van
project, dan wissel je van gesprek; wat je typte maar nog niet verstuurde blijft
per weergave staan.

Alles hierboven staat ook in het woordenboek onder het thema **ai**, dus je hoeft
het niet uit je hoofd te weten. Eigen categorieen maak je met `theme <naam>`, en
`theme <naam> <commando>` zet er meteen iets in — vanuit de cmd-sectie of vanuit
een project.

De sleutel kan ook uit de omgeving komen: staat `ANTHROPIC_API_KEY` al gezet,
dan wordt die vanzelf gebruikt.

### Welke diensten

| Dienst | `/use` | Sleutel uit | Gratis? |
| --- | --- | --- | --- |
| Claude | `claude` | `ANTHROPIC_API_KEY` | nee |
| ChatGPT | `openai` | `OPENAI_API_KEY` | nee |
| Gemini | `gemini` | `GEMINI_API_KEY` | ja — AI Studio, zonder pas |
| OpenRouter | `openrouter` | `OPENROUTER_API_KEY` | ja — modellen met `:free` |
| Groq | `groq` | `GROQ_API_KEY` | ja |
| Cerebras | `cerebras` | `CEREBRAS_API_KEY` | ja |
| Mistral | `mistral` | `MISTRAL_API_KEY` | ja — "Experiment" |
| DeepSeek | `deepseek` | `DEEPSEEK_API_KEY` | nee |
| Grok | `grok` | `XAI_API_KEY` | nee |
| Ollama | `ollama` | — | ja — draait lokaal |
| LM Studio | `lmstudio` | — | ja — draait lokaal |
| Eigen server | `eigen` | optioneel | — |

De modellenlijsten in de code zijn een startpunt. `/modellen live` (of de knop
**Ophalen** in de instellingen) vraagt de echte lijst op bij de dienst zelf, en
een modelnaam die nergens in staat mag je gewoon intypen.

### Waar het staat

| Bestand | Wat |
| --- | --- |
| `ai-providers.js` | de catalogus: één object per dienst. Dit is het enige bestand dat weet hoe een dienst werkt. |
| `ai-runtime.js` | het HTTP- en streamwerk plus de sleutelopslag, in het hoofdproces |
| `main.js` | roept `maakAi(...)` aan en bewaart `settings.ai` |
| `renderer.js` | gespreksmodus, slash-commando's, weergave in het uitvoervenster |
| `test/ai.test.js` | tests zonder netwerk of Electron (`npm run test:ai`) |
| `TODO-ai.md` | wat af is en wat er nog kan |

Sleutels staan **niet** in `settings.json` maar in `ai-keys.json` in
`%APPDATA%/commanddeck/`, versleuteld met de sleutelbos van Windows. Ze gaan
alleen van de renderer náár het hoofdproces, nooit terug.

### Een dienst toevoegen

Eén object in `ai-providers.js`, met: het adres, welke sleutel erbij hoort, de
modellen, hoe je verzoek eruitziet, en hoe je uit één stream-gebeurtenis een
stukje tekst haalt. De rest van de app hoeft niet mee te veranderen — die kent
alleen die velden. Bovenaan `ai-providers.js` staat een uitgewerkt voorbeeld
voor een OpenAI-compatibele server (dat dekt ook Ollama, LM Studio en vLLM).
