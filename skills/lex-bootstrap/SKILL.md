---
name: lex-bootstrap
description: "Run once at adoption time, when a project is being set up to use lexicon for the first time. Trigger when the user says 'set up lexicon', 'adopt lexicon', 'bootstrap lexicon', 'migrate to lexicon', or when lex-ground finds no lexicon/system.yaml and the project has substantive existing docs (ARCHITECTURE.md, RFCs, ADR folders) or non-trivial code. Reads existing docs and code, emits a first-cut set of cold-layer YAML files per the schema in lex-overview, migrates ADR-shaped content into YAML, then interviews the user one decision at a time to resolve gaps and inconsistencies before producing the final triage list. Read lex-overview first."
---

# Lexicon: bootstrap

This skill prepares a project for lexicon. It is the **one-shot** counterpart to the per-session/per-feature operational skills — run it once at adoption, then never again on the same project.

If you haven't loaded `lex-overview` yet this session, read it first. The schema you emit here is specified there.

## When to run this

Run when:

- The user says they want to adopt lexicon for this project ("set up lexicon", "bootstrap lexicon", "migrate to lexicon", "adopt the lexicon workflow").
- `lex-ground` fires on a project with no `lexicon/system.yaml` and surfaces "this project should bootstrap first".
- The user is starting a new project and wants the lexicon structure in place from day one (in this case, the doc-audit phases mostly no-op — that's fine).

Don't run when:

- A `lexicon/system.yaml` already exists and is current — that's not bootstrap, that's `lex-audit` territory.
- A `lexicon/system.yaml` exists but seems out of date — also `lex-audit`, not this skill. Re-bootstrapping over a real `system.yaml` would clobber human-curated content. Refuse.
- A `lexicon/system.md` exists — the project is on the v0.x markdown layout. Refer to `lex-migrate` first, then re-evaluate.
- The project is a throwaway script or single-file prototype — lexicon is not free, and very small projects don't benefit. Surface this honestly: "This project looks small enough that lexicon may be overhead. Want me to bootstrap anyway?"

## Pre-flight checks

Before doing anything destructive, confirm:

1. `lexicon/system.yaml` does **not** exist. If it does, stop and surface — the user should consider `lex-audit` (when that skill exists) or hand-edit, not re-bootstrap.
2. `lexicon/system.md` does **not** exist. If it does, route to `lex-migrate` first.
3. The user has explicitly opted in. This skill creates a `lexicon/` structure and writes YAML files. Don't run it speculatively.
4. The repo is in a clean-ish git state, or the user accepts that bootstrap will create unstaged changes. If the working tree has a lot of uncommitted churn, surface it: "Bootstrap will add a `lexicon/` tree and possibly move ADR-shaped files. You have N uncommitted files — want to commit those first, or proceed?"

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
| **Cold-layer candidate** | Glossary fragments, "principles", architectural invariants, "why X over Y" reasoning, conceptual model descriptions | Distillation source for `system.yaml` and `contexts/<slug>.yaml` |
| **ADR-like** | "We chose X because Y" prose, decision records, RFCs with a clear decision | Migrate to `lexicon/decisions/ADR-<NNNN>-<slug>.yaml` (Phase 6) |
| **Hot/feature docs** | Active feature specs, in-flight plans, "next quarter" docs | Move to `lexicon/plans/<feature>/` if active, `lexicon/plans/_archive/` if done |
| **Reference / runbook** | API docs, deployment guides, onboarding, "how to run X" | **Leave alone.** Not lexicon's domain. Don't touch. |
| **Stale** | "TODO: clean up" from years ago, abandoned drafts | Surface for the user to decide. Don't auto-delete. |

Produce the bucketed list as part of the triage report (Phase 9). Don't move files yet.

## Phase 2 — Audit the codebase

Without trying to be exhaustive, surface the project's structural shape:

- **Top-level modules / packages** — the directory layout usually reveals provisional bounded contexts. Each will become a candidate `contexts/<slug>.yaml`, with the directory globs going into the `modules:` field.
- **High-frequency identifiers** — class, type, struct, and top-level function names that appear across many files. These are glossary candidates; their file paths become the `symbols` code anchors.
- **Public surface** — exported types, public APIs, entrypoints. The vocabulary at this surface tends to be the most load-bearing.
- **Cross-module dependencies** — which modules import which. Hints at whether the seams are clean (low cross-talk) or already tangled (lots of cross-talk).
- **UI detection** — before doing the UI-specific scans below, decide whether this project has a UI at all. The question is **judgment, not a checklist**: *does this code put anything in front of a human?* Weigh whatever signal you can find — rendering-purpose files (JSX/TSX, Vue/Svelte components, SwiftUI `View`, `@Composable`, Flutter `Widget`, HTML templates, any CSS/SCSS at all), screenshots in the repo, README prose describing what the user sees, dependency lists naming rendering libraries (React, Vue, lit, `ink`, `rich`, `bubbletea`, …), file/dir names containing `view`/`screen`/`window`/`panel`/`widget`/`component`. Any one of these usually settles it. **Host-embedded UIs are the most common false negative**: Obsidian plugins, VS Code extensions, Figma plugins, browser extensions, Logseq plugins typically inherit tokens, theming, and surface registration from the host — so absence of `tailwind.config`, your own `routes/`, or Storybook does **not** mean backend-only. If there's a rendered tree at all (React/Vue/Svelte/native/template), there's a UI. If the project is genuinely UI-free (pure library, server with no rendered surface, CLI that only emits structured data), skip the next two bullets and the design-system parts of later phases. Edge case: a CLI that invests in layout (colored output, tables, prompts via `ink`/`rich`/`bubbletea` or hand-rolled ANSI) counts as a UI; one that just dumps JSON doesn't. Don't enumerate frameworks looking for membership in a known list — the list always leaks; ask what the code is *for*.
- **Design-system surface** (only if UI detection said yes): look for theme/token files (`tailwind.config.{js,ts}`, `theme.{css,ts}`, `tokens/`, `*.tokens.{json,css}`, CSS custom-property declarations, or framework equivalents); component library directories (`components/`, `ui/`, `design-system/`, `widgets/`, framework equivalents); rendering/preview tooling (`.storybook/`, MDX/Ladle/Histoire configs); a11y tooling (`eslint-plugin-jsx-a11y`, `axe-core`, `jest-axe`, Storybook a11y addon, Playwright a11y, platform-native equivalents). These examples are eye-prompts for finding signal, not gates — host-embedded UIs may have none yet still need a real design-system surface (it inherits the host's tokens and registers surfaces through the host's API, but its own region/component vocabulary still belongs in the cold layer).
- **Surfaces & regions** (only if UI detection said yes): the top-level surface registry. Ask *"what does the user navigate between?"* — that's the surface list, regardless of how the surfaces are wired. Look for route definitions (React Router, Next.js `app/`, SvelteKit `routes/`, Flutter `Navigator`, SwiftUI `NavigationStack`), screen/window managers, TUI screen IDs, print-layout templates, or **host-embedded view registrations** (Obsidian `ItemView`, VS Code `WebviewViewProvider`/`TreeDataProvider`, browser-extension panel registrations) when the host owns navigation. Inside each surface, scan the rendered tree for **named regions** that are *not* extracted into their own component file: `{/* Name */}`-style comments preceding inline blocks (a strong author-intent signal), semantic containers (`<aside>` / `<main>` / `<header>` / `<dialog>`), inline-defined sub-components rendering self-contained pieces, and repeated visual clusters appearing 3+ times across files. Cross-reference with the surface's entry-point file to identify candidate region names and their inline `<file>:<lineStart>–<lineEnd>` ranges.

Use whatever tools fit (rg, ast-grep, ctags, the project's language tooling). Don't over-invest — a 30-minute scan that surfaces 80% of the structure is the right depth. Deep static analysis is out of scope; that's the user's job during distillation.

## Phase 3 — Cross-reference doc vocabulary against code

This is the **highest-signal extraction zone**. For each candidate term collected from docs (Phase 1) and code (Phase 2):

- **In docs AND code, used consistently** → strong glossary candidate. Real ubiquitous-language territory. The code references become the term's `symbols` anchors.
- **In docs only** → drift. Either the term was renamed in code, or the doc describes a concept that's not actually implemented. **Don't add to the YAML.** Flag for the triage report.
- **In code only** → either too low-level to glossary (most internal class names), or genuine domain vocabulary the docs missed. Apply judgment: if the term appears in public API or in many files, it's probably a real concept. If it's a single-file utility class, skip it.
- **Inconsistent definitions** — same term used differently in different docs, or in docs vs code. Highest-priority flag for the user — this is exactly the kind of silent drift lexicon exists to surface. Don't pick a definition unilaterally; defer to Phase 8.

## Phase 4 — Emit the draft cold-layer YAML

This is where structured-format discipline matters. **Don't fabricate entries**: every entity that ends up in the YAML must have evidence from Phase 3. Gaps go to the triage report (Phase 9), not into the cold-layer files as placeholder content.

### ID minting

- **Slugs** are kebab-case, derived from the display name (`Worker Pool` → `worker-pool`). Strip articles, lowercase, hyphenate.
- **Uniqueness** is scoped to the owning file. Two contexts can each own a slug `worker` — they're qualified as `inference/worker` vs `billing/worker` when referenced from outside.
- **Collisions inside one file** are illegal. If two concepts genuinely share a slug, distinguish them (`worker-runtime`, `worker-domain`).
- **Stability** matters. The slug is the handle other entries reference. If you're unsure between two slug forms, pick the one most likely to still describe the concept a year from now.

### Bounded contexts first

Decide which provisional bounded contexts the project has. Each context becomes:

- A one-line entry in `system.yaml`'s `contexts:` list.
- A file at `lexicon/contexts/<slug>.yaml` *if* it owns ≥3 entries (terms/invariants/seams/rules combined). Small contexts stay as the index line only.

Use top-level module structure as the starting point, but don't be mechanical about it — a single module might host two contexts, or two modules might be one context. Apply judgment.

### Fill the YAML

Reference `${SKILL_DIR}/templates/*.yaml.example` next to this `SKILL.md` for shape. Resolve `${SKILL_DIR}` based on install mode: `${CLAUDE_PLUGIN_ROOT}/skills/lex-bootstrap/templates/...` for plugin installs, `~/.claude/skills/lex-bootstrap/templates/...` (or project `.claude/skills/lex-bootstrap/templates/...`) for `npx skills` installs. The normative schema spec is `SCHEMA.md` inside the `lex-overview` skill folder (loaded as part of the overview); the examples here are illustrative.

For each evidence-backed entry:

- **Glossary terms** — only entries with strong evidence (in docs AND code, used consistently). Each entry includes a short `definition` drawn from existing doc text where possible. Add `symbols:` anchors for the code locations found in Phase 2. Add `disambiguatesFrom:` when Phase 3 surfaced an explicit "X is not Y" passage.
- **Invariants** — extract from existing doc prose where it asserts "must", "always", "never". Each entry has a `statement` and a `rationale`. Set `validationMode` honestly: `code` if a literal code check could verify it; `linter` if existing tooling (ESLint, axe-core, etc.) catches it; `principle` if it's abstract enough that no automation can verify. Add `constrainsCode:` anchors when the doc names specific files/modules the invariant binds.
- **Bounded contexts** — `purpose:` is a one-paragraph description drawn from existing doc or inferred from the module's public surface. `modules:` lists the directory globs.
- **Boundary rules** — extract from prose where docs assert directed rules ("the inference context never writes to the training store"). `from:` and `to:` are context slugs.
- **Cross-cutting terms / invariants** in `system.yaml` only for entries spanning ≥3 contexts. Two-context terms stay in one of the contexts (whichever owns the concept more strongly), with the other context referencing.
- **Design system** (UI projects only): emit a `lexicon/surfaces/<slug>.yaml` per top-level surface, listing regions found in Phase 2. Tag each region's `implementation` as `kind: component` (with `import` path) when the region has its own component file, or `kind: inline` (with `file`, `lineStart`, `lineEnd`) when the region is an inline block with conceptual identity. Tokens and components themselves are bounded-context entries — either their own `contexts/design-system.yaml` if the surface is rich, or cross-cutting entries in `system.yaml` for small projects.

Be honest about what's a guess. The drafted YAML should read like an honest first cut, not a confident model. **Empty sections are more useful than fabricated content** — they're trivially populated during distillation; fake content has to be unwound first. Don't add `TODO:` placeholder strings into prose fields — leave the entire entry out and list the gap in the triage report instead.

If the draft `system.yaml` would exceed ~500 lines, partition into more per-context files until it fits.

## Phase 5 — Set up the directory structure

Create:

```
lexicon/
  contexts/
  decisions/
  surfaces/                    ← only if UI was detected
  retros/
  audits/
  plans/_archive/
```

Be defensive — if `lexicon/decisions/` already exists from a prior workflow, leave it alone (Phase 6 will add to it). If `lexicon/plans/` exists with non-lexicon content, surface to the user before merging — don't silently restructure their existing plans folder.

## Phase 6 — Migrate ADR-shaped content

For each file from Phase 1's "ADR-like" bucket:

- **Already in roughly ADR format** (context, decision, consequences) → emit a YAML file at `lexicon/decisions/ADR-<NNNN>-<slug>.yaml`. Renumber sequentially starting at 0001. Preserve original date as the `date:` field. Map the markdown sections to `context:`, `decision:`, `consequences:`, `alternatives:` fields (multi-line literals). `status:` is `accepted` unless the original explicitly marks it as proposed or superseded.
- **Prose with embedded decisions** → don't try to auto-extract. Add to triage report: "this doc contains decisions but isn't in ADR shape; user should extract manually during distillation or leave as reference."
- **RFC with a clear "decision" / "outcome" section** → extract the decision portion as an ADR; leave the original RFC alone (often it has discussion value beyond the decision itself).

Set `affects:` only when the original doc explicitly names which terms/invariants/contexts the decision touches. Don't guess; missing `affects:` is fine — the user can add it during distillation.

If a supersession relationship is obvious from the source (one ADR explicitly supersedes another), set `supersedes:` on the newer one **and** `supersededBy:` on the older one. Both directions must be set.

ADRs are append-only — once migrated, they stay there. Don't edit existing ADR content for style; just preserve and renumber.

## Phase 7 — Triage suggestions for hot/stale docs

For files in the "hot/feature docs" and "stale" buckets, **do not auto-move**. Instead, recommend in the triage report:

- For active feature docs: "move `docs/feature-X-spec.md` to `lexicon/plans/<feature-X>/spec.md`?"
- For done feature docs: "archive `docs/old-redesign-plan.md` to `lexicon/plans/_archive/old-redesign/`?"
- For stale: "this looks abandoned (last touched 2 years ago, references removed APIs) — archive or delete?"

Auto-moving feature docs is a high-blast-radius action — they may have URLs, links, or be cited elsewhere. Let the user choose.

## Phase 8 — Interactive distillation (one decision at a time)

The drafted YAML is on disk but unverified — gaps from Phase 3, drift flags, inconsistencies, unresolved ADR `affects` fields. Earlier versions of this skill stopped here and left a triage report telling the user to come back later. In practice, "later" usually never came.

**Dive into the distillation in the same conversation, by default.** No "want to do this now?" preamble — open with what's about to happen and start. The user can stop at any item boundary with "pause" / "enough for now" / "save the rest for later", and state-on-pause is preserved.

### The non-negotiable rule: one decision per turn

**Never bundle multiple distillation decisions into a single message.** No "Batch 1 of 4" framing. No "answer with shortcodes like 1A 2Y 3B 4C." Each decision is its own conversational turn — present one item, ask one question, wait, apply the edit, then move to the next. The point of running the interview in-session is that the user actually thinks about each item; multi-decision shortcodes optimize for *speed of agent throughput*, not *quality of cold-layer doc*. Speed defeats the purpose.

This rule overrides any temptation to "be efficient." Even when several items look trivial, one-at-a-time pacing surfaces follow-up nuances ("oh, while we're on that, also…") that disappear under bulk-confirm syntax.

### Opening

One sentence to frame, then start with the first item:

> Bootstrap emitted <N> entities across <F> YAML files. Triage queue has <I> inconsistencies, <D> drift flags, and <G> evidence gaps where doc content suggested an entry but evidence was weak. Walking through them one at a time — say 'pause' at any point. Starting with inconsistencies, since those are the highest-cost to leave latent.

Then go directly into item 1. No table-of-contents preview of upcoming items.

### Queue order

1. **Inconsistencies** (same term defined differently across docs/code) — highest priority because they corrupt vocabulary downstream.
2. **Drift flags** (term in docs, missing or renamed in code).
3. **Evidence gaps** (doc content described an entity, but evidence wasn't strong enough to emit) — one entry at a time. Encourage culling; bootstrap was deliberately conservative, but some gaps are real terms the user can confirm.
4. **Unresolved invariants** — note in conversation whether a removed invariant *was* real and stopped holding (worth an ADR) or was never real (drift).
5. **Bounded-context gaps** — these often take the most conversation per item; that's expected.
6. **ADR `affects:` fields** — for each migrated ADR, confirm or fill which entities it touches.
7. **Design-system gaps** (UI projects only) — token names, component vocabulary, surface/region names, a11y invariants. Mark for forwarding if the user isn't the design owner.
8. **File moves** — confirm or decline each recommended move from Phase 7. Apply accepted ones with `git mv`.

### Per-item flow

For each item, in this order:

1. **State the item** in one line — what category it's from, what the current draft says (or doesn't), the source(s).
2. **Give just enough context** to decide — the conflicting definitions, the code reference, the candidate fix. 2–4 short lines is usually right. Don't preview the next item.
3. **Ask one question.** For glossary entries: "add / cull / rewrite?" For invariants: "still holds / revise / drop?" For inconsistencies: "canonical definition? or distinct concepts?" Free-form answers welcome.
4. **Wait for the user's answer.** Do not present a second item in the same message.
5. **Apply the edit** to the appropriate YAML file. Single Edit call per item where possible. Typed mutations only — don't rewrite whole files.
6. **One-line confirmation** of what changed, then move to the next item *in a new turn*.

### Anti-patterns to avoid

- ❌ "Here are 4 batches, answer with shortcodes 1A 2Y…" — this is the failure mode this rule fixes.
- ❌ "Quick confirms on items 1–5 since they're all similar?" — even similar items deserve individual attention.
- ❌ Listing several upcoming items as a preview — encourages the user to pre-decide without engaging.
- ✅ One item, one ask, one answer, one edit, then ask the next.

### Pacing

Don't bulldoze. A simple glossary entry might be 30 seconds; a bounded-context decision can be 15+ minutes for a complex system. Let each item take what it takes.

If the user gives genuinely low-effort answers ("ok", "fine", "sure") across many items in a row, surface it once: "These have been quick confirms — actually reviewing, or want to pause and come back fresher?" Then accept their answer either way; don't moralize.

### What the user cannot easily punt

Inconsistencies are the highest-value finding. If the user wants to skip one, surface the cost: "Leaving this ambiguous will silently corrupt vocabulary going forward — every retro and ground from now on inherits it. Push through, or accept that cost?" Push once per inconsistency, then accept their decision and move to the next item.

### State on pause

If the user pauses mid-distillation:

1. Whatever edits have already been applied (they already are — each item commits its own edit).
2. Record where we stopped in `lexicon/bootstrap.md`'s "Distillation status" section: how many items in each category were resolved vs. remain, plus a one-line note on the next pending item.
3. Tell the user how to resume: re-trigger lex-bootstrap with "continue distillation" or run `lex-audit` later — both will read `lexicon/bootstrap.md` and pick up the unresolved items.

If lex-bootstrap is re-triggered on a project where `lexicon/system.yaml` already exists *and* `lexicon/bootstrap.md` shows distillation paused, **do not re-bootstrap** — jump straight to Phase 8 and resume from the recorded position, still one item at a time. This is the only legitimate case of re-running lex-bootstrap on a populated project.

## Phase 9 — Write the triage report

Write `lexicon/bootstrap.md` *after* Phase 8 completes (or pauses) — it reflects the post-distillation state. The report is markdown (human-facing), not YAML. Shape:

```markdown
# Bootstrap report
Run on: <iso timestamp>
Distillation status: <complete | paused mid-<category>: <N> of <T> items resolved, next pending: "<one-line description>">

## What was created
- `lexicon/system.yaml` (<N> cross-cutting entries, <C> contexts indexed)
- `lexicon/contexts/` with <K> context files: <list>
- `lexicon/decisions/` with <A> ADRs migrated from <sources>
- `lexicon/surfaces/` with <S> surface files (or "no UI surfaces; backend-only")
- `lexicon/retros/`, `lexicon/audits/`, `lexicon/plans/_archive/` (empty, ready to populate)

## Doc audit summary
- <N> existing docs scanned across <locations>
- Bucketed: cold-layer-candidates=<N>, adr-like=<N>, hot-feature=<N>, reference=<N>, stale=<N>

## Distillation outcomes
- Inconsistencies: <N total, R resolved, U deferred>
- Drift flags: <N total, R resolved, U deferred>
- Evidence gaps: <N total, A added, C culled, U remaining>
- Unresolved invariants: <N total, C confirmed, V revised, D dropped, U remaining>
- Bounded-context gaps: <N total, R resolved, U remaining>
- ADR `affects:` fields: <N migrated ADRs, F filled, U remaining>
- File moves: <N recommended, A accepted (applied via git mv), D declined, U deferred>

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
Re-trigger lex-bootstrap with "continue distillation" — it will read this file and pick up where we stopped. Alternatively, `lex-audit` will surface the same deferred items as drift candidates.
```

## Phase 10 — Tell the user

One-line chat summary, distillation-aware:

> Bootstrap complete. <N> entities emitted across <F> YAML files; <K> ADRs migrated; <A> file moves applied. Triage report at `lexicon/bootstrap.md`.

If distillation paused:

> Bootstrap paused mid-<category> after resolving <N> items. <E> entities currently emitted, plus <U> deferred. Next pending: "<one-line description>". Report at `lexicon/bootstrap.md` — resume by re-triggering lex-bootstrap with "continue distillation".

Don't dump the report content into chat. The file is the artifact; chat is the pointer.

## What this skill is NOT

- **Not a single mechanical pass.** It produces a draft *and runs the distillation interview to resolve it, one decision per conversational turn.* The interview is part of the skill, not homework — unless the user explicitly pauses or punts it, in which case the deferred items are recorded so a follow-up run can pick them up. Multi-decision batching is explicitly forbidden (see Phase 8).
- **Not a periodic refresh.** For projects already on lexicon where the cold layer is drifting, that's `lex-audit` territory. Re-running bootstrap on a populated `system.yaml` is only legitimate when `lexicon/bootstrap.md` shows distillation paused and the user wants to resume.
- **Not a documentation generator.** It extracts and structures what's already there, then asks the user to resolve what's ambiguous. It doesn't invent content — missing entries are honest signals, not failures.
- **Not a markdown-to-YAML converter.** A project on the v0.x markdown lexicon goes through `lex-migrate` first, then this skill is not needed (the migration produces a valid YAML cold layer).

## On honesty about the draft

During Phase 4, **calibrated emission** matters more than confident-looking content. An emission of 30 evidence-backed entries plus a triage list of 20 gaps is far more useful than 50 entries half-fabricated — the interview can resolve gaps but can't unwrite false confidence. If you're tempted to "complete" a sparse section by inventing entries, resist; the user can fill in real content during distillation, you can only fill in plausible-looking content.

During Phase 8, the inverse discipline applies: **don't let gaps survive the interview without a reason.** If the user is engaged and a gap has clear information available, get it resolved. The point of running the interview in-session is that "later" usually never comes.
