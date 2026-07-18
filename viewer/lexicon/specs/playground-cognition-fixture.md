---
status: proposed
created: 2026-06-27
updated: 2026-06-27
scope: rebootstrap the honeywell-forge-cognition-workspace cold layer under manifesto-era conventions; viewer/test-fixtures (synthetic drift + contradiction fixtures); test plan for model-health + overlay + workflow-mechanization
context: viewer
---

# Playground & fixtures — rebootstrap Honeywell Cognition under the manifesto

Dogfooding the viewer on *itself* has two defects (observed): it's too simple and single-stack, and it's too **meta** — "lexicon" names both the tool and the target, so discussion collides on vocabulary. The testing ground moves to a realistic codebase: `~/src/aitomatic/honeywell-forge-cognition-workspace` (multi-stack: 5 Python venvs + TS UIs, git submodules, an out-of-tree `dana` symlink — the worst-case the LSP supervisor was already validated against).

honeywell already carries a `lexicon/` cold layer — but it **predates this manifesto**, was authored ~2025, was never run through `crystallize` (no `.last-crystallized`), and is already ~13% rotted (4 dangling + 1 drifted of 32 anchors). Building the playground on a pre-manifesto artifact would bias every test toward legacy shapes and let the rot deepen. So this session **rebootstraps** the cold layer clean, manifesto-aligned, healthy from birth.

## Decision 1 — Rebootstrap, don't inherit

