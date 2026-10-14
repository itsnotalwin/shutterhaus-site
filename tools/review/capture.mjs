// Full-page evidence, including real touch emulation. Run after npm run build.
import {chromium} from '@playwright/test';
import {preview} from 'vite';
const port=Number(process.env.REVIEW_PORT || 4174);
const server=await preview({preview:{host:'127.0.0.1',port,strictPort:true}});
import {mkdirSync,writeFileSync} from 'node:fs';
const out=process.argv[2] || 'review/after';
const routes=(process.env.REVIEW_ROUTES || 'home,portfolio,about,services,contact').split(',');
const widths=(process.env.REVIEW_WIDTHS || '320,390,430,768,1024,1440,1920').split(',').map(Number);
mkdirSync(out,{recursive:true});
const browser=await chromium.launch({executablePath:process.env.CHROME_BIN || '/usr/bin/chromium',args:['--no-sandbox','--disable-dev-shm-usage']});
const results=[];
for(const width of widths){
 const context=await browser.newContext({viewport:{width,height:width<760?844:1000},deviceScaleFactor:1,isMobile:width<760,hasTouch:width<760});
 const page=await context.newPage();
 for(const route of routes){
  const errors=[];
  const handler=e=>errors.push(e.message);
  page.on('pageerror',handler);
  await page.goto(`http://127.0.0.1:${port}/`+(route==='home'?'':route+'.html'),{waitUntil:'networkidle'});
  await page.evaluate(()=>document.fonts.ready);
  await page.evaluate(async()=>{document.querySelectorAll('img').forEach(i=>i.loading='eager');await Promise.all([...document.images].filter(i=>!i.closest('.lb')).map(i=>i.decode()));});
  await page.waitForTimeout(1000);
  await page.screenshot({path:`${out}/${route}-${width}.png`,fullPage:true,animations:'disabled'});
  results.push(await page.evaluate(({route,width,errors})=>({route,width,errors,overflow:document.documentElement.scrollWidth>innerWidth,h1:[...document.querySelectorAll('h1')].map(e=>e.textContent),images:[...document.images].filter(i=>!i.closest('.lb')).map(i=>({src:i.getAttribute('src'),ok:i.naturalWidth>0,alt:i.alt})),canonical:document.querySelector('link[rel=canonical]')?.href}),{route,width,errors}));
  page.off('pageerror',handler);
  console.log(`${route} ${width}`);
 }
 await context.close();
}
if(process.env.REVIEW_ROUTES) {
 const {readFileSync}=await import('node:fs');
 const old=JSON.parse(readFileSync(`${out}/measurements.json`,'utf8'));
 results.push(...old.filter(row=>!routes.includes(row.route)));
}
writeFileSync(`${out}/measurements.json`,JSON.stringify(results,null,2));
await browser.close();
await new Promise(resolve=>server.httpServer.close(resolve));
