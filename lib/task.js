'use strict';

// 작업 단위 진행 기록 (PROTOCOL §3.2).
//
// 핵심 규칙: 기록은 "문서 작성"이 아니라 "명령 실행"이다.
// 에이전트에게 문서를 쓰라고 시키면 형식이 매번 달라지고, 잊어버리고,
// 끝나고 몰아 쓴다 — 그러면 중간에 죽었을 때 아무것도 안 남는다.
//
// 명령 한 번이 세 곳을 동시에 갱신한다:
//   worklog/<담당>.md   사람이 읽는 진행 기록
//   state.json          현재 위치 (SessionStart 훅이 읽는다)
//   journal.jsonl       이벤트 로그 (Phase 2 GUI 연료)

const state = require('./state');
const journal = require('./journal');
const scaffold = require('./scaffold');
const ui = require('./ui');
const { LIMITS, TASK_STATUS, BLOCKER_TYPES } = require('./schema');

function current(s) {
  if (!s.currentFeature) {
    ui.fail('진행 중인 기능이 없어요.', '먼저 기능을 시작해야 해요.');
  }
  return s.currentFeature;
}

function find(cf, id) {
  const t = (cf.tasks || []).find((x) => x.id === id);
  if (!t) {
    ui.fail(
      `${id}라는 작업이 없어요.`,
      `지금 있는 작업: ${(cf.tasks || []).map((x) => x.id).join(', ') || '없음'}`
    );
  }
  return t;
}

function add(root, id, opts) {
  return state.update(root, (s) => {
    const cf = current(s);
    cf.tasks = cf.tasks || [];

    if (cf.tasks.some((t) => t.id === id)) {
      ui.fail(`${id}는 이미 있는 작업이에요.`);
    }

    // PROTOCOL §11.2 — 작업이 8개를 넘으면 기능이 너무 크다는 신호다.
    if (cf.tasks.length >= LIMITS.tasksPerFeature) {
      ui.fail(
        `작업이 ${LIMITS.tasksPerFeature}개를 넘었어요. 기능이 너무 큽니다.`,
        '기능을 둘로 나눠서 하나씩 확인받는 편이 안전해요.\n' +
        '              사용자에게 나눠도 될지 여쭤보고 백로그를 다시 짜세요.'
      );
    }

    const task = {
      id,
      owner: opts.owner || 'unassigned',
      title: opts.title || '',
      done: opts.done || '',              // 완료 조건
      ac: opts.ac ? String(opts.ac).split(',').map((x) => x.trim()) : [],
      status: 'pending',
      note: '',
    };
    cf.tasks.push(task);
    journal.add(root, 'task.add', `${id} ${task.title}`, { feature: cf.id, task: id });
    return task;
  });
}

function transition(root, id, status, opts) {
  if (!TASK_STATUS.includes(status)) ui.fail(`'${status}'는 없는 상태예요.`);

  return state.update(root, (s) => {
    const cf = current(s);
    const t = find(cf, id);

    t.status = status;
    if (opts.note) t.note = opts.note;
    t[status === 'done' ? 'doneAt' : 'updatedAt'] = new Date().toISOString();

    scaffold.appendWorklog(root, cf.id, t.owner, {
      task: `${t.id} ${t.title}`,
      status,
      note: opts.note || '',
    });
    journal.add(root, `task.${status}`, `${t.id} ${t.title}`, {
      feature: cf.id, task: t.id, owner: t.owner,
    });
    return t;
  });
}

/**
 * 막혔을 때. 추측해서 진행하지 않는다 (PROTOCOL §7.1).
 * 블로커 문서를 남기고 에이전트는 즉시 종료한다.
 */
function block(root, id, opts) {
  if (!opts.type || !BLOCKER_TYPES.includes(opts.type)) {
    ui.fail(
      '막힌 종류를 알려주세요.',
      `쓸 수 있는 것: ${BLOCKER_TYPES.join(', ')}`
    );
  }

  const result = state.update(root, (s) => {
    const cf = current(s);
    const t = find(cf, id);
    cf.blockers = cf.blockers || [];

    const blocker = {
      id: `B-${String(cf.blockers.length + 1).padStart(3, '0')}`,
      type: opts.type,
      task: id,
      owner: t.owner,
      note: opts.note || '',
      resolved: false,
      at: new Date().toISOString(),
    };
    cf.blockers.push(blocker);
    t.status = 'blocked';

    scaffold.appendWorklog(root, cf.id, t.owner, {
      task: `${t.id} ${t.title}`, status: 'blocked', note: `${blocker.id} ${opts.type}`,
    });
    scaffold.writeBlocker(root, cf.id, blocker);
    journal.add(root, 'task.blocked', `${t.id} ${opts.type}`, {
      feature: cf.id, task: t.id, blocker: blocker.id, type: opts.type,
    });
    return { blocker, feature: cf.id };
  });

  // 프로듀서가 사용자 언어로 번역해야 한다는 것을 화면에서도 상기시킨다.
  ui.header('멈췄어요', result.blocker.id);
  ui.line(`${id} 작업에서 확인이 필요해요.`);
  if (opts.note) { ui.line(); ui.line(opts.note); }
  ui.line();
  ui.line('추측해서 진행하지 않고 기다릴게요.');
  ui.next('turn', '사용자에게 쉬운 말로 여쭤보세요');
  ui.flush();
  return result;
}

function resolve(root, blockerId) {
  return state.update(root, (s) => {
    const cf = current(s);
    const b = (cf.blockers || []).find((x) => x.id === blockerId);
    if (!b) ui.fail(`${blockerId}라는 블로커가 없어요.`);
    b.resolved = true;
    b.resolvedAt = new Date().toISOString();
    const t = (cf.tasks || []).find((x) => x.id === b.task);
    if (t && t.status === 'blocked') t.status = 'pending';
    journal.add(root, 'blocker.resolved', blockerId, { feature: cf.id, blocker: blockerId });
    return b;
  });
}

const MARK = { done: '✅', in_progress: '🔄', blocked: '🚫', pending: '⬜' };

function list(root) {
  const s = state.load(root);
  const cf = current(s);
  const tasks = cf.tasks || [];
  const done = tasks.filter((t) => t.status === 'done').length;

  ui.header(cf.title, `${done}/${tasks.length}`);
  if (!tasks.length) {
    ui.line('아직 나눠둔 작업이 없어요.');
  } else {
    tasks.forEach((t) => ui.item(MARK[t.status] || '⬜', `${t.id}  ${t.title}  (${t.owner})`));
  }

  const open = (cf.blockers || []).filter((b) => !b.resolved);
  if (open.length) {
    ui.line();
    open.forEach((b) => ui.item('⚠️', `${b.id}  ${b.type}  ${b.note || ''}`));
  }

  const allDone = tasks.length > 0 && done === tasks.length;
  ui.next(
    allDone && !cf.gates.userVerified ? 'go' : 'wait',
    allDone && !cf.gates.userVerified
      ? '다 만들었어요. 사용자에게 확인을 받으세요'
      : '만드는 중이에요'
  );
  ui.flush();
}

module.exports = { add, transition, block, resolve, list };
