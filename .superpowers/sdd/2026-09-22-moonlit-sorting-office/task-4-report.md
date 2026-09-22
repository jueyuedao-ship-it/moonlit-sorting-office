# Task 4 レポート: PWAオフライン化とGitHub Pages公開準備

## Status

実装完了。PWA契約、Service Worker、相対パス、アイコン、登録通知、READMEの公開・iPhone導入手順を追加した。公開先のGitHubリポジトリ作成・push・Pages設定は行っていない。

## TDD RED / GREEN

### RED

まず `tests/pwa.test.js` を追加し、manifest・Service Worker・PNGをまだ作成していない状態で次を実行した。

```text
npm test -- --test-name-pattern="manifest|install precaches|activate removes|navigation|cross-origin|PNG"
```

期待どおり6テストが失敗した。失敗理由は `manifest.webmanifest`、`sw.js`、`assets/icon-*.png` の `ENOENT` で、テスト自体の構文エラーではなかった。

登録ラッパーについても、登録テストを先に用意して `src/pwa.js` を一度取り除いた状態で実行し、`ERR_MODULE_NOT_FOUND` を確認してから実装した。

### GREEN

実装後の最終テスト:

```text
npm test
ℹ tests 29
ℹ pass 29
ℹ fail 0
```

追加テストは、manifestの機械可読契約、12項目の相対app shell、旧キャッシュ削除範囲、network-firstキャッシュ更新、同一origin navigationのindex fallback、cross-origin GET / same-origin POSTの素通し、PNGのIHDR寸法、`registerPwa` の未対応・更新・失敗通知を実際のファイル/実行結果で検証している。

## 実装ファイル

- `manifest.webmanifest`: `start_url` / `scope` が `./`、standalone、指定色、192/512のany maskable宣言。
- `sw.js`: classic worker。`moonlit-sorting-office-v1` の相対app shellをinstallで事前キャッシュし、activateでは同prefixの旧versionだけを削除。同一originのGETだけnetwork-firstで処理し、navigation失敗時はscope内 `index.html` へfallbackする。
- `src/pwa.js`: `registerPwa(onStatus)`。未対応時は `null`、登録Promise、waiting/updatefound通知、失敗時の `null` と通知を提供。
- `src/app.js`: 初期描画後に登録し、PWA通知を既存の `#save-status` と分離した状態で表示。保存状態表示の通常動作は維持。
- `index.html`: 相対manifest、180px Apple touch icon、theme-color、Appleホーム画面用metaを追加。
- `assets/icon-source.svg`: 512×512、濃紺背景、生成り封筒と金色の三日月の文字なし図形。
- `assets/icon-180.png`, `assets/icon-192.png`, `assets/icon-512.png`: SVGデザインから生成したコミット済みPNG。
- `tests/pwa.test.js`: Node標準の `fs` / `vm` / `node:test` によるPWA契約テスト。
- `README.md`: 想定Pages URL、main/root公開方針、iPhone Safari導入・更新、localStorageと公開更新のデータ境界、安全な公開前確認手順を追記。

## 静的検証

```text
Get-ChildItem src,tests -Filter *.js -Recurse | ForEach-Object { node --check $_.FullName }
node --check sw.js
node-check: PASS

root-absolute-path-scan: PASS (no matches)
app-shell: all 12 entries exist
```

PNGのテストでPNG署名とIHDRの幅・高さを検証し、180×180、192×192、512×512を確認した。

指定のffmpegコマンドは実行したが、この環境のffmpeg 9.0.1ビルドにはSVGデコーダがなく `Decoding requested, but no decoder found for: svg` となった。そのため、コミット済みの `icon-source.svg` と同じ幾何・配色を使うローカルの .NET `System.Drawing` でPNGを生成し、バイナリ寸法をテストで検証した。実行時にffmpegや他の外部依存は不要である。

## ブラウザ / nested subpath / offline evidence

ワークツリーをrootにした一時HTTPサーバーを起動し、次のnested URLを使用した。

```text
http://127.0.0.1:4173/moonlit-sorting-office/
```

確認結果:

1. ブラウザDOM上でURLがnested pathのまま開き、manifestは `/moonlit-sorting-office/manifest.webmanifest`、Apple iconは `/moonlit-sorting-office/assets/icon-180.png`、theme-colorは `#10263f`、Apple capableは `yes` と解決された。
2. 「勤務を開始」をクリックし、赤印のticket-01を「特急便」へ実仕分け。表示は `得点 110 / 2 / 18通 / 誤配 0 / 3 / 連続正解 1` となった。
3. ブラウザ再読み込み後、同じ `ticket-02`、110点、2/18、連続正解1が復元された。localStorageの継続を確認した。
4. サーバーを停止してから同じnested URLを再読み込み。Service Workerのapp shellからゲーム画面が表示され、ticket-02と110点、2/18が復元された。
5. オフライン状態のままticket-02を「通常便」へ実仕分けでき、表示は `得点 230 / 3 / 18通 / 誤配 0 / 3 / 連続正解 2` となった。
6. サーバーを再起動しオンライン再読み込み後も230点、3/18、連続正解2が残った。
7. online/offline操作を通したブラウザのerror/warningログは空配列だった。

直接のDevTools登録scope読み出しはこのin-app browserの評価APIでは提供されなかったが、相対登録 (`./sw.js`, `{ scope: './' }`)、相対manifest、nested pathでのoffline navigation fallbackとlocalStorage復元を、上記の実ブラウザ挙動で確認した。

## Self-review / concerns

- app shellと実ファイル12項目は一致している。
- activateは `moonlit-sorting-office-` prefixかつ現version以外だけを削除し、他アプリのcacheへ触れない。
- HTML、manifest、登録、Service WorkerのURLにorigin-root絶対パスはない。
- localStorageはsource/cache更新と独立し、READMEにもSafariサイトデータ削除時の消失を明記した。
- 外部CDN、外部フォント、ゲーム実行時ネットワーク必須依存はない。
- GitHubへの外部変更は未実施。公開時はREADME記載どおり `gh auth status`、remote、同名repoを確認してから行う。
- ffmpegのSVG入力非対応は開発環境固有の生成上の注意点。PNG成果物と寸法契約は満たしている。

## Commit

このレポートを含むTask 4変更を `feat: make the sorting office an offline PWA` としてコミットする。
