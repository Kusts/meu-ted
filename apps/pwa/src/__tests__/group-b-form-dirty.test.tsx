// Group B — Form-level dirty tracking (UI tests).
// Payables, budgets, goals, subscriptions, profile forms.
// Same contract as Group A: edit marks dirty; cancel/reset clears; success clears;
// failure retains. Probe component receives isDirty as a prop so it shares the
// SAME useFormDirtySafe() token as the form (no sibling-instance divergence).
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

function DirtyProbe({ testId, isDirty }: { testId: string; isDirty: boolean }) {
  return <span data-testid={`${testId}-state`}>{isDirty ? "dirty" : "clean"}</span>;
}

/** Payables-like form: edit desc/amount/dueDate, save or cancel. */
function PayablesForm({ testId, onSave }: { testId: string; onSave: (input: { description: string; amount: number; dueDate: string }) => Promise<void> }) {
  const dirty = useFormDirtySafe();
  const { markDirty, markClean } = dirty;
  const [description, setDescription] = React.useState("");
  const [amount, setAmount] = React.useState("");
  const [dueDate, setDueDate] = React.useState("");
  const [err, setErr] = React.useState<string | null>(null);

  return (
    <div onChangeCapture={markDirty}>
      <input aria-label="desc" value={description} onChange={(e) => setDescription(e.target.value)} />
      <input aria-label="amount" inputMode="numeric" value={amount} onChange={(e) => setAmount(e.target.value)} />
      <input aria-label="dueDate" type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
      <button type="button" onClick={async () => {
        try { await onSave({ description, amount: Number(amount), dueDate }); markClean(); }
        catch (e) { setErr((e as Error).message); }
      }}>save</button>
      <button type="button" onClick={() => { markClean(); }}>cancel</button>
      {err && <div role="alert">{err}</div>}
      <DirtyProbe testId={testId} isDirty={dirty.isDirty} />
    </div>
  );
}

/** Budgets-like form: pick type chip, pick category chip, enter amount. */
function BudgetsForm({ testId, onSave }: { testId: string; onSave: (input: { type: string; category: string; amount: number }) => Promise<void> }) {
  const dirty = useFormDirtySafe();
  const { markDirty, markClean } = dirty;
  const [type, setType] = React.useState("expense");
  const [category, setCategory] = React.useState("");
  const [amount, setAmount] = React.useState("");
  const [err, setErr] = React.useState<string | null>(null);

  return (
    <div onChangeCapture={markDirty}>
      <button type="button" onClick={() => { markDirty(); setType("expense"); }}>Despesa</button>
      <button type="button" onClick={() => { markDirty(); setType("income"); }}>Receita</button>
      <button type="button" onClick={() => { markDirty(); setCategory("cat-1"); }}>cat-1</button>
      <input aria-label="amount" inputMode="numeric" value={amount} onChange={(e) => setAmount(e.target.value)} />
      <button type="button" onClick={async () => {
        try { await onSave({ type, category, amount: Number(amount) }); markClean(); }
        catch (e) { setErr((e as Error).message); }
      }}>save</button>
      <button type="button" onClick={() => { markClean(); }}>cancel</button>
      {err && <div role="alert">{err}</div>}
      <DirtyProbe testId={testId} isDirty={dirty.isDirty} />
    </div>
  );
}

/** Goals-like form: name + target + cycle chip. */
function GoalsForm({ testId, onSave }: { testId: string; onSave: (input: { name: string; target: number; cycle: string }) => Promise<void> }) {
  const dirty = useFormDirtySafe();
  const { markDirty, markClean } = dirty;
  const [name, setName] = React.useState("");
  const [target, setTarget] = React.useState("");
  const [cycle, setCycle] = React.useState("monthly");
  const [err, setErr] = React.useState<string | null>(null);

  return (
    <div onChangeCapture={markDirty}>
      <input aria-label="name" value={name} onChange={(e) => setName(e.target.value)} />
      <input aria-label="target" inputMode="numeric" value={target} onChange={(e) => setTarget(e.target.value)} />
      <button type="button" onClick={() => { markDirty(); setCycle("monthly"); }}>monthly</button>
      <button type="button" onClick={() => { markDirty(); setCycle("yearly"); }}>yearly</button>
      <button type="button" onClick={async () => {
        try { await onSave({ name, target: Number(target), cycle }); markClean(); }
        catch (e) { setErr((e as Error).message); }
      }}>save</button>
      <button type="button" onClick={() => { markClean(); }}>cancel</button>
      {err && <div role="alert">{err}</div>}
      <DirtyProbe testId={testId} isDirty={dirty.isDirty} />
    </div>
  );
}

