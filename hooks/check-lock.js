#!/usr/bin/env node
'use strict';

// Claude Code Stop adapter; reminder policy is shared with Codex.

const H = require('./lib/hook');
const locks = require('./lib/lock-reminder');

H.safely((input) => {
  const context = locks.getReminder(input);
  if (!context) return;
  H.emit({ hookSpecificOutput: { hookEventName: 'Stop', additionalContext: context } });
});
