#!/usr/bin/env node
'use strict';

// Generate the small runtime-specific plugin manifests and Codex role skills.
// Shared workflows, role content, and CLI logic remain authored only once.

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const source = JSON.parse(fs.readFileSync(path.join(ROOT, 'plugin.source.json'), 'utf8'));
const checkOnly = process.argv.includes('--check');

function pretty(value) {
  return `${JSON.stringify(value, null, 2)}\n`;
}

function readAgent(file) {
  const text = fs.readFileSync(file, 'utf8');
  const match = text.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n/);
  if (!match) throw new Error(`${path.relative(ROOT, file)} has no YAML frontmatter`);
  const metadata = match[1];
  const name = metadata.match(/^name:\s*(.+)$/m)?.[1]?.trim();
  const description = metadata.match(/^description:\s*(.+)$/m)?.[1]?.trim();
  if (!name || !description) throw new Error(`${path.relative(ROOT, file)} needs name and description`);
  return { name, description, body: text.slice(match[0].length).trimStart() };
}

function outputSkills() {
  const agentDir = path.join(ROOT, 'agents');
  return fs.readdirSync(agentDir)
    .filter((name) => name.endsWith('.md'))
    .sort()
    .map((fileName) => {
      const agent = readAgent(path.join(agentDir, fileName));
      const skillName = `devoffice-role-${agent.name}`;
      const relativeResources = agent.body.replace(
        /\$\{CLAUDE_PLUGIN_ROOT\}\/skills\/_shared\//g,
        '../../../skills/_shared/'
      );
      const description = `${agent.description} DevOffice delegated role instructions.`;
      const content = [
        '---',
        `name: ${skillName}`,
        `description: ${description}`,
        '---',
        '',
        `<!-- Generated from agents/${fileName}; edit the source agent file. -->`,
        '',
        relativeResources.trimEnd(),
        '',
      ].join('\n');
      return [path.join(ROOT, 'codex', 'skills', skillName, 'SKILL.md'), content];
    });
}

const outputs = new Map();
const codexPlugin = {
  $schema: 'https://agent-plugins.org/schemas/1.0.0/plugin.schema.json',
  name: source.name,
  version: source.version,
  description: source.description,
  author: source.author,
  license: source.license,
  keywords: source.keywords,
  skills: ['./skills/', './codex/skills/'],
  extensions: {
    'com.openai': {
      hooks: source.codex.hooks,
      interface: {
        displayName: source.displayName,
        shortDescription: source.description,
        longDescription: source.description,
        developerName: source.author.name,
        category: 'Productivity',
      },
    },
  },
};

const claudePlugin = {
  $schema: 'https://json.schemastore.org/claude-code-plugin-manifest.json',
  name: source.name,
  displayName: source.displayName,
  version: source.version,
  description: source.description,
  author: source.author,
  license: source.license,
  keywords: source.keywords,
  userConfig: source.claude.userConfig,
};

const claudeMarketplace = {
  name: source.name,
  description: '비개발자가 대화만으로 제품을 만들 수 있게 하는 플러그인 모음',
  owner: source.author,
  plugins: [
    {
      name: source.name,
      source: './',
      description: source.description,
    },
  ],
};

const codexMarketplace = {
  name: `${source.name}-repo`,
  interface: { displayName: source.displayName },
  plugins: [
    {
      name: source.name,
      source: { source: 'local', path: './' },
      policy: {
        installation: source.codex.marketplace.installation,
        authentication: source.codex.marketplace.authentication,
      },
      category: source.codex.marketplace.category,
    },
  ],
};

outputs.set(path.join(ROOT, 'plugin.json'), pretty(codexPlugin));
outputs.set(path.join(ROOT, 'marketplace.json'), pretty(codexMarketplace));
outputs.set(path.join(ROOT, '.claude-plugin', 'plugin.json'), pretty(claudePlugin));
outputs.set(path.join(ROOT, '.claude-plugin', 'marketplace.json'), pretty(claudeMarketplace));
for (const [file, content] of outputSkills()) outputs.set(file, content);

let stale = false;
for (const [file, expected] of outputs) {
  const current = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : null;
  if (current === expected) continue;
  if (checkOnly) {
    process.stderr.write(`stale generated file: ${path.relative(ROOT, file)}\n`);
    stale = true;
    continue;
  }
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, expected, 'utf8');
  process.stdout.write(`generated ${path.relative(ROOT, file)}\n`);
}

if (checkOnly && stale) process.exitCode = 1;
