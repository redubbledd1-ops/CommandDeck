# Overdracht: CommandDeck op netwerkschijven (UNC)

Plak dit als openingsprompt in Cursor.

---

## Waar dit over gaat

Project: `C:\Users\Admin\Desktop\CommandDeck` (Electron-app, git-repo, Nederlands
in code en comments). Alle achtergrond staat in **`onderzoek-netwerkschijven.md`**
— lees dat eerst, vooral §5 "Gefaseerd stappenplan". Dat document is de bron van
waarheid; het bevat per fase wat er is gemeten en waarom er zo gekozen is.

De kern van het probleem: `cmd.exe` weigert een UNC-pad (`\\server\share`) als
werkmap, wijkt stilletjes uit naar `C:\Windows` en geeft alsnog **exit 0**. Elk
commando dat CommandDeck via `shell: true` of via de pty start, draaide dan in de
verkeerde map terwijl de app "✓ klaar" toonde. Dat is een correctheidsprobleem,
geen prestatieprobleem.

Op deze machine staan echte netwerkschijven om tegen te testen:

| Letter | UNC |
|---|---|
| `P:` | `\\192.168.100.200\Projecten` |
| `Z:` | `\\192.168.100.200\Medewerkers` |

**Test read-only op die shares.** Schrijf er niets naartoe — er werken collega's op.
Wil je een UNC-pad met schrijfrechten of met een spatie erin, gebruik dan
`\\127.0.0.1\C$\...` (echt UNC-pad naar de lokale schijf, zelfde padsemantiek,
geen netwerk). Laat `net use` achteraf op alleen `P:` en `Z:` staan — een `pushd`
laat bij hard afsluiten een `Y:` achter die je met `net use Y: /delete /y` opruimt.

## Wat af is

**Fase 1 — niets liegt meer.** `isUncPad()` en `uncWaarschuwing()` in
`git-tools.js`. `classifyLine()` rekent de uitwijk-melding als fout,
`runCommandOnce()` telt exit 0 na uitwijken niet als geslaagd.

**Fase 2 — cmd-commando's werken op een UNC-pad.** `cmdInMap(cmd, pad, windows)`
in `git-tools.js` maakt er `pushd "<pad>" && <cmd>` van met `cwd: null`. Gebruikt
in `runCommandOnce()` en `pty:start` in `main.js`. Op een gewoon pad verandert er
niets.

**Fase 2b — de knoppen die een LOS consolevenster openen.** Net afgerond.
`vensterInMap(pad, binnen, blijfOpen, windows)` in `git-tools.js`; gebruikt in
`shell:openCmd` (beide takken) en `bat:test` in `main.js`. `shell:openPs` is
bewust niet aangeraakt.

**Fase 3 — UNC als wortel in de boom en de verkenner.** Uitgevoerd, zie het
onderzoeksdocument.

**Tests:** alle 24 bestanden in `test/` draaien los groen (exit 0, nul FAIL).

## Drie dingen die je niet moet omgooien

Deze zijn duur betaald met metingen. Ze staan ook als comment in de code, maar het
is makkelijk ze per ongeluk "op te schonen":

1. **Geen `popd` achter een pushd-omhulsel.** `… & popd` overschrijft de exitcode
   van het commando met die van popd, waardoor een mislukking zich als geslaagd
   meldt — precies de bug die dit hele traject moest oplossen. De tijdelijke
   schijfletter valt vanzelf weg als het cmd-proces eindigt. Bij een venster dat
   blijft openstaan geldt hetzelfde, met een tweede reden: popd zou de gebruiker
   meteen weer uit de map gooien terwijl hij zit te typen.
2. **`&&` en niet `&`.** Lukt `pushd` niet (share weg, geen rechten), dan hoort
   het commando níét alsnog in een andere map te draaien.
3. **De losse-vensterknoppen moeten via `shell: true` met één commandoregel, niet
   via een argumentenlijst.** Node ontsnapt een `"` binnen een argument als `\"`
   en cmd.exe kent die schrijfwijze niet; gemeten gaf dat "The specified path is
   invalid." en helemaal geen venster. Het extra paar aanhalingstekens om de hele
   pushd-regel houdt de `&&` binnen quotes, zodat de cmd van `start` hem niet als
   scheidingsteken opvat.

En: `shell:openPs` heeft de omweg **niet** nodig. Gemeten — `start "" /D <unc>
powershell.exe` landt netjes in de share. `/D` kan een netwerkpad prima aan; het
is cmd.exe als dóélprogramma dat het weigert (en een `.bat` telt mee, want die
draait dóór cmd).

## Wat er nog moet gebeuren

### A. Melding bij de losse consolevensters (klein, het directe restje van 2b)

Bij `runCommandOnce` krijgt de gebruiker een regel te zien dat cmd via een
tijdelijke schijfletter werkt, en dat `%CD%` en `%VAR%` daardoor niet naar die map
wijzen. Bij `shell:openCmd` en `bat:test` staat die melding er niet, want een los
consolevenster heeft geen uitvoerpaneel om hem in te zetten.

Te doen: bedenken waar die melding dan wél thuishoort (renderer-toast bij het
indrukken van de knop is de voor de hand liggende kandidaat) en hem daar zetten.
`shell:openCmd` en `bat:test` geven nu `true` respectievelijk `{ ok: true, … }`
terug; kijk eerst in `renderer.js` en `preload.js` wat een rijker antwoord
(bijvoorbeeld `viaLetter: true`) breekt voordat je de vorm verandert.

### B. Fase 4 — git-begeleiding op netwerklocaties

Uit `onderzoek-netwerkschijven.md` §5:

1. Herkennen dat een projectlocatie op een netwerkschijf of UNC-pad staat.
2. Bij `git init`/koppelen daar het **bare-repo-patroon** voorstellen in plaats van
   de werkkopie op de share te zetten, met de reden erbij (`index.lock` op SMB,
   latentie bij veel kleine bestanden, PowerShell-zone `RemoteSigned` die scripts
   van de share weigert). §4 van het document heeft die redenen met metingen.
3. Bij het aanmaken van een bare repo `-b main` meegeven — `git init --bare` zet
   `HEAD` op `master` en dan komt een kloon op een lege `master` uit.
4. Een `index.lock` op een netwerkpad met meer geduld behandelen dan lokaal; de
   bestaande opruimlogica in `main.js` gaat uit van lokale schijfsnelheden.

### C. Fase 5 — optioneel, alleen als de behoefte blijkt

- Vanuit de app een share aan een letter koppelen (`net use`), zodat het
  pushd-omhulsel helemaal niet nodig is.
- Herkennen dat `P:\x` en `\\server\share\x` dezelfde map zijn, zodat
  `padHoortBij` in `accounts.js` niet struikelt over de schrijfwijze. Nu weigert
  `padToegestaan()` een git-aanroep met de andere schrijfwijze en krijgt de
  gebruiker een lege git-staat zonder uitleg.
- `DisableUNCCheck` is bewust **niet** in scope: registerwijziging die cmd
  systeembreed verandert, door Microsoft als niet-ondersteund gedocumenteerd.

## Hoe je test

`npm test` ketent met `&&` en stopt bij de eerste faler. Draai de bestanden los:

```bash
node test/git.test.js
```

Alles staat op dit moment groen. Stijl van de tests in `test/git.test.js`:
assertions op de pure functies uit `git-tools.js`, plus broncode-assertions die de
tekst van `main.js` inlezen en er regexes op loslaten (zo blijft vastgelegd dat een
handler het omhulsel écht gebruikt). Houd die stijl aan; comments in het Nederlands
en met de reden erbij, niet alleen het wat.
