'use strict';

// 게이트가 문서를 읽기 위한 최소 마크다운 파서.
//
// 규격 검사만 하면 되므로 완전한 파서가 필요 없다.
// 절(##) 단위로 자르고, 목록·표·AC 번호만 뽑는다.

const fs = require('fs');

function read(file) {
  try {
    return fs.readFileSync(file, 'utf8');
  } catch (e) {
    if (e.code === 'ENOENT') return null;
    throw e;
  }
}

/** '## 제목' 으로 잘라 { 제목: 본문 } 을 만든다. */
function sections(text) {
  const out = {};
  if (!text) return out;
  let title = null;
  let buf = [];
  for (const line of text.split('\n')) {
    const m = /^##\s+(.+?)\s*$/.exec(line);
    if (m) {
      if (title) out[title] = buf.join('\n').trim();
      title = m[1];
      buf = [];
    } else if (title) buf.push(line);
  }
  if (title) out[title] = buf.join('\n').trim();
  return out;
}

/**
 * HTML 주석을 지운다.
 * 서식의 안내문은 전부 주석으로 넣는다 — 그래야 게이트가
 * "아직 안 채운 것"과 "채운 것"을 확실히 구분한다.
 */
function stripComments(text) {
  return String(text || '').replace(/<!--[\s\S]*?-->/g, '');
}

/** 서식 그대로인지. 안 채웠으면 true. */
function isEmpty(body) {
  const text = stripComments(body);
  if (!text.trim()) return true;

  const rows = text.split('\n').map((l) => l.trim()).filter(Boolean);

  // 표만 있는 절: 헤더와 구분선을 뺀 데이터 행이 있어야 채운 것이다.
  // (구분선도 표의 일부이므로 여기서 함께 센다)
  const tableLines = rows.filter((l) => l.startsWith('|'));
  if (tableLines.length && tableLines.length === rows.length) {
    return table(text).length === 0;
  }

  const meaningful = rows.filter((l) =>
    l !== '-' &&
    !/^[-*]\s*$/.test(l) &&
    !/^[-*]\s*\[\s*\]\s*[^:]*:?\s*$/.test(l) &&   // "- [ ] 테스트 계정:" 처럼 값이 없는 항목
    !/^\|[\s|:-]+\|?$/.test(l)
  );
  return meaningful.length === 0;
}

/** 목록 항목(- 로 시작하는 줄). */
function bullets(body) {
  return stripComments(body)
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => /^[-*]\s+/.test(l))
    .map((l) => l.replace(/^[-*]\s+/, '').trim())
    .filter(Boolean);
}

/** 표를 { 컬럼: 값 } 배열로. 구분선과 헤더는 뺀다. */
function table(body) {
  const rows = stripComments(body)
    .split('\n').map((l) => l.trim()).filter((l) => l.startsWith('|'));
  if (rows.length < 2) return [];
  const cells = (r) => r.split('|').slice(1, -1).map((c) => c.trim());
  const head = cells(rows[0]);
  return rows
    .slice(1)
    .filter((r) => !/^\|[\s|:-]+\|?$/.test(r))
    .map((r) => {
      const c = cells(r);
      const obj = {};
      head.forEach((h, i) => { obj[h] = c[i] || ''; });
      return obj;
    })
    .filter((o) => Object.values(o).some((v) => v));
}

/** 본문 어디에서든 AC-1 같은 번호를 뽑는다. 주석 안은 세지 않는다. */
function acIds(text) {
  const found = new Set();
  for (const m of stripComments(text).matchAll(/\bAC-\d+\b/g)) found.add(m[0]);
  return [...found].sort();
}

function taskIds(text) {
  const found = new Set();
  for (const m of stripComments(text).matchAll(/\bT\d+\b/g)) found.add(m[0]);
  return [...found].sort((a, b) => Number(a.slice(1)) - Number(b.slice(1)));
}

module.exports = { read, sections, isEmpty, bullets, table, acIds, taskIds, stripComments };
