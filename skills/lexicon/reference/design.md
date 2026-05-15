# Lexicon cold-layer schema v0.3 — DDD faithfulness

This document is the design contract for the v0.2 → v0.3 schema bump. It exists to:

1. Pin every decision in one place before any code, schema, or skill body changes.
2. Survive the bump as a record of *why* — what was rejected, what is deferred, what is load-bearing.

It is **not** a normative spec. The normative spec lives in `skills/lex-overview/SCHEMA.md`; this document explains the shape that file is about to take.

If, while implementing, you discover a constraint the doc didn't anticipate — stop and amend the doc before writing the code. The cost of an inconsistent migration delta after pilots run is much higher than the cost of editing this file.

---

## 1. Motivation

Lexicon's first schema (v0.1, v0.2) was Evans-flavored but not Evans-faithful. It carried inventions that don't appear in Domain-Driven Design (ADRs as a kind, `crossCuttingTerms` as an untyped bag) and omitted primitives that Evans treats as load-bearing (Entity vs. Value Object, Aggregates, Domain Events, Subdomains, typed context-map relationships, modules-as-concept-clusters).

v0.3 closes that gap with two exceptions:

- **UI surfaces & regions stay.** Evans is backend-only; the surface/region tier is a deliberate lexicon invention that bridges DDD with design-system vocabulary. It does not change.
- **ADRs go away entirely.** They are not in Evans; their replacement is `rationale` fields on the atoms the argument touches. Development-journal / historical-reasoning capture is **deferred**, not absorbed into another slot.

The bump is breaking. Pilots run `lex-migrate` to upgrade; the loader fails fast on pre-v0.3 files with a clear pointer at the migration command.

---

## 2. Versioning

- **schemaVersion bumps `"0.2"` → `"0.3"`.**
- **Bundle version bumps to `v0.10.0`** (next minor after 0.9.0; the in-progress lex-meta work ships in the same release).
- **The loader is not forward-compatible.** Unlike v0.1 → v0.2 (additive), v0.3 renames and removes fields. Files declaring `"0.1"` or `"0.2"` are recognized by the loader, which emits a single clear `LoadIssue` per file: "schemaVersion is older than 0.3; run `lex-migrate` to upgrade." Resolution stops; the viewer renders the issue list, not a partial graph. This deviates from the policy note in CLAUDE.md ("add the new literal to the union so old files validate") — the deviation is explicit and called out in the CHANGELOG.

---

## 3. Entity kinds in v0.3

The full kind enum:

```
system            (unchanged)
bounded-context   (unchanged shape; field renames inside)
term              (gains category discriminator)
invariant         (unchanged)
seam              (gains kind + direction)
boundary-rule     (unchanged)
surface           (unchanged)
region            (unchanged)

aggregate         NEW — consistency-boundary cluster inside a context
module            NEW — concept-cluster inside a context (Evans-sense)
shared-kernel     NEW — named shared sub-model across ≥2 contexts

(decision)        REMOVED
```

Eleven kinds. The viewer's `KIND_LABEL`, `KIND_ICON`, `KIND_COLOR_VAR`, `FILTERABLE_KINDS` are updated to match; the CSS theme gains three new `--color-kind-*` vars; `EntityDetail.tsx`'s per-kind switch gains three new body renderers and drops `DecisionBody`.

---

## 4. Term `category`

Every term carries a `category`:

```yaml
terms:
  - id: customer
    name: Customer
    category: entity            # entity | value | service | event | concept
    definition: |
      ...
```

Defaults to `concept` when omitted (the catch-all bucket — purely conceptual scaffolding terms with no code analog). Migration sets every existing term to `concept` and surfaces a triage list inviting the user to recategorize entity/value/service/event candidates.

### Category-specific fields

All categories share: `id`, `name`, `category`, `definition`, `body?`, `disambiguatesFrom?`, `symbols?`, `rationale?` (new — see § 8).

Category-specific fields are **optional**; the viewer renders them when present and omits the section when absent. The schema does not enforce category↔field coupling — that's authoring discipline, surfaced in the migration delta and `lex-audit`.

