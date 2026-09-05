#!/usr/bin/env bun
// Deterministic native-protocol peer for integration tests. Never used by the app.
import { createInterface } from "node:readline";
const args = process.argv.slice(2);
const send = (message: unknown) =>
  process.stdout.write(JSON.stringify(message) + "\n");
let selectedModel = args[args.indexOf("--model") + 1] || "";
let selectedEffort = args[args.indexOf("--effort") + 1] || "";
let selectedSpeed = args.includes("--settings") && JSON.parse(args[args.indexOf("--settings") + 1]).fastMode ? "fast" : "standard";
if (args.includes("--version")) {
  console.log("Lexicon test agent 1.0");
  process.exit(0);
}
if (args.includes("auth")) {
  console.log(JSON.stringify({ loggedIn: true }));
  process.exit(0);
}
function reply(prompt: string) {
  let text = prompt,
    model: any;
  if (prompt.includes("RECENT PROJECT CONVERSATION")) {
    text = JSON.parse(
      prompt.split(
        "RECENT PROJECT CONVERSATION (the final user message is the current request):\n",
      )[1],
    ).at(-1).text;
    model = JSON.parse(
      prompt
        .split("CURRENT MODEL:\n")[1]
        .split("\nRECENT PROJECT CONVERSATION")[0],
    );
  }
  if (text.includes("question")) return { question: true, text: "" };
  if (text.includes("model selection")) return { text: `Model ${selectedModel}, effort ${selectedEffort || "default"}.` };
  if (text.includes("speed selection")) return { text: `Speed ${selectedSpeed}.` };
  if (text.includes("slow")) return { slow: true, text: "Working…" };
  if (text.includes("Rename")) {
    const item = model.items.find((i: any) => i.type === "concept");
    return {
      text:
        "The concept will be named Purchase.\n```lexicon-patch\n" +
        JSON.stringify({ upsert: [{ ...item, name: "Purchase" }] }) +
        "\n```",
    };
  }
  if (text.includes("invalid"))
    return { text: '```lexicon-patch\n{"remove":["scope"]}\n```' };
  return { text: "An order records a purchase. No model change is needed." };
}
if (args.includes("--print")) {
  if (
    !args.includes("Read,Glob,Grep") ||
    !args.includes("dontAsk") ||
    !args.includes("--strict-mcp-config")
  )
    process.exit(3);
  const prompt = await Bun.stdin.text();
  const output = reply(prompt).text;
  if (prompt.includes("tools")) {
    send({ type: "stream_event", event: { index: 0, content_block: { type: "tool_use", id: "read-1", name: "Read" } } });
    send({ type: "assistant", message: { content: [{ type: "tool_use", id: "read-1", name: "Read", input: { file_path: "order.ts" } }] } });
    send({ type: "user", message: { content: [{ type: "tool_result", tool_use_id: "read-1", content: "export interface Order {}" }] } });
  }
  send({ type: "system", session_id: "claude-owned" });
  send({
    type: "stream_event",
    event: {
      type: "content_block_delta",
      delta: { type: "text_delta", text: output },
    },
  });
  send({
    type: "assistant",
    message: { content: [{ type: "text", text: output }] },
  });
  send({ type: "result", is_error: false, result: output });
  process.exit(0);
}
const grok = args.includes("agent");
let activeId = 0;
const notification = (method: string, params: unknown) =>
  send({ method, params });
