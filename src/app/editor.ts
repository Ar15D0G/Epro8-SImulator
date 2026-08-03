/**
 * The editor hub: owns the document, simulator, camera, tool and selection,
 * and exposes all mutating operations. The canvas renders from it; the UI
 * panels call into it and re-render on `onChange`.
 */

import { Simulator } from "@/engine/simulator";
import { History } from "@/state/history";
import {
  emptyDoc,
  uid,
  type CircuitDoc,
  type ComponentInstance,
  type WireInstance,
} from "@/state/document";
import { autosave } from "@/state/persistence";
import { getDef, defaultProps } from "@/components/registry";
import { localToWorld, worldToLocal } from "@/state/geometry";
import type { PinDef } from "@/components/types";

export type Tool = "select" | "wire" | "pan" | "erase";

export interface Camera {
  x: number;
  y: number;
  scale: number;
}

export interface PinRef {
  comp: string;
  pin: string;
}

const GRID = 20;

export class Editor {
  doc: CircuitDoc = emptyDoc();
  sim = new Simulator();
  history = new History();

  camera: Camera = { x: 0, y: 0, scale: 1 };
  tool: Tool = "select";
  selection = new Set<string>();
  /** in-progress wire drag: source pin + colour + current cursor world pos */
  pendingWire: { from: PinRef; color: string; x: number; y: number } | null = null;

  private changeCbs = new Set<() => void>();

  constructor() {
    this.history.reset(this.doc);
  }

  onChange(cb: () => void): void {
    this.changeCbs.add(cb);
  }
  emit(): void {
    for (const cb of this.changeCbs) cb();
  }

  /** Push an undo point + autosave + notify UI. Call after a discrete edit. */
  commit(): void {
    this.history.push(this.doc);
    autosave(this.doc);
    this.emit();
  }

  // ── document ops ───────────────────────────────────────────────
  load(doc: CircuitDoc): void {
    this.doc = doc;
    this.selection.clear();
    this.pendingWire = null;
    this.sim.reset(this.doc);
    this.history.reset(this.doc);
    autosave(this.doc);
    this.emit();
  }

  clear(): void {
    this.load(emptyDoc());
  }

  /**
   * Why this part cannot be placed right now, phrased for the player, or null
   * if it can. Currently only the `unique` parts (the radio link) refuse.
   */
  placementBlock(defId: string): string | null {
    const def = getDef(defId);
    if (!def?.unique) return null;
    const has = this.doc.components.some((c) => c.defId === defId);
    return has ? `Only one ${def.name} per project.` : null;
  }

  addComponent(defId: string, wx: number, wy: number): ComponentInstance | null {
    const def = getDef(defId);
    if (!def) return null;
    if (this.placementBlock(defId)) return null;
    const inst: ComponentInstance = {
      id: uid("c"),
      defId,
      x: snap(wx - def.w / 2),
      y: snap(wy - def.h / 2),
      rotation: 0,
      props: defaultProps(def),
    };
    this.doc.components.push(inst);
    this.selection = new Set([inst.id]);
    this.commit();
    return inst;
  }

  deleteComponent(id: string): void {
    this.doc.components = this.doc.components.filter((c) => c.id !== id);
    this.doc.wires = this.doc.wires.filter(
      (w) => w.a.comp !== id && w.b.comp !== id,
    );
    this.selection.delete(id);
  }

  deleteSelection(): void {
    if (!this.selection.size) return;
    for (const id of [...this.selection]) this.deleteComponent(id);
    this.commit();
  }

  deleteWire(id: string): void {
    this.doc.wires = this.doc.wires.filter((w) => w.id !== id);
    this.commit();
  }

  moveSelection(dx: number, dy: number): void {
    for (const id of this.selection) {
      const c = this.byId(id);
      if (c) {
        c.x += dx;
        c.y += dy;
      }
    }
  }

  /** Turn the selected parts a quarter turn (about each part's own centre). */
  rotateSelection(step = 1): void {
    if (!this.selection.size) return;
    for (const id of this.selection) {
      const c = this.byId(id);
      if (c) c.rotation = (((c.rotation + step * 90) % 360) + 360) % 360;
    }
    this.commit();
  }

  snapSelection(): void {
    for (const id of this.selection) {
      const c = this.byId(id);
      if (c) {
        c.x = snap(c.x);
        c.y = snap(c.y);
      }
    }
  }

  setProp(id: string, key: string, value: number | string | boolean): void {
    const c = this.byId(id);
    if (!c) return;
    c.props[key] = value;
    this.commit();
  }

  /** Clear a blown fuse on a component (e.g. clicking a tripped battery). */
  resetFuse(id: string): boolean {
    const c = this.byId(id);
    if (c?.state?.blown) {
      c.state.blown = false;
      this.emit();
      return true;
    }
    return false;
  }

  toggleInteract(id: string, pressed?: boolean): void {
    const c = this.byId(id);
    if (!c || !c.state) return;
    const def = getDef(c.defId);
    if (def?.interact === "toggle") {
      const key = "closed" in c.state ? "closed" : "on";
      c.state[key] = !(c.state[key] as boolean);
    } else if (def?.interact === "momentary" && pressed !== undefined) {
      c.state.pressed = pressed;
    }
    this.emit();
  }

