import { expect, test } from "bun:test";
import { CheckpointRef, TurnId } from "@t3tools/contracts";
import { AgentCodeReview, codeReviewFiles } from "../server/agents/code-review";

const patch = "diff --git a/order.ts b/order.ts\nindex 1111111..2222222 100644\n--- a/order.ts\n+++ b/order.ts\n@@ -1 +1 @@\n-old\n+new\n";
const checkpoint = (count: number, ref = `checkpoint-${count}`) => ({
  turnId: TurnId.make(`turn-${count}`), checkpointTurnCount: count, checkpointRef: CheckpointRef.make(ref),
  status: "ready" as const, files: [], assistantMessageId: null, completedAt: `2026-09-18T00:00:${String(count).padStart(2, "0")}.000Z`,
});
const deferred = <T>() => {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
};

test("code review uses Git to parse text, binary, mode-only, renamed, and quoted paths", async () => {
  const diff = patch +
    "diff --git a/image.png b/image.png\nindex 1111111..2222222 100644\nBinary files a/image.png and b/image.png differ\n" +
    "diff --git a/tool.sh b/tool.sh\nold mode 100644\nnew mode 100755\n" +
    "diff --git a/old.txt b/new.txt\nsimilarity index 100%\nrename from old.txt\nrename to new.txt\n" +
    'diff --git "a/name\\tquoted.txt" "b/name\\tquoted.txt"\nold mode 100644\nnew mode 100755\n';
  const files = await codeReviewFiles(diff);
  expect(files).toContainEqual({ path: "order.ts", additions: 1, deletions: 1 });
  for (const path of ["image.png", "tool.sh", "new.txt", "name\tquoted.txt"])
    expect(files).toContainEqual({ path, additions: 0, deletions: 0 });
  expect(files).toHaveLength(5);
});

test("whitespace-only changes remain code changes and empty patches have no files", async () => {
  expect(await codeReviewFiles(patch.replace("-old\n+new", "-old\n+old "))).toEqual([{ path: "order.ts", additions: 1, deletions: 1 }]);
  expect(await codeReviewFiles("\n\t")).toEqual([]);
  await expect(codeReviewFiles("not a git diff")).rejects.toThrow("could not be summarized");
});

test("session review retains earlier changes after a no-op and clears after a reversion", async () => {
  const review = new AgentCodeReview();
  let calls = 0;
  const load = async () => { calls++; return { diff: patch }; };
  review.sync("thread", checkpoint(1), load, () => {});
  expect(review.state).toEqual({ checkpoint: 1, status: "loading" });
  await review.read();
  expect(review.files).toEqual([{ path: "order.ts", additions: 1, deletions: 1 }]);
  review.sync("thread", checkpoint(1), load, () => {});
  await review.read();
  expect(calls).toBe(1);
  // Empty per-turn files do not erase the 0 -> 2 session diff.
  review.sync("thread", checkpoint(2), load, () => {});
  await review.read();
  expect(review.state).toEqual({ checkpoint: 2, status: "ready", hasChanges: true });
  expect(review.files).toHaveLength(1);
  review.sync("thread", checkpoint(3), async () => ({ diff: "" }), () => {});
  expect(await review.read()).toEqual({ diff: "", checkpoint: 3 });
  expect(review.state).toEqual({ checkpoint: 3, status: "ready", hasChanges: false });
  expect(review.files).toEqual([]);
});

test("code review cache invalidates on checkpoint identity and fences obsolete results", async () => {
  const review = new AgentCodeReview();
  const first = deferred<{ diff: string }>();
  let notifications = 0;
  review.sync("thread", checkpoint(1), () => first.promise, () => { notifications++; });
  const obsolete = review.read();
  review.sync("thread", checkpoint(1, "replacement"), async () => ({ diff: "" }), () => { notifications++; });
  await review.read();
  first.resolve({ diff: patch });
  await expect(obsolete).rejects.toThrow("checkpoint changed");
  expect(review.state?.hasChanges).toBe(false);
  expect(review.files).toEqual([]);
  expect(notifications).toBe(1);
});

test("disconnect/reset and different threads cannot publish an earlier pending diff", async () => {
  const review = new AgentCodeReview();
  const pending = deferred<{ diff: string }>();
  let staleNotified = false;
  review.sync("old-thread", checkpoint(1), () => pending.promise, () => { staleNotified = true; });
  const obsolete = review.read();
  review.reset();
  expect(review.state).toBeUndefined();
  expect(review.files).toEqual([]);
  review.sync("new-thread", checkpoint(1), async () => ({ diff: "" }), () => {});
  await review.read();
  pending.resolve({ diff: patch });
  await expect(obsolete).rejects.toThrow("checkpoint changed");
  expect(staleNotified).toBe(false);
  expect(review.state?.hasChanges).toBe(false);
});

test("failed summaries remain errors and explicit review retries once", async () => {
  const review = new AgentCodeReview();
  let calls = 0;
  const changed = deferred<void>();
  const load = async () => {
    calls++;
    if (calls === 1) throw new Error("Checkpoint unavailable");
    return { diff: patch };
  };
  review.sync("thread", checkpoint(1), load, () => changed.resolve());
  await changed.promise;
  expect(review.state).toEqual({ checkpoint: 1, status: "error", error: "Checkpoint unavailable" });
  expect(review.state?.hasChanges).toBeUndefined();
  review.sync("thread", checkpoint(1), load, () => {});
  expect(calls).toBe(1);
  const [first, second] = await Promise.all([review.read(), review.read()]);
  expect(first).toEqual(second);
  expect(calls).toBe(2);
  expect(review.state?.hasChanges).toBe(true);
});
