import { test, expect } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';

const viewports = [
  {width:320,height:568}, {width:320,height:740}, {width:375,height:812}, {width:393,height:852},
  {width:430,height:932}, {width:768,height:1024}, {width:1024,height:768},
  {width:1440,height:1000}, {width:844,height:390},
];
const baseline = process.env.SAFARI_CAPTURE_BASELINE === '1';
const routes = ['home','portfolio','about','services','contact'];

for (const viewport of viewports) {
  test.describe(`${viewport.width}px × ${viewport.height}px`, () => {
    test.use({viewport, isMobile:viewport.width<1024, hasTouch:viewport.width<1024, deviceScaleFactor:3});
    test('photos stay inside their frames through lazy loading, scrolling and resizing', async ({page}, testInfo) => {
      test.setTimeout(120000);
      const folder = `shots/safari-layout/${baseline?'before':'after'}/${testInfo.project.name}`;
      mkdirSync(folder,{recursive:true});
      const measurements:unknown[] = [];
      const errors:string[] = [];
      page.on('pageerror', error => errors.push(error.message));
      const save = () => writeFileSync(`${folder}/measurements-${viewport.width}x${viewport.height}.json`,JSON.stringify({viewport,engine:testInfo.project.name,baseline,measurements,errors},null,2));
      const screenshot = async (label:string, fullPage=false) => page.screenshot({path:`${folder}/${label}-${viewport.width}x${viewport.height}.jpg`,type:'jpeg',quality:85,scale:'css',fullPage,animations:'disabled'});
      const frames = async (label:string, selector:string, fill:boolean) => {
        const violations = await page.locator(selector).evaluateAll((elements, fill) => elements.flatMap(frame => {
          if (!frame.getClientRects().length || frame.closest('[hidden]')) return [];
          const outer = frame.getBoundingClientRect();
          return [...frame.querySelectorAll('picture,img,.cell')].flatMap(child => {
            const r = child.getBoundingClientRect();
            const inside = r.left>=outer.left-1 && r.top>=outer.top-1 && r.right<=outer.right+1 && r.bottom<=outer.bottom+1;
            const fills = Math.abs(r.width-outer.width)<=1 && Math.abs(r.height-outer.height)<=1 && Math.abs(r.x-outer.x)<=1 && Math.abs(r.y-outer.y)<=1;
            return inside && (!fill || fills) ? [] : [{frame:frame.className,child:child.tagName,outer:{x:outer.x,y:outer.y,w:outer.width,h:outer.height},inner:{x:r.x,y:r.y,w:r.width,h:r.height},inside,fills}];
          });
        }), fill);
        measurements.push({label,violations});
        save();
        if (!baseline) expect(violations,label).toEqual([]);
      };
      for (const route of routes) {
        await page.goto(route==='home'?'/':`/${route}.html`);
        await page.evaluate(()=>document.fonts.ready);
        await expect(page.locator('h1')).toBeVisible();
        if (route==='home') {
          if (viewport.width < 760 && !baseline) {
            const cover = (await page.locator('.hero__fig').boundingBox())!;
            const title = (await page.locator('.hero__title').boundingBox())!;
            const header = (await page.locator('.site-header').boundingBox())!;
            expect(cover.y, 'Cover starts at the top of the screen').toBeCloseTo(0, 0);
            expect(cover.height, 'Cover fills one stable screen').toBeCloseTo(Math.max(viewport.height, 560), 0);
            expect(title.y, 'Hero title clears the navigation').toBeGreaterThanOrEqual(header.y + header.height);
            expect(title.y + title.height, 'Hero title stays inside the cover').toBeLessThanOrEqual(cover.y + cover.height + 1);
          }
          await page.evaluate(()=>window.scrollTo({top:document.querySelector('.hstrip')!.getBoundingClientRect().top+scrollY-100,behavior:'instant'}));
          if (viewport.width < 760 && !baseline) await expect(page.locator('.site-header')).toHaveClass(/is-solid/);
          await screenshot('home-grid-initial');
          for (const cell of await page.locator('.hstrip__item:visible').all()) {
            await cell.scrollIntoViewIfNeeded();
            await cell.locator('img').evaluate((image:HTMLImageElement)=>image.decode());
            await frames('Home lazy-loaded selected work','.hstrip__item',true);
          }
          const originalHeight = viewport.height;
          await page.setViewportSize({width:viewport.width,height:Math.max(320,originalHeight-180)});
          await frames('Home after browser toolbar resize','.hstrip__item',true);
          await page.setViewportSize({width:viewport.width<760?844:393,height:viewport.width<760?390:852});
          await page.evaluate(()=>dispatchEvent(new Event('orientationchange')));
          await page.waitForTimeout(150);
          await frames('Home after rotation','.hstrip__item',true);
          await page.setViewportSize(viewport);
          await page.evaluate(()=>dispatchEvent(new Event('orientationchange')));
          await page.waitForTimeout(150);
          await frames('Home after rotating back','.hstrip__item',true);
          await page.evaluate(()=>window.scrollTo({top:document.querySelector('.hstrip')!.getBoundingClientRect().top+scrollY-100,behavior:'instant'}));
          await screenshot('home-grid');
          if (!baseline) {
            const opener=page.locator('.hstrip__item').first();
            await opener.click();
            await expect(page.locator('.lb')).toBeVisible();
            await page.locator('.lb__x').click();
            await expect(opener).toBeFocused();
          }
          await frames('Home hero','.hero__fig picture',true);
        }
        if (route==='services') {
          for (const tier of ['Starter','Essential','Signature','Social']) {
            await page.locator(`[name="package-view"][value="${tier}"]`).check();
            const card=page.locator(`.pkg[data-package="${tier}"]`);
            await card.scrollIntoViewIfNeeded();
            await card.locator('img').evaluate((image:HTMLImageElement)=>image.decode());
            await frames(`Services ${tier}`,'.pkg:not([hidden]) .pkg__fig',true);
          }
        }
        for (const image of await page.locator('.editorial-intro__photo img,.about__fig img,.shead__fig img,.contact__photo img').all()) {
          await image.scrollIntoViewIfNeeded();
          await image.evaluate((image:HTMLImageElement)=>image.decode());
        }
        await frames(`${route} intro`,'.editorial-intro__photo,.about__fig,.shead__fig,.contact__photo',false);
        if (route==='portfolio') {
          for (const index of [0,4,9]) {
            const cell=page.locator('.pf-cell').nth(index);
            await cell.scrollIntoViewIfNeeded();
            await cell.locator('img').evaluate((image:HTMLImageElement)=>image.decode());
          }
          await frames('Portfolio full-frame images','.pf-cell',false);
        }
        await page.evaluate(()=>window.scrollTo({top:document.body.scrollHeight,behavior:'instant'}));
        await screenshot(`${route}-footer`);
        const overflow=await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1);
        const photos=await page.locator('main img').evaluateAll(images=>images.map(image=>({src:image.getAttribute('src'),filename:(image as HTMLImageElement).dataset.filename,loaded:(image as HTMLImageElement).naturalWidth>0})));
        measurements.push({route,overflow,photos});
        if(!baseline) expect(overflow,`${route} horizontal overflow`).toBe(false);
        await page.evaluate(()=>window.scrollTo({top:0,behavior:'instant'}));
        if (route==='home' && viewport.width < 760 && !baseline) await expect(page.locator('.site-header')).not.toHaveClass(/is-solid/);
        await screenshot(route,true);
        if (route==='contact') {
          const burger=page.locator('.burger');
          if(await burger.isVisible()) {
            await burger.click();
            await expect(burger).toHaveAttribute('aria-expanded','true');
            const covered=await page.locator('.site-nav a').evaluateAll(links=>links.filter(link=>{
              const r=link.getBoundingClientRect(), hit=document.elementFromPoint(r.x+r.width/2,r.y+r.height/2);
              return r.top<0 || r.bottom>innerHeight+1 || !(hit===link || link.contains(hit));
            }).map(link=>link.textContent));
            measurements.push({label:'menu hit targets',covered});
            if(!baseline) expect(covered).toEqual([]);
            await screenshot('menu');
            await burger.click();
          }
          await page.getByLabel('Name',{exact:true}).fill('Layout review');
          await expect(page.getByLabel('Name',{exact:true})).toHaveValue('Layout review');
          await page.getByLabel('Name',{exact:true}).blur();
        }
      }
      save();
      if(!baseline) expect(errors).toEqual([]);
    });
  });
}
