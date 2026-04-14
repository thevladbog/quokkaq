'use client';

import * as Dialog from '@radix-ui/react-dialog';
import {
  type ChangeEventHandler,
  type DragEventHandler,
  type FormEventHandler,
  startTransition,
  useEffect,
  useId,
  useRef,
  useState
} from 'react';
import { ImageUp } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';

import {
  allowSetImageDimensions$,
  closeImageDialog$,
  imageDialogState$,
  imageUploadHandler$,
  parseImageDimension,
  saveImage$,
  useCellValues,
  usePublisher
} from '@mdxeditor/editor';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';

const ALLOWED_EXT = new Set(['.jpg', '.jpeg', '.png', '.webp', '.svg']);

function fileExt(name: string): string {
  const m = name.toLowerCase().match(/\.[^.]+$/);
  return m?.[0] ?? '';
}

function assignSingleFile(
  file: File,
  input: HTMLInputElement | null,
  setList: (f: FileList | undefined) => void
) {
  const ext = fileExt(file.name);
  if (!ALLOWED_EXT.has(ext)) {
    return false;
  }
  const dt = new DataTransfer();
  dt.items.add(file);
  const list = dt.files;
  setList(list);
  if (input) {
    input.files = list;
  }
  return true;
}

/**
 * Replaces MDXEditor’s default image dialog: normal layout + compact dropzone; upload still runs on Save via imagePlugin.
 */
