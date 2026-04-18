'use client';

import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { LogoUpload } from '@/components/ui/logo-upload';

export interface UserProfileFieldsProps {
  name: string;
  onNameChange: (v: string) => void;
  onSaveName: () => void;
  savingName: boolean;
  photoUrl?: string | null;
  onPhotoUploaded: (url: string) => Promise<void>;
  onPhotoRemoved: () => Promise<void>;
  photoBusy: boolean;
}

export function UserProfileFields({
  name,
  onNameChange,
  onSaveName,
  savingName,
  photoUrl,
  onPhotoUploaded,
  onPhotoRemoved,
  photoBusy
}: UserProfileFieldsProps) {
  const t = useTranslations('admin.users');

  return (
    <div className='space-y-6'>
      <div className='space-y-2'>
        <Label htmlFor='user-profile-name'>{t('profile_name_label')}</Label>
        <div className='flex flex-col gap-2 sm:flex-row sm:items-end'>
          <Input
            id='user-profile-name'
            value={name}
            onChange={(e) => onNameChange(e.target.value)}
            autoComplete='name'
            className='max-w-md'
          />
          <Button
            type='button'
            variant='secondary'
            size='sm'
            onClick={onSaveName}
            disabled={savingName || !name.trim()}
          >
            {savingName ? t('saving') : t('save_profile')}
          </Button>
        </div>
      </div>

      <div className='space-y-2'>
        <Label>{t('operator_photo_label')}</Label>
        <p className='text-muted-foreground text-sm'>
          {t('operator_photo_hint')}
        </p>
        <LogoUpload
          currentLogoUrl={photoUrl ?? undefined}
          onLogoUploaded={onPhotoUploaded}
          onLogoRemoved={onPhotoRemoved}
          label={t('operator_photo_upload')}
          disabled={photoBusy}
        />
      </div>
    </div>
  );
}
