'use strict';
const fs=require('fs'),path=require('path'),crypto=require('crypto'),{spawn}=require('child_process');
const root='C:/Users/Green/openclaw',out=path.join(root,'stack/evidence/heztech-2.0.2');fs.mkdirSync(out,{recursive:true});
const exe=path.join(root,'stack/releases/HezTech-2.0.2/win-unpacked/HezTech.exe');
const findings=[],exceptions=[];let child,ws,cdp,logs='';
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
function check(name,ok,detail){findings.push({name,ok:!!ok,detail});console.log((ok?'PASS ':'FAIL ')+name+(detail?' '+JSON.stringify(detail):''));}
async function until(fn,ms=25000){const end=Date.now()+ms;while(Date.now()<end){try{const v=await fn();if(v)return v;}catch{}await sleep(200);}throw Error('Condition timed out');}
function attach(s){let id=0;const pending=new Map();s.onmessage=e=>{const m=JSON.parse(e.data);if(m.id){const p=pending.get(m.id);if(p){clearTimeout(p.timer);pending.delete(m.id);m.error?p.reject(Error(m.error.message)):p.resolve(m.result);}}else if(m.method==='Runtime.exceptionThrown')exceptions.push(m.params.exceptionDetails.exception?.description||m.params.exceptionDetails.text);};const send=(method,params={})=>new Promise((resolve,reject)=>{const n=++id;const timer=setTimeout(()=>{pending.delete(n);reject(Error('CDP timeout '+method));},15000);pending.set(n,{resolve,reject,timer});s.send(JSON.stringify({id:n,method,params}));});return {send,eval:async expression=>{const r=await send('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true});if(r.exceptionDetails)throw Error(r.exceptionDetails.exception?.description||r.exceptionDetails.text);return r.result.value;},shot:async name=>{const r=await send('Page.captureScreenshot',{format:'png'});fs.writeFileSync(path.join(out,name+'.png'),Buffer.from(r.data,'base64'));}};}
(async()=>{try{
const env={...process.env};delete env.ELECTRON_RUN_AS_NODE;for(const k of Object.keys(env))if(k.startsWith('TEST_')||k.startsWith('HEZTECH_E2E')||k==='HEZTECH_COMPAT')delete env[k];
child=spawn(exe,['--remote-debugging-address=127.0.0.1','--remote-debugging-port=9358'],{env,windowsHide:true,stdio:['ignore','pipe','pipe']});child.stdout.on('data',d=>logs+=d);child.stderr.on('data',d=>logs+=d);
const target=await until(async()=>{const list=await(await fetch('http://127.0.0.1:9358/json/list')).json();return list.find(t=>t.type==='page'&&t.url.startsWith('file:'));},45000);
ws=new WebSocket(target.webSocketDebuggerUrl);await new Promise((resolve,reject)=>{ws.onopen=resolve;ws.onerror=reject;});cdp=attach(ws);await cdp.send('Runtime.enable');await cdp.send('Page.enable');
await until(()=>cdp.eval("!!window.heztech && document.body.textContent.length>100"));
check('packaged current HezTech booted',true,{exe,title:await cdp.eval('document.title')});
check('renderer cannot access Node',await cdp.eval("typeof require==='undefined' && typeof process==='undefined'"));
const cfg=await cdp.eval('window.heztech.getConfig().then(r=>({ok:r.success,keyEmpty:!r.config.geminiApiKey,noDecrypted:!("geminiApiKeyDecrypted" in r.config)}))');check('configuration IPC exposes no API secret',cfg.ok&&cfg.keyEmpty&&cfg.noDecrypted,cfg);
const connect=await cdp.eval("window.heztech.testModelConnection('openclaw-default')");check('authenticated real OpenClaw connection',connect.success,connect);
await cdp.eval("location.hash='#/assistant'; true");
await until(()=>cdp.eval("!!document.querySelector('textarea.ht-composer__input')"));
check('OpenClaw selected in the real UI',await cdp.eval("document.querySelector('.ht-composer__model')?.textContent.includes('OpenClaw') || [...document.querySelectorAll('select option:checked')].some(e=>e.textContent.includes('OpenClaw'))"));
await cdp.shot('01-before-chat');
const marker='HEZTECH_CONNECTED_20261028';
await cdp.eval("document.querySelector('textarea.ht-composer__input').focus(); true");
await cdp.send('Input.insertText',{text:'تست اتصال برنامه است. هیچ ابزاری استفاده نکن و هیچ فایلی نخوان. فقط دقیقاً این متن را پاسخ بده: '+marker});
await until(()=>cdp.eval("!document.querySelector('form.ht-composer button[type=submit]').disabled"));
await cdp.eval("document.querySelector('form.ht-composer').requestSubmit(); true");
let response='';await until(async()=>{const d=await cdp.eval("({text:[...document.querySelectorAll('.ht-message')].at(-1)?.textContent||'',error:document.querySelector('[role=alert]')?.textContent||'',running:!!document.querySelector('.ht-message--streaming')})");response=d.text;if(response.includes(marker)||d.error){if(d.error)check('visible chat error',false,d.error.trim().slice(0,300));return true;}return false;},140000);
check('real UI chat returns model response',response.includes(marker),{matched:response.includes(marker),characters:response.length});
await cdp.shot('02-real-chat');
const models=await cdp.eval('window.heztech.getAvailableModels()');check('model readiness follows observed response',models.models.find(m=>m.id==='openclaw-default')?.verified===true);
check('no renderer exceptions',exceptions.length===0,exceptions);
}catch(e){check('acceptance completed',false,e.message);}finally{
if(cdp){try{await cdp.eval('window.close(); true');}catch{}}if(ws)ws.close();if(child){await sleep(800);if(child.exitCode===null)child.kill();}
fs.writeFileSync(path.join(out,'main.log'),logs);const report={atUtc:new Date().toISOString(),exe,appAsarSha256:fs.existsSync(path.join(path.dirname(exe),'resources/app.asar'))?crypto.createHash('sha256').update(fs.readFileSync(path.join(path.dirname(exe),'resources/app.asar'))).digest('hex'):null,launchFlags:['loopback remote-debugging only; no E2E or compatibility mode'],findings,exceptions};fs.writeFileSync(path.join(out,'acceptance.json'),JSON.stringify(report,null,2));process.exitCode=findings.some(f=>!f.ok)?1:0;
}})();
