const Module=require('module'),path=require('path'),fs=require('fs'),os=require('os')
const TMP=process.env.FLTMP||fs.mkdtempSync(path.join(os.tmpdir(),'fl2-'))
const handlers={}
const fakeElectron={app:{getPath:()=>TMP,whenReady:()=>({then:()=>{}}),on:()=>{},relaunch:()=>{},quit:()=>{},isPackaged:false,getAppPath:()=>__dirname},
 BrowserWindow:function(){this.loadFile=()=>{};this.webContents={send:()=>{}}},
 ipcMain:{on:()=>{},handle:(n,f)=>{handlers[n]=f}},dialog:{showOpenDialog:async()=>({canceled:true})},shell:{openPath:()=>{}}}
// Deze tests gaan over de opslag zelf, niet over de meegeleverde commando's.
// Een bestand met seeded:true zorgt dat de startvoorraad niet wordt aangevuld.
// Alleen als er nog niets staat: de 'read'-ronde moet lezen wat de 'write'-ronde
// heeft achtergelaten, niet een vers leeg bestand.
if (!fs.existsSync(path.join(TMP, 'history.json'))) {
  fs.writeFileSync(path.join(TMP, 'history.json'), JSON.stringify({ version: 1, seeded: true, entries: [], recent: [] }))
}

const orig=Module._load
Module._load=function(r){if(r==='electron')return fakeElectron;return orig.apply(this,arguments)}
require(path.join(__dirname,'..','main.js'))
const call=(n,a)=>handlers[n](null,a)
;(async()=>{
let ok=true; const check=(l,c)=>{console.log((c?'PASS  ':'FAIL  ')+l);if(!c)ok=false}
const mode=process.argv[2]
if(mode==='write'){
  for(let i=0;i<12;i++) await call('history:record',{cmd:'cmd-'+i,cwd:'C:\\w'})
  check('12 weggeschreven',(await call('history:load')).recent.length===12)
  console.log('TMP='+TMP)
} else if(mode==='read'){
  const h=await call('history:load')
  check('geschiedenis overleeft herstart',h.recent.length===12&&h.entries.length===12)
  check('volgorde bewaard (nieuwste eerst)',h.recent[0].cmd==='cmd-11')
} else if(mode==='limit'){
  // maxRecent op 5 zetten
  const s=await call('settings:load'); s.history={...s.history,maxRecent:5,maxEntries:6}
  await call('settings:save',s)
  for(let i=0;i<20;i++) await call('history:record',{cmd:'x-'+i,cwd:'C:\\w'})
  const h=await call('history:load')
  check('maxRecent gerespecteerd',h.recent.length===5)
  check('maxEntries gerespecteerd',h.entries.length<=6)
} else if(mode==='nopersist'){
  const s=await call('settings:load'); s.history={...s.history,persist:false}
  await call('settings:save',s)
  await call('history:record',{cmd:'geheim',cwd:'C:\\w'})
  const inMem=(await call('history:load')).entries.some(e=>e.cmd==='geheim')
  const onDisk=fs.existsSync(path.join(TMP,'history.json'))&&fs.readFileSync(path.join(TMP,'history.json'),'utf8').includes('geheim')
  check('wel in geheugen tijdens sessie',inMem)
  check('niet naar schijf bij persist:false',!onDisk)
}
process.exit(ok?0:1)
})()
