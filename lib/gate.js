'use strict';

// 게이트 — 규격을 어긴 문서가 통과하지 못하게 막는다.
//
// 프롬프트로 쓴 규칙은 언젠가 어겨진다. 기계적으로 검사되는 것만 지켜진다.
// 여기서 막는 것들은 전부 "없으면 하류가 성립하지 않는 것"이다:
//
//   spec   가정 명세가 없으면 사용자가 무엇을 승인했는지 알 수 없다
//   plan   준비물이 없으면 사용자가 검증 자체를 할 수 없다
//   verify 기대 결과가 없으면 사용자가 판단할 수 없다

const fs = require('fs');
const path = require('path');
const md = require('./md');
const ui = require('./ui');
const state = require('./state');
const P = require('./paths');
const { LIMITS } = require('./schema');

function featurePaths(root, id) {
  const dir = P.paths(root).feature(id);
  return {
    dir,
    spec: path.join(dir, 'spec.md'),
    plan: path.join(dir, 'plan.md'),
    verify: path.join(dir, 'verify.md'),
  };
}

/** 검사 결과 하나. ok=false 면 통과 못 한다. */
function problem(what, how) {
  return { ok: false, what, how };
}

// --- spec ------------------------------------------------------------------

function checkSpec(root, id) {
  const f = featurePaths(root, id);
  const text = md.read(f.spec);
  if (text === null) return [problem('명세 문서가 없어요.', `${f.spec} 를 먼저 만들어야 해요.`)];

  const s = md.sections(text);
  const out = [];

  // DIALOGUE §3 — 무엇을 가정했는지 남기지 않으면 나중에 "왜 이렇게 됐지"에 답할 수 없다.
  if (md.isEmpty(s['이렇게 이해했습니다'])) {
    out.push(problem(
      '"이렇게 이해했습니다"가 비어 있어요.',
      '무엇을 가정했는지 이유와 함께 적어야 사용자가 판단할 수 있어요.'
    ));
  }

  // PROTOCOL §11.5 — 범위 경계. 이쪽이 더 중요하다.
  if (md.isEmpty(s['이번에 안 만드는 것'])) {
    out.push(problem(
      '"이번에 안 만드는 것"이 비어 있어요.',
      '안 만드는 걸 적어야 기대와 결과가 어긋나지 않아요. 없으면 "없음"이라고 적으세요.'
    ));
  }

  if (md.isEmpty(s['이번에 만드는 것'])) {
    out.push(problem('"이번에 만드는 것"이 비어 있어요.', '무엇을 만들지 적어주세요.'));
  }

  // PROTOCOL §5.1 — 검증 가능한 인수 조건
  const acs = md.acIds(s['인수 조건'] || '');
  if (acs.length === 0) {
    out.push(problem(
      '인수 조건(AC)이 없어요.',
      'AC-1 처럼 번호를 붙여 확인 가능한 문장으로 적어주세요.'
    ));
  } else if (acs.length > LIMITS.acPerFeature) {
    out.push(problem(
      `인수 조건이 ${acs.length}개예요. ${LIMITS.acPerFeature}개를 넘으면 기능이 너무 큽니다.`,
      '기능을 나눠서 하나씩 확인받는 편이 안전해요. 사용자에게 나눠도 될지 여쭤보세요.'
    ));
  }

  return out;
}

// --- plan ------------------------------------------------------------------

function checkPlan(root, id) {
  const f = featurePaths(root, id);
  const text = md.read(f.plan);
  if (text === null) return [problem('작업 계획이 없어요.', `${f.plan} 를 먼저 만들어야 해요.`)];

  const s = md.sections(text);
  const out = [];

  const tasks = md.table(s['작업']);
  if (!tasks.length) {
    out.push(problem('작업이 하나도 없어요.', '무엇을 누가 할지 나눠주세요.'));
  } else if (tasks.length > LIMITS.tasksPerFeature) {
    out.push(problem(
      `작업이 ${tasks.length}개예요. ${LIMITS.tasksPerFeature}개를 넘으면 기능이 너무 큽니다.`,
      '기능을 나누는 편이 안전해요.'
    ));
  }

  // 소유자 없는 작업 = 그레이 영역의 씨앗 (PROTOCOL §6.1)
  const orphan = tasks.filter((t) => !t['담당'] || t['담당'] === '-');
  if (orphan.length) {
    out.push(problem(
      `담당이 없는 작업이 ${orphan.length}개 있어요.`,
      '담당 없는 작업은 아무도 안 합니다. 전부 배정해주세요.'
    ));
  }

  // PROTOCOL §6.1 — 모든 AC가 최소 하나의 작업에 매핑되어야 한다
  const specAcs = md.acIds(md.sections(md.read(f.spec) || '')['인수 조건'] || '');
  const covered = new Set(md.acIds(s['AC × 작업 매트릭스'] || '').concat(
    tasks.flatMap((t) => md.acIds(t['관련 AC'] || ''))
  ));
  const missing = specAcs.filter((a) => !covered.has(a));
  if (missing.length) {
    out.push(problem(
      `${missing.join(', ')} 를 맡은 작업이 없어요.`,
      '이대로 만들면 그 조건은 아무도 구현하지 않습니다.'
    ));
  }

  // CHECKPOINTS §5.4 — 준비물이 없으면 사용자가 검증을 못 한다
  if (md.isEmpty(s['검증 준비물'])) {
    out.push(problem(
      '검증 준비물이 비어 있어요.',
      '테스트 계정·예시 데이터·직링크가 없으면 사용자가 확인할 방법이 없어요.'
    ));
  }

  // PROTOCOL §2.3 — 재사용 조사를 안 하면 같은 걸 또 만든다
  if (md.isEmpty(s['재사용할 것'])) {
    out.push(problem(
      '재사용할 것을 조사하지 않았어요.',
      '기존 코드를 확인하고, 없으면 "없음 (조사함)"이라고 적으세요.'
    ));
  }

  return out;
}

