/** Modal dialogs: save to a slot, load (slot or share code), share a link. */

import { el, toast } from "./dom";
import type { Editor } from "@/app/editor";
import {
  listSlots,
  saveSlot,
  loadSlot,
  deleteSlot,
  encodeDoc,
  decodeDoc,
} from "@/state/persistence";

const root = () => document.getElementById("dialog-root")!;

function open(title: string, subtitle: string, bodyBuilder: (close: () => void) => Node[]): void {
  const host = root();
  const close = () => (host.innerHTML = "");
  const backdrop = el("div", {
    class: "dialog-backdrop",
    onclick: (e) => {
      if (e.target === backdrop) close();
    },
  });
  const dialog = el("div", { class: "dialog" }, [
    el("h2", {}, [title]),
    el("p", {}, [subtitle]),
    ...bodyBuilder(close),
  ]);
  backdrop.appendChild(dialog);
  host.innerHTML = "";
  host.appendChild(backdrop);
}

function slotList(editor: Editor, onPick: (name: string) => void, refresh: () => void): HTMLElement {
  const wrap = el("div", { class: "slot-list" });
  const slots = listSlots();
  if (!slots.length)
    return el("div", { class: "empty" }, ["No saved projects yet."]);
  for (const s of slots) {
    wrap.appendChild(
      el("div", { class: "slot" }, [
        el("div", { class: "info" }, [
          el("div", { class: "name" }, [s.name]),
          el("div", { class: "when" }, [
            `${s.count} parts · ${new Date(s.when).toLocaleString()}`,
          ]),
        ]),
        el("div", { class: "ops" }, [
          el("button", { class: "btn", onclick: () => onPick(s.name) }, ["Load"]),
          el(
            "button",
            {
              class: "btn danger",
              onclick: () => {
                deleteSlot(s.name);
                refresh();
              },
            },
            ["Delete"],
          ),
        ]),
      ]),
    );
  }
  void editor;
  return wrap;
}

export function openSaveDialog(editor: Editor): void {
  open("Save project", "Store this circuit in your browser.", (close) => {
    const name = el("input", { type: "text", placeholder: "Project name", value: "" });
    let listHost: HTMLElement;
    const rebuild = () => {
      const fresh = slotList(editor, () => {}, rebuild);
      listHost.replaceWith(fresh);
      listHost = fresh;
    };
    listHost = slotList(editor, () => {}, rebuild);
    return [
      el("div", { class: "field" }, [name]),
      el("div", { style: "max-height:240px;overflow:auto" }, [listHost]),
      el("div", { class: "actions" }, [
        el("button", { class: "btn", onclick: close }, ["Cancel"]),
        el(
          "button",
          {
            class: "btn active",
            onclick: () => {
              const n = name.value.trim() || `Project ${new Date().toLocaleTimeString()}`;
              saveSlot(n, editor.doc);
              toast(`Saved "${n}"`);
              close();
            },
          },
          ["Save"],
        ),
      ]),
    ];
  });
}

export function openLoadDialog(editor: Editor, afterLoad: () => void): void {
  open("Open project", "Load a saved project or paste a share code.", (close) => {
    const code = el("textarea", { placeholder: "Paste a share code here…" });
    let listHost: HTMLElement;
    const doLoad = (name: string) => {
      const doc = loadSlot(name);
      if (doc) {
        editor.load(doc);
        afterLoad();
        toast(`Loaded "${name}"`);
        close();
      }
    };
    const rebuild = () => {
      const fresh = slotList(editor, doLoad, rebuild);
      listHost.replaceWith(fresh);
      listHost = fresh;
    };
    listHost = slotList(editor, doLoad, rebuild);
    return [
      el("div", { style: "max-height:220px;overflow:auto;margin-bottom:12px" }, [listHost]),
      el("div", { class: "field" }, [code]),
      el("div", { class: "actions" }, [
        el("button", { class: "btn", onclick: close }, ["Cancel"]),
        el(
          "button",
          {
            class: "btn active",
            onclick: () => {
              const doc = decodeDoc(code.value);
              if (!doc) {
                toast("That code could not be read.");
                return;
              }
              editor.load(doc);
              afterLoad();
              toast("Circuit loaded from code");
              close();
            },
          },
          ["Load code"],
        ),
      ]),
    ];
  });
}

export function openShareDialog(editor: Editor): void {
  const code = encodeDoc(editor.doc);
  const url = `${location.origin}${location.pathname}#c=${code}`;
  open("Share circuit", "Anyone with this link or code gets an exact copy.", (close) => {
    const codeArea = el("textarea", { readonly: true }, [code]);
    const urlArea = el("textarea", { readonly: true }, [url]);
    const copy = (text: string, what: string) => {
      navigator.clipboard?.writeText(text).then(
        () => toast(`${what} copied`),
        () => toast("Copy failed — select and copy manually"),
      );
    };
    return [
      el("div", { class: "field" }, [
        el("label", {}, ["Share link"]),
        urlArea,
        el("button", { class: "btn", style: "margin-top:6px", onclick: () => copy(url, "Link") }, [
          "Copy link",
        ]),
      ]),
      el("div", { class: "field" }, [
        el("label", {}, ["Share code"]),
        codeArea,
        el("button", { class: "btn", style: "margin-top:6px", onclick: () => copy(code, "Code") }, [
          "Copy code",
        ]),
      ]),
      el("div", { class: "actions" }, [
        el("button", { class: "btn active", onclick: close }, ["Done"]),
      ]),
    ];
  });
}
