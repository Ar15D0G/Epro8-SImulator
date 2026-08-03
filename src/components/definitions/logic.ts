import type { ComponentDef, SimContext, PinDef } from "../types";
import { SOCKET, powered } from "../layout";
import { INK } from "../draw-helpers";

const GATE_W = 104; // square footprint

function gate(
  id: string,
  symbol: string,
  fn: (c: SimContext) => boolean,
  unary = false,
): ComponentDef {
  // Custom footprint: signal inputs stacked in a column on the left edge, the
  // OUT on the right edge opposite them, and the + / − power pair tucked into
  // the bottom-right corner.
  const inputs: PinDef[] = unary
    ? [{ id: "a", role: "in", x: 15, y: 57, label: "IN", color: SOCKET.sig }]
    : [
        { id: "a", role: "in", x: 15, y: 42, label: "A", color: SOCKET.sig },
        { id: "b", role: "in", x: 15, y: 72, label: "B", color: SOCKET.sig },
      ];
  const pins: PinDef[] = [
    ...inputs,
    { id: "out", role: "out", x: GATE_W - 15, y: 57, label: "OUT", color: SOCKET.sig },
    { id: "vp", role: "in", x: GATE_W - 42, y: GATE_W - 12, label: "+", color: SOCKET.pos },
    { id: "vn", role: "in", x: GATE_W - 15, y: GATE_W - 12, label: "−", color: SOCKET.neg },
  ];
  return {
    id,
    name: `${symbol} Gate`,
    short: symbol,
    category: "logic",
    description: `Logic ${symbol} gate. Needs + / − power; outputs power when the ${symbol} condition is met.`,
    w: GATE_W,
    h: GATE_W,
    pins,
    glyph: `<svg viewBox="0 0 24 24"><rect x="3" y="5" width="18" height="14" rx="3" fill="#334155"/><text x="12" y="15" font-size="6" fill="#22d3ee" text-anchor="middle" font-weight="700">${symbol}</text></svg>`,
    init: () => ({ q: 0 }),
    evaluate: (c) => {
      const q = powered(c) && fn(c);
      c.state.q = q ? 1 : 0;
      if (q) c.energize("out", c.energized("vp"));
    },
    draw: (d) => {
      // The AND/NOT label lives on the title bar; the middle just shows a small
      // status dot that lights up when the gate's output is active.
      const q = (d.state.q as number) > 0;
      const { ctx, cx, cy } = d;
      ctx.beginPath();
      ctx.arc(cx, cy, 5, 0, Math.PI * 2);
      ctx.fillStyle = q ? "#fde047" : INK;
      ctx.fill();
    },
  };
}

export const logicDefs: ComponentDef[] = [
  gate("and", "AND", (c) => c.high("a") && c.high("b")),
  gate("or", "OR", (c) => c.high("a") || c.high("b")),
  gate("not", "NOT", (c) => !c.high("a"), true),
];
