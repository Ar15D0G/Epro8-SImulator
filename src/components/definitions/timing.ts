import type { ComponentDef, PinDef } from "../types";
import { powered, SOCKET } from "../layout";
import { text, roundRect, INK } from "../draw-helpers";

// Custom footprint: IN on the left-middle, OUT opposite on the right-middle, and
// the + / − power pair tucked close together in the bottom-right corner.
const DLY_W = 104; // perfect square
const delayPins: PinDef[] = [
  { id: "in", role: "in", x: 15, y: DLY_W / 2, label: "IN", color: SOCKET.sig },
  { id: "out", role: "out", x: DLY_W - 15, y: DLY_W / 2, label: "OUT", color: SOCKET.sig },
  { id: "vp", role: "in", x: DLY_W - 33, y: DLY_W - 14, label: "+", color: SOCKET.pos },
  { id: "vn", role: "in", x: DLY_W - 15, y: DLY_W - 14, label: "−", color: SOCKET.neg },
];
const timeDelay: ComponentDef = {
  id: "delay",
  name: "Time Delay",
  short: "TIME DELAY",
  category: "timing",
  description: "Output turns on a set time after the input goes high (on-delay).",
  w: DLY_W,
  h: DLY_W,
  pins: delayPins,
  props: [{ kind: "range", key: "delay", label: "Delay", min: 0.1, max: 10, step: 0.1, default: 2, unit: "s" }],
  init: () => ({ t: 0, done: 0 }),
  tick: (c, dt) => {
    if (powered(c) && c.high("in")) c.state.t = (c.state.t as number) + dt;
    else c.state.t = 0;
    c.state.done = (c.state.t as number) >= (c.props.delay as number) ? 1 : 0;
  },
  evaluate: (c) => {
    if (powered(c) && c.state.done) c.energize("out", c.energized("vp"));
  },
  draw: (d) => {
    const done = (d.state.done as number) > 0;
    text(d.ctx, `${(d.state.t as number).toFixed(1)}s`, d.cx, d.h / 2, done ? "#fde047" : INK, 15);
  },
};

// ── 7-segment display helper ─────────────────────────────────────────────────
// Draws one red LED digit inside (x, y, w, h). `-1` draws all segments dim (off).
const SEG: Record<string, string> = {
  "0": "abcdef", "1": "bc", "2": "abged", "3": "abgcd", "4": "fgbc",
  "5": "afgcd", "6": "afgedc", "7": "abc", "8": "abcdefg", "9": "abcfgd",
};
function drawDigit(
  ctx: CanvasRenderingContext2D,
  ch: string,
  x: number,
  y: number,
  w: number,
  h: number,
): void {
  const on = "#ff2d2d";
  const off = "#2a0606";
  const t = 2; // segment thickness
  const segs: Record<string, [number, number, number, number]> = {
    a: [x + t, y, w - 2 * t, t],
    b: [x + w - t, y + t, t, h / 2 - t],
    c: [x + w - t, y + h / 2, t, h / 2 - t],
    d: [x + t, y + h - t, w - 2 * t, t],
    e: [x, y + h / 2, t, h / 2 - t],
    f: [x, y + t, t, h / 2 - t],
    g: [x + t, y + h / 2 - t / 2, w - 2 * t, t],
  };
  const active = SEG[ch] ?? "";
  for (const key of Object.keys(segs)) {
    const [sx, sy, sw, sh] = segs[key];
    ctx.fillStyle = active.includes(key) ? on : off;
    ctx.fillRect(sx, sy, sw, sh);
  }
}

