// Run the existing CDP probes against an isolated local production preview.
import {preview} from 'vite';
import {chromium} from '@playwright/test';
import {spawn} from 'node:child_process';
import {mkdirSync,writeFileSync,createWriteStream} from 'node:fs';
const server=await preview({preview:{host:'127.0.0.1',port:4175,strictPort:true}});
const browser=await chromium.launch({executablePath:process.env.CHROME_BIN||'/usr/bin/chromium',args:['--no-sandbox','--disable-dev-shm-usage','--remote-debugging-port=9223']});
mkdirSync('review/after',{recursive:true});
const checks=[];
for(const [name,command,args] of [
 ['verify','npm',['run','verify','--','http://127.0.0.1:4175']],
 ['admin-panel','node',['tools/verify-admin-panel.mjs']],
 ['admin-upload','node',['tools/verify-admin-upload.mjs']],
]){
 const log=createWriteStream(`review/after/${name}.log`);
 const code=await new Promise(resolve=>{
  const child=spawn(command,args,{env:{...process.env,CDP_PORT:'9223',ORIGIN:'http://127.0.0.1:4175',SHOT_DIR:'review/after/verify'}});
  child.stdout.pipe(log);child.stderr.pipe(log);
  child.on('close',code=>{log.end();resolve(code)});
 });
 checks.push({command:[command,...args].join(' '),exit:code,log:`review/after/${name}.log`});
 console.log(name,code===0?'PASS':'FAIL');
}
writeFileSync('review/after/cdp-checks.json',JSON.stringify(checks,null,2));
await browser.close();
await new Promise(resolve=>server.httpServer.close(resolve));
process.exit(checks.some(c=>c.exit!==0)?1:0);
