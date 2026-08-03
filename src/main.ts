import "./styles/main.css";

import { Editor } from "./app/editor";
import { Scene } from "./render/canvas";
import { mountToolbar } from "./ui/toolbar";
import { mountPalette } from "./ui/palette";
import { mountInspector } from "./ui/inspector";
import { el, toast } from "./ui/dom";
import { initTheme } from "./render/theme";
import { docFromHash, loadAutosave } from "./state/persistence";
import { defaultProps, getDef } from "./components/registry";
import { emptyDoc, uid, type CircuitDoc } from "./state/document";

initTheme();

const editor = new Editor();

// Choose the initial document: share link > autosave > starter demo.
const hashDoc = docFromHash();
if (hashDoc) {
  editor.load(hashDoc);
  history.replaceState(null, "", location.pathname + location.search);
} else {
  const saved = loadAutosave();
  editor.load(saved.components.length ? saved : starter());
}

// Toolbar (needs the scene for frame/theme); create scene first.
const canvas = document.getElementById("scene") as HTMLCanvasElement;
const scene = new Scene(canvas, editor, toast);

mountToolbar(document.getElementById("toolbar")!, editor, scene);
mountPalette(document.getElementById("palette")!, editor);
mountInspector(document.getElementById("inspector")!, editor, scene);

// Mode title banner (EPro8 "Free Play" style).
const stage = document.querySelector(".stage")!;
stage.appendChild(el("div", { class: "mode-title" }, ["Free Play"]));

// HUD: live count + hint.
const hud = document.getElementById("hud")!;
const stat = el("div", { class: "chip" });
const hint = el("div", { class: "chip" }, [
  "Drag parts from the left · click sockets to wire · click switches to toggle · R rotates",
]);
hud.append(stat, hint);
const updateStat = () => {
  stat.innerHTML = `<b>${editor.doc.components.length}</b> parts · <b>${editor.doc.wires.length}</b> wires`;
};
editor.onChange(updateStat);
updateStat();

scene.start();
scene.frameAll();
// Re-centre once layout has settled, so the opening view is reliably centred
// even if the canvas hadn't been given its real size on the first paint.
requestAnimationFrame(() => scene.frameAll());

/** A friendly starter circuit: battery → switch → LED. */
function starter(): CircuitDoc {
  const doc = emptyDoc();
  const place = (defId: string, x: number, y: number) => {
    const def = getDef(defId)!;
    const inst = { id: uid("c"), defId, x, y, rotation: 0, props: defaultProps(def) };
    doc.components.push(inst);
    return inst;
  };
  const bat = place("battery", 120, 200);
  const sw = place("switch", 340, 202);
  const led = place("light", 540, 200);
  doc.wires.push(
    { id: uid("w"), a: { comp: bat.id, pin: "p1" }, b: { comp: sw.id, pin: "a" }, color: "#e23b3b" },
    { id: uid("w"), a: { comp: sw.id, pin: "b" }, b: { comp: led.id, pin: "p" }, color: "#2f7bff" },
    { id: uid("w"), a: { comp: led.id, pin: "n" }, b: { comp: bat.id, pin: "n1" }, color: "#15181d" },
  );
  return doc;
}
