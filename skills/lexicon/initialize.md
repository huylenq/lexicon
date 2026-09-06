# Initialize a human model

Use this workflow for an authorized first model. A broad initialization should help a newcomer explain what the system does, what it knows or preserves, and what governs change. A focused subsystem request uses the same questions within its stated boundary. An exploratory question alone does not authorize creation.

## 1. Discover the system before choosing a path

Read active project orientation and sample implementation across its defining responsibilities. Use documentation to discover claims and vocabulary; inspect source to distinguish implemented behavior from intentions, obsolete descriptions, and future plans. Entry points show how work starts. Stored records, domain types, decision logic, policy checks, and writers show what the work means and what survives it. Look beyond the easiest supported language or most visible runtime package.

Investigate these perspectives where applicable:

| Perspective | Questions |
| --- | --- |
| Purpose | Who uses the system? What outcome does it provide? What distinguishes it from a generic system of this kind? |
| Information | What does it know, store, produce, or exchange? Which distinctions matter to users? |
| Identity and lifetime | What persists across operations? What exists for one episode? Who owns each? |
| Decisions | Which choices change the outcome, and what information informs them? |
| Authority and consistency | Who may change what? Which conditions must hold? What prevents an invalid change? |
| Change over time | What is learned, revised, approved, expired, recovered, or reused? |
| Collaboration | Which responsibilities depend on each other, and through which contracts? |

These are discovery questions, not required contexts or objects. Do not invent governance, learning, or other machinery where the system has none. A monorepo may contain distinct products; establish their relationship and explain the selected product boundary before treating one package as the system.

## 2. Select the essential ideas

Before drafting XML, form a compact account of the purpose, essential information, responsibilities, decisions, and lasting effects. For each candidate concept ask: “What important misunderstanding would a reader have if this were missing?” Prioritize concepts that explain distinctive behavior, meaningful lifetimes, consequential choices, or consistency boundaries.

Check whether a candidate has meaning beyond its current implementation symbol. A dispatcher may need only a code link on the work it dispatches. A technical mechanism can be an essential concept when it is itself part of the product's domain. Do not mechanically rename functions into concepts or translate every package into a context.

Choose context boundaries after understanding the concepts. A context establishes consistent meaning and responsibility; an execution stage or directory name alone does not establish one. Put results with the work they conclude unless a different ownership has domain meaning. Use classifications only when supported: a long-lived process or a collection of fields does not by itself establish an aggregate.

## 3. Establish breadth, then substantiate pivotal collaborations

Cover the essential responsibilities before expanding one deeply. Depth can be uneven. Choose enough representative traces to explain how the essential concepts collaborate; a single request lifecycle may miss what the system preserves or changes between runs. Include the consequential success, refusal, failure, and later-reuse paths that matter to this system.

For each important relationship, inspect the actual connecting mechanism: calls, registration, data transfer, storage reads/writes, or explicit contracts. Inspect when information is created and consumed. Shared fields or similar names can describe a decision, an execution record, and a later snapshot with different roles. Endpoint existence does not prove integration, and separate implemented pieces do not prove a complete cycle.

Keep meaningful concepts when their integration is unresolved. Explain the uncertainty on the relevant object using an annotation, qualify a documented intended relationship, or omit the unsupported edge. Investigate pivotal unknowns further; moving them to an omissions list does not establish adequate coverage. State any remaining essential gap plainly rather than claiming the first model is complete.

## 4. Author and review

Read `MODEL.md` for the format. Write the selected concepts and their relationships, with explanations of purpose, rules, and rationale. Link inspected implementation and explicit checks. Distinguish intended, observed, and enforced claims; preserve activation conditions, defaults, exceptions, and failure outcomes.

The project description should explain the system and the model's scope in language a newcomer can use. Record significant uncertainty beside the affected concept or relationship. Keep temporary discovery notes temporary; the shared model carries the result.

Apply both passes in [review.md](review.md). First ask whether the right things were modeled, then whether the model is correct. Completion means a reader can explain the system's defining ideas, what persists, and what governs change, with evidence for essential connections. Object counts, a connected graph, and directory coverage are not completion targets. Further detail grows through human questions and refinement.
