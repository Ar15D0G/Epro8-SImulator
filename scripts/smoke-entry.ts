/* Smoke-test entry: mounts the real app AND exposes a render-all helper. */
import "@/main";
import { allDefs, defaultProps } from "@/components/registry";

export { allDefs };

export function renderAll(ctx: CanvasRenderingContext2D): number {
  const theme = { text: "#fff", dim: "#999", accent: "#22d3ee", panel: "#111" };
  let n = 0;
  for (const def of allDefs()) {
    def.draw({
      ctx,
      state: def.init ? def.init() : {},
      props: defaultProps(def),
      selected: false,
      w: def.w,
      h: def.h,
      cx: def.w / 2,
      cy: 46,
      r: 15,
      theme,
      time: 1.2,
    });
    n++;
  }
  return n;
}
