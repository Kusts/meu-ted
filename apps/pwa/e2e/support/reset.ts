/**
 * E2E test reset helpers.
 * Resets fixture state, cookies, storage, IndexedDB, CacheStorage
 * and SW registrations before each test.
 */

import type { Page } from "@playwright/test";

export const FIXED_CLOCK = "2026-07-17T12:00:00.000Z";
export const FIXTURE_URL = "http://127.0.0.1:4010";
export const E2E_TEST_ID_HEADER = "x-e2e-test-id";

/**
 * Reset fixture store for a test ID with the given seed.
 */
export async function resetFixture(testId: string): Promise<void> {
  const res = await fetch(`${FIXTURE_URL}/__e2e/reset`, {
    method: "POST",
    headers: { "Content-Type": "application/json", [E2E_TEST_ID_HEADER]: testId },
    body: JSON.stringify({ testId, seed: "populated" }),
  });
  if (!res.ok) throw new Error(`Fixture reset failed: ${res.status}`);
}

/**
 * Set fixed clock before first navigation.
 * Must be called BEFORE page.goto().
 */
export async function setFixedClock(page: Page): Promise<void> {
  await page.clock.setFixedTime(FIXED_CLOCK);
}

/**
 * Full environment reset for a test.
 * Should be called in beforeEach.
 */
export async function resetEnvironment(
  page: Page,
  testId: string,
): Promise<void> {
  // Reset fixture store
  await resetFixture(testId);

  // Clear browser state
  await page.evaluate(() => {
    // Clear cookies
    document.cookie.split(";").forEach((c) => {
      document.cookie = c
        .replace(/^ +/, "")
        .replace(/=.*/, `=;expires=${new Date().toUTCString()};path=/`);
    });

    // Clear localStorage
    localStorage.clear();

    // Clear sessionStorage
    sessionStorage.clear();
  });

  // Clear IndexedDB
  await page.evaluate(async () => {
    const dbs = await indexedDB.databases();
    for (const db of dbs) {
      if (db.name) indexedDB.deleteDatabase(db.name);
    }
  });

  // Clear cache storage
  await page.evaluate(async () => {
    if ("caches" in globalThis) {
      const keys = await caches.keys();
      for (const key of keys) {
        await caches.delete(key);
      }
    }
  });

  // Unregister all service workers
  await page.evaluate(async () => {
    if ("serviceWorker" in navigator) {
      const registrations = await navigator.serviceWorker.getRegistrations();
      for (const reg of registrations) {
        await reg.unregister();
      }
    }
  });

  // Set fixed clock
  await setFixedClock(page);
}

/**
 * Set X-E2E-Test-ID header on browser context.
 */
export function setTestIdHeader(testId: string): Record<string, string> {
  return { [E2E_TEST_ID_HEADER]: testId };
}
