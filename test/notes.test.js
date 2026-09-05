// Pure notitie-logica: footer parse/schrijf en sorteren.
const N = require('../note-tools')

let ok = true
const t = (l, c) => { console.log((c ? 'PASS  ' : 'FAIL  ') + l); if (!c) ok = false }

t('txt en md zijn notitiebestanden', N.isNoteBestand('a.txt') && N.isNoteBestand('b.MD'))
t('log mag ook', N.isNoteBestand('x.log'))
t('html niet als notitie-extensie', !N.isNoteBestand('a.html'))

t('zonder footer: body blijft, meta null', (() => {
  const r = N.parseNote('hallo wereld\n')
  return r.heeftFooter === false && r.body === 'hallo wereld' && r.meta === null
})())

t('footer wordt herkend', (() => {
  const tekst = 'notitie hier\n\n--- CommandDeck:note ---\nid: cdn_abc\nsubject: Test\ncreated: 2026-01-02\nupdated: 2026-01-03T10:00:00Z\nprojects: p1; p2\nfavorite: 1\n---\n'
  const r = N.parseNote(tekst)
  return r.heeftFooter
    && r.body === 'notitie hier'
    && r.meta.id === 'cdn_abc'
    && r.meta.subject === 'Test'
    && r.meta.created === '2026-01-02'
    && r.meta.projects.join(',') === 'p1,p2'
    && r.meta.favorite === true
})())

t('schrijfNote zet footer onderaan', (() => {
  const meta = N.leegMeta({ id: 'cdn_x', subject: 'Onderwerp', created: '2026-09-05', favorite: false })
  const uit = N.schrijfNote('regel één', meta)
  return uit.startsWith('regel één\n\n--- CommandDeck:note ---')
    && /subject: Onderwerp/.test(uit)
    && /favorite: 0/.test(uit)
    && uit.trimEnd().endsWith('---')
})())

t('opnieuw schrijven bewaart de body', (() => {
  const eerste = N.schrijfNote('abc', N.leegMeta({ id: 'cdn_1', subject: 'A' }))
  const geparsed = N.parseNote(eerste)
  const tweede = N.schrijfNote(geparsed.body + '\nmeer', Object.assign({}, geparsed.meta, { subject: 'B' }))
  const weer = N.parseNote(tweede)
  return weer.body === 'abc\nmeer' && weer.meta.subject === 'B' && weer.meta.id === 'cdn_1'
})())

t('stampUpdated zet updated', (() => {
  const m = N.stampUpdated(N.leegMeta({ id: 'cdn_z', created: '2020-01-01' }))
  return m.id === 'cdn_z' && m.created === '2020-01-01' && !!m.updated
})())

t('favorieten komen bovenaan bij sorteren', (() => {
  const files = [
    { path: 'C:\\a\\b.txt', name: 'b.txt', mtime: 2, meta: { subject: 'B', favorite: false } },
    { path: 'C:\\a\\a.txt', name: 'a.txt', mtime: 1, meta: { subject: 'A', favorite: true } },
    { path: 'C:\\a\\c.txt', name: 'c.txt', mtime: 3, meta: { subject: 'C', favorite: false } },
  ]
  const s = N.sorteerNotes(files, 'name', [])
  return s.favorieten.length === 1
    && s.favorieten[0].name === 'a.txt'
    && s.rest.map(f => f.name).join(',') === 'b.txt,c.txt'
    && s.alles[0].name === 'a.txt'
})())

t('sorteer op datum: nieuwste eerst in rest', (() => {
  const files = [
    { path: '1', name: '1.txt', mtime: 10, meta: { subject: 'oud', updated: '2020-01-01' } },
    { path: '2', name: '2.txt', mtime: 20, meta: { subject: 'nieuw', updated: '2026-01-01' } },
  ]
  const s = N.sorteerNotes(files, 'date', [])
  return s.rest[0].name === '2.txt'
})())

t('settings-favorieten tellen ook mee', (() => {
  const files = [{ path: 'C:\\x\\y.txt', name: 'y.txt', mtime: 1, meta: null }]
  const s = N.sorteerNotes(files, 'name', ['C:\\x\\y.txt'])
  return s.favorieten.length === 1
})())

t('heeftNoteFooter', N.heeftNoteFooter('x\n\n--- CommandDeck:note ---\nid: a\nsubject:\ncreated:\nupdated:\nprojects:\nfavorite: 0\n---\n'))
t('zonder marker geen footer', !N.heeftNoteFooter('gewoon tekst'))

// Contract: bedrading in de app
const fs = require('fs'), path = require('path')
const APP = path.join(__dirname, '..')
const ren = fs.readFileSync(path.join(APP, 'renderer.js'), 'utf8')
const html = fs.readFileSync(path.join(APP, 'index.html'), 'utf8')
const main = fs.readFileSync(path.join(APP, 'main.js'), 'utf8')
const preload = fs.readFileSync(path.join(APP, 'preload.js'), 'utf8')
const nl = JSON.parse(fs.readFileSync(path.join(APP, 'locales/nl.json'), 'utf8'))
const en = JSON.parse(fs.readFileSync(path.join(APP, 'locales/en.json'), 'utf8'))

t('zijbalk heeft tekst-knop', /id="btn-nav-text"/.test(html) && /id="text-panel"/.test(html))
t('note-tools wordt geladen', /src="note-tools.js"/.test(html))
t('renderer kent text-view',
  /sleutel: 'text'/.test(ren) && /function openTextView\(/.test(ren) && /function renderTextPanel\(/.test(ren))
t('main kent note:list', /note:list/.test(main) && /note:listPaths/.test(main) && /note:schrijf/.test(main))
t('preload geeft note-api door', /listNotes:/.test(preload) && /listNotePaths:/.test(preload) && /schrijfNote:/.test(preload))
t('favorieten-sectie in de lijst', /text.favoritesSection/.test(ren) && /text-files-sectie/.test(ren))
t('verkenner opent notities', /function openNoteVanVerkenner\(/.test(ren) && /NoteTools\.isNoteBestand/.test(ren))
t('footer standaard verborgen', /function textMetaZichtbaar\(/.test(ren) && /textMetaZichtbaar === true/.test(ren))
t('info zit in het tekstvak', /function textVoorEditorVak\(/.test(ren) && !/id="text-meta-footer"/.test(ren) && !/id="text-meta-rij"/.test(ren))
t('plus-menu en bibliotheek', /function toonTextAddMenu\(/.test(ren) && /function zetTextInBibliotheek\(/.test(ren) && /id="text-add"/.test(ren))
t('tonen in project', /function toonNoteInProject\(/.test(ren) && /text\.showInProject/.test(ren))
t('note-info dialoog', /function openNoteInfo\(/.test(ren) && /id="modal-note-info"/.test(html) && /id="set-text-meta"/.test(ren))
t('favoriet wist ook footer', /function zetTextFavoriteLijst\(/.test(ren) && /skipFavSync/.test(ren) && !/isTextFavorite\(pad\) \|\| !!textState\.meta\.favorite/.test(ren))
t('nl en en hebben text.showMetaInEditor', !!(nl['text.showMetaInEditor'] && en['text.showMetaInEditor'] && nl['text.showInProject'] && en['text.showInProject']))
t('nl en en hebben text.title', !!(nl['text.title'] && en['text.title'] && nl['sidebar.navText'] && en['sidebar.navText']))

if (!ok) process.exit(1)
console.log('\nALLE NOTES-TESTS OK')
