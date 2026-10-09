// Bump the service-worker version in both sw.js and js/main.js (single command).
// Usage: npm run bump:sw -- gv-v6
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const next = process.argv[2];
if(!next || !/^gv-v\d+$/.test(next)){
  console.error('Usage: npm run bump:sw -- gv-v6');
  process.exit(1);
}
for(const [file, pattern] of [
  ['sw.js', /const V = '[^']+'/],
  ['js/main.js', /APP_SW_VERSION = '[^']+'/],
]){
  const p = path.join(root, file);
  const src = fs.readFileSync(p, 'utf8');
  const replacement = file === 'sw.js' ? `const V = '${next}'` : `APP_SW_VERSION = '${next}'`;
  if(!pattern.test(src)){ console.error(`${file}: version constant not found`); process.exit(1); }
  fs.writeFileSync(p, src.replace(pattern, replacement));
  console.log(`${file} -> ${next}`);
}
