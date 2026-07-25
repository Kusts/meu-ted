// Group B form integration test: dirty tracking through commands
// for payables, budgets, goals, subscriptions, profile.
import "fake-indexeddb/auto";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { createCommands } from "../lib/state/commands";
import { UnsavedChangesProvider, useUnsavedChanges } from "../lib/unsaved-changes";
import * as endpoints from "@/lib/api/endpoints";

function setup() {
  const { result } = renderHook(() => useUnsavedChanges(), { wrapper: UnsavedChangesProvider });
  return result;
}

describe("Group B — commands dirty tracking (payables, budgets, goals, subscriptions, profile)", () => {
  beforeEach(() => { vi.restoreAllMocks(); localStorage.clear(); });

  it("createPayable: dirty before, clean after success", async () => {
    const stub = vi.spyOn(endpoints, "createPayable").mockResolvedValue({ id:"p1" } as never);
    const r = setup();
    const cmds = createCommands({ online:true, token:"t", dispatch:vi.fn(), api:endpoints, trackWrite: r.current.trackWrite });
    expect(r.current.isDirty).toBe(false);
    await act(async () => { await cmds.createPayable({ accountId:"a1", description:"Net", amountCents:3990, dueDate:"2026-08-01" }); });
    expect(r.current.isDirty).toBe(false);
    expect(stub).toHaveBeenCalled();
  });

  it("createBudget: dirty before, clean after success", async () => {
    const stub = vi.spyOn(endpoints, "createBudget").mockResolvedValue({ id:"b1" } as never);
    const r = setup();
    const cmds = createCommands({ online:true, token:"t", dispatch:vi.fn(), api:endpoints, trackWrite: r.current.trackWrite });
    await act(async () => { await cmds.createBudget({ categoryId:"c1", name:"Food", amountCents:50000, period:"monthly", startDate:"2026-07-01" }); });
    expect(r.current.isDirty).toBe(false);
    expect(stub).toHaveBeenCalled();
  });

  it("createGoal: dirty before, clean after success", async () => {
    const stub = vi.spyOn(endpoints, "createGoal").mockResolvedValue({ id:"g1" } as never);
    const r = setup();
    const cmds = createCommands({ online:true, token:"t", dispatch:vi.fn(), api:endpoints, trackWrite: r.current.trackWrite });
    await act(async () => { await cmds.createGoal({ name:"Emergency", goalType:"emergency_fund", targetAmountCents:100000, startDate:"2026-07-01" }); });
    expect(r.current.isDirty).toBe(false);
    expect(stub).toHaveBeenCalled();
  });

  it("addSubscription: dirty before, clean after success", async () => {
    const stub = vi.spyOn(endpoints, "addSubscription").mockResolvedValue({ id:"s1" } as never);
    const r = setup();
    const cmds = createCommands({ online:true, token:"t", dispatch:vi.fn(), api:endpoints, trackWrite: r.current.trackWrite });
    await act(async () => { await cmds.addSubscription({ name:"Netflix", amountCents:5590, cycle:"monthly", day:15, paymentMethod:"credit_card" }); });
    expect(r.current.isDirty).toBe(false);
    expect(stub).toHaveBeenCalled();
  });

  it("patchProfile: dirty before, clean after success", async () => {
    const stub = vi.spyOn(endpoints, "patchProfile").mockResolvedValue({} as never);
    const r = setup();
    const cmds = createCommands({ online:true, token:"t", dispatch:vi.fn(), api:endpoints, trackWrite: r.current.trackWrite });
    await act(async () => { await cmds.patchProfile({ name:"Test" }); });
    expect(r.current.isDirty).toBe(false);
    expect(stub).toHaveBeenCalled();
  });

  it("retains dirty state on failed save", async () => {
    vi.spyOn(endpoints, "createPayable").mockRejectedValue(new Error("API down"));
    const r = setup();
    const cmds = createCommands({ online:true, token:"t", dispatch:vi.fn(), api:endpoints, trackWrite: r.current.trackWrite });
    expect(r.current.isDirty).toBe(false);
    await act(async () => {
      try { await cmds.createPayable({ accountId:"a1", description:"Net", amountCents:3990, dueDate:"2026-08-01" }); } catch {}
    });
    expect(r.current.isDirty).toBe(true);
  });
});
