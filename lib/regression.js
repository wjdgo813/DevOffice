'use strict';

// 회귀 — 예전에 확인받은 기능이 아직 도는지 본다.
//
// 4중 게이트는 이번 기능만 본다. 기능이 쌓이면 예전 것이 조용히 깨지고,
// 사용자는 자기가 안 건드린 화면을 다시 확인하지 않는다.
//
// 여기서 중요한 건 **깨진 테스트를 어느 기능의 것으로 되돌려주는 것**이다.
// "3개 실패"가 아니라 "전략 고르기가 깨졌어요"여야 사용자가 이해한다.

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

/** 테스트 도구가 갖춰졌는가. 없는 것은 실패가 아니다 — 아직 안 넣은 것이다. */
function setup(root) {
  let pkg = {};
  try {
    pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
  } catch (_) {
    return { ready: false, reason: 'NO_PACKAGE' };
  }
  const deps = { ...pkg.dependencies, ...pkg.devDependencies };
  const hasScript = !!(pkg.scripts && pkg.scripts.test);
  const runner = deps['jest-expo'] ? 'jest-expo'
    : deps['@playwright/test'] ? 'playwright'
      : deps.jest ? 'jest' : null;

  if (!runner || !hasScript) {
    return { ready: false, reason: 'NOT_INSTALLED', runner, hasScript };
  }
  return { ready: true, runner };
}

/** 테스트 파일에서 기능 ID 를 뽑는다. F-003.strategies.test.tsx → F-003 */
function featureOf(file) {
  const m = /\b(F-\d+)\b/.exec(file || '');
  return m ? m[1] : null;
}

function testFiles(root) {
  const out = [];
  const walk = (dir, depth) => {
    if (depth > 5) return;
    let entries;
    try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch (_) { return; }
    for (const e of entries) {
      if (['node_modules', '.git', '.devoffice', '.expo'].includes(e.name)) continue;
      const abs = path.join(dir, e.name);
      if (e.isDirectory()) walk(abs, depth + 1);
      else if (/\.(test|spec)\.(ts|tsx|js|jsx)$/.test(e.name)) out.push(path.relative(root, abs));
    }
  };
  walk(root, 0);
  return out;
}

/**
 * 실행한다. 실패를 기능 단위로 묶어서 돌려준다.
 * 테스트 러너의 출력 형식은 제각각이라, 실패한 **파일 경로**만 뽑아 기능으로 환산한다.
 */
function run(root) {
  const s = setup(root);
  if (!s.ready) return { ...s, ok: null };

  let output = '';
  let ok = true;
  try {
    output = execSync('npm test --silent -- --ci 2>&1', {
      cwd: root, encoding: 'utf8', timeout: 300000, stdio: ['ignore', 'pipe', 'pipe'],
    });
  } catch (e) {
    ok = false;
    output = `${(e.stdout || '')}${e.stderr || ''}`;
  }

  const broken = new Set();
  for (const line of output.split('\n')) {
    if (!/(✕|✗|FAIL|●)/.test(line)) continue;
    const id = featureOf(line);
    if (id) broken.add(id);
  }

  return { ready: true, runner: s.runner, ok, broken: [...broken].sort(), output };
}

/** 자동화 못 한 항목들. 배포 전에 사람이 훑는다. */
function manualChecklist(root) {
  const base = path.join(root, '.devoffice', 'features');
  const out = [];
  let dirs = [];
  try { dirs = fs.readdirSync(base); } catch (_) { return out; }
  for (const id of dirs) {
    const f = path.join(base, id, 'regression.md');
    if (!fs.existsSync(f)) continue;
    let text = '';
    try { text = fs.readFileSync(f, 'utf8'); } catch (_) { continue; }
    const items = text.split('\n')
      .map((l) => l.trim())
      .filter((l) => /^[-*]\s*\[\s*\]\s*\S/.test(l))
      .map((l) => l.replace(/^[-*]\s*\[\s*\]\s*/, ''));
    if (items.length) out.push({ id, items });
  }
  return out;
}

module.exports = { setup, run, testFiles, featureOf, manualChecklist };
