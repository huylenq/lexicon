import { useEffect, useState } from "react";
import type { SourceExcerpt, SourceLink } from "../../shared/model";
import { request } from "./ui";

/** A location in an exact draft, never an arbitrary file or a saved model mapping. */
export type DraftSourceReference = { agentId: string; draftId: string; itemId: string; side: "before" | "after"; linkIndex: number };
export type DraftSourceResult = { reference: DraftSourceReference; link?: SourceLink; excerpt?: SourceExcerpt; error?: string };
export function parseDraftSource(value: string | null): DraftSourceReference | undefined {
  if (!value) return;
  try {
    const v = JSON.parse(value);
    if (v && [v.agentId, v.draftId, v.itemId].every(id => typeof id === "string" && id.length > 0) &&
      (v.side === "before" || v.side === "after") && Number.isInteger(v.linkIndex) && v.linkIndex >= 0)
      return { agentId: v.agentId, draftId: v.draftId, itemId: v.itemId, side: v.side, linkIndex: v.linkIndex };
  } catch { /* Invalid shared locations remain unavailable. */ }
}
export function useDraftSource(projectId: string, reference?: DraftSourceReference): DraftSourceResult | undefined {
  const key = JSON.stringify(reference), [result, setResult] = useState<{ key: string; value: DraftSourceResult }>();
  useEffect(() => {
    if (!reference) return;
    const controller = new AbortController();
    const params = new URLSearchParams({ agent: reference.agentId, draftId: reference.draftId, itemId: reference.itemId, side: reference.side, linkIndex: String(reference.linkIndex) });
    void request<{ link: SourceLink; excerpt: SourceExcerpt }>(`/api/projects/${encodeURIComponent(projectId)}/agent/draft-source?${params}`, { signal: controller.signal })
      .then(value => { if (!controller.signal.aborted) setResult({ key, value: { reference, ...value } }); })
      .catch(error => { if (!controller.signal.aborted) setResult({ key, value: { reference, error: error.message } }); });
    return () => controller.abort();
  }, [projectId, key]);
  return reference ? result?.key === key ? result.value : { reference } : undefined;
}
