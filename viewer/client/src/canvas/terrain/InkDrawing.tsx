import { memo, useId, useMemo } from "react";
import { useGeometryMorph } from "../useRouteMorph";
import { roadFrame, roadMorph } from "./road-morph";
import { useEditor, useValue } from "tldraw";
import { isNeighborConnection } from "../NeighborHighlight";
import { canvasPresentation, isCrossDimensionConnection } from "../presentation";
import { VillageBuilding } from "./VillageSprites";
import { VillageLandscape } from "./VillageLandscape";
import { InkScenery } from "./InkScenery";
import { BoundaryDrawing } from "./BoundaryDrawing";
import { TerrainBoundary } from "./TerrainBoundary";
import { landmarkPlacement, pathFor, type District, type Landmark, type MapScene } from "./generate";

/** Original vector marks, procedurally placed. No generated bitmap or third-party artwork. */
function Building({ kind, variant }: { kind: Landmark; variant: number }) {
  if (kind === "none") return null;
  if (kind === "traveler") return <g className="map-traveler">
    <ellipse cx="1" cy="24" rx="18" ry="4" className="map-shadow" />
    <circle cx="0" cy="-19" r="7" className="map-ground" />
    <path d="M-6,-11 Q-15,-4 -13,14 L12,14 Q14,-4 6,-11 Z" className="map-roof" />
    <path d="M-5,14 L-8,24 M5,14 L8,24 M-11,-3 L-18,8 M11,-3 L17,5 M18,-12 L18,26" />
    <path d="M-9,-21 Q0,-32 9,-21 Z" className="map-roof" />
  </g>;
  if (kind === "garden") return <g className="map-garden">
    <path d="M-29,-15 L28,-14 L30,15 L-30,16 Z" className="map-ground" />
    {[-21, -11, -1, 9, 19].map(x => <path key={x} d={`M${x},-9 l1,19 m-3,-14 l5,-2 m-5,8 l5,-2`} />)}
    <circle cx="-29" cy="-14" r="5" className="map-leaves" /><circle cx="29" cy="16" r="4" className="map-leaves" />
  </g>;
  if (kind === "tower") return <g>
    <ellipse cx="2" cy="4" rx="23" ry="18" className="map-shadow" />
    <path d="M-15,-15 L16,-15 L17,15 L-16,15 Z" className="map-stone" />
    <path d="M-20,-16 L0,-26 L20,-15 L20,6 L0,17 L-20,6 Z" className="map-roof" />
    <path d="M0,-26 L0,17 M-20,-16 L20,6 M20,-15 L-20,6" />
    <path d="M0,-26 v-10 l13,4 l-13,4" className="map-banner" />
  </g>;
  const wide = kind === "hall" || kind === "archive";
  const w = wide ? 38 : 25, h = wide ? 16 : 18;
  return <g>
    <path d={`M${-w + 4},${-h + 5} h${w * 2} v${h * 2} h${-w * 2} Z`} className="map-shadow" />
    {kind === "workshop" && <path d="M15,-7 L40,-7 L40,15 L15,15 Z M29,-7 V15" className="map-roof" />}
    <path d={`M${-w},${-h} L${w},${-h + 1} L${w + 1},${h} L${-w - 1},${h + 1} Z`} className="map-roof" />
    <path d={`M${-w},${-h} L${-w + 9},0 L${w - 9},0 L${w},${-h + 1} M${-w + 9},0 L${-w - 1},${h + 1} M${w - 9},0 L${w + 1},${h}`} />
    {Array.from({ length: wide ? 9 : 6 }, (_, i) => {
      const x = -w + 8 + i * 7;
      return <path key={i} d={`M${x},-12 l-3,8 M${x - 2},5 l-3,8`} className="map-hatch-line" />;
    })}
    {kind === "hall" && <path d="M-9,-16 V-27 H9 V-16 M0,-27 V-16" className="map-roof" />}
    {kind === "archive" && <path d="M-24,16 v7 h48 v-7 M-23,20 h46" className="map-stone" />}
    {kind === "workshop" && <><path d="M-17,-15 v-13 h9 v13" className="map-stone" /><circle cx="42" cy="19" r="6" /><path d="M36,19 h12 M42,13 v12" /></>}
    {kind === "house" && variant > .4 && <path d="M9,-14 v-9 h6 v9" className="map-stone" />}
    <path d="M-4,18 l-2,9 h12 l-2,-9" className="map-doorstep" />
  </g>;
}
const DistrictGround = memo(function DistrictGround({ district, detail, skin, prefix }: {
  district: District; detail: boolean; skin: "ink" | "village"; prefix: string;
}) {
  return <g data-map-district={district.id} data-terrain={district.terrain}>
    <TerrainBoundary district={district}
      fill={skin === "village" ? `url(#${prefix}-${district.terrain === "woodland" ? "woodland" : "meadow"})` : undefined} />
    {skin === "village" ? <VillageLandscape district={district} detail={detail} /> : <InkScenery district={district} detail={detail} />}
  </g>;
});

