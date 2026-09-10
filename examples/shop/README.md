# Shop: domain, software structure, and flows

This small executable order API explains how the same model supports domain meaning, C4 structure, and a sequence. Its source ships with the model, so code links work without another checkout.

Open **Shop · Domain, architecture, and flows** in the library. Read Order, follow its “creates” relationship to Order Handling, then inspect Checkout.place. Domain names and implementation symbols differ deliberately. Order and Order Line both belong to Ordering; their “contains” relationship expresses membership without changing their structural parent.

Follow Shop → Shop API → Order Handling to see C4 containment. Combined, Domain, and Architecture filter the shared canvas; Domain also supports Atlas. These are exploration filters rather than a full set of scoped C4 diagrams.

Open **Place an Order**. Its ordered interactions reuse customer-orders, handles-order, and saves-order. Select a participant for its responsibility or a message for its relationship and code. Flow conditions explain validation and response behavior; the source rejects invalid quantities before storage. A separate failure scenario can reuse the same elements without adding branch syntax.

The library example is read-only. For an editable isolated copy, run from viewer/:

```sh
bun run dev:model
```

The workshop opens at http://127.0.0.1:5397 with its API on 5398. Its existing data directory, viewer/.model-prototype/, is retained to preserve earlier models, canvas notes, assets, and conversations. An older copy opens the normal migration screen. The workshop never rewrites its model on startup. Port overrides: LEXICON_MODEL_PORT and LEXICON_VIEWER_API_PORT.

Check this example from viewer/ with `bun run check ../examples/shop`. Unit tests exercise accepted and rejected requests; browser tests exercise containment, filters, sequence navigation, search, code, small screens, agent refinement, and undo.

The optional live trial `LEXICON_TRIAL_MODEL=<available-model> bun scripts/model-agent.ts --flow` adds a flow in a temporary copy using the local Codex login, validates preservation of existing objects and source, undoes the change, and removes its own registration. Without --flow it checks a component rename.
