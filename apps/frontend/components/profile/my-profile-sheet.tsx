'use client';

import { useMemo } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { UnitModelSchema, type User } from '@quokkaq/shared-types';
import { z } from 'zod';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger
} from '@/components/ui/accordion';
import { LogoUpload } from '@/components/ui/logo-upload';
import { Separator } from '@/components/ui/separator';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle
} from '@/components/ui/sheet';
import { useAuthContext } from '@/contexts/AuthContext';
import { useGetUnits } from '@/lib/api/generated/units';
import { usePatchAuthMe } from '@/lib/hooks';
import { UNIT_PERMISSIONS } from '@/lib/unit-permissions';
import { getUnitDisplayName } from '@/lib/unit-display';
import { toast } from 'sonner';

type UserUnitRow = NonNullable<User['units']>[number];

export interface MyProfileSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function MyProfileSheet({ open, onOpenChange }: MyProfileSheetProps) {
  const t = useTranslations('profile');
  const tAdminUsers = useTranslations('admin.users');
  const locale = useLocale();
  const { user, refreshUser } = useAuthContext();
  const patchMe = usePatchAuthMe();

  const { data: allUnits = [] } = useGetUnits({
    query: {
      enabled: open,
      select: (res) => {
        if (res.status !== 200) return [];
        return z.array(UnitModelSchema).parse(res.data ?? []);
      }
    }
  });

  const unitById = useMemo(
    () => new Map(allUnits.map((u) => [u.id, u])),
    [allUnits]
  );

  const getPermissionLabel = (permissionId: string) => {
    const key = `permissions_list.${permissionId}`;
    return tAdminUsers.has(key) ? tAdminUsers(key) : permissionId;
  };

  const handlePhotoUploaded = async (url: string) => {
    try {
      await patchMe.mutateAsync(url);
      await refreshUser();
      toast.success(t('photoUpdated'));
    } catch (e) {
      toast.error(
        t('photoUpdateError', {
          message: e instanceof Error ? e.message : String(e)
        })
      );
    }
  };

  const handlePhotoRemoved = async () => {
    try {
      await patchMe.mutateAsync('');
      await refreshUser();
      toast.success(t('photoRemoved'));
    } catch (e) {
      toast.error(
        t('photoUpdateError', {
          message: e instanceof Error ? e.message : String(e)
        })
      );
    }
  };

  const units = (user?.units ?? []) as UserUnitRow[];

  const unitRowTitle = (uu: UserUnitRow) => {
    const fromList = unitById.get(uu.unitId);
    const label = getUnitDisplayName(
      {
        name: uu.unit?.name || fromList?.name || '',
        nameEn: uu.unit?.nameEn ?? fromList?.nameEn ?? null
      },
      locale
    );
    return label.trim() || uu.unitId;
  };

  const unitRowCode = (uu: UserUnitRow) =>
    uu.unit?.code ?? unitById.get(uu.unitId)?.code ?? '';

  const isSystemAdmin = user?.roles?.includes('admin');

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side='right'
        className='flex w-full flex-col gap-0 overflow-y-auto sm:max-w-lg'
      >
        <SheetHeader className='text-left'>
          <SheetTitle>{t('myProfileTitle')}</SheetTitle>
          <SheetDescription>{t('myProfileDescription')}</SheetDescription>
        </SheetHeader>

        <div className='flex flex-1 flex-col gap-6 px-4 pb-8'>
          <section className='space-y-1 text-sm'>
            <p>
              <span className='text-muted-foreground'>{t('nameLabel')}: </span>
              <span className='font-medium'>{user?.name ?? '—'}</span>
            </p>
            {user?.email ? (
              <p>
                <span className='text-muted-foreground'>
                  {t('emailLabel')}:{' '}
                </span>
                <span>{user.email}</span>
              </p>
            ) : null}
            {isSystemAdmin ? (
              <p className='text-muted-foreground text-xs'>
                {t('systemAdminBadge')}
              </p>
            ) : null}
          </section>

          <Separator />

          <section className='space-y-3'>
            <h3 className='text-sm font-medium'>{t('photoSection')}</h3>
            <LogoUpload
              currentLogoUrl={user?.photoUrl ?? undefined}
              onLogoUploaded={handlePhotoUploaded}
              onLogoRemoved={handlePhotoRemoved}
              hideLabel
              label={t('photoSection')}
              uploadButtonLabel={t('profilePhotoUpload')}
              changeButtonLabel={t('profilePhotoChange')}
              hint={t('profilePhotoHint')}
              disabled={patchMe.isPending}
              showUploadSuccessToast={false}
            />
          </section>

          <Separator />

          <section className='space-y-3'>
            <h3 className='text-sm font-medium'>
              {t('unitsPermissionsSection')}
            </h3>
            {units.length === 0 ? (
              <p className='text-muted-foreground text-sm'>
                {t('noUnitsAssigned')}
              </p>
            ) : (
              <Accordion
                type='multiple'
                className='w-full rounded-md border px-2'
              >
                {units.map((uu) => {
                  const perms = uu.permissions ?? [];
                  const title = unitRowTitle(uu);
                  const subtitle = unitRowCode(uu);
                  return (
                    <AccordionItem key={uu.unitId} value={uu.unitId}>
                      <AccordionTrigger className='py-3'>
                        <span className='min-w-0 truncate text-left'>
                          {title}
                          {subtitle ? (
                            <span className='text-muted-foreground'>
                              {' '}
                              ({subtitle})
                            </span>
                          ) : null}
                        </span>
                      </AccordionTrigger>
                      <AccordionContent>
                        <div className='border-muted space-y-2 border-t pt-3'>
                          <p className='text-muted-foreground text-xs'>
                            {tAdminUsers('permissions')}
                          </p>
                          <ul className='space-y-1.5 text-sm'>
                            {UNIT_PERMISSIONS.filter((p) =>
                              perms.includes(p.id)
                            ).map((p) => (
                              <li key={p.id}>{getPermissionLabel(p.id)}</li>
                            ))}
                          </ul>
                          {perms.length === 0 ? (
                            <p className='text-muted-foreground text-xs'>
                              {t('noPermissionsInUnit')}
                            </p>
                          ) : null}
                        </div>
                      </AccordionContent>
                    </AccordionItem>
                  );
                })}
              </Accordion>
            )}
          </section>
        </div>
      </SheetContent>
    </Sheet>
  );
}
