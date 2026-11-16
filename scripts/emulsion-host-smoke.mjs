import { spawn } from 'node:child_process';
import { existsSync, readFileSync, mkdirSync, createWriteStream, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const marker='C:/dev/artifact-transitions-study-20261103/logs/build-final-ready.txt';
const exe='C:/Program Files/Adobe/Adobe After Effects 2026/Support Files/AfterFX.com';
const fixture=path.join(root,'artifacts/emulsion-native/v2-smoke.jsx');
const artifacts=path.join(root,'artifacts/emulsion-native');
mkdirSync(artifacts,{recursive:true});
if(!existsSync(marker)) throw new Error('Root build-ready marker missing; do not launch against an old host bundle.');
if(!existsSync(exe)) throw new Error(`AfterFX.com missing: ${exe}`);
const started=Date.now();
const stdout=createWriteStream(path.join(artifacts,'launcher.stdout.log'));
const stderr=createWriteStream(path.join(artifacts,'launcher.stderr.log'));
const child=spawn(exe,['-m','-r',fixture],{cwd:root,windowsHide:true,stdio:['ignore','pipe','pipe']});
child.stdout.pipe(stdout);child.stderr.pipe(stderr);
process.stdout.write(`Launched isolated AfterFX.com PID ${child.pid}; protected user PID 24736 is untouched.\n`);
const timer=setTimeout(()=>{process.stderr.write('Timeout: native fixture exceeded 8 minutes. No user process will be terminated. Inspect owned isolated process and artifact logs.\n');process.exitCode=2;child.unref();},8*60*1000);
child.on('error',error=>{clearTimeout(timer);process.stderr.write(`${error.message}\n`);process.exitCode=1;});
child.on('exit',(code,signal)=>{
  clearTimeout(timer);stdout.end();stderr.end();
  const statusFile=path.join(artifacts,'status.txt');
  const status=existsSync(statusFile)&&statSync(statusFile).mtimeMs>=started?readFileSync(statusFile,'utf8'):'NO FRESH STATUS';
  process.stdout.write(`Launcher exit=${code} signal=${signal}; native status:\n${status}\n`);
  const latest=path.join(artifacts,'latest.json');
  if(existsSync(latest)&&statSync(latest).mtimeMs>=started){const report=JSON.parse(readFileSync(latest,'utf8').replace(/^\uFEFF/,''));for(const row of report.rows)process.stdout.write(`${row.status} | ${row.name} | ${row.details}\n`);if(report.fatal)process.stdout.write(`FATAL | ${report.fatal}\n`);process.exitCode=report.overall==='PASS'?0:1;}else process.exitCode=1;
});
