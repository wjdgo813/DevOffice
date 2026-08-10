'use strict';

// 훅 공통 유틸.
//
// 훅은 조용히 실패하면 아무도 모른다. 그래서 모든 훅은
// 어떤 예외가 나도 세션을 망가뜨리지 않고 그냥 통과시킨다 (fail-open).
// 안전장치가 제품을 못 쓰게 만드는 것이 가장 나쁜 결과다.

const fs = require('fs');
const path = require('path');

function readInput() {
  let raw = '';
  try {
    raw = fs.readFileSync(0, 'utf8');
  } catch (_) {
    return {};
  }
  try {
    return JSON.parse(raw || '{}');
  } catch (_) {
    return {};
  }
}

/** 훅 본체를 감싼다. 예외가 나면 조용히 통과시킨다. */
function safely(fn) {
  try {
    const input = readInput();
    fn(input);
  } catch (_) {
    // 훅의 버그로 사용자를 막지 않는다
  }
  process.exit(0);
}

function emit(payload) {
  process.stdout.write(`${JSON.stringify(payload)}\n`);
}

/** 도구 호출을 막는다. 이유는 Claude가 읽고 사용자에게 번역해준다. */
function deny(reason) {
  emit({
    hookSpecificOutput: {
      hookEventName: 'PreToolUse',
      permissionDecision: 'deny',
      permissionDecisionReason: reason,
    },
  });
  process.exit(0);
}

/** .devoffice/ 를 가진 폴더를 위로 올라가며 찾는다. */
function findProject(from) {
  let dir = path.resolve(from || process.cwd());
  while (true) {
    if (fs.existsSync(path.join(dir, '.devoffice'))) return dir;
    const parent = path.dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
}

function loadState(root) {
  try {
    return JSON.parse(fs.readFileSync(path.join(root, '.devoffice', 'state.json'), 'utf8'));
  } catch (_) {
    return null;
  }
}

module.exports = { readInput, safely, emit, deny, findProject, loadState };
