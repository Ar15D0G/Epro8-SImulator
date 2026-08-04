/* Headless verification of the simulation core (no DOM). */
import { Simulator } from "@/engine/simulator";
import { allDefs, getDef, defaultProps } from "@/components/registry";
import { emptyDoc, uid, type CircuitDoc } from "@/state/document";
import { localToWorld, worldBounds, worldToLocal } from "@/state/geometry";
import { SUPPLY_VOLTS } from "@/components/layout";

let pass = 0;
let fail = 0;
function check(name: string, cond: boolean) {
  if (cond) { pass++; console.log("  ok  " + name); }
  else { fail++; console.log("FAIL  " + name); }
}

function place(doc: CircuitDoc, defId: string) {
  const def = getDef(defId)!;
  const inst = {
    id: uid("c"), defId, x: 0, y: 0, rotation: 0,
    props: defaultProps(def), state: def.init ? def.init() : {},
  };
  doc.components.push(inst);
  return inst;
}
function wire(doc: CircuitDoc, a: any, ap: string, b: any, bp: string) {
  doc.wires.push({ id: uid("w"), a: { comp: a.id, pin: ap }, b: { comp: b.id, pin: bp }, color: "#fff" });
}
/** Wire a block's + / − power sockets back to the battery. */
function power(doc: CircuitDoc, bat: any, comp: any) {
  wire(doc, bat, "p1", comp, "vp");
  wire(doc, bat, "n1", comp, "vn");
}
function run(doc: CircuitDoc, sim: Simulator, frames = 20) {
  for (let i = 0; i < frames; i++) sim.step(doc, 1 / 60);
}

// 1. battery -> switch -> light, complete circuit + return
{
  const doc = emptyDoc();
  const sim = new Simulator();
  const bat = place(doc, "battery");
  const sw = place(doc, "switch");
  const led = place(doc, "light");
  wire(doc, bat, "p1", sw, "a");
  wire(doc, sw, "b", led, "p");
  wire(doc, led, "n", bat, "n1");
  run(doc, sim);
  check("LED off while switch open", (led.state!.on as number) < 0.5);
  sw.state!.closed = true;
  run(doc, sim);
  check("LED on when switch closed", (led.state!.on as number) > 0.5);
  doc.wires = doc.wires.filter((w) => !((w.a.comp === led.id && w.a.pin === "n") || (w.b.comp === led.id && w.b.pin === "n")));
  run(doc, sim);
  check("LED off without ground return", (led.state!.on as number) < 0.5);
}

// 2. AND / OR gates (now require power)
for (const [gate, ta, tb, expect] of [
  ["and", true, true, true], ["and", true, false, false],
  ["and", false, false, false],
  ["or", true, false, true], ["or", false, false, false],
  ["or", true, true, true],
] as const) {
  const doc = emptyDoc();
  const sim = new Simulator();
  const bat = place(doc, "battery");
  const s1 = place(doc, "switch");
  const s2 = place(doc, "switch");
  const g = place(doc, gate);
  const led = place(doc, "light");
  power(doc, bat, g);
  wire(doc, bat, "p1", s1, "a"); wire(doc, s1, "b", g, "a");
  wire(doc, bat, "p1", s2, "a"); wire(doc, s2, "b", g, "b");
  wire(doc, g, "out", led, "p"); wire(doc, led, "n", bat, "n1");
  s1.state!.closed = ta as boolean; s2.state!.closed = tb as boolean;
  run(doc, sim);
  check(`${gate}(${ta},${tb}) => ${expect}`, ((led.state!.on as number) > 0.5) === expect);
}
{
  const doc = emptyDoc(); const sim = new Simulator();
  const bat = place(doc, "battery"); const not = place(doc, "not"); const led = place(doc, "light");
  power(doc, bat, not);
  wire(doc, not, "out", led, "p"); wire(doc, led, "n", bat, "n1");
  run(doc, sim);
  check("NOT(low) => high (LED on)", (led.state!.on as number) > 0.5);
}
{
  const doc = emptyDoc(); const sim = new Simulator();
  const bat = place(doc, "battery"); const not = place(doc, "not"); const led = place(doc, "light");
  // no power to the gate -> must be dead
  wire(doc, not, "out", led, "p"); wire(doc, led, "n", bat, "n1");
  run(doc, sim);
  check("Unpowered gate does nothing", (led.state!.on as number) < 0.5);
}

