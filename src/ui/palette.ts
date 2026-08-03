/** The left palette: categorised, searchable component list.
 *  Drag an item onto the canvas to place it, or just click to drop it in view. */

import { el, clear, toast } from "./dom";
import { allDefs, CATEGORY_ORDER, CATEGORY_LABELS } from "@/components/registry";
import type { ComponentDef, Category } from "@/components/types";
import type { Editor } from "@/app/editor";

export function mountPalette(root: HTMLElement, editor: Editor): void {
  const search = el("input", {
    type: "text",
    placeholder: "Search components…",
    oninput: () => render(list, editor, search.value.toLowerCase()),
  });
  const list = el("div", { class: "list" });
  root.appendChild(el("div", { class: "search" }, [search]));
  root.appendChild(list);
  render(list, editor, "");
  // keeps the "already placed" styling on one-per-project parts in step with
  // the board as they are added and deleted
  editor.onChange(() => render(list, editor, search.value.toLowerCase()));
}

function render(list: HTMLElement, editor: Editor, query: string): void {
  clear(list);
  const defs = allDefs().filter(
    (d) =>
      !query ||
      d.name.toLowerCase().includes(query) ||
      d.description.toLowerCase().includes(query) ||
      d.category.includes(query),
  );
  const byCat = new Map<Category, ComponentDef[]>();
  for (const d of defs) {
    const arr = byCat.get(d.category) ?? [];
    arr.push(d);
    byCat.set(d.category, arr);
  }
  for (const cat of CATEGORY_ORDER) {
    const items = byCat.get(cat);
    if (!items?.length) continue;
    list.appendChild(el("div", { class: "pal-cat" }, [CATEGORY_LABELS[cat]]));
    for (const def of items) list.appendChild(item(def, editor));
  }
  if (!defs.length)
    list.appendChild(el("div", { class: "pal-cat" }, ["No matches"]));
}

function initials(def: ComponentDef): string {
  return (def.short ?? def.name)
    .split(/[\s/]+/)
    .map((w) => w[0])
    .join("")
    .slice(0, 3)
    .toUpperCase();
}

function item(def: ComponentDef, editor: Editor): HTMLElement {
  const ini = initials(def);
  const blocked = editor.placementBlock(def.id);
  const node = el("div", { class: blocked ? "pal-item used" : "pal-item", title: blocked ?? def.description }, [
    el("div", { class: "glyph green" }, [ini]),
    el("div", { class: "meta" }, [
      el("div", { class: "name" }, [def.name]),
      el("div", { class: "desc" }, [def.description]),
    ]),
  ]);
  node.addEventListener("pointerdown", (e) => beginPlace(e, def, ini, editor));
  return node;
}

/** Pointer-based placement: works via drag OR a plain click (drops in view centre). */
function beginPlace(e: PointerEvent, def: ComponentDef, ini: string, editor: Editor): void {
  e.preventDefault();
  // one-per-project parts refuse up front, so there is no ghost to drag around
  const blocked = editor.placementBlock(def.id);
  if (blocked) {
    toast(blocked);
    return;
  }
  const ghost = el("div", { class: "drag-ghost" }, [ini]);
  document.body.appendChild(ghost);
  const at = (x: number, y: number) => {
    ghost.style.left = `${x}px`;
    ghost.style.top = `${y}px`;
  };
  at(e.clientX, e.clientY);

  const move = (ev: PointerEvent) => at(ev.clientX, ev.clientY);
  const up = (ev: PointerEvent) => {
    document.removeEventListener("pointermove", move);
    document.removeEventListener("pointerup", up);
    ghost.remove();
    const canvas = document.getElementById("scene");
    if (!canvas) return;
    const r = canvas.getBoundingClientRect();
    const overCanvas =
      ev.clientX >= r.left && ev.clientX <= r.right &&
      ev.clientY >= r.top && ev.clientY <= r.bottom;
    const px = overCanvas ? ev.clientX - r.left : r.width / 2;
    const py = overCanvas ? ev.clientY - r.top : r.height / 2;
    const w = editor.toWorld(px, py);
    editor.addComponent(def.id, w.x, w.y);
  };
  document.addEventListener("pointermove", move);
  document.addEventListener("pointerup", up);
}
