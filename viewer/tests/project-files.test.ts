import { listProjectFiles } from "../server/projectFiles";
import { readProjectSettings, writeProjectSettings } from "../server/settings";
import { expect, test } from "bun:test";
import { mkdtemp, mkdir, writeFile, symlink, rm, realpath, truncate, lstat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFileSync } from "node:child_process";
import { readProjectFiles, readProjectFile } from "../server/files";
import { fileSelectionPath, fileSelectionId } from "../shared/files";
import { fileMapLayout, visibleFileMapNodes } from "../client/src/source/fileMapLayout";
import { measureFiles } from "../server/fileMetrics";

test("inventory respects Git ignores and refuses traversal and escaped symlinks", async () => {
  const root = await mkdtemp(join(tmpdir(), "lexicon-repository-"));
  try {
    execFileSync("git", ["init"], { cwd: root, stdio: "pipe" });
    await writeFile(join(root, ".gitignore"), "ignored.txt\n");
    await writeFile(join(root, "hello.ts"), "export const greeting = 'hello';");
    await writeFile(join(root, "notes.md"), "# Notes\nA document.");
    await writeFile(join(root, "ignored.txt"), "ignored");
    await symlink("/etc/hosts", join(root, "outside"));
    const inventory = await readProjectFiles(root);
    expect(inventory.scope).toBe("git");
    expect(inventory.files).toEqual([".gitignore", "hello.ts", "notes.md", "outside"]);
    expect(inventory.metrics?.["notes.md"]).toEqual({ loc: 2, status: "counted" });
    expect(inventory.metrics?.outside).toEqual({ loc: null, status: "unavailable" });
    expect((await readProjectFile(root, "notes.md")).kind).toBe("document");
    expect((await readProjectFile(root, "hello.ts")).text).toContain("greeting");
    await expect(readProjectFile(root, "../hosts")).rejects.toThrow("Invalid");
    await expect(readProjectFile(root, "outside")).rejects.toThrow("leaves the project root");
    await expect(readProjectFile(root, "ignored.txt")).rejects.toThrow("not in the filtered inventory");
    await writeFile(join(root, "new.ts"), "new");
    expect((await readProjectFiles(root, true)).files).toContain("new.ts");
  } finally { await rm(root, { recursive: true, force: true }); }
});

