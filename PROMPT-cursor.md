# Prompt voor Cursor — CommandDeck, ronde 2 van de web-functie

Plak dit als eerste bericht in een nieuwe Cursor-chat in de map
`CommandDeck`. Alles hieronder is voor de AI bedoeld.

---

Je werkt aan **CommandDeck**: een eigen Electron-app (geen framework, geen
bundler) die per project Flutter- en terminalcommando's als knoppen aanbiedt,
met een ingebouwde verkenner, een terminal, git-knoppen, meerdere gebruikers-
accounts en sinds kort het openen van websitebestanden.

Lees eerst deze bestanden, in deze volgorde:

1. `TODO-web.md` — waar je aan gaat werken staat onder **Ronde 2**
2. `web-tools.js` — de pure logica van de web-functie
3. `README.md` — hoe de app in elkaar zit
4. `TODO-git-later.md` — als voorbeeld van hoe hier beslissingen worden
   opgeschreven

## Hoe deze codebase werkt

Vier lagen, en het is belangrijk dat je ze uit elkaar houdt:

| Laag | Bestand | Wat er in hoort |
|---|---|---|
| Hoofdproces | `main.js` | alles met de schijf, processen, netwerk, ipc-handlers |
| Brug | `preload.js` | alleen doorgeven; nooit logica |
| Venster | `renderer.js` | DOM, gebruikersinteractie |
| Pure logica | `git-tools.js`, `web-tools.js`, `accounts.js`, `knoppenrij.js` | beslissingen zonder Electron, testbaar met kaal node |

De vuistregel: **elke beslissing die je kunt nemen zonder schijf of DOM hoort in
een `*-tools.js`-bestand**, want dat is wat te testen valt. `renderer.js` is
600 kB; alles wat je daarin stopt is in de praktijk ongetest.

## Huisregels — hier wordt op gelet

- **Nederlands in code-commentaar en in de UI.** Variabelen en functies ook.
- **Commentaar legt uit *waarom*, niet *wat*.** Geen `// zet x op 1`. Wel: wat
  er misging zonder deze regel, welke afweging er is gemaakt, wat de val is.
  Kijk hoe het in `git-tools.js` staat en doe het net zo.
- **Elke tekst in de UI gaat via `I18N.t(...)`** en komt in **zowel**
  `locales/nl.json` als `locales/en.json`. De overige 28 talen vallen terug op
  Engels; die hoef je niet aan te raken. Er staan tests op die controleren dat
  een sleutel in allebei bestaat.
- **Tests horen bij de wijziging, in dezelfde commit.** `npm test` draait 25
  bestanden en is nu volledig groen. Laat het groen.
- **Test wat een mens doet, niet wat de code doet.** Dit is hier echt misgegaan:
  de zijbalk-schakelaars waren groen in de tests en werkten niet in de app,
  omdat de test de functie erachter aanriep in plaats van het vinkje aan te
  klikken. `test/ui.test.js` draait de hele renderer in jsdom — gebruik dat.
- **Bewaak de grens.** Dit is een launcher, geen IDE. Als iets in `TODO-web.md`
  onder "Wat er bewust niet in komt" staat, bouw het niet, ook niet als het
  makkelijk lijkt.
- **Doe niet meer dan gevraagd.** Bij het bouwen van ronde 1 werd per ongeluk
  het gedrag van dubbelklikken voor álle tekstbestanden veranderd; dat brak een
  bestaande test en was terecht.

## Vallen die hier al geld hebben gekost

- **`[hidden]` wint alleen met `!important`.** Staat nu bovenaan `style.css`.
  Zonder die regel doet `element.hidden = true` niets bij een selector die zelf
  een `display` zet, en blijft het element gewoon staan.
- **`bat:save` dwingt `\r\n` af** omdat cmd.exe daarover struikelt. Voor html,
  css en js mag dat niet: het bestand hoort te blijven zoals het was.
  `fs:leesTekst` in `main.js` geeft daarom `crlf` en `bom` terug — gebruik die
  bij het opslaan.
- **Elke nieuwe ipc met een pad erin** hoort langs `padToegestaan()` als het om
  projectmappen gaat, anders lekt er een map van een ander account doorheen.
  (Voor losse gesleepte mappen geldt dat níét — die horen bij geen project.)
