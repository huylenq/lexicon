// Catches "dangling edges" — endpoints that float free of the source/target
// rectangle after layout. An edge is connected iff its first/last point sits
// within ENDPOINT_TOLERANCE_PX of the matching node's boundary.

import "./elk-node-setup";
import { beforeAll, describe, test, expect } from "bun:test";
import { join } from "node:path";

import {
  buildModel,
  type EdgeKind,
  type GraphEdge,
  type GraphModel,
  type GraphNode,
  type Lens,
} from "./build-graph";
import {
  layoutModel,
  type LayoutOptions,
  type LayoutResult,
  type PositionedNode,
} from "./layout";
import { loadLexicon } from "../../../../server/loader.ts";
import type { ResolvedGraph as ServerResolvedGraph } from "../../../../server/schema.ts";
import type { ResolvedGraph as ClientResolvedGraph } from "../types";

// Tolerance for "first point lies on source rectangle boundary". Endpoints
// produced by `rectExit` (straight + bundled fallback) and ELK port placement
// are exactly on the rectangle; bundled Catmull-Rom uses the rectangle-clipped
// control point as the curve's start, also exact. A few px of slack absorbs
// floating-point noise without hiding real drift.
const ENDPOINT_TOLERANCE_PX = 2;

interface EdgeProblem {
  edgeId: string;
  kind: string;
  source: string;
  target: string;
  reason: string;
  detail?: string;
}

function rectDistance(p: { x: number; y: number }, n: PositionedNode): number {
  // Signed distance from point to rectangle boundary. 0 = on the boundary,
  // negative = inside, positive = outside. We want |distance| <= tolerance.
  const dx = Math.max(n.x - p.x, 0, p.x - (n.x + n.width));
  const dy = Math.max(n.y - p.y, 0, p.y - (n.y + n.height));
  if (dx === 0 && dy === 0) {
    // Inside the rectangle — distance to the nearest edge (negative).
    const insideDx = Math.min(p.x - n.x, n.x + n.width - p.x);
    const insideDy = Math.min(p.y - n.y, n.y + n.height - p.y);
    return -Math.min(insideDx, insideDy);
  }
  return Math.hypot(dx, dy);
}

function validateLayout(model: GraphModel, layout: LayoutResult): EdgeProblem[] {
  const problems: EdgeProblem[] = [];
  const modelNodeIds = new Set(model.nodes.map(n => n.id));
  const positioned = new Map(layout.nodes.map(n => [n.id, n]));

  // Narrative edges may be withheld from ELK (when narrativeRouting is one of
  // the post-layout tactics) and routed by the post-pass instead. They land
  // in layout.edges with `points: []` only when the post-pass also skipped
  // them (no source, no target, or `bundleControlPoints` produced fewer than
  // two). We DO validate narrative edges when they have points — every emitted
  // narrative is meant to produce a renderable path under any tactic.
  for (const e of layout.edges) {
    // Drop edges whose endpoints aren't in the model at all — those are bugs
    // upstream of layout and surface separately.
    if (!modelNodeIds.has(e.source)) {
      problems.push({
        edgeId: e.id, kind: e.kind, source: e.source, target: e.target,
        reason: "source-not-in-model",
      });
      continue;
    }
    if (!modelNodeIds.has(e.target)) {
      problems.push({
        edgeId: e.id, kind: e.kind, source: e.source, target: e.target,
        reason: "target-not-in-model",
      });
      continue;
    }

    const src = positioned.get(e.source);
    const tgt = positioned.get(e.target);
    if (!src) {
      problems.push({
        edgeId: e.id, kind: e.kind, source: e.source, target: e.target,
        reason: "source-not-positioned",
      });
      continue;
    }
    if (!tgt) {
      problems.push({
        edgeId: e.id, kind: e.kind, source: e.source, target: e.target,
        reason: "target-not-positioned",
      });
      continue;
    }

    // The straight-line fallback (layout.ts ~line 375) deliberately skips
    // edges whose source/target rectangles overlap: there is no clean exit
    // point, so it emits no points and the canvas omits the edge. That's a
    // legitimate visual omission — but only for overlapping rectangles. An
    // empty points array between two NON-overlapping rectangles is a bug.
    if (e.points.length === 0) {
      const ahw = src.width / 2;
      const ahh = src.height / 2;
      const bhw = tgt.width / 2;
      const bhh = tgt.height / 2;
      const acx = src.x + ahw;
      const acy = src.y + ahh;
      const bcx = tgt.x + bhw;
      const bcy = tgt.y + bhh;
      const overlapping =
        Math.abs(bcx - acx) <= ahw + bhw && Math.abs(bcy - acy) <= ahh + bhh;
      if (!overlapping) {
        problems.push({
          edgeId: e.id, kind: e.kind, source: e.source, target: e.target,
          reason: "no-points-but-rects-disjoint",
          detail: `src=(${src.x},${src.y},${src.width}x${src.height}) tgt=(${tgt.x},${tgt.y},${tgt.width}x${tgt.height})`,
        });
      }
      continue;
    }

    if (e.points.length < 2) {
      problems.push({
        edgeId: e.id, kind: e.kind, source: e.source, target: e.target,
        reason: "single-point-path",
        detail: `points=${JSON.stringify(e.points)}`,
      });
      continue;
    }

    const head = e.points[0];
    const tail = e.points[e.points.length - 1];
    const headDist = rectDistance(head, src);
    const tailDist = rectDistance(tail, tgt);

    if (headDist > ENDPOINT_TOLERANCE_PX) {
      problems.push({
        edgeId: e.id, kind: e.kind, source: e.source, target: e.target,
        reason: "head-detached-from-source",
        detail: `headDist=${headDist.toFixed(2)}px, src rect=(${src.x.toFixed(1)},${src.y.toFixed(1)},${src.width.toFixed(1)}x${src.height.toFixed(1)}), head=(${head.x.toFixed(1)},${head.y.toFixed(1)})`,
      });
    }
    if (tailDist > ENDPOINT_TOLERANCE_PX) {
      problems.push({
        edgeId: e.id, kind: e.kind, source: e.source, target: e.target,
        reason: "tail-detached-from-target",
        detail: `tailDist=${tailDist.toFixed(2)}px, tgt rect=(${tgt.x.toFixed(1)},${tgt.y.toFixed(1)},${tgt.width.toFixed(1)}x${tgt.height.toFixed(1)}), tail=(${tail.x.toFixed(1)},${tail.y.toFixed(1)})`,
      });
    }
  }

  return problems;
}

