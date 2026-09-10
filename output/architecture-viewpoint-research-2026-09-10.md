# Architectural foundations for Lexicon

Research dated September 10, 2026. This is a research recommendation, not an adopted product specification.

My recommendation is to use the SEI's Views and Beyond as the governing framework for architectural views in Lexicon, and C4 as the first concrete architectural vocabulary to evaluate for adoption. DDD should continue to explain domain meaning. ArchiMate is the serious alternative if Lexicon needs one standardized language spanning business and technical architecture.

These choices have different responsibilities. Views and Beyond supplies the principles for selecting and connecting views. C4 supplies a deliberately small set of software abstractions. The connection between those abstractions and Lexicon's domain model would be a Lexicon design decision; the sources do not provide a standardized, unified DDD+C4 metamodel.

The current [manifesto](/Users/huy/src/lexicon/MANIFESTO.md:3) makes cognitive debt the problem and a human model grounded in implementation the product. Its progressive principle puts shared judgment and incremental refinement at the center. The [model contract](/Users/huy/src/lexicon/viewer/shared/model.ts:38) currently represents contexts, domain concepts, and named relationships. It has stable identities, annotations, and source links, but no architectural containment hierarchy or viewpoint definition. Adding architecture would therefore change the semantic model, with consequences beyond canvas presentation.

I evaluated the candidates against five requirements derived from that direction:

- Defined abstractions and relationships that constrain modeling choices.
- A reasoned basis for choosing views, with explicit connections among them.
- Applicability to existing software and its implementation.
- A useful small starting point that can grow through questions.
- A clear boundary between well-formed models, architectural claims, and evidence that those claims hold.

The comparison below is my assessment of product fit. The descriptions of each approach are supported by the linked primary sources.

| Candidate | Established contribution | Fit with Lexicon | Remaining limitation |
|---|---|---|---|
| SEI Views and Beyond | Families of architectural structures, styles, view selection, and information connecting views | Strongest governing framework for varied codebases | Requires choosing concrete model kinds and vocabularies |
| C4 | Named software abstractions, levels of detail, and related diagram types | Strongest small architectural vocabulary to start with | Domain semantics and general behavior modeling remain outside its scope |
| Kruchten's 4+1 | Logical, process, development, and physical views connected through scenarios | Strong alternative when a predefined view framework is wanted | Its logical view needs careful interpretation alongside Lexicon's domain model |
| ArchiMate 4 | A standardized enterprise architecture modeling language | Strongest candidate for a broad common metamodel | Its wider scope and DDD mapping need a larger product decision |
| RM-ODP | Five viewpoint languages sharing foundational concepts and consistency rules | Strong reference for rigorous correspondence between specifications | Distributed-system specification is a narrower and more demanding purpose than everyday code comprehension |

