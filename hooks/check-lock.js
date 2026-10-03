#!/usr/bin/env node
'use strict';

// Stop — 확인받지 않고 넘어가는 것을 되짚어준다 (D53 / PROTOCOL §11.3).
//
// ⚠️ 여기서 한 번 크게 틀렸다. 기록해둔다.
//
//   `additionalContext` 는 "컨텍스트만 얹는다"가 아니라 **대화를 계속하게 만든다.**
//   그런데 우리가 되짚는 조건(막힌 블로커)은 **사용자가 답해야만** 풀린다.
//   → Stop → 계속 → Stop → 계속 … 무한 반복.
//   "사용자에게 물어라"는 훅이 **사용자가 답할 기회를 막았다.**
//
//   그래서 **같은 조건에는 한 번만** 알린다. 알렸으면 조용히 끝낸다.
//   되짚기는 깜빡했을 때를 잡는 장치다. 두 번째부터는 잡을 게 없다.

const fs = require('fs');
const path = require('path');
const H = require('./lib/hook');

/** 마지막으로 알린 조건. 같으면 다시 알리지 않는다. */
function marker(root) {
  return path.join(root, '.devoffice', '.nudge');
}

function lastNudge(root) {
  try { return fs.readFileSync(marker(root), 'utf8').trim(); } catch (_) { return ''; }
}

function remember(root, key) {
  try { fs.writeFileSync(marker(root), `${key}\n`, 'utf8'); } catch (_) { /* 못 써도 넘어간다 */ }
}

H.safely((input) => {
  const root = H.findProject(input.cwd);
  if (!root) return;

  const state = H.loadState(root);
  const cf = state && state.currentFeature;
  if (!cf || cf.gates.userVerified) return;

  const tasks = cf.tasks || [];
  const done = tasks.filter((t) => t.status === 'done').length;
  const open = (cf.blockers || []).filter((b) => !b.resolved);

  // 무엇을 되짚을지, 그리고 그 조건을 식별하는 키
  let key = null;
  let context = null;

  if (open.length) {
    const b = open[0];
    key = `blocker:${cf.id}:${b.id}`;
    context =
      `[확인] ${cf.title}에서 막힌 것이 있다 (${b.id} ${b.type}).\n` +
      '사용자에게 아직 안 여쭤봤다면, 지금 쉬운 말 객관식으로 물어야 한다.\n' +
      '"문제가 생겼다"가 아니라 "확인이 하나 필요해서 잠깐 멈췄어요"로 연다.\n' +
      '\n' +
      '**이미 여쭤봤다면 그대로 턴을 끝내고 사용자 답을 기다려라.** ' +
      '같은 말을 반복하지 마라 — 사용자가 답할 틈이 없어진다.';
  } else if (tasks.length > 0 && done === tasks.length) {
    key = `verify:${cf.id}:${tasks.length}`;
    context =
      `[확인] ${cf.title}은(는) 다 만들어졌는데 사용자 확인을 아직 못 받았다.\n` +
      '확인을 요청하지 않았다면 지금 해야 한다. 반드시 포함할 것:\n' +
      '  · 그 기능이 있는 화면의 직링크 (홈 주소 말고)\n' +
      '  · 로그인이 필요하면 테스트 계정\n' +
      '  · 각 항목마다 "→ ~하면 정상이에요" (없으면 사용자가 판단할 수 없다)\n' +
      '\n' +
      '**이미 요청했다면 그대로 끝내고 기다려라.**';
  }

  if (!key) return;

  // 같은 조건을 이미 알렸으면 조용히 끝낸다. 이게 무한 반복을 막는다.
  if (lastNudge(root) === key) return;

  remember(root, key);
  H.emit({ hookSpecificOutput: { hookEventName: 'Stop', additionalContext: context } });
});
