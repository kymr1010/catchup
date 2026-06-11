import { For, Show, createSignal, onCleanup } from "solid-js";
import { css, cva } from "../styled-system/css";
import { ApiSource, ORDER_LABELS, Order } from "./store";
import * as ui from "./ui";
import { appUrlFor } from "./url";

// ── このコンポーネント専用のスタイル(同一ファイル内に定義)──────

const panel = css({
  background: "card",
  borderRadius: "14px",
  boxShadow: "0 1px 2px rgba(31,41,51,0.08)",
  padding: "5",
  display: "flex",
  flexDirection: "column",
  gap: "3.5",
});

const panelTitle = css({
  margin: "0",
  fontSize: "15px",
  fontWeight: "bold",
  paddingBottom: "2.5",
  borderBottom: "2px solid token(colors.line)",
});

const sourceList = css({
  listStyle: "none",
  margin: "0",
  padding: "0",
  display: "flex",
  flexDirection: "column",
});

const sourceItem = css({
  display: "flex",
  flexDirection: "column",
  gap: "2",
  padding: "14px 0",
  borderBottom: "1px solid token(colors.line)",
  _last: { borderBottom: "none" },
});

const sourceName = css({ margin: "0", fontSize: "15px", fontWeight: "bold" });

const sourceUrl = css({
  margin: "0",
  fontSize: "12px",
  color: "sub",
  overflowWrap: "anywhere",
});

const sourceMeta = css({
  display: "flex",
  alignItems: "center",
  gap: "2",
  flexWrap: "wrap",
});

const smallButton = cva({
  base: {
    padding: "7px 12px",
    fontSize: "13px",
    fontWeight: "semibold",
    fontFamily: "inherit",
    borderRadius: "8px",
    borderWidth: "1px",
    borderStyle: "solid",
    borderColor: "edge",
    background: "white",
    color: "ink",
    cursor: "pointer",
    _hover: { background: "rgba(0,0,0,0.05)" },
    _focusVisible: {
      outline: "2px solid token(colors.shu)",
      outlineOffset: "2px",
    },
  },
  variants: {
    kind: {
      default: {},
      primary: {
        background: "ink",
        color: "white",
        borderColor: "ink",
        _hover: { background: "#39414C" },
      },
      danger: {
        color: "shu",
        borderColor: "shuSoft",
        _hover: { background: "shuSoft" },
      },
    },
  },
  defaultVariants: { kind: "default" },
});

const field = css({
  display: "flex",
  flexDirection: "column",
  gap: "5px",
  fontSize: "12px",
  fontWeight: "semibold",
  color: "sub",
});

const input = css({
  padding: "9px 11px",
  fontSize: "14px",
  fontFamily: "inherit",
  color: "ink",
  borderWidth: "1px",
  borderStyle: "solid",
  borderColor: "edge",
  borderRadius: "8px",
  background: "white",
  _focusVisible: {
    outline: "2px solid token(colors.shu)",
    outlineOffset: "1px",
  },
});

const formGrid = css({ display: "flex", flexDirection: "column", gap: "2.5" });

const errorText = css({ margin: "0", fontSize: "13px", color: "shu" });

// ── コンポーネント ──────────────────────────────

