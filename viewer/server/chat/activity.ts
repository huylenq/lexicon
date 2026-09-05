import type { ChatMessage, ToolUpdate } from "../../shared/chat";

const limit = 12_000;
export function toolText(value: unknown): string | undefined {
  if (value === undefined || value === null) return undefined;
  const text = typeof value === "string" ? value : JSON.stringify(value, null, 2);
  return text.length > limit ? text.slice(0, limit) + "\n… (truncated)" : text;
}
export function updateTool(message: ChatMessage, update: ToolUpdate) {
  if (typeof update.id !== "string" || !update.id) return;
  const tools = (message.tools ??= []);
  let tool = tools.find((t) => t.id === update.id);
  if (!tool) {
    if (tools.length >= 200) return;
    tool = { id: update.id, title: "Tool call", kind: "tool", status: "running", startedAt: new Date().toISOString() };
    tools.push(tool);
  }
  if (update.title !== undefined) tool.title = update.title.slice(0, 240);
  if (update.kind !== undefined) tool.kind = update.kind;
  if (update.input !== undefined) tool.input = toolText(update.input);
  if (update.output !== undefined) tool.output = toolText(update.output);
  if (update.outputDelta !== undefined) tool.output = toolText((tool.output || "") + update.outputDelta);
  if (update.status !== undefined) tool.status = update.status;
  if (tool.status !== "running") tool.finishedAt ??= new Date().toISOString();
}
export function finishTools(message: ChatMessage) {
  message.finishedAt = new Date().toISOString();
  for (const tool of message.tools || [])
    if (tool.status === "running") {
      // A turn ending without a tool result is not evidence of tool success.
      tool.status = "interrupted";
      tool.finishedAt = message.finishedAt;
    }
}
export function readableError(error: unknown): string {
  const text = error instanceof Error ? error.message : String(error);
  try {
    const parsed = JSON.parse(text);
    return parsed.error?.message || parsed.message || text;
  } catch { return text; }
}