function RoadDrawing({ road, detail, opacity, dragging }: { road: MapScene["roads"][number]; detail: boolean; opacity: number; dragging: boolean }) {
  const editor = useEditor();
  const neighbor = useValue("Highlighted neighbor road", () => isNeighborConnection(editor, canvasPresentation(editor).get().connections.get(road.id)), [editor, road.id]);
  const crossDimension = useValue("Cross-dimension road", () => {
    const view = canvasPresentation(editor).get();
    return isCrossDimensionConnection(view, view.connections.get(road.id));
  }, [editor, road.id]);
  const frame = useMemo(() => roadFrame(road.geometry), [road.geometry]);
  const morph = useGeometryMorph(frame, roadMorph, dragging);
  const { tracks, marks, direction, texture } = morph.value;
  const banks = tracks.slice(1, 3), ruts = tracks.slice(3, 5);
  return <g data-map-road={road.id} data-path-kind={road.kind} data-neighbor={neighbor || undefined} opacity={opacity}>
    <g data-route-current="true" data-route-morphing={morph.animating || undefined}>
      {crossDimension ? <path d={pathFor(tracks[0])} fill="none" stroke="var(--map-ink)" strokeWidth={1.8} strokeDasharray="6 5" /> : <>
      <path d={pathFor([...banks[0], ...[...banks[1]].reverse()], true)} className="map-road-ground" />
      {banks.map((points, i) => <path key={i} d={pathFor(points)} className={`map-road-bank map-${road.kind}`} />)}
      {detail && <>
        {road.kind === "road" && ruts.map((points, i) => <path key={i} d={pathFor(points)} className="map-road-rut" />)}
        <path d={texture ?? marks.map(mark => pathFor(mark)).join(" ")} className="map-road-grain" />
      </>}
      </>}
      <path className="map-road-direction" d="M-4,-3 L2,0 L-4,3"
        transform={`translate(${direction.x},${direction.y}) rotate(${direction.angle})`} />
    </g>
  </g>;
}

export const InkDrawing = memo(function InkDrawing({ scene, detail, matches, skin }: { skin: "ink" | "village"; scene: MapScene; detail: boolean; matches: (id: string) => boolean }) {
  const editor = useEditor();
  const dragging = useValue("Dragging Atlas endpoints", () => editor.inputs.getIsDragging(), [editor]);
  const prefix = useId().replace(/:/g, "");
  return <g className="map-drawing" data-detail={detail}>
    <defs>
      {skin === "village" && <>
        <linearGradient id={`${prefix}-meadow`} x2=".3" y2="1">
          <stop stopColor="var(--village-grass-light)" /><stop offset="1" stopColor="var(--village-grass)" />
        </linearGradient>
        <linearGradient id={`${prefix}-woodland`} x2=".3" y2="1">
          <stop stopColor="var(--village-grass)" /><stop offset="1" stopColor="var(--map-leaves)" />
        </linearGradient>
      </>}

    </defs>
    {scene.districts.map(district => <DistrictGround key={district.id} district={district} detail={detail} skin={skin} prefix={prefix} />)}
    {scene.roads.map(road => <RoadDrawing key={road.id} road={road} detail={detail} opacity={matches(road.id) ? 1 : .18} dragging={dragging} />)}
    {scene.bridges.map(bridge => <g key={bridge.id} data-map-bridge={bridge.id} transform={`translate(${bridge.at.x},${bridge.at.y}) rotate(${bridge.angle})`}>
      <path d="M-19,-8 H19 V8 H-19 Z" className="map-bridge" />
      {[-14, -7, 0, 7, 14].map(x => <path key={x} d={`M${x},-7 V7`} className="map-hatch-line" />)}
      <path d="M-22,-9 H22 M-22,9 H22" />
    </g>)}
    {scene.districts.map(district => <BoundaryDrawing key={district.id} district={district} skin={skin} detail={detail} />)}
    {scene.landmarks.filter(l => l.kind !== "none").map(landmark => {
      const { origin } = landmarkPlacement(landmark.bounds, landmark.kind);
      return <g key={landmark.id}
      data-map-landmark={landmark.id} data-landmark-kind={landmark.kind}
      opacity={matches(landmark.id) ? 1 : .18}
      transform={`translate(${origin.x},${origin.y})`}>
      {skin === "village" ? <VillageBuilding kind={landmark.kind} fallback={<Building kind={landmark.kind} variant={landmark.variant} />} /> : <Building kind={landmark.kind} variant={landmark.variant} />}
    </g>})}
  </g>;
});
