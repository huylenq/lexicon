import type { Editor } from "tldraw";

const writing = new WeakSet<Editor>();
// tldraw 5.4 exposes this at runtime but omits it from its public declarations.
// Keep the SDK boundary here; callers should not reach into its HistoryManager.
export function isHistoryReplay(editor: Editor): boolean {
  return (editor as Editor & { isReplayingHistory(): boolean }).isReplayingHistory();
}

export const isInternalWrite = (editor: Editor) => writing.has(editor);

/** Derived presentation updates still run when the canvas is read-only to the user. */
export function internalWrite<T>(editor: Editor, fn: () => T): T {
  const nested = writing.has(editor);
  writing.add(editor);
  const readonly = editor.getIsReadonly();
  if (readonly) editor.updateInstanceState({ isReadonly: false });
  try { return fn(); }
  finally { if (!nested) writing.delete(editor); if (readonly) editor.updateInstanceState({ isReadonly: true }); }
}
