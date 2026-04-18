'use client';

import { useId, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Upload, X, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { logger } from '@/lib/logger';
import { uploadLogo, uploadPrinterLogo } from '@/lib/api/generated/upload';

interface LogoUploadProps {
  currentLogoUrl?: string;
  /** Called after upload succeeds; await so loading state clears only after persistence (e.g. PATCH profile). */
  onLogoUploaded: (url: string) => Promise<void>;
  /** Called when user removes the logo; await so loading state clears only after persistence. */
  onLogoRemoved: () => Promise<void>;
  label?: string;
  /** e.g. `image/*` or `image/png,image/jpeg,image/bmp,.bmp` */
  accept?: string;
  /** Replaces the default hint under the button */
  hint?: string;
  /**
   * `kiosk` → POST /api/upload (via Orval + authenticatedApiFetch).
   * `printer` → POST /api/upload-printer-logo.
   */
  uploadTarget?: 'kiosk' | 'printer';
  /** When true, allow `.bmp` / `.dib` even if `file.type` is empty */
  allowBmpByExtension?: boolean;
  /** Disable upload and remove actions */
  disabled?: boolean;
  /** When true, the visible `<Label>` is omitted (use an external heading instead). */
  hideLabel?: boolean;
  /** Overrides default "Upload logo" / similar button label */
  uploadButtonLabel?: string;
  /** Overrides default "Change logo" button label */
  changeButtonLabel?: string;
  /** When false, skips the built-in success toast after upload (caller may toast). Default true. */
  showUploadSuccessToast?: boolean;
}

function isAllowedImageFile(file: File, allowBmpByExtension: boolean): boolean {
  if (file.type.startsWith('image/')) {
    return true;
  }
  if (allowBmpByExtension && /\.(bmp|dib)$/i.test(file.name)) {
    return true;
  }
  return false;
}

export function LogoUpload({
  currentLogoUrl,
  onLogoUploaded,
  onLogoRemoved,
  label,
  accept = 'image/*',
  hint,
  uploadTarget = 'kiosk',
  allowBmpByExtension = false,
  disabled = false,
  hideLabel = false,
  uploadButtonLabel,
  changeButtonLabel,
  showUploadSuccessToast = true
}: LogoUploadProps) {
  const t = useTranslations('components.upload');
  const displayLabel = label ?? t('defaultLogoLabel');
  const fileInputId = useId();
  const [isUploading, setIsUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (disabled) return;
    const file = e.target.files?.[0];
    if (!file) return;

    if (!isAllowedImageFile(file, allowBmpByExtension)) {
      toast.error(t('invalidType'));
      e.target.value = '';
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      toast.error(t('fileTooLarge'));
      e.target.value = '';
      return;
    }

    setIsUploading(true);

    try {
      const res =
        uploadTarget === 'printer'
          ? await uploadPrinterLogo({ file })
          : await uploadLogo({ file });

      if (res.status !== 200) {
        throw new Error('Upload failed');
      }

      const url = res.data.url;
      if (!url) {
        throw new Error('Upload failed');
      }
      await onLogoUploaded(url);
      if (showUploadSuccessToast) {
        toast.success(t('logoSuccess'));
      }
    } catch (error) {
      logger.error('Upload error:', error);
      toast.error(t('logoFailed'));
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const uploadBtn = uploadButtonLabel ?? t('uploadLogo');
  const changeBtn = changeButtonLabel ?? t('changeLogo');

  return (
    <div className='space-y-2'>
      {hideLabel ? null : <Label htmlFor={fileInputId}>{displayLabel}</Label>}
      <div className='flex flex-col gap-3 sm:flex-row sm:items-start sm:gap-4'>
        {currentLogoUrl ? (
          <div className='bg-muted/50 relative flex h-20 w-20 shrink-0 items-center justify-center self-center overflow-hidden rounded-md border sm:self-start'>
            {/* eslint-disable-next-line @next/next/no-img-element -- arbitrary upload URLs; next/image blocks hosts outside remotePatterns */}
            <img
              src={currentLogoUrl}
              alt={displayLabel}
              className='max-h-full max-w-full object-contain p-1'
            />
            <Button
              type='button'
              variant='destructive'
              size='icon'
              className='absolute top-0 right-0 h-5 w-5 rounded-tr-none rounded-bl-md'
              aria-label={t('removeLogo')}
              onClick={async () => {
                if (disabled) return;
                setIsUploading(true);
                try {
                  await onLogoRemoved();
                } finally {
                  setIsUploading(false);
                }
              }}
              disabled={disabled || isUploading}
            >
              <X className='h-3 w-3' aria-hidden />
            </Button>
          </div>
        ) : (
          <div className='bg-muted/20 text-muted-foreground flex h-20 w-20 shrink-0 items-center justify-center self-center rounded-md border border-dashed sm:self-start'>
            <Upload className='h-8 w-8 opacity-50' />
          </div>
        )}

        <div className='flex w-full min-w-0 flex-col gap-2 sm:flex-1'>
          <Input
            ref={fileInputRef}
            type='file'
            accept={accept}
            className='hidden'
            disabled={disabled}
            onChange={handleFileChange}
            id={fileInputId}
          />
          <Button
            variant='outline'
            disabled={isUploading || disabled}
            onClick={() => fileInputRef.current?.click()}
            className='w-full sm:w-auto sm:self-start'
            aria-label={hideLabel ? displayLabel : undefined}
          >
            {isUploading ? (
              <>
                <Loader2 className='mr-2 h-4 w-4 animate-spin' />
                {t('uploading')}
              </>
            ) : (
              <>
                <Upload className='mr-2 h-4 w-4' />
                {currentLogoUrl ? changeBtn : uploadBtn}
              </>
            )}
          </Button>
          <p className='text-muted-foreground text-xs'>{hint ?? t('hint')}</p>
        </div>
      </div>
    </div>
  );
}
