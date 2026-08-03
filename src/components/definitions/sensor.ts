import type { ComponentDef, PinDef } from "../types";
import { box, BOX_H, inSunlight, objectOnBar, objectOnRay, POWER, powered, SOCKET } from "../layout";
import { glow, roundRect, INK } from "../draw-helpers";

/** A room brighter than this reads as "light" to an ambient-mode sensor. */
const ROOM_BRIGHT = 0.5;

/**
 * The light sensor breaks the usual sockets-along-the-bottom layout: a square
 * box with its two signal outputs stacked down the left edge and the power pair
 * tucked into the bottom-right corner.
 */
const LS_SIZE = BOX_H; // square
const lightSensorPins: PinDef[] = [
  { id: "light", role: "out", x: 20, y: 42, label: "LIGHT", color: SOCKET.sig },
  { id: "dark", role: "out", x: 20, y: 66, label: "DARK", color: SOCKET.sig },
  { id: "vp", role: "in", x: 62, y: LS_SIZE - 12, label: "+", color: SOCKET.pos },
  { id: "vn", role: "in", x: 82, y: LS_SIZE - 12, label: "−", color: SOCKET.neg },
];
const lightSensor: ComponentDef = {
  id: "lightsensor",
  name: "Light Sensor",
  short: "LIGHT SENSOR",
  category: "sensor",
  description:
    "LIGHT output powers when the sensor sees light, DARK when it doesn't. It reads the room's ambient light by default; tick Direct sunlight and it reads the world light source instead, lighting up only while that beam covers part of the sensor.",
  w: LS_SIZE,
  h: LS_SIZE,
  pins: lightSensorPins,
  props: [
    {
      kind: "toggle",
      key: "sun",
      label: "Direct sunlight",
      default: false,
      liveKey: "lit",
      liveNote: "The light source is covering this sensor.",
    },
  ],
  init: () => ({ bright: 0, lit: false }),
  evaluate: (c) => {
    // Direct sunlight mode: only the world light source counts, and only while
    // its beam covers part of this sensor. Otherwise it just reads the room.
    const sunMode = c.props.sun as boolean;
    // tracked even with no power, so the beam status reads true in the panel
    c.state.lit = sunMode && inSunlight(c);
    if (!powered(c)) return void (c.state.bright = 0);
    const bright = sunMode ? (c.state.lit as boolean) : c.env.ambientLight >= ROOM_BRIGHT;
    c.state.bright = bright ? 1 : 0;
    if (bright) c.energize("light", c.energized("vp"));
    else c.energize("dark", c.energized("vp"));
  },
  draw: (d) => {
    const bright = (d.state.bright as number) > 0;
    const { ctx, cy } = d;
    // sits right of centre, clear of the LIGHT / DARK column down the left edge
    const cx = d.cx + 14;
    if (bright) glow(ctx, cx, cy, 22, "#fde047", 0.7);
    // in the beam but unpowered: a faint hint that the light is reaching it
    else if (d.state.lit) glow(ctx, cx, cy, 18, "#fde047", 0.25);
    ctx.beginPath();
    ctx.arc(cx, cy, 8, 0, Math.PI * 2);
    ctx.fillStyle = bright ? "#fde047" : INK;
    ctx.fill();
    ctx.strokeStyle = bright ? "#fde047" : INK;
    ctx.lineWidth = 2;
    for (let i = 0; i < 8; i++) {
      const a = (i * Math.PI) / 4;
      ctx.beginPath();
      ctx.moveTo(cx + Math.cos(a) * 11, cy + Math.sin(a) * 11);
      ctx.lineTo(cx + Math.cos(a) * 15, cy + Math.sin(a) * 15);
      ctx.stroke();
    }
  },
};

/**
 * The limit switch stands on end: an upright rectangle with both wires at the
 * bottom end and the rod sticking straight up out of the top.
 *
 * `LEVER` is in box-local units — the rod hinges just inside the top edge, on
 * the right of the title, and `tilt` is its angle away from vertical.
 */
