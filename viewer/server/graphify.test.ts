// Tests for the graphify lens server reader. Artifact-only, no git required —
// the fixtures aren't repos, so staleness degrades to nulls (advisory), while
// the JSON parse stays fail-fast.

import { test, expect } from "bun:test";
import { join } from "node:path";
import {
  parseGraphJson,
  loadGraphify,
  probeGraphify,
  neighborhood,
  searchNodes,
  topNodes,
  nodeDetail,
  isTestFile,
  GraphifyParseError,
} from "./graphify.ts";

const FIX = join(import.meta.dir, "..", "test-fixtures", "graphify");
const SMALL = join(FIX, "small");
const MALFORMED = join(FIX, "malformed");
const ABSENT = join(FIX, "absent");
const RANKING = join(FIX, "ranking");
const HIDETESTS = join(FIX, "hidetests");

test("parse: small fixture — counts, histogram, communities, built_at_commit", async () => {
  const load = await loadGraphify(SMALL);
  expect(load.status).toBe("ok");
  if (load.status !== "ok") return;
  const g = load.parsed;
  expect(g.nodes.length).toBe(9);
  expect(g.edges.length).toBe(11);
  expect(g.communityCount).toBe(3);
  expect(g.builtAtCommit).toBe("0000000000000000000000000000000000000000");
  expect(g.relationHistogram.contains).toBe(3);
  expect(g.relationHistogram.calls).toBe(3);
  expect(g.relationHistogram.rationale_for).toBe(1);
});

test("parse: collision defect surfaced as a dropped-node warning, not a silent drop", async () => {
  const load = await loadGraphify(SMALL);
  expect(load.status).toBe("ok");
  if (load.status !== "ok") return;
  // The fixture plants one edge whose target id is absent from the node set.
  expect(load.parsed.droppedNodeRefs).toBe(1);
  expect(load.warnings.length).toBe(1);
  expect(load.warnings[0]).toContain("missing from the graph");
});

test("probe: staleness degrades gracefully when the artifact dir is not a git repo", async () => {
  const probe = await probeGraphify(SMALL);
  expect(probe.status).toBe("ok");
  if (probe.status !== "ok") return;
  expect(probe.nodeCount).toBe(9);
  expect(probe.edgeCount).toBe(11);
  // No git repo → no HEAD, no commit count; stale is a conservative false.
  expect(probe.staleness.commitsBehind).toBeNull();
  expect(probe.staleness.stale).toBe(false);
  expect(Number.isFinite(probe.staleness.artifactMtime)).toBe(true);
});

test("fail-fast: malformed graph.json → unreadable (no silent empty graph)", async () => {
  const load = await loadGraphify(MALFORMED);
  expect(load.status).toBe("unreadable");
  if (load.status !== "unreadable") return;
  expect(load.error).toContain("not valid JSON");
  const probe = await probeGraphify(MALFORMED);
  expect(probe.status).toBe("unreadable");
});

test("fail-fast: structural violations throw GraphifyParseError", () => {
  expect(() => parseGraphJson("[]")).toThrow(GraphifyParseError);
  expect(() => parseGraphJson('{"nodes":{}}')).toThrow(GraphifyParseError);
  expect(() => parseGraphJson('{"nodes":[],"links":{}}')).toThrow(GraphifyParseError);
  expect(() => parseGraphJson('{"nodes":[{"label":"x"}],"links":[]}')).toThrow(GraphifyParseError);
});

test("absent: no graphify-out → clean not-present", async () => {
  const load = await loadGraphify(ABSENT);
  expect(load.status).toBe("absent");
  const probe = await probeGraphify(ABSENT);
  expect(probe.status).toBe("absent");
});

test("neighborhood: 1-hop induced subgraph around a seed, dangling endpoint excluded", async () => {
  const load = await loadGraphify(SMALL);
  if (load.status !== "ok") throw new Error("fixture load failed");
  const sub = neighborhood(load.parsed, "server_loader_load_lexicon", { hops: 1 });
  expect(sub).not.toBeNull();
  if (!sub) return;
  const ids = new Set(sub.nodes.map(n => n.id));
  expect(ids.has("server_loader_load_lexicon")).toBe(true); // seed, hop 0
  expect(ids.has("server_loader_resolve")).toBe(true);      // calls
  expect(ids.has("server_loader_py")).toBe(true);           // contains
  expect(ids.has("server_graphify_parse")).toBe(true);      // calls
  // Dangling endpoint is never a node — it can't enter the induced subgraph.
  expect(ids.has("__dropped_by_collision__")).toBe(false);
  expect(sub.nodes.find(n => n.id === "server_loader_load_lexicon")!.hop).toBe(0);
});

