'use strict';

// "지금 뭐가 됐고 뭐가 남았지?" 에 한 화면으로 답한다.
//
// 조각은 여러 명령에 흩어져 있었다 — state show(단계) · backlog list(목록)
// · feature show(작업) · journal(이력). **사용자는 명령을 하나도 모른다.**
// 셋을 다 쳐야 알 수 있는 건 알 수 없는 것과 같다.

const ui = require('./ui');
const state = require('./state');
const schema = require('./schema');

/** 기능 루프 안의 단계를 사람 말로. cf.step 은 SPEC 같은 영문이다. */
const STEP_KO = {
  FEASIBILITY: '되는지 알아보는 중',
  SPEC: '어떻게 만들지 정하는 중',
  CONTRACT: '설계하는 중',
  HANDOFF: '작업 나누는 중',
  IMPLEMENT: '만드는 중',
  INTEGRATE: '검사하는 중',
  VERIFY: '확인 기다리는 중',
  REGRESSION: '예전 기능 점검 중',
  SHIP: '올리는 중',
};

function show(root) {
  const s = state.load(root);
  const name = (s.product && s.product.name) || '이름 없는 제품';
  const rows = s.backlog || [];
  const cf = s.currentFeature;

  const done = rows.filter((r) => r.status === 'done');
  const cur = cf ? rows.find((r) => r.id === cf.id) : null;
  const next = rows.filter((r) => r.status === 'pending');

  ui.header(name, rows.length ? `${done.length}/${rows.length}` : undefined);

  // 아직 기능 목록이 없으면 큰 단계만 알려준다
  if (!rows.length) {
    const stage = schema.stageOf(s.phase);
    ui.line(`지금  ${stage.no}단계 · ${state.stageName(stage, s)}`);
    ui.line();
    ui.line('아직 만들 기능 목록이 정해지지 않았어요.');
    ui.next('turn', '무엇부터 만들지 정해볼까요?');
    return ui.flush();
  }

  if (done.length) {
    ui.line('✅ 만든 것');
    done.slice(-4).forEach((r) => ui.line(`   ${r.title}`));
    if (done.length > 4) ui.line(`   그 외 ${done.length - 4}개`);
    ui.line();
  }

  if (cf) {
    ui.line('🔄 만드는 중');
    ui.line(`   ${cf.title}`);
    ui.line(`   └ ${STEP_KO[cf.step] || cf.step}`);

    const tasks = cf.tasks || [];
    if (tasks.length) {
      const td = tasks.filter((t) => t.status === 'done').length;
      ui.line(`   └ 작업 ${tasks.length}개 중 ${td}개 완료`);
    }
    // 막힌 것이 있으면 그게 가장 먼저 눈에 띄어야 한다
    const open = (cf.blockers || []).filter((b) => !b.resolved);
    if (open.length) {
      ui.line(`   ⚠️ 확인이 필요해서 멈춰 있어요 (${open.length}건)`);
    } else if (tasks.length && tasks.every((t) => t.status === 'done') && !cf.gates.userVerified) {
      ui.line('   ⚠️ 다 만들었어요. 확인만 하시면 돼요');
    }
    ui.line();
  }

  if (next.length) {
    ui.line('⬜ 다음');
    next.slice(0, 2).forEach((r) => ui.line(`   ${r.title}`));
    if (next.length > 2) ui.line(`   그 외 ${next.length - 2}개`);
    ui.line();
  }

  if (s.deploy && s.deploy.url) ui.line(`🔗 ${s.deploy.url}`);
  if (s.production && s.production.hasRealData) {
    ui.line('🔒 실제로 쓰이는 중이에요');
  }

  // 다음 차례가 누구인지로 끝낸다
  const openBlockers = cf ? (cf.blockers || []).filter((b) => !b.resolved).length : 0;
  const readyToVerify = cf && (cf.tasks || []).length
    && (cf.tasks || []).every((t) => t.status === 'done') && !cf.gates.userVerified;

  if (openBlockers) ui.next('turn', '여쭤볼 게 있어요');
  else if (readyToVerify) ui.next('go', '확인해보시고 알려주세요');
  else if (cf) ui.next('wait', '만드는 중이에요');
  else ui.next('turn', '다음 기능을 시작할까요?');

  ui.flush();
}

module.exports = { show, STEP_KO };
