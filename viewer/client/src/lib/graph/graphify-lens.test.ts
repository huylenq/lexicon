// Pure-transform tests for the graphify (territory) lens builder: a server
// neighborhood → GraphModel mapping. No DOM / ELK needed.

import { test, expect } from "bun:test";
import {
  buildGraphifyModel,
  relationEdgeKind,
  parseSourceLocation,
  normalizeSourceFile,
} from "./graphify-lens";
import type { GraphifyNeighborhood } from "@/lib/types";

function nb(overrides: Partial<GraphifyNeighborhood> = {}): GraphifyNeighborhood {
  return {
    seed: "a",
    hops: 1,
    truncated: false,
    relations: null,
    hiddenTests: 0,
    nodes: [
      { id: "a", label: "a()", sourceFile: "a.ts", sourceLocation: "L1", community: 1, normLabel: "a()", fileType: "code", degree: 3, hop: 0 },
      { id: "b", label: "b()", sourceFile: "b.ts", sourceLocation: "L2", community: 2, normLabel: "b()", fileType: "code", degree: 1, hop: 1 },
    ],
    edges: [
      { source: "a", target: "b", relation: "calls", confidence: "EXTRACTED" },
    ],
    ...overrides,
  };
}

test("parseSourceLocation: L<n> → line number; empty/garbage → undefined", () => {
  expect(parseSourceLocation("L21")).toBe(21);
  expect(parseSourceLocation("L1")).toBe(1);
  expect(parseSourceLocation("")).toBeUndefined();
  expect(parseSourceLocation(null)).toBeUndefined();
  expect(parseSourceLocation(undefined)).toBeUndefined();
  expect(parseSourceLocation("L0")).toBeUndefined(); // 0 is not a valid line
  expect(parseSourceLocation("nonsense")).toBeUndefined();
});

test("normalizeSourceFile: strips leading ./, leaves root-relative paths intact", () => {
  expect(normalizeSourceFile("dana-agent/src/x.py")).toBe("dana-agent/src/x.py");
  expect(normalizeSourceFile("./web/app.ts")).toBe("web/app.ts");
  expect(normalizeSourceFile("")).toBe("");
});

test("relationEdgeKind: known relations bucket, unknown → references", () => {
  expect(relationEdgeKind("calls")).toBe("calls");
  expect(relationEdgeKind("imports_from")).toBe("imports");
  expect(relationEdgeKind("inherits")).toBe("extends");
  expect(relationEdgeKind("rationale_for")).toBe("references");
  expect(relationEdgeKind("some_new_relation")).toBe("references");
});

test("buildGraphifyModel: nodes get kind 'graphify', not an EntityKind", () => {
  const m = buildGraphifyModel(nb());
  expect(m.lens).toBe("graphify");
  expect(m.nodes.length).toBe(2);
  expect(m.nodes.every(n => n.kind === "graphify")).toBe(true);
  expect(m.nodes[0].name).toBe("a()");
  expect(m.nodes[0].width).toBeGreaterThan(0);
});

test("buildGraphifyModel: edge carries the raw relation as label + a styling kind", () => {
  const m = buildGraphifyModel(nb());
  expect(m.edges.length).toBe(1);
  expect(m.edges[0].kind).toBe("calls");
  expect(m.edges[0].label).toBe("calls");
  expect(m.edges[0].directed).toBe(true);
});

test("buildGraphifyModel: drops edges whose endpoints are absent from the node set", () => {
  const model = buildGraphifyModel(
    nb({ edges: [{ source: "a", target: "ghost", relation: "calls", confidence: "INFERRED" }] }),
  );
  expect(model.edges.length).toBe(0);
});

test("buildGraphifyModel: dedupes repeated (source,target,relation) edges", () => {
  const model = buildGraphifyModel(
    nb({
      edges: [
        { source: "a", target: "b", relation: "calls", confidence: "EXTRACTED" },
        { source: "a", target: "b", relation: "calls", confidence: "INFERRED" },
      ],
    }),
  );
  expect(model.edges.length).toBe(1);
});

test("buildGraphifyModel: references-style relations render undirected", () => {
  const model = buildGraphifyModel(
    nb({ edges: [{ source: "a", target: "b", relation: "references", confidence: "EXTRACTED" }] }),
  );
  expect(model.edges[0].directed).toBe(false);
});
