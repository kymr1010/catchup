import { XMLParser } from "fast-xml-parser";

type FeedSource = {
  name: string;
  url: string;
};

type FeedItem = {
  source: string;
  title: string;
  url: string;
  summary: string;
  publishedAt?: string;
  score: number;
  matchedTerms: string[];
};

type CardApiResponse = {
  data?: {
    id?: number;
  };
};

const DEFAULT_FEEDS: FeedSource[] = [
  { name: "Hacker News", url: "https://news.ycombinator.com/rss" },
  { name: "Zenn", url: "https://zenn.dev/feed" }
];

const API_BASE_URL = process.env.MEMOAPP_API_BASE_URL ?? "https://mnyume.com/api";
const DRY_RUN = process.env.DRY_RUN === "true";
const API_TOKEN = DRY_RUN ? "" : requiredEnv("MEMOAPP_API_TOKEN");
const PARENT_CARD_ID = numberEnv("PARENT_CARD_ID", 88);
const MAX_ITEMS = numberEnv("MAX_ITEMS", 30);
const MIN_SCORE = numberEnv("MIN_SCORE", 1);
const TIME_ZONE = process.env.TIME_ZONE ?? "Asia/Tokyo";
const INTERESTS = csvEnv("INTERESTS", [
  "typescript",
  "javascript",
  "node",
  "react",
  "ai",
  "llm",
  "openai",
  "github actions",
  "web development",
  "software engineering"
]);

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
  textNodeName: "#text",
  trimValues: true
});

async function main() {
  const feeds = readFeeds();
  const items = await fetchAllFeeds(feeds);
  const rankedItems = rankItems(items, INTERESTS)
    .filter((item) => item.score >= MIN_SCORE)
    .slice(0, MAX_ITEMS);

  const today = formatDate(new Date(), TIME_ZONE);
  const title = today;
  const contents = renderMarkdown(today, rankedItems, feeds);

  if (DRY_RUN) {
    console.log(contents);
    console.log(`\nDRY_RUN=true, skipped creating a card under parent ${PARENT_CARD_ID}.`);
    return;
  }

  const cardId = await createCard(title, contents);
  await connectCards(PARENT_CARD_ID, cardId);

  console.log(`Created card ${cardId} under parent ${PARENT_CARD_ID} with ${rankedItems.length} articles.`);
}

function requiredEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

function numberEnv(name: string, defaultValue: number): number {
  const raw = process.env[name];
  if (!raw) return defaultValue;
  const value = Number(raw);
  if (!Number.isFinite(value)) {
    throw new Error(`${name} must be a number.`);
  }
  return value;
}

function csvEnv(name: string, defaultValue: string[]): string[] {
  const raw = process.env[name];
  if (!raw) return defaultValue;
  return raw
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
}

function readFeeds(): FeedSource[] {
  const raw = process.env.FEEDS_JSON;
  if (!raw) return DEFAULT_FEEDS;

  const parsed = JSON.parse(raw) as unknown;
  if (!Array.isArray(parsed)) {
    throw new Error("FEEDS_JSON must be an array.");
  }

  return parsed.map((feed, index) => {
    if (!isRecord(feed) || typeof feed.name !== "string" || typeof feed.url !== "string") {
      throw new Error(`FEEDS_JSON[${index}] must have string name and url.`);
    }
    return { name: feed.name, url: feed.url };
  });
}

async function fetchAllFeeds(feeds: FeedSource[]): Promise<Omit<FeedItem, "score" | "matchedTerms">[]> {
  const results = await Promise.allSettled(feeds.map(fetchFeed));
  const items: Omit<FeedItem, "score" | "matchedTerms">[] = [];
  let successCount = 0;

  for (const result of results) {
    if (result.status === "fulfilled") {
      successCount += 1;
      items.push(...result.value);
    } else {
      console.warn(`Failed to fetch a feed: ${String(result.reason)}`);
    }
  }

  if (successCount === 0) {
    throw new Error("Failed to fetch all feeds. Skip creating a card.");
  }

  return dedupeByUrl(items);
}

async function fetchFeed(feed: FeedSource): Promise<Omit<FeedItem, "score" | "matchedTerms">[]> {
  const response = await fetch(feed.url, {
    headers: {
      "User-Agent": "ketchup-daily-feed-card/1.0"
    }
  });

  if (!response.ok) {
    throw new Error(`${feed.name} returned ${response.status}`);
  }

  const xml = await response.text();
  const parsed = parser.parse(xml) as unknown;
  return normalizeFeed(parsed, feed.name);
}

function normalizeFeed(parsed: unknown, source: string): Omit<FeedItem, "score" | "matchedTerms">[] {
  if (!isRecord(parsed)) return [];

  if (isRecord(parsed.rss) && isRecord(parsed.rss.channel)) {
    const channel = parsed.rss.channel;
    return arrayOf(channel.item).map((item) => normalizeRssItem(item, source)).filter(isFeedItemBase);
  }

  if (isRecord(parsed.feed)) {
    return arrayOf(parsed.feed.entry).map((entry) => normalizeAtomEntry(entry, source)).filter(isFeedItemBase);
  }

  return [];
}

function normalizeRssItem(item: unknown, source: string): Partial<Omit<FeedItem, "score" | "matchedTerms">> {
  if (!isRecord(item)) return {};

  return {
    source,
    title: stringValue(item.title),
    url: stringValue(item.link) || stringValue(item.guid),
    summary: stripHtml(stringValue(item.description) || stringValue(item["content:encoded"])),
    publishedAt: stringValue(item.pubDate) || undefined
  };
}

