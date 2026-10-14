import {test,expect} from '@playwright/test';
import {readFileSync,mkdirSync} from 'node:fs';
const routes=['home','portfolio','about','services','contact'];
for(const width of [320,390,430,768,1024,1440,1920]) {
 test(`all five pages: layout, media, semantics and SEO at ${width}`,async({page})=>{
  test.setTimeout(90000);
  await page.setViewportSize({width,height:width<760?844:1000});
  const errors:string[]=[];
  page.on('pageerror',e=>errors.push(e.message));
  for(const route of routes) {
   await page.goto(route==='home'?'/':`/${route}.html`);
   await expect(page.locator('h1')).toHaveCount(1);
   await page.evaluate(()=>document.fonts.ready);
   await page.evaluate(async()=>{document.querySelectorAll('img').forEach(i=>i.loading='eager');await Promise.all([...document.images].filter(i=>!i.closest('.lb')).map(i=>i.decode()));});
   // Let the intentional image reveal finish before comparing pixels.
   await page.waitForTimeout(300);
   expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),`${route} overflow`).toBe(true);
   const images=await page.locator('main img').evaluateAll(images=>images.filter((el:HTMLImageElement)=>!el.closest('[aria-hidden=true]')).map((el:HTMLImageElement)=>({ok:el.naturalWidth>0,alt:el.alt})));
   expect(images.every(i=>i.ok&&i.alt.length>0),`${route} media/alt`).toBe(true);
   const clipped=await page.locator('h1,h2,.cta,.cform input,.cform select').evaluateAll(els=>els.filter(el=>el.scrollWidth>el.clientWidth+2).map(el=>el.textContent));
   expect(clipped,`${route} clipped text`).toEqual([]);
   const canonical=route==='home'?'https://shutterhausvisuals.co.za/':`https://shutterhausvisuals.co.za/${route}.html`;
   await expect(page.locator('link[rel=canonical]')).toHaveAttribute('href',canonical);
   await expect(page.locator('meta[property="og:url"]')).toHaveAttribute('content',canonical);
   expect(await page.locator('script[type="application/ld+json"]').evaluate(el=>!!JSON.parse(el.textContent||'{}'))).toBe(true);
   await expect(page.locator('a[href^="tel:"]')).toHaveCount(0);
   if(process.env.CAPTURE_REVIEW){
    mkdirSync('review/after',{recursive:true});
    await page.screenshot({path:`review/after/${route}-${width}.png`,fullPage:true});
   }
  }
  expect(errors).toEqual([]);
 });
}

test('real pinned sources, gallery order and package facts survive',async({page})=>{
 await page.goto('/');
 await expect(page.locator('.hero__fig img')).toHaveAttribute('src',/27-img-0297/);
 await expect(page.locator('.hstrip__item')).toHaveCount(6);
 const homeSources=await page.locator('.hstrip__item img').evaluateAll(images=>images.map((el:HTMLImageElement)=>el.dataset.filename));
 expect(new Set(homeSources).size).toBe(6);
 await page.goto('/about.html');
 await expect(page.locator('.about__fig img')).toHaveAttribute('src',/55-metal-detector/);
 await page.goto('/portfolio.html');
 await expect(page.locator('.pf-cell')).toHaveCount(30);
 await page.setViewportSize({width:1440,height:1000});await page.reload();
 const baseline=JSON.parse(readFileSync('review/baseline/measurements.json','utf8')).find((r:{route:string;width:number})=>r.route==='portfolio'&&r.width===1440);
 const original=baseline.images.filter((i:{src:string})=>i.src?.includes('gallery/')).map((i:{src:string})=>i.src);
 expect(await page.locator('.pf-cell img').evaluateAll(images=>images.map(el=>el.getAttribute('src')))).toEqual(original);
 await page.goto('/services.html');
 expect(await page.locator('.pkg__price').allTextContents()).toEqual(['R800','R2,000','R2,500','R3,500']);
 expect(await page.locator('.pkg__list li').count()).toBe(15);
 await expect(page.locator('.terms li')).toHaveCount(5);
 await expect(page.locator('.addons li')).toHaveCount(5);
});

test('reduced motion, self-hosted type and signed-out admin gate',async({page})=>{
 await page.emulateMedia({reducedMotion:'reduce'});
 await page.goto('/');
 await page.evaluate(()=>document.fonts.ready);
 expect(await page.locator('h1').evaluate(el=>getComputedStyle(el).fontFamily)).toContain('EB Garamond');
 expect(await page.locator('.cell img').first().evaluate(el=>getComputedStyle(el).transitionDuration)).toBe('0s');
 await expect(page.locator('link[href*="fonts.googleapis"]')).toHaveCount(0);
 await page.goto('/admin.html');
 await expect(page.locator('#app')).not.toBeEmpty();
 await expect(page.locator('#app')).toContainText(/Google|isn't connected yet/);
 await expect(page.locator('#app')).not.toContainText("isn't on the admin allowlist");
});
