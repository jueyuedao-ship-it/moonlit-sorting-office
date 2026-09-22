# Task 2 実装レポート: 安全な保存と勤務統計

## 実装

- `src/storage.js` を追加し、`STORAGE_KEY`、既定保存値、保存の読込・書込、完了勤務統計更新を実装した。
- 保存値は version 1、`activeGame` の `null` または `isGameState` の妥当なゲーム状態、非負整数の統計値だけを受け入れる。
- JSON破損、未知 version、不整合値は既定値と `invalid-save` に戻す。
- Storage の `getItem` / `setItem` と JSON 解析・文字列化の例外は throw せず、`load-unavailable` / `save-unavailable` を返す。
- `recordFinishedShift` は `won` / `failed` だけを数え、同じ `activeGame` 参照を再処理しない。
- `tests/storage.test.js` にメモリStorageを使う5テストを追加した。

## TDD 証拠

### RED 1

テストを先に追加して次を実行した。

```text
npm test -- --test-name-pattern="round-trips|finished shifts"
```

対象テストは次の期待された未実装エラーで失敗した。

```text
Error [ERR_MODULE_NOT_FOUND]: Cannot find module '...\\src\\storage.js'
```

### GREEN 1

最小の保存・統計実装後、同じコマンドを実行した。

```text
✔ valid save round-trips active game and stats
✔ finished shifts update stats without mutating the previous save
ℹ pass 3
ℹ fail 0
```

（既存 game.test.js はパターン外テストを含むファイル単位の成功報告。）

### RED 2

破損・未知 version・不整合・Storage例外・二重計上のテストを追加した後、Step 7 の検証と参照同一性ガードを一時的に外して次を実行した。

```text
npm test -- --test-name-pattern="corrupt|exceptions|double count"
```

期待どおり2件が失敗した。

```text
✖ corrupt, unknown, or inconsistent saves fall back safely
  actual version: 2, expected version: 1
✖ recordFinishedShift ignores active games and does not double count identical result object
  actual shiftsCompleted: 2, expected shiftsCompleted: 1
ℹ pass 2
ℹ fail 2
```

### GREEN 2 / 最終確認

検証、Storage例外変換、二重計上防止を実装し、対象テストを再実行した。

```text
✔ corrupt, unknown, or inconsistent saves fall back safely
✔ storage exceptions are reported without throwing
✔ recordFinishedShift ignores active games and does not double count identical result object
ℹ pass 4
ℹ fail 0
```

その後 `SAVE_VERSION` に定数化する小さな refactor を行い、全テストを実行した。

```text
npm test
ℹ tests 14
ℹ pass 14
ℹ fail 0
ℹ cancelled 0
```

`node --check src/storage.js` と `node --check tests/storage.test.js` も成功し、警告は出ていない。

## 自己レビュー

- 保存キーは要求された `moonlit-sorting-office:v1` と一致する。
- `createDefaultSave()` は呼び出しごとに新しい保存オブジェクトを返す。
- 既存保存を変更せず、統計更新時は新しいトップレベル・統計オブジェクトを返す。
- 失敗時も `loadSave` / `saveState` は要求された `{ value, error }` 形式を返す。
- 最終スイートの14テストは、既存ゲーム9件と保存5件の合計である（ブリーフの期待値12件は既存テスト数と一致しない）。

## Fix Round 1: 終端ゲームの意味検証

### 指摘

`recordFinishedShift` が `status` 文字列だけを見ていたため、`status: 'won'` でも `cursor: 0` のような `isGameState` 不正値を勤務結果として記録できた。この値は `saveState` 後の `loadSave` で破損扱いになり、統計と結果が消える。

### RED（実装変更前）

次の回帰テストを追加した。

- 無効な終端らしいゲームは元の保存オブジェクトを同一参照で返す。
- 意味的に有効な won（`cursor: 18`）は記録後に保存・読込しても結果と統計が残る。
- 既存の完了勤務 fixture も `cursor: 18` の意味的に有効な won へ更新した。

実装変更前に次を実行した。

```text
npm test -- --test-name-pattern="invalid terminal|valid terminal"
```

```text
✖ recordFinishedShift ignores invalid terminal-looking games
  actual: invalid game was installed and shiftsCompleted became 1
  expected: original default save reference
✔ valid terminal results survive a save and load round-trip
ℹ pass 2
ℹ fail 1
```

### GREEN

`recordFinishedShift` の記録条件に `isGameState(game)` を追加した。

```text
npm test -- --test-name-pattern="invalid terminal|valid terminal"
```

```text
✔ recordFinishedShift ignores invalid terminal-looking games
✔ valid terminal results survive a save and load round-trip
ℹ pass 3
ℹ fail 0
```

続けて全体確認を行った。

```text
npm test
ℹ tests 16
ℹ pass 16
ℹ fail 0
ℹ cancelled 0
```

`node --check src/storage.js`、`node --check tests/storage.test.js`、`git diff --check` も成功した。前回の `74319e5` は変更せず、Fix Round 1 は別コミットにした。
