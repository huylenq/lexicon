# Subcommand: validate

The unified "is my cold layer right?" subcommand. Two-pass detection over a project's `lexicon/`:

- **Structural pass** — does the file shape match the current schema? Detects schema-version drift, removed keys, type mismatches. The fix is **mechanical** (apply the migration delta chain from `${CLAUDE_SKILL_DIR}/migrations/`) and gets a yes/no apply offer.
- **Semantic pass** — do the cold-layer claims still hold in current code? Detects stale glossary, dead invariants, undeclared contexts, hygiene rot. The fix is **interpretive** — never auto-applied; the report goes back to the user as a triage list, often becoming input to `crystallize`.

This subcommand replaces the previous `lex-audit` and `lex-migrate` pair. The merge resolves the handoff dance where audit would flag schema-shape violations and tell the user to go run migrate.

## When to run this

Run when:

- The user explicitly asks: *"audit lexicon"*, *"sanity-check the docs"*, *"is the cold layer still accurate?"*, *"check for drift"*, *"validate"*, *"migrate lexicon"*, *"upgrade lexicon"*, *"upgrade to v1.0"*.
- The user describes a schema-shape gap: *"lexicon is still on YAML"*, *"system.xml uses old camelCase fields"*, *"we don't have structural refs yet"*.
- A natural cadence: quarterly, after a large merge, before a planning session, before a release.
- `ground` or `bootstrap` detects schema-version drift and the user agrees to address it.
- Suspicion is high that drift has accumulated — long stretches without crystallizations, a `system.xml` that hasn't changed in many merges despite obvious code evolution.

Don't run when:

- None of `lexicon/system.md`, `lexicon/system.yaml`, or `lexicon/system.xml` exists — that's `bootstrap` territory.
- The project hasn't done substantive work since the last validate (check the report timestamps). Running back-to-back rarely produces new signal.
- The user is mid-task and just wants to ground for it — that's `ground`, much lighter weight.

If unsure whether to run a full validate or a targeted check, ask: *"Full validate, or just check [schema / glossary / invariants / hygiene]?"* Targeted checks are valid — see "Targeted mode" near the end.

## Pre-flight

1. Confirm `lexicon/` exists. If it doesn't, defer to `bootstrap`.
2. If `lexicon/system.md` exists (markdown-era v0.x), the structural pass will need to convert it through every delta to reach the latest. Surface to the user before doing anything destructive: *"This project is on the markdown lexicon (v0.x). Validate will convert it to v1.0 XML in four steps (v0.x → v0.1 → v0.2 → v0.3 → v1.0). Recommend a `git commit` first. Proceed?"*
3. If `lexicon/system.yaml` exists (pre-v1.0 YAML era), the structural pass will run the v0.3-to-v1.0 delta (plus any earlier deltas needed to reach v0.3 first). Recommend a `git commit` first.
4. If multiple of `lexicon/system.md`, `lexicon/system.yaml`, `lexicon/system.xml` coexist, stop and surface — the user picks canonical.
5. If a recent `lexicon/validate.md` exists, read its tail — knowing what was flagged last time and what the user's response was changes how to weight similar flags this time.

## Detect the current schema version

Walk `lexicon/` and determine:

1. **`lexicon/system.xml` exists** — read its `schema=` attribute on the root element. That value (`"1.0"`) is the project's current version for structural-pass purposes. If older XML files coexist or the attribute is missing, treat as pre-v1.0.
2. **`lexicon/system.yaml` exists, `lexicon/system.xml` does not** — read its `schemaVersion:` field. That value (`"0.1"`, `"0.2"`, `"0.3"`) is the project's current version.
3. **`lexicon/system.md` exists, neither YAML nor XML does** — project is on the pre-YAML markdown era. Treat as `v0.x markdown`.
4. **Multiple coexist** — inconsistent state. Stopped at pre-flight; user picks canonical.
5. **None exists** — defer to `bootstrap`.

