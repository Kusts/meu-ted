import { render, type RenderOptions } from "@testing-library/react";
import { type ReactElement } from "react";
import { AppStateProvider } from "@/lib/state/app-state-context";

function AllTheProviders({ children }: { children: React.ReactNode }) {
  return <AppStateProvider>{children}</AppStateProvider>;
}

function customRender(ui: ReactElement, options?: RenderOptions) {
  return render(ui, { wrapper: AllTheProviders, ...options });
}

export * from "@testing-library/react";
export { customRender as render };
