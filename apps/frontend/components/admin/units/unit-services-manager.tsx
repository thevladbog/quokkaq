'use client';

import { useState } from 'react';
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
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select';
import {
  useUnits,
  useUnitServices,
  useCreateService,
  useUpdateService,
  useDeleteService
} from '@/lib/hooks';
import { useTranslations, useLocale } from 'next-intl';
import { ImageUpload } from '@/components/ui/image-upload';

interface Service {
  id: string;
  name: string;
  nameRu?: string | null;
  nameEn?: string | null;
  description?: string | null;
  descriptionRu?: string | null;
  descriptionEn?: string | null;
  imageUrl?: string | null;
  backgroundColor?: string | null;
  textColor?: string | null;
  prefix?: string | null;
  numberSequence?: string | null;
  duration?: number | null; // Maximum service time in seconds
  maxWaitingTime?: number | null; // Maximum waiting time in seconds
  prebook?: boolean;
  isLeaf?: boolean;
  unitId: string;
  parentId?: string | null;
  parent?: Service | null;
  children?: Service[];
}

interface UnitServicesManagerProps {
  unitId: string;
}

export function UnitServicesManager({ unitId }: UnitServicesManagerProps) {
  const [selectedUnitId] = useState<string>(unitId);

  const { data: units = [] } = useUnits();
  const {
    data: services = [],
    isLoading: servicesLoading,
    refetch
  } = useUnitServices(selectedUnitId);

  const [editingService, setEditingService] = useState<Service | null>(null);
  const [isCreating, setIsCreating] = useState(false);

  const deleteServiceMutation = useDeleteService();

  const t = useTranslations('admin');
  const tRoot = useTranslations();
  const locale = useLocale();

  const handleEdit = (service: Service) => {
    setEditingService(service);
    setIsCreating(false);
  };

  const handleDelete = async (serviceId: string) => {
    if (
      confirm(
        t('services.delete_confirm', {
          defaultValue: 'Are you sure you want to delete this service?'
        })
      )
    ) {
      try {
        await deleteServiceMutation.mutateAsync({ id: serviceId });
        refetch();
      } catch (error) {
        console.error('Error deleting service:', error);
      }
    }
  };

  const handleCancel = () => {
    setEditingService(null);
    setIsCreating(false);
  };

  const selectedUnit = units.find((unit) => unit.id === selectedUnitId);

  const getLocalizedName = (service: Service) => {
    if (locale === 'ru' && service.nameRu) {
      return service.nameRu;
    }
    return service.name;
  };

  return (
    <div className='container mx-auto p-4'>
      <div className='grid grid-cols-1 gap-6 lg:grid-cols-3'>
        {/* Services List */}
        <Card className='lg:col-span-2'>
          <CardHeader>
            <CardTitle>{t('services.title')}</CardTitle>
            <CardDescription>
              {t('services.description', {
                unit: selectedUnit?.name || 'selected unit'
              })}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className='mb-4'>
              <Button
                onClick={() => {
                  setIsCreating(true);
                  setEditingService(null);
                }}
              >
                {t('services.add_new')}
              </Button>
            </div>

            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t('services.name')}</TableHead>
                  <TableHead>{t('services.ticket_prefix')}</TableHead>
                  <TableHead>{t('services.duration_short')}</TableHead>
                  <TableHead>{t('services.is_leaf_short')}</TableHead>
                  <TableHead>{t('services.actions')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {servicesLoading ? (
                  <TableRow>
                    <TableCell colSpan={5} className='text-center'>
                      {t('services.loading', {
                        defaultValue: 'Loading services...'
                      })}
                    </TableCell>
                  </TableRow>
                ) : services.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} className='text-center'>
                      {t('services.no_services_found', {
                        defaultValue: 'No services found'
                      })}
                    </TableCell>
                  </TableRow>
                ) : (
                  services.map((service) => (
                    <TableRow key={service.id}>
                      <TableCell className='font-medium'>
                        {getLocalizedName(service)}
                      </TableCell>
                      <TableCell>{service.prefix || '-'}</TableCell>
                      <TableCell>
                        {service.duration
                          ? `${Math.floor(service.duration / 60)}m ${service.duration % 60}s`
                          : '-'}
                      </TableCell>
                      <TableCell>
                        {service.isLeaf
                          ? tRoot('general.yes')
                          : tRoot('general.no')}
                      </TableCell>
                      <TableCell>
                        <div className='flex space-x-2'>
                          <Button
                            variant='outline'
                            size='sm'
                            onClick={() =>
                              handleEdit(service as unknown as Service)
                            }
                          >
                            {t('services.edit')}
                          </Button>
                          <Button
                            variant='destructive'
                            size='sm'
                            onClick={() => handleDelete(service.id)}
                          >
                            {tRoot('general.delete', {
                              defaultValue: 'Delete'
                            })}
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        {/* Service Form */}
        <Card>
          <CardHeader>
            <CardTitle>
              {editingService
                ? t('services.edit')
                : isCreating
                  ? t('services.add_new')
                  : t('services.title')}
            </CardTitle>
            <CardDescription>
              {editingService
                ? t('services.editing_desc', {
                    name: editingService.name,
                    defaultValue: `Editing service: ${editingService.name}`
                  })
                : isCreating
                  ? t('services.creating_desc', {
                      defaultValue: 'Create a new service'
                    })
                  : t('services.select_desc', {
                      defaultValue:
                        'Select a service to edit or create a new one'
                    })}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {(editingService || isCreating) && (
              <ServiceForm
                editingService={editingService}
                isCreating={isCreating}
                selectedUnitId={selectedUnitId}
                services={services}
                onCancel={handleCancel}
                onSaved={() => {
                  setEditingService(null);
                  setIsCreating(false);
                  refetch();
                }}
              />
            )}

            {!editingService && !isCreating && (
              <div className='text-muted-foreground py-8 text-center'>
                {t('services.select_to_edit_or_click_add', {
                  defaultValue:
                    'Select a service to edit or click "Add New Service"'
                })}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function ServiceForm({
  editingService,
  selectedUnitId,
  services,
  onCancel,
  onSaved
}: {
  editingService: Service | null;
  isCreating: boolean;
  selectedUnitId: string;
  services: Service[];
  onCancel: () => void;
  onSaved: () => void;
}) {
  const t = useTranslations('admin');
  const tRoot = useTranslations();
  const createServiceMutation = useCreateService();
  const updateServiceMutation = useUpdateService();

  const [formValues, setFormValues] = useState<Partial<Service>>(() => {
    if (editingService) {
      return {
        name: editingService.name,
        nameRu: editingService.nameRu,
        nameEn: editingService.nameEn,
        description: editingService.description,
        descriptionRu: editingService.descriptionRu,
        descriptionEn: editingService.descriptionEn,
        imageUrl: editingService.imageUrl,
        backgroundColor: editingService.backgroundColor,
        textColor: editingService.textColor,
        prefix: editingService.prefix,
        duration: editingService.duration,
        maxWaitingTime: editingService.maxWaitingTime,
        prebook: editingService.prebook,
        isLeaf: editingService.isLeaf,
        parentId: editingService.parentId
      };
    } else {
      return {
        name: '',
        nameRu: '',
        nameEn: '',
        description: '',
        descriptionRu: '',
        descriptionEn: '',
        imageUrl: '',
        backgroundColor: '',
        textColor: '',
        prefix: '',
        duration: undefined,
        maxWaitingTime: undefined,
        prebook: false,
        isLeaf: false,
        parentId: ''
      };
    }
  });

  const handleInputChange = (
    e: React.ChangeEvent<
      HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement
    >
  ) => {
    const { name, value, type } = e.target;
    const val =
      type === 'checkbox' ? (e.target as HTMLInputElement).checked : value;

    setFormValues((prev) => ({
      ...prev,
      [name]: val
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!selectedUnitId) return;

    try {
      if (editingService) {
        await updateServiceMutation.mutateAsync({
          id: editingService.id,
          ...formValues,
          name: formValues.name || editingService.name,
          prebook: formValues.prebook ?? editingService.prebook ?? false,
          isLeaf: formValues.isLeaf ?? editingService.isLeaf ?? false
        });
      } else {
        if (!formValues.name) return;
        await createServiceMutation.mutateAsync({
          ...formValues,
          name: formValues.name,
          unitId: selectedUnitId,
          prebook: formValues.prebook ?? false,
          isLeaf: formValues.isLeaf ?? false
        });
      }
      onSaved();
    } catch (error) {
      console.error('Error saving service:', error);
    }
  };

  return (
    <form onSubmit={handleSubmit} className='space-y-4'>
      <div className='space-y-2'>
        <Label htmlFor='name'>{t('services.name')} (EN) *</Label>
        <Input
          id='name'
          name='name'
          value={formValues.name || ''}
          onChange={handleInputChange}
          required
        />
      </div>

      <div className='space-y-2'>
        <Label htmlFor='nameRu'>{tRoot('forms.fields.name_ru')}</Label>
        <Input
          id='nameRu'
          name='nameRu'
          value={formValues.nameRu || ''}
          onChange={handleInputChange}
        />
      </div>

      <div className='space-y-2'>
        <Label htmlFor='description'>{tRoot('forms.fields.desc_en')}</Label>
        <Input
          id='description'
          name='description'
          value={formValues.description || ''}
          onChange={handleInputChange}
        />
      </div>

      <div className='space-y-2'>
        <Label htmlFor='descriptionRu'>{tRoot('forms.fields.desc_ru')}</Label>
        <Input
          id='descriptionRu'
          name='descriptionRu'
          value={formValues.descriptionRu || ''}
          onChange={handleInputChange}
        />
      </div>

      <div className='space-y-2'>
        <ImageUpload
          label={tRoot('forms.fields.image_url')}
          value={formValues.imageUrl}
          onChange={(url) =>
            setFormValues((prev) => ({ ...prev, imageUrl: url }))
          }
          onRemove={() => setFormValues((prev) => ({ ...prev, imageUrl: '' }))}
        />
      </div>

      <div className='grid grid-cols-2 gap-4'>
        <div className='space-y-2'>
          <Label htmlFor='backgroundColor'>
            {tRoot('forms.fields.bg_color')}
          </Label>
          <Input
            id='backgroundColor'
            name='backgroundColor'
            type='color'
            value={formValues.backgroundColor || '#000000'}
            onChange={handleInputChange}
          />
        </div>

        <div className='space-y-2'>
          <Label htmlFor='textColor'>{tRoot('forms.fields.text_color')}</Label>
          <Input
            id='textColor'
            name='textColor'
            type='color'
            value={formValues.textColor || '#000000'}
            onChange={handleInputChange}
          />
        </div>
      </div>

      <div className='space-y-2'>
        <Label htmlFor='prefix'>{tRoot('forms.fields.prefix')}</Label>
        <Input
          id='prefix'
          name='prefix'
          value={formValues.prefix || ''}
          onChange={handleInputChange}
        />
      </div>

      <div className='space-y-2'>
        <Label htmlFor='parentId'>{tRoot('forms.fields.parent_service')}</Label>
        <Select
          value={formValues.parentId || 'none'}
          onValueChange={(value) =>
            setFormValues((prev) => ({
              ...prev,
              parentId: value === 'none' ? '' : value
            }))
          }
        >
          <SelectTrigger className='w-full'>
            <SelectValue placeholder={tRoot('forms.fields.no_parent')} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value='none'>
              {tRoot('forms.fields.no_parent')}
            </SelectItem>
            {services
              .filter((s) => s.id !== editingService?.id && !s.isLeaf) // Don't show current service as option
              .map((service) => (
                <SelectItem key={service.id} value={service.id}>
                  {service.name}{' '}
                  {service.parentId
                    ? `(${tRoot('forms.fields.child_of', { defaultValue: 'child of' })} ${services.find((s) => s.id === service.parentId)?.name})`
                    : ''}
                </SelectItem>
              ))}
          </SelectContent>
        </Select>
      </div>

      <div className='space-y-2'>
        <Label htmlFor='duration'>{tRoot('forms.fields.max_duration')}</Label>
        <div className='flex items-end gap-2'>
          <div className='flex-1'>
            <Label
              htmlFor='duration_minutes'
              className='text-muted-foreground text-xs'
            >
              {tRoot('forms.fields.minutes', { defaultValue: 'Minutes' })}
            </Label>
            <Input
              id='duration_minutes'
              type='number'
              min='0'
              value={
                formValues.duration
                  ? Math.floor((formValues.duration || 0) / 60)
                  : 0
              }
              onChange={(e) => {
                const mins = parseInt(e.target.value) || 0;
                const secs = (formValues.duration || 0) % 60;
                setFormValues((prev) => ({
                  ...prev,
                  duration: mins * 60 + secs
                }));
              }}
            />
          </div>
          <div className='flex-1'>
            <Label
              htmlFor='duration_seconds'
              className='text-muted-foreground text-xs'
            >
              {tRoot('forms.fields.seconds', { defaultValue: 'Seconds' })}
            </Label>
            <Input
              id='duration_seconds'
              type='number'
              min='0'
              max='59'
              value={formValues.duration ? (formValues.duration || 0) % 60 : 0}
              onChange={(e) => {
                const secs = parseInt(e.target.value) || 0;
                const mins = Math.floor((formValues.duration || 0) / 60);
                setFormValues((prev) => ({
                  ...prev,
                  duration: mins * 60 + secs
                }));
              }}
            />
          </div>
          <Button
            type='button'
            variant='outline'
            onClick={() =>
              setFormValues((prev) => ({ ...prev, duration: undefined }))
            }
            disabled={
              formValues.duration === undefined || formValues.duration === 0
            }
          >
            {tRoot('general.clear', { defaultValue: 'Clear' })}
          </Button>
        </div>
        <p className='text-muted-foreground text-xs'>
          {tRoot('forms.fields.total', { defaultValue: 'Total' })}:{' '}
          {formValues.duration || 0}{' '}
          {tRoot('forms.fields.seconds', { defaultValue: 'seconds' })}
        </p>
      </div>

      <div className='space-y-2'>
        <Label htmlFor='maxWaitingTime'>
          {tRoot('forms.fields.max_waiting_time')}
        </Label>
        <div className='flex items-end gap-2'>
          <div className='flex-1'>
            <Label
              htmlFor='mwt_minutes'
              className='text-muted-foreground text-xs'
            >
              {tRoot('forms.fields.minutes', { defaultValue: 'Minutes' })}
            </Label>
            <Input
              id='mwt_minutes'
              type='number'
              min='0'
              value={
                formValues.maxWaitingTime
                  ? Math.floor(formValues.maxWaitingTime / 60)
                  : 0
              }
              onChange={(e) => {
                const mins = parseInt(e.target.value) || 0;
                const secs = (formValues.maxWaitingTime || 0) % 60;
                setFormValues((prev) => ({
                  ...prev,
                  maxWaitingTime: mins * 60 + secs
                }));
              }}
            />
          </div>
          <div className='flex-1'>
            <Label
              htmlFor='mwt_seconds'
              className='text-muted-foreground text-xs'
            >
              {tRoot('forms.fields.seconds', { defaultValue: 'Seconds' })}
            </Label>
            <Input
              id='mwt_seconds'
              type='number'
              min='0'
              max='59'
              value={
                formValues.maxWaitingTime ? formValues.maxWaitingTime % 60 : 0
              }
              onChange={(e) => {
                const secs = parseInt(e.target.value) || 0;
                const mins = Math.floor((formValues.maxWaitingTime || 0) / 60);
                setFormValues((prev) => ({
                  ...prev,
                  maxWaitingTime: mins * 60 + secs
                }));
              }}
            />
          </div>
          <Button
            type='button'
            variant='outline'
            onClick={() =>
              setFormValues((prev) => ({ ...prev, maxWaitingTime: undefined }))
            }
            disabled={
              formValues.maxWaitingTime === undefined ||
              formValues.maxWaitingTime === 0
            }
          >
            {tRoot('general.clear', { defaultValue: 'Clear' })}
          </Button>
        </div>
        <p className='text-muted-foreground text-xs'>
          {tRoot('forms.fields.total', { defaultValue: 'Total' })}:{' '}
          {formValues.maxWaitingTime || 0}{' '}
          {tRoot('forms.fields.seconds', { defaultValue: 'seconds' })}
        </p>
      </div>

      <div className='space-y-2'>
        <div className='flex items-center'>
          <input
            id='prebook'
            name='prebook'
            type='checkbox'
            checked={!!formValues.prebook}
            onChange={handleInputChange}
            className='mr-2'
          />
          <Label htmlFor='prebook'>
            {tRoot('forms.fields.allow_prebooking')}
          </Label>
        </div>

        <div className='flex items-center'>
          <input
            id='isLeaf'
            name='isLeaf'
            type='checkbox'
            checked={!!formValues.isLeaf}
            onChange={handleInputChange}
            className='mr-2'
          />
          <Label htmlFor='isLeaf'>{tRoot('forms.fields.is_leaf')}</Label>
        </div>
      </div>

      <div className='flex space-x-2 pt-4'>
        <Button
          type='submit'
          disabled={
            createServiceMutation.isPending || updateServiceMutation.isPending
          }
        >
          {createServiceMutation.isPending || updateServiceMutation.isPending
            ? tRoot('common.loading', { defaultValue: 'Saving...' })
            : editingService
              ? tRoot('general.update', { defaultValue: 'Update' })
              : tRoot('general.create', { defaultValue: 'Create' })}
        </Button>
        <Button type='button' variant='outline' onClick={onCancel}>
          {tRoot('general.cancel', { defaultValue: 'Cancel' })}
        </Button>
      </div>
    </form>
  );
}
