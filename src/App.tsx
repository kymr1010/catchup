import { Show, createEffect, createMemo, createSignal } from "solid-js";
import { css } from "../styled-system/css";
import Deck from "./Deck";
import Manager from "./Manager";
import { ApiSource, loadSources, saveSources } from "./store";
import { getUrlId, setUrlId } from "./url";

// レイアウトの外枠(このファイル専用なのでここに定義)
const shell = css({
  maxWidth: "560px",
  marginX: "auto",
  padding: "20px 16px 56px",
  display: "flex",
  flexDirection: "column",
  gap: "18px",
});

export default function App() {
  const [sources, setSourcesSignal] = createSignal<ApiSource[]>(loadSources());
  const [currentId, setCurrentId] = createSignal<string | null>(getUrlId());

  const updateSources = (next: ApiSource[]) => {
    setSourcesSignal(next);
    saveSources(next);
  };

  const current = createMemo<ApiSource | null>(
    () => sources().find((s) => s.id === currentId()) ?? null,
  );

  // ?id= が指定されているのに該当 API が無い場合はパラメータを外す
  createEffect(() => {
    if (currentId() && !current()) {
      setCurrentId(null);
      setUrlId(null);
    }
  });

  const open = (id: string) => {
    setCurrentId(id);
    setUrlId(id);
  };
  const back = () => {
    setCurrentId(null);
    setUrlId(null);
  };

  return (
    <main class={shell}>
      <Show
        when={current()}
        fallback={
          <Manager sources={sources()} onUpdate={updateSources} onOpen={open} />
        }
      >
        {(src) => (
          <Deck
            source={src()}
            onBack={back}
            onChangeOrder={(order) =>
              updateSources(
                sources().map((s) => (s.id === src().id ? { ...s, order } : s)),
              )
            }
          />
        )}
      </Show>
    </main>
  );
}
