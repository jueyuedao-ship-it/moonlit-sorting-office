import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import { registerPwa } from '../src/pwa.js';

const expectedShell = [
  './', './index.html', './styles.css', './src/app.js', './src/game.js',
  './src/storage.js', './src/presenter.js', './src/header-status.js', './src/pwa.js',
  './manifest.webmanifest', './assets/icon-180.png',
  './assets/icon-192.png', './assets/icon-512.png'
];

async function loadWorker(overrides = {}) {
  const listeners = new Map();
  const context = {
    URL, Promise,
    self: {
      location: { origin: 'https://example.test' },
      registration: { scope: 'https://example.test/moonlit-sorting-office/' },
      addEventListener: (name, handler) => listeners.set(name, handler),
      skipWaiting: async () => {},
      clients: { claim: async () => {} }
    },
    caches: overrides.caches,
    fetch: overrides.fetch
  };
  vm.runInNewContext(await readFile(new URL('../sw.js', import.meta.url), 'utf8'), context);
  return { listeners, context };
}

test('manifest is standalone and every launch/icon URL is scope relative', async () => {
  const manifest = JSON.parse(await readFile(new URL('../manifest.webmanifest', import.meta.url), 'utf8'));
  assert.equal(manifest.name, '月影工房');
  assert.equal(manifest.short_name, '月影工房');
  assert.equal(manifest.description, '月光を集め、星屑を育てる小さな放置ゲーム。');
  assert.equal(manifest.lang, 'ja');
  assert.equal(manifest.start_url, './');
  assert.equal(manifest.scope, './');
  assert.equal(manifest.display, 'standalone');
  assert.equal(manifest.background_color, '#081525');
  assert.equal(manifest.theme_color, '#10263f');
  assert.deepEqual(manifest.icons.map(({ src, sizes, type, purpose }) => [src, sizes, type, purpose]), [
    ['./assets/icon-192.png', '192x192', 'image/png', 'any maskable'],
    ['./assets/icon-512.png', '512x512', 'image/png', 'any maskable']
  ]);
});

test('install precaches the complete relative app shell', async () => {
  let openedName = '';
  let added = [];
  let skipped = false;
  const caches = { open: async (name) => ({ addAll: async (urls) => { openedName = name; added = [...urls]; } }) };
  const { listeners, context } = await loadWorker({ caches, fetch: async () => null });
  context.self.skipWaiting = async () => { skipped = true; };
  let pending;
  listeners.get('install')({ waitUntil: (promise) => { pending = promise; } });
  await pending;
  assert.equal(openedName, 'moonlight-idle-v3');
  assert.deepEqual(added, expectedShell);
  for (const path of added) {
    assert.equal(path.startsWith('./'), true, `${path} should be relative to the app scope`);
    assert.equal(
      new URL(path, 'https://example.test/moonlit-sorting-office/').pathname.startsWith('/moonlit-sorting-office/'),
      true,
      `${path} should resolve within the GitHub Pages subpath`
    );
  }
  assert.equal(skipped, true);
});

test('activate removes only obsolete caches owned by this app', async () => {
  const deleted = [];
  let claimed = false;
  const caches = {
    keys: async () => [
      'moonlit-sorting-office-v0', 'moonlit-sorting-office-v1',
      'moonlight-idle-v1', 'moonlight-idle-v2', 'moonlight-idle-v3',
      'another-app-v1'
    ],
    delete: async (name) => { deleted.push(name); return true; }
  };
  const { listeners, context } = await loadWorker({ caches, fetch: async () => null });
  context.self.clients.claim = async () => { claimed = true; };
  let pending;
  listeners.get('activate')({ waitUntil: (promise) => { pending = promise; } });
  await pending;
  assert.deepEqual(deleted, [
    'moonlit-sorting-office-v0', 'moonlit-sorting-office-v1',
    'moonlight-idle-v1', 'moonlight-idle-v2'
  ]);
  assert.equal(claimed, true);
});

test('network-first caches successful same-origin GET responses', async () => {
  const stored = [];
  const response = { ok: true, clone: () => 'cached-copy' };
  const caches = {
    open: async () => ({ put: async (...args) => { stored.push(args); } }),
    match: async () => undefined
  };
  const { listeners } = await loadWorker({ caches, fetch: async () => response });
  let returned;
  listeners.get('fetch')({
    request: { method: 'GET', url: 'https://example.test/moonlit-sorting-office/styles.css', mode: 'no-cors' },
    respondWith: (promise) => { returned = promise; }
  });
  assert.equal(await returned, response);
  assert.deepEqual(stored, [[
    { method: 'GET', url: 'https://example.test/moonlit-sorting-office/styles.css', mode: 'no-cors' },
    'cached-copy'
  ]]);
});

