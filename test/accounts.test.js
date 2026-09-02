const fs = require('fs'), path = require('path')
const A = require('../accounts')

let ok = true
const t = (l, c) => { console.log((c ? 'PASS  ' : 'FAIL  ') + l); if (!c) ok = false }
const gelijk = (l, a, b) => t(l, JSON.stringify(a) === JSON.stringify(b))

// ── id's en namen ────────────────────────────────────────────────────────────
const id1 = A.nieuwAccountId(1000, 0.5)
t('een id is herkenbaar en bruikbaar als bestandsnaam', A.geldigAccountId(id1))
t('twee id\'s op verschillende momenten verschillen',
  A.nieuwAccountId(1000, 0.1) !== A.nieuwAccountId(2000, 0.1))
for (const slecht of ['', 'acc', 'acc-x', '../etc', 'acc_../x', 'ACC_1', null]) {
  t('geweigerd als id: ' + JSON.stringify(slecht), A.geldigAccountId(slecht) === false)
}

t('naam wordt opgeschoond', A.schoneNaam('  Jan   Jansen \n') === 'Jan Jansen')
t('en afgekapt', A.schoneNaam('x'.repeat(200)).length === A.MAX_NAAM)
t('lege naam blijft leeg', A.schoneNaam('   ') === '')

const acc = A.maakAccount({ naam: 'Collega', icoon: '🧑' })
t('een nieuw account is geldig', A.accountGeldig(acc))
t('zonder naam valt hij terug op iets bruikbaars', A.maakAccount({}).naam === 'Account')
t('een meegegeven geldig id blijft staan', A.maakAccount({ id: id1, naam: 'x' }).id === id1)
t('een ongeldig id wordt vervangen', A.geldigAccountId(A.maakAccount({ id: '../x', naam: 'x' }).id))

// ── namen moeten onderscheidend zijn ─────────────────────────────────────────
const lijst = [A.maakAccount({ naam: 'Ik' }), A.maakAccount({ naam: 'Collega' })]
t('een vrije naam mag', A.naamVrij(lijst, 'Derde'))
t('een bezette niet', !A.naamVrij(lijst, 'Collega'))
t('hoofdletters maken niet uit', !A.naamVrij(lijst, 'COLLEGA'))
t('jezelf hernoemen naar dezelfde naam mag', A.naamVrij(lijst, 'Collega', lijst[1].id))
t('een lege naam nooit', !A.naamVrij(lijst, '   '))

// ── projectbestanden ─────────────────────────────────────────────────────────
// Het eerste account erft projects.json: een bestaande installatie mag niets
// kwijtraken door een functie die er later bij kwam.
t('het eerste account erft het bestaande bestand',
  A.projectBestand(lijst[0].id, lijst[0].id) === 'projects.json')
t('elk volgend account krijgt een eigen bestand',
  A.projectBestand(lijst[1].id, lijst[0].id) === 'projects-' + lijst[1].id + '.json')
t('twee accounts delen nooit een bestand',
  A.projectBestand(lijst[0].id, lijst[0].id) !== A.projectBestand(lijst[1].id, lijst[0].id))
t('een onzin-id valt terug op het standaardbestand',
  A.projectBestand('../../etc/passwd', lijst[0].id) === 'projects.json')
t('het bestandspad bevat nooit een schuine streep',
  !A.projectBestand(lijst[1].id, lijst[0].id).includes('/'))

// ── migratie van een bestaande installatie ───────────────────────────────────
const vers = A.migreer({})
t('zonder accounts wordt er één gemaakt', vers.accounts.length === 1)
t('en die is meteen actief', vers.actiefAccount === vers.accounts[0].id)
t('en dat wordt gemeld zodat het opgeslagen kan worden', vers.gemigreerd === true)

const bestaand = A.migreer({ accounts: lijst, actiefAccount: lijst[1].id })
t('bestaande accounts blijven staan', bestaand.accounts.length === 2)
t('het actieve account blijft actief', bestaand.actiefAccount === lijst[1].id)
t('en er wordt niets opnieuw gemigreerd', bestaand.gemigreerd === false)
t('een actief account dat niet bestaat valt terug op de eerste',
  A.migreer({ accounts: lijst, actiefAccount: 'acc_weg' }).actiefAccount === lijst[0].id)
