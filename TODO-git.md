# TODO — Git-functie voor CommandDeck

Eén samenhangend document. Drie delen (A, B, C), verdeeld over vijf rondes.
Elke ronde is los af te maken en te gebruiken.

---

## In het kort

| Deel | Wat | Ronde | Stand |
|---|---|---|---|
| **A** | Git-snelknoppen per project | 1, 2, 4 | ronde 1 en 2 af |
| **B** | Branch- en status-indicator in de projectkop | 3 | volgende |
| **C** | Afsluitcontrole: niet-gecommit / niet-gepusht werk | 5 | |

De cache uit deel B is de basis voor deel C. Bouw dus B vóór C.

---

## 0. Voorwerk — klaar

- CommandDeck staat onder Git (`main`, eerste commit).
- `.gitignore`: `node_modules/`, `dist/`, logs, `_to_delete/`, `*.lnk`.
- `.gitattributes`: `* text=auto` — regeleindes worden genormaliseerd (LF in de
  repo, CRLF in je working copy). Zonder dit ziet een tweede machine álle
  bestanden als gewijzigd.

Beide projecten staan op GitHub (privé). Resume als `redubbledd1-ops/Resume`.

## 0b. Ronde 1 en 2 — gebouwd

De knoppen staan in **uitvoeren**, niet in tools. Reden: `bepaalToolsVoorProject`
(main-kant `renderer.js`) verbergt de tools-sectie standaard bij een
niet-Flutter-project, en juist daar wil je git-knoppen — CommandDeck zelf is
Electron.

Welke knoppen je ziet, hangt af van wat ze nodig hebben:

| Toestand | Knoppen |
|---|---|
| geen repo | `github koppelen` |
| repo, geen remote | `github koppelen` + status, commit, stash, log |
| gekoppeld | alles behalve koppelen |

Commit hoort bewust al bij een repo zónder remote. In de eerste opzet niet, en
toen stuurde de koppel-dialoog je naar "maak eerst een commit" zonder dat er
een commit-knop was.

`git-tools.js` (nieuw) is de enige bron voor de knoppen, de commando's en de
beslislogica. Wordt geladen via `require()` (main.js, tests) én via een
`<script>`-tag in index.html, vóór renderer.js.

De statusparser leest `git status --porcelain=v2 --branch`: branch, upstream,
vooruit/achter en de vuile bestanden in één aanroep. **Dat is de basis voor
ronde 3** — de cache hoeft alleen nog periodiek ververst te worden.

Wat nog niet af is aan deel A: ronde 4 (per-project aan/uit staat er al via de
bestaande cmdVisibility, maar de instellingen-lijst toont knoppen die in dit
project niet kunnen verschijnen — die zou je moeten doorstrepen met een reden).

---

## A. Git-knoppen per project

Snelknoppen in de tools-sectie van een project, naast de Flutter-knoppen.
Ze draaien op het pad van de **actieve locatie**, en verschijnen alleen als die
map een git-repo is.

### Ronde 1 — lezen (veilig, geen bevestiging nodig)

| id | label | commando | icoon |
|---|---|---|---|
| `git-status` | git status | `git status -sb` | `ti-git-branch` |
| `git-pull` | git pull | `git pull --ff-only` | `ti-arrow-down` |
| `git-fetch` | git fetch | `git fetch --prune` | `ti-refresh` |
| `git-log` | git log | `git log --graph --oneline --decorate -20` | `ti-history` |

Deze vier veranderen niets aan je bestanden (`pull --ff-only` kan geen merge-
conflict maken — hij weigert liever). Daarom: geen bevestiging, gewone styling.

### Ronde 2 — schrijven (bevestiging + danger-styling)

| id | label | gedrag |
|---|---|---|
| `git-commit` | commit | Berichtvenster → `git add -A && git commit -m "<bericht>"` |
| `git-push` | push | `git push`; bij "geen upstream" → `git push -u origin <branch>` |
| `git-stash` | stash | `git stash -u` met bevestiging |

