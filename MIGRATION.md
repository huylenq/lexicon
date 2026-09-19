# Model schema migration

Lexicon reads and writes only schema **3.3**. Older, unversioned, and newer XML is preserved and shown as a version mismatch; malformed XML shows a repair state. There are no old-schema semantic readers, serializers, or automatic converters.

Open the project in the viewer, choose **Open Agent**, and ask about the document or explicitly request migration to schema 3.3. Asking a question does not request a change. The agent follows the matching [schema delta](skills/lexicon/migrations/README.md), preserves the model's meaning and identities, and submits a complete current-schema document through `lexicon_migrate`. In Model only, this creates an unsaved migration draft. Review the candidate and choose **Approve changes** to save it; **Discard draft** leaves the original document untouched. Approval revalidates the document and source links and checks that model.xml still matches the starting snapshot before saving atomically. Code + model and standalone external MCP migrations save directly through the validated writer.

Readable schema-3 models use ordinary incremental patches. Migration is reserved for unavailable documents. A future or unknown version without a documented migration path remains intact; the agent explains the missing path. A malformed document can be repaired on explicit request when its intended content is clear.

External agents use the same MCP migration tool and [migration instructions](skills/lexicon/migrations/README.md). The server preserves exact previous bytes for undo. The read-only checker is also available:

```sh
cd viewer
bun run check /absolute/artifact-root --code-root /absolute/code-root
```

An earlier project with lexicon/system.xml is detected without importing its semantics. Its agent reads the earlier files and creates model.xml; the originals remain. Linked worktrees retain separate source and artifact roots. Canvas, assets, registrations, and conversations are preserved independently.

When changing the schema again, update the current model contract, parser, fixtures, and docs together and add the delta to the migration directory. Maintain instructions for moving forward; do not add runtime branches for older models.
