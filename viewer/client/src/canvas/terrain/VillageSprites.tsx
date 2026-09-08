import { useId, useState, type ReactNode } from "react";
import type { Bounds } from "../../../../shared/canvas-geometry";
import { landmarkFootprint, type Landmark } from "./generate";
import spriteSheet from "./assets/village-sprites.png";

import { villageCrops as crops } from "./village";

type Sprite = keyof typeof crops;

export function AtlasSprite({ kind, bounds, fallback, crop, source }: {
  kind: string; bounds: Bounds; fallback: ReactNode; crop: readonly number[]; source: string;
}) {
  const [failed, setFailed] = useState(false);
  const clip = useId().replace(/:/g, "");
  const [x, y, w, h] = crop;
  if (failed) return <>{fallback}</>;
  return <svg x={bounds.x} y={bounds.y} width={bounds.w} height={bounds.h}
    viewBox={crop.join(" ")} preserveAspectRatio="xMidYMid meet"
    overflow="hidden" className="village-sprite" data-village-sprite={kind}>
    <defs><clipPath id={clip}><rect x={x} y={y} width={w} height={h} /></clipPath></defs>
    <g clipPath={`url(#${clip})`}>
      <image href={source} x="0" y="0" width="1254" height="1254" onError={() => setFailed(true)} />
    </g>
  </svg>;
}

export function VillageBuilding({ kind, fallback }: { kind: Landmark; fallback: ReactNode }) {
  if (kind === "none") return null;
  return <g className="village-building"><VillageSprite kind={kind} bounds={landmarkFootprint(kind)} fallback={fallback} /></g>;
}

export function VillageSprite({ kind, bounds, fallback }: { kind: Sprite; bounds: Bounds; fallback: ReactNode }) {
  return <AtlasSprite kind={kind} bounds={bounds} fallback={fallback} crop={crops[kind]} source={spriteSheet} />;
}
