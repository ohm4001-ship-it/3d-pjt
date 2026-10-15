import assert from 'node:assert/strict';
import { mkdtemp, rm, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createApp } from '../server/app.mjs';
import { createMediaRouter } from '../server/media.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const scratch = await mkdtemp(join(tmpdir(), 'formworks-smoke-'));
const media = createMediaRouter({dataDir:join(scratch,'media'),pythonPath:join(scratch,'missing-python.exe'),modelDir:join(scratch,'models')});
const app = createApp({dbPath:join(scratch,'quotes.sqlite'),staticDir:join(root,'dist'),apiHandler:media.handle,capabilities:media.capabilities,resolveSources:media.resolveSources});
await new Promise(resolve => app.server.listen(0,'127.0.0.1',resolve));
const url = `http://127.0.0.1:${app.server.address().port}`;
const results = [];
async function request(path, data, method = data === undefined ? 'GET' : 'POST', headers = {}) {
  const response = await fetch(url+path,{method,headers:{...(data === undefined ? {} : {'Content-Type':'application/json'}),...headers},body:data === undefined ? undefined : JSON.stringify(data)});
  const type = response.headers.get('content-type') || '';
  return {status:response.status,body:type.includes('json') ? await response.json() : await response.text()};
}
async function check(name, fn) {
  await fn(); results.push({name,status:'passed'}); console.log(`PASS ${name}`);
}
const spec = {widthMm:1200,depthMm:450,heightMm:1500,shelves:3,material:'birch',quantity:1};
try {
  await check('health and built application',async()=>{
    assert.equal((await request('/api/health')).status,200);
    const page = await request('/'); assert.equal(page.status,200); assert.match(page.body,/Formworks|폼웍스/i);
  });
  await check('Korean text updates only requested fields',async()=>{
    const r=await request('/api/interpret',{text:'폭을 140cm로 바꾸고 선반 한 개 추가해 주세요',currentSpec:spec});
    assert.equal(r.status,200); assert.equal(r.body.spec.widthMm,1400); assert.equal(r.body.spec.shelves,4); assert.equal(r.body.spec.depthMm,450);
  });
  await check('server validates dimensions and computes BOM/pricing',async()=>{
    const good=await request('/api/preview',{spec}); assert.equal(good.status,200); assert.ok(good.body.bom.length>=6); assert.equal(good.body.pricing.total,good.body.pricing.supplyPrice+good.body.pricing.vatAmount);
    assert.equal((await request('/api/preview',{spec:{...spec,widthMm:-1}})).status,400);
    assert.equal((await request('/api/preview',{spec:{...spec,widthMm:true}})).status,400);
  });
  let quote;
  await check('confirmation is required and quote persists',async()=>{
    assert.equal((await request('/api/quotes',{customer:'스모크 고객',spec,confirmed:false})).status,400);
    const result=await request('/api/quotes',{customer:'스모크 고객',notes:'자동 검증용',spec,confirmed:true}); assert.equal(result.status,201); quote=result.body.quote;
    const read=await request(`/api/quotes/${quote.id}`); assert.equal(read.body.quote.id,quote.id);
  });
  await check('optimistic concurrency and revision history',async()=>{
    const data={customer:'스모크 고객',notes:'변경',spec:{...spec,shelves:4},confirmed:true,expectedRevision:quote.revision};
    const saved=await request(`/api/quotes/${quote.id}/revisions`,data); assert.equal(saved.status,200); quote=saved.body.quote;
    assert.equal((await request(`/api/quotes/${quote.id}/revisions`,data)).status,409);
    assert.ok(quote.history.length>=2);
  });
  await check('approval lifecycle locks approved specifications',async()=>{
    assert.equal((await request(`/api/quotes/${quote.id}/status`,{status:'ordered',expectedRevision:quote.revision})).status,409);
    for(const status of ['sent','approved','ordered']){
      const saved=await request(`/api/quotes/${quote.id}/status`,{status,expectedRevision:quote.revision,expectedStatus:quote.status}); assert.equal(saved.status,200); quote=saved.body.quote; assert.equal(quote.status,status);
    }
    assert.equal((await request(`/api/quotes/${quote.id}/revisions`,{customer:'변경',spec,confirmed:true,expectedRevision:quote.revision})).status,409);
  });
  await check('quote exports and formula injection protection',async()=>{
    const csv=await request(`/api/quotes/${quote.id}/export.csv`); assert.equal(csv.status,200); assert.match(csv.body,/합계/);
    const encoded=await request('/api/quotes',{customer:'=1+1',notes:'@SUM(A1)',spec,confirmed:true});
    const malicious=await request(`/api/quotes/${encoded.body.quote.id}/export.csv`); assert.ok(malicious.body.includes("'=1+1")); assert.ok(malicious.body.includes("'@SUM(A1)"));
    const json=await request(`/api/quotes/${quote.id}/export.json`); assert.equal(json.status,200);
  });
  await check('invalid uploads and unavailable models fail truthfully',async()=>{
    assert.equal((await request('/api/images',{dataUrl:'data:image/png;base64,AAAA'})).status,400);
    const png='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/tO8AAAAASUVORK5CYII=';
    const image=await request('/api/images',{dataUrl:png}); assert.equal(image.status,201);
    assert.equal((await fetch(url+image.body.url)).status,200);
    const sourced=await request('/api/quotes',{customer:'사진 연결 고객',spec,confirmed:true,sources:{requestText:'자작나무 진열대',imageId:image.body.id}});
    assert.equal(sourced.status,201); assert.equal(sourced.body.quote.sources.imageUrl,image.body.url);
    const reloaded=await request(`/api/quotes/${sourced.body.quote.id}`); assert.equal(reloaded.body.quote.sources.requestText,'자작나무 진열대');
    const rejected=await request(`/api/images/${image.body.id}/generate`,{}); assert.equal(rejected.status,503); assert.equal(rejected.body.error.code,'MODEL_UNAVAILABLE');
    assert.equal((await request('/api/images',{dataUrl:png},'POST',{Origin:'https://untrusted.example'})).status,403);
    assert.equal((await request('/api/jobs/not-a-job')).status,404);
  });
  await check('unknown routes and traversal do not expose local files',async()=>{
    assert.equal((await request('/api/does-not-exist')).status,404);
    const r=await request('/%2e%2e/package.json'); assert.notEqual(r.body?.name,'formworks');
  });
  await mkdir(join(root,'docs/verification'),{recursive:true});
  await writeFile(join(root,'docs/verification/api-smoke.json'),JSON.stringify({executedAt:new Date().toISOString(),evidence:'Live local HTTP requests against isolated SQLite database; external models intentionally unavailable in this error-path test.',results},null,2));
  console.log(`API smoke passed: ${results.length} scenarios.`);
} finally {
  media.close(); await app.close(); await rm(scratch,{recursive:true,force:true});
}
