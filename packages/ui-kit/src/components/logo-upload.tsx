'use client';

import { useState, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Upload, X, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import Image from 'next/image';
import { logger } from '@/lib/logger';

interface LogoUploadProps {
  currentLogoUrl?: string;
  onLogoUploaded: (url: string) => void;
  onLogoRemoved: () => void;
  label?: string;
}

export function LogoUpload({
  currentLogoUrl,
  onLogoUploaded,
  onLogoRemoved,
  label = 'Logo'
}: LogoUploadProps) {
  const [isUploading, setIsUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validate file type
    if (!file.type.startsWith('image/')) {
      toast.error('Please upload an image file');
      return;
    }

    // Validate file size (5MB)
    if (file.size > 5 * 1024 * 1024) {
      toast.error('File size must be less than 5MB');
      return;
    }

    setIsUploading(true);
    const formData = new FormData();
    formData.append('file', file);

    try {
      const token =
        typeof window !== 'undefined'
          ? localStorage.getItem('access_token')
          : null;
      const response = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL}/upload`,
        {
          method: 'POST',
          body: formData,
          headers: token ? { Authorization: `Bearer ${token}` } : undefined
        }
      );

      if (!response.ok) {
        throw new Error('Upload failed');
      }

      const data = await response.json();
      onLogoUploaded(data.url);
      toast.success('Logo uploaded successfully');
    } catch (error) {
      logger.error('Upload error:', error);
      toast.error('Failed to upload logo');
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  return (
    <div className='space-y-2'>
      <Label>{label}</Label>
      <div className='flex items-center gap-4'>
        {currentLogoUrl ? (
          <div className='bg-muted/50 relative flex h-20 w-20 items-center justify-center overflow-hidden rounded-md border'>
            <Image
              src={currentLogoUrl}
              alt='Logo'
              fill
              unoptimized
              className='object-contain p-1'
            />
            <Button
              variant='destructive'
              size='icon'
              className='absolute top-0 right-0 h-5 w-5 rounded-tr-none rounded-bl-md'
              onClick={onLogoRemoved}
            >
              <X className='h-3 w-3' />
            </Button>
          </div>
        ) : (
          <div className='bg-muted/20 text-muted-foreground flex h-20 w-20 items-center justify-center rounded-md border border-dashed'>
            <Upload className='h-8 w-8 opacity-50' />
          </div>
        )}

        <div className='flex-1'>
          <Input
            ref={fileInputRef}
            type='file'
            accept='image/*'
            className='hidden'
            onChange={handleFileChange}
            id='logo-upload'
          />
          <Button
            variant='outline'
            disabled={isUploading}
            onClick={() => fileInputRef.current?.click()}
            className='w-full sm:w-auto'
          >
            {isUploading ? (
              <>
                <Loader2 className='mr-2 h-4 w-4 animate-spin' />
                Uploading...
              </>
            ) : (
              <>
                <Upload className='mr-2 h-4 w-4' />
                {currentLogoUrl ? 'Change Logo' : 'Upload Logo'}
              </>
            )}
          </Button>
          <p className='text-muted-foreground mt-1 text-xs'>
            Supported formats: JPG, PNG, SVG, WebP. Max 5MB.
          </p>
        </div>
      </div>
    </div>
  );
}
