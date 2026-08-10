#!/usr/bin/env node
'use strict';

// SessionStart — 이어하기 (JOURNEY §2.3, D26).
//
// 비개발자는 세션을 자주 닫는다. 그리고 2주 뒤에 돌아오면
// 자기가 뭘 만들었는지도 잊는다. 그래서 두 가지를 한다:
//
//   1. 지금까지의 상태를 컨텍스트에 넣는다 (에이전트를 위해)
//   2. 첫 발화를 대신 넣는다 (사용자가 명령어를 몰라도 되게)
//
// 중요: 남의 폴더를 가로채지 않는다. DevOffice 프로젝트이거나
// 작업 폴더 안일 때만 동작한다.

const path = require('path');
const os = require('os');
const H = require('./lib/hook');

const WORKSPACE = process.env.CLAUDE_PLUGIN_OPTION_WORKSPACE
  || path.join(os.homedir(), 'Documents', 'DevOffice');

function inWorkspace(cwd) {
  const rel = path.relative(path.resolve(WORKSPACE), path.resolve(cwd));
  return rel === '' || (!rel.startsWith('..') && !path.isAbsolute(rel));
}

function daysSince(iso) {
  if (!iso) return 0;
  return Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);
}

function describe(state) {
  const p = state.product || {};
  const done = (state.backlog || []).filter((f) => f.status === 'done');
  const cf = state.currentFeature;
  const gap = daysSince(state.updatedAt);

  const lines = [];
  lines.push('# 진행 중인 제품 (DevOffice)');
  lines.push('');
  lines.push(`제품 이름: ${p.name || '아직 없음'}`);
  if (p.oneLiner) lines.push(`한 줄 정의: ${p.oneLiner}`);
  lines.push(`현재 단계: ${state.phase}`);
  if (gap >= 2) lines.push(`마지막 작업으로부터 ${gap}일 지남`);

  if (done.length) {
    lines.push('');
    lines.push('지금까지 만든 기능:');
    done.forEach((f) => lines.push(`- ${f.title}`));
  }

  if (state.deploy && state.deploy.url) {
    lines.push('');
    lines.push(`배포 주소: ${state.deploy.url}`);
  }

  if (cf) {
    const t = cf.tasks || [];
    const td = t.filter((x) => x.status === 'done').length;
    lines.push('');
    lines.push(`진행 중이던 기능: ${cf.title} (${cf.id})`);
    lines.push(`- 단계: ${cf.step}`);
    if (t.length) lines.push(`- 작업: ${t.length}개 중 ${td}개 완료`);
    if (!cf.gates.userVerified) {
      lines.push('- ⚠️ 아직 사용자 확인을 못 받았다. **다른 기능을 시작할 수 없다.**');
    }
    const open = (cf.blockers || []).filter((b) => !b.resolved);
    if (open.length) {
      lines.push(`- ⚠️ 막힌 것 ${open.length}건: ${open.map((b) => `${b.id}(${b.type})`).join(', ')}`);
      lines.push('  → 사용자에게 쉬운 말로 여쭤봐야 한다.');
    }
  }

  if (state.production && state.production.hasRealData) {
    lines.push('');
    lines.push('🔒 실제 사용자가 쓰는 중이다. 데이터를 지우는 작업은 반드시 먼저 물어본다.');
  }

  lines.push('');
  lines.push('## 지금 할 일');
  if (gap >= 2 && done.length) {
    lines.push('오랜만에 돌아온 사용자다. 요약만 말하지 말고 **만든 것을 직접 보여줘라** —');
    lines.push('배포 주소를 알려주고 "한번 열어보고 오세요"라고 권한 뒤 이어서 할지 묻는다.');
  } else if (cf && !cf.gates.userVerified) {
    lines.push('진행 중이던 기능을 이어서 하거나, 사용자에게 확인을 받는다.');
  } else {
    lines.push('사용자에게 다음에 뭘 할지 묻는다.');
  }
  return lines.join('\n');
}

H.safely((input) => {
  const cwd = input.cwd || process.cwd();
  const root = H.findProject(cwd);

  // 이미 시작한 제품 — 상태를 넣어준다
  if (root) {
    const state = H.loadState(root);
    if (!state) return;
    return H.emit({
      hookSpecificOutput: {
        hookEventName: 'SessionStart',
        additionalContext: describe(state),
      },
    });
  }

  // 아직 시작 안 한 폴더. 작업 폴더 안일 때만 말을 건다.
  // (남의 프로젝트에서 세션을 여는 경우를 가로채면 안 된다)
  if (!inWorkspace(cwd)) return;
  if (input.source && input.source !== 'startup') return;

  H.emit({
    hookSpecificOutput: {
      hookEventName: 'SessionStart',
      additionalContext:
        '이 폴더는 DevOffice 작업 폴더 안이지만 아직 제품이 시작되지 않았다.\n' +
        '사용자는 비개발자이고 명령어를 모른다. 먼저 인사하고 무엇을 만들고 싶은지 물어라.\n' +
        '한 문장이면 충분하다고 알려주고 예시를 3개 든다.',
      initialUserMessage: '/devoffice',
    },
  });
});
