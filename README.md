# EPro8 Simulator

A modern, fast, static-site remake of the [EPro8 Challenge electronics
simulator](https://www.epro8challenge.co.nz/SimulatorV22/) — same build-and-wire
workflow, a cleaner UI, better performance, and **more components**.

Built with **TypeScript + Vite**, an HTML5 Canvas workspace, and a DOM UI shell.
No backend — it deploys as a static site (e.g. Render Static Site).

## Develop

```bash
npm install
npm run dev        # http://localhost:5173
npm run build      # type-check + production build -> dist/
npm run preview    # serve the built dist/
npm run verify     # headless checks of the simulation engine
```


## How it works

- **Drag** a component from the left palette onto the canvas.
- **Click a socket and drag to another socket** to wire them (colour-coded wires;
  pick a colour in the toolbar).
- **Click** switches / buttons / latches to operate them.
- **Select** a part to edit its settings (colour, delay, channel, …) in the right
  inspector. The inspector's *World / Sensors* sliders drive light, temperature and
  distance sensors in the sandbox.
- Pan (Space-drag or Pan tool), zoom (wheel), Undo/Redo, and **Save / Open / Share**
  (share produces a `#c=…` link and a copy-paste code).

### Electrical model

A *continuity + energise* model: wires and closed switches merge nets, the battery
provides + (energise) and − (ground), and a two-terminal load only turns on with a
**complete circuit**. Active parts (logic gates, sensors, timers, radios) read whether
their inputs are energised and drive their outputs, solved to a fixed point each frame.

### Components

Power (Battery, Solar Panel), Inputs (Push Button, Toggle Switch, ON/OFF Latch,
Potentiometer, Junction Box), Outputs (LED, RGB LED, Buzzer, Motor, Fan, Linear Ram,
Numeric Display, **Voltage Meter**, Motor Direction), Logic (AND, OR, NOT, NAND, NOR,
XOR), Timing (Time Delay, Counter, Sequencer, Oscillator), Sensors (Light, Temperature,
Ultrasonic Distance, Limit Switch, **Break-Beam Laser**), Wireless (**Radio Transmitter /
Receiver**).

New parts can be added by dropping a `ComponentDef` into `src/components/definitions/`
and registering it — the engine, palette, and inspector pick it up automatically.

## Deploy to Render

`render.yaml` is included (Static Site, `npm ci && npm run build`, publish `dist/`,
SPA rewrite). Push the repo to GitHub and create a **Blueprint** (or a Static Site)
on Render pointing at it. It's a PWA, so it also works offline once loaded.

## Roadmap

- **Phase 2** — mechanical playground: construction parts (rods, gears, wheels, levers,
  pulleys, rams) that motors physically drive, world-driven sensors.
- **Phase 3** — scripted challenge levels with goals and scoring (walker, crane, fire
  engine, …), level select + codes.
