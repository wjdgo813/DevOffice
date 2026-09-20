'use strict';

// Jev (TypeSafe) — 판단을 텍스트가 아니라 **타입 있는 값**으로 받는다.
//
// 왜 쓰는가:
//   우리 설계에는 LLM 이 판단하고 그 판단을 우리가 그냥 믿는 지점이 있다.
//   특히 모호함 판정(DIALOGUE §5.1)은 "자기 확신도는 잘 보정되지 않는다"고
//   써놓고서도 결국 LLM 판단에 맡겼다. 확률이 나오면 임계를 실제로 걸 수 있다.
//
// 왜 필수가 아닌가:
//   · 가격이 공개돼 있지 않은 외부 서비스다
//   · 비개발자에게 네 번째 계정을 요구하면 S3 에서 이탈한다
//   → **키가 있으면 쓰고, 없으면 지금처럼 한다.** 사용자에게 묻지 않는다.
//     expo check(오프라인이면 추측 안 함)·Artifact(없으면 ASCII) 와 같은 패턴이다.

const ENDPOINT = 'https://api.typesafe.ai/v1/systemone';
const MODEL = 'jev-latest';

function apiKey() {
  return process.env.TYPESAFE_API_KEY || null;
}

function available() {
  return !!apiKey();
}

/** 질문 만들기 도우미 — 형식을 손으로 쓰다 틀리지 않게. */
const ask = {
  noul: (instructions, criteria) => ({ type: 'noul', instructions, ...(criteria ? { criteria } : {}) }),
  choice: (instructions, criteria) => ({ type: 'choice', instructions, criteria }),
  score: (instructions, levels) => ({ type: 'score', instructions, criteria: levels }),
};

/**
 * 물어본다. 실패하면 던지지 않고 `{ ok:false }` 를 돌려준다 —
 * 외부 서비스가 죽어서 제품이 멈추면 안 된다.
 */
async function evaluate(state, questions, opts) {
  const key = apiKey();
  if (!key) return { ok: false, reason: 'NO_KEY' };

  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), (opts && opts.timeoutMs) || 20000);
  try {
    const res = await fetch(ENDPOINT, {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ state, model: (opts && opts.model) || MODEL, questions }),
      signal: ac.signal,
    });
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      return { ok: false, reason: `HTTP_${res.status}`, detail: body.slice(0, 300) };
    }
    const json = await res.json();
    return { ok: true, model: json.model, answers: json.answers || {}, usage: json.usage };
  } catch (e) {
    return { ok: false, reason: e.name === 'AbortError' ? 'TIMEOUT' : 'NETWORK', detail: e.message };
  } finally {
    clearTimeout(timer);
  }
}

// --- DevOffice 가 실제로 묻는 것들 -----------------------------------------

/**
 * 모호함 판정 (DIALOGUE §5.1).
 * 모호함 = 해석의 갈래 × 갈래 간 결과 차이. 두 축을 따로 물어 곱한다.
 */
const AMBIGUITY = {
  forks: ask.score(
    '이 요청을 서로 다르게 해석할 여지가 얼마나 있는가',
    ['해석이 하나뿐이다', '두어 가지로 읽힌다', '여러 갈래로 갈린다']
  ),
  gap: ask.score(
    '다르게 해석했을 때 만들어질 결과물이 얼마나 달라지는가',
    ['거의 같다', '눈에 보이게 다르다', '완전히 다른 것이 된다']
  ),
  reversible: ask.score(
    '이 결정을 나중에 되돌리는 비용',
    ['문구·색처럼 즉시 바꿀 수 있다', '화면을 다시 만들면 된다', '데이터 구조·권한이라 되돌리기 어렵다']
  ),
};

