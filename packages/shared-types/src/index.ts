import { z } from 'zod';

// ==========================
// Zod Schemas
// ==========================

export const UserModelSchema = z.object({
  id: z.string(),
  name: z.string(),
  email: z.string().nullable().optional(),
  createdAt: z.string().nullable().optional(),
  unitIds: z.array(z.string()).optional(),
  roles: z
    .union([
      z.array(z.string()),
      z.array(
        z.object({
          role: z.object({
            name: z.string()
          })
        })
      )
    ])
    .optional()
    .transform((val): string[] => {
      if (!val) return [];
      return val.map((v) => {
        if (typeof v === 'string') return v;
        return v.role.name;
      });
    }),
  type: z.string().optional(),
  permissions: z.record(z.string(), z.array(z.string())).optional(),
  units: z
    .array(
      z.object({
        unitId: z.string(),
        permissions: z.array(z.string()).optional().default([]),
        unit: z
          .object({
            companyId: z.string()
          })
          .optional()
      })
    )
    .optional()
});

// Service Model Schema (recursive)
export type ServiceModel = {
  id: string;
  unitId: string;
  parentId?: string | null;
  parent?: ServiceModel | null;
  children?: ServiceModel[];
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
  duration?: number | null;
  maxWaitingTime?: number | null;
  prebook?: boolean;
  isLeaf?: boolean;
  gridRow?: number | null;
  gridCol?: number | null;
  gridRowSpan?: number | null;
  gridColSpan?: number | null;
};

export const ServiceModelSchema: z.ZodType<ServiceModel> = z.object({
  id: z.string(),
  unitId: z.string(),
  parentId: z.string().nullable().optional(),
  parent: z
    .lazy(() => ServiceModelSchema)
    .nullable()
    .optional(),
  children: z.array(z.lazy(() => ServiceModelSchema)).optional(),
  name: z.string(),
  nameRu: z.string().nullable().optional(),
  nameEn: z.string().nullable().optional(),
  description: z.string().nullable().optional(),
  descriptionRu: z.string().nullable().optional(),
  descriptionEn: z.string().nullable().optional(),
  imageUrl: z.string().nullable().optional(),
  backgroundColor: z.string().nullable().optional(),
  textColor: z.string().nullable().optional(),
  prefix: z.string().nullable().optional(),
  numberSequence: z.string().nullable().optional(),
  duration: z.number().nullable().optional(),
  maxWaitingTime: z.number().nullable().optional(),
  prebook: z.boolean().optional(),
  isLeaf: z.boolean().optional(),
  gridRow: z.number().nullable().optional(),
  gridCol: z.number().nullable().optional(),
  gridRowSpan: z.number().nullable().optional(),
  gridColSpan: z.number().nullable().optional()
});

export const UnitModelSchema = z.object({
  id: z.string(),
  name: z.string(),
  code: z.string(),
  companyId: z.string(),
  timezone: z.string(),
  config: z.custom<UnitConfig>().nullable().optional(),
  services: z.array(ServiceModelSchema).optional()
});

export const TicketModelSchema = z.object({
  id: z.string(),
  queueNumber: z.string(),
  unitId: z.string(),
  serviceId: z.string(),
  status: z.string(),
  priority: z.number().nullable().optional(),
  createdAt: z.string().nullable().optional(),
  calledAt: z.string().nullable().optional(),
  maxWaitingTime: z.number().nullable().optional(),
  counter: z
    .object({
      id: z.string(),
      name: z.string()
    })
    .nullable()
    .optional(),
  preRegistration: z
    .object({
      id: z.string(),
      customerName: z.string(),
      customerPhone: z.string(),
      code: z.string(),
      date: z.string(),
      time: z.string(),
      comment: z.string().optional()
    })
    .nullable()
    .optional()
});

export const BookingModelSchema = z.object({
  id: z.string(),
  userName: z.string().nullable().optional(),
  userPhone: z.string().nullable().optional(),
  unitId: z.string(),
  serviceId: z.string(),
  scheduledAt: z.string().nullable().optional(),
  status: z.string(),
  code: z.string(),
  createdAt: z.string().nullable().optional()
});

