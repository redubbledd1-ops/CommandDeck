// De knoppenrij: welke knoppen er staan, in welke volgorde, wat er verborgen
// is en welke knop in welke map ligt.
//
// Dit bestand wordt op twee plekken geladen:
//   - de tests via require()
//   - index.html via een <script>-tag, waarna het als Knoppenrij klaarstaat
//
// Waarom apart: de rij bij een project, de snelkoppelingen in de cmd-sectie en
// die in de powershell-sectie zijn dezelfde rij met andere knoppen erin. Ze
// hadden elk hun eigen kopie van dezelfde logica, en dus ook hun eigen fouten:
// mappen bestonden alleen bij een project, en een fout in het slepen moest je
// drie keer verhelpen. Hier staat die logica één keer.
//
// Wat per rij verschilt komt binnen als een `rij`-beschrijving:
//
//   bron          waar volgorde, zichtbaarheid en mappen bewaard worden. Vier
//                 velden: cmdVolgorde, cmdVisibility, cmdFolders, cmdFolderVan.
//                 Bij een project is dat het project zelf; bij cmd en
//                 powershell het instellingenblok van die sectie.
//   sectie        de naam van de rij binnen die bron ('run', 'snel', ...).
//                 Eén bron kan meerdere rijen hebben.
//   alle()        alle knop-id's die er zijn, zichtbaar of niet, in hun
//                 natuurlijke volgorde. Een functie en geen lijst: er komen
//                 knoppen bij en af terwijl je in beeld staat.
//   standaardAan  wat geldt er als je nooit iets over deze knop hebt gezegd?
//   zichtbaarheid de kaart met aan/uit die geldt als er geen wordt meegegeven.
//   toonbaar      laatste zeef over de zichtbare knoppen, voor wat van de
//                 toestand afhangt: git laat per repo andere knoppen zien.
//   sorteert      staat deze rij nu in de verplaatsmodus?
//   autoSoorten   de groepen voor automatisch mappen: { auto, label, toets }.
//
// De bron wordt hier gelezen en bijgewerkt, maar nooit opgeslagen en nooit
// opnieuw getekend -- dat blijft van de aanroeper, die weet of het om een
// project of om de instellingen gaat.
;(function (root, factory) {
  const api = factory()
  if (typeof module === 'object' && module.exports) module.exports = api
  else root.Knoppenrij = api
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {

  // ── Mappen van knoppen ──────────────────────────────────────────────────────
  // Een map is geen tweede lijst maar een gewone plek in cmdVolgorde. Wat erin
  // zit staat in cmdFolderVan, per knop-id. Dat scheelt een boel: de volgorde
  // blijft plat, dus zichtbaarheid, sorteren en opslaan werken zoals ze deden,
  // en een map opheffen laat elke knop staan waar hij stond.
  //
  //   bron.cmdFolders   = [{ id, sectie, label, open, auto }]
  //   bron.cmdFolderVan = { '<knop-id>': '<map-id>' }
  //   bron.cmdVolgorde  = { run: ['git-status', 'map:m1', 'custom:x', ...] }
  const MAP_PREFIX = 'map:'
  const isMapId = (id) => typeof id === 'string' && id.startsWith(MAP_PREFIX)
  const mapIdVan = (id) => String(id).slice(MAP_PREFIX.length)

  function nieuwMapId() {
    return 'm' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6)
  }

  // Eén plek verzetten in een lijst. Staat hier omdat de rij hem overal nodig
  // heeft; hij weet niets van knoppen.
  function verschuif(lijst, van, naar) {
    if (naar < 0 || naar >= lijst.length) return false
    const [eruit] = lijst.splice(van, 1)
    lijst.splice(naar, 0, eruit)
    return true
  }

  function mappenVan(bron, sectie) {
    return (bron.cmdFolders || []).filter(f => f && f.sectie === sectie)
  }

  function mapOp(bron, mapId) {
    return (bron.cmdFolders || []).find(f => f && f.id === mapId) || null
  }

  function mapOpen(bron, id) {
    const f = mapOp(bron, mapIdVan(id))
    return !!f && f.open !== false
  }

  // Slepen rekent met id's, niet met plekken. Een knop kan van de rij in een map
  // springen en andersom, en dan zegt "plek 3" niets meer: welke lijst zou dat
  // zijn? Het id blijft hetzelfde, waar hij ook heen gaat.
  //
  // Uit een map halen legt een lege tekst vast, geen niets. Het verschil telt:
  // niets betekent "beslis zelf maar", en dan zou de soort hem meteen weer
  // terugtrekken in de map waar je hem net uit sleepte.
  function zetInMap(bron, knopId, mapId) {
    bron.cmdFolderVan = { ...(bron.cmdFolderVan || {}), [knopId]: mapId || '' }
  }

  const soortenVan = (rij) => rij.autoSoorten || []

  // De map die bij de soort van deze knop hoort, als die map er is. Bestaat hij
  // niet, dan blijft de knop gewoon los staan -- er wordt hier niets gemaakt.
  // `fallbackAuto` (optioneel op de soort): tweede kans, bv. een AI-programma
  // dat bij "programma's" hoort maar in de AI-map mag als die er wél is.
  function autoMapVoor(rij, id) {
    const soort = soortenVan(rij).find(x => x.toets(id))
    if (!soort) return null
    const hier = mappenVan(rij.bron, rij.sectie)
    const exact = hier.find(f => f.auto === soort.auto)
    if (exact) return exact
    if (soort.fallbackAuto) return hier.find(f => f.auto === soort.fallbackAuto) || null
    return null
  }

  // In welke map hoort deze knop? Drie antwoorden, in deze volgorde:
  //
  //   een map-id  -- daar heb jij hem neergelegd
  //   lege tekst  -- daar heb jij hem juist uit gehaald, laat hem los staan
  //   niets       -- nooit iets over gezegd: dan beslist zijn soort
  //
  // Dat laatste is wat een knop die er later bij komt vanzelf op zijn plek laat
  // vallen. Zonder die regel zou elke nieuw gevonden AI-knop of git-knop los
  // naast een map belanden die er precies voor bedoeld is, en zou je na elke
  // installatie opnieuw moeten opruimen.
  //
  // Een verwijzing naar een map die niet meer bestaat telt als los: anders
  // verdwijnt de knop uit beeld zonder dat er nog iets is om hem uit te halen.
  function mapVanKnop(rij, id) {
    const gekozen = (rij.bron.cmdFolderVan || {})[id]
    if (gekozen === '') return null
    if (gekozen) {
      const f = mapOp(rij.bron, gekozen)
      return f && f.sectie === rij.sectie ? f : null
    }
    return autoMapVoor(rij, id)
  }

  function mapIdVanKnop(rij, id) {
    if (isMapId(id)) return null
    const f = mapVanKnop(rij, id)
    return f ? f.id : null
  }

  // ── Zichtbaarheid ───────────────────────────────────────────────────────────
  function zichtbaar(rij, id, zichtbaarMap = null) {
    const map = zichtbaarMap || rij.zichtbaarheid || rij.bron.cmdVisibility || {}
    const keuze = map[id]
    // Niets vastgelegd → de standaard van de knop. Wél vastgelegd → wat de
    // gebruiker heeft gekozen, ook als dat "aan" is voor een knop die standaard
    // uit staat.
    if (keuze === undefined || keuze === null) return rij.standaardAan ? !!rij.standaardAan(id) : true
    return keuze !== false
  }

  // ── Volgorde ────────────────────────────────────────────────────────────────
  // Wat is opgeslagen telt eerst, en wat nieuw is komt erachteraan. Een knop die
  // niet meer bestaat valt weg zonder de rest te verschuiven.
  function volgorde(rij) {
    const alle = rij.alle()
    const opgeslagen = (rij.bron.cmdVolgorde && rij.bron.cmdVolgorde[rij.sectie]) || []
    const geldig = opgeslagen.filter(id => alle.includes(id))
    return [...geldig, ...alle.filter(id => !geldig.includes(id))]
  }

  // Elke knop die deze rij mag laten zien -- of hij nu los staat of in een map
  // ligt. `toonbaar` is de laatste zeef: die kent de toestand (welke git-knoppen
  // horen bij deze repo) waar deze code niets van hoeft te weten.
  function zichtbareIds(rij, zichtbaarMap = null) {
    const ids = volgorde(rij).filter(id => !isMapId(id) && zichtbaar(rij, id, zichtbaarMap))
    return rij.toonbaar ? rij.toonbaar(ids) : ids
  }

  // Wat ligt er in deze map, in de volgorde van de rij?
  function knoppenInMap(rij, mapId, zichtbaarMap = null) {
    return zichtbareIds(rij, zichtbaarMap).filter(id => (mapVanKnop(rij, id) || {}).id === mapId)
  }

  // Welke knoppen staan er, in welke volgorde, in de lijst waar je naar kijkt?
  // Slepen rekent met de plek in die lijst, dus tekenen en verplaatsen moeten
  // exact dezelfde lijst gebruiken. Deden ze dat niet, dan schuift een andere
  // knop op dan je vastpakt en staat er daarna rommel in cmdVolgorde -- waarna
  // ook knoppen die je nog niet had aangeraakt verkeerd gaan slepen.
  //
  // Twee lijsten kijken naar dezelfde knoppen en zien niet hetzelfde:
  //   'rij'    -- de rij zelf: alleen aangevinkte knoppen, en van git alleen
  //               wat bij deze repo-toestand hoort.
  //   'alles'  -- het bewerkvenster: elke knop, ook de uitgevinkte, want daar
  //               zet je ze juist weer aan.
  function idsInBeeld(rij, weergave = 'rij', zichtbaarMap = null) {
    const alle = volgorde(rij)
    // Het bewerkvenster gaat over welke knoppen er zijn, niet over waar ze
    // staan: daar hoort elke knop in de lijst, ook de uitgevinkte, en geen map
    // ertussen.
    if (weergave === 'alles') return alle.filter(id => !isMapId(id))
    const knoppen = new Set(zichtbareIds(rij, zichtbaarMap))
    // Een lege map hoort alleen in beeld terwijl je aan het ordenen bent: dan
    // moet je er iets in kunnen leggen. Daarbuiten staat hij alleen in de weg.
    const toonLeeg = !!rij.sorteert
    return alle.filter(id => {
      if (isMapId(id)) return toonLeeg || knoppenInMap(rij, mapIdVan(id), zichtbaarMap).length > 0
      return knoppen.has(id) && !mapVanKnop(rij, id)
    })
  }

  // De rij zoals je hem ziet staan. Een open map is een blok met een rand
  // eromheen; die blokken staan bovenaan, want daar zoek je ze: eerst de mappen,
  // daaronder wat los is blijven liggen. De dichte mappen staan nog een regel
  // hoger, in de kopregel, zodat ze bij elkaar blijven staan.
  function rijVolgorde(rij, zichtbaarMap = null) {
    const ids = idsInBeeld(rij, 'rij', zichtbaarMap)
    const open = ids.filter(id => isMapId(id) && mapOpen(rij.bron, id))
    const dicht = ids.filter(id => isMapId(id) && !mapOpen(rij.bron, id))
    if (!open.length && !dicht.length) return ids
    return [...dicht, ...open, ...ids.filter(id => !isMapId(id))]
  }

  // Waar hoort deze knop in te schuiven als je hem met de pijltjes verzet? In
  // een map is dat de map, daarbuiten de rij.
  function knopRij(rij, id) {
    const f = isMapId(id) ? null : mapVanKnop(rij, id)
    return f ? knoppenInMap(rij, f.id) : rijVolgorde(rij)
  }

  // De knoppen die niet in beeld staan blijven staan waar ze stonden: alleen de
  // zichtbare plekken worden opnieuw gevuld. Zo raakt de volgorde van verborgen
  // knoppen niet in de war door een sleep die daar niets mee te maken had.
  function verplaatsVolgorde(rij, van, naar, weergave = 'rij', zichtbaarMap = null) {
    const volledig = volgorde(rij)
    const inBeeld = idsInBeeld(rij, weergave, zichtbaarMap)
    if (!verschuif(inBeeld, van, naar)) return false
    const staatInBeeld = new Set(inBeeld)
    let zi = 0
    const nieuw = volledig.map(id => (staatInBeeld.has(id) ? inBeeld[zi++] : id))
    rij.bron.cmdVolgorde = { ...(rij.bron.cmdVolgorde || {}), [rij.sectie]: nieuw }
    return true
  }

  function verplaatsKnop(rij, knopId, doelId, mapId = null, achter = false) {
    if (!knopId || knopId === doelId) return false
    const lijst = volgorde(rij).filter(id => id !== knopId)
    const i = doelId ? lijst.indexOf(doelId) : -1
    if (i < 0) lijst.push(knopId)
    else lijst.splice(achter ? i + 1 : i, 0, knopId)
    rij.bron.cmdVolgorde = { ...(rij.bron.cmdVolgorde || {}), [rij.sectie]: lijst }
    // Een map in een map bestaat niet: dan wordt "waar staat deze knop" een boom
    // die je moet uitklappen om een knop te vinden die je zo wilde indrukken.
    if (!isMapId(knopId)) zetInMap(rij.bron, knopId, mapId)
    return true
  }

  // Achteraan in een map erbij. Ligt er nog niets in, dan is de map zelf het
  // mikpunt en komt de knop er meteen achter te staan.
  function legInMap(rij, knopId, mapId) {
    const inMap = knoppenInMap(rij, mapId).filter(id => id !== knopId)
    const doel = inMap.length ? inMap[inMap.length - 1] : MAP_PREFIX + mapId
    return verplaatsKnop(rij, knopId, doel, mapId, true)
  }

  // ── Mappen maken en opruimen ────────────────────────────────────────────────
  function nieuweMap(rij, label) {
    const f = { id: nieuwMapId(), sectie: rij.sectie, label, open: true }
    rij.bron.cmdFolders = [...(rij.bron.cmdFolders || []), f]
    // Vastleggen waar hij staat: anders schuift hij een plek op zodra er een
    // knop bij komt die nog geen plek in de volgorde had.
    rij.bron.cmdVolgorde = { ...(rij.bron.cmdVolgorde || {}), [rij.sectie]: volgorde(rij) }
    return f
  }

  // De map gaat weg, de knoppen blijven. Ze stonden al op hun eigen plek in de
  // volgorde, dus ze komen daar gewoon weer tevoorschijn.
  function hefMappen(rij, mapIds) {
    const weg = new Set(mapIds)
    if (!weg.size) return 0
    const bron = rij.bron
    bron.cmdFolders = (bron.cmdFolders || []).filter(f => !weg.has(f.id))
    bron.cmdFolderVan = Object.fromEntries(
      Object.entries(bron.cmdFolderVan || {}).filter(([, v]) => !weg.has(v)))
    bron.cmdVolgorde = {
      ...(bron.cmdVolgorde || {}),
      [rij.sectie]: volgorde(rij).filter(id => !(isMapId(id) && weg.has(mapIdVan(id)))),
    }
    return weg.size
  }

  // Ook knoppen die nu niet in beeld staan gaan mee. Een git-knop die pas
  // verschijnt zodra er een remote is hoort in dezelfde map als de rest, anders
  // staat hij er later alsnog los naast.
  //
  // Nieuwe map: pas bij twee of meer losse knoppen van die soort (één knop in
  // een eigen map is lawaai). Bestaande auto-map: ook één losse knop erin —
  // anders blijven Gemini/Ollama eeuwig ernaast staan als de map er al is.
  // Expres losgehaalde knoppen (cmdFolderVan === '') blijven los.
  function maakAutoMappen(rij) {
    const van = rij.bron.cmdFolderVan || {}
    const losse = volgorde(rij).filter(id => {
      if (isMapId(id)) return false
      if (van[id] === '') return false
      return !mapVanKnop(rij, id)
    })
    // Gebruikt deze rij al mappen? Dan is de gebruiker met mappen bezig. Eén
    // keer vooraf bepalen, vóór we zelf mappen maken.
    const alMappen = mappenVan(rij.bron, rij.sectie).length > 0
    let gedaan = 0
    for (const soort of soortenVan(rij)) {
      const hoort = losse.filter(soort.toets)
      if (!hoort.length) continue
      let f = mappenVan(rij.bron, rij.sectie).find(x => x.auto === soort.auto)
      if (!f) {
        // Nieuwe map: normaal pas bij twee of meer losse knoppen van die soort
        // (één knop in een eigen map is lawaai op een verse rij). Uitzondering:
        // een soort met `soloInMap` -- de gevonden programma's -- hoort ook als
        // enkeling in een map zodra de rij al mappen gebruikt. Dat is bug 5:
        // "wanneer mappen aan staan komt een nieuw gevonden programma in de map"
        // in plaats van los naast de mappen die er al zijn.
        const soloMag = alMappen && soort.soloInMap
        if (hoort.length < 2 && !soloMag) continue
        f = { id: nieuwMapId(), sectie: rij.sectie, label: soort.label, open: true, auto: soort.auto }
        rij.bron.cmdFolders = [...(rij.bron.cmdFolders || []), f]
      }
      // De map neemt de plek van de eerste knop die erin gaat: zo verspringt de
      // rest van de rij zo min mogelijk.
      verplaatsKnop(rij, MAP_PREFIX + f.id, hoort[0], null, false)
      let vorige = MAP_PREFIX + f.id
      for (const id of hoort) {
        verplaatsKnop(rij, id, vorige, f.id, true)
        vorige = id
        gedaan++
      }
    }
    return gedaan
  }

  // ── Van de oude vorm naar deze ──────────────────────────────────────────────
  // De cmd- en powershell-snelrij bewaarden hun volgorde in `quickVolgorde` en
  // wat uit stond in `quickUit`. Dat waren dezelfde twee dingen als bij een
  // project, maar met andere namen, en dus met eigen code eromheen. Hier
  // verhuizen ze eenmalig naar de vier velden die elke rij gebruikt.
  //
  // Geeft terug of er iets te verhuizen viel, zodat de aanroeper weet of hij
  // moet opslaan.
  function migreer(cfg, sectie) {
    if (!cfg) return false
    let gedaan = false
    if (Array.isArray(cfg.quickVolgorde)) {
      cfg.cmdVolgorde = { ...(cfg.cmdVolgorde || {}), [sectie]: [...cfg.quickVolgorde] }
      delete cfg.quickVolgorde
      gedaan = true
    }
    if (Array.isArray(cfg.quickUit)) {
      // Wat er al in cmdVisibility staat wint: dat is van na de verhuizing.
      cfg.cmdVisibility = {
        ...Object.fromEntries(cfg.quickUit.map(id => [id, false])),
        ...(cfg.cmdVisibility || {}),
      }
      delete cfg.quickUit
      gedaan = true
    }
    return gedaan
  }

  return {
    MAP_PREFIX, isMapId, mapIdVan, nieuwMapId, verschuif, migreer,
    mappenVan, mapOp, mapOpen, zetInMap,
    mapVanKnop, mapIdVanKnop, autoMapVoor,
    zichtbaar, volgorde, zichtbareIds, knoppenInMap, idsInBeeld, rijVolgorde, knopRij,
    verplaatsVolgorde, verplaatsKnop, legInMap,
    nieuweMap, hefMappen, maakAutoMappen,
  }
})
