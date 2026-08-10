'use strict';

// 로컬 환경 점검. 멱등이고 몇 번 실행해도 안전하다.
//
// 비개발자에게 "Node.js v18.0.0 required" 같은 말을 하지 않는다.
// 무엇이 없는지, 그래서 무엇을 하면 되는지만 말한다 (JOURNEY §2.8).

const { execFileSync } = require('child_process');
const ui = require('./ui');

function probe(cmd, args) {
  try {
    return execFileSync(cmd, args, {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
      timeout: 5000,
    }).trim();
  } catch (_) {
    return null;
  }
}

/** 점검 항목. 각각 "없으면 사용자가 무엇을 하면 되는지"를 안다. */
const CHECKS = [
  {
    key: 'node',
    label: '자바스크립트 실행기',
    required: true,
    run() {
      const v = process.versions.node;
      const major = Number(v.split('.')[0]);
      if (major < 18) {
        return { ok: false, detail: `v${v}`, fix: '조금 오래된 버전이에요. 제가 새로 설치해드릴게요.' };
      }
      return { ok: true, detail: `v${v}` };
    },
  },
  {
    key: 'git',
    label: '작업 내용 저장 도구',
    required: true,
    run() {
      const v = probe('git', ['--version']);
      return v
        ? { ok: true, detail: v.replace('git version ', '') }
        : { ok: false, fix: '제가 설치해드릴게요. 되돌리기 기능에 꼭 필요해요.' };
    },
  },
  {
    key: 'gh',
    label: '코드 금고 연결 도구',
    required: false,
    run() {
      const v = probe('gh', ['--version']);
      if (!v) return { ok: false, fix: '아직 없어도 괜찮아요. 인터넷에 올릴 때 필요해요.' };
      const auth = probe('gh', ['auth', 'status']);
      return auth
        ? { ok: true, detail: '연결됨' }
        : { ok: false, detail: '설치됨', fix: 'GitHub 계정 연결만 하면 돼요. 같이 해드릴게요.' };
    },
  },
];

function run(root, opts) {
  const results = CHECKS.map((c) => ({ ...c, ...c.run() }));

  if (opts && opts.json) {
    return ui.json(
      results.map(({ key, label, required, ok, detail, fix }) =>
        ({ key, label, required, ok, detail, fix }))
    );
  }

  const blocking = results.filter((r) => !r.ok && r.required);
  const optional = results.filter((r) => !r.ok && !r.required);

  ui.header('준비물 점검');
  results.forEach((r) => {
    const mark = r.ok ? '✅' : (r.required ? '❌' : '⬜');
    ui.item(mark, `${r.label}${r.detail ? `  ${r.detail}` : ''}`);
  });

  if (blocking.length || optional.length) {
    ui.line();
    [...blocking, ...optional].forEach((r) => ui.line(`${r.label} — ${r.fix}`));
  }

  if (blocking.length) {
    ui.next('turn', '제가 준비해드릴까요?');
  } else if (optional.length) {
    ui.next('turn', '지금 시작하셔도 되고, 준비물을 먼저 갖추셔도 돼요');
  } else {
    ui.next('turn', '다 준비됐어요. 시작할까요?');
  }
  ui.flush();
  return blocking.length ? 1 : 0;
}

module.exports = { run, CHECKS };
