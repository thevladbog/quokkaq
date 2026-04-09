'use client';

import { useState, useEffect, useMemo } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import {
  formatAppDate,
  intlLocaleFromAppLocale
} from '@/lib/format-datetime';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle
} from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import { Mail, RefreshCw, Trash2, Eye } from 'lucide-react';
import InviteDialog from '@/components/admin/invitations/invite-dialog';
import InvitationDetailsDialog from '@/components/admin/invitations/invitation-details-dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle
} from '@/components/ui/alert-dialog';

interface Invitation {
  id: string;
  email: string;
  status: 'active' | 'accepted' | 'inactive';
  expiresAt: string;
  createdAt: string;
  targetRoles?: string; // JSON string
  targetUnits?: string; // JSON string
}

export default function InvitationsPage() {
  const t = useTranslations('invitations');
  const locale = useLocale();
  const intlLocale = useMemo(() => intlLocaleFromAppLocale(locale), [locale]);
  const [invitations, setInvitations] = useState<Invitation[]>([]);
  const [loading, setLoading] = useState(true);
  const [showInviteDialog, setShowInviteDialog] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [detailsDialogOpen, setDetailsDialogOpen] = useState(false);
  const [selectedInvitation, setSelectedInvitation] =
    useState<Invitation | null>(null);

  const fetchInvitations = async () => {
    try {
      const response = await fetch('/api/invitations', {
        headers: {
          Authorization: `Bearer ${localStorage.getItem('access_token')}`
        }
      });
      if (response.ok) {
        const data = await response.json();
        setInvitations(data);
      }
    } catch {
      console.error('Error fetching invitations');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchInvitations();
  }, []);

  const handleResend = async (id: string) => {
    try {
      const response = await fetch(`/api/invitations/${id}/resend`, {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${localStorage.getItem('access_token')}`
        }
      });

      if (response.ok) {
        toast.success(t('invitation_resent'));
        fetchInvitations();
      } else {
        toast.error(t('error_sending'));
      }
    } catch {
      toast.error(t('error_sending'));
    }
  };

  const handleDelete = async () => {
    if (!selectedInvitation) return;

    if (selectedInvitation.status === 'accepted') {
      toast.error(t('cannot_delete_accepted'));
      setDeleteDialogOpen(false);
      return;
    }

    try {
      const response = await fetch(
        `/api/invitations/${selectedInvitation.id}`,
        {
          method: 'DELETE',
          headers: {
            Authorization: `Bearer ${localStorage.getItem('access_token')}`
          }
        }
      );

      if (response.ok) {
        toast.success(t('invitation_deleted'));
        fetchInvitations();
      } else {
        toast.error(t('error_sending'));
      }
    } catch {
      toast.error(t('error_sending'));
    } finally {
      setDeleteDialogOpen(false);
      setSelectedInvitation(null);
    }
  };

  const getStatusBadge = (status: string) => {
    const variants: Record<string, 'default' | 'secondary' | 'destructive'> = {
      active: 'default',
      accepted: 'secondary',
      inactive: 'destructive'
    };

    return <Badge variant={variants[status] || 'default'}>{t(status)}</Badge>;
  };

  return (
    <div className='container mx-auto p-6'>
      <Card>
        <CardHeader>
          <div className='flex items-center justify-between'>
            <div>
              <CardTitle>{t('title')}</CardTitle>
              <CardDescription>{t('description')}</CardDescription>
            </div>
            <Button onClick={() => setShowInviteDialog(true)}>
              <Mail className='mr-2 h-4 w-4' />
              {t('invite_user')}
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className='py-8 text-center'>{t('loading')}</div>
          ) : invitations.length === 0 ? (
            <div className='text-muted-foreground py-8 text-center'>
              {t('no_invitations')}
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t('email')}</TableHead>
                  <TableHead>{t('status')}</TableHead>
                  <TableHead>{t('expires_at')}</TableHead>
                  <TableHead>{t('actions')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {invitations.map((invitation) => (
                  <TableRow
                    key={invitation.id}
                    className='hover:bg-muted/50 cursor-pointer'
                    onClick={() => {
                      setSelectedInvitation(invitation);
                      setDetailsDialogOpen(true);
                    }}
                  >
                    <TableCell>{invitation.email}</TableCell>
                    <TableCell>{getStatusBadge(invitation.status)}</TableCell>
                    <TableCell>
                      {formatAppDate(invitation.expiresAt, intlLocale)}
                    </TableCell>
                    <TableCell onClick={(e) => e.stopPropagation()}>
                      <div className='flex gap-2'>
                        <Button
                          variant='ghost'
                          size='sm'
                          onClick={() => {
                            setSelectedInvitation(invitation);
                            setDetailsDialogOpen(true);
                          }}
                        >
                          <Eye className='mr-1 h-4 w-4' />
                          {t('details')}
                        </Button>
                        {invitation.status !== 'accepted' && (
                          <Button
                            variant='outline'
                            size='sm'
                            onClick={() => handleResend(invitation.id)}
                          >
                            <RefreshCw className='mr-1 h-4 w-4' />
                            {t('resend')}
                          </Button>
                        )}
                        {invitation.status !== 'accepted' && (
                          <Button
                            variant='destructive'
                            size='sm'
                            onClick={() => {
                              setSelectedInvitation(invitation);
                              setDeleteDialogOpen(true);
                            }}
                          >
                            <Trash2 className='mr-1 h-4 w-4' />
                            {t('delete')}
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <InviteDialog
        open={showInviteDialog}
        onOpenChange={setShowInviteDialog}
        onSuccess={fetchInvitations}
      />

      <InvitationDetailsDialog
        open={detailsDialogOpen}
        onOpenChange={setDetailsDialogOpen}
        invitation={selectedInvitation}
      />

      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('delete_confirm_title')}</AlertDialogTitle>
            <AlertDialogDescription>
              {t('delete_confirm_desc')}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('cancel')}</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete}>
              {t('delete')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
