'use strict';

// .devoffice/state.json 스키마.
//
// 이 파일이 Phase 2 GUI의 데이터 계약이다 (DESIGN §8).
// 필드를 바꿀 때는 VERSION 을 올리고 migrate() 에 경로를 추가한다.

const VERSION = 1;

/** 단계. DESIGN §4.1 의 S-1~S12 에 대응한다. */
const PHASES = [
  'INTAKE',        // S0  아이디어 대화
  'NAMING',        // S0  제품 이름
  'PRD',           // S1  제품 정의
  'DESIGN',        // S2  스택 잠금
  'SETUP',         // S3  계정·환경
  'SKELETON',      // S4  첫 화면 배포
  'BACKLOG',       // S5  기능 목록
  'FEATURE_LOOP',  // S6  기능 하나씩
  'OPERATE',       // S7~ 운영
];

/**
 * 사용자가 보는 큰 단계. 내부 phase 9개는 너무 잘아서 한눈에 안 들어온다.
 *
 * 여기서 두 가지를 함께 정의한다:
 *   name    이번 단계에서 **무엇이 나오는지** (하는 일이 아니라 결과물)
 *   decides 이 단계가 **무엇을 정하는지** → 아직 안 지난 단계 = "아직 안 정한 것"
 *
 * 사용자의 불안은 "정해진 걸 모르는 것"이 아니라 **"안 정해진 걸 모르는 것"**에서 온다.
 */
// decides 는 **결정이 잠기는 단계에만** 채운다.
// 준비(3)와 확인(4)은 결정이 아니므로 비운다 — 목록이 길어지면 안 읽는다.
const STAGES = [
  { no: 1, name: '무엇을 만들지 정하기', phases: ['INTAKE', 'NAMING', 'PRD'], decides: '무엇을 만들지, 제품 이름' },
  { no: 2, name: '어떻게 만들지 정하기', phases: ['DESIGN'], decides: '웹인지 앱인지, 서버가 필요한지' },
  { no: 3, name: '준비물 갖추기', phases: ['SETUP'], decides: null },
  { no: 4, name: '빈 화면 띄워보기', phases: ['SKELETON'], decides: null },
  { no: 5, name: '만들 기능 정하기', phases: ['BACKLOG'], decides: '어떤 기능을 어떤 순서로 만들지' },
  { no: 6, name: '기능 하나씩 만들기', phases: ['FEATURE_LOOP', 'OPERATE'], decides: null },
];

/** 4단계 이름은 웹이냐 앱이냐에 따라 다르다. "첫 화면"은 기능이 있는 화면으로 오해된다. */
const STAGE4_NAME = {
  'web-next': '빈 사이트를 인터넷에 올리기',
  'mobile-expo': '빈 앱을 폰에 띄우기',
  both: '빈 화면을 웹과 폰에 띄우기',
};

function stageOf(phase) {
  return STAGES.find((s) => s.phases.includes(phase)) || STAGES[0];
}

/** 기능 루프 안의 단계. DESIGN §4.3 의 ⓪~⑧. */
const STEPS = [
  'FEASIBILITY',   // ⓪ 타당성
  'SPEC',          // ① 명세
  'CONTRACT',      // ② 계약
  'HANDOFF',       // ③ 지시
  'IMPLEMENT',     // ④ 구현
  'INTEGRATE',     // ⑤ 통합·게이트
  'VERIFY',        // ⑥ 사용자 검증
  'REGRESSION',    // ⑦ 회귀
  'SHIP',          // ⑧ 출시
];

const TASK_STATUS = ['pending', 'in_progress', 'done', 'blocked'];

const BLOCKER_TYPES = [
  'SPEC_UNCLEAR',       // 명세에 없다
  'SPEC_WRONG',         // 명세가 틀렸다 (DIALOGUE §7.3)
  'TECH_WALL',
  'MISSING_DEPENDENCY',
  'SCOPE_TOO_BIG',
];

/** PROTOCOL §11.2 — 기능 크기 상한. 넘으면 쪼갠다. */
const LIMITS = {
  acPerFeature: 5,
  tasksPerFeature: 8,
  minutesPerFeature: 30,
  questionsPerFeature: 2,   // DIALOGUE §5.4 질문 예산
};

function initialState(now) {
  const ts = now || new Date().toISOString();
  return {
    version: VERSION,
    createdAt: ts,
    updatedAt: ts,
    phase: 'INTAKE',

    product: {
      name: null,          // 화면에 보이는 이름 (한국어 가능)
      slug: null,          // 주소·폴더용 영문. 우리가 자동 생성한다
      oneLiner: null,
    },

    // S2 에서 잠긴다. 잠긴 뒤에는 바꾸지 않는다.
    stack: {
      client: null,        // web-next | mobile-expo | both
      backend: null,       // baas-supabase | baas-firebase | server-managed | server-lightsail | server-vps
      lockedAt: null,
    },

    deploy: { url: null, lastDeployedAt: null },

    // SAFETY §5.2 — 실 사용자가 생기면 파괴적 작업의 문턱이 올라간다.
    // 자동 감지하지 않고 S9 에서 사용자에게 묻는다 (SCENARIO §9.5).
    production: { hasRealData: false, switchedAt: null },

    // PROTOCOL §4.3 — 프로젝트마다 팀이 다르다.
    roster: {},

    // 진행 중인 기능. 하나뿐이다 (PROTOCOL §11.3).
    currentFeature: null,

    backlog: [],
  };
}

function newFeature(id, title, now) {
  return {
    id,
    title,
    startedAt: now || new Date().toISOString(),
    step: 'SPEC',
    gates: {
      specApproved: false,
      securityPassed: false,   // L0
      evidenceChecked: false,  // L3
      userVerified: false,     // L4 — 이게 잠금 해제 조건이다
      regressionPassed: false, // L5
    },
    tasks: [],
    blockers: [],
    questionsAsked: 0,         // 질문 예산 소진량
  };
}

/** 미래 버전에서 스키마가 바뀌면 여기에 경로를 추가한다. */
function migrate(state) {
  if (!state || typeof state !== 'object') return initialState();
  if (state.version === VERSION) return state;
  // v1 이 첫 버전이므로 아직 올릴 경로가 없다.
  state.version = VERSION;
  return state;
}

module.exports = {
  VERSION,
  PHASES,
  STAGES,
  STAGE4_NAME,
  stageOf,
  STEPS,
  TASK_STATUS,
  BLOCKER_TYPES,
  LIMITS,
  initialState,
  newFeature,
  migrate,
};
