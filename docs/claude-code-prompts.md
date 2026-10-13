# Claude Code prompts — Flutter Launcher uitbreidingen

Codebase: `C:\Users\redub\Desktop\Projects\flutter-launcher` (Electron app: `main.js`, `preload.js`, `renderer.js`, `index.html`, `style.css`, `install-fixer.js`).

Open Claude Code in die map en plak per stap één prompt hieronder. Test na elke stap (app herstarten) voor je aan de volgende begint. Auto-fix bij mislukte install/build (clean, pub get, gradle clean, enz. + automatische 2e poging) zit er al volledig in via `install-fixer.js` + `runWithAutofix` in `main.js` — daar hoeft niks aan te gebeuren.

---

## Stap 1 — cmd-knop bij project (makkelijkst, begin hier)

```
In de Electron-app in deze map (main.js, preload.js, renderer.js, index.html, style.css) wil ik een nieuwe knop toevoegen bij het project-paneel, naast de bestaande "openen" (map openen) knop in .proj-header .loc-switcher in renderMain() in renderer.js.

Nieuwe knop "cmd": opent een zichtbaar cmd-venster dat al gecd't is naar het pad van de actieve locatie van het huidige project (dezelfde cwd die ook gebruikt wordt voor het uitvoeren van commando's, dus p.locations[p.activeLocation].path).

Implementatie:
1. main.js: nieuwe ipcMain.handle('shell:openCmd', (_, cwd) => { ... }) die met child_process.spawn een zichtbaar, losstaand cmd-venster opent: spawn('cmd.exe', ['/K', `cd /d "${cwd}"`], { cwd, detached: true, windowsHide: false, shell: false }).unref(). Valideer dat cwd bestaat (fs.existsSync) voor je spawnt, anders false teruggeven.
2. preload.js: expose openCmd: (cwd) => ipcRenderer.invoke('shell:openCmd', cwd) op window.api, in dezelfde stijl als de bestaande openFolder.
3. renderer.js: voeg in de .loc-switcher HTML (naast #btn-open-folder) een knop toe <button class="btn-open-folder" id="btn-open-cmd"><i class="ti ti-terminal-2"></i> cmd</button>, en wire 'm met onclick die window.api.openCmd(activeLoc.path) aanroept (activeLoc is al beschikbaar in renderMain, zelfde variabele die btn-open-folder gebruikt).
4. style.css: hergebruik bestaande .btn-open-folder styling, geen nieuwe classes nodig tenzij je iets wilt onderscheiden.

Zorg dat het consistent aanvoelt met de rest van de dark-mode UI (Tabler icons, bestaande knop-stijlen). Test door de app te herstarten en op de knop te klikken — er moet een cmd-venster openen in de juiste projectmap.
```

---

## Stap 2 — meerdere regels typen in het commando-veld

```
In renderer.js + index.html + style.css van deze Electron-app wil ik het commando-invoerveld (#term-input, nu een <input>) vervangen door een <textarea> zodat gebruikers meerdere regels kunnen typen of plakken zonder fouten, terwijl alle bestaande functionaliteit blijft werken: autocomplete-dropdown (#term-autocomplete), pijltjestoetsen-historie (cmdHistory/historyIndex), Tab-cycling door suggesties, en de run/stop-knop (#term-run-btn, updateRunBtn/updateRunBtnIfVisible).

Vereisten:
1. index.html: vervang <input class="term-input" id="term-input" .../> door een <textarea class="term-input" id="term-input" rows="1" placeholder="commando typen..." autocomplete="off" spellcheck="false"></textarea> binnen dezelfde .term-input-inner wrapper.
2. Auto-resize: de textarea moet automatisch meegroeien met de inhoud (op basis van scrollHeight) tot een max-height van ongeveer 160px, daarna intern scrollen. Voeg hiervoor een helper toe die bij elke 'input' event de height herberekent (reset height naar 'auto', dan zet op scrollHeight, geclamped op de max).
3. Toetsgedrag in setupTerminalInput(project) in renderer.js:
   - Enter (zonder Shift) = submit huidige inhoud (zoals nu), moet e.preventDefault() blijven doen zodat er geen newline wordt ingevoegd bij submit.
   - Shift+Enter = nieuwe regel invoegen (gewoon standaardgedrag van textarea, dus niet preventDefault bij die combinatie).
   - ArrowUp/ArrowDown moeten alleen de bestaande historie/autocomplete-navigatie triggeren als de cursor op de eerste/laatste regel staat EN er geen autocomplete-lijst open is met items — anders normale cursor-navigatie door de tekst toestaan. Simpelste correcte aanpak: alleen ArrowUp/ArrowDown voor historie onderscheppen als input.value geen \n bevat (single-line), anders laat de textarea de cursor gewoon verplaatsen.
   - Tab-gedrag (autocomplete cyclen) blijft ongewijzigd.
4. submitCmd(): als de ingevoerde tekst meerdere niet-lege regels bevat (split op /\r?\n/, filter lege regels), voer ze na elkaar uit: wacht tot executeCmd() van regel 1 klaar is (maak executeCmd's aanroep awaitable / gebruik de Promise die al intern gebruikt wordt) voordat regel 2 start, in plaats van alles in één keer als één shell-string met && te versturen. Voeg elke regel apart toe aan cmdHistory (zelfde dedupe-logica als nu: alleen toevoegen als different van cmdHistory[0]). Toon dus gewoon de bestaande output per commando na elkaar in de terminal, precies zoals wanneer je ze een voor een had getypt.
5. style.css: pas .term-input (en eventueel .term-input-wrap / .term-input-inner) aan zodat een <textarea> er identiek uitziet aan de huidige <input> (zelfde font, padding, geen resize-handle: resize: none, line-height behouden), en groeit netjes binnen de bestaande .terminal-wrap layout zonder de rest van de UI te verschuiven.

Test: typ een enkel commando + Enter (moet als voorheen werken), typ 2-3 regels met Shift+Enter ertussen en druk Enter — elke regel moet na elkaar als apart commando uitgevoerd worden zonder crashes, en de output/terminal-status moet kloppen na afloop.
```

