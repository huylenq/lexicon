# code-lens — progress

Snapshot of current state for a cold session. Overwrite in place; not a log.

**Spec:** `code-lens-design.md` (Shape A, status `proposed`). A third graph lens rendering domain-significant code symbols (structure tier via tree-sitter, call-flow tier via a per-root LSP supervisor). **Fully built: P0 + P1 + P2 + hardening + lazy-on-demand + same-name disambiguation — every spec item realized.** Both tiers are multi-language (TS + Python), health-gated, lazy where appropriate, LSP-disambiguated, and validated on the viewer, the honeywell workspace, and two committable integration fixtures through the real loader. The only thing left is *promotion* (Shape A → as-built Shape B + `crystallize`), deferred per the user until the feature is exercised in the UI.

## Done

### P0 — lens scaffold + re-grounded cold layer
- **Re-grounded `viewer/lexicon/`** (purged in `7d17f04`; recovered v1.0 XML from `7d17f04^`). Loads with 0 errors.
- **`code` lens wired** into `client/src/lib/graph/build-graph.ts::buildCode` — one node per code-anchored entity (`symbols`/`constrainsCode`), grouped under owning bounded-context. `LENSES`+=`code`; lens selector, `lensOpts` (layered/DOWN), edge styles, LENSES-driven manual-layout store all updated.

### P1 — tree-sitter structure backend
- **`viewer/server/code-intel.ts`** — `extractStructureEdges(projectRoot, anchors)`. Parses each anchored atom's anchor file with tree-sitter, extracts `extends`/`implements`/`uses`, and emits edges **only between anchored atoms** (domain-selective by construction). Fail-soft: missing native dep / unreadable file / oversized-file throw → fewer edges, never breaks the load. TS only (`.ts`/`.tsx`); Python is P2-adjacent.
- **Wired into the loader** (`server/loader.ts`, after `resolve()`): gathers anchors → `graph.codeEdges`. `CodeEdge` type added to `server/schema.ts` + `client/src/lib/types.ts` (`ResolvedGraph.codeEdges?`).
- **`buildCode` renders them** — `graph.codeEdges` whose endpoints are both in the lens, honoring `edgeFilter`. `GraphEdge.tsx` styles + `GraphPage` `DEFAULT_EDGES` include the 3 kinds.
- **Proof:** `bun run typecheck` clean; `bun test edges.test.ts` → **21 pass / 0 fail** (added a code-lens integration test). On the viewer's own cold layer: **5 `uses` edges** derived (`ResolvedGraph → ResolvedEntity → EntityRef`, `ResolvedEntity → CodeAnchor`, …), laid out with **0 dangling**.

### P2 core — call-flow tier (single TS root)
- **`server/lsp/tsserver-client.ts`** — warm-singleton tsserver client (the supervisor for one TS root): `open` (waits on `projectLoadingFinish` event), `incomingCalls`/`outgoingCalls`, `unresolvedImportCount` (the D7 health signal — TS2307 count), `shutdown` (killed on process exit). Zero new server deps (tsserver ships with `typescript`). Drives under **bun**.
- **`server/call-flow.ts`** — `extractCallEdges`: tree-sitter locates each function/method-anchored atom's name position; tsserver resolves callers/callees; emits `calls` edges only between anchored atoms (same domain-selective rule). Async, fail-soft.
- **Wired into the loader** alongside structure edges (`graph.codeEdges = [...structure, ...calls]`), both fail-soft. `calls` plumbed through `CodeEdge` (server+client), `EdgeKind`, `GraphEdge` style, `DEFAULT_EDGES`.
- **Proof:** synthetic anchors for a known pair → `loadLexicon --calls--> walkXml`, `--calls--> resolve`. On the viewer's *real* cold layer the integrated loader yields **6 codeEdges (5 `uses` + 1 `calls`)** in ~1.7s cold. 21/21 tests pass.
- **Three bugs found & fixed via the proof** (all were silently returning empty): (1) tree-sitter node binding throws on files >32KB — fixed with the callback-form parse `parse(i => src.slice(i, i+8192))` in *both* tiers (this was also silently hurting P1 on `loader.ts`); (2) tsserver project-load **race** — a fixed warm delay isn't enough on large projects, now waits on the `projectLoadingFinish` event (8s cap); (3) tsserver needs **absolute** file paths — relative paths load no project and every query returns empty.

### P2 full — multi-root supervisor + Python provider + health-gate
- **`server/lsp/roots.ts`** — `discoverRoots`: exclusion-aware config-file discovery + per-Python-root interpreter (nearest `.venv` walking up). Validated: honeywell **13 roots** (2 TS, 11 Python, all with the right interpreter — `hfc_core` → `bms/backend/.venv`); viewer 1. Plus `lexicon/lsp.toml` declared-roots override and `rootForFile` longest-prefix routing. (`lsp.toml` parsed, not yet exercised by a real project.)
- **`server/lsp/provider.ts`** — `CallFlowProvider` interface (0-based positions, `CallSite`). `tsserver-client.ts` refactored to implement it; **`pyright-client.ts`** is the Python impl (full LSP/JSON-RPC, feeds the interpreter via `workspace/configuration`).
- **`server/lsp/supervisor.ts`** — routes each file to a provider per `(language, root)`: one shared tsserver for all TS roots, one pyright per Python root. Warm process-wide singleton, killed on exit. Owns the **health-gate**.
- **`call-flow.ts`** rewritten multi-language: per-file tree-sitter grammar (TS / Python) → supervisor provider → health-gate → call hierarchy → anchored-pair edges.
- **Validated end-to-end:** pyright gate on honeywell (`reportMissingImports` "all" → **0** with the venv); **5 real Python `calls` edges** on `schedule_resolver.py` (~3.1s); health-gate discriminates (`comfort_agent.py`: correct venv 0 → HEALTHY, system python 4 → DEGRADED); TS regression intact (viewer 6 codeEdges, 21/21 tests).

