/**
 * `fumadocs-openapi` does not export `useOperationContext`; it lives under
 * `dist/ui/operation`. We map it in `tsconfig` paths; this module supplies types.
 */
declare module 'fumadocs-openapi/operation-client' {
  export function useOperationContext():
    | {
        route: string;
        example: string;
        examples: unknown[];
        setExample: (key: string) => void;
        setExampleData: (data: unknown, encoded: unknown) => void;
        addListener: (listener: (data: unknown, encoded: unknown) => void) => void;
        removeListener: (listener: (data: unknown, encoded: unknown) => void) => void;
      }
    | null;
}
