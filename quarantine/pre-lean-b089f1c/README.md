# Pre-lean implementation quarantine

Browsable, uncompressed source from revision `b089f1c9798d4b21b63d3d5bf0a29dc3af2d935e` lives in [source/](source/).

This is historical reference material for future distillation. Active development uses the repository-root `viewer/` and `skills/`. Historical instructions, plugin metadata, commands, and skills in this snapshot belong to the retired implementation. The active viewer build and skill directories are outside this quarantine.

The snapshot preserves the earlier viewer, models, skills, commands, schemas, migrations, tests, fixtures, documentation, and dependency lockfile. All 202 tracked entries were verified against their Git blob identities, including executable modes and the internal skills symlink. [inventory.json](inventory.json) records their paths and identities.

Potential material to revisit:

- React Flow and ELK graph layout and interaction.
- Monaco source peeks, backlinks, and reading-pane interactions.
- Tree-sitter and LSP code relationships and model-health checks.
- Schema and migration knowledge with regression fixtures.

Local databases, installed dependencies, environment files, and other untracked material remain outside this source snapshot. The live project registry remains in `viewer/lexicon-viewer.db` at the repository root.
