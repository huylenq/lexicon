# Lexicon reader

Projects open in [Canvas](CANVAS.md), with model references, notes, drawings, and media. Run `bun run dev:canvas` for an isolated checkout workshop.

A local reader for the four-object domain model: contexts, concepts, relationships, and code links. Read the explanation, explore its connections, and inspect the implementation.

```sh
bun install --frozen-lockfile
bun run build:client
bun start
```

Open http://127.0.0.1:5374. Development uses `mise run viewer` from the repository root, with Vite on http://127.0.0.1:5373.

The production build is installable as a PWA. Open port 5374 and use **Install app** when offered, or the browser's install menu. Supporting desktop browsers can place the inline header alongside native window controls through Window Controls Overlay. Other browsers retain their standard app title bar. The header's empty space drags the window; its links and buttons remain clickable.

Keep `bun start` running to read projects and source. The service worker caches only the built app shell, including the canvas assets. If the server is unavailable, the app opens with a reconnect message; model data, source code, and library changes are never cached. Updates activate after all existing app windows and tabs close. PWA caching is enabled only in production builds, so Vite development stays live.

The library includes a DentalML example plus your registered projects. DentalML source links use a sibling `dentalml` checkout. Add a project by its absolute folder path. Removal affects its library registration only.

- **Read:** a vertical stack of context, concept, relationship, and mapping explanations overlays the right side of Canvas. New objects append at the end; reopening an object reveals its existing card. Links from an older card also append at the end. Close removes only that card. Resize the overlay at its left edge, or use the Reader header toggle to hide it without clearing your cards.
- **Relationships:** select either endpoint to open that context or concept, or select the relationship name to read its explanation. Each is a separate link that also supports opening in a new tab.
- **Code:** an independently toggled, resizable workspace with line numbers, syntax coloring, declaration focus, and links back to every mapped domain object. Code links from Browse and Canvas open this same pane. Domain navigation preserves the current code location; closing and reopening Code restores it, including its file view and scroll position. The pane has its own previous/next location controls. On narrow screens, Code fills the workspace and **Back to reader** returns to the explanation.
- **Find:** search names, descriptions, annotations, files, and symbols. `/` focuses search; Escape closes code or navigation.
- **History:** the URL shares the active object and source selection. Browser Back/Forward restores the whole reader stack, including closed cards. Stack contents, visibility, and scroll position are remembered in this browser per project. Copy link on a card shares that card.
- **Refresh:** reread the model from disk. Parsing is uncached.

The light and dark themes use neutral surfaces, a vivid pink interaction accent, and the system UI font. Dark mode uses near-black backgrounds. Navigation, toolbars, and metadata use compact spacing; explanations retain a comfortable reading measure. Object names remain neutral, with semantic color confined to their leading icons across Browse, Read, Canvas, and Code. Context icons are neutral. Entity, value (including value object), aggregate, service, and event have stable icon colors; other classifications use the generic concept icon and color. Hovering an icon or focusing its containing control reveals its type and authored classification. The sidebar uses a flat selection tint matching the object icon, including neutral gray for Contexts, without an indentation guide or vertical selection bar. Code syntax has its own theme colors.

Browse visibility sits beside the project identity; Reader and Code have their own pane controls; Agent opens from the bottom status bar. Browse is a floating navigation shelf inset 12px from the left edge and vertically centered below the header, with content-fit height and a scrolling list beneath its search field. Its height leaves clearance for the bottom-left zoom and fit controls, including when the window or canvas pane is resized. Searching keeps the shelf at its pre-search height so the input stays in place; clearing search restores content-fit sizing. Toggle it from the header. Code and Chat have local close buttons; optional panes restore their state when reopened. Back and Forward in the application header follow browser history; Code retains its independent source history.

The [icon catalogue](client/public/icons.svg) contains 31 original SVG symbols for model objects, classifications, annotations, and viewer controls. Each uses a 20-unit grid, 1.5-unit rounded strokes, and inherited text color. The catalogue is also the production sprite; `Icon.tsx` provides typed names and hides decorative SVGs from assistive technology while adjacent text or button labels carry their meaning.

