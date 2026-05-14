---
name: lex-migrate
description: "Schema and structural migration for lexicon-using projects. Detects the project's current cold-layer schema version, computes the chain of per-version deltas needed to reach the latest supported version, and applies each delta in order. Deltas live in `migrations/v<X>-to-v<Y>.md` next to this skill — each describes a specific schema bump (markdown → v0.1 YAML, v0.1 → v0.2 narrative/overlays/links, v0.2 → v0.3 DDD-faithful shape). Trigger when the user says 'migrate lexicon', 'upgrade lexicon', 'upgrade to v0.3', 'lexicon doesn't have aggregates / shared kernels / typed seams', when system.yaml contains removed keys (`crossCuttingTerms`, `kind: decision`), when system.md is present (legacy markdown), or when lex-ground / lex-bootstrap / lex-audit detects structural violations against the latest schema. Read lex-overview first."
---

# Lexicon: migrate

This skill brings a project's cold layer up to the latest supported schema version. It works by detecting the project's current version, computing the chain of per-version deltas needed to reach the target, and applying each delta in order.

Each delta is described in its own file under `migrations/`. The orchestration here is small and stable; the substance lives in the deltas. Adding support for a future schema bump means writing one new delta file — the orchestrator doesn't change.

If you haven't loaded `lex-overview` yet this session, read it first — the target schema and the versioning model are defined there.

## The delta chain

The supported deltas, in order:

- **`migrations/v0.x-to-v0.1.md`** — pre-YAML markdown lexicon (`system.md`, `views/*.md`, `decisions/*.md`) → v0.1 YAML (`system.yaml`, `contexts/*.yaml`, `decisions/*.yaml`, `surfaces/*.yaml`). Mechanical conversion; preserves content faithfully.
- **`migrations/v0.1-to-v0.2.md`** — v0.1 YAML → v0.2 structural conformance. Lifts non-canonical top-level keys (`battery:` → `overlays:`), formalizes `[[fqid]]` inline links, drafts `narrative` at scopes that warrant it, enriches `deliberateOmissions` with `triggers` / `relatedAtoms`.
- **`migrations/v0.2-to-v0.3.md`** — v0.2 → v0.3 DDD-faithful shape. Removes the `decision` kind (archives ADRs, optional rationale-lift), replaces `crossCuttingTerms` / `crossCuttingInvariants` with typed `sharedKernels`, renames `modules` → `codeModules` (freeing `modules` for Evans-sense concept clusters), introduces `term.category`, typed `seam.kind`, `aggregate` / `module` entity kinds, `subdomain` field, rationale fields. Interactive; the user makes the interpretive calls per item.

The latest supported version is the target of the last delta in the chain (currently **v0.3**).

Each delta file is **self-contained**: it describes its own pre-flight checks, detection phase, apply phases, validate phase, and report-section template. This file is the orchestrator — it picks and chains; the deltas do the work.

This skill is **forward-only** across all deltas. No `lex-unmigrate`; downgrade is git revert.

## Detecting the current version

Walk `lexicon/` and answer:

1. **`lexicon/system.yaml` exists** — read its `schemaVersion:` field. That value (`"0.1"`, `"0.2"`, …) is the project's current version.
2. **`lexicon/system.md` exists, `lexicon/system.yaml` does not** — project is on the pre-YAML markdown era. Treat as `v0.x markdown`.
3. **Both exist** — inconsistent state. Stop and surface; the user picks canonical.
4. **Neither exists** — project doesn't use lexicon. Refer to `lex-bootstrap`.

A project may also have **mixed schemaVersion** across YAML files (e.g. `system.yaml: "0.2"` but some `contexts/*.yaml: "0.1"`). The loader accepts both, and the v0.1 → v0.2 delta is additive, so this is fine in practice. Treat the project's current version as the **lowest schemaVersion** among its YAML files for chain-computation purposes — that way the chain runs the v0.1 → v0.2 delta if any file is still on v0.1, and the delta's apply phases skip files that are already conformant.

## Computing the chain

The chain is the ordered list of delta files whose source matches the current version and whose target is closer to the latest.

- Current = `v0.x markdown`, latest = v0.3 → chain is `[v0.x-to-v0.1, v0.1-to-v0.2, v0.2-to-v0.3]`.
- Current = v0.1, latest = v0.3 → chain is `[v0.1-to-v0.2, v0.2-to-v0.3]`.
- Current = v0.2, latest = v0.3 → chain is `[v0.2-to-v0.3]`.
- Current = v0.3 (latest) → chain is `[]`. Run the latest delta's **detection phase** anyway to surface violations that exist despite the version claim (e.g. a v0.3 project where someone hand-edited in a removed key). If nothing is found, refuse with: "Already on latest with no structural violations; run `lex-audit` for a backward-flow check."

Show the user the chain you computed before applying anything:

> Current: v0.2 → v0.3 (latest). Will apply: `migrations/v0.2-to-v0.3.md`.

For multi-step chains, the user sees the full sequence and can agree once for the whole chain (typical) or step through with a yes per delta. Default to the per-chain agreement unless the user signals otherwise.

