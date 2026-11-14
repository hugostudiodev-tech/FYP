import test from 'node:test';
import assert from 'node:assert/strict';
import { splitByHeadings } from './lib.ts';

test('splitByHeadings', () => {
  const s = splitByHeadings('intro\n# Scope\nA\n## Kế hoạch\nB\n# Sơ đồ\n```mermaid\ngraph TD; A-->B\n```\nmô tả');
  assert.deepEqual(s.map((x) => [x.title, x.kind]),
    [['Tổng quan', 'overview'], ['Scope', 'scope'], ['Kế hoạch', 'plan'], ['Sơ đồ', 'diagram']]);
  assert.equal(s[3].mermaid, 'graph TD; A-->B');
  assert.equal(s[3].markdown, 'mô tả');
});


import { cleanAnchor } from './lib.ts';
test('cleanAnchor', () => {
  assert.deepEqual(cleanAnchor({ type: 'video', video: 'v1', t: -5 }), { type: 'video', video: 'v1', t: 0 });
  assert.deepEqual(cleanAnchor({ type: 'evil' }), { type: 'general' });
  assert.deepEqual(cleanAnchor(null), { type: 'general' });
  assert.deepEqual(cleanAnchor({ type: 'section', section: 'sab', x: 1 }), { type: 'section', section: 'sab' });
});

import { driveRef } from './lib.ts';
test('driveRef', () => {
  assert.deepEqual(driveRef('https://drive.google.com/file/d/1AbC_def-GHIjkl/view?usp=sharing'), { kind: 'file', id: '1AbC_def-GHIjkl' });
  assert.deepEqual(driveRef('https://drive.google.com/drive/folders/1XyZ0123456789?usp=drive_link'), { kind: 'folder', id: '1XyZ0123456789' });
  assert.deepEqual(driveRef('https://drive.google.com/open?id=1AbC_def-GHIjkl'), { kind: 'file', id: '1AbC_def-GHIjkl' });
  assert.equal(driveRef("https://drive.google.com/file/d/x' or 1=1/view"), null);
  assert.equal(driveRef('https://youtube.com/watch?v=abc'), null);
});

import { validateStudent, parseCookies } from './lib.ts';
test('validateStudent', () => {
  assert.deepEqual(validateStudent({ name: ' Nguyễn  Văn A ', mssv: 'sv2021001', phone: '090 123 4567' }),
    { name: 'Nguyễn Văn A', mssv: 'SV2021001', phone: '0901234567' });
  assert.equal(typeof validateStudent({ name: 'A B', mssv: 'x', phone: '0901234567' }), 'string');
  assert.equal(typeof validateStudent({ name: 'A B', mssv: 'SV2021001', phone: 'abc' }), 'string');
  assert.equal(typeof validateStudent(null), 'string');
});
test('parseCookies', () => {
  assert.deepEqual(parseCookies('a=1; sid=xy%3Dz'), { a: '1', sid: 'xy=z' });
  assert.deepEqual(parseCookies(undefined), {});
});

import { checklistMissing, mergeMissing } from './lib.ts';
test('checklistMissing', () => {
  const long = 'x'.repeat(50);
  const kinds = checklistMissing([
    { title: 'a', kind: 'overview', markdown: long, mermaid: '' },
    { title: 'b', kind: 'scope', markdown: 'ngắn', mermaid: '' }, // quá sơ sài vẫn tính là thiếu
  ]).map((m) => m.kind);
  assert.deepEqual(kinds, ['scope', 'plan', 'architecture', 'protocol', 'result']);
});
test('mergeMissing', () => {
  const a = { id: '1', kind: 'plan' as const, question: 'Timeline?', source: 'ai' as const };
  const b = { id: '2', kind: 'plan' as const, question: ' timeline? ', source: 'ai' as const };
  const c = { id: '3', kind: 'result' as const, question: 'Số liệu?', source: 'ai' as const };
  assert.deepEqual(mergeMissing([a], [b, c, c]).map((m) => m.id), ['1', '3']);
});

test('heading kinds', () => {
  const s = splitByHeadings('# Giới thiệu\nx\n# Kiến trúc hệ thống\nx\n# REST API & xác thực\nx\n# Kết quả kiểm thử\nx');
  assert.deepEqual(s.map((x) => x.kind), ['overview', 'architecture', 'protocol', 'result']);
  assert.equal(splitByHeadings('# Kiến trúc\n```mermaid\ngraph TD; A-->B\n```\nmô tả')[0].kind, 'architecture');
});

import { storyboard, type Shot } from './lib.ts';
test('storyboard', () => {
  const shots: Shot[] = [{ id: 'a', title: 'A', desc: '' }, { id: 'b', title: 'B', desc: '' }, { id: 'c', title: 'C', desc: '' }];
  const sb = storyboard(shots, [
    { id: 'v1', coverage: [{ shotId: 'a', start: 0, end: 30, score: 50, note: '' }, { shotId: 'zzz', start: 30, end: 90, score: 90, note: '' }] },
    { id: 'v2', coverage: [{ shotId: 'a', start: 5, end: 20, score: 85, note: 'quay lại rõ hơn' }, { shotId: 'b', start: 20, end: 40, score: 40, note: '' }] },
  ]);
  assert.deepEqual(sb.cuts.map((c) => [c.shot.id, c.video, c.start]), [['a', 'v2', 5], ['b', 'v2', 20]]); // đoạn quay lại tốt hơn thay thế
  assert.deepEqual(sb.missing.map((s) => s.id), ['c']);
  assert.deepEqual(sb.weak.map((c) => c.shot.id), ['b']);
  assert.equal(sb.pct, 33);
});

import { rubricTotal } from './lib.ts';
test('rubricTotal (UK 0–100)', () => {
  assert.equal(rubricTotal({ func: 72, design: 65, tech: 80, test: 55, report: 70, demo: 90 }), 71); // 7075/100 = 70.75 → 71
  assert.equal(rubricTotal({ func: 72 }), null); // chưa chấm đủ
  assert.equal(rubricTotal({ func: 101, design: 65, tech: 80, test: 55, report: 70, demo: 90 }), null); // ngoài thang
});

import { ukBand } from './lib.ts';
test('ukBand', () => {
  assert.deepEqual([70, 69, 60, 59, 50, 45, 39, 0, 100].map((m) => ukBand(m).short), ['First', '2:1', '2:1', '2:2', '2:2', 'Third', 'Fail', 'Fail', 'First']);
});