Views and Beyond makes a useful distinction between three families: module structures organize implementation units; component-and-connector structures describe runtime participants and their interactions; allocation structures relate software to its environment. This classification comes from the architecture literature. [SEI comparison report, sections 2.2–2.4](https://www.sei.cmu.edu/documents/2072/2005_004_001_14498.pdf)

A chosen architectural style makes the vocabulary more specific. It establishes which elements and relations are meaningful and which restrictions apply. Interfaces, behavior, rationale, and the reader's concerns are also part of the documentation method. This supplies a basis for evaluating a proposed view before making it part of a product. [SEI architecture-documentation curriculum](https://www.sei.cmu.edu/training/documenting-software-architectures/)

The approach selects views according to their use and documents information that connects them. Its emphasis on communication and architectural decisions fits Lexicon's existing reader, explanations, and refinement through conversation. I would adopt those principles without treating the accompanying document template as a mandatory user workflow. [SEI Views and Beyond collection](https://www.sei.cmu.edu/library/views-and-beyond-collection/)

Cross-view mappings deserve particular attention. The SEI's documentation guidance explains that a code module may correspond to part of one runtime component or to several, and that mappings are generally many-to-many. That supports Lexicon's current treatment of domain-to-code correspondence. It also argues for explicit architectural objects with explained links to domain objects. [SEI web-based documentation report, appendix section 4](https://www.sei.cmu.edu/documents/2057/2004_004_001_14351.pdf)

The SEI treats behavior as part of a view and has specific guidance for documenting system and component behavior. My proposed application to Lexicon is to let a question about an interaction select the behavioral description appropriate to the participating elements. [SEI's worked architecture example](https://insights.sei.cmu.edu/documents/111/2009_019_001_28984.pdf), [Documenting Behavior](https://www.sei.cmu.edu/library/documenting-software-architecture-documenting-behavior/)

C4 is attractive because its abstractions are small and explicit: software systems contain applications or data stores, which contain components implemented by code. Its four familiar diagrams are principally levels of detail. This differs from frameworks that separate source organization, runtime interaction, and allocation as distinct architectural concerns. [C4 abstractions](https://c4model.com/abstractions)

The definitions impose useful discipline. A C4 container identifies an application or data-store boundary. Deployment placement is a separate concern. A component groups functionality behind an interface inside a container; its correspondence to folders, packages, and shared libraries requires interpretation. These distinctions would help a Lexicon agent avoid using the same generic term for unrelated implementation structures. [C4 containers](https://c4model.com/abstractions/container), [C4 components](https://c4model.com/abstractions/component)

C4 also supplies related dynamic and deployment descriptions. Dynamic diagrams show interactions involving elements from the static model; deployment diagrams place instances in an environment. They extend the explanation using defined architectural identities. [C4 dynamic diagrams](https://c4model.com/diagrams/dynamic), [C4 deployment diagrams](https://c4model.com/diagrams/deployment)

Its practical alignment with Lexicon is unusually close: the creator describes understanding software and reducing the distance between architecture descriptions and source code as aims. However, C4 explicitly excludes domain models and general workflow/state-machine modeling from its central scope. Its guidance also identifies libraries and frameworks as cases where another modeling approach can be more suitable. For that reason, I would give C4 a defined architectural role rather than make it the entire Lexicon model. [C4 FAQ](https://c4model.com/faq)

C4's small vocabulary is intentional. Its abstraction guidance warns that casually adding levels can bring back ambiguous modeling. For Lexicon, adopting C4 should mean preserving the meaning of its abstractions and documenting any extensions. The existing domain hierarchy cannot simply become the C4 hierarchy by relabeling it. [C4 abstraction guidance](https://c4model.com/abstractions/faq)

The clearest collision is “context.” A DDD bounded context establishes consistent domain meaning. C4 system context places a software system among its users and other systems. C4's own definition says bounded contexts are generally not software systems. A domain concept also need not identify a C4 component. These distinctions should survive both the schema and the reader's language. [C4 software-system definition](https://c4model.com/abstractions/software-system), [Lexicon model](/Users/huy/src/lexicon/MODEL.md)

Kruchten's 4+1 is a credible alternative to Views and Beyond. It separates logical abstractions, concurrent processes, source organization, and physical placement, then uses scenarios to connect and exercise those descriptions. The process view concerns concurrency and synchronization, so it should not be casually equated with a business workflow. The original paper allows irrelevant views to be omitted and advocates iterative development through scenarios. My preference for Views and Beyond comes from its more open selection of structural styles across different kinds of codebase; 4+1 remains attractive if Lexicon wants a predefined set of viewpoints. [Kruchten's original paper](https://arxiv.org/pdf/2006.04975)

ArchiMate addresses a different ambition: a common language covering business and technical architecture. Its metamodel distinguishes element kinds and restricts the relationships allowed between them. It can be learned and applied through a small subset; breadth alone is therefore insufficient reason to reject it. The community's introductory text explicitly takes that approach. [ArchiMate community introduction, language structure and scope](https://archimate-community.pages.opengroup.org/workgroups/archimate-101/)

The current release is ArchiMate 4, published April 27, 2026. The official release description reports merged behavior concepts across domains, more generic common elements, and relationship multiplicity. An assessment based only on the older 3.x layer matrix would miss those changes. I would compare a deliberate subset of version 4 with C4 if adopting a common enterprise metamodel becomes the priority. [The Open Group, ArchiMate 4 specification](https://publications.opengroup.org/c260)

For today's Lexicon, my concern is the amount of interpretation needed to preserve DDD concepts, consistency rules, and precise source correspondence within that language. This is a product-fit judgment, not a claim that ArchiMate lacks rigor or cannot be used incrementally. The current research verified the official version-4 release description and the community's foundational explanation; it did not review the complete version-4 normative relationship tables behind the specification's sign-in flow.

RM-ODP is the strongest formal reference among this shortlist for viewpoint correspondence. Its enterprise, information, computational, engineering, and technology languages specialize shared foundational concepts, and their specifications must remain mutually consistent. The framework was developed for open distributed processing. I would study its correspondence discipline if Lexicon later needs stronger consistency analysis, while keeping its full specification vocabulary outside the initial adoption proposal. [ITU-T X.903, sections 4 and 10](https://www.itu.int/rec/dologin_pub.asp?id=T-REC-X.903-200910-I%21%21PDF-E&lang=e&type=items)

ISO/IEC/IEEE 42010 clarifies the surrounding architecture-description framework, viewpoints, and model kinds. It deliberately leaves specific modeling methods and notations open. It can help define terms precisely, but it cannot by itself choose the architectural objects Lexicon should support. [ISO's official description](https://www.iso.org/standard/74393.html)

The proposed product direction has a few concrete consequences:

1. Keep domain meaning and architectural structure semantically distinct. Both can belong to one shared description, with stable identities and explained correspondences.
2. Give every supported architectural view a documented purpose, an established vocabulary, and rules for relating it to the rest of the description. The same underlying fact should be reused across views.
3. Begin with C4's defined abstractions where they fit. Record gaps against the source definitions before extending them. Views and Beyond gives those gaps a place to be evaluated, including code organization that C4 does not primarily model.
4. Preserve Lexicon's evidence qualifications. Structural validity, source inspection, a deployment declaration, and a runtime observation support different claims. The current intended/observed/enforced distinction should remain visible beside the relevant claim.
5. Let questions select useful descriptions and depth. The framework governs their meaning; it does not require every project to fill every available view.

These are proposals for Lexicon, not requirements claimed to come from C4 or the SEI. In particular, the DDD-to-architecture relationship vocabulary remains unresolved. Source links can support that work, but shared filenames alone do not establish a meaningful correspondence.

Before changing the model format, I would validate the recommendation on an existing application model and a library or research-oriented example. The evaluation should test whether a reader can move from a domain responsibility to the responsible software element and inspected source, whether the same elements remain consistent across descriptions, and where the chosen framework forces awkward modeling. The result would determine the smallest useful extension and identify whether ArchiMate's broader language is worth its additional commitments.
