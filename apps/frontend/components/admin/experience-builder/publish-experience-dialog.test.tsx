import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor
} from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ExperienceTemplate } from '@quokkaq/shared-types';

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string, values?: Record<string, unknown>) =>
    String(values?.default ?? key)
}));

import { PublishExperienceDialog } from './publish-experience-dialog';

afterEach(cleanup);

const validDraft: ExperienceTemplate = {
  schemaVersion: 1,
  id: 'station',
  surface: 'queue-display',
  startPageId: 'services',
  variants: [
    {
      id: 'display',
      profile: {
        id: 'display',
        name: 'Display',
        width: 1920,
        height: 1080,
        interactionMode: 'non-touch',
        viewingDistance: 'far',
        safeArea: { top: 0, right: 0, bottom: 0, left: 0 }
      },
      grid: { columns: 12, rows: 18 }
    }
  ],
  pages: [
    {
      id: 'services',
      name: 'Services',
      widgets: [
        { id: 'calls', type: 'called-tickets', config: {}, actions: [] }
      ],
      layouts: {
        display: {
          placements: { calls: { col: 1, row: 1, colSpan: 12, rowSpan: 18 } }
        }
      }
    }
  ]
};

describe('PublishExperienceDialog', () => {
  it('blocks confirmation when publish validation returns errors', () => {
    const onPublish = vi.fn();
    const invalid = { ...validDraft, startPageId: 'missing' };
    render(
      <PublishExperienceDialog
        open
        onOpenChange={vi.fn()}
        draft={invalid}
        onPublish={onPublish}
      />
    );
    expect(screen.getByText(/cannot publish/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^publish$/i })).toBeDisabled();
    expect(onPublish).not.toHaveBeenCalled();
  });

  it('lists warnings, keeps device rows read-only, and restores through its own callback', async () => {
    const onPublish = vi.fn();
    const onRestore = vi.fn();
    render(
      <PublishExperienceDialog
        open
        onOpenChange={vi.fn()}
        draft={validDraft}
        onPublish={onPublish}
        onRestoreVersion={onRestore}
        devices={[
          {
            id: 'device-1',
            name: 'Hall iPad',
            variantName: 'iPad',
            lastSeenAt: '2026-08-10T10:00:00Z',
            appliedVersion: 7
          }
        ]}
        versions={[
          { id: 'version-7', version: 7, publishedAt: '2026-08-10T09:00:00Z' }
        ]}
      />
    );
    expect(
      screen.getByText(/assignment becomes available after runtime validation/i)
    ).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /assign/i })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /restore version/i }));
    expect(onRestore).toHaveBeenCalledWith('version-7');
    await waitFor(() =>
      expect(screen.getByRole('button', { name: /^publish$/i })).toBeEnabled()
    );
    fireEvent.click(screen.getByRole('button', { name: /^publish$/i }));
    expect(onPublish).toHaveBeenCalledWith(validDraft);
  });

  it('shows publish context, validation warnings, and read-only device deployment state', () => {
    render(
      <PublishExperienceDialog
        open
        onOpenChange={vi.fn()}
        draft={validDraft}
        selectedVariantName='Lobby display'
        currentPublishedVersion={7}
        unpublishedChanges={false}
        validationReport={{
          canPublish: true,
          errors: [],
          warnings: [{ code: 'theme.legacy_contrast_unknown', path: ['theme'] }]
        }}
        devices={[
          {
            id: 'device-1',
            name: 'Hall iPad',
            variantName: 'Lobby display',
            lastSeenAt: '2026-08-10T10:00:00Z',
            appliedVersion: 6
          }
        ]}
        onPublish={vi.fn()}
      />
    );

    expect(screen.getByText('v7')).toBeInTheDocument();
    expect(screen.getByText(/^no$/i)).toBeInTheDocument();
    expect(
      screen.getByText('theme.legacy_contrast_unknown')
    ).toBeInTheDocument();
    expect(
      screen.getByRole('row', { name: /hall ipad.*lobby display.*v6/i })
    ).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /assign/i })).toBeNull();
  });

  it('preserves parsed-definition and API errors without offering an assignment action', async () => {
    const onPublish = vi.fn().mockResolvedValue({
      kind: 'invalid-definition',
      issues: [{ code: 'variant.unplaced_widget', path: ['pages', 0] }]
    });
    render(
      <PublishExperienceDialog
        open
        onOpenChange={vi.fn()}
        draft={validDraft}
        onPublish={onPublish}
        publishError={{
          kind: 'api-error',
          code: 'experience.version_conflict',
          message: 'A newer version was published.'
        }}
      />
    );

    expect(screen.getByRole('alert')).toHaveTextContent(
      'A newer version was published.'
    );
    expect(screen.queryByRole('button', { name: /assign/i })).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: /^publish$/i }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'variant.unplaced_widget'
    );
    expect(onPublish).toHaveBeenCalledTimes(1);
  });

  it('keeps restore separate from saving and publishing', () => {
    const onPublish = vi.fn();
    const onRestore = vi.fn();
    render(
      <PublishExperienceDialog
        open
        onOpenChange={vi.fn()}
        draft={validDraft}
        onPublish={onPublish}
        onRestoreVersion={onRestore}
        versions={[
          { id: 'version-4', version: 4, publishedAt: '2026-08-10T09:00:00Z' }
        ]}
      />
    );

    expect(screen.queryByRole('button', { name: /save/i })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /restore version/i }));

    expect(onRestore).toHaveBeenCalledWith('version-4');
    expect(onPublish).not.toHaveBeenCalled();
  });
});
