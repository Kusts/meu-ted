#!/usr/bin/env node
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

const SPEC = 'docs/superpowers/specs/2026-07-28-project-recovery-product-architecture.md';
const ROADMAP = 'docs/superpowers/plans/2026-07-28-project-recovery-roadmap.html';

export const evaluateDecisionGovernance = ({ changedFiles, decisionDiff }) => {
  const changedDecision = decisionDiff
    .split(/\r?\n/)
    .some((line) => /^[+].*\bD(?:0[1-9]|1[0-9])\b/.test(line));
  if (!changedDecision) return { ok: true, reason: 'no D01-D19 change detected' };

  const hasAdr = changedFiles.some((file) => /^docs\/adr\/.*\.md$/.test(file) && !file.endsWith('/README.md'));
  const hasSpec = changedFiles.includes(SPEC);
  const hasRoadmap = changedFiles.includes(ROADMAP);
  return {
    ok: hasAdr && hasSpec && hasRoadmap,
    reason: hasAdr && hasSpec && hasRoadmap
      ? 'ADR + spec + roadmap present'
      : 'D01-D19 changes require ADR + spec + roadmap in the same diff',
  };
};

const git = (...args) => execFileSync('git', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
const lines = (value) => value.split(/\r?\n/).filter(Boolean);

const collectState = () => {
  const base = process.argv.includes('--base')
    ? process.argv[process.argv.indexOf('--base') + 1]
    : process.env.GITHUB_BASE_SHA || process.env.GITHUB_EVENT_BEFORE || 'HEAD';
  const range = base === 'HEAD' ? ['diff', '--unified=0', 'HEAD', '--'] : ['diff', '--unified=0', `${base}...HEAD`, '--'];
  const changedArgs = base === 'HEAD'
    ? ['diff', '--name-only', 'HEAD', '--']
    : ['diff', '--name-only', `${base}...HEAD`, '--'];
  const changedFiles = new Set(lines(git(...changedArgs)));
  lines(git('status', '--porcelain', '--untracked-files=all')).forEach((line) => {
    const file = line.slice(3).replace(/^"|"$/g, '');
    if (file) changedFiles.add(file);
  });

  const trackedDecisionFiles = [SPEC, ROADMAP].filter((file) => {
    try { return Boolean(git('ls-files', '--error-unmatch', file).trim()); } catch { return false; }
  });
  let decisionDiff = trackedDecisionFiles.length > 0
    ? git(...range, ...trackedDecisionFiles)
    : '';
  for (const file of [SPEC, ROADMAP]) {
    if (!trackedDecisionFiles.includes(file) && existsSync(file)) {
      decisionDiff += `\n${readFileSync(file, 'utf8').split(/\r?\n/).map((line) => `+${line}`).join('\n')}`;
    }
  }
  return { changedFiles: [...changedFiles], decisionDiff };
};

export const main = () => {
  const result = evaluateDecisionGovernance(collectState());
  if (!result.ok) {
    console.error(`Decision governance failed: ${result.reason}.`);
    process.exitCode = 1;
    return;
  }
  console.log(`Decision governance: ${result.reason}.`);
};

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
