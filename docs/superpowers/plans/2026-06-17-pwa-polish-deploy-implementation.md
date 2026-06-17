# PWA Polish + Deploy Readiness — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development

**Goal:** Preparar o PWA para deploy com polish final, documentação e verificações de readiness.

**Architecture:** Mudanças locais apenas — sem novo backend, sem nova UI. Foco em config, docs e verificações finais.

## Slice D-1: Polish local

### Task D-1.1: Version bump

```bash
cd ../pi-finance-web
npm version 1.0.0 --no-git-tag-version
```

### Task D-1.2: robots.txt

Create `public/robots.txt`:
```
User-agent: *
Disallow: /
```

### Task D-1.3: wrangler.toml cleanup

Replace hardcoded URL with placeholder:
```toml
[vars]
VITE_API_BASE_URL = "https://api.your-domain.com"
```

### Task D-1.4: README update

Add module list, current test stats, and verification commands section.

### Task D-1.5: Verification

```bash
npx tsc --noEmit && npx vitest run && npm run build
```

## Slice D-2: Deploy documentation

### Task D-2.1: Deploy checklist

Create deploy checklist in README — what user needs before deploy:
- [ ] Cloudflare account
- [ ] API token (Pages:Edit permission)
- [ ] Account ID
- [ ] Domain (or use `*.pages.dev`)
- [ ] `VITE_API_BASE_URL` pointing to production `pi-finance-api`
- [ ] `DATABASE_URL` for production Postgres (backend only)

### Task D-2.2: GitHub Actions secrets

Document which secrets to set: `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`.

## Slice D-3: Final verification

```bash
cd ../pi-finance-web
npx tsc --noEmit
npx vitest run
npm run build
npm run e2e
```

All gates must pass.

## Verification

| Command | Expected |
|---|---|
| `npx tsc --noEmit` | exit 0 |
| `npx vitest run` | 206+ tests pass |
| `npm run build` | exit 0, dist/ generated |
| `npm run e2e` | 41+ tests pass |