function formatProblems(problems: EdgeProblem[]): string {
  if (problems.length === 0) return "(none)";
  return problems
    .map(p => `  • [${p.kind}] ${p.source} → ${p.target} (${p.edgeId}): ${p.reason}${p.detail ? `\n    ${p.detail}` : ""}`)
    .join("\n");
}

function expectNoProblems(model: GraphModel, layout: LayoutResult): void {
  const problems = validateLayout(model, layout);
  expect(problems, formatProblems(problems)).toEqual([]);
}

// ---------- synthetic-model unit tests ----------

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
  test("single cross-cluster seam edge: both endpoints touch their rectangles", async () => {
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
    expectNoProblems(model, layout);
    expect(layout.edges).toHaveLength(1);
    expect(layout.edges[0].points.length).toBeGreaterThanOrEqual(2);
  });

  test("within-cluster seam edge: ELK-routed, endpoints on rectangles", async () => {
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
    expectNoProblems(model, layout);
  });

  test("disambiguates pair (undirected) connects both endpoints", async () => {
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
    expectNoProblems(model, layout);
  });

  test("narrative edge (bundled HEB) has clipped, connected endpoints", async () => {
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
    expectNoProblems(model, layout);
    // Narrative gets routed through bundle fallback (post-ELK), not by ELK
    // itself — assert that's actually what happened.
    expect(layout.edges[0].bundled).toBe(true);
  });

  test("cluster-to-cluster seam (system-level edge) connects rectangles", async () => {
    // Mirrors what `buildOwnership` produces when a seam's upstream/downstream
    // are bounded-contexts themselves (some lexicons do this).
    const model: GraphModel = {
      lens: "ownership",
      topLevelIds: ["ctx-a", "ctx-b"],
      nodes: [cluster("ctx-a", "A"), cluster("ctx-b", "B")],
      edges: [seamEdge("seam:ctx-a->ctx-b", "ctx-a", "ctx-b")],
    };
    const layout = await layoutModel(model);
    expectNoProblems(model, layout);
  });

  test("self-loop seam (source == target) lays out without crashing", async () => {
    // Mirrors the billing→billing convention: when a seam's upstream is
    // out-of-process, sample lexicons point both upstream and downstream at
    // the owning context as a placeholder. ELK handles this as a degenerate
    // edge; the validator skips overlap-induced empty-points, so we mostly
    // care that the layout completes and produces a valid result object.
    const model: GraphModel = {
      lens: "ownership",
      topLevelIds: ["ctx-a"],
      nodes: [cluster("ctx-a", "A"), leaf("ctx-a:term:alpha", "alpha", "ctx-a")],
      edges: [seamEdge("seam:self", "ctx-a", "ctx-a")],
    };
    const layout = await layoutModel(model);
    expect(layout.nodes.length).toBeGreaterThan(0);
    // The self-loop either gets ELK-routed or falls into the overlap-skip
    // branch — both are acceptable, but the test must not throw.
  });
});

// ---------- integration: real sample-lexicon ----------

