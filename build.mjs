// Copies app/ to dist/ and stamps the committed sha into the page (R6).
import { execFileSync } from 'node:child_process';
import { cpSync, readFileSync, writeFileSync, rmSync } from 'node:fs';

const status = execFileSync('git', ['status', '--porcelain', 'app']).toString().trim();
if (status) throw new Error(`app/ has uncommitted changes; commit before building:\n${status}`);
const sha = execFileSync('git', ['rev-parse', 'HEAD']).toString().trim();
rmSync('dist', { recursive: true, force: true });
cpSync('app', 'dist', { recursive: true });
const page = readFileSync('dist/index.html', 'utf8').replaceAll('__BUILD_SHA__', sha);
writeFileSync('dist/index.html', page);
console.log(`dist/ built at ${sha}`);
