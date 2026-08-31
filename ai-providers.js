// Bekende AI-diensten, zodat de app er zelf mee kan praten.
//
// Dit bestand is de enige plek waar staat hoe een dienst werkt. De rest van de
// app (ai-runtime.js, renderer.js) weet niets van Anthropic, OpenAI of Ollama:
// die kent alleen de velden hieronder. Een dienst toevoegen is dus één object
// erbij, en verder niets.
//
// Per dienst:
//
//   id             korte naam waarmee je hem aanroept: `/use claude`
//   label / merk   wat de gebruiker ziet
//   url            standaard-endpoint; in de instellingen te overschrijven
//                  (nodig voor een proxy, een eigen server of een andere poort)
//   urlVoor(ctx)   alleen als het adres van het model afhangt, zoals bij Gemini
//   sleutel        { nodig, env, waar } — of er een API-sleutel bij hoort, uit
//                  welke omgevingsvariabele hij anders mag komen, en waar je
//                  hem haalt. nodig:false = een lokale dienst zonder sleutel.
//   modellen       lijst met { id, label }. Een startpunt: nieuwe modellen
//                  verschijnen sneller dan dit bestand wordt bijgewerkt, dus
//                  een naam die er niet in staat mag je gewoon intypen.
//   modellenUrl    waar de echte lijst te halen valt (`/modellen live`)
//   modellenUit(j) die lijst uitpakken
//   standaardModel welke het is als je niets kiest ('' = eerst ophalen)
//   lokaal         draait op deze machine; dan heeft "ophalen" ook zin zonder
//                  sleutel, en is een lege modellenlijst normaal
//   gratis         er is een gratis manier om dit te proberen, zonder pas
//   programma      dezelfde dienst heeft ook een opdrachtregelprogramma dat op
//                  je abonnement draait in plaats van op API-tegoed:
//                    { catalogId, cmd, sluiten } — catalogId verwijst naar
//                  editor-catalog.js, zodat we weten of het geinstalleerd is.
//                  `sluiten` is hoe je uit dat programma komt: dat verschilt
//                  per tool en is niet te raden. Zonder sleutel is dit de
//                  route die wél werkt.
//   voorstellen    modellen om mee te beginnen, voor een server die er zelf nog
//                  geen heeft: [{ id, wat, grootte }]. Platte gegevens, want
//                  dit gaat over IPC naar het venster.
//   haalPatroon    hoe je zo'n model binnenhaalt, met {model} erin
//   hulp           wat de gebruiker moet doen als het niet lukt, per geval:
//                    sleutel      — er is nog geen sleutel
//                    geweigerd    — de sleutel wordt niet geaccepteerd (401/403)
//                    onbereikbaar — de server antwoordt niet (vooral lokaal)
//                    geenmodellen — de server antwoordt wel, maar heeft niets
//                    tegoed       — de sleutel klopt, maar er is geen saldo
//                  Losse regels, in volgorde van doen. Ze staan hier en niet in
//                  de taalbestanden omdat het adres, de knopnaam en de vorm van
//                  de sleutel per dienst verschillen — dat is dienstkennis.
//   headers(ctx)   HTTP-kopregels. ctx = { sleutel }
//   body(ctx)      de JSON die je verstuurt. ctx = { model, berichten,
//                  systeem, maxTokens }. `berichten` is [{ rol, tekst }] met
//                  rol 'gebruiker' of 'ai' — elke dienst vertaalt dat zelf.
//   stuk(data)     uit één stream-gebeurtenis het stukje tekst halen ('' = niets)
//   klaar(data)    is dit de laatste gebeurtenis?
//   streamFout(d)  een fout die midden in de stream binnenkomt
//   fout(json)     de foutmelding uit een mislukt antwoord halen
//   verbruik(d)    optioneel: { in, uit } tokens tot nu toe, puur ter info
//
// De meeste diensten spreken hetzelfde als OpenAI. Die krijgen hun gedrag van
// `openAiCompat()` hieronder en zijn daardoor een paar regels groot.

