# Untracked Cleanup Plan — 2026-06-11

**Main checkout:** `D:/projetos/pi-financeiro`
**Worktree:** `D:/projetos/pi-financeiro-worker1` (this report is written here)
**Goal:** stabilize-pi-financeiro-2026-06-11

---

## Summary

39 untracked items found. `git clean -fd` would wipe ~25 items including sensitive peer config and operational logs. This plan avoids that.

---

## Classification Table

| Path | Type | Classification | Reason |
|------|------|----------------|--------|
| `.env.pi` | file | **KEEP_LOCAL_IGNORE** | Contains real `MINIMAX_API_KEY` — HIGHLY SENSITIVE |
| `.env.pi.example` | file | KEEP_LOCAL_IGNORE | Template with dummy keys — safe to add to git if desired |
| `.pi/settings.json` | file | **KEEP_LOCAL_IGNORE** | Peer runtime config |
| `.pi/peers.json` | file | **KEEP_LOCAL_IGNORE** | Peer IDs and endpoint config |
| `.pi/peer-control-ledger.jsonl` | file | **KEEP_LOCAL_IGNORE** | 38KB operational ledger — no secrets but operational |
| `.pi/peer-messages.json` | file | **KEEP_LOCAL_IGNORE** | Peer message history |
| `.pi/peer-org.json` | file | **KEEP_LOCAL_IGNORE** | Peer org data |
| `.pi/peer-setup-session.json` | file | **KEEP_LOCAL_IGNORE** | Peer setup session |
| `.pnpm-store/` | dir | **KEEP_LOCAL_IGNORE** | pnpm cache — do not delete, but must be in .gitignore |
| `apps/api/` | empty dir | **SAFE_DELETE** | Empty directory |
| `scripts/` | empty dir | **SAFE_DELETE** | Empty directory |
| `backups/` | dir | **KEEP_LOCAL_IGNORE** | Contains `master-dirty-*.patch` — operational backup |
| `backups/master-dirty-20260611-203937.patch` | file | KEEP_LOCAL_IGNORE | Operational patch file |
| `backups/master-dirty-20260611-203937.status` | file | KEEP_LOCAL_IGNORE | Operational status file |
| `temp-pi-F8k8Lp/` | dir | **SAFE_DELETE** | Empty except `prompt.txt` (24 bytes) — disposable |
| `temp-pi-SjSXEJ/` | dir | **SAFE_DELETE** | Empty except `prompt.txt` (24 bytes) — disposable |
| `temp-pi-azl9PD/` | dir | **SAFE_DELETE** | Empty — disposable |
| `temp-pi-ftvddg/` | dir | **SAFE_DELETE** | Empty — disposable |
| `temp-pi-F8k8Lp/prompt.txt` | file | SAFE_DELETE | 24-byte prompt artifact |
| `temp-pi-SjSXEJ/prompt.txt` | file | SAFE_DELETE | 24-byte prompt artifact |
| `NUL` | file | **SAFE_DELETE** | Windows redirection artifact (empty) |
| `apps/whatsapp-bridge/nul` | file | **SAFE_DELETE** | Windows redirection artifact (empty) |
| `apps/webhook-test-output.txt` | file | **SAFE_DELETE** | One-time test output |
| `bridge-log.txt` | file | REVIEW_MANUAL | 39KB log with `DATABASE_URL` visible — could be useful for debugging but also a leak |
| `test-payload.json` | file | REVIEW_MANUAL | Test fixture — could be useful test asset |
| `qrcode_ted.png` | file | KEEP_LOCAL_IGNORE | WhatsApp linking QR code (base64 image) — instance token, not sensitive but local |
| `qrcode.html` | file | KEEP_LOCAL_IGNORE | QR code HTML page — same as above |
| `apps/whatsapp-bridge/src/global.d.ts` | file | **VERSION_CANDIDATE** | Comprehensive TypeScript global shim (vitest, node, pg, fastify, pi-coding-agent) — valuable, 200+ lines |
| `apps/whatsapp-bridge/tmp-seed-cats.mjs` | file | **SAFE_DELETE** | One-time seed script artifact |
| `planner.bat` | file | **VERSION_CANDIDATE** | Peer launcher: `set PI_PEER_ID=planner && pi` |
| `reviewer.bat` | file | **VERSION_CANDIDATE** | Peer launcher: `set PI_PEER_ID=reviewer && pi` |
| `worker1.bat` | file | **VERSION_CANDIDATE** | Peer launcher: `set PI_PEER_ID=worker1 && pi` |
| `restart-bridge.bat` | file | **VERSION_CANDIDATE** | Bridge restart script |
| `docs/superpowers/plans/2026-06-08-pi-stack-remediation.md` | file | **VERSION_CANDIDATE** | Historical planning doc |
| `apps/whatsapp-bridge/scripts/` | dir | **VERSION_CANDIDATE** | 12 files, 975 lines: check-env.ts, debug-dbu-url.ts, reminder.ts, test-*.ts, etc. — useful scripts |
| `apps/whatsapp-bridge/scripts/test-webhook-e2e.sh` | file | VERSION_CANDIDATE | E2E webhook test script |
| `apps/whatsapp-bridge/scripts/trace-expense.ts` | file | VERSION_CANDIDATE | Debug trace script |
| `.pi/extensions/financial-tools/package.json.bak` | file | **SAFE_DELETE** | Backup artifact — no value |
| `.pi/extensions/financial-tools/scripts/apply-ocr.ts` | file | **SAFE_DELETE** | One-time OCR script |
| `.pi/extensions/financial-tools/types/` | dir | **SAFE_DELETE** | Empty directory |