// --- verify ----------------------------------------------------------------

function checkVerify(root, id) {
  const f = featurePaths(root, id);
  const text = md.read(f.verify);
  if (text === null) return [problem('확인 안내가 없어요.', `${f.verify} 를 먼저 만들어야 해요.`)];

  const out = [];
  const lines = md.stripComments(text).split('\n').map((l) => l.trim());
  const isStep = (l) => /^\d+\.\s+\S/.test(l);

  // CHECKPOINTS §6 — 행동마다 "→ 이렇게 보이면 정상"이 붙어야 한다.
  // 다음 항목이 나오기 전까지만 본다. 창을 고정 줄 수로 잡으면
  // 다음 항목의 기대 결과를 앞 항목 것으로 잘못 세게 된다.
  const steps = [];
  lines.forEach((l, i) => {
    if (!isStep(l)) return;
    let hasExpectation = false;
    for (let j = i + 1; j < lines.length && !isStep(lines[j]); j += 1) {
      if (lines[j].startsWith('→')) { hasExpectation = true; break; }
    }
    steps.push({ text: l, hasExpectation });
  });

  if (!steps.length) {
    out.push(problem('확인할 항목이 없어요.', '"1. ~해보세요" 형태로 적어주세요.'));
  }

  const bare = steps.filter((s) => !s.hasExpectation);
  if (bare.length) {
    out.push(problem(
      `확인 항목 ${steps.length}개 중 ${bare.length}개에 "어떻게 보이면 정상인지"가 없어요.`,
      `${bare.map((s) => `"${s.text}"`).join(', ')}\n` +
      '              기대 결과가 없으면 사용자는 됐는지 안 됐는지 판단할 수 없어요.\n' +
      '              각 항목 아래에 "→ ~하면 정상이에요"를 붙여주세요.'
    ));
  }

  if (!/🔗/.test(text)) {
    out.push(problem('확인하러 갈 링크가 없어요.', '그 기능이 있는 화면의 직링크를 적어주세요.'));
  }

  return out;
}

// --- L0 보안 ---------------------------------------------------------------

/**
 * 되돌릴 수 없는 것만 본다 (SAFETY §3).
 *
 * 이론적 취약점을 훑지 않는다. **비개발자 제품에서 실제로 터지는 것**만 본다.
 * 전부 "빠뜨려서" 생기는 것들이라 기계적으로 잡힌다.
 *
 * 다른 게이트보다 먼저 돌린다. 비밀키가 새거나 남의 데이터가 보이면
 * 나중에 고쳐도 이미 일어난 일은 되돌아가지 않는다.
 */
const SECRET_LITERAL = [
  /\bsk-[A-Za-z0-9_-]{16,}/,
  /\bsk-ant-[A-Za-z0-9_-]{16,}/,
  /\bghp_[A-Za-z0-9]{20,}/,
  /\bAKIA[0-9A-Z]{16}\b/,
  /\beyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\./,
];

/** 서버 코드로 보이는 파일들. 화면 파일은 권한 검사 대상이 아니다. */
function serverFiles(root) {
  const out = [];
  const skip = new Set(['node_modules', '.git', '.devoffice', '.expo', 'dist', 'build', '.next']);
  const walk = (dir, depth) => {
    if (depth > 6) return;
    let entries;
    try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch (_) { return; }
    for (const e of entries) {
      if (skip.has(e.name)) continue;
      const abs = path.join(dir, e.name);
      if (e.isDirectory()) walk(abs, depth + 1);
      else if (/\.(ts|tsx|js|mjs)$/.test(e.name)) {
        const rel = path.relative(root, abs);
        if (/(^|\/)(server|api|routes|functions)(\/|$)/.test(rel)) out.push({ rel, abs });
      }
    }
  };
  walk(root, 0);
  return out;
}

