/** Top toolbar: tools, wire colour, run/pause, undo/redo, save/load/share, theme. */

import { el } from "./dom";
import type { Editor, Tool } from "@/app/editor";
import type { Scene } from "@/render/canvas";
import { getTheme, setTheme } from "@/render/theme";
import { openSaveDialog, openLoadDialog, openShareDialog } from "./dialogs";

const I = {
  select: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 3l7 17 2-7 7-2z"/></svg>`,
  wire: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="5" cy="19" r="2"/><circle cx="19" cy="5" r="2"/><path d="M6.5 17.5C10 14 8 8 17 6"/></svg>`,
  pan: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M5 9l-2 3 2 3M9 5l3-2 3 2M15 19l-3 2-3-2M19 9l2 3-2 3M12 8v8M8 12h8"/></svg>`,
  erase: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 15l7-7 6 6-5 5H8z"/><path d="M14 21h7"/></svg>`,
  run: `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M6 4l14 8-14 8z"/></svg>`,
  pause: `<svg viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="5" width="4" height="14"/><rect x="14" y="5" width="4" height="14"/></svg>`,
  undo: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 7L4 12l5 5"/><path d="M4 12h11a5 5 0 010 10h-1"/></svg>`,
  redo: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M15 7l5 5-5 5"/><path d="M20 12H9a5 5 0 000 10h1"/></svg>`,
  frame: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 8V4h4M17 4h4v4M21 16v4h-4M7 20H3v-4"/></svg>`,
  rotate: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 12a8 8 0 11-2.3-5.7"/><path d="M20 3v4h-4"/></svg>`,
  trash: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h18M8 6V4h8v2M6 6l1 14h10l1-14"/></svg>`,
  save: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M5 3h11l3 3v15H5z"/><path d="M8 3v6h7"/></svg>`,
  open: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 7h6l2 2h10v10H3z"/></svg>`,
  share: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="6" cy="12" r="2"/><circle cx="18" cy="6" r="2"/><circle cx="18" cy="18" r="2"/><path d="M8 11l8-4M8 13l8 4"/></svg>`,
  sun: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M2 12h2M20 12h2M5 5l1.5 1.5M17.5 17.5L19 19M19 5l-1.5 1.5M6.5 17.5L5 19"/></svg>`,
  moon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 12.8A8 8 0 1111 3a6 6 0 0010 9.8z"/></svg>`,
};

function tbtn(html: string, label: string, on: () => void, cls = "btn"): HTMLButtonElement {
  return el("button", { class: cls, onclick: on }, [
    el("span", { html }),
    ...(label ? [document.createTextNode(label)] : []),
  ]) as HTMLButtonElement;
}

export function mountToolbar(root: HTMLElement, editor: Editor, scene: Scene): void {
  const brand = el("div", { class: "brand" }, [
    el("span", {
      html: `<svg viewBox="0 0 24 24"><rect x="2" y="9" width="9" height="7" rx="2" fill="#22d3ee"/><circle cx="18" cy="12" r="4" fill="#fbbf24"/><path d="M11 12h3" stroke="#f59e0b" stroke-width="2"/></svg>`,
    }),
    document.createTextNode("EPro8 "),
    el("small", {}, ["Simulator"]),
  ]);

  // tools
  const toolDefs: { id: Tool; icon: string; label: string }[] = [
    { id: "select", icon: I.select, label: "Select" },
    { id: "wire", icon: I.wire, label: "Wire" },
    { id: "pan", icon: I.pan, label: "Pan" },
    { id: "erase", icon: I.erase, label: "Erase" },
  ];
  const toolBtns = new Map<Tool, HTMLButtonElement>();
  const toolGroup = el("div", { class: "tgroup" });
  for (const t of toolDefs) {
    const b = tbtn(t.icon, "", () => {
      editor.tool = t.id;
      refresh();
    }, "btn ghost icon");
    b.title = t.label;
    toolBtns.set(t.id, b);
    toolGroup.appendChild(b);
  }

  const runBtn = tbtn(I.pause, "", () => {
    editor.sim.running = !editor.sim.running;
    refresh();
  }, "btn");
  runBtn.title = "Run / Pause simulation";

  const rotateBtn = tbtn(I.rotate, "", () => editor.rotateSelection(), "btn ghost icon");
  rotateBtn.title = "Rotate selection a quarter turn (R, or Shift+R to go back)";

  const undoBtn = tbtn(I.undo, "", () => editor.undo(), "btn ghost icon");
  undoBtn.title = "Undo";
  const redoBtn = tbtn(I.redo, "", () => editor.redo(), "btn ghost icon");
  redoBtn.title = "Redo";
  const frameBtn = tbtn(I.frame, "", () => scene.frameAll(), "btn ghost icon");
  frameBtn.title = "Fit to view";
  const clearBtn = tbtn(I.trash, "", () => {
    if (editor.doc.components.length && confirm("Clear the whole workspace?")) editor.clear();
  }, "btn ghost icon");
  clearBtn.title = "Clear all";

  const saveBtn = tbtn(I.save, "Save", () => openSaveDialog(editor));
  const openBtn = tbtn(I.open, "Open", () => openLoadDialog(editor, () => scene.frameAll()));
  const shareBtn = tbtn(I.share, "Share", () => openShareDialog(editor));

  const themeBtn = tbtn(getTheme() === "dark" ? I.sun : I.moon, "", () => {
    setTheme(getTheme() === "dark" ? "light" : "dark");
    scene.refreshTheme();
    refresh();
  }, "btn ghost icon");
  themeBtn.title = "Toggle theme";

  root.append(
    brand,
    toolGroup,
    el("div", { class: "tgroup" }, [rotateBtn]),
    el("div", { class: "tgroup" }, [undoBtn, redoBtn]),
    el("div", { class: "tgroup" }, [runBtn]),
    el("div", { class: "spacer" }),
    frameBtn,
    clearBtn,
    saveBtn,
    openBtn,
    shareBtn,
    themeBtn,
  );

  function refresh(): void {
    for (const [id, b] of toolBtns) b.classList.toggle("active", editor.tool === id);
    rotateBtn.disabled = editor.selection.size === 0;
    runBtn.querySelector("span")!.innerHTML = editor.sim.running ? I.pause : I.run;
    runBtn.classList.toggle("active", !editor.sim.running);
    undoBtn.disabled = !editor.history.canUndo();
    redoBtn.disabled = !editor.history.canRedo();
    themeBtn.querySelector("span")!.innerHTML = getTheme() === "dark" ? I.sun : I.moon;
  }

  editor.onChange(refresh);
  refresh();
}
