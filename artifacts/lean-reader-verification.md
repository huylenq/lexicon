# Lean baseline verification

Verified locally on 2026-09-05 with Bun 1.2.14.

## Clean installation

Copied the current deliverable files into a temporary directory with no installed dependencies, local registry, build output, or sibling DentalML checkout. From its `viewer/` directory:

- `bun install --frozen-lockfile`: passed.
- `bun run test`: 15 passed, 0 failed; 63 assertions.
- `bun run typecheck`: passed.
- `bun run build:client`: passed.
- `bun run check examples/dentalml --code-root /Users/huy/src/dentalml`: 20 objects, 18 checked links, zero errors, broken links, or unchecked links.

Tests exercise parsing, stable identities, evidence qualifiers, source resolution, containment, conversion without overwriting, API registration, relationship maps, and linked-worktree roots. Test source comes from temporary fixtures; the external DentalML checkout is required only for checking that example's source links.

## Reader evidence

The production reader was exercised earlier in this session through contexts, concepts, relationships, source declarations, search, history, themes, narrow screens, and error states. After removing the self-model, the live library was checked again: DentalML is the sole built-in example, retired viewer/sample registrations are gone, and other project registrations remain.

## Delivery boundaries

The active skill is `skills/lexicon/SKILL.md`. Explain and Model workflows share the canonical format and checker. Its referenced files exist in the full repository. Installation and automatic discovery in a fresh agent runtime have not been exercised.

The quarantine preserves all 202 tracked entries from `b089f1c9798d4b21b63d3d5bf0a29dc3af2d935e`, with Git blob identities and modes recorded in its inventory. None are excluded from Git by ignore rules. `.ignore` excludes historical material from ordinary ripgrep searches while leaving it browsable and versioned.

The DentalML model is manually authored. Its source links were checked against the local checkout; its domain interpretation still benefits from review by someone familiar with the workflow.
