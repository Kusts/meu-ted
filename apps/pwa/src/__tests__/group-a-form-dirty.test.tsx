// Group A — Form-level dirty tracking (UI tests).
// Each listed form: a real user edit makes the dirty probe report dirty.
// Cancel/reset clears dirty. Successful save clears dirty. Failed save retains dirty.
// Rendered through UnsavedChangesProvider with a small isDirty probe component
// driven by the SAME useFormDirtySafe() instance the form uses (passed as
// render-props child), so we observe the form-scoped token, not a sibling.
import "fake-indexeddb/auto";
import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  render,
  screen,
  fireEvent,
  waitFor,
  cleanup,
} from "@testing-library/react";
import {
  UnsavedChangesProvider,
  useFormDirtySafe,
} from "../lib/unsaved-changes";

/**
 * Test form that exercises:
 *   - text input edits (dirty via onChangeCapture)
 *   - select edits (dirty via explicit markDirty)
 *   - cancel/reset (clean)
 *   - successful save (clean)
 *   - failed save (retain dirty)
 *
 * The probe is rendered as a sibling via children-as-function and shares the
 * SAME useFormDirtySafe() token as the form fields.
 */
function TestForm({
  testId,
  onSave,
  onCancel,
}: {
  testId: string;
  onSave: (input: { description: string; amount: number; kind: string }) => Promise<void>;
  onCancel: () => void;
}) {
  const dirty = useFormDirtySafe();
  const { markDirty, markClean } = dirty;
  const [description, setDescription] = React.useState("");
  const [amount, setAmount] = React.useState("");
  const [kind, setKind] = React.useState("expense");
  const [error, setError] = React.useState<string | null>(null);

  async function save() {
    try {
      await onSave({ description, amount: Number(amount), kind });
      markClean();
    } catch (e) {
      setError((e as Error).message);
    }
  }

  return (
    <div onChangeCapture={markDirty}>
      <input
        type="text"
        aria-label="description"
        value={description}
        onChange={(e) => setDescription(e.target.value)}
      />
      <input
        type="text"
        inputMode="numeric"
        aria-label="amount"
        value={amount}
        onChange={(e) => setAmount(e.target.value)}
      />
      <select
        aria-label="kind"
        value={kind}
        onChange={(e) => {
          markDirty();
          setKind(e.target.value);
        }}
      >
        <option value="expense">Despesa</option>
        <option value="income">Receita</option>
      </select>
      <button type="button" onClick={save}>
        Save
      </button>
      <button
        type="button"
        onClick={() => {
          markClean();
          onCancel();
        }}
      >
        Cancel
      </button>
      {error && <div role="alert">{error}</div>}
      <DirtyProbe testId={testId} isDirty={dirty.isDirty} />
    </div>
  );
}

function DirtyProbe({ testId, isDirty }: { testId: string; isDirty: boolean }) {
  return <span data-testid={`${testId}-state`}>{isDirty ? "dirty" : "clean"}</span>;
}

describe("Group A — form-level dirty tracking (UI)", () => {
  beforeEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it("text input edit marks the form dirty", async () => {
    const onSave = vi.fn().mockResolvedValue(undefined);
    render(
      <UnsavedChangesProvider>
        <TestForm testId="a" onSave={onSave} onCancel={() => {}} />
      </UnsavedChangesProvider>,
    );
    expect(screen.getByTestId("a-state")).toHaveTextContent("clean");
    fireEvent.change(screen.getByLabelText("description"), { target: { value: "Mercado" } });
    await waitFor(() => expect(screen.getByTestId("a-state")).toHaveTextContent("dirty"));
  });

  it("select edit marks the form dirty", async () => {
    const onSave = vi.fn().mockResolvedValue(undefined);
    render(
      <UnsavedChangesProvider>
        <TestForm testId="a" onSave={onSave} onCancel={() => {}} />
      </UnsavedChangesProvider>,
    );
    fireEvent.change(screen.getByLabelText("kind"), { target: { value: "income" } });
    await waitFor(() => expect(screen.getByTestId("a-state")).toHaveTextContent("dirty"));
  });

  it("cancel button clears the dirty flag", async () => {
    const onCancel = vi.fn();
    const onSave = vi.fn().mockResolvedValue(undefined);
    render(
      <UnsavedChangesProvider>
        <TestForm testId="a" onSave={onSave} onCancel={onCancel} />
      </UnsavedChangesProvider>,
    );
    fireEvent.change(screen.getByLabelText("description"), { target: { value: "x" } });
    await waitFor(() => expect(screen.getByTestId("a-state")).toHaveTextContent("dirty"));
    fireEvent.click(screen.getByText("Cancel"));
    expect(onCancel).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(screen.getByTestId("a-state")).toHaveTextContent("clean"));
  });

  it("successful save clears the dirty flag", async () => {
    const onSave = vi.fn().mockResolvedValue(undefined);
    render(
      <UnsavedChangesProvider>
        <TestForm testId="a" onSave={onSave} onCancel={() => {}} />
      </UnsavedChangesProvider>,
    );
    fireEvent.change(screen.getByLabelText("description"), { target: { value: "x" } });
    fireEvent.change(screen.getByLabelText("amount"), { target: { value: "100" } });
    await waitFor(() => expect(screen.getByTestId("a-state")).toHaveTextContent("dirty"));
    fireEvent.click(screen.getByText("Save"));
    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(screen.getByTestId("a-state")).toHaveTextContent("clean"));
  });

  it("failed save retains the dirty flag", async () => {
    const onSave = vi.fn().mockRejectedValue(new Error("network"));
    render(
      <UnsavedChangesProvider>
        <TestForm testId="a" onSave={onSave} onCancel={() => {}} />
      </UnsavedChangesProvider>,
    );
    fireEvent.change(screen.getByLabelText("description"), { target: { value: "x" } });
    await waitFor(() => expect(screen.getByTestId("a-state")).toHaveTextContent("dirty"));
    fireEvent.click(screen.getByText("Save"));
    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(screen.getByText("network")).toBeInTheDocument());
    expect(screen.getByTestId("a-state")).toHaveTextContent("dirty");
  });

  it("two forms have independent dirty tokens", async () => {
    const onSave = vi.fn().mockResolvedValue(undefined);
    render(
      <UnsavedChangesProvider>
        <TestForm testId="a" onSave={onSave} onCancel={() => {}} />
        <TestForm testId="b" onSave={onSave} onCancel={() => {}} />
      </UnsavedChangesProvider>,
    );
    fireEvent.change(screen.getAllByLabelText("description")[0], { target: { value: "only-a" } });
    await waitFor(() => expect(screen.getByTestId("a-state")).toHaveTextContent("dirty"));
    expect(screen.getByTestId("b-state")).toHaveTextContent("clean");
  });
});