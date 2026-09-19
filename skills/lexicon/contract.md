# Current authoring contract

The only supported semantic schema is `3.3`. Read `MODEL.md` for XML syntax. Start from the question; add domain meaning, software structure, or a runtime scenario only when it helps answer it. Use Explain / Initialize / Refine for semantic work; Operate addresses connected viewer state and navigation.

The governing hierarchy is `ModelItem = Element | Relationship | Behavior`, with `Element = DomainElement | ArchitectureElement`, `DomainElement = Context | Concept`, `ArchitectureElement = Person | SoftwareSystem | Container | Component`, and `Behavior = Flow`. TypeScript calls Element `ModelElement`. These are categories of existing types, not XML wrappers. Read the semantic composition rules in the bundle's `MODEL.md` before choosing constructs.

Domain meaning, software architecture, and code are distinct dimensions of the same system. Keep domain and architecture boundaries independent; explain their correspondence with relationships and ground either in source links. Flows describe ordered interactions between Architecture participants, with optional code detail grouped under those responsibilities. Domain concepts explain the meaning and rules of a scenario. Canvas planes and pages present those meanings without defining them.

Every item has `type`, project-wide stable `id`, `name`, `description`, `annotations`, and `codeLinks`. Keep existing IDs and established names. Use spaced title-case concept names, natural context names, and verb phrases for relationships; explicit user terminology takes precedence. This preference does not change IDs, source symbols, labels, or prose.

| Type | Additional fields | Meaning |
|---|---|---|
| context | none | Consistent domain meaning and responsibility |
| concept | parent: context ID; optional classification | Domain idea, optionally classified with DDD vocabulary |
| person | none | User role |
| system | none | Software system |
| container | parent: system ID | Application or data store |
| component | parent: container ID | Functionality behind an interface |
| relationship | from, to: element IDs | Explained directed connection |
| flow | steps: ordered `{id, relationship, label, caller?, callee?, callSite?}` records | One scenario using Architecture interaction relationships |

Elements are context, concept, person, system, container, and component. Relationships and flows are not endpoints or structural parents. XML nesting supplies `parent`; store containment once. A relationship named “contains” describes meaning without changing parentage. Domain contexts and software systems remain distinct; an explained relationship may connect them.

Annotations have `kind`, `text`, and optional `evidence` (`observed`, `intended`, `enforced`). Source links retain the `codeLinks` field and `<code-link>` XML. They require an explicit `kind` (`code` or `document`), a file relative to the source root, `role`, `description`, optional `symbol` or positive one-based `line`, and optional owner-local `id`. Code links support symbol lookup and reject `heading`. Document links reject `symbol`; Markdown documents support `heading`, an anchor without `#`, exclusive with `symbol` and `line`; see `MODEL.md` for anchor generation. Preserve the field when editing link arrays. Use `specification`, `rationale`, or `reference` for documentary evidence, and qualify document-derived behavior as intended unless independent evidence establishes more. Give new links stable IDs and retain existing ones when editing targets. Inspect links and explain mismatches between human names and source symbols. A resolving link does not establish a relationship claim or enforced rule.

A flow step ID is stable within its flow. Its relationship must exist and supply two Architecture endpoints (person, system, container, or component). Domain concepts provide explanatory context. The label describes the action in this scenario. Repeating a relationship uses another step ID. Array/XML order means interaction order, with one lifeline per element; it does not imply completion, duration, reply pairing, concurrency, branching, or instance aliases. Inspect the entrypoint, calls, conditions, and outcome in source. Containment or an implementation mapping alone does not establish an interaction. Use another named flow for an alternate path. Read `architecture.md` or `flows.md` for worked guidance as needed.

Optional `caller`, `callee`, and `callSite` fields reference explicit IDs of code links owned by the same Flow. Each referenced link requires `kind: "code"` and a symbol or line. XML uses `call-site`. Caller belongs to the source Architecture participant and callee to its destination; inspect source to justify both. Code detail groups targets under those responsibilities. A self-relationship can expose internal interactions without adding Components. State transport in the action label and relationship; missing code remains unspecified. Whole-file and document links can support the Flow but cannot supply these precise code roles.

Use MCP for edit delivery; see `SKILL.md` and `integration.md`. Partial updates preserve omitted fields but replace any supplied arrays in full. Atomic MCP patches replace whole items by ID. Omit unchanged items and project fields; retain unchanged annotations, links, and steps in replacements. Removing, splitting, merging, or reparenting requires repairing dependent relationships, children, and flows in the same edit. Never invent extra fields, viewpoints, or canvas geometry. The canvas owns its presentation separately.

## Semantic authoring obligations

Choose a construct for its meaning: domain ideas belong in Concepts, software responsibilities in architecture Elements, connections in Relationships, and ordered scenarios in Flows. Explain important correspondences rather than duplicating a code symbol as both a Concept and Component without distinct meanings. A complete answer may use only the categories the question needs.

For each consequential Relationship, explain its claim, direction, connecting mechanism, and relevant conditions. Distinguish domain association, dependency, implementation correspondence, and runtime interaction in prose; these are not new fields or mutually exclusive classifications. A static association or mapping does not establish an interaction.

For each Flow, describe the trigger, relevant preconditions, and outcome using existing descriptions and annotations. Check that each step is an interaction justified by its Relationship and endpoints, and that source supports the order. Explain the affected domain concepts and their correspondence to executing software. Add a distinct Relationship when an interaction makes a different claim from an existing connection. Represent a consequential alternative as another scenario when needed to answer the question.

Structural validation and link resolution do not prove these semantic obligations. Review the claims and coverage separately, retain uncertainty beside affected items, and report consequential missing or unsupported behavior. More items do not by themselves make a model more expressive.