- **entity** — `identityRule: |` (prose: what gives an instance its stable identity?). Example: "tax-id + tenant; a customer with a new email is the same customer."
- **value** — `equality: |` (prose: when are two instances "the same"?). Example: "by all attributes: `(amount, currency)` — two `Money` instances with the same amount and currency are interchangeable."
- **service** — `operatesOn: [<term-ref>, ...]` (refs at entity- or value-category terms the service acts upon), `returns: |` (prose: what the operation produces).
- **event** — `emittedWhen: |` (prose: the triggering condition), `payload: |` (prose: what the event carries), `consumers: [<ref>, ...]` (refs at contexts or service-category terms that react).
- **concept** — no extras.

The five categories are not exhaustive Evans (no Repository/Factory) — those are tactical patterns the model doesn't owe vocabulary to; they live in code. See § 13.

---

## 5. Aggregate

A new entity kind: a cluster of entity- and value-category terms with a single root and a transactional-consistency boundary.

Lives inside `bounded-context`:

```yaml
# contexts/<slug>.yaml
aggregates:
  - id: order
    name: Order
    root: <term-ref>                   # must point at an entity-category term
    members: [<term-ref>, ...]         # entity + value terms inside the boundary
    invariants: [<invariant-ref>, ...] # the transactional invariants
    rationale: |
      Why this cluster, why this root, what the boundary buys you.
```

- `fqid: <context-slug>/aggregate/<aggregate-slug>`
- Validation in the loader: `root` resolves to a term with `category: entity`; each member resolves to a term with `category` in `{entity, value}`; each invariant resolves to an invariant owned by the same context (or the kernel the aggregate belongs to, see § 6). Failures become `LoadIssue` warnings.
- The aggregate's invariants are not redefined — they *point at* existing invariant atoms. An invariant can be referenced by ≤1 aggregate (Evans' transactional consistency is single-cluster).

---

## 6. Shared Kernel — replaces `crossCuttingTerms` / `crossCuttingInvariants`

A new top-level slot on `system.yaml` and a new entity kind:

```yaml
# system.yaml
sharedKernels:
  - id: identity
    name: Identity kernel
    description: |
      Why this kernel exists; what coordination it demands.
    participatingContexts: [<context-ref>, ...]
    rationale: |
      Why these contexts share this model rather than each owning their own
      or routing through an ACL.
    terms:
      - id: user-id
        name: UserId
        category: value
        definition: |
          ...
        equality: |
          ...
    invariants:
      - id: user-id-immutable
        name: UserId is immutable
        statement: |
          ...
        rationale: |
          ...
```

- `fqid: kernel/<kernel-slug>`
- Terms inside have `fqid: kernel/<kernel-slug>/<term-slug>`; invariants have `fqid: kernel/<kernel-slug>/invariant/<invariant-slug>`. They get `ownerKernelId: <kernel-slug>` and `ownerContextId: null` on the resolved entity.
- `participatingContexts` is the inverse of any context-map seam declared with `kind: shared-kernel`. The loader cross-checks: every kernel must have ≥2 participating contexts, and every `shared-kernel` seam should reference an existing kernel (warning if not).

`crossCuttingTerms` and `crossCuttingInvariants` are **removed** from the schema. The migration delta groups existing entries into proposed kernels (interactive — the agent suggests groupings, the user approves) or leaves them at context scope if they don't actually span contexts.

---

## 7. Typed seam — context-map kinds

Seams gain a `kind` field with Evans' context-map vocabulary:

```yaml
seams:
  - id: billing-to-payments
    name: Billing ↔ Payments
    kind: anticorruption-layer   # see enum below
    description: |
      ...
    rationale: |
      Why this kind: what would break if we let billing import payments
      types directly.
    upstream: payments           # for asymmetric kinds
    downstream: billing
    participants: [billing, payments]   # for symmetric kinds; optional otherwise
```

### Kind enum

```
shared-kernel        — references a sharedKernel entity (§ 6)
customer-supplier    — upstream cares about downstream's needs
conformist           — downstream takes upstream's model as-is
anticorruption-layer — downstream translates upstream's model at the boundary
open-host-service    — upstream publishes a well-defined integration surface
published-language   — both sides agree on a shared interchange format
partnership          — symmetric coordination; both sides plan together
separate-ways        — explicit non-integration; the contexts ignore each other
unknown              — default; the kind has not been decided
```

### Direction fields

