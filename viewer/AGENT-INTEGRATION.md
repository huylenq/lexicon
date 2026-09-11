# Operate Lexicon through MCP

The local MCP adapter lets a compatible agent inspect Lexicon projects, create and update model items, observe selection, and select or frame items in a running viewer. It uses the same model validation, revision checks, and undo as embedded chat and canvas model commands.

The full vocabulary and rationale are in [Agent capabilities](../AGENT-CAPABILITIES.md).

## Start the viewer and adapter

From `viewer/`:

```sh
bun install --frozen-lockfile
bun run build:client
bun run start
```

Open `http://127.0.0.1:5374`, register your project, and open its model. The built-in Shop example supports inspection and navigation but is read-only. To try edits, copy `examples/shop` into a temporary folder and register that copy.

Configure your MCP host to start this process (replace the absolute checkout path):

```json
{
  "mcpServers": {
    "lexicon": {
      "command": "bun",
      "args": ["/absolute/path/to/lexicon/viewer/server/agent/mcp.ts"],
      "env": {
        "LEXICON_URL": "http://127.0.0.1:5374"
      }
    }
  }
}
```

The host starts and owns the stdio process. `bun run mcp` is the equivalent command when its working directory is `viewer/`. The adapter writes only MCP messages to stdout. It connects to the viewer over loopback HTTP; it does not start a second viewer or maintain another project registry. Use an absolute path to Bun if the host's PATH does not include it.

For a server started on another port, set `LEXICON_URL` to that origin. When `LEXICON_URL` is omitted, the adapter discovers a running desktop instance from its private `agent-connection.json` in the Lexicon app-data directory (macOS: `~/Library/Application Support/Lexicon/agent-connection.json`). It rereads the file for every call, following port/token rotation across desktop restarts. For an isolated desktop data directory, set `LEXICON_CONNECTION_FILE` to that file. An explicit URL takes precedence and requires `LEXICON_DESKTOP_TOKEN` for a desktop-managed endpoint. Keep connection files private; do not copy their tokens into notes or screenshots. If no discovery file exists, the adapter falls back to the development origin on port 5374.

This provides a local MCP connection. It does not add speech capture or establish compatibility with a particular ChatGPT voice surface. A remote client needs a separately designed and authenticated connection path; the adapter deliberately accepts only local HTTP origins.

## Embedded chat and shared execution

Embedded chat and MCP use `server/agent/operations.ts` as their sole operation dispatcher. `tools.ts` owns the schemas and descriptions; MCP discovers this catalog from the running server. `embedded.ts` derives the chat catalog by removing server-bound arguments. It does not implement operation behavior.

The reader sends its session ID with each chat message. The server captures that ID, the current model revision, and latest undo identity for the turn. The agent returns a `lexicon-operations` array of named operations. The server applies create/update, select/focus/fit, and exact undo through the same handlers as MCP. A model patch can precede navigation for complex atomic refinements; it cannot be combined with a second edit or undo. At most one model mutation and eight operations are accepted per reply.

Chat remains scoped to the project and viewer that originated the message. It never follows a different tab after disconnection. Calls run in order and stop on failure. Successful saves remain applied if navigation fails. The UI shows server receipts separately from agent prose; navigation success requires the viewer acknowledgment. Read-only source tools and runtime permissions remain unchanged.

`ChatService.commitModel` owns link validation, conditional file saving, and durable undo entries for patches, canvas commands, and operation edits. A turn lease permits only that active chat turn to use its existing artifact lock; external mutations remain excluded until the turn finishes.

## Tools

| Tool | Inputs | Result |
| --- | --- | --- |
| `lexicon_projects` | None | Existing projects and stable project IDs |
| `lexicon_inspect` | `projectId`, optional `itemId` | Model or item, revision, and relevant relationships; full-model inspection also reports roots and document availability |
| `lexicon_search` | `projectId`, `query` | Up to 100 matching items, total count, revision |
| `lexicon_sessions` | `projectId` | Open viewer sessions, selection, primary pane, connection, revision |
| `lexicon_navigate` | `projectId`, `sessionId`, `action`, optional `itemId` | Viewer acknowledgment and resulting session state |
| `lexicon_edit` | `projectId`, `revision`, `action`, `item` or `itemId` + `fields` | Saved revision, affected IDs, change ID, link-check warnings, undo availability |
| `lexicon_undo` | `projectId`, `changeId` | Resulting revision and undo availability |
| `lexicon_events` | `projectId`, optional `cursor` | Scoped events, next cursor, reset flag, sessions, observed model revision |

