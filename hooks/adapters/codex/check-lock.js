#!/usr/bin/env node
'use strict';

// Codex Stop adapter. A block decision continues once with the reminder;
// the shared marker prevents a repeat continuation for the same condition.

const H = require('../../lib/hook');
const locks = require('../../lib/lock-reminder');

H.safely((input) => {
  const reason = locks.getReminder(input);
  if (!reason) return;
  H.emit({ decision: 'block', reason });
});
