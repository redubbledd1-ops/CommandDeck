// De release-popup: één venster waarin je kiest hoe groot de wijziging is,
// opschrijft wat er nieuw is en ziet of de app de update zelf kan ontvangen.
//
// De logica (versies, controles, stappen) staat in release-tools.js en wordt
// daar getest; het uitvoeren gebeurt in main.js (release:run). Dit bestand is
// alleen het venster. Het gebruikt globals uit renderer.js (I18N, esc,
// showToast, setStatus, appendLine, ...), maar roept ze pas aan als je op de
// knop klikt, dus de laadvolgorde maakt niet uit.

let releaseKlaar = null

function releaseToets(e) {
  if (e.key !== 'Escape') return
  e.preventDefault()
  e.stopPropagation()
  sluitReleaseModal(null)
}

function sluitReleaseModal(waarde) {
  const modal = document.getElementById('modal-release')
  if (modal) modal.hidden = true
  document.removeEventListener('keydown', releaseToets, true)
  const klaar = releaseKlaar
  releaseKlaar = null
  klaar?.(waarde)
}

// De tekst bij een blokkade of controle uit de taalbestanden.
const releaseBlokTekst = (b) => I18N.t('release.blok.' + b.id, b.vars || {})

function toonReleaseModal(info) {
  return new Promise(resolve => {
    releaseKlaar = resolve
    const modal = document.getElementById('modal-release')
    const body = document.getElementById('release-body')
    const knoppen = document.getElementById('release-knoppen')
    document.getElementById('release-titel').textContent = I18N.t('release.titel') + ' · ' + info.naam

    const soortRij = (soort, vink) => {
      const v = ReleaseTools.verhoogVersie(info.versie, soort) || '?'
      return `<label class="release-soort">
        <input type="radio" name="release-soort" value="${soort}" ${vink ? 'checked' : ''} />
        <span class="release-soort-naam">${esc(I18N.t('release.soort.' + soort))}</span>
        <span class="release-soort-versie">${esc(v)}</span>
      </label>`
    }

    // Wat kan de app zelf met deze release? Alleen Electron-apps met
    // electron-updater krijgen hem in het programma te zien.
    let updatesHtml = ''
    if (info.type === 'electron' && info.gereedheid) {
      const fout = info.gereedheid.filter(c => !c.ok)
      if (info.updatesMogelijk && !fout.length) {
        updatesHtml = `<div class="release-updates ok"><i class="ti ti-circle-check"></i> ${esc(I18N.t('release.updates.ok'))}</div>`
      } else {
        const regels = fout.map(c => `<li>${esc(I18N.t('release.check.' + c.id, c.vars || {}))}</li>`).join('')
        updatesHtml = `<div class="release-updates nok"><div><i class="ti ti-alert-triangle"></i> ${esc(I18N.t(info.updatesMogelijk ? 'release.updates.twijfel' : 'release.updates.nok'))}</div><ul>${regels}</ul></div>`
      }
    } else if (info.type !== 'onbekend') {
      updatesHtml = `<div class="release-updates neutraal"><i class="ti ti-info-circle"></i> ${esc(I18N.t('release.updates.geen', { type: I18N.t('release.type.' + info.type) }))}</div>`
    }

    body.innerHTML = `
      <div class="release-kop">
        <span class="release-type">${esc(I18N.t('release.type.' + info.type))}</span>
        <span class="release-nu">${esc(I18N.t('release.huidig'))}: <b>${esc(info.versie)}</b></span>
      </div>
      ${info.versieBekend ? '' : `<div class="release-hint">${esc(I18N.t('release.eerste'))}</div>`}
      <div class="release-soorten">${soortRij('patch', true)}${soortRij('minor')}${soortRij('major')}</div>
      <div class="release-blokken" id="release-blokken" hidden></div>
      <label class="release-label" for="release-notes">${esc(I18N.t('release.changelog'))}</label>
      <textarea id="release-notes" class="release-notes" rows="7" spellcheck="false"
        placeholder="${esc(I18N.t('release.changelogPlaceholder'))}">${esc(info.concept || '')}</textarea>
      <div class="release-hint">${esc(I18N.t(info.concept ? 'release.changelogHint' : 'release.changelogLeeg', { aantal: info.commitAantal || 0 }))}</div>
      ${info.bouwt ? `<label class="release-bouwen"><input type="checkbox" id="release-bouwen" checked /> ${esc(I18N.t('release.bouwen.' + info.type))}</label>` : ''}
      ${updatesHtml}
      <div class="release-hint release-online">${esc(I18N.t('release.online'))}</div>`

    knoppen.innerHTML = `<button class="btn-ghost" id="release-annuleer">${esc(I18N.t('common.cancel'))}</button>
      <button class="btn-primary" id="release-ok"></button>`
    const okKnop = document.getElementById('release-ok')

    const gekozen = () => (body.querySelector('input[name="release-soort"]:checked') || {}).value || 'patch'
    const ververs = () => {
      const nieuw = ReleaseTools.verhoogVersie(info.versie, gekozen())
      const blok = ReleaseTools.blokkades(info, nieuw)
      const vak = document.getElementById('release-blokken')
      vak.hidden = !blok.length
      vak.innerHTML = blok.map(b => `<div class="release-blok"><i class="ti ti-lock"></i> ${esc(releaseBlokTekst(b))}</div>`).join('')
      okKnop.disabled = blok.length > 0
      okKnop.textContent = I18N.t('release.publiceer', { tag: ReleaseTools.tagNaam(nieuw) || '?' })
    }
    body.querySelectorAll('input[name="release-soort"]').forEach(r => r.onchange = ververs)
    ververs()

    document.getElementById('release-annuleer').onclick = () => sluitReleaseModal(null)
    document.getElementById('release-sluit').onclick = () => sluitReleaseModal(null)
    okKnop.onclick = () => {
      if (okKnop.disabled) return
      const soort = gekozen()
      const bouwBox = document.getElementById('release-bouwen')
      sluitReleaseModal({
        soort,
        nieuw: ReleaseTools.verhoogVersie(info.versie, soort),
        notes: document.getElementById('release-notes').value.trim(),
        bouwen: bouwBox ? bouwBox.checked : false,
      })
    }

    document.addEventListener('keydown', releaseToets, true)
    modal.hidden = false
    requestAnimationFrame(() => document.getElementById('release-notes')?.focus())
  })
}