Navigation actions are `select`, `focus`, and `fit`. Select updates the reader's context without moving the canvas camera. Focus selects and frames an item, switching to the combined projection when necessary. Use select for flows, which have a reader representation but no canvas shape. Fit frames visible model content and takes no `itemId`.

Each browser tab gets its own session ID. Choose it explicitly; a project may be open in several windows. A session's `view` identifies the primary pane even when desktop layout shows several panes. Session IDs and event cursors are ephemeral. Reinspect after a disconnect or server restart.

## Worked sequence

1. Call `lexicon_projects`, choose a project, and call `lexicon_inspect`.
2. Call `lexicon_sessions` and choose the connected viewer you intend to operate.
3. Use the returned revision to create a concept. Replace the example project ID, revision, and parent ID with inspected values:

```json
{
  "projectId": "1",
  "revision": "revision-from-inspect",
  "action": "create",
  "item": {
    "type": "concept",
    "id": "refund",
    "parent": "ordering",
    "name": "Refund",
    "description": "The return of payment for a purchase."
  }
}
```

4. Update it with `lexicon_edit`, using the revision from that successful receipt:

```json
{
  "projectId": "1",
  "revision": "revision-from-create",
  "action": "update",
  "itemId": "refund",
  "fields": {
    "description": "The return of an accepted purchase payment."
  }
}
```

Unspecified fields are preserved. Supplied arrays replace the entire existing array. Creation defaults omitted `annotations` and `codeLinks` to empty arrays. Item IDs and types cannot be changed by update. Structural parent and relationship requirements follow the model contract.

5. Call `lexicon_navigate` with the chosen `sessionId`, `action: "focus"`, and `itemId: "refund"`. The result follows the viewer's acknowledgment, with an eight-second deadline.
6. Read `lexicon_events`, retain its cursor, make a selection in the UI, and read events again with that cursor.
7. Undo using the latest edit's `changeId`. Undoing an earlier edit requires undoing newer changes first. A changed file blocks undo rather than overwriting external work.

Navigation failure does not roll back an already saved model edit. If a call loses its response, inspect the model or session before retrying. A stale write revision is rejected. Validation checks syntax, model relationships, and new link targets; it does not prove that a domain explanation is correct.

## Local application routes

The MCP adapter calls `POST /api/agent/tools/:toolName` with the tool's JSON arguments. `GET /api/agent/tools` returns the catalog. These routes inherit the viewer's local-origin and desktop-token checks and accept JSON bodies up to 128,000 characters.

The viewer bridge registers through `POST /api/agent/projects/:projectId/sessions`, publishes state with `PUT .../:sessionId`, receives live messages at `GET .../:sessionId/events`, and acknowledges commands through `POST .../:sessionId/ack`. Closing a surface deletes that session. Heartbeats retain an active session; stale sessions expire after 35 seconds. The browser reconnects and registers again after losing the connection.

The event feed retains 256 events across the server, filtered by project on read. `reset: true` means the caller should reconcile with the returned session snapshot and inspect the model if needed. With no viewer connected, model changes are observed when tools next inspect the document or read events. This feed is not durable history or an MCP resource subscription.

## Validation

Run the ordinary checks from `viewer/`. The agent browser test drives an actual stdio MCP client against a running isolated viewer:

```sh
bun run test
bun run typecheck
bun run build:client
LEXICON_BROWSER_PORT=5491 bun run test:browser tests/agent.browser.ts
```

It exercises two viewer sessions, creation, relationship creation, partial update, visible card refresh, camera-preserving selection, focus, fit, human selection events, mobile navigation, disconnection errors, and exact-file undo. The wider browser suite covers reader search, history, source links, chat, and error states.


The Codex catalog uses a configured default only when the runtime advertises it. Explicit custom model selections are retained; an incompatible selection still reports the runtime error. Archived or missing Codex sessions restart with Lexicon's saved recent project conversation, preserving the project discussion and model history.

Validation on the worktree rebased onto `8ea340e`: 150 unit/API/provider tests pass, including stale embedded writes and authenticated desktop discovery through an actual stdio MCP client. Typecheck and client build pass. All three focused MCP/embedded browser tests pass, including cancelled navigation and visible validation warnings. The preceding full browser run passed 68/69; the added cancellation test also passes. The remaining sidebar-edge assertion has the same previously established baseline 13-pixel gap. Live Codex acceptance uses GPT-5.6-Sol; particular ChatGPT voice clients and a rebuilt packaged desktop application remain outside this acceptance run.
