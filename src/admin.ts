import './styles.css';
import './editorial.css';
import './makeover.css';
import './admin.css';
import { SITE, setLiveHome } from './config';
import { escapeHtml as esc, icon } from './layout';
import { isAdmin, signInWithGoogle, signOut, getSession, isSupabaseConfigured } from './supabase';
import { listAllPhotos, uploadPhoto, deletePhoto } from './store';
import { readComposition, publishGallery } from './composition';
import { mergePhotos, fallbackComposition, validateDraft, move, type GalleryDraft } from './gallery-model';
import { portfolioPage, homePage } from './pages';
import { setLiveRows } from './rows';

const app = document.getElementById('app')!;
type Group = 'hero' | 'strip' | 'wall';
let draft: GalleryDraft;
let account = '';
let tab: 'pages' | 'library' = 'pages';
let group: Group = 'wall';
let destination: Group = 'wall';
let search = '';
let filter = 'all';
let busy = false;
let dirty = false;
let target: {group: Group; index: number} | null = null;
let dragged: {group: Group | 'library'; index: number} | null = null;
let notice = '';
let errorNotice = false;
const clone = <T>(value: T): T => structuredClone(value);
const key = () => `shutterhaus-gallery-draft-v2:${account}`;
const label = (g: Group) => g === 'wall' ? 'Portfolio' : g === 'strip' ? 'Home photos' : 'Home hero';
const sequence = (g: Group) => g === 'hero' ? [draft.hero] : draft[g];
const photo = (file: string) => draft.photos.find(p => p.filename === file);