// `loadLexicon` returns the server's ResolvedGraph; the client's mirror type
// is the same shape modulo the loader-only `LoadIssue.path` casing. Cast
// across the wire equivalent.
function asClientGraph(g: ServerResolvedGraph): ClientResolvedGraph {
  return g as unknown as ClientResolvedGraph;
}

const SAMPLE_ROOT = join(import.meta.dir, "..", "..", "..", "..", "sample-lexicon");
const VIEWER_ROOT = join(import.meta.dir, "..", "..", "..", "..");

async function laidOut(
  projectRoot: string,
  lens: Lens,
  layoutOpts: LayoutOptions = {},
) {
  const graph = asClientGraph(await loadLexicon(projectRoot));
  const model = buildModel(graph, lens);
  const layout = await layoutModel(model, layoutOpts);
  return { graph, model, layout };
}

// ---------- emission coverage: what build-graph actually produces ----------
//
// The connectedness checks below only validate edges that already exist. They
// pass vacuously if build-graph stops emitting an edge kind. These tests lock
// in *which* kinds the sample lexicon exercises, so a regression that mutes a
// kind fails loudly. Counts are lower bounds — the sample is intentionally
// minimal and can grow; assertions stay green as long as the floor holds.

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
    // Distinct-endpoint count excludes self-loops (billing→billing convention),
    // since those don't represent a real graph traversal — see the dedicated
    // self-loop test below.
    const distinct = directed.filter(e => e.source !== e.target);
    expect(distinct.length).toBeGreaterThanOrEqual(3);
  });

  test("seam undirected (symmetric participants → pair expansion): ≥7 edges", async () => {
    // Symmetric seams emit one edge per unordered pair of participants. The
    // sample's event-bus has 4 participants (C(4,2)=6) plus a 2-participant
    // shipping↔inventory partnership = 7. Floor protects against the build
    // collapsing participant lists to a single edge.
    const { model } = await laidOut(SAMPLE_ROOT, "ownership");
    const undirected = edgesOfKind(model, "seam").filter(e => !e.directed);
    expect(undirected.length).toBeGreaterThanOrEqual(7);
  });

  test("seam self-loop: at least one (out-of-process upstream convention)", async () => {
    // Sample's billing→billing seam encodes the convention that out-of-process
    // upstreams don't get modeled as standalone contexts. The synthetic test
    // above covers the layout robustness; this one covers the emission.
    const { model } = await laidOut(SAMPLE_ROOT, "ownership");
    const selfLoops = edgesOfKind(model, "seam").filter(e => e.source === e.target);
    expect(selfLoops.length).toBeGreaterThanOrEqual(1);
  });

  test("narrative: emitted from ≥2 distinct sources (multi-source bundling)", async () => {
    // Bundle routing's value shows up across multiple origins. Asserting ≥2
    // sources catches the single-source regression (which would let a future
    // refactor silently drop one of the narrative-bearing entities).
    const { model } = await laidOut(SAMPLE_ROOT, "ownership");
    const narrative = edgesOfKind(model, "narrative");
    const sources = new Set(narrative.map(e => e.source));
    expect(narrative.length).toBeGreaterThanOrEqual(20);
    expect(sources.size).toBeGreaterThanOrEqual(2);
  });

  test("narrative: at least one source is a shared-kernel", async () => {
    // Regression guard for the kernel-narrative wiring (loader's
    // proseFieldsByKind + self-owner kernelId on the kernel entity). If this
    // ever drops to zero, narrative refs from a kernel stopped resolving.
    const { graph, model } = await laidOut(SAMPLE_ROOT, "ownership");
    const narrative = edgesOfKind(model, "narrative");
    const kernelSourced = narrative.filter(e => graph.entities[e.source]?.ref.kind === "shared-kernel");
    expect(kernelSourced.length).toBeGreaterThanOrEqual(1);
  });

});

// ---------- narrative routing tactics ----------
//
// Four `narrativeRouting` modes produce four observably different shapes for
// the same narrative edge set. These tests pin the per-tactic shape so a
// regression in dispatch (e.g. "elk" silently falling through to "heb") fails
// loudly.

