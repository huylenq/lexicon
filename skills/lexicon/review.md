# Review domain meaning

Apply these two passes separately when creating or changing a model. For a focused refinement, review the requested scope and affected connections; preserve established judgment elsewhere. For a first model, assess the chosen scope against the original request. Declaring a narrow scope does not make it representative.

## Coverage: are these the right ideas?

- Can a newcomer explain the system's purpose and distinguishing behavior using the model?
- Are its essential information, identities, lifetimes, decisions, and lasting effects visible? What pivotal idea is absent or buried as an unexplained field?
- Does the model explain what persists across operations and what may change? Where applicable, distinguish observation from trusted state, proposed change from authorized change, and an episode from standing identity.
- Would an omitted concept cause a material misunderstanding? Investigate it before adding more detail to a well-covered path. Separate an essential unresolved gap from optional future detail.
- Do contexts establish meaning and responsibility? Could several pipeline stages collapse into one context without losing domain distinctions?
- Do services and implementation details crowd out the information and decisions they serve? Could a code link explain a mechanism more economically than another concept?
- Can the essential collaborations be followed? Review disconnected ideas, but never invent edges to make the graph connected or delete an essential idea just to remove an isolated node.

For example, a commerce model can trace checkout perfectly while omitting the difference between a product, available stock, and an agreed order line. A job platform can model dispatch while failing to explain retries, durable jobs, and individual attempts. A workflow diagram is useful evidence, but does not alone establish a sufficient domain model.

## Correctness: does the evidence support the meaning?

Inspect the source behind consequential claims, including connecting callsites and relevant declaration bodies. Verify the endpoints' roles, direction, creation/consumption order, and activation conditions. A declaration proves that a type exists; an integration claim needs evidence of the bridge. Separate similarly shaped concepts with different identities or lifetimes, and explain their code correspondence.

For rules, distinguish intended consistency, observed behavior, and enforced checks. Name the scope of enforcement and link the check. Preserve configuration dependence, defaults, bypasses, exceptional outcomes, and limits. A naming convention or documented architectural boundary is not automatically enforced. A test describes a contract; claim it passed only if it was run.

Qualify unknowns honestly. An unsupported integration may remain unresolved even when both endpoints exist. A file-level link is appropriate for an unsupported symbol language, but still requires semantic inspection. Classifications should explain real identity, value semantics, consistency, or responsibility.

After edits, run structural/code-link checks and exercise the reader when available: overview, context, concept, relationship, and implementation. Check that the explanation and linked code let the reader answer the intended questions. Report coverage findings separately from correctness and tooling results.

When an independent review is available, have it form its own view from project purpose and source before seeing the author's conclusions. Its first question is “What pivotal thing did this model miss?” Self-review uses the same question. Review findings should refine the shared model; no separate permanent decision log is needed.
