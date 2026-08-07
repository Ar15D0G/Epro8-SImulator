import type { ComponentDef, SimContext, PinDef } from "../types";
import { box, powered, volts, SOCKET, BOX_H, SUPPLY_VOLTS } from "../layout";
import { glow, roundRect, text, INK } from "../draw-helpers";

/** A two-terminal load turns on only with a complete circuit (+ energised, − grounded). */
function loadLevel(c: SimContext, pos: string, neg: string): number {
  return c.grounded(neg) ? c.energized(pos) : 0;
}

const lightBox = box([
  { id: "p", kind: "in", label: "SIG" }, // blue signal input
  { id: "n", kind: "p-", label: "−" }, // black − return
]);
const light: ComponentDef = {
  id: "light",
  name: "LED Light",
  short: "LIGHT",
  category: "output",
  description: "Lights up on a signal. Wire the blue signal cable to an output and the black − back to the battery −; brightness follows the signal level.",
  w: lightBox.w,
  h: lightBox.h,
  pins: lightBox.pins,
  props: [{ kind: "color", key: "color", label: "Colour", default: "#ffdf6b" }],
  init: () => ({ on: 0 }),
  evaluate: (c) => {
    c.state.on = loadLevel(c, "p", "n");
  },
  draw: (d) => {
    const on = d.state.on as number;
    const col = d.props.color as string;
    const { ctx, cx, cy } = d;
    const glass = cy - 4;
    if (on > 0.02) glow(ctx, cx, cy - 4, 30, col, on);
    // glass bulb
    ctx.beginPath();
    ctx.arc(cx, glass, 12, 0, Math.PI * 2);
    ctx.fillStyle = on > 0.02 ? col : "#0f2a16";
    ctx.globalAlpha = on > 0.02 ? 0.55 + on * 0.45 : 1;
    ctx.fill();
    ctx.globalAlpha = 1;
    // filament
    if (on > 0.02) {
      ctx.strokeStyle = "#fff6cf";
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(cx - 4, glass + 3);
      ctx.lineTo(cx - 1, glass - 3);
      ctx.lineTo(cx + 2, glass + 3);
      ctx.lineTo(cx + 5, glass - 3);
      ctx.stroke();
    }
    // screw base
    ctx.fillStyle = INK;
    roundRect(ctx, cx - 6, glass + 9, 12, 8, 1);
    ctx.fill();
  },
};

const buzzerBox = box([
  { id: "p", kind: "p+", label: "+" },
  { id: "n", kind: "p-", label: "−" },
]);
const buzzer: ComponentDef = {
  id: "buzzer",
  name: "Buzzer",
  short: "BUZZER",
  category: "output",
  description: "Sounds a tone when powered.",
  w: buzzerBox.w,
  h: buzzerBox.h,
  pins: buzzerBox.pins,
  props: [{ kind: "range", key: "freq", label: "Tone (Hz)", min: 200, max: 2000, step: 20, default: 660 }],
  init: () => ({ on: 0 }),
  evaluate: (c) => {
    c.state.on = loadLevel(c, "p", "n");
  },
  draw: (d) => {
    const on = (d.state.on as number) > 0.5;
    const { ctx, cx, cy } = d;
    ctx.save();
    if (on) ctx.translate(Math.sin(d.time * 60) * 1, 0);
    // metallic speaker cone
    const g = ctx.createRadialGradient(cx - 4, cy - 4, 2, cx, cy, 16);
    g.addColorStop(0, "#cfd4d8");
    g.addColorStop(0.6, "#8a9096");
    g.addColorStop(1, "#3c4147");
    ctx.beginPath();
    ctx.arc(cx, cy, 16, 0, Math.PI * 2);
    ctx.fillStyle = g;
    ctx.fill();
    ctx.strokeStyle = "#2a2e33";
    ctx.lineWidth = 2;
    ctx.stroke();
    // centre dome
    ctx.beginPath();
    ctx.arc(cx, cy, 5, 0, Math.PI * 2);
    ctx.fillStyle = "#5b6167";
    ctx.fill();
    ctx.restore();
    if (on) {
      ctx.strokeStyle = "#fde047";
      ctx.lineWidth = 2;
      for (let i = 1; i <= 2; i++) {
        ctx.beginPath();
        ctx.arc(cx + 18, cy, 4 + i * 5, -0.6, 0.6);
        ctx.stroke();
      }
    }
  },
};

