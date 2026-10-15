import { mkdirSync, existsSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import { spawn } from 'node:child_process';
import { DomainError } from './domain.mjs';

const projectRoot = fileURLToPath(new URL('../', import.meta.url));
const maxBytes = 8 * 1024 * 1024;
const types = {
  'image/png': { extension: 'png', kind: 'image', valid: (b) => b.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10])) },
  'image/jpeg': { extension: 'jpg', kind: 'image', valid: (b) => b[0] === 255 && b[1] === 216 && b[2] === 255 },
  'audio/wav': { extension: 'wav', kind: 'audio', valid: (b) => b.toString('ascii',0,4) === 'RIFF' && b.toString('ascii',8,12) === 'WAVE' },
  'audio/x-wav': { extension: 'wav', kind: 'audio', valid: (b) => b.toString('ascii',0,4) === 'RIFF' && b.toString('ascii',8,12) === 'WAVE' },
  'audio/mpeg': { extension: 'mp3', kind: 'audio', valid: (b) => b.toString('ascii',0,3) === 'ID3' || (b[0] === 255 && (b[1] & 224) === 224) },
  'audio/mp4': { extension: 'm4a', kind: 'audio', valid: (b) => b.toString('ascii',4,8) === 'ftyp' },
};

function json(res, status, payload) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
  res.end(JSON.stringify(payload));
}
function failure(res, status, code, message) { json(res, status, { error: { code, message } }); }
async function body(req) {
  const limit = Math.ceil(maxBytes * 4 / 3) + 1024;
  if (Number(req.headers['content-length']) > limit) throw Object.assign(new Error('파일은 8MB 이하로 넣어 주세요.'), { status: 413 });
  const chunks = []; let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > limit) throw Object.assign(new Error('파일은 8MB 이하로 넣어 주세요.'), { status: 413 });
    chunks.push(chunk);
  }
  try { const parsed = JSON.parse(Buffer.concat(chunks).toString('utf8')); if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error(); return parsed; }
  catch { throw Object.assign(new Error('올바른 JSON 요청이 필요합니다.'), { status: 400 }); }
}

export function decodeUpload(dataUrl, kind) {
  if (typeof dataUrl !== 'string') throw new Error('파일 데이터가 필요합니다.');
  const matched = /^data:([a-z0-9/+.-]+);base64,([A-Za-z0-9+/]*={0,2})$/.exec(dataUrl);
  const type = matched && types[matched[1]];
  if (!type || type.kind !== kind || matched[2].length % 4 !== 0) throw new Error(kind === 'image' ? 'PNG 또는 JPEG 사진을 넣어 주세요.' : 'WAV, MP3 또는 M4A 음성 파일을 넣어 주세요.');
  const bytes = Buffer.from(matched[2], 'base64');
  if (bytes.length < 16 || bytes.length > maxBytes || !type.valid(bytes)) throw new Error('파일 형식과 내용이 맞지 않거나 크기가 허용 범위를 벗어났습니다.');
  return { bytes, mime: matched[1], extension: type.extension };
}

