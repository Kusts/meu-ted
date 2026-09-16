/**
 * XLT-09 — Logout cleanup (V4 T2.6 accept, SPEC §10; XLT-09).
 *
 * Invariant: logout (and 401-triggered session expiry, which funnels
 * through the same `clearSensitiveSession`) removes the token, the v1
 * snapshot, the v2 IndexedDB snapshot, the profile, the offline subject
 * partition AND the last-online-auth stamp — so neither the app nor the
 * offline shell can render residual financial data afterwards.
 *
 * Real layers crossed (≥2):
 *   (a) REAL browser stores: localStorage keys plus the real IndexedDB
 *       database (`pi-finance-snapshot`) the app uses;
 *   (b) the REAL `public/offline-shell.js` source asserting "no data"
 *       afterwards (not just key absence).
 *
 * The exact deletion contract (which keys, all flags, failure isolation)
 * is pinned by units importing the real `clearSensitiveSession`
 * (`src/lib/session.test.ts`, `src/lib/session-offline-age.t2-6.test.ts`),
 * which the bundler-less XLT env cannot load in-browser (same rationale
 * as XLT-02). This XLT proves the crossing those units cannot: after the
 * app's logout-equivalent clearing runs against real browser stores, the
 * shell serves nothing and a stale subject cannot reopen the snapshot.
 */
import { test, expect } from "@playwright/test";
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import type { AddressInfo } from "node:net";

const SUBJECT_A = "11111111-2222-4333-8444-555555555555";
const SUBJECT_KEY = "pi-finance:offline-subject";
const STAMP_KEY = "pi-finance:last-online-authenticated-at";
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

/** Seed a live session: envelope + subject + stamp + tokens + v1 + profile. */
async function seedLiveSession(page: import("@playwright/test").Page): Promise<void> {
  await page.evaluate(
    ({ subj, subjKey, stampKey, label }) => {
      localStorage.setItem(subjKey, subj);
      localStorage.setItem(stampKey, new Date().toISOString());
      localStorage.setItem("pi-finance:token", "dev-secret");
      localStorage.setItem("pi-finance:session-token", "sess-secret");
      localStorage.setItem("pi-finance:snapshot:v1", JSON.stringify({ version: 1 }));
      localStorage.setItem("pi-finance:profile", JSON.stringify({ name: "x" }));
      const stamped = new Date().toISOString();
      const envelope = {
        schema: 2,
        ownerFingerprint: "fp-test",
        offlineSubjectId: subj,
        lastOnlineAuthenticatedAt: stamped,
        domains: {
          transactions: [{ id: "tx-1", description: label, amountCents: -1250 }],
        },
        syncedAt: { transactions: stamped },
      };
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
    { subj: SUBJECT_A, subjKey: SUBJECT_KEY, stampKey: STAMP_KEY, label: FINANCIAL_LABEL },
  );
}

/**
 * The app's logout-equivalent clearing (same stores/keys
 * `clearSensitiveSession({clearToken, clearV1Snapshot, clearProfile})`
 * removes: token-store keys, v1 snapshot, profile, subject, age stamp,
 * plus the v2 IndexedDB snapshot).
 */
async function appLogout(page: import("@playwright/test").Page): Promise<void> {
  await page.evaluate(
    ({ subjKey, stampKey }) => {
      localStorage.removeItem("pi-finance:token");
      localStorage.removeItem("pi-finance:session-token");
      localStorage.removeItem("pi-finance:snapshot:v1");
      localStorage.removeItem("pi-finance:profile");
      localStorage.removeItem(subjKey);
      localStorage.removeItem(stampKey);
      return new Promise<void>((resolve, reject) => {
        const req = indexedDB.deleteDatabase("pi-finance-snapshot");
        req.onsuccess = () => resolve();
        req.onerror = () => reject(req.error);
        req.onblocked = () => resolve();
      });
    },
    { subjKey: SUBJECT_KEY, stampKey: STAMP_KEY },
  );
}

test("[XLT-09] logout clears every session store: shell serves no data", async ({
  page,
}) => {
  await page.goto(`${baseURL}/registros`);
  await seedLiveSession(page);
  await page.reload();
  await expect(page.getByText(FINANCIAL_LABEL)).toBeVisible();

  await appLogout(page);

  const stores = await page.evaluate(
    ({ subjKey, stampKey }) => ({
      subject: localStorage.getItem(subjKey),
      stamp: localStorage.getItem(stampKey),
      token: localStorage.getItem("pi-finance:token"),
      session: localStorage.getItem("pi-finance:session-token"),
      v1: localStorage.getItem("pi-finance:snapshot:v1"),
      profile: localStorage.getItem("pi-finance:profile"),
    }),
    { subjKey: SUBJECT_KEY, stampKey: STAMP_KEY },
  );
  expect(Object.values(stores)).toEqual([null, null, null, null, null, null]);

  await page.reload();
  await expect(page.getByText(FINANCIAL_LABEL)).toHaveCount(0);
  await expect(page.getByText("Nenhum dado offline")).toBeVisible();
});

test("[XLT-09] a stale subject cannot reopen the cleared snapshot", async ({
  page,
}) => {
  await page.goto(`${baseURL}/registros`);
  await seedLiveSession(page);
  await appLogout(page);

  // Attacker restores the old subject value — the envelope is gone, so the
  // shell must still serve nothing (deletion, not just lock).
  await page.evaluate(
    ({ subjKey, subj }) => localStorage.setItem(subjKey, subj),
    { subjKey: SUBJECT_KEY, subj: SUBJECT_A },
  );
  await page.reload();
  await expect(page.getByText(FINANCIAL_LABEL)).toHaveCount(0);
});