Archive the existing `lexicon/` (git-move to `lexicon/_pre-manifesto-archive/`, never delete — it's the recoverable record of the legacy run) and draft a fresh cold layer under schema v1.0 + manifesto conventions, seeded from the current-code domain reconnaissance:

- **5 bounded contexts:** `dos-selector` (core), `dos-engine` (core), `star-agents` (core), `auth-plane` (supporting), `facility-config` (overlay).
- **Shared kernels:** `star` (STAR loop), `grounding` (LLM narrates, Python computes), `facility-envelope` (opaque tenant-scope keys), `workflow-catalog` (the routable workflow set).
- **~18–25 terms** anchored to the *real, current* symbols (entities: `ForgeSTARAgent`, `BaseResource`, `CachedBMSResource`, `AutonomousFacility`, `WorldState`, `Topology`, `Schedules`, `WattsEnergyAgent`, `ConnieComfortAgent`; values: `FacilityIdentity`, `CatalogPoint`, `RouteDecision`; services: `select_with_stage`, `run_workflow`, `SemanticClassifier`, `Encoder`; concepts: workflow / algorithmic-agentic-gate nodes / `EngineSpec`).
- **~8–12 invariants** with `constrains-code` anchors (closed route set; fail-soft to STAR; deterministic figures; facility-blind engine; one user-auth hop; tenant-scoped session; stale-while-revalidate cache; no facility literals).
- **~7 seams** (selector→engine customer-supplier; engine→agents open-host-service; auth→engine/agents customer-supplier; engine/agents→config conformist; selector↔config separate-ways).

## Decision 2 — The bootstrap is healthy from birth; that is its first acceptance test

Every `<code-anchor>` is **verified against current code before it is written** — read the file, confirm the symbol exists at a real repo-relative path (per `schema.md`'s anchoring discipline). The fresh layer must pass `model-health` with **zero dangling anchors**. This is the manifesto correction of the legacy run's failure mode: the old layer anchored `STARAgent` in the Dana package (out-of-repo) and `ComfortAgent` (since renamed `ConnieComfortAgent`); the rebootstrap anchors the real in-repo `ForgeSTARAgent` and `ConnieComfortAgent` instead. Bootstrap quality = 0 dangling is the gate.

## Decision 3 — Synthetic fixtures carry the drift & contradiction test cases

Because the rebootstrapped layer is healthy, the *detection* capabilities need planted cases. Add small fixtures under `viewer/test-fixtures/` (the existing `multistack/` / `ambiguous/` pattern):

- **`drift/`** — a cold layer + code where an anchored symbol was renamed and another's file deleted → expect `drifted` + `dangling`.
- **`contradiction-leak/`** — a `seam kind="separate-ways"` plus code that calls across → expect `separate-ways-violation`.
- **`contradiction-unsupported/`** — a declared seam with no code edge behind it → expect `unsupported-seam`.
- **`contradiction-acl/`** — an `anticorruption-layer` seam plus a call bypassing the ACL module → expect `acl-bypass`.

honeywell's healthy seams (selector→engine, auth→TenantScopedSession, facility-blind engine) are the "aligned, not flagged" control cases.

## Decision 4 — `external` is a distinct anchor verdict, demonstrated by the fix

The legacy `dana` anchor (`STARAgent` in an installed package) is the motivating case for the `external` sub-verdict (`model-health-design.md` Decision 4): a symbol resolving only outside the repo tree (`.venv`/`node_modules`/symlinked dep). The rebootstrap *fixes* it by anchoring the in-repo `ForgeSTARAgent` — so honeywell shows the healthy end state, and a synthetic fixture exercises the `external` verdict itself.

## Decision 5 — Demonstrate the full loop end to end

1. **Rebootstrap** → fresh healthy cold layer; viewer renders the domain-selective graph; `model-health` reports 0 dangling.
2. **Detect** → run `model-health` against the `drift/` and `contradiction-*` fixtures; the deterministic checker lights up.
3. **Fix** → drive `crystallize` (terminal) on a planted drift; consistency candidate (check #2) proposes the `add-anchor`/`rename`; apply.
4. **Re-validate** → `model-health` clean. The loop closes on a realistic codebase, with no vocabulary collision against the viewer's own model.

## ⚠ Foundation contradictions / caveats

- **Writing to an external repo is authorized and archived.** Rebootstrap mutates honeywell's `lexicon/` — a deliberate, user-requested write. The old layer is git-moved to `_pre-manifesto-archive/`, not deleted. The viewer itself stays read-only against honeywell; only this rebootstrap step (and later terminal `crystallize`) writes.
- **Rebootstrap is a pragmatic seed, not the full one-decision-per-turn interview.** `bootstrap`'s normal human-paced distillation is compressed to an automated draft from verified reconnaissance — acceptable because the target is a playground and the result is fully reviewable (XML + viewer render + the 0-dangling gate). Gaps get `<!-- TODO -->` markers for a later human pass.
- **Don't leak honeywell vocabulary into the viewer's own cold layer.** `STARAgent`, `WorldState`, `facility envelope` are the *target's* terms — keeping them strictly on the honeywell side is the entire point of escaping the meta/vocab-collision trap.

## Phasing

| Phase | Deliverable | Gate |
|---|---|---|
| **P0** | Archive legacy `lexicon/`; draft fresh manifesto-aligned cold layer from verified recon. | `model-health` on honeywell → **0 dangling**; viewer renders the domain-selective graph. |
| **P1** | Synthetic `drift/` + `contradiction-*` fixtures. | Each planted case detected with the right verdict/kind. |
| **P2** | Integration tests (honeywell healthy baseline + synthetic detection). | Suite green. |
| **P3** | End-to-end fix-loop demo (detect → crystallize → re-validate). | A planted drift round-trips to healthy. |

## Risks & open questions

- **Automated bootstrap quality.** A seeded draft can mis-categorize or under-anchor; the 0-dangling gate catches broken anchors but not wrong categories. Flag `<!-- TODO -->` liberally; a human distillation pass can follow.
- **Test stability against a live external repo.** honeywell evolves; pin assertions to stable anchors or snapshot the rebootstrapped layer into a fixture if CI drift bites.
- **Re-anchoring churn.** If honeywell refactors, the fresh layer rots too — which is precisely what `model-health` + `crystallize` exist to manage. That ongoing management *is* the dogfood.

## Vocabulary to crystallize

No viewer vocabulary of its own (a test-bed). New viewer terms come from the feature specs it exercises.
