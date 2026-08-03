/** Reads the active CSS theme tokens for use on the canvas. */

export interface Theme {
  text: string;
  dim: string;
  accent: string;
  panel: string;
  grid: string;
  gridStrong: string;
  bg: string;
}

export function readTheme(): Theme {
  const s = getComputedStyle(document.documentElement);
  const v = (n: string, f: string) => s.getPropertyValue(n).trim() || f;
  return {
    text: v("--text", "#e6edf7"),
    dim: v("--text-dim", "#9fb0c9"),
    accent: v("--accent", "#22d3ee"),
    panel: v("--bg-elevated", "#1b2942"),
    grid: v("--grid-line", "rgba(255,255,255,0.05)"),
    gridStrong: v("--grid-line-strong", "rgba(255,255,255,0.09)"),
    bg: v("--bg", "#0b1220"),
  };
}

export function getTheme(): "dark" | "light" {
  return document.documentElement.getAttribute("data-theme") === "light"
    ? "light"
    : "dark";
}

export function setTheme(t: "dark" | "light"): void {
  document.documentElement.setAttribute("data-theme", t);
  localStorage.setItem("epro8.theme", t);
}

export function initTheme(): void {
  const saved = localStorage.getItem("epro8.theme");
  if (saved === "light" || saved === "dark") setTheme(saved);
}
