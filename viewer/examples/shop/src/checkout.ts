import { Order, type OrderLine } from "./order";
import { OrderRepository } from "./repository";
export class Checkout {
  constructor(private repository: OrderRepository) {}
  place(lines: OrderLine[]) {
    const order = new Order(crypto.randomUUID(), lines);
    this.repository.save(order);
    return order;
  }
}
