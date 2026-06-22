import {
  For,
  Show,
  createEffect,
  createMemo,
  createSignal,
  onCleanup,
  onMount,
} from "solid-js";
import { css } from "../styled-system/css";
import { Item, parseItems } from "./loader";
import { renderMarkdown } from "./markdown";
import { ApiSource, ORDER_LABELS, Order } from "./store";
import * as ui from "./ui";

// ── このコンポーネント専用のスタイル(同一ファイル内に定義)──────

// 単語カード本体。左上に綴じ穴(リング穴)をあしらう
const card = css({
  position: "relative",
  background: "card",
  borderRadius: "14px",
  boxShadow:
    "0 1px 2px rgba(31,41,51,0.10), 0 14px 30px -18px rgba(31,41,51,0.40)",
  padding: "52px 26px 26px",
  minHeight: "340px",
  // 画面幅を超えないようにする(狭い端末でのはみ出し防止)
  maxWidth: "100%",
  minWidth: "0",
  display: "flex",
  flexDirection: "column",
  _before: {
    content: '""',
    position: "absolute",
    top: "15px",
    left: "17px",
    width: "15px",
    height: "15px",
    borderRadius: "50%",
    background: "desk",
    boxShadow:
      "inset 0 1px 2px rgba(0,0,0,0.28), 0 1px 0 rgba(255,255,255,0.9)",
  },
});

const counter = css({
  position: "absolute",
  top: "4",
  right: "5",
  fontSize: "12px",
  color: "sub",
  fontVariantNumeric: "tabular-nums",
  letterSpacing: "0.05em",
});

// 表面: 単語のみを中央に
const front = css({
  flex: "1",
  minWidth: "0",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  margin: "0",
  padding: "8px 0 24px",
  fontSize: "30px",
  fontWeight: "bold",
  lineHeight: "1.4",
  textAlign: "center",
  overflowWrap: "anywhere",
});

// めくった後: 上部に単語、薄青の罫線、その下に赤ペンの答え
const word = css({
  margin: "0",
  minWidth: "0",
  paddingBottom: "14px",
  fontSize: "21px",
  fontWeight: "bold",
  lineHeight: "1.4",
  borderBottom: "2px solid token(colors.line)",
  overflowWrap: "anywhere",
});

// めくった後の答え(赤ペン)。中身は GFM マークダウンを HTML 化して描画する
const answer = css({
  flex: "1",
  minWidth: "0", // flex 子の min-width:auto による横はみ出しを防ぐ
  paddingTop: "4",
  fontSize: "17px",
  lineHeight: "1.9",
  color: "shu", // 答えは赤ペンで
  overflowWrap: "anywhere",
  // ── マークダウン HTML のスタイル ──
  "& > :first-child": { marginTop: "0" },
  "& > :last-child": { marginBottom: "0" },
  "& p": { margin: "0 0 0.6em" },
  "& ul, & ol": { margin: "0 0 0.6em", paddingLeft: "1.4em" },
  "& li": { marginBottom: "0.2em" },
  "& li > input[type=checkbox]": { marginRight: "0.4em" },
  "& h1, & h2, & h3, & h4, & h5, & h6": {
    margin: "0.4em 0 0.3em",
    lineHeight: "1.3",
    fontWeight: "bold",
  },
  "& code": {
    fontFamily: "monospace",
    fontSize: "0.88em",
    background: "rgba(0,0,0,0.06)",
    padding: "0.1em 0.35em",
    borderRadius: "4px",
  },
  "& pre": {
    background: "rgba(0,0,0,0.06)",
    padding: "10px 12px",
    borderRadius: "8px",
    overflowX: "auto",
    margin: "0 0 0.6em",
  },
  "& pre code": { background: "none", padding: "0", fontSize: "0.85em" },
  "& a": { color: "shu", textDecoration: "underline" },
  "& blockquote": {
    margin: "0 0 0.6em",
    paddingLeft: "0.8em",
    borderLeft: "3px solid token(colors.line)",
    color: "sub",
  },
  "& table": {
    // 列が多い表は折り返さず横スクロールさせ、カード幅を超えさせない
    display: "block",
    overflowX: "auto",
    maxWidth: "100%",
    borderCollapse: "collapse",
    margin: "0 0 0.6em",
    fontSize: "0.9em",
  },
  "& th, & td": {
    border: "1px solid token(colors.line)",
    padding: "4px 8px",
    textAlign: "left",
  },
  "& hr": {
    border: "none",
    borderTop: "1px solid token(colors.line)",
    margin: "0.6em 0",
  },
  "& img": { maxWidth: "100%" },
  "& del": { color: "sub" },
});

