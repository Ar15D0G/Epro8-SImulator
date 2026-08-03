/** The serializable circuit document: component instances + wires. */

import type { CompProps, CompState } from "@/components/types";

export interface ComponentInstance {
  id: string;
  defId: string;
  x: number;
  y: number;
  rotation: number;
  props: CompProps;
  /** runtime-only simulation state (not persisted) */
  state?: CompState;
}

export interface WireInstance {
  id: string;
  /** endpoint A: componentId + pinId */
  a: { comp: string; pin: string };
  b: { comp: string; pin: string };
  color: string;
}

export interface CircuitDoc {
  version: 1;
  components: ComponentInstance[];
  wires: WireInstance[];
}

export function emptyDoc(): CircuitDoc {
  return { version: 1, components: [], wires: [] };
}

let counter = 0;
export function uid(prefix = "n"): string {
  counter += 1;
  return `${prefix}${Date.now().toString(36)}${counter.toString(36)}`;
}

/** Strip runtime-only fields before persisting/serialising. */
export function serialisableDoc(doc: CircuitDoc): CircuitDoc {
  return {
    version: 1,
    components: doc.components.map((c) => ({
      id: c.id,
      defId: c.defId,
      x: c.x,
      y: c.y,
      rotation: c.rotation,
      props: { ...c.props },
    })),
    wires: doc.wires.map((w) => ({
      id: w.id,
      a: { ...w.a },
      b: { ...w.b },
      color: w.color,
    })),
  };
}
