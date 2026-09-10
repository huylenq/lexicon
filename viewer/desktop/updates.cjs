const RELEASES_URL = 'https://github.com/huylenq/lexicon/releases';
const RELEASE_API = 'https://api.github.com/repos/huylenq/lexicon/releases/latest';

function stableVersion(value) {
  const match = typeof value === 'string' && /^v?(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.exec(value);
  if (!match) return null;
  const parts = match.slice(1).map(Number);
  return parts.every(Number.isSafeInteger) ? parts : null;
}
function isNewer(candidate, current) {
  const a = stableVersion(candidate), b = stableVersion(current);
  if (!a || !b) return false;
  for (let i = 0; i < 3; i++) {
    if (a[i] !== b[i]) return a[i] > b[i];
  }
  return false;
}
function releaseNotice(release, current) {
  if (!release || release.draft || release.prerelease || !isNewer(release.tag_name, current)) return null;
  // Construct the URL ourselves; release metadata cannot send users to another host.
  return { version: release.tag_name.replace(/^v/, ''), url: `${RELEASES_URL}/tag/${encodeURIComponent(release.tag_name)}` };
}
async function checkRelease(current, request = fetch) {
  const response = await request(RELEASE_API, {
    headers: { Accept: 'application/vnd.github+json', 'User-Agent': `Lexicon/${current}` },
    signal: AbortSignal.timeout(10000), redirect: 'error',
  });
  if (response.status === 404) return null; // No published release yet (or a private repository).
  if (!response.ok) throw new Error(`Release check failed (${response.status}).`);
  return releaseNotice(await response.json(), current);
}
module.exports = { RELEASES_URL, isNewer, releaseNotice, checkRelease };
