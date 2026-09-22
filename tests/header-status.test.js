import test from 'node:test';
import assert from 'node:assert/strict';
import { presentHeaderStatus } from '../src/header-status.js';

test('save failure and PWA update remain separately visible', () => {
  assert.deepEqual(
    presentHeaderStatus({
      saveMessage: 'この端末では保存できません',
      pwaMessage: '更新版を利用できます。再読み込みしてください',
      gameStatus: 'playing'
    }),
    {
      saveStatus: 'この端末では保存できません',
      pwaStatus: '更新版を利用できます。再読み込みしてください',
      shiftStatus: '勤務中'
    }
  );
});

test('header shift status maps every game state to explicit Japanese labels', () => {
  const labels = {
    ready: '勤務前',
    playing: '勤務中',
    won: '勤務終了',
    failed: '勤務終了'
  };
  for (const [gameStatus, shiftStatus] of Object.entries(labels)) {
    assert.equal(presentHeaderStatus({ gameStatus }).shiftStatus, shiftStatus);
  }
});
