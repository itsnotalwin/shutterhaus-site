/** Read-only evidence from the deployed site. Never submits a form or authenticates. */
import { chromium, webkit, request } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const origin = (process.env.LIVE_URL || 'https://shutterhausvisuals.co.za').replace(/\/$/, '');
const output = resolve(process.env.AUDIT_OUT || 'shots/production-audit');
const engine = process.env.BROWSER_ENGINE === 'webkit' ? 'webkit' : 'chromium';
const routes = (process.env.AUDIT_ROUTES || 'home,portfolio,about,services,contact').split(',');
const widths = (process.env.AUDIT_WIDTHS || '320,390,430,768,1024,1440,1920').split(',').map(Number);
const navOnly = process.env.AUDIT_NAV_ONLY === '1';
const viewports = widths.map(width => ({ width, height: Number(process.env.AUDIT_HEIGHT) || (width <= 768 ? 844 : 1000), label: String(width) }));
if (process.env.AUDIT_LANDSCAPE !== '0') viewports.push({ width: 844, height: 390, label: '844-landscape' });
mkdirSync(output, { recursive: true });
const report = { generatedAt: new Date().toISOString(), origin, engine, readOnly: true, navOnly, release: null, pages: [], interactions: [], accessFailures: [] };
const save = () => writeFileSync(`${output}/measurements.json`, JSON.stringify(report, null, 2));
const browser = engine === 'webkit'
  ? await webkit.launch()
  : await chromium.launch({ executablePath: process.env.CHROME_BIN || '/usr/bin/google-chrome', args: ['--no-sandbox', '--disable-dev-shm-usage'] });
const routeURL = route => `${origin}/${route === 'home' ? '' : `${route}.html`}`;

async function settle(page) {
  await page.waitForFunction(() => document.querySelector('main') && !document.querySelector('#app')?.hasAttribute('data-route'), { timeout: 25000 });
  await page.evaluate(() => document.fonts.ready);
  // Public gallery/composition reads can repaint the prerendered document. Allow
  // their responses to complete, then decode the images in the actual final DOM.
  await page.waitForLoadState('networkidle', { timeout: 16000 }).catch(() => {});
  await page.waitForTimeout(3200);
  await page.evaluate(async () => {
    const images = [...document.images].filter(image => !image.closest('.lb'));
    images.forEach(image => { image.loading = 'eager'; });
    await Promise.all(images.map(image => Promise.race([
      image.decode().catch(() => {}), new Promise(resolve => setTimeout(resolve, 16000)),
    ])));
  });
  await page.waitForTimeout(450);
}

