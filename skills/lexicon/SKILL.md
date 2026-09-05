---
name: lexicon
description: Read or annotate a codebase as a human domain model. Use when the user wants to understand a system's concepts, responsibilities, relationships, or their implementation, or create and maintain lexicon/model.xml.
user-invocable: true
---

# Lexicon

Reduce the understanding someone must reconstruct from code. Use DDD through annotation and linkage: contexts establish meaning, concepts name ideas, relationships explain connections, and code links show the implementation.

Choose the workflow from the request:

- **Explain:** inspect the relevant model and code, then answer the human question with source evidence. File changes are needed only when requested. A missing model is a reason to read the code directly.
- **Model:** create or update `lexicon/model.xml` for the requested scope, then check its structure and code links. Review domain meaning separately from the checker's results.

1. Start with the question the person needs to answer. Inspect the existing model and relevant source. For a linked Git worktree, check its primary worktree for project artifacts while inspecting implementation in the current checkout.
2. Explain the smallest useful set of concepts and relationships. Choose context boundaries by meaning and responsibility. Use DDD classifications when they help. Keep code-name and domain-name correspondence explicit.
3. When model editing is within the task, update `lexicon/model.xml` directly. Preserve stable IDs. Attach explanations, rules, and rationale to the objects they describe. Qualify rules as intended, observed, or enforced according to the evidence.
4. Link the inspected files or symbols and explain each link's role. A concept may span files; a file may implement several concepts. Relationships may carry code links too.
5. After model changes, run the checker and review the result through the reader when available. Report broken or unchecked links and any review you could not perform.

The format and a minimal example live in `${CLAUDE_SKILL_DIR}/../../MODEL.md`; the checker is `${CLAUDE_SKILL_DIR}/../../viewer/server/cli.ts`. Install dependencies once with `bun install --frozen-lockfile` in the bundle’s `viewer/` directory. Run the checker with Bun:

```sh
bun <bundle>/viewer/server/cli.ts check <artifact-root> --code-root <code-root>
```

Use the caller's explicitly chosen artifact root when supplied. A project can keep its prose under `lexicon/docs/`; its organization is outside this workflow.

For earlier XML projects, read `<bundle>/MIGRATION.md`. Preview conversion, review its domain meaning, and preserve the source files. Keep edits scoped to the current request.
