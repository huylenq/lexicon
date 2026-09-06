import type { TLAssetStore } from "tldraw";
import {
  MAX_ASSET_BYTES,
  canvasAssetName,
  type CanvasDocument,
  type CanvasModelChange,
  type CanvasModelCommand,
  type CanvasState,
} from "../../../shared/canvas";

export class CanvasRequestError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
  }
}

async function request<T>(url: string, options?: RequestInit): Promise<T> {
  const response = await fetch(url, options);
  const data = await response.json();
  if (!response.ok)
    throw new CanvasRequestError(
      data.error || "The canvas request failed.",
      response.status,
    );
  return data;
}

/** The local server validates documents and model commands; callers share its wire contract. */
export function canvasApi(projectId: string) {
  const base = `/api/projects/${encodeURIComponent(projectId)}/canvas`;
  const json = (
    method: string,
    body: unknown,
    signal?: AbortSignal,
  ): RequestInit => ({
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal,
  });
  return {
    read: (signal?: AbortSignal) =>
      request<CanvasState>(base, { cache: "no-store", signal }),
    save: (revision: string, document: CanvasDocument, signal?: AbortSignal) =>
      request<CanvasState>(base, json("PUT", { revision, document }, signal)),
    validate: (document: CanvasDocument) =>
      request<CanvasDocument>(`${base}/validate`, json("POST", document)),
    recover: (revision: string, signal?: AbortSignal) =>
      request<CanvasState>(
        `${base}/recover`,
        json("POST", { revision }, signal),
      ),
    command: (revision: string, command: CanvasModelCommand) =>
      request<CanvasModelChange>(
        `${base}/model-command`,
        json("POST", { revision, command }),
      ),
    undo: (changeId: string) =>
      request<unknown>(
        `/api/projects/${encodeURIComponent(projectId)}/chat/undo`,
        json("POST", { changeId }),
      ),
    upload: (file: File, signal?: AbortSignal) =>
      request<{ src: string }>(`${base}/assets`, {
        method: "POST",
        body: file,
        headers: { "Content-Type": file.type },
        signal,
      }),
    assetUrl: (name: string) => `${base}/assets/${name}`,
  };
}
export type CanvasApi = ReturnType<typeof canvasApi>;

export function projectAssets(api: CanvasApi): TLAssetStore {
  return {
    async upload(_asset, file, signal) {
      if (file.size > MAX_ASSET_BYTES)
        throw new Error("Canvas media must be smaller than 25 MB.");
      return api.upload(file, signal);
    },
    resolve(asset) {
      const name = canvasAssetName(asset.props.src);
      return name ? api.assetUrl(name) : asset.props.src;
    },
    // Keep files for undo, recovery, and older Git revisions. Deleting a shape is not asset GC.
  };
}
