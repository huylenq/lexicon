import { expect, test } from "bun:test";
import { resolve } from "node:path";
import { adapters, probeProviders, listModels } from "../server/chat/providers";
import { updateTool } from "../server/chat/activity";
import type { ChatMessage } from "../shared/chat";
import { providers } from "../shared/chat";
import { stopOwnedAgents } from "../server/chat/process";
const fixture = resolve(import.meta.dir, "fixtures/agent.ts");
async function withFixtures(run: () => Promise<void>) {
  const saved = providers.map(
    (p) => process.env[`LEXICON_${p.toUpperCase()}_BIN`],
  );
  providers.forEach((p) => {
    process.env[`LEXICON_${p.toUpperCase()}_BIN`] = fixture;
  });
  try {
    await run();
  } finally {
    providers.forEach((p, i) => {
      const key = `LEXICON_${p.toUpperCase()}_BIN`;
      if (saved[i] === undefined) delete process.env[key];
      else process.env[key] = saved[i];
    });
  }
}
test("three native adapters probe, stream once, and preserve owned session IDs", () =>
  withFixtures(async () => {
    expect((await probeProviders()).map((p) => p.authenticated)).toEqual([
      true,
      true,
      true,
    ]);
    for (const provider of providers) {
      let sessionId = "",
        streamed = "";
      const run = () =>
        adapters[provider].turn({
          cwd: import.meta.dir,
          prompt: "Explain orders",
          sessionId: sessionId || undefined,
          signal: new AbortController().signal,
          onSession: (id) => {
            sessionId = id;
          },
          onText: (text) => {
            streamed = text;
          },
          onActivity: () => {},
          ask: async () => ({}),
        });
      const answer = await run();
      expect(answer).toBe(
        "An order records a purchase. No model change is needed.",
      );
      expect(streamed).toBe(answer);
      expect(sessionId).toBe(`${provider}-owned`);
      expect(await run()).toBe(answer);
    }
  }));
test("Codex structured questions flow back through the native response", () =>
  withFixtures(async () => {
    const text = await adapters.codex.turn({
      cwd: import.meta.dir,
      prompt: "question",
      signal: new AbortController().signal,
      onSession: () => {},
      onText: () => {},
      onActivity: () => {},
      ask: async (questions) => {
        expect(questions[0].options).toEqual(["Orders", "Shipping"]);
        return { scope: "Orders" };
      },
    });
    expect(text).toBe("Selected Orders.");
  }));
test("runtime catalogs include pagination and native model and effort choices", () => withFixtures(async () => {
  const codex = await listModels("codex");
  expect(codex.models.map((m) => m.id)).toEqual(["test-fast", "test-deep"]);
  expect(codex.defaultModel).toBe("test-fast");
  expect(codex.models[0].efforts).toEqual(["low", "high"]);
  expect(codex.models[0].fastMode).toBeUndefined();
  expect(codex.models[1].fastMode?.description).toContain("increased usage");
  expect((await listModels("grok")).defaultModel).toBe("grok-test");
  expect((await listModels("claude")).models.map((m) => m.id)).toContain("opus");
}));
test("fast mode is capability-gated and standard speed clears the next resumed turn", () => withFixtures(async () => {
  for (const provider of ["codex", "claude"] as const) {
    let sessionId: string | undefined;
    for (const fast of [true, false]) {
      const answer = await adapters[provider].turn({
        cwd: import.meta.dir, prompt: "Report speed selection", model: provider === "codex" ? "test-deep" : "opus", fast, sessionId,
        signal: new AbortController().signal, onSession: (id) => { sessionId = id; },
        onText: () => {}, onActivity: () => {}, ask: async () => ({}),
      });
      expect(answer).toBe(`Speed ${fast ? "fast" : "standard"}.`);
    }
    await expect(adapters[provider].turn({
      cwd: import.meta.dir, prompt: "Unused", model: provider === "codex" ? "test-fast" : "sonnet", fast: true,
      signal: new AbortController().signal, onSession: () => {}, onText: () => {}, onActivity: () => {}, ask: async () => ({}),
    })).rejects.toThrow(/fast mode|Fast mode/);
  }
}));
test("Codex keeps separate streamed messages readable", () => withFixtures(async () => {
  const answer = await adapters.codex.turn({
    cwd: import.meta.dir, prompt: "Show segments", signal: new AbortController().signal,
    onSession: () => {}, onText: () => {}, onActivity: () => {}, ask: async () => ({}),
  });
  expect(answer).toBe("Reading the source.\n\nAn order records a purchase. No model change is needed.");
}));
test("model changes reach each runtime on new and resumed turns", () => withFixtures(async () => {
  for (const provider of providers) {
    let sessionId: string | undefined;
    for (const model of ["test-fast", "test-deep"]) {
      const answer = await adapters[provider].turn({
        cwd: import.meta.dir, prompt: "Report model selection", model, effort: "high", sessionId,
        signal: new AbortController().signal, onSession: (id) => { sessionId = id; },
        onText: () => {}, onActivity: () => {}, ask: async () => ({}),
      });
      expect(answer).toBe(`Model ${model}, effort high.`);
    }
  }
}));
test("native tool starts, deltas and results update one tool entry for every provider", () => withFixtures(async () => {
  for (const provider of providers) {
    const message = { tools: [] } as unknown as ChatMessage;
    const states: string[] = [];
    await adapters[provider].turn({
      cwd: import.meta.dir, prompt: "Show tools", signal: new AbortController().signal,
      onSession: () => {}, onText: () => {}, onActivity: () => {}, ask: async () => ({}),
      onTool: (tool) => { updateTool(message, tool); states.push(message.tools![0].status); },
    });
    expect(message.tools).toHaveLength(1);
    expect(states).toContain("running");
    expect(message.tools![0].status).toBe("complete");
    expect(message.tools![0].input).toContain("order.ts");
    expect(message.tools![0].output).toContain("export interface Order {}");
  }
}));
test("a cancelled local runtime rejects its pending turn", () =>
  withFixtures(async () => {
    const controller = new AbortController();
    const run = adapters.codex.turn({
      cwd: import.meta.dir,
      prompt: "slow",
      signal: controller.signal,
      onSession: () => controller.abort(),
      onText: () => {},
      onActivity: () => {},
      ask: async () => ({}),
    });
    await expect(run).rejects.toThrow();
  }));

test("server shutdown closes owned agent processes and settles their turns", () =>
  withFixtures(async () => {
    let started!: () => void;
    const session = new Promise<void>((resolve) => { started = resolve; });
    const turn = adapters.codex.turn({
      cwd: import.meta.dir, prompt: "slow", signal: new AbortController().signal,
      onSession: () => started(), onText: () => {}, onActivity: () => {}, ask: async () => ({}),
    });
    void turn.catch(() => {});
    await session;
    await stopOwnedAgents();
    await expect(turn).rejects.toThrow();
  }));
