# 単語カード(tango-cards)

Solid.js + **Panda CSS**(ゼロランタイム CSS-in-JS)製の単語帳 Web アプリです。
JSON または CSV を返す API からデータを取得し、カードを 1 枚ずつめくって学習し、結果(OK / not OK)を同じ API へ POST します。
`contents` は **GFM 準拠のマークダウン**として描画されます。

## スタイリング方針

- **同一ファイル内コロケーション**: 各コンポーネント固有のスタイルは、そのコンポーネントファイル内に `css({...})` / `cva({...})` で直接定義しています(`src/Deck.tsx`, `src/Manager.tsx`, `src/App.tsx`)
- **共通スタイルは import**: 2 箇所以上で使うスタイル(ボタン・セレクト・トースト等)だけを `src/ui.ts` に置き、各コンポーネントから import します
- **グローバルスタイルは最小限**: `panda.config.ts` の `globalCss` は body の地色・文字色・書体のみ。あとは標準リセット(preflight)だけです
- デザイントークン(色・書体)は `panda.config.ts` の `theme.tokens` に定義し、`css({ color: "shu" })` のように型補完付きで参照します

スタイルはすべて**ビルド時に静的 CSS へ抽出**され、JS バンドルに残るのはクラス名を組み立てる小さな生成ヘルパー(`styled-system/`)のみです。

## 機能

- **取得先 API の管理(localStorage)**
  - `API_id` / `API 名` / `URL` / `表示順 (order)` を複数保存できます
  - 一覧から選択して学習を開始できます
- **URL パラメータでの直接起動**
  - `https://<user>.github.io/<repo>/?id=<API_id>` で、該当 API を選択した状態で開けます
  - 一覧の「リンクをコピー」でこの URL を取得できます
- **表示順 (`order`)** — API ごとに localStorage に保存されます
  - `random` … ランダム(デフォルト)
  - `id_asc` … id 昇順
  - `date_desc` … 日付降順(要素に `date` が無い場合は代わりに `id` を使用)
- **学習フロー**
  1. 最初は `title` のみ + **[Reveal] [Skip]** ボタン
  2. **[Reveal]** で `contents` を表示し、ボタンが **[OK] [Skip]** に変化
  3. **[OK]** はチェックボックス的なトグル(押すと active)
  4. **[Skip]** で次のカードへ
     - Reveal 後の Skip → 結果を API へ POST
     - Reveal 前の Skip → POST しない
- キーボード操作: `Space` = Reveal / OK 切替、`Enter` = Skip
- **PWA 対応** — `manifest.webmanifest` と Service Worker(`public/sw.js`)を同梱。ホーム画面に追加してスタンドアロン表示でき、一度開けばオフラインでも起動します
  - アプリシェル(HTML / JS / CSS / アイコン)をキャッシュ。取得先 API(別オリジン)や結果 POST はキャッシュせずネットワークへ素通しします
  - アイコンは `public/icons/`(`icon-192.png` / `icon-512.png` / iOS 用 `apple-touch-icon.png`)
- **狭い端末でのレイアウト** — カードや表が画面幅を超えないよう調整済み(flex 子の `min-width: 0`、表は横スクロール、`overflow-x` の安全網)

## API 仕様(アプリが期待する形)

### GET(データ取得)

登録した URL に対して `GET` し、**JSON 配列** または **CSV** を受け取ります(カラム名は共通: `id` / `title` / `contents` / `date`)。

```json
[
  { "id": 1, "title": "AAA", "contents": "BBB", "date": "2026-06-01T09:00:00Z" }
]
```

```csv
id,title,contents,date
1,AAA,BBB,2026-06-01T09:00:00Z
```

- `date` は任意です(`date_desc` のソートに使用。無ければ `id` で代用)
- **形式の判定**は `Content-Type` ヘッダ(`application/json` / `text/csv`)→ URL 拡張子(`.json` / `.csv`)→ 中身の先頭文字、の順で自動的に行います
- CSV は RFC 4180 準拠でパースします(引用符内のカンマ・改行・`""` エスケープに対応)
- **`contents` は GFM 準拠のマークダウン**として描画します(見出し・リスト・表・コード・打ち消し線・チェックリスト等)。描画前に [DOMPurify](https://github.com/cure53/DOMPurify) でサニタイズするため、取得元の HTML 由来の XSS は無効化されます

### POST(結果送信)

Reveal 後に Skip すると、**同じ URL** へ以下の JSON を `POST` します。

```json
{
  "id": 1,
  "is_OK": true,
  "date": "2026-06-11T12:34:56.789Z"
}
```

- `id` … 要素の id / `is_OK` … [OK] が押下されていたか / `date` … 現在日時(ISO 8601)
- `Content-Type: application/json`

> 別オリジンの API を使う場合は、API 側で CORS(`Access-Control-Allow-Origin` 等)の許可が必要です。

### 動作確認用サンプル

`public/sample.json` と `public/sample.csv`(マークダウン入り)を同梱しています。API 登録画面で URL に `./sample.json` または `./sample.csv` を指定すると GET 部分の動作を確認できます(静的ファイルのため POST は失敗し、画面下に通知が出ますが学習は続行できます)。

## 開発

```bash
npm install   # postinstall(prepare)で panda codegen も実行されます
npm run dev
npm run build    # panda codegen && vite build
npm run preview
```

- `styled-system/` は `panda codegen` が生成するディレクトリです(.gitignore 済み)
- エディタで `css()` の型補完が効かないときは `npx panda codegen` を一度実行してください
- 最初の `npm install` で生成される **package-lock.json をコミットしてください**(CI が `npm ci` を使えるようになります。無い場合は自動で `npm install` にフォールバックします)

## GitHub Pages へのデプロイ

1. このリポジトリを GitHub に push(デフォルトブランチ: `main`)
2. リポジトリの **Settings → Pages → Build and deployment → Source** を **GitHub Actions** に変更
3. `main` への push で `.github/workflows/deploy.yml` が走り、自動でビルド & デプロイされます

`vite.config.ts` で `base: "./"`(相対パス)にしているため、サブパス配信でもそのまま動きます。

## バンドルサイズについて

- **Solid.js** … 仮想 DOM なしの軽量ランタイム
- **Panda CSS** … スタイルはビルド時に静的 CSS へ抽出。実行時依存パッケージなし(`@pandacss/dev` は devDependencies のみ)
- Web フォント不使用(システムフォントスタックのみ)
- `modulePreload` ポリフィル無効化、`console` / `debugger` 除去、チャンク 1 本化、ルーター不使用

## localStorage スキーマ

キー: `tango-cards.sources.v1`

```json
[
  { "id": "english-words", "name": "英単語帳", "url": "https://example.com/api/words", "order": "random" }
]
```
