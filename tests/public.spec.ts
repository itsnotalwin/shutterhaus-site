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
    mkdirSync('shots/public',{recursive:true});
    await page.screenshot({path:`shots/public/${route}-${width}.png`,fullPage:true});
   }
  }
  expect(errors).toEqual([]);
 });
}

test('real pinned sources, gallery order and package facts survive',async({page})=>{
 await page.goto('/');
 await expect(page.locator('.hero__fig img')).toHaveAttribute('src',/22-img-0239/);
 await expect(page.locator('.hstrip__item')).toHaveCount(4);
 const homeSources=await page.locator('.hstrip__item img').evaluateAll(images=>images.map((el:HTMLImageElement)=>el.dataset.filename));
 expect(new Set(homeSources).size).toBe(4);
 await page.goto('/about.html');
 await expect(page.locator('.about__fig img')).toHaveAttribute('src',/55-metal-detector/);
 await page.goto('/portfolio.html');
 await expect(page.locator('.pf-cell')).toHaveCount(30);
 await page.setViewportSize({width:1440,height:1000});await page.reload();
 const expected=JSON.parse(readFileSync('tests/fixtures/portfolio-order.json','utf8'));
 const current=await page.locator('.pf-cell img').evaluateAll(images=>images.map(el=>el.getAttribute('src')));
 expect(current).toEqual(expected);
 await page.goto('/services.html');
 expect(await page.locator('.pkg__price').allTextContents()).toEqual(['R800','R2,000','R2,500','R3,500']);
 expect(await page.locator('.pkg__list li').count()).toBe(15);
 await expect(page.locator('.terms li')).toHaveCount(6);
 await expect(page.locator('.addons li')).toHaveCount(5);
});

