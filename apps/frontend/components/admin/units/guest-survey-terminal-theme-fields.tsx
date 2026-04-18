'use client';

import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { parseGuestSurveyCounterDisplayTheme } from '@quokkaq/shared-types';

export type GuestSurveyTerminalThemeDraft = {
  enabled: boolean;
  headerColor: string;
  bodyColor: string;
  foregroundColor: string;
  mutedForegroundColor: string;
  primaryColor: string;
  primaryForegroundColor: string;
  borderColor: string;
};

export function defaultGuestSurveyTerminalThemeDraft(): GuestSurveyTerminalThemeDraft {
  return {
    enabled: false,
    headerColor: '#ffffff',
    bodyColor: '#ffffff',
    foregroundColor: '#0a0a0a',
    mutedForegroundColor: '#737373',
    primaryColor: '#0a0a0a',
    primaryForegroundColor: '#fafafa',
    borderColor: '#e5e5e5'
  };
}

export function themeDraftFromDisplayThemeRaw(
  raw: unknown
): GuestSurveyTerminalThemeDraft {
  const base = defaultGuestSurveyTerminalThemeDraft();
  const p = parseGuestSurveyCounterDisplayTheme(raw);
  if (!p) return base;
  return {
    enabled: p.isCustomColorsEnabled === true,
    headerColor: p.headerColor ?? base.headerColor,
    bodyColor: p.bodyColor ?? base.bodyColor,
    foregroundColor: p.foregroundColor ?? base.foregroundColor,
    mutedForegroundColor: p.mutedForegroundColor ?? base.mutedForegroundColor,
    primaryColor: p.primaryColor ?? base.primaryColor,
    primaryForegroundColor:
      p.primaryForegroundColor ?? base.primaryForegroundColor,
    borderColor: p.borderColor ?? base.borderColor
  };
}

type Props = {
  idPrefix: string;
  draft: GuestSurveyTerminalThemeDraft;
  onChange: (next: GuestSurveyTerminalThemeDraft) => void;
  t: (key: string) => string;
};

function ColorField({
  id,
  label,
  value,
  onChange
}: {
  id: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className='space-y-2'>
      <Label htmlFor={id}>{label}</Label>
      <div className='flex items-center gap-2'>
        <Input
          id={id}
          type='color'
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className='h-10 w-12 cursor-pointer p-1'
        />
        <Input
          type='text'
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className='flex-1 font-mono text-sm'
          placeholder='#000000'
        />
      </div>
    </div>
  );
}

export function GuestSurveyTerminalThemeFields({
  idPrefix,
  draft,
  onChange,
  t
}: Props) {
  const set = (patch: Partial<GuestSurveyTerminalThemeDraft>) =>
    onChange({ ...draft, ...patch });

  return (
    <div className='border-border max-w-full min-w-0 space-y-4 rounded-lg border p-4'>
      <div className='flex min-w-0 items-center justify-between gap-3'>
        <div className='min-w-0 space-y-1'>
          <Label htmlFor={`${idPrefix}-theme-enabled`} className='text-sm'>
            {t('terminal_theme_section')}
          </Label>
          <p className='text-muted-foreground text-xs'>
            {t('terminal_theme_hint')}
          </p>
        </div>
        <Switch
          id={`${idPrefix}-theme-enabled`}
          checked={draft.enabled}
          onCheckedChange={(on) => set({ enabled: on })}
          className='shrink-0'
        />
      </div>
      {draft.enabled ? (
        <div className='grid grid-cols-1 gap-4 md:grid-cols-2'>
          <ColorField
            id={`${idPrefix}-hdr`}
            label={t('terminal_theme_header')}
            value={draft.headerColor}
            onChange={(headerColor) => set({ headerColor })}
          />
          <ColorField
            id={`${idPrefix}-body`}
            label={t('terminal_theme_body')}
            value={draft.bodyColor}
            onChange={(bodyColor) => set({ bodyColor })}
          />
          <ColorField
            id={`${idPrefix}-fg`}
            label={t('terminal_theme_foreground')}
            value={draft.foregroundColor}
            onChange={(foregroundColor) => set({ foregroundColor })}
          />
          <ColorField
            id={`${idPrefix}-muted`}
            label={t('terminal_theme_muted')}
            value={draft.mutedForegroundColor}
            onChange={(mutedForegroundColor) => set({ mutedForegroundColor })}
          />
          <ColorField
            id={`${idPrefix}-primary`}
            label={t('terminal_theme_primary')}
            value={draft.primaryColor}
            onChange={(primaryColor) => set({ primaryColor })}
          />
          <ColorField
            id={`${idPrefix}-primary-fg`}
            label={t('terminal_theme_primary_fg')}
            value={draft.primaryForegroundColor}
            onChange={(primaryForegroundColor) =>
              set({ primaryForegroundColor })
            }
          />
          <ColorField
            id={`${idPrefix}-border`}
            label={t('terminal_theme_border')}
            value={draft.borderColor}
            onChange={(borderColor) => set({ borderColor })}
          />
        </div>
      ) : null}
    </div>
  );
}