test('network-first returns a valid response when cache update fails', async () => {
  const response = { ok: true, clone: () => 'cached-copy' };
  const caches = {
    open: async () => ({ put: async () => { throw new Error('quota exceeded'); } }),
    match: async () => undefined
  };
  const { listeners } = await loadWorker({ caches, fetch: async () => response });
  let returned;
  listeners.get('fetch')({
    request: { method: 'GET', url: 'https://example.test/moonlit-sorting-office/styles.css', mode: 'no-cors' },
    respondWith: (promise) => { returned = promise; }
  });
  assert.equal(await returned, response);
});

test('same-origin navigation falls back to scoped index when network and request cache fail', async () => {
  const matches = [];
  const fallback = { body: 'index shell' };
  const request = { method: 'GET', url: 'https://example.test/moonlit-sorting-office/story/chapter', mode: 'navigate' };
  const caches = {
    match: async (key) => {
      matches.push(key);
      return typeof key === 'string' ? fallback : undefined;
    }
  };
  const { listeners } = await loadWorker({ caches, fetch: async () => { throw new Error('offline'); } });
  let returned;
  listeners.get('fetch')({ request, respondWith: (promise) => { returned = promise; } });
  assert.equal(await returned, fallback);
  assert.equal(matches[0], request);
  assert.equal(matches[1], 'https://example.test/moonlit-sorting-office/index.html');
});

test('cross-origin GET and same-origin POST pass through without respondWith', async () => {
  const caches = { match: async () => undefined };
  const { listeners } = await loadWorker({ caches, fetch: async () => { throw new Error('should not run'); } });
  for (const request of [
    { method: 'GET', url: 'https://cdn.example.test/library.js', mode: 'no-cors' },
    { method: 'POST', url: 'https://example.test/moonlit-sorting-office/save', mode: 'same-origin' }
  ]) {
    let calls = 0;
    listeners.get('fetch')({ request, respondWith: () => { calls += 1; } });
    assert.equal(calls, 0);
  }
});

test('PNG icons are square files at the required launch dimensions', async () => {
  for (const [file, size] of [
    ['icon-180.png', 180], ['icon-192.png', 192], ['icon-512.png', 512]
  ]) {
    const bytes = await readFile(new URL(`../assets/${file}`, import.meta.url));
    assert.deepEqual([...bytes.subarray(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10]);
    assert.equal(bytes.readUInt32BE(16), size);
    assert.equal(bytes.readUInt32BE(20), size);
  }
});

function withNavigator(value, callback) {
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, 'navigator');
  Object.defineProperty(globalThis, 'navigator', { configurable: true, value });
  return Promise.resolve()
    .then(callback)
    .finally(() => {
      if (descriptor) Object.defineProperty(globalThis, 'navigator', descriptor);
      else delete globalThis.navigator;
    });
}

test('registerPwa returns null without service worker support', async () => {
  await withNavigator({}, () => assert.equal(registerPwa(), null));
});

test('registerPwa registers a relative worker and reports waiting updates', async () => {
  const statuses = [];
  let updateHandler;
  let stateHandler;
  const installing = {
    state: 'installed',
    addEventListener: (name, handler) => { stateHandler = handler; }
  };
  const registration = {
    waiting: {},
    installing,
    addEventListener: (name, handler) => { updateHandler = handler; }
  };
  const serviceWorker = {
    controller: {},
    register: async (...args) => {
      assert.deepEqual(args, ['./sw.js', { scope: './' }]);
      return registration;
    }
  };
  await withNavigator({ serviceWorker }, async () => {
    assert.equal(await registerPwa((message) => statuses.push(message)), registration);
    assert.deepEqual(statuses, ['更新版を利用できます。再読み込みしてください']);
    updateHandler();
    stateHandler();
    assert.deepEqual(statuses, [
      '更新版を利用できます。再読み込みしてください',
      '更新版を利用できます。再読み込みしてください'
    ]);
  });
});

test('registerPwa reports registration failure and resolves null', async () => {
  const statuses = [];
  const serviceWorker = { register: async () => { throw new Error('blocked'); } };
  await withNavigator({ serviceWorker }, async () => {
    assert.equal(await registerPwa((message) => statuses.push(message)), null);
    assert.deepEqual(statuses, ['オフライン準備を完了できませんでした']);
  });
});
