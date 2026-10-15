import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { DEFAULT_SPEC, DomainError, calculatePreview, validateSpec, interpretText, validateSources, csvCell, exportQuoteCsv } from '../server/domain.mjs';
import { createQuoteStore } from '../server/storage.mjs';
import { createApp } from '../server/app.mjs';

const input = (overrides = {}) => ({ customer: '성수 상점', notes: '입구 진열대', spec: { ...DEFAULT_SPEC }, confirmed: true, ...overrides });

test('default BOM and VAT reconcile to an independently calculated integer total', () => {
  const preview = calculatePreview(DEFAULT_SPEC);
  assert.equal(preview.bom.length, 7);
  assert.equal(preview.pricing.materialCost, 363720);
  assert.equal(preview.pricing.laborCost, 80000);
  assert.equal(preview.pricing.marginAmount, 110930);
  assert.equal(preview.pricing.supplyPrice, 554650);
  assert.equal(preview.pricing.vatAmount, 55465);
  assert.equal(preview.pricing.total, 610115);
  assert.equal(preview.pricing.materialCost, preview.bom.reduce((sum, line) => sum + line.lineTotal, 0));
  for (const row of preview.bom) {
    assert.equal(row.lineTotal, row.quantity * row.unitCost);
    assert.equal(Number.isSafeInteger(row.lineTotal), true);
  }
});

test('quantity scales components and labor; wide shelves add physical center support', () => {
  const doubled = calculatePreview({ ...DEFAULT_SPEC, quantity: 2 });
  assert.equal(doubled.pricing.total, 1220230);
  assert.equal(doubled.bom.find(line => line.id === 'legs').quantity, 8);
  const wide = calculatePreview({ ...DEFAULT_SPEC, widthMm: 1600 });
  assert.equal(wide.bom.find(line => line.id === 'legs').quantity, 6);
  assert.equal(wide.bom.find(line => line.id === 'center-rails').quantity, 3);
  assert.equal(wide.geometry.centerSupport, true);
  assert.equal(calculatePreview({ ...DEFAULT_SPEC, material: 'steel' }).geometry.panelThicknessMm, 2);
  const oddRounding = calculatePreview({ ...DEFAULT_SPEC, material: 'steel', quantity: 3 });
  assert.equal(oddRounding.pricing.unitSupplyPrice * 3, oddRounding.pricing.supplyPrice);
});

test('spec does not coerce strings, booleans, arrays, nonfinite or fractional values', () => {
  for (const field of ['widthMm', 'depthMm', 'heightMm', 'shelves', 'quantity']) {
    for (const invalid of ['1200', true, null, undefined, Infinity, NaN, 3.5]) {
      assert.throws(() => validateSpec({ ...DEFAULT_SPEC, [field]: invalid }), error => Boolean(error instanceof DomainError && error.fields[field]));
    }
  }
  assert.throws(() => validateSpec([]), { code: 'INVALID_SPEC' });
  assert.throws(() => validateSpec({ ...DEFAULT_SPEC, material: 'aluminum' }), { code: 'INVALID_SPEC' });
});

test('geometry rejects inaccessible shelf gaps and tall narrow structures', () => {
  assert.throws(() => validateSpec({ ...DEFAULT_SPEC, heightMm: 600, shelves: 5 }), error => Boolean(error.fields.shelves));
  assert.throws(() => validateSpec({ ...DEFAULT_SPEC, depthMm: 250, heightMm: 2000 }), error => Boolean(error.fields.depthMm));
  assert.throws(() => validateSpec({ ...DEFAULT_SPEC, widthMm: -200 }), { code: 'INVALID_SPEC' });
  assert.throws(() => validateSpec({ ...DEFAULT_SPEC, heightMm: 800, shelves: 4 }), error => Boolean(error.fields.shelves));
  assert.throws(() => validateSpec({ ...DEFAULT_SPEC, heightMm: 831, shelves: 4 }), error => Boolean(error.fields.shelves));
  assert.equal(calculatePreview({ ...DEFAULT_SPEC, heightMm: 832, shelves: 4 }).geometry.minimumClearanceMm, 180);
});