// 3. Counter counts UP to target, drives OUT high, and RESET clears it
{
  const doc = emptyDoc(); const sim = new Simulator();
  const bat = place(doc, "battery");
  const btn = place(doc, "button");
  const rst = place(doc, "switch");
  const cnt = place(doc, "counter"); cnt.props.target = 3;
  const led = place(doc, "light");
  power(doc, bat, cnt);
  wire(doc, bat, "p1", btn, "vp"); wire(doc, btn, "sig", cnt, "up");
  wire(doc, bat, "p1", rst, "a"); wire(doc, rst, "b", cnt, "reset");
  wire(doc, cnt, "out", led, "p"); wire(doc, led, "n", bat, "n1");
  run(doc, sim, 3);
  check("Counter OUT low before target", (led.state!.on as number) < 0.5);
  for (let i = 0; i < 3; i++) { btn.state!.pressed = true; run(doc, sim, 3); btn.state!.pressed = false; run(doc, sim, 3); }
  check("Counter counted 3 pulses", cnt.state!.count === 3);
  check("Counter OUT high at target lights LED", (led.state!.on as number) > 0.5);
  // RESET clears the count and drops OUT back low
  rst.state!.closed = true;
  run(doc, sim, 3);
  check("Counter RESET clears the count", cnt.state!.count === 0);
  check("Counter OUT low after reset", (led.state!.on as number) < 0.5);
  // Once the target is hit, the next UP pulse resets the count to zero
  rst.state!.closed = false;
  cnt.state!.count = cnt.props.target as number; // sitting on the target
  btn.state!.pressed = true; run(doc, sim, 3); btn.state!.pressed = false; run(doc, sim, 3);
  check("Counter resets to 0 on UP pulse at target", cnt.state!.count === 0);
}

// 4. Laser fires a long beam: CLEAR while it runs, BREAK once the rock cuts it
{
  const doc = emptyDoc(); const sim = new Simulator();
  const bat = place(doc, "battery");
  const laser = place(doc, "laser");
  const led = place(doc, "light");      // on CLEAR
  const alarm = place(doc, "light");    // on BREAK
  power(doc, bat, laser);
  wire(doc, laser, "out", led, "p"); wire(doc, led, "n", bat, "n1");
  wire(doc, laser, "brk", alarm, "p"); wire(doc, alarm, "n", bat, "n1");
  run(doc, sim);
  check("Laser powers its CLEAR (LED on)", (led.state!.on as number) > 0.5);
  check("Laser BREAK low with nothing in the beam", (alarm.state!.on as number) < 0.5);
  // the beam leaves the box to the right, at y = 46 in an unrotated part
  const rock = sim.env.object;
  rock.on = true; rock.radius = 34;
  rock.x = 500; rock.y = 400; // well off the beam
  run(doc, sim);
  check("Rock beside the beam does not break it", (led.state!.on as number) > 0.5);
  rock.y = 46; // straight into the beam, far from the box
  run(doc, sim);
  check("Rock in the beam drops CLEAR", (led.state!.on as number) < 0.5);
  check("Rock in the beam raises BREAK", (alarm.state!.on as number) > 0.5);
  check("Beam is cut short at the rock", (laser.state!.reach as number) < 500 - 34);
  // it reaches far past the box when nothing is in the way
  rock.on = false;
  run(doc, sim);
  check("Uninterrupted beam runs off-screen", (laser.state!.reach as number) > 2000);
}

