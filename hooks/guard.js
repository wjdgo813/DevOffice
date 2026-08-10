#!/usr/bin/env node
'use strict';

// PreToolUse — 되돌릴 수 없는 사고를 막는다 (SAFETY §3.1, §5, §9).
//
// 여기서 막는 것들의 공통점: **일어나면 되돌릴 수 없다.**
//   · 비밀키가 인터넷에 올라가면 회수할 수 없다
//   · 실제 사용자 데이터를 지우면 복구할 수 없다
//
// 프롬프트로 쓴 규칙은 언젠가 어겨진다. 여기서만 확실히 막힌다.

const path = require('path');
const { execFileSync } = require('child_process');
const H = require('./lib/hook');

const SECRET_FILES = /(^|\/)\.env(\.|$)|(^|\/)(id_rsa|id_ed25519)$|\.pem$|(^|\/)secrets?\.(json|ya?ml)$/i;

/** 소스에 그대로 박힌 키. 실제로 자주 일어나는 것만 본다. */
const SECRET_VALUE = [
  /\bsk-[A-Za-z0-9_-]{16,}/,                 // OpenAI 계열
  /\bsk-ant-[A-Za-z0-9_-]{16,}/,             // Anthropic
  /\bghp_[A-Za-z0-9]{20,}/,                  // GitHub PAT
  /\bAKIA[0-9A-Z]{16}\b/,                    // AWS
  /\beyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\./, // JWT (Supabase service key 등)
];

/** 실 데이터가 있을 때 특히 위험한 명령 */
const DESTRUCTIVE = [
  /\bdrop\s+(table|database|schema)\b/i,
  /\btruncate\s+table\b/i,
  /\bdelete\s+from\s+\w+\s*;?\s*$/i,          // WHERE 없는 DELETE
  /\bsupabase\s+db\s+reset\b/i,
  /\bprisma\s+migrate\s+reset\b/i,
  /\bdb\s+push\s+.*--force-reset/i,
];

function stagedSecrets(cwd) {
  try {
    const out = execFileSync('git', ['diff', '--cached', '--name-only'], {
      cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], timeout: 5000,
    });
    return out.split('\n').map((s) => s.trim()).filter((f) => f && SECRET_FILES.test(f));
  } catch (_) {
    return [];
  }
}

function checkBash(input, root, state) {
  const cmd = String((input.tool_input && input.tool_input.command) || '');
  if (!cmd) return;

  // ① 비밀키가 커밋에 섞였는가
  if (/\bgit\s+(commit|push)\b/.test(cmd)) {
    const leaked = stagedSecrets(input.cwd || root);
    if (leaked.length) {
      H.deny(
        `비밀번호가 담긴 파일이 함께 올라가려고 합니다: ${leaked.join(', ')}\n` +
        '한 번 인터넷에 올라가면 되돌릴 수 없습니다. ' +
        '.gitignore 에 추가하고 git rm --cached 로 제외한 뒤 다시 시도하세요.\n' +
        '사용자에게는 "비밀번호가 새어나갈 뻔해서 막았어요"라고 쉬운 말로 알려주세요.'
      );
    }
  }

  // ② 실 데이터가 있는 상태에서의 파괴적 명령 (SAFETY §5.2)
  const hasRealData = state && state.production && state.production.hasRealData;
  if (hasRealData && DESTRUCTIVE.some((re) => re.test(cmd))) {
    H.deny(
      '실제 사용자 데이터가 있는 상태에서 데이터를 지우는 명령입니다.\n' +
      '먼저 백업을 만들고, 사용자에게 무엇이 사라지는지 설명하고 확인을 받으세요.\n' +
      '사용자 확인 없이는 실행할 수 없습니다.'
    );
  }
}

function checkWrite(input, root) {
  const file = (input.tool_input && (input.tool_input.file_path || input.tool_input.path)) || '';
  if (!file) return;
  const abs = path.resolve(file);

  // ③ 비밀키를 소스에 그대로 쓰는가
  const body = String(
    (input.tool_input && (input.tool_input.content || input.tool_input.new_string)) || ''
  );
  if (body && !/\.env/.test(abs) && SECRET_VALUE.some((re) => re.test(body))) {
    H.deny(
      '코드 안에 비밀번호(API 키)가 그대로 들어 있습니다.\n' +
      '.env.local 에 넣고 코드에서는 이름으로만 불러오세요. ' +
      '이대로 저장하면 나중에 인터넷에 함께 올라갑니다.'
    );
  }

  // ④ 제품 상자 밖에 쓰는가 (SAFETY §9)
  const rel = path.relative(root, abs);
  const outside = rel.startsWith('..') || path.isAbsolute(rel);
  const pluginRoot = process.env.CLAUDE_PLUGIN_ROOT;
  const inPlugin = pluginRoot && !path.relative(pluginRoot, abs).startsWith('..');
  if (outside && !inPlugin) {
    H.deny(
      `제품 폴더 밖의 파일을 고치려 합니다: ${abs}\n` +
      '제품과 관계없는 파일은 건드리지 않습니다. ' +
      '정말 필요하면 사용자에게 무엇을 왜 고치는지 설명하고 직접 허락을 받으세요.'
    );
  }
}

H.safely((input) => {
  const root = H.findProject(input.cwd);
  if (!root) return;                  // DevOffice 제품이 아니면 관여하지 않는다
  const state = H.loadState(root);

  const tool = input.tool_name;
  if (tool === 'Bash' || tool === 'PowerShell') return checkBash(input, root, state);
  if (tool === 'Write' || tool === 'Edit' || tool === 'NotebookEdit') {
    return checkWrite(input, root);
  }
});
