'use client';

import { useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { getGetUnitsUnitIdMaterialsQueryKey } from '@/lib/api/generated/units';
import { unitsApi, Material } from '@/lib/api';
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent
} from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Switch } from '@/components/ui/switch';
import { ImageIcon, Search, Video } from 'lucide-react';
import { toast } from 'sonner';
import { LogoUpload } from '@/components/ui/logo-upload';
import { useUpdateUnit } from '@/lib/hooks';
import type { AdScreenConfig } from '@quokkaq/shared-types';

/** Unit.config JSON from API — ad block is usually partial. */
type UnitConfigJson = {
  adScreen?: Partial<AdScreenConfig>;
  config?: Partial<AdScreenConfig>;
} & Record<string, unknown>;

export interface AdScreenSettingsProps {
  unitId: string;
  currentConfig: Record<string, unknown>;
  /** Open the Materials sub-tab (upload) in the parent display shell. */
  onRequestOpenMaterials?: () => void;
}

const LEGACY_AD_SCREEN_COLOR_KEYS = [
  'logoUrl',
  'headerColor',
  'bodyColor',
  'foregroundColor',
  'backgroundColor',
  'primaryColor',
  'secondaryColor',
  'isCustomColorsEnabled'
] as const;

function recordLooksLikeLegacyFlatAdScreen(
  u: Record<string, unknown>
): boolean {
  const known = LEGACY_AD_SCREEN_COLOR_KEYS as readonly string[];
  for (const k of Object.keys(u)) {
    if (known.includes(k)) {
      return true;
    }
    if (k.toLowerCase().includes('color')) {
      return true;
    }
  }
  return false;
}

function adConfigFromUnitConfig(
  c: Record<string, unknown>
): Partial<AdScreenConfig> {
  const u = c as unknown as UnitConfigJson;
  const nested = u.adScreen ?? u.config;
  if (nested) return nested;
  if (
    'width' in u ||
    'duration' in u ||
    'activeMaterialIds' in u ||
    'recentCallsHistoryLimit' in u ||
    recordLooksLikeLegacyFlatAdScreen(u)
  ) {
    return u as Partial<AdScreenConfig>;
  }
  return {};
}

/**
 * Branding, ad column width, fallback material IDs — no file upload;
 * uploads live in `UnitMediaLibrary`.
 */