for (const git of [false, true]) test(`root Lexicon artifacts are excluded even when tracked (${git ? "Git" : "directory"})`, async () => {
  const root = await mkdtemp(join(tmpdir(), "lexicon-artifact-ignore-"));
  try {
    if (git) execFileSync("git", ["init", "-q"], { cwd: root });
    await mkdir(join(root, "lexicon"));
    await mkdir(join(root, "src/lexicon"), { recursive: true });
    await writeFile(join(root, "lexicon/model.xml"), "<lexicon />");
    await writeFile(join(root, "lexicon/canvas.json"), "{}");
    await writeFile(join(root, "src/lexicon/index.ts"), "export const lexicon = true;\n");
    if (git) execFileSync("git", ["add", "."], { cwd: root });
    await writeFile(join(root, "lexicon/draft.md"), "Untracked artifact\n");
    const inventory = await readProjectFiles(root);
    expect(inventory.files).toEqual(["src/lexicon/index.ts"]);
    expect(Object.keys(inventory.metrics!)).toEqual(inventory.files);
    await expect(readProjectFile(root, "lexicon/model.xml")).rejects.toThrow("not in the filtered inventory");
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("LOC measurement handles physical line endings, Unicode, limits, and unchanged-file caching", async () => {
  const root = await realpath(await mkdtemp(join(tmpdir(), "lexicon-lines-")));
  try {
    const fixtures = { "empty.ts": "", "one.ts": "one", "trailing.ts": "one\n", "blank.ts": "one\n\n",
      "crlf.ts": "one\r\ntwo\r\n", "cr.ts": "one\rtwo", "unicode.md": "日本語\ntext",
      "boundary.ts": `${"x".repeat(65535)}\r\ny`, "binary.dat": "\0\n", "large.txt": "" };
    for (const [file, content] of Object.entries(fixtures)) await writeFile(join(root, file), content);
    await truncate(join(root, "large.txt"), 16 * 1024 * 1024 + 1);
    const files = Object.keys(fixtures), cache = new Map();
    const metrics = await measureFiles(root, files, cache);
    for (const [file, loc] of Object.entries({ "empty.ts": 0, "one.ts": 1, "trailing.ts": 1, "blank.ts": 2,
      "crlf.ts": 2, "cr.ts": 2, "unicode.md": 2, "boundary.ts": 2 })) expect(metrics[file]).toEqual({ loc, status: "counted" });
    expect(metrics["binary.dat"].status).toBe("binary");
    expect(metrics["large.txt"].status).toBe("too-large");
    // A zero read budget still returns cached metrics after validating metadata.
    expect(await measureFiles(root, files, cache, { bytes: 0, milliseconds: 10_000 })).toEqual(metrics);
    await writeFile(join(root, "one.ts"), "first\nsecond\nthird");
    const deferred = await measureFiles(root, ["one.ts"], cache, { bytes: 0, milliseconds: 10_000 });
    expect(deferred["one.ts"]).toEqual({ loc: null, status: "deferred" });
    expect((await measureFiles(root, ["one.ts"], cache))["one.ts"]).toEqual({ loc: 3, status: "counted" });
    expect([...cache.keys()]).toEqual(["one.ts"]);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("source tile area follows LOC and directory weights aggregate descendants", () => {
  const metrics = { "small.ts": { loc: 10, status: "counted" as const }, "large.ts": { loc: 100, status: "counted" as const } };
  const { nodes, root } = fileMapLayout(Object.keys(metrics), metrics);
  const small = nodes.get("small.ts")!, large = nodes.get("large.ts")!;
  expect(large.w * large.h / (small.w * small.h)).toBeCloseTo(10, 5);
  expect(root.weight).toBe(110);
  // The root frame has padding, with no reserved label header.
  expect(Math.min(small.y, large.y)).toBe(12);
  const nested = fileMapLayout(["src/small.ts", "src/large.ts", "empty.md", "unknown.pdf"], {
    "src/small.ts": metrics["small.ts"], "src/large.ts": metrics["large.ts"], "empty.md": { loc: 0, status: "counted" },
    "unknown.pdf": { loc: null, status: "binary" },
  });
  expect(nested.nodes.get("src")!.weight).toBe(110);
  expect(nested.nodes.get("empty.md")!.weight).toBe(1);
  expect(nested.nodes.get("unknown.pdf")!.weight).toBe(1);
  expect(nested.root.weight).toBe(112);
});

test("non-Git projects omit dependencies, reject binary and oversized reads", async () => {
  const root = await mkdtemp(join(tmpdir(), "lexicon-repository-"));
  try {
    await mkdir(join(root, "node_modules"));
    await writeFile(join(root, "node_modules", "dependency.js"), "ignored");
    await writeFile(join(root, "binary.dat"), Buffer.from([0, 1, 2]));
    await writeFile(join(root, "large.txt"), "a".repeat(2 * 1024 * 1024 + 1));
    const inventory = await readProjectFiles(root);
    expect(inventory.scope).toBe("directory");
    expect(inventory.files).toEqual(["binary.dat", "large.txt"]);
    await expect(readProjectFile(root, "binary.dat")).rejects.toThrow("binary");
    await expect(readProjectFile(root, "large.txt")).rejects.toThrow("2 MB");
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("repository locations round-trip unusual filenames but reject unsafe paths", () => {
  for (const file of ['docs/design notes.md', 'src/日本語.ts', 'src/a"b.ts']) expect(fileSelectionPath(fileSelectionId(file))).toBe(file);
  for (const file of ["/etc/hosts", "../secret", "src/../../secret", "src\\secret", "a//b", "a/./b"]) expect(fileSelectionPath(fileSelectionId(file))).toBeUndefined();
});

test("large repository layout retains containment and bounds overview work", () => {
  const files = Array.from({ length: 20_000 }, (_, i) => `packages/p${i % 100}/src/file${i}.ts`);
  const { root, nodes } = fileMapLayout(files);
  expect(root.count).toBe(20_000);
  for (const node of nodes.values()) if (node.parent) {
    expect(node.x).toBeGreaterThanOrEqual(node.parent.x);
    expect(node.y).toBeGreaterThanOrEqual(node.parent.y);
    expect(node.x + node.w).toBeLessThanOrEqual(node.parent.x + node.parent.w + .001);
    expect(node.y + node.h).toBeLessThanOrEqual(node.parent.y + node.parent.h + .001);
    expect(node.w).toBeGreaterThan(0); expect(node.h).toBeGreaterThan(0);
  }
  const visible = visibleFileMapNodes(root, root, 1000 / root.w, new Set());
  expect(visible.length).toBeLessThan(1000);
  const focused = nodes.get(files[0])!;
  expect(visibleFileMapNodes(root, focused, 300 / focused.w, new Set()).length).toBeLessThan(100);
  expect(visibleFileMapNodes(root, root, 1, new Set([""]))).toEqual([root]);
  const reordered = fileMapLayout([...files].reverse());
  const a = nodes.get(files[0])!, b = reordered.nodes.get(files[0])!;
  expect([a.x, a.y, a.w, a.h]).toEqual([b.x, b.y, b.w, b.h]);
});

for (const git of [false, true]) test(`nested ignore rules, negations, and refresh apply before LOC scans (${git ? "Git" : "directory"})`, async () => {
  const root = await mkdtemp(join(tmpdir(), "lexicon-ignore-"));
  try {
    if (git) execFileSync("git", ["init", "-q"], { cwd: root });
    await mkdir(join(root, "generated")); await mkdir(join(root, "docs"));
    await writeFile(join(root, ".gitignore"), "generated/\n*.log\n/root-only.txt\n");
    await writeFile(join(root, "docs", ".gitignore"), "!keep.log\nsecret.md\n");
    for (const file of ["generated/huge.ts", "debug.log", "root-only.txt", "docs/root-only.txt", "docs/keep.log", "docs/drop.log", "docs/secret.md", "docs/readme.md"])
      await writeFile(join(root, file), "one\ntwo\n");
    const before = await readProjectFiles(root);
    expect(before.files).toEqual([".gitignore", "docs/.gitignore", "docs/keep.log", "docs/readme.md", "docs/root-only.txt"]);
    expect(Object.keys(before.metrics!).sort()).toEqual(before.files);
    await expect(readProjectFile(root, "generated/huge.ts")).rejects.toThrow("not in the filtered inventory");
    // A changed rule is applied by Refresh, without reusing excluded LOC metrics.
    await writeFile(join(root, "docs", ".gitignore"), "*.md\n");
    const after = await readProjectFiles(root, true);
    expect(after.files).toEqual([".gitignore", "docs/.gitignore", "docs/root-only.txt"]);
    expect(Object.keys(after.metrics!).sort()).toEqual(after.files);
    if (!git) await expect(lstat(join(root, ".git"))).rejects.toThrow();
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("Git ignore rules also exclude tracked files, including a subtree checkout", async () => {
  const root = await mkdtemp(join(tmpdir(), "lexicon-ignore-tracked-"));
  try {
    execFileSync("git", ["init", "-q"], { cwd: root });
    await mkdir(join(root, "src"));
    await writeFile(join(root, "src", "tracked.log"), "tracked");
    execFileSync("git", ["add", "src/tracked.log"], { cwd: root });
    await writeFile(join(root, ".gitignore"), "*.log\n");
    await writeFile(join(root, "src", "ignored.log"), "ignored");
    expect((await readProjectFiles(join(root, "src"))).files).toEqual([]);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("project glob scope combines Git ignores, updates cached inventory, and uses the artifact root", async () => {
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
    const defaults = await readProjectFiles(root, false, artifacts);
    const listed = await listProjectFiles(root, artifacts);
    expect(listed.files).toEqual(defaults.files);
    expect(listed.metrics).toBeUndefined();
    expect(defaults.files).not.toContain(".config/app.ts");
    expect(defaults.files).not.toContain("src/.cache/build.ts");
    expect(defaults.files).toContain(".env.example");
    expect(defaults.files).not.toContain("bun.lock");
    expect(defaults.files).not.toContain("src/dependency.lock");
    await writeProjectSettings(artifacts, { files: { include: [], exclude: [] } });
    const explicit = await readProjectFiles(root, false, artifacts);
    expect(explicit.files).toContain(".config/app.ts");
    expect(explicit.files).toContain("src/.cache/build.ts");
    expect(explicit.files).toContain("bun.lock");
    expect(explicit.files).toContain("src/dependency.lock");
    await writeProjectSettings(artifacts, { files: { include: ["src/**"], exclude: ["**/*.test.ts"] } });
    expect((await readProjectFiles(root, false, artifacts)).files).toEqual(["src/.cache/build.ts", "src/dependency.lock", "src/main.ts"]);
    await expect(readProjectFile(root, "notes.md", artifacts)).rejects.toThrow("inventory");
    await writeProjectSettings(artifacts, { files: { include: ["**/*.md"], exclude: [] } });
    expect((await readProjectFiles(root, false, artifacts)).files).toEqual(["notes.md"]);
    expect((await readProjectFiles(root)).files).toContain("src/main.ts");
    await writeFile(join(artifacts, "lexicon/settings.json"), "invalid");
    await expect(readProjectFiles(root, false, artifacts)).rejects.toThrow("settings.json");
  } finally { await rm(root, { recursive: true, force: true }); await rm(artifacts, { recursive: true, force: true }); }
});

for (const git of [false, true]) test(`embedded repositories preserve structure and shared filtering (${git ? "Git with gitlink" : "directory"})`, async () => {
  const root = await mkdtemp(join(tmpdir(), "lexicon-embedded-"));
  const child = join(root, "services/api"), nested = join(child, "vendor/engine");
  const run = (cwd: string, ...args: string[]) => execFileSync("git", args, { cwd, stdio: "pipe" });
  try {
    if (git) run(root, "init", "-q");
    await mkdir(nested, { recursive: true });
    run(child, "init", "-q"); run(nested, "init", "-q");
    await mkdir(join(child, ".cache")); await mkdir(join(child, "src")); await mkdir(join(root, "lexicon"));
    for (const file of ["README.md", "lexicon/model.xml", "services/api/src/main.ts", "services/api/src/parent-ignored.ts",
      "services/api/src/child-ignored.ts", "services/api/src/local-ignored.ts", "services/api/.cache/generated.ts", "services/api/deps.lock",
      "services/api/vendor/engine/worker.ts", "services/api/vendor/engine/parent-ignored.ts", "services/api/vendor/engine/child-ignored.ts"])
      await writeFile(join(root, file), "one\ntwo\n");
    await writeFile(join(root, ".gitignore"), "**/parent-ignored.ts\n");
    await writeFile(join(child, ".gitignore"), "**/child-ignored.ts\n");
    await writeFile(join(child, ".git/info/exclude"), "src/local-ignored.ts\n");
    // Include tracked entries to prove ignores also apply to cached paths.
    run(child, "add", "-f", "src/child-ignored.ts", "src/local-ignored.ts", "src/main.ts");
    if (git) run(root, "update-index", "--add", "--cacheinfo", `160000,${"1".repeat(40)},services/api`);
    const inventory = await readProjectFiles(root, true);
    expect(inventory.files).toEqual([".gitignore", "README.md", "services/api/.gitignore", "services/api/src/main.ts", "services/api/vendor/engine/worker.ts"]);
    expect(Object.keys(inventory.metrics!).sort()).toEqual(inventory.files);
    expect((await listProjectFiles(root)).files).toEqual(inventory.files);
    expect((await readProjectFile(root, "services/api/src/main.ts")).text).toBe("one\ntwo\n");
    // Includes must be evaluated on leaf paths, never used to prune their ancestors.
    await writeProjectSettings(root, { files: { include: ["services/**/src/*.ts", "services/**/engine/*.ts"], exclude: ["**/worker.ts"] } });
    expect((await readProjectFiles(root)).files).toEqual(["services/api/src/main.ts"]);
    await rm(join(child, "src/main.ts"));
    expect((await readProjectFiles(root, true)).files).toEqual([]);
    if (!git) await expect(lstat(join(root, ".git"))).rejects.toThrow();
  } finally { await rm(root, { recursive: true, force: true }); }
});
