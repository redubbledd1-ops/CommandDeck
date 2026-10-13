# Git in CommandDeck — wat er nog niet is

Wat er nu staat: koppelen, status, commit, push, pull, fetch, stash, stash
terughalen, log, een indicator in de projectkop, een afsluitcontrole en een
achterstandmelding. Dat dekt de dagelijkse lus van één persoon op twee
machines.

Fetch en stash staan sinds fase 1 standaard uit: ze bestaan nog, maar je zet
ze per project aan bij de projectinstellingen. Wat overblijft is de rij die je
elke dag gebruikt.

Sinds fase 2 is er ook een identiteit: profielen met naam, e-mailadres en
GitHub-account, per project te kiezen, met een controle vóór elke commit. Wat
de app daar wél en niet kan, staat in 1.2.

Dit document gaat over de rest. Niet om alles te bouwen — CommandDeck is een
launcher, geen git-client, en de grens bewaken is belangrijker dan de lijst
afwerken. Maar wat hier staat is wat andere gebruikers zullen missen.

**Volgorde is bewust.** Van "dit gaat vandaag nog iemand pijn doen" naar
"leuk als het er ooit is".

---

## 1. Gaten die nu al schuren

Dingen die met de huidige functies fout kunnen gaan, of die we onderweg zelf
zijn tegengekomen.

### 1.1 Een stash die je niet terug kunt halen — ~~*klein, hoge urgentie*~~ **gedaan**

De knop `stash terughalen` verschijnt vanzelf zodra er iets in de stash zit,
laat zien wat erin zit, en kan terughalen of weggooien. De melding bij het
opstarten verwijst niet meer naar een commando maar naar die knop.

`apply` is er bewust niet: het verschil tussen apply en pop uitleggen kost meer
dan het oplevert, en pop laat bij een conflict de stash tóch staan.

Wat het bouwen aan het licht bracht en de moeite van het onthouden waard is:

- `git stash pop` heeft **twee** manieren om niet te slagen, en ze zien er in
  de terminal bijna hetzelfde uit. Bij een conflict voegt git samen en zet er
  markeringen in; werk je zelf in dezelfde bestanden, dan kapt hij er meteen
  mee ("your local changes would be overwritten") en gebeurt er niets. In
  beide gevallen blijft de stash staan, dus daar kun je ze niet aan
  herkennen — wel aan de `u`-regels in `status --porcelain=v2`.
  Het tweede geval is dat wat je in de praktijk raakt.
- `git stash list --date=short --pretty=%gd...` geeft `stash@{2026-09-01}` in
  plaats van `stash@{0}`: een datumopmaak verandert óók `%gd`, en dan is de
  index weg. Datum dus via `%cs`.

### 1.2 Geen naam ingesteld → commit faalt — ~~*klein*~~ **gedaan**

De commitknop controleert nu vóór het bericht of `user.name` en `user.email`
er zijn, en biedt aan ze in te stellen. Meteen ook de andere kant op: staat er
een naam die bij geen enkel profiel hoort, dan zegt hij dat vóór de commit in
plaats van erna.

Nagelopen op deze pc: er is hier géén globale `user.name`/`user.email`, dus een
vers `git init` liep echt tegen *"Author identity unknown"* aan. Dit was geen
theoretisch geval.

Daarbovenop (fase 2 uit het losse plan, niet uit dit document):

- **Profielen** in de instellingen: label, naam, e-mailadres, GitHub-naam, en
  of de inloggegevens onthouden mogen worden. Eén is de standaard.
- **Per project** een profiel kiezen. Toepassen zet `user.name` en
  `user.email` in `.git/config`, dus het geldt ook buiten de app om.
- **Zichtbaar** naast de branch-indicator onder wiens naam je zit. Klopt het,
  dan alleen bij meer dan één profiel — met één identiteit valt er niets te
  verwisselen. Klopt het niet, dan altijd.
- **Wisselen van GitHub-account** via `credential.https://github.com.username`
  per repo.

Wat het uitzoeken opleverde en de moeite van het onthouden waard is:

- **`gh` staat niet op deze pc**, en de credential helper is Git Credential
  Manager op systeemniveau (`C:/Program Files/Git/etc/gitconfig`). De route
  voor accounts is dus `credential.https://github.com.username`, niet
  `gh auth switch`. Die tweede wordt alleen aangeboden als gh zich daadwerkelijk
  als credential helper heeft ingeschreven — dat is nu nergens getest.
