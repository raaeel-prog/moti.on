import { createHash } from 'node:crypto';
import { access, readdir, readFile, stat } from 'node:fs/promises';
import path from 'node:path';

export const CANONICAL_ROOT = '.agents/skills';
export const MIRROR_ROOT = '.claude/skills';

export async function exists(filePath) {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

export async function listFiles(root) {
  const output = [];
  if (!(await exists(root))) return output;

  async function walk(current, relative = '') {
    const entries = await readdir(current, { withFileTypes: true });
    entries.sort((a, b) => a.name.localeCompare(b.name));
    for (const entry of entries) {
      const absolute = path.join(current, entry.name);
      const rel = path.join(relative, entry.name).split(path.sep).join('/');
      if (entry.isDirectory()) await walk(absolute, rel);
      else if (entry.isFile()) output.push(rel);
    }
  }

  await walk(root);
  return output;
}

export function sha256(buffer) {
  return createHash('sha256').update(buffer).digest('hex');
}

export function parseFrontmatter(text, filePath) {
  if (!text.startsWith('---\n')) throw new Error(`${filePath}: missing opening YAML frontmatter`);
  const end = text.indexOf('\n---\n', 4);
  if (end < 0) throw new Error(`${filePath}: missing closing YAML frontmatter`);

  const data = {};
  for (const line of text.slice(4, end).split(/\r?\n/)) {
    const match = line.match(/^([A-Za-z0-9_-]+):\s*(.*)$/);
    if (!match) continue;
    let value = match[2].trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    data[match[1]] = value;
  }
  return { data, body: text.slice(end + 5) };
}

async function validateRelativeLinks(text, filePath, errors, root) {
  const linkPattern = /\[[^\]]+\]\(([^)]+)\)/g;
  for (const match of text.matchAll(linkPattern)) {
    const target = match[1];
    if (/^(https?:|mailto:|#)/.test(target)) continue;
    const clean = target.split('#')[0];
    if (!clean) continue;
    const resolved = path.resolve(path.dirname(filePath), clean);
    try {
      await stat(resolved);
    } catch {
      errors.push(`${path.relative(root, filePath)}: broken relative link ${target}`);
    }
  }
}

export async function validateSkillPack(root = process.cwd()) {
  const errors = [];
  const warnings = [];
  const canonicalRoot = path.resolve(root, CANONICAL_ROOT);
  const mirrorRoot = path.resolve(root, MIRROR_ROOT);
  const manifestPath = path.resolve(root, 'skills-manifest.json');
  const evalPath = path.resolve(root, 'evals/skill-routing.json');

  if (!(await exists(canonicalRoot))) errors.push(`Missing canonical root: ${CANONICAL_ROOT}`);
  if (!(await exists(mirrorRoot))) errors.push(`Missing Claude mirror: ${MIRROR_ROOT}`);
  if (!(await exists(manifestPath))) errors.push('Missing skills-manifest.json');
  if (!(await exists(evalPath))) errors.push('Missing evals/skill-routing.json');
  if (errors.length) return { errors, warnings, skills: [], files: 0, evalCases: 0 };

  const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
  const manifestEntries = Array.isArray(manifest.skills) ? manifest.skills : [];
  const declaredNames = manifestEntries.map((entry) => typeof entry === 'string' ? entry : entry.name).sort();
  const skillDirs = (await readdir(canonicalRoot, { withFileTypes: true }))
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();

  if (JSON.stringify(declaredNames) !== JSON.stringify(skillDirs)) {
    errors.push('skills-manifest.json names differ from canonical skill directories');
  }

  const namePattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
  const seenNames = new Set();

  for (const directoryName of skillDirs) {
    const skillDir = path.join(canonicalRoot, directoryName);
    const skillFile = path.join(skillDir, 'SKILL.md');
    if (!(await exists(skillFile))) {
      errors.push(`${directoryName}: missing SKILL.md`);
      continue;
    }

    const text = await readFile(skillFile, 'utf8');
    let parsed;
    try {
      parsed = parseFrontmatter(text, skillFile);
    } catch (error) {
      errors.push(error.message);
      continue;
    }

    const { data, body } = parsed;
    const name = data.name || '';
    const description = data.description || '';
    const lines = text.split(/\r?\n/).length;

    if (name !== directoryName) errors.push(`${directoryName}: frontmatter name must match directory`);
    if (!namePattern.test(name) || name.length > 64) errors.push(`${directoryName}: invalid skill name`);
    if (seenNames.has(name)) errors.push(`${directoryName}: duplicate skill name`);
    seenNames.add(name);
    if (description.length < 40 || description.length > 420) {
      errors.push(`${directoryName}: description must be 40-420 characters for reliable routing`);
    }
    if (!/Use (for|when|before|after)|Use this skill|Use whenever/i.test(description)) {
      warnings.push(`${directoryName}: description may not state trigger conditions clearly`);
    }
    if (body.trim().length < 900) errors.push(`${directoryName}: skill body is too small to be operational`);
    if (lines > 500) errors.push(`${directoryName}: SKILL.md exceeds 500 lines; move details to references`);
    if (!body.includes('## ')) errors.push(`${directoryName}: skill body lacks structured sections`);

    await validateRelativeLinks(text, skillFile, errors, root);

    const metadataPath = path.join(skillDir, 'agents', 'openai.yaml');
    if (!(await exists(metadataPath))) {
      errors.push(`${directoryName}: missing agents/openai.yaml`);
    } else {
      const metadata = await readFile(metadataPath, 'utf8');
      if (!metadata.includes('display_name:')) errors.push(`${directoryName}: openai.yaml missing display_name`);
      if (!metadata.includes('short_description:')) errors.push(`${directoryName}: openai.yaml missing short_description`);
      if (!metadata.includes('default_prompt:')) errors.push(`${directoryName}: openai.yaml missing default_prompt`);
      if (!metadata.includes(`$${directoryName}`)) errors.push(`${directoryName}: default_prompt must explicitly invoke $${directoryName}`);
      if (!metadata.includes('allow_implicit_invocation:')) errors.push(`${directoryName}: openai.yaml missing invocation policy`);
    }
  }

  const canonicalFiles = await listFiles(canonicalRoot);
  const mirrorFiles = await listFiles(mirrorRoot);
  if (JSON.stringify(canonicalFiles) !== JSON.stringify(mirrorFiles)) {
    errors.push(`${MIRROR_ROOT}: file list differs from ${CANONICAL_ROOT}; run npm run skills:sync`);
  } else {
    for (const relative of canonicalFiles) {
      const [a, b] = await Promise.all([
        readFile(path.join(canonicalRoot, relative)),
        readFile(path.join(mirrorRoot, relative)),
      ]);
      if (sha256(a) !== sha256(b)) errors.push(`${MIRROR_ROOT}/${relative}: content differs from canonical`);
    }
  }

  const evals = JSON.parse(await readFile(evalPath, 'utf8'));
  const evalCases = Array.isArray(evals.cases) ? evals.cases : [];
  const seenEvalIds = new Set();
  const coverage = new Map(skillDirs.map((name) => [name, { positive: 0, negative: 0 }]));

  for (const testCase of evalCases) {
    if (!testCase.id || seenEvalIds.has(testCase.id)) errors.push(`Invalid or duplicate eval id: ${testCase.id || '<missing>'}`);
    seenEvalIds.add(testCase.id);
    if (!seenNames.has(testCase.skill)) errors.push(`Eval ${testCase.id}: unknown skill ${testCase.skill}`);
    if (typeof testCase.shouldTrigger !== 'boolean') errors.push(`Eval ${testCase.id}: shouldTrigger must be boolean`);
    if (typeof testCase.prompt !== 'string' || testCase.prompt.length < 20) errors.push(`Eval ${testCase.id}: prompt is missing or too short`);
    const item = coverage.get(testCase.skill);
    if (item) testCase.shouldTrigger ? item.positive++ : item.negative++;
  }

  for (const [skill, counts] of coverage) {
    if (counts.positive < 2 || counts.negative < 1) {
      errors.push(`${skill}: routing eval coverage requires at least 2 positive and 1 negative case`);
    }
  }

  const designFiles = [
    path.resolve(root, 'docs/UI_FOUNDATION.md'),
    path.resolve(root, 'shared/crosshost.tokens.css'),
    path.resolve(root, 'shared/crosshost.tokens.json'),
    path.resolve(root, 'shared/product-ui-profile.json'),
  ];
  for (const file of designFiles) {
    if (!(await exists(file))) errors.push(`Missing design foundation file: ${path.relative(root, file)}`);
  }
  if (await exists(designFiles[0])) {
    const uiFoundation = await readFile(designFiles[0], 'utf8');
    if (!uiFoundation.includes('#1D1D1D')) errors.push('UI foundation must preserve dashboard background #1D1D1D');
    for (const banned of ['glassmorphism', 'dashboard SaaS', 'gradiente decorativo']) {
      if (!uiFoundation.toLowerCase().includes(banned.toLowerCase())) warnings.push(`UI foundation may be missing anti-pattern: ${banned}`);
    }
  }

  return {
    errors,
    warnings,
    skills: skillDirs,
    files: canonicalFiles.length,
    evalCases: evalCases.length,
  };
}
