/** Data representation only; this example does not enforce the review policy. */
export interface Order {
  id: string;
  total: number;
  review?: { reviewer: string; decision: "approve" | "reject"; reason: string };
}
