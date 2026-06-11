/* @refresh reload */
import { render } from "solid-js/web";
import "./index.css";
import App from "./App";

render(() => <App />, document.getElementById("root")!);

// PWA: Service Worker を登録(オフライン起動・ホーム画面追加対応)
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    // base が相対パスのため、現在ページ基準で解決される相対 URL で登録する
    navigator.serviceWorker
      .register(`${import.meta.env.BASE_URL}sw.js`)
      .catch(() => {
        /* 登録失敗時もアプリ本体は通常どおり動作する */
      });
  });
}
