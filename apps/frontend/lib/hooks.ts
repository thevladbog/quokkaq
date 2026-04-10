import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useRouter } from '@/src/i18n/navigation';
import {
  usersApi,
  unitsApi,
  ticketsApi,
  bookingsApi,
  countersApi,
  authApi,
  servicesApi,
  Unit,
  Service
} from '../lib/api';

// User-related hooks
export const useUsers = (search?: string) => {
  return useQuery({
    queryKey: ['users', search],
    queryFn: () => usersApi.getAll(search)
  });
};

export const useUser = (id: string) => {
  return useQuery({
    queryKey: ['users', id],
    queryFn: () => usersApi.getById(id)
  });
};

export const useCreateUser = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (userData: {
      name: string;
      email?: string;
      password?: string;
    }) => usersApi.create(userData),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['users'] });
    }
  });
};

// Unit-related hooks
export const useUnits = () => {
  return useQuery({
    queryKey: ['units'],
    queryFn: () => unitsApi.getAll()
  });
};

export const useUnit = (
  id: string,
  options: {
    refetchInterval?: number;
    refetchOnMount?: boolean | 'always';
  } = {}
) => {
  return useQuery({
    queryKey: ['units', id],
    queryFn: () => unitsApi.getById(id),
    enabled: !!id,
    refetchInterval: options.refetchInterval,
    refetchOnMount: options.refetchOnMount
  });
};

export const useCreateUnit = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (unitData: { name: string; code: string; companyId: string }) =>
      unitsApi.create(unitData),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['units'] });
    }
  });
};

export const useUpdateUnit = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, ...data }: { id: string } & Partial<Unit>) =>
      unitsApi.update(id, data),
    onSuccess: (data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['units'] });
      queryClient.invalidateQueries({ queryKey: ['units', variables.id] });
      queryClient.invalidateQueries({ queryKey: ['unit', variables.id] });
    }
  });
};

export const useUnitServices = (unitId: string) => {
  return useQuery({
    queryKey: ['units', unitId, 'services'],
    queryFn: () => unitsApi.getServices(unitId),
    enabled: !!unitId
  });
};

export const useUnitServicesTree = (unitId: string) => {
  return useQuery({
    queryKey: ['units', unitId, 'services-tree'],
    queryFn: () => unitsApi.getServicesTree(unitId),
    enabled: !!unitId
  });
};

// User-unit relationship hooks
export function useUpdateUser() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      userId,
      data
    }: {
      userId: string;
      data: {
        name?: string;
        email?: string;
        password?: string;
        roles?: string[];
      };
    }) => usersApi.update(userId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['users'] });
    }
  });
}

export const useUserUnits = (
  userId: string,
  options: { enabled?: boolean } = {}
) => {
  return useQuery({
    queryKey: ['users', userId, 'units'],
    queryFn: () => usersApi.getUserUnits(userId),
    enabled: options.enabled !== undefined ? options.enabled : !!userId
  });
};

export const useSetUserUnits = () => {
  return useMutation({
    mutationFn: ({
      userId,
      units
    }: {
      userId: string;
      units: { unitId: string; permissions: string[] }[];
    }) => usersApi.setUserUnits(userId, units)
  });
};

export function useCurrentUser() {
  const { token, isAuthenticated } = useAuth();
  return useQuery({
    queryKey: ['me', token],
    queryFn: () => authApi.me(token!),
    enabled: isAuthenticated && !!token
  });
}

export const useAssignUserToUnit = () => {
  return useMutation({
    mutationFn: ({
      userId,
      unitId,
      permissions
    }: {
      userId: string;
      unitId: string;
      permissions?: string[];
    }) => usersApi.assignUserToUnit(userId, unitId, permissions)
  });
};

export const useRemoveUserFromUnit = () => {
  return useMutation({
    mutationFn: ({ userId, unitId }: { userId: string; unitId: string }) =>
      usersApi.removeUserFromUnit(userId, unitId)
  });
};

// Ticket-related hooks
export const useTickets = (
  unitId?: string,
  options: { enabled?: boolean } = {}
) => {
  return useQuery({
    queryKey: unitId ? ['tickets', unitId] : ['tickets'],
    queryFn: () =>
      unitId ? ticketsApi.getByUnitId(unitId) : ticketsApi.getAll(),
    enabled: options.enabled ?? (!!unitId || options.enabled === undefined)
  });
};

export const useTicket = (id: string) => {
  return useQuery({
    queryKey: ['tickets', id],
    queryFn: () => ticketsApi.getById(id)
  });
};

export const useCreateTicket = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (ticketData: { unitId: string; serviceId: string }) =>
      ticketsApi.create(ticketData),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tickets'] });
      queryClient.invalidateQueries({ queryKey: ['units'] });
    }
  });
};

export const useCompleteTicket = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => ticketsApi.complete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tickets'] });
    }
  });
};

export const useNoShowTicket = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => ticketsApi.noShow(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tickets'] });
    }
  });
};

export const useRecallTicket = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => ticketsApi.recall(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tickets'] });
    }
  });
};

export const usePickTicket = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, counterId }: { id: string; counterId: string }) =>
      ticketsApi.pick(id, counterId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tickets'] });
    }
  });
};