function persist(): void {
  dirty = true;
  try { sessionStorage.setItem(key(),JSON.stringify(draft)); } catch { /* Edits remain in memory. */ }
}
function forget(): void { try { sessionStorage.removeItem(key()); } catch { /* optional */ } }
function flash(message: string, error = false): void { notice = message; errorNotice = error; paint(); }
function mutate(action: () => void, message = 'Draft updated. Publish when you’re ready.'): void {
  if (busy) return;
  action(); persist(); flash(message);
}
function fileCard(file: string, index: number): string {
  const p = photo(file);
  if (!p) return '';
  return `<article class="editor-card" draggable="true" data-drag="${group}|${index}" data-drop="${group}|${index}">
    <button type="button" class="editor-card__image" data-change="${index}" aria-label="Replace photo ${index+1}"><img src="${esc(p.url)}" alt="${esc(p.alt || p.filename)}" loading="lazy" /><span>${index+1}</span></button>
    <div class="editor-card__actions">
      ${group === 'hero' ? '' : `<button type="button" data-move="${index}|-1" aria-label="Move photo ${index+1} earlier" ${index===0?'disabled':''}>←</button><button type="button" data-move="${index}|1" aria-label="Move photo ${index+1} later" ${index===sequence(group).length-1?'disabled':''}>→</button>`}
      <button type="button" data-change="${index}">Replace</button>
      ${group==='hero' ? '' : `<button type="button" data-remove="${index}" aria-label="Remove photo ${index+1} from ${label(group)}">Remove</button>`}
    </div>
  </article>`;
}
function editor(): string {
  const files = sequence(group);
  return `<div class="admin-section-head"><div><h2>${label(group)}</h2><p>${group==='hero'?'The first photograph on your home page.':group==='strip'?'Up to six photographs below the hero.':'Drag to reorder, or use the arrow buttons.'}</p></div>
    <div class="admin-field"><label for="page-group">Edit section</label><select id="page-group">${(['wall','strip','hero'] as Group[]).map(g=>`<option value="${g}" ${group===g?'selected':''}>${label(g)}</option>`).join('')}</select></div></div>
    <div class="editor-grid ${group==='hero'?'editor-grid--hero':''}">${files.map(fileCard).join('')}</div>
    ${!files.length?'<p class="admin-empty">No photos selected. Add a photo from your library.</p>':''}
    <div class="admin-editor-footer"><span>${files.length} photo${files.length===1?'':'s'}</span><button type="button" data-open-library>Add ${group==='hero'?'or replace a photo':'photos'} +</button></div>`;
}
function libraryCards(): string {
  const files = draft.photos.filter(p => (!search || `${p.filename} ${p.alt}`.toLowerCase().includes(search.toLowerCase())) && (filter==='all'||(filter==='available'?p.visible:!p.visible)));
  return files.map(p=>{
    const index = draft.photos.indexOf(p);
    const uploaded = /^https?:\/\//.test(p.url);
    const selected = p.filename===draft.hero || draft.strip.includes(p.filename) || draft.wall.includes(p.filename);
    return `<article class="library-card ${p.visible?'':'is-hidden'}" draggable="true" data-drag="library|${index}" data-drop="library|${index}">
      <div class="library-card__image"><img src="${esc(p.url)}" alt="${esc(p.alt || p.filename)}" loading="lazy" /><span>${selected?'Selected':p.visible?'Available':'Hidden'}</span></div>
      <div class="library-card__body"><label>Photo description<input type="text" data-alt="${esc(p.filename)}" value="${esc(p.alt ?? '')}" placeholder="Describe this photograph" /></label>
      <div class="library-card__actions"><button type="button" data-add="${esc(p.filename)}">${target?'Choose':destination==='hero'?'Use as hero':'Add'}</button>
        <button type="button" data-hide="${esc(p.filename)}">${p.visible?'Hide':'Unhide'}</button>
        ${uploaded?`<button type="button" class="admin-danger" data-delete="${esc(p.filename)}">Delete file</button>`:''}</div>
      <p>${uploaded?'Uploaded':'Original'} · ${p.width ?? '?'} × ${p.height ?? '?'}</p></div></article>`;
  }).join('') || '<p class="admin-empty">No photos match your search.</p>';
}
function library(): string {
  return `<div class="admin-section-head"><div><h2>Photo library</h2><p>Choose photos for a page, edit their descriptions, or hide them from selection.</p></div>
    <div class="admin-field"><label for="destination">Add to</label><select id="destination">${(['wall','strip','hero'] as Group[]).map(g=>`<option value="${g}" ${destination===g?'selected':''}>${label(g)}</option>`).join('')}</select></div></div>
    ${target?`<div class="admin-selection">Choose a replacement for ${label(target.group)}, photo ${target.index+1}. <button type="button" id="cancel-pick">Cancel</button></div>`:''}
    <div class="admin-library-tools"><label>Find a photo<input type="search" id="photo-search" value="${esc(search)}" placeholder="Search descriptions or filenames" /></label><label>Show<select id="photo-filter"><option value="all">All photos</option><option value="available" ${filter==='available'?'selected':''}>Available</option><option value="hidden" ${filter==='hidden'?'selected':''}>Hidden</option></select></label></div>
    <div class="library-grid">${libraryCards()}</div>`;
}
function paint(): void {
  const position = scrollY;
  const active = document.activeElement as HTMLInputElement | null;
  const activeAlt = active?.dataset.alt;
  const selection = activeAlt ? [active?.selectionStart, active?.selectionEnd] : null;
  app.innerHTML = `<div class="admin-app">
    <header class="admin-header"><a class="admin-brand" href="./index.html">Shutterhaus<span>Photo manager</span></a><div class="admin-header-actions"><a href="./index.html" target="_blank" rel="noopener">View live site</a><button type="button" id="admin-out">Sign out</button></div></header>
    <main class="admin-main"><div class="admin-intro"><div><p class="admin-eyebrow">Your website</p><h1>Manage photos.</h1><p>Upload to your library. Arrange the pages. Publish when they’re ready.</p></div><span class="admin-count">${draft.photos.length} photos</span></div>
    <div class="admin-publish"><span id="draft-status" role="status">${busy?'Working…':dirty?'Unpublished changes':'All changes published'}</span><div><button type="button" id="admin-discard" ${busy||!dirty?'disabled':''}>Discard draft</button><button type="button" id="admin-preview" ${busy?'disabled':''}>Preview</button><button type="button" class="admin-primary" id="admin-publish" ${busy||!dirty?'disabled':''}>Publish changes</button></div></div>
    <p class="admin-notice ${errorNotice?'admin-notice--error':''}" role="status" aria-live="polite">${esc(notice)}</p>
    ${tab==='library' ? `<label class="admin-upload ${busy?'is-busy':''}" id="admin-drop" for="admin-files"><span class="admin-upload__icon">+</span><span><strong>Add photos</strong><small>Drop files here or choose from your device. Uploads stay off the pages until you publish.</small></span><input id="admin-files" type="file" accept="image/*" multiple ${busy?'disabled':''} /><span class="admin-progress" id="upload-progress" role="status"></span></label>` : ''}
    <nav class="admin-tabs" aria-label="Photo manager"><button type="button" data-tab="pages" aria-pressed="${tab==='pages'}">Page editor</button><button type="button" data-tab="library" aria-pressed="${tab==='library'}">Photo library</button></nav>
    <section class="admin-workspace" ${busy?'inert':''}>${tab==='pages'?editor():library()}</section>
    <p class="admin-footnote">${esc(SITE.contact.location)} · Travel included within 25km. <a href="./services.html" target="_blank" rel="noopener">View prices</a></p>
    </main></div>`;
  wire();
  if (activeAlt) {
    const replacement = [...document.querySelectorAll<HTMLInputElement>('[data-alt]')].find(input=>input.dataset.alt===activeAlt);
    replacement?.focus({preventScroll:true});
    if (selection) replacement?.setSelectionRange(selection[0] ?? null,selection[1] ?? null);
  }
  scrollTo(0,position);
}

