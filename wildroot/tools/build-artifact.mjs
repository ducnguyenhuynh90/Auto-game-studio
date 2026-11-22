// Builds dist/ then writes dist/wildroot-artifact.html: one file, JS inlined, no document
// skeleton (the claude.ai Artifact host adds its own).
import { execSync } from 'node:child_process';
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
execSync('npx vite build', { cwd: root, stdio: 'inherit' });
const dist = join(root, 'dist');
let html = readFileSync(join(dist, 'index.html'), 'utf8');
const js = readdirSync(join(dist, 'assets')).find((f) => f.endsWith('.js'));
const code = readFileSync(join(dist, 'assets', js), 'utf8').replace(/<\/script/g, '<\\/script');
html = html
  .replace(/<script type="module" crossorigin src="[^"]+"><\/script>/, '')
  .replace('</body>', `<script type="module">${code}</script>\n</body>`)
  .replace(/<!doctype html>\s*/i, '')
  .replace(/<html[^>]*>\s*/, '').replace(/<\/html>\s*/, '')
  .replace(/<head>\s*/, '').replace(/<\/head>\s*/, '')
  .replace(/<body>\s*/, '').replace(/<\/body>\s*/, '')
  .replace(/<meta charset="utf-8">\s*/, '')
  .replace(/<meta name="viewport"[^>]*>\s*/, '');
writeFileSync(join(dist, 'wildroot-artifact.html'), html);
console.log('wrote', join(dist, 'wildroot-artifact.html'), `${(html.length / 1024).toFixed(0)} KB`);
