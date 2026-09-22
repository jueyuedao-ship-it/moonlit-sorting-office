# 月影仕分け局 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 規則帳を参照しながら18通の郵便票を3系統へ仕分ける、端末保存・再開・オフライン起動可能なPWA作業ゲームを作る。

**Architecture:** DOMや保存に依存しない不変ゲーム状態機械を中心に置き、version付きlocalStorageアダプターと薄いDOMアプリを接続する。UIはビルド不要のHTML/CSS/ES Modulesで提供し、相対パスmanifestとversion付きService Worker app shellを重ねる。ドメイン・保存・表示モデル・PWA workerイベントはNode標準テストで検証する。

**Tech Stack:** HTML5, CSS3, JavaScript ES Modules, Web App Manifest, Service Worker, Node.js 20+ built-in `node:test`, localStorage, GitHub Pages

**Spec:** `docs/superpowers/specs/2026-09-22-moonlit-sorting-office-design.md`

## Global Constraints

- 実行時の外部API、CDN、外部画像・フォント、ネットワーク通信を使わない。
- ビルド工程を設けず、ローカルHTTPサーバーから `index.html` を開けば動作する。
- 1勤務は18通、6通ずつ3区間、3回誤配で失敗とする。
- 判定優先順位は「赤印→特急便」「それ以外で現在の要確認地区または重量→確認台」「それ以外→通常便」。
- `1` / `2` / `3` とクリックの両方で完遂でき、主要ボタンは最低44px、320px幅で横スクロールを出さない。
- 保存キーは `moonlit-sorting-office:v1`、保存形式versionは `1`。進行中・結果・最高得点・累計勤務数を再読込後に復元する。
- GitHub Pagesサブパス対応のためアプリ資産・manifest・Service Worker登録はすべて `./` 基準の相対パスにする。
- manifestは `start_url: "./"`, `scope: "./"`, `display: "standalone"`、192px/512px PNGアイコンを含める。Apple向けに180px PNGとmobile-web-app metaを含める。
- Service Workerは同一origin GETだけをnetwork-firstで扱い、version付きapp shellへoffline fallbackし、このアプリprefixの旧キャッシュだけをactivate時に削除する。
- ソース/キャッシュ更新と端末localStorageは別管理とし、公開更新で既存端末データを消去・置換しない。
- ゲームロジックは入力状態を変更せず、新しい状態を返す。
- テストは実コードの振る舞いを検証し、プロダクションコードを書く前に期待どおり失敗するREDを確認する。

## Review Focus

- 赤印かつ重量・要確認地区の票でも特急便が優先されること（Task 1の優先順位テスト）。
- 区間境界の7通目・13通目で、表示中の票に対応する要確認地区へ切り替わること（Task 1の境界テスト、Task 3の表示モデルテスト）。
- 3回目の誤配と18通目の正解が、それぞれ一度だけ終了統計を更新すること（Task 1の終了テスト、Task 2の統計テスト）。
- 妥当なJSONでもcursor範囲外やtickets件数不正なら復元しないこと（Task 2の意味検証テスト）。
- 入力欄・ボタンにフォーカス中の数字キーで誤仕分けが発生しないこと（Task 3のブラウザ手動確認）。
- GitHub Pages相当のサブパスでもmanifest・icons・worker・全app shellがscope内相対URLで解決されること（Task 4のmanifest/workerテストとネスト配信確認）。
- 旧キャッシュ削除が他アプリのcacheを消さず、offline navigationがindexへfallbackすること（Task 4のworkerイベントテスト）。

---

## File Structure

- `package.json`: ES Modules宣言と標準テストコマンドのみ。
- `src/game.js`: ルール、決定的デッキ、初期状態、分類、状態遷移。
- `tests/game.test.js`: ゲームの決定性、優先順位、得点、終了条件、境界条件。
- `src/storage.js`: version付き保存値の検証、読込、書込、完了統計更新。
- `tests/storage.test.js`: メモリStorageを使ったround-trip・破損・例外・統計検証。
- `src/presenter.js`: 状態から画面表示用モデルを生成する純粋関数。
- `tests/presenter.test.js`: 区間表示、結果文言、操作可否の表示モデル検証。
- `src/app.js`: DOM取得、描画、開始/仕分け/再開イベント、保存接続。
- `index.html`: セマンティックなゲーム画面骨格。
- `styles.css`: テーマ、レスポンシブ、フォーカス、reduced-motion。
- `README.md`: 起動、操作、テスト、保存仕様。
- `src/pwa.js`: worker登録と更新通知。
- `manifest.webmanifest`: standalone起動、相対scope/start URL、icons。
- `sw.js`: app shell事前キャッシュ、旧version整理、network-first/offline fallback。
- `assets/icon-180.png`, `assets/icon-192.png`, `assets/icon-512.png`: Apple/PWAアイコン。
- `tests/pwa.test.js`: manifestと実Service Workerイベントの振る舞い。