A project may have **mixed schemaVersion** across YAML files (e.g. `system.yaml: "0.2"` but some `contexts/*.yaml: "0.1"`). The pre-v1.0 loader accepted both, and the v0.1 → v0.2 delta is additive, so this is fine in practice. Treat the project's current version as the **lowest schemaVersion** among its files for chain-computation purposes — that way the chain runs the v0.1 → v0.2 delta if any file is still on v0.1, and the delta's apply phases skip files that are already conformant.

## Compute the structural chain

The chain is the ordered list of delta files whose source matches the current version and whose target is closer to the latest.

The supported deltas, in order:

- **`migrations/v0.x-to-v0.1.md`** — pre-YAML markdown lexicon (`system.md`, `views/*.md`, `decisions/*.md`) → v0.1 YAML.
- **`migrations/v0.1-to-v0.2.md`** — v0.1 YAML → v0.2 structural conformance (overlays, narrative, `[[fqid]]` interlinks).
- **`migrations/v0.2-to-v0.3.md`** — v0.2 → v0.3 DDD-faithful shape (removed `decision` kind, typed `sharedKernels`, `term.category`, `seam.kind`, `aggregate`, `module`, `subdomain`, `rationale` fields).
- **`migrations/v0.3-to-v1.0.md`** — v0.3 YAML → v1.0 XML representation flip (element names as ontology types; uniform `<ref to="fqid"/>` everywhere; canonical serialization).

Chain examples:

- Current = `v0.x markdown`, latest = v1.0 → chain is `[v0.x-to-v0.1, v0.1-to-v0.2, v0.2-to-v0.3, v0.3-to-v1.0]`.
- Current = v0.1, latest = v1.0 → chain is `[v0.1-to-v0.2, v0.2-to-v0.3, v0.3-to-v1.0]`.
- Current = v0.2, latest = v1.0 → chain is `[v0.2-to-v0.3, v0.3-to-v1.0]`.
- Current = v0.3, latest = v1.0 → chain is `[v0.3-to-v1.0]`.
- Current = v1.0 (latest) → chain is `[]`. Skip directly to the semantic pass; structural section of the report reads "Up to date — no structural changes needed."

Show the user the chain you computed before applying anything:

> Current: v0.3 → v1.0 (latest). Structural pass will apply: `migrations/v0.3-to-v1.0.md`.
> Will also run the semantic pass after.

For multi-step structural chains, the user sees the full sequence and can agree once for the whole chain (typical) or step through with a yes per delta. Default to per-chain agreement unless the user signals otherwise.

## Phase A — Structural pass

For each delta in the chain, in order:

1. **Read the delta file end to end.** Each one names its own phases. Don't improvise; the delta is the source of truth for what to do at this step.
2. **Run its pre-flight checks.** Each delta names a few of its own. Always recommend a `git commit` first, regardless of delta.
3. **Run the delta's detection phase.** Produce a findings document — the delta names the shape. Surface to the user without editing yet. Let the user choose all / partial / none.
4. **Run the delta's apply phases** in the order the delta lists. Respect the user's per-finding or per-scope greenlight. For phases that draft new prose (today: the `narrative` field added by `v0.1-to-v0.2`), follow the **one-scope-at-a-time** cadence: when a delta flags more than three scopes that want prose drafting, propose **one at a time**. Show the draft, take the user's tweaks, apply, move to the next.
5. **Run the delta's validate phase.** Re-parse every touched file, check structural invariants, surface failures. Don't auto-revert.
6. **Append to `lexicon/validate.md`'s structural section.** Each delta names its report-section template.

This pass is **forward-only**. No down-migration; downgrade is git revert.

### Drafting prose deliberately

Migration steps that draft new prose need authoring discipline — agents drift toward glossary-style summarization unless calibrated. **Verbs are load-bearing**:

**Bad** (a glossary in prose form):

