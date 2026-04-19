import {
  useQuery,
  useMutation,
  useQueryClient,
  type Query
} from '@tanstack/react-query';
import { useRouter } from '@/src/i18n/navigation';
import {
  getGetTicketsIdQueryKey,
  getGetUnitsUnitIdCountersQueryKey,
  getGetUnitsUnitIdTicketsQueryKey
} from '../lib/api/generated/tickets-counters';
import {
  getGetUnitByIDQueryKey,
  getGetUnitsQueryKey,
  getGetUnitsUnitIdVisitorTagDefinitionsQueryKey
} from '../lib/api/generated/units';
import {
  usersApi,
  unitsApi,
  ticketsApi,
  bookingsApi,
  countersApi,
  servicesApi,
  Unit,
  Service,
  type CreateTicketInUnitMutationVariables
} from '../lib/api';
import { fetchCurrentUser, loginWithPassword } from '../lib/auth-orval';
import { authPatchMe } from '@/lib/api/generated/auth';
import { useAuthContext } from '@/contexts/AuthContext';
import { invalidateTicketListQueries } from '../lib/ticket-query-invalidation';

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

export const usePatchUserTenantRoles = () => {
  const queryClient = useQueryClient();
  const { user: sessionUser } = useAuthContext();
  return useMutation({
    mutationFn: ({
      userId,
      tenantRoleIds
    }: {
      userId: string;
      tenantRoleIds: string[];
    }) => usersApi.patchTenantRoles(userId, tenantRoleIds),
    onSuccess: (_data, variables) => {
      void queryClient.invalidateQueries({ queryKey: ['users'] });
      const uid = variables.userId?.trim();
      if (uid) {
        void queryClient.invalidateQueries({ queryKey: ['users', uid] });
        void queryClient.invalidateQueries({
          queryKey: ['users', uid, 'units']
        });
      }
      if (uid && sessionUser?.id === uid) {
        void queryClient.invalidateQueries({
          predicate: (q: Query) => q.queryKey[0] === 'me'
        });
      }
    }
  });
};

// Unit-related hooks
export const useUnits = () => {
  return useQuery({
    queryKey: getGetUnitsQueryKey(),
    queryFn: () => unitsApi.getAll()
  });
};

export const useUnit = (
  id: string,
  options: {
    refetchInterval?:
      | number
      | ((
          query: Query<Awaited<ReturnType<typeof unitsApi.getById>>, Error>
        ) => number | false | undefined);
    refetchOnMount?: boolean | 'always';
    enabled?: boolean;
  } = {}
) => {
  const enabled =
    options.enabled !== undefined ? options.enabled && !!id : !!id;
  return useQuery({
    queryKey: getGetUnitByIDQueryKey(id),
    queryFn: () => unitsApi.getById(id),
    enabled,
    refetchInterval: options.refetchInterval,
    refetchOnMount: options.refetchOnMount
  });
};

export const useCreateUnit = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (unitData: {
      name: string;
      code: string;
      companyId: string;
      timezone?: string;
      parentId?: string | null;
      kind?: 'subdivision' | 'service_zone';
      sortOrder?: number;
    }) => unitsApi.create(unitData),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: getGetUnitsQueryKey() });
    }
  });
};

export const useUpdateUnit = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, ...data }: { id: string } & Partial<Unit>) =>
      unitsApi.update(id, data),
    onSuccess: (data, variables) => {
      queryClient.invalidateQueries({ queryKey: getGetUnitsQueryKey() });
      queryClient.invalidateQueries({
        queryKey: getGetUnitByIDQueryKey(variables.id)
      });
    }
  });
};

export const usePatchKioskConfig = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      id,
      config
    }: {
      id: string;
      config: Record<string, unknown>;
    }) => unitsApi.patchKioskConfig(id, config),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: getGetUnitsQueryKey() });
      queryClient.invalidateQueries({
        queryKey: getGetUnitByIDQueryKey(variables.id)
      });
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

export const useUnitServicesTree = (
  unitId: string,
  options?: { enabled?: boolean }
) => {
  const enabled =
    options?.enabled !== undefined ? options.enabled : Boolean(unitId);
  return useQuery({
    queryKey: ['units', unitId, 'services-tree'],
    queryFn: () => unitsApi.getServicesTree(unitId),
    enabled: enabled && !!unitId
  });
};

// User-unit relationship hooks
/** PATCH /users/{id}: only set keys you want to change. To clear the profile photo, send `photoUrl: ''` (JSON `null` is ignored like an omitted field). */
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
        /** Omit to leave unchanged; use `''` to clear (not `null`). */
        photoUrl?: string;
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
    queryFn: () => fetchCurrentUser(),
    enabled: isAuthenticated && !!token
  });
}

