# Subcommand: meta-evolve

The **self-evolve** subcommand for the lexicon bundle itself. When the lexicon skill produces output the user has to correct — a wrong vocabulary call, a clumsy invariant, an over-eager flag — that correction is evidence of a bundle bug. `meta-evolve` is how the lesson lands back in `~/src/lexicon/skills/lexicon/`, in the same session, while the rationale is still in conversation.

It is **slash-only**: it runs when the user invokes `/lexicon:meta-evolve [optional prompt]`. The single-skill architecture means `disable-model-invocation` can't enforce this mechanically (the lexicon skill is model-invocable for all the other subcommands), so this is a **soft rule** the subcommand enforces:

> **If `meta-evolve` was reached by model inference rather than an explicit `/lexicon:meta-evolve` invocation, stop and ask the user before proceeding.** Bundle-edit work is deliberate; volunteering it would slide back into the "agent decides what's significant" failure mode the rest of the workflow rejects.

## When to run this

Run when the user invokes `/lexicon:meta-evolve`, optionally followed by a prompt pointing at the angle or moment they care about. Typical scenarios:

- The user just edited a file under the project's `lexicon/` folder and wants the underlying subcommand to "learn" from that correction.
- The user pushed back on something a lexicon subcommand did earlier in the session ("no, don't auto-categorize terms; always interview") and now wants the rule captured.
- The user wants a behavioral tweak to a subcommand they've been thinking about.

Don't run when:

- The user is making a one-off project-specific correction with no bundle implication — that's just an edit. `/lexicon:meta-evolve` is for **lessons that should generalize across projects**.
- The session is in the lexicon repo itself (`~/src/lexicon/`). Edit `SKILL.md`, the responsible subcommand file, or a reference file directly; you're already there.
- The reach was inference, not an explicit slash. Ask first.

## Gather inputs

Read, in this order of importance:

1. **The session conversation.** This is the primary signal. The *why* of the correction lives here — the moment the user said "no, do it this way" or "that's not right because X". Scan actively for those moments; don't just look at the most recent turn. The richest signal is usually a few turns before the user typed `/lexicon:meta-evolve`.
2. **The optional prompt.** If the user supplied text after `/lexicon:meta-evolve`, treat it as the user pointing at the specific angle they care about. It narrows the search.
3. **`git diff` on the project's `lexicon/` folder.** Compare against the **session start state** — the changes you care about are the ones made *this session*, not pre-existing uncommitted state. If you can't establish the session-start anchor from the conversation (no scope declaration from `ground`, no clear first turn, post-compaction), ask the user rather than fabricating one from `HEAD`. Corroborates the conversation — shows what actually landed in the cold layer.
4. **Existing dirty state of the lexicon bundle repo (`~/src/lexicon/`).** Run `git -C ~/src/lexicon status` and `git -C ~/src/lexicon diff`. There may be uncommitted edits from earlier `/lexicon:meta-evolve` invocations. **The dirty working tree of the lexicon repo is the accumulation buffer for this subcommand** — a new edit may extend or refine an existing uncommitted change rather than introducing a parallel one.
5. **The relevant target file** once you've identified what's responsible. Quote the current text you intend to amend — don't propose blindly.

If the session conversation is post-compaction and the moment you're looking for has been summarized away, say so and ask the user to restate. Don't fabricate rationale from the diff alone.

## Locate the offending moment

Scan the conversation for:

- The user explicitly correcting something the agent did (the strongest signal).
- The user accepting a non-default suggestion after pushback (a quieter signal but still real).
- A `for lexicon:` style preference statement (legacy phrasing — still valid as input).
- A moment where the agent invoked a lexicon subcommand and the output got reworked.

Identify, for that moment:

