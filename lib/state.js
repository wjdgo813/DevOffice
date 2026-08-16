'use strict';

const fs = require('fs');
const path = require('path');
const P = require('./paths');
const ui = require('./ui');
const schema = require('./schema');

function load(root) {
  const p = P.paths(root);
  const raw = P.readJson(p.state, null);
  if (!raw) {
    ui.fail('제품 정보를 찾을 수 없어요.', 'devoffice init 을 먼저 실행해주세요.');
  }
  return schema.migrate(raw);
}

function save(root, state) {
  state.updatedAt = new Date().toISOString();
  P.writeJson(P.paths(root).state, state);
  return state;
}

/** 읽고-고치고-쓰기를 한 번에. 모든 상태 변경은 이걸 통한다. */
function update(root, fn) {
  const state = load(root);
  const result = fn(state);
  save(root, state);
  return result;
}

function init(root, opts) {
  const p = P.paths(root);
  if (fs.existsSync(p.state) && !opts.force) {
    ui.fail(
      '이 폴더에는 이미 제품이 있어요.',
      '다른 폴더에서 시작하시거나, 이어서 하시려면 그냥 대화를 시작하세요.'
    );
  }

  [p.base, p.product, p.features, p.research, p.decisions].forEach(P.ensureDir);

  const state = schema.initialState();
  P.writeJson(p.state, state);
  if (!fs.existsSync(p.journal)) fs.writeFileSync(p.journal, '', 'utf8');

  // 세션마다 자동으로 읽히는 항상-켜짐 층.
  // 훅으로 매번 주입하는 것보다 싸고, 사용자가 열어볼 수도 있다.
  writeProjectRules(root);
  writeGitignore(root);

  require('./journal').add(root, 'init', '제품 상자를 만들었어요');
  return state;
}

/** CLAUDE.md — 이 폴더에서 세션을 열면 자동으로 읽힌다. 짧게 유지한다. */
function writeProjectRules(root) {
  const file = path.join(root, 'CLAUDE.md');
  if (fs.existsSync(file)) return false;
  P.writeAtomic(file, `# 이 폴더는 DevOffice 제품입니다

사용자는 **비개발자**입니다. 코드를 읽을 수 없고, 개발 용어를 모릅니다.

## 시작

**먼저 말을 걸지 않습니다.** 사용자가 \`devoffice\` 스킬을 부르거나
제품에 대해 무언가를 요청했을 때 시작합니다.

요청이 오면 가장 먼저 \`devoffice status\` 로 지금 어디까지 왔는지 확인합니다.
추측하지 않습니다.

## 이 제품을 다룰 때 지킬 것

1. **모든 응답은 👉(사용자 차례) / ⏳(작업 중) / 🔗(밖에서 확인) 중 하나로 끝난다**
2. **기술 용어를 쓰지 않는다.** API→"서버", 배포→"인터넷에 올리기"
3. **사용자가 눈으로 확인하기 전에는 다음 기능을 시작하지 않는다**
4. **사용자가 모르는 것을 만들지 않는다.** "있으면 좋은 것"은 백로그에 제안만
5. 오래 걸리는 일 전에는 **"화면이 조용해도 정상이에요"**를 알린다

## 상태 관리

\`.devoffice/\` 안의 파일을 손으로 고치지 마세요. 항상 명령을 씁니다.

\`\`\`
devoffice status / backlog list / feature / task / gate / doctor
\`\`\`

자세한 방식은 \`devoffice\` 스킬을 부르면 로드됩니다.
`);
  return true;
}

/** 비밀키가 새어나갈 통로를 처음부터 막는다 (SAFETY §3). */
function writeGitignore(root) {
  const file = path.join(root, '.gitignore');
  const needed = ['.env', '.env.*', '!.env.example', 'node_modules', '.DS_Store'];
  let current = '';
  try { current = fs.readFileSync(file, 'utf8'); } catch (_) { /* 없으면 새로 만든다 */ }
  const missing = needed.filter((l) => !current.split('\n').some((c) => c.trim() === l));
  if (!missing.length) return false;
  P.writeAtomic(file, `${current ? `${current.replace(/\n*$/, '\n')}\n` : ''}${missing.join('\n')}\n`);
  return true;
}

