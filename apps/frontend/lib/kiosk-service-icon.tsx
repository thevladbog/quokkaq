import type { LucideIcon } from 'lucide-react';
import {
  Barcode,
  BookUser,
  Box,
  Boxes,
  Briefcase,
  Building2,
  Calendar,
  Car,
  ChevronRight,
  Coffee,
  CreditCard,
  FileText,
  Forklift,
  Gem,
  Headphones,
  Info,
  Luggage,
  Mail,
  MapPin,
  MessageCircle,
  Package,
  Package2,
  Percent,
  Phone,
  Plane,
  QrCode,
  ScanLine,
  Scale,
  Ship,
  ShoppingBag,
  ShoppingCart,
  Stethoscope,
  Store,
  Tag,
  Ticket,
  TrainFront,
  Truck,
  UtensilsCrossed,
  Users,
  Warehouse,
  Wrench,
  Wine
} from 'lucide-react';

const registry: Readonly<Record<string, LucideIcon>> = {
  health: Stethoscope,
  medical: Stethoscope,
  document: FileText,
  docs: FileText,
  payment: CreditCard,
  finance: CreditCard,
  queue: Ticket,
  ticket: Ticket,
  consult: MessageCircle,
  info: Info,
  passport: BookUser,
  social: Users,
  right: ChevronRight,
  package: Package,
  calendar: Calendar,
  map_pin: MapPin,
  map: MapPin,
  wrench: Wrench,
  headphones: Headphones,
  support: Headphones,
  phone: Phone,
  building: Building2,
  office: Building2,
  mail: Mail,
  email: Mail,
  briefcase: Briefcase,
  shopping: ShoppingBag,
  retail: ShoppingBag,
  car: Car,
  auto: Car,
  truck: Truck,
  delivery: Truck,
  forklift: Forklift,
  train: TrainFront,
  plane: Plane,
  ship: Ship,
  sea: Ship,
  boxes: Boxes,
  box: Box,
  carton: Box,
  stacks: Package2,
  parcels: Package2,
  cart: ShoppingCart,
  store: Store,
  shop: Store,
  warehouse: Warehouse,
  scan: ScanLine,
  pos: ScanLine,
  qrcode: QrCode,
  qr: QrCode,
  barcode: Barcode,
  tag: Tag,
  price: Tag,
  luggage: Luggage,
  scale: Scale,
  percent: Percent,
  sale: Percent,
  discount: Percent,
  gem: Gem,
  jewelry: Gem,
  coffee: Coffee,
  wine: Wine,
  food: UtensilsCrossed,
  utensils: UtensilsCrossed,
  default: ChevronRight
};

/** API aliases → one canonical `iconKey` for storage and the admin preset list. */
const iconKeyAliases: Readonly<Record<string, string>> = {
  medical: 'health',
  docs: 'document',
  finance: 'payment',
  ticket: 'queue',
  map: 'map_pin',
  support: 'headphones',
  office: 'building',
  email: 'mail',
  retail: 'shopping',
  auto: 'car',
  delivery: 'truck',
  lorry: 'truck',
  van: 'truck',
  parcels: 'stacks',
  pallet: 'boxes',
  wholesale: 'boxes',
  carton: 'box',
  lot: 'box',
  shop: 'store',
  pos: 'scan',
  till: 'scan',
  checkout: 'scan',
  qr: 'qrcode',
  sea: 'ship',
  port: 'ship',
  air: 'plane',
  discount: 'percent',
  sale: 'percent',
  price: 'tag',
  tags: 'tag',
  jewelry: 'gem',
  food: 'utensils',
  eat: 'utensils',
  drink: 'coffee',
  bar: 'wine',
  weight: 'scale',
  weigh: 'scale'
};

export type KioskServiceIconPresetValue =
  | 'queue'
  | 'health'
  | 'document'
  | 'payment'
  | 'consult'
  | 'info'
  | 'passport'
  | 'social'
  | 'right'
  | 'package'
  | 'calendar'
  | 'map_pin'
  | 'wrench'
  | 'headphones'
  | 'phone'
  | 'building'
  | 'mail'
  | 'briefcase'
  | 'shopping'
  | 'car'
  | 'truck'
  | 'forklift'
  | 'train'
  | 'plane'
  | 'ship'
  | 'boxes'
  | 'box'
  | 'stacks'
  | 'cart'
  | 'store'
  | 'warehouse'
  | 'scan'
  | 'qrcode'
  | 'barcode'
  | 'tag'
  | 'luggage'
  | 'scale'
  | 'percent'
  | 'gem'
  | 'coffee'
  | 'wine'
  | 'utensils';

/**
 * Kiosk “built-in” icon choices: one `value` per unique Lucide component / meaning.
 * `i18nKey` = `useTranslations('admin.services')` path (see `messages/*`).
 */
