// Kleuren in de editor: html, css en js leesbaar maken.
//
// Zelfde patroon als web-tools.js en lezer-aanvul.js: pure functies, geen DOM,
// zodat de test er zonder Electron bij kan. De tekenaar in renderer.js legt de
// uitkomst als een <pre> onder het tekstvak; hier gebeurt alleen het knippen.
//
// Geen parser en geen taalmodel — een scanner die van links naar rechts leest.
// Dat is precies genoeg om kleur te geven en niet genoeg om ergens op vast te
// lopen: wat de scanner niet herkent, blijft gewoon gewone tekst.
;(function (root, factory) {
  const api = factory()
  if (typeof module === 'object' && module.exports) module.exports = api
  else root.CodeKleuren = api
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {

  // ── Wat er te kleuren valt ──────────────────────────────────────────────────
  // Bewust kort. Elk soort dat erbij komt is een extra kleurkiezer in de
  // instellingen; twintig regelaars voor code die je even bijwerkt is geen
  // instelling meer maar huiswerk.
  const SOORTEN = [
    'comment',    // <!-- -->, /* */, //
    'tag',        // htmltags
    'attr',       // attribuutnamen
    'string',     // tekst tussen aanhalingstekens (en regex)
    'nummer',     // getallen, #hex-kleuren
    'keyword',    // js-sleutelwoorden, @media, <!doctype>
    'functie',    // aanroepen: naam(
    'selector',   // css-selectors
    'prop',       // css-eigenschappen en --variabelen
    'waarde',     // css-waarden, true/false/null
    'leesteken',  // haakjes, punten, operatoren
  ]

  // ── Thema's ─────────────────────────────────────────────────────────────────
  // "commanddeck" gebruikt de kleuren die de app zelf al voert. De rest is er
  // voor wie een andere editor gewend is; alles is achteraf per kleur bij te
  // stellen, dus dit zijn startpunten en geen keurslijf.
  const THEMAS = {
    commanddeck: {
      comment: '#5f6b6e', tag: '#54c8e8', attr: '#a78bfa', string: '#4ade80',
      nummer: '#fbbf24', keyword: '#f472b6', functie: '#60a5fa',
      selector: '#54c8e8', prop: '#a78bfa', waarde: '#fb923c', leesteken: '#8a8a8a',
    },
    nachtblauw: {
      comment: '#637777', tag: '#7fdbca', attr: '#c792ea', string: '#ecc48d',
      nummer: '#f78c6c', keyword: '#c792ea', functie: '#82aaff',
      selector: '#7fdbca', prop: '#80cbc4', waarde: '#f78c6c', leesteken: '#7e8a90',
    },
    monokai: {
      comment: '#75715e', tag: '#f92672', attr: '#a6e22e', string: '#e6db74',
      nummer: '#ae81ff', keyword: '#f92672', functie: '#66d9ef',
      selector: '#a6e22e', prop: '#66d9ef', waarde: '#ae81ff', leesteken: '#d8d8d2',
    },
    dracula: {
      comment: '#6272a4', tag: '#ff79c6', attr: '#50fa7b', string: '#f1fa8c',
      nummer: '#bd93f9', keyword: '#ff79c6', functie: '#8be9fd',
      selector: '#50fa7b', prop: '#8be9fd', waarde: '#bd93f9', leesteken: '#d8d8d2',
    },
    zacht: {
      comment: '#6b7280', tag: '#93c5fd', attr: '#c4b5fd', string: '#86efac',
      nummer: '#fcd34d', keyword: '#f9a8d4', functie: '#a5b4fc',
      selector: '#93c5fd', prop: '#c4b5fd', waarde: '#fdba74', leesteken: '#9ca3af',
    },
  }

  const THEMA_IDS = Object.keys(THEMAS)
  const STANDAARD_THEMA = 'commanddeck'

  // Boven deze grootte kleuren we niet meer. Een bestand van een halve miljoen
  // tekens opnieuw inkleuren bij elke toetsaanslag maakt van typen wachten.
  const MAX_TEKENS = 150000

  function taalVanPad(pad) {
    const kaal = String(pad || '').split(/[\\/]/).pop()
    const punt = kaal.lastIndexOf('.')
    const e = punt > 0 ? kaal.slice(punt + 1).toLowerCase() : ''
    if (e === 'html' || e === 'htm') return 'html'
    if (e === 'css') return 'css'
    if (e === 'js' || e === 'mjs' || e === 'cjs') return 'js'
    return ''
  }

  // Kleuren zoals ze uiteindelijk gelden: thema als bodem, eigen keuzes erover.
  // Alles wat ontbreekt of geen geldige kleur is valt terug op het thema, zodat
  // een half ingevuld instellingenbestand nooit onzichtbare tekst oplevert.
  function isKleur(v) {
    return typeof v === 'string' && /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(v.trim())
  }

  function kleuren(inst) {
    const i = inst || {}
    const basis = THEMAS[i.thema] || THEMAS[STANDAARD_THEMA]
    const eigen = i.kleuren || {}
    const uit = {}
    for (const s of SOORTEN) uit[s] = isKleur(eigen[s]) ? eigen[s].trim() : basis[s]
    return uit
  }

  // Staan de eigen kleuren nog gelijk aan het thema? Zo niet heet het "eigen"
  // in de keuzelijst — anders wijst de lijst een thema aan dat je niet ziet.
  function volgtThema(inst) {
    const i = inst || {}
    const basis = THEMAS[i.thema] || THEMAS[STANDAARD_THEMA]
    const nu = kleuren(i)
    return SOORTEN.every(s => nu[s].toLowerCase() === basis[s].toLowerCase())
  }

  function esc(s) {
    return String(s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  }

  // ── Gedeelde stukjes scanner ────────────────────────────────────────────────
  function eindeString(src, i, quote) {
    const n = src.length
    let j = i + 1
    while (j < n) {
      const c = src[j]
      if (c === '\\') { j += 2; continue }
      if (c === quote) return j + 1
      // Niet-afgesloten string: stoppen op de regel in plaats van de rest van
      // het bestand groen te maken.
      if (quote !== '`' && c === '\n') return j
      j++
    }
    return n
  }

  // ── JavaScript ──────────────────────────────────────────────────────────────
  const JS_KEYWORDS = new Set([
    'as', 'async', 'await', 'break', 'case', 'catch', 'class', 'const', 'continue',
    'debugger', 'default', 'delete', 'do', 'else', 'export', 'extends', 'finally',
    'for', 'from', 'function', 'get', 'if', 'import', 'in', 'instanceof', 'let',
    'new', 'of', 'return', 'set', 'static', 'switch', 'throw', 'try', 'typeof',
    'var', 'void', 'while', 'with', 'yield',
  ])
  const JS_WAARDEN = new Set([
    'true', 'false', 'null', 'undefined', 'NaN', 'Infinity', 'this', 'super',
    'arguments', 'globalThis',
  ])
  // Na deze woorden en tekens kan een / geen deling zijn, dus dan is het een
  // reguliere expressie. Andersom: na een naam of een ) is het delen.
  const REGEX_NA_WOORD = new Set([
    'return', 'typeof', 'instanceof', 'in', 'of', 'case', 'do', 'else', 'yield',
    'await', 'delete', 'void', 'new', 'throw',
  ])
  const REGEX_NA_TEKEN = new Set([
    '', '(', ',', '=', ':', '[', '!', '&', '|', '?', '{', '}', ';', '+', '-',
    '*', '%', '<', '>', '~', '^',
  ])
  const JS_LEESTEKENS = new Set('()[]{}.,;:?!<>=+-*/%&|^~'.split(''))

  function eindeRegex(src, i) {
    const n = src.length
    let j = i + 1
    let inKlasse = false
    while (j < n) {
      const c = src[j]
      if (c === '\\') { j += 2; continue }
      if (c === '\n') return -1
      if (inKlasse) { if (c === ']') inKlasse = false }
      else if (c === '[') inKlasse = true
      else if (c === '/') {
        j++
        while (j < n && /[a-z]/.test(src[j])) j++
        return j
      }
      j++
    }
    return -1
  }

  function tokensJs(src) {
    const uit = []
    const n = src.length
    const duw = (s, t) => { if (t) uit.push({ s, t }) }
    let i = 0
    let vorige = ''      // laatste betekenisvolle woord of teken
    while (i < n) {
      const c = src[i]
      if (c === ' ' || c === '\t' || c === '\n' || c === '\r') {
        let j = i
        while (j < n && /\s/.test(src[j])) j++
        duw('', src.slice(i, j)); i = j; continue
      }
      if (c === '/' && src[i + 1] === '/') {
        let j = src.indexOf('\n', i)
        if (j < 0) j = n
        duw('comment', src.slice(i, j)); i = j; continue
      }
      if (c === '/' && src[i + 1] === '*') {
        let j = src.indexOf('*/', i + 2)
        j = j < 0 ? n : j + 2
        duw('comment', src.slice(i, j)); i = j; continue
      }
      if (c === '"' || c === "'" || c === '`') {
        const j = eindeString(src, i, c)
        duw('string', src.slice(i, j)); i = j; vorige = 'x'; continue
      }
      if (c === '/' && (REGEX_NA_TEKEN.has(vorige) || REGEX_NA_WOORD.has(vorige))) {
        const j = eindeRegex(src, i)
        if (j > 0) { duw('string', src.slice(i, j)); i = j; vorige = 'x'; continue }
      }
      if (/[0-9]/.test(c) || (c === '.' && /[0-9]/.test(src[i + 1] || ''))) {
        let j = i
        if (c === '0' && /[xXbBoO]/.test(src[i + 1] || '')) {
          j = i + 2
          while (j < n && /[0-9a-fA-F_]/.test(src[j])) j++
        } else {
          while (j < n && /[0-9_]/.test(src[j])) j++
          if (src[j] === '.') { j++; while (j < n && /[0-9_]/.test(src[j])) j++ }
          // Een exponent hoort er nog bij: 1e-9 is één getal, geen som.
          if (/[eE]/.test(src[j] || '')) {
            let k = j + 1
            if (/[+-]/.test(src[k] || '')) k++
            if (/[0-9]/.test(src[k] || '')) {
              while (k < n && /[0-9_]/.test(src[k])) k++
              j = k
            }
          }
        }
        if (src[j] === 'n') j++
        duw('nummer', src.slice(i, j)); i = j; vorige = 'x'; continue
      }
      if (/[A-Za-z_$]/.test(c)) {
        let j = i
        while (j < n && /[A-Za-z0-9_$]/.test(src[j])) j++
        const woord = src.slice(i, j)
        let k = j
        while (k < n && /[ \t]/.test(src[k])) k++
        const soort = JS_KEYWORDS.has(woord) ? 'keyword'
          : JS_WAARDEN.has(woord) ? 'waarde'
          : src[k] === '(' ? 'functie'
          : ''
        duw(soort, woord); i = j
        vorige = JS_KEYWORDS.has(woord) ? woord : 'x'
        continue
      }
      if (JS_LEESTEKENS.has(c)) {
        // Een reeks in één keer scheelt spans, maar een / moet los blijven —
        // anders slikt de reeks het begin van een commentaar of een regex in.
        let j = i
        while (j < n && JS_LEESTEKENS.has(src[j])) {
          if (src[j] === '/' && j > i) break
          j++
          if (src[j - 1] === '/') break
        }
        duw('leesteken', src.slice(i, j))
        vorige = src[j - 1]
        i = j; continue
      }
      duw('', c); i++; vorige = c
    }
    return uit
  }

  // ── CSS ─────────────────────────────────────────────────────────────────────
  // At-regels met een eigen blok vol selectors erin. Bij de rest (@font-face,
  // @page) staan gewoon eigenschappen tussen de accolades.
  const CSS_GROEP_AT = new Set([
    'media', 'supports', 'layer', 'container', 'scope', 'document', 'keyframes',
  ])

  function tokensCss(src) {
    const uit = []
    const n = src.length
    const duw = (s, t) => { if (t) uit.push({ s, t }) }
    let i = 0
    let modus = 'selector'       // selector | prop | waarde
    const stapel = []            // per open accolade: is het een groep-at-regel?
    let groepPrelude = false

    // Waar val je op terug na een } of een ;: in een groep-at-regel weer bij de
    // selectors, in een gewoon blok weer bij de eigenschappen.
    function naBlok() {
      if (!stapel.length) return 'selector'
      return stapel[stapel.length - 1] ? 'selector' : 'prop'
    }

    while (i < n) {
      const c = src[i]
      if (/\s/.test(c)) {
        let j = i
        while (j < n && /\s/.test(src[j])) j++
        duw('', src.slice(i, j)); i = j; continue
      }
      if (c === '/' && src[i + 1] === '*') {
        let j = src.indexOf('*/', i + 2)
        j = j < 0 ? n : j + 2
        duw('comment', src.slice(i, j)); i = j; continue
      }
      if (c === '"' || c === "'") {
        const j = eindeString(src, i, c)
        duw('string', src.slice(i, j)); i = j; continue
      }
      if (c === '{') {
        duw('leesteken', c); i++
        stapel.push(groepPrelude)
        modus = groepPrelude ? 'selector' : 'prop'
        groepPrelude = false
        continue
      }
      if (c === '}') {
        duw('leesteken', c); i++
        stapel.pop()
        modus = naBlok()
        continue
      }
      if (c === ';') {
        duw('leesteken', c); i++
        modus = naBlok()
        continue
      }
      if (c === '@' && modus !== 'waarde') {
        let j = i + 1
        while (j < n && /[\w-]/.test(src[j])) j++
        const naam = src.slice(i + 1, j).toLowerCase().replace(/^-\w+-/, '')
        if (CSS_GROEP_AT.has(naam)) groepPrelude = true
        duw('keyword', src.slice(i, j)); i = j; continue
      }

      if (modus === 'waarde') {
        if (c === '#') {
          let j = i + 1
          while (j < n && /[0-9a-fA-F]/.test(src[j])) j++
          duw('nummer', src.slice(i, j)); i = j; continue
        }
        if (c === '!') {
          let j = i + 1
          while (j < n && /[A-Za-z-]/.test(src[j])) j++
          duw('keyword', src.slice(i, j)); i = j; continue
        }
        if (/[0-9]/.test(c) || (c === '.' && /[0-9]/.test(src[i + 1] || ''))) {
          let j = i
          while (j < n && /[0-9.]/.test(src[j])) j++
          while (j < n && /[A-Za-z%]/.test(src[j])) j++
          duw('nummer', src.slice(i, j)); i = j; continue
        }
        if (/[A-Za-z_-]/.test(c)) {
          let j = i
          while (j < n && /[A-Za-z0-9_-]/.test(src[j])) j++
          const woord = src.slice(i, j)
          const soort = src[j] === '(' ? 'functie'
            : woord.startsWith('--') ? 'prop'
            : 'waarde'
          duw(soort, woord); i = j; continue
        }
        duw('leesteken', c); i++; continue
      }

      if (modus === 'prop' && /[A-Za-z_-]/.test(c)) {
        let j = i
        while (j < n && /[A-Za-z0-9_-]/.test(src[j])) j++
        let k = j
        while (k < n && /\s/.test(src[k])) k++
        // Een naam met een dubbele punt erachter is een eigenschap; staat er
        // iets anders, dan is dit een geneste selector (element, & of ::before).
        duw(src[k] === ':' ? 'prop' : 'selector', src.slice(i, j))
        i = j; continue
      }
      if (modus === 'prop' && c === ':') {
        duw('leesteken', c); i++; modus = 'waarde'; continue
      }

      // Selectorstand — en alles wat in de propstand geen eigenschap bleek.
      if (/[A-Za-z0-9_\-.#*&:[\]=|^$~]/.test(c)) {
        let j = i
        while (j < n && /[A-Za-z0-9_\-.#*&:[\]=|^$~]/.test(src[j])) j++
        duw('selector', src.slice(i, j)); i = j; continue
      }
      duw('leesteken', c); i++
    }
    return uit
  }

  // ── HTML ────────────────────────────────────────────────────────────────────
  function tokensHtml(src) {
    const uit = []
    const n = src.length
    const duw = (s, t) => { if (t) uit.push({ s, t }) }
    let i = 0
    while (i < n) {
      const lt = src.indexOf('<', i)
      if (lt < 0) { duw('', src.slice(i)); break }
      if (lt > i) duw('', src.slice(i, lt))
      i = lt

      if (src.startsWith('<!--', i)) {
        let j = src.indexOf('-->', i + 4)
        j = j < 0 ? n : j + 3
        duw('comment', src.slice(i, j)); i = j; continue
      }
      if (src.startsWith('<!', i) || src.startsWith('<?', i)) {
        let j = src.indexOf('>', i)
        j = j < 0 ? n : j + 1
        duw('keyword', src.slice(i, j)); i = j; continue
      }
      const m = /^<(\/?)([A-Za-z][\w:-]*)/.exec(src.slice(i))
      if (!m) { duw('', '<'); i++; continue }

      const sluit = m[1] === '/'
      const naam = m[2]
      duw('leesteken', sluit ? '</' : '<')
      duw('tag', naam)
      let j = i + m[0].length
      let verwachtWaarde = false

      while (j < n) {
        const c = src[j]
        if (/\s/.test(c)) {
          let k = j
          while (k < n && /\s/.test(src[k])) k++
          duw('', src.slice(j, k)); j = k; continue
        }
        if (c === '>') { duw('leesteken', '>'); j++; break }
        if (c === '/' && src[j + 1] === '>') { duw('leesteken', '/>'); j += 2; break }
        if (c === '=') { duw('leesteken', '='); j++; verwachtWaarde = true; continue }
        if (c === '"' || c === "'") {
          const k = eindeString(src, j, c)
          duw('string', src.slice(j, k)); j = k; verwachtWaarde = false; continue
        }
        // Waarde zonder aanhalingstekens (href=/over) hoort ook bij de waarde
        // en niet bij de volgende attribuutnaam.
        if (verwachtWaarde) {
          let k = j
          while (k < n && !/[\s>]/.test(src[k])) k++
          if (k > j) { duw('string', src.slice(j, k)); j = k; verwachtWaarde = false; continue }
        }
        let k = j
        while (k < n && !/[\s=>/"']/.test(src[k])) k++
        if (k === j) { duw('', src[j]); j++; continue }
        duw('attr', src.slice(j, k)); j = k
      }
      i = j

      // <style> en <script> krijgen hun eigen taal mee. Zonder dit is de helft
      // van een pagina één grijze vlakte, en dat is precies de helft waar je
      // aan zit te werken.
      const laag = naam.toLowerCase()
      if (!sluit && (laag === 'style' || laag === 'script')) {
        const dicht = new RegExp('</' + laag + '\\b', 'i')
        const mm = dicht.exec(src.slice(i))
        const eind = mm ? i + mm.index : n
        const binnen = src.slice(i, eind)
        if (binnen) {
          const sub = laag === 'style' ? tokensCss(binnen) : tokensJs(binnen)
          for (const t of sub) uit.push(t)
        }
        i = eind
      }
    }
    return uit
  }

  function tokens(tekst, taal) {
    const src = String(tekst == null ? '' : tekst)
    if (!src) return []
    if (taal === 'html') return tokensHtml(src)
    if (taal === 'css') return tokensCss(src)
    if (taal === 'js') return tokensJs(src)
    return [{ s: '', t: src }]
  }

  // Klaar om in een <pre> te zetten. Geen vet en geen cursief: de laag ligt
  // precies over het tekstvak, en een ander lettertype schuift de tekst op.
  function verf(tekst, taal) {
    let uit = ''
    for (const t of tokens(tekst, taal)) {
      uit += t.s ? '<span class="ck-' + t.s + '">' + esc(t.t) + '</span>' : esc(t.t)
    }
    return uit
  }

  function magVerven(tekst, taal) {
    if (!taal) return false
    return String(tekst || '').length <= MAX_TEKENS
  }

  return {
    SOORTEN, THEMAS, THEMA_IDS, STANDAARD_THEMA, MAX_TEKENS,
    taalVanPad, isKleur, kleuren, volgtThema,
    tokens, tokensHtml, tokensCss, tokensJs, verf, magVerven,
  }
})
