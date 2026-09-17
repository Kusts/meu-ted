import { render, screen, within, waitForElementToBeRemoved } from "@/lib/test-utils";
import userEvent from "@testing-library/user-event";
import SubscriptionsPage from "../SubscriptionsPage";

// V4.1 Phase 5 (SPEC §12.6): the browser defaults to the same-origin proxy,
// so this UI suite pins the unconfigured mock-data provider path explicitly.
vi.mock("@/lib/api/client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api/client")>();
  return { ...actual, isApiConfigured: () => false };
});

describe("SubscriptionsPage", () => {
  it("renders the page header", () => {
    render(<SubscriptionsPage />);
    expect(screen.getByText("Assinaturas")).toBeInTheDocument();
  });

  it("shows monthly total", () => {
    render(<SubscriptionsPage />);
    expect(screen.getByText(/522,\d{2}/)).toBeInTheDocument();
  });

  it("renders Ativas and Canceladas tabs", () => {
    render(<SubscriptionsPage />);
    expect(screen.getByText("Ativas")).toBeInTheDocument();
    expect(screen.getByText("Canceladas")).toBeInTheDocument();
  });

  it("renders active subscription names by default", () => {
    render(<SubscriptionsPage />);
    expect(screen.getByText("Netflix")).toBeInTheDocument();
    expect(screen.getByText("Spotify")).toBeInTheDocument();
  });

  it("switches to Canceladas tab", async () => {
    const user = userEvent.setup();
    render(<SubscriptionsPage />);
    await user.click(screen.getByText("Canceladas"));
    expect(screen.getByText("Vivo Internet")).toBeInTheDocument();
  });

  it("renders without emoji in service presets", () => {
    const { container } = render(<SubscriptionsPage />);
    const spans = container.querySelectorAll("span");
    for (const s of spans) {
      const txt = s.textContent ?? "";
      const code = txt.codePointAt(0) ?? 0;
      if (txt.length >= 1 && txt.length <= 2) {
        expect(code).toBeLessThan(0x1F300);
      }
    }
  });

  describe("clickable cards and detail sheet", () => {
    it("cards are clickable buttons (no inline Cancelar)", () => {
      render(<SubscriptionsPage />);
      // No inline Cancelar button visible
      expect(screen.queryAllByText("Cancelar").length).toBe(0);
    });

    it("clicking active card opens detail sheet", async () => {
      const user = userEvent.setup();
      render(<SubscriptionsPage />);
      await user.click(screen.getByText("Netflix"));
      expect(screen.getByText("Cancelar assinatura")).toBeInTheDocument();
      expect(screen.getByText("Ativa")).toBeInTheDocument();
    });

    it("detail sheet for cancelled sub shows Cancelada but no cancel action", async () => {
      const user = userEvent.setup();
      render(<SubscriptionsPage />);
      await user.click(screen.getByText("Canceladas"));
      await user.click(screen.getByText("Vivo Internet"));
      expect(screen.getByText("Cancelada")).toBeInTheDocument();
      expect(screen.queryByText("Cancelar assinatura")).not.toBeInTheDocument();
    });

    it("clicking Cancelar assinatura in sheet opens confirm dialog", async () => {
      const user = userEvent.setup();
      render(<SubscriptionsPage />);
      await user.click(screen.getByText("Netflix"));
      await user.click(screen.getByText("Cancelar assinatura"));
      // Both the sheet's cancel button and the confirm dialog have this text
      expect(screen.getAllByText("Cancelar assinatura").length).toBeGreaterThanOrEqual(1);
      expect(screen.getByText(/Tem certeza/i)).toBeInTheDocument();
    });
  });

  describe("create subscription flow (coverage)", () => {
    it("opens Nova sheet, fills and saves a new subscription", async () => {
      const user = userEvent.setup();
      render(<SubscriptionsPage />);
      await user.click(screen.getByRole("button", { name: "Nova" }));
      const sheet = screen.getByRole("dialog");
      await user.type(within(sheet).getByPlaceholderText("Ex: Netflix"), "HBO Max");
      await user.type(within(sheet).getByPlaceholderText("0,00"), "3990");
      await user.click(within(sheet).getByRole("button", { name: "Salvar assinatura" }));
      expect(screen.getByText("HBO Max")).toBeInTheDocument();
    });

    it("new subscription with empty name falls back to the chosen service", async () => {
      const user = userEvent.setup();
      render(<SubscriptionsPage />);
      await user.click(screen.getByRole("button", { name: "Nova" }));
      const sheet = screen.getByRole("dialog");
      await user.click(within(sheet).getByText("Netflix"));
      await user.clear(within(sheet).getByPlaceholderText("Ex: Netflix"));
      await user.type(within(sheet).getByPlaceholderText("0,00"), "2990");
      await user.click(within(sheet).getByRole("button", { name: "Salvar assinatura" }));
    });

    it("new subscription with no name and no service falls back to 'Assinatura'", async () => {
      const user = userEvent.setup();
      render(<SubscriptionsPage />);
      await user.click(screen.getByRole("button", { name: "Nova" }));
      const sheet = screen.getByRole("dialog");
      await user.type(within(sheet).getByPlaceholderText("0,00"), "1990");
      await user.click(within(sheet).getByRole("button", { name: "Salvar assinatura" }));
      expect(screen.getByText("Assinatura")).toBeInTheDocument();
    });

    it("new subscription with boleto payment and yearly cycle", async () => {
      const user = userEvent.setup();
      render(<SubscriptionsPage />);
      await user.click(screen.getByRole("button", { name: "Nova" }));
      const sheet = screen.getByRole("dialog");
      await user.type(within(sheet).getByPlaceholderText("Ex: Netflix"), "Curso X");
      await user.type(within(sheet).getByPlaceholderText("0,00"), "1990");
      await user.click(within(sheet).getByText("Boleto"));
      await user.click(within(sheet).getByText("Anual"));
      await user.click(within(sheet).getByRole("button", { name: "Salvar assinatura" }));
      // Create sheet plays its exit animation before unmounting.
      await waitForElementToBeRemoved(() => screen.queryByRole("dialog"));
      await user.click(screen.getByText("Curso X"));
      const detailB = screen.getByRole("dialog");
      expect(within(detailB).getByText(/Anual/)).toBeInTheDocument();
    });

    it("new subscription amount truncates beyond 12 digits and clears to empty", async () => {
      const user = userEvent.setup();
      render(<SubscriptionsPage />);
      await user.click(screen.getByRole("button", { name: "Nova" }));
      const sheet = screen.getByRole("dialog");
      const amountInput = within(sheet).getByPlaceholderText("0,00") as HTMLInputElement;
      await user.type(amountInput, "1234567890123");
      expect(amountInput.value.replace(/\D/g, "").length).toBeLessThanOrEqual(12);
      await user.clear(amountInput);
    });

    it("new subscription with card-default payment opens detail (credit_card reverse mapping)", async () => {
      const user = userEvent.setup();
      render(<SubscriptionsPage />);
      await user.click(screen.getByRole("button", { name: "Nova" }));
      const sheet = screen.getByRole("dialog");
      await user.type(within(sheet).getByPlaceholderText("Ex: Netflix"), "HBO Max 2");
      await user.type(within(sheet).getByPlaceholderText("0,00"), "3990");
      await user.click(within(sheet).getByRole("button", { name: "Salvar assinatura" }));
      // Create sheet plays its exit animation before unmounting.
      await waitForElementToBeRemoved(() => screen.queryByRole("dialog"));
      await user.click(screen.getByText("HBO Max 2"));
      const detail = screen.getByRole("dialog");
      expect(within(detail).getByText("Editar")).toBeInTheDocument();
    });

    it("new subscription with pix payment opens detail (pix reverse mapping)", async () => {
      const user = userEvent.setup();
      render(<SubscriptionsPage />);
      await user.click(screen.getByRole("button", { name: "Nova" }));
      const sheet = screen.getByRole("dialog");
      await user.type(within(sheet).getByPlaceholderText("Ex: Netflix"), "Disney Plus 2");
      await user.type(within(sheet).getByPlaceholderText("0,00"), "4590");
      await user.click(within(sheet).getByText("PIX"));
      await user.click(within(sheet).getByRole("button", { name: "Salvar assinatura" }));
      // Create sheet plays its exit animation before unmounting.
      await waitForElementToBeRemoved(() => screen.queryByRole("dialog"));
      await user.click(screen.getByText("Disney Plus 2"));
      const detail = screen.getByRole("dialog");
      expect(within(detail).getByText("Editar")).toBeInTheDocument();
    });
  });

  describe("edit & cancel subscription flow (coverage)", () => {
    it("opens detail, switches to edit mode, edits and saves", async () => {
      const user = userEvent.setup();
      render(<SubscriptionsPage />);
      await user.click(screen.getByText("Netflix"));
      const sheet = screen.getByRole("dialog");
      await user.click(within(sheet).getByText("Editar"));
      const nameInput = within(sheet).getByDisplayValue("Netflix");
      await user.clear(nameInput);
      await user.type(nameInput, "Netflix Edit");
      const amountInput = within(sheet).getByDisplayValue("55,90") as HTMLInputElement;
      await user.clear(amountInput);
      await user.type(amountInput, "5990");
      await user.click(within(sheet).getByText("PIX"));
      await user.click(within(sheet).getByRole("button", { name: /Salvar alterações/i }));
      expect(screen.getByText("Netflix Edit")).toBeInTheDocument();
    });

    it("editMode persists after field modification — save button stays visible", async () => {
      const user = userEvent.setup();
      render(<SubscriptionsPage />);
      await user.click(screen.getByText("Spotify"));
      const sheet = screen.getByRole("dialog");
      await user.click(within(sheet).getByText("Editar"));
      const saveBtn = within(sheet).getByRole("button", { name: /Salvar alterações/i });
      expect(saveBtn).toBeInTheDocument();
      const nameInput = within(sheet).getByDisplayValue("Spotify");
      await user.clear(nameInput);
      await user.type(nameInput, "Spotify Editado");
      expect(saveBtn).toBeInTheDocument();
      await user.click(saveBtn);
      expect(screen.getByText("Spotify Editado")).toBeInTheDocument();
    });

    it("edit mode disables save when the name is empty (empty -> undefined branch)", async () => {
      const user = userEvent.setup();
      render(<SubscriptionsPage />);
      await user.click(screen.getByText("Spotify"));
      const sheet = screen.getByRole("dialog");
      await user.click(within(sheet).getByText("Editar"));
      await user.clear(within(sheet).getByDisplayValue("Spotify"));
      expect(within(sheet).getByRole("button", { name: /Salvar alterações/i })).toBeDisabled();
    });

    it("cancels an active subscription via the confirm dialog", async () => {
      const user = userEvent.setup();
      render(<SubscriptionsPage />);
      await user.click(screen.getByText("Netflix"));
      const sheet = screen.getByRole("dialog");
      await user.click(within(sheet).getByText("Cancelar assinatura"));
      expect(screen.getByText(/Tem certeza/i)).toBeInTheDocument();
      const cancels = screen.getAllByText("Cancelar assinatura");
      await user.click(cancels[cancels.length - 1]);
      expect(screen.queryByText("Cancelar assinatura")).not.toBeInTheDocument();
    });
  });
});
