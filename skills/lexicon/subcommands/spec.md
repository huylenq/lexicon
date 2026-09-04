# Subcommand: spec

Author, evolve, and file a **spec** — a design/architecture document that lives at a *higher altitude than code and a lower altitude than the cold layer*. The cold layer (`system.xml`, `contexts/`, `surfaces/`) answers *"what are our words and rules?"* in a few hundred terse lines. A spec answers *"how does this particular subsystem actually work, end to end?"* — a per-feature narrative with flows, load-bearing properties, and the history of how it was built. The cold layer is too small to hold that; code is too low-level to read it off. The spec fills the gap.

Specs are **markdown**, human-directly-readable, and rendered by the lexicon viewer (which resolves their `[[fqid]]` links into the cold-layer graph). They are *not* part of the typed XML cold layer — don't try to fold a spec into `system.xml`. Keep the artifact light; the integration is by reference.

## Where specs live

Under `lexicon/` so the viewer discovers them, in a two-tier lifecycle:

```
lexicon/specs/
  <slug>-design.md        ← active design (Shape A) — a decision log, argues the design
  <slug>.progress.md      ← cold-session handoff (transient) — deleted on promotion
  established/
    <slug>.md             ← as-built (Shape B) — describes the system as it is
```

The same document changes *shape* as it matures: it starts as a decision-log design doc and, once built and confirmed, is **rewritten** as an as-built architecture doc and promoted to `established/` (dropping the `-design` suffix). Get the tier, the filename, and the shape right.

## Metadata is frontmatter

Spec metadata lives in YAML frontmatter, never as inline `**Status:**` lines.

```yaml
---
status: draft        # draft | proposed | in-progress | as-built
created: 2026-06-15
updated: 2026-06-16
scope: bms-ext/backend   # which dirs/repos
context: <context-slug>  # the owning bounded context in the cold layer, when one applies
---
```

The established (Shape B) frontmatter flips `status: as-built` and adds `code-homes:` (the dirs where the code lives).

## Defer vocabulary to the cold layer

This is the load-bearing reconciliation. **A spec does not define its own glossary.** The cold layer is the single source of ubiquitous language; a parallel glossary in the spec would drift — the exact failure lexicon exists to prevent.

- When a spec uses a domain term that's a cold-layer atom, **link it** with the viewer's inline-ref syntax: `[[fqid]]` (e.g. `[[term/route]]`, `[[context/selector/semantic-classifier]]`). The viewer resolves these to the atom; clicking jumps to it. This is the same `[[fqid]]` convention the cold layer uses in its in-memory prose.
- Reference **code** by real symbol in backticks — `` `bms-ext/backend/src/aito_bms_ext/dos/semantic.py::SemanticClassifier` `` — so the viewer can peek it. Confirm the symbol exists and is spelled right before citing it; a stale link is worse than none.
- If the spec needs a term that *isn't* in the cold layer yet, that's a signal: note it for `crystallize` to absorb, rather than defining it locally in the spec.

A reader (human or agent) should be able to jump from any domain term in the spec to the cold-layer atom that owns it, and from any code symbol to the source.

## Two shapes — don't mix them

### Shape A — design doc (active, in `lexicon/specs/`)

A decision log that *argues* the design. Structure:

- **Frontmatter** (above) + a `# Title` and a one-line proposal of what's being built.
- **Motivation** — the problem, concretely, with the pain it removes.
- **Numbered decisions** — `### Decision N — <title>`, each with rationale **and** the alternatives rejected (and *why* rejected). This is the heart of the doc. Link cold-layer atoms with `[[fqid]]` throughout.
- **Phasing** — a table of phases + their gates.
- **Risks / open questions.**
- As the build proceeds, **amend decisions in place** with a short revision note (`> **Revised <date>:** …`) rather than silently editing — the trail of what changed under contact with reality is the point. Running *status* does not go here; it goes in the progress note.

### Shape B — architecture doc (established, in `lexicon/specs/established/`)

Rewritten to describe the system **as it is**, not how it was decided. Structure:

