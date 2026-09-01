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
t('de waarschuwing dat dit niets beveiligt staat er, in beide talen',
  /Windows/.test(nl['accounts.eerlijk'] || '') && /Windows/.test(en['accounts.eerlijk'] || ''))

console.log(ok ? '\nALLE ACCOUNT-TESTS OK' : '\nER ZIJN ACCOUNT-TESTS GEZAKT')
process.exit(ok ? 0 : 1)
