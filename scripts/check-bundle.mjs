import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const dist = new URL('../dist/', import.meta.url).pathname;
const files = [];
function walk(directory) {
  for (const name of readdirSync(directory)) {
    const path = join(directory, name);
    if (statSync(path).isDirectory()) walk(path);
    else if (name.endsWith('.js')) files.push(path);
  }
}
walk(dist);
if (!files.length) {
  console.error('dist has no JS bundle');
  process.exit(1);
}
const source = files.map((file) => readFileSync(file, 'utf8')).join('\n');
const forbidden = ['better-sqlite3', 'node:fs', 'node:sqlite', 'YCAPPKEY', 'oxygenAutomaticTest', 'setExactAndAllowWhileIdle', '202203251100'];
const hits = forbidden.filter((token) => source.includes(token));
if (hits.length) {
  console.error(`bundle contains forbidden tokens: ${hits.join(', ')}`);
  process.exit(1);
}
if (!source.includes('没有足够的健康记录')) {
  console.error('coach graph text missing from the web bundle');
  process.exit(1);
}
console.log(`bundle ok files=${files.length} bytes=${source.length}`);
