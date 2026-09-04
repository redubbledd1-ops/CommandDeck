# Todo — websitebestanden openen, bekijken en bewerken

Het idee: html-, css- en js-bestanden openen en bewerken zonder CommandDeck te
verlaten, mappen naar de app kunnen slepen, en bij zo'n map de vraag krijgen of
het een project wordt of dat de site geopend moet worden.

## Wat hiervan wel en niet de moeite waard is

**De volgorde klopt** — eerst openen, later bewerken. Wat ik zou omdraaien is
welke helft het belangrijkst is.

Een echte editor bouwen is de verkeerde kant op. Er staan al VS Code, Cursor en
Windsurf op deze pc, en die winnen altijd: aanvulling, zoeken over meerdere
bestanden, extensies, AI ernaast. Alles wat hier gebouwd wordt is daar een
slechtere versie van, en het is de kant waar een launcher verandert in een
half IDE dat niemand gebruikt.

Maar bewerken is hier ook *goedkoper* dan het lijkt, want het bestaat al. Het
bat-paneel is precies dit: een bestandslijst, een tekstvak, openen, opslaan,
herladen, en een controle of het bestand op schijf niet ondertussen veranderd
is. Dat generaliseren naar tekstbestanden is werk van uren, geen weken. Dus:
wél bewerken, maar expliciet als *snel iets aanpassen* — een kleur in de css,
een zin in de html — en niet als plek waar je een uur zit.

**De echte winst zit in het bekijken, niet in het bewerken.** Een editor heb je
al; wat je niet hebt is één klik van "map" naar "de site draait en ik zie hem".
Dat is wat een launcher hoort toe te voegen. Zie 1.3 — daar zit ook de enige
technische beslissing die echt uitmaakt.

**Mappen slepen: ja.** De haak ligt er al (`setupBatDrop`), die accepteert nu
alleen `.bat` en `.cmd`. Er komt één keuze bij en die is klein.

Eén ding erbij dat in het voorstel ontbreekt: bij een gesleepte map hoort ook
gewoon **"openen in de verkenner"** als derde keuze. Vaak wil je alleen even
kijken, en dan is zowel een project aanmaken als een site starten te veel.

## Wat er al ligt en hergebruikt kan worden

| Wat | Waar |
|---|---|
| Tekstbestand openen, bewerken, opslaan, herladen | `loadBatFile` / `saveBatFile` in `renderer.js` |
| Lezen, schrijven, wijzigingstijd | `bat:read`, `bat:save`, `bat:stat` in `main.js` |
| Bestanden op de app slepen | `setupBatDrop()` in `renderer.js` |
| Verkenner met dubbelklik op een bestand | `openBrowserItem()` in `renderer.js` |
| Boom onder "Deze PC" | `boomRijen()` in `renderer.js` |
| Project aanmaken vanuit een pad | `openNewModal()` / `saveProjectModal()` |
| Paden afschermen per account | `padToegestaan()` in `main.js` |

---

## Ronde 1 — openen — **gedaan, behalve 1.5**

### 1.1 Een map op de app slepen — **gedaan**

`setupBatDrop` splitsen in "wat is er gesleept" en "wat doen we ermee". Een map
herken je met `fs.statSync().isDirectory()` in main; het pad komt al via
`window.api.getFilePath(f)`.

Daarna een venster met drie keuzes:

- **project toevoegen** — opent het projectvenster met het pad al ingevuld
- **site openen** — alleen tonen als er html gevonden is (1.2)
- **in de verkenner openen** — `navigeerNaar(pad)`, klaar

Hoort de map al bij een project, dan zeggen dat en meteen naar dat project
springen. Twee projecten op dezelfde map is een val, geen functie.

De sleep-overlay zegt nu "alleen .bat/.cmd"; die tekst moet mee.

### 1.2 Herkennen dat het een site is — **gedaan**

Zoeken naar `index.html`, `index.htm`, `home.html`, `default.html`, `main.html`
— eerst in de map zelf, daarna één laag diep in `public/`, `dist/`, `build/`,
`src/`, `www/`, `site/`, `docs/`. Niet dieper: bij `node_modules` loop je
anders duizenden mappen af voor een vraag die binnen een tel beantwoord moet
zijn.

