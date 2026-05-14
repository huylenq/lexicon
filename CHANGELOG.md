# Changelog

All notable changes to lexicon will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html) with the following convention:

- **Major** — the project shape changes (breaks existing `lexicon/` structures).
- **Minor** — skill behavior changes meaningfully (escalation rules, scope of checks, new skills).
- **Patch** — skill description tuning, prose edits, bug fixes in templates.

While in 0.x, breaking project-shape changes bump the minor (0.x.0 → 0.(x+1).0); the major bump is reserved for a stability commitment at 1.0.

## [Unreleased]

### BREAKING

- **Schema v0.2 → v0.3, DDD-faithful shape.** The cold-layer schema is reshaped to follow Eric Evans' Domain-Driven Design building blocks faithfully. The bump is breaking: the viewer's loader fails fast on `schemaVersion: "0.1"` or `"0.2"` files with a `LoadIssue` pointing at `lex-migrate`. The full design rationale, rejected alternatives, and deferred work live in `DESIGN-v0.3.md` at the repo root.

  **Removed**:
  - The `kind: decision` entity (ADRs). ADR YAML files archive under `lexicon/_pre-migrate-archive/decisions/`; their decision-narrative content is optionally lifted into `rationale:` fields on affected atoms. The "decisions" graph lens, the `affects` / `supersedes` edges, the `Decisions` filter chip, and the `decision.yaml.example` template are gone.
  - `crossCuttingTerms` / `crossCuttingInvariants` on `system.yaml`. The untyped bag is replaced with typed `sharedKernels` — named shared sub-models with `participatingContexts`, `rationale`, and their own `terms`/`invariants`. Migration groups existing entries into proposed kernels interactively.
  - The `lexicon/decisions/` directory. v0.3 has no slot for stand-alone decision records; the argument lives next to the thing it argues for (as `rationale:`).

  **Renamed**:
  - `bounded-context.modules` (file globs) → `codeModules`. The freed `modules` name now holds Evans-sense concept clusters (array of `{id, name, description, members, rationale}`).

  **Added**:
  - `term.category` discriminator — `entity` | `value` | `service` | `event` | `concept`. Each category surfaces category-specific optional fields: `identityRule` for entities; `equality` for values; `operatesOn` + `returns` for services; `emittedWhen` + `payload` + `consumers` for events.
  - `kind: aggregate` (inside `bounded-context`) — Evans aggregates with `root`, `members`, transactional `invariants`, `rationale`. Loader validates root is an entity-category term.
  - `kind: module` (inside `bounded-context`) — Evans-sense concept clusters; distinct from `codeModules` (file globs). The viewer renders them as their own panel.
  - `kind: shared-kernel` (on `system`) — first-class entity for named shared sub-models. Replaces `crossCuttingTerms` / `crossCuttingInvariants`. Atoms inside use fqid `kernel/<kid>/<slug>` and `kernel/<kid>/invariant/<slug>`.
  - `seam.kind` — the Evans context-map enum (`shared-kernel`, `customer-supplier`, `conformist`, `anticorruption-layer`, `open-host-service`, `published-language`, `partnership`, `separate-ways`, `unknown`). Asymmetric kinds carry `upstream` / `downstream`; symmetric kinds carry `participants`. Migration sets every existing seam to `unknown` and surfaces the triage list.
  - `bounded-context.subdomain` — optional `core` | `supporting` | `generic`. The pragmatic v0.3 take on Evans' strategic-design classification (a separate `subdomain` entity kind that spans multiple contexts is deferred to v0.4 if a real project hits the limit).
  - `rationale:` fields on seam, aggregate, module, shared-kernel, and boundary-rule. The "argument that justifies the model choice" — the only ADR replacement; development-journal / historical-reasoning capture is deferred.

  **Migration**: `lex-migrate v0.2 → v0.3` is the path. Interactive (per-ADR archival, per-cross-cutting kernel grouping, per-term categorization, per-seam classification) — the agent surfaces candidates; the user makes the interpretive calls. See `skills/lex-migrate/migrations/v0.2-to-v0.3.md` for the full delta.

### Changed

- **Viewer**: all renderers updated to the v0.3 entity model. The "decisions" graph lens is removed; ownership and surfaces remain. New entity-kind body panels for `aggregate`, `module`, `shared-kernel`. Category-aware term rendering. Typed seam direction in `GraphDetailRail` and `EntityDetail` margins. `ContextSidebar` shows shared kernels as their own section, not a "cross-cutting" bag. `--color-kind-decision` is removed from the theme; `--color-kind-aggregate`, `--color-kind-module`, `--color-kind-shared-kernel` are added.
- **`lex-bootstrap`**: Phase 6 reframed from "migrate ADRs to YAML" to "archive ADRs and optionally lift content into rationale fields." Templates updated; `decision.yaml.example` deleted.
- **All other skill bodies** swept for stale `crossCutting*`, `kind: decision`, `lexicon/decisions/`, and `modules` (file-glob) references. `lex-overview` rule 7 (ADRs are append-only) is removed; subsequent rules renumbered. `lex-retro`'s "ADRs are lighter" branch is gone — Decisions-check flags now surface as `rationale:` candidates for `lex-crystallize` to absorb. `lex-crystallize` gains new typed mutation ops: `add-rationale`, `set-category`, `set-seam-kind`. `lex-audit`'s hygiene sweep checks for orphaned `decisions/` directories, seams stuck at `kind: unknown`, and rationale-empty atoms.

