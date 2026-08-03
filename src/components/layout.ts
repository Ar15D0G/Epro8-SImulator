/**
 * Shared layout for the green-box components: every module is a green box with
 * a title on top and colour-coded sockets along the bottom edge.
 *
 * Socket colour code (matches the EPro8 kit):
 *   red   = + power  (must wire back to the battery +)
 *   black = − power  (must wire back to the battery −)
 *   blue  = signal   (inputs and outputs; connect blue-to-blue)
 */

import type { PinDef, PinRole, SimContext } from "./types";

export const BOX_H = 96;

export const SOCKET = {
  pos: "#e23b3b", // red +
  neg: "#15181d", // black −
  sig: "#2f7bff", // blue signal
  aux: "#f2c94c", // amber (special signals, e.g. RGB channels)
};

export type SockKind = "p+" | "p-" | "src+" | "src-" | "in" | "out" | "io";

export interface SockSpec {
  id: string;
  kind: SockKind;
  label?: string;
  /** colour override (e.g. RGB channels) */
  color?: string;
}

function roleColor(kind: SockKind, override?: string): { role: PinRole; color: string } {
  if (override) {
    const role: PinRole = kind === "out" || kind === "src+" || kind === "src-" ? "out" : kind === "io" ? "inout" : "in";
    return { role, color: override };
  }
  switch (kind) {
    case "p+": return { role: "in", color: SOCKET.pos };
    case "p-": return { role: "in", color: SOCKET.neg };
    case "src+": return { role: "out", color: SOCKET.pos };
    case "src-": return { role: "out", color: SOCKET.neg };
    case "out": return { role: "out", color: SOCKET.sig };
    case "io": return { role: "inout", color: SOCKET.sig };
    default: return { role: "in", color: SOCKET.sig };
  }
}

/** Build a green-box footprint: width sized to the sockets, pins along the bottom. */
export function box(socks: SockSpec[]): { w: number; h: number; pins: PinDef[] } {
  const n = socks.length;
  const w = Math.max(104, 18 + n * 30);
  const pins: PinDef[] = socks.map((s, i) => {
    const { role, color } = roleColor(s.kind, s.color);
    return {
      id: s.id,
      role,
      x: (w * (i + 1)) / (n + 1),
      y: BOX_H - 12,
      label: s.label,
      color,
    };
  });
  return { w, h: BOX_H, pins };
}

/**
 * Supply voltage that a fully energised net (level 1) stands for.
 *
 * The engine works in normalised 0..1 levels, not volts — a healthy battery is
 * 1. Anything that has to show the player an actual reading converts with
 * `volts()`, so the whole kit quotes the same scale.
 */
export const SUPPLY_VOLTS = 9;

/** An energisation level 0..1 as a reading in volts. */
export function volts(level: number): number {
  return level * SUPPLY_VOLTS;
}

/** Standard + / − power pair used by every active (powered) module. */
export const POWER: SockSpec[] = [
  { id: "vp", kind: "p+", label: "+" },
  { id: "vn", kind: "p-", label: "−" },
];

/** An active module only works when its + is energised and its − is grounded. */
export function powered(c: SimContext): boolean {
  return c.energized("vp") > 0.5 && c.grounded("vn");
}

/**
 * Is the world light source's beam touching this part? The beam counts as soon
 * as it covers *any* of the footprint, so what the player sees on the canvas
 * (a glowing circle overlapping the green box) is what the sensor reads.
 */
export function inSunlight(c: SimContext): boolean {
  const sun = c.env.sun;
  if (!sun.on) return false;
  const b = c.bounds;
  // closest point on the part's box to the centre of the beam
  const nx = Math.max(b.x, Math.min(sun.x, b.x + b.w));
  const ny = Math.max(b.y, Math.min(sun.y, b.y + b.h));
  return Math.hypot(sun.x - nx, sun.y - ny) <= sun.radius;
}

/**
 * Is the world object (the rock) pressing on a mechanical part? The part hands
 * in a bar in *box-local* units — e.g. a limit switch's lever at rest — which
 * is mapped through the part's rotation, so a turned part is struck exactly
 * where its lever is drawn.
 *
 * Always test the resting bar, never the animated one: a bar that moves out of
 * the way once pressed would untrip itself and flicker.
 */
export function objectOnBar(
  c: SimContext,
  ax: number,
  ay: number,
  bx: number,
  by: number,
): boolean {
  const o = c.env.object;
  if (!o.on) return false;
  const a = c.toWorld(ax, ay);
  const b = c.toWorld(bx, by);
  return distToSeg(o.x, o.y, a.x, a.y, b.x, b.y) <= o.radius;
}

/**
 * How far along a beam the world object (the rock) blocks it.
 *
 * The beam is handed in as a segment in *box-local* units — the same units
 * `draw` uses — so a rotated part shoots its beam exactly where it is drawn.
 * Returns the distance from `a` to the near edge of the object (0 when the
 * emitter is buried inside it), or `null` when nothing is in the way.
 *
 * Both `evaluate` and `draw` work off this one number: the beam is drawn up to
 * the blocking point, so what the player sees stopping the beam is exactly what
 * the sensor reads.
 */
export function objectOnRay(
  c: SimContext,
  ax: number,
  ay: number,
  bx: number,
  by: number,
): number | null {
  const o = c.env.object;
  if (!o.on) return null;
  const a = c.toWorld(ax, ay);
  const b = c.toWorld(bx, by);
  const len = Math.hypot(b.x - a.x, b.y - a.y);
  if (len < 1e-6) return null;
  const ux = (b.x - a.x) / len;
  const uy = (b.y - a.y) / len;
  // ray/circle intersection, with the emitter at t = 0
  const fx = a.x - o.x;
  const fy = a.y - o.y;
  const proj = fx * ux + fy * uy;
  const disc = proj * proj - (fx * fx + fy * fy - o.radius * o.radius);
  if (disc < 0) return null; // the beam passes it by
  const root = Math.sqrt(disc);
  if (-proj + root < 0) return null; // sits behind the emitter
  const near = -proj - root;
  if (near > len) return null; // the beam runs out before reaching it
  return near < 0 ? 0 : near;
}

function distToSeg(px: number, py: number, ax: number, ay: number, bx: number, by: number): number {
  const dx = bx - ax;
  const dy = by - ay;
  const len2 = dx * dx + dy * dy || 1;
  let t = ((px - ax) * dx + (py - ay) * dy) / len2;
  t = t < 0 ? 0 : t > 1 ? 1 : t;
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}
