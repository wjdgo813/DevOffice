'use strict';

// 기능을 바꾸기 전에 "지금 어느 상태이고 무엇이 영향받는지" 판정한다.
//
// 왜 필요한가 (CHANGE.md §1):
//   "잔액 화면 바꿔주세요"는 상태에 따라 10초짜리 일이기도 하고
//   되돌릴 수 없는 1시간짜리 일이기도 하다. **사용자는 그 차이를 모른다.**
//   추측해서 답하면 안 되고, 실제로 세어서 알려줘야 한다.

const fs = require('fs');
const path = require('path');
const P = require('./paths');
const md = require('./md');

const STATE = {
  UNKNOWN: '목록에 없음',
  PENDING: '목록에만 있음',
  SPECED: '어떻게 만들지까지 정해짐',
  BUILDING: '만드는 중',
  BUILT: '만들어짐',
};

/** 명세가 실제로 채워졌는지. 파일만 있고 서식 그대로면 정해진 게 아니다. */
function specFilled(root, id) {
  const file = path.join(P.paths(root).feature(id), 'spec.md');
  const text = md.read(file);
  if (text === null) return false;
  const s = md.sections(text);
  return !md.isEmpty(s['이번에 만드는 것']) && md.acIds(s['인수 조건'] || '').length > 0;
}

function hasContract(root, id) {
  const dir = path.join(root, 'packages', 'contracts');
  if (!fs.existsSync(dir)) return null;
  const hit = fs.readdirSync(dir).find((f) => f.startsWith(id));
  return hit ? path.join('packages/contracts', hit) : null;
}

function classify(state, root, id) {
  const row = (state.backlog || []).find((b) => b.id === id);
  if (!row) return STATE.UNKNOWN;
  if (row.status === 'done') return STATE.BUILT;

  const cur = state.currentFeature;
  if (cur && cur.id === id && (cur.tasks || []).length) return STATE.BUILDING;
  return specFilled(root, id) ? STATE.SPECED : STATE.PENDING;
}

/** 이 기능에 기대고 있는 다른 기능들. dependsOn 의 역참조. */
function dependents(state, id) {
  return (state.backlog || [])
    .filter((b) => (b.dependsOn || []).includes(id))
    .map((b) => ({ id: b.id, title: b.title, status: b.status }));
}

function analyze(root, id) {
  const state = require('./state').load(root);
  const row = (state.backlog || []).find((b) => b.id === id) || null;
  const status = classify(state, root, id);

  const deps = dependents(state, id);
  const contract = hasContract(root, id);
  const live = !!(state.production && state.production.hasRealData);

  // 되돌릴 수 있는가. 여기가 사용자에게 가장 중요한 정보다.
  const reversible =
    status === STATE.PENDING || status === STATE.SPECED
      ? '쉬움'
      : live ? '어려움 (저장된 데이터는 되돌아가지 않아요)' : '보통';

  const cost =
    status === STATE.PENDING ? '거의 안 걸려요'
      : status === STATE.SPECED ? '15분쯤'
        : live ? '40분 이상 + 데이터 정리' : '30분쯤';

  return { id, row, status, dependents: deps, contract, live, reversible, cost };
}

module.exports = { STATE, analyze, classify, dependents, specFilled, hasContract };
