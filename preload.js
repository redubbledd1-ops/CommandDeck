const { contextBridge, ipcRenderer, webUtils } = require('electron')

contextBridge.exposeInMainWorld('api', {
  minimize:      ()      => ipcRenderer.send('win-minimize'),
  maximize:      ()      => ipcRenderer.send('win-maximize'),
  close:         ()      => ipcRenderer.send('win-close'),

  loadProjects:  ()      => ipcRenderer.invoke('projects:load'),
  saveProjects:  (p)     => ipcRenderer.invoke('projects:save', p),

  loadSettings:  ()      => ipcRenderer.invoke('settings:load'),
  saveSettings:  (s)     => ipcRenderer.invoke('settings:save', s),

  listLanguages: ()      => ipcRenderer.invoke('i18n:languages'),
  detectLanguage:()      => ipcRenderer.invoke('i18n:detect'),
  loadLocale:    (lang)  => ipcRenderer.invoke('i18n:load', lang),

  loadHistory:   ()      => ipcRenderer.invoke('history:load'),
  recordHistory: (o)     => ipcRenderer.invoke('history:record', o),
  addHistory:    (o)     => ipcRenderer.invoke('history:add', o),
  updateHistory: (o)     => ipcRenderer.invoke('history:update', o),
  deleteHistory: (o)     => ipcRenderer.invoke('history:delete', o),
  clearHistory:  (o)     => ipcRenderer.invoke('history:clear', o),
  verwijderThema:(o)     => ipcRenderer.invoke('history:verwijderThema', o),
  seedDefaults:  ()      => ipcRenderer.invoke('history:seedDefaults'),

  pickFolder:    ()      => ipcRenderer.invoke('dialog:pickFolder'),
  pickExe:       ()      => ipcRenderer.invoke('dialog:pickExe'),
  listPrograms:  ()      => ipcRenderer.invoke('app:listPrograms'),
  scanEditors:   ()      => ipcRenderer.invoke('app:scanEditors'),
  resolveDir:    (o)     => ipcRenderer.invoke('fs:resolveDir', o),
  listDir:       (p)     => ipcRenderer.invoke('fs:listDir', p),
  listDrives:    ()      => ipcRenderer.invoke('fs:listDrives'),
  zoek:          (o)     => ipcRenderer.invoke('fs:zoek', o),
  stopZoeken:    ()      => ipcRenderer.invoke('fs:stopZoeken'),
  onZoekTreffers: (cb) => {
    const h = (_, d) => cb(d)
    ipcRenderer.on('fs:zoekTreffers', h)
    return () => ipcRenderer.removeListener('fs:zoekTreffers', h)
  },
  projectSoort:  (p)     => ipcRenderer.invoke('fs:projectSoort', p),

  gitInfo:       (p)     => ipcRenderer.invoke('git:info', p),
  gitGh:         ()      => ipcRenderer.invoke('git:gh'),
  gitGhVergeet:  ()      => ipcRenderer.invoke('git:ghVergeet'),
  gitWinget:     ()      => ipcRenderer.invoke('git:winget'),
  gitGhStatus:   ()      => ipcRenderer.invoke('git:ghStatus'),
  gitRemoteCheck:  (p)   => ipcRenderer.invoke('git:remoteCheck', p),
  gitRemoteVergeet:(p)   => ipcRenderer.invoke('git:remoteVergeet', p),
  gitGhLogin:    ()      => ipcRenderer.invoke('git:ghLogin'),
  opGhCode:      (f)     => ipcRenderer.on('git:ghCode', (_, code) => f(code)),
  gitGhAccounts: ()      => ipcRenderer.invoke('git:ghAccounts'),
  gitGhIdentiteit: ()    => ipcRenderer.invoke('git:ghIdentiteit'),
  gitAccountActiveren: (p) => ipcRenderer.invoke('git:accountActiveren', p),
  gitFetch:      (p)     => ipcRenderer.invoke('git:fetch', p),
  gitProjecten:  (l)     => ipcRenderer.send('git:projecten', l),
  gitPaden:      (o)     => ipcRenderer.send('git:paden', o),
  gitStashMelding:()     => ipcRenderer.invoke('git:stashMelding'),
  accountsList:  ()      => ipcRenderer.invoke('accounts:list'),
  accountAdd:    (o)     => ipcRenderer.invoke('accounts:add', o),
  accountRename: (o)     => ipcRenderer.invoke('accounts:rename', o),
  accountSetGit: (o)     => ipcRenderer.invoke('accounts:setGit', o),
  accountSwitch: (o)     => ipcRenderer.invoke('accounts:switch', o),
  accountSetPin: (o)     => ipcRenderer.invoke('accounts:setPin', o),
  accountCheck:  (o)     => ipcRenderer.invoke('accounts:check', o),
  accountRemove: (id)    => ipcRenderer.invoke('accounts:remove', id),

  gitBranches:   (p)     => ipcRenderer.invoke('git:branches', p),
  gitStashLijst: (p)     => ipcRenderer.invoke('git:stashLijst', p),
  gitStashInhoud:(p, r)  => ipcRenderer.invoke('git:stashInhoud', p, r),
  gitAccountInfo:(p)     => ipcRenderer.invoke('git:accountInfo', p),
  opAfsluitControle: (f) => ipcRenderer.on('git:controleerVoorAfsluiten', () => f()),
  gitAfsluitenMag:  ()   => ipcRenderer.send('git:afsluitenMag'),
  gitAfsluitenAf:   ()   => ipcRenderer.send('git:afsluitenAfgebroken'),
  listArchive:   (p)     => ipcRenderer.invoke('arch:list', p),
  openInArchive: (p)     => ipcRenderer.invoke('arch:open', p),
  archiveTool:   ()      => ipcRenderer.invoke('arch:tool'),
  openFolder:    (p)     => ipcRenderer.invoke('shell:openFolder', p),
  openUrl:       (u)     => ipcRenderer.invoke('shell:openUrl', u),
  openWith:      (p)     => ipcRenderer.invoke('shell:openWith', p),
  revealItem:    (p)     => ipcRenderer.invoke('shell:revealItem', p),
  nieuwItem:     (o)     => ipcRenderer.invoke('fs:nieuw', o),
  maakZip:       (o)     => ipcRenderer.invoke('arch:zip', o),
  bestandInfo:   (p)     => ipcRenderer.invoke('fs:info', p),
  conflicten:    (o)     => ipcRenderer.invoke('fs:conflicten', o),
  kopieerItems:  (o)     => ipcRenderer.invoke('fs:kopieer', o),
  verwijderItems:(o)     => ipcRenderer.invoke('fs:verwijder', o),
  hernoemItem:   (o)     => ipcRenderer.invoke('fs:hernoem', o),
  annuleerKopie: ()      => ipcRenderer.invoke('fs:annuleer'),
  mapGrootte:    (o)     => ipcRenderer.invoke('fs:mapGrootte', o),
  stopGroottes:  ()      => ipcRenderer.invoke('fs:stopGroottes'),
  zetKlembord:   (o)     => ipcRenderer.invoke('clip:zetBestanden', o),
  leesKlembord:  ()      => ipcRenderer.invoke('clip:leesBestanden'),
  onVoortgang: (cb) => {
    const h = (_, d) => cb(d)
    ipcRenderer.on('fs:voortgang', h)
    return () => ipcRenderer.removeListener('fs:voortgang', h)
  },
  openCmd:       (o)     => ipcRenderer.invoke('shell:openCmd', o),
  openPs:        (o)     => ipcRenderer.invoke('shell:openPs', o),

  // Echte terminal in het venster zelf
  ptyBeschikbaar: ()     => ipcRenderer.invoke('pty:beschikbaar'),
  ptyStart:      (o)     => ipcRenderer.invoke('pty:start', o),
  ptyWrite:      (o)     => ipcRenderer.invoke('pty:write', o),
  ptyResize:     (o)     => ipcRenderer.invoke('pty:resize', o),
  ptyStop:       (o)     => ipcRenderer.invoke('pty:stop', o),
  onPtyData: (cb) => {
    const h = (_, d) => cb(d)
    ipcRenderer.on('pty:data', h)
    return () => ipcRenderer.removeListener('pty:data', h)
  },
  onPtyExit: (cb) => {
    const h = (_, d) => cb(d)
    ipcRenderer.on('pty:exit', h)
    return () => ipcRenderer.removeListener('pty:exit', h)
  },

  listBats:      (cwd)   => ipcRenderer.invoke('bat:list', cwd),
  readBat:       (p)     => ipcRenderer.invoke('bat:read', p),
  saveBat:       (o)     => ipcRenderer.invoke('bat:save', o),
  batExists:     (p)     => ipcRenderer.invoke('bat:exists', p),
  deleteBat:     (p)     => ipcRenderer.invoke('bat:delete', p),
  batStat:       (p)     => ipcRenderer.invoke('bat:stat', p),
  pickBat:       (cwd)   => ipcRenderer.invoke('dialog:pickBat', cwd),
  pickRunFiles:  (cwd)   => ipcRenderer.invoke('dialog:pickRunFiles', cwd),
  testBat:       (o)     => ipcRenderer.invoke('bat:test', o),
  makeExe:       (o)     => ipcRenderer.invoke('bat:makeExe', o),
  saveAs:        (o)     => ipcRenderer.invoke('dialog:saveAs', o),
  pickIcon:      (cwd)   => ipcRenderer.invoke('dialog:pickIcon', cwd),

  // Sinds Electron 32 bestaat File.path niet meer; dit is de vervanger waarmee
  // een gesleept bestand alsnog zijn pad op schijf prijsgeeft.
  getFilePath:   (file)  => { try { return webUtils.getPathForFile(file) } catch { return '' } },

  // AI-gesprek in het uitvoervenster
  aiProviders:   ()      => ipcRenderer.invoke('ai:providers'),
  aiZetSleutel:  (o)     => ipcRenderer.invoke('ai:zetSleutel', o),
  aiStuur:       (o)     => ipcRenderer.invoke('ai:stuur', o),
  aiStop:        (o)     => ipcRenderer.invoke('ai:stop', o),
  aiTest:        (o)     => ipcRenderer.invoke('ai:test', o),
  aiModellen:    (o)     => ipcRenderer.invoke('ai:modellen', o),
  onAiStuk: (cb) => {
    const h = (_, d) => cb(d)
    ipcRenderer.on('ai:stuk', h)
    return () => ipcRenderer.removeListener('ai:stuk', h)
  },

  listFlutterDevices: (o)   => ipcRenderer.invoke('cmd:listFlutterDevices', o),
  runCmd:           (o)     => ipcRenderer.invoke('cmd:run', o),
  runCmdWithAutofix:(o)     => ipcRenderer.invoke('cmd:runWithAutofix', o),
  openEditor:    (o)     => ipcRenderer.invoke('cmd:openEditor', o),
  openClaudeDesktop: (o) => ipcRenderer.invoke('cmd:openClaudeDesktop', o),
  killCmd:       ()      => ipcRenderer.invoke('cmd:kill'),
  relaunch:      ()      => ipcRenderer.invoke('app:relaunch'),
  updateAndRestart: (o)  => ipcRenderer.invoke('app:updateAndRestart', o),
  findSourceDir: ()      => ipcRenderer.invoke('app:findSourceDir'),
  runtimeInfo:   ()      => ipcRenderer.invoke('app:runtimeInfo'),

  onOutput: (cb) => {
    const h = (_, d) => cb(d)
    ipcRenderer.on('cmd:output', h)
    return () => ipcRenderer.removeListener('cmd:output', h)
  },
})
