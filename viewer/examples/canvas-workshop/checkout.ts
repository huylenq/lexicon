// A deliberately small teaching fixture for the canvas workshop.
export type OrderLine = { unitPrice: number; quantity: number };
export type Order = { lines: OrderLine[] };

export function total(order: Order): number {
  if (order.lines.length === 0) throw new Error("An order needs at least one line.");
  return order.lines.reduce((sum, line) => sum + line.unitPrice * line.quantity, 0);
}