const centerNote = css({
  flex: "1",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  margin: "0",
  color: "sub",
  fontSize: "15px",
  textAlign: "center",
  lineHeight: "1.8",
});

const resultBox = css({
  flex: "1",
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  justifyContent: "center",
  gap: "2.5",
  textAlign: "center",
});

const resultScore = css({
  margin: "0",
  fontSize: "34px",
  fontWeight: "bold",
  color: "shu",
  fontVariantNumeric: "tabular-nums",
});

const resultUnit = css({ fontSize: "16px" });

const hint = css({
  margin: "0",
  fontSize: "12px",
  color: "sub",
  textAlign: "center",
});

const textButton = css({
  border: "none",
  background: "none",
  color: "sub",
  fontSize: "13px",
  fontFamily: "inherit",
  cursor: "pointer",
  padding: "5px 8px",
  borderRadius: "6px",
  _hover: { color: "ink", background: "rgba(0,0,0,0.06)" },
  _focusVisible: {
    outline: "2px solid token(colors.shu)",
    outlineOffset: "2px",
  },
});

const topActions = css({
  display: "flex",
  alignItems: "center",
  gap: "2",
  flexShrink: "0",
});

// ── ロジック ────────────────────────────────────

function sortItems(data: Item[], order: Order): Item[] {
  const a = [...data];
  if (order === "id_asc") {
    return a.sort((x, y) => x.id - y.id);
  }
  if (order === "date_desc") {
    // date がある場合は date、無ければ id を代わりに使う
    const key = (i: Item) => {
      if (i.date) {
        const t = Date.parse(i.date);
        if (!Number.isNaN(t)) return t;
      }
      return i.id;
    };
    return a.sort((x, y) => key(y) - key(x));
  }
  // random(デフォルト): Fisher–Yates シャッフル
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export default function Deck(props: {
  source: ApiSource;
  onChangeOrder: (order: Order) => void;
  onBack: () => void;
}) {
  const [items, setItems] = createSignal<Item[] | null>(null);
  const [loadError, setLoadError] = createSignal("");
  const [idx, setIdx] = createSignal(0);
  const [revealed, setRevealed] = createSignal(false);
  const [ok, setOk] = createSignal(false);
  const [okCount, setOkCount] = createSignal(0);
  const [toastMsg, setToastMsg] = createSignal("");

  let toastTimer: ReturnType<typeof setTimeout> | undefined;
  const showToast = (msg: string) => {
    setToastMsg(msg);
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => setToastMsg(""), 3500);
  };
  onCleanup(() => clearTimeout(toastTimer));

  const load = async (src: ApiSource) => {
    setItems(null);
    setLoadError("");
    setIdx(0);
    setRevealed(false);
    setOk(false);
    setOkCount(0);
    try {
      const res = await fetch(src.url);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const text = await res.text();
      // JSON / CSV を自動判定して Item 配列へ正規化する
      const data = parseItems(text, res.headers.get("content-type"), src.url);
      setItems(sortItems(data, src.order));
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : String(e));
    }
  };

  // 取得先 API または表示順が変わったら再読込
  createEffect(() => {
    load(props.source);
  });

  const total = () => items()?.length ?? 0;
  const item = createMemo<Item | null>(() => {
    const list = items();
    return list && idx() < list.length ? list[idx()] : null;
  });
  const finished = () => items() !== null && idx() >= total();

  const reveal = () => setRevealed(true);
  const toggleOk = () => setOk((v) => !v);

  const skip = () => {
    const it = item();
    if (!it) return;
    // [Reveal] 後にのみ結果を POST する
    if (revealed()) {
      const isOk = ok();
      if (isOk) setOkCount((n) => n + 1);
      fetch(props.source.url, {
        method: "POST",
        // application/json は CORS プリフライト(OPTIONS)を誘発し、GAS は
        // これを処理できず弾かれる。text/plain なら「単純リクエスト」となり
        // プリフライトが発生しない。ボディは JSON 文字列のままで、GAS 側は
        // e.postData.contents で受け取って JSON.parse できる。
        headers: { "Content-Type": "text/plain;charset=utf-8" },
        body: JSON.stringify({
          id: it.id,
          is_OK: isOk,
          date: new Date().toISOString(),
        }),
      })
        .then((res) => {
          if (!res.ok)
            showToast(`結果の送信に失敗しました (HTTP ${res.status})`);
        })
        .catch(() => showToast("結果の送信に失敗しました"));
    }
    setRevealed(false);
    setOk(false);
    setIdx((n) => n + 1);
  };

  // キーボード操作: Space = Reveal / OK 切替, Enter = Next
  onMount(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && /^(INPUT|SELECT|TEXTAREA|BUTTON)$/.test(t.tagName)) return;
      if (!item()) return;
      if (e.key === " ") {
        e.preventDefault();
        revealed() ? toggleOk() : reveal();
      } else if (e.key === "Enter") {
        e.preventDefault();
        skip();
      }
    };
    window.addEventListener("keydown", onKey);
    onCleanup(() => window.removeEventListener("keydown", onKey));
  });

  return (
    <>
      <header class={ui.topBar}>
        <h1 class={ui.appTitle}>{props.source.name}</h1>
        <div class={topActions}>
          <select
            class={ui.select}
            aria-label="表示順"
            value={props.source.order}
            onChange={(e) => props.onChangeOrder(e.currentTarget.value as Order)}
          >
            <For each={Object.entries(ORDER_LABELS)}>
              {([value, label]) => <option value={value}>{label}</option>}
            </For>
          </select>
          <button class={textButton} onClick={props.onBack}>
            API 一覧
          </button>
        </div>
      </header>

      <section class={card}>
        <Show when={!finished() && !loadError() && items()}>
          <span class={counter}>
            {Math.min(idx() + 1, total())} / {total()}
          </span>
        </Show>

        <Show
          when={!loadError()}
          fallback={
            <p class={centerNote}>
              データの取得に失敗しました
              <br />({loadError()})
            </p>
          }
        >
          <Show
            when={items()}
            fallback={<p class={centerNote}>読み込み中…</p>}
          >
            <Show
              when={total() > 0}
              fallback={<p class={centerNote}>データが 0 件でした</p>}
            >
              <Show
                when={!finished()}
                fallback={
                  <div class={resultBox}>
                    <p style={{ margin: "0" }}>おつかれさまでした</p>
                    <p class={resultScore}>
                      {okCount()} <span class={resultUnit}>OK</span> / {total()}
                    </p>
                  </div>
                }
              >
                <Show
                  when={revealed()}
                  fallback={<p class={front}>{item()!.title}</p>}
                >
                  <h2 class={word}>{item()!.title}</h2>
                  <div class={answer} innerHTML={renderMarkdown(item()!.contents)} />
                </Show>
              </Show>
            </Show>
          </Show>
        </Show>
      </section>

      <Show when={loadError()}>
        <div class={ui.buttonRow}>
          <button
            class={ui.button({ kind: "ghost" })}
            onClick={() => load(props.source)}
          >
            再読み込み
          </button>
        </div>
      </Show>

      <Show when={!loadError() && items() && total() > 0}>
        <Show
          when={!finished()}
          fallback={
            <div class={ui.buttonRow}>
              <button
                class={ui.button({ kind: "primary" })}
                onClick={() => load(props.source)}
              >
                もう一度
              </button>
              <button class={ui.button({ kind: "ghost" })} onClick={props.onBack}>
                API 一覧へ
              </button>
            </div>
          }
        >
          <Show
            when={revealed()}
            fallback={
              <div class={ui.buttonRow}>
                <button class={ui.button({ kind: "primary" })} onClick={reveal}>
                  Reveal
                </button>
                <button class={ui.button({ kind: "ghost" })} onClick={skip}>
                  Next
                </button>
              </div>
            }
          >
            <div class={ui.buttonRow}>
              <button
                class={ui.button({ kind: "ok", active: ok() })}
                aria-pressed={ok()}
                onClick={toggleOk}
              >
                {ok() ? "◯ OK" : "OK"}
              </button>
              <button class={ui.button({ kind: "ghost" })} onClick={skip}>
                Next
              </button>
            </div>
          </Show>
          <p class={hint}>Space: Reveal / OK 切替　Enter: Next</p>
        </Show>
      </Show>

      <Show when={toastMsg()}>
        <div class={ui.toast} role="status">
          {toastMsg()}
        </div>
      </Show>
    </>
  );
}
