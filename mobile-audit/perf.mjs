import { newMobileTarget, nav, js, Session, httpJson, shot } from './cdp.mjs';
import fs from 'node:fs';
const BASE = 'https://shutterhausvisuals.co.za/';
const OUTF = 'C:\\Users\\Operations 3\\Documents\\HERMES\\01_Projects\\shutterhaus-site\\mobile-audit\\';
const s = await newMobileTarget(393, 852, 3);
const out = {};

// ============ PERF: cold load of the home route, 4G-ish throttling OFF (raw) then throttled
async function perfLoad(label, route, throttle) {
  const t = await httpJson(`/json/new?about:blank`, 'PUT');
  const ps = await Session.attach(t.webSocketDebuggerUrl);
  for (const d of ['Page','Runtime','Log','Network','Performance']) { try { await ps.send(d+'.enable'); } catch(e){} }
  await ps.send('Emulation.setDeviceMetricsOverride', { width:393, height:852, deviceScaleFactor:3, mobile:true });
  await ps.send('Network.setCacheDisabled', { cacheDisabled: true });
  if (throttle) {
    await ps.send('Network.emulateNetworkConditions', { offline:false, latency:150, downloadThroughput: 1.6*1024*1024/8, uploadThroughput: 750*1024/8 });
    await ps.send('Emulation.setCPUThrottlingRate', { rate: 4 });
  }
  await ps.send('Emulation.setUserAgentOverride', { userAgent:'Mozilla/5.0 (iPhone; CPU iPhone OS 27_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/27.0 Mobile/15E148 Safari/604.1', platform:'iPhone' });
  // Install the LCP observer on about:blank so it survives the cross-document navigation.
  await ps.send('Page.addScriptToEvaluateOnNewDocument', { source: `
    window.__lcp=0; window.__lcpEl=null; window.__cls=0;
    new PerformanceObserver((l)=>{ for(const e of l.getEntries()){ window.__lcp=e.startTime; window.__lcpEl = e.element ? (e.element.tagName + (e.element.className ? '.'+String(e.element.className).trim().split(/\\s+/)[0] : '') + ' src=' + (e.element.currentSrc||e.element.src||'').split('/').pop().slice(0,40) + ' ' + Math.round(e.size)+'px') : '?'; } }).observe({type:'largest-contentful-paint', buffered:true});
    new PerformanceObserver((l)=>{ for(const e of l.getEntries()) if(!e.hadRecentInput) window.__cls += e.value; }).observe({type:'layout-shift', buffered:true});
  `});
  await ps.send('Page.navigate', { url: BASE + route });
  await new Promise(r=>setTimeout(r, 12000));
  // scroll a little to force any lazy content into the LCP race, then settle
  await js(ps, `window.scrollTo(0,1); return 1;`);
  await new Promise(r=>setTimeout(r, 1500));
  await js(ps, `window.scrollTo(0,0); return 1;`);
  await new Promise(r=>setTimeout(r, 800));
  const res = await js(ps, `
  const nav=performance.getEntriesByType('navigation')[0]||{};
  const paints=Object.fromEntries(performance.getEntriesByType('paint').map(p=>[p.name, Math.round(p.startTime)]));
  let lcp=null, lcpEl=null;
  for(const e of performance.getEntriesByType('largest-contentful-paint')){ lcp=Math.round(e.startTime); lcpEl=e.element? (e.element.tagName+(e.element.className?'.'+String(e.element.className).split(' ')[0]:'')) : null; }
  // fallback LCP via observer already fired entries
  const lcpFinal = lcp ?? (window.__lcp ?? null);
  const res=performance.getEntriesByType('resource');
  const totalBytes=res.reduce((a,r)=>a+(r.transferSize||0),0);
  const byType={}; for(const r of res){const k=(r.initiatorType||'other'); byType[k]=(byType[k]||0)+(r.transferSize||0);}
  const top10=[...res].sort((a,b)=>(b.transferSize||0)-(a.transferSize||0)).slice(0,12).map(r=>({n:r.name.split('/').pop().slice(0,50),t:r.initiatorType,kb:Math.round((r.transferSize||0)/102.4)/10,ms:Math.round(r.duration)}));
  const fonts=[...document.fonts].map(f=>f.family+' '+f.weight+' '+f.style+' '+f.status);
  return {
    paints, lcp:lcpFinal, lcpEl,
    lcpObserved: Math.round(window.__lcp||0), lcpElObserved: window.__lcpEl, cls: +(window.__cls||0).toFixed(4),
    ttfb: Math.round(nav.responseStart||0), domContentLoaded: Math.round(nav.domContentLoadedEventEnd||0),
    loadEvent: Math.round(nav.loadEventEnd||0), domInteractive: Math.round(nav.domInteractive||0),
    transferSize: nav.transferSize, encodedBody: nav.encodedBodySize, decodedBody: nav.decodedBodySize,
    resources: res.length, totalKB: Math.round(totalBytes/102.4)/10, byType, top10, fonts,
    imgs: document.images.length, imgsLoaded: [...document.images].filter(i=>i.complete&&i.naturalWidth>0).length,
    dpr: devicePixelRatio, vw: innerWidth,
  };`);
  await ps.close();
  await fetch(`http://127.0.0.1:9335/json/close/${t.id}`);
  return res;
}

out.perfColdUnthrottled = await perfLoad('cold','#/home',false);
out.perfColdSlow4G = await perfLoad('slow4g','#/home',true);
out.perfPortfolioSlow4G = await perfLoad('portfolio','#/portfolio',true);
console.log('PAINTS cold', JSON.stringify(out.perfColdUnthrottled.paints), 'LCP', out.perfColdUnthrottled.lcp, out.perfColdUnthrottled.lcpEl, 'totalKB', out.perfColdUnthrottled.totalKB, 'res', out.perfColdUnthrottled.resources);
console.log('PAINTS slow4g', JSON.stringify(out.perfColdSlow4G.paints), 'LCP', out.perfColdSlow4G.lcp, out.perfColdSlow4G.lcpEl, 'TTFB', out.perfColdSlow4G.ttfb, 'totalKB', out.perfColdSlow4G.totalKB, 'imgsLoaded', out.perfColdSlow4G.imgsLoaded+'/'+out.perfColdSlow4G.imgs);
console.log('FONTS', JSON.stringify(out.perfColdSlow4G.fonts));
fs.writeFileSync(OUTF+'perf.json', JSON.stringify(out,null,1));
s.close(); process.exit(0);
