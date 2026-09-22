# Task 1 実装レポート

## 対象

決定的な仕分けゲームエンジン（ES Modules、Node.js 標準テストランナー、ランタイム依存なし）を実装した。

## RED / GREEN 証拠

### Step 2: デッキ・分類のRED

実行コマンド:

```text
npm test -- --test-name-pattern="same seed|red seal|checkpoint"
```

期待どおり、プロダクション実装前は `src/game.js` が存在せず、Node が次で終了した。

```text
Error [ERR_MODULE_NOT_FOUND]: Cannot find module '...\\src\\game.js'
imported from ...\\tests\\game.test.js
exit_code=1
```

これはテスト構文エラーではなく、未実装モジュールによる機能欠落の失敗である。

### Step 4: デッキ・分類のGREEN

同じテストを最小実装後に再実行し、次の3件が成功した。

```text
✔ same seed creates the same constrained 18-ticket shift
✔ red seal wins over checkpoint district and heavy weight
✔ checkpoint or heavy mail goes to review and the rest goes regular
ℹ pass 3
ℹ fail 0
exit_code=0
```

### Step 6: 状態遷移のRED

状態テスト追加後、`submitChoice` / `isGameState` の実装をまだ追加していない状態で次を実行した。

```text
npm test -- --test-name-pattern="correct answer|third mistake|eighteenth|invalid destinations"
```

Node が次の未実装エラーで終了した。

```text
SyntaxError: The requested module '../src/game.js' does not provide an export named 'isGameState'
exit_code=1
```

### Step 8: 全GREEN

状態遷移実装後、対象4件はすべて成功した。

```text
✔ correct answer advances and scores from the new streak
✔ third mistake fails immediately and later input is ignored
✔ eighteenth processed ticket wins and streak bonus is capped
✔ invalid destinations and internally inconsistent states are rejected
ℹ pass 4
ℹ fail 0
exit_code=0
```

最終の全テスト実行:

```text
npm test
✔ same seed creates the same constrained 18-ticket shift
✔ red seal wins over checkpoint district and heavy weight
✔ checkpoint or heavy mail goes to review and the rest goes regular
✔ correct answer advances and scores from the new streak
✔ third mistake fails immediately and later input is ignored
✔ eighteenth processed ticket wins and streak bonus is capped
✔ invalid destinations and internally inconsistent states are rejected
ℹ tests 7
ℹ pass 7
ℹ fail 0
ℹ cancelled 0
exit_code=0
```

## 実装内容

- Mulberry32 系の小さな32bit PRNGと区間内 Fisher–Yates で、同じseedから同じ18通を生成。
- 6通ごとに赤印・要確認地区・重量・通常の判定例を含め、区間ごとの3行き先を保証。
- `classifyTicket` は赤印→特急、要確認地区/重量→確認台、それ以外→通常便の優先順位を適用。
- `submitChoice` は入力状態を変更せず、正解加点（100点 + streakボーナス、最大+100）、連続正解、ミス、feedback、18通完了/3ミス終了を更新。
- `isGameState` は version/status/seed、18件のticket形、各カウンタ範囲、相互整合性、feedback形を検証。

## 自己レビュー・追加確認

- `node --check src/game.js` は終了コード0。
- `git diff --check` は終了コード0。
- seed `0`, `1`, `12345`, `4294967295` の各シフトで18件・各区間3行き先制約を確認し、`smoke: ... satisfy 18-ticket/3-outcome constraints` を得た。
- 変異確認: 赤印分岐を下げると優先順位テスト、正解加点を100固定にすると110/1200の得点テスト、終了判定を外すと3ミス/18通テストが失敗する構成である。

## 変更ファイル

- `package.json`
- `src/game.js`
- `tests/game.test.js`
