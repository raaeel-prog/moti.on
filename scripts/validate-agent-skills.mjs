#!/usr/bin/env node
import { validateSkillPack } from './skills-lib.mjs';

const result = await validateSkillPack(process.cwd());

if (result.warnings.length) {
  console.log(`Warnings (${result.warnings.length}):`);
  for (const warning of result.warnings) console.log(`- ${warning}`);
}

if (result.errors.length) {
  console.error(`Agent skill validation failed with ${result.errors.length} issue(s):`);
  for (const error of result.errors) console.error(`- ${error}`);
  process.exit(1);
}

console.log(`Validated ${result.skills.length} skills, ${result.files} skill files, ${result.evalCases} routing evals, and the Claude mirror.`);