// ── Diensten die de OpenAI-vorm spreken ───────────────────────────────────────
// Dat zijn er veel: OpenAI zelf, OpenRouter, DeepSeek, Mistral, Groq, xAI, en
// elke lokale server (Ollama, LM Studio, vLLM, llama.cpp) die die vorm aanbiedt.
function openAiCompat(eigen) {
  const url = eigen.url || ''
  const standaard = {
    modellenUrl: url.replace(/\/chat\/completions$/, '/models'),

    headers: ({ sleutel }) => ({
      'content-type': 'application/json',
      ...(sleutel ? { authorization: 'Bearer ' + sleutel } : {}),
      ...(eigen.extraKoppen || {}),
    }),

    body: ({ model, berichten, systeem, maxTokens }) => ({
      model,
      stream: true,
      max_tokens: maxTokens,
      // Niet elke server kent dit veld, en een onbekend veld levert daar een
      // 400 op. Alleen aanzetten waar het aantoonbaar werkt.
      ...(eigen.verbruikVragen ? { stream_options: { include_usage: true } } : {}),
      messages: [
        ...(systeem ? [{ role: 'system', content: systeem }] : []),
        ...berichten.map(b => ({
          role: b.rol === 'ai' ? 'assistant' : 'user',
          content: String(b.tekst || ''),
        })),
      ],
    }),

    stuk: (d) => {
      const keuze = d && d.choices && d.choices[0]
      const delta = keuze && keuze.delta
      return (delta && typeof delta.content === 'string') ? delta.content : ''
    },

    klaar: (d) => !!(d && d.choices && d.choices[0] && d.choices[0].finish_reason),

    fout: (j) => (j && ((j.error && (j.error.message || j.error.type)) || j.message)) || '',

    verbruik: (d) => (d && d.usage)
      ? { in: d.usage.prompt_tokens || 0, uit: d.usage.completion_tokens || 0 }
      : null,

    // `created` bewaren: daarmee is te zien welk model je het laatst hebt
    // opgehaald, en dat is meestal het model dat je bedoelt.
    modellenUit: (j) => ((j && j.data) || [])
      .map(m => ({ id: m.id, label: m.owned_by || '', tijd: Number(m.created) || 0 })),
  }
  return { ...standaard, ...eigen }
}

