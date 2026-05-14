---
name: lex-meta
description: "Run when the user invokes `/lex-meta [optional prompt]` after correcting something a lexicon skill produced — either an edit to the project's `lexicon/` folder or pushback earlier in the session against a skill's output. This is the self-evolve loop for the lexicon skill bundle itself: take the correction as a lesson and amend the responsible SKILL.md in `~/src/lexicon/`. User-triggered only; never volunteer this. Read lex-overview first."
---

# Lexicon: meta

This is the **self-evolve** skill for lexicon itself. When a lexicon skill produces output you have to correct — a wrong vocabulary call, a clumsy invariant, an over-eager flag — that correction is evidence of a skill bug. `lex-meta` is how the lesson lands back in the responsible `SKILL.md`, in the same session, while the rationale is still in conversation.

It is **user-triggered only**: it runs when the user says `/lex-meta` (with or without an additional prompt). Don't volunteer it. The agent is not the judge of whether its own output was wrong.

If you haven't loaded `lex-overview` yet this session, read it first — you'll need the project shape and skill inventory.

## When to run this

Run when the user invokes `/lex-meta`, optionally followed by a prompt pointing at the angle or moment they care about. Typical scenarios:

- The user just edited a file under the project's `lexicon/` folder and wants the underlying skill to "learn" from that correction.
- The user pushed back on something a lexicon skill did earlier in the session ("no, don't auto-categorize terms; always interview") and now wants the rule captured.
- The user wants a behavioral tweak to a skill they've been thinking about, and `/lex-meta` is the route to it.

Don't run when:
- The user is making a one-off project-specific correction with no bundle implication — that's just an edit. `/lex-meta` is for **lessons that should generalize across projects**.
- The session is in the lexicon repo itself (`~/src/lexicon/`). Edit `SKILL.md` directly; you're already there.

## Gather inputs

Read, in this order of importance:

1. **The session conversation.** This is the primary signal. The *why* of the correction lives here — the moment the user said "no, do it this way" or "that's not right because X". Scan actively for those moments; don't just look at the most recent turn. The richest signal is usually a few turns before the user typed `/lex-meta`.
2. **The optional prompt.** If the user supplied text after `/lex-meta`, treat it as the user pointing at the specific angle they care about. It narrows the search.
3. **`git diff` on the project's `lexicon/` folder.** Compare against the **session start state** — the changes you care about are the ones made *this session*, not pre-existing uncommitted state. If you can't establish the session-start anchor from the conversation (no scope declaration from `lex-ground`, no clear first turn, post-compaction), ask the user rather than fabricating one from `HEAD`. Corroborates the conversation — shows what actually landed in the cold layer.
4. **Existing dirty state of the lexicon bundle repo (`~/src/lexicon/`).** Run `git -C ~/src/lexicon status` and `git -C ~/src/lexicon diff`. There may be uncommitted SKILL.md edits from earlier `/lex-meta` invocations. **The dirty working tree of the lexicon repo is the accumulation buffer for this skill** — a new edit may extend or refine an existing uncommitted change rather than introducing a parallel one.
5. **The relevant `~/src/lexicon/skills/<skill>/SKILL.md`** once you've identified which skill is responsible. Quote the current text you intend to amend — don't propose blindly.

If the session conversation is post-compaction and the moment you're looking for has been summarized away, say so and ask the user to restate. Don't fabricate rationale from the diff alone.

## Locate the offending moment

Scan the conversation for:
- The user explicitly correcting something the agent did (the strongest signal).
- The user accepting a non-default suggestion after pushback (a quieter signal but still real).
- A `for lexicon:` style preference statement (legacy phrasing — still valid as input).
- A moment where the agent invoked a lexicon skill and the output got reworked.

Identify, for that moment:
- Which skill produced the output. (`lex-bootstrap`, `lex-ground`, `lex-retro`, `lex-crystallize`, `lex-audit`, `lex-migrate`, or `lex-overview` itself for cross-cutting rules.)
- What the skill did wrong. State it in one sentence in your own words.
- What instruction in the SKILL.md would have prevented it. This is the inference step; it is where hallucination lives. If you can't point at a specific phase, paragraph, or rule in the current SKILL.md that should change, **don't propose an edit yet** — interview first.

## Triage

Before proposing any change, classify the correction into one of three branches:

- **Bundle edit** — the lesson generalizes across projects. → Edit the responsible SKILL.md in the lexicon repo. This is the main path `/lex-meta` is for.
- **Project-specific quirk** — only this project has this constraint. → Belongs in the project's `CLAUDE.md` (or the project's own `lexicon/`), not in the bundle. Suggest where it should go and stop; don't touch the bundle.
- **No-op** — the correction was incidental, the skill was right, the user just preferred a different cosmetic this once. → Say so and stop. `/lex-meta` invoked is not a contract to produce an edit; producing one when none is warranted poisons future runs of the affected skill.

Within the **bundle edit** branch, ask a sub-question that shapes how the proposal is *labeled* (not where it routes): *is this an objective skill bug (the skill produced something incorrect, misleading, or against its own stated rules) or a taste call (the user prefers a style that goes against a defensible default)?* Both produce a SKILL.md edit, but the proposal should name which it is. Taste calls deserve an explicit "you're sure you want this as a global rule?" confirmation — the bundle is being shaped to user preference through continuous use, so taste edits are valid, they just shouldn't be silent.

State your triage call (and, for bundle edits, the bug-vs-taste label) to the user before proceeding to the proposal.

## Interview to disambiguate

If conversation + diff + prompt leave any of the following unclear, ask — don't guess:

- **Which skill is responsible**, when the moment could plausibly belong to more than one (e.g., a vocabulary issue could be `lex-ground`'s naming guidance or `lex-crystallize`'s absorption rules).
- **The lesson's scope**, when it's not obvious whether this is a general rule or specific to a class of situations.
- **Whether to amend an existing instruction or add a new one** — when the current SKILL.md is silent on the case, the user may have a preference about where the new rule belongs.

Keep the interview tight — three or four questions max. If the conversation already answered something, don't re-ask. The point of being a slash command (not a phrase trigger) is that the user is on the line; use the audience.

## Propose the SKILL.md edit inline

Present the proposal in chat. Structure:

> ## `/lex-meta` proposal
>
> **Triage:** <skill-bug | taste | project-quirk | no-op>
> **Responsible skill:** `<skill name>` (or `lex-overview` for cross-cutting rules)
> **Lesson (in one sentence):** <what should the skill do differently>
>
> ### Current text — `~/src/lexicon/skills/<skill>/SKILL.md`, § `<section heading>`
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

Quote the current SKILL.md text verbatim. If you find yourself paraphrasing because you didn't read the file, stop and read it.

If the right amendment would touch more than one SKILL.md, propose each separately under the same proposal. Don't bundle unrelated changes — one moment, one lesson.

## Apply on yes — but do not commit

When the user says yes:

1. **Apply the edit** to the relevant `~/src/lexicon/skills/<skill>/SKILL.md` using Edit. Cross-repo write — the target is in `~/src/lexicon/`, not the current project.
2. **Do NOT commit** in the lexicon repo. Leave the change in the working tree, uncommitted. This is deliberate: the dirty state across multiple `/lex-meta` invocations is the accumulation buffer, and the user reviews + commits + pushes when they sit down in the lexicon repo intentionally.
3. **Confirm in chat**: "Amended `~/src/lexicon/skills/<skill>/SKILL.md` § <section>. Bundle repo now has <N> uncommitted SKILL.md edits across <M> skills." The count gives the user passive awareness of accumulation without nagging.

If the user says **revise**, iterate on the proposal in conversation. Don't apply a partial amendment.

If the user says **no**, don't apply anything. Note (silently) that the correction was deemed not bundle-worthy and let the moment pass.

## Worked example

To ground the abstract template, here's a plausible run.

**Scenario.** Earlier in the session, `lex-crystallize` proposed a `rename` operation on a glossary term but only showed the structural op header — no prose diff for the term's definition. The user had to ask "what's the new definition?" before the agent surfaced it. After the crystallization landed, the user types:

> /lex-meta when a rename changes a term's meaning, show the prose diff alongside it

What `/lex-meta` does:

1. **Locate the moment.** Scan finds the turn where the user asked "what's the new definition?" — that's the pushback. The skill produced an output the user had to repair.
2. **Triage.** Bundle edit, labeled as a **skill bug** — `lex-crystallize` already has a rule about prose diffs, it just doesn't cover the rename-with-semantic-shift case. Not taste; the skill should already be doing this.
3. **Locate the responsible instruction.** Read `~/src/lexicon/skills/lex-crystallize/SKILL.md` and quote the current text:
   > For each `update`, show the **prose diff** in the chat — the human-readable change to definition / statement / rationale / body. For structural ops (rename / move / deprecate / status transition), the description and target are enough; the reference cascade is mechanical.
4. **Propose amendment** (inline in chat, using the template above). Add a clause: *"When a rename carries a semantic shift (the new name implies a different definition, not just better phrasing), bundle it as rename + update and show the prose diff for the definition. The reference cascade remains mechanical."*
5. **Apply on yes.** Edit `lex-crystallize/SKILL.md`. Leave uncommitted in the lexicon repo. Confirm: "Amended `lex-crystallize` § Mutation vocabulary. Bundle repo now has 1 uncommitted SKILL.md edit across 1 skill."

The whole exchange takes three or four turns because the conversation already carried the rationale ("I had to ask"). The interview was unnecessary.

## Anti-patterns

- **Inventing reasons to edit.** Every `/lex-meta` invocation is *not* a contract to produce an amendment. If triage lands on "no bundle change," that's a successful run — say so and stop. Producing edits when none are warranted is exactly how SKILL.md files accumulate noise.
- **Editing without quoting.** If you can't quote the current SKILL.md text being amended, you don't understand what you're changing. Read first.
- **Bundling unrelated lessons.** One moment, one lesson, one proposal. If the user wants to capture three things, that's three `/lex-meta` invocations.
- **Committing in the lexicon repo.** Never. The dirty working tree is the buffer; the user owns the push.
- **Treating the diff as primary.** The conversation has the *why*; the diff only has the *what*. A diff-first reading produces plausible-sounding rationale that doesn't match what actually happened in the session.
- **Routing to `lexicon-prefs.md`.** That file is being phased out. Preferences now land directly in SKILL.md files via this skill — `/lex-meta` is the consolidation channel, not a separate buffer. If you see a reference to `lexicon-prefs.md` in another skill's body, that's a stale instruction and a good candidate for a `/lex-meta` cleanup pass; don't replicate the routing yourself.

## On the relationship to the other skills

`lex-meta` is the inverse of every other lexicon skill: where they take the bundle as authoritative and reshape the project, `lex-meta` takes the project session as authoritative and reshapes the bundle. It is the only self-evolve mechanism the bundle has; everything else (retros, crystallize, audit) evolves the *project's* cold layer, not the skill bundle itself.

Because of that asymmetry, `lex-meta` doesn't write to any project file. It does not append to retros, does not update `.last-crystallized`, does not touch `lexicon/system.yaml`. Its entire output is in the lexicon bundle repo and a confirmation message in chat.