// Square footprint with two yellow leads and a rotor spinning in the middle.
const MOTOR_SIZE = 96;
const motorPins: PinDef[] = [
  { id: "m1", role: "inout", x: MOTOR_SIZE / 2 - 18, y: MOTOR_SIZE - 12, label: "M1", color: SOCKET.aux },
  { id: "m2", role: "inout", x: MOTOR_SIZE / 2 + 18, y: MOTOR_SIZE - 12, label: "M2", color: SOCKET.aux },
];
const motor: ComponentDef = {
  id: "motor",
  name: "Motor",
  short: "MOTOR",
  category: "output",
  description:
    "Spins when current flows between M1 and M2. Swap the leads (or use a Direction module) to reverse.",
  w: MOTOR_SIZE,
  h: MOTOR_SIZE,
  pins: motorPins,
  init: () => ({ speed: 0, angle: 0 }),
  evaluate: (c) => {
    const fwd = c.grounded("m2") ? c.energized("m1") : 0; // M1 +, M2 return
    const rev = c.grounded("m1") ? c.energized("m2") : 0; // M2 +, M1 return
    c.state.speed = fwd >= rev ? fwd : -rev;
  },
  tick: (c, dt) => {
    c.state.angle = ((c.state.angle as number) + (c.state.speed as number) * dt * 8) % (Math.PI * 2);
  },
  draw: (d) => {
    const speed = d.state.speed as number;
    const { ctx, cx, cy } = d;
    const spinning = speed !== 0;
    const R = 22;

    // circular motor housing in the middle of the square box
    const hg = ctx.createRadialGradient(cx - 6, cy - 6, 4, cx, cy, R);
    hg.addColorStop(0, "#5a6068");
    hg.addColorStop(1, "#26292e");
    ctx.beginPath();
    ctx.arc(cx, cy, R, 0, Math.PI * 2);
    ctx.fillStyle = hg;
    ctx.fill();
    ctx.strokeStyle = "#1b1f24";
    ctx.lineWidth = 2;
    ctx.stroke();

    // spinning rotor with three spokes
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(d.state.angle as number);
    ctx.strokeStyle = spinning ? "#fde047" : "#8a9096";
    ctx.lineWidth = 4;
    ctx.lineCap = "round";
    for (let i = 0; i < 3; i++) {
      ctx.rotate((Math.PI * 2) / 3);
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(0, -(R - 5));
      ctx.stroke();
    }
    // hub
    ctx.beginPath();
    ctx.arc(0, 0, 5, 0, Math.PI * 2);
    ctx.fillStyle = "#c3c9ce";
    ctx.fill();
    ctx.strokeStyle = "#2a2e33";
    ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.restore();
  },
};