test('Korean and English dimensions interpret mm/cm/m and only explicitly mentioned fields', () => {
  const result = interpretText('폭 120cm, 깊이 0.45m, 높이 1,500mm, 선반 세 개, 자작합판', DEFAULT_SPEC);
  assert.deepEqual(result.changes, { widthMm: 1200, depthMm: 450, heightMm: 1500, shelves: 3, material: 'birch' });
  assert.equal(result.spec.quantity, 1);
  const english = interpretText('width: 1.6m, depth 500mm, height 180cm, shelves to 4, steel, quantity 2', DEFAULT_SPEC);
  assert.deepEqual(english.changes, { widthMm: 1600, depthMm: 500, heightMm: 1800, shelves: 4, material: 'steel', quantity: 2 });
  const partial = interpretText('선반 하나 추가', DEFAULT_SPEC);
  assert.deepEqual(partial.changes, { shelves: 4 });
  assert.equal(partial.spec.widthMm, DEFAULT_SPEC.widthMm);
  assert.equal(partial.spec.material, DEFAULT_SPEC.material);
  assert.equal(DEFAULT_SPEC.shelves, 3);
});

test('relative dimensions and shelf counts use current state in both languages', () => {
  assert.deepEqual(interpretText('폭을 10cm 늘리고 높이는 20cm 줄여', DEFAULT_SPEC).changes, { widthMm: 1300, heightMm: 1300 });
  assert.equal(interpretText('선반 한 개 줄여', DEFAULT_SPEC).spec.shelves, 2);
  assert.equal(interpretText('add one shelf', DEFAULT_SPEC).spec.shelves, 4);
  assert.equal(interpretText('remove one shelf', DEFAULT_SPEC).spec.shelves, 2);
  assert.equal(interpretText('increase width by 100mm', DEFAULT_SPEC).spec.widthMm, 1300);
  assert.equal(interpretText('reduce height by 100mm', DEFAULT_SPEC).spec.heightMm, 1400);
  assert.equal(interpretText('폭 +100mm', DEFAULT_SPEC).spec.widthMm, 1300);
});

test('explicit target measurements do not become relative deltas', () => {
  assert.equal(interpretText('폭을 100cm로 줄여 주세요', DEFAULT_SPEC).spec.widthMm, 1000);
  assert.equal(interpretText('선반 4개로 늘려 주세요', DEFAULT_SPEC).spec.shelves, 4);
  assert.equal(interpretText('increase width to 1400mm', DEFAULT_SPEC).spec.widthMm, 1400);
  assert.equal(interpretText('reduce height to 1200mm', DEFAULT_SPEC).spec.heightMm, 1200);
  assert.equal(interpretText('increase shelves to 4', DEFAULT_SPEC).spec.shelves, 4);
  assert.equal(interpretText('increase shelves to four', DEFAULT_SPEC).spec.shelves, 4);
  assert.equal(interpretText('선반 네 개까지 늘려 주세요', DEFAULT_SPEC).spec.shelves, 4);
  assert.equal(interpretText('폭을 10cm 줄여 주세요', DEFAULT_SPEC).spec.widthMm, 1100);
  assert.equal(interpretText('선반 한 개 추가', DEFAULT_SPEC).spec.shelves, 4);
});

test('unspecified, ambiguous, negative and unsupported intent is explicit', () => {
  const unrecognized = interpretText('사진처럼 예쁘게 해줘', DEFAULT_SPEC);
  assert.deepEqual(unrecognized.changes, {});
  assert.match(unrecognized.warnings.join(' '), /변경을 찾지/);
  assert.throws(() => interpretText('폭 -100cm', DEFAULT_SPEC), { code: 'INVALID_SPEC' });
  assert.throws(() => interpretText('높이 1.0001m', DEFAULT_SPEC), { code: 'INVALID_TEXT' });
  assert.throws(() => interpretText('', DEFAULT_SPEC), { code: 'INVALID_TEXT' });
  assert.throws(() => interpretText('선반 하나 추가'), { code: 'INVALID_SPEC' });
  assert.throws(() => interpretText('폭을 100mm 늘리고 줄여', DEFAULT_SPEC), { code: 'AMBIGUOUS_TEXT' });
  const missingCount = interpretText('선반 추가', DEFAULT_SPEC);
  assert.deepEqual(missingCount.changes, {});
  assert.match(missingCount.warnings.join(' '), /몇 개/);
  const unknownMaterial = interpretText('알루미늄으로 만들어줘', DEFAULT_SPEC);
  assert.equal(unknownMaterial.changes.material, undefined);
  assert.match(unknownMaterial.warnings.join(' '), /재료를 선택/);
});

test('unlabeled triples require a visible interpretation warning', () => {
  const result = interpretText('120 × 40 × 150 cm 진열대', DEFAULT_SPEC);
  assert.deepEqual(result.changes, { widthMm: 1200, depthMm: 400, heightMm: 1500 });
  assert.match(result.warnings.join(' '), /폭 × 깊이 × 높이/);
});

