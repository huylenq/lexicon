// Layout invariants after ELK placement: every model node is positioned,
// every model edge whose endpoints were placed is returned, children sit
// inside their cluster. xyflow draws the lines — this file no longer checks
// polyline geometry.

import "./elk-node-setup";
import { describe, test, expect } from "bun:test";
import { join } from "node:path";

import {
  buildModel,
  type EdgeKind,
  type GraphEdge,
  type GraphModel,
  type GraphNode,
  type Lens,
} from "./build-graph";
import { layoutModel, type LayoutResult } from "./layout";
import { loadLexicon } from "../../../../server/loader.ts";
import type { ResolvedGraph as ServerResolvedGraph } from "../../../../server/schema.ts";
import type { ResolvedGraph as ClientResolvedGraph } from "../types";

interface LayoutProblem {
  reason: string;
  detail?: string;
}

function validateLayout(model: GraphModel, layout: LayoutResult): LayoutProblem[] {
  const problems: LayoutProblem[] = [];
  const positioned = new Map(layout.nodes.map(n => [n.id, n]));

  for (const n of model.nodes) {
    const p = positioned.get(n.id);
    if (!p) {
      problems.push({ reason: "node-not-positioned", detail: n.id });
      continue;
    }
    if (![p.x, p.y, p.width, p.height].every(Number.isFinite)) {
      problems.push({ reason: "non-finite-geometry", detail: n.id });
    }
    if (p.width <= 0 || p.height <= 0) {
      problems.push({ reason: "non-positive-size", detail: `${n.id} ${p.width}x${p.height}` });
    }
  }

  for (const n of layout.nodes) {
    if (!n.parent) continue;
    const parent = positioned.get(n.parent);
    if (!parent) {
      problems.push({ reason: "parent-not-positioned", detail: `${n.id} parent=${n.parent}` });
      continue;
    }
    const inside =
      n.x >= parent.x - 0.5 &&
      n.y >= parent.y - 0.5 &&
      n.x + n.width <= parent.x + parent.width + 0.5 &&
      n.y + n.height <= parent.y + parent.height + 0.5;
    if (!inside) {
      problems.push({
        reason: "child-outside-parent",
        detail: `${n.id} @(${n.x},${n.y},${n.width}x${n.height}) parent ${n.parent} @(${parent.x},${parent.y},${parent.width}x${parent.height})`,
      });
    }
  }

  const layoutEdgeIds = new Set(layout.edges.map(e => e.id));
  for (const e of model.edges) {
    const src = positioned.has(e.source);
    const tgt = positioned.has(e.target);
    if (src && tgt && !layoutEdgeIds.has(e.id)) {
      problems.push({ reason: "edge-dropped", detail: `${e.kind} ${e.source} → ${e.target} (${e.id})` });
    }
  }
  for (const e of layout.edges) {
    if (!positioned.has(e.source) || !positioned.has(e.target)) {
      problems.push({
        reason: "edge-endpoint-not-positioned",
        detail: `${e.kind} ${e.source} → ${e.target} (${e.id})`,
      });
    }
  }

  return problems;
}

function formatProblems(problems: LayoutProblem[]): string {
  if (problems.length === 0) return "(none)";
  return problems.map(p => `  • ${p.reason}${p.detail ? `: ${p.detail}` : ""}`).join("\n");
}

function expectSound(model: GraphModel, layout: LayoutResult): void {
  const problems = validateLayout(model, layout);
  expect(problems, formatProblems(problems)).toEqual([]);
}

function leaf(id: string, name: string, parent?: string): GraphNode {
  return { id, kind: "term", name, parent, width: 120, height: 48 };
}

function cluster(id: string, name: string): GraphNode {
  return { id, kind: "bounded-context", name, isCluster: true, width: 0, height: 0 };
}

function seamEdge(id: string, source: string, target: string): GraphEdge {
  return { id, source, target, kind: "seam", directed: true, label: "test-seam" };
}

