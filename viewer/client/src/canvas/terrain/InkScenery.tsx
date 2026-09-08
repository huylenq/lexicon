import { pathFor, randomFor, type District, type LandscapeFeature, type Ornament } from "./generate";

function Tree({ tree }: { tree: Ornament }) {
  const rand = randomFor(tree.id), r = tree.radius;
  const form = Math.floor(tree.variant * 4);
  const crown = Array.from({ length: 16 }, (_, i) => {
    const a = i * Math.PI / 8, radius = r * (.65 + rand() * .3);
    return { x: Math.cos(a) * radius, y: Math.sin(a) * radius * (form === 2 ? .65 : 1) };
  });
  return <g transform={`translate(${tree.x},${tree.y})`} data-ornament-id={tree.id} data-ink-foliage={form}>
    {form === 0 ? <>
      <path d={`M0,${-r} L${r * .5},0 H${r * .27} L${r * .8},${r * .7} H${-r * .8} L${-r * .27},0 H${-r * .5} Z`} className="map-leaves" />
      <path d={`M0,${r * .1} V${r} m0,${-r * .55} l${-r * .3},${-r * .2}`} />
    </> : form === 3 ? <>
      <path d={`M0,${r} Q${-r * .2},0 0,${-r} M0,0 L${-r * .65},${-r * .5} M0,${-r * .3} L${r * .65},${-r * .65} M0,${r * .45} L${r * .5},0`} />
      <path d={pathFor(crown, true)} className="ink-open-crown" />
    </> : <>
      <path d={pathFor(crown, true)} className="map-leaves" />
      <path d={`M${-r * .5},0 q0,${-r * .6} ${r * .55},${-r * .4} m${r * .3},${r * .35} l${-r * .2},${r * .25}`} className="map-hatch-line" />
      {form === 2 && <path d={`M${-r * .65},${r * .8} l2,-3 m2,3 l2,-2 M${r * .35},${r * .65} l2,-3`} />}
    </>}
  </g>;
}

function Landform({ feature }: { feature: LandscapeFeature }) {
  const { bounds: b, kind, variant } = feature;
  const peak = 37 + variant * 18;
  return <svg x={b.x + b.w * .08} y={b.y + b.h * .08} width={b.w * .84} height={b.h * .84}
    viewBox="0 0 100 70" overflow="hidden" className="ink-landform" data-ink-landform={kind}>
    <g transform={variant > .5 ? "translate(100 0) scale(-1 1)" : undefined}>
      {kind === "mountain" ? <>
        <path d={`M5,60 L28,26 L45,60 M25,61 L${peak},7 L78,62 M62,62 L80,32 L96,61`} className="map-ground" />
        <path d={`M${peak},7 L${peak - 3},29 L${peak + 7},41 L${peak + 10},56 M${peak - 9},28 l9,5 l7,-4 M28,26 l1,19 M80,32 l-2,17`} />
        <path d={`M${peak + 8},33 l9,19 m-7,-8 l7,13 M31,40 l5,13 M83,43 l6,12 M7,64 q12,-3 21,0 m40,0 q15,3 26,-1`} className="map-hatch-line" />
      </> : kind === "hill" ? <>
        <path d={`M5,56 Q24,${4 + variant * 12} 49,35 Q75,13 96,57`} />
        <path d="M13,61 Q34,32 58,52 M53,59 Q72,40 91,61 M25,53 l-3,5 m8,-10 l-4,9 m9,-11 l-4,8" className="map-hatch-line" />
      </> : kind === "rocks" ? <>
        <path d="M9,56 L15,39 L29,33 L42,44 L43,59 Z M35,39 L44,19 L63,14 L76,35 L73,59 L46,61 M72,44 L85,35 L96,48 L93,60 L77,59" className="map-ground" />
        <path d="M44,19 L54,34 L49,51 M63,14 L61,32 L76,35 M15,39 L27,44 L29,54 M85,35 L82,48" className="map-hatch-line" />
      </> : <>
        <path d="M12,43 C5,31 23,23 39,28 C50,17 77,25 88,37 C105,51 82,62 62,58 C43,66 15,58 12,43 Z" className="ink-pool" />
        {kind === "spring" && <>
          <path d="M17,30 L23,12 L36,9 L46,25 M42,24 L52,6 L67,10 L76,30" className="map-ground" />
          <path d="M46,21 C37,32 56,31 45,43 M50,24 C46,31 59,34 50,45" className="ink-water-line" />
        </>}
        <path d="M23,44 q9,3 16,0 m17,7 q12,3 21,-1 M64,36 h10 M13,33 l-3,-9 m3,9 l3,-12 M85,48 l4,-11 m-4,11 l8,-5" className="map-hatch-line" />
      </>}
    </g>
  </svg>;
}

/** Ink chooses a sparse subset of the shared landscape and draws it entirely with vectors. */
export function InkScenery({ district, detail }: { district: District; detail: boolean }) {
  const landforms = district.landscape.filter(f => f.large && f.variant < (district.terrain === "highlands" || district.terrain === "wetland" ? .85 : .55));
  const ornaments = district.ornaments.filter(o => !landforms.some(({ bounds: b }) =>
    o.x + o.radius + 6 > b.x && o.x - o.radius - 6 < b.x + b.w && o.y + o.radius + 6 > b.y && o.y - o.radius - 6 < b.y + b.h));
  return <g className="ink-scenery">
    {detail && district.ground.map(patch => <path key={patch.id} className="ink-ground-marks" data-ink-ground={patch.kind}
      d={patch.marks.filter((_, i) => i % 3 === 0).map((p, i) => patch.kind === "earth" ?
        `M${p.x},${p.y} l2,-1 l2,1 l-2,1 Z` : patch.kind === "shade" ?
          `M${p.x},${p.y} l4,-2 m0,3 l3,-2` : `M${p.x},${p.y} l-1,-${2 + i % 3} m1,${2 + i % 3} l3,-2`).join(" ")} />)}
    {landforms.map(feature => <Landform key={feature.id} feature={feature} />)}
    {detail && ornaments.map(o => o.kind === "tree" ? <Tree key={o.id} tree={o} /> :
      <g key={o.id} data-ornament-id={o.id} data-ink-foliage="field"
        transform={`translate(${o.x},${o.y}) rotate(${o.variant * 50 - 25}) scale(${o.radius / 13})`}>
        <path d="M-11,-8 L10,-10 L12,8 L-9,10 M-7,-5 l1,11 M-2,-6 l1,11 M3,-7 l1,11 M8,-6 l1,11" className="map-field" />
      </g>)}
  </g>;
}
