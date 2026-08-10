'use strict';

// 기능 하나의 서류철을 만든다 (DESIGN §5).
//
// 에이전트는 매번 기억상실 상태로 출근한다(PROTOCOL §1). 서류철의 구조가
// 고정되어 있어야 어느 에이전트가 와도 같은 곳을 찾는다.

const fs = require('fs');
const path = require('path');
const P = require('./paths');
const { LIMITS } = require('./schema');

/** 기능 서류철. handoff/worklog/blockers 가 항상 함께 생긴다. */
function featureDir(root, id) {
  const dir = P.paths(root).feature(id);
  ['handoff', 'worklog', 'blockers'].forEach((sub) =>
    P.ensureDir(path.join(dir, sub))
  );
  return dir;
}

/** 이미 있으면 건드리지 않는다. 재실행해도 안전해야 한다. */
function writeIfAbsent(file, contents) {
  if (fs.existsSync(file)) return false;
  P.writeAtomic(file, contents);
  return true;
}

// --- 서식 -----------------------------------------------------------------

/**
 * 명세 서식. 고정 절이 세 개다:
 *   · 이렇게 이해했습니다  — 가정 명세 (DIALOGUE §3)
 *   · 이번에 안 만드는 것  — 범위 경계 (PROTOCOL §11.5)
 *   · 인수 조건            — 검증 대상 (PROTOCOL §5.1)
 * 하나라도 없으면 gate spec 이 막는다.
 */
function specTemplate(id, title) {
  return `# ${id} · ${title}

## 이렇게 이해했습니다

<!-- 사용자가 말하지 않아 우리가 정한 것. 이유를 반드시 함께 적는다 (DIALOGUE §3).
     이유가 없으면 사용자는 판단하지 못하고 그냥 승인 버튼이 된다.
     보류한 항목은 백로그로 보낸다. -->

| # | 정한 것 | 이유 | 상태 |
|---|---------|------|------|

## 이번에 만드는 것

<!-- 사용자가 화면에서 보게 될 것만 적는다. -->

## 이번에 안 만드는 것

<!-- 이쪽이 더 중요하다 (PROTOCOL §11.5).
     기대와 결과의 차이를 미리 없앤다. 여기 적힌 걸 만들면 범위 위반이다.
     정말 없으면 "없음"이라고 적는다. -->

## 인수 조건

<!-- AC-1 처럼 번호를 붙인다. 확인 가능한 문장이어야 한다.
     "잘 동작한다"는 확인할 수 없다. 최대 ${LIMITS.acPerFeature}개. -->
`;
}

/**
 * 계획 서식. 준비물 절이 비어 있으면 gate plan 이 막는다 (CHECKPOINTS §5.4).
 * 준비물이 없으면 사용자가 검증 자체를 할 수 없기 때문이다.
 */
function planTemplate(id, title) {
  return `# ${id} · ${title} — 작업 계획

## 작업

<!-- 담당 없는 작업은 아무도 하지 않는다. 전부 배정한다.
     최대 ${LIMITS.tasksPerFeature}개. 넘으면 기능을 나눈다. -->

| ID | 담당 | 내용 | 완료 조건 | 관련 AC |
|----|------|------|-----------|---------|

## AC × 작업 매트릭스

<!-- 모든 AC가 최소 하나의 작업에 매핑되어야 한다 (PROTOCOL §6.1).
     매핑 안 된 AC는 아무도 구현하지 않는다. -->

| AC | 담당 작업 |
|----|-----------|

## 재사용할 것

<!-- 기존 코드를 실제로 조사해서 적는다. 에이전트는 기억이 없으므로
     여기 적히지 않으면 같은 걸 또 만든다 (PROTOCOL §2.3).
     조사했는데 없으면 "없음 (조사함)"이라고 적는다. -->

## 검증 준비물

<!-- 없으면 사용자가 확인 자체를 할 수 없다 (CHECKPOINTS §5).
     각 줄에 실제 값을 적는다. -->

- [ ] 테스트 계정:
- [ ] 시드 데이터:
- [ ] 직링크:

## 확인 필요

<!-- 계획을 짜다 드러난 미결 사항. 여기 모아두면 프로듀서가
     구현 전에 한 번에 묻는다 (DIALOGUE §5.5). -->
`;
}

/** 검증 서식. 각 항목은 반드시 "행동 → 기대 결과" 두 부분이다 (CHECKPOINTS §6). */
function verifyTemplate(id, title) {
  return `# ${id} · ${title} — 확인해보실 것

<!-- 규칙 (CHECKPOINTS §6):
     · 홈이 아니라 그 기능이 있는 화면의 직링크를 준다
     · 로그인이 필요하면 테스트 계정을 함께 준다
     · 모든 항목은 "행동 → 이렇게 보이면 정상이에요" 두 부분이다
       기대 결과가 없으면 사용자는 판단할 수 없다
     · 3~5개를 넘기지 않는다 -->

🔗 여기서 확인하세요

`;
}

function worklogTemplate(owner) {
  return `# 작업 일지 · ${owner}

| 시각 | 작업 | 상태 | 메모 |
|------|------|------|------|
`;
}

/** 기능 하나를 시작할 때 서류철과 빈 서식을 만든다. */
function initFeature(root, id, title) {
  const dir = featureDir(root, id);
  const created = [];
  if (writeIfAbsent(path.join(dir, 'spec.md'), specTemplate(id, title))) created.push('spec.md');
  if (writeIfAbsent(path.join(dir, 'plan.md'), planTemplate(id, title))) created.push('plan.md');
  if (writeIfAbsent(path.join(dir, 'verify.md'), verifyTemplate(id, title))) created.push('verify.md');
  return { dir, created };
}

/** 작업 일지에 한 줄 붙인다. 형식이 깨지지 않게 여기서만 쓴다. */
function appendWorklog(root, id, owner, row) {
  const file = path.join(featureDir(root, id), 'worklog', `${owner}.md`);
  if (!fs.existsSync(file)) P.writeAtomic(file, worklogTemplate(owner));
  const time = new Date().toISOString().slice(11, 16);
  fs.appendFileSync(
    file,
    `| ${time} | ${row.task} | ${row.status} | ${(row.note || '').replace(/\|/g, '/')} |\n`,
    'utf8'
  );
  return file;
}

/** 블로커 문서. 구조화되어 있어야 프로듀서가 번역할 수 있다 (PROTOCOL §7.2). */
function writeBlocker(root, id, blocker) {
  const file = path.join(featureDir(root, id), 'blockers', `${blocker.id}.md`);
  P.writeAtomic(
    file,
    `# ${blocker.id} · ${id} · ${blocker.owner || '?'}
type: ${blocker.type}
blocks: ${blocker.task || '-'}

## 무엇이 막혔는가 (사실만)
${blocker.note || ''}

## 왜 막혔는가

## 선택지
A.
B.

## 추천
`
  );
  return file;
}

module.exports = {
  featureDir,
  initFeature,
  appendWorklog,
  writeBlocker,
  writeIfAbsent,
  specTemplate,
  planTemplate,
  verifyTemplate,
};
