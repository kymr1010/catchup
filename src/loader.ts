// 取得データ(JSON / CSV)を Item 配列へ正規化する
// JSON と CSV でカラム名は同一(id / title / contents / date)

export type Item = {
  id: number;
  title: string;
  contents: string;
  date?: string;
  okCount?: number; // 正答数(「暗記」順での重み付けに使用)
};

// 正答数の列名ゆれを吸収する(小文字で比較)
const OK_COUNT_KEYS = [
  "ok_count",
  "okcount",
  "correct_count",
  "correct",
  "count",
];

// 任意の値を 0 以上の整数の正答数に正規化する(不正なら 0)
function toOkCount(raw: unknown): number {
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 0;
}

type Format = "json" | "csv";

// Content-Type ヘッダ → URL 拡張子 → 中身の先頭文字、の順で形式を判定する
function detectFormat(
  text: string,
  contentType?: string | null,
  url?: string,
): Format {
  const ct = (contentType ?? "").toLowerCase();
  if (ct.includes("json")) return "json";
  if (ct.includes("csv")) return "csv";

  const path = (url ?? "").toLowerCase().split(/[?#]/)[0];
  if (path.endsWith(".json")) return "json";
  if (path.endsWith(".csv")) return "csv";

  const head = stripBom(text).trimStart();
  if (head.startsWith("[") || head.startsWith("{")) return "json";
  return "csv";
}

function stripBom(text: string): string {
  return text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
}

// RFC 4180 準拠の CSV パーサ。引用符内のカンマ・改行・"" エスケープに対応
function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  let started = false; // 行頭で何か読み始めたか(空行判定用)

  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    started = true;

    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += c;
      }
      continue;
    }

    if (c === '"') {
      inQuotes = true;
    } else if (c === ",") {
      row.push(field);
      field = "";
    } else if (c === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
      started = false;
    } else if (c === "\r") {
      // CRLF / 単独 CR を行区切りとして扱う
      if (text[i + 1] === "\n") i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
      started = false;
    } else {
      field += c;
    }
  }

  if (started || field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

function csvToItems(text: string): Item[] {
  const rows = parseCsv(stripBom(text));
  if (rows.length === 0) return [];

  const header = rows[0].map((h) => h.trim().toLowerCase());
  const idIdx = header.indexOf("id");
  const titleIdx = header.indexOf("title");
  const contentsIdx = header.indexOf("contents");
  const dateIdx = header.indexOf("date");
  const okCountIdx = header.findIndex((h) => OK_COUNT_KEYS.includes(h));

  if (titleIdx === -1 || contentsIdx === -1) {
    throw new Error("CSV に title / contents 列がありません");
  }

  const items: Item[] = [];
  for (let r = 1; r < rows.length; r++) {
    const cells = rows[r];
    // 全列が空の行はスキップ
    if (cells.every((c) => c.trim() === "")) continue;

    const rawId = idIdx >= 0 ? (cells[idIdx] ?? "").trim() : "";
    const idNum = Number(rawId);
    const item: Item = {
      id: rawId !== "" && Number.isFinite(idNum) ? idNum : r,
      title: cells[titleIdx] ?? "",
      contents: cells[contentsIdx] ?? "",
    };
    const d = dateIdx >= 0 ? (cells[dateIdx] ?? "").trim() : "";
    if (d) item.date = d;
    if (okCountIdx >= 0) item.okCount = toOkCount((cells[okCountIdx] ?? "").trim());
    items.push(item);
  }
  return items;
}

function jsonToItems(text: string): Item[] {
  const data: unknown = JSON.parse(text);
  if (!Array.isArray(data)) throw new Error("配列ではありません");
  return data.map((raw) => {
    const r = (raw ?? {}) as Record<string, unknown>;
    const item = raw as Item;
    // 正答数は列名ゆれを吸収しつつ正規化する(date など他フィールドは元のまま)
    const okKey = Object.keys(r).find((k) => OK_COUNT_KEYS.includes(k.toLowerCase()));
    if (okKey !== undefined) item.okCount = toOkCount(r[okKey]);
    return item;
  });
}

// 取得したテキストを形式に応じて Item 配列へ変換する
export function parseItems(
  text: string,
  contentType?: string | null,
  url?: string,
): Item[] {
  return detectFormat(text, contentType, url) === "csv"
    ? csvToItems(text)
    : jsonToItems(text);
}
