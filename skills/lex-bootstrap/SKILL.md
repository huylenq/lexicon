---
name: lex-bootstrap
description: "Run once at adoption time, when a project is being set up to use lexicon for the first time. Trigger when the user says 'set up lexicon', 'adopt lexicon', 'bootstrap lexicon', 'migrate to lexicon', or when lex-ground finds no lexicon/system.md and the project has substantive existing docs (ARCHITECTURE.md, RFCs, ADR folders) or non-trivial code. Reads existing docs and code, drafts a first-cut system.md, migrates ADR-shaped content, then interviews the user batch-style to resolve TODOs, drift flags, and inconsistencies before producing the final triage list. Read lex-overview first."
---

# Lexicon: bootstrap

This skill prepares a project for lexicon. It is the **one-shot** counterpart to the per-session/per-feature operational skills — run it once at adoption, then never again on the same project.

If you haven't loaded `lex-overview` yet this session, read it first.

## When to run this

Run when:

- The user says they want to adopt lexicon for this project ("set up lexicon", "bootstrap lexicon", "migrate to lexicon", "adopt the lexicon workflow").
- `lex-ground` fires on a project with no `lexicon/system.md` and surfaces "this project should bootstrap first".
- The user is starting a new project and wants the lexicon structure in place from day one (in this case, the doc-audit phases mostly no-op — that's fine).

Don't run when:

- A `lexicon/system.md` already exists and is current — that's not bootstrap, that's `lex-audit` (sanity check) territory.
- A `lexicon/system.md` exists but seems out of date — also `lex-audit`, not this skill. Re-bootstrapping over a real `system.md` would clobber human-curated content. Refuse.
- The project is a throwaway script or single-file prototype — lexicon is not free, and very small projects don't benefit. Surface this honestly: "This project looks small enough that lexicon may be overhead. Want me to bootstrap anyway?"

## Pre-flight checks

Before doing anything destructive, confirm:

1. `lexicon/system.md` does **not** exist. If it does, stop and surface — the user should consider `lex-audit` (when that skill exists) or hand-edit, not re-bootstrap.
2. The user has explicitly opted in. This skill creates a `lexicon/` structure and writes a draft `system.md`. Don't run it speculatively.
3. The repo is in a clean-ish git state, or the user accepts that bootstrap will create unstaged changes. If the working tree has a lot of uncommitted churn, surface it: "Bootstrap will add a `lexicon/` tree and possibly move ADR-shaped files. You have N uncommitted files — want to commit those first, or proceed?"

## Phase 1 — Audit existing docs

Walk the repo for documentation surface area. Look in (these are conventional locations; adapt to what's actually there):

- `docs/`, `doc/`, `documentation/`
- `ARCHITECTURE.md`, `DESIGN.md`, `OVERVIEW.md`, `CONCEPTS.md` at repo root
- `decisions/`, `adr/`, `docs/adr/`, `rfcs/`
- `wiki/`, `notes/`, `internal/`
- `README.md` (skim, but don't migrate — READMEs are reference, not cold-layer)
- Design-system docs: `DESIGN_SYSTEM.md`, `design-tokens.md`, brand/style guides, accessibility guidelines, Storybook MDX docs, Figma-export READMEs

Bucket every file you find:

| Bucket | Cue | Where it goes |
|---|---|---|
| **Cold-layer candidate** | Glossary fragments, "principles", architectural invariants, "why X over Y" reasoning, conceptual model descriptions | Distillation source for `system.md` |
| **ADR-like** | "We chose X because Y" prose, decision records, RFCs with a clear decision | Migrate to `lexicon/decisions/` (Phase 6) |
| **Hot/feature docs** | Active feature specs, in-flight plans, "next quarter" docs | Move to `lexicon/plans/<feature>/` if active, `lexicon/plans/_archive/` if done |
| **Reference / runbook** | API docs, deployment guides, onboarding, "how to run X" | **Leave alone.** Not lexicon's domain. Don't touch. |
| **Stale** | "TODO: clean up" from years ago, abandoned drafts | Surface for the user to decide. Don't auto-delete. |

Produce the bucketed list as part of the triage report (Phase 8). Don't move files yet.

## Phase 2 — Audit the codebase

Without trying to be exhaustive, surface the project's structural shape:

- **Top-level modules / packages** — the directory layout usually reveals provisional bounded contexts.
- **High-frequency identifiers** — class, type, struct, and top-level function names that appear across many files. These are glossary candidates.
- **Public surface** — exported types, public APIs, entrypoints. The vocabulary at this surface tends to be the most load-bearing.
- **Cross-module dependencies** — which modules import which. Hints at whether the seams are clean (low cross-talk) or already tangled (lots of cross-talk).
- **Design-system surface** (UI projects only): theme/token files (`tailwind.config.{js,ts}`, `theme.{css,ts}`, `tokens/`, `*.tokens.{json,css}`, CSS custom-property declarations, or framework equivalents — Flutter `ThemeData`, SwiftUI `Color` extensions, Compose `MaterialTheme`, terminal `colors.json`, etc.); component library directories (`components/`, `ui/`, `design-system/`, `widgets/`, framework equivalents); rendering/preview tooling (`.storybook/`, MDX/Ladle/Histoire configs); a11y tooling (`eslint-plugin-jsx-a11y`, `axe-core`, `jest-axe`, Storybook a11y addon, Playwright a11y, platform-native equivalents). Absence of all these means the project is backend-only — skip the design-system parts of later phases.
- **Surfaces & regions** (UI projects only): top-level surface registry — route definitions (React Router, Next.js `app/`, SvelteKit `routes/`, Flutter `Navigator`, SwiftUI `NavigationStack`), screen/window managers, TUI screen IDs, print-layout templates. Inside each surface, scan the rendered tree for **named regions** that are *not* extracted into their own component file: `{/* Name */}`-style comments preceding inline blocks (a strong author-intent signal), semantic containers (`<aside>` / `<main>` / `<header>` / `<dialog>` / framework equivalents like SwiftUI `Sidebar`/`ToolbarItem` / Flutter `Drawer`/`AppBar`), inline-defined sub-components rendering self-contained pieces, and repeated visual clusters (banner / chip / badge patterns appearing 3+ times across files). Cross-reference with the route component file to identify candidate region names and their inline `<file>:<lineStart>–<lineEnd>` ranges.

Use whatever tools fit (rg, ast-grep, ctags, the project's language tooling). Don't over-invest — a 30-minute scan that surfaces 80% of the structure is the right depth. Deep static analysis is out of scope; that's the user's job during distillation.

## Phase 3 — Cross-reference doc vocabulary against code

This is the **highest-signal extraction zone**, the thing `lex-ground`'s old code-only bootstrap couldn't do. For each candidate term collected from docs (Phase 1) and code (Phase 2):

- **In docs AND code, used consistently** → strong glossary candidate. Real ubiquitous-language territory.
- **In docs only** → drift. Either the term was renamed in code, or the doc describes a concept that's not actually implemented. Flag for the triage report; don't auto-add to glossary.
- **In code only** → either too low-level to glossary (most internal class names), or genuine domain vocabulary the docs missed. Apply judgment: if the term appears in public API or in many files, it's probably a real concept. If it's a single-file utility class, skip it.
- **Inconsistent definitions** — same term used differently in different docs, or in docs vs code. Highest-priority flag for the user — this is exactly the kind of silent drift lexicon exists to surface.

## Phase 4 — Draft `system.md`

Copy `${SKILL_DIR}/templates/system.md.template` (i.e. `templates/system.md.template` next to this `SKILL.md`) to `lexicon/system.md`. Resolve `${SKILL_DIR}` based on install mode: `${CLAUDE_PLUGIN_ROOT}/skills/lex-bootstrap/templates/...` for plugin installs, `~/.claude/skills/lex-bootstrap/templates/...` (or project `.claude/skills/lex-bootstrap/templates/...`) for `npx skills` installs. If neither resolves, fall back to drafting `system.md` from scratch using the structure described in `lex-overview`.

Fill in the draft using the cross-referenced material from Phase 3:

- **Glossary**: only entries with strong evidence (in docs AND code, used consistently). Each entry includes a short definition, drawn from existing doc text where possible. For terms with no clean source, write `<!-- TODO: confirm with user -->`.
- **Invariants**: extract from existing doc prose where it asserts "must", "always", "never". Mark each as `<!-- TODO: confirm still holds -->` — old invariants are often subtly stale.
- **Bounded contexts**: provisional, drawn from top-level module structure. Name them; describe each in one sentence; mark the boundaries between them. Heavily TODO-tagged.
- **Why notes**: extract any "we chose X because" or "this exists because" prose verbatim into a "Rationale" section, with attribution to the source doc.
- **Design system** (only if Phase 2 found design-system signals): fill the `## Design system` section. Reference the canonical token files by path — don't duplicate values. List the high-frequency components (those imported in many places are real vocabulary). Capture interaction-pattern rules from any design docs found. **List the surfaces (top-level screens/views/windows) and the named regions inside each. Tag each region as `*Component*: <import path>` (extracted) or `*Inline*: <file>:<lineStart>–<lineEnd>` (inline JSX/markup with conceptual identity). A region earns an entry whether or not it's been extracted; implementation status is metadata, not a gate. Surface boundaries (route paths, screen IDs) own the regions; cross-cutting visual patterns the team refers to (banner family, chip family, etc.) live as a separate "patterns" subsection.** A11y invariants almost always need `<!-- TODO: confirm with design owner -->` — they're rarely fully writable from code alone. If the project is backend-only, **delete the section** rather than leaving it as TODO scaffolding.

Be honest about what's a guess. The drafted `system.md` should read like an honest first cut, not a confident model. Sections that are mostly TODO are *more useful* than sections that confidently invent content.

If the draft would exceed ~500 lines, **stop and consider Domain Views** (see Phase 4b) before forcing a 500-line `system.md`. Views are the lexicon-supported way to partition the cold layer when one file is genuinely insufficient. Don't ship a 1500-line bootstrapped doc; that's already broken.

## Phase 4b — Decide whether to create Domain Views (optional)

If the project has 3+ substantial bounded contexts each carrying their own self-contained vocabulary and invariants, consider creating Domain Views during bootstrap rather than forcing everything into one `system.md`. Heuristics:

- **Yes, create views** when: bounded contexts have >5 owned terms each; the would-be `system.md` is heading past 500 lines; the project has long architectural history with rich per-context detail.
- **No, stay with one `system.md`** when: contexts are still settling; vocabulary is small; project is small or new. Views are non-breaking — promoting later is a routine refactor.
- **Mixed** is normal: create views for the 2–4 richest contexts; let smaller contexts live as one-paragraph entries in `system.md`'s bounded-contexts index. Not every context needs a view.
- **Design system as a view**: a particularly clean partition when the UI surface is rich (deep token system, large component library, **multiple top-level surfaces with named regions**, formal a11y program). Promote the `## Design system` section to `lexicon/views/design-system.md` and leave a one-line pointer in `system.md`. The view owns tokens, component vocabulary, layout primitives, interaction patterns, **surfaces & regions**, and a11y invariants — same shape as any other view's glossary + invariants.

If creating views: copy `${SKILL_DIR}/templates/view.md.template` to `lexicon/views/<context-slug>.md` for each chosen context. Slim `system.md` to be the holistic index — cross-cutting glossary (terms genuinely owned by no single context), bounded-contexts index pointing at view files, cross-context invariants, cross-context architecture seams, ADR pointers. Each view carries the local glossary, local invariants, internal seams, and scoped ADR pointers.

**Ownership rule**: every term has exactly *one* owning location (one view OR `system.md`'s cross-cutting glossary). Other views may *use* a term but never *redefine* it. The bootstrap is the moment to set this discipline cleanly — once views drift apart with redundant definitions, recovery is painful.

## Phase 5 — Set up the directory structure

Create:

```
lexicon/
  decisions/
  retros/
  audits/
  plans/_archive/
```

Plus `lexicon/views/` if Phase 4b decided to use Domain Views.

Be defensive — if `lexicon/decisions/` already exists from a prior workflow, leave it alone (Phase 6 will populate it). If `lexicon/plans/` exists with non-lexicon content, surface to the user before merging — don't silently restructure their existing plans folder.

## Phase 6 — Migrate ADR-shaped content

For each file from Phase 1's "ADR-like" bucket:

- If it's already in roughly ADR format (context, decision, consequences) → copy to `lexicon/decisions/ADR-<NNNN>-<short-title>.md` with a renumbered ID. Preserve original date in the body.
- If it's prose with embedded decisions → don't try to auto-extract. Add to triage report: "this doc contains decisions but isn't in ADR shape; user should extract manually or leave as reference."
- If it's an RFC with a clear "decision" or "outcome" section → extract the decision portion as an ADR; leave the original RFC alone (often it has discussion value beyond the decision itself).

Use `${SKILL_DIR}/templates/adr.md.template` for the ADR shape if you need to reformat.

ADRs are append-only — once migrated, they stay there. Don't edit existing ADR content for style; just preserve and renumber.

## Phase 7 — Triage suggestions for hot/stale docs

For files in the "hot/feature docs" and "stale" buckets, **do not auto-move**. Instead, recommend in the triage report:

- For active feature docs: "move `docs/feature-X-spec.md` to `lexicon/plans/<feature-X>/spec.md`?"
- For done feature docs: "archive `docs/old-redesign-plan.md` to `lexicon/plans/_archive/old-redesign/`?"
- For stale: "this looks abandoned (last touched 2 years ago, references removed APIs) — archive or delete?"

Auto-moving feature docs is a high-blast-radius action — they may have URLs, links, or be cited elsewhere. Let the user choose.

## Phase 8 — Interactive distillation

The draft `system.md` is on disk but unverified — TODO markers, provisional invariants, guessed contexts. Earlier versions of this skill stopped here and left a triage report telling the user to come back later. In practice, "later" usually never came, and the cold doc started life half-formed.

**Dive into the distillation in the same conversation, by default.** No "want to do this now?" preamble — open with what's about to happen and start. The user can stop at any batch boundary with "pause" / "enough for now" / "save the rest for later", and state-on-pause is preserved.

### Opening

One sentence to frame, then start:

> Drafted system.md has \<N\> TODOs, \<D\> drift flags, and \<I\> inconsistencies. Walking through these now in 5–8 batches — say 'pause' at any batch break to save state and resume later. Starting with inconsistencies, since those are the highest-cost to leave latent.

### Batches, in order

1. **Inconsistencies** (same term, different definitions across docs/code). Present each: "term X is defined as Y in doc A, as Z in doc B, used as W in code. Canonical form? Or genuinely multiple concepts that need distinct names?"
2. **Drift flags** (term in docs, missing or renamed in code). "Doc says X; code uses X'. Dead vocabulary, doc bug, or code bug?"
3. **Glossary TODOs** — section-by-section, 5–10 entries per batch. "Confirm / cull / rewrite (default: confirm)" — but encourage culling. Bootstrap over-includes; the focused distillation is where over-inclusion gets corrected.
4. **Invariant TODOs** — "still holds / revise / remove" per item. When removing, note in conversation whether the invariant *was* real and stopped holding (worth an ADR) or was never real (drift).
5. **Bounded-context TODOs** — bigger questions, expect more per-item conversation. "Does this seam match how you actually think about the system? A and B: one context or two? What owns term X?"
6. **Why-notes / rationale** — confirm attributions, prompt for any "why" notes that weren't recoverable from existing docs but the user can articulate now.
7. **Design-system TODOs** (UI projects only) — token names, component vocabulary, surface/region names, a11y invariants. If the user isn't the design owner, mark items for forwarding rather than guessing.
8. **File moves** — confirm or decline each recommended move from Phase 7. Apply the accepted ones with `git mv` so history is preserved.

### Per-batch flow

1. State what's in the batch in one line ("Glossary TODOs in the Pricing context — 7 entries").
2. Present the items as a compact numbered list, each with the relevant context (source doc, code location, current draft text).
3. Ask for a batch-style response. For confirm/cull/rewrite items, accept abbreviated answers ("1c, 2-3 cull, 4 rewrite: …, 5-7 confirm"). Parse them, ask follow-ups only on the rewrite/free-response items.
4. Apply edits to `lexicon/system.md` (and views, if applicable) in a single Edit call per batch where the shape allows. Larger restructurings can take multiple calls.
5. One-line summary of what changed, then move to the next batch. No long recaps — the diffs are visible.

### Pacing

Don't bulldoze. A glossary batch might be 5 minutes; a bounded-context conversation can be 30+ minutes for a complex system. Let it take what it takes.

If the user gives low-effort answers ("ok", "fine", "sure") across multiple batches, surface it once: "Quick confirms across the last few batches — actually reviewing, or want to pause and come back fresher?" Then accept their answer either way; don't moralize.

### What the user cannot easily punt

Inconsistencies are the highest-value finding. If the user wants to skip them, surface the cost: "These will silently corrupt vocabulary going forward — every retro and ground from now on inherits the ambiguity. Want to push through, or accept that cost?" Push once, then accept their decision and continue.

### State on pause

If the user pauses mid-distillation:

1. Save whatever edits have already been applied (they already are — each batch commits its own edits).
2. Record where we stopped in `lexicon/bootstrap.md`'s "Distillation status" section: which batches completed, which remain, with item counts.
3. Tell the user how to resume: re-trigger lex-bootstrap with "continue distillation" or run `lex-audit` later — both will read `lexicon/bootstrap.md` and pick up the unresolved items.

If lex-bootstrap is re-triggered on a project where `lexicon/system.md` already exists *and* `lexicon/bootstrap.md` shows distillation paused, **do not re-bootstrap** — jump straight to Phase 8 and resume from the recorded position. This is the only legitimate case of re-running lex-bootstrap on a populated project.

## Phase 9 — Write the triage report

Write `lexicon/bootstrap.md` *after* Phase 8 completes (or pauses) — it reflects the post-distillation state, not the raw draft state. Shape:

```markdown
# Bootstrap report
Run on: <iso timestamp>
Distillation status: <complete | paused after batch <N>: <batch name>>

## What was created
- `lexicon/system.md` (<N> lines after distillation; <M> TODOs remaining)
- `lexicon/views/` with <V> Domain Views: <list>  (or "no views; one `system.md` was sufficient")
- `lexicon/decisions/` with <K> ADRs migrated from <sources>
- `lexicon/retros/`, `lexicon/audits/`, `lexicon/plans/_archive/` (empty, ready to populate)

## Doc audit summary
- <N> existing docs scanned across <locations>
- Bucketed: cold-layer-candidates=<N>, adr-like=<N>, hot-feature=<N>, reference=<N>, stale=<N>

## Distillation outcomes
- Inconsistencies: <N total, R resolved, U deferred>
- Drift flags: <N total, R resolved, U deferred>
- Glossary TODOs: <N total, C confirmed, X culled, R rewritten, U remaining>
- Invariant TODOs: <N total, C confirmed, V revised, R removed, U remaining>
- Bounded-context TODOs: <N total, R resolved, U remaining>
- File moves: <N recommended, A accepted (applied via git mv), D declined, U deferred>

## Deferred items (need follow-up)
- <Brief description of each unresolved inconsistency / drift flag / TODO and why it was deferred>
- ...

(If distillation is "complete", this section reads "None.")

## Design system findings (omit if backend-only)
- Token sources detected: <paths to theme/config/tokens files>
- Component library at: <path>
- a11y tooling detected: <list, or "none">
- Surfaces detected: <list of top-level routes / screens / windows>
- Named regions identified: <total count, with breakdown of *Component* vs *Inline*>
- Cross-cutting visual patterns (3+ repetitions): <list — banner family, chip family, etc.>
- Drafted into: <`system.md` § Design system | `lexicon/views/design-system.md`>
- Items pending design-owner forward: <count, list>

## Possibly stale (your call — not addressed in distillation)
- `docs/<file>` — <reason for suspicion>
- ...

## How to resume (only if distillation paused)
Re-trigger lex-bootstrap with "continue distillation" — it will read this file and pick up where we stopped. Alternatively, `lex-audit` will surface the same deferred items as drift candidates.
```

## Phase 10 — Tell the user

One-line chat summary, distillation-aware:

> Bootstrap complete. system.md is at <N> lines with <M> TODOs remaining after distillation (started from <M0>). Migrated <K> ADRs, applied <A> file moves. Report at `lexicon/bootstrap.md`.

If distillation paused:

> Bootstrap paused after the <batch-name> batch. system.md has <N> lines, <M> TODOs remaining, plus <U> deferred inconsistencies/drift flags. Report at `lexicon/bootstrap.md` — resume by re-triggering lex-bootstrap with "continue distillation".

Don't dump the report content into chat. The file is the artifact; chat is the pointer.

## What this skill is NOT

- **Not a single mechanical pass.** It produces a draft *and runs the distillation interview to resolve it.* The interview is part of the skill, not homework — unless the user explicitly pauses or punts it, in which case the deferred items are recorded so a follow-up run can pick them up.
- **Not a periodic refresh.** For projects already on lexicon where `system.md` is drifting, that's `lex-audit` territory. Re-running bootstrap on a populated `system.md` is only legitimate when `lexicon/bootstrap.md` shows distillation paused and the user wants to resume.
- **Not a documentation generator.** It extracts and structures what's already there, then asks the user to resolve what's ambiguous. It doesn't invent content — TODO markers (and the interview that resolves them) are honest signals, not failures.

## On honesty about the draft

During Phase 4, **calibrated TODO markers** matter more than confident-looking content. A 20-TODO honest draft going into Phase 8 is far more useful than a 0-TODO draft that invents invariants — the interview can resolve TODOs but can't unwrite false confidence. If you're tempted to "complete" something during drafting rather than mark it TODO, resist; the user can fill in real content during distillation, you can only fill in plausible-looking content.

During Phase 8, the inverse discipline applies: **don't let TODOs survive the interview without a reason.** If the user is engaged and a TODO has clear information available, get it resolved. The point of running the interview in-session is that "later" usually never comes.
