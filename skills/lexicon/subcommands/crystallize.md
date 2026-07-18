# Subcommand: crystallize

**`crystallize` runs when the user tells it to** — it absorbs accumulated work into the cold layer. It is the only subcommand that catches and absorbs session drift: it reads what changed since the last crystallization (the git diff), runs the structural checks over it, and proposes typed mutations. There is no separate per-session retro step — **git history is the session log**, and crystallize is where it gets read.

The agent doesn't reliably know when a body of work is "done" or when accumulated drift is worth absorbing. The user does. So this subcommand is **user-triggered**: it runs when the user says so, not when the agent guesses.

## When to run this

Run when the user explicitly says one of:

- "crystallize" / "crystallize the work" / "crystallize feature X"
- "update lexicon" / "absorb the work" / "sync lexicon"
- "we're done with X" / "feature X is shipped" / "wrap up X"

Don't volunteer this unprompted. If you suspect drift has accumulated, surface it as a question (*"The git history shows several sessions of work on the inference path since the last crystallization, and a `ScanQueue` concept now appears across three files but isn't in the glossary — want to crystallize?"*) and let the user decide. The user is the trigger.

If the user just wants to make a small targeted edit ("add `ScanQueue` to the glossary"), apply that directly without running the full crystallize ritual. This subcommand is for *aggregated* updates; one-line edits are just edits.

### Period-scoped vs feature-scoped

By default, crystallize considers **everything in the git diff since `lexicon/.last-crystallized`** — period-scoped. This is the right mode for "update lexicon" / "absorb the work."

If the user names a specific feature ("crystallize feature X", "we're done with X"), run **feature-scoped**: narrow the diff to that feature's code paths and consider only those changes. **Don't update `.last-crystallized` to "now" afterward** — that would skip the non-feature changes from a later period-scoped run. Instead, leave the marker untouched and tell the user: *"Crystallized feature X. Other changes since the last crystallization are still unaddressed — they'll show up in the next period-scoped crystallize."*

If the scope is ambiguous (the user says "crystallize the recent work" with no feature name), ask before guessing.

## Gather inputs

Read:

1. **The crystallization marker.** `lexicon/.last-crystallized` contains an ISO timestamp of the last successful crystallization. If absent, treat the project's whole history as in-scope (or ask the user for a sensible starting point on a large repo).
2. **The git diff since the marker.** This is the primary signal — what actually changed. Run `git log --since=<marker>` to see the sessions, and `git diff <commit-at-marker>..HEAD` over the relevant code paths to see the substance. The diff is what the structural checks run against.
3. **Recent-session conversation, when available.** The scope declarations and vocabulary discussions from `ground` and from working sessions live in conversation, not in any file. If the current session did the work being crystallized, that context is right here; if crystallizing across older sessions, lean on the git diff and commit messages instead.
4. **The cold layer.** `lexicon/system.xml` plus whichever `lexicon/contexts/*.xml` and `lexicon/surfaces/*.xml` files the diff touches. Don't load every file — read what's relevant to the diff.
5. **The laxicon, if present.** A sibling `laxicon/` directory (free-form human notes, possibly under `laxicon/knowledge/`) is a *source* to mine — not a target to edit. Where the diff shows the work but not the reasoning, the laxicon often holds the "why" worth lifting into a `rationale:` field, or names a concept that stabilized and deserves a glossary term. Read the notes relevant to the period's work; never rewrite or restructure them. Distillation is one-way: laxicon → lexicon.

Take the time on it. **Crystallization done badly is worse than crystallization skipped** — a wrong glossary entry is harder to remove than a missing one is to add.

## Detect candidates mechanically (run before the checks)

Before working the checks from memory, run the standalone signals validator over the same range and present what it finds. This turns the six checks from *recall* (notice every new cross-context import, remember every glossary term to spot a rename, recall which symbols are anchored) into *triage* (filter and confirm a candidate list):

```
bun ${CLAUDE_SKILL_DIR}/validators/crystallize-signals.ts <projectRoot> [gitRange]
```

It is **standalone** — tree-sitter only, no running viewer server, no LSP. The range defaults to commits newer than `lexicon/.last-crystallized` (the same window this subcommand already considers); pass the range explicitly for a feature-scoped run. It emits a candidate block — `**Detected N candidates — triage:**` — with three sub-sections:

- **Consistency candidates (check 2 — HIGH)** — an anchored symbol renamed, moved, or deleted in the diff. High-priority because this is exactly the silent-rename drift lexicon exists to kill: the anchor is now stale and the atom needs re-pointing or renaming.
- **Vocabulary candidates (check 1)** — new symbols in the diff that no term anchors. Glossary candidates.
- **Boundary candidates (check 4)** — cross-context structure-tier edges (`extends` / `implements` / `uses`) touching the diff. Call-flow (`calls`-edge) crossings self-announce "not checked (no LSP)" — best-effort, never silently-wrong.

