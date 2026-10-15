import assert from 'node:assert/strict';
import { chromium } from '@playwright/test';
import { existsSync, readdirSync } from 'node:fs';
import { mkdtemp, rm, mkdir, writeFile, readFile } from 'node:fs/promises';
import { tmpdir, homedir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createApp } from '../server/app.mjs';
import { createMediaRouter } from '../server/media.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const scratch = await mkdtemp(join(tmpdir(),'formworks-browser-'));
const media = createMediaRouter({dataDir:join(scratch,'media'),pythonPath:join(scratch,'unavailable'),modelDir:join(scratch,'models')});
const app = createApp({dbPath:join(scratch,'quotes.sqlite'),staticDir:join(root,'dist'),apiHandler:media.handle,capabilities:media.capabilities,resolveSources:media.resolveSources});
await new Promise(resolve=>app.server.listen(0,'127.0.0.1',resolve));
const url=`http://127.0.0.1:${app.server.address().port}`;
const evidenceDir=join(root,'docs/verification');await mkdir(evidenceDir,{recursive:true});
function browserExecutable(){
  if(process.env.FORMWORKS_BROWSER)return process.env.FORMWORKS_BROWSER;
  if(existsSync(chromium.executablePath()))return chromium.executablePath();
  const cache=join(homedir(),'AppData/Local/ms-playwright');
  if(existsSync(cache))for(const version of readdirSync(cache).filter(v=>/^chromium-\d+$/.test(v)).sort().reverse()){
    for(const name of ['chrome-win64/chrome.exe','chrome-win/chrome.exe']){const executable=join(cache,version,name);if(existsSync(executable))return executable;}
  }
  throw new Error('Chromium is not installed. Run npx playwright install chromium or set FORMWORKS_BROWSER.');
}
let browser;const results=[];const errors=[];
const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/tO8AAAAASUVORK5CYII=','base64');
async function check(name,fn){await fn();results.push({name,status:'passed'});console.log(`PASS ${name}`);}
try{
  browser=await chromium.launch({executablePath:browserExecutable(),headless:true,args:['--use-angle=swiftshader','--enable-webgl','--enable-unsafe-swiftshader']});
  const page=await browser.newPage({viewport:{width:1440,height:1080},deviceScaleFactor:1});
  page.setDefaultTimeout(20000);
  page.on('pageerror',error=>errors.push(error.message));
  await page.goto(url);await page.waitForFunction(()=>document.querySelector('#total-price')?.textContent.includes('634,865'));
  await check('live WebGL model and authoritative initial quote',async()=>{
    assert.ok(await page.locator('canvas[data-testid="three-canvas"]').isVisible());
    assert.equal(await page.locator('canvas').first().getAttribute('data-shelves'),'3');
    assert.equal(await page.locator('canvas').first().getAttribute('data-leg-count'),'4');
    assert.equal(await page.locator('#total-price').innerText(),'634,865');
    assert.equal(await page.locator('canvas').first().evaluate(c=>c.getContext('webgl2').isContextLost()),false);
    await page.screenshot({path:join(evidenceDir,'desktop.png'),fullPage:true});
  });
  await check('Korean request drives dimensions, model and quotation',async()=>{
    await page.locator('#request-text').fill('폭을 160cm로 늘리고 선반 4개로 만들어 주세요');await page.locator('#apply-request').click();
    await page.waitForFunction(()=>document.querySelector('canvas')?.dataset.legCount==='6' && document.querySelector('canvas')?.dataset.shelves==='4');
    assert.equal(await page.locator('#widthMm').inputValue(),'1600');assert.equal(await page.locator('#shelves').inputValue(),'4');
    assert.notEqual(await page.locator('#total-price').innerText(),'634,865');
  });
  let quoteId;
  await check('image reference, confirmation and durable quote save',async()=>{
    await page.locator('#image-upload').setInputFiles({name:'reference.png',mimeType:'image/png',buffer:png});
    await page.waitForFunction(()=>document.querySelector('#reference-thumbnail')?.naturalWidth>0);
    await page.locator('#customer').fill('브라우저 스모크 고객');await page.locator('#save-quote').click();
    assert.match(await page.locator('#notice-text').innerText(),/확인/);
    await page.locator('#confirmed').check();await page.locator('#save-quote').click();
    await page.waitForFunction(()=>document.querySelector('#active-status')?.dataset.status==='draft');
    quoteId=await page.locator('.quote-card').first().getAttribute('data-quote-id');
    await page.reload();await page.locator(`.quote-card[data-quote-id="${quoteId}"]`).click();
    await page.waitForFunction(()=>document.querySelector('#reference-thumbnail')?.naturalWidth>0 && document.querySelector('#widthMm')?.value==='1600');
    assert.equal(await page.locator('#request-text').inputValue(),'폭을 160cm로 늘리고 선반 4개로 만들어 주세요');
    assert.equal(await page.locator('#reference-name').innerText(),'저장된 참고 이미지');
  });
  await check('saved revisions and approval/order lock',async()=>{
    await page.locator('#shelves').fill('5');await page.waitForFunction(()=>document.querySelector('canvas')?.dataset.shelves==='5');
    await page.locator('#confirmed').check();await page.locator('#save-quote').click();
    await page.waitForFunction(()=>document.querySelector('#history-list')?.children.length===2);
    for(const status of ['sent','approved','ordered']){await page.locator('#status-action').click();await page.waitForFunction(expected=>document.querySelector('#active-status')?.dataset.status===expected,status);await page.waitForFunction(()=>!document.querySelector('#new-quote').disabled);}
    assert.ok(await page.locator('#widthMm').isDisabled());assert.ok(await page.locator('#save-quote').isDisabled());
    assert.match(await page.locator('#history-list').innerText(),/발주 완료/);assert.match(await page.locator('#history-list').innerText(),/승인 완료/);
    await page.screenshot({path:join(evidenceDir,'approved.png'),fullPage:true});
  });
  await check('GLB and CSV downloads contain real data',async()=>{
    const [glb]=await Promise.all([page.waitForEvent('download'),page.locator('#export-glb').click()]);
    const file=join(scratch,'shelf.glb');await glb.saveAs(file);const bytes=await readFile(file);assert.equal(bytes.toString('ascii',0,4),'glTF');assert.ok(bytes.length>10000);
    const chunk=bytes.subarray(20,20+bytes.readUInt32LE(12));const gltf=JSON.parse(chunk.toString('utf8').trim());assert.ok(gltf.meshes.length>10);
    const metadata=gltf.nodes.find(node=>node.extras?.spec)?.extras.spec;assert.equal(metadata.widthMm,1600);assert.equal(metadata.shelves,5);
    const [csv]=await Promise.all([page.waitForEvent('download'),page.locator('#export-csv').click()]);const csvFile=join(scratch,'quote.csv');await csv.saveAs(csvFile);assert.match(await readFile(csvFile,'utf8'),/브라우저 스모크 고객/);
  });
  await check('new quote resets sources and pending image response cannot leak',async()=>{
    await page.locator('#new-quote').click();await page.waitForFunction(()=>document.querySelector('#widthMm')?.value==='1200');
    assert.ok(await page.locator('#image-reference').isHidden());assert.equal(await page.locator('#request-text').inputValue(),'');
    let unblock;let arrived;const gate=new Promise(r=>{unblock=r;});const incoming=new Promise(r=>{arrived=r;});
    await page.route('**/api/images',async route=>{const response=await route.fetch();arrived();await gate;await route.fulfill({response});});
    await page.locator('#image-upload').setInputFiles({name:'late.png',mimeType:'image/png',buffer:png});await incoming;
    await page.locator('#new-quote').click();unblock();await page.waitForTimeout(300);
    assert.ok(await page.locator('#image-reference').isHidden());assert.equal(await page.locator('#customer').inputValue(),'');
    await page.unroute('**/api/images');
  });
  await check('delayed audio job cannot write into a different quote (response fixture)',async()=>{
    const audioPage=await browser.newPage({viewport:{width:1200,height:1000}});audioPage.setDefaultTimeout(20000);audioPage.on('pageerror',e=>errors.push(e.message));
    await audioPage.route('**/api/health',route=>route.fulfill({json:{status:'ok',capabilities:{imageGeneration:false,audioTranscription:true}}}));
    await audioPage.route('**/api/audio',route=>route.fulfill({status:201,json:{id:'00000000-0000-4000-8000-000000000001'}}));
    await audioPage.route('**/api/audio/*/transcribe',route=>route.fulfill({status:202,json:{id:'00000000-0000-4000-8000-000000000002',status:'running'}}));
    let unblock;let arrived;const gate=new Promise(r=>unblock=r);const incoming=new Promise(r=>arrived=r);
    await audioPage.route('**/api/jobs/*',async route=>{arrived();await gate;await route.fulfill({json:{id:'00000000-0000-4000-8000-000000000002',status:'completed',text:'OLD WORKSPACE AUDIO'}});});
    await audioPage.goto(url);await audioPage.waitForFunction(()=>!document.querySelector('#audio-upload').disabled);
    const wav=Buffer.alloc(44);wav.write('RIFF',0);wav.write('WAVE',8);
    await audioPage.locator('#audio-upload').setInputFiles({name:'race.wav',mimeType:'audio/wav',buffer:wav});await incoming;
    await audioPage.locator('#new-quote').click();unblock();await audioPage.waitForTimeout(300);assert.equal(await audioPage.locator('#request-text').inputValue(),'');await audioPage.close();
  });
  await check('mobile layout and keyboard model controls',async()=>{
    await page.setViewportSize({width:390,height:844});await page.waitForTimeout(300);
    await page.screenshot({path:join(evidenceDir,'mobile.png'),fullPage:true});
    if(await page.evaluate(()=>document.documentElement.scrollWidth>window.innerWidth))console.log('Overflow evidence:',await page.evaluate(()=>[...document.querySelectorAll('body *')].filter(e=>e.getBoundingClientRect().right>innerWidth+1).slice(0,8).map(e=>({tag:e.tagName,id:e.id,class:e.className,width:e.getBoundingClientRect().width}))));
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth),true);
    await page.locator('canvas').first().focus();await page.keyboard.press('ArrowLeft');await page.keyboard.press('Home');
    await page.screenshot({path:join(evidenceDir,'mobile.png'),fullPage:true});
  });
  assert.deepEqual(errors,[]);
  await writeFile(join(evidenceDir,'browser-smoke.json'),JSON.stringify({executedAt:new Date().toISOString(),evidence:'Real Chromium against built UI and live isolated SQLite API. Audio race scenario uses controlled delayed responses and does not assert model inference.',results,pageErrors:errors},null,2));
  console.log(`Browser smoke passed: ${results.length} scenarios; zero page errors.`);
}catch(error){console.error(error);throw error;}
finally{if(browser)await browser.close();media.close();await app.close();await rm(scratch,{recursive:true,force:true});}