t('rommel in de lijst wordt genegeerd',
  A.migreer({ accounts: [{ id: 'fout' }, lijst[0]] }).accounts.length === 1)

// ── welke instellingen zijn persoonlijk ──────────────────────────────────────
let s = { taal: 'nl', git: { afsluiten: 'waarschuwen', pollSec: 30 } }
s = A.metAccountInstellingen(s, lijst[1].id, { git: { afsluiten: 'uit' } })

t('git is persoonlijk', A.PERSOONLIJK.includes('git'))
t('de collega heeft zijn eigen keuze',
  A.samengevoegd(s, lijst[1].id).git.afsluiten === 'uit')
t('en erft de rest van de gedeelde instellingen',
  A.samengevoegd(s, lijst[1].id).git.pollSec === 30)
t('het andere account merkt daar niets van',
  A.samengevoegd(s, lijst[0].id).git.afsluiten === 'waarschuwen')
t('gedeelde instellingen blijven gedeeld',
  A.samengevoegd(s, lijst[1].id).taal === 'nl')
t('een onbekend account krijgt gewoon de gedeelde instellingen',
  A.samengevoegd(s, 'acc_onbekend').git.afsluiten === 'waarschuwen')
t('samenvoegen verandert het origineel niet', s.git.afsluiten === 'waarschuwen')

// ── verwijderen ──────────────────────────────────────────────────────────────
t('het laatste account kan niet weg', A.naVerwijderen([lijst[0]], lijst[0].id, lijst[0].id) === null)
const na = A.naVerwijderen(lijst, lijst[0].id, lijst[1].id)
t('een ander account kan wel weg', na.accounts.length === 1)
t('en het actieve blijft actief', na.actiefAccount === lijst[0].id)
const na2 = A.naVerwijderen(lijst, lijst[1].id, lijst[1].id)
t('verwijder je jezelf, dan schuift het actieve door', na2.actiefAccount === lijst[0].id)

// ── pincode ──────────────────────────────────────────────────────────────────
// Waar dit voor is: voorkomen dat je per ongeluk in het verkeerde account komt.
// Niet: iemand tegenhouden die de bestanden opent.
// Vrije tekst, geen eisen aan de samenstelling. Vier cijfers moet kunnen, een
// wachtwoordzin ook. Drie tekens niet.
for (const goed of ['1234', '0000', '12345678', 'hallo', 'mijn wachtwoord', 'a1!x', 'ë2ü9']) {
  t('geldige code: ' + JSON.stringify(goed), A.geldigePin(goed) === true)
}
for (const slecht of ['123', 'abc', '', '   ', '  a ', null, undefined, 'x'.repeat(65)]) {
  t('geweigerd als code: ' + JSON.stringify(slecht), A.geldigePin(slecht) === false)
}
t('precies vier telt', A.geldigePin('abcd') === true)
t('drie niet', A.geldigePin('abc') === false)
t('spaties binnenin mogen', A.geldigePin('a b c') === true)

const eenAcc = [A.maakAccount({ naam: 'Ik' })]
const tweeAcc = [...eenAcc, A.maakAccount({ naam: 'Collega' })]
t('bij één account vragen we niets', A.pinNodig(eenAcc) === false)
t('vanaf twee altijd', A.pinNodig(tweeAcc) === true)
t('lege lijst vraagt niets', A.pinNodig([]) === false)

t('een vers account heeft nog geen pincode', A.heeftPin(eenAcc[0]) === false)
t('een half ingevulde pincode telt niet',
  A.heeftPin({ pin: { hash: 'abc' } }) === false && A.heeftPin({ pin: { salt: 'x' } }) === false)
t('met salt én hash wel', A.heeftPin({ pin: { salt: 'x', hash: 'y' } }) === true)

t('bij één account is niemand zonder pincode een probleem',
  A.accountsZonderPin(eenAcc).length === 0)
t('bij twee accounts zijn ze dat allebei',
  A.accountsZonderPin(tweeAcc).length === 2)
