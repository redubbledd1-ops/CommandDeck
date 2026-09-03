# Onderzoek: CommandDeck op netwerkschijven (mapped drives + UNC) + git

Datum: 3 september 2026 — alleen onderzoek, geen code gewijzigd.

Getest op de echte machine (Windows 10 Pro, Node 24.11, git 2.51.2.windows.1) met de
netwerkschijven die hier al gekoppeld staan:

| Letter | UNC |
|---|---|
| `P:` | `\\192.168.100.200\Projecten` |
| `Z:` | `\\192.168.100.200\Medewerkers` |

Voor de git-tests op een *kaal* UNC-pad is bewust **niet** naar de productie-share
geschreven. Daarvoor is `\\127.0.0.1\C$\...` gebruikt: een echt UNC-pad naar de
lokale schijf, met dezelfde padsemantiek maar zonder netwerk en zonder dat er
iets op de fileserver van collega's verschijnt.

---

## De kern in één alinea

`fs` (verkenner, boom, zoeken) werkt **gewoon** op UNC-paden, en git werkt
**gewoon** op UNC-paden. Wat níét werkt is `cmd.exe`: die weigert een UNC-pad als
werkmap, verhuist stilletjes naar `C:\Windows` en geeft **exit 0** terug. Elk
commando dat CommandDeck via `shell: true` of via de pty start, draait dan in de
verkeerde map terwijl de app "✓ klaar" toont. Dat is geen prestatieprobleem maar
een correctheidsprobleem, en het is de enige echte blokkade.

---

## 1. Wat al werkt zonder één regel wijziging

### fs op UNC — volledig, en snel
```
existsSync   \\192.168.100.200\Projecten     true        8 ms
statSync     isDirectory                     true        2 ms
readdirSync  eerste keer                     122 items  14 ms
readdirSync  tweede keer                     122 items   2 ms
statfsSync   vrije/totale ruimte             3933 GB     2 ms
```
Geen auth-prompt, geen trage eerste toegang, geen exception. Dat betekent dat
`fs:listDir`, `fs:zoek`, het rechtsklikmenu, kopiëren/plakken en hernoemen nu al
op een UNC-pad werken — ze doen niets Windows-specifieks.

### De omhoog-knop klopt al op een share-wortel
`fs:listDir` bepaalt de ouder met `path.dirname(path.resolve(dirPath))` en geeft
`null` als die gelijk is aan het pad zelf. Node behandelt `\\server\share` als
een wortel:
```
resolve("\\192.168.100.200\Projecten")  ->  "\\192.168.100.200\Projecten\"
dirname(  idem                       )  ->  "\\192.168.100.200\Projecten\"   (gelijk)
```
Dus `parent: null`, en de omhoog-knop gaat vanzelf uit op de share-wortel. Precies
goed, zonder wijziging.

### Gekoppelde schijfletters werken volledig
`P:` en `Z:` komen al in `fs:listDrives` terecht (die loopt A–Z af en doet
`existsSync`), inclusief vrije ruimte via `statfsSync`. En daarna werkt **alles**:
```
spawn shell:true   cwd=P:\   ->  cwd is P:\        ✓
pty  cmd.exe       cwd=P:\   ->  cwd is P:\        ✓
.bat shell:true    cwd=P:\   ->  BAT-CWD=P:\       ✓
git --version      cwd=P:\   ->  schoon, geen waarschuwing  ✓
```
**Dit is vandaag het werkende antwoord**: koppel de share aan een letter en
CommandDeck doet het zonder aanpassing.

### git op een kaal UNC-pad werkt óók (mits niet via cmd.exe)
Met `shell: false` — precies zoals `git:info` en `git:accountInfo` in main.js het
al doen via `execFile` — is er geen enkel probleem op git 2.51.2:
```
git init -b main          cwd=UNC   status 0   108 ms
git add -A                cwd=UNC   status 0    71 ms
git commit -m eerste      cwd=UNC   status 0   165 ms
git status --porcelain=v2 cwd=UNC   status 0    78 ms
git rev-parse             cwd=UNC   status 0    49 ms
git log --oneline         cwd=UNC   status 0    57 ms
```
Het oude verhaal "git kan niet met UNC-paden" is achterhaald voor moderne git. De
uitvoer normaliseert het pad wel naar forward slashes
(`//127.0.0.1/C$/...`), wat voor weergave uitmaakt maar niet voor de werking.

