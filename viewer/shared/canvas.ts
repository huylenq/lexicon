import type { TLStoreSnapshot } from "@tldraw/tlschema";

/** A portable project document. Browser/session state never belongs in this file. */
export interface CanvasDocument {
  format: "lexicon-canvas";
  version: 2;
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
export const CANVAS_VERSION = 2;
export const MAX_CANVAS_BYTES = 20 * 1024 * 1024;
export const MAX_ASSET_BYTES = 25 * 1024 * 1024;
export const canvasAssetName = (src: string | null) =>
  src?.match(/^asset:([a-f0-9]{64}\.(?:png|jpg|gif|webp|avif|mp4|webm))$/)?.[1];