// Custom footprint: UP / DOWN signal inputs stacked in a column on the left,
// the OUT (goes high at the target count) and a RESET input stacked opposite on
// the right, and the + / − power pair tucked into the bottom-right corner.
const CNT_W = 120;
const CNT_H = CNT_W; // perfect square
const cntRow1 = 52;
const cntRow2 = 74;
const cntBottomY = CNT_H - 14;
const counterPins: PinDef[] = [
  { id: "up", role: "in", x: 16, y: cntRow1, label: "UP", color: SOCKET.sig },
  { id: "down", role: "in", x: 16, y: cntRow2, label: "DOWN", color: SOCKET.sig },
  { id: "out", role: "out", x: CNT_W - 16, y: cntRow1, label: "OUT", color: SOCKET.sig },
  { id: "reset", role: "in", x: CNT_W - 16, y: cntRow2, label: "RESET", color: SOCKET.sig },
  { id: "vp", role: "in", x: CNT_W - 33, y: cntBottomY, label: "+", color: SOCKET.pos },
  { id: "vn", role: "in", x: CNT_W - 15, y: cntBottomY, label: "−", color: SOCKET.neg },
];
const counter: ComponentDef = {
  id: "counter",
  name: "Counter",
  short: "COUNTER",
  category: "timing",
  description:
    "Counts UP / DOWN pulses on a red digital display. OUT goes high once the count reaches the target (set via 'Target count'); the next UP pulse after that rolls the count back to zero. A signal on RESET clears the count at any time. Needs + / − power.",
  w: CNT_W,
  h: CNT_H,
  pins: counterPins,
  props: [{ kind: "int", key: "target", label: "Target count", min: 1, max: 99, default: 3 }],
  init: () => ({ count: 0, _up: false, _dn: false }),
  tick: (c) => {
    if (!powered(c)) return;
    const up = c.high("up");
    const dn = c.high("down");
    if (c.high("reset")) {
      c.state.count = 0;
    } else {
      if (up && !c.state._up) {
        // Once the target has been hit, the next UP pulse resets to zero.
        const cur = c.state.count as number;
        c.state.count = cur >= (c.props.target as number) ? 0 : cur + 1;
      }
      if (dn && !c.state._dn) c.state.count = Math.max(0, (c.state.count as number) - 1);
    }
    c.state._up = up;
    c.state._dn = dn;
  },
  evaluate: (c) => {
    const count = c.state.count as number;
    const hit = powered(c) && count >= (c.props.target as number);
    c.energize("out", hit ? c.energized("vp") : 0, count);
  },
  draw: (d) => {
    const count = d.state.count as number;
    const { ctx, cx } = d;
    const midY = d.h / 2; // true vertical centre of the (square) module
    // target readout across the top of the module
    text(ctx, `TARGET ${d.props.target}`, cx, 26, "#0c2f14", 8, 700);
    // square black display, centred in the box
    const bs = 46; // perfect square
    roundRect(ctx, cx - bs / 2, midY - bs / 2, bs, bs, 4);
    ctx.fillStyle = "#0a0402";
    ctx.fill();
    ctx.strokeStyle = "#000";
    ctx.lineWidth = 1.5;
    ctx.stroke();
    // 4-digit red 7-seg readout, right-aligned, leading blanks
    const digits = String(Math.min(9999, count)).padStart(4, " ");
    const dw = 8, dh = 16, gap = 2;
    const startX = cx - (dw * 4 + gap * 3) / 2;
    for (let i = 0; i < 4; i++) {
      const ch = digits[i];
      drawDigit(ctx, ch === " " ? "" : ch, startX + i * (dw + gap), midY - dh / 2, dw, dh);
    }
  },
};

// ── Sequencer ────────────────────────────────────────────────────────────────
const SEQ_STEPS = 4;
/** Armed but not running: no step lamp lit, no step output driven, waiting on T1. */
const SEQ_IDLE = -1;
const SEQ_W = 150;
const seqRowY = (i: number) => 48 + i * 26; // rows: 48, 74, 100, 126 (tighter → near-square)
const SEQ_H = seqRowY(SEQ_STEPS - 1) + 42; // 168 — extra bottom room so the power row clears the step labels
const seqBottomY = SEQ_H - 14;
const seqPins: PinDef[] = [];
for (let i = 0; i < SEQ_STEPS; i++) {
  seqPins.push({ id: `t${i + 1}`, role: "in", x: 14, y: seqRowY(i), label: `T${i + 1}`, color: SOCKET.sig });
  seqPins.push({ id: `s${i + 1}`, role: "out", x: SEQ_W - 14, y: seqRowY(i), label: `${i + 1}`, color: SOCKET.sig });
}
// power pair centred along the bottom edge
seqPins.push({ id: "vp", role: "in", x: SEQ_W / 2 - 20, y: seqBottomY, label: "+", color: SOCKET.pos });
seqPins.push({ id: "vn", role: "in", x: SEQ_W / 2 + 20, y: seqBottomY, label: "−", color: SOCKET.neg });

