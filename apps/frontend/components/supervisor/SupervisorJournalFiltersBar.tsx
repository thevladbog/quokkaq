'use client';

import { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { format } from 'date-fns';
import { enUS, ru } from 'date-fns/locale';
import { Loader2, Plus, X } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';

import { unitsApi, type UnitClient } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Popover,
  PopoverContent,
  PopoverTrigger
} from '@/components/ui/popover';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select';
import { cn } from '@/lib/utils';

/** PostgreSQL DOW 1–6 Mon–Sat, then 0 Sun — Monday-first UI */
const WEEK_UI_ORDER = [1, 2, 3, 4, 5, 6, 0] as const;

const JOURNAL_WEEKDAY_KEYS = {
  0: 'journalWeekday0',
  1: 'journalWeekday1',
  2: 'journalWeekday2',
  3: 'journalWeekday3',
  4: 'journalWeekday4',
  5: 'journalWeekday5',
  6: 'journalWeekday6'
} as const satisfies Record<number, string>;

type JournalWeekdayDOW = keyof typeof JOURNAL_WEEKDAY_KEYS;

function isJournalWeekdayDOW(d: number): d is JournalWeekdayDOW {
  return (
    d === 0 || d === 1 || d === 2 || d === 3 || d === 4 || d === 5 || d === 6
  );
}

const ALL_MENU_ORDER = [
  'counter',
  'operator',
  'visitor',
  'ticket',
  'weekdays',
  'daterange'
] as const;

export type JournalFilterKind = (typeof ALL_MENU_ORDER)[number];

export type JournalFilterState = {
  q: string;
  counterId: string;
  userId: string;
  clientId: string;
  ticket: string;
  weekdays: number[];
  dateFrom: string;
  dateTo: string;
  activeKinds: JournalFilterKind[];
};

export const emptyJournalFilterState: JournalFilterState = {
  q: '',
  counterId: '',
  userId: '',
  clientId: '',
  ticket: '',
  weekdays: [],
  dateFrom: '',
  dateTo: '',
  activeKinds: []
};

type CounterRow = { id: string; name: string };
type ActorRow = { userId: string; name: string };

type Props = {
  unitId: string;
  draft: JournalFilterState;
  onDraftChange: React.Dispatch<React.SetStateAction<JournalFilterState>>;
  counters: CounterRow[];
  actors: ActorRow[];
  selectedVisitor: UnitClient | null;
  onSelectedVisitorChange: (v: UnitClient | null) => void;
  onApply: () => void;
  onReset: () => void;
};

function formatVisitorLabel(c: UnitClient): string {
  const name = [c.firstName, c.lastName]
    .map((s) => s.trim())
    .filter(Boolean)
    .join(' ');
  return name || c.id;
}

function parseYmdLocal(s: string): Date | undefined {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return undefined;
  const y = Number(s.slice(0, 4));
  const m = Number(s.slice(5, 7));
  const d = Number(s.slice(8, 10));
  if (!y || m < 1 || m > 12 || d < 1 || d > 31) return undefined;
  return new Date(y, m - 1, d);
}

function addKindOnce(
  prev: JournalFilterState,
  kind: JournalFilterKind
): JournalFilterState {
  if (prev.activeKinds.includes(kind)) return prev;
  return { ...prev, activeKinds: [...prev.activeKinds, kind] };
}

function stripKind(
  prev: JournalFilterState,
  kind: JournalFilterKind
): JournalFilterState {
  const activeKinds = prev.activeKinds.filter((k) => k !== kind);
  switch (kind) {
    case 'counter':
      return { ...prev, activeKinds, counterId: '' };
    case 'operator':
      return { ...prev, activeKinds, userId: '' };
    case 'visitor':
      return { ...prev, activeKinds, clientId: '' };
    case 'ticket':
      return { ...prev, activeKinds, ticket: '' };
    case 'weekdays':
      return { ...prev, activeKinds, weekdays: [] };
    case 'daterange':
      return { ...prev, activeKinds, dateFrom: '', dateTo: '' };
    default:
      return { ...prev, activeKinds };
  }
}