t('en wie er wel een heeft valt af',
  A.accountsZonderPin([{ ...tweeAcc[0], pin: { salt: 'x', hash: 'y' } }, tweeAcc[1]]).length === 1)

// Num Lock uit: de cijfertoetsen rechts sturen dan een pijltje. De fysieke
// toets klopt wel, en die gebruiken we.
t('Num Lock uit levert alsnog het cijfer', A.cijferUitToets('Numpad4', 'ArrowLeft') === '4')
t('ook voor 8', A.cijferUitToets('Numpad8', 'ArrowUp') === '8')
t('ook voor 9', A.cijferUitToets('Numpad9', 'PageUp') === '9')
t('ook voor 0', A.cijferUitToets('Numpad0', 'Insert') === '0')
t('Num Lock aan laten we met rust — anders komt het cijfer er dubbel in',
  A.cijferUitToets('Numpad4', '4') === '')
t('de gewone cijferrij ook', A.cijferUitToets('Digit7', '7') === '')
t('letters doen niets', A.cijferUitToets('KeyA', 'a') === '')
t('de punt op het numerieke blok ook niet', A.cijferUitToets('NumpadDecimal', 'Delete') === '')
t('niets in, niets uit', A.cijferUitToets('', '') === '' && A.cijferUitToets(null, null) === '')

// ── het account ís de git-identiteit ─────────────────────────────────────────
// Geen account mét ergens een profiel ernaast dat je kunt vergeten: wie je in
// de app bent en wie je in git bent, is dezelfde persoon.
const metGit = A.maakAccount({ naam: 'Redub', gitNaam: 'redub',
  gitEmail: 'redubbledd@hotmail.nl', ghGebruiker: 'redubbledd1-ops' })

t('de git-gegevens staan op het account zelf',
  metGit.gitNaam === 'redub' && metGit.gitEmail === 'redubbledd@hotmail.nl')
t('een vers account heeft ze nog niet', A.maakAccount({ naam: 'X' }).gitNaam === '')

const prof = A.accountProfiel(metGit)
t('het profiel krijgt de id van het account — geen tweede id dat kan afwijken',
  prof.id === metGit.id)
t('naam en adres komen mee', prof.naam === 'redub' && prof.email === 'redubbledd@hotmail.nl')
t('het GitHub-account ook', prof.ghGebruiker === 'redubbledd1-ops')
t('zonder account geen profiel', A.accountProfiel(null) === null)

t('compleet zodra naam en adres er staan', A.gitCompleet(metGit) === true)
t('zonder adres niet', A.gitCompleet({ ...metGit, gitEmail: '' }) === false)
t('zonder naam ook niet', A.gitCompleet({ ...metGit, gitNaam: '' }) === false)
t('spaties tellen niet als ingevuld', A.gitCompleet({ gitNaam: ' ', gitEmail: ' ' }) === false)

// Bestaande installatie: de gegevens stonden in een losse profielenlijst.
const leegAcc = A.maakAccount({ naam: 'Collega' })
const overgenomen = A.neemProfielOver(leegAcc, { naam: 'jan', email: 'j@x.nl', ghGebruiker: 'jan-dev' })
t('een leeg account neemt het oude profiel over', overgenomen.gitNaam === 'jan')
t('met adres en GitHub-account erbij',
  overgenomen.gitEmail === 'j@x.nl' && overgenomen.ghGebruiker === 'jan-dev')
t('een account dat het al heeft, blijft ongemoeid',
  A.neemProfielOver(metGit, { naam: 'iemand-anders', email: 'x@x.nl' }).gitNaam === 'redub')
t('zonder oud profiel verandert er niets',
  A.neemProfielOver(leegAcc, null).gitNaam === '')
t('de id blijft altijd hetzelfde', overgenomen.id === leegAcc.id)

// ── isolatie: welke mappen horen bij dit account ─────────────────────────────
// Dit is het deel dat sluitend moet zijn. Niet tegen meelezen — dat kan de app
// niet — maar tegen gedrag: nooit een git-actie in de map van een ander
// account, en nooit een melding over andermans repo.
const mijnPaden = ['C:\\Users\\redub\\Desktop\\Projects\\CommandDeck',
                   'C:/Users/redub/Desktop/Projects/resume']