describe("layoutModel — synthetic graphs", () => {
  test("cross-cluster seam: both endpoints placed, edge preserved", async () => {
    const model: GraphModel = {
      lens: "ownership",
      topLevelIds: ["ctx-a", "ctx-b"],
      nodes: [
        cluster("ctx-a", "Context A"),
        cluster("ctx-b", "Context B"),
        leaf("ctx-a:term:alpha", "alpha", "ctx-a"),
        leaf("ctx-b:term:beta", "beta", "ctx-b"),
      ],
      edges: [seamEdge("seam:alpha->beta", "ctx-a:term:alpha", "ctx-b:term:beta")],
    };
    const layout = await layoutModel(model);
    expectSound(model, layout);
    expect(layout.edges).toHaveLength(1);
  });

  test("within-cluster seam: children stay inside the cluster", async () => {
    const model: GraphModel = {
      lens: "ownership",
      topLevelIds: ["ctx-a"],
      nodes: [
        cluster("ctx-a", "Context A"),
        leaf("ctx-a:term:alpha", "alpha", "ctx-a"),
        leaf("ctx-a:term:beta", "beta", "ctx-a"),
      ],
      edges: [seamEdge("seam:alpha->beta", "ctx-a:term:alpha", "ctx-a:term:beta")],
    };
    const layout = await layoutModel(model);
    expectSound(model, layout);
  });

  test("disambiguates pair: both endpoints placed", async () => {
    const model: GraphModel = {
      lens: "ownership",
      topLevelIds: ["ctx-a", "ctx-b"],
      nodes: [
        cluster("ctx-a", "A"),
        cluster("ctx-b", "B"),
        leaf("ctx-a:term:foo", "foo", "ctx-a"),
        leaf("ctx-b:term:foo", "foo", "ctx-b"),
      ],
      edges: [{
        id: "dis:ctx-a:term:foo|ctx-b:term:foo",
        source: "ctx-a:term:foo",
        target: "ctx-b:term:foo",
        kind: "disambiguates",
        directed: false,
      }],
    };
    const layout = await layoutModel(model);
    expectSound(model, layout);
  });

  test("narrative edge is withheld from ELK but still returned", async () => {
    const model: GraphModel = {
      lens: "ownership",
      topLevelIds: ["ctx-a", "ctx-b"],
      nodes: [
        cluster("ctx-a", "A"),
        cluster("ctx-b", "B"),
        leaf("ctx-a:term:foo", "foo", "ctx-a"),
        leaf("ctx-b:term:bar", "bar", "ctx-b"),
      ],
      edges: [{
        id: "nar:ctx-a:term:foo->ctx-b:term:bar",
        source: "ctx-a:term:foo",
        target: "ctx-b:term:bar",
        kind: "narrative",
        directed: true,
      }],
    };
    const layout = await layoutModel(model);
    expectSound(model, layout);
    expect(layout.edges).toHaveLength(1);
    expect(layout.edges[0].kind).toBe("narrative");
  });

  test("cluster-to-cluster seam lays out", async () => {
    const model: GraphModel = {
      lens: "ownership",
      topLevelIds: ["ctx-a", "ctx-b"],
      nodes: [cluster("ctx-a", "A"), cluster("ctx-b", "B")],
      edges: [seamEdge("seam:ctx-a->ctx-b", "ctx-a", "ctx-b")],
    };
    const layout = await layoutModel(model);
    expectSound(model, layout);
  });

  test("self-loop seam lays out without crashing", async () => {
    // Sample lexicons point both upstream and downstream at the owning
    // context when the real upstream is out-of-process (billing→billing).
    const model: GraphModel = {
      lens: "ownership",
      topLevelIds: ["ctx-a"],
      nodes: [cluster("ctx-a", "A"), leaf("ctx-a:term:alpha", "alpha", "ctx-a")],
      edges: [seamEdge("seam:self", "ctx-a", "ctx-a")],
    };
    const layout = await layoutModel(model);
    expect(layout.nodes.length).toBeGreaterThan(0);
    expectSound(model, layout);
  });
});

function asClientGraph(g: ServerResolvedGraph): ClientResolvedGraph {
  return g as unknown as ClientResolvedGraph;
}

