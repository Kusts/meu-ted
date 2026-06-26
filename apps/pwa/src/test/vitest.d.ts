// Augment vitest Assertion with @testing-library/jest-dom matchers.
// Local declaration because skipLibCheck: true blocks the augmentation
// from node_modules/@testing-library/jest-dom/types/vitest.d.ts.

import "vitest";

interface CustomMatchers<R = unknown> {
  toBeInTheDocument(): R;
  toBeVisible(): R;
  toBeEmpty(): R;
  toHaveTextContent(text: string | RegExp): R;
  toHaveValue(value: string | string[] | number): R;
  toHaveAttribute(attr: string, value?: string): R;
  toBeDisabled(): R;
  toBeEnabled(): R;
  toHaveClass(...classNames: string[]): R;
  toHaveFocus(): R;
  toBeChecked(): R;
  toContainElement(element: HTMLElement | null): R;
  toContainHTML(text: string): R;
  toHaveStyle(css: Record<string, unknown>): R;
}

declare module "vitest" {
  interface Assertion<T = any> extends CustomMatchers<T> {}
  interface AsymmetricMatchersContaining extends CustomMatchers {}
}
