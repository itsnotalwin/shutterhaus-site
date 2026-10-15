import {chromium} from '@playwright/test';
const browser=await chromium.launch({executablePath:process.env.CHROME_BIN||'/usr/bin/chromium',args:['--no-sandbox']});
const page=await browser.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
await page.goto(process.env.REVIEW_URL||'http://127.0.0.1:8080/review/index.html');
for(const mode of ['reference','before'])for(const route of ['home','portfolio','about','services','contact'])for(const width of ['390','1440']){
 await page.selectOption('#mode',mode);await page.selectOption('#route',route);await page.selectOption('#width',width);
 await page.evaluate(async()=>{await Promise.all([...document.images].map(i=>i.decode()))});
}
for(const href of await page.locator('#all-widths a').evaluateAll(links=>links.map(a=>a.href))){
 if((await page.request.get(href)).status()!==200)throw new Error('Missing review evidence: '+href);
}
if(errors.length)throw new Error(errors.join('\n'));
console.log('Review viewer passed: 20 comparison states, 35 final viewport links, no page exceptions.');
await browser.close();
