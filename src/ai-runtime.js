// Praten met een AI-dienst, vanuit het hoofdproces.
//
// Waarom hier en niet in de renderer: de API-sleutel hoort niet in het venster
// thuis (die zou dan in elke pagina-context leesbaar zijn), en fetch vanuit een
// pagina loopt tegen CORS aan. Het hoofdproces heeft geen van beide problemen.
//
// De renderer stuurt een gesprek in, krijgt de tekst stukje bij beetje terug
// via 'ai:stuk', en aan het eind het hele antwoord als resultaat van de aanroep.
// Welke dienst het is doet er hier niet toe: alles wat dienst-specifiek is
// staat in ai-providers.js.

const fs = require('fs')
const path = require('path')
const { AI_PROVIDERS, vindProvider, vindModel } = require('./ai-providers')

// ── Server-sent events ────────────────────────────────────────────────────────
// Een SSE-stroom is een reeks blokken, gescheiden door een lege regel. Elk blok
// heeft één of meer `data:`-regels die samen één JSON-bericht vormen. Los
// gehouden van de rest zodat het te testen valt zonder netwerk.
function sseBlokken(buffer) {
  const genormaliseerd = buffer.replace(/\r\n/g, '\n')
  const stukken = genormaliseerd.split('\n\n')
  const rest = stukken.pop()          // laatste stuk is nog niet af
  return { blokken: stukken, rest }
}

function sseData(blok) {
  const regels = String(blok || '').split('\n')
    .filter(r => r.startsWith('data:'))
    .map(r => r.slice(5).trim())
  if (!regels.length) return null
  const tekst = regels.join('\n')
  if (!tekst || tekst === '[DONE]') return null
  try { return JSON.parse(tekst) } catch { return null }
}

