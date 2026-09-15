// Static build for the public apps: copies the app + shared brand assets into dist/,
// injects the public API base, and stamps every asset reference with a content hash
// so browsers never serve a stale bundle (Vercel then serves dist/ immutably).
import { cpSync, mkdirSync, readFileSync, writeFileSync, readdirSync, statSync, rmSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..', '..');
const app = process.argv[2]; if (!app) { console.error('usage: node build.mjs <website|player>'); process.exit(1); }
const src = join(root, 'apps', app, 'src'), dist = join(root, 'apps', app, 'dist');
rmSync(dist, { recursive: true, force: true }); mkdirSync(dist, { recursive: true });
cpSync(src, dist, { recursive: true });
cpSync(join(root, 'packages', 'brand', 'assets'), join(dist, 'assets'), { recursive: true });
cpSync(join(root, 'packages', 'brand', 'fonts'), join(dist, 'assets', 'fonts'), { recursive: true });
cpSync(join(root, 'packages', 'brand', 'tokens.css'), join(dist, 'assets', 'tokens.css'));
cpSync(join(root, 'packages', 'shared', 'hg-api.js'), join(dist, 'assets', 'hg-api.js'));
cpSync(join(root, 'packages', 'ui', 'hg-ui.css'), join(dist, 'assets', 'hg-ui.css'));
const apiBase = process.env.HG_API_BASE || 'https://api.hungreegoat.com';
const youtube = process.env.HG_YOUTUBE_URL || '';
const x = process.env.HG_X_URL || '';
const player = process.env.HG_PLAYER_URL || 'https://player.hungreegoat.com';
const home = process.env.HG_HOME_URL || 'https://hungreegoat.com';
writeFileSync(join(dist, 'assets', 'config.js'), `window.HG_API_BASE=${JSON.stringify(apiBase)};window.HG_YOUTUBE_URL=${JSON.stringify(youtube)};window.HG_X_URL=${JSON.stringify(x)};window.HG_PLAYER_URL=${JSON.stringify(player)};window.HG_HOME_URL=${JSON.stringify(home)};\n`);
// content hash of everything except html → version query
const h = createHash('sha1');
(function walk(d) { for (const f of readdirSync(d).sort()) { const p = join(d, f); if (statSync(p).isDirectory()) walk(p); else if (!p.endsWith('.html')) h.update(readFileSync(p)); } })(dist);
const v = h.digest('hex').slice(0, 10);
for (const f of readdirSync(dist)) if (f.endsWith('.html')) { const p = join(dist, f); writeFileSync(p, readFileSync(p, 'utf8').replaceAll('__V__', v)); }
console.log(`built apps/${app} → dist (v=${v}, api=${apiBase})`);
