import { render, screen } from "@/lib/test-utils";
import userEvent from "@testing-library/user-event";
import { QueryTabs } from "../QueryTabs";

const navigation = vi.hoisted(() => ({
  replace: vi.fn(),
  pathname: "/compromissos",
  search: "",
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: navigation.replace }),
  usePathname: () => navigation.pathname,
  useSearchParams: () => new URLSearchParams(navigation.search),
}));

const TABS = [
  { key: "a-pagar", label: "A Pagar" },
  { key: "pendencias", label: "Pendências" },
];

describe("QueryTabs (item 13)", () => {
  beforeEach(() => {
    navigation.replace.mockClear();
    navigation.search = "";
    navigation.pathname = "/compromissos";
  });

  it("renders tabs with the default active", () => {
    render(<QueryTabs tabs={TABS} defaultKey="a-pagar" ariaLabel="Compromissos" />);
    expect(screen.getByRole("tab", { name: "A Pagar" })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("tab", { name: "Pendências" })).toHaveAttribute("aria-selected", "false");
  });

  it("honors ?aba= from the URL", () => {
    navigation.search = "aba=pendencias";
    render(<QueryTabs tabs={TABS} defaultKey="a-pagar" ariaLabel="Compromissos" />);
    expect(screen.getByRole("tab", { name: "Pendências" })).toHaveAttribute("aria-selected", "true");
  });

  it("falls back to default on unknown ?aba=", () => {
    navigation.search = "aba=nope";
    render(<QueryTabs tabs={TABS} defaultKey="a-pagar" ariaLabel="Compromissos" />);
    expect(screen.getByRole("tab", { name: "A Pagar" })).toHaveAttribute("aria-selected", "true");
  });

  it("replaces the URL preserving unrelated params", async () => {
    const user = userEvent.setup();
    navigation.search = "aba=a-pagar&cardId=card9";
    render(<QueryTabs tabs={TABS} defaultKey="a-pagar" ariaLabel="Compromissos" />);
    await user.click(screen.getByRole("tab", { name: "Pendências" }));
    expect(navigation.replace).toHaveBeenCalledWith("/compromissos?aba=pendencias&cardId=card9", { scroll: false });
  });
});
