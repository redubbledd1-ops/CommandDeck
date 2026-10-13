# AUDIT-REPORT — CommandDeck (Fase 1: alleen onderzoek)

> **Scope van dit rapport.** Dit is Fase 1: onderzoeken, documenteren, rapporteren.
> Er is **geen broncode gewijzigd**. Alle regelnummers verwijzen naar de staat van
> de branch waarop dit rapport is aangemaakt. Het grote renderer-bestand heet in
> deze repo `renderer.js` (18.984 regels); waar de opdracht "render.js" noemt, wordt
> `renderer.js` bedoeld.
>
> **Werkwijze.** De vier lagen uit `PROMPT-cursor.md` zijn aangehouden
> (`main.js` = hoofdproces, `preload.js` = brug, `renderer.js` = venster,
> `*-tools.js` = pure logica). De `.md`-documentatie (`README.md`, `HANDOFF*.md`,
> `TODO*.md`, `PROMPT-cursor.md`, `onderzoek-netwerkschijven.md`) is eerst gelezen
> om te begrijpen hoe onderdelen **bedoeld** zijn. Bevindingen zijn onderbouwd met
> concrete regelverwijzingen; waar iets niet met zekerheid te reproduceren viel,
> staat dat er expliciet bij.

---

## 1. Overzicht van `renderer.js`

`renderer.js` is opgebouwd uit secties die met `// ── Naam ──` gemarkeerd zijn.
Hieronder een kaart met de belangrijkste secties, hun beginregel en waar ze voor
verantwoordelijk zijn. Dit is bedoeld als wegwijzer, niet als volledige lijst.

| Regel | Sectie | Verantwoordelijk voor |
|---|---|---|
| 1 | **State** | Alle globale toestand: `projects`, `settings`, `view`, `activeId`, `termOutput`, AI-sessies, woordenboek-filters, knop-definities (`RUN_CMD_DEFS`, `TOOLS_CMD_DEFS`, `WEB_CMD_DEFS`). |
| 137 | Git-profielen | Git-identiteiten per account/locatie. |
| 785 | Git-toestand per locatie | `gitStaten`, ophalen/verversen git-status per pad. |
| 852 | Klopt de koppeling nog? | `ververesAlleGitStaten`, controle of remote/koppeling nog klopt. |
| 1367 | **Init** | Opstartvolgorde: event-bedrading, `restoreLastView`, timers voor editors-scan (t+900ms), git-polling, resize-listeners. |
| 1529 | Titlebar | Min/max/sluiten, update-knop. |
| **1586** | **Navigatiegeschiedenis** | `navStack`, `navIndex`, `navBezig`, `huidigeLocatie()`, `navPush()`, `pasLocatieToe()`, `navTerug()`/`navVooruit()`, `updateNavKnoppen()`. **Kernpunt voor bugs 1, 2, 4.** |
| 1796 | Vragen stellen | `vraagKeuze()`/`vraagJaNee()` — modale dialogen in app-stijl. |
| 1943 | Rechtsklikmenu | `bouwContextMenu()` voor de verkenner (gebruikt `NoteTools`). |
| 2114 | Klembord voor bestanden | Knippen/kopiëren/plakken via Windows-klembord. |
| 2443 | Selectiekader | Sleep-selectie in de verkenner. |
| 2575 | Suggesties in de adresbalk | Autocompletion voor paden. |
| **2659** | **View router** | `PANELS`, `setView(v)`, `rememberView()`, `restoreLastView()`. **Kernpunt voor bugs 1, 2, 4.** |
| 2740 | Zijbalkbreedte | Slepen/instellen sidebar-breedte (voorbeeld van correcte listener-bedrading met `dataset.bedraad`). |
| 2868 | Sidebar | Zijbalk-opbouw, secties, volgorde, projectlijst. |
| 3513 | **Main panel** | `renderMain()`, knoppenraster (`cmdGridHtml`), `ordenProject()`. **Kernpunt voor bug 5.** |
| 3679 | (in Main panel) `AUTO_MAPPEN` / `maakAutoMappen` / `ordenProject` | Automatische indeling van knoppen in mappen. **Kernpunt voor bug 5.** |
| 3831 | Knoppen weghalen | Verbergen/terugzetten van knoppen; `bedraadKnopWissen()`. |
| 4348 | De locatiekiezer | Dropdown met projectlocaties. |
| 4380 | Krappe balken | `keurKrappeBalken()` + `ResizeObserver` (`volgKrappeVlakken`). |
| 4411 | Herbruikbare terminal | Terminal-DOM die tussen weergaven wordt hergebruikt. |
| 4535 | Werkmap in het invoerveld | Werkmap-prompt in de terminalbalk. |
| 4613 | **Verkenner** | Bestandslijst, selectie, `renderBrowser()`, navigatie tussen mappen. |
| 4654 | (Split-state) `termSplit`, `termSplitFirst`, `werkSlots`, `werkSlotFocus` | **Gesplitste weergave.** Kernpunt voor bugs 1, 2, 4. |
| 4809 | Mapgroottes | Achtergrondmeting van mapgroottes (`startMapGroottes`, `meetLijst`). |
| 5040–6600 | (Split-logica) | `splitAan()`, `splitGemengd()`, `splitTweeProjecten()`, `plaatsInSplit()`, `sluitSplitVoorView()`, `focusWerkSlot()`, `setTermTab()`, split-persistentie. |
| 6789 | CMD panel | Losse cmd-sectie. |
| 7309 | PowerShell panel | Losse powershell-sectie. |
| 7391 | Woordenboek | Commando-woordenboek + eigen thema's. |
| 8087 | Bat-bestanden | Bat-editor/paneel. |
| 8970 | Tekstnotities | Notitie-paneel (`NoteTools`). |
| 9864 | Een bestand bekijken en bewerken | Lees-/bewerkpaneel (web-editor). |
| 10011 | Kleuren in de editor | `CodeKleuren.verf()` — syntax highlighting. |
| 10426 | Lichte aanvulling | Autocompletion html/css/js (`lezer-aanvul.js`). |
| 10789 | Een map die op de app is neergezet | Sleep-op-app afhandeling. |
| 10914 | Commando als knop aan project hangen | Eigen knoppen. |
| 10965 | Settings panel / Accounts | Instellingen + accounts. |
| 11864 | Kleurinstellingen | Thema/kleuren. |
| 12469 | Instellingen: AI-diensten | AI-configuratie. |
| 12887 | **Gevonden editors aanbieden** | `zoekEditors()`, `voegGevondenEditorsAutomatischToe()`. **Kernpunt voor bug 5.** |
| 13011 | Programmakiezer | Programma's uit het startmenu kiezen. |
| 13066 | Terminal | Terminal-weergave. |
| 13268 | Run command | Commando's uitvoeren. |
| 13537 | De boom onder "deze pc" | `renderBoom()` — mappenboom. |
| 14434 | Echte terminal in het venster | pty-terminal (`@lydell/node-pty`). |
| 14628 | **AI-gesprek in het uitvoervenster** | AI-streaming (`aiStroomStuk`, `aiStroomBewaar`), `aiVraag`. Kernpunt voor bug 3 (AI-tak). |
| 15677 | Commando's die een echt venster nodig hebben | Losse consolevensters. |
| 15869 | Een blijven-staan slot | Wacht-op-venster-logica. |
| 16088 | Onveilig git-werk | Controle vóór afsluiten/accountwissel. |
| 16446 | Git-knoppen | Git-acties. |
| 16724 | Branches | Branch-beheer. |
| 17544 | Terminal input | `setupTerminalInput()` — invoerveld/toetsen. |
| 17844 | Modal: Add / Edit project | Projectvenster. |
| 18865 | Geschiedenis / Focus / Helpers | Recente uitvoeringen, focusbeheer, hulpfuncties. |

