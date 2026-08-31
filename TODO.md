# Todo — verkenner uitbreiden

Opgesplitst in drie rondes. Ronde 1 is de basis waar 2 en 3 op voortbouwen.

## Waar het staat in de code

| Wat | Waar |
|---|---|
| Verkenner (UI, navigatie, selectie) | `renderer.js`, zoek op `── Verkenner ──` |
| Maplijst, schijven, archieven | `main.js`, handlers `fs:listDir`, `fs:listDrives`, `arch:*` |
| Zip lezen en uitpakken | `archive.js` |
| Stijl van de verkenner | `style.css`, zoek op `── Verkenner ──` |
| Brug tussen beide | `preload.js` |

Testen: `npm test` (nu 892 controles). Losse onderdelen: `npm run test:ui`, `npm run test:archive`.

---

## Ronde 1 — selecteren ✅ af

- [x] Meerdere bestanden selecteren met **Ctrl+klik**
- [x] Een reeks selecteren met **Shift+klik**
- [x] **Slepen met een selectiekader** vanaf een lege plek, met Ctrl om toe te voegen
- [x] Ctrl+A voor alles, Escape om op te heffen
- [x] Statusregel onderaan met aantal en totale grootte
- [x] Pijltjes met Shift breiden de reeks uit

`browserKeuze` is vervangen door `browserSelectie` (een Set), plus `browserFocus`
en `browserAnker`. Zie `── Verkenner ──` en `── Selectiekader ──` in `renderer.js`.

---

## Ronde 2 — rechtsklikmenu met veilige acties ✅ af

- [x] Rechtsklikmenu op een regel en op een lege plek
- [x] **Openen**, ook meerdere tegelijk
- [x] **Openen met…** via `rundll32.exe shell32.dll,OpenAs_RunDLL`
- [x] **Pad kopiëren** en **naam kopiëren**
- [x] **Tonen in de verkenner** (`shell.showItemInFolder`)
- [x] **Nieuw bestand** en **nieuwe map**, met een naamvenster
- [x] **Inpakken naar zip** — eigen zip-schrijver in `archive.js`
- [x] **Eigenschappen** — type, grootte, datums, pad

Binnen een archief vallen aanmaken en inpakken weg; daar kun je niets wijzigen.
Zip schrijven zit in `schrijfZip()`; de uitkomst is door Python als geldig
zipbestand gelezen. Rar/7z inpakken is er niet: 7-Zip aanroepen zou kunnen,
maar dat is alleen zinnig als het toch al geïnstalleerd is.

---

## Ronde 3 — bestandsbewerkingen ✅ af

- [x] **Kopiëren**, **knippen** en **plakken** (menu en Ctrl+C / Ctrl+X / Ctrl+V)
- [x] **Verwijderen** (Delete → prullenbak, Shift+Delete → definitief na waarschuwing)
- [x] **Hernoemen** (menu en F2)

Hoe het is opgelost:

- kopiëren gaat in blokken van 1 MB, zodat de voortgang te zien is en je kunt
  afbreken; `copyFileSync` zou het venster laten bevriezen
- verplaatsen binnen dezelfde schijf is één `rename`; over schijven heen wordt
  het kopiëren gevolgd door verwijderen
- bij bestaande namen wordt eerst gevraagd: vervangen of ernaast zetten
- een map in zichzelf plakken wordt geweigerd
- geknipte items worden lichter getoond tot je plakt
- verwijderen gaat via `shell.trashItem()`; definitief alleen na bevestiging

## Tussendoor — meldingen en klembord ✅ af

- [x] Alle meldingen in de kleuren van de app; `window.confirm` en `alert` zijn weg
- [x] Bij een bestaande naam drie keuzes: **vervangen**, **beide houden**, **annuleren**
- [x] Kopiëren zet de bestanden echt op het **klembord van Windows** (PowerShell in
      STA-modus met `SetFileDropList` plus de vlag "Preferred DropEffect")
- [x] Plakken pakt ook op wat je búiten de app hebt gekopieerd
- [x] **Ctrl+Shift+V** toont eerst de lijst met wat er op het klembord staat

De vraagvensters lopen via `vraagKeuze()` / `vraagJaNee()` in `renderer.js`; de
markup staat in `index.html` als `#modal-vraag` en `#modal-klembord`. Testen:
`node test/klembord.test.js` voor de kant van Windows, de rest in `test/ui.test.js`.

---

## Ronde 4 — mapgroottes ✅ af

- [x] Grootte per map in de rechterkolom
- [x] Op de achtergrond, één map tegelijk, met de uitkomst in een cache
- [x] Stopt zodra je wegnavigeert
- [x] Een puntje zolang het nog loopt
- [x] Rechtsklik **Grootte berekenen** voor één map, met een ruimere tijdslimiet
- [x] Schakelaar in de instellingen: automatisch of alleen op verzoek

Hoe het is opgelost:

- `fs:mapGrootte` in `main.js` loopt de boom af met `fs.promises`, en vraagt de
  bestanden van één map in één keer op (`Promise.all`) — het venster blijft
  daardoor reageren. Gemeten op `node_modules`: 10.628 bestanden, exact dezelfde
  uitkomst als `find`, en de tijdlus liep gewoon door tijdens het meten.
- Elke ronde heeft een nummer; `fs:stopGroottes` verhoogt dat, waarna een lopende
  meting zichzelf afbreekt. Zo blijft er niets doorlopen als je wegklikt.
- Per map een limiet van 12 seconden, per ronde 90 seconden in totaal. Wat niet
  af kwam wordt getoond als `> 1,4 GB` — minstens zoveel dus.
- Snelkoppelingen worden niet gevolgd, anders tel je dubbel of loop je rond.
- De cache wordt gewist voor de betrokken paden na plakken, verwijderen,
  hernoemen, aanmaken en inpakken.

Testen: `node test/mapgrootte.test.js` voor de meter zelf, de rest in `test/ui.test.js`.

---

## Los punt

Je laatste bericht eindigde met "en ohja" en werd daar afgekapt — dat punt is nooit
aangekomen.