### Task 1: 決定的な仕分けゲームエンジン

**Files:**
- Create: `package.json`
- Create: `src/game.js`
- Create: `tests/game.test.js`

**Interfaces:**
- Consumes: なし。
- Produces: `DESTINATIONS`, `DISTRICTS`, `SHIFT_SIZE`, `MAX_MISTAKES`, `createGame(seed)`, `classifyTicket(ticket, checkpointDistrict)`, `submitChoice(state, destination)`, `getCheckpointDistrict(cursor)`, `isGameState(value)`。

- [ ] **Step 1: テストランナーを定義し、デッキと分類の失敗テストを書く**

`package.json` を次の最小構成にする（設定ファイルは振る舞いではないため、プロダクション実装より先に作成してよい）。

```json
{
  "name": "moonlit-sorting-office",
  "private": true,
  "type": "module",
  "scripts": { "test": "node --test" },
  "engines": { "node": ">=20" }
}
```

`tests/game.test.js` に、次の実コード契約をリテラル期待値で書く。

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DESTINATIONS, createGame, classifyTicket, getCheckpointDistrict,
  submitChoice, isGameState
} from '../src/game.js';

test('same seed creates the same constrained 18-ticket shift', () => {
  const first = createGame(12345);
  const second = createGame(12345);
  assert.deepEqual(first.tickets, second.tickets);
  assert.equal(first.tickets.length, 18);
  for (let start = 0; start < 18; start += 6) {
    const group = first.tickets.slice(start, start + 6);
    const checkpoint = getCheckpointDistrict(start);
    const outcomes = new Set(group.map((ticket) => classifyTicket(ticket, checkpoint).destination));
    assert.deepEqual([...outcomes].sort(), ['express', 'regular', 'review']);
  }
});

test('red seal wins over checkpoint district and heavy weight', () => {
  const result = classifyTicket(
    { id: 'x', seal: 'red', district: '月見町', weight: 'heavy' },
    '月見町'
  );
  assert.deepEqual(result, { destination: DESTINATIONS.EXPRESS, reason: '赤印は最優先です' });
});

test('checkpoint or heavy mail goes to review and the rest goes regular', () => {
  assert.equal(classifyTicket({ id: 'a', seal: 'blue', district: '星川', weight: 'light' }, '星川').destination, 'review');
  assert.equal(classifyTicket({ id: 'b', seal: 'none', district: '港通り', weight: 'heavy' }, '星川').destination, 'review');
  assert.equal(classifyTicket({ id: 'c', seal: 'blue', district: '港通り', weight: 'light' }, '星川').destination, 'regular');
});
```

- [ ] **Step 2: REDを確認する**

Run: `npm test -- --test-name-pattern="same seed|red seal|checkpoint"`

Expected: FAIL。`../src/game.js` が存在しないためモジュール解決に失敗することを確認する。テスト自体の構文エラーなら修正して、機能欠落による失敗にする。

- [ ] **Step 3: 最小のデッキ生成・分類実装を書く**

`src/game.js` に次の公開値と構造を実装する。

```js
export const DESTINATIONS = Object.freeze({ EXPRESS: 'express', REVIEW: 'review', REGULAR: 'regular' });
export const DISTRICTS = Object.freeze(['月見町', '星川', '霧ヶ丘', '港通り']);
export const SHIFT_SIZE = 18;
export const MAX_MISTAKES = 3;
const CHECKPOINTS = Object.freeze(['月見町', '霧ヶ丘', '港通り']);

export function getCheckpointDistrict(cursor) {
  return CHECKPOINTS[Math.min(2, Math.floor(Math.max(0, cursor) / 6))];
}