- **Which target file is responsible.** Options:
  - `skills/lexicon/SKILL.md` — for cross-cutting rules (dispatch, standing rules, project shape).
  - `skills/lexicon/subcommands/<name>.md` — for subcommand-specific behavior (bootstrap, ground, crystallize, validate, meta-evolve itself).
  - `skills/lexicon/reference/schema.md` — for schema specification corrections.
  - `skills/lexicon/reference/checks.md` — for structural-check definitions.
  - `skills/lexicon/reference/rules.md` — for rules-of-engagement edge cases.
- What the subcommand (or reference) did wrong. State it in one sentence in your own words.
- What instruction in the target file would have prevented it. This is the inference step; it is where hallucination lives. If you can't point at a specific phase, paragraph, or rule in the current file that should change, **don't propose an edit yet** — interview first.

## Triage

Before proposing any change, classify the correction into one of three branches:

- **Bundle edit** — the lesson generalizes across projects. → Edit the responsible file in `~/src/lexicon/skills/lexicon/`. This is the main path `/lexicon:meta-evolve` is for.
- **Project-specific quirk** — only this project has this constraint. → Belongs in the project's `CLAUDE.md` (or the project's own `lexicon/`), not in the bundle. Suggest where it should go and stop; don't touch the bundle.
- **No-op** — the correction was incidental, the subcommand was right, the user just preferred a different cosmetic this once. → Say so and stop. `/lexicon:meta-evolve` invoked is not a contract to produce an edit; producing one when none is warranted poisons future runs.

Within the **bundle edit** branch, ask a sub-question that shapes how the proposal is *labeled* (not where it routes): *is this an objective bundle bug (the subcommand produced something incorrect, misleading, or against its own stated rules) or a taste call (the user prefers a style that goes against a defensible default)?* Both produce a file edit, but the proposal should name which it is. Taste calls deserve an explicit "you're sure you want this as a global rule?" confirmation — the bundle is being shaped to user preference through continuous use, so taste edits are valid, they just shouldn't be silent.

State your triage call (and, for bundle edits, the bug-vs-taste label) to the user before proceeding to the proposal.

## Interview to disambiguate

If conversation + diff + prompt leave any of the following unclear, ask — don't guess:

- **Which target file is responsible**, when the moment could plausibly belong to more than one (e.g., a vocabulary issue could be `subcommands/ground.md`'s naming guidance or `subcommands/crystallize.md`'s absorption rules).
- **The lesson's scope**, when it's not obvious whether this is a general rule or specific to a class of situations.
- **Whether to amend an existing instruction or add a new one** — when the current file is silent on the case, the user may have a preference about where the new rule belongs.

Keep the interview tight — three or four questions max. If the conversation already answered something, don't re-ask. The point of being a slash command (not a phrase trigger) is that the user is on the line; use the audience.

## Propose the edit inline

Present the proposal in chat. Structure:

> ## `/lexicon:meta-evolve` proposal
>
> **Triage:** <bundle-bug | taste | project-quirk | no-op>
> **Target file:** `~/src/lexicon/skills/lexicon/<path>`
> **Lesson (in one sentence):** <what should the bundle do differently>
>
> ### Current text — § `<section heading>`
>
> ```
> <quote the current paragraph or instruction being amended>
> ```
>
> ### Proposed amendment
>
> ```diff
> - <old line>
> + <new line>
> ```
> *(or: add a new paragraph under § `<section>`, shown below)*
>
> ### Why this would have caught the moment
> <one or two sentences tying the amendment back to the conversation moment that motivated it>
>
> ### Note on accumulation
> <if there are existing uncommitted edits in the lexicon repo that this extends or refines, mention them>
>
> Apply this? (yes / revise / no)

Quote the current text verbatim. If you find yourself paraphrasing because you didn't read the file, stop and read it.

If the right amendment would touch more than one file, propose each separately under the same proposal. Don't bundle unrelated changes — one moment, one lesson.

## Apply on yes — but do not commit

When the user says yes:

