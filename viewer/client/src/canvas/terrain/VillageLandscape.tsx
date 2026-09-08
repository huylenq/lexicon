import type { Point } from "../../../../shared/canvas-geometry";
import { AtlasSprite, VillageSprite } from "./VillageSprites";
import type { District } from "./generate";
import landscapeSheet from "./assets/landscape-sprites.png";

const crops = {
  mountain: [14, 119, 408, 302], hill: [438, 198, 397, 217], spring: [881, 167, 345, 284],
  pond: [22, 579, 393, 243], grove: [448, 533, 389, 290], birch: [939, 488, 245, 359],
  shrubs: [24, 977, 400, 197], flowers: [448, 985, 381, 194], rocks: [843, 956, 395, 234],
} as const;

function softOutline(points: Point[]) {
  const middle = (a: Point, b: Point) => `${((a.x + b.x) / 2).toFixed(2)},${((a.y + b.y) / 2).toFixed(2)}`;
  return `M${middle(points.at(-1)!, points[0])} ` + points.map((p, i) => `Q${p.x.toFixed(2)},${p.y.toFixed(2)} ${middle(p, points[(i + 1) % points.length])}`).join(" ") + " Z";
}

export function VillageLandscape({ district, detail }: { district: District; detail: boolean }) {
  return <g className="village-landscape">
    {district.ground.map(patch => <g key={patch.id} data-ground-patch={patch.id}>
      <path d={softOutline(patch.points)} className={`landscape-ground landscape-ground-${patch.kind}`} />
      {detail && <path className={`landscape-texture landscape-texture-${patch.kind}`} d={patch.marks.map((p, i) =>
        i % 4 === 0 ? `M${p.x},${p.y} l2,-1 l3,1 l-2,1 Z` : `M${p.x},${p.y} l-2,-3 m2,3 l1,-4 m-1,4 l3,-2`).join(" ")} />}
    </g>)}
    {district.landscape.filter(f => detail || f.large).map(feature => {
      const { kind, bounds } = feature;
      const fallback = <ellipse cx={bounds.x + bounds.w / 2} cy={bounds.y + bounds.h * .7}
        rx={bounds.w * .35} ry={bounds.h * .2} className="landscape-fallback" />;
      return <g key={feature.id} data-landscape-id={feature.id} data-landscape-kind={kind} data-landscape-large={feature.large}
        transform={feature.variant > .5 ? `translate(${2 * bounds.x + bounds.w} 0) scale(-1 1)` : undefined}>
        {kind === "oak" || kind === "pine" || kind === "wheat" ? <VillageSprite kind={kind} bounds={bounds} fallback={fallback} /> :
          <AtlasSprite kind={kind} bounds={bounds} crop={crops[kind]} source={landscapeSheet} fallback={fallback} />}
      </g>;
    })}
  </g>;
}
