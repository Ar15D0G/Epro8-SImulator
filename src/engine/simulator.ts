/**
 * Continuity + energise simulation core.
 *
 * Each frame:
 *   1. Build continuity nets from wires + passive conductors (closed switches,
 *      buttons, junctions).                                     [union-find]
 *   2. Collect static sources (battery + / −, solar panel).
 *   3. Run stateful `tick()` (timers, counters, latches) against last frame's
 *      settled energisation.
 *   4. Iterate `evaluate()` to a fixed point so active parts (gates, sensors)
 *      energise their output nets and loads settle.
 */

import type { CircuitDoc, ComponentInstance } from "@/state/document";
import { getDef } from "@/components/registry";
import type { SimContext, SimEnv } from "@/components/types";
import { Nets, pinKey } from "./graph";
import { localToWorld, worldBounds, worldToLocal } from "@/state/geometry";

const MAX_ITERS = 32;

export class Simulator {
  env: SimEnv = {
    time: 0,
    ambientLight: 0.7, // a normally lit room
    sun: { on: false, x: 360, y: 40, radius: 130 },
    object: { on: false, x: 360, y: 260, radius: 34 },
    temperature: 21,
    distance: 40,
    radio: new Map(),
  };

  running = true;

  private nets = new Nets();
  private groundRoots = new Set<string>();
  private staticPower = new Map<string, number>();
  /** settled energisation per net root (persists across frames for `tick`) */
  private energy = new Map<string, number>();
  private values = new Map<string, number>();

  energizedAt(comp: string, pin: string): number {
    return this.energy.get(this.nets.net(comp, pin)) ?? 0;
  }
  groundedAt(comp: string, pin: string): boolean {
    return this.groundRoots.has(this.nets.net(comp, pin));
  }
  valueAt(comp: string, pin: string): number {
    return this.values.get(this.nets.net(comp, pin)) ?? 0;
  }

  reset(doc: CircuitDoc): void {
    this.env.time = 0;
    this.energy = new Map();
    this.values = new Map();
    this.env.radio = new Map();
    for (const c of doc.components) c.state = undefined;
  }

  step(doc: CircuitDoc, dt: number): void {
    if (!this.running) dt = 0;
    this.env.time += dt;

    // 1. continuity
    const nets = new Nets();
    this.nets = nets;
    for (const w of doc.wires) {
      nets.union(pinKey(w.a.comp, w.a.pin), pinKey(w.b.comp, w.b.pin));
    }
    for (const c of doc.components) {
      if (!c.state) {
        const def = getDef(c.defId);
        c.state = def?.init ? def.init() : {};
      }
      const def = getDef(c.defId);
      const edges = def?.conductor?.(c.props, c.state!) ?? [];
      for (const [p, q] of edges) {
        nets.union(pinKey(c.id, p), pinKey(c.id, q));
      }
    }

    // 2a. ground roots (independent of fuse state)
    this.groundRoots = new Set();
    for (const c of doc.components) {
      const def = getDef(c.defId);
      for (const s of def?.source?.(c.props, c.state!, this.env) ?? []) {
        if (s.kind === "ground") this.groundRoots.add(nets.net(c.id, s.pin));
      }
    }

    // 2b. fuse / short-circuit check — latch `blown` so the source cuts out
    for (const c of doc.components) {
      const def = getDef(c.defId);
      if (!def?.checkShort || c.state!.blown) continue;
      const grounded = (pin: string) => this.groundRoots.has(nets.net(c.id, pin));
      const energized = (pin: string) => this.energy.get(nets.net(c.id, pin)) ?? 0;
      if (def.checkShort({ grounded, energized })) c.state!.blown = true;
    }

    // 2c. static power (source now reflects any blown fuse)
    this.staticPower = new Map();
    for (const c of doc.components) {
      const def = getDef(c.defId);
      for (const s of def?.source?.(c.props, c.state!, this.env) ?? []) {
        if (s.kind === "power") {
          const root = nets.net(c.id, s.pin);
          this.staticPower.set(root, Math.max(this.staticPower.get(root) ?? 0, s.level));
        }
      }
    }

    // 3. stateful tick (reads last frame's settled energy)
    for (const c of doc.components) {
      const def = getDef(c.defId);
      if (!def?.tick) continue;
      def.tick(this.makeContext(c, this.energy, null), dt);
    }

    // 4. fixed-point energise
    let read = new Map(this.staticPower);
    let prev = "";
    for (let iter = 0; iter < MAX_ITERS; iter++) {
      const write = new Map(this.staticPower);
      const vals = new Map<string, number>();
      // Transmitters fill a fresh airwaves map while receivers read the one
      // that settled last pass — the same read/write split as `energy`, so the
      // link resolves regardless of which end comes first in document order.
      const airwaves = new Map<string, number>();
      for (const c of doc.components) {
        const def = getDef(c.defId);
        if (!def?.evaluate) continue;
        def.evaluate(this.makeContext(c, read, write, vals, airwaves));
      }
      read = write;
      this.values = vals;
      this.env.radio = airwaves;
      const snap = snapshot(write);
      if (snap === prev) break;
      prev = snap;
    }
    this.energy = read;
  }

  private makeContext(
    c: ComponentInstance,
    read: Map<string, number>,
    write: Map<string, number> | null,
    vals?: Map<string, number>,
    airwaves?: Map<string, number>,
  ): SimContext {
    const nets = this.nets;
    const comp = c.id;
    const def = getDef(c.defId);
    const energized = (pin: string) => read.get(nets.net(comp, pin)) ?? 0;
    const size = { w: def?.w ?? 0, h: def?.h ?? 0 };
    return {
      props: c.props,
      state: c.state!,
      env: this.env,
      bounds: worldBounds(c, size),
      toWorld: (lx, ly) => localToWorld(c, size, lx, ly),
      toLocal: (wx, wy) => worldToLocal(c, size, wx, wy),
      energized,
      grounded: (pin) => this.groundRoots.has(nets.net(comp, pin)),
      high: (pin) => energized(pin) > 0.5,
      valueOf: (pin) => (vals ?? this.values).get(nets.net(comp, pin)) ?? 0,
      energize: (pin, level, value) => {
        if (!write) return;
        const root = nets.net(comp, pin);
        const l = clamp01(level);
        if (l > (write.get(root) ?? 0)) write.set(root, l);
        if (vals && value !== undefined && value !== 0) vals.set(root, value);
      },
      broadcast: (channel, level) => {
        if (!airwaves) return;
        const l = clamp01(level);
        if (l > (airwaves.get(channel) ?? 0)) airwaves.set(channel, l);
      },
      receive: (channel) => this.env.radio.get(channel) ?? 0,
    };
  }
}

function clamp01(x: number): number {
  return x < 0 ? 0 : x > 1 ? 1 : x;
}

function snapshot(m: Map<string, number>): string {
  const parts: string[] = [];
  for (const [k, v] of m) if (v > 0.001) parts.push(`${k}:${v.toFixed(2)}`);
  parts.sort();
  return parts.join("|");
}
