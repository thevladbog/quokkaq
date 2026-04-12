import { z } from 'zod';
import { logger } from './logger';

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
  Material,
  PreRegistration,
  UsageMetrics,
  Subscription,
  SubscriptionPlan,
  Invoice,
  Company,
  SaasVendor,
  CompanyMeResponse,
  CatalogItem,
  InvoiceDraftUpsertBody,
  InvoiceDraftCreateBody,
  PaymentAccount
} from '@quokkaq/shared-types';

import {
  UserModelSchema,
  ServiceModelSchema,
  UnitModelSchema,
  TicketModelSchema,
  BookingModelSchema,
  CounterModelSchema,
  DesktopTerminalSchema,
  CreateDesktopTerminalResponseSchema,
  UsageMetricsSchema,
  SubscriptionSchema,
  SubscriptionPlanSchema,
  InvoiceSchema,
  CompanySchema,
  SaasVendorSchema,
  CompanyMeResponseSchema,
  CatalogItemSchema
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

/**
 * Non-OK HTTP response. `message` is a short user-facing summary (never the raw response body).
 * Full body is in `rawBody` when provided (for logging / debugging only).
 */
export class ApiHttpError extends Error {
  readonly status: number;
  readonly code?: string;
  readonly rawBody?: string;

  constructor(
    message: string,
    status: number,
    code?: string,
    rawBody?: string
  ) {
    super(message);
    this.name = 'ApiHttpError';
    this.status = status;
    this.code = code;
    this.rawBody = rawBody;
  }
}

function throwApiHttpErrorFromBody(status: number, errorData: string): never {
  let parsedCode: string | undefined;
  try {
    const j = JSON.parse(errorData) as Record<string, unknown>;
    parsedCode = typeof j.code === 'string' ? j.code : undefined;
    const msg = typeof j.message === 'string' ? j.message.trim() : '';
    if (msg) {
      throw new ApiHttpError(msg, status, parsedCode, errorData);
    }
  } catch (e) {
    if (e instanceof ApiHttpError) {
      throw e;
    }
  }
  const summary = parsedCode
    ? `API Error: ${status} (${parsedCode})`
    : `API Error: ${status}`;
  throw new ApiHttpError(summary, status, parsedCode, errorData);
}

function clearClientAuthSession(): void {
  if (typeof window === 'undefined') {
    return;
  }
  localStorage.removeItem('access_token');
  localStorage.removeItem('refresh_token');
  try {
    window.dispatchEvent(new CustomEvent('auth:logout'));
  } catch (e) {
    logger.error('Failed to dispatch auth:logout event', e);
  }
}

/**
 * Defaults first, then caller headers on top — so explicit `Authorization` (refresh/me)
 * wins over the access token from localStorage, while `Content-Type` from callers no longer
 * wipes auth (the old `...options` after `headers` bug).
 */
function mergeRequestInitHeaders(
  callerHeaders: HeadersInit | undefined,
  authHeaders: Record<string, string>
): Record<string, string> {
  const fromCaller: Record<string, string> = {};
  if (callerHeaders instanceof Headers) {
    callerHeaders.forEach((value, key) => {
      fromCaller[key] = value;
    });
  } else if (Array.isArray(callerHeaders)) {
    for (const pair of callerHeaders) {
      if (pair.length >= 2) fromCaller[pair[0]] = String(pair[1]);
    }
  } else if (callerHeaders && typeof callerHeaders === 'object') {
    Object.assign(fromCaller, callerHeaders as Record<string, string>);
  }
  return { ...authHeaders, ...fromCaller };
}

/** Caller headers without Authorization so retry merges keep the refreshed Bearer token. */
function headersInitWithoutAuthorization(
  callerHeaders: HeadersInit | undefined
): HeadersInit | undefined {
  if (callerHeaders === undefined) {
    return undefined;
  }
  if (callerHeaders instanceof Headers) {
    const h = new Headers();
    callerHeaders.forEach((value, key) => {
      if (key.toLowerCase() !== 'authorization') {
        h.set(key, value);
      }
    });
    return h;
  }
  if (Array.isArray(callerHeaders)) {
    return callerHeaders.filter(
      (pair) => pair.length >= 2 && pair[0].toLowerCase() !== 'authorization'
    );
  }
  const o = { ...(callerHeaders as Record<string, string>) };
  for (const k of Object.keys(o)) {
    if (k.toLowerCase() === 'authorization') {
      delete o[k];
    }
  }
  return o;
}

// Base API configuration
const API_BASE_URL = '/api';

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
  let token = null;
  let refreshToken = null;
  let currentLocale = null;

  // Only access localStorage and navigator on the client side
  if (typeof window !== 'undefined') {
    token = localStorage.getItem('access_token') || null;
    refreshToken = localStorage.getItem('refresh_token') || null;

    // Determine locale from localStorage (if set) or navigator language as fallback
    const lsLocale = localStorage.getItem('NEXT_LOCALE');
    const navLocale = window.navigator?.language?.split('-')[0] || 'en';
    const inferredLocale = lsLocale || navLocale;
    currentLocale = ['en', 'ru'].includes(inferredLocale)
      ? inferredLocale
      : 'en';
  }

  const url = `${API_BASE_URL}${endpoint}`;
  const { headers: callerHeaders, ...restOptions } = options;

  const authHeaders: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(token && { Authorization: `Bearer ${token}` }),
    ...(currentLocale && { 'Accept-Language': currentLocale })
  };

  const config: RequestInit = {
    ...restOptions,
    headers: mergeRequestInitHeaders(callerHeaders, authHeaders)
  };

  try {
    const response = await fetch(url, config);

    // If we get a 401 Unauthorized error, we might need to refresh the token (only on client)
    if (response.status === 401 && typeof window !== 'undefined') {
      // Attempt to refresh the token
      try {
        if (refreshToken) {
          const refreshResponse = await fetch(`${API_BASE_URL}/auth/refresh`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${refreshToken}`
            }
          });

          if (refreshResponse.ok) {
            const refreshData = await refreshResponse.json();
            localStorage.setItem('access_token', refreshData.accessToken);

            // Retry the original request with the new token
            const retryAuthHeaders: Record<string, string> = {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${refreshData.accessToken}`,
              ...(currentLocale && { 'Accept-Language': currentLocale })
            };
            const retryConfig: RequestInit = {
              ...restOptions,
              headers: mergeRequestInitHeaders(
                headersInitWithoutAuthorization(callerHeaders),
                retryAuthHeaders
              )
            };

            const retryResponse = await fetch(url, retryConfig);
            if (
              retryResponse.status === 404 &&
              extra &&
              Object.prototype.hasOwnProperty.call(extra, 'notFoundValue')
            ) {
              return extra.notFoundValue as T;
            }
            if (!retryResponse.ok) {
              throw new Error(
                `API Error: ${retryResponse.status} - ${await retryResponse.text()}`
              );
            }

            if (retryResponse.status === 204 || retryResponse.status === 205) {
              return undefined as T;
            }

            if (retryResponse.headers.get('Content-Length') === '0') {
              return undefined as T;
            }

            const retryText = await retryResponse.text();
            if (!retryText.trim()) {
              return undefined as T;
            }

            const retryData = JSON.parse(retryText);

            if (schema) {
              try {
                return schema.parse(retryData);
              } catch (zodError) {
                logger.error('Zod parse error while validating API response', {
                  url,
                  zod: summarizeZodErrorForLog(zodError),
                  responseSummary: summarizeApiResponseForLog(retryData)
                });
                throw zodError;
              }
            }

            return retryData;
          }
        }
      } catch (refreshError) {
        logger.error('Token refresh failed:', refreshError);
      }

      // If refresh failed or no refresh token, clear stored tokens
      localStorage.removeItem('access_token');
      localStorage.removeItem('refresh_token');

      // Notify the app that auth is no longer valid so UI can react (logout/redirect)
      try {
        if (typeof window !== 'undefined') {
          // Use a custom event so components can react to global unauthenticated state
          window.dispatchEvent(new CustomEvent('auth:logout'));
        }
      } catch (e) {
        logger.error('Failed to dispatch auth:logout event', e);
      }

      throw new Error(`Unauthorized: ${await response.text()}`);
    }

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

    // Validate data against schema if provided
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
    logger.error(`API request failed for ${url}:`, error);
    throw error;
  }
}

