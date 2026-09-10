import { Checkout } from "./checkout";
import { OrderRepository } from "./repository";
const checkout = new Checkout(new OrderRepository());
export async function handle(request: Request): Promise<Response> {
  if (request.method !== "POST" || new URL(request.url).pathname !== "/orders")
    return new Response("Not found", { status: 404 });
  try {
    return Response.json(checkout.place(await request.json()), { status: 201 });
  } catch {
    return new Response("Invalid order", { status: 400 });
  }
}
if (import.meta.main) Bun.serve({ port: 5400, fetch: handle });
