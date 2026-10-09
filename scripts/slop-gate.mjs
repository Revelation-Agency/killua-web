/**
 * Copy gate: SlopMonster's deslop.py over every marketing page and every
 * creative/*.md file. Anything below 5/5 fails. Run after `npm run build`.
 */
import { spawnSync } from 'node:child_process';
import { existsSync, readdirSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

const PY = process.env.PYTHON || (process.platform === 'win32' ? 'python' : 'python3');
const SKIP = ['solar', 'roofing', 'recruiting', 'maintenance', 'company', 'cockpit'];
const walk = (d) => readdirSync(d).flatMap((e) => (statSync(join(d, e)).isDirectory() ? walk(join(d, e)) : [join(d, e)]));

const files = [
  ...walk('dist').filter((f) => f.endsWith('index.html') && !SKIP.includes(relative('dist', f).split(sep)[0])),
  ...(existsSync('creative') ? walk('creative').filter((f) => f.endsWith('.md') && !f.endsWith('prompts.md')) : []),
];
let bad = 0;
for (const f of files) {
  const r = spawnSync(PY, ['scripts/slop/deslop.py', f], { encoding: 'utf8', env: { ...process.env, PYTHONIOENCODING: 'utf-8' } });
  const score = (r.stdout.match(/score (\d)\/5/) || [])[1] ?? '?';
  console.log(`  ${score === '5' ? 'PASS' : 'FAIL'}  ${score}/5  ${f}`);
  if (r.status !== 0) {
    bad += 1;
    console.log(r.stdout.split('\n').slice(2, 14).join('\n'));
  }
}
console.log(bad ? `\n${bad} file(s) below 5/5.\n` : `\nAll ${files.length} files at 5/5.\n`);
process.exit(bad ? 1 : 0);
