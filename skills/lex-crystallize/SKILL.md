---
name: lex-crystallize
description: "Run when the user asks to update the cold layer — phrases like 'crystallize', 'update lexicon', 'sync lexicon', 'absorb the retros', 'feature X is done', 'we're shipping X'. User-triggered, not agent-triggered: don't volunteer this unprompted. Reads retros since the last crystallization, cross-checks against git diff, proposes a typed mutation set over the cold-layer YAML files inline in conversation, and applies it directly on the user's yes. Read lex-overview first."
---

# Lexicon: crystallize

`lex-retro` runs at every stopping point and logs drift flags. **`lex-crystallize` runs when you tell it to** — it absorbs accumulated retros into the cold layer.

The agent doesn't reliably know when a body of work is "done" or when accumulated drift is worth absorbing. The user does. So this skill is **user-triggered**: it runs when the user says so, not when the agent guesses.

If you haven't loaded `lex-overview` yet this session, read it first — the schema and the typed-mutation vocabulary below assume it.

## When to run this

Run when the user explicitly says one of:
- "crystallize" / "crystallize the work" / "crystallize feature X"
- "update lexicon" / "absorb the retros" / "sync lexicon"
- "we're done with X" / "feature X is shipped" / "wrap up X"

Don't volunteer this unprompted. If you suspect drift has accumulated, surface it as a question ("There are 12 retros since the last crystallization, several flagging the same `ScanQueue` term — want to crystallize?") and let the user decide. The user is the trigger.

If the user just wants to make a small targeted edit ("add `ScanQueue` to the glossary"), apply that directly without running the full crystallize ritual. This skill is for *aggregated* updates; one-line edits are just edits.

### Period-scoped vs feature-scoped

By default, crystallize considers **all retros newer than `.last-crystallized`** — period-scoped. This is the right mode for "update lexicon" / "absorb the retros."

If the user names a specific feature ("crystallize feature X", "we're done with X"), run **feature-scoped**: filter retros whose scope declaration references that feature, and consider only those. Don't update `.last-crystallized` to "now" afterward — that would skip the non-feature retros from a later period-scoped run. Instead, leave the marker untouched and tell the user: "Crystallized feature X. <N> non-feature retros are still unaddressed — they'll show up in the next period-scoped crystallize."

If the filter is ambiguous (the user says "crystallize the recent work" with no feature name), ask before guessing.

## Gather inputs

Read:

1. **The crystallization marker.** `lexicon/.last-crystallized` contains an ISO timestamp of the last successful crystallization. If absent, treat all retros as in-scope.
2. **All retros newer than the marker.** Files in `lexicon/retros/` whose names sort after the marker timestamp. Pay particular attention to:
   - `## Structural drift` sections (real flags worth absorbing).
   - `## Notes for future sweeps` (sub-flag-threshold patterns that may have crossed the line cumulatively).