const fanBox = box([
  { id: "p", kind: "p+", label: "+", color: "#22c55e" }, // green + lead
  { id: "n", kind: "p-", label: "−" }, // black − lead
]);
const fan: ComponentDef = {
  id: "fan",
  name: "Fan",
  short: "FAN",
  category: "output",
  description: "Blows air when powered.",
  w: fanBox.w,
  h: fanBox.h,
  pins: fanBox.pins,
  init: () => ({ speed: 0, angle: 0 }),
  evaluate: (c) => {
    c.state.speed = loadLevel(c, "p", "n");
  },
  tick: (c, dt) => {
    c.state.angle = ((c.state.angle as number) + (c.state.speed as number) * dt * 14) % (Math.PI * 2);
  },
  draw: (d) => {
    const s = d.state.speed as number;
    const { ctx, cx, cy } = d;
    // hub ring
    ctx.beginPath();
    ctx.arc(cx, cy, 18, 0, Math.PI * 2);
    ctx.strokeStyle = "#0b0f0c";
    ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(d.state.angle as number);
    ctx.fillStyle = "#0b0f0c";
    // 3 curved propeller blades
    for (let i = 0; i < 3; i++) {
      ctx.rotate((Math.PI * 2) / 3);
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.quadraticCurveTo(6, -10, 2, -17);
      ctx.quadraticCurveTo(-4, -12, 0, 0);
      ctx.fill();
    }
    ctx.beginPath();
    ctx.arc(0, 0, 4, 0, Math.PI * 2);
    ctx.fillStyle = "#2a2e33";
    ctx.fill();
    ctx.restore();
    if (s > 0.02) glow(ctx, cx, cy, 22, "rgba(200,230,255,0.5)", s * 0.5);
  },
};

