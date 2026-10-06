import { build } from 'esbuild';

// The shipped admin entry point with mocked I/O. Never included by Vite.
// Tests exercise the real views, handlers and image preparation without using
// a Google session or changing photographs in the production project.
export async function adminBundle() {
  const result=await build({entryPoints:['src/admin.ts'],bundle:true,write:false,format:'iife',loader:{'.css':'empty'},plugins:[{
    name:'admin-test-io',setup(b){
      b.onResolve({filter:/^\.\/(supabase|store|composition)$/},args=>({path:args.path,namespace:'admin-mock'}));
      b.onLoad({filter:/.*/,namespace:'admin-mock'},args=>({contents:args.path==='./supabase'?`
        export const isSupabaseConfigured=true;
        export const getSession=async()=>({email:'itsnotalwin@gmail.com'});
        export const isAdmin=email=>email==='itsnotalwin@gmail.com';
        export const signInWithGoogle=async()=>({error:null});
        export const signOut=async()=>{};
      `:args.path==='./store'?`
        export const listAllPhotos=async()=>structuredClone(window.__adminMock.photos);
        export const uploadPhoto=async(file,dims)=>{
          if(window.__adminMock.uploadFails)throw new Error('Upload failed');
          const p={id:'upload-'+Date.now(),filename:'uploaded-'+file.name,url:window.__adminMock.uploadURL,alt:'Uploaded portrait',album:'photo',visible:false,sort_order:999,...dims};
          window.__adminMock.photos.push(p);return structuredClone(p);
        };
        export const deletePhoto=async(id)=>{window.__adminMock.deleted.push(id);window.__adminMock.photos=window.__adminMock.photos.filter(p=>p.id!==id);};
      `:`
        export const readComposition=async()=>structuredClone(window.__adminMock.composition);
        export const publishGallery=async(draft)=>{
          window.__adminMock.attempts++;
          if(window.__adminMock.failPublish)throw new Error('Connection lost. Try again.');
          window.__adminMock.published=structuredClone(draft);
          window.__adminMock.photos=structuredClone(draft.photos);
          const revision=new Date().toISOString();
          window.__adminMock.composition={homeStrip:draft.strip,heroPhoto:draft.hero,wallRows:[draft.wall],problems:[],revision};
          return revision;
        };
      `}));
    },
  }]});
  return result.outputFiles[0].text;
}
export async function photoFixture() {
  const result=await build({stdin:{contents:"export {DEMO_PHOTOS} from './src/demo'; export {fallbackComposition} from './src/gallery-model';",resolveDir:process.cwd()},bundle:true,write:false,format:'esm',platform:'node'});
  const mod=await import('data:text/javascript;base64,'+Buffer.from(result.outputFiles[0].text).toString('base64'));
  const fallback=mod.fallbackComposition();
  return {photos:structuredClone(mod.DEMO_PHOTOS),composition:{homeStrip:fallback.strip,heroPhoto:fallback.hero,wallRows:fallback.rows,problems:[],revision:null},attempts:0,deleted:[],failPublish:false,uploadURL:'http://127.0.0.1:4173/gallery/54-img-0164.jpg'};
}
