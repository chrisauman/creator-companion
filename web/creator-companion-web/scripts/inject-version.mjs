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
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const distHtml = join('dist', 'creator-companion-web', 'browser', 'index.html');

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
