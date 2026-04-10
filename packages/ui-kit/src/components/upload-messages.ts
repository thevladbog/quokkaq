/** Shared i18n shape for image-style file uploads (logo / generic image). */
export type UploadMessages = {
  invalidType: string;
  fileTooLarge: string;
  uploading: string;
  hint: string;
  success: string;
  failed: string;
  upload: string;
  change: string;
  defaultLabel: string;
};

const sharedUploadStrings: Pick<
  UploadMessages,
  'invalidType' | 'fileTooLarge' | 'uploading' | 'hint'
> = {
  invalidType: 'Please upload an image file',
  fileTooLarge: 'File size must be less than 5MB',
  uploading: 'Uploading...',
  hint: 'Supported formats: JPG, PNG, SVG, WebP. Max 5MB.'
};

export const defaultLogoUploadMessages: UploadMessages = {
  ...sharedUploadStrings,
  success: 'Logo uploaded successfully',
  failed: 'Failed to upload logo',
  upload: 'Upload Logo',
  change: 'Change Logo',
  defaultLabel: 'Logo'
};

export const defaultImageUploadMessages: UploadMessages = {
  ...sharedUploadStrings,
  success: 'Image uploaded successfully',
  failed: 'Failed to upload image',
  upload: 'Upload Image',
  change: 'Change Image',
  defaultLabel: 'Image'
};

export type LogoUploadMessages = UploadMessages;
export type ImageUploadMessages = UploadMessages;
