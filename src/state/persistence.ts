/** Save / load: named localStorage slots + compact shareable codes + URL hash. */

import LZString from "lz-string";
import type { CircuitDoc } from "./document";
import { emptyDoc, serialisableDoc } from "./document";

const SLOTS_KEY = "epro8.slots.v1";
const AUTOSAVE_KEY = "epro8.autosave.v1";

export interface SlotMeta {
  name: string;
  when: number;
  count: number;
}

interface StoredSlot extends SlotMeta {
  doc: CircuitDoc;
}

function readSlots(): Record<string, StoredSlot> {
  try {
    return JSON.parse(localStorage.getItem(SLOTS_KEY) ?? "{}");
  } catch {
    return {};
  }
}

function writeSlots(slots: Record<string, StoredSlot>): void {
  localStorage.setItem(SLOTS_KEY, JSON.stringify(slots));
}

export function listSlots(): SlotMeta[] {
  return Object.values(readSlots())
    .map((s) => ({ name: s.name, when: s.when, count: s.count }))
    .sort((a, b) => b.when - a.when);
}

export function saveSlot(name: string, doc: CircuitDoc): void {
  const slots = readSlots();
  const clean = serialisableDoc(doc);
  slots[name] = { name, when: Date.now(), count: clean.components.length, doc: clean };
  writeSlots(slots);
}

export function loadSlot(name: string): CircuitDoc | null {
  const slot = readSlots()[name];
  return slot ? slot.doc : null;
}

export function deleteSlot(name: string): void {
  const slots = readSlots();
  delete slots[name];
  writeSlots(slots);
}

/** Encode a document as a short, URL-safe share code. */
export function encodeDoc(doc: CircuitDoc): string {
  return LZString.compressToEncodedURIComponent(JSON.stringify(serialisableDoc(doc)));
}

export function decodeDoc(code: string): CircuitDoc | null {
  try {
    const json = LZString.decompressFromEncodedURIComponent(code.trim());
    if (!json) return null;
    const doc = JSON.parse(json) as CircuitDoc;
    if (doc.version !== 1 || !Array.isArray(doc.components)) return null;
    return doc;
  } catch {
    return null;
  }
}

export function autosave(doc: CircuitDoc): void {
  try {
    localStorage.setItem(AUTOSAVE_KEY, JSON.stringify(serialisableDoc(doc)));
  } catch {
    /* storage full / disabled — ignore */
  }
}

export function loadAutosave(): CircuitDoc {
  try {
    const raw = localStorage.getItem(AUTOSAVE_KEY);
    if (raw) return JSON.parse(raw) as CircuitDoc;
  } catch {
    /* ignore */
  }
  return emptyDoc();
}

/** Read a `#c=<code>` share link from the URL, if present. */
export function docFromHash(): CircuitDoc | null {
  const m = location.hash.match(/^#c=(.+)$/);
  return m ? decodeDoc(m[1]) : null;
}
