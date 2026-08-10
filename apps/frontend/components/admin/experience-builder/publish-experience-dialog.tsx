'use client';

import {
  validateExperienceForPublish,
  type ExperienceTemplate,
  type ExperienceValidationReport
} from '@quokkaq/shared-types';
import { AlertTriangle, CheckCircle2 } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';

import { isApiHttpError } from '@/lib/api-errors';
import type {
  ExperienceDefinitionIssue,
  ExperienceDefinitionParseResult,
  ParsedExperienceTemplateVersion
} from '@/lib/experience/experience-api';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog';
import {
  DeviceAssignmentTable,
  type ExperienceDeviceStatus
} from './device-assignment-table';
import {
  VersionHistory,
  type ExperienceVersionHistoryItem
} from './version-history';

export type ExperienceOperationError =
  | {
      kind: 'api-error';
      message: string;
      code?: string;
    }
  | {
      kind: 'invalid-definition';
      issues: readonly ExperienceDefinitionIssue[];
    };

export type ExperienceOperationResult =
  | void
  | ExperienceDefinitionParseResult
  | ParsedExperienceTemplateVersion;
type PendingAction = 'publish' | 'restore' | null;

export type PublishExperienceDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  draft: ExperienceTemplate;
  selectedVariantName?: string;
  currentPublishedVersion?: number | null;
  unpublishedChanges?: boolean;
  devices?: readonly ExperienceDeviceStatus[];
  versions?: readonly ExperienceVersionHistoryItem[];
  /** Calculated by the builder before confirmation opens. */
  validationReport?: ExperienceValidationReport;
  /** API/parser feedback supplied by the builder host is rendered verbatim as safe UI text. */
  publishError?: ExperienceOperationError | null;
  restoreError?: ExperienceOperationError | null;
  onPublish?: (
    draft: ExperienceTemplate
  ) => ExperienceOperationResult | Promise<ExperienceOperationResult>;
  onRestoreVersion?: (
    versionId: string
  ) => ExperienceOperationResult | Promise<ExperienceOperationResult>;
  disabled?: boolean;
};

function operationErrorFromResult(
  result: ExperienceOperationResult
): ExperienceOperationError | null {
  if (result?.kind !== 'invalid-definition') return null;
  return { kind: 'invalid-definition', issues: result.issues };
}

function operationErrorFromThrown(
  error: unknown,
  fallbackMessage: string
): ExperienceOperationError {
  if (isApiHttpError(error)) {
    return {
      kind: 'api-error',
      message: error.message,
      ...(error.code === undefined ? {} : { code: error.code })
    };
  }
  return { kind: 'api-error', message: fallbackMessage };
}

export function ExperienceOperationFeedback({
  error
}: {
  error: ExperienceOperationError;
}) {
  const t = useTranslations('experience.builder.task11');
  if (error.kind === 'api-error') {
    return (
      <section
        role='alert'
        className='border-destructive/40 bg-destructive/5 text-destructive rounded-md border p-3 text-sm'
      >
        <p className='font-semibold'>
          {t('publish.operationFailed', {
            default: 'The operation could not be completed.'
          })}
        </p>
        <p className='mt-1'>{error.message}</p>
        {error.code ? <p className='mt-1 text-xs'>({error.code})</p> : null}
      </section>
    );
  }

  return (
    <section
      role='alert'
      className='border-destructive/40 bg-destructive/5 text-destructive rounded-md border p-3 text-sm'
    >
      <p className='font-semibold'>
        {t('publish.invalidResponse', {
          default: 'The server returned a definition that cannot be used.'
        })}
      </p>
      <ul className='mt-2 list-disc space-y-1 pl-5 text-xs'>
        {error.issues.map((issue, index) => (
          <li key={`${issue.code}-${issue.path.join('.')}-${index}`}>
            {issue.code}
          </li>
        ))}
      </ul>
    </section>
  );
}