3. **Cross-check with git.** Run `git log --since=<marker>` and `git diff <commit-at-marker>..HEAD` over the relevant code paths. Catches drift the retros missed (skipped retros, silent renames the structural checks didn't flag).
4. **The cold layer.** `lexicon/system.yaml` plus whichever `lexicon/contexts/*.yaml` and `lexicon/surfaces/*.yaml` files the diff touches. Don't load every file — read what's relevant to the diff.
5. **`lexicon/decisions/`** — recent ADRs that might overlap with what you're about to propose.
6. **`~/src/lexicon/lexicon-prefs.md`** — personal overrides. The Calibration section especially can change which retro flags are worth absorbing vs leaving as known-noise.

This is a bigger read than a retro. Take the time on it. Crystallization done badly is worse than crystallization skipped — a wrong glossary entry is harder to remove than a missing one is to add.

## Run the structural checks at cumulative scope

Run the six checks defined in `lex-overview` § Structural checks, applied **forward against the cumulative diff since the last crystallization**: *did the accumulated work shift the model?*

The cumulative framing changes how each check lands:

- **Vocabulary** — filter for terms that *stuck around and stabilized* across multiple sessions. A term that appeared in one retro and got renamed by the next isn't worth glossarying.
- **Vocabulary consistency** — look at coherence *across* all retros and the current code. If terminology drifted within the period, that's a vocabulary problem worth fixing.
- **Invariants** — look for adds, removes, modifications across the whole diff, not per-session.
- **Boundaries** — re-look at the bounded-contexts model with fresh eyes; cumulative boundary changes often hide in incremental session diffs.
- **Decisions** — prefer a single ADR for a coherent decision arc when scattered session-level decisions cohere into one story.
- **Declared scope match (cumulative)** — did the work as a whole stay where it said it would, or did it become something else? If it became something else, that often reveals a model update.

## Surface pre-existing inconsistencies

If the existing cold layer already contains entries that look mutually inconsistent — a term defined two slightly different ways across contexts, an invariant that contradicts another, an ADR `affects:` set that points at deleted entities — **surface this to the user before proposing the new mutation set**. Don't smooth it over silently.

These usually come from previous incomplete edits, concurrent sessions that didn't reconcile, or older content that got partially updated. The right move is to name what you found and ask: "Should I reconcile this as part of the crystallization, or is it intentional?" Reconciling without asking is exactly the kind of silent edit lexicon exists to prevent.

## Propose the mutation set inline

Don't write a proposal file. Present the proposed changes **in conversation** as a typed mutation set, grouped by target file. The user reviews structured operations; the file edits follow on yes.

### Mutation vocabulary

Use these operation kinds when describing changes:

| Op | Shape | Example |
|---|---|---|
| `create` | New entity in a file | `create term inference/scan-queue` |
| `update` | Field-level change to an existing entity | `update term inference/worker.definition` (prose diff shown) |
| `rename` | Slug change with reference cascade | `rename term inference/worker → inference/run-worker` (affects <K> refs in <F> files) |
| `move` | Re-ownership across contexts | `move term inference/worker → billing/worker` |
| `deprecate` | Soft-delete via `status: deprecated` | `deprecate term inference/old-queue` |
| `delete` | Hard removal (rare; for mistakes) | `delete term inference/typo-name` |
| `add-anchor` | Add a `symbols` or `constrainsCode` entry | `add-anchor term inference/worker += src/worker.ts#Worker` |
| `set-status` | ADR transition | `set-status decision/ADR-0007 = superseded` (and supersededBy on the older one) |

For each `update`, show the **prose diff** in the chat — the human-readable change to definition / statement / rationale / body. For structural ops (rename / move / deprecate / status transition), the description and target are enough; the reference cascade is mechanical.

### Proposal shape in chat

> ## Crystallization proposal
> Period: `<marker timestamp>` → now
> Retros considered: `<N>` (`<list of timestamps or a range>`)
> Targets: `<comma-separated list of YAML files>`
>
> ### Summary
> <2-3 sentences: what does the system do now that it didn't before, or what did we learn that wasn't captured?>
>
> ### Mutations
>
> **`lexicon/contexts/inference.yaml`**
> - `create` term `scan-queue`
>   ```
>   definition: ordered buffer holding inference jobs between intake and the worker pool. Distinct from job-queue (per-worker).
>   disambiguatesFrom: [inference/job-queue]
>   symbols:
>     - file: src/inference/scan_queue.ts
>     - symbol: ScanQueue
>   ```
> - `update` term `worker`, field `definition`
>   ```diff
>   - definition: a process that pulls jobs from the queue and runs the model.
>   + definition: a worker process that pulls jobs from scan-queue and runs the model. Holds a per-worker job-queue while running.
>   ```
> - `rename` term `inference/worker` → `inference/run-worker`  *(cascades: 3 refs in inference.yaml, 1 in billing.yaml)*
>
> **`lexicon/decisions/`**
> - `create` ADR-0042 "Introduce scan-queue between intake and workers"
>   - `affects:` [inference/scan-queue, inference/worker, inference/intake]
>   - body to be written after approval if you accept
>
> ### Confidence: <low | medium | high>
>
> Apply this? (yes / revise / no)

Per-mutation rendering should make the *structural intent* obvious; prose diffs show *what the human cares about*. Don't dump the full YAML for every change — show only what's mutating, and let the user trust the cascade for mechanical reference updates.

If the project has many context files and the mutation set spans more than half of them, that's a sign the period saw a model shift, not just incremental drift. Surface it: "this crystallization touches <N> of <M> contexts — does the partitioning still feel right, or has the model moved?"

## Apply on yes

When the user says yes:

1. **Apply each mutation** to its target file using Edit. Single Edit per mutation where possible.
2. **For rename / move operations**, cascade reference updates across all files in `lexicon/`. Don't ask per-file — that's what the cascade declaration in the proposal was for. If a cascade can't be performed mechanically (ambiguous ref), surface the specific case and ask.
3. **Append new ADRs** to `lexicon/decisions/` as fresh YAML files (`ADR-<NNNN>-<slug>.yaml`). Use the next available NNNN.
4. **If a feature plan was involved**, move `lexicon/plans/<feature>/` to `lexicon/plans/_archive/<feature>/` (ask first if the user didn't explicitly ask to wrap up the feature).
5. **Update the marker.** Write the current ISO timestamp to `lexicon/.last-crystallized`.
6. **Confirm in chat**: "Crystallized. <N> mutations applied across <F> files; <K> ADRs added; <R> reference cascades. Marker updated."

If the user says **revise**, iterate on the proposal in conversation. Don't apply partial mutation sets unilaterally.

If the user says **no**, **still update the marker** if they want future crystallizations to skip these retros — ask: "Skip these retros in future crystallizations? (yes updates the marker; no leaves them in scope)". This avoids re-proposing the same rejected mutations next time.

## Tight scope is structural, not editorial

In the markdown era this skill had a "deliberately NOT changing" section to keep proposals reviewable. The structured mutation set replaces that mechanism: every touched entity appears as a typed op, every untouched entity is mechanically absent. The reviewer reads the *list of mutations* and knows everything else is unchanged. If they want to see the whole graph state after applying, they have the viewer.

That said, **still keep crystallization tightly scoped to what the period actually shifted**. Don't pile adjacent observations into the mutation set "while we're at it." A crystallization that touches every context file is a different kind of operation than one that touches three terms in one context — surface the difference honestly in the Summary block rather than hiding it in mutation count.

## Suggesting prefs entries

If during the cumulative pass you notice the same kind of flag rejected repeatedly across retros (e.g., the same term flagged 3+ times and never absorbed into the glossary, the same kind of structural concern dismissed every time), surface it as a candidate for `lexicon-prefs.md` Calibration section: "I see <pattern> flagged <N> times across retros, all dismissed. Want me to add a prefs entry so retros stop flagging it?" Single yes/no. Don't pile prefs suggestions on top of every crystallization — only when the rejection pattern is clear.

This is the slower of the two feedback channels (the faster one is `lex-retro` capturing explicit `for lexicon: <X>` statements). It catches the cases where the user hasn't named the pattern themselves but the data is screaming it.

## On the relationship to retro

If retros ran consistently during the period, most of the work for crystallization is already done — you're aggregating across drift flags, not starting from scratch. If retros were *not* run (for whatever reason), crystallization has to do all the structural-check work on the full diff, which is harder and more error-prone. Surface that if you notice it: "I see N retros over the last <period>, but the git history shows M sessions of substantive work; the crystallization may miss things that retros would have caught."

The system is designed to work even with imperfect retro coverage, but it works *best* when retros were faithfully written along the way.
