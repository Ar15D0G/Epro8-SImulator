import type { ComponentDef, PinDef } from "../types";
import { box, inSunlight, SOCKET, SUPPLY_VOLTS } from "../layout";
import { glow, roundRect, text, INK } from "../draw-helpers";

const batteryBox = box([
  { id: "p1", kind: "src+", label: "+" },
  { id: "n1", kind: "src-", label: "−" },
]);

const GROUNDS = [{ pin: "n1", kind: "ground" as const, level: 0 }];

const battery: ComponentDef = {
  id: "battery",
  name: "Battery",
  short: "BATTERY",
  category: "power",
  description:
    "Power pack with a fuse — press the button to switch on/off. Red = +, black = −. A dead short blows the fuse; tap to reset.",
  w: batteryBox.w,
  h: batteryBox.h,
  pins: batteryBox.pins,
  interact: "toggle",
  init: () => ({ blown: false, on: true }),
  source: (_p, s) =>
    s.on && !s.blown
      ? [{ pin: "p1", kind: "power", level: 1 }, ...GROUNDS]
      : GROUNDS,
  // fuse blows when the + terminal is connected straight to − (a dead short)
  checkShort: (c) => c.grounded("p1"),
  draw: (d) => {
    const on = d.state.on as boolean;
    const blown = d.state.blown as boolean;
    const { ctx, cx, cy, time } = d;

    // ── Blown fuse: light out, broken-fuse icon appears ──────────────────
    if (blown) {
      const tw = 34;
      const th = 14;
      const x0 = cx - tw / 2;
      const y0 = cy - th / 2;
      // metal end caps
      ctx.fillStyle = "#9aa3ad";
      roundRect(ctx, x0 - 5, y0 + 1, 6, th - 2, 1);
      ctx.fill();
      roundRect(ctx, x0 + tw - 1, y0 + 1, 6, th - 2, 1);
      ctx.fill();
      // glass tube
      roundRect(ctx, x0, y0, tw, th, 3);
      ctx.fillStyle = "rgba(255,220,150,0.16)";
      ctx.fill();
      ctx.strokeStyle = INK;
      ctx.lineWidth = 1.5;
      ctx.stroke();
      // snapped filament — a gap in the middle
      ctx.strokeStyle = "#ff5252";
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      ctx.moveTo(x0 + 2, cy);
      ctx.lineTo(cx - 6, cy + 2);
      ctx.moveTo(x0 + tw - 2, cy);
      ctx.lineTo(cx + 6, cy - 2);
      ctx.stroke();
      // spark at the break
      if (Math.sin(time * 8) > 0) {
        text(ctx, "⚡", cx, cy - 1, "#ffd54a", 12, 800);
      }
      text(ctx, "tap to reset", cx, cy + 16, "#0c2f14", 8, 700);
      return;
    }

    const btnR = 13;
    const lit = on; // fuse is valid here (blown handled above)

    // ── Red light ring around the button, lit only when powered on ───────
    if (lit) {
      const pulse = 0.5 + 0.5 * Math.sin(time * 4);
      ctx.save();
      ctx.beginPath();
      ctx.arc(cx, cy, btnR + 5, 0, Math.PI * 2);
      ctx.lineWidth = 3;
      ctx.strokeStyle = `rgba(255,44,44,${0.7 + 0.3 * pulse})`;
      ctx.shadowColor = "#ff2020";
      ctx.shadowBlur = 8 + 7 * pulse;
      ctx.stroke();
      ctx.restore();
    }

    // ── Push button ──────────────────────────────────────────────────────
    ctx.beginPath();
    ctx.arc(cx, cy, btnR, 0, Math.PI * 2);
    const g = ctx.createRadialGradient(cx - 4, cy - 4, 2, cx, cy, btnR);
    if (lit) {
      g.addColorStop(0, "#ff7b7b");
      g.addColorStop(1, "#b31217");
    } else {
      g.addColorStop(0, "#3a4048");
      g.addColorStop(1, "#171b21");
    }
    ctx.fillStyle = g;
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = INK;
    ctx.stroke();

    // power symbol (⏻) on the button face
    ctx.strokeStyle = lit ? "#fff2f2" : "#7fae8a";
    ctx.lineWidth = 1.7;
    ctx.beginPath();
    ctx.arc(cx, cy + 1, 5, -Math.PI / 2 + 0.9, -Math.PI / 2 - 0.9, false);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(cx, cy - 6);
    ctx.lineTo(cx, cy);
    ctx.stroke();
  },
};

/**
 * The solar panel is the biggest part on the board — a proper landscape array,
 * because the cells are the whole point of it — with the same + / − source pair
 * as the battery sitting on the bottom edge.
 */
const SOLAR_W = 184;
const SOLAR_H = 124;
const solarPins: PinDef[] = [
  { id: "p1", role: "out", x: SOLAR_W / 2 - 18, y: SOLAR_H - 12, label: "+", color: SOCKET.pos },
  { id: "n1", role: "out", x: SOLAR_W / 2 + 18, y: SOLAR_H - 12, label: "−", color: SOCKET.neg },
];

/** The panel is always a ground on its − terminal, however dark it is. */
const SOLAR_GROUNDS = [{ pin: "n1", kind: "ground" as const, level: 0 }];

