import { describe, it, expect, vi } from "vitest";
import { parseRuntimeStage, RuntimeOwnershipRouter } from "./runtime-ownership.js";
import type { PiClient } from "./webhook-handler.js";

describe("Runtime Ownership State Machine", () => {
  it("parses valid stages correctly", () => {
    const piOwner = parseRuntimeStage({ FINANCE_RUNTIME_STAGE: "pi_owner" });
    expect(piOwner.responder).toBe("pi");
    expect(piOwner.allowPiWrites).toBe(true);
    expect(piOwner.allowAgentWrites).toBe(false);
    expect(piOwner.shadowMode).toBe("agent_read");

    const agentOwner = parseRuntimeStage({ FINANCE_RUNTIME_STAGE: "agent_owner" });
    expect(agentOwner.responder).toBe("agent");
    expect(agentOwner.allowPiWrites).toBe(false);
    expect(agentOwner.allowAgentWrites).toBe(true);

    const fallback = parseRuntimeStage({ FINANCE_RUNTIME_STAGE: "agent_owner_pi_read_fallback" });
    expect(fallback.responder).toBe("agent");
    expect(fallback.shadowMode).toBe("pi_read_fallback");

    const frozen = parseRuntimeStage({ FINANCE_RUNTIME_STAGE: "frozen" });
    expect(frozen.responder).toBe("agent");
    expect(frozen.allowPiWrites).toBe(false);
    expect(frozen.shadowMode).toBe("disabled");
  });

  it("throws fail-closed error on invalid runtime stage", () => {
    expect(() => parseRuntimeStage({ FINANCE_RUNTIME_STAGE: "invalid_stage" })).toThrowError(
      /Invalid FINANCE_RUNTIME_STAGE/,
    );
  });

  it("routes message exclusively to Pi in pi_owner stage (exactly-once response)", async () => {
    const piSend = vi.fn(async () => ({ success: true, data: { message: "Pi response" } }));
    const agentSend = vi.fn(async () => ({ success: true, data: { message: "Agent response" } }));

    const router = new RuntimeOwnershipRouter(
      parseRuntimeStage({ FINANCE_RUNTIME_STAGE: "pi_owner" }),
      {
        piClient: { send: piSend },
        agentClient: { send: agentSend },
      },
    );

    const res = await router.send("gastei 50", "5511", {
      source: "whatsapp",
      chatId: "c1",
      providerMessageId: "m1",
    });

    expect(res.data?.message).toBe("Pi response");
    expect(piSend).toHaveBeenCalledTimes(1);
    expect(agentSend).not.toHaveBeenCalled();
  });

  it("routes message exclusively to Agent in agent_owner stage", async () => {
    const piSend = vi.fn(async () => ({ success: true, data: { message: "Pi response" } }));
    const agentSend = vi.fn(async () => ({ success: true, data: { message: "Agent response" } }));

    const router = new RuntimeOwnershipRouter(
      parseRuntimeStage({ FINANCE_RUNTIME_STAGE: "agent_owner" }),
      {
        piClient: { send: piSend },
        agentClient: { send: agentSend },
      },
    );

    const res = await router.send("qual o saldo?", "5511", {
      source: "whatsapp",
      chatId: "c1",
      providerMessageId: "m1",
    });

    expect(res.data?.message).toBe("Agent response");
    expect(agentSend).toHaveBeenCalledTimes(1);
    expect(piSend).not.toHaveBeenCalled();
  });

  it("falls back to Pi in agent_owner_pi_read_fallback when Agent fails", async () => {
    const piSend = vi.fn(async () => ({ success: true, data: { message: "Pi fallback response" } }));
    const agentSend = vi.fn(async () => ({ success: false, reason: "Agent unavailable" }));

    const router = new RuntimeOwnershipRouter(
      parseRuntimeStage({ FINANCE_RUNTIME_STAGE: "agent_owner_pi_read_fallback" }),
      {
        piClient: { send: piSend },
        agentClient: { send: agentSend },
      },
    );

    const res = await router.send("qual o saldo?", "5511", {
      source: "whatsapp",
      chatId: "c1",
      providerMessageId: "m1",
    });

    expect(res.success).toBe(true);
    expect(res.data?.message).toBe("Pi fallback response");
    expect(agentSend).toHaveBeenCalledTimes(1);
    expect(piSend).toHaveBeenCalledTimes(1);
  });

  it("supports zero-downtime rollback from agent_owner to pi_owner", async () => {
    const piSend = vi.fn(async () => ({ success: true, data: { message: "Pi after rollback" } }));
    const agentSend = vi.fn(async () => ({ success: true, data: { message: "Agent before rollback" } }));

    let config = parseRuntimeStage({ FINANCE_RUNTIME_STAGE: "agent_owner" });
    const clients = { piClient: { send: piSend }, agentClient: { send: agentSend } };

    let router = new RuntimeOwnershipRouter(config, clients);
    let res = await router.send("msg 1", "5511", { source: "w", chatId: "c", providerMessageId: "m1" });
    expect(res.data?.message).toBe("Agent before rollback");

    // Perform rollback to pi_owner
    config = parseRuntimeStage({ FINANCE_RUNTIME_STAGE: "pi_owner" });
    router = new RuntimeOwnershipRouter(config, clients);

    res = await router.send("msg 2", "5511", { source: "w", chatId: "c", providerMessageId: "m2" });
    expect(res.data?.message).toBe("Pi after rollback");
  });
});