> Auth owns user identity. The auth service, session store, token rotation, password hashing, MFA, OAuth callbacks. The User aggregate's lifecycle is owned here.

**Good** (a lifecycle, with verbs doing the work):

> A session *is* a signed token, not a row. Authentication exchanges credentials for one; once issued, rotation is the system's only stateful concern — everything downstream verifies signatures, never queries. The token's claims encode role, tenant, and expiry, which makes an authorization decision a pure function of token + requested resource, no round-trip to a permissions table.

Same atoms, different organizing principle. The verbs (*is*, *exchanges*, *verifies*, *encodes*) and the opinions (claims-as-source-of-truth; pure-function authorization) are doing the work. If a draft reads like the first version, push back and rewrite — that's a glossary, not a narrative.

## Phase B — Semantic pass

The semantic pass is the **backward-flow inversion** of the six structural checks (`${CLAUDE_SKILL_DIR}/reference/checks.md`). Where `crystallize` asks "did the diff introduce something that conflicts with the cold layer?", semantic-validate walks each existing claim and asks "does this still hold in current code?".

Phases 1–4 below are the inversion of checks 1–4. Phases 5–6 are validate-specific procedure (hygiene, distillation) with no forward-flow analogue.

### Phase B0 — Deterministic model-health pass (run this first)

Before grepping anything by hand, run the standalone model-health validator and let its deterministic output stand in for the heuristic anchor work:

```
bun ${CLAUDE_SKILL_DIR}/validators/anchor-health.ts <projectRoot>
```

It is **standalone** — tree-sitter only, no running viewer server, no LSP. It loads the cold layer, resolves every `<code-anchor symbol=>` against the code, and prints a `## Model health` block with three sub-sections (`### Anchor resolution` — healthy / drifted / dangling, `### Boundary contradictions`, `### Dead weight`) plus its own `### Items deliberately not flagged`. LSP-dependent checks (call-flow `calls`-edge contradictions) self-announce as "not checked (no LSP)" rather than implying coverage; only the structure tier (`extends` / `implements` / `uses`) is checked here. For LSP-confirmed call-flow coverage the user runs the viewer's Model Health view — don't claim it from this script.

Use its result to **short-circuit the heuristic anchor work** in the phases below. Where the deterministic pass already resolved an anchored symbol, don't re-grep for it in Phase B1: a symbol the script reports `healthy` is present, `dangling` is the silent-rot case made loud, `drifted` is a moved symbol or stale line cache. The prose-grep fallback in Phase B1 is for terms with *no* anchor, where there's nothing deterministic to resolve.

This pass is **advisory** — it never mutates the cold layer or code, and always exits 0. Its findings are triage, not fixes: a dangling anchor goes to the user as a flag, and the correction (re-point the anchor, rename the atom, or drop it) routes through `crystallize`, never through `validate`. Capture the script's `## Model health` block verbatim — it becomes a top-level section of the report (see Phase C); it already carries its own "deliberately not flagged" list for the deterministic findings.

### Phase B1 — Glossary validation (inverts check 1 + check 2)

For each term in `system.xml`'s glossary AND each `lexicon/contexts/*.xml` and `lexicon/surfaces/*.xml`:

- **For anchored terms, trust Phase B0.** A term whose `<symbols>` the deterministic pass already resolved doesn't need a hand grep — its anchor status (healthy / drifted / dangling) is the answer. Grep only the terms with no anchor.
- **Literal grep first** (unanchored terms only). Search the codebase for the term as identifier (class, type, function, constant) and as string literal.
- **If literal grep finds nothing**, don't immediately flag. Try variants: plural, related forms (`Worker` → `WorkerPool`, `enqueueWorker`), kebab/snake/camel transformations. The concept may still be present under a slightly different surface.
- **Classify each entry**:
  - *Healthy*: term has clear, consistent presence in code matching the definition.
  - *Drifted name*: concept is present but under a different identifier — flag for "rename in glossary or rename in code?".
  - *Dead*: no trace in code, no obvious related form. Flag for removal candidate.
  - *Definition mismatch* (**high priority**): term is present but used in code in a way that contradicts the glossary definition — this is the silent-renaming bug surfacing late.

