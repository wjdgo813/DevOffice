#!/usr/bin/env node
'use strict';

// PostToolUseFailure — 날것의 에러가 사용자에게 그대로 가지 않게 한다 (JOURNEY §2.8).
//
// CLI에서는 원본 에러가 이미 화면에 보인 뒤다. 숨길 수 없다.
// 그래서 숨기려 하지 않고 **해석을 옆에 붙인다.**
//
// 비개발자는 빨간 글씨를 보면 자기가 뭘 잘못했다고 생각하고 멈춘다.
// "무시하셔도 돼요"가 가장 중요한 한 마디다.

const H = require('./lib/hook');

/** 실제로 자주 나오는 것부터. 추상적 분류보다 구체적 증상이 낫다. */
const DICTIONARY = [
  {
    match: /EADDRINUSE|address already in use/i,
    what: '앱을 띄우려는 자리를 다른 프로그램이 이미 쓰고 있어요.',
    todo: '기존 것을 끄고 다시 띄우면 됩니다.',
  },
  {
    match: /ENOENT.*node_modules|Cannot find module/i,
    what: '필요한 부품이 아직 설치되지 않았어요.',
    todo: '설치하고 다시 시도합니다. 1~2분 걸려요.',
  },
  {
    match: /EACCES|permission denied/i,
    what: '이 폴더에 파일을 만들 권한이 없어요.',
    todo: '권한을 확인하거나 다른 위치를 쓰겠습니다.',
  },
  {
    match: /ENOTFOUND|getaddrinfo|ETIMEDOUT|network/i,
    what: '인터넷 연결이 잠깐 끊긴 것 같아요.',
    todo: '연결을 확인하고 다시 시도합니다.',
  },
  {
    match: /authentication|401|unauthorized|not logged in/i,
    what: '계정 연결이 아직 안 되어 있어요.',
    todo: '로그인 절차를 같이 진행하겠습니다.',
  },
  {
    match: /rate limit|429|quota/i,
    what: '잠깐 사이에 요청을 너무 많이 보냈어요.',
    todo: '조금 기다렸다가 다시 시도합니다.',
  },
  {
    match: /JavaScript heap out of memory|ENOMEM/i,
    what: '메모리가 부족해서 멈췄어요.',
    todo: '메모리를 덜 쓰는 방식으로 다시 하겠습니다.',
  },
  {
    match: /type error|TS\d{4}/i,
    what: '앞뒤가 맞지 않는 부분을 미리 잡아냈어요. 실제 문제가 되기 전에 발견한 겁니다.',
    todo: '맞춰놓고 계속하겠습니다.',
  },
  {
    match: /row-level security|RLS|permission denied for table/i,
    what: '데이터를 아무나 못 보게 막아둔 규칙에 걸렸어요.',
    todo: '누가 볼 수 있어야 하는지 규칙을 정하고 계속합니다.',
  },
];

function textOf(input) {
  const r = input.tool_result;
  if (typeof r === 'string') return r;
  if (r && typeof r === 'object') {
    return [r.error, r.stderr, r.stdout, r.message]
      .filter((x) => typeof x === 'string').join('\n');
  }
  return '';
}

H.safely((input) => {
  const root = H.findProject(input.cwd);
  if (!root) return;                    // DevOffice 제품에서만 동작한다

  const text = textOf(input);
  if (!text) return;

  const hit = DICTIONARY.find((d) => d.match.test(text));

  // 사전에 없는 에러도 "당황하지 말라"는 안내는 붙인다.
  const what = hit ? hit.what : '뭔가 잘 안 됐어요. 흔히 있는 일이에요.';
  const todo = hit ? hit.todo : '원인을 찾아서 고쳐보겠습니다.';

  H.emit({
    hookSpecificOutput: {
      hookEventName: 'PostToolUseFailure',
      additionalContext:
        '[사용자 대면 안내 — 아래 세 줄을 사용자에게 그대로 전달할 것]\n' +
        '⚠️ 위에 빨간 글씨가 보이시죠? 무시하셔도 돼요.\n' +
        `무슨 일이냐면: ${what}\n` +
        `지금 할 일: ${todo}\n` +
        '\n(기술 용어를 덧붙이지 말 것. 사용자가 뭘 잘못한 게 아니라는 점을 분명히 할 것.)',
    },
  });
});