- **Een lege `credential.helper` is onzichtbaar voor `--get-all`.** Precies wat
  "elke keer vragen" zet, geeft daar een lege regel terug: niet te
  onderscheiden van "staat er niet". Via `--local --list` staat hij er als
  `credential.helper=` en is hij wél te zien. Zonder dat zou terugzetten naar
  "onthouden" de helper voorgoed uit laten staan.
- **Een lege lokale helper zet de systeem-manager echt uit.** Nagegaan met
  `GIT_TRACE=1` tegen een verzonnen host: mét helper draait
  `git credential-manager get`, zonder helper gaat git meteen naar de
  terminalprompt. Daarom lopen push en pull bij zo'n profiel via de echte
  terminal van de app — zonder toetsenbord blijft zo'n push hangen.

### 1.3 Meerdere locaties per project worden genegeerd — *middel*

Een project kan meerdere locaties hebben, maar de indicator, de
afsluitcontrole en de achterstandmelding kijken alleen naar de *actieve*
locatie. Heb je Resume met een tweede locatie voor de extensie, en staat daar
niet-gepusht werk, dan zegt de afsluitcontrole niets.

Nodig: alle locaties van een project langslopen. De logica in `git-tools.js`
werkt al per pad, dus dit is vooral bedrading.

### 1.4 Commit is alles-of-niets — *middel*

`git add -A` pakt alles. Je kunt niet kiezen welke bestanden meegaan, en je
ziet vooraf niet wát er verandert. Voor een launcher is dat te verdedigen —
maar het is de reden dat mensen alsnog naar de terminal grijpen.

Zie ook 2.1 en 2.2; deze drie horen bij elkaar.

---

## 2. Wat gebruikers het eerst zullen vragen

### 2.1 Zien wat er verandert vóór je commit — *middel, hoge waarde*

Nu commit je blind. Een diff-weergave — welke regels erbij, welke eraf — is
waarschijnlijk het waardevolste dat ontbreekt. Niet alleen voor het gemak: het
is hoe je merkt dat er per ongeluk een sleutel, een pad of een debug-regel
meegaat.

Minimale vorm: `git diff` in de terminal met kleur, via een knop. Betere vorm:
een paneel met bestand-voor-bestand.

### 2.2 Selectief committen — *groot*

Bestanden aan- en uitvinken, iets uit de staging halen, de wijzigingen in één
bestand weggooien. Dit is de staging-area van git, en het is echt werk om goed
te doen. Hoort samen met 2.1: zonder diff heeft aanvinken weinig zin.

### 2.3 Branches — *groot, en het grootste inhoudelijke gat*

Er is nu niets. Wat mensen verwachten:

- lijst van branches, lokaal en op de remote
- wisselen — met een waarschuwing als je niet-vastgelegd werk hebt
- nieuwe branch maken, eventueel vanaf een specifieke commit
- branch verwijderen (met een duidelijk verschil tussen lokaal en remote)
- mergen, of rebasen

Twee dingen om vooraf te beslissen:

**Conflicten.** Een merge kan misgaan. Een conflict oplossen is precies het
soort werk waar een launcher niet voor bedoeld is. Voorstel: conflicten
detecteren, duidelijk melden, en dan de map in de editor of terminal openen.
Niet zelf een merge-tool bouwen.

**Wisselen met vuil werk.** Git weigert soms, en stasht soms half. Hier moet
de app expliciet in zijn: eerst committen, eerst stashen, of annuleren.

### 2.4 Terugdraaien — *middel*

- laatste commit ongedaan maken (`reset --soft HEAD~1`) — de meestgevraagde
- laatste commit aanvullen (`commit --amend`), voor de typefout in het bericht
- wijzigingen in één bestand weggooien
- een commit terugdraaien met `revert`

Alles hier is gevaarlijk en hoort achter een bevestiging met danger-styling,
net als stash. `reset --hard` zou ik helemaal niet aanbieden.

### 2.5 Meerregelige commit-berichten — *klein*

Nu gaat het bericht via `-m "..."` naar cmd.exe, dus één regel, en
aanhalingstekens worden vervangen. Een tekstvlak met een echte titel- en
tekstregel vraagt om `git commit -F <bestand>` in plaats van `-m`. Meteen ook
het `%NAAM%`-randgeval van cmd.exe weg.

---

## 3. Samenwerken

Op dit moment gaat alles uit van één persoon met één remote.

### 3.1 Pull requests — *middel*
`gh pr create`, openstaande PR's zien, een PR-branch uitchecken. Alleen zinvol
met `gh` geïnstalleerd, dus met een nette terugval.

