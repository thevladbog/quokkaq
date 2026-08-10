'use client';

import {
  EXPERIENCE_TEMPLATE_LIMITS,
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

type DisplayIssue = {
  code: string;
  path: readonly (string | number)[];
};

type Translate = (
  key: string,
  values?: Record<string, string | number | Date>
) => string;

const SAFE_ISSUE_DESCRIPTIONS = {
  'schema.invalid': ['schemaInvalid', 'The experience definition is invalid.'],
  'page.start_missing': ['startPageMissing', 'The start page does not exist.'],
  'page.unreachable': ['pageUnreachable', 'This page cannot be reached.'],
  'page.unreferenced': [
    'pageUnreferenced',
    'This page is not referenced by the experience flow.'
  ],
  'action.target_missing': [
    'actionTargetMissing',
    'A navigation target page does not exist.'
  ],
  'widget.unsupported_for_surface': [
    'widgetUnsupported',
    'A widget is not supported on this surface.'
  ],
  'variant.unplaced_widget': [
    'widgetUnplaced',
    'A widget is not placed in this layout variant.'
  ],
  'variant.placement_overflow': [
    'placementOverflow',
    'A widget extends beyond the layout grid.'
  ],
  'variant.placement_overlap': [
    'placementOverlap',
    'Two widget placements overlap.'
  ],
  'variant.typography_scaled': [
    'typographyScaled',
    'Typography has been scaled for this variant.'
  ],
  'flow.required_page_missing': [
    'requiredPageMissing',
    'A required flow page is missing.'
  ],
  'condition.invalid': [
    'conditionInvalid',
    'A visibility condition is invalid.'
  ],
  'touch.target_too_small': [
    'touchTargetTooSmall',
    'A touch target is too small for this device.'
  ],
  'station.page_scroll_required': [
    'stationScrollRequired',
    'This ticket-station page would require scrolling.'
  ],
  'display.primary_text_small': [
    'displayTextSmall',
    'Primary display text may be too small at viewing distance.'
  ],
  'theme.legacy_contrast_unknown': [
    'legacyContrastUnknown',
    'Contrast could not be verified for the legacy theme.'
  ],
  'response.invalid': [
    'responseInvalid',
    'The server response contains an invalid experience definition.'
  ]
} as const satisfies Record<string, readonly [string, string]>;

const SAFE_OPERATION_ERROR_DESCRIPTIONS = {
  'experience.version_conflict': [
    'versionConflict',
    'A newer experience version already exists. Refresh and try again.'
  ],
  'experience.permission_denied': [
    'permissionDenied',
    'You no longer have permission to complete this operation.'
  ],
  'experience.not_found': [
    'notFound',
    'This experience or version no longer exists.'
  ],
  'experience.invalid_definition': [
    'invalidDefinition',
    'The experience definition was rejected. Review validation errors and try again.'
  ]
} as const satisfies Record<string, readonly [string, string]>;

function safeOperationErrorDescription(code?: string) {
  if (!code) return undefined;
  return Object.entries(SAFE_OPERATION_ERROR_DESCRIPTIONS).find(
    ([safeCode]) => safeCode === code
  )?.[1];
}

function safeIssueDescription(code: string) {
  return Object.entries(SAFE_ISSUE_DESCRIPTIONS).find(
    ([safeCode]) => safeCode === code
  )?.[1];
}

type SafePathGrammar = {
  readonly fields?: Readonly<Record<string, SafePathGrammar>>;
  readonly index?: {
    readonly max: number;
    readonly next: SafePathGrammar;
  };
};

const SAFE_PATH_LEAF: SafePathGrammar = {};
const SAFE_CONDITION_PATH: SafePathGrammar = {
  fields: { when: SAFE_PATH_LEAF, whenFalse: SAFE_PATH_LEAF }
};
const SAFE_ACTION_VALUE_PATH: SafePathGrammar = {
  fields: {
    source: SAFE_PATH_LEAF,
    value: SAFE_PATH_LEAF,
    field: SAFE_PATH_LEAF
  }
};
const SAFE_ACTION_PATH: SafePathGrammar = {
  fields: {
    type: SAFE_PATH_LEAF,
    key: SAFE_PATH_LEAF,
    value: SAFE_ACTION_VALUE_PATH,
    toPageId: SAFE_PATH_LEAF
  }
};
const SAFE_GRID_PATH: SafePathGrammar = {
  fields: { columns: SAFE_PATH_LEAF, rows: SAFE_PATH_LEAF }
};
const SAFE_PRESENTATION_PLACEMENT_PATH: SafePathGrammar = {
  fields: {
    serviceId: SAFE_PATH_LEAF,
    row: SAFE_PATH_LEAF,
    col: SAFE_PATH_LEAF,
    rowSpan: SAFE_PATH_LEAF,
    colSpan: SAFE_PATH_LEAF
  }
};
const SAFE_WIDGET_CONFIG_PATH: SafePathGrammar = {
  fields: {
    legacyRouting: SAFE_PATH_LEAF,
    presentation: {
      fields: {
        mode: SAFE_PATH_LEAF,
        grid: SAFE_GRID_PATH,
        coordinateBase: SAFE_PATH_LEAF,
        placements: {
          index: {
            max: EXPERIENCE_TEMPLATE_LIMITS.maxWidgetsPerPage - 1,
            next: SAFE_PRESENTATION_PLACEMENT_PATH
          }
        }
      }
    },
    pagination: {
      fields: {
        enabled: SAFE_PATH_LEAF,
        pageSize: SAFE_PATH_LEAF,
        threshold: SAFE_PATH_LEAF
      }
    },
    catalog: {
      fields: {
        navigation: SAFE_PATH_LEAF,
        rootCategoryIds: SAFE_PATH_LEAF,
        itemCount: SAFE_PATH_LEAF
      }
    }
  }
};
const SAFE_WIDGET_PATH: SafePathGrammar = {
  fields: {
    id: SAFE_PATH_LEAF,
    type: SAFE_PATH_LEAF,
    config: SAFE_WIDGET_CONFIG_PATH,
    tone: SAFE_PATH_LEAF,
    access: SAFE_CONDITION_PATH,
    actions: {
      index: {
        max: EXPERIENCE_TEMPLATE_LIMITS.maxActionsPerWidget - 1,
        next: SAFE_ACTION_PATH
      }
    }
  }
};
const SAFE_PAGE_PATH: SafePathGrammar = {
  fields: {
    id: SAFE_PATH_LEAF,
    name: SAFE_PATH_LEAF,
    widgets: {
      index: {
        max: EXPERIENCE_TEMPLATE_LIMITS.maxWidgetsPerPage - 1,
        next: SAFE_WIDGET_PATH
      }
    },
    access: SAFE_CONDITION_PATH,
    layouts: SAFE_PATH_LEAF
  }
};
const SAFE_PROFILE_PATH: SafePathGrammar = {
  fields: {
    id: SAFE_PATH_LEAF,
    name: SAFE_PATH_LEAF,
    width: SAFE_PATH_LEAF,
    height: SAFE_PATH_LEAF,
    interactionMode: SAFE_PATH_LEAF,
    viewingDistance: SAFE_PATH_LEAF,
    safeArea: {
      fields: {
        top: SAFE_PATH_LEAF,
        right: SAFE_PATH_LEAF,
        bottom: SAFE_PATH_LEAF,
        left: SAFE_PATH_LEAF
      }
    }
  }
};
const SAFE_VARIANT_PATH: SafePathGrammar = {
  fields: {
    id: SAFE_PATH_LEAF,
    profile: SAFE_PROFILE_PATH,
    grid: SAFE_GRID_PATH
  }
};
const SAFE_ISSUE_PATH_GRAMMAR: SafePathGrammar = {
  fields: {
    definition: { fields: { id: SAFE_PATH_LEAF } },
    schemaVersion: SAFE_PATH_LEAF,
    id: SAFE_PATH_LEAF,
    templateId: SAFE_PATH_LEAF,
    version: SAFE_PATH_LEAF,
    publishedAt: SAFE_PATH_LEAF,
    surface: SAFE_PATH_LEAF,
    startPageId: SAFE_PATH_LEAF,
    variants: {
      index: {
        max: EXPERIENCE_TEMPLATE_LIMITS.maxVariants - 1,
        next: SAFE_VARIANT_PATH
      }
    },
    pages: {
      index: {
        max: EXPERIENCE_TEMPLATE_LIMITS.maxPages - 1,
        next: SAFE_PAGE_PATH
      }
    },
    flowPages: {
      fields: {
        serviceCatalogPageId: SAFE_PATH_LEAF,
        serviceInfoPageId: SAFE_PATH_LEAF,
        serviceFormPageId: SAFE_PATH_LEAF,
        identityPageId: SAFE_PATH_LEAF,
        appointmentPageId: SAFE_PATH_LEAF,
        confirmationPageId: SAFE_PATH_LEAF,
        successPageId: SAFE_PATH_LEAF
      }
    },
    theme: {
      fields: {
        preset: SAFE_PATH_LEAF,
        tokens: {
          fields: {
            header: SAFE_PATH_LEAF,
            surface: SAFE_PATH_LEAF,
            serviceGrid: SAFE_PATH_LEAF
          }
        }
      }
    }
  }
};

const SAFE_DYNAMIC_LAYOUT_ISSUE_KINDS = {
  'variant.unplaced_widget': 'layout-or-placement',
  'variant.placement_overflow': 'placement',
  'variant.placement_overlap': 'placement',
  'variant.typography_scaled': 'typography',
  'touch.target_too_small': 'placement',
  'display.primary_text_small': 'typography'
} as const satisfies Record<
  string,
  'layout-or-placement' | 'placement' | 'typography'
>;

function safeDynamicLayoutIssueKind(code: string) {
  return Object.entries(SAFE_DYNAMIC_LAYOUT_ISSUE_KINDS).find(
    ([safeCode]) => safeCode === code
  )?.[1];
}

function isSafeIssueIndex(value: unknown, max: number): value is number {
  return (
    typeof value === 'number' &&
    Number.isSafeInteger(value) &&
    value >= 0 &&
    value <= max
  );
}

function safeStructuralIssuePath(
  path: DisplayIssue['path']
): string | undefined {
  if (path.length === 0 || path.length > 12) return undefined;

  const parts: string[] = [];
  let grammar = SAFE_ISSUE_PATH_GRAMMAR;
  for (const segment of path) {
    if (typeof segment === 'number') {
      if (!grammar.index || !isSafeIssueIndex(segment, grammar.index.max)) {
        return undefined;
      }
      parts.push(`[${segment}]`);
      grammar = grammar.index.next;
      continue;
    }

    if (
      typeof segment !== 'string' ||
      !grammar.fields ||
      !Object.hasOwn(grammar.fields, segment)
    ) {
      return undefined;
    }
    const nextGrammar = grammar.fields[segment];
    if (!nextGrammar) return undefined;
    parts.push(parts.length === 0 ? segment : `.${segment}`);
    grammar = nextGrammar;
  }

  return parts.join('');
}

function safeDynamicLayoutIssuePath(
  issue: DisplayIssue,
  t: Translate
): string | undefined {
  if (issue.path.length < 4 || issue.path.length > 6) return undefined;
  const kind = safeDynamicLayoutIssueKind(issue.code);
  if (!kind) return undefined;

  const [pages, pageIndex, layouts, variantId, ...tail] = issue.path;
  if (
    pages !== 'pages' ||
    !isSafeIssueIndex(pageIndex, EXPERIENCE_TEMPLATE_LIMITS.maxPages - 1) ||
    layouts !== 'layouts' ||
    typeof variantId !== 'string' ||
    variantId.length === 0
  ) {
    return undefined;
  }

  const variant = t('publish.locationPlaceholders.variant', {
    default: '[variant]'
  });
  const base = `pages[${pageIndex}].layouts.${variant}`;
  if (kind === 'layout-or-placement' && tail.length === 0) return base;
  if (kind === 'typography') {
    return tail.length === 1 && tail[0] === 'typographyScale'
      ? `${base}.typographyScale`
      : undefined;
  }
  if (
    tail.length !== 2 ||
    tail[0] !== 'placements' ||
    typeof tail[1] !== 'string' ||
    tail[1].length === 0
  ) {
    return undefined;
  }

  const widget = t('publish.locationPlaceholders.widget', {
    default: '[widget]'
  });
  return `${base}.placements.${widget}`;
}

type SafeIssueLocation =
  | { kind: 'definition' }
  | { kind: 'path'; path: string };

function safeIssueLocation(
  issue: DisplayIssue,
  t: Translate
): SafeIssueLocation {
  const path =
    safeDynamicLayoutIssuePath(issue, t) ?? safeStructuralIssuePath(issue.path);
  return path ? { kind: 'path', path } : { kind: 'definition' };
}

function ExperienceIssueList({
  issues,
  t
}: {
  issues: readonly DisplayIssue[];
  t: Translate;
}) {
  return (
    <ul className='mt-2 list-disc space-y-2 pl-5 text-xs'>
      {issues.map((issue, index) => {
        const known = safeIssueDescription(issue.code);
        const description = known
          ? t(`publish.issues.${known[0]}`, { default: known[1] })
          : t('publish.issues.unknown', {
              default: 'The definition contains an issue that must be resolved.'
            });
        const location = safeIssueLocation(issue, t);
        const path =
          location.kind === 'path'
            ? location.path
            : t('publish.definitionLocation', { default: 'Definition' });
        return (
          <li key={index}>
            <p>{description}</p>
            <p className='text-muted-foreground mt-0.5'>
              {t('publish.issueLocation', {
                path,
                default: `Location: ${path}`
              })}
            </p>
          </li>
        );
      })}
    </ul>
  );
}

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
  /** API/parser feedback supplied by the builder host is mapped to safe UI text. */
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

function operationErrorFromThrown(error: unknown): ExperienceOperationError {
  if (isApiHttpError(error)) {
    return {
      kind: 'api-error',
      message: '',
      ...(error.code === undefined ? {} : { code: error.code })
    };
  }
  return { kind: 'api-error', message: '' };
}

export function ExperienceOperationFeedback({
  error
}: {
  error: ExperienceOperationError;
}) {
  const t = useTranslations('experience.builder.task11');
  if (error.kind === 'api-error') {
    const known = safeOperationErrorDescription(error.code);
    return (
      <section
        role='alert'
        className='border-destructive/40 bg-destructive/5 text-destructive rounded-md border p-3 text-sm'
      >
        <p className='font-semibold'>
          {known
            ? t(`publish.operationErrors.${known[0]}`, {
                default: known[1]
              })
            : t('publish.operationFailed', {
                default: 'The operation could not be completed.'
              })}
        </p>
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
      <ExperienceIssueList issues={error.issues} t={t} />
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
      setOperationError(operationErrorFromThrown(error));
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
      setOperationError(operationErrorFromThrown(error));
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
            <ExperienceIssueList issues={report.errors} t={t} />
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
            <ExperienceIssueList issues={report.warnings} t={t} />
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