test("neighborhood: relation filter restricts traversal", async () => {
  const load = await loadGraphify(SMALL);
  if (load.status !== "ok") throw new Error("fixture load failed");
  const sub = neighborhood(load.parsed, "server_loader_load_lexicon", {
    hops: 1,
    relations: ["contains"],
  });
  if (!sub) throw new Error("null neighborhood");
  const ids = new Set(sub.nodes.map(n => n.id));
  // Only the `contains` edge from loader.py reaches the seed; the `calls`
  // targets are filtered out.
  expect(ids.has("server_loader_py")).toBe(true);
  expect(ids.has("server_loader_resolve")).toBe(false);
  expect(sub.edges.every(e => e.relation === "contains")).toBe(true);
});

test("neighborhood: node cap truncates and flags it", async () => {
  const load = await loadGraphify(SMALL);
  if (load.status !== "ok") throw new Error("fixture load failed");
  const sub = neighborhood(load.parsed, "server_loader_py", { hops: 4, cap: 3 });
  if (!sub) throw new Error("null neighborhood");
  expect(sub.nodes.length).toBeLessThanOrEqual(3);
  expect(sub.truncated).toBe(true);
});

test("isTestFile: matches py + ts/js test conventions, not production files", () => {
  expect(isTestFile("app/tests/test_alpha.py")).toBe(true); // tests/ dir
  expect(isTestFile("app/test_run.py")).toBe(true);         // test_*.py
  expect(isTestFile("app/beta_test.py")).toBe(true);        // *_test.*
  expect(isTestFile("web/GammaView.test.ts")).toBe(true);   // *.test.*
  expect(isTestFile("app/run.py")).toBe(false);
  expect(isTestFile("web/protest.py")).toBe(false);         // not a test prefix
  expect(isTestFile("")).toBe(false);
});

test("neighborhood: hideTests filters test-file nodes before the cap", async () => {
  const load = await loadGraphify(HIDETESTS);
  if (load.status !== "ok") throw new Error("hidetests fixture load failed");
  const g = load.parsed;

  // OFF: all 6 neighbors + seed present, nothing hidden.
  const off = neighborhood(g, "seed", { hops: 1, hideTests: false })!;
  expect(off.nodes.length).toBe(7);
  expect(off.hiddenTests).toBe(0);
  expect(off.nodes.some(n => n.id === "t_dir")).toBe(true);

  // ON: the three test nodes drop out; the three helpers + seed remain.
  const on = neighborhood(g, "seed", { hops: 1, hideTests: true })!;
  expect(on.nodes.length).toBe(4);
  expect(on.hiddenTests).toBe(3);
  expect(on.nodes.some(n => ["t_dir", "t_suffix", "t_dot"].includes(n.id))).toBe(false);

  // Cap applies AFTER filtering: tests are encountered first in adjacency order
  // but never consume budget, so a cap of 3 still yields 2 real helpers + seed
  // (not 3 slots wasted on tests) and flags truncation.
  const capped = neighborhood(g, "seed", { hops: 1, hideTests: true, cap: 3 })!;
  expect(capped.nodes.length).toBe(3);
  expect(capped.truncated).toBe(true);
  expect(capped.hiddenTests).toBe(3);
  expect(capped.nodes.every(n => n.id === "seed" || n.id.startsWith("h"))).toBe(true);
});

