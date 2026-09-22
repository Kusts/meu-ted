import fs from 'node:fs';
import path from 'node:path';

const EXPIRY_PATTERN = /Expiry:\s*(\d{4}-\d{2}-\d{2})/i;
const EXPIRY_DECL_ATTEMPT = /expir\w*\s*:/i;
const DATE_LIKE = /\d{4}[-/]\d{2}[-/]\d{2}|\d{2}-\d{2}-\d{4}/;
const CVE_PATTERN = /^CVE-\d{4}-\d{4,}$/;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export function todayUtc() {
  return new Date().toISOString().slice(0, 10);
}

function isRealCalendarDate(value) {
  if (!DATE_PATTERN.test(value)) return false;
  const asUtc = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(asUtc.getTime())) return false;
  return asUtc.toISOString().slice(0, 10) === value;
}

function extractExpiry(commentText) {
  const match = commentText.match(EXPIRY_PATTERN);
  return match ? match[1] : null;
}

function looksLikeExpiryAttempt(commentText) {
  if (EXPIRY_DECL_ATTEMPT.test(commentText)) return true;
  return /expir/i.test(commentText) && DATE_LIKE.test(commentText);
}

export function parseTrivyignore(text, options = {}) {
  const today = options.today ?? todayUtc();
  const entries = [];
  const errors = [];
  let currentExpiry = null;

  const lines = String(text ?? '').split(/\r?\n/);
  lines.forEach((rawLine, index) => {
    const lineNo = index + 1;
    const line = rawLine.trim();
    if (line === '') return;

    if (line.startsWith('#')) {
      const declared = extractExpiry(line);
      if (declared) {
        if (!isRealCalendarDate(declared)) {
          errors.push(`line ${lineNo}: malformed expiry date '${declared}' (expected real YYYY-MM-DD)`);
          return;
        }
        currentExpiry = declared;
        return;
      }
      if (looksLikeExpiryAttempt(line)) {
        errors.push(`line ${lineNo}: malformed expiry declaration (expected 'Expiry: YYYY-MM-DD')`);
      }
      return;
    }

    const hashAt = line.indexOf('#');
    const idPart = (hashAt === -1 ? line : line.slice(0, hashAt)).trim();
    const commentPart = hashAt === -1 ? '' : line.slice(hashAt);

    if (!CVE_PATTERN.test(idPart)) {
      errors.push(`line ${lineNo}: unrecognized entry '${idPart}' (expected CVE-YYYY-NNNNN or '#'-comment)`);
      if (commentPart && looksLikeExpiryAttempt(commentPart) && !extractExpiry(commentPart)) {
        errors.push(`line ${lineNo}: malformed inline expiry declaration (expected 'Expiry: YYYY-MM-DD')`);
      }
      return;
    }

    let expiry = null;
    if (commentPart) {
      const inline = extractExpiry(commentPart);
      if (inline) {
        if (!isRealCalendarDate(inline)) {
          errors.push(`line ${lineNo}: malformed inline expiry date '${inline}' for ${idPart}`);
          return;
        }
        expiry = inline;
      } else if (looksLikeExpiryAttempt(commentPart)) {
        errors.push(`line ${lineNo}: malformed inline expiry declaration for ${idPart} (expected 'Expiry: YYYY-MM-DD')`);
        return;
      }
    }
    expiry ??= currentExpiry;

    if (!expiry) {
      errors.push(`line ${lineNo}: missing expiry for ${idPart} (each ignore needs 'Expiry: YYYY-MM-DD')`);
      return;
    }
    if (expiry < today) {
      errors.push(`line ${lineNo}: expired exception ${idPart} (expiry ${expiry} is before ${today})`);
      return;
    }
    entries.push({ cve: idPart, line: lineNo, expiry });
  });

  return { entries, errors };
}

export function validateTrivyignore(text, options = {}) {
  const { entries, errors } = parseTrivyignore(text, options);
  return { ok: errors.length === 0, entries, errors };
}

export function validateTrivyignoreFile(repoPath = process.cwd(), options = {}) {
  const file = path.join(repoPath, '.trivyignore');
  if (!fs.existsSync(file)) return { ok: true, entries: [], errors: [] };
  const text = fs.readFileSync(file, 'utf8');
  return validateTrivyignore(text, options);
}
