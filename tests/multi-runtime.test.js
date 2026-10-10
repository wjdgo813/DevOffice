'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const test = require('node:test');

const ROOT = path.resolve(__dirname, '..');
const HOOKS = path.join(ROOT, 'hooks');

function fixture(t, state) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'devoffice-runtime-'));
  fs.mkdirSync(path.join(root, '.devoffice'), { recursive: true });
  fs.writeFileSync(path.join(root, '.devoffice', 'state.json'), JSON.stringify(state || {}));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  return root;
}

function runHook(script, input, env = {}) {
  const result = spawnSync(process.execPath, [script], {
    cwd: ROOT,
    input: JSON.stringify(input),
    encoding: 'utf8',
    env: { ...process.env, ...env },
  });
  assert.equal(result.status, 0, result.stderr || `hook exited ${result.status}`);
  return result.stdout.trim() ? JSON.parse(result.stdout) : null;
}

test('Claude Code still receives the same denial shape for destructive commands', (t) => {
  const root = fixture(t, { production: { hasRealData: true } });
  const result = runHook(path.join(HOOKS, 'guard.js'), {
    cwd: root,
    tool_name: 'Bash',
    tool_input: { command: 'drop table users;' },
  });
  assert.equal(result.hookSpecificOutput.hookEventName, 'PreToolUse');
  assert.equal(result.hookSpecificOutput.permissionDecision, 'deny');
  assert.match(result.hookSpecificOutput.permissionDecisionReason, /실제 사용자 데이터/);
});

test('Codex apply_patch passes through the same secret and outside-root policy', (t) => {
  const root = fixture(t);
  const secret = runHook(path.join(HOOKS, 'adapters/codex/guard.js'), {
    cwd: root,
    tool_name: 'apply_patch',
    tool_input: {
      command: '*** Begin Patch\n*** Add File: src/key.js\n+const key = "sk-ant-12345678901234567890";\n*** End Patch',
    },
  });
  assert.equal(secret.hookSpecificOutput.permissionDecision, 'deny');
  assert.match(secret.hookSpecificOutput.permissionDecisionReason, /비밀번호/);

  const outside = path.join(root, '..', 'outside-file.js');
  const blocked = runHook(path.join(HOOKS, 'adapters/codex/guard.js'), {
    cwd: root,
    tool_name: 'apply_patch',
    tool_input: { command: `*** Begin Patch\n*** Add File: ${outside}\n+safe\n*** End Patch` },
  });
  assert.equal(blocked.hookSpecificOutput.permissionDecision, 'deny');
  assert.match(blocked.hookSpecificOutput.permissionDecisionReason, /제품 폴더 밖/);
});

test('Codex can patch the installed plugin root without treating it as product data', (t) => {
  const root = fixture(t);
  const target = path.join(ROOT, 'hooks', 'guard.js');
  const result = runHook(path.join(HOOKS, 'adapters/codex/guard.js'), {
    cwd: root,
    tool_name: 'apply_patch',
    tool_input: { command: `*** Begin Patch\n*** Update File: ${target}\n-safe\n+safe\n*** End Patch` },
  }, { PLUGIN_ROOT: ROOT });
  assert.equal(result, null);
});

test('Claude role ownership enforcement is preserved; Codex role attribution is unavailable', (t) => {
  const root = fixture(t);
  const file = path.join(root, 'packages/contracts/feature.ts');
  const claude = runHook(path.join(HOOKS, 'guard.js'), {
    cwd: root,
    agent_type: 'backend',
    tool_name: 'Edit',
    tool_input: { file_path: file, new_string: 'export type X = string;' },
  });
  assert.equal(claude.hookSpecificOutput.permissionDecision, 'deny');

  const codex = runHook(path.join(HOOKS, 'adapters/codex/guard.js'), {
    cwd: root,
    tool_name: 'apply_patch',
    tool_input: { command: `*** Begin Patch\n*** Add File: ${file}\n+export type X = string;\n*** End Patch` },
  });
  assert.equal(codex, null);
});

