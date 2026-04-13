'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
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
import { ImageIcon, Video, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { LogoUpload } from '@/components/ui/logo-upload';
import { useUpdateUnit } from '@/lib/hooks';
import type { AdScreenConfig } from '@quokkaq/shared-types';

/** Unit.config JSON from API — ad block is usually partial. */
type UnitConfigJson = {
  adScreen?: Partial<AdScreenConfig>;
  config?: Partial<AdScreenConfig>;
} & Record<string, unknown>;

interface AdScreenSettingsProps {
  unitId: string;
  currentConfig: Record<string, unknown>;
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
    'recentCallsHistoryLimit' in u
  ) {
    return u as Partial<AdScreenConfig>;
  }
  return {};
}

export function AdScreenSettings({
  unitId,
  currentConfig
}: AdScreenSettingsProps) {
  const t = useTranslations('admin.ad_screen');
  const queryClient = useQueryClient();
  const [uploading, setUploading] = useState(false);

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

  // Sync state with currentConfig when it changes - REMOVED
  // We now use a key on the component to reset state when config changes.
  // This avoids "setState in useEffect" warnings and potential loops.

  // Queries and Mutations
  const { data: materials = [] as Material[], isLoading } = useQuery({
    queryKey: getGetUnitsUnitIdMaterialsQueryKey(unitId),
    queryFn: () => unitsApi.getMaterials(unitId)
  });

  const updateUnitMutation = useUpdateUnit();

  const uploadMutation = useMutation({
    mutationFn: (file: File) => unitsApi.uploadMaterial(unitId, file),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: getGetUnitsUnitIdMaterialsQueryKey(unitId)
      });
      toast.success(t('upload_success'));
      setUploading(false);
    },
    onError: () => {
      toast.error(t('upload_error'));
      setUploading(false);
    }
  });

  const deleteMutation = useMutation({
    mutationFn: (materialId: string) =>
      unitsApi.deleteMaterial(unitId, materialId),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: getGetUnitsUnitIdMaterialsQueryKey(unitId)
      });
      toast.success(t('delete_success'));
    },
    onError: () => {
      toast.error(t('delete_error'));
    }
  });

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
        },
        onError: () => {
          toast.error(t('save_error'));
        }
      }
    );
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploading(true);
    uploadMutation.mutate(file);
    // Reset input
    e.target.value = '';
  };

  const toggleMaterialSelection = (id: string) => {
    setSelectedMaterials((prev) =>
      prev.includes(id) ? prev.filter((mId) => mId !== id) : [...prev, id]
    );
  };

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
              onLogoUploaded={setLogoUrl}
              onLogoRemoved={() => setLogoUrl('')}
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

          <div className='grid grid-cols-2 gap-4'>
            <div>
              <Label htmlFor='width'>{t('ad_width')}</Label>
              <Input
                id='width'
                type='number'
                min='0'
                max='50'
                value={width}
                onChange={(e) => setWidth(parseInt(e.target.value) || 0)}
                placeholder='0 = no ads'
              />
              <p className='text-muted-foreground mt-1 text-xs'>
                {t('ad_width_help')}
              </p>
            </div>

            <div>
              <Label htmlFor='duration'>{t('image_duration')}</Label>
              <Input
                id='duration'
                type='number'
                min='1'
                max='60'
                value={duration}
                onChange={(e) => setDuration(parseInt(e.target.value) || 5)}
              />
              <p className='text-muted-foreground mt-1 text-xs'>
                {t('image_duration_help')}
              </p>
            </div>
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
          <CardTitle>{t('upload_title')}</CardTitle>
          <CardDescription>{t('upload_desc')}</CardDescription>
        </CardHeader>
        <CardContent>
          <div className='flex items-center gap-4'>
            <Input
              type='file'
              accept='image/*,video/*'
              onChange={handleFileUpload}
              disabled={uploading}
              className='max-w-sm'
            />
            {uploading && (
              <p className='text-muted-foreground text-sm'>{t('uploading')}</p>
            )}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t('library_title')}</CardTitle>
          <CardDescription>{t('library_desc')}</CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <p className='text-muted-foreground'>{t('loading_materials')}</p>
          ) : materials.length === 0 ? (
            <p className='text-muted-foreground'>{t('no_materials')}</p>
          ) : (
            <div className='grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-4'>
              {materials.map((material) => (
                <div
                  key={material.id}
                  className='space-y-2 rounded-lg border p-2'
                >
                  <div className='bg-muted flex aspect-video items-center justify-center overflow-hidden rounded'>
                    {material.type === 'image' ? (
                      <>
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={material.url}
                          alt='Material'
                          className='h-full w-full object-cover'
                        />
                      </>
                    ) : (
                      <Video className='text-muted-foreground h-12 w-12' />
                    )}
                  </div>

                  <div className='flex items-center justify-between'>
                    <div className='flex items-center gap-2'>
                      <Checkbox
                        checked={selectedMaterials.includes(material.id)}
                        onCheckedChange={() =>
                          toggleMaterialSelection(material.id)
                        }
                      />
                      <span className='text-sm'>
                        {material.type === 'image' ? (
                          <ImageIcon className='h-4 w-4' />
                        ) : (
                          <Video className='h-4 w-4' />
                        )}
                      </span>
                    </div>

                    <Button
                      variant='ghost'
                      size='icon'
                      onClick={() => {
                        if (confirm(t('delete_confirm'))) {
                          deleteMutation.mutate(material.id);
                        }
                      }}
                      disabled={deleteMutation.isPending}
                    >
                      <Trash2 className='text-destructive h-4 w-4' />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