**Belangrijk mentaal model voor de navigatie-bugs.** Er is **één** globale
`view` (`'project' | 'cmd' | 'ps' | 'dict' | 'bat' | 'text' | 'settings'`) plus een
**parallel** split-model (`werkSlots`, `termSplitFirst`, `werkSlotFocus`) dat de
`view` gedeeltelijk buitenspel zet zodra een split actief is. De
navigatiegeschiedenis kent alleen de eerste (`view`, `projectId`, `tab`, `dir`) en
weet niets van het tweede. Vrijwel alle gerapporteerde navigatieproblemen komen
hieruit voort.

---

## 2. Gevonden problemen

### Bug 1 — Navigeren tussen Split-modus en andere projecten/instellingen gaat mis

- **Zichtbaar probleem:** Wisselen tussen de gesplitste weergave en een ander
  project of de instellingenpagina levert soms een verkeerde of half-opgebouwde
  staat op (split blijft onterecht staan, of wordt onterecht afgebroken).
- **Vermoedelijke oorzaak:** De navigatiegeschiedenis legt de split-state niet
  vast. `huidigeLocatie()` (renderer.js **1594–1600**) bewaart alleen
  `{ view, projectId, tab, dir }`; niet `termSplit`, `termSplitFirst`, `werkSlots`
  of `werkSlotFocus`. Bij terug/vooruit reconstrueert `pasLocatieToe()`
  (**1622–1642**) daarom via de *huidige, levende* split-state, niet via de
  historische. Bovendien breekt `setView()` bij een terugkeer naar `'project'` een
  gemengde/tweeproject-split geforceerd af via `sluitSplitVoorView()`
  (**2695–2699**), terwijl de historie die split nooit heeft vastgelegd. Naar
  `settings` gaan (**2674–2682**) laat `werkSlots`/`termSplit` in het geheugen
  staan (geen `sluitSplitVoorView`), zodat `splitAan()` waar blijft op de
  instellingenpagina en de terugkeer asymmetrisch is.
