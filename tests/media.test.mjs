import { test } from 'node:test';
import assert from 'node:assert/strict';
import { decodeUpload } from '../server/media.mjs';

test('image upload accepts an actual PNG signature', () => {
  const bytes = Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]), Buffer.alloc(20)]);
  const result = decodeUpload(`data:image/png;base64,${bytes.toString('base64')}`, 'image');
  assert.equal(result.extension,'png'); assert.deepEqual(result.bytes,bytes);
});
test('uploads reject SVG, malformed base64, false MIME, wrong input kind, and oversized files', () => {
  for (const input of [
    'data:image/svg+xml;base64,PHN2Zz48L3N2Zz4=',
    'data:image/png;base64,not-valid-data',
    `data:image/png;base64,${Buffer.alloc(32).toString('base64')}`,
    `data:audio/wav;base64,${Buffer.alloc(32).toString('base64')}`,
  ]) assert.throws(() => decodeUpload(input,'image'));
  const bytes = Buffer.alloc(8 * 1024 * 1024 + 1); Buffer.from([137,80,78,71,13,10,26,10]).copy(bytes);
  assert.throws(() => decodeUpload(`data:image/png;base64,${bytes.toString('base64')}`,'image'));
});
