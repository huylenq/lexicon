---
name: lex-audit
description: "Run on demand to sanity-check a lexicon-using project — re-validate that lexicon/system.md still matches reality. Trigger on 'audit lexicon', 'sanity-check the docs', 'is system.md still accurate?', 'check for drift', before a planning session or major release, or quarterly. Catches backward-flow drift (stale glossary, dead invariants, undeclared contexts, hygiene rot) that lex-retro and lex-crystallize cannot. Read-mostly: produces a triage report, never edits system.md or deletes plan files. Read lex-overview first."
---

# Lexicon: audit

`lex-bootstrap` runs once at adoption. **`lex-audit` runs periodically** to catch what continuous use can't: drift between `system.md` and reality that accumulated silently in the *backward* direction.

If you haven't loaded `lex-overview` yet this session, read it first.

## What this skill exists for

`lex-retro` and `lex-crystallize` handle **forward-flow drift** — new work introducing inconsistency, caught at the cheapest moment. They are blind to:

- **Stale glossary entries.** A term in `system.md` was renamed in code six sessions ago. The renaming session retro'd correctly and the glossary updated for the *new* term, but the old entry never got removed.
- **Dead invariants.** Code silently violated one. No retro caught it because the violating session was small / split across sessions / didn't read that invariant carefully.
- **Undeclared bounded contexts.** A new module appeared in its own clean seam, but `system.md`'s context list never grew. Each individual import looked local; cumulatively a new context emerged.
- **Stale "why" notes.** The reasoning was true in 2024; the constraint was lifted in 2025; the note still reads as authoritative.
- **Hygiene rot.** Crashed sessions left orphaned `_active/<id>.md` files. `_retros/` has 800 entries no one will read again. `_proposals/` has stuff from three months ago that was never triaged.

The architecture is eventually consistent in one direction only — it incorporates new truth, but doesn't expire old truth. That's this skill's job.

## When to run this

Run when:

- The user asks: "audit lexicon", "sanity-check the docs", "is `system.md` still accurate?", "check for drift".
- A natural cadence: quarterly, after a large merge, before a planning session, before a release.
- Suspicion is high that drift has accumulated — long stretches without crystallizations, retros that flagged the same thing repeatedly without action, or a `system.md` that hasn't changed in many merges despite obvious code evolution.

Don't run when:

- `lexicon/system.md` doesn't exist — that's `lex-bootstrap` territory.
- The project hasn't done substantive work since the last audit (check the audit report timestamps under `lexicon/plans/_archive/_audits/` if any). Audits cost tokens; running back-to-back rarely produces new signal.
- The user is mid-task and just wants to ground for it — that's `lex-ground`, much lighter weight.

If unsure whether to run a full audit or a targeted check, ask: "Full audit, or just check [glossary / invariants / hygiene]?" Targeted checks are valid — see the **Targeted-mode** section near the end.

## Pre-flight

