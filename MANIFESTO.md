# Lexicon manifesto

Lexicon exists to reduce cognitive debt: the effort of reconstructing how a codebase works.

It reflects the software as a human mental model: concepts, relationships, responsibilities, and their places in the implementation.

Domain-Driven Design grounds domain meaning, C4 grounds software structure, and ordered scenarios explain runtime interactions. Lexicon brings these to existing code through annotation and linkage. The question determines which perspective earns a place in the shared model.

The model comes first. It must express a real system clearly, remain small enough to understand, and let people move easily between domain meaning and implementation.

Lexicon should be lean. Every feature must earn its place by making software easier to understand. Maintenance effort counts toward that cost.

`lexicon/docs/` remains a dumping ground to address later.

## Progressive

Lexicon is progressive. A team develops one shared model through use and conversation. Generation offers a starting point; human judgment shapes which concepts matter, where their boundaries belong, and how they connect. An agent can inspect the implementation, but it cannot supply the team's taste.

Modeling starts from a human question, optionally supported by a small overview. Users should be able to ask for explanations and refine the model through conversation inside the viewer, using an authenticated local coding agent. Interactive refinement is essential to Lexicon.

Each refinement builds on the current model. Its shape carries the team's judgment forward and guides subsequent changes. Concepts and relationships may be added, split, merged, renamed, or removed as understanding develops. The workflow is incremental, without full regeneration or a separate log of modeling decisions.

Human judgment guides the abstractions. Implementation evidence grounds their explanations and code links. The agent should surface concrete conflicts between the two before applying a misleading change and must never invent supporting code links. A domain concept need not correspond to a class or file.

## The model

The project supplies a name, a short explanation, and the objects needed to understand it. Contexts and Concepts describe domain meaning. Person, Software System, Container, and Component describe software structure. Relationships explain connections; Flows describe ordered occurrences of those relationships in a scenario. Each item can carry annotations and code links.

Structural containment is stored once. Concepts belong to contexts, containers to systems, and components to containers. Domain membership and consistency claims remain explained relationships and annotations. Views reuse the same identities; canvas drawings and layout remain separate authored presentation.

The model language stays fixed and small. Add structure when a worked example needs it. Parser and viewer support one current schema; agent-readable migration deltas carry older documents forward on explicit request. Reading a mismatch must preserve the document and keep conversation available.

DDD classifications add precision where useful: entity, value object, service, event, aggregate; upstream/downstream, shared kernel, translation boundary. Real examples guide how much structure each needs.

Identity survives changes to names and code locations. Code links support many-to-many mappings: a concept can span several files, and a file can implement several concepts. Each link names its role, such as definition, implementation, enforcement, or usage. Symbols provide precise targets; files provide a fallback.

Coverage grows from human questions. Start with the concepts needed to understand a subsystem, then test whether their relationships and code links help a reader explain it.

Code-link explanations make the correspondence between domain names and implementation names explicit. Rule annotations distinguish intended consistency, observed behavior, and enforced checks.

Worked example: [DentalML canal measurement](viewer/examples/dentalml/README.md).