Meerdere gevonden? Laten kiezen, met het pad erbij. Niets gevonden? Dan valt
"site openen" gewoon weg — geen knop die een foutmelding geeft.

Dit hoort een pure functie in `git-tools.js`-stijl te worden (bijvoorbeeld
`web-tools.js`), zodat het te testen is zonder schijf.

### 1.3 De site openen — met een eigen server, niet met `file://` — **gedaan**

**Dit is de beslissing die het verschil maakt tussen werkt en werkt-half.**

`file://` breekt precies de dingen waar moderne sites op leunen: `fetch` wordt
door CORS geweigerd, ES-modules (`<script type="module">`) laden niet, en een
absoluut pad als `/style.css` wijst naar de wortel van je schijf in plaats van
naar de site. Je krijgt dan een pagina die er kapot uitziet terwijl er niets
mis is.

Dus: een kleine statische server in het hoofdproces met de ingebouwde
`http`-module van node — geen extra afhankelijkheid. Luisteren op `127.0.0.1`
op een vrije poort, alleen bestanden binnen de gekozen map serveren (`..` en
symlinks weigeren), en de juiste `Content-Type` meegeven. Eén server per
geopende site, opruimen zodra hij dicht gaat en bij het afsluiten van de app.

Waar de pagina te zien is, is een aparte keuze:

- **in de standaardbrowser** — een regel code, en je hebt meteen echte
  DevTools. Begin hier.
- **in de app** — mooier, maar dat vraagt een `WebContentsView` of een
  `<webview>`, en dat is een eigen brok werk. Pas doen als het eerste bevalt.

### 1.4 Een bestand openen om te lezen — **gedaan**

Dubbelklikken in de verkenner opent nu altijd het programma dat Windows eraan
gekoppeld heeft. Voor `.html`, `.css`, `.js`, `.json`, `.md`, `.txt` en `.svg`
zou dat een leespaneel in de app moeten worden, met de knop "openen met
Windows" ernaast voor als je toch je editor wilt.

Grenzen meteen inbouwen: niets boven ongeveer 2 MB, en niets wat binair blijkt
(een nulbyte in de eerste kilobyte is een goede test). Een tekstvak met een
video erin is een vastgelopen app.

### 1.5 Bij een website-project staat de editor voorop — *nog niet, en duurder dan gedacht*

Bij een Flutter-project is de uitvoer het hart: je drukt op run en kijkt wat de
terminal zegt. Bij een map met html en css is dat andersom — daar is de
terminal de uitzondering en het bestand de hoofdzaak.

Dus: bij zo'n project hoort de editor de plek van de uitvoer over te nemen.

**Niet door de uitvoer weg te halen.** Ook in een website-project draai je nog
`npm run build`, en de git-knoppen schrijven hun uitvoer daar. Weghalen kost je
dat, en dan mis je het precies op het moment dat er iets misgaat.

Wel door hem naar achteren te zetten. Op die plek zit al een tabstrip
(`termTab`, nu `output` en `browser`), dus de editor wordt daar een derde
tabblad, en bij een website-project is dát het tabblad dat opengaat. De uitvoer
staat er nog, één klik verderop, en springt vanzelf naar voren zodra er iets
draait — dat doet `springNaarOutput()` al.

Herkennen welk soort project het is kan met hetzelfde patroon als nu voor
Flutter: `bepaalToolsVoorProject()` kijkt naar `pubspec.yaml` en verbergt de
tools-sectie als het geen Flutter is. Daar komt bij: is er html gevonden (1.2)
en geen `pubspec.yaml`, dan is het een website-project. Bewaren bij het project
zelf, naast `secties`, zodat je het per project kunt overrulen — de gok van de
app hoort nooit de laatste zijn.

**Waarom dit is blijven staan.** `termTab` staat op ruim veertig plekken in
`renderer.js` en is verweven met de gesplitste weergave: `werkSlots`,
`termSplitFirst`, `visueelSlotVoorTermPane`, het meten van de pty. Overal staat
`tab === 'browser' ? 'browser' : 'output'` — twee waarden, hard aangenomen. Een
derde erbij is geen toevoeging maar een verbouwing van het hart van de app, en
dat is niet iets om aan het eind van een avond te doen naast vier andere
dingen. Het leesvenster staat daarom nu als eigen venster; als het bewerken er
in ronde 2 bij komt is dat het natuurlijke moment om die verbouwing apart en
met rust te doen.