function complete(text: string) {
  if (grok) {
    notification("session/update", {
      sessionId: "grok-owned",
      update: {
        sessionUpdate: "agent_message_chunk",
        content: { type: "text", text },
      },
    });
    send({ id: activeId, result: { stopReason: "end_turn" } });
  } else {
    notification("item/agentMessage/delta", {
      threadId: "codex-owned",
      itemId: "reply",
      delta: text,
    });
    notification("turn/completed", {
      threadId: "codex-owned",
      turn: { id: "turn", status: "completed" },
    });
  }
}
createInterface({ input: process.stdin }).on("line", (line) => {
  const message = JSON.parse(line),
    p = message.params || {};
  if (message.id === "question") {
    complete(
      `Selected ${Object.values(message.result.answers)[0] && (Object.values(message.result.answers)[0] as any).answers[0]}.`,
    );
    return;
  }
  if (message.method === "initialize")
    send({
      id: message.id,
      result: grok
        ? { protocolVersion: 1, agentCapabilities: { loadSession: true } }
        : {},
    });
  else if (message.method === "account/read")
    send({
      id: message.id,
      result: { account: { type: "chatgpt" }, requiresOpenaiAuth: true },
    });
  else if (message.method === "config/read")
    send({ id: message.id, result: { config: { model: "test-fast", mcp_servers: {} } } });
  else if (message.method === "model/list")
    send({ id: message.id, result: {
      data: [{ model: p.cursor ? "test-deep" : "test-fast", displayName: p.cursor ? "Deep model" : "Fast model", supportedReasoningEfforts: [{ reasoningEffort: "low" }, { reasoningEffort: "high" }], defaultReasoningEffort: "low", ...(p.cursor ? { serviceTiers: [{ id: "priority", name: "Fast", description: "Faster responses; increased usage" }] } : {}) }],
      nextCursor: p.cursor ? null : "next-page",
    } });
  else if (["thread/start", "thread/resume"].includes(message.method)) {
    selectedModel = p.model || "test-fast";
    if (p.sandbox !== "read-only" || p.approvalPolicy !== "never") {
      send({
        id: message.id,
        error: { message: "Expected read-only session" },
      });
      return;
    }
    send({ id: message.id, result: { thread: { id: "codex-owned" } } });
  } else if (message.method === "authenticate")
    send({ id: message.id, result: {} });
  else if (["session/new", "session/load"].includes(message.method))
    send({ id: message.id, result: { sessionId: "grok-owned", models: { currentModelId: "grok-test", availableModels: [{ modelId: "grok-test", name: "Grok test", _meta: { reasoningEffort: "high", reasoningEfforts: [{ value: "low" }, { value: "high" }] } }] } } });
  else if (message.method === "session/set_model") {
    selectedModel = p.modelId;
    selectedEffort = p._meta?.reasoningEffort || "";
    send({ id: message.id, result: {} });
  }
  else if (["turn/start", "session/prompt"].includes(message.method)) {
    activeId = message.id;
    if (!grok) {
      if (p.model && selectedModel !== p.model) {
        send({ id: message.id, error: { message: "Thread and turn model mismatch" } }); return;
      }
      selectedEffort = p.effort || "";
      selectedSpeed = p.serviceTierForTurn === "priority" ? "fast" : p.serviceTierForTurn === "default" ? "standard" : "inherited";
      if (p.sandboxPolicy.type !== "readOnly") {
        send({ id: message.id, error: { message: "Expected read-only turn" } });
        return;
      }
      send({ id: message.id, result: { turn: { id: "turn" } } });
    }
    const prompt = grok ? p.prompt[0].text : p.input[0].text;
    if (prompt.includes("tools")) {
      if (grok) {
        notification("session/update", { update: { sessionUpdate: "tool_call", toolCallId: "read-1", title: "Read order.ts", kind: "read", status: "in_progress", rawInput: { path: "order.ts" } } });
        notification("session/update", { update: { sessionUpdate: "tool_call_update", toolCallId: "read-1", status: "completed", rawOutput: "export interface Order {}" } });
      } else {
        notification("item/started", { threadId: "codex-owned", item: { type: "commandExecution", id: "read-1", command: "cat order.ts", status: "inProgress" } });
        notification("item/commandExecution/outputDelta", { threadId: "codex-owned", itemId: "read-1", delta: "export interface Order {}" });
        notification("item/completed", { threadId: "codex-owned", item: { type: "commandExecution", id: "read-1", command: "cat order.ts", status: "completed", aggregatedOutput: "export interface Order {}" } });
      }
    }
    const response = reply(prompt);
    if (!grok && prompt.includes("segments"))
      notification("item/agentMessage/delta", { threadId: "codex-owned", itemId: "commentary", delta: "Reading the source." });
    if (response.question && !grok)
      send({
        id: "question",
        method: "item/tool/requestUserInput",
        params: {
          questions: [
            {
              id: "scope",
              question: "Which area?",
              options: [{ label: "Orders" }, { label: "Shipping" }],
            },
          ],
        },
      });
    else if (!response.slow) complete(response.text);
  } else if (message.method === "turn/interrupt") {
    send({ id: message.id, result: {} });
    notification("turn/completed", {
      threadId: "codex-owned",
      turn: { id: "turn", status: "interrupted" },
    });
  } else if (message.id !== undefined) send({ id: message.id, result: {} });
});