Reader cards have separate rounded surfaces and visible gaps, and share one scrollbar. Earlier titles collect at the top as you scroll, with the title area capped at roughly one-quarter of the reader height. Clicking a title reveals its card. Opening or clicking a card makes it active for Agent context and canvas synchronization; scrolling alone leaves the active card unchanged. Clicking empty canvas preserves the stack. On narrow screens, Reader fills the workspace and switching back to Canvas preserves its cards.

## Canvas

Canvas extends beneath the resizable reader overlay for every project. Model objects keep their Lexicon icons and relationships; freeform notes, drawings, and media add working context. Select an object or relationship to read it. On narrow screens, the header’s **Reader** toggle returns to the same canvas view.

The **Diagram / Atlas** mode toggle changes the canvas presentation. Diagram uses cards and connections. Atlas offers Ink and classic illustrated Village skins: contexts form districts, concepts become landmarks, and relationship routes become paths. It regenerates from the current canvas positions as you move objects. Both modes share positions and selection. In Atlas, select a model object to choose its landmark, terrain, or path in the appearance panel. Appearance choices are shared with the canvas; the mode and Atlas skin are remembered in this browser. See [Atlas mode](CANVAS.md#atlas-mode) for the defaults and scope.

Diagram context frames and Atlas territories automatically encompass their inner nodes and labels as they move. Select a context in Atlas for **Edit border** to sculpt its coastline. Border edits are preferences: a bay yields to a node and returns when space allows. **Reshape to contents** clears those preferences. Switching modes keeps objects in place.

The toolbar uses the shared icons for **Fit model**, **Locate**, **Show all code**, and **Arrange**. Right-click a model object for **Focus** and **Expand code / Hide code**; context expansion includes its concepts and internal relationships. **Back to overview** restores the camera from before Focus. **Add note** attaches a note to the selection. **Notes** searches canvas text; **Selection actions** opens attachment, model-edit, and selection-export controls. Routine save status sits beside the legend in the footer. Recovery and conflict messages appear when needed.

Canvas saves placements and freeform content to the project, while camera and visibility remain personal. On first open, compatible earlier placements and camera migrate from this browser. Existing saved canvases and recovery drafts take precedence. See [Project canvas](CANVAS.md) for files, recovery, and model-edit behavior.

Code references share a target for identical declared file/symbol or file/line links while preserving each mapping's role and explanation. A code card opens the Code workspace without replacing the reader; a code connector opens its explanation in the reader and source in Code. Targets use declared paths and symbols, without resolving aliases.

Old `?canvas=graph` and `?canvas=tldraw` links open the same tldraw canvas and normalize to an ordinary project URL, preserving the selected item and code location.

Earlier XML models open through a read-only import adapter. See [MIGRATION.md](../MIGRATION.md). The model format is in [MODEL.md](../MODEL.md).

## Chat

Open **Agent** in the bottom status bar to discuss and refine the project's shared model. It toggles independently of Browse, Canvas, and Code. The shared status bar shows the model legend and visible concept/code counts, with Agent on the right. Chat floats above it by default. Use **Attach Agent to right side** in the chat header to give it a dedicated right pane, or **Float Agent window** to detach it. The choice is remembered per project; narrow screens use the floating view. Minimize chat back to the Agent button or close it; drafts and running conversations remain intact. A working dot on Agent stays visible during a running turn. On narrow screens, the bar keeps the model counts and Agent button, and the dock fits above it. Conversations survive navigation, reload, and server restarts.

Choose **Codex**, **Grok**, or **Claude**. Install the corresponding CLI and sign in through its terminal workflow first. Lexicon checks the local runtime's authentication status; it does not ask for API keys. The model picker’s status dot shows connection health; open the picker for details and **Check connection** after signing in. Codex uses app-server, Grok uses ACP, and Claude uses streaming CLI output. Lexicon creates its own sessions and resumes them on later messages.

Choose the provider and model together in the **model picker** before sending. Search by model name, ID, description, or provider; use the arrow keys and Enter to select, or Escape to close. Codex and Grok supply their model catalogs; Claude offers its account default, Sonnet, Opus, and Haiku aliases. **Custom model** accepts a runtime model ID. Reasoning choices appear when advertised by the runtime. Selections are remembered per project and agent on this browser, apply to subsequent turns in the same conversation, and appear beside each reply. Use **Refresh models** to reload the catalog. The runtime reports unavailable models as errors. A lightning toggle offers **Fast mode** for Codex models advertising a fast service tier and for Claude Opus. Fast mode uses more credits or extra usage; its tooltip describes the tradeoff. It is off by default and applies to the next message. Switching to an unsupported model clears it.

Tool calls appear as they run. Expand one to inspect its input and output; completed calls remain in the conversation after reload. Long output is truncated. A call without a result is marked stopped rather than successful. Replies show elapsed time and completion state. **Reuse prompt** puts an earlier question back in the composer for editing, and **Jump to latest** returns to the newest activity after scrolling up.

The selected concept or relationship and its code links appear above the composer. Uncheck the attachment for a project-wide question. Each sent message keeps the context captured at that moment. The circular up-arrow inside the textarea sends; **Enter** sends and **Shift+Enter** adds a line. While a reply runs, that button becomes **Stop**. When the agent asks a structured question, choose an option or type your own answer.

Ask exploratory questions to discuss the model. Explicit requests such as “rename this concept” or “split this into two concepts” produce incremental edits. Agents read source; the server validates and saves the model. New code links must resolve, and unsupported symbol checks are reported. Invalid edits and edits based on an externally changed model are rejected without overwriting the file. **Undo edit** restores the previous contents, provided the file has not changed since. The team shares and reviews model changes through Git.

An unmodeled project opens without generating or writing anything. Start with a question or request a small overview. The built-in example supports explanation only; earlier XML models must be converted before chat can refine them. Linked worktrees can share model artifacts with their primary checkout.

Conversation history, native session IDs, and undo snapshots live in the viewer's local SQLite registry. **New conversation** clears the visible conversation and starts fresh provider sessions while retaining model undo history. CLI paths can be set with `LEXICON_CODEX_BIN`, `LEXICON_GROK_BIN`, and `LEXICON_CLAUDE_BIN` when they are not on the server's PATH.

## Checks

```sh
bun run test
bun run typecheck
bun run build:client
bunx playwright install chromium
bun run test:browser
bun run test:canvas
bun run check examples/dentalml --code-root /path/to/dentalml
```

The API binds to `127.0.0.1`. `LEXICON_VIEWER_API_PORT` changes port 5374. `LEXICON_VIEWER_DB` chooses a separate SQLite registry for tests; the default preserves `lexicon-viewer.db`. API source requests identify a declared file/symbol or file/line target independently of its domain mappings; earlier owner/index requests remain supported. The server accepts only targets declared in the model and confines the resolved file to the code root.

Browser checks build and serve the client on port 5384 with a separate in-memory registry. Reader, code-navigation, and conversation checks use the tldraw canvas. `bun run test:canvas` exercises Canvas through `bun run start` on port 5395 with temporary projects and its own in-memory registry. To use an installed Chrome instead of Playwright's Chromium, run `PLAYWRIGHT_CHANNEL=chrome bun run test:browser`.

For reader frame-time measurements, build the client, start an isolated server with `LEXICON_VIEWER_API_PORT=5388 LEXICON_VIEWER_DB=:memory: bun run start`, then run `bun scripts/reader-performance.ts http://localhost:5388` in another terminal. The script scrolls 5-card and full DentalML stacks down and back three times in Chromium at 1600×900 with 4× CPU throttling. It reports animation-frame intervals and CDP script/layout/task time; these are comparative measurements, not portable performance thresholds. Keep other builds and tests idle during comparison runs. Stop the isolated server afterward.

For a detailed Canvas trace, build with `bun run build:client --sourcemap`, use the isolated server above, and run `bun scripts/reader-trace.ts http://localhost:5388 /tmp/reader-canvas /absolute/path/to/lexicon/model.xml`. The optional model is copied to a temporary project; the original is untouched. The script exercises both morph directions, tile-row changes, settling, and distant navigation with up to 24 concept cards. It writes a Chrome `.trace.json`, `.cpuprofile`, screenshot, and summary beside the output prefix. Import the trace in Chrome DevTools Performance. Tracing adds overhead, and nested event durations must not be added together as total runtime.
