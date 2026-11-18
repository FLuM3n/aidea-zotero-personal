import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import vm from 'node:vm';
const source=await fs.readFile(new URL('../plugin/content/scripts/aidea.js',import.meta.url),'utf8');
function section(from,to){const start=source.indexOf(from),end=source.indexOf(to,start+from.length);assert(start>=0&&end>start,from);return source.slice(start,end);}
let now=100000;
const runtime=vm.createContext({Date:{now:()=>now},getPanelLang:()=> 'zh-CN',formatDuration:s=>String(Math.round(s)),getStageSummaryLabel:(stage,message)=>message||stage});
vm.runInContext(section('  function aideaRecordEngineProgress(','  function advanceDisplayedProgress('),runtime);
const session={targetProgressPct:10,displayProgressPct:10,translationStartTime:1000};
assert.equal(runtime.estimateRemainingSeconds(session,100),null,'A static placeholder percent cannot produce an ETA');
assert(runtime.aideaTranslationProgressText(session).includes('估算中'));
for(const [offset,pct,unit] of [[0,10,0],[10000,11,1],[20000,12,2]]){
 now=100000+offset;
 runtime.aideaRecordEngineProgress(session,{progressSource:'engine',stageName:'Translate Paragraphs',stage:'translating',overallProgress:pct,unitCurrent:unit,unitTotal:40,engineUpdatedAt:now});
}
assert.equal(runtime.aideaTranslationRemaining(session,now),880);
assert(runtime.aideaTranslationProgressText(session,now).includes('当前步骤 2/40'));
const previous=runtime.aideaTranslationRemaining(session,now);
now+=1000;
runtime.aideaRecordEngineProgress(session,{...session.engineProgress,heartbeatOnly:true,heartbeatAt:now});
assert.equal(session.engineProgressSamples.length,3,'Heartbeats do not invent throughput samples');
assert.equal(runtime.aideaTranslationRemaining(session,now),previous,'ETA does not grow merely because wall time passes');
now+=31000;
assert.equal(runtime.aideaTranslationRemaining(session,now),null);
assert(runtime.aideaTranslationProgressText(session,now).includes('等待引擎或模型响应'));
session.targetProgressPct=100;
assert.equal(runtime.aideaTranslationRemaining(session,now),0);

// A present .exe must not count as ready when runtime imports fail.
for(const manager of ['conda','uv']){
 let healthy=false;
 const env=vm.createContext({
  findCondaBinary:async()=>manager==='conda'?'conda':null,findUvBinary:async()=>manager==='uv'?'uv':null,
  getCondaEnvDirCandidates:()=>['env'],getUvEnvDirCandidates:()=>['env'],
  getCondaPythonBin:()=> 'python',getPythonBin:()=> 'python',getCondaPdf2zhBin:()=> 'pdf2zh',getPdf2zhBin:()=> 'pdf2zh',
  IOUtils:{exists:async()=>true},isPdf2zhBinUsable:async()=>true,
  aideaVerifyTranslationRuntime:async()=>({ok:healthy,detail:'BitStream unavailable'}),
 });
 vm.runInContext(section('  async function checkEnvironment()','  async function installEnvironment('),env);
 assert.notEqual((await env.checkEnvironment()).status,'ready');
 healthy=true;
 assert.equal((await env.checkEnvironment()).status,'ready');
}

// Exercise both installer branches, including already-present and fresh packages.
for(const manager of ['conda','uv'])for(const fresh of [false,true]){
 const calls=[];
 let first=true;
 const env=vm.createContext({
  IS_WIN:true,PathUtils:{join:(...p)=>p.join('/')},
  findCondaBinary:async()=>manager==='conda'?'conda':null,
  installMiniconda:async()=>{throw Error('use uv')},findUvBinary:async()=> 'uv',acceptCondaToS:async()=>{},
  resolveCondaInstallDir:async()=> 'env',getEnvRoot:()=> 'env',getCondaPythonBin:()=> 'python',getPythonBin:()=> 'python',
  getCondaPdf2zhBin:()=> 'pdf2zh',getPdf2zhBin:()=> 'pdf2zh',
  IOUtils:{exists:async()=>true,remove:async()=>{}},
  isPdf2zhBinUsable:async()=>true,cleanCorruptedDistributions:async()=>{},
  verifyPdf2zhInstall:async()=>{const missing=fresh&&first;first=false;return{ok:!missing}},
  runCmd:async(exe,args)=>{calls.push(['install',...args]);return ''},
  aideaVerifyTranslationRuntime:async(python,force)=>{calls.push(['probe',force]);return{ok:true}},
  checkEnvironment:async()=>{calls.push(['final']);return{status:'ready'}},
 });
 vm.runInContext(section('  async function installEnvironment(','  function getCondaEnvDir('),env);
 await env.installEnvironment(()=>{});
 assert(calls.some(args=>args.includes('bitstring==4.3.1')));
 if(fresh)assert(calls.some(args=>args.includes('--force-reinstall')&&args.includes('bitstring==4.3.1')));
 assert(calls.findIndex(args=>args[0]==='probe')<calls.findIndex(args=>args[0]==='final'));
}
console.log('Passed honest/stale ETA, heartbeat sampling, stage counters, broken-runtime detection, and fresh/existing conda+uv installation pinning.');