export function SupervisorJournalFiltersBar({
  unitId,
  draft,
  onDraftChange,
  counters,
  actors,
  selectedVisitor,
  onSelectedVisitorChange,
  onApply,
  onReset
}: Props) {
  const t = useTranslations('supervisor.dashboardUi');
  const locale = useLocale();
  const dateLocale = locale.startsWith('ru') ? ru : enUS;

  const [editingKind, setEditingKind] = useState<JournalFilterKind | null>(
    null
  );
  const [visitorQuery, setVisitorQuery] = useState('');
  const [debouncedVisitorQ, setDebouncedVisitorQ] = useState('');

  useEffect(() => {
    const timerId = window.setTimeout(
      () => setDebouncedVisitorQ(visitorQuery.trim()),
      400
    );
    return () => window.clearTimeout(timerId);
  }, [visitorQuery]);

  const visitorSearchEnabled =
    editingKind === 'visitor' && debouncedVisitorQ.length >= 2;

  const { data: visitorHits = [], isFetching: visitorsFetching } = useQuery({
    queryKey: ['unitClientSearch', unitId, debouncedVisitorQ],
    queryFn: () => unitsApi.searchClients(unitId, debouncedVisitorQ),
    enabled: visitorSearchEnabled
  });

  const counterNameById = useMemo(() => {
    const m = new Map<string, string>();
    for (const c of counters) m.set(c.id, c.name);
    return m;
  }, [counters]);

  const actorNameById = useMemo(() => {
    const m = new Map<string, string>();
    for (const a of actors) m.set(a.userId, a.name);
    return m;
  }, [actors]);

  const dateRangeSelected = useMemo(() => {
    const from = parseYmdLocal(draft.dateFrom);
    const to = parseYmdLocal(draft.dateTo);
    if (!from && !to) return undefined;
    return { from, to };
  }, [draft.dateFrom, draft.dateTo]);

  const addFilter = (kind: JournalFilterKind) => {
    onDraftChange((prev) => addKindOnce(prev, kind));
    setEditingKind(kind);
  };

  const removeChip = (kind: JournalFilterKind) => {
    if (kind === 'visitor') {
      onSelectedVisitorChange(null);
      setVisitorQuery('');
    }
    onDraftChange((prev) => stripKind(prev, kind));
    setEditingKind((cur) => (cur === kind ? null : cur));
  };

  const toggleWeekday = (dow: number) => {
    onDraftChange((prev) => {
      const has = prev.weekdays.includes(dow);
      const weekdays = has
        ? prev.weekdays.filter((x) => x !== dow)
        : [...prev.weekdays, dow];
      return { ...prev, weekdays };
    });
  };

  const setDateRange = (range: { from?: Date; to?: Date } | undefined) => {
    onDraftChange((prev) => {
      if (!range?.from) {
        return { ...prev, dateFrom: '', dateTo: '' };
      }
      const fromStr = format(range.from, 'yyyy-MM-dd');
      if (range.to) {
        return {
          ...prev,
          dateFrom: fromStr,
          dateTo: format(range.to, 'yyyy-MM-dd')
        };
      }
      return { ...prev, dateFrom: fromStr, dateTo: fromStr };
    });
  };

  const chipLabel = (kind: JournalFilterKind): string => {
    switch (kind) {
      case 'counter': {
        const id = draft.counterId.trim();
        const name = id ? counterNameById.get(id) : '';
        return `${t('journalFilterCounter')}: ${name ?? (id || t('journalFilterNotSet'))}`;
      }
      case 'operator': {
        const id = draft.userId.trim();
        const name = id ? actorNameById.get(id) : '';
        return `${t('journalFilterOperator')}: ${name ?? (id || t('journalFilterNotSet'))}`;
      }
      case 'visitor': {
        if (selectedVisitor && draft.clientId.trim() === selectedVisitor.id) {
          return `${t('journalFilterVisitor')}: ${formatVisitorLabel(selectedVisitor)}`;
        }
        const id = draft.clientId.trim();
        return `${t('journalFilterVisitor')}: ${id || t('journalFilterNotSet')}`;
      }
      case 'ticket': {
        const tk = draft.ticket.trim();
        return `${t('journalFilterTicket')}: ${tk || t('journalFilterNotSet')}`;
      }
      case 'weekdays': {
        if (draft.weekdays.length === 0) {
          return `${t('journalFilterWeekdays')}: ${t('journalFilterNotSet')}`;
        }
        const sorted = [...draft.weekdays].sort((a, b) => a - b);
        const parts = sorted
          .filter(isJournalWeekdayDOW)
          .map((d) => t(JOURNAL_WEEKDAY_KEYS[d]));
        return `${t('journalFilterWeekdays')}: ${parts.join(', ')}`;
      }
      case 'daterange': {
        const a = draft.dateFrom.trim();
        const b = draft.dateTo.trim();
        if (!a && !b) {
          return `${t('journalFilterDateRange')}: ${t('journalFilterNotSet')}`;
        }
        const parsedA = a ? parseYmdLocal(a) : undefined;
        const parsedB = b ? parseYmdLocal(b) : undefined;
        const fa = parsedA ? format(parsedA, 'P', { locale: dateLocale }) : '…';
        const fb = parsedB ? format(parsedB, 'P', { locale: dateLocale }) : '…';
        if (a && b && a === b) {
          return `${t('journalFilterDateRange')}: ${fa}`;
        }
        return `${t('journalFilterDateRange')}: ${fa} — ${fb}`;
      }
      default:
        return kind;
    }
  };

  const menuKinds = ALL_MENU_ORDER.filter(
    (k) => !draft.activeKinds.includes(k)
  );

  const renderPopoverBody = (kind: JournalFilterKind) => {
    switch (kind) {
      case 'counter':
        return (
          <div className='space-y-2 p-1'>
            <Label className='text-xs'>{t('journalFilterCounter')}</Label>
            <Select
              value={draft.counterId || '__all'}
              onValueChange={(v) =>
                onDraftChange((d) => ({
                  ...d,
                  counterId: v === '__all' ? '' : v
                }))
              }
            >
              <SelectTrigger className='w-full'>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value='__all'>{t('journalFilterAll')}</SelectItem>
                {counters.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        );
      case 'operator':
        return (
          <div className='space-y-2 p-1'>
            <Label className='text-xs'>{t('journalFilterOperator')}</Label>
            <Select
              value={draft.userId || '__all'}
              onValueChange={(v) =>
                onDraftChange((d) => ({
                  ...d,
                  userId: v === '__all' ? '' : v
                }))
              }
            >
              <SelectTrigger className='w-full'>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value='__all'>{t('journalFilterAll')}</SelectItem>
                {actors.map((a) => (
                  <SelectItem key={a.userId} value={a.userId}>
                    {a.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        );
      case 'visitor':
        return (
          <div className='w-[min(100vw-2rem,20rem)] space-y-2 p-1'>
            <Label className='text-xs'>{t('journalFilterVisitor')}</Label>
            {selectedVisitor && draft.clientId.trim() === selectedVisitor.id ? (
              <div className='border-border/60 bg-muted/20 flex items-center justify-between gap-2 rounded-md border px-2 py-1.5 text-sm'>
                <span className='min-w-0 truncate'>
                  {formatVisitorLabel(selectedVisitor)}
                </span>
                <Button
                  type='button'
                  variant='ghost'
                  size='icon'
                  className='h-8 w-8 shrink-0'
                  onClick={() => {
                    onSelectedVisitorChange(null);
                    setVisitorQuery('');
                    onDraftChange((d) => ({ ...d, clientId: '' }));
                  }}
                  aria-label={t('journalFilterVisitorClear')}
                >
                  <X className='h-4 w-4' />
                </Button>
              </div>
            ) : (
              <>
                <Input
                  value={visitorQuery}
                  onChange={(e) => setVisitorQuery(e.target.value)}
                  placeholder={t('journalFilterSearchPlaceholder')}
                  autoComplete='off'
                />
                <div className='border-border/50 max-h-48 overflow-y-auto rounded-md border'>
                  {debouncedVisitorQ.length > 0 &&
                    debouncedVisitorQ.length < 2 && (
                      <p className='text-muted-foreground p-2 text-xs'>
                        {t('journalFilterVisitorMinChars')}
                      </p>
                    )}
                  {visitorSearchEnabled && visitorsFetching && (
                    <div className='text-muted-foreground flex items-center gap-2 p-2 text-xs'>
                      <Loader2 className='h-3.5 w-3.5 animate-spin' />
                      {t('journalFilterVisitorLoading')}
                    </div>
                  )}
                  {visitorSearchEnabled &&
                    !visitorsFetching &&
                    visitorHits.length === 0 &&
                    debouncedVisitorQ.length >= 2 && (
                      <p className='text-muted-foreground p-2 text-xs'>
                        {t('journalFilterVisitorEmpty')}
                      </p>
                    )}
                  <ul className='divide-border/40 divide-y'>
                    {visitorHits.map((c) => (
                      <li key={c.id}>
                        <button
                          type='button'
                          className={cn(
                            'hover:bg-muted/50 w-full px-2 py-2 text-left text-sm',
                            'focus-visible:ring-ring focus-visible:ring-2 focus-visible:outline-none'
                          )}
                          onClick={() => {
                            onSelectedVisitorChange(c);
                            onDraftChange((d) => ({ ...d, clientId: c.id }));
                            setVisitorQuery('');
                          }}
                        >
                          <span className='block truncate font-medium'>
                            {formatVisitorLabel(c)}
                          </span>
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              </>
            )}
          </div>
        );
      case 'ticket':
        return (
          <div className='space-y-2 p-1'>
            <Label className='text-xs' htmlFor='chip-ticket'>
              {t('journalFilterTicket')}
            </Label>
            <Input
              id='chip-ticket'
              value={draft.ticket}
              onChange={(e) =>
                onDraftChange((d) => ({ ...d, ticket: e.target.value }))
              }
              placeholder={t('journalFilterTicketPlaceholder')}
              autoComplete='off'
            />
          </div>
        );
      case 'weekdays':
        return (
          <div className='space-y-2 p-1'>
            <p className='text-muted-foreground text-xs'>
              {t('journalFilterWeekdaysHint')}
            </p>
            <div className='flex flex-wrap gap-1.5'>
              {WEEK_UI_ORDER.map((dow) => {
                const on = draft.weekdays.includes(dow);
                return (
                  <Button
                    key={dow}
                    type='button'
                    size='sm'
                    variant={on ? 'default' : 'outline'}
                    className='min-w-10 px-2'
                    onClick={() => toggleWeekday(dow)}
                  >
                    {t(JOURNAL_WEEKDAY_KEYS[dow])}
                  </Button>
                );
              })}
            </div>
          </div>
        );
      case 'daterange':
        return (
          <div className='space-y-2 p-1'>
            <p className='text-muted-foreground text-xs'>
              {t('journalFilterDateRangeHint')}
            </p>
            <Calendar
              mode='range'
              numberOfMonths={2}
              defaultMonth={dateRangeSelected?.from ?? new Date()}
              selected={dateRangeSelected}
              onSelect={setDateRange}
            />
            <Button
              type='button'
              variant='ghost'
              size='sm'
              className='w-full'
              onClick={() => setDateRange(undefined)}
            >
              {t('journalFilterClearDateRange')}
            </Button>
          </div>
        );
      default:
        return null;
    }
  };

  const filterMenuLabel = (kind: JournalFilterKind): string => {
    switch (kind) {
      case 'counter':
        return t('journalFilterCounter');
      case 'operator':
        return t('journalFilterOperator');
      case 'visitor':
        return t('journalFilterVisitor');
      case 'ticket':
        return t('journalFilterTicket');
      case 'weekdays':
        return t('journalFilterWeekdays');
      case 'daterange':
        return t('journalFilterDateRange');
      default:
        return kind;
    }
  };

  return (
    <div className='space-y-4'>
      <div className='flex flex-col gap-2 sm:flex-row sm:items-center'>
        <Input
          className='min-w-0 flex-1'
          value={draft.q}
          onChange={(e) => onDraftChange((d) => ({ ...d, q: e.target.value }))}
          placeholder={t('journalFilterSearchPlaceholder')}
          autoComplete='off'
          aria-label={t('journalFilterSearch')}
        />
        <div className='flex shrink-0 flex-wrap gap-2'>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                type='button'
                variant='outline'
                disabled={menuKinds.length === 0}
              >
                <Plus className='mr-2 h-4 w-4' />
                {t('journalFilterAdd')}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align='end' className='w-56'>
              {menuKinds.map((kind) => (
                <DropdownMenuItem key={kind} onSelect={() => addFilter(kind)}>
                  {filterMenuLabel(kind)}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
          <Button type='button' onClick={onApply}>
            {t('journalFilterApply')}
          </Button>
          <Button type='button' variant='outline' onClick={onReset}>
            {t('journalFilterReset')}
          </Button>
        </div>
      </div>

      {draft.activeKinds.length > 0 && (
        <div className='flex flex-wrap gap-2'>
          {draft.activeKinds.map((kind) => (
            <div
              key={kind}
              className='bg-muted/30 flex max-w-full items-center gap-1 rounded-full border py-0.5 pr-1 pl-2.5'
            >
              <Popover
                open={editingKind === kind}
                onOpenChange={(open) => {
                  if (open) {
                    setEditingKind(kind);
                  } else {
                    setEditingKind((k) => (k === kind ? null : k));
                  }
                }}
              >
                <PopoverTrigger asChild>
                  <button
                    type='button'
                    className='hover:bg-muted/80 focus-visible:ring-ring max-w-[min(100%,18rem)] truncate rounded-full px-1 py-0.5 text-left text-sm font-medium focus-visible:ring-2 focus-visible:outline-none'
                  >
                    {chipLabel(kind)}
                  </button>
                </PopoverTrigger>
                <PopoverContent className='w-auto p-3' align='start'>
                  {renderPopoverBody(kind)}
                </PopoverContent>
              </Popover>
              <Button
                type='button'
                variant='ghost'
                size='icon'
                className='h-7 w-7 shrink-0 rounded-full'
                aria-label={t('journalFilterRemoveChip')}
                onClick={() => removeChip(kind)}
              >
                <X className='h-3.5 w-3.5' />
              </Button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