/** PATCH /auth/me — self-service profile photo only (`''` clears). */
export function usePatchAuthMe() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (photoUrl: string) => {
      const res = await authPatchMe({ photoUrl });
      if (res.status !== 200) {
        const msg = typeof res.data === 'string' ? res.data : 'patch_me_failed';
        throw new Error(msg);
      }
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        predicate: (q: Query) => q.queryKey[0] === 'me'
      });
    }
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
  options: {
    enabled?: boolean;
    refetchInterval?: number | false;
  } = {}
) => {
  return useQuery({
    queryKey: unitId ? getGetUnitsUnitIdTicketsQueryKey(unitId) : ['tickets'],
    queryFn: () =>
      unitId ? ticketsApi.getByUnitId(unitId) : ticketsApi.getAll(),
    enabled: options.enabled ?? (!!unitId || options.enabled === undefined),
    refetchInterval: options.refetchInterval
  });
};

export const useTicket = (id: string) => {
  return useQuery({
    queryKey: getGetTicketsIdQueryKey(id),
    queryFn: () => ticketsApi.getById(id)
  });
};

export const useCreateTicket = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (ticketData: { unitId: string; serviceId: string }) =>
      ticketsApi.create(ticketData),
    onSuccess: () => {
      invalidateTicketListQueries(queryClient);
      queryClient.invalidateQueries({ queryKey: getGetUnitsQueryKey() });
    }
  });
};

export const useCompleteTicket = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => ticketsApi.complete(id),
    onSuccess: () => {
      invalidateTicketListQueries(queryClient);
    }
  });
};

export const useNoShowTicket = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => ticketsApi.noShow(id),
    onSuccess: () => {
      invalidateTicketListQueries(queryClient);
    }
  });
};

export const useUpdateOperatorComment = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      id,
      operatorComment
    }: {
      id: string;
      operatorComment: string | null;
    }) => ticketsApi.updateOperatorComment(id, operatorComment),
    onSuccess: () => {
      invalidateTicketListQueries(queryClient);
      queryClient.invalidateQueries({ queryKey: ['clientVisits'] });
    }
  });
};

export type UpdateTicketVisitorVars =
  | {
      ticketId: string;
      clientId: string;
      firstName?: string;
      lastName?: string;
    }
  | {
      ticketId: string;
      firstName: string;
      lastName: string;
      phone: string;
    };

export const useUpdateTicketVisitor = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (vars: UpdateTicketVisitorVars) => {
      const { ticketId, ...body } = vars;
      if ('clientId' in body) {
        const payload: {
          clientId: string;
          firstName?: string;
          lastName?: string;
        } = { clientId: body.clientId };
        if (body.firstName !== undefined) {
          payload.firstName = body.firstName;
        }
        if (body.lastName !== undefined) {
          payload.lastName = body.lastName;
        }
        return ticketsApi.updateTicketVisitor(ticketId, payload);
      }
      return ticketsApi.updateTicketVisitor(ticketId, {
        firstName: body.firstName,
        lastName: body.lastName,
        phone: body.phone
      });
    },
    onSuccess: () => {
      invalidateTicketListQueries(queryClient);
      queryClient.invalidateQueries({ queryKey: ['clientVisits'] });
    }
  });
};

export const useClientVisits = (
  unitId: string,
  clientId: string | undefined,
  options: { enabled?: boolean } = {}
) => {
  return useQuery({
    queryKey: ['clientVisits', unitId, clientId],
    queryFn: () => unitsApi.getClientVisits(unitId, clientId!),
    enabled: !!unitId && !!clientId && (options.enabled ?? true)
  });
};

export const useVisitorTagDefinitions = (
  unitId: string,
  options: { enabled?: boolean } = {}
) => {
  return useQuery({
    queryKey: getGetUnitsUnitIdVisitorTagDefinitionsQueryKey(unitId),
    queryFn: () => unitsApi.listVisitorTagDefinitions(unitId),
    enabled: !!unitId && (options.enabled ?? true)
  });
};

export const useCreateVisitorTagDefinition = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (vars: {
      unitId: string;
      label: string;
      color: string;
      sortOrder?: number;
    }) => {
      const { unitId, ...body } = vars;
      return unitsApi.createVisitorTagDefinition(unitId, body);
    },
    onSuccess: (_data, vars) => {
      queryClient.invalidateQueries({
        queryKey: getGetUnitsUnitIdVisitorTagDefinitionsQueryKey(vars.unitId)
      });
    }
  });
};

export const usePatchVisitorTagDefinition = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (vars: {
      unitId: string;
      definitionId: string;
      label?: string;
      color?: string;
      sortOrder?: number;
    }) => {
      const { unitId, definitionId, ...body } = vars;
      return unitsApi.patchVisitorTagDefinition(unitId, definitionId, body);
    },
    onSuccess: (_data, vars) => {
      queryClient.invalidateQueries({
        queryKey: getGetUnitsUnitIdVisitorTagDefinitionsQueryKey(vars.unitId)
      });
    }
  });
};