export const CounterModelSchema = z.object({
  id: z.string(),
  unitId: z.string(),
  name: z.string(),
  assignedTo: z.string().nullable().optional(),
  assignedUser: z
    .object({
      name: z.string()
    })
    .optional()
});

export const DesktopTerminalSchema = z.object({
  id: z.string(),
  unitId: z.string(),
  name: z.string().nullable().optional(),
  defaultLocale: z.string(),
  kioskFullscreen: z.boolean().optional().default(false),
  revokedAt: z.string().nullable().optional(),
  lastSeenAt: z.string().nullable().optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
  unitName: z.string().optional()
});

export const CreateDesktopTerminalResponseSchema = z.object({
  terminal: DesktopTerminalSchema,
  pairingCode: z.string()
});

// ==========================
// TypeScript Types
// ==========================

export type User = z.infer<typeof UserModelSchema>;
export type Unit = z.infer<typeof UnitModelSchema>;
export type Service = z.infer<typeof ServiceModelSchema>;
export type Ticket = z.infer<typeof TicketModelSchema>;
export type Booking = z.infer<typeof BookingModelSchema>;
export type Counter = z.infer<typeof CounterModelSchema>;
export type DesktopTerminal = z.infer<typeof DesktopTerminalSchema>;

export type Material = {
  id: string;
  type: string;
  url: string;
  filename: string;
  createdAt: string;
};

export type LoginCredentials = {
  email: string;
  password: string;
};

export type LoginResponse = {
  accessToken: string;
};

export interface AdScreenConfig {
  width: number;
  duration: number;
  activeMaterialIds: string[];
  logoUrl?: string;
  isCustomColorsEnabled?: boolean;
  headerColor?: string;
  bodyColor?: string;
}

export interface KioskConfig {
  pin?: string;
  /** Main screen hero headline above the service grid (kiosk home). */
  welcomeTitle?: string;
  /** Main screen hero subline below welcomeTitle. */
  welcomeSubtitle?: string;
  headerText?: string;
  footerText?: string;
  printerConnection?: 'network' | 'system';
  systemPrinterName?: string;
  printerIp?: string;
  printerPort?: string;
  showHeader?: boolean;
  showFooter?: boolean;
  isCustomColorsEnabled?: boolean;
  headerColor?: string;
  bodyColor?: string;
  serviceGridColor?: string;
  logoUrl?: string;
  printerType?: string;
  isPrintEnabled?: boolean;
  feedbackUrl?: string;
  isPreRegistrationEnabled?: boolean;
  /** Show unit title in kiosk header (next to logo). Default true when unset. */
  showUnitInHeader?: boolean;
  /** Custom kiosk header label; when empty, the unit name from the API is shown. */
  kioskUnitLabelText?: string;
}

export interface UnitConfig {
  adScreen?: AdScreenConfig;
  kiosk?: KioskConfig;
  logoUrl?: string;
  [key: string]: unknown;
}

export interface PreRegistration {
  id: string;
  unitId: string;
  serviceId: string;
  date: string;
  time: string;
  code: string;
  customerName: string;
  customerPhone: string;
  comment?: string;
  status: string;
  ticketId?: string;
  createdAt: string;
  service?: Service;
  ticket?: Ticket;
}

// ==========================
// API Request/Response Types
// ==========================

export type CreateTicketRequest = {
  unitId: string;
  serviceId: string;
  preferredName?: string;
};

export type CreateBookingRequest = {
  unitId: string;
  serviceId: string;
  userName?: string;
  userPhone?: string;
  scheduledAt?: string;
};

export type CreateServiceRequest = Omit<Service, 'id'>;

export type UpdateServiceRequest = Partial<Service>;

export type TransferTicketRequest = {
  toCounterId?: string;
  toUserId?: string;
};

export type CallNextRequest = {
  strategy?: 'fifo' | 'by_service';
  serviceId?: string;
};

// ==========================
// SaaS Types (Subscription & Billing)
// ==========================

