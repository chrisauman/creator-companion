// Postbuild step — stamps the deployed HTML with the git commit hash
// and build timestamp. Lets us answer "is the live URL serving my
// latest code?" by inspecting page source instead of guessing.
//
// Usage: node scripts/inject-version.mjs
//
// Reads:
//   - VERCEL_GIT_COMMIT_SHA  (preferred; set automatically by Vercel)
//   - falls back to `git rev-parse HEAD` for local builds
//
// Writes a marker into dist/.../index.html:
//   <!-- build: <sha> · <iso-timestamp> -->
//   <meta name="cc-build" content="<sha>">
//   <meta name="cc-build-time" content="<iso-timestamp>">
//
// Quick check from anywhere:
//   curl -s https://app.creatorcompanionapp.com | grep cc-build

import { execSync } from 'node:child_process';
import { readFileSync, writeFileSync, existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const distDir  = join('dist', 'creator-companion-web', 'browser');
const distHtml = join(distDir, 'index.html');

if (!existsSync(distHtml)) {
  console.warn(`[inject-version] ${distHtml} not found — skipping`);
  process.exit(0);
}

let sha = process.env.VERCEL_GIT_COMMIT_SHA || '';
if (!sha) {
  try { sha = execSync('git rev-parse HEAD').toString().trim(); }
  catch { sha = 'unknown'; }
}
const shortSha = sha.slice(0, 7);
const time = new Date().toISOString();

const marker = [
  `<!-- build: ${sha} · ${time} -->`,
  `  <meta name="cc-build" content="${shortSha}">`,
  `  <meta name="cc-build-time" content="${time}">`
].join('\n');

let html = readFileSync(distHtml, 'utf8');

// Insert immediately after <head> so the markers appear at the top
// of the source for easy grepping.
html = html.replace(/<head>/, `<head>\n  ${marker}`);

writeFileSync(distHtml, html);
console.log(`[inject-version] stamped ${distHtml} with ${shortSha}`);

// ── Sentinel replacement in JS bundles ────────────────────────────
// environment.production.ts ships with text sentinels (__SENTRY_DSN__
// and __RELEASE_SHA__) so the Sentry DSN doesn't have to be checked
// into git. At deploy time, Vercel's env var SENTRY_DSN is available
// to this Node script; we rewrite the sentinels in every bundled
// .js file. If SENTRY_DSN is unset, the sentinel is replaced with
// the empty string so Sentry's SDK gracefully no-ops.
const sentryDsn = process.env.SENTRY_DSN || '';

let bundleCount = 0;
let bundlesRewritten = 0;
for (const file of readdirSync(distDir)) {
  if (!file.endsWith('.js')) continue;
  bundleCount++;
  const path = join(distDir, file);
  const before = readFileSync(path, 'utf8');
  if (!before.includes('__SENTRY_DSN__') && !before.includes('__RELEASE_SHA__')) continue;
  const after = before
    .replaceAll('__SENTRY_DSN__',  sentryDsn)
    .replaceAll('__RELEASE_SHA__', sha);
  writeFileSync(path, after);
  bundlesRewritten++;
}
console.log(`[inject-version] rewrote sentinels in ${bundlesRewritten}/${bundleCount} JS bundle(s); SENTRY_DSN=${sentryDsn ? 'set' : 'EMPTY (SDK will no-op)'}`);
