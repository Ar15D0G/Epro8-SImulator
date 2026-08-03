/** Simple snapshot-based undo/redo stack. */

import type { CircuitDoc } from "./document";
import { serialisableDoc } from "./document";

export class History {
  private stack: string[] = [];
  private index = -1;
  private limit = 100;

  reset(doc: CircuitDoc): void {
    this.stack = [JSON.stringify(serialisableDoc(doc))];
    this.index = 0;
  }

  /** Record the current document state as a new undo point. */
  push(doc: CircuitDoc): void {
    const snap = JSON.stringify(serialisableDoc(doc));
    if (snap === this.stack[this.index]) return;
    this.stack = this.stack.slice(0, this.index + 1);
    this.stack.push(snap);
    if (this.stack.length > this.limit) this.stack.shift();
    this.index = this.stack.length - 1;
  }

  canUndo(): boolean {
    return this.index > 0;
  }
  canRedo(): boolean {
    return this.index < this.stack.length - 1;
  }

  undo(): CircuitDoc | null {
    if (!this.canUndo()) return null;
    this.index -= 1;
    return JSON.parse(this.stack[this.index]) as CircuitDoc;
  }

  redo(): CircuitDoc | null {
    if (!this.canRedo()) return null;
    this.index += 1;
    return JSON.parse(this.stack[this.index]) as CircuitDoc;
  }
}
