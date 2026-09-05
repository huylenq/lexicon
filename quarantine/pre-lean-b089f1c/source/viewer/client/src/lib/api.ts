import type {
  CodeEdge,
  FileCommit,
  GraphifyNeighborhoodResponse,
  GraphifyNodeResponse,
  GraphifyProbe,
  GraphifySearchResponse,
  LexiconResponse,
  ModelHealthReport,
  Project,
  YamlSibling,
} from "./types";

async function j<T>(res: Response): Promise<T> {
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`${res.status}: ${body}`);
  }
  return res.json() as Promise<T>;
}

export const api = {
  listProjects: () => fetch("/api/projects").then(j<Project[]>),
  addProject: (rootPath: string, name?: string) =>
    fetch("/api/projects", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ rootPath, name }),
    }).then(j<Project>),
  removeProject: (id: number) =>
    fetch(`/api/projects/${id}`, { method: "DELETE" }).then(j<{ ok: true }>),
  loadLexicon: (id: number, refresh = false) =>
    fetch(`/api/projects/${id}/lexicon${refresh ? "?refresh=1" : ""}`).then(j<LexiconResponse>),
  // Call-flow tier — lazily fetched when the code lens opens (see GraphPage).
  codeEdges: (id: number) =>
    fetch(`/api/projects/${id}/code-edges`).then(j<{ edges: CodeEdge[] }>),
  // Model-health pass — lazily fetched when the code lens / overlay is active.
  modelHealth: (id: number) =>
    fetch(`/api/projects/${id}/model-health`).then(j<{ report: ModelHealthReport }>),
  // Recent commits touching the given repo-relative files (atom dossier).
  fileCommits: (id: number, files: string[]) =>
    fetch(`/api/projects/${id}/file-commits?files=${encodeURIComponent(files.join(","))}`)
      .then(j<{ commits: FileCommit[] }>),
  fetchFile: (id: number, path: string) =>
    fetch(`/api/projects/${id}/file?path=${encodeURIComponent(path)}`).then(j<{ path: string; text: string }>),
  fetchYamlSiblings: (id: number, path: string) =>
    fetch(`/api/projects/${id}/yaml-siblings?path=${encodeURIComponent(path)}`).then(
      j<{ file: string; siblings: YamlSibling[] }>,
    ),
  // Graphify (territory) lens — artifact-only, read-only. Absent artifact is a
  // normal { status: "absent" } payload, not an error.
  graphifySummary: (id: number) =>
    fetch(`/api/projects/${id}/graphify`).then(j<GraphifyProbe>),
  graphifyNeighborhood: (
    id: number,
    node: string,
    opts: { hops?: number; relations?: string[]; cap?: number; hideTests?: boolean } = {},
  ) => {
    const params = new URLSearchParams({ node });
    if (opts.hops !== undefined) params.set("hops", String(opts.hops));
    if (opts.cap !== undefined) params.set("cap", String(opts.cap));
    if (opts.relations && opts.relations.length) params.set("relations", opts.relations.join(","));
    if (opts.hideTests) params.set("hideTests", "1");
    return fetch(`/api/projects/${id}/graphify/neighborhood?${params}`).then(j<GraphifyNeighborhoodResponse>);
  },
  graphifySearch: (id: number, q: string, cap?: number) => {
    const params = new URLSearchParams({ q });
    if (cap !== undefined) params.set("cap", String(cap));
    return fetch(`/api/projects/${id}/graphify/search?${params}`).then(j<GraphifySearchResponse>);
  },
  graphifyNode: (id: number, node: string) =>
    fetch(`/api/projects/${id}/graphify/node?node=${encodeURIComponent(node)}`).then(j<GraphifyNodeResponse>),
};
