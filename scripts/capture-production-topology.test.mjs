import { test } from "node:test";
import assert from "node:assert/strict";
import {
  parseDockerPs,
  parseDockerCompose,
  parseSystemctlFailed,
  sanitizeTopologyText,
  buildTopologyDocument,
} from "./capture-production-topology.mjs";

test("production topology capture and sanitizer", async (t) => {
  await t.test("redacts passwords, tokens, bearer headers, and private keys", () => {
    const raw = "Connecting with password=supersecret and token=abc123xyz Bearer eyJhbGciOiJIUzI1Ni postgres://admin:secretpass@localhost:5432/db";
    const clean = sanitizeTopologyText(raw);
    assert.doesNotMatch(clean, /supersecret/);
    assert.doesNotMatch(clean, /abc123xyz/);
    assert.doesNotMatch(clean, /secretpass/);
    assert.doesNotMatch(clean, /eyJhbGciOiJIUzI1Ni/);
  });

  await t.test("parses docker ps output into structured objects", () => {
    const output = `NAMES\tIMAGE\tSTATUS
pi-api\tpi-finance-api:latest\tUp 3 hours
pi-db\tpostgres:16\tUp 10 days`;
    const containers = parseDockerPs(output);
    assert.equal(containers.length, 2);
    assert.equal(containers[0]?.name, "pi-api");
    assert.equal(containers[0]?.image, "pi-finance-api:latest");
  });

  await t.test("parses systemctl failed units", () => {
    const cleanOutput = `0 loaded units listed.`;
    const failedUnits = parseSystemctlFailed(cleanOutput);
    assert.equal(failedUnits.length, 0);

    const dirtyOutput = `UNIT LOAD ACTIVE SUB DESCRIPTION
bad.service loaded failed failed Bad service
1 loaded units listed.`;
    const units = parseSystemctlFailed(dirtyOutput);
    assert.equal(units.length, 1);
  });

  await t.test("builds markdown topology document", () => {
    const doc = buildTopologyDocument({
      hostname: "prod-vps",
      uptime: "10 days",
      containers: [{ name: "api", image: "api:v1", status: "Up" }],
      composeProjects: [],
      failedUnits: [],
    });
    assert.ok(doc.includes("Production Runtime Topology Snapshot"));
    assert.ok(doc.includes("`api`"));
  });
});