export function createMediaRouter({ dataDir = join(projectRoot, 'data/media'), pythonPath = process.env.FORMWORKS_PYTHON || join(projectRoot, 'model-service/.venv/Scripts/python.exe'), modelDir = join(projectRoot, 'model-service'), timeoutMs = Number(process.env.FORMWORKS_MODEL_TIMEOUT_MS || 600000) } = {}) {
  mkdirSync(dataDir, { recursive: true });
  const jobsPath = join(dataDir, 'jobs.json');
  const jobs = new Map();
  if (existsSync(jobsPath)) {
    try { for (const job of JSON.parse(readFileSync(jobsPath, 'utf8'))) jobs.set(job.id, ['queued','running'].includes(job.status) ? { ...job, status: 'failed', error: '서버가 재시작되어 작업이 중단됐습니다. 다시 생성해 주세요.' } : job); }
    catch { /* Existing uploads remain available when job history is damaged. */ }
  }
  const save = () => writeFileSync(jobsPath, JSON.stringify([...jobs.values()], null, 2));
  save();
  let ready = {};
  try { ready = JSON.parse(readFileSync(join(modelDir, 'ready.json'), 'utf8')); } catch { /* Models have not been installed and checked yet. */ }
  const capabilities = { imageGeneration: existsSync(pythonPath) && ready.imageGeneration === true, audioTranscription: existsSync(pythonPath) && ready.audioTranscription === true };
  const active = new Map();
  function startJob(media, kind) {
    const id = randomUUID();
    const output = join(dataDir, `${id}.${kind === 'image' ? 'glb' : 'json'}`);
    const job = { id, kind, status: 'running', createdAt: new Date().toISOString(), mediaId: media.id };
    jobs.set(id, job); save();
    const executable = kind === 'image' ? 'generate.py' : 'transcribe.py';
    const child = spawn(pythonPath, [join(modelDir, executable), '--input', join(dataDir, media.filename), '--output', output], {
      cwd: modelDir, windowsHide: true, env: { ...process.env, PYTHONUNBUFFERED: '1', HF_HOME: join(modelDir, 'checkpoints'), TEMP: join(modelDir, '.tmp'), TMP: join(modelDir, '.tmp') },
      stdio: ['ignore','pipe','pipe'],
    });
    active.set(id, child);
    let stderr = ''; let timedOut = false;
    child.stderr.on('data', (chunk) => { stderr = (stderr + chunk.toString()).slice(-4000); });
    child.stdout.on('data', () => {});
    const timer = setTimeout(() => { timedOut = true; child.kill(); }, timeoutMs);
    timer.unref();
    function finish(error) {
      if (job.status !== 'running') return;
      clearTimeout(timer); active.delete(id); job.finishedAt = new Date().toISOString();
      try {
        if (error) throw error;
        const bytes = readFileSync(output);
        if (kind === 'image') {
          if (bytes.length < 20 || bytes.toString('ascii',0,4) !== 'glTF') throw new Error('생성된 3D 파일을 읽을 수 없습니다.');
          job.modelUrl = `/uploads/${id}.glb`;
        } else {
          const result = JSON.parse(bytes.toString('utf8'));
          if (typeof result.text !== 'string' || !result.text.trim()) throw new Error('음성을 인식하지 못했습니다. 텍스트로 요청을 넣어 주세요.');
          job.text = result.text; job.language = result.language;
        }
        job.status = 'completed';
      } catch (cause) {
        job.status = 'failed'; job.error = timedOut ? '처리 시간이 초과됐습니다. 더 작은 파일로 다시 시도해 주세요.' : String(cause.message).slice(0,1200);
        rmSync(output, { force: true });
      }
      save();
    }
    child.once('error', (error) => finish(new Error(`모델 실행기를 시작할 수 없습니다: ${error.code || error.message}`)));
    child.once('close', (code) => finish(code === 0 ? null : new Error(`모델 실행에 실패했습니다. ${stderr.trim().slice(-1000) || `종료 코드 ${code}`}`)));
    return job;
  }

  async function handle(req, res, url) {
    const path = url instanceof URL ? url.pathname : typeof url === 'string' ? url.split('?')[0] : url?.pathname;
    if (req.method === 'GET' && /^\/uploads\/[a-f0-9-]{36}\.(png|jpg|glb)$/.test(path)) {
      const file = resolve(dataDir, path.slice('/uploads/'.length));
      if (!existsSync(file)) { failure(res,404,'NOT_FOUND','파일을 찾을 수 없습니다.'); return true; }
      const ext = path.split('.').pop();
      res.writeHead(200, { 'Content-Type': ext === 'glb' ? 'model/gltf-binary' : ext === 'png' ? 'image/png' : 'image/jpeg', 'X-Content-Type-Options': 'nosniff', 'Cache-Control': 'private, max-age=3600' });
      res.end(readFileSync(file)); return true;
    }
    if (!path?.startsWith('/api/images') && !path?.startsWith('/api/audio') && !path?.startsWith('/api/jobs')) return false;
    try {
      if (req.method === 'POST' && ['/api/images','/api/audio'].includes(path)) {
        const kind = path === '/api/images' ? 'image' : 'audio';
        let uploaded;
        try { uploaded = decodeUpload((await body(req)).dataUrl, kind); }
        catch (error) { error.status ??= 400; throw error; }
        const id = randomUUID(); const filename = `${id}.${uploaded.extension}`;
        writeFileSync(join(dataDir, filename), uploaded.bytes);
        const media = { id, filename, mime: uploaded.mime, kind, createdAt: new Date().toISOString() };
        writeFileSync(join(dataDir, `${id}.meta.json`), JSON.stringify(media));
        json(res,201,{ id, url: kind === 'image' ? `/uploads/${filename}` : null, mime: uploaded.mime }); return true;
      }
      const generate = /^\/api\/(images|audio)\/([a-f0-9-]{36})\/(generate|transcribe)$/.exec(path);
      if (req.method === 'POST' && generate) {
        const kind = generate[1] === 'images' ? 'image' : 'audio';
        if ((kind === 'image' && generate[3] !== 'generate') || (kind === 'audio' && generate[3] !== 'transcribe')) { failure(res,404,'NOT_FOUND','경로를 찾을 수 없습니다.'); return true; }
        if (!capabilities[kind === 'image' ? 'imageGeneration' : 'audioTranscription']) { failure(res,503,'MODEL_UNAVAILABLE',kind === 'image' ? '이미지 3D 모델을 설치하고 확인한 뒤 사용할 수 있습니다.' : '음성 인식 모델을 설치하고 확인한 뒤 사용할 수 있습니다.'); return true; }
        if (active.size > 0) { failure(res,429,'MODEL_BUSY','다른 모델 작업이 진행 중입니다. 완료 후 다시 시도해 주세요.'); return true; }
        const metadataPath = join(dataDir, `${generate[2]}.meta.json`);
        if (!existsSync(metadataPath)) { failure(res,404,'NOT_FOUND','입력 파일을 찾을 수 없습니다.'); return true; }
        const media = JSON.parse(readFileSync(metadataPath,'utf8'));
        if (media.kind !== kind) { failure(res,400,'INVALID_MEDIA','입력 파일 종류가 맞지 않습니다.'); return true; }
        json(res,202,startJob(media,kind)); return true;
      }
      const jobRoute = /^\/api\/jobs\/([a-f0-9-]{36})$/.exec(path);
      if (req.method === 'GET' && jobRoute) {
        const job = jobs.get(jobRoute[1]);
        if (!job) failure(res,404,'NOT_FOUND','작업을 찾을 수 없습니다.');
        else json(res,200,job);
        return true;
      }
      failure(res,404,'NOT_FOUND','경로를 찾을 수 없습니다.'); return true;
    } catch (error) {
      if (error.status) failure(res,error.status,'INVALID_UPLOAD',error.message);
      else { console.error('Media request failed:',error.message); failure(res,500,'MEDIA_ERROR','파일 처리 중 문제가 생겼습니다. 다시 시도해 주세요.'); }
      return true;
    }
  }
  function resolveSources(input = {}) {
    if (!input || typeof input !== 'object' || Array.isArray(input)) throw new DomainError('INVALID_SOURCES','요청 자료 형식을 확인해 주세요.');
    const allowed = ['requestText','imageId','imageJobId','audioId','audioJobId'];
    if (Object.keys(input).some(key => !allowed.includes(key))) throw new DomainError('INVALID_SOURCES','요청 자료에 지원하지 않는 항목이 있습니다.');
    if (input.requestText !== undefined && (typeof input.requestText !== 'string' || input.requestText.length > 4000)) throw new DomainError('INVALID_SOURCES','요청 원문은 4,000자 이하로 입력해 주세요.');
    const sources = { requestText: input.requestText || '' };
    for (const kind of ['image','audio']) {
      const id = input[`${kind}Id`]; const jobId = input[`${kind}JobId`];
      if (jobId && !id) throw new DomainError('INVALID_SOURCES','모델 결과에 연결된 입력 파일이 필요합니다.');
      if (!id) continue;
      if (typeof id !== 'string' || !/^[a-f0-9-]{36}$/.test(id)) throw new DomainError('INVALID_SOURCES','입력 파일 ID를 확인해 주세요.');
      const path = join(dataDir,`${id}.meta.json`);
      if (!existsSync(path)) throw new DomainError('INVALID_SOURCES','연결한 입력 파일을 찾을 수 없습니다.');
      const metadata = JSON.parse(readFileSync(path,'utf8'));
      if (metadata.kind !== kind) throw new DomainError('INVALID_SOURCES','입력 파일 종류를 확인해 주세요.');
      sources[`${kind}Id`] = id;
      if (kind === 'image') sources.imageUrl = `/uploads/${metadata.filename}`;
      if (jobId) {
        const job = jobs.get(jobId);
        if (!job || job.kind !== kind || job.mediaId !== id || job.status !== 'completed') throw new DomainError('INVALID_SOURCES','입력 자료에 연결된 완료 작업을 찾을 수 없습니다.');
        sources[`${kind}JobId`] = jobId;
        if (kind === 'image') sources.modelUrl = job.modelUrl;
        else sources.transcript = job.text;
      }
    }
    return sources;
  }
  return { handle, capabilities, resolveSources, close() { for (const child of active.values()) child.kill(); } };
}