Don't auto-delete entries. The classification is the artifact; the human decides via a follow-up `crystallize`.

For surfaces with regions, validate each region's `implementation:`:

- *Component*-tagged: the import path resolves to a real file. If renamed/moved → *drifted name*; if deleted → *dead region*.
- *Inline*-tagged: the file exists and the cited line range still contains a meaningful block matching the region's described role. Common drift modes: (a) the inline block was extracted into its own component (the tag should now be *Component*) — flag for tag update, not deletion; (b) the inline block was deleted or refactored away → *dead region*; (c) the line range shifted ±20 lines but the block is still recognizable → *stale line citation* (low priority, easy fix).
- *Surface mismatch*: a region listed under one surface that's actually used in two — flag as misnamed or as a candidate for promotion.

### Phase B2 — UL ownership validation

The ownership rule says every term has *exactly one* owning location — a single context file *or* a shared kernel on `system.xml`. When this drifts, the same term gets defined twice and the definitions slowly diverge.

For each term:

- Build a map: term slug → list of files where it's defined.
- **Defined in exactly one location**: healthy.
- **Defined in >1 location**: ownership-rule violation. Flag with all locations and the definitions side-by-side. Recommend a single owning location.
- **Referenced as a `disambiguatesFrom:` target but not defined anywhere**: dangling reference. Flag.

This is a high-value, mechanical check.

### Phase B3 — Invariant validation (inverts check 3)

For each invariant in `system.xml` and each `lexicon/contexts/*.xml`:

