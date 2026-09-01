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
    naVerwijderen,
  }
})
