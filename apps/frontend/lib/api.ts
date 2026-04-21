import { z } from 'zod';
import { ApiHttpError, throwApiHttpErrorFromBody } from './api-errors';
import {
  API_BASE_URL,
  authenticatedApiFetch,
  isRequestAbortError
} from './authenticated-api-fetch';
import { logger } from './logger';
import * as orvalTc from './api/generated/tickets-counters';
import * as orvalTenantBilling from './api/generated/tenant-billing';
import * as orvalUnits from './api/generated/units';
import type { Locale } from '@/i18n';

export { ApiHttpError } from './api-errors';
export { isRequestAbortError } from './authenticated-api-fetch';

// Re-export all types and schemas from shared package
export * from '@quokkaq/shared-types';
export {
  UserModelSchema,
  ServiceModelSchema,
  UnitModelSchema,
  TicketModelSchema,
  BookingModelSchema,
  CounterModelSchema,
  DesktopTerminalSchema,
  CreateDesktopTerminalResponseSchema
} from '@quokkaq/shared-types';

// Import types we need for API functions
import type {
  User,
  Unit,
  Service,
  Ticket,
  Booking,
  Counter,
  DesktopTerminal,
  DesktopTerminalKind,
  Material,
  PreRegistration,
  UsageMetrics,
  Company,
  SsoAccessSource,
  SaasVendor,
  CompanyMeResponse,
  PaymentAccount,
  UnitClientHistoryListResponse
} from '@quokkaq/shared-types';

import {
  UserModelSchema,
  ServiceModelSchema,
  UnitModelSchema,
  TicketModelSchema,
  BookingModelSchema,
  CounterModelSchema,
  DesktopTerminalSchema,
  DesktopTerminalKindSchema,
  CreateDesktopTerminalResponseSchema,
  UsageMetricsSchema,
  SubscriptionSchema,
  SubscriptionPlanSchema,
  InvoiceSchema,
  CompanySchema,
  SaasVendorSchema,
  CompanyMeResponseSchema,
  UnitClientHistoryListResponseSchema,
  createTicketRequestSchema,
  type CreateTicketRequestInput
} from '@quokkaq/shared-types';

const ClientVisitsResponseSchema = z.object({
  items: z.array(TicketModelSchema),
  nextCursor: z.string().nullish()
});

const UnitClientModelSchema = z.object({
  id: z.string(),
  unitId: z.string(),
  firstName: z.string(),
  lastName: z.string(),
  phoneE164: z.string().nullable().optional(),
  photoUrl: z.string().nullable().optional(),
  isAnonymous: z.boolean().optional(),
  createdAt: z.string().optional(),
  updatedAt: z.string().optional(),
  definitions: z
    .array(
      z.object({
        id: z.string(),
        label: z.string(),
        color: z.string(),
        sortOrder: z.number().optional()
      })
    )
    .optional()
});

export type UnitClient = z.infer<typeof UnitClientModelSchema>;

const UnitClientListResponseSchema = z.object({
  items: z.array(UnitClientModelSchema),
  nextCursor: z.string().nullish()
});

export type UnitClientListResponse = z.infer<
  typeof UnitClientListResponseSchema
>;

const VisitorTagDefinitionSchema = z.object({
  id: z.string(),
  unitId: z.string(),
  label: z.string(),
  color: z.string(),
  sortOrder: z.number(),
  createdAt: z.string().optional(),
  updatedAt: z.string().optional()
});

export type VisitorTagDefinition = z.infer<typeof VisitorTagDefinitionSchema>;

/** Shape-only summary for logs — never includes raw API payload values. */
function summarizeApiResponseForLog(data: unknown): Record<string, unknown> {
  if (data === null) return { kind: 'null' };
  if (data === undefined) return { kind: 'undefined' };
  if (Array.isArray(data)) {
    const first = data[0];
    const nestedKeysSample =
      first !== null && typeof first === 'object' && !Array.isArray(first)
        ? Object.keys(first as object)
            .slice(0, 15)
            .sort()
        : undefined;
    return {
      kind: 'array',
      length: data.length,
      ...(nestedKeysSample?.length ? { nestedKeysSample } : {})
    };
  }
  if (typeof data === 'object') {
    const keys = Object.keys(data as object).sort();
    return { kind: 'object', keyCount: keys.length, keys };
  }
  return { kind: typeof data };
}

function summarizeZodErrorForLog(err: unknown): Record<string, unknown> {
  if (err instanceof z.ZodError) {
    return {
      name: err.name,
      message: err.message,
      issueCount: err.issues.length,
      issues: err.issues.slice(0, 10).map((issue) => ({
        path: issue.path.join('.'),
        code: issue.code
      }))
    };
  }
  if (err instanceof Error) {
    return { name: err.name, message: err.message };
  }
  return { message: String(err) };
}

// Create a base fetch function with proper error handling and authentication
type ApiRequestExtra<T> = {
  /** When the server returns 404, return this value instead of throwing (no JSON parse). */
  notFoundValue?: T;
};

async function apiRequest<T>(
  endpoint: string,
  options: RequestInit = {},
  schema?: z.ZodType<T>,
  extra?: ApiRequestExtra<T>
): Promise<T> {
  const url = `${API_BASE_URL}${endpoint}`;

  try {
    const response = await authenticatedApiFetch(endpoint, options);

    if (
      response.status === 404 &&
      extra &&
      Object.prototype.hasOwnProperty.call(extra, 'notFoundValue')
    ) {
      return extra.notFoundValue as T;
    }

    if (!response.ok) {
      const errorData = await response.text();
      throw new Error(`API Error: ${response.status} - ${errorData}`);
    }

    if (response.status === 204 || response.status === 205) {
      return undefined as T;
    }

    const text = await response.text();
    if (!text.trim()) {
      return undefined as T;
    }

    const data = JSON.parse(text);

    if (schema) {
      try {
        return schema.parse(data);
      } catch (zodError) {
        logger.error('Zod parse error while validating API response', {
          url,
          zod: summarizeZodErrorForLog(zodError),
          responseSummary: summarizeApiResponseForLog(data)
        });
        throw zodError;
      }
    }

    return data;
  } catch (error) {
    if (!isRequestAbortError(error)) {
      logger.error(`API request failed for ${url}:`, error);
    }
    throw error;
  }
}