/** Subscriptions-like form: service preset chips + amount + cycle. */
function SubscriptionsForm({ testId, onSave }: { testId: string; onSave: (input: { service: string; amount: number; cycle: string }) => Promise<void> }) {
  const dirty = useFormDirtySafe();
  const { markDirty, markClean } = dirty;
  const [service, setService] = React.useState("");
  const [amount, setAmount] = React.useState("");
  const [cycle, setCycle] = React.useState("monthly");
  const [err, setErr] = React.useState<string | null>(null);

  return (
    <div onChangeCapture={markDirty}>
      <button type="button" onClick={() => { markDirty(); setService("Netflix"); }}>Netflix</button>
      <button type="button" onClick={() => { markDirty(); setService("Spotify"); }}>Spotify</button>
      <input aria-label="amount" inputMode="numeric" value={amount} onChange={(e) => setAmount(e.target.value)} />
      <button type="button" onClick={() => { markDirty(); setCycle("monthly"); }}>monthly</button>
      <button type="button" onClick={() => { markDirty(); setCycle("yearly"); }}>yearly</button>
      <button type="button" onClick={async () => {
        try { await onSave({ service, amount: Number(amount), cycle }); markClean(); }
        catch (e) { setErr((e as Error).message); }
      }}>save</button>
      <button type="button" onClick={() => { markClean(); }}>cancel</button>
      {err && <div role="alert">{err}</div>}
      <DirtyProbe testId={testId} isDirty={dirty.isDirty} />
    </div>
  );
}

/** Profile-like form: name + email + avatar color chip + greeting style chip. */
function ProfileForm({ testId, onSave }: { testId: string; onSave: (input: { name: string; email: string; avatarColor: string; greetingStyle: string }) => Promise<void> }) {
  const dirty = useFormDirtySafe();
  const { markDirty, markClean } = dirty;
  const [name, setName] = React.useState("");
  const [email, setEmail] = React.useState("");
  const [avatarColor, setAvatarColor] = React.useState("green");
  const [greetingStyle, setGreetingStyle] = React.useState("auto");
  const [err, setErr] = React.useState<string | null>(null);

  return (
    <div onChangeCapture={markDirty}>
      <input aria-label="name" value={name} onChange={(e) => setName(e.target.value)} />
      <input aria-label="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
      <button type="button" onClick={() => { markDirty(); setAvatarColor("blue"); }}>blue</button>
      <button type="button" onClick={() => { markDirty(); setAvatarColor("red"); }}>red</button>
      <button type="button" onClick={() => { markDirty(); setGreetingStyle("minimal"); }}>minimal</button>
      <button type="button" onClick={async () => {
        try { await onSave({ name, email, avatarColor, greetingStyle }); markClean(); }
        catch (e) { setErr((e as Error).message); }
      }}>save</button>
      <button type="button" onClick={() => { markClean(); }}>cancel</button>
      {err && <div role="alert">{err}</div>}
      <DirtyProbe testId={testId} isDirty={dirty.isDirty} />
    </div>
  );
}

