# Structural checks

Three subcommands run these checks at different scopes and in different directions:

- **`retro`** runs them **forward** against one session's diff: *did this session introduce anything that conflicts with the cold layer?* Flags land inline in the retro file.
- **`crystallize`** runs them **forward** against the cumulative diff since the last crystallization: *did the accumulated work shift the model?* Filter for terms that stuck across sessions, invariants that genuinely changed, boundaries that genuinely redrew.
- **`conform`** runs them **backward** against existing cold-layer claims: *for each entry / invariant / boundary, does it still hold in current code?* Plus hygiene + distillation-completion phases (semantic-pass-only).

Definitions live here so they stay in sync across all three uses.

## The six checks

1. **Vocabulary** — Was a noun or verb used (in code: class / type / function / key parameter names; in conversation: terms used repeatedly) that isn't in the cold layer's glossary?
2. **Vocabulary consistency** — Was a glossary term used in a way that doesn't match its definition? **High priority** — this is the silent-renaming bug.
3. **Invariants** — Did the work violate, refine, or contradict any invariant? Re-read each invariant and ask: would it still hold given the current code?
4. **Boundaries** — Did the work cross a boundary in the bounded-contexts model? (New import edge, new call site, new shared state across a previously clean boundary.)
5. **Decisions** — Were any non-obvious choices made — picking approach A over B for reasons future-readers wouldn't recover from the code alone? These warrant a `rationale:` field on the affected atom (the invariant the decision justifies, the seam whose kind it explains, the aggregate whose boundary it draws). v0.3 deliberately has no ADR slot; the argument lives next to the thing it argues for.
6. **Declared scope match** — Did the actual work stay within the scope the agent grounded on? When it drifted, the *reason* often reveals a model gap.

## Context-file scoping

Each check is scoped: first against the context file(s) covering the relevant bounded context, then against `system.yaml` for cross-cutting concerns. Flags on context-owned content target the context file; flags on cross-cutting concerns target `system.yaml`. Name the target file(s) explicitly when proposing edits.

## Design-system signals

When the project has a UI surface (one or more `lexicon/surfaces/<slug>.yaml` files exist), the same six checks pick up design-system drift naturally — design vocabulary is ubiquitous language for the UI, no separate machinery needed.

- **Vocabulary** — new component file, new token entry in the theme/config, new layout primitive, new interaction pattern, **a new named region inside a surface (extracted *or* inline)**. An inline region introduced without a name in the cold layer is just as much vocabulary drift as an unnamed extracted component — the conversational referent exists either way.
- **Vocabulary consistency** — hex / px / rem literal outside the token file; raw `<button>` where `<Button>` exists; component imported from a path that bypasses the design-system root; **the same region called by two different names across files**.
- **Invariants** — accessibility contracts (visible focus, color contrast, keyboard navigation, label-input pairing). Most are validatable via linters or axe-core; surface the violation when tooling flags it.
- **Boundaries** — design-system seam: interactive primitives only via wrapper components; styling only via tokens, not inline values; **named regions stay scoped to their owning surface (a region referenced from a second surface is either misnamed or being promoted to a primitive — both worth flagging)**.
- **Decisions** — "drawer over modal because…" — same shape as code decisions.
- **Scope match** — grounding said "small UI tweak" but the diff added a new token or component — scope drift.

If no `surfaces/` files exist and no design tokens/components appear in code, these signals are no-ops — backend-only projects skip naturally.

## Calibration

The agent's sense of "what's worth flagging" is fallible. Two failure modes:

- **Over-flagging.** Every retro becomes a wall of borderline drift candidates. The user starts ignoring retros wholesale. Counter-tune: borderline cases get a brief note under the retro's `## Notes for future sweeps` rather than a full drift flag; across multiple sessions, patterns will emerge that `crystallize` can act on.
- **Under-flagging.** Real drift slides past. The cold layer goes stale by inattention.

When you're unsure whether something is a real flag, default to listing it under "deliberately not flagged" with a one-line note. That section is itself a useful artifact — it shows what was considered and dismissed.

Systematic miscalibration — the same kind of flag being wrong repeatedly — is the cue for `/lexicon:evolve` to amend `subcommands/retro.md`, `subcommands/crystallize.md`, or this file.
