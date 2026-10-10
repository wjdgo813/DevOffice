'use strict';

// Provider-independent safety decisions for Claude Code and Codex hooks.

const path = require('path');
const { execFileSync } = require('child_process');

const SECRET_FILES = /(^|\/)\.env(\.|$)|(^|\/)(id_rsa|id_ed25519)$|\.pem$|(^|\/)secrets?\.(json|ya?ml)$/i;
const SECRET_VALUE = [
  /\bsk-[A-Za-z0-9_-]{16,}/,
  /\bsk-ant-[A-Za-z0-9_-]{16,}/,
  /\bghp_[A-Za-z0-9]{20,}/,
  /\bAKIA[0-9A-Z]{16}\b/,
  /\beyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\./,
];
const DESTRUCTIVE = [
  /\bdrop\s+(table|database|schema)\b/i,
  /\btruncate\s+table\b/i,
  /\bdelete\s+from\s+\w+\s*;?\s*$/i,
  /\bsupabase\s+db\s+reset\b/i,
  /\bprisma\s+migrate\s+reset\b/i,
  /\bdb\s+push\s+.*--force-reset/i,
];
const CONTRACT_WRITERS = new Set(['cto', 'fixer']);

function stagedSecrets(cwd) {
  try {
    const out = execFileSync('git', ['diff', '--cached', '--name-only'], {
      cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], timeout: 5000,
    });
    return out.split('\n').map((s) => s.trim()).filter((file) => file && SECRET_FILES.test(file));
  } catch (_) {
    return [];
  }
}

function checkBash(input, root, state) {
  const command = String((input.tool_input && input.tool_input.command) || '');
  if (!command) return null;

  if (/\bgit\s+(commit|push)\b/.test(command)) {
    const leaked = stagedSecrets(input.cwd || root);
    if (leaked.length) {
      return (
        `비밀번호가 담긴 파일이 함께 올라가려고 합니다: ${leaked.join(', ')}\n` +
        '한 번 인터넷에 올라가면 되돌릴 수 없습니다. ' +
        '.gitignore 에 추가하고 git rm --cached 로 제외한 뒤 다시 시도하세요.\n' +
        '사용자에게는 "비밀번호가 새어나갈 뻔해서 막았어요"라고 쉬운 말로 알려주세요.'
      );
    }
  }

  const hasRealData = state && state.production && state.production.hasRealData;
  if (hasRealData && DESTRUCTIVE.some((pattern) => pattern.test(command))) {
    return (
      '실제 사용자 데이터가 있는 상태에서 데이터를 지우는 명령입니다.\n' +
      '먼저 백업을 만들고, 사용자에게 무엇이 사라지는지 설명하고 확인을 받으세요.\n' +
      '사용자 확인 없이는 실행할 수 없습니다.'
    );
  }
  return null;
}

function patchTargets(patch) {
  const found = [];
  const patterns = [
    /^\*\*\* (?:Add|Update|Delete) File:\s*(.+?)\s*$/gm,
    /^\*\*\* Move to:\s*(.+?)\s*$/gm,
    /^\+\+\+ b\/(.+?)\s*$/gm,
  ];
  for (const pattern of patterns) {
    for (const match of patch.matchAll(pattern)) found.push(match[1].replace(/^['"]|['"]$/g, ''));
  }
  return [...new Set(found)];
}

function writeTargets(input) {
  const tool = input.tool_name;
  const toolInput = input.tool_input || {};
  if (tool === 'apply_patch') {
    const patch = String(toolInput.command || toolInput.patch || '');
    const additions = patch.split(/\r?\n/)
      .filter((line) => line.startsWith('+') && !line.startsWith('+++'))
      .map((line) => line.slice(1)).join('\n');
    return patchTargets(patch).map((file_path) => ({ file_path, content: additions || patch }));
  }
  if (!['Write', 'Edit', 'NotebookEdit'].includes(tool)) return [];
  const filePath = toolInput.file_path || toolInput.path;
  return filePath ? [{
    file_path: filePath,
    content: String(toolInput.content || toolInput.new_string || ''),
  }] : [];
}

function checkWrite(input, root, target) {
  const abs = path.isAbsolute(target.file_path)
    ? path.resolve(target.file_path)
    : path.resolve(input.cwd || process.cwd(), target.file_path);
  const body = String(target.content || '');

  if (body && !/\.env/.test(abs) && SECRET_VALUE.some((pattern) => pattern.test(body))) {
    return (
      '코드 안에 비밀번호(API 키)가 그대로 들어 있습니다.\n' +
      '.env.local 에 넣고 코드에서는 이름으로만 불러오세요. ' +
      '이대로 저장하면 나중에 인터넷에 함께 올라갑니다.'
    );
  }

  const rel = path.relative(root, abs);
  const outside = rel.startsWith('..') || path.isAbsolute(rel);
  const pluginRoot = process.env.CLAUDE_PLUGIN_ROOT || process.env.PLUGIN_ROOT;
  const pluginRel = pluginRoot ? path.relative(pluginRoot, abs) : '..';
  const inPlugin = pluginRoot && !pluginRel.startsWith('..') && !path.isAbsolute(pluginRel);
  if (outside && !inPlugin) {
    return (
      `제품 폴더 밖의 파일을 고치려 합니다: ${abs}\n` +
      '제품과 관계없는 파일은 건드리지 않습니다. ' +
      '정말 필요하면 사용자에게 무엇을 왜 고치는지 설명하고 직접 허락을 받으세요.'
    );
  }

  return null;
}

function checkContractOwnership(input, root, filePath) {
  const abs = path.isAbsolute(filePath)
    ? path.resolve(filePath)
    : path.resolve(input.cwd || process.cwd(), filePath);
  const rel = path.relative(root, abs);
  if (!/^packages[/\\]contracts[/\\]/.test(rel)) return null;

  const who = input.agent_type;
  // Claude supplies agent_type on the tool event. Codex's documented
  // PreToolUse payload does not, so this role-level check is conditional there.
  if (!who || CONTRACT_WRITERS.has(who)) return null;

  return (
    `약속(계약) 파일은 기술 총괄만 고칠 수 있습니다: ${rel}\n` +
    '서버와 화면이 각자 고치면 약속이 다시 갈라집니다.\n' +
    '계약이 잘못됐다고 판단되면 고치지 말고 블로커를 남기세요 ' +
    '(devoffice task block <ID> --type SPEC_WRONG).'
  );
}

function evaluate(input, root, state) {
  const tool = input.tool_name;
  if (tool === 'Bash' || tool === 'PowerShell') return checkBash(input, root, state);

  for (const target of writeTargets(input)) {
    const ownership = checkContractOwnership(input, root, target.file_path);
    if (ownership) return ownership;
    const write = checkWrite(input, root, target);
    if (write) return write;
  }
  return null;
}

module.exports = { evaluate, patchTargets, writeTargets };