export function GuestSurveyCompletionImageDialog() {
  const t = useTranslations('admin.guest_survey');
  const [state, imageUploadHandler, allowSetImageDimensions] = useCellValues(
    imageDialogState$,
    imageUploadHandler$,
    allowSetImageDimensions$
  );
  const saveImage = usePublisher(saveImage$);
  const closeImageDialog = usePublisher(closeImageDialog$);

  const [src, setSrc] = useState('');
  const [altText, setAltText] = useState('');
  const [title, setTitle] = useState('');
  const [widthStr, setWidthStr] = useState('');
  const [heightStr, setHeightStr] = useState('');
  const [pickedFiles, setPickedFiles] = useState<FileList | undefined>(
    undefined
  );
  const [dragActive, setDragActive] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const fileInputId = useId();

  useEffect(() => {
    startTransition(() => {
      if (state.type === 'inactive') {
        setSrc('');
        setAltText('');
        setTitle('');
        setWidthStr('');
        setHeightStr('');
        setPickedFiles(undefined);
        setDragActive(false);
        if (fileInputRef.current) {
          fileInputRef.current.value = '';
        }
        return;
      }
      if (state.type === 'editing') {
        const v = state.initialValues;
        setSrc(v.src ?? '');
        setAltText(v.altText ?? '');
        setTitle(v.title ?? '');
        setWidthStr(
          v.width !== undefined && v.width !== null ? String(v.width) : ''
        );
        setHeightStr(
          v.height !== undefined && v.height !== null ? String(v.height) : ''
        );
        setPickedFiles(undefined);
        setDragActive(false);
        if (fileInputRef.current) {
          fileInputRef.current.value = '';
        }
        return;
      }
      if (state.type === 'new') {
        setSrc('');
        setAltText('');
        setTitle('');
        setWidthStr('');
        setHeightStr('');
        setPickedFiles(undefined);
        setDragActive(false);
        if (fileInputRef.current) {
          fileInputRef.current.value = '';
        }
      }
    });
  }, [state]);

  if (state.type === 'inactive') {
    return null;
  }

  const resetForm = () => {
    setSrc('');
    setAltText('');
    setTitle('');
    setWidthStr('');
    setHeightStr('');
    setPickedFiles(undefined);
    setDragActive(false);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const onSubmit: FormEventHandler<HTMLFormElement> = (e) => {
    e.preventDefault();
    e.stopPropagation();

    const hasFile = Boolean(pickedFiles && pickedFiles.length > 0);
    const srcTrim = src.trim();
    if (!hasFile && !srcTrim) {
      toast.error(t('completion_modal_image_need_file_or_url'));
      return;
    }

    saveImage({
      src: srcTrim,
      altText,
      title,
      file: pickedFiles,
      width: allowSetImageDimensions ? parseImageDimension(widthStr) : void 0,
      height: allowSetImageDimensions ? parseImageDimension(heightStr) : void 0
    });
  };

  const onFileChange: ChangeEventHandler<HTMLInputElement> = (e) => {
    const file = e.target.files?.[0];
    if (!file) {
      setPickedFiles(undefined);
      return;
    }
    if (!assignSingleFile(file, fileInputRef.current, setPickedFiles)) {
      toast.error(t('completion_upload_image_type_error'));
      e.target.value = '';
      setPickedFiles(undefined);
    }
  };

  const onDragEnter: DragEventHandler<HTMLDivElement> = (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (!imageUploadHandler) {
      return;
    }
    setDragActive(true);
  };

  const onDragOver: DragEventHandler<HTMLDivElement> = (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (imageUploadHandler) {
      e.dataTransfer.dropEffect = 'copy';
    }
  };

  const onDragLeave: DragEventHandler<HTMLDivElement> = (e) => {
    e.preventDefault();
    e.stopPropagation();
    const next = e.relatedTarget as Node | null;
    if (next && e.currentTarget.contains(next)) {
      return;
    }
    setDragActive(false);
  };

  const onDrop: DragEventHandler<HTMLDivElement> = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    const file = e.dataTransfer.files?.[0];
    if (!file || !imageUploadHandler) {
      return;
    }
    if (!assignSingleFile(file, fileInputRef.current, setPickedFiles)) {
      toast.error(t('completion_upload_image_type_error'));
    }
  };

  return (
    <Dialog.Root
      open
      onOpenChange={(open) => {
        if (!open) {
          closeImageDialog();
          resetForm();
        }
      }}
    >
      <Dialog.Portal>
        <Dialog.Overlay className='data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 fixed inset-0 z-[130] bg-black/50' />
        <Dialog.Content
          className={cn(
            'bg-background data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 fixed top-[50%] left-[50%] z-[130] grid w-[calc(100%-2rem)] max-w-md translate-x-[-50%] translate-y-[-50%] gap-4 rounded-lg border p-6 shadow-lg duration-200'
          )}
          onOpenAutoFocus={(e) => e.preventDefault()}
        >
          <div className='flex flex-col gap-1.5 text-left'>
            <Dialog.Title className='text-lg leading-none font-semibold'>
              {t('completion_modal_image_title')}
            </Dialog.Title>
            <Dialog.Description className='text-muted-foreground text-sm'>
              {t('completion_modal_image_description')}
            </Dialog.Description>
          </div>

          <form className='grid gap-4' onSubmit={onSubmit}>
            {imageUploadHandler !== null ? (
              <div className='grid gap-2'>
                <Label htmlFor={fileInputId} className='sr-only'>
                  {t('completion_modal_image_file_label')}
                </Label>
                <input
                  id={fileInputId}
                  ref={fileInputRef}
                  type='file'
                  accept='image/jpeg,image/png,image/webp,image/svg+xml,.jpg,.jpeg,.png,.webp,.svg'
                  className='sr-only'
                  onChange={onFileChange}
                />
                <div
                  role='button'
                  tabIndex={0}
                  className={cn(
                    'focus-visible:ring-ring flex min-h-[72px] cursor-pointer flex-col items-center justify-center gap-1 rounded-md border-2 border-dashed px-3 py-3 text-center transition-colors outline-none focus-visible:ring-2',
                    dragActive
                      ? 'border-primary bg-primary/5'
                      : 'border-muted-foreground/30 hover:border-muted-foreground/50 hover:bg-muted/30'
                  )}
                  onClick={() => fileInputRef.current?.click()}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      fileInputRef.current?.click();
                    }
                  }}
                  onDragEnter={onDragEnter}
                  onDragOver={onDragOver}
                  onDragLeave={onDragLeave}
                  onDrop={onDrop}
                >
                  <ImageUp
                    className={cn(
                      'size-6',
                      dragActive ? 'text-primary' : 'text-muted-foreground'
                    )}
                    aria-hidden
                  />
                  <span className='text-muted-foreground text-xs'>
                    {dragActive
                      ? t('completion_image_dropzone_active')
                      : pickedFiles && pickedFiles.length > 0
                        ? (pickedFiles[0]?.name ?? '')
                        : t('completion_modal_image_drop_compact')}
                  </span>
                </div>
              </div>
            ) : null}

            <div className='grid gap-2'>
              <Label htmlFor='completion-img-src'>
                {t('completion_modal_image_url_label')}
              </Label>
              <Input
                id='completion-img-src'
                value={src}
                onChange={(e) => setSrc(e.target.value)}
                placeholder='https://'
                autoComplete='off'
              />
            </div>

            <div className='grid gap-2'>
              <Label htmlFor='completion-img-alt'>
                {t('completion_modal_image_alt_label')}
              </Label>
              <Input
                id='completion-img-alt'
                value={altText}
                onChange={(e) => setAltText(e.target.value)}
              />
            </div>

            <div className='grid gap-2'>
              <Label htmlFor='completion-img-title'>
                {t('completion_modal_image_title_label')}
              </Label>
              <Input
                id='completion-img-title'
                value={title}
                onChange={(e) => setTitle(e.target.value)}
              />
            </div>

            {allowSetImageDimensions ? (
              <div className='grid grid-cols-2 gap-3'>
                <div className='grid gap-2'>
                  <Label htmlFor='completion-img-w'>
                    {t('completion_modal_image_width_label')}
                  </Label>
                  <Input
                    id='completion-img-w'
                    type='number'
                    min={0}
                    value={widthStr}
                    onChange={(e) => setWidthStr(e.target.value)}
                  />
                </div>
                <div className='grid gap-2'>
                  <Label htmlFor='completion-img-h'>
                    {t('completion_modal_image_height_label')}
                  </Label>
                  <Input
                    id='completion-img-h'
                    type='number'
                    min={0}
                    value={heightStr}
                    onChange={(e) => setHeightStr(e.target.value)}
                  />
                </div>
              </div>
            ) : null}

            <div className='flex justify-end gap-2 pt-1'>
              <Dialog.Close asChild>
                <Button type='button' variant='outline'>
                  {t('completion_modal_image_cancel')}
                </Button>
              </Dialog.Close>
              <Button type='submit'>{t('completion_modal_image_save')}</Button>
            </div>
          </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
