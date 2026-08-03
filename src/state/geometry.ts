/**
 * Placement maths for rotated parts.
 *
 * Every part is *authored* unrotated: its pins, its footprint and its `draw`
 * code all work in box-local units where (0, 0) is the top-left of the green
 * box. A placed instance stores that unrotated top-left as (`x`, `y`) plus a
 * rotation, which is always a quarter turn about the box's *centre* — so
 * turning a part spins it in place instead of throwing it across the canvas.
 *
 * Everything that needs to know where a part really is — hit testing, wire
 * endpoints, the renderer, the world sensors — goes through here, so there is
 * only one definition of "rotated".
 */

/** A placed instance: unrotated top-left corner plus its rotation in degrees. */
export interface Placed {
  x: number;
  y: number;
  rotation: number;
}

/** The authored footprint of a part. */
export interface Size {
  w: number;
  h: number;
}

/** Rotation is stored in degrees; normalise it to 0..3 quarter turns. */
export function quarterTurns(rotation: number): number {
  return ((Math.round((rotation || 0) / 90) % 4) + 4) % 4;
}

/** Rotate an offset by `q` quarter turns clockwise (screen y points down). */
function spin(q: number, dx: number, dy: number): { x: number; y: number } {
  switch (q) {
    case 1: return { x: -dy, y: dx };
    case 2: return { x: -dx, y: -dy };
    case 3: return { x: dy, y: -dx };
    default: return { x: dx, y: dy };
  }
}

/** Box-local point → world. */
export function localToWorld(c: Placed, s: Size, lx: number, ly: number): { x: number; y: number } {
  const r = spin(quarterTurns(c.rotation), lx - s.w / 2, ly - s.h / 2);
  return { x: c.x + s.w / 2 + r.x, y: c.y + s.h / 2 + r.y };
}

/** World point → box-local. The exact inverse of `localToWorld`. */
export function worldToLocal(c: Placed, s: Size, wx: number, wy: number): { x: number; y: number } {
  const q = (4 - quarterTurns(c.rotation)) % 4;
  const r = spin(q, wx - (c.x + s.w / 2), wy - (c.y + s.h / 2));
  return { x: r.x + s.w / 2, y: r.y + s.h / 2 };
}

/** Axis-aligned world footprint — width and height swap on a quarter turn. */
export function worldBounds(c: Placed, s: Size): { x: number; y: number; w: number; h: number } {
  const turned = quarterTurns(c.rotation) % 2 === 1;
  const w = turned ? s.h : s.w;
  const h = turned ? s.w : s.h;
  return { x: c.x + s.w / 2 - w / 2, y: c.y + s.h / 2 - h / 2, w, h };
}