---

## Proposed `.gitignore` Additions

```gitignore
# ── Local environment & secrets ──────────────────────────────────
.env.pi

# ── pnpm ──────────────────────────────────────────────────────────
.pnpm-store/

# ── Peer runtime ────────────────────────────────────────────────
.pi/peers.json
.pi/settings.json
.pi/peer-control-ledger.jsonl
.pi/peer-messages.json
.pi/peer-org.json
.pi/peer-setup-session.json

# ── Temp/peer workdirs ───────────────────────────────────────────
temp-pi-*/
temp-pi-*/
```

---

## Safe Delete Commands (specific, non-destructive)

Do NOT run `git clean -fd`. Use specific paths:

```bash
# Empty dirs
rmdir apps/api
rmdir scripts

# Windows artifacts
rm NUL
rm apps/whatsapp-bridge/nul

# Test artifacts
rm apps/webhook-test-output.txt
rm apps/whatsapp-bridge/tmp-seed-cats.mjs
rm test-payload.json

# Peer temp workdirs (empty or near-empty)
rm -rf temp-pi-F8k8Lp
rm -rf temp-pi-SjSXEJ
rm -rf temp-pi-azl9PD
rm -rf temp-pi-ftvddg

# Extension artifacts
rm .pi/extensions/financial-tools/package.json.bak
rm .pi/extensions/financial-tools/scripts/apply-ocr.ts
rmdir .pi/extensions/financial-tools/types
```

---

## Items Requiring Manual Decision Before Deletion

### `bridge-log.txt` (39KB)
- Contains: timestamps, DATABASE_URL visible, webhook events, Pi messages
- Risk: DATABASE_URL is exposed
- Recommendation: either `rm bridge-log.txt` or rename to `bridge-log.txt.example` if useful for future debugging

### `test-payload.json`
- Contains: webhook test fixture JSON
- Recommendation: move to `apps/whatsapp-bridge/scripts/fixtures/test-payload.json` if useful, otherwise `rm`

---

## Items to Commit as Versioned Files

If the team wants to preserve these, commit separately or move to `scripts/` dir:

1. `apps/whatsapp-bridge/scripts/` — move from untracked to versioned `scripts/` dir
2. `apps/whatsapp-bridge/src/global.d.ts` — keep as-is (already tracked or needs `git add`)
3. `planner.bat`, `reviewer.bat`, `worker1.bat`, `restart-bridge.bat` — useful peer launchers
4. `docs/superpowers/plans/2026-06-08-pi-stack-remediation.md` — historical doc

---

## Verification Commands

After applying deletions and .gitignore changes:

```bash
# Should show no sensitive untracked
git status -s

# Should show .gitignore changes
git diff .gitignore

# Should still pass
pnpm typecheck
pnpm test -- --run
```

---

*Generated by worker1 — Phase: untracked cleanup audit — stabilize-pi-financeiro-2026-06-11*