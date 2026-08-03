/** The right inspector: selected component properties + world environment. */

import { el, clear } from "./dom";
import type { Editor } from "@/app/editor";
import { getDef } from "@/components/registry";
import type { PropSpec } from "@/components/types";

/** The canvas view, used to drop world props where the player is looking. */
export interface ViewCentre {
  viewCentre(): { x: number; y: number };
}

export function mountInspector(
  root: HTMLElement,
  editor: Editor,
  view?: ViewCentre,
): void {
  const render = () => {
    clear(root);
    const sel = [...editor.selection];
    if (sel.length === 1) {
      const comp = editor.byId(sel[0]);
      const def = comp && getDef(comp.defId);
      if (comp && def) {
        root.appendChild(el("h3", {}, [def.name]));
        root.appendChild(el("div", { class: "sub" }, [def.description]));
        for (const spec of def.props ?? [])
          root.appendChild(propField(editor, comp.id, spec));
        if (!def.props?.length)
          root.appendChild(
            el("div", { class: "empty" }, [
              def.interact
                ? "Click the part on the canvas to operate it."
                : "This part has no adjustable settings.",
            ]),
          );
      }
    } else if (sel.length > 1) {
      root.appendChild(el("h3", {}, [`${sel.length} parts selected`]));
    } else {
      root.appendChild(el("h3", {}, ["Environment"]));
      root.appendChild(
        el("div", { class: "sub" }, [
          "Nothing selected. These sliders drive the sensors in the sandbox.",
        ]),
      );
    }
    root.appendChild(environment(editor, view));
  };
  editor.onChange(render);
  render();
}

function propField(editor: Editor, id: string, spec: PropSpec): HTMLElement {
  const comp = editor.byId(id)!;
  const set = (v: number | string | boolean, commit: boolean) => {
    comp.props[spec.key] = v;
    if (commit) editor.commit();
    else editor.emit();
  };

  if (spec.kind === "int") {
    // Precise stepper (typeable + up/down arrows) for whole-number settings
    // like the counter's target count.
    const val = comp.props[spec.key] as number;
    const clamp = (v: number) => Math.max(spec.min, Math.min(spec.max, Math.round(v)));
    const input = el("input", {
      type: "number",
      class: "num",
      min: spec.min,
      max: spec.max,
      step: 1,
      value: val,
      onchange: (e) => {
        const t = e.target as HTMLInputElement;
        const v = clamp(Number(t.value) || spec.min);
        t.value = String(v);
        set(v, true);
      },
    });
    return el("div", { class: "field" }, [
      el("div", { class: "row" }, [
        el("label", {}, [spec.label]),
        spec.unit ? el("span", { class: "val" }, [spec.unit]) : "",
      ]),
      input,
    ]);
  }

  if (spec.kind === "range") {
    const val = comp.props[spec.key] as number;
    const out = el("span", { class: "val" }, [fmt(val, spec.unit)]);
    const input = el("input", {
      type: "range",
      min: spec.min,
      max: spec.max,
      step: (spec as { step: number }).step,
      value: val,
      oninput: (e) => {
        const v = Number((e.target as HTMLInputElement).value);
        out.textContent = fmt(v, spec.unit);
        set(v, false);
      },
      onchange: () => editor.commit(),
    });
    return el("div", { class: "field" }, [
      el("div", { class: "row" }, [el("label", {}, [spec.label]), out]),
      input,
    ]);
  }

  if (spec.kind === "select") {
    const select = el("select", {
      onchange: (e) => set((e.target as HTMLSelectElement).value, true),
    });
    for (const o of spec.options) {
      const opt = el("option", { value: o.value }, [o.label]);
      if (comp.props[spec.key] === o.value) opt.selected = true;
      select.appendChild(opt);
    }
    return el("div", { class: "field" }, [el("label", {}, [spec.label]), select]);
  }

  if (spec.kind === "toggle") {
    const input = el("input", {
      type: "checkbox",
      onchange: (e) => set((e.target as HTMLInputElement).checked, true),
    });
    input.checked = comp.props[spec.key] as boolean;
    const note = el("div", { class: "sub live-note" }, []);
    const field = el("div", { class: "field" }, [
      el("label", {}, [
        input,
        el("span", { style: "margin-left:8px" }, [spec.label]),
      ]),
      note,
    ]);
    // A live key adds a status caption the world drives (e.g. the light source
    // reaching a sensor). Follow it each frame while this field is on screen.
    const liveKey = spec.liveKey;
    if (liveKey) {
      const sync = () => {
        if (!input.isConnected) return; // inspector re-rendered → stop
        note.textContent = comp.state?.[liveKey] ? (spec.liveNote ?? "") : "";
        requestAnimationFrame(sync);
      };
      requestAnimationFrame(sync); // after this field has been mounted
    }
    return field;
  }

  // color
  const colors = ["#fbbf24", "#f43f5e", "#34d399", "#22d3ee", "#a855f7", "#ffffff"];
  const wrap = el("div", { class: "swatches" });
  for (const col of colors) {
    const sw = el("div", {
      class: "swatch" + (comp.props[spec.key] === col ? " sel" : ""),
      style: `background:${col}`,
      onclick: () => {
        comp.props[spec.key] = col;
        editor.commit();
      },
    });
    wrap.appendChild(sw);
  }
  return el("div", { class: "field" }, [el("label", {}, [spec.label]), wrap]);
}

