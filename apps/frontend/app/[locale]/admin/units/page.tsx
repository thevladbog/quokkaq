'use client';

import { useState } from 'react';
import { useUnits, useCreateUnit } from '@/lib/hooks';
import PermissionGuard from '@/components/auth/permission-guard';
import { Plus } from 'lucide-react';
import { useTranslations } from 'next-intl';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useAuthContext } from '@/contexts/AuthContext';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog';
import { useRouter } from '@/src/i18n/navigation';
import { toast } from 'sonner';

export default function UnitsIndexPage() {
  const { data: units = [], isLoading } = useUnits();
  const createUnitMutation = useCreateUnit();
  const t = useTranslations('admin');
  const router = useRouter();
  const { user } = useAuthContext();
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [newUnitName, setNewUnitName] = useState('');
  const [newUnitCode, setNewUnitCode] = useState('');

  const handleCreateUnit = async () => {
    // Try to get companyId from user's existing units
    const companyId = user?.units?.[0]?.unit?.companyId || '';

    try {
      await createUnitMutation.mutateAsync({
        name: newUnitName,
        code: newUnitCode,
        companyId: companyId
      });
      setCreateDialogOpen(false);
      setNewUnitName('');
      setNewUnitCode('');
      toast.success(t('units.create_success'));
    } catch (error) {
      console.error('Failed to create unit:', error);
      const message = error instanceof Error ? error.message : String(error);
      toast.error(t('units.create_error', { message }));
    }
  };

  if (isLoading) {
    return <div className='container mx-auto p-4'>{t('units.loading')}</div>;
  }

  return (
    <div className='container mx-auto p-4'>
      <div className='mb-6 flex items-center justify-between'>
        <h1 className='text-3xl font-bold'>
          {t('units.title', { defaultValue: 'Units' })}
        </h1>
        <PermissionGuard permissions={['UNIT_CREATE']}>
          <Button onClick={() => setCreateDialogOpen(true)}>
            <Plus className='mr-2 h-4 w-4' />
            {t('units.add')}
          </Button>
        </PermissionGuard>
      </div>

      <div className='grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3'>
        {units.map((unit) => (
          <Card
            key={unit.id}
            className='hover:bg-accent cursor-pointer transition-colors'
            onClick={() => router.push(`/admin/units/${unit.id}`)}
          >
            <CardHeader>
              <CardTitle>{unit.name}</CardTitle>
              <CardDescription>{unit.code}</CardDescription>
            </CardHeader>
            <CardContent>
              <Button variant='outline' className='w-full'>
                {t('general.view', { defaultValue: 'View Details' })}
              </Button>
            </CardContent>
          </Card>
        ))}

        {units.length === 0 && (
          <div className='text-muted-foreground col-span-full py-8 text-center'>
            {t('units.no_units')}
          </div>
        )}
      </div>

      <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
        <DialogContent className='sm:max-w-[425px]'>
          <DialogHeader>
            <DialogTitle>{t('units.create_title')}</DialogTitle>
            <DialogDescription>{t('units.create_desc')}</DialogDescription>
          </DialogHeader>
          <div className='grid gap-4 py-4'>
            <div className='space-y-2'>
              <Label htmlFor='name'>{t('units.name')}</Label>
              <Input
                id='name'
                value={newUnitName}
                onChange={(e) => setNewUnitName(e.target.value)}
                placeholder={t('units.name_placeholder')}
              />
            </div>
            <div className='space-y-2'>
              <Label htmlFor='code'>{t('units.code')}</Label>
              <Input
                id='code'
                value={newUnitCode}
                onChange={(e) => setNewUnitCode(e.target.value)}
                placeholder={t('units.code_placeholder')}
              />
            </div>
            {/* 
                        <div className="space-y-2">
                            <Label htmlFor="companyId">Company ID</Label>
                            <Input
                                id="companyId"
                                value={newUnitCompanyId}
                                onChange={(e) => setNewUnitCompanyId(e.target.value)}
                                placeholder="Company ID"
                            />
                        </div> 
                        */}
          </div>
          <DialogFooter>
            <Button
              variant='outline'
              onClick={() => setCreateDialogOpen(false)}
            >
              {t('general.cancel')}
            </Button>
            <Button
              onClick={handleCreateUnit}
              disabled={createUnitMutation.isPending}
            >
              {createUnitMutation.isPending
                ? t('general.creating')
                : t('units.add')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
