import { expect, test } from "bun:test";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { readSource } from "../server/source";
import { markdownHeadings } from "../server/markdown";
import { parseModel, serializeModel } from "../server/model";
import { applyPatch, validateChangedLinks } from "../server/chat/model-edit";
import { codeTargetId, codeLinkKey } from "../shared/model";

const xml = (attrs = 'heading="approval"') => `<lexicon schema="3.3" id="docs"><name>Docs</name><description>Requirements.</description><context id="orders"><name>Orders</name><description>Ordering.</description><code-link kind="document" id="requirement" file="spec.md" role="specification" ${attrs}>Defines approval.</code-link></context></lexicon>`;
const markdown = '# Order **specification**\n\n## Approval\n\nA reviewer approves.\n\n### Details\n\nReview identity is recorded.\n\n## Approval\n\nSecond section.\n\n```md\n# Not a heading\n```\n\nSetext heading\n--------------\n\n## café & 安全\n';

test("CommonMark headings resolve formatting, duplicates, Unicode and setext without treating code fences as headings", () => {
  const hs = markdownHeadings(markdown);
  expect(hs.map(h => h.id)).toEqual(['order-specification', 'approval', 'details', 'approval-1', 'setext-heading', 'café--安全']);
  expect(hs[1]).toMatchObject({ startLine: 3, endLine: 10, depth: 2, title: 'Approval' });
  expect(markdownHeadings('# A\n# A\n# A-1\n# A')[2].id).toBe('a-1-1');
});

test("heading links round-trip without altering old source identities and invalid selectors are rejected", () => {
  const model = parseModel(xml());
  expect(model.issues).toEqual([]);
  expect(parseModel(serializeModel(model))).toEqual(model);
  const link = model.items[0].codeLinks[0];
  if (link.kind !== "document" || link.line !== undefined) throw new Error("Expected heading fixture");
  expect(codeTargetId(link)).toBe('code:["spec.md","heading","approval"]');
  expect(codeTargetId({ ...link, kind: 'code', heading: undefined, symbol: 'Order' })).toBe('code:["spec.md","symbol","Order"]');
  expect(codeLinkKey({ ...link, line: undefined, heading: 'new-heading' })).toBe('requirement');
  for (const attrs of ['heading=""', 'heading="#approval"', 'heading="Approval needed"', 'heading="approval" line="3"', 'heading="approval" symbol="Order"'])
    expect(parseModel(xml(attrs)).issues.some(i => i.severity === 'error')).toBe(true);
  expect(parseModel(xml().replace('spec.md', 'order.ts')).issues.some(i => i.severity === 'error')).toBe(true);
  const patch = { upsert: [{ ...model.items[0], codeLinks: [{ ...link, line: undefined, heading: 'details' }] }] };
  expect(applyPatch(model, patch).items[0].codeLinks[0].heading).toBe('details');
  expect(() => applyPatch(model, { upsert: [{ ...model.items[0], codeLinks: [{ ...link, heading: 4 }] }] })).toThrow();
});

test("resolver, edit validation, and CLI agree on Markdown heading failures", async () => {
  const root = await mkdtemp(join(tmpdir(), 'lexicon-docs-'));
  try {
    await mkdir(join(root, 'lexicon'));
    await writeFile(join(root, 'spec.md'), markdown);
    const before = parseModel(xml());
    const link = before.items[0].codeLinks[0];
    if (link.kind !== "document" || link.line !== undefined) throw new Error("Expected heading fixture");
    expect(await readSource(root, link)).toMatchObject({ format: 'markdown', status: 'heading', startLine: 3, endLine: 10 });
    expect(await readSource(root, { ...link, heading: undefined })).toMatchObject({ format: 'markdown', status: 'file' });
    expect(await readSource(root, { ...link, heading: undefined, line: 5 })).toMatchObject({ status: 'line', startLine: 5 });
    expect(await readSource(root, { ...link, line: undefined, heading: 'approval-1' })).toMatchObject({ status: 'heading', startLine: 11 });
    expect(await readSource(root, { ...link, line: undefined, heading: 'absent' })).toMatchObject({ status: 'missing-heading' });
    const after = parseModel(xml('heading="absent"'));
    await expect(validateChangedLinks(before, after, root)).rejects.toThrow('missing-heading');
    await writeFile(join(root, 'lexicon/model.xml'), xml('heading="absent"'));
    const check = spawnSync(process.execPath, [resolve(import.meta.dir, '../server/cli.ts'), 'check', root], { encoding: 'utf8' });
    expect(check.status).toBe(1);
    expect(check.stderr).toContain('spec.md#absent');
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("heading documents require schema 3.3 and retain selectors through unrelated edits", () => {
  const source = xml();
  expect(() => parseModel(source.replace('schema="3.3"', 'schema="3.0"'))).toThrow('Expected');
  const model = parseModel(source);
  const edited = applyPatch(model, { project: { name: 'Renamed project' } });
  expect(parseModel(serializeModel(edited)).items[0].codeLinks[0].heading).toBe('approval');
});

test("collision-heavy heading documents stay within the parsing budget", () => {
  const started = performance.now();
  const headings = markdownHeadings('# A\n'.repeat(20_000));
  const elapsed = performance.now() - started;
  expect(headings).toHaveLength(20_000);
  expect(new Set(headings.map(h => h.id)).size).toBe(20_000);
  expect(headings.at(-1)?.id).toBe('a-19999');
  // Generous budget for parsing 80 KB; restarting suffix search took many seconds.
  expect(elapsed).toBeLessThan(3_000);
  expect(markdownHeadings('# A\n# A-1\n# A\n# A-2\n# A').map(h => h.id))
    .toEqual(['a', 'a-1', 'a-2', 'a-2-1', 'a-3']);
});

for (const newline of ['\n', '\r\n', '\r']) {
  test(`Markdown section and line targets agree for ${JSON.stringify(newline)} endings`, async () => {
    const root = await mkdtemp(join(tmpdir(), 'lexicon-newlines-'));
    try {
      const text = ['# A', 'body', '## B', 'body', '# C', 'tail', ''].join(newline);
      await writeFile(join(root, 'spec.md'), text);
      expect(markdownHeadings(text).map(h => [h.id, h.startLine, h.endLine]))
        .toEqual([['a', 1, 4], ['b', 3, 4], ['c', 5, 7]]);
      const link = { kind: 'document' as const, file: 'spec.md', role: 'reference', description: 'Source.' };
      expect(await readSource(root, { ...link, line: undefined, heading: 'c' }))
        .toMatchObject({ text, startLine: 5, endLine: 7, status: 'heading' });
      expect(await readSource(root, { ...link, line: 5 }))
        .toMatchObject({ text, startLine: 5, endLine: 5, status: 'line' });
      await expect(readSource(root, { ...link, line: 8 })).rejects.toThrow('beyond');
    } finally { await rm(root, { recursive: true, force: true }); }
  });
}