const AI_PROVIDERS = [
  // ── Anthropic ───────────────────────────────────────────────────────────────
  {
    id: 'claude',
    hulp: {
      sleutel: [
        'Log in op:  console.anthropic.com',
        'Open "API keys" en maak er een; hij begint met sk-ant-.',
        'Let op: de API heeft eigen tegoed nodig. Een Claude-abonnement telt hier niet voor mee.',
        'Typ dan:  /sleutel <je sleutel>',
      ],
      geweigerd: [
        'De sleutel wordt niet geaccepteerd. Meestal is hij ingetrokken, of hoort hij bij een ander account.',
        'Maak een nieuwe op console.anthropic.com',
        'Zet hem daarna met:  /sleutel <je sleutel>',
        'Blijft het misgaan? Controleer op console.anthropic.com of er nog tegoed op staat.',
      ],
      tegoed: [
        'De sleutel klopt, maar er staat geen tegoed op je API-account.',
        'Let op: dit staat los van een Claude-abonnement. Dat geeft geen API-tegoed.',
        'Saldo bijzetten kan op console.anthropic.com onder Billing.',
        'Liever niets betalen? Gebruik dan het programma claude — dat draait op je abonnement.',
        'Zo start je hem:  claude',
      ],
    },
    label: 'Claude',
    merk: 'Anthropic',
    url: 'https://api.anthropic.com/v1/messages',
    modellenUrl: 'https://api.anthropic.com/v1/models',
    sleutel: { nodig: true, env: 'ANTHROPIC_API_KEY', waar: 'console.anthropic.com' },
    programma: { catalogId: 'claudeCode', cmd: 'claude', sluiten: '/exit, exit of Ctrl+C' },
    modellen: [
      { id: 'claude-sonnet-5',  label: 'Sonnet 5 — snel en slim' },
      { id: 'claude-opus-5',    label: 'Opus 5 — sterkst voor code' },
      { id: 'claude-fable-5',   label: 'Fable 5 — hoogste capaciteit' },
      { id: 'claude-haiku-4-5', label: 'Haiku 4.5 — snelst' },
    ],
    standaardModel: 'claude-sonnet-5',

    headers: ({ sleutel }) => ({
      'content-type': 'application/json',
      'x-api-key': sleutel,
      'anthropic-version': '2023-06-01',
    }),

    body: ({ model, berichten, systeem, maxTokens }) => ({
      model,
      max_tokens: maxTokens,
      stream: true,
      ...(systeem ? { system: systeem } : {}),
      messages: berichten.map(b => ({
        role: b.rol === 'ai' ? 'assistant' : 'user',
        content: String(b.tekst || ''),
      })),
    }),

    stuk: (d) => (d && d.type === 'content_block_delta'
      && d.delta && d.delta.type === 'text_delta') ? (d.delta.text || '') : '',

    klaar: (d) => !!d && d.type === 'message_stop',

    streamFout: (d) => (d && d.type === 'error' && d.error)
      ? (d.error.message || d.error.type || 'onbekende fout') : '',

    fout: (j) => (j && j.error && (j.error.message || j.error.type)) || '',

    verbruik: (d) => {
      if (d && d.type === 'message_start' && d.message && d.message.usage) {
        return { in: d.message.usage.input_tokens || 0, uit: 0 }
      }
      if (d && d.type === 'message_delta' && d.usage) {
        return { in: 0, uit: d.usage.output_tokens || 0 }
      }
      return null
    },

    modellenUit: (j) => ((j && j.data) || []).map(m => ({ id: m.id, label: m.display_name || '' })),
  },

  // ── OpenAI ──────────────────────────────────────────────────────────────────
  openAiCompat({
    id: 'openai',
    hulp: {
      sleutel: [
        'Log in op:  platform.openai.com/api-keys',
        'Klik "Create new secret key" en kopieer hem; hij begint met sk-.',
        'Let op: dit staat los van ChatGPT Plus. De API heeft eigen tegoed nodig.',
        'Typ dan:  /sleutel <je sleutel>',
      ],
      geweigerd: [
        'De sleutel wordt niet geaccepteerd, of er staat geen tegoed op het project.',
        'Kijk op platform.openai.com/usage of er saldo is, en maak zo nodig een nieuwe sleutel.',
      ],
      tegoed: [
        'De sleutel klopt, maar er staat geen tegoed op je API-account.',
        'Let op: dit staat helemaal los van ChatGPT Plus. Een abonnement geeft geen API-tegoed.',
        'Saldo bijzetten: log in op platform.openai.com en ga naar Settings > Billing > Add to credit balance.',
        'Liever niets betalen? Gebruik dan het programma codex — dat draait op je ChatGPT-account, ook op het gratis plan.',
        'Zo start je hem:  codex',
      ],
    },
    // Bewust niet gewoon "ChatGPT": dit is de betaalde API en niet het
    // abonnement dat de meeste mensen bedoelen als ze ChatGPT zeggen. Zonder
    // dat onderscheid klik je een knop aan die nooit kan werken.
    label: 'ChatGPT (API)',
    merk: 'OpenAI, betaald per gebruik',
    url: 'https://api.openai.com/v1/chat/completions',
    sleutel: { nodig: true, env: 'OPENAI_API_KEY', waar: 'platform.openai.com/api-keys' },
    // Codex kent geen kaal `exit`: alleen /exit, /quit of Ctrl+C.
    programma: { catalogId: 'codex', cmd: 'codex', sluiten: '/exit, /quit of Ctrl+C' },
    verbruikVragen: true,
    modellen: [
      { id: 'gpt-5.6-terra', label: 'GPT-5.6 Terra — balans tussen kunnen en kosten' },
      { id: 'gpt-5.6-sol',   label: 'GPT-5.6 Sol — zwaarste werk' },
      { id: 'gpt-5.6-luna',  label: 'GPT-5.6 Luna — goedkoopst' },
    ],
    standaardModel: 'gpt-5.6-terra',
  }),

  // ── Google ──────────────────────────────────────────────────────────────────
  // Gemini heeft een eigen vorm, en het model staat in het adres.
  {
    id: 'gemini',
    hulp: {
      sleutel: [
        'Log in met je Google-account op:  aistudio.google.com/apikey',
        'Klik "Create API key" en kopieer hem; hij begint met AIza.',
        'Dit is gratis — er worden geen betaalgegevens gevraagd.',
        'Typ dan:  /sleutel <je sleutel>',
      ],
      geweigerd: [
        'Google accepteert de sleutel niet. Vaak hoort hij bij een project waarvoor de Gemini API niet aanstaat.',
        'Maak een nieuwe op aistudio.google.com/apikey, en kies daar een project waarin de API al is ingeschakeld.',
      ],
    },
    label: 'Gemini',
    merk: 'Google',
    gratis: true,          // AI Studio geeft een sleutel zonder betaalgegevens
    url: 'https://generativelanguage.googleapis.com/v1beta/models',
    modellenUrl: 'https://generativelanguage.googleapis.com/v1beta/models',
    sleutel: { nodig: true, env: 'GEMINI_API_KEY', waar: 'aistudio.google.com/apikey' },
    programma: { catalogId: 'geminiCli', cmd: 'gemini', sluiten: '/quit of Ctrl+C' },
    modellen: [
      { id: 'gemini-3.7-flash',      label: 'Gemini 3.7 Flash — snel en sterk' },
      { id: 'gemini-3.1-pro-preview', label: 'Gemini 3.1 Pro — zwaarste werk' },
      { id: 'gemini-3.5-flash-lite', label: 'Gemini 3.5 Flash Lite — goedkoopst' },
      { id: 'gemini-2.5-pro',        label: 'Gemini 2.5 Pro' },
      { id: 'gemini-2.5-flash',      label: 'Gemini 2.5 Flash' },
    ],
    standaardModel: 'gemini-3.7-flash',

    urlVoor: ({ basis, model }) =>
      `${String(basis).replace(/\/+$/, '')}/${encodeURIComponent(model)}:streamGenerateContent?alt=sse`,

    headers: ({ sleutel }) => ({
      'content-type': 'application/json',
      'x-goog-api-key': sleutel,
    }),

    body: ({ berichten, systeem, maxTokens }) => ({
      contents: berichten.map(b => ({
        role: b.rol === 'ai' ? 'model' : 'user',
        parts: [{ text: String(b.tekst || '') }],
      })),
      ...(systeem ? { systemInstruction: { parts: [{ text: systeem }] } } : {}),
      generationConfig: { maxOutputTokens: maxTokens },
    }),

    stuk: (d) => {
      const kandidaat = d && d.candidates && d.candidates[0]
      const delen = kandidaat && kandidaat.content && kandidaat.content.parts
      return (delen || []).map(p => (p && typeof p.text === 'string') ? p.text : '').join('')
    },

    klaar: (d) => !!(d && d.candidates && d.candidates[0] && d.candidates[0].finishReason),

    fout: (j) => (j && j.error && j.error.message) || '',

    verbruik: (d) => (d && d.usageMetadata) ? {
      in:  d.usageMetadata.promptTokenCount     || 0,
      uit: d.usageMetadata.candidatesTokenCount || 0,
    } : null,

    modellenUit: (j) => ((j && j.models) || [])
      .filter(m => !m.supportedGenerationMethods
        || m.supportedGenerationMethods.includes('generateContent'))
      .map(m => ({ id: String(m.name || '').replace(/^models\//, ''), label: m.displayName || '' })),
  },

  // ── Alles op één sleutel ────────────────────────────────────────────────────
  openAiCompat({
    id: 'openrouter',
    hulp: {
      sleutel: [
        'Log in (kan met je Google- of GitHub-account) op:  openrouter.ai/keys',
        'Maak een sleutel; hij begint met sk-or-.',
        'Typ dan:  /sleutel <je sleutel>',
        'Kies daarna een model dat op :free eindigt — dat kost niets. Zien welke er zijn:  /modellen live',
      ],
      geweigerd: [
        'OpenRouter accepteert de sleutel niet, of het model dat je koos vraagt tegoed.',
        'Kies een model dat op :free eindigt met:  /modellen live',
        'Of zet saldo op je account via openrouter.ai/credits',
      ],
      tegoed: [
        'Dit model kost geld en je saldo is op.',
        'Kies er een die op :free eindigt — die kosten niets. Lijst opvragen:  /modellen live',
        'Of zet saldo bij op openrouter.ai/credits',
      ],
    },
    label: 'OpenRouter',
    merk: 'honderden modellen, één sleutel',
    gratis: true,          // de modellen met :free achteraan kosten niets
    url: 'https://openrouter.ai/api/v1/chat/completions',
    modellenUrl: 'https://openrouter.ai/api/v1/models',
    sleutel: { nodig: true, env: 'OPENROUTER_API_KEY', waar: 'openrouter.ai/keys' },
    verbruikVragen: true,
    extraKoppen: { 'HTTP-Referer': 'https://github.com/commanddeck', 'X-Title': 'CommandDeck' },
    // De echte lijst is enorm en verandert dagelijks: haal hem op met
    // `/modellen live`. Dit zijn er een paar om mee te beginnen. Alles met
    // `:free` achteraan kost niets — daarom staat dat vooraan én als standaard.
    modellen: [
      { id: 'z-ai/glm-5.2:free',                label: 'GLM 5.2 — gratis, sterk in code' },
      { id: 'thinkingmachines/inkling:free',    label: 'Inkling — gratis' },
      { id: 'google/gemma-4-31b-it:free',       label: 'Gemma 4 31B — gratis' },
      { id: 'nvidia/nemotron-3-super-120b-a12b:free', label: 'Nemotron 3 Super — gratis' },
      { id: 'anthropic/claude-sonnet-5',        label: 'Claude Sonnet 5 — betaald' },
      { id: 'openai/gpt-5.6-terra',             label: 'GPT-5.6 Terra — betaald' },
      { id: 'google/gemini-3.7-flash',          label: 'Gemini 3.7 Flash — betaald' },
    ],
    standaardModel: 'z-ai/glm-5.2:free',
  }),

  // ── Verder ──────────────────────────────────────────────────────────────────
  openAiCompat({
    id: 'deepseek',
    hulp: {
      sleutel: [
        'Log in op:  platform.deepseek.com',
        'Open "API keys" en maak er een.',
        'Typ dan:  /sleutel <je sleutel>',
      ],
      tegoed: [
        'De sleutel klopt, maar er staat geen tegoed op je DeepSeek-account.',
        'Saldo bijzetten kan op platform.deepseek.com onder Top up.',
      ],
    },
    label: 'DeepSeek',
    merk: 'DeepSeek',
    url: 'https://api.deepseek.com/chat/completions',
    modellenUrl: 'https://api.deepseek.com/models',
    sleutel: { nodig: true, env: 'DEEPSEEK_API_KEY', waar: 'platform.deepseek.com' },
    verbruikVragen: true,
    modellen: [
      { id: 'deepseek-v4-flash', label: 'V4 Flash — snel en goedkoop' },
      { id: 'deepseek-v4-pro',   label: 'V4 Pro — zwaarste werk' },
    ],
    standaardModel: 'deepseek-v4-flash',
  }),

  openAiCompat({
    id: 'mistral',
    hulp: {
      sleutel: [
        'Log in op:  console.mistral.ai',
        'Open "API Keys" en maak er een.',
        'Het "Experiment"-tier is gratis; daarvoor moet je wel akkoord gaan dat je invoer gebruikt mag worden.',
        'Typ dan:  /sleutel <je sleutel>',
      ],
    },
    label: 'Mistral',
    merk: 'Mistral AI',
    gratis: true,          // "Experiment"-tier, zonder betaalgegevens
    url: 'https://api.mistral.ai/v1/chat/completions',
    sleutel: { nodig: true, env: 'MISTRAL_API_KEY', waar: 'console.mistral.ai' },
    verbruikVragen: true,
    modellen: [
      { id: 'mistral-medium-2604',  label: 'Medium 3.5' },
      { id: 'mistral-large-2512',   label: 'Large 3' },
      { id: 'mistral-small-2603',   label: 'Small 4' },
      { id: 'ministral-3-8b-2512',  label: 'Ministral 3 8B — klein en snel' },
    ],
    standaardModel: 'mistral-medium-2604',
  }),

  openAiCompat({
    id: 'groq',
    hulp: {
      sleutel: [
        'Log in op:  console.groq.com/keys',
        'Maak een sleutel; hij begint met gsk_.',
        'Gratis, zonder betaalgegevens. Er geldt wel een dagelijkse limiet.',
        'Typ dan:  /sleutel <je sleutel>',
      ],
    },
    label: 'Groq',
    merk: 'open modellen, erg snel',
    gratis: true,
    url: 'https://api.groq.com/openai/v1/chat/completions',
    sleutel: { nodig: true, env: 'GROQ_API_KEY', waar: 'console.groq.com/keys' },
    verbruikVragen: true,
    modellen: [
      { id: 'openai/gpt-oss-120b', label: 'GPT-OSS 120B' },
      { id: 'openai/gpt-oss-20b',  label: 'GPT-OSS 20B — sneller' },
      { id: 'groq/compound',       label: 'Compound — met gereedschap' },
      { id: 'qwen/qwen3.6-27b',    label: 'Qwen 3.6 27B' },
    ],
    standaardModel: 'openai/gpt-oss-120b',
  }),

  openAiCompat({
    id: 'grok',
    hulp: {
      sleutel: [
        'Log in op:  console.x.ai',
        'Maak een sleutel onder "API Keys".',
        'Let op: hier hoort tegoed bij; een X Premium-abonnement telt niet mee.',
        'Typ dan:  /sleutel <je sleutel>',
      ],
      tegoed: [
        'De sleutel klopt, maar er staat geen tegoed op je xAI-account.',
        'Let op: een X Premium-abonnement telt hier niet voor mee.',
        'Saldo bijzetten kan op console.x.ai onder Billing.',
      ],
    },
    label: 'Grok',
    merk: 'xAI',
    url: 'https://api.x.ai/v1/chat/completions',
    sleutel: { nodig: true, env: 'XAI_API_KEY', waar: 'console.x.ai' },
    verbruikVragen: true,
    modellen: [{ id: 'grok-4.6', label: 'Grok 4.6' }],
    standaardModel: 'grok-4.6',
  }),

  openAiCompat({
    id: 'cerebras',
    hulp: {
      sleutel: [
        'Log in op:  cloud.cerebras.ai',
        'Maak een sleutel onder "API Keys".',
        'Gratis, met een ruime daglimiet.',
        'Typ dan:  /sleutel <je sleutel>',
      ],
    },
    label: 'Cerebras',
    merk: 'open modellen, erg snel',
    url: 'https://api.cerebras.ai/v1/chat/completions',
    sleutel: { nodig: true, env: 'CEREBRAS_API_KEY', waar: 'cloud.cerebras.ai' },
    gratis: true,
    verbruikVragen: true,
    modellen: [
      { id: 'gpt-oss-120b', label: 'GPT-OSS 120B' },
      { id: 'gemma-4-31b',  label: 'Gemma 4 31B' },
    ],
    standaardModel: 'gpt-oss-120b',
  }),

  // ── Op je eigen machine ─────────────────────────────────────────────────────
  // Geen sleutel, geen internet, geen rekening. Welke modellen er zijn hangt af
  // van wat jij hebt gedownload, dus die lijst halen we op in plaats van hem
  // hier te verzinnen.
  openAiCompat({
    id: 'ollama',
    hulp: {
      geenmodellen: [
        'Ollama draait, maar er staat nog geen model op deze pc.',
        'Een goede eerste voor code is qwen2.5-coder. Ophalen met:  !ollama pull qwen2.5-coder:7b',
        'Zwaardere pc niet? Neem de kleine:  !ollama pull qwen2.5-coder:3b',
        'Het downloaden duurt even; daarna is het van jou en werkt het offline.',
        'Kijken wat je hebt:  !ollama list',
        'Meer keuze staat op ollama.com/library',
      ],
      onbereikbaar: [
        'Er draait geen Ollama op dit adres.',
        'Nog niet geinstalleerd? Haal hem op bij ollama.com/download en start hem — daarna draait hij in je systeemvak.',
        'Wel geinstalleerd? Controleer of hij aanstaat met:  !ollama list',
        'Nog geen model? Haal er een op met:  !ollama pull qwen2.5-coder:7b',
        'Draait hij op een andere poort of een andere pc? Zet het adres bij Instellingen → AI-diensten → Ander adres.',
      ],
    },
    label: 'Ollama',
    merk: 'lokaal op deze pc',
    url: 'http://localhost:11434/v1/chat/completions',
    sleutel: { nodig: false, env: '', waar: 'ollama.com/download' },
    lokaal: true,
    gratis: true,
    modellen: [],
    standaardModel: '',
    // Groottes bij benadering; ze verschillen per versie van het model.
    haalPatroon: 'ollama pull {model}',
    voorstellen: [
      { id: 'qwen2.5-coder:7b',    wat: 'sterk in code',      grootte: '~4,7 GB' },
      { id: 'qwen2.5-coder:3b',    wat: 'code, lichter',      grootte: '~1,9 GB' },
      { id: 'llama3.2:3b',         wat: 'algemeen, klein',    grootte: '~2 GB' },
      { id: 'mistral:7b',          wat: 'algemeen',           grootte: '~4,1 GB' },
      { id: 'deepseek-coder:6.7b', wat: 'code',               grootte: '~3,8 GB' },
    ],
  }),

  openAiCompat({
    id: 'lmstudio',
    hulp: {
      geenmodellen: [
        'De LM Studio-server draait, maar er is geen model geladen.',
        'Zoek in LM Studio een model op het tabblad Discover en download het.',
        'Laad het daarna in het tabblad Developer, anders geeft de server niets terug.',
        'Klaar? Haal de lijst hier opnieuw op met:  /modellen live',
      ],
      onbereikbaar: [
        'Er draait geen LM Studio-server op dit adres.',
        'Nog niet geinstalleerd? Haal hem op bij lmstudio.ai',
        'Open LM Studio, ga naar het tabblad Developer (bij oudere versies: Local Server) en klik Start Server.',
        'Laad daar ook een model — zonder geladen model blijft de lijst leeg.',
        'Andere poort? Zet het adres bij Instellingen → AI-diensten → Ander adres.',
      ],
    },
    label: 'LM Studio',
    merk: 'lokaal op deze pc',
    url: 'http://localhost:1234/v1/chat/completions',
    sleutel: { nodig: false, env: '', waar: 'lmstudio.ai' },
    lokaal: true,
    gratis: true,
    modellen: [],
    standaardModel: '',
  }),

  // Voor alles wat de OpenAI-vorm spreekt maar hier niet bij naam staat:
  // vLLM, llama.cpp, een bedrijfsproxy, een gateway. Adres instellen bij
  // "Ander adres" en klaar.
  openAiCompat({
    id: 'eigen',
    hulp: {
      geenmodellen: [
        'De server antwoordt, maar geeft geen modellen terug.',
        'Sommige servers laten die lijst niet zien. Typ de modelnaam dan gewoon zelf:  /model <naam>',
      ],
      onbereikbaar: [
        'Er antwoordt niets op dit adres.',
        'Zet het juiste adres bij Instellingen → AI-diensten → Ander adres. Meestal eindigt dat op v1/chat/completions.',
        'Vraagt jouw server een sleutel? Zet die met:  /sleutel <je sleutel>',
      ],
    },
    label: 'Eigen server',
    merk: 'OpenAI-compatibel',
    url: 'http://localhost:8000/v1/chat/completions',
    sleutel: { nodig: false, env: 'OPENAI_COMPAT_API_KEY', waar: '' },
    lokaal: true,
    modellen: [],
    standaardModel: '',
  }),
]

function vindProvider(id) {
  return AI_PROVIDERS.find(p => p.id === String(id || '').toLowerCase()) || null
}

// Model uit een `/use claude:opus` of uit de instellingen naar een echt
// model-id vertalen. Een gedeeltelijke naam mag: 'opus' vindt 'claude-opus-5'.
function vindModel(provider, naam, extra) {
  if (!provider) return ''
  const lijst = [...(provider.modellen || []), ...(extra || [])]
  const kaal = String(naam || '').trim().toLowerCase()
  if (!kaal) return provider.standaardModel || (lijst[0] && lijst[0].id) || ''
  const exact = lijst.find(m => m.id.toLowerCase() === kaal)
  if (exact) return exact.id
  const deel = lijst.find(m => m.id.toLowerCase().includes(kaal))
  if (deel) return deel.id
  // Onbekend model toch doorlaten: nieuwe modellen verschijnen sneller dan
  // deze lijst wordt bijgewerkt, en de dienst zegt het zelf wel als het niet kan.
  return String(naam).trim()
}

module.exports = { AI_PROVIDERS, vindProvider, vindModel, openAiCompat }