Ook het **bare-repo-als-remote** patroon werkt:
```
git init --bare  \\...\bare.git          status 0    98 ms
git remote add origin \\...\bare.git     status 0    39 ms
git push -u origin main                  status 0   360 ms
git clone \\...\bare.git kloon           status 0   163 ms
```

### PowerShell accepteert een UNC-werkmap wel
```
powershell -NoProfile -Command "(Get-Location).Path"   cwd=UNC
  ->  Microsoft.PowerShell.Core\FileSystem::\\192.168.100.200\Projecten
```
Werkt, ook via node-pty. Let op de provider-prefix in de uitvoer: dat is de
PowerShell-notatie voor een UNC-locatie, geen fout. Code die `(Get-Location).Path`
zou parsen krijgt dus iets anders te zien dan een gewoon pad.

Omdat `psCommandLaunch` PowerShell al met `shell: false` en `-EncodedCommand`
start, raakt de powershell-sectie het cmd-probleem hieronder **niet**.

### Losgekoppelde schijfletters lopen niet vast
```
existsSync Q:\                      false, 0 ms   (geen hang)
spawn cwd=Q:\   ->  ENOENT, 3 ms                  (nette fout, geen exit 0)
```
`fs:listDrives` slaat een niet-gekoppelde letter gewoon over, en `validateCwd`
vangt hem af met "Map bestaat niet: …". Dat gedrag is al goed.

---

## 2. Het echte probleem: cmd.exe verhuist stilletijd — en meldt succes

Dit is de belangrijkste vondst van dit onderzoek.

```
spawn("cd", { cwd: "\\192.168.100.200\Projecten", shell: true })

  status = 0                                   <-- ziet eruit als geslaagd
  stdout = "C:\Windows"                         <-- maar draaide hier
  stderr = "'\\192.168.100.200\Projecten'
            CMD.EXE was started with the above path as the current directory.
            UNC paths are not supported.  Defaulting to Windows directory."
```

Hetzelfde gebeurt bij `pty:start`, want die start ook `cmd.exe /c`:
```
pty.spawn(cmd.exe, ["/c","cd"], { cwd: UNC })
  ->  "UNC paths are not supported.  Defaulting to Windows directory." ... "C:\Windows"
```
En bij een `.bat`:
```
t.bat via shell:true, cwd=UNC   ->  BAT-CWD=C:\Windows
```

En daarmee bij git, zodra het via de knoppen loopt (die gaan door `runCommandOnce`
met `shell: true`):
```
git status --porcelain=v2  shell:true  cwd=UNC
  ->  status 128, "fatal: not a git repository"     (want hij stond in C:\Windows)
```

### Waarom dit erger is dan een foutmelding

1. **`validateCwd` laat het door.** Die controleert alleen `fs.existsSync(cwd)`, en
   dat is `true` voor een UNC-pad. De relocatie gebeurt daarná, in cmd zelf.
2. **De exitcode is 0.** `runCommandOnce` kijkt naar `code === 0` en drukt
   `✓ klaar` af. De gebruiker krijgt een geslaagd-melding voor een commando dat
   ergens anders draaide.
3. **De waarschuwing komt op stderr binnen** en gaat door `classifyLine()`, die
   alleen op `error:|exception|failed` matcht — dus hij wordt als gewone `info`
   getoond, tussen de rest.
4. **Het is niet onschuldig.** Een `git add -A && git commit` bedoeld voor de share
   draait dan op `C:\Windows`. Bij een verwijder- of opruimcommando is de
   verkeerde map een echt risico.

`node-pty` en `child_process` treffen hier geen blaam: met `shell: false` werkt de
UNC-werkmap prima (`node -e "console.log(process.cwd())"` met `cwd=UNC` gaf keurig
het UNC-pad terug). Het is specifiek `cmd.exe`. De reden is MS-DOS-compatibiliteit:
de "huidige schijf" moet een letter kunnen teruggeven, en een UNC-pad heeft er
geen. Zie de bronnen onderaan.

---

## 3. Wat met kleine, laag-risico wijzigingen werkend te krijgen is

### 3a. `pushd`-omhulsel voor cmd-commando's (getest, werkt)

`pushd` koppelt zelf een tijdelijke letter aan de share en gaat erheen; `popd`
haalt hem weer weg. Gemeten gedrag:

