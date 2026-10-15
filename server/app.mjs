import { createServer } from 'node:http';
import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { resolve, extname, sep } from 'node:path';
import { createQuoteStore } from './storage.mjs';
import { DomainError, calculatePreview, interpretText, exportQuoteCsv, validateSources } from './domain.mjs';

const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg',
  '.woff': 'font/woff', '.woff2': 'font/woff2', '.ico': 'image/x-icon', '.glb': 'model/gltf-binary' };

export function sendJson(res, status, data) {
  const body = JSON.stringify(data);
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Content-Length': Buffer.byteLength(body), 'Cache-Control': 'no-store' });
  res.end(body);
}

export async function readJson(req, maxBytes = 262144) {
  if (!/^application\/json(?:\s*;|$)/i.test(req.headers['content-type'] ?? '')) throw new DomainError('INVALID_CONTENT_TYPE', 'JSON 형식으로 요청해 주세요.');
  const declaredLength = Number(req.headers['content-length']);
  if (Number.isFinite(declaredLength) && declaredLength > maxBytes) throw new DomainError('PAYLOAD_TOO_LARGE', '요청 데이터가 너무 큽니다.');
  let total = 0;
  const chunks = [];
  for await (const chunk of req) {
    total += chunk.length;
    if (total > maxBytes) throw new DomainError('PAYLOAD_TOO_LARGE', '요청 데이터가 너무 큽니다.');
    chunks.push(chunk);
  }
  try {
    const parsed = JSON.parse(Buffer.concat(chunks).toString('utf8'));
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('Invalid JSON object');
    return parsed;
  } catch { throw new DomainError('INVALID_JSON', '올바른 JSON 객체를 보내 주세요.'); }
}

