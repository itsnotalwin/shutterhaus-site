/* ------------------------------------------------------------------
 * verify.mjs — assert the three fixes landed in the BUILT output.
 *
 * Reading the source proves the source was edited. The shipped artefact is
 * dist/, after the CSS minifier, and a token that is defined but never
 * consumed — or a max() the minifier mangled — is a defect that only shows
 * up after the build. So this greps dist/ and then measures the live page.
 * ------------------------------------------------------------------ */
import fs from 'node:fs';
import { newMobileTarget, nav, js } from '../cdp.mjs';

const DIST = 'C:\\Users\\Operations 3\\Documents\\HERMES\\01_Projects\\shutterhaus-site\\dist';
const BASE = process.env.BASE || 'http://127.0.0.1:4188/';

let fail = 0;
const ok = (c, m) => { console.log((c ? '  PASS  ' : '  FAIL  ') + m); if (!c) fail++; };

/* ---- 1. the built CSS actually contains the insets, with max() ----
 * Which file? Both stylesheets are emitted: main-*.css and store-*.css.
 * The order depends on which module imports the CSS first, and styles.css
 * landed in store-*.css in this build. Grepping a single guessed filename is
 * how this check reported 14 false failures against CSS that was present and
 * working, so it concatenates every emitted stylesheet instead. */
const cssFiles = fs.readdirSync(DIST + '/assets').filter((f) => f.endsWith('.css'));
const css = cssFiles.map((f) => fs.readFileSync(DIST + '/assets/' + f, 'utf8')).join('\n');
const html = fs.readFileSync(DIST + '/index.html', 'utf8');

console.log('\n--- built CSS (' + cssFiles.join(', ') + ') ---');
ok(html.includes('viewport-fit=cover'), 'index.html carries viewport-fit=cover');
// The build minifies, which removes every space inside calc() and after a
// colon. Each pattern below therefore matches the minified form; matching the
// pretty source is how a check passes on the repo and fails on the artefact.
const flat = css.replace(/\s+/g, '');
for (const side of ['top', 'bottom', 'left', 'right']) {
  const token = '--sa' + side[0];
  ok(flat.includes(`${token}:max(0px,env(safe-area-inset-${side}))`),
     `token ${token} = max(0px, env(safe-area-inset-${side})) survives the minifier`);
}
// Every consumer must be a calc() or a padding shorthand, never a bare
// `padding-top: env(...)` which a non-supporting browser would drop.
for (const [prop, re] of [
  ['header height', /height:calc\(var\(--head\)\+var\(--sat\)\)/],
  ['header padding-top', /padding:var\(--sat\)var\(--pad\)0/],
  ['mobile header pad', /padding:calc\(10px\+var\(--sat\)\)var\(--pad\)10px/],
  ['lightbox close top', /top:calc\(12px\+var\(--sat\)\)/],
  ['lightbox caption bottom', /bottom:calc\(18px\+var\(--sab\)\)/],
  ['body left/right/bottom inset', /padding-left:var\(--sal\)/],
  ['lightbox next right', /right:calc\(14px\+var\(--sar\)\)/],
]) ok(re.test(flat), prop + ' consumes the inset');
ok(/@media\(prefers-reduced-motion:reduce\)/.test(flat), 'prefers-reduced-motion block is in the built CSS');
ok(/transition-duration:\.01ms!important/.test(flat), 'reduced-motion forces 0.01ms transitions');

/* ---- 2. with a 0 inset the layout must be pixel-identical to before ----
 * env() resolves to 0 here, so any visual difference is a regression from
 * the refactor rather than the inset doing its job. */
const s = await newMobileTarget(393, 852, 3);
await nav(s, BASE, 6000);
await js(s, `return document.fonts.ready.then(()=>1);`);

console.log('\n--- computed insets at 393x852 (no iOS insets available here) ---');
const insets = await js(s, `
const cs = getComputedStyle(document.documentElement);
const b  = getComputedStyle(document.body);
const hd = getComputedStyle(document.querySelector('.site-header'));
return { sat: cs.getPropertyValue('--sat').trim(), sab: cs.getPropertyValue('--sab').trim(),
         sal: cs.getPropertyValue('--sal').trim(), sar: cs.getPropertyValue('--sar').trim(),
         bodyPadLeft: b.paddingLeft, bodyPadRight: b.paddingRight, bodyPadBottom: b.paddingBottom,
         headerHeight: hd.height, headerPadTop: hd.paddingTop, headerPadBottom: hd.paddingBottom };`);
console.log('  ' + JSON.stringify(insets));
ok(insets.bodyPadLeft === '0px' && insets.bodyPadRight === '0px' && insets.bodyPadBottom === '0px',
   'body insets compute to 0px with no env() support (no desktop shift)');

