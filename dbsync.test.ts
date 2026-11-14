import test from 'node:test';
import assert from 'node:assert/strict';
import { seal, unseal } from './dbsync.ts';

test('seal/unseal: giải mã đúng, bản bị sửa thì từ chối', () => {
  const db = Buffer.from('SQLite format 3\0' + 'x'.repeat(5000));
  const box = seal(db);
  assert.ok(box.length < db.length); // đã nén
  assert.deepEqual(unseal(box), db);
  box[box.length - 1] ^= 1;
  assert.throws(() => unseal(box));
});
