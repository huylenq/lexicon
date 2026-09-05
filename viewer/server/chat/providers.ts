import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { homedir } from "node:os";
import { readFile, realpath } from "node:fs/promises";
import { resolve, relative, isAbsolute } from "node:path";
import {
  providers,
  type Provider,
  type ProviderStatus,
  type ChatQuestion,
  type ModelCatalog,
  type ToolUpdate,
} from "../../shared/chat";
import { AgentProcess, Rpc, type Wire } from "./process";
import { toolText } from "./activity";

const exec = promisify(execFile);
const executable = (provider: Provider) =>
  process.env[`LEXICON_${provider.toUpperCase()}_BIN`] || provider;
export interface TurnInput {
  cwd: string;
  prompt: string;
  sessionId?: string;
  model?: string;
  effort?: string;
  fast?: boolean;
  onTool?: (tool: ToolUpdate) => void;
  signal: AbortSignal;
  onSession: (id: string) => void;
  onText: (text: string) => void;
  onActivity: (text: string) => void;
  ask: (questions: ChatQuestion[]) => Promise<Record<string, string>>;
}
export interface ProviderAdapter {
  probe(): Promise<ProviderStatus>;
  turn(input: TurnInput): Promise<string>;
}
async function codexConnection(cwd: string) {
  const rpc = new Rpc(executable("codex"), ["app-server"], cwd);
  try {
    await rpc.request("initialize", {
      clientInfo: { name: "lexicon", title: "Lexicon", version: "2.0.0" },
    });
    rpc.notify("initialized");
    return rpc;
  } catch (error) {
    rpc.stop();
    throw error;
  }
}
function bindAbort(input: TurnInput, stop: () => void) {
  if (input.signal.aborted) {
    stop();
    throw new Error("Interrupted.");
  }
  input.signal.addEventListener("abort", stop, { once: true });
  return () => input.signal.removeEventListener("abort", stop);
}
function codexTool(item: Wire, completed: boolean, cwd: string): ToolUpdate | undefined {
  if (!["commandExecution", "mcpToolCall", "dynamicToolCall", "webSearch", "fileChange"].includes(item.type)) return;
  const failed = ["failed", "declined"].includes(item.status) || item.success === false;
  const action = item.commandActions?.[0];
  const path = action?.path;
  const displayPath = typeof path === "string" && isAbsolute(path) ? relative(cwd, path) : path;
  return {
    id: item.id,
    kind: item.type,
    title: action?.type === "read" ? `Read ${displayPath || action.name}`
      : action?.type === "search" ? `Search ${action.query || action.path || "source"}`
      : item.command || item.tool || (item.type === "webSearch" ? "Web search" : "Tool call"),
    status: completed ? (failed ? "error" : "complete") : "running",
    input: toolText(item.command || item.arguments || item.action || item.changes),
    output: toolText(item.aggregatedOutput ?? item.result ?? item.contentItems ?? item.error),
  };
}
const codex: ProviderAdapter = {
  async probe() {
    const rpc = await codexConnection(homedir());
    try {
      const status = await rpc.request("account/read", { refreshToken: false });
      const authenticated =
        !!status.account || status.requiresOpenaiAuth === false;
      return {
        id: "codex",
        installed: true,
        authenticated,
        detail: authenticated
          ? "Local login ready"
          : "Run codex login in your terminal",
      };
    } finally {
      await rpc.close();
    }
  },
  async turn(input) {
    const rpc = await codexConnection(input.cwd);
    let threadId = "",
      turnId = "",
      output = "",
      textItemId = "";
    const detach = bindAbort(input, () => {
      if (threadId && turnId)
        void rpc
          .request("turn/interrupt", { threadId, turnId }, 1000)
          .catch(() => {});
      rpc.stop();
    });
    try {
      const account = await rpc.request("account/read", {
        refreshToken: false,
      });
      if (!account.account && account.requiresOpenaiAuth !== false)
        throw new Error(
          "Codex is not authenticated. Run codex login in your terminal.",
        );
      const settings = await rpc.request("config/read", {
        includeLayers: false,
      });
      const config: Wire = {
        "features.apps": false,
        "features.multi_agent": false,
        "features.hooks": false,
        "features.code_mode": false,
      };
      for (const name of Object.keys(settings.config?.mcp_servers || {}))
        config[`mcp_servers.${name}.enabled`] = false;
      const parameters = {
        cwd: input.cwd,
        sandbox: "read-only",
        approvalPolicy: "never",
        config,
        ...(input.model ? { model: input.model } : {}),
      };
      let fastTier: string | undefined;
      if (input.fast) {
        let cursor: string | undefined;
        do {
          const page = await rpc.request("model/list", cursor ? { cursor } : {});
          const model = page.data?.find((m: Wire) => m.model === input.model);
          if (model) { fastTier = codexFastTier(model)?.id; break; }
          cursor = page.nextCursor || undefined;
        } while (cursor);
        if (!fastTier) throw new Error("Fast mode is not available for this Codex model.");
      }
      const thread = await rpc.request(
        input.sessionId ? "thread/resume" : "thread/start",
        {
          ...parameters,
          ...(input.sessionId ? { threadId: input.sessionId } : {}),
        },
      );
      threadId = thread.thread.id;
      input.onSession(threadId);
      rpc.onRequest = async (method, params) => {
        if (
          method === "item/tool/requestUserInput" ||
          method === "tool/requestUserInput"
        ) {
          const questions = (params.questions || []).map((q: Wire) => ({
            id: q.id,
            text: q.question,
            options: (q.options || []).map((o: Wire) => o.label),
          }));
          const answers = await input.ask(questions);
          return {
            answers: Object.fromEntries(
              Object.entries(answers).map(([id, text]) => [
                id,
                { answers: [text] },
              ]),
            ),
          };
        }
        if (method === "item/permissions/requestApproval")
          return { permissions: {}, scope: "turn" };
        if (method.includes("requestApproval")) return { decision: "decline" };
        throw new Error(
          "This Lexicon session supports source reading and conversation only.",
        );
      };
      const complete = new Promise<void>((resolveTurn, rejectTurn) => {
        rpc.onNotification = (method, params) => {
          if (params.threadId && params.threadId !== threadId) return;
          if ((method === "item/started" || method === "item/completed") && params.item) {
            const tool = codexTool(params.item, method === "item/completed", input.cwd);
            if (tool) input.onTool?.(tool);
          }
          if (method === "item/commandExecution/outputDelta")
            input.onTool?.({ id: params.itemId, outputDelta: params.delta });
          if (method === "item/agentMessage/delta") {
            if (params.itemId && textItemId && params.itemId !== textItemId && output)
              output += "\n\n";
            textItemId = params.itemId || textItemId;
            output += params.delta || "";
            input.onText(output);
          }
          if (method === "item/started")
            input.onActivity(
              params.item?.type === "commandExecution"
                ? "Reading the project…"
                : "Thinking…",
            );
          if (method === "turn/completed") {
            if (params.turn?.status === "failed")
              rejectTurn(
                new Error(params.turn.error?.message || "Codex turn failed."),
              );
            else if (params.turn?.status === "interrupted")
              rejectTurn(new Error("Interrupted."));
            else resolveTurn();
          }
        };
        void rpc.process.done.then(
          (code) => rejectTurn(rpc.process.error(code)),
          rejectTurn,
        );
      });
      void complete.catch(() => {});
      const started = await rpc.request("turn/start", {
        threadId,
        ...(input.fast !== undefined ? { serviceTierForTurn: input.fast ? fastTier : "default" } : {}),
        ...(input.model ? { model: input.model } : {}),
        ...(input.effort ? { effort: input.effort } : {}),
        input: [{ type: "text", text: input.prompt, text_elements: [] }],
        sandboxPolicy: { type: "readOnly", networkAccess: false },
        approvalPolicy: "never",
      });
      turnId = started.turn.id;
      await complete;
      return output;
    } finally {
      detach();
      await rpc.close();
    }
  },
};
const claude: ProviderAdapter = {
  async probe() {
    const { stdout } = await exec(
      executable("claude"),
      ["auth", "status", "--json"],
      { timeout: 15_000 },
    ).catch((error) => {
      if (error.stdout?.trim().startsWith("{"))
        return { stdout: error.stdout as string };
      throw error;
    });
    const status = JSON.parse(stdout);
    return {
      id: "claude",
      installed: true,
      authenticated: status.loggedIn === true,
      detail: status.loggedIn
        ? "Local login ready"
        : "Run claude auth login in your terminal",
    };
  },
  async turn(input) {
    if (input.fast && input.model !== "opus")
      throw new Error("Claude fast mode requires the supported Opus model.");
    const args = [
      "--print",
      "--output-format",
      "stream-json",
      "--verbose",
      "--include-partial-messages",
      "--permission-mode",
      "dontAsk",
      "--tools",
      "Read,Glob,Grep",
      "--allowedTools",
      "Read,Glob,Grep",
      "--strict-mcp-config",
      "--mcp-config",
      '{"mcpServers":{}}',
      "--settings",
      JSON.stringify({ disableAllHooks: true, ...(input.fast !== undefined ? { fastMode: input.fast } : {}) }),
      "--disable-slash-commands",
    ];
    if (input.sessionId) args.push("--resume", input.sessionId);
    if (input.model) args.push("--model", input.model);
    if (input.effort) args.push("--effort", input.effort);
    const process = new AgentProcess(executable("claude"), args, input.cwd);
    const detach = bindAbort(input, () => process.stop());
    let output = "",
      streamed = false,
      failure = "",
      receivedResult = false;
    const toolBlocks = new Map<number, { id: string; json: string }>();
    process.onMessage = (message) => {
      if (message.session_id) input.onSession(message.session_id);
      if (message.type === "stream_event" && message.event?.type === "message_start" && output && !output.endsWith("\n\n"))
        output += "\n\n";
      if (
        message.type === "stream_event" &&
        message.event?.type === "content_block_delta" &&
        message.event.delta?.type === "text_delta"
      ) {
        streamed = true;
        output += message.event.delta.text;
        input.onText(output);
      }
      if (message.type === "assistant" && !streamed) {
        output += (message.message?.content || [])
          .filter((c: Wire) => c.type === "text")
          .map((c: Wire) => c.text)
          .join("\n");
        input.onText(output);
      }
      if (
        message.type === "stream_event" &&
        message.event?.content_block?.type === "tool_use"
      ) {
        const block = message.event.content_block;
        toolBlocks.set(message.event.index, { id: block.id, json: "" });
        input.onTool?.({ id: block.id, title: block.name, kind: block.name, status: "running" });
        input.onActivity("Reading the project…");
      }
      if (message.type === "stream_event" && message.event?.delta?.type === "input_json_delta") {
        const block = toolBlocks.get(message.event.index);
        if (block) {
          block.json = (block.json + message.event.delta.partial_json).slice(0, 12_000);
          input.onTool?.({ id: block.id, input: block.json });
        }
      }
      if (message.type === "assistant")
        for (const block of message.message?.content || [])
          if (block.type === "tool_use")
            input.onTool?.({ id: block.id, title: block.name, kind: block.name, input: toolText(block.input), status: "running" });
      if (message.type === "user")
        for (const block of message.message?.content || [])
          if (block.type === "tool_result")
            input.onTool?.({ id: block.tool_use_id, output: toolText(block.content), status: block.is_error ? "error" : "complete" });
      if (message.type === "result") {
        receivedResult = true;
        if (message.is_error)
          failure = (
            message.errors || [message.result || "Claude turn failed."]
          ).join("\n");
        if (!output && message.result) {
          output = message.result;
          input.onText(output);
        }
      }
    };
    process.child.stdin.end(input.prompt);
    try {
      const code = await process.done;
      if (input.signal.aborted) throw new Error("Interrupted.");
      if (code !== 0 || !receivedResult) throw process.error(code);
      if (failure) throw new Error(failure);
      return output;
    } finally {
      detach();
      process.stop();
    }
  },
};
async function grokConnection(cwd: string) {
  const rpc = new Rpc(
    executable("grok"),
    [
      "--tools",
      "Read,Glob,Grep",
      "--no-subagents",
      "--disable-web-search",
      "--permission-mode",
      "default",
      "agent",
      "--no-leader",
      "stdio",
    ],
    cwd,
    true,
  );
  try {
    const initialized = await rpc.request("initialize", {
      protocolVersion: 1,
      clientInfo: { name: "lexicon", version: "2.0.0" },
      clientCapabilities: {
        fs: { readTextFile: true, writeTextFile: false },
        terminal: false,
      },
    });
    await rpc.request("authenticate", {
      methodId: process.env.XAI_API_KEY?.trim()
        ? "xai.api_key"
        : "cached_token",
    });
    return { rpc, initialized };
  } catch (error) {
    rpc.stop();
    throw error;
  }
}
const grok: ProviderAdapter = {
  async probe() {
    const { rpc } = await grokConnection(homedir());
    await rpc.close();
    return {
      id: "grok",
      installed: true,
      authenticated: true,
      detail: "Local login ready",
    };
  },
  async turn(input) {
    const { rpc, initialized } = await grokConnection(input.cwd);
    let sessionId = "",
      output = "",
      replaying = true;
    const detach = bindAbort(input, () => {
      if (sessionId) rpc.notify("session/cancel", { sessionId });
      rpc.stop();
    });
    try {
      rpc.onRequest = async (method, params) => {
        if (method === "fs/read_text_file") {
          const root = await realpath(input.cwd),
            path = await realpath(resolve(root, params.path));
          const rel = relative(root, path);
          if (isAbsolute(rel) || rel.startsWith(".."))
            throw new Error("Read must stay in the project.");
          const text = await readFile(path, "utf8");
          if (text.length > 2_000_000)
            throw new Error("File exceeds the reading limit.");
          return {
            content: text
              .split("\n")
              .slice(
                Math.max(0, (params.line || 1) - 1),
                params.limit
                  ? (params.line || 1) - 1 + params.limit
                  : undefined,
              )
              .join("\n"),
          };
        }
        if (method === "session/request_permission") {
          const kind = params.toolCall?.kind;
          const option = ["read", "search"].includes(kind)
            ? params.options?.find((o: Wire) => o.kind === "allow_once")
            : null;
          return {
            outcome: option
              ? { outcome: "selected", optionId: option.optionId }
              : { outcome: "cancelled" },
          };
        }
        throw new Error(
          "Lexicon agent sessions cannot write files or run terminals.",
        );
      };
      rpc.onNotification = (method, params) => {
        if (replaying || method !== "session/update") return;
        const update = params.update;
        if (
          update?.sessionUpdate === "agent_message_chunk" &&
          update.content?.type === "text"
        ) {
          output += update.content.text;
          input.onText(output);
        }
        if (update?.sessionUpdate === "tool_call")
          input.onActivity(update.title || "Reading the project…");
        if (["tool_call", "tool_call_update"].includes(update?.sessionUpdate))
          input.onTool?.({
            id: update.toolCallId,
            ...(update.title !== undefined ? { title: update.title } : {}),
            ...(update.kind !== undefined ? { kind: update.kind } : {}),
            ...(update.status !== undefined ? { status: update.status === "completed" ? "complete" : update.status === "failed" ? "error" : "running" } : {}),
            input: toolText(update.rawInput),
            output: toolText(update.rawOutput ?? update.content?.map((c: Wire) => c.content?.text || c.text || c)),
          });
      };
      if (input.sessionId && !initialized.agentCapabilities?.loadSession)
        throw new Error(
          "This Grok version cannot resume its saved conversation. Start a new conversation.",
        );
      const session = await rpc.request(
        input.sessionId ? "session/load" : "session/new",
        {
          cwd: input.cwd,
          mcpServers: [],
          ...(input.sessionId ? { sessionId: input.sessionId } : {}),
        },
      );
      sessionId = input.sessionId || session.sessionId;
      input.onSession(sessionId);
      if (input.model)
        await rpc.request("session/set_model", {
          sessionId, modelId: input.model,
          ...(input.effort ? { _meta: { reasoningEffort: input.effort } } : {}),
        });
      replaying = false;
      const response = await rpc.request(
        "session/prompt",
        { sessionId, prompt: [{ type: "text", text: input.prompt }] },
        15 * 60_000,
      );
      if (response.stopReason === "cancelled") throw new Error("Interrupted.");
      if (!output)
        throw new Error(
          `Grok returned no answer (${response.stopReason || "unknown stop reason"}).`,
        );
      return output;
    } finally {
      detach();
      await rpc.close();
    }
  },
};
export const adapters: Record<Provider, ProviderAdapter> = {
  codex,
  grok,
  claude,
};
function codexFastTier(model: Wire): { id: string; description: string } | undefined {
  const tier = model.serviceTiers?.find((t: Wire) => t.id === "priority" || t.id === "fast");
  if (tier) return { id: tier.id, description: tier.description || "Faster responses; increased usage" };
  if (model.additionalSpeedTiers?.includes("fast")) return { id: "fast", description: "Faster responses; increased usage" };
}
export async function listModels(provider: Provider): Promise<ModelCatalog> {
  if (provider === "claude")
    return {
      defaultModel: "default",
      models: [
        { id: "default", name: "Default (account)" },
        { id: "sonnet", name: "Sonnet" },
        { id: "opus", name: "Opus", fastMode: { description: "Faster Opus responses; billed as extra usage. Requires fast-mode access." } },
        { id: "haiku", name: "Haiku" },
      ],
    };
  if (provider === "grok") {
    const { rpc } = await grokConnection(homedir());
    try {
      const session = await rpc.request("session/new", { cwd: homedir(), mcpServers: [] });
      return {
        defaultModel: session.models?.currentModelId,
        models: (session.models?.availableModels || []).map((m: Wire) => ({
          id: m.modelId, name: m.name || m.modelId, description: m.description,
          efforts: m._meta?.reasoningEfforts?.map((e: Wire) => e.value || e.id),
          defaultEffort: m._meta?.reasoningEffort,
        })),
      };
    } finally { await rpc.close(); }
  }
  const rpc = await codexConnection(homedir());
  try {
    const models: ModelCatalog["models"] = [];
    let cursor: string | undefined, catalogDefault: string | undefined;
    do {
      const page = await rpc.request("model/list", cursor ? { cursor } : {});
      for (const m of page.data || []) {
        if (m.hidden) continue;
        models.push({ id: m.model, name: m.displayName || m.model, description: m.description,
          efforts: m.supportedReasoningEfforts?.map((e: Wire) => e.reasoningEffort),
          defaultEffort: m.defaultReasoningEffort,
          ...(codexFastTier(m) ? { fastMode: { description: codexFastTier(m)!.description } } : {}),
        });
        if (m.isDefault) catalogDefault = m.model;
      }
      cursor = page.nextCursor || undefined;
    } while (cursor);
    const settings = await rpc.request("config/read", { includeLayers: false });
    return { models, defaultModel: settings.config?.model || catalogDefault };
  } finally { await rpc.close(); }
}
export async function probeProviders(): Promise<ProviderStatus[]> {
  return Promise.all(
    providers.map(async (id) => {
      try {
        await exec(executable(id), ["--version"], { timeout: 5000 });
      } catch {
        return {
          id,
          installed: false,
          authenticated: null,
          detail: `Install ${id} and sign in locally`,
        };
      }
      try {
        return await adapters[id].probe();
      } catch (error) {
        return {
          id,
          installed: true,
          authenticated: null,
          detail: (error as Error).message,
        };
      }
    }),
  );
}
