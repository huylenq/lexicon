import { Order } from "./order";
/** Process memory only. Restarting the API loses its orders. */
export class OrderRepository {
  private orders = new Map<string, Order>();
  save(order: Order) { this.orders.set(order.id, order); }
  find(id: string) { return this.orders.get(id); }
}
