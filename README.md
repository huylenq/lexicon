# Lexicon

Lexicon reduces the effort of reconstructing how software works. It presents code as a human mental model, using Domain-Driven Design through annotation and linkage.

Start with a context, understand its concepts, follow a relationship, and open the implementation behind it.

- [Manifesto](MANIFESTO.md): purpose and principles.
- [Model](MODEL.md): the four objects and their XML representation.
- [Migration](MIGRATION.md): bringing an earlier project forward.

## Run the reader

```sh
cd viewer
bun install --frozen-lockfile
bun run build:client
bun start
```

Open **http://127.0.0.1:5374**. The library includes a DentalML canal-measurement example. DentalML code links use a sibling `../dentalml` checkout; its domain explanation is readable independently.

For development, run `mise run viewer` from this repository, then open **http://127.0.0.1:5373**.

The reader provides context browsing, search across meaning and code symbols, incoming and outgoing relationships with separate links for each endpoint and relationship, and a source pane with declaration highlighting. Browser addresses preserve the selected item and code link. Refresh reads the current files.

## Model a project

```text
project/
  lexicon/
    model.xml       # contexts, concepts, relationships, annotations, code links
    docs/           # project prose; organize it as needed
```

Use [the minimal example](MODEL.md#minimal-example) to start with one useful question about your codebase. Keep domain names meaningful; explain their correspondence to implementation names in code links.

Check the structure and linked source:

```sh
cd viewer
bun run check /absolute/path/to/project
```

For an artifact root separate from the code checkout, add `--code-root /path/to/code`. The command reports model errors, broken links, and unsupported symbol lookups separately. Python and TypeScript/TSX declarations are supported; other file types can use file or line links.

## Use with an agent

For local development, link the skill into the shared agent directory from this checkout:

```sh
mkdir -p ~/.agents/skills
ln -s "$PWD/skills/lexicon" ~/.agents/skills/lexicon
cd viewer
bun install --frozen-lockfile
```

The link keeps the skill and its launcher attached to this checkout, including uncommitted edits. No copy, publish, build, or reinstall is needed after source changes. Keep the checkout at the linked location. If the destination already exists, inspect it before replacing it.

The launcher works from any working directory:

```sh
bun ~/.agents/skills/lexicon/scripts/lexicon.ts root
bun ~/.agents/skills/lexicon/scripts/lexicon.ts check /path/to/project
```

Agents that discover `~/.agents/skills/` can load the shared skill. Discovery and already-loaded prompt refresh depend on the agent: after editing instructions, ask the agent to reread `~/.agents/skills/lexicon/SKILL.md`; start a fresh session if it still shows old metadata or does not discover the new skill. Checker source is read on every command. Rerun dependency installation only when dependencies change.

Install this repository as a Claude Code plugin:

```text
/plugin install github:huylenq/lexicon
```

Keep the full repository installed and run `bun install --frozen-lockfile` in its `viewer/` directory so the skill’s checker has its dependencies.

Use `/lexicon:lexicon` to read, create, or update a model. The single [skill](skills/lexicon/SKILL.md) starts from a human question, inspects code, and records useful meaning and links under the current task.

## Development

```sh
cd viewer
bun run test
bun run typecheck
bun run build:client
```

The runtime contract lives in `viewer/shared/model.ts`; the XML parser and structural checks live in `viewer/server/model.ts`. The client consumes the same types. The server binds to loopback and serves source only through declared model links.

The [pre-lean implementation](quarantine/pre-lean-b089f1c/README.md) is preserved as browsable source for future distillation.

MIT licensed. Earlier design history remains in [CHANGELOG.md](CHANGELOG.md) and Git.
