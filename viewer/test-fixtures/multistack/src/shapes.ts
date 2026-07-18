// Fixture for the code lens. Circle extends Shape (structure: extends);
// computeArea calls scale (call-flow: calls).

export interface Shape {
  area(): number;
}

export interface Circle extends Shape {
  radius: number;
}

export function scale(x: number): number {
  return x * 3.14159;
}

export function computeArea(c: Circle): number {
  return scale(c.radius * c.radius);
}
