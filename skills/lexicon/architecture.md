# Software structure

Lexicon supports a fixed C4 vocabulary alongside domain meaning. Read this page only when the requested question needs architectural structure.

Use a person for a user role, a system for the software system of interest or an external system, a container for an application or data store, and a component for functionality behind an interface inside a container. These terms follow [C4](https://c4model.com/abstractions). Code links ground them in implementation; a folder alone does not establish a component.

Author the same explanations, annotations, code links, and ordinary relationships used for domain objects. A domain context and a software system remain distinct. Explain their connection when relevant.

Use `schema="3.0"` for XML containing architecture. Nest container inside system and component inside container. Existing context/concept nesting stays unchanged. Nesting supplies the single structural parent; do not also author a containment edge for it. A named relationship such as an Order containing Order Lines describes domain meaning and does not change their owning context.

Embedded patches use `parent` for concepts, containers, and components. Roots have no parent. The server checks parent types, cycles, endpoints, and source links. Reparenting does not prove the code was moved.

Keep the existing Explain / Initialize / Refine workflow. Add only the objects needed to answer the question. The viewer derives its filters and canvas references; agents need no viewpoint definitions or canvas generation step.
