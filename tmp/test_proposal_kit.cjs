const {chromium}=require('C:/Users/ninpo/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const path=require('path');
const fs=require('fs');
(async()=>{
const out=path.resolve('output/propostas_joao_victor');
const browser=await chromium.launch({headless:true,executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'});
const page=await browser.newPage({viewport:{width:1280,height:900},acceptDownloads:true});
const errors=[];page.on('pageerror',e=>errors.push(e.message));
await page.goto('file:///'+path.join(out,'Editor_de_Propostas.html').replaceAll('\\','/'));
for(const id of ['geral','bots','sistemas','landing_pages','sites','consultoria','pericia_forense']){
 await page.selectOption('select',id);
 if(await page.locator('article:visible').count()!==1)throw Error('selection failed '+id);
 if(await page.locator('article:visible section').count()!==12)throw Error('missing sections '+id);
}
await page.selectOption('select','geral');
await page.locator('article:visible .meta').fill('CLIENTE DE TESTE');
let dl=page.waitForEvent('download');await page.click('#save');let download=await dl;
await download.saveAs(path.resolve('tmp/edited_kit_test.html'));
await page.goto('file:///'+path.resolve('tmp/edited_kit_test.html').replaceAll('\\','/'));
if(await page.locator('article:visible .meta').innerText()!=='CLIENTE DE TESTE')throw Error('save lost changes');
dl=page.waitForEvent('download');await page.click('#client');download=await dl;await download.saveAs(path.resolve('tmp/client_proposal_test.html'));
const client=fs.readFileSync('tmp/client_proposal_test.html','utf8');
if((client.match(/<article /g)||[]).length!==1||client.includes('<aside')||client.includes('id="save"'))throw Error('client export not isolated');
dl=page.waitForEvent('download');await page.click('#text');download=await dl;await download.saveAs(path.resolve('tmp/text_proposal_test.txt'));
if(!fs.readFileSync('tmp/text_proposal_test.txt','utf8').includes('CLIENTE DE TESTE'))throw Error('text export failed');
await page.goto('file:///'+path.join(out,'Editor_de_Propostas.html').replaceAll('\\','/'));
await page.screenshot({path:'tmp/proposal_editor_desktop.png'});
await page.pdf({path:path.join(out,'Modelo_Geral_Proposta.pdf'),format:'A4',printBackground:true,preferCSSPageSize:true});
await page.setViewportSize({width:390,height:844});
if(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth))throw Error('mobile overflow');
await page.screenshot({path:'tmp/proposal_editor_mobile.png'});
if(errors.length)throw Error(errors.join('\n'));
console.log('PASS: seven templates, edit/save/reopen, client isolation, text export, mobile width, no JS errors. PDF created.');
await browser.close();
})();