export const KIOSK_SERVICE_ICON_PRESETS = [
  { value: 'queue', icon: Ticket, i18nKey: 'kiosk_icon_preset_queue' },
  { value: 'health', icon: Stethoscope, i18nKey: 'kiosk_icon_preset_health' },
  { value: 'document', icon: FileText, i18nKey: 'kiosk_icon_preset_document' },
  { value: 'payment', icon: CreditCard, i18nKey: 'kiosk_icon_preset_payment' },
  {
    value: 'consult',
    icon: MessageCircle,
    i18nKey: 'kiosk_icon_preset_consult'
  },
  { value: 'info', icon: Info, i18nKey: 'kiosk_icon_preset_info' },
  { value: 'passport', icon: BookUser, i18nKey: 'kiosk_icon_preset_passport' },
  { value: 'social', icon: Users, i18nKey: 'kiosk_icon_preset_social' },
  { value: 'right', icon: ChevronRight, i18nKey: 'kiosk_icon_preset_right' },
  { value: 'package', icon: Package, i18nKey: 'kiosk_icon_preset_package' },
  { value: 'calendar', icon: Calendar, i18nKey: 'kiosk_icon_preset_calendar' },
  { value: 'map_pin', icon: MapPin, i18nKey: 'kiosk_icon_preset_map_pin' },
  { value: 'wrench', icon: Wrench, i18nKey: 'kiosk_icon_preset_wrench' },
  {
    value: 'headphones',
    icon: Headphones,
    i18nKey: 'kiosk_icon_preset_headphones'
  },
  { value: 'phone', icon: Phone, i18nKey: 'kiosk_icon_preset_phone' },
  { value: 'building', icon: Building2, i18nKey: 'kiosk_icon_preset_building' },
  { value: 'mail', icon: Mail, i18nKey: 'kiosk_icon_preset_mail' },
  {
    value: 'briefcase',
    icon: Briefcase,
    i18nKey: 'kiosk_icon_preset_briefcase'
  },
  {
    value: 'shopping',
    icon: ShoppingBag,
    i18nKey: 'kiosk_icon_preset_shopping'
  },
  { value: 'car', icon: Car, i18nKey: 'kiosk_icon_preset_car' },
  { value: 'truck', icon: Truck, i18nKey: 'kiosk_icon_preset_truck' },
  { value: 'forklift', icon: Forklift, i18nKey: 'kiosk_icon_preset_forklift' },
  { value: 'train', icon: TrainFront, i18nKey: 'kiosk_icon_preset_train' },
  { value: 'plane', icon: Plane, i18nKey: 'kiosk_icon_preset_plane' },
  { value: 'ship', icon: Ship, i18nKey: 'kiosk_icon_preset_ship' },
  { value: 'boxes', icon: Boxes, i18nKey: 'kiosk_icon_preset_boxes' },
  { value: 'box', icon: Box, i18nKey: 'kiosk_icon_preset_box' },
  { value: 'stacks', icon: Package2, i18nKey: 'kiosk_icon_preset_stacks' },
  { value: 'cart', icon: ShoppingCart, i18nKey: 'kiosk_icon_preset_cart' },
  { value: 'store', icon: Store, i18nKey: 'kiosk_icon_preset_store' },
  {
    value: 'warehouse',
    icon: Warehouse,
    i18nKey: 'kiosk_icon_preset_warehouse'
  },
  { value: 'scan', icon: ScanLine, i18nKey: 'kiosk_icon_preset_scan' },
  { value: 'qrcode', icon: QrCode, i18nKey: 'kiosk_icon_preset_qrcode' },
  { value: 'barcode', icon: Barcode, i18nKey: 'kiosk_icon_preset_barcode' },
  { value: 'tag', icon: Tag, i18nKey: 'kiosk_icon_preset_tag' },
  { value: 'luggage', icon: Luggage, i18nKey: 'kiosk_icon_preset_luggage' },
  { value: 'scale', icon: Scale, i18nKey: 'kiosk_icon_preset_scale' },
  { value: 'percent', icon: Percent, i18nKey: 'kiosk_icon_preset_percent' },
  { value: 'gem', icon: Gem, i18nKey: 'kiosk_icon_preset_gem' },
  { value: 'coffee', icon: Coffee, i18nKey: 'kiosk_icon_preset_coffee' },
  { value: 'wine', icon: Wine, i18nKey: 'kiosk_icon_preset_wine' },
  {
    value: 'utensils',
    icon: UtensilsCrossed,
    i18nKey: 'kiosk_icon_preset_utensils'
  }
] as const;

export type KioskServiceIconI18nKey =
  (typeof KIOSK_SERVICE_ICON_PRESETS)[number]['i18nKey'];

const presetValueSet: ReadonlySet<string> = new Set<string>(
  KIOSK_SERVICE_ICON_PRESETS.map((p) => p.value)
);

/**
 * `true` when `k` (after trim/lower) is a built-in admin preset and should use i18n label
 * in the form (not a legacy/unknown string).
 */
export function isKioskServiceIconPresetValue(
  k: string | null | undefined
): boolean {
  if (k == null) {
    return false;
  }
  const t = String(k).trim().toLowerCase();
  if (!t) {
    return false;
  }
  return presetValueSet.has(t);
}

/**
 * Maps user/API `iconKey` to a canonical built-in value when the input is a known alias;
 * returns `""` for empty, unknown legacy `"default"`, and leaves non-preset non-empty
 * keys unchanged so the admin can still display/save a custom key until the user changes it.
 */
export function normalizeKioskServiceIconKey(
  input: string | null | undefined
): string {
  if (input == null) {
    return '';
  }
  let k = String(input).trim().toLowerCase();
  if (!k) {
    return '';
  }
  if (k === 'default') {
    return '';
  }
  k = iconKeyAliases[k] ?? k;
  if (presetValueSet.has(k)) {
    return k;
  }
  return k;
}

/**
 * @deprecated Use {@link KIOSK_SERVICE_ICON_PRESETS} in admin UI. Exposed for tests/compat.
 * Built-in keys only; excludes `default` and non-canonical alias keys.
 */
export const KIOSK_SERVICE_ICON_KEYS: string[] = KIOSK_SERVICE_ICON_PRESETS.map(
  (p) => p.value
).sort((a, b) => a.localeCompare(b));

/**
 * Maps API `Service.iconKey` to a Lucide component. Unknown keys fall back to {@link registry.default}.
 */
export function resolveKioskServiceIcon(
  iconKey: string | null | undefined
): LucideIcon {
  if (iconKey == null) {
    return registry.default;
  }
  const k = String(iconKey).trim().toLowerCase();
  if (!k) {
    return registry.default;
  }
  return registry[k] ?? registry.default;
}
