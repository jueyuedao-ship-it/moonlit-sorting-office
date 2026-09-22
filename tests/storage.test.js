import test from 'node:test';
import assert from 'node:assert/strict';
import { createGame } from '../src/game.js';
import { STORAGE_KEY, createDefaultSave, loadSave, saveState, recordFinishedShift } from '../src/storage.js';

function memoryStorage(initial = {}) {
  const values = new Map(Object.entries(initial));
  return {
    getItem: (key) => values.has(key) ? values.get(key) : null,
    setItem: (key, value) => values.set(key, value),
    value: (key) => values.get(key)
  };
}

test('valid save round-trips active game and stats', () => {
  const storage = memoryStorage();
  const activeGame = { ...createGame(42), status: 'playing', cursor: 2, score: 230 };
  const save = { version: 1, activeGame, stats: { bestScore: 900, shiftsCompleted: 4 } };
  assert.deepEqual(saveState(storage, save), { value: save, error: null });
  assert.deepEqual(loadSave(storage), { value: save, error: null });
  assert.equal(JSON.parse(storage.value(STORAGE_KEY)).activeGame.seed, 42);
});

test('finished shifts update stats without mutating the previous save', () => {
  const before = createDefaultSave();
  const game = { ...createGame(3), status: 'won', cursor: 18, score: 740 };
  const after = recordFinishedShift(before, game);
  assert.deepEqual(after.stats, { bestScore: 740, shiftsCompleted: 1 });
  assert.deepEqual(before.stats, { bestScore: 0, shiftsCompleted: 0 });
  assert.equal(after.activeGame, game);
});

test('recordFinishedShift ignores invalid terminal-looking games', () => {
  const before = createDefaultSave();
  const invalidWon = { ...createGame(6), status: 'won', score: 500 };
  assert.equal(recordFinishedShift(before, invalidWon), before);
});

test('valid terminal results survive a save and load round-trip', () => {
  const storage = memoryStorage();
  const before = createDefaultSave();
  const validWon = { ...createGame(13), status: 'won', cursor: 18, score: 740 };
  const save = recordFinishedShift(before, validWon);

  assert.deepEqual(saveState(storage, save), { value: save, error: null });
  assert.deepEqual(loadSave(storage), { value: save, error: null });
});

test('corrupt, unknown, or inconsistent saves fall back safely', () => {
  for (const raw of [
    '{broken',
    JSON.stringify({ version: 2, activeGame: null, stats: { bestScore: 0, shiftsCompleted: 0 } }),
    JSON.stringify({ version: 1, activeGame: { ...createGame(4), cursor: 99 }, stats: { bestScore: 0, shiftsCompleted: 0 } })
  ]) {
    const result = loadSave(memoryStorage({ [STORAGE_KEY]: raw }));
    assert.deepEqual(result.value, createDefaultSave());
    assert.equal(result.error, 'invalid-save');
  }
});

test('storage exceptions are reported without throwing', () => {
  const broken = { getItem() { throw new Error('blocked'); }, setItem() { throw new Error('blocked'); } };
  assert.deepEqual(loadSave(broken), { value: createDefaultSave(), error: 'load-unavailable' });
  assert.deepEqual(saveState(broken, createDefaultSave()), { value: createDefaultSave(), error: 'save-unavailable' });
});

test('recordFinishedShift ignores active games and does not double count identical result object', () => {
  const active = { ...createGame(5), status: 'playing' };
  const initial = createDefaultSave();
  assert.equal(recordFinishedShift(initial, active), initial);
  const finished = { ...active, status: 'failed', mistakes: 3 };
  const once = recordFinishedShift(initial, finished);
  assert.equal(recordFinishedShift(once, finished), once);
});