describe("layoutModel — narrative routing tactics", () => {
  // Load + build once; each test reuses the same model with a different
  // routing tactic. Layout is per-test (each tactic produces different
  // PositionedEdges).
  let model: GraphModel;
  beforeAll(async () => {
    const graph = asClientGraph(await loadLexicon(SAMPLE_ROOT));
    model = buildModel(graph, "ownership");
  });

  test('"elk": narrative edges submitted to ELK, not bundled', async () => {
    // Connectedness is *not* asserted here. Narrative edges in the sample
    // include cluster-as-endpoint patterns (e.g. kernel → its own child term)
    // that ELK can't cleanly attach when the edge sits at root with
    // INCLUDE_CHILDREN — section coords come back in the cluster's local
    // space and validateLayout flags the endpoints as detached. This is a
    // pre-existing limitation that only surfaces under "elk" mode (the other
    // tactics route post-layout in absolute space). HEB remains the default
    // for that reason.
    const layout = await layoutModel(model, { narrativeRouting: "elk" });
    const narrative = layout.edges.filter(e => e.kind === "narrative");
    expect(narrative.length).toBeGreaterThan(0);
    // ELK-routed edges never have the bundled flag set (only HEB sets it).
    for (const e of narrative) {
      expect(e.bundled ?? false).toBe(false);
    }
  });

  test('"heb": narrative edges marked bundled = true', async () => {
    const layout = await layoutModel(model, { narrativeRouting: "heb" });
    const narrative = layout.edges.filter(e => e.kind === "narrative");
    expect(narrative.length).toBeGreaterThan(0);
    // The HEB fallback always sets bundled=true when control points are emitted.
    const bundled = narrative.filter(e => e.bundled);
    expect(bundled.length).toBeGreaterThan(0);
    expectNoProblems(model, layout);
  });

  test('"elbow": narrative edges HVH/VHV polylines, not bundled', async () => {
    const layout = await layoutModel(model, { narrativeRouting: "elbow" });
    const narrative = layout.edges.filter(e => e.kind === "narrative");
    expect(narrative.length).toBeGreaterThan(0);
    // Elbow router produces exactly 4 control points (exit, channel, channel, enter)
    // for non-overlapping rectangles. None marked bundled.
    const elbow = narrative.filter(e => e.points.length === 4 && !e.bundled);
    expect(elbow.length).toBeGreaterThan(0);
    expectNoProblems(model, layout);
  });

  test('"astar": narrative edges orthogonal corner-only paths, not bundled', async () => {
    const layout = await layoutModel(model, { narrativeRouting: "astar" });
    const narrative = layout.edges.filter(e => e.kind === "narrative");
    expect(narrative.length).toBeGreaterThan(0);
    // A*-routed edges are orthogonal polylines (every segment axis-aligned),
    // not bundled. Verify at least one edge has the orthogonal property.
    const astarRouted = narrative.filter(e => e.points.length >= 2 && !e.bundled && isOrthogonal(e.points));
    expect(astarRouted.length).toBeGreaterThan(0);
    expectNoProblems(model, layout);
  });
});

// Every consecutive pair shares either x or y (axis-aligned segment).
function isOrthogonal(points: { x: number; y: number }[]): boolean {
  for (let i = 1; i < points.length; i++) {
    const dx = Math.abs(points[i].x - points[i - 1].x);
    const dy = Math.abs(points[i].y - points[i - 1].y);
    // Allow a sub-pixel tolerance for floating-point grid quantization noise.
    if (dx > 0.5 && dy > 0.5) return false;
  }
  return true;
}

describe("layoutModel — sample-lexicon integration", () => {
  test("ownership lens: every emitted edge connects to its endpoints", async () => {
    const { model, layout } = await laidOut(SAMPLE_ROOT, "ownership");
    // Sanity: the sample lexicon should produce at least some edges, else the
    // test is vacuously passing.
    expect(model.edges.length).toBeGreaterThan(0);
    expectNoProblems(model, layout);
  });

  test("surfaces lens: every emitted edge connects to its endpoints", async () => {
    const { model, layout } = await laidOut(SAMPLE_ROOT, "surfaces");
    expectNoProblems(model, layout);
  });
});

describe("layoutModel — viewer's own lexicon integration", () => {
  test("ownership lens: every emitted edge connects to its endpoints", async () => {
    const { model, layout } = await laidOut(VIEWER_ROOT, "ownership");
    expect(model.edges.length).toBeGreaterThan(0);
    expectNoProblems(model, layout);
  });

  test("surfaces lens: every emitted edge connects to its endpoints", async () => {
    const { model, layout } = await laidOut(VIEWER_ROOT, "surfaces");
    expectNoProblems(model, layout);
  });

  test("code lens: structure-tier edges emitted and connected", async () => {
    // The code-intel pass derives extends/implements/uses edges between anchored
    // atoms by parsing their anchor files (tree-sitter). On the viewer's own cold
    // layer this yields the lexicon-loading composition chain (ResolvedGraph →
    // ResolvedEntity → EntityRef, …). Assert edges exist and lay out cleanly.
    const { model, layout } = await laidOut(VIEWER_ROOT, "code");
    expect(model.edges.length).toBeGreaterThan(0);
    for (const e of model.edges) {
      expect(["extends", "implements", "uses", "calls"]).toContain(e.kind);
    }
    expectNoProblems(model, layout);
  });
});
