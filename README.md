# Daily Feed Card

Hacker News と Zenn などのRSS/Atomフィードを毎日取得し、興味カテゴリとの関連度順に並べたカードを MemoApp API に作成します。

作成したカードは `PARENT_CARD_ID`、デフォルトでは `88` の子カードとして `/cards_connect` で接続します。

## GitHub Actions 設定

Repository secrets に以下を設定してください。

- `MEMOAPP_API_TOKEN`: `https://mnyume.com/api` 用のBearer token
- `OPENAI_API_KEY`: RSS記事のカテゴリ判定と要約に使うOpenAI API key

Repository variables は任意です。

- `INTEREST_CATEGORIES_JSON`: 興味カテゴリとキーワード。未設定ならデフォルトカテゴリを使います。
- `CATEGORY_MAX_ITEMS`: 1カテゴリあたりの最大記事数。未設定なら `MAX_ITEMS / カテゴリ数` から自動計算します。
- `DISCOVERY_MAX_ITEMS`: Discovery枠の最大記事数。デフォルトは `5` です。
- `LOW_CONFIDENCE_MAX_ITEMS`: AI判定の信頼度が低い記事を確認用に残す最大件数。デフォルトは `3` です。
- `SOURCE_COVERAGE_MAX_ITEMS`: まだ記事が選ばれていないRSSソースから確認用に拾う最大件数。デフォルトは `3` です。
- `MIN_RELEVANCE`: 採用する関連度の下限。デフォルトは `0.25` です。
- `OPENAI_MODEL`: AI判定・要約に使うモデル。デフォルトは `gpt-5-nano` です。
- `AI_BATCH_SIZE`: 1回のOpenAI API呼び出しで判定する記事数。デフォルトは `20` です。
- `FEEDS_JSON`: 追加・変更するRSS/Atomフィード。例: `[{"name":"Hacker News","url":"https://news.ycombinator.com/rss"},{"name":"Zenn","url":"https://zenn.dev/feed"}]`

`INTEREST_CATEGORIES_JSON` の例:

```json
{
  "AI": ["ai", "llm", "openai", "machine learning"],
  "Frontend": ["typescript", "javascript", "react", "css"],
  "Backend": ["node", "api", "database", "server"],
  "Infrastructure": ["github actions", "docker", "kubernetes", "cloud"],
  "Engineering": ["testing", "architecture", "security"]
}
```

カード本文ではカテゴリごとに `<details>` タグで折りたたみ表示します。RSS記事はキーワードで事前除外せず、全件をAIでカテゴリ判定・要約します。

workflow は `.github/workflows/daily-feed-card.yml` で毎日 `04:00 JST` に動きます。手動実行もできます。

手動実行時は `dry_run` オプションを `true` にすると、RSS取得と本文生成だけを行い、カード作成と親子接続はスキップします。

## ローカル実行

```bash
npm install
npm run build
OPENAI_API_KEY=... DRY_RUN=true npm run daily-feed
```

実際に投稿する場合:

```bash
OPENAI_API_KEY=... MEMOAPP_API_TOKEN=... npm run daily-feed
```
