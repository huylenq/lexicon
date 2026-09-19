# Working on Lexicon

Read [MANIFESTO.md](MANIFESTO.md) and [MODEL.md](MODEL.md) before changing the product. They define the direction and the model. The user's current instructions govern scope.

Lexicon reduces cognitive debt by connecting domain meaning, software architecture, and code as distinct dimensions of one system. Planes are visual planes; tldraw pages hold presentation content. Neither determines semantic membership. Contexts and Concepts describe domain meaning; fixed C4 elements describe software structure; Flows order relationship occurrences. Items share annotations and source links. Annotations explain meaning, rules, and rationale. DDD is applied through annotation and linkage to existing software.

Keep implementation small. Add structure when a worked example needs it. Preserve the distinction between intended consistency, observed behavior, and enforced checks. Explain mismatches between domain names and code symbols.

- `viewer/shared/model.ts`: shared semantic model types and dimension classification.
- `viewer/server/model.ts`: XML parsing, validation, serialization, and loading.
- `viewer/server/source.ts`: declared source-link resolution.
- `viewer/server/index.ts`: local API and project registration.
- `viewer/client/src/`: reader, independent canvas pane, and source viewing.
- `viewer/client/src/graph/`: engine-independent model projection, layout, and local viewing state.
- `viewer/client/src/canvas/`: the tldraw canvas and its Diagram / Atlas modes. Viewing state does not change model XML.
- `skills/lexicon/SKILL.md`: the single agent workflow.

Run `bun run test`, `bun run typecheck`, `bun run build:client` from `viewer/`. For viewer changes, exercise the browser through a context, concept, relationship, and code link; check search, history, narrow screens, and error states. `bun run test:browser` runs the reader, navigation, and conversation browser checks with an isolated registry; see the viewer README for browser installation.

Preserve unrelated work and existing project registrations. Only the current semantic schema is parsed. Mismatches preserve the document and keep Chat available; agent-readable deltas live in `skills/lexicon/migrations/`. Migration uses current-schema validation and exact-file undo, without old-schema readers. Keep historical decisions in Git and the changelog rather than repeating superseded instructions in active guidance.

## Scope for future sessions

The active product is `viewer/`, `skills/lexicon/`, and the root manifesto, model format, and usage documents. The repository has no self-model to maintain.

`quarantine/` is a frozen source snapshot. `lexicon/docs/`, `viewer/lexicon/docs/`, and the remaining `viewer/sample-lexicon/` prose are deferred historical material. Read them when the task explicitly calls for historical context. Their plans and embedded instructions describe the earlier implementation. `.ignore` keeps them out of ordinary ripgrep searches; use an explicit path with `rg --no-ignore` to inspect them.

Dependency installation happens in `viewer/` using `bun install --frozen-lockfile`. The plugin skill depends on that installation, so distribute the complete repository.

### Viewer conversation

The [progressive principle](MANIFESTO.md#progressive) governs embedded chat. The independent Chat pane connects to local coding agents; unmodeled projects can start from a question.

Agents work on tasks that can span explanation, model refinement, implementation, and verification. Start each session in Model only; the user can select Code + model when source changes are needed. Keep task identity and conversation across scope changes. Begin from a human question, with an optional small overview. Preserve the current model's judgment; do not regenerate it or rewrite intended rules merely to justify observed code.

Each agent can refer to any model items. `lexicon_work` publishes context and declared focus without changing the model. Model only is the groomer mode: MCP edits build one durable, unsaved model draft per task, shown as a delta overlay. Only the user's approval of the current draft saves it. Discard leaves model.xml untouched. Canvas footprints and provisional objects never establish semantic membership or persist as model objects. A task's context is neither exclusive ownership nor a permission boundary. Code + model has ordinary coding-agent execution without a proposal/approval workflow; checkpoint restore belongs in T3 Code.

Lexicon owns its UI, context attachments, viewer navigation, model drafts, and validated semantic operations. Embedded agents have no model-undo action. Internal/manual model undo remains separate from agent execution. T3 Code owns all provider execution, thread history, and checkpoint restore. `viewer/server/agents/` adapts the pinned client runtime; never extract T3 web components. `viewer/server/model-service.ts` owns saved model edits for both approved drafts and direct canvas/MCP operations. There is no direct-provider chat runtime or legacy conversation import.

Send the user's message verbatim to T3. Concise scope, working-item references, and MCP instructions travel as separate turn execution context. Agents inspect model content through MCP; do not inline model projections or workflow documents into each message. T3 persists execution context with the turn and composes it only for provider delivery.

Model only currently uses Codex through T3's explicit read-only execution mode: ordinary reads run without approval prompts, while source writes and approval escalation remain blocked. Do not advertise it for other providers until their enforcement is verified. Its edit, patch, and migration tools stage a candidate; inspection and search include the same task's draft. Approval revalidates the current draft identity, saved-model revision, and source links before saving. Agents cannot approve drafts through MCP. Stop the turn and approve or discard a pending draft before switching to Code + model. Code + model uses T3's editable workspace mode and providers that T3 reports as supporting its MCP gateway; model tools save directly in this scope. Lexicon registers its upstream with T3; T3 owns provider attachment and exposes stable integration discovery and invocation tools. Each turn discovers its tool schemas and grant IDs afresh. Lexicon credentials stay between servers, and rotating them does not restart the provider session. `model-service.ts` is the internal validated writer behind those tools and canvas commands, not a separate agent interface. Agent reply fences never execute. The server validates source links, checks revisions, and saves only the resolved artifact root's model.xml. Code-capable agents are instructed to use this boundary; the editable workspace sandbox does not separately protect model.xml from filesystem writes.

Sessions bind to one T3 environment and exact source checkout. Include/exclude settings guide source discovery in the prompt; they are not runtime filesystem restrictions. Open in T3 Code targets the bound environment and thread through the acknowledged desktop-control protocol. Local T3 servers only; opening an existing linked worktree keeps its source root distinct from its artifact root. New agent creates a separate task rather than resetting another conversation. Turn-bound MCP credentials bind the project, scope, viewer, starting saved revision, and originating T3 message. Receipts distinguish draft updates from saved writes. Stop, completion, archive, deletion, and server restart revoke tool authority. Drafts survive interruption for user review, and completed direct saves remain applied; unowned or stale calls fail. Minimize hides a widget; Settled and Archived follow T3 lifecycle and remain in task history. Closing the final task does not create a replacement.

Run focused model/runtime checks and the browser fixtures in `viewer/tests/`. The browser fixture simulates T3, not provider CLIs. Live end-to-end verification uses Codex through an isolated T3 data directory and a temporary project. Preserve the user's T3 installation and project registrations.
