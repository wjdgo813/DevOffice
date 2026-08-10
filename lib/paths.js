'use strict';

// 경로 해석. .devoffice/ 가 있는 폴더가 "제품 상자"의 루트다.
// 의존성 0 — Node 내장 모듈만 쓴다 (npm install 전에도 동작해야 한다).

const fs = require('fs');
const path = require('path');

const DIR = '.devoffice';

/** CWD에서 위로 올라가며 .devoffice/ 를 찾는다. 없으면 null. */
function findRoot(from) {
  let dir = path.resolve(from || process.env.CLAUDE_PROJECT_DIR || process.cwd());
  while (true) {
    if (fs.existsSync(path.join(dir, DIR))) return dir;
    const parent = path.dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
}

/** 루트를 찾되, 없으면 종료한다. init 이후에만 쓰는 명령용. */
function requireRoot() {
  const root = findRoot();
  if (!root) {
    const { fail } = require('./ui');
    fail(
      '아직 제품이 시작되지 않았어요.',
      '이 폴더에서 devoffice init 을 먼저 실행해주세요.'
    );
  }
  return root;
}

function paths(root) {
  const base = path.join(root, DIR);
  return {
    root,
    base,
    state: path.join(base, 'state.json'),
    journal: path.join(base, 'journal.jsonl'),
    product: path.join(base, 'product'),
    features: path.join(base, 'features'),
    research: path.join(base, 'research'),
    decisions: path.join(base, 'decisions'),
    infra: path.join(base, 'infra'),
    accounts: path.join(base, 'accounts.md'),
    backlog: path.join(base, 'backlog.md'),
    feature(id) {
      return path.join(base, 'features', id);
    },
  };
}

/** 중간 경로까지 만든다. */
function ensureDir(p) {
  fs.mkdirSync(p, { recursive: true });
  return p;
}

/**
 * 원자적 쓰기. 중간에 죽어도 파일이 반쯤 쓰인 상태로 남지 않는다.
 * 세션이 자주 끊기는 환경(PROTOCOL §3)에서 이게 중요하다.
 */
function writeAtomic(file, contents) {
  ensureDir(path.dirname(file));
  const tmp = `${file}.tmp-${process.pid}`;
  fs.writeFileSync(tmp, contents, 'utf8');
  fs.renameSync(tmp, file);
}

function readJson(file, fallback) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (e) {
    if (e.code === 'ENOENT' && fallback !== undefined) return fallback;
    throw e;
  }
}

function writeJson(file, value) {
  writeAtomic(file, `${JSON.stringify(value, null, 2)}\n`);
}

module.exports = {
  DIR,
  findRoot,
  requireRoot,
  paths,
  ensureDir,
  writeAtomic,
  readJson,
  writeJson,
};
