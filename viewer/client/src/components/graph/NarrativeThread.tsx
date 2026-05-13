import { Fragment } from "react";

export interface ThreadStop {
  id: string;
  x: number;
  y: number;
  name: string;
}

export default function NarrativeThread({ stops }: { stops: ThreadStop[] }) {
  if (stops.length < 2) return null;
  const path = catmullRom(stops.map(s => ({ x: s.x, y: s.y })));
  return (
    <g style={{ pointerEvents: "none" }}>
      <path
        d={path}
        stroke="var(--color-mark-2)"
        strokeWidth={1.5}
        fill="none"
        opacity={0.8}
        strokeDasharray="2 3"
      />
      {stops.map((s, i) => (
        <Fragment key={`${s.id}-${i}`}>
          <circle
            cx={s.x}
            cy={s.y}
            r={9}
            fill="var(--color-paper)"
            stroke="var(--color-mark-2)"
            strokeWidth={1.25}
          />
          <text
            x={s.x}
            y={s.y + 3}
            textAnchor="middle"
            className="mono"
            fontSize={9}
            fill="var(--color-mark-2)"
          >
            {i}
          </text>
        </Fragment>
      ))}
    </g>
  );
}

// Open uniform Catmull-Rom spline (duplicate endpoints), encoded as cubic Beziers.
// Matches the curve used by HEB affects routing so the threads read as part of
// the same family.
function catmullRom(points: { x: number; y: number }[]): string {
  if (points.length === 0) return "";
  if (points.length === 1) return `M ${points[0].x} ${points[0].y}`;
  const pts = [points[0], ...points, points[points.length - 1]];
  let d = `M ${points[0].x} ${points[0].y}`;
  for (let i = 1; i < pts.length - 2; i++) {
    const p0 = pts[i - 1];
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const p3 = pts[i + 2];
    const c1x = p1.x + (p2.x - p0.x) / 6;
    const c1y = p1.y + (p2.y - p0.y) / 6;
    const c2x = p2.x - (p3.x - p1.x) / 6;
    const c2y = p2.y - (p3.y - p1.y) / 6;
    d += ` C ${c1x} ${c1y}, ${c2x} ${c2y}, ${p2.x} ${p2.y}`;
  }
  return d;
}