export function classifyTicket(ticket, checkpointDistrict) {
  if (ticket.seal === 'red') return { destination: 'express', reason: '赤印は最優先です' };
  if (ticket.district === checkpointDistrict) return { destination: 'review', reason: `${checkpointDistrict}は現在の要確認地区です` };
  if (ticket.weight === 'heavy') return { destination: 'review', reason: '重量郵便は確認が必要です' };
  return { destination: 'regular', reason: '特急・確認条件に該当しません' };
}
```

デッキは32bitのseedを受ける小さな決定的PRNGを使う。各6通を「赤印の特急例」「現在地区の確認例」「重量の確認例」「通常例」各1通以上と、PRNGで属性を選ぶ2通で構成し、Fisher-Yatesで区間内だけを混ぜる。`id` は `ticket-01` から `ticket-18`。`createGame(seed)` は設計書記載の状態形を全フィールド初期化して返す。

- [ ] **Step 4: デッキと分類テストのGREENを確認する**

Run: `npm test -- --test-name-pattern="same seed|red seal|checkpoint"`

Expected: 3 tests PASS、警告なし。

- [ ] **Step 5: 状態遷移と終了条件の失敗テストを追加する**

`tests/game.test.js` に次を追加する。

```js
test('correct answer advances and scores from the new streak', () => {
  const ready = createGame(7);
  const playing = { ...ready, status: 'playing' };
  const expected = classifyTicket(playing.tickets[0], getCheckpointDistrict(0));
  const next = submitChoice(playing, expected.destination);
  assert.equal(next.cursor, 1);
  assert.equal(next.correct, 1);
  assert.equal(next.streak, 1);
  assert.equal(next.score, 110);
  assert.equal(playing.cursor, 0);
  assert.equal(next.lastFeedback.correct, true);
});

test('third mistake fails immediately and later input is ignored', () => {
  let state = { ...createGame(8), status: 'playing', mistakes: 2 };
  const expected = classifyTicket(state.tickets[0], getCheckpointDistrict(0)).destination;
  const wrong = ['express', 'review', 'regular'].find((value) => value !== expected);
  state = submitChoice(state, wrong);
  assert.equal(state.status, 'failed');
  assert.equal(state.mistakes, 3);
  assert.equal(submitChoice(state, expected), state);
});

test('eighteenth processed ticket wins and streak bonus is capped', () => {
  let state = { ...createGame(9), status: 'playing', cursor: 17, streak: 14, bestStreak: 14, score: 1000 };
  const expected = classifyTicket(state.tickets[17], getCheckpointDistrict(17)).destination;
  state = submitChoice(state, expected);
  assert.equal(state.status, 'won');
  assert.equal(state.cursor, 18);
  assert.equal(state.score, 1200);
  assert.equal(state.bestStreak, 15);
});

