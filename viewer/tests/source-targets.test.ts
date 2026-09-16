import { fileSelectionId } from "../shared/files";
import { linkedSourcesGraph, sourceSelectionId } from "../client/src/source/view";
import { expect, test } from "bun:test";
import { indexModel, projectGraph } from "../client/src/graph/model";
import { sourceFiles, sourceTargetLabel, selectedSourceTarget, revealedSourceTargets } from "../client/src/source/targets";
import { sourceDetails, detailEndpoints } from "../client/src/source/detail";
import { fileMapLayout } from "../client/src/source/fileMapLayout";
import type { Model, SourceLink } from "../shared/model";

const links: SourceLink[] = [
  { kind: "code", file: "tiny.ts", symbol: "Order", role: "definition", description: "" },
  { kind: "code", file: "tiny.ts", symbol: "OrderLine", role: "implementation", description: "" },
  { kind: "document", file: "design.md", heading: "Rules", role: "specification", description: "" },
  { kind: "document", file: "design.md", heading: "Lifecycle", role: "rationale", description: "" },
];
const index = indexModel({ schema: "3.2", issues: [], id: "shop", name: "Shop", description: "", items: [
  { id: "order", type: "context", name: "Order", description: "", annotations: [], codeLinks: links },
  { id: "other", type: "context", name: "Other", description: "", annotations: [], codeLinks: [links[0]] },
] } as Model);

test("flat and repository detail share exact targets, with owner roles on mappings", () => {
  const graph = projectGraph(index, { });
  const files = sourceFiles(index);
  expect(files.get("tiny.ts")).toHaveLength(2);
  expect(files.get("tiny.ts")![0].mappings).toHaveLength(2);
  for (const node of graph.nodes.filter(node => node.kind === "code")) {
    expect(sourceTargetLabel(index.targets.get(node.id)!.link).label).toBe(node.title);
    expect(node.sourceLink).toEqual(index.targets.get(node.id)!.link);
    expect(selectedSourceTarget(index, node.selection)).toBe(node.id);
  }
  expect(revealedSourceTargets(index, { kind: "code", id: files.get("tiny.ts")![0].id })).toEqual(new Set([files.get("tiny.ts")![0].id]));
  const mapping = [...index.mappings.values()][1];
  expect(selectedSourceTarget(index, { kind: "mapping", id: mapping.id })).toBe(mapping.target);
  expect(graph.connections.filter(edge => edge.kind === "mapping").map(edge => edge.label)).toEqual([...links, links[0]].map(link => link.role));
});

test("tiny file detail preserves LOC layout and uses row centers for bridge endpoints", () => {
  const layout = fileMapLayout(["tiny.ts", "design.md"], { "tiny.ts": { loc: 1, status: "counted" }, "design.md": { loc: 10000, status: "counted" } });
  const before = JSON.stringify(layout.root, (key, value) => key === "parent" ? undefined : value);
  const camera = { x: 10, y: 20, z: .5 };
  const details = sourceDetails(sourceFiles(index), [...layout.nodes.values()], new Set(), camera, { w: 800, h: 600 }, 1, "tiny.ts");
  expect(details).toHaveLength(1);
  expect(details[0].floating).toBe(true);
  expect(details[0].rows).toHaveLength(2);
  const row = details[0].rows[1], point = detailEndpoints(details, camera).get(row.target.id)!;
  expect((point.x + camera.x) * camera.z).toBe(row.x + row.w / 2);
  expect((point.y + camera.y) * camera.z).toBe(row.y + row.h / 2);
  expect(JSON.stringify(layout.root, (key, value) => key === "parent" ? undefined : value)).toBe(before);
});

test("detail is bounded and later targets remain reachable through paging", () => {
  const file = sourceFiles(index).get("tiny.ts")![0];
  const targets = Array.from({ length: 500 }, (_, i) => ({ ...file, id: `target-${i}` }));
  const node = fileMapLayout(["tiny.ts"]).nodes.get("tiny.ts")!;
  const detail = sourceDetails(new Map([["tiny.ts", targets]]), [node], new Set(), { x: 0, y: 0, z: 1 }, { w: 800, h: 600 }, 1, "tiny.ts", 62)[0];
  expect(detail.rows).toHaveLength(4);
  expect(detail.rows[3].target.id).toBe("target-499");
});


test("Source is a projection of authored links, including document and stale targets", () => {
  const combined = projectGraph(index, { view: "all" }).nodes.filter(node => node.kind === "file" || node.kind === "code");
  expect(linkedSourcesGraph(index).nodes).toEqual(combined);
  expect(linkedSourcesGraph(index).nodes.filter(node => node.sourceLink?.kind === "document")).toHaveLength(2);
});


test("repository selections never manufacture Source targets", () => {
  expect(sourceSelectionId(index, { kind: "code", id: fileSelectionId("unlinked.ts") })).toBeUndefined();
  expect(sourceSelectionId(index, { kind: "code", id: fileSelectionId("tiny.ts") })).toBe("file:tiny.ts");
  expect(linkedSourcesGraph(index).nodes.some(node => node.id === "file:unlinked.ts")).toBe(false);
  expect(linkedSourcesGraph(indexModel({ schema: "3.2", issues: [], id: "empty", name: "Empty", description: "", items: [] }))).toEqual({ nodes: [], connections: [], omitted: 0 });
});