// 5. Limit switch passes its + through to SIG while the lever is tilted
{
  const doc = emptyDoc(); const sim = new Simulator();
  const bat = place(doc, "battery");
  const lim = place(doc, "limit");
  const led = place(doc, "light");
  wire(doc, bat, "p1", lim, "vp"); wire(doc, lim, "sig", led, "p"); wire(doc, led, "n", bat, "n1");
  run(doc, sim);
  check("Limit switch open → LED off", (led.state!.on as number) < 0.5);
  lim.state!.closed = true;
  run(doc, sim);
  check("Limit switch pressed → LED on", (led.state!.on as number) > 0.5);
  lim.state!.closed = false;
  run(doc, sim);
  check("Limit switch released → LED off", (led.state!.on as number) < 0.5);

  // 5b. the world object (the rock) trips the lever by touching its rod
  sim.env.object = { on: true, x: 600, y: 600, radius: 34 };
  run(doc, sim);
  check("Rock away from the lever → LED off", (led.state!.on as number) < 0.5);
  // the rod stands upright out of the top of the box, which sits at (0,0)
  sim.env.object.x = 86; sim.env.object.y = -10;
  run(doc, sim);
  check("Rock pushed into the rod → LED on", (led.state!.on as number) > 0.5);
  check("Rod falls away from the rock", (lim.state!.tilt as number) < -0.3);
  sim.env.object.on = false;
  run(doc, sim);
  check("Rock switched off → LED off", (led.state!.on as number) < 0.5);

  // 5c. rotating the part carries its lever with it: a quarter turn clockwise
  // swings the upright rod round to point right, so the rock has to move too
  lim.rotation = 90;
  sim.env.object.on = true;
  sim.env.object.x = 86; sim.env.object.y = -10;
  run(doc, sim);
  check("Rotated: rock at the old rod position misses", (led.state!.on as number) < 0.5);
  sim.env.object.x = 150; sim.env.object.y = 100;
  run(doc, sim);
  check("Rotated: rock at the turned rod trips it", (led.state!.on as number) > 0.5);
}

// 5d. placement maths: rotation turns a part about its own centre
{
  const def = getDef("limit")!;
  const at = (rotation: number) => ({ x: 200, y: 100, rotation });
  const centre = { x: 200 + def.w / 2, y: 100 + def.h / 2 };
  for (const rotation of [0, 90, 180, 270]) {
    const c = at(rotation);
    const b = worldBounds(c, def);
    const same =
      Math.abs(b.x + b.w / 2 - centre.x) < 1e-9 && Math.abs(b.y + b.h / 2 - centre.y) < 1e-9;
    check(`Rotation ${rotation}° keeps the part centred`, same);
    const turned = rotation % 180 !== 0;
    check(`Rotation ${rotation}° footprint ${turned ? "swaps" : "keeps"} w/h`,
      b.w === (turned ? def.h : def.w) && b.h === (turned ? def.w : def.h));
    // every pin must survive a world round-trip back to its authored spot
    const exact = def.pins.every((p) => {
      const w = localToWorld(c, def, p.x, p.y);
      const l = worldToLocal(c, def, w.x, w.y);
      return Math.abs(l.x - p.x) < 1e-9 && Math.abs(l.y - p.y) < 1e-9;
    });
    check(`Rotation ${rotation}° pin positions round-trip`, exact);
  }
  // a quarter turn clockwise sends a downward pin offset out to the left
  const bottom = localToWorld(at(90), def, def.w / 2, def.h);
  check("Rotation 90° moves the bottom edge to the left", bottom.x < centre.x && Math.abs(bottom.y - centre.y) < 1e-9);
}

// 6. Motor direction via Direction module (FWD / REV inputs)
{
  const doc = emptyDoc(); const sim = new Simulator();
  const bat = place(doc, "battery");
  const fsw = place(doc, "switch");
  const rsw = place(doc, "switch");
  const dir = place(doc, "direction");
  const mot = place(doc, "motor");
  power(doc, bat, dir);
  wire(doc, bat, "p1", fsw, "a"); wire(doc, fsw, "b", dir, "fwd");
  wire(doc, bat, "p1", rsw, "a"); wire(doc, rsw, "b", dir, "rev");
  wire(doc, dir, "m1", mot, "m1"); wire(doc, dir, "m2", mot, "m2");
  fsw.state!.closed = true;
  run(doc, sim);
  check("Motor runs forward on FWD signal", (mot.state!.speed as number) > 0.5);
  fsw.state!.closed = false; rsw.state!.closed = true;
  run(doc, sim);
  check("Motor reverses on REV signal", (mot.state!.speed as number) < -0.5);
}