### P2 hardening (done)
- **Shared `server/grammars.ts`** — one lazy parser per language + callback-form `parseRoot` (the 32KB fix), used by both tiers (removed the duplicate parser code from `code-intel.ts` and `call-flow.ts`).
- **Python structure tier** — `code-intel.ts` is now multi-language (TS interfaces/classes + Python classes/inheritance). Validated on honeywell: `CachedBMSResource --extends--> HoneywellForgeIoTControlAndDataResource` (other anchored classes extend non-anchored bases — correctly filtered).
- **Committable multi-stack integration test** — `server/code-intel.test.ts` + `test-fixtures/multistack/` (TS + Python, both tiers) runs the *whole* pipeline through `loadLexicon`: asserts `Circle extends Shape` (TS structure), `computeArea calls scale` (TS call-flow), `total calls add_all` (Python call-flow). The fixture caught a real **same-directory multi-language routing bug** (one dir as both a TS and Python root collided in `byRoot`; now keyed by `grammar:dir`).
- **Health-probe aggregation** — `isRootHealthy(files[])` now sums unresolved imports across up to 5 of a root's files and degrades on the *average* crossing the threshold (ratio, robust to root size). Still discriminates on honeywell (correct venv avg 0 → HEALTHY; system python avg 4 → DEGRADED). `call-flow.ts` regrouped by root to feed the aggregate (also fixed a variable-shadow bug).
### P2 final — lazy-on-demand + same-name disambiguation
- **Lazy-on-demand** — the loader now computes only the **structure tier** eagerly (tree-sitter, in-process, fast; renders the code lens instantly). The call-flow tier *and* LSP-disambiguated structure edges are computed lazily by `GET /api/projects/:id/code-edges` (`getCodeEdges`, cached per root, invalidated by `invalidateCache`). The client (`GraphPage`) fetches this only when the code lens opens and **replaces** the eager edges with the authoritative set. No tsserver/pyright spawns on a normal load.
- **Same-name disambiguation** (spec D3 ceiling, closed):
  - *Call-flow*: `resolveAtom` is ambiguity-aware — the call hierarchy gives the resolved definition file, so it requires an exact (name, file) match when a name maps to ≥2 atoms, name-match only when unambiguous. No cross-module false edges.
  - *Structure tier*: a new `goToDefinition` on the provider interface (tsserver `definition`, pyright `textDocument/definition`) backs `extractStructureEdgesResolved` (async). Eager `extractStructureEdges` fans out on ambiguity (fast, no LSP); the resolved pass disambiguates *only* ambiguous references via `goToDefinition`, degrading to fan-out when no provider resolves. Validated by `test-fixtures/ambiguous/` (two `Widget` types in different modules + a consumer): eager → 2 `uses` edges, resolved → exactly 1, the imported `a/Widget`.
- Fixed a test-isolation bug: `Supervisor.shutdown()` only kills providers it owns (per-root pyright), never the process-wide shared tsserver.
- Full suite: **23 pass / 0 fail** (21 graph + 2 integration). Honeywell Python call-flow unregressed (5 edges).

## Next (only promotion remains)
- **Promote the spec** (Shape A → as-built Shape B) and **`crystallize`** the new vocabulary (code lens, structure/call-flow tier, supervisor, provider, health-gate, disambiguation) into the viewer's cold layer — deferred per the user until the lens is exercised in the running UI.
- **`lexicon/lsp.toml`** is parsed/supported but not yet exercised by a real declared-override project (auto-detect covers everything tried so far).

## Decisions made mid-build (not yet in the spec)
- **Structure tier is type-declaration-centric** (interfaces/type-aliases/classes/enums), edges `extends`/`implements`/`uses` — confirmed needed because the viewer has zero classes (already in spec D3 revision note).
- **Symbol collisions fan out.** When two cold-layer atoms anchor the *same* `symbol=` (e.g. the `fqid` kernel term and the `EntityRef` term both anchor `EntityRef`), a reference fans out to both → two edges. Correct behavior; it surfaces a cold-layer modeling smell (one code symbol, two atoms) that `validate` should reconcile. Worth a spec note + possibly a validate check.

## Gotchas
- **Pin `tree-sitter@0.21.1`** in the viewer. `bun add tree-sitter` pulls `0.25.0`, whose prebuild (`./prebuilds/darwin-arm64/tree-sitter.node`) is missing → "Cannot find module". `0.21.1` builds from source via `node-gyp-build` and loads under **bun** (verified). After install, `bun pm trust tree-sitter-javascript` (and `--all`) to run the native build.
- **`loadLexicon(root)` appends `/lexicon`** — pass the project dir (`"."`), not `"./lexicon"`.
- **zsh does not word-split unquoted `$VAR`** — pass file lists to node/bun via `xargs`, never `node script $FILES`.
- **Anchor rot, partially unfixed** (for `/lexicon:validate`): `surfaces/graph-view.xml` `GraphDetailRail.tsx` (gone, no clear replacement), the `marginalia` *region* in `reading-room.xml`, and content drift — `contexts/graph-model.xml::layout-deterministic` now contradicts the shipped manual-layout feature; `graph-edge` term's `EdgeKind` definition/anchor lines are stale.