export const useConfirmArrivalTicket = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => ticketsApi.confirmArrival(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tickets'] });
    }
  });
};

export const useTransferTicket = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (transferData: {
      id: string;
      toCounterId?: string;
      toUserId?: string;
    }) =>
      ticketsApi.transfer(transferData.id, {
        toCounterId: transferData.toCounterId,
        toUserId: transferData.toUserId
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tickets'] });
    }
  });
};

export const useReturnToQueueTicket = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => ticketsApi.returnToQueue(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tickets'] });
    }
  });
};

export const useCreateTicketInUnit = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (createData: {
      unitId: string;
      serviceId: string;
      preferredName?: string;
    }) =>
      unitsApi.createTicket(createData.unitId, {
        serviceId: createData.serviceId,
        preferredName: createData.preferredName
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tickets'] });
      queryClient.invalidateQueries({ queryKey: ['units'] });
    }
  });
};

// Booking-related hooks
export const useCreateBooking = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (bookingData: {
      unitId: string;
      serviceId: string;
      userName?: string;
      userPhone?: string;
      scheduledAt?: string;
    }) => bookingsApi.create(bookingData),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['bookings'] });
    }
  });
};

// Counter-related hooks
export const useCounters = (unitId: string) => {
  return useQuery({
    queryKey: ['units', unitId, 'counters'],
    queryFn: () => countersApi.getByUnitId(unitId),
    enabled: !!unitId
  });
};

export const useCallNextTicket = () => {
  return useMutation({
    mutationFn: (callData: {
      counterId: string;
      strategy?: 'fifo' | 'by_service';
      serviceId?: string;
    }) =>
      countersApi.callNext(callData.counterId, {
        strategy: callData.strategy,
        serviceId: callData.serviceId
      })
  });
};

// Auth-related hooks
export const useLogin = () => {
  return useMutation({
    mutationFn: ({ email, password }: { email: string; password: string }) =>
      authApi.login({ email, password }),
    onSuccess: (data) => {
      // Store the access token in localStorage
      if (typeof window !== 'undefined') {
        localStorage.setItem('access_token', data.accessToken);
      }
    }
  });
};

export const useAuth = () => {
  const token =
    typeof window !== 'undefined' ? localStorage.getItem('access_token') : null;

  return {
    isAuthenticated: !!token,
    token,
    logout: () => {
      if (typeof window !== 'undefined') {
        localStorage.removeItem('access_token');
        localStorage.removeItem('refresh_token');
      }
    },
    login: (token: string) => {
      if (typeof window !== 'undefined') {
        localStorage.setItem('access_token', token);
      }
    }
  };
};

// Helper function to remove empty values (undefined, null, or empty strings)
const filterEmptyValues = <T extends Record<string, unknown>>(
  obj: T
): Partial<T> => {
  const filtered: Partial<T> = {};

  Object.keys(obj).forEach((key) => {
    const k = key as keyof T;
    const value = obj[k];
    // Only include values that are not null, undefined, or empty strings
    if (value !== null && value !== undefined && value !== '') {
      filtered[k] = value;
    }
  });

  return filtered;
};

// Service-related hooks
export const useCreateService = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (serviceData: Omit<Service, 'id'>) => {
      const filteredData = filterEmptyValues(serviceData);
      return servicesApi.create(filteredData as Omit<Service, 'id'>);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['services'] });
    }
  });
};

export const useUpdateService = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      id,
      ...serviceData
    }: { id: string } & Partial<Omit<Service, 'id'>>) => {
      const has = (k: keyof typeof serviceData) =>
        Object.prototype.hasOwnProperty.call(serviceData, k);
      const clearingGrid =
        has('gridRow') &&
        has('gridCol') &&
        serviceData.gridRow === null &&
        serviceData.gridCol === null;

      if (clearingGrid) {
        return servicesApi.update(id, {
          gridRow: null,
          gridCol: null,
          gridRowSpan: serviceData.gridRowSpan ?? 1,
          gridColSpan: serviceData.gridColSpan ?? 1
        });
      }

      const filteredData = filterEmptyValues(serviceData);
      return servicesApi.update(id, filteredData);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['services'] });
    }
  });
};

export const useDeleteService = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id }: { id: string }) => servicesApi.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['services'] });
    }
  });
};

export const useLogout = () => {
  const queryClient = useQueryClient();
  const router = useRouter();

  return useMutation({
    mutationFn: async () => {
      // Just clear tokens, no API call needed
      if (typeof window !== 'undefined') {
        localStorage.removeItem('access_token');
        localStorage.removeItem('refresh_token');
      }
    },
    onSuccess: () => {
      // Invalidate all queries to clear cached data
      queryClient.invalidateQueries();
      // Optionally redirect to login or home page
      // Dispatch a global logout so other parts of the app can respond
      if (typeof window !== 'undefined') {
        try {
          window.dispatchEvent(new CustomEvent('auth:logout'));
        } catch (e) {
          console.warn(
            'Failed to dispatch auth:logout event from useLogout',
            e
          );
        }
      }
      // Redirect to the home page (or login) as a fallback
      router.push('/');
    }
  });
};