**Berichtvenster.** Leeg bericht = annuleren, nooit een lege commit. Toon in het
venster hoeveel bestanden er meegaan (uit de cache van deel B), zodat je niet per
ongeluk 400 bestanden commit.

**Push zonder upstream.** `git push` faalt dan met
`fatal: The current branch X has no upstream branch`. Vang die tekst af en bied
`git push -u origin X` aan als één knop in plaats van een foutmelding.

### Ronde 4 — polish

- Per project aan/uit te zetten (net als de Flutter-knoppen).
- Volgorde instelbaar.
- Iconen uit de Tabler-set die al in de app zit.
- i18n: alle labels naar `locales/` (nl + en minimaal).
- Tests in `test/` — zie "Tests" onderaan.

---

## B. Branch- & status-indicator (ronde 3)

In de projectkop: huidige branch + `↑x ↓y` (commits vóór/achter op de remote).

```
resume   main  ↑2 ↓0   3 gewijzigd
```

### Waar de data vandaan komt

Eén commando levert alles:

```
git status -sb --porcelain=v2 --branch
```

Dat geeft regels als:

```
# branch.head main
# branch.upstream origin/main
# branch.ab +2 -0
1 .M N... ... renderer.js
```

- `branch.head` → branchnaam (of `(detached)`)
- `branch.ab` → `+x` = vooruit, `-y` = achter
- Regels die met `1`/`2`/`u`/`?` beginnen → aantal vuile bestanden
- Geen `branch.upstream` → nog geen remote-koppeling; toon dan geen pijlen maar
  een subtiel "niet gekoppeld"-teken

`--porcelain=v2` is stabiel en machineleesbaar. Parse **nooit** de gewone
`git status`-tekst; die verandert per taal en per Git-versie.

### Verversen

- Poll per open project, standaard elke 30 s (instelbaar; 0 = uit).
- Direct ná elke git-actie uit deel A.
- Bij wisselen van actieve locatie.
- **Niet** pollen als het venster verborgen/geminimaliseerd is — anders draaien
  er tien git-processen per minuut voor niets.

### Cache

```js
// key: absoluut pad van de locatie
gitCache = {
  'C:\\Users\\redub\\Desktop\\Projects\\resume': {
    isRepo: true,
    branch: 'main',
    upstream: 'origin/main',
    ahead: 2, behind: 0,
    dirty: 3,          // aantal gewijzigde/untracked bestanden
    gemetenOp: 1756661234567,
  }
}
```

Deze cache is wat deel C uitleest. Zorg dat hij ook gevuld wordt voor projecten
waarvan het tabblad niet open staat — anders mist de afsluitcontrole ze.

---

## C. Afsluitcontrole (ronde 5)

Bij het sluiten van CommandDeck **en** bij Windows-afsluiten/uitloggen: kijk of
er in een git-project niet-gecommit of niet-gepusht werk is. Zo ja → popup per
project met drie keuzes:

- **Commit & push** — berichtvenster, dan `add -A`, `commit`, `push`
- **Terminal openen** — open het project, laat de gebruiker het zelf doen
- **Toch afsluiten** — doorgaan

Dit ziet ook werk van buiten CommandDeck: Git kijkt naar de bestanden, niet naar
wie ze geschreven heeft. Bewerk je iets in VS Code en sluit je daarna
CommandDeck, dan wordt dat gewoon gezien.

### Twee gevallen, heel verschillend van aard

**1. Venster sluiten — volledig controleerbaar.**

```js
// main.js, in createWindow() na win.loadFile()
let afsluitenBevestigd = false
win.on('close', (e) => {
  if (afsluitenBevestigd) return
  e.preventDefault()
  win.webContents.send('git:controleerVoorAfsluiten')
  // renderer doet de controle en de popups, en stuurt terug:
  //   ipcMain.once('git:afsluitenMag', () => { afsluitenBevestigd = true; win.close() })
})
```