// 6b. Linear Ram: powered by its red + / black − leads, extends on the blue IN
// signal, and spring-returns (retracts) automatically when the signal drops.
{
  const doc = emptyDoc(); const sim = new Simulator();
  const bat = place(doc, "battery");
  const sw = place(doc, "switch");
  const ram = place(doc, "ram");
  power(doc, bat, ram); // red + and black − back to the battery
  wire(doc, bat, "p1", sw, "a"); wire(doc, sw, "b", ram, "in"); // blue signal
  run(doc, sim, 5);
  check("Ram idle stays at 0 (no NaN)", ram.state!.pos === 0);
  sw.state!.closed = true;
  run(doc, sim, 60);
  check("Ram extends on IN signal", (ram.state!.pos as number) > 0.3);
  sw.state!.closed = false;
  run(doc, sim, 120);
  check("Ram auto-retracts when signal drops", (ram.state!.pos as number) < 0.05);
  // no return path (black − not grounded) means the ram can't move at all
  const ram2 = place(doc, "ram");
  const sw2 = place(doc, "switch");
  wire(doc, bat, "p1", ram2, "vp"); // red + only, black − left floating
  wire(doc, bat, "p1", sw2, "a"); wire(doc, sw2, "b", ram2, "in");
  sw2.state!.closed = true;
  run(doc, sim, 60);
  check("Ram won't move without power", ram2.state!.pos === 0);
}

// 8. Fuse blows on a short circuit and cuts power
{
  const doc = emptyDoc(); const sim = new Simulator();
  const bat = place(doc, "battery");
  const led = place(doc, "light");
  wire(doc, bat, "p1", led, "p"); wire(doc, led, "n", bat, "n1");
  run(doc, sim);
  check("LED lit before short", (led.state!.on as number) > 0.5);
  const shortWire = { id: uid("w"), a: { comp: bat.id, pin: "p1" }, b: { comp: bat.id, pin: "n1" }, color: "#f00" };
  doc.wires.push(shortWire);
  run(doc, sim);
  check("Fuse blows on dead short", bat.state!.blown === true);
  check("Power cut while fuse blown", (led.state!.on as number) < 0.5);
  // remove short; fuse stays blown until reset
  doc.wires = doc.wires.filter((w) => w !== shortWire);
  run(doc, sim);
  check("Fuse latched until reset", bat.state!.blown === true && (led.state!.on as number) < 0.5);
  bat.state!.blown = false; // simulate clicking the battery
  run(doc, sim);
  check("Power restored after reset", (led.state!.on as number) > 0.5);
}

