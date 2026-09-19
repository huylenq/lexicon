import type { ModelItem } from "../../shared/model";

/** A small, real model for deterministic MCP/browser trials. No provider CLI runs. */
export const workModelXml = `<lexicon schema="3.3" id="workshop">
<name>Order Workshop</name><description>Explore order validation across meaning and implementation.</description>
<context id="ordering"><name>Ordering</name><description>Accepted purchases and their rules.</description>
  <concept id="order"><name>Order</name><description>A purchase accepted by the shop.</description><code-link kind="code" file="order.ts" symbol="Order" role="representation">Stores the accepted order.</code-link></concept>
  <concept id="order-line"><name>Order Line</name><description>A requested product and quantity.</description></concept>
</context>
<system id="shop"><name>Shop</name><description>The order processing system.</description>
  <container id="api"><name>Order API</name><description>Accepts and validates purchases.</description>
    <component id="policy"><name>Order Policy</name><description>Checks whether an order can be accepted.</description><code-link kind="code" file="policy.ts" symbol="acceptOrder" role="implementation">Checks the order before acceptance.</code-link></component>
    <component id="legacy"><name>Legacy Validator</name><description>An obsolete validation adapter.</description></component>
  </container>
</system>
<relationship id="contains" from="order" to="order-line"><name>contains</name><description>An order contains its requested lines.</description></relationship>
<relationship id="implements" from="policy" to="order"><name>checks acceptance of</name><description>The policy checks whether the purchase can be accepted.</description></relationship>
</lexicon>`;

const order: ModelItem = {
  id: "order", type: "concept", parent: "ordering", name: "Order",
  description: "A purchase whose requested lines satisfy the acceptance rules.", annotations: [],
  codeLinks: [{ kind: "code", file: "order.ts", symbol: "Order", role: "representation", description: "Stores the accepted order." }],
};
const policy: ModelItem = {
  id: "policy", type: "component", parent: "api", name: "Order Policy",
  description: "Owns order acceptance rules, including positive line quantities.",
  annotations: [{ kind: "rule", text: "Every requested quantity must be positive.", evidence: "intended" }],
  codeLinks: [{ kind: "code", file: "policy.ts", symbol: "acceptOrder", role: "implementation", description: "Enforces positive quantities before accepting the order." }],
};
const validator: ModelItem = {
  id: "validation", type: "component", parent: "api", name: "Order Validation",
  description: "A separate responsibility for order validation.", annotations: [], codeLinks: [],
};

const validates: ModelItem = {
  id: "validates", type: "relationship", from: "validation", to: "order", name: "validates",
  description: "The validator checks requested lines before accepting a purchase.", annotations: [], codeLinks: [],
};

export const workRequests = {
  sketch: "Clarify order validation and remove the old adapter.",
  revise: "Keep validation in the existing policy and refine its rules.",
  apply: "Refine the policy and remove the obsolete adapter.",
  migrate: "Migrate this model to the current schema for review.",
  metadata: "Clarify the project name and its explanation.",
} as const;

export type WorkOperation = { tool: string; arguments: Record<string, unknown> };
export function workFixtureOperations(text: string): WorkOperation[] | undefined {
  if (text === workRequests.migrate) return [{ tool: "lexicon_migrate", arguments: { xml: workModelXml } }];
  if (text === workRequests.metadata) return [{ tool: "lexicon_patch", arguments: { patch: { project: { name: "Refined Order Workshop", description: "Explain order acceptance and its implementation." } } } }];
  if (text === workRequests.sketch) return [
    { tool: "lexicon_work", arguments: { contextIds: ["order", "policy"], focus: { itemIds: ["order", "policy"], action: "inspect" } } },
    { tool: "lexicon_patch", arguments: { patch: { upsert: [validator, order, validates], remove: ["legacy"] } } },
  ];
  if (text === workRequests.revise) return [
    { tool: "lexicon_work", arguments: { focus: { itemIds: ["policy"], action: "inspect" } } },
    { tool: "lexicon_patch", arguments: { patch: { upsert: [policy], remove: ["validation", "validates"] } } },
  ];
  if (text === workRequests.apply) return [{ tool: "lexicon_patch", arguments: { patch: { upsert: [policy], remove: ["legacy"] } } }];
}
