import { defineConfig } from "@pandacss/dev";

export default defineConfig({
  // ブラウザ差異を吸収する標準リセットのみ有効化
  preflight: true,

  // この glob 内の css() / cva() 呼び出しからビルド時に静的 CSS を抽出する
  include: ["./src/**/*.{ts,tsx}"],
  exclude: [],

  outdir: "styled-system",

  theme: {
    extend: {
      tokens: {
        colors: {
          // モチーフ: リング留めの単語カード + 赤ペン(朱色)の答え
          desk: { value: "#DCE3E9" }, // 机のデスクマット
          card: { value: "#FFFFFF" },
          ink: { value: "#20262E" }, // 黒ペン
          sub: { value: "#5C6670" },
          line: { value: "#C9DAE8" }, // カードの薄青罫線
          shu: { value: "#C2402F" }, // 朱色(赤ペン)
          shuSoft: { value: "#F6E3E0" },
          edge: { value: "#B7C1CA" }, // 入力枠などの境界線
        },
        fonts: {
          body: {
            value:
              '"Hiragino Sans", "Hiragino Kaku Gothic ProN", "Noto Sans JP", system-ui, sans-serif',
          },
        },
      },
    },
  },

  // グローバルスタイルは body の地色と書体のみに留める
  globalCss: {
    body: {
      background: "desk",
      color: "ink",
      fontFamily: "body",
      WebkitFontSmoothing: "antialiased",
    },
  },
});
