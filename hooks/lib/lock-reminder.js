'use strict';

// Shared stop-gate decision. Adapters emit the runtime-specific continuation
// shape after this function records the one-time reminder marker.

const fs = require('fs');
const path = require('path');
const H = require('./hook');

function marker(root) {
  return path.join(root, '.devoffice', '.nudge');
}

function getReminder(input) {
  const root = H.findProject(input.cwd);
  if (!root) return null;

  const state = H.loadState(root);
  const feature = state && state.currentFeature;
  if (!feature || feature.gates.userVerified) return null;

  const tasks = feature.tasks || [];
  const done = tasks.filter((task) => task.status === 'done').length;
  const open = (feature.blockers || []).filter((blocker) => !blocker.resolved);
  let key = null;
  let context = null;

  if (open.length) {
    const blocker = open[0];
    key = `blocker:${feature.id}:${blocker.id}`;
    context =
      `[확인] ${feature.title}에서 막힌 것이 있다 (${blocker.id} ${blocker.type}).\n` +
      '사용자에게 아직 안 여쭤봤다면, 지금 쉬운 말 객관식으로 물어야 한다.\n' +
      '"문제가 생겼다"가 아니라 "확인이 하나 필요해서 잠깐 멈췄어요"로 연다.\n' +
      '\n' +
      '**이미 여쭤봤다면 그대로 턴을 끝내고 사용자 답을 기다려라.** ' +
      '같은 말을 반복하지 마라 — 사용자가 답할 틈이 없어진다.';
  } else if (tasks.length > 0 && done === tasks.length) {
    key = `verify:${feature.id}:${tasks.length}`;
    context =
      `[확인] ${feature.title}은(는) 다 만들어졌는데 사용자 확인을 아직 못 받았다.\n` +
      '확인을 요청하지 않았다면 지금 해야 한다. 반드시 포함할 것:\n' +
      '  · 그 기능이 있는 화면의 직링크 (홈 주소 말고)\n' +
      '  · 로그인이 필요하면 테스트 계정\n' +
      '  · 각 항목마다 "→ ~하면 정상이에요" (없으면 사용자가 판단할 수 없다)\n' +
      '\n' +
      '**이미 요청했다면 그대로 끝내고 기다려라.**';
  }

  if (!key) return null;
  try {
    if (fs.readFileSync(marker(root), 'utf8').trim() === key) return null;
  } catch (_) { /* first reminder */ }
  try { fs.writeFileSync(marker(root), `${key}\n`, 'utf8'); } catch (_) { /* fail open */ }
  return context;
}

module.exports = { getReminder };
