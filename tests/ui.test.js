import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { mountIdleGame } from '../src/app.js';
import { createGame } from '../src/game.js';
import { createDefaultSave, STORAGE_KEY } from '../src/storage.js';

const REQUIRED_IDS = [
  'game-status', 'save-status', 'pwa-status', 'activity-status',
  'moonlight-value', 'moonlight-rate', 'click-rate', 'run-moonlight',
  'collect-button', 'generator-list', 'upgrade-list', 'stars-section',
  'stars-value', 'stars-rate', 'star-generator-list', 'memory-count',
  'permanent-multiplier', 'prestige-section', 'prestige-requirements',
  'prestige-gain', 'prestige-loss', 'prestige-button', 'prestige-dialog',
  'dialog-gain', 'dialog-loss', 'cancel-prestige', 'confirm-prestige'
];

class FakeElement {
  constructor(tagName = 'div') {
    this.tagName = tagName.toUpperCase();
    this.children = [];
    this.dataset = {};
    this.attributes = new Map();
    this.listeners = new Map();
    this.hidden = false;
    this.disabled = false;
    this.open = false;
    this._textContent = '';
  }

  get textContent() {
    return this._textContent + this.children.map((child) => child.textContent).join('');
  }

  set textContent(value) {
    this._textContent = String(value);
    this.children = [];
  }

  append(...nodes) {
    this.children.push(...nodes);
  }

  replaceChildren(...nodes) {
    this._textContent = '';
    this.children = [...nodes];
  }

  setAttribute(name, value) {
    this.attributes.set(name, String(value));
    if (name.startsWith('data-')) {
      const key = name.slice(5).replace(/-([a-z])/g, (_, letter) => letter.toUpperCase());
      this.dataset[key] = String(value);
    }
  }

  addEventListener(type, callback) {
    const callbacks = this.listeners.get(type) ?? [];
    callbacks.push(callback);
    this.listeners.set(type, callbacks);
  }

  removeEventListener(type, callback) {
    this.listeners.set(type, (this.listeners.get(type) ?? []).filter((item) => item !== callback));
  }

  dispatch(type, event = {}) {
    for (const callback of this.listeners.get(type) ?? []) {
      callback({ target: this, currentTarget: this, ...event });
    }
  }

  click() {
    if (!this.disabled) this.dispatch('click');
  }

  showModal() {
    this.open = true;
  }

  close() {
    this.open = false;
  }
}

function createFakeDocument() {
  const elements = new Map(REQUIRED_IDS.map((id) => [id, new FakeElement() ]));
  const listeners = new Map();
  return {
    hidden: false,
    getElementById(id) {
      return elements.get(id) ?? null;
    },
    createElement(tagName) {
      return new FakeElement(tagName);
    },
    addEventListener(type, callback) {
      const callbacks = listeners.get(type) ?? [];
      callbacks.push(callback);
      listeners.set(type, callbacks);
    },
    removeEventListener(type, callback) {
      listeners.set(type, (listeners.get(type) ?? []).filter((item) => item !== callback));
    },
    dispatch(type) {
      for (const callback of listeners.get(type) ?? []) callback({ target: this });
    },
    elements
  };
}

class MemoryStorage {
  values = new Map();

  getItem(key) {
    return this.values.get(key) ?? null;
  }

  setItem(key, value) {
    this.values.set(key, String(value));
  }
}

function findAction(root, action, id) {
  const pending = [...root.children];
  while (pending.length) {
    const element = pending.shift();
    if (element.dataset.action === action && (id === undefined || element.dataset.id === id)) {
      return element;
    }
    pending.push(...element.children);
  }
  return null;
}

function mountHarness({ clock = { value: Date.now() }, initialGame } = {}) {
  const documentRef = createFakeDocument();
  const storage = new MemoryStorage();
  if (initialGame) {
    const initialSave = createDefaultSave(clock.value);
    initialSave.game = initialGame;
    storage.setItem(STORAGE_KEY, JSON.stringify(initialSave));
  }
  const intervals = [];
  const app = mountIdleGame({
    documentRef,
    storage,
    now: () => clock.value,
    setIntervalFn(callback, milliseconds) {
      const interval = { callback, milliseconds, cleared: false };
      intervals.push(interval);
      return interval;
    },
    clearIntervalFn(interval) {
      interval.cleared = true;
    },
    registerPwaFn: () => null
  });
  return { app, documentRef, storage, intervals, clock };
}

test('large collection control earns moonlight, unlocks lantern purchase, and persists it', () => {
  const { app, documentRef, storage } = mountHarness();
  const collect = documentRef.getElementById('collect-button');

  assert.equal(collect.disabled, false);
  assert.match(collect.attributes.get('aria-label'), /月光/);
  for (let index = 0; index < 15; index += 1) collect.click();

  assert.equal(documentRef.getElementById('moonlight-value').textContent, '15');
  const lantern = findAction(documentRef.getElementById('generator-list'), 'buy-generator', 'lantern');
  assert.ok(lantern);
  assert.equal(lantern.disabled, false);
  lantern.click();

  const saved = JSON.parse(storage.getItem(STORAGE_KEY));
  assert.equal(saved.game.moonlight, 0);
  assert.equal(saved.game.generators.lantern, 1);
  assert.equal(documentRef.getElementById('save-status').textContent, '端末内に自動保存');
  app.destroy();
});