// 7. Light sensor LIGHT / DARK outputs
{
  const doc = emptyDoc(); const sim = new Simulator();
  const bat = place(doc, "battery");
  const ls = place(doc, "lightsensor");
  const led = place(doc, "light");
  power(doc, bat, ls);
  wire(doc, ls, "light", led, "p"); wire(doc, led, "n", bat, "n1");
  // parts are placed at the origin, so the sensor's box is (0,0)-(w,h)
  const def = getDef("lightsensor")!;
  const lit = () => (led.state!.on as number) > 0.5;

  // a) ambient mode (Direct sunlight unticked): the room decides, no light source
  sim.env.ambientLight = 0.9;
  run(doc, sim);
  check("Ambient mode: LIGHT output on in a bright room", lit());
  sim.env.ambientLight = 0.1;
  run(doc, sim);
  check("Ambient mode: LIGHT output off in a dark room", !lit());
  sim.env.sun = { on: true, x: def.w / 2, y: def.h / 2, radius: 100 };
  run(doc, sim);
  check("Ambient mode ignores the light source sitting on it", !lit());
  check("Ambient mode leaves the beam status off", ls.state!.lit === false);

  // b) direct sunlight mode: only the beam counts, the room is ignored
  ls.props.sun = true;
  sim.env.sun.on = false;
  sim.env.ambientLight = 1;
  run(doc, sim);
  check("Sunlight mode: dark with no light source, however bright the room", !lit());

  // beam right over the middle of the part
  sim.env.sun = { on: true, x: def.w / 2, y: def.h / 2, radius: 100 };
  run(doc, sim);
  check("Light source over the sensor lights it", lit());
  check("Light source sets the sensor's beam status", ls.state!.lit === true);

  // beam centred off the part but still washing over its right edge:
  // 40 past the edge with a radius of 60 → covers part of the box
  sim.env.sun = { on: true, x: def.w + 40, y: def.h / 2, radius: 60 };
  run(doc, sim);
  check("Beam covering only the edge of the sensor still lights it", lit());

  // same beam, just short of the corner: nearest point is (w,h), 50/50 away
  sim.env.sun = { on: true, x: def.w + 50, y: def.h + 50, radius: 60 };
  run(doc, sim);
  check("Beam near the corner but not touching it leaves the sensor dark", !lit());

  // dragged well away
  sim.env.sun = { on: true, x: def.w + 400, y: def.h / 2, radius: 60 };
  run(doc, sim);
  check("Light source dragged away leaves the sensor dark", !lit());
  check("Beam status clears when the light source leaves", ls.state!.lit === false);

  // switched off from the sidebar, even while sitting on the sensor
  sim.env.sun = { on: false, x: def.w / 2, y: def.h / 2, radius: 100 };
  run(doc, sim);
  check("Light source switched off leaves the sensor dark", !lit());
}

// 10. Solar panel: light in, power out — no button, no fuse
{
  const doc = emptyDoc(); const sim = new Simulator();
  const sol = place(doc, "solar");
  const led = place(doc, "light");
  wire(doc, sol, "p1", led, "p"); wire(doc, led, "n", sol, "n1");
  const def = getDef("solar")!;
  const out = () => led.state!.on as number;

  sim.env.ambientLight = 0;
  run(doc, sim);
  check("Solar panel makes nothing in the dark", out() < 0.02);

  // the room alone gives a weak trickle — visible, but under the logic threshold
  sim.env.ambientLight = 0.7;
  run(doc, sim);
  check("Room light gives a weak output", out() > 0.05 && out() < 0.5);

  // light source parked over the panel takes it to full output
  sim.env.sun = { on: true, x: def.w / 2, y: def.h / 2, radius: 100 };
  run(doc, sim);
  check("Light source over the panel gives full output", out() > 0.99);
  check("Panel reports it is sunlit", sol.state!.sunlit === true);

  // dragged clear again, the panel drops straight back to the room trickle
  sim.env.sun.x = def.w + 500;
  run(doc, sim);
  check("Light source dragged away drops the panel back", out() < 0.5);
  check("Panel's − terminal still grounds the circuit", sim.groundedAt(sol.id, "n1"));
}

// 11. Voltage meter reads the level on its + probe, in volts
{
  const doc = emptyDoc(); const sim = new Simulator();
  const bat = place(doc, "battery");
  const vm = place(doc, "voltmeter");
  wire(doc, bat, "p1", vm, "p"); // red probe only — black one left floating
  run(doc, sim);
  check("Meter reads nothing with the − probe floating", vm.state!.live === false && vm.state!.volts === 0);

  wire(doc, bat, "n1", vm, "n");
  run(doc, sim);
  check("Meter reads the full supply across the battery",
    vm.state!.live === true && Math.abs((vm.state!.volts as number) - SUPPLY_VOLTS) < 1e-9);
  check("Meter draws nothing — no short across the battery", bat.state!.blown === false);

  // switching the battery off drops the reading to zero, probes still connected
  bat.state!.on = false;
  run(doc, sim);
  check("Meter reads 0 V from a switched-off battery",
    vm.state!.live === true && vm.state!.volts === 0);

  // a part in the circuit still works with the meter wired across it
  const led = place(doc, "light");
  wire(doc, bat, "p1", led, "p"); wire(doc, led, "n", bat, "n1");
  bat.state!.on = true;
  run(doc, sim);
  check("LED still lights with a meter wired in", (led.state!.on as number) > 0.5);
}

