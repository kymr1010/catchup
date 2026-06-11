import { defineConfig } from "vite";
import solid from "vite-plugin-solid";

export default defineConfig({
  // GitHub Pages のプロジェクトページ (https://<user>.github.io/<repo>/) でも
  // 動くように相対パスでビルドする
  base: "./",
  plugins: [solid()],
  build: {
    target: "es2020",
    cssMinify: true,
    // モジュールプリロードのポリフィルを除去して数 KB 削減
    modulePreload: { polyfill: false },
    rollupOptions: {
      output: {
        // チャンク分割せず 1 ファイルにまとめる(小規模アプリのため)
        manualChunks: undefined,
      },
    },
  },
  esbuild: {
    // 本番バンドルから console / debugger / ライセンスコメントを除去
    drop: ["console", "debugger"],
    legalComments: "none",
  },
});