// De hele weg: controleren, het venster, uitvoeren, en zeggen hoe het afliep.
async function releaseDialoog(project) {
  const dir = actieveLocPad(project)
  if (!dir) { showToast(I18N.t('editor.noLocationSetToast')); return }
  // Eerst het goede GitHub-account actief: gh en git gebruiken dat voor alles
  // wat hierna komt.
  if (!await zorgVoorJuisteGithubPush(project)) return

  showToast(I18N.t('release.controleren'))
  let info = null
  try { info = await window.api.releaseInfo({ dir }) } catch {}
  if (!info || !info.ok) { showToast(I18N.t('release.infoFout')); return }
  if (!info.isRepo) { showToast(I18N.t('release.blok.geenRepo')); return }

  const keuze = await toonReleaseModal(info)
  if (!keuze) return

  const tag = ReleaseTools.tagNaam(keuze.nieuw)
  springNaarOutput()
  setStatus('running', I18N.t('release.status', { tag }))

  let res
  try {
    res = await window.api.releaseRun({
      projectId: project.id, dir, soort: keuze.soort, notes: keuze.notes, bouwen: keuze.bouwen,
    })
  } catch (e) {
    res = { ok: false, reden: 'fout', fout: e && e.message ? e.message : String(e) }
  }
  await ververesGitStaat(project, true)

  if (res && res.ok) {
    setStatus('ended', '✓ ' + I18N.t('release.klaar', { tag: res.tag }))
    showToast(I18N.t(res.updatesMogelijk ? 'release.klaarUpdates' : 'release.klaar', { tag: res.tag }))
    return
  }
  // Mislukte stappen hebben hun melding al in het uitvoerpaneel gezet.
  if (res && res.reden === 'blokkade') {
    (res.blokkades || []).forEach(b => appendLine('err', releaseBlokTekst(b)))
  } else if (res && res.reden === 'bezig') {
    appendLine('err', I18N.t('release.bezig'))
  } else if (res && res.reden === 'fout') {
    appendLine('err', res.fout || I18N.t('release.infoFout'))
  }
  setStatus('ended', '✗ ' + I18N.t('release.mislukt', { stap: (res && res.label) || '' }))
}
