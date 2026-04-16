'use client';

import {
  createContext,
  useContext,
  useEffect,
  useState,
  ReactNode,
  useCallback,
  useRef
} from 'react';
import { usePathname } from 'next/navigation';
import { User } from '../lib/api';
import { fetchCurrentUser } from '../lib/auth-orval';
import { ACTIVE_COMPANY_ID_STORAGE_KEY } from '../lib/authenticated-api-fetch';
import { routing } from '@/src/i18n/routing';
import { logger } from '@/lib/logger';

/** Kiosk uses desktop-terminal JWT; `sub` is terminal id, so GET /auth/me returns 404. */
function isLocaleKioskPath(pathname: string | null): boolean {
  if (!pathname) return false;
  return routing.locales.some(
    (loc) =>
      pathname === `/${loc}/kiosk` || pathname.startsWith(`/${loc}/kiosk/`)
  );
}

/** Paths where 401 is expected for guests; do not `location.assign` the same page (reload loop). */
function isPublicAuthShellPath(path: string): boolean {
  const p = path.split('?')[0] ?? path;
  if (p === '/login' || p === '/forgot-password' || p === '/signup')
    return true;
  for (const loc of routing.locales) {
    if (
      p === `/${loc}/login` ||
      p === `/${loc}/forgot-password` ||
      p === `/${loc}/signup`
    ) {
      return true;
    }
  }
  return false;
}

interface AuthContextType {
  user: User | null;
  /** Set when a browser session is active (cookie or legacy localStorage). */
  token: string | null;
  isAuthenticated: boolean;
  login: (legacyAccessToken?: string | null) => Promise<void>;
  logout: () => void;
  isLoading: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const SESSION_MARKER = '1';

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [token, setToken] = useState<string | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isClient, setIsClient] = useState(false);
  const pathname = usePathname();
  const loginFetchOwnsSessionRef = useRef(false);

  useEffect(() => {
    setIsClient(true);
  }, []);

  const logout = useCallback(() => {
    setToken(null);
    setUser(null);
    setIsLoading(false);
    if (typeof window !== 'undefined') {
      localStorage.removeItem('access_token');
      localStorage.removeItem('refresh_token');
      localStorage.removeItem(ACTIVE_COMPANY_ID_STORAGE_KEY);
      const segments = window.location.pathname.split('/').filter(Boolean);
      const maybeLocale = segments[0];
      const loginPath = routing.locales.includes(maybeLocale as 'en' | 'ru')
        ? `/${maybeLocale}/login`
        : '/login';
      const current = window.location.pathname;
      if (current === loginPath || isPublicAuthShellPath(current)) {
        return;
      }
      window.location.href = loginPath;
    }
  }, []);

  const login = useCallback(
    (legacyAccessToken?: string | null): Promise<void> => {
      if (typeof window === 'undefined') {
        return Promise.resolve();
      }
      loginFetchOwnsSessionRef.current = true;
      setIsLoading(true);
      if (legacyAccessToken) {
        localStorage.setItem('access_token', legacyAccessToken);
      }
      setToken(SESSION_MARKER);
      return fetchCurrentUser()
        .then((userData) => {
          setUser(userData);
          setIsLoading(false);
        })
        .catch((error) => {
          logger.error('Failed to fetch user after login:', error);
          setToken(null);
          setUser(null);
          localStorage.removeItem('access_token');
          localStorage.removeItem('refresh_token');
          localStorage.removeItem(ACTIVE_COMPANY_ID_STORAGE_KEY);
          setIsLoading(false);
          throw error;
        })
        .finally(() => {
          loginFetchOwnsSessionRef.current = false;
        });
    },
    []
  );

  // Load session from HttpOnly cookies (same-origin /api) or legacy tokens.
  useEffect(() => {
    if (!isClient) return;

    if (isLocaleKioskPath(pathname)) {
      setUser(null);
      setToken(null);
      setIsLoading(false);
      return;
    }

    if (loginFetchOwnsSessionRef.current) {
      return;
    }

    if (user !== null) {
      return;
    }

    setIsLoading(true);

    let cancelled = false;
    const run = async () => {
      try {
        const userData = await fetchCurrentUser();
        if (!cancelled) {
          setUser(userData);
          setToken(SESSION_MARKER);
        }
      } catch {
        if (!cancelled) {
          setUser(null);
          setToken(null);
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    };

    void run();
    return () => {
      cancelled = true;
    };
  }, [isClient, pathname, user]);

  useEffect(() => {
    const handleGlobalLogout = () => {
      logout();
    };

    if (typeof window !== 'undefined') {
      window.addEventListener(
        'auth:logout',
        handleGlobalLogout as EventListener
      );
    }

    return () => {
      if (typeof window !== 'undefined') {
        window.removeEventListener(
          'auth:logout',
          handleGlobalLogout as EventListener
        );
      }
    };
  }, [logout]);

  const value = {
    user,
    token,
    isAuthenticated: !!user,
    login,
    logout,
    isLoading
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuthContext = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuthContext must be used within an AuthProvider');
  }
  return context;
};
