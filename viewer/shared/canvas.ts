import type { TLStoreSnapshot } from "@tldraw/tlschema";
import type { Annotation } from "./model";

export const CANVAS_FORMAT = "lexicon-canvas";
export const CANVAS_VERSION = 2;
export const MAX_CANVAS_BYTES = 20 * 1024 * 1024;
export const MAX_CANVAS_RECORDS = 20_000;
export const MAX_ASSET_BYTES = 25 * 1024 * 1024;
export const MAX_PORTABLE_CANVAS_BYTES = 50 * 1024 * 1024;

/** A portable project document. Browser/session state never belongs in this file. */
export interface CanvasDocument {
  format: typeof CANVAS_FORMAT;
  version: typeof CANVAS_VERSION;
  id: string;
  modelId: string;
  snapshot: TLStoreSnapshot;
}
export interface CanvasState {
  document: CanvasDocument | null;
  revision: string;
  storageKey: string;
  documentId: string;
  issue?: string;
  backupAvailable: boolean;
  missingAssets: string[];
}
export type CanvasModelCommand =
  | { type: "annotate"; targetId: string; annotation: Annotation }
  | { type: "move-concept"; targetId: string; contextId: string };

export interface CanvasModelChange {
  changeId: string;
  revision: string;
}

export const canvasAssetName = (src: string | null) =>
  src?.match(/^asset:([a-f0-9]{64}\.(?:png|jpg|gif|webp|avif|mp4|webm))$/)?.[1];