Openstaande vraag voor als het zover is: welk bestand staat er open als je het
project opent? Het gevonden `index.html` is de logische gok; onthouden wat je
het laatst open had is waarschijnlijk beter. Beginnen met de gok, en pas
onthouden zodra het irritant wordt.

---

## Ronde 2 — bewerken — **gedaan**

### 2.1 Opslaan — **gedaan**

`bat:save` doet bijna alles goed, met één ding dat níét mee mag: hij dwingt
`\r\n` af omdat cmd.exe daarover struikelt. Voor html en js hoort het bestand
te blijven zoals het was. Dus: regeleindes detecteren bij het lezen en bij het
opslaan teruggeven, of de bestaande dwang achter een vlag zetten.

Let ook op de BOM en op bestanden die geen UTF-8 zijn; die laatste liever
weigeren dan stilletjes verminken.

### 2.2 Veranderd op schijf — **gedaan**

Het bat-paneel controleert de wijzigingstijd vóór het opslaan. Dat gedrag
overnemen: is het bestand ondertussen door je editor aangeraakt, dan vragen —
overschrijven, of opnieuw inlezen. Niet stilletjes de ander overschrijven.

### 2.3 Niet-opgeslagen werk — **gedaan**

Wisselen van bestand, van project, van account, en het afsluiten van de app:
overal hoort de vraag te komen. De afsluitcontrole van de git-kant is hier het
model — en de haak bestaat al, dus dit is aanhaken en niet opnieuw bouwen.

### 2.4 De kleine dingen die het bruikbaar maken — **gedaan**

Regelnummers, Tab die inspringt in plaats van naar de volgende knop springt,
Ctrl+S, zoeken binnen het bestand. Zonder deze vier is een tekstvak geen
editor maar een formulier.

---

## Ronde 3 — pas als ronde 1 en 2 staan

### 3.1 Herladen bij opslaan

Sla je op terwijl de site openstaat, dan hoort de pagina zichzelf te
verversen. Met een eigen server is dat goedkoop: een `EventSource` op de
pagina en een `fs.watch` op de map. Dit is het moment waarop het geheel meer
wordt dan de som — bewerken en meteen zien.

### 3.2 Meerdere bestanden tegelijk

Tabjes boven het paneel. Pas zinvol als je merkt dat je heen en weer springt
tussen html en css; eerder is het complexiteit zonder aanleiding.

### 3.3 Kleuren in de code — misschien nooit

Twee wegen en allebei kosten iets. Een echte editorcomponent (CodeMirror,
Monaco) doet het goed maar is een afhankelijkheid van honderden kilobytes in
een app die er nu vier heeft. Zelf met reguliere expressies kleuren is altijd
nét verkeerd bij een apostrof in een comment of een template-string.

Voorstel: overslaan tot je merkt dat je het mist. Zwarte tekst in een net
lettertype leest prima voor het soort aanpassing waar dit paneel voor is.

---

## Wat er bewust niet in komt

Aanvulling, foutmarkering, refactoring, extensies, git-diff in de editor,
meerdere cursors, een bestandsboom binnen de editor. Dat is de lijst die van
een launcher een slecht IDE maakt. De grens bewaken is hier belangrijker dan
de lijst afwerken — net als bij de git-functie.

## Vallen om te onthouden

- `file://` breekt fetch, modules en absolute paden. Vandaar 1.3.
- `bat:save` dwingt CRLF af. Dat mag hier niet mee.
- Elke nieuwe ipc met een pad erin langs `padToegestaan()`, anders lekt er een
  map van een ander account doorheen.
- Een gesleepte map hoort bij het account dat op dat moment ingelogd is.
- Nieuwe panelen die met `hidden` verborgen worden zijn nu goed: sinds de regel
  `[hidden] { display: none !important; }` bovenaan `style.css` hoeft daar
  geen eigen regel meer bij.
- Test wat een mens doet, niet wat de code doet. De zijbalk-schakelaars waren
  groen in de tests en werkten niet in de app, omdat de test de functie erachter
  aanriep in plaats van het vinkje aan te klikken.
