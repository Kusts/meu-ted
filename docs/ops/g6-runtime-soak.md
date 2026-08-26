# G6 Runtime Transition Soak and Rollback Report

This document records the results of the technical soak and rollback exercise during Phase P2 runtime transition.

## Invariants Monitored

1. **Exactly-Once Response**: Every incoming message must produce exactly 1 response to the user.
2. **Zero Cross-Workspace Leakage**: Every turn execution is strictly bounded to the workspace resolved by `POST /auth/bridge-context`.
3. **Zero Direct Database Connections from Agent**: Subprocesses and worker agents invoke authenticated Fastify API routes.
4. **Graceful Zero-Downtime Rollback**: Transitioning between `pi_owner` and `agent_owner_pi_read_fallback` preserves in-flight message isolation.

## Soak Execution Summary

- **Total Events Simulated & Evaluated:** 50
- **Stages Exercised:** `pi_owner`, `agent_owner_pi_read_fallback`
- **Rollback Exercised:** `agent_owner_pi_read_fallback` → `pi_owner`
- **Duplicate Responses Detected:** 0
- **Cross-Workspace Data Leaks:** 0
- **Unknown Capability Executions:** 0
- **Result:** PASSED ✅
