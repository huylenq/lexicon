# Agent capabilities in Lexicon

## Purpose and status

Lexicon should be operable by a person using a mouse, keyboard, text conversation, or voice conversation. An external agent should be able to understand the current application state, act on a specific project or viewer session, and receive the actual result. The visible application should reflect those actions as they happen.

This document defines the broader vocabulary before choosing an implementation subset. The catalog expresses design intent; the first-slice section identifies the implementation boundary. An entry in the catalog is not a claim that the operation exists today.

Lexicon's purpose remains reducing the effort of reconstructing how software works. Agent capabilities should help people explore and refine one shared model. The semantic schema remains the small language defined in [MODEL.md](MODEL.md), with human judgment and source evidence governed by [MANIFESTO.md](MANIFESTO.md).

## Three independent dimensions

| Dimension | Question | Examples |
| --- | --- | --- |
| Capability | What can Lexicon do? | Inspect a concept, focus a canvas, update a description |
| Integration | How does a caller access it? | In-process UI action, local HTTP API, MCP tool |
| Interaction modality | How does a person express intent? | Pointer, keyboard, text, voice |

Voice belongs at the interaction layer. MCP exposes application operations to a compatible agent client. Neither requires Lexicon to implement speech recognition or become a general-purpose agent runtime. Compatibility with a particular ChatGPT voice surface needs its own verification; a working MCP server alone does not establish that compatibility.

Embedded agents and external agents should converge on the same application semantics and write protections. Provider selection and conversation transport remain separate concerns.

## Capability families

### Orient

Establish what is available and what the person is currently looking at.

| Verb | Targets | Meaning |
| --- | --- | --- |
| Discover | Projects, sessions, capabilities | Enumerate available resources and supported operations |
| Open | Project, view | Establish a working surface |
| Inspect | Project, item, session, selection | Return current structured state with stable identifiers |
| Search | Model items, annotations, links | Find relevant content and return identifiers for subsequent operations |

Inspection should include the model revision and distinguish source roots from artifact roots. A viewer session identifies one open surface; a project may have several. The agent must not silently choose a different project because a browser tab gained focus.

“Current selection” is session state. A name is useful for discovery but can be ambiguous; subsequent commands should use stable IDs. Missing models and schema mismatches should be explicit states, preserving the existing document.

### Navigate

Guide attention through the model without changing its meaning or saved presentation.

| Verb | Meaning |
| --- | --- |
| Select | Establish the item used as conversational and interaction context |
| Focus | Bring an item into the visible surface and frame it for reading |
| Follow | Traverse a relationship, containment link, code link, or flow occurrence |
| Back / forward | Traverse the chosen session's navigation history |
| Pan | Translate the canvas viewport |
| Zoom | Change viewport scale, optionally around an anchor |
| Fit | Frame the current model or an explicitly chosen set of items |
| Filter | Choose which projection or subset is visible |
| Expand / collapse | Reveal or hide detail where the view supports it |

Select and focus have different effects. Selecting an item should not unexpectedly move the camera. Focusing may open the canvas and move its camera; its result should identify the actual selected item and visible view. Fit should report failure when there is no visible content to frame.

Navigation targets an explicit viewer session. A command being accepted by the server does not prove that the UI carried it out. The viewer acknowledges completion after applying the operation, or returns an actionable failure. A disconnected or stale session must not produce an invented success.

### Model

Change the semantic document through validated operations.

| Verb | Meaning |
| --- | --- |
| Create | Add an item with a new stable ID and its required meaning |
| Update | Change explicitly supplied fields while preserving unspecified content |
| Remove | Delete an item after accounting for dependent references |
| Relate | Create an explained, directed relationship between elements |
| Move | Change structural ownership while preserving the item's ID |
| Reorder | Change ordered content, principally flow steps |
| Split | Develop one item into several, with explicit identity and relationship decisions |
| Merge | Consolidate items, preserving chosen identity and resolving references |

Create, update, and relate are useful small operations. Split and merge are composite workflows whose meaning depends on human judgment. A split cannot be safely reduced to dividing text or copying every relationship to every new concept.

Structural movement respects the existing containment rules: concepts belong to contexts, containers to systems, and components to containers. A domain relationship named “contains” does not change that ownership. Relationships connect elements; flows contain ordered relationship occurrences.

Updates must preserve stable IDs, annotations, links, and fields the caller did not supply. Replacement of an owned array should be explicit. Unknown fields and invalid combinations should fail visibly. New code links must resolve within the selected source root before the model is saved.

### Present

Author the visual explanation stored separately from the model.

| Verb | Meaning |
| --- | --- |
| Place | Set a canvas object's position |
| Arrange | Lay out a specified collection using a declared arrangement |
| Resize | Change presentation dimensions |
| Style | Change supported presentation attributes |
| Annotate | Add a canvas note, drawing, or other presentation explanation |

