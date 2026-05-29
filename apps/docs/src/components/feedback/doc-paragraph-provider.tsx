'use client';

import { createContext, useContext, type ReactNode } from 'react';
import type { ActionResponse, BlockFeedback } from './schema';

type Ctx = {
  locale: string;
  onBlockFeedback: (b: BlockFeedback) => Promise<ActionResponse>;
};

const DocBlockFeedbackContext = createContext<Ctx | null>(null);

export function DocBlockFeedbackProvider({
  locale,
  onBlockFeedback,
  children
}: {
  locale: string;
  onBlockFeedback: (b: BlockFeedback) => Promise<ActionResponse>;
  children: ReactNode;
}) {
  return (
    <DocBlockFeedbackContext.Provider value={{ locale, onBlockFeedback }}>
      {children}
    </DocBlockFeedbackContext.Provider>
  );
}

export function useDocBlockFeedbackOptional() {
  return useContext(DocBlockFeedbackContext);
}
