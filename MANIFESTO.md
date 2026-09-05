# Lexicon manifesto

Lexicon exists to reduce cognitive debt: the effort of reconstructing how a codebase works.

It reflects the software as a human mental model: concepts, relationships, responsibilities, and their places in the implementation.

We believe in Domain-Driven Design. Lexicon brings its vocabulary and bounded contexts to existing code through annotation and linkage. Annotations explain meaning. Links connect concepts to each other and to the code that implements them.

The model comes first. It must express a real system clearly, remain small enough to understand, and let people move easily between domain meaning and implementation.

Lexicon should be lean. Every feature must earn its place by making software easier to understand. Maintenance effort counts toward that cost.

`lexicon/docs/` remains a dumping ground to address later.

## The model

The project supplies a name, a short explanation, and its contexts. Four objects describe the system:

| Object | Purpose | Contents |
|---|---|---|
| Context | Establish where meaning is consistent | Stable ID, name, purpose, responsibilities |
| Concept | Name a domain idea within a context | Stable ID, name, explanation, owning context |
| Relationship | Explain how concepts or contexts relate | Stable ID, source, target, named relation, explanation |
| Code Link | Connect meaning to implementation | Owning object, file or symbol, role, explanation |

Annotations carry explanations, rules, constraints, and rationale on these objects.

DDD classifications add precision where useful: entity, value object, service, event, aggregate; upstream/downstream, shared kernel, translation boundary. Real examples guide how much structure each needs.

Identity survives changes to names and code locations. Code links support many-to-many mappings: a concept can span several files, and a file can implement several concepts. Each link names its role, such as definition, implementation, enforcement, or usage. Symbols provide precise targets; files provide a fallback.

Coverage grows from human questions. Start with the concepts needed to understand a subsystem, then test whether their relationships and code links help a reader explain it.

Code-link explanations make the correspondence between domain names and implementation names explicit. Rule annotations distinguish intended consistency, observed behavior, and enforced checks.

Worked example: [DentalML canal measurement](viewer/examples/dentalml/README.md).
