'use client';

import {
  createContext,
  useContext,
  useEffect,
  useState,
  ReactNode,
  useCallback
} from 'react';
import { usePathname } from 'next/navigation';
import { authApi, User } from '../lib/api';
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
  login: (token: string) => void;
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
      const segments = window.location.pathname.split('/').filter(Boolean);
      const maybeLocale = segments[0];
      const loginPath = routing.locales.includes(maybeLocale as 'en' | 'ru')
        ? `/${maybeLocale}/login`
        : '/login';
      window.location.href = loginPath;
    }
  }, []);

  const login = useCallback((newToken: string) => {
    if (typeof window !== 'undefined') {
      setToken(newToken);
      localStorage.setItem('access_token', newToken);
      // Fetch user data after login
      authApi
        .getMe()
        .then((userData) => {
          setUser(userData);
          // Reset loading state after successful login
          setIsLoading(false);
        })
        .catch((error) => {
          console.error('Failed to fetch user after login:', error);
          setToken(null);
          setUser(null);
          localStorage.removeItem('access_token');
          localStorage.removeItem('refresh_token');
          // Reset loading state after failed login
          setIsLoading(false);
        });
    }
  }, []);

  // Fetch user data only after mounting on client and manage loading state
  useEffect(() => {
    if (!isClient) return;

    setIsLoading(true);

    if (!token) {
      setIsLoading(false);
      return;
    }

    if (isLocaleKioskPath(pathname)) {
      setUser(null);
      setIsLoading(false);
      return;
    }

    const fetchUser = async () => {
      try {
        const userData = await authApi.getMe();
        setUser(userData);
      } catch (error) {
        console.error('Failed to fetch user:', error);
        logout();
      } finally {
        setIsLoading(false);
      }
    };

    fetchUser();
  }, [isClient, token, pathname, logout]);

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
