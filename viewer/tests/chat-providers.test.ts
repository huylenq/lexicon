import { expect, test } from "bun:test";
import { resolve } from "node:path";
import { adapters, probeProviders, listModels } from "../server/chat/providers";
import { updateTool } from "../server/chat/activity";
import type { ChatMessage } from "../shared/chat";
import { providers } from "../shared/chat";
import { stopOwnedAgents } from "../server/chat/process";
const fixture = resolve(import.meta.dir, "fixtures/agent.ts");
const acpOwnerArg: Partial<Record<(typeof providers)[number], string[]>> = {
  pi: ["acp", "--acp-owner", "pi-owned"],
  omp: ["acp", "--acp-owner", "omp-owned"],
  hermes: ["acp", "--acp-owner", "hermes-owned"],
};
async function withFixtures(run: () => Promise<void>) {
  const saved = providers.map(
    (p) => process.env[`LEXICON_${p.toUpperCase()}_BIN`],
  );
  providers.forEach((p) => {
    const extra = acpOwnerArg[p] || [];
    process.env[`LEXICON_${p.toUpperCase()}_BIN`] = [fixture, ...extra].join(" ");
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
test("every native adapter probes, streams once, and preserves owned session IDs", () =>
  withFixtures(async () => {
    expect((await probeProviders()).map((p) => p.authenticated)).toEqual(
      providers.map(() => true),
    );
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
test("a runtime without loadSession degrades with a clear resume message", () =>
  withFixtures(async () => {
    const saved = process.env.LEXICON_OMP_BIN;
    process.env.LEXICON_OMP_BIN = `${fixture} acp --acp-owner omp-owned --no-load-session`;
    try {
      await expect(
        adapters.omp.turn({
          cwd: import.meta.dir,
          prompt: "Explain orders",
          sessionId: "omp-owned",
          signal: new AbortController().signal,
          onSession: () => {},
          onText: () => {},
          onActivity: () => {},
          ask: async () => ({}),
        }),
      ).rejects.toThrow(
        "This Oh My Pi version cannot resume its saved conversation. Start a new conversation.",
      );
    } finally {
      process.env.LEXICON_OMP_BIN = saved;
    }
  }));
test("generic ACP adapters share one streaming path and refuse write permissions", () =>
  withFixtures(async () => {
    for (const provider of ["pi", "omp", "hermes"] as const) {
      let sessionId = "",
        streamed = "";
      const answer = await adapters[provider].turn({
        cwd: import.meta.dir,
        prompt: "Explain orders",
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
      expect(answer).toBe(
        "An order records a purchase. No model change is needed.",
      );
      expect(streamed).toBe(answer);
      expect(sessionId).toBe(`${provider}-owned`);
      const resumed = await adapters[provider].turn({
        cwd: import.meta.dir,
        prompt: "Explain orders",
        sessionId,
        signal: new AbortController().signal,
        onSession: () => {},
        onText: () => {},
        onActivity: () => {},
        ask: async () => ({}),
      });
      expect(resumed).toBe(answer);
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
test("model changes reach each runtime on new and resumed turns", () =>
  withFixtures(async () => {
    for (const provider of ["codex", "grok", "claude", "pi"] as const) {
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
    // omp and hermes advertise no separate effort surface; the model still
    // reaches them on new and resumed turns.
    for (const provider of ["omp", "hermes"] as const) {
      let sessionId: string | undefined;
      for (const model of ["test-fast", "test-deep"]) {
        const answer = await adapters[provider].turn({
          cwd: import.meta.dir, prompt: "Report model selection", model, sessionId,
          signal: new AbortController().signal, onSession: (id) => { sessionId = id; },
          onText: () => {}, onActivity: () => {}, ask: async () => ({}),
        });
        expect(answer).toBe(`Model ${model}, effort default.`);
      }
    }
  }));
test("generic ACP adapters set models and effort through their advertised surface", () =>
  withFixtures(async () => {
    for (const provider of ["pi", "omp", "hermes"] as const) {
      let sessionId: string | undefined;
      const answer = await adapters[provider].turn({
        cwd: import.meta.dir, prompt: "Report model selection", model: "acp-test", effort: "high", sessionId,
        signal: new AbortController().signal, onSession: (id) => { sessionId = id; },
        onText: () => {}, onActivity: () => {}, ask: async () => ({}),
      });
      // pi exposes a thought-level config option; omp and hermes have no
      // separate effort surface, so the requested effort is not forwarded.
      expect(answer).toBe(
        `Model acp-test, effort ${provider === "pi" ? "high" : "default"}.`,
      );
      const resumed = await adapters[provider].turn({
        cwd: import.meta.dir, prompt: "Report model selection", model: "acp-test", effort: "high", sessionId,
        signal: new AbortController().signal, onSession: () => {},
        onText: () => {}, onActivity: () => {}, ask: async () => ({}),
      });
      expect(resumed).toBe(
        `Model acp-test, effort ${provider === "pi" ? "high" : "default"}.`,
      );
    }
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