test("nodeDetail: groups relations by kind + direction with neighbors and confidence", async () => {
  const load = await loadGraphify(SMALL);
  if (load.status !== "ok") throw new Error("fixture load failed");
  const g = load.parsed;

  const d = nodeDetail(g, "server_loader_load_lexicon");
  expect(d).not.toBeNull();
  if (!d) return;
  expect(d.degree).toBe(3);
  expect(d.domainDegree).toBe(2); // two calls-out; the contains-in is scaffolding

  const callsOut = d.groups.find(x => x.relation === "calls" && x.direction === "out");
  expect(callsOut).toBeTruthy();
  expect(callsOut!.count).toBe(2);
  const callTargets = new Set(callsOut!.neighbors.map(n => n.id));
  expect(callTargets.has("server_loader_resolve")).toBe(true);
  expect(callTargets.has("server_graphify_parse")).toBe(true);
  // confidence mix carried as provenance (one EXTRACTED, one INFERRED).
  expect(callsOut!.confidence.EXTRACTED).toBe(1);
  expect(callsOut!.confidence.INFERRED).toBe(1);

  expect(d.groups.some(x => x.relation === "contains" && x.direction === "in")).toBe(true);
});

test("nodeDetail: skips dangling (dropped-node) endpoints; unknown id → null", async () => {
  const load = await loadGraphify(SMALL);
  if (load.status !== "ok") throw new Error("fixture load failed");
  const g = load.parsed;
  // parseGraphJson has an outgoing `calls` to the planted missing node — it must
  // NOT produce a calls/out group (the endpoint isn't a real node).
  const d = nodeDetail(g, "server_graphify_parse")!;
  expect(d.groups.some(x => x.relation === "calls" && x.direction === "out")).toBe(false);
  expect(nodeDetail(g, "does_not_exist")).toBeNull();
});

test("neighborhood: unknown seed → null", async () => {
  const load = await loadGraphify(SMALL);
  if (load.status !== "ok") throw new Error("fixture load failed");
  expect(neighborhood(load.parsed, "does_not_exist", {})).toBeNull();
});

test("search: label match ranked by degree; empty query → domain-ranked suggestions", async () => {
  const load = await loadGraphify(SMALL);
  if (load.status !== "ok") throw new Error("fixture load failed");
  const hits = searchNodes(load.parsed, "resolve", 10);
  expect(hits.length).toBeGreaterThan(0);
  expect(hits.some(h => h.id === "server_loader_resolve")).toBe(true);
  // Empty query delegates to topNodes (domain-ranked, file-required).
  expect(searchNodes(load.parsed, "", 3).length).toBe(3);
});

test("topNodes: excludes fileless builtins and ignores `contains` scaffolding when ranking", async () => {
  const load = await loadGraphify(RANKING);
  if (load.status !== "ok") throw new Error("ranking fixture load failed");
  const g = load.parsed;

  // `Path` is a fileless builtin — it has a real domain edge (so it WOULD show
  // up on degree alone) yet must not appear, because you can't explore a node
  // that comes from nowhere in the project.
  expect(g.domainDegree.get("builtin_path")).toBe(1);
  const top = topNodes(g, 20);
  expect(top.some(h => h.id === "builtin_path")).toBe(false);
  expect(top.every(h => h.sourceFile !== "")).toBe(true);

  // `hub` has the highest RAW degree (4 `contains` children) but zero domain
  // degree, so the contains-star must rank below the real domain symbols.
  expect(g.degree.get("hub")).toBe(4);
  expect(g.domainDegree.get("hub") ?? 0).toBe(0); // no domain edges → no map entry
  const rankOf = (id: string) => top.findIndex(h => h.id === id);
  expect(rankOf("hub")).toBeGreaterThan(rankOf("dom_a"));
  expect(rankOf("hub")).toBeGreaterThan(rankOf("dom_b"));
  expect(rankOf("hub")).toBeGreaterThan(rankOf("dom_c"));

  // The top three are the domain symbols (dom_a/dom_c at domain degree 4, dom_b
  // at 3), in some order — not the higher-raw-degree hub.
  const topThree = new Set(top.slice(0, 3).map(h => h.id));
  expect(topThree).toEqual(new Set(["dom_a", "dom_b", "dom_c"]));

  // Search keeps the full match set — "path" still finds the fileless builtin —
  // but ranks by domain degree, so a domain symbol matching the same query
  // (PathResolver, dom 2) outranks the builtin (Path, dom 1).
  const pathHits = searchNodes(g, "path", 5);
  const ids = pathHits.map(h => h.id);
  expect(ids).toContain("dom_path");
  expect(ids).toContain("builtin_path"); // still findable by name
  expect(ids.indexOf("dom_path")).toBeLessThan(ids.indexOf("builtin_path"));
});
