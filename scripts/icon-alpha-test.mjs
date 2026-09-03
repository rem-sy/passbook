#!/usr/bin/env node
import { existsSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
const __dirname = dirname(fileURLToPath(import.meta.url));
const EDGE = ['C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe','C:/Program Files/Microsoft/Edge/Application/msedge.exe'].find(p=>{try{existsSync(p);return true}catch{return false}});
const sleep = ms => new Promise(r=>setTimeout(r,ms));
const PORT = 9235;
async function main(){
  const edg = spawn(EDGE, [`--remote-debugging-port=${PORT}`,'--headless=new','--disable-gpu','--disable-crash-reporter','--noerrdialogs','--no-sandbox','--user-data-dir='+join(__dirname,'..','data','.icon-test'),'about:blank'],{stdio:'ignore'});
  await sleep(2500);
  let list=[]; for(let i=0;i<20;i++){ try{list=await(await fetch(`http://127.0.0.1:${PORT}/json`)).json(); if(list.length)break;}catch{} await sleep(300); }
  const ws=new WebSocket(list[0].webSocketDebuggerUrl); let id=0; const pending={};
  ws.onmessage=r=>{const m=JSON.parse(r.data.toString()); if(m.id&&pending[m.id])pending[m.id](m);};
  await new Promise(r=>ws.onopen=r);
  const send=(method,params={})=>new Promise((res,rej)=>{const i=++id;const t=setTimeout(()=>{delete pending[i];rej(new Error('timeout'))},15000);pending[i]=m=>{clearTimeout(t);res(m)};ws.send(JSON.stringify({id:i,method,params}));});
  await send('Page.enable'); await send('Runtime.enable');
  const html='<!doctype html><html><head><style>html,body{margin:0;background:transparent}svg{display:block}</style></head><body><svg width="100" height="100" viewBox="0 0 100 100"><circle cx="50" cy="50" r="40" fill="red"/></svg></body></html>';
  await send('Emulation.setDeviceMetricsOverride',{width:100,height:100,deviceScaleFactor:1,mobile:false});
  await send('Page.navigate',{url:'data:text/html;charset=utf-8,'+encodeURIComponent(html)});
  await sleep(800);
  const resp=await send('Page.captureScreenshot',{format:'png',fromSurface:true,omitBackground:true});
  const buf=Buffer.from(resp.result.data,'base64');
  writeFileSync(join(__dirname,'..','data','icon-test-t.png'),buf);
  console.log('colorType='+buf[25]+' (6=alpha,2=no alpha)');
  ws.close(); edg.kill();
}
main().catch(e=>{console.error(e);process.exit(1)});
