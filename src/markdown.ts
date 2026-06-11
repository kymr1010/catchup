// コンテンツ中のマークダウン(GFM 準拠)を安全な HTML へ変換する
import DOMPurify from "dompurify";
import { marked } from "marked";

// GFM 準拠。breaks: 単一改行を <br> に(カードの 1 行ずつの記述に合わせる)
marked.setOptions({ gfm: true, breaks: true });

export function renderMarkdown(src: string): string {
  const html = marked.parse(src ?? "", { async: false }) as string;
  // 取得元 API は任意のため、描画前に必ずサニタイズする(XSS 対策)
  return DOMPurify.sanitize(html);
}
