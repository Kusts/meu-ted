// PWA audit policy — strict acceptance with optional expiring allowlist.
// expiresOn is optional — entries without it are permanent.
// Pure functions: no side effects, no filesystem, no network.

const REQUIRED_ALLOWLIST_FIELDS = [
  "id",
  "name",
  "severity",
  "via",
  "effects",
  "range",
  "scope",
  "owner",
  "justification",
];

const VALID_SCOPES = new Set(["runtime", "build-time", "dev-only"]);

// ---- validation ----

function isValidDate(yyyymmdd) {
  if (typeof yyyymmdd !== "string") return false;
  return /^\d{4}-\d{2}-\d{2}$/.test(yyyymmdd) && !isNaN(Date.parse(yyyymmdd));
}

function validateAllowlistEntry(entry) {
  const errors = [];
  for (const field of REQUIRED_ALLOWLIST_FIELDS) {
    if (!(field in entry) || entry[field] === undefined || entry[field] === null) {
      errors.push(`missing field: ${field}`);
    }
  }
  if (!Array.isArray(entry.via)) errors.push("via must be an array");
  if (!Array.isArray(entry.effects)) errors.push("effects must be an array");
  if (entry.scope && !VALID_SCOPES.has(entry.scope)) errors.push(`invalid scope: ${entry.scope}`);
  if (entry.expiresOn !== undefined && entry.expiresOn !== null && !isValidDate(entry.expiresOn)) {
    errors.push(`invalid expiresOn: ${entry.expiresOn}`);
  }
  if (typeof entry.name !== "string" || entry.name.length === 0) errors.push("name must be a non-empty string");
  return errors;
}

// ---- normalization ----

function normalizeRecord(record) {
  return {
    name: record.name,
    severity: record.severity,
    via: [...(record.via || [])].sort(),
    effects: [...(record.effects || [])].sort(),
    range: record.range,
  };
}

function canonicalKey(record) {
  return JSON.stringify(normalizeRecord(record));
}

// ---- matching ----

function matchVulnerability(vuln, allowlist) {
  const vulnKey = canonicalKey(vuln);
  return allowlist.find((entry) => canonicalKey(entry) === vulnKey) || null;
}

// ---- main ----

export function evaluateAudit({ audit, allowlist, today }) {
  const blocked = [];
  const resolved = [];
  const accepted = [];
  const vulns = audit.vulnerabilities || {};

  // Validate allowlist entries
  for (const entry of allowlist) {
    const errors = validateAllowlistEntry(entry);
    if (errors.length > 0) {
      blocked.push({ name: entry.name || "unknown", reason: `malformed allowlist: ${errors.join(", ")}` });
    }
  }

  // If allowlist itself has malformed entries, stop early
  if (blocked.length > 0) {
    return { status: "BLOCKED", blocked, resolved, accepted };
  }

  // Check allowlist expiry (only when expiresOn is present)
  for (const entry of allowlist) {
    if (entry.expiresOn && entry.expiresOn < today) {
      blocked.push({ name: entry.name, reason: `allowlist entry expired on ${entry.expiresOn}` });
    }
  }

  if (blocked.length > 0) {
    return { status: "BLOCKED", blocked, resolved, accepted };
  }

  // Match each audit vulnerability
  for (const [pkgName, vuln] of Object.entries(vulns)) {
    const matched = matchVulnerability(vuln, allowlist);
    if (matched) {
      accepted.push({ name: pkgName, id: matched.id, scope: matched.scope, expiresOn: matched.expiresOn });
    } else {
      blocked.push({ name: pkgName, reason: "no matching allowlist entry" });
    }
  }

  // Find allowlist entries not in current audit (resolved)
  const auditKeys = new Set(Object.values(vulns).map((v) => canonicalKey(v)));
  for (const entry of allowlist) {
    if (!auditKeys.has(canonicalKey(entry))) {
      resolved.push({ name: entry.name, id: entry.id });
    }
  }

  if (blocked.length > 0) return { status: "BLOCKED", blocked, resolved, accepted };
  if (Object.keys(vulns).length === 0) return { status: "PASS", blocked: [], resolved, accepted };
  return { status: "ACCEPTED", blocked: [], resolved, accepted };
}