async function metrics(page) {
  return page.evaluate(() => {
    const round = number => Math.round(number * 100) / 100;
    const box = rect => ({ x: round(rect.x), y: round(rect.y + scrollY), width: round(rect.width), height: round(rect.height), right: round(rect.right), bottom: round(rect.bottom + scrollY) });
    const shown = element => {
      const style = getComputedStyle(element);
      return element.getClientRects().length && style.display !== 'none' && style.visibility !== 'hidden' && !element.closest('[hidden],details:not([open]) > :not(summary)');
    };
    const name = element => (element.getAttribute('aria-label') || (element.getAttribute('aria-labelledby') || '').split(/\s+/).map(id => document.getElementById(id)?.textContent || '').join(' ') || element.labels?.[0]?.textContent || element.getAttribute('alt') || element.textContent || element.getAttribute('title') || '').trim().replace(/\s+/g, ' ');
    const images = [...document.images].filter(shown).map(image => {
      const rect = image.getBoundingClientRect(), style = getComputedStyle(image);
      const paddingLeft = parseFloat(style.paddingLeft), paddingTop = parseFloat(style.paddingTop);
      const left = rect.left + image.clientLeft + paddingLeft, top = rect.top + image.clientTop + paddingTop;
      const width = image.clientWidth - paddingLeft - parseFloat(style.paddingRight), height = image.clientHeight - paddingTop - parseFloat(style.paddingBottom);
      const nw = image.naturalWidth, nh = image.naturalHeight;
      let sx = nw ? width / nw : 0, sy = nh ? height / nh : 0;
      if (style.objectFit === 'contain') sx = sy = Math.min(sx, sy);
      else if (style.objectFit === 'cover') sx = sy = Math.max(sx, sy);
      else if (style.objectFit === 'none') sx = sy = 1;
      else if (style.objectFit === 'scale-down') sx = sy = Math.min(1, sx, sy);
      const position = style.objectPosition.trim().split(/\s+/);
      const offset = (token, free) => token?.endsWith('%') ? free * parseFloat(token) / 100 : token?.endsWith('px') ? parseFloat(token) : free / 2;
      const objectLeft = left + offset(position[0], width - nw * sx), objectTop = top + offset(position[1] || '50%', height - nh * sy);
      const clip = { left, top, right: left + width, bottom: top + height };
      const clippingAncestors = [];
      for (let ancestor = image.parentElement; ancestor && !['BODY', 'HTML'].includes(ancestor.tagName); ancestor = ancestor.parentElement) {
        const parentStyle = getComputedStyle(ancestor), parentRect = ancestor.getBoundingClientRect();
        const clipX = /hidden|clip|auto|scroll/.test(parentStyle.overflowX), clipY = /hidden|clip|auto|scroll/.test(parentStyle.overflowY);
        if (clipX || clipY) {
          if (clipX) { clip.left = Math.max(clip.left, parentRect.left + ancestor.clientLeft); clip.right = Math.min(clip.right, parentRect.left + ancestor.clientLeft + ancestor.clientWidth); }
          if (clipY) { clip.top = Math.max(clip.top, parentRect.top + ancestor.clientTop); clip.bottom = Math.min(clip.bottom, parentRect.top + ancestor.clientTop + ancestor.clientHeight); }
          clippingAncestors.push({ tag: ancestor.tagName, class: ancestor.className, overflowX: parentStyle.overflowX, overflowY: parentStyle.overflowY });
        }
      }
      const source = nw && nh && sx && sy ? {
        x: round(Math.max(0, (clip.left - objectLeft) / sx)), y: round(Math.max(0, (clip.top - objectTop) / sy)),
        right: round(Math.min(nw, (clip.right - objectLeft) / sx)), bottom: round(Math.min(nh, (clip.bottom - objectTop) / sy)),
      } : null;
      if (source) { source.width = round(Math.max(0, source.right - source.x)); source.height = round(Math.max(0, source.bottom - source.y)); source.visibleAreaPercent = round(100 * source.width * source.height / (nw * nh)); }
      return { src: image.currentSrc || image.src, original: image.dataset.full || null, alt: image.alt, class: image.className, context: image.closest('figure')?.className || image.closest('.pkg')?.getAttribute('data-package') || '', natural: { width: nw, height: nh }, displayed: box(rect), contentBox: { x: round(left), y: round(top + scrollY), width: round(width), height: round(height) }, objectFit: style.objectFit, objectPosition: style.objectPosition, sourceVisible: source, clippingAncestors, broken: !image.complete || !nw, aspectDistortion: style.objectFit === 'fill' && nw && nh ? round(Math.abs((width / height) / (nw / nh) - 1)) : 0 };
    });
    const headings = [...document.querySelectorAll('h1,h2,h3')].filter(shown).map(heading => {
      const rect = heading.getBoundingClientRect(), range = document.createRange(); range.selectNodeContents(heading);
      const textRects = [...range.getClientRects()].filter(r => r.width > 0 && r.height > 0);
      const clippedBy = [];
      for (let ancestor = heading; ancestor && !['BODY', 'HTML'].includes(ancestor.tagName); ancestor = ancestor.parentElement) {
        const style = getComputedStyle(ancestor), parentRect = ancestor.getBoundingClientRect();
        if (textRects.some(r => (/hidden|clip/.test(style.overflowX) && (r.left < parentRect.left - 1 || r.right > parentRect.right + 1)) || (/hidden|clip/.test(style.overflowY) && (r.top < parentRect.top - 1 || r.bottom > parentRect.bottom + 1)))) clippedBy.push(ancestor.className || ancestor.tagName);
      }
      return { text: name(heading), tag: heading.tagName, box: box(rect), fontSize: getComputedStyle(heading).fontSize, textRects: textRects.map(box), horizontallyOutsideViewport: textRects.some(r => r.left < -1 || r.right > innerWidth + 1), clippedBy };
    });
    const controls = [...document.querySelectorAll('a[href],button,input:not([type=hidden]),select,textarea,summary')].filter(shown).map(control => ({ tag: control.tagName, type: control.getAttribute('type'), role: control.getAttribute('role'), name: name(control), class: control.className, href: control.getAttribute('href'), disabled: !!control.disabled, box: box(control.getBoundingClientRect()) }));
    const overflowElements = [...document.querySelectorAll('main *,header *,footer *')].filter(shown).map(element => ({ element, rect: element.getBoundingClientRect() })).filter(({ rect }) => rect.width > 0 && (rect.left < -1 || rect.right > innerWidth + 1)).map(({ element, rect }) => ({ tag: element.tagName, class: element.className, text: name(element).slice(0, 100), box: box(rect) })).slice(0, 40);
    const headingImageOverlaps = [];
    for (const heading of headings) for (const image of images) {
      if (!image.context || /brand-motif|logo|footer/.test(image.context)) continue;
      const x = Math.min(heading.box.right, image.displayed.right) - Math.max(heading.box.x, image.displayed.x);
      const y = Math.min(heading.box.bottom, image.displayed.bottom) - Math.max(heading.box.y, image.displayed.y);
      if (x > 2 && y > 2) headingImageOverlaps.push({ heading: heading.text, image: image.src, overlap: { width: round(x), height: round(y) } });
    }
    return { title: document.title, url: location.href, viewport: { width: innerWidth, height: innerHeight }, document: { width: document.documentElement.scrollWidth, height: document.documentElement.scrollHeight }, horizontalOverflow: document.documentElement.scrollWidth > innerWidth + 1, overflowElements, headings, headingImageOverlaps, controls, unnamedControls: controls.filter(control => !control.name), smallTargets: controls.filter(control => control.box.width < 24 || control.box.height < 24), images, brokenImages: images.filter(image => image.broken), canonical: document.querySelector('link[rel=canonical]')?.href, gallery: { framesInDOM: document.querySelectorAll('.pf-cell').length, visibleFrames: [...document.querySelectorAll('.pf-cell')].filter(shown).length, moreOpen: document.querySelector('.pf-more')?.open ?? null }, packages: [...document.querySelectorAll('.pkg')].filter(shown).map(card => ({ name: card.dataset.package, price: card.querySelector('.pkg__price')?.textContent, box: box(card.getBoundingClientRect()) })) };
  });
}

