# Operate Lexicon through MCP

The local MCP adapter lets a compatible agent inspect Lexicon projects, create and update model items, observe selection, and select or frame items in a running viewer. It shares model validation and revision checks with embedded agents and canvas commands. Model-only tasks stage drafts for viewer approval; coding and standalone external agents save directly.

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

## One MCP interface

Embedded tasks and external agents use the catalog in `server/agent/tools.ts` and the dispatcher in `server/agent/operations.ts`. `ModelService` stays internal: it owns link validation, conditional file saving, artifact locks, and durable exact undo for MCP edits and canvas commands. Agent prose and code fences never trigger edits.

Embedded tasks use Streamable HTTP at `/api/agent/mcp/turn` with an ephemeral bearer credential. It binds the originating project, task scope, viewer, starting saved-model revision, and T3 user message. Tools omit these server-bound arguments. Model-only edits advance the candidate revision while retaining the saved baseline. Direct coding edits advance the saved revision. Merely inspecting a newer external revision does not grant permission to overwrite it. External MCP clients use explicit IDs and revisions through the stdio adapter.

Model-only edit, patch, and migration calls persist an unsaved task draft and return `status: "draft"`; inspect/search in that task includes the candidate. Direct coding calls save immediately and return `status: "saved"`. Drafts and completed saves both retain receipts and survive interruption. Stop, completion, archive, deletion, and server restart revoke tool authority. Pending mutations check cancellation before changing draft or saved state. Navigation success still requires acknowledgment from the originating viewer, never a replacement tab. Embedded tools do not expose undo or draft approval.

T3 owns provider attachment through its existing `/mcp` server. Lexicon uses the version 2 gateway contract: authenticated `/api/integrations/mcp` reports supported provider instances, `/server` registers the upstream endpoint, and `/grant` authorizes one originating thread/message using an ephemeral bearer credential. Re-registering the same endpoint is idempotent and preserves other tasks' grants. Registration alone gives no tool access. Credentials stay between T3 and Lexicon, outside provider configuration and conversation history.

T3 exposes two permanent tools, `integration_list_tools` and `integration_call_tool`. Each turn discovers the authorized Lexicon catalog with `{"integration":"lexicon"}`, then calls a returned qualified name such as `lexicon.lexicon_inspect`, passing its returned `grantId` and tool arguments. The grant ID prevents a delayed call from an earlier turn from acquiring a newer turn's access. Stable gateway tools avoid depending on harness-specific catalog refresh: rotating a Lexicon credential does not stop or restart the provider session. T3 forwards MCP results, while Lexicon remains responsible for validated drafts, saves, and revision ownership. Coding checkpoint restore remains in the T3 app.

Code + model offers the provider configurations reported by T3's gateway; Model only retains its separately verified Codex sandbox restriction. Older T3 servers report an actionable unsupported error before dispatch. Installing the gateway requires rebuilding and restarting T3 separately; Lexicon does not restart the user's server.

Tasks keep working context and activity separately from model and canvas artifacts. `POST /api/projects/:id/agents` accepts `name` and optional `contextIds` spanning any model item types. `POST agent/context?agent=…` replaces those references without sending a turn. Context does not claim ownership or constrain source access. `lexicon_work` publishes only context and declared focus; agents do not publish a separate proposal.

Model-only tasks keep one durable draft candidate against an exact saved baseline. Every refinement changes the draft identity. The canvas displays the delta as temporary additions, modifications, relationships, and removal marks; these never write canvas.json or model.xml. The user's `POST agent/draft-apply?agent=…` with `{draftId}` saves the whole reviewed candidate only while the task is idle, after checking identity, unchanged saved bytes, semantic validity, and source links. `draft-discard` with the current ID removes the candidate without touching the model. A stale draft cannot be approved. A pending draft must be approved or discarded before switching to Code + model. Migration and project metadata are included; flows stay reviewable without acquiring canvas shapes. Draft approval is not an MCP tool.

Approval records its identity and exact candidate before saving. If finalization fails after the file write, the viewer reports `approvalPending`; retry finalizes the same save once, and discard is blocked. Recovery can finish an already-saved candidate but never writes an unsaved candidate during inspection. Settled and archived tasks retain direct access to pending draft review.

## Tools

