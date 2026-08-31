# Handoff — CommandDeck (21 Aug 2026)

## Wat al werkt (gebruik dit)

### 1. App-icoon in EXE
- **Probleem:** titlebar-icoon was kapot in de packaged EXE.
- **Oorzaak:** `buildResources: "assets"` → electron-builder sloot `assets/` uit van de asar.
- **Fix:** in `package.json` staat nu `"buildResources": "build"`; nsis `include` is `"installer.nsh"`.
- **Build opnieuw:** `npm run build` → nieuwe `dist/CommandDeck.exe` + `CommandDeck-Setup-1.0.0.exe`.

### 2. Update & herstart herinstalleert Setup
- **Was:** update bouwde Setup alleen naar `dist/`, draaide hem niet.
- **Nu:** na build draait stap 5/6 stil `CommandDeck-Setup-*.exe /S`.
- Code: `main.js` → `app:updateAndRestart` (batch-script).
- Tests: `test/update.test.js` (groen).

### 3. Verplaatsmodus in “deze pc” (nieuw — klaar om te gebruiken)
Knop rechts in de deze-pc-kop: **pijltjes-move** (`ti-arrows-move`), id `#sort-dezepc`.

**Hoe gebruiken:**
1. Klik het verplaats-icoon (wordt “aan”).
2. Klik bestanden/mappen om te selecteren (meerdere; Shift+klik = reeks).
3. Sleep selectie naar een **andere map** in de boom.
4. `>` / `v` bij een map: alleen open/dicht — **selecteert niet**.
5. Escape of nogmaals op het icoon: modus uit.
6. Geen uitlegtekst meer bij deze knop.

**Belangrijke bestanden:**
| Bestand | Wat |
|---------|-----|
| `renderer.js` | `boomVerplaatsModus`, `verplaatsPadenNaar`, drag/drop in `renderBoom`, knop-wiring |
| `style.css` | `.boom-verplaatsen`, `.doelwit`, `.sleept` |
| `index.html` | knop `#sort-dezepc` → `ti-arrows-move` + `tree.moveModeTitle` |
| `locales/nl.json` + `en.json` (+ overige) | `tree.moveModeTitle`, `tree.moveNothingToast` |
| `main.js` | `fs:kopieer` met `verplaatsen: true` (bestaand) |

**Sectie-volgorde** (cmd / deze pc / projecten) gaat niet meer via deze knop. Wel nog via **lang drukken** op een sectiekop en slepen.

---

## Wat nog moet gebeuren

### A. UI-tests voor verplaatsmodus afmaken (hoog)
- `test/ui.test.js` crasht niet meer, maar **`boom toont bestanden om te selecteren` faalt vaak**.
- Oorzaak: eerdere tests muteren `mappen['C:\\']` en `settings.boomOpen`; async `boom-ververs` is in jsdom lastig te timen.
- Te doen:
  1. Zorg dat na setup de boom echt `main.dart` + `leesmij.txt` toont (wacht tot `listDir` klaar is, of injecteer `boomKinderen` via een test-hook).
  2. Dan selectie + drop-assertions weer hard laten falen als het niet werkt (nu zitten die in `if (heeftBoomItems)`).
  3. Optioneel: vroeg in de suite (bij de bestaande boom-tests ~regel 689) de verplaatsmodus meteen meenemen — daar is de boom-state nog schoon.

### B. Test-harness i18n (gedaan, even checken)
- `test/ui.test.js` laadt nu `i18n.js` + `loadLocale` / `listLanguages` / `detectLanguage`.
- `loadSettings` geeft het **zelfde object** terug (geen deep copy), zodat `settings.customEditors` e.d. synchroon blijven.
- Op andere pc: `node test/ui.test.js` draaien en kijken wat nog faalt.

### C. Optionele polish verplaatsmodus
- [ ] Schijven (C:, D:) blijven niet-selecteerbaar — OK; eventueel toast als je erop klikt in verplaatsmodus.
- [ ] Drop op bestand → negeren (nu alleen mappen) — OK.
- [ ] Visuele teller “3 geselecteerd” in de deze-pc-kop.
- [ ] Ctrl+klik expliciet documenteren (nu: elke klik togglet; Shift = reeks).
- [ ] Sectie-sorteermodus (`sorteerModus === 'sectie'`) is dood via de knop; opruimen of elders herstellen als je pijltjes op sectiekoppen terug wilt.

### D. Rebuild EXE na pull op andere pc
```bat
npm install
npm test
npm run build
```
Nieuwe installer: `dist/CommandDeck-Setup-1.0.0.exe`.

---

## Snel testen met de hand
```bat
npm start
```
1. Open **deze pc**, klap een map open.
2. Klik verplaats-icoon.
3. Selecteer 2+ items → sleep naar andere map → toast “verplaatst”.
4. Check dat `>` geen selectie triggert.

---

## Context vorige chat-onderwerpen
1. Icon packing fix (`buildResources`).
2. Update-flow silent Setup reinstall.
3. Deze-pc verplaats/selectie i.p.v. sectie-sorteer + hinttekst.
