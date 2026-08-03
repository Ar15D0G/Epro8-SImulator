/**
 * Data-driven component definitions.
 *
 * Every part in the simulator (batteries, LEDs, logic gates, radios, ...) is
 * described by a `ComponentDef`. Adding a new part = adding one definition and
 * registering it.
 *
 * ── Electrical model ─────────────────────────────────────────────────────────
 * We use a *continuity + energise* model so real wiring intuition holds:
 *
 *  • Passive conductors (wires, closed switches, buttons, junctions) merge the
 *    nets of the pins they connect  →  `conductor()`.
 *  • Sources put a potential on a net: the battery's + terminal energises,
 *    its − terminal grounds  →  `source()`.
 *  • Active parts (logic gates, sensors, timers, radios) read whether their
 *    input nets are energised and, if active, energise their output net
 *    →  `evaluate()` / `tick()`.
 *  • A two-terminal load (LED, motor, buzzer, ...) turns on only when one
 *    terminal is energised *and* the other is grounded — i.e. a complete
 *    circuit — which it checks inside `evaluate()`.
 */

export type Category =
  | "power"
  | "output"
  | "input"
  | "logic"
  | "timing"
  | "sensor"
  | "wireless";

export type PinRole = "in" | "out" | "inout";

/** A connection point on a component, positioned in local (unrotated) units. */
export interface PinDef {
  id: string;
  role: PinRole;
  x: number;
  y: number;
  label?: string;
  color?: string;
}

export type PropSpec =
  | {
      kind: "range";
      key: string;
      label: string;
      min: number;
      max: number;
      step: number;
      default: number;
      unit?: string;
    }
  | {
      kind: "int";
      key: string;
      label: string;
      min: number;
      max: number;
      default: number;
      unit?: string;
    }
  | {
      kind: "select";
      key: string;
      label: string;
      options: { value: string; label: string }[];
      default: string;
    }
  | { kind: "color"; key: string; label: string; default: string }
  | {
      kind: "toggle";
      key: string;
      label: string;
      default: boolean;
      /**
       * Sim-state key watched for a live status caption under the box (the box
       * itself stays player-controlled), e.g. a light sensor reporting that the
       * world light source is on it.
       */
      liveKey?: string;
      /** the caption shown while `liveKey` is on */
      liveNote?: string;
    };

export type CompState = Record<string, number | boolean | string>;
export type CompProps = Record<string, number | boolean | string>;

/**
 * The movable light source ("the sun"): a physical lamp the player drags
 * around the canvas. A part is in direct sunlight when the beam overlaps any
 * of its footprint.
 */
export interface SunSource {
  on: boolean;
  x: number;
  y: number;
  radius: number;
}

/**
 * The movable prop ("the rock"): a physical object the player drags around the
 * canvas to push mechanical parts, e.g. tripping a limit switch's lever.
 */
export interface WorldObject {
  on: boolean;
  x: number;
  y: number;
  radius: number;
}

export interface SimEnv {
  time: number;
  /** the room's background light level, 0..1 — no light source needed */
  ambientLight: number;
  sun: SunSource;
  /** the draggable rock/object that presses mechanical sensors */
  object: WorldObject;
  temperature: number;
  distance: number;
  /**
   * The airwaves: channel -> strongest broadcast level, as it settled on the
   * previous solver pass. Parts never touch this directly — they go through
   * `broadcast()` / `receive()`, which keep the read and write sides apart the
   * same way `energized()` / `energize()` do for wired nets.
   */
  radio: Map<string, number>;
}

/** Context handed to a component during `evaluate` / `tick`. */
export interface SimContext {
  props: CompProps;
  state: CompState;
  env: SimEnv;
  /** axis-aligned world footprint of this part (for world effects like the sun) */
  bounds: { x: number; y: number; w: number; h: number };
  /**
   * Map a box-local point — the same units `draw` uses — into world space,
   * following the part's rotation. Use this instead of `bounds` whenever the
   * exact placement of a feature matters, e.g. where a lever actually sticks
   * out once the part has been turned.
   */
  toWorld(lx: number, ly: number): { x: number; y: number };
  /** The inverse of `toWorld`: a world point in this part's local units. */
  toLocal(wx: number, wy: number): { x: number; y: number };
  /** energisation level 0..1 on the net attached to `pinId` */
  energized(pinId: string): number;
  /** is the net attached to `pinId` connected to a ground source? */
  grounded(pinId: string): boolean;
  /** convenience: energised above the logic threshold */
  high(pinId: string): boolean;
  /** numeric payload travelling on the net attached to `pinId` */
  valueOf(pinId: string): number;
  /** active parts: energise the net attached to `pinId` (wired-OR max). */
  energize(pinId: string, level: number, value?: number): void;
  /**
   * Put `level` on a wireless `channel` — the over-the-air twin of `energize`.
   * Strongest transmitter wins, and nothing is broadcast during `tick`.
   */
  broadcast(channel: string, level: number): void;
  /** Strongest level on a wireless `channel` — the twin of `energized`. */
  receive(channel: string): number;
}

export interface DrawContext {
  ctx: CanvasRenderingContext2D;
  state: CompState;
  props: CompProps;
  selected: boolean;
  w: number;
  h: number;
  /** centre of the inner content area (below the title, above the sockets) */
  cx: number;
  cy: number;
  /** a sensible icon radius for the content area */
  r: number;
  theme: { text: string; dim: string; accent: string; panel: string };
  time: number;
}

export interface ComponentDef {
  id: string;
  name: string;
  /** short uppercase label shown on the green box (falls back to `name`) */
  short?: string;
  /** horizontal placement of the title along the top edge (default center) */
  titleAlign?: "left" | "center" | "right";
  category: Category;
  description: string;
  /**
   * At most one of this part per project. Used by the paired radio link, where
   * a second transmitter would just talk over the first on the same channels.
   */
  unique?: boolean;
  w: number;
  h: number;
  pins: PinDef[];
  props?: PropSpec[];
  /** optional legacy SVG glyph (palette now renders initials) */
  glyph?: string;
  /** direct user interaction on the canvas (press-and-hold vs click-to-toggle) */
  interact?: "momentary" | "toggle";
  init?: () => CompState;
  /** passive continuity: pin-id pairs that are connected when conducting */
  conductor?: (props: CompProps, state: CompState) => [string, string][];
  /** always-on sources (battery terminals, solar panel) */
  source?: (
    props: CompProps,
    state: CompState,
    env: SimEnv,
  ) => { pin: string; kind: "power" | "ground"; level: number }[];
  /**
   * Fuse/overload check. Return true if this part is in a fault condition
   * (e.g. a battery whose + terminal is shorted to ground). When it first
   * returns true the engine latches `state.blown = true` and cuts the source.
   */
  checkShort?: (c: { grounded: (pin: string) => boolean; energized: (pin: string) => number }) => boolean;
  /** combinational evaluation, iterated to a fixed point each frame */
  evaluate?: (c: SimContext) => void;
  /** stateful update once per frame (timers, counters, latches, edges) */
  tick?: (c: SimContext, dt: number) => void;
  draw: (d: DrawContext) => void;
}
