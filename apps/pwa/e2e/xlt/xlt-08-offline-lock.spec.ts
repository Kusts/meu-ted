/**
 * XLT-08 — Offline session lock (V4 T2.6, SPEC §10 D1-D3, §8.B4, INV-06).
 *
 * Invariant: an offline snapshot older than MAX_OFFLINE_AUTH_AGE (or
 * without a verifiable subject partition) NEVER renders financial data —
 * not even through the service-worker fallback shell. Online revalidation
 * unlocks; offline writes stay blocked.
 *
 * Real layers crossed (≥2):
 *   (a) the REAL `public/offline-shell.js` source (read from disk and
 *       inlined into the harness page — no re-implementation);
 *   (b) REAL browser stores: IndexedDB (`pi-finance-snapshot`) for the
 *       envelope and localStorage for the subject partition;
 *   (c) a REAL Cronómetro: expiry is computed against the live clock.
 *
 * Out of scope here (pinned by units importing the real modules, which the
 * bundler-less XLT env cannot load in-browser — same rationale as XLT-02):
 * `OfflineWriteError` on every command is covered by
 * `src/lib/state/__tests__/offline-lock.t2-6.test.ts` ("offline writes stay
 * blocked") plus the pre-existing `commands.test.ts`. This XLT additionally
 * proves the complementary shell property: the lock path performs ZERO
 * writes to the envelope (expired data is kept for revalidation).
 */
import { test, expect } from "@playwright/test";
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import type { AddressInfo } from "node:net";

const SUBJECT_A = "11111111-2222-4333-8444-555555555555";
const SUBJECT_KEY = "pi-finance:offline-subject";
const LOCK_TEXT = "offline session locked";
const FINANCIAL_LABEL = "Padaria Pão Dourado";

const SHELL_JS = fs.readFileSync(
  path.resolve(__dirname, "../../public/offline-shell.js"),
  "utf8",
);

function harnessHtml(): string {
  return `<!doctype html><html><body>
<h1 id="page-title"></h1>
<div id="page-route"></div>
<div id="synced-at"></div>
<div id="content"></div>
<script>${SHELL_JS}</script>
</body></html>`;
}

let server: http.Server;
let baseURL: string;