| Tool | Inputs | Result |
| --- | --- | --- |
| `lexicon_projects` | None | Existing projects and stable project IDs |
| `lexicon_inspect` | `projectId`, optional `itemId`, `offset`, `limit` | Bounded model page or item, revision, roots, document availability, and relevant relationships |
| `lexicon_work` | `projectId`, `taskId`, optional `contextIds`, `focus` | Bounded context/focus receipt; no model write or proposal |
| `lexicon_search` | `projectId`, `query` | Up to 100 matching items, total count, revision |
| `lexicon_sessions` | `projectId` | Open viewer sessions, selection, primary pane, connection, revision |
| `lexicon_navigate` | `projectId`, `sessionId`, `action`, optional `itemId` | Viewer acknowledgment and resulting session state |
| `lexicon_edit` | `projectId`, `revision`, `action`, `item` or `itemId` + `fields` | Draft or saved receipt according to task scope, affected IDs, and link warnings |
| `lexicon_patch` | `projectId`, `revision`, `patch` | Atomic initialization, upsert/removal, and reference repairs; stages in Model only |
| `lexicon_migrate` | `projectId`, `revision`, `xml` | Explicit migration/repair of an unavailable document; stages in Model only |
| `lexicon_undo` | `projectId`, `changeId` | Standalone external model undo only; unavailable to task-bound agents |
| `lexicon_events` | `projectId`, optional `cursor` | Scoped events, next cursor, reset flag, sessions, observed model revision |

Navigation actions are `select`, `focus`, and `fit`. Select updates the reader's context without moving the canvas camera. Focus selects and frames an item, switching to the combined projection when necessary. Use select for flows, which have a reader representation but no canvas shape. Fit frames visible model content and takes no `itemId`.

Each browser tab gets its own session ID. Choose it explicitly; a project may be open in several windows. A session's `view` identifies the primary pane even when desktop layout shows several panes. Session IDs and event cursors are ephemeral. Reinspect after a disconnect or server restart.

## Standalone external worked sequence

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

Patch upserts are complete items: include `annotations` and `codeLinks` arrays even when empty, plus the fields required by the item type. Migration accepts a complete XML candidate up to 1,000,000 Unicode characters; the enclosing HTTP JSON request has a separate 2,000,000-character limit.

5. Call `lexicon_navigate` with the chosen `sessionId`, `action: "focus"`, and `itemId: "refund"`. The result follows the viewer's acknowledgment, with an eight-second deadline.
6. Read `lexicon_events`, retain its cursor, make a selection in the UI, and read events again with that cursor.
7. Undo using the latest edit's `changeId`. Undoing an earlier edit requires undoing newer changes first. A changed file blocks undo rather than overwriting external work.

Navigation failure does not roll back an already saved model edit. If a call loses its response, inspect the model or session before retrying. A stale write revision is rejected. Validation checks syntax, model relationships, and new link targets; it does not prove that a domain explanation is correct.

## Local application routes

The stdio adapter is an MCP client of the viewer's Streamable HTTP endpoint, `/api/agent/mcp`. It forwards catalog discovery and tool calls through the official SDK. This external endpoint inherits local-origin and desktop-session checks. Embedded tasks instead use `/api/agent/mcp/turn`, which requires a valid turn credential and never falls back to external authority. The old per-tool HTTP routes are removed. Agent requests accept JSON bodies up to 2,000,000 characters.

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


## Task lifecycle

T3 owns bound task lifecycle. Minimize hides the widget without ending the task. Settled follows T3's settlement state, distinct from a completed turn; Archive removes the task from active work while preserving history. Task history can resume a settled task or restore an archived task with its original conversation, context, and recorded changes. Discard removes an unsent local draft. Deleted T3 threads are shown as unavailable history. Closing the final task leaves the workspace empty until New agent is used.

## User configuration

T3 pairing is a user setting for the Lexicon server profile, shared by all projects and task sessions. `server/user-settings.ts` owns private persistence; the public `UserSettings` contract excludes credentials. `/api/settings` reads configuration and connection health; `/api/settings/connections/t3` pairs or disconnects through serialized mutations. `/api/settings/events` invalidates shared browser state and restarts task subscriptions after a pairing change. Agent routes have no pairing controls. The app-level settings surface distinguishes server connections, browser appearance/development preferences, and artifact-root project source filters.

Model only selects T3’s explicit `read-only` runtime mode (Codex: `never` approval policy with a read-only sandbox on thread start, resume, and every turn). It does not reuse `approval-required`, whose untrusted-command policy can prompt for ordinary reads. Gateway consent and filesystem policy are separate: the authenticated active-turn grant authorizes only the two gateway tools. Capability discovery must report `gatewayApprovalPolicy: "active-turn-grant"`, `executionContext: true`, and the selected instance in `readOnlyProviderInstanceIds`; stale builds fail before project/thread creation or message dispatch.

The turn's `message.text` is the user's unmodified text. A separate bounded `executionContext` carries scope, stable item references, revision, and MCP workflow guidance. T3 persists it with the requested turn and adds it only for provider execution; it does not become a message, title, or search text. This is client-supplied context, not an elevated provider instruction role. Models and raw migration documents are read on demand rather than copied into every turn. Installed workflow references supply detailed authoring guidance. T3 owns the original conversation text; Lexicon does not maintain a second message history.
