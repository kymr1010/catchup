// 取得先 API の保存・読込(localStorage)

export type Order = "random" | "id_asc" | "date_desc" | "memorize";

export type ApiSource = {
  id: string; // [API_id] — URL パラメータ ?id= に対応
  name: string; // [API 名]
  url: string; // 取得先 API の URL(GET / POST 共通)
  authorizationToken?: string; // Bearer token(任意)
  order: Order; // [order] 表示順
};

export const ORDER_LABELS: Record<Order, string> = {
  random: "ランダム",
  id_asc: "id 昇順",
  date_desc: "日付降順",
  memorize: "暗記",
};

const KEY = "tango-cards.sources.v1";

export function loadSources(): ApiSource[] {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw);
    if (!Array.isArray(arr)) return [];
    return arr
      .filter((s) => s && typeof s.id === "string" && typeof s.url === "string")
      .map((s) => ({
        id: s.id,
        name: typeof s.name === "string" ? s.name : s.id,
        url: s.url,
        authorizationToken:
          typeof s.authorizationToken === "string"
            ? s.authorizationToken
            : "",
        order: (
          ["random", "id_asc", "date_desc", "memorize"] as const
        ).includes(s.order)
          ? s.order
          : "random",
      }));
  } catch {
    return [];
  }
}

export function saveSources(list: ApiSource[]): void {
  localStorage.setItem(KEY, JSON.stringify(list));
}