---

## Stap 3 — `--release` schuifje per project onder "tools"

```
In deze Electron Flutter-launcher app wil ik per project een persistente aan/uit-schuifje toevoegen voor --release, zichtbaar in de "tools" sectie van het project-paneel (de .cmd-section met class-label "tools" in renderMain() in renderer.js, met daarin devices/pub-get/clean/doctor/build-apk/build-web/build-windows knoppen).

Scope van de beslissing: de --release schuifje moet alleen invloed hebben op de "uitvoeren"-commando's (run-android, run-windows, run-chrome in de cmd-section met label "uitvoeren"), niet op de build-* commando's (die zijn al standaard release-mode in Flutter, build-apk heeft al --release hardcoded). Dus: als de schuifje aan staat, wordt flutter run -d <device> uitgevoerd met --release erachter; staat hij uit, dan zoals nu zonder flag.

Implementatie:
1. Data-model: voeg een boolean veld `release: false` toe aan het project-object. Pas aan in:
   - main.js: DEFAULT_PROJECTS entries (voeg release: false toe aan elk).
   - renderer.js: saveProjectModal() waar nieuwe projecten aangemaakt worden (projects.push({... , release: false})) — en zorg dat bestaande projecten zonder dit veld gewoon als false/undefined behandeld worden (dus check overal met `p.release === true`, niet met een strikte aanwezigheids-check, zodat oude opgeslagen projects.json zonder dit veld niet breekt).
2. UI: voeg in de "tools" .cmd-section-label regel in renderMain() een toggle-switch toe naast het label "tools", bijvoorbeeld:
   <div class="cmd-section-label-row">
     <div class="cmd-section-label">tools</div>
     <label class="toggle-switch" title="Voegt --release toe aan run-commando's">
       <input type="checkbox" id="toggle-release" ${p.release ? 'checked' : ''} />
       <span class="toggle-slider"></span>
       <span class="toggle-text">--release</span>
     </label>
   </div>
   Er bestaat nog geen toggle-switch CSS in style.css — voeg een nette dark-mode sliding toggle toe (gebruik de bestaande CSS-variabelen zoals --accent en --muted uit style.css voor consistente kleuren), in lijn met de rest van de UI (zelfde als de editor-row checkboxes qua vibe maar dan als schuifje i.p.v. losse checkbox).
3. Gedrag: #toggle-release onchange => p.release = checkbox.checked; saveProjects(); (geen volledige renderMain() nodig, alleen state bijwerken zodat volgende run de juiste flag gebruikt — evt wel renderMain() aanroepen als dat simpeler is en geen rare flicker geeft).
4. runCmd(project, cmdKey) in renderer.js: pas de cmdMap zo aan dat voor 'run-android', 'run-windows' en 'run-chrome' de command string --release krijgt aangeplakt wanneer project.release === true, bijvoorbeeld:
   const releaseFlag = project.release ? ' --release' : ''
   en gebruik dat in de template strings van die drie entries. build-apk/build-web/build-windows blijven ongewijzigd.

Test: zet de schuifje aan bij een project, klik "run windows" en controleer in de terminal-output dat het uitgevoerde commando (de "> ..." regel) --release bevat; zet 'm uit en controleer dat 'ie weer weg is. Herstart de app en controleer dat de stand van de schuifje bewaard is gebleven (uit settings/projects.json).
```

