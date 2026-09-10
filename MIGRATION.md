# Model schema migration

Lexicon reads and writes only schema **3.0**. Older, unversioned, and newer XML is preserved and shown as a version mismatch; malformed XML shows a repair state. There are no old-schema semantic readers, serializers, or automatic converters.

Open the project in the viewer, choose **Open Agent**, and ask about the document or choose **Migrate to schema 3.0**. Asking a question does not request a change. The agent follows the matching [schema delta](skills/lexicon/migrations/README.md), preserves the model's meaning and identities, and returns a complete current-schema document. The server validates it and all declared code links, checks that model.xml still matches the starting snapshot, and saves atomically. **Undo edit** restores the exact previous bytes, including an unsupported document; the mismatch screen then returns. External edits prevent save or undo from overwriting them.

Readable schema-3 models use ordinary incremental patches. Migration is reserved for unavailable documents. A future or unknown version without a documented migration path remains intact; the agent explains the missing path. A malformed document can be repaired on explicit request when its intended content is clear.

For standalone agents, read [the migration instructions](skills/lexicon/migrations/README.md). Keep the original bytes in a backup before writing model.xml and run:

```sh
cd viewer
bun run check /absolute/artifact-root --code-root /absolute/code-root
```

An earlier project with lexicon/system.xml is detected without importing its semantics. Its agent reads the earlier files and creates model.xml; the originals remain. Linked worktrees retain separate source and artifact roots. Canvas, assets, registrations, and conversations are preserved independently.

When changing the schema again, update the current model contract, parser, fixtures, and docs together and add the delta to the migration directory. Maintain instructions for moving forward; do not add runtime branches for older models.
