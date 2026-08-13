# 계약 규약

> 서버와 화면이 규약을 지키게 하는 방법은 **문서가 아니라 타입**이다.
> 산문 규약은 반드시 표류한다. 컴파일되는 규약은 표류할 수 없다.

---

## 1. 위치와 소유권

```
packages/contracts/
  F-003.ts        ← CTO 만 쓴다
  index.ts
```

| | |
|---|---|
| **쓰기** | `cto` 전용 |
| **읽기** | `backend`, `frontend` — 반드시 import 한다 |
| 계약이 틀렸다고 판단되면 | **고치지 말고 블로커를 발행한다** |

구현 담당이 계약을 고치면 그 순간 계약이 아니게 된다. 둘이 각자 고치면 다시 갈라진다.

---

## 2. 한 파일에 무엇이 들어가나

기능 하나당 파일 하나. **네 가지만** 담는다.

```ts
import { z } from 'zod';

// ── 1. 주고받는 것의 모양 ────────────────────────────
export const Strategy = z.object({
  id: z.string(),
  name: z.string(),
  summary: z.string(),
  enabled: z.boolean(),
});

// ── 2. 요청과 응답 ──────────────────────────────────
export const ListStrategiesRes = z.object({
  strategies: z.array(Strategy),
  enabledCount: z.number().int(),
});

export const ToggleStrategyReq = z.object({
  id: z.string(),
  enabled: z.boolean(),
});
export const ToggleStrategyRes = z.object({ strategy: Strategy });

// ── 3. 주소 ─────────────────────────────────────────
export const ROUTES = {
  list: '/api/strategies',
  toggle: '/api/strategies/toggle',
} as const;

// ── 4. 타입 (여기서 파생시킨다. 손으로 다시 쓰지 않는다) ──
export type Strategy = z.infer<typeof Strategy>;
export type ListStrategiesRes = z.infer<typeof ListStrategiesRes>;
export type ToggleStrategyReq = z.infer<typeof ToggleStrategyReq>;
export type ToggleStrategyRes = z.infer<typeof ToggleStrategyRes>;
```

**타입을 손으로 다시 선언하지 마라.** `z.infer` 로 파생시킨다.
따로 쓰면 스키마와 타입이 갈라지고, 그 순간 계약이 거짓말을 시작한다.

---

## 3. 양쪽에서 어떻게 쓰나

### 서버 — 들어온 것을 검증하고, 나가는 것도 검증한다

```ts
import { ToggleStrategyReq, ToggleStrategyRes, ROUTES } from '@contracts/F-003';

// 들어온 것
const body = ToggleStrategyReq.parse(await req.json());

// 나가는 것 — 이걸 빼면 계약을 어겨도 모른다
return Response.json(ToggleStrategyRes.parse({ strategy: updated }));
```

**응답도 반드시 `parse` 한다.** 요청만 검증하면 절반만 지키는 것이다.

### 화면 — 주소를 손으로 쓰지 않는다

```ts
import { ListStrategiesRes, ROUTES } from '@contracts/F-003';

const res = await fetch(`${API}${ROUTES.list}`);
const data = ListStrategiesRes.parse(await res.json());
```

**`'/api/strategies'` 를 문자열로 직접 쓰면 안 된다.** 오타가 나면 런타임에야 안다.

---

## 4. 왜 이렇게까지 하나

`tsc --noEmit` 하나로 **양쪽이 어긋났는지 즉시 잡힌다.**

- 서버가 필드 이름을 바꾸면 → 화면 쪽에서 타입 오류
- 화면이 없는 필드를 읽으면 → 즉시 오류
- 응답 모양이 계약과 다르면 → `parse` 에서 터진다

**규약 위반이 "리뷰 의견"이 아니라 "빌드 실패"가 된다.**
이게 서버와 화면을 동시에 만들 수 있는 유일한 이유다.

---

## 5. 지킬 것

- 기능 하나당 파일 하나. 여러 기능을 한 파일에 섞지 않는다
- **화면에만 필요한 것을 계약에 넣지 않는다** (색, 정렬 순서, 표시 문구)
  계약은 *주고받는 것*이지 *보여주는 방법*이 아니다
- 필드 이름은 `glossary.md` 를 따른다. 사용자는 "전략", 코드는 `strategy`
- 날짜는 ISO 문자열. 숫자는 숫자 (금액을 문자열로 주지 않는다)
- **비밀은 계약에 없다.** 토큰·키가 응답에 들어가면 계약부터 잘못됐다

## 6. 계약을 바꿔야 할 때

계약이 바뀌면 **양쪽이 같이 바뀐다.** 한쪽만 고치면 반드시 깨진다.

1. CTO 가 계약을 고친다
2. `tsc --noEmit` 으로 **어디가 깨지는지 목록을 뽑는다**
3. 그 목록을 지시서에 담아 양쪽에 배정한다

혼자 판단해서 계약을 고치지 마라. 다른 기능이 같은 계약을 쓰고 있을 수 있다.
