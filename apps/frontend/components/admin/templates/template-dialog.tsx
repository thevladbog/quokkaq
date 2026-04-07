'use client';

import { useState, useEffect } from 'react';
import { usePathname } from 'next/navigation';
import { useTranslations } from 'next-intl';
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
import { Checkbox } from '@/components/ui/checkbox';
import { toast } from 'sonner';

interface Template {
  id?: string;
  name: string;
  subject: string;
  content: string;
  isDefault: boolean;
}

interface TemplateDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  template: Template | null;
  onSuccess: () => void;
}

export default function TemplateDialog({
  open,
  onOpenChange,
  template,
  onSuccess
}: TemplateDialogProps) {
  const t = useTranslations('templates');
  const pathname = usePathname();
  const [name, setName] = useState('');
  const [subject, setSubject] = useState('');
  const [content, setContent] = useState('');
  const [isDefault, setIsDefault] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (template) {
      setName(template.name);
      setSubject(template.subject);
      setContent(template.content);
      setIsDefault(template.isDefault);
    } else {
      resetForm();
    }
  }, [template, open]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      const token = localStorage.getItem('access_token');
      if (!token) {
        toast.error(t('error_saving'));
        const localeFromPath = pathname?.split('/')[1] || 'en';
        const knownLocales = ['en', 'ru'];
        const loginPath = knownLocales.includes(localeFromPath)
          ? `/${localeFromPath}/login`
          : '/login';
        window.location.href = loginPath;
        return;
      }

      const body = { name, subject, content, isDefault };
      const url = template ? `/api/templates/${template.id}` : '/api/templates';
      const method = template ? 'PATCH' : 'POST';

      const response = await fetch(url, {
        method,
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify(body)
      });

      if (response.ok) {
        toast.success(t('template_saved'));
        onSuccess();
        onOpenChange(false);
        resetForm();
      } else {
        const error = await response.json();
        toast.error(error.message || t('error_saving'));
      }
    } catch {
      toast.error(t('error_saving'));
    } finally {
      setLoading(false);
    }
  };

  const resetForm = () => {
    setName('');
    setSubject('');
    setContent('');
    setIsDefault(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className='max-h-[80vh] overflow-y-auto sm:max-w-[700px]'>
        <DialogHeader>
          <DialogTitle>
            {template ? t('edit') : t('create_template')}
          </DialogTitle>
          <DialogDescription>{t('description')}</DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className='space-y-4'>
          <div>
            <Label htmlFor='name'>{t('name')}</Label>
            <Input
              id='name'
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={t('name')}
              required
            />
          </div>

          <div>
            <Label htmlFor='subject'>{t('subject')}</Label>
            <Input
              id='subject'
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              placeholder={t('subject')}
              required
            />
          </div>

          <div>
            <Label htmlFor='content'>{t('content')}</Label>
            <Textarea
              id='content'
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder={t('content')}
              rows={10}
              required
            />
            <p className='text-muted-foreground mt-1 text-sm'>
              {t('variables_help', { link: '{{link}}', email: '{{email}}' })}
            </p>
          </div>

          <div className='flex items-center space-x-2'>
            <Checkbox
              id='isDefault'
              checked={isDefault}
              onCheckedChange={(checked) => setIsDefault(checked as boolean)}
            />
            <Label htmlFor='isDefault' className='text-sm font-normal'>
              {t('is_default')}
            </Label>
          </div>

          <div className='flex justify-end gap-2'>
            <Button
              type='button'
              variant='outline'
              onClick={() => onOpenChange(false)}
            >
              {t('cancel')}
            </Button>
            <Button type='submit' disabled={loading}>
              {loading ? t('save') + '...' : t('save')}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
