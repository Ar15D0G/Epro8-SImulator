/** Central registry of all component definitions. */

import type { Category, ComponentDef, CompProps } from "./types";
import { powerDefs } from "./definitions/power";
import { outputDefs } from "./definitions/output";
import { inputDefs } from "./definitions/input";
import { logicDefs } from "./definitions/logic";
import { timingDefs } from "./definitions/timing";
import { sensorDefs } from "./definitions/sensor";
import { wirelessDefs } from "./definitions/wireless";

const registry = new Map<string, ComponentDef>();

function register(defs: ComponentDef[]): void {
  for (const d of defs) {
    if (registry.has(d.id)) throw new Error(`duplicate component id: ${d.id}`);
    registry.set(d.id, d);
  }
}

register(powerDefs);
register(inputDefs);
register(outputDefs);
register(logicDefs);
register(timingDefs);
register(sensorDefs);
register(wirelessDefs);

export function getDef(id: string): ComponentDef | undefined {
  return registry.get(id);
}

export function allDefs(): ComponentDef[] {
  return [...registry.values()];
}

export const CATEGORY_ORDER: Category[] = [
  "power",
  "input",
  "output",
  "logic",
  "timing",
  "sensor",
  "wireless",
];

export const CATEGORY_LABELS: Record<Category, string> = {
  power: "Power",
  input: "Inputs & Controls",
  output: "Outputs",
  logic: "Logic Gates",
  timing: "Timing & Counting",
  sensor: "Sensors",
  wireless: "Wireless",
};

/** Build the default props object for a component. */
export function defaultProps(def: ComponentDef): CompProps {
  const props: CompProps = {};
  for (const p of def.props ?? []) props[p.key] = p.default;
  return props;
}
