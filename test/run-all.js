// Draait alle testbestanden en bepaalt pas aan het eind de exitcode.
//
// Voorheen kettende het test-script alles met &&. Eén faler zette daarmee de
// rest stil: viel history.test.js om, dan zag je van de twintig bestanden
// daarna niets meer — ook niet dát ze omvielen. Hier draait alles altijd, en
// staat onderaan wat er stuk is.
//
// Nieuwe testbestanden worden vanzelf meegenomen: alles wat test/*.test.js
// heet, tenzij het hieronder is uitgezonderd.

const fs = require('fs')
const path = require('path')
const { spawnSync } = require('child_process')

// Bestanden die niet los te draaien zijn. persistence.test.js verwacht een
// modus als argument (write/read/limit/nopersist) en doet zonder argument
// niets; die hoort in een eigen scenario, niet in deze ronde.
const OVERSLAAN = new Set(['persistence.test.js'])

const dir = __dirname
const bestanden = fs.readdirSync(dir)
  .filter(f => f.endsWith('.test.js') && !OVERSLAAN.has(f))
  .sort()

const gefaald = []
const start = Date.now()

for (const f of bestanden) {
  console.log('\n──────── ' + f + ' ────────')
  const r = spawnSync(process.execPath, [path.join(dir, f)], { stdio: 'inherit' })
  const code = r.status === null ? 1 : r.status
  if (code !== 0) gefaald.push({ f, code, signaal: r.signal || null })
}

const seconden = ((Date.now() - start) / 1000).toFixed(1)
console.log('\n════════ samenvatting ════════')
console.log(`${bestanden.length} bestanden, ${bestanden.length - gefaald.length} geslaagd, ${gefaald.length} gefaald  (${seconden}s)`)
if (OVERSLAAN.size) console.log('overgeslagen: ' + [...OVERSLAAN].join(', '))

if (gefaald.length) {
  console.log('\nGEFAALD:')
  for (const g of gefaald) console.log('  ' + g.f + (g.signaal ? ` (signaal ${g.signaal})` : ` (exitcode ${g.code})`))
}
process.exit(gefaald.length ? 1 : 0)