function maakAi({ ipcMain, getWin, userDataDir, safeStorage, fetchImpl }) {
  const SLEUTEL_BESTAND = path.join(userDataDir, 'ai-keys.json')
  const doeFetch = fetchImpl || globalThis.fetch
  const lopend = new Map()          // weergave-id -> AbortController

  // ── Sleutels ────────────────────────────────────────────────────────────────
  // Apart bestand, niet in settings.json: dat bestand wordt gedeeld, gekopieerd
  // en in een handoff geplakt. Waar het kan versleuteld met de sleutelbos van
  // het besturingssysteem, zodat het bestand op zichzelf niets waard is.
  function kanVersleutelen() {
    try { return !!(safeStorage && safeStorage.isEncryptionAvailable()) } catch { return false }
  }

  function leesBestand() {
    try {
      if (!fs.existsSync(SLEUTEL_BESTAND)) return { version: 1, versleuteld: false, sleutels: {} }
      const j = JSON.parse(fs.readFileSync(SLEUTEL_BESTAND, 'utf8'))
      return { version: 1, versleuteld: !!j.versleuteld, sleutels: j.sleutels || {} }
    } catch { return { version: 1, versleuteld: false, sleutels: {} } }
  }

  function schrijfBestand(data) {
    fs.mkdirSync(path.dirname(SLEUTEL_BESTAND), { recursive: true })
    fs.writeFileSync(SLEUTEL_BESTAND, JSON.stringify(data, null, 2), { mode: 0o600 })
  }

  function opgeslagenSleutel(providerId) {
    const data = leesBestand()
    const ruw = data.sleutels[providerId]
    if (!ruw) return ''
    if (!data.versleuteld) return String(ruw)
    try { return safeStorage.decryptString(Buffer.from(ruw, 'base64')) } catch { return '' }
  }

  function zetSleutel(providerId, sleutel) {
    const data = leesBestand()
    const kaal = String(sleutel || '').trim()

    // Wisselt de versleuteling (bv. sleutelbos nu wél beschikbaar), dan moeten
    // de andere sleutels mee — anders zijn ze straks onleesbaar.
    const versleuteld = kanVersleutelen()
    if (versleuteld !== data.versleuteld) {
      const klaartekst = {}
      for (const id of Object.keys(data.sleutels)) klaartekst[id] = opgeslagenSleutel(id)
      data.versleuteld = versleuteld
      data.sleutels = {}
      for (const id of Object.keys(klaartekst)) {
        if (!klaartekst[id]) continue
        data.sleutels[id] = versleuteld
          ? safeStorage.encryptString(klaartekst[id]).toString('base64')
          : klaartekst[id]
      }
    }

    if (!kaal) delete data.sleutels[providerId]
    else data.sleutels[providerId] = versleuteld
      ? safeStorage.encryptString(kaal).toString('base64')
      : kaal

    schrijfBestand(data)
    return { ok: true, versleuteld, leeg: !kaal }
  }

  // Een sleutel uit de omgeving telt ook mee: wie ANTHROPIC_API_KEY al gezet
  // heeft voor de opdrachtregel hoeft hem hier niet nóg een keer in te vullen.
  function sleutelVoor(provider) {
    const eigen = opgeslagenSleutel(provider.id)
    if (eigen) return { sleutel: eigen, bron: 'opgeslagen' }
    const env = provider.sleutel && provider.sleutel.env
    const uitOmgeving = env ? String(process.env[env] || '').trim() : ''
    if (uitOmgeving) return { sleutel: uitOmgeving, bron: env }
    return { sleutel: '', bron: '' }
  }

  function providerOverzicht() {
    return AI_PROVIDERS.map(p => {
      const { bron } = sleutelVoor(p)
      return {
        id: p.id,
        label: p.label,
        merk: p.merk,
        url: p.url,
        modellen: p.modellen || [],
        standaardModel: p.standaardModel || '',
        sleutelNodig: !!(p.sleutel && p.sleutel.nodig),
        sleutelWaar: (p.sleutel && p.sleutel.waar) || '',
        sleutelEnv: (p.sleutel && p.sleutel.env) || '',
        heeftSleutel: !!bron || !(p.sleutel && p.sleutel.nodig),
        sleutelBron: bron,
        lokaal: !!p.lokaal,
        gratis: !!p.gratis,
        // Wat de gebruiker moet doen als het niet lukt — per dienst anders.
        hulp: p.hulp || null,
        // Modellen om mee te beginnen als de server er zelf nog geen heeft.
        voorstellen: p.voorstellen || null,
        // Het opdrachtregelprogramma van dezelfde dienst, als dat bestaat.
        programma: p.programma || null,
        haalPatroon: p.haalPatroon || '',
        kanModellenHalen: !!(p.modellenUrl && p.modellenUit),
      }
    })
  }

  // ── Een vraag stellen ───────────────────────────────────────────────────────
  function stuurStuk(id, tekst) {
    const win = getWin && getWin()
    if (win && !win.isDestroyed()) win.webContents.send('ai:stuk', { id, tekst })
  }

  async function foutUitAntwoord(provider, res) {
    let ruw = ''
    try { ruw = await res.text() } catch {}
    let bericht = ''
    try { bericht = provider.fout(JSON.parse(ruw)) } catch {}
    if (!bericht) bericht = (ruw || '').slice(0, 300).trim()
    return bericht || ('HTTP ' + res.status)
  }

  async function stuur(opts = {}) {
    const id = opts.id || 'los'
    const provider = vindProvider(opts.providerId)
    if (!provider) return { ok: false, soort: 'onbekend', bericht: String(opts.providerId || '') }

    const { sleutel, bron } = sleutelVoor(provider)
    if (provider.sleutel && provider.sleutel.nodig && !sleutel) {
      return { ok: false, soort: 'sleutel', provider: provider.id,
               waar: provider.sleutel.waar || '', env: provider.sleutel.env || '' }
    }

    const berichten = Array.isArray(opts.berichten) ? opts.berichten : []
    if (!berichten.length) return { ok: false, soort: 'leeg' }

    const basis = String(opts.endpoint || '').trim() || provider.url
    const model = vindModel(provider, opts.model, opts.extraModellen)
    if (!model) return { ok: false, soort: 'geenmodel', provider: provider.id }
    // Bij sommige diensten zit het model in het adres in plaats van in de body.
    const url = provider.urlVoor ? provider.urlVoor({ basis, model, sleutel }) : basis
    const maxTokens = Math.min(32000, Math.max(256, Number(opts.maxTokens) || 4096))

    let body
    try {
      body = JSON.stringify(provider.body({
        model, berichten, maxTokens,
        systeem: String(opts.systeem || '').trim(),
      }))
    } catch (e) {
      return { ok: false, soort: 'opbouw', bericht: e.message }
    }

    stop(id)                                  // één gesprek tegelijk per weergave
    const ac = new AbortController()
    lopend.set(id, ac)

    let antwoord = ''
    let verbruik = { in: 0, uit: 0 }

    try {
      let res
      try {
        res = await doeFetch(url, {
          method: 'POST',
          headers: provider.headers({ sleutel }),
          body,
          signal: ac.signal,
        })
      } catch (e) {
        if (ac.signal.aborted) return { ok: false, soort: 'afgebroken' }
        return { ok: false, soort: 'netwerk', provider: provider.id,
                 bericht: e && e.message ? e.message : String(e), url }
      }

      if (!res.ok) {
        return { ok: false, soort: 'http', status: res.status, provider: provider.id,
                 bericht: await foutUitAntwoord(provider, res), url, model }
      }
      if (!res.body) return { ok: false, soort: 'netwerk', bericht: 'geen antwoordstroom', url }

      const lezer = res.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ''
      let streamFout = ''

      while (true) {
        const { done, value } = await lezer.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })
        const { blokken, rest } = sseBlokken(buffer)
        buffer = rest
        for (const blok of blokken) {
          const data = sseData(blok)
          if (!data) continue

          if (provider.streamFout) {
            const f = provider.streamFout(data)
            if (f) { streamFout = f; break }
          }
          if (provider.verbruik) {
            const v = provider.verbruik(data)
            // De tellingen die binnenkomen zijn lopende totalen, geen stukjes:
            // optellen zou ze dubbel tellen zodra er meer dan één langskomt.
            if (v) {
              verbruik.in  = Math.max(verbruik.in,  v.in  || 0)
              verbruik.uit = Math.max(verbruik.uit, v.uit || 0)
            }
          }
          const stukje = provider.stuk(data) || ''
          if (stukje) { antwoord += stukje; stuurStuk(id, stukje) }
        }
        if (streamFout) break
      }

      if (streamFout) return { ok: false, soort: 'dienst', bericht: streamFout, tekst: antwoord }
      if (!antwoord.trim()) return { ok: false, soort: 'leegantwoord', model }
      return { ok: true, tekst: antwoord, model, verbruik, sleutelBron: bron }
    } catch (e) {
      if (ac.signal.aborted) return { ok: false, soort: 'afgebroken', tekst: antwoord }
      return { ok: false, soort: 'onbekendefout', bericht: e && e.message ? e.message : String(e), tekst: antwoord }
    } finally {
      if (lopend.get(id) === ac) lopend.delete(id)
    }
  }

  function stop(id) {
    const ac = lopend.get(id)
    if (!ac) return false
    lopend.delete(id)
    try { ac.abort() } catch {}
    return true
  }

  // De echte modellenlijst bij de dienst opvragen. Wat hier hardgecodeerd staat
  // veroudert; dit niet. Bij een lokale server is het bovendien de enige manier
  // om te weten wat er is gedownload.
  async function modellen(opts = {}) {
    const provider = vindProvider(opts.providerId)
    if (!provider) return { ok: false, soort: 'onbekend', bericht: String(opts.providerId || '') }
    if (!provider.modellenUrl || !provider.modellenUit) return { ok: false, soort: 'kanniet' }

    const { sleutel } = sleutelVoor(provider)
    if (provider.sleutel && provider.sleutel.nodig && !sleutel) {
      return { ok: false, soort: 'sleutel', provider: provider.id,
               waar: provider.sleutel.waar || '', env: provider.sleutel.env || '' }
    }

    // Een afwijkend chat-adres betekent meestal ook een afwijkend modellen-adres.
    let url = provider.modellenUrl
    const eigenEndpoint = String(opts.endpoint || '').trim()
    if (eigenEndpoint) url = eigenEndpoint.replace(/\/chat\/completions$/, '/models')

    try {
      const koppen = { ...provider.headers({ sleutel }) }
      delete koppen['content-type']
      const res = await doeFetch(url, { method: 'GET', headers: koppen })
      if (!res.ok) {
        return { ok: false, soort: 'http', status: res.status, provider: provider.id,
                 bericht: await foutUitAntwoord(provider, res), url }
      }
      const json = await res.json()
      const lijst = (provider.modellenUit(json) || []).filter(m => m && m.id)
      lijst.sort((a, b) => a.id.localeCompare(b.id))
      return { ok: true, modellen: lijst, url }
    } catch (e) {
      return { ok: false, soort: 'netwerk', provider: provider.id,
               bericht: e && e.message ? e.message : String(e), url }
    }
  }

  // Korte proefvraag: zegt of sleutel, endpoint en model kloppen zonder dat je
  // eerst een heel gesprek hoeft te beginnen.
  async function test(opts = {}) {
    const r = await stuur({
      id: '__test__',
      providerId: opts.providerId,
      model: opts.model,
      endpoint: opts.endpoint,
      maxTokens: 256,
      systeem: 'Antwoord met precies één woord.',
      berichten: [{ rol: 'gebruiker', tekst: 'Zeg: ok' }],
    })
    return r
  }

  ipcMain.handle('ai:providers',  () => providerOverzicht())
  ipcMain.handle('ai:zetSleutel', (_, o = {}) => zetSleutel(o.providerId, o.sleutel))
  ipcMain.handle('ai:stuur',      (_, o) => stuur(o))
  ipcMain.handle('ai:stop',       (_, o = {}) => stop(o.id))
  ipcMain.handle('ai:test',       (_, o) => test(o))
  ipcMain.handle('ai:modellen',   (_, o) => modellen(o))

  return { stuur, stop, test, modellen, zetSleutel, providerOverzicht, sleutelVoor }
}

module.exports = { maakAi, sseBlokken, sseData }