/** Fraction of full output the cells manage on room lighting alone. */
const INDOOR_YIELD = 0.6;

/** The panel graphic and its little output readout, in box-local units. */
const PANEL = { x: 12, y: 24, w: 124, h: 68 };
const READOUT = { x: 146, y: 44, w: 30, h: 28 };

const solar: ComponentDef = {
  id: "solar",
  name: "Solar Panel",
  short: "SOLAR PANEL",
  category: "power",
  description:
    "Turns light into power — a battery with no button, wired the same way (red = +, black = −). Room light alone only gets it about a third of the way there: enough to make an LED glow, but under the level logic parts need. Turn on the light source in World / Sensors and drag it over the panel for full output. Put a Voltage Meter across the terminals to watch the reading rise and fall.",
  w: SOLAR_W,
  h: SOLAR_H,
  pins: solarPins,
  init: () => ({ level: 0, sunlit: false }),
  // `source` can't see where the light source is (no footprint), so `evaluate`
  // works the output out and this just publishes the settled figure.
  source: (_p, s) => [
    { pin: "p1", kind: "power", level: s.level as number },
    ...SOLAR_GROUNDS,
  ],
  evaluate: (c) => {
    // Direct light beats the room: the beam covering any part of the panel
    // takes it to full output, otherwise it trickles along on ambient light.
    const sunlit = inSunlight(c);
    c.state.sunlit = sunlit;
    c.state.level = sunlit ? 1 : clamp01(c.env.ambientLight * INDOOR_YIELD);
  },
  draw: (d) => {
    const level = d.state.level as number;
    const sunlit = d.state.sunlit as boolean;
    const { ctx } = d;
    const { x, y, w, h } = PANEL;

    if (level > 0.02) glow(ctx, x + w / 2, y + h / 2, 90, "#fde047", 0.12 + level * 0.3);

    // aluminium frame around the cells
    roundRect(ctx, x - 3, y - 3, w + 6, h + 6, 4);
    ctx.fillStyle = "#c3ccd4";
    ctx.fill();
    ctx.strokeStyle = "#6d7883";
    ctx.lineWidth = 1.5;
    ctx.stroke();

    // photovoltaic cells — they brighten from near-black to a live blue as the
    // panel's output climbs, so the player can see it working at a glance
    const cell = (k: number) => {
      const t = level * k;
      return `rgb(${Math.round(12 + 62 * t)},${Math.round(30 + 108 * t)},${Math.round(70 + 126 * t)})`;
    };
    const cols = 5;
    const rows = 3;
    const gap = 2.5;
    const cw = (w - gap * (cols - 1)) / cols;
    const ch = (h - gap * (rows - 1)) / rows;
    for (let r = 0; r < rows; r++) {
      for (let i = 0; i < cols; i++) {
        const px = x + i * (cw + gap);
        const py = y + r * (ch + gap);
        const g = ctx.createLinearGradient(px, py, px + cw, py + ch);
        g.addColorStop(0, cell(1));
        g.addColorStop(1, cell(0.5));
        ctx.fillStyle = g;
        ctx.fillRect(px, py, cw, ch);
        // busbars down each cell
        ctx.strokeStyle = "rgba(190,210,230,0.45)";
        ctx.lineWidth = 0.8;
        ctx.beginPath();
        ctx.moveTo(px + cw / 3, py);
        ctx.lineTo(px + cw / 3, py + ch);
        ctx.moveTo(px + (cw * 2) / 3, py);
        ctx.lineTo(px + (cw * 2) / 3, py + ch);
        ctx.stroke();
      }
    }

    // sun glint sliding across the glass while the beam is on it
    if (sunlit) {
      ctx.save();
      ctx.beginPath();
      ctx.rect(x, y, w, h);
      ctx.clip();
      const slide = ((d.time * 26) % (w + 60)) - 30;
      const g = ctx.createLinearGradient(x + slide - 18, y, x + slide + 18, y + h);
      g.addColorStop(0, "rgba(255,255,255,0)");
      g.addColorStop(0.5, "rgba(255,255,255,0.45)");
      g.addColorStop(1, "rgba(255,255,255,0)");
      ctx.fillStyle = g;
      ctx.fillRect(x, y, w, h);
      ctx.restore();
    }

    // little output readout beside the panel
    roundRect(ctx, READOUT.x, READOUT.y, READOUT.w, READOUT.h, 3);
    ctx.fillStyle = "#08160f";
    ctx.fill();
    ctx.strokeStyle = INK;
    ctx.lineWidth = 1.2;
    ctx.stroke();
    const live = level > 0.02;
    text(
      ctx,
      (level * SUPPLY_VOLTS).toFixed(1),
      READOUT.x + READOUT.w / 2,
      READOUT.y + 10,
      live ? "#5df2a0" : "#2a4a38",
      11,
      800,
    );
    text(ctx, "VOLTS", READOUT.x + READOUT.w / 2, READOUT.y + 20, "#2f6b4a", 6, 700);
  },
};

function clamp01(x: number): number {
  return x < 0 ? 0 : x > 1 ? 1 : x;
}

export const powerDefs: ComponentDef[] = [battery, solar];
