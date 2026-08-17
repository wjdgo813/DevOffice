# DevOffice 구현 작업 기록

> **이 파일이 진실의 원천이다.** 세션이 끊기면 여기부터 읽는다.
> 우리가 사용자에게 요구하는 방식([PROTOCOL §3](./PROTOCOL.md))을 우리 자신에게도 적용한다.

---

## 재개 방법

```
1. 이 파일의 "현재 위치"를 읽는다
2. 🔄 진행 중인 작업이 있으면 처음부터 다시 한다 (원자적이라 싸다)
3. 없으면 ⬜ 중 의존성이 해소된 첫 작업을 시작한다
```

**현재 위치**

| | |
|---|---|
| 버전 | **v0.1** (목표: 배포된 첫 화면) |
| 완료 | **Phase A~H ✅ — v0.1 코드 완성** |
| 진행 중 | — |
| 다음 작업 | **v0.2** — 기능 루프. 시나리오는 [docs/feature-flow.md](./docs/feature-flow.md) |
| ⚠️ 발견 | **S5(백로그) 스킬이 어느 로드맵에도 없었다.** v0.2 첫 작업 |
| 마지막 갱신 | 2026-08-10 |

> **두 층이 다 섰다.**
> · A~D = **기계가 지키는 부분** (게이트·잠금·훅). 어길 수 없다
> · E~H = **에이전트가 따르는 부분** (스킬·규칙집·에이전트). 어겨도 위층이 잡는다
>
> **아직 검증되지 않은 것:** 스킬과 에이전트는 문법 검사만 했다.
> 실제로 대화를 굴려보기 전까지는 프롬프트가 의도대로 동작하는지 모른다.
> A~D는 실행해서 확인했지만 E~H는 **읽어본 것뿐**이다.

## 다음 단계 — 실사용 검증

v0.2로 넘어가기 전에 반드시 한다. 순서:

1. 이 저장소를 마켓플레이스로 추가하고 플러그인 설치
2. 빈 폴더에서 세션을 열고 **`/devoffice` 를 호출**해 대화가 시작되는지 확인
3. 아이디어 → 이름 → PRD → 스택 → 계정 → 배포까지 **실제로 통과**
4. 막힌 지점을 이 파일에 기록하고 고친다

**여기서 나오는 수정이 v0.2 설계보다 중요하다.**
지금까지는 전부 추측이고, 첫 실사용이 유일한 사실이다.

---

## 규칙

- 작업 하나가 끝날 때마다 **즉시** 이 파일을 갱신한다. 몰아서 하지 않는다
- 상태: ⬜ 대기 · 🔄 진행 중 · ✅ 완료 · 🚫 보류
- 완료 시 **결과물 경로**를 적는다. "완료"만 적으면 재개할 때 못 믿는다
- 막히면 추측하지 않고 🚫로 표시하고 이유를 적는다

---

## Phase A — 뼈대 (플러그인이 로드된다)

| ID | 작업 | 상태 | 결과물 |
|---|---|---|---|
| A1 | 저장소 구조 + `plugin.json` | ✅ | `.claude-plugin/plugin.json` |
| A2 | 마켓플레이스 매니페스트 | ✅ | `.claude-plugin/marketplace.json` |
| A3 | `bin/devoffice` 라우터 + 공통 유틸 | ✅ | `bin/devoffice`, `lib/paths.js`, `lib/ui.js` |
| A4 | **한국어 출력 보정** — 화면 폭·조사 | ✅ | `lib/ui.js` (`width`, `josa`, `withJosa`) |

**완료 조건:** `devoffice --help`가 동작한다 ✅ (검증됨)

---

## Phase B — 상태 (조직의 기억이 생긴다)

| ID | 작업 | 상태 | 결과물 |
|---|---|---|---|
| B1 | `.devoffice/` 스키마 정의 | ✅ | `lib/schema.js` |
| B2 | `devoffice init` · `state show/get/set` | ✅ | `lib/state.js` |
| B3 | `devoffice journal` (append-only) | ✅ | `lib/journal.js` |
| B4 | `devoffice feature` + **진행 잠금 (D53)** | ✅ | `lib/feature.js` |
| B5 | `devoffice task` add/start/done/block/resolve | ✅ | `lib/task.js` |
| B6 | 서류철 생성 + 서식 (spec/plan/verify) | ✅ | `lib/scaffold.js` |

