import { connect, newPage, device, goto, evalJs, shot, sleep, SITE } from "./fn1-cdp.mjs";
import { writeFileSync } from "node:fs";
const OUT = "C:\\Users\\Operations 3\\Documents\\HERMES\\01_Projects\\shutterhaus-site\\mobile-audit\\";
const ROUTES = ["home", "portfolio", "about", "services", "contact"];
const conn = await connect();
const out = {};

// ---- viewport meta ----
{
  const page = await newPage(conn);
  await device(page, 320, 568, 3, true);
  await goto(page, SITE + "#/home");
  out.viewportMeta = await evalJs(page, `(() => {
    const m = document.querySelector('meta[name=viewport]');
    return { content: m ? m.getAttribute('content') : 'MISSING',
             innerWidth: innerWidth, clientW: document.documentElement.clientWidth,
             visualViewportW: visualViewport ? visualViewport.width : null,
             themeColor: !!document.querySelector('meta[name=theme-color]') };
  })()`);
  console.log("viewport:", JSON.stringify(out.viewportMeta));
  page.dispose();
}

// ---- FORMS ----
out.forms = {};
for (const [label, w, h] of [["393", 393, 852], ["320", 320, 568]]) {
  const page = await newPage(conn);
  await device(page, w, h, 3, true);
  await goto(page, SITE + "#/contact");
  await sleep(1100);
  const f = await evalJs(page, `(() => {
    const form = document.getElementById('cform');
    if (!form) return 'NO FORM';
    const fields = Array.from(form.querySelectorAll('input, select, textarea')).map(el => {
      const r = el.getBoundingClientRect();
      const cs = getComputedStyle(el);
      const lab = el.labels && el.labels.length ? el.labels[0] : null;
      const labCS = lab ? getComputedStyle(lab) : null;
      const ph = el.getAttribute('placeholder');
      const aria = el.getAttribute('aria-label');
      return {
        tag: el.tagName, id: el.id, name: el.name, type: el.type || null,
        rect: {x:Math.round(r.left),y:Math.round(r.top),w:Math.round(r.width),h:Math.round(r.height)},
        fontSize: cs.fontSize, padding: cs.padding, fontFamily: cs.fontFamily.slice(0,40),
        required: el.required, autocomplete: el.getAttribute('autocomplete'),
        inputmode: el.getAttribute('inputmode'),
        hasLabel: !!lab, labelText: lab ? lab.textContent.trim().slice(0,30) : null,
        labelDisplay: labCS ? labCS.display : null,
        labelFontSize: labCS ? labCS.fontSize : null,
        placeholder: ph ? ph.slice(0,24) : null, ariaLabel: aria,
        isSubmittable: el.type !== 'hidden'
      };
    });
    const btns = Array.from(form.querySelectorAll('button, input[type=submit]')).map(b => {
      const r = b.getBoundingClientRect();
      const cs = getComputedStyle(b);
      return { tag:b.tagName, type:b.type||null, text:(b.textContent||b.value||'').trim().slice(0,40),
               rect:{w:Math.round(r.width),h:Math.round(r.height)}, fontSize: cs.fontSize, disabled: b.disabled };
    });
    const fr = form.getBoundingClientRect();
    const cs = getComputedStyle(form);
    return { formRect:{x:Math.round(fr.left),w:Math.round(fr.width)}, fontSize: cs.fontSize,
             fields, buttons: btns,
             scrollW: document.documentElement.scrollWidth, innerW: innerWidth,
             formOverflow: Math.round(fr.right) > innerWidth };
  })()`);
  out.forms[label] = f;
  console.log(`\n=== CONTACT FORM @${label}px`);
  if (f === 'NO FORM') { console.log("NO FORM"); }
  else {
    console.log(`form w=${f.formRect.w} overflowRight=${f.formOverflow} scrollW=${f.scrollW}/${f.innerW}`);
    f.fields.forEach(x => console.log(`  ${x.tag}#${x.id} ${x.rect.w}x${x.rect.h} font=${x.fontSize} label=${x.hasLabel?'"'+x.labelText+'"':'NONE'} labelDisplay=${x.labelDisplay} labelFont=${x.labelFontSize} ph=${x.placeholder} required=${x.required} ac=${x.autocomplete} im=${x.inputmode}`));
    f.buttons.forEach(b => console.log(`  BTN ${b.tag}[${b.type}] "${b.text}" ${b.rect.w}x${b.rect.h} font=${b.fontSize}`));
  }
  out.forms[label + "_shot"] = await shot(page, `fn1-form-${label}.png`);
  page.dispose();
}

// ---- contact page: tap targets + socials/links ----
{
  const page = await newPage(conn);
  await device(page, 393, 852, 3, true);
  await goto(page, SITE + "#/contact");
  await sleep(900);
  out.contactLinks = await evalJs(page, `Array.from(document.querySelectorAll('a[href]')).map(a=>{const r=a.getBoundingClientRect(); const cs=getComputedStyle(a); return {text:a.textContent.trim().slice(0,40), href:a.getAttribute('href'), target:a.getAttribute('target'), rel:a.getAttribute('rel'), w:Math.round(r.width), h:Math.round(r.height), fontSize:cs.fontSize, visible: cs.visibility!=='hidden'};})`);
  console.log("\ncontact links:", JSON.stringify(out.contactLinks, null, 1).slice(0, 1200));
  page.dispose();
}
writeFileSync(OUT + "fn1-forms.json", JSON.stringify(out, null, 2));
conn.close();
process.exit(0);