1. Confirm `lexicon/system.md` exists and is non-trivial. If it's still mostly TODO markers, the right answer is "the post-bootstrap distillation session never happened" — surface that and don't proceed with audit checks (they'd produce noise).
2. Mint or read a session ID (same convention as the other skills). The audit run gets a session ID just like any other session, so its outputs land in the standard sharded locations.
3. If a recent audit report exists under `lexicon/plans/_archive/_audits/`, read its tail — knowing what was flagged last time and what the user's response was changes how to weight similar flags this time.

## How audit relates to the six structural checks

Phases 1–3 below are the **backward-flow inversion** of structural checks 1, 2, 3, and 4 from `lex-overview` § Structural checks. Where retro/crystallize ask "did the diff introduce something that conflicts with `system.md`?", audit walks each existing claim in `system.md` and asks "does this still hold in current code?". Phases 4–7 are audit-specific procedure (hygiene, calibration, distillation, proposal cross-checks) with no forward-flow analogue.

## Phase 1 — Glossary validation

For each entry in `system.md`'s glossary AND each entry in every `lexicon/views/*.md` Glossary:

- **Literal grep first.** Search the codebase for the term as identifier (class, type, function, constant) and as string literal.
- **If literal grep finds nothing**, don't immediately flag. Try variants: plural, related forms (e.g. `Worker` → `WorkerPool`, `enqueueWorker`), kebab/snake/camel transformations. The concept may still be present under a slightly different surface.
- **Classify each entry**:
  - *Healthy*: term has clear, consistent presence in code matching the glossary definition.
  - *Drifted name*: concept is present but under a different identifier — flag for "rename in glossary or rename in code?".
  - *Dead*: no trace in code, no obvious related form. Flag for removal candidate.
  - *Definition mismatch*: term is present but used in code in a way that contradicts the glossary definition — flag as **high priority**, this is the silent-renaming bug surfacing late.

Don't auto-delete entries. The classification is the artifact; the human decides.

## Phase 1b — UL ownership validation (only when views are in use)

Skip if `lexicon/views/` doesn't exist.

The ownership rule says every term has *exactly one* owning location. When views drift out of sync, the same term gets defined twice — once in each view that touches it — and the definitions slowly diverge. This phase mechanically detects that.

For each term defined in a view (search for `**<Term>**:` definition syntax in the Glossary section of each view) and in `system.md`:

- Build a map: term → list of files where it's defined (not just referenced).
- **Term defined in exactly one location**: healthy.
- **Term defined in >1 location**: ownership-rule violation. Flag with all locations and the definitions side-by-side. Recommend a single owning location (typically the view for the term's primary context, or `system.md`'s cross-cutting glossary if the term genuinely spans 3+ contexts).
- **Term referenced in a view's `## References` section but not defined anywhere**: dangling reference; the original owning location was deleted or renamed. Flag.

This is a high-value check for view-using projects. It's mechanical (no judgment about meaning), runs fast, and catches the single failure mode views are most prone to.

## Phase 2 — Invariant validation

For each invariant in `system.md`:

- Re-read the relevant code (use the invariant's wording to identify which modules/files are in scope; ask the user if it's unclear which code an invariant constrains).
- Honestly ask: **would this invariant still hold if I read the current code with fresh eyes?**
- Classify:
  - *Holds*: the invariant is honored everywhere it should be.
  - *Violated*: code clearly violates it — flag, but distinguish two sub-cases:
    - **(a) Invariant is genuinely stale** — the constraint was lifted intentionally but the doc wasn't updated. Recommend removing or rewriting.
    - **(b) Code regression** — the invariant should still hold but a recent change broke it. Recommend fixing the code, not the doc.
    - You usually can't tell (a) vs (b) confidently. Surface both possibilities; let the user pick.
  - *Refined needed*: the invariant is mostly true but has gained nuance (exceptions, conditions). Recommend rephrasing.
  - *Untestable*: the invariant is so abstract that you can't validate it from code alone. Note this; suggest the invariant either needs to be made more concrete or moved to a "principles" section that's not subject to code validation.

This is the highest-stakes phase. Be conservative — flag with evidence, don't assert.

## Phase 3 — Bounded context validation

Compare the bounded contexts named in `system.md` against the actual module/folder structure and import graph:

- **Contexts with no clear code mapping**: flag as either renamed or dissolved.
- **Code modules that don't fit any named context**: flag as candidate new contexts. A new top-level package or service with multiple files and a clean import boundary often means a context emerged.
- **Boundaries that have become leaky**: if `system.md` claims contexts A and B don't share state and you find new shared imports between them, flag the leak. Could be an architecture regression or could mean the boundary description is outdated.

Use the project's import-tracing tooling where available (language-specific). Where not available, use `rg` for cross-module imports and approximate.

## Phase 4 — Hygiene sweep of `lexicon/plans/`

Mechanical, no judgment required:

- **Orphaned `_active/<id>.md` files**: any `_active/` files where the corresponding `_retros/<id>.md` exists (session ended but lock wasn't removed) — recommend deleting the orphan.
- **Doubly-orphaned**: `_active/` files older than ~30 days with no matching retro (session crashed, never closed) — flag for the user, don't auto-delete (might be a long-running session).
- **Untriaged proposals**: anything in `_proposals/` older than ~30 days. List with file paths. Long-untriaged proposals usually mean either the user lost track or they were silently rejected — both worth a nudge.
- **Retro volume**: count `_retros/` entries. If it's > 500, surface that retro rotation policy hasn't been adopted and the cool tier is approaching unwieldy. Suggest archiving older retros into a dated subfolder (e.g. `_retros/2026-Q1/`).
- **Crystallization archive**: if `_archive/_crystallizations/` is empty but the project has clearly been doing feature work for months, that's a strong signal `lex-crystallize` is being skipped. Flag it.

## Phase 5 — Calibration coherence

If `lexicon/calibration.md` exists:

- Read each rule. For each, ask: did recent retros (last ~20) seem to honor this rule, or are they still flagging the things this rule says to ignore?
- If a rule appears to be ignored: either the rule is being missed (improve its wording), or `lex-retro`'s structural checks are catching them anyway (the rule is now redundant). Flag for review.
- If recent retros flag the same kind of noise repeatedly with no calibration entry covering it: recommend adding a calibration line.

If `calibration.md` doesn't exist but the project has > 30 retros, that itself is a flag — calibration is supposed to grow over time, and an empty calibration in a mature project usually means the user has been silently rejecting noise without writing it down.

## Phase 6 — Distillation completion check

Sanity check: how many `<!-- TODO -->` markers remain in `system.md` AND across `lexicon/views/*.md`?

- **0–2 remaining (across all cold-layer files)**: healthy, post-bootstrap distillation happened.
- **3–10 remaining**: surface; some sections are still placeholder content. Each one weakens the rest of the workflow.
- **>10 remaining**: very likely the post-bootstrap distillation session was skipped. Surface as a high-priority recommendation: "before audit's other findings are useful, run the distillation session."

## Phase 7 — Cross-check recent rejected proposals

Look in `_archive/` (or wherever rejected/landed proposals end up) for patterns:

- A type of proposal that gets rejected three or more times for similar reasons → that's a calibration entry waiting to be written.
- A proposal that was *accepted* but `system.md` doesn't show the change → either the diff wasn't applied or it was applied to the wrong section. Flag.

This phase is low-priority; skip if proposal volume is small.

## Phase 8 — Write the audit report

Write `lexicon/plans/_proposals/audit-<iso-date>.md`. Structure:

```markdown
# Audit report
Run on: <iso timestamp>
Session: <session-id>
Scope: <full | targeted: glossary/invariants/hygiene/...>
Time since last audit: <N days, or "first audit">

## Summary
<2-3 sentences. Health-grade impression: "system.md is in good shape; minor hygiene rot only" / "moderate drift in glossary; one likely-stale invariant; distillation never completed" / etc.>

## Glossary findings
- *Healthy*: <count> entries (across system.md and all views)
- *Drifted name*: <Term> (defined in <file>) — appears in code as <other identifier>; rename glossary or code?
- *Dead*: <Term> (defined in <file>) — no code presence found, even in related forms; remove from glossary?
- *Definition mismatch* (high priority): <Term> (defined in <file>) — glossary says X, code uses as Y
- ...

## UL ownership findings (only when views are in use)
- *Single-owner terms*: <count> healthy
- *Multi-owner violations* (high priority): <Term> defined in <file-A> AND <file-B>; <one-line on whether definitions differ>; recommend owner: <file>
- *Dangling references*: <Term> referenced in <view's References section> but not defined anywhere
- ...

## Invariant findings
- *Holds*: <count> invariants validated
- *Possibly violated*: <Invariant text>
  - Evidence: <file:line or summary>
  - Could be: (a) invariant is stale, recommend removing/rewriting, OR (b) code regression, recommend fixing code at <location>
- *Refined needed*: <Invariant> — gained an exception in <module>; rephrase to acknowledge it?
- *Untestable*: <Invariant> — can't validate from code alone; concretize or move to a "principles" section?
- ...

## Bounded context findings
- Contexts in system.md with no clear code mapping: <list>
- Code modules not fitting any named context (candidate new contexts): <list>
- Boundaries showing leakage: <pair> — new shared imports at <files>
- ...

## Hygiene
- Orphaned `_active/` (with matching retro): <list> — safe to delete
- Doubly-orphaned `_active/` (no retro, > 30 days): <list> — confirm before deleting
- Untriaged `_proposals/` (> 30 days old): <list>
- `_retros/` count: <N> — <"healthy" | "consider rotation">
- `_archive/_crystallizations/` count: <N> over <project age> — <"healthy cadence" | "lex-crystallize appears underused">

## Calibration coherence
- Rules: <count>
- Rules that look honored: <count>
- Rules that look ignored or redundant: <list with rationale>
- Repeated noise patterns lacking calibration: <list>

## Distillation status
- TODO markers in system.md: <count>
- <"distillation appears complete" | "many TODO markers remain — distillation likely skipped, run it before acting on the rest of this report">

## Recommended actions, prioritized
1. <Highest-impact item, with concrete next step>
2. <Next>
3. ...

## Items deliberately not flagged
<Things you noticed that look adjacent or cosmetic but aren't worth surfacing as flags. This section keeps the report from feeling exhaustive when it's actually been triaged.>
```

Keep it scannable. The user should be able to read this in under 10 minutes and walk away with a punch list. If the report is longer than ~150 lines, you've over-reported — re-triage and demote the lowest-priority items into "deliberately not flagged".

## Phase 9 — Tell the user

Brief summary in chat:

> Audit complete. Wrote report at `lexicon/plans/_proposals/audit-<iso>.md`. Findings: <one-line health summary>; <highest-priority flag>. <Optional: "Nothing high-priority — mostly hygiene." | "One possibly-stale invariant worth attention." | "Distillation never completed; recommend doing that first.">

Don't dump the full report into chat. The file is the artifact; chat is the pointer. Resist the urge to walk through every flag in conversation — that defeats the triage-list shape.

## Targeted mode

A full audit is the default, but the user can ask for narrower runs: "audit just the glossary", "check hygiene only", "validate invariants against the recent merge". When run targeted:

- Skip the unrequested phases entirely (don't even mention them in the report).
- Note `Scope:` in the report header so future audits know what was covered.
- It's fine for a targeted audit to find nothing — write the (short) report anyway. Negative results are valuable evidence that the next full audit can lean on.

## After the audit

`lex-audit` produces a *triage list*. It does not apply changes. The user reviews and either:

- Accepts a finding → applies the corresponding change manually or via a follow-up session (which would itself ground via `lex-ground` and produce its own retro for the change).
- Rejects a finding as noise → ideally adds a line to `calibration.md` so future audits don't re-flag it.
- Defers a finding → leaves the proposal under `_proposals/` (or moves it to a holding folder).

Once the report has been triaged, move it to `lexicon/plans/_archive/_audits/audit-<iso>.md` so the next audit can reference it.

## What this skill is NOT

- **Not a fixer.** Audit doesn't edit `system.md` or refactor code. It surfaces evidence; humans decide.
- **Not a substitute for crystallization.** Crystallize is feature-scoped and forward-flow; audit is project-scoped and backward-flow. They cover different gaps.
- **Not a per-session ritual.** Running this every session is wasted tokens and proposal-queue spam. Quarterly or on-demand is the right cadence for most projects.
- **Not a replacement for the post-bootstrap distillation session.** If TODO markers dominate `system.md`, audit's other findings are noise — the distillation session has to happen first.

## On honesty about findings

The temptation is to make the audit report look thorough by flagging everything ambiguous. Resist. **A short report with three real flags is more useful than a long report with thirty borderline ones.** The user has a finite review budget; consume it with high-confidence findings, not exhaustive ones.

When you are unsure whether something is a real flag, default to listing it under "Items deliberately not flagged" with a one-line note. That section is itself a useful artifact — it shows what was considered and dismissed, which builds calibration over time.

The single most important thing this skill produces is **calibration of attention**. Anyone can grep-and-flag. The value is choosing the three to five things that actually matter for this audit cycle, and naming them clearly enough that the user can act.
