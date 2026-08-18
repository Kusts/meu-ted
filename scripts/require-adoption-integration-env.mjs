const missing = [];
const databaseUrl = process.env.DATABASE_URL_TEST?.trim();
const marker = process.env.DB_TEST_MARKER?.trim();

if (!databaseUrl) {
  missing.push("DATABASE_URL_TEST");
} else {
  try {
    const parsed = new URL(databaseUrl);
    if (parsed.protocol !== "postgres:" && parsed.protocol !== "postgresql:") {
      missing.push("DATABASE_URL_TEST (must use postgres:// or postgresql://)");
    }
  } catch {
    missing.push("DATABASE_URL_TEST (must be a valid PostgreSQL URL)");
  }
}

if (!marker) missing.push("DB_TEST_MARKER");

if (missing.length > 0) {
  console.error(
    `Adoption integration tests require: ${missing.join(", ")}. Refusing to run with skipped tests.`,
  );
  process.exitCode = 1;
}
