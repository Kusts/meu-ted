import { render, screen } from "@/lib/test-utils";
import { Splash } from "../Splash";

describe("Splash startup screen (item premium 3)", () => {
  it("renders the mascot, brand name and tagline on charcoal", () => {
    const { container } = render(<Splash />);
    const main = screen.getByRole("main", { name: "Carregando Meu Ted" });
    expect(main).toBeInTheDocument();
    expect(main.style.backgroundColor).toBe("rgb(11, 15, 14)");
    expect(screen.getByText("Meu Ted")).toBeInTheDocument();
    expect(screen.getByText("Tudo em dia.")).toBeInTheDocument();
    const svg = container.querySelector("svg.splash-mascot");
    expect(svg).toBeInTheDocument();
    expect(svg?.querySelector(".splash-check")).toBeInTheDocument();
  });
});
