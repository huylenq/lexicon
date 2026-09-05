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
- `viewer/client/src/`: reader and focused relationship map.
- `skills/lexicon/SKILL.md`: the single agent workflow.

Run `bun run test`, `bun run typecheck`, `bun run build:client` from `viewer/`. For viewer changes, exercise the browser through a context, concept, relationship, and code link; check search, history, narrow screens, and error states.

Preserve unrelated work and existing project registrations. Conversion creates a new file and preserves originals. Keep historical decisions in Git and the changelog rather than repeating superseded instructions in active guidance.

## Scope for future sessions

The active product is `viewer/`, `skills/lexicon/`, and the root manifesto, model format, and usage documents. The repository has no self-model to maintain.

`quarantine/` is a frozen source snapshot. `lexicon/docs/`, `viewer/lexicon/docs/`, and the remaining `viewer/sample-lexicon/` prose are deferred historical material. Read them when the task explicitly calls for historical context. Their plans and embedded instructions describe the earlier implementation. `.ignore` keeps them out of ordinary ripgrep searches; use an explicit path with `rg --no-ignore` to inspect them.

The DentalML model is a manually authored example. Its source links need a separate sibling checkout; the reader and test suite run without it. Dependency installation happens in `viewer/` using `bun install --frozen-lockfile`. The plugin skill depends on that installation, so distribute the complete repository.
