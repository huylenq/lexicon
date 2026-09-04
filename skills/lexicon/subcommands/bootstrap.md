# Subcommand: bootstrap

Prepares a project for lexicon. One-shot counterpart to the per-session subcommands — run once at adoption, then never again on the same project (except to resume a paused distillation).

The normative schema you'll emit here lives in `${CLAUDE_SKILL_DIR}/reference/schema.md`; the canonical XML examples are in `${CLAUDE_SKILL_DIR}/templates/`. Read both before Phase 4.

## When to run this

Run when:

- The user says they want to bootstrap lexicon for this project ("set up lexicon", "bootstrap lexicon", "bootstrap the lexicon workflow").
- `ground` defers here on a project with no `lexicon/system.xml`.
- The user is starting a new project and wants the lexicon structure in place from day one (in this case, the doc-audit phases mostly no-op — that's fine).

Don't run when:

- A `lexicon/system.xml` already exists and is current — that's `validate` territory.
- A `lexicon/system.xml` exists but seems out of date — also `validate`, not this subcommand. Re-running bootstrap over a real `system.xml` would clobber human-curated content. Refuse.
- A `lexicon/system.md` or older YAML `lexicon/system.yaml` exists — the project is on a pre-v1.0 schema. Refer to `validate`'s structural pass first, then re-evaluate.
- The project is a throwaway script or single-file prototype — lexicon is not free. Surface this honestly: *"This project looks small enough that lexicon may be overhead. Want me to bootstrap anyway?"*

## Pre-flight checks

Before doing anything destructive, confirm:

1. `lexicon/system.xml` does **not** exist. If it does, stop and surface — the user should consider `validate` (semantic pass) or hand-edit, not re-bootstrap.
2. `lexicon/system.md` does **not** exist (pre-v0.1 markdown era) and `lexicon/system.yaml` does **not** exist (pre-v1.0 YAML era). If either does, route to `validate`'s structural pass first.
3. The user has explicitly opted in. This subcommand creates a `lexicon/` structure and writes XML files. Don't run it speculatively.
4. The repo is in a clean-ish git state, or the user accepts that adoption will create unstaged changes. If the working tree has a lot of uncommitted churn, surface it.

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
| **Cold-layer candidate** | Glossary fragments, "principles", architectural invariants, "why X over Y" reasoning, conceptual model descriptions | Distillation source for `system.xml` and `contexts/<slug>.xml` |
| **ADR-like** | "We chose X because Y" prose, decision records, RFCs with a clear decision | Absorb into `rationale:` fields on affected atoms (Phase 6); archive the source under `_pre-migrate-archive/decisions/` for reference |
| **Hot/feature docs** | Active feature specs, in-flight plans, "next quarter" docs | Move to `lexicon/plans/<feature>/` if active, `lexicon/plans/_archive/` if done |
| **Reference / runbook** | API docs, deployment guides, onboarding, "how to run X" | **Leave alone.** Not lexicon's domain. Don't touch. |
| **Stale** | "TODO: clean up" from years ago, abandoned drafts | Surface for the user to decide. Don't auto-delete. |

Produce the bucketed list as part of the triage report (Phase 9). Don't move files yet.

## Phase 2 — Audit the codebase

Without trying to be exhaustive, surface the project's structural shape:

- **Top-level modules / packages** — the directory layout usually reveals provisional bounded contexts. Each will become a candidate `contexts/<slug>.xml`, with the directory globs going into the `codeModules:` field.
- **High-frequency identifiers** — class, type, struct, and top-level function names that appear across many files. These are glossary candidates; their file paths become the `symbols` code anchors.
- **Public surface** — exported types, public APIs, entrypoints. The vocabulary at this surface tends to be the most load-bearing.
- **Cross-module dependencies** — which modules import which. Hints at whether the seams are clean (low cross-talk) or already tangled.
- **UI detection** — before doing UI-specific scans, decide whether this project has a UI at all. The question is **judgment, not a checklist**: *does this code put anything in front of a human?* Weigh whatever signal you can find — rendering-purpose files (JSX/TSX, Vue/Svelte components, SwiftUI `View`, `@Composable`, Flutter `Widget`, HTML templates, CSS/SCSS), screenshots in the repo, README prose describing what the user sees, dependency lists naming rendering libraries (React, Vue, lit, `ink`, `rich`, `bubbletea`, …), file/dir names containing `view`/`screen`/`window`/`panel`/`widget`/`component`. Any one of these usually settles it. **Host-embedded UIs are the most common false negative**: Obsidian plugins, VS Code extensions, Figma plugins, browser extensions, Logseq plugins typically inherit tokens, theming, and surface registration from the host — so absence of `tailwind.config`, your own `routes/`, or Storybook does **not** mean backend-only. If there's a rendered tree at all (React/Vue/Svelte/native/template), there's a UI. If the project is genuinely UI-free (pure library, server with no rendered surface, CLI that only emits structured data), skip the next two bullets and the design-system parts of later phases. Edge case: a CLI that invests in layout (colored output, tables, prompts via `ink`/`rich`/`bubbletea` or hand-rolled ANSI) counts as a UI; one that just dumps JSON doesn't. Don't enumerate frameworks looking for membership in a known list — the list always leaks; ask what the code is *for*.
- **Design-system surface** (only if UI detection said yes): look for theme/token files (`tailwind.config.{js,ts}`, `theme.{css,ts}`, `tokens/`, `*.tokens.{json,css}`, CSS custom-property declarations, or framework equivalents); component library directories (`components/`, `ui/`, `design-system/`, `widgets/`, framework equivalents); rendering/preview tooling (`.storybook/`, MDX/Ladle/Histoire configs); a11y tooling (`eslint-plugin-jsx-a11y`, `axe-core`, `jest-axe`, Storybook a11y addon, Playwright a11y, platform-native equivalents). These examples are eye-prompts for finding signal, not gates — host-embedded UIs may have none yet still need a real design-system surface (it inherits the host's tokens and registers surfaces through the host's API, but its own region/component vocabulary still belongs in the cold layer).
- **Surfaces & regions** (only if UI detection said yes): the top-level surface registry. Ask *"what does the user navigate between?"* — that's the surface list, regardless of how the surfaces are wired. Look for route definitions (React Router, Next.js `app/`, SvelteKit `routes/`, Flutter `Navigator`, SwiftUI `NavigationStack`), screen/window managers, TUI screen IDs, print-layout templates, or **host-embedded view registrations** (Obsidian `ItemView`, VS Code `WebviewViewProvider`/`TreeDataProvider`, browser-extension panel registrations) when the host owns navigation. Inside each surface, scan the rendered tree for **named regions** that are *not* extracted into their own component file: `{/* Name */}`-style comments preceding inline blocks (a strong author-intent signal), semantic containers (`<aside>` / `<main>` / `<header>` / `<dialog>`), inline-defined sub-components rendering self-contained pieces, and repeated visual clusters appearing 3+ times across files. Cross-reference with the surface's entry-point file to identify candidate region names and their inline `<file>:<lineStart>–<lineEnd>` ranges.

Use whatever tools fit (rg, ast-grep, ctags, the project's language tooling). Don't over-invest — a 30-minute scan that surfaces 80% of the structure is the right depth. Deep static analysis is out of scope; that's the user's job during distillation.

## Phase 3 — Cross-reference doc vocabulary against code

This is the **highest-signal extraction zone**. For each candidate term collected from docs (Phase 1) and code (Phase 2):

- **In docs AND code, used consistently** → strong glossary candidate. Real ubiquitous-language territory. The code references become the term's `symbols` anchors.
- **In docs only** → drift. Either the term was renamed in code, or the doc describes a concept that's not actually implemented. **Don't add to the XML.** Flag for the triage report.
- **In code only** → either too low-level to glossary (most internal class names), or genuine domain vocabulary the docs missed. Apply judgment: if the term appears in public API or in many files, it's probably a real concept. If it's a single-file utility class, skip it.
- **Inconsistent definitions** — same term used differently in different docs, or in docs vs code. Highest-priority flag for the user — this is exactly the kind of silent drift lexicon exists to surface. Don't pick a definition unilaterally; defer to Phase 8.

## Phase 4 — Emit the draft cold-layer XML

This is where structured-format discipline matters. **Don't fabricate entries**: every entity that ends up in the XML must have evidence from Phase 3. Gaps go to the triage report (Phase 9), not into the cold-layer files as placeholder content.

Reference `${CLAUDE_SKILL_DIR}/templates/*.xml.example` for shape. The normative spec is `${CLAUDE_SKILL_DIR}/reference/schema.md`; examples are illustrative.

### ID minting

- **Slugs** are kebab-case, derived from the display name (`Worker Pool` → `worker-pool`). Strip articles, lowercase, hyphenate.
- **Uniqueness** is scoped to the owning file. Two contexts can each own a slug `worker` — they're qualified as `inference/worker` vs `billing/worker` when referenced from outside.
- **Collisions inside one file** are illegal. If two concepts genuinely share a slug, distinguish them (`worker-runtime`, `worker-domain`).
- **Stability** matters. The slug is the handle other entries reference. If you're unsure between two slug forms, pick the one most likely to still describe the concept a year from now.

### Bounded contexts first

Decide which provisional bounded contexts the project has. Each context becomes:

- A one-line entry in `system.xml`'s `contexts:` list.
- A file at `lexicon/contexts/<slug>.xml` *if* it owns ≥3 entries (terms/invariants/seams/rules combined). Small contexts stay as the index line only.

Use top-level module structure as the starting point, but don't be mechanical about it — a single module might host two contexts, or two modules might be one context. Apply judgment.

### Fill the XML

For each evidence-backed entry:

- **Glossary terms** — only entries with strong evidence (in docs AND code, used consistently). Each `<term>` includes a short `<definition>` drawn from existing doc text where possible. Add `<symbols>` with `<code-anchor>` children for the code locations found in Phase 2. Add `<disambiguates-from>` with `<ref to="..."/>` children when Phase 3 surfaced an explicit "X is not Y" passage.
- **Invariants** — extract from existing doc prose where it asserts "must", "always", "never". Each `<invariant>` has a `<statement>` and a `<rationale>`. Set the `mode=` attribute honestly: `code` if a literal code check could verify it; `linter` if existing tooling catches it; `principle` if it's abstract enough that no automation can verify. Add `<constrains-code>` anchors when the doc names specific files/modules.
- **Bounded contexts** — `<purpose>` is a one-paragraph description drawn from existing doc or inferred from the module's public surface. `<code-modules>` with `<path>` children lists the directory globs. Set the `subdomain=` attribute (core / supporting / generic) when the doc evidence makes it obvious; leave unset otherwise.
- **Boundary rules** — extract from prose where docs assert directed rules ("the inference context never writes to the training store"). `<from>` and `<to>` carry single `<ref to="..."/>` elements pointing at contexts.
- **Shared kernels** in `system.xml` for terms/invariants spanning ≥2 contexts that the contexts genuinely coordinate on (not just happen to use). Each `<shared-kernel>` has a `<name>`, `<participating-contexts>` with `<ref/>` children, a `<rationale>`, and its own `<term>`/`<invariant>` siblings. Two-context terms that are *not* coordinated stay in one of the contexts (whichever owns the concept more strongly), with the other context referencing.
- **Term categories** — set the `category=` attribute (entity / value / service / event / concept) on terms when the doc/code evidence is strong. Leave unset (defaults to `concept`) when uncertain; distillation (Phase 8) is the right place to categorize.
- **Seam kinds** — set the `kind=` attribute on each `<seam>` to one of the Evans context-map kinds when doc/code evidence makes it obvious. Otherwise leave `kind="unknown"` — the seam loads with a warning, and the user classifies during distillation.
- **Design system** (UI projects only): emit a `lexicon/surfaces/<slug>.xml` per top-level surface, listing `<region>` elements found in Phase 2. Tag each region's implementation as `<component-impl import="..." file="..."/>` when the region has its own component file, or `<inline-impl file="..." line-start="..." line-end="..."/>` when the region is an inline block with conceptual identity. Tokens and components themselves are bounded-context entries — either their own `contexts/design-system.xml` if the surface is rich, or cross-cutting entries in `system.xml` for small projects.

Be honest about what's a guess. The drafted XML should read like an honest first cut, not a confident model. **Empty sections are more useful than fabricated content** — they're trivially populated during distillation; fake content has to be unwound first. Don't add `TODO:` placeholder strings into prose elements — leave the entire entry out and list the gap in the triage report instead.

If the draft `system.xml` would exceed ~500 lines, partition into more per-context files until it fits.

## Phase 5 — Set up the directory structure

Create:

```
lexicon/
  contexts/
  surfaces/                    ← only if UI was detected
  plans/_archive/
```

If `lexicon/plans/` exists with non-lexicon content, surface to the user before merging — don't silently restructure their existing plans folder.

## Phase 6 — Absorb ADR-shaped content into rationale fields

v0.3 has no `decisions/` directory. ADR-shaped existing docs are absorbed in two steps:

1. **Archive the source.** Move each ADR-like file into `lexicon/_pre-migrate-archive/decisions/`. The originals are preserved verbatim so the user can recover anything; the archive is not loaded by anything.
2. **Lift content into rationale fields.** For each archived ADR, identify the atom(s) the decision affects:
   - The ADR's "decision" prose typically justifies one of: an invariant, a seam's kind choice, an aggregate's boundary, a boundary rule, a term's category. Propose lifting the decision text as `rationale:` on that atom.
   - "Consequences" usually rolls into the same rationale; quote selectively.
   - "Context" and "Alternatives" are conversational; default to *not* lifting them — they belong in a future development-journal mechanism, which v0.3 deliberately does not have.
3. **Defer interpretive cases.** When a doc contains embedded decisions in unstructured prose, don't auto-extract — add to the triage report for the user to handle during distillation.

If a supersession relationship is obvious from the source (one ADR explicitly supersedes another), log the chain in the triage report so the user knows what they're losing. v0.3 doesn't carry supersession edges in the model — the rationale on the affected atom is the source of truth.

Archived ADRs in `_pre-migrate-archive/decisions/` are append-only references — don't touch them after archival. Rationale lifts go into the cold-layer files; the originals stay frozen.

## Phase 7 — Triage suggestions for hot/stale docs

For files in the "hot/feature docs" and "stale" buckets, **do not auto-move**. Instead, recommend in the triage report:

- For active feature docs: *"move `docs/feature-X-spec.md` to `lexicon/plans/<feature-X>/spec.md`?"*
- For done feature docs: *"archive `docs/old-redesign-plan.md` to `lexicon/plans/_archive/old-redesign/`?"*
- For stale: *"this looks abandoned (last touched 2 years ago, references removed APIs) — archive or delete?"*

Auto-moving feature docs is a high-blast-radius action — they may have URLs, links, or be cited elsewhere. Let the user choose.

## Phase 8 — Interactive distillation (one decision at a time)

The drafted XML is on disk but unverified — gaps from Phase 3, drift flags, inconsistencies, term categorizations not yet picked, seam kinds left at `unknown`. Earlier versions of this subcommand stopped here and left a triage report telling the user to come back later. In practice, "later" usually never came.

**Dive into the distillation in the same conversation, by default.** No "want to do this now?" preamble — open with what's about to happen and start. The user can stop at any item boundary with "pause" / "enough for now" / "save the rest for later", and state-on-pause is preserved.

### The non-negotiable rule: one decision per turn

**Never bundle multiple distillation decisions into a single message.** No "Batch 1 of 4" framing. No "answer with shortcodes like 1A 2Y 3B 4C." Each decision is its own conversational turn — present one item, ask one question, wait, apply the edit, then move to the next. The point of running the interview in-session is that the user actually thinks about each item; multi-decision shortcodes optimize for *speed of agent throughput*, not *quality of cold-layer doc*. Speed defeats the purpose.

This rule overrides any temptation to "be efficient." Even when several items look trivial, one-at-a-time pacing surfaces follow-up nuances ("oh, while we're on that, also…") that disappear under bulk-confirm syntax.

### Opening

One sentence to frame, then start with the first item:

> Bootstrap emitted <N> entities across <F> XML files. Triage queue has <I> inconsistencies, <D> drift flags, and <G> evidence gaps where doc content suggested an entry but evidence was weak. Walking through them one at a time — say 'pause' at any point. Starting with inconsistencies, since those are the highest-cost to leave latent.

Then go directly into item 1. No table-of-contents preview of upcoming items.

### Queue order

1. **Inconsistencies** (same term defined differently across docs/code) — highest priority because they corrupt vocabulary downstream.
2. **Drift flags** (term in docs, missing or renamed in code).
3. **Evidence gaps** — one entry at a time. Encourage culling; bootstrap was deliberately conservative, but some gaps are real terms the user can confirm.
4. **Unresolved invariants** — note in conversation whether a removed invariant *was* real and stopped holding (worth a `rationale:` capturing the historical argument on whatever replaces it) or was never real (drift).
5. **Bounded-context gaps** — these often take the most conversation per item; that's expected.
6. **Pending rationale lifts** — for each archived ADR not yet lifted, confirm which atom should absorb the decision argument (or skip and leave archived).
7. **Seam kinds at `unknown`** — walk each one, ask the user to pick from the Evans context-map enum, and (for asymmetric kinds) which participant is upstream vs. downstream.
8. **Term categories** — for terms not yet categorized, walk through one at a time: entity / value / service / event / concept. Skip is allowed; defaults to concept.
9. **Design-system gaps** (UI projects only) — token names, component vocabulary, surface/region names, a11y invariants. Mark for forwarding if the user isn't the design owner.
10. **File moves** — confirm or decline each recommended move from Phase 7. Apply accepted ones in the shared artifact worktree; use `git mv` only for tracked files and an ordinary filesystem move for intentionally ignored or untracked artifacts.

### Per-item flow

For each item, in this order:

1. **State the item** in one line — what category it's from, what the current draft says (or doesn't), the source(s).
2. **Give just enough context** to decide — the conflicting definitions, the code reference, the candidate fix. 2–4 short lines is usually right. Don't preview the next item.
3. **Ask one question.** For glossary entries: "add / cull / rewrite?" For invariants: "still holds / revise / drop?" For inconsistencies: "canonical definition? or distinct concepts?" Free-form answers welcome.
4. **Wait for the user's answer.** Do not present a second item in the same message.
5. **Apply the edit** to the appropriate XML file. Single Edit call per item where possible. Typed mutations only — don't rewrite whole files.
6. **One-line confirmation** of what changed, then move to the next item *in a new turn*.

### Anti-patterns to avoid

- ❌ "Here are 4 batches, answer with shortcodes 1A 2Y…" — this is the failure mode this rule fixes.
- ❌ "Quick confirms on items 1–5 since they're all similar?" — even similar items deserve individual attention.
- ❌ Listing several upcoming items as a preview — encourages the user to pre-decide without engaging.
- ✅ One item, one ask, one answer, one edit, then ask the next.

### Pacing

Don't bulldoze. A simple glossary entry might be 30 seconds; a bounded-context decision can be 15+ minutes for a complex system. Let each item take what it takes.

If the user gives genuinely low-effort answers ("ok", "fine", "sure") across many items in a row, surface it once: *"These have been quick confirms — actually reviewing, or want to pause and come back fresher?"* Then accept their answer either way; don't moralize.

### What the user cannot easily punt

Inconsistencies are the highest-value finding. If the user wants to skip one, surface the cost: *"Leaving this ambiguous will silently corrupt vocabulary going forward — every ground and crystallize from now on inherits it. Push through, or accept that cost?"* Push once per inconsistency, then accept their decision and move to the next item.

### State on pause

If the user pauses mid-distillation:

1. Whatever edits have already been applied (they already are — each item commits its own edit).
2. Record where we stopped in `lexicon/bootstrap.md`'s "Distillation status" section: how many items in each category were resolved vs. remain, plus a one-line note on the next pending item.
3. Tell the user how to resume: re-trigger `bootstrap` with "continue distillation" or run `validate` later — both will read `lexicon/bootstrap.md` and pick up the unresolved items.

If `bootstrap` is re-triggered on a project where `lexicon/system.xml` already exists *and* `lexicon/bootstrap.md` shows distillation paused, **do not re-bootstrap** — jump straight to Phase 8 and resume from the recorded position, still one item at a time. This is the only legitimate case of re-running bootstrap on a populated project.

## Phase 9 — Write the triage report

Write `lexicon/bootstrap.md` *after* Phase 8 completes (or pauses) — it reflects the post-distillation state. The report is markdown (human-facing), not XML. Shape:

```markdown
# Bootstrap report
Run on: <iso timestamp>
Distillation status: <complete | paused mid-<category>: <N> of <T> items resolved, next pending: "<one-line description>">

## What was created
- `lexicon/system.xml` (<N> cross-cutting entries, <C> contexts indexed)
- `lexicon/contexts/` with <K> context files: <list>
- `lexicon/_pre-migrate-archive/decisions/` with <A> ADRs archived from <sources>; <L> lifted into rationale fields
- `lexicon/surfaces/` with <S> surface files (or "no UI surfaces; backend-only")
- `lexicon/plans/_archive/` (empty, ready to populate)

## Doc audit summary
- <N> existing docs scanned across <locations>
- Bucketed: cold-layer-candidates=<N>, adr-like=<N>, hot-feature=<N>, reference=<N>, stale=<N>

## Distillation outcomes
- Inconsistencies: <N total, R resolved, U deferred>
- Drift flags: <N total, R resolved, U deferred>
- Evidence gaps: <N total, A added, C culled, U remaining>
- Unresolved invariants: <N total, C confirmed, V revised, D dropped, U remaining>
- Bounded-context gaps: <N total, R resolved, U remaining>
- ADR rationale lifts: <N archived ADRs, L lifted into rationale fields, R remaining as archive-only>
- File moves: <N recommended, A accepted (applied; tracked via git mv where applicable), D declined, U deferred>

## Deferred items (need follow-up)
- <Brief description of each unresolved inconsistency / drift flag / gap and why it was deferred>
- ...

(If distillation is "complete", this section reads "None.")

## Design system findings (omit if UI-free)
- Token sources detected: <paths>
- Component library at: <path>
- a11y tooling detected: <list, or "none">
- Surfaces emitted: <list>
- Regions: <total count, with breakdown of *component* vs *inline*>
- Items pending design-owner forward: <count, list>

## Possibly stale (your call — not addressed in distillation)
- `docs/<file>` — <reason for suspicion>
- ...

## How to resume (only if distillation paused)
Re-trigger `bootstrap` with "continue distillation" — it will read this file and pick up where we stopped. Alternatively, `validate` will surface the same deferred items as drift candidates.
```

## Phase 10 — Tell the user

One-line chat summary, distillation-aware:

> Adoption complete. <N> entities emitted across <F> XML files; <K> ADRs archived (<L> lifted into rationale); <A> file moves applied. Triage report at `lexicon/bootstrap.md`.

If distillation paused:

> Adoption paused mid-<category> after resolving <N> items. <E> entities currently emitted, plus <U> deferred. Next pending: "<one-line description>". Report at `lexicon/bootstrap.md` — resume by re-triggering `/lexicon:bootstrap` with "continue distillation".

Don't dump the report content into chat. The file is the artifact; chat is the pointer.

## What this subcommand is NOT

- **Not a single mechanical pass.** It produces a draft *and runs the distillation interview to resolve it, one decision per conversational turn.* The interview is part of the subcommand, not homework — unless the user explicitly pauses or punts it, in which case the deferred items are recorded so a follow-up run can pick them up. Multi-decision batching is explicitly forbidden (see Phase 8).
- **Not a periodic refresh.** For projects already on lexicon where the cold layer is drifting, that's `validate` territory. Re-running bootstrap on a populated `system.xml` is only legitimate when `lexicon/bootstrap.md` shows distillation paused and the user wants to resume.
- **Not a documentation generator.** It extracts and structures what's already there, then asks the user to resolve what's ambiguous. It doesn't invent content — missing entries are honest signals, not failures.
- **Not a format-migration shim.** A project on a pre-v1.0 lexicon (v0.x markdown or v0.1/v0.2/v0.3 YAML) goes through `validate`'s structural pass first, then this subcommand is not needed (the migration produces a valid v1.0 XML cold layer).

## On honesty about the draft

During Phase 4, **calibrated emission** matters more than confident-looking content. An emission of 30 evidence-backed entries plus a triage list of 20 gaps is far more useful than 50 entries half-fabricated — the interview can resolve gaps but can't unwrite false confidence. If you're tempted to "complete" a sparse section by inventing entries, resist; the user can fill in real content during distillation, you can only fill in plausible-looking content.

During Phase 8, the inverse discipline applies: **don't let gaps survive the interview without a reason.** If the user is engaged and a gap has clear information available, get it resolved. The point of running the interview in-session is that "later" usually never comes.
