// De knoppenrij zonder venster: volgorde, zichtbaarheid en mappen.
//
// Deze tests draaien op knoppenrij.js zelf, dus zonder jsdom en zonder de
// renderer. Dat is precies waarom die logica daar is gaan wonen: de rij bij een
// project, de cmd-snelrij en de powershell-snelrij zijn dezelfde rij, en wat
// hier groen staat geldt voor alle drie.
const fs = require('fs')
const path = require('path')
const K = require('../knoppenrij.js')

const APP = path.join(__dirname, '..')
let ok = true
const t = (label, waar) => { console.log((waar ? 'PASS  ' : 'FAIL  ') + label); if (!waar) ok = false }

// Een bron is alles met deze vier velden. Een project is er zo een, het
// instellingenblok van de cmd-sectie straks ook.
function bron(extra) {
  return { cmdVolgorde: {}, cmdVisibility: {}, cmdFolders: [], cmdFolderVan: {}, ...(extra || {}) }
}

function rij(b, ids, extra) {
  return {
    bron: b,
    sectie: 'run',
    alle: () => [...ids, ...K.mappenVan(b, 'run').map(f => K.MAP_PREFIX + f.id)],
    ...(extra || {}),
  }
}

// ── Volgorde ─────────────────────────────────────────────────────────────────
{
  const b = bron({ cmdVolgorde: { run: ['c', 'a', 'weg'] } })
  const r = rij(b, ['a', 'b', 'c'])
  t('wat opgeslagen is staat vooraan', K.volgorde(r).join() === 'c,a,b')
  t('een knop die niet meer bestaat valt weg', !K.volgorde(r).includes('weg'))
}

// ── Zichtbaarheid ────────────────────────────────────────────────────────────
{
  const b = bron({ cmdVisibility: { a: false, d: true } })
  const r = rij(b, ['a', 'b', 'c', 'd'], { standaardAan: (id) => id !== 'd' })
  t('uitgevinkt is uit', K.zichtbaar(r, 'a') === false)
  t('niets gezegd volgt de standaard', K.zichtbaar(r, 'b') === true)
  t('en de standaard mag uit zijn', K.zichtbaar(rij(bron(), ['d'], { standaardAan: () => false }), 'd') === false)
  t('aangevinkt wint van een standaard die uit staat', K.zichtbaar(r, 'd') === true)
  t('een meegegeven kaart gaat voor', K.zichtbaar(r, 'a', { a: true }) === true)
  t('zichtbare ids houden de volgorde', K.zichtbareIds(r).join() === 'b,c,d')

  // De laatste zeef kent de toestand: bij git hangt het van de repo af welke
  // knoppen er horen te staan.
  const gezeefd = rij(b, ['a', 'b', 'c', 'd'], { standaardAan: () => true, toonbaar: (ids) => ids.filter(id => id !== 'c') })
  t('toonbaar mag er nog knoppen afhalen', !K.zichtbareIds(gezeefd).includes('c'))
}

// ── Mappen ───────────────────────────────────────────────────────────────────
{
  const b = bron({
    cmdFolders: [{ id: 'm1', sectie: 'run', label: 'git', open: true, auto: 'git' },
                 { id: 'm2', sectie: 'ps-snel', label: 'elders', open: true }],
    cmdFolderVan: { a: 'm1', b: '', c: 'm2', d: 'weg-id' },
  })
  const r = rij(b, ['a', 'b', 'c', 'd', 'g1'], {
    autoSoorten: [{ auto: 'git', label: 'git', toets: (id) => id.startsWith('g') }],
  })
  t('mappen van een andere sectie tellen niet mee', K.mappenVan(b, 'run').length === 1)
  t('waar jij hem neerlegde ligt hij', K.mapIdVanKnop(r, 'a') === 'm1')
  t('lege tekst betekent los, ook al past de soort', K.mapVanKnop(r, 'b') === null)
  t('een map uit een andere sectie telt als los', K.mapVanKnop(r, 'c') === null)
  t('een map die niet meer bestaat telt als los', K.mapVanKnop(r, 'd') === null)
  t('zonder afspraak beslist de soort', K.mapIdVanKnop(r, 'g1') === 'm1')
  t('wat in de map ligt staat er ook in', K.knoppenInMap(r, 'm1').join() === 'a,g1')

  K.zetInMap(b, 'g1', null)
  t('eruit halen legt een lege tekst vast', b.cmdFolderVan.g1 === '')
  t('en dan trekt de soort hem er niet meer in', K.mapVanKnop(r, 'g1') === null)
}

// ── Wat er in beeld staat ────────────────────────────────────────────────────
{
  const b = bron({
    cmdFolders: [{ id: 'm1', sectie: 'run', label: 'git', open: true },
                 { id: 'leeg', sectie: 'run', label: 'leeg', open: true }],
    cmdFolderVan: { a: 'm1' },
    cmdVisibility: { c: false },
  })
  const r = rij(b, ['a', 'b', 'c'])
  const inBeeld = K.idsInBeeld(r, 'rij')
  t('een knop in een map staat niet los in de rij', !inBeeld.includes('a'))
  t('de map staat er wel', inBeeld.includes('map:m1'))
  t('een lege map staat niet in de weg', !inBeeld.includes('map:leeg'))
  t('een lege map hoort er wel bij tijdens het ordenen',
    K.idsInBeeld({ ...r, sorteert: true }, 'rij').includes('map:leeg'))
  t('een uitgevinkte knop staat niet in de rij', !inBeeld.includes('c'))
  const alles = K.idsInBeeld(r, 'alles')
  t('het bewerkvenster toont ook de uitgevinkte', alles.includes('c'))
  t('en geen mappen', !alles.some(K.isMapId))
}

