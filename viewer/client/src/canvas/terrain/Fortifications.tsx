import { useId } from "react";
import { BoundarySprite, MasonryTexture } from "./VillageBoundary";
import { pathFor, type District, type FortGate, type FortTower, type WallSection } from "./generate";

import { shifted, towerSpriteBounds, wallGeometry } from "./fortGeometry";

function Wall({ wall, detail, texture }: { wall: WallSection; detail: boolean; texture: string }) {
  const { normal: n, height: h } = wall;
  const { front, walk, plinth, merlon, cap } = wallGeometry(wall);
  const f = front[0], g = front[1];
  return <g data-wall-section={wall.id}>
    <path d={pathFor(front, true)} className={n.x > .3 ? "fort-face fort-face-shade" : "fort-face"} />
    <path d={pathFor(front, true)} style={{ fill: `url(#${texture})`, stroke: "none", opacity: .65 }} />
    <path d={pathFor(plinth, true)} className="fort-plinth" />
    <path d={pathFor(walk, true)} className="fort-walk" />
    {detail && <>
      <path d={`M${f.x},${f.y - h * .48} L${g.x},${g.y - h * .48} M${(f.x + g.x) / 2},${(f.y + g.y) / 2 - h * .48} v${h * .38}`} className="fort-mortar" />
      {wall.merlon && h > 5 && <>
        <path d={pathFor(merlon, true)} className="fort-merlon" />
        <path d={pathFor(cap, true)} className="fort-cap" />
      </>}
    </>}
  </g>;
}

function Tower({ tower, detail }: { tower: FortTower; detail: boolean }) {
  const { at, radius: r, kind } = tower, h = tower.height;
  const round = kind === "round" || kind === "roofed";
  return <g transform={`translate(${at.x},${at.y})`} data-fort-tower={kind}>
    <ellipse cx="4" cy="3" rx={r + 5} ry={r * .5} className="fort-shadow" />
    {round ? <>
      <path d={`M${-r},${-h} Q0,${-h + r * .7} ${r},${-h} V0 Q0,${r * .7} ${-r},0 Z`} className="fort-tower-body" />
      <path d={`M${r * .35},${-h + r * .28} Q${r},${-h + r * .2} ${r},${-h} V0 Q${r * .7},${r * .5} ${r * .35},${r * .3} Z`} className="fort-tower-shade" />
      <ellipse cy={-h} rx={r} ry={r * .36} className="fort-cap" />
      <path d={`M${-r},${-h * .2} Q0,${-h * .2 + r * .7} ${r},${-h * .2}`} className="fort-course" />
    </> : <>
      <path d={`M${-r},${-h} L0,${-h + r * .45} V${r * .45} L${-r},0 Z`} className="fort-tower-body" />
      <path d={`M0,${-h + r * .45} L${r},${-h} V0 L0,${r * .45} Z`} className="fort-tower-shade" />
      <path d={`M${-r},${-h} L0,${-h - r * .45} L${r},${-h} L0,${-h + r * .45} Z`} className="fort-cap" />
      <path d={`M${-r},${-h * .2} L0,${-h * .2 + r * .45} L${r},${-h * .2}`} className="fort-course" />
    </>}
    {kind === "roofed" ? <>
      <path d={`M${-r - 3},${-h} Q0,${-h + r * .65} ${r + 3},${-h} L${r * .12},${-h - 17} Z`} className="fort-roof" />
      {detail && <path d={`M${r * .12},${-h - 17} L${r * .4},${-h + 2} M0,${-h - 15} L${-r * .5},${-h + 1}`} className="fort-mortar" />}
    </> : detail && [-.75, -.25, .3, .8].map((x, i) => <path key={i}
      d={`M${r * x - 2.5},${-h + (round ? Math.sqrt(1 - x * x) * r * .3 : r * .25)} v-5 h5 v5 Z`} className="fort-merlon" />)}
    {detail && <>
      <path d={`M${-r * .48},${-h * .62} v6 M${r * .42},${-h * .53} v6`} className="fort-slit" />
      <path d={`M${-r * .8},${-h * .38} l${r * .7},2 m${r * .3},1 l${r * .6},-2 M${-r * .2},${-h * .83} v4`} className="fort-mortar" />
      {tower.variant > .65 && <><path d={`M0,${-h - 6} v-14`} className="fort-slit" /><path d={`M0,${-h - 20} l10,3 l-10,4 Z`} className="fort-pennant" /></>}
    </>}
  </g>;
}

function Gate({ gate }: { gate: FortGate }) {
  const { at: p, tangent: t, span } = gate, h = 23;
  const a = shifted(p, t, -span / 2), b = shifted(p, t, span / 2);
  return <g data-fort-gate={gate.id} data-gate-roads={gate.roadIds.join(" ")} data-main-gate={gate.main}>
    <path d={`M${a.x},${a.y - h} L${b.x},${b.y - h} L${b.x},${b.y - 6} Q${p.x},${p.y - h - 7} ${a.x},${a.y - 6} Z`} className="fort-gate-arch" />
    <path d={pathFor([shifted(a, gate.normal, 3, h), shifted(b, gate.normal, 3, h),
      shifted(b, gate.normal, -3, h), shifted(a, gate.normal, -3, h)], true)} className="fort-cap" />
    <path d={`M${a.x},${a.y - h} L${b.x},${b.y - h}`} className="fort-course" />
    <path d={`M${a.x},${a.y - 6} Q${p.x},${p.y - h - 7} ${b.x},${b.y - 6}`} className="fort-arch-rim" />
    <path d={`M${a.x},${a.y - 5} V${a.y + 2} M${b.x},${b.y - 5} V${b.y + 2}`} className="fort-gate-door" />
  </g>;
}

export function Fortifications({ district, detail }: { district: District; detail: boolean }) {
  const fort = district.edge, texture = `masonry-${useId().replace(/:/g, "")}`;
  const pieces = [
    ...fort.walls.map(wall => ({ id: wall.id, y: (wall.a.y + wall.b.y) / 2, draw: <Wall wall={wall} detail={detail} texture={texture} /> })),
    ...fort.towers.map(tower => ({ id: tower.id, y: tower.at.y + 1, draw: <g data-fort-tower={tower.kind}>
      <BoundarySprite crop={tower.kind === "roofed" || tower.kind === "round" ? 13 : 14}
        bounds={towerSpriteBounds(tower)} fallback={<Tower tower={tower} detail={detail} />} />
    </g> })),
    ...fort.gates.map(gate => ({ id: gate.id, y: gate.at.y, draw: <Gate gate={gate} /> })),
  ].sort((a, b) => a.y - b.y || a.id.localeCompare(b.id));
  return <g className={`fortifications fortifications-${district.terrain}`} data-fortification={district.id}>
    <defs><MasonryTexture id={texture} /></defs>
    {fort.gates.filter(g => g.main).map(g => <g key={g.id}>
      <path d={pathFor([shifted(g.at, g.normal, -17), shifted(g.at, g.normal, 28)])} className="fort-access" />

    </g>)}
    {pieces.map(p => <g key={p.id}>{p.draw}</g>)}
  </g>;
}
