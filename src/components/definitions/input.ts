import type { ComponentDef, PinDef } from "../types";
import { box, powered, SOCKET, BOX_H } from "../layout";
import { roundRect, text, glow } from "../draw-helpers";

const buttonBox = box([
  { id: "vp", kind: "p+", label: "+" },
  { id: "sig", kind: "out", label: "SIG" },
]);
const pushButton: ComponentDef = {
  id: "button",
  name: "Push Button",
  short: "BUTTON",
  category: "input",
  description:
    "Momentary signal switch. Wire the red + to the battery +; plug the blue signal wire into an input. The signal goes HIGH only while the button is held.",
  w: buttonBox.w,
  h: buttonBox.h,
  pins: buttonBox.pins,
  interact: "momentary",
  init: () => ({ pressed: false }),
  // A pressed button passes its red + supply through to the blue signal wire.
  evaluate: (c) => {
    if (c.state.pressed && c.energized("vp") > 0.5) c.energize("sig", c.energized("vp"));
  },
  draw: (d) => {
    const { ctx, cx, cy } = d;
    const pressed = d.state.pressed as boolean;
    // black bezel ring
    ctx.beginPath();
    ctx.arc(cx, cy, 15, 0, Math.PI * 2);
    ctx.fillStyle = "#0b0f0c";
    ctx.fill();
    // orange dome button
    const r = pressed ? 10 : 12;
    const g = ctx.createRadialGradient(cx - 3, cy - 4, 2, cx, cy, r);
    g.addColorStop(0, pressed ? "#ff9a3d" : "#ffb457");
    g.addColorStop(1, pressed ? "#c74e10" : "#e8641a");
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fillStyle = g;
    ctx.fill();
    if (pressed) glow(ctx, cx, cy, 20, "#ff8a3d", 0.5);
  },
};

const switchBox = box([
  { id: "a", kind: "io", label: "", color: SOCKET.pos },
  { id: "b", kind: "io", label: "" },
]);
const toggleSwitch: ComponentDef = {
  id: "switch",
  name: "Toggle Switch",
  short: "SWITCH",
  category: "input",
  description: "Latching wall-style switch — click to open/close the contact.",
  w: switchBox.w,
  h: switchBox.h,
  pins: switchBox.pins,
  interact: "toggle",
  init: () => ({ closed: false }),
  conductor: (_p, s) => (s.closed ? [["a", "b"]] : []),
  draw: (d) => {
    const closed = d.state.closed as boolean;
    const { ctx, cx, cy } = d;
    // white switch plate
    roundRect(ctx, cx - 16, cy - 15, 32, 30, 5);
    ctx.fillStyle = "#e9edf0";
    ctx.fill();
    ctx.strokeStyle = "#b9c1c7";
    ctx.lineWidth = 1.5;
    ctx.stroke();
    // rocker paddle: up = OFF, down = ON
    const top = closed ? cy - 2 : cy - 12;
    const bot = closed ? cy + 12 : cy + 2;
    const grad = ctx.createLinearGradient(0, top, 0, bot);
    grad.addColorStop(0, closed ? "#c7ccd0" : "#fbfdff");
    grad.addColorStop(1, closed ? "#fbfdff" : "#c7ccd0");
    roundRect(ctx, cx - 9, top, 18, bot - top, 3);
    ctx.fillStyle = grad;
    ctx.fill();
    ctx.strokeStyle = "#9aa2a8";
    ctx.lineWidth = 1;
    ctx.stroke();
    text(ctx, closed ? "ON" : "OFF", cx, closed ? cy - 8 : cy + 8, "#6b7278", 6, 700);
  },
};

const ONOFF_W = 120;
// Custom footprint: ON/OFF inputs stacked in a column on the left, the OUT wire
// on the right, and the +/− power pins along the bottom edge.
const onoffPins: PinDef[] = [
  { id: "on", role: "in", x: 14, y: 40, label: "ON", color: SOCKET.sig },
  { id: "off", role: "in", x: 14, y: 70, label: "OFF", color: SOCKET.sig },
  { id: "out", role: "out", x: ONOFF_W - 14, y: 55, label: "OUT", color: SOCKET.sig },
  { id: "vp", role: "in", x: ONOFF_W / 2 - 16, y: BOX_H - 12, label: "+", color: SOCKET.pos },
  { id: "vn", role: "in", x: ONOFF_W / 2 + 16, y: BOX_H - 12, label: "−", color: SOCKET.neg },
];
const onOff: ComponentDef = {
  id: "onoff",
  name: "ON / OFF Latch",
  short: "ON / OFF",
  category: "input",
  description: "A pulse on ON latches the output on; a pulse on OFF latches it off.",
  w: ONOFF_W,
  h: BOX_H,
  pins: onoffPins,
  init: () => ({ on: false, _pon: false, _poff: false }),
  tick: (c) => {
    const on = c.high("on");
    const off = c.high("off");
    if (on && !c.state._pon) c.state.on = true;
    if (off && !c.state._poff) c.state.on = false;
    c.state._pon = on;
    c.state._poff = off;
  },
  evaluate: (c) => {
    if (powered(c) && c.state.on) c.energize("out", c.energized("vp"));
    c.state._lit = powered(c) && (c.state.on as boolean) ? 1 : 0;
  },
  draw: (d) => {
    const on = d.state.on as boolean;
    text(d.ctx, on ? "ON" : "OFF", d.cx, d.cy, on ? "#fde047" : "#1c5a2a", 16);
  },
};

export const inputDefs: ComponentDef[] = [pushButton, toggleSwitch, onOff];