// ── De rij zoals je hem ziet ─────────────────────────────────────────────────
{
  const b = bron({
    cmdFolders: [{ id: 'open', sectie: 'run', label: 'open', open: true },
                 { id: 'dicht', sectie: 'run', label: 'dicht', open: false }],
    cmdFolderVan: { a: 'open', b: 'dicht' },
    cmdVolgorde: { run: ['x', 'map:open', 'y', 'map:dicht'] },
  })
  const r = rij(b, ['a', 'b', 'x', 'y'])
  const zicht = K.rijVolgorde(r)
  t('de dichte map staat vooraan', zicht[0] === 'map:dicht')
  t('daarna de open map', zicht[1] === 'map:open')
  t('en de losse knoppen eronder', zicht.slice(2).join() === 'x,y')
}

// ── Verplaatsen ──────────────────────────────────────────────────────────────
{
  const b = bron({ cmdVisibility: { verborgen: false } })
  const r = rij(b, ['a', 'verborgen', 'b', 'c'])
  K.verplaatsVolgorde(r, 2, 0)
  t('slepen verzet de knop die je vasthebt', K.zichtbareIds(r).join() === 'c,a,b')
  t('en laat wat niet in beeld staat op zijn plek', b.cmdVolgorde.run[1] === 'verborgen')
}

{
  const b = bron({ cmdFolders: [{ id: 'm1', sectie: 'run', label: 'map', open: true }] })
  const r = rij(b, ['a', 'b', 'c'])
  K.legInMap(r, 'c', 'm1')
  t('in een map leggen zet hem erin', K.knoppenInMap(r, 'm1').join() === 'c')
  K.legInMap(r, 'a', 'm1')
  t('de volgende komt erachter', K.knoppenInMap(r, 'm1').join() === 'c,a')
  t('binnen een map is de map de rij', K.knopRij(r, 'a').join() === 'c,a')
  t('daarbuiten de hele rij', K.knopRij(r, 'b').includes('b'))
  K.verplaatsKnop(r, 'a', null, null, false)
  t('eruit halen zet hem terug in de rij', K.knoppenInMap(r, 'm1').join() === 'c')
}

// ── Automatisch mappen ───────────────────────────────────────────────────────
{
  const b = bron()
  const soorten = [
    { auto: 'git', label: 'git', toets: (id) => id.startsWith('git-') },
    { auto: 'ai', label: 'ai', toets: (id) => id.startsWith('ai:') },
  ]
  const r = rij(b, ['git-status', 'git-push', 'ai:claude', 'los'], { autoSoorten: soorten })
  const gedaan = K.maakAutoMappen(r)
  t('twee knoppen van een soort krijgen een map', gedaan === 2)
  t('de map draagt het label dat je meegaf', b.cmdFolders[0].label === 'git')
  t('een soort met één knop krijgt er geen', b.cmdFolders.length === 1)
  t('en de losse knop blijft los', K.mapVanKnop(r, 'los') === null)
  t('nog een keer doet niets', K.maakAutoMappen(r) === 0)

  const mapId = b.cmdFolders[0].id
  t('de map staat op de plek van de eerste knop erin',
    b.cmdVolgorde.run.indexOf(K.MAP_PREFIX + mapId) === 0)
  t('map opheffen geeft er één terug', K.hefMappen(r, [mapId]) === 1)
  t('de map is weg', K.mappenVan(b, 'run').length === 0)
  t('maar de knoppen staan er nog', K.volgorde(r).includes('git-status'))
  t('en de soort trekt ze niet opnieuw naar binnen', K.mapVanKnop(r, 'git-status') === null)
}

// ── Twee rijen in dezelfde bron ──────────────────────────────────────────────
// Dit is waar het om begonnen was: cmd en powershell bewaren hun rij straks in
// hetzelfde instellingenblok, elk onder een eigen sectienaam.
{
  const b = bron()
  const een = { bron: b, sectie: 'snel', alle: () => ['a', 'b'] }
  const twee = { bron: b, sectie: 'ps-snel', alle: () => ['x', 'y'] }
  K.verplaatsVolgorde(een, 1, 0)
  t('de ene rij schrijft in zijn eigen sectie', b.cmdVolgorde.snel.join() === 'b,a')
  t('en laat de andere met rust', !b.cmdVolgorde['ps-snel'])
  const f = K.nieuweMap(twee, 'eigen map')
  t('een nieuwe map hoort bij zijn sectie', f.sectie === 'ps-snel')
  t('en telt niet mee in de andere rij', K.mappenVan(b, 'snel').length === 0)
}

// ── Geladen en gebruikt ──────────────────────────────────────────────────────
{
  const html = fs.readFileSync(path.join(APP, 'index.html'), 'utf8')
  t('index.html laadt knoppenrij.js vóór renderer.js',
    html.includes('src="knoppenrij.js"') &&
    html.indexOf('src="knoppenrij.js"') < html.indexOf('src="renderer.js"'))
  const bron2 = fs.readFileSync(path.join(APP, 'renderer.js'), 'utf8')
  t('de renderer houdt er geen tweede kopie van na',
    !/const MAP_PREFIX = 'map:'/.test(bron2) && bron2.includes('Knoppenrij.'))
}

console.log(ok ? '\nALLE KNOPPENRIJ-TESTS GESLAAGD' : '\nER ZIJN TESTS GEFAALD')
process.exit(ok ? 0 : 1)
