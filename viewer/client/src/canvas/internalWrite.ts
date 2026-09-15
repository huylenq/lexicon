import type { Editor } from "tldraw";

/** Derived presentation updates still run when the canvas is read-only to the user. */
export function internalWrite<T>(editor: Editor, fn: () => T): T {
  const readonly = editor.getIsReadonly();
  if (readonly) editor.updateInstanceState({ isReadonly: false });
  try { return fn(); }
  finally { if (readonly) editor.updateInstanceState({ isReadonly: true }); }
}
