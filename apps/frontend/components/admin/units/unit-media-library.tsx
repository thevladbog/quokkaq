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
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { ImageIcon, Video, Trash2 } from 'lucide-react';
import { toast } from 'sonner';

/**
 * Unit media: upload, grid with previews, delete. Single place for file library (display settings).
 */
export function UnitMediaLibrary({ unitId }: { unitId: string }) {
  const t = useTranslations('admin.ad_screen');
  const queryClient = useQueryClient();
  const [uploading, setUploading] = useState(false);

  const { data: materials = [] as Material[], isLoading } = useQuery({
    queryKey: getGetUnitsUnitIdMaterialsQueryKey(unitId),
    queryFn: () => unitsApi.getMaterials(unitId)
  });

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

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    uploadMutation.mutate(file);
    e.target.value = '';
  };

  return (
    <div className='space-y-6'>
      <Card>
        <CardHeader>
          <CardTitle>{t('upload_title')}</CardTitle>
          <CardDescription>{t('upload_desc')}</CardDescription>
        </CardHeader>
        <CardContent>
          <div className='flex flex-wrap items-center gap-4'>
            <Input
              type='file'
              accept='image/*,video/*'
              onChange={handleFileUpload}
              disabled={uploading}
              className='max-w-sm'
            />
            {uploading ? (
              <p className='text-muted-foreground text-sm'>{t('uploading')}</p>
            ) : null}
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
                          alt=''
                          className='h-full w-full object-cover'
                        />
                      </>
                    ) : (
                      <Video className='text-muted-foreground h-12 w-12' />
                    )}
                  </div>
                  <div className='flex items-center justify-between gap-1'>
                    <div className='flex min-w-0 items-center gap-1'>
                      <span className='text-sm'>
                        {material.type === 'image' ? (
                          <ImageIcon className='h-4 w-4 shrink-0' />
                        ) : (
                          <Video className='h-4 w-4 shrink-0' />
                        )}
                      </span>
                      <span
                        className='text-muted-foreground truncate text-xs'
                        title={material.filename}
                      >
                        {material.filename}
                      </span>
                    </div>
                    <Button
                      variant='ghost'
                      size='icon'
                      className='shrink-0'
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
