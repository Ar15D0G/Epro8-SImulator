import { JSDOM } from "jsdom";

const html = `<!DOCTYPE html><html data-theme="dark"><body>
<header id="toolbar"></header>
<div class="workspace">
<aside id="palette" class="palette"></aside>
<main class="stage"><canvas id="scene"></canvas><div id="hud" class="hud"></div></main>
<aside id="inspector" class="inspector"></aside>
</div>
<div id="dialog-root"></div>
</body></html>`;

const dom = new JSDOM(html, { url: "http://localhost/", pretendToBeVisual: true });
const { window } = dom;

// canvas 2d mock: any method is a no-op, gradients return an object
const ctxProxy = new Proxy(
  {
    createRadialGradient: () => ({ addColorStop() {} }),
    createLinearGradient: () => ({ addColorStop() {} }),
    measureText: (s) => ({ width: (s ? String(s).length : 0) * 6 }),
    canvas: {},
  },
  { get: (t, p) => (p in t ? t[p] : typeof p === "string" ? () => {} : undefined), set: () => true },
);
window.HTMLCanvasElement.prototype.getContext = () => ctxProxy;
// run a few real render frames so every component draw() is exercised
let __frames = 0;
window.requestAnimationFrame = (cb) => { if (__frames++ < 4) cb(__frames * 16); return __frames; };
window.cancelAnimationFrame = () => {};
window.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} };
window.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {} });
Object.defineProperty(window.HTMLElement.prototype, "clientWidth", { get: () => 1000 });
Object.defineProperty(window.HTMLElement.prototype, "clientHeight", { get: () => 700 });
window.HTMLCanvasElement.prototype.getBoundingClientRect = () => ({ left: 0, top: 0, width: 1000, height: 700 });

// expose globals the bundle expects
for (const k of ["window","document","navigator","location","localStorage","requestAnimationFrame","cancelAnimationFrame","ResizeObserver","HTMLElement","HTMLInputElement","getComputedStyle","history"]) {
  try { globalThis[k] = window[k]; } catch { /* read-only global (e.g. navigator) — skip */ }
}
try { globalThis.confirm = () => true; } catch {}

const mod = await import("./app-bundle.mjs");

// assertions
let fail = 0;
const ok = (n, c) => { console.log((c?"  ok  ":"FAIL  ")+n); if(!c) fail++; };
ok("palette populated", window.document.querySelectorAll("#palette .pal-item").length > 15);
ok("toolbar populated", window.document.querySelectorAll("#toolbar button").length >= 8);
ok("inspector populated", window.document.querySelector("#inspector h3") !== null);
ok("hud shows part count", /parts/.test(window.document.querySelector("#hud").textContent));
ok("Free Play banner present", /Free Play/.test(window.document.querySelector(".mode-title")?.textContent || ""));
let drawn = 0, drawErr = null;
try { drawn = mod.renderAll(ctxProxy); } catch (e) { drawErr = e; }
ok(`every component draws without error (${drawn})`, drawErr === null && drawn >= 19);
if (drawErr) console.log("   draw error:", drawErr.message);
// renderAll only covers each part's initial state; the laser's beam is drawn
// from live sim state, so exercise the lit and interrupted paths too
const laser = mod.allDefs().find((d) => d.id === "laser");
let beamErr = null;
try {
  for (const state of [{ on: 1, reach: 6000, blocked: false }, { on: 1, reach: 220, blocked: true }])
    laser.draw({
      ctx: ctxProxy, state, props: {}, selected: false,
      w: laser.w, h: laser.h, cx: laser.w / 2, cy: 46, r: 15,
      theme: { text: "#fff", dim: "#999", accent: "#22d3ee", panel: "#111" }, time: 1.2,
    });
} catch (e) { beamErr = e; }
ok("laser beam draws lit and interrupted", laser !== undefined && beamErr === null);
if (beamErr) console.log("   beam draw error:", beamErr.message);
console.log(`\n${fail ? fail+" failed" : "all UI smoke checks passed"}`);
process.exit(fail ? 1 : 0);