---

## Stap 4 — Update-knop rechtsboven (i.p.v. build-knop)

```
In deze Electron Flutter-launcher app (main.js, preload.js, renderer.js, index.html) staat rechtsboven in de titlebar een knop #btn-build (package-export icoon) die nu window.api.build() aanroept (main.js: ipcMain.handle('app:build', ...) opent een zichtbaar cmd-venster met "npm run build"). Vervang dit door één "Update"-knop met dit gedrag:

1. Klik op Update-knop → bevestigingsdialoog ("App updaten en herstarten? Dit installeert dependencies, bouwt een nieuwe versie en herstart de app.") → bij bevestigen: window.api.updateAndRestart().
2. Nieuwe IPC handler in main.js: ipcMain.handle('app:updateAndRestart', () => { ... }):
   - Bepaal appDir: app.isPackaged ? path.dirname(process.execPath) : __dirname (zelfde patroon als bestaande app:build handler).
   - Schrijf een tijdelijk .bat-bestand (bijv. in os.tmpdir(), naam met timestamp om conflicten te voorkomen) met de volgende stappen, met simpele foutafhandeling (bij een mislukte stap: toon de foutmelding in het cmd-venster en pauzeer met `pause` zodat het venster niet meteen dichtklapt):
     a. `@echo off` + wat labels voor duidelijke voortgang-tekst ("echo Flutter Launcher updaten...", "echo Stap 1/3: dependencies installeren", enz.)
     b. `timeout /t 2 /nobreak >nul` (geeft het hoofdproces tijd om volledig af te sluiten en bestanden vrij te geven)
     c. `cd /d "<appDir>"`
     d. `call npm install` — bij een non-zero exit code: `echo Update mislukt bij npm install & pause & exit /b 1`
     e. `call npm run build` — bij een non-zero exit code: `echo Update mislukt bij npm run build & pause & exit /b 1` (dit bouwt een nieuwe portable .exe in dist/, zie bestaande package.json build-config)
     f. Herstart: als app.isPackaged, start de zojuist gebouwde exe opnieuw op (het pad staat in package.json build.portable.artifactName, dat wordt dist/FlutterLauncher.exe relatief aan de project-root — bepaal dit pad relatief aan appDir of gebruik een vaste variabele die overeenkomt met de bestaande build-config); als niet packaged (dev-modus), start `npm start` opnieuw op in dezelfde map. Gebruik `start "" "<pad-naar-exe-of-npm>"` zodat het los van dit bat-script blijft draaien.
     g. Verwijder zichzelf aan het einde: `del "%~f0"`
   - Spawn dit bat-bestand in een zichtbaar cmd-venster: spawn('cmd.exe', ['/c', 'start', '"Flutter Launcher — Update"', 'cmd', '/k', batPath], { detached: true, windowsHide: false, shell: false }).unref() — gebruik `/k` zodat het venster na afloop (of bij een `pause` in de foutafhandeling) zichtbaar blijft; laat het venster bij succesvolle afronding zichzelf sluiten door aan het eind van het bat-script (na de herstart-stap) `exit` toe te voegen zonder pause.
   - Nadat het bat-bestand gespawned is: app.exit(0) aanroepen (niet app.relaunch(), want het bat-script regelt de herstart) zodat het huidige proces stopt en bestanden/de exe niet meer gelockt zijn tijdens de build.
3. preload.js: expose updateAndRestart: () => ipcRenderer.invoke('app:updateAndRestart').
4. index.html + renderer.js: hernoem/herstyle #btn-build naar #btn-update met een refresh/update-icoon (bijv. ti-cloud-download of ti-refresh i.p.v. ti-package-export), title="Update & herstart — installeert dependencies, bouwt opnieuw en herstart automatisch". Verwijder de oude build-knop-logica (window.api.build() aanroep) en vervang door de nieuwe update-flow met confirm().
5. Laat de bestaande "update & herstart"-knop in de terminal-toolbar (#btn-relaunch, die nu alleen app.relaunch() doet zonder rebuild) met rust — dat is een aparte, snellere "gewoon herstarten zonder rebuild"-actie en blijft nuttig tijdens development.

Test in dev-modus (npm start): klik Update, bevestig, controleer dat er een zichtbaar cmd-venster verschijnt met npm install + npm run build voortgang, dat de launcher zelf afsluit, en dat 'ie na de build automatisch weer opstart. Let op: dit kan een tijdje duren (flutter/electron build), dus zorg dat de UI niet raar aanvoelt tijdens het wachten (de app is toch dicht, dus dat maakt niet uit).
```

