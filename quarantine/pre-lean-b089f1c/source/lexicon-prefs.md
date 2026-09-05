# Lexicon prefs

Personal overrides and feedback for lexicon skills. Lives at the lexicon source folder (`~/src/lexicon/lexicon-prefs.md`) while iterating — portability comes later.

## Role

This file plays two roles at once:

1. **Live override.** `lex-overview` loads it at session start (alongside `system.md`). Skills read entries here and let them adjust default behavior — so feedback takes effect on the very next session.
2. **Curation buffer.** Periodically, entries that have stabilized get absorbed into the skill bodies themselves (a `SKILL.md` edit, or a CLAUDE.md design note). Curated entries can then be deleted from this file. The file should stay small over time — pile-up here means curation is overdue.

## How feedback gets in

When Huy says **"for lexicon: <X>"** (or "for lexicon, <X>" / "for lexicon — <X>") during a session, the active skill appends an entry to the relevant section below. Skills don't intercept generic "remember that" — that goes to project memory or IWE, not here.

If a session generates feedback worth recording but Huy didn't use the explicit phrasing, the skill can ask once at retro time: "anything from this session worth a lexicon-prefs entry?" — but only when the signal is strong (e.g., Huy explicitly corrected a behavior). No nagging.

## Format

Free prose, dated, with a short label. Example:

> ### 2026-05-05 — drop "sync" from crystallize triggers
> Skill description and body shouldn't include "sync" as a phrasing — Huy doesn't like the word. Recognize it as a trigger if used, but don't suggest it back.
> *Curation status:* live; promote to SKILL.md once stable.

Sections grow organically. Don't enforce a schema.

---

## Workflow

*(none yet)*

## Style

*(none yet)*

## Calibration

Significance overrides — drift flags to skip, terms not worth glossarying, invariants that look violated but aren't. Formerly the role of per-project `lexicon/calibration.md`, lifted up to the user level.

*(none yet)*

## Patterns about how Huy works

Things about how Huy thinks or works that should color skill behavior — first-principles bias, momentum-protection ("rơi nhịp" fear), preference for one bundled artifact over many small ones, etc.

*(none yet)*
