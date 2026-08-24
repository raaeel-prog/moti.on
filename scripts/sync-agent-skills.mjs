import { cp, mkdir, rm } from 'node:fs/promises';
import { resolve } from 'node:path';

const root = resolve(process.cwd());
const source = resolve(root, '.agents', 'skills');
const target = resolve(root, '.claude', 'skills');

await mkdir(resolve(root, '.claude'), { recursive: true });
await rm(target, { recursive: true, force: true });
await cp(source, target, { recursive: true, force: true });
console.log(`Synced ${source} -> ${target}`);
