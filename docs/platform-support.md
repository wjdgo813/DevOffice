# Claude Code와 Codex 지원 구조

DevOffice의 제품 규칙, 상태 형식, CLI, 역할 지침은 하나의 공통 원본으로 관리한다. 플랫폼별 폴더에는 런타임이 요구하는 매니페스트와 이벤트 입출력 어댑터만 둔다.

## 원본과 생성물

| 책임 | 원본 | 사용처 |
|---|---|---|
| 공통 플러그인 이름·버전·설명 | `plugin.source.json` | 루트 Codex `plugin.json`·`marketplace.json`, Claude `.claude-plugin/` 매니페스트 |
| 사용자 업무 흐름 | `skills/` | Claude Code와 Codex에서 같은 Skills 사용 |
| 역할 절차 | `agents/*.md` | Claude 에이전트 정의 및 `codex/skills/devoffice-role-*/SKILL.md` 생성 |
| CLI와 상태 전이 | `bin/`, `lib/` | 두 런타임에서 같은 실행 파일 사용 |
| 안전 정책과 에러 문구 | `hooks/lib/` | 두 런타임 어댑터에서 같은 정책 함수 호출 |
| Claude hook 배선 | `hooks/hooks.json` | Claude Code |
| Codex hook 배선 | `hooks/adapters/codex/hooks.json` | Codex |

생성된 매니페스트와 역할 스킬은 직접 편집하지 않는다. 원본을 수정한 뒤 `node scripts/build-plugins.js`를 실행한다. CI나 릴리스 전에는 `node scripts/build-plugins.js --check`가 성공해야 한다.

## 런타임 경계

- 공통 `SKILL.md`는 표준 이름·설명 프런트매터와 상대 리소스 경로를 쓴다.
- Claude Code는 기존 `agents/*.md` 역할과 훅 이벤트를 사용한다.
- Codex는 동일 역할 본문을 `devoffice-role-*` Skills로 제공하고, 서브에이전트 지시문에 해당 스킬을 포함한다.
- Codex의 `SessionStart`, `PreToolUse`, `PostToolUse`, `Stop` 이벤트는 Codex 어댑터가 처리한다. `PostToolUseFailure`가 없어 실패한 Bash 실행을 `PostToolUse`에서 읽는다.
- 모든 훅의 실제 정책 판단은 `hooks/lib/`에 둔다. 어댑터는 요청 필드와 결과 형식만 맞춘다.
- Codex 플러그인 훅은 첫 설치 뒤 사용자가 신뢰해야 실행된다.

## 알려진 런타임 차이

Claude Code는 훅 입력의 `agent_type`으로 계약 파일 쓰기를 역할별로 제한한다. Codex의 `PreToolUse` 쓰기 입력에는 작성 주체 정보가 없으므로 현재 어댑터는 같은 역할별 제한을 강제하지 않는다. Codex에서는 CTO의 계약·계획 작업을 메인 세션에서 수행하고 역할 스킬 지침과 통합 게이트를 적용한다. 비밀키, 파괴적 명령, 제품 폴더 밖 쓰기 검사는 Codex 파일 패치를 포함해 공통 정책을 적용한다.

Codex 훅은 자동 승인되지 않는다. 훅이 신뢰되기 전에는 안전 검사와 잠금 알림이 작동하지 않으므로, 설치 후 Codex의 훅 검토 단계를 완료해야 한다.
