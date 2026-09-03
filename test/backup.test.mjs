import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
require('../public/backup.js');
const B = globalThis.PassBackup;

test('backupFileName：格式与补零', () => {
  const d = new Date(2026, 8, 3, 14, 5, 9); // 2026-09-03 14:05:09 本地
  assert.equal(B.backupFileName(d), 'passbook-20260903-140509.db');
  assert.equal(B.backupFileName(new Date(2026, 0, 1, 1, 0, 0)), 'passbook-20260101-010000.db');
});

test('backupFileName：非法日期抛错', () => {
  assert.throws(() => B.backupFileName(new Date('x')));
});

test('parseBackupName：往返一致', () => {
  const d = B.parseBackupName('passbook-20260903-140509.db');
  assert.ok(d instanceof Date);
  assert.equal(d.getFullYear(), 2026);
  assert.equal(d.getMonth(), 8);
  assert.equal(d.getDate(), 3);
  assert.equal(d.getHours(), 14);
});

test('parseBackupName：非法名返回 null', () => {
  assert.equal(B.parseBackupName('random.db'), null);
  assert.equal(B.parseBackupName('passbook-20261301-000000.db'), null); // 13 月
  assert.equal(B.parseBackupName('passbook-20260231-000000.db'), null); // 2 月 31 日进位
  assert.equal(B.parseBackupName(''), null);
  assert.equal(B.parseBackupName(null), null);
});

test('sortDesc：按时间降序，非法排最后', () => {
  const r = B.sortDesc([
    'passbook-20260101-000000.db',
    'junk.txt',
    'passbook-20270505-120000.db',
    'passbook-20260102-000000.db',
  ]);
  assert.equal(r[0], 'passbook-20270505-120000.db');
  assert.equal(r[1], 'passbook-20260102-000000.db');
  assert.equal(r[2], 'passbook-20260101-000000.db');
  assert.equal(r[3], 'junk.txt');
});

test('toDelete：保留最新 N 份，清掉更旧的与非法名', () => {
  const del = B.toDelete([
    'passbook-20260101-000000.db', // 最旧
    'passbook-20260102-000000.db',
    'passbook-20260103-000000.db',
    'junk.db',
  ], 2);
  assert.equal(del.length, 2);
  assert.ok(del.includes('passbook-20260101-000000.db'));
  assert.ok(del.includes('junk.db'));
});

test('toDelete：份数不足时无删除', () => {
  const del = B.toDelete(['passbook-20260101-000000.db'], 5);
  assert.deepEqual(del, []);
});

test('toDelete：keepN=0 全删', () => {
  const del = B.toDelete(['passbook-20260101-000000.db', 'passbook-20260102-000000.db'], 0);
  assert.equal(del.length, 2);
});

test('shouldAutoBackup：未启用', () => {
  assert.equal(B.shouldAutoBackup({ enabled: false, lastBackupAt: null }), false);
});

test('shouldAutoBackup：从未备份', () => {
  assert.equal(B.shouldAutoBackup({ enabled: true, lastBackupAt: null }), true);
});

test('shouldAutoBackup：间隔内不备份，超时备份', () => {
  const now = new Date(2026, 8, 3, 12, 0, 0);
  const last = new Date(2026, 8, 3, 11, 30, 0); // 30 分钟前
  assert.equal(B.shouldAutoBackup({ enabled: true, lastBackupAt: last, now, intervalMin: 60 }), false);
  assert.equal(B.shouldAutoBackup({ enabled: true, lastBackupAt: last, now, intervalMin: 15 }), true);
});

test('shouldAutoBackup：默认 60 分钟', () => {
  const now = new Date(2026, 8, 3, 12, 0, 0);
  const last = new Date(2026, 8, 3, 10, 59, 0); // 61 分钟前
  assert.equal(B.shouldAutoBackup({ enabled: true, lastBackupAt: last.toISOString(), now }), true);
});

test('formatBackupLabel：中文界面时间格式', () => {
  assert.equal(B.formatBackupLabel('passbook-20260903-140509.db'), '2026-09-03 14:05:09');
  assert.equal(B.formatBackupLabel('junk'), 'junk');
});

test('formatSize：B / KiB / MiB', () => {
  assert.equal(B.formatSize(0), '0 B');
  assert.equal(B.formatSize(512), '512 B');
  assert.equal(B.formatSize(2048), '2.0 KiB');
  assert.equal(B.formatSize(3 * 1024 * 1024), '3.00 MiB');
});

test('idb 键前缀工具', () => {
  assert.equal(B.idbKey('x.db'), 'backup:x.db');
  assert.equal(B.isIdbBackupKey('backup:x.db'), true);
  assert.equal(B.isIdbBackupKey('db'), false);
  assert.equal(B.nameFromIdbKey('backup:x.db'), 'x.db');
  assert.equal(B.nameFromIdbKey('db'), null);
});