function checkSecurity(root) {
  const out = [];
  const files = serverFiles(root);

  // ① 소스에 박힌 비밀키 — 한번 올라가면 회수할 수 없다
  const scanRoots = ['app', 'apps', 'server', 'src', 'lib', 'components', 'packages'];
  const leaked = [];
  const scan = (dir, depth) => {
    if (depth > 6) return;
    let entries;
    try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch (_) { return; }
    for (const e of entries) {
      if (['node_modules', '.git', '.devoffice'].includes(e.name)) continue;
      const abs = path.join(dir, e.name);
      if (e.isDirectory()) scan(abs, depth + 1);
      else if (/\.(ts|tsx|js|mjs|json)$/.test(e.name) && !/\.env/.test(e.name)) {
        let text = '';
        try { text = fs.readFileSync(abs, 'utf8'); } catch (_) { continue; }
        if (SECRET_LITERAL.some((re) => re.test(text))) leaked.push(path.relative(root, abs));
      }
    }
  };
  scanRoots.forEach((d) => { const p = path.join(root, d); if (fs.existsSync(p)) scan(p, 0); });

  if (leaked.length) {
    out.push(problem(
      `비밀번호(API 키)가 코드에 그대로 있어요: ${leaked.slice(0, 3).join(', ')}`,
      '.env.local 로 옮기고 코드에서는 이름으로만 불러오세요.\n' +
      '              한번 인터넷에 올라가면 되돌릴 수 없어요.'
    ));
  }

  // ② 로그인 확인 없는 서버 코드 — 남의 데이터가 보인다
  const noAuth = files.filter((f) => {
    let t = '';
    try { t = fs.readFileSync(f.abs, 'utf8'); } catch (_) { return false; }
    const handles = /export\s+(async\s+)?function\s+(GET|POST|PUT|PATCH|DELETE)|router\.(get|post|put|patch|delete)|app\.(get|post|put|patch|delete)/.test(t);
    if (!handles) return false;
    return !/(auth|session|user|requireUser|getUser|verifyToken|jwt)/i.test(t);
  });
  if (noAuth.length) {
    out.push(problem(
      `누구나 접근할 수 있는 서버 기능이 있어요: ${noAuth.slice(0, 3).map((f) => f.rel).join(', ')}`,
      '로그인한 사람인지 확인하는 절차가 안 보여요.\n' +
      '              일부러 공개한 거라면 그 파일에 이유를 주석으로 남겨주세요.'
    ));
  }

  // ③ 수정·삭제인데 본인 확인이 없다 — 남의 것을 고칠 수 있다
  const noOwner = files.filter((f) => {
    let t = '';
    try { t = fs.readFileSync(f.abs, 'utf8'); } catch (_) { return false; }
    const mutates = /(DELETE|PUT|PATCH)|\.(delete|update)\(/.test(t);
    if (!mutates) return false;
    return !/(userId|user_id|authorId|author_id|owner|createdBy|eq\(\s*['"]user)/i.test(t);
  });
  if (noOwner.length) {
    out.push(problem(
      `본인 것인지 확인하지 않고 고치거나 지우는 곳이 있어요: ${noOwner.slice(0, 3).map((f) => f.rel).join(', ')}`,
      '로그인만 확인하면 남의 것도 고칠 수 있어요.\n' +
      '              "이게 이 사람 것인가"를 함께 확인해야 해요.'
    ));
  }

  // ④ .gitignore 가 비밀을 막고 있는가
  let ignore = '';
  try { ignore = fs.readFileSync(path.join(root, '.gitignore'), 'utf8'); } catch (_) { /* 없음 */ }
  if (!/^\s*\.env/m.test(ignore)) {
    out.push(problem(
      '비밀번호 파일이 인터넷에 올라갈 수 있어요.',
      '.gitignore 에 .env 를 추가해야 해요.'
    ));
  }

  return out;
}

// --- 실행 ------------------------------------------------------------------

const CHECKS = { security: checkSecurity, spec: checkSpec, plan: checkPlan, verify: checkVerify };

function run(root, which) {
  const s = state.load(root);
  if (!s.currentFeature) ui.fail('진행 중인 기능이 없어요.');
  const id = s.currentFeature.id;

  const names = which === 'all' ? Object.keys(CHECKS) : [which];
  const results = [];
  for (const n of names) {
    if (!CHECKS[n]) ui.fail(`'${n}'는 없는 검사예요.`, `쓸 수 있는 것: ${Object.keys(CHECKS).join(', ')}, all`);
    CHECKS[n](root, id).forEach((p) => results.push({ gate: n, ...p }));
  }

  if (!results.length) {
    ui.header('확인 통과', names.join(' · '));
    ui.line('규격에 맞아요.');
    ui.next('wait', '다음 단계로 갈 수 있어요');
    ui.flush();
    return 0;
  }

  ui.header('아직 통과 못 했어요', `${results.length}건`);
  results.forEach((r, i) => {
    if (i) ui.line();
    ui.line(`⚠️  ${r.what}`);
    ui.line(`    ${r.how}`);
  });
  ui.next('wait', '고친 뒤에 다시 확인할게요');
  ui.flush();
  return 1;
}

module.exports = { run, checkSecurity, checkSpec, checkPlan, checkVerify };
