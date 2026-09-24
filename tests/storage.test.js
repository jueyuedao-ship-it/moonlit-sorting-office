import test from 'node:test';
import assert from 'node:assert/strict';
import { advance, click, createGame, isGameState } from '../src/game.js';
import { STORAGE_KEY, createDefaultSave, loadSave, saveState } from '../src/storage.js';

const LEGACY_STORAGE_KEY = 'moonlit-sorting-office:v1';

function memoryStorage(initial = {}) {
  const values = new Map(Object.entries(initial));
  const reads = [];
  const removals = [];
  return {
    getItem(key) {
      reads.push(key);
      return values.has(key) ? values.get(key) : null;
    },
    setItem(key, value) {
      values.set(key, value);
    },
    removeItem(key) {
      removals.push(key);
      values.delete(key);
    },
    value(key) {
      return values.get(key);
    },
    reads,
    removals
  };
}

test('default save wraps a fresh game at the supplied timestamp', () => {
  const save = createDefaultSave(12_345);

  assert.equal(save.version, 1);
  assert.equal(save.game.lastUpdatedAt, 12_345);
  assert.equal(isGameState(save.game), true);
  assert.deepEqual(Object.keys(save).sort(), ['game', 'version']);
});

test('valid idle progress round-trips under the new versioned storage key', () => {
  const storage = memoryStorage();
  let game = createGame(50_000);
  game = click(game);
  game = advance({ ...game, generators: { ...game.generators, lantern: 2 } }, 51_000);
  const save = { version: 1, game };

  assert.deepEqual(saveState(storage, save), { value: save, error: null });
  assert.deepEqual(loadSave(storage), { value: save, error: null });
  assert.equal(JSON.parse(storage.value(STORAGE_KEY)).game.moonlight, 1.4);
  assert.equal(STORAGE_KEY, 'moonlight-idle:v1');
});

test('loading ignores and preserves the old sorting save key', () => {
  const oldValue = JSON.stringify({ version: 1, activeGame: { status: 'playing' } });
  const storage = memoryStorage({ [LEGACY_STORAGE_KEY]: oldValue });

  const loaded = loadSave(storage);

  assert.equal(loaded.error, null);
  assert.equal(isGameState(loaded.value.game), true);
  assert.deepEqual(storage.reads, ['moonlight-idle:v1']);
  assert.deepEqual(storage.removals, []);
  assert.equal(storage.value(LEGACY_STORAGE_KEY), oldValue);
});

test('malformed, unknown-version, and invalid game saves fall back safely', () => {
  const validGame = createGame(20_000);
  const invalidNegativeGame = { ...validGame, moonlight: -1 };
  const invalidNanGame = { ...validGame, moonlight: Number.NaN };
  const rawSaves = [
    '{broken',
    JSON.stringify({ version: 2, game: validGame }),
    JSON.stringify({ version: 1, game: invalidNegativeGame }),
    JSON.stringify({ version: 1, game: invalidNanGame }),
    JSON.stringify({ version: 1, game: { ...validGame, lastUpdatedAt: null } }),
    JSON.stringify({ version: 1, game: validGame, activeGame: null })
  ];

  for (const raw of rawSaves) {
    const loaded = loadSave(memoryStorage({ [STORAGE_KEY]: raw }));
    assert.equal(loaded.error, 'invalid-save');
    assert.equal(isGameState(loaded.value.game), true);
  }
});

test('invalid saves are not written to storage', () => {
  const storage = memoryStorage();
  const invalid = { version: 1, game: { ...createGame(1), stars: -4 } };

  assert.deepEqual(saveState(storage, invalid), { value: invalid, error: 'invalid-save' });
  assert.equal(storage.value(STORAGE_KEY), undefined);
});

test('storage exceptions are reported without throwing', () => {
  const broken = {
    getItem() { throw new Error('blocked'); },
    setItem() { throw new Error('blocked'); }
  };

  const loadResult = loadSave(broken);
  const save = createDefaultSave(80_000);
  assert.equal(loadResult.error, 'load-unavailable');
  assert.equal(isGameState(loadResult.value.game), true);
  assert.deepEqual(saveState(broken, save), { value: save, error: 'save-unavailable' });
});
