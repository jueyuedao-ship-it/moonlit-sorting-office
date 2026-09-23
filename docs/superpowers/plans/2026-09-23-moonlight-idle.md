# 月影工房 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 既存公開サイトを、クリックから自動化・第2資源・転生へ育つ日本語放置ゲームに置換する。

**Architecture:** 純粋なゲームエンジンに時刻差分と購入を集約し、保存・表示・PWAを分ける。既存静的サイトの構成を維持しつつ、仕分け専用コードは新ゲーム用に交換する。

**Tech Stack:** HTML, CSS, ES modules, Node.js built-in test runner, Service Worker, GitHub Pages.

**Spec:** `docs/superpowers/specs/2026-09-23-moonlight-idle-design.md`

## Global Constraints

- 日本語、スマホ操作、完全ローカル、外部API・追加ランタイム依存なし。
- 同じ公開URL `https://jueyuedao-ship-it.github.io/moonlit-sorting-office/` を使う。
- 旧保存キー `moonlit-sorting-office:v1` は読み込みも削除もしない。新保存キーは `moonlight-idle:v1`。
- オフライン収益は最大8時間。隠れたタブと再表示で収益を二重計上しない。
- 仕分けループは残さない。クリック、月光設備4種、強化、星屑、転生、恒久倍率を作る。
- すべての新規ゲームロジックは実装前に失敗するテストを確認する。

## Review Focus

- 保存値の `NaN`/負数/未知バージョンを拒否して初期状態に戻ること（Task 2）。
- 長い非表示とオフラインをまたいでも8時間で上限になり、二重付与しないこと（Task 1, 3）。
- 価格が所持金を超える時に購入不能で、所持数と費用が変わらないこと（Task 1）。
- 星屑・月光の条件を満たさない転生を拒否し、満たすと恒久倍率が次周に効くこと（Task 1）。
- サブパス配置・旧SWからの更新で新アプリのシェルがオフライン提供されること（Task 4）。

---

### Task 1: ゲーム計算と成長バランス

**Files:** Replace `src/game.js`; replace `tests/game.test.js`; create `tests/balance.test.js`.

**Interfaces:** Produce `createGame(now)`, `click(state)`, `buyGenerator(state,id)`, `buyUpgrade(state,id)`, `advance(state,now)`, `prestige(state)`, `getGeneratorCost(state,id)`, `getProduction(state)`, `canPrestige(state)`, `isGameState(state)`, and exported catalog constants. All state transitions return new state and never mutate input.

- [ ] Step 1: Write failing tests for a fresh click, increasing prices, production, unlocks, star production, upgrades, prestige requirements/reset/multiplier, capped offline time, and invalid transitions. Name concrete expected numeric examples in tests.
- [ ] Step 2: Run `node --test tests/game.test.js tests/balance.test.js`; confirm failure for absent behavior.
- [ ] Step 3: Replace game engine with finite-number validated state and pure transitions from the spec. Keep generator and upgrade IDs stable for save data and UI.
- [ ] Step 4: Run the same tests green. Add a deterministic balance simulation using a documented purchasing strategy, with assertions for first prestige in a reasonable simulated time and faster second cycle.
- [ ] Step 5: Commit engine and tests with `git add src/game.js tests/game.test.js tests/balance.test.js` and `git commit -m "feat: build incremental game engine"`.

### Task 2: 保存と表示モデル

**Files:** Replace `src/storage.js`, `src/presenter.js`, `tests/storage.test.js`, `tests/presenter.test.js`; update `src/header-status.js` and its test if needed.

**Interfaces:** Consume Task 1 state and catalogs. Preserve `loadSave(storage)` and `saveState(storage, save)` signatures; expose `createDefaultSave(now)` and `toViewModel(game)`. Save includes `version`, `game`, and last-seen timestamp managed through game state. Presenter returns formatted resources, production, costs, unlock visibility, and prestige preview.

- [ ] Step 1: Write failing round-trip, invalid/old-key isolation, storage exception, resource formatting, and unlocking view tests.
- [ ] Step 2: Run target tests and confirm expected failures.
- [ ] Step 3: Implement new save schema and presentation. Keep invalid data from executing code or creating infinite values.
- [ ] Step 4: Run target tests and `npm test` green; remove obsolete tests tied to sorting behavior.
- [ ] Step 5: Commit with `git commit -m "feat: persist and present idle progress"`.

### Task 3: インクリメンタルUI

**Files:** Replace `index.html`, `styles.css`, `src/app.js`; update `README.md`; change icons if needed.

**Interfaces:** Consume Task 1 and 2. UI actions are click, generator buy, upgrade buy, prestige request/confirm. Render on state change and one-second tick; persist immediately for meaningful actions and periodically during passive play.

- [ ] Step 1: Add focused DOM or source-level smoke tests for expected controls and bindings; run red.
- [ ] Step 2: Build Japanese responsive layout with large primary click button, live resource totals/rates, upgrade and equipment cards, star section, prestige explanation and confirmation, and clear save/offline statuses.
- [ ] Step 3: Wire actions, visibility/resume accrual, safe render via text escaping or DOM text nodes, and periodic save. Remove all sorting interactions.
- [ ] Step 4: Run `npm test`, then manually exercise click, purchase, refresh, and narrow viewport in a browser.
- [ ] Step 5: Commit with `git commit -m "feat: replace sorting UI with moonlight idle"`.

### Task 4: PWA、移行境界、公開準備

**Files:** Update `sw.js`, `manifest.webmanifest`, `tests/pwa.test.js`, `README.md`, `docs/superpowers/reports/2026-09-23-idle-release.md`.

**Interfaces:** Keep `registerPwa` compatible with `src/app.js`. The worker owns a distinct v3 idle cache, precaches every reachable source, and maintains same-origin network-first/offline behavior.

- [ ] Step 1: Write failing PWA tests for new cache identity, complete shell, scoped fallback, and retention of unrelated caches.
- [ ] Step 2: Run target test red; implement cache/version/manifest/name changes; run target and full suite green.
- [ ] Step 3: Verify old save key remains untouched, new save survives reload, browser offline launch and update path. Record evidence in report.
- [ ] Step 4: Commit with `git commit -m "feat: ship idle PWA shell"`.

### Task 5: 統合・公開検証

**Files:** Only corrections found by review, `README.md`, and release report.

- [ ] Step 1: Review whole branch against spec and address important findings.
- [ ] Step 2: Run full tests and browser playthrough, balance simulation, mobile viewport, and offline reload; record exact commands and outcomes.
- [ ] Step 3: Push reviewed branch, create and attach PR, merge through an authorized route, and verify the same public URL serves the new experience. Record release commit and browser check.