  // ── wiring ─────────────────────────────────────────────────────
  /** Colour of a pin (used to auto-colour wires from their start socket). */
  pinColor(ref: PinRef): string {
    const c = this.byId(ref.comp);
    const def = c && getDef(c.defId);
    const pin = def?.pins.find((p) => p.id === ref.pin);
    return pin?.color ?? "#94a3b8";
  }

  startWire(from: PinRef, wx: number, wy: number): void {
    this.pendingWire = { from, color: this.pinColor(from), x: wx, y: wy };
  }

  completeWire(to: PinRef): void {
    const pending = this.pendingWire;
    this.pendingWire = null;
    if (!pending) return;
    const from = pending.from;
    if (from.comp === to.comp && from.pin === to.pin) return;
    // no duplicate wire
    const dup = this.doc.wires.some(
      (w) =>
        (sameEnd(w.a, from) && sameEnd(w.b, to)) ||
        (sameEnd(w.a, to) && sameEnd(w.b, from)),
    );
    if (dup) return;
    const wire: WireInstance = {
      id: uid("w"),
      a: { ...from },
      b: { ...to },
      color: pending.color, // wire takes the colour of the socket it started from
    };
    this.doc.wires.push(wire);
    this.commit();
  }

  cancelWire(): void {
    this.pendingWire = null;
  }

  // ── lookups & geometry ─────────────────────────────────────────
  byId(id: string): ComponentInstance | undefined {
    return this.doc.components.find((c) => c.id === id);
  }

  pinPos(comp: ComponentInstance, pin: PinDef): { x: number; y: number } {
    const def = getDef(comp.defId);
    if (!def) return { x: comp.x + pin.x, y: comp.y + pin.y };
    return localToWorld(comp, def, pin.x, pin.y);
  }

  pinAbs(ref: PinRef): { x: number; y: number } | null {
    const c = this.byId(ref.comp);
    const def = c && getDef(c.defId);
    const pin = def?.pins.find((p) => p.id === ref.pin);
    return c && pin ? this.pinPos(c, pin) : null;
  }

  hitComponent(wx: number, wy: number): ComponentInstance | null {
    for (let i = this.doc.components.length - 1; i >= 0; i--) {
      const c = this.doc.components[i];
      const def = getDef(c.defId);
      if (!def) continue;
      // test in the part's own space, so a rotated box is hit where it looks
      const l = worldToLocal(c, def, wx, wy);
      if (l.x >= 0 && l.x <= def.w && l.y >= 0 && l.y <= def.h) return c;
    }
    return null;
  }

  hitPin(wx: number, wy: number, r: number): PinRef | null {
    let best: PinRef | null = null;
    let bestD = r * r;
    for (const c of this.doc.components) {
      const def = getDef(c.defId);
      if (!def) continue;
      for (const pin of def.pins) {
        const { x: px, y: py } = this.pinPos(c, pin);
        const d = (px - wx) ** 2 + (py - wy) ** 2;
        if (d <= bestD) {
          bestD = d;
          best = { comp: c.id, pin: pin.id };
        }
      }
    }
    return best;
  }

  hitWire(wx: number, wy: number, r: number): WireInstance | null {
    for (let i = this.doc.wires.length - 1; i >= 0; i--) {
      const w = this.doc.wires[i];
      const a = this.pinAbs(w.a);
      const b = this.pinAbs(w.b);
      if (a && b && distToSeg(wx, wy, a.x, a.y, b.x, b.y) <= r) return w;
    }
    return null;
  }

  // ── camera transforms ──────────────────────────────────────────
  toWorld(sx: number, sy: number): { x: number; y: number } {
    return {
      x: (sx - this.camera.x) / this.camera.scale,
      y: (sy - this.camera.y) / this.camera.scale,
    };
  }
  toScreen(wx: number, wy: number): { x: number; y: number } {
    return {
      x: wx * this.camera.scale + this.camera.x,
      y: wy * this.camera.scale + this.camera.y,
    };
  }

  undo(): void {
    const d = this.history.undo();
    if (d) {
      this.doc = d;
      this.selection.clear();
      this.sim.reset(this.doc);
      autosave(this.doc);
      this.emit();
    }
  }
  redo(): void {
    const d = this.history.redo();
    if (d) {
      this.doc = d;
      this.selection.clear();
      this.sim.reset(this.doc);
      autosave(this.doc);
      this.emit();
    }
  }
}

function snap(v: number): number {
  return Math.round(v / GRID) * GRID;
}

function sameEnd(a: PinRef, b: PinRef): boolean {
  return a.comp === b.comp && a.pin === b.pin;
}

function distToSeg(px: number, py: number, ax: number, ay: number, bx: number, by: number): number {
  const dx = bx - ax;
  const dy = by - ay;
  const len2 = dx * dx + dy * dy || 1;
  let t = ((px - ax) * dx + (py - ay) * dy) / len2;
  t = t < 0 ? 0 : t > 1 ? 1 : t;
  const cx = ax + t * dx;
  const cy = ay + t * dy;
  return Math.hypot(px - cx, py - cy);
}

export { GRID };