```
pushd "\\192.168.100.200\Projecten" && git --version && cd
  ->  status 0
      "git version 2.51.2.windows.1"
      "Y:\"                     <-- de tijdelijke letter, dus juiste map
      geen "UNC paths are not supported" meer
```

Belangrijke eigenschappen, allemaal nagemeten:

| Vraag | Uitkomst |
|---|---|
| Gaat de tijdelijke letter weer weg? | Ja. `net use` na afloop toont alleen P: en Z: |
| Twee tegelijk? | Beide sessies kregen `Y:` en werkten allebei goed |
| Verandert er iets op gewone paden? | Nee, mits alleen toegepast als het pad UNC is |

**Correctie na het bouwen van fase 2.** De eerste versie hierboven eindigde op
`& popd`, en de meting leek te kloppen: `exit /b 7` gaf `status=7`. Dat was een
misleidende test — `exit /b` gedraagt zich anders dan een gewoon commando. Met een
echt commando slikt `& popd` de exitcode op:

```
pushd "<share>" && cmd /c exit 3 & popd            ->  status 0   (fout, moet 3 zijn)
pushd "<share>" && git rev-parse ... & popd        ->  status 0   (fout, moet 128 zijn)
```

Dat zou precies de bug van fase 1 opnieuw invoeren: elke mislukking op een
netwerkpad meldt zich als geslaagd. De juiste vorm laat `popd` weg:

```
pushd "<unc-pad>" && <origineel commando>
```

met `cwd` dan niet meegeven. Nagemeten met deze vorm:

| Vraag | Uitkomst |
|---|---|
| Blijft de exitcode kloppen? | Ja. `exit 3` → 3, `exit 42` → 42, git-fout → 128 |
| Lekt er een schijfletter zonder `popd`? | Nee. Na zes ronden staat alleen P: en Z: in `net use` — de letter hangt aan het cmd-proces en valt weg als dat eindigt |
| Draait het commando alsnog als `pushd` faalt? | Nee. Niet-bestaande share → status 1, commando blijft uit (dat is wat `&&` doet) |
| Blijven stdout en stderr gescheiden? | Ja |

