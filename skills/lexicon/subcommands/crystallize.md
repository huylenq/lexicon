# Subcommand: crystallize

`retro` runs at every stopping point and logs drift flags. **`crystallize` runs when the user tells it to** — it absorbs accumulated retros into the cold layer.

The agent doesn't reliably know when a body of work is "done" or when accumulated drift is worth absorbing. The user does. So this subcommand is **user-triggered**: it runs when the user says so, not when the agent guesses.

## When to run this

Run when the user explicitly says one of:

- "crystallize" / "crystallize the work" / "crystallize feature X"
- "update lexicon" / "absorb the retros" / "sync lexicon"
- "we're done with X" / "feature X is shipped" / "wrap up X"

Don't volunteer this unprompted. If you suspect drift has accumulated, surface it as a question (*"There are 12 retros since the last crystallization, several flagging the same `ScanQueue` term — want to crystallize?"*) and let the user decide. The user is the trigger.

If the user just wants to make a small targeted edit ("add `ScanQueue` to the glossary"), apply that directly without running the full crystallize ritual. This subcommand is for *aggregated* updates; one-line edits are just edits.

### Period-scoped vs feature-scoped

By default, crystallize considers **all retros newer than `lexicon/.last-crystallized`** — period-scoped. This is the right mode for "update lexicon" / "absorb the retros."

If the user names a specific feature ("crystallize feature X", "we're done with X"), run **feature-scoped**: filter retros whose scope declaration references that feature, and consider only those. **Don't update `.last-crystallized` to "now" afterward** — that would skip the non-feature retros from a later period-scoped run. Instead, leave the marker untouched and tell the user: *"Crystallized feature X. <N> non-feature retros are still unaddressed — they'll show up in the next period-scoped crystallize."*

If the filter is ambiguous (the user says "crystallize the recent work" with no feature name), ask before guessing.

## Gather inputs

Read:

1. **The crystallization marker.** `lexicon/.last-crystallized` contains an ISO timestamp of the last successful crystallization. If absent, treat all retros as in-scope.
2. **All retros newer than the marker.** Files in `lexicon/retros/` whose names sort after the marker timestamp. Pay particular attention to:
   - `## Structural drift` sections (real flags worth absorbing).
   - `## Notes for future sweeps` (sub-flag-threshold patterns that may have crossed the line cumulatively).
3. **Cross-check with git.** Run `git log --since=<marker>` and `git diff <commit-at-marker>..HEAD` over the relevant code paths. Catches drift the retros missed (skipped retros, silent renames the structural checks didn't flag).
4. **The cold layer.** `lexicon/system.xml` plus whichever `lexicon/contexts/*.xml` and `lexicon/surfaces/*.xml` files the diff touches. Don't load every file — read what's relevant to the diff.

This is a bigger read than a retro. Take the time on it. **Crystallization done badly is worse than crystallization skipped** — a wrong glossary entry is harder to remove than a missing one is to add.

## Run the structural checks at cumulative scope

Run the six checks defined in `${CLAUDE_SKILL_DIR}/reference/checks.md`, applied **forward against the cumulative diff since the last crystallization**: *did the accumulated work shift the model?*

The cumulative framing changes how each check lands:

- **Vocabulary** — filter for terms that *stuck around and stabilized* across multiple sessions. A term that appeared in one retro and got renamed by the next isn't worth glossarying.
- **Vocabulary consistency** — look at coherence *across* all retros and the current code. If terminology drifted within the period, that's a vocabulary problem worth fixing.
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
> Retros considered: `<N>` (`<list of timestamps or a range>`)
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

If the user says **no**, ask: *"Skip these retros in future crystallizations? (yes updates the marker; no leaves them in scope)"*. This avoids re-proposing the same rejected mutations next time.

## Tight scope is structural, not editorial

The structured mutation set is the scoping mechanism: every touched entity appears as a typed op, every untouched entity is mechanically absent. The reviewer reads the *list of mutations* and knows everything else is unchanged. If they want to see the whole graph state after applying, they have the viewer.

That said, **still keep crystallization tightly scoped to what the period actually shifted**. Don't pile adjacent observations into the mutation set "while we're at it." A crystallization that touches every context file is a different kind of operation than one that touches three terms in one context — surface the difference honestly in the Summary block rather than hiding it in mutation count.

## On the relationship to retro

If retros ran consistently during the period, most of the work for crystallization is already done — you're aggregating across drift flags, not starting from scratch. If retros were *not* run (for whatever reason), crystallization has to do all the structural-check work on the full diff, which is harder and more error-prone. Surface that if you notice it: *"I see N retros over the last <period>, but the git history shows M sessions of substantive work; the crystallization may miss things that retros would have caught."*

The system is designed to work even with imperfect retro coverage, but it works *best* when retros were faithfully written along the way.

## On the relationship to conform

`conform`'s **semantic** pass surfaces drift candidates that this subcommand can absorb — the audit report's `Glossary findings`, `Invariant findings`, and `Bounded context findings` sections are valid input to a crystallization run even when no recent retros flagged them. When `conform.md` exists with semantic findings, the user may run `crystallize` with conform's output in mind; treat the conform report as additional input alongside the retros.

`conform`'s **structural** pass is a different beast — it edits files directly to migrate schemas. Don't conflate the two: structural-conform is mechanical, semantic-conform is triage, crystallize is interpretive absorption.
