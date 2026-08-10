#!/usr/bin/env node
'use strict';

// Stop — 확인받지 않고 넘어가는 것을 막는다 (D53 / PROTOCOL §11.3).
//
// `devoffice feature start` 가 이미 기계적으로 막지만, 그건 "다음 기능을
// 시작할 때"만 걸린다. 다 만들어놓고 확인을 안 받은 채 턴이 끝나면
// 사용자는 그냥 기다리다 창을 닫는다.
//
// 여기서는 막지 않고(무한 반복 위험) 되짚어준다.

const H = require('./lib/hook');

H.safely((input) => {
  const root = H.findProject(input.cwd);
  if (!root) return;

  const state = H.loadState(root);
  const cf = state && state.currentFeature;
  if (!cf || cf.gates.userVerified) return;

  const tasks = cf.tasks || [];
  const done = tasks.filter((t) => t.status === 'done').length;
  const open = (cf.blockers || []).filter((b) => !b.resolved);

  // 막힌 게 있으면 그게 먼저다
  if (open.length) {
    const b = open[0];
    return H.emit({
      hookSpecificOutput: {
        hookEventName: 'Stop',
        additionalContext:
          `[확인] ${cf.title}에서 막힌 것이 있다 (${b.id} ${b.type}).\n` +
          '사용자에게 아직 안 여쭤봤다면, 지금 쉬운 말 객관식으로 물어야 한다.\n' +
          '"문제가 생겼다"가 아니라 "확인이 하나 필요해서 잠깐 멈췄어요"로 연다.',
      },
    });
  }

  // 다 만들었는데 확인을 안 받았다
  if (tasks.length > 0 && done === tasks.length) {
    return H.emit({
      hookSpecificOutput: {
        hookEventName: 'Stop',
        additionalContext:
          `[확인] ${cf.title}은(는) 다 만들어졌는데 사용자 확인을 아직 못 받았다.\n` +
          '확인을 요청하지 않았다면 지금 해야 한다. 반드시 포함할 것:\n' +
          '  · 그 기능이 있는 화면의 직링크 (홈 주소 말고)\n' +
          '  · 로그인이 필요하면 테스트 계정\n' +
          '  · 각 항목마다 "→ ~하면 정상이에요" (없으면 사용자가 판단할 수 없다)\n' +
          '확인을 받기 전에는 다음 기능을 시작할 수 없다.',
      },
    });
  }
});