test('invalid destinations and internally inconsistent states are rejected', () => {
  const state = { ...createGame(10), status: 'playing' };
  assert.equal(submitChoice(state, 'unknown'), state);
  assert.equal(isGameState(state), true);
  assert.equal(isGameState({ ...state, cursor: 19 }), false);
  assert.equal(isGameState({ ...state, tickets: [] }), false);
  assert.equal(isGameState({ ...state, score: -1 }), false);
});
```

- [ ] **Step 6: 状態遷移テストのREDを確認する**

Run: `npm test -- --test-name-pattern="correct answer|third mistake|eighteenth|invalid destinations"`

Expected: FAIL。`submitChoice` / `isGameState` が未実装または状態更新が未実装のため期待値と一致しない。

- [ ] **Step 7: 最小の不変状態遷移と意味検証を実装する**

`submitChoice` は `status !== 'playing'` または行き先不正なら同じ参照を返す。正解なら `100 + min((streak + 1) * 10, 100)`、誤配なら加点なし。どちらもcursorを1進め、3ミスを先に判定し、それ以外でcursorが18なら`won`にする。`lastFeedback`へ `{ correct, chosen, expected, reason }` を格納する。

`isGameState` はversion、status、seed、18件のticket形、0..18の整数cursor、非負整数score/mistakes/streak/bestStreak/correct、`mistakes <= 3`、`correct <= cursor` を検証する。

- [ ] **Step 8: 全テストをGREENにし、自己レビューしてコミットする**

Run: `npm test`

Expected: 7 tests PASS、0 fail、警告なし。

Mutation check: `classifyTicket` の赤印分岐を下へ動かすと優先順位テストが、score加算を100固定にすると得点テストが、終了判定を外すと終了テストが失敗することを頭上確認する。

```bash
git add package.json src/game.js tests/game.test.js
git commit -m "feat: add deterministic sorting game engine"
```

### Task 2: 安全な保存と勤務統計

**Files:**
- Create: `src/storage.js`
- Create: `tests/storage.test.js`

**Interfaces:**
- Consumes: `isGameState(value)` from `src/game.js`。
- Produces: `STORAGE_KEY`, `createDefaultSave()`, `loadSave(storage)`, `saveState(storage, save)`, `recordFinishedShift(save, game)`。`loadSave` / `saveState` は `{ value, error }` を返し、Storage例外をthrowしない。

- [ ] **Step 1: round-tripと統計の失敗テストを書く**

`tests/storage.test.js` にメモリStorageと次の契約を書く。

```js
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
  const game = { ...createGame(3), status: 'won', score: 740 };
  const after = recordFinishedShift(before, game);
  assert.deepEqual(after.stats, { bestScore: 740, shiftsCompleted: 1 });
  assert.deepEqual(before.stats, { bestScore: 0, shiftsCompleted: 0 });
  assert.equal(after.activeGame, game);
});
```

- [ ] **Step 2: REDを確認する**

Run: `npm test -- --test-name-pattern="round-trips|finished shifts"`

Expected: FAIL。`src/storage.js` が存在しないためモジュール解決に失敗する。

- [ ] **Step 3: 最小の保存実装を書く**

`STORAGE_KEY` は正確に `moonlit-sorting-office:v1`。初期値は `{ version: 1, activeGame: null, stats: { bestScore: 0, shiftsCompleted: 0 } }`。`saveState` はJSON文字列化して `setItem` し、成功時 `{ value: save, error: null }`、失敗時 `{ value: save, error: 'save-unavailable' }`。`recordFinishedShift` は`won` / `failed`だけを完了として、bestScore最大値と勤務数+1を一度計算した新規オブジェクトを返す。

- [ ] **Step 4: round-tripと統計のGREENを確認する**

Run: `npm test -- --test-name-pattern="round-trips|finished shifts"`

Expected: 2 tests PASS、警告なし。

- [ ] **Step 5: 破損・未知version・意味不整合・Storage例外の失敗テストを追加する**

```js
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
```

- [ ] **Step 6: 新テストのREDを確認する**

Run: `npm test -- --test-name-pattern="corrupt|exceptions|double count"`

Expected: FAIL。意味検証、例外変換、二重計上防止のいずれかが未実装で期待値と一致しない。

- [ ] **Step 7: 保存値検証と一度だけ統計更新を実装する**

保存値検証は`version === 1`、`activeGame === null || isGameState(activeGame)`、statsの両値が非負整数を要求する。二重計上は保存オブジェクトの`activeGame === game`なら同じ参照を返すことで防ぐ。JSON解析・Storage APIは個別の`try/catch`で既定errorコードへ変換する。

- [ ] **Step 8: 全テストをGREENにし、自己レビューしてコミットする**

Run: `npm test`

Expected: 12 tests PASS、0 fail、警告なし。

```bash
git add src/storage.js tests/storage.test.js
git commit -m "feat: persist shifts and local statistics"
```

### Task 3: 完全なブラウザUIと操作ループ

**Files:**
- Create: `src/presenter.js`
- Create: `tests/presenter.test.js`
- Create: `src/app.js`
- Create: `index.html`
- Create: `styles.css`
- Create: `README.md`

**Interfaces:**
- Consumes: Task 1のゲームAPI、Task 2の保存API。
- Produces: `toViewModel(game, stats)` と、`index.html`から遊べるUI。表示モデルは `{ mode, ticket, checkpointDistrict, progressText, scoreText, mistakesText, streakText, feedbackText, resultText, controlsDisabled }`。

- [ ] **Step 1: 表示モデルの失敗テストを書く**

`tests/presenter.test.js` に次を書く。

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { createGame, classifyTicket, getCheckpointDistrict, submitChoice } from '../src/game.js';
import { toViewModel } from '../src/presenter.js';

test('playing view uses the current ticket and switches checkpoint at cursor six', () => {
  const game = { ...createGame(21), status: 'playing', cursor: 6, score: 450, mistakes: 1, streak: 2 };
  const view = toViewModel(game, { bestScore: 700, shiftsCompleted: 3 });
  assert.equal(view.ticket.id, game.tickets[6].id);
  assert.equal(view.checkpointDistrict, '霧ヶ丘');
  assert.equal(view.progressText, '7 / 18通');
  assert.equal(view.controlsDisabled, false);
});

test('feedback and result text explain the outcome without relying on color', () => {
  let game = { ...createGame(22), status: 'playing', cursor: 17, mistakes: 2 };
  const expected = classifyTicket(game.tickets[17], getCheckpointDistrict(17)).destination;
  const wrong = ['express', 'review', 'regular'].find((value) => value !== expected);
  game = submitChoice(game, wrong);
  const view = toViewModel(game, { bestScore: game.score, shiftsCompleted: 1 });
  assert.match(view.feedbackText, /誤配/);
  assert.match(view.feedbackText, /正しくは/);
  assert.match(view.resultText, /誤配が3回/);
  assert.equal(view.controlsDisabled, true);
});
```