## Applying a migration step

For each delta in the chain, in order:

1. **Read the delta file end to end.** Each one names its own phases. Don't improvise; the delta is the source of truth for what to do at this step.
2. **Run its pre-flight checks.** Each delta names a few of its own (e.g. "v0.x markdown delta refuses if `system.yaml` already exists"). Always recommend a `git commit` first, regardless of delta.
3. **Run the delta's detection phase.** Produce a findings document — the delta names the shape. Surface to the user without editing yet. Let the user choose all / partial / none.
4. **Run the delta's apply phases** in the order the delta lists. Respect the user's per-finding or per-scope greenlight. For phases that draft new prose, follow the cadence rule below.
5. **Run the delta's validate phase.** Re-parse every touched file, check structural invariants, surface failures. Don't auto-revert.
6. **Append to `lexicon/migrate.md`.** Each delta names its report-section template. If `migrate.md` exists (from a prior delta or a prior session), **append** a new dated section; don't overwrite.

When all deltas in the chain are done, give the user a one-line chat summary that points at `lexicon/migrate.md`. Don't dump the report content into chat.

## Drafting prose deliberately

Migration steps that draft new prose (today: the `narrative` field added by `v0.1-to-v0.2`) need authoring discipline — agents drift toward glossary-style summarization unless calibrated. Two cross-cutting rules apply to any current or future delta that writes prose:

### Verbs are load-bearing

The difference between filler and a real narrative is the organizing principle. Atoms keep their definitions; narrative tells the *story above them* — typically a lifecycle, a disambiguation argument, or a decision-touches-these-atoms throughline.

**Bad** (a glossary in prose form):

> Auth owns user identity. The auth service, session store, token rotation, password hashing, MFA, OAuth callbacks. The User aggregate's lifecycle is owned here.

**Good** (a lifecycle, with verbs doing the work):

> A session *is* a signed token, not a row. Authentication exchanges credentials for one; once issued, rotation is the system's only stateful concern — everything downstream verifies signatures, never queries. The token's claims encode role, tenant, and expiry, which makes an authorization decision a pure function of token + requested resource, no round-trip to a permissions table.

Same atoms, different organizing principle. The verbs (*is*, *exchanges*, *verifies*, *encodes*) and the opinions (claims-as-source-of-truth; pure-function authorization) are doing the work. If a draft reads like the first version, push back and rewrite — that's a glossary, not a narrative.

### Cadence: one scope at a time for >3 warranting scopes

When a delta's detection phase flags **more than three scopes** that want prose drafting, propose **one at a time**. Show the draft, take the user's tweaks, apply, move to the next. Drafting all of them upfront and dumping eight narratives in one block is unreviewable — the user can't engage with each opinion, and quality compounds because each tweak the user makes calibrates the next draft.

For three or fewer warranting scopes, a single proposal block is fine.

## When to run

Run when:

- The user explicitly asks ("migrate lexicon", "upgrade lexicon", "upgrade to v0.3", "make this conform").
- `lex-ground` or `lex-bootstrap` detects `lexicon/system.md` and the user agrees to migrate.
- `lex-ground` / `lex-audit` reports structural violations against the latest schema and the user agrees to conform.
- The user describes a gap addressed by a known delta ("lexicon doesn't have aggregates", "system.yaml still has `crossCuttingTerms`").

Don't run when:

- Neither `system.md` nor `system.yaml` exists — refer to `lex-bootstrap`.
- The chain is empty and the latest delta's detection finds nothing. Refuse with the one-liner.
- The user is happy with the current version's content and doesn't want to upgrade. Migration is opt-in; don't push it.

## What this skill is NOT

- **Not a redesign.** Each delta preserves existing content as faithfully as possible. If the source was wrong, it stays wrong — the user fixes it later via `lex-crystallize` or `lex-audit`. The only exception is prose drafted by a delta (today: `narrative`), which is genuinely new and ships only with the user's per-draft yes.
- **Not an audit.** It doesn't check the cold layer against the code. That's `lex-audit`'s job; run it after migration if you want backward-flow validation.
- **Not lossy by silent choice.** Anything that can't be cleanly mapped by a delta is preserved in place *and* listed in the migration report. The user makes the call.
- **Not bidirectional.** Forward-only across all deltas.

## Adding a new migration delta

When the cold-layer schema bumps (v0.2 → v0.3, …), add a new file `migrations/v<old>-to-v<new>.md` following the structure of the existing deltas:

- A short prose preamble (what the version bump captures, why the delta exists).
- A **pre-flight checks** section for delta-specific guards.
- A **detection phase** that produces a findings document.
- One or more **apply phases**, each scoped to a specific kind of change.
- A **validate phase** with concrete checks.
- A **report-section template** for `lexicon/migrate.md`.

Then update the "The delta chain" list at the top of this file to point at the new delta. No other changes to the orchestrating logic.

Schema and structural changes that don't ship a delta won't be reachable via `lex-migrate` — projects on the old version stay there. This is the discipline: **every schema bump ships a delta**. See the project's root `CLAUDE.md` for the full versioning convention.