/** 타당성 3색 (PROTOCOL §8.2). */
const FEASIBILITY = ask.choice(
  '이 기능을 만들 수 있는지 확인이 필요한 정도',
  {
    green: '표준 기능. 외부 서비스나 특정 데이터에 의존하지 않는다 (로그인·목록·검색·글쓰기)',
    yellow: '외부 서비스에 의존한다. 되는지 가벼운 확인이 필요하다 (결제·지도·푸시·소셜로그인)',
    red: '특정 데이터 확보·크롤링·법적 제약처럼 아예 불가능할 수 있다. 깊은 조사가 필요하다',
  }
);

/** 변경 요청 분류 (CHANGE.md §2). */
const CHANGE_KIND = ask.choice(
  '사용자의 이 요청이 어떤 종류인가',
  {
    add: '기존 동작은 그대로 남고 새로운 것이 얹힌다',
    modify: '기존 동작이 바뀌거나 없어진다',
    bug: '명세대로 만들었는데 그대로 동작하지 않는다',
    unclear: '무엇을 바꾸려는 것인지 알 수 없다',
  }
);

// --- 시험 세트 -------------------------------------------------------------
//
// **기대값을 먼저 정해두는 것이 핵심이다.**
// 키를 받은 뒤 "좋아 보인다"로 판단하면 그건 측정이 아니라 인상이다.
// 우리 설계 논의에서 실제로 나온 문장들을 쓴다.

const TESTSET = {
  ambiguity: [
    // [문장, 기대 강도(허용 범위)]
    ['버튼을 파랗게 해주세요', [0, 2], '되돌리기 쉽고 해석 폭이 좁다'],
    ['댓글 500자를 1000자로 늘려주세요', [0, 2], '기존 동작 유지, 작은 변경'],
    ['글 목록 정렬해줘', [2, 4], '최신순/인기순/선택 — 결과가 크게 갈린다'],
    ['로그인 기능 만들어줘', [2, 4], '불충분. 방식·인증·찾기가 전부 빈칸'],
    ['회원 등급 만들어줘', [3, 4], '등급이 권한인지 표시인지. 권한이면 되돌리기 어렵다'],
    ['잔액 화면 좀 바꾸고 싶은데요', [3, 4], '대상·동작·목적지가 모두 모호'],
  ],
  feasibility: [
    ['사람들이 글을 쓰고 목록에서 볼 수 있게', 'green', '표준 기능'],
    ['글을 검색할 수 있게', 'green', '표준 기능'],
    ['카카오페이로 결제할 수 있게', 'yellow', '외부 서비스 의존'],
    ['카카오톡으로 알림을 보내고 싶어요', 'yellow', '외부 서비스 + 심사'],
    ['서울 부동산 호가 리스트를 보여주고 싶어요', 'red', '호가 데이터는 공공 API에 없다'],
    ['인스타그램 게시물을 자동으로 모아오고 싶어요', 'red', '이용약관상 금지'],
  ],
  change: [
    ['댓글에 사진도 넣어주세요', 'add', '기존 댓글은 그대로 동작'],
    ['댓글은 500자까지만 되게 해주세요', 'modify', '기존 동작이 바뀐다'],
    ['댓글 삭제 기능 빼주세요', 'modify', '없어진다'],
    ['댓글이 안 지워져요', 'bug', '명세대로인데 동작하지 않는다'],
    ['그거 좀 바꿔주세요', 'unclear', '무엇을 바꾸는지 알 수 없다'],
  ],
};

/** 모호함 두 축을 되묻기 강도로 환산한다 (DIALOGUE §5.2). */
function strengthOf(answers) {
  const f = answers.forks, g = answers.gap, rv = answers.reversible;
  if (!f || !g) return null;
  const m = (f.score / 2) * (g.score / 2);
  const s = m < 0.15 ? 0 : m < 0.35 ? 2 : (rv && rv.score >= 1.5) ? 4 : 3;
  return { magnitude: m, strength: s };
}

module.exports = {
  available, evaluate, ask,
  AMBIGUITY, FEASIBILITY, CHANGE_KIND,
  TESTSET, strengthOf,
  ENDPOINT, MODEL,
};
