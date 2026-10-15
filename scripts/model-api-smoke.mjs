import assert from 'node:assert/strict';
import { readFile, writeFile, mkdir, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createApp } from '../server/app.mjs';
import { createMediaRouter } from '../server/media.mjs';
import { chromium } from '@playwright/test';

const root=fileURLToPath(new URL('../',import.meta.url));
const scratch=await mkdtemp(join(tmpdir(),'formworks-model-api-'));
const media=createMediaRouter({dataDir:join(scratch,'media')});
const app=createApp({dbPath:join(scratch,'quotes.sqlite'),staticDir:join(root,'dist'),apiHandler:media.handle,capabilities:media.capabilities,resolveSources:media.resolveSources});
const results=[];
async function run(name,fn){const start=Date.now();const result=await fn();results.push({name,status:'passed',seconds:Math.round((Date.now()-start)/10)/100,...result});console.log(`PASS ${name}`);}
let url;
async function post(path,data){const response=await fetch(url+path,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(data)});const payload=await response.json();assert.ok(response.ok,JSON.stringify(payload));return payload;}
async function completed(id){const deadline=Date.now()+600000;while(Date.now()<deadline){const response=await fetch(url+`/api/jobs/${id}`);const job=await response.json();if(job.status==='completed')return job;if(job.status==='failed')throw new Error(job.error);await new Promise(r=>setTimeout(r,1000));}throw new Error('Real model job exceeded smoke deadline.');}
try{
  assert.equal(media.capabilities.imageGeneration,true,'Run npm run models:check after installing weights.');assert.equal(media.capabilities.audioTranscription,true,'Whisper weights must be ready.');
  await new Promise(r=>app.server.listen(0,'127.0.0.1',r));url=`http://127.0.0.1:${app.server.address().port}`;
  let image,imageJob,audio,audioJob,quote;
  await run('HTTP image upload → real TripoSR worker → downloadable GLB',async()=>{
    const input=await readFile(join(root,'model-service/vendor/TripoSR/examples/chair.png'));
    image=await post('/api/images',{dataUrl:`data:image/png;base64,${input.toString('base64')}`});
    const created=await post(`/api/images/${image.id}/generate`,{});imageJob=await completed(created.id);
    const response=await fetch(url+imageJob.modelUrl);assert.equal(response.status,200);const bytes=Buffer.from(await response.arrayBuffer());assert.equal(bytes.toString('ascii',0,4),'glTF');assert.ok(bytes.length>10000);return {bytes:bytes.length,provider:'TripoSR',fixture:'official chair.png'};
  });
  await run('HTTP audio upload → real Whisper worker → speech transcript',async()=>{
    const input=await readFile(join(root,'model-service/smoke-output/jfk.wav'));
    audio=await post('/api/audio',{dataUrl:`data:audio/wav;base64,${input.toString('base64')}`});
    const created=await post(`/api/audio/${audio.id}/transcribe`,{});audioJob=await completed(created.id);assert.match(audioJob.text,/country/i);return {characters:audioJob.text.length,language:audioJob.language,provider:'Whisper',fixture:'official JFK speech converted to WAV'};
  });
  await run('completed image and speech jobs bind to immutable quote sources',async()=>{
    quote=(await post('/api/quotes',{customer:'실제 모델 연결 검증',notes:'공식 예제로 연결 검증; 제조 품질 평가가 아님',spec:{widthMm:1200,depthMm:450,heightMm:1500,shelves:3,material:'birch',quantity:1},confirmed:true,sources:{requestText:'폭120cm 깊이45cm 높이150cm 선반3개',imageId:image.id,imageJobId:imageJob.id,audioId:audio.id,audioJobId:audioJob.id}})).quote;
    assert.equal(quote.sources.modelUrl,imageJob.modelUrl);assert.equal(quote.sources.transcript,audioJob.text);
    for(const status of ['sent','approved','ordered'])quote=(await post(`/api/quotes/${quote.id}/status`,{status,expectedRevision:quote.revision})).quote;
    assert.equal(quote.sources.imageJobId,imageJob.id);assert.equal(quote.sources.audioJobId,audioJob.id);assert.equal(quote.approvedRevision,3);
  });
  await run('browser restores generated reference GLB and locked sources',async()=>{
    const browser=await chromium.launch({executablePath:process.env.FORMWORKS_BROWSER || chromium.executablePath(),headless:true,args:['--use-angle=swiftshader','--enable-webgl','--enable-unsafe-swiftshader']});
    try{
      const page=await browser.newPage({viewport:{width:1440,height:1080}});page.setDefaultTimeout(30000);const errors=[];page.on('pageerror',error=>errors.push(error.message));
      await page.goto(url);await page.locator(`.quote-card[data-quote-id="${quote.id}"]`).click();await page.waitForFunction(()=>!document.querySelector('#reference-tab').disabled);await page.locator('#reference-tab').click();
      assert.equal(await page.locator('#reference-tab').getAttribute('aria-selected'),'true');assert.ok(await page.locator('#widthMm').isDisabled());assert.equal(await page.locator('#model-name').innerText(),'이미지 기반 참고 시안');assert.deepEqual(errors,[]);
      await page.screenshot({path:join(root,'docs/verification/generated-reference.png'),fullPage:true});return {pageErrors:errors,generatedReference:true};
    }finally{await browser.close();}
  });
  await mkdir(join(root,'docs/verification'),{recursive:true});await writeFile(join(root,'docs/verification/model-api-smoke.json'),JSON.stringify({executedAt:new Date().toISOString(),evidence:'Live local HTTP uploads, actual GPU/CPU model subprocesses and validated outputs. No inference fixtures or placeholder models.',limits:'One official object and English speech verify integration; Korean speech accuracy and actual shelf reconstruction quality remain unmeasured.',results},null,2));
  console.log(`Real model API smoke passed: ${results.length} scenarios.`);
}finally{media.close();await app.close();await rm(scratch,{recursive:true,force:true});}
