---
name: using-lexicon
description: "Use at the start of any session in a project that has a lexicon/ cold layer (lexicon/system.xml), or whenever the user asks to make this session lexicon-aware. Parks a standing disposition: know what the cold layer is for, watch for the moments where a lexicon move (ground / crystallize / spec / validate / bootstrap) earns its keep, and proactively but advisorily offer it — never gate. Read once; it stays in context for the rest of the session. This skill does no work itself; the moves live in the `lexicon` skill's subcommands."
user-invocable: true
---

# Using Lexicon

This skill is the **awareness layer**. It doesn't ground, crystallize, or validate anything — it makes you *fluent* in the lexicon workflow so that, for the rest of the session, you recognise the moments where a lexicon move would help and offer it without being asked. The work itself happens in the `lexicon` skill's subcommands; this primer just keeps you disposed to reach for them.

Think of it the way `using-superpowers` works for skills generally: load once, carry the disposition for the session.

## Instruction priority

1. **The user's explicit instructions** (CLAUDE.md, direct requests) — always win. If the user says "just make the edit, skip the ceremony," skip it.
2. **This disposition** — overrides the default "head straight into the code" reflex where they conflict.
3. **Default behavior** — lowest.

This is an *advisory* layer by design. It surfaces moves; it never blocks you from working. The one move that's close to non-optional is grounding before substantive non-mechanical work (see below) — and even that yields to an explicit user instruction.

## What lexicon is — the pocket frame

A lexicon project keeps a small **cold layer** above the code: `lexicon/system.xml` (plus `contexts/<slug>.xml` and optional `surfaces/<slug>.xml`). It captures the things code expresses badly — vocabulary, invariants, bounded contexts, the design-system surfaces, and the *why*s — and it evolves at the speed of *learning*, not the speed of typing.

The whole point is **ubiquitous language**: the same nouns and verbs appear in the cold layer, in conversation, and in code, so human and agent stay aligned by repetition rather than by remembering. When you use a project's own words, drift can't hide.

Some projects also keep a **laxicon** — a sibling `laxicon/` directory (free-form, human-written prose notes; the *lax* counterpart to the precise lexicon, often Obsidian-linked under `laxicon/knowledge/`). It's a *source* you read during `ground` and mine during `crystallize`, never something the skill writes to. Distillation flows one way: laxicon → lexicon.

This is a pocket summary. The authoritative frame lives in the shared references the `lexicon` skill owns (`skills/lexicon/reference/design.md` and `rules.md`, canonically under `~/src/lexicon/`). When a move is actually taken, that move's subcommand reads them. **If this primer ever contradicts those references, they win.**

## First, read the room

Parking awareness means holding this project's lexicon state so your suggestions actually fit it. Register it cheaply, without making a production of it:

- **No `lexicon/system.xml`?** There's no cold layer yet — `bootstrap` is the relevant move. Offer it once near the start of substantive work; respect a "no" (and a `.lexicon-skip` marker) for the rest of the session.
- **Cold layer present but stale?** If the git log has run well ahead of `lexicon/.last-crystallized`, absorption is overdue — `crystallize` is the move. This is the nudge to watch for; surface it as a question, never act on it.
- **Old schema?** If the files are pre-v1.0 (YAML, or `system.md`), `validate` migrates them. Offer once.

You don't need to announce all of this. Just let it shape which move you reach for.

## The moves and their moments

Each is a subcommand of the `lexicon` skill. Reframed here as offers you make at the moment each earns its keep:

- **`ground`** — *about to do non-trivial work.* Read `system.xml` and the relevant context files, declare scope (task, bounded context, vocabulary in play, invariants depended on, files likely to change), surface vocabulary gaps. No writes. This is the near-default move; skipping it is the most common source of silent drift.
- **`crystallize`** — *a chunk just shipped, or the git log has outrun `.last-crystallized`.* Absorb accumulated work into the cold layer: read the diff since the last marker, run the structural checks, propose typed mutations, apply on the user's yes. **Always user-triggered** — you notice and offer; you never auto-run it.
- **`spec`** — *designing a subsystem end-to-end.* Author or file a markdown design/architecture doc under `lexicon/specs/`: per-feature narrative, flows, decisions, history. Defers vocabulary to the cold layer via `[[fqid]]` links rather than carrying its own glossary.
- **`validate`** — *the cold layer feels out of sync with the code, or the schema is old.* Two-pass drift check: schema-structural (offers the migration delta chain) and semantic (read-only triage). Project-scoped, backward-looking.
- **`bootstrap`** — *no cold layer yet.* One-time setup: draft the cold layer from existing docs and code, archive ADR-shaped docs into rationale, interview the user one decision at a time.

## Your posture

**Proactive but advisory.** Name the move and the reason ("this touches the billing↔payments seam — worth grounding first?"), then let the user pull the trigger. The value is in *noticing the moment*, not in forcing the procedure.

**Flexible, never a gate.** Lexicon is opt-in per project and per task. Stay quiet on mechanical work — typo fixes, dependency bumps, log tweaks don't need grounding. Don't offer the same declined move twice in a session.

**Honor the user-triggered moves.** `crystallize` and spec promotion are deliberate, user-judged moments — the agent is not a reliable judge of "done." You may flag that drift has accumulated; you may not decide it's time to absorb it.

## Acting on a move

When the user accepts an offer — or the moment plainly calls for it — **invoke the `lexicon` skill with the matching subcommand** (or let the user run `/lexicon:<verb>`). Don't reimplement a verb from this primer's summaries: load the real subcommand body so you follow the current rules and references. This primer makes you *aware* of the moves; the `lexicon` skill is where they actually run.
