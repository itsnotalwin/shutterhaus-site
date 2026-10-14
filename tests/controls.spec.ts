import { test, expect } from '@playwright/test';

for (const width of [320, 390, 768, 1000]) {
  test(`drawer traps focus, closes with Escape and scrim, releases desktop at ${width}`, async ({ page }) => {
    await page.setViewportSize({width, height:844});
    await page.goto('/contact.html');
    const button = page.locator('.burger');
    await button.click();
    await expect(button).toHaveAttribute('aria-expanded','true');
    await expect(page.locator('.site-nav a').first()).toBeFocused();
    await expect(page.locator('main')).toHaveJSProperty('inert',true);
    await page.locator('.site-nav a').last().focus();
    await page.keyboard.press('Tab');
    await expect(button).toBeFocused();
    await page.keyboard.press('Shift+Tab');
    await expect(page.locator('.site-nav a').last()).toBeFocused();
    await page.keyboard.press('Escape');
    await expect(button).toBeFocused();
    await expect(page.locator('main')).toHaveJSProperty('inert',false);
    await button.click();
    await page.locator('.nav-scrim').click({position:{x:5,y:650}});
    await expect(button).toHaveAttribute('aria-expanded','false');
    await button.click();
    await page.setViewportSize({width:1440,height:1000});
    await expect(page.locator('main')).toHaveJSProperty('inert',false);
    await expect(page.locator('.site-nav')).toHaveJSProperty('inert',false);
    await expect(page.locator('html')).not.toHaveClass(/nav-locked/);
  });
}

for (const path of ['/', '/portfolio.html']) {
  test(`keyboard lightbox opens, steps, traps focus and restores opener on ${path}`, async ({page}) => {
    await page.goto(path);
    const cell=page.locator(path==='/'?'.hstrip__item':'.pf-cell').first();
    await cell.focus();
    await page.keyboard.press('Enter');
    const dialog=page.getByRole('dialog', {name:'Photograph viewer'});
    await expect(dialog).toBeVisible();
    await expect(page.getByRole('button',{name:'Close',exact:true})).toBeFocused();
    const source=await dialog.locator('img').getAttribute('src');
    await page.keyboard.press('ArrowRight');
    await expect(dialog.locator('img')).not.toHaveAttribute('src',source!);
    await page.keyboard.press('ArrowLeft');
    await expect(dialog.locator('img')).toHaveAttribute('src',source!);
    await page.keyboard.press('Shift+Tab');
    await expect(page.getByRole('button',{name:'Next',exact:true})).toBeFocused();
    await page.keyboard.press('Tab');
    await expect(page.getByRole('button',{name:'Close',exact:true})).toBeFocused();
    await page.keyboard.press('Escape');
    await expect(dialog).toBeHidden();
    await expect(cell).toBeFocused();
    await expect(page.locator('.shell')).toHaveJSProperty('inert',false);
  });
}

test('package selection, draft recovery and rotation retain an enquiry', async ({page}) => {
  await page.goto('/services.html');
  const social=page.locator('.pkg').filter({has:page.getByRole('heading',{name:'Social',exact:true})});
  await expect(social.locator('.pkg__price')).toHaveText('R3,500');
  await social.getByRole('link',{name:'Book now'}).click();
  await expect(page.locator('#cform-kind')).toHaveValue('Social');
  await page.getByLabel('Name',{exact:true}).fill('Review visitor');
  await page.getByLabel('Email',{exact:true}).fill('review@example.com');
  await page.getByLabel('Message',{exact:true}).fill('Please help me plan a portrait session.');
  await page.locator('#cform-kind').selectOption('Signature');
  await page.reload();
  await expect(page.locator('#cform-kind')).toHaveValue('Signature');
  await expect(page.getByLabel('Name',{exact:true})).toHaveValue('Review visitor');
  await expect(page.getByLabel('Message',{exact:true})).toHaveValue('Please help me plan a portrait session.');
  for(const viewport of [{width:390,height:844},{width:844,height:390},{width:390,height:844}]) {
    await page.setViewportSize(viewport);
    await page.evaluate(()=>dispatchEvent(new Event('orientationchange')));
    await expect(page.getByLabel('Message',{exact:true})).toHaveValue('Please help me plan a portrait session.');
  }
});

