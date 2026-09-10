# Earlier XML layouts to 3.0

Use this guide only after identifying the earlier Lexicon layout: lexicon/system.xml referring to context files, or a model.xml using those same documented vocabulary elements. An unknown unversioned format requires clarification.

Read the original files as source data. Create one current lexicon/model.xml while retaining all originals. Preserve the system's ID and name; its purpose becomes the project description. Bounded contexts become contexts, terms become concepts within their context, and definitions/purposes become descriptions. Preserve descriptive categories as concept classifications, rules and rationale as annotations, and explicit relationship claims as explained directed relationships. Resolve earlier qualified references consistently into project-wide stable IDs; keep IDs already unique, and qualify collisions with their context ID. Record the ID correspondence in the migration response for review, not a new persistent registry.

Translate code anchors into code links with an inspected file/symbol and an explanation of their role. Never infer enforcement merely from a rule or an anchor. Retain aggregate meaning through a classified concept, explained member relationships, and consistency annotations; do not turn aggregates into structural parents. Preserve prior intended/observed distinctions. Inspect content the old vocabulary cannot represent directly and explain ambiguities before changing its meaning.

Validate only the final schema-3 document. Follow README.md for preserving files, review, and delivery. No runtime reader for this layout is maintained.
