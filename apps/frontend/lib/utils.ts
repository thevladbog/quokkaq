import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** next-intl may use `ru`; browsers sometimes use `ru-RU`. */
function primaryLocaleTag(currentLocale: string): string {
  const s = currentLocale.trim().toLowerCase();
  const dash = s.indexOf('-');
  return dash === -1 ? s : s.slice(0, dash);
}

// Function to get localized value based on current locale
export function getLocalizedValue(
  value: string | null | undefined,
  valueRu: string | null | undefined,
  valueEn: string | null | undefined,
  currentLocale: string
): string {
  const loc = primaryLocaleTag(currentLocale);
  if (loc === 'ru' && valueRu) {
    return valueRu;
  }
  if (loc === 'en' && valueEn) {
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

/**
 * Service heading for UI grids/lists: prefers `nameRu`/`nameEn` for that locale,
 * then canonical `name`, then the other locale (same idea as `ticketServiceDisplayName`).
 * If everything is empty, falls back to a short `id` hint so broken API payloads are still distinguishable.
 */
export function serviceTitleForLocale(
  service: {
    id?: string;
    name: string;
    nameRu?: string | null;
    nameEn?: string | null;
  },
  currentLocale: string
): string {
  const loc = primaryLocaleTag(currentLocale);
  const n = (service.name ?? '').trim();
  const ru = (service.nameRu ?? '').trim();
  const en = (service.nameEn ?? '').trim();
  let out = '';
  if (loc === 'ru') {
    out = ru || n || en;
  } else if (loc === 'en') {
    out = en || n || ru;
  } else {
    out = n || ru || en;
  }
  if (out) return out;
  const id = service.id?.trim();
  if (id && id.length > 8) return `${id.slice(0, 8)}…`;
  return id ?? '';
}

// Get initials from user name
export function getInitials(name?: string): string {
  if (!name) return 'U';

  const parts = name.trim().split(' ');
  if (parts.length >= 2) {
    return (parts[0][0] + parts[1][0]).toUpperCase();
  }
  return name.substring(0, 2).toUpperCase();
}

// Generate avatar color based on name
export function getAvatarColor(name?: string): string {
  if (!name) return 'hsl(var(--primary))';

  const colors = [
    'hsl(220, 90%, 56%)', // blue
    'hsl(340, 75%, 55%)', // pink
    'hsl(160, 60%, 45%)', // teal
    'hsl(30, 80%, 55%)', // orange
    'hsl(280, 65%, 60%)' // purple
  ];

  const hash = name
    .split('')
    .reduce((acc, char) => acc + char.charCodeAt(0), 0);
  return colors[hash % colors.length];
}