### Added

- **`lex-meta` skill** — a self-evolve channel for the lexicon skill bundle itself. User-triggered via `/lex-meta [optional prompt]` after correcting something a lexicon skill produced (either an edit to the project's `lexicon/` folder or pushback against a skill's output earlier in the session). Takes the session conversation as the **primary signal** for *why* the correction was needed, with `git diff` of the project's `lexicon/` folder as corroborating evidence, then interviews to disambiguate and proposes an amendment to the responsible `~/src/lexicon/skills/<skill>/SKILL.md`. Cross-repo write; **does not commit** in the lexicon repo — the dirty working tree across multiple invocations is the accumulation buffer, deliberately reviewed and pushed when the user sits down in the bundle repo intentionally.

  Triage is the first phase: classify the correction as **bundle edit** (lesson generalizes), **project-quirk** (belongs in the project's CLAUDE.md), or **no-op** (the skill was right; the user just preferred a different cosmetic this once). Bundle edits are further labeled bug-vs-taste in the proposal so taste calls get an explicit "you're sure you want this as a global rule?" confirmation. Anti-patterns the body calls out: inventing reasons to edit (a `/lex-meta` invocation is not a contract to produce an amendment), editing without quoting the current SKILL.md text, bundling unrelated lessons, committing in the bundle repo, treating the diff as primary, and routing to the phased-out `lexicon-prefs.md`.

### Deprecated

- **`lexicon-prefs.md` as the buffer for user preferences.** v0.7.0 introduced `~/src/lexicon/lexicon-prefs.md` as a user-level prefs file with a curation pass to absorb stabilized entries into SKILL.md files. In practice the buffer added a transcription step without paying for itself — the "consolidate through continuous use" property is better served by `/lex-meta` editing SKILL.md directly, with the bundle repo's dirty working tree playing the accumulation role. References to `lexicon-prefs.md` in other SKILL.md bodies are now stale and a candidate for cleanup via `/lex-meta`; they remain readable for now to avoid an abrupt break, but the routing target is the SKILL.md files themselves.

## [0.9.0] - 2026-05-12

### Changed

- **Cold layer is now structured YAML, not markdown.** `lexicon/system.md` and `lexicon/views/<slug>.md` are replaced by `lexicon/system.yaml` and `lexicon/contexts/<slug>.yaml`. ADRs move from `lexicon/decisions/ADR-<NNNN>-<slug>.md` to `…<slug>.yaml`. A new `lexicon/surfaces/<slug>.yaml` holds UI surfaces and their regions. Retros, audits, plans, and the triage reports (`bootstrap.md`, `migrate.md`) stay markdown — only the canonical cold layer is structured.
  - **Schema v0.1** is declared on every file (`schemaVersion: "0.1"`) and specified normatively in `lex-overview` (new **Schema specification** section). IDs are kebab-case slugs scoped within their owning context; refs use `<context>/<slug>` for qualification.
  - The structured form makes the graph machine-readable: typed refs (`disambiguatesFrom`, `affects`, `supersedes`), code anchors (`symbols`, `constrainsCode`, `Region.implementation`), and ownership checks become mechanical instead of regex-heuristic. The companion `lexicon-viewer` (in this repo, under `viewer/`) reads the schema and renders the graph.

- **`lex-overview` rewritten.** Project shape, schema spec (inline, normative), rules of engagement updated for YAML files. New Rule 8 names the slug-vs-name distinction explicitly: display names mutate freely, slugs are stable and rename-as-refactor goes through `lex-crystallize`.

- **`lex-bootstrap` rewritten** to emit YAML files per the schema. Phase 4 mints IDs and emits structured records instead of filling a markdown template with TODO placeholders. **Honest emission** replaces the v0.8.0 TODO-marker discipline: gaps are listed in `bootstrap.md`, not encoded as `<!-- TODO -->` strings in prose fields. Phase 6 ADR migration writes YAML. Templates dir replaces `*.md.template` files with annotated `*.yaml.example` files; `plan.md.template` stays for now (plans remain markdown).

- **`lex-crystallize` rewritten** to propose **typed mutation sets** instead of markdown diffs. Mutations are `create / update / rename / move / deprecate / delete / add-anchor / set-status`, grouped by target file. The v0.x "deliberately NOT changing" discipline is dropped — typed mutations are mechanically scope-bounded, so untouched entities don't need to be enumerated. Rename ops cascade reference updates across all `lexicon/` files in a single Edit pass.

### Added

- **`lex-migrate` skill** — one-shot, forward-only conversion of a v0.x markdown lexicon to v0.1 YAML. Parses `system.md`, `views/*.md`, `decisions/*.md`, emits the corresponding YAML files, archives the originals under `lexicon/_pre-migrate-archive/`, and writes a migration report at `lexicon/migrate.md`. Mechanical — does not improvise interpretations. Anything that can't be cleanly mapped (cross-context References sections, view-scoped deliberate omissions, ad-hoc cross-references in prose) is preserved in the archive and listed in the report for the user to handle.

### Transitional state

- **`lex-ground`, `lex-retro`, `lex-audit` are not yet rewritten** for YAML. The schema spec in `lex-overview` is the source of truth, and these skills' next operational pass will read/write YAML natively. Until then their bodies may still reference `system.md` internally; treat that as known-stale phrasing, not authoritative.
- **Retros and audit reports remain markdown** by design — they're event records, and the rendered prose carries the per-session voice. A future structured-retro evolution is plausible but not in scope for v0.9.

### Migration

- v0.x projects: run `lex-migrate` once, then proceed normally on YAML. The originals are archived, not deleted; verify the conversion, then drop the archive.
- New projects: `lex-bootstrap` emits YAML directly. No markdown intermediate.

### Why ship 0.9.0

The cold layer was always intended to be the **invariant, machine-readable** slice of the project's vocabulary, but v0.x encoded it as markdown — readable for humans, brittle for tools. Two costs accumulated:

1. Every consumer (audit, viewer, future LSP integration) had to re-parse markdown heuristically, with subtly different rules.
2. References between entities (`NOT to be confused with X`, "see ADR-0042") were free-text, so renames silently broke them and ownership couldn't be enforced.

YAML with stable slugs and typed refs collapses both: one parser, one canonical structure, mechanical reference cascade. The cost is that some prose voice flattens at conversion; the gain is everything downstream becomes typed.

## [0.8.1] - 2026-05-12

### Changed

- **`lex-bootstrap` Phase 2: UI detection is now a judgment question, not a checklist.** The prior phrasing keyed off web-app idioms — `tailwind.config`, `routes/`, `.storybook/`, `jsx-a11y` — and concluded "backend-only" when those were absent. Real failure mode: an Obsidian plugin bootstrapped on 2026-05-12 came out with no design-system section despite having four `ItemView` surfaces, ~30 React/TSX components, and a `src/styles/` tree, because it inherits tokens from the host (Obsidian's CSS custom properties) and registers surfaces through the host's view-class API instead of a route table. The skill saw none of its expected signals and silently omitted the section.
  - Phase 2 now opens with a **UI detection** bullet: *does this code put anything in front of a human?* — answered by whatever signal exists (rendering-purpose files, dependency list, README prose, screenshots, file/dir names), with explicit callout that host-embedded UIs (Obsidian / VS Code / Figma / browser-extension / Logseq plugins) are the dominant false negative.
  - The existing **Design-system surface** and **Surfaces & regions** bullets keep their framework-specific examples, but the framing is reworked from "if these are absent, skip" to "these are eye-prompts for finding signal, not gates." Surfaces & regions now explicitly covers host-embedded view registrations (`ItemView`, `WebviewViewProvider`, etc.) and leads with the conceptual question *"what does the user navigate between?"* instead of a route-detection grep.
  - Phase 4's design-system gate updates from "only if Phase 2 found design-system signals" to "only if Phase 2's UI detection said yes." Host-embedded UIs get explicit guidance for the Tokens subsection (one-line pointer at the host's design system, not duplication).
  - Phase 9 report header: "omit if backend-only" → "omit if UI-free" for terminology consistency.

- **`lex-bootstrap` Phase 8: distillation is now one decision per conversational turn, batching forbidden.** Prior phrasing told the agent to walk through TODOs "in 5–8 batches" and explicitly accepted "abbreviated answers (`1c, 2-3 cull, 4 rewrite: …, 5-7 confirm`)." Real failure mode: a Dany bootstrap on 2026-05-12 surfaced four items in a single message with shortcode syntax; the user pushed back that this defeats the point of running the interview in-session — multi-decision batching optimizes for agent throughput, not cold-doc quality.
  - Phase 8 now opens with an explicit non-negotiable rule: never bundle multiple distillation decisions into a single message. Per-item flow is state → context → ask → wait → apply → confirm → next item *in a new turn*.
  - Added an Anti-patterns subsection naming the failure modes ("Here are 4 batches, answer with shortcodes 1A 2Y…" / "Quick confirms on items 1–5 since they're all similar?" / listing upcoming items as preview).
  - Phase 9 distillation-status line and Phase 10 user-facing message reworked from "after batch <N>: <name>" to "mid-<category>: <N> of <T> items resolved, next pending: <description>" so pause-and-resume captures progress in items, not batches.
  - "What this skill is NOT" gets an explicit line: *multi-decision batching is forbidden; the user's attention is the scarce resource, not the agent's tokens.*

### Why ship 0.8.1

Two prose-shape fixes that share a lesson: **don't let the skill optimize for the agent's convenience at the user's expense.**

The UI-detection change pushed back on enumerate-then-gate as a project-recognition strategy — the list always leaks, and LLMs are bad at exhaustive enumeration. Define the *question* and trust the agent to answer.

The Phase-8 change pushed back on batched-shortcode prompting as an interview style — it appears to save time but actually evicts the user's engagement, which is the whole point of running the interview in-session. Define the *rule* (one decision per turn) and trust the conversation to take what it takes.

Both are patches to phrasing, not new capabilities. The framework-specific examples stay, but as signal-prompts rather than gates; the queue ordering stays, but as priority rather than batching boundaries.

## [0.8.0] - 2026-05-12

### Added

- **`lex-bootstrap` runs the distillation interview in-session by default.** Previously, bootstrap drafted `system.md` with TODO markers and a triage report, then told the user to come back later for a "focused-distillation session." In practice, "later" usually never came, and the cold doc started life half-formed — the open question CLAUDE.md had flagged as "will users actually do that?" The answer was no, not reliably. v0.8.0 folds the interview into the skill body as Phase 8: after draft + ADR migration, the skill walks the user through inconsistencies → drift flags → glossary/invariant/context TODOs → why-notes → design-system items → file moves, in batches of 5–10 items each. The triage report (now Phase 9) reflects post-distillation state — resolved/culled/revised/deferred counts — instead of a homework list. Pause/resume is supported: "pause" at any batch boundary records position in `lexicon/bootstrap.md`, and re-triggering bootstrap with "continue distillation" picks up from there. This is the one legitimate case of re-running bootstrap on a populated project.
- **Surfaces & regions as a first-class tier of design vocabulary.** Real use of v0.6.0 (Eir's design-system view) surfaced a gap: the existing tiers (tokens, components, layout primitives, interaction patterns, a11y invariants) didn't cover the *named layout zones inside a specific surface* — the "right sidebar of the composer view" / "header strip of the run page" tier. Without names, teammates and agents can't refer to these regions precisely; without precise references, retros can't flag drift in them. v0.8.0 adds the tier explicitly:
  - **Surface** = a top-level rendered view: a route, a screen, a window, a TUI pane, a print layout. Generalizes beyond web — Flutter screens, SwiftUI navigation stacks, Compose composables, terminal panes all qualify.
  - **Region** = a named layout zone inside a surface (sidebar, toolbar, canvas, hero, banner). Earns a name when the team refers to it as a discrete piece, regardless of whether it's been factored into its own component file.
  - **Implementation tag** = metadata, not a gate: `*Component*: <import>` (extracted) or `*Inline*: <file>:<lineStart>–<lineEnd>` (still inline). Naming follows conceptual status; extraction is a separate decision.

### Changed

- **`lex-overview`**: § core idea and § Design-system signals both expanded. Surfaces/regions named alongside tokens/components/primitives. The Vocabulary signal now flags inline-but-named regions as drift; Vocabulary consistency adds the "same region called by two different names" case; Boundaries adds "regions stay scoped to their owning surface."
- **`lex-bootstrap`**: Phase 2 (codebase audit) gains a "Surfaces & regions" scan — route registries, screen managers, semantic containers, `{/* Name */}` comment heuristics, repeated visual patterns. Phase 4 (drafting) gets explicit guidance for filling the surfaces/regions content with implementation tags. Phase 4b (view promotion) adds "multiple top-level surfaces with named regions" as a signal favoring a design-system view. Triage report (now Phase 9) adds Surfaces / Regions / Notable inline regions / Cross-cutting patterns lines.
- **`lex-audit`**: Phase 1 design-system validation extended with region validation — *Component*-tagged regions resolve to a real file; *Inline*-tagged regions resolve to a meaningful block at the cited line range; common drift modes (extracted-but-tag-still-says-inline, deleted, line-shifted) are classified separately so the human can pick the right fix.
- **`system.md.template`**: new `### Surfaces & regions` subsection inside `## Design system` showing both `*Component*` and `*Inline*` tag examples.
- **`lex-retro` and `lex-crystallize`**: no body changes — they consume the structural-check definitions in `lex-overview`, so the new region-aware Vocabulary/Boundaries checks apply automatically.

### Why ship 0.8.0

The gap surfaced concretely on Eir during a `lex-bootstrap`-style design-system content gathering: the agent (correctly per v0.7.0 conventions) listed tokens, primitives, and extracted components — but had no scaffolding to ask "what are the named layout zones of the composer page that the team refers to in conversation?" The user's complaint was direct ("I have no idea how to call the right sidebar"). Worse, when the agent did try to invent a rule, it landed on "inline `<div>`s don't earn names" — which collapsed two orthogonal axes (conceptual identity vs implementation status) and would have hidden meaningful regions like Eir's inline `Header strip` and `Spec panel`.

Two-axis vocabulary capture (conceptual identity = naming gate; implementation status = metadata tag) addresses this. The naming covers both extracted and inline pieces; the tag tells the agent where to grep. A future extraction is now a tag update, not a vocabulary change — which is the right shape because the *concept* didn't move, only its file home did.

The framing generalizes beyond web by design. Surface/region is the abstraction; the platform-specific signals (`<aside>` vs SwiftUI `Sidebar` vs Flutter `Drawer` vs terminal pane) are flagged as examples, not as the definition. Backend-only projects skip the entire design-system section (already true since v0.6.0); UI-bearing projects get one more tier of vocabulary support.

Risk: the surfaces/regions section can bloat — every styled `<div>` is technically a region candidate. The conversational-referent rule ("a region earns a name when the team refers to it as a discrete piece") is the trim discipline; without it, the section tends toward the size of the rendered tree itself. `lex-audit` Phase 1's region validation is the maintenance backstop — when a *Component*-tagged region's import goes dead, the audit flags it.

## [0.7.0] - 2026-05-05

### BREAKING

- **Removed `lexicon/calibration.md`.** Project-level calibration was the wrong granularity — most "what counts as significant" is about the user, not the project, so per-project calibration meant the same lessons got re-learned every project. Replaced with **`~/src/lexicon/lexicon-prefs.md`** — a single user-level prefs file (path hardcoded while iterating; portability deferred). Sections cover Workflow, Style, Calibration, and Patterns. Loaded at session start by `lex-overview` and treated as a live override of skill defaults; periodically curated into the SKILL.md bodies themselves and pruned. Project-specific overrides, when genuinely needed, go in the project's `CLAUDE.md` — already always-loaded, no separate file needed.

  **Migration for existing projects:**
  ```
  # If you have content in lexicon/calibration.md you want to keep:
  # - User-level (style, significance, workflow) → move to ~/src/lexicon/lexicon-prefs.md
  # - Genuinely project-specific → move into the project's CLAUDE.md
  rm lexicon/calibration.md
  ```

### Added

- **`lex-feedback` channel via existing skills (no new skill).** When the user says **"for lexicon: <X>"** (or "for lexicon, <X>" / "for lexicon — <X>") during a session, the active skill appends an entry to `lexicon-prefs.md` in the relevant section. The phrasing is deliberately distinct from generic "remember that" — `lex-retro` and `lex-crystallize` only intercept the explicit `for lexicon` form, so the agent doesn't conflate prefs with project memory or the user's PKM.

- **`lex-crystallize` suggests prefs entries on repeated rejections.** When the cumulative pass sees the same kind of flag rejected 3+ times across retros without absorption, it offers a Calibration entry for `lexicon-prefs.md`. Single yes/no, no nagging.

- **`lex-audit` Phase 5 became "Prefs coherence".** Reads `lexicon-prefs.md`, checks whether recent retros honor the entries, suggests new entries for repeated noise patterns, and flags prefs entries old enough to absorb into a SKILL.md (the curation nudge). Replaces the old project-level `calibration.md` coherence check.

### Changed

- **`lex-overview` adds Rule 8: "Load `lexicon-prefs.md` and respect 'for lexicon: …' feedback".** Replaces the old "Calibration over time" rule. Treats prefs entries as live overrides of skill defaults; documents the trigger phrasing and the `CLAUDE.md` escape hatch for genuinely-project-specific overrides.

- **`lex-ground`, `lex-retro`, `lex-crystallize` read prefs instead of `calibration.md`.** Behavior is otherwise the same — Calibration section of `lexicon-prefs.md` plays the role formerly played by per-project `calibration.md`.

### Why ship 0.7.0

Three failure modes of `lexicon/calibration.md` showed up the moment we tried to use it: (1) most calibration is about the user, not the project, so per-project files meant relearning the same lessons every time; (2) "significance" was too narrow an axis — actual feedback the user wants to give is wider (workflow, style, patterns); (3) writing to a separate file mid-session has enough activation energy that it just doesn't happen. Lifting the file to user-level, broadening the axes, and making the trigger inline (`for lexicon: <X>`) addresses all three.

Risk: the path is hardcoded to `~/src/lexicon/lexicon-prefs.md`, which breaks portability for anyone else installing lexicon as a plugin. Acceptable while the prefs format itself is still settling — once stable, the path will move under `${CLAUDE_PLUGIN_ROOT}` or `~/.claude/`.

Open thread: the curation step (absorbing prefs entries into SKILL.md and pruning) is manual and depends on the user actually running it. `lex-audit` Phase 5 nudges, but doesn't enforce. If prefs pile up unaddressed, behavior diverges from the canonical skill bodies. Watch for this.

## [0.6.0] - 2026-05-04

### Added

- **Design system as a first-class citizen of the cold layer.** When the project has a UI surface, design vocabulary — tokens, component names, layout primitives, interaction patterns, and accessibility invariants — is ubiquitous language for the UI and lives in the same `system.md`. No new skill bundle; the existing six structural checks pick up design drift naturally (hex literal outside the token file, new component file, raw `<button>` where `<Button>` exists, a11y invariant touched, etc.). When the design surface gets rich, the `## Design system` section promotes to a Domain View at `lexicon/views/design-system.md` via the existing partition mechanism.

### Changed

- **`system.md.template`**: new `## Design system` section (tokens, component vocabulary, layout primitives, interaction patterns, a11y invariants). Backend-only projects delete the section during bootstrap distillation.
- **`lex-overview`**: new "Design-system signals" subsection under § Structural checks, naming the design analog for each of the six checks. New core-idea sentence noting design vocabulary as ubiquitous language. Rule 6 extended with the canonical anti-pattern ("just one more shade of blue" is a cold-layer edit).
- **`lex-bootstrap`**: Phase 1 (doc audit) adds design-system docs to the conventional locations. Phase 2 (code audit) adds theme/token files, component library directories, Storybook config, and a11y tooling to the codebase scan. Phase 4 (drafting) gets explicit guidance for filling the design-system section, and explicit "delete if backend-only" guidance. Phase 4b (Domain Views) names design-system-as-a-view as a particularly clean partition. Phase 8 triage report adds a "Design system findings" block.
- **`lex-audit`**: Phase 1 (Glossary validation) extended with token-name and component-name classification using the same healthy/drifted/dead/mismatch shape. Phase 2 (Invariants) recommends running existing a11y tooling (ESLint `jsx-a11y`, axe-core, Storybook a11y addon, Playwright a11y) and folding output as evidence rather than re-deriving by hand.
- **`lex-retro` and `lex-crystallize`** unchanged — they consume the structural checks defined in `lex-overview`, so the design-system signals inherit automatically.

- **Templates trimmed of meta-instructional blockquotes.** The four templates (`system.md`, `view.md`, `plan.md`) carried multi-paragraph blockquote prefaces explaining when/how to use each section ("The ubiquitous language…", `*Optional.*`, "On completion…"). These rendered into the user's actual cold-layer files where they served no audience — the agent reads `lex-overview` every session, and the human had already internalized the rules. Trim kept headings and `< >` placeholder scaffolding; dropped blockquotes, `*Optional.*` labels (once a section is in a rendered file it's not optional — delete it if it doesn't apply), and workflow notes. Every removal cross-checked against the SKILL.md bodies. `adr.md.template` was already clean and is unchanged.

### Why ship 0.6.0

Two surfaces converged: (1) the user observed that design systems are ubiquitous language for UI projects and asked how lexicon could absorb that capability, and (2) reviewing the templates with that lens surfaced the unrelated meta-blockquote pathology. The design-system extension is structural (new template content, new signals subsection in overview, scan extensions in bootstrap and audit) but adds no new skills, no new file conventions, and no behavior change for backend-only projects. The template trim is independent but ships in the same revision because both touch template files and shipping them separately would re-rev the same set of files twice.

Risk on the design-system side: if real frontend-heavy projects don't trigger the lexicon skills (because trigger language doesn't fire on "fix the spacing" / "update the button styles"), the extension is in vain. Watch for this in real use; the fix would be sharper triggering language in `lex-ground` and `lex-retro`, not a separate skill family.

Risk on the trim side: the stripped guidance was, in some cases, redundant with the SKILL.md bodies but not load-bearing-redundant — a user looking at only the rendered template lost a small amount of context. The bet is that the SKILL.md guidance fires reliably enough that this loss is theoretical.

## [0.5.0] - 2026-05-04

### BREAKING

- **Removed `_proposals/`, `_active/`, `_scratch/`.** The two-stage proposal flow and per-session file sharding are gone. The properties they protected (deliberate cold-layer review, multi-agent safety) turned out to be either already-provided-by-the-Edit-approval-loop or hypothetical-in-practice. See `CLAUDE.md` § "Why we removed proposals and session sharding" for the full reasoning.

- **`retros/` promoted to top-level.** Was `lexicon/plans/_retros/`; now `lexicon/retros/`. With `_active/`, `_scratch/`, `_proposals/` gone, retros were the only thing left under `plans/` besides feature folders, and they're not feature-scoped — moving them up makes the structure honest.

- **New top-level paths.** `lexicon/audits/` for audit reports (was `_proposals/audit-<iso>.md`). `lexicon/bootstrap.md` for the one-shot adoption report (was `_proposals/bootstrap-<iso>.md`). `lexicon/.last-crystallized` is a new marker file containing an ISO timestamp; `lex-crystallize` reads retros newer than this and updates it on successful application.

  **Migration for existing projects:**
  ```
  git mv lexicon/plans/_retros lexicon/retros
  mkdir lexicon/audits
  # If you have an outstanding bootstrap report:
  git mv lexicon/plans/_proposals/bootstrap-*.md lexicon/bootstrap.md
  # Old audit reports:
  git mv lexicon/plans/_proposals/audit-*.md lexicon/audits/
  # Anything still in _proposals/ that you haven't acted on: triage manually.
  rm -rf lexicon/plans/_active lexicon/plans/_scratch lexicon/plans/_proposals
  # Optional: seed the marker so the first crystallize doesn't re-consider all retros.
  date -u +%Y-%m-%dT%H:%M:%SZ > lexicon/.last-crystallized
  ```

### Changed

- **`lex-crystallize` is now user-triggered with inline application.** Trigger broadens from "feature done" to any user-initiated update ("crystallize", "update lexicon", "absorb the retros", "feature X is done"). Reads retros newer than `.last-crystallized`, cross-checks against `git diff`, proposes the diff inline in chat, and applies on the user's yes — no proposal file. Still includes the "deliberately NOT changing" discipline. Adds a step to surface pre-existing inconsistencies in `system.md` rather than silently smoothing over them.

- **`lex-ground` no longer writes files.** Grounding (scope declaration, vocabulary check) happens in conversation. The agent's context window holds it for the rest of the session. Lost: session ID minting, `_active/<id>.md` lock writes, sibling `_active/` overlap detection, `_scratch/<id>.md` notes. Gained: simplicity.

- **`lex-retro` writes to `lexicon/retros/<iso-timestamp>.md`** (was `_retros/<session-id>.md`). Structural-drift flags land **inline** in the same file under a `## Structural drift` section, instead of triggering a separate proposal file.

- **`lex-audit` hygiene checks updated.** Removed `_active/` orphan checks and `_proposals/` triage checks (those folders no longer exist). Added `.last-crystallized` cadence check (flag if marker is missing or > 60 days while retros show recent activity). Audit report path moves to `lexicon/audits/audit-<iso>.md`.

- **`lex-overview` rules consolidated.** Removed rules 4 ("Announce before claiming"), 9 ("Concurrent-session awareness"), and the "Session ID" section. Added rule 5 ("Crystallize on the user's call") making the user-triggered property explicit. Rule 7 (was "system.md is write-protected") became rule 6 ("Cold-layer edits go through `lex-crystallize`") — same property, different mechanism.

### Why ship 0.5.0

The proposal flow was the single biggest piece of ceremony in the workflow, and it was paying daily cost for protections that turned out to be hypothetical in single-agent interactive use (the dominant mode). Cutting it now — before more projects adopt v0.4.x and accumulate `_proposals/` directories — keeps migration cheap. Per-session sharding came along because once `_active/` and `_scratch/` weren't holding up a coordination protocol, they were just session-ID-named files with no readers.

Risk: if real concurrent-agent use turns out to need coordination, lexicon will need to bring something back. The bet is that git is sufficient and that the rare cases where it isn't are not common enough to justify a daily-cost mechanism.

## [0.4.0] - 2026-05-04

### BREAKING

- **Renamed `docs/` → `lexicon/`** as the lexicon-owned root folder. This avoids colliding with projects that already use `docs/` for runbooks, API references, onboarding guides, etc. — lexicon's structure now lives in its own clearly-named directory and never claims a generic name. All paths inside the tree are unchanged: `lexicon/system.md`, `lexicon/views/`, `lexicon/decisions/`, `lexicon/calibration.md`, `lexicon/plans/{_active,_scratch,_proposals,_retros,_archive,<feature>}/`.

  **Migration for existing projects:** `git mv docs lexicon`, then update any external references (tooling, links, scripts) that hard-coded the old path. No file *contents* need to change — the folder rename is the entire migration.

  **Why this is breaking despite small surface area:** project-shape changes break automation, links, and muscle memory. The CLAUDE.md convention explicitly classes folder renames as a major-equivalent event.

### Changed

- **Skill descriptions trimmed.** All six descriptions now sit between 58–76 words (previously 60–250). The redundant trailing `Read lex-overview if you haven't already this session.` was tightened to `Read lex-overview first.`, and the boilerplate `This is one of N lexicon skills` line was removed entirely (the count had drifted across versions — `lex-ground` and `lex-retro` still claimed "one of three" — and `lex-overview` is the canonical source for the skill list anyway).

- **Structural checks consolidated into `lex-overview`.** The six checks (vocabulary, vocabulary consistency, invariants, boundaries, decisions, declared-scope match) used to be restated in `lex-retro` and `lex-crystallize` and inverted in `lex-audit`'s phase headings. They now have a single canonical definition under `lex-overview` § Structural checks, with a `### Per-skill direction` block explaining how each consuming skill applies them (forward against a session diff for retro, forward against a cumulative feature diff for crystallize, backward against existing claims for audit). `lex-retro` and `lex-crystallize` reference the canonical list and only carry their direction-specific framing; `lex-audit` keeps its audit-specific procedural phases (literal grep, healthy/drifted/dead/mismatch classification, hygiene sweep) and adds a one-paragraph cross-reference noting that phases 1–3 invert checks 1–4.

- **CLAUDE.md.** Removed the "chicken-and-egg" framing about lexicon needing to dogfood itself — lexicon is a skill bundle, not a domain codebase, so the cold-doc shape doesn't apply. Updated the project-shape-change note and the provenance section to reflect the `docs/` → `lexicon/` rename. Convention bullet now references `lexicon/`.

### Why ship 0.4.0 now (vs bundling with 0.5)

The path collision and the description bloat were both surfaced by the same review pass on v0.3.0's skills. They're independent — the rename is a shape change, the trim is description tuning — but they share a triggering cause (the pass exposing what real review catches that internal iteration didn't), and they both touch every skill file. Shipping them together avoids two consecutive revs of the same set of files.

The structural-checks consolidation is the riskier change of the three, because it relies on `lex-overview` being reliably loaded before retro/crystallize/audit fire. If that assumption holds in real use, the consolidation removes ~60 lines of restated content; if it doesn't, retro and crystallize are missing a checklist they depend on. The fallback if it fails: re-inline the six checks into each skill body as the v0.1.0 design did. This is the open question to watch most closely after this release.

## [0.3.0] - 2026-05-04

### Added
- `lex-audit` — periodic-maintenance skill. The complementary refresh pass to `lex-bootstrap`'s adoption pass: bootstrap absorbs initial truth; audit catches drift accumulated since. Specifically catches **backward-flow drift** that `lex-retro` and `lex-crystallize` are structurally blind to — `system.md` claims things that *used to be true* (stale glossary entries, dead invariants, undeclared bounded contexts, hygiene rot in `docs/plans/`). Read-mostly: produces a triage report under `docs/plans/_proposals/audit-<iso>.md` with calibrated flags (high-priority definition mismatches, possibly-violated invariants distinguishing "stale doc" from "code regression", boundary leakage, orphaned `_active/` files, untriaged proposals, retro-volume warnings, calibration coherence). Never unilaterally edits `system.md` or deletes plan/retro files. Supports targeted mode for narrower checks ("audit just the glossary").

### Why ship audit now (vs deferring further)

v0.2.0's notes said audit was deferred until real usage data on drift patterns. We're shipping it earlier on the bet that **its absence is itself the design risk**: without audit, projects that adopt lexicon and then go quiet for a few months silently accumulate exactly the kind of rot the workflow exists to prevent. The structural checks in audit are derived from the same primitives as `lex-retro` (vocabulary/invariants/boundaries), just applied at project scope and in the backward direction, so the design isn't speculative — it inverts the existing model. Calibration of the checks (what fraction of flags turn out to be noise) still depends on real usage, but that's a tunable not a structural unknown.

## [0.2.0] - 2026-05-04

### Added
- `lex-bootstrap` — dedicated one-shot adoption skill. Replaces the bootstrap subroutine that previously lived inside `lex-ground`. Unlike the old subroutine (which only scanned the codebase), this skill scans existing docs *and* code, distills a first-cut `system.md` from the intersection, migrates ADR-shaped content into `docs/decisions/`, and produces a triage report under `docs/plans/_proposals/bootstrap-<iso>.md`. The triage report flags drift between docs and code, vocabulary inconsistencies, and recommended (but not auto-executed) file moves.

### Changed
- `lex-ground` no longer bootstraps inline. When it encounters a project without `docs/system.md`, it surfaces and defers to `lex-bootstrap`. Reasoning: the doc-audit and code-audit phases are too heavyweight to fold into per-task grounding, and shortcutting them produces a `system.md` that misses content already sitting in existing `docs/`.
- Templates moved from `skills/lex-ground/templates/` to `skills/lex-bootstrap/templates/` (now the canonical user).

### Why a separate bootstrap skill
The migration question for projects with existing docs surfaced a real gap: the old inline bootstrap was code-only, so it ignored exactly the kind of pre-existing cold-layer content (architecture docs, design notes, RFCs) that's the highest-value extraction zone. Splitting bootstrap into its own skill lets it spend tokens on a doc audit, a cross-reference between doc vocabulary and code identifiers, and a structured triage report — work that doesn't fit inside a per-task grounding step.

## [0.1.0] - 2026-05-04

Initial release. The shape is plausible but unproven on real projects.

### Added
- `lex-overview` — the rulebook, loaded by other skills at session start.
- `lex-ground` — runs at the start of substantive coding work; bootstraps `docs/` structure on first use, declares scope, opens scratchpad.
- `lex-retro` — runs at every natural stopping point; always logs, escalates only on structural triggers (vocabulary, invariants, boundaries).
- `lex-crystallize` — runs at multi-session feature completion; reviews cumulative diff against `system.md` and proposes coherent updates.
- Templates for `system.md`, plans, and ADRs (shipped inside the `lex-ground` skill folder so they remain reachable when installed via `npx skills`, not just as a Claude Code plugin).

### Skill naming

Skills use a flat `lex-*` prefix (`lex-overview`, `lex-ground`, `lex-retro`, `lex-crystallize`) rather than relying on Claude Code's plugin namespace (`lexicon:ground`). This is because `npx skills` — a common alternate install path — doesn't apply marketplace prefixes. Flat-prefixed names work identically in both install modes.

### Deliberately not included
- **Stop hook for retro enforcement.** Considered but dropped — Claude Code's `Stop` event fires on every agent→user turn, not at session end, so a hook there would be excessively noisy. The pushy skill descriptions are the only enforcement mechanism in v0.1.0. See `CLAUDE.md` for the reasoning and what a future session-end signal would need.
- **Materialize-plan skill.** Native plan mode and `docs/plans/<feature>/` are meant to compose, but the right shape needs real-world signal before committing.
- **Periodic-aggregation pass.** A skill that sweeps multiple retros to find patterns across sessions. Worth adding once proposal volume justifies it.
- ~~**Lex-audit skill.**~~ Shipped in v0.3.0 — see above.

### Known unknowns
- Triggering accuracy of skill descriptions on real projects.
- Calibration of structural triggers — what fraction of escalations turn out to be noise.
- Whether the `overview` skill reliably loads when cross-referenced from other skills.