---

## Stap 5 — Claude (desktop / Cowork) openen met projectmap

```
In deze Electron Flutter-launcher app kun je per project al editors openen via de "editors" instellingen (settings.editors: cursor, claudeCode, vscode, custom — zie DEFAULT_SETTINGS in main.js, editorDefs in renderSettingsPanel() in renderer.js, en de editor-knoppen in renderMain() die window.api.openEditor({editorPath, cwd}) aanroepen). Ik wil hier "Claude" (de desktop-app/Cowork, niet Claude Code) aan toevoegen als extra optie, die de projectmap gelijk meegeeft.

Achtergrond: Claude Desktop op Windows ondersteunt het claude:// URL-schema. Voor Cowork is er een deep link: claude://cowork/new?folder=<url-encoded-absoluut-pad> — dit opent een nieuwe Cowork-sessie in Claude Desktop met die map als voorgestelde/te bevestigen werkmap (Claude Desktop toont altijd een bevestigingsdialoog voor de map, dat is normaal gedrag en niet iets om te omzeilen). Op Windows test je zo'n link via: start "" "claude://cowork/new?folder=..."

Implementatie:
1. main.js: voeg in DEFAULT_SETTINGS.editors een nieuwe entry toe: claudeDesktop: { enabled: true, path: '' } (geen executable-pad nodig, want het is een URL-scheme, geen los programma-pad — laat het settings-veld gewoon leeg/ongebruikt of hergebruik het niet).
2. main.js: nieuwe ipcMain.handle('cmd:openClaudeDesktop', (_, { cwd }) => { ... }) die valideert dat cwd bestaat, en dan een cmd-venster onzichtbaar aanroept om de deep link te openen: spawn('cmd.exe', ['/c', 'start', '', `claude://cowork/new?folder=${encodeURIComponent(cwd)}`], { windowsHide: true, detached: true, shell: false }).unref(). Let op de juiste quoting: na `start` moet een lege titel-string meegegeven worden ("") voordat de URL komt, anders interpreteert cmd de URL als window-titel.
3. preload.js: expose openClaudeDesktop: (o) => ipcRenderer.invoke('cmd:openClaudeDesktop', o).
4. renderer.js: 
   - In renderSettingsPanel(), editorDefs array: voeg toe { key: 'claudeDesktop', label: 'Claude (desktop)', icon: 'ti-brand-claude', defaultPath: '' }. Omdat dit geen los pad nodig heeft, mag je voor deze rij het pad-invoerveld verbergen of disablen (check op def.key === 'claudeDesktop' net zoals nu al gebeurt voor isCustom) — toon in plaats daarvan een korte uitleg-tekst ("opent Claude Desktop met deze projectmap") in de editor-row.
   - In renderMain(), editorBtns array: voeg toe eds.claudeDesktop?.enabled ? `<button class="cmd-btn editor-claude-desktop" data-editor="claudeDesktop"><i class="ti ti-brand-claude"></i> Claude</button>` : ''.
   - In de editor-knoppen click-handler (main.querySelectorAll('.cmd-btn[data-editor]')): voeg een branch toe die specifiek voor key === 'claudeDesktop' window.api.openClaudeDesktop({ cwd: loc.path }) aanroept in plaats van de bestaande window.api.openEditor({editorPath, cwd}) — de rest (Cursor/Claude Code/VS Code/custom) blijft ongewijzigd via openEditor.
5. style.css: hergebruik bestaande .cmd-btn / .editor-* stijlen, evt. een kleine .editor-claude-desktop variant met een ander accent-kleurtje als je onderscheid wilt met de bestaande "Claude Code"-knop (editor-claude class) zodat gebruikers de twee niet door elkaar halen.

Belangrijk: dit werkt alleen als Claude Desktop op deze Windows-machine geïnstalleerd is en het claude:// url-scheme geregistreerd heeft (gebeurt automatisch bij installatie). Er is geen manier om de bevestigingsdialoog voor de map te omzeilen — dat is een bewuste veiligheidsstap van Claude Desktop zelf, niet iets om in deze app op te lossen.

Test: klik de nieuwe "Claude"-knop bij een project → Claude Desktop moet openen (of naar voren komen) met een nieuwe Cowork-sessie en een bevestigingsvraag voor de projectmap.
```