**완료 조건:** 상태를 읽고 쓸 수 있고, **미검증 기능이 있으면 다음 기능이 차단된다** ✅

---

## Phase C — 게이트 (규칙이 강제된다)

| ID | 작업 | 상태 | 의존 | 결과물 |
|---|---|---|---|---|
| C0 | 마크다운 파서 (절·표·목록·주석) | ✅ | — | `lib/md.js` |
| C1 | `gate spec` — 가정명세·안만드는것·AC 5개 상한 | ✅ | B5 | `lib/gate.js` |
| C2 | `gate plan` — AC×작업 매트릭스·준비물·재사용·작업 8개 | ✅ | B5 | `lib/gate.js` |
| C3 | `gate verify` — 기대 결과 필수·직링크 | ✅ | B5 | `lib/gate.js` |
| C4 | `devoffice doctor` — 로컬 환경 점검 | ✅ | A3 | `lib/doctor.js` |

**완료 조건:** 규격을 어긴 문서가 게이트를 통과하지 못한다 ✅

---

## Phase D — 훅 (안전망)

| ID | 작업 | 상태 | 의존 | 결과물 |
|---|---|---|---|---|
| D0 | 훅 공통 유틸 (fail-open) | ✅ | — | `hooks/lib/hook.js` |
| ~~D1~~ | ~~`SessionStart`~~ — **철회.** 플러그인이 먼저 말을 걸지 않는다 (D26') | 🚫 | — | 이어하기는 `devoffice` 스킬이 담당 |
| D2 | `PreToolUse` — 비밀키·실데이터·폴더 밖 차단 | ✅ | A3 | `hooks/guard.js` |
| D3 | `PostToolUseFailure` — 에러 번역 (사전 9종) | ✅ | A3 | `hooks/translate-error.js` |
| D4 | `Stop` — 확인 안 받고 넘어가는 것 방지 | ✅ | B4 | `hooks/check-lock.js` |
| D5 | `hooks/hooks.json` 배선 | ✅ | D1~D4 | `hooks/hooks.json` |

**완료 조건:** 되돌릴 수 없는 사고가 기계적으로 막힌다 ✅

> **훅은 전부 fail-open이다.** 훅의 버그로 사용자를 막는 것이 가장 나쁜 결과라,
> 예외가 나면 조용히 통과시킨다. 그리고 **DevOffice 제품이 아닌 폴더에서는 아무것도 하지 않는다** —
> 남의 세션을 가로채면 안 된다.

---

## Phase E — 말하기 (출력 규격)

| ID | 작업 | 상태 | 결과물 |
|---|---|---|---|
| E1 | 출력 규격 | ✅ | `output-styles/devoffice.md` |
| E2 | 프로듀서 스킬 (진입점·디스패처) | ✅ | `skills/devoffice/SKILL.md` |
| E3 | 공용 규칙집 — 대화 규격 · 회사 규칙 | ✅ | `skills/_shared/dialogue.md`, `house-rules.md` |
| E4 | **항상-켜짐 층** — `CLAUDE.md` + `.gitignore` 자동 생성 | ✅ | `lib/state.js` |

**완료 조건:** 세션을 열면 규칙이 자동으로 적용된다 ✅

> **규칙을 세 층으로 나눴다.** 스킬만으로는 부족하다 — 스킬은 호출돼야 로드되기 때문이다.
> · `CLAUDE.md` (init이 생성) — 항상 읽힘. 짧게, 핵심 6줄만
> · `SKILL.md` — 호출 시 로드. 절차 전체
> · `_shared/*.md` — 에이전트가 필요할 때 읽음. 상세 규격

---

## Phase F — 첫 흐름 (S0 → S1)

| ID | 작업 | 상태 | 의존 | 결과물 |
|---|---|---|---|---|
| F1 | 인테이크 (차례 1) — 레퍼런스·기존 자료·3색 분류 | ✅ | E2 | `skills/devoffice-intake/` |
| F2 | **제품 이름** (차례 1.5) — 후보 3개 제시 | ✅ | E2 | `skills/devoffice-naming/` |
| F3 | PRD (차례 2) — 요약 3가지·기대 관리·준비물 예고 | ✅ | E2 | `skills/devoffice-prd/` |

**완료 조건:** 대화만으로 PRD가 나온다 ✅ (실사용 검증은 Phase H 이후)

---

## Phase G — 에이전트 (v0.1 최소)

| ID | 작업 | 상태 | 결과물 |
|---|---|---|---|
| G1 | `cto` — 계약·계획·증거 대조·그레이 영역 | ✅ | `agents/cto.md` (opus, `memory: project`) |
| G2 | `research` — 실호출 검증·증거주의 | ✅ | `agents/research.md` (sonnet, 웹 도구) |
| G3 | `env-doctor` — 준비물·계정 안내 | ✅ | `agents/env-doctor.md` (haiku) |

**완료 조건:** v0.1에 필요한 에이전트 3종이 로드된다 ✅

### 전체 로스터 — 8개 (v0.1에서 3개)

**3개가 전부가 아니다.** 나머지는 그 에이전트가 *필요해지는 버전*에서 만든다.
아직 안 쓰는 에이전트를 미리 만들면 검증할 수 없어 그냥 추측이 된다.

| 에이전트 | 언제 | 왜 그때인가 |
|---|---|---|
| `cto` | **v0.1** ✅ | 스택 잠금(H1)에 필요 |
| `research` | **v0.1** ✅ | 인테이크에서 🔴이 나오면 즉시 필요 |
| `env-doctor` | **v0.1** ✅ | 계정·설치(H2)에 필요 |
| `backend` | v0.2 | 기능 루프가 생겨야 할 일이 있다 |
| `frontend` | v0.2 | 〃 (`both` 프리셋이면 두 번 호출) |
| `qa` | v0.2 | 검증 단계가 생겨야 한다. **읽기 전용** |
| `fixer` | v0.3 | L3 대조에서 ❌가 나와야 할 일이 생긴다 |
| `infra` | v1.0 | `server-vps` 를 고른 프로젝트에서만 |
| ~~`spec-writer`~~ | **보류** | 프로듀서가 직접 쓴다. 컨텍스트 압박이 실제로 확인되면 분리 |

**정의된 8개가 한 프로젝트에서 다 켜지지는 않는다.** `state.json` 의 `roster` 가
프로젝트 구성에 따라 활성/비활성을 관리한다 (PROTOCOL §4.3).
BaaS를 쓰면 `infra` 는 영원히 안 켜지고, 웹만 만들면 `frontend` 는 한 번만 호출된다.

---

## Phase H — 골격 (S2 → S4) · v0.1 마무리

| ID | 작업 | 상태 | 의존 | 결과물 |
|---|---|---|---|---|
| H1 | 웹/앱 3지선다 + 백엔드 판정 + 스택 잠금 | ✅ | G1 | `skills/devoffice-architect/` |
| H2 | 도구·계정 안내 + `accounts.md` | ✅ | G3 | `skills/devoffice-setup/` |
| H3 | 스캐폴딩 — **덧씌우기 방식** | ✅ | H1 | `lib/project.js`, `templates/scaffold/web-next/` |
| H5 | **`mobile-expo` 서식** — 실사용 검증 중 발견 | ✅ | H3 | `templates/scaffold/mobile-expo/` |
| H6 | **앱 비용 안내 수정** — Xcode 유무로 분기 | ✅ | H1 | `skills/devoffice-architect/`, `devoffice-skeleton/` |
| H7 | **Expo SDK 호환성 확인** — 만들기 전 `expo check`, 막혔을 때 `expo status` | ✅ | H5 | `lib/expo.js` |
| H8 | **진단 규칙** — 확인 순서 사다리 5단계 | ✅ | — | `skills/_shared/diagnose.md` |
| H4 | 배포 + 첫 화면 | ✅ | H3 | `skills/devoffice-skeleton/` |

**v0.1 완료 조건:** 비개발자가 대화만으로 **배포된 첫 화면**을 갖는다 ✅ (실사용 검증 남음)

> **H3에서 Next.js 원본을 싣지 않았다.** 프레임워크는 빨리 바뀌고 얼린 복사본은 곧 낡는다.
> `create-next-app` 이 만든 위에 **우리 것만 덧씌운다**(`templates/` 에는 diff 만).
> 기존 파일은 `--force` 없이 건드리지 않는다 — 사용자가 고친 걸 되돌리면 안 된다.

---

## Phase I — v0.2 기능 루프

| ID | 작업 | 상태 | 결과물 |
|---|---|---|---|
| I1 | **`devoffice-backlog`** — 목록·순서·타당성 3색 | ✅ | `skills/devoffice-backlog/` |
| I2 | **`devoffice-spec`** — 화면을 함께 그린다 | ✅ | `skills/devoffice-spec/` |
| I3 | `research` 모드 B — 도메인 관행 조사 | ✅ | `agents/research.md` |
| **I3-b** | **기능 수정** — 상태 판정·영향 범위·데이터 처리 | ✅ | `CHANGE.md`, `lib/impact.js`, `skills/devoffice-change/` |
| I4 | `backend` 에이전트 | ✅ | `agents/backend.md` |
| I5 | `frontend` 에이전트 | ✅ | `agents/frontend.md` |
| I6 | `qa` 에이전트 (읽기 전용) | ✅ | `agents/qa.md` |
| I7 | `devoffice-feature` — ②~⑦ 진행 | ✅ | `skills/devoffice-feature/` |
| I8 | L0 보안 게이트 | ✅ | `lib/gate.js` (`gate security`) |
| I9 | 계약 규약 | ✅ | `skills/_shared/contracts.md` |

**시나리오:** [docs/feature-flow.md](./docs/feature-flow.md)

> **I2가 v0.2의 핵심이다.** 원래 설계의 명세 단계는 "빠진 빈칸을 채우는" 방식이었는데,
> 비개발자는 **"어떻게 보일지"를 상상하지 못한다.** 가정하면 틀리고, 물으면 "모르겠다"가 온다.
> 그래서 **리서치로 실제 사례를 찾아와 스케치와 함께 고르게 한다.**

---

## Phase J — v0.3

| ID | 작업 | 상태 | 결과물 |
|---|---|---|---|
| J1 | `fixer` 에이전트 — 원인 확정 후 최소 수리 | ✅ | `agents/fixer.md` |
| J2 | 회귀 규약 — 자동/수동 경계 | ✅ | `skills/_shared/regression.md` |
| J3 | `gate regression` — 깨진 걸 **기능 이름으로** 되돌려준다 | ✅ | `lib/regression.js` |
| J4 | `qa` 에 회귀 테스트 생성 역할 | ✅ | `agents/qa.md` §4-b |
| J5 | 기능 루프에 ⑦회귀 단계 | ✅ | `skills/devoffice-feature/` |
| J6 | `devoffice status` — 현 상태 한 화면 | ✅ | `lib/status.js` |

**완료 조건:** 예전에 확인받은 기능이 깨지면 **우리가 먼저 안다** ✅

> **모바일에서 Playwright 는 못 쓴다.** Expo 는 `jest-expo` + RNTL 로
> 렌더·상호작용·상태를 실기기 없이 확인한다. 커버 못 하는 것(실기기 느낌,
> 외부 API)은 `regression.md` 수동 체크리스트로 남긴다 — 없애지 않는다.

---

## 개발 중 운영 메모

**고친 걸 사용자에게 전달하려면 두 가지가 필요하다.**

1. **버전을 올린다.** `plugin.json` 의 `version` 은 핀이라 안 올리면 `update` 가 거부된다
2. **세션에 반영한다** — 아래 중 하나

```bash
# 터미널에서
claude plugin marketplace update devoffice
claude plugin update devoffice@devoffice
```

```
# 세션 안에서 (재시작 없이)
/reload-plugins
```

**반영됐는지 확인:**

```bash
devoffice version      # 방금 올린 버전이 나오면 성공
```

| 무엇이 | `/reload-plugins` | 재시작 |
|---|---|---|
| 스킬 (`SKILL.md`) | ✅ | ✅ |
| 에이전트 | ✅ | ✅ |
| 훅 | ✅ (새 경로로 전환) | ✅ |
| **`bin/` 실행 파일** | **확인 필요** — 문서에 명시 없음 | ✅ |
| 모니터 | ❌ | ✅ |

> `bin/` 은 문서가 `/reload-plugins` 대상으로 언급하지 않는다.
> **`devoffice version` 으로 확인하고, 옛 버전이 나오면 재시작한다.**

---

## 작업 일지

| 날짜 | 작업 | 메모 |
|---|---|---|
| 2026-08-10 | A1 ✅ | 설계 문서는 루트 유지, 플러그인 구조를 나란히 배치 |
| 2026-08-10 | A2 ✅ | 이 저장소 자체가 마켓플레이스 |
| 2026-08-10 | A3 ✅ | **의존성 0** — Node 내장 모듈만. npm install 전에도 동작해야 함 |
| 2026-08-10 | B1 ✅ | `phase` 9종, `hasRealData` 포함 |
| 2026-08-10 | B2 ✅ | 원자적 쓰기(tmp→rename)로 중단 시 손상 방지 |
| 2026-08-10 | B3 ✅ | JSONL. Phase 2 GUI의 이벤트 소스 |
| 2026-08-10 | B4 ✅ | **D53 진행 잠금 구현.** 미검증 기능이 있으면 `feature start` 실패 (종료코드 2) |
| 2026-08-10 | A4 ✅ | 검증 중 발견 — 한글은 화면에서 2칸이라 `.length`로 정렬하면 전부 어긋난다. 조사도 틀렸다("보기을"). D5(전면 한국어) 때문에 필수 |
| 2026-08-10 | B5·B6 ✅ | `task done` 한 번이 worklog·state·journal 세 곳을 갱신 |
| 2026-08-10 | C0~C3 ✅ | **서식 자리표시자를 전부 HTML 주석으로 바꿈.** 안 그러면 게이트가 빈 서식을 통과시킨다 (검증 중 발견) |

### 검증 기록

| 항목 | 결과 |
|---|---|
| `init` → `state show` → `feature start` 흐름 | ✅ |
| **미검증 상태에서 다음 기능 차단** | ✅ 종료코드 2 |
| 미확인 상태에서 `complete` 거부 | ✅ 종료코드 1 |
| `verify` → 잠금 해제 → 다음 기능 시작 | ✅ |
| `journal.jsonl` 이벤트 8건 기록 | ✅ |
| 조사 9종 (을/를·이/가·은/는·으로/로) | ✅ |
| 한글 폭 정렬 | ✅ |
| 기능 시작 시 서류철 3종 자동 생성 | ✅ |
| `task done` → worklog·state·journal 동시 갱신 | ✅ |
| **작업 8개 상한** (PROTOCOL §11.2) | ✅ 종료코드 1 |
| 미완료 작업 있는 채로 `verify` 거부 | ✅ 종료코드 1 |
| `task block` → 블로커 문서 + "추측 금지" 안내 | ✅ |
| 빈 서식에서 `gate all` → 8건 전부 감지 | ✅ |
| 제대로 채운 문서 → 통과 | ✅ |
| **AC 5개 상한** | ✅ |
| **매핑 안 된 AC 감지** (그레이 영역) | ✅ |
| **기대 결과 없는 확인 항목 감지** + 어느 항목인지 지목 | ✅ |
| `doctor` — Node·git·gh 점검 | ✅ |
| ~~SessionStart~~ | 🚫 철회 |
| Stop — 확인 안 받은 기능 되짚기 | ✅ |
| 에러 번역 (EADDRINUSE 등 9종) | ✅ |
| **.env 스테이징된 채 커밋 차단** | ✅ |
| **소스에 API 키 하드코딩 차단** | ✅ |
| **제품 폴더 밖 쓰기 차단** | ✅ |
| 정상 작업은 통과 | ✅ |
| **실 데이터 전 DB리셋 통과 / 후 차단** (D33) | ✅ |
| `claude plugin validate --strict` | ✅ 통과 |

### 구현 중 고친 버그

| 증상 | 원인 | 교훈 |
|---|---|---|
| 게이트가 빈 서식을 통과시킴 | 서식의 자리표시자를 "채운 내용"으로 오인 | **안내문은 HTML 주석으로.** 채운 것과 안 채운 것이 갈려야 한다 |
| 표만 있는 절이 안 잡힘 | 구분선을 표 줄에서 제외해 행 수 비교가 어긋남 | 구분선도 표의 일부다 |
| 기대 결과 누락이 안 잡힘 | 3줄 고정 창이 **다음 항목까지 넘어감** | 창을 줄 수로 고정하지 말고 **다음 항목 직전까지** |