test('quote prices are server-authoritative and confirmation is mandatory', () => {
  const store = createQuoteStore(':memory:');
  try {
    assert.throws(() => store.create(input({ confirmed: false })), { code: 'INVALID_QUOTE' });
    assert.throws(() => store.create(input({ customer: '' })), { code: 'INVALID_QUOTE' });
    const quote = store.create(input({ pricing: { total: 1 }, bom: [] }));
    assert.equal(quote.pricing.total, 610115);
    assert.equal(quote.status, 'draft');
    assert.equal(quote.revision, 1);
    assert.equal(quote.history.length, 1);
    assert.equal(quote.geometry.panelThicknessMm, 18);
    assert.equal(quote.audit[0].details.dimensionsConfirmed, true);
  } finally { store.close(); }
});

test('edits invalidate sent offers and stale editing/status clients conflict', () => {
  const store = createQuoteStore(':memory:');
  try {
    const initial = store.create(input());
    const sent = store.transition(initial.id, { status: 'sent', expectedRevision: 1 });
    assert.equal(sent.revision, 2);
    assert.throws(() => store.revise(initial.id, input({ expectedRevision: 1 })), { code: 'REVISION_CONFLICT' });
    assert.throws(() => store.transition(initial.id, { status: 'approved', expectedRevision: 1 }), { code: 'REVISION_CONFLICT' });
    const revised = store.revise(initial.id, input({ expectedRevision: 2, spec: { ...DEFAULT_SPEC, shelves: 4 } }));
    assert.equal(revised.status, 'draft');
    assert.equal(revised.revision, 3);
    assert.equal(revised.history[0].type, 'revised');
    assert.throws(() => store.transition(initial.id, { status: 'ordered', expectedRevision: 3 }), { code: 'INVALID_TRANSITION' });
    assert.throws(() => store.transition(initial.id, { status: 'sent', expectedRevision: '3' }), { code: 'INVALID_REVISION' });
  } finally { store.close(); }
});

test('approval snapshot and audit are immutable including after order placement', () => {
  const store = createQuoteStore(':memory:');
  try {
    const quote = store.create(input());
    store.transition(quote.id, { status: 'sent', expectedRevision: 1 });
    const approved = store.transition(quote.id, { status: 'approved', expectedRevision: 2 });
    assert.equal(approved.approvedRevision, 3);
    assert.throws(() => store.revise(quote.id, input({ expectedRevision: 3 })), { code: 'QUOTE_LOCKED' });
    assert.throws(() => store.db.prepare('UPDATE quotes SET pricing_json=? WHERE id=?').run('{"total":1}', quote.id), /immutable/);
    assert.throws(() => store.db.prepare('UPDATE quote_revisions SET customer=? WHERE quote_id=?').run('tampered', quote.id), /immutable/);
    assert.throws(() => store.db.prepare('DELETE FROM quote_audit WHERE quote_id=?').run(quote.id), /immutable/);
    const ordered = store.transition(quote.id, { status: 'ordered', expectedRevision: 3 });
    assert.equal(ordered.revision, 4);
    assert.equal(ordered.approvedRevision, 3);
    assert.equal(ordered.pricing.total, approved.pricing.total);
    assert.deepEqual(ordered.history.find(item => item.revision === 3), approved.history[0]);
    assert.equal(ordered.audit.length, 4);
  } finally { store.close(); }
});

test('quote data and complete history persist across database reopening', () => {
  const folder = mkdtempSync(join(tmpdir(), 'formworks-domain-'));
  const dbPath = join(folder, 'quotes.sqlite');
  let store = createQuoteStore(dbPath);
  try {
    const quote = store.create(input());
    store.revise(quote.id, input({ expectedRevision: 1, notes: '선반 변경', spec: { ...DEFAULT_SPEC, shelves: 4 } }));
    store.close();
    store = createQuoteStore(dbPath);
    const restored = store.get(quote.id);
    assert.equal(restored.revision, 2);
    assert.equal(restored.spec.shelves, 4);
    assert.equal(restored.history.length, 2);
    assert.equal(restored.history[1].spec.shelves, 3);
    assert.equal(restored.audit.length, 2);
    assert.equal(store.list().length, 1);
  } finally { store.close(); rmSync(folder, { recursive: true, force: true }); }
});