// Square footprint with just two leads: the blue signal that switches it on and
// the black − return back to the battery.
const PUMP_SIZE = 96;
const pumpPins: PinDef[] = [
  { id: "in", role: "in", x: PUMP_SIZE / 2 - 18, y: PUMP_SIZE - 12, label: "SIG", color: SOCKET.sig },
  { id: "n", role: "in", x: PUMP_SIZE / 2 + 18, y: PUMP_SIZE - 12, label: "−", color: SOCKET.neg },
];
const airpump: ComponentDef = {
  id: "airpump",
  name: "Air Pump",
  short: "AIR PUMP",
  category: "output",
  description:
    "Pumps air out of its nozzle while it is signalled. Wire the blue signal cable to whatever should switch it on and the black − back to the battery −; like any load it needs both, and it pumps faster the harder it is driven.",
  w: PUMP_SIZE,
  h: PUMP_SIZE,
  pins: pumpPins,
  init: () => ({ on: 0, phase: 0 }),
  evaluate: (c) => {
    c.state.on = loadLevel(c, "in", "n");
  },
  tick: (c, dt) => {
    // one full piston stroke per cycle; a weaker signal pumps slower
    c.state.phase = ((c.state.phase as number) + (c.state.on as number) * dt * 2.5) % 1;
  },
  draw: (d) => {
    const on = d.state.on as number;
    const ph = d.state.phase as number;
    const { ctx, cx, cy } = d;
    const bodyL = cx - 32;
    const bodyR = cx + 10;
    const bodyT = cy - 14;
    const bodyB = cy + 16;
    const ny = cy + 1; // centre line of the bore, the nozzle and the crank

    // crank wheel driving the piston, off the left end of the barrel
    const hub = cx - 36;
    ctx.beginPath();
    ctx.arc(hub, ny, 7, 0, Math.PI * 2);
    ctx.fillStyle = on > 0.02 ? "#5b6167" : "#4b5157";
    ctx.fill();
    ctx.strokeStyle = "#2a2e33";
    ctx.lineWidth = 1.5;
    ctx.stroke();
    // crank pin, so the wheel is visibly turning
    const a = ph * Math.PI * 2;
    ctx.beginPath();
    ctx.arc(hub + Math.cos(a) * 4, ny + Math.sin(a) * 4, 2, 0, Math.PI * 2);
    ctx.fillStyle = on > 0.02 ? "#fde047" : "#8a9096";
    ctx.fill();

    // pump barrel
    const bg = ctx.createLinearGradient(0, bodyT, 0, bodyB);
    bg.addColorStop(0, "#b9bfc4");
    bg.addColorStop(0.55, "#767c82");
    bg.addColorStop(1, "#3c4147");
    roundRect(ctx, bodyL, bodyT, bodyR - bodyL, bodyB - bodyT, 6);
    ctx.fillStyle = bg;
    ctx.fill();
    ctx.strokeStyle = "#2a2e33";
    ctx.lineWidth = 1.5;
    ctx.stroke();

    // the bore, with the piston stroking along it
    const boreL = bodyL + 5;
    const boreR = bodyR - 5;
    roundRect(ctx, boreL, ny - 8, boreR - boreL, 16, 3);
    ctx.fillStyle = "#171b20";
    ctx.fill();
    const stroke = on > 0.02 ? (1 - Math.cos(a)) / 2 : 0; // parked back while off
    const pistonX = boreL + 2 + stroke * (boreR - boreL - 13);
    // connecting rod from the crank into the piston head
    ctx.strokeStyle = "#8a9096";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(hub, ny);
    ctx.lineTo(pistonX + 4, ny);
    ctx.stroke();
    roundRect(ctx, pistonX, ny - 6, 9, 12, 2);
    ctx.fillStyle = "#dfe3e6";
    ctx.fill();
    ctx.strokeStyle = "#2a2e33";
    ctx.lineWidth = 1;
    ctx.stroke();

    // outlet nozzle on the right
    ctx.fillStyle = "#4b5157";
    ctx.fillRect(bodyR - 2, ny - 5, 12, 10);
    roundRect(ctx, bodyR + 9, ny - 4, 6, 8, 2);
    ctx.fillStyle = "#8a9096";
    ctx.fill();
    const tip = bodyR + 16;

    // puffs of air leaving the nozzle, fading as they travel
    if (on > 0.02) {
      ctx.lineCap = "round";
      for (let i = 0; i < 3; i++) {
        const t = (ph + i / 3) % 1;
        ctx.globalAlpha = Math.min(1, on) * (1 - t) * 0.9;
        ctx.strokeStyle = "#dbeafe";
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(tip, ny, 3 + t * 13, -0.75, 0.75);
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
      glow(ctx, tip + 6, ny, 18, "rgba(200,230,255,0.55)", Math.min(1, on) * 0.35);
    }
  },
};

const meterBox = box([
  { id: "p", kind: "p+", label: "+" }, // red probe
  { id: "n", kind: "p-", label: "−" }, // black probe
]);
const voltmeter: ComponentDef = {
  id: "voltmeter",
  name: "Voltage Meter",
  short: "VOLT METER",
  category: "output",
  description:
    `Reads the voltage arriving on its red + probe, measured against the black − probe — so both leads have to be connected, exactly like a real meter. A healthy battery reads ${SUPPLY_VOLTS.toFixed(1)} V; anything weaker (a solar panel in room light, a dimmed signal) reads proportionally less. It draws nothing itself, so you can leave it wired in anywhere without changing the circuit.`,
  w: meterBox.w,
  h: meterBox.h,
  pins: meterBox.pins,
  props: [
    {
      kind: "toggle",
      key: "peak",
      label: "Hold highest reading",
      default: false,
    },
  ],
  init: () => ({ volts: 0, live: false, peak: 0 }),
  evaluate: (c) => {
    // A meter needs both probes: no path back to − means no reading at all,
    // rather than a misleading 0.0 V.
    const live = c.grounded("n");
    c.state.live = live;
    c.state.volts = live ? volts(c.energized("p")) : 0;
  },
  tick: (c) => {
    if (!c.props.peak) return void (c.state.peak = 0);
    c.state.peak = Math.max(c.state.peak as number, c.state.volts as number);
  },
  draw: (d) => {
    const live = d.state.live as boolean;
    const v = d.state.volts as number;
    const peak = (d.props.peak as boolean) ? (d.state.peak as number) : 0;
    const { ctx, cx, cy } = d;

    // LCD face
    const w = 76;
    const h = 34;
    roundRect(ctx, cx - w / 2, cy - h / 2, w, h, 4);
    ctx.fillStyle = "#08160f";
    ctx.fill();
    ctx.strokeStyle = INK;
    ctx.lineWidth = 1.5;
    ctx.stroke();

    // the reading — dashes while a probe is floating, so a dead lead is obvious
    text(
      ctx,
      live ? `${v.toFixed(2)} V` : "-- . -- V",
      cx,
      cy - 5,
      live ? "#5df2a0" : "#2a4a38",
      live ? 14 : 11,
      800,
    );

    // bar graph of the reading against a full supply
    const bw = w - 16;
    const bx = cx - bw / 2;
    const by = cy + 9;
    ctx.fillStyle = "#12291d";
    ctx.fillRect(bx, by, bw, 5);
    const frac = Math.min(1, v / SUPPLY_VOLTS);
    if (live && frac > 0) {
      ctx.fillStyle = frac > 0.5 ? "#5df2a0" : "#f2c94c";
      ctx.fillRect(bx, by, bw * frac, 5);
    }
    // peak-hold marker left behind by the highest reading seen
    if (peak > 0) {
      ctx.fillStyle = "#ff8a3d";
      ctx.fillRect(bx + bw * Math.min(1, peak / SUPPLY_VOLTS) - 1, by - 2, 2, 9);
    }
    if (live && v > 0.05) glow(ctx, cx, cy - 5, 26, "#5df2a0", 0.18 + frac * 0.22);
  },
};

const RAM_W = BOX_H; // square footprint (96 × 96)
// Custom footprint: the power leads sit in the bottom-right corner — red +
// to the left of the black − cable — with the blue extend-signal input
// stacked directly above the black − cable.
const ramPins: PinDef[] = [
  { id: "vp", role: "in", x: RAM_W - 33, y: BOX_H - 12, label: "+", color: SOCKET.pos }, // red +
  { id: "vn", role: "in", x: RAM_W - 15, y: BOX_H - 12, label: "−", color: SOCKET.neg }, // black −
  { id: "in", role: "in", x: RAM_W - 15, y: BOX_H - 32, label: "IN", color: SOCKET.sig }, // blue signal
];
const ram: ComponentDef = {
  id: "ram",
  name: "Linear Ram",
  short: "RAM",
  category: "output",
  description:
    "Push-rod actuator — the piston physically extends and retracts. Wire the red + and black − leads back to the battery to power it, then feed the blue IN signal to extend the rod. Drop the signal (or the power) and the spring-return pulls it back home automatically.",
  w: RAM_W,
  h: BOX_H,
  pins: ramPins,
  titleAlign: "right",
  init: () => ({ pos: 0, _dir: 0 }),
  evaluate: (c) => {
    // Single-acting: needs power (red + energised, black − grounded). A signal
    // on the blue IN drives the rod out at that level; whenever nothing is
    // driving it (no signal, or no power) the spring-return retracts it home.
    const sig = powered(c) ? c.energized("in") : 0;
    c.state._dir = sig > 0.5 ? sig : -1;
  },
  tick: (c, dt) => {
    const p = (c.state.pos as number) + (c.state._dir as number) * dt * 0.6;
    c.state.pos = p < 0 ? 0 : p > 1 ? 1 : p;
  },
  draw: (d) => {
    const pos = d.state.pos as number;
    const { ctx } = d;
    const cx = 22; // barrel sits toward the left of the box (title is top-right)
    const baseTop = 34; // top rim of the metal barrel the rod slides out of
    const bodyBot = 88; // barrel sits in the lower half of the green box
    // outer cylinder body (barrel)
    const bg = ctx.createLinearGradient(cx - 13, 0, cx + 13, 0);
    bg.addColorStop(0, "#4b5157");
    bg.addColorStop(0.5, "#b9bfc4");
    bg.addColorStop(1, "#4b5157");
    roundRect(ctx, cx - 13, baseTop, 26, bodyBot - baseTop, 5);
    ctx.fillStyle = bg;
    ctx.fill();
    ctx.strokeStyle = "#2a2e33";
    ctx.lineWidth = 1.5;
    ctx.stroke();
    // extending piston rod: retracted it hides inside the barrel,
    // powered it telescopes up and clearly out the top of the module.
    const rodLen = 16 + pos * 64; // ~64px of stroke — pokes out past the box top from ~28% on
    const rodTop = baseTop - rodLen; // negative y => above the green box
    const rg = ctx.createLinearGradient(cx - 5, 0, cx + 5, 0);
    rg.addColorStop(0, "#6b7177");
    rg.addColorStop(0.5, "#e4e8eb");
    rg.addColorStop(1, "#6b7177");
    ctx.fillStyle = rg;
    ctx.fillRect(cx - 5, rodTop, 10, baseTop + 8 - rodTop); // rod slides down into the barrel
    // rod end cap
    roundRect(ctx, cx - 8, rodTop - 5, 16, 7, 2);
    ctx.fillStyle = "#3c4147";
    ctx.fill();
  },
};

const DIR_W = 112; // square footprint
// Custom footprint: FWD / REV signal inputs stacked in a column on the left,
// the two yellow motor outputs M1 / M2 in a column on the right, and the +/−
// power pins tucked into the bottom-right corner.
const dirPins: PinDef[] = [
  { id: "fwd", role: "in", x: 15, y: 44, label: "FWD", color: SOCKET.sig },
  { id: "rev", role: "in", x: 15, y: 78, label: "REV", color: SOCKET.sig },
  { id: "m1", role: "out", x: DIR_W - 15, y: 44, label: "M1", color: SOCKET.aux },
  { id: "m2", role: "out", x: DIR_W - 15, y: 78, label: "M2", color: SOCKET.aux },
  { id: "vp", role: "in", x: DIR_W - 42, y: DIR_W - 12, label: "+", color: SOCKET.pos },
  { id: "vn", role: "in", x: DIR_W - 15, y: DIR_W - 12, label: "−", color: SOCKET.neg },
];

const direction: ComponentDef = {
  id: "direction",
  name: "Motor Direction",
  short: "DIRECTION",
  category: "output",
  description:
    "Drives a motor forwards or backwards. A signal on FWD or REV flips the polarity of M1 / M2.",
  w: DIR_W,
  h: DIR_W,
  pins: dirPins,
  init: () => ({ _f: false, _r: false }),
  // route the motor's return terminal to − depending on direction (1-frame stable)
  conductor: (_p, s) =>
    s._f ? [["m2", "vn"]] : s._r ? [["m1", "vn"]] : [],
  evaluate: (c) => {
    const f = powered(c) && c.high("fwd");
    const r = powered(c) && !f && c.high("rev");
    c.state._f = f;
    c.state._r = r;
    if (f) c.energize("m1", c.energized("vp"));
    else if (r) c.energize("m2", c.energized("vp"));
  },
  draw: (d) => {
    const rev = d.state._r as boolean;
    const fwd = d.state._f as boolean;
    const { ctx, cx, cy } = d;
    ctx.strokeStyle = fwd || rev ? "#fde047" : INK;
    ctx.lineWidth = 3;
    ctx.beginPath();
    if (rev) {
      ctx.moveTo(cx + 12, cy); ctx.lineTo(cx - 12, cy);
      ctx.moveTo(cx - 6, cy - 6); ctx.lineTo(cx - 12, cy); ctx.lineTo(cx - 6, cy + 6);
    } else {
      ctx.moveTo(cx - 12, cy); ctx.lineTo(cx + 12, cy);
      ctx.moveTo(cx + 6, cy - 6); ctx.lineTo(cx + 12, cy); ctx.lineTo(cx + 6, cy + 6);
    }
    ctx.stroke();
  },
};

export const outputDefs: ComponentDef[] = [light, buzzer, motor, fan, airpump, ram, voltmeter, direction];
