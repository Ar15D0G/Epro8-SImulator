/** Canvas renderer + pointer/keyboard interaction, bound to an Editor. */

import type { Editor, PinRef } from "@/app/editor";
import { GRID } from "@/app/editor";
import { getDef } from "@/components/registry";
import type { ComponentInstance } from "@/state/document";
import { quarterTurns, worldBounds } from "@/state/geometry";
import { readTheme, type Theme } from "./theme";
import { roundRect, glow } from "@/components/draw-helpers";

const PIN_R = 5;
/** World-space radius of the draggable light source's body. */
const SUN_R = 20;

export class Scene {
  private ctx: CanvasRenderingContext2D;
  private dpr = 1;
  private theme: Theme;
  private last = performance.now();
  private hoverPin: PinRef | null = null;
  private drag:
    | {
        kind: "move";
        id: string;
        last: { x: number; y: number };
        startClient: { x: number; y: number };
        moved: boolean;
        interactive?: "momentary" | "toggle";
        pressing: boolean;
      }
    | { kind: "pan"; last: { x: number; y: number } }
    | { kind: "wire" }
    | { kind: "sun"; grab: { x: number; y: number } }
    | { kind: "object"; grab: { x: number; y: number } }
    | null = null;
  private space = false;

  private blownSet = new Set<string>();

  constructor(
    private canvas: HTMLCanvasElement,
    private editor: Editor,
    private notify?: (msg: string) => void,
  ) {
    this.ctx = canvas.getContext("2d")!;
    this.theme = readTheme();
    this.bind();
    this.resize();
    new ResizeObserver(() => this.resize()).observe(canvas);
  }

  /** Fire a toast when a fuse newly trips. */
  private checkFuses(): void {
    const now = new Set<string>();
    for (const c of this.editor.doc.components) {
      if (c.state?.blown) {
        now.add(c.id);
        if (!this.blownSet.has(c.id))
          this.notify?.("⚠ Fuse blown — short circuit! Remove the short, then tap the battery to reset.");
      }
    }
    this.blownSet = now;
  }

  refreshTheme(): void {
    this.theme = readTheme();
  }

  private resize(): void {
    this.dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = this.canvas.clientWidth;
    const h = this.canvas.clientHeight;
    this.canvas.width = Math.floor(w * this.dpr);
    this.canvas.height = Math.floor(h * this.dpr);
  }

