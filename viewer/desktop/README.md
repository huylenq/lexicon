# Lexicon desktop

The macOS app bundles the viewer, its Bun server, native source parsers, and modeling instructions. Users can open local projects without installing Bun or cloning this repository. Chat uses coding agents already installed and authenticated on the computer.

## Install and update

Download the DMG for your Mac from [GitHub Releases](https://github.com/huylenq/lexicon/releases): `arm64` for Apple Silicon, `x64` for Intel. Open it and drag Lexicon into Applications.

These builds are unsigned and unnotarized. macOS may block the first launch; use the app-specific **Open Anyway** option in System Settings → Privacy & Security if you trust the download. Managed Macs may prohibit opening it.

Lexicon checks the latest public GitHub release at launch and every six hours. When a newer stable version exists, a small notice offers **View update**. This opens the release page in your browser. Quit Lexicon, download the matching installer, and replace the app in Applications. **Lexicon → Check for Updates…** checks manually. The app never downloads or installs an update itself.

Draft and prerelease versions are ignored. Offline checks fail quietly; manual checks explain when they cannot connect. The release repository must be publicly readable; no GitHub credentials are embedded in the app.

## Data

The desktop library, conversations, undo history, and editable demonstration model live under `~/Library/Application Support/Lexicon/`. Replacing the app preserves this folder. Project models and canvases remain in their registered project directories.

The browser viewer's existing `viewer/lexicon-viewer.db` remains separate. To bring its registrations and conversations into a fresh desktop installation, quit both viewers and use SQLite's backup command to copy that database to `~/Library/Application Support/Lexicon/lexicon-viewer.db` before first launch. Do not overwrite an existing desktop library. Adding the same project folders through the app also works, but does not import conversation history.

The backend binds to an available loopback port. A private `lexicon://app` origin keeps viewing preferences stable across restarts. The desktop process attaches a per-launch secret to API requests. Closing the app stops its backend and owned agent processes after the window accepts closing. Unsaved canvas edits can cancel quitting while the server remains available. Copied `lexicon://app/` links reopen their view in the installed app.

The macOS window controls sit inside Lexicon’s header. Drag empty header space to move the window; links and buttons remain interactive. The web and PWA headers retain their existing behavior.

## Develop and package

Use macOS, Node 22.12+ (Node 24 recommended), and Bun 1.2.14. Install dependencies in both packages:

```sh
cd viewer
bun install --frozen-lockfile
cd desktop
bun install --frozen-lockfile
bun run dev
```

`bun run dev` opens the desktop shell against a local Vite server. React Fast Refresh and CSS updates appear in the open window; ordinary component edits keep current input. Changes to `main.cjs`, `preload.cjs`, `updates.cjs`, backend/shared TypeScript, or modeling instructions restart the shell and backend. The restart restores the open page and window bounds, and waits while the canvas reports unsaved edits. Resolve a save error or conflict before expecting an automatic restart. An active coding-agent turn ends when the backend restarts; saved conversations remain.

Development data lives in `viewer/desktop/.dev-data/`, separate from the installed app's library. Both local servers choose available ports, so other worktrees can keep running. `LEXICON_DESKTOP_DATA` overrides the development data directory. Ctrl-C stops Vite, Electron, and the backend. Closing the window leaves the watcher running; the next shell/backend edit opens it again.

Use `bun run dev --inspect` to enable Node and Chromium debugging on available local ports. Restart the development command after changing Vite configuration or dependencies. `bun start` still opens the built viewer; run `bun run build:client` from `viewer/` before using that mode.

Build installers for the current machine's architecture:

```sh
bun run package
```

Output is in `viewer/desktop/dist/`: a DMG, ZIP, and unpacked app. `bun run package:dir` builds only the unpacked app. Packaging copies the build machine's Bun executable and installs locked production dependencies, so each architecture must be built on a matching runner. Native Python, TypeScript, and TSX parsers are checked before packaging.

`LEXICON_BUN_BIN` overrides Bun for development. Packaged apps always use bundled Bun. `LEXICON_DESKTOP_DATA` chooses an isolated desktop data directory for testing. Existing `LEXICON_*_BIN` agent overrides are inherited; the launcher also resolves the login shell's PATH for Finder launches.

## Verify

Run the viewer's test, typecheck, build, and browser checks from `viewer/`. Set `LEXICON_BROWSER_PORT` if another worktree is using the default browser-test port.

From `viewer/desktop/`, `bun run test:dev` verifies React/CSS HMR, waiting for pending saves, backend and shell restarts, preserved navigation, and process cleanup. It temporarily edits source files and restores them afterward; run it when those files are idle.

Run `bun run test:lifecycle` for cancelled-quit and desktop-link checks. Run `bun run test` for release comparison tests and `bun run test:app` for the desktop smoke check. The smoke check uses a temporary project and data directory, simulates a newer release without publishing it, checks the outbound link and streamed chat through a deterministic agent fixture, and reopens the app to verify persistence. Set `LEXICON_DESKTOP_LIVE_CODEX=1` to use your authenticated Codex runtime for a read-only source question instead. Its screenshots are in `dist/qa/`.

To test the packaged Apple Silicon app:

```sh
LEXICON_DESKTOP_EXECUTABLE="$PWD/dist/mac-arm64/Lexicon.app/Contents/MacOS/Lexicon" bun run test:app
```

## Publish

Set the next stable version in `viewer/desktop/package.json` and commit the change. Push the matching `vX.Y.Z` tag when ready to create a release. `.github/workflows/desktop-release.yml` builds unsigned Apple Silicon and Intel installers, tests each packaged app, and creates a draft GitHub release with both sets of installers. Review the downloads and publish the draft to make the update notice available. A manual workflow run produces downloadable build artifacts without creating a release.

The update feed is `huylenq/lexicon`. A fork must change the repository constants in `updates.cjs` before distributing builds.
