'use strict';

// 프로젝트 골격 만들기.
//
// Next.js 원본을 통째로 싣지 않는다 — 프레임워크는 빨리 바뀌고
// 얼린 복사본은 곧 낡는다. `create-next-app` 이 만든 위에
// **우리 것만 덧씌운다.**
//
// 그래서 templates/scaffold/<프리셋>/ 에는 diff 만 있다.

const fs = require('fs');
const path = require('path');
const P = require('./paths');
const ui = require('./ui');

const PRESETS = ['web-next', 'mobile-expo'];

function templateDir(preset) {
  return path.join(__dirname, '..', 'templates', 'scaffold', preset);
}

/** {{KEY}} 를 값으로 바꾼다. 없는 키는 그대로 둔다 — 조용히 지우면 못 찾는다. */
function substitute(text, vars) {
  return text.replace(/\{\{(\w+)\}\}/g, (whole, key) =>
    (key in vars ? String(vars[key]) : whole)
  );
}

function walk(dir, base) {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const abs = path.join(dir, entry.name);
    const rel = path.join(base || '', entry.name);
    if (entry.isDirectory()) out.push(...walk(abs, rel));
    else out.push({ abs, rel });
  }
  return out;
}

/**
 * 덧씌우기. 기존 파일은 --force 없이는 건드리지 않는다.
 * 사용자가 고친 걸 조용히 되돌리면 안 된다.
 */
function overlay(root, preset, vars, opts) {
  const src = templateDir(preset);
  if (!fs.existsSync(src)) {
    ui.fail(`'${preset}' 서식이 없어요.`, `쓸 수 있는 것: ${PRESETS.join(', ')}`);
  }

  const written = [];
  const skipped = [];

  for (const f of walk(src)) {
    // 서식 파일명의 __ 는 . 로 되돌린다 (.env.example 등이 npm 에서 사라지는 것을 피한다)
    const rel = f.rel.replace(/(^|[/\\])__/g, '$1.');
    const dest = path.join(root, rel);

    if (fs.existsSync(dest) && !(opts && opts.force)) {
      skipped.push(rel);
      continue;
    }
    P.writeAtomic(dest, substitute(fs.readFileSync(f.abs, 'utf8'), vars));
    written.push(rel);
  }

  return { written, skipped };
}

/** state.json 에서 서식에 넣을 값을 뽑는다. */
function varsFrom(state) {
  const p = state.product || {};
  return {
    PRODUCT_NAME: p.name || '내 제품',
    PRODUCT_SLUG: p.slug || 'my-product',
    ONE_LINER: p.oneLiner || '',
    YEAR: new Date().getFullYear(),
  };
}

module.exports = { PRESETS, overlay, substitute, varsFrom, templateDir };
