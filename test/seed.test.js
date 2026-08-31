// De aanvulling moet óók lopen bij iemand die de app al gebruikte
const Module=require('module'),path=require('path'),fs=require('fs'),os=require('os')
const REAL=path.join(__dirname,'..')
const {BUILTIN_COMMANDS}=require(path.join(REAL,'cmd-library'))
let ok=true; const t=(l,c)=>{console.log((c?'PASS  ':'FAIL  ')+l);if(!c)ok=false}

const TMP=fs.mkdtempSync(path.join(os.tmpdir(),'seed-'))
// bestaand woordenboek van een gebruiker die de app al had
fs.writeFileSync(path.join(TMP,'history.json'), JSON.stringify({
  version:1,
  entries:[{id:'x1',cmd:'mijn-eigen-flutter-ding --release',label:'',note:'',tags:[],favorite:true,
            source:'run',firstRun:1,lastRun:2,runCount:9,cwds:[{path:'C:\\a',lastRun:2,runCount:9}]},
           {id:'x2',cmd:'dir',label:'',note:'',tags:[],favorite:false,source:'run',
            firstRun:1,lastRun:2,runCount:3,cwds:[]}],
  recent:[{cmd:'dir',cwd:'C:\\a',ts:2,entryId:'x2'}],
}))

const handlers={}
const fake={app:{getPath:()=>TMP,whenReady:()=>({then:()=>{}}),on:()=>{},relaunch:()=>{},quit:()=>{},exit:()=>{},isPackaged:false,getAppPath:()=>REAL},
 BrowserWindow:function(){this.loadFile=()=>{};this.webContents={send:()=>{}};this.isDestroyed=()=>false},
 ipcMain:{on:()=>{},handle:(n,f)=>{handlers[n]=f}},dialog:{showOpenDialog:async()=>({canceled:true})},shell:{openPath:()=>{}}}
const orig=Module._load
Module._load=function(r){if(r==='electron')return fake;return orig.apply(this,arguments)}
require(path.join(REAL,'main.js'))
Module._load=orig
const call=(n,a)=>handlers[n](null,a)

;(async()=>{
  const h=await call('history:load')
  t('bestaande gebruiker krijgt de standaardcommando\'s er alsnog bij',
    h.entries.length > BUILTIN_COMMANDS.length)
  t('eigen commando\'s blijven staan',
    h.entries.some(e=>e.cmd==='mijn-eigen-flutter-ding --release' && e.runCount===9))
  t('favoriet blijft favoriet',
    h.entries.find(e=>e.cmd==='mijn-eigen-flutter-ding --release').favorite===true)
  t('een commando dat al bestond komt er niet dubbel bij',
    h.entries.filter(e=>e.cmd==='dir').length===1)
  t('en behoudt zijn eigen telling', h.entries.find(e=>e.cmd==='dir').runCount===3)
  t('de pijltjes-geschiedenis is onaangeroerd', h.recent.length===1)
  t('het is meteen bewaard, dus dit gebeurt maar één keer',
    JSON.parse(fs.readFileSync(path.join(TMP,'history.json'),'utf8')).seeded===true)

  // opnieuw laden voegt niets meer toe
  const n=h.entries.length
  const h2=await call('history:seedDefaults')
  t('een tweede ronde voegt niets toe', h2.added===0 && h2.history.entries.length===n)

  console.log(ok?'\nALLE TESTS GESLAAGD':'\nER ZIJN TESTS GEFAALD')
  process.exit(ok?0:1)
})()