/** Like apiRequest but returns the response body as a Blob (no JSON parse). */
async function apiRequestBlob(
  endpoint: string,
  options: RequestInit = {}
): Promise<{ blob: Blob; headers: Headers }> {
  const url = `${API_BASE_URL}${endpoint}`;

  const readBodyAsBlob = async (res: Response): Promise<Blob> => {
    if (res.status === 204 || res.status === 205) {
      return new Blob();
    }
    return res.blob();
  };

  try {
    const response = await authenticatedApiFetch(endpoint, options);

    if (!response.ok) {
      const errorData = await response.text();
      throwApiHttpErrorFromBody(response.status, errorData);
    }

    const blob = await readBodyAsBlob(response);
    return { blob, headers: response.headers };
  } catch (error) {
    if (error instanceof ApiHttpError) {
      throw error;
    }
    if (error instanceof Error && error.message.startsWith('Unauthorized:')) {
      const raw = error.message.slice('Unauthorized:'.length).trim();
      throwApiHttpErrorFromBody(401, raw || '{}');
    }
    if (!isRequestAbortError(error)) {
      logger.error(`API request failed for ${url}:`, error);
    }
    throw error;
  }
}

const PatchUserTenantRolesResponseSchema = z.object({
  tenantRoles: z
    .array(
      z.object({
        id: z.string(),
        name: z.string(),
        slug: z.string()
      })
    )
    .nullable()
    .transform((v) => v ?? [])
});

// User API functions
export const usersApi = {
  /** Users in the active company (X-Company-Id), with tenantRoles when applicable. */
  getAll: (search?: string) => {
    const queryParams = search ? `?search=${encodeURIComponent(search)}` : '';
    return apiRequest<User[]>(
      `/companies/me/users${queryParams}`,
      {},
      z.array(UserModelSchema)
    );
  },

  patchTenantRoles: (userId: string, tenantRoleIds: string[]) =>
    apiRequest<{ tenantRoles: { id: string; name: string; slug: string }[] }>(
      `/companies/me/users/${userId}/tenant-roles`,
      {
        method: 'PATCH',
        body: JSON.stringify({
          tenantRoleIds,
          ...(tenantRoleIds.length === 0
            ? { confirmRemoveAllTenantRoles: true }
            : {})
        })
      },
      PatchUserTenantRolesResponseSchema
    ),

  getById: (id: string) =>
    apiRequest<User>(`/users/${id}`, {}, UserModelSchema),

  create: (userData: { name: string; email?: string; password?: string }) =>
    apiRequest<User>(
      '/users',
      {
        method: 'POST',
        body: JSON.stringify(userData)
      },
      UserModelSchema
    ),

  getUserUnits: (userId: string) =>
    apiRequest<unknown[]>(`/users/${userId}/units`, {}),

  setUserUnits: (
    userId: string,
    units: { unitId: string; permissions: string[] }[]
  ) =>
    apiRequest<unknown>(`/users/${userId}/units`, {
      method: 'POST',
      body: JSON.stringify({ units })
    }),

  assignUserToUnit: (
    userId: string,
    unitId: string,
    permissions: string[] = []
  ) =>
    apiRequest<unknown>(`/users/${userId}/units/assign`, {
      method: 'POST',
      body: JSON.stringify({ unitId, permissions })
    }),

  removeUserFromUnit: (userId: string, unitId: string) =>
    apiRequest<unknown>(`/users/${userId}/units/remove`, {
      method: 'POST',
      body: JSON.stringify({ unitId })
    }),

  /** PATCH body: backend applies only present fields; `photoUrl: ''` clears the photo (JSON `null` does not). */
  update: (
    userId: string,
    data: {
      name?: string;
      email?: string;
      password?: string;
      photoUrl?: string;
      roles?: string[];
    }
  ) =>
    apiRequest<User>(
      `/users/${userId}`,
      {
        method: 'PATCH',
        body: JSON.stringify(data)
      },
      UserModelSchema
    )
};