- **`termTab` kent maar twee waarden** (`output`, `browser`) en zit op ruim
  veertig plekken vast aan de gesplitste weergave. Een derde tabblad is een
  verbouwing, geen toevoeging. Zie hieronder.
- **Nooit `git reset --hard` of `git checkout .`** in deze map.

## Wat er net af is (ronde 1, werkt en is getest)

- Een **map op de app slepen** geeft de keuze: in de verkenner openen, als
  project toevoegen, of de site openen. Een map die al een project is wordt
  herkend. `verwerkGesleept()` / `vraagOverMap()` in `renderer.js`.
- **Startpagina zoeken**: `index.html` en varianten, in de map zelf en één laag
  diep in `public/`, `dist/`, `build/`, `src/`, `www/`, `site/`, `docs/`,
  `web/`, `html/`. Volgorde staat in `web-tools.js` (`startKandidaten`).
- **De site draait op een eigen servertje** (`web:start` in `main.js`) op
  `127.0.0.1` met een vrije poort — nadrukkelijk niet via `file://`, want dan
  weigert de browser `fetch`, laden ES-modules niet en wijst `/style.css` naar
  de wortel van de schijf. Padinsluiting via `WebTools.doelPad` en
  `WebTools.binnenWortel`, apart getest.
- **Leesvenster** (`#modal-lezer`) voor html, css en js: opent bij slepen van
  elk tekstbestand en bij dubbelklikken in de verkenner op een webbestand.
  Weigert boven 2 MB en bij binaire bestanden, met de knop "openen met Windows"
  ernaast.

Tests: `test/web.test.js` (pure logica + bedrading) en het blok "Een map of
bestand op de app slepen" in `test/ui.test.js`.

## Wat jij gaat doen — ronde 2: bewerken

Lees eerst `TODO-web.md` vanaf "## Ronde 2 — bewerken". In het kort, in deze
volgorde:

**2.1 Opslaan.** Het leesvenster wordt bewerkbaar. Nieuwe ipc `fs:schrijfTekst`
naast `fs:leesTekst`, met de regeleindes en de BOM van het origineel intact —
niet `bat:save` hergebruiken, die dwingt CRLF af.

**2.2 Veranderd op schijf.** Vóór het opslaan de wijzigingstijd vergelijken met
wat er bij het openen stond. Anders vragen: overschrijven of opnieuw inlezen.
`loadBatFile` / `saveBatFile` in `renderer.js` doen dit al voor `.bat` — kijk
daar hoe het opgelost is.

**2.3 Niet-opgeslagen werk.** Bij het sluiten van het venster, het wisselen van
project, het wisselen van account en het afsluiten van de app. De git-kant
heeft dit al (`controleerOnveiligWerk` in `renderer.js`) — haak daarop aan,
bouw geen tweede systeem.

**2.4 De kleine dingen.** Regelnummers, Tab die inspringt in plaats van naar de
volgende knop springt, Ctrl+S, en zoeken binnen het bestand. Zonder deze vier
is een tekstvak geen editor.

**Doe 1.5 niet zomaar.** In `TODO-web.md` staat een punt 1.5: bij een
website-project hoort de editor de plek van de uitvoer in te nemen. Dat is
gewenst, maar het vraagt dat `termTab` een derde waarde krijgt, en dat raakt de
gesplitste weergave (`werkSlots`, `termSplitFirst`,
`visueelSlotVoorTermPane`, het meten van de pty). Doe dat als een **losse
opdracht met een eigen commit**, nadat 2.1 t/m 2.4 staan — niet als bijzaak.

## Draaien en testen

```
npm start
```

```
npm test
```

```
npm run test:web
```

`npm run build` maakt de exe in `dist/`. In de app zelf zit daar een knop voor
in de titelbalk (het wolkje): die doet `npm install`, opnieuw bouwen en
herstarten.

## Werkwijze die hier bevalt

Werk in kleine stappen en laat na elke stap `npm test` groen zijn. Leg bij een
niet-voor-de-hand-liggende keuze in het commentaar uit waaróm — de volgende die
hier komt is over drie weken de gebruiker zelf. Zeg het als iets een slecht idee
is in plaats van het toch te bouwen.
