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
  LoginCredentials,
  LoginResponse,
  PreRegistration,
  UnitConfig
} from '@quokkaq/shared-types';

import {
  UserModelSchema,
  ServiceModelSchema,
  UnitModelSchema,
  TicketModelSchema,
  BookingModelSchema,
  CounterModelSchema,
  DesktopTerminalSchema,
  CreateDesktopTerminalResponseSchema
} from '@quokkaq/shared-types';

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

// Base API configuration
const API_BASE_URL = '/api';

// Create a base fetch function with proper error handling and authentication
async function apiRequest<T>(
  endpoint: string,
  options: RequestInit = {},
  schema?: z.ZodType<T>
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

  const config: RequestInit = {
    headers: {
      'Content-Type': 'application/json',
      ...(token && { Authorization: `Bearer ${token}` }), // Add token if available
      ...(currentLocale && { 'Accept-Language': currentLocale }), // Add locale to headers
      ...options.headers
    },
    ...options
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
            const retryConfig = {
              ...options,
              headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${refreshData.accessToken}`,
                ...options.headers
              }
            };

            const retryResponse = await fetch(url, retryConfig);
            if (!retryResponse.ok) {
              throw new Error(
                `API Error: ${retryResponse.status} - ${await retryResponse.text()}`
              );
            }

            const retryData = await retryResponse.json();
            if (schema) {
              return schema.parse(retryData);
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
    apiRequest<Unit>(
      `/units/${id}`,
      { cache: 'no-store' },
      UnitModelSchema
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

  getServicesTree: (unitId: string) =>
    apiRequest<Service[]>(
      `/units/${unitId}/services-tree`,
      {},
      z.array(ServiceModelSchema)
    ),

  create: (data: { name: string; code: string; companyId: string }) =>
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
    ticketData: { serviceId: string; preferredName?: string }
  ) =>
    apiRequest<Ticket>(
      `/units/${unitId}/tickets`,
      {
        method: 'POST',
        body: JSON.stringify(ticketData)
      },
      TicketModelSchema
    ),

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
    })
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
  callNext: (
    counterId: string,
    callData?: { strategy?: 'fifo' | 'by_service'; serviceId?: string }
  ) =>
    apiRequest<{ ok: boolean; ticket?: Ticket; message?: string }>(
      `/counters/${counterId}/call-next`,
      {
        method: 'POST',
        body: JSON.stringify(callData || {})
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
    )
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
        assignedUser?: { name: string };
        isOccupied: boolean;
        activeTicket: Ticket | null;
      }>
    >(`/units/${unitId}/shift/counters`, {}),

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
      activeTicketsClosed: number;
      waitingTicketsNoShow: number;
      countersReleased: number;
      sequencesReset: number;
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
      customerName: string;
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