test('validation and honeypot block sends; failure retains draft; retry sends once', async ({page}) => {
  let sends=0;
  let succeed=false;
  await page.route('https://formspree.io/**',async route=>{
    sends++;
    await new Promise(resolve=>setTimeout(resolve,300));
    await route.fulfill({status:succeed?200:500,contentType:'application/json',body:succeed?'{"ok":true}':'{"error":"test failure"}'});
  });
  await page.goto('/contact.html');
  await page.getByRole('button',{name:'Send message'}).click();
  await expect(page.getByLabel('Name',{exact:true})).toBeFocused();
  expect(sends).toBe(0);
  await page.getByLabel('Name',{exact:true}).fill('Test visitor');
  await page.getByLabel('Email',{exact:true}).fill('bad-address');
  await page.getByLabel('Message',{exact:true}).fill('A local test, never delivered.');
  await page.getByRole('button',{name:'Send message'}).click();
  await expect(page.getByLabel('Email',{exact:true})).toHaveAttribute('aria-invalid','true');
  expect(sends).toBe(0);
  await page.getByLabel('Email',{exact:true}).fill('review@example.com');
  await page.locator('[name=_website]').evaluate((el:HTMLInputElement)=>el.value='spam');
  await page.getByRole('button',{name:'Send message'}).click();
  expect(sends).toBe(0);
  await page.locator('[name=_website]').evaluate((el:HTMLInputElement)=>el.value='');
  await page.getByRole('button',{name:'Send message'}).click();
  await expect(page.locator('#cform-note')).toContainText("That didn't send");
  await expect(page.getByLabel('Message',{exact:true})).toHaveValue('A local test, never delivered.');
  succeed=true;
  await page.locator('form').evaluate((form:HTMLFormElement)=>{form.requestSubmit();form.requestSubmit();});
  await expect(page.locator('#cform-note')).toContainText('Thanks, got it');
  expect(sends).toBe(2);
  await expect(page.getByLabel('Message',{exact:true})).toHaveValue('');
  expect(await page.evaluate(()=>sessionStorage.getItem('shutterhaus-enquiry-draft-v1'))).toBeNull();
});

test('drawer navigation and legacy links reach real pages',async({page})=>{
 await page.setViewportSize({width:390,height:844});
 await page.goto('/');
 await page.getByRole('button',{name:'Open menu'}).click();
 await page.getByRole('navigation',{name:'Primary'}).getByRole('link',{name:'Services'}).click();
 await expect(page).toHaveURL(/services.html$/);
 await expect(page.locator('.pkg')).toHaveCount(4);
 for(const route of ['/#/photo','/index.html#/portfolio']) {
  await page.goto(route);await expect(page.locator('.pf-cell')).toHaveCount(30);
 }
});


test('skip link focuses content without changing the homepage',async({page})=>{
 await page.goto('/');
 await page.keyboard.press('Tab');
 await expect(page.getByRole('link',{name:'Skip to content'})).toBeFocused();
 await page.keyboard.press('Enter');
 await expect(page.locator('main')).toBeFocused();
 await expect(page.locator('.hero')).toBeVisible();
});

for(const route of ['/#/contact','/#/portfolio']) {
 test(`skip link preserves legacy route ${route}`,async({page})=>{
  await page.goto(route);
  const title=await page.locator('h1').textContent();
  await page.keyboard.press('Tab');await page.keyboard.press('Enter');
  await expect(page.locator('main')).toBeFocused();
  await expect(page.locator('h1')).toHaveText(title!);
  expect(new URL(page.url()).hash).toBe(route.slice(1));
 });
}