const SAMPLE_ROOT = join(import.meta.dir, "..", "..", "..", "..", "sample-lexicon");
const VIEWER_ROOT = join(import.meta.dir, "..", "..", "..", "..");

async function laidOut(projectRoot: string, lens: Lens) {
  const graph = asClientGraph(await loadLexicon(projectRoot));
  const model = buildModel(graph, lens);
  const layout = await layoutModel(model);
  return { graph, model, layout };
}

function edgesOfKind(model: GraphModel, kind: EdgeKind): GraphEdge[] {
  return model.edges.filter(e => e.kind === kind);
}

describe("buildModel — sample-lexicon emission coverage", () => {
  test("disambiguates: catalog Product/Variant/SKU triangle (≥2 edges, deduped)", async () => {
    const { model } = await laidOut(SAMPLE_ROOT, "ownership");
    expect(edgesOfKind(model, "disambiguates").length).toBeGreaterThanOrEqual(2);
  });

  test("seam directed (asymmetric upstream→downstream): ≥3 distinct-endpoint edges", async () => {
    const { model } = await laidOut(SAMPLE_ROOT, "ownership");
    const directed = edgesOfKind(model, "seam").filter(e => e.directed);
    const distinct = directed.filter(e => e.source !== e.target);
    expect(distinct.length).toBeGreaterThanOrEqual(3);
  });

  test("seam undirected (symmetric participants → pair expansion): ≥7 edges", async () => {
    const { model } = await laidOut(SAMPLE_ROOT, "ownership");
    const undirected = edgesOfKind(model, "seam").filter(e => !e.directed);
    expect(undirected.length).toBeGreaterThanOrEqual(7);
  });

  test("seam self-loop: at least one (out-of-process upstream convention)", async () => {
    const { model } = await laidOut(SAMPLE_ROOT, "ownership");
    const selfLoops = edgesOfKind(model, "seam").filter(e => e.source === e.target);
    expect(selfLoops.length).toBeGreaterThanOrEqual(1);
  });

  test("narrative: emitted from ≥2 distinct sources", async () => {
    const { model } = await laidOut(SAMPLE_ROOT, "ownership");
    const narrative = edgesOfKind(model, "narrative");
    const sources = new Set(narrative.map(e => e.source));
    expect(narrative.length).toBeGreaterThanOrEqual(20);
    expect(sources.size).toBeGreaterThanOrEqual(2);
  });

  test("narrative: at least one source is a shared-kernel", async () => {
    const { graph, model } = await laidOut(SAMPLE_ROOT, "ownership");
    const narrative = edgesOfKind(model, "narrative");
    const kernelSourced = narrative.filter(e => graph.entities[e.source]?.ref.kind === "shared-kernel");
    expect(kernelSourced.length).toBeGreaterThanOrEqual(1);
  });
});

describe("layoutModel — sample-lexicon integration", () => {
  test("ownership lens: every node placed, every edge preserved", async () => {
    const { model, layout } = await laidOut(SAMPLE_ROOT, "ownership");
    expect(model.edges.length).toBeGreaterThan(0);
    expectSound(model, layout);
  });

  test("surfaces lens: every node placed, every edge preserved", async () => {
    const { model, layout } = await laidOut(SAMPLE_ROOT, "surfaces");
    expectSound(model, layout);
  });
});

describe("layoutModel — viewer's own lexicon integration", () => {
  test("ownership lens: every node placed, every edge preserved", async () => {
    const { model, layout } = await laidOut(VIEWER_ROOT, "ownership");
    expect(model.edges.length).toBeGreaterThan(0);
    expectSound(model, layout);
  });

  test("surfaces lens: every node placed, every edge preserved", async () => {
    const { model, layout } = await laidOut(VIEWER_ROOT, "surfaces");
    expectSound(model, layout);
  });

  test("code lens: structure-tier edges emitted and laid out", async () => {
    const { model, layout } = await laidOut(VIEWER_ROOT, "code");
    expect(model.edges.length).toBeGreaterThan(0);
    for (const e of model.edges) {
      expect(["extends", "implements", "uses", "calls"]).toContain(e.kind);
    }
    expectSound(model, layout);
  });
});
