import { expect, test } from "bun:test";
import type { ChatMessage } from "../shared/chat";
import { updateTool, finishTools, readableError } from "../server/chat/activity";

test("tool output is bounded and missing results remain interrupted", () => {
  const message = { tools: [] } as unknown as ChatMessage;
  updateTool(message, { id: "read", title: "Read source", input: "file.ts", outputDelta: "x".repeat(20_000) });
  updateTool(message, { id: "failed", status: "error", output: "Missing file" });
  finishTools(message);
  expect(message.tools![0].output!.length).toBeLessThan(12_100);
  expect(message.tools![0].status).toBe("interrupted");
  expect(message.tools![1].status).toBe("error");
  expect(message.tools!.every((t) => t.finishedAt)).toBe(true);
  expect(readableError(new Error('{"error":{"message":"Model unavailable"}}'))).toBe("Model unavailable");
});