- **Asymmetric kinds** (`customer-supplier`, `conformist`, `anticorruption-layer`, `open-host-service`): the loader expects `upstream` and `downstream`, both as `<context-ref>`. The ACL sits on the downstream side.
- **Symmetric kinds** (`shared-kernel`, `published-language`, `partnership`, `separate-ways`): the loader expects `participants` (a list of `<context-ref>`s).
- **`unknown`**: either shape accepted; the loader emits a `LoadIssue` of `severity: "warning"` flagging the seam for triage.

The loader does **not** infer kind from code or prose. Migration sets every existing seam to `unknown` and surfaces a triage list; the user picks per seam.

---

## 8. Rationale fields

Rationale is the **only** ADR replacement. The decision-narrative content that ADRs carried is distributed onto the atoms the argument touches.

Atoms that gain optional `rationale: |`:

- **seam** — why this kind, why this direction
- **aggregate** — why this cluster, why this root
- **module** (§ 9) — why this concept cluster
- **shared-kernel** — why this kernel exists rather than per-context types
- **boundary-rule** — why this rule

Existing atoms with `rationale` (invariant, term per § 4) keep it.

### Authoring guidance (lands in SCHEMA.md)

A rationale field is for **the argument that justifies the model choice**, not a description of the choice. Three failure modes to avoid:

1. **Restating the statement.** An invariant whose `statement` says "X must hold" and whose `rationale` says "because X must hold" carries no signal. Rewrite or delete.
2. **Historical narrative.** "We picked this in March because we had a deadline" belongs in a development journal, not in `rationale`. v0.3 explicitly does not have a development-journal slot — defer it.
3. **Hedged universalism.** "Some people prefer this approach, others prefer that" is not a rationale; it's a literature review. Commit to the argument or delete the field.

---

## 9. Modules — Evans' sense, with rename collision resolved

The existing field `modules: [<glob>]` on `bounded-context` is renamed to **`codeModules`**. The freed name `modules` is now an array of objects describing concept clusters:

```yaml
# contexts/<slug>.yaml

# Old meaning, renamed:
codeModules:
  - src/<module>/**

# New: Evans-sense modules
modules:
  - id: order-lifecycle
    name: Order lifecycle
    description: |
      The state machine and events around an order from creation to fulfillment.
    members: [<ref>, ...]              # terms, invariants, aggregates in this cluster
    rationale: |
      Why this grouping — what cohesion holds these atoms together that
      doesn't hold across the rest of the context.
```

- `fqid: <context-slug>/module/<module-slug>`
- An atom can belong to ≤1 module within its context. Cross-module references are normal.
- A bounded-context with ≤8 atoms typically does not need modules. The migration delta does not auto-create them; it surfaces module candidates as a triage list.

The rename is mechanical and handled by the migration delta.

---

## 10. Subdomain

Bounded-contexts gain an optional `subdomain` discriminator:

```yaml
# contexts/<slug>.yaml
subdomain: core              # core | supporting | generic | overlay
```

- **core** — where the project's competitive advantage lives; the model that matters most.
- **supporting** — necessary for the system but not differentiating.
- **generic** — solved problems (auth, billing, scheduling); buyable or commoditized.
- **overlay** — installation-specific tier (lexicon extension to Evans). The platform is domain-agnostic; this context carries the medical / legal / retail specifics that get swapped per installation. Pairs naturally with a `system.overlays[]` entry; the round-1 pilot of eir's `medical-knowledge-integration` surfaced the need.

Defaults to unset. Migration surfaces a triage list inviting the user to classify each context; classifications without user input stay unset.

Evans' pure version separates subdomains (problem space) from bounded contexts (solution space); one subdomain can host multiple contexts. v0.3 collapses to "subdomain as a field on the context that primarily serves it." This loses the cross-context subdomain case; if a project hits the wall, a v0.4 can promote `subdomain` to its own entity kind with `participatingContexts`. Documented limitation, deferred.

The `overlay` value is a deliberate deviation from Evans — he names only three subdomain tiers. Software product-line engineering's platform-vs-installation distinction is the precedent. The alternative we considered (a separate `overlayId` field linking the context to a `system.overlays[]` entry) is cleaner conceptually but doubles the per-context fields; the enum-stretch was picked for the smaller schema delta. Revisit if `overlay` ends up needing fields the enum can't carry.

---

## 11. ADR removal

The `decision` entity kind is removed from the v0.3 schema. The viewer's `DecisionBody` renderer and the `KIND_LABEL["decision"]` entry are deleted. `FILTERABLE_KINDS` drops the ADR row; numeric hotkeys shift up.