export function AdScreenSettings({
  unitId,
  currentConfig,
  onRequestOpenMaterials
}: AdScreenSettingsProps) {
  const t = useTranslations('admin.ad_screen');
  const tDisplay = useTranslations('admin.display');
  const queryClient = useQueryClient();
  const [fallbackQuery, setFallbackQuery] = useState('');

  const adPartial = adConfigFromUnitConfig(currentConfig);
  const adConfig = {
    width: adPartial.width ?? 0,
    duration: adPartial.duration ?? 5,
    activeMaterialIds: adPartial.activeMaterialIds ?? [],
    recentCallsHistoryLimit: adPartial.recentCallsHistoryLimit ?? 0,
    logoUrl: adPartial.logoUrl ?? '',
    isCustomColorsEnabled: adPartial.isCustomColorsEnabled ?? false,
    headerColor: adPartial.headerColor ?? '#ffffff',
    bodyColor: adPartial.bodyColor ?? '#ffffff'
  };

  const [width, setWidth] = useState(adConfig.width || 0);
  const [duration, setDuration] = useState(adConfig.duration || 5);
  const [recentCallsHistoryLimit, setRecentCallsHistoryLimit] = useState(
    adConfig.recentCallsHistoryLimit ?? 0
  );
  const [selectedMaterials, setSelectedMaterials] = useState<string[]>(
    adConfig.activeMaterialIds || []
  );
  const [logoUrl, setLogoUrl] = useState(adConfig.logoUrl || '');
  const [isCustomColorsEnabled, setIsCustomColorsEnabled] = useState(
    adConfig.isCustomColorsEnabled || false
  );
  const [headerColor, setHeaderColor] = useState(
    adConfig.headerColor || '#ffffff'
  );
  const [bodyColor, setBodyColor] = useState(adConfig.bodyColor || '#ffffff');

  const { data: materials = [] as Material[] } = useQuery({
    queryKey: getGetUnitsUnitIdMaterialsQueryKey(unitId),
    queryFn: () => unitsApi.getMaterials(unitId)
  });

  const updateUnitMutation = useUpdateUnit();

  const handleSaveSettings = () => {
    const newConfig = {
      ...(currentConfig || {}),
      adScreen: {
        ...adConfigFromUnitConfig(currentConfig),
        width,
        duration,
        recentCallsHistoryLimit,
        activeMaterialIds: selectedMaterials,
        logoUrl,
        isCustomColorsEnabled,
        headerColor,
        bodyColor
      }
    };

    updateUnitMutation.mutate(
      { id: unitId, config: newConfig },
      {
        onSuccess: () => {
          toast.success(t('save_success'));
          void queryClient.invalidateQueries({
            queryKey: getGetUnitsUnitIdMaterialsQueryKey(unitId)
          });
        },
        onError: () => {
          toast.error(t('save_error'));
        }
      }
    );
  };

  const toggleMaterialSelection = (id: string) => {
    setSelectedMaterials((prev) =>
      prev.includes(id) ? prev.filter((mId) => mId !== id) : [...prev, id]
    );
  };

  const filteredFallback = useMemo(() => {
    const q = fallbackQuery.trim().toLowerCase();
    if (!q) return materials;
    return materials.filter(
      (m) =>
        m.filename.toLowerCase().includes(q) || m.id.toLowerCase().includes(q)
    );
  }, [materials, fallbackQuery]);

  return (
    <div className='space-y-6'>
      <Card>
        <CardHeader>
          <CardTitle>{t('settings_title')}</CardTitle>
          <CardDescription>{t('settings_desc')}</CardDescription>
        </CardHeader>
        <CardContent className='space-y-6'>
          <div className='space-y-2'>
            <LogoUpload
              label={t('logo_upload')}
              currentLogoUrl={logoUrl}
              onLogoUploaded={async (url) => {
                setLogoUrl(url);
              }}
              onLogoRemoved={async () => {
                setLogoUrl('');
              }}
            />
          </div>

          <div className='space-y-4 border-t pt-4'>
            <div className='flex items-center justify-between'>
              <Label htmlFor='custom-colors'>
                {t('use_custom_colors', { defaultValue: 'Use custom colors' })}
              </Label>
              <Switch
                id='custom-colors'
                checked={isCustomColorsEnabled}
                onCheckedChange={setIsCustomColorsEnabled}
              />
            </div>

            {isCustomColorsEnabled && (
              <div className='grid grid-cols-1 gap-4 md:grid-cols-2'>
                <div className='space-y-2'>
                  <Label htmlFor='header-color'>
                    {t('header_color', { defaultValue: 'Header Color' })}
                  </Label>
                  <div className='flex items-center gap-2'>
                    <Input
                      id='header-color'
                      type='color'
                      value={headerColor}
                      onChange={(e) => setHeaderColor(e.target.value)}
                      className='h-10 w-12 cursor-pointer p-1'
                    />
                    <Input
                      type='text'
                      value={headerColor}
                      onChange={(e) => setHeaderColor(e.target.value)}
                      className='flex-1'
                      placeholder='#ffffff'
                    />
                  </div>
                </div>

                <div className='space-y-2'>
                  <Label htmlFor='body-color'>
                    {t('body_color', { defaultValue: 'Body Color' })}
                  </Label>
                  <div className='flex items-center gap-2'>
                    <Input
                      id='body-color'
                      type='color'
                      value={bodyColor}
                      onChange={(e) => setBodyColor(e.target.value)}
                      className='h-10 w-12 cursor-pointer p-1'
                    />
                    <Input
                      type='text'
                      value={bodyColor}
                      onChange={(e) => setBodyColor(e.target.value)}
                      className='flex-1'
                      placeholder='#ffffff'
                    />
                  </div>
                </div>
              </div>
            )}
          </div>

          <div className='grid grid-cols-2 gap-x-3 gap-y-2 sm:gap-x-4'>
            <Label
              htmlFor='width'
              className='min-w-0 self-start leading-snug sm:leading-normal'
            >
              {t('ad_width')}
            </Label>
            <Label
              htmlFor='duration'
              className='min-w-0 self-start leading-snug sm:leading-normal'
            >
              {t('image_duration')}
            </Label>
            <Input
              id='width'
              type='number'
              min='0'
              max='50'
              value={width}
              onChange={(e) => setWidth(parseInt(e.target.value, 10) || 0)}
              placeholder='0 = no ads'
              className='min-w-0'
            />
            <Input
              id='duration'
              type='number'
              min='1'
              max='60'
              value={duration}
              onChange={(e) => setDuration(parseInt(e.target.value, 10) || 5)}
              className='min-w-0'
            />
            <p className='text-muted-foreground min-w-0 text-xs leading-relaxed'>
              {t('ad_width_help')}
            </p>
            <p className='text-muted-foreground min-w-0 text-xs leading-relaxed'>
              {t('image_duration_help')}
            </p>
          </div>

          <div className='max-w-md space-y-2'>
            <Label htmlFor='recent-calls-limit'>
              {t('recent_calls_history_limit')}
            </Label>
            <Input
              id='recent-calls-limit'
              type='number'
              min='0'
              max='200'
              value={recentCallsHistoryLimit}
              onChange={(e) =>
                setRecentCallsHistoryLimit(
                  Math.min(200, Math.max(0, parseInt(e.target.value, 10) || 0))
                )
              }
            />
            <p className='text-muted-foreground text-xs'>
              {t('recent_calls_history_limit_help')}
            </p>
          </div>

          <Button
            onClick={handleSaveSettings}
            disabled={updateUnitMutation.isPending}
          >
            {updateUnitMutation.isPending ? t('saving') : t('save_settings')}
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className='flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between'>
            <div>
              <CardTitle>
                {tDisplay('fallbackMediaTitle', {
                  default: 'Fallback media (no active playlist)'
                })}
              </CardTitle>
              <CardDescription>
                {tDisplay('fallbackMediaDescription', {
                  default:
                    'If no schedule applies a playlist, these files are used in the content area. Upload files in the Media library tab.'
                })}
              </CardDescription>
            </div>
            {onRequestOpenMaterials ? (
              <Button
                type='button'
                variant='outline'
                size='sm'
                onClick={onRequestOpenMaterials}
              >
                {tDisplay('openMediaLibrary', {
                  default: 'Media library'
                })}
              </Button>
            ) : null}
          </div>
        </CardHeader>
        <CardContent className='space-y-2'>
          {materials.length > 0 ? (
            <div className='relative max-w-md'>
              <Search className='text-muted-foreground pointer-events-none absolute top-1/2 left-2.5 h-4 w-4 -translate-y-1/2' />
              <Input
                className='pl-8'
                value={fallbackQuery}
                onChange={(e) => setFallbackQuery(e.target.value)}
                placeholder={tDisplay('fallbackSearchPlaceholder', {
                  default: 'Filter by name…'
                })}
              />
            </div>
          ) : null}
          {materials.length === 0 ? (
            <p className='text-muted-foreground text-sm'>
              {tDisplay('noMaterialsForFallback', {
                default: 'Add files in the Media library tab first.'
              })}
            </p>
          ) : filteredFallback.length === 0 ? (
            <p className='text-muted-foreground text-sm'>
              {tDisplay('fallbackSearchNoMatch', { default: 'No matches' })}
            </p>
          ) : (
            <div className='max-h-56 space-y-1.5 overflow-y-auto rounded-md border p-1.5'>
              {filteredFallback.map((material) => {
                const cbId = `fallback-mat-${material.id}`;
                return (
                  <div
                    key={material.id}
                    className='hover:bg-muted/50 flex items-center gap-2 rounded-md p-1.5'
                  >
                    <Checkbox
                      id={cbId}
                      checked={selectedMaterials.includes(material.id)}
                      onCheckedChange={() =>
                        toggleMaterialSelection(material.id)
                      }
                      aria-label={material.filename}
                    />
                    <div
                      className='bg-muted relative h-9 w-12 shrink-0 overflow-hidden rounded border'
                      aria-hidden
                    >
                      {material.type === 'image' && material.url ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={material.url}
                          alt=''
                          className='h-full w-full object-cover'
                        />
                      ) : material.type === 'image' ? (
                        <div className='text-muted-foreground flex h-full items-center justify-center'>
                          <ImageIcon className='h-4 w-4' />
                        </div>
                      ) : (
                        <div className='text-muted-foreground flex h-full items-center justify-center'>
                          <Video className='h-4 w-4' />
                        </div>
                      )}
                    </div>
                    <label
                      htmlFor={cbId}
                      className='min-w-0 flex-1 cursor-pointer truncate text-sm'
                      title={material.filename}
                    >
                      {material.filename}
                    </label>
                  </div>
                );
              })}
            </div>
          )}
          <div className='flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between'>
            <p className='text-muted-foreground text-xs'>
              {tDisplay('fallbackSaveHint', {
                default:
                  'Saves with the same settings as the card above (brand & column).'
              })}
            </p>
            <Button
              type='button'
              onClick={handleSaveSettings}
              disabled={updateUnitMutation.isPending}
            >
              {updateUnitMutation.isPending ? t('saving') : t('save_settings')}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
