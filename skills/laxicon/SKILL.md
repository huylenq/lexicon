---
name: laxicon
description: "Use when a repository has a laxicon/ directory in its primary/default worktree (including when the current linked worktree has no local copy), or when asked to capture an idea, maintain a human-facing project wiki, promote an idea into an architectural spec or execution plan, author or update laxicon specs/plans, decide artifact lifecycle, migrate prose artifacts into laxicon, or evolve the shared Laxicon convention. Laxicon is the human-governed, prose-first, schema-lax sibling of the typed Lexicon layer."
version: 0.3.0
author: Huy Le
license: MIT
platforms: [linux, macos, windows]
metadata:
  hermes:
    tags: [Laxicon, Documentation, Architecture, Planning, Agent-Coordination]
    related_skills: [lexicon, using-lexicon]
---

# Laxicon

Laxicon is a thin interoperability contract for durable, prose-first project context. It standardizes only the operational seam agents and humans must share: a human-facing wiki, ideas, architectural specs, execution plans, minimal lifecycle frontmatter, provenance, and promotion rules. It is not a universal prose schema.

This skill is the canonical contract. Project files are instances of the contract; Claude/Hermes adapters and project-local instructions must not copy or redefine it.

## Core distinction

- `lexicon/` is the precise, typed, distilled DDD layer: system, bounded contexts, surfaces, vocabulary, invariants, and references.
- `laxicon/` is durable, prose-first, human-governed, and schema-lax.
- Human-governed does not mean human-written-only. Agents may create and update artifacts under explicit task authority. The human retains ultimate semantic authority, but may explicitly delegate a bounded portion of that authority to a representative agent, including shaping and adopting a spec from an idea.
- Typical flow: `idea → spec or plan`; stable vocabulary and invariants may later distill `laxicon → lexicon`.

### Shared artifact worktree

Lexicon and Laxicon are project-level shared memory, not per-branch implementation state. Their canonical project instances live in the repository's **primary/default worktree**, even when an agent is coding in a linked feature worktree. They are often intentionally untracked or ignored there.

- Resolve the current code worktree and the primary/default worktree separately. Use the first `worktree` path reported by `git worktree list --porcelain` as the primary/default worktree; do not infer it from a branch name such as `main` or `develop`.
- Read and write the project's `laxicon/` and sibling `lexicon/` only under that primary/default worktree unless the human explicitly names another artifact root. Never read from, create, copy, or update those directories in the agent's linked worktree.
- Absence from the current linked worktree does not mean the project lacks Laxicon or Lexicon. Check the primary/default worktree before proposing bootstrap or migration.
- Keep code inspection, implementation, tests, and feature-branch diffs rooted in the agent's current worktree. Only the shared knowledge artifacts use the primary/default worktree.

## Before acting

1. Resolve the code worktree and shared artifact worktree as above. Read repository instructions from the code worktree, then read `laxicon/README.md` and Laxicon artifacts from the shared artifact worktree when present.
2. Inspect the relevant existing artifacts before creating or moving anything. Project-local policy may narrow this contract but must not silently contradict it.
3. Do not migrate legacy `lexicon/specs/`, `lexicon/plans/`, or arbitrary docs merely because this skill loaded. Migration is a separate, explicit task with link and tooling impact.
4. Write project artifacts in neutral project language. Do not copy assistant persona, chat transcript, or conversational framing into the repository.

## Contract v0 scope

```text
laxicon/
  ideas/       # pre-authoritative project thinking
  wiki/        # human-facing project understanding and learning
  specs/       # durable architectural intent
  plans/       # disposable execution intent
  ...          # project-defined and deliberately uncontracted
```

Contract v0 standardizes the name and broad human-facing role of `wiki/`, but intentionally leaves its taxonomy and metadata schema open. Only `ideas/`, `specs/`, `plans/`, their minimal frontmatter, and their conversion rules are lifecycle contract surfaces. A project does not need every directory to use Laxicon.

Folders such as `guides/`, `gates/`, `reports/`, `backlog/`, `concepts/`, and `assets/` remain project-defined.

## Wiki

`laxicon/wiki/` is durable prose for humans to read, understand, and learn the project. It carries explanatory context that the typed Lexicon layer deliberately compresses away: concept notes, domain background, research findings, design reasoning, rejected alternatives, and the narrative “why” behind the system.

- The wiki is human-facing, not human-written-only. Agents may add or update pages under explicit task authority, but should optimize them for human comprehension rather than agent scratch space.
- Wiki pages are mutable learning material, not lifecycle or architectural authority merely because they exist. Put uncertain proposals in `ideas/`, durable architectural intent in `specs/`, and execution state in `plans/`. Stable vocabulary and invariants may later distill from the wiki into `lexicon/`.
- Prefer small, focused Markdown pages when that improves navigation, but do not impose an atomic-note or Zettelkasten model globally. Project-local organization remains authoritative.
- Encourage Obsidian-style `[[wikilinks]]` for links between wiki pages. Prefer filename links such as `[[Resolver Registry]]`; use a path or alias when names collide, for example `[[wiki/architecture/Resolver Registry|Resolver Registry]]`. Ordinary Markdown links remain appropriate for external URLs, assets, and consumers that do not support wikilinks.
- Favor stable page names because the wiki is commonly symlinked into an Obsidian vault. When renaming a page, update path-qualified links and verify that filename-only wikilinks still resolve.
- Do not require lifecycle `status` frontmatter in `wiki/`; projects may define their own metadata conventions.

