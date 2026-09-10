/** Deliberately small executable fixture, not a production commerce system. */
export interface OrderLine { sku: string; quantity: number }
export class Order {
  readonly lines: readonly OrderLine[];
  constructor(readonly id: string, lines: OrderLine[]) {
    if (!lines.length || lines.some(line => !line.sku.trim() || !Number.isInteger(line.quantity) || line.quantity < 1))
      throw new Error("An order needs products with positive whole quantities.");
    this.lines = lines.map(line => ({ ...line }));
  }
}
