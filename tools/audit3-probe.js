(() => {
  const R = (el) => { const r = el.getBoundingClientRect(); return { x:+r.left.toFixed(1), y:+r.top.toFixed(1)+window.scrollY, w:+r.width.toFixed(1), h:+r.height.toFixed(1), r:+r.right.toFixed(1), b:+r.bottom.toFixed(1)+window.scrollY }; };
  const vw = document.documentElement.clientWidth;
  const N = (v) => (typeof v === 'number' && isFinite(v)) ? +v.toFixed(1) : null;

  // --- horizontal overflow ---
  const overflow = { docScrollW: document.documentElement.scrollWidth, vw, bodyScrollW: document.body.scrollWidth, culprits: [] };
  if (document.documentElement.scrollWidth > vw + 1) {
    for (const el of document.querySelectorAll('*')) {
      const r = el.getBoundingClientRect();
      if (r.right > vw + 1 || r.left < -1) {
        const cs = getComputedStyle(el);
        if (cs.position === 'fixed') continue;
        overflow.culprits.push({ sel: el.tagName.toLowerCase() + '.' + (typeof el.className==='string'?el.className:''), l:N(r.left), r:N(r.right), w:N(r.width) });
      }
    }
    overflow.culprits = overflow.culprits.slice(0, 25);
  }

  // --- per-section boxes ---
  const SEC = ['.hero','.hstrip','.hcta','.about','.services','.contact','.portfolio','.hstrip__grid','.pf-rows','.hcta__grid','.about__body','.contact__col','.pkgrow','.invest','.sterms','.cform','.shead','.phead','.about__prose','.about__fig','.contact__fig','.contact__list'];
  const sections = [];
  for (const s of SEC) {
    for (const el of document.querySelectorAll(s)) {
      const b = R(el), cs = getComputedStyle(el);
      sections.push({ sel: s, ...b, gutL:N(b.x), gutR:N(vw - b.r), maxW: cs.maxWidth, padL: cs.paddingLeft, padR: cs.paddingRight, mt: cs.marginTop, mb: cs.marginBottom, gap: cs.gap, justify: cs.justifyContent });
    }
  }

  // --- vertical rhythm ---
  const rhythm = [];
  const main = document.querySelector('main .page') || document.querySelector('main');
  if (main) {
    for (const ch of main.children) {
      const b = R(ch); rhythm.push({ sel: ch.tagName.toLowerCase()+'.'+(typeof ch.className==='string'?ch.className:''), y:N(b.y), h:N(b.h) });
    }
    for (let i=1;i<rhythm.length;i++) rhythm[i].gap = N(rhythm[i].y - (rhythm[i-1].y + rhythm[i-1].h));
  }
  const pageEl = document.querySelector('.page');
  const pageH = pageEl ? R(pageEl).h : 0;

  // --- typography ---
  const typeSizes = {};
  for (const el of document.querySelectorAll('p,h1,h2,h3,h4,li,a,span,button,input,select,textarea,label,dt,dd,small,figcaption')) {
    const isField = ['INPUT','SELECT','TEXTAREA'].includes(el.tagName);
    if (!el.textContent.trim() && !isField) continue;
    const cs = getComputedStyle(el);
    const key = el.tagName.toLowerCase() + '.' + (typeof el.className === 'string' && el.className ? el.className.trim().split(/\s+/)[0] : '');
    if (!typeSizes[key]) typeSizes[key] = { fs: cs.fontSize, lh: cs.lineHeight, ff: cs.fontFamily.split(',')[0].replace(/"/g,'').trim(), wgt: cs.fontWeight, ls: cs.letterSpacing, tt: cs.textTransform, n: 0, sample: el.textContent.trim().replace(/\s+/g,' ').slice(0,50) };
    typeSizes[key].n++;
  }

  // --- form fields ---
  const fields = [];
  for (const el of document.querySelectorAll('input,select,textarea,.cform button')) {
    const cs = getComputedStyle(el), b = R(el);
    fields.push({ tag: el.tagName.toLowerCase(), type: el.type||'', fs: cs.fontSize, h:N(b.h), w:N(b.w), pad: cs.padding, name: el.name||el.className||'', ph: el.placeholder||'', req: el.required });
  }

  // --- tap targets ---
  const taps = [];
  for (const el of document.querySelectorAll('a,button,input,select,textarea,[role=button]')) {
    const cs = getComputedStyle(el);
    if (cs.display === 'none' || cs.visibility === 'hidden' || cs.opacity === '0') continue;
    const b = el.getBoundingClientRect();
    if (b.width === 0 && b.height === 0) continue;
    let clipped = false;
    for (let p = el.parentElement; p; p = p.parentElement) {
      const pc = getComputedStyle(p);
      if (pc.display === 'none' || pc.visibility === 'hidden' || pc.opacity === '0') { clipped = true; break; }
    }
    taps.push({ tag: el.tagName.toLowerCase(), cls: typeof el.className==='string'?el.className.trim():'', txt: (el.textContent||el.placeholder||'').trim().replace(/\s+/g,' ').slice(0,32),
      w:N(b.width), h:N(b.height), x:N(b.left), y:N(b.top+window.scrollY), clipped, href: el.getAttribute('href')||'' });
  }

  // --- images ---
  const images = [];
  for (const img of document.querySelectorAll('img')) {
    const b = R(img), cs = getComputedStyle(img);
    images.push({ src: (img.currentSrc||img.src||'').split('/').pop().slice(0,52), alt: img.alt,
      bw:N(b.width), bh:N(b.height), nw: img.naturalWidth, nh: img.naturalHeight,
      aw: img.getAttribute('width'), ah: img.getAttribute('height'),
      loading: img.getAttribute('loading'), decoding: img.getAttribute('decoding'), fp: img.getAttribute('fetchpriority'),
      fit: cs.objectFit, pos: cs.objectPosition, complete: img.complete,
      upscaled: img.naturalWidth > 0 && b.width > img.naturalWidth + 1,
      distorted: img.naturalWidth > 0 && img.naturalHeight > 0 && b.height > 0 && Math.abs((b.width/b.height) - (img.naturalWidth/img.naturalHeight)) > 0.06 });
  }

  // --- measure (line length) ---
  const measures = [];
  for (const el of document.querySelectorAll('p,li,dd,h1,h2,h3')) {
    const txt = el.textContent.trim(); if (txt.length < 40) continue;
    const rng = document.createRange(); rng.selectNodeContents(el);
    const rects = [...rng.getClientRects()].filter(r => r.width > 4);
    if (!rects.length) continue;
    const widest = Math.max(...rects.map(r => r.width));
    const blockW = el.getBoundingClientRect().width || widest;
    const cpl = Math.round((widest / blockW) * txt.length);
    measures.push({ cls: (typeof el.className==='string' && el.className ? el.className.trim().split(/\s+/)[0] : el.tagName.toLowerCase()), tag: el.tagName.toLowerCase(),
      blockW:N(blockW), widestLine:N(widest), lines: rects.length, approxCPL: Math.min(cpl, txt.length), sample: txt.replace(/\s+/g,' ').slice(0,55) });
  }

  // --- orphan / short last lines ---
  const wraps = [];
  for (const el of document.querySelectorAll('p,h1,h2,h3,li,a,figcaption')) {
    const rng = document.createRange(); rng.selectNodeContents(el);
    const rects = [...rng.getClientRects()].filter(r => r.width > 4);
    if (rects.length < 2) continue;
    const last = rects[rects.length-1];
    const blockW = el.getBoundingClientRect().width || 1;
    const lastW = last.width, lastFrac = lastW / blockW;
    if (lastW < 45 || lastFrac < 0.15) {
      const t = el.textContent.trim();
      wraps.push({ cls: (typeof el.className==='string' && el.className ? el.className.trim().split(/\s+/)[0] : el.tagName.toLowerCase()), tag: el.tagName.toLowerCase(),
        lines: rects.length, lastLineW:N(lastW), lastFracPct:Math.round(lastFrac*100), tail: t.split(/\s+/).slice(-2).join(' '), full: t.replace(/\s+/g,' ').slice(0,70) });
    }
  }

  return { vw, docH: document.documentElement.scrollHeight, overflow, sections, rhythm, pageH, typeSizes, fields, taps, images, measures, wraps };
})()
