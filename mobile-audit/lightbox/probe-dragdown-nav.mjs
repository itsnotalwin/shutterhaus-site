/**
 * A/B: what does a horizontal touch drag inside the lightbox do on a build
 * with no `touch-action` on the overlay?
 *
 * Suspected: Chrome claims the gesture as an overscroll history-back navigation,
 * which tears the lightbox out of the DOM mid-gesture. If so, `touch-action`
 * is load-bearing for swipe-to-advance, not cosmetic — without it a phone user
 * swipes the photo and gets navigated off the site.
 */
import { launch, phone } from "./cdp-lb.mjs";
const c = await launch();
await phone(c);
await c.goto("http://127.0.0.1:4174/#/portfolio", 2200);
await c.evaluate(`(() => {
  document.querySelector('.pf-cell img[data-full]')
    .dispatchEvent(new MouseEvent('click', { bubbles: true }));
})()`);
await new Promise((r) => setTimeout(r, 1500));
await c.evaluate(`window.__sentinel = 'alive'`);

const vw = await c.evaluate(`window.innerWidth`);
const vh = await c.evaluate(`window.innerHeight`);
const pt = (x, y) => [{ x, y, id: 1, radiusX: 12, radiusY: 12, force: 1 }];
const from = Math.round(vw * 0.15);
const to = Math.round(vw * 0.8);
await c.send("Input.dispatchTouchEvent", {
  type: "touchStart",
  touchPoints: pt(from, Math.round(vh / 2)),
});
for (let i = 1; i <= 14; i++) {
  await c.send("Input.dispatchTouchEvent", {
    type: "touchMove",
    touchPoints: pt(from + ((to - from) * i) / 14, Math.round(vh / 2)),
  });
}
await c.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
await new Promise((r) => setTimeout(r, 1800));

console.log(
  JSON.stringify(
    await c.evaluate(`(() => ({
      sentinel: window.__sentinel ?? 'GONE = document replaced (navigation)',
      lbPresent: !!document.querySelector('.lb'),
      href: location.href,
      touchAction: document.querySelector('.lb')
        ? getComputedStyle(document.querySelector('.lb')).touchAction
        : 'n/a',
    }))()`),
    null,
    2,
  ),
);
await c.close();
