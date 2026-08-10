'use strict';

// 출력 규격 (JOURNEY §2.6).
// 이 파일이 규격의 유일한 구현이다. 다른 곳에서 직접 console.log 하지 않는다.
//
//   1. 한 화면에 하나의 결정
//   2. 항상 "지금 누구 차례인지"로 끝난다
//   3. 구분선으로 계층을 만든다
//   4. 이모지는 상태 표시로만
//   5. 기술 용어 0개
//   6. 15줄 이내

const RULE = '━'.repeat(46);

/**
 * 화면에서 차지하는 칸 수. 한글·한자·이모지는 2칸이다.
 * .length 로 세면 한국어 화면이 전부 어긋난다 (D5: 전면 한국어).
 */
function width(str) {
  let w = 0;
  for (const ch of String(str)) {
    const c = ch.codePointAt(0);
    const wide =
      (c >= 0x1100 && c <= 0x115f) ||   // 한글 자모
      (c >= 0x2e80 && c <= 0xa4cf) ||   // 한중일 부수·한자
      (c >= 0xac00 && c <= 0xd7a3) ||   // 한글 음절
      (c >= 0xf900 && c <= 0xfaff) ||   // 호환 한자
      (c >= 0xfe30 && c <= 0xfe6f) ||
      (c >= 0xff00 && c <= 0xff60) ||   // 전각
      (c >= 0xffe0 && c <= 0xffe6) ||
      (c >= 0x1f300 && c <= 0x1f9ff);   // 이모지
    w += wide ? 2 : 1;
  }
  return w;
}

/**
 * 한국어 조사. 받침 유무로 갈린다.
 * 사용자 대면 문장에서 조사가 틀리면 즉시 어색해진다.
 *   josa('물건 목록 보기', '을') -> '를'
 */
const JOSA = { 을: '를', 이: '가', 은: '는', 과: '와', 으로: '로' };
function josa(word, withBatchim) {
  const s = String(word).trim();
  const last = s.codePointAt(s.length - 1);
  const isHangul = last >= 0xac00 && last <= 0xd7a3;
  if (!isHangul) return withBatchim;           // 판단 불가 시 원형 유지
  const jong = (last - 0xac00) % 28;
  if (withBatchim === '으로') return jong === 0 || jong === 8 ? '로' : '으로';
  return jong === 0 ? JOSA[withBatchim] || withBatchim : withBatchim;
}

/** '물건 목록 보기' + '을' -> '물건 목록 보기를' */
function withJosa(word, particle) {
  return `${word}${josa(word, particle)}`;
}

const out = [];
function push(line) {
  out.push(line === undefined ? '' : line);
}
function flush(stream) {
  (stream || process.stdout).write(`${out.join('\n')}\n`);
  out.length = 0;
}

/** 제목 줄. right 에는 진척(3/12) 같은 짧은 것만. */
function header(title, right) {
  push(RULE);
  const left = `  ${title}`;
  if (right) {
    const pad = Math.max(1, 46 - width(left) - width(right) - 2);
    push(`${left}${' '.repeat(pad)}${right}  `);
  } else {
    push(left);
  }
  push(RULE);
  push();
}

function line(text) {
  push(text === undefined ? '' : `  ${text}`);
}

function lines(arr) {
  arr.forEach(line);
}

/** 항목 목록. marker 는 상태 이모지. */
function item(marker, text) {
  push(`  ${marker} ${text}`);
}

function rule() {
  push(RULE);
}

/**
 * 마지막 줄. 규격 2번의 구현 — 셋 중 하나로만 끝난다.
 *   turn  : 사용자 차례
 *   wait  : 우리가 하는 중
 *   go    : 사용자가 밖에서 뭔가 해야 함
 */
function next(kind, text) {
  const mark = { turn: '👉', wait: '⏳', go: '🔗' }[kind];
  if (!mark) throw new Error(`알 수 없는 차례 종류: ${kind}`);
  push(RULE);
  push(`  ${mark} ${text}`);
}

function bar(done, total, width) {
  const w = width || 12;
  const filled = total === 0 ? 0 : Math.round((done / total) * w);
  return `${'▓'.repeat(filled)}${'░'.repeat(w - filled)}  ${total}개 중 ${done}개`;
}

/** 오류. 항상 "무슨 일" + "지금 할 일" 두 부분 (JOURNEY §2.8). */
function fail(what, todo) {
  out.length = 0;
  push();
  push(`  ⚠️  ${what}`);
  if (todo) {
    push();
    push(`  지금 할 일: ${todo}`);
  }
  push();
  flush(process.stderr);
  process.exit(1);
}

/** 에이전트가 읽는 출력. 사람용 규격을 거치지 않는다. */
function json(value) {
  process.stdout.write(`${JSON.stringify(value, null, 2)}\n`);
}

module.exports = {
  RULE,
  width,
  josa,
  withJosa,
  header,
  line,
  lines,
  item,
  rule,
  next,
  bar,
  fail,
  json,
  flush,
  push,
};