### 3.2 Meerdere remotes — *klein*
Een fork met `origin` en `upstream` is normaal. De code kiest nu `origin`, of
anders de eerste remote. Dat is een aanname die stilletjes fout kan gaan.

### 3.3 Tags en releases — *klein*
Tag zetten, tags pushen, een GitHub-release maken. Past goed bij de
build-knoppen die er al zijn.

### 3.4 Een repo clonen als nieuw project — *middel*
Nu is de volgorde: eerst een map, dan koppelen. Andersom kan niet: een
GitHub-url plakken en er een project van maken. Dat is voor een nieuwe
gebruiker waarschijnlijk de eerste dingen die hij probeert.

---

## 4. Bewaken en behoeden

Dit is waar CommandDeck iets kan wat een gewone git-client niet doet: fouten
tegenhouden vóórdat ze in je geschiedenis staan. Alle vier zijn wij zelf
tegengekomen bij het opzetten van resume en CommandDeck.

### 4.1 .gitignore-assistent — *klein, hoge waarde*
Bij `git init` of de eerste commit kijken wat er in de map staat en een
passende `.gitignore` voorstellen. `node_modules` (838 MB) en `dist` (193 MB)
in je eerste commit is een fout die je nooit meer netjes weg krijgt.

### 4.2 Waarschuwen bij een grote commit — *klein*
Aantal bestanden en totale grootte tonen in het commit-venster, en boven een
drempel expliciet vragen. Staat al als open beslissing in `TODO-git.md`.

### 4.3 Sleutels zoeken vóór de eerste push — *middel*
Scannen op API-sleutels, tokens en `.env`-bestanden voordat een repo publiek
gaat. Vooral bij de keuze "publiek" in de koppel-dialoog.

### 4.4 Regeleindes — *klein*
Zonder `.gitattributes` ziet een tweede machine álle bestanden als gewijzigd.
Detecteerbaar (veel bestanden gewijzigd zonder inhoudelijk verschil) en op te
lossen met één voorstel.

---

## 5. Verder kijken

### 5.1 Geschiedenis doorbladeren — *groot*
De log-knop dumpt twintig regels tekst. Wat ontbreekt: doorbladeren, zoeken,
een commit aanklikken om de diff te zien, de geschiedenis van één bestand, en
blame ("wie schreef deze regel en waarom").

Dit is het punt waarop je je moet afvragen of je geen git-client aan het
bouwen bent. Een tussenweg: een knop die de geschiedenis in de editor of op
GitHub opent.

### 5.2 Submodules — *groot, weinig gebruikers*
Alleen relevant als iemand ze gebruikt. Wel goed om ze te *herkennen* en te
zeggen dat de app ze niet beheert, in plaats van er stilletjes langs te lopen.

### 5.3 Worktrees — *niche*
Meerdere branches tegelijk uitgecheckt. Past eigenlijk goed bij het idee van
meerdere locaties per project, maar vrijwel niemand vraagt erom.

### 5.4 Git LFS — *niche*
Herkennen en waarschuwen is genoeg. Beheren niet.

---

## 6. Nog open uit het oorspronkelijke plan

Ronde 4 (polish) uit `TODO-git.md`:

- poll-interval instelbaar maken (nu de constante `GIT_POLL_MS` in renderer.js)
- in het instellingenlijstje "zichtbare commando's" de knoppen doorstrepen die
  in dít project toch niet kunnen verschijnen, met de reden erbij.
  Half gedaan: knoppen met `standaardUit: true` krijgen daar nu "standaard uit"
  achter hun naam, zodat een leeg vinkje niet lijkt op iets wat je zelf ooit
  hebt weggeklikt. Wat er nog niet staat is de reden waarom een knop in dít
  project niet kán verschijnen (geen remote, geen commits).
- iconen en volgorde nalopen
- de overige talen aanvullen (nu alleen nl en en; de rest valt terug op en)

---

## Wat ik níét zou bouwen

Zeggen wat er niet in hoort is net zo nuttig als de lijst hierboven.

- **Een merge-conflict-oplosser.** Detecteren en doorverwijzen, niet zelf doen.
- **`reset --hard` als knop.** Er is geen bevestiging die dat veilig maakt.
- **Force push.** Wie het nodig heeft, kan het typen.
- **Een volledige geschiedenis-browser.** Dat is een ander product.
- **Automatisch committen of pushen.** Een commit zonder bericht dat jij hebt
  getypt, begrijp je over een maand niet meer.
