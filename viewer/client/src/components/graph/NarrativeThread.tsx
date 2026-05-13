import { Fragment } from "react";
import { catmullRomPath } from "@/lib/graph/spline";

export interface ThreadStop {
  id: string;
  x: number;
  y: number;
}

export default function NarrativeThread({ stops }: { stops: ThreadStop[] }) {
  if (stops.length < 2) return null;
  const path = catmullRomPath(stops.map(s => ({ x: s.x, y: s.y })));
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

