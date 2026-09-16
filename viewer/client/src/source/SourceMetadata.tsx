import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { sourceTargetId, type Model, type SourceLink, type SourceMetadata } from "../../../shared/model";
import { request } from "../ui";

const Metadata = createContext<SourceMetadata>({});
/** Refresh with the project model; metadata never enters XML or canvas persistence. */
export function SourceMetadataProvider({ projectId, model, children }: { projectId: string; model?: Model; children: ReactNode }) {
  const [metadata, setMetadata] = useState<SourceMetadata>({});
  useEffect(() => {
    setMetadata({});
    if (!model?.items.some(item => item.codeLinks.some(link => link.symbol))) return;
    const controller = new AbortController();
    request<SourceMetadata>(`/api/projects/${encodeURIComponent(projectId)}/source-metadata`, { signal: controller.signal })
      .then(value => { if (!controller.signal.aborted) setMetadata(value); })
      .catch(() => { /* Generic glyphs keep targets usable when metadata is unavailable. */ });
    return () => controller.abort();
  }, [projectId, model]);
  return <Metadata.Provider value={metadata}>{children}</Metadata.Provider>;
}
export const useSourceMetadata = () => useContext(Metadata);
export function useSymbolKind(link: SourceLink) {
  return useSourceMetadata()[sourceTargetId(link)]?.symbolKind;
}