Present this block **before** the proposal so the user sees the raw structural facts first. The candidates are **advisory structural triggers, never auto-applied** — they feed the proposal you build next, they don't bypass the user's per-mutation confirmation. They do **not** make `crystallize` agent-triggered; it stays user-triggered (this run already started because the user asked). And they carry **no significance or size scoring** — a candidate is a binary structural fact ("this symbol is unanchored", "this edge crosses a boundary"), never a judgment that something "looks important." Most candidates won't deserve a mutation; triaging them down is the job, and a large diff producing many vocabulary candidates is expected — filter aggressively.

## Run the structural checks at cumulative scope

Run the six checks defined in `${CLAUDE_SKILL_DIR}/reference/checks.md`, applied **forward against the cumulative diff since the last crystallization**: *did the accumulated work shift the model?* The candidate block above is the mechanical input to checks 1, 2, and 4 — work from it rather than re-deriving the same facts by reading.

The cumulative framing changes how each check lands:

- **Vocabulary** — filter for terms that *stuck around and stabilized* across the period. A term that appeared mid-period and got renamed before HEAD isn't worth glossarying; check the diff's final state, not every intermediate commit.
- **Vocabulary consistency** — look at coherence *across* the whole diff and the current code. If terminology drifted within the period, that's a vocabulary problem worth fixing.
- **Invariants** — look for adds, removes, modifications across the whole diff, not per-session.
- **Boundaries** — re-look at the bounded-contexts model with fresh eyes; cumulative boundary changes often hide in incremental session diffs.
- **Decisions** — when scattered session-level decisions cohere into one argument, propose a single coherent `rationale:` lift onto the atom the argument justifies (an invariant, a seam's `kind` choice, an aggregate's boundary). v0.3 has no separate ADR slot — the argument lives next to the thing it argues for.
- **Declared scope match (cumulative)** — did the work as a whole stay where it said it would, or did it become something else? If it became something else, that often reveals a model update.

## Surface pre-existing inconsistencies

If the existing cold layer already contains entries that look mutually inconsistent — a term defined two slightly different ways across contexts, an invariant that contradicts another, an aggregate's `members:` pointing at a deleted term, a seam whose `upstream`/`downstream` refer to nonexistent contexts — **surface this to the user before proposing the new mutation set**. Don't smooth it over silently.

These usually come from previous incomplete edits, concurrent sessions that didn't reconcile, or older content that got partially updated. The right move is to name what you found and ask: *"Should I reconcile this as part of the crystallization, or is it intentional?"* Reconciling without asking is exactly the kind of silent edit lexicon exists to prevent.

## Propose the mutation set inline

Don't write a proposal file. Present the proposed changes **in conversation** as a typed mutation set, grouped by target file. The user reviews structured operations; the file edits follow on yes.

### Mutation vocabulary

| Op | Shape | Example |
|---|---|---|
| `create` | New entity in a file | `create term inference/scan-queue` |
| `update` | Field-level change to an existing entity | `update term inference/worker.definition` (prose diff shown) |
| `rename` | Slug change with reference cascade | `rename term inference/worker → inference/run-worker` (affects <K> refs in <F> files) |
| `move` | Re-ownership across contexts | `move term inference/worker → billing/worker` |
| `deprecate` | Soft-delete via `status: deprecated` | `deprecate term inference/old-queue` |
| `delete` | Hard removal (rare; for mistakes) | `delete term inference/typo-name` |
| `add-anchor` | Add a `symbols` or `constrainsCode` entry | `add-anchor term inference/worker += src/worker.ts#Worker` |
| `add-rationale` | Add (or replace) a `rationale:` field on an atom | `add-rationale invariant inference/scan-queue-bound` (prose shown) |
| `set-category` | Set a term's `category` | `set-category term inference/scan-queue = value` |
| `set-seam-kind` | Set a seam's `kind` (and direction fields) | `set-seam-kind context/inference/seam/storage = anticorruption-layer` (upstream=storage, downstream=inference) |
| `set-status` | Lifecycle transition on an atom | `set-status term inference/old-queue = deprecated` |

For each `update`, show the **prose diff** in chat — the human-readable change to definition / statement / rationale / body. For structural ops (rename / move / deprecate / status transition), the description and target are enough; the reference cascade is mechanical.

When a `rename` carries a **semantic shift** (the new name implies a different definition, not just better phrasing), bundle it as `rename + update` and show the prose diff for the definition. The reference cascade remains mechanical.

### Proposal shape in chat

