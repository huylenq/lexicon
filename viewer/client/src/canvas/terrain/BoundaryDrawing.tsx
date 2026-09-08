import { memo } from "react";
import { pathFor, randomFor, type BoundaryReach, type District } from "./generate";
import { VillageBoundary } from "./VillageBoundary";
import { Fortifications } from "./Fortifications";
import type { Point } from "../../../../shared/canvas-geometry";

/** Ink's village edge is a plan-view pen drawing, matching its buildings. */
function InkRampart({ district, detail }: { district: District; detail: boolean }) {
  return <g className="ink-rampart" data-ink-rampart={district.id}>
    {district.edge.walls.map((w, i) => {
      const offset = (p: Point, d: number) => ({ x: p.x + w.normal.x * d, y: p.y + w.normal.y * d });
      return <g key={w.id}>
        <path d={pathFor([offset(w.a, 3), offset(w.b, 3), offset(w.b, -3), offset(w.a, -3)], true)} className="ink-wall-bed" />
        <path d={pathFor([offset(w.a, 3), offset(w.b, 3)])} />
        {detail && i % 2 === 0 && <path d={pathFor([offset(w.a, -2), offset(w.b, -4)])} className="map-hatch-line" />}
      </g>;
    })}
    {district.edge.towers.filter(t => t.kind !== "roofed").map(t => <g key={t.id} transform={`translate(${t.at.x},${t.at.y})`}>
      {t.kind === "round" ? <><circle r="7" className="ink-wall-bed" /><path d="M-3,-4 Q4,-5 4,3" /></> :
        <><path d="M-7,-6 L6,-7 L7,6 L-6,7 Z" className="ink-wall-bed" /><path d="M-3,4 L4,3 L3,-3" /></>}
    </g>)}
    {district.edge.gates.map(g => <g key={g.id} data-boundary-crossing={g.id}>
      {[-1, 1].map(sign => {
        const p = { x: g.at.x + g.tangent.x * g.span / 2 * sign, y: g.at.y + g.tangent.y * g.span / 2 * sign };
        return <path key={sign} d={`M${p.x - g.normal.x * 5},${p.y - g.normal.y * 5} l${g.normal.x * 10},${g.normal.y * 10}`} />;
      })}
    </g>)}
  </g>;
}

function InkReach({ reach: r, kind, detail }: { reach: BoundaryReach; kind: District["edge"]["kind"]; detail: boolean }) {
  const line = pathFor(r.points), n = r.normal;
  const shifted = (d: number) => r.points.map(p => ({ x: p.x + n.x * d, y: p.y + n.y * d }));
  const middle = r.points[3], rand = randomFor(r.id);
  if (kind === "cliff") {
    const foot = r.points.map((p, i) => ({ x: p.x + n.x * 5, y: p.y + r.depth * (.7 + Math.sin(i * .8 + r.variant) * .2) }));
    return <g data-boundary-feature="cliff">
      <path d={pathFor([...r.points, ...[...foot].reverse()], true)} className="edge-rock-face" />
      <path d={line} className="edge-crest" />
      {detail && r.points.filter((_, i) => i % 2 === 0).map((p, i) => <path key={i}
        d={`M${p.x},${p.y + 2} l${n.x * 2 - 2},${r.depth * .38} l3,${r.depth * .3}`} className="edge-hatch" />)}
    </g>;
  }
  if (kind === "shore") return <g data-boundary-feature="shore">
    <path d={line} className="edge-sand" />
    <path d={pathFor(shifted(-3))} className="edge-shoreline" />
    {detail && <path d={pathFor(shifted(12 + r.variant * 5))} className="edge-wave" />}
    {detail && r.variant > .55 && <path d={`M${middle.x},${middle.y} l3,-2 l4,2 l-3,2 Z m-8,1 l-2,1`} className="edge-pebbles" />}
  </g>;
  if (kind === "marsh") return <g data-boundary-feature="marsh">
    <path d={line} className="edge-channel" style={{ strokeWidth: 6 + r.depth * .4, strokeOpacity: r.variant < .2 ? .22 : .75 }} />
    {r.variant > .3 && <path d={pathFor(shifted(5))} className="edge-wave" />}
    {detail && (r.variant < .25 ? [2] : [1, 3, 5]).filter((_, i) => i !== 1).map(j => {
      const p = r.points[j], h = 6 + rand() * 11;
      return <path key={j} d={`M${p.x},${p.y} q-2,${-h * .6} -4,${-h} m4,${h} l2,${-h - 2} m-2,${h + 2} q5,${-h} 7,${-h * .7} m-5,-2 v-3`} className="edge-reeds" />;
    })}
  </g>;
  // Overlapping crowns and occasional open trunks form a treeline, with gaps
  // between clusters. Each crown has its own seeded silhouette and scale.
  return <g data-boundary-feature="treeline">
    <path d={line} className="edge-undergrowth" />
    {Array.from({ length: 2 }, (_, i) => {
      const p = r.points[1 + i * 3], radius = 8 + rand() * 10;
      const crown = Array.from({ length: 16 }, (_, j) => {
        const a = j / 16 * Math.PI * 2, size = radius * (.72 + rand() * .28);
        return { x: p.x + Math.cos(a) * size, y: p.y - 6 + Math.sin(a) * size * .7 };
      });
      if (r.variant < .18 && i === 0) return null;
      if (r.variant > .2 && r.variant < .38 && i !== 1) return <g key={i} transform={`translate(${p.x},${p.y})`}>
        <path d={`M0,${-radius * 1.6} L${radius * .55},-5 H${radius * .25} L${radius * .8},5 H${-radius * .8} L${-radius * .25},-5 H${-radius * .55} Z`} className="edge-crown" />
        <path d={`M0,${-radius * .7} V9 m0,-6 l${-radius * .4},-3`} className="edge-hatch" />
      </g>;
      return <g key={i}>
        <path d={`M${p.x},${p.y + 6} v-14 m0,7 l-5,-5 m5,1 l4,-5`} className="edge-trunk" />
        <path d={pathFor(crown, true)} className={`edge-crown ${r.variant > .65 ? "edge-crown-open" : ""}`} />
        {detail && <path d={`M${p.x - radius * .5},${p.y - 4} q-2,-5 4,-7 m1,12 l4,-2`} className="edge-hatch" />}
      </g>;
    })}
  </g>;
}

export const BoundaryDrawing = memo(function BoundaryDrawing({ district, detail, skin }: { district: District; detail: boolean; skin: "ink" | "village" }) {
  const ink = skin === "ink";
  return <g className={`boundary-drawing boundary-${district.edge.kind} ${ink ? "boundary-ink" : "boundary-village"}`}
    data-boundary-structure={district.edge.kind} data-boundary-renderer={skin}>
    {district.edge.kind === "rampart" ? ink ? <InkRampart district={district} detail={detail} /> :
      <Fortifications district={district} detail={detail} /> : !ink ? <VillageBoundary district={district} /> :
      [...district.edge.reaches].sort((a, b) => a.points[3].y - b.points[3].y).map(reach =>
        <InkReach key={reach.id} reach={reach} kind={district.edge.kind} detail={detail} />)}
  </g>;
});