## Lifecycle rule

**Frontmatter status is canonical semantic truth. File relocation is an optional project-level curation view.**

- Status can represent blocked, superseded, refuted, and promoted states that folders cannot express cleanly.
- Stable paths protect links and automation consumers.
- Projects may relocate terminal plans to keep the active namespace clean.
- Always read `status`; never infer lifecycle solely from the containing directory.

### Minimal frontmatter

```yaml
---
status: <allowed status for this artifact kind>
created: YYYY-MM-DD
updated: YYYY-MM-DD
---
```

- Every artifact under `ideas/`, `specs/`, and `plans/` must begin with YAML frontmatter containing `status`. A heading, label, table row, or prose statement in the Markdown body does not satisfy this requirement.
- `created` and `updated` are recommended. Update `updated` when meaning, authority, or lifecycle changes; do not churn it for formatting-only edits.
- Do not universally require `type`; the first-level directory already carries artifact kind.
- Do not universally require `scope`, `branch`, `tags`, `owner`, `contexts`, or `surface`. They are project-specific or likely to become stale.
- Add lineage only when a real relationship exists. Supported field names are `idea`, `spec`, `promoted-to`, and `superseded-by`. Values are project-relative paths; lists are allowed where the relationship is one-to-many.

## Ideas

`laxicon/ideas/` holds neutral pre-commitment thinking. Preserve the tension, current hypothesis, meaningful alternatives, evidence, and open questions without prematurely decomposing implementation.

Recommended lightweight shape; headings are affordances, not schema:

```markdown
---
status: open
created: YYYY-MM-DD
updated: YYYY-MM-DD
---

# Idea title

## Tension

## Current hypothesis

## Why it may matter

## Open questions
```

Idea statuses:

- `open`: still being considered; not authoritative and not implementation authority.
- `promoted`: produced a downstream spec and/or plan.
- `parked`: useful but intentionally inactive.
- `discarded`: considered and deliberately not pursued.

Do not add workflow theater such as `shaping`, `ready`, or `reviewing` without a real consumer. An explicit authority-bearing handoff is the promotion gate. The handoff may reserve the downstream spec for human review, or delegate bounded spec shaping and adoption to a representative agent; do not infer either mode merely from `status: open`.

## Promotion boundary

Promote an idea to a **spec** when it changes or constrains architectural boundaries, persistent models, public contracts, security, invariants, cross-package behavior, or decisions costly to reverse.

Promote directly to a **plan** when the outcome is clear and the remaining work is local, reversible implementation, migration, testing, or cleanup detail.

Keep it as an idea while the thesis is unclear, alternatives remain open, or evidence is missing.

When promoting:

1. Create the downstream artifact in the same change.
2. Set the idea to `status: promoted`.
3. Add `promoted-to` links from the idea.
4. Add `idea` provenance on the downstream artifact when useful.
5. Do not implement an `open` idea merely because it exists.

## Decision boundary and delegated authority

Laxicon does not hard-code one universal point where human decision-making must stop. The authority-bearing handoff chooses the boundary for the work at hand:

- **Spec-reviewed mode (default):** agents may shape an idea and draft a spec, but the human reviews the spec and marks it `adopted`. Adoption closes routine normative decision-making for that scope; agents may derive and execute plans without another mandatory plan-review ceremony.
- **Idea-delegated mode:** the human delegates a bounded outcome, constraints, and escalation policy at the idea handoff. A representative agent may then cooperate with coding or research agents to shape and adopt the downstream spec within that envelope, and continue into execution plans.

Delegating at the idea boundary is not blanket permission for a coding harness to self-authorize. The representative must preserve the idea's tension and constraints, distinguish evidence from decisions, and escalate choices outside the delegated envelope. Delegation may be carried by an explicit task, shift manifest, project policy, or optional project-local metadata; contract v0 deliberately does not require one universal frontmatter field for it.

## Specs

Specs express durable architectural intent: what, why, decisions, contracts, flows, risks, and rejected alternatives. A spec is the primary durable decision and review unit. It is not a step-by-step execution tracker, but it also remains the durable home for implementation and acceptance evidence after the design is realized.

A new spec begins with frontmatter such as:

```yaml
---
status: draft
created: YYYY-MM-DD
updated: YYYY-MM-DD
---
```

Spec statuses:

- `draft`: not yet authoritative.
- `adopted`: current accepted architectural intent.
- `superseded`: replaced by another spec; add `superseded-by`.
- `refuted`: investigated and rejected; retain the reasoning so future work does not repeat the dead end.

