import type { Point } from "../../graph/layout";
import { endpointOffset, matchRouteTracks, mixPoint, offsetPoint, routeFractionAt, routeStops, sameRoute } from "../route-morph";
import type { RoadGeometry } from "./generate";

export type RoadFrame = { tracks: Point[][]; marks: Point[][]; direction: RoadGeometry["direction"]; texture?: string };
export function roadFrame(geometry: RoadGeometry): RoadFrame {
  const numbers = geometry.texture.match(/[-+]?\d*\.?\d+(?:e[-+]?\d+)?/gi)?.map(Number) || [];
  const marks: Point[][] = [];
  for (let i = 0; i < numbers.length; i += 4) marks.push([
    { x: numbers[i], y: numbers[i + 1] }, { x: numbers[i] + numbers[i + 2], y: numbers[i + 1] + numbers[i + 3] },
  ]);
  return { tracks: [geometry.points, ...geometry.banks, ...geometry.ruts], marks, direction: geometry.direction, texture: geometry.texture };
}
const collapsed = (mark: Point[]) => { const center = mixPoint(mark[0], mark[1], .5); return [center, center]; };

/** Morph the already drawn contours and strokes; never rerun procedural generation mid-frame. */
export const roadMorph = {
  same(a: RoadFrame, b: RoadFrame) {
    return a === b || (a.texture === b.texture && a.tracks.every((track, i) => sameRoute(track, b.tracks[i])) &&
      sameRoute([a.direction], [b.direction]) && a.direction.angle === b.direction.angle);
  },
  attach(from: RoadFrame, to: RoadFrame): RoadFrame {
    const center = from.tracks[0], target = to.tracks[0];
    if (sameRoute([center[0], center.at(-1)!], [target[0], target.at(-1)!])) return from;
    const stops = routeStops(center), offsets = stops.map(t => endpointOffset(center, target, t));
    const marks = from.marks.map(mark => {
      const middle = mixPoint(mark[0], mark[1], .5);
      const offset = endpointOffset(center, target, routeFractionAt(middle, center, stops));
      return mark.map(p => offsetPoint(p, offset));
    });
    return { tracks: from.tracks.map(track => track.map((p, i) => offsetPoint(p, offsets[i]))), marks,
      direction: { ...offsetPoint(from.direction, offsets.at(-1)!), angle: from.direction.angle } };
  },
  prepare(from: RoadFrame, to: RoadFrame) {
    const [a, b] = matchRouteTracks(from.tracks, to.tracks);
    const count = Math.max(from.marks.length, to.marks.length);
    const marksA = Array.from({ length: count }, (_, i) => from.marks[i] || collapsed(to.marks[i]));
    const marksB = Array.from({ length: count }, (_, i) => to.marks[i] || collapsed(from.marks[i]));
    const angle = ((to.direction.angle - from.direction.angle + 540) % 360) - 180;
    return (t: number): RoadFrame => t === 0 ? from : t === 1 ? to : {
      tracks: a.map((track, i) => track.map((p, j) => mixPoint(p, b[i][j], t))),
      marks: marksA.map((mark, i) => mark.map((p, j) => mixPoint(p, marksB[i][j], t))),
      direction: { ...mixPoint(from.direction, to.direction, t), angle: from.direction.angle + angle * t },
    };
  },
};
