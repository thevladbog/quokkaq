declare module 'jest-axe' {
  import type { Result } from 'axe-core';

  export function axe(element: Element): Promise<Result>;
  export const toHaveNoViolations: unknown;
}