Place changes coordinates; move changes semantic membership. Model annotations explain domain meaning, rules, and rationale. Canvas annotations explain a particular presentation. The owner and destination must be explicit even when natural language uses “note” for both.

Presentation operations should reuse existing canvas persistence, merge behavior, and recovery protections. Agent navigation should not accidentally overwrite authored arrangement. Semantic edits should update the existing cards that reference their IDs.

### Ground

Connect an explanation to implementation and assess its support.

| Verb | Meaning |
| --- | --- |
| Inspect source | Read a declared file or symbol within the selected code root |
| Resolve | Establish whether a code-link target exists and is unambiguous |
| Link / unlink | Add or remove an item's code reference |
| Trace | Follow the connecting implementation for a behavior or relationship |
| Assess | Evaluate whether evidence supports a semantic claim |

Resolution establishes that a target can be found. Assessment evaluates its relevance to a claim. Neither structural validation nor finding both endpoints proves a runtime interaction. Trace and assess are agent workflows built from source access and model inspection; they are not assertions a transport adapter can certify.

Results should keep intended consistency, observed behavior, and enforced checks distinct. Unsupported symbols and incomplete scenario coverage remain visible qualifications. Source code editing remains outside the embedded modeling agent's scope.

### Review

Make changes inspectable and recoverable.

| Verb | Meaning |
| --- | --- |
| Preview | Calculate a proposed result without saving it |
| Compare | Describe differences between identified revisions |
| Validate | Check structure, references, and applicable code-link resolution |
| Apply | Save a change against the exact revision the caller inspected |
| Undo | Restore the previous exact contents when the current file still matches |

Application and navigation have different completion boundaries. A saved semantic edit can succeed with no viewer open. A navigation action requires a live viewer acknowledgment. Receipts must distinguish these outcomes.

Edits share the existing artifact-root lock with embedded chat and canvas commands. A stale revision or active writer causes an explicit refusal. Undo must not overwrite intervening external edits. Validation success reports the checks actually performed; semantic correctness remains a separate assessment.

## Targets and identity

| Object family | Objects | Identity and lifetime |
| --- | --- | --- |
| Workspace | Project | Registered project ID, explicit source and artifact roots |
| Session | Open viewer, active view, selection | Ephemeral session ID for one mounted project surface |
| Semantic | Context, Concept, Person, System, Container, Component, Relationship, Flow | Stable project-wide item IDs |
| Owned semantic content | Description, Annotation, Code Link, Flow Step | Belongs to an item; existing link and step IDs retained |
| Presentation | Canvas shapes, notes, arrangement | Separate canvas document and its references to semantic IDs |
| Change | Proposed operation, receipt, undo record | Operational state; no new semantic schema type |

A tool should require the project ID for project operations and both project and session IDs for navigation. “This concept” is resolved through a current session inspection. The integration should expose ambiguity rather than guessing among same-named items or multiple windows.

## Observation and feedback

Observation complements the six action families. The vocabulary is read state, subscribe, and unsubscribe. Useful events include session opened/closed, selection changed, view changed, model changed, and operation completed/failed.

An event identifies its project, session where applicable, and revision or sequence. A newly connected subscriber receives a snapshot. After disconnection, it must resynchronize rather than assume it saw every intermediate event. Selection events follow human actions as well as agent commands, allowing the conversation to continue from what the person actually sees.

The first implementation may provide a bounded cursor-based event feed to MCP clients and a live stream to viewers. These are transport choices. They must document retention and restart behavior; a bounded feed is not a durable audit log.

A useful loop is: inspect state, resolve the person's intent, execute an operation, receive its result, observe the visible application, and continue. Server acceptance, persistence, and viewer completion should never be collapsed into one ambiguous “success.”

## Atomic operations and composed intentions

The taxonomy is broader than the tool list. Tool boundaries should follow coherent contracts instead of creating one tool for every phrase.

“Rename this concept to Refund and show its connections” combines session inspection, a partial update at a known revision, validation and save, then focus and relationship inspection. The saved change and navigation each have a result. A navigation failure does not roll back an otherwise successful rename.

“Explain why payment can fail” combines search, inspection, source tracing, and assessment. The answer may lead to a separately requested model refinement. Exploration alone does not authorize an inferred semantic edit.

“Split Payment into Authorization and Settlement” needs discussion of responsibilities, chosen IDs, links, and relationship reassignment. Its eventual implementation can apply one validated patch so partial restructuring is never saved.

## Operational contract

