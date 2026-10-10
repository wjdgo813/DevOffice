#!/usr/bin/env node
'use strict';

// Codex entry point. apply_patch requests are normalized by the shared policy.

const H = require('../../lib/hook');
const policy = require('../../lib/guard-policy');

H.safely((input) => {
  const root = H.findProject(input.cwd);
  if (!root) return;
  const reason = policy.evaluate(input, root, H.loadState(root));
  if (reason) H.deny(reason);
});