/** Like apiRequest but returns the response body as a Blob (no JSON parse). */
async function apiRequestBlob(
  endpoint: string,
  options: RequestInit = {}
): Promise<{ blob: Blob; headers: Headers }> {
  let token = null;
  let refreshToken = null;
  let currentLocale = null;

  if (typeof window !== 'undefined') {
    token = localStorage.getItem('access_token') || null;
    refreshToken = localStorage.getItem('refresh_token') || null;

    const lsLocale = localStorage.getItem('NEXT_LOCALE');
    const navLocale = window.navigator?.language?.split('-')[0] || 'en';
    const inferredLocale = lsLocale || navLocale;
    currentLocale = ['en', 'ru'].includes(inferredLocale)
      ? inferredLocale
      : 'en';
  }

  const url = `${API_BASE_URL}${endpoint}`;
  const { headers: callerHeadersBlob, ...restOptionsBlob } = options;

  const authHeadersBlob: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(token && { Authorization: `Bearer ${token}` }),
    ...(currentLocale && { 'Accept-Language': currentLocale })
  };

  const config: RequestInit = {
    ...restOptionsBlob,
    headers: mergeRequestInitHeaders(callerHeadersBlob, authHeadersBlob)
  };

  const readBodyAsBlob = async (res: Response): Promise<Blob> => {
    if (res.status === 204 || res.status === 205) {
      return new Blob();
    }
    return res.blob();
  };

  try {
    const response = await fetch(url, config);

    if (response.status === 401 && typeof window !== 'undefined') {
      try {
        if (refreshToken) {
          const refreshResponse = await fetch(`${API_BASE_URL}/auth/refresh`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${refreshToken}`
            }
          });

          if (refreshResponse.ok) {
            const refreshData = await refreshResponse.json();
            localStorage.setItem('access_token', refreshData.accessToken);

            const retryAuthHeadersBlob: Record<string, string> = {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${refreshData.accessToken}`,
              ...(currentLocale && { 'Accept-Language': currentLocale })
            };
            const retryConfig: RequestInit = {
              ...restOptionsBlob,
              headers: mergeRequestInitHeaders(
                headersInitWithoutAuthorization(callerHeadersBlob),
                retryAuthHeadersBlob
              )
            };

            const retryResponse = await fetch(url, retryConfig);
            if (!retryResponse.ok) {
              const retryErrText = await retryResponse.text();
              throwApiHttpErrorFromBody(retryResponse.status, retryErrText);
            }
            const retryBlob = await readBodyAsBlob(retryResponse);
            return { blob: retryBlob, headers: retryResponse.headers };
          }
        }
      } catch (refreshError) {
        if (refreshError instanceof ApiHttpError) {
          if (refreshError.status === 401) {
            clearClientAuthSession();
          }
          throw refreshError;
        }
        logger.error('Token refresh failed:', refreshError);
      }

      clearClientAuthSession();

      const unauthorizedBody = await response.text();
      throwApiHttpErrorFromBody(401, unauthorizedBody);
    }

    if (!response.ok) {
      const errorData = await response.text();
      throwApiHttpErrorFromBody(response.status, errorData);
    }

    const blob = await readBodyAsBlob(response);
    return { blob, headers: response.headers };
  } catch (error) {
    logger.error(`API request failed for ${url}:`, error);
    throw error;
  }
}

