// Notitiebestanden (.txt / .md) met een herkenbare footer onderaan.
// Pure functies: bruikbaar in main én in de renderer.

;(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory()
  else root.NoteTools = factory()
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict'

  const NOTE_EXT = ['txt', 'md', 'log']
  const FOOTER_START = '--- CommandDeck:note ---'
  const FOOTER_END = '---'
  const FOOTER_RE = /\r?\n--- CommandDeck:note ---\r?\n([\s\S]*?)\r?\n---\s*$/

  function extensieVan(naam) {
    const kaal = String(naam || '').split(/[\\/]/).pop()
    const punt = kaal.lastIndexOf('.')
    return punt > 0 ? kaal.slice(punt + 1).toLowerCase() : ''
  }

  function isNoteBestand(naam) {
    return NOTE_EXT.includes(extensieVan(naam))
  }

  function maakId() {
    const t = Date.now().toString(36)
    const r = Math.random().toString(36).slice(2, 8)
    return 'cdn_' + t + r
  }

  function leegMeta(extra) {
    const nu = new Date()
    const dag = nu.toISOString().slice(0, 10)
    return Object.assign({
      id: maakId(),
      subject: '',
      created: dag,
      updated: nu.toISOString().replace(/\.\d{3}Z$/, 'Z'),
      projects: [],
      favorite: false,
    }, extra || {})
  }

  function parseProjecten(raw) {
    if (Array.isArray(raw)) {
      return raw.map(x => String(x || '').trim()).filter(Boolean)
    }
    return String(raw || '')
      .split(/[;|,]/)
      .map(s => s.trim())
      .filter(Boolean)
  }

  function parseMetaRegels(blok) {
    const meta = leegMeta({ id: '' })
    const regels = String(blok || '').split(/\r?\n/)
    for (const regel of regels) {
      const m = /^([a-zA-Z_][a-zA-Z0-9_]*)\s*:\s*(.*)$/.exec(regel.trim())
      if (!m) continue
      const key = m[1].toLowerCase()
      const val = m[2].trim()
      if (key === 'id') meta.id = val
      else if (key === 'subject' || key === 'onderwerp') meta.subject = val
      else if (key === 'created') meta.created = val
      else if (key === 'updated') meta.updated = val
      else if (key === 'projects' || key === 'projecten') meta.projects = parseProjecten(val)
      else if (key === 'favorite' || key === 'favoriet') {
        meta.favorite = val === '1' || /^true$/i.test(val) || /^ja$/i.test(val)
      }
    }
    if (!meta.id) meta.id = maakId()
    return meta
  }

  function parseNote(tekst) {
    const s = String(tekst == null ? '' : tekst)
    const m = FOOTER_RE.exec(s)
    if (!m) {
      return { body: s.replace(/\s+$/, ''), meta: null, heeftFooter: false }
    }
    const body = s.slice(0, m.index).replace(/\s+$/, '')
    return { body, meta: parseMetaRegels(m[1]), heeftFooter: true }
  }

  function buildFooter(meta) {
    const m = meta && typeof meta === 'object' ? meta : leegMeta()
    const projects = parseProjecten(m.projects).join('; ')
    const regels = [
      FOOTER_START,
      'id: ' + (m.id || maakId()),
      'subject: ' + String(m.subject || '').replace(/[\r\n]+/g, ' '),
      'created: ' + String(m.created || ''),
      'updated: ' + String(m.updated || ''),
      'projects: ' + projects,
      'favorite: ' + (m.favorite ? '1' : '0'),
      FOOTER_END,
    ]
    return regels.join('\n')
  }

  function schrijfNote(body, meta) {
    const kaal = String(body == null ? '' : body).replace(/\s+$/, '')
    const voet = buildFooter(meta)
    if (!kaal) return voet + '\n'
    return kaal + '\n\n' + voet + '\n'
  }

  function stampUpdated(meta) {
    const m = Object.assign({}, meta || leegMeta())
    m.updated = new Date().toISOString().replace(/\.\d{3}Z$/, 'Z')
    if (!m.created) m.created = m.updated.slice(0, 10)
    if (!m.id) m.id = maakId()
    return m
  }

  function subjectVan(meta, pad) {
    if (meta && meta.subject) return meta.subject
    const naam = String(pad || '').split(/[\\/]/).pop() || ''
    return naam.replace(/\.(txt|md|log)$/i, '') || naam
  }

  function datumVoorSort(meta, mtime) {
    if (meta && meta.updated) {
      const t = Date.parse(meta.updated)
      if (!Number.isNaN(t)) return t
    }
    if (meta && meta.created) {
      const t = Date.parse(meta.created)
      if (!Number.isNaN(t)) return t
    }
    return Number(mtime) || 0
  }

  function projectLabel(meta) {
    const lijst = parseProjecten(meta && meta.projects)
    return lijst[0] || ''
  }

  // files: [{ path, name, mtime, meta?, favorite? }]
  function sorteerNotes(files, modus, favorieten) {
    const favSet = new Set((favorieten || []).map(p => String(p || '').toLowerCase()))
    const lijst = (files || []).map(f => {
      const pad = f.path || ''
      const meta = f.meta || null
      const fav = !!(f.favorite || (meta && meta.favorite) || favSet.has(pad.toLowerCase()))
      return Object.assign({}, f, { favorite: fav, _subject: subjectVan(meta, pad), _datum: datumVoorSort(meta, f.mtime), _proj: projectLabel(meta) })
    })

    const cmpNaam = (a, b) => a._subject.localeCompare(b._subject, undefined, { sensitivity: 'base' })
      || a.name.localeCompare(b.name, undefined, { sensitivity: 'base' })
    const cmpDatum = (a, b) => b._datum - a._datum || cmpNaam(a, b)
    const cmpProj = (a, b) => (a._proj || '\uffff').localeCompare(b._proj || '\uffff', undefined, { sensitivity: 'base' })
      || cmpNaam(a, b)

    let sorter
    if (modus === 'date') sorter = cmpDatum
    else if (modus === 'project') sorter = cmpProj
    else sorter = cmpNaam

    const favs = lijst.filter(f => f.favorite).sort(sorter)
    const rest = lijst.filter(f => !f.favorite).sort(sorter)
    return { favorieten: favs, rest, alles: favs.concat(rest) }
  }

  function heeftNoteFooter(tekst) {
    return FOOTER_RE.test(String(tekst == null ? '' : tekst))
  }

  return {
    NOTE_EXT, FOOTER_START, FOOTER_END,
    extensieVan, isNoteBestand, maakId, leegMeta,
    parseProjecten, parseMetaRegels, parseNote,
    buildFooter, schrijfNote, stampUpdated,
    subjectVan, datumVoorSort, projectLabel, sorteerNotes, heeftNoteFooter,
  }
})
