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

module.exports = { available, evaluate, ask, AMBIGUITY, FEASIBILITY, CHANGE_KIND, ENDPOINT, MODEL };
