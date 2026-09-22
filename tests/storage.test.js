import test from 'node:test';
import assert from 'node:assert/strict';
import { DESTINATIONS, classifyTicket, createGame, getCheckpointDistrict, submitChoice } from '../src/game.js';
import { STORAGE_KEY, createDefaultSave, loadSave, saveState, recordFinishedShift } from '../src/storage.js';

function memoryStorage(initial = {}) {
  const values = new Map(Object.entries(initial));
  return {
    getItem: (key) => values.has(key) ? values.get(key) : null,
    setItem: (key, value) => values.set(key, value),
    value: (key) => values.get(key)
  };
}

function startGame(seed) {
  return { ...createGame(seed), status: 'playing' };
}

function expectedDestination(state) {
  return classifyTicket(state.tickets[state.cursor], getCheckpointDistrict(state.cursor)).destination;
}

function wrongDestination(state) {
  const expected = expectedDestination(state);
  return [DESTINATIONS.EXPRESS, DESTINATIONS.REVIEW, DESTINATIONS.REGULAR]
    .find((destination) => destination !== expected);
}

function finishWon(seed) {
  let state = startGame(seed);
  while (state.status === 'playing') state = submitChoice(state, expectedDestination(state));
  return state;
}

function finishFailed(seed) {
  let state = startGame(seed);
  while (state.status === 'playing') state = submitChoice(state, wrongDestination(state));
  return state;
}

test('valid save round-trips active game and stats', () => {
  const storage = memoryStorage();
  let activeGame = startGame(42);
  activeGame = submitChoice(activeGame, expectedDestination(activeGame));
  activeGame = submitChoice(activeGame, expectedDestination(activeGame));
  const save = { version: 1, activeGame, stats: { bestScore: 900, shiftsCompleted: 4 } };
  assert.deepEqual(saveState(storage, save), { value: save, error: null });
  assert.deepEqual(loadSave(storage), { value: save, error: null });
  assert.equal(JSON.parse(storage.value(STORAGE_KEY)).activeGame.seed, 42);
});

test('finished shifts update stats without mutating the previous save', () => {
  const before = createDefaultSave();
  const game = finishWon(3);
  const after = recordFinishedShift(before, game);
  assert.deepEqual(after.stats, { bestScore: game.score, shiftsCompleted: 1 });
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
  const validWon = finishWon(13);
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
  const active = startGame(5);
  const initial = createDefaultSave();
  assert.equal(recordFinishedShift(initial, active), initial);
  const finished = finishFailed(5);
  const once = recordFinishedShift(initial, finished);
  assert.equal(recordFinishedShift(once, finished), once);
});

test('terminal active games require completed stats and a score at least as high as the result', () => {
  const won = finishWon(17);
  const invalidSaves = [
    { version: 1, activeGame: won, stats: { bestScore: 0, shiftsCompleted: 0 } },
    { version: 1, activeGame: won, stats: { bestScore: won.score - 1, shiftsCompleted: 1 } }
  ];
  for (const save of invalidSaves) {
    assert.deepEqual(loadSave(memoryStorage({ [STORAGE_KEY]: JSON.stringify(save) })).value, createDefaultSave());
  }
  const validSave = { version: 1, activeGame: won, stats: { bestScore: won.score, shiftsCompleted: 1 } };
  assert.deepEqual(loadSave(memoryStorage({ [STORAGE_KEY]: JSON.stringify(validSave) })), { value: validSave, error: null });
});

test('legitimate playing saves remain valid before any shift is completed', () => {
  const activeGame = startGame(18);
  const save = { version: 1, activeGame, stats: { bestScore: 0, shiftsCompleted: 0 } };
  assert.deepEqual(loadSave(memoryStorage({ [STORAGE_KEY]: JSON.stringify(save) })), { value: save, error: null });
});