Zo lang wachten als je wilt. Geen tijdsdruk.

**2. Windows afsluiten/uitloggen — beperkt.**

```js
// main.js, naast de bestaande app.on('before-quit')
app.on('session-end', () => {
  // Windows-only. Je hebt hier ~5 seconden voordat het proces hoe dan ook
  // wordt beëindigd. Geen tijd voor een popup met een berichtvenster.
})
```

Wat hier wél kan in 5 seconden: een `git stash -u` per vuil project draaien
(synchroon, `execFileSync`), en onthouden dat je dat gedaan hebt.

Wat hier **niet** zomaar kan: het afsluiten écht pauzeren. Daarvoor heb je de
Windows-API `ShutdownBlockReasonCreate` nodig, via een native module of FFI.
En zelfs dán kan de gebruiker in het Windows-scherm "toch afsluiten" kiezen —
Windows geeft je een uitstel, geen veto.

### Vangnet: automatisch stashen

Optioneel, bij shutdown: `git stash -u` per vuil project. Bij de volgende start
een melding:

> Bij het afsluiten van Windows is er werk opzij gezet in **resume** en
> **CommandDeck**. `git stash pop` om het terug te halen. [Nu terughalen]

Voordeel: je verliest nooit werk. Nadeel: een stash die je niet verwacht is
verwarrend, en `stash -u` pakt ook untracked bestanden mee. Daarom standaard uit.

### Instelling

Eén keuze in de instellingen bepaalt het gedrag:

| Waarde | Venster sluiten | Windows afsluiten |
|---|---|---|
| `uit` | niets | niets |
| `waarschuwen` *(standaard)* | popup per project | melding, geen blokkade |
| `pauzeren` | popup per project | `ShutdownBlockReasonCreate` proberen |
| `stashen` | popup per project | automatisch `git stash -u` |

---

## Codehaakjes

Alles wat je moet aanraken, met de plek waar het nu staat.

### renderer.js

| Regel | Wat | Wat erbij moet |
|---|---|---|
| `90` | `TOOLS_CMD_DEFS` | De git-definities toevoegen (`id`, `label`, `icon`, `cls`) |
| `182` | `[...RUN_CMD_DEFS, ...TOOLS_CMD_DEFS].find(...)` | Werkt vanzelf mee |
| `409` | `for (const def of TOOLS_CMD_DEFS) ids.push(def.id)` | Werkt vanzelf mee |
| `456` | knoppen renderen | Hier de git-knoppen **verbergen als de map geen repo is** |
| `505` | `vaste` knoppenlijst voor instellingen | Werkt vanzelf mee |
| `2368` | idem `.find()` | Werkt vanzelf mee |
| `10224` | `executeCmd(project, cmd, cmdKey)` | Draait al op de actieve locatie — niets aanpassen |
| `10361` | `runCmd(project, cmdKey)` | Bevestiging + berichtvenster vóór de `cmdMap`-lookup |
| `10373` | `cmdMap` | De git-commando's erin |

Let op bij regel 456: `KLEUR_IDX` (rond regel 130) heeft een ingang nodig per
nieuwe `cls`, anders krijgt de knop een willekeurige kleur.

### main.js