Herkennen of iets een UNC-pad is kan met één test op twee scheidingstekens gevolgd
door server en share; op `C:\Windows` en `P:\` gaf die netjes `false`.

**Twee kanttekeningen die in de melding thuishoren:**
- Commando's rapporteren daarna de tijdelijke letter (`Y:\`), niet het UNC-pad. Wie
  het pad in de uitvoer terugleest, ziet iets anders dan wat hij intypte.
- `%VAR%` in het commando van de gebruiker wordt door cmd uitgevouwen vóórdat
  `pushd` draait. In de test gaf `echo %CD%` binnen het omhulsel nog de oude map.
  Dat is cmd-parsegedrag, geen fout in het omhulsel, maar het betekent dat `%CD%`
  onbetrouwbaar wordt op een UNC-pad.

### 3b. UNC-wortels in de boom

`fs:listDrives` levert nu alleen A–Z. Een lijstje door de gebruiker toegevoegde
UNC-wortels erbij (bewaard in settings) past in dezelfde vorm — `{ path, free, total }`
— en `statfsSync` werkt op een UNC-pad, dus de vrije ruimte klopt zelfs.

Twee plekken in `renderer.js` moeten dan wel mee, en dat zijn de enige twee
schijfletter-aannames die de boom raken:

- **`boomKeten()` (regel ~9746)** — de terugval doet `if (!/^[a-z]:/i.test(schoon)) return []`.
  Een UNC-pad matcht niet en levert een lege keten, dus de boom kan er niet naartoe
  openklappen. Zodra de UNC-wortel in de schijvenlijst staat, pakt de bovenste helft
  van de functie hem wél (die vergelijkt tegen de echte wortels), dus dit raakt
  alleen het geval "schijven nog niet ingelezen".
- **`ouderVan()` (regel ~10252)** — loopt nu door tot onzin:
  ```
  ouderVan("\\192.168.100.200\Projecten")  ->  "\\192.168.100.200"   (bestaat niet als map)
  ouderVan("\\192.168.100.200")            ->  "\"                    (onzin)
  ouderVan("\")                            ->  ::deze-pc
  ```
  Zou bij een share-wortel meteen `DEZE_PC` moeten teruggeven, net zoals `fs:listDir`
  daar al `parent: null` geeft.

`cloneOuderPad()` in `git-tools.js` (regel ~1588) heeft dezelfde vorm van het
probleem, maar met kleinere gevolgen — het bepaalt alleen de doelmap bij klonen.

### 3c. Een duidelijke melding in plaats van een stille verhuizing

Los van het pushd-omhulsel: zolang de tekst `UNC paths are not supported` in de
uitvoer voorkomt, klopt `✓ klaar` niet. Die regel herkennen en er een echte fout
van maken is een kleine, op zichzelf staande verbetering — ook nuttig als vangnet
ná het omhulsel, voor het geval er ooit een pad doorheen glipt.

---

## 4. Wat onbetrouwbaar of afgeraden is

### Werkkopie inclusief `.git` op de share zetten — afgeraden

Niet omdat git het niet kan (dat kan het aantoonbaar wel), maar om drie andere redenen:

1. **PowerShell blokkeert scripts vanaf deze share.** Gemeten op deze machine:
   ```
   Zone van \\192.168.100.200\Projecten   ->  Internet
   LocalMachine ExecutionPolicy           ->  RemoteSigned
   ```
   `RemoteSigned` weigert niet-ondertekende scripts uit een niet-lokale zone. Een
   `.ps1` die in de repo op de share staat, wordt dus geweigerd. Opties, met hun prijs:
   - `Unblock-File` per bestand — werkt, maar moet na élke wijziging opnieuw, en
     op een share die door meer mensen wordt geschreven is dat een terugkerend
     karwei.
   - De share in de zone "Lokaal intranet" zetten (Internetopties → Beveiliging →
     Lokaal intranet → Sites) — lost het structureel op voor déze server. Dit is een
     bewuste vertrouwensbeslissing over een fileserver: alles wat daarop staat mag
     dan ongetekend draaien. Hoort thuis bij wie het netwerk beheert, niet bij een
     app die het stilletjes zet.
   - `-ExecutionPolicy Bypass` meesturen — CommandDeck doet dit al voor `.ps1`-starts
     (`psFileLaunch` forceert `Bypass`). Dat werkt, maar het zet de controle uit in
     plaats van de bron te vertrouwen. Prima voor een script dat de gebruiker zelf
     aanwijst, geen goede standaard voor alles wat van een netwerklocatie komt.
2. **`index.lock` op SMB.** Bekend probleem: git kan `index.lock` niet altijd
   hernoemen naar `index` op een trage of haperende SMB-share, en laat dan een slot
   achter dat elke volgende commit weigert. Zie git-cola #1438 en TortoiseGit #4073
   (die laatste meldt operaties van 1–2 minuten op netwerkshares).
3. **Latentie bij veel kleine bestanden.** Git doet per statusronde honderden
   `stat`-aanroepen. Op de lokale schijf was `git status` 41 ms, via UNC naar
   localhost 78 ms — en dat is zónder echt netwerk ertussen.

**Aanbevolen in plaats daarvan:** werkkopie lokaal, `--bare` repo op de share als
remote. Getest en werkend (zie §1). De share wordt dan alleen aangeraakt bij push
en fetch, precies waar hij goed in is.

Eén detail uit de test dat in de instructie thuishoort: `git init --bare` zet
`HEAD` op `master`, terwijl CommandDeck met `git init -b main` werkt. Een kloon van
zo'n bare repo komt dan op een lege `master` uit:
```
warning: remote HEAD refers to nonexistent ref
fatal: your current branch 'master' does not have any commits yet
```
Bij het aanmaken van een bare repo hoort dus `git init --bare -b main` (of achteraf
`git symbolic-ref HEAD refs/heads/main`).

### UNC-pad en schijfletter zijn twee identiteiten voor dezelfde map

`P:\project` en `\\192.168.100.200\Projecten\project` wijzen naar hetzelfde, maar
zijn verschillende strings. `Accounts.normaliseerPad` maakt er
`p:/project` respectievelijk `//192.168.100.200/projecten/project` van, en
`padHoortBij` vergelijkt exact. Gevolg: staat een projectlocatie als letter
opgeslagen en komt er een git-aanroep binnen met het UNC-pad (of andersom), dan
weigert `padToegestaan()` hem en krijgt de gebruiker een lege git-staat zonder
uitleg. Niet stuk, wel verwarrend — en iets om te weten vóór er een keuze wordt
gemaakt tussen letters en UNC.

### Wat niet getest kon worden

- **Een share die tijdens gebruik wegvalt.** Daarvoor had de verbinding met de
  productie-fileserver verbroken moeten worden; dat raakt anderen. Op basis van het
  losgekoppelde-letter-gedrag (nette `ENOENT`, `existsSync` false in 0 ms) is de
  verwachting dat `fs:listDir` en `validateCwd` het netjes afvangen, maar een
  wegvallende verbinding kan óók blokkeren in plaats van falen — SMB-timeouts lopen
  op tot tientallen seconden. Dat is precies het geval waarin de UI zou bevriezen,
  en het verdient een echte test in fase 3.
- **Echte netwerk-latentie op git.** De git-tests op UNC liepen via `\\127.0.0.1\C$`
  om niet naar de productie-share te schrijven. Padsemantiek is daarmee volledig
  gedekt, netwerkvertraging niet.
- **Padlengte boven 260 tekens op UNC.** Een pad van 228 tekens gaf geen fout
  (`existsSync` gaf gewoon `false`), maar er is geen echte diepe mappenstructuur op
  de share aangemaakt om de grens op te zoeken.

---

## 5. Gefaseerd stappenplan

### Fase 1 — Stoppen met stilletjes de verkeerde map gebruiken — ✅ UITGEVOERD
Kleinste ingreep, grootste winst. Geen nieuwe functies, alleen eerlijkheid.

Uitgevoerd op 3 september 2026. Wat er staat:
- `isUncPad()` + `uncWaarschuwing()` in `git-tools.js`, met export.
- `validateCwd()` weigert een UNC-map voor cmd, laat powershell door.
- `classifyLine()` rekent de uitwijk-melding als fout.
- `runCommandOnce()` telt exit 0 na uitwijken niet meer als geslaagd
  (`✗ niet in de projectmap gedraaid`) en geeft `uitgeweken: true` terug.
- `pty:start` weigert dezelfde combinatie.
- 17 tests erbij in `test/git.test.js`; suite draait zonder nieuwe fouten.


1. Een `isUncPad()`-hulpje op één plek (kandidaat: `git-tools.js`, want die wordt
   al door main, renderer én de tests geladen).
2. In `validateCwd()`: op een UNC-pad + cmd-shell een duidelijke melding geven
   ("cmd kan niet in een UNC-map starten; koppel er een schijfletter aan, of zet
   dit project op de letter") in plaats van het door te laten.
3. `classifyLine()` de regel `UNC paths are not supported` als fout laten tellen, en
   `runCommandOnce` in dat geval geen `✓ klaar` laten afdrukken.
4. Testen erbij in `test/` voor de padherkenning en de foutafhandeling.

Resultaat na fase 1: niets werkt beter, maar niets liegt meer. Wie een share aan
een letter koppelt (P:, Z:) heeft dan een volledig werkende app.

### Fase 2 — cmd-commando's laten werken op een UNC-pad — ✅ UITGEVOERD
Uitgevoerd op 3 september 2026. Wat er staat:
- `cmdInMap(cmd, pad, windows)` in `git-tools.js`: geeft `{ cmd, cwd, viaLetter }`
  terug. Op een UNC-pad wordt dat `pushd "<pad>" && <cmd>` met `cwd: null`; op elk
  ander pad verandert er niets. Buiten Windows evenmin.
- `runCommandOnce()` en `pty:start` gebruiken het allebei; de powershell-tak is
  niet aangeraakt, want die kon het al.
- De blokkade uit fase 1 in `validateCwd()` is weg — netwerkpaden werken nu.
- Er komt een regel in beeld dat cmd via een tijdelijke schijfletter werkt, met
  de waarschuwing dat `%CD%` en `%VAR%` daardoor niet naar die map wijzen.
- Het vangnet uit fase 1 (`uncWaarschuwing` → geen `✓ klaar`) blijft staan, voor
  het geval een commando zichzelf alsnog laat verhuizen.
- 21 tests erbij in `test/git.test.js`, plus end-to-end nagemeten tegen
  `\\192.168.100.200\Projecten`: `cd` toont de tijdelijke letter, `dir /b /ad`
  geeft dezelfde 114 mappen als via het UNC-pad, `git rev-parse` geeft 128 en
  `exit 5` geeft 5.

### Fase 2b — de knoppen die een LOS consolevenster openen — ✅ UITGEVOERD
Uitgevoerd op 3 september 2026, tegen `\\192.168.100.200\Projecten` en
`\\127.0.0.1\C$\Program Files` (die tweede om een pad met een spatie mee te nemen).
Alleen gelezen op de productieshare; alle proefuitvoer ging naar een lokale map.

**De beperking bestaat, en is stiller dan die van fase 1.** Gemeten met
`start "" /WAIT /D <unc> <bat>`, precies de vorm uit main.js:

| Uitkomst | Wat er gebeurde |
|---|---|
| Meest voorkomend | Het venster **opende gewoon, maar stond in `C:\Windows`** |
| Andere ronde | `start` gaf zelf "The current directory is invalid." en er kwam **helemaal geen venster** |

Beide zijn onzichtbaar voor de gebruiker, want main.js doet `.unref()` en geeft
`true` terug zonder ooit naar een exitcode of naar stderr te kijken. Bij de
proefdraai van een bat betekent dat: het script draait in `C:\Windows` in plaats van
in de projectmap.

**`/D` is niet de boosdoener.** Met powershell.exe erachter landde hetzelfde
`start "" /D <unc>` netjes in de share:
```
start "" /WAIT /D "\\192.168.100.200\Projecten" powershell -NoProfile -Command "(Get-Location).Path"
  ->  Microsoft.PowerShell.Core\FileSystem::\\192.168.100.200\Projecten
```
Het is opnieuw cmd.exe zélf — en een `.bat` telt mee, want die wordt dóór cmd
gedraaid. De powershell-knop (`shell:openPs`) is daarom niet aangeraakt; dat is
gemeten en niet aangenomen.

**Wat er niet werkte, en waarom dat belangrijk is.** De pushd-regel uit fase 2 moet
nu door twee cmd-lagen heen: die van `start` en die van het venster zelf. Via een
argumentenlijst overleeft dat niet:
```
spawn('cmd.exe', ['/c','start','""','cmd.exe','/c', 'pushd "\\...\Projecten" && <cmd>'])
  ->  "The specified path is invalid."   en geen venster
```
Node ontsnapt een `"` binnen een argument als `\"`, en cmd.exe kent die
schrijfwijze niet. Met één commandoregel via `shell: true` — precies zoals
`runCommandOnce` het al doet — werkt het wel:
```
start "" cmd.exe /k "pushd "\\192.168.100.200\Projecten" && <cmd>"
  ->  venster opent op Y:\                         ✓
start "" cmd.exe /c "pushd "\\127.0.0.1\C$\Program Files" && <bat>"
  ->  venster opent op Y:\Program Files            ✓  (spatie in het pad)
```
Het extra paar aanhalingstekens om de hele pushd-regel is nodig: het houdt de `&&`
binnen de aanhalingstekens, zodat de cmd van `start` hem niet als scheidingsteken
opvat en het commando buiten het venster om draait. `cmd /k` haalt dat buitenste
paar er zelf weer af.

**Wat er staat:**
- `vensterInMap(pad, binnen, blijfOpen, windows)` in `git-tools.js`, bovenop
  `isUncPad` en `cmdInMap`. Geeft `null` op een gewoon pad — dan blijft de
  bestaande `start "" /D <map> …`-weg letterlijk staan en verandert er niets.
- `cmdInMap` geeft bij een leeg commando nu alleen `pushd "<pad>"`, zonder een `&&`
  die in de lucht hangt. Dat geval bestaat bij het lege consolevenster.
- `shell:openCmd` (met én zonder commando) en `bat:test` gebruiken het.
- `shell:openPs` niet — gemeten dat die het niet nodig heeft.
- 26 tests erbij in `test/git.test.js`.

**Geen popd, opnieuw — maar om een andere reden.** Bij `cmdInMap` omdat popd de
exitcode opeet. Hier leest niemand een exitcode (het venster is los), maar popd zou
de gebruiker meteen weer uit de map gooien terwijl hij nog zit te typen.

**De prijs daarvan, nagemeten.** Gaat het venster hard dicht (kruisje, `taskkill`),
dan blijft de tijdelijke letter in `net use` staan:
```
letters vooraf                  P: Z:
met het /k-venster open         P: Y: Z:
na taskkill /F                  P: Y: Z:     <-- blijft staan
```
Sluit de gebruiker het venster met `exit`, of eindigt het commando gewoon (de
`/c`-vorm van de proefdraai), dan ruimt cmd hem wel op — nagemeten: na drie
`/c`-vensters stond er weer alleen `P: Z:`. Een achtergebleven letter wijst naar
dezelfde share die de gebruiker zelf koos, dus hij is onschuldig, maar hij is er.

**Nog gedaan na fase 2b:** bij deze knoppen krijgt de gebruiker via een toast te
horen dat er een tijdelijke letter aan hangt (fase 4 / restje 2b): `viaLetter` in
het IPC-antwoord, `openCmdMetMelding` / `batToastNaStart` in de renderer.

### Fase 3 — UNC als wortel in de boom en de verkenner — ✅ UITGEVOERD

Uitgevoerd op 3 september 2026. Tijdens het bouwen kwam item 5 als eerste boven
water, en dat bleek meteen het zwaarste punt van de hele fase:

**Een UNC-pad naar een server die niet antwoordt laat `fs.existsSync` 28 seconden
hangen.** Dat draait in het hoofdproces, dus dat is een bevroren venster. En het
straalt uit: zo'n vastzittende lookup bezet een thread uit de libuv-pool (vier
groot), en met een handvol dode paden erin duurde een gewone `stat` op
`C:\Windows` **29 seconden**. Eén onbereikbare netwerkmap legt dus alle
bestands-IO van de app stil, ook op je eigen schijf. Dat is een zwaardere fout
dan wat fase 1 en 2 samen oplosten, en hij zat er al — iedereen die vandaag een
UNC-pad in het padveld typt, kan hem raken.

Opgelost met drie regels die alle drie nodig zijn: nooit synchroon aankloppen
(async houdt de event loop vrij), nooit meer dan één probe tegelijk (anders is de
threadpool zo op), en het antwoord onthouden (anders klop je elke tekenronde
opnieuw aan). Gemeten na de wijziging, via de echte IPC-handlers:

| | voor | na |
|---|---|---|
| `fs:listDir` op dode share, 1e keer | ~28 000 ms, venster bevroren | 2017 ms, venster blijft draaien |
| idem, 2e keer | ~28 000 ms | 0 ms (cache) |
| submap van dode share | ~28 000 ms | 0 ms (erft het antwoord van de wortel) |
| `fs:listDrives` met dode wortel erin | — | 14 ms |
| bereikbare share | 223 ms | 223 ms |

Verder gebouwd:
- `uncWortel()`, `isUncWortel()`, `uncNaam()` in `git-tools.js`.
- `ouderVan()` geeft boven een share `DEZE_PC` terug in plaats van door te lopen
  naar `\\server` en daarna een losse `\`.
- `boomKeten()` bouwt de keten vanaf `\\server\share` in plaats van te stoppen op
  de eerste schijfletter-test.
- `netwerkWortels` in de instellingen, plus `fs:netwerkWortels`,
  `fs:netwerkWortelToevoegen` en `fs:netwerkWortelWeg` (met preload erbij).
  Toevoegen weigert een pad dat geen netwerkpad is of niet antwoordt, met
  dezelfde tijdslimiet — een typefout hoor je meteen, niet na 28 seconden.
- `fs:listDrives` neemt de netwerkwortels mee zonder op een probe te wachten;
  `bereikbaar: null` betekent "nog niet uitgezocht", niet "stuk".
- `wortelNaam()` in de renderer, zodat er `server\share` staat en niet
  `\server\share` — de oude `replace('\\','')` was op schijfletters geschreven.

Nog te doen in deze fase: een knop in de zijbalk om zo'n wortel toe te voegen of
weg te halen. De hele onderkant ligt er (IPC, preload, opslag, weergavenaam),
alleen het bedieningselement ontbreekt nog.

### Fase 3 — oorspronkelijk plan
1. `fs:listDrives` uitbreiden met door de gebruiker toegevoegde UNC-wortels uit
   settings (`{ path, free, total }` blijft de vorm; `statfsSync` werkt).
2. `ouderVan()` op een share-wortel `DEZE_PC` laten teruggeven in plaats van
   `\\server` en daarna `\`.
3. `boomKeten()`-terugval ook een UNC-vorm laten herkennen.
4. UI om zo'n wortel toe te voegen/weg te halen (buiten dit onderzoek; pas
   ontwerpen als 1–3 staan).
5. Hier hoort de ontbrekende test thuis: een share die wegvalt terwijl de verkenner
   erop staat. Als dat blokkeert in plaats van faalt, is een timeout om `fs:listDir`
   heen nodig.

### Fase 4 — Git-begeleiding op netwerklocaties — ✅ UITGEVOERD

Uitgevoerd op 3 september 2026. Wat er staat:
- `isNetwerkPad()` / `schijfLetterVan()` in `git-tools.js`: UNC of letter uit
  een meegegeven set. Pure en testbaar.
- `fs:listDrives` markeert gekoppelde netwerkschijven (`GetDriveType` via één
  PowerShell-ronde, 60s cache). `wortelNaam` toont letters nog steeds als `P:`;
  alleen echte UNC-wortels krijgen `server\share`.
- Bij `KOPPEL_INIT` op een netwerkpad: keuze bare-patroon (primair) of toch
  hier init, met de redenen uit §4. Bare: `git init --bare -b main` op de share,
  daarna `git clone` lokaal; projectlocatie wijst naar de kloon.
- `regelGitSlot` op netwerk: 5s stille wacht, daarna tot 2 minuten ouderdom
  blijft "opnieuw" primair; aparte i18n-tekst.
- Toast bij losse cmd/bat-vensters op UNC (`viaLetter` in het IPC-antwoord).

### Fase 4 — oorspronkelijk plan
1. Herkennen dat een projectlocatie op een netwerkschijf of UNC-pad staat.
2. Bij `git init`/koppelen daar het bare-repo-patroon voorstellen in plaats van de
   werkkopie op de share te zetten, met de reden erbij (`index.lock`, latentie,
   PowerShell-zone).
3. Bij het aanmaken van een bare repo `-b main` meegeven, anders klopt de kloon niet.
4. Een `index.lock` op een netwerkpad met meer geduld behandelen dan lokaal — de
   bestaande opruimlogica in main.js gaat uit van lokale schijfsnelheden.

### Fase 5 — Optioneel, alleen als de behoefte blijkt
- Een keuze "koppel deze share aan een letter" vanuit de app (`net use`), zodat de
  gebruiker het pushd-omhulsel helemaal niet nodig heeft.
- Herkennen dat `P:\x` en `\\server\share\x` dezelfde map zijn, zodat
  `padHoortBij` niet struikelt over de schrijfwijze.
- `DisableUNCCheck` is bewust **niet** opgenomen: het is een registerwijziging in
  `HKCU\Software\Microsoft\Command Processor` die het gedrag van cmd systeembreed
  verandert voor álle programma's van deze gebruiker, en Microsoft documenteert hem
  als niet-ondersteund. Dat is te veel bijwerking voor wat `pushd` per commando ook
  oplost.

---

## Bronnen

- [Why can't you set the command prompt's current directory to a UNC? — The Old New Thing](https://devblogs.microsoft.com/oldnewthing/20070215-05/?p=28003) — waarom cmd dit weigert (MS-DOS functie 19h moet een schijfletter teruggeven)
- [CMD does not support UNC paths — Microsoft Q&A](https://learn.microsoft.com/en-us/answers/questions/2538977/cmd-does-not-support-ucn-paths) — `pushd` als officiële omweg, en de `DisableUNCCheck`-registersleutel
- [CMD.EXE does not support UNC paths — GitHub Desktop #14181](https://github.com/desktop/desktop/issues/14181) — hetzelfde probleem in een andere Electron-app
- [Child process — Node.js documentatie](https://nodejs.org/api/child_process.html) — gedrag van `cwd` en `ENOENT` bij een niet-bestaande werkmap
- [git-cola: windows keeps index locked with samba share #1438](https://github.com/git-cola/git-cola/issues/1438) — `index.lock` die niet hernoemd kan worden op SMB
- [TortoiseGit extremely slow on network shares / UNC paths #4073](https://gitlab.com/tortoisegit/tortoisegit/-/issues/4073) — trage git-operaties op netwerkshares
- [Unblock-File — Microsoft Learn](https://learn.microsoft.com/en-us/powershell/module/microsoft.powershell.utility/unblock-file) — Zone.Identifier weghalen
- [PowerShell Execution Policy: Unblock Files / Security Zones](https://sid-500.com/2023/07/11/powershell-execution-policy-unblock-files-security-zones/) — hoe zones en `RemoteSigned` samenwerken
- [Git on Windows: creating a network shared central repository](https://elegantcode.com/2011/06/18/git-on-windows-creating-a-network-shared-central-repository/) — bare repo op een share als remote