export const desktopTerminalsApi = {
  list: () =>
    apiRequest<DesktopTerminal[]>(
      '/desktop-terminals',
      {},
      z.array(DesktopTerminalSchema)
    ),

  create: (body: {
    name?: string;
    unitId: string;
    defaultLocale: string;
    kioskFullscreen?: boolean;
    contextUnitId?: string;
    counterId?: string;
    kind?: DesktopTerminalKind;
  }) =>
    apiRequest<{ terminal: DesktopTerminal; pairingCode: string }>(
      '/desktop-terminals',
      {
        method: 'POST',
        body: JSON.stringify(body)
      },
      CreateDesktopTerminalResponseSchema
    ),

  update: (
    id: string,
    body: {
      name?: string;
      unitId: string;
      defaultLocale: string;
      kioskFullscreen?: boolean;
      contextUnitId?: string;
      counterId?: string;
      kind?: DesktopTerminalKind;
    }
  ) =>
    apiRequest<void>(`/desktop-terminals/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(body)
    }),

  revoke: (id: string) =>
    apiRequest<void>(`/desktop-terminals/${id}/revoke`, {
      method: 'POST'
    })
};

export const COUNTER_DISPLAY_TOKEN_KEY = 'quokkaq_counter_display_token';
export const COUNTER_DISPLAY_UNIT_KEY = 'quokkaq_counter_display_unitId';

/** Desktop terminal paired for the minimal counter board (above-counter ticket display). */
export const COUNTER_BOARD_TOKEN_KEY = 'quokkaq_counter_board_token';
export const COUNTER_BOARD_UNIT_KEY = 'quokkaq_counter_board_unitId';
/** Set from bootstrap `defaultLocale` (chosen when the pairing code / terminal was created). */
export const COUNTER_BOARD_LOCALE_KEY = 'quokkaq_counter_board_locale';

/** Dispatch after pair/unpair so `WorkplaceDisplayIntlRoot` can re-read locale from localStorage. */
export const COUNTER_BOARD_STORAGE_CHANGED_EVENT =
  'quokkaq:counter-board-storage-changed';

/** Maps API `defaultLocale` to app `en` | `ru` (terminal pairing / bootstrap). */
export function terminalBootstrapDisplayLocale(raw: string): Locale {
  const k = raw.trim().toLowerCase();
  return k === 'ru' ? 'ru' : 'en';
}

const TerminalBootstrapResponseSchema = z.object({
  token: z.string(),
  unitId: z.string(),
  counterId: z.string().nullable().optional(),
  terminalKind: DesktopTerminalKindSchema,
  defaultLocale: z.string(),
  appBaseUrl: z.string(),
  kioskFullscreen: z.boolean()
});

export type TerminalBootstrapResponse = z.infer<
  typeof TerminalBootstrapResponseSchema
>;

/** Public: pair a desktop / counter-display device (no staff JWT). */
export async function terminalAuthBootstrap(
  code: string
): Promise<TerminalBootstrapResponse> {
  const res = await fetch(`${API_BASE_URL}/auth/terminal/bootstrap`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ code: code.trim() })
  });
  const text = await res.text();
  if (!res.ok) {
    throwApiHttpErrorFromBody(res.status, text || '{}');
  }
  return TerminalBootstrapResponseSchema.parse(JSON.parse(text));
}

// Unit API functions
export const unitsApi = {
  getAll: async () => {
    const res = await orvalUnits.getUnits();
    return z.array(UnitModelSchema).parse(res.data ?? []);
  },

  getById: async (id: string) => {
    const res = await orvalUnits.getUnitByID(id, { cache: 'no-store' });
    return UnitModelSchema.parse(res.data);
  },

  /** Workplace units under a service zone (empty if parent is not a service zone). Requires unit membership. */
  getChildWorkplaces: async (unitId: string) => {
    const res = await orvalUnits.getUnitsUnitIdChildWorkplaces(unitId, {
      cache: 'no-store'
    });
    return z.array(UnitModelSchema).parse(res.data ?? []);
  },

  /** Direct child units under a service zone (any kind). Empty if parent is not a service zone. */
  getChildUnits: async (unitId: string) => {
    const res = await orvalUnits.getUnitsUnitIdChildUnits(unitId, {
      cache: 'no-store'
    });
    return z.array(UnitModelSchema).parse(res.data ?? []);
  },

  getServices: (unitId: string) =>
    apiRequest<Service[]>(
      `/units/${unitId}/services`,
      {},
      z.array(ServiceModelSchema)
    ),

  getTickets: async (unitId: string) => {
    const res = await orvalTc.getUnitsUnitIdTickets(unitId, {
      cache: 'no-store'
    });
    return z.array(TicketModelSchema).parse(res.data ?? []);
  },

  getServicesTree: (unitId: string, init?: RequestInit) =>
    apiRequest<Service[]>(
      `/units/${unitId}/services-tree`,
      init ?? {},
      z.array(ServiceModelSchema)
    ),

  create: async (data: {
    name: string;
    code: string;
    companyId: string;
    timezone?: string;
    parentId?: string | null;
    kind?: 'subdivision' | 'service_zone';
    sortOrder?: number;
  }) => {
    const res = await orvalUnits.postUnits({
      name: data.name,
      code: data.code,
      companyId: data.companyId,
      timezone: data.timezone,
      parentId: data.parentId ?? undefined,
      kind: data.kind,
      sortOrder: data.sortOrder
    });
    return UnitModelSchema.parse(res.data);
  },

  update: async (id: string, data: Partial<Unit>) => {
    const res = await orvalUnits.patchUnitsId(
      id,
      data as orvalUnits.ModelsUnit
    );
    return UnitModelSchema.parse(res.data);
  },

  /**
   * Merge `config.kiosk` only (terminal JWT, unit members, or admin).
   * Use from kiosk settings UI instead of `update` when staff/terminal must not be tenant admin.
   */
  patchKioskConfig: async (unitId: string, config: Record<string, unknown>) => {
    const kiosk = (config as { kiosk?: Record<string, unknown> }).kiosk;
    const res = await orvalUnits.patchUnitKioskConfig(unitId, {
      config: {
        kiosk: (kiosk ??
          {}) as orvalUnits.HandlersPatchUnitKioskConfigRequestConfigKiosk
      }
    });
    if (res.status !== 200) {
      const errBody =
        typeof res.data === 'string'
          ? res.data
          : JSON.stringify(res.data ?? {});
      throwApiHttpErrorFromBody(res.status, errBody);
    }
    return UnitModelSchema.parse(res.data);
  },

  createTicket: async (
    unitId: string,
    ticketData: CreateTicketRequestInput
  ) => {
    const normalized = createTicketRequestSchema.parse(ticketData);
    let body: orvalTc.HandlersCreateTicketRequest;
    if (normalized.visitorPhone && normalized.visitorLocale) {
      body = {
        serviceId: normalized.serviceId,
        visitorPhone: normalized.visitorPhone,
        visitorLocale: normalized.visitorLocale
      };
    } else if (normalized.clientId) {
      body = {
        serviceId: normalized.serviceId,
        clientId: normalized.clientId
      };
    } else {
      body = { serviceId: normalized.serviceId };
    }
    const res = await orvalTc.createUnitTicket(unitId, body);
    return TicketModelSchema.parse(res.data);
  },

  // Material and Ad Settings endpoints
  uploadMaterial: async (unitId: string, file: File) => {
    const formData = new FormData();
    formData.append('file', file);

    let token = null;
    if (typeof window !== 'undefined') {
      token = localStorage.getItem('access_token') || null;
    }

    const response = await fetch(`${API_BASE_URL}/units/${unitId}/materials`, {
      method: 'POST',
      headers: {
        ...(token && { Authorization: `Bearer ${token}` })
      },
      body: formData
    });

    if (!response.ok) {
      throw new Error(`Upload failed: ${response.status}`);
    }

    return response.json();
  },

  getMaterials: async (unitId: string) => {
    const res = await orvalUnits.getUnitsUnitIdMaterials(unitId);
    return (res.data ?? []) as Material[];
  },

  deleteMaterial: async (unitId: string, materialId: string) => {
    await orvalUnits.deleteUnitsUnitIdMaterialsMaterialId(unitId, materialId, {
      method: 'DELETE'
    });
  },

  updateAdSettings: async (
    unitId: string,
    settings: {
      width?: number;
      duration?: number;
      activeMaterialIds?: string[];
    }
  ) => {
    const res = await orvalUnits.patchUnitsUnitIdAdSettings(
      unitId,
      settings as orvalUnits.PatchUnitsUnitIdAdSettingsBody
    );
    return UnitModelSchema.parse(res.data);
  },

  getClientVisits: (
    unitId: string,
    clientId: string,
    params?: { limit?: number; cursor?: string }
  ) => {
    const qs = new URLSearchParams();
    if (params?.limit != null) qs.set('limit', String(params.limit));
    if (params?.cursor) qs.set('cursor', params.cursor);
    const suffix = qs.toString() ? `?${qs.toString()}` : '';
    return apiRequest<{ items: Ticket[]; nextCursor?: string | null }>(
      `/units/${unitId}/clients/${clientId}/visits${suffix}`,
      {},
      ClientVisitsResponseSchema
    );
  },

  getClientHistory: (
    unitId: string,
    clientId: string,
    params?: { limit?: number; cursor?: string }
  ) => {
    const qs = new URLSearchParams();
    if (params?.limit != null) qs.set('limit', String(params.limit));
    if (params?.cursor) qs.set('cursor', params.cursor);
    const suffix = qs.toString() ? `?${qs.toString()}` : '';
    return apiRequest<UnitClientHistoryListResponse>(
      `/units/${unitId}/clients/${encodeURIComponent(clientId)}/history${suffix}`,
      { cache: 'no-store' },
      UnitClientHistoryListResponseSchema
    );
  },

  searchClients: (unitId: string, q: string) =>
    apiRequest<UnitClient[]>(
      `/units/${unitId}/clients/search?q=${encodeURIComponent(q)}`,
      { cache: 'no-store' },
      z.array(UnitClientModelSchema)
    ),

  listUnitClients: (
    unitId: string,
    opts?: { q?: string; tagIds?: string[]; limit?: number; cursor?: string }
  ) => {
    const qs = new URLSearchParams();
    if (opts?.q != null && opts.q.trim() !== '') qs.set('q', opts.q.trim());
    if (opts?.tagIds?.length) qs.set('tagIds', opts.tagIds.join(','));
    if (opts?.limit != null) qs.set('limit', String(opts.limit));
    if (opts?.cursor) qs.set('cursor', opts.cursor);
    const suffix = qs.toString() ? `?${qs.toString()}` : '';
    return apiRequest<UnitClientListResponse>(
      `/units/${unitId}/clients${suffix}`,
      { cache: 'no-store' },
      UnitClientListResponseSchema
    );
  },

  getUnitClient: (unitId: string, clientId: string) =>
    apiRequest<UnitClient>(
      `/units/${unitId}/clients/${encodeURIComponent(clientId)}`,
      { cache: 'no-store' },
      UnitClientModelSchema
    ),

  patchUnitClient: (
    unitId: string,
    clientId: string,
    body: {
      firstName?: string;
      lastName?: string;
      phone?: string;
      tagDefinitionIds?: string[];
    }
  ) =>
    apiRequest<UnitClient>(
      `/units/${unitId}/clients/${encodeURIComponent(clientId)}`,
      {
        method: 'PATCH',
        body: JSON.stringify(body)
      },
      UnitClientModelSchema
    ),

  listVisitorTagDefinitions: async (unitId: string) => {
    const res = await orvalUnits.getUnitsUnitIdVisitorTagDefinitions(unitId, {
      cache: 'no-store'
    });
    return z.array(VisitorTagDefinitionSchema).parse(res.data ?? []);
  },

  createVisitorTagDefinition: async (
    unitId: string,
    body: { label: string; color: string; sortOrder?: number }
  ) => {
    const res = await orvalUnits.postUnitsUnitIdVisitorTagDefinitions(
      unitId,
      body
    );
    return VisitorTagDefinitionSchema.parse(res.data);
  },

  patchVisitorTagDefinition: async (
    unitId: string,
    definitionId: string,
    body: { label?: string; color?: string; sortOrder?: number }
  ) => {
    const res =
      await orvalUnits.patchUnitsUnitIdVisitorTagDefinitionsDefinitionId(
        unitId,
        definitionId,
        body
      );
    return VisitorTagDefinitionSchema.parse(res.data);
  },

  deleteVisitorTagDefinition: async (unitId: string, definitionId: string) => {
    await orvalUnits.deleteUnitsUnitIdVisitorTagDefinitionsDefinitionId(
      unitId,
      definitionId,
      { method: 'DELETE' }
    );
  }
};

// Ticket API functions (HTTP via Orval-generated clients + Zod parse)
export const ticketsApi = {
  getAll: () =>
    apiRequest<Ticket[]>('/tickets', {}, z.array(TicketModelSchema)),

  getByUnitId: (unitId: string) => unitsApi.getTickets(unitId),

  getById: async (id: string) => {
    const res = await orvalTc.getTicketsId(id);
    return TicketModelSchema.parse(res.data);
  },

  create: async (ticketData: { unitId: string; serviceId: string }) => {
    const res = await orvalTc.createUnitTicket(ticketData.unitId, {
      serviceId: ticketData.serviceId
    });
    return TicketModelSchema.parse(res.data);
  },

  complete: async (id: string) => {
    const res = await orvalTc.patchTicketsIdStatus(id, { status: 'served' });
    return TicketModelSchema.parse(res.data);
  },

  noShow: async (id: string) => {
    const res = await orvalTc.patchTicketsIdStatus(id, { status: 'no_show' });
    return TicketModelSchema.parse(res.data);
  },

  recall: async (id: string) => {
    const res = await orvalTc.postTicketsIdRecall(id);
    return TicketModelSchema.parse(res.data);
  },

  pick: async (id: string, counterId: string) => {
    const res = await orvalTc.postTicketsIdPick(id, { counterId });
    return TicketModelSchema.parse(res.data);
  },

  confirmArrival: async (id: string) => {
    const res = await orvalTc.patchTicketsIdStatus(id, {
      status: 'in_service'
    });
    return TicketModelSchema.parse(res.data);
  },

  transfer: async (
    id: string,
    transferData: {
      toCounterId?: string;
      toUserId?: string;
      toServiceZoneId?: string;
      toServiceId?: string;
      operatorComment?: string | null;
    }
  ) => {
    const body: orvalTc.HandlersTransferRequest = {};
    if (transferData.toCounterId) body.toCounterId = transferData.toCounterId;
    if (transferData.toUserId) body.toUserId = transferData.toUserId;
    if (transferData.toServiceZoneId) {
      body.toServiceZoneId = transferData.toServiceZoneId;
    }
    if (transferData.toServiceId) body.toServiceId = transferData.toServiceId;
    if (transferData.operatorComment !== undefined) {
      body.operatorComment = transferData.operatorComment ?? undefined;
    }
    const res = await orvalTc.postTicketsIdTransfer(id, body);
    return TicketModelSchema.parse(res.data);
  },

  returnToQueue: async (id: string) => {
    const res = await orvalTc.postTicketsIdReturn(id);
    return TicketModelSchema.parse(res.data);
  },

  updateOperatorComment: async (id: string, operatorComment: string | null) => {
    const res = await orvalTc.patchTicketsIdOperatorComment(id, {
      // Orval generates `string` but the backend accepts JSON null to clear the field.
      operatorComment: operatorComment as string
    });
    return TicketModelSchema.parse(res.data);
  },

  /**
   * Attach or replace visitor while ticket is `called` or `in_service`.
   * Either `clientId` (optional `firstName`/`lastName` to update that client's name; do not send `phone`) OR `firstName` + `lastName` + `phone` without `clientId` (find/create by phone).
   */
  updateTicketVisitor: async (
    id: string,
    body:
      | { clientId: string; firstName?: string; lastName?: string }
      | { firstName: string; lastName: string; phone: string }
  ) => {
    const payload: orvalTc.HandlersPatchTicketVisitorRequest =
      'clientId' in body
        ? {
            clientId: body.clientId,
            firstName: body.firstName,
            lastName: body.lastName
          }
        : {
            firstName: body.firstName,
            lastName: body.lastName,
            phone: body.phone
          };
    const res = await orvalTc.patchTicketsIdVisitor(id, payload);
    return TicketModelSchema.parse(res.data);
  },

  /** Full replacement of visitor tag assignments; `operatorComment` is required (reason for change). */
  setVisitorTags: async (
    id: string,
    body: { tagDefinitionIds: string[]; operatorComment: string }
  ) => {
    const res = await orvalTc.putTicketsIdVisitorTags(id, {
      tagDefinitionIds: body.tagDefinitionIds,
      operatorComment: body.operatorComment
    });
    return TicketModelSchema.parse(res.data);
  }
};

// Booking API functions
export const bookingsApi = {
  create: (bookingData: {
    unitId: string;
    serviceId: string;
    userName?: string;
    userPhone?: string;
    scheduledAt?: string;
  }) =>
    apiRequest<Booking>(
      '/bookings',
      {
        method: 'POST',
        body: JSON.stringify(bookingData)
      },
      BookingModelSchema
    )
};

// Service API functions
export const servicesApi = {
  getAll: () =>
    apiRequest<Service[]>('/services', {}, z.array(ServiceModelSchema)),

  getById: (id: string) =>
    apiRequest<Service>(`/services/${id}`, {}, ServiceModelSchema),

  getByUnitId: (unitId: string) =>
    apiRequest<Service[]>(
      `/services/unit/${unitId}`,
      {},
      z.array(ServiceModelSchema)
    ),

  create: (serviceData: Omit<Service, 'id'>) =>
    apiRequest<Service>(
      '/services',
      {
        method: 'POST',
        body: JSON.stringify(serviceData)
      },
      ServiceModelSchema
    ),

  update: (id: string, serviceData: Partial<Service>) =>
    apiRequest<Service>(
      `/services/${id}`,
      {
        method: 'PUT',
        body: JSON.stringify(serviceData)
      },
      ServiceModelSchema
    ),

  delete: (id: string) =>
    apiRequest<unknown>(`/services/${id}`, {
      method: 'DELETE'
    })
};

// Counter API functions (HTTP via Orval-generated clients + Zod where applicable)
export const countersApi = {
  /** Optional serviceIds limits which waiting tickets are considered; omit or empty = all services in the unit. */
  callNext: async (counterId: string, callData?: { serviceIds?: string[] }) => {
    const body: orvalTc.HandlersCounterCallNextRequest =
      callData?.serviceIds && callData.serviceIds.length > 0
        ? { serviceIds: callData.serviceIds }
        : {};
    const res = await orvalTc.postCountersIdCallNext(counterId, body);
    return res.data as { ok: boolean; ticket?: Ticket; message?: string };
  },

  getByUnitId: async (unitId: string) => {
    const res = await orvalTc.getUnitsUnitIdCounters(unitId);
    return z.array(CounterModelSchema).parse(res.data ?? []);
  },

  getById: async (id: string) => {
    const res = await orvalTc.getCountersId(id);
    return CounterModelSchema.parse(res.data);
  },

  create: async (
    unitId: string,
    data: { name: string; serviceZoneId?: string | null }
  ) => {
    const res = await orvalTc.postUnitsUnitIdCounters(unitId, {
      name: data.name,
      serviceZoneId: data.serviceZoneId ?? undefined
    });
    return CounterModelSchema.parse(res.data);
  },

  update: async (
    id: string,
    data: { name?: string; assignedTo?: string; serviceZoneId?: string | null }
  ) => {
    const res = await orvalTc.putCountersId(id, {
      name: data.name,
      serviceZoneId: data.serviceZoneId ?? undefined
    });
    return CounterModelSchema.parse(res.data);
  },

  delete: async (id: string) => {
    await orvalTc.deleteCountersId(id, { method: 'DELETE' });
  },

  occupy: async (id: string) => {
    const res = await orvalTc.occupyCounter(id);
    return CounterModelSchema.parse(res.data);
  },

  release: async (id: string) => {
    const res = await orvalTc.postCountersIdRelease(id);
    return CounterModelSchema.parse(res.data);
  },

  startBreak: async (id: string) => {
    const res = await orvalTc.postCountersIdBreakStart(id);
    return CounterModelSchema.parse(res.data);
  },

  endBreak: async (id: string) => {
    const res = await orvalTc.postCountersIdBreakEnd(id);
    return CounterModelSchema.parse(res.data);
  }
};

export const ShiftActivityItemSchema = z.object({
  id: z.string(),
  ticketId: z.string(),
  queueNumber: z.string(),
  action: z.string(),
  userId: z.string().nullish(),
  actorName: z.string().nullish(),
  payload: z.record(z.string(), z.unknown()).nullish(),
  createdAt: z.string()
});

export const ShiftActivityResponseSchema = z.object({
  items: z.array(ShiftActivityItemSchema),
  nextCursor: z.string().nullish()
});

export type ShiftActivityItem = z.infer<typeof ShiftActivityItemSchema>;
export type ShiftActivityResponse = z.infer<typeof ShiftActivityResponseSchema>;

const ShiftActivityActorSchema = z.object({
  userId: z.string(),
  name: z.string()
});

const ShiftActivityActorsResponseSchema = z.object({
  items: z.array(ShiftActivityActorSchema)
});

export type ShiftActivityActor = z.infer<typeof ShiftActivityActorSchema>;

export type ShiftActivityQueryOpts = {
  limit?: number;
  cursor?: string;
  counterId?: string;
  userId?: string;
  clientId?: string;
  ticket?: string;
  q?: string;
  weekdays?: number[];
  /** Inclusive YYYY-MM-DD (unit timezone calendar date of history row) */
  dateFrom?: string;
  /** Inclusive YYYY-MM-DD (unit timezone calendar date of history row) */
  dateTo?: string;
};

// Shift API functions
export const shiftApi = {
  getDashboard: (unitId: string) =>
    apiRequest<{
      activeCountersCount: number;
      queueLength: number;
      averageWaitTimeMinutes: number;
    }>(`/units/${unitId}/shift/dashboard`, {}),

  getQueue: (unitId: string) =>
    apiRequest<Array<Ticket & { service: Service }>>(
      `/units/${unitId}/shift/queue`,
      {}
    ),

  getCounters: (unitId: string) =>
    apiRequest<
      Array<{
        id: string;
        name: string;
        assignedTo: string | null;
        onBreak?: boolean;
        sessionState?: 'off_duty' | 'idle' | 'serving' | 'break';
        assignedUser?: { name: string };
        isOccupied: boolean;
        activeTicket: Ticket | null;
        breakStartedAt?: string | null;
      }>
    >(`/units/${unitId}/shift/counters`, {}),

  getActivity: (unitId: string, opts?: ShiftActivityQueryOpts) => {
    const params = new URLSearchParams();
    if (opts?.limit != null && opts.limit > 0) {
      params.set('limit', String(opts.limit));
    }
    if (opts?.cursor) {
      params.set('cursor', opts.cursor);
    }
    const c = opts?.counterId?.trim();
    if (c) params.set('counterId', c);
    const u = opts?.userId?.trim();
    if (u) params.set('userId', u);
    const cl = opts?.clientId?.trim();
    if (cl) params.set('clientId', cl);
    const tk = opts?.ticket?.trim();
    if (tk) params.set('ticket', tk);
    const q = opts?.q?.trim();
    if (q) params.set('q', q);
    if (opts?.weekdays != null && opts.weekdays.length > 0) {
      params.set('weekdays', opts.weekdays.join(','));
    }
    const df = opts?.dateFrom?.trim();
    if (df) params.set('dateFrom', df);
    const dto = opts?.dateTo?.trim();
    if (dto) params.set('dateTo', dto);
    const qs = params.toString();
    const path =
      qs.length > 0
        ? `/units/${unitId}/shift/activity?${qs}`
        : `/units/${unitId}/shift/activity`;
    return apiRequest<ShiftActivityResponse>(
      path,
      {},
      ShiftActivityResponseSchema
    );
  },

  getActivityActors: (unitId: string) =>
    apiRequest<{ items: ShiftActivityActor[] }>(
      `/units/${unitId}/shift/activity/actors`,
      { cache: 'no-store' },
      ShiftActivityActorsResponseSchema
    ),

  forceReleaseCounter: (counterId: string) =>
    apiRequest<{
      counter: Counter;
      completedTicket: Ticket | null;
    }>(`/counters/${counterId}/force-release`, {
      method: 'POST'
    }),

  executeEOD: (unitId: string) =>
    apiRequest<{
      success: boolean;
      ticketsMarked?: number;
      activeTicketsClosed?: number;
      waitingTicketsNoShow?: number;
      countersReleased?: number;
    }>(`/units/${unitId}/shift/eod`, {
      method: 'POST'
    })
};

// Slot API functions
export const slotsApi = {
  getConfig: (unitId: string) =>
    apiRequest<{
      startTime: string;
      endTime: string;
      intervalMinutes: number;
      days: string[];
    }>(`/units/${unitId}/slots/config`, {}),

  updateConfig: (
    unitId: string,
    config: {
      startTime: string;
      endTime: string;
      intervalMinutes: number;
      days: string[];
    }
  ) =>
    apiRequest<{
      startTime: string;
      endTime: string;
      intervalMinutes: number;
      days: string[];
    }>(`/units/${unitId}/slots/config`, {
      method: 'PUT',
      body: JSON.stringify(config)
    }),

  getCapacities: (unitId: string) =>
    apiRequest<
      Array<{
        dayOfWeek: string;
        startTime: string;
        serviceId: string;
        capacity: number;
      }>
    >(`/units/${unitId}/slots/capacities`, {}),

  updateCapacities: (
    unitId: string,
    capacities: Array<{
      dayOfWeek: string;
      startTime: string;
      serviceId: string;
      capacity: number;
    }>
  ) =>
    apiRequest<unknown>(`/units/${unitId}/slots/capacities`, {
      method: 'PUT',
      body: JSON.stringify(capacities)
    }),

  generate: (unitId: string, from: string, to: string) =>
    apiRequest<void>(`/units/${unitId}/slots/generate`, {
      method: 'POST',
      body: JSON.stringify({ from, to })
    }),

  getDay: (unitId: string, date: string) =>
    apiRequest<{
      id: string;
      unitId: string;
      date: string;
      isDayOff: boolean;
      slots: Array<{
        id: string;
        dayScheduleId: string;
        serviceId: string;
        startTime: string;
        capacity: number;
        booked: number;
      }>;
    } | null>(`/units/${unitId}/slots/day/${date}`, {}),

  updateDay: (
    unitId: string,
    date: string,
    data: {
      isDayOff: boolean;
      slots: Array<{
        serviceId: string;
        startTime: string;
        capacity: number;
      }>;
    }
  ) =>
    apiRequest<void>(`/units/${unitId}/slots/day/${date}`, {
      method: 'PUT',
      body: JSON.stringify(data)
    })
};

// Pre-registration API functions
export const preRegistrationsApi = {
  getByUnitId: (unitId: string) =>
    apiRequest<PreRegistration[]>(`/units/${unitId}/pre-registrations`, {}),

  create: (
    unitId: string,
    data: {
      serviceId: string;
      date: string;
      time: string;
      customerFirstName: string;
      customerLastName: string;
      customerPhone: string;
      comment?: string;
    }
  ) =>
    apiRequest<PreRegistration>(`/units/${unitId}/pre-registrations`, {
      method: 'POST',
      body: JSON.stringify(data)
    }),

  update: (
    unitId: string,
    id: string,
    data: {
      serviceId: string;
      date: string;
      time: string;
      customerFirstName: string;
      customerLastName: string;
      customerPhone: string;
      comment?: string;
      status?: string;
      externalEventHref?: string;
      externalEventEtag?: string;
    }
  ) =>
    apiRequest<PreRegistration>(`/units/${unitId}/pre-registrations/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data)
    }),

  getAvailableSlots: (unitId: string, serviceId: string, date: string) =>
    apiRequest<string[]>(
      `/units/${unitId}/pre-registrations/slots?serviceId=${serviceId}&date=${date}`,
      {}
    ),

  validate: (unitId: string, code: string) =>
    apiRequest<PreRegistration>(`/units/${unitId}/pre-registrations/validate`, {
      method: 'POST',
      body: JSON.stringify({ code })
    }),

  redeem: (unitId: string, code: string) =>
    apiRequest<{ success: boolean; ticket?: Ticket; message?: string }>(
      `/units/${unitId}/pre-registrations/redeem`,
      {
        method: 'POST',
        body: JSON.stringify({ code })
      }
    )
};

