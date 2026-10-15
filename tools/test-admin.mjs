import assert from 'node:assert/strict';
import test from 'node:test';
import {JSDOM} from 'jsdom';
import {adminBundle,photoFixture} from './admin-fixture.mjs';
const code=await adminBundle();
const fixture=await photoFixture();
const tick=()=>new Promise(resolve=>setImmediate(resolve));
async function boot(storage=null){
  const dom=new JSDOM('<div id="app"></div>',{url:'https://shutterhausvisuals.co.za/admin.html',runScripts:'outside-only'});
  const w=dom.window;w.structuredClone=structuredClone;w.scrollTo=()=>{};w.confirm=()=>true;
  w.__adminMock=structuredClone(fixture);
  if(storage)w.sessionStorage.setItem('shutterhaus-gallery-draft-v2:itsnotalwin@gmail.com',storage);
  w.eval(code);await tick();return dom;
}
const click=(w,sel)=>{assert.ok(w.document.querySelector(sel),sel);w.document.querySelector(sel).click();};
function change(w,sel,value){const el=w.document.querySelector(sel);el.value=value;el.dispatchEvent(new w.Event('change',{bubbles:true}));}

test('page controls reorder and remove photos only in a draft; failed publishing retains retry',async()=>{
  const dom=await boot();try{
    const w=dom.window;click(w,'[data-move="0|1"]');
    assert.equal(w.__adminMock.attempts,0);
    assert.match(w.document.getElementById('draft-status').textContent,/Unpublished/);
    click(w,'[data-remove="0"]');assert.equal(w.document.querySelectorAll('.editor-card').length,29);
    w.__adminMock.failPublish=true;click(w,'#admin-publish');await tick();
    assert.match(w.document.querySelector('.admin-notice').textContent,/Connection lost/);
    assert.equal(w.document.querySelectorAll('.editor-card').length,29);
    assert.equal(w.document.getElementById('admin-publish').disabled,false);
    w.__adminMock.failPublish=false;click(w,'#admin-publish');await tick();
    assert.equal(w.__adminMock.published.wall.length,29);
    assert.equal(w.__adminMock.published.wall[0],fixture.composition.wallRows.flat()[0]);
    assert.equal(w.sessionStorage.getItem('shutterhaus-gallery-draft-v2:itsnotalwin@gmail.com'),null);
    assert.match(w.document.getElementById('draft-status').textContent,/published/);
  }finally{dom.window.close();}
});

test('dragging reorders the real editor and restores an unpublished draft after reload',async()=>{
  const dom=await boot();let storage;
  try{
    const w=dom.window;const cards=[...w.document.querySelectorAll('.editor-card')];
    cards[0].dispatchEvent(new w.Event('dragstart',{bubbles:true,cancelable:true}));
    cards[3].dispatchEvent(new w.Event('drop',{bubbles:true,cancelable:true}));
    storage=w.sessionStorage.getItem('shutterhaus-gallery-draft-v2:itsnotalwin@gmail.com');
    const draft=JSON.parse(storage);assert.equal(draft.wall[3],fixture.composition.wallRows.flat()[0]);
    assert.equal(w.__adminMock.attempts,0);
  }finally{dom.window.close();}
  const next=await boot(storage);try{
    assert.match(next.window.document.querySelector('.admin-notice').textContent,/restored/);
    click(next.window,'#admin-publish');await tick();
    assert.equal(next.window.__adminMock.published.wall[3],fixture.composition.wallRows.flat()[0]);
  }finally{next.window.close();}
});

test('replacement, hidden-photo protection and descriptions survive draft edits',async()=>{
  const dom=await boot();try{
    const w=dom.window;click(w,'[data-change="0"]');
    const unused=fixture.photos.find(p=>!fixture.composition.wallRows.flat().includes(p.filename));
    click(w,`[data-add="${unused.filename}"]`);
    assert.equal(w.document.querySelector('.editor-card img').getAttribute('src'),unused.url);
    click(w,'[data-tab="library"]');
    const input=w.document.querySelector(`[data-alt="${unused.filename}"]`);
    input.value='A handwritten photo description';input.dispatchEvent(new w.Event('input',{bubbles:true}));
    click(w,`[data-hide="${fixture.composition.heroPhoto}"]`);
    assert.match(w.document.querySelector('.admin-notice').textContent,/different home hero/);
    assert.equal(w.document.querySelector(`[data-alt="${unused.filename}"]`).value,'A handwritten photo description');
    click(w,'#admin-publish');await tick();
    assert.equal(w.__adminMock.published.photos.find(p=>p.filename===unused.filename).alt,'A handwritten photo description');
  }finally{dom.window.close();}
});

test('home photo count is guarded and an empty portfolio can be published deliberately',async()=>{
  const dom=await boot();try{
    const w=dom.window;change(w,'#page-group','strip');click(w,'[data-open-library]');
    const unused=fixture.photos.find(p=>!fixture.composition.homeStrip.includes(p.filename));
    click(w,`[data-add="${unused.filename}"]`);
    assert.match(w.document.querySelector('.admin-notice').textContent,/six photos/);
    click(w,'[data-tab="pages"]');change(w,'#page-group','wall');
    for(let i=0;i<30;i++)click(w,'[data-remove="0"]');
    assert.match(w.document.querySelector('.admin-empty').textContent,/No photos/);
    click(w,'#admin-publish');await tick();assert.equal(w.__adminMock.published.wall.length,0);
  }finally{dom.window.close();}
});
