import { homedir } from "node:os";
import { readFile, realpath } from "node:fs/promises";
import { resolve, relative, isAbsolute } from "node:path";
import type { ProviderStatus, ToolUpdate } from "../../shared/chat";
import { Rpc, type Wire } from "./process";
import { toolText } from "./activity";
import type { ProviderAdapter, TurnInput } from "./providers";

// Generic Agent Client Protocol adapter. Agents speak JSON-RPC over stdio:
// initialize → authenticate → session/new|load → session/prompt, streaming
// session/update notifications back. Server-side handlers keep the embedded
// chat read-only: fs/read_text_file stays jailed to the project directory and
// every permission request outside read/search is refused.
export interface AcpAgentConfig {
  id: "pi" | "omp" | "hermes";
  label: string;
  executable: string;
  args: string[];
  // Local-credential auth method advertised by the agent; hermes pins its
  // configured provider credentials, pi and omp reuse their cached state.
  authMethodId: string;
  // "config-option" selects the model config option; hermes instead implements
  // the session/set_model request that the ACP spec marks unstable.
  modelSetting: "config-option" | "set-model";
  // Reasoning effort rides the set_model _meta (grok-style) or the
  // "thought_level" config option (pi); omp and hermes do not separate it.
  effortSetting: "set-model-meta" | "thought-level-option" | "none";
}

interface AcpModelCatalog {
  currentModelId?: string;
  availableModels?: Wire[];
}

function acpCommand(config: AcpAgentConfig) {
  // Test fixtures override the executable; dialect args from the config still
  // apply because fixture scripts select their protocol by argument.
  const override = process.env[`LEXICON_${config.id.toUpperCase()}_BIN`];
  if (!override) return { command: config.executable, args: config.args };
  const [command, ...rest] = override.split(" ");
  return { command, args: rest.length ? rest : config.args };
}

export function createAcpAdapter(config: AcpAgentConfig): ProviderAdapter {
  async function connection(cwd: string) {
    const { command, args } = acpCommand(config);
    const rpc = new Rpc(command, args, cwd, true);
    try {
      const initialized = await rpc.request("initialize", {
        protocolVersion: 1,
        clientInfo: { name: "lexicon", version: "2.0.0" },
        clientCapabilities: {
          fs: { readTextFile: true, writeTextFile: false },
          terminal: false,
        },
      });
      await rpc.request("authenticate", { methodId: config.authMethodId });
      return { rpc, initialized };
    } catch (error) {
      rpc.stop();
      throw error;
    }
  }
  const probeStatus = (): ProviderStatus => ({
    id: config.id,
    installed: true,
    authenticated: true,
    detail: "Local login ready",
  });
  return {
    async probe() {
      const { rpc } = await connection(homedir());
      try {
        return probeStatus();
      } finally {
        await rpc.close();
      }
    },
    async models() {
      const { rpc } = await connection(homedir());
      try {
        const session = await rpc.request("session/new", {
          cwd: homedir(),
          mcpServers: [],
        });
        const catalog = (session.models || {}) as AcpModelCatalog;
        const option = (session.configOptions || []).find(
          (candidate: Wire) => candidate.id === "model",
        );
        const models = (catalog.availableModels || []).map((m: Wire) => ({
          id: m.modelId,
          name: m.name || m.modelId,
          description: m.description,
        }));
        return {
          defaultModel: catalog.currentModelId || option?.currentValue,
          models: models.length
            ? models
            : (option?.options || []).map((o: Wire) => ({
                id: o.value,
                name: o.name || o.value,
                description: o.description,
              })),
        };
      } finally {
        await rpc.close();
      }
    },
    async turn(input: TurnInput) {
      const { rpc, initialized } = await connection(input.cwd);
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
              ...(update.status !== undefined
                ? {
                    status:
                      update.status === "completed"
                        ? "complete"
                        : update.status === "failed"
                          ? "error"
                          : "running",
                  }
                : {}),
              input: toolText(update.rawInput),
              output: toolText(
                update.rawOutput ??
                  update.content?.map(
                    (c: Wire) => c.content?.text || c.text || c,
                  ),
              ),
            });
        };
        if (input.sessionId && !initialized.agentCapabilities?.loadSession)
          throw new Error(
            `This ${config.label} version cannot resume its saved conversation. Start a new conversation.`,
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
        if (input.model) {
          if (config.modelSetting === "set-model") {
            await rpc.request("session/set_model", {
              sessionId,
              modelId: input.model,
              ...(config.effortSetting === "set-model-meta" && input.effort
                ? { _meta: { reasoningEffort: input.effort } }
                : {}),
            });
          } else {
            await rpc.request("session/set_config_option", {
              sessionId,
              configId: "model",
              value: input.model,
            });
          }
          if (config.effortSetting === "thought-level-option" && input.effort)
            await rpc.request("session/set_config_option", {
              sessionId,
              configId: "thought_level",
              value: input.effort,
            });
        }
        replaying = false;
        const response = await rpc.request(
          "session/prompt",
          { sessionId, prompt: [{ type: "text", text: input.prompt }] },
          15 * 60_000,
        );
        if (response.stopReason === "cancelled")
          throw new Error("Interrupted.");
        if (!output)
          throw new Error(
            `${config.label} returned no answer (${response.stopReason || "unknown stop reason"}).`,
          );
        return output;
      } finally {
        detach();
        await rpc.close();
      }
    },
  };
}

function bindAbort(input: TurnInput, stop: () => void) {
  if (input.signal.aborted) {
    stop();
    throw new Error("Interrupted.");
  }
  input.signal.addEventListener("abort", stop, { once: true });
  return () => input.signal.removeEventListener("abort", stop);
}

export type { ToolUpdate };