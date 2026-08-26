# G1.2.4 Security Gates Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add reproducible secret, dependency-lockfile, and container vulnerability gates to CI without production access.

**Architecture:** Root package scripts expose the three gates. CI runs them in a dedicated security job using pinned tool versions; container scanning consumes only locally built CI images. Contract tests verify the exact commands, severities, image tags, and fail-closed behavior.

**Tech Stack:** pnpm 10.34.1, Node 22, GitHub Actions, Gitleaks, pnpm audit, Trivy, Vitest/node:test.

**Agent Orchestration:** Single-Agent Looped — the gates share CI/package governance but are implemented and verified sequentially.

### Task 1: Lock down the security command contract

**Files:**
- Modify: `package.json`
- Create: `scripts/security-gates.test.mjs`

- [ ] Add scripts `security:secrets`, `security:deps`, and `security:containers` with explicit fail-closed commands and no production endpoints.
- [ ] Write contract tests for tool versions, `--prod`, high-severity dependency threshold, redaction, and HIGH/CRITICAL container severity.
- [ ] Run the contract test and verify it fails before implementation, then passes after implementation.

### Task 2: Add the CI security job

**Files:**
- Modify: `.github/workflows/ci.yml`

- [ ] Add a dedicated Ubuntu security job with full checkout, Volta, frozen install, secret scan, real lockfile audit, both disposable image builds, and Trivy scans.
- [ ] Make the global gate depend on security.
- [ ] Keep scan commands independent from production credentials and services.
- [ ] Run the workflow contract tests.

### Task 3: Verify locally and record evidence

**Files:**
- Create: `docs/superpowers/goal-runs/G1.2.4.md`

- [ ] Run dependency audit against the repository lockfile.
- [ ] Run all relevant contract tests and `git diff --check`.
- [ ] Run secret/container gates when their pinned local runtimes are available; otherwise record the exact environmental limitation without weakening CI.
- [ ] Record results and changed files in the goal evidence.