export const partyTypeSchema = z.enum([
  'legal_entity',
  'sole_proprietor',
  'individual'
]);

const digits10 = /^\d{10}$/;
const digits12 = /^\d{12}$/;
const digits9 = /^\d{9}$/;
const digits13 = /^\d{13}$/;
const digits15 = /^\d{15}$/;

const addressPartSchema = z
  .object({
    unrestricted: z.string().optional(),
    postalCode: z.string().optional(),
    fiasId: z.string().optional()
  })
  .optional();

const ruBic9 = /^\d{9}$/;
const ruAccount20 = /^\d{20}$/;

/**
 * Single RU bank account (JSON item in `companies.payment_accounts`).
 * Kept in sync with Go: `internal/handlers.normalizePaymentAccountsJSON` (BIC / account digit rules, max 30 rows).
 */
export const PaymentAccountSchema = z
  .object({
    id: z.string().optional(),
    bankName: z.string().optional(),
    bic: z.string().optional(),
    correspondentAccount: z.string().optional(),
    accountNumber: z.string().optional(),
    swift: z.string().optional(),
    isDefault: z.boolean().optional()
  })
  .superRefine((row, ctx) => {
    const bic = (row.bic ?? '').trim();
    if (bic && !ruBic9.test(bic)) {
      ctx.addIssue({
        code: 'custom',
        path: ['bic'],
        message: 'BIC must be 9 digits'
      });
    }
    const ks = (row.correspondentAccount ?? '').trim();
    if (ks && !ruAccount20.test(ks)) {
      ctx.addIssue({
        code: 'custom',
        path: ['correspondentAccount'],
        message: 'Correspondent account must be 20 digits'
      });
    }
    const rs = (row.accountNumber ?? '').trim();
    if (rs && !ruAccount20.test(rs)) {
      ctx.addIssue({
        code: 'custom',
        path: ['accountNumber'],
        message: 'Account number must be 20 digits'
      });
    }
  });

export const PaymentAccountsSchema = z
  .array(PaymentAccountSchema)
  .max(30)
  .superRefine((accounts, ctx) => {
    const defaults = accounts.filter((a) => a.isDefault === true);
    if (defaults.length > 1) {
      ctx.addIssue({
        code: 'custom',
        message: 'At most one payment account may be marked as default'
      });
    }
  });

export type PaymentAccount = z.infer<typeof PaymentAccountSchema>;

