import { describe, expect, test } from "bun:test";
import { applyTerritoryEdits, borderPort, containsBox, corners, fitContextFrame, generateTerritory, inflate,
  migrateTerritory, moveBorderVertex, pointBounds, pointInPolygon, simplePolygon, territoryEdit } from "../client/src/canvas/territory";
import { distanceToSegment } from "../client/src/canvas/terrain/generate";
import { uncoveredArea } from "./canvas-polygon-oracle";

const boxes = [{ x: 30, y: 80, w: 160, h: 100 }, { x: 320, y: 100, w: 130, h: 120 }, { x: 130, y: 330, w: 200, h: 100 }];
const heading = { w: 190, h: 40 };
const bay = [{ x: 0, y: 0 }, { x: 200, y: 0 }, { x: 200, y: 200 }, { x: 110, y: 200 },
  { x: 110, y: 80 }, { x: 90, y: 80 }, { x: 90, y: 200 }, { x: 0, y: 200 }];

describe("context territory geometry", () => {
  test("Diagram fits every inner node in every direction, including negative placements and tall labels", () => {
    const contents = [...boxes, { x: -240, y: -170, w: 270, h: 190 }];
    const frame = fitContextFrame(contents, { w: 310, h: 70 });
    for (const b of contents) expect(uncoveredArea(corners(frame), inflate(b, 20))).toBeLessThan(.001);
    expect(frame.x).toBeLessThan(-240);
    expect(frame.y + 70).toBeLessThan(-170);
    expect(contents[3]).toEqual({ x: -240, y: -170, w: 270, h: 190 });
    const empty = fitContextFrame([], heading);
    expect(empty.w).toBeGreaterThan(heading.w);
    expect(empty.h).toBeGreaterThan(heading.h);
  });
  test("generation is deterministic and forms a simple coast around complete footprints and its title", () => {
    const territory = generateTerritory("ordering", boxes, heading);
    expect(generateTerritory("ordering", [...boxes].reverse(), heading)).toEqual(territory);
    expect(simplePolygon(territory.points)).toBe(true);
    expect(territory.points.length).toBeGreaterThan(5);
    expect(territory.points.length).toBeLessThan(30);
    for (const b of [...boxes.map(b => inflate(b, 8)), { ...territory.label, ...heading }])
      expect(uncoveredArea(territory.points, b)).toBeLessThan(.001);
    expect(simplePolygon(generateTerritory("empty", [], heading).points)).toBe(true);
  });
  test("containment checks whole rectangles, including bays that miss all four corners", () => {
    const box = { x: 60, y: 100, w: 80, h: 40 };
    expect(corners(box).every(p => pointInPolygon(p, bay))).toBe(true);
    expect(containsBox(bay, box)).toBe(false);
    expect(uncoveredArea(bay, box)).toBe(800);
    expect(containsBox(bay, { x: 20, y: 110, w: 40, h: 50 })).toBe(true);
  });
  test("automatic territory grows and shrinks with nodes without accumulating previous positions", () => {
    const initial = generateTerritory("ordering", boxes, heading);
    const moved = boxes.map((b, i) => i === 1 ? { ...b, x: 900, y: -100 } : b);
    const expanded = generateTerritory("ordering", moved, heading);
    for (const b of moved) expect(uncoveredArea(expanded.points, inflate(b, 8))).toBeLessThan(.001);
    expect(pointBounds(expanded.points).w).toBeGreaterThan(pointBounds(initial.points).w);
    expect(generateTerritory("ordering", boxes, heading)).toEqual(initial);
    const reduced = generateTerritory("ordering", boxes.slice(0, 1), heading);
    expect(pointBounds(reduced.points).w).toBeLessThan(pointBounds(initial.points).w);
    expect(pointBounds(reduced.points).h).toBeLessThan(pointBounds(initial.points).h);
  });
  test("local border edits survive changed hull vertices and leave distant coastline alone", () => {
    const initial = generateTerritory("ordering", boxes, heading);
    const index = initial.points.findIndex(p => p.x === Math.max(...initial.points.map(p => p.x)));
    const after = moveBorderVertex(initial, index, { x: initial.points[index].x + 90, y: initial.points[index].y });
    const edit = territoryEdit("bulge", initial.points, after.points)!;
    const edited = applyTerritoryEdits(initial, boxes, heading, [edit]);
    expect(simplePolygon(edited.points)).toBe(true);
    expect(pointBounds(edited.points).w).toBeGreaterThan(pointBounds(initial.points).w);
    for (const p of initial.points.filter(p => p.x < 100))
      expect(edited.points.some(q => Math.hypot(q.x - p.x, q.y - p.y) < .001)).toBe(true);
    const moved = [...boxes, { x: -300, y: 100, w: 100, h: 90 }];
    const automatic = generateTerritory("ordering", moved, heading);
    const changed = applyTerritoryEdits(automatic, moved, heading, [edit]);
    expect(automatic.points).not.toEqual(initial.points);
    expect(pointBounds(changed.points).x).toBe(pointBounds(automatic.points).x);
    expect(pointBounds(changed.points).x + pointBounds(changed.points).w).toBeCloseTo(after.points[index].x);
    for (const b of moved) expect(uncoveredArea(changed.points, inflate(b, 8))).toBeLessThan(.001);
    expect(edit.id).toBe("bulge");
  });
  test("a sculpted bay yields to a node, returns when it leaves, and never moves the contents", () => {
    const automatic = { points: [{ x: 0, y: 0 }, { x: 600, y: 0 }, { x: 600, y: 400 },
      { x: 300, y: 400 }, { x: 0, y: 400 }], label: { x: 20, y: 20 } };
    const contents = [{ x: 40, y: 190, w: 80, h: 40 }, { x: 480, y: 190, w: 80, h: 40 }];
    const title = { w: 120, h: 40 };
    const sculpted = moveBorderVertex(automatic, 3, { x: 300, y: 140 });
    const edit = territoryEdit("bay", automatic.points, sculpted.points)!;
    const initial = applyTerritoryEdits(automatic, contents, title, [edit]);
    const probe = { x: 300, y: 250 };
    expect(pointInPolygon(probe, initial.points)).toBe(false);
    const visitor = { x: 260, y: 190, w: 80, h: 100 };
    const occupied = applyTerritoryEdits(automatic, [...contents, visitor], title, [edit]);
    expect(uncoveredArea(occupied.points, inflate(visitor, 8))).toBeLessThan(.001);
    expect(simplePolygon(occupied.points)).toBe(true);
    expect(applyTerritoryEdits(automatic, contents, title, [edit])).toEqual(initial);
    expect(visitor).toEqual({ x: 260, y: 190, w: 80, h: 100 });
    const restored = JSON.parse(JSON.stringify([edit]));
    expect(applyTerritoryEdits(automatic, contents, title, restored)).toEqual(initial);
    expect(applyTerritoryEdits(automatic, contents, title, [])).toBe(automatic);
  });
  test("editing cannot produce a crossed outline, and content repairs cuts that split a territory", () => {
    const initial = generateTerritory("ordering", boxes, heading);
    for (let i = 0; i < initial.points.length; i++) {
      const changed = moveBorderVertex(initial, i, { x: 320, y: 330 });
      expect(simplePolygon(changed.points)).toBe(true);
      const edit = territoryEdit(`edit:${i}`, initial.points, changed.points);
      const fitted = applyTerritoryEdits(initial, boxes, heading, edit ? [edit] : []);
      expect(simplePolygon(fitted.points)).toBe(true);
      for (const b of [...boxes.map(b => inflate(b, 8)), { ...fitted.label, ...heading }])
        expect(uncoveredArea(fitted.points, b)).toBeLessThan(.001);
    }
    const split = { id: "cut", add: [], cut: [[corners({ x: 200, y: -500, w: 60, h: 1200 })]] };
    const fitted = applyTerritoryEdits(initial, boxes, heading, [split]);
    expect(simplePolygon(fitted.points)).toBe(true);
    for (const b of boxes) expect(uncoveredArea(fitted.points, inflate(b, 8))).toBeLessThan(.001);
    expect(simplePolygon([{ x: 0, y: 0 }, { x: 100, y: 100 }, { x: 0, y: 100 }, { x: 100, y: 0 }])).toBe(false);
  });
  test("legacy outlines become local preferences and abandoned additions become dormant", () => {
    const automatic = generateTerritory("ordering", boxes, heading);
    const legacy = moveBorderVertex(automatic, 1, { x: automatic.points[1].x + 25, y: automatic.points[1].y - 50 });
    const preferences = migrateTerritory({ edits: [], legacy }, automatic)!;
    expect(preferences.legacy).toBeNull();
    expect(preferences.edits).toHaveLength(1);
    const restored = applyTerritoryEdits(automatic, boxes, heading, preferences.edits);
    expect(territoryEdit("difference", restored.points, legacy.points)).toBeUndefined();
    const moved = boxes.map(b => ({ ...b, x: b.x + 2000 }));
    const fresh = generateTerritory("ordering", moved, heading);
    expect(applyTerritoryEdits(fresh, moved, heading, preferences.edits)).toEqual(fresh);
  });
  test("context ports meet the polygon, including a concave coast", () => {
    for (const toward of [{ x: -100, y: 170 }, { x: 100, y: 250 }, { x: 450, y: 100 }, { x: 100, y: 180 }]) {
      const p = borderPort(bay, toward);
      expect(Math.min(...bay.map((a, i) => distanceToSegment(p, a, bay[(i + 1) % bay.length])))).toBeLessThan(.0001);
    }
  });
});