const LIM_W = 84;
const LIM_H = 124;
const LEVER = { x: 56, y: 32, len: 92, tilt: 0.55 };
const limitPins: PinDef[] = [
  { id: "vp", role: "in", x: LIM_W / 2 - 16, y: LIM_H - 12, label: "+", color: SOCKET.pos },
  { id: "sig", role: "out", x: LIM_W / 2 + 16, y: LIM_H - 12, label: "SIG", color: SOCKET.sig },
];
/** Rod tip for a tilt away from upright (+ leans right, − leans left). */
const leverTip = (tilt: number) => ({
  x: LEVER.x + Math.sin(tilt) * LEVER.len,
  y: LEVER.y - Math.cos(tilt) * LEVER.len,
});

const limitSwitch: ComponentDef = {
  id: "limit",
  name: "Limit Switch",
  short: "LIMIT",
  titleAlign: "left", // the rod exits the top edge right of the title
  category: "sensor",
  description:
    "A lever micro-switch. Wire the red + to the battery +; plug the blue signal wire into an input. The rod standing up out of the box gets knocked over when something hits it, and the signal goes HIGH while it is tilted. Turn on the rock in World / Sensors and shove it into the rod, or click the box to hold the rod over by hand.",
  w: LIM_W,
  h: LIM_H,
  pins: limitPins,
  interact: "toggle",
  init: () => ({ closed: false, pressed: false, tilt: 0, dir: 1 }),
  evaluate: (c) => {
    // held over by hand (click) or knocked over by the world object. The rod
    // is tested upright so that falling over can never untrip it.
    const knocked = objectOnBar(c, LEVER.x, LEVER.y, LEVER.x, LEVER.y - LEVER.len);
    // it falls away from whatever pushed it — compared in the part's own local
    // units so the rod still falls away correctly once the part is rotated
    if (knocked) c.state.dir = c.toLocal(c.env.object.x, c.env.object.y).x < LEVER.x ? 1 : -1;
    const pressed = (c.state.closed as boolean) || knocked;
    c.state.pressed = pressed;
    if (pressed && c.energized("vp") > 0.5) c.energize("sig", c.energized("vp"));
  },
  // swing the rod over and let it spring back up instead of snapping
  tick: (c, dt) => {
    const target = c.state.pressed ? LEVER.tilt * (c.state.dir as number) : 0;
    const t = c.state.tilt as number;
    c.state.tilt = t + (target - t) * Math.min(1, dt * 18);
  },
  draw: (d) => {
    const { ctx } = d;
    const on = d.state.pressed as boolean;
    const tip = leverTip((d.state.tilt as number) ?? 0);
    const metal = on ? "#fde047" : "#c3c9ce";

    // The rod is the whole mechanism: hinged inside the top edge and standing
    // up out into the world, where something can knock it over.
    ctx.strokeStyle = metal;
    ctx.lineWidth = 5;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(LEVER.x, LEVER.y);
    ctx.lineTo(tip.x, tip.y);
    ctx.stroke();
    // roller on the end
    ctx.beginPath();
    ctx.arc(tip.x, tip.y, 6, 0, Math.PI * 2);
    ctx.fillStyle = metal;
    ctx.fill();
    ctx.strokeStyle = "#5b6169";
    ctx.lineWidth = 1.5;
    ctx.stroke();
    // hinge it swings on
    ctx.beginPath();
    ctx.arc(LEVER.x, LEVER.y, 4.5, 0, Math.PI * 2);
    ctx.fillStyle = "#2a2e33";
    ctx.fill();
    ctx.strokeStyle = "#8b9198";
    ctx.stroke();

    // state lamp, on the clear face below the hinge
    const ly = (LEVER.y + LIM_H - 24) / 2;
    if (on) glow(ctx, LIM_W / 2, ly, 20, "#fde047", 0.75);
    ctx.beginPath();
    ctx.arc(LIM_W / 2, ly, 7, 0, Math.PI * 2);
    ctx.fillStyle = on ? "#fde047" : INK;
    ctx.fill();
  },
};