// 11b. Meter on a solar panel reads the partial voltage it is making
{
  const doc = emptyDoc(); const sim = new Simulator();
  const sol = place(doc, "solar");
  const vm = place(doc, "voltmeter");
  wire(doc, sol, "p1", vm, "p"); wire(doc, sol, "n1", vm, "n");
  const def = getDef("solar")!;

  sim.env.ambientLight = 0.7;
  run(doc, sim);
  const dim = vm.state!.volts as number;
  check("Meter reads a partial voltage off room light", dim > 0.5 && dim < SUPPLY_VOLTS);

  sim.env.sun = { on: true, x: def.w / 2, y: def.h / 2, radius: 100 };
  run(doc, sim);
  check("Meter reads the full supply off a sunlit panel",
    Math.abs((vm.state!.volts as number) - SUPPLY_VOLTS) < 1e-9);

  // peak hold keeps the highest reading after the light goes away
  vm.props.peak = true;
  run(doc, sim, 2);
  sim.env.sun.on = false;
  run(doc, sim);
  check("Peak hold keeps the highest reading", (vm.state!.peak as number) > (vm.state!.volts as number));
  vm.props.peak = false;
  run(doc, sim);
  check("Peak hold clears when switched off", vm.state!.peak === 0);
}

// 8. socket layout: every socket sits inside its box, clear of its neighbours
{
  const PIN_R = 5; // matches the renderer
  const inside: string[] = [];
  const crowded: string[] = [];
  for (const def of allDefs()) {
    for (const p of def.pins) {
      if (p.x - PIN_R < 0 || p.y - PIN_R < 0 || p.x + PIN_R > def.w || p.y + PIN_R > def.h)
        inside.push(`${def.id}.${p.id}`);
    }
    for (let i = 0; i < def.pins.length; i++)
      for (let j = i + 1; j < def.pins.length; j++) {
        const a = def.pins[i];
        const b = def.pins[j];
        if (Math.hypot(a.x - b.x, a.y - b.y) < PIN_R * 2 + 4)
          crowded.push(`${def.id}: ${a.id}/${b.id}`);
      }
  }
  check("Every socket sits inside its component box" + fmtList(inside), !inside.length);
  check("No two sockets overlap" + fmtList(crowded), !crowded.length);
}

function fmtList(bad: string[]): string {
  return bad.length ? ` — ${bad.join(", ")}` : "";
}

// 9. the light sensor's square face: outputs down the left, power bottom-right
{
  const def = getDef("lightsensor")!;
  const pin = (id: string) => def.pins.find((p) => p.id === id)!;
  check("Light sensor is a perfect square", def.w === def.h);
  check(
    "LIGHT sits above DARK in a left-hand column",
    pin("light").x === pin("dark").x && pin("light").y < pin("dark").y &&
      pin("light").x < def.w / 2 && pin("dark").x < def.w / 2,
  );
  check(
    "Power pair sits together in the bottom-right corner",
    pin("vp").x > def.w / 2 && pin("vn").x > def.w / 2 &&
      pin("vp").y > def.h / 2 && pin("vn").y > def.h / 2 &&
      pin("vp").y === pin("vn").y && Math.abs(pin("vp").x - pin("vn").x) <= 24,
  );
}

