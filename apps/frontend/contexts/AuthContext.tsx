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

/** Kiosk uses desktop-terminal JWT; `sub` is terminal id, so GET /auth/me returns 404. */
function isLocaleKioskPath(pathname: string | null): boolean {
  if (!pathname) return false;
  return routing.locales.some(
    (loc) =>
      pathname === `/${loc}/kiosk` || pathname.startsWith(`/${loc}/kiosk/`)
  );
}

interface AuthContextType {
  user: User | null;
  token: string | null;
  isAuthenticated: boolean;
  /** Persists token and loads `/auth/me`. Resolves when the user payload is applied or rejects on failure. */
  login: (token: string) => Promise<void>;
  logout: () => void;
  isLoading: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [token, setToken] = useState<string | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isClient, setIsClient] = useState(false);
  const pathname = usePathname();
  /** When true, `login()` owns the `/auth/me` fetch — skip duplicate work in the token effect. */
  const loginFetchOwnsSessionRef = useRef(false);

  // Only run API calls on client side
  useEffect(() => {
    setIsClient(true);
    // Check if we're on the client before accessing localStorage
    if (typeof window !== 'undefined') {
      // Initialize token from localStorage on mount
      const storedToken = localStorage.getItem('access_token');
      if (storedToken) {
        setToken(storedToken);
      }
    }
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
      window.location.href = loginPath;
    }
  }, []);

  const login = useCallback((newToken: string): Promise<void> => {
    if (typeof window === 'undefined') {
      return Promise.resolve();
    }
    loginFetchOwnsSessionRef.current = true;
    setIsLoading(true);
    setToken(newToken);
    localStorage.setItem('access_token', newToken);
    return fetchCurrentUser()
      .then((userData) => {
        setUser(userData);
        setIsLoading(false);
      })
      .catch((error) => {
        console.error('Failed to fetch user after login:', error);
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
  }, []);

  // Fetch user after mount / token change. Pathname is only needed for kiosk routes.
  // Do not set isLoading on every pathname change — that remounts ProtectedRoute and flashes the sidebar.
  useEffect(() => {
    if (!isClient) return;

    if (!token) {
      setIsLoading(false);
      return;
    }

    if (isLocaleKioskPath(pathname)) {
      setUser(null);
      setIsLoading(false);
      return;
    }

    if (user !== null) {
      return;
    }

    if (loginFetchOwnsSessionRef.current) {
      return;
    }

    setIsLoading(true);

    let cancelled = false;
    const fetchUser = async () => {
      try {
        const userData = await fetchCurrentUser();
        if (!cancelled) setUser(userData);
      } catch (error) {
        console.error('Failed to fetch user:', error);
        if (!cancelled) logout();
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    };

    void fetchUser();
    return () => {
      cancelled = true;
    };
  }, [isClient, token, pathname, logout, user]);

  // Listen for global 'auth:logout' events (dispatched by apiRequest on 401 / refresh failure)
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
    isAuthenticated: !!token && !!user,
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