// Auth API functions
export const authApi = {
  login: (credentials: { email: string; password: string }) =>
    apiRequest<{ token: string }>('/auth/login', {
      method: 'POST',
      body: JSON.stringify(credentials)
    }).then((res) => ({ accessToken: res.token })), // Map 'token' to 'accessToken' for frontend compatibility

  me: (token: string) =>
    apiRequest<User>(
      '/auth/me',
      {
        headers: {
          Authorization: `Bearer ${token}`
        }
      },
      UserModelSchema
    ),

  getMe: () => apiRequest<User>('/auth/me', {}, UserModelSchema),

  refresh: (refreshToken: string) =>
    apiRequest<{ accessToken: string }>('/auth/refresh', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${refreshToken}`
      }
    })
};

// User API functions
export const usersApi = {
  getAll: (search?: string) => {
    const queryParams = search ? `?search=${encodeURIComponent(search)}` : '';
    return apiRequest<User[]>(
      `/users${queryParams}`,
      {},
      z.array(UserModelSchema)
    );
  },

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

  update: (
    userId: string,
    data: {
      name?: string;
      email?: string;
      password?: string;
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

// Unit API functions
export const unitsApi = {
  getAll: () => apiRequest<Unit[]>('/units', {}, z.array(UnitModelSchema)),

  getById: (id: string) =>
    apiRequest<Unit>(`/units/${id}`, { cache: 'no-store' }, UnitModelSchema),

  /** Workplace units under a service zone (empty if parent is not a service zone). Requires unit membership. */
  getChildWorkplaces: (unitId: string) =>
    apiRequest<Unit[]>(
      `/units/${unitId}/child-workplaces`,
      { cache: 'no-store' },
      z.array(UnitModelSchema)
    ),

  /** Direct child units under a service zone (any kind). Empty if parent is not a service zone. */
  getChildUnits: (unitId: string) =>
    apiRequest<Unit[]>(
      `/units/${unitId}/child-units`,
      { cache: 'no-store' },
      z.array(UnitModelSchema)
    ),

  getServices: (unitId: string) =>
    apiRequest<Service[]>(
      `/units/${unitId}/services`,
      {},
      z.array(ServiceModelSchema)
    ),

  getTickets: (unitId: string) =>
    apiRequest<Ticket[]>(
      `/units/${unitId}/tickets`,
      {},
      z.array(TicketModelSchema)
    ),

  getServicesTree: (unitId: string, init?: RequestInit) =>
    apiRequest<Service[]>(
      `/units/${unitId}/services-tree`,
      init ?? {},
      z.array(ServiceModelSchema)
    ),

  create: (data: {
    name: string;
    code: string;
    companyId: string;
    timezone?: string;
    parentId?: string | null;
    kind?: 'subdivision' | 'service_zone';
    sortOrder?: number;
  }) =>
    apiRequest<Unit>('/units', {
      method: 'POST',
      body: JSON.stringify(data)
    }),

  update: (id: string, data: Partial<Unit>) =>
    apiRequest<Unit>(`/units/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(data)
    }),

  createTicket: (
    unitId: string,
    ticketData: { serviceId: string; clientId?: string }
  ) => {
    const body: { serviceId: string; clientId?: string } = {
      serviceId: ticketData.serviceId
    };
    const cid = ticketData.clientId?.trim();
    if (cid) body.clientId = cid;
    return apiRequest<Ticket>(
      `/units/${unitId}/tickets`,
      {
        method: 'POST',
        body: JSON.stringify(body)
      },
      TicketModelSchema
    );
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

  getMaterials: (unitId: string) =>
    apiRequest<Material[]>(`/units/${unitId}/materials`, {}),

  deleteMaterial: (unitId: string, materialId: string) =>
    apiRequest<unknown>(`/units/${unitId}/materials/${materialId}`, {
      method: 'DELETE'
    }),

  updateAdSettings: (
    unitId: string,
    settings: {
      width?: number;
      duration?: number;
      activeMaterialIds?: string[];
    }
  ) =>
    apiRequest<Unit>(`/units/${unitId}/ad-settings`, {
      method: 'PATCH',
      body: JSON.stringify(settings)
    }),

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

  searchClients: (unitId: string, q: string) =>
    apiRequest<UnitClient[]>(
      `/units/${unitId}/clients/search?q=${encodeURIComponent(q)}`,
      { cache: 'no-store' },
      z.array(UnitClientModelSchema)
    ),

  listVisitorTagDefinitions: (unitId: string) =>
    apiRequest<VisitorTagDefinition[]>(
      `/units/${unitId}/visitor-tag-definitions`,
      { cache: 'no-store' },
      z.array(VisitorTagDefinitionSchema)
    ),

  createVisitorTagDefinition: (
    unitId: string,
    body: { label: string; color: string; sortOrder?: number }
  ) =>
    apiRequest<VisitorTagDefinition>(
      `/units/${unitId}/visitor-tag-definitions`,
      {
        method: 'POST',
        body: JSON.stringify(body)
      },
      VisitorTagDefinitionSchema
    ),

  patchVisitorTagDefinition: (
    unitId: string,
    definitionId: string,
    body: { label?: string; color?: string; sortOrder?: number }
  ) =>
    apiRequest<VisitorTagDefinition>(
      `/units/${unitId}/visitor-tag-definitions/${definitionId}`,
      {
        method: 'PATCH',
        body: JSON.stringify(body)
      },
      VisitorTagDefinitionSchema
    ),

  deleteVisitorTagDefinition: (unitId: string, definitionId: string) =>
    apiRequest<void>(
      `/units/${unitId}/visitor-tag-definitions/${definitionId}`,
      { method: 'DELETE' }
    )
};