/** RU counterparty profile (JSON stored in companies.counterparty). */
export const CounterpartySchema = z
  .object({
    schemaVersion: z.number().int().optional(),
    partyType: partyTypeSchema,
    inn: z.string().optional(),
    kpp: z.string().optional(),
    ogrn: z.string().optional(),
    ogrnip: z.string().optional(),
    fullName: z.string().optional(),
    shortName: z.string().optional(),
    passport: z
      .object({
        series: z.string().optional(),
        number: z.string().optional(),
        issuedBy: z.string().optional(),
        issueDate: z.string().optional()
      })
      .optional(),
    addresses: z
      .object({
        legal: addressPartSchema,
        actual: addressPartSchema,
        postal: addressPartSchema
      })
      .optional(),
    phone: z.string().optional(),
    email: z.union([z.string().email(), z.literal('')]).optional(),
    contacts: z
      .array(
        z.object({
          fullName: z.string().optional(),
          position: z.string().optional(),
          phone: z.string().optional(),
          email: z.string().optional()
        })
      )
      .optional(),
    edo: z
      .object({
        operator: z.string().optional(),
        participantId: z.string().optional()
      })
      .optional()
  })
  .superRefine((val, ctx) => {
    const inn = (val.inn ?? '').trim();
    const kpp = (val.kpp ?? '').trim();
    const ogrn = (val.ogrn ?? '').trim();
    const ogrnip = (val.ogrnip ?? '').trim();
    switch (val.partyType) {
      case 'legal_entity':
        if (inn && !digits10.test(inn)) {
          ctx.addIssue({
            code: 'custom',
            path: ['inn'],
            message: 'INN must be 10 digits for legal entity'
          });
        }
        if (kpp && !digits9.test(kpp)) {
          ctx.addIssue({
            code: 'custom',
            path: ['kpp'],
            message: 'KPP must be 9 digits'
          });
        }
        if (ogrnip) {
          ctx.addIssue({
            code: 'custom',
            path: ['ogrnip'],
            message: 'OGRNIP must not be set for legal entity'
          });
        }
        if (ogrn && !digits13.test(ogrn)) {
          ctx.addIssue({
            code: 'custom',
            path: ['ogrn'],
            message: 'OGRN must be 13 digits'
          });
        }
        break;
      case 'sole_proprietor':
        if (inn && !digits12.test(inn)) {
          ctx.addIssue({
            code: 'custom',
            path: ['inn'],
            message: 'INN must be 12 digits for sole proprietor'
          });
        }
        if (kpp) {
          ctx.addIssue({
            code: 'custom',
            path: ['kpp'],
            message: 'KPP must not be set for sole proprietor'
          });
        }
        if (ogrnip && !digits15.test(ogrnip)) {
          ctx.addIssue({
            code: 'custom',
            path: ['ogrnip'],
            message: 'OGRNIP must be 15 digits'
          });
        }
        break;
      case 'individual':
        if (inn && !digits12.test(inn)) {
          ctx.addIssue({
            code: 'custom',
            path: ['inn'],
            message: 'INN must be 12 digits when set'
          });
        }
        if (kpp) {
          ctx.addIssue({
            code: 'custom',
            path: ['kpp'],
            message: 'KPP must not be set for individual'
          });
        }
        if (ogrn || ogrnip) {
          ctx.addIssue({
            code: 'custom',
            path: ['ogrn'],
            message: 'OGRN/OGRNIP must not be set for individual'
          });
        }
        break;
      default:
        break;
    }
  });

export type Counterparty = z.infer<typeof CounterpartySchema>;
export type PartyType = z.infer<typeof partyTypeSchema>;

/**
 * Billing period for subscription plans. API/DB may send empty, null, or legacy
 * spellings; we coerce so nested `subscription.pendingPlan` in company payloads
 * does not break Zod (e.g. after PATCH /platform/companies/:id).
 */
export const subscriptionPlanIntervalSchema = z.preprocess(
  (val) => {
    if (val === null || val === undefined) {
      return 'month';
    }
    const s = String(val).trim().toLowerCase();
    if (s === '' || s === 'month' || s === 'monthly' || s === 'mo') {
      return 'month';
    }
    if (
      s === 'year' ||
      s === 'yearly' ||
      s === 'annual' ||
      s === 'yr' ||
      s === 'y'
    ) {
      return 'year';
    }
    return val;
  },
  z.enum(['month', 'year'], {
    message: 'Invalid subscription plan interval'
  })
);

export const SubscriptionPlanSchema = z.object({
  id: z.string(),
  name: z.string(),
  code: z.string(),
  price: z
    .number()
    .describe(
      'Amount in minor currency units (e.g. cents for USD), matching Stripe amounts.'
    ),
  currency: z.string(),
  interval: subscriptionPlanIntervalSchema,
  features: z.record(z.string(), z.boolean()).optional(),
  limits: z.record(z.string(), z.number()).optional(),
  isActive: z.boolean(),
  createdAt: z.string().optional(),
  updatedAt: z.string().optional()
});

export const SubscriptionSchema = z.object({
  id: z.string(),
  companyId: z.string(),
  planId: z.string(),
  status: z.enum(['trial', 'active', 'past_due', 'canceled', 'paused']),
  currentPeriodStart: z.string(),
  currentPeriodEnd: z.string(),
  cancelAtPeriodEnd: z.boolean(),
  trialEnd: z.string().nullable().optional(),
  pendingPlanId: z.string().nullable().optional(),
  pendingEffectiveAt: z.string().nullable().optional(),
  stripeSubscriptionId: z.string().optional(),
  metadata: z.record(z.string(), z.any()).optional(),
  createdAt: z.string().optional(),
  updatedAt: z.string().optional(),
  plan: SubscriptionPlanSchema.optional(),
  pendingPlan: SubscriptionPlanSchema.optional()
});