> ## Crystallization proposal
> Period: `<marker timestamp>` → now
> Commits considered: `<N>` (`<short range, e.g. abc123..HEAD>`)
> Targets: `<comma-separated list of XML files>`
>
> ### Summary
> <2-3 sentences: what does the system do now that it didn't before, or what did we learn that wasn't captured?>
>
> ### Mutations
>
> **`lexicon/contexts/inference.xml`**
> - `create` term `scan-queue`
>   ```xml
>   <term id="scan-queue" category="value">
>     <name>scan queue</name>
>     <definition>
>       Ordered buffer holding inference jobs between intake and the worker
>       pool. Distinct from <ref to="job-queue"/> (per-worker).
>     </definition>
>     <disambiguates-from><ref to="job-queue"/></disambiguates-from>
>     <symbols>
>       <code-anchor file="src/inference/scan_queue.ts" symbol="ScanQueue"/>
>     </symbols>
>   </term>
>   ```
> - `update` term `worker`, element `<definition>`
>   ```diff
>   - <definition>A process that pulls jobs from the queue and runs the model.</definition>
>   + <definition>A worker process that pulls jobs from <ref to="scan-queue"/> and runs the model. Holds a per-worker job-queue while running.</definition>
>   ```
> - `rename` term `inference/worker` → `inference/run-worker`  *(cascades: 3 refs in inference.xml, 1 in billing.xml)*
>
> **`lexicon/contexts/inference.xml`** (rationale lift)
> - `add-rationale` invariant `inference/scan-queue-bound`
>   ```xml
>   <rationale>
>     The bound exists because intake bursts can outpace worker throughput by
>     5–10x; without a queue the system either drops jobs (silent failure) or
>     backpressures intake (cascading outage). 1k is small enough to flush on a
>     worker restart and large enough to absorb the observed burst pattern.
>   </rationale>
>   ```
>
> ### Confidence: <low | medium | high>
>
> Apply this? (yes / revise / no)

Per-mutation rendering should make the *structural intent* obvious; prose diffs show *what the human cares about*. Don't dump the full XML for every change — show only what's mutating, and let the user trust the cascade for mechanical reference updates.

If the project has many context files and the mutation set spans more than half of them, that's a sign the period saw a model shift, not just incremental drift. Surface it: *"this crystallization touches <N> of <M> contexts — does the partitioning still feel right, or has the model moved?"*

## Apply on yes

When the user says yes:

1. **Apply each mutation** to its target file using Edit. Single Edit per mutation where possible.
2. **For rename / move operations**, cascade reference updates across all files in `lexicon/`. Don't ask per-file — that's what the cascade declaration in the proposal was for. If a cascade can't be performed mechanically (ambiguous ref), surface the specific case and ask.
3. **If a feature plan was involved**, move `lexicon/plans/<feature>/` to `lexicon/plans/_archive/<feature>/` (ask first if the user didn't explicitly ask to wrap up the feature).
4. **Update the marker.** Write the current ISO timestamp to `lexicon/.last-crystallized`.
5. **Confirm in chat**: *"Crystallized. <N> mutations applied across <F> files; <R> reference cascades. Marker updated."*

If the user says **revise**, iterate on the proposal in conversation. Don't apply partial mutation sets unilaterally.

If the user says **no**, ask: *"Advance the marker past this period anyway? (yes moves `.last-crystallized` to now so these changes aren't re-proposed; no leaves the period in scope)"*. This avoids re-proposing the same rejected mutations next time.

## Tight scope is structural, not editorial

The structured mutation set is the scoping mechanism: every touched entity appears as a typed op, every untouched entity is mechanically absent. The reviewer reads the *list of mutations* and knows everything else is unchanged. If they want to see the whole graph state after applying, they have the viewer.

That said, **still keep crystallization tightly scoped to what the period actually shifted**. Don't pile adjacent observations into the mutation set "while we're at it." A crystallization that touches every context file is a different kind of operation than one that touches three terms in one context — surface the difference honestly in the Summary block rather than hiding it in mutation count.

## On the git diff as the source of truth

Crystallization does all its structural-check work on the diff since the last marker — there is no per-session retro log feeding it pre-digested flags. This makes the quality of the run depend on the diff being legible: a long period with many intertwined changes is harder to crystallize accurately than a tight, recently-marked one. Encourage the user to crystallize at natural boundaries (a shipped feature, a coherent body of work) rather than letting the marker drift for months. If the period is genuinely sprawling, say so: *"This is ~40 commits across four areas since the last crystallization — I can do it, but it'll be more reliable if we scope to one area at a time. Want to?"*

## On the relationship to validate

`validate`'s **semantic** pass surfaces drift candidates that this subcommand can absorb — the report's `Glossary findings`, `Invariant findings`, and `Bounded context findings` sections are valid input to a crystallization run. When `lexicon/validate.md` exists with semantic findings, the user may run `crystallize` with validate's output in mind; treat the validate report as additional input alongside the git diff.

`validate`'s **structural** pass is a different beast — it edits files directly to migrate schemas. Don't conflate the two: structural-validate is mechanical, semantic-validate is triage, crystallize is interpretive absorption.