- **Betrokken bestanden/functies:** `renderer.js` — `huidigeLocatie`,
  `zelfdeLocatie`, `pasLocatieToe` (1594–1642); `setView` (2665–2713);
  `plaatsInSplit` (5443–5501); `sluitSplitVoorView` (~5410–5431); `toggleSettings`
  (3503–3510).
- **Reproduceerbaar?** Ja, langs de code te volgen; met de hand het duidelijkst zo:
  (1) open een gemengde split (bv. project + woordenboek), (2) ga naar
  Instellingen, (3) klik Terug of ga terug naar het project → de split wordt anders
  hersteld dan hij bij het verlaten stond. Exacte visuele reproductie vergt de GUI
  (Fase 2, debug-subagent aanbevolen).
- **Vertrouwen in de diagnose:** **Hoog** — de ontbrekende velden en de
  `setView`/`plaatsInSplit`-routering volgen rechtstreeks uit de code.
- **Voorgestelde oplossing (kleinst mogelijk):** Neem de split-configuratie op in de
  navigatie-entry (`huidigeLocatie` + `zelfdeLocatie`) en herstel die in
  `pasLocatieToe`. Alternatief/aanvullend: sla bij het betreden van `settings` de
  split-state op en herstel hem symmetrisch bij terugkeer, in plaats van hem
  impliciet te laten afbreken.
- **Risico op neveneffecten:** **Middel** — navigatie en split raken veel plekken;
  wijzigingen zorgvuldig aftesten met `test/ui.test.js` en met de hand.

---

### Bug 2 — Terug/Volgende werkt niet correct op sommige pagina's

- **Zichtbaar probleem:** De knoppen Terug/Volgende doen niets of springen naar de
  verkeerde staat op bepaalde pagina's.
- **Vermoedelijke oorzaak:** Meerdere samenwerkende oorzaken:
  1. `zelfdeLocatie()` (**1603–1606**) vergelijkt alleen `view/projectId/tab/dir`.
     Verandert er alleen split-indeling of de instellingen-subpagina, dan ziet
     `navPush()` (**1608–1611**) "dezelfde locatie" en slaat de push over — de stack
     loopt uit de pas met de UI.
  2. Split openen/sluiten (`zetTermSplit`, ~5856) en het wisselen van het actieve
     slot (`focusWerkSlot`, ~5409) roepen **geen** `navPush()` aan. De zichtbare
     staat verandert wél, de historie niet.
  3. De subpagina Talen binnen Instellingen (`settingsSubPage = 'talen'`, **12258**)
     zit niet in de historie.
  4. `navTerug`/`navVooruit` (**1645–1654**) passen `navIndex` aan **vóór** de
     `await pasLocatieToe(...)` en zonder terugrol bij een fout, en zonder
     re-entrancy-bescherming. `updateNavKnoppen()` (**1657–1661**) kijkt alleen naar
     de index-grenzen, dus de knoppen kunnen "actief" lijken terwijl de stap niets
     zinnigs doet.
- **Betrokken bestanden/functies:** `renderer.js` — `zelfdeLocatie`, `navPush`,
  `navTerug`, `navVooruit`, `updateNavKnoppen` (1603–1661); `zetTermSplit`,
  `focusWerkSlot`, `plaatsInSplit` (split-sectie); `renderTalenSubPage`/
  `settingsSubPage` (12008, 12258).
- **Reproduceerbaar?** Deels langs de code; met de hand: open/sluit een split of
  open de Talen-subpagina en probeer Terug — de stap ontbreekt of klopt niet.
- **Vertrouwen in de diagnose:** **Hoog** voor punten 1–3, **middel-hoog** voor 4.
- **Voorgestelde oplossing (kleinst mogelijk):** Voeg split-state en
  `settingsSubPage` toe aan `huidigeLocatie`/`zelfdeLocatie`; roep `navPush()` aan
  bij split-toggle en slot-focus; pas `navIndex` pas aan **na** een geslaagde
  `pasLocatieToe`.
- **Risico op neveneffecten:** **Middel** — zelfde navigatiekern als bug 1.

---

### Bug 3 — De app loopt soms volledig vast

