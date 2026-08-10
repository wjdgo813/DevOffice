'use strict';

// append-only 이벤트 로그.
//
// 두 가지 용도가 있다:
//   1. 세션이 끊겨도 무슨 일이 있었는지 남는다 (PROTOCOL §3)
//   2. Phase 2 GUI 의 실시간 피드 소스 (DESIGN §8)
//
// 그래서 형식을 절대 깨뜨리면 안 된다. 한 줄 = JSON 하나.

const fs = require('fs');
const P = require('./paths');

function add(root, type, message, data) {
  const p = P.paths(root);
  const entry = {
    at: new Date().toISOString(),
    type,
    message: message || '',
  };
  if (data && Object.keys(data).length) entry.data = data;

  P.ensureDir(p.base);
  fs.appendFileSync(p.journal, `${JSON.stringify(entry)}\n`, 'utf8');
  return entry;
}

/** 최근 n개. 깨진 줄은 조용히 건너뛴다 — 로그 하나 때문에 도구가 죽으면 안 된다. */
function tail(root, n) {
  const p = P.paths(root);
  let raw;
  try {
    raw = fs.readFileSync(p.journal, 'utf8');
  } catch (e) {
    if (e.code === 'ENOENT') return [];
    throw e;
  }
  const rows = [];
  for (const l of raw.split('\n')) {
    if (!l.trim()) continue;
    try { rows.push(JSON.parse(l)); } catch (_) { /* 건너뛴다 */ }
  }
  return n ? rows.slice(-n) : rows;
}

/** 같은 종류의 사건이 몇 번 있었는지. "같은 기능 3회 수정" 감지용 (DIALOGUE §7.1). */
function countSince(root, type, sinceIso, match) {
  return tail(root).filter((e) => {
    if (e.type !== type) return false;
    if (sinceIso && e.at < sinceIso) return false;
    if (match) {
      return Object.entries(match).every(([k, v]) => e.data && e.data[k] === v);
    }
    return true;
  }).length;
}

module.exports = { add, tail, countSince };
