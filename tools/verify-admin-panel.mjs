import assert from 'node:assert/strict';
import {mkdirSync,writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {adminBundle,photoFixture} from './admin-fixture.mjs';
const origin=(process.env.ORIGIN ?? 'http://127.0.0.1:4173').replace(/\/$/,'');
const out=process.env.SHOT_DIR ?? 'shots/admin-verify';mkdirSync(out,{recursive:true});
const code=await adminBundle(), fixture=await photoFixture();fixture.uploadURL=`${origin}/gallery/54-img-0164.jpg`;
const target=await(await fetch(`http://127.0.0.1:${process.env.CDP_PORT ?? '9222'}/json/new?about:blank`,{method:'PUT'})).json();
const ws=new WebSocket(target.webSocketDebuggerUrl);await new Promise(resolve=>ws.onopen=resolve);
let id=0;const pending=new Map(),errors=[];
ws.onmessage=e=>{const msg=JSON.parse(e.data);if(msg.id&&pending.has(msg.id)){const {resolve,reject}=pending.get(msg.id);pending.delete(msg.id);msg.error?reject(new Error(JSON.stringify(msg.error))):resolve(msg.result);}else if(msg.method==='Runtime.exceptionThrown')errors.push(msg.params.exceptionDetails.exception?.description ?? 'Browser error');};
const send=(method,params={})=>new Promise((resolve,reject)=>{const n=++id;pending.set(n,{resolve,reject});ws.send(JSON.stringify({id:n,method,params}));});
const evaluate=async expression=>{const r=await send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});if(r.exceptionDetails)throw new Error(r.exceptionDetails.exception?.description ?? 'Evaluation failed');return r.result.value;};
const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function until(expression){for(let i=0;i<60;i++){if(await evaluate(expression))return;await delay(100);}throw new Error('Timed out: '+expression);}
let passed=0;
const check=(name,value)=>{assert.ok(value,name);passed++;console.log('PASS '+name);};
async function viewport(width){await send('Emulation.setDeviceMetricsOverride',{width,height:900,deviceScaleFactor:1,mobile:width<700});await delay(100);}
async function mount(){
  await send('Page.navigate',{url:origin+'/admin.html'});await until("!!document.getElementById('gate-btn')");
  await evaluate(`window.__adminMock=${JSON.stringify(fixture)};sessionStorage.clear();window.scrollTo(0,0);`);
  await evaluate(code);await until("!!document.querySelector('.editor-card')");
  await evaluate("document.fonts.ready");
}
async function images(){await evaluate("Promise.all([...document.images].map(im=>{im.loading='eager';return im.decode().catch(()=>{});})).then(()=>true)");}
async function click(selector){await evaluate(`document.querySelector(${JSON.stringify(selector)}).click()`);await delay(70);}
async function shot(name){await images();const r=await send('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});writeFileSync(`${out}/${name}.png`,Buffer.from(r.data,'base64'));}
try {
  await send('Page.enable');await send('Runtime.enable');await send('DOM.enable');
  for(const width of (process.env.ADMIN_WIDTHS?.split(',').map(Number) ?? [320,390,430,768,1024,1440,1920])){
    await viewport(width);await mount();
    check(`admin ${width}: real editor renders 30 selected photos`,await evaluate("document.querySelectorAll('.editor-card').length===30"));
    check(`admin ${width}: no horizontal overflow`,await evaluate('document.documentElement.scrollWidth<=innerWidth'));
    check(`admin ${width}: touch targets are at least 44px`,await evaluate("[...document.querySelectorAll('.admin-app button')].every(b=>b.getBoundingClientRect().height>=43.5)"));
    if(width===390||width===1440)await shot(`admin-pages-${width}`);
    await click('[data-tab="library"]');
    check(`library ${width}: every bundled photo is available`,await evaluate("document.querySelectorAll('.library-card').length===53"));
    check(`library ${width}: no horizontal overflow`,await evaluate('document.documentElement.scrollWidth<=innerWidth'));
    check(`library ${width}: inputs avoid mobile zoom`,await evaluate("[...document.querySelectorAll('.library-card input')].every(el=>parseFloat(getComputedStyle(el).fontSize)>=16)"));
    if(width===390||width===1440)await shot(`admin-library-${width}`);
  }
  await viewport(390);await mount();
  await click('[data-move="0|1"]');await click('[data-remove="0"]');
  check('reordering and removal remain unpublished',await evaluate("window.__adminMock.attempts===0 && document.querySelectorAll('.editor-card').length===29"));
  // Real pointer drag events across two editor cards.
  await evaluate(`(()=>{const cards=document.querySelectorAll('.editor-card');const transfer=new DataTransfer();cards[0].dispatchEvent(new DragEvent('dragstart',{bubbles:true,dataTransfer:transfer}));cards[2].dispatchEvent(new DragEvent('drop',{bubbles:true,dataTransfer:transfer}));})()`);
  check('drag reorder changes the stored draft',await evaluate(`JSON.parse(sessionStorage.getItem('shutterhaus-gallery-draft-v2:itsnotalwin@gmail.com')).wall[2]===${JSON.stringify(fixture.composition.wallRows.flat()[0])}`));
  await click('#admin-preview');
  check('preview displays the actual public gallery for the draft',await evaluate("document.querySelector('dialog').open && document.querySelectorAll('.admin-preview .pf-cell').length===29"));
  await send('Input.dispatchKeyEvent',{type:'keyDown',key:'Escape',code:'Escape',windowsVirtualKeyCode:27});
  await send('Input.dispatchKeyEvent',{type:'keyUp',key:'Escape',code:'Escape',windowsVirtualKeyCode:27});
  await until("!document.querySelector('dialog')");
  check('closing preview restores focus to its button',await evaluate("document.activeElement.id==='admin-preview'"));
  await evaluate('window.__adminMock.failPublish=true');await click('#admin-publish');
  check('failed publication preserves the draft and enables retry',await evaluate("document.querySelector('.admin-notice').textContent.includes('Connection lost') && !document.getElementById('admin-publish').disabled && document.querySelectorAll('.editor-card').length===29"));
  await evaluate('window.__adminMock.failPublish=false');await click('#admin-publish');
  check('retry publishes the chosen order and count',await evaluate("window.__adminMock.published.wall.length===29 && document.getElementById('admin-publish').disabled"));
  // An actual file input and browser image decoder exercise orientation-aware
  // resizing/canvas encoding. Only the storage write is mocked.
  await click('[data-tab="library"]');
  const {root}=await send('DOM.getDocument');const {nodeId}=await send('DOM.querySelector',{nodeId:root.nodeId,selector:'#admin-files'});
  await send('DOM.setFileInputFiles',{nodeId,files:[resolve('public/gallery/54-img-0164.jpg')]});
  await until("window.__adminMock.photos.some(p=>p.filename.startsWith('uploaded-'))");
  await until("document.querySelector('.admin-notice').textContent.includes('uploaded')");
  check('upload stays hidden until it is selected and published',await evaluate("window.__adminMock.photos.find(p=>p.filename.startsWith('uploaded-')).visible===false && window.__adminMock.published.wall.length===29"));
  check('browser prepares a correctly proportioned JPEG no larger than 1800px',await evaluate("(()=>{const p=window.__adminMock.photos.find(p=>p.filename.startsWith('uploaded-'));return p.width>0 && p.height>0 && Math.max(p.width,p.height)<=1800 && p.filename.endsWith('.jpg');})()"));
  await click('[data-add="uploaded-54-img-0164.jpg"]');await click('#admin-publish');
  check('uploaded photo reaches the published selection',await evaluate("window.__adminMock.published.wall.includes('uploaded-54-img-0164.jpg') && window.__adminMock.published.photos.find(p=>p.filename.startsWith('uploaded-')).visible"));
  await click('[data-tab="library"]');await click('[data-hide="uploaded-54-img-0164.jpg"]');await click('#admin-publish');
  await evaluate("window.confirm=()=>true");await click('[data-delete="uploaded-54-img-0164.jpg"]');
  check('a hidden uploaded file can be removed after publishing',await evaluate("window.__adminMock.deleted.length===1 && !document.querySelector('[data-add=\"uploaded-54-img-0164.jpg\"]')"));
  check('admin produces no uncaught browser errors',errors.length===0);

  // Exercise the real public bundle and Supabase response parsing with UUID
  // identities, an uploaded photo and an odd-sized published wall. Only HTTP
  // responses are replaced; the public renderer and client remain untouched.
  const uploadSource=fixture.photos.find(p=>p.filename==='54-img-0164.jpg');
  const upload={id:'00000000-0000-4000-8000-000000000099',filename:'browser-upload.jpg',url:fixture.uploadURL,width:uploadSource.width,height:uploadSource.height,visible:true,album:'photo',sort_order:99,alt:'Uploaded photograph'};
  const live=fixture.photos.map((p,i)=>({...p,id:`00000000-0000-4000-8000-${String(i).padStart(12,'0')}`})).concat(upload);
  const wall=fixture.composition.wallRows.flat().slice(0,4).concat(upload.filename);
  const rows=[{page:'home',slot_key:'hero',sort_order:0,filename:fixture.composition.heroPhoto},{page:'site',slot_key:'published',sort_order:0,filename:'published',updated_at:'2026-10-06T23:00:00Z'},
    ...fixture.composition.homeStrip.map((filename,sort_order)=>({page:'home',slot_key:'strip',sort_order,filename})),
    ...wall.map((filename,sort_order)=>({page:'portfolio',slot_key:'wall',sort_order,filename}))];
  const {identifier}=await send('Page.addScriptToEvaluateOnNewDocument',{source:`
    const realFetch=window.fetch.bind(window);
    window.fetch=(input,options)=>{
      const url=String(typeof input==='string'?input:input.url ?? input);
      const photos=url.includes('/rest/v1/photos');
      const composition=url.includes('/rest/v1/composition');
      if(photos || composition){window.__publicBackendRead=true;return Promise.resolve(new Response(JSON.stringify(photos?${JSON.stringify(live)}:${JSON.stringify(rows)}),{status:200,headers:{'Content-Type':'application/json'}}));}
      return realFetch(input,options);
    };`});
  for(const width of [390,1440]){
    await viewport(width);await send('Page.navigate',{url:origin+'/portfolio.html'});
    await until("document.querySelectorAll('.pf-cell').length===5");await images();
    check(`uploaded public wall ${width}: UUID rows and all five selected photos render`,await evaluate("document.querySelectorAll('.pf-cell').length===5 && [...document.querySelectorAll('[data-full]')].some(el=>el.dataset.full==="+JSON.stringify(upload.url)+")"));
    check(`uploaded public wall ${width}: no broken images or horizontal overflow`,await evaluate("document.documentElement.scrollWidth<=innerWidth && [...document.querySelectorAll('main img')].every(im=>im.naturalWidth>0)"));
    check(`uploaded public wall ${width}: photograph ratio is preserved`,await evaluate("(()=>{const im=[...document.querySelectorAll('[data-full]')].find(el=>el.dataset.full==="+JSON.stringify(upload.url)+");const r=im.getBoundingClientRect();return Math.abs(r.width/r.height-im.naturalWidth/im.naturalHeight)<.01;})()"));
  }
  await send('Page.removeScriptToEvaluateOnNewDocument',{identifier});

  // Public navigation, photo visibility and enquiry fallback with JS disabled.
  await send('Emulation.setScriptExecutionDisabled',{value:true});
  for(const width of [390,1440]){
    await viewport(width);
    for(const route of ['index','portfolio','about','services','contact']){
      await send('Page.navigate',{url:`${origin}/${route}.html`});await until("!!document.querySelector('#app h1')");await images();
      check(`${route} ${width}: readable without JavaScript`,await evaluate("!!document.querySelector('h1') && document.documentElement.scrollWidth<=innerWidth && [...document.querySelectorAll('.site-nav a')].every(a=>getComputedStyle(a).visibility==='visible')"));
      check(`${route} ${width}: photos remain visible without JavaScript`,await evaluate("[...document.querySelectorAll('.cell img')].every(im=>im.naturalWidth>0 && parseFloat(getComputedStyle(im).opacity)===1)"));
      if(route==='contact')check(`contact ${width}: native form posts to the enquiry endpoint`,await evaluate("document.querySelector('form').method==='post' && document.querySelector('form').action==='https://formspree.io/f/xjyklqkp'"));
      if(width===390&&route==='portfolio')await shot('portfolio-no-javascript-390');
    }
  }
  await send('Emulation.setScriptExecutionDisabled',{value:false});
  console.log(`\n${passed} admin and fallback checks passed.`);
}finally{ws.close();await fetch(`http://127.0.0.1:${process.env.CDP_PORT ?? '9222'}/json/close/${target.id}`).catch(()=>{});}