// Company API functions
export const companiesApi = {
  getUsageMetrics: (companyId: string) =>
    apiRequest<UsageMetrics>(
      `/companies/${companyId}/usage-metrics`,
      {},
      UsageMetricsSchema
    ),

  getMyUsageMetrics: () =>
    apiRequest<UsageMetrics>(`/usage-metrics/me`, {}, UsageMetricsSchema)
};

// Subscription API functions
export const subscriptionsApi = {
  getMySubscription: async () => {
    const res = await orvalTenantBilling.getMySubscription();
    return SubscriptionSchema.parse(res.data);
  },

  /** Tenant catalog: public active plans plus the current org's plan (even if not public). */
  getPlans: async () => {
    const res = await orvalTenantBilling.getMySubscriptionPlans();
    return z.array(SubscriptionPlanSchema).parse(res.data ?? []);
  },

  createCheckout: async (planCode: string) => {
    const res = await orvalTenantBilling.createCheckout({
      planCode
    });
    return z
      .object({
        checkoutUrl: z.string(),
        sessionId: z.string()
      })
      .parse(res.data);
  },

  cancelSubscription: async (subscriptionId: string) => {
    const res = await orvalTenantBilling.postSubscriptionsIdCancel(
      subscriptionId,
      { method: 'POST' }
    );
    return SubscriptionSchema.parse(res.data);
  },

  /** Creates a Yandex Tracker ticket; plan switch applies after support processing. */
  requestPlanChange: async (requestedPlanCode: string) => {
    await orvalTenantBilling.postSubscriptionPlanChangeRequest({
      requestedPlanCode
    });
  },

  /** Marketing-style [REQ] ticket for individual pricing (comment + session user/company). */
  requestCustomTermsLead: async (comment: string) => {
    await orvalTenantBilling.postSubscriptionCustomTermsLeadRequest({
      comment
    });
  }
};