const sourceIds = {
  image: '11111111-1111-4111-8111-111111111111', imageJob: '22222222-2222-4222-8222-222222222222',
  audio: '33333333-3333-4333-8333-333333333333', audioJob: '44444444-4444-4444-8444-444444444444',
};
const sourceFixture = () => ({
  requestText: '폭 120cm, 사진처럼 만들어 주세요',
  imageId: sourceIds.image, imageUrl: `/uploads/${sourceIds.image}.png`,
  imageJobId: sourceIds.imageJob, modelUrl: `/uploads/${sourceIds.imageJob}.glb`,
  audioId: sourceIds.audio, audioJobId: sourceIds.audioJob, transcript: '선반 세 개로 만들어 주세요',
});

test('canonical sources reject remote paths, mismatched IDs and unbounded text', () => {
  assert.deepEqual(validateSources(), {});
  assert.deepEqual(validateSources({ requestText: '' }), { requestText: '' });
  assert.deepEqual(validateSources(sourceFixture()), sourceFixture());
  for (const change of [
    { imageId: '../../secret' }, { imageUrl: 'https://example.com/model.png' },
    { imageUrl: '/uploads/../secret.png' }, { imageUrl: `/uploads/${sourceIds.audio}.png` },
    { modelUrl: `/uploads/${sourceIds.image}.glb` }, { requestText: 'x'.repeat(4001) },
    { transcript: true }, { audioId: undefined }, { imageId: undefined },
  ]) assert.throws(() => validateSources({ ...sourceFixture(), ...change }), { code: 'INVALID_SOURCES' });
  assert.throws(() => validateSources(null), { code: 'INVALID_SOURCES' });
});

test('source snapshots survive revisions, approval and reopening without mutable references', () => {
  const folder = mkdtempSync(join(tmpdir(), 'formworks-sources-'));
  const dbPath = join(folder, 'quotes.sqlite');
  let store = createQuoteStore(dbPath);
  try {
    const originalSources = sourceFixture();
    const initial = store.create(input({ sources: originalSources }));
    originalSources.requestText = '외부 객체 변경';
    assert.equal(store.get(initial.id).sources.requestText, sourceFixture().requestText);
    const nextSources = { ...sourceFixture(), requestText: '선반 하나 추가', transcript: '선반을 하나 추가해 주세요' };
    const revised = store.revise(initial.id, input({ expectedRevision: 1, sources: nextSources, spec: { ...DEFAULT_SPEC, shelves: 4 } }));
    assert.deepEqual(revised.history.find(item => item.revision === 1).sources, sourceFixture());
    assert.deepEqual(revised.audit[0].details.sources, nextSources);
    store.transition(initial.id, { status: 'sent', expectedRevision: 2 });
    const approved = store.transition(initial.id, { status: 'approved', expectedRevision: 3 });
    assert.equal(approved.approvedRevision, 4);
    assert.throws(() => store.db.prepare('UPDATE quotes SET sources_json=? WHERE id=?').run('{}', initial.id), /immutable/);
    assert.throws(() => store.revise(initial.id, input({ expectedRevision: 4, sources: {} })), { code: 'QUOTE_LOCKED' });
    store.close();
    store = createQuoteStore(dbPath);
    const restored = store.get(initial.id);
    assert.deepEqual(restored.sources, nextSources);
    assert.deepEqual(restored.history.find(item => item.revision === 1).sources, sourceFixture());
    assert.deepEqual(store.list()[0].sources, nextSources);
  } finally { store.close(); rmSync(folder, { recursive: true, force: true }); }
});

test('additive source migration preserves existing quotes and revision history', () => {
  const folder = mkdtempSync(join(tmpdir(), 'formworks-migration-'));
  const dbPath = join(folder, 'quotes.sqlite');
  let store = createQuoteStore(dbPath);
  try {
    const initial = store.create(input());
    store.close();
    const oldDb = new DatabaseSync(dbPath);
    try {
      // Simulate the first MVP schema, which had no source columns.
      oldDb.exec('DROP TRIGGER immutable_approved_quote_sources; ALTER TABLE quotes DROP COLUMN sources_json; ALTER TABLE quote_revisions DROP COLUMN sources_json;');
    } finally { oldDb.close(); }
    store = createQuoteStore(dbPath);
    const migrated = store.get(initial.id);
    assert.deepEqual(migrated.sources, {});
    assert.deepEqual(migrated.history[0].sources, {});
    assert.equal(migrated.pricing.total, 610115);
    const revised = store.revise(initial.id, input({ expectedRevision: 1, sources: { requestText: '사진 원본 없는 기존 견적 수정' } }));
    assert.equal(revised.sources.requestText, '사진 원본 없는 기존 견적 수정');
    assert.equal(revised.history.length, 2);
  } finally { store.close(); rmSync(folder, { recursive: true, force: true }); }
});