test('idle page has responsive Japanese controls and no sorting interaction shell', async () => {
  const html = await readFile(new URL('../index.html', import.meta.url), 'utf8');
  const css = await readFile(new URL('../styles.css', import.meta.url), 'utf8');

  assert.match(html, /<html lang="ja">/);
  assert.match(html, /name="viewport"/);
  assert.match(html, /id="collect-button"/);
  assert.doesNotMatch(html, /sorting-controls|data-destination|勤務を開始/);
  assert.match(css, /@media \(max-width: 560px\)/);
  assert.match(css, /min-width:\s*0/);
});

test('offline income is summarized, saved, and not granted again after remount', () => {
  const savedAt = Date.now() - 60_000;
  const clock = { value: savedAt + 60_000 };
  const initialGame = {
    ...createGame(savedAt),
    generators: { ...createGame(savedAt).generators, lantern: 1 }
  };
  const first = mountHarness({ clock, initialGame });
  const earned = JSON.parse(first.storage.getItem(STORAGE_KEY)).game.moonlight;

  assert.ok(earned >= 12 && earned < 12.1);
  assert.match(first.documentRef.getElementById('activity-status').textContent, /放置中/);
  assert.equal(JSON.parse(first.storage.getItem(STORAGE_KEY)).game.lastUpdatedAt, clock.value);
  first.app.destroy();

  const second = mountHarness({ clock, initialGame: JSON.parse(first.storage.getItem(STORAGE_KEY)).game });
  assert.equal(JSON.parse(second.storage.getItem(STORAGE_KEY)).game.moonlight, earned);
  second.app.destroy();
});

test('passive production is periodically written to the save', () => {
  const clock = { value: Date.now() };
  const fresh = createGame(clock.value);
  const initialGame = {
    ...fresh,
    generators: { ...fresh.generators, lantern: 1 }
  };
  const { app, storage, intervals } = mountHarness({ clock, initialGame });

  clock.value += 15_000;
  intervals[0].callback();
  const savedGame = JSON.parse(storage.getItem(STORAGE_KEY)).game;
  assert.ok(Math.abs(savedGame.moonlight - 3) < 0.001);
  assert.equal(savedGame.lastUpdatedAt, clock.value);
  app.destroy();
});

test('hidden tabs skip interval ticks and visibility resume accounts elapsed time once', () => {
  const clock = { value: Date.now() };
  const fresh = createGame(clock.value);
  const initialGame = {
    ...fresh,
    generators: { ...fresh.generators, lantern: 1 }
  };
  const { app, documentRef, storage, intervals } = mountHarness({ clock, initialGame });

  documentRef.hidden = true;
  documentRef.dispatch('visibilitychange');
  clock.value += 10_000;
  intervals[0].callback();
  assert.equal(JSON.parse(storage.getItem(STORAGE_KEY)).game.moonlight, 0);

  documentRef.hidden = false;
  documentRef.dispatch('visibilitychange');
  const afterResume = JSON.parse(storage.getItem(STORAGE_KEY)).game.moonlight;
  assert.ok(Math.abs(afterResume - 2) < 0.001);
  intervals[0].callback();
  assert.equal(JSON.parse(storage.getItem(STORAGE_KEY)).game.moonlight, afterResume);
  assert.match(documentRef.getElementById('activity-status').textContent, /放置中/);
  app.destroy();
});

test('earning 5,000 run moonlight reveals stars and announces the condenser unlock', () => {
  const now = Date.now();
  const initialGame = {
    ...createGame(now),
    moonlight: 4_999,
    runMoonEarned: 4_999
  };
  const { app, documentRef } = mountHarness({ clock: { value: now }, initialGame });

  assert.equal(documentRef.getElementById('stars-section').hidden, true);
  assert.equal(documentRef.getElementById('star-generator-list').children[0].hidden, true);
  documentRef.getElementById('collect-button').click();

  assert.equal(documentRef.getElementById('stars-section').hidden, false);
  assert.equal(documentRef.getElementById('star-generator-list').children[0].hidden, false);
  assert.equal(findAction(documentRef.getElementById('star-generator-list'), 'buy-generator', 'starCondenser').disabled, true);
  assert.match(documentRef.getElementById('activity-status').textContent, /星屑.*解放/);
  app.destroy();
});

test('prestige preview requires opening and explicitly confirming the dialog', () => {
  const now = Date.now();
  const initialGame = {
    ...createGame(now),
    moonlight: 100_000,
    stars: 25,
    runMoonEarned: 100_000,
    runStarsEarned: 25
  };
  const { app, documentRef, storage } = mountHarness({ clock: { value: now }, initialGame });
  const dialog = documentRef.getElementById('prestige-dialog');
  const preview = documentRef.getElementById('prestige-button');

  assert.equal(preview.disabled, false);
  assert.match(documentRef.getElementById('prestige-gain').textContent, /記憶/);
  preview.click();
  assert.equal(dialog.open, true);
  documentRef.getElementById('cancel-prestige').click();
  assert.equal(dialog.open, false);
  assert.equal(JSON.parse(storage.getItem(STORAGE_KEY)).game.lifetime.prestiges, 0);

  preview.click();
  documentRef.getElementById('confirm-prestige').click();
  const afterPrestige = JSON.parse(storage.getItem(STORAGE_KEY)).game;
  assert.equal(dialog.open, false);
  assert.equal(afterPrestige.moonlight, 0);
  assert.equal(afterPrestige.lifetime.memories, 1);
  assert.equal(afterPrestige.lifetime.prestiges, 1);
  app.destroy();
});