- **Zichtbaar probleem:** De app bevriest af en toe volledig.
- **Vermoedelijke oorzaak:** Er is **geen enkele** definitieve, met zekerheid
  gereproduceerde oorzaak gevonden; wel meerdere reële kandidaten. Op volgorde van
  waarschijnlijkheid:
  1. **Event listeners die zich opstapelen bij herhaald bedraden.** Diverse
     bedraadfuncties missen de dedup-guard die elders wél wordt gebruikt
     (vergelijk `bedraadZijbalkBreedte` **2844–2847** met `greep.dataset.bedraad`,
     en `wireWerkSplit` met `dataset.wired`). Zonder guard bedraden:
     `wireTermSplit` (**6167**), `bedraadVerkennerHost` (**6601**),
     `setupTerminalInput` (**17611**). Blijft het bijbehorende DOM bestaan over een
     her-bedrading heen (i.p.v. via `innerHTML` vervangen), dan stapelen
     `mousemove`/`pointerenter`/`input`-handlers en draait elke muisbeweging of
     toetsaanslag N keer → oplopende traagheid tot vastlopen. **Vertrouwen: middel**
     (afhankelijk van of het DOM telkens vervangen wordt).
  2. **`await window.api.aiStuur(...)` zonder wall-clock-timeout** (**14837–14846**;
     hoofdproces `ai-runtime.js` gebruikt een `while (true) await lezer.read()` met
     alleen een `AbortController` bij expliciete stop). Een blijvend hangende
     netwerk-stream laat `s.bezig = true` staan; verdere AI-verzoeken worden
     geblokkeerd en de weergave blijft "bezig". **Vertrouwen: middel-hoog** voor de
     AI-flow (niet per se een totaal-freeze van de hele app).
  3. **`aiStroomBewaar()`** (**14749–14752**) haalt elke ~250 ms de **volledige**
     lopende tekst opnieuw door `esc()`. Bij lange antwoorden pieklast op de
     hoofdthread. Het commentaar bij **14726–14728** erkent het O(n²)-risico voor de
     DOM, maar de bewaar-tak doet nog steeds de volledige re-escape. **Vertrouwen:
     laag-middel.**
  4. **`ResizeObserver` ↔ `keurKrappeBalken()`** (**4393–4408**): het toggelen van
     de klasse `krap` verandert de layout, wat de observer opnieuw kan laten vuren →
     meet/toggle-terugkoppeling onder krappe breedtes. **Vertrouwen: middel.**
  5. **`verfLezer`/`CodeKleuren.verf()`** (**10055–10069**): synchrone syntax-
     highlighting over de hele buffer bij het typen; grote bestanden kunnen de UI
     blokkeren ondanks de 90 ms-debounce. **Vertrouwen: middel** (grote bestanden).
  6. **`renderBrowser()`** (**6411–6495**): bouwt tot 800 rijen als één HTML-string
     en bindt daarna handlers; samen met een eventueel gedupliceerde filter-listener
     (kandidaat 1) vermenigvuldigt de kosten per toetsaanslag. **Vertrouwen:
     middel.**
- **Betrokken bestanden/functies:** zie regelverwijzingen hierboven; voor de
  AI-tak ook `ai-runtime.js` (de leeslus zonder timeout).
- **Reproduceerbaar?** **Niet betrouwbaar** in Fase 1 zonder interactieve GUI en
  zonder een concrete trigger. Aanbeveling voor Fase 2: de **debug-subagent**
  inzetten met instrumentatie (tellers op de her-bedrading, timing rond `aiStuur`
  en `verfLezer`) om de daadwerkelijke trigger vast te leggen vóór er een fix komt.
- **Vertrouwen in de diagnose:** **Laag-middel** dat één van bovenstaande dé oorzaak
  is; **hoog** dat het reële risicoplekken zijn.
- **Voorgestelde oplossing (per kandidaat, kleinst mogelijk):**
  - Dedup-guards (`dataset.bedraad`) toevoegen aan `wireTermSplit`,
    `bedraadVerkennerHost`, `setupTerminalInput`, of ze pas bedraden ná een
    gegarandeerde `innerHTML`-vervanging.
  - Een wall-clock-timeout/afbreekpad op `aiStuur` (en de leeslus in
    `ai-runtime.js`).
  - `aiStroomBewaar` incrementeel bijwerken i.p.v. de volledige tekst re-escapen.
  - De `ResizeObserver`-callback ontkoppelen van layout-mutaties (bv. via
    `requestAnimationFrame` + guard, of meten zonder in dezelfde beurt te toggelen).
- **Risico op neveneffecten:** **Laag-middel** per losse fix; elke kandidaat is
  klein en geïsoleerd aan te pakken.

---

### Bug 4 — Soms lukt het niet om naar een volgende/specifieke pagina te navigeren

- **Zichtbaar probleem:** Een klik naar een andere pagina/project lijkt niets te
  doen.
