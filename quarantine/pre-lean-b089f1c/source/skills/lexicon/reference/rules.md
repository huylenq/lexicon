# Rules of engagement

Applies whenever a project's primary/default worktree has `lexicon/system.xml`. The terse version lives in `SKILL.md`'s "Standing rules"; this file covers the edge cases.

## 1. Use the shared artifact worktree

Lexicon is project-level shared memory, not per-branch implementation state. Resolve the current code worktree and the repository's primary/default worktree separately. The first `worktree` path reported by `git worktree list --porcelain` is the artifact root; do not infer it from a branch name such as `main` or `develop`.

Read and write `lexicon/` only under that artifact root unless the human explicitly names another one. Never use a copy under an agent's linked worktree, and never treat its absence there as evidence that the project needs `bootstrap`. The directory is often intentionally untracked or ignored in the primary worktree. Markdown prose lives at `lexicon/docs/`; a leftover `laxicon/` is the old name for that folder.

Code inspection, implementation, tests, git history, and feature-branch diffs remain rooted in the current agent worktree. In particular, `crystallize` reads the implementation diff from the current worktree while reading and writing the cold layer and `.last-crystallized` under the shared artifact root.

Bundled standalone validators preserve that split through `<codeRoot> --artifact-root <artifactRoot>`. Always provide the explicit artifact root from a linked worktree; omit it only when code and knowledge are truly co-located. Do not copy knowledge into a linked worktree to satisfy a tool.

Because multiple agents can touch the same untracked artifact files without Git conflict detection, re-read each artifact immediately before editing, keep writes narrow, and surface concurrent changes rather than overwriting them.

## 2. Read `system.xml` first (and relevant context files)

Before substantive work, read `system.xml` end to end. It's small by design — under ~500 lines. If it's longer, surface to the user as a sign the cold doc is rotting (or that the project has outgrown one file and should partition into `contexts/<slug>.xml`).

If `lexicon/contexts/` exists, also read the context file(s) matching the bounded context of the work being done. `system.xml`'s `<contexts>` index lists the available slugs. Loading every context file eagerly defeats the partitioning — load only what's relevant. When in doubt, ask the user which context the work is in.

If `lexicon/surfaces/` exists and the work touches UI, load the relevant surface file(s) too.

## 3. Ground before code

For any task that isn't strictly mechanical (typo fixes in comments, dependency version bumps with no API change, log-message wording tweaks, local-variable renames), run the `ground` subcommand before writing or modifying code. Skipping grounding is the most common source of silent drift.

If you're tempted to call something "trivial" but it touches a file mentioned in `system.xml` or a context file, it's not trivial — run the full grounding.

## 4. Surface contradictions

If the cold-layer XML contradicts the code or the user's request, **stop and surface it before proceeding**. Don't quietly work around it. Don't hallucinate that the doc is right.

The same applies during `crystallize`: if the existing cold layer contains entries that look mutually inconsistent (a term defined two different ways across contexts, an aggregate's `members:` pointing at a deleted term, a seam whose `upstream`/`downstream` refer to nonexistent contexts), surface it before proposing the new mutation set. Don't smooth it over silently.

## 5. Crystallize on the user's call

`crystallize` is **user-triggered**, not agent-triggered. The agent doesn't reliably know when a body of work is "done" — the user does. There is no separate per-session retro step: crystallize reads the git diff since `.last-crystallized`, runs the structural checks over it, and absorbs what stuck. Git history is the session log.

When the user says "crystallize", "update lexicon", "absorb the work", "feature X is done", "we're shipping X", or anything similar, run `crystallize`. Don't volunteer to crystallize unprompted.

If you suspect drift has accumulated (the git log shows substantive work since the last `.last-crystallized` but the cold layer hasn't moved, the same new concept repeating across commits), you may *surface* it as a question — "There've been several sessions on the inference path since the last crystallization and a `ScanQueue` concept now spans three files but isn't in the glossary — want to crystallize?" — and let the user decide. Surfacing is fine; running uninvited isn't.

## 6. Cold-layer edits go through `crystallize`

Don't edit `lexicon/system.xml`, `lexicon/contexts/*.xml`, or `lexicon/surfaces/*.xml` as a drive-by side effect of unrelated work. Cold-layer changes are deliberate: propose the typed mutations in conversation, get explicit approval, then apply. `crystallize` is the subcommand that does this; outside of it, leave the cold layer alone.

Direct edits ARE fine when the user explicitly asks for them — *"fix this typo in system.xml"*, *"add `ScanQueue` to the glossary now"*. The rule is against silent drive-by edits, not against deliberate small ones. A one-line edit the user asked for doesn't need the full `crystallize` ritual.

This applies to the design-system files too. Adding "just one more shade of blue" to the token list, or naming a new component inline, is a cold-layer edit — route through `crystallize` like any other vocabulary addition.

## 7. IDs are slugs; rename ≠ re-slug

Display `name:` mutates freely. The `id:` (slug) is the stable handle. Refs in other files use the slug; renaming a slug breaks them.

When a slug genuinely no longer fits the concept, treat it as a `crystallize` rename operation — the subcommand applies the slug change and cascades the reference updates in a single typed mutation. Don't change a slug inline as an editing afterthought; the references that already point at the old slug will dangle silently.

## 8. Respect project-specific overrides in `CLAUDE.md`

Project-specific overrides for lexicon's defaults — what to flag, what to skip, naming conventions, calibration — live in the project's `CLAUDE.md`. That file is loaded by Claude Code automatically at session start; treat its entries as live overrides of the defaults here, until a future `/lexicon:meta-evolve` pass absorbs them into the bundle.

Cross-project overrides (the role the old `lexicon-prefs.md` played) are not maintained here; that file is deprecated. The current mechanism is `/lexicon:meta-evolve` — when a correction recurs across projects and should generalize, meta-evolve amends the relevant SKILL.md or subcommand file in this bundle directly.

## When this workflow doesn't apply

If a project has no `lexicon/` folder, surface once near the start of substantive work: *"This project doesn't have lexicon docs. Want to run `bootstrap`?"* — and respect a "no" by not asking again that session. Use a `.lexicon-skip` marker file at the repo root if the user wants the skip to persist across sessions.

If a project's `lexicon/` is on an older schema (v0.3 YAML, v0.2 YAML, v0.1 YAML, or pre-v0.1 markdown `lexicon/system.md`), surface once: *"This project is on lexicon schema vX; v1.0 is current. Want to run `validate` first?"* Respect a "no"; the operational subcommands won't run cleanly until structural migration happens, and the viewer (if used) will refuse to render the project.

The workflow is opt-in per project. Small scripts, throwaway prototypes, and exploratory notebooks usually don't benefit.

## Honest limitations

- **The agent is a fallible filter.** Drift flags will sometimes be noise; real changes will sometimes be missed. The fix for systematic miscalibration is `/lexicon:meta-evolve`, not silent acceptance.
- **Cold-layer rot is real.** If the cold layer isn't getting crystallized despite the code moving underneath it, the workflow degrades to ceremony. The *user* has to actually run `crystallize` periodically; no skill design fixes a doc that's never reviewed.
- **Concurrent agents.** Code worktrees are isolated; the shared artifact worktree is not. Re-read before editing and serialize or surface overlapping writes. Untracked knowledge files may not produce ordinary git conflicts.