// Ticket API functions
export const ticketsApi = {
  getAll: () =>
    apiRequest<Ticket[]>('/tickets', {}, z.array(TicketModelSchema)),

  getByUnitId: (unitId: string) =>
    apiRequest<Ticket[]>(
      `/units/${unitId}/tickets`,
      {},
      z.array(TicketModelSchema)
    ),

  getById: (id: string) =>
    apiRequest<Ticket>(`/tickets/${id}`, {}, TicketModelSchema),

  create: (ticketData: { unitId: string; serviceId: string }) =>
    apiRequest<Ticket>(
      '/tickets',
      {
        method: 'POST',
        body: JSON.stringify(ticketData)
      },
      TicketModelSchema
    ),

  complete: (id: string) =>
    apiRequest<Ticket>(
      `/tickets/${id}/status`,
      {
        method: 'PATCH',
        body: JSON.stringify({ status: 'served' })
      },
      TicketModelSchema
    ),

  noShow: (id: string) =>
    apiRequest<Ticket>(
      `/tickets/${id}/status`,
      {
        method: 'PATCH',
        body: JSON.stringify({ status: 'no_show' })
      },
      TicketModelSchema
    ),

  recall: (id: string) =>
    apiRequest<Ticket>(
      `/tickets/${id}/recall`,
      {
        method: 'POST'
      },
      TicketModelSchema
    ),

  pick: (id: string, counterId: string) =>
    apiRequest<Ticket>(
      `/tickets/${id}/pick`,
      {
        method: 'POST',
        body: JSON.stringify({ counterId })
      },
      TicketModelSchema
    ),

  confirmArrival: (id: string) =>
    apiRequest<Ticket>(
      `/tickets/${id}/status`,
      {
        method: 'PATCH',
        body: JSON.stringify({ status: 'in_service' })
      },
      TicketModelSchema
    ),

  transfer: (
    id: string,
    transferData: { toCounterId?: string; toUserId?: string }
  ) =>
    apiRequest<Ticket>(
      `/tickets/${id}/transfer`,
      {
        method: 'POST',
        body: JSON.stringify(transferData)
      },
      TicketModelSchema
    ),

  returnToQueue: (id: string) =>
    apiRequest<Ticket>(
      `/tickets/${id}/return`,
      {
        method: 'POST'
      },
      TicketModelSchema
    ),

  updateOperatorComment: (id: string, operatorComment: string | null) =>
    apiRequest<Ticket>(
      `/tickets/${id}/operator-comment`,
      {
        method: 'PATCH',
        body: JSON.stringify({ operatorComment })
      },
      TicketModelSchema
    ),

  /**
   * Attach or replace visitor while ticket is `called` or `in_service`.
   * Either `clientId` (optional `firstName`/`lastName` to update that client's name; do not send `phone`) OR `firstName` + `lastName` + `phone` without `clientId` (find/create by phone).
   */
  updateTicketVisitor: (
    id: string,
    body:
      | { clientId: string; firstName?: string; lastName?: string }
      | { firstName: string; lastName: string; phone: string }
  ) =>
    apiRequest<Ticket>(
      `/tickets/${id}/visitor`,
      {
        method: 'PATCH',
        body: JSON.stringify(body)
      },
      TicketModelSchema
    ),

  /** Full replacement of visitor tag assignments; `operatorComment` is required (reason for change). */
  setVisitorTags: (
    id: string,
    body: { tagDefinitionIds: string[]; operatorComment: string }
  ) =>
    apiRequest<Ticket>(
      `/tickets/${id}/visitor-tags`,
      {
        method: 'PUT',
        body: JSON.stringify({
          tagDefinitionIds: body.tagDefinitionIds,
          operatorComment: body.operatorComment
        })
      },
      TicketModelSchema
    )
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

// Counter API functions
export const countersApi = {
  /** Optional serviceIds limits which waiting tickets are considered; omit or empty = all services in the unit. */
  callNext: (counterId: string, callData?: { serviceIds?: string[] }) =>
    apiRequest<{ ok: boolean; ticket?: Ticket; message?: string }>(
      `/counters/${counterId}/call-next`,
      {
        method: 'POST',
        body: JSON.stringify(
          callData?.serviceIds && callData.serviceIds.length > 0
            ? { serviceIds: callData.serviceIds }
            : {}
        )
      }
    ),

  getByUnitId: (unitId: string) =>
    apiRequest<Counter[]>(
      `/units/${unitId}/counters`,
      {},
      z.array(CounterModelSchema)
    ),

  create: (unitId: string, data: { name: string }) =>
    apiRequest<Counter>(
      `/units/${unitId}/counters`,
      {
        method: 'POST',
        body: JSON.stringify(data)
      },
      CounterModelSchema
    ),

  update: (id: string, data: { name?: string; assignedTo?: string }) =>
    apiRequest<Counter>(
      `/counters/${id}`,
      {
        method: 'PATCH',
        body: JSON.stringify(data)
      },
      CounterModelSchema
    ),

  delete: (id: string) =>
    apiRequest<unknown>(`/counters/${id}`, {
      method: 'DELETE'
    }),

  occupy: (id: string) =>
    apiRequest<Counter>(
      `/counters/${id}/occupy`,
      {
        method: 'POST'
      },
      CounterModelSchema
    ),

  release: (id: string) =>
    apiRequest<Counter>(
      `/counters/${id}/release`,
      {
        method: 'POST'
      },
      CounterModelSchema
    ),

  startBreak: (id: string) =>
    apiRequest<Counter>(
      `/counters/${id}/break/start`,
      {
        method: 'POST'
      },
      CounterModelSchema
    ),

  endBreak: (id: string) =>
    apiRequest<Counter>(
      `/counters/${id}/break/end`,
      {
        method: 'POST'
      },
      CounterModelSchema
    )
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

  update: (unitId: string, id: string, data: Partial<PreRegistration>) =>
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
  getMySubscription: () =>
    apiRequest<Subscription>(`/subscriptions/me`, {}, SubscriptionSchema),

  getPlans: () =>
    apiRequest<SubscriptionPlan[]>(
      `/subscriptions/plans`,
      {},
      z.array(SubscriptionPlanSchema)
    ),

  createCheckout: (planCode: string) =>
    apiRequest<{ checkoutUrl: string; sessionId: string }>(
      `/subscriptions/checkout`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ planCode })
      },
      z.object({
        checkoutUrl: z.string(),
        sessionId: z.string()
      })
    ),

  cancelSubscription: (subscriptionId: string) =>
    apiRequest<Subscription>(
      `/subscriptions/${subscriptionId}/cancel`,
      {
        method: 'POST'
      },
      SubscriptionSchema
    )
};

