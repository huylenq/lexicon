---
status: proposed
created: 2026-06-27
updated: 2026-06-27
scope: skills/lexicon/validators/ (standalone scripts); skills/lexicon/subcommands/{ground,crystallize}.md (consume mechanical candidates); reuses the deterministic backend from model-health-design.md
context: viewer
---

# Workflow mechanization — give `ground` and `crystallize` mechanical candidates

`ground` and `crystallize` are pure agent prose today. `crystallize` runs the six structural checks (`reference/checks.md`) interpretively over a git diff — it must *notice* a new cross-context import, *remember* every glossary term to spot a rename, *recall* which symbols are anchored. That's recall work the deterministic backend can do mechanically. This spec doesn't change *what* the checks mean or *who* triggers them — it changes the input from "scan from memory" to "triage a candidate list."

The same standalone-script provider that backs `model-health-design.md` produces these candidates, so the agent never depends on the viewer process running (honoring Decision 6 of `code-lens-design.md`: two consumers, two providers).

## Motivation

The six checks are structural triggers precisely *because* they're mechanically detectable (CLAUDE.md: "structural triggers, not significance judgment"). That detectability is currently unused — the agent re-derives it by reading. Mechanizing the detection makes the checks sharper and cheaper without sliding back toward significance heuristics. Three lifecycle moments benefit:

1. **`crystallize` (forward, check 1/2/4):** which candidates did this diff produce?
2. **`ground` (reload, manifesto A):** which atoms/anchors/edges are relevant to the files I'm about to touch?
3. **change-impact (manifesto F):** given a proposed diff, which atoms/invariants/contexts does it touch?

## Decision 1 — Candidates are advisory structural triggers, never auto-applied, never agent-triggered

The script emits a candidate list; the agent triages it inside the existing propose-confirm flow. This preserves three load-bearing properties:

- **crystallize stays user-triggered** (CLAUDE.md: the model isn't a reliable judge of "done"). Candidates make a *user-triggered* run better-grounded; they do not make the agent volunteer crystallizations.
- **structural triggers, not significance** — a candidate is "this symbol is unanchored" or "this edge crosses a boundary," never "this looks important." Mechanically detectable, hard to game.
- **deliberate cold-layer edits** — candidates feed the proposal; the user still confirms each mutation (Rule 6).

## Decision 2 — `crystallize` signals: three deterministic candidate generators

A `validators/crystallize-signals.ts` script takes the git range (`<.last-crystallized>..HEAD`) and the loaded graph, emits:

- **vocabulary candidates (check 1):** new exported symbols (classes/types/functions) in the diff not covered by any term's `<symbols>` → glossary candidates.
- **consistency candidates (check 2, the silent-rename bug):** an anchored `symbol=` that was renamed or moved in the diff → high-priority, because this is exactly the drift lexicon exists to kill.
- **boundary candidates (check 4):** new cross-context import/call edges introduced by the diff (reuses the contradiction join from `model-health-design.md`).

Output is a markdown candidate block the `crystallize` body presents *before* its proposal: "Detected N candidates — triage:". The agent's job becomes filtering/confirming, not discovering.

## Decision 3 — `ground` reload card: relevant slice for files-in-scope

A `validators/reground.ts` script takes a set of files (the declared scope) and emits the **model reload card** (manifesto A): the bounded context(s) those files belong to, the terms/invariants anchored in them, the derived edges touching them, and the deliberate-omissions/seams in play. `ground` reads `system.xml` end-to-end as today, then uses the card to make its scope declaration concrete instead of impressionistic — and to recover structure without slurping whole source files (manifesto's "avoid lurking into voluminous source," Decision 8 of `code-lens-design.md`). Best-effort: degrades to reading files when no structure is available.

## Decision 4 — change-impact (manifesto F): a query, not a new lifecycle moment

Given a proposed/working diff, `validators/impact.ts` answers: which anchored atoms touch these files? which invariants' `constrains-code` falls in them? which context boundaries does the diff cross? This is a thin composition of the reground card over an arbitrary diff — surfaced inside `ground` (pre-work: "this change will touch invariant X") and available to `crystallize` (post-work). It is **not** a new subcommand; the manifesto's idea F is a capability of the existing moments.

## ⚠ Foundation contradictions

- **Home-domain mismatch — the sharpest one.** This spec's deliverables modify `skills/lexicon/` (the *plugin*), but per CLAUDE.md the plugin root **is not a domain codebase and has no cold layer**; plugin changes normally route through `/lexicon:meta-evolve`, not through `spec`/`crystallize`. So a `spec` doc under `viewer/lexicon/specs/` is governing changes outside the viewer's domain. **Proposed resolution:** treat this doc as the *design record* for the change, but apply the `skills/`-side edits as a `meta-evolve` (the plugin's self-evolution channel), and apply only the `validators/` scripts as new files. The viewer-side reuse (the shared deterministic backend) stays in `viewer/`. Flagging for your call — the alternative is to relocate this spec to a repo-root design doc outside the lexicon convention.
- **Two-provider discipline (D6).** These scripts must be standalone (tree-sitter, Bash-invocable), not calls into the running viewer server — the agent can't assume the viewer is up. LSP-dependent candidates (call-edge boundary crossings) are best-effort and must announce when not checked.
- **Don't re-introduce significance scoring.** Candidates are binary structural facts. No "complexity"/"size" ranking — that's the path back to subjective judgment CLAUDE.md explicitly rejects.

## Phasing

| Phase | Deliverable | Gate |
|---|---|---|
| **P0** | `validators/reground.ts` (reload card from files-in-scope). | On the honeywell seed, `ground` for a chosen subsystem produces an accurate context/term/invariant/edge card. |
| **P1** | `validators/crystallize-signals.ts` (vocabulary + consistency + boundary candidates over a git range). | A diff that renames an anchored symbol surfaces a high-priority consistency candidate; a new cross-context call surfaces a boundary candidate. |
| **P2** | `validators/impact.ts` + wiring into `ground`/`crystallize` bodies. | A proposed diff reports the invariants and boundaries it touches before work proceeds. |
| **P3** | `skills/.../subcommands/{ground,crystallize}.md` prose updated to consume candidates (applied via `meta-evolve` per the resolution above). | The subcommand bodies present candidates then triage; user confirms. |

## Risks & open questions

- **The home-domain resolution is unsettled** — needs your decision (apply skills-side via meta-evolve vs relocate the spec). P3 is gated on it.
- **Candidate over-production.** A large diff yields many vocabulary candidates; most won't deserve terms. The agent's triage + the "candidates are not mandates" framing is the filter; watch for it overwhelming the proposal.
- **git-range edge cases** (merge commits, squashes) when computing the diff for signals — reuse whatever `crystallize` already does for `.last-crystallized`..HEAD.

## Vocabulary to crystallize

*mechanical candidate*, *reload card*, *crystallize signal*, *change impact*. Noted for `crystallize` — but see the home-domain contradiction: these may belong to the plugin's vocabulary, not the viewer's.