| Regel | Wat | Wat erbij moet |
|---|---|---|
| `73` | `createWindow()` | `win.on('close', …)` toevoegen (zie deel C) |
| `97` | `app.on('window-all-closed')` | Ongemoeid laten |
| `101` | `app.on('before-quit')` | Ongemoeid laten — te laat om nog te vragen |
| `332` | `settings:load` / `settings:save` | De afsluit-instelling erbij |
| `805` | `fs:projectSoort` | `git: heeft('.git')` toevoegen aan het antwoord |
| `2350` | tweede `before-quit` (pty's) | Ongemoeid laten |
| *nieuw* | `app.on('session-end')` | Windows-afsluiten (zie deel C) |
| *nieuw* | `ipcMain.handle('git:status', …)` | `git status -sb --porcelain=v2 --branch` draaien en geparsed teruggeven |

`fs:projectSoort` geeft nu `{ flutter, dart, node, pubspec }`. Voeg `git` toe —
dan weet de renderer meteen of de git-knoppen getoond moeten worden, zonder een
apart rondje.

### preload.js

Toevoegen aan de `contextBridge`-lijst:

```js
gitStatus:   (p) => ipcRenderer.invoke('git:status', p),
gitAfsluiten:(f) => ipcRenderer.on('git:controleerVoorAfsluiten', f),
gitMagAf:    ()  => ipcRenderer.send('git:afsluitenMag'),
```

### locales/

Nieuwe sleutels onder een `git.`-prefix: knoplabels, bevestigingsteksten,
het berichtvenster, de afsluit-popup, de stash-melding bij opstarten.

---

## Open beslissingen

1. **`git pull` of `git pull --ff-only`?**
   `--ff-only` kan nooit een merge-conflict veroorzaken, maar weigert als je
   lokaal commits hebt. Dat is duidelijker dan halverwege in een conflict staan.
   *Voorstel: `--ff-only`, met een nette melding "je loopt uit elkaar" als hij weigert.*

2. **Commit-knop: `add -A` of alleen gewijzigde bestanden?**
   `add -A` pakt ook untracked bestanden mee. Dat is bijna altijd wat je wilt,
   maar in een project zonder goede `.gitignore` commit je zo `node_modules`.
   *Voorstel: `add -A`, maar in het berichtvenster tonen hoeveel bestanden en
   hoeveel MB — en waarschuwen boven een drempel.*

3. **Poll-interval.** 30 s is een gok. Meten hoe zwaar `git status` is op een
   grote repo (resume: klein; CommandDeck met node_modules: kan traag zijn —
   maar node_modules staat in `.gitignore`, dus git slaat hem over).

4. **Meerdere locaties per project.** Een project kan meerdere locaties hebben.
   Toont de kop de status van de actieve locatie, of van allemaal?
   *Voorstel: actieve locatie in de kop, alle locaties in de afsluitcontrole.*

5. **`ShutdownBlockReasonCreate`: waard om te doen?**
   Vereist een native module (extra build-stap, extra dingen die stuk kunnen bij
   een Electron-upgrade). Het vangnet met `stash` geeft 90% van de waarde voor
   5% van het werk. *Voorstel: beginnen met stash, native pas als het knelt.*

6. **Wat als er geen remote is?** (Zoals CommandDeck nu.) Push-knop verbergen,
   of tonen met een uitleg? *Voorstel: tonen, en bij klikken aanbieden de remote
   in te stellen.*

---

## Tests

In `test/`, in dezelfde stijl als de bestaande tests, en toevoegen aan het
`test`-script in `package.json`.

- `test/git-parse.test.js` — parser van `--porcelain=v2`: normale branch,
  detached HEAD, geen upstream, `+0 -0`, vuile bestanden, lege output
- `test/git-cmd.test.js` — `cmdMap` levert de juiste commando's per `cmdKey`
- `test/git-knoppen.test.js` — knoppen verschijnen alleen bij `git: true`
- `test/git-afsluiten.test.js` — beslislogica: welke projecten leveren een popup

Parser-tests eerst. Dat is het enige stuk met echte logica; de rest is bedrading.

---

## Volgorde

```
Ronde 1  lezen            → meteen bruikbaar
Ronde 2  schrijven        → dagelijks gebruik compleet
Ronde 3  indicator        → levert de cache voor ronde 5
Ronde 4  polish + i18n    → af
Ronde 5  afsluitcontrole  → het vangnet
```

Ronde 5 vóór ronde 3 bouwen kan niet zinvol: zonder de cache moet de
afsluitcontrole alsnog voor elk project een git-proces starten, precies op het
moment dat je daar geen tijd voor hebt.