The `lexicon/decisions/` directory becomes orphaned. The migration delta archives every ADR YAML into `lexicon/_pre-migrate-archive/decisions/` and offers per-ADR lift of content into `rationale` fields on the atoms named in `affects:`. The lift is interactive and per-ADR; the user can decline (file just archives).

Templates: `skills/lex-bootstrap/templates/decision.yaml.example` is **deleted**. `lex-bootstrap`'s ADR-migration phase becomes ADR-archival phase.

### What about superseded chains?

`supersedes:` and `supersededBy:` graphs are lost. They were ADR-internal; with no `decision` kind, there's nothing to chain. The migration report logs the chains as part of the per-ADR archival entry so a curious user can trace it in `lexicon/migrate.md`.

---

## 12. CrossCutting → Shared Kernel migration mechanics

The most interpretive part of the migration. The delta proposes groupings but does not invent them:

1. **Detection.** Read all `crossCuttingTerms` and `crossCuttingInvariants` from `system.yaml`. For each, compute the set of contexts that reference it (via `disambiguatesFrom`, prose `[[fqid]]` links, or by being mentioned in a context's `purpose`/`narrative` — best-effort scan).

2. **Proposal.** Cluster entries by overlapping context sets. Each cluster of ≥2 entries sharing ≥2 contexts becomes a proposed `sharedKernel` with a generated name (user can rename). Entries that don't cluster become candidates for promotion into a single owning context.

3. **Interview.** Walk the user through each proposed kernel (one at a time per the v0.1→v0.2 cadence rule for >3 scopes). For each: confirm membership, name, participating contexts, and rationale.

4. **Apply.** Emit the `sharedKernels:` slot; delete `crossCuttingTerms` and `crossCuttingInvariants`; update prose `[[fqid]]` links to point at new kernel-scoped fqids. The link-rewrite is mechanical because the term slug doesn't change — only the kernel prefix.

5. **Report.** Migrate report lists every kernel created, every term promoted to context ownership, and any entries flagged as "doesn't fit either bucket" for user follow-up.

---

## 13. What this design deliberately does NOT add

- **Repositories / Factories.** Tactical-pattern bookkeeping for code; not modeling vocabulary. The model knows about `Customer`, not `CustomerRepository`. Adding them would bloat the schema for no signal.
- **Application Services / Infrastructure Services.** Only domain services (category `service`) are modeled. Other service tiers are code-organization concerns.
- **Subdomain as a separate entity kind.** Pragmatic-first: subdomain is a field on bounded-context. See § 10's deferred-upgrade note.
- **Development journal / historical reasoning capture.** ADRs are gone; their decision-narrative content is partly liftable into rationale fields and partly lost. A future skill bundle may add a `journal/` directory or similar; not now.
- **Typed seam kind auto-detection.** Agents cannot reliably distinguish Conformist from Customer/Supplier without context the model doesn't carry. Migration leaves seam kind = `unknown` and surfaces the list for human triage.
- **Cross-kernel invariants.** Invariants live in exactly one place: a context, a shared kernel, or (rare) referenced by exactly one aggregate. No multi-owner invariants.
- **Backward-compat for v0.2 in the viewer.** Loader fails fast with a migration pointer.

---

## 14. Implementation plan

In dependency order:

1. **Spec** — rewrite `skills/lex-overview/SCHEMA.md` to describe v0.3 normatively. The migration mechanics are NOT in SCHEMA.md; they are in the migration delta.
2. **Server schema** — `viewer/server/schema.ts`: bump `SCHEMA_VERSION`, add `"0.3"` literal, replace v0.2 zod shapes with v0.3 shapes (sharedKernels, aggregates, modules-as-objects, codeModules, typed seam, term category fields, dropped decision kind, rationale fields).
3. **Client types** — `viewer/client/src/lib/types.ts`: mirror.
4. **Loader / resolver** — `viewer/server/loader.ts`: register the three new entity kinds, build kernel-scoped fqids, surface seam kind+direction, drop decision-kind handling, emit clean version-mismatch issue for `"0.1"`/`"0.2"` files.
5. **Viewer renderers** — `kinds.ts` (label/icon/color/filterable), `EntityDetail.tsx` (new BodyComponents for aggregate/module/shared-kernel; drop DecisionBody; category-aware TermBody; typed seam direction render; rationale section rendered uniformly across kinds that carry it), graph layer (`build-graph.ts`, `layout.ts`, `GraphNode.tsx`) updated to handle new kinds.
6. **Migration delta** — `skills/lex-migrate/migrations/v0.2-to-v0.3.md`. Follow the existing delta structure exactly: preamble, pre-flight, detection phase, apply phases (in this order: archive ADRs → rename modules → categorize terms → group cross-cutting into kernels → triage seam kinds → propose aggregates/modules/subdomains → schemaVersion bump), validate, report-section template.
7. **Migrate orchestrator** — `skills/lex-migrate/SKILL.md`: append v0.2→v0.3 to delta chain. No other changes.
8. **Skills sweep** — `lex-overview`, `lex-bootstrap`, `lex-ground`, `lex-retro`, `lex-crystallize`, `lex-audit`, `lex-meta` SKILL.md bodies: replace ADR / crossCutting / module-as-glob references with v0.3 vocabulary. `lex-bootstrap` Phase 6 (ADR migration) becomes Phase 6 (ADR archival).
9. **Templates** — update `system.yaml.example` and `bounded-context.yaml.example`; delete `decision.yaml.example`.
10. **Viewer's own lexicon** — apply the migration to `viewer/lexicon/` so the viewer self-renders.
11. **CHANGELOG / README** — entries under [Unreleased] (existing) for v0.10.0. README's "First use in a project" tree drops `decisions/`.

---

## 15. Risks

- **Migration interview length.** The cross-cutting → kernel grouping and the seam-kind triage are both per-item interviews. For a project with 20 cross-cutting terms and 15 seams, this is a multi-hour interactive migration. Mitigation: cadence rule from v0.1→v0.2 carries over; the user can pause/resume; the migration report holds state between sessions.
- **Lost ADR signal.** Projects with ADR-heavy archives lose the chain unless the user opts into per-ADR rationale lift. Mitigation: the archive directory is preserved; the report enumerates the chains.
- **Category triage abandonment.** If users leave every term at `category: concept`, the schema's gain over v0.2 is mostly the typed seam and the aggregate primitive. Mitigation: `lex-audit` gains a check "≥80% of terms are category=concept after migration" and surfaces it.
- **Aggregate ergonomics.** Defining aggregates well requires real DDD experience. Most projects probably won't use the slot. That's fine; an empty `aggregates: []` is a no-op. The slot exists so projects that *want* to model consistency boundaries have a home for it.

---

## 16. Open questions deliberately left for later

- Should `event`-category terms get their own top-level slot in `system.yaml` (a "domain events catalog") or remain context-scoped? v0.3 keeps them context-scoped; promote later if a real project surfaces the need.
- Does `aggregate` deserve graph-layout treatment as a sub-container inside the context node (like a region inside a surface)? Probably yes; deferred to a viewer polish pass after v0.3 lands.
- Is `unknown` a long-term seam kind, or should v0.4 require classification before validation passes? v0.3 keeps it permissive; tightening waits on real-project signal.

---

## Glossary of changes

| v0.2 | v0.3 |
|---|---|
| `kind: decision` | removed; content lifts to `rationale` fields, file archives |
| `crossCuttingTerms` on system | removed; lifted to `sharedKernels[].terms` |
| `crossCuttingInvariants` on system | removed; lifted to `sharedKernels[].invariants` |
| `bounded-context.modules: [<glob>]` | renamed to `codeModules` |
| `bounded-context.modules` (new) | array of `{id, name, description, members, rationale}` (Evans-sense) |
| seam: untyped | `seam.kind` ∈ 9-value enum; `upstream`/`downstream` for asymmetric, `participants` for symmetric |
| term: undifferentiated | `term.category` ∈ {entity, value, service, event, concept}; category-specific optional fields |
| (no aggregate) | new kind: `aggregate` inside bounded-context |
| (no module entity) | new kind: `module` inside bounded-context |
| (no shared-kernel entity) | new kind: `shared-kernel` on system |
| (no subdomain) | optional `subdomain` field on bounded-context |
| rationale only on invariant/term | also on seam, aggregate, module, shared-kernel, boundary-rule |
| schemaVersion `"0.1"` or `"0.2"` accepted | `"0.3"` only; older files emit migration-pointer issue |