export function PublishExperienceDialog({
  open,
  onOpenChange,
  draft,
  selectedVariantName,
  currentPublishedVersion = null,
  unpublishedChanges = true,
  devices = [],
  versions = [],
  validationReport,
  publishError = null,
  restoreError = null,
  onPublish,
  onRestoreVersion,
  disabled = false
}: PublishExperienceDialogProps) {
  const t = useTranslations('experience.builder.task11');
  const [pendingAction, setPendingAction] = useState<PendingAction>(null);
  const [operationError, setOperationError] =
    useState<ExperienceOperationError | null>(null);
  const report = useMemo(
    () => validationReport ?? validateExperienceForPublish(draft),
    [draft, validationReport]
  );
  const blocked =
    disabled || !onPublish || !report.canPublish || pendingAction !== null;
  const visibleError = operationError ?? publishError ?? restoreError;

  useEffect(() => {
    if (!open) {
      setOperationError(null);
      setPendingAction(null);
    }
  }, [open]);

  const requestPublish = async () => {
    if (blocked || !onPublish) return;
    setOperationError(null);
    setPendingAction('publish');
    try {
      setOperationError(operationErrorFromResult(await onPublish(draft)));
    } catch (error) {
      setOperationError(
        operationErrorFromThrown(
          error,
          t('publish.publishFailed', {
            default: 'Publishing failed. Try again.'
          })
        )
      );
    } finally {
      setPendingAction(null);
    }
  };

  const requestRestore = async (versionId: string) => {
    if (disabled || pendingAction !== null || !onRestoreVersion) return;
    setOperationError(null);
    setPendingAction('restore');
    try {
      setOperationError(
        operationErrorFromResult(await onRestoreVersion(versionId))
      );
    } catch (error) {
      setOperationError(
        operationErrorFromThrown(
          error,
          t('publish.restoreFailed', {
            default: 'Restoring failed. Try again.'
          })
        )
      );
    } finally {
      setPendingAction(null);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className='max-h-[calc(100dvh-2rem)] max-w-3xl overflow-y-auto'>
        <DialogHeader>
          <DialogTitle>
            {t('publish.title', { default: 'Publish experience' })}
          </DialogTitle>
          <DialogDescription>
            {t('publish.description', {
              default:
                'Publishing creates an immutable version. Devices keep their current version until a later runtime-validation rollout.'
            })}
          </DialogDescription>
        </DialogHeader>
        <div className='grid gap-3 sm:grid-cols-3'>
          <div className='rounded-md border p-3'>
            <p className='text-muted-foreground text-xs'>
              {t('publish.currentVersion', {
                default: 'Current published version'
              })}
            </p>
            <p className='mt-1 text-lg font-semibold'>
              {currentPublishedVersion === null
                ? '—'
                : `v${currentPublishedVersion}`}
            </p>
          </div>
          <div className='rounded-md border p-3'>
            <p className='text-muted-foreground text-xs'>
              {t('publish.unpublished', { default: 'Unpublished changes' })}
            </p>
            <p className='mt-1 text-lg font-semibold'>
              {unpublishedChanges
                ? t('publish.yes', { default: 'Yes' })
                : t('publish.no', { default: 'No' })}
            </p>
          </div>
          <div className='rounded-md border p-3'>
            <p className='text-muted-foreground text-xs'>
              {t('publish.variant', { default: 'Selected variant' })}
            </p>
            <p className='mt-1 text-sm font-semibold'>
              {selectedVariantName ??
                t('publish.notSelected', { default: 'No selected variant' })}
            </p>
          </div>
        </div>
        {visibleError ? (
          <ExperienceOperationFeedback error={visibleError} />
        ) : null}
        {report.errors.length > 0 ? (
          <section
            role='alert'
            className='border-destructive/40 bg-destructive/5 rounded-md border p-3'
          >
            <div className='text-destructive flex items-center gap-2 text-sm font-semibold'>
              <AlertTriangle className='size-4' aria-hidden />
              {t('publish.cannot', {
                default: 'Cannot publish until errors are resolved'
              })}
            </div>
            <ul className='mt-2 list-disc space-y-1 pl-5 text-xs'>
              {report.errors.map((issue, index) => (
                <li key={`${issue.code}-${issue.path.join('.')}-${index}`}>
                  {issue.code}
                </li>
              ))}
            </ul>
          </section>
        ) : (
          <section
            role='status'
            aria-live='polite'
            className='rounded-md border border-emerald-300 bg-emerald-50 p-3 text-sm text-emerald-950 dark:bg-emerald-950/30 dark:text-emerald-100'
          >
            <CheckCircle2 className='mr-2 inline size-4' aria-hidden />
            {t('publish.ready', { default: 'Validation passed' })}
          </section>
        )}
        {report.warnings.length > 0 ? (
          <section
            role='status'
            aria-live='polite'
            className='rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-950 dark:bg-amber-950/30 dark:text-amber-100'
          >
            <p className='font-medium'>
              {t('publish.warnings', { default: 'Warnings' })}
            </p>
            <ul className='mt-2 list-disc space-y-1 pl-5 text-xs'>
              {report.warnings.map((issue, index) => (
                <li key={`${issue.code}-${issue.path.join('.')}-${index}`}>
                  {issue.code}
                </li>
              ))}
            </ul>
          </section>
        ) : null}
        <DeviceAssignmentTable devices={devices} />
        <VersionHistory
          versions={versions}
          onRestoreVersion={onRestoreVersion ? requestRestore : undefined}
          disabled={disabled || pendingAction !== null}
        />
        <DialogFooter>
          <Button
            type='button'
            variant='outline'
            className='min-h-11'
            disabled={pendingAction !== null}
            onClick={() => onOpenChange(false)}
          >
            {t('common.cancel', { default: 'Cancel' })}
          </Button>
          <Button
            type='button'
            className='min-h-11'
            disabled={blocked}
            aria-busy={pendingAction === 'publish'}
            onClick={() => void requestPublish()}
          >
            {pendingAction === 'publish'
              ? t('publish.publishing', { default: 'Publishing…' })
              : t('publish.confirm', { default: 'Publish' })}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