// Invoice API functions
export const invoicesApi = {
  getMyInvoices: async () => {
    const res = await orvalTenantBilling.getMyInvoices();
    return z.array(InvoiceSchema).parse(res.data ?? []);
  },

  getMyInvoiceById: async (invoiceId: string) => {
    const res = await orvalTenantBilling.getInvoicesId(invoiceId);
    return InvoiceSchema.parse(res.data);
  },

  requestYooKassaPaymentLink: async (invoiceId: string) => {
    const res = await orvalTenantBilling.postInvoicesIdYookassaPaymentLink(
      invoiceId,
      { method: 'POST' }
    );
    return z
      .object({
        confirmationUrl: z.string(),
        paymentId: z.string()
      })
      .parse(res.data);
  },

  downloadInvoice: async (invoiceId: string) => {
    const { blob, headers } = await apiRequestBlob(
      `/invoices/${encodeURIComponent(invoiceId)}/download`
    );
    return {
      blob,
      contentDisposition: headers.get('Content-Disposition')
    };
  },

  /** SaaS operator company for invoice header / bank QR (tenant). `null` if not configured (404). */
  getSaaSVendor: async (): Promise<SaasVendor | null> => {
    try {
      const res = await orvalTenantBilling.getInvoicesMeVendor();
      return SaasVendorSchema.parse(res.data);
    } catch (e) {
      if (e instanceof ApiHttpError && e.status === 404) {
        return null;
      }
      throw e;
    }
  }
};

