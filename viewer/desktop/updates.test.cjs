const { test } = require('node:test');
const assert = require('node:assert/strict');
const { isNewer, releaseNotice, checkRelease } = require('./updates.cjs');

test('compares stable numeric versions, including multi-digit components', () => {
  assert.equal(isNewer('v2.10.0', '2.9.9'), true);
  for (const version of ['2.0.0', '1.99.0', 'v2.1.0-beta.1', 'not-a-version', '2.01.0'])
    assert.equal(isNewer(version, '2.0.0'), false);
  assert.equal(isNewer('3.0.0', '2.9.9'), true);
});
test('ignores draft and prerelease records and constrains outbound URLs', () => {
  assert.equal(releaseNotice({ tag_name: 'v3.0.0', draft: true }, '2.0.0'), null);
  assert.equal(releaseNotice({ tag_name: 'v3.0.0', prerelease: true }, '2.0.0'), null);
  assert.deepEqual(releaseNotice({ tag_name: 'v3.0.0', html_url: 'https://evil.example' }, '2.0.0'), {
    version: '3.0.0', url: 'https://github.com/huylenq/lexicon/releases/tag/v3.0.0',
  });
});
test('missing releases are quiet; rate limits and invalid responses remain retryable', async () => {
  assert.equal(await checkRelease('2.0.0', async () => new Response('', { status: 404 })), null);
  await assert.rejects(checkRelease('2.0.0', async () => new Response('', { status: 403 })), /403/);
  await assert.rejects(checkRelease('2.0.0', async () => new Response('not json')));
  assert.equal((await checkRelease('2.0.0', async () => Response.json({ tag_name: 'v2.0.1' }))).version, '2.0.1');
});