test('reduced motion, self-hosted type and signed-out admin gate',async({page})=>{
 await page.emulateMedia({reducedMotion:'reduce'});
 await page.goto('/');
 await page.evaluate(()=>document.fonts.ready);
 expect(await page.locator('h1').evaluate(el=>getComputedStyle(el).fontFamily)).toContain('Playfair Display');
 expect(await page.locator('.cell img').first().evaluate(el=>getComputedStyle(el).transitionDuration)).toBe('0s');
 await expect(page.locator('link[href*="fonts.googleapis"]')).toHaveCount(0);
 await page.goto('/admin.html');
 await expect(page.locator('#app')).not.toBeEmpty();
 await expect(page.locator('#app')).toContainText(/Google|isn't connected yet/);
 await expect(page.locator('#app')).not.toContainText("isn't on the admin allowlist");
});

test('featured photographs wrap and collection links open real Shutterhaus work', async ({page}) => {
 await page.goto('/');
 const figure = page.locator('.hero__fig');
 const initial = await figure.getAttribute('data-frame');
 const next = page.getByRole('button', {name:'Next featured photograph'});
 const prev = page.getByRole('button', {name:'Previous featured photograph'});
 await prev.focus();
 await prev.press('Enter');
 await expect(page.locator('[data-slide-count]')).toHaveText('06 / 06');
 await expect(figure).not.toHaveAttribute('data-frame', initial!);
 await next.click();
 await expect(figure).toHaveAttribute('data-frame', initial!);
 await expect(page.locator('[data-slide-count]')).toHaveText('01 / 06');
 for (const label of ['Portraits','On location','Social content','Landscapes','Families']) {
  await page.goto('/portfolio.html');
  await page.locator('.work-tile').filter({hasText:label}).click();
  await expect(page.locator('h1')).toHaveText(label + '.');
  const photo = page.locator('.pf-cell').first();
  await expect(photo).toBeVisible();
  await expect(photo.locator('img')).toHaveAttribute('src',/gallery/);
  await photo.click();
  await expect(page.locator('.lb')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(photo).toBeFocused();
 }
});


test('a phone shows every Home pick and the complete family group', async ({page}) => {
 await page.setViewportSize({width: 320, height: 568});
 await page.goto('/');
 const strip = page.locator('.hstrip__grid');
 expect(await strip.evaluate(el => el.scrollWidth <= el.clientWidth + 1)).toBe(true);
 const cards = await strip.locator('button').evaluateAll(items => items.map(el => {
  const r = el.getBoundingClientRect();
  return {x: r.x, y: r.y, right: r.right, width: r.width};
 }));
 expect(cards).toHaveLength(4);
 expect(cards.every(card => card.x >= 0 && card.right <= 320 && card.width > 0)).toBe(true);
 expect(cards[0].y).toEqual(cards[1].y);
 expect(cards[2].y).toBe(cards[0].y);
 expect(cards[3].y).toBeGreaterThan(cards[0].y);
 await expect(strip.locator('button').last()).toHaveAttribute('data-cover','families');
 const next = page.getByRole('button', {name: 'Next featured photograph'});
 for (let i = 0; i < 4; i++) await next.click();
 const family = page.locator('.hero__fig img');
 await expect(family).toHaveAttribute('src', /54-img-0164/);
 expect(await family.evaluate(el => getComputedStyle(el).objectFit)).toBe('contain');
});

test('bookmarked collections open the on-location photographs with and without scripting', async ({page,browser}) => {
 const oldLink = '/portfolio.html?collection=studio#edit-studio';
 await page.goto(oldLink);
 await expect(page).toHaveURL(/collection=on-location#edit-on-location$/);
 await expect(page.locator('h1')).toHaveText('On location.');
 expect(await page.locator('.pf-cell').count()).toBeGreaterThan(4);
 const context = await browser.newContext({javaScriptEnabled:false,baseURL:new URL(page.url()).origin});
 try {
  const native = await context.newPage();
  await native.goto(oldLink);
  const collection = native.locator('#edit-on-location');
  await expect(collection).toBeVisible();
  expect(await collection.locator('a[href*="gallery/"]').count()).toBeGreaterThan(4);
 } finally { await context.close(); }
});

test('collection covers preserve the pictured faces on phones and wide screens', async ({page}) => {
 // Face bounds measured in the original photographs, in fractions of the frame.
 const bounds = {
  portraits: [0.28, 0.021, 0.75, 0.39],
  'on-location': [0.25, 0.20, 0.66, 0.52],
  landscapes: [0, 0, 1, 1],
  families: [0.075, 0.06, 0.93, 0.70],
  social: [0.35, 0.025, 0.64, 0.21],
 };
 for (const width of [320, 390, 768, 1440]) {
  await page.setViewportSize({width,height:900});
  for (const route of ['/', '/portfolio.html']) {
   await page.goto(route);
   const tiles = page.locator('.hstrip__item, .work-tile');
   await tiles.locator('img').evaluateAll(images => Promise.all(images.map(img => { img.loading = 'eager'; return img.decode(); })));
   const visibleFaces = await tiles.evaluateAll((elements, bounds) => elements.map(el => {
    const id = el.getAttribute('data-cover') || el.getAttribute('data-collection')!;
    const image = el.querySelector('img')!;
    const rect = image.getBoundingClientRect();
    const css = getComputedStyle(image);
    const [x, y] = css.objectPosition.split(' ').map(percent => parseFloat(percent)/100);
    const padLeft = parseFloat(css.paddingLeft), padTop = parseFloat(css.paddingTop);
    const width = rect.width - padLeft - parseFloat(css.paddingRight);
    const height = rect.height - padTop - parseFloat(css.paddingBottom);
    const scale = (css.objectFit === 'contain' ? Math.min : Math.max)(width/image.naturalWidth, height/image.naturalHeight);
    const w = image.naturalWidth*scale, h = image.naturalHeight*scale;
    const left = padLeft+(width-w)*x, top = padTop+(height-h)*y;
    const subject = image.dataset.filename === '2-20240718114526-img-0124.jpg' ? 'on-location'
     : image.dataset.filename === '5-img-0086.jpg' ? 'portraits' : id;
    const [x1, y1, x2, y2] = bounds[subject as keyof typeof bounds];
    return {id,inside: left+w*x1 >= -1 && top+h*y1 >= -1 && left+w*x2 <= rect.width+1 && top+h*y2 <= rect.height+1};
   }), bounds);
   expect(visibleFaces.filter(photo => !photo.inside), route + ' at ' + width).toEqual([]);
  }
 }
});
