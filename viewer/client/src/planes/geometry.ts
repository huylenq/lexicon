export type Point = { x: number; y: number };
export type Homography = [number, number, number, number, number, number, number, number];

/** Maps a unit square onto four projected corners: TL, TR, BR, BL. */
export function planeTransform([a, b, c, d]: Point[]): Homography {
  const dx = a.x - b.x + c.x - d.x, dy = a.y - b.y + c.y - d.y;
  const bx = b.x - c.x, by = b.y - c.y, dx2 = d.x - c.x, dy2 = d.y - c.y;
  const determinant = bx * dy2 - dx2 * by;
  if (Math.abs(determinant) < 1e-8) throw new Error("The plane is too close to edge-on.");
  const g = (dx * dy2 - dx2 * dy) / determinant;
  const h = (bx * dy - dx * by) / determinant;
  return [b.x - a.x + g * b.x, d.x - a.x + h * d.x, a.x,
    b.y - a.y + g * b.y, d.y - a.y + h * d.y, a.y, g, h];
}

export function projectPoint(m: Homography, p: Point): Point {
  const w = m[6] * p.x + m[7] * p.y + 1;
  return { x: (m[0] * p.x + m[1] * p.y + m[2]) / w,
    y: (m[3] * p.x + m[4] * p.y + m[5]) / w };
}

export function unprojectPoint(m: Homography, p: Point): Point {
  const a = m[0] - p.x * m[6], b = m[1] - p.x * m[7], c = p.x - m[2];
  const d = m[3] - p.y * m[6], e = m[4] - p.y * m[7], f = p.y - m[5];
  const det = a * e - b * d;
  if (Math.abs(det) < 1e-8) throw new Error("Cannot map the pointer onto this plane.");
  return { x: (c * e - b * f) / det, y: (a * f - c * d) / det };
}

export function measurePlane(element: HTMLElement): Homography {
  return planeTransform([...element.querySelectorAll<HTMLElement>("[data-plane-corner]")].map(marker => {
    const bounds = marker.getBoundingClientRect();
    return { x: bounds.x, y: bounds.y };
  }));
}