function normalizeAtomEntry(entry: unknown, source: string): Partial<Omit<FeedItem, "score" | "matchedTerms">> {
  if (!isRecord(entry)) return {};

  return {
    source,
    title: stringValue(entry.title),
    url: atomLink(entry.link),
    summary: stripHtml(stringValue(entry.summary) || stringValue(entry.content)),
    publishedAt: stringValue(entry.updated) || stringValue(entry.published) || undefined
  };
}

function rankItems(items: Omit<FeedItem, "score" | "matchedTerms">[], interests: string[]): FeedItem[] {
  return items
    .map((item) => {
      const text = `${item.title}\n${item.summary}`.toLowerCase();
      const matchedTerms = interests.filter((term) => text.includes(term.toLowerCase()));
      const score = matchedTerms.reduce((total, term) => {
        const escaped = escapeRegExp(term.toLowerCase());
        const titleMatches = countMatches(item.title.toLowerCase(), escaped);
        const bodyMatches = countMatches(item.summary.toLowerCase(), escaped);
        return total + titleMatches * 5 + bodyMatches;
      }, 0);

      return {
        ...item,
        score,
        matchedTerms
      };
    })
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      return timestamp(b.publishedAt) - timestamp(a.publishedAt);
    });
}

function renderMarkdown(today: string, items: FeedItem[], feeds: FeedSource[]): string {
  const lines = [
    `# ${today}`,
    "",
    `対象RSS: ${feeds.map((feed) => feed.name).join(", ")}`,
    `興味キーワード: ${INTERESTS.join(", ")}`,
    "",
    "## 記事"
  ];

  if (items.length === 0) {
    lines.push("", "関連度がしきい値以上の記事はありませんでした。");
    return lines.join("\n");
  }

  for (const [index, item] of items.entries()) {
    lines.push(
      "",
      `### ${index + 1}. [${escapeMarkdown(item.title)}](${item.url})`,
      "",
      `- Source: ${item.source}`,
      `- Score: ${item.score}`,
      `- Matched: ${item.matchedTerms.join(", ") || "none"}`,
      item.publishedAt ? `- Published: ${item.publishedAt}` : "- Published: unknown"
    );

    if (item.summary) {
      lines.push("", truncate(item.summary, 500));
    }
  }

  return lines.join("\n");
}

async function createCard(title: string, contents: string): Promise<number> {
  const response = await apiFetch("/card", {
    method: "POST",
    body: JSON.stringify({
      id: 0,
      position: { x: 0, y: 0 },
      size: { x: 640, y: 480 },
      title,
      contents,
      parent_id: PARENT_CARD_ID,
      tag_ids: [],
      visibility: "private",
      card_type: "normal"
    })
  });

  const body = (await response.json()) as CardApiResponse;
  const cardId = body.data?.id;
  if (!cardId) {
    throw new Error(`Create card response did not include data.id: ${JSON.stringify(body)}`);
  }
  return cardId;
}

async function connectCards(parentId: number, childId: number): Promise<void> {
  await apiFetch("/cards_connect", {
    method: "POST",
    body: JSON.stringify({
      card_parent_id: parentId,
      card_child_id: childId,
      connector: "null"
    })
  });
}

async function apiFetch(path: string, init: RequestInit): Promise<Response> {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${API_TOKEN}`,
      "Content-Type": "application/json",
      ...init.headers
    }
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`${path} returned ${response.status}: ${body}`);
  }

  return response;
}

function atomLink(link: unknown): string {
  if (typeof link === "string") return link;

  const links = arrayOf(link);
  const alternate = links.find((value) => isRecord(value) && value["@_rel"] === "alternate");
  const target = alternate ?? links[0];
  if (isRecord(target) && typeof target["@_href"] === "string") return target["@_href"];

  return "";
}

function isFeedItemBase(item: Partial<Omit<FeedItem, "score" | "matchedTerms">>): item is Omit<FeedItem, "score" | "matchedTerms"> {
  return Boolean(item.title && item.url);
}

function dedupeByUrl(items: Omit<FeedItem, "score" | "matchedTerms">[]): Omit<FeedItem, "score" | "matchedTerms">[] {
  const seen = new Set<string>();
  return items.filter((item) => {
    if (seen.has(item.url)) return false;
    seen.add(item.url);
    return true;
  });
}

function arrayOf(value: unknown): unknown[] {
  if (Array.isArray(value)) return value;
  if (value == null) return [];
  return [value];
}

function stringValue(value: unknown): string {
  if (typeof value === "string") return value.trim();
  if (typeof value === "number") return String(value);
  if (isRecord(value) && typeof value["#text"] === "string") return value["#text"].trim();
  return "";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function stripHtml(value: string): string {
  return value
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, "\"")
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

function truncate(value: string, maxLength: number): string {
  if (value.length <= maxLength) return value;
  return `${value.slice(0, maxLength - 1).trim()}...`;
}

function escapeMarkdown(value: string): string {
  return value.replace(/([\[\]])/g, "\\$1");
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function countMatches(value: string, escapedPattern: string): number {
  return [...value.matchAll(new RegExp(escapedPattern, "g"))].length;
}

function timestamp(value: string | undefined): number {
  if (!value) return 0;
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? 0 : parsed;
}

function formatDate(date: Date, timeZone: string): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(date);

  const year = parts.find((part) => part.type === "year")?.value;
  const month = parts.find((part) => part.type === "month")?.value;
  const day = parts.find((part) => part.type === "day")?.value;
  if (!year || !month || !day) {
    throw new Error(`Failed to format date for timezone ${timeZone}.`);
  }

  return `${year}-${month}-${day}`;
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