- [ ] **Step 2: REDを確認する**

Run: `npm test -- --test-name-pattern="playing view|feedback and result"`

Expected: FAIL。`src/presenter.js` が存在しないためモジュール解決に失敗する。

- [ ] **Step 3: 表示モデルの最小実装を書く**

`toViewModel` は純粋関数とし、現在票は`status === 'playing'`のときだけ返す。行き先表示名は`express: 特急便`, `review: 確認台`, `regular: 通常便`。feedbackは正解なら`正解: <行き先>。<理由>`、誤配なら`誤配。正しくは<行き先>です。<理由>`。結果文はwonなら`18通の仕分け完了`、failedなら`誤配が3回に達したため勤務終了`を含める。

- [ ] **Step 4: 表示モデルのGREENを確認する**

Run: `npm test -- --test-name-pattern="playing view|feedback and result"`

Expected: 2 tests PASS、警告なし。

- [ ] **Step 5: セマンティックHTMLとDOM接続を実装する**

`index.html` は外部参照なしで `styles.css` と `src/app.js` のみを読み込む。次のIDを持つ要素を用意する。

```html
<header class="masthead">
  <div><p class="eyebrow">午前零時の航路郵便</p><h1>月影仕分け局</h1></div>
  <p id="save-status" role="status">端末内に自動保存</p>
</header>
<main>
  <section id="intro-panel" aria-labelledby="intro-title"></section>
  <section id="game-panel" hidden aria-labelledby="ticket-title">
    <div id="status-strip" aria-label="勤務状況"></div>
    <aside id="rulebook" aria-labelledby="rules-title"></aside>
    <article id="ticket-card" aria-labelledby="ticket-title" tabindex="-1"></article>
    <div id="sorting-controls" aria-label="仕分け先">
      <button type="button" data-destination="express"><kbd>1</kbd> 特急便</button>
      <button type="button" data-destination="review"><kbd>2</kbd> 確認台</button>
      <button type="button" data-destination="regular"><kbd>3</kbd> 通常便</button>
    </div>
    <p id="feedback" aria-live="polite"></p>
  </section>
  <section id="result-panel" hidden aria-labelledby="result-title"></section>
</main>
```

`src/app.js` は保存値を読み、activeGameに応じて intro/game/result を描画する。開始ボタンは `Date.now() >>> 0` をseedに `createGame` し、statusを`playing`へ変更して保存する。仕分け後は`submitChoice`し、初めて終了状態になった瞬間だけ`recordFinishedShift`を通し、保存して描画する。結果画面の「もう一度勤務」は新規勤務を始める。

数字キーは`event.defaultPrevented`、`event.repeat`、`event.ctrlKey/metaKey/altKey`、targetが`INPUT/TEXTAREA/SELECT/BUTTON`または`isContentEditable`なら無視する。それ以外でplaying中の`1/2/3`だけを仕分けへ変換する。開始・区間変更後は`#ticket-card`へフォーカスする。

