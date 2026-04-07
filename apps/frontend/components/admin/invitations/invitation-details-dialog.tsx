'use client';

import { useTranslations } from 'next-intl';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription
} from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useUnits } from '@/lib/hooks';

import { Unit } from '@/lib/api';

interface Invitation {
  id: string;
  email: string;
  status: 'active' | 'accepted' | 'inactive';
  expiresAt: string;
  createdAt: string;
  targetRoles?: string;
  targetUnits?: string;
}

interface InvitationDetailsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  invitation: Invitation | null;
}

export default function InvitationDetailsDialog({
  open,
  onOpenChange,
  invitation
}: InvitationDetailsDialogProps) {
  const t = useTranslations('invitations');
  const tPermissions = useTranslations('admin.users.permissions_list');
  const { data: units } = useUnits();

  if (!invitation) return null;

  const parseData = (data: string | undefined) => {
    if (!data) return [];
    try {
      // Try parsing directly first
      return JSON.parse(data);
    } catch {
      try {
        // If it fails, it might be base64 encoded (Go's []byte behavior)
        return JSON.parse(atob(data));
      } catch (e2) {
        console.error('Error parsing invitation data:', e2);
        return [];
      }
    }
  };

  const targetRoles = parseData(invitation.targetRoles);
  const targetUnits = parseData(invitation.targetUnits);

  const getUnitName = (unitId: string) => {
    return units?.find((u: Unit) => u.id === unitId)?.name || unitId;
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className='sm:max-w-[600px]'>
        <DialogHeader>
          <DialogTitle>{t('invitation_details')}</DialogTitle>
          <DialogDescription>{invitation.email}</DialogDescription>
        </DialogHeader>

        <ScrollArea className='max-h-[60vh]'>
          <div className='space-y-6'>
            {/* Roles Section */}
            <div>
              <h3 className='mb-2 font-medium'>{t('assigned_roles')}</h3>
              {targetRoles.length > 0 ? (
                <div className='flex flex-wrap gap-2'>
                  {targetRoles.map((role: string) => (
                    <Badge
                      key={role}
                      variant='secondary'
                      className='capitalize'
                    >
                      {role}
                    </Badge>
                  ))}
                </div>
              ) : (
                <p className='text-muted-foreground text-sm'>
                  {t('no_roles_assigned')}
                </p>
              )}
            </div>

            {/* Units Section */}
            <div>
              <h3 className='mb-2 font-medium'>{t('assigned_units')}</h3>
              {targetUnits.length > 0 ? (
                <div className='space-y-4'>
                  {targetUnits.map(
                    (target: { unitId: string; permissions?: string[] }) => (
                      <div
                        key={target.unitId}
                        className='rounded-lg border p-3'
                      >
                        <div className='mb-2 font-medium'>
                          {getUnitName(target.unitId)}
                        </div>
                        {target.permissions && target.permissions.length > 0 ? (
                          <div className='grid grid-cols-1 gap-1'>
                            {target.permissions.map((perm: string) => (
                              <div
                                key={perm}
                                className='text-muted-foreground flex items-center text-sm'
                              >
                                <div className='bg-primary mr-2 h-1.5 w-1.5 rounded-full' />
                                {tPermissions(perm)}
                              </div>
                            ))}
                          </div>
                        ) : (
                          <p className='text-muted-foreground text-sm italic'>
                            {t('no_permissions_assigned')}
                          </p>
                        )}
                      </div>
                    )
                  )}
                </div>
              ) : (
                <p className='text-muted-foreground text-sm'>
                  {t('no_units_assigned')}
                </p>
              )}
            </div>
          </div>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}
