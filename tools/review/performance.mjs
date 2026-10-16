// Local unthrottled sanity measurements; these are not Lighthouse scores.
import {preview} from 'vite';
import {chromium} from '@playwright/test';
import {writeFileSync,mkdirSync} from 'node:fs';
const output=process.env.REVIEW_OUT || 'shots/performance';
mkdirSync(output,{recursive:true});
const server=await preview({preview:{host:'127.0.0.1',port:4188,strictPort:true}});
const browser=await chromium.launch({executablePath:process.env.CHROME_BIN||'/usr/bin/chromium',args:['--no-sandbox','--disable-dev-shm-usage']});
const rows=[];
for(const width of [390,1440]){
 const context=await browser.newContext({viewport:{width,height:width===390?844:1000},isMobile:width===390,hasTouch:width===390});
 await context.addInitScript(()=>{
  window.__reviewMetrics={cls:0,lcp:0};
  new PerformanceObserver(list=>list.getEntries().forEach(e=>{if(!e.hadRecentInput)window.__reviewMetrics.cls+=e.value})).observe({type:'layout-shift',buffered:true});
  new PerformanceObserver(list=>list.getEntries().forEach(e=>window.__reviewMetrics.lcp=e.startTime)).observe({type:'largest-contentful-paint',buffered:true});
 });
 const page=await context.newPage();
 for(const route of ['home','portfolio','about','services','contact']){
  await page.goto('http://127.0.0.1:4188/'+(route==='home'?'':route+'.html'));
  await page.waitForTimeout(2000);
  rows.push(await page.evaluate(({route,width})=>({route,width,...window.__reviewMetrics,resourceBytes:performance.getEntriesByType('resource').reduce((n,r)=>n+r.transferSize,0),externalHosts:[...new Set(performance.getEntriesByType('resource').map(r=>new URL(r.name).hostname).filter(h=>h!=='127.0.0.1'))]}),{route,width}));
 }
 await context.close();
}
writeFileSync(`${output}/measurements.json`,JSON.stringify({conditions:'Local Vite production preview, unthrottled Chromium, 2-second observation, no scroll; a sanity check, not a benchmark.',measurements:rows},null,2));
console.log(JSON.stringify(rows.map(({route,width,cls,lcp})=>({route,width,cls,lcp}))));
await browser.close();await new Promise(resolve=>server.httpServer.close(resolve));