- Scope operations to registered projects and explicit live sessions. Local integration inherits the viewer's local-host and desktop-token protections.
- Use a structured input schema and reject unknown operations and fields. Return useful errors for missing objects, unsupported document versions, stale revisions, busy models, and unavailable sessions.
- Read results include revisions. Writes require an expected revision, preserve unspecified fields, and reuse structural validation, changed-link checks, serialization, and exact-file undo.
- Navigation has bounded waiting and an acknowledgment from the chosen viewer. Expired commands must not unexpectedly run after reconnection.
- A session changing projects invalidates commands addressed to its old project. Closing a session removes it from discovery after disconnection or expiry.
- Successful edit receipts include affected IDs, the resulting model revision, validation qualifications, and undo availability. Successful navigation receipts identify the resulting session state.
- Retrying a write with its old revision must fail rather than duplicate a creation. An uncertain response is resolved by rereading state; a future persistent operation-ID facility could offer stronger retry semantics.
- MCP is a narrow adapter over application operations. It must not introduce a second XML writer or an independent project registry.

## First implementation slice

| Family | Included |
| --- | --- |
| Orient | List existing projects and live sessions; inspect model or item; search; inspect selection |
| Navigate | Select, focus, fit in one explicit viewer session |
| Model | Create any supported item; partially update an existing item; create a relationship |
| Review | Shared validation and save with expected revision; existing undo protection |
| Observe | Model and selection/session events; refresh visible model content |
| Integration | Local MCP stdio adapter connected to the running viewer's local HTTP API |

The slice starts from an existing valid model. Whole-model initialization and schema migration continue through the current explicit workflows. It does not add speech capture, remote hosting, automatic client configuration, canvas authoring tools, source-editing tools, or semantic review automation.

Stdio makes the first adapter usable by a compatible local MCP host while keeping one running viewer authoritative for persistence and live sessions. A remotely hosted voice client would need another connection path and authentication design. That is subsequent integration work and should not change the capability taxonomy.

## Acceptance

1. A compatible MCP client initializes and discovers documented tools.
2. It finds a registered project and an open viewer session, reads the selected item and model revision, and searches for another item.
3. It creates a concept and a relationship, then updates a description. Invalid references and stale writes leave the file unchanged.
4. The open viewer refreshes its model, including the affected card text, without manual reload.
5. Selecting leaves the camera alone; focusing frames the target; fitting frames the available model. Results follow viewer acknowledgment, and unavailable sessions fail clearly.
6. A human selection is observable by the external client.
7. Undo restores exact previous file contents; external modifications prevent undo from overwriting them.
8. Existing reader navigation, search, history, code viewing, narrow screens, and error behavior continue to work.

Unit and integration tests can establish contract behavior and write protections. Browser tests establish the real viewer response. A specific ChatGPT voice integration requires separate live acceptance with that client.

## Implemented surface

The first slice is exposed through eight tools: `lexicon_projects`, `lexicon_inspect`, `lexicon_search`, `lexicon_sessions`, `lexicon_navigate`, `lexicon_edit`, `lexicon_undo`, and `lexicon_events`. Their input schemas and descriptions live in `viewer/server/agent/tools.ts`. Creation and partial update share one edit tool; creating an item with type `relationship` implements relate.

Embedded chat submits create/update, select/focus/fit, and exact undo to the same server dispatcher, with its originating project/viewer and revision bound by the server. Its operation schemas are derived from the catalog rather than maintained separately. Complex patches retain the shared model save primitive.

The MCP adapter uses the official TypeScript SDK and stdio transport. It forwards tool calls to one running viewer. The underlying local routes are also available to other application clients. See [integration setup](viewer/AGENT-INTEGRATION.md).

A session represents a mounted project reader, with its current semantic/code selection and primary pane. It does not expose arbitrary freeform canvas selections. Focus opens the canvas and reveals the requested item through the existing projection; select also supports flows in the reader. Flows do not have canvas shapes, so focus returns an explicit error for them. Fit frames the current visible model content.

The viewer reports selection and pane state and maintains a heartbeat. Navigation expires after eight seconds. Model changes refresh every connected viewer for that project. A one-second file check also observes edits from embedded chat, the canvas model commands, and external file saves while a viewer is connected. Calls to inspect or read events refresh the server's observed model revision when no viewer is connected.

Undo uses the same persisted stack as embedded chat and canvas model commands. Undoing creation preserves canvas reference shapes as missing references, consistent with existing behavior that retains their attached notes. It restores the semantic XML exactly.

MCP event observation currently uses a bounded cursor feed. The viewer receives live SSE messages; this is distinct from implementing MCP resource subscriptions. The server retains the most recent 256 events across projects and returns only events belonging to the requested project. A reset flag and current session snapshot let callers recover after retention loss or restart.

### Protocol references

The transport and lifecycle follow the official MCP documentation: [stdio transport](https://modelcontextprotocol.io/specification/2025-11-25/basic/transports), [initialization](https://modelcontextprotocol.io/specification/2025-11-25/basic/lifecycle), and [tool results](https://modelcontextprotocol.io/specification/2025-11-25/server/tools). The SDK handles protocol negotiation and framing; Lexicon defines the application operations and their completion semantics.