- [ ] **Step 6: 視覚デザイン・レスポンシブ・アクセシビリティCSSを書く**

CSS custom propertiesで濃紺の夜背景、生成り紙、真鍮色のアクセントを定義する。900px以上は規則帳と票を2列、未満は1列。ボタン`min-height: 44px`、`:focus-visible`は3pxの明瞭なoutline。正誤は色と`✓ 正解` / `× 誤配`テキストの両方で伝える。`@media (prefers-reduced-motion: reduce)`でanimation/transitionを実質停止する。`body`と主要gridに`min-width: 0`、長文に折返しを設定し、320pxで横スクロールを防ぐ。

- [ ] **Step 7: READMEを作成し、構文・全テストを確認する**

READMEへ次を明記する。

```markdown
## 起動
python -m http.server 4173
# http://localhost:4173/

## 操作
- 1: 特急便
- 2: 確認台
- 3: 通常便
- 画面のボタンも利用可能

## テスト
npm test
```

Run: `npm test`

Expected: 14 tests PASS、0 fail、警告なし。

Run: `Get-ChildItem src,tests -Filter *.js -Recurse | ForEach-Object { node --check $_.FullName }`

Expected: 全ファイル exit 0、出力なし。

Run: `rg -n "https?://|//cdn|@import" index.html styles.css src`

Expected: matchなし（READMEのlocalhostは検査対象外）。

- [ ] **Step 8: ローカルブラウザで実プレイと再読込を確認する**

Run: `python -m http.server 4173`

ブラウザで次を確認する。

1. 初期画面から勤務開始できる。
2. クリックと数字キーの両方で仕分けられ、正誤理由が日本語で残る。
3. 6通処理後に要確認地区が `霧ヶ丘`、12通処理後に `港通り` へ変わる。
4. 途中で再読み込みして、seed・現在票・score・処理数・ミスが一致する。
5. 18通完了または3ミスで結果画面になり、再読み込みして結果と統計が残る。
6. 320px相当の狭幅で横スクロールがなく、Tabフォーカスが見える。
7. コンソールに例外・警告がない。

- [ ] **Step 9: 自己レビューしてコミットする**

ゲーム中・結果・保存不可の各状態でhidden切替、ボタンdisabled、aria-live文言を読み直す。UI処理がgameルールを重複実装していないことを確認する。

```bash
git add src/presenter.js tests/presenter.test.js src/app.js index.html styles.css README.md
git commit -m "feat: deliver accessible moonlit sorting game"
```

### Task 4: PWAオフライン化とGitHub Pages公開準備

**Files:**
- Create: `src/pwa.js`
- Create: `manifest.webmanifest`
- Create: `sw.js`
- Create: `assets/icon-source.svg`
- Create: `assets/icon-180.png`
- Create: `assets/icon-192.png`
- Create: `assets/icon-512.png`
- Create: `tests/pwa.test.js`
- Modify: `src/app.js`
- Modify: `index.html`
- Modify: `README.md`

**Interfaces:**
- Consumes: Task 3の `#save-status` 要素と静的app shell一式。
- Produces: `registerPwa(onStatus)`（未対応時は`null`、対応時は登録Promise）、scope相対manifest、classic Service Workerのinstall/activate/fetchイベント、iPhone導入手順。

- [ ] **Step 1: manifest・アイコン・workerの失敗テストを書く**

`tests/pwa.test.js` はNode標準の `fs`, `vm`, `node:test` だけを使う。manifestをJSONとして読み、実際の`sw.js`をfake worker globalで実行するヘルパーを置く。期待値は実装の定数から計算せず、次のリテラルで検証する。

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

const expectedShell = [
  './', './index.html', './styles.css', './src/app.js', './src/game.js',
  './src/storage.js', './src/presenter.js', './src/pwa.js',
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
  assert.equal(manifest.name, '月影仕分け局');
  assert.equal(manifest.start_url, './');
  assert.equal(manifest.scope, './');
  assert.equal(manifest.display, 'standalone');
  assert.deepEqual(manifest.icons.map(({ src, sizes }) => [src, sizes]), [
    ['./assets/icon-192.png', '192x192'],
    ['./assets/icon-512.png', '512x512']
  ]);
});