test('CSV escaping neutralizes spreadsheet formulas and retains Korean text', () => {
  for (const malicious of ['=HYPERLINK("https://example.com")', '+SUM(1,1)', '-1+1', '@SUM(1)', '  =1+1', '\t=1+1', '\r=1+1']) {
    assert.ok(csvCell(malicious).startsWith('"\''));
  }
  assert.equal(csvCell('성수 "상점"'), '"성수 ""상점"""');
  const quote = { id: 'test', revision: 1, status: 'draft', customer: '=1+1', notes: '+2', ...calculatePreview(DEFAULT_SPEC) };
  const csv = exportQuoteCsv(quote);
  assert.ok(csv.startsWith('\uFEFF'));
  assert.ok(csv.includes('"\'=1+1"'));
  assert.ok(csv.includes('"\'+2"'));
});

test('HTTP validates payloads and origin before persistent mutations', async () => {
  const app = createApp({ dbPath: ':memory:', staticDir: join(tmpdir(), 'formworks-no-static'), logger: { error() {} } });
  await new Promise(resolve => app.server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${app.server.address().port}`;
  const post = (path, data, headers = {}) => fetch(base + path, { method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(data) });
  try {
    const health = await (await fetch(base + '/api/health')).json();
    assert.equal(health.status, 'ok');
    assert.equal(health.capabilities.imageGeneration, false);
    assert.equal((await post('/api/quotes', input(), { Origin: 'https://attacker.example' })).status, 403);
    assert.equal((await post('/api/quotes', input(), { 'Content-Type': 'text/plain' })).status, 400);
    const invalid = await post('/api/preview', { spec: { ...DEFAULT_SPEC, widthMm: true } });
    assert.equal(invalid.status, 400);
    assert.equal((await invalid.json()).error.code, 'INVALID_SPEC');
    const created = await post('/api/quotes', input(), { Origin: 'http://127.0.0.1:4325' });
    assert.equal(created.status, 201);
    const { quote } = await created.json();
    assert.equal((await post(`/api/quotes/${quote.id}/status`, { status: 'sent', expectedRevision: 1 })).status, 200);
    const stale = await post(`/api/quotes/${quote.id}/revisions`, input({ expectedRevision: 1 }));
    assert.equal(stale.status, 409);
    assert.equal((await stale.json()).error.code, 'REVISION_CONFLICT');
    assert.equal((await fetch(base + `/api/quotes/${quote.id}/export.csv`)).headers.get('content-type'), 'text/csv; charset=utf-8');
    assert.equal((await fetch(base + '/api/quotes/00000000-0000-0000-0000-000000000000')).status, 404);
    assert.equal((await fetch(base + '/api/unknown')).status, 404);
    assert.equal((await fetch(base + '/missing.js')).status, 404);
    const fakeSource = await post('/api/quotes', input({ sources: sourceFixture() }));
    assert.equal(fakeSource.status, 400);
    assert.equal((await fakeSource.json()).error.code, 'SOURCE_RESOLVER_UNAVAILABLE');
    assert.equal(app.store.list().length, 1);
  } finally { await app.close(); }
});

test('HTTP resolves sources server-side before saving and ignores forged URLs', async () => {
  let resolvedInput;
  const app = createApp({ dbPath: ':memory:', resolveSources: sources => {
    resolvedInput = sources;
    if (sources?.imageId !== sourceIds.image) throw new DomainError('INVALID_SOURCES', '이미지 원본을 찾을 수 없습니다.');
    return sourceFixture();
  }, logger: { error() {} } });
  await new Promise(resolve => app.server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${app.server.address().port}`;
  const post = (path, value) => fetch(base + path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(value) });
  try {
    const rawSources = { imageId: sourceIds.image, imageJobId: sourceIds.imageJob, imageUrl: 'https://forged.example/file.png' };
    const created = await post('/api/quotes', input({ sources: rawSources }));
    assert.equal(created.status, 201);
    const { quote } = await created.json();
    assert.deepEqual(resolvedInput, rawSources);
    assert.deepEqual(quote.sources, sourceFixture());
    assert.deepEqual(quote.history[0].sources, sourceFixture());
    assert.equal((await post('/api/quotes', input({ sources: { imageId: sourceIds.audio } }))).status, 400);
    const revised = await post(`/api/quotes/${quote.id}/revisions`, input({ expectedRevision: 1, sources: rawSources }));
    assert.equal(revised.status, 200);
    assert.deepEqual((await revised.json()).quote.sources, sourceFixture());
  } finally { await app.close(); }
});