// 12. Radio link: four signals carried through the air, socket n to socket n
{
  const doc = emptyDoc(); const sim = new Simulator();
  const bat = place(doc, "battery");
  // the receiver is placed first on purpose — the link has to settle whichever
  // end the solver happens to reach first
  const rx = place(doc, "radio-rx");
  const tx = place(doc, "radio-tx");
  power(doc, bat, tx);
  power(doc, bat, rx);
  const chans = [1, 2, 3, 4];
  const sw = chans.map(() => place(doc, "switch"));
  const led = chans.map(() => place(doc, "light"));
  chans.forEach((n, i) => {
    wire(doc, bat, "p1", sw[i], "a");
    wire(doc, sw[i], "b", tx, `s${n}`);
    wire(doc, rx, `s${n}`, led[i], "p");
    wire(doc, led[i], "n", bat, "n1");
  });
  const on = (i: number) => (led[i].state!.on as number) > 0.5;

  run(doc, sim);
  check("Radio: every output low with nothing sent", !chans.some((_, i) => on(i)));

  sw[2].state!.closed = true; // into socket 3 on the transmitter
  run(doc, sim);
  check("Radio: a signal on 3 comes out on 3", on(2));
  check("Radio: nothing leaks onto the other channels", !on(0) && !on(1) && !on(3));

  sw[0].state!.closed = true;
  run(doc, sim);
  check("Radio: channels carry independently", on(0) && on(2) && !on(1) && !on(3));

  sw[2].state!.closed = false;
  run(doc, sim);
  check("Radio: dropping 3 leaves 1 up", on(0) && !on(2));

  // either end losing power breaks the link
  doc.wires = doc.wires.filter((w) => !(w.b.comp === rx.id && w.b.pin === "vp"));
  run(doc, sim);
  check("Radio: an unpowered receiver outputs nothing", !on(0));
  wire(doc, bat, "p1", rx, "vp");
  run(doc, sim);
  check("Radio: the receiver works again once repowered", on(0));
  doc.wires = doc.wires.filter((w) => !(w.b.comp === tx.id && w.b.pin === "vp"));
  run(doc, sim);
  check("Radio: an unpowered transmitter sends nothing", !on(0));
}

// 12b. the radio pair's faces: one of each per project, columns facing out
{
  const tx = getDef("radio-tx")!;
  const rx = getDef("radio-rx")!;
  const column = (def: typeof tx) => [1, 2, 3, 4].map((n) => def.pins.find((p) => p.id === `s${n}`)!);
  const tc = column(tx);
  const rc = column(rx);
  const descends = (col: typeof tc) => col.every((p, i) => i === 0 || p.y > col[i - 1].y);

  check("Radio ends may only be placed once", tx.unique === true && rx.unique === true);
  check("Radio ends are perfect squares", tx.w === tx.h && rx.w === rx.h);
  check("Transmitter signals run down the left edge",
    tc.every((p) => p.x < tx.w / 2) && descends(tc));
  check("Receiver signals run down the right edge",
    rc.every((p) => p.x > rx.w / 2) && descends(rc));
  check("Channel n sits at the same height on both ends",
    tc.every((p, i) => p.y === rc[i].y));
  check("Transmitter takes signals in, receiver puts them out",
    tc.every((p) => p.role === "in") && rc.every((p) => p.role === "out"));
  check("Both ends carry a + / − power pair",
    [tx, rx].every((d) => d.pins.some((p) => p.id === "vp") && d.pins.some((p) => p.id === "vn")));
  check("Power pair sits clear of the signal column",
    [tx, rx].every((d) => {
      const vp = d.pins.find((p) => p.id === "vp")!;
      const col = column(d);
      return vp.y > col[3].y && col.every((p) => Math.abs(p.x - vp.x) > 20);
    }));
}

