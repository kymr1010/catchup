import OpenAI from "openai";
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
  category: string;
  score: number;
  relevance: number;
  confidence: number;
  aiSummary: string;
  reason: string;
  discovery: boolean;
};

type FeedItemBase = Omit<FeedItem, "category" | "score" | "relevance" | "confidence" | "aiSummary" | "reason" | "discovery">;

type InterestCategory = {
  name: string;
  terms: string[];
};

type CategorizedItems = {
  category: InterestCategory;
  items: FeedItem[];
};

type CardApiResponse = {
  data?: {
    id?: number;
  };
};

const DEFAULT_FEEDS: FeedSource[] = [
  { name: "Hacker News", url: "https://hnrss.org/frontpage?count=30" },
  { name: "Zenn", url: "https://zenn.dev/feed" },
  { name: "TechCrunch", url: "https://techcrunch.com/feed/" },
  { name: "The Verge", url: "https://www.theverge.com/rss/index.xml" },
  { name: "Ars Technica", url: "https://feeds.arstechnica.com/arstechnica/index" },
  { name: "Stack Overflow Blog", url: "https://stackoverflow.blog/feed/" },
  { name: "GitHub Blog", url: "https://github.blog/feed/" },
  { name: "OpenAI News", url: "https://openai.com/news/rss.xml" },
  { name: "Google AI", url: "https://blog.google/technology/ai/rss/" },
  { name: "AWS News Blog", url: "https://aws.amazon.com/blogs/aws/feed/" },
  { name: "Hugging Face Blog", url: "https://huggingface.co/blog/feed.xml" },
  { name: "Lobsters", url: "https://lobste.rs/rss" }
];

const API_BASE_URL = process.env.MEMOAPP_API_BASE_URL?.trim() || "https://mnyume.com/api";
const DRY_RUN = process.env.DRY_RUN === "true";
const API_TOKEN = DRY_RUN ? "" : requiredEnv("MEMOAPP_API_TOKEN");
const PARENT_CARD_ID = numberEnv("PARENT_CARD_ID", 88);
const MAX_ITEMS = numberEnv("MAX_ITEMS", 30);
const FEED_MAX_ITEMS = numberEnv("FEED_MAX_ITEMS", 20);
const MIN_RELEVANCE = numberEnv("MIN_RELEVANCE", 0.25);
const CATEGORY_MAX_ITEMS = optionalNumberEnv("CATEGORY_MAX_ITEMS");
const DISCOVERY_MAX_ITEMS = numberEnv("DISCOVERY_MAX_ITEMS", 5);
const LOW_CONFIDENCE_MAX_ITEMS = numberEnv("LOW_CONFIDENCE_MAX_ITEMS", 0);
const LOW_CONFIDENCE_THRESHOLD = numberEnv("LOW_CONFIDENCE_THRESHOLD", 0.55);
const SOURCE_COVERAGE_MAX_ITEMS = numberEnv("SOURCE_COVERAGE_MAX_ITEMS", 0);
const AI_MODEL = process.env.OPENAI_MODEL?.trim() || "gpt-5-nano";
const AI_BATCH_SIZE = numberEnv("AI_BATCH_SIZE", 20);
const TIME_ZONE = process.env.TIME_ZONE?.trim() || "Asia/Tokyo";
const INTEREST_CATEGORIES = readInterestCategories();

const openai = new OpenAI({
  apiKey: requiredEnv("OPENAI_API_KEY")
});

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
  textNodeName: "#text",
  trimValues: true
});

