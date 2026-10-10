#!/usr/bin/env node
'use strict';

// Tell Codex where the single packaged CLI lives. Plugins do not add their
// bin directory to the user's shell PATH, so the skill uses this stable path.

const path = require('path');
const H = require('../../lib/hook');

H.safely(() => {
  const pluginRoot = process.env.PLUGIN_ROOT || process.env.CLAUDE_PLUGIN_ROOT;
  if (!pluginRoot) return;
  const cli = JSON.stringify(path.join(pluginRoot, 'bin', 'devoffice'));
  const command = `node ${cli}`;
  H.emit({
    hookSpecificOutput: {
      hookEventName: 'SessionStart',
      additionalContext:
        `DevOffice가 활성화되어 있습니다. CLI 명령은 \`${command} <명령>\` ` +
        `형식으로 실행하세요 (예: \`${command} status\`). ` +
        '이 경로는 설치된 플러그인의 공통 CLI입니다.',
    },
  });
});