function environment(editor: Editor, view?: ViewCentre): HTMLElement {
  const env = editor.sim.env;
  const slider = (
    label: string,
    min: number,
    max: number,
    step: number,
    get: () => number,
    setv: (v: number) => void,
    unit = "",
  ) => {
    const out = el("span", { class: "val" }, [fmt(get(), unit)]);
    return el("div", { class: "field" }, [
      el("div", { class: "row" }, [el("label", {}, [label]), out]),
      el("input", {
        type: "range",
        min,
        max,
        step,
        value: get(),
        oninput: (e) => {
          const v = Number((e.target as HTMLInputElement).value);
          setv(v);
          out.textContent = fmt(v, unit);
        },
      }),
    ]);
  };
  const sunRadius = slider(
    "Beam size",
    40,
    400,
    10,
    () => env.sun.radius,
    (v) => (env.sun.radius = v),
  );
  const sunNote = el("div", { class: "sub live-note" }, [
    "Drag the sun around the canvas to shine it on sensors set to direct sunlight.",
  ]);
  const syncSun = () => {
    const on = env.sun.on;
    sunRadius.style.display = on ? "" : "none";
    sunNote.style.display = on ? "" : "none";
  };
  const sunToggle = el("input", {
    type: "checkbox",
    onchange: (e) => {
      env.sun.on = (e.target as HTMLInputElement).checked;
      // Drop it where the player is looking, so it never appears off-screen.
      if (env.sun.on && view) Object.assign(env.sun, view.viewCentre());
      syncSun();
    },
  });
  sunToggle.checked = env.sun.on;
  syncSun();

  const rockSize = slider(
    "Rock size",
    16,
    90,
    2,
    () => env.object.radius,
    (v) => (env.object.radius = v),
  );
  const rockNote = el("div", { class: "sub live-note" }, [
    "Drag the rock around the canvas to push it into things — shove it against a limit switch's rod to press it, or park it in a laser beam to break it.",
  ]);
  const syncRock = () => {
    const on = env.object.on;
    rockSize.style.display = on ? "" : "none";
    rockNote.style.display = on ? "" : "none";
  };
  const rockToggle = el("input", {
    type: "checkbox",
    onchange: (e) => {
      env.object.on = (e.target as HTMLInputElement).checked;
      // Drop it where the player is looking, so it never appears off-screen.
      if (env.object.on && view) Object.assign(env.object, view.viewCentre());
      syncRock();
    },
  });
  rockToggle.checked = env.object.on;
  syncRock();

  return el("div", { style: "margin-top:18px;border-top:1px solid var(--border);padding-top:14px" }, [
    el("div", { class: "pal-cat", style: "margin-left:0" }, ["World / Sensors"]),
    slider("Ambient light", 0, 1, 0.01, () => env.ambientLight, (v) => (env.ambientLight = v)),
    el("div", { class: "field" }, [
      el("label", {}, [sunToggle, el("span", { style: "margin-left:8px" }, ["Light source"])]),
      sunNote,
    ]),
    sunRadius,
    el("div", { class: "field" }, [
      el("label", {}, [rockToggle, el("span", { style: "margin-left:8px" }, ["Rock / object"])]),
      rockNote,
    ]),
    rockSize,
    slider("Temperature", -10, 60, 1, () => env.temperature, (v) => (env.temperature = v), "°C"),
    slider("Object distance", 2, 100, 1, () => env.distance, (v) => (env.distance = v), "cm"),
  ]);
}

function fmt(v: number, unit?: string): string {
  const n = Number.isInteger(v) ? String(v) : v.toFixed(2);
  return unit ? `${n} ${unit}` : n;
}