test('install precaches the complete relative app shell', async () => {
  let openedName = '';
  let added = [];
  const caches = { open: async (name) => ({ addAll: async (urls) => { openedName = name; added = [...urls]; } }) };
  const { listeners } = await loadWorker({ caches, fetch: async () => null });
  let pending;
  listeners.get('install')({ waitUntil: (promise) => { pending = promise; } });
  await pending;
  assert.equal(openedName, 'moonlit-sorting-office-v1');
  assert.deepEqual(added, expectedShell);
});

test('activate removes only obsolete caches owned by this app', async () => {
  const deleted = [];
  const caches = {
    keys: async () => ['moonlit-sorting-office-v0', 'moonlit-sorting-office-v1', 'another-app-v1'],
    delete: async (name) => { deleted.push(name); return true; }
  };
  const { listeners } = await loadWorker({ caches, fetch: async () => null });
  let pending;
  listeners.get('activate')({ waitUntil: (promise) => { pending = promise; } });
  await pending;
  assert.deepEqual(deleted, ['moonlit-sorting-office-v0']);
});
```

さらに次の2振る舞いを個別テストにする。

- same-origin navigationで`fetch`がrejectしたとき、`caches.match('https://example.test/moonlit-sorting-office/index.html')`のResponseが`respondWith`から返る。
- cross-origin GETとsame-origin POSTは`respondWith`を一度も呼ばない。

PNGは先頭24byteのIHDR幅・高さを`readUInt32BE(16/20)`で読み、180/192/512の各ファイルが正方形の期待寸法であるテストを加える。

- [ ] **Step 2: REDを確認する**

Run: `npm test -- --test-name-pattern="manifest|install precaches|activate removes|navigation|cross-origin|PNG"`

Expected: FAIL。manifest、worker、iconsが存在しないため読込に失敗する。

- [ ] **Step 3: manifest、ソースアイコン、PNGアイコンを作る**

`manifest.webmanifest` は次の機械可読契約を満たす。

```json
{
  "name": "月影仕分け局",
  "short_name": "月影仕分け",
  "description": "深夜の航路郵便を規則に従って仕分ける作業ゲーム",
  "lang": "ja",
  "start_url": "./",
  "scope": "./",
  "display": "standalone",
  "background_color": "#081525",
  "theme_color": "#10263f",
  "icons": [
    { "src": "./assets/icon-192.png", "sizes": "192x192", "type": "image/png", "purpose": "any maskable" },
    { "src": "./assets/icon-512.png", "sizes": "512x512", "type": "image/png", "purpose": "any maskable" }
  ]
}
```

`assets/icon-source.svg` は512×512、濃紺背景、中央80%の安全領域に生成り封筒と金色の三日月を置き、文字に依存しない単純な図形だけで作る。次の既存ローカル変換コマンドでPNGを生成し、生成物をコミットする（ffmpegは開発時だけで、ゲーム実行時依存ではない）。

```powershell
ffmpeg -y -i assets/icon-source.svg -vf scale=180:180 assets/icon-180.png
ffmpeg -y -i assets/icon-source.svg -vf scale=192:192 assets/icon-192.png
ffmpeg -y -i assets/icon-source.svg -vf scale=512:512 assets/icon-512.png
```

- [ ] **Step 4: classic Service Workerを最小実装する**

`sw.js` はclassic scriptとし、cache名 `moonlit-sorting-office-v1`、テスト記載順のapp shellを持つ。installはcacheを開いて`addAll`後に`self.skipWaiting()`。activateはprefix `moonlit-sorting-office-` かつ現cache名以外だけを削除後`self.clients.claim()`。

fetchは `request.method === 'GET'` かつ `new URL(request.url).origin === self.location.origin` のときだけ`respondWith`する。処理はnetwork-first: `fetch(request)`成功時、`response.ok`ならcloneを現cacheへ`put`して元responseを返す。失敗時は`caches.match(request)`、navigationならさらに `new URL('./index.html', self.registration.scope).href` をmatchし、どちらもなければthrowしてブラウザ標準エラーにする。

- [ ] **Step 5: PWA登録とApple/GitHub Pages相対リンクを接続する**

`src/pwa.js` の公開関数は次の形にする。

```js
export function registerPwa(onStatus = () => {}) {
  if (!('serviceWorker' in navigator)) return null;
  return navigator.serviceWorker.register('./sw.js', { scope: './' })
    .then((registration) => {
      if (registration.waiting) onStatus('更新版を利用できます。再読み込みしてください');
      registration.addEventListener('updatefound', () => {
        const worker = registration.installing;
        worker?.addEventListener('statechange', () => {
          if (worker.state === 'installed' && navigator.serviceWorker.controller) {
            onStatus('更新版を利用できます。再読み込みしてください');
          }
        });
      });
      return registration;
    })
    .catch(() => { onStatus('オフライン準備を完了できませんでした'); return null; });
}
```

`src/app.js` は初期描画後に`registerPwa`を呼び、通知を`#save-status`へ表示する。`index.html` headへ相対manifest、180px Apple icon、theme-color、`apple-mobile-web-app-capable=yes`、`apple-mobile-web-app-title=月影仕分け局`、`apple-mobile-web-app-status-bar-style=black-translucent`を追加する。root絶対パスを作らない。