/**
 * The laser is a break-beam pair in one box: the barrel pokes out of the right
 * edge and fires a beam that runs right off the edge of the screen, so the
 * player can park the rock anywhere along it to cut it.
 *
 * `BEAM_LEN` is long enough to leave the view at any zoom; the drawn beam is
 * cut short at whatever `state.reach` says is blocking it.
 */
const BEAM_LEN = 6000;
const laserBox = box([
  { id: "out", kind: "out", label: "CLEAR" },
  { id: "brk", kind: "out", label: "BREAK" },
  ...POWER,
]);
/** Muzzle in box-local units: just past the barrel, which overhangs the edge. */
const MUZZLE = { x: laserBox.w + 13, y: 46 };
const laser: ComponentDef = {
  id: "laser",
  name: "Laser",
  short: "LASER",
  titleAlign: "left", // the barrel exits the right edge, clear of the title
  category: "sensor",
  description:
    "A break-beam laser. While powered it fires a red beam out of its barrel that runs right off the edge of the screen. CLEAR is HIGH while the beam runs uninterrupted; put something in the way — turn on the rock in World / Sensors and drag it into the beam — and CLEAR drops while BREAK goes HIGH. Rotate the part with R to aim it.",
  w: laserBox.w,
  h: laserBox.h,
  pins: laserBox.pins,
  init: () => ({ on: 0, reach: BEAM_LEN, blocked: false }),
  evaluate: (c) => {
    // tracked even with no power so the beam is cut at the right place the
    // instant it lights up
    const hit = objectOnRay(c, MUZZLE.x, MUZZLE.y, MUZZLE.x + BEAM_LEN, MUZZLE.y);
    c.state.blocked = hit !== null;
    c.state.reach = hit ?? BEAM_LEN;
    if (!powered(c)) return void (c.state.on = 0);
    c.state.on = 1;
    // complementary outputs, like the light sensor's LIGHT / DARK pair
    c.energize(hit === null ? "out" : "brk", c.energized("vp"));
  },
  draw: (d) => {
    const on = (d.state.on as number) > 0;
    const { ctx, w } = d;
    const cy = MUZZLE.y;
    // barrel, overhanging the right edge so the beam clears the green box
    const g = ctx.createLinearGradient(0, cy - 9, 0, cy + 9);
    g.addColorStop(0, "#3c4147");
    g.addColorStop(0.5, "#9aa0a6");
    g.addColorStop(1, "#3c4147");
    roundRect(ctx, w - 30, cy - 9, 42, 18, 4);
    ctx.fillStyle = g;
    ctx.fill();
    ctx.strokeStyle = "#2a2e33";
    ctx.lineWidth = 1.5;
    ctx.stroke();

    if (!on) {
      // dead aperture
      ctx.beginPath();
      ctx.arc(w + 8, cy, 3, 0, Math.PI * 2);
      ctx.fillStyle = "#7f1d1d";
      ctx.fill();
      return;
    }

    const reach = (d.state.reach as number) ?? BEAM_LEN;
    const blocked = d.state.blocked as boolean;
    const x0 = MUZZLE.x;
    const x1 = x0 + reach;
    ctx.save();
    ctx.lineCap = "round";
    // haze around the beam, then the hot core
    ctx.globalAlpha = 0.28;
    ctx.strokeStyle = "#ff2d2d";
    ctx.lineWidth = 9;
    ctx.beginPath();
    ctx.moveTo(x0, cy);
    ctx.lineTo(x1, cy);
    ctx.stroke();
    ctx.globalAlpha = 1;
    ctx.strokeStyle = "#ff2d2d";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(x0, cy);
    ctx.lineTo(x1, cy);
    ctx.stroke();
    ctx.strokeStyle = "rgba(255,220,220,0.9)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(x0, cy);
    ctx.lineTo(x1, cy);
    ctx.stroke();
    ctx.restore();
    glow(ctx, x0, cy, 7, "#ff6b6b", 0.9);
    // splash where the beam lands on whatever is interrupting it
    if (blocked) glow(ctx, x1, cy, 16, "#ff2d2d", 0.95);
  },
};

export const sensorDefs: ComponentDef[] = [lightSensor, limitSwitch, laser];