export function createApp({ dbPath = resolve('data/formworks.sqlite'), staticDir = resolve('dist'), apiHandler,
  resolveSources, capabilities = {}, allowedOrigins = ['http://localhost:4325', 'http://127.0.0.1:4325'], logger = console } = {}) {
  const store = createQuoteStore(dbPath);
  const staticRoot = resolve(staticDir);
  function canonicalSources(input) {
    if (resolveSources) return validateSources(resolveSources(input));
    const validated = validateSources(input);
    if (Object.keys(validated).some(key => key !== 'requestText')) throw new DomainError('SOURCE_RESOLVER_UNAVAILABLE', '저장된 파일을 확인할 수 없습니다. 원본 연결 기능을 구성해 주세요.', undefined, 400);
    return validated;
  }
  const server = createServer(async (req, res) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'same-origin');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; media-src 'self' blob:; font-src 'self'; connect-src 'self'; worker-src 'self' blob:; frame-ancestors 'none'; base-uri 'self'");
    try {
      const url = new URL(req.url, 'http://localhost');
      if (url.pathname.startsWith('/api/') && !['GET', 'HEAD'].includes(req.method)) {
        const origin = req.headers.origin;
        const loopbackHost = /^(?:localhost|127\.0\.0\.1|\[::1\])(?::\d+)?$/i.test(req.headers.host ?? '');
        const ownOrigins = loopbackHost ? [`http://${req.headers.host}`, `https://${req.headers.host}`] : [];
        if (origin && !ownOrigins.includes(origin) && !allowedOrigins.includes(origin)) throw new DomainError('ORIGIN_REJECTED', '허용되지 않은 출처의 요청입니다.', undefined, 403);
        if (!/^application\/json(?:\s*;|$)/i.test(req.headers['content-type'] ?? '')) throw new DomainError('INVALID_CONTENT_TYPE', 'JSON 형식으로 요청해 주세요.');
      }
      if (req.method === 'GET' && url.pathname === '/api/health') {
        return sendJson(res, 200, { status: 'ok', capabilities: { imageGeneration: false, audioTranscription: false, ...capabilities } });
      }
      if (req.method === 'POST' && url.pathname === '/api/preview') {
        const input = await readJson(req);
        return sendJson(res, 200, calculatePreview(input.spec));
      }
      if (req.method === 'POST' && url.pathname === '/api/interpret') {
        const input = await readJson(req);
        return sendJson(res, 200, interpretText(input.text, input.currentSpec));
      }
      if (url.pathname === '/api/quotes') {
        if (req.method === 'GET') return sendJson(res, 200, { quotes: store.list() });
        if (req.method === 'POST') {
          const input = await readJson(req);
          input.sources = canonicalSources(input.sources);
          return sendJson(res, 201, { quote: store.create(input) });
        }
      }
      const quoteRoute = /^\/api\/quotes\/([a-f0-9-]{36})(?:\/(revisions|status|export\.csv|export\.json))?$/.exec(url.pathname);
      if (quoteRoute) {
        const [, id, action] = quoteRoute;
        if (!action && req.method === 'GET') return sendJson(res, 200, { quote: store.get(id) });
        if (action === 'revisions' && req.method === 'POST') {
          const input = await readJson(req);
          input.sources = canonicalSources(input.sources);
          return sendJson(res, 200, { quote: store.revise(id, input) });
        }
        if (action === 'status' && req.method === 'POST') return sendJson(res, 200, { quote: store.transition(id, await readJson(req)) });
        if (action === 'export.json' && req.method === 'GET') {
          res.setHeader('Content-Disposition', `attachment; filename="formworks-${id}.json"`);
          return sendJson(res, 200, store.get(id));
        }
        if (action === 'export.csv' && req.method === 'GET') {
          const body = exportQuoteCsv(store.get(id));
          res.writeHead(200, { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': `attachment; filename="formworks-${id}.csv"`, 'Cache-Control': 'no-store' });
          return res.end(body);
        }
      }
      if (url.pathname.startsWith('/api/')) {
        if (apiHandler && await apiHandler(req, res, url)) return;
        throw new DomainError('NOT_FOUND', '요청한 API를 찾을 수 없습니다.', undefined, 404);
      }
      if (url.pathname.startsWith('/uploads/')) {
        if (apiHandler && await apiHandler(req, res, url)) return;
        throw new DomainError('NOT_FOUND', '업로드 파일을 찾을 수 없습니다.', undefined, 404);
      }
      if (!['GET', 'HEAD'].includes(req.method)) throw new DomainError('NOT_FOUND', '요청한 페이지를 찾을 수 없습니다.', undefined, 404);
      let decodedPath;
      try { decodedPath = decodeURIComponent(url.pathname); } catch { throw new DomainError('INVALID_PATH', '경로를 확인해 주세요.'); }
      if (decodedPath.includes('\0') || decodedPath.includes('\\') || decodedPath.split('/').includes('..')) throw new DomainError('INVALID_PATH', '경로를 확인해 주세요.');
      let filePath = resolve(staticRoot, `.${decodedPath}`);
      if (filePath !== staticRoot && !filePath.startsWith(staticRoot + sep)) throw new DomainError('NOT_FOUND', '페이지를 찾을 수 없습니다.', undefined, 404);
      let fileStat = await stat(filePath).catch(() => null);
      if (!fileStat?.isFile()) {
        // SPA navigation may fall back to the shell; missing assets should be a real 404.
        if (extname(decodedPath)) throw new DomainError('NOT_FOUND', '파일을 찾을 수 없습니다.', undefined, 404);
        filePath = resolve(staticRoot, 'index.html');
        fileStat = await stat(filePath).catch(() => null);
      }
      if (!fileStat?.isFile()) throw new DomainError('UI_NOT_BUILT', '화면을 빌드한 후 실행해 주세요.', undefined, 404);
      res.writeHead(200, { 'Content-Type': MIME[extname(filePath)] ?? 'application/octet-stream', 'Content-Length': fileStat.size,
        'Cache-Control': extname(filePath) === '.html' ? 'no-cache' : 'public, max-age=3600' });
      if (req.method === 'HEAD') return res.end();
      createReadStream(filePath).on('error', error => { logger.error?.('Static file read failed', error); res.destroy(); }).pipe(res);
    } catch (error) {
      if (res.headersSent) return res.destroy();
      if (error instanceof DomainError) return sendJson(res, error.status, { error: { code: error.code, message: error.message, ...(error.fields ? { fields: error.fields } : {}) } });
      logger.error?.('Request failed', error);
      return sendJson(res, 500, { error: { code: 'INTERNAL_ERROR', message: '서버 처리 중 문제가 생겼습니다.' } });
    }
  });
  server.requestTimeout = 30000;
  server.headersTimeout = 10000;
  return {
    server, db: store.db, store,
    close: () => new Promise((resolveClose, reject) => {
      if (!server.listening) { store.close(); resolveClose(); return; }
      server.close(error => { store.close(); if (error) reject(error); else resolveClose(); });
      server.closeIdleConnections();
    }),
  };
}
