#!/usr/bin/env node
'use strict';

// Codex reports failed shell commands through PostToolUse (non-zero exit).

const H = require('../../lib/hook');
const errors = require('../../lib/error-guide');

H.safely((input) => {
  if (!H.findProject(input.cwd)) return;
  const additionalContext = errors.contextFor(input);
  if (!additionalContext) return;
  H.emit({
    hookSpecificOutput: {
      hookEventName: 'PostToolUse',
      additionalContext,
    },
  });
});
