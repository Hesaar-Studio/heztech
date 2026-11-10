'use strict';
const fs=require('fs'),path=require('path'),os=require('os'),crypto=require('crypto'),{spawn}=require('child_process');
const root=path.join(os.homedir(),'openclaw'),evidenceRoot=path.join(root,'stack','evidence','heztech-2.0.3');
const runId=`${new Date().toISOString().replace(/[:.]/g,'-')}-${process.pid}`;
const flags=new Set(process.argv.slice(2));
const allowGemini=flags.has('--allow-gemini');
const allowLive=flags.has('--allow-live');
const allowMicrophone=flags.has('--allow-microphone');
if(allowMicrophone&&!allowLive)throw Error('--allow-microphone also requires --allow-live.');
if(flags.has('--voice-transport-only')&&!allowLive)throw Error('--voice-transport-only requires --allow-live.');
if(flags.has('--voice-only')&&(!allowLive||!allowMicrophone))throw Error('--voice-only requires both --allow-live and --allow-microphone.');
for(const flag of ['--allow-gemini','--allow-live','--allow-microphone'])flags.delete(flag);
const out=path.join(evidenceRoot,`acceptance-${runId}`);
const isolatedDataDir=fs.mkdtempSync(path.join(os.tmpdir(),'heztech-acceptance-'));
const isolatedProfile=path.join(isolatedDataDir,'profile');
fs.mkdirSync(isolatedProfile,{recursive:true});
fs.writeFileSync(path.join(isolatedProfile,'Local State'),'{}','utf8');
fs.mkdirSync(out,{recursive:true});
const exe=path.join(root,'stack','releases','HezTech-2.0.3','win-unpacked','HezTech.exe');
const findings=[],exceptions=[];let child,ws,cdp,logs='';
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
function check(name,ok,detail){findings.push({name,ok:!!ok,detail});console.log((ok?'PASS ':'FAIL ')+name+(detail?' '+JSON.stringify(detail):''));}
async function until(fn,ms=25000){const end=Date.now()+ms;while(Date.now()<end){try{const v=await fn();if(v)return v;}catch{}await sleep(200);}throw Error('Condition timed out');}
function attach(s){let id=0;const pending=new Map();s.onmessage=e=>{const m=JSON.parse(e.data);if(m.id){const p=pending.get(m.id);if(p){clearTimeout(p.timer);pending.delete(m.id);m.error?p.reject(Error(m.error.message)):p.resolve(m.result);}}else if(m.method==='Runtime.exceptionThrown')exceptions.push(m.params.exceptionDetails.exception?.description||m.params.exceptionDetails.text);};const send=(method,params={})=>new Promise((resolve,reject)=>{const n=++id;const timer=setTimeout(()=>{pending.delete(n);reject(Error('CDP timeout '+method));},60000);pending.set(n,{resolve,reject,timer});s.send(JSON.stringify({id:n,method,params}));});return {send,eval:async expression=>{const r=await send('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true});if(r.exceptionDetails)throw Error(r.exceptionDetails.exception?.description||r.exceptionDetails.text);return r.result.value;},shot:async name=>{const r=await send('Page.captureScreenshot',{format:'png'});fs.writeFileSync(path.join(out,name+'.png'),Buffer.from(r.data,'base64'));}};}
(async()=>{try{
const env={...process.env};
delete env.ELECTRON_RUN_AS_NODE;
for(const k of Object.keys(env))if(k.startsWith('TEST_')||k.startsWith('HEZTECH_E2E')||k==='HEZTECH_COMPAT')delete env[k];
env.HEZTECH_DATA_DIR=isolatedDataDir;
env.HEZTECH_TEST_ISOLATED='1';
env.USERPROFILE=isolatedDataDir;
env.HOME=isolatedDataDir;
env.APPDATA=path.join(isolatedDataDir,'AppData','Roaming');
env.LOCALAPPDATA=path.join(isolatedDataDir,'AppData','Local');
const onlineCredentialNames=['GEMINI_API_KEY','HEZTECH_GEMINI_API_KEY','GOOGLE_API_KEY','GOOGLE_APPLICATION_CREDENTIALS','OPENROUTER_API_KEY','HEZTECH_OPENROUTER_API_KEY','OPENAI_API_KEY','ANTHROPIC_API_KEY','COHERE_API_KEY','MISTRAL_API_KEY','DEEPSEEK_API_KEY','GROQ_API_KEY','TOGETHER_API_KEY','FIREWORKS_API_KEY'];
const allowedGeminiCredentials=allowGemini?new Set(['GEMINI_API_KEY','HEZTECH_GEMINI_API_KEY']):new Set();
for(const key of onlineCredentialNames)if(!allowedGeminiCredentials.has(key))delete env[key];
check('acceptance workspace and profile are isolated',env.HEZTECH_DATA_DIR===isolatedDataDir&&env.USERPROFILE===isolatedDataDir&&fs.existsSync(path.join(isolatedProfile,'Local State')));
check('only explicitly opted-in Gemini credentials are passed',onlineCredentialNames.every(key=>allowedGeminiCredentials.has(key)||!env[key]));
child=spawn(exe,['--remote-debugging-address=127.0.0.1','--remote-debugging-port=9358'],{env,windowsHide:true,stdio:['ignore','pipe','pipe']});child.stdout.on('data',d=>logs+=d);child.stderr.on('data',d=>logs+=d);
const target=await until(async()=>{const list=await(await fetch('http://127.0.0.1:9358/json/list')).json();return list.find(t=>t.type==='page'&&t.url.startsWith('file:'));},45000);
ws=new WebSocket(target.webSocketDebuggerUrl);await new Promise((resolve,reject)=>{ws.onopen=resolve;ws.onerror=reject;});cdp=attach(ws);await cdp.send('Runtime.enable');await cdp.send('Page.enable');
await until(()=>cdp.eval("!!window.heztech && document.body.textContent.length>100"));
check('packaged current HezTech booted',true,{exe,title:await cdp.eval('document.title')});
check('renderer cannot access Node',await cdp.eval("typeof require==='undefined' && typeof process==='undefined'"));
const cfg=await cdp.eval('window.heztech.getConfig().then(r=>({ok:r.success,keyEmpty:!r.config.geminiApiKey,noDecrypted:!("geminiApiKeyDecrypted" in r.config)}))');check('configuration IPC exposes no API secret',cfg.ok&&cfg.keyEmpty&&cfg.noDecrypted,cfg);
if (!process.argv.includes('--voice-only') && !process.argv.includes('--voice-transport-only') && !process.argv.includes('--knowledge-only')) {
const connect=await cdp.eval("window.heztech.testModelConnection('openclaw-default')");check('actual local inference connection',connect.success && connect.provider==='local-cpu',connect);
if (process.argv.includes('--model-isolation')) {
const unavailable=await cdp.eval("window.heztech.testModelConnection('unconfigured-model-isolation-probe')");
check('unconfigured model fails honestly',!unavailable.success);
const catalog=await cdp.eval('window.heztech.getAvailableModels()');
check('local verification survives another model failure',catalog.models.find(m=>m.id==='openclaw-default')?.verified===true);
check('catalog does not certify untested cloud models',catalog.models.filter(m=>m.provider==='google'||m.provider==='openrouter').every(m=>m.verified===false),{models:catalog.models.map(m=>({id:m.id,verified:m.verified}))});
}
await cdp.eval("location.hash='#/assistant'; true");
await until(()=>cdp.eval("!!document.querySelector('textarea.ht-composer__input')"));
await until(()=>cdp.eval("document.querySelector('.ht-composer__model')?.textContent.includes('OpenClaw') || [...document.querySelectorAll('select option:checked')].some(e=>e.textContent.includes('OpenClaw'))"));
check('OpenClaw selected in the real UI',true);
await cdp.shot('01-before-chat');
const marker='HEZTECH_CONNECTED_'+Date.now();
await cdp.eval("document.querySelector('textarea.ht-composer__input').focus(); true");
await cdp.send('Input.insertText',{text:'تست اتصال برنامه است. هیچ ابزاری استفاده نکن و هیچ فایلی نخوان. فقط دقیقاً این متن را پاسخ بده: '+marker});
await until(()=>cdp.eval("!document.querySelector('form.ht-composer button[type=submit]').disabled"));
await cdp.eval("document.querySelector('form.ht-composer').requestSubmit(); true");
let response='';await until(async()=>{const d=await cdp.eval("({text:[...document.querySelectorAll('.ht-message--assistant .ht-message__body')].at(-1)?.textContent||'',error:document.querySelector('[role=alert]')?.textContent||'',running:!!document.querySelector('.ht-message--streaming')})");response=d.text;if(response.includes(marker)||d.error){if(d.error)check('visible chat error',false,d.error.trim().slice(0,300));return true;}return false;},140000);
check('real UI chat returns model response',response.includes(marker),{matched:response.includes(marker),characters:response.length});

const models=await cdp.eval('window.heztech.getAvailableModels()');check('model readiness follows observed response',models.models.find(m=>m.id==='openclaw-default')?.verified===true);
await cdp.shot('02-real-chat');
await cdp.eval("location.hash='#/knowledge'; true");
await until(()=>cdp.eval("document.querySelector('.ht-knowledge__canvas')?.dataset.graphState==='ready' && !!document.querySelector('.ht-knowledge canvas')"));
await cdp.shot('03-knowledge');
if (process.argv.includes('--media-before') || process.argv.includes('--media-after')) {
await cdp.eval("location.hash='#/media-studio'; true");
await until(()=>cdp.eval("!!document.querySelector('.ht-media-studio')"));
const capcut=await cdp.eval('window.heztech.capcutGetStatus()');
if (process.argv.includes('--media-after')) check('packaged CapCut contract connected at correct path',capcut.bridgeConnected && capcut.bridgePath===path.resolve(process.env.HEZTECH_CAPCUT_BRIDGE_DIR || path.join(root,'.audit','capcut-bridge-kit')), {bridgeConnected:capcut.bridgeConnected,bridgePath:capcut.bridgePath,status:capcut.status});
if (process.argv.includes('--media-after')) await until(()=>cdp.eval("document.querySelector('.ht-media-studio')?.textContent.includes('پل پاسخ می‌دهد') || document.querySelector('.ht-media-studio')?.textContent.includes('Bridge responding')"),45000);
await cdp.shot(process.argv.includes('--media-after')?'06-capcut-after':'05-capcut-before');
}
}
if (process.argv.includes('--knowledge-only')) {
await cdp.send('Network.enable');
await cdp.send('Network.emulateNetworkConditions',{offline:true,latency:0,downloadThroughput:0,uploadThroughput:0});
await cdp.eval("location.hash='#/knowledge'; true");
await until(()=>cdp.eval("document.querySelector('.ht-knowledge__canvas')?.dataset.graphState==='ready' && !!document.querySelector('.ht-knowledge canvas')"));
const real=await cdp.eval("Promise.all([window.heztech.searchMemory('','all'),window.heztech.listConversations()]).then(([m,s])=>{const ids=new Set();for(const [kind,list] of [['memory',m.knowledge||[]],['session',s.conversations||[]]])for(const r of list){ids.add(kind+':'+r.id);for(const t of r.tags||[])if(t.trim())ids.add('tag:'+t);}return {success:m.success&&s.success,count:ids.size};})");
await until(async()=>(await cdp.eval("document.querySelectorAll('.ht-knowledge__node-list button').length"))===real.count);
check('offline packaged WebGL graph contains actual knowledge records',real.success&&real.count>0,{nodes:real.count});
await cdp.shot('07-knowledge-3d-after');
await cdp.eval("document.querySelector('.ht-knowledge__node-list').open=true;document.querySelector('.ht-knowledge__node-list button').focus();true");
await cdp.send('Input.dispatchKeyEvent',{type:'keyDown',key:'Enter',code:'Enter',text:'\r',unmodifiedText:'\r',windowsVirtualKeyCode:13,nativeVirtualKeyCode:13});
await cdp.send('Input.dispatchKeyEvent',{type:'keyUp',key:'Enter',code:'Enter',windowsVirtualKeyCode:13});
await until(()=>cdp.eval("!!document.querySelector('.ht-knowledge aside h2') && document.querySelector('.ht-knowledge aside h2').textContent===document.querySelector('.ht-knowledge__node-list button')?.textContent"));
check('keyboard selection reveals real node details',true);
await cdp.eval("document.querySelector('.ht-knowledge__toolbar input').focus();true");
await cdp.send('Input.insertText',{text:'NO_MATCH_GRAPH_'+Date.now()});
await until(()=>cdp.eval("document.querySelectorAll('.ht-knowledge__node-list button').length===0"));
check('search filters actual nodes without adding synthetic data',true);
await cdp.eval("document.querySelector('.ht-knowledge__toolbar input').select();true");
await cdp.send('Input.dispatchKeyEvent',{type:'keyDown',key:'Backspace',code:'Backspace',windowsVirtualKeyCode:8});
await cdp.send('Input.dispatchKeyEvent',{type:'keyUp',key:'Backspace',code:'Backspace',windowsVirtualKeyCode:8});
await until(async()=>(await cdp.eval("document.querySelectorAll('.ht-knowledge__node-list button').length"))===real.count);
await cdp.eval("location.hash='#/';true");
await until(()=>cdp.eval("!document.querySelector('.ht-knowledge canvas')"));
await cdp.eval("location.hash='#/knowledge';true");
await until(()=>cdp.eval("document.querySelector('.ht-knowledge__canvas')?.dataset.graphState==='ready' && !!document.querySelector('.ht-knowledge canvas')"));
check('graph remounts offline after route cleanup',true);
} else if (flags.has('--chat-only') || (!allowLive && !allowMicrophone)) {
// Default acceptance is local-only and does not request microphone access.
} else if (flags.has('--voice-transport-only') || (allowLive && !allowMicrophone)) {
await cdp.eval("window.__transportBytes=0; window.__voiceUnsub=window.heztech.onLiveAudioChunk(c=>{window.__transportBytes+=atob(c.data||'').length;}); true");
const live=await cdp.eval("window.heztech.liveStart({listenOnly:true,systemPrompt:'Reply briefly in Persian. Do not use tools.'})");
check('packaged Live setup acknowledged without microphone',live.success,live);
if (!live.success) throw Error(live.error);
await cdp.eval("window.heztech.liveSendText('کوتاه بگو سلام، اتصال برقرار است.')");
await until(()=>cdp.eval('window.__transportBytes>0'),45000);
check('packaged Live received real provider audio',true,{bytes:await cdp.eval('window.__transportBytes')});
await cdp.eval('window.heztech.liveStop()');
check('packaged Live teardown',!(await cdp.eval('window.heztech.liveStatus()')).isConnected);
const restarted=await cdp.eval("window.heztech.liveStart({listenOnly:true,systemPrompt:'Reply briefly. Do not use tools.'})");
check('packaged Live reconnect after teardown',restarted.success,restarted);
await cdp.eval('window.heztech.liveStop()');
await cdp.eval('window.__voiceUnsub(); true');
} else if (allowLive && allowMicrophone) {
await cdp.eval(`
window.__voiceProof={bytes:0,playStarts:0,mic:false,rate:0,playState:''};
window.__voiceUnsub=window.heztech.onLiveAudioChunk(c=>{window.__voiceProof.bytes+=atob(c.data||'').length;});
const originalCapture=navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
navigator.mediaDevices.getUserMedia=async constraints=>{const stream=await originalCapture(constraints);window.__voiceProof.mic=stream.getAudioTracks().some(t=>t.readyState==='live');window.__voiceProof.rate=stream.getAudioTracks()[0]?.getSettings().sampleRate||0;return stream;};
const originalStart=AudioBufferSourceNode.prototype.start;
AudioBufferSourceNode.prototype.start=function(...args){window.__voiceProof.playStarts++;window.__voiceProof.playState=this.context.state;return originalStart.apply(this,args);};
location.hash='#/assistant'; true`);
await until(()=>cdp.eval("!!document.querySelector('.ht-composer__icon-btn--voice')"));
await cdp.eval("document.querySelector('.ht-composer__icon-btn--voice').click(); true");
await until(async()=>{const status=await cdp.eval('window.heztech.liveStatus()');return status.isConnected;},55000);
check('provider Live setup acknowledged through packaged IPC',true);
await until(()=>cdp.eval('window.__voiceProof.mic'),15000);
check('real Voice UI acquired microphone',await cdp.eval('window.__voiceProof.mic'));
await cdp.eval("document.querySelector('.ht-voice-orb-text-input').focus(); true");
await cdp.send('Input.insertText',{text:'هیچ ابزاری استفاده نکن. فقط کوتاه بگو: سلام، اتصال صوت برقرار است.'});
await cdp.eval("document.querySelector('form.ht-voice-orb-input-row').requestSubmit(); true");
await until(()=>cdp.eval('window.__voiceProof.bytes>0 && window.__voiceProof.playStarts>0'),45000);
const voiceProof=await cdp.eval('window.__voiceProof');
check('Live returned PCM and renderer started playback',voiceProof.bytes>0 && voiceProof.playStarts>0 && voiceProof.playState==='running',voiceProof);
await cdp.shot('04-live-voice');
await cdp.eval("document.querySelector('.ht-voice-orb-close-btn').click(); true");
await until(async()=>!(await cdp.eval('window.heztech.liveStatus()')).isConnected);
check('Live closes cleanly',true);
await cdp.eval('window.__voiceUnsub(); true');
}
check('no renderer exceptions',exceptions.length===0,exceptions);
}catch(e){check('acceptance completed',false,e.message);}finally{
if(cdp){try{await cdp.eval('window.close(); true');}catch{}}if(ws)ws.close();if(child){await sleep(800);if(child.exitCode===null)child.kill();}
fs.writeFileSync(path.join(out,'main.log'),logs);const report={atUtc:new Date().toISOString(),exe,isolatedDataDir,out,appAsarSha256:fs.existsSync(path.join(path.dirname(exe),'resources/app.asar'))?crypto.createHash('sha256').update(fs.readFileSync(path.join(path.dirname(exe),'resources/app.asar'))).digest('hex'):null,launchFlags:[...flags,'test-isolated',...(allowGemini?['--allow-gemini']:[]),...(allowLive?['--allow-live']:[]),...(allowMicrophone?['--allow-microphone']:[])],findings,exceptions};fs.writeFileSync(path.join(out,'acceptance.json'),JSON.stringify(report,null,2));process.exitCode=findings.some(f=>!f.ok)?1:0;
}})();
