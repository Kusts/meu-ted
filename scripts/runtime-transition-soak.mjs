#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export function runSoakAssessment(events) {
  const stagesExercised = new Set();
  let duplicateResponseCount = 0;
  let crossWorkspaceLeakCount = 0;
  let unknownCapabilityCount = 0;
  let rollbackExercised = false;

  let piOwnerCount = 0;
  let agentOwnerCount = 0;
  let fallbackCount = 0;
  let errorCount = 0;

  const seenTurns = new Map(); // turnId -> workspaceId

  for (const event of events) {
    stagesExercised.add(event.stage);

    if (event.isRollback) {
      rollbackExercised = true;
    }

    if (event.responseCount !== 1) {
      duplicateResponseCount++;
    }

    if (seenTurns.has(event.turnId)) {
      if (seenTurns.get(event.turnId) !== event.workspaceId) {
        crossWorkspaceLeakCount++;
      }
    } else {
      seenTurns.set(event.turnId, event.workspaceId);
    }

    if (!event.capability || event.capability === "unknown") {
      unknownCapabilityCount++;
    }

    if (event.owner === "pi") piOwnerCount++;
    if (event.owner === "agent") agentOwnerCount++;
    if (event.status === "fallback") fallbackCount++;
    if (event.status === "failure") errorCount++;
  }

  const allInvariantsPassed =
    duplicateResponseCount === 0 &&
    crossWorkspaceLeakCount === 0 &&
    unknownCapabilityCount === 0 &&
    rollbackExercised === true;

  return {
    totalEvents: events.length,
    stagesExercised: Array.from(stagesExercised),
    duplicateResponseCount,
    crossWorkspaceLeakCount,
    unknownCapabilityCount,
    rollbackExercised,
    allInvariantsPassed,
    summary: {
      piOwnerCount,
      agentOwnerCount,
      fallbackCount,
      errorCount,
    },
  };
}

export function generateSampleSoakCorpus() {
  const events = [];
  const workspaces = ["ws-1", "ws-2", "ws-3"];
  const caps = ["list_accounts", "create_expense", "get_balance", "list_categories"];

  // Stage 1: pi_owner
  for (let i = 1; i <= 20; i++) {
    events.push({
      turnId: `turn-pi-${i}`,
      stage: "pi_owner",
      owner: "pi",
      workspaceId: workspaces[i % workspaces.length],
      capability: caps[i % caps.length],
      status: "success",
      responseCount: 1,
    });
  }

  // Stage 2: agent_owner_pi_read_fallback
  for (let i = 1; i <= 20; i++) {
    events.push({
      turnId: `turn-agent-${i}`,
      stage: "agent_owner_pi_read_fallback",
      owner: "agent",
      workspaceId: workspaces[i % workspaces.length],
      capability: caps[i % caps.length],
      status: i === 5 ? "fallback" : "success",
      responseCount: 1,
    });
  }

  // Stage 3: Rollback to pi_owner
  for (let i = 1; i <= 10; i++) {
    events.push({
      turnId: `turn-rollback-${i}`,
      stage: "pi_owner",
      owner: "pi",
      workspaceId: workspaces[i % workspaces.length],
      capability: caps[i % caps.length],
      status: "success",
      responseCount: 1,
      isRollback: true,
    });
  }

  return events;
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url))) {
  const corpus = generateSampleSoakCorpus();
  const report = runSoakAssessment(corpus);
  console.log("=== Runtime Transition Soak & Rollback Report ===");
  console.log(`Total Events:          ${report.totalEvents}`);
  console.log(`Stages Exercised:      ${report.stagesExercised.join(", ")}`);
  console.log(`Rollback Exercised:    ${report.rollbackExercised ? "YES ✅" : "NO ❌"}`);
  console.log(`Duplicate Responses:   ${report.duplicateResponseCount}`);
  console.log(`Cross-Workspace Leaks: ${report.crossWorkspaceLeakCount}`);
  console.log(`Unknown Capabilities:  ${report.unknownCapabilityCount}`);
  console.log(`Overall Status:        ${report.allInvariantsPassed ? "PASSED ✅" : "FAILED ❌"}`);
  if (!report.allInvariantsPassed) {
    process.exit(1);
  }
}