/* ---- 3. the lightbox controls, which were inside the Dynamic Island band ----
 * Two corrections over the first version, both learned the hard way:
 *  - the lightbox must be genuinely OPEN before its controls have a box;
 *    getBoundingClientRect on a closed .lb__x returns all zeroes.
 *  - a synthetic MouseEvent does not open it. lightbox.ts binds pointer
 *    handlers, so the tap has to come through CDP Input.dispatchTouchEvent,
 *    which is also the only way this emulates a real finger. */
await nav(s, BASE + '#/portfolio', 3000);
const cell = await js(s, `
const c = document.querySelector('.pf-cell');
if (!c) return null;
const b = c.getBoundingClientRect();
return { x: Math.round(b.left + b.width / 2), y: Math.round(b.top + b.height / 2) };`);
ok(!!cell, 'a portfolio frame is on screen to tap');
if (cell) {
  await s.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: cell.x, y: cell.y }] });
  await new Promise((r) => setTimeout(r, 90));
  await s.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await new Promise((r) => setTimeout(r, 1600));
}
const lb = await js(s, `
const lbEl = document.querySelector('.lb');
const open = !!(lbEl && !lbEl.hasAttribute('hidden') && lbEl.getClientRects().length);
const q = (sel) => { const e = document.querySelector(sel);
  if (!e || e.getClientRects().length === 0) return null;
  const b = e.getBoundingClientRect();
  return { top: Math.round(b.top), right: Math.round(innerWidth - b.right),
           bottom: Math.round(innerHeight - b.bottom), left: Math.round(b.left) }; };
return { open, close: q('.lb__x'), cap: q('.lb__cap'), next: q('.lb__nav--n'), vh: innerHeight };`);
console.log('  lightbox: ' + JSON.stringify(lb));
ok(lb.open, 'lightbox is open (so the control boxes below are real)');
ok(lb.close && lb.close.top >= 12, `close button top = ${lb.close ? lb.close.top : 'n/a'}px (>=12; was 18px, inside the 59px island band)`);
ok(lb.cap && lb.cap.bottom >= 18, `caption sits ${lb.cap ? lb.cap.bottom : 'n/a'}px above the bottom edge (>=18, clears the home indicator)`);
ok(lb.next && lb.next.right >= 14, `next control is ${lb.next ? lb.next.right : 'n/a'}px from the right edge (>=14)`);

/* ---- 4. reduced motion must actually zero the transitions ----
 * Elements are probed across the routes that actually contain them: .drop
 * is the admin upload zone and .tier__cta is on #/services, so asking for
 * them on the home route returns null and a null cannot prove anything.
 * Each entry is checked on the route that owns it. */
console.log('\n--- prefers-reduced-motion: reduce ---');
await s.send('Emulation.setEmulatedMedia', {
  features: [{ name: 'prefers-reduced-motion', value: 'reduce' }],
});

const PROBES = [
  { route: '#/',     sel: '.nav-link' },
  { route: '#/',     sel: '.social' },
  { route: '#/',     sel: '.burger__bars i' },
  { route: '#/',     sel: '.hero__body .cta' },
  { route: '#/portfolio', sel: '.cell img' },
  // .contact__list is on #/contact, not #/services — a probe on #/services
  // returned 0 matches, so this entry is scoped to the route that owns it.
  { route: '#/contact', sel: '.contact__list a' },
];
const rm = { matches: null, items: {} };
for (const p of PROBES) {
  await js(s, `location.hash = ${JSON.stringify(p.route)}; return 1;`);
  await new Promise((r) => setTimeout(r, 1100));
  const got = await js(s, `
  const e=document.querySelector(${JSON.stringify(p.sel)});
  if(!e) return null;
  const c=getComputedStyle(e);
  return { dur:c.transitionDuration, delay:c.transitionDelay };`);
  rm.matches = await js(s, `return matchMedia('(prefers-reduced-motion: reduce)').matches;`);
  rm.items[p.route + ' ' + p.sel] = got;
}
console.log('  ' + JSON.stringify(rm));
ok(rm.matches, 'media query is active in the emulated context');
for (const p of PROBES) {
  const k = p.route + ' ' + p.sel;
  const d = rm.items[k];
  ok(!!d && parseFloat(d.dur) <= 0.001, `${k} transition-duration = ${d ? d.dur : 'NOT FOUND'} (<=1ms)`);
}

// And the same elements must be UNCHANGED without the preference, or the
// block would be doing nothing at all.
await s.send('Emulation.setEmulatedMedia', { features: [] });
await new Promise((r) => setTimeout(r, 500));
const norm = await js(s, `const c=getComputedStyle(document.querySelector('.nav-link'));
  return { dur: c.transitionDuration };`);
ok(parseFloat(norm.dur) > 0.001, 'nav-link transition is ' + norm.dur + ' when motion is allowed (control)');

console.log(fail === 0 ? '\nALL CHECKS PASSED' : `\n${fail} CHECK(S) FAILED`);
s.close();
process.exit(fail === 0 ? 0 : 1);
