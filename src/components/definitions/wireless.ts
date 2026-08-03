/**
 * The radio link: a matched transmitter / receiver pair that carries four
 * signals through the air instead of down a wire.
 *
 * Both ends are squares needing + / − power. The transmitter takes its four
 * signals in on the left edge; the receiver hands the same four back out on
 * the right edge, straight across — socket 1 in becomes socket 1 out, 2 to 2,
 * and so on. Nothing is drawn between them: the whole point is that the signal
 * crosses the board invisibly.
 *
 * Only one of each may exist per project (`unique`), so the four channels can
 * be fixed constants and always mean the same thing.
 */

import type { ComponentDef, DrawContext, PinDef } from "../types";
import { SOCKET, powered } from "../layout";
import { INK, INK_DIM, glow } from "../draw-helpers";

/** Square footprint, roomy enough for a column of four plus the power pair. */
const BOX = 120;

/** The four signal sockets, top to bottom. */
const CHANNELS = [1, 2, 3, 4] as const;

/** Airwave keys. Fixed names are safe because the pair is unique per project. */
const channelKey = (n: number) => `link:${n}`;

/** Vertical positions of the signal column, shared by both ends. */
const ROW_Y = [32, 52, 72, 92];

/** Sim-state key holding the level of channel `n` (0..1), read by `draw`. */
const stateKey = (n: number) => `ch${n}`;

/**
 * Build one end of the link. `side` is where the signal sockets live, so the
 * power pair goes in the opposite bottom corner, clear of the column.
 */
function radioEnd(side: "left" | "right"): PinDef[] {
  const left = side === "left";
  const sigX = left ? 15 : BOX - 15;
  const powX = left ? [BOX - 42, BOX - 15] : [15, 42];
  const signals: PinDef[] = CHANNELS.map((n, i) => ({
    id: `s${n}`,
    role: left ? "in" : "out",
    x: sigX,
    y: ROW_Y[i],
    label: String(n),
    color: SOCKET.sig,
  }));
  return [
    ...signals,
    { id: "vp", role: "in", x: powX[0], y: BOX - 12, label: "+", color: SOCKET.pos },
    { id: "vn", role: "in", x: powX[1], y: BOX - 12, label: "−", color: SOCKET.neg },
  ];
}

/**
 * The aerial and its four channel lamps.
 *
 * The mast sits on the side away from the sockets and its waves fan out in the
 * direction of travel — the transmitter throws to its right, the receiver
 * catches from its left — so a transmitter placed left of a receiver reads as
 * one continuous signal path across the board.
 */
function drawEnd(d: DrawContext, kind: "tx" | "rx"): void {
  const { ctx, time } = d;
  const tx = kind === "tx";
  const ax = tx ? 76 : 44; // mast x — opposite the signal column
  const ay = 34; // tip of the mast
  const dir = tx ? 1 : -1; // which way the waves fan out
  const lampX = tx ? 32 : BOX - 32;

  const live = CHANNELS.some((n) => (d.state[stateKey(n)] as number) > 0.5);

  // mast + base
  ctx.lineCap = "round";
  ctx.strokeStyle = live ? INK : INK_DIM;
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(ax, ay);
  ctx.lineTo(ax, 80);
  ctx.stroke();
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  ctx.moveTo(ax - 9, 88);
  ctx.lineTo(ax, 80);
  ctx.lineTo(ax + 9, 88);
  ctx.stroke();

  // waves: three arcs sweeping outward on a loop while the link is carrying
  const radii = [11, 17, 23];
  radii.forEach((r, i) => {
    // each arc brightens in turn, so the set reads as movement away from the
    // mast (transmitter) or toward it (receiver)
    const phase = (time * 1.6 + (tx ? -i : i) * 0.33) % 1;
    const pulse = live ? 0.35 + 0.65 * (1 - Math.abs(phase * 2 - 1)) : 0;
    ctx.strokeStyle = live ? `rgba(253,224,71,${0.25 + 0.75 * pulse})` : INK_DIM;
    ctx.lineWidth = live ? 2.4 : 1.6;
    ctx.beginPath();
    const a = tx ? 0 : Math.PI;
    ctx.arc(ax + dir * 2, ay, r, a - 0.55, a + 0.55);
    ctx.stroke();
  });

  if (live) glow(ctx, ax + dir * 12, ay, 26, "#fde047", 0.5);

  // tip
  ctx.beginPath();
  ctx.arc(ax, ay, 3.5, 0, Math.PI * 2);
  ctx.fillStyle = live ? "#fde047" : INK;
  ctx.fill();

  // one lamp beside each socket, so the player can see channel 3 light up at
  // both ends of the link
  CHANNELS.forEach((n, i) => {
    const on = (d.state[stateKey(n)] as number) > 0.5;
    ctx.beginPath();
    ctx.arc(lampX, ROW_Y[i], 3.5, 0, Math.PI * 2);
    ctx.fillStyle = on ? "#fde047" : INK_DIM;
    ctx.fill();
  });
}

const transmitter: ComponentDef = {
  id: "radio-tx",
  name: "Radio Transmitter",
  short: "RADIO TX",
  category: "wireless",
  description:
    "Sends four signals over the air. Needs + / − power; whatever you feed into sockets 1–4 comes out of the matching socket on the receiver.",
  unique: true,
  w: BOX,
  h: BOX,
  pins: radioEnd("left"),
  init: () => ({ ch1: 0, ch2: 0, ch3: 0, ch4: 0 }),
  evaluate: (c) => {
    const on = powered(c);
    for (const n of CHANNELS) {
      const level = on ? c.energized(`s${n}`) : 0;
      c.state[stateKey(n)] = level;
      if (level > 0.5) c.broadcast(channelKey(n), level);
    }
  },
  draw: (d) => drawEnd(d, "tx"),
};

const receiver: ComponentDef = {
  id: "radio-rx",
  name: "Radio Receiver",
  short: "RADIO RX",
  category: "wireless",
  description:
    "Picks up the transmitter's four signals. Needs + / − power; each socket 1–4 outputs power while the matching socket on the transmitter is live.",
  unique: true,
  w: BOX,
  h: BOX,
  pins: radioEnd("right"),
  init: () => ({ ch1: 0, ch2: 0, ch3: 0, ch4: 0 }),
  evaluate: (c) => {
    const on = powered(c);
    // The receiver drives its outputs from its *own* supply — it is repeating
    // the transmitter's signal, not passing the transmitter's power through.
    const supply = c.energized("vp");
    for (const n of CHANNELS) {
      const level = on ? c.receive(channelKey(n)) : 0;
      c.state[stateKey(n)] = level;
      if (level > 0.5) c.energize(`s${n}`, supply);
    }
  },
  draw: (d) => drawEnd(d, "rx"),
};

export const wirelessDefs: ComponentDef[] = [transmitter, receiver];