// Invoice API functions
export const invoicesApi = {
  getMyInvoices: () =>
    apiRequest<Invoice[]>(`/invoices/me`, {}, z.array(InvoiceSchema)),

  getMyInvoiceById: (invoiceId: string) =>
    apiRequest<Invoice>(
      `/invoices/${encodeURIComponent(invoiceId)}`,
      {},
      InvoiceSchema
    ),

  requestYooKassaPaymentLink: (invoiceId: string) =>
    apiRequest<{ confirmationUrl: string; paymentId: string }>(
      `/invoices/${encodeURIComponent(invoiceId)}/yookassa-payment-link`,
      { method: 'POST' },
      z.object({
        confirmationUrl: z.string(),
        paymentId: z.string()
      })
    ),

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
  getSaaSVendor: () =>
    apiRequest<SaasVendor | null>(`/invoices/me/vendor`, {}, SaasVendorSchema, {
      notFoundValue: null
    })
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

export const PlatformFeaturesSchema = z.object({
  dadata: z.boolean(),
  dadataCleaner: z.boolean()
});

export type PlatformListResponse<T> = {
  items: T[];
  total: number;
  limit: number;
  offset: number;
};

function platformListResponseSchema<T extends z.ZodTypeAny>(itemSchema: T) {
  return z.object({
    items: z.array(itemSchema),
    total: z.number(),
    limit: z.number(),
    offset: z.number()
  });
}

function platformQueryString(
  params: Record<string, string | number | undefined>
): string {
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === '') continue;
    sp.set(k, String(v));
  }
  const q = sp.toString();
  return q ? `?${q}` : '';
}