/** Tenant-visible SaaS operator fields for invoice payment (GET /invoices/me/vendor). */
export const SaasVendorSchema = z.object({
  name: z.string(),
  billingEmail: z.union([z.string().email(), z.literal('')]).optional(),
  billingAddress: z.record(z.string(), z.any()).optional(),
  paymentAccounts: PaymentAccountsSchema.optional(),
  counterparty: CounterpartySchema.optional()
});

export type SaasVendor = z.infer<typeof SaasVendorSchema>;

export const CompanySchema = z.object({
  id: z.string(),
  name: z.string(),
  ownerUserId: z.string().optional(),
  subscriptionId: z.string().nullable().optional(),
  isSaasOperator: z.boolean().optional(),
  billingEmail: z.union([z.string().email(), z.literal('')]).optional(),
  billingAddress: z.record(z.string(), z.any()).optional(),
  paymentAccounts: PaymentAccountsSchema.optional(),
  counterparty: CounterpartySchema.optional(),
  settings: z.record(z.string(), z.any()).optional(),
  onboardingState: z.record(z.string(), z.any()).optional(),
  createdAt: z.string().optional(),
  updatedAt: z.string().optional(),
  subscription: SubscriptionSchema.optional(),
  units: z.array(UnitModelSchema).optional()
});

export const CompanyMeFeaturesSchema = z.object({
  dadata: z.boolean(),
  dadataCleaner: z.boolean()
});

export const CompanyMeResponseSchema = z.object({
  company: CompanySchema,
  features: CompanyMeFeaturesSchema
});

export const InvoiceLineSchema = z.object({
  id: z.string(),
  invoiceId: z.string(),
  position: z.number(),
  catalogItemId: z.string().nullable().optional(),
  descriptionPrint: z.string(),
  quantity: z.number(),
  unit: z
    .union([z.string(), z.null()])
    .optional()
    .transform((v) => (v == null ? '' : v)),
  unitPriceInclVatMinor: z.number(),
  discountPercent: z.number().nullable().optional(),
  discountAmountMinor: z.number().nullable().optional(),
  vatExempt: z.boolean(),
  vatRatePercent: z.number(),
  lineNetMinor: z.number(),
  vatAmountMinor: z.number(),
  lineGrossMinor: z.number(),
  subscriptionPlanId: z.string().nullable().optional(),
  subscriptionPeriodStart: z.string().nullable().optional(),
  subscriptionPeriodEnd: z.string().nullable().optional(),
  createdAt: z.string().optional(),
  updatedAt: z.string().optional(),
  plan: SubscriptionPlanSchema.optional()
});

export const CatalogItemSchema = z.object({
  id: z.string(),
  name: z.string(),
  printName: z.string(),
  unit: z.string(),
  article: z.string(),
  defaultPriceMinor: z.number(),
  currency: z.string(),
  vatExempt: z.boolean(),
  vatRatePercent: z.number(),
  subscriptionPlanId: z.string().nullable().optional(),
  isActive: z.boolean(),
  createdAt: z.string().optional(),
  updatedAt: z.string().optional(),
  plan: SubscriptionPlanSchema.optional()
});

export const InvoiceSchema = z.object({
  id: z.string(),
  companyId: z.string().nullable().optional(),
  subscriptionId: z.string().nullable().optional(),
  amount: z.number(),
  currency: z.string(),
  status: z.enum(['draft', 'open', 'paid', 'void', 'uncollectible']),
  paymentProvider: z.string().optional(),
  paymentProviderInvoiceId: z.string().optional(),
  paidAt: z.string().nullable().optional(),
  dueDate: z.string(),
  createdAt: z.string().optional(),
  updatedAt: z.string().optional(),
  subscription: SubscriptionSchema.optional(),
  documentNumber: z.string().nullable().optional(),
  subtotalExclVatMinor: z.number().optional(),
  vatTotalMinor: z.number().optional(),
  allowYookassaPaymentLink: z.boolean().optional(),
  allowStripePaymentLink: z.boolean().optional(),
  provisionSubscriptionsOnPayment: z.boolean().optional(),
  yookassaPaymentId: z.string().optional(),
  yookassaConfirmationUrl: z.string().optional(),
  stripeCheckoutUrl: z.string().optional(),
  stripeSessionId: z.string().optional(),
  provisioningDoneAt: z.string().nullable().optional(),
  issuedAt: z.string().nullable().optional(),
  buyerSnapshot: z
    .union([z.record(z.string(), z.unknown()), z.null()])
    .optional(),
  lines: z.array(InvoiceLineSchema).optional()
});

