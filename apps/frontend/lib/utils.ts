import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// Function to get localized value based on current locale
export function getLocalizedValue(
  value: string | null | undefined,
  valueRu: string | null | undefined,
  valueEn: string | null | undefined,
  currentLocale: string
): string {
  if (currentLocale === 'ru' && valueRu) {
    return valueRu;
  } else if (currentLocale === 'en' && valueEn) {
    return valueEn;
  }
  // If specific translation is not available, return the default value
  return value || '';
}

// Function to get localized name
export function getLocalizedName(
  name: string,
  nameRu: string | null | undefined,
  nameEn: string | null | undefined,
  currentLocale: string
): string {
  return getLocalizedValue(name, nameRu, nameEn, currentLocale);
}
