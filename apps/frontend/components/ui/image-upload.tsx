'use client';

import { useState, useRef, useId } from 'react';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Upload, X, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import Image from 'next/image';
import { logger } from '@/lib/logger';

interface ImageUploadProps {
  value?: string | null;
  onChange: (url: string) => void;
  onRemove: () => void;
  label?: string;
  className?: string;
}

export function ImageUpload({
  value,
  onChange,
  onRemove,
  label,
  className
}: ImageUploadProps) {
  const t = useTranslations('components.upload');
  const displayLabel = label ?? t('defaultImageLabel');
  const [isUploading, setIsUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const inputId = useId();

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      toast.error(t('invalidType'));
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      toast.error(t('fileTooLarge'));
      return;
    }

    setIsUploading(true);
    const formData = new FormData();
    formData.append('file', file);

    try {
      const token =
        typeof window !== 'undefined'
          ? localStorage.getItem('access_token')
          : null;
      const response = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL}/upload`,
        {
          method: 'POST',
          body: formData,
          headers: token ? { Authorization: `Bearer ${token}` } : undefined
        }
      );

      if (!response.ok) {
        throw new Error('Upload failed');
      }

      const data = await response.json();
      onChange(data.url);
      toast.success(t('imageSuccess'));
    } catch (error) {
      logger.error('Upload error:', error);
      toast.error(t('imageFailed'));
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  return (
    <div className={`space-y-2 ${className ?? ''}`}>
      <Label htmlFor={inputId}>{displayLabel}</Label>
      <div className='flex min-w-0 flex-col gap-3 sm:flex-row sm:items-center sm:gap-4'>
        {value ? (
          <div className='bg-muted/50 relative flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden rounded-md border'>
            <Image
              src={value}
              alt={displayLabel}
              fill
              unoptimized
              className='object-contain p-1'
            />
            <Button
              type='button'
              variant='destructive'
              size='icon'
              className='absolute top-0 right-0 h-5 w-5 rounded-tr-none rounded-bl-md'
              onClick={onRemove}
            >
              <X className='h-3 w-3' />
            </Button>
          </div>
        ) : (
          <div className='bg-muted/20 text-muted-foreground flex h-20 w-20 shrink-0 items-center justify-center rounded-md border border-dashed'>
            <Upload className='h-8 w-8 opacity-50' />
          </div>
        )}

        <div className='w-full min-w-0 sm:flex-1'>
          <Input
            ref={fileInputRef}
            type='file'
            accept='image/*'
            className='hidden'
            onChange={handleFileChange}
            id={inputId}
          />
          <Button
            type='button'
            variant='outline'
            disabled={isUploading}
            onClick={() => fileInputRef.current?.click()}
            className='h-auto min-h-9 w-full max-w-full px-3 py-2.5 text-center leading-snug whitespace-normal sm:w-auto sm:whitespace-nowrap'
          >
            {isUploading ? (
              <>
                <Loader2 className='mr-2 h-4 w-4 animate-spin' />
                {t('uploading')}
              </>
            ) : (
              <>
                <Upload className='mr-2 h-4 w-4' />
                {value ? t('changeImage') : t('uploadImage')}
              </>
            )}
          </Button>
          <p className='text-muted-foreground mt-1 text-xs'>{t('hint')}</p>
        </div>
      </div>
    </div>
  );
}