export default function Manager(props: {
  sources: ApiSource[];
  onUpdate: (next: ApiSource[]) => void;
  onOpen: (id: string) => void;
}) {
  const [name, setName] = createSignal("");
  const [url, setUrl] = createSignal("");
  const [apiId, setApiId] = createSignal("");
  const [order, setOrder] = createSignal<Order>("random");
  const [formError, setFormError] = createSignal("");
  const [toastMsg, setToastMsg] = createSignal("");

  let toastTimer: ReturnType<typeof setTimeout> | undefined;
  const showToast = (msg: string) => {
    setToastMsg(msg);
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => setToastMsg(""), 2500);
  };
  onCleanup(() => clearTimeout(toastTimer));

  const add = () => {
    setFormError("");
    const n = name().trim();
    const u = url().trim();
    const id = apiId().trim() || `api-${Date.now().toString(36)}`;
    if (!n || !u) {
      setFormError("API 名と URL を入力してください");
      return;
    }
    if (props.sources.some((s) => s.id === id)) {
      setFormError(`API_id "${id}" は既に使われています`);
      return;
    }
    props.onUpdate([...props.sources, { id, name: n, url: u, order: order() }]);
    setName("");
    setUrl("");
    setApiId("");
    setOrder("random");
  };

  const remove = (id: string) => {
    props.onUpdate(props.sources.filter((s) => s.id !== id));
  };

  const changeOrder = (id: string, order: Order) => {
    props.onUpdate(
      props.sources.map((s) => (s.id === id ? { ...s, order } : s)),
    );
  };

  const copyLink = async (id: string) => {
    try {
      await navigator.clipboard.writeText(appUrlFor(id));
      showToast("リンクをコピーしました");
    } catch {
      showToast(appUrlFor(id));
    }
  };

  return (
    <>
      <header class={ui.topBar}>
        <h1 class={ui.appTitle}>単語カード</h1>
      </header>

      <section class={panel}>
        <h2 class={panelTitle}>取得先 API</h2>
        <Show
          when={props.sources.length > 0}
          fallback={
            <p class={sourceUrl}>
              まだ登録がありません。下のフォームから取得先 API
              を追加してください。
            </p>
          }
        >
          <ul class={sourceList}>
            <For each={props.sources}>
              {(s) => (
                <li class={sourceItem}>
                  <p class={sourceName}>{s.name}</p>
                  <p class={sourceUrl}>
                    id: {s.id}　/　{s.url}
                  </p>
                  <div class={sourceMeta}>
                    <select
                      class={ui.select}
                      aria-label={`${s.name} の表示順`}
                      value={s.order}
                      onChange={(e) =>
                        changeOrder(s.id, e.currentTarget.value as Order)
                      }
                    >
                      <For each={Object.entries(ORDER_LABELS)}>
                        {([value, label]) => (
                          <option value={value}>{label}</option>
                        )}
                      </For>
                    </select>
                    <button
                      class={smallButton({ kind: "primary" })}
                      onClick={() => props.onOpen(s.id)}
                    >
                      開く
                    </button>
                    <button
                      class={smallButton()}
                      onClick={() => copyLink(s.id)}
                    >
                      リンクをコピー
                    </button>
                    <button
                      class={smallButton({ kind: "danger" })}
                      onClick={() => remove(s.id)}
                    >
                      削除
                    </button>
                  </div>
                </li>
              )}
            </For>
          </ul>
        </Show>
      </section>

      <section class={panel}>
        <h2 class={panelTitle}>API を追加</h2>
        <div class={formGrid}>
          <label class={field}>
            API 名
            <input
              class={input}
              value={name()}
              onInput={(e) => setName(e.currentTarget.value)}
              placeholder="英単語帳"
            />
          </label>
          <label class={field}>
            URL
            <input
              class={input}
              value={url()}
              onInput={(e) => setUrl(e.currentTarget.value)}
              placeholder="https://example.com/api/words"
              inputmode="url"
            />
          </label>
          <label class={field}>
            API_id(URL パラメータ用・省略時は自動生成)
            <input
              class={input}
              value={apiId()}
              onInput={(e) => setApiId(e.currentTarget.value)}
              placeholder="english-words"
            />
          </label>
          <label class={field}>
            表示順
            <select
              class={ui.select}
              value={order()}
              onChange={(e) => setOrder(e.currentTarget.value as Order)}
            >
              <For each={Object.entries(ORDER_LABELS)}>
                {([value, label]) => <option value={value}>{label}</option>}
              </For>
            </select>
          </label>
          <Show when={formError()}>
            <p class={errorText}>{formError()}</p>
          </Show>
          <div class={ui.buttonRow}>
            <button class={ui.button({ kind: "primary" })} onClick={add}>
              追加
            </button>
          </div>
        </div>
      </section>

      <Show when={toastMsg()}>
        <div class={ui.toast} role="status">
          {toastMsg()}
        </div>
      </Show>
    </>
  );
}
