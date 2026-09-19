import { describe, expect, test } from "bun:test";
import { diffForFile } from "../client/src/agentCodeDiff";

const textPatch = (path: string, added: string) => `diff --git a/${path} b/${path}\nindex 1234567..abcdef0 100644\n--- a/${path}\n+++ b/${path}\n@@ -1 +1 @@\n-before\n+${added}\n`;

describe("code review at authored source locations", () => {
  test("selects one exact file, excludes neighboring paths and hunk content that resembles a header", () => {
    const selected = textPatch("src/order.ts", "after");
    const neighbor = textPatch("src/order.tsx", "++ b/src/not-a-file.ts");
    expect(diffForFile(neighbor + selected, "./src/order.ts")).toBe(selected);
    expect(diffForFile(neighbor + selected, "src/order.tsx")).toBe(neighbor);
    expect(diffForFile(neighbor + selected, "src/not-a-file.ts")).toBe("");
    expect(diffForFile(neighbor + selected, "order.ts")).toBe("");
  });

  test("locates both sides of an exact rename without selecting unrelated files", () => {
    const rename = `diff --git a/old folder/name.ts b/new folder/name.ts\nsimilarity index 100%\nrename from old folder/name.ts\nrename to new folder/name.ts\n`;
    const diff = rename + textPatch("new folder/name.tsx", "different");
    expect(diffForFile(diff, "new folder/name.ts")).toBe(rename);
    expect(diffForFile(diff, "old folder/name.ts")).toBe(rename);
    expect(diffForFile(diff, "folder/name.ts")).toBe("");
  });

  test("preserves binary and mode-only changes when there are no text hunk headers", () => {
    const binary = `diff --git a/logo image.bin b/logo image.bin\nindex 1234567..abcdef0 100644\nBinary files a/logo image.bin and b/logo image.bin differ\n`;
    const mode = `diff --git a/scripts/build b/scripts/build\nold mode 100644\nnew mode 100755\n`;
    const diff = binary + mode + textPatch("src/order.ts", "unrelated");
    expect(diffForFile(diff, "logo image.bin")).toBe(binary);
    expect(diffForFile(diff, "scripts/build")).toBe(mode);
  });

  test("decodes Git octal UTF-8, control characters, quotes and backslashes", () => {
    const filename = 'src/café\t"draft"\\name.ts';
    const encoded = String.raw`src/caf\303\251\t\"draft\"\\name.ts`;
    const quoted = `diff --git "a/${encoded}" "b/${encoded}"\nold mode 100644\nnew mode 100755\n`;
    expect(diffForFile(quoted + textPatch("src/cafe.ts", "other"), filename)).toBe(quoted);
    expect(diffForFile(quoted, 'src/café\t"draft"/name.ts')).toBe("");
  });

  test("accepts a single standard unified patch without a git header and empty diff", () => {
    const patch = `--- a/calculate.ts\n+++ b/calculate.ts\n@@ -1 +1 @@\n-before\n+after\n`;
    expect(diffForFile(patch, "calculate.ts")).toBe(patch);
    expect(diffForFile(patch, "other.ts")).toBe("");
    expect(diffForFile("", "calculate.ts")).toBe("");
  });
});