A spec is never `done`; implementation progress belongs to plans. Keep spec paths stable across lifecycle states. Only the human semantic authority, a representative acting within explicitly delegated semantic authority, or an instruction explicitly carrying that authority may mark a spec `adopted`, `superseded`, or `refuted`.

An adopted spec normally terminates routine design decision-making for its scope. Plans derived from it are execution units and do not require separate human review unless the spec, delegation envelope, or project-local policy says otherwise. A plan must not smuggle in a new normative decision that the spec left unresolved.

After implementation, update the adopted spec with concise durable evidence. Recommended headings are affordances, not required schema:

```markdown
## Implementation evidence

- What was realized and where the durable implementation can be inspected.
- Material deviations from the adopted design, if any.

## Acceptance evidence

- Acceptance criterion or test.
- Command, environment, date, and observed result when those details matter.
```

Agents may append or refresh factual implementation and acceptance evidence under execution authority after verifying it. Evidentiary edits do not grant authority to rewrite normative decisions. If implementation evidence contradicts the adopted design, preserve the evidence and surface the contradiction; amend, supersede, or refute the spec only under the semantic authority required for that lifecycle change.

A spec derived from an idea should carry `idea:`. Plans implementing it should carry `spec:`. Do not maintain redundant backlink fields when repository search or backlinks already provide the inverse relationship, except for the idea's explicit `promoted-to` handoff record.

## Plans

Plans are the mutable execution units: sequencing, milestones, progress, verification, handoff state, and implementation detail. Agents are expected to create and update them as execution learns, while keeping the governing idea or spec stable unless a real semantic change is authorized.

Plan statuses:

- `draft`
- `active`
- `blocked`
- `done`
- `abandoned`

Use `spec:` when executing an architectural spec, or `idea:` when a local/reversible idea goes directly to execution. After a spec is adopted, agents may derive, activate, and revise its plans without routine human plan review, provided they stay inside the held design and delegation envelope. Agents may update factual progress and checklists only after verification. `blocked` remains active; do not archive it to hide the blockage.

If execution exposes a normative gap, the plan must not silently decide by implementation. A representative may resolve the gap only when its delegated semantic authority covers that choice; otherwise mark the plan `blocked` and propose the smallest spec amendment or decision needed. When a plan realizes a spec, its completion workflow must propagate concise implementation and acceptance evidence back into the spec; the plan remains the detailed execution ledger.

Supported optional relocation view:

```text
plans/*.md           draft | active | blocked
plans/done/*         done
plans/archived/*     abandoned
```

Relocation is project policy, not semantic truth. Stable-path consumers may keep terminal plans in place. If path and frontmatter disagree, frontmatter wins and the inconsistency must be surfaced.

A `done` plan may be deleted only when:

1. durable rationale has been absorbed into its idea or spec;
2. durable evidence is preserved in code, tests, reports, or version history; and
3. no artifact relies on the plan as its unique source.

Otherwise leave it in place or move it to `plans/done/` according to project policy.

## Agent posture

- Useful project prose comes first. Preserve uncertainty in ideas, authority and durable acceptance evidence in specs, and verified execution progress in plans.
- Do not turn Laxicon into “Lexicon written in Markdown.” Formalize interoperability, not prose content.
- Do not silently promote, adopt, refute, supersede, relocate, or delete artifacts without the authority required above.
- Distinguish normative edits from evidentiary edits. Execution authority may update verified evidence in an adopted spec; changing its decisions requires semantic authority.
- Do not treat a project-local pattern as global precedent. Before proposing a shared-contract change, compare multiple real projects and identify an actual interoperability need.
- If a repository already uses legacy paths or status vocabulary, surface the mismatch and propose migration separately; do not perform drive-by normalization.

## Verification checklist

Before finishing an artifact change:

- Frontmatter parses and `status` belongs to the artifact kind.
- Project-relative lineage paths resolve.
- Idea promotion updated both the source idea and downstream artifact.
- A spec status was not used as an implementation-progress proxy.
- Any spec lifecycle change was made under human or explicitly delegated semantic authority.
- A plan marked `done` cites actual verification in its body or linked evidence.
- A plan that realizes a spec propagated concise implementation and acceptance results back into that spec.
- Any relocation updated affected relative links.
- Path-qualified wiki links resolve after page or directory moves; filename-only `[[wikilinks]]` remain unambiguous or use aliases where needed.
- No global semantics were imposed on uncontracted directories.

## Evolving this contract

The canonical source is the co-hosted Agent Skill at `~/src/lexicon/skills/laxicon/SKILL.md`. Change it only when the human explicitly asks to evolve the shared Laxicon convention. Use several project instances as evidence, keep the contract thinner than the practice it coordinates, and leave the repository dirty for human review unless asked to commit.

Runtime installations are discovery adapters, not alternate authorities. If an installed Claude or Hermes copy conflicts with this file, this file wins and the adapter should be refreshed rather than edited independently.