- Re-read the relevant code (use the invariant's `constrainsCode:` anchors if present; otherwise infer scope from wording or ask the user).
- Honestly ask: **would this invariant still hold if I read the current code with fresh eyes?**
- Classify:
  - *Holds*: invariant is honored everywhere it should be.
  - *Violated*: code clearly violates it — distinguish two sub-cases:
    - **(a) Invariant is genuinely stale** — constraint was lifted intentionally but the doc wasn't updated. Recommend removing or rewriting.
    - **(b) Code regression** — invariant should still hold but a recent change broke it. Recommend fixing the code, not the doc.
    - You usually can't tell (a) vs (b) confidently. Surface both possibilities; let the user pick.
  - *Refined needed*: invariant is mostly true but has gained nuance (exceptions, conditions). Recommend rephrasing.
  - *Untestable*: invariant is so abstract that you can't validate it from code alone. Note this; suggest making it more concrete or moving to `validationMode: principle`.

This is the highest-stakes semantic phase. Be conservative — flag with evidence, don't assert.

For accessibility invariants in a `surfaces/*.xml`, prefer running existing tooling (ESLint `jsx-a11y`, `axe-core`, Storybook a11y addon, Playwright a11y) over re-deriving by hand. Tooling output folds into this phase as evidence.

### Phase B4 — Bounded context validation (inverts check 4)

Compare the bounded contexts named in `system.xml`'s `contexts:` index against the actual module/folder structure and import graph:

- **Contexts with no clear code mapping**: flag as either renamed or dissolved.
- **Code modules that don't fit any named context**: flag as candidate new contexts. A new top-level package or service with multiple files and a clean import boundary often means a context emerged.
- **Boundaries that have become leaky**: if a `boundaryRule` says contexts A and B don't share state and you find new shared imports between them, flag the leak. Could be an architecture regression or an outdated rule.
- **Seams in `kind: unknown`**: these load with a warning by design — the user is supposed to classify each seam, and any still-`unknown` after migration is triage.

Use the project's import-tracing tooling where available. Where not available, use `rg` for cross-module imports and approximate.

### Phase B5 — Hygiene sweep

Mechanical, no judgment required:

- **Crystallization cadence**: read `lexicon/.last-crystallized`. If missing, or older than ~60 days while `git log --since=<marker>` shows substantive recent commits, that's a strong signal `crystallize` is being skipped and the cold layer is drifting.
- **Stale validate reports**: a previous `lexicon/validate.md` older than ~90 days with un-addressed findings (no corresponding cold-layer edits afterward).
- **Anchor coverage**: count cold-layer entries missing their anchoring fields. These don't crash the loader, but they mean the cold layer has drifted toward "glossary" and away from "verifiable spec".
  - Terms without `<symbols>` whose `<definition>` mentions a file, class, function, or `code-style identifier`. Report `<count>` and list the first 10 fqids.
  - Invariants without `<constrains-code>` or without `mode=` attribute. Report `<count>` and list the first 10. An invariant with `mode="principle"` and no `<constrains-code>` is fine; an invariant with `mode="code"` and no anchors is a hole.
  - Atoms with rationale-shaped slots empty: seams with `kind=` set but no `<rationale>`, aggregates with no `<rationale>`, invariants with `mode="principle"` and no `<rationale>`. Rationale-emptiness isn't a parse error — it's a thinking-debt indicator.
  - Terms with `category="concept"` (or absent) that have `<symbols>` pointing at a real code identifier — strong signal the term is actually an entity / value / service / event and should be re-categorized.
- **Stripped elements on system.xml**: parse `lexicon/system.xml` and check the top-level element set against the v1.0 canonical children of `<system>`: `<name>`, `<purpose>`, `<narrative>`, `<body>`, `<contexts>`, `<shared-kernel>` (repeated), `<overlay>` (repeated), `<deliberate-omission>` (repeated). Anything else is invisible to the loader and should be migrated or removed.
- **Stripped elements on contexts/*.xml**: check each context file's top-level child set against the v1.0 canonical children of `<bounded-context>`: `<name>`, `<purpose>`, `<narrative>`, `<code-modules>`, `<body>`, and the atom elements `<term>`, `<invariant>`, `<seam>`, `<boundary-rule>`, `<aggregate>`, `<module>` (each repeated). A stray `<modules>` wrapper element is a pre-v1.0 remnant — atoms sit as direct siblings in v1.0, no list wrapper.
- **Stripped attributes**: scan for unknown attributes on each element kind against the XSD's allowed attribute set (`${CLAUDE_SKILL_DIR}/reference/schema.xsd`). Unknown attributes are silently dropped by the loader; surface them.
- **Orphaned `decisions/` directory**: v0.3 has no `decisions/` slot. If `lexicon/decisions/` still exists, flag for cleanup — the migration was supposed to archive its contents under `_pre-migrate-archive/`.

### Phase B6 — Distillation completion check

Sanity check: how many `<!-- TODO -->` XML comments or empty placeholder prose elements remain across `system.xml` and `lexicon/contexts/*.xml`?

- **0–2 remaining (across all cold-layer files)**: healthy, post-adoption distillation happened.
- **3–10 remaining**: surface; some sections are still placeholder content. Each one weakens the rest of the workflow.
- **>10 remaining**: very likely the post-bootstrap distillation session was skipped. Surface as a high-priority recommendation: *"before validate's other findings are useful, resume the distillation (re-run `bootstrap` with 'continue distillation')."*

## Phase C — Write the validate report

Write `lexicon/validate.md` (overwriting any previous one — old reports archive via git history). Structure:

```markdown
# Validate report
Run on: <iso timestamp>
Scope: <full | targeted: structural-only | semantic-only | glossary | invariants | hygiene | …>
Detected schema version: <vX (or "v0.x markdown" or "mixed: vX in system.{yaml,xml}, vY in some context files")>
Structural chain applied: <list of deltas, or "none — already at latest">
Time since last validate: <N days, or "first validate">

## Summary
<2-3 sentences. Health-grade impression and the highest-priority structural/semantic flags.>

## Structural pass

### What changed
- <delta>: <one-line summary; files touched, key fixups>
- ...

### Structural-pass detection findings (if any apply was deferred)
- <delta>: <user accepted partial / declined; remaining findings>

### Validate phase
- <files re-parsed>: <pass | failed: <reason>>

(If the chain was empty: "Already at v1.0 — no structural changes needed.")

## Semantic pass

### Glossary findings
- *Healthy*: <count> entries (across system.xml and all contexts/surfaces)
- *Drifted name*: <Term> (defined in <file>) — appears in code as <other identifier>; rename glossary or code?
- *Dead*: <Term> (defined in <file>) — no code presence found, even in related forms; remove from glossary?
- *Definition mismatch* (high priority): <Term> (defined in <file>) — glossary says X, code uses as Y
- ...

### UL ownership findings
- *Single-owner terms*: <count> healthy
- *Multi-owner violations* (high priority): <Term> defined in <file-A> AND <file-B>; <one-line on whether definitions differ>; recommend owner: <file>
- *Dangling references*: <Term> referenced from <file>'s `disambiguatesFrom` but not defined anywhere
- ...

### Invariant findings
- *Holds*: <count> invariants validated
- *Possibly violated*: <Invariant text>
  - Evidence: <file:line or summary>
  - Could be: (a) invariant is stale, recommend removing/rewriting, OR (b) code regression, recommend fixing code at <location>
- *Refined needed*: <Invariant> — gained an exception in <module>; rephrase to acknowledge it?
- *Untestable*: <Invariant> — can't validate from code alone; concretize or move to `validationMode: principle`?
- ...

### Bounded context findings
- Contexts in system.xml with no clear code mapping: <list>
- Code modules not fitting any named context (candidate new contexts): <list>
- Boundaries showing leakage: <pair> — new shared imports at <files>
- Seams still at `kind: unknown`: <count, list of fqids>
- ...

### Hygiene
- Last crystallization: <iso timestamp from .last-crystallized, or "never"> — <"healthy cadence" | "crystallize appears underused; git shows N commits since the marker">
- Anchor coverage: <terms missing symbols: N>, <invariants missing constrainsCode: N>, <atoms with empty rationale: N>
- Schema-stripped top-level keys: <list with files, or "none">
- Orphaned `decisions/` directory: <yes/no>

### Distillation status
- TODO markers in cold-layer files: <count>
- <"distillation appears complete" | "many TODO markers remain — distillation likely skipped, run `bootstrap` with 'continue distillation' first">

## Model health

<Paste the `## Model health` block from `validators/anchor-health.ts` verbatim — its `### Anchor resolution`, `### Boundary contradictions`, `### Dead weight`, and `### Items deliberately not flagged` sub-sections. This is the deterministic, tree-sitter-only result; don't paraphrase or re-derive it by hand.>

## Recommended actions, prioritized
1. <Highest-impact item, with concrete next step (often: run `crystallize` to absorb the semantic findings, or rerun the structural pass after a manual fix)>
2. <Next>
3. ...

## Items deliberately not flagged
<Things considered and dismissed. Keeps the report honest about its triage instead of dumping everything ambiguous.>
```

Keep it scannable. The user should be able to read this in under 10 minutes and walk away with a punch list. If the report is longer than ~150 lines, you've over-reported — re-triage and demote the lowest-priority items into "deliberately not flagged".

## Phase D — Tell the user

Brief summary in chat:

> Validate complete. Wrote report at `lexicon/validate.md`. <Structural: applied <chain>, M files touched | Structural: up to date>. Semantic: <one-line health summary>; <highest-priority flag>. <Optional: "Recommend running `crystallize` to absorb the semantic findings." | "Nothing high-priority — mostly hygiene." | "Distillation never completed; recommend resuming `bootstrap` first.">

Don't dump the full report into chat. The file is the artifact; chat is the pointer. Resist walking through every flag in conversation — that defeats the triage-list shape.

## Targeted mode

A full validate (structural + semantic) is the default. The user can ask for narrower runs:

- *"just check the schema version"* / *"just migrate"* → structural pass only.
- *"audit only"* / *"semantic check only"* → semantic pass only.
- *"audit just the glossary"* / *"check hygiene only"* → run only the named semantic phases.

When targeted:

- Skip the unrequested phases entirely (don't even mention them in the report).
- Note `Scope:` in the report header so future validate runs know what was covered.
- It's fine for a targeted validate to find nothing — write the (short) report anyway. Negative results are valuable evidence that the next full validate can lean on.

## After validate

`validate`'s structural pass applies changes mechanically (with the user's yes). Its semantic pass produces a *triage list* — never auto-applied. The user reviews and either:

- Accepts a semantic finding → runs `crystallize` to absorb it (validate findings are valid input to crystallize alongside the git diff).
- Rejects a finding as noise → if the rejection pattern recurs across validate runs, that's a `/lexicon:meta-evolve` candidate: amend the responsible reference (probably `checks.md`) or subcommand body.
- Defers a finding → leaves the report in place; the next validate will see it as "previous unaddressed".

The validate report stays at `lexicon/validate.md` until the next run overwrites it (git history preserves prior runs). If the user wants to archive a triaged report, move it to `lexicon/audits/validate-<iso>.md`.

## Adding a new migration delta

When the cold-layer schema bumps (v1.0 → v1.1, …), add a new file `${CLAUDE_SKILL_DIR}/migrations/v<old>-to-v<new>.md` following the structure of the existing deltas:

- A short prose preamble (what the version bump captures, why the delta exists).
- A **pre-flight checks** section for delta-specific guards.
- A **detection phase** that produces a findings document.
- One or more **apply phases**, each scoped to a specific kind of change.
- A **validate phase** with concrete checks.
- A **report-section template** for `lexicon/validate.md`'s structural section.

Then update the "supported deltas" list in this subcommand body to point at the new delta. No other changes to the orchestrating logic.

Schema and structural changes that don't ship a delta won't be reachable via `validate` — projects on the old version stay there. **Every schema bump ships a delta.** See the project's root `CLAUDE.md` for the full versioning convention.

## What this subcommand is NOT

- **Not a fixer of semantic content.** The semantic pass surfaces evidence; humans decide and `crystallize` applies.
- **Not a substitute for `crystallize`.** Crystallize is forward-flow (absorb new truth); validate's semantic pass is backward-flow (expire stale truth). They cover different gaps.
- **Not a per-session ritual.** Running this every session is wasted tokens. Quarterly, on-demand, or after structural drift is detected by another subcommand is the right cadence.
- **Not a replacement for post-adoption distillation.** If TODO markers dominate the cold-layer files, validate's other findings are noise — the distillation session has to happen first.
- **Not bidirectional.** Forward-only across all structural deltas.
- **Not a redesign.** Each delta preserves existing content as faithfully as possible. If the source was wrong, it stays wrong — the user fixes it later via `crystallize` or by accepting a semantic finding. The only exception is prose drafted by a delta (today: `narrative`), which is genuinely new and ships only with the user's per-draft yes.

## On honesty about findings

The temptation is to make the validate report look thorough by flagging everything ambiguous. Resist. **A short report with three real flags is more useful than a long report with thirty borderline ones.** The user has a finite review budget; consume it with high-confidence findings, not exhaustive ones.

When unsure whether something is a real flag, default to listing it under "Items deliberately not flagged" with a one-line note. That section is itself a useful artifact — it shows what was considered and dismissed, which builds the user's intuition over time.

The single most important thing this subcommand produces is **calibration of attention**. Anyone can grep-and-flag. The value is choosing the three to five things that actually matter for this validate cycle, and naming them clearly enough that the user can act.