async function capture(page, filename, locator) {
  if (locator) await locator.screenshot({ path: `${output}/${filename}.jpg`, type: 'jpeg', quality: 85, animations: 'disabled' });
  else await page.screenshot({ path: `${output}/${filename}.jpg`, type: 'jpeg', quality: 85, fullPage: !/^(menu|lightbox)-/.test(filename), animations: 'disabled' });
}

async function checkInteraction(label, operation) {
  try { const result = await operation(); report.interactions.push({ label, ...result }); }
  catch (error) { report.interactions.push({ label, error: String(error) }); }
  save();
}

try {
  const api = await request.newContext();
  const response = await api.get(`${origin}/release.json?audit=${Date.now()}`, { timeout: 30000 });
  report.release = { status: response.status(), body: await response.text() };
  await api.dispose();
  try { report.release.json = JSON.parse(report.release.body); } catch {}
  for (const viewport of viewports) {
    const context = await browser.newContext({ viewport: { width: viewport.width, height: viewport.height }, deviceScaleFactor: 1, isMobile: viewport.width < 760 || viewport.label.includes('landscape'), hasTouch: viewport.width < 760 || viewport.label.includes('landscape'), reducedMotion: 'reduce' });
    const page = await context.newPage();
    let exceptions = [], failedRequests = [], resourceErrors = [], warnings = [];
    page.on('pageerror', error => exceptions.push(error.message));
    page.on('console', message => { if (['error', 'warning'].includes(message.type())) warnings.push({ type: message.type(), text: message.text().slice(0, 1000) }); });
    page.on('requestfailed', request => failedRequests.push({ url: request.url(), failure: request.failure()?.errorText }));
    page.on('response', response => { if (response.status() >= 400) resourceErrors.push({ url: response.url(), status: response.status() }); });
    for (const route of navOnly ? [] : routes) {
      exceptions = []; failedRequests = []; resourceErrors = []; warnings = [];
      try {
        const response = await page.goto(routeURL(route), { waitUntil: 'domcontentloaded', timeout: 45000 });
        if (!response?.ok()) throw new Error(`Document HTTP ${response?.status()}`);
        await settle(page);
        await page.evaluate(() => scrollTo(0, 0));
        await capture(page, `${route}-${viewport.label}`);
        report.pages.push({ route, viewport: viewport.label, screenshot: `${route}-${viewport.label}.jpg`, status: response.status(), ...await metrics(page), exceptions: [...exceptions], failedRequests: [...failedRequests], resourceErrors: [...resourceErrors], console: [...warnings] });
        console.log(`${route} ${viewport.label}: captured`);
        save();
        if (route === 'services' && [320, 390].includes(viewport.width)) {
          for (const tier of ['Starter', 'Essential', 'Signature', 'Social']) await checkInteraction(`package ${tier} ${viewport.label}`, async () => {
            await page.locator(`[name="package-view"][value="${tier}"]`).check();
            const card = page.locator(`.pkg[data-package="${tier}"]`);
            await card.scrollIntoViewIfNeeded();
            await page.waitForTimeout(250);
            await capture(page, `package-${tier.toLowerCase()}-${viewport.label}`, card);
            const state = await metrics(page);
            const cta = await card.locator('a.cta').evaluate(link => {
              const card = link.closest('.pkg'), rect = link.getBoundingClientRect(), cardRect = card.getBoundingClientRect();
              const range = document.createRange(); range.selectNodeContents(link);
              const textRect = range.getBoundingClientRect();
              const bounds = rect => ({ x: rect.x, y: rect.y, top: rect.top, right: rect.right, bottom: rect.bottom, width: rect.width, height: rect.height, documentTop: rect.top + scrollY, documentBottom: rect.bottom + scrollY });
              const clippingAncestors = [];
              for (let ancestor = link.parentElement; ancestor && !['HTML', 'BODY'].includes(ancestor.tagName); ancestor = ancestor.parentElement) {
                const style = getComputedStyle(ancestor), box = ancestor.getBoundingClientRect();
                const clipsX = /hidden|clip|auto|scroll/.test(style.overflowX) && (rect.left < box.left - 1 || rect.right > box.right + 1);
                const clipsY = /hidden|clip|auto|scroll/.test(style.overflowY) && (rect.top < box.top - 1 || rect.bottom > box.bottom + 1);
                if (clipsX || clipsY) clippingAncestors.push({ class: ancestor.className, overflowX: style.overflowX, overflowY: style.overflowY, box: bounds(box), clipsX, clipsY, hardClip: (clipsX && /hidden|clip/.test(style.overflowX)) || (clipsY && /hidden|clip/.test(style.overflowY)) });
              }
              const insideCard = rect.left >= cardRect.left - 1 && rect.right <= cardRect.right + 1 && rect.top >= cardRect.top - 1 && rect.bottom <= cardRect.bottom + 1;
              const textInsideControl = textRect.left >= rect.left - 1 && textRect.right <= rect.right + 1 && textRect.top >= rect.top - 1 && textRect.bottom <= rect.bottom + 1;
              return { control: bounds(rect), card: bounds(cardRect), text: bounds(textRect), viewport: { width: innerWidth, height: innerHeight }, insideCard, textInsideControl, clippingAncestors, actualClippingDetected: !insideCard || !textInsideControl || clippingAncestors.some(ancestor => ancestor.hardClip), fullyInsideViewport: rect.top >= 0 && rect.bottom <= innerHeight && rect.left >= 0 && rect.right <= innerWidth, elementScreenshotExtendsBeyondViewport: cardRect.top < 0 || cardRect.bottom > innerHeight };
            });
            let fullPageScreenshot = null, ctaViewportScreenshot = null;
            if (tier === 'Social') {
              fullPageScreenshot = `package-social-${viewport.label}-fullpage.jpg`;
              await capture(page, `package-social-${viewport.label}-fullpage`);
              await card.locator('a.cta').scrollIntoViewIfNeeded(); await page.waitForTimeout(200);
              ctaViewportScreenshot = `package-social-${viewport.label}-cta-viewport.jpg`;
              await page.screenshot({ path: `${output}/${ctaViewportScreenshot}`, type: 'jpeg', quality: 85, fullPage: false, animations: 'disabled' });
            }
            return { selected: await page.locator('[name="package-view"]:checked').inputValue(), screenshot: `package-${tier.toLowerCase()}-${viewport.label}.jpg`, fullPageScreenshot, ctaViewportScreenshot, cta, package: state.packages, images: state.images.filter(image => image.context.split(/\s+/).includes('pkg__fig')), headings: state.headings.filter(heading => heading.text === tier), horizontalOverflow: state.horizontalOverflow };
          });
        }
        if (route === 'portfolio' && [390, 1440].includes(viewport.width)) {
          const more = page.locator('.pf-more');
          if (await more.count()) await checkInteraction(`gallery disclosure ${viewport.label}`, async () => {
            await more.locator('summary').click(); await page.waitForTimeout(300); await settle(page);
            await capture(page, `portfolio-expanded-${viewport.label}`);
            const expanded = await metrics(page);
            await more.locator('summary').click(); await page.waitForTimeout(200);
            return { expandedVisibleFrames: expanded.gallery.visibleFrames, expandedScreenshot: `portfolio-expanded-${viewport.label}.jpg`, collapsedVisibleFrames: (await metrics(page)).gallery.visibleFrames };
          });
          await checkInteraction(`lightbox keyboard ${viewport.label}`, async () => {
            const opener = page.locator('.pf-cell').first();
            await opener.scrollIntoViewIfNeeded(); await opener.focus(); await page.keyboard.press('Enter');
            const dialog = page.locator('.lb'); await dialog.waitFor({ state: 'visible' });
            await dialog.locator('img').evaluate(image => image.decode());
            const initialSrc = await dialog.locator('img').getAttribute('src');
            const opensWithCloseFocused = await page.locator('.lb__x').evaluate(element => element === document.activeElement);
            await capture(page, `lightbox-${viewport.label}`);
            await page.keyboard.press('ArrowRight'); await dialog.locator('img').evaluate(image => image.decode());
            const steps = initialSrc !== await dialog.locator('img').getAttribute('src');
            await page.locator('.lb__stage').focus(); await page.keyboard.press('Tab');
            const trapsFocus = await page.locator('.lb__x').evaluate(element => element === document.activeElement);
            await page.keyboard.press('Escape');
            const restoresFocus = await opener.evaluate(element => element === document.activeElement);
            return { opensWithCloseFocused, steps, trapsFocus, closes: !await dialog.isVisible(), restoresFocus, screenshot: `lightbox-${viewport.label}.jpg` };
          });
        }
      } catch (error) {
        report.accessFailures.push({ route, viewport: viewport.label, error: String(error) });
        await capture(page, `failed-${route}-${viewport.label}`).catch(() => {}); save();
      }
    }
    if (viewport.width <= 1000 || viewport.width === 1440) {
      await checkInteraction(`navigation ${viewport.label}`, async () => {
        await page.goto(routeURL('home')); await settle(page); await page.evaluate(() => scrollTo(0, 0));
        const burger = page.locator('.burger'); let menu = null;
        if (await burger.isVisible()) {
          await burger.click(); await page.waitForTimeout(300);
          await capture(page, `menu-${viewport.label}`);
          const geometry = await page.locator('.site-nav').evaluate(nav => {
            const links = [...nav.querySelectorAll('a')].map(link => {
              const rect = link.getBoundingClientRect(), style = getComputedStyle(link);
              const x = rect.left + rect.width / 2, y = rect.top + rect.height / 2;
              const hit = document.elementFromPoint(x, y);
              const rendered = !!link.getClientRects().length && style.display !== 'none' && style.visibility !== 'hidden' && Number(style.opacity) > 0;
              const fullyInsideViewport = rect.left >= 0 && rect.top >= 0 && rect.right <= innerWidth && rect.bottom <= innerHeight;
              const centerHitsLink = !!hit && (hit === link || link.contains(hit));
              return { text: link.textContent.trim(), href: link.getAttribute('href'), rect: { left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom, width: rect.width, height: rect.height }, rendered, fullyInsideViewport, center: { x, y }, centerHitsLink, hitElement: hit ? { tag: hit.tagName, class: hit.className, text: hit.textContent?.trim().slice(0, 120) } : null, visible: rendered && fullyInsideViewport && centerHitsLink };
            });
            return { viewport: { width: innerWidth, height: innerHeight }, linkCount: links.length, allFiveLinksVisible: links.length === 5 && links.every(link => link.visible), links, navScroll: { top: nav.scrollTop, height: nav.scrollHeight, clientHeight: nav.clientHeight }, navBox: { top: nav.getBoundingClientRect().top, bottom: nav.getBoundingClientRect().bottom } };
          });
          // Retain the geometry even if a subsequent real navigation is blocked.
          report.interactions.push({ label: `menu geometry ${viewport.label}`, screenshot: `menu-${viewport.label}.jpg`, ...geometry }); save();
          const opens = await burger.getAttribute('aria-expanded') === 'true';
          const firstFocused = await page.locator('.site-nav a').first().evaluate(element => element === document.activeElement);
          await page.locator('.site-nav a').last().focus(); await page.keyboard.press('Tab');
          const trapsFocus = await burger.evaluate(element => element === document.activeElement);
          await page.keyboard.press('Escape');
          menu = { opens, firstFocused, trapsFocus, closes: await burger.getAttribute('aria-expanded') === 'false', restoresFocus: await burger.evaluate(element => element === document.activeElement), screenshot: `menu-${viewport.label}.jpg` };
          await burger.click();
        }
        await page.locator('.site-nav a[href="./services.html"]').click();
        await page.waitForURL('**/services.html'); await settle(page);
        const servicesReached = await page.locator('.services').isVisible();
        if (await page.locator('[name="package-view"]').count()) await page.locator('[name="package-view"][value="Social"]').check();
        await page.locator('.pkg[data-package="Social"] a').click();
        await page.waitForURL('**/contact.html?package=Social'); await settle(page);
        return { menu, servicesReached, socialBookingReached: await page.locator('#cform-kind').inputValue() === 'Social', selectedPackage: await page.locator('#cform-kind').inputValue(), socialContactURL: page.url(), formNotSubmitted: true };
      });
    }
    await context.close();
  }
} finally {
  report.completedAt = new Date().toISOString();
  report.summary = { pages: report.pages.length, horizontalOverflows: report.pages.filter(page => page.horizontalOverflow).length, brokenImages: report.pages.reduce((count, page) => count + page.brokenImages.length, 0), exceptions: report.pages.reduce((count, page) => count + page.exceptions.length, 0), headingClips: report.pages.reduce((count, page) => count + page.headings.filter(heading => heading.clippedBy.length || heading.horizontallyOutsideViewport).length, 0), interactionErrors: report.interactions.filter(result => result.error).length, accessFailures: report.accessFailures.length };
  save(); await browser.close(); console.log(JSON.stringify(report.summary));
}
if (report.accessFailures.length) process.exitCode = 1;