- [ ] **Step 6: PWAテストのGREENと全検証を確認する**

Run: `npm test`

Expected: 19 tests以上 PASS、0 fail、警告なし。

Run: `Get-ChildItem src,tests -Filter *.js -Recurse | ForEach-Object { node --check $_.FullName }; node --check sw.js`

Expected: 全ファイルexit 0。

Run: `rg -n '(href|src|register|start_url|scope)\s*[:=]\s*["'"']/+' index.html manifest.webmanifest src sw.js`

Expected: root絶対パスmatchなし。

- [ ] **Step 7: READMEへiPhone導入・公開・データ境界を書く**

READMEへ次を具体的に追記する。

- 想定repo `moonlit-sorting-office` と想定URL `https://jueyuedao-ship-it.github.io/moonlit-sorting-office/`。
- GitHub Pagesはmain branch rootからHTTPS公開し、すべて相対パスなのでrepoサブパスで動くこと。
- iPhone SafariでURLを開く→共有→「ホーム画面に追加」→追加後アイコンから一度オンライン起動→以後オフライン利用、の順。
- 更新時はオンラインで再度開いて更新通知後に再読込。反映しない場合はSafariタブとホーム画面アプリを閉じて再起動する。
- 勤務データは各端末・各browser originのlocalStorageだけにあり、GitHubソース/Service Workerキャッシュ更新とは別。公開更新は既存データを同期・移行・削除せず、Safariサイトデータ削除では失われる。
- `gh auth status`、remote、同名repoの確認後だけrepo作成/push/Pages設定し、既存repoを上書きしない公開手順。

- [ ] **Step 8: Service Worker管理下の実ブラウザ・offline・サブパス確認をする**

単純サーバーをプロジェクト親から起動し、`/moonlit-sorting-office/` のようなネストURLで配信する。ブラウザでmanifestとworker scopeを確認し、一度全app shellを読込後offlineへ切り替えて再読込する。ゲーム画面が出て途中状態が復元され、数字キー/クリックを続行できること、コンソールに例外がないことを記録する。onlineへ戻し、再読込後もlocalStorage状態が残ることを確認する。

- [ ] **Step 9: 自己レビューしてコミットする**

app shellと実ファイル一覧、manifest icon寸法、cache prefix削除範囲、Pages相対パス、READMEのiPhone手順を突き合わせる。

```bash
git add src/pwa.js src/app.js index.html manifest.webmanifest sw.js assets tests/pwa.test.js README.md
git commit -m "feat: make the sorting office an offline PWA"
```

## Final Verification

- [ ] `npm test` を最終HEADで実行し、全件PASSと0 failを記録する。
- [ ] `node --check` を全JSへ実行し、exit 0を記録する。
- [ ] 最終ブラウザ実プレイで開始・仕分け・区間変更・再読込復元・結果を確認する。
- [ ] Service Worker管理下でoffline再読込・ゲーム続行・localStorage復元を確認する。
- [ ] GitHub Pages相当のサブパスでmanifest/icons/worker scopeの相対解決を確認する。
- [ ] `git status --short` で意図しない未追跡/変更がないことを確認する。
- [ ] 全体コードレビューを最終ブランチ差分に対して実施する。
