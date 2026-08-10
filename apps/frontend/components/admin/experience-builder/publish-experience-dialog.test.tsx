import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor
} from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  EXPERIENCE_TEMPLATE_LIMITS,
  type ExperienceTemplate
} from '@quokkaq/shared-types';
import { ApiHttpError } from '@/lib/api-errors';

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
    expect(screen.getByText(/start page does not exist/i)).toBeInTheDocument();
    expect(screen.getByText(/location: startPageId/i)).toBeInTheDocument();
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
      screen.getByText(/contrast could not be verified/i)
    ).toBeInTheDocument();
    expect(screen.getByText(/location: theme/i)).toBeInTheDocument();
    expect(
      screen.getByRole('row', { name: /hall ipad.*lobby display.*v6/i })
    ).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /assign/i })).toBeNull();
  });

  it('maps an allowlisted API error to safe copy without rendering backend values', async () => {
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
          message: 'secret account=4111 1111 1111 1111'
        }}
      />
    );

    const alert = screen.getByRole('alert');
    expect(alert).toHaveTextContent(/newer experience version already exists/i);
    expect(alert).not.toHaveTextContent('4111 1111 1111 1111');
    expect(alert).not.toHaveTextContent('experience.version_conflict');
    expect(screen.queryByRole('button', { name: /assign/i })).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: /^publish$/i }));

    const resultAlert = await screen.findByRole('alert');
    expect(resultAlert).toHaveTextContent(/widget is not placed/i);
    expect(resultAlert).not.toHaveTextContent('variant.unplaced_widget');
    expect(onPublish).toHaveBeenCalledTimes(1);
  });

  it('uses generic safe copy for unknown thrown API errors', async () => {
    const onPublish = vi
      .fn()
      .mockRejectedValue(
        new ApiHttpError(
          'secret visitor phone +1 202 555 0198',
          500,
          'private.account.+12025550198',
          '{"phone":"+1 202 555 0198"}'
        )
      );
    render(
      <PublishExperienceDialog
        open
        onOpenChange={vi.fn()}
        draft={validDraft}
        onPublish={onPublish}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: /^publish$/i }));

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent(/operation could not be completed/i);
    expect(alert).not.toHaveTextContent('+1 202 555 0198');
    expect(alert).not.toHaveTextContent('private.account');
  });

  it('describes invalid-definition issues safely without rendering raw values', () => {
    render(
      <PublishExperienceDialog
        open
        onOpenChange={vi.fn()}
        draft={validDraft}
        onPublish={vi.fn()}
        publishError={{
          kind: 'invalid-definition',
          issues: [
            {
              code: 'variant.unplaced_widget',
              path: ['pages', 0, 'widgets', 1, 'access', 'when'],
              message: 'secret visitor value: 4111 1111 1111 1111'
            }
          ]
        }}
      />
    );

    const alert = screen.getByRole('alert');
    expect(alert).toHaveTextContent(/widget is not placed/i);
    expect(alert).toHaveTextContent(
      /location: pages\[0\]\.widgets\[1\]\.access\.when/i
    );
    expect(alert).not.toHaveTextContent('variant.unplaced_widget');
    expect(alert).not.toHaveTextContent('4111 1111 1111 1111');
  });

  it('keeps canonical schema locations useful only within resource bounds', () => {
    const { maxVariants, maxPages, maxWidgetsPerPage, maxActionsPerWidget } =
      EXPERIENCE_TEMPLATE_LIMITS;
    render(
      <PublishExperienceDialog
        open
        onOpenChange={vi.fn()}
        draft={validDraft}
        onPublish={vi.fn()}
        publishError={{
          kind: 'invalid-definition',
          issues: [
            {
              code: 'response.invalid',
              path: ['definition', 'id'],
              message: 'sensitive response detail'
            },
            {
              code: 'response.invalid',
              path: ['templateId'],
              message: 'sensitive response detail'
            },
            {
              code: 'response.invalid',
              path: ['version'],
              message: 'sensitive response detail'
            },
            {
              code: 'response.invalid',
              path: ['publishedAt'],
              message: 'sensitive response detail'
            },
            {
              code: 'schema.invalid',
              path: [
                'variants',
                maxVariants - 1,
                'profile',
                'safeArea',
                'left'
              ],
              message: 'sensitive response detail'
            },
            {
              code: 'schema.invalid',
              path: [
                'pages',
                maxPages - 1,
                'widgets',
                maxWidgetsPerPage - 1,
                'actions',
                maxActionsPerWidget - 1,
                'toPageId'
              ],
              message: 'sensitive response detail'
            },
            {
              code: 'schema.invalid',
              path: ['pages', maxPages, 'widgets', 0],
              message: 'sensitive response detail'
            }
          ]
        }}
      />
    );

    expect(screen.getByText(/location: definition\.id/i)).toBeInTheDocument();
    expect(screen.getByText(/location: templateId/i)).toBeInTheDocument();
    expect(screen.getByText(/location: version/i)).toBeInTheDocument();
    expect(screen.getByText(/location: publishedAt/i)).toBeInTheDocument();
    expect(
      screen.getByText(/location: variants\[7\]\.profile\.safeArea\.left/i)
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        /location: pages\[99\]\.widgets\[199\]\.actions\[19\]\.toPageId/i
      )
    ).toBeInTheDocument();
    expect(screen.getAllByText(/^Location: Definition$/i)).toHaveLength(1);
    expect(screen.queryByText(/pages\[100\]/i)).toBeNull();
    expect(screen.queryByText(/sensitive response detail/i)).toBeNull();
  });

  it('collapses mixed unsafe issue paths without leaking backend issue data', () => {
    const adversarialIssue = {
      code: 'private.card_validation.4111111111111111',
      path: [
        'pages',
        0,
        'cardNumber4111111111111111',
        'widgets',
        7,
        'phone2025550198'
      ],
      message:
        'secret visitor value: card 4111 1111 1111 1111, phone +1 202 555 0198',
      value: 'account-token-sk_live_sensitive'
    };
    const numericSecretIssue = {
      code: 'schema.invalid',
      path: ['pages', 4111111111111111, 'widgets', 0],
      message: 'private account index'
    };
    render(
      <PublishExperienceDialog
        open
        onOpenChange={vi.fn()}
        draft={validDraft}
        onPublish={vi.fn()}
        publishError={{
          kind: 'invalid-definition',
          issues: [adversarialIssue, numericSecretIssue]
        }}
      />
    );

    const alert = screen.getByRole('alert');
    expect(alert).toHaveTextContent(/definition contains an issue/i);
    expect(alert).toHaveTextContent(/location: definition/i);
    expect(alert).not.toHaveTextContent('private.card_validation');
    expect(alert).not.toHaveTextContent('4111111111111111');
    expect(alert).not.toHaveTextContent('4111 1111 1111 1111');
    expect(alert).not.toHaveTextContent('2025550198');
    expect(alert).not.toHaveTextContent('+1 202 555 0198');
    expect(alert).not.toHaveTextContent('account-token-sk_live_sensitive');
    expect(alert).not.toHaveTextContent('widgets[7]');
    expect(alert).not.toHaveTextContent('pages[0]');
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