// 13. Power / Ground blocks: one wire from the battery feeds the whole block
{
  const doc = emptyDoc(); const sim = new Simulator();
  const bat = place(doc, "battery");
  const pos = place(doc, "bus-pos");
  const neg = place(doc, "bus-neg");
  // a single wire per rail — everything else hangs off the blocks
  wire(doc, bat, "p1", pos, "p1");
  wire(doc, bat, "n1", neg, "n12");
  const led = place(doc, "light");
  const sw = place(doc, "switch");
  wire(doc, pos, "p9", sw, "a");
  wire(doc, sw, "b", led, "p");
  wire(doc, led, "n", neg, "n4");
  const lit = () => (led.state!.on as number) > 0.5;

  run(doc, sim);
  check("Blocks: nothing lit while the switch is open", !lit());
  sw.state!.closed = true;
  run(doc, sim);
  check("Blocks: a part fed from the blocks lights up", lit());

  // every socket is the same node, wherever the battery wire happened to land
  check("Blocks: all 12 Power sockets are live from one battery wire",
    getDef("bus-pos")!.pins.every((p) => sim.energizedAt(pos.id, p.id) > 0.5));
  check("Blocks: all 12 Ground sockets ground from one battery wire",
    getDef("bus-neg")!.pins.every((p) => sim.groundedAt(neg.id, p.id)));

  bat.state!.on = false;
  run(doc, sim);
  check("Blocks: they go dead with the battery",
    !lit() && sim.energizedAt(pos.id, "p4") < 0.5);
  bat.state!.on = true;
  run(doc, sim);
  check("Blocks: power comes back with the battery", lit());

  // purely passive — a block must never invent a supply of its own
  doc.wires = doc.wires.filter((w) => w.a.comp !== bat.id && w.b.comp !== bat.id);
  run(doc, sim);
  check("Blocks: an unfed block powers nothing", !lit());
}

// 13b. both blocks are a bare upright 2 × 6 array of one colour
{
  for (const [id, name, color] of [
    ["bus-pos", "Power", "#e23b3b"],
    ["bus-neg", "Ground", "#15181d"],
  ] as const) {
    const def = getDef(id)!;
    check(`${name}: named just "${name}"`, def.name === name);
    check(`${name}: 12 sockets`, def.pins.length === 12);
    check(`${name}: every socket is the same colour`, def.pins.every((p) => p.color === color));
    check(`${name}: laid out 2 across, 6 down`,
      new Set(def.pins.map((p) => p.x)).size === 2 && new Set(def.pins.map((p) => p.y)).size === 6);
    check(`${name}: stands upright by default`, def.h > def.w);
    // bare wiring block: no readouts, no settings, no behaviour of its own
    check(`${name}: inert — nothing but the box and its sockets`,
      !def.props && !def.init && !def.evaluate && !def.tick && !def.source && !def.interact);
  }
}

// 14. Sequencer: switching the power off resets it to step 1
{
  const doc = emptyDoc(); const sim = new Simulator();
  const bat = place(doc, "battery");
  const seq = place(doc, "sequence");
  power(doc, bat, seq);
  const trig = place(doc, "switch");
  wire(doc, bat, "p1", trig, "a");
  wire(doc, trig, "b", seq, "t3");

  run(doc, sim);
  check("Sequencer starts on step 1", seq.state!.idx === 0);
  trig.state!.closed = true;
  run(doc, sim);
  check("Sequencer advances to the triggered step", seq.state!.idx === 2);
  trig.state!.closed = false;
  run(doc, sim);
  check("Sequencer holds its step once the trigger clears", seq.state!.idx === 2);

  // rewiring elsewhere rebuilds every net — that must not read as a power cut
  const spare = place(doc, "switch");
  wire(doc, bat, "p1", spare, "a");
  for (const closed of [true, false, true]) {
    spare.state!.closed = closed;
    run(doc, sim);
  }
  check("Sequencer ignores unrelated switching on the board", seq.state!.idx === 2);

  bat.state!.on = false;
  run(doc, sim);
  check("Sequencer resets when the battery is switched off", seq.state!.idx === 0);
  bat.state!.on = true;
  run(doc, sim);
  check("Sequencer comes back on step 1, not where it left off", seq.state!.idx === 0);
  check("Step 1 drives its output again after the reset", sim.energizedAt(seq.id, "s1") > 0.5);
}

console.log(`\n${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