- **Frontmatter** with `status: as-built`, `updated`, `context`, `scope`, `code-homes`.
- **Purpose** — one tight section: what the thing does and the load-bearing properties.
- **Architecture + flow** — at least two **mermaid** diagrams: a component/boundary diagram and a request/decision flow (`flowchart` / `sequenceDiagram`). The viewer renders these.
- **Body sections** linked to real cold-layer atoms (`[[fqid]]`) and code symbols (`` `file::symbol` ``) throughout, so references are clickable and verifiable. No standalone glossary — defer to the cold layer.
- **History** — the design-phase decisions condensed into a short narrative (what was tried, what replaced it), *not* a running revision log.
- **Out of scope / related** — cross-link sibling specs by relative path.

## The progress note (transient — written for a cold session)

**The moment implementation starts, open `lexicon/specs/<slug>.progress.md` and keep all running status there — never in the spec.** The spec stays a design; the progress note absorbs the chronological churn. This separation is what makes the later promotion clean: the spec was never polluted with status, so promoting it is a rewrite of design → as-built, not a cleanup of log entries.

**Audience: a fresh agent session with zero memory of this work, not the user.** Write it as the briefing you'd want if you woke up cold and had to resume in one read. Format it as a **single overwritten snapshot of current state** (not an append-only log — newest-on-top history is noise to a cold reader). Each session edits it in place to reflect *now*. Lead with what's needed to resume:

- **Spec + orientation** — link the design file; one line on what's being built and how far along.
- **Done** — what's actually built and verified, each with the concrete code home (`path::symbol`) and the proof it works (test name, command that passes).
- **Next** — the immediate resume checklist, ordered, specific enough to act on without re-deriving: exact files, the approach already decided, commands to run. Mark anything blocked / needing the live stack.
- **Decisions made mid-build** — choices settled during implementation that aren't in the spec yet, so the cold session doesn't relitigate or contradict them. Note which still need to fold into the design (or `crystallize` into the cold layer).
- **Gotchas** — landmines a fresh session would otherwise step on.

Keep it terse and current — stale entries mislead a cold reader worse than missing ones. Prefer absolute facts (paths, symbols, commands, test counts) over prose. **Delete it on promotion**; it does not live in `established/`.

## Completion pairs with `crystallize`

Promotion needs **explicit user confirmation that the implementation is done** — don't compact or move a spec on your own initiative just because the code looks finished. When the user confirms, the completion moment has **two coordinated outputs at two altitudes**:

1. **`crystallize`** absorbs the vocabulary, invariants, and seams the work introduced into the cold layer (reading the git diff). New terms the spec had to reference get real atoms.
2. **Promote the spec**: compact Shape A → Shape B (a *rewrite* to a state of facts, present tense — not an edit of the log), fold in and **delete** the progress note, then move it to `lexicon/specs/established/<slug>.md` in the shared artifact worktree (drop the `-design` suffix) and fix every cross-link. Use `git mv` only when the artifact is tracked; use an ordinary filesystem move when Lexicon is intentionally ignored or untracked.

The established spec then links into the freshly-crystallized atoms via `[[fqid]]`, so the two artifacts reinforce each other: the cold layer holds the vocabulary; the spec holds the narrative that uses it.

Only promote when the design is genuinely as-built. A spec that's still a problem statement or unbuilt proposal **stays** in `lexicon/specs/` with its `-design` name, even if work around it lands.

## Style

- **Soft-wrap.** Never hard-wrap prose to a column — one paragraph is one line.
- **Decisive and dense.** State the design; don't hedge or survey options you won't take. Recommend, don't enumerate.
- **Tables** for phase boards and trade-off comparisons. **Mermaid** for anything structural — boundaries, flows, state.
- **Cross-link** related specs by relative path, cold-layer atoms by `[[fqid]]`, code by `` `file::symbol` ``.

## Quick checklist

- New design? → `lexicon/specs/<slug>-design.md`, YAML frontmatter, Shape A, numbered decisions with alternatives-rejected, cold-layer terms linked via `[[fqid]]`.
- Implementation starts? → open `lexicon/specs/<slug>.progress.md` as a live cold-session snapshot (Done / Next / decisions / gotchas, overwritten in place — not a log); the spec stays a design.
- User confirms it's done? → run `crystallize` to absorb vocab/invariants, then promote in the shared artifact worktree: rewrite Shape A → Shape B (state of facts, mermaid + History, atoms linked), delete the progress note, move it to `lexicon/specs/established/<slug>.md` (`git mv` only if tracked), fix cross-links.
- Always: defer vocabulary to the cold layer, soft-wrap, decisive prose, link to real atoms and symbols.
