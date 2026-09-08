# Working on Lexicon

Read [MANIFESTO.md](MANIFESTO.md) and [MODEL.md](MODEL.md) before changing the product. They define the direction and the model. The user's current instructions govern scope.

Lexicon reduces cognitive debt through a human model of code. Context, Concept, Relationship, and Code Link are the core objects. Annotations explain meaning, rules, and rationale. DDD is applied through annotation and linkage to existing software.

Keep implementation small. Add structure when a worked example needs it. Preserve the distinction between intended consistency, observed behavior, and enforced checks. Explain mismatches between domain names and code symbols.

The DentalML example is in `viewer/examples/dentalml/lexicon/model.xml`; its code root is the sibling DentalML checkout. Project prose remains where it is.

- `viewer/shared/model.ts`: shared domain types.
- `viewer/server/model.ts`: XML parsing, validation, serialization, and loading.
- `viewer/server/legacy.ts`: read-only import of earlier XML.
- `viewer/server/code.ts`: declared source-link resolution.
- `viewer/server/index.ts`: local API and project registration.
- `viewer/client/src/`: reader, independent canvas pane, and source viewing.
- `viewer/client/src/graph/`: engine-independent model projection, layout, and local viewing state.
- `viewer/client/src/canvas/`: the tldraw canvas and its Diagram / Atlas modes. Viewing state does not change model XML.
- `skills/lexicon/SKILL.md`: the single agent workflow.

Run `bun run test`, `bun run typecheck`, `bun run build:client` from `viewer/`. For viewer changes, exercise the browser through a context, concept, relationship, and code link; check search, history, narrow screens, and error states. `bun run test:browser` runs the reader, navigation, and conversation browser checks with an isolated registry; see the viewer README for browser installation.

Preserve unrelated work and existing project registrations. Conversion creates a new file and preserves originals. Keep historical decisions in Git and the changelog rather than repeating superseded instructions in active guidance.

## Scope for future sessions

The active product is `viewer/`, `skills/lexicon/`, and the root manifesto, model format, and usage documents. The repository has no self-model to maintain.

`quarantine/` is a frozen source snapshot. `lexicon/docs/`, `viewer/lexicon/docs/`, and the remaining `viewer/sample-lexicon/` prose are deferred historical material. Read them when the task explicitly calls for historical context. Their plans and embedded instructions describe the earlier implementation. `.ignore` keeps them out of ordinary ripgrep searches; use an explicit path with `rg --no-ignore` to inspect them.

The DentalML model is a manually authored example. Its source links need a separate sibling checkout; the reader and test suite run without it. Dependency installation happens in `viewer/` using `bun install --frozen-lockfile`. The plugin skill depends on that installation, so distribute the complete repository.

### Viewer conversation

The [progressive principle](MANIFESTO.md#progressive) governs embedded chat. The independent Chat pane connects to local coding agents; unmodeled projects can start from a question.

Chat explains the project and refines its shared Lexicon model. Project source code is outside its editing scope. Begin from a human question, with an optional small overview. Continue from the current model's shape; do not introduce full regeneration, personal models, or a separate modeling-decision log.

Keep conversations at project level. Capture the selected concept or relationship and its code links as visible context attachments when sending a message. Navigation should preserve the discussion. Explicit edit requests apply directly with validation and undo; exploratory questions prompt discussion before any change. Team agreement uses the existing Git review workflow.

Lexicon owns its conversations and reuses authenticated coding runtimes on the local machine. Codex uses app-server, Grok uses ACP, and Claude uses its streaming CLI. Use Codex for live end-to-end testing. `viewer/server/chat/` owns provider adapters, conversation persistence, and model edits; `viewer/shared/chat.ts` defines the client contract.

Agents inspect source with read-only tools and return incremental model patches. The server validates patches and new code links, checks that the model still matches the turn's starting snapshot, and saves only the resolved artifact root's `lexicon/model.xml`. Undo restores exact file contents and refuses to overwrite external changes. Keep source roots and artifact roots explicit for linked worktrees. Browser and protocol tests use isolated registries and a deterministic CLI fixture; live runtime tests need a separate temporary project.
