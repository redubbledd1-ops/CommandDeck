// Lichte aanvulling voor de web-editor: tags, css-eigenschappen, js-woorden.
// Geen IDE — alleen beginnen typen en een korte, scrollbare lijst.
;(function (root, factory) {
  const api = factory()
  if (typeof module === 'object' && module.exports) module.exports = api
  else root.LezerAanvul = api
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {

  const HTML_TAGS = [
    'a', 'abbr', 'address', 'area', 'article', 'aside', 'audio',
    'b', 'base', 'bdi', 'bdo', 'blockquote', 'body', 'br', 'button',
    'canvas', 'caption', 'cite', 'code', 'col', 'colgroup',
    'data', 'datalist', 'dd', 'del', 'details', 'dfn', 'dialog', 'div', 'dl', 'dt',
    'em', 'embed',
    'fieldset', 'figcaption', 'figure', 'footer', 'form',
    'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'head', 'header', 'hgroup', 'hr', 'html',
    'i', 'iframe', 'img', 'input', 'ins',
    'kbd',
    'label', 'legend', 'li', 'link',
    'main', 'map', 'mark', 'menu', 'meta', 'meter',
    'nav', 'noscript',
    'object', 'ol', 'optgroup', 'option', 'output',
    'p', 'picture', 'pre', 'progress',
    'q',
    'rp', 'rt', 'ruby',
    's', 'samp', 'script', 'search', 'section', 'select', 'slot', 'small',
    'source', 'span', 'strong', 'style', 'sub', 'summary', 'sup',
    'table', 'tbody', 'td', 'template', 'textarea', 'tfoot', 'th', 'thead',
    'time', 'title', 'tr', 'track',
    'u', 'ul',
    'var', 'video',
    'wbr',
  ]

  const HTML_VOID = new Set([
    'area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input',
    'link', 'meta', 'source', 'track', 'wbr',
  ])

  const CSS_PROPS = [
    'align-items', 'align-self', 'animation', 'animation-delay', 'animation-duration',
    'background', 'background-color', 'background-image', 'background-position',
    'background-repeat', 'background-size',
    'border', 'border-bottom', 'border-color', 'border-left', 'border-radius',
    'border-right', 'border-top', 'border-width', 'bottom', 'box-shadow', 'box-sizing',
    'clear', 'color', 'column-gap', 'content', 'cursor',
    'display',
    'flex', 'flex-basis', 'flex-direction', 'flex-grow', 'flex-shrink', 'flex-wrap',
    'float', 'font', 'font-family', 'font-size', 'font-style', 'font-weight',
    'gap', 'grid', 'grid-column', 'grid-row', 'grid-template-columns', 'grid-template-rows',
    'height',
    'justify-content', 'justify-items',
    'left', 'letter-spacing', 'line-height', 'list-style', 'list-style-type',
    'margin', 'margin-bottom', 'margin-left', 'margin-right', 'margin-top',
    'max-height', 'max-width', 'min-height', 'min-width',
    'object-fit', 'object-position', 'opacity', 'order', 'outline', 'overflow',
    'overflow-x', 'overflow-y',
    'padding', 'padding-bottom', 'padding-left', 'padding-right', 'padding-top',
    'pointer-events', 'position',
    'right', 'row-gap',
    'text-align', 'text-decoration', 'text-overflow', 'text-shadow', 'text-transform',
    'top', 'transform', 'transition', 'transition-duration',
    'vertical-align', 'visibility',
    'white-space', 'width', 'word-break', 'word-wrap',
    'z-index',
  ]

  const JS_WORDS = [
    'async', 'await', 'break', 'Boolean', 'break', 'case', 'catch', 'class', 'const',
    'console', 'continue', 'Date', 'debugger', 'default', 'delete', 'do', 'document',
    'else', 'export', 'extends', 'false', 'fetch', 'finally', 'for', 'function',
    'if', 'import', 'in', 'instanceof', 'JSON', 'let', 'localStorage', 'Math',
    'new', 'null', 'Number', 'Object', 'Promise', 'return', 'sessionStorage',
    'static', 'String', 'super', 'switch', 'this', 'throw', 'true', 'try',
    'typeof', 'undefined', 'var', 'void', 'while', 'window', 'yield',
    'addEventListener', 'appendChild', 'clearTimeout', 'createElement',
    'forEach', 'getElementById', 'includes', 'map', 'filter', 'reduce',
    'querySelector', 'querySelectorAll', 'removeEventListener',
    'setInterval', 'setTimeout', 'classList', 'length', 'push', 'pop',
    'slice', 'splice', 'then', 'catch', 'preventDefault', 'textContent',
    'innerHTML', 'value', 'style', 'parentElement', 'children',
  ]

  const MAX_VOORSTELLEN = 40

  function taalVanPad(pad) {
    const e = String(pad || '').split(/[\\/]/).pop().split('.').pop().toLowerCase()
    if (e === 'html' || e === 'htm') return 'html'
    if (e === 'css') return 'css'
    if (e === 'js' || e === 'mjs' || e === 'cjs') return 'js'
    return null
  }

  function filterLijst(lijst, prefix) {
    const p = String(prefix || '').toLowerCase()
    if (!p) return []
    const start = []
    const midden = []
    for (const woord of lijst) {
      const w = woord.toLowerCase()
      if (w === p) continue
      if (w.startsWith(p)) start.push(woord)
      else if (w.includes(p)) midden.push(woord)
    }
    start.sort((a, b) => a.length - b.length || a.localeCompare(b))
    midden.sort((a, b) => a.length - b.length || a.localeCompare(b))
    return start.concat(midden).slice(0, MAX_VOORSTELLEN)
  }

  // Wat is de gebruiker net aan het typen? Alleen lichte context — geen parser.
  function contextBijCursor(tekst, pos, taal) {
    const t = String(tekst || '')
    const i = Math.max(0, Math.min(Number(pos) || 0, t.length))
    const voor = t.slice(0, i)

    if (taal === 'html') {
      const m = voor.match(/<\/?([a-zA-Z][\w:-]*)$/)
      if (m) {
        return {
          soort: 'tag',
          prefix: m[1],
          van: i - m[1].length,
          tot: i,
          sluit: voor.slice(0, i - m[1].length).endsWith('</'),
        }
      }
      return null
    }

    if (taal === 'css') {
      // Na : zit je in een waarde — daar vullen we (nog) niets aan.
      const regel = voor.split(/[{};\n]/).pop() || ''
      if (regel.includes(':')) return null
      const m = regel.match(/^\s*([a-zA-Z-][a-zA-Z0-9-]*)$/)
      if (m) {
        return {
          soort: 'prop',
          prefix: m[1],
          van: i - m[1].length,
          tot: i,
        }
      }
      return null
    }

    if (taal === 'js') {
      const m = voor.match(/(?:^|[^\w$])([a-zA-Z_$][\w$]*)$/)
      if (m) {
        return {
          soort: 'woord',
          prefix: m[1],
          van: i - m[1].length,
          tot: i,
        }
      }
      return null
    }

    return null
  }

  function voorstellen(taal, prefix) {
    if (taal === 'html') return filterLijst(HTML_TAGS, prefix)
    if (taal === 'css') return filterLijst(CSS_PROPS, prefix)
    if (taal === 'js') return filterLijst(JS_WORDS, prefix)
    return []
  }

  // Wat er in de tekst komt bij een keuze. Cursor staat ná de invoeging,
  // behalve bij een open html-tag met sluit-tag: midden ertussen.
  function invoegTekst(taal, keuze, ctx) {
    if (!keuze) return { tekst: '', cursorIn: 0 }
    if (taal === 'html' && ctx && ctx.soort === 'tag' && !ctx.sluit) {
      if (HTML_VOID.has(keuze)) {
        return { tekst: keuze, cursorIn: keuze.length }
      }
      const open = keuze
      const sluit = '</' + keuze + '>'
      // main></main> — cursor tussen de tags
      return { tekst: open + '></' + keuze + '>', cursorIn: open.length + 1 }
    }
    if (taal === 'css' && ctx && ctx.soort === 'prop') {
      const tekst = keuze + ': '
      return { tekst, cursorIn: tekst.length }
    }
    return { tekst: keuze, cursorIn: keuze.length }
  }

  function voorstellenBijCursor(tekst, pos, pad) {
    const taal = taalVanPad(pad)
    if (!taal) return null
    const ctx = contextBijCursor(tekst, pos, taal)
    if (!ctx || !ctx.prefix) return null
    // Eén letter is genoeg voor html/css; js ook — anders voelt het dood.
    const lijst = voorstellen(taal, ctx.prefix)
    if (!lijst.length) return null
    return { taal, ctx, lijst }
  }

  return {
    HTML_TAGS, HTML_VOID, CSS_PROPS, JS_WORDS, MAX_VOORSTELLEN,
    taalVanPad, filterLijst, contextBijCursor, voorstellen,
    invoegTekst, voorstellenBijCursor,
  }
})
