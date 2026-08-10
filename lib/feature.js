'use strict';

// 기능 하나의 생애. 그리고 **진행 잠금** (D53 / PROTOCOL §11.3).
//
// 이 파일의 존재 이유는 lock() 하나다:
//   사용자가 눈으로 확인하지 않은 기능이 있으면, 다른 기능을 시작할 수 없다.
//   경고가 아니라 차단이다. 예외 없다.
//
// 프로듀서가 잊거나, 사용자가 "다음 것도 같이 해주세요"라고 해도 여기서 막힌다.

const state = require('./state');
const journal = require('./journal');
const ui = require('./ui');
const schema = require('./schema');

/**
 * 잠금 확인. 진행 가능하면 null, 막혀 있으면 이유를 담은 객체를 준다.
 */
function lock(s) {
  const cf = s.currentFeature;
  if (!cf) return null;
  if (cf.gates.userVerified) return null;

  const tasks = cf.tasks || [];
  const done = tasks.filter((t) => t.status === 'done').length;
  return {
    feature: cf,
    reason: 'UNVERIFIED',
    progress: tasks.length ? `${done}/${tasks.length}` : null,
    ready: tasks.length > 0 && done === tasks.length,
  };
}

/** 잠겨 있으면 사용자 언어로 설명하고 종료한다. */
function requireUnlocked(root) {
  const s = state.load(root);
  const l = lock(s);
  if (!l) return s;

  ui.header('잠깐만요');
  ui.line(`아직 ${ui.withJosa(l.feature.title, '을')} 확인 못 하셨어요.`);
  ui.line();
  if (l.ready) {
    ui.line('다 만들어뒀으니 한 번만 봐주세요.');
  } else {
    ui.line(`만드는 중이에요${l.progress ? `  (${l.progress})` : ''}.`);
  }
  ui.line();
  ui.line('한꺼번에 만들면 나중에 어디가 잘못됐는지');
  ui.line('찾기 어려워져서, 하나씩 확인하며 가고 있어요.');
  ui.next('turn', l.ready ? '확인해보시고 알려주세요' : '조금만 기다려주세요');
  ui.flush();
  process.exit(2);
}

function start(root, id, title) {
  requireUnlocked(root);
  return state.update(root, (s) => {
    const f = schema.newFeature(id, title);
    s.currentFeature = f;
    s.phase = 'FEATURE_LOOP';

    const row = (s.backlog || []).find((b) => b.id === id);
    if (row) row.status = 'in_progress';
    else (s.backlog = s.backlog || []).push({ id, title, status: 'in_progress' });

    journal.add(root, 'feature.start', title, { id });
    return f;
  });
}

/** 게이트 통과 기록. userVerified 가 켜지는 순간 잠금이 풀린다. */
function pass(root, gate) {
  return state.update(root, (s) => {
    const cf = s.currentFeature;
    if (!cf) ui.fail('진행 중인 기능이 없어요.');
    if (!(gate in cf.gates)) {
      ui.fail(`'${gate}'는 없는 확인 항목이에요.`,
        `쓸 수 있는 것: ${Object.keys(cf.gates).join(', ')}`);
    }
    cf.gates[gate] = true;
    journal.add(root, 'feature.gate', gate, { id: cf.id, gate });
    return cf.gates;
  });
}

/** 사용자가 눈으로 확인했다. 잠금 해제. */
function verify(root) {
  const s = state.load(root);
  const cf = s.currentFeature;
  if (!cf) ui.fail('진행 중인 기능이 없어요.');

  const tasks = cf.tasks || [];
  const undone = tasks.filter((t) => t.status !== 'done');
  if (undone.length) {
    ui.fail(
      `아직 안 끝난 작업이 ${undone.length}개 있어요.`,
      '작업을 마저 끝낸 뒤에 확인을 받아야 해요.'
    );
  }

  pass(root, 'userVerified');
  journal.add(root, 'feature.verified', cf.title, { id: cf.id });

  ui.header(`${cf.title} 확인 완료`);
  ui.line('다음 기능으로 넘어갈 수 있어요.');
  ui.next('turn', '이어서 하시려면 말씀해주세요');
  ui.flush();
}

/** 배포까지 끝났다. 백로그에 완료로 기록하고 자리를 비운다. */
function complete(root) {
  return state.update(root, (s) => {
    const cf = s.currentFeature;
    if (!cf) ui.fail('진행 중인 기능이 없어요.');
    if (!cf.gates.userVerified) {
      ui.fail(
        '아직 확인을 못 받은 기능이에요.',
        '사용자가 직접 보고 확인한 뒤에야 마무리할 수 있어요.'
      );
    }
    const row = (s.backlog || []).find((b) => b.id === cf.id);
    if (row) {
      row.status = 'done';
      row.completedAt = new Date().toISOString();
    }
    journal.add(root, 'feature.complete', cf.title, { id: cf.id });
    s.currentFeature = null;
    return row;
  });
}

function show(root) {
  const s = state.load(root);
  const cf = s.currentFeature;
  if (!cf) {
    ui.header('진행 중인 기능 없음');
    ui.line('다음에 만들 걸 정하면 시작할 수 있어요.');
    ui.next('turn', '뭘 만들지 말씀해주세요');
    return ui.flush();
  }

  const tasks = cf.tasks || [];
  const done = tasks.filter((t) => t.status === 'done').length;
  ui.header(cf.title, tasks.length ? `${done}/${tasks.length}` : cf.step);

  const MARK = { done: '✅', in_progress: '🔄', blocked: '🚫', pending: '⬜' };
  tasks.forEach((t) => ui.item(MARK[t.status] || '⬜', `${t.id}  ${t.title}`));

  const open = (cf.blockers || []).filter((b) => !b.resolved);
  if (open.length) {
    ui.line();
    open.forEach((b) => ui.item('⚠️', `${b.id}  ${b.note || b.type}`));
  }

  ui.next(cf.gates.userVerified ? 'turn' : 'wait',
    cf.gates.userVerified ? '다음 기능으로 넘어갈 수 있어요' : '만드는 중이에요');
  ui.flush();
}

module.exports = { lock, requireUnlocked, start, pass, verify, complete, show };