test.beforeAll(async () => {
  server = http.createServer((_req, res) => {
    res.statusCode = 200;
    res.setHeader("content-type", "text/html");
    res.end(harnessHtml());
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address() as AddressInfo;
  baseURL = `http://127.0.0.1:${port}`;
});

test.afterAll(async () => {
  await new Promise<void>((resolve, reject) =>
    server.close((err) => (err ? reject(err) : resolve())),
  );
});

type SeedOpts = {
  subject?: string | null;
  ageHours?: number;
  legacy?: boolean;
};

async function seed(
  page: import("@playwright/test").Page,
  { subject = SUBJECT_A, ageHours = 1, legacy = false }: SeedOpts = {},
): Promise<void> {
  await page.evaluate(
    ({ subj, key, hours, isLegacy, label }) => {
      if (subj === null) {
        localStorage.removeItem(key);
      } else {
        localStorage.setItem(key, subj);
      }
      // No bearer credential is ever seeded: the subject partition alone
      // must suffice (T2.3 B4).
      const stamped = new Date(Date.now() - hours * 3_600_000).toISOString();
      const envelope: Record<string, unknown> = {
        schema: 2,
        ownerFingerprint: "fp-test",
        domains: {
          transactions: [
            { id: "tx-1", description: label, amountCents: -1250, status: "paid" },
          ],
        },
        syncedAt: { transactions: stamped },
      };
      if (!isLegacy) {
        envelope["offlineSubjectId"] = subj;
        envelope["lastOnlineAuthenticatedAt"] = stamped;
      }
      return new Promise<void>((resolve, reject) => {
        const open = indexedDB.open("pi-finance-snapshot", 1);
        open.onupgradeneeded = () => {
          open.result.createObjectStore("snapshots");
        };
        open.onsuccess = () => {
          const db = open.result;
          const tx = db.transaction("snapshots", "readwrite");
          tx.objectStore("snapshots").put(envelope, "v2");
          tx.oncomplete = () => {
            db.close();
            resolve();
          };
          tx.onerror = () => {
            db.close();
            reject(tx.error);
          };
        };
        open.onerror = () => reject(open.error);
      });
    },
    { subj: subject, key: SUBJECT_KEY, hours: ageHours, isLegacy: legacy, label: FINANCIAL_LABEL },
  );
}

async function readRawEnvelope(page: import("@playwright/test").Page): Promise<string | null> {
  return page.evaluate(
    () =>
      new Promise<string | null>((resolve, reject) => {
        const open = indexedDB.open("pi-finance-snapshot", 1);
        open.onupgradeneeded = () => {
          open.result.createObjectStore("snapshots");
        };
        open.onsuccess = () => {
          const db = open.result;
          const tx = db.transaction("snapshots", "readonly");
          const req = tx.objectStore("snapshots").get("v2");
          req.onsuccess = () => {
            db.close();
            resolve(req.result ? JSON.stringify(req.result) : null);
          };
          req.onerror = () => {
            db.close();
            reject(req.error);
          };
        };
        open.onerror = () => reject(open.error);
      }),
  );
}

test("[XLT-08] within the age limit the shell renders the snapshot (no credential needed)", async ({
  page,
}) => {
  await page.goto(`${baseURL}/registros`);
  await seed(page, { ageHours: 1 });
  await page.reload();
  await expect(page.getByText(FINANCIAL_LABEL)).toBeVisible();
  await expect(page.getByText(LOCK_TEXT)).toHaveCount(0);
});

test("[XLT-08] expired age locks the shell: no financial data rendered", async ({
  page,
}) => {
  await page.goto(`${baseURL}/registros`);
  await seed(page, { ageHours: 80 });
  await page.reload();
  await expect(page.getByText(LOCK_TEXT)).toBeVisible();
  await expect(page.getByText(FINANCIAL_LABEL)).toHaveCount(0);
});

test("[XLT-08] shell without a subject locks (never renders)", async ({ page }) => {
  await page.goto(`${baseURL}/registros`);
  await seed(page, { subject: null, ageHours: 1 });
  await page.reload();
  await expect(page.getByText(LOCK_TEXT)).toBeVisible();
  await expect(page.getByText(FINANCIAL_LABEL)).toHaveCount(0);
});

test("[XLT-08] legacy envelope (no subject/age) locks instead of rendering", async ({
  page,
}) => {
  await page.goto(`${baseURL}/registros`);
  await seed(page, { legacy: true });
  await page.reload();
  await expect(page.getByText(LOCK_TEXT)).toBeVisible();
  await expect(page.getByText(FINANCIAL_LABEL)).toHaveCount(0);
});

test("[XLT-08] online revalidation unlocks: refreshed age renders again", async ({
  page,
}) => {
  await page.goto(`${baseURL}/registros`);
  await seed(page, { ageHours: 80 });
  await page.reload();
  await expect(page.getByText(LOCK_TEXT)).toBeVisible();

  // Online revalidation (what refreshOfflineAuthAge does): stamp now.
  await seed(page, { ageHours: 0 });
  await page.reload();
  await expect(page.getByText(FINANCIAL_LABEL)).toBeVisible();
  await expect(page.getByText(LOCK_TEXT)).toHaveCount(0);
});

test("[XLT-08] the lock path performs zero envelope writes (expired data kept)", async ({
  page,
}) => {
  await page.goto(`${baseURL}/registros`);
  await seed(page, { ageHours: 80 });
  const before = await readRawEnvelope(page);
  expect(before).not.toBeNull();
  await page.reload();
  await expect(page.getByText(LOCK_TEXT)).toBeVisible();
  expect(await readRawEnvelope(page)).toBe(before);
});
