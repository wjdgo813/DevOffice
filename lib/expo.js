'use strict';

// Expo Go 호환성 판정.
//
// 왜 이 파일이 필요한가:
//   `create-expo-app@latest` 는 **최신 SDK**로 프로젝트를 만든다.
//   그런데 폰에 깔리는 Expo Go 는 **App Store 심사를 거쳐야** 하므로 항상 뒤처진다.
//   (실제로 2026-08 기준 최신 SDK 57 / 스토어 Expo Go 는 54)
//
//   그래서 최신으로 만들면 **폰에서 절대 안 열린다.** 사고가 아니라 상시 조건이다.
//
//   중요한 건 이걸 **만들기 전에 알 수 있다는 것**이다. API 두 개면 된다.
//   알 수 있는 것을 확인하지 않고 추측하면 사용자가 네 번 헛걸음한다.

const EXPO_VERSIONS = 'https://api.expo.dev/v2/versions/latest';
const ITUNES_LOOKUP = 'https://itunes.apple.com/lookup?id=982107779';

async function getJson(url, ms) {
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), ms || 10000);
  try {
    const res = await fetch(url, { signal: ac.signal });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}

/** App Store 에 지금 올라와 있는 Expo Go 버전. 이게 사용자가 받을 수 있는 전부다. */
async function storeClient() {
  const j = await getJson(ITUNES_LOOKUP);
  const app = j.results && j.results[0];
  if (!app) throw new Error('App Store 응답에 앱 정보가 없음');
  return { version: app.version, updatedAt: app.currentVersionReleaseDate };
}

/** Expo 가 아는 SDK 목록과 각 SDK 가 요구하는 클라이언트 버전. */
async function sdkTable() {
  const j = await getJson(EXPO_VERSIONS);
  const d = j.data || j;
  return Object.entries(d.sdkVersions || {})
    .map(([sdk, e]) => ({
      sdk: parseInt(sdk, 10),
      iosClient: e.iosClientVersion,
      androidClient: e.androidClientVersion,
    }))
    .filter((x) => Number.isFinite(x.sdk))
    .sort((a, b) => b.sdk - a.sdk);
}

const major = (v) => parseInt(String(v).split('.')[0], 10);

/**
 * 스토어 클라이언트가 지원하는 최대 SDK.
 *
 * Expo Go 는 SDK 50 무렵부터 버전 앞자리를 SDK 번호와 맞춘다(54.0.2 → SDK 54).
 * 그 이전 체계(2.33.x)면 iosClientVersion 을 대조해서 찾는다.
 */
function resolveSdk(storeVersion, table) {
  const m = major(storeVersion);
  if (Number.isFinite(m) && m >= 50) {
    const hit = table.find((t) => t.sdk === m);
    if (hit) return { sdk: m, how: 'store-major' };
  }
  const matched = table.find((t) => major(t.iosClient) === m);
  if (matched) return { sdk: matched.sdk, how: 'client-match' };
  return null;
}

/**
 * 지금 만들어야 할 SDK를 판정한다.
 * 네트워크가 안 되면 `ok: false` 로 돌려준다 — 추측한 값을 사실처럼 주지 않는다.
 */
async function recommend() {
  try {
    const [store, table] = await Promise.all([storeClient(), sdkTable()]);
    const resolved = resolveSdk(store.version, table);
    if (!resolved) {
      return { ok: false, reason: 'UNKNOWN_MAPPING', store, latestSdk: table[0] && table[0].sdk };
    }
    const latest = table[0].sdk;
    return {
      ok: true,
      sdk: resolved.sdk,
      latestSdk: latest,
      behind: latest - resolved.sdk,
      store,
      table,
    };
  } catch (e) {
    return { ok: false, reason: 'OFFLINE', message: e.message };
  }
}

/** 프로젝트가 실제로 쓰고 있는 SDK. package.json 의 expo 의존성에서 읽는다. */
function projectSdk(root) {
  const fs = require('fs');
  const path = require('path');
  try {
    const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
    const raw = (pkg.dependencies && pkg.dependencies.expo) || '';
    const m = /(\d+)/.exec(raw);
    return m ? parseInt(m[1], 10) : null;
  } catch (_) {
    return null;
  }
}

/** 개발 서버가 실제로 살아 있는가. 안내하기 전에 반드시 확인한다. */
async function devServerAlive(port) {
  const p = port || 8081;
  try {
    const ac = new AbortController();
    const t = setTimeout(() => ac.abort(), 3000);
    const res = await fetch(`http://127.0.0.1:${p}/status`, { signal: ac.signal });
    clearTimeout(t);
    const body = await res.text();
    return { alive: /packager-status:running/.test(body), port: p };
  } catch (_) {
    return { alive: false, port: p };
  }
}

module.exports = { recommend, projectSdk, devServerAlive, storeClient, sdkTable, resolveSdk };
