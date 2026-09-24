import test from 'node:test';
import assert from 'node:assert/strict';
import { presentHeaderStatus } from '../src/header-status.js';

test('save failure and PWA update remain separately visible during a run', () => {
  assert.deepEqual(
    presentHeaderStatus({
      saveMessage: 'この端末では保存できません',
      pwaMessage: '更新版を利用できます。再読み込みしてください',
      gameStatus: 'gathering'
    }),
    {
      saveStatus: 'この端末では保存できません',
      pwaStatus: '更新版を利用できます。再読み込みしてください',
      gameStatusLabel: '月光を集めています'
    }
  );
});

test('ready-to-prestige status is distinct from normal moonlight gathering', () => {
  assert.equal(
    presentHeaderStatus({ gameStatus: 'prestige-ready' }).gameStatusLabel,
    '転生の準備が整いました'
  );
  assert.equal(
    presentHeaderStatus({ gameStatus: 'unknown' }).gameStatusLabel,
    '月光を集めています'
  );
});
