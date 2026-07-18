import { describe, test, expect } from "bun:test";
import type { AnchorFinding, Contradiction, ModelHealthReport } from "../types";
import {
  aggregateAnchorStatus,
  anchorBadge,
  anchorCrystallizeSuggestion,
  contradictionCrystallizeSuggestion,
  contradictionForEdge,
  contradictionStyle,
  edgeContradictionKey,
  indexAnchors,
  indexContradictions,
} from "./health-style";

const anchor = (over: Partial<AnchorFinding>): AnchorFinding => ({
  fqid: "context/a/term/x",
  symbol: "Foo",
  file: "src/foo.ts",
  status: "healthy",
  ...over,
});

const contra = (over: Partial<Contradiction>): Contradiction => ({
  kind: "boundary-leak",
  confidence: "confirmed",
  detail: "x",
  ...over,
});

describe("anchor → badge", () => {
  test("healthy yields no badge", () => {
    expect(anchorBadge("healthy")).toBeNull();
    expect(anchorBadge(null)).toBeNull();
  });

  test("drifted is amber 'anchor moved'", () => {
    const b = anchorBadge("drifted")!;
    expect(b.label).toBe("anchor moved");
    expect(b.colorVar).toBe("var(--color-warn)");
    expect(b.glyph).toBeTruthy();
  });

  test("dangling is alert 'anchor broken'", () => {
    const b = anchorBadge("dangling")!;
    expect(b.label).toBe("anchor broken");
    expect(b.colorVar).toBe("var(--color-alert)");
  });

  test("external is muted 'external dep'", () => {
    const b = anchorBadge("external")!;
    expect(b.label).toBe("external dep");
    expect(b.colorVar).toBe("var(--color-fg-3)");
  });
});

describe("aggregateAnchorStatus — worst wins", () => {
  test("empty / all-healthy collapses to null", () => {
    expect(aggregateAnchorStatus(undefined)).toBeNull();
    expect(aggregateAnchorStatus([])).toBeNull();
    expect(aggregateAnchorStatus([anchor({ status: "healthy" })])).toBeNull();
  });

  test("dangling beats drifted beats external", () => {
    expect(
      aggregateAnchorStatus([anchor({ status: "external" }), anchor({ status: "drifted" })]),
    ).toBe("drifted");
    expect(
      aggregateAnchorStatus([
        anchor({ status: "drifted" }),
        anchor({ status: "dangling" }),
        anchor({ status: "healthy" }),
      ]),
    ).toBe("dangling");
  });
});

describe("indexAnchors", () => {
  test("groups findings by fqid", () => {
    const report = {
      anchors: [
        anchor({ fqid: "a", status: "drifted" }),
        anchor({ fqid: "a", status: "dangling" }),
        anchor({ fqid: "b", status: "external" }),
      ],
      contradictions: [],
      deadWeight: [],
      generatedAt: "",
    } as ModelHealthReport;
    const idx = indexAnchors(report);
    expect(idx.get("a")).toHaveLength(2);
    expect(idx.get("b")).toHaveLength(1);
    expect(indexAnchors(null).size).toBe(0);
  });
});

describe("contradiction → style", () => {
  test("confirmed edge-driven is solid alert with context label", () => {
    const s = contradictionStyle(
      contra({ confidence: "confirmed", sourceContext: "a", targetContext: "b" }),
    );
    expect(s.variant).toBe("execution-alert");
    expect(s.stroke).toBe("var(--color-alert)");
    expect(s.dasharray).toBeUndefined();
    expect(s.contextLabel).toBe("a → b");
    expect(s.struck).toBe(false);
  });

  test("possible (degraded) edge-driven is dotted alert", () => {
    const s = contradictionStyle(contra({ confidence: "possible" }));
    expect(s.variant).toBe("execution-alert");
    expect(s.dasharray).toBeTruthy();
    expect(s.strokeWidth).toBeLessThan(1.9);
  });

  test("unsupported-seam is ghosted + struck", () => {
    const s = contradictionStyle(contra({ kind: "unsupported-seam", seamId: "seam/x" }));
    expect(s.variant).toBe("seam-ghost");
    expect(s.struck).toBe(true);
    expect(s.opacity).toBeLessThan(1);
  });

  test("title carries the broken rule detail", () => {
    expect(contradictionStyle(contra({ detail: "crosses a→b" })).title).toBe("crosses a→b");
  });
});

describe("indexContradictions + contradictionForEdge", () => {
  const report = {
    anchors: [],
    contradictions: [
      contra({
        kind: "boundary-leak",
        source: "a",
        target: "b",
        edgeKind: "calls",
        confidence: "confirmed",
      }),
      contra({ kind: "unsupported-seam", seamId: "seam/s", confidence: "confirmed" }),
    ],
    deadWeight: [],
    generatedAt: "",
  } as ModelHealthReport;
  const idx = indexContradictions(report);

  test("edge-driven keyed by source/target/kind", () => {
    expect(idx.byEdge.has(edgeContradictionKey("a", "b", "calls"))).toBe(true);
    expect(idx.bySeam.has("seam/s")).toBe(true);
  });

  test("matches an execution edge by endpoints+kind", () => {
    const c = contradictionForEdge({ source: "a", target: "b", kind: "calls" }, idx);
    expect(c?.kind).toBe("boundary-leak");
  });

  test("matches a seam edge by originSeamId", () => {
    const c = contradictionForEdge(
      { source: "a", target: "b", kind: "seam", originSeamId: "seam/s" },
      idx,
    );
    expect(c?.kind).toBe("unsupported-seam");
  });

  test("no match returns undefined", () => {
    expect(contradictionForEdge({ source: "x", target: "y", kind: "uses" }, idx)).toBeUndefined();
  });
});

describe("crystallize suggestions (copy-paste only)", () => {
  test("drifted-to-new-file suggests add-anchor at the resolved file", () => {
    const s = anchorCrystallizeSuggestion(
      anchor({ status: "drifted", resolvedFile: "src/moved.ts" }),
    )!;
    expect(s).toContain("add-anchor");
    expect(s).toContain("src/moved.ts#Foo");
  });

  test("dangling suggests re-anchor", () => {
    const s = anchorCrystallizeSuggestion(anchor({ status: "dangling" }))!;
    expect(s).toContain("re-anchor");
    expect(s).toContain("Foo");
  });

  test("healthy / external suggest nothing", () => {
    expect(anchorCrystallizeSuggestion(anchor({ status: "healthy" }))).toBeNull();
    expect(anchorCrystallizeSuggestion(anchor({ status: "external" }))).toBeNull();
  });

  test("contradiction suggestion names the offending rule", () => {
    expect(
      contradictionCrystallizeSuggestion(
        contra({ kind: "boundary-leak", sourceContext: "a", targetContext: "b" }),
      ),
    ).toContain("declare-seam");
    expect(
      contradictionCrystallizeSuggestion(contra({ kind: "unsupported-seam", seamId: "seam/x" })),
    ).toContain("drop-seam");
  });
});