1. **Apply the edit** to the relevant file under `~/src/lexicon/skills/lexicon/` using Edit. **Cross-repo write** — the target is in `~/src/lexicon/`, not the current project.
2. **Do NOT commit** in the lexicon repo. Leave the change in the working tree, uncommitted. This is deliberate: the dirty state across multiple `/lexicon:meta-evolve` invocations is the accumulation buffer, and the user reviews + commits + pushes when they sit down in the lexicon repo intentionally.
3. **Confirm in chat**: *"Amended `~/src/lexicon/skills/lexicon/<path>` § <section>. Bundle repo now has <N> uncommitted edits across <M> files."* The count gives the user passive awareness of accumulation without nagging.

If the user says **revise**, iterate on the proposal in conversation. Don't apply a partial amendment.

If the user says **no**, don't apply anything. Note (silently) that the correction was deemed not bundle-worthy and let the moment pass.

## Worked example

To ground the abstract template, here's a plausible run.

**Scenario.** Earlier in the session, `crystallize` proposed a `rename` operation on a glossary term but only showed the structural op header — no prose diff for the term's definition. The user had to ask "what's the new definition?" before the agent surfaced it. After the crystallization landed, the user types:

> /lexicon:meta-evolve when a rename changes a term's meaning, show the prose diff alongside it

What `meta-evolve` does:

1. **Locate the moment.** Scan finds the turn where the user asked "what's the new definition?" — that's the pushback. The subcommand produced an output the user had to repair.
2. **Triage.** Bundle edit, labeled as a **bundle bug** — `crystallize` already has a rule about prose diffs, it just doesn't cover the rename-with-semantic-shift case. Not taste; the subcommand should already be doing this.
3. **Locate the responsible instruction.** Read `~/src/lexicon/skills/lexicon/subcommands/crystallize.md` and quote the current text:
   > For each `update`, show the **prose diff** in chat — the human-readable change to definition / statement / rationale / body. For structural ops (rename / move / deprecate / status transition), the description and target are enough; the reference cascade is mechanical.
4. **Propose amendment** (inline in chat, using the template above). Add a clause: *"When a rename carries a semantic shift (the new name implies a different definition, not just better phrasing), bundle it as rename + update and show the prose diff for the definition. The reference cascade remains mechanical."*
5. **Apply on yes.** Edit `subcommands/crystallize.md`. Leave uncommitted in the lexicon repo. Confirm: *"Amended `subcommands/crystallize.md` § Mutation vocabulary. Bundle repo now has 1 uncommitted edit across 1 file."*

The whole exchange takes three or four turns because the conversation already carried the rationale ("I had to ask"). The interview was unnecessary.

## Anti-patterns

- **Inventing reasons to edit.** Every `/lexicon:meta-evolve` invocation is *not* a contract to produce an amendment. If triage lands on "no bundle change," that's a successful run — say so and stop. Producing edits when none are warranted is exactly how the bundle accumulates noise.
- **Editing without quoting.** If you can't quote the current text being amended, you don't understand what you're changing. Read first.
- **Bundling unrelated lessons.** One moment, one lesson, one proposal. If the user wants to capture three things, that's three `/lexicon:meta-evolve` invocations.
- **Committing in the lexicon repo.** Never. The dirty working tree is the buffer; the user owns the push.
- **Treating the diff as primary.** The conversation has the *why*; the diff only has the *what*. A diff-first reading produces plausible-sounding rationale that doesn't match what actually happened in the session.
- **Reaching meta-evolve by inference.** This is slash-only. If the dispatch reached you without an explicit `/lexicon:meta-evolve`, stop and ask the user.

## On the relationship to the other subcommands

`meta-evolve` is the inverse of every other subcommand: where they take the bundle as authoritative and reshape the project, `meta-evolve` takes the project session as authoritative and reshapes the bundle. It is the only self-evolve mechanism the bundle has; everything else (crystallize, validate) evolves the *project's* cold layer, not the bundle itself.

Because of that asymmetry, `meta-evolve` doesn't write to any project file. It does not update `.last-crystallized`, does not touch `lexicon/system.xml`. Its entire output is in the lexicon bundle repo and a confirmation message in chat.