/** SaaS operator APIs (`platform_admin` role only). */
export const platformApi = {
  getFeatures: () =>
    apiRequest<{ dadata: boolean; dadataCleaner: boolean }>(
      `/platform/features`,
      {},
      PlatformFeaturesSchema
    ),

  listCompanies: (opts?: {
    search?: string;
    limit?: number;
    offset?: number;
  }) =>
    apiRequest<PlatformListResponse<Company>>(
      `/platform/companies${platformQueryString({
        search: opts?.search,
        limit: opts?.limit,
        offset: opts?.offset
      })}`,
      {},
      platformListResponseSchema(CompanySchema)
    ),

  getCompany: (id: string) =>
    apiRequest<Company>(
      `/platform/companies/${encodeURIComponent(id)}`,
      {},
      CompanySchema
    ),

  getSaaSOperatorCompany: () =>
    apiRequest<Company>(`/platform/saas-operator-company`, {}, CompanySchema),

  patchCompany: (
    id: string,
    body: {
      name?: string;
      billingEmail?: string;
      billingAddress?: unknown;
      clearBillingAddress?: boolean;
      counterparty?: unknown;
      clearCounterparty?: boolean;
      /** Shape matches PaymentAccountsSchema in @quokkaq/shared-types; validate client-side when needed. */
      paymentAccounts?: PaymentAccount[];
      isSaasOperator?: boolean;
    }
  ) =>
    apiRequest<Company>(
      `/platform/companies/${encodeURIComponent(id)}`,
      {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      },
      CompanySchema
    ),

  listSubscriptions: (opts?: { limit?: number; offset?: number }) =>
    apiRequest<PlatformListResponse<Subscription>>(
      `/platform/subscriptions${platformQueryString({
        limit: opts?.limit,
        offset: opts?.offset
      })}`,
      {},
      platformListResponseSchema(SubscriptionSchema)
    ),

  createSubscription: (body: {
    companyId: string;
    planId: string;
    status?: string;
    currentPeriodStart?: string;
    currentPeriodEnd?: string;
    trialEnd?: string | null;
  }) =>
    apiRequest<Subscription>(
      `/platform/subscriptions`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      },
      SubscriptionSchema
    ),

  patchSubscription: (
    id: string,
    body: Partial<{
      status: string;
      currentPeriodStart: string;
      currentPeriodEnd: string;
      cancelAtPeriodEnd: boolean;
      trialEnd: string | null;
      planId: string;
      pendingPlanId: string;
      pendingEffectiveAt: string;
      clearPending: boolean;
    }>
  ) =>
    apiRequest<Subscription>(
      `/platform/subscriptions/${encodeURIComponent(id)}`,
      {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      },
      SubscriptionSchema
    ),

  listSubscriptionPlans: () =>
    apiRequest<SubscriptionPlan[]>(
      `/platform/subscription-plans`,
      {},
      z.array(SubscriptionPlanSchema)
    ),

  createSubscriptionPlan: (body: {
    name: string;
    code: string;
    price: number;
    currency?: string;
    interval?: string;
    features?: unknown;
    limits?: unknown;
    isActive?: boolean;
  }) =>
    apiRequest<SubscriptionPlan>(
      `/platform/subscription-plans`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      },
      SubscriptionPlanSchema
    ),

  updateSubscriptionPlan: (
    id: string,
    body: {
      name: string;
      code: string;
      price: number;
      currency?: string;
      interval?: string;
      features?: unknown;
      limits?: unknown;
      isActive?: boolean;
    }
  ) =>
    apiRequest<SubscriptionPlan>(
      `/platform/subscription-plans/${encodeURIComponent(id)}`,
      {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      },
      SubscriptionPlanSchema
    ),

  listCatalogItems: (opts?: { limit?: number; offset?: number }) =>
    apiRequest<PlatformListResponse<CatalogItem>>(
      `/platform/catalog-items${platformQueryString({
        limit: opts?.limit,
        offset: opts?.offset
      })}`,
      {},
      platformListResponseSchema(CatalogItemSchema)
    ),

  getCatalogItem: (id: string) =>
    apiRequest<CatalogItem>(
      `/platform/catalog-items/${encodeURIComponent(id)}`,
      {},
      CatalogItemSchema
    ),

  createCatalogItem: (body: {
    name: string;
    printName?: string;
    unit?: string;
    article?: string;
    defaultPriceMinor: number;
    currency?: string;
    vatExempt?: boolean;
    vatRatePercent?: number | null;
    subscriptionPlanId?: string | null;
    isActive?: boolean;
  }) =>
    apiRequest<CatalogItem>(
      `/platform/catalog-items`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      },
      CatalogItemSchema
    ),

  patchCatalogItem: (
    id: string,
    body: Partial<{
      name: string;
      printName: string;
      unit: string;
      article: string;
      defaultPriceMinor: number;
      currency: string;
      vatExempt: boolean;
      vatRatePercent: number | null;
      subscriptionPlanId: string | null;
      isActive: boolean;
    }>
  ) =>
    apiRequest<CatalogItem>(
      `/platform/catalog-items/${encodeURIComponent(id)}`,
      {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      },
      CatalogItemSchema
    ),

  deleteCatalogItem: (id: string) =>
    apiRequest<void>(`/platform/catalog-items/${encodeURIComponent(id)}`, {
      method: 'DELETE'
    }),

  listInvoices: (opts?: {
    companyId?: string;
    limit?: number;
    offset?: number;
  }) =>
    apiRequest<PlatformListResponse<Invoice & { subscription?: Subscription }>>(
      `/platform/invoices${platformQueryString({
        companyId: opts?.companyId,
        limit: opts?.limit,
        offset: opts?.offset
      })}`,
      {},
      platformListResponseSchema(InvoiceSchema)
    ),

  createInvoice: (body: InvoiceDraftCreateBody) =>
    apiRequest<Invoice>(
      `/platform/invoices`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      },
      InvoiceSchema
    ),

  getPlatformInvoice: (id: string) =>
    apiRequest<Invoice>(
      `/platform/invoices/${encodeURIComponent(id)}`,
      {},
      InvoiceSchema
    ),

  patchInvoiceDraft: (id: string, body: InvoiceDraftUpsertBody) =>
    apiRequest<Invoice>(
      `/platform/invoices/${encodeURIComponent(id)}/draft`,
      {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      },
      InvoiceSchema
    ),

  issueInvoice: (id: string) =>
    apiRequest<Invoice>(
      `/platform/invoices/${encodeURIComponent(id)}/issue`,
      { method: 'POST' },
      InvoiceSchema
    ),

  patchInvoice: (
    id: string,
    body: Partial<{
      status: string;
      paidAt: string | null;
      subscriptionId: string;
      clearSubscriptionId: boolean;
    }>
  ) =>
    apiRequest<Invoice>(
      `/platform/invoices/${encodeURIComponent(id)}`,
      {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      },
      InvoiceSchema
    )
};
