# Bringing an earlier Lexicon project forward

The reader opens `lexicon/model.xml` first. If it is absent, it can import the earlier XML layout (`system.xml`, `contexts/*.xml`, and `surfaces/*.xml`) for reading.

The import adapter preserves original identities where possible, maps model atoms into concepts, extracts reference relationships, and carries prose and code anchors forward. Earlier system and surface groupings become provisional contexts. Earlier atom kinds remain classifications. Import notices identify unresolved references and the need to review meaning.

The adapter is a reading bridge. Review context boundaries, relation names, code-link explanations, and DDD classifications before adopting its output. Earlier originals remain the record for any semantics that require interpretation. YAML-era models require a manual reconstruction from source and their existing notes.

## Preview and write

From `viewer/`:

```sh
# Print the proposed model to stdout for review.
bun run convert /path/to/project

# Create model.xml while preserving every earlier file.
bun run convert /path/to/project --write

# Check the new model and its source links.
bun run check /path/to/project
```

Writing uses exclusive creation: an existing `model.xml` is preserved. Structural errors stop conversion. Import warnings stay visible in the preview log; resolve their meaning during review. When code lives elsewhere, use `--code-root /path/to/code` with the checker.

## Workflow consolidation

The plugin now has one skill: `/lexicon:lexicon`. Read, annotate, and update under the current task. Earlier lifecycle commands, the timestamp marker, and the awareness and prose skills are retired. Existing project prose stays in `lexicon/docs/`.

The viewer now reads the four-object model through Read, Map, and linked source. The old graph lenses, LSP services, generated territory graphs, model-health dashboards, and editor dependencies have been removed. The project registry remains compatible with the existing local SQLite database.
