# Daily Feed Card

Hacker News と Zenn などのRSS/Atomフィードを毎日取得し、興味キーワードとの関連度順に並べたカードを MemoApp API に作成します。

作成したカードは `PARENT_CARD_ID`、デフォルトでは `88` の子カードとして `/cards_connect` で接続します。

## GitHub Actions 設定

Repository secrets に以下を設定してください。

- `MEMOAPP_API_TOKEN`: `https://mnyume.com/api` 用のBearer token

Repository variables は任意です。

- `INTERESTS`: 興味キーワード。カンマ区切り。例: `typescript,react,llm,github actions`
- `FEEDS_JSON`: 追加・変更するRSS/Atomフィード。例: `[{"name":"Hacker News","url":"https://news.ycombinator.com/rss"},{"name":"Zenn","url":"https://zenn.dev/feed"}]`

workflow は `.github/workflows/daily-feed-card.yml` で毎日 `07:00 JST` に動きます。手動実行もできます。

## ローカル実行

```bash
npm install
npm run build
DRY_RUN=true npm run daily-feed
```

実際に投稿する場合:

```bash
MEMOAPP_API_TOKEN=... npm run daily-feed
```
