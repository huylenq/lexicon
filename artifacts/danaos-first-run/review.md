# DanaOS first-run review

Source checkout: `/Users/huy/src/aitomatic/dana-os`, HEAD `370e1c9d25a71d603c1ffaf9af567b23801f906d` on 2026-09-06. The requested `~/src/dana-os` path was absent. Both trials use GPT-5.6 Luna with high reasoning and the installed Lexicon skill. Project source and pre-existing changes are preserved.

## Baseline

[Original model](baseline.xml): 9 contexts, 26 concepts, 13 relationships; 43 checked links, no unchecked or broken links, no model errors. Eight concepts have no relationship: ODB Contracts, STAR Execution, Agent Result, Token Acquisition, Structural Pack Registry, Runtime Ontology Review, Daily Brief, and Structural Pack. Twenty-one concepts are classified as services. These counts describe the result; they are not quality thresholds.

The reader opens the model and its source links correctly. Its STAR Execution page has zero connections, so the graph cannot explain how an invocation reaches STAR or produces a result. The overview groups much of the system by package tiers. All six rule annotations describe intent; none shows an observed condition or enforced check.

Source review found integration claims beyond their cited evidence:

- `learned-model-implements-world-model` links `CHARMModel`, a PyTorch training/embedding model in `dana-models/kairos/jepa_ts/charm.py:517`. That declaration does not show registration or adaptation to the Rust WorldModel contract. The simulator relationship likewise cites the target trait, not a backend integration.
- `librarian-uses-resolvers` claims a ResolverRegistry path. `run_librarian` constructs `LibrarianOdbToolPort` and delegates to STAR; the linked function does not establish a ResolverRegistry call.
- `console-inspects-graphs` targets Loop Graph. The linked `_topology` function projects a supplied compiled graph; its host imports customer modules without Dana package dependencies. It does not establish a dana-loop connection.
- `ontologist-governs-agent-knowledge` targets Agent Authoring Session, but the linked curation command stages/writes domain packs. The model provides no mechanism tying it to AuthoringSession.

These are unsupported claims in this artifact, not proof that no integration exists elsewhere. A reviewer must find the bridge, qualify an intended relationship, or omit it.

## Workflow change

The installed skill now chooses a representative behavior for an unspecified initialization request, records its question and scope, follows the behavior through decisions to a result and failure, and reviews isolated concepts. Relationship evidence must connect the exact endpoints. Rule explanations retain conditions and failure outcomes. The embedded chat prompt carries the same guidance. Checker output also states that passing checks establish structure and target resolution, with relationship claims and rule evidence requiring source review. MODEL.md explains the distinction between structural checks and semantic review.

No schema expansion was needed to express these corrections. Existing concepts, directed relationships, annotations, and code links can describe execution, authority, failure, and consistency. This trial does not establish adequacy for every domain or a need for machine-executable lifecycle semantics.

## Fresh trial with revised guidance

[Raw second model](revised-initial.xml): 4 contexts, 13 concepts, 11 relationships; 37 checked links and no structural or link errors. It chooses an explicit question about agent invocation and names its omissions. It includes authority refusal, binding pins, node outcomes, and the optional audit rail, with eight enforced annotations and two observed annotations. This is a useful change in modeling behavior, but one before/after pair does not establish a success rate.

Independent review still found a disconnected request/refusal component, missing STAR-to-outcome return, some endpoint-only relationship evidence, and a production gateway rule labelled enforced despite the cited leaf code documenting an architectural convention. A follow-up review corrected these incrementally. Further source review found that the initial workflow selects its graph using BindResult before the gateway constructs BoundMission. Treating that later re-entry snapshot as the initial graph-selection input reverses the creation/consumption order. The reviewed model separates Binding Decision from Bound Mission. The workflow guidance now asks authors to check this order. That correction is reviewer-assisted and must not be counted as an unassisted first-run result.

The fresh trial represented gateway `AgentResult` and workflow `AgentRunResult` through an explained many-to-one code mapping. This required no new schema object. The remaining problems were evidence and graph completeness, not an inability to express the distinctions.

## Reviewed model in DanaOS

[Reviewed artifact](reviewed/lexicon/model.xml) is now saved at `/Users/huy/src/aitomatic/dana-os/lexicon/model.xml` and registered in the local reader at `/p/10`. It has 4 contexts, 15 concepts, 18 relationships, and 61 checked links, with no unchecked links, broken links, or model errors. Every concept participates in the connected model.

The revision narrows the broad inventory to the invocation question. It preserves the original project identity and the IDs and names of Bounded Agent Runtime, Agent Invocation, STAR Execution, and Agent Result. Uninspected package breadth and unsupported integrations were removed from the active scope; the baseline remains above for comparison. The follow-up agent's reviewed artifact is also preserved under `revised/` before this integration.

Reader review opened Bound Mission, its re-entry relationship, and `BoundMission.is_live` at lines 129–133. A 390×844 viewport kept the explanation and endpoint links readable. Refreshing an old, removed relationship displayed the expected unavailable-item recovery state. The final graph is open for exploration.

## Verification

Lexicon: 42 unit tests, 31 browser tests, typecheck, and client build pass. Browser tests cover search, history, narrow screens, source failures, and chat. The production build retains its existing large-chunk warning. Independent manual review opened the actual DanaOS overview, context, concept, relationship, source declaration, and source-symbol search in the reader.

The DanaOS artifact is ignored by its existing `.git/info/exclude`; no ignore rule was changed. No commit was made. These checks validate Lexicon and inspect DanaOS source; no DanaOS services or live agent invocation were run.