// Company API functions
export const companiesApiExt = {
  completeOnboarding: () =>
    apiRequest<{ success: boolean }>(
      `/companies/me/complete-onboarding`,
      {
        method: 'POST'
      },
      z.object({ success: z.boolean() })
    ),

  getMe: () =>
    apiRequest<CompanyMeResponse>(`/companies/me`, {}, CompanyMeResponseSchema),

  patchMe: (body: {
    name?: string;
    billingEmail?: string;
    billingAddress?: unknown;
    clearBillingAddress?: boolean;
    counterparty?: unknown;
    clearCounterparty?: boolean;
    /** Shape matches PaymentAccountsSchema in @quokkaq/shared-types; validate client-side when needed. */
    paymentAccounts?: PaymentAccount[];
    ssoAccessSource?: SsoAccessSource;
  }) =>
    apiRequest<Company>(
      `/companies/me`,
      {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      },
      CompanySchema
    )
};

function dadataPath(scope: 'tenant' | 'platform', sub: string): string {
  const base = scope === 'tenant' ? '/companies/dadata' : '/platform/dadata';
  return `${base}${sub}`;
}

/** Proxied DaData (Suggestions / Cleaner); requires tenant admin or platform admin JWT. */
export const dadataApi = {
  findPartyByInn: (
    scope: 'tenant' | 'platform',
    inn: string,
    opts?: { kpp?: string; type?: 'LEGAL' | 'INDIVIDUAL' }
  ) =>
    apiRequest<unknown>(
      dadataPath(scope, '/party/find-by-inn'),
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ inn, ...opts })
      },
      z.unknown()
    ),

  suggestParty: (scope: 'tenant' | 'platform', body: Record<string, unknown>) =>
    apiRequest<unknown>(
      dadataPath(scope, '/party/suggest'),
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      },
      z.unknown()
    ),

  suggestAddress: (
    scope: 'tenant' | 'platform',
    body: Record<string, unknown>
  ) =>
    apiRequest<unknown>(
      dadataPath(scope, '/address/suggest'),
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      },
      z.unknown()
    ),

  suggestBank: (scope: 'tenant' | 'platform', body: Record<string, unknown>) =>
    apiRequest<unknown>(
      dadataPath(scope, '/bank/suggest'),
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      },
      z.unknown()
    ),

  cleanAddress: (scope: 'tenant' | 'platform', body: string[]) =>
    apiRequest<unknown>(
      dadataPath(scope, '/address/clean'),
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      },
      z.unknown()
    )
};
