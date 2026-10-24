// Builds a single self-contained HTML page (JS inlined) for publishing as a claude.ai Artifact.
// The Artifact skeleton supplies <!doctype>/<html>/<head>/<body>, so we emit only page content.
import { execSync } from 'node:child_process';
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';

execSync('npx vite build', { stdio: 'inherit' });
const html = readFileSync('dist/index.html', 'utf8');
const jsFile = readdirSync('dist/assets').find((f) => f.endsWith('.js'));
const js = readFileSync(`dist/assets/${jsFile}`, 'utf8').replace(/<\/script/gi, '<\\/script');
const title = html.match(/<title>.*?<\/title>/s)[0];
const style = html.match(/<style>.*?<\/style>/s)[0];
const body = html.match(/<body>(.*?)<\/body>/s)[1].replace(/<script[^>]*src=[^>]*><\/script>/g, '').trim();
const out = `${title}\n${style}\n${body}\n<script type="module">${js}</script>\n`;
mkdirSync('dist-artifact', { recursive: true });
writeFileSync('dist-artifact/mam-village.html', out);
console.log(`dist-artifact/mam-village.html ${(out.length / 1024).toFixed(0)} KB`);
