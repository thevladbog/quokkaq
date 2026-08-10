import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ExperienceTemplate } from '@quokkaq/shared-types';

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string, values?: Record<string, unknown>) =>
    String(values?.default ?? key)
}));

import { ExperiencePreviewDialog } from './experience-preview-dialog';

afterEach(cleanup);

const draft: ExperienceTemplate = {
  schemaVersion: 1,
  id: 'station',
  surface: 'ticket-station',
  startPageId: 'services',
  variants: [
    {
      id: 'portrait',
      profile: {
        id: 'ipad',
        name: 'iPad',
        width: 820,
        height: 1180,
        interactionMode: 'touch',
        viewingDistance: 'near',
        safeArea: { top: 24, right: 24, bottom: 24, left: 24 }
      },
      grid: { columns: 12, rows: 18 }
    }
  ],
  pages: [
    {
      id: 'services',
      name: 'Services',
      widgets: [],
      layouts: { portrait: { placements: {} } }
    }
  ]
};

describe('ExperiencePreviewDialog', () => {
  it('marks unpublished work as a draft and exposes scale and safe-area controls', () => {
    render(
      <ExperiencePreviewDialog
        open
        onOpenChange={vi.fn()}
        draft={draft}
        activeVariantId='portrait'
        publishedDefinition={null}
      />
    );
    expect(screen.getByText(/draft preview/i)).toBeInTheDocument();
    expect(screen.getByTestId('experience-preview-surface')).toHaveAttribute(
      'data-scale',
      'fit'
    );

    fireEvent.click(screen.getByRole('button', { name: /100% scale/i }));
    expect(screen.getByTestId('experience-preview-surface')).toHaveAttribute(
      'data-scale',
      '100'
    );
    fireEvent.click(screen.getByRole('checkbox', { name: /safe area/i }));
    expect(screen.queryByTestId('experience-preview-safe-area')).toBeNull();
  });

  it('renders the selected variant and forwards only the selected synthetic scenario', () => {
    render(
      <ExperiencePreviewDialog
        open
        onOpenChange={vi.fn()}
        draft={draft}
        activeVariantId='portrait'
        publishedDefinition={draft}
        renderPreview={({ variant, scenarioContext }) => (
          <output data-testid='scenario-preview'>
            {variant.profile.name}:
            {String(scenarioContext.identity?.isEmployee)}
          </output>
        )}
      />
    );

    expect(screen.queryByText(/draft preview/i)).toBeNull();
    expect(screen.getByTestId('scenario-preview')).toHaveTextContent(
      'iPad:false'
    );

    fireEvent.click(
      screen.getByRole('button', { name: /authenticated employee/i })
    );

    expect(screen.getByTestId('scenario-preview')).toHaveTextContent(
      'iPad:true'
    );
  });

  it('recognizes an equivalent published definition regardless of record key order', () => {
    const published: ExperienceTemplate = {
      pages: draft.pages,
      variants: draft.variants,
      startPageId: draft.startPageId,
      surface: draft.surface,
      id: draft.id,
      schemaVersion: draft.schemaVersion
    };

    render(
      <ExperiencePreviewDialog
        open
        onOpenChange={vi.fn()}
        draft={draft}
        activeVariantId='portrait'
        publishedDefinition={published}
      />
    );

    expect(screen.queryByText(/draft preview/i)).toBeNull();
    expect(
      screen.getByText(/matches the currently published definition/i)
    ).toBeInTheDocument();
  });
});
