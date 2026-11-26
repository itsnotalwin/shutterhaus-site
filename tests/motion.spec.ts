import {expect, test} from '@playwright/test';

test('a slow cover keeps the current print visible and cannot replace a newer selection', async ({page}) => {
  await page.emulateMedia({reducedMotion:'no-preference'});
  await page.addInitScript(() => {
    const decode = HTMLImageElement.prototype.decode;
    HTMLImageElement.prototype.decode = async function () {
      if (!this.isConnected && this.src.includes('5-img-0086')) {
        const wait = new Promise<void>(resolve => window.addEventListener('test-release-cover', () => resolve(), {once:true}));
        document.documentElement.dataset.waitingForCover = 'true';
        await wait;
      }
      return decode.call(this);
    };
    new MutationObserver(changes => {
      for (const change of changes) {
        for (const node of change.addedNodes) {
          if (node instanceof HTMLElement && node.matches('.hero__outgoing')) {
            document.documentElement.dataset.coverDissolved = String(node.getAnimations().length > 0 && node.getAttribute('aria-hidden') === 'true');
          }
        }
      }
    }).observe(document, {childList:true, subtree:true});
  });
  await page.goto('/');
  const hero = page.locator('.hero__fig img');
  const next = page.getByRole('button',{name:'Next featured photograph'});
  await next.focus();
  await next.press('Enter');
  await expect(page.locator('html')).toHaveAttribute('data-waiting-for-cover','true');
  await expect(hero).toHaveAttribute('src', /22-img-0239/);
  await expect(page.locator('[data-slide-count]')).toHaveText('01 / 06');
  await next.press('Enter');
  await expect(page.locator('[data-slide-count]')).toHaveText('03 / 06');
  await expect(page.locator('html')).toHaveAttribute('data-cover-dissolved','true');
  await page.evaluate(() => window.dispatchEvent(new Event('test-release-cover')));
  await expect(page.locator('.hero__outgoing')).toHaveCount(0);
  await expect(hero).toHaveAttribute('src', /2-20240718114526/);
  await expect(next).toBeFocused();
});

test('reduced motion keeps the underline, manual controls, and static print intact', async ({page, browser}) => {
  await page.emulateMedia({reducedMotion:'reduce'});
  await page.goto('/');
  const mark = page.locator('.hero__underline');
  await expect(mark).toBeVisible();
  expect(await mark.evaluate(el => [getComputedStyle(el).clipPath,getComputedStyle(el).animationName])).toEqual(['none','none']);
  await page.getByRole('button',{name:'Next featured photograph'}).click();
  await expect(page.locator('[data-slide-count]')).toHaveText('02 / 06');
  await expect(page.locator('.hero__outgoing')).toHaveCount(0);
  expect(await page.locator('.hero__track').evaluate(el => getComputedStyle(el,'::before').transitionDuration)).toBe('0s');

  const native = await browser.newContext({javaScriptEnabled:false,baseURL:new URL(page.url()).origin});
  try {
    const staticPage = await native.newPage();
    await staticPage.goto('/');
    await expect(staticPage.locator('.hero__fig img')).toBeVisible();
    await expect(staticPage.locator('.hero__underline')).toBeVisible();
    expect(await staticPage.locator('.hero__underline').evaluate(el => getComputedStyle(el).animationName)).toBe('none');
    await expect(staticPage.locator('.hero__controls')).toBeHidden();
  } finally { await native.close(); }
});

test('a failed photograph leaves the current frame available and the next control usable', async ({page}) => {
  await page.addInitScript(() => {
    const decode = HTMLImageElement.prototype.decode;
    HTMLImageElement.prototype.decode = function () {
      if (!this.isConnected && this.src.includes('5-img-0086')) return Promise.reject(new Error('Photo unavailable'));
      return decode.call(this);
    };
  });
  await page.goto('/');
  const next = page.getByRole('button', {name:'Next featured photograph'});
  await next.click();
  await expect(page.locator('.hero__notice')).toContainText('could not load');
  await expect(page.locator('.hero__fig img')).toHaveAttribute('src', /22-img-0239/);
  await next.click();
  await expect(page.locator('[data-slide-count]')).toHaveText('03 / 06');
  await expect(page.locator('.hero__notice')).toBeEmpty();
});

test('the ink writes once and a requested cover survives a phone-to-desktop layout change', async ({page}) => {
  await page.setViewportSize({width:390,height:844});
  await page.emulateMedia({reducedMotion:'no-preference'});
  await page.addInitScript(() => {
    document.addEventListener('animationstart', event => {
      if (event.animationName === 'ink-write') {
        const doc = document.documentElement;
        doc.dataset.inkArrivals = String(Number(doc.dataset.inkArrivals || 0) + 1);
      }
    });
    const decode = HTMLImageElement.prototype.decode;
    HTMLImageElement.prototype.decode = async function () {
      if (!this.isConnected && this.src.includes('5-img-0086')) {
        await new Promise<void>(resolve => window.addEventListener('test-open-frame', () => resolve(), {once:true}));
      }
      return decode.call(this);
    };
  });
  await page.goto('/');
  await expect(page.locator('html')).toHaveAttribute('data-ink-arrivals','1');
  await expect(page.locator('.page-arrival')).toHaveCount(0);
  await page.getByRole('button',{name:'Next featured photograph'}).click();
  await expect(page.locator('.hero__fig')).toHaveAttribute('data-requested-frame', /.+/);
  await page.setViewportSize({width:1200,height:900});
  await expect(page.locator('.home')).toHaveAttribute('data-mobile-layout','false');
  await expect(page.locator('.hero__fig img')).toHaveAttribute('src', /22-img-0239/);
  await page.evaluate(() => window.dispatchEvent(new Event('test-open-frame')));
  await expect(page.locator('[data-slide-count]')).toHaveText('02 / 06');
  await page.emulateMedia({reducedMotion:'reduce'});
  await page.emulateMedia({reducedMotion:'no-preference'});
  await expect(page.locator('html')).toHaveAttribute('data-ink-arrivals','1');
});