  start(): void {
    const loop = (t: number) => {
      const dt = Math.min((t - this.last) / 1000, 0.05);
      this.last = t;
      this.editor.sim.step(this.editor.doc, dt);
      this.checkFuses();
      this.render();
      requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
  }

  // ── rendering ──────────────────────────────────────────────────
  private render(): void {
    const { ctx, editor } = this;
    const cam = editor.camera;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    ctx.setTransform(
      cam.scale * this.dpr,
      0,
      0,
      cam.scale * this.dpr,
      cam.x * this.dpr,
      cam.y * this.dpr,
    );
    this.drawGrid();
    this.drawSunBeam();
    this.drawWires();
    this.drawComponents();
    this.drawPins();
    this.drawPendingWire();
    this.drawObject();
    this.drawSun();
  }

  /** The draggable rock — drawn over the board so it can always be grabbed. */
  private drawObject(): void {
    const o = this.editor.sim.env.object;
    if (!o.on) return;
    const { ctx } = this;
    // contact shadow
    ctx.save();
    ctx.globalAlpha = 0.3;
    ctx.beginPath();
    ctx.ellipse(o.x + 3, o.y + o.radius * 0.5, o.radius * 0.92, o.radius * 0.4, 0, 0, Math.PI * 2);
    ctx.fillStyle = "#000";
    ctx.fill();
    ctx.restore();
    // lumpy silhouette — fixed lobe radii keep the boulder's shape stable
    const lobes = [1, 0.86, 0.95, 0.8, 1.02, 0.88, 0.97, 0.83];
    const at = (i: number, k = 1) => {
      const a = (i / lobes.length) * Math.PI * 2 - 0.4;
      const r = o.radius * lobes[i % lobes.length] * k;
      return { x: o.x + Math.cos(a) * r, y: o.y + Math.sin(a) * r };
    };
    ctx.beginPath();
    for (let i = 0; i <= lobes.length; i++) {
      const p = at(i);
      if (i === 0) ctx.moveTo(p.x, p.y);
      else ctx.lineTo(p.x, p.y);
    }
    ctx.closePath();
    const g = ctx.createLinearGradient(o.x, o.y - o.radius, o.x, o.y + o.radius);
    g.addColorStop(0, "#9aa3ad");
    g.addColorStop(1, "#4a525b");
    ctx.fillStyle = g;
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = "#2f353c";
    ctx.stroke();
    // a couple of facets so it reads as stone rather than a blob
    ctx.save();
    ctx.clip();
    ctx.strokeStyle = "rgba(20,24,28,0.45)";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(o.x - o.radius, o.y - o.radius * 0.1);
    ctx.lineTo(o.x - o.radius * 0.1, o.y + o.radius * 0.25);
    ctx.lineTo(o.x + o.radius, o.y - o.radius * 0.35);
    ctx.moveTo(o.x - o.radius * 0.1, o.y + o.radius * 0.25);
    ctx.lineTo(o.x + o.radius * 0.15, o.y + o.radius);
    ctx.stroke();
    ctx.restore();
  }

  private hitObject(wx: number, wy: number): boolean {
    const o = this.editor.sim.env.object;
    return o.on && Math.hypot(wx - o.x, wy - o.y) <= o.radius;
  }

  /** The pool of light the source casts — drawn under the parts it falls on. */
  private drawSunBeam(): void {
    const sun = this.editor.sim.env.sun;
    if (!sun.on) return;
    glow(this.ctx, sun.x, sun.y, sun.radius, "#fde047", 0.28);
    const { ctx } = this;
    ctx.save();
    ctx.beginPath();
    ctx.arc(sun.x, sun.y, sun.radius, 0, Math.PI * 2);
    ctx.setLineDash([6 / this.editor.camera.scale, 6 / this.editor.camera.scale]);
    ctx.lineWidth = 1.5 / this.editor.camera.scale;
    ctx.strokeStyle = "rgba(253,224,71,0.55)";
    ctx.stroke();
    ctx.restore();
  }

  /** The sun itself — drawn last so it can always be grabbed. */
  private drawSun(): void {
    const sun = this.editor.sim.env.sun;
    if (!sun.on) return;
    const { ctx } = this;
    const t = this.editor.sim.env.time;
    glow(ctx, sun.x, sun.y, SUN_R * 2.2, "#fbbf24", 0.85);
    // rays
    ctx.save();
    ctx.strokeStyle = "#fbbf24";
    ctx.lineWidth = 3;
    ctx.lineCap = "round";
    for (let i = 0; i < 8; i++) {
      const a = (i * Math.PI) / 4 + t * 0.35;
      ctx.beginPath();
      ctx.moveTo(sun.x + Math.cos(a) * (SUN_R + 5), sun.y + Math.sin(a) * (SUN_R + 5));
      ctx.lineTo(sun.x + Math.cos(a) * (SUN_R + 12), sun.y + Math.sin(a) * (SUN_R + 12));
      ctx.stroke();
    }
    ctx.restore();
    // body
    const g = ctx.createRadialGradient(sun.x - 6, sun.y - 6, 2, sun.x, sun.y, SUN_R);
    g.addColorStop(0, "#fffbeb");
    g.addColorStop(1, "#f59e0b");
    ctx.beginPath();
    ctx.arc(sun.x, sun.y, SUN_R, 0, Math.PI * 2);
    ctx.fillStyle = g;
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = "#b45309";
    ctx.stroke();
  }

  private hitSun(wx: number, wy: number): boolean {
    const sun = this.editor.sim.env.sun;
    return sun.on && Math.hypot(wx - sun.x, wy - sun.y) <= SUN_R + 6;
  }

  private viewBounds(): { x0: number; y0: number; x1: number; y1: number } {
    const a = this.editor.toWorld(0, 0);
    const b = this.editor.toWorld(this.canvas.clientWidth, this.canvas.clientHeight);
    return { x0: a.x, y0: a.y, x1: b.x, y1: b.y };
  }

  private drawGrid(): void {
    const { ctx } = this;
    const { x0, y0, x1, y1 } = this.viewBounds();
    ctx.lineWidth = 1 / this.editor.camera.scale;
    for (let major = 0; major < 2; major++) {
      const step = major ? GRID * 5 : GRID;
      ctx.strokeStyle = major ? this.theme.gridStrong : this.theme.grid;
      ctx.beginPath();
      for (let x = Math.floor(x0 / step) * step; x < x1; x += step) {
        ctx.moveTo(x, y0);
        ctx.lineTo(x, y1);
      }
      for (let y = Math.floor(y0 / step) * step; y < y1; y += step) {
        ctx.moveTo(x0, y);
        ctx.lineTo(x1, y);
      }
      ctx.stroke();
    }
  }

  private drawComponents(): void {
    const { ctx, editor } = this;
    const time = editor.sim.env.time;
    for (const c of editor.doc.components) {
      const def = getDef(c.defId);
      if (!def) continue;
      const selected = editor.selection.has(c.id);
      ctx.save();
      this.placeCtx(c, def);

      // green box body
      ctx.save();
      ctx.shadowColor = "rgba(0,0,0,0.45)";
      ctx.shadowBlur = 10;
      ctx.shadowOffsetY = 3;
      roundRect(ctx, 0, 0, def.w, def.h, 7);
      const grad = ctx.createLinearGradient(0, 0, 0, def.h);
      grad.addColorStop(0, "#37d13f");
      grad.addColorStop(1, "#23a52c");
      ctx.fillStyle = grad;
      ctx.fill();
      ctx.restore();
      roundRect(ctx, 0, 0, def.w, def.h, 7);
      ctx.lineWidth = selected ? 3 : 1.5;
      ctx.strokeStyle = selected ? this.theme.accent : "#1a7d22";
      ctx.stroke();

      // title
      ctx.fillStyle = "#f2fff4";
      let size = 11;
      const title = (def.short ?? def.name).toUpperCase();
      ctx.font = `800 ${size}px Inter, system-ui, sans-serif`;
      while (ctx.measureText(title).width > def.w - 12 && size > 7) {
        size -= 1;
        ctx.font = `800 ${size}px Inter, system-ui, sans-serif`;
      }
      const align = def.titleAlign ?? "center";
      ctx.textAlign = align;
      ctx.textBaseline = "middle";
      const titleX = align === "right" ? def.w - 7 : align === "left" ? 7 : def.w / 2;
      ctx.fillText(title, titleX, 12);

      // inner content
      def.draw({
        ctx,
        state: c.state ?? {},
        props: c.props,
        selected,
        w: def.w,
        h: def.h,
        cx: def.w / 2,
        cy: 46,
        r: 15,
        theme: this.theme,
        time,
      });
      ctx.restore();
    }
  }

  /**
   * Move the canvas into a part's own space: the part draws itself unrotated
   * from (0, 0), and the transform spins it a quarter turn about its centre.
   */
  private placeCtx(c: ComponentInstance, def: { w: number; h: number }): void {
    const q = quarterTurns(c.rotation);
    this.ctx.translate(c.x + def.w / 2, c.y + def.h / 2);
    if (q) this.ctx.rotate((q * Math.PI) / 2);
    this.ctx.translate(-def.w / 2, -def.h / 2);
  }

  private drawPins(): void {
    const { ctx, editor } = this;
    for (const c of editor.doc.components) {
      const def = getDef(c.defId);
      if (!def) continue;
      // drawn inside the part's transform, so sockets and their labels turn
      // with the box exactly as the definition laid them out
      ctx.save();
      this.placeCtx(c, def);
      for (const pin of def.pins) {
        const x = pin.x;
        const y = pin.y;
        const energised = editor.sim.energizedAt(c.id, pin.id) > 0.5;
        const hovered =
          this.hoverPin?.comp === c.id && this.hoverPin?.pin === pin.id;
        if (pin.label) {
          ctx.fillStyle = "#0c2f14";
          ctx.font = `700 7.5px Inter, sans-serif`;
          ctx.textAlign = "center";
          ctx.textBaseline = "middle";
          ctx.fillText(pin.label, x, y - 10);
        }
        ctx.beginPath();
        ctx.arc(x, y, PIN_R + (hovered ? 2.5 : 0), 0, Math.PI * 2);
        ctx.fillStyle = pin.color ?? "#94a3b8";
        ctx.fill();
        ctx.lineWidth = (energised ? 2.5 : 1.5) / editor.camera.scale;
        ctx.strokeStyle = energised
          ? "#ffffff"
          : pin.color === "#15181d"
            ? "rgba(255,255,255,0.55)"
            : "rgba(0,0,0,0.5)";
        ctx.stroke();
      }
      ctx.restore();
    }
  }

  private drawWires(): void {
    const { ctx, editor } = this;
    const t = editor.sim.env.time;
    for (const w of editor.doc.wires) {
      const a = editor.pinAbs(w.a);
      const b = editor.pinAbs(w.b);
      if (!a || !b) continue;
      const live =
        editor.sim.energizedAt(w.a.comp, w.a.pin) > 0.5 ||
        editor.sim.energizedAt(w.b.comp, w.b.pin) > 0.5;
      const midx = (a.x + b.x) / 2;
      const midy = (a.y + b.y) / 2 + Math.min(40, Math.hypot(b.x - a.x, b.y - a.y) * 0.18);
      ctx.lineCap = "round";
      // shadow
      ctx.lineWidth = 5 / editor.camera.scale;
      ctx.strokeStyle = "rgba(0,0,0,0.35)";
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.quadraticCurveTo(midx, midy, b.x, b.y);
      ctx.stroke();
      // wire
      ctx.lineWidth = 3 / editor.camera.scale;
      ctx.strokeStyle = w.color;
      ctx.setLineDash([]);
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.quadraticCurveTo(midx, midy, b.x, b.y);
      ctx.stroke();
      if (live) {
        ctx.lineWidth = 2 / editor.camera.scale;
        ctx.strokeStyle = "rgba(255,255,255,0.9)";
        ctx.setLineDash([2 / editor.camera.scale, 8 / editor.camera.scale]);
        ctx.lineDashOffset = -t * 40;
        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.quadraticCurveTo(midx, midy, b.x, b.y);
        ctx.stroke();
        ctx.setLineDash([]);
      }
    }
  }

  private drawPendingWire(): void {
    const pw = this.editor.pendingWire;
    if (!pw) return;
    const a = this.editor.pinAbs(pw.from);
    if (!a) return;
    const { ctx } = this;
    ctx.lineWidth = 3 / this.editor.camera.scale;
    ctx.strokeStyle = pw.color;
    ctx.setLineDash([6 / this.editor.camera.scale, 5 / this.editor.camera.scale]);
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(pw.x, pw.y);
    ctx.stroke();
    ctx.setLineDash([]);
  }

  // ── interaction ────────────────────────────────────────────────
  private worldFromEvent(e: PointerEvent | WheelEvent): {
    x: number;
    y: number;
    sx: number;
    sy: number;
  } {
    const r = this.canvas.getBoundingClientRect();
    const sx = e.clientX - r.left;
    const sy = e.clientY - r.top;
    const w = this.editor.toWorld(sx, sy);
    return { x: w.x, y: w.y, sx, sy };
  }

  private bind(): void {
    const c = this.canvas;
    c.addEventListener("pointerdown", (e) => this.onDown(e));
    c.addEventListener("pointermove", (e) => this.onMove(e));
    window.addEventListener("pointerup", (e) => this.onUp(e));
    c.addEventListener("wheel", (e) => this.onWheel(e), { passive: false });
    c.addEventListener("contextmenu", (e) => e.preventDefault());
    window.addEventListener("keydown", (e) => this.onKey(e));
    window.addEventListener("keyup", (e) => {
      if (e.code === "Space") this.space = false;
    });
  }

  private hitR(): number {
    return Math.max(8, 12 / this.editor.camera.scale);
  }

  /** Is a screen point over the palette (the delete drop-zone)? */
  private overPalette(clientX: number, clientY: number): boolean {
    const pal = document.getElementById("palette");
    if (!pal) return false;
    const r = pal.getBoundingClientRect();
    return clientX >= r.left && clientX <= r.right && clientY >= r.top && clientY <= r.bottom;
  }

  private setBinHover(on: boolean): void {
    document.getElementById("palette")?.classList.toggle("delete-zone", on);
  }

  private onDown(e: PointerEvent): void {
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
    const { x, y } = this.worldFromEvent(e);
    const ed = this.editor;
    const panning = e.button === 1 || this.space || ed.tool === "pan";

    if (panning) {
      this.drag = { kind: "pan", last: { x: e.clientX, y: e.clientY } };
      this.canvas.style.cursor = "grabbing";
      return;
    }

    // the light source floats above the board — grab it before anything else
    if (this.hitSun(x, y)) {
      const sun = ed.sim.env.sun;
      this.drag = { kind: "sun", grab: { x: x - sun.x, y: y - sun.y } };
      this.canvas.style.cursor = "grabbing";
      return;
    }

    // the rock sits on top of the board too — grab it before the parts under it
    if (this.hitObject(x, y)) {
      const o = ed.sim.env.object;
      this.drag = { kind: "object", grab: { x: x - o.x, y: y - o.y } };
      this.canvas.style.cursor = "grabbing";
      return;
    }

    // pins first (wiring), works in select + wire tools
    const pin = ed.hitPin(x, y, this.hitR());
    if (pin && ed.tool !== "erase") {
      ed.startWire(pin, x, y);
      this.drag = { kind: "wire" };
      return;
    }

    const comp = ed.hitComponent(x, y);
    if (ed.tool === "erase") {
      if (comp) {
        ed.selection = new Set([comp.id]);
        ed.deleteSelection();
      } else {
        const w = ed.hitWire(x, y, this.hitR());
        if (w) ed.deleteWire(w.id);
      }
      return;
    }

    if (comp) {
      // clicking a tripped part (blown fuse) resets it
      if (comp.state?.blown) {
        ed.selection = new Set([comp.id]);
        if (ed.resetFuse(comp.id)) ed.commit();
        return;
      }
      const def = getDef(comp.defId);
      if (!ed.selection.has(comp.id)) ed.selection = new Set([comp.id]);
      // Start a move-drag for every part. A tiny movement threshold decides
      // between a click (operate the part) and a drag (move / drop-to-delete).
      this.drag = {
        kind: "move",
        id: comp.id,
        last: { x, y },
        startClient: { x: e.clientX, y: e.clientY },
        moved: false,
        interactive: def?.interact,
        pressing: false,
      };
      // momentary buttons press immediately so press-and-hold works
      if (def?.interact === "momentary") {
        ed.toggleInteract(comp.id, true);
        this.drag.pressing = true;
      }
      ed.emit();
      return;
    }

    // empty space: try wire, else clear selection
    const wire = ed.hitWire(x, y, this.hitR());
    if (wire) {
      ed.selection.clear();
      ed.emit();
      return;
    }
    ed.selection.clear();
    ed.emit();
  }

  private onMove(e: PointerEvent): void {
    const { x, y } = this.worldFromEvent(e);
    const ed = this.editor;
    if (!this.drag) {
      const overProp = this.hitSun(x, y) || this.hitObject(x, y);
      this.hoverPin = overProp ? null : ed.hitPin(x, y, this.hitR());
      this.canvas.style.cursor = overProp
        ? "grab"
        : this.hoverPin
          ? "crosshair"
          : ed.tool === "pan"
            ? "grab"
            : "default";
      return;
    }
    if (this.drag.kind === "sun") {
      const sun = ed.sim.env.sun;
      sun.x = x - this.drag.grab.x;
      sun.y = y - this.drag.grab.y;
    } else if (this.drag.kind === "object") {
      const o = ed.sim.env.object;
      o.x = x - this.drag.grab.x;
      o.y = y - this.drag.grab.y;
    } else if (this.drag.kind === "pan") {
      ed.camera.x += e.clientX - this.drag.last.x;
      ed.camera.y += e.clientY - this.drag.last.y;
      this.drag.last = { x: e.clientX, y: e.clientY };
    } else if (this.drag.kind === "move") {
      if (!this.drag.moved) {
        const dx = e.clientX - this.drag.startClient.x;
        const dy = e.clientY - this.drag.startClient.y;
        if (Math.hypot(dx, dy) <= 4) return; // below threshold → still a click
        this.drag.moved = true;
        // it became a drag: cancel any momentary press
        if (this.drag.pressing) {
          ed.toggleInteract(this.drag.id, false);
          this.drag.pressing = false;
        }
        this.drag.last = { x, y }; // avoid a jump on the first moved frame
      }
      ed.moveSelection(x - this.drag.last.x, y - this.drag.last.y);
      this.drag.last = { x, y };
      const bin = this.overPalette(e.clientX, e.clientY);
      this.setBinHover(bin);
      this.canvas.style.cursor = bin ? "not-allowed" : "grabbing";
    } else if (this.drag.kind === "wire" && ed.pendingWire) {
      ed.pendingWire.x = x;
      ed.pendingWire.y = y;
      this.hoverPin = ed.hitPin(x, y, this.hitR());
    }
  }

  private onUp(e: PointerEvent): void {
    const { x, y } = this.worldFromEvent(e);
    const ed = this.editor;
    if (!this.drag) return;
    if (this.drag.kind === "wire") {
      const pin = ed.hitPin(x, y, this.hitR());
      if (pin) ed.completeWire(pin);
      else ed.cancelWire();
    } else if (this.drag.kind === "move") {
      this.setBinHover(false);
      if (this.drag.moved) {
        if (this.drag.pressing) ed.toggleInteract(this.drag.id, false);
        if (this.overPalette(e.clientX, e.clientY)) {
          ed.deleteSelection(); // dropped on the palette → delete
        } else {
          ed.snapSelection();
          ed.commit();
        }
      } else {
        // a click (no drag): operate the part
        if (this.drag.interactive === "toggle") {
          ed.toggleInteract(this.drag.id);
          ed.commit();
        } else if (this.drag.interactive === "momentary") {
          ed.toggleInteract(this.drag.id, false); // release the press from pointerdown
          ed.commit();
        }
      }
    }
    this.drag = null;
    this.canvas.style.cursor = "default";
  }

  private onWheel(e: WheelEvent): void {
    e.preventDefault();
    const { sx, sy } = this.worldFromEvent(e);
    const cam = this.editor.camera;
    const before = this.editor.toWorld(sx, sy);
    const factor = Math.exp(-e.deltaY * 0.0015);
    cam.scale = Math.min(3, Math.max(0.3, cam.scale * factor));
    const after = this.editor.toWorld(sx, sy);
    cam.x += (after.x - before.x) * cam.scale;
    cam.y += (after.y - before.y) * cam.scale;
  }

  private onKey(e: KeyboardEvent): void {
    const target = e.target as HTMLElement;
    if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA"))
      return;
    const ed = this.editor;
    if (e.code === "Space") this.space = true;
    if (e.key === "Delete" || e.key === "Backspace") {
      ed.deleteSelection();
      e.preventDefault();
    } else if (e.key.toLowerCase() === "r" && !e.ctrlKey && !e.metaKey) {
      ed.rotateSelection(e.shiftKey ? -1 : 1); // Shift+R turns the other way
      e.preventDefault();
    } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z") {
      if (e.shiftKey) ed.redo();
      else ed.undo();
      e.preventDefault();
    } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "y") {
      ed.redo();
      e.preventDefault();
    } else if (e.key === "Escape") {
      ed.cancelWire();
      ed.selection.clear();
      ed.emit();
    }
  }

  /** World position at the middle of the visible canvas. */
  viewCentre(): { x: number; y: number } {
    return this.editor.toWorld(this.canvas.clientWidth / 2, this.canvas.clientHeight / 2);
  }

  /** Center the view on existing content (or origin). */
  frameAll(): void {
    const comps = this.editor.doc.components;
    const cam = this.editor.camera;
    if (!comps.length) {
      cam.x = this.canvas.clientWidth / 2;
      cam.y = this.canvas.clientHeight / 2;
      cam.scale = 1;
      return;
    }
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const c of comps) {
      const b = worldBounds(c, getDef(c.defId)!);
      minX = Math.min(minX, b.x);
      minY = Math.min(minY, b.y);
      maxX = Math.max(maxX, b.x + b.w);
      maxY = Math.max(maxY, b.y + b.h);
    }
    const w = maxX - minX;
    const h = maxY - minY;
    const cw = this.canvas.clientWidth;
    const ch = this.canvas.clientHeight;
    cam.scale = Math.min(2, Math.max(0.4, Math.min((cw - 120) / w, (ch - 120) / h)));
    cam.x = cw / 2 - (minX + w / 2) * cam.scale;
    cam.y = ch / 2 - (minY + h / 2) * cam.scale;
  }
}

export type { ComponentInstance };