export const UsageMetricSchema = z.object({
  current: z.number(),
  limit: z.number()
});

export const UsageMetricsSchema = z.object({
  currentPeriod: z.object({
    start: z.string(),
    end: z.string()
  }),
  metrics: z
    .object({
      units: UsageMetricSchema.optional(),
      users: UsageMetricSchema.optional(),
      tickets_per_month: UsageMetricSchema.optional(),
      services: UsageMetricSchema.optional(),
      counters: UsageMetricSchema.optional()
    })
    .catchall(UsageMetricSchema) // Allow any other metric keys
});

export type SubscriptionPlan = z.infer<typeof SubscriptionPlanSchema>;
export type Subscription = z.infer<typeof SubscriptionSchema>;
export type Company = z.infer<typeof CompanySchema>;
export type CompanyMeResponse = z.infer<typeof CompanyMeResponseSchema>;
export type Invoice = z.infer<typeof InvoiceSchema>;
export type InvoiceLine = z.infer<typeof InvoiceLineSchema>;
export type CatalogItem = z.infer<typeof CatalogItemSchema>;

/** Platform invoice draft line (matches backend JSON). */
export const InvoiceDraftLineInputSchema = z.object({
  catalogItemId: z.string().nullable().optional(),
  descriptionPrint: z.string(),
  quantity: z.number(),
  unit: z
    .string()
    .optional()
    .describe('Unit of measure for print (e.g. шт, мес.)'),
  unitPriceInclVatMinor: z
    .number()
    .nullable()
    .optional()
    .describe(
      'Omit with catalogItemId to use catalog default; include 0 for a free line.'
    ),
  discountPercent: z.number().nullable().optional(),
  discountAmountMinor: z.number().nullable().optional(),
  vatExempt: z.boolean().nullable().optional(),
  vatRatePercent: z.number().nullable().optional(),
  subscriptionPlanId: z.string().nullable().optional(),
  subscriptionPeriodStart: z.string().nullable().optional()
});

/** Platform invoice draft create / PATCH draft body (matches backend JSON). */
export const InvoiceDraftUpsertBodySchema = z.object({
  companyId: z.string().optional(),
  dueDate: z.string(),
  currency: z.string(),
  allowYookassaPaymentLink: z.boolean(),
  allowStripePaymentLink: z.boolean(),
  provisionSubscriptionsOnPayment: z.boolean(),
  lines: z.array(InvoiceDraftLineInputSchema)
});

/** POST create draft: `companyId` is required (PATCH draft omits it). */
export const InvoiceDraftCreateBodySchema = InvoiceDraftUpsertBodySchema.extend(
  {
    companyId: z.string().min(1)
  }
);

export type InvoiceDraftLineInput = z.infer<typeof InvoiceDraftLineInputSchema>;
export type InvoiceDraftUpsertBody = z.infer<
  typeof InvoiceDraftUpsertBodySchema
>;
export type InvoiceDraftCreateBody = z.infer<
  typeof InvoiceDraftCreateBodySchema
>;
export type UsageMetric = z.infer<typeof UsageMetricSchema>;
export type UsageMetrics = z.infer<typeof UsageMetricsSchema>;

// Signup Request
export type SignupRequest = {
  name: string;
  email: string;
  password: string;
  companyName: string;
  planCode?: string;
};

export type SignupResponse = {
  accessToken: string;
};