function wire(): void {
  document.getElementById('admin-out')?.addEventListener('click',()=>void run(async()=>{
    if (dirty && !confirm('Sign out with an unpublished draft? It will be kept in this tab.')) return;
    await signOut(); location.reload();
  }));
  document.querySelectorAll<HTMLButtonElement>('[data-tab]').forEach(b=>b.onclick=()=>{ if(busy)return;tab=b.dataset.tab as typeof tab;target=null;paint(); });
  document.getElementById('page-group')?.addEventListener('change',e=>{group=(e.target as HTMLSelectElement).value as Group;paint();});
  document.getElementById('destination')?.addEventListener('change',e=>{destination=(e.target as HTMLSelectElement).value as Group;target=null;paint();});
  document.querySelector('[data-open-library]')?.addEventListener('click',()=>{destination=group;tab='library';paint();});
  document.getElementById('cancel-pick')?.addEventListener('click',()=>{target=null;tab='pages';paint();});
  document.querySelectorAll<HTMLButtonElement>('[data-change]').forEach(b=>b.onclick=()=>{target={group,index:Number(b.dataset.change)};destination=group;tab='library';paint();});
  document.querySelectorAll<HTMLButtonElement>('[data-move]').forEach(b=>b.onclick=()=>{
    const [i,d]=b.dataset.move!.split('|').map(Number); mutate(()=>move(sequence(group),i,i+d));
  });
  document.querySelectorAll<HTMLButtonElement>('[data-remove]').forEach(b=>b.onclick=()=>{
    if(group==='strip' && draft.strip.length===1){flash('Keep at least one home photo. Replace it instead.',true);return;}
    mutate(()=>sequence(group).splice(Number(b.dataset.remove),1));
  });
  document.querySelectorAll<HTMLButtonElement>('[data-add]').forEach(b=>b.onclick=()=>add(b.dataset.add!));
  document.querySelectorAll<HTMLButtonElement>('[data-hide]').forEach(b=>b.onclick=()=>{
    const p=photo(b.dataset.hide!)!;
    if(p.visible && p.filename===draft.hero){flash('Choose a different home hero before hiding this photo.',true);return;}
    if(p.visible && draft.strip.includes(p.filename) && draft.strip.length===1){flash('Replace the last home photo before hiding it.',true);return;}
    mutate(()=>{p.visible=!p.visible;if(!p.visible){draft.strip=draft.strip.filter(f=>f!==p.filename);draft.wall=draft.wall.filter(f=>f!==p.filename);}},p.visible?'Photo hidden in the draft. Publish to remove it from the pages.':'Photo available in the draft. Add it to a page to display it.');
  });
  document.querySelectorAll<HTMLButtonElement>('[data-delete]').forEach(b=>b.onclick=()=>void run(()=>removeFile(b.dataset.delete!)));
  document.querySelectorAll<HTMLInputElement>('[data-alt]').forEach(input=>input.oninput=()=>{
    photo(input.dataset.alt!)!.alt=input.value;persist();
    const status=document.getElementById('draft-status');if(status)status.textContent='Unpublished changes';
    (document.getElementById('admin-publish') as HTMLButtonElement).disabled=false;
    (document.getElementById('admin-discard') as HTMLButtonElement).disabled=false;
  });
  document.getElementById('photo-search')?.addEventListener('input',e=>{search=(e.target as HTMLInputElement).value;refreshLibrary();});
  document.getElementById('photo-filter')?.addEventListener('change',e=>{filter=(e.target as HTMLSelectElement).value;paint();});
  const input=document.getElementById('admin-files') as HTMLInputElement;
  if(input)input.onchange=()=>{if(input.files?.length)void run(()=>upload(Array.from(input.files!)));input.value='';};
  const drop=document.getElementById('admin-drop');
  if(drop){
  for(const name of ['dragenter','dragover'])drop.addEventListener(name,e=>{e.preventDefault();drop.classList.add('is-over');});
  for(const name of ['dragleave','dragend'])drop.addEventListener(name,()=>drop.classList.remove('is-over'));
  drop.addEventListener('drop',e=>{e.preventDefault();drop.classList.remove('is-over');const files=Array.from((e as DragEvent).dataTransfer?.files ?? []);if(files.length)void run(()=>upload(files));});
  }
  wireDrag();
  document.getElementById('admin-publish')?.addEventListener('click',()=>void run(publish));
  document.getElementById('admin-discard')?.addEventListener('click',()=>void run(discard));
  document.getElementById('admin-preview')?.addEventListener('click',preview);
}
function refreshLibrary(): void {
  const grid=document.querySelector('.library-grid'); if(!grid)return;
  grid.innerHTML=libraryCards();
  // Reuse one binding pass while keeping search focus and caret intact.
  const focused=document.getElementById('photo-search') as HTMLInputElement;
  const cursor=focused.selectionStart;
  paint();
  const next=document.getElementById('photo-search') as HTMLInputElement;
  next.focus({preventScroll:true});next.setSelectionRange(cursor,cursor);
}
function wireDrag(): void {
  document.querySelectorAll<HTMLElement>('[data-drag]').forEach(el=>el.addEventListener('dragstart',e=>{
    if(busy){e.preventDefault();return;}
    const [g,i]=el.dataset.drag!.split('|');dragged={group:g as Group|'library',index:Number(i)};
    const transfer=(e as DragEvent).dataTransfer;if(transfer){transfer.effectAllowed='move';transfer.setData('text/plain',el.dataset.drag!);}
    el.classList.add('is-dragging');
  }));
  document.querySelectorAll<HTMLElement>('[data-drop]').forEach(el=>{
    el.addEventListener('dragover',e=>{if(!dragged)return;e.preventDefault();el.classList.add('is-drop-target');});
    el.addEventListener('dragleave',()=>el.classList.remove('is-drop-target'));
    el.addEventListener('drop',e=>{
      e.preventDefault();const [g,i]=el.dataset.drop!.split('|');
      if(!dragged || dragged.group!==g){flash('Reorder photos within the same section.',true);return;}
      const from=dragged.index;dragged=null;
      mutate(()=>{if(g==='library')move(draft.photos,from,Number(i));else move(sequence(g as Group),from,Number(i));});
    });
  });
}
function add(file: string): void {
  const p=photo(file);if(!p)return;
  const g=target?.group ?? destination;
  const list=sequence(g);
  if(g!=='hero' && list.includes(file) && list[target?.index ?? -1]!==file){flash('That photo is already in this section.',true);return;}
  if(!target && g==='strip' && list.length>=6){flash('The home section holds six photos. Replace or remove one first.',true);return;}
  mutate(()=>{
    p.visible=true;
    if(g==='hero')draft.hero=file;
    else if(target)list[target.index]=file;
    else list.push(file);
    group=g;tab='pages';target=null;
  });
}
async function run(action:()=>Promise<void>): Promise<void> {
  if(busy)return;
  try{await action();}catch(error){busy=false;flash(error instanceof Error?error.message:'That action failed. Try again.',true);}
}
async function resize(file: File): Promise<{file:File;width:number;height:number}> {
  if(!file.type.startsWith('image/') && !/\.(jpe?g|png|webp|heic|heif|avif)$/i.test(file.name))throw new Error('Choose an image file.');
  const bitmap=await createImageBitmap(file,{imageOrientation:'from-image'});
  try {
    const scale=Math.min(1,1800/Math.max(bitmap.width,bitmap.height));
    const width=Math.max(1,Math.round(bitmap.width*scale)),height=Math.max(1,Math.round(bitmap.height*scale));
    const canvas=document.createElement('canvas');canvas.width=width;canvas.height=height;
    const ctx=canvas.getContext('2d');if(!ctx)throw new Error('This browser cannot prepare images.');
    ctx.drawImage(bitmap,0,0,width,height);
    const blob=await new Promise<Blob|null>(resolve=>canvas.toBlob(resolve,'image/jpeg',.86));
    if(!blob)throw new Error('The image could not be prepared.');
    return {file:new File([blob],file.name.replace(/\.[^.]+$/,'')+'.jpg',{type:'image/jpeg'}),width,height};
  } finally {bitmap.close();}
}
async function upload(files:File[]):Promise<void> {
  busy=true;paint();let added=0;const failures:string[]=[];
  try{
    for(const [i,file] of files.entries()){
      const progress=document.getElementById('upload-progress');if(progress)progress.textContent=`Uploading ${i+1} of ${files.length}…`;
      try{const prepared=await resize(file);const p=await uploadPhoto(prepared.file,prepared);draft.photos.push(p);added++;persist();}
      catch(error){failures.push(`${file.name}: ${error instanceof Error?error.message:'failed'}`);}
    }
  }finally{busy=false;}
  tab='library';flash(`${added} photo${added===1?'':'s'} uploaded. Add them to a page, then publish.${failures.length?' '+failures.join(' · '):''}`,failures.length>0);
}
async function load(): Promise<GalleryDraft> {
  const photos=mergePhotos(await listAllPhotos());
  const comp=await readComposition(new Set(photos.map(p=>p.filename)),fallbackComposition());
  if(comp.problems.length)throw new Error(comp.problems.join(' · ') + '. Reload before editing.');
  return {hero:comp.heroPhoto ?? '',strip:comp.homeStrip,wall:comp.wallRows.flat(),photos,revision:comp.revision ?? null};
}
async function publish():Promise<void> {
  validateDraft(draft);busy=true;paint();
  const snapshot=clone(draft);
  try{
    const revision=await publishGallery(snapshot);
    draft.revision=revision;dirty=false;forget();
    flash('Published. Visitors will see this layout when they load the site.');
  }finally{busy=false;paint();}
}
async function discard():Promise<void> {
  if(!confirm('Discard your unpublished changes? Uploaded files will stay in the library.'))return;
  busy=true;paint();
  try{draft=await load();dirty=false;forget();target=null;flash('Draft discarded. The published layout is loaded.');}
  finally{busy=false;paint();}
}
async function removeFile(file:string):Promise<void> {
  const p=photo(file)!;
  if(dirty){flash('Publish or discard your draft before permanently deleting a file.',true);return;}
  if(p.visible || draft.hero===file || draft.strip.includes(file) || draft.wall.includes(file)){flash('Hide this photo and publish before deleting its file.',true);return;}
  if(!confirm(`Permanently delete this uploaded photo? ${p.alt || p.filename}`))return;
  busy=true;paint();
  try{await deletePhoto(p.id);draft.photos=draft.photos.filter(row=>row.filename!==file);flash('Uploaded photo deleted.');}
  finally{busy=false;paint();}
}
function preview():void {
  const previous=document.getElementById('admin-preview') as HTMLElement;
  const modal=document.createElement('dialog');modal.className='admin-preview';
  const render=(page:string)=>{
    setLiveHome(draft.strip,draft.hero);
    const ids=new Map(draft.photos.map(p=>[p.filename,p.id]));setLiveRows(draft.wall.length?[draft.wall.map(f=>ids.get(f)!)]:[]);
    modal.innerHTML=`<div class="admin-preview__bar"><strong>Draft preview</strong><select aria-label="Preview page"><option value="portfolio" ${page==='portfolio'?'selected':''}>Portfolio</option><option value="home" ${page==='home'?'selected':''}>Home</option></select><button type="button" autofocus>Close</button></div><div class="admin-preview__content">${page==='home'?homePage(draft.photos,2):portfolioPage(draft.photos)}</div>`;
    modal.querySelector('button')!.onclick=()=>modal.close();
    modal.querySelector('select')!.onchange=e=>render((e.target as HTMLSelectElement).value);
  };
  render(group==='wall'?'portfolio':'home');document.body.append(modal);modal.showModal();
  modal.onclose=()=>{modal.remove();previous?.focus({preventScroll:true});};
}
function gate(message=''):void {
  app.innerHTML=`<main class="admin-gate"><a class="admin-brand" href="./index.html">Shutterhaus</a><h1>Photo manager.</h1><p>Sign in to upload photos and arrange your website.</p><p role="status" id="gate-note">${esc(message)}</p><button type="button" id="gate-btn">${icon('google',18)} Continue with Google</button><a href="./index.html">Back to the website</a></main>`;
  const button=document.getElementById('gate-btn') as HTMLButtonElement;
  button.onclick=async()=>{
    button.disabled=true;
    try{const {error}=await signInWithGoogle();if(error)throw error;}
    catch(error){button.disabled=false;document.getElementById('gate-note')!.textContent=error instanceof Error?error.message:'Sign-in failed. Try again.';}
  };
}
async function boot():Promise<void> {
  if(!isSupabaseConfigured){gate('The photo manager is not connected. Please try again later.');(document.getElementById('gate-btn') as HTMLButtonElement).disabled=true;return;}
  try{
    const session=await getSession();if(!session){gate();return;}
    if(!isAdmin(session.email)){gate('This account does not have access to the photo manager.');return;}
    account=session.email;draft=await load();
    try{
      const stored=JSON.parse(sessionStorage.getItem(key()) || 'null') as GalleryDraft|null;
      if(stored){
        // Preserve new uploads from this session while rejecting stale layouts.
        if(stored.revision===draft.revision){
          const current=new Map(draft.photos.map(p=>[p.filename,p]));
          stored.photos=stored.photos.filter(p=>current.has(p.filename));
          for(const p of current.values())if(!stored.photos.some(row=>row.filename===p.filename))stored.photos.push(p);
          validateDraft(stored);draft=stored;dirty=true;notice='Your unpublished draft was restored.';
        }else{notice='The site changed since your previous draft. The latest published layout is loaded.';errorNotice=true;forget();}
      }
    }catch{forget();}
    paint();
  }catch(error){
    app.innerHTML=`<main class="admin-gate"><h1>Couldn’t load your photos.</h1><p>${esc(error instanceof Error?error.message:'Please try again.')}</p><button type="button" id="admin-retry">Try again</button><a href="./index.html">Back to the website</a></main>`;
    document.getElementById('admin-retry')!.onclick=()=>void boot();
  }
}
addEventListener('beforeunload',e=>{if(dirty || busy){e.preventDefault();e.returnValue='';}});
addEventListener('dragend',()=>{dragged=null;document.querySelectorAll('.is-dragging,.is-drop-target').forEach(el=>el.classList.remove('is-dragging','is-drop-target'));});
void boot();
