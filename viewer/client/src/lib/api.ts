import type { LexiconResponse, Project, YamlSibling } from "./types";

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
  fetchFile: (id: number, path: string) =>
    fetch(`/api/projects/${id}/file?path=${encodeURIComponent(path)}`).then(j<{ path: string; text: string }>),
  fetchYamlSiblings: (id: number, path: string) =>
    fetch(`/api/projects/${id}/yaml-siblings?path=${encodeURIComponent(path)}`).then(
      j<{ file: string; siblings: YamlSibling[] }>,
    ),
};