t('mijn eigen map mag', A.padHoortBij(mijnPaden, 'C:\\Users\\redub\\Desktop\\Projects\\CommandDeck'))
t('hoofdletters maken niet uit — Windows doet dat ook niet',
  A.padHoortBij(mijnPaden, 'c:/users/redub/desktop/projects/commanddeck'))
t('schuine strepen door elkaar mag',
  A.padHoortBij(mijnPaden, 'C:/Users/redub/Desktop/Projects/CommandDeck'))
t('een streep op het eind maakt niet uit',
  A.padHoortBij(mijnPaden, 'C:/Users/redub/Desktop/Projects/CommandDeck/'))

t('de map van een ander account mag NIET',
  !A.padHoortBij(mijnPaden, 'C:/Users/redub/Desktop/Projects/DD-Music'))
t('een submap mag ook niet meeliften',
  !A.padHoortBij(mijnPaden, 'C:/Users/redub/Desktop/Projects/CommandDeck/lib'))
t('een bovenliggende map al helemaal niet',
  !A.padHoortBij(mijnPaden, 'C:/Users/redub/Desktop/Projects'))
t('een leeg pad mag nooit', !A.padHoortBij(mijnPaden, ''))
t('null mag nooit', !A.padHoortBij(mijnPaden, null))
t('zonder toegestane paden mag niets', !A.padHoortBij([], 'C:/wat/dan/ook'))
t('een Set werkt net zo goed als een lijst',
  A.padHoortBij(new Set(mijnPaden), 'C:/Users/redub/Desktop/Projects/resume'))

t('normaliseren maakt beide schrijfwijzen gelijk',
  A.normaliseerPad('C:\\Map\\Sub\\') === A.normaliseerPad('c:/map/sub'))
t('en laat niets van het pad weg',
  A.normaliseerPad('C:/Map/Sub') === 'c:/map/sub')

// ── de bedrading ─────────────────────────────────────────────────────────────
const APP = path.join(__dirname, '..')
const html = fs.readFileSync(path.join(APP, 'index.html'), 'utf8')
t('index.html laadt accounts.js vóór renderer.js',
  html.indexOf('src="accounts.js"') > 0
  && html.indexOf('src="accounts.js"') < html.indexOf('src="renderer.js"'))
const nl = JSON.parse(fs.readFileSync(path.join(APP, 'locales', 'nl.json'), 'utf8'))
const en = JSON.parse(fs.readFileSync(path.join(APP, 'locales', 'en.json'), 'utf8'))
for (const k of ['settings.section.accountsTitle', 'accounts.toevoegen', 'accounts.wisselen',
                 'accounts.kiesTitel', 'accounts.verwijderTekst', 'accounts.bestandBlijft']) {
  t('tekst ' + k + ' bestaat in nl en en', !!nl[k] && !!en[k])
}
// Deze regel is het verschil tussen een eerlijke functie en een schijnzekerheid.
// De pincode mag nergens leesbaar staan, en de renderer heeft hash en salt
// niet nodig — wat er niet is, kan ook niet in beeld komen.
const mainBron = fs.readFileSync(path.join(APP, 'main.js'), 'utf8')
t('de pincode wordt gehasht opgeslagen, niet als tekst',
  /scryptSync/.test(mainBron) && /randomBytes/.test(mainBron))
t('vergelijken gebeurt in vaste tijd', /timingSafeEqual/.test(mainBron))
// Op de bedoeling toetsen, niet op de exacte regel: die verandert zodra er een
// veld bijkomt, en dan faalt de test om de verkeerde reden.
const zonderGeheimBlok = (mainBron.match(/const zonderGeheim = \(a\) => \(\{[\s\S]*?\n\}\)/) || [''])[0]
t('er is een functie die het account uitkleedt voor de renderer', zonderGeheimBlok.length > 0)
t('en die geeft de pincode, hash noch salt door',
  zonderGeheimBlok.length > 0
  && !/\bpin\b\s*:/.test(zonderGeheimBlok)
  && !/hash/.test(zonderGeheimBlok.replace(/heeftPin/g, ''))
  && !/salt/.test(zonderGeheimBlok))
