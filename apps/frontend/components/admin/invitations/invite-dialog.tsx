'use client';

import { useState, useEffect } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { toast } from 'sonner';
import { useUnits } from '@/lib/hooks';
import { isQuotaExceededError } from '@/lib/quota-error';
import {
  PermAccessStaffPanel,
  permissionListMessageKey,
  unitPermissionVariants,
  userUnitPermissionMatches
} from '@/lib/permission-variants';
import { UNIT_PERMISSIONS } from '@/lib/unit-permissions';
import { getUnitDisplayName } from '@/lib/unit-display';

interface Template {
  id: string;
  name: string;
  subject: string;
  content: string;
}

interface InviteDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
}

const AVAILABLE_ROLES = ['staff', 'supervisor'];

export default function InviteDialog({
  open,
  onOpenChange,
  onSuccess
}: InviteDialogProps) {
  const t = useTranslations('invitations');
  const tTemplates = useTranslations('templates');
  const tPermissions = useTranslations('admin.users.permissions_list');
  const tAdmin = useTranslations('admin');
  const locale = useLocale();
  const [email, setEmail] = useState('');
  const [templates, setTemplates] = useState<Template[]>([]);
  const [selectedTemplate, setSelectedTemplate] = useState<string>('');
  const [customSubject, setCustomSubject] = useState('');
  const [customContent, setCustomContent] = useState('');
  const [loading, setLoading] = useState(false);

  // New state for permissions
  const [selectedRoles, setSelectedRoles] = useState<string[]>([]);
  const [selectedUnits, setSelectedUnits] = useState<string[]>([]);
  const [unitPermissions, setUnitPermissions] = useState<
    Record<string, string[]>
  >({});

  const { data: units } = useUnits();

  useEffect(() => {
    if (open) {
      fetchTemplates();
    }
  }, [open]);

  const fetchTemplates = async () => {
    try {
      const response = await fetch('/api/templates', {
        headers: {
          Authorization: `Bearer ${localStorage.getItem('access_token')}`
        }
      });
      if (response.ok) {
        const data = await response.json();
        setTemplates(data);
      }
    } catch (error) {
      console.error('Error fetching templates:', error);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      const body: {
        email: string;
        templateId?: string;
        customSubject?: string;
        customContent?: string;
        targetRoles?: string[];
        targetUnits?: { unitId: string; permissions: string[] }[];
      } = { email };

      if (selectedTemplate) {
        body.templateId = selectedTemplate;
      } else if (customSubject && customContent) {
        body.customSubject = customSubject;
        body.customContent = customContent;
      }

      // Add permissions
      if (selectedRoles.length > 0) {
        body.targetRoles = selectedRoles;
      }
      if (selectedUnits.length > 0) {
        body.targetUnits = selectedUnits.map((unitId) => ({
          unitId,
          permissions: unitPermissions[unitId] || []
        }));
      }

      const response = await fetch('/api/invitations', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${localStorage.getItem('access_token')}`
        },
        body: JSON.stringify(body)
      });

      if (response.ok) {
        toast.success(t('invitation_sent'));
        onSuccess();
        onOpenChange(false);
        resetForm();
      } else if (response.status === 402) {
        toast.error(tAdmin('units.quota_exceeded_user'));
      } else {
        const error = await response.json();
        toast.error(error.message || t('error_sending'));
      }
    } catch (err) {
      if (isQuotaExceededError(err)) {
        toast.error(tAdmin('units.quota_exceeded_user'));
      } else {
        toast.error(t('error_sending'));
      }
    } finally {
      setLoading(false);
    }
  };

  const resetForm = () => {
    setEmail('');
    setSelectedTemplate('');
    setCustomSubject('');
    setCustomContent('');
    setSelectedRoles([]);
    setSelectedUnits([]);
    setUnitPermissions({});
  };

  const toggleRole = (role: string) => {
    setSelectedRoles((prev) =>
      prev.includes(role) ? prev.filter((r) => r !== role) : [...prev, role]
    );
  };

  const toggleUnit = (unitId: string) => {
    setSelectedUnits((prev) => {
      const isSelected = prev.includes(unitId);
      if (isSelected) {
        // Remove unit and its permissions
        const newPermissions = { ...unitPermissions };
        delete newPermissions[unitId];
        setUnitPermissions(newPermissions);
        return prev.filter((id) => id !== unitId);
      } else {
        // Add unit with default permissions
        setUnitPermissions((prevPerms) => ({
          ...prevPerms,
          [unitId]: [PermAccessStaffPanel]
        }));
        return [...prev, unitId];
      }
    });
  };

  const toggleUnitPermission = (unitId: string, permission: string) => {
    setUnitPermissions((prev) => {
      const current = prev[unitId] || [];
      const variants = new Set(unitPermissionVariants(permission));
      const has = current.some((p) => variants.has(p));
      const updated = has
        ? current.filter((p) => !variants.has(p))
        : [...current, permission];
      return { ...prev, [unitId]: updated };
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className='max-h-[90vh] overflow-y-auto sm:max-w-[600px]'>
        <DialogHeader>
          <DialogTitle>{t('send_invitation')}</DialogTitle>
          <DialogDescription>{t('description')}</DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className='space-y-4'>
          <div>
            <Label htmlFor='email' className='mb-2 block'>
              {t('email')}
            </Label>
            <Input
              id='email'
              type='email'
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder={t('email_placeholder')}
              required
            />
          </div>

          {/* Roles Selection */}
          <div>
            <Label className='mb-2 block'>
              {t('roles', { defaultValue: 'Roles' })}
            </Label>
            <div className='flex flex-wrap gap-4'>
              {AVAILABLE_ROLES.map((role) => (
                <div key={role} className='flex items-center space-x-2'>
                  <Checkbox
                    id={`role-${role}`}
                    checked={selectedRoles.includes(role)}
                    onCheckedChange={() => toggleRole(role)}
                  />
                  <Label
                    htmlFor={`role-${role}`}
                    className='cursor-pointer capitalize'
                  >
                    {role}
                  </Label>
                </div>
              ))}
            </div>
          </div>

          {/* Units Selection */}
          {units && units.length > 0 && (
            <div>
              <Label className='mb-2 block'>
                {t('units_and_permissions', {
                  defaultValue: 'Units & Permissions'
                })}
              </Label>
              <div className='max-h-60 space-y-4 overflow-y-auto rounded-md border p-4'>
                {units.map((unit) => (
                  <div key={unit.id} className='space-y-2'>
                    <div className='flex items-center space-x-2'>
                      <Checkbox
                        id={`unit-${unit.id}`}
                        checked={selectedUnits.includes(unit.id)}
                        onCheckedChange={() => toggleUnit(unit.id)}
                      />
                      <Label
                        htmlFor={`unit-${unit.id}`}
                        className='cursor-pointer font-medium'
                      >
                        {getUnitDisplayName(unit, locale)}
                      </Label>
                    </div>

                    {selectedUnits.includes(unit.id) && (
                      <div className='ml-6 grid grid-cols-1 gap-2'>
                        {UNIT_PERMISSIONS.map((perm) => (
                          <div
                            key={perm.id}
                            className='flex items-center space-x-2'
                          >
                            <Checkbox
                              id={`unit-${unit.id}-${perm.id}`}
                              checked={userUnitPermissionMatches(
                                unitPermissions[unit.id] || [],
                                perm.id
                              )}
                              onCheckedChange={() =>
                                toggleUnitPermission(unit.id, perm.id)
                              }
                            />
                            <Label
                              htmlFor={`unit-${unit.id}-${perm.id}`}
                              className='cursor-pointer text-sm font-normal'
                            >
                              {tPermissions(permissionListMessageKey(perm.id))}
                            </Label>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          <div>
            <Label htmlFor='template' className='mb-2 block'>
              {t('select_template')}
            </Label>
            <Select
              value={selectedTemplate}
              onValueChange={setSelectedTemplate}
            >
              <SelectTrigger>
                <SelectValue placeholder={t('default_template')} />
              </SelectTrigger>
              <SelectContent>
                {templates.map((template) => (
                  <SelectItem key={template.id} value={template.id}>
                    {template.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {!selectedTemplate && (
            <>
              <div>
                <Label htmlFor='subject' className='mb-2 block'>
                  {t('subject')}
                </Label>
                <Input
                  id='subject'
                  value={customSubject}
                  onChange={(e) => setCustomSubject(e.target.value)}
                  placeholder={t('subject')}
                />
              </div>

              <div>
                <Label htmlFor='message' className='mb-2 block'>
                  {t('message')}
                </Label>
                <Textarea
                  id='message'
                  value={customContent}
                  onChange={(e) => setCustomContent(e.target.value)}
                  placeholder={t('message')}
                  rows={6}
                />
                <p className='text-muted-foreground mt-1 text-sm'>
                  {tTemplates('variables_help', {
                    link: '{link}',
                    email: '{email}'
                  })}
                </p>
              </div>
            </>
          )}

          <div className='flex justify-end gap-2'>
            <Button
              type='button'
              variant='outline'
              onClick={() => onOpenChange(false)}
            >
              {t('cancel')}
            </Button>
            <Button type='submit' disabled={loading}>
              {loading ? t('sending') : t('send')}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
