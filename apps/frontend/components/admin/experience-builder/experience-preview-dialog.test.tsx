import {
  act,
  cleanup,
  fireEvent,
  render,
  screen
} from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ExperienceTemplate } from '@quokkaq/shared-types';

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string, values?: Record<string, unknown>) =>
    String(values?.default ?? key)
}));

import { ExperiencePreviewDialog } from './experience-preview-dialog';

type ResizeObserverRecord = {
  callback: ResizeObserverCallback;
  targets: Set<Element>;
};

const resizeObservers: ResizeObserverRecord[] = [];

class ResizeObserverMock implements ResizeObserver {
  readonly record: ResizeObserverRecord;

  constructor(callback: ResizeObserverCallback) {
    this.record = { callback, targets: new Set() };
    resizeObservers.push(this.record);
  }

  observe(target: Element) {
    this.record.targets.add(target);
  }

  unobserve(target: Element) {
    this.record.targets.delete(target);
  }

  disconnect() {
    this.record.targets.clear();
  }
}

beforeEach(() => {
  resizeObservers.length = 0;
  vi.stubGlobal('ResizeObserver', ResizeObserverMock);
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function resizePreview(width: number, height: number) {
  const target = screen.getByTestId('experience-preview-viewport');
  const observer = resizeObservers.find((entry) => entry.targets.has(target));
  expect(observer).toBeDefined();
  act(() => {
    observer?.callback(
      [
        {
          target,
          contentRect: { width, height }
        } as unknown as ResizeObserverEntry
      ],
      {} as ResizeObserver
    );
  });
}

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
    const fullScaleSurface = screen.getByTestId('experience-preview-surface');
    expect(fullScaleSurface).toHaveAttribute('data-scale', '100');
    expect(fullScaleSurface).toHaveStyle({ width: '820px', height: '1180px' });
    expect(fullScaleSurface).toHaveClass('shrink-0');
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

  it.each([
    ['portrait', 820, 1180, 560 / 1180],
    ['landscape', 1180, 820, 560 / 820],
    ['display', 1920, 1080, 860 / 1920]
  ])(
    'fits a %s device inside the measured preview viewport',
    (variantId, width, height, expectedScale) => {
      const variantDraft: ExperienceTemplate = {
        ...draft,
        variants: [
          {
            ...draft.variants[0]!,
            id: variantId,
            profile: {
              ...draft.variants[0]!.profile,
              id: variantId,
              width,
              height
            }
          }
        ]
      };

      render(
        <ExperiencePreviewDialog
          open
          onOpenChange={vi.fn()}
          draft={variantDraft}
          activeVariantId={variantId}
          publishedDefinition={null}
          renderPreview={(props) => (
            <output data-testid='preview-scale'>
              {String(props.scaleFactor)}
            </output>
          )}
        />
      );

      resizePreview(900, 600);

      expect(
        Number(screen.getByTestId('preview-scale').textContent)
      ).toBeCloseTo(expectedScale, 5);
    }
  );

  it('recomputes fit on resize while 100% remains an unscaled scroll mode', () => {
    render(
      <ExperiencePreviewDialog
        open
        onOpenChange={vi.fn()}
        draft={draft}
        activeVariantId='portrait'
        publishedDefinition={null}
        renderPreview={(props) => (
          <output data-testid='preview-scale'>
            {String(props.scaleFactor)}
          </output>
        )}
      />
    );

    resizePreview(900, 600);
    expect(Number(screen.getByTestId('preview-scale').textContent)).toBeCloseTo(
      560 / 1180,
      5
    );

    resizePreview(450, 500);
    expect(Number(screen.getByTestId('preview-scale').textContent)).toBeCloseTo(
      460 / 1180,
      5
    );

    fireEvent.click(screen.getByRole('button', { name: /100% scale/i }));
    const viewport = screen.getByTestId('experience-preview-viewport');
    expect(viewport).toHaveClass(
      'items-start',
      'justify-start',
      'overflow-auto'
    );
    expect(viewport).not.toHaveClass('items-center', 'justify-center');
    expect(screen.getByTestId('preview-scale')).toHaveTextContent('1');
  });
});
