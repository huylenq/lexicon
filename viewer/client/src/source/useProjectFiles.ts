import { sourceFiles } from "./targets";
import { useEffect, useMemo, useState } from "react";
import type { Model } from "../../../shared/model";
import type { FileInventory } from "../../../shared/files";
import { fileSelectionPath } from "../../../shared/files";
import { indexModel, type GraphSelection } from "../graph/model";
import { request } from "../ui";
import { fileMapLayout } from "./fileMapLayout";

export function useProjectFiles(projectId: string, model: Model, enabled = true) {
  const [inventory, setInventory] = useState<FileInventory>();
  const [error, setError] = useState("");
  const [revision, setRevision] = useState(0);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    if (!enabled) { setLoading(false); return; }
    const abort = new AbortController();
    setLoading(true); setError("");
    request<FileInventory>(`/api/projects/${projectId}/files${revision ? "?refresh=1" : ""}`, { signal: abort.signal })
      .then(setInventory).catch(error => { if (!abort.signal.aborted) setError(error.message); })
      .finally(() => { if (!abort.signal.aborted) setLoading(false); });
    return () => abort.abort();
  }, [projectId, revision, enabled]);
  useEffect(() => {
    const refresh = (event: Event) => { if ((event as CustomEvent).detail === projectId) setRevision(n => n + 1); };
    window.addEventListener("lexicon-project-settings", refresh);
    return () => window.removeEventListener("lexicon-project-settings", refresh);
  }, [projectId]);
  const index = useMemo(() => indexModel(model), [model]);
  const files = useMemo(() => sourceFiles(index), [index]);
  // Authored evidence remains in the reader; only inventory entries get physical tiles.
  const layout = useMemo(() => fileMapLayout(inventory?.files || [], inventory?.metrics), [inventory]);
  return { inventory, error, loading, index, files, layout, refresh: () => setRevision(n => n + 1) };
}
export type ProjectFilesState = ReturnType<typeof useProjectFiles>;

export function sourceSelectionFile(index: ProjectFilesState["index"], selection?: GraphSelection) {
  if (selection?.kind === "code") return index.targets.get(selection.id)?.link.file || fileSelectionPath(selection.id);
  if (selection?.kind === "mapping") return index.mappings.get(selection.id)?.link.file;
}

export function sourceHighlights(index: ProjectFilesState["index"], selection?: GraphSelection) {
  const paths = new Set<string>();
  const add = (path: string) => {
    paths.add(path);
    while (path.includes("/")) { path = path.slice(0, path.lastIndexOf("/")); paths.add(path); }
  };
  const file = sourceSelectionFile(index, selection);
  if (file) add(file);
  if (selection?.kind === "item") {
    const owners = sourceOwners(index, selection.id);
    for (const mapping of index.mappings.values()) if (owners.has(mapping.owner.id)) add(mapping.link.file);
  } else if (selection?.kind === "bundle") {
    for (const id of selection.mappings) { const mapping = index.mappings.get(id); if (mapping) add(mapping.link.file); }
  }
  return paths;
}

export function sourceOwners(index: ProjectFilesState["index"], id: string) {
  const owners = new Set([id]);
  for (const id of owners) for (const item of index.items.values())
    if ("parent" in item && item.parent === id) owners.add(item.id);
  return owners;
}