- **Vermoedelijke oorzaak:**
  1. Tijdens `pasLocatieToe()` staat `navBezig = true` (**1623**) en worden **alle**
     `navPush()`-aanroepen genegeerd (**1609**). Klikt de gebruiker tijdens het
     `await navigeerNaar(loc.dir)` (**1635**), dan wordt die actie visueel wél
     toegepast maar niet in de historie opgenomen — daarna voelt Terug/Volgende
     "vast".
  2. `navPush()` doet niets als `zelfdeLocatie()` waar is (**1611**). Verandert de
     UI nauwelijks (bijv. dezelfde `view`+`projectId`+`tab`), dan lijkt de klik
     genegeerd.
  3. Upstream-poorten kunnen een projectselectie tegenhouden vóórdat de
     view-wissel plaatsvindt: `controleerLezerWerk`/`controleerOnveiligWerk`
     (rond `selectProject`, ~3429) en de wachtlussen `wachtOpVrijVenster`
     (**15972**) / `wachtOpOnveiligWerk` (**16101**). Blijft zo'n vlag hangen, dan
     lukt navigeren niet.
  Ter geruststelling: `navBezig` kan **niet** permanent blijven staan — het wordt
  in een `finally` gewist (**1638–1641**), ook als er een fout optreedt. En
  `plaatsInSplit()` heeft **geen** stille lege-return die "niets doen" verklaart
  (elke tak muteert of navigeert); de oorzaak zit dus in bovenstaande punten, niet
  in `plaatsInSplit` zelf.
- **Betrokken bestanden/functies:** `renderer.js` — `navBezig`/`navPush`/
  `pasLocatieToe` (1608–1642); `selectProject` en de controle-/wachtfuncties
  (~3429, 15972, 16101).
- **Reproduceerbaar?** Deels; het `navBezig`-venster is timing-afhankelijk (klik
  tijdens een langzame `navigeerNaar` op een trage map/netwerkschijf).
- **Vertrouwen in de diagnose:** **Middel-hoog.**
- **Voorgestelde oplossing (kleinst mogelijk):** Heroverweeg het `navBezig`-venster
  (bv. gebruikersnavigatie tijdens een lopende toepassing negeren of netjes in de
  wachtrij zetten), en bescherm `navTerug`/`navVooruit` tegen gelijktijdige
  aanroepen. Overweeg zichtbare terugkoppeling wanneer een poort (onveilig werk) de
  navigatie blokkeert.
- **Risico op neveneffecten:** **Middel** — zelfde navigatiekern.

---

### Bug 5 — Snelkoppelingen belanden buiten een map terwijl ze erin horen

- **Zichtbaar probleem:** Onder *Project > Knoppen* staan sommige snelkoppelingen
  los, terwijl ze — met mappen aan — in de bijbehorende map zouden moeten staan. Een
  nieuw gevonden programma hoort automatisch in de juiste map te komen.
