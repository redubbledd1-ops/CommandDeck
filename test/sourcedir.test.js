const Module=require('module'),path=require('path'),fs=require('fs'),os=require('os')
const REAL=path.join(__dirname,'..')
let ok=true; const check=(l,c)=>{console.log((c?'PASS  ':'FAIL  ')+l);if(!c)ok=false}

// nagebootste mapstructuren
const ROOT=fs.mkdtempSync(path.join(os.tmpdir(),'src-'))
const SRC=path.join(ROOT,'Mijn Projecten','commanddeck')   // met spatie in het pad
fs.mkdirSync(path.join(SRC,'dist','win-unpacked'),{recursive:true})
fs.writeFileSync(path.join(SRC,'package.json'),JSON.stringify({name:'commanddeck'}))
fs.writeFileSync(path.join(SRC,'main.js'),'')
const FAKE=path.join(ROOT,'iets-anders')
fs.mkdirSync(FAKE,{recursive:true}); fs.writeFileSync(path.join(FAKE,'package.json'),JSON.stringify({name:'iets-anders'}))
fs.writeFileSync(path.join(FAKE,'main.js'),'')

function load({packaged,execPath,portableDir,cwd,userData,settings}){
  for(const k of Object.keys(require.cache)) delete require.cache[k]
  const handlers={}
  const UD=userData||fs.mkdtempSync(path.join(os.tmpdir(),'ud-'))
  if(settings) fs.writeFileSync(path.join(UD,'settings.json'),JSON.stringify(settings))
  const fake={app:{getPath:()=>UD,whenReady:()=>({then:()=>{}}),on:()=>{},relaunch:()=>{},quit:()=>{},exit:()=>{},
      isPackaged:packaged,getAppPath:()=>packaged?path.join(execPath,'..','resources','app.asar'):SRC},
    BrowserWindow:function(){this.loadFile=()=>{};this.webContents={send:()=>{}};this.isDestroyed=()=>false},
    ipcMain:{on:()=>{},handle:(n,f)=>{handlers[n]=f}},
    dialog:{showOpenDialog:async()=>({canceled:true})},shell:{openPath:()=>{}}}
  const orig=Module._load
  Module._load=function(r){if(r==='electron')return fake;return orig.apply(this,arguments)}
  const oldExec=process.execPath, oldCwd=process.cwd
  Object.defineProperty(process,'execPath',{value:execPath,configurable:true})
  process.cwd=()=>cwd||ROOT
  if(portableDir) process.env.PORTABLE_EXECUTABLE_DIR=portableDir; else delete process.env.PORTABLE_EXECUTABLE_DIR
  require(path.join(REAL,'main.js'))
  // find() moet draaien terwijl execPath/cwd nog nagebootst zijn
  const found = handlers['app:findSourceDir']()
  Module._load=orig
  Object.defineProperty(process,'execPath',{value:oldExec,configurable:true})
  process.cwd=oldCwd
  return {find:()=>found, UD}
}

// 1. portable .exe draait vanuit %TEMP%, maar PORTABLE_EXECUTABLE_DIR wijst naar <src>\dist
let r=load({packaged:true,execPath:path.join(os.tmpdir(),'CommandDeck_xyz','CommandDeck.exe'),
            portableDir:path.join(SRC,'dist')})
check('portable exe vindt de bronmap via PORTABLE_EXECUTABLE_DIR', r.find()===SRC)

// 2. dev-modus: electron draait vanuit node_modules
r=load({packaged:false,execPath:path.join(SRC,'node_modules','electron','dist','electron.exe')})
check('dev-modus vindt de bronmap via het app-pad', r.find()===SRC)

// 3. uitgepakte build: <src>\dist\win-unpacked\CommandDeck.exe
r=load({packaged:true,execPath:path.join(SRC,'dist','win-unpacked','CommandDeck.exe')})
check('uitgepakte build vindt de bronmap via execPath', r.find()===SRC)

// 4. niets bruikbaars -> null, geen verkeerde map
r=load({packaged:true,execPath:path.join(os.tmpdir(),'los','app.exe'),cwd:FAKE})
check('geen bronmap gevonden levert null (niet een willekeurige map)', r.find()===null)

// 5. eerder onthouden map wordt gebruikt
r=load({packaged:true,execPath:path.join(os.tmpdir(),'los','app.exe'),cwd:FAKE,settings:{sourceDir:SRC}})
check('onthouden bronmap uit settings wordt gebruikt', r.find()===SRC)

// 6. onthouden map die niet meer klopt wordt genegeerd
r=load({packaged:true,execPath:path.join(os.tmpdir(),'los','app.exe'),cwd:FAKE,settings:{sourceDir:FAKE}})
check('map met verkeerde package.json wordt afgewezen', r.find()===null)

// 7. verplaatste map: alles onder een ander pad
const MOVED=path.join(ROOT,'D_schijf','tools','commanddeck')
fs.mkdirSync(path.join(MOVED,'dist'),{recursive:true})
fs.writeFileSync(path.join(MOVED,'package.json'),JSON.stringify({name:'commanddeck'}))
fs.writeFileSync(path.join(MOVED,'main.js'),'')
r=load({packaged:true,execPath:path.join(os.tmpdir(),'x','a.exe'),portableDir:path.join(MOVED,'dist')})
check('verplaatste installatie werkt ook', r.find()===MOVED)

console.log(ok?'\nALLE TESTS GESLAAGD':'\nER ZIJN TESTS GEFAALD')
process.exit(ok?0:1)
