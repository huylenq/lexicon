import type { Bounds } from "../../../../shared/canvas-geometry";
import { landmarkFootprint, landmarkPlacement, type Landmark } from "./generate";

/** Source pixels in the original 1254px RGBA sheet. Keep each silhouette isolated. */
export const villageCrops = {
  house: [51, 84, 322, 308], hall: [426, 91, 412, 263], workshop: [888, 63, 325, 311],
  archive: [53, 470, 366, 318], tower: [508, 433, 239, 376], garden: [852, 499, 371, 300],
  oak: [52, 855, 317, 333], pine: [454, 849, 347, 341], wheat: [847, 911, 380, 258],
} as const;

/** Native roads meet the illustrated facade inside the unchanged model frame. */
export function villageLandmarkPlacement(bounds: Bounds, kind: Landmark) {
  const placement = landmarkPlacement(bounds, kind);
  if (kind === "none") return placement;
  const frame = landmarkFootprint(kind), crop = villageCrops[kind];
  const scale = Math.min(frame.w / crop[2], frame.h / crop[3]);
  const w = crop[2] * scale, h = crop[3] * scale;
  const x = placement.origin.x + frame.x + (frame.w - w) / 2;
  const y = placement.origin.y + frame.y + (frame.h - h) / 2;
  const inset = kind === "tower" ? .28 : .12;
  return { ...placement, body: { x: x + w * inset, y: y + h * .55, w: w * (1 - inset * 2), h: h * .3 } };
}