const sequence: ComponentDef = {
  id: "sequence",
  name: "Sequencer",
  short: "SEQUENCE",
  category: "timing",
  description:
    "4-step sequencer. Left = triggers (plug a button/signal in), right = step outputs (drive a motor etc.). It starts idle — no step running — and waits for T1 to be pressed; signalling a trigger switches to that step and stops the previous step's action. Switching the power off drops it all the way back to idle, and it stays there until a trigger is pressed afresh — a switch left closed across the power cycle won't start it. Needs + / − power.",
  w: SEQ_W,
  h: SEQ_H,
  pins: seqPins,
  init: () => ({ idx: SEQ_IDLE, _pwr: false, _t1: true, _t2: true, _t3: true, _t4: true }),
  tick: (c) => {
    // Losing power drops the run all the way back to idle — switch the battery
    // off and the box forgets where it was and sits waiting on T1 again, as it
    // does when first placed. It never resumes, and never restarts on its own.
    //
    // `_pwr` is what `evaluate` settled on last frame, not a fresh reading:
    // `tick` only ever sees the *previous* frame's energisation, which reads as
    // nothing at all for one frame whenever the nets are rebuilt around it (any
    // switch on the board flipping does that). Latching the settled answer keeps
    // a reset meaning a real power cut rather than a wiring change elsewhere.
    const wasPowered = c.state._pwr as boolean;
    c.state._pwr = false; // `evaluate` re-latches it once this frame settles
    if (!wasPowered) {
      c.state.idx = SEQ_IDLE;
      // Every trigger is marked *already seen*, not cleared. A trigger that is
      // still being held as the power comes back — a latched switch left closed,
      // a limit switch resting on its lever — has not been pressed since the
      // reset, and clearing the flags would let that standing signal read as a
      // fresh press and fire step 1 the instant the battery came on. Only a real
      // low-to-high edge, i.e. letting go and pressing again, starts the run.
      for (let i = 1; i <= SEQ_STEPS; i++) c.state[`_t${i}`] = true;
      return;
    }
    for (let i = 1; i <= SEQ_STEPS; i++) {
      const hi = c.high(`t${i}`);
      if (hi && !c.state[`_t${i}`] && i - 1 > (c.state.idx as number)) c.state.idx = i - 1;
      c.state[`_t${i}`] = hi;
    }
  },
  evaluate: (c) => {
    if (!powered(c)) return;
    c.state._pwr = true;
    const idx = c.state.idx as number;
    if (idx === SEQ_IDLE) return; // idle: powered, but driving no step
    c.energize(`s${idx + 1}`, c.energized("vp"));
  },
  draw: (d) => {
    const idx = d.state.idx as number;
    const { ctx, w } = d;
    text(ctx, "TRIG", 20, 26, "#0c2f14", 8, 700);
    text(ctx, "STEP", w - 20, 26, "#0c2f14", 8, 700);
    // Idle and powered looks the same as idle and dead unless we say so: the
    // top lamp gets a slow halo to show the box is armed and waiting on T1.
    const armed = idx === SEQ_IDLE && (d.state._pwr as boolean);
    for (let i = 0; i < SEQ_STEPS; i++) {
      const y = seqRowY(i);
      if (armed && i === 0) {
        const pulse = 0.5 + 0.5 * Math.sin(d.time * 3);
        ctx.beginPath();
        ctx.arc(w / 2, y, 9.5, 0, Math.PI * 2);
        ctx.strokeStyle = `rgba(253,224,71,${0.2 + 0.35 * pulse})`;
        ctx.lineWidth = 2;
        ctx.stroke();
      }
      ctx.beginPath();
      ctx.arc(w / 2, y, 6, 0, Math.PI * 2);
      ctx.fillStyle = i === idx ? "#fde047" : INK;
      ctx.fill();
      if (i < SEQ_STEPS - 1) {
        ctx.strokeStyle = INK;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(w / 2, y + 6);
        ctx.lineTo(w / 2, seqRowY(i + 1) - 6);
        ctx.stroke();
      }
    }
  },
};

export const timingDefs: ComponentDef[] = [timeDelay, counter, sequence];
