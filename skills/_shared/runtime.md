# 런타임 연결 규칙

제품 규칙, 상태 파일, CLI 동작은 모든 런타임에서 같다. 아래 항목만 현재 런타임에 맞춘다.

## 역할 위임

- **Claude Code:** `agents/<역할>.md` 에 정의된 역할 에이전트를 호출한다.
- **Codex:** 서브에이전트를 쓸 수 있으면 구현·QA 역할에 작업 지시와 `$devoffice-role-<역할>` 스킬을 지정한다. 예: `$devoffice-role-backend`, `$devoffice-role-frontend`.
- **Codex 계약 소유권:** `packages/contracts/**`와 `plan.md`의 작성·수정은 CTO 스킬을 적용한 메인 세션에서 한다. Codex의 `PreToolUse` 쓰기 이벤트에는 작성 주체 정보가 없어서 현재 어댑터는 Claude Code처럼 위임 역할별 쓰기를 강제하지 못한다. 따라서 Codex에서는 CTO의 계약·계획 작업을 서브에이전트에 위임하지 않는다.
- **서브에이전트가 없는 경우:** 같은 역할 지침을 현재 세션에서 순서대로 적용하고, 동일한 `.devoffice/` 산출물과 게이트를 남긴다.
- 질문, 결정, 확인 요청은 항상 메인 세션에서 사용자에게 한다.

Codex 역할 스킬은 `agents/*.md`에서 `codex/skills/`로 생성된다. 역할 지침을 바꿀 때 해당 원본을 수정하고 `node scripts/build-plugins.js`를 실행한다.

## CLI 실행

- **Claude Code:** `devoffice <명령>`을 사용한다.
- **Codex:** 세션 시작 안내에 표시된 번들 CLI 경로를 사용한다. `node "<안내된 경로>/bin/devoffice" <명령>` 형식이다. 같은 CLI 구현을 실행하며 별도 복사본을 설치하지 않는다.

스킬의 참고 파일 경로는 해당 `SKILL.md`가 있는 폴더를 기준으로 해석한다.
