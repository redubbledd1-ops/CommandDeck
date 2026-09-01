// Accounts binnen de app: meerdere mensen op één pc, elk met een eigen
// projectenlijst en eigen git-instellingen.
//
// Wat dit WEL is: gescheiden inhoud. Jij ziet jouw projecten, je collega de
// zijne, en jullie git-identiteiten lopen niet door elkaar.
//
// Wat dit NIET is: beveiliging tussen personen. Alles staat in
// %APPDATA%\CommandDeck, en die map hoort bij de Windows-gebruiker. Delen twee
// mensen één Windows-login, dan kunnen ze elkaars bestanden gewoon openen —
// wat deze app ook doet. Echte scheiding zijn aparte Windows-accounts. Die
// eerlijkheid hoort in de app te staan en niet alleen in een gesprek, dus de
// instellingen zeggen het er ook bij.
;(function (root, factory) {
  const api = factory()
  if (typeof module === 'object' && module.exports) module.exports = api
  else root.Accounts = api
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {

  const MAX_NAAM = 40

  // Een id dat een geldige bestandsnaam oplevert, want er hangt een
  // projects-<id>.json aan. Nooit iets uit de naam afleiden: dan verandert het
  // bestand mee zodra iemand zichzelf hernoemt.
  function nieuwAccountId(nu = Date.now(), toeval = Math.random()) {
    return 'acc_' + nu.toString(36) + '_' + Math.floor(toeval * 1e6).toString(36)
  }

  function geldigAccountId(id) {
    return /^acc_[a-z0-9_]{1,40}$/.test(String(id || ''))
  }

  function schoneNaam(naam) {
    return String(naam || '').replace(/[\r\n\t]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, MAX_NAAM)
  }

  function maakAccount({ id = '', naam = '', icoon = '👤' } = {}, nu = Date.now(), toeval = Math.random()) {
    return {
      id: geldigAccountId(id) ? id : nieuwAccountId(nu, toeval),
      naam: schoneNaam(naam) || 'Account',
      icoon: String(icoon || '👤').slice(0, 4),
    }
  }

  const accountGeldig = (a) => !!a && geldigAccountId(a.id) && !!schoneNaam(a.naam)

  // Twee accounts met dezelfde naam is verwarrend: je kiest bij het opstarten
  // op naam, en dan moet die naam onderscheidend zijn.
  function naamVrij(lijst, naam, behalveId = '') {
    const n = schoneNaam(naam).toLowerCase()
    if (!n) return false
    return !(lijst || []).some(a => a.id !== behalveId && schoneNaam(a.naam).toLowerCase() === n)
  }

  // Het bestand waar de projecten van dit account in staan. Het eerste account
  // erft projects.json, zodat een bestaande installatie niets kwijtraakt en
  // niemand iets hoeft over te zetten.
  function projectBestand(accountId, eerste = '') {
    if (!geldigAccountId(accountId)) return 'projects.json'
    if (eerste && accountId === eerste) return 'projects.json'
    return `projects-${accountId}.json`
  }

  // Bij een bestaande installatie is er nog geen account. Dan maken we er één
  // van wat er al ligt, in plaats van te beginnen met een leeg scherm.
  function migreer(settings, nu = Date.now(), toeval = Math.random()) {
    const s = settings || {}
    const bestaand = Array.isArray(s.accounts) ? s.accounts.filter(accountGeldig) : []
    if (bestaand.length) {
      const actief = bestaand.some(a => a.id === s.actiefAccount) ? s.actiefAccount : bestaand[0].id
      return { accounts: bestaand, actiefAccount: actief, gemigreerd: false }
    }
    const eerste = maakAccount({ naam: 'Ik', icoon: '👤' }, nu, toeval)
    return { accounts: [eerste], actiefAccount: eerste.id, gemigreerd: true }
  }

  // Welke instellingen horen bij het account en welke bij de pc? Alles rond git
  // is persoonlijk — je naam onder een commit, je GitHub-account, wat er bij
  // afsluiten gecontroleerd wordt. De rest (taal, editors, geschiedenis) hoort
  // bij de installatie en blijft gedeeld.
  const PERSOONLIJK = ['git']

  function accountInstellingen(settings, accountId) {
    const per = (settings && settings.perAccount && settings.perAccount[accountId]) || {}
    const uit = {}
    for (const sleutel of PERSOONLIJK) uit[sleutel] = per[sleutel]
    return uit
  }

  // Instellingen samenvoegen: wat het account zelf heeft wint, de rest komt uit
  // de gedeelde instellingen. Zo werkt een vers account meteen goed in plaats
  // van met lege waarden.
  function samengevoegd(settings, accountId) {
    const s = { ...(settings || {}) }
    const per = accountInstellingen(settings, accountId)
    for (const sleutel of PERSOONLIJK) {
      if (per[sleutel] && typeof per[sleutel] === 'object') {
        s[sleutel] = { ...(s[sleutel] || {}), ...per[sleutel] }
      }
    }
    return s
  }

  // Het omgekeerde: de persoonlijke stukken uit een volledige instellingenset
  // terugschrijven naar het juiste account.
  function metAccountInstellingen(settings, accountId, nieuw) {
    const s = { ...(settings || {}) }
    const per = { ...(s.perAccount || {}) }
    const mijn = { ...(per[accountId] || {}) }
    for (const sleutel of PERSOONLIJK) {
      if (nieuw && nieuw[sleutel] !== undefined) mijn[sleutel] = nieuw[sleutel]
    }
    per[accountId] = mijn
    s.perAccount = per
    return s
  }

  // ── Pincode ─────────────────────────────────────────────────────────────────
  // Waar dit voor is: voorkomen dat iemand per ongeluk in het verkeerde account
  // belandt en met andermans projecten aan de slag gaat. Dat is een reëel
  // probleem op een gedeelde pc en dit lost het op.
  //
  // Waar dit NIET voor is: iemand tegenhouden die de bestanden opent. Een
  // pincode van vier cijfers is in een fractie van een seconde te raden door wie
  // bij settings.json kan, en daar kan geen enkele opslagvorm iets aan
  // veranderen. We bewaren hem gehasht zodat hij niet leesbaar in het bestand
  // staat, en verder is de eerlijke boodschap: aparte Windows-accounts.
  const PIN_MIN = 4
  const PIN_MAX = 64

  // Vrije tekst, geen eisen aan wat erin moet zitten. Vier cijfers mag, een
  // zin ook. Regels als "minstens één hoofdletter" leveren geen sterkere codes
  // op, alleen codes die mensen opschrijven — en drie tekens is te kort om
  // zelfs maar een vergissing tegen te houden.
  function geldigePin(pin) {
    const p = String(pin == null ? '' : pin)
    if (p.trim().length < PIN_MIN) return false     // alleen spaties telt niet mee
    return p.length >= PIN_MIN && p.length <= PIN_MAX
  }

  // Bij één account valt er niets te verwarren, dus vragen we niets. Vanaf twee
  // is het altijd nodig — ook bij het wisselen, want dat is precies het moment
  // waarop je in het verkeerde account terechtkomt.
  const pinNodig = (accounts) => (accounts || []).length > 1

  const heeftPin = (account) => !!(account && account.pin && account.pin.hash && account.pin.salt)

  // Accounts zonder pincode, terwijl er wel meerdere zijn. Die moeten er eerst
  // een zetten voordat het slot ergens op slaat.
  function accountsZonderPin(accounts) {
    if (!pinNodig(accounts)) return []
    return (accounts || []).filter(a => !heeftPin(a))
  }

  // Staat Num Lock uit, dan sturen de cijfertoetsen rechts geen cijfer maar een
  // pijltje of Page Up — het teken klopt dan niet, de fysieke toets wel. Die
  // lezen we uit, zodat het numerieke blok altijd werkt voor een pincode.
  // Levert het cijfer als tekst, of '' als er niets in te vullen valt.
  function cijferUitToets(code, key) {
    // Num Lock aan: het teken is gewoon het cijfer en de browser vult het zelf
    // in. Dan moeten wij er niets mee doen, anders komt het er dubbel te staan.
    if (/^[0-9]$/.test(String(key || ''))) return ''
    const m = String(code || '').match(/^Numpad([0-9])$/)
    return m ? m[1] : ''
  }

  // ── Welke mappen horen bij dit account ──────────────────────────────────────
  // Dit is het stuk dat wél sluitend kan: er mag nooit een git-actie draaien op
  // de map van een ander account, en niemand mag een melding krijgen over
  // andermans repo. Vergelijken doen we op een genormaliseerd pad, want Windows
  // maakt geen verschil tussen hoofdletters en gebruikt beide schuine strepen.
  function normaliseerPad(pad) {
    return String(pad || '')
      .trim()
      .replace(/\\/g, '/')
      .replace(/\/+$/, '')
      .toLowerCase()
  }

  // Exact vergelijken, geen submappen. Een locatie is een concreet pad; iets
  // dat er alleen onder valt is niet hetzelfde project en hoort niet mee te
  // liften op de toestemming.
  function padHoortBij(paden, dir) {
    const n = normaliseerPad(dir)
    if (!n) return false
    const lijst = paden instanceof Set ? [...paden] : (paden || [])
    return lijst.some(p => normaliseerPad(p) === n)
  }

  // Een account verwijderen mag nooit het laatste zijn: dan is er niets meer om
  // in te werken. En het actieve account moet daarna nog bestaan.
  function naVerwijderen(lijst, actief, id) {
    const over = (lijst || []).filter(a => a.id !== id)
    if (!over.length) return null            // niet toegestaan
    return { accounts: over, actiefAccount: over.some(a => a.id === actief) ? actief : over[0].id }
  }

  return {
    MAX_NAAM, PERSOONLIJK,
    nieuwAccountId, geldigAccountId, schoneNaam, maakAccount, accountGeldig, naamVrij,
    projectBestand, migreer, accountInstellingen, samengevoegd, metAccountInstellingen,
    normaliseerPad, padHoortBij,
    PIN_MIN, PIN_MAX, geldigePin, pinNodig, heeftPin, accountsZonderPin, cijferUitToets,
    naVerwijderen,
  }
})
