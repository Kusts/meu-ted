import assert from "node:assert/strict";
import test from "node:test";
import fixture from "./__fixtures__/pwa-audit-current.json" with { type: "json" };
import { evaluateAudit } from "./pwa-audit-policy.mjs";

const TODAY = "2026-07-27";

// ---- helpers ----

function makeAllowlistEntry(pkgName, overrides = {}) {
  const vuln = fixture.vulnerabilities[pkgName];
  assert.ok(vuln, `fixture missing vulnerability for ${pkgName}`);
  return {
    id: `pwa-2026-07-27-${pkgName}`,
    scope: "dev-only",
    owner: "project-maintainer",
    justification: "No compatible upstream release as of 2026-07-27.",
    ...vuln,
    ...overrides,
  };
}

function buildAllowlist(entries) {
  return entries.map((e) => (typeof e === "string" ? makeAllowlistEntry(e) : e));
}

function fixturePackageNames() {
  return Object.keys(fixture.vulnerabilities);
}

// ---- accepted: all fixture entries matched (permanent, no expiry) ----

test("accepted: all fixture entries matched", () => {
  const allowlist = buildAllowlist(fixturePackageNames());
  const result = evaluateAudit({ audit: fixture, allowlist, today: TODAY });
  assert.equal(result.status, "ACCEPTED");
  assert.equal(result.blocked.length, 0);
});

// ---- new record: vulnerability not in allowlist ----

test("blocked: new vulnerability not in allowlist", () => {
  const names = fixturePackageNames();
  const allowlist = buildAllowlist(names.slice(0, -1));
  const result = evaluateAudit({ audit: fixture, allowlist, today: TODAY });
  assert.equal(result.status, "BLOCKED");
  assert.ok(result.blocked.length > 0);
});

// ---- changed via: modified dependency chain ----

test("blocked: changed via field", () => {
  const names = fixturePackageNames();
  const allowlist = buildAllowlist(names);
  allowlist[0].via = ["changed-dependency"];
  const result = evaluateAudit({ audit: fixture, allowlist, today: TODAY });
  assert.equal(result.status, "BLOCKED");
});

// ---- expired: expiresOn before today (still blocks) ----

test("blocked: expired allowlist entry when expiresOn is set", () => {
  const names = fixturePackageNames();
  const allowlist = buildAllowlist(names);
  allowlist[0].expiresOn = "2026-07-26"; // yesterday
  const result = evaluateAudit({ audit: fixture, allowlist, today: TODAY });
  assert.equal(result.status, "BLOCKED");
});

// ---- permanent: no expiresOn = never expires ----

test("accepted: permanent entries without expiresOn", () => {
  const names = fixturePackageNames();
  const allowlist = buildAllowlist(names);
  // entries have no expiresOn by default — should be accepted even with old today
  const result = evaluateAudit({ audit: fixture, allowlist, today: "2027-01-01" });
  assert.equal(result.status, "ACCEPTED");
  assert.equal(result.blocked.length, 0);
});

// ---- malformed: missing required fields ----

test("blocked: malformed allowlist entry missing id", () => {
  const names = fixturePackageNames();
  const allowlist = buildAllowlist(names);
  delete allowlist[0].id;
  const result = evaluateAudit({ audit: fixture, allowlist, today: TODAY });
  assert.equal(result.status, "BLOCKED");
});

test("blocked: malformed allowlist entry missing scope", () => {
  const names = fixturePackageNames();
  const allowlist = buildAllowlist(names);
  delete allowlist[0].scope;
  const result = evaluateAudit({ audit: fixture, allowlist, today: TODAY });
  assert.equal(result.status, "BLOCKED");
});

// ---- resolved: allowlist entry no longer in current audit ----

test("resolved: allowlist entry no longer in current audit", () => {
  const names = fixturePackageNames();
  const allowlist = buildAllowlist(names);
  allowlist.push(makeAllowlistEntry(names[0], { name: "resolved-pkg", id: "pwa-2026-07-27-resolved-pkg" }));
  const result = evaluateAudit({ audit: fixture, allowlist, today: TODAY });
  assert.equal(result.status, "ACCEPTED");
  assert.ok(result.resolved.length > 0);
});

// ---- pass: no vulnerabilities ----

test("pass: no vulnerabilities", () => {
  const emptyAudit = { vulnerabilities: {}, metadata: { vulnerabilities: { total: 0 } } };
  const result = evaluateAudit({ audit: emptyAudit, allowlist: [], today: TODAY });
  assert.equal(result.status, "PASS");
  assert.equal(result.blocked.length, 0);
});
