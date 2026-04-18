'use client';

import { useState, useEffect } from 'react';
import { useTranslations } from 'next-intl';
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
import { Plus, Edit, Trash2 } from 'lucide-react';
import TemplateDialog from '@/components/admin/templates/template-dialog';
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

interface Template {
  id: string;
  name: string;
  subject: string;
  content: string;
  isDefault: boolean;
  createdAt: string;
}

export default function TemplatesPage() {
  const t = useTranslations('templates');
  const [templates, setTemplates] = useState<Template[]>([]);
  const [loading, setLoading] = useState(true);
  const [showTemplateDialog, setShowTemplateDialog] = useState(false);
  const [selectedTemplate, setSelectedTemplate] = useState<Template | null>(
    null
  );
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [templateToDelete, setTemplateToDelete] = useState<Template | null>(
    null
  );

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
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchTemplates();
  }, []);

  const handleEdit = (template: Template) => {
    setSelectedTemplate(template);
    setShowTemplateDialog(true);
  };

  const handleCreate = () => {
    setSelectedTemplate(null);
    setShowTemplateDialog(true);
  };

  const handleDelete = async () => {
    if (!templateToDelete) return;

    try {
      const response = await fetch(`/api/templates/${templateToDelete.id}`, {
        method: 'DELETE',
        headers: {
          Authorization: `Bearer ${localStorage.getItem('access_token')}`
        }
      });

      if (response.ok) {
        toast.success(t('template_deleted'));
        fetchTemplates();
      } else {
        toast.error(t('error_saving'));
      }
    } catch {
      toast.error(t('error_saving'));
    } finally {
      setDeleteDialogOpen(false);
      setTemplateToDelete(null);
    }
  };

  return (
    <div className='container mx-auto p-6'>
      <Card>
        <CardHeader>
          <div className='flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between sm:gap-4'>
            <div className='min-w-0'>
              <CardTitle>{t('title')}</CardTitle>
              <CardDescription>{t('description')}</CardDescription>
            </div>
            <Button
              className='w-full shrink-0 sm:w-auto'
              onClick={handleCreate}
            >
              <Plus className='mr-2 h-4 w-4' />
              {t('create_template')}
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className='py-8 text-center'>{t('name')}</div>
          ) : templates.length === 0 ? (
            <div className='text-muted-foreground py-8 text-center'>
              {t('no_templates')}
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t('name')}</TableHead>
                  <TableHead>{t('subject')}</TableHead>
                  <TableHead>{t('is_default')}</TableHead>
                  <TableHead>{t('actions')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {templates.map((template) => (
                  <TableRow key={template.id}>
                    <TableCell className='font-medium'>
                      {template.name}
                    </TableCell>
                    <TableCell>{template.subject}</TableCell>
                    <TableCell>
                      {template.isDefault && (
                        <Badge variant='secondary'>{t('is_default')}</Badge>
                      )}
                    </TableCell>
                    <TableCell>
                      <div className='flex gap-2'>
                        <Button
                          variant='outline'
                          size='sm'
                          onClick={() => handleEdit(template)}
                        >
                          <Edit className='mr-1 h-4 w-4' />
                          {t('edit')}
                        </Button>
                        <Button
                          variant='destructive'
                          size='sm'
                          onClick={() => {
                            setTemplateToDelete(template);
                            setDeleteDialogOpen(true);
                          }}
                        >
                          <Trash2 className='mr-1 h-4 w-4' />
                          {t('delete')}
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <TemplateDialog
        open={showTemplateDialog}
        onOpenChange={setShowTemplateDialog}
        template={selectedTemplate}
        onSuccess={fetchTemplates}
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