// --- 경로 접근 (state set product.name "동네나눔") -------------------------

function getPath(obj, dotted) {
  return dotted.split('.').reduce((o, k) => (o == null ? undefined : o[k]), obj);
}

function setPath(obj, dotted, value) {
  const keys = dotted.split('.');
  const last = keys.pop();
  const target = keys.reduce((o, k) => {
    if (o[k] == null || typeof o[k] !== 'object') o[k] = {};
    return o[k];
  }, obj);
  target[last] = value;
}

/** "true" / "42" / "null" / JSON 을 알아서 해석한다. */
function coerce(raw) {
  if (raw === 'null') return null;
  if (raw === 'true') return true;
  if (raw === 'false') return false;
  if (raw !== '' && !Number.isNaN(Number(raw))) return Number(raw);
  if (/^[[{]/.test(raw)) {
    try { return JSON.parse(raw); } catch (_) { /* 문자열로 둔다 */ }
  }
  return raw;
}

// --- 사람이 읽는 요약 ------------------------------------------------------

/** 4단계 이름은 웹/앱에 따라 다르다. */
function stageName(stage, s) {
  if (stage.no !== 4) return stage.name;
  return schema.STAGE4_NAME[(s.stack && s.stack.client)] || stage.name;
}

/**
 * 지금 어디까지 왔는지.
 *
 * 지도를 여기서 출력하는 이유: 보여줄 진짜 데이터가 없으면
 * 에이전트가 "10/12" 같은 숫자를 지어낸다. 실제로 그랬다.
 */
function summary(root) {
  const s = load(root);
  const name = (s.product && s.product.name) || '이름 없는 제품';
  const cur = schema.stageOf(s.phase);

  const done = (s.backlog || []).filter((f) => f.status === 'done').length;
  const total = (s.backlog || []).length;

  ui.header(name, `${cur.no}/${schema.STAGES.length}`);

  schema.STAGES.forEach((st) => {
    const label = stageName(st, s);
    if (st.no < cur.no) return ui.item('✅', `${st.no}. ${label}`);
    if (st.no > cur.no) return ui.item('  ', `${st.no}. ${label}`);
    // 기능 루프에 들어가면 그 안의 진척을 함께 보여준다
    const inner = st.no === 6 && total ? `   ${done}/${total}` : '';
    ui.item('▶ ', `${st.no}. ${label}${inner}   ← 지금`);
  });

  if (cur.no === 6 && total) {
    ui.line();
    ui.line(ui.bar(done, total));
  }

  // 사용자의 불안은 "안 정해진 걸 모르는 것"에서 온다
  const pending = schema.STAGES.filter((st) => st.no >= cur.no && st.decides);
  if (pending.length) {
    ui.line();
    ui.line('아직 안 정한 것');
    pending.forEach((st) => ui.line(` · ${st.decides}  (${st.no}단계)`));
  }

  if (s.deploy && s.deploy.url) {
    ui.line();
    ui.line(`🔗 ${s.deploy.url}`);
  }

  const cf = s.currentFeature;
  if (cf) {
    const t = cf.tasks || [];
    const td = t.filter((x) => x.status === 'done').length;
    ui.line();
    ui.line(`만드는 중  ${cf.title}${t.length ? `  (${td}/${t.length})` : ''}`);
    if (!cf.gates.userVerified && t.length && td === t.length) {
      ui.line('           └ 확인만 하시면 다음으로 넘어가요');
    }
  }

  if (s.production && s.production.hasRealData) {
    ui.line();
    ui.line('🔒 실제로 쓰이는 중이라 조심해서 다루고 있어요');
  }

  ui.next('turn', cf ? '이어서 하시려면 말씀해주세요' : '다음에 뭘 할지 말씀해주세요');
  ui.flush();
}

module.exports = {
  load, save, update, init, writeProjectRules, writeGitignore,
  getPath, setPath, coerce,
  summary, stageName,
};