t('maar wel of er een pincode ingesteld is', /heeftPin/.test(zonderGeheimBlok))
t('en de git-identiteit, want dat is het account zelf',
  /gitNaam/.test(zonderGeheimBlok) && /gitEmail/.test(zonderGeheimBlok))
t('wisselen wordt in main gecontroleerd, niet alleen in het venster',
  /pinNodig\(st\.accounts\) && !pinKlopt\(doel, pin\)/.test(mainBron))
t('een account aanmaken kan niet zonder pincode',
  /if \(!Accounts\.geldigePin\(pin\)\) return \{ ok: false, reden: 'pin-ongeldig' \}/.test(mainBron))

// De vier plekken waar git-gegevens tussen accounts door konden lekken.
const mainJs = fs.readFileSync(path.join(APP, 'main.js'), 'utf8')
t('elke git-aanroep met een pad wordt getoetst',
  (mainJs.match(/padToegestaan\(dir\)/g) || []).length >= 6)
t('de afsluitlijst draagt het account met zich mee',
  /gitProjectenVoorAfsluiten\.accountId !== st\.actiefAccount/.test(mainJs))
t('de stash-melding is per account',
  /stashMeldingBestand\(/.test(mainJs) && !/const STASH_MELDING_FILE/.test(mainJs))

const rendererJs = fs.readFileSync(path.join(APP, 'renderer.js'), 'utf8')
t('bij het wisselen gaat de deur eerst dicht',
  /gitPaden\(\{ accountId: id, paden: \[\] \}\)/.test(rendererJs))
t('en de fetch-teller wordt geleegd',
  /delete gitLaatsteFetch\[k\]/.test(rendererJs))
t('wisselen vanuit instellingen blijft daar',
  /const inInstellingen = view === 'settings'/.test(rendererJs)
  && /if \(inInstellingen\)/.test(rendererJs)
  && /renderSettingsPanel\(\)/.test(rendererJs))
t('een inactieve accountrij is zelf de wisselknop',
  /account-rij:not\(\.actief\)/.test(rendererJs))
t('wisselen vraagt eerst of git-werk weggezet moet worden',
  /controleerOnveiligWerk\('wisselen'\)/.test(rendererJs)
  && rendererJs.indexOf("controleerOnveiligWerk('wisselen')")
     < rendererJs.indexOf('accountSwitch({ id, pin'))

// ── Een verwijderd account bleef terugkomen ──────────────────────────────────
// De accountlijst staat in settings.json, en het venster kreeg daar een kopie
// van via settings:load. Bij settings:save ging die kopie ongewijzigd terug —
// inclusief het account dat main net had verwijderd. Omdat `lastView` bij elke
// schermwissel bewaard wordt, was dat altijd binnen een paar klikken gebeurd en
// stond het account er na een herstart weer.
t('settings:save schrijft de accountlijst uit het venster niet terug',
  /const ALLEEN_VAN_MAIN = \['accounts', 'actiefAccount', 'perAccount'\]/.test(mainJs)
  && /for \(const sleutel of ALLEEN_VAN_MAIN\) delete binnen\[sleutel\]/.test(mainJs))
t('en gebruikt de lijst van main zelf',
  /accounts: st\.accounts,[\s\S]{0,120}actiefAccount: st\.actiefAccount/.test(mainJs))
t('de persoonlijke instellingen komen van schijf, niet uit die kopie',
  /perAccount: opSchijf\.perAccount/.test(mainJs))

// ── Verwijderen mag alleen jezelf, met je pincode ────────────────────────────
t('main weigert het account van een ander',
  /ipcMain\.handle\('accounts:remove'[\s\S]{0,700}if \(id !== st\.actiefAccount\) return \{ ok: false, reden: 'niet-jezelf' \}/.test(mainJs))
t('en weigert zonder de juiste pincode',
  /ipcMain\.handle\('accounts:remove'[\s\S]{0,800}!pinKlopt\(doel, pin\)\) return \{ ok: false, reden: 'pin-fout' \}/.test(mainJs))
t('de prullenbak staat alleen bij je eigen account',
  /accounts\.length > 1 && a\.id === actiefAccount/.test(rendererJs))
t('het venster vraagt de pincode voordat het verwijdert',
  /accounts\.verwijderPinTekst/.test(rendererJs)
  && rendererJs.indexOf('accounts.verwijderPinTekst') < rendererJs.indexOf('accountRemove({ id: a.id, pin })'))
t('en logt je daarna in op wat er nog over is',
  /await wisselAccount\(r\.actief, null, \{ geenWerkcontrole: true \}\)/.test(rendererJs)
  && /actiefAccount = ''[\s\S]{0,240}wisselAccount\(r\.actief/.test(rendererJs))
t('zonder de projecten van het verdwenen account te laten staan',
  /projects = \[\]; activeId = ''; gitStaten = \{\}/.test(rendererJs))
for (const sleutel of ['accounts.verwijderPinTekst', 'accounts.verwijderPinFout',
                       'accounts.verwijderAnderTekst']) {
  t('verwijder-tekst ' + sleutel + ' bestaat in nl en en', !!nl[sleutel] && !!en[sleutel])
}

// ── Inloggen bij het opstarten ───────────────────────────────────────────────
// Wie hier voor het eerst zit heeft nog geen account, en de instellingen zitten
// achter dit scherm. Zonder een weg naar "account toevoegen" kom je dus niet
// verder dan de accounts die er al waren.
t('het inlogscherm biedt een account toevoegen aan',
  /NIEUW_ACCOUNT/.test(rendererJs)
  && /accounts\.toevoegenBijStart/.test(rendererJs))
t('en gaat daarna terug naar de lijst, zodat je meteen kunt inloggen',
  /if \(id === NIEUW_ACCOUNT\) \{[\s\S]{0,200}await voegAccountToe\(\)[\s\S]{0,120}kiesAccountBijStart\(\)/.test(rendererJs))
t('de toevoegstroom staat los van de instellingen',
  /async function voegAccountToe\(\)/.test(rendererJs))
t('de tekst voor die knop bestaat in nl en en',
  !!nl['accounts.toevoegenBijStart'] && !!en['accounts.toevoegenBijStart'])

// ── Het inlogveld ────────────────────────────────────────────────────────────
t('de pincode gaat door een wachtwoordveld',
  /vraagTekst\(\{ titel, tekst, verborgen: true/.test(rendererJs))
t('typen belandt altijd in dat veld, waar de cursor ook stond',
  /const vangToets = /.test(rendererJs)
  && /addEventListener\('keydown', vangToets, true\)/.test(rendererJs))
t('en enter bevestigt, ook vanaf een knop',
  /if \(e\.key === 'Enter'\)\s*\{ e\.preventDefault\(\); e\.stopPropagation\(\); af\(true\)/.test(rendererJs))
t('een venster dat opengaat pakt de cursor niet meer af',
  /function focusTerminalInput\(\)[\s\S]{0,1200}requestAnimationFrame\([\s\S]{0,600}anyModalOpen\(\)/.test(rendererJs))

// ── Haperingen ───────────────────────────────────────────────────────────────
// Het pad vers uit het register lezen kost twee synchrone reg.exe-aanroepen.
// Op de hoofdthread staat in die tijd het hele venster stil, en dat gebeurde
// elke twee minuten bij de eerstvolgende git-aanroep.
t('het pad wordt in de achtergrond ververst, niet op de hoofdthread',
  /function ververWindowsPath\(\)/.test(mainJs)
  && /readRegPathAsync/.test(mainJs))
t('windowsMergedPath blokkeert niet meer',
  !/function windowsMergedPath\(\)[\s\S]{0,400}readRegPath\(/.test(mainJs))
t('alleen bij het opstarten en na een installatie mag het blokkeren',
  /function windowsPathNu\(\)/.test(mainJs)
  && /try \{ windowsPathNu\(\) \} catch/.test(mainJs))

t('de waarschuwing dat dit niets beveiligt staat er, in beide talen',
  /Windows/.test(nl['accounts.eerlijk'] || '') && /Windows/.test(en['accounts.eerlijk'] || ''))

console.log(ok ? '\nALLE ACCOUNT-TESTS OK' : '\nER ZIJN ACCOUNT-TESTS GEZAKT')
process.exit(ok ? 0 : 1)