test('error explanations share wording while emitting runtime-specific events', (t) => {
  const root = fixture(t);
  const claude = runHook(path.join(HOOKS, 'translate-error.js'), {
    cwd: root,
    tool_result: { stderr: 'EADDRINUSE: address already in use' },
  });
  assert.equal(claude.hookSpecificOutput.hookEventName, 'PostToolUseFailure');
  assert.match(claude.hookSpecificOutput.additionalContext, /기존 것을 끄고 다시 띄우면 됩니다/);

  const codex = runHook(path.join(HOOKS, 'adapters/codex/translate-error.js'), {
    cwd: root,
    tool_response: { stderr: 'EADDRINUSE: address already in use' },
  });
  assert.equal(codex.hookSpecificOutput.hookEventName, 'PostToolUse');
  assert.match(codex.hookSpecificOutput.additionalContext, /기존 것을 끄고 다시 띄우면 됩니다/);
});

test('stop reminders keep shared wording and Codex continuation does not loop', (t) => {
  const root = fixture(t, {
    currentFeature: {
      id: 'F-001',
      title: '로그인',
      gates: { userVerified: false },
      tasks: [{ status: 'done' }],
      blockers: [],
    },
  });

  const claude = runHook(path.join(HOOKS, 'check-lock.js'), { cwd: root });
  assert.equal(claude.hookSpecificOutput.hookEventName, 'Stop');
  assert.match(claude.hookSpecificOutput.additionalContext, /사용자 확인을 아직 못 받았다/);

  fs.unlinkSync(path.join(root, '.devoffice', '.nudge'));
  const codex = runHook(path.join(HOOKS, 'adapters/codex/check-lock.js'), { cwd: root });
  assert.equal(codex.decision, 'block');
  assert.match(codex.reason, /사용자 확인을 아직 못 받았다/);
  assert.equal(runHook(path.join(HOOKS, 'adapters/codex/check-lock.js'), { cwd: root }), null);
});

test('Codex session context supplies the installed shared CLI path', (t) => {
  const root = fixture(t);
  const result = runHook(path.join(HOOKS, 'adapters/codex/session-start.js'), {
    cwd: root,
    source: 'startup',
  }, { PLUGIN_ROOT: ROOT });
  assert.equal(result.hookSpecificOutput.hookEventName, 'SessionStart');
  assert.match(result.hookSpecificOutput.additionalContext, /bin\\\\devoffice|bin\/devoffice/);
  assert.match(result.hookSpecificOutput.additionalContext, /node .* status/);
});

test('generated Codex package points at the shared and generated role skills', () => {
  const plugin = JSON.parse(fs.readFileSync(path.join(ROOT, 'plugin.json'), 'utf8'));
  const marketplace = JSON.parse(fs.readFileSync(path.join(ROOT, 'marketplace.json'), 'utf8'));
  assert.deepEqual(plugin.skills, ['./skills/', './codex/skills/']);
  assert.equal(plugin.extensions['com.openai'].hooks, './hooks/adapters/codex/hooks.json');
  assert.deepEqual(marketplace.plugins[0].source, { source: 'local', path: './' });
  assert.equal(marketplace.plugins[0].policy.installation, 'AVAILABLE');

  const roleDir = path.join(ROOT, 'codex', 'skills', 'devoffice-role-cto');
  const roleSkill = fs.readFileSync(path.join(roleDir, 'SKILL.md'), 'utf8');
  assert.match(roleSkill, /name: devoffice-role-cto/);
  assert.doesNotMatch(roleSkill, /\$\{CLAUDE_PLUGIN_ROOT\}/);
  const sharedReference = roleSkill.match(/\.\.\/\.\.\/\.\.\/skills\/_shared\/([^`\s]+)/);
  assert.ok(sharedReference, 'generated role skill should reference a shared policy file');
  assert.ok(fs.existsSync(path.join(roleDir, '../../../skills/_shared', sharedReference[1])));
  assert.equal(fs.existsSync(path.join(ROOT, 'skills/devoffice-role-cto/SKILL.md')), false);
});
