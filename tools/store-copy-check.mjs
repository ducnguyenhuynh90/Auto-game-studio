// Checks store/listing.md against the App Store / Google Play character limits.
// Each field is the first `code` or ``` block after its bold label.
import { readFileSync } from 'node:fs';

const md = readFileSync('store/listing.md', 'utf8');
const LIMITS = [
  // [section heading, label, limit]
  ['App Store Connect (English', 'Name', 30],
  ['App Store Connect (English', 'Subtitle', 30],
  ['App Store Connect (English', 'Promotional text', 170],
  ['App Store Connect (English', 'Keywords', 100],
  ['App Store Connect (English', 'Description', 4000],
  ['App Store Connect (English', "What's New", 4000],
  ['App Store Connect (Vietnamese', 'Tên', 30],
  ['App Store Connect (Vietnamese', 'Phụ đề', 30],
  ['App Store Connect (Vietnamese', 'Văn bản quảng cáo', 170],
  ['App Store Connect (Vietnamese', 'Từ khóa', 100],
  ['App Store Connect (Vietnamese', 'Mô tả', 4000],
  ['Google Play Console', 'App name', 30],
  ['Google Play Console', 'Short description', 80],
];

let bad = 0;
for (const [section, label, limit] of LIMITS) {
  const from = md.indexOf(`## ${section}`);
  const at = md.indexOf(`**${label}**`, from);
  if (from < 0 || at < 0) {
    console.log(`missing: ${section} / ${label}`);
    bad++;
    continue;
  }
  const rest = md.slice(at);
  const block = rest.match(/```\n([\s\S]*?)\n```/);
  const inline = rest.split('\n')[0].match(/`([^`]+)`/);
  const text = inline ? inline[1] : block[1];
  const n = [...text].length; // both stores count characters, not bytes
  const ok = n <= limit;
  if (!ok) bad++;
  console.log(`${ok ? 'ok ' : 'TOO LONG'} ${String(n).padStart(4)}/${limit}  ${section.replace('App Store Connect ', 'AS ')} · ${label}`);
}
// Apple combines name + subtitle + keywords: repeating a word wastes keyword characters
const field = (label) => md.slice(md.indexOf(`**${label}**`)).split('\n')[0].match(/`([^`]+)`/)?.[1] ?? '';
const kw = md.slice(md.indexOf('**Keywords**')).match(/```\n([\s\S]*?)\n```/)[1].split(',');
const used = new Set(`${field('Name')} ${field('Subtitle')}`.toLowerCase().split(/[^a-zà-ỹđ]+/i));
const dup = kw.filter((k) => used.has(k.toLowerCase()));
if (dup.length) {
  console.log('keywords repeat the name/subtitle:', dup.join(', '));
  bad++;
}
if (kw.some((k) => k !== k.trim())) {
  console.log('keywords: no spaces around commas');
  bad++;
}
process.exit(bad ? 1 : 0);
