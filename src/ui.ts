// 複数コンポーネントで使う共通スタイル。
// 各コンポーネント固有のスタイルはそれぞれのファイル内に直接書き、
// 2 箇所以上で使うものだけをここに置く方針。
import { css, cva } from "../styled-system/css";

// ── 画面上部バー ────────────────────────────────
export const topBar = css({
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: "3",
  minHeight: "8",
});

export const appTitle = css({
  fontSize: "14px",
  fontWeight: "semibold",
  letterSpacing: "0.14em",
  margin: "0",
  color: "sub",
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
});

// ── ボタン ──────────────────────────────────────
export const buttonRow = css({ display: "flex", gap: "3" });

export const button = cva({
  base: {
    flex: "1",
    padding: "14px 16px",
    fontSize: "15px",
    fontWeight: "semibold",
    fontFamily: "inherit",
    borderRadius: "10px",
    borderWidth: "1px",
    borderStyle: "solid",
    borderColor: "transparent",
    cursor: "pointer",
    transition: "background 0.15s, color 0.15s, border-color 0.15s",
    _motionReduce: { transition: "none" },
    _focusVisible: {
      outline: "2px solid token(colors.shu)",
      outlineOffset: "2px",
    },
    _disabled: { opacity: 0.45, cursor: "default" },
  },
  variants: {
    kind: {
      primary: {
        background: "ink",
        color: "white",
        _hover: { background: "#39414C" },
      },
      ghost: {
        background: "transparent",
        color: "ink",
        borderColor: "edge",
        _hover: { background: "rgba(0,0,0,0.05)" },
      },
      ok: {
        background: "white",
        color: "shu",
        borderColor: "shu",
        _hover: { background: "shuSoft" },
      },
    },
    active: {
      true: {},
    },
  },
  compoundVariants: [
    {
      kind: "ok",
      active: true,
      css: {
        background: "shu",
        color: "white",
        _hover: { background: "#A93628" },
      },
    },
  ],
});

// ── フォーム部品 ────────────────────────────────
export const select = css({
  padding: "8px 10px",
  fontSize: "13px",
  fontFamily: "inherit",
  color: "ink",
  borderWidth: "1px",
  borderStyle: "solid",
  borderColor: "edge",
  borderRadius: "8px",
  background: "white",
  cursor: "pointer",
  _focusVisible: {
    outline: "2px solid token(colors.shu)",
    outlineOffset: "1px",
  },
});

// ── 一時通知 ────────────────────────────────────
export const toast = css({
  position: "fixed",
  left: "50%",
  bottom: "5",
  transform: "translateX(-50%)",
  background: "ink",
  color: "white",
  fontSize: "13px",
  padding: "10px 16px",
  borderRadius: "10px",
  boxShadow: "0 8px 20px -8px rgba(0,0,0,0.5)",
  maxWidth: "90vw",
});
