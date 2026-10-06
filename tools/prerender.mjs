import { build } from 'esbuild';
const {outputFiles} = await build({
  stdin:{contents:`export {renderShell} from './src/layout'; export {DEMO_PHOTOS} from './src/demo'; export {homePage,portfolioPage} from './src/pages'; export {aboutPage,servicesPage,contactPage} from './src/pages-more';`,resolveDir:process.cwd()},
  bundle:true,write:false,format:'esm',platform:'node',
});
const render = await import('data:text/javascript;base64,'+Buffer.from(outputFiles[0].text).toString('base64'));
const p=render.DEMO_PHOTOS;
const pages={home:render.homePage(p,3),portfolio:render.portfolioPage(p),about:render.aboutPage(p),services:render.servicesPage(p),contact:render.contactPage()};
process.stdout.write(JSON.stringify(Object.fromEntries(Object.entries(pages).map(([route,body])=>[route,render.renderShell(route,body,route==='home')]))));