export const useDeleteVisitorTagDefinition = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (vars: { unitId: string; definitionId: string }) =>
      unitsApi.deleteVisitorTagDefinition(vars.unitId, vars.definitionId),
    onSuccess: (_data, vars) => {
      queryClient.invalidateQueries({
        queryKey: getGetUnitsUnitIdVisitorTagDefinitionsQueryKey(vars.unitId)
      });
    }
  });
};

export const useSetVisitorTags = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (vars: {
      ticketId: string;
      tagDefinitionIds: string[];
      operatorComment: string;
    }) =>
      ticketsApi.setVisitorTags(vars.ticketId, {
        tagDefinitionIds: vars.tagDefinitionIds,
        operatorComment: vars.operatorComment
      }),
    onSuccess: () => {
      invalidateTicketListQueries(queryClient);
      queryClient.invalidateQueries({ queryKey: ['clientVisits'] });
    }
  });
};

export const useRecallTicket = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => ticketsApi.recall(id),
    onSuccess: () => {
      invalidateTicketListQueries(queryClient);
    }
  });
};

export const usePickTicket = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, counterId }: { id: string; counterId: string }) =>
      ticketsApi.pick(id, counterId),
    onSuccess: () => {
      invalidateTicketListQueries(queryClient);
    }
  });
};

export const useConfirmArrivalTicket = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => ticketsApi.confirmArrival(id),
    onSuccess: () => {
      invalidateTicketListQueries(queryClient);
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
      toServiceZoneId?: string;
      toServiceId?: string;
      operatorComment?: string | null;
    }) =>
      ticketsApi.transfer(transferData.id, {
        toCounterId: transferData.toCounterId,
        toUserId: transferData.toUserId,
        toServiceZoneId: transferData.toServiceZoneId,
        toServiceId: transferData.toServiceId,
        operatorComment: transferData.operatorComment
      }),
    onSuccess: () => {
      invalidateTicketListQueries(queryClient);
    }
  });
};

export const useReturnToQueueTicket = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => ticketsApi.returnToQueue(id),
    onSuccess: () => {
      invalidateTicketListQueries(queryClient);
    }
  });
};

export const useCreateTicketInUnit = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (createData: CreateTicketInUnitMutationVariables) => {
      const { unitId, ...ticketBody } = createData;
      return unitsApi.createTicket(unitId, ticketBody);
    },
    onSuccess: () => {
      invalidateTicketListQueries(queryClient);
      queryClient.invalidateQueries({ queryKey: getGetUnitsQueryKey() });
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
    queryKey: getGetUnitsUnitIdCountersQueryKey(unitId),
    queryFn: () => countersApi.getByUnitId(unitId),
    enabled: !!unitId
  });
};

export const useCallNextTicket = () => {
  return useMutation({
    mutationFn: (callData: { counterId: string; serviceIds?: string[] }) =>
      countersApi.callNext(callData.counterId, {
        serviceIds: callData.serviceIds
      })
  });
};

// Auth-related hooks
export const useLogin = () => {
  return useMutation({
    mutationFn: ({
      email,
      password,
      tenantSlug
    }: {
      email: string;
      password: string;
      tenantSlug?: string;
    }) => loginWithPassword({ email, password, tenantSlug }),
    onSuccess: () => {
      // Session cookies are set by POST /auth/login; optional legacy tokens may still be in the JSON body.
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
      const filteredData = filterEmptyValues(
        serviceData as Record<string, unknown>
      ) as Omit<Service, 'id'>;
      if (
        Object.prototype.hasOwnProperty.call(
          serviceData,
          'restrictedServiceZoneId'
        )
      ) {
        const z = serviceData.restrictedServiceZoneId;
        filteredData.restrictedServiceZoneId =
          z === undefined ||
          z === null ||
          (typeof z === 'string' && z.trim() === '')
            ? null
            : z;
      }
      return servicesApi.create(filteredData);
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
          ...serviceData,
          gridRow: null,
          gridCol: null
        });
      }

      const filteredData = filterEmptyValues(
        serviceData as Record<string, unknown>
      ) as Partial<Omit<Service, 'id'>>;
      if (
        Object.prototype.hasOwnProperty.call(
          serviceData,
          'restrictedServiceZoneId'
        )
      ) {
        const z = serviceData.restrictedServiceZoneId;
        filteredData.restrictedServiceZoneId =
          z === undefined ||
          z === null ||
          (typeof z === 'string' && z.trim() === '')
            ? null
            : z;
      }
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
