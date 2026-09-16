import { expect, test } from "bun:test";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFileSync } from "node:child_process";
import { listRepositoryFiles } from "../server/projectFiles";
import { readProjectSettings, writeProjectSettings, validateSettings } from "../server/settings";

test("project glob scope combines Git ignores and uses the artifact root", async () => {
  const root = await mkdtemp(join(tmpdir(), "lexicon-settings-"));
  const artifacts = await mkdtemp(join(tmpdir(), "lexicon-settings-artifacts-"));
  try {
    execFileSync("git", ["init", "-q"], { cwd: root });
    await mkdir(join(root, "src/.cache"), { recursive: true });
    await mkdir(join(root, ".config"));
    for (const file of ["src/main.ts", "src/main.test.ts", "src/generated.ts", "notes.md", "bun.lock", "src/dependency.lock", ".config/app.ts", "src/.cache/build.ts", ".env.example"]) await writeFile(join(root, file), "text");
    execFileSync("git", ["add", "."], { cwd: root });
    await writeFile(join(root, ".gitignore"), "src/generated.ts\n");
    expect(readProjectSettings(artifacts).files.include).toEqual([]);
    expect(readProjectSettings(artifacts).files.exclude).toEqual(["**/*.lock", "**/.*/**"]);
    const defaults = await listRepositoryFiles(root, artifacts);
    expect(defaults.metrics).toBeUndefined();
    expect(defaults.files).not.toContain(".config/app.ts");
    expect(defaults.files).not.toContain("src/.cache/build.ts");
    expect(defaults.files).toContain(".env.example");
    expect(defaults.files).not.toContain("bun.lock");
    expect(defaults.files).not.toContain("src/dependency.lock");
    await writeProjectSettings(artifacts, { files: { include: [], exclude: [] } });
    const explicit = await listRepositoryFiles(root, artifacts);
    expect(explicit.files).toContain(".config/app.ts");
    expect(explicit.files).toContain("src/.cache/build.ts");
    expect(explicit.files).toContain("bun.lock");
    expect(explicit.files).toContain("src/dependency.lock");
    await writeProjectSettings(artifacts, { files: { include: ["src/**"], exclude: ["**/*.test.ts"] } });
    expect((await listRepositoryFiles(root, artifacts)).files).toEqual(["src/.cache/build.ts", "src/dependency.lock", "src/main.ts"]);
    await writeProjectSettings(artifacts, { files: { include: ["**/*.md"], exclude: [] } });
    expect((await listRepositoryFiles(root, artifacts)).files).toEqual(["notes.md"]);
    expect((await listRepositoryFiles(root)).files).toContain("src/main.ts");
    await writeFile(join(artifacts, "lexicon/settings.json"), "invalid");
    await expect(listRepositoryFiles(root, artifacts)).rejects.toThrow("settings.json");
  } finally { await rm(root, { recursive: true, force: true }); await rm(artifacts, { recursive: true, force: true }); }
});
test("settings reject malformed lists and unsafe patterns", () => {
  for (const value of [{}, { files: { include: "src/**", exclude: [] } }, ...["../*", "/tmp/**", "!src/**", "a\nb"].map(p => ({ files: { include: [p], exclude: [] } }))])
    expect(() => validateSettings(value)).toThrow();
});