- **Vermoedelijke oorzaak (hoofdoorzaak, hoog vertrouwen):** De automatische
  indeling maakt pas een **nieuwe** map aan als er **twee of meer** losse knoppen
  van dezelfde soort zijn. In `knoppenrij.js` `maakAutoMappen()` (**285–312**):
  ```
  if (!f) {
    if (hoort.length < 2) continue   // regel 297–298
    f = { id: nieuwMapId(), sectie: rij.sectie, label: soort.label, open: true, auto: soort.auto }
    ...
  }
  ```
  Eén enkel nieuw gevonden programma blijft dus **los** zolang er nog geen
  programma-map (`auto: 'prog'`) bestaat. Dit is bewust ontworpen ("één knop in een
  eigen map is lawaai", commentaar **281–283**), maar botst met de gewenste regel
  "een nieuw gevonden programma komt automatisch in de juiste map".
- **Waar het scanresultaat landt:** `voegGevondenEditorsAutomatischToe()`
  (renderer.js **12943–12950**) voegt gevonden editors alleen toe aan de **globale**
  `settings.customEditors` en zet zélf **geen** `cmdFolderVan` (geen mapkoppeling).
  De indeling gebeurt pas later, per project, via `ordenProject()` → `maakAutoMappen`
  bij `renderMain()` (**3723–3728**, **4117–4119**). `maakCustomEditor()`
  (**332–340**) maakt enkel een settings-entry aan.
- **Inconsistentie tussen tekenen en opslaan:** De programma-soort heeft
  `fallbackAuto: 'ai'` (renderer.js **3682**). Bij het *tekenen* respecteert
  `autoMapVoor()` die fallback (knoppenrij.js **97–105**), maar bij het *aanmaken/
  plaatsen* zoekt `maakAutoMappen` alleen op de exacte `soort.auto` (**296**). Een
  programma-knop kan daardoor bij het tekenen in de AI-map lijken te vallen, terwijl
  er niets persistent wordt vastgelegd.
- **Nieuw vs. bestaand item:** **Beide** zijn mogelijk. *Nieuw:* geen map aangemaakt
  door de ≥2-drempel. *Bestaand kan "eruit vallen":* bij het opheffen van een map
  (`hefMappen`, **263–274**), of als een custom-editor-id verandert door
  `ontdubbelCustomEditors()` (**410–420**, via `verkiesEditor` **402–408** die de
  id van de "winnaar" overneemt) — dan verwijst de oude `cmdFolderVan`/`cmdVolgorde`
  naar een id dat niet meer bestaat, en valt de knop terug op auto-afleiding (vaak
  vangnet, maar niet als de doelmap ontbreekt).
- **Over de vermoede race-condition:** Binnen één scan-callback is er **geen**
  klassieke race: `ordenProject` draait vóór `cmdGridHtml` in dezelfde
  `renderMain`-keten. Wél een timing-aspect: de scan draait bij het opstarten pas op
  t+900 ms (`setTimeout(... zoekEditors ...)`, **1437**); ben je op dat moment niet
  in projectweergave, dan wordt de indeling uitgesteld tot terugkeer
  (`vraagProjectHertekenen` → `projectWeergaveAchterhaald`, **5112–5114**). Dat wordt
  ingehaald, dus de race is **niet** de primaire oorzaak (laag vertrouwen).
- **Betrokken bestanden/functies:** `knoppenrij.js` — `maakAutoMappen`,
  `autoMapVoor`, `mapVanKnop`, `hefMappen` (85–312); `renderer.js` — `AUTO_MAPPEN`,
  `ordenProject`, `maakAutoMappen`-wrapper (3679–3728), `voegGevondenEditors*`,
  `maakCustomEditor`, `ontdubbelCustomEditors`, `verkiesEditor` (332–420,
  12943–13000).
- **Reproduceerbaar?** Ja, langs de code: een project met mappen aan, waar één nieuw
  programma verschijnt terwijl er nog geen `prog`-map is → het programma blijft los.
- **Vertrouwen in de diagnose:** **Hoog** voor de ≥2-drempel als hoofdoorzaak;
  **middel** voor de "bestaand valt eruit"-scenario's.
- **Voorgestelde oplossing (kleinst mogelijk):** Laat, wanneer mappen voor een
  project actief zijn, ook een **enkel** nieuw gevonden programma in de juiste map
  vallen — hetzij door de drempel te versoepelen wanneer er al mappen bestaan,
  hetzij door de scan het item expliciet in de map te laten plaatsen. Laat
  daarnaast `maakAutoMappen` de `fallbackAuto` respecteren bij het vinden van een
  bestaande map (gelijktrekken met `autoMapVoor`). Behoud het bewuste "geen map voor
  één losse knop"-gedrag waar geen enkele relevante map bestaat.
- **Risico op neveneffecten:** **Middel** — auto-indeling raakt git-/AI-/flutter-/
  web-knoppen breed. Dek de wijziging af met `test/knoppenrij.test.js` (dat nu
  `editor:custom:`-items **niet** test) en `test/ui.test.js`.

---

### Bug 6 (zelfstandig gevonden) — Twee losse `resize`-listeners

- **Zichtbaar probleem:** Geen direct zichtbaar defect; dubbele layout-arbeid per
  vensterresize.
- **Vermoedelijke oorzaak:** In `init` worden twee aparte
  `window.addEventListener('resize', ...)` geregistreerd: **1425–1430**
  (`pasZijbalkBreedteToe`, `updateTermPlaceholder`, `plaatsStatus`,
  `planSplitPlusVervers`) en **1512–1514** (`pasPtyMaatAan`). Ze draaien allebei bij
  elke resize.
- **Betrokken bestanden/functies:** `renderer.js` init-blok (1425, 1512).
- **Reproduceerbaar?** Ja (statisch aanwijsbaar). Effect is prestatie, geen
  correctheid.
- **Vertrouwen in de diagnose:** **Hoog** dat er twee zijn; **laag** dat het merkbaar
  hindert.
- **Voorgestelde oplossing:** Samenvoegen tot één resize-handler. Mogelijk bewust
  gescheiden (pty-maat apart) — zie Twijfelgevallen.
- **Risico op neveneffecten:** **Laag.**

---

### Bug 7 (zelfstandig gevonden) — Test-harnas `test/ui.test.js` laadt niet dezelfde scripts als de app

- **Zichtbaar probleem:** `test/ui.test.js` faalt met
  `ReferenceError: NoteTools is not defined` (in `bouwContextMenu`, renderer.js
  **2003**; `NoteTools` wordt daar en o.a. op **6525** aangeroepen). `node test/ui.test.js`
  eindigt met exitcode 1.
- **Vermoedelijke oorzaak:** De harnas evalueert in `test/ui.test.js` (**415–421**)
  wél `i18n.js`, `git-tools.js`, `web-tools.js`, `code-kleuren.js`, `knoppenrij.js`,
  `accounts.js` en `renderer.js`, maar **niet** `note-tools.js`, `web-knoppen.js` en
  `lezer-aanvul.js` — terwijl `index.html` die drie wél laadt (**449–451**). Zodra
  een testpad code raakt die `NoteTools` (of `WebKnoppen`) gebruikt, ontstaat een
  `ReferenceError`.
- **Belangrijk onderscheid:** Dit is een **test-infrastructuur-gat**, geen app-bug:
  in de echte app is `NoteTools` via `index.html` geladen en werkt het
  rechtsklikmenu. Gevolg is wél dat grote delen van `renderer.js` (rechtsklikmenu,
  notities, webknoppen) in de huidige harnas **ongetest** zijn — wat haaks staat op
  het uitgangspunt uit `PROMPT-cursor.md` ("test wat een mens doet ... `ui.test.js`
  draait de hele renderer in jsdom").
- **Betrokken bestanden/functies:** `test/ui.test.js` (415–421); `index.html`
  (449–451); `renderer.js` (2003, 6525, en ~40 andere `NoteTools`-aanroepen).
- **Reproduceerbaar?** Ja, deterministisch: `node test/ui.test.js`.
- **Vertrouwen in de diagnose:** **Hoog.**
- **Voorgestelde oplossing:** In de harnas ook `note-tools.js` (en waar nodig
  `web-knoppen.js`/`lezer-aanvul.js`) evalueren, in dezelfde volgorde als
  `index.html`. **Let op:** dit is een testwijziging, geen broncode — buiten de
  strikte "geen wijzigingen"-scope van Fase 1, dus hier alleen gerapporteerd.
- **Risico op neveneffecten:** **Laag** (alleen test-harnas).

---

### Bug 8 (zelfstandig gevonden) — Verouderde bron-assertie in `test/ai.test.js`

- **Zichtbaar probleem:** `test/ai.test.js` faalt op de controle
  "AI-programmaknoppen verdwijnen als de editor er al staat" (**318–319**),
  waardoor `node test/ai.test.js` exitcode 1 geeft.
- **Vermoedelijke oorzaak:** De test eist dat de bron zowel
  `function aiDienstenOpProject(` **als** een aanroep `aiDienstenOpProject()`
  **zonder argument** bevat. In `renderer.js` bestaat de functie wél (**15131**),
  maar ze wordt overal mét argument aangeroepen (`aiDienstenOpProject(bron)`
  **1044**, `aiDienstenOpProject(p)` **1220**, `aiDienstenOpProject(ctx)` **1347**).
  De regex `/aiDienstenOpProject\(\)/` matcht daardoor niet meer.
- **Belangrijk onderscheid:** Dit is **test-drift** (de test is achtergebleven bij
  een gewijzigde functiesignatuur), geen app-bug. Het gedrag "AI-knoppen verdwijnen
  als de editor er al staat" is niet inhoudelijk getest, alleen via een
  bron-regex die nu onjuist is.
- **Betrokken bestanden/functies:** `test/ai.test.js` (318–319); `renderer.js`
  (15131 + aanroepen 1044, 1220, 1347).
- **Reproduceerbaar?** Ja, deterministisch: `node test/ai.test.js`.
- **Vertrouwen in de diagnose:** **Hoog.**
- **Voorgestelde oplossing:** De bron-assertie bijwerken naar de huidige signatuur,
  of — beter — vervangen door een gedragscontrole. Ook dit is een **testwijziging**,
  buiten de Fase 1-scope; hier alleen gerapporteerd.
- **Risico op neveneffecten:** **Laag** (alleen test).

---

### Bug 9 (zelfstandig gevonden) — `rememberView` bewaart geen split; herstel loopt via een apart pad

- **Zichtbaar probleem:** Na herstart kan de split-weergave anders terugkomen dan
  hij was.
- **Vermoedelijke oorzaak:** `rememberView()` (**2716–2725**) bewaart alleen
  `{ view, projectId }` in `settings.lastView`. De split wordt via een apart
  mechanisme hersteld (`herstelWerkSplitNaStart`, aangeroepen op **1421**, en de
  split-persistentie rond 5520–5620 / 5800–5880). Twee bronnen van waarheid voor
  "waar was ik" kunnen uiteenlopen (zie ook bug 1).
- **Betrokken bestanden/functies:** `renderer.js` — `rememberView`,
  `restoreLastView` (2716–2738); `herstelWerkSplitNaStart` (1421) en split-
  persistentie.
- **Reproduceerbaar?** Deels; vergt herstart met een actieve gemengde split.
- **Vertrouwen in de diagnose:** **Middel.**
- **Voorgestelde oplossing:** Eén bron van waarheid voor herstel bij opstart
  (split-state meenemen in `lastView`, of expliciet documenteren welk pad wint).
- **Risico op neveneffecten:** **Middel** (opstartpad).

---

## 3. Twijfelgevallen

Dingen die vreemd of fout **lijken**, maar mogelijk bewust zo zijn. **Niet
aanpassen** zonder overleg.

1. **De ≥2-drempel in `maakAutoMappen` (knoppenrij.js 297).** Expliciet
   gedocumenteerd als bewuste keuze ("één knop in een eigen map is lawaai",
   281–283). Toch botst dit met de gewenste regel uit de opdracht. Twijfel: telt dit
   als bug of als bewust ontwerp? Zie bug 5 — de spanning zit precies hier.

2. **`navBezig` dat `navPush` blokkeert tijdens toepassen (1609, 1623).** Bewust
   bedoeld om te voorkomen dat het herstellen zichzelf opnieuw opslaat. Of het
   negeren van gebruikersnavigatie in dat venster ook bedoeld is, is onduidelijk —
   het kan een bewuste keuze zijn of een onbedoeld neveneffect (zie bug 4).

3. **Twee gescheiden `resize`-listeners (1425, 1512).** Mogelijk bewust apart
   gehouden omdat de tweede specifiek de pty-maat bijwerkt en de eerste de layout.
   Twijfel: samenvoegen kan de volgorde/afhankelijkheid subtiel veranderen.

4. **UNC-/`pushd`-omhulsel zonder `popd` (git-tools.js, `main.js`).** Ziet er
   "onopgeruimd" uit, maar is **duur betaald met metingen** en expliciet
   gedocumenteerd in `HANDOFF-netwerkschijven.md` ("Geen `popd` achter een
   pushd-omhulsel", "`&&` en niet `&`"). **Bewust — niet aankomen.**

5. **`[hidden] { display: none !important; }` bovenaan `style.css`.** Ziet eruit als
   een grove hack, maar is bewust (zie `PROMPT-cursor.md`: zonder `!important` doet
   `element.hidden = true` niets bij selectors met een eigen `display`).

6. **`bat:save` dwingt CRLF af.** Lijkt inconsistent met de web-editor, maar is
   bewust vanwege `cmd.exe`; voor html/css/js loopt het opslaan daarom via een ander
   pad (`fs:schrijfTekst`). Documentatie: `PROMPT-cursor.md`, `TODO-web.md`.

7. **`aiStroomBewaar` re-escaped de hele tekst (14752).** Het commentaar erboven
   suggereert dat de auteur het O(n²)-risico kent en incrementeel appenden voor de
   DOM heeft gekozen; of de bewaar-tak bewust "goed genoeg" is geacht, is niet
   zeker. Zie bug 3, kandidaat 3.

8. **Falende tests `ui.test.js`/`ai.test.js` (bugs 7 en 8).** Dit zijn test-drift /
   harnas-gaten, geen app-defecten. Twijfel of ze onder deze audit-scope vallen; ze
   zijn hier gerapporteerd omdat ze de betrouwbaarheid van "groen zijn de tests"
   ondermijnen — een expliciet uitgangspunt in `PROMPT-cursor.md`.

---

## Samenvatting

| # | Probleem | Hoofdverdachte (bestand:regel) | Vertrouwen |
|---|---|---|---|
| 1 | Split ↔ project/instellingen navigeren gaat mis | `renderer.js` huidigeLocatie 1594; setView 2695–2702; settings 2674 | Hoog |
| 2 | Terug/Volgende werkt niet overal | `renderer.js` zelfdeLocatie 1603; geen navPush bij split-toggle/slot-focus | Hoog |
| 3 | App loopt soms vast | listener-opbouw 6167/6601/17611; aiStuur-timeout 14837; ResizeObserver 4393 | Laag-middel |
| 4 | Kan soms niet navigeren | `navBezig`-venster 1609/1623/1635; upstream-poorten | Middel-hoog |
| 5 | Knop buiten map i.p.v. erin | `knoppenrij.js` maakAutoMappen 297 (≥2-drempel) | Hoog |
| 6 | Dubbele resize-listener | `renderer.js` 1425 + 1512 | Hoog (bestaan) |
| 7 | ui.test laadt niet alle scripts | `test/ui.test.js` 415–421 vs `index.html` 449–451 | Hoog |
| 8 | ai.test verouderde bron-regex | `test/ai.test.js` 318–319 | Hoog |
| 9 | rememberView bewaart geen split | `renderer.js` 2716; herstel via 1421 | Middel |

**Aanbeveling voor Fase 2.** Begin met de navigatiekern (bugs 1, 2, 4): die delen
één oorzaak — de historie kent de split-state niet — en één zorgvuldige uitbreiding
van `huidigeLocatie`/`zelfdeLocatie`/`pasLocatieToe` plus `navPush`-aanroepen bij
split-toggle/slot-focus dekt het grootste deel. Voor bug 3 is de **debug-subagent**
met instrumentatie aan te raden vóór een fix. Bug 5 is los en goed af te dekken met
`knoppenrij.test.js`. Bugs 7 en 8 zijn testonderhoud dat het beste vóór de rest
wordt gedaan, zodat "groen" weer betekenis krijgt.
