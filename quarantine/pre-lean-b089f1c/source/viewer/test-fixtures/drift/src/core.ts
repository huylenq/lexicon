// core.ts now declares both Core and the moved Widget. The Widget anchor in the
// cold layer still points at widget.ts → drifted, resolves here instead.

export interface Widget {
  id: string;
}

export class Core {
  widget: Widget;
  constructor(w: Widget) {
    this.widget = w;
  }
}
