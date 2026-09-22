# 月影仕分け局 最終レビュー修正報告

実施日: 2026-09-22
対象: `moonlit-sorting-office` worktree (`HEAD e9d9690` 起点)

## 対応結果

- `isGameState` に、`cursor === correct + mistakes`、ready 状態の全カウンタ/得点/feedback のゼロ化、`bestStreak <= correct`、`streak <= bestStreak` を追加した。
- won/failed の fixture は手動で terminal 状態へ spread せず、`submitChoice` を繰り返して到達させた。正答18回の won と誤配3回の failed の両方を保存テストに使用している。
- 保存済み terminal `activeGame` は `stats.shiftsCompleted >= 1` かつ `stats.bestScore >= activeGame.score` のときだけ有効とした。通常の playing save は勤務数0/最高得点0でも有効なままにした。
- `src/header-status.js` の純粋 presenter を追加し、保存状態、PWA状態、勤務状態を独立した値として返すようにした。
- `#save-status`、`#pwa-status`、`#shift-status` を独立要素として追加し、PWA callback は PWA メッセージだけを更新して通常の `render()` に戻すようにした。保存不可メッセージを PWA 通知が隠さない。
- 進捗表示を現在票番号ではなく処理済み件数に修正した。開始時は `0 / 18通`、6通処理後は `6 / 18通` になる。
- Service Worker cache を `moonlit-sorting-office-v2` へ更新し、新しい `./src/header-status.js` を相対 app shell に追加した。旧 v0/v1 cache の削除契約も更新した。

## TDD 証拠

各 production change の前に focused RED を確認し、その後に最小実装を入れて GREEN を確認した。

1. 状態/save invariants
   - RED: `node --test tests/game.test.js tests/storage.test.js` — 21 tests中17 pass/4 fail。cursor和、readyゼロ化、bestStreak上限、terminal save統計の新規回帰が期待どおり失敗。
   - GREEN: 同コマンド — 21/21 pass。
2. processed count
   - RED: `node --test tests/presenter.test.js` — 4 tests中2 fail。cursor6 が `7 / 18通`、開始時が `1 / 18通` だった。
   - GREEN: `node --test tests/presenter.test.js tests/game.test.js tests/storage.test.js` — 25/25 pass。
3. header status presenter
   - RED: `node --test tests/header-status.test.js` — 新規 runtime module 不在で失敗。
   - GREEN: `node --test tests/header-status.test.js` — 2/2 pass。保存不可とPWA更新通知の同時表示、および ready/playing/won/failed の状態ラベルを検証。
4. PWA cache/app-shell contract
   - RED: `node --test tests/pwa.test.js` — 11 tests中9 pass/2 fail。v2 cache名と新runtime moduleのapp shellが未反映。
   - GREEN: `node --test tests/header-status.test.js tests/pwa.test.js` — 13/13 pass。

## 最終検証

- `npm test`: 38/38 pass、fail 0。
- 全 runtime JavaScript と `sw.js` を `node --check` で検証: pass。
- HTML/manifest の root-relative asset path 検査: pass。Service Worker に v2 cache と `./src/header-status.js` があることを確認: pass。
- `git diff --check`: pass。
- ブラウザ smoke: ローカル HTTP サーバー `http://localhost:4317/` を使用。
  - 初期画面の header: `勤務前`、`端末内に自動保存`。
  - 「勤務を開始」後: `勤務中`、最初の ticket、操作ボタンが表示されることを確認。
  - 正しい仕分けを6回実行後: `得点 810 6 / 18通 誤配 0 / 3 連続正解 6`、`ticket-07`、および `区間変更。要確認地区は霧ヶ丘です。` を確認。
  - 保存/PWA同時状態は `tests/header-status.test.js` の純粋 presenter 回帰で確認し、2つの通知が別々の値として保持されることを検証。

## 注意点

- PWA更新通知は Service Worker の更新待ち状態が発生した時だけブラウザ上で表示されるため、今回の初回ローカル smoke では空の PWA欄から開始した。保存不可と更新通知の同時保持自体は純粋テストで検証済み。
- ローカル smoke 用 HTTP サーバーは検証終了後に停止する。
