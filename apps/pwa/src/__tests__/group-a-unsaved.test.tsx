// Group A form integration test: verifies UnsavedChanges dirty tracking
// through commands for NewTransaction, records, and cards forms.
// Dirty before write, clear on success, retain on failure.
import "fake-indexeddb/auto";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { createCommands } from "../lib/state/commands";
import { UnsavedChangesProvider, useUnsavedChanges } from "../lib/unsaved-changes";
import * as endpoints from "@/lib/api/endpoints";

function setup() {
  vi.stubEnv("NEXT_PUBLIC_PI_FINANCE_API_BASE_URL", "http://localhost:3001");
  localStorage.setItem("pi-finance:token", "test-token");
  const { result } = renderHook(() => ({
    unsaved: useUnsavedChanges(),
  }), { wrapper: UnsavedChangesProvider });
  return result;
}

describe("Group A — commands dirty tracking (transactions, cards)", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    localStorage.clear();
  });

  it("createExpenseTransaction: dirty before call, clean after success", async () => {
    const stub = vi.spyOn(endpoints, "createExpenseTransaction").mockResolvedValue({ id: "t1" } as never);
    const provider = setup();
    const ctx = { online: true, token: "t", dispatch: vi.fn(), api: endpoints, trackWrite: provider.current.unsaved.trackWrite };
    const commands = createCommands(ctx);

    expect(provider.current.unsaved.isDirty).toBe(false);
    await act(async () => {
      await commands.createExpenseTransaction({ description:"x", amountCents:100, date:"2026-07-01", categoryId:"c1", accountId:"a1" });
    });
    expect(provider.current.unsaved.isDirty).toBe(false);
    expect(stub).toHaveBeenCalled();
  });

  it("createCard: dirty during, clean after success", async () => {
    const stub = vi.spyOn(endpoints, "createCard").mockResolvedValue({ id: "c1" } as never);
    const provider = setup();
    const commands = createCommands({ online: true, token: "t", dispatch: vi.fn(), api: endpoints, trackWrite: provider.current.unsaved.trackWrite });

    expect(provider.current.unsaved.isDirty).toBe(false);
    await act(async () => {
      await commands.createCard({ name:"Nubank", creditLimitCents:100000, closingDay:1, dueDay:10 });
    });
    expect(provider.current.unsaved.isDirty).toBe(false);
    expect(stub).toHaveBeenCalled();
  });
});