describe("Group B — form-level dirty tracking (UI)", () => {
  beforeEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  // Payables
  it("Payables: text edit marks dirty; cancel clears; success clears; failure retains", async () => {
    const onSave = vi.fn();
    onSave.mockResolvedValueOnce(undefined).mockRejectedValueOnce(new Error("api down"));
    render(
      <UnsavedChangesProvider>
        <PayablesForm testId="p" onSave={onSave} />
      </UnsavedChangesProvider>,
    );
    expect(screen.getByTestId("p-state")).toHaveTextContent("clean");

    fireEvent.change(screen.getByLabelText("desc"), { target: { value: "Aluguel" } });
    await waitFor(() => expect(screen.getByTestId("p-state")).toHaveTextContent("dirty"));

    fireEvent.click(screen.getByText("cancel"));
    await waitFor(() => expect(screen.getByTestId("p-state")).toHaveTextContent("clean"));

    fireEvent.change(screen.getByLabelText("desc"), { target: { value: "Net" } });
    fireEvent.change(screen.getByLabelText("amount"), { target: { value: "3990" } });
    fireEvent.change(screen.getByLabelText("dueDate"), { target: { value: "2026-08-01" } });
    await waitFor(() => expect(screen.getByTestId("p-state")).toHaveTextContent("dirty"));
    fireEvent.click(screen.getByText("save"));
    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(screen.getByTestId("p-state")).toHaveTextContent("clean"));

    fireEvent.change(screen.getByLabelText("desc"), { target: { value: "Net 2" } });
    await waitFor(() => expect(screen.getByTestId("p-state")).toHaveTextContent("dirty"));
    fireEvent.click(screen.getByText("save"));
    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(screen.getByText("api down")).toBeInTheDocument());
    expect(screen.getByTestId("p-state")).toHaveTextContent("dirty");
  });

  // Budgets
  it("Budgets: type chip click marks dirty; cancel clears; success clears; failure retains", async () => {
    const onSave = vi.fn();
    onSave.mockResolvedValueOnce(undefined).mockRejectedValueOnce(new Error("api down"));
    render(
      <UnsavedChangesProvider>
        <BudgetsForm testId="b" onSave={onSave} />
      </UnsavedChangesProvider>,
    );
    expect(screen.getByTestId("b-state")).toHaveTextContent("clean");

    fireEvent.click(screen.getByText("Receita"));
    await waitFor(() => expect(screen.getByTestId("b-state")).toHaveTextContent("dirty"));

    fireEvent.click(screen.getByText("cancel"));
    await waitFor(() => expect(screen.getByTestId("b-state")).toHaveTextContent("clean"));

    fireEvent.click(screen.getByText("cat-1"));
    fireEvent.change(screen.getByLabelText("amount"), { target: { value: "50000" } });
    await waitFor(() => expect(screen.getByTestId("b-state")).toHaveTextContent("dirty"));
    fireEvent.click(screen.getByText("save"));
    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(screen.getByTestId("b-state")).toHaveTextContent("clean"));

    fireEvent.change(screen.getByLabelText("amount"), { target: { value: "60000" } });
    await waitFor(() => expect(screen.getByTestId("b-state")).toHaveTextContent("dirty"));
    fireEvent.click(screen.getByText("save"));
    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(screen.getByText("api down")).toBeInTheDocument());
    expect(screen.getByTestId("b-state")).toHaveTextContent("dirty");
  });

  // Goals
  it("Goals: text edit + cycle chip mark dirty; cancel clears; success clears; failure retains", async () => {
    const onSave = vi.fn();
    onSave.mockResolvedValueOnce(undefined).mockRejectedValueOnce(new Error("api down"));
    render(
      <UnsavedChangesProvider>
        <GoalsForm testId="g" onSave={onSave} />
      </UnsavedChangesProvider>,
    );
    fireEvent.change(screen.getByLabelText("name"), { target: { value: "Emergency" } });
    await waitFor(() => expect(screen.getByTestId("g-state")).toHaveTextContent("dirty"));
    fireEvent.click(screen.getByText("cancel"));
    await waitFor(() => expect(screen.getByTestId("g-state")).toHaveTextContent("clean"));

    fireEvent.change(screen.getByLabelText("name"), { target: { value: "Trip" } });
    fireEvent.change(screen.getByLabelText("target"), { target: { value: "100000" } });
    fireEvent.click(screen.getByText("yearly"));
    await waitFor(() => expect(screen.getByTestId("g-state")).toHaveTextContent("dirty"));
    fireEvent.click(screen.getByText("save"));
    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(screen.getByTestId("g-state")).toHaveTextContent("clean"));

    fireEvent.change(screen.getByLabelText("name"), { target: { value: "Trip 2" } });
    await waitFor(() => expect(screen.getByTestId("g-state")).toHaveTextContent("dirty"));
    fireEvent.click(screen.getByText("save"));
    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(screen.getByText("api down")).toBeInTheDocument());
    expect(screen.getByTestId("g-state")).toHaveTextContent("dirty");
  });

  // Subscriptions
  it("Subscriptions: preset chip + cycle chip mark dirty; cancel clears; success clears; failure retains", async () => {
    const onSave = vi.fn();
    onSave.mockResolvedValueOnce(undefined).mockRejectedValueOnce(new Error("api down"));
    render(
      <UnsavedChangesProvider>
        <SubscriptionsForm testId="s" onSave={onSave} />
      </UnsavedChangesProvider>,
    );
    fireEvent.click(screen.getByText("Netflix"));
    await waitFor(() => expect(screen.getByTestId("s-state")).toHaveTextContent("dirty"));
    fireEvent.click(screen.getByText("cancel"));
    await waitFor(() => expect(screen.getByTestId("s-state")).toHaveTextContent("clean"));

    fireEvent.click(screen.getByText("Spotify"));
    fireEvent.change(screen.getByLabelText("amount"), { target: { value: "5590" } });
    await waitFor(() => expect(screen.getByTestId("s-state")).toHaveTextContent("dirty"));
    fireEvent.click(screen.getByText("save"));
    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(screen.getByTestId("s-state")).toHaveTextContent("clean"));

    fireEvent.click(screen.getByText("yearly"));
    await waitFor(() => expect(screen.getByTestId("s-state")).toHaveTextContent("dirty"));
    fireEvent.click(screen.getByText("save"));
    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(screen.getByText("api down")).toBeInTheDocument());
    expect(screen.getByTestId("s-state")).toHaveTextContent("dirty");
  });

  // Profile
  it("Profile: text + chip edits mark dirty; cancel clears; success clears; failure retains", async () => {
    const onSave = vi.fn();
    onSave.mockResolvedValueOnce(undefined).mockRejectedValueOnce(new Error("api down"));
    render(
      <UnsavedChangesProvider>
        <ProfileForm testId="pr" onSave={onSave} />
      </UnsavedChangesProvider>,
    );
    fireEvent.change(screen.getByLabelText("name"), { target: { value: "Walis" } });
    await waitFor(() => expect(screen.getByTestId("pr-state")).toHaveTextContent("dirty"));
    fireEvent.click(screen.getByText("cancel"));
    await waitFor(() => expect(screen.getByTestId("pr-state")).toHaveTextContent("clean"));

    fireEvent.change(screen.getByLabelText("name"), { target: { value: "Walis" } });
    fireEvent.change(screen.getByLabelText("email"), { target: { value: "w@x.com" } });
    fireEvent.click(screen.getByText("blue"));
    fireEvent.click(screen.getByText("minimal"));
    await waitFor(() => expect(screen.getByTestId("pr-state")).toHaveTextContent("dirty"));
    fireEvent.click(screen.getByText("save"));
    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(screen.getByTestId("pr-state")).toHaveTextContent("clean"));

    fireEvent.change(screen.getByLabelText("email"), { target: { value: "w2@x.com" } });
    await waitFor(() => expect(screen.getByTestId("pr-state")).toHaveTextContent("dirty"));
    fireEvent.click(screen.getByText("save"));
    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(screen.getByText("api down")).toBeInTheDocument());
    expect(screen.getByTestId("pr-state")).toHaveTextContent("dirty");
  });

  it("independent form tokens: editing one form does not dirty another", async () => {
    const onSave = vi.fn().mockResolvedValue(undefined);
    render(
      <UnsavedChangesProvider>
        <PayablesForm testId="p1" onSave={onSave} />
        <BudgetsForm testId="b1" onSave={onSave} />
      </UnsavedChangesProvider>,
    );
    fireEvent.change(screen.getByLabelText("desc"), { target: { value: "x" } });
    await waitFor(() => expect(screen.getByTestId("p1-state")).toHaveTextContent("dirty"));
    expect(screen.getByTestId("b1-state")).toHaveTextContent("clean");
  });
});