async function main() {
  const feeds = readFeeds();
  const items = await fetchAllFeeds(feeds);
  const assessedItems = await assessItemsWithAi(items, INTEREST_CATEGORIES);
  const categorizedItems = selectBalancedItems(assessedItems, INTEREST_CATEGORIES, MAX_ITEMS, CATEGORY_MAX_ITEMS);
  const selectedCount = categorizedItems.reduce((total, category) => total + category.items.length, 0);

  const today = formatDate(new Date(), TIME_ZONE);
  const title = today;
  const contents = renderMarkdown(today, categorizedItems, feeds);

  if (DRY_RUN) {
    console.log(contents);
    console.log(`\nDRY_RUN=true, skipped creating a card under parent ${PARENT_CARD_ID}.`);
    return;
  }

  const cardId = await createCard(title, contents);
  await connectCards(PARENT_CARD_ID, cardId);

  console.log(`Created card ${cardId} under parent ${PARENT_CARD_ID} with ${selectedCount} articles.`);
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

function optionalNumberEnv(name: string): number | undefined {
  const raw = process.env[name];
  if (!raw) return undefined;
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

function readInterestCategories(): InterestCategory[] {
  const raw = process.env.INTEREST_CATEGORIES_JSON;
  if (raw) {
    const parsed = JSON.parse(raw) as unknown;
    return parseInterestCategories(parsed);
  }

  const legacyInterests = process.env.INTERESTS;
  if (legacyInterests) {
    return [{ name: "Interests", terms: csvEnv("INTERESTS", []) }];
  }

  return [
    { name: "AI", terms: ["ai", "llm", "openai", "machine learning", "生成ai"] },
    { name: "Frontend", terms: ["typescript", "javascript", "react", "css", "web development"] },
    { name: "Backend", terms: ["node", "api", "database", "server", "backend"] },
    { name: "Infrastructure", terms: ["github actions", "docker", "kubernetes", "cloud", "devops"] },
    { name: "Engineering", terms: ["software engineering", "testing", "architecture", "security"] }
  ];
}

function parseInterestCategories(parsed: unknown): InterestCategory[] {
  if (Array.isArray(parsed)) {
    return parsed.map((category, index) => {
      if (!isRecord(category) || typeof category.name !== "string" || !Array.isArray(category.terms)) {
        throw new Error(`INTEREST_CATEGORIES_JSON[${index}] must have string name and terms array.`);
      }
      return {
        name: category.name,
        terms: category.terms.map((term) => {
          if (typeof term !== "string") {
            throw new Error(`INTEREST_CATEGORIES_JSON[${index}].terms must contain only strings.`);
          }
          return term;
        }).filter(Boolean)
      };
    }).filter((category) => category.terms.length > 0);
  }

  if (isRecord(parsed)) {
    return Object.entries(parsed).map(([name, terms]) => {
      if (!Array.isArray(terms)) {
        throw new Error(`INTEREST_CATEGORIES_JSON.${name} must be an array of strings.`);
      }
      return {
        name,
        terms: terms.map((term) => {
          if (typeof term !== "string") {
            throw new Error(`INTEREST_CATEGORIES_JSON.${name} must contain only strings.`);
          }
          return term;
        }).filter(Boolean)
      };
    }).filter((category) => category.terms.length > 0);
  }

  throw new Error("INTEREST_CATEGORIES_JSON must be an object or an array.");
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

async function fetchAllFeeds(feeds: FeedSource[]): Promise<FeedItemBase[]> {
  const results = await Promise.allSettled(feeds.map(fetchFeed));
  const items: FeedItemBase[] = [];
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

async function fetchFeed(feed: FeedSource): Promise<FeedItemBase[]> {
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
  return normalizeFeed(parsed, feed.name).slice(0, FEED_MAX_ITEMS);
}

function normalizeFeed(parsed: unknown, source: string): FeedItemBase[] {
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

function normalizeRssItem(item: unknown, source: string): Partial<FeedItemBase> {
  if (!isRecord(item)) return {};

  return {
    source,
    title: stringValue(item.title),
    url: stringValue(item.link) || stringValue(item.guid),
    summary: stripHtml(stringValue(item.description) || stringValue(item["content:encoded"])),
    publishedAt: stringValue(item.pubDate) || undefined
  };
}

function normalizeAtomEntry(entry: unknown, source: string): Partial<FeedItemBase> {
  if (!isRecord(entry)) return {};

  return {
    source,
    title: stringValue(entry.title),
    url: atomLink(entry.link),
    summary: stripHtml(stringValue(entry.summary) || stringValue(entry.content)),
    publishedAt: stringValue(entry.updated) || stringValue(entry.published) || undefined
  };
}

async function assessItemsWithAi(items: FeedItemBase[], categories: InterestCategory[]): Promise<FeedItem[]> {
  const assessedItems: FeedItem[] = [];

  for (let start = 0; start < items.length; start += AI_BATCH_SIZE) {
    const batch = items.slice(start, start + AI_BATCH_SIZE);
    const assessments = await requestAiAssessments(batch, categories, start);
    assessedItems.push(...mergeAssessments(batch, assessments));
  }

  return assessedItems.sort(compareFeedItems);
}

type AiAssessment = {
  index: number;
  category: string;
  relevance: number;
  confidence: number;
  summary: string;
  reason: string;
  discovery: boolean;
};

async function requestAiAssessments(
  items: FeedItemBase[],
  categories: InterestCategory[],
  offset: number
): Promise<AiAssessment[]> {
  const response = await openai.responses.create({
    model: AI_MODEL,
    instructions: [
      "You classify RSS articles for a daily engineering reading list.",
      "Assess every article. Do not omit any article.",
      "Choose exactly one configured category name when it fits.",
      "Use category \"Discovery\" for useful, novel, or broadly relevant engineering articles that do not fit configured categories.",
      "Use low relevance for spam, job posts, comments-only pages, duplicate announcements, or articles that are not useful to the user's interests.",
      "Write the summary in Japanese in 2-3 sentences. Cover what happened, why it matters, and the likely engineering or product impact. Do not mention source, relevance, confidence, or scoring metadata.",
      "Return only JSON matching the schema."
    ].join(" "),
    input: JSON.stringify({
      categories: categories.map((category) => ({
        name: category.name,
        interests: category.terms
      })),
      articles: items.map((item, index) => ({
        index,
        title: item.title,
        source: item.source,
        url: item.url,
        publishedAt: item.publishedAt ?? null,
        summary: truncate(item.summary, 2200)
      }))
    }),
    text: {
      format: {
        type: "json_schema",
        name: "daily_feed_assessments",
        strict: true,
        schema: {
          type: "object",
          additionalProperties: false,
          properties: {
            assessments: {
              type: "array",
              items: {
                type: "object",
                additionalProperties: false,
                properties: {
                  index: { type: "integer", minimum: 0 },
                  category: { type: "string" },
                  relevance: { type: "number", minimum: 0, maximum: 1 },
                  confidence: { type: "number", minimum: 0, maximum: 1 },
                  summary: { type: "string" },
                  reason: { type: "string" },
                  discovery: { type: "boolean" }
                },
                required: ["index", "category", "relevance", "confidence", "summary", "reason", "discovery"]
              }
            }
          },
          required: ["assessments"]
        }
      }
    }
  });

  const parsed = JSON.parse(response.output_text) as unknown;
  if (!isRecord(parsed) || !Array.isArray(parsed.assessments)) {
    throw new Error(`OpenAI response did not include assessments array for batch starting at ${offset}.`);
  }

  return parsed.assessments.map((assessment, index) => normalizeAssessment(assessment, index, categories));
}

function normalizeAssessment(assessment: unknown, fallbackIndex: number, categories: InterestCategory[]): AiAssessment {
  if (!isRecord(assessment)) {
    return fallbackAssessment(fallbackIndex);
  }

  const category = stringValue(assessment.category);
  const knownCategory = categories.some((item) => item.name === category);
  const discovery = booleanValue(assessment.discovery) || !knownCategory;

  return {
    index: integerValue(assessment.index, fallbackIndex),
    category: discovery ? "Discovery" : category,
    relevance: clampNumber(assessment.relevance, 0, 1),
    confidence: clampNumber(assessment.confidence, 0, 1),
    summary: truncate(stringValue(assessment.summary), 700),
    reason: truncate(stringValue(assessment.reason), 180),
    discovery
  };
}

function fallbackAssessment(index: number): AiAssessment {
  return {
    index,
    category: "Discovery",
    relevance: 0.25,
    confidence: 0,
    summary: "AI判定の解析に失敗したため、確認候補として残しています。",
    reason: "AI response parse fallback",
    discovery: true
  };
}

function mergeAssessments(items: FeedItemBase[], assessments: AiAssessment[]): FeedItem[] {
  const byIndex = new Map(assessments.map((assessment) => [assessment.index, assessment]));

  return items.map((item, index) => {
    const assessment = byIndex.get(index) ?? fallbackAssessment(index);
    return {
      ...item,
      category: assessment.category,
      score: Math.round(assessment.relevance * 100),
      relevance: assessment.relevance,
      confidence: assessment.confidence,
      aiSummary: assessment.summary || truncate(item.summary, 180),
      reason: assessment.reason,
      discovery: assessment.discovery
    };
  });
}

function selectBalancedItems(
  items: FeedItem[],
  categories: InterestCategory[],
  maxItems: number,
  categoryMaxItems: number | undefined
): CategorizedItems[] {
  const configuredCategoryNames = new Set(categories.map((category) => category.name));
  const discoveryCategory = { name: "Discovery", terms: ["novel", "useful", "unexpected"] };
  const limitPerCategory = categoryMaxItems ?? Math.ceil(
    Math.max(maxItems - DISCOVERY_MAX_ITEMS - LOW_CONFIDENCE_MAX_ITEMS - SOURCE_COVERAGE_MAX_ITEMS, categories.length) /
      Math.max(categories.length, 1)
  );
  const candidatesByCategory = categories.map((category) => ({
    category,
    candidates: items
      .filter((item) => item.category === category.name && item.relevance >= MIN_RELEVANCE)
      .sort(compareFeedItems)
  }));
  const selectedByCategory = new Map<string, FeedItem[]>();
  const selectedUrls = new Set<string>();
  let selectedCount = 0;
  let cursor = 0;
  const standardItemLimit = Math.max(maxItems - DISCOVERY_MAX_ITEMS - LOW_CONFIDENCE_MAX_ITEMS - SOURCE_COVERAGE_MAX_ITEMS, 0);

  while (selectedCount < standardItemLimit) {
    let addedInRound = false;

    for (const bucket of candidatesByCategory) {
      if (selectedCount >= standardItemLimit) break;

      const selected = selectedByCategory.get(bucket.category.name) ?? [];
      if (selected.length >= limitPerCategory) continue;

      const next = nextUnusedCandidate(bucket.candidates, selectedUrls, cursor);
      if (!next) continue;

      selected.push(next);
      selectedByCategory.set(bucket.category.name, selected);
      selectedUrls.add(next.url);
      selectedCount += 1;
      addedInRound = true;
    }

    if (!addedInRound) break;
    cursor += 1;
  }

  const discoveryItems = items
    .filter((item) => {
      const unknownCategory = !configuredCategoryNames.has(item.category);
      return !selectedUrls.has(item.url) && (item.discovery || unknownCategory || item.category === "Discovery");
    })
    .filter((item) => item.relevance >= MIN_RELEVANCE)
    .sort(compareFeedItems)
    .slice(0, Math.min(DISCOVERY_MAX_ITEMS, maxItems - selectedCount));

  for (const item of discoveryItems) {
    selectedUrls.add(item.url);
  }
  selectedCount += discoveryItems.length;

  const lowConfidenceItems = items
    .filter((item) => !selectedUrls.has(item.url) && item.confidence < LOW_CONFIDENCE_THRESHOLD)
    .filter((item) => item.relevance >= MIN_RELEVANCE)
    .sort(compareFeedItems)
    .slice(0, Math.min(LOW_CONFIDENCE_MAX_ITEMS, maxItems - selectedCount));

  for (const item of lowConfidenceItems) {
    selectedUrls.add(item.url);
  }
  selectedCount += lowConfidenceItems.length;

  const sourceCoverageItems = selectSourceCoverageItems(items, selectedUrls, maxItems - selectedCount);
  for (const item of sourceCoverageItems) {
    selectedUrls.add(item.url);
  }
  selectedCount += sourceCoverageItems.length;

  addSupplementalItemsToBuckets(lowConfidenceItems, configuredCategoryNames, selectedByCategory, discoveryItems);
  addSupplementalItemsToBuckets(sourceCoverageItems, configuredCategoryNames, selectedByCategory, discoveryItems);

  if (selectedCount < maxItems) {
    fillRemainingSlots(items, categories, selectedByCategory, selectedUrls, maxItems - selectedCount);
  }

  const result = categories.map((category) => ({
    category,
    items: selectedByCategory.get(category.name) ?? []
  }));

  result.push({ category: discoveryCategory, items: discoveryItems });
  return result;
}

function addSupplementalItemsToBuckets(
  items: FeedItem[],
  configuredCategoryNames: Set<string>,
  selectedByCategory: Map<string, FeedItem[]>,
  discoveryItems: FeedItem[]
): void {
  for (const item of items) {
    if (configuredCategoryNames.has(item.category)) {
      const selected = selectedByCategory.get(item.category) ?? [];
      selected.push(item);
      selectedByCategory.set(item.category, selected);
    } else {
      discoveryItems.push(item);
    }
  }
}

function selectSourceCoverageItems(items: FeedItem[], selectedUrls: Set<string>, remainingSlots: number): FeedItem[] {
  if (remainingSlots <= 0 || SOURCE_COVERAGE_MAX_ITEMS <= 0) return [];

  const selectedSources = new Set(items.filter((item) => selectedUrls.has(item.url)).map((item) => item.source));
  const allSources = [...new Set(items.map((item) => item.source))];
  const uncoveredSources = allSources.filter((source) => !selectedSources.has(source));
  const selected: FeedItem[] = [];

  for (const source of uncoveredSources) {
    if (selected.length >= SOURCE_COVERAGE_MAX_ITEMS || selected.length >= remainingSlots) break;
    const bestItem = items
      .filter((item) => item.source === source && !selectedUrls.has(item.url))
      .filter((item) => item.relevance >= MIN_RELEVANCE)
      .sort(compareFeedItems)[0];

    if (bestItem) {
      selected.push(bestItem);
    }
  }

  return selected;
}

function fillRemainingSlots(
  items: FeedItem[],
  categories: InterestCategory[],
  selectedByCategory: Map<string, FeedItem[]>,
  selectedUrls: Set<string>,
  remainingSlots: number
): void {
  const categoryNames = new Set(categories.map((category) => category.name));
  const fallbackItems = items
    .filter((item) => !selectedUrls.has(item.url) && categoryNames.has(item.category))
    .filter((item) => item.relevance >= MIN_RELEVANCE)
    .sort(compareFeedItems)
    .slice(0, remainingSlots);

  for (const item of fallbackItems) {
    const selected = selectedByCategory.get(item.category) ?? [];
    selected.push(item);
    selectedByCategory.set(item.category, selected);
    selectedUrls.add(item.url);
  }
}

function nextUnusedCandidate(candidates: FeedItem[], selectedUrls: Set<string>, startIndex: number): FeedItem | undefined {
  for (let index = startIndex; index < candidates.length; index += 1) {
    const candidate = candidates[index];
    if (candidate && !selectedUrls.has(candidate.url)) return candidate;
  }
  return undefined;
}

function compareFeedItems(a: FeedItem, b: FeedItem): number {
  if (b.score !== a.score) return b.score - a.score;
  return timestamp(b.publishedAt) - timestamp(a.publishedAt);
}

function renderMarkdown(today: string, categorizedItems: CategorizedItems[], _feeds: FeedSource[]): string {
  const selectedCount = categorizedItems.reduce((total, category) => total + category.items.length, 0);
  const lines = [
    `# ${today}`,
    "",
    "## 記事"
  ];

  if (selectedCount === 0) {
    lines.push("", "関連度がしきい値以上の記事はありませんでした。");
    return lines.join("\n");
  }

  for (const { category, items } of categorizedItems) {
    lines.push(
      "",
      `<details${items.length > 0 ? " open" : ""}>`,
      `<summary>${escapeHtml(category.name)} (${items.length})</summary>`,
      ""
    );

    if (items.length === 0) {
      lines.push("該当記事はありません。", "", "</details>");
      continue;
    }

    for (const [index, item] of items.entries()) {
      lines.push(...renderItemMarkdown(item, index));
    }

    lines.push("", "</details>");
  }

  return lines.join("\n");
}

function renderItemMarkdown(item: FeedItem, index: number): string[] {
  const lines = [
    `### ${index + 1}. [${escapeMarkdown(item.title)}](${item.url})`,
    "",
    item.publishedAt ? `公開日: ${item.publishedAt}` : "公開日: 不明"
  ];

  if (item.aiSummary) {
    lines.push("", item.aiSummary);
  }

  lines.push("");
  return lines;
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

function isFeedItemBase(item: Partial<FeedItemBase>): item is FeedItemBase {
  return Boolean(item.title && item.url);
}

function dedupeByUrl(items: FeedItemBase[]): FeedItemBase[] {
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
  if (typeof value === "boolean") return String(value);
  if (isRecord(value) && typeof value["#text"] === "string") return value["#text"].trim();
  return "";
}

function booleanValue(value: unknown): boolean {
  if (typeof value === "boolean") return value;
  if (typeof value === "string") return value.toLowerCase() === "true";
  return false;
}

function integerValue(value: unknown, defaultValue: number): number {
  if (typeof value === "number" && Number.isInteger(value)) return value;
  if (typeof value === "string") {
    const parsed = Number(value);
    if (Number.isInteger(parsed)) return parsed;
  }
  return defaultValue;
}

function clampNumber(value: unknown, min: number, max: number): number {
  const numberValue = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(numberValue)) return min;
  return Math.min(Math.max(numberValue, min), max);
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

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
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
