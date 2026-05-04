---
name: lex-bootstrap
description: "Use this skill at adoption time when a project is being set up to use lexicon for the first time. This is the dedicated, one-shot replacement for the bootstrap step that used to live inside lex-ground — run it once per project, not per session. Trigger when the user says 'set up lexicon', 'adopt lexicon', 'bootstrap lexicon', 'migrate this project to lexicon', or when lex-ground detects no docs/system.md and the project clearly has substantive existing docs (docs/, ARCHITECTURE.md, DESIGN.md, RFCs, ADR folders) or non-trivial code. Unlike lex-ground's old bootstrap subroutine — which only scanned code — this skill reads existing docs AND code, distills a first-cut system.md from the intersection, migrates ADR-shaped content into docs/decisions/, and produces a triage list for the user. It does NOT try to fully complete the distillation autonomously; the cold doc's authority comes from human review, and this skill's job is to lower the cost of getting there. This is one of four lexicon skills — read lex-overview if you haven't already this session."
---

# Lexicon: bootstrap

This skill prepares a project for lexicon. It is the **one-shot** counterpart to the per-session/per-feature operational skills — run it once at adoption, then never again on the same project.

If you haven't loaded `lex-overview` yet this session, read it first.

## When to run this

Run when:

- The user says they want to adopt lexicon for this project ("set up lexicon", "bootstrap lexicon", "migrate to lexicon", "adopt the lexicon workflow").
- `lex-ground` fires on a project with no `docs/system.md` and surfaces "this project should bootstrap first".
- The user is starting a new project and wants the lexicon structure in place from day one (in this case, the doc-audit phases mostly no-op — that's fine).

Don't run when:

- A `docs/system.md` already exists and is current — that's not bootstrap, that's `lex-audit` (sanity check) territory.
- A `docs/system.md` exists but seems out of date — also `lex-audit`, not this skill. Re-bootstrapping over a real `system.md` would clobber human-curated content. Refuse.
- The project is a throwaway script or single-file prototype — lexicon is not free, and very small projects don't benefit. Surface this honestly: "This project looks small enough that lexicon may be overhead. Want me to bootstrap anyway?"

## Pre-flight checks

Before doing anything destructive, confirm:

1. `docs/system.md` does **not** exist. If it does, stop and surface — the user should consider `lex-audit` (when that skill exists) or hand-edit, not re-bootstrap.
2. The user has explicitly opted in. This skill creates a `docs/` structure and writes a draft `system.md`. Don't run it speculatively.
3. The repo is in a clean-ish git state, or the user accepts that bootstrap will create unstaged changes. If the working tree has a lot of uncommitted churn, surface it: "Bootstrap will add a `docs/` tree and possibly move ADR-shaped files. You have N uncommitted files — want to commit those first, or proceed?"

## Phase 1 — Audit existing docs

Walk the repo for documentation surface area. Look in (these are conventional locations; adapt to what's actually there):

- `docs/`, `doc/`, `documentation/`
- `ARCHITECTURE.md`, `DESIGN.md`, `OVERVIEW.md`, `CONCEPTS.md` at repo root
- `decisions/`, `adr/`, `docs/adr/`, `rfcs/`
- `wiki/`, `notes/`, `internal/`
- `README.md` (skim, but don't migrate — READMEs are reference, not cold-layer)

Bucket every file you find:

| Bucket | Cue | Where it goes |
|---|---|---|
| **Cold-layer candidate** | Glossary fragments, "principles", architectural invariants, "why X over Y" reasoning, conceptual model descriptions | Distillation source for `system.md` |
| **ADR-like** | "We chose X because Y" prose, decision records, RFCs with a clear decision | Migrate to `docs/decisions/` (Phase 6) |
| **Hot/feature docs** | Active feature specs, in-flight plans, "next quarter" docs | Move to `docs/plans/<feature>/` if active, `docs/plans/_archive/` if done |
| **Reference / runbook** | API docs, deployment guides, onboarding, "how to run X" | **Leave alone.** Not lexicon's domain. Don't touch. |
| **Stale** | "TODO: clean up" from years ago, abandoned drafts | Surface for the user to decide. Don't auto-delete. |

Produce the bucketed list as part of the triage report (Phase 8). Don't move files yet.

## Phase 2 — Audit the codebase

Without trying to be exhaustive, surface the project's structural shape:

- **Top-level modules / packages** — the directory layout usually reveals provisional bounded contexts.
- **High-frequency identifiers** — class, type, struct, and top-level function names that appear across many files. These are glossary candidates.
- **Public surface** — exported types, public APIs, entrypoints. The vocabulary at this surface tends to be the most load-bearing.
- **Cross-module dependencies** — which modules import which. Hints at whether the seams are clean (low cross-talk) or already tangled (lots of cross-talk).

Use whatever tools fit (rg, ast-grep, ctags, the project's language tooling). Don't over-invest — a 30-minute scan that surfaces 80% of the structure is the right depth. Deep static analysis is out of scope; that's the user's job during distillation.

## Phase 3 — Cross-reference doc vocabulary against code

This is the **highest-signal extraction zone**, the thing `lex-ground`'s old code-only bootstrap couldn't do. For each candidate term collected from docs (Phase 1) and code (Phase 2):

- **In docs AND code, used consistently** → strong glossary candidate. Real ubiquitous-language territory.
- **In docs only** → drift. Either the term was renamed in code, or the doc describes a concept that's not actually implemented. Flag for the triage report; don't auto-add to glossary.
- **In code only** → either too low-level to glossary (most internal class names), or genuine domain vocabulary the docs missed. Apply judgment: if the term appears in public API or in many files, it's probably a real concept. If it's a single-file utility class, skip it.
- **Inconsistent definitions** — same term used differently in different docs, or in docs vs code. Highest-priority flag for the user — this is exactly the kind of silent drift lexicon exists to surface.

## Phase 4 — Draft `system.md`

Copy `${SKILL_DIR}/templates/system.md.template` (i.e. `templates/system.md.template` next to this `SKILL.md`) to `docs/system.md`. Resolve `${SKILL_DIR}` based on install mode: `${CLAUDE_PLUGIN_ROOT}/skills/lex-bootstrap/templates/...` for plugin installs, `~/.claude/skills/lex-bootstrap/templates/...` (or project `.claude/skills/lex-bootstrap/templates/...`) for `npx skills` installs. If neither resolves, fall back to drafting `system.md` from scratch using the structure described in `lex-overview`.

Fill in the draft using the cross-referenced material from Phase 3:

- **Glossary**: only entries with strong evidence (in docs AND code, used consistently). Each entry includes a short definition, drawn from existing doc text where possible. For terms with no clean source, write `<!-- TODO: confirm with user -->`.
- **Invariants**: extract from existing doc prose where it asserts "must", "always", "never". Mark each as `<!-- TODO: confirm still holds -->` — old invariants are often subtly stale.
- **Bounded contexts**: provisional, drawn from top-level module structure. Name them; describe each in one sentence; mark the boundaries between them. Heavily TODO-tagged.
- **Why notes**: extract any "we chose X because" or "this exists because" prose verbatim into a "Rationale" section, with attribution to the source doc.

Be honest about what's a guess. The drafted `system.md` should read like an honest first cut, not a confident model. Sections that are mostly TODO are *more useful* than sections that confidently invent content.

If the draft would exceed ~500 lines, **stop and stage it differently** — either narrow scope (skip whole categories) or surface to the user that the project is unusually large and may need multiple `system.md` slices. Don't ship a 1500-line bootstrapped doc; that's already broken.

## Phase 5 — Set up the directory structure

Create:

```
docs/
  decisions/
  plans/_active/
  plans/_scratch/
  plans/_proposals/
  plans/_retros/
  plans/_archive/
```

Be defensive — if `docs/decisions/` already exists from a prior workflow, leave it alone (Phase 6 will populate it). If `docs/plans/` exists with non-lexicon content, surface to the user before merging — don't silently restructure their existing plans folder.

## Phase 6 — Migrate ADR-shaped content

For each file from Phase 1's "ADR-like" bucket:

- If it's already in roughly ADR format (context, decision, consequences) → copy to `docs/decisions/ADR-<NNNN>-<short-title>.md` with a renumbered ID. Preserve original date in the body.
- If it's prose with embedded decisions → don't try to auto-extract. Add to triage report: "this doc contains decisions but isn't in ADR shape; user should extract manually or leave as reference."
- If it's an RFC with a clear "decision" or "outcome" section → extract the decision portion as an ADR; leave the original RFC alone (often it has discussion value beyond the decision itself).

Use `${SKILL_DIR}/templates/adr.md.template` for the ADR shape if you need to reformat.

ADRs are append-only — once migrated, they stay there. Don't edit existing ADR content for style; just preserve and renumber.

## Phase 7 — Triage suggestions for hot/stale docs

For files in the "hot/feature docs" and "stale" buckets, **do not auto-move**. Instead, recommend in the triage report:

- For active feature docs: "move `docs/feature-X-spec.md` to `docs/plans/<feature-X>/spec.md`?"
- For done feature docs: "archive `docs/old-redesign-plan.md` to `docs/plans/_archive/old-redesign/`?"
- For stale: "this looks abandoned (last touched 2 years ago, references removed APIs) — archive or delete?"

Auto-moving feature docs is a high-blast-radius action — they may have URLs, links, or be cited elsewhere. Let the user choose.

## Phase 8 — Write the triage report

Write `docs/plans/_proposals/bootstrap-<iso-date>.md` with this shape:

```markdown
# Bootstrap report
Run on: <iso timestamp>

## What was created
- `docs/system.md` (drafted; <N> lines, <M> TODO markers)
- `docs/decisions/` with <K> ADRs migrated from <sources>
- `docs/plans/` directory structure

## Doc audit summary
- <N> existing docs scanned across <locations>
- Bucketed: cold-layer-candidates=<N>, adr-like=<N>, hot-feature=<N>, reference=<N>, stale=<N>

## Glossary candidates with strong evidence
- <Term>: <one-line note on where it appears in docs and code>
- ...

## Drift flags (term in docs, missing or renamed in code)
- <Term> — <where it lives in docs vs what code uses instead>
- ...

## Inconsistencies (same term, different definitions)
- <Term>: defined as X in <doc-A>, used as Y in <doc-B>, code uses Z
- ...

## Invariants extracted (need user confirmation)
- <Invariant from doc> (source: <file>) — does this still hold?
- ...

## Provisional bounded contexts
- <Context name>: <one-line description, top-level modules involved>
- ...

## Rationale ("why" notes) extracted verbatim
- From <source>: "<quoted prose>"
- ...

## Recommended file moves (NOT done — needs your call)
- Active feature doc `docs/feature-X.md` → `docs/plans/feature-X/spec.md`?
- Done feature doc `docs/old-thing.md` → `docs/plans/_archive/old-thing/`?
- ...

## Possibly stale (your call)
- `docs/<file>` — <reason for suspicion>
- ...

## Next step
Run a focused-distillation session (no other task mixed in) where you walk through `docs/system.md` with the agent and:
1. Confirm or revise each `<!-- TODO -->` marker.
2. Cull glossary entries that aren't really domain vocabulary.
3. Validate or remove each invariant.
4. Refine the bounded-context list against your real mental model.

Expect this to take 30–90 minutes for a moderately documented project. The drafted `system.md` is intentionally a first cut — its authority comes from your review, not from the bootstrap.
```

## Phase 9 — Tell the user

Summarize in chat, briefly:

> Bootstrap complete. Drafted `docs/system.md` (<N> lines, <M> TODOs), migrated <K> ADRs, and set up the `docs/plans/` structure. Triage report at `docs/plans/_proposals/bootstrap-<iso>.md` — review when ready, especially the "drift flags" and "inconsistencies" sections. Recommended next step: a focused-distillation session to walk through `system.md` with `<!-- TODO -->` markers in mind.

Don't dump the report content into chat. The file is the artifact; chat is the pointer.

## What this skill is NOT

- **Not a one-shot full setup.** It produces a *draft* and a *triage list*. The user has to drive the focused-distillation session afterward — without that, `system.md` is incomplete and the rest of the workflow rests on shaky foundations.
- **Not a periodic refresh.** For projects already on lexicon where `system.md` is drifting, that's `lex-audit` territory (separate skill, may not yet exist). Refusing to re-run on a populated `system.md` is intentional.
- **Not a documentation generator.** It extracts and structures what's already there. It doesn't invent content — TODO markers are honest signals, not failures.

## On honesty about the draft

The single most important thing this skill produces is **calibrated TODO markers**. A drafted `system.md` with 20 honest TODOs is more useful than one with 0 TODOs that confidently invents invariants. The bootstrap's job is to lower the cost of the focused-distillation session, not to replace it. If you're tempted to "complete" something rather than mark it TODO, resist — the user can fill in real content; you can only fill in plausible-looking content.
